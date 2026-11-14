"""The battleaxe (WEAPON08.CIF), made from numbers as Daggerfall's was modelled: a wooden haft, a bulbous iron socket
with a lip on the haft and a prong from its side, a band of the haft's wood showing between it and a collar, a tall
spike over that, and two bits, each a flat plate cut to a polygon. The broad bit is a crescent: its top climbs from the
socket to a tall horn, leaving a notch between them, and its edge sweeps down to a beard. The back bit is a beak.

A bit's outline is a polygon of corners at set angles about its centre by the socket (`ANGLES`), each corner's distance
from the centre a fitted number (`b_r0`..., `k_r0`...), so the fit finds its notches, horns and points. Its faces are a
fan from its join up the socket out to that polygon, cut in bands - a thick cheek by the socket, the flat, the edge's
bevel - and in one flat facet a polygon edge, each falling from a ridge to the bit's top and foot. So each takes the
lamp as one flat face, with a hard step to the next, as Daggerfall's low model did.

Each metal has an axe of its own (`LOOK`), in the language its warhammer and its long sword speak (fpwarhammers.py,
blades.py, metals.py). Steel's is the fitted axe. Iron's and every make past it draw the broad bit as a band from its
back to its edge (`b_back`, `b_edge`), so a beard may hook back toward the haft and a horn sweep over; the back bit may
be a band too (`k_back`, `k_edge`), or a beak (`beak`). A make of its own (`MAKES`) brings its socket, its top, its
back bit where that is not a plate, its fittings and its haft's dressing, which is its warhammer's (`_dressing`). A
bit's flats may be a darker metal inside bright bevels (`patina`), a channel may run inside its edge (`line`), and a
seam may glow between flats and bevel (`veins`). The features are each nothing at their default (`EXTRA`).

The axe lies in its own frame, in metres: its root at the origin where the hand holds the haft, the haft up +Z, the
bits along X (the broad one +X) and their faces toward -Y and +Y. The haft is wood, the rest is the metal the dye
recolours."""
import numpy as np

import fpwarhammers
from fpwarhammers import loft, lozenge, section, spike, strut, stud, sweep, up

ANGLES = np.radians(np.linspace(-80.0, 80.0, 11))   # a bit's corners, foot to top, about its centre by the socket
# the fitted crescent and beak the parametric bits had, measured along each corner's ray: the corners' start
BROAD = (0.0393, 0.2085, 0.2047, 0.2150, 0.2232, 0.2431, 0.2398, 0.2286, 0.2310, 0.2330, 0.0393)
BACK = (0.0393, 0.1073, 0.1374, 0.1600, 0.1805, 0.2363, 0.1742, 0.1500, 0.1385, 0.1073, 0.0393)
AXE = {
    'haft_len': 0.62,    # metres from the hand to the socket's foot
    'haft_r': 0.017,     # the haft's radius at the hand
    'sock_len': 0.15,    # the socket's height, from its lip on the haft to the band
    'sock_r': 0.026,     # the socket's radius at its widest
    'band_h': 0.012,     # the band of wood between the socket and the spike's collar
    'spike_len': 0.08,   # the spike over the socket
    'spike_r': 0.016,    # the spike's radius at its foot
    **{f'b_r{k}': r for k, r in enumerate(BROAD)},   # the broad bit's corners' distances from its centre
    **{f'k_r{k}': r for k, r in enumerate(BACK)},    # the back bit's
    'b_c': 0.0,          # the broad bit's centre over the socket's middle height (m)
    'k_c': 0.0,          # the back bit's
    'b_att': 0.12,       # the height the broad bit is joined to the socket over (m), about its centre
    'k_att': 0.06,       # the back bit's
    'b_scale': 1.0,      # the broad bit's reach past the socket, over its corners': a record's own, or a metal's
    'b_tall': 1.0,       # its height, over its corners'
    'k_scale': 1.0,      # the back bit's reach past the socket
    'k_tall': 1.0,       # its height
    'bit_t': 0.012,      # a bit's half-thickness out of its cheek
    'bevel': 0.25,       # the share of a bit's reach its edge's bevel takes
    'prong': 0.0,        # the prong standing from the socket under the back bit, its length (m): 0 none
    'prong_up': 20.0,    # how far it turns up from level, degrees
    'prong_at': 0.35,    # its foot's height up the socket, over the socket's length
    'ridge': 0.0,        # how far each face falls from a ridge out to its top and foot, over its thickness: 0 flat
    'ridge_at': 0.5,     # where the ridge runs across the bit, from its foot (0) to its top (1)
    'cheek': 0.0,        # the share of a bit's reach its cheek takes by the socket: a facet of its own, 0 none
    'cheek_t': 1.0,      # the cheek's thickness at the socket, over the bit's
    'facets': 0.0,       # a bit's faces as flat facets, this many along each of its bands out from the socket: 0 smooth
    'facet_jitter': 0.0,  # how far each facet's corners stray in thickness, over it: a hand-made model's irregular tilt
}
# the features past the fitted axe's, each nothing (or one, a scale) at its default
EXTRA = {
    'b_mid': 1.0,        # the broad bit's middle corners' reach, over the fitted: its edge's bow
    'horns': 0.0,        # how far the broad bit's tip corners reach past the fitted, over their reach
    'b_flat': 0.0,       # the broad bit's corners drawn onto a straight edge, 0 to 1
    'k_square': 0.0,     # the back bit's corners drawn onto a squared end, a poll's, 0 to 1
    'teeth': 0.0,        # teeth cut in an edge, each this deep over the bit's reach
    'teeth_n': 0.0,      # how many along the edge
    'teeth_side': 1.0,   # which bit's edge: 1 the broad one, -1 the back one, 0 both
    'back_curl': 0.0,    # how far the back bit curls up toward its tip (below 0, down), degrees at the tip over 30
    'spur': 0.0,         # a spur standing from the back bit's top, its corner's reach over the fitted's, past one
    'notch': 0.0,        # a notch cut in the back bit's top, its corner's reach taken off, over the fitted's
    'langet': 0.0,       # metal strips down the haft's faces from the socket, their length (m)
    'bands': 0.0,        # metal bands round the haft under the socket, how many
    'veins': 0.0,        # glowing veins inside each bit's bevel, on both faces, this wide (m)
    'b_edge': 0.0,       # the broad bit drawn as a band from its back to its edge (each (out, up) from its centre, m,
    'b_back': 0.0,       # from the beard's tip to the horn's), where a fan from the socket cannot hook a beard back
    'beak': 0.0,         # the back bit a curved beak instead: its path out from the socket (out, up), tapering
    'beak_h': 0.03,      # to its point from this height across its root
    'sock_square': 0.0,  # the socket squared toward a block, 0 to 1
    'langet_w': 0.32,    # a langet's half-width over the haft's radius
    'rivets': 0.0,       # rivets down each langet, how many
    'wrap': 0.0,         # leather thongs wound crossing down the haft, from the hand up to this height (m)
    'wrap_turns': 6.0,   # how many times each winds round
    'k_edge': 0.0,       # the back bit drawn as a band, as the broad one may be: its edge and its back (out, up)
    'k_back': 0.0,
    'b_res': 15.0,       # a band's lines spread evenly to this many corners; 0 keeps the longer as drawn, its
    'k_res': 15.0,       # corners sharp (a feather's step, a tooth), the other spread to as many
    'k_own': 0.0,        # the back bit is the make's own piece (a horn, a pick, a drum), not a plate
    'patina': 0.0,       # a bit's flats in a darker metal inside its bright bevels
    'line': 0.0,         # a channel this wide (m) inside each bit's bevel, in the darker metal
    'line_at': 0.0,      # how far out it runs, over the bit's reach from its back: 0 just inside the bevel
    'veins_at': 0.0,     # how far out a glowing vein runs: 0 just inside the bevel
    'dressed': 0.0,      # the make's dressing runs down the haft to the hand (a wrap, a sheath, a braid)
}


def _mirrored(*half):
    """A band's line from its foot up to its middle, and on up to its top mirrored across the centre's height."""
    return tuple(half) + tuple((x, -z) for x, z in half[::-1])


