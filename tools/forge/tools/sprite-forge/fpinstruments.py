"""The bard's instruments in first person, and their pictures in the pack: each instrument's frames rendered by the
first-person forge as a tool's are (fptools.py), both our arms holding it (instruments.py).

    python -I tools/sprite-forge/fpinstruments.py --out public/art/tools [--kinds lute,flute] [--samples 128]
    python -I tools/sprite-forge/fpinstruments.py --out public/art/tools --armour all [--sets-only]
    python -I tools/sprite-forge/fpinstruments.py --icons public/art/instruments [--samples 128]
    python -I tools/sprite-forge/fpinstruments.py --preview /tmp/out --kinds lute --samples 16

No frame of Daggerfall's holds an instrument, so their poses are keyed by hand (specs/<KIND>-fit.json): the Lute's rest
and its pluck, each pipe's rest and the fingering of each of its eight notes, the Tambourine's rest, stroke and shake.
They are lit as our hands are, in the climbing hands' light, and the arms wear the climbing hands' colours. Each
instrument's materials are graded on its own render (`tones`), its brightness or every channel at the grade's shares
over all its frames, onto Daggerfall's tones for its like (`TONES`): the dark woods onto a haft's, the pale
ones (the Lute's spruce belly, the Flute's boxwood) and the Tambourine's vellum onto the held map's parchment. Materials graded together (the Lute's staves and spacers) share one
grade, so the spacers stay darker than the staves. Gut, bone, brass, ebony and the rose keep their own colours: the
game's palette snap finds Daggerfall's for them.

The frames go to `<out>/<kind>/<state>-<frame>.png`, a state's frames on one canvas, and `<out>/<kind>/frames.json`
says where each canvas stands on the 320 x 200 screen (`rect`), as the tools' do (combat/toolArt.js draws them).

With `--armour`, every armour set's arms (fparmour.py) hold each frame again, the instrument in its bare grade
(`specs/<KIND>-grade.json`): `<out>/<kind>/<state>-<frame>_<Set>.png`, on the bare frames' canvas, which grows to hold
them all. The sets render in a Blender of their own (`--sets-only`).

The icons (`--icons`) are each instrument alone, no arms, turned to show itself as Daggerfall's icons show a thing,
graded as its frames are and outlined dark: `<icons>/<kind>-icon.png` (systems/instruments/instrumentItems.js)."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fpcolour  # noqa: E402
import fpforge  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402
import instruments  # noqa: E402

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
KINDS = ('lute', 'flute', 'recorder', 'tambourine')
LIGHT = 'CLIMB'   # the light our hands were fitted in
# each instrument's materials graded together onto Daggerfall's tones for their like: (archive, its material)
TONES = {
    'lute': {('ribpale', 'ribdark'): ('WEAPON08', 'haft'), ('soundboard',): ('HELDMAP', 'parchment')},
    'flute': {('boxwood',): ('HELDMAP', 'parchment')},
    'recorder': {('pipewood',): ('WEAPON08', 'haft')},
    'tambourine': {('hoop',): ('WEAPON08', 'haft'), ('vellum',): ('HELDMAP', 'parchment')},
}
# the icons' poses: the instrument alone in the middle of the screen, turned to show its face and its depth
ICON_POSES = {
    'lute': {'base': [192, 150], 'depth': 1.6, 'tip': [128, 52], 'roll': -35.0, 'bare': 1},
    'flute': {'base': [214, 140], 'depth': 1.0, 'tip': [110, 62], 'roll': -50.0, 'bare': 1},
    'recorder': {'base': [178, 64], 'depth': 0.75, 'tip': [146, 140], 'roll': -40.0, 'bare': 1},
    'tambourine': {'base': [160, 100], 'depth': 0.62, 'tip': [166, 64], 'roll': -28.0, 'bare': 1},
}
ICON_SIZE = 56          # the icon's longest side, texels: as large as Daggerfall's largest item pictures
ICON_OUTLINE = 0.45     # the outline's darkness, a share of the edge texel's colour


def spec_path(kind):
    return os.path.join(SPECS, f'{kind.upper()}.json')


def setup(kind, samples):
    """The instrument's spec laid on, our hands' light borrowed, and the eye that renders it."""
    spec = fpforge.load(spec_path(kind))
    fpstage.load_light(os.path.join(SPECS, f'{LIGHT}-light.json'))
    fpstage.RECORD_LIGHT.clear()
    return spec, fpforge.Eye(spec, samples)


def frames_of(spec):
    """Every frame the spec keys: [(record, frame, state, pose)]."""
    out = []
    for r, rec in enumerate(spec['records']):
        for f in range(rec['frames']):
            out.append((r, f, rec['state'], fpforge.FIT[f'{r}:{f}']))
    return out


def tones(eye, kind, frames, part):
    """The instrument's own grade (TONES): each group's pixels over the raw render of every frame, at the grade's
    shares, onto Daggerfall's at the same shares - its every channel (`rgb`), its brightness (`lum`), or its brightness
    then the reference's own colour at it (`ramp`). One grade a group, laid on each of its materials."""
    at = lambda v: fpcolour.rising(np.percentile(v, fpcolour.GRADE_AT)).round(2).tolist()   # noqa: E731
    seen = {g: [] for g in TONES[kind]}
    for r, f, _, pose in frames:
        work = eye.screen(pose, part, raw=True, record=r, frame=f)
        ids = eye.id_map(pose, part, record=r)
        for g in seen:
            on = (work[..., 3] > 0) & np.isin(ids, [eye.names.index(n) + 1 for n in g])
            seen[g].append(work[on][:, :3].astype(np.float64))
    out = {}
    for g, chunks in seen.items():
        px = np.concatenate(chunks) if chunks else np.zeros((0, 3))
        if len(px) < 40:
            continue
        name, mat = TONES[kind][g]
        theirs = json.load(open(os.path.join(SPECS, f'{name}-grade.json')))[mat]
        if 'rgb' in theirs:
            grade = {'rgb': [[at(px[:, c]), theirs['rgb'][c][1]] for c in range(3)]}
        elif 'ramp' in theirs:
            _, dst, ramp_at, colours = theirs['ramp']
            grade = {'ramp': [at(px.mean(axis=1)), dst, ramp_at, colours]}
        else:
            grade = {'lum': [at(px.mean(axis=1)), theirs['lum'][1]]}
        for n in g:
            out[n] = grade
    return out


