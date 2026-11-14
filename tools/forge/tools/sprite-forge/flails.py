"""The flail (WEAPON06.CIF), made from numbers as Daggerfall's was modelled: a wooden handle, an iron ferrule capping it
with a rolled lip on the wood and an eye on its top, a chain of thick links hung from the eye, and a ball at the chain's
end, studded with conical spikes and pocked with deep oval sockets.

The flail lies in its own frame, in metres: its root at the origin where the hand holds the handle, the handle up +Z to
the ferrule's top, which is the far end a pose aims (fpstage.pose_matrix). The chain is not rigid, so the pose's joints
place it: it hangs `swing` degrees off the handle's line toward +X (the pose's roll turns that plane about the handle),
bends `curl` degrees more along its length in that plane, and `sway` degrees out of it toward +Y. Its first link stands
on the ferrule's top, turned no further than the rim lets it, and the chain turns over the rim past it. The links lie
along that curve, each rigid and hooked through the last, alternately face-on and edge-on to the plane. The ball
hangs from the last link, its axis along the chain's end.

The handle is wood; the ferrule, the eye, the chain and the ball are the metal the dye recolours.

Each metal's flail is a make of its own (`MAKES`), steel's too, in the language that metal's warhammer speaks
(fpwarhammers.py): its head at about the fitted ball's size in place of the ball, its ferrule, and its handle dressed
as that warhammer's haft is. Its chain is the fitted flail's, its links each metal's own (`LOOK`), posed as above.
fpflails.py renders it in the make's own materials (`MATS`)."""
import math

import numpy as np

import fpstage
import fpwarhammers
from fpwarhammers import loft, section, stud, strut, sweep, up

FLAIL = {
    'haft_len': 0.42,    # metres from the hand to the ferrule's foot
    'haft_r': 0.021,     # the handle's radius at the hand
    'haft_end': 0.95,    # its radius at the ferrule, over the hand's
    'fer_len': 0.045,     # the ferrule's height
    'fer_r': 0.025,      # its radius
    'eye_len': 0.009,    # the eye standing on the ferrule's top, the chain hung from it
    'eye_r': 0.3,        # its radius, over the ferrule's
    'links': 6.0,        # the chain's links
    'link_len': 0.046,    # a link's outer length
    'link_w': 0.028,     # its outer width
    'link_bar': 0.25,    # its bar's width over its own: Daggerfall's open links, a hole half their width
    'link_pitch': 0.46,  # how far one link's middle stands from the next's, over a link's length
    'link_sq': 4.5,      # how square its loop: 2 an oval, more an oblong with rounded corners
    'ball_r': 0.055,      # the ball's radius
    'spikes': 32.0,      # the ball's spikes, some cleared by its sockets and its chain
    'spike_len': 0.02,  # a spike's length past the ball
    'spike_r': 0.0085,    # its radius at its foot
    'sockets': 6.0,      # the deep oval sockets pocking the ball
    'sock_w': 0.27,      # a socket's half-length, radians round the ball
    'sock_h': 0.15,      # its half-width
    'sock_d': 0.9,       # its depth, over its half-width's arc
}

RING = 24                 # points round the handle and the ferrule
LINK_PATH, LINK_SEC = 32, 12   # a link's loop and its bar's section
BAR_SQ = 3.0              # how square a link's bar: 2 round
BALL_U, BALL_V = 64, 32   # the ball's points round and pole to pole
SPIKE_SIDES = 8
CHAIN_STEPS = 240         # the chain's curve integrated in this many steps


def length(S):
    """The hand to the ferrule's top: the length a pose aims along."""
    return S['haft_len'] + S['fer_len']


# each metal's flail: its own make (MAKES, below), in the language its warhammer speaks, its chain's links `mul` times
# the fitted flail's and `set` its own. Steel's too is a make of its own: DFU's FPSWeapon.GetWeaponTexture2D shows
# steel the file's own plain flail undyed, and we show steel the dressed make its warhammer is a sibling of
LOOK = {
    'Steel': {'make': 'Steel'},
    'Iron': {'make': 'Iron', 'mul': {'link_w': 1.06}, 'set': {'link_bar': 0.3, 'link_sq': 6.0}},
    'Silver': {'make': 'Silver', 'set': {'link_bar': 0.22, 'link_sq': 2.6}},
    'Elven': {'make': 'Elven', 'mul': {'link_w': 0.94}, 'set': {'link_bar': 0.21, 'link_sq': 2.6}},
    'Dwarven': {'make': 'Dwarven', 'set': {'link_bar': 0.28, 'link_sq': 8.0}},
    'Mithril': {'make': 'Mithril', 'mul': {'link_w': 0.92}, 'set': {'link_bar': 0.22}},
    'Adamantium': {'make': 'Adamantium', 'mul': {'link_w': 1.08}, 'set': {'link_bar': 0.3}},
    'Ebony': {'make': 'Ebony', 'set': {'link_sq': 6.0}},
    'Orcish': {'make': 'Orcish', 'mul': {'link_w': 1.06}, 'set': {'link_bar': 0.3, 'link_sq': 3.0}},
    'Daedric': {'make': 'Daedric', 'set': {'link_sq': 6.0}},
}
METALS = tuple(LOOK)

# a make's materials, in the order its triangles name them: the fitted flail's two (its iron and its wood), then the
# head, the ferrule and sleeves, the fittings in the metal's own colours, a grip's wrap and a glowing core. Rendered as
# fpmetals.py renders a flail, a make wears the fitted flail's materials in their place
MATS = ('flailiron', 'flailwood', 'flail_head', 'flail_sleeve', 'flail_accent', 'flail_grip', 'flail_core')
IRON, WOOD, HEAD, SLEEVE, ACCENT, GRIP, CORE = range(len(MATS))
PLAIN = {'flail_head': 'flailiron', 'flail_sleeve': 'flailiron', 'flail_accent': 'flailiron', 'flail_grip': 'flailwood',
         'flail_core': 'glow'}


def shape(S, metal='Steel'):
    """`metal`'s flail over the fitted shape `S`: its make, and its links' values multiplied and its own set."""
    look = LOOK[metal]
    out = dict(S)
    for k, v in look.get('mul', {}).items():
        out[k] = out[k] * v
    out.update(look.get('set', {}))
    if 'make' in look:
        out['make'] = look['make']
    return out


def materials(metal='Steel'):
    """The flail's materials as fpmetals.py renders it, in the order its triangles name them: the metal and the
    handle's wood, a make's own (MATS) worn as the nearest of those and its core as fpmetals.py's glow."""
    return tuple(PLAIN.get(n, n) for n in MATS) if LOOK[metal].get('make') else ('flailiron', 'flailwood')


def bar(S):
    """A link's bar's radius: round, as thick as it is wide."""
    return S['link_bar'] * S['link_w'] / 2


def pitch(S):
    """How far one link's centre stands from the next's, the next hooked through its end."""
    return S['link_pitch'] * S['link_len']


def _lathe(z, r, caps=(False, False), n=RING):
    """A turned piece up +Z: rings at heights `z`, radius `r`. Answers (vertices, triangles), wound outward."""
    th = np.linspace(0.0, 2.0 * np.pi, n, endpoint=False)
    v = np.stack([np.outer(r, np.cos(th)), np.outer(r, np.sin(th)), np.repeat(np.asarray(z)[:, None], n, 1)], -1)
    v = v.reshape(-1, 3)
    t = []
    for i in range(len(z) - 1):
        for j in range(n):
            p, q = i * n + j, i * n + (j + 1) % n
            t += [(p, q, q + n), (p, q + n, p + n)]
    v = list(v)
    for end, (on, i) in enumerate(zip(caps, (0, len(z) - 1))):
        if on:
            mid = len(v)
            v.append([0.0, 0.0, z[i]])
            for j in range(n):
                p, q = i * n + j, i * n + (j + 1) % n
                t.append((mid, q, p) if end == 0 else (mid, p, q))
    return np.array(v, dtype=np.float64), np.array(t, dtype=np.int64)


def _handle(S):
    """The wooden handle, from the hand to inside the ferrule, narrowing a little toward it."""
    z = np.linspace(0.0, S['haft_len'] + 0.5 * S['fer_len'], 28)
    return _lathe(z, _haft_r(S, z), caps=(True, False))


def _haft_r(S, z):
    return S['haft_r'] * (1.0 + (S['haft_end'] - 1.0) * np.clip(z / S['haft_len'], 0.0, 1.0))


