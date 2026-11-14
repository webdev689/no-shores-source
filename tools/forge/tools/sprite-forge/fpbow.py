"""The first-person bow (WEAPON09.CIF): the bow, its string, an arrow and both arms, one part posed as one picture.

The part's space is the bow's: its root the grip's middle, its axis +Z up the upper limb, the string toward -Y (the
archer), +X to the archer's right. The bow is braced: each limb bends back as an arc until the string, straight between
the tips, stands `brace` from the grip. Drawn, the limbs bend further so the string keeps its length, the nock pulled
back `draw` of `draw_len`. The arrow lies from the nock over the bow hand, left of the stave; the right hand pinches
its nock between thumb and index, its other fingers hooked on the string. Both arms are the one arm every first-person
hand wears (fparm.py): the left fist round the grip, the right hand drawing. An arm or the arrow taken away
(`hand_r`, `arrow` under a half) shrinks to a point, so every pose keeps the part's vertices."""
import math

import numpy as np

import bows
import fparm
import fphand

# the bow's sizes: a long bow by default, Daggerfall's (a short bow is shorter, recurved: BOW_TYPES)
SHAPE = {
    'bow_len': 0.8,      # metres from the grip to each tip, along the limb
    'bow_w': 0.034,      # a limb's width at the grip
    'bow_t': 0.024,      # its thickness, back to belly
    'brace': 0.16,       # the braced string's distance from the grip
    'draw_len': 0.25,    # how far back a full draw pulls the nock past the brace
    'recurve': 0.0,      # radians the last share of each limb turns forward
    'grip_len': 0.11,    # the wrap's length
    'fist_z': 0.0,       # where the bow fist's middle sits up the wrap
    'rest_z': 0.0,       # and where the arrow lies on it, over the fist
    'draw_hand': 1.0,    # the drawing arm's size about the nock: Daggerfall paints the near hand as big as the far
    'arrow_len': 0.46,   # nock to point: at full draw its point reaches the bow, as Daggerfall's
    'hand': 1.0,         # the gloved hands' size (the arm's own)
    'arm_r': 1.0,        # the sleeves' girth
    'cuff': 1.8,         # the gloves' cuff
    'thumb': 1.0,
}
# a bow type's own bow over the long bow's fitted one: its limbs' length and width a share of the long bow's, and its
# tips' recurve; the hands, the draw and the arrow stay the archive's, so every type plays the same shot
BOW_TYPES = {
    'Long': {},
    'Short': {'bow_len': 0.5, 'bow_w': 0.85, 'recurve': 0.7},
}
SCALED = ('bow_len', 'bow_w')   # a type's shares; the rest of its values stand as they are


def typed(S, kind):
    """Shape `S` as bow type `kind` draws it."""
    own = BOW_TYPES[kind]
    return {**S, **{k: S[k] * v if k in SCALED else v for k, v in own.items()}}
AXIS = 0.8   # metres up the axis a pose aims along: every bow type's, so a short bow stands where the long bow does
# the bow's and the arrow's own, then the warhammer's a metal's make wears (bows.py): its motif's metal, its fittings in
# the metal's own colours and its grip's leather
BOW_MATS = ('wood', 'wrap', 'string', 'shaft', 'fletch', 'head', 'collar', 'vein', 'hammer_head', 'hammer_accent',
            'hammer_grip')
MATS = fparm.mats() + BOW_MATS
EXTRA = ('plate', 'glow', 'mail', 'dark', 'shade', 'strap')   # an armour set's own, past the bow's (fparmour.py EXTRA)
SHEETS = ('fletch',)   # two-sided: a vane is a sheet, seen from either side


def mats(armour=None):
    """The part's materials as its triangles count them: the arms' outfit, the bow's, and an armour set's own."""
    if not armour:
        return MATS
    import fparmour
    return fparm.mats(fparmour.OUTFITS.get(armour, fparmour.OUTFITS['plate'])) + BOW_MATS + EXTRA
WOOD, WRAP, STRING, SHAFT, FLETCH, HEAD, COLLAR, VEIN, MOTIF, ACCENT, GRIP = range(len(fparm.mats()), len(MATS))
# a make's stuffs (bows.py) as the bow's materials: its sleeves and stave of metal graded and dyed as the collars are
STUFF = {'wood': WOOD, 'metal': COLLAR, 'head': MOTIF, 'accent': ACCENT, 'grip': GRIP, 'vein': VEIN, 'cord': STRING}
# (name, the fit's step, its bounds, the prior's unit, its rest): the draw, the arrow and the drawing hand there or
# not, the drawing hand's turn about the arrow it holds, the bow arm's turn about the grip and its forearm's lean
JOINTS = (
    ('draw', 0.04, (0.0, 1.0), 0.3, 0.0),
    ('arrow', 0.0, (0.0, 1.0), 1.0, 1.0),
    ('loose', 0.0, (0.0, 40.0), 1.0, 0.0),        # metres the loosed arrow has flown, leaving the rest
    ('fly_yaw', 0.0, (-60.0, 60.0), 10.0, 0.0),   # the way it flies off its line: about the stave's axis
    ('fly_pitch', 0.0, (-60.0, 60.0), 10.0, 0.0),   # and about the bow's width
    ('hand_r', 0.0, (0.0, 1.0), 1.0, 1.0),
    ('r_roll', 6.0, (-180.0, 180.0), 30.0, 0.0),  # the drawing hand about the arrow, its index above it at 0
    ('r_hook', 6.0, (0.0, 100.0), 30.0, 60.0),    # its other fingers' knuckles, hooked under the arrow
    ('r_curl', 6.0, (0.0, 115.0), 30.0, 95.0),    # and their middle joints
    ('l_turn', 4.0, (-90.0, 90.0), 20.0, 0.0),    # the bow arm about the stave
    ('l_lean', 4.0, (-40.0, 40.0), 20.0, 0.0),    # its forearm swung up or down at the wrist, the fist on the grip
)
REST = {j[0]: j[4] for j in JOINTS}
RINGS = 32                 # rings along each limb
SHAFT_R = 0.0055   # the arrow's shaft: as thick as Daggerfall paints it
VANE, VANE_TEETH = (0.015, 0.1, 0.02), 10   # a vane's start and end along the shaft from the nock, its height; barbs
VANE_SWEEP = 0.35   # how far back toward the nock a barb runs for each metre out
VANE_TURN = 15.0   # degrees the first vane stands about the shaft from the archer's right, toward the upper limb


