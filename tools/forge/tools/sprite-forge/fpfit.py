"""Fit each first-person frame's pose to the classic record it stands in for: where the weapon's root and far end show
on the screen, how deep its root sits and how it is turned about its axis, until the forge's weapon, seen as the eye
sees it, covers the record's outline and its metal best.

    python -I tools/sprite-forge/fpfit.py --spec tools/sprite-forge/specs/WEAPON04.json --ref /tmp/ref-W04.json \\
        [--records 0,6] [--iters 300] [--restarts 2]
    python -I tools/sprite-forge/fpfit.py ... --shape    # the weapon's shape and the eye's lens over every frame

The reference (reference.mjs) stays outside the repo; only the poses and the shape are written, beside the spec. A
frame with no pose yet is seeded from its outline: the far end where the outline narrows, the root where it widens, its
width giving the depth. A mirrored record is never fitted: it is its source flipped."""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import flails  # noqa: E402
import fpbow  # noqa: E402
import fpdagger  # noqa: E402
import fpheld  # noqa: E402
import fpwarhammer  # noqa: E402
import lifetools  # noqa: E402
import fpforge  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402

# the outline, the metal, the rest, and the light: how the brightness over the metal both draw ranks against the
# reference's (the grade maps one onto the other, so only its order counts). The light tells a blade's two faces apart,
# and its near end from its far one, where the outline alone reads either way.
WEIGHTS = {'sil': 0.6, 5: 0.3, 6: 0.2, 7: 0.2, 1: 0.05, 'light': 0.25}
STEPS = np.array([6.0, 6.0, 0.04, 3.0, 3.0, 15.0])   # base u, v (px), depth (m), far end u, v (px), roll (degrees)
PLACES = {'base': (0, 1), 'roll': (5,)}   # what of its place a key may hold: its root's screen point, its turn
JOINT_PULL = 0.01   # a joint past its bounds (fpmodel.joints) costs the fit this much a degree
# A frame's priors (Frame.priors): its neighbours in the swing, so a swing moves as one motion and no frame turns off
# on its own where its outline reads two ways, and its key (<spec>-keys.json), typed by hand where even that is not
# enough. Each costs its pull a squared unit off it, a unit being a pose's natural step between frames (PRIOR_UNIT).
PRIOR_UNIT = np.array([40.0, 40.0, 0.15, 30.0, 30.0, 45.0])   # and each joint's own unit
SMOOTH_PULL, KEY_PULL, PRIOR_CAP = 0.004, 0.02, 25.0
SHORT_PULL = 2.0   # score lost a metre the far end falls short of its screen point
# the hand holding the weapon is never on the screen and never over the eye: its root lies past the screen's left,
# right or foot, below its middle (a weapon whose root is in sight, `root_seen`, the bow's grip, is free of it). Score
# lost a pixel the root stands inside that, and a metre its depth leaves an arm's reach
ROOT_PULL, REACH, REACH_PULL = 0.02, (0.12, 0.9), 2.0
EDGE = 3   # texels of outline on a canvas's edge that say Daggerfall's canvas cut the weapon there
# what --shape fits, by weapon: a blade's length is the depths' to set, as an arm's and a leg's are
SHAPE_KEYS = {'sword': ('focal',),   # the sword is the world's (gear.py): only the eye's lens is the archive's to fit
              'fists': ('focal', 'arm_r', 'fist', 'cuff', 'boot_r', 'foot', 'ankle'),
              'climbarm': ('arm_r', 'hand', 'cuff'), 'castarm': ('arm_r', 'hand'),
              # the battleaxe: its socket and spike, each bit's polygon corners (axes.py ANGLES) and centre, its facets
              'battleaxe': ('focal', 'haft_r', 'sock_len', 'sock_r', 'spike_len', 'spike_r',
                            *(f'b_r{k}' for k in range(11)), *(f'k_r{k}' for k in range(11)), 'b_c', 'k_c', 'b_att',
                            'k_att', 'bit_t',
                            'ridge', 'ridge_at', 'cheek', 'cheek_t', 'facet_jitter', 'prong', 'prong_up', 'prong_at')}
SHAPE_STEP = {'focal': 20.0, 'blade_w': 0.004, 'blade_t': 0.04, 'narrow': 0.05, 'tip': 0.04, 'tip_k': 0.2,
              'curve': 0.01, 'bevel': 0.04, 'fuller_w': 0.04, 'fuller_d': 0.1, 'fuller_len': 0.05, 'fuller_floor': 0.05,
              'arm_r': 0.05, 'fist': 0.05, 'boot_r': 0.05, 'foot': 0.05, 'ankle': 5.0, 'hand': 0.05, 'cuff': 0.06,
              'thumb': 0.06, 'haft_len': 0.04, 'haft_r': 0.002, 'sock_len': 0.015, 'sock_r': 0.003, 'spike_len': 0.01,
              'spike_r': 0.002, **{f'{p}_r{k}': 0.012 for p in 'bk' for k in range(11)}, 'b_c': 0.01, 'k_c': 0.01,
              'b_att': 0.01, 'k_att': 0.01,
              'bit_t': 0.002, 'ridge': 0.08, 'ridge_at': 0.05, 'prong': 0.006, 'prong_up': 8.0, 'prong_at': 0.05,
              'cheek': 0.04, 'cheek_t': 0.3, 'facet_jitter': 0.1, 'b_scale': 0.05, 'b_tall': 0.05, 'k_scale': 0.05,
              'k_tall': 0.05, 'fingers': 0.05, 'slim': 0.05}
