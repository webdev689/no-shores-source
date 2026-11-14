"""The first-person dagger (WEAPON02.CIF): a short blade in the right fist, one part with the arm that holds it.

The part's space is the dagger's: its root the grip's middle, inside the fist, its axis +Z up the blade, its edges along
X and its flats toward -Y and +Y. The arm is the one every first-person hand wears (fparm.py), the right one, its hand
closed round the grip as the bow fist closes on its stave (fpbow.py `grip`): each finger closed until it touches, then
the thumb turned in until it does. The flats face the back of the hand and the palm, the edges run along the forearm,
as a dagger is held to stab. The forearm turns at the wrist while the fist keeps hold (`lean` toward the palm, `swing`
toward the little finger), so a pose places the fist and the point and turns the arm behind them.

The arm is the first-person arm as every picture wears it: the punches' arm in their garments, at their sizes
(`specs/WEAPON10-shape.json`) and in their grade (`ARM_FROM`), so it looks the same whatever the hand holds. Only the
dagger is the archive's own: Daggerfall's broad blade with twin fullers (blades.py), a brass crossguard set with three
green stones on each face, its spikes fanning up beside the blade, and a small skull for a pommel."""
import json
import math
import os

import numpy as np

import blades
import fparm
import fphand
from fpbow import _bisect, _grip_pose, _off, GLOVE, GRIP_ATS, GRIP_OUTS, GRIP_CURL, GRIP_SLANT, GRIP_THUMB

SHAPE = {
    # the blade: blades.py's long blade at a dagger's size, as Daggerfall's: its edges parallel, swelling a little
    # before a clipped point, a ridge down its middle so each face's halves take the light apart, and two short deep
    # grooves either side of the ridge from the guard
    'blade_len': 0.27,   # metres from the guard to the point
    'blade_w': 0.045,    # its width at the guard
    'blade_t': 0.28,     # its thickness over its width
    'narrow': 1.0,       # its width where the point begins, over its width at the guard
    'tip': 0.17,         # the share of its length the point takes
    'tip_k': 1.3,        # the point's cut: curving a little in to the point, the back staying straight (`drop`)
    'clip': 0.0,
    'drop': 1.0,         # the point carried over to the back edge's line, over the half-width: 1 the back runs on
                         # straight to the point and the front cuts across to it, as Daggerfall's does
    'leaf': 0.1,         # the swell before the point, over the half-width, and where it is
    'leaf_at': 0.75,
    'curve': 0.0,
    'bevel': 0.2,
    'ridge': 0.6,        # the middle raised over the flats, over the half-thickness
    'fuller_w': 0.1,     # the middle: the ridge (no fuller of its own)
    'fuller_d': 0.0,
    'fuller_len': 0.6,
    'fuller_floor': 0.8,
    'fuller2_at': 0.25,  # the twin fullers, as Daggerfall's measure: their middles over the half-width, their
    'fuller2_w': 0.1,    # half-width, depth and the share of the blade they run
    'fuller2_d': 1.5,   # to the blade's middle, so the slot goes through
    'fuller2_len': 0.38,
    # the hilt
    'grip_len': 0.094,   # the grip, guard to pommel, at hand 1: the fist's width, so the guard sits on the index
    'grip_r': 0.013,     # its girth
    'guard_span': 3.45,  # the crossguard's span along the edges, over the blade's width (Daggerfall's, measured)
    'guard_h': 0.012,    # its height along the blade
    'guard_d': 0.02,     # its depth, face to face
    'spike': 1.3,        # its spikes' length, over the blade's width
    'pommel': 0.018,     # the skull's radius
}
SKULL_UP = 1.0   # the edge the skull's crown is turned to (+1 or -1 along X)
SKULL_TILT = 35.0    # degrees its face turns from the pommel's end toward the palm
ARM_FROM = 'WEAPON10'   # the archive whose arm every first-person picture wears: its sizes and its grade