def _ferrule(S):
    """The ferrule: a rolled lip on the wood, a straight body, a rounded shoulder to its top, and the eye on that."""
    z0, L, R = S['haft_len'], S['fer_len'], S['fer_r']
    u = np.array([0.0, 0.03, 0.08, 0.14, 0.2, 0.26, 0.8, 0.9, 0.96, 1.0])
    f = np.array([0.86, 1.04, 1.1, 1.08, 1.01, 1.0, 1.0, 0.96, 0.86, 0.66])
    out = [_lathe(z0 + u * L, R * f, caps=(True, True))]
    top = z0 + L
    er = S['eye_r'] * R
    ez = top + np.array([-0.002, 0.0, 0.25, 0.75, 1.0]) * S['eye_len']
    out.append(_lathe(ez, er * np.array([1.0, 1.0, 0.95, 0.95, 0.75]), caps=(False, True), n=16))
    return out


def _cone(base, d, length_, r, sides, sweep=0.0, toward=None, rings=1):
    """A spike from `base` along `d`, `length_` long and `r` round at its foot, with `sides` sides, bending `sweep`
    degrees toward `toward` over its length (in `rings` steps): (vertices, triangles), its foot open (it stands in the
    surface it grows from)."""
    u, w = _frame(d)
    toward = u if toward is None else toward - (toward @ d) * d
    toward = toward / max(np.linalg.norm(toward), 1e-12)
    ring = np.linspace(0.0, 2.0 * np.pi, sides, endpoint=False)
    vs, centre, axis = [], base.astype(np.float64), d.astype(np.float64)
    step = length_ / rings
    for i in range(rings + 1):
        rr = r * (1.0 - i / rings)
        if i == rings:
            vs.append(centre[None, :])
            break
        a, b = _frame(axis)
        vs.append(centre + rr * (np.outer(np.cos(ring), a) + np.outer(np.sin(ring), b)))
        bend = math.radians(sweep) * (2 * i + 1) / (rings * rings)
        axis = axis * math.cos(bend) + toward * math.sin(bend)
        axis /= np.linalg.norm(axis)
        toward = toward - (toward @ axis) * axis
        toward /= max(np.linalg.norm(toward), 1e-12)
        centre = centre + axis * step
    v = np.vstack(vs)
    t = []
    for i in range(rings - 1):
        for k in range(sides):
            p, q = i * sides + k, i * sides + (k + 1) % sides
            t += [(p, q, q + sides), (p, q + sides, p + sides)]
    apex = len(v) - 1
    last = (rings - 1) * sides
    t += [(last + k, last + (k + 1) % sides, apex) for k in range(sides)]
    return v, np.array(t, dtype=np.int64)


def _link(S):
    """One link in its own frame: its loop in the XZ plane round its centre, its length along Z, its bar a ring
    swept round the loop. A superellipse loop: `link_sq` 2 an oval, more an oblong with rounded corners."""
    t = bar(S)
    a = S['link_len'] / 2 - t   # the bar's middle line: half its length
    b = S['link_w'] / 2 - t     # and half its width
    k = 2.0 / max(S.get('link_sq', 2.0), 1.0)
    s = np.linspace(0.0, 2.0 * np.pi, LINK_PATH, endpoint=False)
    c, n = np.cos(s), np.sin(s)
    P = np.stack([b * np.sign(c) * np.abs(c) ** k, np.zeros_like(s), a * np.sign(n) * np.abs(n) ** k], axis=1)
    T = np.roll(P, -1, axis=0) - np.roll(P, 1, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-12)
    out = np.cross(T, [0.0, 1.0, 0.0])   # in the loop's plane, away from its middle
    out *= np.sign((out * P).sum(axis=1, keepdims=True) + 1e-12)
    ph = np.linspace(0.0, 2.0 * np.pi, LINK_SEC, endpoint=False) + np.pi / LINK_SEC
    kb = 2.0 / BAR_SQ   # the bar's section a rounded square: its faces flat, as Daggerfall's links' are
    cs, sn = np.sign(np.cos(ph)) * np.abs(np.cos(ph)) ** kb, np.sign(np.sin(ph)) * np.abs(np.sin(ph)) ** kb
    v = (P[:, None, :] + t * (cs[None, :, None] * out[:, None, :]
                                         + sn[None, :, None] * np.array([0.0, 1.0, 0.0])))
    v = v.reshape(-1, 3)
    t = []
    for i in range(LINK_PATH):
        for j in range(LINK_SEC):
            p = i * LINK_SEC + j
            q = i * LINK_SEC + (j + 1) % LINK_SEC
            p2 = ((i + 1) % LINK_PATH) * LINK_SEC + j
            q2 = ((i + 1) % LINK_PATH) * LINK_SEC + (j + 1) % LINK_SEC
            t += [(p, p2, q2), (p, q2, q)]
    return v, np.array(t, dtype=np.int64)


def _fibonacci(n, offset=0.0):
    """`n` directions spread evenly over the sphere."""
    k = np.arange(n) + 0.5
    z = 1.0 - 2.0 * k / n
    r = np.sqrt(np.maximum(1.0 - z * z, 0.0))
    th = np.pi * (1.0 + 5.0 ** 0.5) * k + offset
    return np.stack([r * np.cos(th), r * np.sin(th), z], axis=1)