BOUNDS = {'focal': (120.0, 900.0), 'blade_w': (0.01, 0.2), 'blade_t': (0.05, 0.8), 'narrow': (0.3, 1.2),
          'tip': (0.05, 0.9), 'tip_k': (0.5, 4.0), 'curve': (-0.15, 0.15), 'bevel': (0.05, 0.6), 'fuller_w': (0.05, 0.7),
          'fuller_d': (0.0, 1.2), 'fuller_len': (0.1, 0.95), 'fuller_floor': (0.3, 0.98),
          'arm_r': (0.5, 1.6), 'fist': (0.6, 1.6), 'hand': (0.6, 1.8), 'cuff': (0.3, 9.0), 'thumb': (0.55, 1.3),
          'fingers': (0.8, 1.5), 'slim': (0.6, 1.2),
          'boot_r': (0.6, 1.6), 'foot': (0.6, 1.6), 'ankle': (70.0, 150.0),
          'haft_len': (0.2, 0.9), 'haft_r': (0.008, 0.035), 'sock_len': (0.06, 0.3), 'sock_r': (0.012, 0.05),
          'spike_len': (0.02, 0.2), 'spike_r': (0.008, 0.04),
          **{f'{p}_r{k}': (0.01, 0.4) for p in 'bk' for k in range(11)},
          'b_c': (-0.1, 0.1), 'k_c': (-0.1, 0.1), 'b_att': (0.0, 0.3), 'k_att': (0.0, 0.3),
          'bit_t': (0.004, 0.03), 'ridge': (0.0, 0.9), 'ridge_at': (0.15, 0.85),
          'prong': (0.0, 0.08), 'prong_up': (-30.0, 75.0), 'prong_at': (0.1, 0.9), 'cheek': (0.0, 0.6),
          'cheek_t': (1.0, 5.0), 'facet_jitter': (0.0, 1.5), 'b_scale': (0.4, 2.5), 'b_tall': (0.4, 2.5),
          'k_scale': (0.4, 2.5), 'k_tall': (0.4, 2.5)}
SHAPE_KEYS['flail'] = flails.FIT_KEYS   # the flail's handle, ferrule, links and ball
SHAPE_STEP.update(flails.FIT_STEP)
BOUNDS.update(flails.FIT_BOUNDS)
SHAPE_KEYS['bow'] = fpbow.SHAPE_KEYS   # the bow's own (fpbow.py)
# the staff's girth, taper and cap; its length is the depths' to set, as a blade's is
SHAPE_KEYS['staff'] = ('focal', 'staff_r', 'taper', 'cap_len', 'cap_r')
SHAPE_STEP.update({'staff_r': 0.002, 'taper': 0.05, 'cap_len': 0.005, 'cap_r': 0.05})
BOUNDS.update({'staff_r': (0.008, 0.06), 'taper': (0.4, 1.2), 'cap_len': (0.01, 0.08), 'cap_r': (0.95, 1.6)})
# the mace: its haft's girth, its collar, core and spike, its flanges' polygon corners (axes.py ANGLES), centre and facets;
# how many flanges is not fitted (maces.py MACE)
SHAPE_KEYS['mace'] = ('focal', 'haft_r', 'haft_taper', 'collar_h', 'collar_r', 'head_len', 'core_r', 'core_taper',
                      'spike_len', 'spike_r', *(f'f_r{k}' for k in range(11)), 'f_c', 'f_att', 'bit_t', 'ridge',
                      'ridge_at', 'cheek', 'cheek_t', 'facet_jitter')
SHAPE_STEP.update({'haft_taper': 0.05, 'collar_h': 0.002, 'collar_r': 0.05, 'head_len': 0.01, 'core_r': 0.002,
                   'core_taper': 0.05, **{f'f_r{k}': 0.008 for k in range(11)}, 'f_c': 0.008, 'f_att': 0.01,
                   'f_scale': 0.05, 'f_tall': 0.05})
BOUNDS.update({'haft_taper': (-0.3, 0.6), 'collar_h': (0.004, 0.04), 'collar_r': (1.0, 2.5), 'head_len': (0.06, 0.3),
               'core_r': (0.008, 0.04), 'core_taper': (0.4, 1.3), **{f'f_r{k}': (0.005, 0.25) for k in range(11)},
               'f_c': (-0.08, 0.08), 'f_att': (0.0, 0.3), 'f_scale': (0.4, 2.5), 'f_tall': (0.4, 2.5)})
SHAPE_KEYS['heldmap'] = fpheld.SHAPE_KEYS   # the held map's own (fpheld.py)
SHAPE_KEYS.update(lifetools.SHAPE_KEYS)   # the tools fitted to Daggerfall's frames (lifetools.py)
SHAPE_STEP.update(lifetools.SHAPE_STEP)
BOUNDS.update(lifetools.BOUNDS)
SHAPE_STEP.update(fpheld.SHAPE_STEP)
BOUNDS.update(fpheld.BOUNDS)
SHAPE_STEP.update(fpbow.SHAPE_STEP)
BOUNDS.update(fpbow.BOUNDS)
SHAPE_KEYS['dagger'] = fpdagger.SHAPE_KEYS   # the dagger's own (fpdagger.py)
SHAPE_STEP.update(fpdagger.SHAPE_STEP)
BOUNDS.update(fpdagger.BOUNDS)
SHAPE_KEYS['warhammer'] = fpwarhammer.SHAPE_KEYS   # the warhammer's own (fpwarhammer.py)
SHAPE_STEP.update(fpwarhammer.SHAPE_STEP)
BOUNDS.update(fpwarhammer.BOUNDS)


def pose_of(x, joints=()):
    """The fit's vector as a pose: six numbers, then a jointed part's joints (fpmodel.joints) by name."""
    p = {'base': [float(x[0]), float(x[1])], 'depth': float(x[2]), 'tip': [float(x[3]), float(x[4])],
         'roll': float((x[5] + 180.0) % 360.0 - 180.0)}
    for j, v in zip(joints, x[6:]):
        p[j[0]] = float(v)
    return p