def canvas(screens):
    """The canvas a state's frames share on the 320 x 200 screen: [x, y, w, h], out to the farthest drawn texel."""
    on = np.zeros(screens[0].shape[:2], dtype=bool)
    for scr in screens:
        on |= scr[..., 3] > 0
    ys, xs = np.nonzero(on)
    if not len(xs):
        return [0, 0, 1, 1]
    x0, y0 = int(xs.min()), int(ys.min())
    return [x0, y0, int(xs.max()) + 1 - x0, int(ys.max()) + 1 - y0]


def grade_path(kind):
    return os.path.join(SPECS, f'{kind.upper()}-grade.json')


def render(kind, samples, keep=True):
    """Every frame of an instrument, graded: {state: [screen...]} in the spec's order. Its own materials' grade, read
    off this bare render (`tones`), is kept beside its spec (`keep`; never a preview's), so every armour set's frames
    take the same one."""
    spec, eye = setup(kind, samples)
    part = fpforge.part_of(spec, spec['records'][0])
    frames = frames_of(spec)
    own = tones(eye, kind, frames, part)
    if keep:
        with open(grade_path(kind), 'w') as fh:
            fh.write(json.dumps(own, separators=(',', ':')) + '\n')
    fpforge.GRADE.update(own)
    out = {}
    for r, f, state, pose in frames:
        out.setdefault(state, []).append(eye.screen(pose, part, record=r, frame=f))
    return out, eye, part


# -- the armour sets: each set's arms on every frame, as the fists' are (fparmour.py), the hands' only difference

def wear(kind, material):
    """Dress the instrument's arms in `material`'s set: its garments and plate (instruments.ARMOUR), their materials,
    and plate and mail read as metal, graded grey and dyed in the game. Gives back what to restore."""
    import fparmour
    W = fpmodel.WEAPONS[kind]
    saved = (W['mats'], fpmodel.palette, dict(fpforge.CLASSES))
    instruments.ARMOUR['set'] = material
    W['mats'] = instruments.mats(kind)
    fpmodel.palette = fparmour.dressed(saved[1], material)
    fpforge.CLASSES.update(fparmour.ARMOUR_CLASSES)
    return saved


def unwear(kind, saved):
    import fpmetals
    fpstage.set_lights = fpmetals.SET_LIGHTS   # a set's glow hooked the lights to its own material, freed with its eye
    instruments.ARMOUR['set'] = None
    fpmodel.WEAPONS[kind]['mats'], fpmodel.palette, classes = saved
    fpforge.CLASSES.clear()
    fpforge.CLASSES.update(classes)


def armour_screens(kind, material, samples, own):
    """Every frame of `kind` in `material`'s set: {state: [screen...]}, the instrument in its bare grade (`own`)."""
    import fparmour
    saved = wear(kind, material)
    try:
        spec, eye = setup(kind, samples)
        fpforge.GRADE.update(own)
        fpforge.GRADE.update(fparmour.grades(material))
        part = fpforge.part_of(spec, spec['records'][0])
        out = {}
        for r, f, state, pose in frames_of(spec):
            out.setdefault(state, []).append(eye.screen(pose, part, record=r, frame=f))
        return out
    finally:
        unwear(kind, saved)


def union(rects):
    x0, y0 = min(r[0] for r in rects), min(r[1] for r in rects)
    x1, y1 = max(r[0] + r[2] for r in rects), max(r[1] + r[3] for r in rects)
    return [x0, y0, x1 - x0, y1 - y0]


