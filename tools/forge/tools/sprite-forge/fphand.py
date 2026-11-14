"""The first-person forge's hand: a left hand that opens and closes, under the arm's garments (fparm.py).

Each finger, the thumb and the palm are their own piece, each a tube shaped by numbers with the fingers straight
(`meshes`). A pose bends them by turning their vertices about their joints, each turned by its share of the joint's
angle where the joint's bend blends, so a knuckle bends as a tube does (`pose`). The fitter and the renderer bend the same mesh the same
way. The arm's space is fpmodel's: the elbow at the origin, the forearm up +Z to the wrist at WRIST, the back of the
hand +Y, the thumb toward -X (a left hand, its back to the eye, has its thumb on the right)."""
import math

import numpy as np

WRIST = 0.27   # elbow to wrist
KNUCKLES = 0.088   # wrist to the middle finger's knuckle, at hand 1

# the fingers, index to little: across the knuckles, how far back each knuckle sits, each joint's length, each's girth
# and its fan from the middle (degrees about Y)
FINGER_X = (-0.03, -0.0105, 0.0095, 0.028)
FINGER_BACK = (0.004, 0.0, 0.004, 0.014)
FINGER_LEN = ((0.042, 0.025, 0.021), (0.046, 0.029, 0.023), (0.043, 0.027, 0.022), (0.034, 0.02, 0.019))
FINGER_R = (0.0119, 0.0123, 0.0118, 0.0105)   # a thick glove's: pressed together
FINGER_FAN = (-3.0, -1.0, 1.0, 4.0)
SPREAD_SHARE = (-1.5, -0.5, 0.5, 1.5)   # each finger's share of the pose's `spread`
DIP_SHARE = 0.75                        # the last joint bends this share of the middle one's angle
# the thumb: its root in the palm by the wrist, its rest way (out to the side and forward, a little under the palm),
# its three bones and their girths
THUMB_ROOT = (-0.022, -0.01, 0.012)
THUMB_WAY = (-0.62, -0.25, 0.75)
THUMB_LEN = (0.04, 0.031, 0.027)
THUMB_R = (0.019, 0.0162, 0.0145)
THUMB_TOWARD = (0.5, -0.8, 0.2)         # the way its bend curls it: across the palm and under it
BLEND = (0.008, 0.006, 0.005)           # how far each side of a knuckle, middle joint and last joint the bend blends
KNUCKLE_SKIN = 2.0                      # a fused hand's knuckle bends across this many times as wide a band
WRIST_BLEND = 0.014

# the pose's joints beyond the arm's place: (name, the fit's step, its bounds, the prior's unit, its rest), degrees
JOINTS = (
    ('knuckle', 12.0, (-20.0, 100.0), 30.0, 0.0),     # the fingers' knuckles, bent toward the palm
    ('fold', 12.0, (-10.0, 115.0), 30.0, 0.0),        # their middle joints (the last joints follow, DIP_SHARE)
    ('spread', 3.0, (-6.0, 30.0), 10.0, 0.0),         # the fingers fanned apart (a casting claw's widest)
    ('thumb_in', 10.0, (-45.0, 95.0), 30.0, 0.0),     # the thumb turned from out beside the palm to under it
    ('thumb_bend', 10.0, (-15.0, 85.0), 30.0, 0.0),   # its two joints bent
    ('wrist', 8.0, (-70.0, 70.0), 25.0, 0.0),         # the wrist bent toward the palm
    ('tilt', 6.0, (-35.0, 35.0), 20.0, 0.0),          # and toward the little finger
)
# each finger's own curl beyond the hand's, index to little, for a hand whose fingers move apart (the casting claw):
# most of it at the middle and last joints, a share at the knuckle
CURLS = tuple((f'{n}_curl', 8.0, (-20.0, 90.0), 25.0, 0.0) for n in ('index', 'middle', 'ring', 'little'))
CURL_KNUCKLE = 0.35   # the share of a finger's own curl its knuckle takes
# a punch's: the same joints held to a fist - from a tight one to a loose one curled round a tunnel, the thumb across
# the fingers' middle joints - the wrist free
FIST = {'knuckle': 88.0, 'fold': 100.0, 'spread': 0.0, 'thumb_in': 55.0, 'thumb_bend': 45.0, 'wrist': 0.0, 'tilt': 0.0}
FIST_REACH = {'knuckle': (55.0, 105.0), 'fold': (55.0, 115.0), 'spread': (-6.0, 8.0), 'thumb_in': (25.0, 90.0),
              'thumb_bend': (10.0, 75.0)}
