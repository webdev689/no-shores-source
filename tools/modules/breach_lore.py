"""What *Soundings* names in the Drowned Vale, standing where it says: the line tied to the fallen wheel, the smith's,
the chandler's and the long house round the green, the Heart's open door and lit lamp, its table set for three and
the coat on its peg, the lantern and bedroll on the Stair's hidden slab, and the hall's beams, hearth and the reeve's
chair. All drawn only, clear of every socket the rules and the page stand on.
"""
import math

import breach_dress
import breach_kit as bk
import fittings
import kit
import shapes


def line(module):
    """The surveyor's spare line, tied off to a stake at the ledge's edge and run down to the wheel's rim, a coil of
    it left on the ledge."""
    stake = (3.85, 2.6, -3.0)
    shapes.rod(module, stake, (stake[0], stake[1], stake[2] + 0.45), 0.05, 'timber', sides=6)
    # The rim's point at a third of the way round from the plank, as the wheel lies tilted in the gap.
    around = math.radians(35.0)
    rim = (2.8 * math.cos(around), 2.8 * math.sin(around) * math.cos(bk.WHEEL_TILT),
           bk.WHEEL_Z + 2.8 * math.sin(around) * math.sin(bk.WHEEL_TILT) + 0.14)
    shapes.rod(module, (stake[0], stake[1], stake[2] + 0.38), rim, 0.022, 'straw', sides=4)
    fittings.rope_coil(module, (4.7, 2.9, -3.0), radius=0.28, turns=3, material='straw')


def anvil(module, at):
    """An anvil on its stump, drawn only."""
    x, y, z = at
    shapes.lathe(module, (x, y, z), [(0.38, 0.0), (0.35, 0.05), (0.32, 0.55), (0.0, 0.56)], 'timber', sides=10)
    outline = [(-0.35, 0.0), (0.35, 0.0), (0.25, 0.1), (0.15, 0.12), (0.15, 0.25), (0.3, 0.3), (0.38, 0.42),
               (0.38, 0.5), (-0.3, 0.5), (-0.42, 0.46), (-0.62, 0.43), (-0.3, 0.33), (-0.18, 0.25), (-0.18, 0.12),
               (-0.25, 0.1)]
    shapes.cutout(module, outline, 0.24, 'iron', (x, y, z + 0.56))


def green(module):
    """Round the drowned green: the smith's forge and anvil at the south-east cottage, the chandler's dipping rack
    and wax vat at the south-west, and the long house's low door in the green's west side."""
    # The smith's: a forge inside the cottage's broken walls, its coals dead under a hood, the anvil out on the green.
    forge = (23.2, -19.8)
    kit.block(module, (*forge, 0.0), (1.2, 1.6, 0.8), 'stone', bevel=0.04, wear=0.04, part=False)
    kit.block(module, (*forge, 0.8), (0.8, 1.2, 0.08), 'black', bevel=0.0, wear=0.0, part=False)
    shapes.pyramid(module, (*forge, 2.0), 0.7, 0.9, 0.8, 'stone', top=(0.3, 0.3))
    kit.block(module, (forge[0] + 0.2, forge[1], 2.8), (0.6, 0.6, 2.4), 'stone', bevel=0.03, wear=0.03, part=False)
    anvil(module, (21.4, -15.2, 0.0))
    kit.block(module, (24.2, -15.4, 0.0), (1.4, 0.7, 0.7), 'stone', bevel=0.04, wear=0.03, part=False)
    # The chandler's: candles hung in pairs from a dipping rack, and the vat the tallow was melted in.
    for x in (-23.4, -20.6):
        kit.block(module, (x, -15.4, 0.0), (0.14, 0.14, 1.8), 'timber', bevel=0.0, wear=0.0, part=False)
    kit.block(module, (-22.0, -15.4, 1.7), (3.0, 0.1, 0.1), 'timber', bevel=0.0, wear=0.0, part=False)
    for candle in range(8):
        x = -23.0 + candle * 0.34
        kit.column(module, (x, -15.4, 1.12 + (candle % 2) * 0.06), 0.03, 0.5, 'bone', sides=5, wear=0.0, part=False)
    shapes.lathe(module, (-19.6, -15.0, 0.0), [(0.4, 0.0), (0.5, 0.2), (0.52, 0.7), (0.46, 0.72), (0.0, 0.74)],
                 'iron', sides=12)
    # The long house's low door: a dark way in under a heavy lintel, a stone step before it.
    door = (-29.9, 7.5)
    kit.block(module, (door[0] + 0.02, door[1], 0.0), (0.06, 1.1, 1.45), 'black', bevel=0.0, wear=0.0, part=False)
    for side in (-1, 1):
        kit.block(module, (door[0] + 0.1, door[1] + side * 0.68, 0.0), (0.22, 0.24, 1.5), 'timber', bevel=0.0,
                  wear=0.0, part=False)
    kit.block(module, (door[0] + 0.12, door[1], 1.45), (0.26, 1.7, 0.24), 'timber', bevel=0.0, wear=0.0, part=False)
    kit.block(module, (door[0] + 0.45, door[1], 0.0), (0.7, 1.5, 0.12), 'stone', bevel=0.02, wear=0.02, part=False)


