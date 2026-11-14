"""DFO Beast Forge: render a creature's sprite archive from the forge's own 3D beast.

    python -I tools/sprite-forge/beasts/beastforge.py --spec tools/sprite-forge/beasts/specs/255.json --out <dir>

Needs Blender as a Python module, as the sprite forge does. Writes `<archive>_<record>-<frame>.png` for every record
and frame the spec names, at the record's canvas, the ground under the beast on its `place` pixel. Unlike a class
sprite's, a creature's records are drawn at more than one size: Daggerfall sizes a billboard by its record's header
scale, so the forge draws each record at the pixels a metre that scale gives (`density`). `--register <ref.json>` (from
reference.mjs) sets each record's `place` instead. `--work` writes the uncropped work renders."""
import argparse
import importlib
import json
import math
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import beastshape  # noqa: E402
import forge  # noqa: E402
import materials  # noqa: E402
import stage  # noqa: E402

GLOBAL_SCALE = 0.025   # metres a texel of a record at header scale 0 (DFU MeshReader.GlobalScale)
SCALE_DIVISOR = 256    # DFU DaggerfallUnity.GetScaledSize's divisor of a record's header scale
FIT = {}               # a frame's fitted adjustment (beastfit.py), keyed '<anim>:<view>:<frame>'
GRADE = forge.GRADE    # material -> its brightness curve onto the reference's (beastcolour.py)


def density(rec):
    """The pixels a metre a record is drawn at: its height over the height the game gives its billboard
    (rmbFlats.js scaledBillboardSize), before the fitted size on screen."""
    h = rec['canvas'][1]
    return h / ((h + math.trunc(h * rec['scale'] / SCALE_DIVISOR)) * GLOBAL_SCALE)


def yaw_of(rec):
    """The beast's turn in a record: view k turns it k eighths to the viewer's left, or to the right where the
    record is drawn mirrored (the rat's idle, DFU's RatIdleAnims)."""
    return 45.0 * rec['view'] * (1 if rec.get('mirror') else -1)


def key_of(rec, f):
    return f"{rec['anim']}:{rec['view']}{'m' if rec.get('mirror') else ''}:{f}"


def aim(ppm):
    """Set the stage's camera to draw `ppm` pixels a metre at the stage's elevation, the root still on stage.ROOT_PX
    (stage.setup's framing)."""
    stage.PX_PER_M = ppm
    cam = bpy.context.scene.camera
    cam.data.ortho_scale = max(stage.WORK_W, stage.WORK_H) / ppm
    e = math.radians(stage.ELEVATION)
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    up = Vector((0, math.sin(e), math.cos(e)))
    fwd = Vector((0, math.cos(e), -math.sin(e)))
    rx, ry = stage.ROOT_PX
    centre = up * ((ry - stage.WORK_H / 2) / ppm) - Vector((1, 0, 0)) * ((rx - stage.WORK_W / 2) / ppm)
    cam.location = centre - fwd * 12


