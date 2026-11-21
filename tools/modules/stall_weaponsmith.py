"""The Weaponsmith's forge (`stall-weaponsmith`), 14 x 10 x 9: a smithy open at its front under a tiled roof on
timber posts. At its back a stone hearth glows with coals under a hood and a chimney that climbs through the roof,
the great bellows beside it; in the middle the anvil stands on its stump by the quench trough, hammers and tongs to
hand; a grinding wheel turns by the east wall under racks of blades and polearms. Across the front a counter laid
with a blade for show stands under a striped canvas awning. The front faces -y.
"""
import math

import fittings
import kit
import shapes

HALF_X = 7.0
HALF_Y = 5.0
FRONT_Y = -2.2
WALL_M = 4.4
EAVE_M = 4.6
RIDGE_M = 7.2
HEARTH = (-3.4, 3.4)


def hearth(module, x, y):
    """The forge's hearth: a stone bed waist high with glowing coals in its pit, a stone hood over it narrowing into
    the chimney, which climbs through the roof to a capped top."""
    kit.block(module, (x, y, 0.0), (2.6, 1.8, 0.85), 'stone', bevel=0.05, wear=0.03, cuts=1)
    kit.block(module, (x, y - 0.1, 0.85), (1.6, 1.0, 0.08), 'glow', bevel=0.0, wear=0.0, part=False)
    for coal in range(18):
        spot = (x + module.draw(-0.7, 0.7), y - 0.1 + module.draw(-0.4, 0.4), 0.95)
        shapes.ball(module, spot, module.draw(0.06, 0.11),
                    'black' if coal % 3 else 'glow', detail=1, scale=(1.0, 1.0, 0.6))
    kit.block(module, (x, y - 0.1, 0.85), (2.6, 0.2, 0.25), 'stone', bevel=0.03, wear=0.03, part=False)
    for side in (-1, 1):
        kit.block(module, (x + side * 1.2, y, 0.85), (0.2, 1.8, 0.25), 'stone', bevel=0.03, wear=0.03, part=False)
    # The hood on two stone cheeks, then the chimney.
    for side in (-1, 1):
        kit.block(module, (x + side * 1.15, y + 0.45, 0.85), (0.3, 0.9, 1.4), 'stone', bevel=0.04, wear=0.02)
    shapes.pyramid(module, (x, y + 0.3, 2.25), 1.4, 1.05, 1.8, 'stone', eave=0.3, top=(0.55, 0.5))
    kit.block(module, (x, y + 0.3, 2.25), (2.9, 2.2, 0.22), 'trim', bevel=0.04, wear=0.0, part=False)
    module.part((x - 1.4, y - 0.8, 2.25), (x + 1.4, y + 1.4, 4.05))
    kit.block(module, (x, y + 0.35, 4.0), (1.1, 1.0, 5.0), 'stone', bevel=0.05, wear=0.03, cuts=2)
    kit.block(module, (x, y + 0.35, 8.9), (1.35, 1.25, 0.25), 'trim', bevel=0.04, wear=0.0, part=False)
    for side in (-1, 1):
        kit.block(module, (x + side * 0.4, y + 0.35, 9.15), (0.25, 0.9, 0.35), 'stone', bevel=0.03, wear=0.0,
                  part=False)
    # A rack of tongs and pokers hung from the hood's lip.
    for tool in range(5):
        tx = x - 0.8 + tool * 0.4
        shapes.rod(module, (tx, y - 0.95, 2.2), (tx + 0.02, y - 1.0, 1.2), 0.015, 'iron', sides=4)
    shapes.slab(module, (x, y - 0.95, 2.22), (2.0, 0.05, 0.05), 'iron')


