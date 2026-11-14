"""The staff of every metal, made from numbers: one staff for the first-person forge (fpstaffs.py) and the sprite
forge's bodies (gear.py) alike.

A staff is Daggerfall's pole, tapering a little from the hands to its head, in its metal's own make: the language its
warhammer and its long blade speak (fpwarhammers.py, blades.py). Its pole is dressed as that metal's warhammer haft is,
by the warhammer's own work, and its head is the metal's motif, small enough that the fitted poses hold it. Each head
stands round its pole, three or more of each piece, so it reads alike at whatever roll a frame turns it to.

Its pieces are (vertices, triangles, stuff): 'wood'; 'metal', the pole's sleeves, bands and sheath; 'head'; 'accent',
fittings in the metal's own colours; 'grip', a wrap, cord, leather or fur; 'vein', a light of its own. Forged and cut
work is flat-faced; wood, orbs and wraps are smooth."""
import numpy as np

import bows
import fpwarhammers as wh
from fpwarhammer import HEAD, COLLAR, HAFT
from fpwarhammers import loft, up, section, stud, strut, sweep, spike

METALS = bows.METALS
SIDES = 28     # a round pole's sides: round at the root's breadth on the first-person screen
U = 0.015      # a head's measure, metres: the first-person pole's girth under its head
REACH = 0.95   # metres of pole below the head its dressing covers: past the first-person pole's root
# the warhammer's work in the staff's stuffs
STUFF = {HEAD: 'head', COLLAR: 'metal', HAFT: 'wood', wh.ACCENT: 'accent', wh.GLOW: 'vein', wh.GRIP: 'grip'}
# where a staff is built in the four stuffs Daggerfall's staff knows (fpmodel.metal_staff, gear.py)
PLAIN = {'head': 'metal', 'accent': 'metal', 'grip': 'cord'}


