"""Fit each frame of a creature's archive to the classic record it stands in for: the frame's keyed pose is adjusted
(joint angles, the body's turn, its height off its soles) until the forge's beast, seen as the camera sees it, covers
the record's outline and its colour classes (the creature's own: the rat's red eyes and white teeth) best.

    python -I tools/sprite-forge/beasts/beastfit.py --spec tools/sprite-forge/beasts/specs/255.json \\
        --ref /tmp/forge-ref-255.json [--records 0,5] [--iters 220] [--shape]

The reference (reference.mjs) stays outside the repo; only the adjustments are written, beside the spec as
<spec>-fit.json (or the proportions as <spec>-shape.json). The beast is laid on the work frame by fit.py's raster: a
pixel shows the nearest surface over its centre, as Cycles samples it."""
import argparse
import json
import multiprocessing
import os
import sys

# the fit runs a process a core: a BLAS pool in each would put four threads on every core, spinning against each other
os.environ.setdefault('OPENBLAS_NUM_THREADS', '1')
os.environ.setdefault('OMP_NUM_THREADS', '1')

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]

import numpy as np  # noqa: E402

import beastforge  # noqa: E402
import beastshape  # noqa: E402
import fit  # noqa: E402
import stage  # noqa: E402

REG = 0.0004      # the pull of a frame's adjustments back toward its keys
# the pull of a frame's adjustments toward the frame before it, so a walk does not jitter frame to frame; the body's
# turn and lift are pulled harder, since Daggerfall's turned a record's frames as one
SMOOTH = 0.002
SMOOTH_WHOLE = 10.0
BOUNDS = {'turn': 60.0, 'rot': 70.0, 'lift': 0.2}   # past these the fit pays, so a fit cannot fold a limb through itself
SCALARS = ('turn', 'lift')
RESTARTS = 1


def material_ids(beast):
    """Classify a material by its index among the beast's materials, sorted: the grade's map (forge.grade_frame)."""
    names = sorted(beast.M)
    ids = {n: i + 1 for i, n in enumerate(names)}
    fn = lambda m: ids.get(m.name.split('.')[0], 0) if m else 0   # noqa: E731
    fn.names = names
    return fn


def class_of(beast):
    """Classify a material by its colour class in the reference (the creature's CLASS; else 1)."""
    cls = beast.kind.CLASS
    return lambda m: cls.get(m.name.split('.')[0], 1) if m else 1


