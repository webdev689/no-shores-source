"""The Tack's stable (`stall-tack`), 20 x 12 x 8: a long timber-framed stable on a stone sill under a tiled roof. Its
west end holds two horse stalls behind half doors, each with a manger, a hay rack and straw; its middle bay is the
hay store, bales stacked to the plate with a fork leaning on them; its east end is the tack room, open to the street
across a counter under a striped awning, saddles on pegs and bridles hung on its back wall, a blanket over a rail and
a chest of brasses. A water trough stands before the stalls, and a sign of a horseshoe hangs at the east pier. The
front faces -y.
"""
import math

import fittings
import kit
import shapes

HALF_X = 10.0
HALF_Y = 6.0
FRONT_Y = -2.0
BACK_Y = HALF_Y - 0.4
WALL_M = 4.0
RIDGE_M = 7.0
FLOOR_M = 0.12
# The bays along x: two horse stalls, the hay store, the tack room.
STALLS = ((-9.6, -5.6), (-5.6, -1.6))
HAY = (-1.6, 2.2)
TACK = (2.2, 9.6)


def horse_stall(module, west, east, cloth):
    """A horse stall: a half door across its front, a manger and a hay rack on the back wall, straw on its floor, a
    bucket in its corner."""
    middle = (west + east) / 2
    width = east - west - 0.3
    # The half door, its leaf boarded and braced, its frame posts carried by the bays' walls.
    kit.block(module, (middle, FRONT_Y, FLOOR_M), (width, 0.1, 1.3), 'timber', bevel=0.01, wear=0.0, part=False)
    module.part((west, FRONT_Y - 0.1, 0.0), (east, FRONT_Y + 0.1, FLOOR_M + 1.3))
    for z in (0.25, 1.2):
        shapes.slab(module, (middle, FRONT_Y - 0.07, FLOOR_M + z), (width - 0.1, 0.04, 0.12), 'timber')
    shapes.slab(module, (middle, FRONT_Y - 0.07, FLOOR_M + 0.72), (math.hypot(width - 0.2, 0.9), 0.04, 0.12),
                'timber', turn=(0.0, -math.atan2(0.9, width - 0.2), 0.0))
    shapes.slab(module, (middle - width / 2 + 0.25, FRONT_Y - 0.1, FLOOR_M + 0.95), (0.25, 0.03, 0.05), 'iron')
    # A horse blanket thrown over the door's top, in the stable's colours.
    for side in (-1, 1):
        shapes.slab(module, (middle + 0.4, FRONT_Y + side * 0.09, FLOOR_M + 1.05), (1.2, 0.03, 0.55), cloth)
    shapes.slab(module, (middle + 0.4, FRONT_Y, FLOOR_M + 1.33), (1.2, 0.21, 0.03), cloth)
    # The manger and the hay rack over it.
    kit.block(module, (middle, BACK_Y - 0.45, FLOOR_M), (width - 0.6, 0.6, 0.95), 'timber', bevel=0.02, wear=0.0)
    kit.block(module, (middle, BACK_Y - 0.45, FLOOR_M + 0.9), (width - 0.8, 0.4, 0.06), 'straw', bevel=0.03,
              wear=0.02, part=False)
    for bar in range(9):
        x = middle - width / 2 + 0.6 + bar * (width - 1.2) / 8
        shapes.rod(module, (x, BACK_Y - 0.08, FLOOR_M + 1.5), (x, BACK_Y - 0.6, FLOOR_M + 2.3), 0.018, 'iron', sides=4)
    shapes.slab(module, (middle, BACK_Y - 0.6, FLOOR_M + 2.3), (width - 1.0, 0.05, 0.08), 'iron')
    shapes.slab(module, (middle, BACK_Y - 0.3, FLOOR_M + 1.75), (width - 1.2, 0.35, 0.35), 'straw',
                turn=(0.5, 0.0, 0.0), bevel=0.05)
    # Straw spread over the floor, and the bucket.
    for tuft in range(5):
        shapes.slab(module, (middle + module.draw(-1.2, 1.2), module.draw(FRONT_Y + 1.2, BACK_Y - 1.5), FLOOR_M + 0.02),
                    (module.draw(0.8, 1.4), module.draw(0.6, 1.1), 0.04), 'straw', turn=(0.0, 0.0, module.draw(0, 3)))
    shapes.lathe(module, (east - 0.6, FRONT_Y + 0.7, FLOOR_M), [(0.16, 0.0), (0.2, 0.34), (0.0, 0.34)], 'timber',
                 sides=8)
    shapes.ring(module, (east - 0.6, FRONT_Y + 0.7, FLOOR_M + 0.3), 0.2, 0.02, 'iron', segments=10, sides=3)


