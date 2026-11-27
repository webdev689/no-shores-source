"""A vault house (`stall-vault`), 7 x 6 x 6: a strongroom of heavy cut stone with quoined corners, a plinth, a string
course and a deep cornice under a low stone cap and a gilt finial. Its front is pierced by the counter window, barred
by an iron grille over a stone ledge the customer leans on; through the bars the chests stacked inside show, and the
sacks and the ledger on the keeper's table. An iron-bound door in its east side lets the keeper in. The front faces
-y. Placed twice in the Watch Court.
"""
import math

import fittings
import kit
import shapes

HALF_X = 3.5
HALF_Y = 3.0
THICK_M = 0.6
WALL_M = 4.6
FLOOR_M = 0.2
# The front wall's inner face; its outer face stands THICK_M before it, the ledge before that.
FRONT_Y = -1.9
OUTER_Y = FRONT_Y - THICK_M
WINDOW = (-1.25, 1.25, 0.95, 2.45)


def quoins(module, x, y):
    """Big and small blocks in turn up a corner, standing a little proud of both faces."""
    z = 0.4
    course = 0
    while z < WALL_M - 0.3:
        big = course % 2 == 0
        size = (0.9 if big else 0.6, 0.6 if big else 0.9, 0.5)
        kit.block(module, (x, y, z), (size[0] + 0.08, size[1] + 0.08, 0.48), 'trim', bevel=0.05, wear=0.03,
                  part=False)
        z += 0.5
        course += 1


def door(module, x, middle_y):
    """An iron-bound door set in the east wall: planks, three straps with spearhead ends, studs, a great lock and a
    ring pull, under a stone lintel."""
    high, wide = 2.4, 1.2
    shapes.slab(module, (x + 0.02, middle_y, FLOOR_M + high / 2), (0.1, wide, high), 'timber')
    for plank in range(1, 5):
        shapes.slab(module, (x + 0.075, middle_y - wide / 2 + plank * wide / 5, FLOOR_M + high / 2),
                    (0.012, 0.02, high - 0.05), 'black')
    for z in (0.35, 1.2, 2.05):
        shapes.slab(module, (x + 0.09, middle_y, FLOOR_M + z), (0.025, wide - 0.06, 0.1), 'iron')
        shapes.cutout(module, [(0.0, 0.0), (0.12, 0.07), (0.0, 0.14)], 0.025, 'iron',
                      (x + 0.09, middle_y - wide / 2 + 0.03, FLOOR_M + z - 0.07), turn=(0.0, 0.0, -math.pi / 2))
        for stud in range(5):
            shapes.slab(module, (x + 0.11, middle_y - 0.45 + stud * 0.225, FLOOR_M + z), (0.03, 0.04, 0.04),
                        'iron', turn=(0.0, 0.0, math.pi / 4))
    shapes.slab(module, (x + 0.1, middle_y + 0.3, FLOOR_M + 1.05), (0.06, 0.24, 0.32), 'iron', bevel=0.01)
    shapes.slab(module, (x + 0.14, middle_y + 0.3, FLOOR_M + 1.08), (0.02, 0.05, 0.1), 'gold')
    shapes.ring(module, (x + 0.15, middle_y + 0.3, FLOOR_M + 0.82), 0.09, 0.025, 'iron', turn=(0.0, math.pi / 2, 0.0),
                segments=12, sides=4)
    kit.block(module, (x - 0.02, middle_y, FLOOR_M + high), (0.3, wide + 0.6, 0.4), 'trim', bevel=0.04, wear=0.02,
              part=False)
    kit.block(module, (x + 0.2, middle_y, 0.0), (0.5, wide + 0.3, FLOOR_M), 'stone', bevel=0.03, wear=0.0, part=True)


def grille(module, west, east, y, low, high):
    """An iron grille across the counter window: round bars with spiked heads through flat rails."""
    bars = 9
    for bar in range(bars):
        x = west + 0.12 + (east - west - 0.24) * bar / (bars - 1)
        shapes.rod(module, (x, y, low), (x, y, high), 0.022, 'iron', sides=6)
    for z in (low + 0.08, low + (high - low) * 0.55, high - 0.08):
        shapes.slab(module, ((west + east) / 2, y, z), (east - west, 0.05, 0.05), 'iron')
    for z in (high - 0.35, ):
        for bar in range(bars - 1):
            x = west + 0.12 + (east - west - 0.24) * (bar + 0.5) / (bars - 1)
            shapes.ring(module, (x, y, z), 0.07, 0.015, 'iron', turn=(math.pi / 2, 0.0, 0.0), segments=8, sides=3)


