"""Each metal's own warhammer in first person (WEAPON07.CIF): its head's make, its collar and the fittings on its haft.

Daggerfall's own is fpwarhammer.py's, the frames every metal falls back to. Steel's is a smith's dressed work, and each
other metal is its culture's, in the language its dagger and its long blade speak (fpdaggers.py, blades.py), each at
about Daggerfall's head's size so the fitted swings still hold it. The head and its sleeves are rendered grey and the
game dyes them by the metal, as it dyes Daggerfall's; the bands, rivets, straps and studs are polished in the metal's
own colours (metals.py `LOOK`), which no dye touches, and a daedric head's veins glow.

    python -I tools/sprite-forge/fpwarhammers.py --out public/art/studio/forge/WEAPON07 [--metals Iron,Daedric]
        [--samples 256] [--records 1,2]

Writes `WEAPON07.CIF_<record>-<frame>_<Metal>.png` beside the forge's metal-less frames, which stay Daggerfall's. The
head's space is fpwarhammer.py's: X along the head, its striking face toward +X, Y across it, Z up the haft, the
head's foot on the collar. Each make is turned end for end on the haft as it is put together (`part`), so its
striking face leads the blow."""
import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fpwarhammer  # noqa: E402
import fpwear  # noqa: E402
from fpwarhammer import HEAD, COLLAR  # noqa: E402

MATS = fpwarhammer.MATS + ('hammer_accent', 'hammer_glow', 'hammer_grip')
ACCENT, GLOW, GRIP = len(fpwarhammer.MATS), len(fpwarhammer.MATS) + 1, len(fpwarhammer.MATS) + 2
# each metal's head surface (fpwarhammer.head_metal): how deep its dents and how far apart its mottle's two greys
SURFACE = {
    'Iron': (0.75, (0.38, 0.56)), 'Steel': (0.25, (0.46, 0.56)), 'Silver': (0.12, (0.48, 0.54)),
    'Elven': (0.12, (0.48, 0.54)), 'Dwarven': (0.12, (0.49, 0.53)), 'Mithril': (0.3, (0.44, 0.56)),
    'Adamantium': (0.1, (0.49, 0.53)), 'Ebony': (0.1, (0.49, 0.53)), 'Orcish': (0.3, (0.47, 0.54)),
    'Daedric': (0.1, (0.49, 0.53)),
}
# a metal's dents and blotches, each so many to a metre, where they are coarser than Daggerfall's: the marks of a
# smith's hammer, a few pixels across, where a finer grain greys out to speckle
GRAIN = {'Iron': (75.0, 120.0), 'Steel': (100.0, 160.0), 'Dwarven': (100.0, 160.0), 'Silver': (100.0, 160.0),
         'Elven': (100.0, 160.0), 'Ebony': (100.0, 160.0), 'Orcish': (100.0, 160.0),
         'Daedric': (100.0, 160.0)}
# a metal whose warhammer is its own from the head down: its haft's wood, dark and light, and its fittings hammered as
# the head is; or (None) its haft sheathed in the metal, smooth, where a long sleeve hammered would read as scales.
# Neither casts a shadow: under a light grazing the head they would lay a dark band across it
HAFT = {'Iron': ((0.03, 0.017, 0.009), (0.11, 0.062, 0.03)), 'Steel': ((0.08, 0.052, 0.03), (0.24, 0.16, 0.095)),
        'Dwarven': None, 'Adamantium': None, 'Silver': None, 'Elven': None, 'Ebony': None, 'Orcish': None,
        'Daedric': None}


# ---- the pieces: each faceted, its own corners on every face, so the forge's smooth shading leaves the faces flat

def _tris(tris, mat):
    t = np.asarray(tris, dtype=np.float64).reshape(-1, 3, 3)
    return t.reshape(-1, 3), np.arange(3 * len(t), dtype=np.int64).reshape(-1, 3), mat


def section(kind, hy, hz, c=0.3, n=16):
    """A bar's section, its corners round its axis in (across, up), a flat face below it where the haft comes in:
    square, chamfered (each corner cut back by `c` of the half), hexagonal or round (`n` sides)."""
    if kind == 'square':
        return np.array([[-hy, -hz], [hy, -hz], [hy, hz], [-hy, hz]])
    if kind == 'chamfer':
        a, b = hy * (1 - c), hz * (1 - c)
        return np.array([[-a, -hz], [a, -hz], [hy, -b], [hy, b], [a, hz], [-a, hz], [-hy, b], [-hy, -b]])
    k = 6 if kind == 'hex' else n
    th = np.linspace(0.0, 2 * np.pi, k, endpoint=False) + (0.0 if kind == 'hex' else np.pi / k)
    return np.stack([hy * np.cos(th), hz * np.sin(th)], axis=1)


def across(x, sec, z, s=1.0, dz=0.0, y=0.0):
    """Section `sec` standing across the head at `x`, about height `z + dz` and `y` across, scaled `s`."""
    return np.stack([np.full(len(sec), x), y + sec[:, 0] * s, z + dz + sec[:, 1] * s], axis=1)


def up(z, sec, s=1.0, x=0.0, y=0.0):
    """Section `sec` lying flat at height `z`, about `x` and `y`, scaled `s`: a ring of a piece rising up the haft."""
    return np.stack([x + sec[:, 0] * s, y + sec[:, 1] * s, np.full(len(sec), z)], axis=1)


def loft(rings, mat):
    """Rings in order, each as many corners, joined face to face and closed at both ends; a ring of one point is a
    tip the piece runs to."""
    tris = []
    for a, b in zip(rings[:-1], rings[1:]):
        k = max(len(a), len(b))
        for j in range(k):
            j2 = (j + 1) % k
            if len(a) == 1:
                tris.append([a[0], b[j], b[j2]])
            elif len(b) == 1:
                tris.append([a[j], a[j2], b[0]])
            else:
                tris += [[a[j], a[j2], b[j2]], [a[j], b[j2], b[j]]]
    for r, flip in ((rings[0], True), (rings[-1], False)):
        if len(r) > 2:
            for j in range(1, len(r) - 1):
                tris.append([r[0], r[j + 1], r[j]] if flip else [r[0], r[j], r[j + 1]])
    return _tris(tris, mat)


def bar(x0, x1, sec, z, mat, s0=1.0, s1=None, dz=0.0):
    """A straight length of section `sec` along the head from `x0` to `x1`, scaled `s0` there and `s1` here."""
    return loft([across(x0, sec, z, s0, dz), across(x1, sec, z, s0 if s1 is None else s1, dz)], mat)


