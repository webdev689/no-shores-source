"""The sanctum's stairs and galleries: dark clustered colonnettes under rune capitals carrying a lintel with a rune
band, the faith's mark and a shallow pointed hood, over a flight's head and foot; a dark band with a rune every 1.6
and a roll moulding down a flight's walls; and a gallery's rail of dark lobed balusters under a gilt handrail.

The stair head stands on the landing, y 0..0.3, the flight behind it at y < 0, and leaves the way up clear below
2.9 within 1.25 of its middle; the band and the rail span their whole edge, x ±1.6, and repeat every 1.6, so the
next ones meet them in one run.
"""
from . import motifs
from .doors import colonnette, face_runes, sigil

LINTEL = 2.9
TOP = 3.2
FACE = 0.2
UP = (0.0, 0.0, 1.0)
# A rune's strokes stand out of the plane toward along × up: running west, they face the room.
WEST = (-1.0, 0.0, 0.0)


def stair_head(kit):
    """Two clustered colonnettes a side on a moulded plinth against a pier, under a rune capital and an abacus; the
    lintel carries a rune band either side of the faith's brass mark, under a shallow pointed hood."""
    made = []
    for side in (1, -1):
        parts = [kit.bevelled_box(1.25, 0.0, 0.0, 1.6, 0.3, 0.32, bevel=0.025, part='trim'),
                 kit.bevelled_box(1.27, 0.0, 0.32, 1.6, 0.28, 0.38, bevel=0.02, part='trim'),
                 kit.bevelled_box(1.3, 0.0, 0.38, 1.6, 0.12, 2.62, bevel=0.02),
                 colonnette(kit, 1.335, 0.2, 0.38, 2.62, 0.06, sides=8),
                 colonnette(kit, 1.49, 0.215, 0.38, 2.62, 0.055, sides=8),
                 kit.bevelled_box(1.26, 0.0, 2.62, 1.6, 0.28, 2.78, bevel=0.02, part='relief'),
                 kit.bevelled_box(1.25, 0.0, 2.78, 1.6, 0.3, LINTEL, bevel=0.02, part='trim'),
                 motifs.plates(kit, face_runes(f'stair.head.cap.{side}', 2, 1.3, 1.58, 2.65, 0.1, 0.28, 1), 'trim',
                               'runes')]
        piece = kit.join(parts)
        made.append(piece if side > 0 else kit.scale(piece, -1, 1, 1))
    made.append(kit.bevelled_box(-1.6, 0.0, LINTEL, 1.6, FACE, TOP, bevel=0.02, part='stoneAlt'))
    for x0, x1 in ((-1.1, -0.2), (0.2, 1.1)):
        made.append(motifs.plates(kit, face_runes(f'stair.head.band.{x0}', 5, x0, x1, 2.94, 0.075, FACE, 1),
                                  'relief', 'runes'))
    made.append(sigil(kit, 0.0, 3.0, 0.1, FACE, 1))
    hood = [(-1.56, FACE + 0.012, 3.02), (0.0, FACE + 0.012, 3.165), (1.56, FACE + 0.012, 3.02)]
    made.append(motifs.tube(kit, hood, 0.026, sides=6))
    return kit.join(made)


def stair_side(kit):
    """A dark band under a roll moulding, a rune on the band every 1.6."""
    band = [(0.0, -0.3), (0.05, -0.3), (0.06, -0.285), (0.06, 0.27), (0.0, 0.27)]
    made = [kit.extrude_outline(band, -1.6, 1.6, 'yz', part='stoneAlt', smooth=None),
            motifs.tube(kit, [(-1.6, 0.05, 0.31), (1.6, 0.05, 0.31)], 0.05, sides=6)]
    runes = []
    for x in (-0.8, 0.8):
        runes += motifs.glyph(motifs.rune(f'stair.side.{x}'), (x + 0.05, 0.06, -0.08), WEST, UP, 0.1, 0.16,
                              0.018, 0.006, front_only=True)
    made.append(motifs.plates(kit, runes, 'trim', 'runes'))
    return kit.join(made)


# A baluster's turning, (radius, height) over the plinth: a spreading foot, a slender waist, a swelling bulb and a
# neck under a bell.
BALUSTER = [(0.06, 0.0), (0.045, 0.06), (0.03, 0.2), (0.06, 0.36), (0.03, 0.53), (0.06, 0.62)]
PLINTH = 0.16
RAIL = 0.82


def balustrade(kit):
    """Six dark lobed balusters every 0.53 on a moulded plinth under a stone rail, a gilt brass handrail along its
    top and a brass crescent over the gallery every 1.6."""
    made = [kit.bevelled_box(-1.6, 0.0, 0.0, 1.6, 0.25, PLINTH, bevel=0.02, part='trim'),
            kit.bevelled_box(-1.6, 0.02, RAIL, 1.6, 0.23, 0.94, bevel=0.02, part='trim')]
    made.append(motifs.tube(kit, [(-1.6, 0.125, 0.94), (1.6, 0.125, 0.94)], 0.05, 'brass', sides=6))
    for number in range(6):
        x = -1.6 + 1.6 / 6 + 1.6 / 3 * number
        made.append(kit.mesh(motifs.lobed([(radius, height * (RAIL - PLINTH) / 0.62) for radius, height in BALUSTER],
                                          4, 0.12, centre=(x, 0.125, PLINTH), sides=6, caps=False),
                             'stoneAlt', 'baluster', motifs.ROUND, False))
    for x in (-0.8, 0.8):
        made.append(sigil(kit, x, 0.87, 0.045, 0.23, 1, whorl=False))
    return kit.join(made)


def build(kit):
    return {'stair.head': stair_head(kit), 'stair.side': stair_side(kit), 'balustrade': balustrade(kit)}
