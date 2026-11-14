"""The forge's render spread over processes and machines: what is stale planned once, split into shards of about
equal cost, each shard run by as many processes as its machine has room for, and the shards' strips merged back.

    python3 fanout.py plan  --out plan.json [--bodies male,female] [--anims a,b]   every set's stale strips (layers.py
                                                                                   --plan), each with its cost
    python3 fanout.py shard --plan plan.json --shards N --out <dir>                 N shard files of about equal cost
    python3 fanout.py run   --shard <dir>/shard-K.json [--jobs J] [--out <strips>]  one shard, J processes at once
                            [--until M] [--group S]                                none started after M minutes;
                                                                                   S seconds' work a process
    python3 fanout.py merge --branches b1,b2,...                                    each shard branch's strips, keys
                                                                                   and index laid over this checkout
    python3 fanout.py rekey [--bodies ...] [--sets ...] [--materials ...]          every strip keyed as this code draws
                                                                                   it, none drawn (a key's make moved)

A strip whose key is unchanged is never drawn (rendercache.py), so a plan holds only what changed. Each body's bare
body is drawn first, alone (`FIRST`): it sets each animation's cell, which every other layer is laid in, so the
processes and machines after it never set one apart. A cloth frame costs about nine solid ones (`COST`).

Across machines: run `plan` and `shard` here, draw the shard of `FIRST` here and commit it, then give each shard to a
session on its own branch from that commit (`run`, then commit and push), and `merge` their branches back here.

A run is drawn in groups of its animations, each by a process of its own (`GROUP`): layers.py lists a strip in the
index only as its process ends, and a strip not listed is drawn again. So a run stopped part way keeps each group that
ended, and `<shard>.done` names them, so a later chunk starts none of them again. A machine that stops a command after
a time runs `run --until M` in chunks: it exits 3 while groups are left."""
import argparse
import ast
import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
STUDIO = os.path.join(ROOT, 'public', 'art', 'studio', 'forge', 'layers')
LOOKS = os.path.join(ROOT, 'src', 'systems', 'studioArt', 'forgeLooks.json')
KEYS = os.path.join(HERE, 'keys')
FITTED = os.path.join(HERE, 'fitted')   # layers.py `write_fitted`: each layer under the bare body it was drawn to fit
SETS = ('classic', 'wardrobe', 'armour', 'beast', 'hair')
COST = {'solid': 0.45, 'cloth': 4.0}   # seconds a frame on one machine, measured
GROUP = 1200   # seconds of one machine's work a process draws at most, against the minute or so each takes to start
LEFT = 3       # run's exit when --until left groups undrawn
FIRST = 'body'


def layers_py(body, kind, anims, out, layers=None, materials=None, extra=()):
    cmd = [sys.executable, '-I', os.path.join(HERE, 'layers.py'), '--body', body, '--set', kind, '--out', out]
    if anims:
        cmd += ['--anims', ','.join(anims)]
    if layers:
        cmd += ['--layers', ','.join(layers)]
    if materials:
        cmd += ['--materials', materials]
    return cmd + list(extra)


def armour_sets():
    """armour.py's sets, metals and guilds, read without Blender."""
    tree = ast.parse(open(os.path.join(HERE, 'armour.py')).read())
    named = {t.id: n.value for n in tree.body if isinstance(n, ast.Assign) for t in n.targets if isinstance(t, ast.Name)}
    return [*ast.literal_eval(named['MATERIALS']), *ast.literal_eval(named['GUILDS'])]


CHILDREN = ('boy', 'girl')
NOT_CHILDREN = ('armour', 'hair')   # sets a child draws nothing of: a run of one builds its scene for no strip


def sets_of(body, sets):
    """The sets of `sets` (a comma list) a run for `body` weighs: a child's without the armour and the hair."""
    return [k for k in sets.split(',') if body not in CHILDREN or k not in NOT_CHILDREN]


def plan(args):
    strips = []
    for body in args.bodies.split(','):
        for kind in sets_of(body, args.sets):
            # armour one set a run, as `run` draws it: a set's key is its own run's, whatever else that run builds
            for m in (args.materials.split(',') if args.materials else armour_sets()) if kind == 'armour' else [None]:
                strips += _plan_one(args, body, kind, m)
    json.dump({'strips': strips}, open(args.out, 'w'), indent=1)
    print(f'{len(strips)} strips stale, {sum(s["cost"] for s in strips) / 3600:.1f} h on one machine -> {args.out}')


def rekey(args):
    """Every strip each run of `plan` would weigh, keyed as this code would draw it, none drawn (layers.py `--rekey`):
    after a change to how keys are made that moves no picture. One armour set a run, as `plan` and `run` take it."""
    for body in args.bodies.split(','):
        for kind in sets_of(body, args.sets):
            for m in (args.materials.split(',') if args.materials else armour_sets()) if kind == 'armour' else [None]:
                subprocess.run(layers_py(body, kind, plan_anims(body, args.anims), args.studio, None, m,
                                         extra=['--rekey']), check=True)