def _join(pieces):
    """Meshes as one: each piece (vertices, triangles, a material for all its triangles or one each)."""
    vs, ts, ms, base = [], [], [], 0
    for v, t, m in pieces:
        vs.append(np.asarray(v, float))
        ts.append(np.asarray(t, np.int64) + base)
        ms.append(np.broadcast_to(np.asarray(m, np.int64), (len(t),)))
        base += len(v)
    return np.concatenate(vs), np.concatenate(ts), np.concatenate(ms)


def _bend(S, theta, n=RINGS):
    """One limb from the grip (t 0) to its tip (t 1): straight through the riser, then bent `theta` radians as an
    arc, its last share recurved forward: (points (n, 2) as (y, z), each ring's angle back from +Z)."""
    t = np.linspace(0.0, 1.0, n)
    rc = S['recurve'] * np.clip((t - 0.72) / 0.28, 0.0, 1.0) ** 2
    ride = riser(S) / S['bow_len']   # the riser's share of the limb: rigid, so the bend starts past it
    ang = theta * np.clip((t - ride) / max(1.0 - ride, 1e-6), 0.0, 1.0) - rc
    step = S['bow_len'] / (n - 1)
    dz, dy = np.cos(ang) * step, -np.sin(ang) * step
    z = np.concatenate([[0.0], np.cumsum((dz[1:] + dz[:-1]) / 2)])
    y = np.concatenate([[0.0], np.cumsum((dy[1:] + dy[:-1]) / 2)])
    return np.stack([y, z], axis=1), ang


def _theta_for(S, f, lo=0.0, hi=2.5):
    """The bend whose `f(points)` is zero, by halving (f rises with the bend)."""
    for _ in range(48):
        mid = (lo + hi) / 2
        if f(_bend(S, mid)[0]) > 0:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def bow_curve(S, draw):
    """The limb's bend at `draw`: braced, the tip `brace` behind the grip; drawn, bent until the string reaches the nock
    at its length. Gives (points, angles, the nock's distance behind the grip)."""
    braced = _theta_for(S, lambda p: -p[-1, 0] - S['brace'])
    tip = _bend(S, braced)[0][-1]
    half = tip[1]   # the braced string's half-length
    back = S['brace'] + max(0.0, draw) * S['draw_len']
    theta = braced if draw <= 0 else _theta_for(
        S, lambda p: half - math.hypot(p[-1, 1], back + p[-1, 0]), lo=braced)
    pts, ang = _bend(S, theta)
    return pts, ang, back


def riser(S):
    """How far from the grip's middle the bow is rigid: the wrap and its collar; each limb bends past it."""
    return S['grip_len'] / 2 + 2 * COLLAR_HALF


def _limbs(S, draw, straight=False):
    """Both limbs and the grip's wrap, in the metal's make (bows.py), the limbs unbent if `straight`: (vertices,
    triangles, material a triangle)."""
    from fpmodel import loft
    pts, ang, _ = bow_curve(S, draw)
    if straight:
        pts, ang = _bend(S, 0.0)
    out = []
    t = np.linspace(0.0, 1.0, len(pts))
    a = S['bow_w'] / 2 * (1.0 - 0.6 * t)
    b = S['bow_t'] / 2 * (1.0 - 0.45 * t)
    look = bows.look(S.get('metal'))   # each metal's own make (bows.py), Daggerfall's plain bow for none
    span = min(bows.SEEN, S['bow_len'] - riser(S))   # a short bow's make drawn up its shorter limb
    for sign in (1.0, -1.0):   # the upper limb, then the lower mirrored through the grip
        c = np.stack([np.zeros(len(pts)), pts[:, 0], sign * pts[:, 1]], axis=1)
        w = np.stack([np.zeros(len(pts)), np.cos(ang), sign * np.sin(ang)], axis=1)   # the limb's own back
        out += [(v, q, STUFF[k]) for v, q, k in bows.limb(look, c, w, a, b, (1.0, 0.0, 0.0), span=span,
                                                          riser=riser(S))]
    g = S['grip_len'] / 2
    z = np.linspace(-g, g, 16)
    along = lambda zz: (np.zeros(len(zz)), np.zeros(len(zz)), zz)   # noqa: E731
    v, q = loft(np.stack(along(z), axis=1), np.tile([1.0, 0.0, 0.0], (16, 1)), np.tile([0.0, 1.0, 0.0], (16, 1)),
                np.full(16, wrap_r(S)), np.full(16, wrap_r(S)), n=16, caps=(True, True))   # round, as a grip is
    out.append((v, q, WRAP))
    out += [(v, q, STUFF[k]) for v, q, k in bows.grip(look, wrap_r(S), g)]
    for end in (-1.0, 1.0) if look.get('collars', True) else ():
        # a rounded collar binding each end of the wrap, as Daggerfall's dark rings are
        cz = np.linspace(-1.0, 1.0, 9)
        r = wrap_r(S) + (collar_r(S) - wrap_r(S)) * np.sqrt(np.clip(1.0 - cz ** 2, 0.0, 1.0))
        v, q = loft(np.stack(along(end * g + cz * COLLAR_HALF), axis=1), np.tile([1.0, 0.0, 0.0], (9, 1)),
                    np.tile([0.0, 1.0, 0.0], (9, 1)), r, r, n=16, caps=(True, True))
        out.append((v, q, COLLAR))
    return _join(out), pts