def bale(module, at, turn=0.0, size=(1.0, 0.5, 0.45)):
    """A bound bale of hay, lighter than the kit's roughened one since a stable stacks dozens: a bevelled block of
    straw and its two cords."""
    kit.block(module, at, size, 'straw', turn=turn, bevel=0.04, wear=0.0, part=False)
    cos, sin = math.cos(turn), math.sin(turn)
    for share in (-0.25, 0.25):
        spot = (at[0] + cos * size[0] * share, at[1] + sin * size[0] * share, at[2] + size[2] / 2)
        shapes.slab(module, spot, (0.025, size[1] + 0.02, size[2] + 0.02), 'timber', turn=(0.0, 0.0, turn))


def partition(module, x):
    """A boarded partition between two bays, from the stall front to the back wall: boards to shoulder height and
    iron bars over them, so neighbours see each other."""
    south, north = FRONT_Y + 0.15, BACK_Y - 0.15
    middle = (south + north) / 2
    kit.block(module, (x, middle, FLOOR_M), (0.12, north - south, 1.5), 'timber', bevel=0.01, wear=0.0)
    shapes.slab(module, (x, middle, FLOOR_M + 1.55), (0.18, north - south, 0.1), 'timber')
    for bar in range(int((north - south) / 0.3)):
        y = south + 0.15 + bar * 0.3
        shapes.rod(module, (x, y, FLOOR_M + 1.6), (x, y, WALL_M - 0.1), 0.015, 'iron', sides=3)
    module.part((x - 0.06, south, FLOOR_M + 1.5), (x + 0.06, north, WALL_M))


def hay_store(module, west, east):
    """The middle bay: bales stacked against its back wall up toward the plate, a few fallen out, a fork leaning."""
    middle = (west + east) / 2
    for layer in range(4):
        for row in range(2 if layer < 2 else 1):
            for column in range(3):
                at = (middle - 1.1 + column * 1.1 + module.draw(-0.05, 0.05), BACK_Y - 0.4 - row * 0.55,
                      FLOOR_M + layer * 0.45)
                bale(module, at, turn=module.draw(-0.04, 0.04))
    module.part((middle - 1.7, BACK_Y - 1.2, FLOOR_M), (middle + 1.7, BACK_Y, FLOOR_M + 1.8))
    bale(module, (middle - 0.6, BACK_Y - 2.3, FLOOR_M), turn=0.4)
    bale(module, (middle + 0.8, BACK_Y - 2.5, FLOOR_M), turn=-0.2)
    module.part((middle - 1.2, BACK_Y - 2.9, FLOOR_M), (middle + 1.4, BACK_Y - 1.9, FLOOR_M + 0.45))
    fork = (middle + 1.5, BACK_Y - 2.0, FLOOR_M)
    shapes.rod(module, fork, (fork[0] + 0.3, fork[1] + 0.1, fork[2] + 1.6), 0.02, 'timber', sides=5)
    for tine in (-1, 0, 1):
        shapes.rod(module, (fork[0] + 0.3 + tine * 0.05, fork[1] + 0.1, fork[2] + 1.6),
                   (fork[0] + 0.36 + tine * 0.06, fork[1] + 0.12, fork[2] + 1.95), 0.008, 'iron', sides=3)


def saddle(module, at, cloth):
    """A saddle on a peg out from the back wall: its seat and skirts, the pommel and cantle, a cloth under it and the
    stirrups hanging."""
    x, y, z = at
    shapes.rod(module, (x, y + 0.45, z - 0.12), (x, y - 0.25, z - 0.12), 0.05, 'timber', sides=6)
    shapes.slab(module, (x, y, z - 0.12), (0.62, 0.62, 0.03), cloth, turn=(0.0, 0.0, 0.0))
    for side in (-1, 1):
        shapes.slab(module, (x + side * 0.36, y, z - 0.26), (0.02, 0.62, 0.3), cloth, turn=(0.0, side * 0.25, 0.0))
    shapes.ball(module, (x, y, z), 0.3, 'timber', detail=1, scale=(1.05, 1.3, 0.35))
    shapes.ball(module, (x, y - 0.32, z + 0.1), 0.1, 'timber', detail=1, scale=(1.2, 0.8, 0.9))
    shapes.ball(module, (x, y + 0.3, z + 0.12), 0.14, 'timber', detail=1, scale=(1.4, 0.5, 0.8))
    for side in (-1, 1):
        shapes.slab(module, (x + side * 0.33, y - 0.05, z - 0.42), (0.02, 0.05, 0.55), 'black')
        shapes.ring(module, (x + side * 0.33, y - 0.05, z - 0.74), 0.07, 0.025, 'iron', turn=(0.0, math.pi / 2, 0.0),
                    segments=8, sides=3)


