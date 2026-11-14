"""The bard's instruments in first person, made from numbers as the tools are (lifetools.py) and held in our own two
hands (fparm.py): the Lute, the Flute, the Recorder and the Tambourine. They are the four instruments Daggerfall's own
musicians play in its townsfolk's pictures (TEXTURE.182: the lutenist, the flautist, the piper and the tambourine
player), built in the woods, gut, bone and brass those pictures paint.

Each instrument lies in its own frame, in metres, its root at the origin and its axis up +Z, as fpstage.pose_matrix
lays a part: the Lute from the tail of its bowl up the neck to the nut, the Flute from its mouth hole along the bore,
the Recorder from its beak to its foot, the Tambourine from its middle up to the top of its hoop. +Y is the face the
eye sees: the Lute's soundboard, the pipes' finger holes, the drum's head. +X is the Lute's bass side.

Both arms are the one arm every first-person hand wears, in its glove and sleeve, at the climbing hands' size
(`HANDS`), the right a true mirror of the left. Each is placed by its knuckles or wrist and its elbow, with the upper
arm leading off the screen. Each fingertip and thumb is bent onto its own mark (`aim_digit`), and then the whole hand
is settled out of the wood (`settle`): nothing of it passes into the instrument. A frame is the instrument's place on
the screen and each hand's own joints."""
import json
import math
import os

import numpy as np

import axes
import fparm
import fphand
import fptorch
from lifetools import _ball, _block, _join, _lathe, _prism, _tube

HERE = os.path.dirname(os.path.abspath(__file__))
HANDS = 'CLIMB'   # the spec whose hands these are: their size and their colours
ARM_MATS = fparm.mats()   # the sleeve and the glove, after each instrument's own materials

# ---- the Lute -------------------------------------------------------------------------------------------------------
# a bowl of narrow staves with dark spacers between, a flat spruce belly with a carved rose, a fretted neck and a pegbox bent back,
# six gut strings from the bridge to the nut
LUTE = {
    'body_len': 0.46,    # the belly from the tail to the neck
    'body_w': 0.31,      # its width at its widest
    'body_d': 0.125,     # the bowl's depth there
    'waist': 0.4,        # the widest point's share of the belly's length from the tail
    'neck_len': 0.3,
    'neck_w0': 0.062,    # the neck's width at the body, narrowing to `neck_w1` at the nut
    'neck_w1': 0.05,
    'neck_d': 0.026,     # how far its back stands behind the belly
    'box_len': 0.16,     # the pegbox's length and its bend back from the neck, degrees
    'box_bend': 72.0,
    'ribs': 21,
    'spacer': 0.1,       # a spacer's share of a rib's width, either side of each joint
    'rose_at': 0.66,     # the rose's centre as a share of the belly's length, and its radius
    'rose_r': 0.046,
    'bridge_at': 0.16,
    'strings': 6,
    'frets': 8,
    'pegs': 5,           # a side
}
LUTE_MATS = ('ribpale', 'ribdark', 'soundboard', 'rose', 'ebony', 'gut', 'horn')

# ---- the Flute ------------------------------------------------------------------------------------------------------
# a one-piece boxwood tube, its mouth hole near the stopped head, six finger holes and turned bone rings
FLUTE = {
    'len': 0.54,         # from the mouth hole to the foot
    'head': 0.065,       # past the mouth hole to the capped head
    'r': 0.0125,
    'holes': (0.205, 0.237, 0.269, 0.33, 0.362, 0.394),
    'hole_r': 0.0036,
    'mouth_r': 0.0048,
}
FLUTE_MATS = ('boxwood', 'hole', 'horn')

# ---- the Recorder ---------------------------------------------------------------------------------------------------
# a turned pearwood pipe: a beak, the window under it, seven holes before and a thumb hole behind, a flared foot
RECORDER = {
    'len': 0.36,
    'r': 0.0125,
    'foot_r': 0.0165,
    'holes': (0.13, 0.156, 0.182, 0.222, 0.248, 0.274, 0.3),
    'thumb_at': 0.122,
    'hole_r': 0.0032,
}
RECORDER_MATS = ('pipewood', 'hole', 'horn')

# ---- the Tambourine -------------------------------------------------------------------------------------------------
# a bent-wood hoop, a vellum head tacked round it in brass, and five pairs of brass jingles in slots round its wall
TAMBOURINE = {
    'r': 0.125,
    'depth': 0.055,
    'wall': 0.0075,
    'slots': 5,
    'zil_r': 0.0205,
    'tacks': 28,
    'grip_at': 120.0,    # degrees round the hoop where the left hand holds it, from its top toward the eye's left:
                         # its lower left, clear of the right hand that strikes the head's right half
}
TAMBOURINE_MATS = ('hoop', 'vellum', 'brass', 'hole')

SHAPES = {'lute': LUTE, 'flute': FLUTE, 'recorder': RECORDER, 'tambourine': TAMBOURINE}
OWN_MATS = {'lute': LUTE_MATS, 'flute': FLUTE_MATS, 'recorder': RECORDER_MATS, 'tambourine': TAMBOURINE_MATS}


def _unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / max(np.linalg.norm(v), 1e-12)


def _rot(axis, deg):
    """A turn of `deg` degrees about `axis` (Rodrigues')."""
    x, y, z = _unit(axis)
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])


def _disc(c, normal, r, ring=12):
    """A flat disc of radius `r` at `c` facing `normal`: a hole's dark, a jingle's face."""
    n = _unit(normal)
    u = _unit(np.cross(n, [0.0, 0.0, 1.0]) if abs(n[2]) < 0.9 else np.cross(n, [1.0, 0.0, 0.0]))
    w = np.cross(n, u)
    th = np.linspace(0, 2 * np.pi, ring, endpoint=False)
    rim = np.asarray(c) + r * (np.outer(np.cos(th), u) + np.outer(np.sin(th), w))
    v = np.vstack([np.asarray(c, dtype=np.float64)[None], rim])
    t = np.array([(0, 1 + j, 1 + (j + 1) % ring) for j in range(ring)])
    if np.cross(rim[0] - c, rim[1] - c) @ n < 0:
        t = t[:, ::-1]
    return v, t


def _box(c, axes_, half):
    """A closed box at `c` along the three ways `axes_` (each unit), `half` its half-size along each."""
    v, t = _block(tuple(-np.asarray(half)), tuple(half))
    return v @ np.column_stack(axes_).T + np.asarray(c, dtype=np.float64), t


def _on_tube(z, r, ang, lift=0.0004):
    """A point on a tube of radius `r` round +Z at height `z`, `ang` degrees round from +Y toward +X, `lift` off it."""
    a = math.radians(ang)
    return np.array([(r + lift) * math.sin(a), (r + lift) * math.cos(a), z]), np.array([math.sin(a), math.cos(a), 0.0])


# ---- the Lute's pieces ------------------------------------------------------------------------------------------------

def lute_half(S, s):
    """The belly's half-width at `s` (0 the tail, 1 the neck): round at the tail, widest at `waist`, tapering in a long
    curve to the neck's own width."""
    s = np.asarray(s, dtype=np.float64)
    p = S['waist']
    up = np.clip((s - p) / (1.0 - p), 0.0, 1.0)
    down = np.clip((p - s) / p, 0.0, 1.0)
    hw = S['body_w'] / 2 * np.where(s >= p, np.maximum(1.0 - up ** 2, 0.0) ** 0.55, np.sqrt(np.maximum(1.0 - down ** 2, 0.0)))
    neck = S['neck_w0'] / 2 * np.clip((s - p) / (1.0 - p), 0.0, 1.0) ** 2
    return np.maximum(hw, neck)


def _rows(n):
    """Shares from the tail to the neck, closer where the outline turns fastest."""
    return 0.5 - 0.5 * np.cos(np.linspace(0.0, np.pi, n))


