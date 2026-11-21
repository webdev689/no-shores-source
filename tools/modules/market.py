"""The townsfolk's market stalls of the Beacon Walk and the quay, 5 x 3 x 3.5 each: a trestle counter on four posts
under a striped canvas awning, the stall's goods laid out on the counter, stacked behind it and hung from a rail at
its back, a keeper's stool. Each faces -y, with sockets `counter`, `keeper` and `front`.

`market-stall-fish`: fish laid on a slanted board, a barrel of eels, a net hung over the rail, fish hung by their
tails. `market-stall-fruit`: baskets heaped with apples, pears and plums, sacks and a crate of them.
`market-stall-pots`: pots, jugs and tall jars of fired clay, a rack of plates, bowls stacked.
"""
import math

import fittings
import kit
import shapes

COUNTER_Y = -1.05
COUNTER_M = 0.9
FRONT_M = 2.8
BACK_M = 3.4


def stall(module, cloths):
    """The stall itself: posts, the counter, the awning, the back rail, the keeper's stool and the sockets."""
    for x in (-2.3, 2.3):
        fittings.post(module, (x, -1.3, 0.0), FRONT_M, side=0.14)
        fittings.post(module, (x, 1.3, 0.0), BACK_M, side=0.14)
        shapes.slab(module, (x, 0.0, FRONT_M + 0.05), (0.1, 2.75, 0.1), 'timber', turn=(math.atan2(BACK_M - FRONT_M,
                    2.6), 0.0, 0.0))
    fittings.counter(module, -2.2, 2.2, COUNTER_Y, high=COUNTER_M, deep=0.65)
    shapes.awning(module, -2.45, 2.45, 1.5, -1.5, BACK_M + 0.05, FRONT_M + 0.05, cloths, stripes=6, sag=0.1,
                  valance=0.28)
    shapes.rod(module, (-2.3, 1.3, 2.4), (2.3, 1.3, 2.4), 0.03, 'timber', sides=6)
    shapes.lathe(module, (1.2, 0.5, 0.0), [(0.2, 0.0), (0.05, 0.03), (0.05, 0.5), (0.18, 0.52), (0.18, 0.58),
                 (0.0, 0.58)], 'timber', sides=8)
    module.socket('counter', (0.0, COUNTER_Y - 0.45, 0.0), (0, -1))
    module.socket('keeper', (0.0, COUNTER_Y + 1.15, 0.0), (0, -1))
    module.socket('front', (0.0, -1.5, 0.0), (0, -1))


def fish(module, at, length=0.36, turn=0.0, material='iron'):
    """A fish lying on `at`: its body, its tail."""
    shapes.ball(module, (at[0], at[1], at[2] + 0.04), length / 2, material, detail=1, scale=(1.0, 0.28, 0.2),
                turn=(0.0, 0.0, turn))
    tail = (at[0] - math.cos(turn) * length * 0.55, at[1] - math.sin(turn) * length * 0.55, at[2] + 0.04)
    shapes.cutout(module, [(0.0, 0.0), (-0.08, 0.06), (-0.08, -0.06)], 0.01, material, tail,
                  turn=(math.pi / 2, 0.0, turn))