def plan_anims(body, given=''):
    """The animations a plan names: those given, else every one the index draws on a grown body (a run left to
    itself leaves out the one-handed fighting and the guns' moves, which a strip is drawn in all the same); a child's
    own poses, which its run picks."""
    if given:
        return given.split(',')
    if body in CHILDREN:
        return None
    return sorted(json.load(open(LOOKS))['bodies'].get(body, {}).get('anims', {})) or None


def _plan_one(args, body, kind, material):
    """One layers.py run's stale strips, each with its body, set, cost and armour set."""
    tmp = os.path.join(args.tmp, f'plan-{body}-{kind}{f"-{material}" if material else ""}.json')
    subprocess.run(layers_py(body, kind, plan_anims(body, args.anims), args.studio,
                             args.layers.split(',') if args.layers else None, material, extra=['--plan', tmp]), check=True)
    strips = json.load(open(tmp))['strips']
    for s in strips:
        s.update(body=body, set=kind, cost=s['frames'] * COST['cloth' if s['cloth'] else 'solid'])
        if kind == 'armour':   # an armour layer is drawn from its own set: `<piece>_<set>`
            s['material'] = s['layer'].rsplit('_', 1)[-1].capitalize()
    return strips


def _commands(strips):
    """Strips as layers.py runs: one a body, set and armour set, its layers and animations together."""
    runs = {}
    for s in strips:
        key = (s['body'], s['set'], s.get('material'))
        r = runs.setdefault(key, {'body': s['body'], 'set': s['set'], 'material': s.get('material'), 'layers': set(),
                                  'anims': set(), 'cost': 0.0})
        r['layers'].add(s['layer'])
        r['anims'].add(s['anim'])
        r['cost'] += s['cost']
    return [{**r, 'layers': sorted(r['layers']), 'anims': sorted(r['anims'])} for r in runs.values()]


def shard(args):
    strips = json.load(open(args.plan))['strips']
    first = [s for s in strips if s['layer'] == FIRST]
    rest = [s for s in strips if s['layer'] != FIRST]
    by_layer = {}
    for s in rest:   # a layer's strips together, so one process builds it once
        by_layer.setdefault((s['body'], s['set'], s['layer']), []).append(s)
    shards = [[] for _ in range(args.shards)]
    loads = [0.0] * args.shards
    for group in sorted(by_layer.values(), key=lambda g: -sum(s['cost'] for s in g)):
        k = loads.index(min(loads))
        shards[k] += group
        loads[k] += sum(s['cost'] for s in group)
    os.makedirs(args.out, exist_ok=True)
    json.dump({'first': True, 'runs': _commands(first)}, open(os.path.join(args.out, 'shard-first.json'), 'w'),
              indent=1)
    for k, sh in enumerate(shards):
        json.dump({'runs': _commands(sh)}, open(os.path.join(args.out, f'shard-{k}.json'), 'w'), indent=1)
        print(f'shard {k}: {len(sh)} strips, {loads[k] / 3600:.1f} h on one machine')


