"""Fit what the left hand holds (the torch, fptorch.py; the shields, fpshield.py) to the picture the game drew there
before: the mod's own sprite, read from the repo (vendor/), so the forge's frame stands where the mod's stood and the
mod's placement draws it unchanged. Only the outline is fitted, and the glove and the sleeve inside it: the flame (above
a record's `flame_cut`) is drawn from numbers, never fitted.

    python -I tools/sprite-forge/fpheldfit.py --spec tools/sprite-forge/specs/TORCH.json [--records 0] [--frames 0]
        [--iters 300] [--restarts 2] [--shape] [--report]

A record's frames are fitted to its `pictures` (one a frame) or its one `picture`. Writes the poses beside the spec
(`<spec>-fit.json`); `--shape` fits the arm's and the held thing's sizes over every frame in its pose."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fpforge  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
STEPS = np.array([6.0, 6.0, 0.05, 6.0, 6.0, 12.0])   # base u, v (px), depth (m), far end u, v (px), roll (degrees)
# the outline, the glove (leather), the sleeve (grey), the held metal: a spec may weigh its own (`weights`)
DEFAULT_WEIGHTS = {'sil': 0.6, 6: 0.25, 5: 0.15, 7: 0.25}
WEIGHTS = dict(DEFAULT_WEIGHTS)
OUTSIDE = 1.0   # what a texel drawn past the canvas costs, against one missed inside it
# a material's class as the picture reads its colours: the glove's leather 6, the sleeve's grey cloth 5, the held
# thing's metal 7 (the torch's cage, a shield's rim), the torch's handle 8, a shield's fittings 9, the rest 1. A spec
# may class its own (`classes`: a shield's glove is drawn in its boards' browns, so it reads as them)
CLASS = {'gauntlet': 6, 'linen': 5, 'cage': 7, 'rim': 7, 'handle': 8, 'rivet': 9, 'grip': 9}
BASE_CLASS = dict(CLASS)


def picture(path):
    """A sprite's texels, RGBA rows top first, from the repo."""
    from PIL import Image
    return np.asarray(Image.open(os.path.join(ROOT, path)).convert('RGBA')).astype(np.int64)


def picture_classes(path):
    """A sprite's texels as classes: 0 clear, 6 leather (warmer than grey by a fifth of its red), else 5; as
    reference.mjs reads a painting. Gives (classes, rgba)."""
    a = picture(path)
    r, b, al = a[..., 0], a[..., 2], a[..., 3]
    cls = np.where(al < 128, 0, np.where(r - b > np.maximum(0.2 * r, 8), 6, 5)).astype(np.int8)
    return cls, a


def grey(a, tol=16):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (np.abs(r - g) < tol) & (np.abs(g - b) < tol)


def torch_classes(rec, a):
    """The torch hand's texels: its flame (above `flame_cut`, the fit's own, 0 here), the cage's grey over the fist
    (`held_above`) 7, the handle between the cage and the fist (`handle_rows`) 8, the glove 6, the sleeve 5."""
    cls = np.where(a[..., 3] < 128, 0, np.where(grey(a), 5, 6)).astype(np.int8)
    above = rec.get('held_above')
    if above is not None:
        top = cls[:above]
        top[top == 5] = 7
        # neither drawn nor clear (-1): what the fit leaves alone
        top[top == 6] = -1   # the wrap's burning in the cage, the flame's colours: drawn, not fitted
    lo, hi = rec.get('handle_rows', (0, 0))
    band = cls[lo:hi]
    band[band > 0] = 8
    return cls


def shield_classes(rec, a, f):
    """A shield's texels: its rim 7 (what a picture of another material group draws apart, `rim_from`), its sleeve 5
    and its fittings 9 (the metal band, exactly grey: the sleeve its region reaching in from the canvas's edge, the
    fittings the bolts and mounts), the rest 1. The mod paints in Daggerfall's palette, its glove's shading in near
    greys: only the band is exactly grey."""
    from scipy import ndimage as ndi
    on = a[..., 3] >= 128
    cls = np.where(on, 1, 0).astype(np.int8)
    other = picture(rec['rim_from'][f])
    rim = on & (np.abs(other - a).sum(axis=-1) > 0)
    exact = (a[..., 0] == a[..., 1]) & (a[..., 1] == a[..., 2]) & (a[..., :3].mean(axis=-1) >= 45)
    g = on & exact & ~rim
    lab, n = ndi.label(g)
    h, w = g.shape
    edge = set(np.unique(np.concatenate([lab[-1], lab[:, 0]]))) - {0}   # the arm comes in from the foot or the left
    sizes = ndi.sum(g, lab, range(1, n + 1))
    sleeve = np.isin(lab, [k for k in edge if sizes[k - 1] > 150])
    cls[g] = 9
    cls[sleeve] = 5
    cls[rim] = 7
    return cls