def market_stall_fish(module):
    stall(module, ('stormcaller_blue', 'linen'))
    top = COUNTER_M
    # The slanted board of fish on its bed, the scale and a cleaver.
    shapes.slab(module, (-0.6, COUNTER_Y + 0.35, top + 0.1), (2.6, 0.62, 0.04), 'timber', turn=(-0.3, 0.0, 0.0))
    for row in range(3):
        for number in range(9):
            spot = (-1.75 + number * 0.29 + row * 0.08, COUNTER_Y + 0.17 + row * 0.18, top + 0.06 + row * 0.055)
            fish(module, spot, length=module.draw(0.3, 0.42), turn=math.pi / 2 + module.draw(-0.25, 0.25),
                 material=('iron', 'bone', 'crimson')[(number + row) % 3 if number % 4 == 0 else 0])
    shapes.slab(module, (1.4, COUNTER_Y + 0.3, top + 0.02), (0.4, 0.25, 0.03), 'timber')
    shapes.slab(module, (1.4, COUNTER_Y + 0.3, top + 0.05), (0.22, 0.1, 0.02), 'iron')
    shapes.lathe(module, (1.9, COUNTER_Y + 0.3, top), [(0.08, 0.0), (0.02, 0.03), (0.02, 0.3), (0.0, 0.31)], 'gold',
                 sides=6)
    shapes.slab(module, (1.9, COUNTER_Y + 0.3, top + 0.31), (0.36, 0.015, 0.015), 'gold')
    for side in (-1, 1):
        shapes.lathe(module, (1.9 + side * 0.17, COUNTER_Y + 0.3, top + 0.2), [(0.0, 0.0), (0.07, 0.03),
                     (0.07, 0.035)], 'gold', sides=8)
    # A barrel of eels and a tub, a net over the rail, fish hung by their tails.
    fittings.barrel(module, (-1.6, 0.7, 0.0), radius=0.3, high=0.8)
    for eel in range(5):
        shapes.rod(module, (-1.6 + module.draw(-0.15, 0.15), 0.7 + module.draw(-0.15, 0.15), 0.78),
                   (-1.6 + module.draw(-0.2, 0.2), 0.7 + module.draw(-0.2, 0.2), 0.86), 0.02, 'black', sides=4)
    shapes.lathe(module, (-0.85, 0.8, 0.0), [(0.32, 0.0), (0.4, 0.4), (0.36, 0.4), (0.3, 0.05), (0.0, 0.05)], 'timber',
                 sides=12)
    shapes.lathe(module, (-0.85, 0.8, 0.3), [(0.35, 0.0), (0.0, 0.0)], 'water', sides=12, smooth=False)
    module.part((-1.95, 0.35, 0.0), (-0.45, 1.2, 0.85))
    shapes.drape(module, (-2.2, 1.32, 2.42), (-0.4, 1.32, 2.42), 1.1, 'black', folds=4, depth=0.1, hem=0.3)
    for hung in range(5):
        x = 0.2 + hung * 0.38
        shapes.rod(module, (x, 1.3, 2.4), (x, 1.3, 2.15), 0.006, 'linen', sides=3)
        shapes.ball(module, (x, 1.3, 1.92), 0.2, 'iron', detail=1, scale=(0.25, 0.18, 1.0))


def basket(module, at, radius, fruit_material, heaped=True):
    """A woven basket on `at` heaped with fruit."""
    shapes.lathe(module, at, [(radius * 0.7, 0.0), (radius, radius * 0.75), (radius * 0.95, radius * 0.75),
                 (radius * 0.66, 0.04), (0.0, 0.04)], 'timber', sides=10)
    shapes.ring(module, (at[0], at[1], at[2] + radius * 0.75), radius * 0.98, 0.03, 'timber', segments=10, sides=3)
    count = 7 if heaped else 4
    for number in range(count):
        angle = math.tau * number / max(1, count - 1)
        reach = 0.0 if number == count - 1 else radius * 0.55
        shapes.ball(module, (at[0] + math.cos(angle) * reach, at[1] + math.sin(angle) * reach,
                             at[2] + radius * 0.75 + (0.08 if number == count - 1 else 0.0)), radius * 0.28,
                    fruit_material, detail=1)