def bridle(module, at):
    """A bridle hung on a peg: its crown, cheek straps and reins falling in a loop, the bit across."""
    x, y, z = at
    shapes.rod(module, (x, y + 0.1, z), (x, y - 0.12, z), 0.02, 'timber', sides=4)
    shapes.ring(module, (x, y - 0.06, z - 0.25), 0.22, 0.025, 'black', turn=(math.pi / 2, 0.0, 0.0), segments=10,
                sides=3)
    shapes.ring(module, (x, y - 0.06, z - 0.6), 0.16, 0.02, 'black', turn=(math.pi / 2, 0.0, 0.0), segments=10,
                sides=3)
    shapes.rod(module, (x - 0.14, y - 0.07, z - 0.42), (x + 0.14, y - 0.07, z - 0.42), 0.012, 'iron', sides=3)


def tack_room(module, west, east):
    """The tack room behind the counter: saddles on two rows of pegs, bridles on a rail, a blanket over a rail and a
    chest of brasses, a lantern, and the counter with a saddle set on it under the awning."""
    cloths = ('crimson', 'verdant', 'stormcaller_blue', 'veiled_dusk')
    for row, z in enumerate((1.25, 2.35)):
        for column in range(3):
            saddle(module, (west + 1.0 + column * 1.0, BACK_Y - 0.55, FLOOR_M + z), cloths[(row * 3 + column) % 4])
    module.part((west + 0.5, BACK_Y - 0.9, FLOOR_M), (west + 3.5, BACK_Y, FLOOR_M + 2.6))
    shapes.slab(module, (east - 2.0, BACK_Y - 0.1, FLOOR_M + 1.9), (2.6, 0.06, 0.1), 'timber')
    for hang in range(5):
        bridle(module, (east - 3.0 + hang * 0.5, BACK_Y - 0.1, FLOOR_M + 1.85))
    shapes.rod(module, (east - 0.4, -0.2, FLOOR_M + 1.2), (east - 0.4, 1.8, FLOOR_M + 1.2), 0.04, 'timber', sides=6)
    for y in (-0.2, 1.8):
        fittings.post(module, (east - 0.4, y, FLOOR_M), 1.2, side=0.1, part=False)
    shapes.drape(module, (east - 0.4, -0.1, FLOOR_M + 1.24), (east - 0.4, 1.7, FLOOR_M + 1.24), 0.9,
                 'stormcaller_blue', folds=2, depth=0.04)
    module.part((east - 0.6, -0.3, FLOOR_M), (east - 0.2, 1.9, FLOOR_M + 1.3))
    fittings.chest(module, (west + 1.3, 1.0, FLOOR_M), (1.0, 0.6, 0.6), turn=math.pi / 2)
    module.part((west + 0.95, 0.45, FLOOR_M), (west + 1.65, 1.55, FLOOR_M + 0.7))
    fittings.lantern(module, ((west + east) / 2, 0.8, 3.0), size=0.3, hung_from=WALL_M + 0.2)
    shapes.awning(module, west + 1.1, east - 0.5, FRONT_Y - 0.25, -HALF_Y + 0.15, 3.4, 2.75, ('verdant', 'linen'),
                  stripes=8)
    fittings.counter(module, west + 1.2, east - 0.6, FRONT_Y - 0.9, high=1.0)
    saddle(module, (west + 2.4, FRONT_Y - 0.55, 1.28), 'crimson')
    for brass in range(4):
        shapes.lathe(module, (east - 2.0 + brass * 0.18, FRONT_Y - 0.5, 1.0), [(0.06, 0.0), (0.06, 0.012),
                     (0.0, 0.02)], 'gold', sides=8)


def trough(module, x, y):
    """A stone water trough before the stalls, dark water in it, a bucket by it."""
    kit.block(module, (x, y, 0.0), (2.6, 0.8, 0.75), 'stone', bevel=0.05, wear=0.03)
    kit.block(module, (x, y, 0.6), (2.4, 0.6, 0.1), 'water', bevel=0.0, wear=0.0, part=False)
    shapes.lathe(module, (x + 1.65, y + 0.1, 0.0), [(0.16, 0.0), (0.2, 0.36), (0.0, 0.36)], 'timber', sides=8)