COLLAR_HALF = 0.011   # half a collar's length along the stave

def stave_r(S, z):
    """How far the stave reaches from its axis at height `z` up it, a glove's thickness out: its wrap, each collar's
    bulge, then the limb's half width."""
    g, z = S['grip_len'] / 2, np.abs(np.asarray(z, float))
    bulge = np.sqrt(np.clip(1.0 - ((z - g) / COLLAR_HALF) ** 2, 0.0, 1.0))
    r = np.where(z < g + COLLAR_HALF, wrap_r(S) + (collar_r(S) - wrap_r(S)) * bulge * (z > g - COLLAR_HALF),
                 S['bow_w'] / 2)
    return r + GLOVE


def wrap_r(S):
    """The grip's wrap's radius."""
    return S['bow_w'] * 0.54


def collar_r(S):
    """A collar's radius at its widest."""
    return S['bow_w'] * 0.72


def _tube(pts, r, n=6):
    """A thin tube along a polyline."""
    from fpmodel import loft
    pts = np.asarray(pts, float)
    d = np.gradient(pts, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-12
    ref = np.where(np.abs(d[:, [0]]) < 0.9, [[1.0, 0.0, 0.0]], [[0.0, 1.0, 0.0]])
    u = np.cross(d, ref)
    u /= np.linalg.norm(u, axis=1, keepdims=True) + 1e-12
    w = np.cross(d, u)
    rr = np.broadcast_to(np.asarray(r, float), (len(pts),))
    return loft(pts, u, w, rr, rr, n=n)


def nock_point(S, draw, rest):
    """Where the arrow's nock sits on the string: `back` behind the grip, level with the arrow's `rest`."""
    _, _, back = bow_curve(S, draw)
    return np.array([0.0, -back, rest[2]])


def rest_point(S, draw, hand):
    """Where the arrow lies on the bow hand: beside the stave on its left, and as low as it lies over every part of
    the bow arm `hand` (its posed vertices) from its nock to its point, a glove's thickness clear: on the web of the
    thumb and index, as an arrow lies on the hand that holds the bow."""
    x = -(wrap_r(S) + SHAFT_R + 0.0005)
    _, _, back = bow_curve(S, draw)
    nock, rest = np.array([0.0, -back]), np.array([x, 0.0])
    d = (rest - nock) / np.linalg.norm(rest - nock)
    rel = hand[:, :2] - nock
    along = rel @ d
    off = np.linalg.norm(rel - np.outer(along, d), axis=1)
    c = SHAFT_R + GLOVE
    under = (off < c) & (along > -c) & (along < S['arrow_len'] + c)   # under the arrow's line, seen from above
    z = S['rest_z']
    if under.any():
        z = max(z, float((hand[under, 2] + np.sqrt(c * c - off[under] ** 2)).max()))
    return np.array([x, 0.0, z])


def _arrow(S, nock, rest):
    """The arrow from the nock over the rest: its shaft, its point and its three vanes."""
    d = rest - nock
    d /= np.linalg.norm(d)
    L = S['arrow_len']
    shaft = _tube([nock + d * s for s in np.linspace(0.0, L - 0.04, 6)], SHAFT_R)
    side = np.cross(d, [0.0, 0.0, 1.0])
    side /= np.linalg.norm(side)
    up = np.cross(side, d)
    tip = nock + d * L
    base = nock + d * (L - 0.05)
    head = np.array([tip, base + side * 0.011, base + up * 0.004, base - side * 0.011, base - up * 0.004,
                     base - d * 0.008])
    hq = np.array([[0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 1, 4], [5, 1, 2], [5, 2, 3], [5, 3, 4], [5, 4, 1]])   # outward
    vanes = []
    for k in range(3):   # three vanes a third of a turn apart
        a = math.radians(VANE_TURN) + k * 2 * math.pi / 3
        out = side * math.cos(a) + up * math.sin(a)
        vanes.append(_vane(nock, d, out))
    return _join([(shaft[0], shaft[1], SHAFT), (head, hq, HEAD)] + vanes)


def _vane(nock, d, out):
    """One broad vane, as Daggerfall's green fletching is: from near the nock along the shaft, tallest toward its back
    and sloping down to the front, its outer edge ragged where the barbs split apart. Both faces."""
    s = np.linspace(VANE[0], VANE[1], VANE_TEETH * 2 + 1)
    t = (s - VANE[0]) / (VANE[1] - VANE[0])
    tall = VANE[2] * np.clip(np.sin(np.pi * np.minimum(t * 3.0, 1.0) / 2), 0.25, 1.0) * (1.0 - 0.4 * t)
    tall = tall * np.where(np.arange(len(s)) % 2, 1.0, 0.82)   # the barbs' ragged ends
    root = nock + np.outer(s, d)
    edge = root + np.outer(tall, out) - np.outer(tall * VANE_SWEEP, d)   # the barbs swept back toward the nock
    v = np.concatenate([root, edge])
    n = len(s)
    q = []
    for i in range(n - 1):
        q += [[i, i + 1, n + i + 1], [i, n + i + 1, n + i], [i, n + i + 1, i + 1], [i, n + i, n + i + 1]]
    return v, np.array(q), FLETCH


def _string(pts, nock):
    """The string from the upper tip through the nock to the lower tip."""
    tip = np.array([0.0, pts[-1, 0], pts[-1, 1]])
    low = tip * np.array([1.0, 1.0, -1.0])
    s = np.linspace(0.0, 1.0, STRING_RINGS)
    path = [tip + (nock - tip) * a for a in s] + [nock + (low - nock) * a for a in s[1:]]
    return _tube(path, 0.0017, n=STRING_SIDES)


STRING_RINGS = 65   # rings along each half of the string: close enough to set back only the stretch a hand covers
STRING_SIDES = 4
REACH = 8.0   # screen pixels about a hand within which the string lies behind it
BEHIND = 0.01   # metres past the hand's farthest point there


def behind_hands(S, p, sv, arms):
    """The string `sv` set back along the eye's lines of sight wherever it passes within REACH of an arm in `arms`,
    until it lies past that arm: each ring keeps its place on the screen and its width there, but the hand is drawn
    over it. Daggerfall draws its hands over the string, where a string braced or drawn toward the eye would cross in
    front of the bow fist; elsewhere the string keeps its own depth and its own light."""
    import fpstage
    from scipy.spatial import cKDTree
    M, _ = fpstage.pose_matrix(p, S, AXIS)
    R, t = M[:3, :3], M[:3, 3]
    c = sv @ R.T + t
    su, sw, sd = fpstage.project(c.reshape(-1, STRING_SIDES, 3).mean(1), S)
    need = sd.copy()
    for arm in arms:
        au, aw, ad = fpstage.project(arm @ R.T + t, S)
        near = cKDTree(np.column_stack([au, aw])).query_ball_point(np.column_stack([su, sw]), REACH)
        for i, js in enumerate(near):
            if js:
                need[i] = max(need[i], float(ad[js].max()) + BEHIND)
    return (c * np.repeat(need / sd, STRING_SIDES)[:, None] - t) @ R


_ARMS = {}
_PINCH = {}     # a hand's thumb tip and its index's middle bone, as vertices, by its arm
_NOCKS = {}     # the drawing hand holding the arrow's nock, by the arm and the shaft
_HOOKS = {}     # the drawing hand with its other fingers bent as a frame has them
_GRIPS = {}     # the bow fist closed on its grip, by the arm and the wrap


def hand_k(S, side):
    """An arm's hand size: the drawing hand's is the shape's `hand`; the bow fist's is `fist` of it, its fingers
    `fist_long` as long and `fist_slim` as thick, so it closes small round the grip as Daggerfall's does."""
    return S['hand'] * (S.get('fist', 1.0) if side == 'L' else 1.0)


def _arm_key(S, side):
    """What an arm is made of: the hand's size, the sleeve's, the cuff, the thumb, the fingers' length and girth, and
    the armour set it wears (`armour`, none: the leather glove over the linen sleeve)."""
    fist = side == 'L'
    return (hand_k(S, side), S['arm_r'], S.get('cuff'), S.get('thumb'), S.get('fist_long') if fist else None,
            S.get('fist_slim') if fist else None, side, S.get('armour'))


def _rest_arm(S, side):
    key = _arm_key(S, side)
    if key not in _ARMS:
        k, _, cuff, thumb, long, slim, _, armour = key
        _ARMS[key] = fparm.arm(k, S['arm_r'], side, cuff=cuff, thumb=thumb, fingers=long, slim=slim, fused=True,
                               **(_dress(S, armour, side) if armour else {}))
    return _ARMS[key]


def bare(S):
    """The shape with its arms bare: the hands' hold and the arrow's rest are found on the leather glove, and every
    armour set holds the bow as it does, so one bow serves every set's hands."""
    return {**S, 'armour': None} if S.get('armour') else S


# where the bow arm's forearm armour begins, up from the elbow: high, by the wrist, where the light reaches it. The
# drawing arm wears none past its gauntlet's cuff: its forearm runs back to the eye, and its sleeve carries on
GUARD = fparm.WRIST - 0.12


def _dress(S, armour, side):
    """What an armour set lays over a bow arm, as the fists wear it (fparmour.py): its outfit, and its plate with
    the plate's materials counted past the bow's own (EXTRA), not the fists'; the bow arm's forearm guarded from GUARD
    up (a leather set's bracer the archer's arm guard), the drawing arm's not."""
    import fparmour
    kind = fparmour.style(armour).get('kind', 'plate')
    outfit = fparmour.OUTFITS.get(armour, fparmour.OUTFITS['plate'])
    if kind == 'chain' or (kind == 'leather' and side != 'L'):   # leather's drawing arm: the bare arm's long glove
        return {'outfit': outfit}
    forearm = GUARD if side == 'L' else None
    make = (fparmour.leather_pieces(armour, forearm) if kind == 'leather' else
            fparmour.hand_pieces(armour, S.get('thumb') or 1.0, forearm))
    past = len(MATS) - fparmour.BASE

    def plate(k, r, cuff_z):
        return [(v, t, m + past if m >= fparmour.BASE else m, piece) for v, t, m, piece in make(k, r, cuff_z)]
    return {'outfit': outfit, 'armour': plate}


def pinch_marks(S, side):
    """A hand's pinch as its arm's vertices: its thumb's tip, and its index finger's middle bone."""
    v = _rest_arm(S, side)[0]
    key = _arm_key(S, side)
    if key not in _PINCH:
        k = hand_k(S, side)
        R = fparm._RIGS[(k, S.get('cuff') or k, len(v))]
        u = v * fparm.MIRROR if side == 'R' else v   # the rig is the left arm's
        T, F = R['thumb'], R['f0']
        far = np.nonzero(T['w'][2] > 0.5)[0]
        tip = far[np.argmax((u[far] - T['cmc']) @ T['way'])]
        s = (u - F['mcp']) @ F['way']
        bone = np.nonzero(F['on'] & (s > (F['pip'] - F['mcp']) @ F['way']) & (s < (F['dip'] - F['mcp']) @ F['way']))[0]
        _PINCH[key] = (tip, bone)
    return _PINCH[key]


def pinch(v, tip, bone):
    """Posed vertices' pinch: the thumb's tip, the nearest point of the index's middle bone, and midway between."""
    a = v[tip]
    b = v[bone][np.argmin(np.linalg.norm(v[bone] - a, axis=1))]
    return a, b, (a + b) / 2


def _rot(axis, deg):
    a = math.radians(deg)
    x, y, z = np.asarray(axis, float) / np.linalg.norm(axis)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])