def _frame(d):
    """Two directions square to `d` and to each other."""
    a = np.array([0.0, 0.0, 1.0]) if abs(d[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(d, a)
    u /= np.linalg.norm(u)
    return u, np.cross(d, u)


def _ball(S):
    """The head in its own frame, its centre at the origin and the chain's end along -Z: a ball pocked with deep oval
    sockets, its spikes standing between them. Answers (vertices, triangles, material a triangle)."""
    R = S['ball_r']
    nu, nv = BALL_U, BALL_V
    th = np.linspace(0.0, 2.0 * np.pi, nu, endpoint=False)
    ph = np.linspace(0.0, np.pi, nv + 1)[1:-1]
    d = np.stack([np.outer(np.sin(ph), np.cos(th)), np.outer(np.sin(ph), np.sin(th)),
                  np.repeat(np.cos(ph)[:, None], nu, 1)], -1).reshape(-1, 3)
    d = np.vstack([d, [[0.0, 0.0, 1.0], [0.0, 0.0, -1.0]]])
    r = np.full(len(d), R)
    ns = int(round(S.get('sockets', 0.0)))
    for c in _sockets(ns):
        u, w = _frame(c)
        x, y = np.arctan2(d @ u, d @ c), np.arctan2(d @ w, d @ c)   # the socket's elliptic distance, long along u
        e = np.sqrt((x / S['sock_w']) ** 2 + (y / S['sock_h']) ** 2)
        bowl = np.where(((d @ c) > 0) & (e < 1.0), np.sqrt(np.maximum(1.0 - e * e, 0.0)), 0.0)
        r = np.minimum(r, R * (1.0 - S['sock_d'] * S['sock_h'] * bowl))
    v = d * r[:, None]
    t = []
    for i in range(nv - 2):
        for j in range(nu):
            p, q = i * nu + j, i * nu + (j + 1) % nu
            t += [(p, q + nu, q), (p, p + nu, q + nu)]
    top, bot = len(d) - 2, len(d) - 1
    last = (nv - 2) * nu
    for j in range(nu):
        t.append((top, j, (j + 1) % nu))
        t.append((bot, last + (j + 1) % nu, last + j))
    pieces = [(v, np.array(t, dtype=np.int64), IRON)]
    sockets = _sockets(ns)
    for c in _fibonacci(int(round(S.get('spikes', 0.0)))):
        if c[2] < -0.8:   # nor a spike where the chain hangs
            continue
        if len(sockets) and (sockets @ c).max() > math.cos(1.6 * S['sock_w']):
            continue   # no spike in a socket nor on its rim
        pieces.append((*_cone(R * 0.94 * c, c, 0.06 * R + S['spike_len'], S['spike_r'], SPIKE_SIDES), IRON))
    return _whole(pieces)


def _sockets(n):
    """The sockets' middles: spread over the head, none where the chain hangs from it."""
    return np.array([c for c in _fibonacci(n, offset=1.3) if c[2] >= -0.75]).reshape(-1, 3) if n else np.zeros((0, 3))


EYE_TURN = 75.0   # degrees the first link may turn off the handle's line: the ferrule's top holds it up


def chain_curve(S, swing=0.0, curl=0.0, sway=0.0):
    """The chain's middle line from the eye's top: (points, directions) at CHAIN_STEPS + 1 even steps of its length,
    which runs through every link and on to the ball's centre. The first link leaves the eye `swing` degrees off +Z
    toward +X, but no further than EYE_TURN: a link hooked on the eye cannot hang down through the ferrule, so it
    stands on it and the chain turns over the rim past it. Past the first link the chain runs at `swing`, turns `curl`
    degrees more in that plane over its length, and `sway` degrees out of it toward +Y."""
    n = int(round(S['links']))
    a, p = S['link_len'] / 2 - bar(S), pitch(S)
    L = a + (n - 1) * p + a + S['ball_r']
    s = np.linspace(0.0, L, CHAIN_STEPS + 1)
    s1 = min(a + p / 2, L)   # the first link's far end
    u = np.clip((s - s1) / max(L - s1, 1e-9), 0.0, 1.0)
    first = s < s1
    lead = math.radians(float(np.clip(swing, -EYE_TURN, EYE_TURN)))
    th = np.where(first, lead, math.radians(swing) + math.radians(curl) * u)
    ph = np.where(first, 0.0, math.radians(sway) * u)
    d = np.stack([np.sin(th) * np.cos(ph), np.sin(ph), np.cos(th) * np.cos(ph)], axis=1)
    mid = 0.5 * (d[1:] + d[:-1])
    P = np.vstack([np.zeros(3), np.cumsum(mid * (L / CHAIN_STEPS), axis=0)])
    P += [0.0, 0.0, S['haft_len'] + S['fer_len'] + S['eye_len'] - bar(S)]
    return P, d, L


def _at(P, L, s):
    """The curve's point at length `s` along it."""
    x = np.clip(s / L, 0.0, 1.0) * (len(P) - 1)
    i = min(int(x), len(P) - 2)
    t = x - i
    return P[i] * (1 - t) + P[i + 1] * t


def _place(S, swing=0.0, curl=0.0, sway=0.0):
    """Each link's and the ball's place on the chain's curve: a list of (3 x 3 rotation, centre)."""
    P, d, L = chain_curve(S, swing, curl, sway)
    n = int(round(S['links']))
    a, p = S['link_len'] / 2 - bar(S), pitch(S)
    out = []
    side = np.array([0.0, 1.0, 0.0])   # the curve's plane's normal: an even link lies across it, an odd one in it
    for k in range(n):
        lo, hi = _at(P, L, a + k * p - p / 2), _at(P, L, a + k * p + p / 2)
        ax = hi - lo
        ax /= max(np.linalg.norm(ax), 1e-12)
        w = side - (side @ ax) * ax
        w /= max(np.linalg.norm(w), 1e-12)
        if k % 2:
            w = np.cross(ax, w)
        # the link's frame: its width along X, its face's normal along Y, its length along Z
        out.append((np.stack([w, np.cross(ax, w), ax], axis=1), 0.5 * (lo + hi)))
    end = P[-1]
    ax = d[-1]
    w = side - (side @ ax) * ax
    w /= max(np.linalg.norm(w), 1e-12)
    out.append((np.stack([w, np.cross(ax, w), ax], axis=1), end))
    return out


# ---- each metal's make. Its head lies in the ball's frame (its middle at the origin, the chain's end at -Z), its
# ferrule and its handle's dressing in the flail's. The handle is dressed as its warhammer's haft is (fpwarhammers.py),
# read as a haft whose head's foot is the ferrule's (`_haft`), each piece's material put in the flail's (`_as_flail`)

RING_AT = 0.03   # the band over the hand, where a dressing has one


def _haft(S, collar):
    """The handle as fpwarhammers.py's dressings read a haft: its girth the handle's, the head's foot `collar` above the
    ferrule's, nothing below the hand."""
    return {'haft_len': S['haft_len'], 'haft_r': S['haft_r'], 'haft_taper': S['haft_end'], 'collar_len': collar,
            'collar_r': 1.0, 'haft_below': 0.0, 'ring_at': RING_AT}


def _as_flail(pieces):
    """A warhammer's pieces in the flail's materials: its head, collar, haft, accent, glow and grip
    (fpwarhammers.py)."""
    to = (HEAD, SLEEVE, WOOD, ACCENT, CORE, GRIP)
    return [(v, t, to[m]) for v, t, m in pieces]


def _top(S):
    return S['haft_len'] + S['fer_len']


def _cap(S, zb, rf, kind='round', mat=SLEEVE, n=16, steps=((0.45, 0.97), (0.8, 0.8), (1.0, 0.5))):
    """The ferrule's head: from the dressing's top `zb`, `rf` round, shouldering in to the ferrule's top by `steps`
    (each a share of the way up and of `rf`), and the eye standing on it, the chain hung from it."""
    top, sec = _top(S), section(kind, 1.0, 1.0, 0.35, n=n)
    out = [loft([up(zb - 0.001, sec, rf)] + [up(zb + (top - zb) * u, sec, rf * k) for u, k in steps], mat)]
    er = S['eye_r'] * S['fer_r']
    ez = top + np.array([-0.002, 0.0, 0.25, 0.75, 1.0]) * S['eye_len']
    ev, et = _lathe(ez, er * np.array([1.0, 1.0, 0.95, 0.95, 0.75]), caps=(False, True), n=12)
    return out + [(ev, et, mat)]


def _orb(R, warp=None, nu=40, nv=20):
    """A ball `R` round, `warp(directions)` its radius over R where it is not round: (vertices, triangles)."""
    th = np.linspace(0.0, 2.0 * np.pi, nu, endpoint=False)
    ph = np.linspace(0.0, np.pi, nv + 1)[1:-1]
    d = np.stack([np.outer(np.sin(ph), np.cos(th)), np.outer(np.sin(ph), np.sin(th)),
                  np.repeat(np.cos(ph)[:, None], nu, 1)], -1).reshape(-1, 3)
    d = np.vstack([d, [[0.0, 0.0, 1.0], [0.0, 0.0, -1.0]]])
    v = d * (R * warp(d) if warp else np.full(len(d), R))[:, None]
    t = []
    for i in range(nv - 2):
        for j in range(nu):
            p, q = i * nu + j, i * nu + (j + 1) % nu
            t += [(p, q + nu, q), (p, p + nu, q + nu)]
    top, bot, last = len(d) - 2, len(d) - 1, (nv - 2) * nu
    for j in range(nu):
        t += [(top, j, (j + 1) % nu), (bot, last + (j + 1) % nu, last + j)]
    return v, np.array(t, dtype=np.int64)


def _lumps(seed, depth):
    """A ball's radius over its round where it was forged by hand: a few broad swellings and flats, `depth` deep."""
    k = np.random.default_rng(seed).normal(size=(3, 3))
    return lambda d: 1.0 + depth * np.sin(2.2 * d @ k.T + np.arange(3)).mean(axis=1)


def _axis_to(v, axis):
    """Vertices about +Z turned so +Z lies along `axis`."""
    axis = np.asarray(axis, float) / np.linalg.norm(axis)
    if abs(axis[2]) > 0.999999:
        return v * np.array([1.0, np.sign(axis[2]), np.sign(axis[2])])
    u, w = _frame(axis)
    return v @ np.stack([u, w, axis], axis=0)


def _hoop(r_in, r_out, h, mat, z=0.0, axis=(0.0, 0.0, 1.0), n=40, round_=False):
    """A band round an axis through the head's middle, `r_in` to `r_out` from it and `h` to each side of height `z`
    along it: square in section, its faces each shaded flat across, or (`round_`) rounded."""
    if round_:
        a = np.linspace(0.0, 2.0 * np.pi, 9)
        rm, rr = (r_in + r_out) / 2, (r_out - r_in) / 2
        v, t = _lathe(z + h * np.sin(a), rm + rr * np.cos(a), n=n)
        return _axis_to(v, axis), t, mat
    faces = [_lathe(z + h * np.array(zs), np.array(rs), n=n)   # each face its own, so its edges stay sharp
             for zs, rs in (((-1, -1), (r_in, r_out)), ((-1, 1), (r_out, r_out)), ((1, 1), (r_out, r_in)),
                            ((1, -1), (r_in, r_in)))]
    v, t, _ = _whole([(fv, ft, 0) for fv, ft in faces])
    return _axis_to(v, axis), t, mat


def _point(c, R, length_, r, mat, sides=8):
    """A round spike from the head's surface `R` out along `c`: (vertices, triangles, material)."""
    c = np.asarray(c, float) / np.linalg.norm(c)
    return (*_cone(R * c, c, length_, r, sides), mat)


def _neck(R, w, mat, kind='chamfer', depth=0.3):
    """The neck the chain's last link hooks into, at the head's foot: `w` round, standing `depth` of R into it."""
    sec = section(kind, w, w, 0.3)
    return loft([up(-R * 1.005, sec), up(-R * (1.0 - depth), sec, 1.15)], mat)


def _dirs(n, offset=0.0, below=-0.6, band=0.0):
    """`n` directions spread over the head, none where the chain hangs (`below`) nor within `band` of its middle."""
    return [c for c in _fibonacci(n, offset) if c[2] > below and abs(c[2]) >= band]


def _iron(S):
    """Forged iron, rough from the hammer: a lumpy ball girt by a square band, a dozen heavy four-sided spikes and one
    standing on its far end; a socket nailed through its straps, and square bands down a dark handle."""
    R = S['ball_r']
    head = [(*_orb(R * 0.96, _lumps(5, 0.035)), HEAD), _hoop(R * 0.86, R * 1.03, 0.0075, HEAD, n=12),
            _neck(R, 0.012, HEAD, 'square')]
    rng = np.random.default_rng(11)
    for c in _dirs(16, 0.4, band=0.2):
        head.append(stud(R * 0.92 * c, c, 0.0085, 0.024 * rng.uniform(0.85, 1.12), HEAD))
    head.append(stud(np.array([0.0, 0.0, R * 0.92]), [0.0, 0.0, 1.0], 0.0095, 0.03, HEAD))
    collar = 0.6 * S['fer_len']
    h = _haft(S, collar)
    handle = _as_flail(fpwarhammers._socket(h, length=0.012, strap=0.05) + fpwarhammers._bands(h, at=(0.1, 0.19)))
    return handle + _cap(S, S['haft_len'] + collar, S['haft_r'] * S['haft_end'] * 1.4, 'chamfer', n=8), head, IRON


def _steel(S):
    """Smith's steel, dressed: a ball girt by three bands, about its middle and over its far end both ways, framing
    eight panels round a boss and a spike; a boss where the bands cross, and a beak standing on the far end. A
    chamfered ferrule over straps down the handle, three rings close together, and a cord wound below, studded."""
    R = S['ball_r']
    head = [(*_orb(R * 0.95), HEAD), _neck(R, 0.011, HEAD)]
    for axis in ((0.0, 0.0, 1.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)):
        head.append(_hoop(R * 0.88, R * 1.04, 0.0055, HEAD, axis=axis, n=32))
    for c in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)):
        head.append(_boss(np.array(c, float), R * 1.03, 0.011, 0.004, HEAD))
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                c = np.array([sx, sy, sz]) / math.sqrt(3.0)
                head += [_boss(c, R * 0.93, 0.013, 0.006, HEAD), stud(R * 0.98 * c, c, 0.0072, 0.022, HEAD)]
    head.append(stud(np.array([0.0, 0.0, R * 1.0]), [0.0, 0.0, 1.0], 0.0095, 0.03, HEAD))
    handle = _as_flail(fpwarhammers._dressed(_haft(S, 0.0), strap=0.07, rings=(0.085, 0.104, 0.123),
                                             wound=(0.14, 0.4), turns=2.5))
    r1 = S['haft_r'] * S['haft_end']
    sec = section('chamfer', 1.0, 1.0, 0.3)
    z0 = S['haft_len']
    body = loft([up(z0 - 0.002, sec, r1 * 1.18), up(z0 + 0.008, sec, r1 * 1.18), up(z0 + 0.01, sec, r1 * 1.08),
                 up(z0 + 0.6 * S['fer_len'], sec, r1 * 1.12)], SLEEVE)
    return handle + [body] + _cap(S, z0 + 0.6 * S['fer_len'], r1 * 1.25, 'chamfer', n=8), head, IRON


