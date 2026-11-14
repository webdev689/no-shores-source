"""The first-person forge's shields (Shield Widget's TEXTURE.112360 to 112363: the Buckler, the Round, the Kite and the
Tower), each held in the left hand as fptorch.py holds the torch: the fist closed on a handle along the part's +Z through
its root, the back of the hand toward the shield and the curled fingers toward the eye.

An arm shield (the Round, the Kite, the Tower) lies along the forearm: its inside is a plane holding the handle and
the forearm, a little behind both on the back of the hand's side, its boards bowed away from the eye. A strap over the forearm near the elbow and the
handle's two mounts are riveted to it. A buckler is a metal dish held by a bar across the hollow of its boss. So the
arm and the shield are one rigid part: only its place before the eye moves, frame by frame, as the shield is raised
and lowered.

A shield's metal (its rim, its rivets and mounts, a buckler's dish) is graded as its armour set's plate is up close
(`variant_grade`): grey where the game dyes it by the shield's material, its own colours where its set has them. Its wear is a tier (`tier`, 0 to 2: Shield Widget's three condition tiers): a worn shield has lost a bite of
its edge, a battered one three, splintered, the rim gone where they are."""
import math

import numpy as np

import fparm
import fptorch

KINDS = ('buckler', 'round', 'kite', 'tower')
ARCHIVES = {'buckler': 112360, 'round': 112361, 'kite': 112362, 'tower': 112363}
TIER_RECORDS = (0, 10, 20)   # Shield Widget's condition tiers, ten records apart
OWN = ('planks', 'rim', 'strap', 'grip', 'rivet', 'dish', 'facing', 'seam', 'pale')
CLASSES = {'planks': 1, 'rim': 5, 'strap': 1, 'grip': 1, 'rivet': 5, 'dish': 5, 'facing': 5, 'seam': 1, 'pale': 1}
GRADE_AS = {'facing': 'dish', 'pale': 'planks'}   # a design's own materials graded as these are
SHEETS = OWN   # the boards are seen from inside the shield: a layer drawing only its own faces would drop them
JOINTS = ()
AXIS = 0.25   # metres up the handle's axis a pose aims along

SHAPE = {
    'focal': 300.0, 'aspect': 1.0,
    'hand': 1.4, 'fist': 1.0, 'arm_r': 1.1, 'cuff': 1.8, 'thumb': 1.0,
    'handle_r': 0.016, 'tier': 0, 'strap_at': 0.5, 'handle_half': 0.07, 'strap_reach': 0.0, 'e_bend': 40.0, 'e_swing': 0.0,
    # each kind: its size (a radius, or a width and a height), how far its boards bow, where its middle lies from the
    # fist (along the forearm `cf`, along the handle `cz`), its turn in its own plane, and the forearm's lean at the wrist
    'buckler_r': 0.17, 'buckler_bulge': 0.025, 'buckler_boss_r': 0.08, 'buckler_boss_d': 0.075, 'buckler_lean': -20.0,
    'buckler_cf': 0.0, 'buckler_cz': 0.0, 'buckler_tilt': 0.0,
    'round_r': 0.23, 'round_bulge': 0.03, 'round_cf': 0.08, 'round_cz': -0.02, 'round_tilt': 45.0, 'round_lean': -20.0,
    'kite_w': 0.44, 'kite_h': 0.62, 'kite_bulge': 0.03, 'kite_cf': 0.1, 'kite_cz': -0.08, 'kite_tilt': 45.0,
    'kite_lean': -20.0,
    'tower_w': 0.55, 'tower_h': 0.9, 'tower_bulge': 0.05, 'tower_cf': 0.1, 'tower_cz': -0.15, 'tower_tilt': 45.0,
    'tower_lean': -20.0,
}
SHAPE_STEP = {**fptorch.SHAPE_STEP, **fptorch.BEND_STEP, 'strap_at': 0.04, 'handle_half': 0.008, 'strap_reach': 0.008, 'buckler_r': 0.01, 'buckler_boss_r': 0.005, 'round_r': 0.01, 'kite_w': 0.015,
              'kite_h': 0.02, 'tower_w': 0.015, 'tower_h': 0.02, **{f'{k}_cf': 0.01 for k in KINDS},
              **{f'{k}_cz': 0.01 for k in KINDS}, **{f'{k}_tilt': 4.0 for k in KINDS},
              **{f'{k}_lean': 4.0 for k in KINDS}, **{f'{k}_bulge': 0.005 for k in KINDS}}
BOUNDS = {**fptorch.BOUNDS, **fptorch.BEND_BOUNDS, 'strap_at': (0.15, 0.8), 'handle_half': (0.05, 0.16), 'strap_reach': (0.0, 0.08), 'buckler_r': (0.12, 0.3), 'buckler_boss_r': (0.05, 0.11), 'round_r': (0.2, 0.45),
          'kite_w': (0.35, 0.75), 'kite_h': (0.5, 1.0), 'tower_w': (0.45, 0.85), 'tower_h': (0.75, 1.4),
          **{f'{k}_cf': (-0.1, 0.3) for k in KINDS}, **{f'{k}_cz': (-0.4, 0.2) for k in KINDS},
          **{f'{k}_tilt': (-90.0, 90.0) for k in KINDS}, **{f'{k}_lean': (-35.0, 20.0) for k in KINDS},
          **{f'{k}_bulge': (0.0, 0.08) for k in KINDS}}

THICK = 0.012    # the boards' thickness
BOLT = 0.011     # a bolt head's radius: broad, as the mod's are
RIM_R = 0.011    # the rim's round edge
RINGS, ROUND = 14, 240   # rings out from the middle, and points round the edge (enough for a design's spikes)
LATHE = 0.006    # a buckler's raised ring, spun into its dish (metres high), and where it runs (a share of its reach)
LATHE_AT = 0.68
FOLD = 0.04      # how far a folded face's ridges stand above its valleys at the rim, metres


