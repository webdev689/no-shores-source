"""Each metal's own mace in first person (WEAPON05.CIF): its head's make, its collar and the dressing on its haft.

Daggerfall's own is maces.py's fitted mace, the frames every metal falls back to. Steel's is a smith's dressed work,
and each other metal is its culture's, in the language its warhammer and its long blade speak (fpwarhammers.py,
blades.py): its flanges cut in its motif, its collar, and its haft dressed as its warhammer's haft is. Each head fills
about the fitted flanges' box (maces.py `box`), so the fitted swings still hold it and a record drawn in a shape of its
own (the idle) keeps its proportions. The metal is rendered grey and the game dyes it, or graded in the forge's own
colours as the warhammer's is (`own_grade`); the bands, rivets and studs are matte in the metal's own colours
(metals.py `LOOK`).

    python -I tools/sprite-forge/fpmaces.py --out public/art/studio/forge/WEAPON05 [--metals Iron,Daedric]
        [--samples 128] [--records 1,2]

Writes `WEAPON05.CIF_<record>-<frame>_<Metal>.png` beside the forge's metal-less frames, which stay Daggerfall's. The
mace's space is maces.py's: its root at the origin where the hand holds the haft, the haft up +Z."""
import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import axes  # noqa: E402
import fpwarhammer  # noqa: E402
import fpwarhammers  # noqa: E402
import fpwear  # noqa: E402
import maces  # noqa: E402
from fpwarhammers import loft, lozenge, section, spike, stud, sweep, up  # noqa: E402

# the warhammer's materials' roles in its own order, so its haft's dressings (fpwarhammers.py) drop in as they are:
# the head, its sleeves, the wood, the fittings, the glow and the grip; then a flange's edge
MATS = ('macehead', 'mace_sleeve', 'macehaft', 'mace_accent', 'mace_glow', 'mace_grip', 'mace_edge')
HEAD, SLEEVE, HAFT, ACCENT, GLOW, GRIP, EDGE = range(len(MATS))
assert (fpwarhammer.HEAD, fpwarhammer.COLLAR, fpwarhammer.HAFT, fpwarhammers.ACCENT, fpwarhammers.GLOW,
        fpwarhammers.GRIP) == (HEAD, SLEEVE, HAFT, ACCENT, GLOW, GRIP)


# ---- the mace's sizes, read as the warhammer's dressings and the flanges' cut read them

def hammer(S):
    """The mace's haft in the warhammer's terms, for its dressings: the collar's foot where the warhammer's is, the
    head's foot on the collar's top, the girth there over the hand's, and nothing of the haft below the hand."""
    h0, ch = S['haft_len'], S['collar_h']
    top = h0 - ch
    return {'haft_len': top, 'collar_len': ch, 'collar_r': S['collar_r'], 'haft_r': S['haft_r'],
            'haft_taper': 1.0 + S.get('haft_taper', 0.0) * top / h0, 'haft_below': 0.0, 'ring_at': 0.03}


def at(S, s, t):
    """The point `s` of the way out from the flanges' join to their reach and `t` of the way up their box: (out, up)."""
    R0, reach, lo, hi = maces.box(S)
    return R0 + s * (reach - R0), lo + t * (hi - lo)


def turned(pieces, angle):
    """Pieces turned `angle` radians about the haft."""
    return [(maces._turned(v, angle), t, m) for v, t, m in pieces]


def round_about(pieces, n, phase=0.0):
    """`n` of the pieces, set evenly round the haft."""
    return [p for k in range(n) for p in turned(pieces, phase + 2 * np.pi * k / n)]