def _boss(c, R, r, h, mat, n=8):
    """A round boss on the head about direction `c`, its foot `r` round on the surface `R` out, rising `h`."""
    u, w = _frame(np.asarray(c, float))
    ring = lambda k, d: np.array([c * (R + d) + r * k * (math.cos(a) * u + math.sin(a) * w)  # noqa: E731
                                  for a in np.linspace(0.0, 2 * np.pi, n, endpoint=False)])
    return loft([ring(1.0, -0.004), ring(1.0, 0.0), ring(0.62, h)], mat)


def _silver(S):
    """Silver, ornate: a round ball ringed about its middle, a bead on the ring all round, a ring above and below;
    two crowns of slender spikes between the rings and a tall one on its far end. An engraved sleeve, ringed, down
    from the ferrule, and the handle wrapped in navy below it, a silver wire wound over the wrap."""
    R = S['ball_r']
    head = [(*_orb(R * 0.95), HEAD), _hoop(R * 0.86, R * 1.05, 0.0065, HEAD, round_=True),
            _neck(R, 0.01, HEAD, 'round')]
    for z in (-0.72, 0.72):
        rr = R * 0.95 * math.sqrt(1.0 - z * z)
        head.append(_hoop(rr * 0.9, rr * 1.07, 0.004, HEAD, z=z * R * 0.95, round_=True))
    for k in range(12):
        a = 2 * math.pi * (k + 0.5) / 12
        bv, bt = _orb(0.0055, nu=8, nv=6)
        head.append((bv + R * 1.05 * np.array([math.cos(a), math.sin(a), 0.0]), bt, HEAD))
    for lat, off in ((0.38, 0.0), (-0.38, 0.5)):
        for k in range(7):
            a = 2 * math.pi * (k + off) / 7
            c = np.array([math.cos(a) * math.cos(lat), math.sin(a) * math.cos(lat), math.sin(lat)])
            head.append(_point(c, R * 0.93, 0.028, 0.0058, HEAD))
    head.append(_point((0.0, 0.0, 1.0), R * 0.93, 0.045, 0.0085, HEAD))
    collar = 0.5 * S['fer_len']
    handle = _as_flail(fpwarhammers._wrapped(_haft(S, collar), sleeve=0.075, turns=4.0))
    return handle + _cap(S, S['haft_len'] + collar, S['haft_r'] * S['haft_end'] * 1.45), head, IRON


def _fin(a, path, wide, thick, mat, n=4):
    """A fin standing out of the head in the plane at `a` round its axis: `path` its middle line, each point (out from
    the axis, along it), `wide` its half-width in that plane and `thick` across it at each point."""
    u = np.array([math.cos(a), math.sin(a), 0.0])
    pts = [u * r + np.array([0.0, 0.0, z]) for r, z in path]
    return sweep(pts, thick, wide, mat, n=n, across=np.cross(u, [0.0, 0.0, 1.0]))


def _elven(S):
    """Elven, a bird of prey's: a gold ball, six feathered fins swept up round it from the chain to points past its far
    end, a ridge down each, and a needle on its far end. A long sleeve flares into the ferrule, a leaf raised on each
    side; below it the handle is wrapped and bound in a lattice of gold."""
    R = S['ball_r']
    head = [(*_orb(R * 0.84), HEAD), _neck(R, 0.009, HEAD, 'round', 0.4),
            _hoop(R * 0.2, R * 0.42, 0.004, ACCENT, z=-R * 0.8, round_=True)]
    path = [(0.5, -0.66), (0.86, -0.3), (1.0, 0.1), (0.94, 0.5), (0.72, 0.86), (0.4, 1.14)]
    wide = [0.06, 0.15, 0.2, 0.18, 0.12, 0.0]
    for k in range(6):
        a = 2 * math.pi * (k + 0.25) / 6
        head.append(_fin(a, [(r * R, z * R) for r, z in path], [w * R for w in wide], [0.0035] * 5 + [0.0], HEAD))
    head.append(_point((0.0, 0.0, 1.0), R * 0.8, 0.04, 0.007, HEAD, sides=6))
    collar = 0.55 * S['fer_len']
    handle = _as_flail(fpwarhammers._leafed(_haft(S, collar), sleeve=0.085, turns=4.0))
    return handle + _cap(S, S['haft_len'] + collar, S['haft_r'] * S['haft_end'] * 1.75,
                         steps=((0.3, 0.9), (0.7, 0.6), (1.0, 0.4))), head, IRON