def heart(module, at, house):
    """The Heart: the one house of the Ways not bricked up, roofed whole, its door standing open and its lamp lit
    beside it; inside, a table set for three with bread, a jug and three cups, and a surveyor's coat on the peg by
    the door. `at` is the house's middle, `house` its side; the hidden chest's place at its middle is left clear."""
    x, y = at
    half = house / 2
    # The roof from the walls' tops (4.6 m at least, 5.2 at most) up to its ridge along x.
    rise, eave = 1.8, 5.2
    run = half + 0.4
    pitch = math.atan2(rise, half)
    slope = math.hypot(run, rise * run / half)
    for side in (-1, 1):
        middle = (x, y + side * run / 2, eave + rise - rise * run / half / 2)
        shapes.slab(module, middle, (house + 0.8, slope, 0.16), 'roof', turn=(-side * pitch, 0.0, 0.0))
    for end in (-1, 1):
        shapes.cutout(module, [(-half, 0.0), (half, 0.0), (half, 0.6), (0.0, eave + rise - 4.6), (-half, 0.6)], 0.3,
                      'chalk', (x + end * (half - 0.25), y, 4.6), turn=(0.0, 0.0, math.pi / 2))
    front = y - half
    # The door swung in against the wall, and the lamp on its bracket beside the doorway.
    kit.block(module, (x - 0.66, front + 1.15, 0.0), (0.08, 1.3, 2.2), 'timber', bevel=0.0, wear=0.0, part=False)
    shapes.rod(module, (x + 1.2, front, 3.0), (x + 1.2, front - 0.7, 3.0), 0.025, 'iron', sides=6)
    fittings.lantern(module, (x + 1.2, front - 0.65, 2.3), size=0.3, hung_from=3.0)
    # The table, west of the chest's place, its three stools, and what is set on it.
    table = (x - 2.1, y + 0.6)
    kit.block(module, (*table, 0.72), (0.9, 1.8, 0.07), 'timber', bevel=0.01, wear=0.0, part=False)
    for corner_x in (-0.35, 0.35):
        for corner_y in (-0.8, 0.8):
            kit.block(module, (table[0] + corner_x, table[1] + corner_y, 0.0), (0.08, 0.08, 0.72), 'timber',
                      bevel=0.0, wear=0.0, part=False)
    for stool in ((table[0] - 0.9, table[1] - 0.45), (table[0] - 0.9, table[1] + 0.45), (table[0], table[1] + 1.3)):
        shapes.lathe(module, (*stool, 0.0), [(0.17, 0.0), (0.11, 0.06), (0.11, 0.42), (0.19, 0.42), (0.19, 0.47),
                                            (0.0, 0.47)], 'timber', sides=8, smooth=False)
    top = 0.79
    for cup in ((table[0] - 0.25, table[1] - 0.45), (table[0] - 0.25, table[1] + 0.45), (table[0], table[1] + 0.7)):
        shapes.lathe(module, (*cup, top), [(0.035, 0.0), (0.045, 0.1), (0.0, 0.1)], 'chalk', sides=8)
    shapes.ball(module, (table[0] + 0.1, table[1] - 0.1, top + 0.06), 0.13, 'straw', detail=1,
                scale=(0.55, 1.0, 0.45))
    shapes.lathe(module, (table[0] + 0.2, table[1] + 0.3, top), [(0.07, 0.0), (0.1, 0.08), (0.09, 0.2),
                                                                 (0.05, 0.26), (0.06, 0.3), (0.0, 0.3)], 'roof',
                 sides=10)
    # The coat on its peg inside the front wall, east of the door: a surveyor's, Valeguard's buttons down it.
    peg = (x + 1.5, front + 0.5)
    shapes.rod(module, (*peg, 1.95), (peg[0], peg[1] + 0.2, 2.0), 0.02, 'timber', sides=6)
    kit.block(module, (peg[0], peg[1] + 0.12, 0.85), (0.55, 0.14, 1.1), 'canvas', bevel=0.02, wear=0.0, part=False)
    kit.block(module, (peg[0], peg[1] + 0.1, 1.9), (0.4, 0.12, 0.1), 'canvas', bevel=0.02, wear=0.0, part=False)
    for button in range(3):
        shapes.ball(module, (peg[0], peg[1] + 0.2, 1.3 + button * 0.18), 0.025, 'gold', detail=0)