class Cloud:
    """The beast's triangles, posed as beastforge poses its meshes and laid on the work frame. Each point keeps its
    skin weights, its shares of its skin's pieces and its feet on their axes, so `set_shape` lays proportions on as
    beastshape's Shaper does."""

    def __init__(self, beast, classify):
        import bpy
        self.names = getattr(classify, 'names', None)
        sh = beast.shaper
        sh.lay(beastshape.DEFAULT)   # every mesh at its unshaped rest: shapes are laid on from it
        self.skins = []
        for sk, rest, frames in zip(beast.skins, sh.rest, sh.frames):
            nw, na = sk.w.shape[1], sk.alpha.shape[1]
            co, tris, cls, ex = fit.triangles(sk.me, classify, np.hstack([sk.w, sk.alpha, frames]))
            w, alpha, fr = ex[:, :nw], ex[:, nw:nw + na], ex[:, nw + na:]
            live = np.nonzero(w.max(axis=0) > 0)[0]
            self.skins.append({'co': co, 'rest': co, 'tris': tris, 'cls': cls, 'w': w[:, live],
                               'joints': [sk.joints[k] for k in live], 'heads': sk.heads[live], 'alpha': alpha,
                               'frames': fr, 'pieces': sk.pieces})
        dg = bpy.context.evaluated_depsgraph_get()
        rides = {id(ob): (head, pieces) for ob, head, _, _, _, pieces in sh.rigid}
        self.parts = []
        for ob, j in beast.parts:
            me = ob.evaluated_get(dg).to_mesh()
            co, tris, cls, _ = fit.triangles(me, classify)
            part = {'co': co, 'rest': co, 'tris': tris, 'cls': cls, 'joint': j}
            if id(ob) in rides:   # its points back to unshaped rest space, and their feet on the piece it rides
                head, pieces = rides[id(ob)]
                base = co + head
                k = next(i for i, pc in enumerate(pieces) if pc.name == ob['rides'])
                alpha = np.zeros((len(co), len(pieces)))
                alpha[:, k] = 1.0
                part.update(base=base, head=head, alpha=alpha, pieces=pieces,
                            frames=np.hstack([beastshape.frame_of(base, pc) for pc in pieces]))
            self.parts.append(part)
        sh.lay(beastshape.SHAPE)
        self.scale = 1.0
        self.set_shape(beastshape.SHAPE)

    def set_shape(self, S):
        for sk in self.skins:
            sk['co'] = beastshape.move(sk['rest'], sk['alpha'], sk['frames'], sk['pieces'], S)
        for pc in self.parts:
            if 'base' in pc:
                pc['co'] = beastshape.move(pc['base'], pc['alpha'], pc['frames'], pc['pieces'], S) - pc['head']
        self.scale = S['scale']

    def mesh(self, pose):
        W = {j: np.array(m) for j, m in pose.world().items()}
        verts, tris, cls, base = [], [], [], 0
        for sk in self.skins:
            p = np.zeros_like(sk['co'])
            for k, j in enumerate(sk['joints']):
                M = W[j]
                p += sk['w'][:, k:k + 1] * ((sk['co'] - sk['heads'][k]) @ M[:3, :3].T + M[:3, 3])
            verts.append(p)
            tris.append(sk['tris'] + base)
            cls.append(sk['cls'])
            base += len(p)
        for pc in self.parts:
            M = W[pc['joint']]
            verts.append(pc['co'] @ M[:3, :3].T + M[:3, 3])
            tris.append(pc['tris'] + base)
            cls.append(pc['cls'])
            base += len(pc['co'])
        return np.concatenate(verts), np.concatenate(tris), np.concatenate(cls)

    def image(self, pose):
        v, t, c = self.mesh(pose)
        px, py, depth = fit.project(v, self.scale)
        return fit.rasterize(px, py, depth, t, c, stage.WORK_W, stage.WORK_H)


def params_of(beast, rec):
    """What a frame of record `rec` may adjust: (kind, joint, axis, step). In a creature's SYMMETRIC views (the front
    and the back, where Daggerfall drew it as a mirror image of itself), an animation its MIRRORED table holds takes
    that table, and no turn."""
    kind = beast.kind
    if rec.get('view') in getattr(kind, 'SYMMETRIC', ()) and rec['anim'] in getattr(kind, 'MIRRORED', {}):
        return [('lift', None, 0, 0.015)] + [('rot', j, a, st) for j, a, st in kind.MIRRORED[rec['anim']]]
    return [('turn', None, 0, 6.0), ('lift', None, 0, 0.015)] + [('rot', j, a, st) for j, a, st in kind.PARAMS[rec['anim']]]


def pair(left, right):
    """A parameter's joint name for a mirrored pair: one value turns both, the right's turns across and about the
    upright mirrored, so a left wing and a right one beat as one and a front or back view stays symmetric."""
    return f'{left}|{right}'


def adj_of(params, x):
    adj = {}
    for (kind, joint, axis, _), v in zip(params, x):
        if kind in SCALARS:
            adj[kind] = float(v)
        elif '|' in joint:
            left, right = joint.split('|')
            adj.setdefault('rot', {}).setdefault(left, [0.0, 0.0, 0.0])[axis] = float(v)
            adj['rot'].setdefault(right, [0.0, 0.0, 0.0])[axis] = float(v) * (1.0 if axis == 0 else -1.0)
        else:
            adj.setdefault('rot', {}).setdefault(joint, [0.0, 0.0, 0.0])[axis] = float(v)
    return adj


def vector_of(params, adj):
    return np.array([adj.get(kind, 0.0) if kind in SCALARS else
                     adj.get('rot', {}).get(joint.split('|')[0], [0, 0, 0])[axis]
                     for kind, joint, axis, _ in params], dtype=np.float64)


def past_bounds(adj):
    out = 0.0
    for kind, bound in BOUNDS.items():
        v = adj.get(kind)
        if v is None:
            continue
        vals = [a for r in v.values() for a in r] if kind == 'rot' else [v]
        over = sum(max(0.0, abs(a) - bound) for a in vals)
        out += over / 100.0 if kind in ('turn', 'rot') else over
    return out