def hoard(module):
    """What the strongroom keeps: chests stacked against its walls, sacks of coin, a strongbox, and the keeper's table
    with its ledger, scales and a candle."""
    for at, size, turn in (((-2.1, 1.9, FLOOR_M), (1.0, 0.6, 0.6), 0.0), ((-2.1, 1.9, FLOOR_M + 0.62),
                           (0.9, 0.55, 0.5), 0.05), ((-0.9, 2.0, FLOOR_M), (1.1, 0.6, 0.62), 0.0),
                           ((2.2, 1.6, FLOOR_M), (0.6, 1.0, 0.6), math.pi / 2), ((-2.25, 0.6, FLOOR_M),
                           (0.6, 0.9, 0.55), math.pi / 2), ((-0.95, 2.0, FLOOR_M + 0.64), (0.8, 0.5, 0.45), -0.08)):
        fittings.chest(module, at, size, turn)
    module.part((-2.9, 1.3, FLOOR_M), (-1.6, 2.4, FLOOR_M + 1.2))
    module.part((-1.5, 1.6, FLOOR_M), (-0.3, 2.4, FLOOR_M + 1.1))
    for at in ((0.3, 2.1), (0.75, 2.15), (0.5, 1.7), (1.4, 2.2)):
        fittings.sack(module, (*at, FLOOR_M), size=0.42, material='linen')
    # A heap of gold spilled from an open chest by the sacks.
    for coin in range(14):
        shapes.lathe(module, (1.2 + module.draw(-0.25, 0.25), 1.45 + module.draw(-0.2, 0.2), FLOOR_M + 0.01 * coin),
                     [(0.03, 0.0), (0.03, 0.008), (0.0, 0.008)], 'gold', sides=8)
    table = (1.4, -0.8, FLOOR_M)
    for dx in (-0.55, 0.55):
        for dy in (-0.3, 0.3):
            fittings.post(module, (table[0] + dx, table[1] + dy, FLOOR_M), 0.78, side=0.07, part=False)
    kit.block(module, (table[0], table[1], FLOOR_M + 0.78), (1.3, 0.8, 0.06), 'timber', bevel=0.01, wear=0.0,
              part=False)
    module.part((table[0] - 0.65, table[1] - 0.4, FLOOR_M), (table[0] + 0.65, table[1] + 0.4, FLOOR_M + 0.84))
    top = FLOOR_M + 0.84
    for side in (-1, 1):
        shapes.slab(module, (table[0] - 0.2 + side * 0.15, table[1], top + 0.02), (0.28, 0.4, 0.025), 'bone',
                    turn=(0.0, side * 0.06, 0.0))
    shapes.slab(module, (table[0] - 0.2, table[1], top + 0.005), (0.62, 0.44, 0.02), 'verdant')
    shapes.lathe(module, (table[0] + 0.35, table[1] + 0.1, top), [(0.07, 0.0), (0.02, 0.03), (0.015, 0.35),
                 (0.0, 0.36)], 'gold', sides=8)
    shapes.slab(module, (table[0] + 0.35, table[1] + 0.1, top + 0.33), (0.4, 0.015, 0.015), 'gold')
    for side in (-1, 1):
        shapes.rod(module, (table[0] + 0.35 + side * 0.19, table[1] + 0.1, top + 0.33),
                   (table[0] + 0.35 + side * 0.19, table[1] + 0.1, top + 0.2), 0.004, 'gold', sides=3)
        shapes.lathe(module, (table[0] + 0.35 + side * 0.19, table[1] + 0.1, top + 0.18), [(0.0, 0.0), (0.07, 0.03),
                     (0.07, 0.035)], 'gold', sides=10)
    fittings.candle(module, (table[0] - 0.55, table[1] + 0.25, top), high=0.2)