def shifted(rec, img, clear):
    """A picture as the fit reads it: moved `shift` texels across (the record's), the columns it leaves `clear`. A
    torch painted against the canvas's right edge is fitted clear of it, so its flame is not cut there."""
    dx = int((rec.get('shift') or (0, 0))[0])
    if not dx:
        return img
    out = np.roll(img, dx, axis=1)
    if dx < 0:
        out[:, dx:] = clear
    else:
        out[:, :dx] = clear
    return out


class Target:
    """One frame's picture on the whole screen: its classes, its colours, and which texels its canvas covers."""

    def __init__(self, rec, path, f=0):
        x, y, cw, ch = fpforge.rect(rec)
        a = picture(path)
        kind = rec.get('read')   # how the picture is read: a torch's, a shield's, or a painting's
        cls = (torch_classes(rec, a) if kind == 'torch' else shield_classes(rec, a, f) if kind == 'shield'
               else picture_classes(path)[0])
        cls, a = shifted(rec, cls, 0), shifted(rec, a, 0)
        cut = rec.get('flame_cut')
        if cut is not None:   # the flame is drawn, not fitted: the canvas starts below it
            cls[:cut] = 0
        if kind is None and rec.get('held_above') is not None:   # grey over the hand is the held thing's metal
            top = cls[:rec['held_above']]
            top[top == 5] = 7
        # a record's bolts and its upright stand are its first frame's: the lowered frames follow it
        self.keys = {k: v for k, v in (rec.get('keys') or {}).items() if f == 0 or k not in ('handle', 'strap', 'up')} or None
        self.ref = np.zeros((fpstage.H, fpstage.W), np.int8)
        self.rgb = np.zeros((fpstage.H, fpstage.W, 3), np.int64)
        self.canvas = np.zeros((fpstage.H, fpstage.W), bool)
        top = y + (cut or 0)
        self.ref[y:y + ch, x:x + cw] = np.maximum(cls, 0)
        self.rgb[y:y + ch, x:x + cw] = a[..., :3]
        self.canvas[top:y + ch, x:x + cw] = True
        self.canvas[y:y + ch, x:x + cw] &= cls >= 0   # what is neither drawn nor clear counts for nothing
        self.ignore = np.zeros_like(self.canvas)
        self.ignore[y:y + ch, x:x + cw] = cls < 0
        edge = rec.get('margin', 0)   # texels by the right edge, where a sprite drawn mid-screen is cut flat: kept clear
        if edge:
            self.canvas[y:y + ch, x + cw - edge:x + cw] = False
            self.ref[y:y + ch, x + cw - edge:x + cw] = 0
            self.ignore[y:y + ch, x + cw - edge:x + cw] = False
        self.bolts = []   # a shield's bolts on the screen: its fittings' blobs (class 9), each a bolt's size
        if kind == 'shield':
            from scipy import ndimage as ndi
            lab, n = ndi.label(cls == 9)
            for k in range(1, n + 1):
                ys, xs = np.nonzero(lab == k)
                if 15 <= len(ys) <= 120:
                    self.bolts.append((float(xs.mean()) + x, float(ys.mean()) + y))


class Raster:
    """The part's triangles, classed, posed and laid on the screen as Cycles samples it (fpstage.raster)."""

    def __init__(self, weapon, part, held, foot, left=0.0):
        self.weapon, self.part, self.held = weapon, part, held
        self.foot, self.left = foot, left   # the canvas's foot and left edge on the screen: the arm leads off past them
        self.reshape()

    def reshape(self):
        names = fpmodel.WEAPONS[self.weapon]['mats']
        ids = {n: k + 1 for k, n in enumerate(names)}
        v, t, c = fpmodel.triangles(self.weapon, ids, None, self.part)
        self.v, self.t = v, t
        self.cls = np.array([0] + [CLASS.get(n, 1) for n in names], np.int8)[c]

    def classes(self, pose):
        S = fpmodel.SHAPE
        v = fpmodel.posed(self.weapon, self.part, self.v, pose, S)
        M, short = fpstage.pose_matrix(pose, S, fpmodel.length(self.weapon, S, self.part))
        M = np.diag([1.0, 1.0, S['aspect'], 1.0]) @ M
        P = v @ M[:3, :3].T + M[:3, 3]
        tri = fpstage.raster(*fpstage.project(P, S), self.t)
        return np.where(tri >= 0, self.cls[np.maximum(tri, 0)], 0), short