def market_stall_fruit(module):
    stall(module, ('verdant', 'linen'))
    top = COUNTER_M
    for number, (material, radius) in enumerate((('crimson', 0.24), ('lamplighter_gold', 0.22), ('verdant', 0.24),
                                                 ('veiled_dusk', 0.2), ('crimson', 0.22), ('lamplighter_gold', 0.24))):
        basket(module, (-1.8 + number * 0.72, COUNTER_Y + 0.3 + (number % 2) * 0.08, top), radius, material)
    # Crates of apples stacked behind, sacks, a pyramid of melons on the ground.
    for at, turn in (((-1.6, 0.8, 0.0), 0.05), ((-1.6, 0.8, 0.42), -0.06), ((-0.8, 0.85, 0.0), 0.0)):
        fittings.crate(module, at, (0.7, 0.5, 0.4), turn=turn)
        for apple in range(6):
            shapes.ball(module, (at[0] - 0.22 + (apple % 3) * 0.22, at[1] - 0.1 + (apple // 3) * 0.2, at[2] + 0.4),
                        0.08, 'crimson' if apple % 2 else 'verdant', detail=0)
    module.part((-1.95, 0.55, 0.0), (-0.45, 1.1, 0.85))
    for at in ((0.4, 0.9), (0.85, 0.75)):
        fittings.sack(module, (*at, 0.0), size=0.5)
    for melon, (x, y, z) in enumerate(((1.6, 0.6, 0.0), (1.95, 0.6, 0.0), (1.78, 0.9, 0.0), (1.78, 0.7, 0.26))):
        shapes.ball(module, (x, y, z + 0.15), 0.17, 'verdant', detail=1, scale=(1.0, 1.0, 0.85))
    for hung in range(4):
        x = -1.6 + hung * 0.5
        shapes.rod(module, (x, 1.3, 2.4), (x, 1.3, 2.2), 0.006, 'linen', sides=3)
        for grape in range(4):
            shapes.ball(module, (x + (grape % 2) * 0.06 - 0.03, 1.3, 2.15 - grape * 0.06), 0.05, 'veiled_dusk',
                        detail=0)


def pot(module, at, high, kind):
    """A pot of fired clay on `at`: a round pot, a jug with a lip, or a tall jar."""
    if kind == 0:
        profile = [(0.4, 0.0), (0.62, 0.3), (0.58, 0.7), (0.4, 0.92), (0.44, 1.0), (0.38, 1.0), (0.3, 0.9)]
    elif kind == 1:
        profile = [(0.35, 0.0), (0.5, 0.35), (0.42, 0.65), (0.2, 0.8), (0.22, 0.98), (0.27, 1.0), (0.2, 1.0)]
    else:
        profile = [(0.18, 0.0), (0.35, 0.2), (0.42, 0.55), (0.28, 0.85), (0.16, 0.92), (0.22, 1.0), (0.14, 1.0)]
    shapes.lathe(module, at, [(radius * high, z * high) for radius, z in profile], 'roof', sides=10)


def market_stall_pots(module):
    stall(module, ('crimson', 'linen'))
    top = COUNTER_M
    for number in range(8):
        x = -1.9 + number * 0.52
        pot(module, (x, COUNTER_Y + 0.3 + (number % 2) * 0.1, top), module.draw(0.28, 0.42), number % 3)
    # Big jars on the ground, a rack of plates, a stack of bowls.
    for number, (x, y) in enumerate(((-1.9, 0.7), (-1.35, 0.9), (-0.85, 0.7))):
        pot(module, (x, y, 0.0), module.draw(0.75, 0.95), 2 if number % 2 else 0)
    module.part((-2.2, 0.35, 0.0), (-0.5, 1.2, 0.95))
    rack = (1.0, 1.0, 0.0)
    for x in (-0.6, 0.6):
        fittings.post(module, (rack[0] + x, rack[1], 0.0), 1.6, side=0.06, part=False)
    for shelf in range(3):
        z = 0.45 + shelf * 0.5
        kit.block(module, (rack[0], rack[1], z), (1.3, 0.3, 0.04), 'timber', bevel=0.0, wear=0.0, part=False)
        for plate in range(5):
            shapes.lathe(module, (rack[0] - 0.48 + plate * 0.24, rack[1] + 0.02, z + 0.04 + 0.13),
                         [(0.13, 0.0), (0.1, 0.02), (0.0, 0.02)], 'bone', sides=10, turn=(math.pi / 2 - 0.2, 0.0, 0.0))
    module.part((rack[0] - 0.65, rack[1] - 0.2, 0.0), (rack[0] + 0.65, rack[1] + 0.2, 1.6))
    for bowl in range(4):
        shapes.lathe(module, (1.5, COUNTER_Y + 0.3, top + bowl * 0.05), [(0.08, 0.0), (0.16, 0.08), (0.14, 0.08),
                     (0.06, 0.01)], 'bone' if bowl % 2 else 'roof', sides=10)