def _dwarven(S):
    """Dwarven work, engineered: a banded drum along the chain, rimmed at both ends, ribbed between, a toothed band
    about its middle, and a stepped knob on its far end. The handle is sheathed in the metal, collared and studded down
    each side, under a stepped ferrule."""
    R = S['ball_r']
    sec = section('round', 1.0, 1.0, n=12)
    prof = ((-1.0, 0.4), (-0.88, 0.4), (-0.86, 0.78), (-0.8, 0.95), (-0.64, 0.95), (-0.6, 0.84), (0.6, 0.84),
            (0.64, 0.95), (0.8, 0.95), (0.86, 0.6), (0.98, 0.6), (1.0, 0.38), (1.14, 0.38))
    head = [loft([up(z * R, sec, r * R) for z, r in prof], HEAD)]
    for k in range(12):
        a = 2 * math.pi * k / 12
        c = np.array([math.cos(a), math.sin(a), 0.0]) * R * 0.86
        head.append(strut(c + [0.0, 0.0, -0.58 * R], c + [0.0, 0.0, 0.58 * R], 0.0026, HEAD))
    head.append(_hoop(R * 0.8, R * 0.97, 0.011, HEAD, n=12))
    for k in range(8):
        a = 2 * math.pi * (k + 0.5) / 8
        c = np.array([math.cos(a), math.sin(a), 0.0])
        head.append(stud(c * R * 0.95, c, 0.0072, 0.017, HEAD))
    collar = 0.55 * S['fer_len']
    handle = _as_flail(fpwarhammers._sheathed(_haft(S, collar), collars=(0.03, 0.22), studs=0.04))
    rf = S['haft_r'] * S['haft_end'] * 1.08 * 1.5
    return handle + _cap(S, S['haft_len'] + collar, rf, 'round', n=12,
                         steps=((0.35, 1.0), (0.36, 0.78), (0.75, 0.78), (0.76, 0.55), (1.0, 0.55))), head, IRON


def _mithril(S):
    """Light and keen: a small round ball banded blue about its middle, six long square picks standing out of it above
    and below the band, and a tall spike on its far end over a blue orb. A plain handle under a ferrule banded blue."""
    R = S['ball_r']
    head = [(*_orb(R * 0.8), HEAD), _hoop(R * 0.74, R * 0.86, 0.008, ACCENT), _neck(R, 0.009, HEAD, 'round', 0.45)]
    for k in range(6):
        a, lat = 2 * math.pi * k / 6, (0.42 if k % 2 else -0.42)
        c = np.array([math.cos(a) * math.cos(lat), math.sin(a) * math.cos(lat), math.sin(lat)])
        head.append(stud(R * 0.76 * c, c, 0.0058, 0.042, HEAD))
    ov, ot = _orb(0.0085, nu=10, nv=8)
    head += [(ov + [0.0, 0.0, R * 0.82], ot, ACCENT),
             stud(np.array([0.0, 0.0, R * 0.86]), [0.0, 0.0, 1.0], 0.007, 0.05, HEAD)]
    collar = 0.65 * S['fer_len']
    h = _haft(S, collar)
    h['collar_r'] = 1.15
    handle = _as_flail(fpwarhammers._collar(h, 'banded'))
    return handle + _cap(S, S['haft_len'] + collar, S['haft_r'] * S['haft_end'] * 1.15), head, IRON


def _adamantium(S):
    """The mountain's heart: a shard of dark crystal along the chain, drawn to a point past its far end, held about its
    middle by a crowned band, gold points along both its edges and dark stones between. The chain and the handle are
    pale steel, the handle banded in gold, dark stones set round it between its bands."""
    R = S['ball_r']
    rng = np.random.default_rng(7)
    k = 7
    th0 = np.linspace(0.0, 2 * np.pi, k, endpoint=False) + rng.uniform(-0.2, 0.2, k)
    rings = []
    for z, s in ((-0.9, 0.42), (-0.55, 0.88), (-0.1, 1.0), (0.35, 0.92), (0.75, 0.6), (1.05, 0.28)):
        th, r = th0 + rng.uniform(-0.12, 0.12, k), s * R * rng.uniform(0.86, 1.1, k)
        rings.append(np.stack([np.cos(th) * r, np.sin(th) * r, np.full(k, z * R) + rng.uniform(-0.003, 0.003, k)], 1))
    head = [loft(rings + [np.array([[0.0, 0.0, 1.38 * R]])], HEAD), _neck(R, 0.011, SLEEVE)]
    head.append(_hoop(R * 0.9, R * 1.1, 0.012, SLEEVE, z=-0.1 * R, n=14))
    for j in range(8):
        a = 2 * np.pi * (j + 0.5) / 8
        u = np.array([math.cos(a), math.sin(a), 0.0])
        for side in (-1.0, 1.0):
            head.append(stud(u * R * 1.0 + [0.0, 0.0, -0.1 * R + side * 0.012], [0.0, 0.0, side], 0.0062, 0.019,
                             ACCENT))
        b = 2 * np.pi * j / 8
        head.append(stud(np.array([math.cos(b), math.sin(b), 0.0]) * R * 1.09 + [0.0, 0.0, -0.1 * R],
                         [math.cos(b), math.sin(b), 0.0], 0.005, 0.004, HEAD))
    collar = 0.55 * S['fer_len']
    top = S['haft_len']
    h = _haft(S, collar)
    handle = fpwarhammers._sheathed(h, collars=(0.03, 0.2, top - 0.05), studs=None, bands=fpwarhammers.ACCENT)
    r1 = S['haft_r'] * S['haft_end']
    for z in (top - 0.1, top - 0.125):   # dark stones set round it, between its gold bands
        g = (S['haft_r'] + (r1 - S['haft_r']) * z / top) * 1.08
        handle += [stud(np.array([np.cos(t) * g, np.sin(t) * g, z]), [np.cos(t), np.sin(t), 0.0], 0.0055, 0.0035,
                        0) for t in np.arange(4) * np.pi / 2 + np.pi / 4 + (z == top - 0.1) * np.pi / 4]
    rf = r1 * 1.08 * 1.5
    return _as_flail(handle) + _cap(S, S['haft_len'] + collar, rf, n=14), head, SLEEVE


def _ebony(S):
    """Ebony, black glass worked sharp: a faceted core, uneven, broken out in long shards of glass, flat and edged,
    each its own length and its own way, and a tall shard on its far end. An engraved sleeve, ringed, a spiral of wire
    wound up it, down from the ferrule; below it the handle is sheathed black, a wrap's ridge wound down it."""
    R = S['ball_r']
    rng = np.random.default_rng(13)
    k = 7
    th0 = np.linspace(0.0, 2 * np.pi, k, endpoint=False) + rng.uniform(-0.25, 0.25, k)
    rings = []
    for z, s in ((-0.9, 0.42), (-0.55, 0.84), (-0.12, 1.0), (0.3, 0.96), (0.68, 0.72), (0.92, 0.36)):
        th, r = th0 + rng.uniform(-0.15, 0.15, k), s * R * 0.92 * rng.uniform(0.88, 1.08, k)
        rings.append(np.stack([np.cos(th) * r, np.sin(th) * r, np.full(k, z * R * 0.92)], 1))
    head = [loft(rings, HEAD), _neck(R, 0.01, HEAD, 'hex')]
    shards = [np.array([0.0, 0.0, 1.0])] + _dirs(11, 0.9, below=-0.55)[:-1]
    for i, c in enumerate(shards):
        u, w = _frame(c)
        turn = rng.uniform(0.0, np.pi)
        a, b = math.cos(turn) * u + math.sin(turn) * w, -math.sin(turn) * u + math.cos(turn) * w
        L = 0.042 if i == 0 else rng.uniform(0.022, 0.036)
        lean = rng.uniform(-0.25, 0.25) * a
        foot = R * 0.78 * c
        sec = lambda p, s: np.array([p + s * 0.0095 * a, p + s * 0.0034 * b, p - s * 0.0095 * a,  # noqa: E731
                                     p - s * 0.0034 * b])
        mid = foot + (c + lean * 0.5) * (0.2 * R + 0.5 * L)
        head.append(loft([sec(foot, 1.0), sec(foot + c * 0.2 * R, 1.0), sec(mid, 0.62),
                          (foot + (c + lean) / np.linalg.norm(c + lean) * (0.2 * R + L))[None]], HEAD))
    collar = 0.5 * S['fer_len']
    handle = _as_flail(fpwarhammers._engraved(_haft(S, collar), sleeve=0.08, turns=3.0))
    rf = S['haft_r'] * S['haft_end'] * 1.5
    return handle + _cap(S, S['haft_len'] + collar, rf, 'hex'), head, IRON