def iou(a, b, outside=0):
    u = (a | b).sum() + outside
    return (a & b).sum() / u if u else None


def score(img, tg):
    inside = img * tg.canvas
    outside = int(((img > 0) & ~tg.canvas & ~tg.ignore).sum() * OUTSIDE)
    total, wsum = 0.0, 0.0
    for key, w in WEIGHTS.items():
        if key == 'sil':
            v = iou(inside > 0, tg.ref * tg.canvas > 0, outside)
        else:
            v = iou(inside == key, (tg.ref == key) & tg.canvas)
        if v is not None:
            total, wsum = total + w * v, wsum + w
    return total / wsum if wsum else 0.0


def pose_of(x, joints):
    p = {'base': [float(x[0]), float(x[1])], 'depth': float(x[2]), 'tip': [float(x[3]), float(x[4])],
         'roll': float((x[5] + 180.0) % 360.0 - 180.0)}
    for j, v in zip(joints, x[6:]):
        p[j[0]] = float(np.clip(v, *j[2]))
    return p


def vector_of(p, joints):
    return np.array([*p['base'], p['depth'], *p['tip'], p.get('roll', 0.0), *(p.get(j[0], j[4]) for j in joints)])


REACH_OUT = 0.12   # metres the wrist must lie deeper than the elbow: the arm reaches out from the eye
ELBOW_LOW = 0.0    # and the elbow comes up from below the canvas's foot, as an arm held out before the eye does
ARM_PULL = 4.0     # score lost a metre (and a hundred pixels) past either


BOLT_REACH = 25.0   # pixels from where the frame before puts a fitting, moved with the picture, the mod's bolt may stand


def picture_shift(before, after, reach=60):
    """How far the mod's picture moved from one frame to the next, (dx, dy) pixels: the shift that best lays the frame
    before's classes on this one's."""
    best, at = -1.0, (0, 0)
    for dy in range(-reach, reach + 1, 2):
        for dx in range(-reach, reach + 1, 2):
            a = np.roll(np.roll(before, dy, axis=0), dx, axis=1)
            same = ((a == after) & (after > 0)).sum()
            if same > best:
                best, at = same, (dx, dy)
    return at


def frame_bolts(spec, part, held, prev, bolts, shift=(0, 0)):
    """A lowered frame's own bolt keys: each of the shield's fittings where the frame before puts it, moved as the mod's
    picture moved (`shift`), matched one to one to the mod's nearest bolts within BOLT_REACH (none where the mod's has
    left the canvas)."""
    S = fpmodel.SHAPE
    held.use_kind(part)
    M, _ = fpstage.pose_matrix(prev, S, fpmodel.length(spec['weapon'], S, part))
    B = np.asarray(bolts, float)
    names, preds = [], []
    for name, pts in held.marks(S, part).items():
        if name != 'handle':   # the handle's broad bolts alone: a strap's rivets by a canvas's edge are too easily another's
            continue
        P = np.array([M[:3, :3] @ q + M[:3, 3] for q in pts])
        u, v, _ = fpstage.project(P, S)
        for i, q in enumerate(np.stack([u, v], axis=1)):
            names.append((name, i))
            preds.append(q + np.asarray(shift, float))
    D = np.linalg.norm(np.asarray(preds)[:, None] - B[None], axis=2) if len(B) else np.zeros((len(preds), 0))
    taken, found = set(), {}
    for flat in np.argsort(D, axis=None):   # nearest pairs first, each bolt and each fitting once
        i, j = np.unravel_index(flat, D.shape)
        if D[i, j] >= BOLT_REACH:
            break
        if i in found or j in taken:
            continue
        found[i] = B[j].round(1).tolist()
        taken.add(j)
    out = {}
    for i, (name, k) in enumerate(names):
        out.setdefault(name, [None, None])[k] = found.get(i)
    return {n: v for n, v in out.items() if any(x is not None for x in v)}