def _horned(teeth=6, lo=-0.17, hi=0.17, depth=0.014):
    """The daedric crescent's edge and back: a horn at each tip, the edge between sawn in `teeth` teeth raked toward
    the hand (each a sharp drop out, then a long slope in), the back's corners at the same heights."""
    z = np.linspace(lo, hi, teeth + 1)
    arc = lambda h: 0.198 + 0.034 * np.cos(np.pi * h / 0.4)   # noqa: E731
    saw = []
    for a, b in zip(z[:-1], z[1:]):
        saw += [(arc(a + 0.004), a + 0.004), (arc(b) - depth, b - 0.002)]
    edge = [(0.19, -0.27), (0.214, -0.235), (0.224, -0.2), (arc(lo), lo)] + saw[1:] + [(0.224, 0.2), (0.214, 0.235),
                                                                                       (0.19, 0.27)]
    inner = lambda h: 0.02 + 0.13 * np.clip((abs(h) - 0.045) / 0.155, 0.0, 1.0) ** 1.5   # noqa: E731
    back = [(0.19, -0.27), (0.168, -0.235), (0.15, -0.2)] + [(inner(h), h) for _, h in edge[3:-3]] + \
        [(0.15, 0.2), (0.168, 0.235), (0.19, 0.27)]
    return {'b_edge': tuple((round(float(x), 4), round(float(h), 4)) for x, h in edge),
            'b_back': tuple((round(float(x), 4), round(float(h), 4)) for x, h in back)}


# each metal's axe: `mul` times the fitted axe's values, `set` its own. Sizes are multiplied, so a record drawn in a
# shape of its own (the idle, the strike up) keeps its own proportions under a metal's look
LOOK = {
    'Steel': {},
    # common smith's work: a bearded crescent on a squared socket, a long beak behind curving down, long langets
    # riveted to a haft wound in crossed leather thongs
    'Iron': {'mul': {'bit_t': 1.6, 'spike_len': 0.3, 'spike_r': 0.7},
             'set': {'b_edge': ((0.075, -0.225), (0.130, -0.215), (0.180, -0.180), (0.210, -0.120), (0.225, -0.050),
                                (0.226, 0.020), (0.215, 0.080), (0.195, 0.130), (0.170, 0.170), (0.140, 0.200)),
                     'b_back': ((0.075, -0.225), (0.100, -0.180), (0.105, -0.130), (0.090, -0.085), (0.060, -0.050),
                                (0.020, -0.030), (0.020, 0.030), (0.055, 0.040), (0.085, 0.060), (0.110, 0.095),
                                (0.130, 0.145), (0.140, 0.200)),
                     'beak': ((0.02, 0.0), (0.09, -0.04), (0.16, -0.095), (0.22, -0.155), (0.27, -0.22)),
                     'beak_h': 0.056, 'b_c': 0.03, 'k_c': 0.045,
                     'sock_square': 1.0, 'band_h': 0.0, 'prong': 0.0, 'langet': 0.2, 'langet_w': 0.8,
                     'rivets': 2.0, 'wrap': 0.4}},
    # slim and ornate: a deep half-moon, each tip curled to a bead, a channel inside its edge; a slim socket ringed in
    # beads under an orb and a slender spike, a horn behind curving up; an engraved sleeve over a navy wrap
    'Silver': {'mul': {'bit_t': 1.2},
               'set': {'b_edge': _mirrored((0.09, -0.2), (0.13, -0.212), (0.168, -0.195), (0.198, -0.16),
                                           (0.217, -0.115), (0.227, -0.07), (0.231, -0.035), (0.232, -0.01)),
                       'b_back': _mirrored((0.09, -0.2), (0.118, -0.178), (0.135, -0.15), (0.14, -0.118),
                                           (0.132, -0.088), (0.11, -0.06), (0.07, -0.04), (0.02, -0.032)),
                       'dressed': 1.0, 'b_res': 0.0, 'k_own': 1.0, 'line': 0.007, 'b_c': 0.015, 'k_c': 0.015,
                       'ridge': 0.5, 'facet_jitter': 0.15}},
    # Altmer: a wing of a crescent, its horn swept up past the socket and its back stepped in feathers, a line
    # inside its edge; a feathered wing behind swept up to a point; a leaf on top; a leafed sleeve, copper wrapped
    # in a gold lattice
    'Elven': {'mul': {'bit_t': 1.1},
              'set': {'b_edge': ((0.1, -0.15), (0.135, -0.165), (0.175, -0.15), (0.208, -0.11), (0.226, -0.05),
                                 (0.232, 0.01), (0.23, 0.05), (0.224, 0.085), (0.214, 0.115), (0.2, 0.15),
                                 (0.186, 0.175), (0.17, 0.2), (0.152, 0.222), (0.132, 0.243), (0.11, 0.26),
                                 (0.085, 0.275)),
                      'b_back': ((0.1, -0.15), (0.098, -0.12), (0.085, -0.09), (0.06, -0.06), (0.02, -0.035),
                                 (0.02, 0.035), (0.05, 0.045), (0.058, 0.075), (0.075, 0.085), (0.082, 0.125),
                                 (0.098, 0.135), (0.102, 0.175), (0.112, 0.185), (0.11, 0.225), (0.1, 0.252),
                                 (0.085, 0.275)),
                      'k_edge': ((0.02, -0.03), (0.06, -0.042), (0.065, -0.014), (0.105, -0.022), (0.11, 0.008),
                                 (0.145, 0.008), (0.15, 0.042), (0.18, 0.056), (0.2, 0.18)),
                      'k_back': ((0.02, 0.03), (0.06, 0.04), (0.065, 0.042), (0.105, 0.06), (0.11, 0.063),
                                 (0.145, 0.088), (0.15, 0.094), (0.18, 0.13), (0.2, 0.18)),
                      'dressed': 1.0, 'b_res': 0.0, 'k_res': 0.0, 'line': 0.006, 'b_c': 0.0, 'k_c': 0.02, 'ridge': 0.5,
                      'facet_jitter': 0.15}},
    # Dwemer: squared and geometric - a straight-edged bit flaring from the socket, square notches cut in its top and
    # foot, a raised frame inside its edge and bolts by the socket; a ribbed drum behind; a squared block socket,
    # banded and framed, under a stepped cap; the haft sheathed in the metal and studded
    'Dwarven': {'mul': {'bit_t': 1.8},
                'set': {'b_edge': _mirrored((0.205, -0.175), (0.222, -0.152), (0.224, -0.13), (0.225, -0.1),
                                            (0.225, -0.1), (0.226, -0.05), (0.226, -0.015)),
                        'b_back': _mirrored((0.205, -0.175), (0.15, -0.139), (0.15, -0.112), (0.12, -0.093),
                                            (0.12, -0.119), (0.06, -0.08), (0.02, -0.055)),
                        'dressed': 1.0, 'b_res': 0.0, 'k_own': 1.0, 'b_c': 0.0, 'k_c': 0.0, 'bevel': 0.16, 'ridge': 0.0,
                        'facet_jitter': 0.0}},
    # light and keen: a thin crescent on a slim neck, its tips horned, a long fuller down it; a long square pick
    # behind; a slim socket banded blue under an orb and a tall spike; a blue-banded sleeve on a plain haft
    'Mithril': {'mul': {'bit_t': 0.8},
                'set': {'b_edge': _mirrored((0.075, -0.235), (0.125, -0.222), (0.165, -0.19), (0.195, -0.15),
                                            (0.215, -0.1), (0.224, -0.055), (0.227, -0.025), (0.228, -0.008)),
                        'b_back': _mirrored((0.075, -0.235), (0.105, -0.2), (0.13, -0.16), (0.15, -0.12),
                                            (0.16, -0.08), (0.158, -0.048), (0.12, -0.024), (0.02, -0.02)),
                        'b_res': 0.0, 'k_own': 1.0, 'line': 0.006, 'line_at': 0.6, 'b_c': 0.0, 'k_c': 0.0,
                        'ridge': 0.5, 'facet_jitter': 0.15}},
    # dense and heavy: a broad slab, near straight at its edge, its top corner clipped and a ridge across it; a dark
    # shard of the mountain behind, held in a gold-crowned band; a pale sheath banded gold, set with dark stones
    'Adamantium': {'mul': {'bit_t': 2.0},
                   'set': {'b_edge': ((0.19, -0.19), (0.212, -0.17), (0.224, -0.135), (0.23, -0.095),
                                      (0.233, -0.055), (0.234, -0.02), (0.234, 0.02), (0.233, 0.06), (0.232, 0.095),
                                      (0.205, 0.122), (0.177, 0.148), (0.15, 0.175)),
                           'b_back': ((0.19, -0.19), (0.15, -0.165), (0.11, -0.135), (0.07, -0.1), (0.04, -0.075),
                                      (0.02, -0.06), (0.02, 0.06), (0.045, 0.085), (0.075, 0.11), (0.105, 0.135),
                                      (0.13, 0.155), (0.15, 0.175)),
                           'dressed': 1.0, 'b_res': 0.0, 'k_own': 1.0, 'b_c': 0.0, 'k_c': 0.0, 'ridge': 0.6,
                           'ridge_at': 0.45, 'facet_jitter': 0.1}},
    # Dunmer volcanic glass: narrow at its root, swelling, its horn swept over toward the haft, a barb on its beard;
    # black flats inside bright bevels; a long edged blade behind curving up; a six-sided socket, a boss and a spiral
    # each side, a fin on top; an engraved sleeve over a black sheath
    'Ebony': {'mul': {'bit_t': 1.3},
              'set': {'b_edge': ((0.12, -0.19), (0.165, -0.18), (0.2, -0.14), (0.222, -0.085), (0.231, -0.03),
                                 (0.233, 0.0), (0.232, 0.035), (0.226, 0.075), (0.214, 0.115), (0.196, 0.155),
                                 (0.172, 0.19), (0.142, 0.22), (0.11, 0.24), (0.075, 0.25)),
                      'b_back': ((0.12, -0.19), (0.112, -0.15), (0.095, -0.115), (0.07, -0.085), (0.045, -0.06),
                                 (0.02, -0.04), (0.02, 0.035), (0.045, 0.05), (0.075, 0.07), (0.1, 0.1),
                                 (0.115, 0.14), (0.118, 0.18), (0.105, 0.22), (0.075, 0.25)),
                      'k_edge': ((0.02, -0.03), (0.07, -0.03), (0.12, -0.01), (0.16, 0.03), (0.19, 0.08),
                                 (0.205, 0.13), (0.21, 0.18)),
                      'k_back': ((0.02, 0.03), (0.07, 0.03), (0.11, 0.045), (0.145, 0.075), (0.17, 0.11),
                                 (0.188, 0.145), (0.21, 0.18)),
                      'dressed': 1.0, 'b_res': 0.0, 'k_res': 0.0, 'patina': 1.0, 'bevel': 0.32, 'b_c': 0.0, 'k_c': 0.0,
                      'ridge': 0.6, 'facet_jitter': 0.4}},
    # Orsimer: brutal - a heavy bit stepping out in angled shoulders above and below, its beard hooked down into a
    # claw, rivets by the socket; a thick hook behind curling forward; a tooth on top; a ridged sleeve over a tuft
    # of fur, braided leather down the haft
    'Orcish': {'mul': {'bit_t': 1.7},
               'set': {'b_edge': ((0.1, -0.25), (0.15, -0.225), (0.185, -0.19), (0.208, -0.15), (0.222, -0.11),
                                  (0.229, -0.075), (0.232, -0.04), (0.233, -0.01), (0.233, 0.02), (0.231, 0.05),
                                  (0.227, 0.08), (0.22, 0.11), (0.212, 0.135), (0.204, 0.16), (0.198, 0.185),
                                  (0.19, 0.21)),
                       'b_back': ((0.1, -0.25), (0.125, -0.2), (0.125, -0.16), (0.115, -0.14), (0.11, -0.105),
                                  (0.07, -0.09), (0.065, -0.06), (0.02, -0.05), (0.02, 0.05), (0.065, 0.06),
                                  (0.07, 0.09), (0.11, 0.1), (0.12, 0.135), (0.16, 0.15), (0.175, 0.18),
                                  (0.19, 0.21)),
                       'dressed': 1.0, 'b_res': 0.0, 'k_own': 1.0, 'b_c': 0.0, 'k_c': 0.0, 'ridge': 0.5,
                       'facet_jitter': 0.6}},
    # Daedric: horns at both tips of the crescent, its edge sawn in teeth raked toward the hand; black flats inside
    # grey bevels, a dull red seam between them; a long spike behind sweeping up, toothed along its top; a black
    # socket, a glowing slit each side, under a spike leaning back; the haft sheathed black, banded and studded
    'Daedric': {'mul': {'bit_t': 1.4},
                'set': {**_horned(), 'dressed': 1.0, 'b_res': 0.0, 'k_own': 1.0, 'patina': 1.0, 'bevel': 0.3,
                        'veins': 0.004, 'veins_at': 0.7, 'b_c': 0.0, 'k_c': 0.0, 'ridge': 0.5, 'facet_jitter': 0.2}},
}
METALS = tuple(LOOK)


