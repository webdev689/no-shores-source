"""The mace (WEAPON05.CIF), made from numbers as Daggerfall's was modelled: a wooden haft, a metal collar round its
top, a round core over it, flat flanges standing out round the core, and a short spike on top.

Each flange is a flat plate, as an axe's bit is (axes.py `plate`): joined to the core over the head's height and cut
to a polygon of corners at set angles about its centre (axes.py ANGLES), each corner's distance a fitted number
(`f_r0`...). So the fit finds the spur at a flange's foot, the step up its edge and the wide corner at its top. The
flanges are alike and set evenly round the core, each its own facets' stray.

Each metal's own mace in first person, its head's make and its haft's dressing, is fpmaces.py's: each head fills the
fitted flanges' box (`box`). `LOOK` is the plainer look fpmetals.py lays on the fitted mace for each metal: its sizes
multiplied, its flanges counted, and its features set. Steel's is the fitted mace. The features are each nothing at
their default (`EXTRA`): a flange's top corner drawn out to a horn and its foot to a spur, its edge straightened, swept
up or hooked down, cut in teeth, an orb under the spike, metal bands round the haft and langets down it, and glowing
veins inside each flange's bevel (a material of their own).

The mace lies in its own frame, in metres: its root at the origin where the hand holds the haft, the haft up +Z. The
haft is wood. The collar, the flanges and the spike are the metal the dye recolours; so is the core, cast rough."""
import numpy as np

import axes

# a flange's corners from its foot to its top, each its distance from the flange's centre along axes.ANGLES' rays
FLANGE = (0.072, 0.085, 0.052, 0.056, 0.06, 0.062, 0.066, 0.076, 0.095, 0.08, 0.072)
MACE = {
    'haft_len': 0.45,    # metres from the hand to the collar's top
    'haft_r': 0.016,     # the haft's radius at the hand
    'haft_taper': 0.0,   # how much wider the haft is at the collar, over its radius at the hand
    'collar_h': 0.012,   # the collar's height
    'collar_r': 1.35,    # its radius over the haft's at its top
    'head_len': 0.14,    # the core's length, from the collar to the flanges' top
    'core_r': 0.016,     # the core's radius at its foot
    'core_taper': 0.8,   # its radius at its top, over its foot's
    'spike_len': 0.035,  # the spike over the core
    'spike_r': 0.009,    # its radius at its foot
    'flanges': 6.0,      # how many flanges stand round the core
    **{f'f_r{k}': r for k, r in enumerate(FLANGE)},
    'f_c': 0.0,          # the flanges' centre over the head's middle height (m)
    'f_att': 0.12,       # the height a flange is joined to the core over (m), about its centre
    'f_scale': 1.0,      # a flange's reach past the core, over its corners': a record's own, or a metal's
    'f_tall': 1.0,       # its height, over its corners'
    'bit_t': 0.004,      # a flange's half-thickness out of its cheek
    'bevel': 0.25,       # the share of a flange's reach its edge's bevel takes
    'ridge': 0.0,        # how far each face falls from a ridge to its top and foot, over its thickness: 0 flat
    'ridge_at': 0.5,     # where the ridge runs across the flange, from its foot (0) to its top (1)
    'cheek': 0.0,        # the share of a flange's reach its cheek takes by the core: a facet of its own, 0 none
    'cheek_t': 1.0,      # the cheek's thickness at the core, over the flange's
    'facets': 1.0,       # a flange's faces as flat facets, this many along each band out from the core: 0 smooth
    'facet_jitter': 0.3,  # how far each facet's corners stray in thickness, over it
}
# the features past the fitted mace's, each nothing (or one, a scale) at its default
EXTRA = {
    'f_point': 0.0,      # how far a flange's top corner reaches past the fitted, over its reach: a horn
    'f_spur': 0.0,       # and its foot's spur
    'f_flat': 0.0,       # a flange's outer corners drawn onto a straight edge, 0 to 1
    'f_sweep': 0.0,      # how far a flange sweeps up toward its edge (below 0, hooks down), degrees at its edge
    'teeth': 0.0,        # teeth cut in a flange's edge, each this deep over its reach
    'teeth_n': 0.0,      # how many along it
    'orb': 0.0,          # an orb on the core under the spike, its radius (m): 0 none
    'bands': 0.0,        # metal bands round the haft under the collar, how many
    'langet': 0.0,       # metal strips down the haft's sides from the collar, their length (m)
    'veins': 0.0,        # glowing veins inside each flange's bevel, on both faces, this wide (m)
}