def seed_of(tg):
    """A frame's first pose where its record names none: its root on the middle of the picture's outline, the axis
    up the screen, at arm's length."""
    ys, xs = np.nonzero(tg.ref * tg.canvas > 0)
    u, v = float(xs.mean()), float(ys.mean())
    return {'base': [u, v], 'depth': 0.85, 'tip': [u, v - 40.0], 'roll': 0.0}


def arm_cost(ras, pose):
    """What the arm's place costs: its elbow deeper than its wrist less REACH_OUT, or above the canvas's foot."""
    marks = getattr(ras.held, 'arm_marks', None)
    if not marks:
        return 0.0
    getattr(ras.held, 'use_kind', lambda kind: None)(ras.part)   # a shield's arm is its kind's
    S = fpmodel.SHAPE
    elbow, wrist = marks(S, pose, ras.held.held_radius(S), ras.held.OWN)
    M, _ = fpstage.pose_matrix(pose, S, fpmodel.length(ras.weapon, S, ras.part))
    e, w = M[:3, :3] @ elbow + M[:3, 3], M[:3, :3] @ wrist + M[:3, 3]
    cost = max(0.0, REACH_OUT - (w[1] - e[1]))
    # the upper arm leads off the screen: its shoulder end below the canvas's foot or past its left edge
    sh = ras.held.shoulder_mark(S, pose, ras.held.held_radius(S), ras.held.OWN)
    s = M[:3, :3] @ sh + M[:3, 3]
    su, sv, _ = fpstage.project(s[None], S)
    cost += min(max(0.0, ras.foot - float(sv[0])), max(0.0, float(su[0]) - ras.left)) / 100.0
    return ARM_PULL * cost


KEY_PULL = 0.004   # score lost a pixel a key's screen point is off
BACK_PULL = 0.3    # and for the back of the hand turned from the key's way (1 - the cosine)
AXIS_PULL = 1.5    # and for the held thing's axis and the forearm turned from theirs
MARK_PULL = 0.01   # and a pixel a shield's fitting stands off the mod's bolt


def key_cost(ras, pose, keys):
    """What a record's keys cost (`keys`): its root's and far end's screen points, its elbow's (off the canvas, as the
    arm's is), and the way the back of the hand faces in camera space."""
    if not keys:
        return 0.0
    cost = 0.0
    for name in ('base', 'tip'):
        if name in keys:
            cost += KEY_PULL * float(np.hypot(*(np.asarray(pose[name]) - keys[name])))
    S = fpmodel.SHAPE
    M, _ = fpstage.pose_matrix(pose, S, fpmodel.length(ras.weapon, S, ras.part))
    getattr(ras.held, 'use_kind', lambda kind: None)(ras.part)
    if 'elbow' in keys:
        elbow, _ = ras.held.arm_marks(S, pose, ras.held.held_radius(S), ras.held.OWN)
        u, v, _ = fpstage.project((M[:3, :3] @ elbow + M[:3, 3])[None], S)
        cost += KEY_PULL * float(np.hypot(u[0] - keys['elbow'][0], v[0] - keys['elbow'][1]))
    if 'axis' in keys:   # the held thing's axis in camera space: a torch stands near upright
        axis = M[:3, :3] @ np.array([0.0, 0.0, 1.0])
        want = np.asarray(keys['axis'], float)
        cost += AXIS_PULL * (1.0 - float(axis @ want / np.linalg.norm(want)))
    if 'forearm' in keys:   # the forearm's way from the elbow to the wrist: rising toward the hand
        elbow, wrist = ras.held.arm_marks(S, pose, ras.held.held_radius(S), ras.held.OWN)
        f = M[:3, :3] @ (wrist - elbow)
        want = np.asarray(keys['forearm'], float)
        cost += AXIS_PULL * (1.0 - float(f @ want / (np.linalg.norm(f) * np.linalg.norm(want))))
    if 'up' in keys and hasattr(ras.held, 'shield_up'):   # a shield's own up: its boards run up the screen
        up = M[:3, :3] @ ras.held.shield_up(S)
        want = np.asarray(keys['up'], float)
        cost += AXIS_PULL * (1.0 - float(up @ want / np.linalg.norm(want)))
    if hasattr(ras.held, 'marks') and ('handle' in keys or 'strap' in keys):   # a shield's fittings onto the mod's bolts
        got = ras.held.marks(S, ras.part)
        for name in ('handle', 'strap'):
            if name not in keys or name not in got:
                continue
            pts = np.array([M[:3, :3] @ q + M[:3, 3] for q in got[name]])
            u, v, _ = fpstage.project(pts, S)
            ours = np.stack([u, v], axis=1)
            want = [None if w is None else np.asarray(w, float) for w in keys[name]]

            def off(order):   # the mean distance over the bolts the mod shows (a lowered frame's may be off it)
                ds = [np.linalg.norm(o - w) for o, w in zip(order, want) if w is not None]
                return float(np.mean(ds)) if ds else 0.0
            d = off(ours)
            if name == 'strap':   # its two rivets either way round
                d = min(d, off(ours[::-1]))
            cost += MARK_PULL * d
    if 'back' in keys:
        back = M[:3, :3] @ ras.held.back_of_hand(S, pose, ras.held.held_radius(S))
        want = np.asarray(keys['back'], float)
        cost += BACK_PULL * (1.0 - float(back @ want / (np.linalg.norm(back) * np.linalg.norm(want))))
    return cost