def flange(S, P, look=None, mat=HEAD, edge=False, seed=2.1, rough=0.0):
    """A flange standing out along +X, a plate (axes.py `plate`) cut to `P`: its corners from its foot to its top,
    each (out, up) in shares of the fitted box, joined to the core between its first and its last. `look` sets its
    thickness, bevel and facets over the fitted flange's; `rough` strays each corner by up to that share, by `seed`.
    With `edge`, its bevel is the edge's own material: a face turned more than a few degrees from the flat is the
    bevel's."""
    R0, reach, lo, hi = maces.box(S)
    P = np.asarray(P, dtype=np.float64)
    if rough:
        P = P + rough * np.random.default_rng(int(seed * 10)).uniform(-1.0, 1.0, P.shape) * (P[:, :1] > 0)
    t0, t1 = P[0, 1], P[-1, 1]
    cj = lo + 0.5 * (t0 + t1) * (hi - lo)
    pts = np.stack([R0 + P[:, 0] * (reach - R0), lo + P[:, 1] * (hi - lo) - cj], axis=1)
    T = {**S, 'ridge': 0.0, 'cheek': 0.0, 'veins': 0.0, **(look or {})}
    out = []
    for v, t, m in axes.plate(T, 1, np.array([0.0, cj]), pts, R0, (t1 - t0) * (hi - lo), seed=seed):
        if not edge:
            out.append((v, t, mat))
            continue
        n = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
        flat = np.abs(n[:, 1]) > 0.99 * np.linalg.norm(n, axis=1)
        out += [(v, t[flat], mat), (v, t[~flat], EDGE)]
    return out


def flanges(S, P, n, look=None, mat=HEAD, edge=False, phase=0.0, extra=None, rough=0.0):
    """`n` flanges cut to `P`, set evenly round the core, each its own facets' stray; `extra(S)` gives the pieces each
    flange carries (a stud, a boss), made along +X as the flange is."""
    return [p for k in range(n) for p in turned(flange(S, P, look, mat, edge, 2.1 + 0.9 * k, rough)
                                                + (extra(S) if extra else []), phase + 2 * np.pi * k / n)]


def lathe(z, r, mat, caps=(True, True)):
    """A turned piece up the haft: rings at heights `z`, radius `r`."""
    v, t = axes._lathe(np.asarray(z, float), np.asarray(r, float), caps=caps)
    return v, t, mat


def girth(S, z):
    """The haft's radius at height `z`."""
    return S['haft_r'] * (1.0 + S.get('haft_taper', 0.0) * np.clip(z / S['haft_len'], 0.0, 1.0))


def prism(z, r, sec, mat):
    """A faceted piece up the haft: section `sec` (unit) at each height `z`, scaled `r`."""
    return loft([up(a, sec, b) for a, b in zip(z, r)], mat)


