"""The forge's armour on the paper doll: each armour set's helm, cuirass, pauldrons, gauntlets, greaves and boots drawn
in the doll's own records (TEXTURE.245-248 a woman's, 249-252 a man's, by body shape), so the pack and the doll show
the armour the forge made. Daggerfall draws its doll in one pose, half turned, the right arm hanging, the left hand on
the hip. The forge's body is fitted to each doll body's outline (`--fit`, as fit.py fits a class sprite's frames): its
turn, its arms and legs, its size and where it stands. Each set is then worn by the fitted body and each piece rendered
alone, the body held out so only what lies before it shows, warped onto the doll's outline and cut at the doll's own
boxes (dollReference.mjs reads where they stand), its metal grey for the game's dye (dollarmourrender.py). Nothing of
Daggerfall's pictures is kept: the fit reads their outlines, the grade their shading, a helm's mask the head's hair.

    ARENA2_PATH=... node tools/sprite-forge/dollReference.mjs /tmp/doll-ref.json
    python -I tools/sprite-forge/dollarmour.py --ref /tmp/doll-ref.json --fit [--bodies male:2]
    python -I tools/sprite-forge/dollarmour.py --ref /tmp/doll-ref.json --out public/art/studio/forge/doll

`--fit` writes specs/doll-bodies.json: each body's fitted pose, and each armour record's size (`boxes`). `--out` writes
`<archive>_<record>-0_<Metal>.png` for each piece's records: Silver's as the bare name (its dye is Unchanged), Leather's
and Chain's by their sets' names, and beside each helm record its hair's mask (`_Mask`)."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
SPEC = os.path.join(SPECS, 'doll-bodies.json')
ORIGIN = (200, 8)          # the doll's canvas in its own texels (paperDoll.js PAPERDOLL_ORIGIN)
CANVAS = (120, 200)        # wide and tall enough for every body and every piece
BODIES = [f'{g}:{m}' for g in ('male', 'female') for m in range(4)]
FIRST = {'male': 249, 'female': 245}   # a gender's first armour archive; a body shape is its offset (paperdollArt.js)
# the name a set's picture carries after its record: its metal's dye (`_Iron`); Silver's dye is Unchanged, so its
# picture is the bare name; leather and chain share that dye, so theirs carry the set's own name, which the doll asks
# a leather or chain piece by (src/systems/studioArt/forgeDollAsk.js)
def token(material):
    return None if material == 'Silver' else material


# the pose's free joints and how far each may turn from rest (degrees): the doll's turn, its arms, its legs
JOINTS = {'uarm_R': 60, 'farm_R': 70, 'uarm_L': 70, 'farm_L': 110, 'clav_L': 20, 'clav_R': 20, 'thigh_L': 25,
          'thigh_R': 25, 'shin_L': 25, 'shin_R': 25, 'foot_L': 40, 'foot_R': 40, 'spine': 15, 'chest': 20, 'neck': 15,
          'head': 20}
# each piece's doll records: leather's, the plate metals', chain's (paperdollArt.js clampArmorVariant)
RECORDS = {'boots': ((0,), (1, 2), (1, 2)), 'cuirass': ((3,), (4, 5, 6), (7,)), 'gauntlets': ((8,), (9,), (9,)),
           'greaves': ((10, 11), (12, 13, 14, 15), (16,)), 'pauldron_L': ((17,), (18, 19, 20), (21,)),
           'pauldron_R': ((22,), (23, 24, 25), (26,)), 'helm': ((27, 28, 29, 30, 31, 32),) * 3}


def _mask(rec):
    return np.array([[c != '0' for c in row] for row in rec['rows']], dtype=bool)


def target(ref, key):
    """The doll body's outline - its bare body and its head - on the canvas."""
    out = np.zeros((CANVAS[1], CANVAS[0]), dtype=bool)
    for part in ('body', 'head'):
        rec = ref['bodies'][key][part]
        off = rec.get('offset') or {'x': 0, 'y': 0}
        m = _mask(rec)
        x0, y0 = off['x'] - ORIGIN[0], off['y'] - ORIGIN[1]
        h, w = m.shape
        out[y0:y0 + h, x0:x0 + w] |= m
    return out


def pose_of(x):
    """A parameter vector to (rot by joint, yaw, scale px/m, width share, root x, root y)."""
    import rig
    rot = {}
    i = 0
    for j in JOINTS:
        rot[j] = (float(x[i]), float(x[i + 1]), float(x[i + 2]))
        i += 3
    yaw, k, kx, cx, cy = (float(v) for v in x[i:i + 5])
    return rig.Pose(rot=rot, yaw=yaw), k, kx, cx, cy