def objective(ras, tg, joints, x):
    p = pose_of(x, joints)
    if not 0.05 < p['depth'] < 3.0:
        return 1.0
    img, short = ras.classes(p)
    return -(score(img, tg) - 2.0 * short - arm_cost(ras, p) - key_cost(ras, p, tg.keys))


def fit_frame(ras, tg, seed, joints, iters, restarts, turns=(0.0,)):
    """A frame's pose: settled from its seed turned each of `turns` about the held thing's axis (a round handle reads
    the same at any turn; only the arm tells them apart), then refined from the best `restarts` times."""
    import cma
    steps = np.append(STEPS, [j[1] for j in joints])
    best = None
    for k, turn in enumerate(turns):
        x0 = vector_of({**seed, 'roll': seed.get('roll', 0.0) + turn}, joints)
        es = cma.CMAEvolutionStrategy(x0 / steps, 1.0, {'maxiter': iters, 'verbose': -9, 'seed': 7 + k, 'popsize': 14})
        es.optimize(lambda z: objective(ras, tg, joints, np.asarray(z) * steps))
        x = np.asarray(es.result.xbest) * steps
        f = objective(ras, tg, joints, x)
        if best is None or f < best[0]:
            best = (f, x)
    for k in range(restarts):
        es = cma.CMAEvolutionStrategy(best[1] / steps, 0.5, {'maxiter': iters, 'verbose': -9, 'seed': 31 + k,
                                                             'popsize': 14})
        es.optimize(lambda z: objective(ras, tg, joints, np.asarray(z) * steps))
        x = np.asarray(es.result.xbest) * steps
        f = objective(ras, tg, joints, x)
        if f < best[0]:
            best = (f, x)
    return pose_of(best[1], joints), -best[0]


def frames_of(rec):
    """A record's frames to fit, each with its picture: one, if the record holds still (only what it holds moves)."""
    pics = rec.get('pictures') or [rec['picture']] * rec['frames']
    return list(enumerate(pics[:1] if rec.get('still') else pics))


def fit_shape(spec, keys, steps, bounds, iters, ras_for, targets):
    """The sizes in `keys` over every fitted frame in its pose."""
    import cma
    S0 = dict(fpmodel.SHAPE)
    x0 = np.array([S0[k] for k in keys])
    st = np.array([steps[k] for k in keys])

    def f(z):
        x = np.asarray(z) * st
        for k, v in zip(keys, x):
            fpmodel.SHAPE[k] = float(np.clip(v, *bounds[k]))
        total = 0.0
        for (r, part), tgs in targets.items():
            ras = ras_for(part)
            for fr, tg in tgs:
                pose = fpforge.FIT[f'{r}:{fr}']
                img, short = ras.classes(pose)
                total += score(img, tg) - 2.0 * short - arm_cost(ras, pose) - key_cost(ras, pose, tg.keys)
        return -total / sum(len(t) for t in targets.values())
    es = cma.CMAEvolutionStrategy(x0 / st, 0.5, {'maxiter': iters, 'verbose': -9, 'seed': 3, 'popsize': 12})
    es.optimize(f)
    best = np.asarray(es.result.xbest) * st
    for k, v in zip(keys, best):
        fpmodel.SHAPE[k] = float(np.clip(v, *bounds[k]))
    return -f(best / st)