def lute_bowl(S):
    """The bowl: `ribs` narrow staves of one wood from the tail to the neck, a thin dark spacer let in along each joint
    and round the rim, as a lute's back is built. Each section is half an ellipse, the belly's half-width across and
    `body_d` deep where widest; each stave is gently rounded across, so the back reads as ribs, never as a few broad
    facets."""
    s = _rows(26)
    hw = lute_half(S, s)
    d = S['body_d'] * (hw / (S['body_w'] / 2)) ** 0.85
    z = s * S['body_len']
    edge = lambda a: np.stack([hw * np.sin(a), -d * np.cos(a), z], axis=1)   # noqa: E731
    strip = lambda angles: axes._grid(np.stack([edge(a) for a in angles], axis=1))   # noqa: E731
    n = S['ribs']
    w = np.pi / n
    sp = S['spacer'] * w
    pieces = []
    for j in range(n):
        a0, a1 = -np.pi / 2 + w * j, -np.pi / 2 + w * (j + 1)
        v, t = strip(np.linspace(a0 + sp, a1 - sp, 3))   # the stave
        pieces.append((v, t[:, ::-1], 0))
    for j in range(n + 1):   # the spacers: along each joint, and the rim's at either end
        a = -np.pi / 2 + w * j
        v, t = strip([max(a - sp, -np.pi / 2), min(a + sp, np.pi / 2)])
        pieces.append((v, t[:, ::-1], 1))
    return pieces


def lute_belly(S):
    """The belly: flat, its grain up the instrument, the rose a dark carved disc, a bridge across below it."""
    s = _rows(22)
    u = np.linspace(-1.0, 1.0, 9)
    hw = lute_half(S, s)
    P = np.stack([u[None, :] * hw[:, None], np.zeros((len(s), len(u))), (s * S['body_len'])[:, None] + 0 * u[None, :]], -1)
    v, t = axes._grid(P)
    pieces = [(v, t, 2)]
    zr = S['rose_at'] * S['body_len']
    pieces.append((*_disc((0.0, 0.0006, zr), (0.0, 1.0, 0.0), S['rose_r'], ring=20), 3))
    zb = S['bridge_at'] * S['body_len']
    pieces.append((*_block((-0.055, 0.0, zb - 0.006), (0.055, 0.0055, zb + 0.006)), 4))
    return pieces


def lute_scale(S):
    """The strings' speaking length, the bridge to the nut."""
    return S['body_len'] + S['neck_len'] - S['bridge_at'] * S['body_len']


def neck_half(S, z):
    """The neck's half-width at height `z` up the instrument."""
    t = np.clip((z - S['body_len']) / S['neck_len'], 0.0, 1.0)
    return (S['neck_w0'] + (S['neck_w1'] - S['neck_w0']) * t) / 2


def lute_neck(S):
    """The neck: a rounded back in the dark wood, a flat ebony fingerboard over it running onto the belly, gut frets
    tied round it at the scale's semitones, a bone nut, and the pegbox bent back from the nut with its pegs."""
    z0, z1 = S['body_len'], S['body_len'] + S['neck_len']
    z = np.linspace(z0 - 0.01, z1, 12)
    hw = neck_half(S, z)
    a = np.linspace(-np.pi / 2, np.pi / 2, 9)
    back = np.stack([hw[:, None] * np.sin(a)[None], -S['neck_d'] * np.cos(a)[None] * (0.8 + 0.2 * hw[:, None] / hw[0]),
                     z[:, None] + 0 * a[None]], -1)
    v, t = axes._grid(back)
    pieces = [(v, t[:, ::-1], 1)]
    zf = np.linspace(z0 - 0.07, z1, 10)
    hf = np.where(zf < z0, neck_half(S, z0), neck_half(S, zf))
    top = np.stack([np.stack([-hf, np.full_like(zf, 0.0045), zf], 1), np.stack([hf, np.full_like(zf, 0.0045), zf], 1)], 1)
    bot = top.copy()
    bot[..., 1] = 0.0003
    from lifetools import _sheet
    pieces.append((*_sheet(top, bot), 4))
    L = lute_scale(S)
    for k in range(1, S['frets'] + 1):
        zk = z1 - L * (1.0 - 2.0 ** (-k / 12.0))
        h = float(neck_half(S, zk)) + 0.001
        pieces.append((*_tube(np.array([[-h, 0.0046, zk], [h, 0.0046, zk]]), 0.0016, ring=5), 5))
    pieces.append((*_block((-S['neck_w1'] / 2, 0.0, z1 - 0.004), (S['neck_w1'] / 2, 0.0085, z1)), 6))
    zb = S['bridge_at'] * S['body_len']
    for i in range(S['strings']):   # the courses fanned from the bridge to the nut
        f = (i + 0.5) / S['strings'] - 0.5
        a_, b_ = np.array([f * 0.082, 0.0062, zb]), np.array([f * 0.04, 0.0088, z1 - 0.002])
        pieces.append((*_tube(np.array([a_, b_]), 0.0016, ring=5), 5))
    # the pegbox: bent back at the nut, narrowing, its pegs through it from both sides
    bend = math.radians(S['box_bend'])
    way = np.array([0.0, -math.sin(bend), math.cos(bend)])
    root = np.array([0.0, 0.002, z1])
    C = root + np.outer(np.linspace(0.0, S['box_len'], 8), way)
    pieces.append((*_prism(C, np.linspace(0.011, 0.008, 8), np.linspace(S['neck_w1'] / 2, 0.016, 8), chamfer=0.25,
                           side=(1.0, 0.0, 0.0)), 1))
    for k in range(S['pegs']):
        at = root + way * (0.028 + (S['box_len'] - 0.04) * k / max(S['pegs'] - 1, 1))
        for side in (-1.0, 1.0):
            reach = float(np.interp(k, [0, S['pegs'] - 1], [S['neck_w1'] / 2, 0.016]))
            stem = at + np.array([side * reach, 0.0, 0.0])
            tip = stem + np.array([side * 0.024, 0.0, 0.0])
            pieces.append((*_tube(np.array([stem - np.array([side * 0.004, 0, 0]), tip]), 0.0032, ring=6), 4))
            pieces.append((*_ball(tip + np.array([side * 0.004, 0.0, 0.0]), 0.0062, ring=8), 6))
    return pieces


def lute(S):
    """The Lute (LUTE_MATS): its bowl, its belly and its neck."""
    return _join(lute_bowl(S) + lute_belly(S) + lute_neck(S))


def lute_length(S):
    return S['body_len'] + S['neck_len']


# ---- the pipes --------------------------------------------------------------------------------------------------------

def flute(S):
    """The Flute (FLUTE_MATS): a tube from its capped head past the mouth hole to the foot, a bone cap and rings turned
    at the head, between the hands and at the foot, the mouth hole and six finger holes dark on its face."""
    L, h, r = S['len'], S['head'], S['r']
    z = np.array([-h, -h + 0.004, 0.11, 0.115, 0.29, 0.297, L - 0.02, L])
    rr = r * np.array([0.98, 1.0, 1.0, 0.97, 0.96, 0.95, 0.93, 0.93])
    pieces = [(*_lathe(z, rr, ring=14), 0)]
    for z0, z1, w in ((-h - 0.012, -h + 0.006, 1.16), (0.098, 0.112, 1.12), (0.283, 0.297, 1.1), (L - 0.026, L + 0.003, 1.14)):
        zz = np.linspace(z0, z1, 4)
        pieces.append((*_lathe(zz, r * w * np.array([0.96, 1.0, 1.0, 0.96]), ring=14), 2))
    p, n = _on_tube(0.0, r, 0.0)
    pieces.append((*_disc(p, n, S['mouth_r'], ring=10), 1))
    for zh in S['holes']:
        p, n = _on_tube(zh, float(np.interp(zh, z, rr)), 0.0)
        pieces.append((*_disc(p, n, S['hole_r'], ring=8), 1))
    return _join(pieces)


