"""What fills the hub's courts so no ground lies bare (crates/city/src/hub/dress.rs lays them out): three more market
stalls (cloth, bread, flowers), a court tree in its raised ring bed, a lawn bed, a table with benches for drinkers, a
table under a parasol, a woodpile, a stack of barrels, a cart of flowers and a stack of hay bales. Each faces -y and is
stood by its `front`; a table's sitters' places are `seat-1` and on.
"""
import math

import bpy  # noqa: F401 (the modules below load bmesh, which loads only after bpy)
import fittings
import kit
import market
import props
import shapes
import stall_tailor


def market_stall_cloth(module):
    market.stall(module, ('lamplighter_gold', 'linen'))
    top = market.COUNTER_M
    for number, cloth in enumerate(('crimson', 'verdant', 'stormcaller_blue', 'linen', 'veiled_dusk', 'straw')):
        stall_tailor.bolt(module, (-1.75 + number * 0.7, market.COUNTER_Y + 0.25, top + 0.1), 0.6, 0.1, cloth,
                          along_x=False)
    for number, cloth in enumerate(('crimson', 'lamplighter_gold', 'verdant')):
        x = -1.6 + number * 1.1
        shapes.drape(module, (x, 1.32, 2.42), (x + 0.9, 1.32, 2.42), 1.6, cloth, folds=3, depth=0.08)
    for at in ((1.3, 0.8), (1.75, 0.6)):
        fittings.crate(module, (*at, 0.0), (0.6, 0.5, 0.45), turn=0.1)
    module.part((1.0, 0.35, 0.0), (2.05, 1.1, 0.5))


def loaf(module, at, turn):
    shapes.ball(module, (at[0], at[1], at[2] + 0.06), 0.13, 'straw', detail=1, scale=(1.0, 0.55, 0.45),
                turn=(0.0, 0.0, turn))


def market_stall_bread(module):
    market.stall(module, ('straw', 'crimson'))
    top = market.COUNTER_M
    for number in range(4):
        x = -1.6 + number * 1.05
        market.basket(module, (x, market.COUNTER_Y + 0.3, top), 0.26, 'straw')
    for row in range(2):
        for number in range(7):
            loaf(module, (-1.9 + number * 0.6 + row * 0.25, market.COUNTER_Y + 0.05 + row * 0.18, top),
                 0.3 * (number % 3 - 1))
    for at in ((-1.6, 0.8), (-1.0, 0.85), (-1.3, 0.75)):
        fittings.sack(module, (*at, 0.0 if at[0] != -1.3 else 0.42), size=0.55)
    module.part((-1.95, 0.45, 0.0), (-0.7, 1.15, 0.9))
    shapes.lathe(module, (1.4, 0.8, 0.0), [(0.3, 0.0), (0.32, 0.6), (0.28, 0.62), (0.0, 0.62)], 'timber', sides=10)
    module.part((1.08, 0.48, 0.0), (1.72, 1.12, 0.62))


def bunch(module, at, colours, high=0.45):
    """A bunch of flowers standing in a pail on `at`."""
    shapes.lathe(module, at, [(0.14, 0.0), (0.18, 0.3), (0.16, 0.3), (0.0, 0.05)], 'iron', sides=8)
    for stem in range(7):
        angle = math.tau * stem / 7
        top = (at[0] + math.cos(angle) * 0.12, at[1] + math.sin(angle) * 0.12, at[2] + high + module.draw(0.0, 0.12))
        # Upright, so no turn: a slanted rod's turn rounds differently on another machine and the bake differs.
        shapes.rod(module, (top[0], top[1], at[2] + 0.25), top, 0.01, 'verdant', sides=3)
        shapes.ball(module, top, 0.06, colours[stem % len(colours)], detail=0)