def shape(S, metal='Steel'):
    """`metal`'s axe over the fitted shape `S`: the features at nothing, then its values multiplied and its own set,
    and its make where it has one of its own."""
    look = LOOK[metal]
    out = {**EXTRA, **S}
    for k, v in look.get('mul', {}).items():
        out[k] = out[k] * v
    out.update(look.get('set', {}))
    if metal in MAKES:
        out['make'] = metal
    return out


# a make's fittings in a colour of their own where metals.py `LOOK` gives the metal none: adamantium's crowns gold,
# as its warhammer's are
ACCENT_COLOUR = {'Adamantium': (212, 170, 70)}
# a piece's material by its role, in the order `materials` names them: the head's metal, the haft's wood, a seam's
# glow, a thong's leather, a darker metal (flats, a channel, a dark stone), a sleeve's metal (graded as the head), the
# fittings in the metal's own colours, and a grip's wrap
ROLES = ('axehead', 'haft', 'glow', 'haft_wrap', 'axe_groove', 'axe_sleeve', 'axe_accent', 'axe_grip')
HEAD, WOOD, GLOW, THONG, GROOVE, SLEEVE, ACCENT, GRIP = range(len(ROLES))
# the warhammer's roles (fpwarhammers.py MATS) as the axe's, so its haft's dressings drop in as they are
WARHAMMER = {0: HEAD, 1: SLEEVE, 2: WOOD, 3: ACCENT, 4: GLOW, 5: GRIP}


def materials(metal='Steel'):
    """The axe's materials, in the order its triangles name them: the roles its make uses, in `ROLES`' order."""
    if metal not in _USED:
        _USED[metal] = tuple(sorted({int(m) for m in np.unique(_pieces(shape(AXE, metal))[2])}))
    return tuple(ROLES[k] for k in _USED[metal])


_USED = {}


S_ROWS, W_SEG = 24, 4   # a smooth bit's grid: rows out from its centre, and columns along each polygon edge
RING = 28               # points round the haft and the socket


def length(S):
    """The hand to the spike's point: the length a pose aims along."""
    return S['haft_len'] + S['sock_len'] + S.get('band_h', 0.0) + S['spike_len']


def _grid(P):
    """A grid of points (rows, cols, 3) as quads' triangles: (vertices, triangles)."""
    r, c = P.shape[:2]
    idx = np.arange(r * c).reshape(r, c)
    a, b, d, e = idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]
    t = np.concatenate([np.stack([a, b, d], -1).reshape(-1, 3), np.stack([a, d, e], -1).reshape(-1, 3)])
    return P.reshape(-1, 3), t


def _strip(A, B):
    """A strip between two rows of points, its own vertices."""
    return _grid(np.stack([A, B], axis=1))


def centre(S, side):
    """A bit's centre in the XZ plane: on the haft's axis, at the socket's middle height and the bit's own offset."""
    return np.array([0.0, S['haft_len'] + 0.55 * S['sock_len'] + S.get('b_c' if side > 0 else 'k_c', 0.0)])


def outline(S, side):
    """A bit's polygon, its corners from its foot to its top (n, 2): each (out from the haft, up) from its centre, in
    its plane. The fitted corners, then the metal's look: its reach and height scaled, its middle bowed, its horns
    lengthened, its edge flattened or its end squared, its spur and notch, its curl, its teeth."""
    p = 'b' if side > 0 else 'k'
    R0 = S['sock_r'] * 0.7
    r = np.array([S[f'{p}_r{k}'] for k in range(len(ANGLES))], dtype=np.float64)
    a = ANGLES
    past = lambda r, k: R0 + (r - R0) * k   # noqa: E731
    r = past(r, S.get(f'{p}_scale', 1.0))
    if side > 0:
        r = np.where(np.abs(a) < np.radians(50), past(r, S.get('b_mid', 1.0)), r)
        tips = (np.abs(a) > np.radians(40)) & (np.abs(a) < np.radians(75))
        r = np.where(tips, past(r, 1.0 + S.get('horns', 0.0)), r)
    x, z = r * np.cos(a), r * np.sin(a) * S.get(f'{p}_tall', 1.0)
    inner = np.abs(a) < np.radians(70)
    flat = S.get('b_flat' if side > 0 else 'k_square', 0.0)
    if flat:   # the corners drawn out (or in) onto a straight end through the farthest
        x = np.where(inner, x + flat * (x[inner].max() - x), x)
    if side < 0:
        top = np.argmin(np.abs(a - np.radians(48)))
        x[top] = R0 + (x[top] - R0) * (1.0 + S.get('spur', 0.0) - S.get('notch', 0.0))
        curl = np.radians(S.get('back_curl', 0.0)) * np.clip((x - R0) / max(x.max() - R0, 1e-6), 0, 1) ** 2
        x, z = x * np.cos(curl) - z * np.sin(curl), x * np.sin(curl) + z * np.cos(curl)
    pts = np.stack([x, z], axis=1)
    if S.get('teeth') and S.get('teeth_n') and S.get('teeth_side', 1.0) in (0.0, float(side)):
        pts = _toothed(pts, S['teeth'] * (x.max() - R0), int(round(S['teeth_n'])))
    return pts