def _claw(c, R, length_, curl, w, mat, toward=(0.0, 0.0, 1.0), steps=7):
    """A claw from the head's surface `R` out along `c`, curling `curl` degrees toward `toward` over its length,
    `w` thick at its foot and drawn to a point: (vertices, triangles, material)."""
    c = np.asarray(c, float) / np.linalg.norm(c)
    t = np.asarray(toward, float) - (np.asarray(toward, float) @ c) * c
    t /= max(np.linalg.norm(t), 1e-9)
    pts, p = [R * 0.9 * c], R * 0.9 * c
    for i in range(steps):
        a = math.radians(curl) * (i + 0.5) / steps
        p = p + (c * math.cos(a) + t * math.sin(a)) * (length_ + 0.1 * R) / steps
        pts.append(p)
    q = np.linspace(1.0, 0.0, steps + 1) ** 0.8
    return sweep(pts, list(w * q[:-1]) + [0.0], list(w * 1.2 * q[:-1]) + [0.0], mat, n=4, across=np.cross(c, t))


def _orcish(S):
    """Orcish, crude and cruel: a lumpy ball girt by a heavy riveted band, two crowns of thick claws hooked toward its
    far end and a hook curling over it. A broad sleeve, ridged and riveted, down from the ferrule to a tuft of fur;
    below it the handle bound in braided leather."""
    R = S['ball_r']
    head = [(*_orb(R * 0.94, _lumps(3, 0.03)), HEAD), _hoop(R * 0.84, R * 1.03, 0.01, HEAD, n=10),
            _neck(R, 0.013, HEAD, 'square')]
    for k in range(10):
        a = 2 * math.pi * k / 10
        u = np.array([math.cos(a), math.sin(a), 0.0])
        head.append(stud(u * R * 1.02, u, 0.0045, 0.0045, HEAD))
    for lat, off in ((0.5, 0.0), (-0.42, 0.5)):
        for k in range(5):
            a = 2 * math.pi * (k + off) / 5
            c = np.array([math.cos(a) * math.cos(lat), math.sin(a) * math.cos(lat), math.sin(lat)])
            head.append(_claw(c, R, 0.034, 60.0, 0.0095, HEAD))
    head.append(_claw((0.0, 0.0, 1.0), R, 0.04, 90.0, 0.011, HEAD, toward=(1.0, 0.0, 0.0)))
    collar = 0.5 * S['fer_len']
    handle = _as_flail(fpwarhammers._bound(_haft(S, collar), sleeve=0.085, turns=5.0))
    rf = S['haft_r'] * S['haft_end'] * 1.85
    return handle + _cap(S, S['haft_len'] + collar, rf, 'chamfer', n=8,
                         steps=((0.3, 0.85), (0.7, 0.55), (1.0, 0.4))), head, IRON


def _daedric(S):
    """Daedric: a cage of six black claws bowing out from the neck round a glowing core and curling in to their points
    past it, a barb on each turned back toward the chain; a toothed spike rising from the core through them. The handle
    is sheathed black, banded and studded down each side."""
    R = S['ball_r']
    head = [(*_orb(R * 0.6), CORE), _neck(R, 0.013, HEAD, 'hex', 0.25)]
    path = [(0.42, -0.86), (0.86, -0.56), (1.1, -0.06), (1.04, 0.42), (0.74, 0.84), (0.34, 1.06)]
    for k in range(6):
        a = 2 * math.pi * (k + 0.5) / 6
        u = np.array([math.cos(a), math.sin(a), 0.0])
        head.append(_fin(a, [(r * R, z * R) for r, z in path], [0.009, 0.0105, 0.01, 0.008, 0.005, 0.0],
                         [0.0065, 0.007, 0.0068, 0.006, 0.004, 0.0], HEAD, n=6))
        head.append(stud(u * 1.12 * R + [0.0, 0.0, -0.18 * R], u * 0.7 - np.array([0.0, 0.0, 0.7]), 0.0048, 0.016,
                         HEAD))
    sec = section('square', 0.0075, 0.0075)
    head.append(loft([up(0.45 * R, sec), up(1.05 * R, sec, 0.7), up(1.25 * R, sec, 0.45),
                      np.array([[0.0, 0.0, 1.55 * R]])], HEAD))
    for z, s in ((1.0, 1.0), (1.2, -1.0)):   # its teeth
        head.append(stud(np.array([s * 0.004, 0.0, z * R]), [s * 1.0, 0.0, 0.6], 0.0035, 0.011, HEAD))
    collar = 0.55 * S['fer_len']
    handle = _as_flail(fpwarhammers._sheathed(_haft(S, collar), collars=(0.03, 0.18, 0.32), studs=0.045))
    rf = S['haft_r'] * S['haft_end'] * 1.08 * 1.5
    return handle + _cap(S, S['haft_len'] + collar, rf, 'hex', steps=((0.4, 0.9), (0.75, 0.62), (1.0, 0.45))), \
        head, IRON


MAKES = {'Iron': _iron, 'Steel': _steel, 'Silver': _silver, 'Elven': _elven, 'Dwarven': _dwarven, 'Mithril': _mithril,
         'Adamantium': _adamantium, 'Ebony': _ebony, 'Orcish': _orcish, 'Daedric': _daedric}


def _whole(pieces):
    """Pieces (vertices, triangles, material) joined: (vertices, triangles, material a triangle)."""
    vs, ts, ms, n0 = [], [], [], 0
    for v, t, m in pieces:
        vs.append(np.asarray(v, dtype=np.float64))
        ts.append(np.asarray(t, dtype=np.int64) + n0)
        ms.append(np.full(len(t), m, dtype=np.int64) if np.ndim(m) == 0 else np.asarray(m, dtype=np.int64))
        n0 += len(v)
    return np.concatenate(vs), np.concatenate(ts), np.concatenate(ms)


_PARTS = {}   # the flail's pieces at rest for a shape: (handle and ferrule's vertices, each link's, the ball's)


def _pieces(S):
    key = tuple(sorted((k, v if isinstance(v, str) else round(float(v), 7)) for k, v in S.items()
                       if k in FLAIL or k == 'make'))
    if key not in _PARTS:
        if len(_PARTS) > 64:
            _PARTS.clear()
        hv, ht = _handle(S)
        if S.get('make'):
            dressed, head, chain = MAKES[S['make']](S)
            fixed, ball = [(hv, ht, WOOD)] + dressed, _whole(head)
        else:
            fixed, ball, chain = [(hv, ht, WOOD)] + [(v, t, IRON) for v, t in _ferrule(S)], _ball(S), IRON
        _PARTS[key] = (fixed, (*_link(S), chain), ball)
    return _PARTS[key]


def flail(S, swing=0.0, curl=0.0, sway=0.0):
    """The flail's (vertices, triangles, material a triangle) with its chain at `swing`, `curl` and `sway`: a
    material's place in MATS, 0 the metal, 1 the handle's wood and past those a make's own. The vertices keep one order
    whatever the joints, so a pose moves them in place."""
    fixed, (lv, lt, lm), ball = _pieces(S)
    places = _place(S, swing, curl, sway)
    Rm, c = places[-1]
    return _whole(list(fixed) + [(lv @ R.T + o, lt, lm) for R, o in places[:-1]] + [(ball[0] @ Rm.T + c, *ball[1:])])


def posed(S, v, pose):
    """The flail's vertices with its chain where `pose`'s joints put it (`v`, its rest vertices, keep their order)."""
    out = flail(S, pose.get('swing', 0.0), pose.get('curl', 0.0), pose.get('sway', 0.0))[0]
    assert len(out) == len(v), 'a pose moves the flail\'s vertices, never adds any'
    return out


WOOD_SEEN = 300   # texels of wood in one piece that say the handle shows


def _axis(xs, ys):
    """A piece's middle and its long axis (unit), on the screen."""
    pts = np.stack([xs + 0.5, ys + 0.5], axis=1)
    mean = pts.mean(axis=0)
    _, _, vt = np.linalg.svd(pts - mean, full_matrices=False)
    return pts, mean, vt[0]


TILTS = (5.0, 20.0, 40.0)   # degrees a seed's handle leans from square to the eye toward it, from the ferrule to the hand


