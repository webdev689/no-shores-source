"""The Armorsmith's armoury (`stall-armorsmith`), 12 x 9 x 7: a timber-framed hall on a stone sill, its gable to the
front, open across it. Shields of every colour hang on its back wall over a row of helms on a shelf; armour stands in
plate, in mail and in a coat of plates face the street from either side; a mail shirt hangs from a rail; at the east
wall a workbench holds a helm being beaten out, rivets and shears. The counter stands under a striped awning, a
shield on the gable over it. The front faces -y.
"""
import math

import fittings
import kit
import shapes

HALF_X = 6.0
HALF_Y = 4.5
FRONT_Y = -2.4
WALL_M = 4.0
RIDGE_M = 7.0
FLOOR_M = 0.12


def armour_stand(module, at, look):
    """An armour stand on a cross foot: a post with a cuirass of plate (or a mail coat, or a coat of plates), a
    skirt, pauldrons, a helm on its top; turned to face -y."""
    x, y, z = at
    for turn in (0.0, math.pi / 2):
        shapes.slab(module, (x, y, z + 0.04), (0.7, 0.1, 0.08), 'timber', turn=(0.0, 0.0, turn))
    shapes.rod(module, (x, y, z), (x, y, z + 1.5), 0.04, 'timber', sides=6)
    shapes.slab(module, (x, y, z + 1.42), (0.6, 0.06, 0.06), 'timber')
    body = 'iron' if look != 'plates' else 'crimson'
    if look == 'mail':
        shapes.lathe(module, (x, y, z + 0.55), [(0.27, 0.0), (0.24, 0.35), (0.2, 0.62), (0.24, 0.8), (0.12, 0.92),
                     (0.0, 0.93)], 'iron', sides=10)
        for row in range(3):
            shapes.ring(module, (x, y, z + 0.6 + row * 0.07), 0.26 - row * 0.008, 0.012, 'iron', segments=16, sides=3)
    else:
        shapes.lathe(module, (x, y, z + 0.82), [(0.2, 0.0), (0.18, 0.12), (0.22, 0.32), (0.25, 0.5), (0.2, 0.62),
                     (0.1, 0.66), (0.0, 0.67)], body, sides=14)
        shapes.lathe(module, (x, y, z + 0.6), [(0.27, 0.0), (0.24, 0.12), (0.2, 0.24), (0.18, 0.25)], 'black'
                     if look == 'plates' else 'iron', sides=10)
        if look == 'plates':
            for row in range(3):
                for side in range(-2, 3):
                    shapes.ball(module, (x + side * 0.08, y - 0.24 + abs(side) * 0.02, z + 0.95 + row * 0.13), 0.02,
                                'gold', detail=1)
        else:
            shapes.slab(module, (x, y - 0.21, z + 1.15), (0.04, 0.02, 0.36), 'gold')
    for side in (-1, 1):
        shapes.ball(module, (x + side * 0.26, y, z + 1.43), 0.13, 'iron', scale=(1.1, 1.0, 0.7))
        shapes.lathe(module, (x + side * 0.3, y, z + 1.0), [(0.07, 0.0), (0.08, 0.3), (0.0, 0.32)], 'iron', sides=8)
    helm = (x, y, z + 1.55)
    shapes.lathe(module, helm, [(0.05, 0.0), (0.14, 0.02), (0.15, 0.18), (0.14, 0.3), (0.08, 0.38), (0.0, 0.4)],
                 'iron', sides=10)
    shapes.slab(module, (x, y - 0.14, helm[2] + 0.2), (0.2, 0.02, 0.025), 'black')
    if look == 'plate':
        shapes.lathe(module, (x, y, helm[2] + 0.38), [(0.02, 0.0), (0.05, 0.08), (0.0, 0.3)], 'crimson', sides=6)
    module.part((x - 0.38, y - 0.3, z), (x + 0.38, y + 0.3, z + 1.95))


