"""DFO Sprite Forge: render a class sprite archive from the forge's own 3D fighter.

    python -I tools/sprite-forge/forge.py --spec tools/sprite-forge/specs/488.json --out <dir> [--records 0,5]

Needs Blender as a Python module (`pip install bpy==5.2.3`, Python 3.13). Writes `<archive>_<record>-<frame>.png`
for every record and frame the spec names, each at the spec's canvas size with the ground under the body on the
spec's `place` pixel. `--register <ref.json>` (from reference.mjs) sets each record's `place` instead: the pixel
that lays the forge's frames best over the classic record's outlines. `--work` writes the uncropped work renders.
The game wears the looks composed from the bodies' layers (layers.py); these frames are the fit's and the place's."""
import argparse
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import anatomy  # noqa: E402
import model  # noqa: E402
from gear import BENT, arrow_mesh, bend, bow_tips, build_bow, build_sparks, build_weapon, string_mesh  # noqa: E402
import poses  # noqa: E402
import shape  # noqa: E402
import stage  # noqa: E402
from body import coords  # noqa: E402
import materials  # noqa: E402
from materials import palette  # noqa: E402

VIEW_YAW = [0.0, -45.0, -90.0, -135.0, -180.0]   # record k of an animation: the body turned to the viewer's left


def dress(spec):
    """The outfit, the body and the weapon a spec's archive wears: (outfit, body, weapon). The man's medium armour
    and the axe by default."""
    return spec.get('outfit', 'medium'), spec.get('body', 'male'), spec.get('weapon', 'axe')


class Fighter:
    def __init__(self, outfit='medium', body='male', weapon='axe'):
        anatomy.use(body)
        self.M = palette()
        self.parts, self.skins, self.hands = model.build_body(self.M, outfit)
        self.axe = build_weapon(self.M, weapon)   # the weapon in the right hand, whatever it is
        self.off = []   # what the left hand holds besides (onehand.py): a shield or a second sword, set by a layer
        self.bow = build_bow(self.M)
        self.bow_kind = 'long'
        self.sparks = build_sparks()   # the spell's spark at each size, shown where a frame casts it
        self.extra = []
        self.shaped()

    def arm_bows(self, obs, kind):
        """Hold `obs` (straight bows of type `kind`, gear.py `build_metal_bow`) in place of the bow, each bent and
        strung as it is drawn."""
        for ob in self.bow:
            bpy.data.objects.remove(ob, do_unlink=True)
        self.bow, self.bow_kind = list(obs), kind
        self.bow_rest = [coords(ob.data) for ob in self.bow]

    def shaped(self):
        """Lay the fitted proportions (shape.py) on every mesh. The bow stays straight: `place` bends it each frame."""
        self.bow_rest = [coords(ob.data) for ob in self.bow]
        for sk in self.skins:
            sk.rest = shape.transform(sk.ob.name, sk.rest, alpha=sk.alpha)
            sk.me.vertices.foreach_set('co', sk.rest.ravel())
            sk.me.update()
        rigid = [ob for ob, _ in self.parts] + self.axe
        for ob in rigid:
            p = shape.transform(ob.name, coords(ob.data))
            ob.data.vertices.foreach_set('co', p.ravel())
            ob.data.update()
        # each swinging cloth panel's hinge, on its shaped mesh (poses.py `cloth`)
        self.hinges = {ob.name: poses.hinge(coords(ob.data)) for ob, _ in self.parts if poses.swings(ob.name) is not None}

    def show(self, obs, on):
        for ob in obs:
            ob.hide_render = not on

    def place(self, pose, gear):
        W = pose.world()
        for ob, j in self.parts:
            swing = poses.cloth(ob.name, W, self.hinges[ob.name]) if ob.name in self.hinges else None
            ob.matrix_world = W[j] if swing is None else W[j] @ Matrix(swing.tolist())
            if ob.name in BENT:   # a cuirass's ring, bent with the torso under it
                bend(ob, W, j)
        for sk in self.skins:
            sk.pose(W)
        fists = gear.get('fist', {})
        for side, kinds in self.hands.items():
            closed = fists.get(side, False)
            kinds['fist'].hide_render = not closed
            kinds['open'].hide_render = closed
        for ob in self.extra:
            bpy.data.objects.remove(ob, do_unlink=True)
        self.extra = []
        self.lines = []   # the string's and the arrow's points: the depth raster cannot see them (layers.py `on_lines`)
        for obs, m in ((self.axe, gear.get('axe')), (getattr(self, 'off', []), gear.get('off'))):
            self.show(obs, m is not None)
            if m is not None:
                for ob in obs:
                    ob.matrix_world = m
        spark = gear.get('spark')   # (where, its size): the one that size shown there, the others hidden
        for size, ob in enumerate(self.sparks, 1):
            ob.hide_render = not spark or spark[1] != size
            if spark and spark[1] == size:
                ob.matrix_world = spark[0]
        self.mounted = gear.get('horse') is not None   # astride: its drapes fall over the horse (drape.py `mounted`)
        if self.mounted:   # the horse under a rider (riding.py), on the same frame of its stride
            gear['horse'].place()
        bow_m = gear.get('bow')
        self.show(self.bow, bow_m is not None)
        if bow_m is not None:
            draw = gear.get('draw', 0.0)
            for ob, rest in zip(self.bow, self.bow_rest):
                ob.data.vertices.foreach_set('co', shape.transform(ob.name, rest, draw=draw).ravel())
                ob.data.update()
                ob.matrix_world = bow_m
            a, b = bow_tips(draw, self.bow_kind)
            a, b = bow_m @ a, bow_m @ b
            nock = gear.get('nock') or (a + b) / 2
            self.extra.append(string_mesh(self.M, a, nock, b))
            self.lines.append([tuple(a), tuple(nock), tuple(b)])
            if gear.get('arrow'):
                tip = Vector(gear['arrow'])
                self.extra.append(arrow_mesh(self.M, nock, tip))
                self.lines.append([tuple(nock), tuple(tip)])