def arm_shape():
    """The arm's sizes as the punches' arm has them (their archive's, not their idle's own): the hand, the sleeve's
    girth, the glove's cuff and the thumb."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', f'{ARM_FROM}-shape.json')
    S = json.load(open(path))
    return {'hand': S['fist'], 'arm_r': S['arm_r'], 'cuff': S['cuff'], 'thumb': S['thumb']}


SHAPE.update(arm_shape())
# (name, the fit's step, its bounds, the prior's unit, its rest): the forearm turned at the wrist toward the palm and
# toward the little finger, the fist held still on the grip
JOINTS = (
    ('lean', 6.0, (-75.0, 75.0), 25.0, 0.0),
    ('swing', 5.0, (-50.0, 50.0), 20.0, 0.0),
)
REST = {j[0]: j[4] for j in JOINTS}
# the dagger's own materials, after the arm's: Daggerfall's (blade, brass, stones, skull), the grip, and the slots a
# metal's own design dresses in its colours (fpdaggers.py): its fittings, an accent and a daedric glow
DAGGER_MATS = ('dagger_blade', 'hilt', 'gem', 'pommel', 'dagger_groove', 'skull_dark', 'dagger_grip', 'dagger_fit',
               'dagger_accent', 'dagger_glow')
MATS = fparm.mats() + DAGGER_MATS
BLADE, HILT, GEM, POMMEL, GROOVE, SKULL_DARK, GRIP, FIT, ACCENT, GLOW = range(len(fparm.mats()), len(MATS))
# the grip is wrapped in the glove's leather, so where it shows it reads as the fist: graded as the glove is
GRADE_AS = {'dagger_grip': 'gauntlet'}
# what the arm wears (fplayers.py dresses it in an armour set): its garments, and the plate laid over them as
# fparm.arm takes it, its materials counted past the dagger's
WEAR = {'outfit': fparm.OUTFIT, 'armour': None}
# the dagger's own make (fpdaggers.py gives each metal its own): its blade, and its grip, guard and pommel
DESIGN = {}


def _half(S):
    """Half the grip's length: it grows with the hand that holds it."""
    return S['grip_len'] * S['hand'] / 2


def length(S):
    """The root to the point: half the grip, the guard, the blade."""
    return _half(S) + S['guard_h'] + S['blade_len']


def _join(pieces):
    vs, ts, ms, base = [], [], [], 0
    for v, t, m in pieces:
        vs.append(np.asarray(v, dtype=np.float64))
        ts.append(np.asarray(t, dtype=np.int64) + base)
        ms.append(np.full(len(t), m, dtype=np.int64) if np.ndim(m) == 0 else np.asarray(m, dtype=np.int64))
        base += len(v)
    return np.concatenate(vs), np.concatenate(ts), np.concatenate(ms)


def _ball(c, r, n=10):
    """A closed ball about `c`, radii `r` (x, y, z)."""
    th = np.linspace(0.0, np.pi, n + 1)[1:-1]
    ph = np.linspace(0.0, 2 * np.pi, 2 * n, endpoint=False)
    rows = [np.stack([np.sin(t) * np.cos(ph), np.sin(t) * np.sin(ph), np.full_like(ph, np.cos(t))], axis=1)
            for t in th]
    v = np.concatenate(rows + [[[0.0, 0.0, 1.0]], [[0.0, 0.0, -1.0]]]) * np.asarray(r) + np.asarray(c)
    m, top, bottom = len(ph), len(v) - 2, len(v) - 1
    tris = []
    for i in range(len(th) - 1):
        for j in range(m):
            p, q = i * m + j, i * m + (j + 1) % m
            tris += [(p, p + m, q + m), (p, q + m, q)]
    for j in range(m):
        tris += [(top, j, (j + 1) % m), (bottom, (len(th) - 1) * m + (j + 1) % m, (len(th) - 1) * m + j)]
    return v, np.array(tris, dtype=np.int64)