def weights(classes):
    """The score's weights: the outline most, each colour class the creature names a share."""
    return {'sil': 0.7, **{c: 0.15 for c in classes}}


def score(img, ref, classes, outside=0):
    total, wsum = 0.0, 0.0
    for key, w in weights(classes).items():
        if key == 'sil':
            v = fit.iou(img > 0, ref > 0, outside)
        else:
            a, b = img == key, ref == key
            v = fit.iou(a, b) if b.sum() >= 3 else None   # a class the frame barely shows says nothing
        if v is not None:
            total += w * v
            wsum += w
    return total / wsum


def flies(beast):
    """Whether a creature flies (its module's FLIES): its body hovers at one place while its wings sweep, so its place
    is fitted in both axes and never stood on the canvas's last row."""
    return bool(getattr(beast.kind, 'FLIES', False))


def placed(work, rec, ref, place_x, beast, place_y=None):
    """A work frame's score cut to its record at `place_x` (and `place_y`, or with its feet on the reference's lowest
    row); what falls past the canvas counts against it."""
    if place_y is None:
        low = int(np.nonzero(ref.any(axis=1))[0].max())
        place_y = low - fit.lowest(work) + stage.ROOT_PX[1]
    img = fit.crop(work, rec['canvas'], (place_x, place_y))
    return score(img, ref, beast.kind.CLASS.values(), int((work > 0).sum() - (img > 0).sum()))


def evaluate_at(cloud, rec, f, ref, place_x, adj, beast, place_y=None):
    """A frame's score under adjustment `adj`."""
    return placed(cloud.image(beast.pose(rec, f, adj)), rec, ref, place_x, beast, place_y)


def fit_frame(cloud, beast, rec, f, ref, place, dx_free, iters, rng, init=None, prev=None):
    """A frame's adjustment, and its place: (adjustment, (column, row or None), first score, best). With `dx_free`
    the place moves across (and for a flyer up and down too); a flyer's other frames keep its row. `prev` is the frame
    before's fitted adjustment, which this one is pulled toward (SMOOTH)."""
    import cma
    params = params_of(beast, rec)
    hover = flies(beast)
    free = (1 + hover) if dx_free else 0
    steps = np.array([p[3] for p in params] + [2.0] * free)
    n = len(params)
    near = None if prev is None else vector_of(params, prev)
    pull = np.array([SMOOTH_WHOLE if p[0] in SCALARS else 1.0 for p in params]) * SMOOTH

    def value(x):
        adj = adj_of(params, x[:n])
        px = place[0] + (int(round(x[n])) if free else 0)
        py = (place[1] + (int(round(x[n + 1])) if free > 1 else 0)) if hover else None
        reg = REG * float(((x[:n] / steps[:n]) ** 2).sum()) + 2.0 * past_bounds(adj)
        if near is not None:
            reg += float((pull * ((x[:n] - near) / steps[:n]) ** 2).sum())
        return evaluate_at(cloud, rec, f, ref, px, adj, beast, py) - reg, (px, py)

    x0 = np.zeros(len(steps))
    if init:
        x0[:n] = vector_of(params, init)
    best, best_at = value(x0)
    first, xbest = best, x0.copy()
    starts = [(x0.copy(), 0.6)] + ([(np.zeros(len(steps)), 0.8)] if init else [])
    starts += [(None, 0.5)] * max(0, RESTARTS - len(starts))
    for start, sigma in starts[:max(RESTARTS, 1)]:
        start = xbest.copy() if start is None else start
        es = cma.CMAEvolutionStrategy(np.zeros(len(steps)), sigma, {
            'popsize': 14, 'maxfevals': iters * 14, 'verbose': -9, 'seed': int(rng.integers(1, 2 ** 31)),
            'tolfun': 1e-5})
        while not es.stop():
            zs = es.ask()
            vals = []
            for z in zs:
                x = start + np.asarray(z) * steps
                v, at = value(x)
                vals.append(-v)
                if v > best:
                    best, best_at, xbest = v, at, x
            es.tell(zs, vals)
    return adj_of(params, xbest[:n]), best_at, first, best


_JOB = {}