# -- each metal's make: what the inside shows of it. `rim` its girth, `section` its cut (round, flat, square); `nails`
# round the inside of the rim (`pairs` two a time); `bands` of half-round iron across the inside, ends in shares of the
# half-width and half-height (`band_w` their half-width, metres), riveted along; `ribs` tapering from the middle out;
# `facets`, its face cut flat in planes as black glass is; `rings` round it; a `bead` inside the rim; `blades`
# hooked round it, fire in the groove beside each; an `almond` of two arcs about the arm; iron `spikes` driven out
# through the rim; `body` its inside's
# material; `edge` its outline (a style, how many, how deep a share). Leather and chain are the plain wooden shield.
DESIGNS = {
    'Iron': {'rim': 1.0, 'nails': 16, 'band_w': 0.022, 'bands': (((-1.0, -0.42), (1.0, -0.42)), ((-1.0, 0.42), (1.0, 0.42)))},
    # steel after its reference's front, kept clean: boards in a slim rim, its domed boss's hollow held by four rivets
    # (`dome`), and its two braided loops echoed as two clean bands along their ovals (`loops`: middle across and up,
    # half-width, half-height, shares). No nails: a rivet a loop's length read as bolts strewn over it
    'Steel': {'rim': 0.9, 'dome': (0.0, 0.0, 0.3), 'dome_rivets': 4,
              'loops': ((-0.42, 0.0, 0.44, 0.86), (0.42, 0.0, 0.44, 0.86))},
    # silver's all metal, as its reference's front: a thick raised rim, its inner disc's and its boss's rings, and the
    # rivets of the cross on its face in four rows out from the boss (`ray_rivets`: rows, the first's angle, a row's)
    'Silver': {'rim': 1.0, 'body': 'dish', 'rings': (0.2, 0.46), 'ray_rivets': (4, 45.0, 4), 'nails': 8},
    'Elven': {'rim': 0.8, 'body': 'pale', 'edge': ('scallop', 10, 0.04), 'bead': 0.88, 'almond': True},
    # dwarven after its reference: flanges swept up at its top corners, drawn to a point at its foot (`flanges`); from
    # inside, its dome's hollow near the top (`dome`: across, up, its radius, shares of the half-width and -height),
    # the riveted spine down from it and a fluted rib either side
    'Dwarven': {'rim': 1.1, 'body': 'dish', 'edge': ('flanges', 0, 0.14), 'nails': 14,
                'dome': (0.0, 0.4, 0.26), 'band_w': 0.018,
                'bands': (((0.0, 0.14), (0.0, -0.95)),),
                'flutes': (((-0.42, 0.25), (-0.24, -0.85)), ((0.42, 0.25), (0.24, -0.85)))},
    'Mithril': {'rim': 0.9, 'body': 'facing', 'ribs': 8},
    'Adamantium': {'rim': 1.0, 'body': 'facing', 'edge': ('facet', 9, 0.0), 'rings': (0.5, 0.78)},
    # ebony after its reference: a bat-winged outline, two horns either side of a notch at its top, a spike at each
    # side over a notch, a point at its foot (`wings`); from inside, its V of bands (`vee`, clean: no rivets), its
    # dome's ring near the top, its face cut in planes as black glass is
    'Ebony': {'rim': 0.9, 'body': 'dish', 'edge': ('wings', 0, 0.24), 'facets': 8, 'dome': (0.0, 0.5, 0.22),
              'band_w': 0.014, 'band_rivets': False, 'bands': (((-0.78, 0.42), (0.0, -0.62)), ((0.78, 0.42), (0.0, -0.62)))},
    'Orcish': {'rim': 1.15, 'crude': True, 'spikes': 8, 'nails': 10, 'band_w': 0.022,
               'bands': (((-1.0, -0.28), (1.0, -0.5)), ((-1.0, 0.48), (1.0, 0.3)))},
    'Daedric': {'rim': 1.0, 'body': 'facing', 'edge': ('horn', 6, 0.16), 'blades': 4},
}
METALS = tuple(DESIGNS)


def design(S):
    """The make of the metal the shield is drawn in (`design`), or the plain one's."""
    return DESIGNS.get(S.get('design')) or {}


def held_radius(S):
    return S['handle_r']


def mats(armour=None):
    return fptorch.mats(armour, OWN)


# -- the outline, in the shield's own plane: x across, y up, its middle the origin


def _polygon(kind, S):
    """The shield's outline as a dense loop of points, counter-clockwise."""
    t = np.linspace(0.0, 2 * np.pi, ROUND, endpoint=False)
    if kind in ('buckler', 'round'):
        r = S[f'{kind}_r']
        return np.stack([r * np.cos(t), r * np.sin(t)], axis=1)
    w, h = S[f'{kind}_w'] / 2, S[f'{kind}_h'] / 2
    pts = []
    if kind == 'kite':   # a heater: a flat top, straight sides a third of the way down, then curving to a point
        knee = h * 0.35
        for y in np.linspace(h, -h, 60):   # the right side, down
            u = np.clip((knee - y) / (knee + h), 0.0, 1.0)
            pts.append((w * math.cos(math.pi / 2 * u ** 1.25) if y < knee else w, y))
        for y in np.linspace(-h, h, 60)[1:-1]:   # the left, up
            u = np.clip((knee - y) / (knee + h), 0.0, 1.0)
            pts.append((-(w * math.cos(math.pi / 2 * u ** 1.25) if y < knee else w), y))
    else:   # a tower: straight sides, a flat foot, its top an arch
        arch = h * 0.16
        for y in np.linspace(h - arch, -h, 40):
            pts.append((w, y))
        for x in np.linspace(w, -w, 30)[1:-1]:
            pts.append((x, -h))
        for y in np.linspace(-h, h - arch, 40):
            pts.append((-w, y))
        for x in np.linspace(-w, w, 40)[1:-1]:
            pts.append((x, h - arch + arch * (1.0 - (x / w) ** 2) ** 0.5))
    pts = np.asarray(pts[::-1] if kind == 'kite' else pts, float)
    return _resample(pts)


def _resample(pts):
    """A loop's points as ROUND rays from its middle (the origin) meet it: (x, y) at each ray's angle."""
    out = []
    for a in np.linspace(0.0, 2 * np.pi, ROUND, endpoint=False):
        d = np.array([math.cos(a), math.sin(a)])
        best = None
        for p, q in zip(pts, np.roll(pts, -1, axis=0)):
            e = q - p
            den = d[0] * -e[1] - d[1] * -e[0]
            if abs(den) < 1e-12:
                continue
            s = (p[0] * -e[1] - p[1] * -e[0]) / den
            u = (d[0] * p[1] - d[1] * p[0]) / den
            if s > 0 and -1e-9 <= u <= 1 + 1e-9 and (best is None or s < best):
                best = s
        out.append(d * (best if best is not None else 0.0))
    return np.asarray(out)


# each tier's bites out of the edge: (the ray's angle, its half-width in radians, its depth over the shield's reach)
BITES = {0: (), 1: ((math.radians(52), 0.2, 0.2),),
         2: ((math.radians(52), 0.22, 0.22), (math.radians(108), 0.26, 0.28), (math.radians(150), 0.12, 0.12))}