FIST_JOINTS = tuple((n, step / 2, FIST_REACH.get(n, lim), unit, FIST[n]) for n, step, lim, unit, _ in JOINTS)


def _unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / np.linalg.norm(v)


def _fan(deg):
    a = math.radians(deg)
    return np.array([math.sin(a), 0.0, math.cos(a)])


def _knuckle(i):
    return np.array([FINGER_X[i], -0.002, WRIST + KNUCKLES - FINGER_BACK[i]])


def _gauss(s, at, width):
    return np.exp(-0.5 * ((s - at) / width) ** 2)


def _tube(a, way, up, s, w, h, lift=None, wl=None, hb=None, drop=0.0, power=2.6, n=24):
    """A tube along the line from `a` the way `way`, its rings at distances `s`: each a superellipse (`power`: 2 round,
    more squarer) `w` to each side (`wl` the -side's, else `w`) and `h` up (`hb` down, else `h`), its back lifted by
    `lift` (a knuckle's bump: on the back alone) and its middle `drop` below the line. Both ends closed. Returns
    (vertices, triangles)."""
    way = _unit(way)
    up = _unit(np.asarray(up, float) - way * (np.asarray(up, float) @ way))
    side = np.cross(up, way)
    th = np.linspace(0.0, 2 * np.pi, n, endpoint=False)
    c, sn = np.cos(th), np.sin(th)
    ex, ey = np.sign(c) * np.abs(c) ** (2 / power), np.sign(sn) * np.abs(sn) ** (2 / power)
    wl = w if wl is None else wl
    hb = h if hb is None else hb
    lift = np.zeros_like(s) if lift is None else lift
    rows = []
    for k in range(len(s)):
        x = np.where(c > 0, w[k], wl[k]) * ex
        y = np.where(sn > 0, h[k] + lift[k] * np.maximum(sn, 0.0) ** 2, hb[k]) * ey - drop
        rows.append(a + np.outer(np.full(n, s[k]), way) + np.outer(x, side) + np.outer(y, up))
    v = np.concatenate(rows + [(a + way * s[0])[None], (a + way * s[-1])[None]])
    tris = []
    for k in range(len(s) - 1):
        for j in range(n):
            p, q = k * n + j, k * n + (j + 1) % n
            tris += [(p, q, q + n), (p, q + n, p + n)]
    first, last = len(v) - 2, len(v) - 1
    for j in range(n):
        tris += [(first, (j + 1) % n, j), (last, (len(s) - 1) * n + j, (len(s) - 1) * n + (j + 1) % n)]
    return v, np.array(tris, dtype=np.int64)


def _rounded(s, end, r):
    """How much of a tube's girth is left toward its rounded end at `end`, over its last `r`: a quarter circle."""
    t = np.clip((s - (end - r)) / r, 0.0, 1.0)
    return np.sqrt(np.maximum(1.0 - t * t, 0.0)) * 0.97 + 0.03


def _finger_profile(i, long=1.0, slim=1.0):
    """A finger's tube by numbers: its rings' places along it `s`, their half widths, half heights and the lift of
    their backs, and how far its middle drops below its line."""
    r, (L1, L2, L3) = FINGER_R[i] * slim, (x * long for x in FINGER_LEN[i])
    end = L1 + L2 + L3
    s = np.concatenate([np.linspace(-0.02, end - 0.9 * r, 44), end - 0.9 * r + 0.9 * r * np.sin(np.linspace(0.08, 1.0, 10) * np.pi / 2)])
    g = (np.interp(s, [-0.02, -0.008, 0.0, L1, L1 + L2, end], [0.9, 1.04, 1.04, 0.95, 0.89, 0.84])
         + 0.07 * _gauss(s, 0.0, 0.004) + 0.045 * _gauss(s, L1, 0.0035) + 0.035 * _gauss(s, L1 + L2, 0.003)
         - 0.035 * _gauss(s, L1 + 0.008, 0.003) - 0.03 * _gauss(s, L1 + L2 + 0.006, 0.0025))
    w = r * g * _rounded(s, end, 0.9 * r)
    lift = r * (0.3 * _gauss(s, 0.0, 0.005) + 0.14 * _gauss(s, L1, 0.004) + 0.1 * _gauss(s, L1 + L2, 0.0035))
    return s, w, 0.82 * w, lift, 0.05 * r


