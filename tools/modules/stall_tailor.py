"""The Tailor's atelier (`stall-tailor`), 12 x 9 x 7: a timber-framed hall on a stone sill, open across its front
under a tiled roof. Racks of dyed bolts fill its back wall; lengths of cloth hang from a rail down its west side; two
dress forms, one half-dressed, stand to show the work; the cutting table in its middle is spread with cloth, shears,
chalk and a measuring rod. The counter, stacked with folded cloth, stands under a striped awning, and a sign of shears
and a spool hangs at the east pier. The front faces -y.
"""
import math

import fittings
import kit
import shapes

HALF_X = 6.0
HALF_Y = 4.5
FRONT_Y = -2.4
WALL_M = 4.0
RIDGE_M = 6.6
FLOOR_M = 0.12
DYES = ('crimson', 'verdant', 'stormcaller_blue', 'lamplighter_gold', 'veiled_dusk', 'linen', 'black')


def bolt(module, middle, length, radius, material, along_x=True):
    """A bolt of cloth lying on its side round `middle`: a roll of the cloth with its board core showing at the ends."""
    turn = (0.0, math.pi / 2, 0.0) if along_x else (math.pi / 2, 0.0, 0.0)
    half = length / 2
    foot = (middle[0] - half, middle[1], middle[2]) if along_x else (middle[0], middle[1] + half, middle[2])
    shapes.lathe(module, foot, [(radius, 0.0), (radius, length)], material, sides=6, turn=turn)


def bolt_rack(module, west, east, y):
    """A timber rack of three shelves against the back wall, each laid with bolts lying along it, one on another,
    in every dye."""
    middle = (west + east) / 2
    for x in (west, east):
        fittings.post(module, (x, y, FLOOR_M), 3.0, side=0.1, part=False)
        fittings.post(module, (x, y + 0.4, FLOOR_M), 3.0, side=0.1, part=False)
    module.part((west - 0.05, y - 0.05, FLOOR_M), (east + 0.05, y + 0.45, FLOOR_M + 3.0))
    for shelf in range(3):
        z = FLOOR_M + 0.4 + shelf * 0.9
        kit.block(module, (middle, y + 0.2, z - 0.04), (east - west, 0.5, 0.04), 'timber', bevel=0.0, wear=0.0,
                  part=False)
        x = west + 0.4
        while x < east - 0.35:
            radius = module.draw(0.09, 0.12)
            for layer in range(2 if module.random.random() < 0.6 else 1):
                bolt(module, (x, y + 0.2 - layer * 0.04, z + radius * (1 + 2 * layer)), 0.62, radius,
                     module.random.choice(DYES))
            x += 0.68


def dress_form(module, at, dressed):
    """A dress form on a tripod: a linen torso on a turned stem, half-dressed in a skirt and sash when `dressed`."""
    x, y, z = at
    for leg in range(3):
        angle = math.tau * leg / 3 + 0.3
        shapes.rod(module, (x, y, z + 0.35), (x + math.cos(angle) * 0.35, y + math.sin(angle) * 0.35, z), 0.02,
                   'timber', sides=4)
    shapes.rod(module, (x, y, z + 0.35), (x, y, z + 0.95), 0.025, 'timber', sides=6)
    shapes.lathe(module, (x, y, z + 0.95), [(0.14, 0.0), (0.18, 0.08), (0.14, 0.25), (0.17, 0.45), (0.19, 0.55),
                 (0.12, 0.66), (0.05, 0.7), (0.05, 0.78), (0.0, 0.8)], 'linen', sides=10)
    if dressed:
        shapes.lathe(module, (x, y, z + 0.28), [(0.38, 0.0), (0.3, 0.3), (0.2, 0.6), (0.16, 0.72), (0.0, 0.73)],
                     'crimson', sides=12)
        shapes.lathe(module, (x, y, z + 1.17), [(0.152, 0.0), (0.155, 0.1)], 'lamplighter_gold', sides=10,
                     smooth=False)
    module.part((x - 0.35, y - 0.35, z), (x + 0.35, y + 0.35, z + 1.75))