# the bow fist's grip: the places tried for the stave, in hand lengths (wrist to knuckles) up the hand from the wrist
# and out in front of the knuckles; it slants so the index's end is higher, as a bow lies in the hand. Each finger's
# middle joint closes this much faster than its knuckle, so the fingers wrap the stave rather than stab it with their
# tips
GRIP_ATS, GRIP_OUTS = (0.9, 0.95, 1.0, 1.05), tuple(np.arange(0.3, 0.76, 0.05).round(2))
GRIP_SLANT, GRIP_CURL = 20.0, 1.3
GRIP_THUMB = 30.0   # the thumb's bend as it closes over the stave: a fuller bend folds its web
GLOVE = 0.0015   # the leather between a closed hand and what it holds
FINGERS = ('index', 'middle', 'ring', 'little')


def _grip_pose(K, F, thumb_in, thumb_bend):
    """A hand's joints with each finger's own knuckle `K` and fold `F`."""
    p = {'knuckle': 0.0, 'fold': 0.0, 'spread': 0.0, 'wrist': 0.0, 'tilt': 0.0, 'thumb_in': thumb_in,
         'thumb_bend': thumb_bend}
    for i, n in enumerate(FINGERS):
        p[f'{n}_curl'] = F[i]
        p[f'{n}_knuckle'] = K[i] - fphand.CURL_KNUCKLE * F[i]
    return p


