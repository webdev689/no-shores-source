"""The first-person forge's left hand and what it holds: the torch (Handheld Torches' hand, TEXTURE.112359). The
shields' arm (fpshield.py) is built on it.

The part's space is the bow's (fpbow.py): its root the grip's middle on the handle's axis, +Z up the handle toward the
head, the hand's back toward +Y at no turn. The left fist closes on the handle as the bow fist closes on its grip
(`fpbow.grip`, the handle a stave of its own girth), so every armour set holds it as the bare hand does. The arm is
the one arm every first-person hand wears (fparm.py), turned about the handle (`l_turn`) and leaned at the wrist
(`l_lean`). Its frames are two layers: the torch (its flame drawn over it, frame by frame) and the hands, as the bow's
are, so any torch plays under any gauntlets.

The torch: a wooden handle, an iron socket at its head and four straps rising from it in a cage, banded near their
tops, with a bed of coals glowing in its foot. The flame is drawn from numbers over the render (`flame`): tongues
licking up from the coals inside the cage and out of it, the near straps before them, white-hot at their root, in
the colours of Daggerfall's own fire (the casting hands' fire ramp, `CAST-elements.json`), a little different each
frame, with sparks rising off it."""
import json
import math
import os

import numpy as np

import fparm
import fpbow

HERE = os.path.dirname(os.path.abspath(__file__))

# the torch's sizes, metres: the handle's radius at the grip, how far it runs below the fist, the socket's height over
# the grip, the cage's height and radius, and the flame's height and width over the cage's width
TORCH = {
    'focal': 375.0,      # the eye's focal length, in the picture's pixels (Daggerfall's 300 at the sprite's 0.8)
    'aspect': 1.0,
    'hand': 1.4,         # the gloved hand's size
    'fist': 1.0,         # the fist's, against the hand
    'arm_r': 1.1,        # the sleeve's girth
    'cuff': 1.8,         # the glove's cuff
    'thumb': 1.0,
    'handle_r': 0.024,
    'handle_below': 0.045,
    'socket': 0.07,
    'cage_len': 0.11,
    'cage_r': 0.048,
    'cage_turn': 0.0,    # degrees the straps stand turned about the handle
    'e_bend': 0.0,       # degrees the elbow bends, the upper arm off the forearm's line: a torch is held out straight
    'e_swing': 0.0,      # and which way, about the forearm
    'flame_h': 1.7,
    'flame_w': 1.3,
    'flame_up': 0.0,     # how far above the coals the flame's root stands, metres
}
TORCH_MATS = ('handle', 'cage', 'pitch', 'ember')
EXTRA = fpbow.EXTRA   # an armour set's own: plate, a daedric seam's glow, mail, a sole's dark
CLASSES = {'handle': 1, 'cage': 5, 'pitch': 1, 'ember': 1}
SHEETS = ()
# the forearm's lean at the wrist (fpbow.JOINTS' own, held within a natural wrist's): the pose's roll turns the arm
# about the handle
JOINTS = (('l_lean', 4.0, (-20.0, 20.0), 10.0, 0.0), ('l_tilt', 4.0, (-25.0, 25.0), 10.0, 0.0))
REST = {'l_turn': 0.0, 'l_lean': 0.0, 'l_tilt': 0.0}
# what fpheldfit.py --shape fits: its steps and bounds
SHAPE_STEP = {'focal': 20.0, 'hand': 0.05, 'fist': 0.05, 'arm_r': 0.05, 'cuff': 0.1, 'handle_r': 0.002,
              'socket': 0.01, 'cage_len': 0.01, 'cage_r': 0.003, 'cage_turn': 8.0}
BOUNDS = {'focal': (200.0, 700.0), 'hand': (0.6, 1.8), 'fist': (0.6, 1.4), 'arm_r': (0.5, 1.6), 'cuff': (0.5, 9.0),
          'handle_r': (0.008, 0.03), 'socket': (0.03, 0.2), 'cage_len': (0.04, 0.16), 'cage_r': (0.015, 0.06),
          'cage_turn': (-45.0, 45.0)}