def vector_of(p, joints=()):
    """A pose as the fit's vector: six numbers, and a jointed part's joints (a joint the pose lacks at its rest)."""
    return np.array([*p['base'], p['depth'], *p['tip'], p.get('roll', 0.0), *(p.get(j[0], j[4]) for j in joints)],
                    dtype=np.float64)


def joints_of(wpn, part):
    return fpmodel.joints(wpn.weapon, part)


def steps_for(wpn, part):
    return np.append(STEPS, [j[1] for j in joints_of(wpn, part)])


class Frame:
    """One record's frame of the reference, on the whole screen: its classes, its brightness, and which pixels its
    canvas covers."""

    def __init__(self, rec, classes, lum):
        x, y, cw, ch = fpforge.rect(rec)
        self.ref = np.zeros((fpstage.H, fpstage.W), dtype=np.int8)
        self.ref[y:y + ch, x:x + cw] = classes
        self.lum = np.zeros((fpstage.H, fpstage.W))
        self.lum[y:y + ch, x:x + cw] = lum
        self.canvas = np.zeros((fpstage.H, fpstage.W), dtype=bool)
        self.canvas[y:y + ch, x:x + cw] = True
        self.rect = (x, y, cw, ch)
        # past an edge the outline runs into, Daggerfall's canvas cut the weapon off: it may go on there
        self.free = np.zeros_like(self.canvas)
        on = classes > 0
        if on[:, 0].sum() >= EDGE:
            self.free[:, :x] = True
        if on[:, -1].sum() >= EDGE:
            self.free[:, x + cw:] = True
        if on[0].sum() >= EDGE:
            self.free[:y] = True
        if on[-1].sum() >= EDGE:
            self.free[y + ch:] = True


def iou(a, b, outside=0):
    u = (a | b).sum() + outside
    return (a & b).sum() / u if u else None


def ranks(a):
    r = np.empty(len(a))
    r[np.argsort(a, kind='stable')] = np.arange(len(a))
    return r


LIGHT_OFF = 80.0   # brightness (0-255) a texel may be off on average before a frame's light scores nothing


def light_match(light, fr, inside, mat=None, names=()):
    """How the weapon's light matches the reference's where both draw a material's class, weighed by their texels,
    0 to 1. With the lamp's brightness map (fit_light), each material's light is mapped onto Daggerfall's brightness and
    weighed by how far it is off, texel for texel, so a frame is as bright or as dark as Daggerfall's. Without it, by how
    the light ranks against the reference's in each class apart."""
    maps = (getattr(fr, 'light', None) or fpstage.LIGHT).get('map')
    if maps and mat is not None:
        total, n = 0.0, 0
        for k, name in enumerate(names):
            if name not in maps:
                continue
            both = (mat == k + 1) & (inside > 0) & fpforge.pairs_with(name, fr.ref)
            if both.sum() < 30:
                continue
            off = np.abs(np.interp(light[both], *maps[name]) - fr.lum[both]).mean()
            total += both.sum() * max(0.0, 1.0 - off / LIGHT_OFF)
            n += both.sum()
        return total / n if n else None
    total, n = 0.0, 0
    for cls in (5, 1):
        both = (inside == cls) & (fr.ref == cls)
        if both.sum() < 30:
            continue
        a, b = ranks(light[both]), ranks(fr.lum[both])
        sa, sb = a.std(), b.std()
        if sa < 1e-9 or sb < 1e-9:
            continue
        total += both.sum() * (0.5 + 0.5 * float(((a - a.mean()) * (b - b.mean())).mean() / (sa * sb)))
        n += both.sum()
    return total / n if n else None


def score(img, fr, light=None, mat=None, names=(), weights=None):
    """How well a screen (`img`, classes; `light`, its brightness; `mat`, its materials) covers a frame: inside the
    canvas against its outline, classes and light, each by its weight (WEIGHTS, or a weapon's own). What the weapon draws
    on the screen past the canvas counts against the outline, as Daggerfall's canvas holds all it draws, but past an edge
    the outline runs into (Frame.free)."""
    inside = img * fr.canvas
    outside = int(((img > 0) & ~fr.canvas & ~fr.free).sum())
    total, wsum = 0.0, 0.0
    for key, w in (weights or WEIGHTS).items():
        if key == 'sil':
            v = iou(inside > 0, fr.ref > 0, outside)
        elif key == 'light':
            v = light_match(light, fr, inside, mat, names) if light is not None else None
        else:
            if (fr.ref == key).sum() < 40 and not (inside == key).any():
                continue
            v = iou(inside == key, fr.ref == key)
        if v is not None:
            total += w * v
            wsum += w
    return total / wsum if wsum else 0.0


_OCCLUSION = {}   # (weapon, part, triangles) -> each triangle's share of open sky (fpstage.occlusion)