def _toothed(pts, depth, n):
    """A polygon's edge between its second corner and its last but one cut in `n` teeth `depth` deep: the edge resampled
    in 2n steps, every other point drawn in toward the centre."""
    edge = pts[1:-1]
    seg = np.linalg.norm(np.diff(edge, axis=0), axis=1)
    at = np.concatenate([[0.0], np.cumsum(seg)])
    s = np.linspace(0.0, at[-1], 2 * n + 1)
    fine = np.stack([np.interp(s, at, edge[:, 0]), np.interp(s, at, edge[:, 1])], axis=1)
    k = np.linalg.norm(fine, axis=1, keepdims=True)
    fine[1::2] *= np.maximum(k[1::2] - depth, 0.2 * k[1::2]) / np.maximum(k[1::2], 1e-9)
    return np.concatenate([pts[:1], fine, pts[-1:]])


def _bit(S, side):
    """One bit: `side` 1 the broad one (+X), -1 the back one. Answers its pieces, each (vertices, triangles, role)."""
    p = 'b' if side > 0 else 'k'
    if S.get(f'{p}_edge'):   # a band from its back to its edge, where a fan from the socket cannot hook a beard back
        c, edge, back, R0 = _band(S, side)
        return plate(S, side, c, edge, R0, 0.0, back=back)
    if side < 0 and S.get('k_own'):   # the make's own piece
        return []
    if side < 0 and S.get('beak'):
        return [(*_beak(S), HEAD)]
    R0 = S['sock_r'] * 0.7
    return plate(S, side, centre(S, side), outline(S, side), R0, S.get('b_att' if side > 0 else 'k_att', 0.0))


def _band(S, side):
    """A bit drawn as a band (`b_edge`, `b_back`; the back bit's `k_edge`, `k_back`), each corner (out, up) from its
    centre, sized as a record sizes the bit: (its centre, its edge, its back, the socket's reach). Both lines are
    spread evenly to `b_res` corners, or with 0 the longer is kept as drawn and the other spread to as many."""
    p = 'b' if side > 0 else 'k'
    R0 = S['sock_r'] * 0.7
    k, t = S.get(f'{p}_scale', 1.0), S.get(f'{p}_tall', 1.0)
    sized = lambda P: np.stack([R0 + (P[:, 0] - R0) * k, P[:, 1] * t], axis=1)   # noqa: E731
    E, B = (np.asarray(S[f'{p}_{n}'], dtype=np.float64) for n in ('edge', 'back'))
    n = int(round(S.get(f'{p}_res', 15.0)))
    if n:
        E, B = _resample(E, n), _resample(B, n)
    else:
        n = max(len(E), len(B))
        E, B = (L if len(L) == n else _resample(L, n) for L in (E, B))
    return centre(S, side), sized(E), sized(B), R0


def _resample(P, n):
    """A polyline's `n` points evenly along its length."""
    at = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    s = np.linspace(0.0, at[-1], n)
    return np.stack([np.interp(s, at, P[:, 0]), np.interp(s, at, P[:, 1])], axis=1)


def _beak(S):
    """The back bit as a beak: a flat four-sided spike along `beak` (each (out, up) from the back bit's centre, out
    toward -X), `beak_h` high across its root and the bit's thickness through it, tapering to its point. Each face its
    own vertices, so it shades flat."""
    c = centre(S, -1)
    k, t = S.get('k_scale', 1.0), S.get('k_tall', 1.0)
    R0 = S['sock_r'] * 0.7
    P = _resample(np.asarray(S['beak'], dtype=np.float64), 12)
    P = np.stack([-(R0 + (P[:, 0] - R0) * k), c[1] + P[:, 1] * t], axis=1)
    tan = np.gradient(P, axis=0)
    tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nrm = np.stack([-tan[:, 1], tan[:, 0]], axis=1)
    f = (1.0 - np.linspace(0.0, 1.0, len(P))) ** 0.9
    h, th = 0.5 * S['beak_h'] * f, S['bit_t'] * 2.0 * f
    ring = [np.stack([P[:, 0] + nrm[:, 0] * h * a, th * y, P[:, 1] + nrm[:, 1] * h * a], axis=1)
            for a, y in ((1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0))]   # its top and foot, its faces' middles
    vs, ts, base = [], [], 0
    for a, b in zip(ring, ring[1:] + ring[:1]):
        v, tri = _strip(a, b)
        vs.append(v)
        ts.append(tri + base)
        base += len(v)
    return np.concatenate(vs), np.concatenate(ts)


def surface(S, side, c, P, R0, att, seed=None, back=None):
    """A plate's faces (`plate`), as a function of shares `u` out from its join (or its back) to polygon `P` and `w`
    round it from its foot to its top (arrays that broadcast), and the face, -1 or 1: their points. The join is a line
    up the socket, inside it, `att` high about the centre: so the bit holds to the socket over its height, and a corner
    by the socket above a horn far out leaves a notch. With `back`, the plate runs from that line instead."""
    n = len(P)
    bev = 1.0 - S['bevel']
    ra = float(np.clip(S.get('ridge_at', 0.5), 0.1, 0.9))
    ch = S.get('cheek', 0.0)
    seed = side * 2.1 if seed is None else seed

    def jitter(u, w):
        """A corner's stray in thickness, -1 to 1: the same wherever a corner is shared, so the facets stay whole."""
        return np.sin(13.7 * u + 41.3 * w + seed) * np.cos(7.9 * u * w + 23.0 * w + 1.7)

    def at(u, w, face):
        u, w = np.broadcast_arrays(np.asarray(u, dtype=np.float64), np.asarray(w, dtype=np.float64))
        wj = np.clip(w, 0.0, 1.0) * (n - 1)
        j = np.clip(np.floor(wj).astype(int), 0, n - 2)
        t = wj - j
        edge = P[j] * (1 - t)[..., None] + P[j + 1] * t[..., None]
        if back is None:
            root = np.stack([np.full(w.shape, R0), (np.clip(w, 0.0, 1.0) - 0.5) * att], axis=-1)
        else:
            root = back[j] * (1 - t)[..., None] + back[j + 1] * t[..., None]
        x = side * (root[..., 0] + u * (edge[..., 0] - root[..., 0]))
        z = c[1] + root[..., 1] + u * (edge[..., 1] - root[..., 1])
        th = S['bit_t'] * (1.0 - 0.45 * np.minimum(u, bev))
        if ch:   # the cheek: thicker by the socket, falling at its own steeper angle to the flat
            th = th * (1.0 + (S.get('cheek_t', 1.0) - 1.0) * np.clip(1.0 - u / ch, 0.0, 1.0))
        th = np.where(u > bev, S['bit_t'] * (1.0 - 0.45 * bev) * (1.0 - u) / max(1.0 - bev, 1e-6), th)
        off = np.where(w < ra, (ra - w) / ra, (w - ra) / (1.0 - ra))   # 0 on the ridge, 1 at the top and foot
        th = th * (1.0 - S.get('ridge', 0.0) * off)
        if S.get('facet_jitter'):   # inside the bit: its edges stay where the outline has them
            inner = (np.clip(np.minimum(u / 0.05, (1.0 - u) / 0.05), 0.0, 1.0)
                     * np.clip(np.minimum(w, 1.0 - w) / 0.05, 0.0, 1.0))
            th = th * (1.0 + S['facet_jitter'] * jitter(u, w + 0.37 * (face > 0)) * inner)
        th = np.maximum(th, 0.0004)
        return np.stack([x, face * th, z], axis=-1)
    return at


