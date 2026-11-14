"""The life skills' tools, made from numbers as the weapons are: the Wood-Axe, the Pick-Axe, the Sickle, the Skinning
Knife, the Spade, the Basket and the Fishing Rod. Each lies in its own frame, in metres: its root at the origin where
the hand holds it, the tool up +Z, its working side toward +X and its faces toward -Y and +Y, as an axe's bits are
(axes.py). Iron is grey, so the game's dye recolours it as it does a weapon's metal; wood, wicker, cord and line keep
their own colours.

A tool drawn where a weapon's frames stand (the Wood-Axe in the battleaxe's, the Pick-Axe in the warhammer's) takes
its haft from that weapon's fitted shape, so the haft stands where Daggerfall's stands and only the head is the
tool's own. Each piece is low and faceted, its faces flat, so each takes the lamp as one plane, as Daggerfall's low
models did."""
import math

import numpy as np

import axes

RING = 16   # points round a turned piece: a tool's haft is smaller on the screen than a weapon's

# the Wood-Axe's head over the battleaxe's fitted haft: a felling axe, one wedge of a bit, a flat poll behind
WOOD_AXE = {
    'eye_h': 0.085,      # the head's height along the haft (m): drawn large, as Daggerfall draws a head
    'eye_w': 0.06,       # its width round the haft, front to back (X)
    'eye_t': 1.6,        # its thickness (Y) over the haft's girth
    'bit_reach': 0.18,   # the edge's reach in front of the eye
    'bit_h': 0.21,       # the edge's height, flaring from the eye's
    'beard': 0.06,       # how far the edge's foot hangs below the eye's
    'bit_t': 0.0024,     # the edge's thickness
    'poll': 0.028,       # the poll's reach behind the eye
}
# the Pick-Axe: a haft and a head across its top, curved down at both arms - a point in front, a chisel behind
PICK = {
    'haft_len': 0.7,     # metres from the hand to the head's foot
    'haft_r': 0.017,
    'head_len': 0.21,    # each arm's reach from the haft
    'head_r': 0.022,     # the head's half-girth at the eye
    'droop': 0.18,       # how far each arm's end falls below the eye, over its reach
    'chisel_w': 0.022,   # the chisel's half-width at its edge
    'collar_h': 0.02,    # the collar round the haft under the head
}
# the Skinning Knife: a short broad blade with a full belly, a drop to its point, a wooden handle and an iron bolster
KNIFE = {
    'blade_len': 0.13,
    'blade_w': 0.034,
    'belly': 0.3,        # how far the edge swells past the blade's width, over the half-width
    'drop': 0.25,        # how far the spine drops toward the point, over the width
    'blade_t': 0.0035,   # the spine's thickness
    'handle_len': 0.11,
    'handle_r': 0.011,
}
# the Sickle: a crescent of iron off a short wooden handle, its edge inside the curve
SICKLE = {
    'shank': 0.05,       # the blade's straight shank out of the handle
    'arc_r': 0.1,        # the crescent's radius
    'arc': 1.1,          # how far round it sweeps, in half-turns, from the shank over the top
    'blade_w': 0.032,    # the blade's width where the shank meets the crescent, narrowing to the point
    'tang_w': 0.011,     # its width where it leaves the ferrule, on the handle's axis
    'blade_t': 0.0028,
    'handle_len': 0.12,
    'handle_r': 0.012,
}
# the Spade: a long haft to a blade dished a little across, its shoulders square and its edge straight
SPADE = {
    'haft_len': 0.62,
    'haft_r': 0.017,
    'blade_len': 0.24,
    'blade_w': 0.17,
    'dish': 0.018,       # how far the blade's middle stands behind its sides
    'blade_t': 0.004,
    'socket': 0.07,      # the iron socket and straps up the haft over the blade
}
# the Basket: a wicker bowl, a rim and a handle arched over it
BASKET = {
    'base_r': 0.085,
    'rim_r': 0.13,
    'depth': 0.11,
    'wall': 0.008,
    'handle_h': 0.15,    # the arch's height over the rim
    'handle_r': 0.008,
}
# the Fishing Rod: a cord-wrapped grip, a long tapering wooden rod with a few iron rings, the line from its tip
ROD = {
    'grip_len': 0.3,     # the grip's reach behind the hand (-Z) and before it
    'grip_r': 0.014,
    'rod_len': 2.1,      # from the hand to the tip
    'rod_r': 0.0095,     # the rod's radius at the grip, tapering to its tip
    'tip_r': 0.0018,
    'rings': 4.0,
    'line_r': 0.011,     # drawn thick, as Daggerfall would: wide enough to stay a whole texel out to the water
    'line': 0.0,         # the line drawn in the picture (1) or left to the game, which runs it to the float (0)
}
# a rod's pose of its own, each frame's: how far it bends toward its working side (+X) and where its line runs
ROD_POSE = {'bend': 0.0, 'line_x': 0.0, 'line_y': 0.0, 'line_z': -1.0, 'line_len': 1.5, 'line_out': 1.0}


def _join(pieces):
    """Pieces (vertices, triangles, material) as one mesh: (vertices, triangles, material a triangle)."""
    vs, ts, ms, base = [], [], [], 0
    for v, t, m in pieces:
        vs.append(np.asarray(v, dtype=np.float64))
        ts.append(np.asarray(t, dtype=np.int64) + base)
        ms.append(np.full(len(t), m, dtype=np.int64))
        base += len(v)
    return np.concatenate(vs), np.concatenate(ts), np.concatenate(ms)