class Weapon:
    """The fitter's weapon: each part's triangles in the current shape, and how open each lies to the light."""

    def __init__(self, weapon, S=None):
        self.weapon = weapon
        self.records = {}
        self.set_shape(S or fpmodel.SHAPE)

    def for_record(self, record):
        """The weapon a record is drawn as: this one, or one in the record's own shape (fpmodel.shape_for)."""
        if str(record) not in fpmodel.RECORD_SHAPE:
            return self
        if record not in self.records:
            self.records[record] = Weapon(self.weapon, fpmodel.shape_for(record, self.S))
        return self.records[record]

    def set_shape(self, S):
        self.S = dict(S)
        self.names = list(fpmodel.WEAPONS[self.weapon]['mats'])
        ids = {n: k + 1 for k, n in enumerate(self.names)}
        self.geo = {}
        for part in fpmodel.parts(self.weapon):
            # a weapon may read its own materials as another class (`read`: the held map's arm as the painting's glove)
            read = {**fpforge.fit_classes(), **fpmodel.WEAPONS[self.weapon].get('read', {})}
            v, t, c = fpmodel.triangles(self.weapon, read, self.S, part)
            m = fpmodel.triangles(self.weapon, ids, self.S, part)[2]
            key = (self.weapon, part, len(t))
            if key not in _OCCLUSION:   # a part's shape scales it, never its hollows: its occlusion is made once
                _OCCLUSION[key] = fpstage.occlusion(v, t)
            self.geo[part] = (v, t, c, m, fpmodel.length(self.weapon, self.S, part), _OCCLUSION[key])

    def image(self, pose, part, light=None):
        """The screen with `part` at `pose`: (classes, light, metres the far end falls short, materials)."""
        v, t, c, m, length, ao = self.geo[part]
        v = fpmodel.posed(self.weapon, part, v, pose, self.S)
        M, short = fpstage.pose_matrix(pose, self.S, length)
        P = v @ M[:3, :3].T + M[:3, 3]
        tri = fpstage.raster(*fpstage.project(P, self.S), t)
        on = tri >= 0
        at = np.maximum(tri, 0)
        cls = np.where(on, c[at], 0).astype(np.int8)
        lit = np.where(on, (fpstage.shade(P, t, light) * ao)[at], 0.0)
        return cls, lit, short, np.where(on, m[at], 0)


def off_screen(u, v, margin=0.0):
    """Pixels a root at screen point (u, v) stands from the region it may lie in: past the screen's left, right or foot
    by `margin` (half its own width on the screen, so its end never shows), and below the screen's middle."""
    return max(0.0, fpstage.CY - v) + max(0.0, min(u + margin, fpstage.W + margin - u, fpstage.H + margin - v))


def elbow_off(wpn, pose, part):
    """Pixels the elbow of a weapon whose fist is in sight (fpmodel.WEAPONS `elbow`, the dagger's) stands inside the
    region it may lie in (off_screen): its forearm runs out of the view, as Daggerfall's always does."""
    elbow = fpmodel.WEAPONS[wpn.weapon].get('elbow')
    if not elbow:
        return 0.0
    M, _ = fpstage.pose_matrix(pose, wpn.S, fpmodel.length(wpn.weapon, wpn.S, part))
    P = M[:3, :3] @ elbow(wpn.S, pose) + M[:3, 3]
    if P[1] <= fpstage.NEAR:   # behind the eye: out of the view
        return 0.0
    u, v, _ = fpstage.project(P[None], wpn.S)
    return off_screen(float(u[0]), float(v[0]), wpn.S['focal'] * 0.06 * wpn.S.get('arm_r', 1.0) / P[1])


def evaluate(wpn, fr, x):
    wpn = wpn.for_record(getattr(fr, 'record', None))
    js = joints_of(wpn, fr.part)
    pose = pose_of(x, js)
    if pose['depth'] <= fpstage.NEAR * 2:
        return -1.0
    img, light, short, mat = wpn.image(pose, fr.part, getattr(fr, 'light', None))
    lo, hi = fpmodel.WEAPONS[wpn.weapon].get('reach', REACH)   # a two-handed haft's upper hand may come nearer
    reach = max(0.0, lo - pose['depth'], pose['depth'] - hi)
    margin = wpn.S['focal'] * fpmodel.root_radius(wpn.weapon, wpn.S, fr.part) / pose['depth']
    past = sum(max(0.0, lo - pose[j[0]], pose[j[0]] - hi) for j in js for lo, hi in (j[2],))
    own = fpmodel.WEAPONS[wpn.weapon].get('penalty')   # a weapon's own law of its pose (the held map: no hand in paper)
    return (score(img, fr, light, mat, wpn.names, fpmodel.WEAPONS[wpn.weapon].get('weights')) - SHORT_PULL * short
            - (own(wpn.S, pose) if own else 0.0)
            - (0.0 if fpmodel.WEAPONS[wpn.weapon].get('root_seen') else ROOT_PULL * off_screen(*pose['base'], margin))
            - ROOT_PULL * elbow_off(wpn, pose, fr.part)
            - REACH_PULL * reach - JOINT_PULL * past
            - sum(w * prior_distance(x, p, js) for p, w in getattr(fr, 'priors', ())))


def prior_distance(x, p, joints=()):
    """How far vector `x` is from pose `p`, in squared units (PRIOR_UNIT, each joint's own; the roll the short way
    round), capped."""
    d = x - vector_of(p, joints)
    d[5] = (d[5] + 180.0) % 360.0 - 180.0
    unit = np.append(PRIOR_UNIT, [j[3] for j in joints])
    return min(float(((d / unit) ** 2).sum()), PRIOR_CAP)


def outline(fr):
    """The outline's texels (columns, rows), its largest connected piece only: a stray texel is no weapon."""
    from scipy import ndimage as ndi
    lab, n = ndi.label(fr.ref > 0, structure=np.ones((3, 3)))
    if n == 0:
        return np.zeros(0, dtype=int), np.zeros(0, dtype=int)
    k = int(np.argmax(ndi.sum(np.ones_like(lab), lab, range(1, n + 1)))) + 1
    ys, xs = np.nonzero(lab == k)
    return xs, ys