def upright(spec, part, pose, held):
    """Turn a shield in its own plane (`<kind>_tilt`) so its up runs up the screen at `pose`: the silhouette of a round
    one is the same at any turn, its boards are not."""
    import math
    S = fpmodel.SHAPE
    M, _ = fpstage.pose_matrix(pose, S, fpmodel.length(spec['weapon'], S, part))
    key = f'{part}_tilt'
    S[key] = 0.0
    a = M[:3, :3] @ held.shield_up(S)   # the up at no turn, and a quarter turn on
    S[key] = 90.0
    b = M[:3, :3] @ held.shield_up(S)
    S[key] = math.degrees(math.atan2(float(b[2]), float(a[2])))
    print(part, 'turned', round(S[key], 1))


def grade(spec, base, held, targets, records=None):
    """Each material's colours onto the mod's picture's where both draw it, over every fitted frame: a grey one
    (fpforge.CLASSES 5: the band the game dyes) its brightness onto the picture's, share for share; any other its
    brightness so and then the colour the picture draws at that brightness (fpcolour.py's ramp). Written beside the
    spec as <spec>-grade.json, a material with too few texels left as it was."""
    import fparmour
    import fpcolour
    import fptorch
    fpmodel.palette = fptorch.with_torch(fpmodel.palette, held.palette)
    fpforge.CLASSES.update(fparmour.ARMOUR_CLASSES)
    eye = fpforge.Eye(spec, 64)
    for part in eye.obs:
        getattr(held, 'decorate', lambda *a: None)(eye, part, fpmodel.SHAPE)
    names = eye.names
    mine = {n: [] for n in names}
    theirs = {n: [] for n in names}
    for (r, part), tgs in targets.items():
        if records and r not in records:
            continue
        getattr(held, 'use_kind', lambda kind: None)(part)
        for f, tg in tgs:
            pose = fpforge.FIT[f'{r}:{f}']
            raw = eye.screen(pose, part, raw=True, record=r, frame=f)
            ids = eye.id_map(pose, part, record=r)
            drawn = (raw[..., 3] > 0) & tg.canvas
            for k, n in enumerate(names):
                both = drawn & (ids == k + 1) & (tg.ref == CLASS.get(n, 1))
                mine[n].append(raw[both][:, :3].astype(np.float64))
                theirs[n].append(tg.rgb[both].astype(np.float64))
    table = json.load(open(base + '-grade.json')) if os.path.exists(base + '-grade.json') else {}
    for n in names:
        if not mine[n]:
            continue
        ours, ref = np.concatenate(mine[n]), np.concatenate(theirs[n])
        if len(ours) < 40:
            continue
        lum, ref_lum = ours.mean(axis=1), ref.mean(axis=1)
        src, dst = fpcolour.rising(np.percentile(lum, fpcolour.GRADE_AT)), np.percentile(ref_lum, fpcolour.GRADE_AT)
        if fpforge.CLASSES.get(n) == 5:
            table[n] = {'lum': [src.round(2).tolist(), dst.round(1).tolist()]}
        else:
            bins = np.array_split(np.argsort(ref_lum), len(fpcolour.RAMP_AT))
            table[n] = {'ramp': [src.round(2).tolist(), dst.round(1).tolist(),
                                 [float(ref_lum[b].mean().round(1)) for b in bins],
                                 [ref[b].mean(axis=0).round(1).tolist() for b in bins]]}
        print(f'{n}: ours {ours.mean(axis=0).round()} the mod\'s {ref.mean(axis=0).round()} ({len(ours)} texels)')
    with open(base + '-grade.json', 'w') as fh:
        json.dump(table, fh, indent=1)
        fh.write('\n')


FLAME_MARGIN = 4   # texels the flame keeps from the canvas's top and right edges
FLAME_CUT = 4.0    # what each share of the flame past them costs, against its overlap with the mod's