def _finger(i, long=1.0, slim=1.0):
    """One finger straight along its fan, in a thick glove: a little flatter than round, a proud knuckle where it
    leaves the hand, each joint a rounded bump on its back with a slight waist past it, tapering to a rounded tip;
    `long` times its length and `slim` times its girth."""
    s, w, h, lift, drop = _finger_profile(i, long, slim)
    return _tube(_knuckle(i), _fan(FINGER_FAN[i]), (0.0, 1.0, 0.0), s, w, h, lift=lift, drop=drop)


def _finger_field(P, i, long=1.0, slim=1.0):
    """A finger's distance field: its tube's (`_finger`) rings as a superellipse swept along its line."""
    s, w, h, lift, drop = _finger_profile(i, long, slim)
    a, way = _knuckle(i), _fan(FINGER_FAN[i])
    up = _unit(np.array([0.0, 1.0, 0.0]) - way * way[1])
    side = np.cross(up, way)
    q = P - a
    t = q @ way
    W, H, Hb = np.interp(t, s, w), np.interp(t, s, h + lift), np.interp(t, s, h)
    d = _superellipse(q @ side, q @ up + drop, W, W, H, Hb, 2.6)
    return np.maximum(d, np.maximum(s[0] - t, t - s[-1]))


def _superellipse(x, y, w, wl, h, hb, power):
    """How far outside a superellipse section a point (x, y) lies, about in metres: its radial measure less one, times
    the section's narrowest half."""
    W = np.where(x > 0, w, wl)
    H = np.where(y > 0, h, hb)
    rho = (np.abs(x / W) ** power + np.abs(y / H) ** power) ** (1.0 / power)
    return (rho - 1.0) * np.minimum(W, H)


def _palm_field(P):
    """The palm's distance field: a broad, flat slab, squarer than round, widening from the wrist to the knuckles and
    thinning, its back gently domed, the thumb's pad full on its side, rounded off where the fingers leave it."""
    z = P[:, 2] - WRIST
    u = z / KNUCKLES
    end = 1.0 - 0.01 / KNUCKLES
    roll = _rounded(u, end, 0.3)
    w = np.interp(u, [-0.3, 0.0, 0.35, 0.7, 1.0], [0.029, 0.031, 0.04, 0.044, 0.045]) * (0.72 + 0.28 * roll)
    wl = w + 0.007 * _gauss(u, 0.35, 0.2)
    h = np.interp(u, [-0.3, 0.0, 0.6, 1.0], [0.021, 0.021, 0.017, 0.016]) * (0.3 + 0.7 * roll)
    h = h + 0.004 * _gauss(u, 0.55, 0.3) * np.clip(1.0 - (P[:, 0] / w) ** 2, 0.0, 1.0)   # the back's dome
    hb = h + 0.004 * _gauss(u, 0.45, 0.25)
    d = _superellipse(P[:, 0], P[:, 1], w, wl, h, hb, 3.2)
    return np.maximum(d, np.maximum(-0.024 - z, z - (KNUCKLES - 0.01)))