def _edged(kind, S, pts):
    """The outline in its metal's edge: scallops (a leaf's), shards and spikes standing out of it, horns hooked one way,
    or a round one cut in facets."""
    style, n, depth = design(S).get('edge') or (None, 0, 0.0)
    if style is None or (style == 'facet' and kind not in ('buckler', 'round')):
        return pts
    ang = np.arctan2(pts[:, 1], pts[:, 0])
    phase = (ang / (2 * np.pi) * n + 0.25) % 1.0
    if style == 'scallop':   # arcs bowed out between notches
        k = 1.0 - depth * (1.0 - np.sqrt(np.clip(1.0 - (2 * phase - 1) ** 2, 0.0, 1.0)))
    elif style == 'spike':   # narrow points standing out of a plain edge
        k = 1.0 + depth * np.clip(1.0 - np.abs(2 * phase - 1) / 0.3, 0.0, 1.0)
    elif style == 'shard':   # broken glass: points of every height
        tall = np.random.default_rng(13).uniform(0.35, 1.0, n)[np.floor((ang / (2 * np.pi) * n + 0.25) % n).astype(int)]
        k = 1.0 + depth * tall * (1.0 - np.abs(2 * phase - 1)) ** 1.6
    elif style == 'flanges':   # dwarven: a flange swept up at each top corner, and its foot drawn to a point
        near = lambda a, w: np.exp(-(((ang - a + np.pi) % (2 * np.pi) - np.pi) / w) ** 2)   # noqa: E731
        k = 1.0 + depth * (near(np.pi / 2 - 0.78, 0.2) + near(np.pi / 2 + 0.78, 0.2)) + 0.8 * depth * near(-np.pi / 2, 0.4)
    elif style == 'wings':   # ebony: horns either side of a notch at the top, a spike over a notch at each side,
        near = lambda a, w: np.exp(-(((ang - a + np.pi) % (2 * np.pi) - np.pi) / w) ** 2)   # noqa: E731  a point at
        k = (1.0 + depth * (near(np.pi / 2 - 0.34, 0.09) + near(np.pi / 2 + 0.34, 0.09)                 # its foot
                            - 0.9 * near(np.pi / 2, 0.12)
                            + 0.9 * (near(0.14, 0.07) + near(np.pi - 0.14, 0.07))
                            - 0.6 * (near(-0.22, 0.07) + near(np.pi + 0.22, 0.07))
                            + 0.8 * near(-np.pi / 2, 0.3)))
    elif style == 'horn':   # rising slowly, falling sheer: hooked all one way round
        k = 1.0 + depth * np.where(phase < 0.82, (phase / 0.82) ** 2.2, (1.0 - phase) / 0.18)
    else:   # facets: the circle's points the corners, its flats inside them
        k = math.cos(math.pi / n) / np.cos((phase - 0.5) * 2 * math.pi / n)
    return pts * k[:, None]


def bitten(kind, S):
    """The outline in its metal's edge with its tier's bites out of it, splintered: (points, whether the rim still runs
    at each)."""
    pts = _edged(kind, S, _polygon(kind, S))
    ang = np.arctan2(pts[:, 1], pts[:, 0]) % (2 * np.pi)
    r = np.linalg.norm(pts, axis=1)
    reach = r.max()
    keep = np.ones(len(pts))
    rim = np.ones(len(pts), bool)
    for k, (at, half, depth) in enumerate(BITES[int(round(S.get('tier', 0)))]):
        off = (ang - at + np.pi) % (2 * np.pi) - np.pi
        inside = np.abs(off) < half
        u = np.clip(1.0 - (off / half) ** 2, 0.0, 1.0)
        # a splintered bite: its floor ragged, its walls torn along the grain
        jag = 0.25 * np.sin(off * 61.0 + k * 1.7) + 0.15 * np.sin(off * 137.0 + k)
        cut = depth * reach * (u ** 0.6) * (1.0 + jag)
        keep = np.minimum(keep, np.where(inside, 1.0 - cut / np.maximum(r, 1e-6), 1.0))
        rim &= np.abs(off) > half * 1.08
    return pts * np.clip(keep, 0.3, 1.0)[:, None], rim


# -- the shield in its own space: x across, y up, z toward the eye; its middle at the origin


def _boards(kind, S, pts):
    """The shield's body: its inside bowed away from the eye, its outside a board's thickness behind, its edge between
    them. (vertices, triangles, whether a face is the inside)."""
    reach = np.linalg.norm(pts, axis=1).max()
    s = np.linspace(0.0, 1.0, RINGS) ** 0.8
    s[0] = 0.01   # the first ring a hair round the middle: no ring of one point, whose faces would have no normal
    rings = [pts * k for k in s]
    z = _face_z(kind, S, np.array(rings), reach)
    n = len(pts)
    v, tris, inner = [], [], []
    for side, dz in ((0, 0.0), (1, -THICK)):
        base = len(v)
        for i, ring in enumerate(rings):
            for j in range(n):
                v.append((ring[j, 0], ring[j, 1], z[i, j] + dz))
        for i in range(RINGS - 1):
            for j in range(n):
                a, b = base + i * n + j, base + i * n + (j + 1) % n
                c, d = a + n, b + n
                tris += [(a, b, d), (a, d, c)] if side == 0 else [(a, d, b), (a, c, d)]
                inner += [side == 0] * 2
    for side, dz in ((0, 0.0), (1, -THICK)):   # each side's middle closed by a fan round its own point
        mid = len(v)
        v.append((0.0, 0.0, float(z[0].mean()) + dz))
        first = side * RINGS * n
        for j in range(n):
            a, b = first + j, first + (j + 1) % n
            tris.append((mid, a, b) if side == 0 else (mid, b, a))
            inner.append(side == 0)
    out0, out1 = (RINGS - 1) * n, RINGS * n + (RINGS - 1) * n   # the edge: the last rings of both sides
    for j in range(n):
        a, b = out0 + j, out0 + (j + 1) % n
        c, d = out1 + j, out1 + (j + 1) % n
        tris += [(a, c, d), (a, d, b)]
        inner += [False] * 2
    return np.asarray(v, float), np.asarray(tris, np.int64), np.asarray(inner, bool), z[-1]