def bellows(module, x, y):
    """The great bellows beside the hearth on a timber trestle: two boards and the leather between, its nozzle to
    the fire and a pole to work it."""
    for dx in (-0.6, 0.6):
        fittings.post(module, (x + dx, y, 0.0), 0.75, side=0.12, part=False)
    shapes.slab(module, (x, y, 0.82), (1.6, 0.9, 0.08), 'timber')
    module.part((x - 0.8, y - 0.45, 0.0), (x + 0.8, y + 0.45, 1.3))
    for fold in range(4):
        shapes.slab(module, (x - 0.1, y, 0.9 + fold * 0.08), (1.3 - fold * 0.06, 0.8 - fold * 0.04, 0.07), 'black',
                    bevel=0.02)
    shapes.slab(module, (x - 0.1, y, 1.24), (1.4, 0.82, 0.06), 'timber', turn=(0.0, 0.08, 0.0))
    shapes.rod(module, (x + 0.6, y, 0.9), (x + 1.25, y, 0.92), 0.05, 'iron', end_radius=0.03, sides=6)
    shapes.rod(module, (x - 0.75, y, 1.28), (x - 1.0, y, 2.1), 0.03, 'timber', sides=6)


def anvil(module, at, turn=0.0):
    """An anvil on its stump: the horn, the face, the heel, its waist and feet; a hammer on its face and tongs
    leaning on the stump."""
    x, y, z = at
    shapes.lathe(module, (x, y, z), [(0.38, 0.0), (0.35, 0.05), (0.32, 0.55), (0.0, 0.56)], 'timber', sides=12)
    outline = [(-0.35, 0.0), (0.35, 0.0), (0.25, 0.1), (0.15, 0.12), (0.15, 0.25), (0.3, 0.3), (0.38, 0.42),
               (0.38, 0.5), (-0.3, 0.5), (-0.42, 0.46), (-0.62, 0.43), (-0.3, 0.33), (-0.18, 0.25), (-0.18, 0.12),
               (-0.25, 0.1)]
    shapes.cutout(module, outline, 0.24, 'iron', (x, y, z + 0.56), turn=(0.0, 0.0, turn))
    shapes.slab(module, (x + 0.02, y, z + 1.08), (0.36, 0.05, 0.05), 'timber', turn=(0.0, 0.0, turn + 0.4))
    shapes.slab(module, (x + 0.16, y + 0.05, z + 1.09), (0.06, 0.1, 0.07), 'iron', turn=(0.0, 0.0, turn + 0.4))
    shapes.rod(module, (x - 0.35, y + 0.3, z), (x - 0.3, y + 0.32, z + 0.6), 0.015, 'iron', sides=4)
    shapes.rod(module, (x - 0.3, y + 0.35, z), (x - 0.28, y + 0.36, z + 0.6), 0.015, 'iron', sides=4)
    module.part((x - 0.45, y - 0.4, z), (x + 0.45, y + 0.4, z + 1.06))


def trough(module, x, y):
    """The quench trough: a stone box of dark water, a bucket by it."""
    kit.block(module, (x, y, 0.0), (1.4, 0.7, 0.7), 'stone', bevel=0.04, wear=0.03)
    kit.block(module, (x, y, 0.55), (1.2, 0.5, 0.1), 'water', bevel=0.0, wear=0.0, part=False)
    shapes.lathe(module, (x + 1.0, y, 0.0), [(0.16, 0.0), (0.2, 0.36), (0.0, 0.36)], 'timber', sides=10)
    shapes.ring(module, (x + 1.0, y, 0.3), 0.19, 0.02, 'iron', segments=12, sides=3)