def _root_for(tip, tip_depth, toward, S):
    """Handle poses with the ferrule's top at screen point `tip`, `tip_depth` deep, the handle running back from it
    toward screen direction `toward` and leaning toward the eye by each of TILTS: the hand where the handle's length
    puts it. The ferrule is then the far end, as a pose has it (fpstage.pose_matrix)."""
    T = fpstage.unproject(tip[0], tip[1], tip_depth, S)
    r = T / np.linalg.norm(T)
    ahead = fpstage.unproject(tip[0] + toward[0], tip[1] + toward[1], tip_depth, S) - T
    ahead -= (ahead @ r) * r
    ahead /= max(np.linalg.norm(ahead), 1e-12)
    out = []
    for tilt in TILTS:
        a = math.radians(tilt)
        B = T + length(S) * (math.cos(a) * ahead - math.sin(a) * r)
        if B[1] < 0.1:   # no hand nearer the eye than that
            continue
        u, v, _ = fpstage.project(B[None, :], S)
        out.append({'base': [float(u[0]), float(v[0])], 'depth': float(B[1]), 'tip': [float(tip[0]), float(tip[1])],
                    'roll': 0.0})
    return out


def seeds(fr, S):
    """First places for the handle in a frame, read off the reference's classes: where its wood shows, along the wood,
    the ferrule past the wood's end nearer the metal; where it does not, the ferrule just past the canvas's edge that
    the chain runs into, the handle running on from there toward the hand. The chain's joints are left for the fit to
    search (fpfit.py `grid_seeds`)."""
    from scipy import ndimage as ndi
    x, y, cw, ch = fr.rect
    out = []
    lab, n = ndi.label(fr.ref == 1, structure=np.ones((3, 3)))
    sizes = ndi.sum(np.ones_like(lab), lab, range(1, n + 1)) if n else []
    if n and max(sizes) >= WOOD_SEEN:
        ys, xs = np.nonzero(lab == int(np.argmax(sizes)) + 1)
        pts, mean, axis = _axis(xs, ys)
        my, mx = np.nonzero(fr.ref == 5)
        metal = np.stack([mx + 0.5, my + 0.5], axis=1)
        t = (pts - mean) @ axis
        if np.ptp(t) < 1.8 * np.ptp((pts - mean) @ np.array([-axis[1], axis[0]])) and len(metal):
            # a stub of wood at the canvas's edge, wider than long: the handle runs from the ferrule's metal through it
            by = metal[np.linalg.norm(metal - mean, axis=1) < 40]
            if len(by):
                axis = mean - by.mean(axis=0)
                axis /= max(np.linalg.norm(axis), 1e-9)
                t = (pts - mean) @ axis
        across = (pts - mean) @ np.array([-axis[1], axis[0]])
        ends = [mean + axis * t.min(), mean + axis * t.max()]
        near = [((np.linalg.norm(metal - e, axis=1) < 12).sum() if len(metal) else 0) for e in ends]
        k = int(np.argmax(near))
        out_dir = axis if k == 1 else -axis   # from the hand toward the ferrule
        band = (t > t.max() - 0.25 * np.ptp(t)) if k == 1 else (t < t.min() + 0.25 * np.ptp(t))
        width = max(float(np.ptp(across[band])), 3.0)
        depth = S['focal'] * 2.0 * S['haft_r'] * S['haft_end'] / width
        tip = ends[k] + out_dir * width * S['fer_len'] / (2.0 * S['fer_r'])
        return _root_for(tip, depth, -out_dir, S)
    on = fr.ref > 0
    lab, n = ndi.label(on, structure=np.ones((3, 3)))
    if not n:
        return out
    big = lab == int(np.argmax(ndi.sum(np.ones_like(lab), lab, range(1, n + 1)))) + 1
    for edge, sel in (('B', (slice(y + ch - 1, y + ch), slice(x, x + cw))), ('R', (slice(y, y + ch), slice(x + cw - 1, x + cw))),
                      ('L', (slice(y, y + ch), slice(x, x + 1)))):
        ey, ex = np.nonzero(big[sel])
        if len(ex) < 3:
            continue
        E = np.array([ex.mean() + sel[1].start + 0.5, ey.mean() + sel[0].start + 0.5])
        ys, xs = np.nonzero(big)
        pts = np.stack([xs + 0.5, ys + 0.5], axis=1)
        close = pts[np.linalg.norm(pts - E, axis=1) < 30]
        _, mean, axis = _axis(close[:, 0] - 0.5, close[:, 1] - 0.5)
        if axis @ (E - mean) < 0:
            axis = -axis   # outward, past the edge
        width = max(float(len(ex)), 3.0)
        depth = S['focal'] * S['link_w'] * 1.4 / width
        for toward in (axis, (np.array([fpstage.W + 30.0, fpstage.H + 40.0]) - E)):
            toward = toward / max(np.linalg.norm(toward), 1e-9)
            for k in (0.7, 1.0, 1.4):
                out += _root_for(E + toward * 6.0, depth * k, toward, S)
        break
    return out


def sway_joints(S, pose, frames, angle):
    """The idle's swing: for each of `frames` frames, the chain's joints that put the ball's centre where the idle's is
    turned about the eye, from `angle` degrees to its left to `angle` to its right, held as near the idle's own hang as
    they can be. The turn is about the eye's own line of sight through the flail's eye, so the ball keeps its depth (its
    size, and where it passes behind the handle) as a pendulum swung across the view does. Each frame starts from its
    neighbour's, out from the middle, so the swing is one motion. Answers a dict of joints a frame."""
    from scipy.optimize import minimize
    M, _ = fpstage.pose_matrix(pose, S, length(S))
    cam = lambda p: M[:3, :3] @ p + M[:3, 3]   # noqa: E731
    eye = cam(np.array([0.0, 0.0, S['haft_len'] + S['fer_len'] + S['eye_len']]))
    names = ('swing', 'curl', 'sway')
    rest = np.array([float(pose.get(j[0], j[4])) for j in JOINTS])
    ball = lambda j: cam(_place(S, *j)[-1][1])   # noqa: E731
    hang = ball(rest) - eye
    unit = np.array([j[3] for j in JOINTS])
    out = [None] * frames
    mid = (frames - 1) / 2
    for side in (1, -1):
        x = rest.copy()
        for k in (range(int(np.ceil(mid)), frames) if side > 0 else range(int(np.floor(mid)), -1, -1)):
            a = math.radians(angle * (k - mid) / max(mid, 1e-9))
            # about the line of sight (camera +Y): a positive turn carries a hanging ball to the eye's right (+X)
            want = eye + np.array([hang[0] * math.cos(a) - hang[2] * math.sin(a), hang[1],
                                   hang[0] * math.sin(a) + hang[2] * math.cos(a)])
            cost = lambda j: float(1e4 * ((ball(j) - want) ** 2).sum() + 0.5 * (((j - rest) / unit) ** 2).sum())  # noqa: E731
            x = minimize(cost, x, method='Nelder-Mead', options={'xatol': 0.05, 'fatol': 1e-4, 'maxiter': 800}).x
            out[k] = dict(zip(names, (float(v) for v in x)))
    return out


# the chain's joints: (name, the fit's step, its bounds, the prior's unit, its rest), as fpmodel.joints reads them
JOINTS = (('swing', 10.0, (-20.0, 185.0), 40.0, 0.0),
          ('curl', 10.0, (-150.0, 150.0), 45.0, 0.0),
          ('sway', 8.0, (-90.0, 90.0), 35.0, 0.0))

# what the shape fit adjusts (fpfit.py --shape), its steps and its bounds; the handle's length is the depths' to set
# a socket's depth is its shadow's, a spike's length and a link's bar their own: the spikes and links stand where they
# will, not where Daggerfall's do, so the outline would only shorten the spikes and close the links
FIT_KEYS = ('focal', 'haft_r', 'haft_end', 'fer_len', 'fer_r', 'link_len', 'link_w', 'link_pitch', 'ball_r', 'spike_r',
            'sock_w', 'sock_h')
FIT_STEP = {'haft_end': 0.04, 'fer_len': 0.006, 'fer_r': 0.002, 'eye_len': 0.003, 'eye_r': 0.05, 'link_len': 0.005,
            'link_w': 0.003, 'link_pitch': 0.03, 'link_sq': 0.3, 'ball_r': 0.004, 'spike_len': 0.003, 'spike_r': 0.001,
            'sock_w': 0.03, 'sock_h': 0.02, 'sock_d': 0.05}