def _face_z(kind, S, xy, reach):
    """How far the inside lies from its middle's plane at points `xy` (its boards bowed away from the eye; a buckler's
    boss a deep cup, a ring spun into its dish)."""
    rho = np.linalg.norm(xy, axis=-1)
    z = -S[f'{kind}_bulge'] * (1.0 - (rho / reach) ** 2)
    facets = design(S).get('facets')
    if facets:   # folded as black glass splits: ridges and valleys from the middle out, each face lit or dark
        rng = np.random.default_rng(5)
        cut = np.sort(2 * np.pi * (np.arange(2 * facets) + rng.uniform(-0.3, 0.3, 2 * facets)) / (2 * facets))
        ang = np.arctan2(xy[..., 1], xy[..., 0]) % (2 * np.pi)
        k = np.searchsorted(cut, ang) % (2 * facets)
        lo, hi = cut[k - 1], np.where(k == 0, cut[0] + 2 * np.pi, cut[k])
        lo = np.where(lo > hi, lo - 2 * np.pi, lo)
        u = ((ang - lo) % (2 * np.pi)) / (hi - lo)   # 0 to 1 across the face
        tri = np.where(k % 2 == 0, u, 1.0 - u)
        z = z + FOLD * np.clip(rho / reach, 0.0, 1.0) * (tri - 0.5) * np.clip((rho - S.get(f'{kind}_boss_r', 0.0) * 1.2)
                                                                            / 0.02, 0.0, 1.0)
    if kind == 'buckler':   # the boss: a deep cup in the middle, the bar across its mouth
        br, bd = S['buckler_boss_r'], S['buckler_boss_d']
        z = z - bd * np.sqrt(np.clip(1.0 - (rho / br) ** 2, 0.0, 1.0)) + 0.008 * np.exp(-((rho - br) / 0.008) ** 2)
        z = z + LATHE * np.exp(-((rho - LATHE_AT * reach) / 0.006) ** 2)
    return z


def _rim(pts, z, rim, girth=1.0, section='band', crude=False):
    """The rim: an iron edge along the outline, in runs where the edge is whole. `girth` its size against the plain
    rim's, `section` its cut: a slim band, low and flat-topped (every make's: a thick round roll read as a tube round
    the shield), round, a broad flat band, or square set on its corner; a `crude` one is beaten out unevenly."""
    from fpmodel import loft
    pieces = []
    n = len(pts)
    start = next((j for j in range(n) if not rim[j]), None)
    order = list(range(n)) if start is None else [(start + 1 + k) % n for k in range(n)]
    run = []
    for j in order + ([order[0]] if start is None else []):
        if rim[j]:
            run.append(j)
            continue
        if len(run) > 2:
            pieces.append(run)
        run = []
    if len(run) > 2:
        pieces.append(run)
    out = []
    for run in pieces:
        c = np.array([(pts[j, 0], pts[j, 1], z[j] - THICK / 2) for j in run])
        d = np.gradient(c, axis=0)
        d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-12
        w = np.tile([0.0, 0.0, 1.0], (len(c), 1))
        u = np.cross(d, w)
        u /= np.linalg.norm(u, axis=1, keepdims=True) + 1e-12
        a, b = RIM_R * girth, RIM_R * girth * 1.1
        if section == 'band':
            a, b = a * 0.9, b * 0.38
        elif section == 'flat':
            a, b = a * 1.7, b * 0.7
        k = 1.0 + (0.12 * np.sin(np.arange(len(c)) * 0.9) * np.sin(np.arange(len(c)) * 0.23) if crude else 0.0)
        out.append(loft(c, u, w, a * k * np.ones(len(c)), b * k * np.ones(len(c)), n=4 if section == 'square' else 8,
                        caps=(True, True)))
    return out


def _dome(at, r, h, n=10):
    """A rivet's head: a low dome at `at` on a face looking +z."""
    from fpmodel import loft
    t = np.linspace(0.0, 1.0, 5)
    c = np.array([at + np.array([0.0, 0.0, h * k]) for k in t])
    rad = r * np.sqrt(np.clip(1.0 - t ** 2, 0.0, 1.0)) + 1e-5
    return loft(c, np.tile([1.0, 0.0, 0.0], (5, 1)), np.tile([0.0, 1.0, 0.0], (5, 1)), rad, rad, n=n, caps=(True, True))


def _box(a, b, half_w, half_t, up):
    """A flat bar from `a` to `b`, `half_w` across (along `up` x its way) and `half_t` thick (along `up`)."""
    from fpmodel import loft
    a, b = np.asarray(a, float), np.asarray(b, float)
    d = (b - a) / max(np.linalg.norm(b - a), 1e-9)
    up = np.asarray(up, float) - d * (np.asarray(up, float) @ d)
    up /= max(np.linalg.norm(up), 1e-9)
    across = np.cross(d, up)
    c = np.stack([a + (b - a) * k for k in np.linspace(0.0, 1.0, 4)])
    return loft(c, np.tile(across, (4, 1)), np.tile(up, (4, 1)), np.full(4, half_w), np.full(4, half_t), n=4,
                caps=(True, True))


def _within(pts, q, share):
    """Whether points `q` lie within `share` of the way out to the outline `pts` (its rays from the middle)."""
    ang = np.arctan2(pts[:, 1], pts[:, 0])
    order = np.argsort(ang)
    a, r = ang[order], np.linalg.norm(pts, axis=1)[order]
    a = np.concatenate([a[-1:] - 2 * np.pi, a, a[:1] + 2 * np.pi])
    r = np.concatenate([r[-1:], r, r[:1]])
    return np.linalg.norm(q, axis=1) < share * np.interp(np.arctan2(q[:, 1], q[:, 0]), a, r)


def _runs(keep):
    """The runs of True in `keep`: (first, last) index pairs."""
    out, start = [], None
    for i, k in enumerate(list(keep) + [False]):
        if k and start is None:
            start = i
        elif not k and start is not None:
            out.append((start, i - 1))
            start = None
    return out


NAIL = 0.6   # a rim nail's head against a bolt's
SPIKE = 0.085   # a rim spike's reach past the rim, metres


def _loft(*a, **k):
    from fpmodel import loft
    return loft(*a, **k)