def build(module):
    fittings.floor(module, -HALF_X + THICK_M, FRONT_Y, HALF_X - THICK_M, HALF_Y - THICK_M, FLOOR_M)
    # The four walls: the front pierced by the counter window, the east by the door.
    front = kit.block(module, (0.0, FRONT_Y - THICK_M / 2, 0.0), (HALF_X * 2, THICK_M, WALL_M), 'stone', bevel=0.05,
                      wear=0.02, cuts=2)
    west, east, low, high = WINDOW
    hole = kit.block(module, ((west + east) / 2, FRONT_Y - THICK_M / 2, low), (east - west, THICK_M + 0.4, high - low),
                     'stone', bevel=0.0, wear=0.0, part=False)
    module.objects.remove(hole)
    kit.cut(front, hole)
    kit.block(module, (0.0, HALF_Y - THICK_M / 2, 0.0), (HALF_X * 2, THICK_M, WALL_M), 'stone', bevel=0.05,
              wear=0.02, cuts=2)
    side = (THICK_M, HALF_Y - THICK_M - FRONT_Y, WALL_M)
    kit.block(module, (-HALF_X + THICK_M / 2, (FRONT_Y + HALF_Y - THICK_M) / 2, 0.0), side, 'stone', bevel=0.05,
              wear=0.02, cuts=2)
    door_y = -0.6
    for south, north in ((FRONT_Y, door_y - 0.6), (door_y + 0.6, HALF_Y - THICK_M)):
        kit.block(module, (HALF_X - THICK_M / 2, (south + north) / 2, 0.0), (THICK_M, north - south, WALL_M),
                  'stone', bevel=0.05, wear=0.02, cuts=1)
    kit.block(module, (HALF_X - THICK_M / 2, door_y, FLOOR_M + 2.4), (THICK_M, 1.2, WALL_M - FLOOR_M - 2.4), 'stone',
              bevel=0.03, wear=0.02)
    door(module, HALF_X - THICK_M / 2, door_y)
    for x in (-HALF_X + 0.3, HALF_X - 0.3):
        for y in (OUTER_Y + 0.3, HALF_Y - 0.3):
            quoins(module, x, y)
    # Plinth, string course and cornice round all four faces, and the cap and finial on the roof.
    for z, out, high_m in ((0.0, 0.1, 0.4), (2.9, 0.06, 0.2), (WALL_M - 0.1, 0.18, 0.45)):
        band(module, OUTER_Y, HALF_Y, z, out, high_m)
    kit.block(module, (0.0, (OUTER_Y + HALF_Y) / 2, WALL_M - 0.1), (HALF_X * 2, HALF_Y - OUTER_Y, 0.45), 'stone',
              bevel=0.0, wear=0.0, part=False)
    cap = (0.0, (OUTER_Y + HALF_Y) / 2, WALL_M + 0.35)
    shapes.pyramid(module, cap, HALF_X + 0.18, (HALF_Y - OUTER_Y) / 2 + 0.18, 1.3, 'stone')
    module.part((-HALF_X, OUTER_Y, WALL_M), (HALF_X, HALF_Y, WALL_M + 0.8))
    shapes.lathe(module, (cap[0], cap[1], WALL_M + 1.6), [(0.14, 0.0), (0.08, 0.15), (0.16, 0.3), (0.0, 0.62)], 'gold',
                 sides=8)
    # The counter window: a stone ledge out front, the grille in the wall, the keeper's own sill inside.
    fittings.counter(module, west - 0.15, east + 0.15, OUTER_Y - 0.5, high=low + 0.1, deep=0.5,
                     top='trim', front='stone', panels=False)
    keys(module, (0.0, OUTER_Y - 0.03, high + 0.3))
    grille(module, west, east, FRONT_Y - THICK_M / 2, low, high)
    hoard(module)
    for x in (west - 0.6, east + 0.6):
        fittings.lantern(module, (x, OUTER_Y - 0.18, 2.55), size=0.28)
        shapes.rod(module, (x, OUTER_Y, 2.5), (x, OUTER_Y - 0.18, 2.5), 0.03, 'iron', sides=6)
    module.socket('counter', (0.0, OUTER_Y - 0.95, 0.0), (0, -1))
    module.socket('keeper', (0.0, FRONT_Y + 0.55, FLOOR_M), (0, -1))
    # Where a hanging shop sign's bracket is fixed, high on the east front quoins, facing along the front away from its
    # middle.
    module.socket('sign', (HALF_X + 0.2, OUTER_Y + 0.3, 3.6), (1, 0))


def band(module, south, north, z, out, high):
    """A moulded band round the house's four outer faces from `south` to `north`, standing `out` proud of them."""
    width = HALF_X * 2 + out * 2
    for y in (south, north):
        kit.block(module, (0.0, y, z), (width, out * 2 + 0.1, high), 'trim', bevel=0.04, wear=0.0, part=False)
    for x in (-HALF_X, HALF_X):
        kit.block(module, (x, (south + north) / 2, z), (out * 2 + 0.1, north - south, high), 'trim', bevel=0.04,
                  wear=0.0, part=False)


def keys(module, at):
    """A great gilt key laid across a stone roundel over the window, a ring of coins round it: what the house keeps,
    told without a word."""
    shapes.lathe(module, at, [(0.36, 0.0), (0.36, 0.06), (0.3, 0.1), (0.0, 0.1)], 'trim', sides=20,
                 turn=(math.pi / 2, 0.0, 0.0))
    x, y, z = at[0], at[1] - 0.12, at[2]
    shapes.slab(module, (x + 0.04, y, z), (0.36, 0.04, 0.04), 'gold')
    shapes.ring(module, (x - 0.2, y, z), 0.07, 0.03, 'gold', turn=(math.pi / 2, 0.0, 0.0), segments=12, sides=4)
    for tooth, drop in ((0.15, 0.1), (0.2, 0.07)):
        shapes.slab(module, (x + tooth, y, z - drop / 2), (0.035, 0.04, drop), 'gold')
    for coin in range(10):
        angle = math.tau * coin / 10
        shapes.lathe(module, (x + math.cos(angle) * 0.27, y + 0.02, z + math.sin(angle) * 0.27), [(0.03, 0.0),
                     (0.03, 0.015), (0.0, 0.015)], 'gold', sides=8, turn=(math.pi / 2, 0.0, 0.0), smooth=False)