def market_stall_flowers(module):
    market.stall(module, ('verdant', 'linen'))
    top = market.COUNTER_M
    palettes = (('crimson', 'linen'), ('lamplighter_gold', 'crimson'), ('veiled_dusk', 'linen'), ('linen', 'straw'))
    for number in range(6):
        bunch(module, (-1.85 + number * 0.74, market.COUNTER_Y + 0.3, top), palettes[number % 4], high=0.35)
    for number in range(5):
        bunch(module, (-1.8 + number * 0.55, 0.75 + (number % 2) * 0.25, 0.0), palettes[(number + 1) % 4])
    module.part((-2.1, 0.6, 0.0), (0.4, 1.15, 0.8))
    for hung in range(5):
        x = -1.6 + hung * 0.8
        shapes.rod(module, (x, 1.3, 2.4), (x, 1.3, 2.15), 0.006, 'linen', sides=3)
        shapes.ball(module, (x, 1.3, 2.05), 0.12, palettes[hung % 4][0], detail=1, scale=(1.0, 1.0, 1.3))


def court_tree(module):
    # A broad tree standing in a raised ring bed of cut stone, grass and flowers round its trunk.
    shapes.lathe(module, (0.0, 0.0, 0.0), [(2.3, 0.0), (2.3, 0.5), (2.4, 0.55), (2.4, 0.62), (2.05, 0.62),
                                           (2.05, 0.45)], 'stone', sides=20, smooth=False)
    module.part((-2.3, -2.3, 0.0), (2.3, 2.3, 0.62))
    shapes.lathe(module, (0.0, 0.0, 0.0), [(2.06, 0.0), (2.06, 0.5)], 'verdant', sides=20)
    for flower in range(14):
        angle = math.tau * flower / 14 + module.draw(-0.1, 0.1)
        shapes.ball(module, (math.cos(angle) * 1.6, math.sin(angle) * 1.6, 0.55), 0.12,
                    ('crimson', 'lamplighter_gold', 'linen')[flower % 3], detail=0)
    shapes.rod(module, (0.0, 0.0, 0.4), (0.15, 0.1, 3.4), 0.28, 'timber', sides=8, end_radius=0.18)
    for bough in range(5):
        angle = math.tau * bough / 5 + 0.4
        shapes.rod(module, (0.12, 0.08, 2.8), (math.cos(angle) * 1.8, math.sin(angle) * 1.8, 4.6), 0.12, 'timber',
                   sides=6, end_radius=0.05)
    for leaf in range(26):
        angle = math.tau * leaf / 26
        reach = module.draw(0.6, 2.9)
        shapes.ball(module, (math.cos(angle) * reach, math.sin(angle) * reach, module.draw(4.3, 6.6)),
                    module.draw(0.9, 1.4), 'verdant', detail=1)
    shapes.ball(module, (0.0, 0.0, 6.8), 1.5, 'verdant', detail=1)
    module.socket('front', (0.0, -2.3, 0.0), (0, -1))


def lawn_bed(module):
    # A long raised bed: a kerb of cut stone, its lawn, a low hedge at its back and flowers along its front.
    long, deep = 7.6, 2.8
    for x, y, size in ((0.0, -deep / 2, (long, 0.3, 0.45)), (0.0, deep / 2, (long, 0.3, 0.45)),
                       (-long / 2, 0.0, (0.3, deep, 0.45)), (long / 2, 0.0, (0.3, deep, 0.45))):
        kit.block(module, (x, y, 0.0), size, 'trim', bevel=0.03, wear=0.02, part=False)
    module.part((-long / 2 - 0.15, -deep / 2 - 0.15, 0.0), (long / 2 + 0.15, deep / 2 + 0.15, 0.45))
    shapes.slab(module, (0.0, 0.0, 0.38), (long - 0.3, deep - 0.3, 0.08), 'verdant')
    for shrub in range(10):
        shapes.ball(module, (-long / 2 + 0.6 + shrub * 0.71, deep / 2 - 0.55, 0.62), module.draw(0.3, 0.42),
                    'verdant', detail=1, scale=(1.2, 0.8, 0.9))
    for flower in range(22):
        shapes.ball(module, (-long / 2 + 0.4 + flower * 0.33, -deep / 2 + 0.5 + module.draw(-0.15, 0.25), 0.5),
                    0.09, ('crimson', 'lamplighter_gold', 'linen', 'veiled_dusk')[flower % 4], detail=0)
    module.socket('front', (0.0, -deep / 2 - 0.15, 0.0), (0, -1))