def crystal(a, b, w, seed, mat, k=5):
    """A crystal from point `a` to its tip `b`: `k` faces round, each ring's corners and girth jittered so its facets
    break the light unevenly, broadest a third of the way out, `w` its half-width there."""
    rng = np.random.default_rng(seed)
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = (b - a) / np.linalg.norm(b - a)
    u = np.cross(d, [0.0, 0.0, 1.0] if abs(d[2]) < 0.9 else [1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    v = np.cross(d, u)
    th0 = np.linspace(0.0, 2 * np.pi, k, endpoint=False) + rng.uniform(-0.25, 0.25, k)
    rings = []
    for f, s in ((0.0, 0.75), (0.32, 1.0), (0.7, 0.62)):
        th, r = th0 + rng.uniform(-0.15, 0.15, k), w * s * rng.uniform(0.8, 1.15, k)
        c = a + (b - a) * f
        rings.append(c + np.outer(np.cos(th) * r, u) + np.outer(np.sin(th) * r, v))
    return loft(rings + [b[None]], mat)


# ---- the makes: each the head's pieces and its haft's dressing over the wooden haft

def _iron(S):
    """Forged iron, rough from the hammer: four thick, blunt flanges on a heavy core, a four-sided spike on top; a
    socket flaring into the head, nailed through its straps, and square bands down a dark haft."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    P = [(0.0, 0.06), (0.5, 0.0), (0.8, 0.1), (0.92, 0.45), (1.0, 0.82), (0.72, 1.0), (0.0, 0.97)]
    out = flanges(S, P, 4, {'bit_t': 2.0 * S['bit_t'], 'bevel': 0.2, 'facet_jitter': 0.45}, phase=np.pi / 4,
                  rough=0.05)
    rc = S['core_r'] * 1.2
    out.append(lathe([S['haft_len'] - 0.002, hi - 0.004], [rc, rc * 0.9], HEAD))
    out.append(spike(hi - 0.006, 0.038, 0.014, HEAD))
    return out + fpwarhammers._socket(H, length=0.03, strap=0.05) + fpwarhammers._bands(H, at=(0.12, 0.24))


def _steel(S):
    """Smith's steel, dressed: six squared flanges, each stepped out over a langet at its foot, its edge straight to a
    beak at its top, a boss on each face; a ring round the core under them and over them; a squared cap and a short
    point. Straps run down the haft from the head to three rings, and below them a cord winds it, studded. A departure:
    DFU's FPSWeapon draws Daggerfall's plain mace for steel, undyed; this is steel's own, as its warhammer is."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    P = [(0.0, 0.03), (0.4, 0.0), (0.46, 0.12), (0.8, 0.2), (0.86, 0.32), (0.86, 0.7), (1.0, 0.86), (1.04, 1.02),
         (0.55, 0.95), (0.0, 0.93)]

    def bosses(S):
        x, z = at(S, 0.6, 0.52)
        w = S['bit_t'] * 1.25
        return [fpwarhammers.boss(np.array([x, side * w, z]), side, 0.009, 0.004, HEAD) for side in (-1.0, 1.0)]
    out = flanges(S, P, 6, {'bit_t': 1.25 * S['bit_t'], 'bevel': 0.22, 'facet_jitter': 0.12}, extra=bosses)
    rc, zb = S['core_r'], S['haft_len']
    out.append(lathe([zb - 0.002, hi], [rc, rc * S['core_taper']], HEAD))
    sq = section('chamfer', 1.0, 1.0, 0.3)
    for z, r in ((zb + 0.006, 1.6), (hi - 0.012, 1.45)):   # the rings round the core, under the flanges and over them
        out.append(prism([z - 0.005, z + 0.005], [rc * r, rc * r], sq, HEAD))
    out.append(prism([hi - 0.006, hi + 0.004, hi + 0.012, hi + 0.016], [rc * 1.1, rc * 1.25, rc * 1.25, rc * 0.9], sq,
                     HEAD))
    out.append(spike(hi + 0.015, 0.022, 0.009, HEAD))
    return out + fpwarhammers._dressed(H, strap=0.1, rings=(0.12, 0.135, 0.15), wound=(0.17, 0.43), turns=3.0)


def _silver(S):
    """Silver, ornate: eight slim flanges round a ringed ball, each lobed down its edge to a scroll curling out at its
    top; a bead ring round the ball's foot and its top, and a slender spike from an orb. The haft wears an engraved
    sleeve, ringed, and below it a navy wrap with a silver wire wound over it."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    P = [(0.0, 0.06), (0.42, 0.0), (0.56, 0.1), (0.52, 0.26), (0.62, 0.44), (0.7, 0.6), (0.88, 0.7), (1.03, 0.8),
         (1.06, 0.94), (0.96, 1.03), (0.82, 1.0), (0.8, 0.9), (0.66, 0.88), (0.0, 0.92)]
    out = flanges(S, P, 8, {'bit_t': 0.75 * S['bit_t'], 'bevel': 0.3, 'facet_jitter': 0.0, 'ridge': 0.4})
    zb, rc = S['haft_len'], S['core_r']
    u = np.linspace(-np.pi / 2, np.pi / 2, 12)
    mid, R = 0.5 * (zb + hi), 0.5 * (hi - zb)
    out.append(lathe(mid + R * np.sin(u), rc * 0.9 + rc * 0.75 * np.cos(u), HEAD))   # the ball
    bead = np.array([0.0, 0.5, 0.86, 1.0, 0.86, 0.5, 0.0])
    for z, r in ((zb + 0.006, rc * 1.45), (mid, rc * 1.75), (hi - 0.004, rc * 1.3)):
        out.append(lathe(z + np.linspace(-0.004, 0.004, 7), r + 0.0035 * bead, HEAD))
    out.append(lathe(hi + 0.009 + 0.009 * np.sin(u), 0.009 * np.cos(u) + 1e-5, HEAD))   # the orb
    out.append(spike(hi + 0.015, 0.055, 0.0075, HEAD, sides='round'))
    return out + fpwarhammers._wrapped(H, sleeve=0.11, turns=5.0)


def _elven(S):
    """Elven, a bird of prey: six wings swept up round a slim core, each stepped in feathers down its outer edge to a
    long tip above the head; a leaf standing on top. A long sleeve flares into the head, a leaf raised on each side,
    and below it the haft is wrapped and bound in a lattice of gold."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    P = [(0.0, 0.0), (0.28, 0.0), (0.36, 0.14), (0.52, 0.16), (0.6, 0.34), (0.76, 0.38), (0.84, 0.58), (0.98, 0.64),
         (1.06, 0.9), (1.1, 1.16), (0.72, 0.98), (0.36, 0.86), (0.0, 0.8)]
    out = flanges(S, P, 6, {'bit_t': 0.85 * S['bit_t'], 'bevel': 0.3, 'facet_jitter': 0.0, 'ridge': 0.4})
    zb, rc = S['haft_len'], S['core_r']
    out.append(lathe([zb - 0.002, hi - 0.01], [rc * 0.9, rc * 0.7], HEAD))
    z0 = hi - 0.014
    out.append(loft([up(z0, lozenge(0.004, 0.003)), up(z0 + 0.02, lozenge(0.012, 0.0035)),
                     up(z0 + 0.036, lozenge(0.009, 0.003)), np.array([[0.0, 0.0, z0 + 0.058]])], HEAD))
    return out + fpwarhammers._leafed(H, sleeve=0.12, turns=4.0)