def _bar(c, half_w, half_h, ridge=False):
    """A bar along the points `c` (+z the eye's side), its middle on the face so half of it stands: a rounded one
    catches the light along its crown; a `ridge` is two facets meeting in a crest, one lit and one dark. Its half-width
    and height may taper (a value a point). (vertices, triangles)."""
    d = np.gradient(c, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-12
    w = np.tile([0.0, 0.0, 1.0], (len(c), 1))
    u = np.cross(d, w)
    u /= np.linalg.norm(u, axis=1, keepdims=True) + 1e-12
    a, b = np.broadcast_to(half_w, len(c)).astype(float), np.broadcast_to(half_h, len(c)).astype(float)
    return _loft(c, u, w, a, b, n=4 if ridge else 12, caps=(True, True))


def _curve(p0, p1, p2, n=40):
    """A quadratic curve from `p0` through the pull of `p1` to `p2`: (n, 2)."""
    t = np.linspace(0.0, 1.0, n)[:, None]
    return (1 - t) ** 2 * np.asarray(p0) + 2 * (1 - t) * t * np.asarray(p1) + t ** 2 * np.asarray(p2)


def fittings(kind, S, pts, rim):
    """What the shield's metal fixes to its inside: nails round the rim; bands, ribs, ridges and veins across it; rings
    round it; a bead inside the rim; blades with fire in their grooves; spikes through the rim. In the shield's own
    space: [(vertices, triangles, which of OWN)]."""
    D = design(S)
    if not D:
        return []
    reach = np.linalg.norm(pts, axis=1).max()
    girth = D.get('rim', 1.0)
    on = lambda xy, lift=0.0: np.column_stack([xy, _face_z(kind, S, xy, reach) + lift])   # noqa: E731
    out = []
    hw = np.array([np.abs(pts[:, 0]).max(), np.abs(pts[:, 1]).max()])
    inset = 1.0 - (RIM_R * girth * 1.8 + BOLT * NAIL) / np.maximum(np.linalg.norm(pts, axis=1), 1e-6)
    hollow = (S['buckler_boss_r'] * 1.25) if kind == 'buckler' else 0.0   # nothing fixed inside a buckler's boss
    metal, rivet, fire = OWN.index('rim'), OWN.index('rivet'), OWN.index('seam')
    rng = np.random.default_rng(29)

    def nail(xy, size=NAIL, lift=0.0):
        v, t = _dome(on(np.asarray(xy, float)[None], lift)[0], BOLT * size, BOLT * size * 0.8)
        out.append((v, t, rivet))

    def bar(xy, half_w, half_h, mat=metal, ridge=False, every=0.0, lift=0.0, share=0.93, rivets=0.62):
        """`xy` as a bar where it lies inside the rim (and outside a buckler's boss), riveted `every` metres, each
        rivet's head `rivets` of a bolt's."""
        half_w, half_h = np.broadcast_to(half_w, len(xy)), np.broadcast_to(half_h, len(xy))
        keep = _within(pts, xy, share) & (np.linalg.norm(xy, axis=1) > hollow)
        for a, b in _runs(keep):
            if b - a < 3:
                continue
            out.append((*_bar(on(xy[a:b + 1], lift), half_w[a:b + 1], half_h[a:b + 1], ridge), mat))
            if every:
                run = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(xy[a:b + 1], axis=0), axis=1))])
                for at in np.linspace(0.0, run[-1], max(2, int(round(run[-1] / every)) + 1)):
                    i = a + int(np.argmin(np.abs(run - at)))
                    nail(xy[i], rivets, lift=half_h[i] * 0.8)   # its head on the bar's crown

    n = D.get('nails', 0)
    for k in range(n):
        j = int(round(k * len(pts) / n + (rng.uniform(-0.3, 0.3) * len(pts) / n if D.get('crude') else 0))) % len(pts)
        if not rim[j]:
            continue
        for i in (j,) if not D.get('pairs') else ((j - 2) % len(pts), (j + 2) % len(pts)):
            nail(pts[i] * inset[i], NAIL * (rng.uniform(0.85, 1.4) if D.get('crude') else 1.0))
    if kind != 'buckler':
        for a, b in D.get('bands', ()):
            xy = (np.array(a) + (np.array(b) - np.array(a)) * np.linspace(0.0, 1.0, 80)[:, None]) * hw
            w = D.get('band_w', 0.016) * (1.0 + (0.15 * np.sin(np.linspace(0, 9, 80)) if D.get('crude') else 0.0))
            bar(xy, w, w * 0.42, every=0.09 if D.get('band_rivets', True) else 0.0, rivets=0.85)
    if kind != 'buckler':
        for a, b in D.get('flutes', ()):   # a fluted rib down the face, raised and plain
            xy = (np.array(a) + (np.array(b) - np.array(a)) * np.linspace(0.0, 1.0, 60)[:, None]) * hw
            bar(xy, 0.007, 0.005, ridge=True)
    if D.get('dome') and kind != 'buckler':   # the hollow behind a dome, ringed, riveted round or held by a few
        dx, dy, dr = D['dome']
        t = np.linspace(0.0, 2 * np.pi, 49)
        mid = np.array([dx * hw[0], dy * hw[1]])
        bar(mid + np.column_stack([np.cos(t), np.sin(t)]) * dr * hw[0], 0.009, 0.006,
            every=0.0 if D.get('dome_rivets') or not D.get('band_rivets', True) else 0.07, rivets=0.6)
        for k in range(D.get('dome_rivets', 0)):   # steel's: four, set in from the ring
            a = math.pi / 4 + 2 * math.pi * k / D['dome_rivets']
            nail(mid + np.array([math.cos(a), math.sin(a)]) * dr * hw[0] * 0.7, 0.8)
    if kind != 'buckler':
        for cx, cy, rx, ry in D.get('loops', ()):   # a loop as a clean flat band along its oval, cut at the rim
            t = np.linspace(0.0, 2 * np.pi, 97)
            bar(np.column_stack([(cx + rx * np.cos(t)) * hw[0], (cy + ry * np.sin(t)) * hw[1]]), 0.012, 0.005,
                share=0.9)
    ray = _ray(pts)
    for k in range(D.get('ribs', 0)):   # tapering from the middle out, as a ribbed plate's are raised
        a = 2 * math.pi * (k + 0.5) / D['ribs']
        t = np.linspace(0.3, 0.9, 40)
        bar(t[:, None] * np.array([math.cos(a), math.sin(a)]) * np.interp(a, *ray), 0.011 - 0.006 * t, 0.006 - 0.003 * t)
    rows, first, each = D.get('ray_rivets', (0, 0.0, 0))
    for k in range(rows):   # rows of rivets out from the middle, the fixings of a cross on the shield's face
        a = math.radians(first) + 2 * math.pi * k / rows
        for t in np.linspace(0.55, 0.85, each):
            xy = np.array([math.cos(a), math.sin(a)]) * t * np.interp(a % (2 * np.pi), *ray)
            if _within(pts, xy[None], 0.9)[0] and np.linalg.norm(xy) > hollow:
                nail(xy, 0.75)
    for share in D.get('rings', ()):
        xy = pts * share
        keep = _within(pts, xy, 0.93)
        closed = keep.all()
        for a, b in _runs(keep) if not closed else ((0, len(xy)),):
            ring = xy[np.arange(a, b + 1) % len(xy)]
            if len(ring) > 3:
                out.append((*_bar(on(ring), 0.009, 0.006), metal))
    if D.get('bead'):   # a fine bead inside the rim, following its edge
        ring = pts * D['bead']
        for a, b in _runs(rim & _within(pts, ring, 0.95)):
            if b - a > 3:
                out.append((*_bar(on(ring[a:b + 1]), 0.005, 0.0035), metal))
    if D.get('almond') and kind != 'buckler':   # two arcs meeting top and foot, an almond about the arm, riveted
        for side in (-1.0, 1.0):
            arc = _curve((0.0, -0.86), (0.95 * side, 0.0), (0.0, 0.86), 60) * hw
            bar(arc, 0.011, 0.007, every=0.11, share=0.9, rivets=0.75)
    for k in range(D.get('blades', 0)):   # broad hooked blades round the boss, fire in the grooves at their feet
        a0 = 2 * math.pi * (k + 0.3) / D['blades']
        t = np.linspace(0.0, 1.0, 60)
        ang = a0 + 0.7 * t ** 1.5
        r = (0.24 + 0.66 * t) * np.interp(ang % (2 * np.pi), *ray)
        xy = np.column_stack([np.cos(ang), np.sin(ang)]) * r[:, None]
        half = 0.026 * (1.0 - t) ** 0.7 + 0.002
        bar(xy, half, half * 0.6, ridge=True)
        d = np.gradient(xy, axis=0)
        side = np.column_stack([-d[:, 1], d[:, 0]]) / (np.linalg.norm(d, axis=1, keepdims=True) + 1e-12)
        for s_ in (-1.0, 1.0):
            bar(xy + s_ * side * (half + 0.004)[:, None], 0.0035 * (1.0 - 0.6 * t), 0.0012, mat=fire, lift=-0.0004)
    for k in range(D.get('spikes', 0)):   # an iron spike through the rim, jutting out in the shield's plane
        j = int(round((k + 0.5) * len(pts) / D['spikes'] + rng.uniform(-0.25, 0.25) * len(pts) / D['spikes'])) % len(pts)
        if not rim[j]:
            continue
        way = pts[j] / np.linalg.norm(pts[j])
        long = SPIKE * (rng.uniform(0.75, 1.25) if D.get('crude') else 1.0)
        t = np.linspace(-0.3, 1.0, 8)
        c = np.column_stack([pts[j] + np.outer(t * long, way), np.full(len(t), _face_z(kind, S, pts[j:j + 1], reach)[0]
                                                                         - THICK / 2)])
        r = RIM_R * girth * 1.15 * np.clip(1.0 - t, 0.04, 1.0)
        u = np.tile([-way[1], way[0], 0.0], (len(t), 1))
        out.append((*_loft(c, u, np.tile([0.0, 0.0, 1.0], (len(t), 1)), r, r, n=6, caps=(True, True)), metal))
    return out