def recorder(S):
    """The Recorder (RECORDER_MATS): a beak cut back under the lip, the window dark below it, a bone ring at the head
    joint, a bore narrowing to its seven finger holes and a flared foot ringed in bone; the thumb hole behind."""
    L, r, rf = S['len'], S['r'], S['foot_r']
    z = np.array([0.0, 0.006, 0.03, 0.075, 0.08, 0.3, 0.33, L - 0.008, L])
    rr = np.array([0.55 * r, 0.8 * r, 1.0 * r, 1.04 * r, 1.0 * r, 0.86 * r, 0.9 * r, rf, rf * 0.96])
    pieces = [(*_lathe(z, rr, ring=14), 0)]
    for z0, z1, w in ((0.07, 0.088, 1.18), (L - 0.016, L - 0.004, 1.1)):
        zz = np.linspace(z0, z1, 4)
        pieces.append((*_lathe(zz, float(np.interp((z0 + z1) / 2, z, rr)) * w * np.array([0.96, 1.0, 1.0, 0.96]),
                               ring=14), 2))
    p, n = _on_tube(0.048, float(np.interp(0.048, z, rr)), 0.0)
    pieces.append((*_block(p + np.array([-0.0045, -0.003, -0.0035]), p + np.array([0.0045, 0.0006, 0.0035])), 1))
    for zh in S['holes']:
        p, n = _on_tube(zh, float(np.interp(zh, z, rr)), 0.0)
        pieces.append((*_disc(p, n, S['hole_r'], ring=8), 1))
    p, n = _on_tube(S['thumb_at'], float(np.interp(S['thumb_at'], z, rr)), 180.0)
    pieces.append((*_disc(p, n, S['hole_r'], ring=8), 1))
    return _join(pieces)


# ---- the Tambourine ---------------------------------------------------------------------------------------------------

def _slot_angles(S):
    """Where the jingles' slots stand round the hoop, degrees from its top toward the eye's left: evenly spaced, the
    hand's place left clear."""
    gap = 360.0 / (S['slots'] + 1)
    return [(S['grip_at'] + gap * (k + 1)) % 360.0 for k in range(S['slots'])]


def _round(a_deg, r, y):
    """A point on a circle of radius `r` in the drum's plane, `a_deg` from its top toward +X, at depth `y`."""
    a = math.radians(a_deg)
    return np.array([r * math.sin(a), y, r * math.cos(a)])


def tambourine(S):
    """The Tambourine (TAMBOURINE_MATS): the hoop, a ring of wood `wall` thick and `depth` deep round the drum's axis
    (+Y, toward the eye); the vellum stretched over its face and down its side, tacked round in brass; and in each slot
    a pair of brass jingles on a pin across it, their faces square to the hoop, the slot dark behind them."""
    R, D, w = S['r'], S['depth'], S['wall']
    th = np.linspace(0, 2 * np.pi, 49)
    ring = lambda rad, y: np.stack([rad * np.sin(th), np.full_like(th, y), rad * np.cos(th)], 1)   # noqa: E731
    y0, y1 = -D / 2, D / 2
    pieces = []
    for A, B in ((ring(R, y1 - 0.006), ring(R, y0)), (ring(R - w, y0), ring(R - w, y1)), (ring(R, y0), ring(R - w, y0))):
        v, t = axes._grid(np.stack([A, B], axis=1))
        pieces.append((v, t, 0))
    head = [ring(R + 0.0008, y1 - 0.007), ring(R + 0.0008, y1 - 0.001), ring(R - 0.004, y1 + 0.0006)]
    v, t = axes._grid(np.stack(head, axis=1))
    pieces.append((v, t[:, ::-1], 1))
    v, t = _disc((0.0, y1 + 0.0006, 0.0), (0.0, 1.0, 0.0), R - 0.004, ring=48)
    pieces.append((v, t, 1))
    for k in range(S['tacks']):
        pieces.append((*_ball(_round(360.0 * (k + 0.5) / S['tacks'], R + 0.0012, y1 - 0.0045), 0.0024, ring=6), 2))
    for a in _slot_angles(S):
        out = _round(a, 1.0, 0.0)
        out[1] = 0.0
        out = _unit(out)
        tang = np.cross([0.0, 1.0, 0.0], out)
        mid = _round(a, R - w / 2, -0.004)
        pieces.append((*_box(mid, (out, np.array([0.0, 1.0, 0.0]), tang), (w / 2 + 0.0006, 0.016, 0.024)), 3))
        for side in (-1.0, 1.0):   # the pair, a little apart along the pin
            c = mid + tang * side * 0.0028
            z, rr = np.array([-0.0012, 0.0, 0.0012]), np.array([S['zil_r'] * 0.96, S['zil_r'], S['zil_r'] * 0.3])
            v, t = _lathe(z * side, rr, ring=12)
            frame = np.column_stack([out, np.array([0.0, 1.0, 0.0]), tang])
            pieces.append((v @ frame.T + c, t if side > 0 else t[:, ::-1], 2))
        pieces.append((*_tube(np.array([mid - tang * 0.009, mid + tang * 0.009]), 0.0011, ring=5), 2))
    return _join(pieces)


# ---- the arms -----------------------------------------------------------------------------------------------------------

_ARMS = {}


def hands():
    """Our hands' own values (`HANDS`' shape): their size, girth and cuff."""
    table = json.load(open(os.path.join(HERE, 'specs', f'{HANDS}-shape.json')))
    return {k: table[k] for k in ('hand', 'arm_r', 'cuff', 'thumb', 'fingers') if k in table}


# the armour set the arms wear (fparmour.py's sets: `Leather`, `Chain`, a plate metal), None the leather glove and
# linen sleeve every first-person hand wears bare
ARMOUR = {'set': None}


def arm_mats(material=None):
    """The arm's materials in a set (bare: the sleeve and the glove), as its triangles count them."""
    if not material:
        return fparm.mats()
    import fparmour
    return fparm.mats(fparmour.OUTFITS.get(material, fparmour.OUTFITS['plate'])) + fparmour.EXTRA


def rest_arm():
    """The left arm at rest in the set worn (`ARMOUR`), its fingers straight, made once: ((vertices, triangles,
    materials among `arm_mats`), its hand size, its cuff, its rig). A set's plate rides the hand's own pieces, as the
    fists' does (fparmour.py), so it bends with the fingers and the holds are found on it."""
    H = hands()
    material = ARMOUR['set']
    key = (tuple(sorted(H.items())), material)
    if key not in _ARMS:
        k, c = H['hand'], H.get('cuff', H['hand'])
        if not material:
            v, q, m = fparm.arm(k, H['arm_r'], 'L', cuff=c, thumb=H.get('thumb'), fingers=H.get('fingers'))
        else:
            import fparmour
            kind = fparmour.style(material).get('kind', 'plate')
            outfit = fparmour.OUTFITS.get(material, fparmour.OUTFITS['plate'])
            pieces = (fparmour.chain_pieces(material) if kind == 'chain' else fparmour.leather_pieces(material)
                      if kind == 'leather' else fparmour.hand_pieces(material, H.get('thumb') or 1.0))
            v, q, m = fparm.arm(k, H['arm_r'], 'L', outfit=outfit, cuff=c, thumb=H.get('thumb'),
                                fingers=H.get('fingers'), armour=pieces)
            m = np.where(m >= fparmour.BASE, m - fparmour.BASE + len(outfit), m)   # its plate past its outfit's two
        _ARMS[key] = ((v, q, m), k, c, fparm._RIGS[(k, c, len(v))], H)
    return _ARMS[key]


# a hand's joints beyond the rig's own (fphand.JOINTS, fphand.CURLS): each finger's knuckle apart, so a finger can lift
# off a hole at its knuckle while its neighbours stay down
KNUCKLES = tuple(f'{n}_knuckle' for n in ('index', 'middle', 'ring', 'little'))


def arm_frame(axis, back):
    """The turn that lays the arm's space into the instrument's: its forearm (+Z) along `axis`, the back of its hand
    (+Y) toward `back`, kept square to the forearm."""
    a = _unit(axis)
    b = np.asarray(back, dtype=np.float64)
    b = _unit(b - a * (b @ a))
    return np.column_stack([np.cross(b, a), b, a])


def elbow_toward(elbow, wrist, back, shoulder):
    """The elbow's bend and its way about the forearm (fptorch.upper_arm's `e_bend`, `e_swing`, degrees) that send the
    upper arm from `elbow` straight toward `shoulder`: the arm comes up from the body, never on past the elbow."""
    f = _unit(elbow - wrist)
    up = _unit(np.asarray(shoulder, dtype=np.float64) - elbow)
    turn = math.degrees(math.acos(max(-1.0, min(1.0, float(f @ up)))))
    if turn < 1e-3:
        return 0.0, 0.0
    n = _unit(np.cross(f, up))
    b = _unit(back - f * (back @ f))
    c = np.cross(f, b)
    return min(turn, 150.0), math.degrees(math.atan2(n @ c, n @ b))