FIT_BOUNDS = {'haft_end': (0.6, 1.3), 'fer_len': (0.02, 0.15), 'fer_r': (0.012, 0.05), 'eye_len': (0.004, 0.04),
              'eye_r': (0.2, 0.8), 'link_len': (0.025, 0.12), 'link_w': (0.015, 0.07), 'link_pitch': (0.3, 0.7),
              'link_sq': (2.0, 6.0), 'ball_r': (0.02, 0.12), 'spike_len': (0.005, 0.06), 'spike_r': (0.003, 0.02),
              'sock_w': (0.08, 0.5), 'sock_h': (0.05, 0.35), 'sock_d': (0.0, 1.5)}


def wood(name, dark=(0.13, 0.045, 0.012), light=(0.66, 0.33, 0.08)):
    """The handle's wood, flat-sawn as Daggerfall's is: growth rings a few millimetres apart about a line beside the
    handle and leaning off it, so the handle's round cuts them in long streaks closing in arches, bent by noise; dark
    late wood between bright, flecked with pores."""
    import bpy
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.6
    b.inputs['Specular IOR Level'].default_value = 0.25
    b.inputs['Metallic'].default_value = 0.0
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type = 'GEOMETRY'
    at.attribute_name = 'rest'
    mp = nt.nodes.new('ShaderNodeMapping')   # the log's heart beside the handle, leaning off it
    mp.inputs['Location'].default_value = (0.045, 0.01, 0.0)
    mp.inputs['Rotation'].default_value = (math.radians(2.5), math.radians(8.0), 0.0)
    L.new(at.outputs['Vector'], mp.inputs['Vector'])
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'RINGS'
    wave.rings_direction = 'Z'
    wave.wave_profile = 'SAW'
    wave.inputs['Scale'].default_value = 40.0     # a ring each 8 mm or so
    wave.inputs['Distortion'].default_value = 4.0
    wave.inputs['Detail'].default_value = 2.0
    wave.inputs['Detail Scale'].default_value = 1.2
    wave.inputs['Detail Roughness'].default_value = 0.5
    L.new(mp.outputs['Vector'], wave.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.08, (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.4, (*light, 1)
    L.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    fleck = nt.nodes.new('ShaderNodeTexNoise')   # dark flecks of the grain's pores
    fleck.inputs['Scale'].default_value = 450.0
    fleck.inputs['Detail'].default_value = 1.0
    L.new(at.outputs['Vector'], fleck.inputs['Vector'])
    pores = nt.nodes.new('ShaderNodeMapRange')
    pores.inputs['From Min'].default_value, pores.inputs['From Max'].default_value = 0.62, 0.7
    pores.inputs['To Min'].default_value, pores.inputs['To Max'].default_value = 1.0, 0.5
    L.new(fleck.outputs['Fac'], pores.inputs['Value'])
    shade = nt.nodes.new('ShaderNodeMix')
    shade.data_type = 'RGBA'
    shade.blend_type = 'MULTIPLY'
    shade.inputs['Factor'].default_value = 1.0
    L.new(ramp.outputs['Color'], shade.inputs['A'])
    L.new(pores.outputs['Result'], shade.inputs['B'])
    L.new(shade.outputs['Result'], b.inputs['Base Color'])
    return m


def iron(name, S):
    """The flail's cast iron, coarser than the axe's worked iron: a granular grain of light and dark a pixel or two
    across, the same grain raised in its bump so it catches the lamp, and a sheen. Each piece is told by where it lies
    at rest (`S`'s): the ferrule is wound in fine bands round its body, as Daggerfall's is; the chain's drawn links are
    smooth; the ball's grain is finer, its sockets' hollows dark under a lit rim; and a spike casts no shadow on the
    ball, as none does in Daggerfall's frames. Grey all through: the grade lays it on the metal band."""
    import bpy
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links
    b = nt.nodes['Principled BSDF']
    b.inputs['Metallic'].default_value = 0.0
    b.inputs['Roughness'].default_value = 0.32
    b.inputs['Specular IOR Level'].default_value = 0.45
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type = 'GEOMETRY'
    at.attribute_name = 'rest'

    def node(kind, **inputs):
        n = nt.nodes.new(kind)
        for k, v in inputs.items():
            n.inputs[k].default_value = v
        return n

    def op(kind, a, c=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        for k, v in enumerate((a, c)):
            if v is None:
                continue
            if isinstance(v, float):
                n.inputs[k].default_value = v
            else:
                L.new(v, n.inputs[k])
        return n.outputs[0]

    def between(x, lo, hi):
        return op('MULTIPLY', op('GREATER_THAN', x, lo), op('LESS_THAN', x, hi))
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(at.outputs['Vector'], xyz.inputs[0])
    centre = node('ShaderNodeVectorMath')   # how far from the head's centre at rest (the chain hangs straight up)
    centre.operation = 'DISTANCE'
    L.new(at.outputs['Vector'], centre.inputs[0])
    centre.inputs[1].default_value = (0.0, 0.0, float(chain_curve(S)[0][-1][2]))
    R = S['ball_r']
    ferrule = between(xyz.outputs['Z'], S['haft_len'] - 0.002, S['haft_len'] + S['fer_len'] * 0.97)
    chain = between(xyz.outputs['Z'], S['haft_len'] + S['fer_len'] + S['eye_len'], chain_curve(S)[0][-1][2] - R * 0.9)
    ball = op('LESS_THAN', centre.outputs['Value'], R * 1.001)
    # how much grain: the cast ferrule all of it, the ball half, the chain a quarter
    rough = op('SUBTRACT', 1.0, op('ADD', op('MULTIPLY', chain, 0.75), op('MULTIPLY', ball, 0.5)))
    grain = node('ShaderNodeTexNoise', Scale=900.0, Detail=2.0, Roughness=0.55)
    L.new(at.outputs['Vector'], grain.inputs['Vector'])
    bands = node('ShaderNodeTexWave', Scale=2 * math.pi / 20.0 / 0.0016, Distortion=6.0, Detail=3.0)
    bands.wave_type = 'BANDS'
    bands.bands_direction = 'Z'
    L.new(at.outputs['Vector'], bands.inputs['Vector'])
    wound = op('MULTIPLY', ferrule, op('SUBTRACT', bands.outputs['Fac'], 0.5))
    tone = op('ADD', 0.5, op('MULTIPLY', rough, op('ADD', op('SUBTRACT', grain.outputs['Fac'], 0.5),
                                                      op('MULTIPLY', wound, 0.22))))
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.3, (0.47, 0.47, 0.47, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.7, (0.63, 0.63, 0.63, 1)
    L.new(tone, ramp.inputs['Fac'])
    bump = node('ShaderNodeBump', Strength=0.16, Distance=0.0006)
    L.new(tone, bump.inputs['Height'])
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    # a socket's hollow: the ball's surface sunk below its round falls dark toward the hollow's floor
    sunk = node('ShaderNodeMapRange')
    sunk.inputs['From Min'].default_value = R * 0.985
    sunk.inputs['From Max'].default_value = R * (1.0 - 0.5 * S['sock_d'] * S['sock_h'])
    sunk.inputs['To Min'].default_value, sunk.inputs['To Max'].default_value = 1.0, 0.25
    L.new(centre.outputs['Value'], sunk.inputs['Value'])
    hollow = nt.nodes.new('ShaderNodeMix')
    hollow.data_type = 'RGBA'
    hollow.blend_type = 'MULTIPLY'
    hollows = int(round(S.get('sockets', 0.0)))   # a belt lifts the round, and no socket sinks a plain ball
    L.new(ball, hollow.inputs['Factor'])
    hollow.inputs['Factor'].default_value = 1.0
    if not hollows:
        nt.links.remove(hollow.inputs['Factor'].links[0])
        hollow.inputs['Factor'].default_value = 0.0
    L.new(ramp.outputs['Color'], hollow.inputs['A'])
    tint = nt.nodes.new('ShaderNodeCombineColor')
    for k in range(3):
        L.new(sunk.outputs['Result'], tint.inputs[k])
    L.new(tint.outputs['Color'], hollow.inputs['B'])
    L.new(hollow.outputs['Result'], b.inputs['Base Color'])
    # past the ball's round at rest is a spike: clear to a shadow's ray
    spike = op('GREATER_THAN', centre.outputs['Value'], R * 1.01)
    path = nt.nodes.new('ShaderNodeLightPath')
    clear = nt.nodes.new('ShaderNodeMixShader')
    L.new(op('MULTIPLY', spike, path.outputs['Is Shadow Ray']), clear.inputs['Fac'])
    L.new(b.outputs['BSDF'], clear.inputs[1])
    L.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs[0], clear.inputs[2])
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    L.new(clear.outputs[0], out.inputs['Surface'])
    return m