def _lathe(z, r, caps=(True, True), ring=RING):
    """A turned piece up +Z, its rings at heights `z` and radii `r`, closed at the ends asked."""
    th = np.linspace(0, 2 * np.pi, ring, endpoint=False)
    z, r = np.asarray(z, dtype=np.float64), np.asarray(r, dtype=np.float64)
    P = np.stack([np.outer(r, np.cos(th)), np.outer(r, np.sin(th)), np.repeat(z[:, None], ring, 1)], -1)
    P = np.concatenate([P, P[:, :1]], axis=1)
    v, t = axes._grid(P)
    v, t = list(v), list(t[:, ::-1])
    n = ring + 1
    for end, (on, i) in enumerate(zip(caps, (0, len(z) - 1))):
        if on:
            mid = len(v)
            v.append([0.0, 0.0, z[i]])
            for j in range(ring):
                p, q = i * n + j, i * n + j + 1
                t.append((mid, p, q) if end == 0 else (mid, q, p))
    return np.array(v, dtype=np.float64), np.array(t, dtype=np.int64)


def _tube(C, rad, ring=8):
    """A tube along the points `C` (n, 3), its radius `rad` at each (a number or n of them), closed at both ends."""
    C = np.asarray(C, dtype=np.float64)
    rad = np.broadcast_to(np.asarray(rad, dtype=np.float64), (len(C),))
    T = np.gradient(C, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-12)
    up = np.where(np.abs(T[:, 1:2]) < 0.9, [[0.0, 1.0, 0.0]], [[1.0, 0.0, 0.0]])
    N = np.cross(T, up)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    B = np.cross(T, N)
    th = np.linspace(0, 2 * np.pi, ring + 1)
    P = C[:, None, :] + rad[:, None, None] * (np.cos(th)[None, :, None] * N[:, None, :]
                                              + np.sin(th)[None, :, None] * B[:, None, :])
    v, t = axes._grid(P)
    v, t = list(v), list(t)
    n = ring + 1
    for end, i in enumerate((0, len(C) - 1)):
        mid = len(v)
        v.append(C[i].tolist())
        for j in range(ring):
            p, q = i * n + j, i * n + j + 1
            t.append((mid, q, p) if end == 0 else (mid, p, q))
    return np.array(v, dtype=np.float64), np.array(t, dtype=np.int64)


def _block(lo, hi):
    """A closed box from corner `lo` to `hi`, each face its own four vertices, so it shades flat."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    faces = [[(x0, y0, z0), (x0, y0, z1), (x1, y0, z1), (x1, y0, z0)], [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1),
             (x0, y1, z1)], [(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], [(x1, y0, z0), (x1, y0, z1),
             (x1, y1, z1), (x1, y1, z0)], [(x0, y0, z1), (x0, y1, z1), (x1, y1, z1), (x1, y0, z1)],
             [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)]]
    v = np.array([p for f in faces for p in f], dtype=np.float64)
    t = np.array([(4 * k + a, 4 * k + b, 4 * k + c) for k in range(6) for a, b, c in ((0, 1, 2), (0, 2, 3))])
    return v, t


def _sheet(F, B):
    """A solid between two faces of the same grid of points (rows, cols, 3), front `F` and back `B`: both faces as
    flat facets, and the strips round their edges."""
    pieces = [axes._flat(F), axes._flat(B[:, ::-1])]
    rim = np.concatenate([np.arange(F.shape[1]), np.full(F.shape[0] - 2, F.shape[1] - 1)])
    for E, G in ((F[0], B[0]), (F[-1], B[-1]), (F[:, 0], B[:, 0]), (F[:, -1], B[:, -1])):
        pieces.append(axes._flat(np.stack([E, G], axis=1)))
    del rim
    v, t = [], []
    for pv, pt in pieces:
        t.append(pt + sum(len(x) for x in v))
        v.append(pv)
    return np.concatenate(v), np.concatenate(t)


def _frames(C, side=(0.0, 1.0, 0.0)):
    """A sweep's frame at each of its points: the tangent, the normal and the side (`side`, kept square to the
    tangent; the normal is the tangent across it)."""
    C = np.asarray(C, dtype=np.float64)
    T = np.gradient(C, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-12)
    B = np.broadcast_to(np.asarray(side, dtype=np.float64), C.shape).copy()
    B -= (B * T).sum(axis=1, keepdims=True) * T
    B /= np.maximum(np.linalg.norm(B, axis=1, keepdims=True), 1e-12)
    return T, np.cross(T, B), B


def _prism(C, hn, hb, chamfer=0.3, side=(0.0, 1.0, 0.0), caps=True):
    """A bar swept along the points `C`, its section a rectangle `hn` by `hb` (half sizes along the normal and the side,
    a number or one a point) with its corners cut by `chamfer` of the lesser: eight flat faces round it, each its own
    facet, as a smith's bar is forged, and its ends closed."""
    C = np.asarray(C, dtype=np.float64)
    T, N, B = _frames(C, side)
    n = len(C)
    hn = np.broadcast_to(np.asarray(hn, dtype=np.float64), (n,))
    hb = np.broadcast_to(np.asarray(hb, dtype=np.float64), (n,))
    c = chamfer * np.minimum(hn, hb)
    cn = np.stack([hn - c, hn, hn, hn - c, -hn + c, -hn, -hn, -hn + c, hn - c], axis=1)
    cb = np.stack([hb, hb - c, -hb + c, -hb, -hb, -hb + c, hb - c, hb, hb], axis=1)
    P = C[:, None, :] + cn[..., None] * N[:, None, :] + cb[..., None] * B[:, None, :]
    v, t = axes._flat(P)
    v, t = list(v), list(t)
    if caps:
        for end, i in enumerate((0, n - 1)):
            base = len(v)
            v.extend(P[i, :8].tolist())
            v.append(C[i].tolist())
            for j in range(8):
                a, b = base + j, base + (j + 1) % 8
                t.append((base + 8, b, a) if end == 0 else (base + 8, a, b))
    return np.array(v, dtype=np.float64), np.array(t, dtype=np.int64)