def _off(P, a, d):
    """Each point's distance from the line through `a` along `d`."""
    rel = P - a
    return np.linalg.norm(rel - np.outer(rel @ d, d), axis=1)


def _bisect(fits, lo, hi, n, steps=12):
    """For `n` values at once, the largest between `lo` and `hi` each that `fits` (given them all) still allows."""
    lo, hi = np.broadcast_to(lo, n).astype(float).copy(), np.broadcast_to(hi, n).astype(float).copy()
    for _ in range(steps):
        mid = (lo + hi) / 2
        ok = fits(mid)
        lo, hi = np.where(ok, mid, lo), np.where(ok, hi, mid)
    return lo


def grip(S):
    """The bow fist closed on the grip, as a hand takes hold of a stave: the stave laid in front of the knuckles,
    then each finger closed until it touches it (where its first bone touches, its other joints close on until they
    do), then the thumb, a little bent, turned in until it does. The stave lies where the closed hand wraps most of its
    round with nothing of the hand in it, found for the hand's and the wrap's own sizes. Gives the hand's joints, the
    posed hand, and the stave's line in the arm's space (a point, and its way from the index's end to the little
    finger's)."""
    key = (*_arm_key(S, 'L'), S['bow_w'], S['grip_len'], S['fist_z'])
    if key in _GRIPS:
        return _GRIPS[key]
    v = _rest_arm(S, 'L')[0]
    k = hand_k(S, 'L')
    c = S.get('cuff') or k
    if S.get('armour'):   # held as the bare hand holds it: the set's arm bent in the same joints
        joints, _, a, d = grip(bare(S))
        _GRIPS[key] = (joints, fparm.posed(v, joints, k, 'L', c), a, d)
        return _GRIPS[key]
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

    def close(a):
        """The hand closed on the stave through `a`: its joints, the posed hand, how much of the stave's round it
        covers (degrees), and whether nothing of it lies in the stave."""
        def gap(P):   # how far clear of the stave each point lies: its wrap, its collars, its limbs past them
            return _off(P, a, d) - stave_r(S, (P - a) @ -d + S['fist_z'])
        if gap(open_hand[hand]).min() < 0.0:
            return None
        clear = lambda vp, on: gap(vp[on]).min() >= 0.0 if on.any() else True   # noqa: E731
        s = _bisect(lambda s: (lambda vp: np.array([all(clear(vp, L) for L in links[i]) for i in range(4)]))(
            pose(KMAX * s, fold(s))), 0.0, 1.0, 4)
        K, F = KMAX * s, fold(s)
        past = pose(KMAX * np.minimum(s + 1 / 4096, 1.0), fold(np.minimum(s + 1 / 4096, 1.0)))
        first = np.array([not clear(past, links[i][0]) for i in range(4)])   # its first bone touched first
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
    for at in GRIP_ATS:   # the stave's place: up the hand from the wrist, and out in front of the knuckles
        for out in GRIP_OUTS:
            a = np.array([0.0, -out * fphand.KNUCKLES * k, fphand.WRIST + at * fphand.KNUCKLES * k])
            got = close(a)
            if got and got[3] and (best is None or got[2] > best[0]):
                best = (got[2], got[0], got[1], a)
    _, joints, vp, a = best
    _GRIPS[key] = (joints, vp, a, d)
    return _GRIPS[key]