def armour_pass(kind, sets, out, samples):
    """Each set's frames beside the bare ones (`<state>-<frame>_<Set>.png`), every set's and the bare frames on one
    canvas a state, so the game swaps them with the gauntlets worn and their table stays one."""
    import stage
    from PIL import Image
    own = json.load(open(grade_path(kind)))
    folder = os.path.join(out, kind)
    table = json.load(open(os.path.join(folder, 'frames.json')))
    worn = {m: armour_screens(kind, m, samples, own) for m in sets}
    for state, rec in table.items():
        rect = union([rec['rect']] + [canvas(worn[m][state]) for m in sets])
        x, y, w, h = rect
        ox, oy = rec['rect'][0] - x, rec['rect'][1] - y
        for f in range(len(worn[sets[0]][state])):
            path = os.path.join(folder, f'{state}-{f}.png')
            bare = Image.new('RGBA', (w, h), (0, 0, 0, 0))
            bare.paste(Image.open(path).convert('RGBA'), (ox, oy))
            stage.write_png(path, np.asarray(bare))
            for m in sets:
                stage.write_png(os.path.join(folder, f'{state}-{f}_{m}.png'), fpstage.crop(worn[m][state][f], rect))
        rec['rect'] = rect
    with open(os.path.join(folder, 'frames.json'), 'w') as fh:
        fh.write(json.dumps(table, separators=(',', ':')) + '\n')
    print(f'{kind}: {len(sets)} sets, {json.dumps({k: v["rect"] for k, v in table.items()})}', flush=True)


def icon(kind, eye, part):
    """The instrument's picture in the pack: itself alone at ICON_POSES, graded as its frames are, cut to what it draws
    and outlined dark. It is rendered again set back until its longest side is ICON_SIZE, so every texel is a render's
    own and no string breaks up as a shrunk picture's would."""
    pose = dict(ICON_POSES[kind])
    for _ in range(3):
        scr = eye.screen(pose, part, record=0, frame=0)
        x, y, w, h = canvas([scr])
        if abs(max(w, h) - ICON_SIZE) <= 1:
            break
        k = ICON_SIZE / max(w, h)   # drawn k times as large: its two screen points drawn in about their middle, set back
        mid = (np.asarray(pose['base'], dtype=np.float64) + np.asarray(pose['tip'], dtype=np.float64)) / 2
        pose = {**pose, 'base': (mid + (np.asarray(pose['base']) - mid) * k).tolist(),
                'tip': (mid + (np.asarray(pose['tip']) - mid) * k).tolist(), 'depth': pose['depth'] / k}
    pic = np.zeros((h + 2, w + 2, 4), dtype=np.uint8)
    pic[1:-1, 1:-1] = fpstage.crop(scr, [x, y, w, h])
    return fpforge.outlined(pic, ICON_OUTLINE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='', help='the tools\' art folder the frames go to (public/art/tools)')
    ap.add_argument('--icons', default='', help='the folder the pack\'s pictures go to (public/art/instruments)')
    ap.add_argument('--preview', default='', help='write whole screens over a grey ground instead')
    ap.add_argument('--kinds', default=','.join(KINDS))
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--armour', default='', help='the armour sets to render beside the bare frames (all: every set)')
    ap.add_argument('--sets-only', action='store_true', help='render only the sets, beside the bare frames already out')
    args = ap.parse_args()
    import stage
    from PIL import Image
    sets = []
    if args.armour:
        import armour
        sets = list(armour.MATERIALS) if args.armour == 'all' else [m for m in args.armour.split(',') if m]
    for kind in [k for k in args.kinds.split(',') if k]:
        if args.sets_only:
            armour_pass(kind, sets, args.out, args.samples)
            continue
        states, eye, part = render(kind, args.samples, keep=bool(args.out))
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            for state, screens in states.items():
                for f, scr in enumerate(screens):
                    ground = Image.new('RGBA', scr.shape[1::-1], (72, 80, 72, 255))
                    ground.alpha_composite(Image.fromarray(scr))
                    ground.resize((ground.width * 2, ground.height * 2), Image.NEAREST).save(
                        os.path.join(args.preview, f'{kind}-{state}-{f}.png'))
        if args.out:
            table = {}
            os.makedirs(os.path.join(args.out, kind), exist_ok=True)
            for state, screens in states.items():
                rect = canvas(screens)
                for f, scr in enumerate(screens):
                    stage.write_png(os.path.join(args.out, kind, f'{state}-{f}.png'), fpstage.crop(scr, rect))
                table[state] = {'rect': rect, 'points': None}
            with open(os.path.join(args.out, kind, 'frames.json'), 'w') as fh:
                fh.write(json.dumps(table, separators=(',', ':')) + '\n')
            print(f'{kind}: {json.dumps({k: v["rect"] for k, v in table.items()})}', flush=True)
            if sets:   # in a Blender of their own: this one's materials are freed under the bare frames' eye
                import subprocess
                subprocess.run([sys.executable, '-I', os.path.abspath(__file__), '--out', args.out, '--kinds', kind,
                                '--samples', str(args.samples), '--armour', ','.join(sets), '--sets-only'], check=True)
        if args.icons:
            os.makedirs(args.icons, exist_ok=True)
            stage.write_png(os.path.join(args.icons, f'{kind}-icon.png'), icon(kind, eye, part))
            print(f'{kind}: icon', flush=True)


if __name__ == '__main__':
    main()