BEND_STEP = {'e_bend': 8.0, 'e_swing': 15.0}   # an arm the fit may bend at the elbow (a shield's)
BEND_BOUNDS = {'e_bend': (0.0, 140.0), 'e_swing': (-180.0, 180.0)}
GRIP_LEN = 0.4   # the stave the fist is closed on, as fpbow.grip reads it: long, so its collars lie far past the hand


def mats(armour=None, own=TORCH_MATS):
    """The part's materials as its triangles count them: the arm's outfit, the held thing's own, an armour set's."""
    if not armour:
        return fparm.mats() + own + EXTRA
    import fparmour
    return fparm.mats(fparmour.OUTFITS.get(armour, fparmour.OUTFITS['plate'])) + own + EXTRA


def grip_shape(S, radius):
    """The shape fpbow.grip and bow_arm read for a fist closed on a round handle of `radius`: the bow's wrap that
    girth, the fist's middle on the stave's middle."""
    return {**S, 'bow_w': radius / 0.54, 'grip_len': GRIP_LEN, 'fist_z': 0.0}


def arm(S, p, radius, own):
    """The left arm closed on a handle of `radius` along +Z through the origin, at pose `p` (`l_turn`, `l_lean`, and
    `l_tilt`: the wrist bent sideways, toward the thumb or the little finger, the forearm swung in the palm's plane):
    (vertices, triangles, material index a triangle among `mats(armour, own)`)."""
    import fparm
    import fphand
    G = grip_shape(S, radius)
    pp = {**REST, **p}
    v, q, m = fpbow.bow_arm(G, pp)
    if pp.get('l_tilt'):
        rest = fpbow._rest_arm(G, 'L')[0]
        k = fpbow.hand_k(G, 'L')
        w = fparm._RIGS[(k, G.get('cuff') or k, len(rest))]['w_wrist']
        wrist = _wrist_point(G, pp)
        v = fphand._turn(v, wrist, fpbow.bow_back(G, pp), pp['l_tilt'], 1.0 - w)
    elbow, wrist = _marks_of(G, v)
    uv, uq = upper_arm(S, v[elbow].mean(axis=0), v[wrist].mean(axis=0), fpbow.bow_back(G, pp))
    v, q, m = fpbow._join([(v, q, m), (uv, uq, 0)])   # the arm's own garment: its sleeve, or a set's mail
    m = np.asarray(m).copy()
    past = m >= len(fpbow.MATS)   # an armour set's pieces, counted past the bow's own materials
    m[past] = m[past] - len(fpbow.MATS) + len(fparm.mats()) + len(own)
    return v, q, m


def _wrist_point(G, p):
    """The wrist's place in the part's space at pose `p`, as fpbow.bow_arm turns it."""
    _, _, a, d = fpbow.grip(G)
    to = fpbow._grip_frame(a, d)
    turn = fpbow._rot([0, 0, 1], p['l_turn'])
    return turn @ (to @ (np.array([0.0, 0.0, fpbow.fphand.WRIST]) - a)) + np.array([0.0, 0.0, G['fist_z']])


UPPER = 0.32       # elbow to shoulder, metres: the upper arm, which leads off the screen
UPPER_RINGS = 22


def _marks_of(G, v):
    """The rest arm's elbow and wrist vertices (indices into the arm's own vertices, before the upper arm)."""
    rest = fpbow._rest_arm(G, 'L')[0]
    key = (fpbow._arm_key(G, 'L'), len(rest))
    if key not in _MARKS:
        k = fpbow.hand_k(G, 'L')
        R = fparm._RIGS[(k, G.get('cuff') or k, len(rest))]
        fore = R['piece'] < 0
        z = rest[:, 2]
        _MARKS[key] = (np.nonzero(fore & (z < 0.03))[0],
                       np.nonzero(fore & (z > fparm.WRIST - 0.05) & (z < fparm.WRIST - 0.01))[0])
    return _MARKS[key]