def _grip_frame(a, d):
    """The bow's axes in the arm's space for a grip on the line through `a` along `d`: its X out of the palm toward
    the stave, its Z up the stave toward the index's end (rows: bow X, Y, Z)."""
    z = -d
    x = np.array([0.0, -1.0, 0.0])
    x = x - z * (x @ z)
    x /= np.linalg.norm(x)
    return np.stack([x, np.cross(z, x), z])


def bow_back(S, p):
    """The way the back of the bow fist faces, in the bow's space."""
    _, _, a, d = grip(S)
    return _rot([0, 0, 1], p['l_turn']) @ _grip_frame(a, d) @ np.array([0.0, 1.0, 0.0])


def bow_arm(S, p):
    """The bow arm at pose `p`: its fist closed on the grip (`grip`), the stave's line on the bow's axis at `fist_z`,
    turned `l_turn` about the stave, its forearm swung `l_lean` at the wrist while the hand keeps hold."""
    v, q, m = _rest_arm(S, 'L')
    _, vp, a, d = grip(S)
    to = _grip_frame(a, d)
    turn = _rot([0, 0, 1], p['l_turn'])
    at = np.array([0.0, 0.0, S['fist_z']])
    vb = (vp - a) @ to.T @ turn.T + at
    wrist = turn @ (to @ (np.array([0.0, 0.0, fphand.WRIST]) - a)) + at
    k = hand_k(S, 'L')
    w = fparm._RIGS[(k, S.get('cuff') or k, len(v))]['w_wrist']
    return fphand._turn(vb, wrist, turn @ [1.0, 0.0, 0.0], p['l_lean'], 1.0 - w), q, m


# the drawing index's knuckle and fold: curled so the thumb meets its middle joint's side (degrees)
PINCH_INDEX = (60.0, 90.0)
FOREARM_TO = fparm.WRIST - 0.02   # the drawing forearm, elbow to just short of the wrist's band, at its own length


def nock_hold(S):
    """The drawing hand holding the arrow's nock: its index curled, its thumb turned in and bent until only the shaft
    lies between its tip and the index's middle joint, the thumb's pad against it. Gives the posed right arm (its other
    fingers at their rest), the pinch (midway between the thumb's tip and the index), the way from the thumb to the
    index, the shaft's way along the index's first bone, in the arm's space, and the thumb's turn and bend."""
    v = _rest_arm(S, 'R')[0]
    k = hand_k(S, 'R')
    key = (*_arm_key(S, 'R'), S['draw_hand'])
    if key in _NOCKS:
        return _NOCKS[key]
    c = S.get('cuff') or k
    if S.get('armour'):   # pinched as the bare hand pinches it: the set's arm bent in the same joints
        _, mid, squeeze, way, (ti, tb) = nock_hold(bare(S))
        joints = _grip_pose([PINCH_INDEX[0], *[REST['r_hook']] * 3], [PINCH_INDEX[1], *[REST['r_curl']] * 3], ti, tb)
        _NOCKS[key] = (fparm.posed(v, joints, k, 'R', c), mid, squeeze, way, (ti, tb))
        return _NOCKS[key]
    R = fparm._RIGS[(k, c, len(v))]
    tip, bone = pinch_marks(S, 'R')
    want = 2 * SHAFT_R / S['draw_hand'] + GLOVE   # the shaft's thickness, in the hand's own size
    K = [PINCH_INDEX[0], *[REST['r_hook']] * 3]
    F = [PINCH_INDEX[1], *[REST['r_curl']] * 3]
    pose = lambda ti, tb: fparm.posed(v, _grip_pose(K, F, ti, tb), k, 'R', c)   # noqa: E731
    best = None
    for ti in np.arange(-20.0, 96.0, 5.0):   # the thumb's turn and bend that leave the shaft's gap
        for tb in np.arange(0.0, 61.0, 5.0):
            a, b, _ = pinch(pose(ti, tb), tip, bone)
            miss = abs(np.linalg.norm(a - b) - want)
            if best is None or miss < best[0]:
                best = (miss, ti, tb)
    _, ti, tb = best
    vp = pose(ti, tb)
    a, b, mid = pinch(vp, tip, bone)
    squeeze = (b - a) / np.linalg.norm(b - a)
    first = R['f0']['on'] & (R['f0']['w'][1] < 0.5)   # the index's first bone, its knuckle toward its middle joint
    pts = vp[first]
    s = (pts - pts.mean(0)) @ np.linalg.svd(pts - pts.mean(0))[2][0]
    way = pts[np.argmax(s)] - pts[np.argmin(s)]
    way = way if way @ (vp[bone].mean(0) - pts.mean(0)) > 0 else -way
    way -= squeeze * (way @ squeeze)
    _NOCKS[key] = (vp, mid, squeeze, way / np.linalg.norm(way), (ti, tb))
    return _NOCKS[key]