def _fit_record(r):
    cloud, beast, spec, refs, iters = (_JOB[k] for k in ('cloud', 'beast', 'spec', 'refs', 'iters'))
    rec = spec['records'][r]
    stage.PX_PER_M = beastforge.density(rec)   # the cloud's scale is the fitted size on screen
    rng = np.random.default_rng(11 + r)
    place, adjs, lines = list(rec['place']), {}, []
    for f in range(rec['frames']):
        key = beastforge.key_of(rec, f)
        prev = adjs.get(beastforge.key_of(rec, f - 1)) if f else None
        adj, (px, py), first, best = fit_frame(cloud, beast, rec, f, refs[r][f], place, f == 0, iters, rng,
                                               beastforge.FIT.get(key), prev)
        if f == 0:
            place[0] = px
            if py is not None:
                place[1] = py
        adjs[key] = adj
        lines.append(f'record {r} frame {f}: {first:.3f} -> {best:.3f}')
    if not flies(beast):
        place[1] = settled(cloud, beast, rec, adjs)
    return r, adjs, place, lines


def settled(cloud, beast, rec, adjs=None):
    """The place's row that stands the record's lowest frame on the canvas's last row, as every classic record's
    feet are: its frames share one place, so the others stand as high as their poses lift them."""
    adjs = adjs or {}
    low = max(fit.lowest(cloud.image(beast.pose(rec, f, adjs.get(beastforge.key_of(rec, f)))))
              for f in range(rec['frames']))
    return rec['canvas'][1] - 1 - (low - stage.ROOT_PX[1])


SHAPE_SLIDE = 3   # pixels a record's place may slide either way while its proportions are fitted


def frame_value(cloud, beast, rec, f, ref):
    """A frame's score in its fitted pose, the best of the places within SHAPE_SLIDE of its own: a size on screen
    grows from the ground under the creature, so its place moves with it."""
    stage.PX_PER_M = beastforge.density(rec)
    work = cloud.image(beast.pose(rec, f))
    slide = range(-SHAPE_SLIDE, SHAPE_SLIDE + 1)
    x, y = rec['place']
    if flies(beast):   # it hovers: its place slides both ways
        return max(placed(work, rec, ref, x + dx, beast, y + dy) for dx in slide for dy in slide)
    return max(placed(work, rec, ref, x + d, beast) for d in slide)


def _shape_of(x):
    S, i = dict(beastshape.SHAPE), 0
    for k in _JOB['keys']:
        n = len(_JOB['defaults'][k]) if isinstance(_JOB['defaults'][k], list) else 0
        S[k] = [float(v) for v in x[i:i + n]] if n else float(x[i])
        i += n or 1
    return S


# A girth or a size past these is the fit buying pixels a pose should earn: a thin creature's frames, its limbs keyed
# off Daggerfall's, are covered best by a body blown up to fill them. Past them each unit costs SHAPE_PULL of score.
SHAPE_BOUNDS = (0.75, 1.35)
SHAPE_PULL = 1.0


def shape_past_bounds(S):
    """How far a shape table's factors go past SHAPE_BOUNDS, summed (the size on screen and the elevation are free)."""
    lo, hi = SHAPE_BOUNDS
    out = 0.0
    for k in _JOB['keys']:
        if k in ('scale', 'elevation'):
            continue
        for v in np.atleast_1d(S[k]):
            out += max(0.0, lo - v) + max(0.0, v - hi)
    return out


def _shape_value(x):
    cloud = _JOB['cloud']
    S = _shape_of(x)
    cloud.set_shape(S)
    stage.ELEVATION = S.get('elevation', stage.ELEVATION)
    mean = float(np.mean([frame_value(cloud, _JOB['beast'], rec, f, ref) for rec, f, ref in _JOB['frames']]))
    return mean - SHAPE_PULL * shape_past_bounds(S)