def _thumb_field(P):
    """The thumb's distance field: a tapered tube from a broad root in the heel of the hand, a rounded tip."""
    a = np.array([THUMB_ROOT[0], THUMB_ROOT[1], WRIST + THUMB_ROOT[2]])
    d = _unit(THUMB_WAY)
    up = np.array([-0.55, 0.8, 0.0])
    up = _unit(up - d * (up @ d))
    side = np.cross(up, d)
    Lm, Lp, Ld = THUMB_LEN
    end = Lm + Lp + Ld
    q = P - a
    s = q @ d
    sc = np.clip(s, -0.014, end)
    g = np.interp(sc, [-0.014, 0.012, Lm, Lm + Lp, end], [1.25, 1.18, 0.9, 0.82, 0.76]) + 0.05 * _gauss(sc, Lm, 0.004)
    w = THUMB_R[0] * g * np.maximum(_rounded(sc, end, 0.012), 0.08)
    h = 0.85 * w + THUMB_R[0] * (0.12 * _gauss(sc, Lm, 0.005) + 0.1 * _gauss(sc, Lm + Lp, 0.004)) * (q @ up > 0)
    dd = _superellipse(q @ side, q @ up, w, w, h, 0.85 * w, 2.2)
    return np.maximum(dd, np.maximum(-0.014 - s, s - end))


def _smin(a, b, k):
    """A smooth union of two distance fields, blended within `k`: no seam where one grows from the other."""
    h = np.clip(k - np.abs(a - b), 0.0, None) / k
    return np.minimum(a, b) - h * h * k / 4.0


WEB = 0.008   # how wide the thumb's root blends into the palm
_PALM = {}


def _palm_thumb(res=0.002):
    """The palm and the thumb as one surface, the thumb grown from the heel of the hand with no seam: their fields
    smoothly joined (WEB) and meshed (marching cubes), made once a process."""
    if 'mesh' not in _PALM:
        from skimage.measure import marching_cubes
        lo = np.array([-0.1, -0.07, WRIST - 0.03])
        hi = np.array([0.058, 0.04, WRIST + KNUCKLES + 0.01])
        n = np.ceil((hi - lo) / res).astype(int) + 1
        axes = [lo[i] + np.arange(n[i]) * res for i in range(3)]
        X, Y, Z = np.meshgrid(*axes, indexing='ij')
        P = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
        f = _smin(_palm_field(P), _thumb_field(P), WEB).reshape(n)
        v, t, _, _ = marching_cubes(f, 0.0, spacing=(res, res, res))
        v = v + lo
        # its faces turned to face out: the field rises outward
        c = v[t].mean(axis=1)
        nrm = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
        out = _smin(_palm_field(c + nrm * 1e-3 / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)),
                    _thumb_field(c + nrm * 1e-3 / np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)), WEB)
        if np.mean(out > _smin(_palm_field(c), _thumb_field(c), WEB)) < 0.5:
            t = t[:, ::-1]
        _PALM['mesh'] = (v.astype(np.float64), t.astype(np.int64))
    return _PALM['mesh']


PIECES = ('palm', 'f0', 'f1', 'f2', 'f3')


def _thumb_girth(v, girth):
    """The palm's piece with its thumb made `girth` times as thick about its own line, as far as each vertex is the
    thumb's (as `rig` weighs it), so the web still blends."""
    if girth == 1.0:
        return v
    a = np.array([THUMB_ROOT[0], THUMB_ROOT[1], WRIST + THUMB_ROOT[2]])
    d = _unit(THUMB_WAY)
    s = (v - a) @ d
    on = a + np.outer(s, d)
    w = _smooth((s - 0.002) / 0.018) * _smooth((0.03 - np.linalg.norm(v - on, axis=1)) / 0.012)
    return on + (v - on) * (1.0 + (girth - 1.0) * w)[:, None]


JOIN = 0.005   # how wide each finger's root blends into the hand, so no seam shows at its knuckle
_FUSED = {}