def helm(module, at, kind):
    """A helm set on a shelf: a round kettle hat, a great helm, or a pointed bascinet."""
    if kind == 0:
        shapes.lathe(module, at, [(0.22, 0.0), (0.22, 0.02), (0.12, 0.05), (0.12, 0.16), (0.0, 0.22)], 'iron', sides=10)
    elif kind == 1:
        shapes.lathe(module, at, [(0.13, 0.0), (0.14, 0.26), (0.11, 0.33), (0.0, 0.36)], 'iron', sides=12)
        shapes.slab(module, (at[0], at[1] - 0.13, at[2] + 0.2), (0.18, 0.02, 0.025), 'black')
    else:
        shapes.lathe(module, at, [(0.13, 0.0), (0.13, 0.15), (0.08, 0.3), (0.0, 0.42)], 'iron', sides=12)


def workbench(module, x, y):
    """The armourer's bench against the east wall: a heavy top on trestles, a stake anvil, a helm being raised, a
    pair of shears, a tray of rivets, a leather strap; the stake's stump beside it."""
    for dy in (-0.9, 0.9):
        for dx in (-0.3, 0.3):
            fittings.post(module, (x + dx, y + dy, FLOOR_M), 0.85, side=0.1, part=False)
    kit.block(module, (x, y, FLOOR_M + 0.85), (0.9, 2.2, 0.1), 'timber', bevel=0.01, wear=0.0, part=False)
    module.part((x - 0.45, y - 1.1, FLOOR_M), (x + 0.45, y + 1.1, FLOOR_M + 0.95))
    top = FLOOR_M + 0.95
    helm(module, (x, y - 0.5, top), 2)
    shapes.lathe(module, (x - 0.1, y + 0.2, top), [(0.16, 0.0), (0.16, 0.03), (0.0, 0.03)], 'timber', sides=10)
    for rivet in range(10):
        shapes.ball(module, (x - 0.1 + module.draw(-0.1, 0.1), y + 0.2 + module.draw(-0.1, 0.1), top + 0.04), 0.012,
                    'gold', detail=0)
    for side in (-1, 1):
        shapes.slab(module, (x + 0.15, y + 0.6 + side * 0.03, top + 0.01), (0.04, 0.35, 0.015), 'iron',
                    turn=(0.0, 0.0, side * 0.12))
    shapes.slab(module, (x - 0.2, y + 0.7, top + 0.005), (0.08, 0.8, 0.01), 'black', turn=(0.0, 0.0, 0.2))
    stake = (x - 0.9, y - 0.4, FLOOR_M)
    shapes.lathe(module, stake, [(0.25, 0.0), (0.23, 0.6), (0.0, 0.61)], 'timber', sides=10)
    shapes.lathe(module, (stake[0], stake[1], stake[2] + 0.61), [(0.03, 0.0), (0.03, 0.2), (0.09, 0.25), (0.0, 0.33)],
                 'iron', sides=10)
    module.part((stake[0] - 0.28, stake[1] - 0.28, FLOOR_M), (stake[0] + 0.28, stake[1] + 0.28, FLOOR_M + 0.95))


def shield_wall(module, y):
    """The back wall's shields in two rows, round and kite in turn and in many colours, the helms' shelf under them
    and spears crossed behind the middle one."""
    faces = ('crimson', 'verdant', 'stormcaller_blue', 'black', 'linen', 'lamplighter_gold', 'veiled_dusk')
    for row, z in enumerate((3.2, 2.15)):
        for number in range(6):
            x = -4.1 + number * 1.64 + row * 0.0
            face = faces[(number * 3 + row * 2) % len(faces)]
            if (number + row) % 2:
                fittings.round_shield(module, (x, y, z), radius=0.42, face=face)
            else:
                fittings.kite_shield(module, (x, y - 0.03, z + 0.1), high=0.95, face=face,
                                     charge='gold' if face != 'lamplighter_gold' else 'crimson',
                                     device=('chevron', 'fess', 'pale', 'quarters')[(number + row * 3) % 4])
    kit.block(module, (0.0, y - 0.2, 1.3), (9.4, 0.4, 0.06), 'timber', bevel=0.0, wear=0.0, part=False)
    for number in range(8):
        helm(module, (-4.2 + number * 1.2, y - 0.2, 1.36), number % 3)