def place_arm(hold, joints, side):
    """An arm posed at `joints` (fphand's, with the curls and knuckles) and laid at `hold` ({wrist, elbow, back}, in the
    instrument's frame): its vertices, triangles and materials, the upper arm joined at the elbow. A right arm is the
    left mirrored in its own space, so the same frame lays either."""
    (v, q, m), k, c, R, H = rest_arm()
    vp = fphand.pose(v, R, joints)   # the left hand, bent; a right hand is it mirrored, its faces turned to face out
    if side == 'R':
        vp, q = vp * fparm.MIRROR, q[:, ::-1].copy()
    wrist, elbow = np.asarray(hold['wrist'], dtype=np.float64), np.asarray(hold['elbow'], dtype=np.float64)
    F = arm_frame(wrist - elbow, hold['back'])
    P = (vp - np.array([0.0, 0.0, fparm.WRIST])) @ F.T + wrist
    e = wrist - F[:, 2] * fparm.WRIST
    bend, swing = hold.get('e_bend', 0.0), hold.get('e_swing', 0.0)
    if hold.get('shoulder') is not None:
        bend, swing = elbow_toward(e, wrist, F[:, 1], hold['shoulder'])
    uv, uq = fptorch.upper_arm({'arm_r': H['arm_r'], 'e_bend': bend, 'e_swing': swing}, e, wrist, F[:, 1])
    return _join([(P, q, m), (uv, uq, 0)])


def finger_points(joints, hold, side, finger):
    """The posed points of one finger (0 the index to 3 the little; 4 the thumb) in the instrument's frame."""
    (v, q, m), k, c, R, H = rest_arm()
    on = R['thumb']['on'] if finger == 4 else R[f'f{finger}']['on'] & (R[f'f{finger}']['w'][1] > 0.05)
    vp = fphand.pose(v, R, joints)
    if side == 'R':
        vp = vp * fparm.MIRROR
    wrist, elbow = np.asarray(hold['wrist'], dtype=np.float64), np.asarray(hold['elbow'], dtype=np.float64)
    F = arm_frame(wrist - elbow, hold['back'])
    return (vp[on] - np.array([0.0, 0.0, fparm.WRIST])) @ F.T + wrist


CURL_NAMES = tuple(c[0] for c in fphand.CURLS)
CLEAR = 0.0012   # metres a finger rests clear of the wood when it closes on it


def wrap(base, hold, side, inside, fingers=(0, 1, 2, 3), lift=None, thumb=False):
    """`base` (a hand's joints) with each finger in `fingers` closed until it touches what `inside(P)` says is solid
    (true where a point lies in it): its own curl raised in steps, kept at the last that leaves the finger clear of it.
    `lift` (finger -> degrees) opens a finger that much short of the touch: a hole uncovered, a string let go. With
    `thumb`, the thumb is turned in under the instrument the same way. Answers the closed joints."""
    out = dict(base)
    for i in fingers:
        name = CURL_NAMES[i]
        lo, hi = -40.0, 95.0
        opened, closed = (inside(finger_points({**out, name: c}, hold, side, i)).any() for c in (lo, hi))
        if opened or not closed:   # in it however open, or never reaching it: left as the pose has it, never splayed
            out[name] = out.get(name, 0.0) - (lift or {}).get(i, 0.0)   # nor closed to a fist on nothing
            continue
        for _ in range(14):
            mid = (lo + hi) / 2
            hit = inside(finger_points({**out, name: mid}, hold, side, i)).any()
            lo, hi = (lo, mid) if hit else (mid, hi)
        out[name] = lo - (lift or {}).get(i, 0.0)
    if thumb:
        lo, hi = -40.0, 95.0
        reach = inside(finger_points({**out, 'thumb_in': hi}, hold, side, 4)).any()
        if reach and not inside(finger_points({**out, 'thumb_in': lo}, hold, side, 4)).any():
            for _ in range(14):
                mid = (lo + hi) / 2
                hit = inside(finger_points({**out, 'thumb_in': mid}, hold, side, 4)).any()
                lo, hi = (lo, mid) if hit else (mid, hi)
            out['thumb_in'] = lo
    return out


_AIMS = {}
PAD = 0.008   # how far a fingertip's middle stands off the wood it rests on: the glove's own girth


def _tip_mask(digit):
    """Of a digit's points (`finger_points`), those of its last bone: its tip."""
    (_, _, _), _, _, R, _ = rest_arm()
    if digit == 4:
        return R['thumb']['w'][2][R['thumb']['on']] > 0.5
    F = R[f'f{digit}']
    return F['w'][2][F['on'] & (F['w'][1] > 0.05)] > 0.5


def aim_digit(base, hold, side, inside, digit, target):
    """`base` with one digit bent so its tip comes to rest nearest `target` with nothing of it in what `inside` holds
    solid: a finger by its own curl and knuckle (a pad on its hole), the thumb by its turn under the palm and its
    bend (under the pipe, on the inside of the grip). Found once a hold and target."""
    names = ('thumb_in', 'thumb_bend') if digit == 4 else (CURL_NAMES[digit], KNUCKLES[digit])
    grid = ((np.arange(-20.0, 96.0, 5.0), np.arange(-10.0, 86.0, 6.0)) if digit == 4
            else (np.arange(-30.0, 96.0, 5.0), np.arange(-20.0, 61.0, 5.0)))
    key = (ARMOUR['set'], side, digit, tuple(np.round(hold['wrist'], 5)), tuple(np.round(hold['back'], 5)),
           tuple(np.round(target, 5)), round(float(base.get('wrist', 0.0)), 3), round(float(base.get('spread', 0.0)), 3))
    if key not in _AIMS:
        tip = _tip_mask(digit)
        best = (float('inf'), base.get(names[0], 0.0), base.get(names[1], 0.0))
        for a in grid[0]:
            for b in grid[1]:
                P = finger_points({**base, names[0]: a, names[1]: b}, hold, side, digit)
                through = inside(P).mean()
                score = float(np.linalg.norm(P[tip].mean(axis=0) - target)) + (10.0 + through if through > 0 else 0.0)
                if score < best[0]:
                    best = (score, float(a), float(b))
        _AIMS[key] = best[1:]
    a, b = _AIMS[key]
    return {**base, names[0]: a, names[1]: b}


def hand_points(joints, hold, side):
    """The arm's posed points in the instrument's frame (no upper arm), and which are its palm and forearm: what no bend
    of a finger can take out of the wood."""
    (v, _, _), k, c, R, H = rest_arm()
    vp = fphand.pose(v, R, joints)
    if side == 'R':
        vp = vp * fparm.MIRROR
    wrist, elbow = np.asarray(hold['wrist'], dtype=np.float64), np.asarray(hold['elbow'], dtype=np.float64)
    F = arm_frame(wrist - elbow, hold['back'])
    P = (vp - np.array([0.0, 0.0, fparm.WRIST])) @ F.T + wrist
    body = (R['piece'] < 0) | ((R['piece'] == 0) & ~R['thumb']['on'])
    return P, body


def clear_digit(base, hold, side, inside, digit):
    """`base` with one digit moved the least it must be to lie out of the wood: its curl and knuckle (the thumb's turn
    and bend) tried over their reach, the clear pose nearest the one it had kept."""
    names = ('thumb_in', 'thumb_bend') if digit == 4 else (CURL_NAMES[digit], KNUCKLES[digit])
    a0, b0 = float(base.get(names[0], 0.0)), float(base.get(names[1], 0.0))
    for ring in range(1, 28):   # out from where it is, a ring of 5 degrees at a time: the first clear ring's nearest
        found = []
        for i in range(-ring, ring + 1):
            for j in range(-ring, ring + 1):
                if max(abs(i), abs(j)) != ring:
                    continue
                a, b = a0 + 5.0 * i, b0 + 5.0 * j
                if -40.0 <= a <= 95.0 and -20.0 <= b <= 85.0 and \
                        not inside(finger_points({**base, names[0]: a, names[1]: b}, hold, side, digit)).any():
                    found.append((abs(i) + abs(j), a, b))
        if found:
            _, a, b = min(found)
            return {**base, names[0]: a, names[1]: b}
    return base