def cloth_rail(module, x, south, north):
    """A rail on two posts down the west wall, lengths of cloth hung over it in a row of dyes."""
    for y in (south, north):
        fittings.post(module, (x, y, FLOOR_M), 2.7, side=0.12, part=False)
    shapes.rod(module, (x, south, FLOOR_M + 2.6), (x, north, FLOOR_M + 2.6), 0.03, 'iron', sides=6)
    count = 5
    step = (north - south - 0.3) / count
    for hang in range(count):
        start = south + 0.15 + hang * step
        shapes.drape(module, (x, start + 0.05, FLOOR_M + 2.6), (x, start + step - 0.05, FLOOR_M + 2.6),
                     module.draw(1.4, 2.1), DYES[hang % len(DYES)], folds=2, depth=0.06)
    module.part((x - 0.2, south - 0.06, FLOOR_M), (x + 0.2, north + 0.06, FLOOR_M + 2.7))


def cutting_table(module, x, y):
    """The cutting table: a long top on turned legs, a length of cloth spread on it with shears, chalk, a measuring
    rod and a pin cushion, and a basket of offcuts under it."""
    for dx in (-1.1, 1.1):
        for dy in (-0.5, 0.5):
            shapes.lathe(module, (x + dx, y + dy, FLOOR_M), [(0.05, 0.0), (0.035, 0.3), (0.05, 0.5), (0.04, 0.82)],
                         'timber', sides=6)
    kit.block(module, (x, y, FLOOR_M + 0.82), (2.5, 1.2, 0.07), 'timber', bevel=0.01, wear=0.0, part=False)
    module.part((x - 1.25, y - 0.6, FLOOR_M), (x + 1.25, y + 0.6, FLOOR_M + 0.9))
    top = FLOOR_M + 0.89
    shapes.slab(module, (x - 0.2, y, top + 0.005), (1.9, 0.95, 0.01), 'stormcaller_blue')
    shapes.drape(module, (x - 1.15, y - 0.48, top), (x - 1.15, y + 0.48, top), 0.45, 'stormcaller_blue', folds=2,
                 depth=0.03)
    bolt(module, (x + 0.95, y + 0.1, top + 0.12), 1.0, 0.12, 'stormcaller_blue', along_x=False)
    for side in (-1, 1):
        shapes.cutout(module, [(0.0, 0.0), (0.32, 0.015), (0.32, -0.015)], 0.008, 'iron',
                      (x + 0.1, y - 0.15, top + 0.02),
                      turn=(math.pi / 2, 0.0, side * 0.2))
        shapes.ring(module, (x + 0.06, y - 0.15 + side * 0.06, top + 0.02), 0.035, 0.012, 'black', segments=8,
                    sides=3)
    shapes.slab(module, (x - 0.5, y + 0.25, top + 0.015), (0.06, 0.03, 0.02), 'bone', turn=(0.0, 0.0, 0.5))
    shapes.slab(module, (x - 0.2, y + 0.4, top + 0.01), (1.2, 0.04, 0.012), 'timber')
    for mark in range(6):
        shapes.slab(module, (x - 0.75 + mark * 0.2, y + 0.4, top + 0.018), (0.01, 0.03, 0.004), 'gold')
    shapes.ball(module, (x + 0.55, y + 0.3, top + 0.04), 0.06, 'crimson', detail=1, scale=(1.0, 1.0, 0.6))
    shapes.lathe(module, (x + 0.6, y + 0.15, FLOOR_M), [(0.22, 0.0), (0.28, 0.3), (0.0, 0.3)], 'timber', sides=10)
    for scrap in range(4):
        shapes.slab(module, (x + 0.6 + module.draw(-0.12, 0.12), y + 0.15 + module.draw(-0.12, 0.12), FLOOR_M + 0.32),
                    (0.2, 0.15, 0.03), DYES[scrap], turn=(module.draw(-0.3, 0.3), 0.0, module.draw(0, 3)))