def seed(fr, S, weapon):
    """A first pose from the outline alone: its long axis, the narrow end the far end, the wide end the root (carried on
    past the canvas's edge when the outline runs into it), the root's width giving its depth. A weapon that reads its
    own from the frame's classes (the dagger's fist between its forearm and its blade) seeds itself."""
    own = fpmodel.WEAPONS[weapon].get('seed')
    got = own(fr, S) if own else None
    if got:
        return got
    ys, xs = np.nonzero(fr.ref > 0)
    if len(xs) < 20:   # nothing drawn: the weapon held below the screen
        return {'base': [fpstage.CX + 60, fpstage.H + 80], 'depth': 0.4, 'tip': [fpstage.CX + 50, fpstage.H + 20],
                'roll': 0.0}
    pts = np.stack([xs + 0.5, ys + 0.5], axis=1)
    mean = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - mean, full_matrices=False)
    axis = vt[0]
    t = (pts - mean) @ axis
    n = (pts - mean) @ np.array([-axis[1], axis[0]])
    lo, hi = t.min(), t.max()
    span = max(hi - lo, 1.0)
    near_lo, near_hi = t < lo + 0.12 * span, t > hi - 0.12 * span
    spread = lambda m: np.ptp(n[m]) if m.sum() > 1 else 0.0   # noqa: E731
    if fpmodel.WEAPONS[weapon].get('wide_far'):   # an axe narrows at both ends: its root is the end nearer the foot
        low_hi = (mean + axis * hi)[1] > (mean + axis * lo)[1]
        far, root, sign = (lo, hi, 1.0) if low_hi else (hi, lo, -1.0)
    elif spread(near_lo) < spread(near_hi):
        far, root, sign = lo, hi, 1.0
    else:
        far, root, sign = hi, lo, -1.0
    tip = mean + axis * far
    base = mean + axis * root
    x, y, cw, ch = fr.rect
    width = max(spread(near_hi if sign > 0 else near_lo), 2.0)
    edge = base[0] <= x + 2 or base[0] >= x + cw - 2 or base[1] <= y + 2 or base[1] >= y + ch - 2
    if edge:   # the outline runs on past the canvas: the root lies further along
        base = base + axis * sign * 0.35 * span
    depth = float(np.clip(S['focal'] * fpmodel.girth(weapon, S, fr.part) / width, 0.12, 2.5))
    return {'base': [float(base[0]), float(base[1])], 'depth': depth, 'tip': [float(tip[0]), float(tip[1])], 'roll': 0.0}


def edge_seeds(fr, S, weapon):
    """First poses for an outline that runs off its canvas: the root past each edge it runs into, the far end at the
    outline's texel farthest from that edge."""
    xs, ys = outline(fr)
    if len(xs) < 20:
        return []
    x, y, cw, ch = fr.rect
    on = np.zeros((ch, cw), dtype=bool)
    on[ys - y, xs - x] = True
    out = []
    for touched, dist, root in (
            (on[:, 0].sum() >= EDGE, xs - x, lambda m: (x - 30.0, ys[m].mean() + 30.0)),
            (on[:, -1].sum() >= EDGE, x + cw - 1 - xs, lambda m: (x + cw + 30.0, ys[m].mean() + 30.0)),
            (on[-1].sum() >= EDGE, y + ch - 1 - ys, lambda m: (xs[m].mean(), y + ch + 30.0))):
        if not touched:
            continue
        k = int(np.argmax(dist))
        edge = dist <= 1
        base = root(edge)
        depth = float(np.clip(S['focal'] * fpmodel.girth(weapon, S, fr.part) / max(edge.sum(), 2.0), 0.12, 0.9))
        out.append({'base': [float(base[0]), float(base[1])], 'depth': depth,
                    'tip': [float(xs[k]) + 0.5, float(ys[k]) + 0.5], 'roll': 0.0})
    return out


# a weapon whose joints hang a part off its root (the flail's chain) is seeded by its own read of the frame and a
# search of its joints: each roll, swing and curl here, the best few kept
GRID = {'roll': np.arange(0.0, 360.0, 30.0), 'swing': (0.0, 25.0, 50.0, 80.0, 110.0, 140.0, 170.0),
        'curl': (-60.0, 0.0, 60.0)}
GRID_KEEP = 4


def grid_seeds(wpn, fr):
    """The weapon's own first places for a frame (fpmodel.WEAPONS `seeds`), each tried at every roll and joint of the
    grid; the best GRID_KEEP."""
    hook = fpmodel.WEAPONS[wpn.weapon].get('seeds')
    if not hook:
        return []
    js = joints_of(wpn, fr.part)
    tried = []
    for p in hook(fr, wpn.S):
        for roll in GRID['roll']:
            for sw in GRID['swing']:
                for cu in GRID['curl']:
                    x = vector_of(dict(p, roll=roll, swing=sw, curl=cu), js)
                    tried.append((evaluate(wpn, fr, x), x))
    tried.sort(key=lambda a: -a[0])
    return [pose_of(x, js) for _, x in tried[:GRID_KEEP]]


def fit_frame(wpn, fr, iters, restarts, rng, init=None, seed_pose=None, near=(), held=(), own=False):
    """CMA-ES in units of each parameter's step, from the frame's last pose and from it turned a quarter, a half and three
    quarters about its axis, from its neighbours' in the swing (`near`), from its seed turned three ways (a blade flat to
    the eye, or edge on either way), and (with `restarts`) again from the best so far; the best is kept. With `own`,
    from the frame's last pose alone (a pass after the rules move)."""
    import cma
    steps = steps_for(wpn, fr.part)
    n, js = len(steps), joints_of(wpn, fr.part)
    # a key's held joints stay where it holds them, and so does what of its place it holds (PLACES)
    place = [d for name, dims in PLACES.items() if name in held for d in dims]
    dims = [6 + i for i, j in enumerate(js) if j[0] in held] + place
    steps[dims] = 0.0
    starts = [(vector_of(init, js), 0.5)] if init else []
    if own and init:
        near, seed_pose = (), None
    if init and 'roll' not in held and not own:   # the same place turned about its axis: a fist's sides look alike in outline
        starts += [(vector_of(dict(init, roll=init.get('roll', 0.0) + a), js), 0.5) for a in (90.0, 180.0, 270.0)]
    starts += [(vector_of(p, js), 0.8) for p in near]
    starts += [] if own and init else [(vector_of(p, js), 0.8) for p in edge_seeds(fr, wpn.S, wpn.weapon)]
    if seed_pose:
        starts += [(vector_of(dict(seed_pose, roll=a), js), 1.0) for a in (0.0, 70.0, -70.0)]
    if not init:
        starts += [(vector_of(p, js), 0.6) for p in grid_seeds(wpn, fr)]
    if held and init:   # every start holds them too
        fixed = vector_of(init, js)
        for x0, _ in starts:
            x0[dims] = fixed[dims]
    best_x = starts[0][0]
    best = first = evaluate(wpn, fr, best_x)
    for x0, sigma in starts + [(None, 0.4)] * max(0, restarts - 1):
        x0 = best_x.copy() if x0 is None else x0
        es = cma.CMAEvolutionStrategy(np.zeros(n), sigma, {
            'popsize': 12, 'maxfevals': iters * 12, 'verbose': -9, 'seed': int(rng.integers(1, 2 ** 31)),
            'tolfun': 1e-5})
        while not es.stop():
            zs = es.ask()
            vals = []
            for z in zs:
                x = x0 + np.asarray(z) * steps
                v = evaluate(wpn, fr, x)
                vals.append(-v)
                if v > best:
                    best, best_x = v, x
            es.tell(zs, vals)
    return pose_of(best_x, js), first, best