def _dwarven(S):
    """Dwarven work, symmetric and engineered: an eight-sided core, four thick flanges each a block stepped out from a
    neck at its foot and its top, a bolt through its middle, and a broad rim round the necks at each end; a stepped
    cap. The haft is sheathed in the metal, collared and studded."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    P = [(0.0, 0.0), (0.6, 0.0), (0.6, 0.12), (1.0, 0.12), (1.0, 0.88), (0.6, 0.88), (0.6, 1.0), (0.0, 1.0)]

    def bolts(S):
        x, z = at(S, 0.8, 0.5)
        w = S['bit_t'] * 2.5
        return [stud(np.array([x, side * w, z]), [0.0, side, 0.0], 0.0055, 0.004, ACCENT) for side in (-1.0, 1.0)]
    out = flanges(S, P, 4, {'bit_t': 2.6 * S['bit_t'], 'bevel': 0.08, 'facet_jitter': 0.0}, extra=bolts)
    zb, rc = S['haft_len'], S['core_r'] * 1.35
    octa = section('chamfer', 1.0, 1.0, 0.42)
    out.append(prism([zb - 0.002, hi], [rc, rc], octa, HEAD))
    for t in (0.06, 0.94):   # its drums' rims, round the flanges' necks
        r, z = R0 + 0.66 * (reach - R0), lo + t * (hi - lo)
        out.append(prism([z - 0.007, z - 0.005, z + 0.005, z + 0.007], [r * 0.94, r, r, r * 0.94], octa, HEAD))
    out.append(prism([hi, hi + 0.008, hi + 0.008, hi + 0.016, hi + 0.016, hi + 0.022],
                     [rc * 1.0, rc * 1.0, rc * 0.7, rc * 0.7, rc * 0.42, rc * 0.36], octa, HEAD))
    return out + fpwarhammers._sheathed(H, collars=(0.03, 0.22), studs=0.045)


def _mithril(S):
    """Light and keen: six thin flanges, each a crescent horned at its foot and its top, a blue band round the core
    over them; an orb and a tall spike on top. Its collar banded blue at both ends."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    P = [(0.0, 0.1), (0.5, 0.04), (1.02, -0.06), (0.78, 0.16), (0.64, 0.36), (0.6, 0.55), (0.66, 0.76), (1.06, 1.04),
         (0.5, 0.97), (0.0, 0.9)]
    out = flanges(S, P, 6, {'bit_t': 0.65 * S['bit_t'], 'bevel': 0.3, 'facet_jitter': 0.0, 'ridge': 0.5})
    zb, rc = S['haft_len'], S['core_r']
    out.append(lathe([zb - 0.002, hi], [rc * 0.9, rc * 0.75], HEAD))
    out.append(lathe([hi - 0.016, hi - 0.004], [rc * 1.3, rc * 1.3], ACCENT))
    u = np.linspace(-np.pi / 2, np.pi / 2, 12)
    out.append(lathe(hi + 0.01 + 0.011 * np.sin(u), 0.011 * np.cos(u) + 1e-5, HEAD))
    out.append(spike(hi + 0.018, 0.065, 0.009, HEAD))
    return out + fpwarhammers._collar(H, 'banded')