def folded_stacks(module, y, z):
    """Folded cloth stacked on the counter in three piles of the dyes."""
    for pile, x in enumerate((-1.6, -0.9, 1.3)):
        for layer in range(3 + pile % 2):
            shapes.slab(module, (x + module.draw(-0.02, 0.02), y, z + 0.04 + layer * 0.07), (0.5, 0.36, 0.065),
                        DYES[(pile * 2 + layer) % len(DYES)], turn=(0.0, 0.0, module.draw(-0.06, 0.06)), bevel=0.015)



def stall_tailor(module):
    fittings.floor(module, -HALF_X + 0.3, FRONT_Y - 0.2, HALF_X - 0.3, HALF_Y - 0.3, FLOOR_M)
    fittings.framed_wall(module, (-HALF_X + 0.3, HALF_Y - 0.3), (HALF_X - 0.3, HALF_Y - 0.3), WALL_M)
    for side in (-1, 1):
        fittings.framed_wall(module, (side * (HALF_X - 0.3), FRONT_Y + 0.2), (side * (HALF_X - 0.3), HALF_Y - 0.45),
                             WALL_M)
    for x in (-HALF_X + 0.3, -2.6, 2.6, HALF_X - 0.3):
        fittings.post(module, (x, FRONT_Y, 0.0), WALL_M, side=0.3)
    kit.block(module, (0.0, FRONT_Y, WALL_M - 0.1), (HALF_X * 2 - 0.3, 0.36, 0.36), 'timber', bevel=0.03, wear=0.0)
    fittings.gable_roof(module, -HALF_X + 0.1, HALF_X - 0.1, FRONT_Y - 0.2, HALF_Y, WALL_M + 0.15, RIDGE_M)
    # The counter under its awning, the folded cloth on it, and the sign at the east pier.
    shapes.awning(module, -2.5, 2.5, FRONT_Y - 0.25, -HALF_Y + 0.15, 3.5, 2.8, ('veiled_dusk', 'lamplighter_gold'),
                  stripes=8)
    fittings.counter(module, -2.4, 2.4, FRONT_Y - 0.9, high=1.0)
    folded_stacks(module, FRONT_Y - 0.55, 1.0)
    # Where a hanging shop sign's bracket is fixed, high on the east front post, facing along the front away from its
    # middle.
    module.socket('sign', (HALF_X - 0.15, FRONT_Y, 3.6), (1, 0))
    # The atelier's goods and work.
    bolt_rack(module, -5.3, -1.4, HALF_Y - 1.1)
    bolt_rack(module, 1.4, 5.3, HALF_Y - 1.1)
    cloth_rail(module, -HALF_X + 0.9, -1.2, 2.6)
    cutting_table(module, 0.6, 0.7)
    dress_form(module, (-3.8, FRONT_Y + 0.9, FLOOR_M), True)
    dress_form(module, (4.2, FRONT_Y + 0.9, FLOOR_M), False)
    for number in range(5):
        shapes.rod(module, (4.7 + (number % 3) * 0.12, 1.2 + (number // 3) * 0.14, FLOOR_M),
                   (4.75 + (number % 3) * 0.16, 1.3 + (number // 3) * 0.2, FLOOR_M + 1.5), 0.09, DYES[number], sides=6)
    module.part((4.5, 1.0, FLOOR_M), (5.2, 1.6, FLOOR_M + 1.5))
    fittings.lantern(module, (0.0, -0.6, 3.0), size=0.3, hung_from=WALL_M + 0.2)
    module.socket('counter', (0.0, FRONT_Y - 1.35, 0.0), (0, -1))
    module.socket('keeper', (0.0, FRONT_Y + 0.25, FLOOR_M), (0, -1))