def _ring_tube(zs, rs, n, cap=False, facet=False, turn=0.0):
    """A tube up the axis: rings at heights `zs`, radii `rs`, `n` sides (turned `turn` radians), a flat top if `cap`."""
    zs, rs = np.asarray(zs, float), np.asarray(rs, float)
    th = turn + np.linspace(0.0, 2 * np.pi, n, endpoint=False)
    v = np.concatenate([np.stack([r * np.cos(th), r * np.sin(th), np.full(n, z)], axis=1) for z, r in zip(zs, rs)])
    q = []
    for i in range(len(zs) - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            q += [(a, b, b + n), (a, b + n, a + n)]
    if cap:
        mid = len(v)
        v = np.vstack([v, [0.0, 0.0, zs[-1]]])
        top = (len(zs) - 1) * n
        q += [(top + j, top + (j + 1) % n, mid) for j in range(n)]
    q = bows.outward(v, q, np.array([0.0, 0.0, (zs[0] + zs[-1]) / 2]))
    return bows.facets(v, q) if facet else (v, q)


def _round(k, n, turn=0.0):
    """The `k`th of `n` ways round the pole: out from it, and along its round."""
    t = turn + 2 * np.pi * k / n
    return np.array([np.cos(t), np.sin(t), 0.0]), np.array([-np.sin(t), np.cos(t), 0.0])


def _arc(foot, out, rise, turn, length, n=9):
    """A curve from `foot`, in the plane of `out` and the pole: leaving `rise` radians out from straight up and bending
    `turn` radians back in along its `length`."""
    a = rise - turn * np.linspace(0.0, 1.0, n)
    step = length / (n - 1)
    d = np.stack([np.sin(a), np.cos(a)], axis=1) * step
    pts = np.vstack([[0.0, 0.0], np.cumsum(d[:-1], axis=0)])
    return [foot + out * x + np.array([0.0, 0.0, z]) for x, z in pts]


# ---- the heads: each (top, rt), `top` the pole's end and `rt` its girth there

def _iron(top, rt):
    """Iron's head: a heavy forged block on its socket, a ridge round its foot, and a blunt four-sided point."""
    h, blk = 1.85 * U, section('chamfer', 1.0, 1.0, 0.22)
    out = [loft([up(top + dz, blk, h * s) for dz, s in ((0.0, 0.8), (0.006, 1.0), (0.044, 1.06), (0.05, 0.92))],
                'head'),
           loft([up(top + 0.006, blk, h * 1.14), up(top + 0.015, blk, h * 1.14)], 'head')]
    sq = section('square', 1.0, 1.0)
    out.append(loft([up(top + 0.05, sq, h * 0.72), np.array([[0.0, 0.0, top + 0.085]])], 'head'))
    return out


def _steel(top, rt):
    """Steel's head: a squared block banded at both ends, each side a framed panel round a boss, and a four-sided
    spike from its chamfered top."""
    h, sq, ch = 1.7 * U, section('square', 1.0, 1.0), section('chamfer', 1.0, 1.0, 0.3)
    out = [loft([up(top, sq, h), up(top + 0.044, sq, h)], 'head')]
    out += [loft([up(z, sq, h * 1.1), up(z + 0.006, sq, h * 1.1)], 'head') for z in (top, top + 0.038)]
    tip = np.array([[0.0, 0.0, top + 0.105]])
    out.append(loft([up(top + 0.044, ch, h * 1.02), up(top + 0.05, ch, h * 0.62), tip], 'head'))
    for k in range(4):
        o, t = _round(k, 4)
        c = o * (h + 0.0012)
        corners = [c + t * a * 0.62 * h + np.array([0.0, 0.0, top + z]) for a, z in
                   ((-1, 0.012), (1, 0.012), (1, 0.032), (-1, 0.032))]
        out += [strut(corners[j], corners[(j + 1) % 4], 0.0018, 'head') for j in range(4)]
        out.append(stud(c + np.array([0.0, 0.0, top + 0.022]), o, 0.0045, 0.004, 'head'))
    return out


def _silver(top, rt):
    """Silver's head: a ringed collar flaring under a round orb, beads round the collar's lip, four scrolls bracing the
    orb, a ring round its middle and a spike on top."""
    R = 2.2 * U
    zc = top + 0.012 + R * 0.92
    collar = _ring_tube([top - 0.002, top + 0.005, top + 0.011, top + 0.016], [rt * 1.45, rt * 1.62, rt * 1.35, rt],
                        SIDES)
    ring = _ring_tube([zc - 0.004, zc - 0.002, zc + 0.002, zc + 0.004], [R * 0.98, R * 1.1, R * 1.1, R * 0.98], SIDES)
    out = [(*collar, 'head'), (*bows.ball(np.array([0.0, 0.0, zc]), R, n=18), 'head'), (*ring, 'head'),
           spike(zc + R * 0.9, 0.045, 0.0075, 'head')]
    for k in range(10):
        o, _ = _round(k, 10)
        out.append((*bows.ball(o * rt * 1.62 + np.array([0.0, 0.0, top + 0.005]), 0.003, n=6), 'head'))
    for k in range(4):   # each scroll from the collar's lip out and up, curling back in under the orb
        o, t = _round(k, 4, np.pi / 4)
        a = np.linspace(0.0, 1.6 * np.pi, 10)
        out_, rise = rt * 1.4 + 0.012 * np.sin(a) * (1 - 0.25 * a / np.pi), top + 0.012 + 0.009 * (1 - np.cos(a))
        pts = [o * x + np.array([0.0, 0.0, z]) for x, z in zip(out_, rise)]
        out.append(sweep(pts, [0.0026] * 10, [0.0026] * 10, 'head', n=6, across=t))
    return out


def _elven(top, rt):
    """Elven's head: a cup, and three wings of the metal rising round an orb and cupping it, each a fan of feathers
    swept up and in, the longest arching over the orb."""
    R = 1.6 * U
    out = [(*_ring_tube([top - 0.002, top + 0.006, top + 0.012], [rt * 1.75, rt * 1.55, rt * 1.1], SIDES), 'head'),
           (*bows.ball(np.array([0.0, 0.0, top + 0.036]), R, n=16), 'head')]
    s = np.linspace(0.0, 1.0, 9)
    taper = np.minimum(1.0, 0.45 + 2.0 * s) * (1.0 - s) ** 0.8   # broad from the root, merging the fan into a wing
    for k in range(3):
        o, t = _round(k, 3)
        foot = o * rt * 1.35 + np.array([0.0, 0.0, top + 0.004])
        for length, rise, turn, w in ((0.1, 0.45, 1.4, 0.013), (0.086, 0.95, 1.05, 0.011), (0.07, 1.4, 0.7, 0.009)):
            out.append(sweep(_arc(foot, o, rise, turn, length), w * taper, 0.35 * w * taper, 'head', n=4, across=t))
    return out


def _dwarven(top, rt):
    """Dwarven's head: a stepped block of three tiers, a toothed wheel round its foot, bolts on each tier's sides and a
    domed boss on top."""
    sq = section('chamfer', 1.0, 1.0, 0.15)
    out = []
    for z0, z1, h in ((0.0, 0.022, 1.6 * U), (0.022, 0.038, 1.22 * U), (0.038, 0.052, 0.86 * U)):
        out.append(loft([up(top + z0, sq, h), up(top + z1 - 0.003, sq, h), up(top + z1, sq, h * 0.9)], 'head'))
        for k in range(4):
            o, t = _round(k, 4)
            for a in ((-0.5, 0.5) if h > U else (0.0,)):
                out.append(stud(o * h + t * a * h + np.array([0.0, 0.0, top + (z0 + z1) / 2]), o, 0.0032, 0.0028,
                                'head'))
    disc = section('round', 1.0, 1.0, n=24)
    out.append(loft([up(top + 0.004, disc, 2.3 * U), up(top + 0.012, disc, 2.3 * U)], 'head'))
    for k in range(12):   # the wheel's teeth
        o, t = _round(k, 12)
        foot = [o * 2.2 * U + t * a * 0.0045 for a in (-1, 1)] + [o * 2.95 * U + t * a * 0.003 for a in (1, -1)]
        out.append(loft([np.array(foot) + [0.0, 0.0, top + z] for z in (0.004, 0.012)], 'head'))
    out.append((*bows.facets(*bows.ball(np.array([0.0, 0.0, top + 0.052]), 0.62 * U, n=10)), 'head'))
    return out


def _mithril(top, rt):
    """Mithril's head: two fine crescents crossed on a slender neck, their horns rising round a blue orb held in their
    cup, and a tall spike above it."""
    rho, zc = 2.8 * U, top + 0.016 + 2.8 * U
    out = [(*_ring_tube([top - 0.002, top + 0.008, top + 0.018], [rt * 1.3, rt * 0.95, rt * 0.7], SIDES), 'head'),
           (*bows.ball(np.array([0.0, 0.0, zc]), 1.55 * U, n=16), 'accent'),
           spike(zc + 1.45 * U, 0.05, 0.0055, 'head')]
    phi = np.linspace(-np.radians(150), np.radians(150), 17)
    w = 0.009 * np.cos(phi / 2.2) ** 3
    for k in range(2):
        o, t = _round(k, 4)
        pts = [o * np.sin(p) * rho + np.array([0.0, 0.0, zc - np.cos(p) * rho]) for p in phi]
        out.append(sweep(pts, [0.0034] * len(pts), list(w), 'head', n=4, across=t))
    return out


def _adamantium(top, rt):
    """Adamantium's head: a tall shard of dark crystal standing from the pole, held in a crowned band: gold points
    along both its edges, dark stones between, and four strands curling up from the pole onto its foot."""
    rng = np.random.default_rng(7)
    th0 = np.linspace(0.0, 2 * np.pi, 7, endpoint=False) + rng.uniform(-0.2, 0.2, 7)
    rings = []
    for dz, s in ((0.0, 0.5), (0.014, 0.86), (0.034, 1.0), (0.058, 0.92), (0.08, 0.62), (0.098, 0.3)):
        th, r = th0 + rng.uniform(-0.12, 0.12, 7), s * 2.05 * U * rng.uniform(0.84, 1.12, 7)
        rings.append(np.stack([np.cos(th) * r, np.sin(th) * r, np.full(7, top + dz + rng.uniform(-0.002, 0.002))],
                              axis=1))
    out = [loft(rings + [np.array([[0.002, -0.001, top + 0.122]])], 'head')]
    band = section('round', 1.0, 1.0, n=14)
    R, z0, z1 = 2.25 * U, top + 0.016, top + 0.032
    out.append(loft([up(z0, band, R * 0.96), up(z0 + 0.002, band, R * 1.04), up(z1 - 0.002, band, R * 1.04),
                     up(z1, band, R * 0.96)], 'metal'))
    for k in range(8):   # its crown: a gold point up and down at each edge, a dark stone between
        o, _ = _round(k, 8, np.pi / 8)
        out += [stud(o * R * 0.98 + np.array([0.0, 0.0, z]), [0.0, 0.0, way], 0.0042, 0.013, 'accent')
                for z, way in ((z1, 1.0), (z0, -1.0))]
        o, _ = _round(k, 8)
        out.append(stud(o * R * 1.04 + np.array([0.0, 0.0, (z0 + z1) / 2]), o, 0.0035, 0.0025, 'head'))
    for k in range(4):   # the strands: out from the pole's head and up onto the band's foot
        o, _ = _round(k, 4)
        out += wh._tendril(o * rt + np.array([0.0, 0.0, top - 0.03]), o * R * 0.7 + np.array([0.0, 0.0, z0 - 0.001]),
                           o * rt * 2.4 + np.array([0.0, 0.0, top - 0.024]), 0.0022, 'metal')
    return out


def _ebony(top, rt):
    """Ebony's head: a crown of black shards round a tall one on a faceted collar, each shard a lozenge blade whose
    edges are bright."""
    rng = np.random.default_rng(5)
    hexa = section('hex', 1.0, 1.0)
    out = [loft([up(top + dz, hexa, rt * s) for dz, s in ((-0.002, 1.45), (0.004, 1.75), (0.012, 1.55), (0.016, 1.2))],
                'head')]
    shards = [(np.array([0.0, 0.0, 1.0]), np.array([1.0, 0.0, 0.0]), np.zeros(3), 0.108, 0.011)]
    for k in range(5):
        o, t = _round(k + rng.uniform(-0.15, 0.15), 5)
        lean = rng.uniform(0.42, 0.62)
        shards.append(((np.array([0.0, 0.0, 1.0]) + o * lean) / np.hypot(1.0, lean), t, o * rt * 1.2,
                       rng.uniform(0.05, 0.07), rng.uniform(0.0065, 0.0085)))
    for axis, across, foot, length, w in shards:
        side = np.cross(axis, across)
        base = foot + np.array([0.0, 0.0, top + 0.008])
        ring = lambda c, s: np.array([c + across * w * s, c + side * w * 0.55 * s, c - across * w * s,  # noqa: E731
                                      c - side * w * 0.55 * s])
        mid = base + axis * length * 0.32
        tip = base + axis * length
        out.append(loft([ring(base, 0.7), ring(mid, 1.0), tip[None]], 'head'))
        for s in (1.0, -1.0):   # its two edges, bright
            out += [strut(base + across * w * 0.7 * s, mid + across * w * s, 0.0011, 'accent'),
                    strut(mid + across * w * s, tip, 0.0011, 'accent')]
    return out


def _orcish(top, rt):
    """Orcish's head: a flared cap of the metal over a ruff of fur, three horns rising from its rim and curling out
    and back in, and three hooked claws over its top between them."""
    cap = section('hex', 1.0, 1.0)
    out = [loft([up(top + dz, cap, rt * s) for dz, s in ((-0.004, 1.3), (0.01, 1.6), (0.022, 2.05), (0.03, 1.85))],
                'head')]
    rng = np.random.default_rng(3)
    for k in range(16):   # the fur: tufts round under the cap, out and down
        o, _ = _round(k + rng.uniform(-0.2, 0.2), 16)
        out.append(stud(o * rt * 1.3 + np.array([0.0, 0.0, top - 0.002]), o * 0.75 + np.array([0.0, 0.0, -0.66]),
                        0.0042, 0.018 + rng.uniform(0.0, 0.008), 'grip'))
    for k in range(3):
        o, t = _round(k, 3)
        pts = _arc(o * rt * 1.75 + np.array([0.0, 0.0, top + 0.02]), o, 1.2, 2.2, 0.09)
        w = np.linspace(1.0, 0.0, len(pts)) ** 0.8
        out.append(sweep(pts, list(0.0085 * w), list(0.0105 * w), 'head', n=8, across=t))
        o, t = _round(k + 0.5, 3)
        pts = _arc(o * rt * 0.9 + np.array([0.0, 0.0, top + 0.028]), o, 0.15, -1.9, 0.05, n=7)
        w = np.linspace(1.0, 0.0, len(pts)) ** 0.7
        out.append(sweep(pts, list(0.0042 * w), list(0.006 * w), 'head', n=6, across=t))
    return out


def _daedric(top, rt):
    """Daedric's head: a cage of four black claws bowing out from a jagged collar round a glowing core and curling in
    to their points over it, and a toothed spike rising through them."""
    jag = np.array([[np.cos(t) * s, np.sin(t) * s] for t, s in
                    zip(np.linspace(0.0, 2 * np.pi, 10, endpoint=False), [1.0, 1.35] * 5)])
    zc, R = top + 0.042, 1.75 * U
    out = [loft([up(top - 0.004, jag, rt * 1.2), up(top + 0.008, jag, rt * 1.5), up(top + 0.014, jag, rt * 1.1)],
                'head'),
           (*bows.ball(np.array([0.0, 0.0, zc]), R, n=16), 'vein')]
    for k in range(4):
        o, t = _round(k, 4, np.pi / 4)
        pts = [o * r + np.array([0.0, 0.0, top + z]) for r, z in
               ((rt * 1.1, 0.008), (2.4 * U, 0.02), (2.95 * U, 0.042), (2.7 * U, 0.064), (1.8 * U, 0.082),
                (0.7 * U, 0.093))]
        out.append(sweep(pts, [0.0042, 0.0048, 0.0046, 0.004, 0.0028, 0.0],
                         [0.0065, 0.0075, 0.007, 0.0058, 0.0036, 0.0], 'head', n=6, across=t))
    sq = section('square', 1.0, 1.0)
    out.append(loft([up(zc + R * 0.6, sq, 0.0065), up(top + 0.09, sq, 0.0042), np.array([[0.0, 0.0, top + 0.13]])],
                    'head'))
    for k, z in enumerate((0.075, 0.093, 0.108)):   # teeth up the spike
        o, _ = _round(k, 3, 0.4)
        out.append(stud(o * 0.004 + np.array([0.0, 0.0, top + z]), o + np.array([0.0, 0.0, 0.9]), 0.0026, 0.011,
                        'head'))
    return out


# Daggerfall's mage's staff head (TEXTURE.486's walk), in the pole's girth under it: an iron collar, a neck flaring
# over the pole's top, an onion's dome about 11 girths across and a short spike. Each (height over the pole's top,
# radius)
KNOB = ((-7.6, 1.97), (-5.7, 1.97), (-5.6, 1.6), (-0.4, 2.27), (0.0, 3.0), (1.9, 5.3), (3.4, 5.7), (5.3, 4.5),
        (6.8, 2.27), (7.6, 0.68), (11.7, 0.06))


def knob(top, rt):
    """The head of Daggerfall's mage's staff (`KNOB`), all of the metal, so it is graded as a metal staff's is."""
    z, r = np.array(KNOB).T
    return [(*_ring_tube(top + z * rt, r * rt, SIDES, cap=True), 'metal')]


def shoe(r0, length):
    """A ferrule on the pole's foot: a short capped ring of the metal, a little proud of the wood."""
    return [(*_ring_tube([-0.002, length], [r0 * 1.18, r0 * 1.18], 10, cap=True), 'metal')]


# ---- the pole's work: each the warhammer's haft's, laid on the staff's pole from its head down

def _haft(S):
    """The staff's pole in the warhammer's terms: its root, girth and taper, its head at its top, its dressing
    reaching REACH below the head and a band over the hands near its foot."""
    L = S['staff_len']
    return {'haft_len': L, 'haft_r': S['staff_r'], 'haft_taper': S['taper'], 'collar_len': 0.0,
            'haft_below': REACH - L, 'ring_at': L - REACH + 0.08}


def _studs(H, at, step=0.05, clear=()):
    """Studs down each side of a sheath, a fixed many (a record's own pole keeps its vertices), every `step` from the
    head down to `at`, none within a collar's reach of those `clear` metres below the head."""
    top = H['haft_len']
    girth = lambda z: H['haft_r'] * (1.0 + (H['haft_taper'] - 1.0) * z / top) * 1.08  # noqa: E731
    out = []
    for d in np.arange(0.06, at, step):
        if all(abs(d - c) > 0.025 for c in clear):
            out += [stud(np.array([0.0, s * girth(top - d), top - d]), [0.0, s, 0.0], 0.0042, 0.0035, COLLAR)
                    for s in (-1.0, 1.0)]
    return out


def _iron_work(H):
    """Iron's pole: the warhammer's nailed socket under the head, and square bands down it."""
    return wh._socket(H, length=0.03, strap=0.05) + wh._bands(H, at=(0.16, 0.31, 0.5))


def _mithril_work(H):
    """Mithril's pole: Daggerfall's wood, a short sleeve under the head banded in its blue at both ends."""
    sleeve = {**H, 'haft_len': H['haft_len'] - 0.04, 'collar_len': 0.04, 'collar_r': 1.2}
    return wh._collar(sleeve, 'banded')


def _sheath(collars, step=None, stones=False):
    """A sheathed pole's work: collars at `collars` metres below its head, studs every `step` down each side, dark
    stones set round it between its upper collars."""
    def work(H):
        top = H['haft_len']
        out = wh._sheathed(H, collars=tuple(top - c for c in collars), studs=None,
                           bands=wh.ACCENT if stones else COLLAR)
        if step:
            out += _studs(H, max(collars), step, collars)
        for d in (0.14, 0.17, 0.2) if stones else ():
            g = H['haft_r'] * (1.0 + (H['haft_taper'] - 1.0) * (top - d) / top) * 1.08
            out += [stud(np.array([np.cos(t) * g, np.sin(t) * g, top - d]), [np.cos(t), np.sin(t), 0.0], 0.0055, 0.0035,
                         HEAD) for t in np.arange(4) * np.pi / 2 + np.pi / 4]
        return out
    return work


# each metal's make: its pole's stuff, the work down it and its head. Steel's departs from Daggerfall's plain pole and
# cap: a smith's dressed work, as its warhammer is
LOOK = {
    'Iron': {'pole': 'wood', 'work': _iron_work, 'head': _iron},
    'Steel': {'pole': 'wood', 'work': wh._dressed, 'head': _steel},
    'Silver': {'pole': 'wood', 'work': lambda H: wh._wrapped(H, sleeve=0.07, turns=7.0), 'head': _silver},
    'Elven': {'pole': 'wood', 'work': lambda H: wh._leafed(H, sleeve=0.1, turns=6.0), 'head': _elven},
    'Dwarven': {'pole': 'metal', 'work': _sheath((0.22, 0.5, REACH - 0.08), step=0.045), 'head': _dwarven},
    'Mithril': {'pole': 'wood', 'work': _mithril_work, 'head': _mithril},
    'Adamantium': {'pole': 'metal', 'work': _sheath((0.06, 0.3, 0.6, REACH - 0.08), stones=True), 'head': _adamantium},
    'Ebony': {'pole': 'metal', 'work': lambda H: wh._engraved(H, sleeve=0.16, turns=5.0), 'head': _ebony},
    'Orcish': {'pole': 'wood', 'work': lambda H: wh._bound(H, sleeve=0.11, turns=8.0), 'head': _orcish},
    'Daedric': {'pole': 'metal', 'work': _sheath((0.2, 0.45, 0.7), step=0.05), 'head': _daedric},
}


def staff(S, metal, head=None, own=False):
    """`metal`'s staff in the pole's own space: its root at the origin, up +Z to its head, sized by shape `S`
    (fpmodel.py STAFF: its length, root radius, taper and cap). `head` (top, rt) puts that head on a plain pole in
    place of the metal's make (gear.py's class staff). Its stuffs are its own with `own`, else folded onto the four
    Daggerfall's staff knows (PLAIN). [(vertices, triangles, stuff)]."""
    L, r0 = S['staff_len'], S['staff_r']
    lk = LOOK.get(metal or 'Steel')
    zs = np.linspace(0.0, L, 65)
    pieces = [(*_ring_tube(zs, r0 * (S['taper'] + (1.0 - S['taper']) * (L - zs) / L), SIDES), lk['pole'])]
    rt = r0 * S['taper']
    if head is None:
        H = _haft(S)
        pieces += [(v, t, STUFF.get(m, m)) for v, t, m in lk['work'](H)] + lk['head'](L, rt)
    else:
        pieces += head(L, rt)
    return pieces if own else [(v, t, PLAIN.get(k, k)) for v, t, k in pieces]