_JOB = {}


def _fit_one(key):
    r, f = key
    wpn, frames, iters, restarts = _JOB['wpn'], _JOB['frames'], _JOB['iters'], _JOB['restarts']
    fr = frames[(r, f)]
    rng = np.random.default_rng(11 + 7 * r + f)
    init = fpforge.FIT.get(f'{r}:{f}')
    near = [fpforge.FIT[k] for k in (f'{r}:{f - 1}', f'{r}:{f + 1}') if k in fpforge.FIT]
    hand = fpforge.KEYS.get(f'{r}:{f}')   # the frame's key, typed by hand
    held = tuple(hand.get('hold', ())) if hand else ()
    if hand:
        hand = {k: v for k, v in hand.items() if k != 'hold'}
        init = dict(init or hand, **{n: hand[n] for n in held})   # held joints start, and stay, at the key's
    fr.priors = [(p, SMOOTH_PULL) for p in near] + ([(hand, KEY_PULL)] if hand else [])
    if hand:
        near = near + [hand]
    pose, first, best = fit_frame(wpn, fr, iters, restarts, rng, init, seed(fr, wpn.S, wpn.weapon), near, held,
                                  _JOB.get('own', False))
    return key, pose, first, best


def _shape_value(x):
    S = dict(_JOB['wpn'].S)
    for k, v in zip(_JOB['keys'], x):
        lo, hi = BOUNDS[k]
        S[k] = float(np.clip(v, lo, hi))
    wpn = Weapon(_JOB['wpn'].weapon, S)
    return float(np.mean([evaluate(wpn, fr, vector_of(fpforge.FIT[f'{r}:{f}'], joints_of(wpn, fr.part)))
                          for (r, f), fr in _JOB['frames'].items()]))


def fit_shape(wpn, frames, keys, iters, rng):
    import cma
    import multiprocessing
    base = np.array([wpn.S[k] for k in keys], dtype=np.float64)
    steps = np.array([SHAPE_STEP[k] for k in keys])
    _JOB.update(wpn=wpn, frames=frames, keys=keys)
    first = best = _shape_value(base)
    x = base.copy()
    es = cma.CMAEvolutionStrategy(np.zeros(len(base)), 0.6, {'popsize': 16, 'maxiter': iters, 'verbose': -9,
                                                              'seed': int(rng.integers(1, 2 ** 31))})
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
    out = dict(wpn.S)
    for k, v in zip(keys, x):
        out[k] = float(np.clip(v, *BOUNDS[k]))
    return out


def _light_pairs(light):
    """Every texel over the frames where both draw a material's class: {material: (the weapon's light, Daggerfall's
    brightness)}. An arm borrowed from another archive (fpmodel.WEAPONS `arm_from`) is left out: it is not this
    archive's, so its light is no reading of this archive's."""
    wpn, out = _JOB['wpn'], {}
    borrowed = fpmodel.borrowed(wpn.weapon)
    for (r, f), fr in _JOB['frames'].items():
        cls, lit, _, mat = wpn.image(fpforge.FIT[f'{r}:{f}'], fr.part, light)
        inside = cls * fr.canvas
        for k, name in enumerate(wpn.names):
            if name in borrowed:
                continue
            both = (mat == k + 1) & (inside > 0) & fpforge.pairs_with(name, fr.ref)
            if both.any():
                a, b = out.setdefault(name, ([], []))
                a.append(lit[both])
                b.append(fr.lum[both])
    return {n: (np.concatenate(a), np.concatenate(b)) for n, (a, b) in out.items()}


def light_of(x):
    """The lights a light fit's vector stands for: the lamp's place, the sun's bearing and height (degrees, the
    direction it shines from, round from the eye's right and up from level) and its strength against the lamp's."""
    az, el = math.radians(x[3]), math.radians(x[4])
    from_ = np.array([math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)])
    return dict(fpstage.LIGHT, lamp=[float(x[0]), float(x[1]), float(x[2]), fpstage.LIGHT['lamp'][3]],
                sun=[*(-from_).round(4).tolist(), float(max(x[5], 0.0))])


def light_vector():
    """The current lights as a light fit's vector (light_of's inverse)."""
    lamp = fpstage.LIGHT['lamp']
    sun = fpstage.LIGHT.get('sun', [0.0, 0.0, -1.0, 0.0])
    f = -np.array(sun[:3]) / max(np.linalg.norm(sun[:3]), 1e-9)
    return np.array([*lamp[:3], math.degrees(math.atan2(f[1], f[0])), math.degrees(math.asin(np.clip(f[2], -1, 1))),
                     sun[3]], dtype=np.float64)


def _light_value(x):
    return _light_rank(light_of(x))