def _ray(pts):
    """The outline's reach along each ray: (angles, rising, and reaches), for np.interp."""
    ang = np.arctan2(pts[:, 1], pts[:, 0]) % (2 * np.pi)
    order = np.argsort(ang)
    a = np.concatenate([ang[order][-1:] - 2 * np.pi, ang[order], ang[order][:1] + 2 * np.pi])
    r = np.linalg.norm(pts, axis=1)[order]
    return a, np.concatenate([r[-1:], r, r[:1]])


# -- the shield and the arm together


def frame_of(kind, S):
    """Where the shield lies in the part's space, at the kind's lean: (origin, x, y, z rows), z its inside's normal
    toward the back of the hand, and the arm's elbow and wrist."""
    p = {'l_turn': 0.0, 'l_lean': S[f'{kind}_lean']}
    r = S['handle_r']
    back = fptorch.back_of_hand(S, p, r)
    zax = np.array([0.0, 0.0, 1.0])
    # the back of the hand and the forearm lie against the shield; the curled fingers face the eye
    n = -(back - zax * (back @ zax))
    n /= np.linalg.norm(n)
    elbow, wrist = fptorch.arm_marks(S, p, r, OWN)
    f = elbow - wrist
    f = f - n * (f @ n)
    ef = np.cross(n, zax)
    ef = ef if ef @ f > 0 else -ef
    av = fptorch.arm(S, p, r, OWN)[0]
    # the inside a little behind the handle and every point of the arm: the forearm lies on it, the fist off it
    level = min(-(r + 0.022), float((av @ n).min()) - 0.004)
    if kind == 'buckler':
        level = -(r + 0.004)   # the bar across the boss's mouth: the fingers close into its hollow
    tilt = math.radians(S.get(f'{kind}_tilt', 0.0))
    up = zax * math.cos(tilt) + np.cross(n, zax) * math.sin(tilt)
    x = np.cross(up, n)
    cf, cz = S.get(f'{kind}_cf', 0.0), S.get(f'{kind}_cz', 0.0)
    origin = n * level + ef * cf + zax * cz
    return origin, np.stack([x, up, n]), elbow, wrist, p


def scene(S, kind):
    """The shield `kind` in the left fist: (vertices, triangles, material a triangle among `mats`)."""
    P, R, D, G, V, DISH = range(6)
    base = len(fparm.mats())
    origin, axes, elbow, wrist, p = frame_of(kind, S)
    pts, rim = bitten(kind, S)
    bv, bt, inner, zedge = _boards(kind, S, pts)
    to = lambda v: origin + np.asarray(v) @ axes   # noqa: E731
    look = design(S)
    body = DISH if kind == 'buckler' else OWN.index(look.get('body', 'planks'))
    pieces = [(to(bv), bt[inner], base + body), (to(bv), bt[~inner], base + body)]
    for v, t in _rim(pts, zedge, rim, look.get('rim', 1.0), look.get('section', 'band'), look.get('crude', False)):
        pieces.append((to(v), t, base + R))
    for v, t, m in fittings(kind, S, pts, rim):
        pieces.append((to(v), t, base + m))
    n = axes[2]
    zax = np.array([0.0, 0.0, 1.0])
    level = float(origin @ n)
    on_face = lambda q: q - n * (q @ n - level)   # noqa: E731  a point dropped onto the inside's plane
    # the handle: a leather-wrapped bar along +Z through the fist, held off the face by a mount at each end
    hl = S.get('handle_half', 0.07) if kind != 'buckler' else S['buckler_boss_r'] * 0.95
    from fpmodel import _axis_loft
    z = np.linspace(-hl, hl, 10)
    hv, ht = _axis_loft(z, np.full(10, S['handle_r']), np.full(10, S['handle_r']), n=14, caps=(True, True))
    pieces.append((hv, ht, base + G))
    for end in (-hl, hl):
        top = np.array([0.0, 0.0, end])
        foot = on_face(top) - n * 0.002
        pieces.append((*_box(top, foot, 0.011, 0.004, zax), base + V))
        v, t = _dome(np.zeros(3), BOLT, BOLT * 0.75)   # a broad bolt head through the mount's foot
        pieces.append((foot + n * 0.002 + v @ np.stack([np.cross(zax, n), zax, n]), t, base + V))
    if kind != 'buckler':   # the strap over the forearm near the elbow, riveted to the face either side
        at = elbow + (wrist - elbow) * S.get('strap_at', STRAP_AT)
        way = (wrist - elbow) / np.linalg.norm(wrist - elbow)
        out = n - way * (n @ way)
        out /= np.linalg.norm(out)
        side = np.cross(way, out)
        rad = 0.052 * S['arm_r'] + 0.006
        phi = np.linspace(-math.pi * 0.62, math.pi * 0.62, 18)
        arc = [at + rad * (math.cos(a) * out + math.sin(a) * side) for a in phi]
        reach = S.get('strap_reach', 0.0)   # riveted this far past the arm's side, the strap lying on the face there
        ends = [on_face(arc[0]) - side * reach, on_face(arc[-1]) + side * reach]
        path = np.array([ends[0], on_face(arc[0]), *arc, on_face(arc[-1]), ends[1]])
        from fpmodel import loft
        d = np.gradient(path, axis=0)
        d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-12
        width = np.tile(way, (len(path), 1))
        nrm = np.cross(d, width)
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
        sv, st = loft(path, width, nrm, np.full(len(path), 0.02), np.full(len(path), 0.0025), n=6, caps=(True, True))
        pieces.append((sv, st, base + S_STRAP))
        for e in ends:
            v, t = _dome(np.zeros(3), BOLT, BOLT * 0.75)
            pieces.append((e + n * 0.004 + v @ np.stack([np.cross(way, n), way, n]), t, base + V))
    av, aq, am = fptorch.arm(S, p, S['handle_r'], OWN)
    pieces.append((av, aq, am))
    return fptorch._join(pieces)