def drawing_arm(S, p, nock, rest):
    """The drawing arm at pose `p`: the arrow's nock pinched between its thumb and index (`nock_hold`), the shaft
    along the index, its other fingers bent `r_hook` and `r_curl`, the hand turned `r_roll` about the arrow, its size
    `draw_hand` about the nock."""
    v, q, m = _rest_arm(S, 'R')
    vp, mid, squeeze, way, thumb = nock_hold(S)
    hook = (round(float(p['r_hook']), 2), round(float(p['r_curl']), 2))
    if hook != (REST['r_hook'], REST['r_curl']):   # the other fingers bent as the frame has them; the pinch is the same
        k = hand_k(S, 'R')
        key = (*_arm_key(S, 'R'), len(v), hook, thumb)
        if key not in _HOOKS:
            if len(_HOOKS) > 64:
                _HOOKS.clear()
            _HOOKS[key] = fparm.posed(v, _grip_pose([PINCH_INDEX[0], *[hook[0]] * 3], [PINCH_INDEX[1], *[hook[1]] * 3],
                                                    *thumb), k, 'R', S.get('cuff') or k)
        vp = _HOOKS[key]
    # drawn small about the nock, the hand keeps Daggerfall's size; its forearm keeps its own length, so the elbow
    # still lies past the screen's edge as Daggerfall's does, not on it with the sleeve's open end in sight
    vp = vp.copy()
    low = vp[:, 2] < FOREARM_TO
    vp[low, 2] = FOREARM_TO - (FOREARM_TO - vp[low, 2]) / S['draw_hand']
    hand = np.stack([np.cross(squeeze, way), squeeze, way])   # rows: its own axes in the arm's space
    arrow = rest - nock
    z = arrow / np.linalg.norm(arrow)
    y = np.array([0.0, 0.0, 1.0]) - z * z[2]   # the index above the arrow at no turn
    y = _rot(z, p['r_roll']) @ (y / np.linalg.norm(y))
    bow = np.stack([np.cross(y, z), y, z])
    return nock + ((vp - mid) @ (bow.T @ hand).T) * S['draw_hand'], q, m


def scene(S, pose=None, straight=False):
    """The whole picture at `pose`'s joints (its rest where it has none); if `straight`, the limbs unbent and the arrow
    along +Y on the origin, as the patterns read the rest: (vertices, triangles, material a triangle)."""
    p = {**REST, **(pose or {})}
    draw = float(np.clip(p['draw'], 0.0, 1.0))
    (bv, bq, bm), pts = _limbs(S, draw, straight)
    lv, lq, lm = bow_arm(S, p)
    rest = rest_point(S, draw, bow_arm(bare(S), p)[0] if S.get('armour') else lv)
    nock = nock_point(S, draw, rest)
    sv, sq = _string(pts, nock)
    av, aq, am = _arrow(S, *((np.zeros(3), np.array([0.0, 1.0, 0.0])) if straight else (nock, rest)))
    if p['loose'] > 0 and not straight:   # shot: turned to its flight about the rest and flown on, the hands let go
        turn = _rot([0, 0, 1], p['fly_yaw']) @ _rot([1, 0, 0], p['fly_pitch'])
        way = turn @ ((rest - nock) / np.linalg.norm(rest - nock))
        av = (av - rest) @ turn.T + rest + way * p['loose']
    if p['arrow'] < 0.5:
        av = np.repeat(rest[None], len(av), axis=0)
    rv, rq, rm = drawing_arm(S, p, nock, rest)
    if p['hand_r'] < 0.5:
        rv = np.repeat(nock[None], len(rv), axis=0)
    if not straight and 'base' in p:   # placed before the eye
        sv = behind_hands(S, p, sv, [lv] + ([rv] if p['hand_r'] >= 0.5 else []))
    return _join([(bv, bq, bm), (sv, sq, STRING), (av, aq, am), (lv, lq, lm), (rv, rq, rm)])


def part(S):
    """The part at its rest, as fpmodel builds a part: its limbs unbent, so the wood's grain, read off the rest, runs
    along each limb however far it bends."""
    return scene(S, straight=True)


def posed(v, pose, S):
    """The part at `pose`: the whole picture made again at its joints (its vertices are the rest's, one for one)."""
    out = scene(S, pose)[0]
    assert len(out) == len(v), 'every pose keeps the part\'s vertices'
    return out


# what fpfit.py --shape fits, its steps and bounds
SHAPE_KEYS = ('focal', 'bow_w', 'bow_t', 'brace', 'draw_len', 'arrow_len', 'grip_len', 'fist_z', 'rest_z', 'draw_hand',
              'hand', 'cuff')
SHAPE_STEP = {'bow_len': 0.04, 'bow_w': 0.003, 'bow_t': 0.003, 'brace': 0.01, 'draw_len': 0.02, 'recurve': 0.05,
              'grip_len': 0.008, 'arrow_len': 0.02, 'fist_z': 0.006, 'rest_z': 0.006, 'draw_hand': 0.04}
BOUNDS = {'bow_len': (0.3, 1.2), 'bow_w': (0.012, 0.07), 'bow_t': (0.01, 0.06), 'brace': (0.08, 0.3),
          'draw_len': (0.05, 0.7), 'recurve': (0.0, 1.2), 'grip_len': (0.06, 0.4), 'arrow_len': (0.2, 1.0),
          'fist_z': (-0.15, 0.15), 'rest_z': (-0.15, 0.15), 'draw_hand': (0.2, 1.2)}
# the reference's class each material is read against: the wrap and the point in the band the metal dye recolours
CLASSES = {'wrap': 5, 'head': 5, 'collar': 5, 'wood': 1, 'string': 1, 'shaft': 1, 'fletch': 1}