def stud(base, axis, w, h, mat):
    """A four-sided point on a face: its square foot `w` to each side about `base`, rising `h` along `axis`."""
    axis = np.asarray(axis, float) / np.linalg.norm(axis)
    u = np.cross(axis, [0.0, 0.0, 1.0] if abs(axis[2]) < 0.9 else [1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    foot = np.array([base + w * (a * u + b * v) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    return loft([foot, np.array([base + axis * h])], mat)


def strut(a, b, w, mat):
    """A thin square rod from point `a` to point `b`, `w` to each side: a vein, a wire."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    axis = (b - a) / np.linalg.norm(b - a)
    u = np.cross(axis, [0.0, 0.0, 1.0] if abs(axis[2]) < 0.9 else [1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    ring = lambda c: np.array([c + w * (i * u + j * v) for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))])  # noqa: E731
    return loft([ring(a), ring(b)], mat)


def spike(z0, h, w, mat, lean=0.0, sides='square'):
    """A spike rising from the head's top at `z0` on the haft's line, `w` its foot's half-width, `h` high, its point
    leaning `lean` toward the face."""
    sec = section(sides, w, w)
    return loft([up(z0, sec), up(z0 + h * 0.5, sec, 0.55, x=lean * 0.3), np.array([[lean, 0.0, z0 + h]])], mat)


def _dims(S):
    """The fitted head's length, height and depth, and the height of its foot on the collar."""
    return S['head_len'], S['head_h'], S['head_d'], S['haft_len'] + S['collar_len']


def _collar(S, kind):
    if kind == 'socket':   # the head brings its own socket and bands
        return []
    top, cl = S['haft_len'], S['collar_len']
    c = S['haft_r'] * S['haft_taper'] * S['collar_r']
    if kind == 'ringed':
        return [fpwarhammer._ringed(top, top + cl, c, c * 1.12, 0.006, COLLAR)]
    if kind == 'square':
        return [fpwarhammer._ringed(top, top + cl, c * 1.05, c * 1.15, 0.006, COLLAR, n=24, power=6.0)]
    sleeve = [fpwarhammer._ringed(top, top + cl, c, c, 0.006, COLLAR)]
    if kind == 'banded':   # a band of the metal's own colour at each end
        sleeve += [fpwarhammer._ringed(z, z + 0.009, c * 1.14, c * 1.14, 0.002, ACCENT) for z in (top, top + cl - 0.009)]
    return sleeve


def _langets(S, length=0.12):
    """Two straps of the head's metal down the haft's sides from the collar, nailed through it."""
    top, r = S['haft_len'], S['haft_r'] * S['haft_taper']
    sec = section('square', 0.007, 0.0017)
    return [loft([up(top - length, sec, y=side * (r + 0.0008)), up(top + 0.002, sec, y=side * (r + 0.0008))], COLLAR)
            for side in (-1.0, 1.0)]


# ---- the heads: each (pieces, its collar, whether straps run down the haft)

def lozenge(hy, hz):
    """A section with its corners above, below and to each side: a ridge runs along each, and each face takes the
    light apart."""
    return np.array([[0.0, -hz], [hy, 0.0], [0.0, hz], [-hy, 0.0]])


def _socket(S, length=0.015, strap=0.045):
    """A tall faceted socket down the haft from the head's foot, flaring into it; a strap of it on each side running on
    down the haft to a point, a nail through each strap and through the socket. Gives the pieces."""
    top, r = S['haft_len'], S['haft_r'] * S['haft_taper']
    zb = top + S['collar_len']
    sec = section('chamfer', r, r, 0.4)
    out = [loft([up(z, sec, k) for z, k in ((top - length, 1.12), (top - length + 0.006, 1.2), (zb - 0.015, 1.28),
                                            (zb, 1.4))], COLLAR)]
    out.append(loft([up(top - length - 0.004, sec, 1.3), up(top - length + 0.006, sec, 1.3)], COLLAR))   # its rim
    band = section('square', 0.0045, 0.0018)
    for side in (-1.0, 1.0):
        y = side * (r + 0.0012)
        out.append(loft([up(top - length + 0.01, band, y=y), up(top - length - strap + 0.012, band, y=y),
                         np.array([[0.0, y, top - length - strap]])], COLLAR))
        out += [stud(np.array([0.0, side * (r * k + 0.0005), z]), [0.0, side, 0.0], 0.0045, 0.003, COLLAR)
                for z, k in ((top - length - strap * 0.45, 1.0), (top - length * 0.45, 1.25))]
    return out


def _bands(S, at=(0.16, 0.31)):
    """Square iron bands round the haft: one over the hands, and one `at` each distance below the collar's foot."""
    top, r0 = S['haft_len'], S['haft_r']
    r1 = r0 * S['haft_taper']
    sec = section('chamfer', 1.0, 1.0, 0.35)
    out = []
    for z in [S['ring_at']] + [top - a for a in at]:
        g = (r0 + (r1 - r0) * z / top) * 1.16
        out.append(loft([up(z - 0.009, sec, g), up(z + 0.009, sec, g)], COLLAR))
    return out


def _iron(S):
    """Forged iron, rough from the hammer: one bar from a heavy block, its face parted by a slot across into two
    teeth, back past a ridge each side of the eye into a long four-sided spike drooping toward the hands; a spike on
    top on the haft's line; a socket flaring into the head, nailed through its straps, and square bands down the
    haft."""
    L, H, D, zb = _dims(S)
    hy, hz = 0.36 * D, 0.5 * H
    zc = zb + hz
    block = section('square', hy, hz)
    out = [loft([across(L * x, block, zc, s) for x, s in ((-0.16, 1.0), (0.14, 1.0), (0.38, 1.08))], HEAD)]
    out += [bar(L * x, L * x + 0.012, block, zc, HEAD, 1.07) for x in (-0.16, 0.1)]   # a ridge each side of the eye
    tooth = section('square', 1.08 * hy, 0.4 * 1.08 * hz)
    out += [loft([across(0.38 * L, tooth, zc, 1.0, side * 0.6 * 1.08 * hz),
                  across(0.46 * L, tooth, zc, 0.84, side * 0.6 * 1.08 * hz)], HEAD) for side in (-1, 1)]
    out.append(loft([across(-0.16 * L, block, zc), across(-0.3 * L, block, zc, 0.62, -0.05 * H),
                     across(-0.48 * L, block, zc, 0.28, -0.15 * H), np.array([[-0.64 * L, 0.0, zc - 0.28 * H]])], HEAD))
    point = lozenge(0.014, 0.022)[:, ::-1]   # its corners toward the head's ends and sides
    out.append(loft([up(zc + 0.85 * hz, point), up(zc + hz + 0.02, point, 0.62),
                     np.array([[0.0, 0.0, zc + hz + 0.065]])], HEAD))
    return out + _socket(S) + _bands(S), 'socket', False


def boss(at, side, r, h, mat, n=8):
    """A round boss on a side of the head (`side` toward +Y or -Y) about `at`: `r` round its foot, `h` high, its top
    flat and narrower."""
    ring = lambda k, dy: np.array([[at[0] + np.cos(t) * r * k, at[1] + dy, at[2] + np.sin(t) * r * k]  # noqa: E731
                                   for t in np.linspace(0.0, 2 * np.pi, n, endpoint=False)])
    return loft([ring(1.0, 0.0), ring(0.6, side * h)], mat)


def _helix(z0, z1, turns, girth, w, mat, n=16):
    """A cord wound round the haft from `z0` up to `z1`, `turns` times round, `girth(z)` the haft's girth there and
    `w` the cord's half-width: [pieces], one a step."""
    z = np.linspace(z0, z1, int(n * abs(turns)) + 1)
    th = np.linspace(0.0, 2 * np.pi * turns, len(z))
    pts = [np.array([np.cos(t) * girth(h), np.sin(t) * girth(h), h]) for t, h in zip(th, z)]
    return [strut(a, b, w, mat) for a, b in zip(pts[:-1], pts[1:])]


def _steel(S):
    """Smith's steel, dressed: a long block from the eye to a broad face that flares past a band, each of its sides a
    framed panel round a boss; a long beak behind tapering in a curve to its point; a boss each side of the eye. Straps
    run down the haft from the head to three rings close together, and below them a cord winds the haft, studded
    where it crosses each side."""
    L, H, D, zb = _dims(S)
    hy, hz = 0.34 * D, 0.52 * H
    zc = zb + hz
    block = section('square', hy, hz)
    face = section('chamfer', hy, hz, 0.22)
    out = [bar(-0.13 * L, 0.36 * L, block, zc, HEAD),
           bar(0.36 * L, 0.39 * L, block, zc, HEAD, 1.06),   # the band before the face
           loft([across(L * x, face, zc, s) for x, s in ((0.39, 0.96), (0.45, 1.3), (0.49, 1.3), (0.5, 1.2))], HEAD)]
    beak = section('chamfer', 0.8 * hy, 0.92 * hz, 0.3)
    out.append(loft([across(L * x, beak, zc, s, dz * H) for x, s, dz in
                     ((-0.12, 1.0, 0.0), (-0.22, 0.74, -0.01), (-0.34, 0.5, -0.03), (-0.48, 0.28, -0.07))]
                    + [np.array([[-0.66 * L, 0.0, zc - 0.13 * H]])], HEAD))
    for side in (-1.0, 1.0):
        y = side * (hy + 0.0012)
        x0, x1, z0, z1 = 0.1 * L, 0.33 * L, zc - 0.7 * hz, zc + 0.7 * hz   # a panel's frame, and its boss
        corners = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
        out += [strut(corners[k], corners[(k + 1) % 4], 0.0026, HEAD) for k in range(4)]
        out.append(boss(np.array([0.215 * L, y, zc]), side, 0.012, 0.004, HEAD))
        out.append(stud(np.array([0.0, side * hy, zc]), [0.0, side, 0.0], 0.007, 0.005, HEAD))   # the eye's boss
    return out + _dressed(S), 'socket', False


def _dressed(S, strap=0.12, rings=(0.14, 0.158, 0.176), wound=(0.2, 0.62), turns=3.0):
    """Steel's haft: a strap each side from the head down past the collar to a point, nailed; three rings close
    together below; a cord wound round it below them, studded where it crosses each side."""
    top, r0 = S['haft_len'], S['haft_r']
    r1 = r0 * S['haft_taper']
    zb = top + S['collar_len']
    girth = lambda z: r0 + (r1 - r0) * np.clip(z / top, 0.0, 1.0)  # noqa: E731
    collar = section('chamfer', 1.0, 1.0, 0.3)
    out = [loft([up(zb - 0.006, collar, r1 * 1.25), up(zb, collar, r1 * 1.4)], COLLAR)]
    band = section('square', 0.006, 0.0018)
    for side in (-1.0, 1.0):
        y = side * (r1 + 0.0012)
        out.append(loft([up(zb, band, y=y), up(zb - strap + 0.014, band, y=y), np.array([[0.0, y, zb - strap]])],
                        COLLAR))
        out.append(stud(np.array([0.0, side * (r1 + 0.003), zb - strap * 0.6]), [0.0, side, 0.0], 0.004, 0.003,
                        COLLAR))
    sec = section('chamfer', 1.0, 1.0, 0.35)
    for d in rings:
        g = girth(zb - d) * 1.18
        out.append(loft([up(zb - d - 0.006, sec, g), up(zb - d + 0.006, sec, g)], COLLAR))
    lo, hi = zb - wound[1], zb - wound[0]
    out += _helix(lo, hi, turns, lambda z: girth(z) * 1.02, 0.0022, GRIP)
    for k in range(int(turns * 2)):   # a stud where the cord crosses each side
        z = lo + (hi - lo) * (k + 0.5) / (turns * 2)
        side = 1.0 if k % 2 == 0 else -1.0
        out.append(stud(np.array([0.0, side * girth(z), z]), [0.0, side, 0.0], 0.0035, 0.003, COLLAR))
    return out


def _silver(S):
    """Silver, ornate: a round hammer behind a ringed collar, a chamfered block between, each side a lozenge boss in a
    frame; a slender horn behind curving up to its point, and a spike on top on the haft's line. An engraved sleeve
    runs down the haft from the head, ringed at both ends, and below it the haft is wrapped in the metal's grip colour,
    a silver wire wound over the wrap."""
    L, H, D, zb = _dims(S)
    hy, hz = 0.36 * D, 0.46 * H
    zc = zb + hz
    sec, rnd = section('chamfer', hy, hz, 0.3), section('round', 1.0, 1.0, n=14)
    R = 0.92 * hz
    out = [bar(-0.14 * L, 0.14 * L, sec, zc, HEAD),
           loft([across(L * x, rnd, zc, R * s) for x, s in
                 ((0.14, 0.7), (0.2, 0.7), (0.21, 0.86), (0.25, 0.86), (0.26, 0.7), (0.3, 0.74), (0.32, 1.0),
                  (0.46, 1.04), (0.48, 1.12), (0.5, 1.12), (0.51, 1.0))], HEAD)]
    horn = section('round', 0.55 * hy, 0.75 * hz, n=10)
    out.append(loft([across(L * x, horn, zc, s, dz * H) for x, s, dz in
                     ((-0.12, 1.0, 0.0), (-0.24, 0.78, 0.04), (-0.36, 0.56, 0.16), (-0.46, 0.36, 0.38),
                      (-0.52, 0.2, 0.62))] + [np.array([[-0.55 * L, 0.0, zc + 0.86 * H]])], HEAD))
    out.append(spike(zc + hz - 0.001, 0.055, 0.011, HEAD))
    lz = lozenge(0.6 * hz, 0.03)[:, ::-1]
    for side in (-1.0, 1.0):
        y = side * (hy + 0.0012)
        x0, x1, z0, z1 = -0.12 * L, 0.12 * L, zc - 0.72 * hz, zc + 0.72 * hz
        corners = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
        out += [strut(corners[k], corners[(k + 1) % 4], 0.0022, HEAD) for k in range(4)]
        out.append(loft([np.stack([lz[:, 1], np.full(4, y), zc + lz[:, 0]], axis=1),
                         np.stack([lz[:, 1] * 0.5, np.full(4, y + side * 0.004), zc + lz[:, 0] * 0.5], axis=1)], HEAD))
    return out + _wrapped(S), 'socket', False


def _wrapped(S, sleeve=0.13, turns=6.0):
    """Silver's haft: an engraved sleeve `sleeve` down from the head, faceted, ringed at both ends and once between;
    below it, the haft wrapped in the grip colour to its end, a silver wire wound over the wrap, and a band over the
    hands."""
    top, r0 = S['haft_len'], S['haft_r']
    r1 = r0 * S['haft_taper']
    zb = top + S['collar_len']
    girth = lambda z: r0 + (r1 - r0) * np.clip(z / top, 0.0, 1.0)  # noqa: E731
    sec = section('chamfer', 1.0, 1.0, 0.35)
    lo = zb - sleeve
    out = [loft([up(lo, sec, girth(lo) * 1.12), up(zb - 0.01, sec, girth(zb) * 1.12), up(zb, sec, girth(zb) * 1.45)],
                COLLAR)]
    for z in (lo + 0.004, (lo + zb) / 2, zb - 0.014):
        out.append(loft([up(z - 0.005, sec, girth(z) * 1.22), up(z + 0.005, sec, girth(z) * 1.22)], COLLAR))
    rnd = section('round', 1.0, 1.0, n=12)
    zs = np.linspace(-S['haft_below'], lo, 10)
    out.append(loft([up(z, rnd, girth(z) * 1.05) for z in zs], GRIP))
    out += _helix(-S['haft_below'], lo, turns, lambda z: girth(z) * 1.06, 0.0016, COLLAR)
    a = S['ring_at']
    out.append(loft([up(a - 0.008, sec, girth(a) * 1.18), up(a + 0.008, sec, girth(a) * 1.18)], COLLAR))
    return out


def _elven(S):
    """Elven, a bird of prey: a beak of a hammer, its bevelled face set a little low; a wing swept back from the eye and
    up to a point, feathered along each side; a crest along the head's top. A long sleeve flares into the head, a leaf
    raised on each side, and below it the haft is wrapped and bound in a lattice of gold."""
    L, H, D, zb = _dims(S)
    hy, hz = 0.3 * D, 0.5 * H
    zc = zb + hz
    sec = section('chamfer', hy, hz, 0.3)
    out = [bar(-0.12 * L, 0.12 * L, sec, zc, HEAD),
           loft([across(L * x, sec, zc, s, dz * H) for x, s, dz in
                 ((0.12, 1.0, 0.0), (0.3, 0.92, -0.04), (0.4, 1.06, -0.08), (0.45, 1.1, -0.1), (0.48, 0.96, -0.11))],
                HEAD)]
    out.append(strut((-0.1 * L, 0.0, zc + hz), (0.36 * L, 0.0, zc + hz - 0.06 * H), 0.0035, HEAD))   # its crest
    wing = [(-0.1, 0.5, 0.0), (-0.2, 0.48, 0.18), (-0.3, 0.42, 0.42), (-0.4, 0.32, 0.72), (-0.47, 0.2, 1.0)]
    out.append(loft([across(L * x, section('chamfer', 0.42 * hy, h * H, 0.4), zc, 1.0, dz * H) for x, h, dz in wing]
                    + [np.array([[-0.54 * L, 0.0, zc + 1.32 * H]])], HEAD))
    for side in (-1.0, 1.0):   # its feathers: ridges along each side, root to tip
        y = side * 0.42 * hy * 1.02
        for k, f in enumerate((-0.6, -0.15, 0.3)):
            pts = [(L * x, y, zc + (dz + f * h) * H) for x, h, dz in wing[:4 - (k == 2)]]
            out += [strut(a, b, 0.0022, HEAD) for a, b in zip(pts[:-1], pts[1:])]
    return out + _leafed(S), 'socket', False


def _leafed(S, sleeve=0.15, turns=5.0):
    """Elven's haft: a long sleeve `sleeve` down from the head, flaring into it, a leaf raised on each side and a band
    at its foot; below it the haft wrapped to its end, bound by two cords of gold wound against each other in a
    lattice, and a band over the hands."""
    top, r0 = S['haft_len'], S['haft_r']
    r1 = r0 * S['haft_taper']
    zb = top + S['collar_len']
    girth = lambda z: r0 + (r1 - r0) * np.clip(z / top, 0.0, 1.0)  # noqa: E731
    sec = section('chamfer', 1.0, 1.0, 0.35)
    lo = zb - sleeve
    out = [loft([up(z, sec, girth(z) * k) for z, k in ((lo, 1.1), (zb - 0.04, 1.18), (zb - 0.01, 1.6), (zb, 1.75))],
                COLLAR)]
    for side in (-1.0, 1.0):
        y = side * girth(zb) * 1.16
        leaf = lozenge(0.008, 0.035)[:, ::-1]
        zm = lo + sleeve * 0.45
        out.append(loft([np.stack([leaf[:, 1], np.full(4, y), zm + leaf[:, 0]], axis=1),
                         np.stack([leaf[:, 1] * 0.5, np.full(4, y + side * 0.003), zm + leaf[:, 0] * 0.6], axis=1)],
                        COLLAR))
    for z in (lo + 0.004, S['ring_at']):
        out.append(loft([up(z - 0.006, sec, girth(z) * 1.2), up(z + 0.006, sec, girth(z) * 1.2)], COLLAR))
    rnd = section('round', 1.0, 1.0, n=12)
    out.append(loft([up(z, rnd, girth(z) * 1.05) for z in np.linspace(-S['haft_below'], lo, 10)], GRIP))
    for turn in (turns, -turns):
        out += _helix(-S['haft_below'], lo, turn, lambda z: girth(z) * 1.06, 0.0015, COLLAR)
    return out


def _drum(x0, x1, R, zc, mat, ribs=6, n=12):
    """A drum along the head from `x0` (its neck, by the eye) to `x1` (its face), either way along X, `R` its face's
    girth: a short neck, the drum flaring out to a rim before a bevelled face, and `ribs` raised ribs along it."""
    rnd = section('round', R, R, n=n)
    at = lambda u: x0 + (x1 - x0) * u  # noqa: E731
    out = [loft([across(at(u), rnd, zc, s) for u, s in
                 ((0.0, 0.7), (0.22, 0.7), (0.24, 0.84), (0.8, 0.96), (0.84, 1.1), (0.96, 1.1), (1.0, 0.98))], HEAD)]
    for j in range(ribs):
        t = 2 * np.pi * (j + 0.5) / ribs
        c, sn = np.cos(t), np.sin(t)
        out.append(strut((at(0.28), c * R * 0.86, zc + sn * R * 0.86), (at(0.78), c * R * 0.96, zc + sn * R * 0.96),
                         0.0028, HEAD))
    return out


def _dwarven(S):
    """Dwarven work, symmetric and engineered: a square eye block, its sides framed panels parted by a bar, a band at
    each end; a drum each side on a short neck, flaring to a rimmed face, ribbed along its length. The haft is sheathed
    in the metal, collared over the hands, at its middle and where it meets the head, and studded down each side."""
    L, H, D, zb = _dims(S)
    hy, hz = 0.4 * D, 0.5 * H
    zc, R = zb + hz, 0.5 * H * 1.02
    block = section('square', hy, hz)
    out = [bar(-0.15 * L, 0.15 * L, block, zc, HEAD)]
    out += [bar(side * 0.15 * L, side * 0.13 * L, block, zc, HEAD, 1.07) for side in (-1, 1)]   # its end bands
    for side in (-1.0, 1.0):
        y = side * (hy + 0.0012)
        x0, x1, z0, z1 = -0.1 * L, 0.1 * L, zc - 0.68 * hz, zc + 0.68 * hz
        corners = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
        out += [strut(corners[k], corners[(k + 1) % 4], 0.0024, HEAD) for k in range(4)]
        out.append(strut((0.0, y, z0), (0.0, y, z1), 0.0024, HEAD))
    out += _drum(0.15 * L, 0.5 * L, R, zc, HEAD) + _drum(-0.15 * L, -0.5 * L, R, zc, HEAD)
    return out + _sheathed(S), 'socket', False


def _sheathed(S, collars=(0.03, 0.26), studs=0.045, bands=COLLAR):
    """A haft sheathed in the head's metal from its end to the head: faceted, a collar over the hands and one at its
    middle, of `bands`, a flared one where it meets the head, and a stud every `studs` down each side (None: none)."""
    top, r0 = S['haft_len'], S['haft_r']
    r1 = r0 * S['haft_taper']
    zb = top + S['collar_len']
    girth = lambda z: (r0 + (r1 - r0) * np.clip(z / top, 0.0, 1.0)) * 1.08  # noqa: E731
    rnd = section('round', 1.0, 1.0, n=10)
    zs = np.linspace(-S['haft_below'], zb, 12)
    out = [loft([up(z, rnd, girth(z)) for z in zs], COLLAR)]
    for z in collars:
        out.append(loft([up(z - 0.014, rnd, girth(z) * 1.08), up(z - 0.01, rnd, girth(z) * 1.2),
                         up(z + 0.01, rnd, girth(z) * 1.2), up(z + 0.014, rnd, girth(z) * 1.08)], bands))
    out.append(loft([up(zb - 0.03, rnd, girth(zb) * 1.05), up(zb - 0.006, rnd, girth(zb) * 1.35),
                     up(zb, rnd, girth(zb) * 1.5)], COLLAR))
    for side in (-1.0, 1.0) if studs else ():
        out += [stud(np.array([0.0, side * girth(z), z]), [0.0, side, 0.0], 0.0042, 0.0035, COLLAR)
                for z in np.arange(zb - 0.06, collars[0] + 0.03, -studs) if abs(z - collars[1]) > 0.025]
    return out


def _mithril(S):
    """Light and keen: a small round face on a short chamfered core, a long square pick behind, tapering straight to
    its point, a blue band round the face and a tall spike on top."""
    L, H, D, zb = _dims(S)
    hy, hz = 0.4 * D, 0.5 * H
    zc, core, rnd, pick = zb + hz, section('chamfer', hy, hz, 0.3), section('round', 0.38 * H, 0.38 * H), \
        section('square', 0.28 * D, 0.33 * H)
    out = [bar(-0.09 * L, 0.09 * L, core, zc, HEAD),
           loft([across(L * x, rnd, zc, s) for x, s in ((0.09, 1.0), (0.4, 1.0), (0.43, 0.88))], HEAD),
           loft([across(-0.09 * L, pick, zc), across(-0.3 * L, pick, zc, 0.75), np.array([[-0.64 * L, 0.0, zc - 0.05 * H]])],
                HEAD),
           bar(0.2 * L, 0.23 * L, rnd, zc, ACCENT, 1.08),
           spike(zc + hz - 0.001, 0.07, 0.01, HEAD)]
    return out, 'banded', False


def _shard(L, H, D, zc, seed=7):
    """A shard of the mountain across the haft: an irregular crystal of seven faces round, broad and blunt at its
    striking end (+X), drawn to a point at its other, each ring's corners and girth jittered so its facets break the
    light unevenly. Gives its rings."""
    rng = np.random.default_rng(seed)
    k = 7
    th0 = np.linspace(0.0, 2 * np.pi, k, endpoint=False) + rng.uniform(-0.2, 0.2, k)
    rings = []
    for x, s, dz in ((0.5, 0.62, 0.02), (0.44, 0.92, 0.0), (0.26, 1.0, 0.0), (0.0, 1.0, 0.0), (-0.22, 0.86, -0.03),
                     (-0.38, 0.58, -0.06), (-0.5, 0.3, -0.1)):
        th = th0 + rng.uniform(-0.12, 0.12, k)
        r = s * rng.uniform(0.82, 1.12, k)
        rings.append(np.stack([np.full(k, L * x + rng.uniform(-0.006, 0.006)), np.cos(th) * r * 0.48 * D,
                               zc + dz * H + np.sin(th) * r * 0.72 * H], axis=1))
    return rings + [np.array([[-0.66 * L, 0.0, zc - 0.2 * H]])]


def _tendril(a, b, c, w, mat, n=8):
    """A strand curving from `a` through toward `c` to `b` (a quadratic curve), `w` to each side: [pieces]."""
    t = np.linspace(0.0, 1.0, n + 1)[:, None]
    pts = (1 - t) ** 2 * np.asarray(a) + 2 * (1 - t) * t * np.asarray(c) + t ** 2 * np.asarray(b)
    return [strut(p, q, w, mat) for p, q in zip(pts[:-1], pts[1:])]


def _adamantium(S):
    """The mountain's heart: a great shard of dark crystal across the haft (`_shard`), held at its middle by a crowned
    band, gold points along both its edges with dark stones between; curling strands bind the band to the haft's head.
    The haft is sheathed pale, banded in gold, dark stones set round it between its bands."""
    L, H, D, zb = _dims(S)
    zc = zb + 0.72 * H
    out = [loft(_shard(L, H, D, zc), HEAD)]
    R = 0.72 * H * 1.1   # the band round the shard's middle, its ring about X
    band = section('round', 0.48 * D / (0.72 * H) * R, R, n=14)
    out.append(loft([across(L * x, band, zc, s) for x, s in ((-0.1, 0.96), (-0.08, 1.04), (0.08, 1.04), (0.1, 0.96))],
                    COLLAR))
    for j in range(8):   # its crown: a gold point on each edge, a dark stone between
        t = 2 * np.pi * (j + 0.5) / 8
        u = np.array([0.0, np.cos(t) * 0.48 * D / (0.72 * H), np.sin(t)])
        for side in (-1.0, 1.0):
            base = np.array([side * 0.1 * L, 0.0, zc]) + u * R * 0.98
            out.append(stud(base, [side, 0.0, 0.0], 0.006, 0.02, ACCENT))
        out.append(stud(np.array([0.0, 0.0, zc]) + u * R * 1.04, u, 0.005, 0.003, HEAD))
    top, r1 = S['haft_len'], S['haft_r'] * S['haft_taper']
    for side in (-1.0, 1.0):   # the strands: out from the haft's head, curling up onto the band's foot either side
        for y in (-0.6, 0.6):
            out += _tendril((0.0, y * r1, zb - 0.035), (side * 0.085 * L, y * 0.6 * R, zc - 0.9 * R),
                            (side * 0.07 * L, y * 2.2 * r1, zb - 0.03), 0.0022, COLLAR)
    out += _sheathed(S, collars=(0.03, 0.26, top - 0.06), studs=None, bands=ACCENT)
    for z in (top - 0.15, top - 0.18, top - 0.21):   # dark stones set round it, between its gold bands
        g = (S['haft_r'] + (r1 - S['haft_r']) * z / top) * 1.08
        out += [stud(np.array([np.cos(t) * g, np.sin(t) * g, z]), [np.cos(t), np.sin(t), 0.0], 0.0055, 0.0035, HEAD)
                for t in np.arange(4) * np.pi / 2 + np.pi / 4]
    return out, 'socket', False


def _ebony(S):
    """Ebony, black glass worked sharp: a heavy faceted hammer on a short neck, a fin standing up along its top; a long
    blade behind, edged above and below, curving back and up to a point; a round boss on each side of the eye, a
    spiral wound on it. An engraved sleeve, ringed, runs down the haft from the head, a spiral of wire wound up it;
    below it the haft is sheathed black, a wrap's ridge wound down it."""
    L, H, D, zb = _dims(S)
    hy, hz = 0.32 * D, 0.5 * H
    zc = zb + hz
    sec = section('chamfer', hy, hz, 0.3)
    gem = section('chamfer', hy, hz, 0.45)
    out = [bar(-0.12 * L, 0.12 * L, sec, zc, HEAD),
           loft([across(L * x, gem, zc, s) for x, s in
                 ((0.12, 0.78), (0.2, 0.78), (0.27, 1.18), (0.4, 1.24), (0.47, 1.0), (0.49, 0.8))], HEAD)]
    fin = np.array([[-0.004, 0.0], [0.0, -0.0025], [0.004, 0.0], [0.0, 0.0025]])   # a thin blade standing on the face
    out.append(loft([up(zc + 1.1 * hz, fin * 8.0, x=0.34 * L), up(zc + 1.1 * hz + 0.028, fin * 3.0, x=0.31 * L),
                     np.array([[0.27 * L, 0.0, zc + 1.1 * hz + 0.045]])], HEAD))
    blade = [(-0.1, 0.46, 0.0), (-0.24, 0.4, 0.08), (-0.38, 0.3, 0.26), (-0.5, 0.2, 0.52), (-0.58, 0.11, 0.76)]
    out.append(loft([across(L * x, lozenge(0.42 * hy, h * H), zc, 1.0, dz * H) for x, h, dz in blade]
                    + [np.array([[-0.66 * L, 0.0, zc + 0.98 * H]])], HEAD))
    for side in (-1.0, 1.0):   # the eye's bosses, a spiral wound on each
        y = side * (hy + 0.0012)
        out.append(boss(np.array([0.0, y, zc]), side, 0.016, 0.004, HEAD))
        t = np.linspace(0.0, 3.2 * np.pi, 14)
        pts = [(np.cos(a) * r, y + side * 0.0045, zc + np.sin(a) * r) for a, r in zip(t, np.linspace(0.002, 0.011, 14))]
        out += [strut(a, b, 0.0012, HEAD) for a, b in zip(pts[:-1], pts[1:])]
    return out + _engraved(S), 'socket', False


def _engraved(S, sleeve=0.16, turns=4.0):
    """Ebony's haft: an engraved sleeve `sleeve` down from the head, flaring into it, ringed at both ends and twice
    between, a spiral of wire wound up it; below it the haft sheathed black to its end, a wrap's ridge wound down it,
    and a ring over the hands."""
    top, r0 = S['haft_len'], S['haft_r']
    r1 = r0 * S['haft_taper']
    zb = top + S['collar_len']
    girth = lambda z: r0 + (r1 - r0) * np.clip(z / top, 0.0, 1.0)  # noqa: E731
    sec, rnd = section('chamfer', 1.0, 1.0, 0.35), section('round', 1.0, 1.0, n=12)
    lo = zb - sleeve
    out = [loft([up(z, sec, girth(z) * k) for z, k in ((lo, 1.16), (zb - 0.012, 1.2), (zb, 1.5))], COLLAR)]
    for z in (lo + 0.005, lo + sleeve / 3, lo + 2 * sleeve / 3, S['ring_at']):
        out.append(loft([up(z - 0.006, sec, girth(z) * 1.3), up(z + 0.006, sec, girth(z) * 1.3)], COLLAR))
    out += _helix(lo + 0.012, zb - 0.015, 2.5, lambda z: girth(z) * 1.2, 0.0014, COLLAR)
    out.append(loft([up(z, rnd, girth(z) * 1.06) for z in np.linspace(-S['haft_below'], lo, 10)], COLLAR))
    out += _helix(-S['haft_below'], lo, turns, lambda z: girth(z) * 1.07, 0.0022, COLLAR)
    return out


def sweep(pts, wy, wz, mat, n=8, across=(0.0, 1.0, 0.0)):
    """A tube along the curve `pts`, which lies in the plane square to `across`, each ring square to the curve, `wy`
    and `wz` its half-widths across that plane and in it at each point; a last point of width 0 is a tip it runs
    to."""
    pts, side = np.asarray(pts, float), np.asarray(across, float)
    th = np.linspace(0.0, 2 * np.pi, n, endpoint=False)
    rings = []
    for k, (p, a, b) in enumerate(zip(pts, wy, wz)):
        if a == 0.0:
            rings.append(p[None])
            continue
        t = pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]
        t /= np.linalg.norm(t)
        nrm = np.cross(t, side)
        rings.append(p + np.outer(np.cos(th) * a, side) + np.outer(np.sin(th) * b, nrm))
    return loft(rings, mat)


def _orcish(S):
    """Orcish, crude and cruel: a heavy block flaring to a clawed face, a tooth thrust out above and below its notch; a
    thick hook behind, rising and curling forward at its tip; a rivet each side of the eye. A broad sleeve, ridged and
    riveted, runs down the haft from the head to a tuft of fur; below it the haft is bound in braided leather."""
    L, H, D, zb = _dims(S)
    hy, hz = 0.36 * D, 0.5 * H
    zc = zb + hz
    sec = section('chamfer', hy, hz, 0.25)
    out = [bar(-0.12 * L, 0.12 * L, sec, zc, HEAD),
           loft([across(L * x, sec, zc, s) for x, s in ((0.12, 0.92), (0.3, 1.02), (0.38, 1.18))], HEAD)]
    tooth = section('square', 1.1 * hy, 0.32 * hz)
    for side in (-1.0, 1.0):   # the claw: a tooth above and below the notch, thrust out and apart
        out.append(loft([across(0.38 * L, tooth, zc, 1.0, side * 0.82 * hz), across(0.46 * L, tooth, zc, 0.8,
                                                                                    side * 1.0 * hz),
                         np.array([[0.53 * L, 0.0, zc + side * 1.3 * hz]])], HEAD))
    hook = [(-0.1, 0.0), (-0.22, 0.12), (-0.31, 0.38), (-0.35, 0.72), (-0.32, 1.02), (-0.24, 1.24), (-0.15, 1.32)]
    w = [1.0, 0.86, 0.7, 0.55, 0.4, 0.22, 0.0]
    out.append(sweep([(L * x, 0.0, zc + dz * H) for x, dz in hook], [0.8 * hy * k for k in w],
                     [0.9 * hz * k for k in w], HEAD))
    for side in (-1.0, 1.0):
        out.append(stud(np.array([0.0, side * hy, zc]), [0.0, side, 0.0], 0.007, 0.005, HEAD))
    return out + _bound(S), 'socket', False


def _bound(S, sleeve=0.17, turns=7.0):
    """Orcish haft: a broad sleeve `sleeve` down from the head, flaring into it, two ridges down each side and a rivet
    between; a tuft of fur round its foot; below it the haft bound in braided leather, two cords wound against each
    other, to its end."""
    top, r0 = S['haft_len'], S['haft_r']
    r1 = r0 * S['haft_taper']
    zb = top + S['collar_len']
    girth = lambda z: r0 + (r1 - r0) * np.clip(z / top, 0.0, 1.0)  # noqa: E731
    sec, rnd = section('chamfer', 1.3, 1.0, 0.3), section('round', 1.0, 1.0, n=12)
    lo = zb - sleeve
    out = [loft([up(z, sec, girth(z) * k) for z, k in ((lo, 1.12), (zb - 0.05, 1.3), (zb - 0.01, 1.7), (zb, 1.85))],
                COLLAR)]
    for side in (-1.0, 1.0):
        for dx in (-0.006, 0.006):
            out.append(strut((dx * 1.6, side * girth(lo) * 1.14, lo + 0.01), (dx * 2.2, side * girth(zb) * 1.32,
                                                                               zb - 0.05), 0.0018, COLLAR))
        out.append(stud(np.array([0.0, side * girth(zb) * 1.3, lo + 0.07]), [0.0, side, 0.0], 0.005, 0.004, COLLAR))
    rng = np.random.default_rng(3)
    for k in range(18):   # the fur: tufts round the sleeve's foot, out and down
        t = 2 * np.pi * k / 18 + rng.uniform(-0.1, 0.1)
        u = np.array([np.cos(t), np.sin(t), 0.0])
        a = np.array([0.0, 0.0, lo + 0.004]) + u * girth(lo) * 1.1
        out.append(stud(a, u * 0.8 + np.array([0.0, 0.0, -0.6]), 0.0035, 0.016 + rng.uniform(0.0, 0.008), GRIP))
    out.append(loft([up(z, rnd, girth(z) * 1.05) for z in np.linspace(-S['haft_below'], lo, 10)], GRIP))
    for turn in (turns, -turns):
        out += _helix(-S['haft_below'], lo, turn, lambda z: girth(z) * 1.07, 0.0026, GRIP)
    return out


def _daedric(S):
    """Daedric: a cage of six black claws bowing out from the neck round a glowing core and curling in to their points
    past it; a long spike behind sweeping up, toothed along its top; a spike on top leaning back; a spine along the
    head and a rivet each side of the eye. The haft is sheathed black, banded and studded down each side."""
    L, H, D, zb = _dims(S)
    hy, hz = 0.32 * D, 0.5 * H
    zc = zb + hz
    sec = section('chamfer', hy, hz, 0.3)
    rnd = section('round', 1.0, 1.0, n=10)
    out = [bar(-0.14 * L, 0.14 * L, sec, zc, HEAD),
           loft([across(L * x, rnd, zc, s * hz) for x, s in ((0.13, 0.62), (0.17, 0.62), (0.2, 0.4), (0.24, 0.3))],
                HEAD)]
    out.append(loft([across(L * x, rnd, zc, s * hz) for x, s in
                     ((0.22, 0.2), (0.27, 0.62), (0.34, 0.72), (0.41, 0.6), (0.45, 0.3))]
                    + [np.array([[0.47 * L, 0.0, zc]])], GLOW))
    for k in range(6):   # the claws, each in its own plane round the head's axis
        t = 2 * np.pi * (k + 0.5) / 6
        r = np.array([0.0, np.cos(t), np.sin(t)])
        pts = [np.array([L * x, 0.0, zc]) + r * hz * q for x, q in
               ((0.15, 0.62), (0.24, 1.0), (0.33, 1.22), (0.42, 1.12), (0.49, 0.78), (0.53, 0.36))]
        out.append(sweep(pts, [0.006, 0.0065, 0.006, 0.005, 0.0035, 0.0], [0.009, 0.01, 0.009, 0.007, 0.004, 0.0],
                         HEAD, n=6, across=np.cross(r, [1.0, 0.0, 0.0])))
    spine = [(-0.14, 0.0), (-0.26, 0.06), (-0.4, 0.22), (-0.52, 0.48), (-0.6, 0.78), (-0.64, 1.02)]
    w = [1.0, 0.82, 0.62, 0.42, 0.22, 0.0]
    out.append(sweep([(L * x, 0.0, zc + dz * H) for x, dz in spine], [0.7 * hy * q for q in w],
                     [0.8 * hz * q for q in w], HEAD))
    for x, dz, q in ((-0.3, 0.12, 0.72), (-0.42, 0.3, 0.55), (-0.52, 0.52, 0.4)):   # teeth along its top edge
        out.append(stud(np.array([L * x, 0.0, zc + dz * H + 0.75 * hz * q]), [0.35, 0.0, 1.0], 0.005, 0.012, HEAD))
    out.append(spike(zc + hz - 0.001, 0.06, 0.012, HEAD, lean=-0.014))
    out.append(strut((-0.12 * L, 0.0, zc + hz), (0.12 * L, 0.0, zc + hz), 0.004, HEAD))   # the spine
    for side in (-1.0, 1.0):
        out.append(stud(np.array([0.0, side * hy, zc]), [0.0, side, 0.0], 0.007, 0.005, HEAD))
    return out + _sheathed(S, collars=(0.03, 0.2, 0.4), studs=0.05), 'socket', False


DESIGNS = {'Iron': _iron, 'Steel': _steel, 'Silver': _silver, 'Elven': _elven, 'Dwarven': _dwarven, 'Mithril': _mithril,
           'Adamantium': _adamantium, 'Ebony': _ebony, 'Orcish': _orcish, 'Daedric': _daedric}
METALS = tuple(DESIGNS)
GLOW_STRENGTH = 0.035
CORE = {'Daedric': 1.0}   # a make whose glow is its armour's seam (armour.py `STYLE`), at this many times its light
METAL = ('hammer_head', 'hammer_collar', 'hammer_accent')   # graded as metal where a make keeps its own grade
GRIP_LIFT = 2.5


def part(S, metal):
    """`metal`'s warhammer: Daggerfall's haft under its own head and collar, turned end for end on the haft so its
    striking face leads the blow. (vertices, triangles, material a triangle)"""
    from fpmodel import _join
    pieces, collar, straps = DESIGNS[metal](S)
    v, t, m = _join(fpwarhammer.haft(S, ring=collar != 'socket') + _collar(S, collar) + (_langets(S) if straps else [])
                    + pieces)
    # the keyed turns hold Daggerfall's groove end (+X) on the side that faces the eye in the swings: a face drawn there
    # trails the side swings and looks back at the player in the strike down
    return v * np.array([-1.0, 1.0, 1.0]), np.ascontiguousarray(t[:, ::-1]), m


def palette(metal):
    """`metal`'s head surface, and its bands, rivets and studs in its third-person colours (metals.py `LOOK`); its glow,
    where it has one."""
    import materials
    import metals
    from fpmodel import _diffuse
    L, lin = metals.LOOK[metal], metals._linear
    dents, mottle = SURFACE[metal]
    # matte, lit as the head is: the render is exposed for a far sun on grey metal, which would blow a polished
    # fitting out to white
    accent = _diffuse(materials.plain('hammer_accent', lin(L.get('accent', L['fit'])), rough=0.6))
    glow = materials.plain('hammer_glow', lin(L.get('glow', L['fit'])), rough=0.5)
    if metal in CORE:   # its armour's seam, a deep red, lit as a heart burning in the head
        import armour
        colour, strength = armour.STYLE[metal]['seam']
        glow = materials.plain('hammer_glow', lin(colour), rough=0.6)
        b = glow.node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = (*lin(colour), 1)
        b.inputs['Emission Strength'].default_value = strength * CORE[metal]
    elif 'glow' in L:   # faint: the exposure lifts it some twenty-fold to an orange short of white
        b = glow.node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = (*lin(L['glow']), 1)
        b.inputs['Emission Strength'].default_value = GLOW_STRENGTH
    grain = [GRAIN[metal]] if metal in GRAIN else []
    # its grip, lit, lands on the grip's own colour: at that colour, its shaded side fell on the palette's blacks
    grip = _diffuse(materials.plain('hammer_grip', tuple(min(1.0, c * GRIP_LIFT) for c in lin(L['grip'])), rough=0.7))
    out = {'hammer_head': fpwarhammer.head_metal(dents, mottle, *grain), 'hammer_accent': accent, 'hammer_glow': glow,
           'hammer_grip': grip}
    if metal in HAFT:
        out['haft'] = fpwarhammer.shadowless(fpwarhammer.haft_wood(*(HAFT[metal] or ())))
        sleeve = (fpwarhammer.head_metal(dents, mottle, *grain, name='hammer_collar') if HAFT[metal] else
                  _diffuse(materials.plain('hammer_collar', (0.55, 0.55, 0.55), rough=0.8)))
        out['hammer_collar'] = fpwarhammer.shadowless(sleeve)
    return out


# silver's haft wrap on the palette's own navy (ART_PAL.COL 219, 109..103), brightness onto it: at its grip colour,
# lit, it fell on the palette's mauves and blacks
NAVY = [[[0.0, 15.0, 35.0, 60.0, 90.0, 130.0, 255.0], [20.0, 45.0, 65.0, 90.0, 115.0, 140.0, 175.0]],
        [[20.0, 45.0, 65.0, 85.0, 105.0, 125.0, 150.0, 175.0],
         [[24, 23, 23], [50, 62, 73], [52, 69, 87], [51, 77, 102], [45, 82, 122], [49, 90, 142], [55, 97, 154],
          [62, 105, 167]]]]
# elven's haft wrap on the elven leather's copper (armour.py ELVEN_COPPER), held down in its umbers: its pale grip,
# lit, rose to the copper's loud orange
WRAP = [[0.0, 40.0, 80.0, 130.0, 190.0, 255.0], [10.0, 28.0, 45.0, 70.0, 100.0, 130.0]]
# adamantium's shard dark as stone: its light down in the dark steels through most of it, only its glints pale
SHARD = [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0], [50.0, 70.0, 95.0, 120.0, 150.0, 190.0, 230.0]]


def own_grade(metal):
    """The grades of `metal`'s metal, by material, where the forge keeps it in its own colours, as its armour's plate is
    graded up close (armour.py `CLOSE_UP`): each frame's light share for share onto them, never grey, so the game lays
    no dye on it. Dwarven's head and sleeve its bronze, not the dye's lemon; adamantium's shard its polished steels, its
    band and sleeve the same steels lit pale, its points and bands gold; elven's gold, its wrap its leather's copper;
    daedric's blackened.
    Silver's, ebony's and orcish's are still grey for their dye, graded as their armour is (silver's down the band,
    ebony's black through most of its light, orcish's low on its ramp), silver's haft's wrap on the palette's navy and
    orcish's braided leather as its armour's leather.
    None where the forge leaves Daggerfall's grade."""
    import bpy  # noqa: F401  (armour.py reads mathutils, which Blender brings)
    import armour
    plate = lambda m: armour.CLOSE_UP[m]['grade']['plate']  # noqa: E731
    own = {
        'Dwarven': {'hammer_head': plate('Dwarven'), 'hammer_collar': plate('Dwarven')},
        'Elven': {'hammer_head': plate('Elven'), 'hammer_collar': plate('Elven'),
                  'hammer_grip': {'ramp': [*WRAP, *armour.ELVEN_COPPER]}},
        'Silver': {'hammer_head': plate('Silver'), 'hammer_collar': plate('Silver'),
                   'hammer_grip': {'ramp': [*NAVY[0], *NAVY[1]]}},
        'Ebony': {'hammer_head': plate('Ebony'), 'hammer_collar': plate('Ebony')},
        'Orcish': {'hammer_head': plate('Orcish'), 'hammer_collar': plate('Orcish'),
                   'hammer_grip': armour.CLOSE_UP['Orcish']['grade']['legging']},
        'Daedric': {'hammer_head': plate('Daedric'), 'hammer_collar': plate('Daedric')},
        'Adamantium': {'hammer_head': {**plate('Adamantium'), 'share': SHARD},
                       'hammer_collar': {**plate('Adamantium'), 'colours': armour.KNIGHT_STEEL},
                       'hammer_accent': {**plate('Adamantium'), 'colours': armour.ELVEN_GOLD}},
    }.get(metal)
    # by each face's tone, its texture laid back faint: a long shaded sleeve, stretched texel by texel onto the
    # colours, speckled with the render's noise
    return own and {n: {**g, 'detail': [5, 0.5, 2.5]} for n, g in own.items()}


def wield(metal):
    """Put `metal`'s warhammer in the first-person forge: its mesh, its materials, and its metal's own grade where it
    has one. Gives back what to restore."""
    import fpforge
    import fpmodel
    base, before, load = dict(fpmodel.WEAPONS['warhammer']), fpmodel.palette, fpforge.load
    fpmodel.WEAPONS['warhammer'] = {**base, 'parts': {'hammer': lambda S: part(S, metal)}, 'mats': MATS}
    fpmodel.palette = lambda: {**before(), **palette(metal)}
    own, classes = own_grade(metal), dict(fpforge.CLASSES)

    def graded(path):   # the metal's own grades, over every record's and frame's, each material graded as metal
        spec = load(path)
        fpforge.GRADE.update(own)
        for table in (*fpforge.RECORD_GRADE.values(), *fpforge.FRAME_GRADE.values()):
            table.update({n: g for n, g in own.items() if n in table})
        return spec
    if own:
        fpforge.load = graded
        fpforge.CLASSES.update({n: 5 for n in own if n in METAL})   # the grip is leather, graded as leather
    return base, before, load, classes


def main():
    import fpforge
    import fpmodel
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--metals', default=','.join(METALS))
    ap.add_argument('--samples', type=int, default=256)
    ap.add_argument('--wear-only', action='store_true', help="the frames' wear maps alone (fpwear.py)")
    ap.add_argument('--records', default='')
    ap.add_argument('--spec', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'WEAPON07.json'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for metal in [m for m in args.metals.split(',') if m]:
        work = tempfile.mkdtemp(prefix=f'fpwarhammer-{metal}-')
        saved = wield(metal)
        try:
            sys.argv = ['fpforge.py', '--spec', args.spec, '--out', work, '--samples', str(args.samples),
                        '--records', args.records, *(['--wear-only'] if args.wear_only else [])]
            fpforge.main()
        finally:
            fpmodel.WEAPONS['warhammer'], fpmodel.palette, fpforge.load, classes = saved
            fpforge.CLASSES.clear()
            fpforge.CLASSES.update(classes)
        fpwear.move(work, args.out, metal)
        print(f'{metal}: its frames into {args.out}', flush=True)


if __name__ == '__main__':
    main()