def grindstone(module, x, y):
    """A grinding wheel on its timber frame, axle and crank, a trough of water under it."""
    for dy in (-0.25, 0.25):
        shapes.slab(module, (x, y + dy, 0.45), (1.0, 0.08, 0.08), 'timber')
        for dx in (-0.4, 0.4):
            shapes.rod(module, (x + dx, y + dy, 0.0), (x + dx * 0.6, y + dy, 0.95), 0.04, 'timber', sides=6)
    shapes.lathe(module, (x, y - 0.12, 1.0), [(0.0, 0.0), (0.42, 0.0), (0.45, 0.04), (0.45, 0.2), (0.42, 0.24),
                 (0.0, 0.24)], 'stone', sides=24, turn=(-math.pi / 2, 0.0, 0.0), smooth=False)
    shapes.rod(module, (x, y - 0.4, 1.0), (x, y + 0.4, 1.0), 0.03, 'iron', sides=6)
    shapes.rod(module, (x, y + 0.4, 1.0), (x, y + 0.4, 0.75), 0.025, 'iron', sides=4)
    shapes.rod(module, (x, y + 0.4, 0.75), (x, y + 0.55, 0.75), 0.03, 'timber', sides=6)
    module.part((x - 0.55, y - 0.35, 0.0), (x + 0.55, y + 0.35, 1.45))


def blade_rack(module, x, south, north):
    """A rack of blades against the east wall: two rails, swords hung in a row, polearms standing at its end."""
    for z in (1.2, 2.3):
        shapes.slab(module, (x, (south + north) / 2, z), (0.12, north - south, 0.1), 'timber')
    for end in (south, north):
        fittings.post(module, (x, end, 0.0), 2.6, side=0.12, part=False)
    count = int((north - south - 1.0) / 0.32)
    for blade in range(count):
        by = south + 0.4 + blade * 0.32
        fittings.sword(module, (x - 0.12, by, 1.0), length=module.draw(0.9, 1.3), turn=math.pi / 2)
    for spear in range(4):
        fittings.polearm(module, (x - 0.15, north + 0.4 + spear * 0.28, 0.0), high=2.3 + spear * 0.1,
                         head='spear' if spear % 2 else 'halberd', turn=math.pi / 2)
    module.part((x - 0.35, south, 0.0), (x + 0.1, north + 1.4, 2.5))


def build(module):
    fittings.floor(module, -HALF_X + 0.3, FRONT_Y - 0.2, HALF_X - 0.3, HALF_Y - 0.3, 0.12)
    # The back and side walls, stone to the eaves, and the timber posts and beam along the open front.
    fittings.wall(module, (-HALF_X + 0.3, HALF_Y - 0.3), (HALF_X - 0.3, HALF_Y - 0.3), WALL_M, thick=0.6)
    for side in (-1, 1):
        fittings.wall(module, (side * (HALF_X - 0.3), FRONT_Y + 0.4), (side * (HALF_X - 0.3), HALF_Y - 0.6), WALL_M,
                      thick=0.6)
    for x in (-HALF_X + 0.3, -2.4, 2.4, HALF_X - 0.3):
        fittings.post(module, (x, FRONT_Y, 0.0), WALL_M + 0.2, side=0.32)
        for side in (-1, 1):
            if abs(x + side * 0.4) < HALF_X - 0.3:
                shapes.slab(module, (x + side * 0.4, FRONT_Y, WALL_M - 0.3), (0.12, 0.2, 0.9), 'timber',
                            turn=(0.0, side * 0.8, 0.0))
    kit.block(module, (0.0, FRONT_Y, WALL_M), (HALF_X * 2 - 0.4, 0.36, 0.4), 'timber', bevel=0.03, wear=0.0)
    fittings.gable_roof(module, -HALF_X + 0.1, HALF_X - 0.1, FRONT_Y - 0.2, HALF_Y, EAVE_M, RIDGE_M)
    # The awning out over the counter on iron brackets, and the counter under it.
    shapes.awning(module, -2.3, 2.3, FRONT_Y - 0.25, -HALF_Y + 0.15, 3.9, 3.1, ('linen', 'crimson'), stripes=8)
    for x in (-2.2, 2.2):
        shapes.rod(module, (x, FRONT_Y - 0.2, 3.2), (x, -HALF_Y + 0.3, 3.2), 0.025, 'iron', sides=5)
    fittings.counter(module, -2.2, 2.2, FRONT_Y - 0.95, high=1.0)
    fittings.sword(module, (0.4, FRONT_Y - 0.65, 1.03), length=1.2, turn=math.pi / 2, tilt=-math.pi / 2)
    fittings.sword(module, (1.3, FRONT_Y - 0.45, 1.03), length=0.9, turn=math.pi / 2 - 0.3, tilt=-math.pi / 2)
    for x in (-1.6, 1.6):
        shapes.lathe(module, (x, FRONT_Y - 0.6, 1.0), [(0.12, 0.0), (0.12, 0.06), (0.0, 0.06)], 'iron', sides=10)
    # The forge's work: hearth, bellows, anvil, trough, grindstone and racks.
    hearth(module, *HEARTH)
    bellows(module, HEARTH[0] - 2.4, HEARTH[1] + 0.3)
    anvil(module, (-2.3, 0.9, 0.12), turn=0.3)
    trough(module, -4.6, 0.6)
    grindstone(module, 3.0, 1.2)
    blade_rack(module, HALF_X - 0.9, FRONT_Y + 0.8, 2.6)
    for at in ((5.6, 4.0), (5.0, 4.15)):
        fittings.barrel(module, (*at, 0.12), radius=0.3, high=0.85)
    module.part((4.6, 3.6, 0.12), (6.0, 4.5, 1.0))
    for bar in range(6):
        shapes.slab(module, (1.0 + bar * 0.05, 4.2, 0.17 + bar * 0.06), (1.6, 0.12, 0.06), 'iron',
                    turn=(0.0, 0.0, module.draw(-0.1, 0.1)))
    fittings.lantern(module, (0.0, 0.3, 3.2), size=0.3, hung_from=WALL_M + 0.1)
    tool_wall(module, 0.9, HALF_Y - 0.62)
    # Where a hanging shop sign's bracket is fixed, high on the east front post, facing along the front away from its middle.
    module.socket('sign', (HALF_X - 0.14, FRONT_Y, 3.6), (1, 0))
    module.socket('counter', (0.0, FRONT_Y - 1.4, 0.0), (0, -1))
    module.socket('keeper', (0.0, FRONT_Y + 0.25, 0.12), (0, -1))