def fit_flame(spec, base, iters):
    """The torch's flame onto the mod's, over all its frames: its height, width and root (`flame_h`, `flame_w`,
    `flame_up`) by how its outline overlaps the mod's flame each frame, then its colours, the mod's flame's brightness
    share for share and the colour it draws at each (the grade's `flame`). Each frame's flicker stays the forge's own."""
    import cma
    import fpcolour
    import fptorch
    S = fpmodel.SHAPE
    rec = spec['records'][0]
    x, y, cw, ch = fpforge.rect(rec)
    pose = fpforge.FIT['0:0']
    # the mod's flame over its cage (`flame_cut`): the coals glowing inside the cage are the cage's, not the flame's
    top = rec.get('flame_cut', rec['held_above'])
    mods = [shifted(rec, fptorch.mod_flame(picture(rec['picture'].replace('_0-0', f'_0-{f}')), top), False)
            for f in range(rec['frames'])]
    keys, steps = ('flame_h', 'flame_w', 'flame_up'), np.array([0.2, 0.15, 0.01])
    # a flame, not a sliver nor a blaze, rooted in the coals: never standing off them
    low, high = np.array([0.6, 0.4, -0.012]), np.array([4.0, 3.0, 0.0])
    # the canvas less a margin: a flame past it is cut flat on the screen, so none may reach it
    inside = np.zeros((fpstage.H, fpstage.W), bool)
    inside[y + FLAME_MARGIN:y + ch, x:x + cw - FLAME_MARGIN] = True

    def cost(z):
        for k, v in zip(keys, np.clip(np.asarray(z) * steps, low, high)):
            S[k] = float(v)
        root, width = fptorch.flame_root(S, pose)
        total = 0.0
        for f, mod in enumerate(mods):
            light, spark = fptorch.flame(fpstage.H, fpstage.W, root, width, f, S)
            lit = light > 0
            ours = lit[y:y + ch, x:x + cw].copy()
            ours[top:] = False   # inside the cage the fire is the cage's: only what rises out of it is the flame
            total += (ours & mod).sum() / max((ours | mod).sum(), 1)
            total -= FLAME_CUT * (lit & ~inside).sum() / max(lit.sum(), 1)
        return -total / len(mods)
    es = cma.CMAEvolutionStrategy(np.array([S[k] for k in keys]) / steps, 0.6,
                                  {'maxiter': iters, 'verbose': -9, 'seed': 5, 'popsize': 10})
    es.optimize(cost)
    got = -cost(es.result.xbest)
    fpmodel.write_shape(base + '-shape.json', S)
    # its colours: the flame's brightness over every frame onto the mod's, and the mod's colour at each
    root, width = fptorch.flame_root(S, pose)
    lights = np.concatenate([fptorch.flame(fpstage.H, fpstage.W, root, width, f, S)[0][y:y + ch, x:x + cw].ravel()
                             for f in range(len(mods))])
    lights = lights[lights > 0]
    px = np.concatenate([shifted(rec, picture(rec['picture'].replace('_0-0', f'_0-{f}')), 0)[mod][:, :3]
                         for f, mod in enumerate(mods)])
    ref_lum = px.mean(axis=1).astype(np.float64)
    bins = np.array_split(np.argsort(ref_lum), len(fpcolour.RAMP_AT))
    table = json.load(open(base + '-grade.json')) if os.path.exists(base + '-grade.json') else {}
    table['flame'] = {'ramp': [fpcolour.rising(np.percentile(lights, fpcolour.GRADE_AT) * 255).round(2).tolist(),
                               np.percentile(ref_lum, fpcolour.GRADE_AT).round(1).tolist(),
                               [float(ref_lum[b].mean().round(1)) for b in bins],
                               [px[b].mean(axis=0).round(1).tolist() for b in bins]]}
    table['flame']['ramp'][0] = [v / 255 for v in table['flame']['ramp'][0]]
    with open(base + '-grade.json', 'w') as fh:
        json.dump(table, fh, indent=1)
        fh.write('\n')
    print(f'flame {got:.3f}', {k: round(S[k], 4) for k in keys})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--records', default='')
    ap.add_argument('--frames', default='')
    ap.add_argument('--iters', type=int, default=200)
    ap.add_argument('--restarts', type=int, default=2)
    ap.add_argument('--shape', default='', help='comma-separated shape keys to fit over every frame')
    ap.add_argument('--report', action='store_true')
    ap.add_argument('--upright', action='store_true', help='turn each shield in its plane so it stands up the screen')
    ap.add_argument('--grade', action='store_true', help='grade each material\'s colours onto the mod\'s picture')
    ap.add_argument('--flame', action='store_true', help='fit the torch\'s flame to the mod\'s, its size and colours')
    ap.add_argument('--turns', type=float, nargs='*', help='seed turns about the held thing\'s axis (degrees)')
    args = ap.parse_args()
    spec = fpforge.load(args.spec)
    held = __import__(spec.get('module', 'fptorch'))
    fpforge.CLASSES.update(held.CLASSES)
    base = args.spec[:-len('.json')]
    only = {int(r) for r in args.records.split(',') if r}
    frames = {int(f) for f in args.frames.split(',') if f}
    rasters = {}

    WEIGHTS.clear()
    WEIGHTS.update({(int(k) if str(k).isdigit() else k): v for k, v in spec.get('weights', DEFAULT_WEIGHTS).items()})
    CLASS.clear()
    CLASS.update({**BASE_CLASS, **spec.get('classes', {})})
    foot = {fpforge.part_of(spec, rec): fpforge.rect(rec)[1] + fpforge.rect(rec)[3] for rec in spec['records']}
    left = {fpforge.part_of(spec, rec): fpforge.rect(rec)[0] for rec in spec['records']}

    def ras_for(part):
        if part not in rasters:
            rasters[part] = Raster(spec['weapon'], part, held, foot[part], left[part])
        return rasters[part]
    targets = {}
    for r, rec in enumerate(spec['records']):
        if 'mirror' in rec or (only and r not in only):
            continue
        part = fpforge.part_of(spec, rec)
        targets[(r, part)] = [(f, Target(rec, path, f)) for f, path in frames_of(rec) if not frames or f in frames]
    if args.report:
        for (r, part), tgs in targets.items():
            for f, tg in tgs:
                pose = fpforge.FIT[f'{r}:{f}']
                img, short = ras_for(part).classes(pose)
                print(f'{r}:{f} {score(img, tg):.3f} short {short:.3f} arm {arm_cost(ras_for(part), pose):.3f} '
                      f'keys {key_cost(ras_for(part), pose, tg.keys):.3f}')
        return
    if args.flame:
        fit_flame(spec, base, args.iters)
        return
    if args.grade:
        grade(spec, base, held, targets)
        return
    if args.upright:   # a round shield's turn in its own plane, so its boards run up the screen at frame 0
        for (r, part), _ in targets.items():
            if not hasattr(held, 'shield_up'):
                continue
            held.use_kind(part)
            upright(spec, part, fpforge.FIT[f'{r}:0'], held)
        fpmodel.write_shape(base + '-shape.json', fpmodel.SHAPE)
        return
    if args.shape:
        keys = [k for k in args.shape.split(',') if k]
        got = fit_shape(spec, keys, held.SHAPE_STEP, held.BOUNDS, args.iters, lambda p: (ras_for(p).reshape(), ras_for(p))[1],
                        targets)
        fpmodel.write_shape(base + '-shape.json', fpmodel.SHAPE)
        print(f'shape {got:.3f}', {k: round(fpmodel.SHAPE[k], 4) for k in keys})
        return
    for (r, part), tgs in targets.items():
        joints = fpmodel.joints(spec['weapon'], part)
        ras = ras_for(part)
        for f, tg in tgs:
            key = f'{r}:{f}'
            seed = fpforge.FIT.get(key) or fpforge.FIT.get(f'{r}:{f - 1}') or spec['records'][r].get('seed') or seed_of(tg)
            if f > 0 and tg.bolts and hasattr(held, 'marks') and f'{r}:{f - 1}' in fpforge.FIT:
                before = Target(spec['records'][r], frames_of(spec['records'][r])[f - 1][1], f - 1)
                shift = picture_shift(before.ref, tg.ref)
                tg.keys = {**(tg.keys or {}), **frame_bolts(spec, part, held, fpforge.FIT[f'{r}:{f - 1}'], tg.bolts, shift)}
                print(f'{key} bolts {tg.keys}', flush=True)
            turns = tuple(args.turns) if args.turns else (0.0,)
            pose, s = fit_frame(ras, tg, seed, joints, args.iters, args.restarts, turns)
            fpforge.FIT[key] = pose
            fpforge.write_table(base + '-fit.json', fpforge.FIT)
            print(f'{key} {s:.3f}', flush=True)


if __name__ == '__main__':
    main()