def settle(base, hold, side, inside, push, digits=(0, 1, 2, 3, 4)):
    """A hand made to lie on the instrument and never in it: the whole hand moved out along `push` until its palm and
    forearm are clear of the wood, then each of `digits` still in it moved the least it must be (`clear_digit`).
    Answers the joints and the hold."""
    hold = dict(hold)
    step = _unit(push) * 0.0015
    for _ in range(40):
        P, body = hand_points(base, hold, side)
        if not inside(P[body]).any():
            break
        hold['wrist'] = np.asarray(hold['wrist']) + step
        hold['elbow'] = np.asarray(hold['elbow']) + step
    for _ in range(12):   # a digit no bend clears (a thumb's root against the wood): the hand a step farther out
        for d in digits:
            if inside(finger_points(base, hold, side, d)).any():
                base = clear_digit(base, hold, side, inside, d)
        if not any(inside(finger_points(base, hold, side, d)).any() for d in digits):
            break
        hold['wrist'] = np.asarray(hold['wrist']) + step
        hold['elbow'] = np.asarray(hold['elbow']) + step
    return base, hold


def in_tube(r, z0, z1, axis_pt=(0.0, 0.0, 0.0), clear=CLEAR):
    """A solid round tube about +Z through `axis_pt`, from `z0` to `z1`, `clear` grown: what `wrap` closes on."""
    ax = np.asarray(axis_pt, dtype=np.float64)

    def inside(P):
        d = P - ax
        return (np.hypot(d[:, 0], d[:, 1]) < r + clear) & (P[:, 2] > z0) & (P[:, 2] < z1)
    return inside


def in_neck(S, clear=CLEAR):
    """The Lute's neck and fingerboard as a solid: what the left hand closes on."""
    def inside(P):
        hw = neck_half(S, P[:, 2]) + clear
        z0 = S['body_len']
        on = (P[:, 2] > z0 - 0.02) & (P[:, 2] < z0 + S['neck_len'] + 0.01)
        front = P[:, 1] < 0.0045 + 0.0009 + clear
        x = np.abs(P[:, 0]) / hw
        back = P[:, 1] > -S['neck_d'] * np.sqrt(np.clip(1.0 - x ** 2, 0.0, 1.0)) - clear
        return on & front & back & (x < 1.0)
    return inside


def in_belly(S, clear=CLEAR):
    """The Lute's body as a solid, from the strings' height down: what the plucking hand keeps above."""
    def inside(P):
        s = P[:, 2] / S['body_len']
        hw = lute_half(S, np.clip(s, 0.0, 1.0)) + clear
        return (s > 0.0) & (s < 1.0) & (np.abs(P[:, 0]) < hw) & (P[:, 1] < 0.009 + clear) & (P[:, 1] > -S['body_d'])
    return inside


def in_lute(S, clear=CLEAR):
    """The Lute as a solid: its bowl to its curve, its belly up to the strings, its neck and fingerboard, its pegbox."""
    z1 = S['body_len'] + S['neck_len']

    def inside(P):
        s = P[:, 2] / S['body_len']
        hw = lute_half(S, np.clip(s, 0.0, 1.0))
        d = S['body_d'] * (hw / (S['body_w'] / 2)) ** 0.85
        x = np.abs(P[:, 0]) / np.maximum(hw + clear, 1e-6)
        body = (s > 0) & (s < 1) & (x < 1) & (P[:, 1] < 0.009 + clear) & \
            (P[:, 1] > -d * np.sqrt(np.clip(1 - x * x, 0, 1)) - clear)
        nh = neck_half(S, P[:, 2]) + clear
        xn = np.abs(P[:, 0]) / nh
        neck = (P[:, 2] > S['body_len'] - 0.02) & (P[:, 2] < z1 + 0.01) & (xn < 1) & (P[:, 1] < 0.0095 + clear) & \
            (P[:, 1] > -S['neck_d'] * np.sqrt(np.clip(1 - xn * xn, 0, 1)) - clear)
        bend = math.radians(S['box_bend'])
        way = np.array([0.0, -math.sin(bend), math.cos(bend)])
        rel = P - np.array([0.0, 0.002, z1])
        along = rel @ way
        across = rel - np.outer(along, way)
        box = (along > -0.005) & (along < S['box_len']) & (np.abs(across[:, 0]) < S['neck_w1'] / 2 + clear) & \
            (np.linalg.norm(across[:, 1:], axis=1) < 0.012 + clear)
        return body | neck | box
    return inside


def in_drum(S, clear=CLEAR):
    """The Tambourine as a solid: its hoop and its head."""
    def inside(P):
        r = np.hypot(P[:, 0], P[:, 2])
        return (r < S['r'] + clear) & (P[:, 1] > -S['depth'] / 2 - clear) & (P[:, 1] < S['depth'] / 2 + 0.001 + clear)
    return inside


# ---- the holds -----------------------------------------------------------------------------------------------------------

def _hold(p, side):
    """An open arm's place from a pose's numbers for that side (`<side>_wx`... in the instrument's frame): its wrist
    (`wx`, `wy`, `wz`), the point its forearm comes from (`ex`, `ey`, `ez`: only the way counts, the forearm keeps its
    length), the back of its hand turned `roll` degrees about the forearm from facing +Y (the instrument's face), and
    the elbow's bend into the upper arm (`ebend`, its way `eswing`)."""
    g = lambda n, d=0.0: float(p.get(f'{side}_{n}', d))   # noqa: E731
    wrist = np.array([g('wx'), g('wy'), g('wz')])
    run = wrist - np.array([g('ex'), g('ey'), g('ez')])
    a = _unit(run) if np.linalg.norm(run) > 1e-6 else np.array([0.0, 0.0, 1.0])   # a pose with no arm: the rest's
    up = np.array([0.0, 1.0, 0.0]) if abs(a[1]) < 0.95 else np.array([1.0, 0.0, 0.0])
    back = _rot(a, g('roll')) @ _unit(up - a * (up @ a))
    return {'wrist': wrist, 'elbow': wrist - a * fparm.WRIST, 'back': back, 'e_bend': g('ebend', 30.0), 'e_swing': g('eswing')}


ELBOWS = {'l': (-0.2, 0.12, -0.42), 'r': (0.2, 0.12, -0.42)}
# and each shoulder, below and beside the eye: an upper arm aimed there comes up from the body (`elbow_toward`)
SHOULDERS = {'l': (-0.2, -0.05, -0.27), 'r': (0.2, -0.05, -0.27)}


def eye_frame(p, S, kind):
    """The turn and place that lay the instrument before the eye at pose `p` (fpstage.pose_matrix), or None for a pose
    with no place (the rest a part is built at)."""
    if 'base' not in p:
        return None
    import fpstage
    M, _ = fpstage.pose_matrix(p, {'focal': S.get('focal', 300.0), 'aspect': S.get('aspect', 1.0)}, LENGTHS[kind](S))
    return M


