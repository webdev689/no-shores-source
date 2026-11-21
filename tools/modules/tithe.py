"""The Grey Tithe raid's props: a hamlet's three stores (`tithe-stores-a`, `-b`, `-c`: crates, sacks and barrels stacked
by a house under a grey tarp), a store the Tithe have plundered (`tithe-stores-plundered`: crates broken open, sacks
slit, grain spilt, the tarp dragged off) and the banner they plant at the hamlet's edge (`tithe-banner`: a grey cloth,
unmarked, on a pole). Weathered timber, iron bands and grey canvas, as Saltmere's own stores are kept.
"""
import math

import mathutils

import kit
from timbers import Frame, barrel, board, cloth, crate, sack, tarp

CRATE = (0.8, 0.8, 0.75)
SMALL = (0.62, 0.55, 0.5)


def standing(module, size, high):
    """The store's part: the box a body runs into round its stack."""
    module.part((-size[0] / 2, -size[1] / 2, 0.0), (size[0] / 2, size[1] / 2, high))


def stores_a(module):
    """Two crates side by side and a third on them, a small crate and three sacks against their end, a barrel at the
    other, the tarp over the crates pegged out at its corners."""
    tops = []
    for x in (-0.42, 0.42):
        crate(module, Frame((x, 0.1, 0.0), module.draw(-0.04, 0.04)), CRATE)
        tops.append((x - 0.42, -0.32, x + 0.42, 0.52, CRATE[2] + 0.05))
    crate(module, Frame((0.05, 0.12, CRATE[2] + 0.05), 0.12), CRATE)
    tops.append((-0.37, -0.3, 0.47, 0.54, CRATE[2] * 2 + 0.2))
    crate(module, Frame((0.2, -0.75, 0.0), 0.3), SMALL)
    for k, (x, y) in enumerate(((-1.12, 0.35), (-1.1, -0.2), (-0.65, -0.62))):
        sack(module, Frame((x, y, 0.0), module.draw(0, math.tau), (module.draw(-0.12, 0.12), 0.0)),
             (0.27 + 0.02 * k, 0.6 + 0.05 * k))
    barrel(module, Frame((1.12, 0.35, 0.0), module.draw(0, 1)))
    tarp(module, (0.0, 0.12), (1.9, 1.5), tops)
    standing(module, (2.6, 1.9), 1.6)


def stores_b(module):
    """Barrels: two on their sides chocked with wedges, a third laid in the cradle between them, two standing beside,
    a crate with a sack on it; the tarp thrown over the laid barrels only."""
    for y in (-0.32, 0.32):
        barrel(module, Frame((0.0, y, 0.3), 0.0, (0.0, math.pi / 2)))
        for x in (0.15, 0.7):
            board(module, Frame((x, y - 0.27 * (1 if y < 0 else -1), 0.0)), (0.0, 0.0, 0.05), (0.09, 0.1, 0.09),
                  rotation=(0.45 if y < 0 else -0.45, 0.0, 0.0))
    barrel(module, Frame((0.0, 0.0, 0.81), 0.0, (0.0, math.pi / 2)))
    barrel(module, Frame((-0.75, 0.45, 0.0), 0.4))
    barrel(module, Frame((-0.62, -0.18, 0.0), 1.3), radius=0.26, high=0.74)
    crate(module, Frame((-0.1, -0.85, 0.0), -0.15), SMALL)
    sack(module, Frame((-0.12, -0.85, SMALL[2] + 0.05), 0.7, (0.0, 1.35)), (0.24, 0.62))
    tarp(module, (0.43, 0.0), (1.5, 1.7), [(0.0, -0.62, 0.86, 0.62, 1.24)], sag=0.08)
    standing(module, (2.2, 2.1), 1.4)


def stores_c(module):
    """A pallet of boards on bearers with full sacks laid flat on it two deep, their tied necks out at both sides, a
    crate at its foot, the tarp roped down over the middle of the pile."""
    for y in (-0.5, 0.0, 0.5):
        board(module, Frame(), (0.0, y, 0.05), (1.5, 0.09, 0.1))
    for x in range(7):
        board(module, Frame(), (-0.66 + x * 0.22, 0.0, 0.115), (0.17, 1.2, 0.03))
    floor = 0.13
    # Sacks laid flat across the pallet in two rows, feet together in the middle and necks outward, and three more
    # laid over them; a laid sack runs from its foot toward -y, turned half round for the row running +y.
    for k in range(4):
        x = -0.48 + k * 0.32
        for y, turn in ((0.02, math.pi), (-0.02, 0.0)):
            sack(module, Frame((x, y, floor + 0.1), turn + module.draw(-0.1, 0.1), (math.pi / 2 - 0.04, 0.0)),
                 (0.2, 0.64), flat=0.5)
    for k in range(3):
        sack(module, Frame((-0.32 + k * 0.32, -0.25 + 0.5 * (k % 2), floor + 0.28),
                           (0.0 if k % 2 else math.pi) + module.draw(-0.15, 0.15), (math.pi / 2 - 0.06, 0.0)),
             (0.2, 0.6), flat=0.5)
    crate(module, Frame((1.15, -0.3, 0.0), 0.5), SMALL)
    tarp(module, (0.0, 0.0), (1.9, 0.9), [(-0.75, -0.35, 0.75, 0.35, floor + 0.44)], sag=0.04)
    standing(module, (2.4, 1.8), 1.0)