def table_benches(module):
    # A trestle table under its jugs and cups, a bench along each side; the drinkers sit at `seat-1` to `seat-4`.
    kit.block(module, (0.0, 0.0, 0.72), (2.4, 0.9, 0.06), 'timber', bevel=0.01, wear=0.0, part=False)
    for x in (-0.95, 0.95):
        shapes.slab(module, (x, 0.0, 0.36), (0.08, 0.7, 0.72), 'timber')
    module.part((-1.2, -0.45, 0.0), (1.2, 0.45, 0.78))
    for y in (-0.85, 0.85):
        kit.block(module, (0.0, y, 0.42), (2.4, 0.32, 0.05), 'timber', bevel=0.01, wear=0.0, part=False)
        for x in (-1.0, 1.0):
            shapes.slab(module, (x, y, 0.21), (0.06, 0.26, 0.42), 'timber')
        module.part((-1.2, y - 0.16, 0.0), (1.2, y + 0.16, 0.47))
    for x in (-0.7, 0.0, 0.7):
        shapes.lathe(module, (x, 0.12, 0.78), [(0.04, 0.0), (0.05, 0.12), (0.04, 0.13)], 'roof', sides=8)
    shapes.lathe(module, (0.35, -0.15, 0.78), [(0.1, 0.0), (0.13, 0.15), (0.06, 0.3), (0.07, 0.34)], 'roof', sides=10)
    shapes.lathe(module, (-0.4, -0.12, 0.78), [(0.12, 0.0), (0.12, 0.015), (0.0, 0.015)], 'bone', sides=10)
    for number, (x, y) in enumerate(((-0.6, -1.45), (0.6, -1.45), (-0.6, 1.45), (0.6, 1.45))):
        module.socket(f'seat-{number + 1}', (x, y, 0.0), (0, 1) if y < 0 else (0, -1))
    module.socket('front', (0.0, -1.5, 0.0), (0, -1))


def parasol_table(module):
    # A round table under a cloth parasol on its pole, three stools round it.
    shapes.lathe(module, (0.0, 0.0, 0.0), [(0.25, 0.0), (0.08, 0.05), (0.06, 0.7), (0.5, 0.72), (0.5, 0.76),
                                           (0.0, 0.76)], 'timber', sides=12)
    module.part((-0.5, -0.5, 0.0), (0.5, 0.5, 0.76))
    shapes.rod(module, (0.0, 0.0, 0.76), (0.0, 0.0, 2.6), 0.03, 'timber', sides=6)
    shapes.lathe(module, (0.0, 0.0, 2.15), [(1.5, 0.0), (1.45, 0.05), (0.0, 0.5)], 'crimson', sides=8, smooth=False)
    shapes.lathe(module, (0.0, 0.0, 2.1), [(1.52, 0.0), (1.52, 0.08), (1.48, 0.08)], 'linen', sides=8, smooth=False)
    for stool in range(3):
        angle = math.tau * stool / 3 + 0.5
        at = (math.cos(angle) * 0.95, math.sin(angle) * 0.95, 0.0)
        shapes.lathe(module, at, [(0.12, 0.0), (0.05, 0.05), (0.05, 0.4), (0.2, 0.42), (0.2, 0.46), (0.0, 0.46)],
                     'timber', sides=8)
    shapes.lathe(module, (0.15, 0.1, 0.76), [(0.05, 0.0), (0.06, 0.12), (0.05, 0.13)], 'roof', sides=8)
    module.socket('front', (0.0, -1.5, 0.0), (0, -1))


def woodpile(module):
    # Split logs stacked between posts under a lean-to of boards, a chopping block with its axe.
    for row in range(5):
        for log in range(7 - row % 2):
            y = -0.5 + (row % 2) * 0.12
            x = -1.35 + log * 0.42 + (row % 2) * 0.21
            shapes.rod(module, (x, y, 0.16 + row * 0.3), (x, y + 1.0, 0.16 + row * 0.3), 0.15, 'timber', sides=6)
    module.part((-1.6, -0.6, 0.0), (1.6, 0.6, 1.6))
    for x in (-1.6, 1.6):
        for y in (-0.6, 0.6):
            fittings.post(module, (x, y, 0.0), 2.2 if y > 0 else 1.9, side=0.12, part=False)
    shapes.slab(module, (0.0, 0.0, 2.08), (3.6, 1.6, 0.06), 'roof', turn=(0.19, 0.0, 0.0))
    shapes.lathe(module, (2.2, -0.3, 0.0), [(0.3, 0.0), (0.3, 0.5), (0.0, 0.5)], 'timber', sides=10)
    shapes.rod(module, (2.2, -0.3, 0.5), (2.35, -0.2, 1.1), 0.025, 'timber', sides=5)
    shapes.slab(module, (2.2, -0.3, 0.55), (0.04, 0.22, 0.12), 'iron', turn=(0.0, 0.0, 0.5))
    module.part((1.9, -0.6, 0.0), (2.5, 0.0, 0.5))
    module.socket('front', (0.0, -0.8, 0.0), (0, -1))