S_STRAP = OWN.index('strap')
STRAP_AT = 0.5   # the strap's place up the forearm from the elbow, a share of its length


def marks(S, kind=None):
    """Where the shield's fittings stand in the part's space: the handle's two mount feet (the +Z end's first), and
    for an arm shield the strap's two rivets. The fit pulls them onto the mod's bolts (fpheldfit.py `handle`, `strap`)."""
    kind = kind or _KIND[0]
    origin, axes, elbow, wrist, p = frame_of(kind, S)
    n = axes[2]
    level = float(origin @ n)
    on_face = lambda q: q - n * (q @ n - level)   # noqa: E731
    hl = S.get('handle_half', 0.07) if kind != 'buckler' else S['buckler_boss_r'] * 0.95
    out = {'handle': [on_face(np.array([0.0, 0.0, hl])), on_face(np.array([0.0, 0.0, -hl]))]}
    if kind != 'buckler':
        at = elbow + (wrist - elbow) * S.get('strap_at', STRAP_AT)
        way = (wrist - elbow) / np.linalg.norm(wrist - elbow)
        out_ = n - way * (n @ way)
        out_ /= np.linalg.norm(out_)
        side = np.cross(way, out_)
        rad = 0.052 * S['arm_r'] + 0.006
        ends = [at + rad * (math.cos(a) * out_ + math.sin(a) * side) for a in (-math.pi * 0.62, math.pi * 0.62)]
        reach = S.get('strap_reach', 0.0)
        out['strap'] = [on_face(ends[0]) - side * reach, on_face(ends[1]) + side * reach]
    return out


def part_for(kind):
    return lambda S: scene(S, kind)


def arm_marks(S, pose, radius, own=OWN):
    """The arm's elbow and wrist (the part is rigid: its pose moves it whole)."""
    kind = _KIND[0]
    p = {'l_turn': 0.0, 'l_lean': S[f'{kind}_lean']}
    return fptorch.arm_marks(S, p, radius, own)


def shoulder_mark(S, pose, radius, own=OWN):
    kind = _KIND[0]
    return fptorch.shoulder_mark(S, {'l_turn': 0.0, 'l_lean': S[f'{kind}_lean']}, radius, own)


def back_of_hand(S, pose, radius):
    kind = _KIND[0]
    return fptorch.back_of_hand(S, {'l_turn': 0.0, 'l_lean': S[f'{kind}_lean']}, radius)


_KIND = ['round']   # the kind a fit is working on (fpheldfit.py reads the arm's marks through it)


def use_kind(kind):
    _KIND[0] = kind


# -- the layers (fpheldforge.py)

GLOW_POWER = 0.0


def variants(rec):
    """A shield's own layers: one a condition tier in each make, the plain one's and each metal's."""
    return tuple((tier, metal) for metal in (None,) + METALS for tier in range(len(TIER_RECORDS)))


def set_variant(S, variant):
    S['tier'], S['design'] = variant


METAL_PARTS = ('rim', 'rivet', 'dish', 'facing')   # what a make draws in its metal


def variant_grade(variant):
    """A make's metal graded as its armour set's plate is up close (armour.py `CLOSE_UP` `grade`): elven gold,
    dwarven bronze, adamantium's steel and daedric black in their own colours, the rest low or high on their dyes as
    their gauntlets are, so a shield matches the hands that hold it. The plain shield keeps the archive's grade."""
    if not variant[1]:
        return {}
    import fparmour
    plate = fparmour.style(variant[1]).get('grade', {}).get('plate')
    return {n: plate for n in METAL_PARTS} if plate else {}


def object_name(rec, variant):
    return 'Shield' + (variant[1] or '')


def record_name(rec, r, variant):
    return TIER_RECORDS[variant[0]]


RAISED = ('rim', 'rivet', 'grip', 'strap', 'seam')   # what stands off the shield's face
GROUND = ('planks', 'pale', 'facing', 'dish')   # the face itself
LIT, BEVEL, CAST = 1.3, 0.78, 0.55   # a raised edge toward the light, away from it, and the face in its shadow


def over(eye, scr, pose, part, frame):
    """The shield's relief, as a painted sprite draws it: a raised fitting's edge toward the light (up and left) lit,
    its far edge dark, and the face just past that edge in its shadow. Grey stays grey (the game's metal band); a
    colour stays off grey."""
    ids = eye.id_map(pose, part, only=OWN)
    of = lambda names: np.isin(ids, [eye.names.index(n) + 1 for n in names if n in eye.names])   # noqa: E731
    raised, ground = of(RAISED), of(GROUND)
    on = scr[..., 3] > 0
    before = lambda m: np.pad(m, ((1, 0), (1, 0)))[:-1, :-1]   # noqa: E731  the texel up and left of each
    after = lambda m: np.pad(m, ((0, 1), (0, 1)))[1:, 1:]   # noqa: E731  the texel down and right of each
    out = scr.copy()
    for mask, k in ((raised & on & before(ground), LIT), (raised & on & after(ground), BEVEL),
                    (ground & on & before(raised), CAST)):
        was = out[mask, :3].astype(np.int16)
        px = np.clip(np.round(was * k), 0, 255).astype(np.int16)
        grey_was = (was[:, 0] == was[:, 1]) & (was[:, 1] == was[:, 2])
        grey = (px[:, 0] == px[:, 1]) & (px[:, 1] == px[:, 2]) & ~grey_was
        px[grey, 0] = np.where(px[grey, 0] < 255, px[grey, 0] + 1, 254)
        out[mask, :3] = px.astype(np.uint8)
    return out