def _cone(a, b, r0, r1=0.0012, n=8, rings=6, broad=1.0, thin=1.0):
    """A spike from `a` to `b`, `r0` thick at its root and `r1` at its point, closed at both ends: `broad` times as wide
    across in the XZ plane, `thin` times as thick along Y (a spike lying in that plane is a flat horn)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    L = float(np.linalg.norm(b - a))
    s = np.linspace(0.0, L, rings)
    r = r0 + (r1 - r0) * (s / L) ** 0.8
    up = np.array([0.0, 1.0, 0.0]) if abs((b - a)[1]) < 0.9 * L else np.array([1.0, 0.0, 0.0])
    return fphand._tube(a, b - a, up, s, r * broad, r * thin, power=2.0, n=n)


def _curve(pts, r, broad=1.0, thin=1.0, n=10, point=True):
    """A tube along the polyline `pts`, which lies in the XZ plane, `r` its girth at each point: `broad` times as wide
    across in that plane, `thin` times as thick along Y. Its root is capped, its end drawn to a point (or capped)."""
    pts, r = np.asarray(pts, float), np.asarray(r, float)
    t = np.gradient(pts, axis=0)
    t /= np.linalg.norm(t, axis=1)[:, None]
    Y = np.array([0.0, 1.0, 0.0])
    side = np.cross(t, Y)
    side /= np.linalg.norm(side, axis=1)[:, None]
    th = np.linspace(0.0, 2 * np.pi, n, endpoint=False)
    rings = (pts[:, None, :] + side[:, None, :] * (np.cos(th)[None, :] * r[:, None] * broad)[..., None]
             + Y * (np.sin(th)[None, :] * r[:, None] * thin)[..., None])
    v = np.concatenate([rings.reshape(-1, 3), pts[:1], pts[-1:] + t[-1:] * (r[-1] if point else 0.0)])
    root, end, k = len(v) - 2, len(v) - 1, len(pts)
    tris = []
    for i in range(k - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            tris += [(a, b, b + n), (a, b + n, a + n)]
    for j in range(n):
        tris += [(root, (j + 1) % n, j), (end, (k - 1) * n + j, (k - 1) * n + (j + 1) % n)]
    return v, np.array(tris, dtype=np.int64)


def _bezier(p0, p1, p2, n=10):
    s = np.linspace(0.0, 1.0, n)[:, None]
    return (1 - s) ** 2 * np.asarray(p0) + 2 * (1 - s) * s * np.asarray(p1) + s * s * np.asarray(p2)


CRESCENT = 0.003   # how far the crossguard's ends rise over its middle, metres


def _guard_w(S):
    """The crossguard's span, metres: it grows with the blade, as Daggerfall's is drawn."""
    return S['guard_span'] * S['blade_w']


def _guard_z(S, x):
    """The crossguard's middle line's height at `x` along it: its ends risen a little."""
    return _half(S) + S['guard_h'] / 2 + CRESCENT * (np.asarray(x) / (_guard_w(S) / 2)) ** 2


# Daggerfall's crossguard's four spikes, measured on its frames in blade widths: (out from the blade's middle, length,
# lean out from upright in degrees) - an inner pair beside the blade, an outer pair at the bar's ends leaning further
SPIKES = ((0.95, 1.1, 10.0), (1.72, 0.9, 34.0))
SPIKE_ROOT = 0.24   # a spike's half-width at its root, over the blade's width: each is a broad flat horn
SPIKE_FLAT = 0.75   # its thickness across the blade's faces, over its width


def _guard(S):
    """The crossguard, as Daggerfall's: a brass bar across the blade's root along its edges, three and a half blades
    wide, its ends risen a little; four spikes stand up from it, a pair beside the blade and a pair at its ends, each a
    broad flat point leaning out and curving a little further out; three green stones set into each face."""
    h, d, bw = S['guard_h'], S['guard_d'], S['blade_w']
    w, L = _guard_w(S), S['spike'] * bw
    x = np.linspace(-w / 2, w / 2, 21)
    bar = np.stack([x, np.zeros_like(x), _guard_z(S, x)], axis=1)
    taper = 1.0 - 0.3 * (np.abs(x) / (w / 2)) ** 4
    v, t = _curve(bar, h / 2 * taper, thin=d / h, n=12, point=False)
    pieces = [(v, t, HILT)]
    for side in (1, -1):
        for out, k, lean in SPIKES:
            xs = side * min(out * bw, w / 2 - 0.3 * bw)
            a = np.array([xs, 0.0, float(_guard_z(S, xs)) - h * 0.2])   # rooted in the bar's face
            tl = math.radians(lean)
            spike = _bezier(a, a + 0.5 * k * L * np.array([side * math.sin(tl), 0.0, math.cos(tl)]),
                            a + k * L * np.array([side * math.sin(tl * 1.5), 0.0, math.cos(tl * 1.5)]), n=10)
            u = np.linspace(0.0, 1.0, len(spike))
            v, t = _curve(spike, np.maximum(SPIKE_ROOT * bw * (1.0 - u) ** 0.85, 0.0005), thin=SPIKE_FLAT, n=10)
            pieces.append((v, t, HILT))
    for xs in (-0.26 * w, 0.0, 0.26 * w):
        for face in (1, -1):
            v, t = _ball((xs, face * d / 2 * 0.8, float(_guard_z(S, xs))), (0.0085, 0.0035, 0.005), n=6)
            pieces.append((v, t, GEM))
    return pieces


# the skull's hollows, in its own space: the eyes, the nose
HOLLOWS = (((0.98, 0.4, -0.18), (0.36, 0.3, 0.32)), ((0.98, -0.4, -0.18), (0.36, 0.3, 0.32)),
           ((1.12, 0.0, -0.62), (0.22, 0.14, 0.2)))


def _skull():
    """The pommel's skull, made once in Blender as blended blobs: a round cranium, a narrower face with two deep hollow
    eyes and a nose below them, toward +X, the jaw under them. Its own space: the cranium's middle at the origin,
    radius 1."""
    from body import blob
    return [blob((-0.1, 0.0, 0.1), (1.08, 0.92, 0.92)), blob((0.55, 0.0, -0.45), (0.6, 0.72, 0.55)),
            blob((0.58, 0.0, -1.0), (0.5, 0.52, 0.3))] + [blob(c, r, negative=True) for c, r in HOLLOWS]


def _skull_dark(cen):
    """Which of the skull's faces are drawn dark, as Daggerfall's are: the hollows' floors and walls, the line between
    the teeth and the gaps between them. A hollow's floor takes the light as the bone round it does, so it must be
    dark of its own."""
    dark = np.zeros(len(cen), dtype=bool)
    for c, r in HOLLOWS:
        dark |= (((cen - np.array(c)) / (np.array(r) * 1.25)) ** 2).sum(axis=1) < 1.0
    front = (cen[:, 0] > 0.75) & (np.abs(cen[:, 1]) < 0.5)
    dark |= front & (np.abs(cen[:, 2] + 0.95) < 0.06)
    dark |= front & (cen[:, 2] < -0.82) & (cen[:, 2] > -1.12) & (np.mod(cen[:, 1] + 0.07, 0.2) < 0.06)
    return dark


def _hilt(S):
    """The grip, the guard and the pommel: the grip a plain round wrapped in the glove's leather between them (the fist
    hides most of it), a collar where it meets the skull."""
    from fpmodel import _blob_mesh
    z0, r = _half(S), S['grip_r']
    s = np.linspace(-z0 - 0.004, z0 + 0.004, 12)
    gv, gt = fphand._tube(np.array([0.0, 0.0, 0.0]), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], s, np.full_like(s, r),
                          np.full_like(s, r), power=2.0, n=14)
    pieces = [(gv, gt, GRIP)]
    collar = fphand._tube(np.array([0.0, 0.0, 0.0]), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0],
                          np.array([-z0 - 0.007, -z0 - 0.004, -z0 + 0.002]), np.array([r * 1.25, r * 1.4, r * 1.25]),
                          np.array([r * 1.25, r * 1.4, r * 1.25]), power=2.0, n=14)
    pieces.append((collar[0], collar[1], HILT))
    sv, st = _blob_mesh('dagger_skull', _skull, 0.06)
    mats = np.where(_skull_dark(sv[st].mean(axis=1)), SKULL_DARK, POMMEL)
    p = S['pommel']
    # its face out of the pommel's end and a little toward the palm, the back of its skull on the collar,
    # its crown toward an edge: Daggerfall's looks at the eye when the point is thrust away, and from the side alike
    sv = np.stack([SKULL_UP * sv[:, 2], sv[:, 1], -sv[:, 0]], axis=1)
    a = math.radians(SKULL_TILT)
    sv = np.stack([sv[:, 0], sv[:, 1] * math.cos(a) - sv[:, 2] * math.sin(a),
                   sv[:, 1] * math.sin(a) + sv[:, 2] * math.cos(a)], axis=1)
    pieces.append((sv * p + np.array([0.0, 0.0, -z0 - 0.004 - p * 0.95]), st, mats))
    return pieces + _guard(S)


def _blade(S):
    """blades.py's blade, its point carried over to its back edge's line (`drop`): the back runs on straight to the
    point and the front cuts across to it. The twin fullers are slots through the blade, as Daggerfall's are (it draws
    them clear): each groove is cut to the blade's middle from both faces and its floor taken away where it runs full
    deep, so the world shows through; its walls, the slot's sides, are a darker metal (GROOVE), and where the groove
    shallows at its end its floor closes the slot."""
    rows = 96
    v, t, _ = blades.long_blade(S, 'Steel', rows=rows)
    m = np.full(len(t), BLADE)
    strips = 8   # each quarter of the section, edge to middle: bevel, flat, wall, floor, wall, flat, fuller wall, floor
    quads = 4 * strips * rows   # long_blade's triangles: each quad's first half, then each one's second, then the root
    q = np.arange(quads)
    run = q % rows
    groove = np.isin((q // rows) % strips, (2, 3, 4)) & (run < rows * S['fuller2_len'] * 0.92)
    m[q[groove]] = GROOVE
    m[q[groove] + quads] = GROOVE
    # the slot: the floor gone where the groove runs full deep (blades.py fades a groove over its last fifth)
    slot = q[((q // rows) % strips == 3) & (run < rows * S['fuller2_len'] * 0.78)]
    keep = np.ones(len(t), dtype=bool)
    keep[slot] = keep[slot + quads] = False
    t, m = t[keep], m[keep]
    start = (1.0 - S['tip']) * S['blade_len']
    u = np.clip((v[:, 2] - start) / max(S['tip'] * S['blade_len'], 1e-6), 0.0, 1.0)
    v = v.copy()
    # by as much as the back edge narrows there, so the back runs on straight and the front cuts across, curving in
    v[:, 0] -= S.get('drop', 0.0) * S['blade_w'] * S['narrow'] / 2 * u ** max(S['tip_k'], 0.2)
    return v + np.array([0.0, 0.0, _half(S) + S['guard_h'] * 0.6]), t, m


_ARMS, _GRIPS = {}, {}


def _arm_key(S):
    return (S['hand'], S['arm_r'], S['cuff'], S['thumb'])


def _bare_arm(S):
    """The left arm at rest in the glove and sleeve every picture wears, fused, in its own space (the right is it
    mirrored, at the end): the hand the grip is closed by."""
    key = _arm_key(S)
    if key not in _ARMS:
        _ARMS[key] = fparm.arm(S['hand'], S['arm_r'], 'L', cuff=S['cuff'], thumb=S['thumb'], fused=True)
    return _ARMS[key]


def _rest_arm(S):
    """The left arm at rest as it is dressed (`WEAR`): bare, or in an armour set's garments and plate."""
    if WEAR['outfit'] == fparm.OUTFIT and WEAR['armour'] is None:
        return _bare_arm(S)
    key = (*_arm_key(S), WEAR['outfit'], id(WEAR['armour']))
    if key not in _ARMS:
        _ARMS[key] = fparm.arm(S['hand'], S['arm_r'], 'L', outfit=WEAR['outfit'], cuff=S['cuff'], thumb=S['thumb'],
                               armour=WEAR['armour'], fused=True)
    return _ARMS[key]