def _adamantium(S):
    """The mountain's heart: a dark crystal rising from the haft, five shards of it standing out round it and five
    smaller between, held at its foot by a gold-crowned band, gold points rising round it. The haft is sheathed pale,
    banded in gold, dark stones set round it under the head."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    zb = S['haft_len']
    out = [crystal((0.0, 0.0, zb), (0.0, 0.0, hi + 0.032), 0.024, 11, HEAD, k=7)]
    for k in range(5):
        a = 2 * np.pi * k / 5
        x0, z0 = at(S, 0.0, 0.3)
        x1, z1 = at(S, 1.02, 0.78)
        out += turned([crystal((x0, 0.0, z0), (x1, 0.0, z1), 0.016, 20 + k, HEAD)], a)
        x1, z1 = at(S, 0.82, 0.22)
        out += turned([crystal((x0, 0.0, z0), (x1, 0.0, z1), 0.012, 40 + k, HEAD)], a + np.pi / 5)
    rb = S['core_r'] * 1.7
    out.append(lathe([zb - 0.002, zb, zb + 0.016, zb + 0.018], [rb * 0.9, rb, rb, rb * 0.92], ACCENT))
    for j in range(8):   # its crown: gold points rising round its rim
        t = 2 * np.pi * (j + 0.5) / 8
        r = np.array([np.cos(t), np.sin(t), 0.0])
        out.append(stud(np.array([0.0, 0.0, zb + 0.016]) + r * rb * 0.92, [r[0] * 0.3, r[1] * 0.3, 1.0], 0.005,
                        0.022, ACCENT))
    top = H['haft_len']
    out += fpwarhammers._sheathed(H, collars=(0.03, 0.2, top - 0.05), studs=None, bands=ACCENT)
    for z in (top - 0.09, top - 0.12):   # dark stones set round the haft, between its gold bands
        g = girth(S, z) * 1.08
        out += [stud(np.array([np.cos(t) * g, np.sin(t) * g, z]), [np.cos(t), np.sin(t), 0.0], 0.0055, 0.0035, HEAD)
                for t in np.arange(4) * np.pi / 2 + np.pi / 4]
    return out


def _ebony(S):
    """Ebony, black glass worked sharp: seven blades round a faceted core, each sweeping up to a long point above the
    head, a barb jutting low on its edge, black flats in bright bevels; a tall faceted spike on top. An engraved
    sleeve, ringed and wound with wire, runs down the haft from the head; below it the haft is sheathed black."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    P = [(0.0, 0.02), (0.42, 0.0), (0.6, 0.14), (0.95, 0.1), (0.78, 0.32), (0.86, 0.58), (1.08, 1.14), (0.62, 0.84),
         (0.42, 0.86), (0.0, 0.84)]
    out = flanges(S, P, 7, {'bit_t': 1.15 * S['bit_t'], 'bevel': 0.4, 'facet_jitter': 0.1}, edge=True)
    zb, rc = S['haft_len'], S['core_r']
    out.append(prism([zb - 0.002, hi - 0.01, hi], [rc, rc * 0.85, rc * 0.6], section('hex', 1.0, 1.0), HEAD))
    out.append(spike(hi - 0.012, 0.07, 0.01, HEAD))
    return out + fpwarhammers._engraved(H, sleeve=0.12, turns=3.0)