def _light_rank(light):
    """How the light ranks against Daggerfall's brightness over every frame at once, each material apart: a frame
    bright where Daggerfall's is bright and dark where it is dark, not only in step within itself."""
    total, n = 0.0, 0
    for a, b in _light_pairs(light).values():
        if len(a) < 30 or np.ptp(a) == 0:
            continue
        ra, rb = ranks(a), ranks(b)
        total += len(a) * float(np.corrcoef(ra, rb)[0, 1])
        n += len(a)
    return total / n if n else 0.0


MAP_AT = (0.5, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99.5)   # the shares the brightness map lays on


WHITE, CLIPPED = 250, 0.01   # a texel this bright is clipped white; the share a frame's own exposure leaves so


def exposure(lit, top=0.6):
    """The render's exposure for the fitter's light `lit`: its brightest tenth lands near `top` of the range before
    the grade, so the grade has every step to lay on (a face of albedo ~0.4 under the scene's lights: fpstage.set_lights's
    ratios)."""
    return round(float(np.log2(top / (0.4 / (4 * math.pi ** 2) * max(np.percentile(lit, 90), 1e-6)))), 3)


def fit_light(wpn, frames, iters, rng):
    """The lamp's place (camera space) whose light ranks most as Daggerfall's brightness over every frame, and the map
    from that light onto the brightness, each material's share for share (`map`), which the poses are then fitted by."""
    import cma
    import multiprocessing
    base = light_vector()
    if base[5] <= 0:   # no sun yet: one from above the eye's left, as strong as the lamp a hand's length off
        base[3:] = [135.0, 50.0, fpstage.LIGHT['lamp'][3] * 4.0]
    steps = np.array([0.08, 0.08, 0.08, 20.0, 12.0, fpstage.LIGHT['lamp'][3] * 2.0])
    _JOB.update(wpn=wpn, frames=frames)
    first = best = _light_value(light_vector())
    x = light_vector()
    es = cma.CMAEvolutionStrategy(np.zeros(len(base)), 0.8, {'popsize': 12, 'maxiter': iters, 'verbose': -9,
                                                             'seed': int(rng.integers(1, 2 ** 31))})
    with multiprocessing.get_context('fork').Pool(4) as pool:
        while not es.stop():
            zs = es.ask()
            cands = [base + np.asarray(z) * steps for z in zs]
            vals = pool.map(_light_value, cands)
            es.tell(zs, [-v for v in vals])
            k = int(np.argmax(vals))
            if vals[k] > best:
                x, best = cands[k], vals[k]
    print(f'light: {first:.4f} -> {best:.4f} at {x.round(3).tolist()}', flush=True)
    return _mapped(light_of(x))


def _mapped(light, top=0.6):
    """A fitted light with its exposure (`exposure`, its brightest tenth near `top`) and the map from its light onto
    Daggerfall's brightness, each material's share for share."""
    light = {k: v for k, v in light.items() if k != 'map'}
    light['lamp'] = [round(float(a), 3) for a in light['lamp']]
    light['sun'] = [round(float(a), 3) for a in light['sun']]
    light['exposure'] = exposure(np.concatenate([a for a, _ in _light_pairs(light).values()]), top)
    maps = {}
    for name, (a, b) in _light_pairs(light).items():
        if len(a) >= 30:
            src = np.maximum.accumulate(np.percentile(a, MAP_AT) + np.arange(len(MAP_AT)) * 1e-6)
            maps[name] = [src.round(6).tolist(), np.percentile(b, MAP_AT).round(1).tolist()]
    light['map'] = maps
    return light


SUN = 2.0   # a sun alone against the world's 0.15: a face square to it fourteen times as bright as one turned away


def fit_sun(wpn, frames, iters=None, rng=None):
    """A sun alone and the world, no lamp, as Daggerfall lit some weapons: each flat face one tone, those turned away
    near black. Its bearing is searched on a grid, then finer, for the rank of Daggerfall's brightness. The render is
    exposed a stop under fit_light's, so a mottled face keeps its highlights."""
    _JOB.update(wpn=wpn, frames=frames)

    def at(az, el):
        return dict(light_of(np.array([0.0, 0.0, 0.0, az, el, SUN])), lamp=[0.0, 0.0, 0.0, 0.0])
    best = max((_light_rank(at(az, el)), az, el) for az in range(0, 360, 15) for el in range(-75, 90, 15))
    for step in (5, 2):
        _, a0, e0 = best
        best = max([best] + [(_light_rank(at(a0 + da, e0 + de)), a0 + da, e0 + de)
                             for da in range(-2 * step, 3 * step, step) for de in range(-2 * step, 3 * step, step)
                             if abs(e0 + de) < 90])
    print(f'sun: from {best[1] % 360} round and {best[2]} up, ranks {best[0]:.4f}', flush=True)
    return _mapped(at(best[1], best[2]), top=0.3)