def grip(S):
    """The fist closed on the grip: the grip's line laid in front of the knuckles where the closed hand wraps most of
    its round with nothing of the hand in it, each finger closed until it touches it, then the thumb, a little bent,
    turned in until it does (fpbow.py `grip`, on a plain round grip). Gives the posed hand, the grip's line in the arm's
    space (a point, its way from the index's end to the little finger's), and the fist's middle along it."""
    key = (*_arm_key(S), S['grip_r'])
    if key in _GRIPS:
        return _GRIPS[key][:3]
    v = _bare_arm(S)[0]
    k, c = S['hand'], S['cuff']
    R = fparm._RIGS[(k, c, len(v))]
    piece, thumb = R['piece'], R['thumb']['w']
    hand = piece >= 0
    pose = lambda K, F, ti=0.0, tb=0.0: fparm.posed(v, _grip_pose(K, F, ti, tb), k, 'L', c)   # noqa: E731
    t = math.radians(GRIP_SLANT)
    d = np.array([math.cos(t), 0.0, -math.sin(t)])
    links = []
    for i in range(4):
        F = R[f'f{i}']
        links.append([F['on'] & (F['w'][1] < 0.5), F['on'] & (F['w'][1] >= 0.5) & (F['w'][2] < 0.5),
                      F['on'] & (F['w'][2] >= 0.5)])
    tip = [(thumb[0] > 0.5) & (thumb[1] < 0.5), (thumb[1] >= 0.5) & (thumb[2] < 0.5), thumb[2] >= 0.5]
    open_hand = pose(np.zeros(4), np.zeros(4))
    KMAX, FMAX = 100.0, 115.0
    fold = lambda s: np.minimum(KMAX * s * GRIP_CURL, FMAX)   # noqa: E731
    radius = S['grip_r'] + GLOVE

    def close(a):
        gap = lambda P: _off(P, a, d) - radius   # noqa: E731
        if gap(open_hand[hand]).min() < 0.0:
            return None
        clear = lambda vp, on: gap(vp[on]).min() >= 0.0 if on.any() else True   # noqa: E731
        s = _bisect(lambda s: (lambda vp: np.array([all(clear(vp, L) for L in links[i]) for i in range(4)]))(
            pose(KMAX * s, fold(s))), 0.0, 1.0, 4)
        K, F = KMAX * s, fold(s)
        past = pose(KMAX * np.minimum(s + 1 / 4096, 1.0), fold(np.minimum(s + 1 / 4096, 1.0)))
        first = np.array([not clear(past, links[i][0]) for i in range(4)])
        on = lambda vp: np.array([all(clear(vp, L) for L in links[i][1:]) for i in range(4)])   # noqa: E731
        F = np.where(first, _bisect(lambda f: on(pose(K, np.where(first, f, F))), F, FMAX, 4), F)
        held = lambda vp: all(clear(vp, L) for L in tip)   # noqa: E731
        ti = _bisect(lambda x: np.array([held(pose(K, F, x[0], GRIP_THUMB))]), -45.0, 95.0, 1)[0]
        joints = _grip_pose(K, F, ti, GRIP_THUMB)
        vp = fparm.posed(v, joints, k, 'L', c)
        rel = vp[hand] - a
        radial = rel - np.outer(rel @ d, d)
        e1 = np.array([0.0, 1.0, 0.0]) - d * d[1]
        e1 /= np.linalg.norm(e1)
        ang = np.degrees(np.arctan2(radial @ np.cross(d, e1), radial @ e1)) % 360.0
        off = gap(vp[hand])
        cover = len(np.unique((ang[off < 0.008] // 10).astype(int))) * 10
        return joints, vp, cover, off.min() >= -0.0005

    best = None
    for at in GRIP_ATS:
        for out in GRIP_OUTS:
            a = np.array([0.0, -out * fphand.KNUCKLES * k, fphand.WRIST + at * fphand.KNUCKLES * k])
            got = close(a)
            if got and got[3] and (best is None or got[2] > best[0]):
                best = (got[2], got[0], got[1], a)
    _, joints, vp, a = best
    # the fist's middle along the grip: halfway between the index's outer side and the little finger's
    fingers = (piece >= 1) & (_off(vp, a, d) < radius + 0.03)
    along = (vp[fingers] - a) @ d
    mid = a + d * (along.min() + along.max()) / 2
    _GRIPS[key] = (vp, mid, d, joints)
    return _GRIPS[key][:3]


def _held(S):
    """The arm as it is dressed, its hand closed on the grip by the bare hand's joints: plate rides the hand's pieces,
    so it closes with them. Gives its rest mesh and the posed vertices."""
    v, q, m = _rest_arm(S)
    vp, _, _ = grip(S)
    if len(v) != len(_bare_arm(S)[0]):
        vp = fparm.posed(v, _GRIPS[(*_arm_key(S), S['grip_r'])][3], S['hand'], 'L', S['cuff'])
    return v, q, m, vp


def _frame(d):
    """The dagger's axes in the arm's space, rows X, Y, Z: Z up the grip toward the index's end (the guard), Y out of
    the palm (a flat faces the palm, the other the back of the hand), X along the forearm."""
    z = -d
    y = np.array([0.0, -1.0, 0.0])
    y = y - z * (y @ z)
    y /= np.linalg.norm(y)
    return np.stack([np.cross(y, z), y, z])


MIRROR = np.array([-1.0, 1.0, 1.0])


def scene(S, pose=None):
    """The whole part at `pose`'s joints (their rest where it has none): (vertices, triangles, material a triangle),
    the right fist on the grip, the forearm turned at the wrist."""
    p = {**REST, **(pose or {})}
    v, q, m, vp = _held(S)
    _, mid, d = grip(S)
    k, c = S['hand'], S['cuff']
    R = fparm._RIGS[(k, c, len(v))]
    arm = 1.0 - R['w_wrist']
    vp = fphand._turn(vp, R['wrist'], [1.0, 0.0, 0.0], p['lean'], arm)
    vp = fphand._turn(vp, R['wrist'], [0.0, 1.0, 0.0], p['swing'], arm)
    av = (vp - mid) @ _frame(d).T
    pieces = [(av, q, m)] + [DESIGN.get('blade', _blade)(S)] + DESIGN.get('hilt', _hilt)(S)
    v, t, mats = _join(pieces)
    return v * MIRROR, t[:, ::-1].copy(), mats


def elbow(S, pose=None):
    """The elbow, the arm's root, in the part's space at `pose`'s wrist: the forearm runs from the fist to it, and on
    out of the view."""
    p = {**REST, **(pose or {})}
    v = _bare_arm(S)[0]
    _, mid, d = grip(S)
    R = fparm._RIGS[(S['hand'], S['cuff'], len(v))]
    e = fphand._turn(np.zeros((1, 3)), R['wrist'], [1.0, 0.0, 0.0], p['lean'], np.ones(1))
    e = fphand._turn(e, R['wrist'], [0.0, 1.0, 0.0], p['swing'], np.ones(1))
    return ((e - mid) @ _frame(d).T)[0] * MIRROR


def part(S):
    return scene(S)


def posed(v, pose, S):
    """The part at `pose`: made again at its joints (its vertices are the rest's, one for one)."""
    out = scene(S, pose)[0]
    assert len(out) == len(v), 'every pose keeps the part\'s vertices'
    return out


# what fpfit.py --shape fits, its steps and bounds: the blade alone, its size against the arm's hand (the arm is the
# punches', never fitted here). The guard is set by hand to Daggerfall's: fitted, it shrinks to nothing, its horns
# costing the outline a few texels more than they gain
SHAPE_KEYS = ('focal', 'blade_len', 'blade_w', 'tip')
SHAPE_STEP = {'blade_len': 0.015, 'guard_span': 0.15, 'spike': 0.08, 'pommel': 0.002, 'grip_r': 0.001,
              'guard_h': 0.002, 'guard_d': 0.002, 'grip_len': 0.004}
BOUNDS = {'blade_len': (0.15, 0.45), 'guard_span': (2.0, 5.0), 'spike': (0.4, 2.4), 'pommel': (0.01, 0.035),
          'grip_r': (0.008, 0.02), 'guard_h': (0.008, 0.03), 'guard_d': (0.012, 0.04), 'grip_len': (0.08, 0.13)}
# the reference's class each material is read against: the blade and the skull in the band the metal dye recolours,
# the brass guard in the tan a glove is drawn in, the stones' green the rest
CLASSES = {'dagger_blade': 5, 'dagger_groove': 5, 'pommel': 5, 'skull_dark': 5, 'hilt': 6, 'gem': 1, 'dagger_grip': 6}
# what the fit weighs: the dagger, one for one with Daggerfall's - its metal far first, the outline and the glove's tan
# a little. The arm is every picture's, not Daggerfall's bulkier dagger hand, so its outline cannot cover Daggerfall's
# and must not pull the dagger off Daggerfall's to try
WEIGHTS = {'sil': 0.15, 5: 1.0, 6: 0.12, 7: 0.04, 1: 0.02, 'light': 0.2}
# and, in the fit alone, the arm's sleeve: Daggerfall draws the dagger hand's sleeve off the band, so its place is read
# against those texels; the sleeve is drawn as every arm's is
FIT_CLASSES = {'linen': 1}


def palette():
    """The dagger's own materials, lit as the fitter lights them: the blade's and the skull's grey (the metal the dye
    recolours), the guard's brass and its green stones. The arm's garments are the forge's own (fpmodel.py)."""
    import materials
    from fpmodel import _diffuse
    return {
        # smooth, as Daggerfall draws its dagger: its light runs in clean gradients, never in grain
        'dagger_blade': _diffuse(materials.plain('dagger_blade', (0.58, 0.58, 0.58), rough=0.9)),
        'dagger_groove': _diffuse(materials.plain('dagger_groove', (0.16, 0.16, 0.16), rough=0.9)),
        # the skull's eyes, nose and teeth: near black, so the brightest lamp leaves them dark
        'skull_dark': _diffuse(materials.plain('skull_dark', (0.02, 0.02, 0.02), rough=0.9)),
        'hilt': _diffuse(materials.plain('hilt', (0.46, 0.31, 0.12), rough=0.9)),
        'gem': _diffuse(materials.plain('gem', (0.02, 0.13, 0.04), rough=0.8)),
        'pommel': _bone(_diffuse(materials.plain('pommel', (0.28, 0.28, 0.28), rough=0.8))),
        # a metal's own design's fittings, accent and glow (fpdaggers.py dresses them in the metal's colours)
        'dagger_fit': materials.polished('dagger_fit', (0.42, 0.42, 0.45), rough=0.3),
        'dagger_accent': materials.polished('dagger_accent', (0.6, 0.46, 0.16), rough=0.25),
        'dagger_glow': materials.plain('dagger_glow', (1.0, 0.42, 0.06), rough=0.5),
    }


BONE_GLOW = 0.4    # the skull's own light, under the lamp's


def _bone(m):
    """The skull's bone: Daggerfall draws it white in every frame, its face lit or not, so it carries a light of its
    own; its hollows and teeth are another material and stay dark."""
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Emission Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    b.inputs['Emission Strength'].default_value = BONE_GLOW
    return m


def seed(fr, S):
    """A first pose from the frame's classes: the blade is the metal, its far end the point; the fist is the glove's
    tan beside the blade's near end, its width giving its depth. Where no glove is drawn the fist is below the screen,
    under the blade's near end."""
    metal = fr.ref == 5
    tan = (fr.ref == 6) | (fr.ref == 7)
    ys, xs = np.nonzero(metal)
    x0, y0, cw, ch = fr.rect
    if len(xs) < 10:
        return None
    mpts = np.stack([xs + 0.5, ys + 0.5], axis=1)
    gy, gx = np.nonzero(tan)
    if len(gx) >= 30:
        gpts = np.stack([gx + 0.5, gy + 0.5], axis=1)
        centre = gpts.mean(axis=0)
        tip = mpts[np.argmax(np.linalg.norm(mpts - centre, axis=1))]
        root = mpts[np.argmin(np.linalg.norm(mpts - centre, axis=1))]
        # the fist: the glove within a hand's reach of the blade's root, its middle a little past the root
        near = gpts[np.linalg.norm(gpts - root, axis=1) < max(14.0, 0.35 * np.linalg.norm(tip - root))]
        fist = near.mean(axis=0) if len(near) >= 10 else centre
        width = max(np.ptp(near @ np.array([1.0, 0.0])) if len(near) else 10.0, 6.0)
    else:   # the blade alone: the fist below the screen, under its near end
        bottom = mpts[np.argmax(mpts[:, 1])]
        tip = mpts[np.argmin(mpts[:, 1])]
        fist = bottom + (bottom - tip) / max(np.linalg.norm(bottom - tip), 1.0) * 25.0
        width = 30.0
    depth = float(np.clip(S['focal'] * 0.1 * S['hand'] / width, 0.15, 1.2))
    return {'base': [float(fist[0]), float(fist[1])], 'depth': depth, 'tip': [float(tip[0]), float(tip[1])],
            'roll': 0.0}