def fused(thumb=1.0, fingers=1.0, slim=1.0, res=0.002):
    """The whole hand as one surface: the palm, the thumb and the fingers, each finger's root blended into the hand
    (JOIN) as the thumb's is (WEB), the fingers apart, so a groove stays between them and no seam shows at a knuckle.
    Meshed once (marching cubes); each vertex is the piece whose own surface it lies nearest. Gives (vertices,
    triangles, the piece of each vertex, an index into PIECES)."""
    key = (thumb, fingers, slim, res)
    if key not in _FUSED:
        from skimage.measure import marching_cubes
        reach = max(sum(FINGER_LEN[i]) for i in range(4)) * fingers
        lo = np.array([-0.1, -0.07, WRIST - 0.03])
        hi = np.array([0.075, 0.045, WRIST + KNUCKLES + reach + 0.012])
        n = np.ceil((hi - lo) / res).astype(int) + 1
        axes = [lo[i] + np.arange(n[i]) * res for i in range(3)]
        X, Y, Z = np.meshgrid(*axes, indexing='ij')

        def fields(P):
            hand = _smin(_palm_field(P), _thumb_field(P), WEB)
            each = np.stack([_finger_field(P, i, fingers, slim) for i in range(4)])
            return _smin(hand, each.min(axis=0), JOIN), np.concatenate([hand[None], each])
        f = fields(np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1))[0].reshape(n)
        v, t, _, _ = marching_cubes(f, 0.0, spacing=(res, res, res))
        v = v + lo
        c = v[t].mean(axis=1)   # its faces turned to face out: the field rises outward
        nrm = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
        nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
        if np.mean(fields(c + nrm * 1e-3)[0] > fields(c)[0]) < 0.5:
            t = t[:, ::-1]
        piece = np.argmin(fields(v)[1], axis=0)
        v = _thumb_girth(v, thumb) if thumb != 1.0 else v
        _FUSED[key] = (v.astype(np.float64), t.astype(np.int64), piece.astype(np.int64))
    return _FUSED[key]


def meshes(thumb=1.0, fingers=1.0, slim=1.0):
    """Each piece's mesh, straight, by name: (vertices, triangles). The palm's piece holds the thumb, grown from it
    with no seam, `thumb` times as thick; each finger is its own, `fingers` times as long and `slim` times as thick,
    so a groove stays between fingers."""
    v, t = _palm_thumb()
    return {'palm': (_thumb_girth(v, thumb), t), **{f'f{i}': _finger(i, fingers, slim) for i in range(4)}}


def rig(v, piece, hand_k, fingers=1.0, fused=False):
    """Each vertex's place on its piece's bones, from the hand's rest mesh `v` (the arm's space, the hand grown
    `hand_k` about the wrist) and the piece each vertex is (`piece`, an index into PIECES, -1 the forearm): what `pose`
    turns; its fingers `fingers` times as long. A `fused` hand is one surface: each knuckle bends across a wider band,
    and the palm's end over it follows it as skin does, so the surface bends without a crease. Returns a dict of
    arrays."""
    wrist = np.array([0.0, 0.0, WRIST])
    grow = lambda p: wrist + (np.asarray(p) - wrist) * hand_k   # noqa: E731
    out = {'piece': piece, 'k': hand_k, 'wrist': wrist,
           'w_wrist': _smooth((v[:, 2] - (WRIST - WRIST_BLEND * hand_k)) / (2 * WRIST_BLEND * hand_k))}
    for i in range(4):
        d = _fan(FINGER_FAN[i])
        a = grow(_knuckle(i))
        s = (v - a) @ d
        L1, L2, _ = (x * hand_k * fingers for x in FINGER_LEN[i])
        b0, b1, b2 = (x * hand_k for x in BLEND)
        on = piece == PIECES.index(f'f{i}')
        k0 = KNUCKLE_SKIN * b0 if fused else b0
        out[f'f{i}'] = {'on': on, 'way': d, 'mcp': a, 'pip': a + d * L1, 'dip': a + d * (L1 + L2),
                        'w': [_smooth((s + k0) / (2 * k0)), _smooth((s - L1 + b1) / (2 * b1)),
                              _smooth((s - L1 - L2 + b2) / (2 * b2))]}
    # the thumb is the palm piece's: a vertex is the thumb's as far as it lies past the thumb's root and near its line,
    # so the web between it and the hand stretches as it turns
    d = _unit(THUMB_WAY)
    a = grow([THUMB_ROOT[0], THUMB_ROOT[1], WRIST + THUMB_ROOT[2]])
    s = (v - a) @ d
    across = np.linalg.norm((v - a) - np.outer(s, d), axis=1)
    thumb = (piece == PIECES.index('palm')) * _smooth((s + 0.004 * hand_k) / (0.02 * hand_k)) \
        * _smooth((0.03 * hand_k - across) / (0.012 * hand_k))
    if fused:   # the palm's end over each knuckle bends with it, shared between neighbouring fingers
        palm = (piece == PIECES.index('palm')) * (1.0 - thumb)
        near = np.array([np.exp(-0.5 * ((v[:, 0] - out[f'f{i}']['mcp'][0]) / (0.0095 * hand_k)) ** 2)
                         for i in range(4)])
        share = near / np.maximum(near.sum(axis=0), 1e-9)
        k0 = KNUCKLE_SKIN * BLEND[0] * hand_k
        for i in range(4):
            F = out[f'f{i}']
            F['palm'] = palm * share[i] * _smooth(((v - F['mcp']) @ F['way'] + k0) / (2 * k0))
    Lm, Lp, _ = (x * hand_k for x in THUMB_LEN)
    b = BLEND[1] * hand_k
    out['thumb'] = {'on': thumb > 0, 'way': d, 'cmc': a, 'mcp': a + d * Lm, 'ip': a + d * (Lm + Lp),
                    'w': [thumb, thumb * _smooth((s - Lm + b) / (2 * b)), thumb * _smooth((s - Lm - Lp + b) / (2 * b))]}
    return out