def palette():
    """The shields' materials: boards of oiled wood, iron (grey: dyed by the shield's material in the game), a
    leather strap and grip."""
    import axes
    import fpmodel
    return {
        'planks': planks('planks', (0.13, 0.055, 0.025), (0.36, 0.17, 0.07)),
        'rim': axes.iron('rim', dark=(0.4, 0.4, 0.4), light=(0.5, 0.5, 0.5), dents=70.0),
        'rivet': axes.iron('rivet', dark=(0.5, 0.5, 0.5), light=(0.6, 0.6, 0.6)),
        'dish': axes.iron('dish', dark=(0.38, 0.38, 0.38), light=(0.42, 0.42, 0.42), dents=18.0, dent=0.012, grain=40.0),
        'facing': axes.iron('facing', dark=(0.34, 0.34, 0.34), light=(0.44, 0.44, 0.44), dents=25.0, dent=0.03, grain=50.0),
        'seam': _seam(),
        'pale': planks('pale', (0.3, 0.17, 0.08), (0.62, 0.42, 0.22)),
        'strap': fpmodel._leather('strap', (0.05, 0.025, 0.01), (0.12, 0.06, 0.025), scale=50.0, rough=0.6, crease=0.4,
                                  period=0.02, width=0.1, bump=0.3, ridge_lift=0.05, patches=0.05, rings=0.0),
        'grip': fpmodel._leather('grip', (0.04, 0.022, 0.01), (0.1, 0.055, 0.022), scale=60.0, rough=0.6, crease=0.5,
                                 period=0.012, width=0.1, bump=0.3, ridge_lift=0.05, patches=0.05, rings=0.0),
    }


def _seam():
    """A daedric seam: the armour's own dull deep red (armour.py `seam`), a little light of its own so it shows in
    shade, never the bright reds."""
    import materials
    import metals
    m = materials.plain('seam', metals._linear((70, 13, 9)), rough=0.8, spec=0.0)
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Emission Color'].default_value = (*metals._linear((70, 13, 9)), 1.0)
    b.inputs['Emission Strength'].default_value = 0.4
    return m


def planks(name, dark, light):
    """A shield's boards from the inside: long boards up the shield, each its own shade between `dark` and `light`, a
    dark seam between them, the grain streaked along each."""
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
    at.attribute_name = 'board'
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(at.outputs['Vector'], sep.inputs['Vector'])
    # the boards: across the shield, a board every 9 cm, each a shade of its own; the seam dark
    scale = nt.nodes.new('ShaderNodeMath')
    scale.operation = 'MULTIPLY'
    scale.inputs[1].default_value = 1.0 / 0.09
    L.new(sep.outputs['X'], scale.inputs[0])
    which = nt.nodes.new('ShaderNodeMath')
    which.operation = 'FLOOR'
    L.new(scale.outputs[0], which.inputs[0])
    frac = nt.nodes.new('ShaderNodeMath')
    frac.operation = 'FRACT'
    L.new(scale.outputs[0], frac.inputs[0])
    shade = nt.nodes.new('ShaderNodeTexWhiteNoise')
    shade.noise_dimensions = '1D'
    L.new(which.outputs[0], shade.inputs['W'])
    grain_map = nt.nodes.new('ShaderNodeCombineXYZ')
    gx = nt.nodes.new('ShaderNodeMath')
    gx.operation = 'MULTIPLY'
    gx.inputs[1].default_value = 140.0
    L.new(sep.outputs['X'], gx.inputs[0])
    gy = nt.nodes.new('ShaderNodeMath')
    gy.operation = 'MULTIPLY'
    gy.inputs[1].default_value = 6.0
    L.new(sep.outputs['Y'], gy.inputs[0])
    L.new(gx.outputs[0], grain_map.inputs['X'])
    L.new(gy.outputs[0], grain_map.inputs['Y'])
    L.new(which.outputs[0], grain_map.inputs['Z'])
    grain = nt.nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 1.0
    grain.inputs['Detail'].default_value = 3.0
    grain.inputs['Distortion'].default_value = 0.6
    L.new(grain_map.outputs['Vector'], grain.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.32, (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.68, (*light, 1)
    mix_in = nt.nodes.new('ShaderNodeMath')
    mix_in.operation = 'MULTIPLY_ADD'
    L.new(grain.outputs['Fac'], mix_in.inputs[0])
    mix_in.inputs[1].default_value = 0.75
    sh = nt.nodes.new('ShaderNodeMath')
    sh.operation = 'MULTIPLY'
    sh.inputs[1].default_value = 0.25
    L.new(shade.outputs['Value'], sh.inputs[0])
    L.new(sh.outputs[0], mix_in.inputs[2])
    L.new(mix_in.outputs[0], ramp.inputs['Fac'])
    # the seam: dark within 6 mm of a board's edge
    seam = nt.nodes.new('ShaderNodeMapRange')
    L.new(frac.outputs[0], seam.inputs['Value'])
    seam.inputs['From Min'].default_value = 0.0
    seam.inputs['From Max'].default_value = 0.07
    seam.inputs['To Min'].default_value = 0.25
    seam.inputs['To Max'].default_value = 1.0
    dark = nt.nodes.new('ShaderNodeMixRGB')
    dark.blend_type = 'MULTIPLY'
    dark.inputs['Fac'].default_value = 1.0
    L.new(ramp.outputs['Color'], dark.inputs['Color1'])
    L.new(seam.outputs['Result'], dark.inputs['Color2'])
    L.new(dark.outputs['Color'], b.inputs['Base Color'])
    return m


def decorate(eye, part, S):
    """Each vertex's place in the shield's own plane (x across, y up), as the boards' grain reads it (`planks`): the
    part is rigid, so its rest is where it is drawn."""
    origin, axes, *_ = frame_of(part, S)
    local = (eye.rest[part] - origin) @ axes.T
    me = eye.obs[part].data
    attr = me.attributes.get('board') or me.attributes.new('board', 'FLOAT_VECTOR', 'POINT')
    attr.data.foreach_set('vector', local.astype(np.float32).ravel())
    me.update()


def shield_up(S):
    """The shield's own up in the part's space, for the kind a fit works on."""
    return frame_of(_KIND[0], S)[1][1]