def aimed_hold(p, side, M, knuckle, axis_pt, palm=0.016):
    """An open arm's place with its middle knuckle at `knuckle` (the instrument's frame), its forearm aimed there from
    its elbow in the eye's space (`ELBOWS`, or the pose's `<side>_elbow`), and the back of its hand turned away from
    `axis_pt` (the line it closes round): its palm to the instrument. `palm` keeps the knuckle that far out."""
    E = np.asarray(p.get(f'{side}_elbow', ELBOWS[side]), dtype=np.float64)
    E = M[:3, :3].T @ (E - M[:3, 3]) if M is not None else np.asarray(knuckle) - np.array([0.0, 0.3, 0.0])
    out = _unit(np.asarray(knuckle) - np.asarray(axis_pt))
    K = np.asarray(knuckle) + out * palm
    a = _unit(K - E)
    # the hand lies along the instrument, never into it: the aim's part toward the axis taken out, then the fingers
    # leaned `lean` degrees off it, to close back onto it
    along = a - out * (a @ out)
    lean = math.radians(float(p.get(f'{side}_lean', 10.0)))
    a = _unit(math.cos(lean) * _unit(along) + math.sin(lean) * out) if np.linalg.norm(along) > 1e-6 else a
    back = out - a * (out @ a)
    back = _unit(back) if np.linalg.norm(back) > 1e-6 else _unit(np.cross(a, [0.0, 0.0, 1.0]))
    back = _rot(a, float(p.get(f'{side}_roll', 0.0))) @ back
    k = rest_arm()[1]
    wrist0 = np.array([0.0, 0.0, fparm.WRIST])
    F = arm_frame(a, back)
    W = K - F @ (wrist0 + (fphand._knuckle(1) - wrist0) * k - wrist0)
    return {'wrist': W, 'elbow': W - a * fparm.WRIST, 'back': back,
            'e_bend': float(p.get(f'{side}_ebend', 25.0)), 'e_swing': float(p.get(f'{side}_eswing', 0.0))}


def wrapped_hold(p, side, M, r, z, theta, centre=(0.0, 0.0)):
    """An open hand round a tube of radius `r` about +Z: its middle knuckle at height `z`, `theta` degrees round from the
    tube's face (+Y) toward +X, its fingers reaching round toward the face, slanted `<side>_skew` degrees along the tube
    away from the elbow. The wrist then bends (its `wrist` joint) so the forearm swings out toward the elbow, set in the
    eye's space (`ELBOWS`, or the pose's `<side>_elbow`): a hand round a pipe, its forearm off it. Answers the hold and
    the wrist's bend."""
    th = math.radians(theta)
    out = np.array([math.sin(th), math.cos(th), 0.0])
    K = out * (r + 0.016) + np.array([centre[0], centre[1], z])
    E = np.asarray(p.get(f'{side}_elbow', ELBOWS[side]), dtype=np.float64)
    E = M[:3, :3].T @ (E - M[:3, 3]) if M is not None else K - np.array([0.0, 0.0, 0.3])
    t = np.array([math.cos(th), -math.sin(th), 0.0]) * (1.0 if theta < 0 else -1.0)   # round toward the face
    away = -1.0 if (E - K)[2] > 0 else 1.0   # along the tube, away from the elbow's end
    s_ = math.radians(float(p.get(f'{side}_skew', 25.0)))
    a = _unit(math.cos(s_) * t + math.sin(s_) * away * np.array([0.0, 0.0, 1.0]))
    k = rest_arm()[1]
    wrist0 = np.array([0.0, 0.0, fparm.WRIST])
    H = arm_frame(a, out)   # the hand's own frame
    W = K - H @ (wrist0 + (fphand._knuckle(1) - wrist0) * k - wrist0)
    f = _unit(W - E)
    bend = math.degrees(math.atan2(f @ out, f @ a))
    bend = max(-60.0, min(60.0, bend))   # within a wrist's reach (fphand.JOINTS)
    b = math.radians(bend)
    fore = math.cos(b) * a + math.sin(b) * out   # the hand turned back about its knuckles' line by the bend
    back = math.cos(b) * out - math.sin(b) * a
    hold = {'wrist': W, 'elbow': W - fore * fparm.WRIST, 'back': back,
            'e_bend': float(p.get(f'{side}_ebend', 25.0)), 'e_swing': float(p.get(f'{side}_eswing', 0.0))}
    return hold, bend


def aimed_tube_arm(p, side, M, r, z, theta, solid, holes, lift, thumb_at=None):
    """An arm wrapped round a tube (`wrapped_hold`): each finger's pad on its hole (`holes`, finger -> the hole's
    height on the tube's face), lifted `lift` degrees off it where its note leaves it open, and the thumb under the
    tube on its back, its tip at height `thumb_at` (the hand's own, by default): the inside of the grip, opposite the
    fingers."""
    hold, bend = wrapped_hold(p, side, M, r, z, theta)
    rig_side = 'L' if side == 'l' else 'R'
    base = {**_joints(p, side), 'wrist': bend}
    th = math.radians(theta)
    base, hold = settle(base, hold, rig_side, solid, np.array([math.sin(th), math.cos(th), 0.0]), digits=())
    base = aim_digit(base, hold, rig_side, solid, 4, np.array([0.0, -(r + PAD), z if thumb_at is None else thumb_at]))
    for f, hz in holes.items():
        base = aim_digit(base, hold, rig_side, solid, f, np.array([0.0, r + PAD, hz]))
        base[CURL_NAMES[f]] -= (lift or {}).get(f, 0.0)
    th = math.radians(theta)
    base, hold = settle(base, hold, rig_side, solid, np.array([math.sin(th), math.cos(th), 0.0]))
    return place_arm(hold, base, rig_side)


HAND_KEYS = tuple(j[0] for j in fphand.JOINTS) + CURL_NAMES + KNUCKLES


def _joints(p, side):
    """A hand's joints from a pose's numbers for that side (`<side>_knuckle`...)."""
    return {n: float(p[f'{side}_{n}']) for n in HAND_KEYS if f'{side}_{n}' in p}


def open_arm(p, side, inside=None, fingers=(), lift=None, thumb=False, push=None, solid=None, shoulder=None):
    """An open arm at pose `p`'s numbers for `side` ('l' or 'r'), its `fingers` closed on what `inside` holds solid,
    each `lift` short, then settled out of `solid` along `push` (`settle`): its mesh, ARM_MATS' materials. The left hand
    is the rig's own; the right its mirror."""
    hold = {**_hold(p, side), 'shoulder': shoulder}
    base = _joints(p, side)
    rig_side = 'L' if side == 'l' else 'R'
    if push is not None:
        base, hold = settle(base, hold, rig_side, solid or inside, push, digits=())
    if inside is not None and (fingers or thumb):
        base = wrap(base, hold, rig_side, inside, fingers=fingers, lift=lift, thumb=thumb)
    if push is not None:
        base, hold = settle(base, hold, rig_side, solid or inside, push)
    return place_arm(hold, base, rig_side)


def _scene(own, mesh, *arms, bare=False):
    """An instrument's mesh and its arms as one: the arms' materials counted past the instrument's own. `bare` folds the
    arms to a point at the root, where nothing of them draws or shades: the instrument alone, for its icon."""
    v, t, m = mesh
    pieces = [(v, t, m)] + [(av * (0.0 if bare else 1.0), aq, np.asarray(am) + len(own)) for av, aq, am in arms]
    return _join(pieces)


# ---- the Lute in the hands -------------------------------------------------------------------------------------------
NECK_R = 0.026         # the round the fretting hand wraps: the neck and its fingerboard, about their middle
NECK_MIDDLE = -0.011   # how far behind the belly the neck's middle lies
# where the fretting fingers press, index to little: (the fret, across the strings toward the bass side, metres)
FRETTED = ((1, 0.0), (2, 0.006), (3, -0.005), (4, 0.004))


def fret_arm(p, S, M, solid):
    """The left hand fretting the Lute: its knuckles under the neck's treble edge, its fingers round that edge onto the
    fingerboard, each fingertip pressing a string at its fret (`FRETTED`); its thumb behind the neck; its forearm up
    from below toward the eye (`l_elbow`). Its mesh, ARM_MATS' materials."""
    z1 = S['body_len'] + S['neck_len']
    L = lute_scale(S)
    fret = lambda k: z1 - L * (1.0 - 2.0 ** (-k / 12.0))   # noqa: E731
    z = float(p.get('l_z', (fret(1) + fret(4)) / 2))
    theta = float(p.get('l_th', -100.0))
    hold, bend = wrapped_hold(p, 'l', M, NECK_R, z, theta, centre=(0.0, NECK_MIDDLE))
    base = {**_joints(p, 'l'), 'wrist': bend}
    th = math.radians(theta)
    out = np.array([math.sin(th), math.cos(th), 0.0])
    base, hold = settle(base, hold, 'L', solid, out, digits=())
    base = aim_digit(base, hold, 'L', solid, 4, np.array([0.01, -S['neck_d'] - PAD, z]))
    for f, (k, x) in enumerate(FRETTED):
        base = aim_digit(base, hold, 'L', solid, f, np.array([x, 0.0045 + 0.0016 + PAD, fret(k) + 0.008]))
    base, hold = settle(base, hold, 'L', solid, out)
    return place_arm(hold, base, 'L')