def stores_plundered(module):
    """A store after the Tithe: a crate broken open and its boards strewn, one tipped on its side with its lid gone,
    sacks slit and slumped with their grain spilt in heaps, a barrel stove in and rolled away, the tarp dragged off
    to lie in a heap."""
    crate(module, Frame((-0.4, 0.15, 0.0), 0.08), CRATE,
          gone=(('front', 1), ('front', 2), ('front', 'brace'), ('lid', 0), ('lid', 1)), lean=0.6)
    crate(module, Frame((0.6, 0.25, 0.29), 0.5, (math.pi / 2, 0.0)), SMALL, lid=False, gone=(('east', 2),))
    for k in range(9):   # boards strewn
        board(module, Frame((module.draw(-1.3, 1.3), module.draw(-1.1, -0.4), 0.0), module.draw(0, math.pi)),
              (0.0, 0.0, 0.012), (module.draw(0.4, 0.8), 0.11, 0.022), rotation=(0.0, module.draw(-0.1, 0.1), 0.0))
    for x, y in ((-1.1, -0.2), (0.2, -0.7), (1.1, 0.7)):
        sack(module, Frame((x, y, 0.0), module.draw(0, math.tau)), (0.3, 0.58), slumped=0.75, slit=True)
        heap(module, (x + module.draw(-0.1, 0.1), y - 0.4, 0.0), module.draw(0.3, 0.5))
    heap(module, (-0.4, -0.35, 0.0), 0.45)
    barrel(module, Frame((0.9, -0.55, 0.28), 1.1, (0.0, math.pi / 2)), head=False)
    tarp(module, (-0.6, 0.9), (1.7, 0.9), [(-1.1, 0.75, -0.1, 1.05, 0.28)], sag=0.1, torn=0.6, rope=False)
    standing(module, (2.4, 1.8), 0.8)


def heap(module, at, reach):
    """Spilt grain: a low heap, steepest at its middle, thinning out over the ground to a ragged edge."""
    rings, around = 6, 16
    noise = mathutils.noise
    seed = mathutils.Vector((module.draw(0, 50), module.draw(0, 50), 0.0))
    points = [(at[0], at[1], at[2] + reach * 0.5)]
    for ring in range(1, rings + 1):
        for k in range(around):
            angle = math.tau * k / around
            edge = reach * (0.75 + 0.35 * noise.noise(mathutils.Vector((math.cos(angle), math.sin(angle), 0)) * 1.5
                                                        + seed))
            out = edge * ring / rings
            z = (1 - ring / rings) ** 1.4 * reach * 0.5 + 0.006
            points.append((at[0] + math.cos(angle) * out, at[1] + math.sin(angle) * out * 0.8, at[2] + z))
    faces = [(0, 1 + k, 1 + (k + 1) % around) for k in range(around)]
    for ring in range(rings - 1):
        for k in range(around):
            a, b = 1 + ring * around + k, 1 + ring * around + (k + 1) % around
            faces.append((a, a + around, b + around, b))
    kit.solid_of(module, 'grain', points, kit.oriented(points, faces, lambda middle: (0.0, 0.0, 1.0)), 'trim',
                 smooth=True)


def banner(module):
    """The Grey Tithe's banner: a grey cloth hung unmarked from a crossbar on a tall pole, its foot swallow-cut and
    lifting in the wind; the pole driven into the ground and packed round with stones, an iron spike and collar at
    its head."""
    tall, bar_at, bar = 4.1, 3.75, 1.2
    pole = mathutils.Vector((0.0, 0.0, 0.0))
    board(module, Frame(), (0.0, 0.0, tall / 2), (0.1, 0.1, tall), bevel=0.03)
    board(module, Frame(), (0.0, 0.0, tall + 0.12), (0.05, 0.05, 0.24), 'iron', rotation=(0.0, 0.0, math.pi / 4))
    board(module, Frame(), (0.0, 0.0, tall - 0.06), (0.14, 0.14, 0.06), 'iron')
    board(module, Frame(), (0.0, 0.0, bar_at), (0.09, bar, 0.07), bevel=0.02)
    for side in (-1, 1):
        board(module, Frame(), (0.0, side * bar / 2, bar_at), (0.1, 0.05, 0.1), 'iron')
        # A brace from the pole up under each arm of the bar.
        board(module, Frame(), (0.0, side * 0.18, bar_at - 0.2), (0.05, 0.5, 0.05), rotation=(side * 0.85, 0.0, 0.0))
    # The cloth: a sleeve over the bar, then hanging and lifting in the wind, its foot cut into two tails.
    rows, columns = 18, 11
    drop = 2.1
    points = []
    for row in range(rows):
        for column in range(columns):
            across = column / (columns - 1)
            down = row / (rows - 1)
            y = (across - 0.5) * (bar - 0.12)
            notch = 0.45 * (1 - abs(across - 0.5) * 2) if row == rows - 1 else 0.0
            z = bar_at - 0.05 - drop * down + notch
            x = 0.12 * down * math.sin(across * 4.1 + down * 3.3) + 0.06 * down ** 2 + 0.07
            points.append((x, y, z))
    cloth(module, 'banner', points, rows, columns)
    # The hem's weight bar, and the cords lashing the sleeve to the bar.
    for k in range(5):
        board(module, Frame(), (0.07, -bar / 2 + 0.12 + k * (bar - 0.24) / 4, bar_at), (0.12, 0.02, 0.13), 'canvas',
              bevel=0.0)
    for k in range(7):   # stones packed round its foot
        turn = math.tau * k / 7 + module.draw(-0.2, 0.2)
        size = module.draw(0.12, 0.22)
        kit.rock(module, (pole.x + math.cos(turn) * 0.22, pole.y + math.sin(turn) * 0.22, -0.02),
                 (size, size * 0.8, size * 0.6), k * 3.1, material='chalk', part=False, detail=2)
    module.part((-0.06, -0.06, 0.0), (0.06, 0.06, tall))
