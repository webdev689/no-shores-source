"""The war table (`war-table`), 12 x 4 x 1.1: the long table in the middle of the Hall of the Arts where the factions
plan. A thick timber top on three carved stone trestles, a gilt edge round it; laid along it maps of the coast and the
roads, their routes inked in crimson, markers of gold, iron and crimson standing on them for the companies, a pair of
dividers, a rolled chart weighted at its ends, and candles in brass dishes down its length. Its `front` is its -y
long side.
"""
import math

import fittings
import kit
import shapes

HALF_X = 5.8
HALF_Y = 1.5
TOP_M = 1.0


def trestle(module, x):
    """A stone trestle across the table's width: a broad foot, a waisted pier and a cap under the top."""
    kit.block(module, (x, 0.0, 0.0), (0.7, HALF_Y * 2 - 0.4, 0.18), 'stone', bevel=0.04, wear=0.02, part=False)
    shapes.lathe(module, (x, 0.0, 0.18), [(0.3, 0.0), (0.22, 0.12), (0.16, 0.45), (0.22, 0.66), (0.28, 0.72)], 'stone',
                 sides=8, turn=(0.0, 0.0, math.pi / 8))
    kit.block(module, (x, 0.0, 0.88), (0.6, HALF_Y * 2 - 0.6, 0.04), 'trim', bevel=0.02, wear=0.0, part=False)


def marker(module, at, material, kind):
    """A company's marker standing on a map: a pawn, a little tower or a flagged pin."""
    if kind == 0:
        shapes.lathe(module, at, [(0.05, 0.0), (0.03, 0.03), (0.02, 0.08), (0.03, 0.1), (0.0, 0.12)], material,
                     sides=6, smooth=False)
    elif kind == 1:
        shapes.slab(module, (at[0], at[1], at[2] + 0.05), (0.07, 0.07, 0.1), material)
    else:
        shapes.rod(module, at, (at[0], at[1], at[2] + 0.16), 0.006, 'iron', sides=3)
        shapes.slab(module, (at[0] + 0.03, at[1], at[2] + 0.13), (0.06, 0.004, 0.04), material)


def map_sheet(module, middle, size, turn, material='linen'):
    """A map laid on the table, curling up at its corners a little, its routes inked in crimson lines."""
    x, y = middle
    shapes.slab(module, (x, y, TOP_M + 0.006), (size[0], size[1], 0.006), material, turn=(0.0, 0.0, turn))
    cos, sin = math.cos(turn), math.sin(turn)
    for line in range(3):
        along = module.draw(0.3, 0.8) * size[0]
        dx, dy = module.draw(-0.3, 0.3) * size[0], module.draw(-0.3, 0.3) * size[1]
        bend = turn + module.draw(-0.8, 0.8)
        shapes.slab(module, (x + dx * cos - dy * sin, y + dx * sin + dy * cos, TOP_M + 0.011), (along, 0.012, 0.002),
                    'crimson', turn=(0.0, 0.0, bend))
    # Each short edge curls up into a roll where the sheet was kept rolled.
    for cx in (-1, 1):
        ends = [(x + cx * size[0] / 2 * cos - cy * size[1] / 2 * sin, y + cx * size[0] / 2 * sin + cy * size[1] / 2 *
                 cos, TOP_M + 0.02) for cy in (-1, 1)]
        shapes.rod(module, ends[0], ends[1], 0.02, material, sides=6)


def war_table(module):
    for x in (-HALF_X + 0.9, 0.0, HALF_X - 0.9):
        trestle(module, x)
    kit.block(module, (0.0, 0.0, TOP_M - 0.1), (HALF_X * 2, HALF_Y * 2, 0.1), 'timber', bevel=0.02, wear=0.0,
              part=False)
    module.part((-HALF_X, -HALF_Y, 0.0), (HALF_X, HALF_Y, TOP_M))
    # The apron under the top's edge, and the gilt moulding round the top.
    for y in (-HALF_Y + 0.1, HALF_Y - 0.1):
        shapes.slab(module, (0.0, y, TOP_M - 0.22), (HALF_X * 2 - 0.2, 0.06, 0.24), 'timber')
    for x in (-HALF_X + 0.1, HALF_X - 0.1):
        shapes.slab(module, (x, 0.0, TOP_M - 0.22), (0.06, HALF_Y * 2 - 0.2, 0.24), 'timber')
    for y in (-HALF_Y, HALF_Y):
        shapes.slab(module, (0.0, y, TOP_M - 0.05), (HALF_X * 2 + 0.04, 0.04, 0.06), 'gold')
    for x in (-HALF_X, HALF_X):
        shapes.slab(module, (x, 0.0, TOP_M - 0.05), (0.04, HALF_Y * 2 + 0.04, 0.06), 'gold')
    # The maps down its length, the markers on them, a rolled chart weighted at its ends and a pair of dividers.
    sheets = (((-3.9, 0.1), (2.2, 1.6), 0.04, 'linen'), ((-1.4, -0.2), (1.8, 1.3), -0.06, 'bone'),
              ((1.2, 0.2), (2.4, 1.8), 0.02, 'linen'), ((3.9, -0.1), (1.6, 1.2), 0.1, 'bone'))
    pieces = ('gold', 'iron', 'crimson', 'stormcaller_blue', 'lamplighter_gold', 'veiled_dusk')
    for number, (middle, size, turn, material) in enumerate(sheets):
        map_sheet(module, middle, size, turn, material)
        for piece in range(5):
            at = (middle[0] + module.draw(-0.4, 0.4) * size[0], middle[1] + module.draw(-0.35, 0.35) * size[1],
                  TOP_M + 0.012)
            marker(module, at, pieces[(number * 5 + piece) % len(pieces)], (number + piece) % 3)
    shapes.rod(module, (-0.9, 0.95, TOP_M + 0.05), (0.6, 0.95, TOP_M + 0.05), 0.045, 'linen', sides=6)
    for x in (-0.9, 0.6):
        shapes.slab(module, (x, 0.95, TOP_M + 0.06), (0.1, 0.12, 0.12), 'iron', bevel=0.01)
    for side in (-1, 1):
        shapes.slab(module, (2.5 + side * 0.06, -0.85, TOP_M + 0.012), (0.3, 0.012, 0.008), 'gold',
                    turn=(0.0, 0.0, side * 0.25))
    # Candles in brass dishes down the middle.
    for x in (-5.0, -2.6, 0.0, 2.6, 5.0):
        y = 0.75 if x in (-2.6, 2.6) else -0.8
        shapes.lathe(module, (x, y, TOP_M), [(0.1, 0.0), (0.1, 0.02), (0.0, 0.02)], 'gold', sides=10)
        fittings.candle(module, (x, y, TOP_M + 0.02), high=0.22)
    module.socket('front', (0.0, -HALF_Y - 0.5, 0.0), (0, -1))
