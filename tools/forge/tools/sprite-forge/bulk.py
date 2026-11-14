"""Every forge strip drawn again, split over several machines. A slice owns whole animations of a body: it draws every
layer of them, so it alone writes their cells, their index entries and their fitted lists, and the slices merge with
no conflict.

    python -I tools/sprite-forge/bulk.py plan --want want.json --slices 8 --out plan.json
    python -I tools/sprite-forge/bulk.py run --plan plan.json --slice 3 [--only 0] [--samples 64]
    python -I tools/sprite-forge/bulk.py merge --plan plan.json --into . --slice-dirs a b c ...

`want.json` names what is drawn: by body, by set (`classic`, `wardrobe`, `armour`, `beast`, `hair`), each layer's
animations; `frames`, each animation's frames; and by body `new`, the animations the index has no cell for yet. `run`
draws a slice's sets in order, the classic set first, since its run sets an animation's cell and every later set keeps
it (`layers.py`); a new animation's classic run draws every classic layer, so its cell holds them all. `merge` lays each slice's animations from its own copy of the repo over this one: their
strips, index entries (src/systems/studioArt/forgeLooks.json) and fitted lists (fitted/<body>.json)."""
import argparse
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
LOOKS = os.path.join('src', 'systems', 'studioArt', 'forgeLooks.json')
LAYERS = os.path.join('public', 'art', 'studio', 'forge', 'layers')
FITTED = os.path.join('tools', 'sprite-forge', 'fitted')
SETS = ('classic', 'wardrobe', 'armour', 'beast', 'hair')   # the order a slice draws them in
SECONDS = {'frame': 1.0, 'run': 90.0}   # a frame of a layer in one view, and a run's setting up, as measured
MOST = 4000   # the most frames (a layer's, in a view) one run draws: about an hour, well inside a machine's command


def frames_of(index, body, anim, want=None):
    own = index['bodies'][body]['anims'].get(anim)
    return own['frames'] if own else want['frames'][anim]


def runs_of(want, body, anim):
    """The runs that draw one animation of a body: (set, layers), the classic set first; a new animation's classic run
    every classic layer (`None`)."""
    out = []
    for s in SETS:
        names = sorted(n for n, anims in want.get(body, {}).get(s, {}).items() if anim in anims)
        if s == 'classic' and anim in want.get('new', {}).get(body, []):
            out.append((s, None))
        elif names:
            out.append((s, names))
    return out