def _smooth(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def _turn(v, pivot, axis, deg, w):
    """`v` turned about `axis` through `pivot`, each vertex by its weight `w` of `deg` degrees (Rodrigues')."""
    if not deg:
        return v
    a = np.radians(deg) * w
    k = _unit(axis)
    p = v - pivot
    c, s = np.cos(a)[:, None], np.sin(a)[:, None]
    return pivot + p * c + np.cross(k, p) * s + k * (p @ k)[:, None] * (1.0 - c)


def pose(v, R, P):
    """The rest mesh `v` bent to pose `P` (its JOINTS' values, degrees) by rig `R`: each finger's last, middle and first
    knuckles, the thumb's joints and its turn under the palm, then the wrist, each about its pivot at rest."""
    out = v.copy()
    get = lambda n: float(P.get(n, 0.0))   # noqa: E731
    knuckle, fold, spread = get('knuckle'), get('fold'), get('spread')
    for i in range(4):
        F = R[f'f{i}']
        on = F['on']
        if not on.any():
            continue
        x = out[on]
        own = get(CURLS[i][0])   # the finger's own curl, if the pose gives it one, and its own knuckle
        own_k = get(CURLS[i][0].replace('_curl', '_knuckle'))
        flex = np.cross([0.0, 1.0, 0.0], F['way'])   # a finger's bend takes it toward the palm (-Y)
        x = _turn(x, F['dip'], flex, (fold + own) * DIP_SHARE, F['w'][2][on])
        x = _turn(x, F['pip'], flex, fold + own, F['w'][1][on])
        x = _turn(x, F['mcp'], flex, knuckle + CURL_KNUCKLE * own + own_k, F['w'][0][on])
        x = _turn(x, F['mcp'], [0.0, 1.0, 0.0], spread * SPREAD_SHARE[i], F['w'][0][on])
        out[on] = x
        if 'palm' in F:   # a fused hand's palm end over this knuckle, following it
            skin = F['palm'] > 0
            out[skin] = _turn(out[skin], F['mcp'], flex, knuckle + CURL_KNUCKLE * own + own_k, F['palm'][skin])
    T = R['thumb']
    on = T['on']
    if on.any():
        x = out[on]
        bend = np.cross(T['way'], _unit(THUMB_TOWARD))
        x = _turn(x, T['ip'], bend, get('thumb_bend') * 0.9, T['w'][2][on])
        x = _turn(x, T['mcp'], bend, get('thumb_bend'), T['w'][1][on])
        x = _turn(x, T['cmc'], [0.0, 0.0, 1.0], get('thumb_in'), T['w'][0][on])
        out[on] = x
    out = _turn(out, R['wrist'], [1.0, 0.0, 0.0], get('wrist'), R['w_wrist'])
    out = _turn(out, R['wrist'], [0.0, 1.0, 0.0], get('tilt'), R['w_wrist'])
    return out