# each metal's mace: `mul` times the fitted mace's values, `set` its own. Sizes are multiplied, so a record drawn in a
# shape of its own (the idle) keeps its own proportions under a metal's look
LOOK = {
    'Steel': {},
    # common smith's work: four thick, blunt flanges, a stub of a spike, two iron bands
    'Iron': {'mul': {'bit_t': 1.9, 'f_scale': 0.85, 'spike_len': 0.4, 'core_r': 1.15},
             'set': {'flanges': 4.0, 'f_flat': 0.5, 'ridge': 0.0, 'bands': 2.0}},
    # slim and ornate: eight thin flanges, their tops drawn to points, an orb under a long spike, three beaded bands
    'Silver': {'mul': {'bit_t': 0.75, 'f_scale': 0.92, 'spike_len': 2.4, 'spike_r': 0.8},
               'set': {'flanges': 8.0, 'f_point': 0.25, 'orb': 0.018, 'ridge': 0.5, 'bands': 3.0}},
    # Altmer: six leaves swept up, their tips long, a needle spike, long langets
    'Elven': {'mul': {'bit_t': 0.7, 'spike_len': 2.8, 'spike_r': 0.7, 'core_r': 0.85},
              'set': {'f_sweep': 28.0, 'f_point': 0.4, 'ridge': 0.6, 'langet': 0.16}},
    # Dwemer: squared and geometric - four broad flanges cut straight, a thick core, a stub spike, bands and langets
    'Dwarven': {'mul': {'bit_t': 1.6, 'core_r': 1.3, 'spike_len': 0.5, 'collar_r': 1.12, 'f_scale': 1.05},
                'set': {'flanges': 4.0, 'f_flat': 1.0, 'ridge': 0.0, 'bands': 3.0, 'langet': 0.2}},
    # light and fine: eight thin flanges, narrow and tall, an orb and a long needle
    'Mithril': {'mul': {'bit_t': 0.55, 'f_scale': 0.85, 'f_tall': 1.1, 'spike_len': 2.2, 'spike_r': 0.65},
                'set': {'flanges': 8.0, 'orb': 0.014, 'ridge': 0.7, 'bands': 1.0}},
    # dense and heavy: six thick wedges on a wide core, four bands and langets
    'Adamantium': {'mul': {'bit_t': 2.3, 'f_scale': 0.95, 'core_r': 1.3, 'spike_len': 0.6, 'collar_r': 1.1},
                   'set': {'f_flat': 0.4, 'ridge': 0.85, 'bands': 4.0, 'langet': 0.14}},
    # Dunmer volcanic glass: seven jagged flanges, sharp-faceted, their tops drawn to points, a long spike
    'Ebony': {'mul': {'bit_t': 1.1, 'spike_len': 1.6},
              'set': {'flanges': 7.0, 'teeth': 0.16, 'teeth_n': 3.0, 'f_point': 0.3, 'ridge': 0.9, 'langet': 0.1}},
    # Orsimer: brutal - five heavy flanges hooked down, notched, their feet spurred, two bands
    'Orcish': {'mul': {'bit_t': 1.5, 'f_scale': 1.15, 'spike_len': 0.8},
               'set': {'flanges': 5.0, 'f_sweep': -18.0, 'teeth': 0.12, 'teeth_n': 2.0, 'f_spur': 0.4, 'bands': 2.0}},
    # Daedric: horned flanges swept up, barbed, veined with glow, a long spike
    'Daedric': {'mul': {'f_scale': 1.05, 'spike_len': 1.9},
                'set': {'f_point': 0.6, 'f_sweep': 18.0, 'teeth': 0.06, 'teeth_n': 4.0, 'veins': 0.004,
                        'ridge': 0.6, 'bands': 2.0, 'langet': 0.12}},
}
METALS = tuple(LOOK)
MATS = ('macehead', 'macehaft', 'macecore')
METAL, HAFT, CORE = range(3)
RING = axes.RING