def silhouette(cloud, x, gear):
    import fit
    pose, k, kx, cx, cy = pose_of(x)
    v, t, c = cloud.mesh(pose, gear)
    px = cx + v[:, 0] * k * kx
    py = cy - v[:, 2] * k
    img = fit.rasterize(px, py, v[:, 1], t, c, CANVAS[0], CANVAS[1])
    return img > 0


def fit_body(key, ref, iters, seed=1, start=None):
    """The forge body's pose and placing that best covers the doll body's outline; `start` another body's fit to
    begin its pose from (a fit that settled with an arm in the wrong place)."""
    import cma
    import layers
    import fit
    gender = key.split(':')[0]
    layers.load_body(gender)
    body = layers.Bare(gender, 'axe')
    cloud = fit.Cloud(body)
    want = target(ref, key)
    ys, xs = np.nonzero(want)
    gear = {'fist': {'L': True, 'R': True}}
    n = len(JOINTS) * 3
    height = float(ys.max() - ys.min() + 1)
    rot = np.concatenate([start['rot'][j] for j in JOINTS]) if start else np.zeros(n)
    yaw = start['yaw'] if start else 0.0
    x0 = np.concatenate([rot, [yaw, height / 1.78, 1.0, float(xs.mean()), float(ys.max()) + 1.0]])
    steps = np.concatenate([np.concatenate([[lim / 3] * 3 for lim in JOINTS.values()]), [15.0, 4.0, 0.06, 3.0, 2.0]])

    def score(z):
        x = x0 + z * steps
        got = silhouette(cloud, x, gear)
        iou = (got & want).sum() / max(1, (got | want).sum())
        reg = 0.002 * float(((z[:n]) ** 2).sum())
        return -(iou - reg), iou
    es = cma.CMAEvolutionStrategy(np.zeros(len(x0)), 0.5, {'popsize': 16, 'maxfevals': iters, 'verbose': -9,
                                                            'seed': seed, 'tolfun': 1e-6})
    best = (np.inf, 0.0, np.zeros(len(x0)))
    while not es.stop():
        zs = es.ask()
        vals = []
        for z in zs:
            v, iou = score(np.asarray(z))
            vals.append(v)
            if v < best[0]:
                best = (v, iou, np.asarray(z))
        es.tell(zs, vals)
    x = x0 + best[2] * steps
    pose, k, kx, cx, cy = pose_of(x)
    return {'rot': {j: [round(float(a), 3) for a in pose.rot[j]] for j in JOINTS}, 'yaw': round(pose.yaw, 3),
            'scale': round(k, 4), 'width': round(kx, 4), 'root': [round(cx, 3), round(cy, 3)],
            'iou': round(float(best[1]), 4)}


def boxes(ref):
    """Each armour archive's records' sizes (the doll squeezes a bigger picture into them): archive -> record ->
    [width, height]."""
    return {str(FIRST[g] + m): {k: [r['width'], r['height']] for k, r in ref[str(FIRST[g] + m)].items()}
            for g in FIRST for m in range(4)}


def fit_all(ref_path, keys, iters, init=None):
    ref = json.load(open(ref_path))
    spec = json.load(open(SPEC)) if os.path.exists(SPEC) else {}
    spec['boxes'] = boxes(ref)
    for key in keys:
        spec[key] = fit_body(key, ref, iters, start=spec.get(init) if init else None)
        print(key, 'iou', spec[key]['iou'], flush=True)
        with open(SPEC, 'w') as fh:
            json.dump(spec, fh, indent=1)
            fh.write('\n')
    return spec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True)
    ap.add_argument('--fit', action='store_true')
    ap.add_argument('--bodies', default=','.join(BODIES))
    ap.add_argument('--iters', type=int, default=3000)
    ap.add_argument('--init', default='', help='begin each pose from this body\'s fit (`male:0`)')
    ap.add_argument('--out', default='')
    ap.add_argument('--sets', default='')
    ap.add_argument('--samples', type=int, default=24)
    args = ap.parse_args()
    keys = [k for k in args.bodies.split(',') if k]
    if args.fit:
        fit_all(args.ref, keys, args.iters, args.init or None)
    if args.out:
        import dollarmourrender
        dollarmourrender.render_all(args.out, json.load(open(args.ref)), json.load(open(SPEC)), keys,
                                    [s for s in args.sets.split(',') if s], args.samples)


if __name__ == '__main__':
    main()