def camp(module, at):
    """The lantern, cold, and the bedroll rolled tight the way they teach at Valeguard, left on the Stair's hidden
    slab, clear of the chest at its middle."""
    x, y, z = at
    kit.column(module, (x - 1.2, y + 0.9, z + 0.17), 0.17, 0.85, 'canvas', sides=10, wear=0.0,
               part=False).rotation_euler = (0.0, math.pi / 2, 0.0)
    for strap in (-0.95, -0.5):
        shapes.ring(module, (x + strap, y + 0.9, z + 0.17), 0.175, 0.04, 'timber', turn=(0.0, math.pi / 2, 0.0),
                    segments=10, sides=3)
    fittings.lantern(module, (x + 1.0, y - 1.0, z), size=0.3, pane='black')


def hall(module):
    """The keep's hall as Valeguard's: its tie beams across from wall to wall on stone corbels, its hearth cold in the
    west wall, and the reeve's chair on its step at the head of the hall, by the Steward's Door."""
    for y in (-21.0, -7.0, 7.0, 21.0):
        kit.block(module, (0.0, y, 11.2), (40.0, 0.5, 0.6), 'timber', bevel=0.02, wear=0.0, part=False)
        for side in (-1, 1):
            kit.block(module, (side * 19.6, y, 10.5), (0.8, 0.7, 0.7), 'trim', bevel=0.03, wear=0.02, part=False)
    breach_dress.hearth(module, (-20.0, 12.6, 0.0), (1.0, 0.0), False, 12.0)
    chair = (-6.5, 23.2)
    kit.block(module, (*chair, 0.0), (2.2, 2.0, 0.2), 'trim', bevel=0.03, wear=0.02, part=False)
    for corner_x in (-0.34, 0.34):
        for corner_y in (-0.28, 0.28):
            kit.block(module, (chair[0] + corner_x, chair[1] + corner_y, 0.2), (0.1, 0.1, 0.5), 'timber', bevel=0.0,
                      wear=0.0, part=False)
    kit.block(module, (*chair, 0.7), (0.84, 0.7, 0.1), 'timber', bevel=0.01, wear=0.0, part=False)
    kit.block(module, (chair[0], chair[1] + 0.32, 0.8), (0.84, 0.1, 1.7), 'timber', bevel=0.01, wear=0.0, part=False)
    kit.block(module, (*chair, 0.8), (0.7, 0.56, 0.06), 'crimson', bevel=0.0, wear=0.0, part=False)
    for side in (-1, 1):
        kit.block(module, (chair[0] + side * 0.4, chair[1] - 0.02, 0.8), (0.08, 0.66, 0.3), 'timber', bevel=0.0,
                  wear=0.0, part=False)
        shapes.ball(module, (chair[0] + side * 0.38, chair[1] + 0.32, 2.56), 0.08, 'gold', detail=1)