def _orcish(S):
    """Orcish, crude and cruel: five heavy claws round a thick core, each rising out and hooking down at its tip, a
    rivet on the core between them; a flared cap and a thick tooth on top. A broad sleeve, ridged and riveted, runs
    down the haft from the head to a tuft of fur; below it the haft is bound in braided leather."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    P = [(0.0, 0.3), (0.35, 0.28), (0.62, 0.42), (0.84, 0.38), (0.98, 0.24), (1.06, 0.12), (1.13, 0.38), (1.05, 0.62),
         (0.8, 0.85), (0.45, 0.98), (0.0, 0.95)]
    out = flanges(S, P, 5, {'bit_t': 1.6 * S['bit_t'], 'bevel': 0.3, 'facet_jitter': 0.25, 'ridge': 0.3})
    zb, rc = S['haft_len'], S['core_r'] * 1.25
    out.append(lathe([zb - 0.002, hi - 0.006], [rc, rc * 0.9], HEAD))
    for k in range(5):   # a rivet on the core between each two claws
        t = 2 * np.pi * (k + 0.5) / 5
        r = np.array([np.cos(t), np.sin(t), 0.0])
        out.append(stud(r * rc * 0.95 + [0.0, 0.0, 0.5 * (lo + hi)], r, 0.0055, 0.005, ACCENT))
    out.append(lathe([hi - 0.008, hi + 0.004, hi + 0.01, hi + 0.012], [rc * 0.85, rc * 1.25, rc * 1.4, rc * 1.1],
                     HEAD))
    out.append(spike(hi + 0.01, 0.03, 0.012, HEAD, sides='hex'))
    return out + fpwarhammers._bound(H, sleeve=0.08, turns=6.0)


def _daedric(S):
    """Daedric: a cage of five black claws bowing out from the collar round a glowing core and curling in to their
    points over it, a barb jutting from each; a toothed spike on top. The haft is sheathed black, banded and studded
    down each side."""
    H = hammer(S)
    R0, reach, lo, hi = maces.box(S)
    zb = S['haft_len']
    u = np.linspace(-np.pi / 2, np.pi / 2, 12)
    mid, R = 0.5 * (zb + hi), 0.46 * (hi - zb)
    out = [lathe(mid + R * np.sin(u), 0.55 * reach * np.cos(u) + 1e-5, GLOW)]
    claw = [(0.016, zb + 0.004), (0.4, 0.18), (0.82, 0.42), (0.92, 0.62), (0.7, 0.86), (0.34, 1.04), (0.06, 1.12)]
    pts = [np.array([c[0], 0.0, c[1]]) if k == 0 else np.array([at(S, c[0], c[1])[0], 0.0, at(S, c[0], c[1])[1]])
           for k, c in enumerate(claw)]
    barb_at = np.array([at(S, 0.86, 0.5)[0], 0.0, at(S, 0.86, 0.5)[1]])
    one = [sweep(pts, [0.009, 0.01, 0.01, 0.009, 0.0075, 0.005, 0.0], [0.012, 0.015, 0.015, 0.013, 0.01, 0.006, 0.0],
                 HEAD, n=6, across=(0.0, 1.0, 0.0)),
           stud(barb_at, [1.0, 0.0, -0.5], 0.008, 0.024, HEAD)]
    out += round_about(one, 5)
    z0 = at(S, 0.0, 1.06)[1]
    out.append(spike(z0, 0.06, 0.011, HEAD, lean=0.0))
    for k in range(3):   # its teeth, up each side of the spike
        for side in (-1.0, 1.0):
            z = z0 + 0.012 + 0.012 * k
            w = 0.011 * (1.0 - 0.55 * (z - z0) / 0.06)
            out.append(stud(np.array([side * w * 0.9, 0.0, z]), [side, 0.0, 0.8], 0.003, 0.009, HEAD))
    return out + fpwarhammers._sheathed(H, collars=(0.03, 0.17, 0.32), studs=0.05)


DESIGNS = {'Iron': _iron, 'Steel': _steel, 'Silver': _silver, 'Elven': _elven, 'Dwarven': _dwarven, 'Mithril': _mithril,
           'Adamantium': _adamantium, 'Ebony': _ebony, 'Orcish': _orcish, 'Daedric': _daedric}
METALS = tuple(DESIGNS)


def part(S, metal):
    """`metal`'s mace: the fitted wooden haft under its own head, collar and dressing. (vertices, triangles, material a
    triangle)"""
    from fpmodel import _join
    h0 = S['haft_len']
    z = np.linspace(0.0, h0 + 0.004, 24)
    haft = lathe(z, girth(S, z), HAFT, caps=(True, False))
    return _join([haft] + DESIGNS[metal](S))


# the warhammer's materials, each the mace's own of its role
ROLE = {'hammer_head': 'macehead', 'hammer_collar': 'mace_sleeve', 'hammer_accent': 'mace_accent',
        'hammer_glow': 'mace_glow', 'hammer_grip': 'mace_grip'}
METAL = ('macehead', 'mace_sleeve', 'mace_accent', 'mace_edge')   # graded as metal where a make keeps its own grade
# a glowing core's light, set against each render's exposure (a record's own, the idle's far below the rest) so the
# core is one deep red in every frame: lit as its warhammer's, in the mace's lights it fell to a dull brown
GLOW_LIGHT = 8.0
# orcish's braided leather held darker than its warhammer's grade: the mace's lamp lights its haft full, and the
# leather rose to a pale tan
GRIP_GRADE = {'Orcish': {'lum': [[0.0, 10.0, 25.0, 50.0, 90.0, 255.0], [0.0, 22.0, 34.0, 46.0, 60.0, 104.0]]}}
# ebony's bevels in the top of the band, where its dye is its palest grey: black flats in bright bevels, as its sword's
EDGE_GRADE = {'Ebony': {'share': [[1.0, 50.0, 99.0], [150.0, 200.0, 232.0]], 'detail': [5, 0.5, 2.5]}}


def palette(metal):
    """`metal`'s mace materials over the fitted mace's: its fittings, glow and grip as its warhammer's
    (fpwarhammers.py `palette`), each under the mace's name for its role; its sleeves and a flange's edge smooth, as
    the fitted head's metal is, the sleeves casting no shadow; iron's haft its warhammer's dark wood. The head keeps
    the fitted mace's smooth iron: the warhammer's hammered metal, on a flange's broad faces, broke into blotches."""
    import materials
    from fpmodel import _diffuse
    own = fpwarhammers.palette(metal)
    out = {ROLE[n]: own[n] for n in ('hammer_accent', 'hammer_glow', 'hammer_grip')}
    out['mace_sleeve'] = fpwarhammer.shadowless(_diffuse(materials.plain('mace_sleeve', (0.57, 0.57, 0.57), rough=0.8)))
    out['mace_edge'] = axes.iron('mace_edge', dark=(0.566, 0.566, 0.566), light=(0.574, 0.574, 0.574), dent=0.02)
    if metal == 'Iron':
        out['macehaft'] = own['haft']
    return out