def stall_tack(module):
    # A cobbled floor on a stone plinth: the stalls' floors carry straw, and the tack room's its flags.
    kit.block(module, (0.0, (FRONT_Y - 0.2 + BACK_Y) / 2, 0.0), (HALF_X * 2 - 0.6, BACK_Y - FRONT_Y + 0.2, FLOOR_M),
              'stone', bevel=0.03, wear=0.0)
    kit.block(module, ((-HALF_X + TACK[0]) / 2, (FRONT_Y - 0.2 + BACK_Y) / 2, FLOOR_M - 0.02),
              (TACK[0] + HALF_X - 0.7, BACK_Y - FRONT_Y, 0.04), 'paving', bevel=0.0, wear=0.0, part=False)
    fittings.floor(module, TACK[0], FRONT_Y - 0.2, TACK[1], BACK_Y, FLOOR_M)
    fittings.framed_wall(module, (-HALF_X + 0.3, BACK_Y), (HALF_X - 0.3, BACK_Y), WALL_M)
    for x in (-HALF_X + 0.4, HAY[1], HALF_X - 0.4):
        fittings.framed_wall(module, (x, FRONT_Y + 0.15), (x, BACK_Y - 0.15), WALL_M)
    for x in (STALLS[0][1], STALLS[1][1]):
        partition(module, x)
    for x in (-HALF_X + 0.4, STALLS[0][1], STALLS[1][1], HAY[1], 5.9, HALF_X - 0.4):
        fittings.post(module, (x, FRONT_Y, 0.0), WALL_M, side=0.3)
    kit.block(module, (0.0, FRONT_Y, WALL_M - 0.1), (HALF_X * 2 - 0.4, 0.36, 0.36), 'timber', bevel=0.03, wear=0.0)
    fittings.gable_roof(module, -HALF_X + 0.15, HALF_X - 0.15, FRONT_Y - 0.2, HALF_Y - 0.2, WALL_M + 0.15, RIDGE_M)
    # A louvred vent on the ridge over the hay, as a stable has.
    kit.block(module, (sum(HAY) / 2, (FRONT_Y + HALF_Y) / 2 - 0.1, RIDGE_M - 0.2), (1.4, 1.2, 0.6), 'timber',
              bevel=0.02, wear=0.0, part=False)
    shapes.pyramid(module, (sum(HAY) / 2, (FRONT_Y + HALF_Y) / 2 - 0.1, RIDGE_M + 0.4), 1.0, 0.9, 0.5, 'roof')
    for stall, cloth in zip(STALLS, ('crimson', 'stormcaller_blue')):
        horse_stall(module, *stall, cloth)
    # Bales stacked out before the hay store, ready to go in.
    for layer, spots in enumerate(((-0.9, 0.2), (-0.35, ))):
        for x in spots:
            bale(module, (sum(HAY) / 2 + x + 0.3, FRONT_Y - 1.1, layer * 0.45), turn=0.05 * layer)
            if layer == 0:
                bale(module, (sum(HAY) / 2 + x + 0.3, FRONT_Y - 1.65, 0.0), turn=-0.03)
    module.part((sum(HAY) / 2 - 1.1, FRONT_Y - 1.95, 0.0), (sum(HAY) / 2 + 1.05, FRONT_Y - 0.8, 0.9))
    hay_store(module, *HAY)
    tack_room(module, *TACK)
    trough(module, -5.6, FRONT_Y - 2.0)
    for x in (STALLS[0][1], HAY[1]):
        fittings.lantern(module, (x, FRONT_Y - 0.35, 2.6), size=0.28)
        shapes.rod(module, (x, FRONT_Y - 0.15, 2.55), (x, FRONT_Y - 0.35, 2.55), 0.025, 'iron', sides=4)
    for ring_x in (-9.0, -5.0):
        shapes.ring(module, (ring_x, FRONT_Y - 0.17, 1.4), 0.08, 0.025, 'iron', turn=(math.pi / 2, 0.0, 0.0),
                    segments=8, sides=3)
    # Where a hanging shop sign's bracket is fixed, high on the east front post, facing along the front away from its
    # middle.
    module.socket('sign', (HALF_X - 0.25, FRONT_Y, 3.6), (1, 0))
    middle = (TACK[0] + 1.2 + TACK[1] - 0.6) / 2
    module.socket('counter', (middle, FRONT_Y - 1.35, 0.0), (0, -1))
    module.socket('keeper', (middle, FRONT_Y + 0.7, FLOOR_M), (0, -1))