GRADE = {}   # material -> (its brightness at GRADE_AT shares, the reference's): colour.py's grade


def grade_frame(work, ids, names, view=None):
    """Map each material's brightness onto the reference's (`GRADE`), keeping its hue: the classic renders' shading
    runs darker in the middle and brighter at the top than any matte light gives. A material's grade for one view
    (`skin@3`) takes that view's place: Daggerfall's skin is darker seen from behind than its light alone makes it."""
    if not GRADE:
        return work
    out = work.copy()
    rgb = work[..., :3].astype(np.float64)
    lum = rgb.mean(axis=2)
    for k, n in enumerate(names):
        own = GRADE.get(f'{n}@{view}') if view is not None else None
        g = own or GRADE.get(n) or GRADE.get(n.split('.')[0])   # a metal's own (`haft.Iron`) is graded as what it stands for
        if not g:
            continue
        m = (ids == k + 1) & (work[..., 3] > 0)
        if not m.any():
            continue
        if 'ramp' in g:   # brightness share for share onto the reference's own colour there: its hue at each light
            src, dst = g['ramp']
            for c in range(3):
                out[m, c] = np.clip(np.interp(lum[m], src, [d[c] for d in dst]), 0, 255).round().astype(np.uint8)
            continue
        if 'rgb' in g:   # each channel mapped share for share onto the reference's
            for c, (src, dst) in enumerate(g['rgb']):
                out[m, c] = np.clip(np.interp(rgb[m][:, c], src, dst), 0, 255).round().astype(np.uint8)
            continue
        src, dst = g['lum']
        want = np.interp(lum[m], src, dst)
        out[m, :3] = np.clip(rgb[m] * (want / np.maximum(lum[m], 1.0))[:, None], 0, 255).round().astype(np.uint8)
    return out


def render_frame(fighter, anim, view, frame, tmp):
    pose, gear = poses.pose_for(anim, frame, view, VIEW_YAW[view])
    fighter.place(pose, gear)
    work = stage.render_rgba(tmp)
    if GRADE and getattr(fighter, 'ids', None) is not None:
        work = grade_frame(work, fighter.ids.image(pose, gear), fighter.id_names, view)
    return work