def groups(r, budget=GROUP):
    """Run `r` cut into runs of a few of its animations each, of about `budget` seconds' work."""
    anims = r['anims']
    size = -(-len(anims) // max(1, min(len(anims), round(r['cost'] / budget))))
    return [{**r, 'anims': anims[i:i + size], 'cost': r['cost'] * len(anims[i:i + size]) / len(anims)}
            for i in range(0, len(anims), size)]


def run(args):
    sh = json.load(open(args.shard))
    jobs = 1 if sh.get('first') else max(1, args.jobs)
    threads = max(1, (os.cpu_count() or 1) // jobs)
    env = {**os.environ, 'FORGE_THREADS': str(threads)}
    until = time.monotonic() + args.until * 60 if args.until else None
    # each group that ended well, beside the shard: a later chunk starts none of them again, where each would spend
    # its minute building the layers to find every strip kept
    done_at = args.shard + '.done'
    done = set(open(done_at).read().split()) if os.path.exists(done_at) else set()
    lock = threading.Lock()
    # a group is done for the code that drew it: the code moved (keys/version.json recorded again), it is run again
    code = open(os.path.join(KEYS, 'version.json')).read() if os.path.exists(os.path.join(KEYS, 'version.json')) else ''
    if not sh.get('first'):   # the bare body drawn first in every animation a layer is fitted to (`shard-first`)
        index = json.load(open(LOOKS)) if os.path.exists(LOOKS) else {}
        undrawn = sorted({(r['body'], a) for r in sh['runs'] for a in r['anims']
                          if a not in index.get('bodies', {}).get(r['body'], {}).get('layers', {}).get(FIRST, [])})
        if undrawn:
            sys.exit(f'the bare body is not drawn in {undrawn[:6]}: run and commit shard-first.json before this shard')

    def one(r):
        gid = hashlib.sha1(json.dumps([r['body'], r['set'], r.get('material'), r['layers'], r['anims'], code]).encode())
        gid = gid.hexdigest()[:16]
        if gid in done:
            return 0
        if until is not None and time.monotonic() > until:
            return None
        cmd = layers_py(r['body'], r['set'], r['anims'], args.out, r['layers'], r.get('material'))
        print(' '.join(cmd[2:]), flush=True)
        rc = subprocess.run(cmd, env=env).returncode
        if rc == 0:
            with lock, open(done_at, 'a') as f:
                f.write(gid + '\n')
        return rc
    runs = sorted((g for r in sh['runs'] for g in groups(r, args.group)), key=lambda r: -r['cost'])
    with ThreadPoolExecutor(jobs) as pool:
        codes = list(pool.map(one, runs))
    bad = [r for r, c in zip(runs, codes) if c]
    if bad:
        sys.exit(f'{len(bad)} runs failed')
    left = [r for r, c in zip(runs, codes) if c is None]
    if left:
        print(f'{len(left)} of {len(runs)} runs left at --until: run again', flush=True)
        sys.exit(LEFT)


def _git(*a):
    return subprocess.run(['git', *a], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def _changed(theirs, was):
    """The entries of dict `theirs` that differ from the same dict where the branch began (`was`)."""
    return {k: v for k, v in theirs.items() if was.get(k) != v}


def _merge_index(base, theirs, began=None):
    """`theirs` (a shard's index) laid over `base`: each strip it drew newly, its animations' cells, its looks. Only
    what the shard changed from `began` (the index where its branch began) is laid over: a cell it carried unchanged
    from the base would put back a cell another shard has since drawn anew."""
    began = began or {}
    for body, mine in theirs.get('bodies', {}).items():
        cur = base.setdefault('bodies', {}).setdefault(body, {})
        was = began.get('bodies', {}).get(body, {})
        # a layer's animations in the order they were drawn (layers.py ANIMS): this index's, then the shard's new ones
        for name, anims in mine.get('layers', {}).items():
            had = cur.setdefault('layers', {}).get(name, [])
            cur['layers'][name] = had + [a for a in anims if a not in had]
        cur.setdefault('anims', {}).update(_changed(mine.get('anims', {}), was.get('anims', {})))
        for name, own in mine.get('cells', {}).items():
            cur.setdefault('cells', {}).setdefault(name, {}).update(_changed(own, was.get('cells', {}).get(name, {})))
        # a cell the shard let go (its strip now fits the animation's own): let go here too, unless drawn anew since
        for name, had in was.get('cells', {}).items():
            for anim in [a for a in had if a not in mine.get('cells', {}).get(name, {})]:
                if cur.get('cells', {}).get(name, {}).get(anim) == had[anim]:
                    del cur['cells'][name][anim]
            if name in cur.get('cells', {}) and not cur['cells'][name]:
                del cur['cells'][name]
    for key in ('looks', 'order', 'cover', 'under', 'grow'):
        if key in theirs:
            base.setdefault(key, {}).update(_changed(theirs[key], began.get(key, {})))
    for key in ('dye', 'metal'):
        base[key] = sorted(set(base.get(key, [])) | set(theirs.get(key, [])))
    return base


def _merge_fitted(ours, theirs, began=None):
    """`theirs` (a shard's fitted lists, by animation the body's mark and the layers drawn to fit it) laid over `ours`:
    each layer the shard listed anew under a mark, taken from wherever `ours` listed it before."""
    began = began or {}
    for anim, marks in theirs.items():
        was = {n: m for m, names in began.get(anim, {}).items() for n in names}
        mine = ours.setdefault(anim, {})
        for mark, names in marks.items():
            for n in (n for n in names if was.get(n) != mark):
                for m in [m for m in mine if n in mine[m]]:
                    mine[m] = [x for x in mine[m] if x != n]
                    if not mine[m]:
                        del mine[m]
                mine[mark] = sorted(set(mine.get(mark, [])) | {n})
    return ours


def merge(args):
    import fcntl
    with open(LOOKS + '.lock', 'w') as lock:   # layers.py's lock: no run writes the index, keys or fitted meanwhile
        fcntl.flock(lock, fcntl.LOCK_EX)
        _merge(args)
    print('merged: run layers.py --index for each body, node tools/forgeCanvas.mjs and '
          'node tools/sprite-forge/peopleLooks.mjs, then the forge tests')


def _merge(args):
    rel = os.path.relpath(LOOKS, ROOT)
    index = json.load(open(LOOKS))
    strip_keys = lambda f: f.startswith('keys-') and f.endswith('.json')   # noqa: E731  (not version.json)
    keys = {f: json.load(open(os.path.join(KEYS, f))) for f in os.listdir(KEYS) if strip_keys(f)} \
        if os.path.isdir(KEYS) else {}
    fitted = {f: json.load(open(os.path.join(FITTED, f))) for f in os.listdir(FITTED) if f.endswith('.json')} \
        if os.path.isdir(FITTED) else {}
    rel_fitted = os.path.relpath(FITTED, ROOT)
    for branch in args.branches.split(','):
        base = _git('merge-base', 'HEAD', branch).strip()
        theirs_fitted = _git('ls-tree', '--name-only', f'{branch}:{rel_fitted}').split() if rel_fitted in _git(
            'ls-tree', '--name-only', '-d', branch, os.path.dirname(rel_fitted) + '/') else []
        for f in (f for f in theirs_fitted if f.endswith('.json')):
            began = json.loads(_git('show', f'{base}:{rel_fitted}/{f}')) if f in _git(
                'ls-tree', '--name-only', f'{base}:{rel_fitted}').split() else {}
            _merge_fitted(fitted.setdefault(f, {}), json.loads(_git('show', f'{branch}:{rel_fitted}/{f}')), began)
        changed = [f for f in _git('diff', '--name-only', base, branch, '--',
                                   os.path.relpath(STUDIO, ROOT)).split() if f.endswith('.png')]
        for i in range(0, len(changed), 200):
            _git('checkout', branch, '--', *changed[i:i + 200])
        _merge_index(index, json.loads(_git('show', f'{branch}:{rel}')), json.loads(_git('show', f'{base}:{rel}')))
        for f in filter(strip_keys, _git('ls-tree', '--name-only', f'{branch}:{os.path.relpath(KEYS, ROOT)}').split()):
            theirs = json.loads(_git('show', f'{branch}:{os.path.relpath(KEYS, ROOT)}/{f}'))
            ours = json.loads(_git('show', f'{base}:{os.path.relpath(KEYS, ROOT)}/{f}')) if f in _git(
                'ls-tree', '--name-only', f'{base}:{os.path.relpath(KEYS, ROOT)}').split() else {}
            keys.setdefault(f, {}).update({n: v for n, v in theirs.items() if ours.get(n) != v})
        print(f'{branch}: {len(changed)} strips')
    with open(LOOKS, 'w') as f:
        json.dump(index, f, indent=1, sort_keys=True)
        f.write('\n')
    os.makedirs(FITTED, exist_ok=True)
    for f, lists in fitted.items():
        with open(os.path.join(FITTED, f), 'w') as out:
            json.dump(lists, out, indent=1, sort_keys=True)
            out.write('\n')
    os.makedirs(KEYS, exist_ok=True)
    for f, k in keys.items():
        with open(os.path.join(KEYS, f), 'w') as out:
            out.write('{\n' + ',\n'.join(f' {json.dumps(n)}: {json.dumps(k[n], separators=(",", ":"))}'
                                         for n in sorted(k)) + '\n}\n')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('plan')
    p.add_argument('--out', required=True)
    p.add_argument('--bodies', default='male,female')
    p.add_argument('--anims', default='')
    p.add_argument('--studio', default=STUDIO)
    p.add_argument('--sets', default=','.join(SETS))
    p.add_argument('--materials', default='', help='the armour sets alone (a part of the work)')
    p.add_argument('--layers', default='', help='these layers alone (a part of the work)')
    p.add_argument('--tmp', default=os.environ.get('TMPDIR', '/tmp'))
    p = sub.add_parser('rekey')
    p.add_argument('--bodies', default='male,female')
    p.add_argument('--anims', default='')
    p.add_argument('--studio', default=STUDIO)
    p.add_argument('--sets', default=','.join(SETS))
    p.add_argument('--materials', default='', help='the armour sets alone (a part of the work)')
    p = sub.add_parser('shard')
    p.add_argument('--plan', required=True)
    p.add_argument('--shards', type=int, required=True)
    p.add_argument('--out', required=True)
    p = sub.add_parser('run')
    p.add_argument('--shard', required=True)
    p.add_argument('--jobs', type=int, default=2)
    p.add_argument('--out', default=STUDIO)
    p.add_argument('--until', type=float, default=0, help='minutes after which no process starts')
    p.add_argument('--group', type=float, default=GROUP, help="seconds of one machine's work a process draws at most")
    p = sub.add_parser('merge')
    p.add_argument('--branches', required=True)
    args = ap.parse_args()
    {'plan': plan, 'shard': shard, 'run': run, 'merge': merge, 'rekey': rekey}[args.cmd](args)


if __name__ == '__main__':
    main()