def _wrapped():
    """The grip's wrap: grey leather worked in shallow lumps, darker in the hollows between them, so its highlight
    breaks into flecks and its shade into patches, as Daggerfall's mottled grip does; graded onto the metal band."""
    import materials
    m, b = materials._principled('wrap', (0.55, 0.55, 0.55), rough=0.75)
    nt = m.node_tree
    vec = materials._coords(m, (WRAP_LUMPS, WRAP_LUMPS, WRAP_LUMPS))
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.0
    nz.inputs['Detail'].default_value = 1.5
    nz.inputs['Roughness'].default_value = 0.5
    nt.links.new(vec, nz.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.7
    bump.inputs['Distance'].default_value = 0.01
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')   # the hollows between the lumps darker
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.42, (0.16, 0.16, 0.16, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.58, (0.7, 0.7, 0.7, 1)
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def _feathered():
    """The fletching: dark green feathers streaked lighter along their barbs, which slant out from the shaft and back
    toward the nock, as Daggerfall's vanes are. The arrow's rest lies along +Y on the origin (`scene`, `straight`), so
    a barb's slant is the same on every vane: its place along the shaft less its sweep back from it."""
    import materials
    m, b = materials._principled('fletch', (0.08, 0.3, 0.06), rough=0.9)
    nt = m.node_tree
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(materials._rest(nt), xyz.inputs['Vector'])

    def op(kind, a, b_=None, val=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        nt.links.new(a, n.inputs[0])
        if b_ is not None:
            nt.links.new(b_, n.inputs[1])
        elif val is not None:
            n.inputs[1].default_value = val
        return n.outputs['Value']

    x2 = op('MULTIPLY', xyz.outputs['X'], xyz.outputs['X'])
    z2 = op('MULTIPLY', xyz.outputs['Z'], xyz.outputs['Z'])
    out = op('SQRT', op('ADD', x2, z2))                       # how far out from the shaft
    slant = op('ADD', xyz.outputs['Y'], op('MULTIPLY', out, val=VANE_SWEEP))   # constant along a swept-back barb
    nz = nt.nodes.new('ShaderNodeTexNoise')   # the barbs a few pixels apart, each its own shade
    nz.inputs['Scale'].default_value = 1.0
    nz.inputs['Detail'].default_value = 1.0
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(op('MULTIPLY', slant, val=BARBS), comb.inputs['X'])
    nt.links.new(op('MULTIPLY', out, val=40.0), comb.inputs['Y'])
    nt.links.new(comb.outputs['Vector'], nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.44, (0.015, 0.06, 0.01, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.56, (0.2, 0.55, 0.12, 1)
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


BARBS = 260.0   # barbs a metre along the shaft


WRAP_LUMPS = 45.0   # the wrap's lumps a metre: a few pixels each at the grip's depth


def wood(dark=(0.2, 0.08, 0.025), light=(0.5, 0.27, 0.1)):
    """The bow's wood, grained in fine streaks along its limbs between a `dark` and a `light` colour."""
    import materials
    from fpmodel import _diffuse
    m, b = materials._principled('wood', (0.3, 0.14, 0.05), rough=0.6)
    nt = m.node_tree
    vec = materials._coords(m, (260.0, 260.0, 9.0))   # the grain: fine streaks running the limb's length
    grain = nt.nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 1.0
    grain.inputs['Detail'].default_value = 4.0
    grain.inputs['Distortion'].default_value = 0.6
    nt.links.new(vec, grain.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(grain.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return _diffuse(m)


def palette():
    """The bow's materials, lit as the fitter lights them: the wood grained along its limbs, the grip's wrap, its
    collars and the arrow's point grey (the metal the dye recolours), the fletching streaked, the string and shaft
    plain."""
    import fpwarhammer
    import materials
    from fpmodel import _diffuse
    return {
        'wood': wood(),
        'wrap': _diffuse(_wrapped()),
        'string': _diffuse(materials.plain('string', (0.55, 0.42, 0.28), rough=0.9)),
        'shaft': _diffuse(materials.plain('shaft', (0.36, 0.17, 0.07), rough=0.8)),
        'fletch': _diffuse(_feathered()),
        'head': _diffuse(materials.plain('head', (0.6, 0.6, 0.6), rough=0.7)),
        'collar': _diffuse(materials.plain('collar', (0.36, 0.36, 0.36), rough=0.7)),
        'vein': _vein(),
        'hammer_head': fpwarhammer.head_metal(),
        'hammer_accent': _diffuse(materials.plain('hammer_accent', (0.3, 0.3, 0.32), rough=0.6)),
        'hammer_grip': _diffuse(materials.plain('hammer_grip', (0.15, 0.09, 0.05), rough=0.7)),
    }


# a daedric bow's glow: its seam's colour lit this share as the lamp lights it, and shining this strong of itself, so
# its core and its vein are one deep red whichever way they face, as a light of their own
VEIN_LIT, VEIN_LIGHT = 0.25, 4.0


def _vein():
    """A daedric bow's veins and core: they glow in its armour's seam's deep red (armour.py `STYLE`), as the daedric
    warhammer's core does, a light of their own that no dye touches."""
    import bpy
    import armour
    import metals
    colour, _ = armour.STYLE['Daedric']['seam']
    from fpmodel import _diffuse
    m = bpy.data.materials.new('vein')
    m.use_nodes = True
    _diffuse(m)   # no glint: a highlight on the broad core read as a lit stone
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*(c * VEIN_LIT for c in metals._linear(colour)), 1)
    b.inputs['Emission Color'].default_value = (*metals._linear(colour), 1)
    b.inputs['Emission Strength'].default_value = VEIN_LIGHT
    return m