def shape(S, metal='Steel'):
    """`metal`'s mace over the fitted shape `S`: the features at nothing, then its values multiplied and its own set."""
    look = LOOK[metal]
    out = {**EXTRA, **S}
    for k, v in look.get('mul', {}).items():
        out[k] = out[k] * v
    out.update(look.get('set', {}))
    return out


def materials(metal='Steel'):
    """The mace's materials, in the order its triangles name them: MATS, and a glow where it has veins."""
    return MATS + ('glow',) if LOOK[metal].get('set', {}).get('veins') else MATS


def length(S):
    """The hand to the spike's point: the length a pose aims along."""
    return S['haft_len'] + S['head_len'] + S['spike_len']


def top_radius(S):
    """The haft's radius under the collar."""
    return S['haft_r'] * (1.0 + S.get('haft_taper', 0.0))


def box(S):
    """The flanges' box: its join's radius, its reach from the axis, and the heights of a flange's foot and its top. A
    record's own head (the idle's `f_scale`, `f_tall`) moves it with the flanges."""
    P = outline(S)
    c = S['haft_len'] + 0.5 * S['head_len'] + S.get('f_c', 0.0)
    return S['core_r'] * 0.7, float(P[:, 0].max()), c + float(P[:, 1].min()), c + float(P[:, 1].max())


def outline(S):
    """A flange's polygon, its corners from its foot to its top (n, 2): each (out from the axis, up) from its centre.
    The fitted corners, their reach past the core and their height scaled by the record's or the metal's own; then the
    metal's look: its top corner drawn to a horn and its foot to a spur, its edge straightened, swept, toothed."""
    R0 = S['core_r'] * 0.7
    r = np.array([S[f'f_r{k}'] for k in range(len(axes.ANGLES))], dtype=np.float64)
    a = axes.ANGLES
    past = lambda r, k: R0 + (r - R0) * k   # noqa: E731
    r = past(r, S.get('f_scale', 1.0))
    top, foot = np.argmin(np.abs(a - np.radians(48))), np.argmin(np.abs(a + np.radians(64)))
    r[top] = past(r[top], 1.0 + S.get('f_point', 0.0))
    r[foot] = past(r[foot], 1.0 + S.get('f_spur', 0.0))
    x, z = r * np.cos(a), r * np.sin(a) * S.get('f_tall', 1.0)
    if S.get('f_flat'):   # the outer corners drawn out onto a straight edge through the farthest
        inner = np.abs(a) < np.radians(40)
        x = np.where(inner, x + S['f_flat'] * (x[inner].max() - x), x)
    if S.get('f_sweep'):   # swept up (or hooked down) toward the edge, more the farther out
        k = np.radians(S['f_sweep']) * np.clip((x - R0) / max(x.max() - R0, 1e-6), 0, 1) ** 2
        x, z = x * np.cos(k) - z * np.sin(k), x * np.sin(k) + z * np.cos(k)
    pts = np.stack([x, z], axis=1)
    if S.get('teeth') and S.get('teeth_n'):
        pts = axes._toothed(pts, S['teeth'] * (x.max() - R0), int(round(S['teeth_n'])))
    return pts


def _turned(v, angle):
    """Vertices turned `angle` radians about the mace's axis."""
    c, s = np.cos(angle), np.sin(angle)
    return np.stack([v[:, 0] * c - v[:, 1] * s, v[:, 0] * s + v[:, 1] * c, v[:, 2]], axis=1)