def tool_wall(module, x, y):
    """A board of hammers and tongs on the back wall over a workbench where blades are finished: a vice, a blade
    being fitted, files laid out."""
    shapes.slab(module, (x, y, 2.2), (2.6, 0.05, 1.3), 'timber')
    for tool in range(7):
        tx = x - 1.1 + tool * 0.36
        if tool % 2:
            shapes.rod(module, (tx, y - 0.06, 2.65), (tx + 0.04, y - 0.06, 1.85), 0.015, 'iron', sides=4)
            shapes.rod(module, (tx + 0.06, y - 0.06, 2.65), (tx + 0.02, y - 0.06, 1.85), 0.015, 'iron', sides=4)
        else:
            shapes.rod(module, (tx, y - 0.06, 2.7), (tx, y - 0.06, 1.95), 0.02, 'timber', sides=5)
            shapes.slab(module, (tx, y - 0.07, 2.62), (0.2 - tool * 0.01, 0.07, 0.08), 'iron')
    for dx in (-1.2, 1.2):
        for dy in (-0.25, 0.25):
            fittings.post(module, (x + dx, y - 0.4 + dy, 0.12), 0.8, side=0.1, part=False)
    kit.block(module, (x, y - 0.4, 0.92), (2.6, 0.7, 0.08), 'timber', bevel=0.01, wear=0.0, part=False)
    module.part((x - 1.3, y - 0.75, 0.12), (x + 1.3, y - 0.05, 1.0))
    shapes.slab(module, (x - 0.9, y - 0.5, 1.1), (0.14, 0.24, 0.2), 'iron', bevel=0.01)
    fittings.sword(module, (x - 0.65, y - 0.5, 1.03), length=1.0, turn=math.pi / 2 + 0.05, tilt=-math.pi / 2)
    for rasp in range(3):
        shapes.slab(module, (x + 0.6 + rasp * 0.12, y - 0.4, 1.01), (0.03, 0.35, 0.015), 'iron')