def upper_arm(S, elbow, wrist, back):
    """The upper arm in its sleeve: from inside the forearm's open end at the elbow, bent there `e_bend` degrees, the
    bend's way turned `e_swing` degrees about the forearm from the back of the hand's side, then straight on to the
    shoulder past the screen. Its girth grows a little toward the shoulder. (vertices, triangles)."""
    from fpmodel import loft
    f = (elbow - wrist) / np.linalg.norm(elbow - wrist)
    b = back - f * (back @ f)
    b /= np.linalg.norm(b)
    c = np.cross(f, b)
    sw = math.radians(S.get('e_swing', 0.0))
    axis = b * math.cos(sw) + c * math.sin(sw)
    up = fpbow._rot(axis, S.get('e_bend', 0.0)) @ f
    # a cubic from inside the forearm round the elbow, then on along the upper arm
    t = np.linspace(0.0, 1.0, UPPER_RINGS)
    p0, p1, p2, p3 = elbow - f * 0.02, elbow + f * 0.04, elbow + up * 0.05, elbow + up * UPPER
    pts = ((1 - t) ** 3)[:, None] * p0 + (3 * (1 - t) ** 2 * t)[:, None] * p1 + (3 * (1 - t) * t ** 2)[:, None] * p2 \
        + (t ** 3)[:, None] * p3
    d = np.gradient(pts, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    u = [np.cross(d[0], b if abs(d[0] @ b) < 0.9 else c)]
    for i in range(1, len(pts)):   # carried along the curve, so the tube never twists
        x = u[-1] - d[i] * (u[-1] @ d[i])
        u.append(x / np.linalg.norm(x))
    u = np.array([x / np.linalg.norm(x) for x in u])
    w = np.cross(d, u)
    r = fparm._sleeve_r(0.0, S['arm_r']) * (1.02 + 0.18 * t)
    return loft(pts, u, w, r, r * 0.92, n=24, caps=(False, True))


_MARKS = {}   # the rest arm's elbow and wrist vertices, by its make


def arm_marks(S, p, radius, own=TORCH_MATS):
    """The arm's elbow and wrist at pose `p`, in the part's space: the ends of its forearm. A first-person arm reaches
    out from the eye, so its elbow lies nearer the eye than its wrist (fpheldfit.py holds it so)."""
    G = grip_shape(S, radius)
    v = arm(S, p, radius, own)[0]
    elbow, wrist = _marks_of(G, v)
    return v[elbow].mean(axis=0), v[wrist].mean(axis=0)


def shoulder_mark(S, p, radius, own=TORCH_MATS):
    """The upper arm's far end in the part's space: where the arm leads off the screen."""
    v = arm(S, p, radius, own)[0]
    return v[-1]


def back_of_hand(S, p, radius):
    """The way the back of the fist faces, in the part's space."""
    return fpbow.bow_back(grip_shape(S, radius), {**REST, **p})


def _join(pieces):
    return fpbow._join(pieces)


def _band(z0, z1, r, n=24):
    from fpmodel import _axis_loft
    z = np.linspace(z0, z1, 4)
    return _axis_loft(z, np.full(4, r), np.full(4, r), n=n, caps=(True, True))


def _strap(S, angle, k):
    """One of the cage's four straps: an iron bar from the socket's rim up its side, bowed out a little, its top
    turned in over the fire."""
    from fpmodel import loft
    top = S['socket'] + S['cage_len']
    z = np.linspace(S['socket'] + 0.006, top, 12)
    t = (z - z[0]) / (z[-1] - z[0])
    r = strap_r(S, t)
    a = math.radians(angle)
    out = np.array([math.cos(a), math.sin(a), 0.0])
    across = np.array([-math.sin(a), math.cos(a), 0.0])
    c = r[:, None] * out[None] + z[:, None] * np.array([0.0, 0.0, 1.0])
    u = np.tile(across, (len(z), 1))
    w = np.tile(out, (len(z), 1))
    width = np.full(len(z), 0.0055 * (1.0 + 0.1 * k))
    return loft(c, u, w, width, np.full(len(z), 0.0042), n=8, caps=(True, True))   # square iron: seen side-on too


def strap_r(S, t):
    """How far a strap stands from the axis a share `t` of the way up the cage: out from the socket's cup, flaring to
    the band and standing there, its top turned in a little over the fire."""
    return S['cage_r'] * (0.78 + 0.27 * np.clip(t / 0.62, 0.0, 1.0) ** 0.6 - 0.1 * np.clip((t - 0.85) / 0.15, 0.0, 1.0))


COAL = 0.024   # the coal bed's depth in the cage's foot, metres


def coal_top(S):
    """How far up its axis the coal bed in the cage's foot reaches: where the flame is rooted."""
    return S['socket'] + 0.002 + COAL


def _coals(S):
    """The coals heaped in the cage's foot: a lumpy bed filling it from strap to strap, domed at its top."""
    from fpmodel import _axis_loft
    base = S['socket'] + 0.002
    z = np.linspace(base, base + COAL, 16)
    t = (z - base) / COAL
    r = strap_r(S, np.clip((z - S['socket'] - 0.006) / (S['cage_len'] - 0.006), 0.0, 1.0)) * 0.94
    r = r * np.sqrt(np.clip(1.0 - np.clip((t - 0.45) / 0.55, 0.0, 1.0) ** 2, 0.0, 1.0)) + 1e-4

    def lumps(i, th):   # coal on coal: knobs of every size, none in a row
        return 0.09 * np.sin(th * 5.0 + z[i] * 211.0) + 0.06 * np.sin(th * 11.0 - z[i] * 377.0)
    return _axis_loft(z, r, r, n=28, caps=(True, True), swell=lumps)


def torch_mesh(S):
    """The torch alone in its own space: (vertices, triangles, material index among TORCH_MATS)."""
    from fpmodel import _axis_loft
    H, C, P, E = range(len(TORCH_MATS))
    z = np.linspace(-S['handle_below'], S['socket'] + 0.004, 24)
    t = (z - z[0]) / (z[-1] - z[0])
    butt = np.sqrt(np.clip(1.0 - np.clip((z[0] + 0.012 - z) / 0.012, 0.0, 1.0) ** 2, 0.0, 1.0))   # its end rounded
    r = S['handle_r'] * (0.9 + 0.1 * t + 0.03 * np.sin(z * 41.0)) * (0.3 + 0.7 * butt)
    handle = _axis_loft(z, r, r * 0.97, n=20, caps=(True, True))
    pieces = [(*handle, H)]
    # the socket: a collar round the handle's head, then a cup flaring out to the cage's foot
    pieces.append((*_band(S['socket'] - 0.016, S['socket'] - 0.002, S['handle_r'] * 1.22), C))
    zc = np.linspace(S['socket'] - 0.004, S['socket'] + 0.012, 6)
    rc = np.interp(zc, [zc[0], zc[-1]], [S['handle_r'] * 1.15, S['cage_r'] * 0.9])
    pieces.append((*_axis_loft(zc, rc, rc, n=24, caps=(True, False)), C))
    for k, a in enumerate((45.0, 135.0, 225.0, 315.0)):   # turned about the handle as its bars face the eye
        pieces.append((*_strap(S, a + S.get('cage_turn', 0.0), k), C))
    # the band round the straps near their tops
    zb = S['socket'] + 0.006 + 0.62 * (S['cage_len'] - 0.006)
    rb = float(strap_r(S, 0.62)) + 0.0015
    pieces.append((*_band(zb - 0.005, zb + 0.005, rb), C))
    cv, ct = _coals(S)
    hot = cv[ct].mean(axis=1)[:, 2] >= S['socket'] + 0.002 + COAL * 0.35   # the bed's top glows, its foot is ash
    pieces.append((cv, ct[~hot], P))
    pieces.append((cv, ct[hot], E))
    return _join(pieces)


OWN = TORCH_MATS


def held_radius(S):
    """The girth the fist closes on: the handle's."""
    return S['handle_r']


def top(S):
    """How far up its axis the torch's head reaches: the length a pose aims along."""
    return S['socket'] + S['cage_len'] + 0.012


def scene(S, pose=None):
    """The torch in the left fist at `pose`'s joints: (vertices, triangles, material a triangle among `mats`)."""
    p = {**REST, **(pose or {})}
    own = TORCH_MATS
    av, aq, am = arm(S, p, S['handle_r'], own)
    tv, tq, tm = torch_mesh(S)
    return _join([(tv, tq, tm + len(fparm.mats())), (av, aq, am)])


def part(S):
    return scene(S)


def posed(v, pose, S):
    out = scene(S, pose)[0]
    assert len(out) == len(v), 'every pose keeps the part\'s vertices'
    return out


def palette():
    """The torch's materials: an oiled wooden handle, worked iron (grey: the band, though no dye touches it), pitch
    and its burning top."""
    import axes
    import materials
    import fpmodel
    pitch, b = materials._principled('pitch', (0.05, 0.035, 0.022), rough=0.55, spec=0.35)
    ember = materials.plain('ember', (0.9, 0.35, 0.06), rough=0.9, spec=0.0)
    e = ember.node_tree.nodes['Principled BSDF']
    e.inputs['Emission Color'].default_value = (1.0, 0.42, 0.08, 1.0)
    e.inputs['Emission Strength'].default_value = 2.5
    return {
        'handle': fpmodel._diffuse(axes.wood('handle', (0.06, 0.04, 0.025), (0.16, 0.1, 0.055))),
        'cage': axes.iron('cage', dark=(0.3, 0.3, 0.3), light=(0.38, 0.38, 0.38), dents=90.0),
        'pitch': pitch,
        'ember': ember,
    }


def with_torch(base, own=None, material=None):
    """`base` (fpmodel.palette) with an armour set's materials (fparmour.dressed: every arm counts them, worn or not;
    `material`'s own polish and seam where the hands wear its gauntlets) and the held thing's own beside it (the
    torch's, or `own`)."""
    import fparmour

    def both():
        return {**fparmour.dressed(base, material)(), **(own or palette)()}
    return both


# -- the flame


def fire_ramp():
    """Daggerfall's fire, as the casting hands read it from its own archive: (brightness shares, colours)."""
    ramp = json.load(open(os.path.join(HERE, 'specs', 'CAST-elements.json')))['fire']
    return ramp


def flame(h, w, base, width, frame, S, seed=11):
    """The flame over a picture `h` x `w`: tongues licking up from the coals at `base` (x, y), `width` pixels
    across, each frame its own (`frame`). Returns its brightness, 0 to 1 (0 none), and a spark mask."""
    import fpspell
    sup = fpspell.SUPER
    H, W = h * sup, w * sup
    ys, xs = np.mgrid[0:H, 0:W] + 0.5
    x0, y0 = base[0] * sup, base[1] * sup
    half = width * S['flame_w'] * sup / 2
    tall = width * S['flame_h'] * sup
    rng = np.random.default_rng(seed + 97 * frame)
    lean = rng.uniform(-0.12, 0.12)
    up = np.clip((y0 - ys) / tall, -0.25, 1.6)   # 0 at the coals, 1 at the flame's crest
    sway = (np.sin(up * 5.0 + frame * 1.7) * 0.08 + lean * up) * tall * 0.35
    dx = (xs - x0 - sway) / np.maximum(half, 1e-6)
    # the body: wide at its root, narrowing to the crest, the crest's height a little different each frame
    crest = 1.0 + rng.uniform(-0.12, 0.1)
    body = np.clip(1.0 - up / crest, 0.0, 1.0) ** 0.8 * np.clip(1.0 + 4.0 * up, 0.0, 1.0)
    ragged = fpspell._noise(H, W, 0.35 * half, seed + frame, octaves=3)
    tongues = np.clip(fpspell._noise(H, W, 0.3 * half, seed + 31 + frame, tall=3.5) * 1.6, 0.0, 1.0)
    # the tongues: tall licks rising past the body, each its own height, apart from each other, dying out above it
    licks = 1.1 * tongues * np.clip(up + 0.2, 0.0, 1.5) * (np.abs(dx) < 1.1) * np.clip((1.5 - up) / 0.4, 0.0, 1.0)
    shape = body * (1.0 + 0.7 * ragged) + licks
    f = shape - np.abs(dx) ** 1.3 * (0.8 + 0.4 * up)
    # white-hot low in the middle, falling to the ramp's dark reds at the edges and the tips
    heat = np.clip(1.0 - 0.8 * np.abs(dx) - 0.55 * np.clip(up, 0.0, 1.5), 0.0, 1.0)
    light = np.where(f > 0, 0.18 + 0.82 * np.clip(0.55 * np.clip(f * 1.6, 0.0, 1.0) + 0.6 * heat, 0.0, 1.0), 0.0)
    light = np.where(up < -0.12, 0.0, light)   # nothing below the coals but their glow
    # sparks: a few motes rising off the crest, each frame its own
    spark = np.zeros((H, W), bool)
    for _ in range(rng.integers(2, 5)):
        sx = x0 + rng.uniform(-1.4, 1.4) * half
        sy = y0 - tall * rng.uniform(1.0, 1.7)
        r = rng.uniform(0.6, 1.2) * sup
        spark |= (xs - sx) ** 2 + (ys - sy) ** 2 < r * r
    # down to the picture's texels
    lit = light.reshape(h, sup, w, sup).mean(axis=(1, 3))
    sp = spark.reshape(h, sup, w, sup).mean(axis=(1, 3)) > 0.3
    return np.where(lit > 0.12, lit, 0.0), sp


FLAME = {}   # the flame's own grade (<spec>-grade.json `flame`): its brightness onto the mod's flame, and its colours


def flame_colour(light, spark):
    """The flame's brightness in its colours (RGBA): the mod's flame's where the torch's grade holds them (`FLAME`,
    fpheldfit.py --flame), its brightness share for share onto the mod's and the colour the mod draws at that
    brightness; else Daggerfall's fire's ramp. A spark is the brightest; nothing in it is grey (the game reads grey as
    metal)."""
    out = np.zeros(light.shape + (4,), np.uint8)
    on = (light > 0) | spark
    if FLAME:
        src, dst, at, colours = FLAME['ramp']
        rgb = np.asarray(colours, np.float64)
        want = np.where(spark, at[-1], np.interp(np.clip(light, 0.0, 1.0), src, dst))
        px = np.clip(np.round(np.stack([np.interp(want[on], at, rgb[:, c]) for c in range(3)], axis=1)), 0, 255)
        grey = (px[:, 0] == px[:, 1]) & (px[:, 1] == px[:, 2])
        px[grey, 2] = np.where(px[grey, 2] > 0, px[grey, 2] - 1, 1)
        out[on, :3] = px.astype(np.uint8)
        out[on, 3] = 255
        return out
    ramp = fire_ramp()
    rgb = np.asarray(ramp['rgb'], np.float64)
    want = np.where(spark, ramp['at'][-1], np.interp(np.clip(light, 0.0, 1.0), [0.0, 0.35, 0.7, 1.0],
                                                     [ramp['at'][0], ramp['at'][3], ramp['at'][7], ramp['at'][-1]]))
    px = np.clip(np.round(np.stack([np.interp(want[on], ramp['at'], rgb[:, c]) for c in range(3)], axis=1)), 0, 255)
    grey = (px[:, 0] == px[:, 1]) & (px[:, 1] == px[:, 2])
    px[grey, 2] = np.where(px[grey, 2] > 0, px[grey, 2] - 1, 1)
    out[on, :3] = px.astype(np.uint8)
    out[on, 3] = 255
    return out


# -- the layers (fpheldforge.py)

GLOW_POWER = 2.0   # watts of the flame's light on the hand


def glow_point(S):
    """Where the flame's light stands: in the fire inside the cage, in the part's space."""
    return np.array([0.0, 0.0, coal_top(S) + 0.04])


def variants(rec):
    """The held thing's own layers a record draws: the torch has one."""
    return (None,)


def set_variant(S, variant):
    pass


def object_name(rec, variant):
    return 'Torch'


def record_name(rec, r, variant):
    return r


def load_flame():
    """The flame's grade from the grade table fpforge.load laid on (its `flame`), taken out of the materials'."""
    import fpforge
    FLAME.clear()
    FLAME.update(fpforge.GRADE.pop('flame', {}))


def over(eye, scr, pose, part, frame):
    """The fire over the torch's layer: rooted in the coals, as wide as the cage there, burning inside the cage and up
    out of it. The cage's near straps and band, and the coals' near lip, stand before it; below the cage's top it
    burns only inside the cage."""
    import fpmodel
    import fpstage
    S = fpmodel.SHAPE
    if 'flame' in __import__('fpforge').GRADE:
        load_flame()
    M = eye.matrix(pose, part, S)
    (u, v), width = _root_on(M, S)
    h, w = scr.shape[:2]
    light, spark = flame(h, w, (u, v), width, frame, S)
    fire = flame_colour(light, spark)
    # the torch's triangles as the eye sees them: which lies nearest at each texel, and whether it is before the fire
    Sd, _, (vt, tt, ct) = eye.drawn(part, None)
    pv = fpmodel.posed(eye.weapon, part, vt, pose, Sd)
    P = pv @ M[:3, :3].T + M[:3, 3]
    tri = fpstage.raster(*fpstage.project(P, Sd), tt)
    eye_at = (np.linalg.inv(M) @ np.array([0.0, 0.0, 0.0, 1.0]))[:2]   # the eye in the part's space, across the axis
    # before the fire: what lies on the eye's side of the axis, the straps at the cage's sides as well
    near = pv[tt].mean(axis=1)[:, :2] @ (eye_at / np.linalg.norm(eye_at)) > -0.35 * S['cage_r']
    ids = {n: eye.names.index(n) + 1 for n in TORCH_MATS}
    before = np.isin(ct, [ids['cage'], ids['pitch'], ids['ember']]) & near   # the near straps and the coals' lip
    cage = np.isin(ct, [ids['cage'], ids['pitch'], ids['ember']])
    at = np.maximum(tri, 0)
    shut = (tri >= 0) & before[at]
    seen = (tri >= 0) & cage[at]
    # inside the cage: between its outline's two sides, row by row, the gaps between its straps as well
    cols = np.arange(w)[None, :]
    left = np.where(seen.any(axis=1), np.argmax(seen, axis=1), w)[:, None]
    right = np.where(seen.any(axis=1), w - 1 - np.argmax(seen[:, ::-1], axis=1), -1)[:, None]
    within = (cols >= left) & (cols <= right)
    rim = fpstage.project((M @ np.array([0.0, 0.0, S['socket'] + S['cage_len'], 1.0]))[:3][None], S)[1][0]
    free = np.arange(h)[:, None] + 0.5 < rim   # above the cage's top the fire stands free
    out = scr.copy()
    on = (fire[..., 3] > 0) & ~shut & (within | free)
    out[on] = fire[on]
    return out


def _root_on(M, S):
    """The fire's root on the screen under the pose's matrix `M`, and its width there (the cage's)."""
    import fpstage
    root = (M @ np.array([0.0, 0.0, coal_top(S) - 0.004 + S.get('flame_up', 0.0), 1.0]))[:3]
    u, v, d = fpstage.project(root[None], S)
    return (float(u[0]), float(v[0])), 2 * S['cage_r'] * S['focal'] / float(d[0])


def flame_root(S, pose):
    """The flame's root on the screen at `pose`, and its width there (the cage's)."""
    import fpstage
    M, _ = fpstage.pose_matrix(pose, S, top(S))
    return _root_on(np.diag([1.0, 1.0, S['aspect'], 1.0]) @ M, S)


def mod_flame(a, below):
    """The mod's flame in a picture: its warm texels above row `below`."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    warm = (a[..., 3] > 0) & (r > 150) & (r - b > 70)
    warm[below:] = False
    return warm