def build(module):
    fittings.floor(module, -HALF_X + 0.3, FRONT_Y - 0.2, HALF_X - 0.3, HALF_Y - 0.3, FLOOR_M)
    fittings.framed_wall(module, (-HALF_X + 0.3, HALF_Y - 0.3), (HALF_X - 0.3, HALF_Y - 0.3), WALL_M)
    for side in (-1, 1):
        fittings.framed_wall(module, (side * (HALF_X - 0.3), FRONT_Y + 0.2), (side * (HALF_X - 0.3), HALF_Y - 0.45),
                             WALL_M)
    for x in (-HALF_X + 0.3, -2.6, 2.6, HALF_X - 0.3):
        fittings.post(module, (x, FRONT_Y, 0.0), WALL_M, side=0.3)
    kit.block(module, (0.0, FRONT_Y, WALL_M - 0.1), (HALF_X * 2 - 0.3, 0.36, 0.36), 'timber', bevel=0.03, wear=0.0)
    # The roof's ridge runs front to back, so its gable faces the street with a shield set in it.
    with shapes.frame(module, (0.0, (FRONT_Y - 0.2 + HALF_Y) / 2, 0.0), quarter=1):
        half = (HALF_Y - FRONT_Y + 0.2) / 2
        fittings.gable_roof(module, -half, half, -HALF_X + 0.1, HALF_X - 0.1, WALL_M + 0.15, RIDGE_M)
    fittings.kite_shield(module, (0.0, FRONT_Y - 0.4, 5.3), high=1.4, face='crimson', charge='gold')
    for side in (-1, 1):
        fittings.sword(module, (side * 0.9, FRONT_Y - 0.36, 4.8), length=1.3, turn=0.0, roll=side * 0.7)
    # The counter under its awning.
    shapes.awning(module, -2.5, 2.5, FRONT_Y - 0.25, -HALF_Y + 0.15, 3.5, 2.8, ('verdant', 'linen'), stripes=8)
    fittings.counter(module, -2.4, 2.4, FRONT_Y - 0.9, high=1.0)
    helm(module, (-1.2, FRONT_Y - 0.5, 1.0), 1)
    shapes.slab(module, (0.6, FRONT_Y - 0.55, 1.03), (0.9, 0.5, 0.05), 'iron', bevel=0.01)
    for link in range(3):
        shapes.ring(module, (0.3 + link * 0.3, FRONT_Y - 0.55, 1.06), 0.12, 0.02, 'iron', segments=10, sides=3)
    # The armoury's goods and work.
    shield_wall(module, HALF_Y - 0.6)
    for at, look in (((-4.6, FRONT_Y + 0.8, FLOOR_M), 'plate'), ((-3.4, FRONT_Y + 1.6, FLOOR_M), 'mail'),
                     ((3.4, FRONT_Y + 1.6, FLOOR_M), 'plates'), ((4.6, FRONT_Y + 0.8, FLOOR_M), 'plate')):
        armour_stand(module, at, look)
    workbench(module, HALF_X - 1.1, 1.6)
    shapes.rod(module, (-HALF_X + 0.6, 0.4, 2.6), (-HALF_X + 0.6, 2.8, 2.6), 0.03, 'iron', sides=6)
    for number, y in enumerate((0.9, 2.0)):
        shapes.drape(module, (-HALF_X + 0.6, y - 0.4, 2.55), (-HALF_X + 0.6, y + 0.4, 2.55), 0.95, 'iron', folds=2,
                     depth=0.05, thick=0.04)
    fittings.lantern(module, (0.0, 0.6, 3.0), size=0.3, hung_from=WALL_M + 0.2)
    module.socket('counter', (0.0, FRONT_Y - 1.35, 0.0), (0, -1))
    module.socket('keeper', (0.0, FRONT_Y + 0.25, FLOOR_M), (0, -1))
    # Where a hanging shop sign's bracket is fixed, high on the east front post, facing along the front away from its middle.
    module.socket('sign', (HALF_X - 0.15, FRONT_Y, 3.6), (1, 0))