def _ball(c, r, ring=12):
    """A ball of radius `r` at `c`, faceted."""
    a = np.linspace(-0.5 * np.pi, 0.5 * np.pi, ring // 2 + 1)
    v, t = _lathe(r * np.sin(a), np.maximum(r * np.cos(a), 1e-5), caps=(False, False), ring=ring)
    return v + np.asarray(c, dtype=np.float64), t


def _haft(L, r, below=0.06, flare=0.1):
    """A haft from a little behind the hand to `L` up it, widening a little toward its head."""
    z = np.linspace(-below, L, 14)
    return _lathe(z, r * (1.0 + flare * np.clip(z, 0.0, None) / max(L, 1e-6)))


# --- the Wood-Axe ---------------------------------------------------------------------------------------------------

def wood_axe_shape(S):
    """The Wood-Axe's numbers over a battleaxe's fitted shape `S`: its haft's, and its head's own."""
    return {**WOOD_AXE, **{k: S[k] for k in ('haft_len', 'haft_r', 'sock_len', 'sock_r') if k in S}}


def wood_axe(S):
    """The Wood-Axe (materials 0 its iron, 1 its wood): the battleaxe's haft, and at the battleaxe's head's middle a
    felling axe's head - its eye a chamfered block round the haft with the haft's wedge in its top, a flat poll behind,
    and one wedge of a bit before it, its cheeks falling from a ridge down its middle to a steeper bevel at the edge,
    the edge long, swept and hanging into a beard. Each face a facet of its own: the lamp finds the cheek, the ridge
    and the bevel apart."""
    S = wood_axe_shape(S)
    zc = S['haft_len'] + 0.55 * S.get('sock_len', 0.15)
    h, w = S['eye_h'], S['eye_w']
    d = S['haft_r'] * S['eye_t']
    top = zc + h / 2
    pieces = [(*_haft(top + 0.005, S['haft_r']), 1),
              (*_prism([[0.0, 0.0, zc - h / 2], [0.0, 0.0, top]], w / 2, d, 0.35), 0),
              (*_prism([[-w / 2 + 0.002, 0.0, zc], [-w / 2 - S['poll'], 0.0, zc]], h * 0.42, d * 1.04, 0.3), 0),
              (*_block((-w * 0.3, -0.0016, top - 0.002), (w * 0.3, 0.0016, top + 0.008)), 0)]
    u = np.array([0.0, 0.15, 0.32, 0.5, 0.66, 0.82, 0.91, 1.0])[:, None]   # out from the eye to the edge
    s_ = np.linspace(0.0, 1.0, 9)[None, :]                                # from the foot to the top
    x = w / 2 + u * S['bit_reach'] + 0.016 * (1.0 - (2.0 * s_ - 1.0) ** 2) * u ** 2
    lo = zc - h / 2 - S['beard'] * u ** 1.6
    hi = zc + h / 2 + (S['bit_h'] - h - S['beard']) * u ** 1.6
    z = lo + s_ * (hi - lo)
    body = d * (1.0 - np.minimum(u, 0.82) / 0.82 * 0.8) ** 1.6   # the cheeks, falling from the eye
    t = np.where(u <= 0.82, body, d * 0.2 ** 1.6 * (1.0 - (u - 0.82) / 0.18)) + S['bit_t'] / 2   # the bevel, steeper
    t = t * (1.0 - 0.35 * np.abs(2.0 * s_ - 1.0))   # a ridge down the bit's middle
    F = np.stack([x + 0 * s_, -t, z], axis=-1)
    B = np.stack([x + 0 * s_, t, z], axis=-1)
    pieces.append((*_sheet(F, B), 0))
    return _join(pieces)


def wood_axe_length(S):
    S = wood_axe_shape(S)
    return S['haft_len'] + 0.55 * S.get('sock_len', 0.15) + S['eye_h'] / 2


# --- the Pick-Axe ---------------------------------------------------------------------------------------------------

def pick_axe(S):
    """The Pick-Axe (materials 0 its iron, 1 its wood): a haft, an iron collar under the head, the eye's boss standing
    proud round the haft with the haft's wedge in its top, and the head across it - an octagonal bar, its faces flat
    and its corners cut, each arm curving down to its end: a point before (+X), a chisel behind, wide across."""
    L, R = S['haft_len'], S['head_r']
    zc = L + R
    pieces = [(*_haft(zc + R * 1.05, S['haft_r']), 1),
              (*_lathe([L - S['collar_h'], L - S['collar_h'] + 0.004, L - 0.002, L],
                       S['haft_r'] * np.array([1.12, 1.3, 1.3, 1.15])), 0),
              (*_prism([[0.0, 0.0, L - 0.003], [0.0, 0.0, zc + R * 1.1]], R * 1.3, R * 1.2, 0.4), 0),
              (*_block((-R * 0.8, -0.0016, zc + R * 1.08), (R * 0.8, 0.0016, zc + R * 1.25)), 0)]
    s_ = np.linspace(-1.0, 1.0, 23)
    x = s_ * S['head_len']
    z = zc - S['droop'] * S['head_len'] * s_ ** 2
    k = np.clip((np.abs(s_) - 0.12) / 0.88, 0.0, 1.0)   # 0 at the eye, 1 at an arm's end
    hz = R * np.clip(1.0 - k, np.where(s_ > 0, 0.06, 0.1), 1.0) ** 0.8          # its height: to a point, or the chisel
    hy = np.where(s_ > 0, R * np.clip(1.0 - k, 0.06, 1.0) ** 0.9,              # its width: to the point, or out wide
                  R + (S['chisel_w'] - R) * k ** 1.5)
    pieces.append((*_prism(np.stack([x, np.zeros_like(x), z], axis=1), hz, hy, 0.32), 0))
    return _join(pieces)


def pick_length(S):
    return S['haft_len'] + S['head_r']


# the warhammer the Pick-Axe is fitted as: Daggerfall's frames are a warhammer's, a block of a head on its haft, and a
# pick's long arms would mislead the fit. Its poses are the pick's; the pick's head is drawn where the block was
HAMMER = {'haft_len': 0.7, 'haft_r': 0.017, 'head_len': 0.11, 'head_r': 0.035, 'head_h': 0.045, 'collar_h': 0.02}


def hammer(S):
    """The warhammer stand-in (materials 0 its iron, 1 its wood): the haft, the collar under the head and the head, a
    block `head_len` either side of the haft, `head_r` thick and `head_h` high."""
    L, h = S['haft_len'], S['head_h']
    return _join([(*_haft(L + 2 * h, S['haft_r']), 1),
                  (*_lathe([L - S['collar_h'], L - S['collar_h'] + 0.004, L - 0.002, L],
                           S['haft_r'] * np.array([1.12, 1.3, 1.3, 1.15])), 0),
                  (*_block((-S['head_len'], -S['head_r'], L), (S['head_len'], S['head_r'], L + 2 * h)), 0)])


def pick_from_hammer(S):
    """The pick's numbers over the fitted stand-in's: its haft, and a head slimmer than the block, its arms reaching
    well past the block's ends."""
    return {**PICK, 'haft_len': S['haft_len'], 'haft_r': S['haft_r'], 'head_r': 0.6 * S['head_r'],
            'head_len': 1.6 * S['head_len']}


# --- the Skinning Knife ---------------------------------------------------------------------------------------------

def knife(S):
    """The Skinning Knife (materials 0 its iron, 1 its dark wood, 2 its brass pins): a broad short blade up +Z, its spine
    (-X) straight and dropping to the point in a swedge, its edge (+X) swelling into a belly, ground in three: a flat
    from the spine, the grind's bevel, and a narrow edge bevel, each its own facet; an iron bolster; a handle of two
    wooden scales pinned through with brass; an iron cap at its end."""
    L, W = S['blade_len'], S['blade_w']
    z = np.linspace(0.0, L, 17)
    s_ = z / L
    edge = W / 2 * (1.0 + S['belly'] * np.sin(np.pi * np.clip(s_ / 0.85, 0, 1)) ** 2) * np.clip((1.0 - s_) / 0.3, 0, 1) ** 0.7
    spine = -W / 2 + S['drop'] * W * np.clip((s_ - 0.55) / 0.45, 0, 1) ** 1.8
    spine, edge = np.where(s_ > 0.999, 0.0, spine), np.where(s_ > 0.999, 0.0, edge)
    t = S['blade_t'] / 2 * (1.0 - 0.6 * s_) * (1.0 - 0.55 * np.clip((s_ - 0.6) / 0.4, 0, 1))   # the swedge thins the spine
    cols = np.array([0.0, 0.5, 0.86, 1.0])   # across, the spine to the edge: the flat, the grind, the edge's bevel
    X = spine[:, None] + cols[None, :] * (edge - spine)[:, None]
    Y = t[:, None] * np.array([1.0, 0.94, 0.2, 0.03])[None, :]
    Z = np.repeat(z[:, None], len(cols), 1)
    hl, hr = S['handle_len'], S['handle_r']
    zh = np.linspace(-hl, -0.012, 7)
    swell = 1.0 + 0.1 * np.sin(np.pi * (zh + hl) / hl)
    pieces = [(*_sheet(np.stack([X, -Y, Z], axis=-1), np.stack([X, Y, Z], axis=-1)), 0),
              (*_prism([[0.0, 0.0, -0.013], [0.0, 0.0, 0.003]], W * 0.56, S['blade_t'] * 2.4, 0.4), 0),
              (*_prism(np.stack([np.zeros_like(zh), np.zeros_like(zh), zh], axis=1), hr * 1.15 * swell, hr * 0.78 * swell,
                       0.45), 1),
              (*_prism([[0.0, 0.0, -hl - 0.009], [0.0, 0.0, -hl + 0.001]], hr * 1.2, hr * 0.86, 0.45), 0)]
    for zp in (-0.032, -hl + 0.024):   # the brass pins through both scales
        pieces.append((*_prism([[0.0, -hr * 0.84, zp], [0.0, hr * 0.84, zp]], 0.0022, 0.0022, 0.4, side=(1.0, 0.0, 0.0)), 2))
    return _join(pieces)


# --- the Sickle -----------------------------------------------------------------------------------------------------

def sickle(S):
    """The Sickle (materials 0 its iron, 1 its wood): a turned wooden handle below the hand, ringed at both ends, an
    iron ferrule, a shank up +Z and the crescent sweeping over toward +X and down - its spine thick, its face flat, its
    edge inside the curve bevelled and cut in fine teeth, as a reaping hook's is."""
    R, sh, bw = S['arc_r'], S['shank'], S['blade_w']
    th = np.linspace(np.pi, np.pi - S['arc'] * np.pi, 49)
    zs = np.linspace(0.0, sh, 6)[:-1]
    # the tang leaves the ferrule narrow and on the handle's axis, widening up the shank into the blade; the crescent
    # carries on from the shank's spine, so the blade stands square over the handle
    ws = S.get('tang_w', 0.011) + (bw - S.get('tang_w', 0.011)) * (zs / sh) ** 0.8
    wa = bw * (1.0 - np.linspace(0.0, 1.0, len(th))) ** 0.75 + 0.0006
    C = np.array([R - bw / 2, sh])
    outer = np.concatenate([np.stack([-ws / 2, zs], 1), C + R * np.stack([np.cos(th), np.sin(th)], 1)])
    k = np.linspace(0.0, 1.0, len(outer))
    w = np.concatenate([ws, wa])
    toward = np.concatenate([np.tile([[1.0, 0.0]], (len(zs), 1)), -np.stack([np.cos(th), np.sin(th)], 1)])
    teeth = np.where((k > 0.25) & (k < 0.95) & (np.arange(len(k)) % 2 == 1), 0.0014, 0.0)   # the serrated edge
    cols = np.array([0.0, 0.55, 0.84, 1.0])
    reach = w[:, None] * cols[None, :] - teeth[:, None] * (cols[None, :] == 1.0)
    XZ = outer[:, None, :] + toward[:, None, :] * reach[..., None]
    Y = (S['blade_t'] / 2 * (1.0 - 0.6 * k))[:, None] * np.array([1.0, 0.9, 0.22, 0.04])[None, :]
    F = np.stack([XZ[..., 0], -Y, XZ[..., 1]], axis=-1)
    B = np.stack([XZ[..., 0], Y, XZ[..., 1]], axis=-1)
    hl, hr = S['handle_len'], S['handle_r']
    zh = np.array([-hl, -hl + 0.004, -hl + 0.007, -hl + 0.011, -hl * 0.5, -0.034, -0.03, -0.027, -0.012])
    rh = hr * np.array([0.9, 1.08, 0.94, 1.06, 1.14, 1.05, 0.93, 1.04, 1.0])   # turned: a ring at each end
    return _join([(*_sheet(F, B), 0), (*_lathe([-0.028, -0.024, -0.004, 0.0], hr * np.array([1.0, 1.14, 1.14, 0.8])), 0),
                  (*_lathe(zh, rh), 1)])


# --- the Spade ------------------------------------------------------------------------------------------------------

def spade(S):
    """The Spade (materials 0 its iron, 1 its pale ash): a haft from the hand to an iron socket strapped up it and
    riveted, and the blade below the socket's foot, dished a little across: a raised frog down its back from the socket,
    its top folded into a tread to stand on, and a bevel at its edge."""
    L, W, D = S['haft_len'], S['blade_w'], S['blade_len']
    top = L + 0.03
    pieces = [(*_haft(top - 0.01, S['haft_r'], flare=0.05), 1),
              (*_lathe([L - S['socket'], L - S['socket'] + 0.01, L, top],
                       S['haft_r'] * np.array([1.1, 1.25, 1.35, 1.6])), 0)]
    for y in (-1.0, 1.0):   # the straps flat on the haft's faces, and their rivets
        yy = y * (S['haft_r'] + 0.0008)
        pieces.append((*_prism([[0.0, yy, L - S['socket'] - 0.03], [0.0, yy, L]], 0.006, 0.0012, 0.3), 0))
        for zr in (L - S['socket'] - 0.018, L - S['socket'] + 0.02):
            pieces.append((*_ball((0.0, yy + y * 0.0012, zr), 0.0017, ring=8), 0))
    u = np.linspace(-1.0, 1.0, 9)[None, :]                              # across
    v = np.array([0.0, 0.12, 0.3, 0.5, 0.7, 0.88, 0.95, 1.0])[:, None]  # along, from the shoulders to the edge
    x = u * W / 2 * (0.94 + 0.06 * (1.0 - v))
    z = top + v * D
    y = -S['dish'] * (1.0 - u ** 2) + 0 * v
    t = S['blade_t'] / 2 * np.where(v <= 0.88, 1.0 - 0.4 * v, (1.0 - 0.4 * 0.88) * (1.0 - (v - 0.88) / 0.12) * 0.9 + 0.1)
    frog = 0.007 * np.clip(1.0 - np.abs(u) / 0.32, 0.0, 1.0) * np.clip(1.0 - v / 0.5, 0.0, 1.0)
    F = np.stack([x + 0 * v, y - t, z + 0 * u], axis=-1)
    B = np.stack([x + 0 * v, y + t + frog, z + 0 * u], axis=-1)
    pieces.append((*_sheet(F, B), 0))
    pieces.append((*_prism([[-W / 2 * 0.96, 0.0, top + 0.0015], [W / 2 * 0.96, 0.0, top + 0.0015]], 0.0025, 0.0045, 0.45,
                           side=(0.0, 1.0, 0.0)), 0))   # the tread, folded along the top
    return _join(pieces)


def spade_length(S):
    return S['haft_len'] + 0.03 + S['blade_len']


# --- the Basket -----------------------------------------------------------------------------------------------------

def basket(S):
    """The Basket (materials 0 its wicker, 1 an apple's skin, 2 a mushroom's flesh, 3 a leaf): a bowl round +Z, wider at
    its rim than its base, its wall `wall` thick; a rolled rim and a handle arched over it from side to side (across X),
    both bound round in withies; and in it the day's finds - apples, a mushroom and a few leaves. Its root is the
    base's middle."""
    z = np.linspace(0.0, S['depth'], 7)
    r = S['base_r'] + (S['rim_r'] - S['base_r']) * (z / S['depth']) ** 0.8
    outer = _lathe(z, r, caps=(True, False), ring=14)
    inner = _lathe(z[::-1] + S['wall'] * np.r_[np.zeros(len(z) - 1), 1.0][::-1], r[::-1] - S['wall'],
                   caps=(False, True), ring=14)
    a = np.linspace(0.0, 2 * np.pi, 29)
    rim = np.stack([np.cos(a) * (S['rim_r'] - S['wall'] / 2), np.sin(a) * (S['rim_r'] - S['wall'] / 2),
                    np.full_like(a, S['depth'])], 1)
    b = np.linspace(0.0, np.pi, 17)
    arch = np.stack([np.cos(b) * (S['rim_r'] - S['wall']), np.zeros_like(b), S['depth'] + S['handle_h'] * np.sin(b)], 1)
    bound = lambda n, k: 1.0 + 0.22 * np.abs(np.sin(np.linspace(0.0, k * np.pi, n)))   # noqa: E731 - the withies' turns
    pieces = [(*outer, 0), (*inner, 0), (*_tube(rim, S['wall'] * 0.8 * bound(len(a), 14), ring=6), 0),
              (*_tube(arch, S['handle_r'] * bound(len(b), 8), ring=6), 0)]
    fill = S['depth'] - 0.012   # the finds lie a little under the rim
    for x, y, rr in ((0.035, 0.03, 0.03), (-0.04, 0.018, 0.028), (0.006, -0.05, 0.029)):
        pieces.append((*_ball((x, y, fill), rr, ring=8), 1))
    mx, my = -0.005, -0.01   # the mushroom: its stem, and its cap over it
    sv, st = _lathe(fill + np.array([-0.012, 0.012]), np.array([0.008, 0.007]), ring=10)
    cap = np.linspace(0.0, 0.5 * np.pi, 5)
    cv, ct = _lathe(fill + 0.012 + 0.018 * np.sin(cap), np.maximum(0.03 * np.cos(cap), 1e-4), caps=(True, False), ring=14)
    pieces += [(sv + np.array([mx, my, 0.0]), st, 2), (cv + np.array([mx, my, 0.0]), ct, 2)]
    for ang, (x, y) in ((0.4, (0.055, -0.01)), (2.2, (-0.06, -0.035))):   # a few leaves
        c, sn = math.cos(ang), math.sin(ang)
        L, Wd = 0.05, 0.018
        q = np.array([[0, 0], [L * 0.4, Wd], [L, 0], [L * 0.4, -Wd]])
        pts = np.stack([x + q[:, 0] * c - q[:, 1] * sn, y + q[:, 0] * sn + q[:, 1] * c, fill + 0.01 + q[:, 0] * 0.25], 1)
        pieces.append((pts, np.array([(0, 1, 2), (0, 2, 3)]), 3))
    return _join(pieces)


def basket_length(S):
    return S['depth'] + S['handle_h']


# --- the Fishing Rod ------------------------------------------------------------------------------------------------

def rod_spine(S, n=40):
    """The rod's middle line from the hand to its tip, bent toward +X by `bend` (the tip's fall over its length, the
    bend growing toward the tip), and its radius along it: (points (n, 3), radii (n,))."""
    s = np.linspace(0.0, 1.0, n)
    L, b = S['rod_len'], S.get('bend', 0.0)
    ang = b * 1.6 * s ** 2   # the angle the rod has turned through at each point
    step = L / (n - 1)
    x = np.concatenate([[0.0], np.cumsum(np.sin(ang[1:]) * step)])
    z = np.concatenate([[0.0], np.cumsum(np.cos(ang[1:]) * step)])
    r = S['rod_r'] + (S['tip_r'] - S['rod_r']) * s ** 0.8
    return np.stack([x, np.zeros(n), z], 1), r


def rod(S):
    """The Fishing Rod (materials 0 its iron, 1 the rod's wood, 2 the grip's cord, 3 the line): the grip round the hand,
    bound in close turns of cord, an iron cap at its butt, a wooden spool on its side with the line wound on it, the rod
    tapering to its tip in two lengths joined by an iron ferrule, bent as its pose asks, iron rings along it and at its
    tip, and the line from the tip `line_len` long toward (`line_x`, `line_y`, `line_z`) in the rod's frame, sagging."""
    C, r = rod_spine(S)
    g = S['grip_len']
    zg = np.linspace(-g * 0.8, g * 0.2, 41)
    rg = S['grip_r'] * (0.97 + 0.07 * np.abs(np.sin(zg * np.pi / 0.006))) * np.where(zg > g * 0.15, 0.9, 1.0)
    pieces = [(*_lathe(zg, rg), 2),
              (*_lathe([-g * 0.8 - 0.016, -g * 0.8 - 0.012, -g * 0.8 + 0.002],
                       S['grip_r'] * np.array([0.8, 1.12, 1.08])), 0),
              (*_tube(C, r, ring=8), 1)]
    sx = S['grip_r'] + 0.012   # the spool on the grip's side, its axis along the rod
    for zz, rr, m in (((-0.07, -0.066, -0.026, -0.022), (0.016, 0.016, 0.016, 0.016), 1),
                      ((-0.066, -0.026), (0.0075, 0.0075), 1), ((-0.06, -0.032), (0.0105, 0.0105), 3)):
        v, t = _lathe(np.array(zz), np.array(rr), ring=12)
        pieces.append((v + np.array([sx, 0.0, 0.0]), t, m))
    for z0 in (-0.064, -0.028):   # the spool's two iron straps to the grip
        pieces.append((*_block((S['grip_r'] * 0.6, -0.002, z0 - 0.003), (sx, 0.002, z0 + 0.003)), 0))
    mid = len(C) // 2
    pieces.append((*_tube(C[mid] + np.array([[0, 0, -0.012], [0, 0, 0.012]]), r[mid] * 1.5, ring=8), 0))   # the ferrule
    for k in range(1, int(S.get('rings', 0)) + 1):
        i = int(round(k / (S['rings'] + 1) * (len(C) - 1)))
        pieces.append((*_tube(C[i] + np.array([[0, 0, -0.004], [0, 0, 0.004]]), r[i] * 2.1, ring=8), 0))
    tip = C[-1]
    pieces.append((*_tube(tip + np.array([[0, 0, -0.008], [0, 0, 0.0]]), r[-1] * 2.4, ring=8), 0))   # the tip's ring
    d = np.array([S.get('line_x', 0.0), S.get('line_y', 0.0), S.get('line_z', -1.0)])
    d /= max(np.linalg.norm(d), 1e-9)
    s_ = np.linspace(0.0, 1.0, 12)[:, None]
    sag = np.array([0.0, 0.0, -1.0]) * 0.06 * S.get('line_out', 1.0) * np.sin(np.pi * s_)
    if S.get('line', 0.0) > 0:   # the game draws the line itself, from the tip to where the float lies
        line = tip + d * S.get('line_len', 1.5) * s_ + sag
        pieces.append((*_tube(line, S['line_r'], ring=5), 3))
    return _join(pieces)


def rod_length(S):
    return S['rod_len']


# --- materials ------------------------------------------------------------------------------------------------------

def wicker(name='wicker'):
    """Woven willow: bands round the bowl crossed by the stakes up it, each strand lit along its round, pale where
    the light takes it and brown in the weave's hollows."""
    import bpy
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.9
    b.inputs['Specular IOR Level'].default_value = 0.1
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type = 'GEOMETRY'
    at.attribute_name = 'rest'
    rows = nt.nodes.new('ShaderNodeTexWave')   # the weavers round the bowl
    rows.wave_type = 'BANDS'
    rows.bands_direction = 'Z'
    rows.inputs['Scale'].default_value = 13.0
    rows.inputs['Distortion'].default_value = 1.5
    L.new(at.outputs['Vector'], rows.inputs['Vector'])
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(at.outputs['Vector'], sep.inputs['Vector'])
    ang = nt.nodes.new('ShaderNodeMath')
    ang.operation = 'ARCTAN2'
    L.new(sep.outputs['Y'], ang.inputs[0])
    L.new(sep.outputs['X'], ang.inputs[1])
    stakes = nt.nodes.new('ShaderNodeMath')   # the stakes up it
    stakes.operation = 'SINE'
    scale = nt.nodes.new('ShaderNodeMath')
    scale.operation = 'MULTIPLY'
    scale.inputs[1].default_value = 10.0
    L.new(ang.outputs[0], scale.inputs[0])
    L.new(scale.outputs[0], stakes.inputs[0])
    mix = nt.nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY'
    L.new(rows.outputs['Fac'], mix.inputs[0])
    absval = nt.nodes.new('ShaderNodeMath')
    absval.operation = 'ABSOLUTE'
    L.new(stakes.outputs[0], absval.inputs[0])
    L.new(absval.outputs[0], mix.inputs[1])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.0, (0.04, 0.022, 0.01, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.45, (0.2, 0.125, 0.055, 1)
    L.new(mix.outputs[0], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.2
    bump.inputs['Distance'].default_value = 0.003
    L.new(mix.outputs[0], bump.inputs['Height'])
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def palette():
    """The tools' own materials beside the weapons': the rod's pale cane, the grip's dark cord, the line, the wicker.
    Their iron and their hafts' wood are the axe's (`axehead`, `haft`)."""
    import materials
    return {
        'rodwood': axes.wood('rodwood', (0.2, 0.12, 0.05), (0.42, 0.29, 0.13), scale=(160.0, 160.0, 4.0)),
        'cord': materials.plain('cord', (0.09, 0.05, 0.03), rough=0.95),
        'line': materials.plain('line', (0.1, 0.09, 0.07), rough=0.8),   # dark: it reads against the water and the sky
        'wicker': wicker(),
        'brass': materials.plain('brass', (0.5, 0.34, 0.1), rough=0.35, spec=0.6),
        'apple': materials.plain('apple', (0.42, 0.05, 0.03), rough=0.4, spec=0.5),
        'mushroom': materials.plain('mushroom', (0.6, 0.48, 0.32), rough=0.8),
        'leaf': materials.plain('leaf', (0.1, 0.22, 0.05), rough=0.7),
    }


CLASSES = {'rodwood': 1, 'cord': 1, 'line': 1, 'wicker': 1, 'brass': 1, 'apple': 1, 'mushroom': 1, 'leaf': 1}
SHAPES = {'pickaxe': PICK, 'knife': KNIFE, 'sickle': SICKLE, 'spade': SPADE, 'basket': BASKET, 'rod': ROD}
# a rod's own joints, each frame's (name, the fit's step, its bounds, the prior's unit, its rest): its bend, and where
# its line runs from the tip, in the rod's frame
ROD_JOINTS = (('bend', 0.05, (-0.4, 1.2), 0.1, 0.0), ('line_x', 0.1, (-1.0, 1.0), 0.2, 0.0),
              ('line_y', 0.1, (-1.0, 1.0), 0.2, 0.0), ('line_z', 0.1, (-1.0, 1.0), 0.2, -1.0),
              ('line_len', 0.1, (0.05, 6.0), 0.2, 1.5), ('line_out', 0.1, (0.0, 1.5), 0.2, 1.0))


def line_in_rod(pose, S, M):
    """A pose's line given in the eye's frame (`line_cam`: x right, y ahead, z up) as the rod's own (`line_x`...):
    `M` the rod's place (fpstage.pose_matrix). So a line hangs down to the water whatever the rod's angle."""
    v = np.asarray(pose['line_cam'], dtype=np.float64)
    d = M[:3, :3].T @ (v / max(np.linalg.norm(v), 1e-9))
    return {'line_x': float(d[0]), 'line_y': float(d[1]), 'line_z': float(d[2])}


def rod_posed(v, pose, S):
    """The rod made again at a pose's bend and line (its vertices are the rest's, one for one)."""
    out = rod({**S, **{j[0]: pose.get(j[0], j[4]) for j in ROD_JOINTS}})[0]
    assert len(out) == len(v), "every pose keeps the rod's vertices"
    return out


def weapons():
    """The tools as the forge's weapons (fpmodel.WEAPONS): each one part, its materials, its shape and its reach. The
    Wood-Axe has none of its own: it is drawn in the battleaxe's place (fptools.py)."""
    return {
        'pickfit': {'parts': {'pick': hammer}, 'mats': ('axehead', 'haft'), 'shape': HAMMER,
                    'length': lambda S, part: S['haft_len'] + 2 * S['head_h'], 'girth': lambda S, part: 2 * S['head_len'],
                    'root_r': lambda S, part: S['haft_r'], 'wide_far': True},
        'pickaxe': {'parts': {'pick': pick_axe}, 'mats': ('axehead', 'haft'), 'shape': PICK,
                    'length': lambda S, part: pick_length(S), 'girth': lambda S, part: 2 * S['head_len'],
                    'root_r': lambda S, part: S['haft_r'], 'wide_far': True},
        'knife': {'parts': {'knife': knife}, 'mats': ('blade', 'staff', 'brass'), 'shape': KNIFE,
                  'length': lambda S, part: S['blade_len'], 'girth': lambda S, part: S['blade_w'],
                  'root_r': lambda S, part: S['handle_r']},
        'sickle': {'parts': {'sickle': sickle}, 'mats': ('blade', 'haft'), 'shape': SICKLE,
                   'length': lambda S, part: S['shank'] + S['arc_r'] * 2, 'girth': lambda S, part: 2 * S['arc_r'],
                   'root_r': lambda S, part: S['handle_r']},
        'spade': {'parts': {'spade': spade}, 'mats': ('axehead', 'rodwood'), 'shape': SPADE,
                  'length': lambda S, part: spade_length(S), 'girth': lambda S, part: S['blade_w'],
                  'root_r': lambda S, part: S['haft_r'], 'wide_far': True},
        'basket': {'parts': {'basket': basket}, 'mats': ('wicker', 'apple', 'mushroom', 'leaf'), 'shape': BASKET,
                   'length': lambda S, part: basket_length(S), 'girth': lambda S, part: 2 * S['rim_r'],
                   'root_r': lambda S, part: S['base_r']},
        'rod': {'parts': {'rod': rod}, 'mats': ('axehead', 'rodwood', 'cord', 'line'), 'shape': ROD,
                'posed': rod_posed, 'joints': {'rod': ROD_JOINTS},
                'length': lambda S, part: S['rod_len'], 'girth': lambda S, part: 2 * S['grip_r'],
                'root_r': lambda S, part: S['grip_r']},
    }


# what fpfit.py --shape fits for the Pick-Axe, fitted to the warhammer's frames as its stand-in: its girth and head
SHAPE_KEYS = {'pickfit': ('focal', 'haft_r', 'head_len', 'head_r', 'head_h', 'collar_h')}
SHAPE_STEP = {'head_r': 0.002, 'head_h': 0.003}
BOUNDS = {'head_r': (0.008, 0.07), 'head_h': (0.015, 0.09)}