def reference_frames(spec, ref):
    """Every fitted record's frames, from the reference: {(record, frame): Frame}."""
    out = {}
    for r, rec in enumerate(spec['records']):
        if 'mirror' in rec:
            continue
        cw, ch = rec['canvas']
        assert ref['records'][r]['canvas'] == [cw, ch], f'record {r}: the spec\'s canvas is not the reference\'s'
        for f in range(rec['frames']):
            cls = np.array([int(c) for c in ref['records'][r]['frames'][f]], dtype=np.int8).reshape(ch, cw)
            rgb = np.frombuffer(bytes.fromhex(ref['records'][r]['rgb'][f]), dtype=np.uint8).reshape(ch, cw, 3)
            out[(r, f)] = Frame(rec, cls, rgb.astype(np.float64).mean(axis=2))
            out[(r, f)].part = fpforge.part_of(spec, rec)
            out[(r, f)].light = fpstage.light_for(r, f)
            out[(r, f)].record = r
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--ref', required=True)
    ap.add_argument('--records', default='')
    ap.add_argument('--iters', type=int, default=300)
    ap.add_argument('--restarts', type=int, default=1)
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--shape', action='store_true', help='fit the shape and the lens instead of the poses')
    ap.add_argument('--keys', default='', help='with --shape, only these (comma-separated)')
    ap.add_argument('--report', action='store_true', help='print each frame\'s score and stop')
    ap.add_argument('--light', action='store_true', help='fit the lamp\'s place instead of the poses')
    ap.add_argument('--expose', default='', help='these frames\' own exposure, from their own light (6:0,...)')
    ap.add_argument('--sun', action='store_true', help='with --light, a sun alone and no lamp (fit_sun)')
    ap.add_argument('--own', action='store_true', help='each fitted frame from its own pose alone (after a rule moves)')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    spec = fpforge.load(args.spec)
    ref = json.load(open(args.ref))
    base = args.spec[:-len('.json')]
    frames = reference_frames(spec, ref)
    only = {int(r) for r in args.records.split(',') if r != ''}
    if only:
        frames = {k: v for k, v in frames.items() if k[0] in only}
    own = fpmodel.WEAPONS[spec['weapon']].get('set', ())   # a pose set by hand is never fitted again
    frames = {k: v for k, v in frames.items() if f'{k[0]}:{k[1]}' not in own}
    wpn = Weapon(spec['weapon'])
    if args.report:
        vals = []
        for (r, f), fr in sorted(frames.items()):
            p = fpforge.FIT.get(f'{r}:{f}') or seed(fr, wpn.S, wpn.weapon)
            v = evaluate(wpn, fr, vector_of(p, joints_of(wpn, fr.part)))
            vals.append(v)
            print(f'record {r} frame {f}: {v:.3f}')
        print(f'mean {np.mean(vals):.3f}')
        return
    if args.expose:   # a frame swung up to the lamp: its own exposure, so its sheen never whitens it
        table = json.load(open(base + '-light.json'))
        eye = fpforge.Eye(spec, 32)
        for key in args.expose.split(','):
            r, f = (int(n) for n in key.split(':'))
            fpstage.RECORD_LIGHT.pop(key, None)
            ev = fpstage.light_for(r).get('exposure', 0.0)
            for _ in range(16):   # stepped down until hardly a texel it draws is white
                fpstage.RECORD_LIGHT[key] = {'exposure': ev}
                raw = eye.screen(fpforge.FIT[key], fpforge.part_of(spec, spec['records'][r]), raw=True, record=r, frame=f)
                on = raw[..., 3] > 0
                if (raw[on][:, :3].min(axis=1) >= WHITE).mean() <= CLIPPED:
                    break
                ev -= 0.25
            table.setdefault('records', {})[key] = {'exposure': round(ev, 3)}
            print(f'frame {key}: exposure {ev:.2f} (its record\'s {fpstage.light_for(r).get("exposure", 0.0)})')
        with open(base + '-light.json', 'w') as fh:
            fh.write(json.dumps(table, indent=1) + '\n')
        return
    if args.light:   # the archive's light; with --records, one record's own (its frames lit apart)
        fit = fit_sun if args.sun else fit_light
        table = json.load(open(base + '-light.json')) if os.path.exists(base + '-light.json') else {}
        if only:
            assert len(only) == 1, 'a light of its own is fitted a record at a time'
            r = next(iter(only))
            own = dict(fpstage.light_for(r))
            fpstage.LIGHT.clear()
            fpstage.LIGHT.update(own)
            table.setdefault('records', {})[str(r)] = fit(wpn, frames, args.iters, np.random.default_rng(5))
        else:   # a record lit apart is left out of the archive's light
            frames = {k: v for k, v in frames.items() if str(k[0]) not in fpstage.RECORD_LIGHT}
            table = dict(fit(wpn, frames, args.iters, np.random.default_rng(5)), **(
                {'records': table['records']} if 'records' in table else {}))
        with open(base + '-light.json', 'w') as fh:
            fh.write(json.dumps(table, indent=1) + '\n')
        return
    if args.shape:   # the archive's shape; with --records, one record's own values for `keys` (its frames drawn apart)
        keys = [k for k in args.keys.split(',') if k] or list(SHAPE_KEYS[spec['weapon']])
        if only:
            assert len(only) == 1 and args.keys, 'a shape of its own is fitted a record at a time, for named keys'
            r = next(iter(only))
            wpn = Weapon(spec['weapon'], fpmodel.shape_for(r))
            for fr in frames.values():
                fr.record = None   # the candidate shape is the record's
            S = fit_shape(wpn, frames, keys, args.iters, np.random.default_rng(3))
            fpmodel.write_shape(base + '-shape.json', {k: S[k] for k in keys}, record=r)
        else:   # a record drawn in a shape of its own is left out of the archive's
            frames = {k: v for k, v in frames.items() if str(k[0]) not in fpmodel.RECORD_SHAPE}
            S = fit_shape(wpn, frames, keys, args.iters, np.random.default_rng(3))
            for k in fpmodel.WEAPONS[spec['weapon']].get('arm', dict)():   # the arm's sizes are its own archive's
                S.pop(k, None)
            fpmodel.write_shape(base + '-shape.json', S)
        return
    _JOB.update(wpn=wpn, frames=frames, iters=args.iters, restarts=args.restarts, own=args.own)
    fitted = dict(fpforge.FIT)
    import multiprocessing
    with multiprocessing.get_context('fork').Pool(args.jobs) as pool:
        for (r, f), pose, first, best in pool.imap_unordered(_fit_one, sorted(frames)):
            fitted[f'{r}:{f}'] = pose
            print(f'record {r} frame {f}: {first:.3f} -> {best:.3f}', flush=True)
            fpforge.write_table(base + '-fit.json', fitted)


if __name__ == '__main__':
    main()