def plate(S, side, c, P, R0, att, seed=None, back=None):
    """A flat plate cut to polygon `P` (its corners from its foot to its top, each (out, up) from centre `c`), joined
    to the axis at `R0` out over height `att`, its faces toward -Y and +Y: an axe's bit, a mace's flange. `S` gives its
    thickness, bevel, ridge, cheek and facets. `seed` sets its facets' stray (by default the side's). With `back` (a
    corner for each of `P`'s) it is a band from that back to `P`, its back a thick rim of its own. Its flats may be
    the darker metal inside its bevels (`patina`), a channel may run inside its bevel (`line`) and a vein glow there
    (`veins`). Answers its pieces, each (vertices, triangles, role): the head's metal, the darker metal, the glow."""
    n = len(P)
    bev = 1.0 - S['bevel']
    ra = float(np.clip(S.get('ridge_at', 0.5), 0.1, 0.9))
    nf = int(round(S.get('facets', 0.0)))
    ch = S.get('cheek', 0.0)
    at = surface(S, side, c, P, R0, att, seed, back)
    flats = GROOVE if S.get('patina') else HEAD

    def ribbon(width, sv, face, role, lift):
        """A ribbon a hair off the face, `width` wide along share `sv` out, thinning to its ends."""
        half = 0.5 * width / max(float(np.linalg.norm(P, axis=1).max()), 1e-6)
        sv = max(sv, 2 * half)
        q = np.linspace(0.0, 1.0, 4 * n + 1)[None, :]
        thin = np.sin(np.pi * q) ** 0.5
        V = at(sv + half * np.array([-1.0, 1.0])[:, None] * thin, 0.12 + 0.76 * q, face)
        V[..., 1] += face * (lift + 0.6 * S.get('facet_jitter', 0.0) * S['bit_t'])   # clear of the facets
        v, t = _grid(V)
        return v, (t[:, ::-1] if (face * side) > 0 else t), role

    bands = ((0.0, ch), (ch, bev), (bev, 1.0)) if ch else ((0.0, bev), (bev, 1.0))
    cols = np.linspace(0.0, 1.0, (n - 1) * (1 if nf else W_SEG) + 1)   # a facet a polygon edge
    pieces = []
    for face in (-1.0, 1.0):   # each band of each face, split at the ridge
        for u0, u1 in bands:
            u = np.linspace(u0, u1, (nf or S_ROWS) + 1)[:, None]
            for lo, hi in ((0.0, ra), (ra, 1.0)):
                w = np.concatenate([[lo], cols[(cols > lo) & (cols < hi)], [hi]])[None, :]
                v, t = (_flat if nf else _grid)(at(u, w, face))
                if (face * side) > 0:
                    t = t[:, ::-1]
                pieces.append((v, t, flats if u1 <= bev + 1e-9 else HEAD))
        if S.get('veins'):   # along the bevel's inner line, or where `veins_at` says
            pieces.append(ribbon(S['veins'], S.get('veins_at') or bev - 0.06, face, GLOW, 0.0006))
        if S.get('line'):
            pieces.append(ribbon(S['line'], S.get('line_at') or bev - 0.06, face, GROOVE, 0.0004))
    # the rims along the bit's foot and top rays, by the socket, each its own strip joining the two faces
    ur = np.unique(np.concatenate([np.linspace(a, b, (nf or S_ROWS) + 1) for a, b in bands]))[:, None]
    if back is not None:   # a band's back its own rim, its foot and top closing to points
        F, B = at(0.0, cols[None, :], -1.0)[0], at(0.0, cols[None, :], 1.0)[0]
        v, t = _strip(F, B)
        pieces.append((v, t if side > 0 else t[:, ::-1], flats))
        return pieces
    for col in (0.0, 1.0):
        F, B = at(ur, col, -1.0)[:, 0], at(ur, col, 1.0)[:, 0]
        v, t = _strip(F, B)
        if (col == 0.0) == (side > 0):
            t = t[:, ::-1]
        pieces.append((v, t, HEAD))
    return pieces