def plan(want, index, slices):
    """Each (body, animation) a unit, weighed by its frames and layers; units dealt to the lightest slice, heaviest
    first. Within a slice, a body's animations whose runs name the same layers are drawn by one run."""
    units = []
    bodies = [b for b in want if b in index['bodies']]
    for body in bodies:
        anims = sorted({a for s in want[body].values() for anims in s.values() for a in anims} | set(want.get('new', {}).get(body, [])))
        for anim in anims:
            runs = runs_of(want, body, anim)
            n = frames_of(index, body, anim, want) * 5
            every = len(want[body].get('classic', {}))   # a new animation's classic run: at most every classic layer
            cost = sum(SECONDS['run'] + n * (every if names is None else len(names)) * SECONDS['frame'] for _, names in runs)
            units.append({'body': body, 'anim': anim, 'cost': cost, 'runs': runs})
    units.sort(key=lambda u: -u['cost'])
    out = [{'units': [], 'cost': 0.0} for _ in range(slices)]
    for u in units:
        light = min(out, key=lambda s: s['cost'])
        light['units'].append(u)
        light['cost'] += u['cost']
    for s in out:
        groups = {}
        for u in s['units']:
            for st, names in u['runs']:
                groups.setdefault((u['body'], st, None if names is None else tuple(names)), []).append(u['anim'])
        order = sorted(groups.items(), key=lambda kv: (kv[0][0], SETS.index(kv[0][1]), kv[0][2] is not None))
        s['runs'] = []
        for (b, st, names), anims in order:
            if names is None:   # a new animation's cell set by every classic layer at once: never split
                s['runs'].append({'body': b, 'set': st, 'layers': None, 'anims': anims})
                continue
            per = sum(frames_of(index, b, a, want) * 5 for a in anims)   # one layer's frames over the run's animations
            step = max(1, MOST // per)
            for i in range(0, len(names), step):
                s['runs'].append({'body': b, 'set': st, 'layers': list(names[i:i + step]), 'anims': anims})
        s['owns'] = sorted([u['body'], u['anim']] for u in s['units'])
        s['hours'] = round(s['cost'] / 3600, 1)
        del s['units'], s['cost']
    return out


def armour_materials(names):
    """The armour sets a run's layers belong to (`<piece>_<set>`), as layers.py --materials names them."""
    sys.path.insert(0, HERE)
    import bpy  # noqa: E402,F401  (armour.py's mathutils comes with it)
    import armour  # noqa: E402
    sets = {n.rsplit('_', 1)[-1] for n in names}
    return [m for m in armour.SETS if m.lower() in sets]


def run(the_plan, k, samples, out, only=None):
    """A slice's runs in order, or its run `only` alone: a machine that may not hold one command for hours draws
    its slice a run at a time and keeps each."""
    me = the_plan['slices'][k]
    for i, r in enumerate(me['runs']):
        if only is not None and i != only:
            continue
        cmd = [sys.executable, '-I', os.path.join(HERE, 'layers.py'), '--body', r['body'], '--out', out,
               '--set', r['set'], '--anims', ','.join(r['anims']), '--samples', str(samples)]
        if r['layers'] is not None:
            cmd += ['--layers', ','.join(r['layers'])]
        if r['set'] == 'armour':
            cmd += ['--materials', ','.join(armour_materials(r['layers']))]
        print(f"{r['body']} {r['set']} {','.join(r['anims'])}: {len(r['layers'] or []) or 'every'} layers", flush=True)
        subprocess.run(cmd, check=True, cwd=ROOT)


def merge(the_plan, into, dirs):
    """Each slice's animations, from its copy of the repo, laid over `into`."""
    looks_path = os.path.join(into, LOOKS)
    index = json.load(open(looks_path))
    fitted = {b: json.load(open(os.path.join(into, FITTED, f'{b}.json'))) for b in index['bodies']}
    for k, d in enumerate(dirs):
        theirs = json.load(open(os.path.join(d, LOOKS)))
        their_fit = {b: json.load(open(os.path.join(d, FITTED, f'{b}.json'))) for b in theirs['bodies']}
        for body, anim in the_plan['slices'][k]['owns']:
            mine, got = index['bodies'][body], theirs['bodies'][body]
            mine['anims'][anim] = got['anims'][anim]
            for name in set(mine['layers']) | set(got['layers']):
                has = anim in got['layers'].get(name, [])
                now = mine['layers'].setdefault(name, [])
                if has and anim not in now:
                    now.append(anim)
                if not has and anim in now:
                    now.remove(anim)
                cell = got.get('cells', {}).get(name, {}).get(anim)
                cells = mine.setdefault('cells', {})
                if cell:
                    cells.setdefault(name, {})[anim] = cell
                elif anim in cells.get(name, {}):
                    del cells[name][anim]
                    if not cells[name]:
                        del cells[name]
                for z in ('', '_z'):
                    src = os.path.join(d, LAYERS, body, f'{name}_{anim}{z}.png')
                    if has and os.path.exists(src):
                        shutil.copyfile(src, os.path.join(into, LAYERS, body, f'{name}_{anim}{z}.png'))
            if anim in their_fit[body]:
                fitted[body][anim] = their_fit[body][anim]
        for key in ('order', 'cover', 'under'):
            index.setdefault(key, {}).update(theirs.get(key, {}))
        for key in ('dye', 'metal'):
            index[key] = sorted(set(index.get(key, [])) | set(theirs.get(key, [])))
        index['looks'] = theirs.get('looks', index.get('looks'))
    order = list(index['bodies'][next(iter(index['bodies']))]['anims'])
    for d in index['bodies'].values():
        for n in d['layers']:
            d['layers'][n] = [a for a in order if a in d['layers'][n]] + [a for a in d['layers'][n] if a not in order]
        d['layers'] = {n: a for n, a in d['layers'].items() if a}
    with open(looks_path, 'w') as f:
        json.dump(index, f, indent=1, sort_keys=True)
        f.write('\n')
    for b, fit in fitted.items():
        with open(os.path.join(into, FITTED, f'{b}.json'), 'w') as f:
            json.dump(fit, f, indent=1, sort_keys=True)
            f.write('\n')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('plan')
    p.add_argument('--want', required=True)
    p.add_argument('--slices', type=int, default=8)
    p.add_argument('--out', required=True)
    r = sub.add_parser('run')
    r.add_argument('--plan', required=True)
    r.add_argument('--slice', type=int, required=True)
    r.add_argument('--samples', type=int, default=64)
    r.add_argument('--only', type=int, default=None, help="this run of the slice's alone, counted from 0")
    r.add_argument('--out', default=os.path.join(ROOT, LAYERS))
    m = sub.add_parser('merge')
    m.add_argument('--plan', required=True)
    m.add_argument('--into', default=ROOT)
    m.add_argument('--slice-dirs', nargs='+', required=True)
    args = ap.parse_args()
    if args.cmd == 'plan':
        want = json.load(open(args.want))
        index = json.load(open(os.path.join(ROOT, LOOKS)))
        slices = plan(want, index, args.slices)
        with open(args.out, 'w') as f:
            json.dump({'slices': slices}, f, indent=1)
            f.write('\n')
        for k, s in enumerate(slices):
            print(f'slice {k}: {len(s["owns"])} animations, {len(s["runs"])} runs, about {s["hours"]} h')
    elif args.cmd == 'run':
        run(json.load(open(args.plan)), args.slice, args.samples, args.out, args.only)
    else:
        merge(json.load(open(args.plan)), args.into, args.slice_dirs)


if __name__ == '__main__':
    main()