def lute_scene(S, p):
    """The Lute held to play: the left hand fretting near the nut (`fret_arm`); the right hand over the strings between
    the rose and the bridge, its fingers down on them and each `r_lift_<i>` off, its forearm over the upper edge."""
    solid = in_lute(S)
    M = eye_frame(p, S, 'lute')
    if M is not None and 'r_elbow' in p:   # the forearm's way from an elbow set in the eye's space, low at the side
        e = M[:3, :3].T @ (np.asarray(p['r_elbow'], dtype=np.float64) - M[:3, 3])
        p = {**p, 'r_ex': float(e[0]), 'r_ey': float(e[1]), 'r_ez': float(e[2])}
    left = fret_arm(p, S, M, solid)
    lift = {i: p.get(f'r_lift_{i}', 0.0) for i in range(4)}
    shoulder = np.asarray(p.get('r_shoulder', SHOULDERS['r']), dtype=np.float64)
    right = open_arm(p, 'r', solid, fingers=(0, 1, 2, 3), lift=lift, push=np.array([0.6, 0.8, 0.0]),
                     shoulder=M[:3, :3].T @ (shoulder - M[:3, 3]) if M is not None else None)
    return _scene(LUTE_MATS, lute(S), left, right, bare=bool(p.get('bare')))


# ---- the pipes in the hands -------------------------------------------------------------------------------------------
# a note's fingering, the holes from the mouth down, 1 covered: D Dorian on the six-holed flute (F and C cross-fingered,
# the octave overblown with the first hole open as a vent), and on the recorder with its thumb hole first
FLUTE_FINGERINGS = ((1, 1, 1, 1, 1, 1), (1, 1, 1, 1, 1, 0), (1, 1, 1, 1, 0, 1), (1, 1, 1, 0, 0, 0),
                    (1, 1, 0, 0, 0, 0), (1, 0, 0, 0, 0, 0), (0, 1, 1, 0, 0, 0), (0, 1, 1, 1, 1, 1))
RECORDER_FINGERINGS = ((1, 1, 1, 1, 1, 1, 1, 0), (1, 1, 1, 1, 1, 1, 0, 0), (1, 1, 1, 1, 1, 0, 1, 1),
                       (1, 1, 1, 1, 0, 0, 0, 0), (1, 1, 1, 0, 0, 0, 0, 0), (1, 1, 0, 0, 0, 0, 0, 0),
                       (1, 0, 1, 0, 0, 0, 0, 0), (0, 0, 1, 0, 0, 0, 0, 0))
LIFT = 24.0   # degrees a finger stands off a hole it leaves open


def fingering_lifts(holes, fingers):
    """Each finger's lift for a fingering: `fingers` the finger (0 index to 3 little) that covers each hole, in order."""
    return {f: (0.0 if on else LIFT) for on, f in zip(holes, fingers)}


def flute_scene(S, p):
    """The Flute held to play: the left hand's index, middle and ring fingers on the three holes nearest the mouth, the
    right hand's on the three past them, each lifted where `note`'s fingering leaves its hole open (0: every hole
    covered, the hands at rest)."""
    holes = FLUTE_FINGERINGS[max(0, int(p.get('note', 0)) - 1)] if p.get('note') else (1,) * 6
    solid = in_tube(S['r'], -S['head'], S['len'])
    M = eye_frame(p, S, 'flute')
    g = lambda n, d: float(p.get(n, d))   # noqa: E731
    h = S['holes']
    left = aimed_tube_arm(p, 'l', M, S['r'], g('l_z', 0.237), g('l_th', 80.0), solid, dict(zip((0, 1, 2), h[:3])),
                          fingering_lifts(holes[:3], (0, 1, 2)))
    right = aimed_tube_arm(p, 'r', M, S['r'], g('r_z', 0.362), g('r_th', -80.0), solid, dict(zip((0, 1, 2), h[3:])),
                           fingering_lifts(holes[3:], (0, 1, 2)))
    return _scene(FLUTE_MATS, flute(S), left, right, bare=bool(p.get('bare')))


def recorder_scene(S, p):
    """The Recorder held to play: the left thumb on the hole behind and the left hand's first three fingers on the top
    holes, the right hand's four on the lower ones, each lifted where `note`'s fingering leaves its hole open."""
    holes = RECORDER_FINGERINGS[max(0, int(p.get('note', 0)) - 1)] if p.get('note') else (1, 1, 1, 1, 1, 1, 1, 0)
    solid = in_tube(S['r'], 0.0, S['len'])
    M = eye_frame(p, S, 'recorder')
    g = lambda n, d: float(p.get(n, d))   # noqa: E731
    h = S['holes']
    left = aimed_tube_arm(p, 'l', M, S['r'], g('l_z', 0.156), g('l_th', 80.0), solid, dict(zip((0, 1, 2), h[:3])),
                          fingering_lifts(holes[1:4], (0, 1, 2)), thumb_at=S['thumb_at'])
    right = aimed_tube_arm(p, 'r', M, S['r'], g('r_z', 0.261), g('r_th', -80.0), solid,
                           dict(zip((0, 1, 2, 3), h[3:])), fingering_lifts(holes[4:], (0, 1, 2, 3)))
    return _scene(RECORDER_MATS, recorder(S), left, right, bare=bool(p.get('bare')))


# ---- the Tambourine in the hands --------------------------------------------------------------------------------------

def rim_arm(p, S, M):
    """The left hand holding the Tambourine by its rim at `grip_at`, as a tambourine is held: the thumb on the head inside
    the rim, the fingers round the frame and up behind it, the palm under the hoop, the forearm coming up from under
    it toward the eye (its elbow set in the eye's space, `l_elbow`). Its mesh, ARM_MATS' materials."""
    R, D = S['r'], S['depth']
    g = math.radians(S['grip_at'])
    rho = np.array([math.sin(g), 0.0, math.cos(g)])          # out from the hoop at the grip
    tau = np.array([math.cos(g), 0.0, -math.sin(g)])         # along it
    a = _rot(rho, float(p.get('l_skew', 0.0))) @ np.array([0.0, -1.0, 0.0])   # the fingers reach under it, away
    K = rho * (R + 0.016)
    E = np.asarray(p.get('l_elbow', (-0.12, 0.1, -0.4)), dtype=np.float64)
    E = M[:3, :3].T @ (E - M[:3, 3]) if M is not None else K + np.array([0.0, 0.3, 0.0]) + rho * 0.2
    k = rest_arm()[1]
    wrist0 = np.array([0.0, 0.0, fparm.WRIST])
    H = arm_frame(a, rho)
    W = K - H @ (wrist0 + (fphand._knuckle(1) - wrist0) * k - wrist0)
    f = _unit(W - E)
    bend = max(-60.0, min(60.0, math.degrees(math.atan2(f @ rho, f @ a))))
    b = math.radians(bend)
    fore, back = math.cos(b) * a + math.sin(b) * rho, math.cos(b) * rho - math.sin(b) * a
    hold = {'wrist': W, 'elbow': W - fore * fparm.WRIST, 'back': back, 'e_bend': float(p.get('l_ebend', 25.0)),
            'e_swing': float(p.get('l_eswing', 0.0))}
    solid = in_drum(S)
    base = {**_joints(p, 'l'), 'wrist': bend}
    base, hold = settle(base, hold, 'L', solid, rho, digits=())
    base = aim_digit(base, hold, 'L', solid, 4, rho * (R - 0.03) + np.array([0.0, D / 2 + PAD, 0.0]))
    for f_, along in zip(range(4), (0.024, 0.008, -0.008, -0.024)):
        base = aim_digit(base, hold, 'L', solid, f_, rho * (R - 0.014) + tau * along + np.array([0.0, -D / 2 - PAD, 0.0]))
    base, hold = settle(base, hold, 'L', solid, rho)
    return place_arm(hold, base, 'L')