def barrel_stack(module):
    # Barrels stood in a ring, two laid on them, crates beside, a sack on top.
    for number, (x, y) in enumerate(((-0.7, 0.0), (0.0, 0.0), (0.7, 0.0), (-0.35, 0.6), (0.35, 0.6))):
        fittings.barrel(module, (x, y, 0.0), radius=0.33, high=0.9)
    for x in (-0.35, 0.35):
        fittings.barrel(module, (x, 0.2, 1.05), radius=0.3, high=0.85, lying=True, turn=math.pi / 2)
    fittings.crate(module, (1.4, 0.2, 0.0), (0.7, 0.7, 0.6))
    fittings.crate(module, (1.4, 0.2, 0.6), (0.6, 0.6, 0.45), turn=0.2)
    fittings.sack(module, (-1.3, 0.1, 0.0), size=0.6)
    module.part((-1.6, -0.35, 0.0), (1.8, 0.95, 1.4))
    module.socket('front', (0.0, -0.4, 0.0), (0, -1))


def flower_cart(module):
    # A handcart of flowers in pails, its shafts down on the ground.
    bed = 0.75
    kit.block(module, (0.0, 0.0, bed), (1.8, 1.0, 0.06), 'timber', bevel=0.01, wear=0.0, part=False)
    for side in (-1, 1):
        shapes.slab(module, (0.0, side * 0.48, bed + 0.15), (1.8, 0.04, 0.24), 'timber')
        props.wheel(module, (0.1, side * 0.62, 0.5), 0.5)
        shapes.rod(module, (-0.9, side * 0.35, bed), (-1.8, side * 0.4, 0.05), 0.035, 'timber', sides=5)
    module.part((-0.9, -0.65, 0.0), (0.9, 0.65, bed + 0.3))
    palettes = (('crimson', 'linen'), ('lamplighter_gold', 'crimson'), ('veiled_dusk', 'linen'), ('linen', 'straw'))
    for number in range(6):
        bunch(module, (-0.55 + (number % 3) * 0.55, -0.22 + (number // 3) * 0.44, bed + 0.06), palettes[number % 4])
    module.socket('front', (0.0, -0.7, 0.0), (0, -1))


def bale_stack(module):
    # Hay bales stacked three, two and one, a fork leant on them.
    for row, count in enumerate((3, 2, 1)):
        for bale in range(count):
            fittings.hay_bale(module, (-0.55 * (count - 1) + bale * 1.1, 0.0, row * 0.46), turn=0.0,
                              size=(1.0, 0.55, 0.46))
    module.part((-1.7, -0.3, 0.0), (1.7, 0.3, 1.4))
    shapes.rod(module, (1.8, -0.4, 0.0), (1.6, -0.2, 1.6), 0.02, 'timber', sides=4)
    module.socket('front', (0.0, -0.35, 0.0), (0, -1))


# Every piece, by the name the hub asks for, in the order the catalogue appends them.
DRESSING = (
    ('market-stall-cloth', market_stall_cloth),
    ('market-stall-bread', market_stall_bread),
    ('market-stall-flowers', market_stall_flowers),
    ('court-tree', court_tree),
    ('lawn-bed', lawn_bed),
    ('table-benches', table_benches),
    ('parasol-table', parasol_table),
    ('woodpile', woodpile),
    ('barrel-stack', barrel_stack),
    ('flower-cart', flower_cart),
    ('bale-stack', bale_stack),
)