def _flanges(S):
    """Every flange: the same plate, set evenly round the core, each its own facets' stray."""
    n = max(int(round(S['flanges'])), 1)
    c = np.array([0.0, S['haft_len'] + 0.5 * S['head_len'] + S.get('f_c', 0.0)])
    P = outline(S)
    out = []
    for k in range(n):
        for v, t, m in axes.plate(S, 1, c, P, S['core_r'] * 0.7, S['f_att'], seed=2.1 + 0.9 * k):
            out.append((_turned(v, 2 * np.pi * k / n), t, METAL if m == 0 else len(MATS)))
    return out


def _turnings(S):
    """The turned pieces, each (vertices, triangles, material): the haft, the collar round its top, the core and the
    spike."""
    h0, hr = S['haft_len'], top_radius(S)
    z = np.linspace(0.0, h0 + 0.004, 24)
    haft = axes._lathe(z, S['haft_r'] * (1.0 + S.get('haft_taper', 0.0) * np.minimum(z / max(h0, 1e-6), 1.0)),
                       caps=(True, False))
    ch, cr = S['collar_h'], hr * S['collar_r']
    u = np.array([0.0, 0.12, 0.3, 0.5, 0.7, 0.88, 1.0])
    roll = np.array([0.0, 0.62, 0.9, 1.0, 0.9, 0.62, 0.0])   # its rims rounded over onto the haft
    collar = axes._lathe(h0 - ch + u * ch, hr * 0.98 + (cr - hr * 0.98) * roll)
    top = h0 + S['head_len']
    zc = np.linspace(h0 - 0.002, top, 12)
    core = axes._lathe(zc, S['core_r'] * (1.0 - (1.0 - S['core_taper']) * (zc - h0) / S['head_len']), caps=(True, True))
    ts = top - 0.002 + S['spike_len'] * np.array([0.0, 0.3, 0.6, 0.85, 1.0])
    spike = axes._lathe(ts, S['spike_r'] * np.array([1.0, 0.72, 0.42, 0.16, 0.0]), caps=(True, False))
    out = [(*haft, HAFT), (*collar, METAL), (*core, CORE), (*spike, METAL)]
    if S.get('orb'):   # an orb on the core's top, the spike rising from it
        u = np.linspace(-np.pi / 2, np.pi / 2, 12)
        out.append((*axes._lathe(top + S['orb'] * (0.7 + np.sin(u)), S['orb'] * np.cos(u) + 1e-5), METAL))
    return out


def _fittings(S):
    """The haft's metal: bands round it under the collar, each a rounded ring, and langets down its sides."""
    out, h0 = [], S['haft_len']
    radius = lambda z: S['haft_r'] * (1.0 + S.get('haft_taper', 0.0) * z / max(h0, 1e-6))   # noqa: E731
    for i in range(int(round(S.get('bands', 0.0)))):
        z = h0 - S['collar_h'] - 0.03 - 0.05 * i
        bump = np.array([0.98, 1.14, 1.2, 1.14, 0.98])
        out.append((*axes._lathe(z + np.array([-0.007, -0.005, 0.0, 0.005, 0.007]), radius(z) * bump), METAL))
    if S.get('langet'):
        hr, w = radius(h0), 0.3 * radius(h0)
        for y in (-1.0, 1.0):
            a, b = sorted((y * hr * 0.9, y * hr * 1.2))
            out.append((*axes._box((-w, a, h0 - S['collar_h'] - S['langet']), (w, b, h0 - S['collar_h'] + 0.002)), METAL))
    return out


def mace(S):
    """The mace's (vertices, triangles, material a triangle), in MATS (and past them a vein's glow)."""
    vs, ts, ms, base = [], [], [], 0
    for v, t, m in _turnings(S) + _fittings(S) + _flanges(S):
        vs.append(v)
        ts.append(t + base)
        ms.append(np.full(len(t), m, dtype=np.int64))
        base += len(v)
    return np.concatenate(vs), np.concatenate(ts), np.concatenate(ms)