def tambourine_scene(S, p):
    """The Tambourine held up by its rim in the left hand (`rim_arm`), turned `t_shake` degrees about the grip with the
    hand that holds it (a shake); the right hand open, its fingers laid on the head as far as they reach (a stroke's
    touch) or held off it."""
    M = eye_frame(p, S, 'tambourine')
    v, t, m = tambourine(S)
    lv, lq, lm = rim_arm(p, S, M)
    g = math.radians(S['grip_at'])
    at = np.array([math.sin(g), 0.0, math.cos(g)]) * S['r']
    shake = _rot(np.array([math.cos(g), 0.0, -math.sin(g)]), p.get('t_shake', 0.0))
    v, lv = (v - at) @ shake.T + at, (lv - at) @ shake.T + at   # the drum and its hand turn together at the wrist
    # the knuckles over the head, `y` off it (the head stands `depth` / 2 before the hoop's middle)
    hit = np.array(p.get('r_at', (0.02, 0.05, 0.02)), dtype=np.float64) + np.array([0.0, S['depth'] / 2, 0.0])
    hold = aimed_hold(p, 'r', M, hit, hit - np.array([0.0, 1.0, 0.0]), palm=0.022)
    base = _joints(p, 'r')
    drum = in_drum(S)
    base, hold = settle(base, hold, 'R', drum, np.array([0.0, 1.0, 0.0]), digits=())
    if p.get('r_touch'):   # a stroke's touch: the fingers laid on the head
        base = wrap(base, hold, 'R', drum, fingers=(0, 1, 2, 3))
    base, hold = settle(base, hold, 'R', drum, np.array([0.0, 1.0, 0.0]))
    right = place_arm(hold, base, 'R')
    return _scene(TAMBOURINE_MATS, (v, t, m), (lv, lq, lm), right, bare=bool(p.get('bare')))


SCENES = {'lute': lute_scene, 'flute': flute_scene, 'recorder': recorder_scene, 'tambourine': tambourine_scene}
LENGTHS = {'lute': lute_length, 'flute': lambda S: S['len'], 'recorder': lambda S: S['len'],
           'tambourine': lambda S: S['r']}


def mats(kind):
    """An instrument's scene's materials: its own, then the arm's in the set worn (`arm_mats`)."""
    return OWN_MATS[kind] + arm_mats(ARMOUR['set'])


# ---- the forge's registration ---------------------------------------------------------------------------------------

def _rose(name):
    """The Lute's rose: a carved lattice over the dark of the sound hole - rings and a star of spokes in the belly's own
    wood, read off the rest position about the rose's middle, so it stays carved however the Lute is posed."""
    import materials
    zr = LUTE['rose_at'] * LUTE['body_len']
    R = LUTE['rose_r']
    m, b = materials._principled(name, (0.03, 0.02, 0.012), rough=0.9, spec=0.1)
    nt = m.node_tree

    def op(kind, a, b_=None, val=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        nt.links.new(a, n.inputs[0])
        if b_ is not None:
            nt.links.new(b_, n.inputs[1])
        elif val is not None:
            n.inputs[1].default_value = val
        return n.outputs['Value']

    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(materials._rest(nt), xyz.inputs['Vector'])
    dz = op('SUBTRACT', xyz.outputs['Z'], val=zr)
    r = op('SQRT', op('ADD', op('MULTIPLY', xyz.outputs['X'], xyz.outputs['X']), op('MULTIPLY', dz, dz)))
    ang = op('ARCTAN2', xyz.outputs['X'], dz)
    rings = op('GREATER_THAN', op('ABSOLUTE', op('SINE', op('MULTIPLY', r, val=2 * math.pi * 2.5 / R))), val=0.94)
    spokes = op('GREATER_THAN', op('ABSOLUTE', op('SINE', op('ADD', op('MULTIPLY', ang, val=6.0),
                                                                    op('MULTIPLY', r, val=40.0)))), val=0.97)
    rim = op('GREATER_THAN', r, val=0.9 * R)
    carved = op('MAXIMUM', op('MAXIMUM', rings, spokes), rim)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(carved, mix.inputs['Factor'])
    mix.inputs['A'].default_value = (0.03, 0.02, 0.012, 1)
    mix.inputs['B'].default_value = (0.5, 0.37, 0.19, 1)
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    return m


def _vellum(name):
    """The drum's head: a cream skin, mottled where it was scraped and darker where hands have struck it."""
    import materials
    m, b = materials._principled(name, (0.62, 0.5, 0.33), rough=0.85, spec=0.15)
    nt = m.node_tree
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 40.0
    noise.inputs['Detail'].default_value = 3.0
    nt.links.new(materials._rest(nt), noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.25, (0.56, 0.44, 0.28, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.75, (0.68, 0.56, 0.38, 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def palette():
    """The instruments' materials beside the weapons': the Lute's staves and dark spacers, its spruce belly, rose, ebony,
    gut and bone; the Flute's boxwood and the Recorder's pearwood; the Tambourine's bent wood and vellum; the dark of
    a hole. Brass is the tools' (lifetools.palette)."""
    import materials
    return {
        'ribpale': axes.wood('ribpale', (0.26, 0.13, 0.05), (0.4, 0.22, 0.09), scale=(220.0, 220.0, 5.0)),
        'ribdark': axes.wood('ribdark', (0.07, 0.035, 0.018), (0.16, 0.08, 0.035), scale=(150.0, 150.0, 5.0)),
        'soundboard': axes.wood('soundboard', (0.55, 0.42, 0.23), (0.6, 0.46, 0.26), scale=(90.0, 90.0, 3.0)),
        'rose': _rose('rose'),
        'ebony': materials.plain('ebony', (0.045, 0.028, 0.018), rough=0.45, spec=0.4),
        'gut': materials.plain('gut', (0.72, 0.62, 0.42), rough=0.55, spec=0.3),
        'horn': materials.plain('horn', (0.78, 0.71, 0.55), rough=0.4, spec=0.45),
        'boxwood': axes.wood('boxwood', (0.45, 0.3, 0.11), (0.7, 0.52, 0.24), scale=(200.0, 200.0, 6.0)),
        'pipewood': axes.wood('pipewood', (0.26, 0.11, 0.04), (0.5, 0.26, 0.1), scale=(200.0, 200.0, 6.0)),
        'hole': materials.plain('hole', (0.015, 0.01, 0.008), rough=1.0, spec=0.0),
        'hoop': axes.wood('hoop', (0.24, 0.11, 0.04), (0.52, 0.28, 0.11), scale=(40.0, 300.0, 40.0)),
        'vellum': _vellum('vellum'),
    }


def weapons():
    """The instruments as the forge's weapons (fpmodel.WEAPONS): each one part, the instrument and both arms made
    again at each pose's numbers, its root in sight. Its arms wear our hands' colours (`hands`)."""
    out = {}
    for kind, make in SCENES.items():
        out[kind] = {
            'parts': {kind: (lambda S, make=make: make(S, {}))},
            'mats': mats(kind),
            'shape': SHAPES[kind],
            'posed': (lambda v, pose, S, make=make, kind=kind: _same(v, _scene_of(kind, make, S, pose)[0])),
            'length': (lambda S, part, kind=kind: LENGTHS[kind](S)),
            'girth': lambda S, part: 0.1,
            'root_r': lambda S, part: 0.02,
            'joints': {kind: (('note', 1.0, (0.0, 8.0), 1.0, 0.0),)},
            'root_seen': True,
            'hands': HANDS,
        }
    return out


_SCENES = {}


def _scene_of(kind, make, S, pose):
    """A pose's scene, made once: the renderer asks each frame's several times (its tones, its picture, its materials),
    and settling the hands is the slow part."""
    import json
    key = (kind, ARMOUR['set'], json.dumps({k: S[k] for k in sorted(S)}, default=str),
           json.dumps(pose, sort_keys=True, default=str))
    if key not in _SCENES:
        _SCENES[key] = make(S, pose)
    return _SCENES[key]


def _same(rest, posed):
    assert len(posed) == len(rest), "every pose keeps the instrument's vertices"
    return posed