def glowing(m):
    """Hold material `m`'s glow against each render's exposure: every render's lights set, its strength set again."""
    import fpstage
    strength, lit = m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'], fpstage.set_lights

    def lights(light=None):
        lit(light)
        strength.default_value = GLOW_LIGHT * 2.0 ** -(light or fpstage.LIGHT).get('exposure', 0.0)
    fpstage.set_lights = lights


def own_grade(metal):
    """The grades of `metal`'s metal by the mace's materials where the forge keeps it in its own colours, or grey graded
    as its armour is: its warhammer's (fpwarhammers.py `own_grade`), and ebony's edges pale. None where the forge
    keeps the fitted mace's grade."""
    own = fpwarhammers.own_grade(metal)
    if not own:
        return None
    out = {ROLE[n]: g for n, g in own.items()}
    out.update(EDGE_GRADE.get(metal, {}))
    if metal in GRIP_GRADE:
        out['mace_grip'] = GRIP_GRADE[metal]
    return out


def wield(metal):
    """Put `metal`'s mace in the first-person forge: its mesh, its materials, and its grades. Each sleeve and edge is
    graded as the head is in each frame; a metal in its own colours, or grey graded as its armour is, as its
    warhammer's. Gives back what to restore."""
    import fpforge
    import fpmodel
    import fpstage
    base, before, load, lights = dict(fpmodel.WEAPONS['mace']), fpmodel.palette, fpforge.load, fpstage.set_lights
    fpmodel.WEAPONS['mace'] = {**base, 'parts': {'mace': lambda S: part(S, metal)}, 'mats': MATS}
    own, classes = own_grade(metal) or {}, dict(fpforge.CLASSES)

    def mats():
        out = palette(metal)
        if metal in fpwarhammers.CORE:
            glowing(out['mace_glow'])
        return {**before(), **out}
    fpmodel.palette = mats

    def graded(path):
        spec = load(path)
        tables = (fpforge.GRADE, *fpforge.RECORD_GRADE.values(), *fpforge.FRAME_GRADE.values())
        for table in tables:
            if 'macehead' in table:
                table['mace_sleeve'] = table['mace_edge'] = table['macehead']
        fpforge.GRADE.update(own)
        for table in tables[1:]:
            table.update({n: g for n, g in own.items() if n in table})
        return spec
    fpforge.load = graded
    fpforge.CLASSES.update({'mace_sleeve': 5, 'mace_edge': 5, **{n: 5 for n in own if n in METAL}})
    return base, before, load, lights, classes


def main():
    import fpforge
    import fpmodel
    import fpstage
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--metals', default=','.join(METALS))
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--wear-only', action='store_true', help="the frames' wear maps alone (fpwear.py)")
    ap.add_argument('--records', default='')
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument('--spec', default=os.path.join(here, 'specs', 'WEAPON05.json'))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for metal in [m for m in args.metals.split(',') if m]:
        work = tempfile.mkdtemp(prefix=f'fpmace-{metal}-')
        saved = wield(metal)
        try:
            sys.argv = ['fpforge.py', '--spec', args.spec, '--out', work, '--samples', str(args.samples),
                        '--records', args.records, *(['--wear-only'] if args.wear_only else [])]
            fpforge.main()
        finally:
            fpmodel.WEAPONS['mace'], fpmodel.palette, fpforge.load, fpstage.set_lights, classes = saved
            fpforge.CLASSES.clear()
            fpforge.CLASSES.update(classes)
        fpwear.move(work, args.out, metal)
        print(f'{metal}: its frames into {args.out}', flush=True)


if __name__ == '__main__':
    main()