def load_stage(spec):
    """The spec's view of its beast: how far the camera looks down (its fitted elevation, else the spec's), and the
    work frame's size."""
    stage.ELEVATION = beastshape.SHAPE.get('elevation', spec.get('elevation', stage.ELEVATION))
    if spec.get('work'):
        stage.WORK_W, stage.WORK_H = spec['work']
        stage.ROOT_PX = (stage.WORK_W // 2, stage.WORK_H - 12)


def read_spec(path, fitting=False):
    """A spec, and the path of the spec its tables sit beside. A spec that names another archive `as` its art (two
    enemies Daggerfall draws with the same pictures) is drawn as that one: its records, view and tables are the other's,
    only its pictures' names its own. It is never fitted itself (`fitting`): the other is."""
    spec = json.load(open(path))
    if 'as' not in spec:
        return spec, path
    if fitting:
        sys.exit(f"{path} is drawn as {spec['as']}: fit that spec")
    twin = os.path.join(os.path.dirname(path), f"{spec['as']}.json")
    return {**json.load(open(twin)), 'archive': spec['archive'], 'as': spec['as']}, twin


def load_tables(spec_path):
    """Every fitted table beside a spec: poses, proportions, tints, lights and grade."""
    FIT.clear()
    p = spec_path.replace('.json', '-fit.json')
    if os.path.exists(p):
        FIT.update(json.load(open(p)))
    beastshape.load_shape(spec_path.replace('.json', '-shape.json'))
    materials.load_tint(spec_path.replace('.json', '-colour.json'))
    stage.load_light(spec_path.replace('.json', '-light.json'))
    GRADE.clear()
    p = spec_path.replace('.json', '-grade.json')
    if os.path.exists(p):
        GRADE.update(json.load(open(p)))


# Daggerfall's creatures are matte: their light shades them softly and never flashes off a hide. Every material is
# held to a dull sheen; only a creature's small hard bits (`GLINT`) keep a little shine, as an eye or a tooth does.
MATTE = {'spec': 0.1, 'rough': 0.75, 'metal': 0.15}
GLINT = {'eye', 'pupil', 'glint', 'jewel', 'tooth', 'fang', 'tusk'}


def matte(mats):
    """Every material in `mats` held to `MATTE`'s sheen, its `GLINT` ones a little shinier."""
    for name, m in mats.items():
        spec, rough, metal = (0.35, 0.35, 0.3) if name in GLINT else (MATTE['spec'], MATTE['rough'], MATTE['metal'])
        for n in m.node_tree.nodes:
            if n.type != 'BSDF_PRINCIPLED':
                continue
            n.inputs['Specular IOR Level'].default_value = min(n.inputs['Specular IOR Level'].default_value, spec)
            n.inputs['Roughness'].default_value = max(n.inputs['Roughness'].default_value, rough)
            n.inputs['Metallic'].default_value = min(n.inputs['Metallic'].default_value, metal)
    return mats


class Beast:
    """The creature a spec names (`beast`: its module here), built, shaped and posed."""

    def __init__(self, kind):
        self.kind = importlib.import_module(kind)
        self.M = matte(self.kind.palette())
        self.skins, self.parts = self.kind.build(self.M)
        self.shaper = beastshape.Shaper(self)
        self.shaper.lay(beastshape.SHAPE)

    def pose(self, rec, f, adj=None):
        adj = FIT.get(key_of(rec, f)) if adj is None else adj
        return self.kind.pose_for(rec['anim'], f, yaw_of(rec), adj)

    def place(self, pose):
        W = pose.world()
        for sk in self.skins:
            sk.pose(W)
        for ob, j in self.parts:
            ob.matrix_world = W[j]


def stood_short(works, rec):
    """How many rows a grounded record's lowest frame stands above its canvas's last row, as rendered. The fit stands
    it there by its raster, which marks a pixel whose centre a hoof's tip covers; the render's hard alpha may drop that
    pixel."""
    low = max(int(np.nonzero(w[..., 3].any(axis=1))[0].max()) for w in works if w[..., 3].any())
    return max(0, rec['canvas'][1] - 1 - (low - stage.ROOT_PX[1] + rec['place'][1]))


def best_place_free(works, outlines, canvas):
    """A flyer's place: the canvas pixel for its root, across and up and down, where its frames overlap the classic
    outlines most (mean IoU over the record's frames; what falls past the canvas is the forge's alone), searched every
    4 pixels and then every pixel about the best."""
    import fit
    cw, ch = canvas
    refs = [np.array([c != '0' for c in o], dtype=bool).reshape(ch, cw) for o in outlines]
    masks = [w[..., 3] > 0 for w in works]

    def overlap(at):
        total = 0.0
        for m, ref in zip(masks, refs):
            pic = fit.crop(m, canvas, at)
            union = (pic | ref).sum() + (m.sum() - pic.sum())
            total += (pic & ref).sum() / union if union else 0.0
        return total / len(refs)
    coarse = [(x, y) for x in range(-cw // 2, cw + cw // 2, 4) for y in range(-ch // 2, ch + ch // 2, 4)]
    bx, by = max(coarse, key=overlap)
    fine = [(x, y) for x in range(bx - 4, bx + 5) for y in range(by - 4, by + 5)]
    at = max(fine, key=overlap)
    return overlap(at), at


def lights_for(yaw):
    """The stage's lights for a creature turned `yaw` degrees. A light table marked `model` is fixed to the creature,
    as Daggerfall lit each model from its own side and turned the camera round it: its back views take the light
    the creature's back takes. Otherwise the lights stay with the camera."""
    L = stage.LIGHT
    if not L.get('model'):
        return L
    q = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    out = dict(L)
    for k in ('key', 'fill', 'top'):
        v = q @ Vector(L[k][:3])
        out[k] = [v.x, v.y, v.z, L[k][3]]
    return out


def render_frame(beast, rec, f, tmp, ids=None):
    pose = beast.pose(rec, f)
    beast.place(pose)
    stage.set_lights(lights_for(pose.yaw))
    work = stage.render_rgba(tmp)
    if GRADE and ids is not None:
        work = forge.grade_frame(work, ids.image(pose), ids.names)
    return work


def setup(spec, samples):
    """The stage for a spec, and its beast on it."""
    load_stage(spec)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(samples)
    return Beast(spec['beast'])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--records', default='')
    ap.add_argument('--work', action='store_true', help='write uncropped work renders')
    ap.add_argument('--register', default='', help='reference outlines from reference.mjs')
    ap.add_argument('--samples', type=int, default=64)
    args = ap.parse_args()
    spec, tables = read_spec(args.spec, fitting=bool(args.register))
    load_tables(tables)
    beast = setup(spec, args.samples)
    ids = None
    if GRADE:   # the exact material map the grade reads: the fitter's raster
        import beastfit
        ids = beastfit.Cloud(beast, classify=beastfit.material_ids(beast))
    os.makedirs(args.out, exist_ok=True)
    tmp = os.path.join(tempfile.mkdtemp(), 'f.png')
    only = {int(r) for r in args.records.split(',') if r != ''}
    ref = json.load(open(args.register)) if args.register else None
    report, settled = [], []
    for r, rec in enumerate(spec['records']):
        if only and r not in only:
            continue
        aim(density(rec) * beastshape.SHAPE['scale'])
        if ids is not None:   # the stage's pixels a metre already hold the fitted size
            ids.scale = 1.0
        if ref:
            works = [render_frame(beast, rec, f, tmp) for f in range(rec['frames'])]
            find = best_place_free if getattr(beast.kind, 'FLIES', False) else forge.best_place
            score, place = find(works, ref['records'][r]['frames'], rec['canvas'])
            rec['place'] = list(place)
            print(f'record {r}: place {place}, overlap {score:.3f}', flush=True)
            continue
        works = [render_frame(beast, rec, f, tmp, ids) for f in range(rec['frames'])]
        gap = 0 if args.work or 'as' in spec or getattr(beast.kind, 'FLIES', False) else stood_short(works, rec)
        if gap:
            rec['place'][1] += gap
            settled.append((r, gap))
        for f, work in enumerate(works):
            name = f"{spec['archive']}_{r}-{f}.png"
            if args.work:
                stage.write_png(os.path.join(args.out, name), work)
                continue
            pic, clipped = forge.crop(work, rec['canvas'], rec['place'])
            stage.write_png(os.path.join(args.out, name), pic)
            report.append((name, clipped))
    if ref:
        forge.write_spec(args.spec, spec)
        return
    for name, clipped in report:
        if clipped:
            print(f'{name}: {clipped} px fall outside the canvas')
    if settled:
        forge.write_spec(args.spec, spec)
        print('stood on the last row: ' + ', '.join(f'record {r} down {gap} px' for r, gap in settled))
    print(f'forged {len(report) or "work"} frames into {args.out}')


if __name__ == '__main__':
    main()