def crop(work, canvas, place):
    """Cut the work render to the canvas, the root pixel landing on `place`."""
    cw, ch = canvas
    px, py = place
    rx, ry = stage.ROOT_PX
    out = np.zeros((ch, cw, 4), dtype=np.uint8)
    x0, y0 = rx - px, ry - py
    sx0, sy0 = max(x0, 0), max(y0, 0)
    sx1, sy1 = min(x0 + cw, work.shape[1]), min(y0 + ch, work.shape[0])
    out[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0] = work[sy0:sy1, sx0:sx1]
    clipped = work[..., 3].sum() - out[..., 3].sum()
    return out, int(clipped // 255)


def best_place(works, outlines, canvas):
    """The canvas pixel for the root that overlaps the classic outlines most (mean IoU over the record's frames)."""
    cw, ch = canvas
    refs = [np.array([c != '0' for c in o], dtype=bool).reshape(ch, cw) for o in outlines]
    masks = [w[..., 3] > 0 for w in works]
    # the feet rest on the canvas's last row, as every classic record's do
    lowest = max(int(np.nonzero(m.any(axis=1))[0].max()) for m in masks)
    best = (-1.0, None)
    for py in [ch - 1 - (lowest - stage.ROOT_PX[1])]:
        for px in range(-cw // 2, cw + cw // 2):
            score = 0.0
            for m, ref in zip(masks, refs):
                pic, cut = crop(np.dstack([m] * 4).astype(np.uint8) * 255, canvas, (px, py))
                ours = pic[..., 3] > 0
                union = (ours | ref).sum() + cut   # what falls past the canvas is ours alone
                score += (ours & ref).sum() / union if union else 0.0
            score /= len(refs)
            if score > best[0]:
                best = (score, (px, py))
    return best


def write_spec(path, spec):
    rows = ',\n'.join('  ' + json.dumps(r) for r in spec['records'])
    head = {k: v for k, v in spec.items() if k != 'records'}
    text = json.dumps(head, indent=1)[:-2] + ',\n "records": [\n' + rows + '\n ]\n}\n'
    open(path, 'w').write(text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--records', default='')
    ap.add_argument('--work', action='store_true', help='write uncropped work renders')
    ap.add_argument('--register', default='', help='reference outlines from reference.mjs')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--outfit', default='', choices=('',) + model.OUTFITS, help="what the body wears (the spec's)")
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    spec = json.load(open(args.spec))
    poses.load_fit(args.spec.replace('.json', '-fit.json'))
    poses.load_spec(spec)
    shape.load_shape(args.spec.replace('.json', '-shape.json'))
    # its colours: its own, or those of the archive whose body it wears (`colours`: the mages wear the fighters')
    colours = os.path.join(os.path.dirname(args.spec), f"{spec.get('colours', spec['archive'])}.json")
    materials.load_tint(colours.replace('.json', '-colour.json'))
    stage.load_light(colours.replace('.json', '-light.json'))
    grade_path = colours.replace('.json', '-grade.json')
    if os.path.exists(grade_path):
        GRADE.update(json.load(open(grade_path)))
    stage.PX_PER_M *= shape.SHAPE['scale']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(args.samples)
    outfit, body, weapon = dress(spec)
    fighter = Fighter(args.outfit or outfit, body, weapon)
    if GRADE:   # the exact material map the grade reads (fit.py's raster: the render's pixels)
        import fit
        fighter.id_names = sorted(fighter.M)
        ids_of = {n: i + 1 for i, n in enumerate(fighter.id_names)}
        fighter.ids = fit.Cloud(fighter, classify=lambda m: ids_of.get(m.name.split('.')[0], 0) if m else 0)
    os.makedirs(args.out, exist_ok=True)
    tmp = os.path.join(tempfile.mkdtemp(), 'f.png')
    only = {int(r) for r in args.records.split(',') if r != ''}
    report = []
    ref = json.load(open(args.register)) if args.register else None
    for r, rec in enumerate(spec['records']):
        if only and r not in only:
            continue
        if ref:
            works = [render_frame(fighter, rec['anim'], rec['view'], f, tmp) for f in range(rec['frames'])]
            score, place = best_place(works, ref['records'][r]['frames'], rec['canvas'])
            rec['place'] = list(place)
            print(f'record {r}: place {place}, overlap {score:.3f}')
            continue
        for f in range(rec['frames']):
            work = render_frame(fighter, rec['anim'], rec['view'], f, tmp)
            name = f"{spec['archive']}_{r}-{f}.png"
            if args.work:
                stage.write_png(os.path.join(args.out, name), work)
                continue
            pic, clipped = crop(work, rec['canvas'], rec['place'])
            stage.write_png(os.path.join(args.out, name), pic)
            report.append((name, clipped))
    if ref:
        write_spec(args.spec, spec)
        return
    for name, clipped in report:
        if clipped:
            print(f'{name}: {clipped} px fall outside the canvas')
    print(f'forged {len(report) or "work"} frames into {args.out}')


if __name__ == '__main__':
    main()