def _flat(P):
    """A grid of points (rows, cols, 3) as flat facets: each quad its own four corners, so it shades as one plane."""
    a, b, c, d = P[:-1, :-1], P[1:, :-1], P[1:, 1:], P[:-1, 1:]
    v = np.stack([a, b, c, d], axis=2).reshape(-1, 3)
    k = 4 * np.arange(len(v) // 4)[:, None]
    t = np.concatenate([k + [0, 1, 2], k + [0, 2, 3]])
    return v, t


def _lathe(z, r, caps=(False, False), square=0.0, sides=RING):
    """A turned piece up +Z: rings at heights `z`, radius `r`; `square` draws each ring toward a square."""
    th = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    k = 1.0 + square * ((np.abs(np.cos(th)) ** 4 + np.abs(np.sin(th)) ** 4) ** -0.25 - 1.0)
    P = np.stack([np.outer(r, np.cos(th) * k), np.outer(r, np.sin(th) * k), np.repeat(z[:, None], sides, 1)], -1)
    P = np.concatenate([P, P[:, :1]], axis=1)
    v, t = _grid(P)
    t = t[:, ::-1]
    v, t = list(v), list(t)
    n = sides + 1
    for end, (on, i) in enumerate(zip(caps, (0, len(z) - 1))):
        if on:
            mid = len(v)
            v.append([0.0, 0.0, z[i]])
            for j in range(sides):
                p, q = i * n + j, i * n + j + 1
                t.append((mid, p, q) if end == 0 else (mid, q, p))
    return np.array(v, dtype=np.float64), np.array(t, dtype=np.int64)


def _haft(S):
    z = np.linspace(0.0, S['haft_len'] + 0.02, 30)
    r = S['haft_r'] * (1.0 + 0.12 * z / max(S['haft_len'], 1e-6))
    return _lathe(z, r, caps=(True, False))


def _socket(S):
    """The head's turned pieces, each (vertices, triangles, material): the socket, a bulb from a lip on the haft, wide
    over most of its height and narrowing to its top; the band of wood over it; the collar and the spike to its
    point."""
    h0, L, R, hr = S['haft_len'], S['sock_len'], S['sock_r'], S['haft_r'] * 1.12
    u = np.array([0.0, 0.03, 0.06, 0.1, 0.2, 0.4, 0.6, 0.75, 0.86, 0.94, 1.0])
    f = np.array([0.15, 0.25, 0.12, 0.45, 0.85, 1.0, 1.0, 0.92, 0.72, 0.55, 0.45])   # the haft's girth 0, its widest 1
    sq = S.get('sock_square', 0.0)   # a squared socket a straight block, its ends chamfered
    f = (1.0 - sq) * f + sq * np.array([0.55, 0.85, 0.95, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.95, 0.8])
    body = _lathe(h0 + u * L, hr + (R - hr) * f, caps=(True, True), square=sq)
    top = h0 + L
    bh = S.get('band_h', 0.012)
    band = _lathe(np.array([top - 0.002, top + bh + 0.002]), np.full(2, 0.72 * R))
    sz = top + bh + np.array([0.0, 0.002, 0.008, 0.012, 0.016]) * (R / 0.03)
    sr = R * np.array([0.8, 0.86, 0.86, 0.74, 0.62])
    tz = sz[-1] + (S['spike_len'] - (sz[-1] - top - bh)) * np.array([0.25, 0.5, 0.75, 0.92, 1.0])
    tr = np.minimum(S['spike_r'], sr[-1]) * np.array([0.85, 0.62, 0.36, 0.13, 0.0])
    spike = _lathe(np.concatenate([sz, tz]), np.concatenate([sr, tr]), caps=(True, False))
    return [(*body, 0), (*band, 1), (*spike, 0)]


def _prong(S):
    """The prong under the back bit: a horn out of the socket's side (-X) at `prong_at` up it, turned `prong_up` up."""
    n = max(S.get('prong', 0.0), 1e-4)
    z = np.array([0.0, 0.3, 0.7, 1.0]) * n
    v, t = _lathe(z, np.array([1.0, 0.8, 0.45, 0.0]) * 0.22 * S['sock_r'], caps=(True, False))
    at = S['haft_len'] + S.get('prong_at', 0.35) * S['sock_len']
    up = np.radians(S.get('prong_up', 20.0))
    out_ = S['sock_r'] * 0.8 + v[:, 2] * np.cos(up)   # turned to point out along -X, and up
    out = np.stack([-out_ + v[:, 0] * np.sin(up), v[:, 1], at + v[:, 2] * np.sin(up) + v[:, 0] * np.cos(up)], axis=1)
    return out, t[:, ::-1]


def _box(lo, hi):
    """A box from corner `lo` to `hi`, each face its own four vertices, so it shades flat."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    faces = [[(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], [(x1, y1, z0), (x0, y1, z0), (x0, y1, z1),
             (x1, y1, z1)], [(x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)], [(x1, y0, z0), (x1, y1, z0),
             (x1, y1, z1), (x1, y0, z1)], [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
    v = np.array([p for f in faces for p in f], dtype=np.float64)
    t = np.array([(4 * k + a, 4 * k + b, 4 * k + c) for k in range(len(faces)) for a, b, c in ((0, 1, 2), (0, 2, 3))])
    return v, t


def _fittings(S):
    """The haft's metal: langets down its faces (+-Y) from the socket, and bands round it under the socket."""
    out = []
    h0, hr = S['haft_len'], S['haft_r'] * 1.12
    if S.get('langet'):
        w = S.get('langet_w', 0.32) * hr
        for y in (-1.0, 1.0):
            a, b = sorted((y * hr * 0.9, y * hr * 1.22))
            out.append((*_box((-w, a, h0 - S['langet']), (w, b, h0 + 0.01)), 0))
            n = int(round(S.get('rivets', 0.0)))
            for z in h0 - S['langet'] * (np.arange(n) + 0.6) / (n + 0.2):   # each a dome on the langet's face
                v, t = _lathe(np.array([0.0, 0.0008, 0.0014, 0.0017]), 0.55 * w * np.array([1.0, 0.85, 0.5, 0.0]),
                              caps=(False, False))
                v = np.stack([v[:, 0], y * (hr * 1.22 + v[:, 2]), z + v[:, 1]], axis=1)
                out.append((v, t if y < 0 else t[:, ::-1], 0))
    if S.get('wrap'):   # two thongs wound opposite ways from the hand up, crossing in diamonds, a hair off the haft
        z = np.linspace(0.0, S['wrap'], 240)
        r = S['haft_r'] * (1.0 + 0.12 * z / max(h0, 1e-6)) + 0.0011
        for hand in (1.0, -1.0):
            a = hand * 2 * np.pi * S.get('wrap_turns', 6.0) * z / S['wrap']
            half = 0.5 * 0.012
            rows = [np.stack([r * np.cos(a), r * np.sin(a), z + dz], axis=1) for dz in (-half, half)]
            v, t = _strip(*rows)
            out.append((v, t if hand > 0 else t[:, ::-1], 3))
    for i in range(int(round(S.get('bands', 0.0)))):
        z = h0 - 0.035 - 0.075 * i
        r = S['haft_r'] * (1.0 + 0.12 * z / max(h0, 1e-6))
        out.append((*_lathe(z + np.array([-0.008, -0.006, 0.006, 0.008]), r * np.array([0.98, 1.22, 1.22, 0.98])), 0))
    return out


def battleaxe(S):
    """The axe's (vertices, triangles, material a triangle), its materials in `materials`' order."""
    v, t, m = _pieces(S)
    used = sorted({int(k) for k in np.unique(m)})
    return v, t, np.searchsorted(np.array(used), m)


def _pieces(S):
    """The axe's pieces joined, each triangle's role (`ROLES`): the haft, the socket and what stands on it (the
    fitted one's, or a make's own), the fittings and the bits."""
    make = MAKES.get(S.get('make'))
    pieces = [(*_haft(S), WOOD)] + (make(S) if make else [*_socket(S), (*_prong(S), HEAD)]) + _fittings(S)
    for side in (1, -1):
        pieces += _bit(S, side)
    vs, ts, ms, base = [], [], [], 0
    for v, t, m in pieces:
        vs.append(v)
        ts.append(t + base)
        ms.append(np.full(len(t), m, dtype=np.int64))
        base += len(v)
    return np.concatenate(vs), np.concatenate(ts), np.concatenate(ms)


# ---- the makes' pieces: each faceted, its own corners on every face (fpwarhammers.py `loft`), or turned

def _hammer(S):
    """The axe's haft in the warhammer's terms, for its dressings (fpwarhammers.py): the socket's foot where the
    warhammer's head stands, the haft swelling toward it as the axe's does, nothing of it below the hand."""
    return {'haft_len': S['haft_len'], 'collar_len': 0.0, 'collar_r': 1.0, 'haft_r': S['haft_r'], 'haft_taper': 1.12,
            'haft_below': 0.0, 'ring_at': 0.03}


def _dressing(S, dress, role=SLEEVE, **kw):
    """The warhammer's dressing `dress` (fpwarhammers.py `_wrapped`...) on the axe's haft, in the axe's roles, its
    sleeves in `role`. It is made on the fitted haft (`AXE`), so a record with a haft of its own (the strike up's
    shorter one) keeps every vertex: slid with the socket, the haft below its last 25 cm squeezed or drawn out."""
    ref = AXE['haft_len']
    pieces = dress(_hammer({**S, 'haft_len': ref}), **kw)
    d, knee = S['haft_len'] - ref, ref - 0.25

    def slid(v):
        z = v[:, 2]
        return np.stack([v[:, 0], v[:, 1], np.where(z >= knee, z + d, z * (knee + d) / knee)], axis=1)
    return [(slid(v) if d else v, t, role if m == 1 else WARHAMMER[m]) for v, t, m in pieces]


def _girth(S, z):
    """The haft's radius at height `z`."""
    return S['haft_r'] * (1.0 + 0.12 * np.clip(z / S['haft_len'], 0.0, 1.0))


def _turned(S, u, r, role, square=0.0, caps=(True, True), sides=RING):
    """A turned piece up the socket: rings at shares `u` of its height (past 1 above it), radius `r` (m)."""
    z = S['haft_len'] + np.asarray(u, dtype=np.float64) * S['sock_len']
    return (*_lathe(z, np.asarray(r, dtype=np.float64), caps=caps, square=square, sides=sides), role)


def _prism(S, u, r, sec, role):
    """A faceted piece up the socket: section `sec` (unit) at each share `u` of its height, scaled `r` (m)."""
    z = S['haft_len'] + np.asarray(u, dtype=np.float64) * S['sock_len']
    return loft([up(a, sec, b) for a, b in zip(z, r)], role)


def _ball(at, r, role, n=10):
    """A ball of radius `r` about point `at`."""
    u = np.linspace(-np.pi / 2, np.pi / 2, n)
    v, t = _lathe(at[2] + r * np.sin(u), r * np.cos(u) + 1e-6, sides=16)
    return v + np.array([at[0], at[1], 0.0]), t, role


def _beads(S, u, r, role, k=0.004):
    """A beaded ring round the socket at share `u` of its height: `r` its girth (m), `k` its beads' swell."""
    z = S['haft_len'] + u * S['sock_len'] + np.linspace(-1.2 * k, 1.2 * k, 7)
    return (*_lathe(z, r + k * np.array([0.0, 0.5, 0.86, 1.0, 0.86, 0.5, 0.0])), role)


def _top(S):
    """The socket's top: the height a make's crown stands on."""
    return S['haft_len'] + S['sock_len']


def _behind(S, P):
    """Points (out, up) from the back bit's centre as the axe's own, sized as a record sizes the back bit: out toward
    -X, in the plane of the bits."""
    R0, k, t = S['sock_r'] * 0.7, S.get('k_scale', 1.0), S.get('k_tall', 1.0)
    c = centre(S, -1)[1]
    P = np.asarray(P, dtype=np.float64)
    return np.stack([-(R0 + (P[:, 0] - R0) * k), np.zeros(len(P)), c + P[:, 1] * t], axis=1)


def _on_bit(S, side, u, w, face, lift=0.0):
    """A point on a band bit's face, `u` out from its back and `w` from its foot to its top, `lift` off it."""
    c, edge, back, R0 = _band(S, side)
    p = surface(S, side, c, edge, R0, 0.0, back=back)(u, w, face)
    return p + np.array([0.0, face * lift, 0.0])


def _tips(S, side=1):
    """A band bit's foot and top tips, as the axe's points."""
    c, edge, back, R0 = _band(S, side)
    return [np.array([side * x, 0.0, c[1] + z]) for x, z in (edge[0], edge[-1])]


def _silver(S):
    """Silver, ornate: a slim round socket ringed in beads at its foot and its top, an orb and a slender spike over
    it; a slim horn behind curving up; a bead on its tip and on each tip of the crescent. The haft wears the silver
    warhammer's engraved sleeve, and below it a navy wrap wound in silver wire."""
    R, top = S['sock_r'], _top(S)
    u = np.array([0.0, 0.05, 0.14, 0.3, 0.5, 0.7, 0.86, 0.95, 1.0])
    out = [_turned(S, u, R * np.array([0.6, 0.72, 0.78, 0.8, 0.82, 0.8, 0.78, 0.72, 0.58]), HEAD),
           _beads(S, 0.05, 0.76 * R, HEAD), _beads(S, 0.95, 0.74 * R, HEAD),
           _ball((0.0, 0.0, top + 0.012), 0.014, HEAD), spike(top + 0.022, 0.08, 0.0075, HEAD, sides='round')]
    horn = _behind(S, [(0.02, 0.0), (0.07, -0.004), (0.11, 0.008), (0.14, 0.032), (0.158, 0.066), (0.165, 0.1),
                       (0.165, 0.118)])
    out.append(sweep(horn, [0.012, 0.011, 0.0095, 0.008, 0.0065, 0.005, 0.0],
                     [0.018, 0.016, 0.0135, 0.011, 0.0085, 0.006, 0.0], HEAD))
    out += [_ball(p, 0.012, HEAD) for p in _tips(S) + [horn[-2]]]
    return out + _dressing(S, fpwarhammers._wrapped, sleeve=0.13, turns=6.0)


def _elven(S):
    """Elven, a bird of prey: a slim round socket flaring at its foot, a ring at its waist; a leaf standing on top.
    The haft wears the elven warhammer's long sleeve, a leaf raised each side, and below it a wrap bound in a lattice
    of gold."""
    R, top = S['sock_r'], _top(S)
    u = np.array([0.0, 0.04, 0.12, 0.3, 0.5, 0.7, 0.88, 0.96, 1.0])
    out = [_turned(S, u, R * np.array([0.9, 0.86, 0.72, 0.74, 0.76, 0.74, 0.7, 0.64, 0.5]), HEAD),
           _turned(S, [0.47, 0.49, 0.57, 0.59], R * np.array([0.76, 0.84, 0.84, 0.76]), HEAD)]
    out.append(loft([up(top - 0.004, lozenge(0.006, 0.005)), up(top + 0.03, lozenge(0.02, 0.006)),
                     up(top + 0.065, lozenge(0.015, 0.005)), np.array([[0.0, 0.0, top + 0.105]])], HEAD))
    return out + _dressing(S, fpwarhammers._leafed, sleeve=0.15, turns=5.0)


def _dwarven(S):
    """Dwarven work, square and engineered: a squared block socket, a raised band at each end and a framed panel each
    side parted by a bar, under a stepped cap; a ribbed drum behind on a short neck; a raised frame inside the bit's
    edge and two bolts each side by the socket. The haft is sheathed in the metal, collared and studded."""
    R, top, zk = S['sock_r'], _top(S), centre(S, -1)[1]
    sq = section('chamfer', 1.0, 1.0, 0.22)
    out = [_prism(S, [0.0, 0.02, 0.1, 0.1, 0.9, 0.9, 0.98, 1.0],
                  R * np.array([0.92, 1.1, 1.1, 1.0, 1.0, 1.1, 1.1, 0.95]), sq, HEAD)]
    z0, z1 = S['haft_len'] + 0.16 * S['sock_len'], S['haft_len'] + 0.84 * S['sock_len']
    for side in (-1.0, 1.0):   # a framed panel each side, parted by a bar
        y, x = side * (R + 0.0012), 0.62 * R
        corners = [(-x, y, z0), (x, y, z0), (x, y, z1), (-x, y, z1)]
        out += [strut(corners[k], corners[(k + 1) % 4], 0.0024, HEAD) for k in range(4)]
        out.append(strut((0.0, y, z0), (0.0, y, z1), 0.0024, HEAD))
    out.append(loft([up(top, sq, 0.95 * R), up(top + 0.012, sq, 0.95 * R), up(top + 0.012, sq, 0.66 * R),
                     up(top + 0.024, sq, 0.66 * R), up(top + 0.024, sq, 0.38 * R), up(top + 0.036, sq, 0.3 * R)],
                    HEAD))
    out += fpwarhammers._drum(-0.8 * R, -0.15 * S.get('k_scale', 1.0), 0.042, zk, HEAD, ribs=6)
    rib = np.linspace(0.08, 0.92, 9)
    for face in (-1.0, 1.0):   # the frame inside the edge, and the bolts
        P = [_on_bit(S, 1, 0.74, w, face, 0.0016) for w in rib]
        out += [strut(a, b, 0.0022, HEAD) for a, b in zip(P[:-1], P[1:])]
        out += [stud(_on_bit(S, 1, 0.22, w, face, 0.0008), [0.0, face, 0.0], 0.006, 0.004, ACCENT)
                for w in (0.36, 0.64)]
    return out + _dressing(S, fpwarhammers._sheathed, collars=(0.03, 0.22), studs=0.045)


def _mithril(S):
    """Light and keen: a slim round socket banded blue at its foot and its top, an orb and a tall spike over it; a
    long square pick behind; on a plain haft, a short sleeve banded blue under the socket."""
    R, top, h0 = S['sock_r'], _top(S), S['haft_len']
    u = np.array([0.0, 0.05, 0.14, 0.3, 0.5, 0.7, 0.86, 0.95, 1.0])
    out = [_turned(S, u, R * np.array([0.62, 0.7, 0.74, 0.76, 0.78, 0.76, 0.74, 0.7, 0.58]), HEAD),
           _turned(S, [0.04, 0.05, 0.13, 0.14], R * np.array([0.72, 0.84, 0.84, 0.72]), ACCENT),
           _turned(S, [0.86, 0.87, 0.95, 0.96], R * np.array([0.72, 0.82, 0.82, 0.7]), ACCENT),
           _ball((0.0, 0.0, top + 0.011), 0.013, HEAD), spike(top + 0.02, 0.1, 0.0085, HEAD)]
    pick = _behind(S, [(0.02, 0.0), (0.1, -0.006), (0.18, -0.02), (0.255, -0.045)])
    out.append(sweep(pick, [0.012, 0.0095, 0.006, 0.0], [0.014, 0.011, 0.007, 0.0], HEAD, n=4))
    g = _girth(S, h0)
    out.append((*_lathe(np.array([h0 - 0.07, h0 + 0.002]), np.full(2, g * 1.16)), SLEEVE))
    out += [(*_lathe(z + np.array([0.0, 0.002, 0.008, 0.01]), g * np.array([1.16, 1.3, 1.3, 1.16])), ACCENT)
            for z in (h0 - 0.072, h0 - 0.012)]
    return out


def _adamantium(S):
    """The mountain's heart: a heavy chamfered socket crowned in gold at its foot and its top, gold points standing
    from each band, a dark stone set each side; gold rivets down the bit's ridge; a dark crystal behind and one on
    top, as the adamantium warhammer's shard. The haft is sheathed pale, banded in gold, dark stones set round it
    under the head."""
    from fpmaces import crystal   # the adamantium mace's shards (fpmaces.py reads this module first)
    R, top, h0 = S['sock_r'], _top(S), S['haft_len']
    sq = section('chamfer', 1.0, 1.0, 0.3)
    out = [_prism(S, [0.0, 0.04, 0.96, 1.0], R * np.array([0.92, 1.0, 1.0, 0.9]), sq, HEAD)]
    for a, b, d in ((-0.02, 0.08, -1.0), (0.92, 1.02, 1.0)):   # its gold bands, crowned
        out.append(_turned(S, [a, a, b, b], R * np.array([0.9, 1.12, 1.12, 0.9]), ACCENT))
        z = h0 + (b if d > 0 else a) * S['sock_len']
        for j in range(8):
            t = 2 * np.pi * (j + 0.5) / 8
            r = np.array([np.cos(t), np.sin(t), 0.0])
            out.append(stud(np.array([0.0, 0.0, z]) + r * R * 1.02, [0.25 * r[0], 0.25 * r[1], d], 0.005, 0.018,
                            ACCENT))
    for side in (-1.0, 1.0):
        out.append(stud(np.array([0.0, side * R * 1.0, h0 + 0.5 * S['sock_len']]), [0.0, side, 0.0], 0.009, 0.005,
                        GROOVE))
    for face in (-1.0, 1.0):   # gold rivets down the bit's ridge
        out += [stud(_on_bit(S, 1, u, S.get('ridge_at', 0.5), face, 0.0006), [0.0, face, 0.0], 0.0055, 0.0045, ACCENT)
                for u in (0.3, 0.5, 0.7)]
    shard = _behind(S, [(0.015, 0.0), (0.21, -0.025)])
    out.append(crystal(shard[0], shard[1], 0.03, 7, GROOVE, k=6))
    out.append(crystal((0.0, 0.0, top + 0.01), (0.0, 0.0, top + 0.085), 0.016, 11, GROOVE, k=5))
    out += _dressing(S, fpwarhammers._sheathed, collars=(0.03, 0.26, AXE['haft_len'] - 0.06), studs=None,
                     bands=fpwarhammers.ACCENT)
    for z in (h0 - 0.12, h0 - 0.15):   # dark stones round the haft, between its gold bands
        g = _girth(S, z) * 1.08
        out += [stud(np.array([np.cos(t) * g, np.sin(t) * g, z]), [np.cos(t), np.sin(t), 0.0], 0.0055, 0.0035,
                     GROOVE) for t in np.arange(4) * np.pi / 2 + np.pi / 4]
    return out


def _ebony(S):
    """Ebony, black glass worked sharp: a six-sided socket, a round boss on each side wound with a spiral, a fin of
    glass standing on top; a barb on the beard. The haft wears the ebony warhammer's engraved sleeve, ringed and wound
    in wire, and below it a sheath, all black."""
    R, top, zb = S['sock_r'], _top(S), centre(S, 1)[1]
    hexa = section('hex', 1.0, 1.0)
    out = [_prism(S, [0.0, 0.05, 0.95, 1.0], R * np.array([0.74, 0.92, 0.92, 0.7]), hexa, HEAD)]
    for side in (-1.0, 1.0):   # the bosses, a spiral wound on each
        y = side * (0.92 * R * np.sin(np.pi / 3) + 0.0012)
        out.append(fpwarhammers.boss(np.array([0.0, y, zb]), side, 0.016, 0.004, HEAD))
        t = np.linspace(0.0, 3.2 * np.pi, 14)
        pts = [(np.cos(a) * r, y + side * 0.0045, zb + np.sin(a) * r) for a, r in zip(t, np.linspace(0.002, 0.011, 14))]
        out += [strut(a, b, 0.0012, HEAD) for a, b in zip(pts[:-1], pts[1:])]
    fin = np.array([[-0.004, 0.0], [0.0, -0.0025], [0.004, 0.0], [0.0, 0.0025]])
    out.append(loft([up(top - 0.004, fin * 7.0), up(top + 0.035, fin * 3.5, x=-0.006),
                     np.array([[-0.016, 0.0, top + 0.075]])], HEAD))
    foot = _tips(S)[0]
    out.append(stud(foot + np.array([-0.012, 0.0, 0.03]), [-0.55, 0.0, -0.85], 0.007, 0.03, HEAD))
    return out + _dressing(S, fpwarhammers._engraved, role=GROOVE, sleeve=0.16, turns=4.0)


def _orcish(S):
    """Orcish, crude and cruel: a thick chamfered socket flaring at both ends, riveted each side, a thick tooth on top;
    a heavy hook behind, rising and curling forward at its tip; rivets by the socket on the bit. The haft wears the
    orcish warhammer's ridged sleeve over a tuft of fur, and braided leather below."""
    R, top = S['sock_r'], _top(S)
    sq = section('chamfer', 1.0, 1.0, 0.3)
    out = [_prism(S, [0.0, 0.03, 0.12, 0.88, 0.97, 1.0], R * np.array([0.95, 1.12, 0.98, 0.98, 1.12, 0.9]), sq, HEAD)]
    for side in (-1.0, 1.0):
        out += [stud(np.array([0.0, side * 0.98 * R, S['haft_len'] + f * S['sock_len']]), [0.0, side, 0.0], 0.006,
                     0.005, ACCENT) for f in (0.25, 0.5, 0.75)]
    out.append(spike(top - 0.002, 0.05, 0.015, HEAD, sides='hex'))
    hook = _behind(S, [(0.02, 0.0), (0.09, 0.01), (0.14, 0.04), (0.172, 0.088), (0.172, 0.138), (0.15, 0.172),
                       (0.115, 0.188)])
    w = [1.0, 0.86, 0.7, 0.55, 0.4, 0.22, 0.0]
    out.append(sweep(hook, [0.014 * k for k in w], [0.022 * k for k in w], HEAD))
    for face in (-1.0, 1.0):
        out += [stud(_on_bit(S, 1, 0.16, w_, face, 0.0006), [0.0, face, 0.0], 0.006, 0.005, ACCENT)
                for w_ in (0.4, 0.6)]
    return out + _dressing(S, fpwarhammers._bound, sleeve=0.12, turns=7.0)


def _daedric(S):
    """Daedric: a black socket, a glowing slit in each side between two grey studs, a spike on top leaning back,
    toothed up its back; a long black spike behind sweeping up, toothed along its top. The haft is sheathed black,
    banded and studded down each side, as the daedric warhammer's."""
    R, top, h0 = S['sock_r'], _top(S), S['haft_len']
    sq = section('chamfer', 1.0, 1.0, 0.3)
    out = [_prism(S, [0.0, 0.04, 0.96, 1.0], R * np.array([0.9, 1.0, 1.0, 0.86]), sq, GROOVE),
           _prism(S, [-0.02, -0.02, 0.06, 0.06], R * np.array([0.9, 1.08, 1.08, 0.9]), sq, HEAD),
           _prism(S, [0.94, 0.94, 1.02, 1.02], R * np.array([0.9, 1.08, 1.08, 0.9]), sq, HEAD)]
    zm = h0 + 0.5 * S['sock_len']
    for side in (-1.0, 1.0):
        y = side * (R + 0.0008)
        slit = lozenge(0.006, 0.026)[:, ::-1]
        out.append(loft([np.stack([slit[:, 1], np.full(4, y), zm + slit[:, 0]], axis=1),
                         np.stack([slit[:, 1] * 0.6, np.full(4, y + side * 0.002), zm + slit[:, 0] * 0.7], axis=1)],
                        GLOW))
        out += [stud(np.array([0.0, y, zm + d]), [0.0, side, 0.0], 0.005, 0.004, HEAD) for d in (-0.04, 0.04)]
    out.append(spike(top + 0.002, 0.075, 0.012, GROOVE, lean=-0.02))
    out += [stud(np.array([-0.011 + 0.004 * k, 0.0, top + 0.016 + 0.014 * k]), [-1.0, 0.0, 0.6], 0.003, 0.01, HEAD)
            for k in range(3)]
    back = _behind(S, [(0.02, 0.0), (0.08, 0.008), (0.14, 0.035), (0.19, 0.08), (0.222, 0.14), (0.238, 0.2)])
    w = [1.0, 0.82, 0.62, 0.42, 0.22, 0.0]
    out.append(sweep(back, [0.012 * k for k in w], [0.024 * k for k in w], GROOVE))
    for k, q in ((1, 0.8), (2, 0.6), (3, 0.42)):   # teeth along its top, leaning out
        p = back[k] + np.array([0.0, 0.0, 0.024 * w[k] * 0.9])
        out.append(stud(p, [-0.5, 0.0, 1.0], 0.005 * q + 0.002, 0.016 * q + 0.004, HEAD))
    return out + _dressing(S, fpwarhammers._sheathed, role=GROOVE, collars=(0.03, 0.2, 0.4), studs=0.05)


MAKES = {'Silver': _silver, 'Elven': _elven, 'Dwarven': _dwarven, 'Mithril': _mithril, 'Adamantium': _adamantium,
         'Ebony': _ebony, 'Orcish': _orcish, 'Daedric': _daedric}


def wood(name, dark, light, scale=(110.0, 110.0, 5.0), detail=2.0, distortion=0.8, edges=(0.3, 0.7)):
    """A haft's wood: its grain long streaks up the haft (`scale` the noise's, a metre), dark between bright, faintly
    mottled; `edges` the grain's shares where dark turns to bright."""
    import bpy
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 1.0
    b.inputs['Specular IOR Level'].default_value = 0.0
    b.inputs['Metallic'].default_value = 0.0
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type = 'GEOMETRY'
    at.attribute_name = 'rest'
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = scale   # the grain runs up the haft
    L.new(at.outputs['Vector'], mp.inputs['Vector'])
    grain = nt.nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 1.0
    grain.inputs['Detail'].default_value = detail
    grain.inputs['Distortion'].default_value = distortion
    L.new(mp.outputs['Vector'], grain.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = edges[0], (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = edges[1], (*light, 1)
    L.new(grain.outputs['Fac'], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def iron(name, dark=(0.55, 0.55, 0.55), light=(0.59, 0.59, 0.59), grain=150.0, dents=60.0, dent=0.07, spec=0.4,
         rough=0.22):
    """Worked iron, as Daggerfall's is: a grain of light and dark a few pixels across, hammer dents that catch
    the light (a bump of cells `dents` to the metre), and a sheen, so a facet turned to the lamp flares white and one
    turned away falls dark. Grey all through: the grade lays it on the metal band."""
    import bpy
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links
    b = nt.nodes['Principled BSDF']
    b.inputs['Metallic'].default_value = 0.0
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = spec
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type = 'GEOMETRY'
    at.attribute_name = 'rest'
    fine = nt.nodes.new('ShaderNodeTexNoise')
    fine.inputs['Scale'].default_value = grain
    fine.inputs['Detail'].default_value = 2.0
    L.new(at.outputs['Vector'], fine.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.38, (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.62, (*light, 1)
    L.new(fine.outputs['Fac'], ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    cells = nt.nodes.new('ShaderNodeTexVoronoi')
    cells.feature = 'F1'
    cells.inputs['Scale'].default_value = dents
    L.new(at.outputs['Vector'], cells.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = dent
    bump.inputs['Distance'].default_value = 0.001
    L.new(cells.outputs['Distance'], bump.inputs['Height'])
    L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m