def fit_shape(cloud, beast, spec, refs, iters, keys=None, records=None):
    import cma
    defaults = beastshape.defaults(beast)
    keys = keys or list(defaults)
    steps, base = [], []
    for k in keys:
        v = beastshape.SHAPE.get(k, defaults[k])
        if isinstance(defaults[k], list):
            steps += [0.05] * len(defaults[k])
            base += list(v)
        else:
            steps.append({'scale': 0.03, 'elevation': 2.0}.get(k, 0.07))
            base.append(v)
    steps, base = np.array(steps), np.array(base, dtype=np.float64)
    frames = [(rec, f, refs[r][f]) for r, rec in enumerate(spec['records']) for f in range(rec['frames'])
              if not records or r in records]
    _JOB.update(keys=keys, defaults=defaults, frames=frames)
    first = _shape_value(base)
    x, best = base.copy(), first
    es = cma.CMAEvolutionStrategy(np.zeros(len(base)), 0.5, {'popsize': 16, 'maxiter': iters, 'verbose': -9,
                                                              'seed': 3})
    with multiprocessing.get_context('fork').Pool(4) as pool:
        i = 0
        while not es.stop():
            zs = es.ask()
            cands = [base + np.asarray(z) * steps for z in zs]
            vals = pool.map(_shape_value, cands)
            es.tell(zs, [-v for v in vals])
            k = int(np.argmax(vals))
            if vals[k] > best:
                x, best = cands[k], vals[k]
            print(f'shape {i}: {best:.4f}', flush=True)
            i += 1
    print(f'shape: {first:.4f} -> {best:.4f}', flush=True)
    return _shape_of(x)


def reference(ref, beast):
    """The reference's frames as class images: 0 clear, else the creature's colour class of each texel."""
    out = []
    for r in ref['records']:
        cw, ch = r['canvas']
        imgs = []
        for fr, h in zip(r['frames'], r['rgb']):
            on = np.array([c != '0' for c in fr]).reshape(ch, cw)
            rgb = np.frombuffer(bytes.fromhex(h), dtype=np.uint8).reshape(ch, cw, 3)
            imgs.append(np.where(on, beast.kind.ref_class(rgb), 0).astype(np.int8))
        out.append(imgs)
    return out


def main():
    global REG, RESTARTS
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--ref', required=True)
    ap.add_argument('--records', default='')
    ap.add_argument('--iters', type=int, default=220)
    ap.add_argument('--shape', action='store_true', help='fit the proportions instead of the poses')
    ap.add_argument('--keys', default='', help='with --shape, only these proportions (comma-separated)')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--restarts', type=int, default=1)
    ap.add_argument('--reg', type=float, default=REG)
    ap.add_argument('--settle', action='store_true', help="only stand each record's lowest frame on its last row")
    args = ap.parse_args()
    REG, RESTARTS = args.reg, args.restarts
    spec = beastforge.read_spec(args.spec, fitting=True)[0]
    beastforge.load_tables(args.spec)
    beast = beastforge.setup(spec, 1)
    # a triangle is split until no edge spans two pixels at the densest record the archive draws
    fit.MAX_EDGE = 1.8 / (max(beastforge.density(rec) for rec in spec['records']) * beastshape.SHAPE['scale'] * 1.15)
    cloud = Cloud(beast, class_of(beast))
    refs = reference(json.load(open(args.ref)), beast)
    only = {int(r) for r in args.records.split(',') if r != ''}
    _JOB.update(cloud=cloud, beast=beast, spec=spec, refs=refs, iters=args.iters)
    if args.settle:
        import forge
        for r, rec in enumerate(spec['records']):
            if flies(beast):
                break
            stage.PX_PER_M = beastforge.density(rec)
            rec['place'][1] = settled(cloud, beast, rec)
        forge.write_spec(args.spec, spec)
        return
    if args.shape:
        S = dict(beastshape.defaults(beast))
        S.update(beastshape.SHAPE)
        S.update(fit_shape(cloud, beast, spec, refs, args.iters, [k for k in args.keys.split(',') if k], only))
        beastshape.write_shape(args.spec.replace('.json', '-shape.json'), S)
        return
    import forge
    out_path = args.spec.replace('.json', '-fit.json')
    fitted = dict(beastforge.FIT)
    todo = [r for r in range(len(spec['records'])) if not only or r in only]
    with multiprocessing.get_context('fork').Pool(args.jobs) as pool:
        for r, adjs, place, lines in pool.imap_unordered(_fit_record, todo):
            spec['records'][r]['place'] = place
            fitted.update(adjs)
            print('\n'.join(lines), flush=True)
            fit.write_fit(out_path, fitted)
            forge.write_spec(args.spec, spec)   # each record's place kept as it lands, as its poses are


if __name__ == '__main__':
    main()
