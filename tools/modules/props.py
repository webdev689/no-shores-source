"""The hub's small pieces, set about its courts, walks and quay.

`crates-barrels`, 3 x 2: crates stacked, barrels standing and lying, sacks against them. `lamp-post`, 4 m: a
cast-iron post on a stone foot, a scrolled arm each side carrying a lantern. `bench`, 2.4 m: a stone bench with a
timber seat and back, its sitter facing -y (socket `front`; every piece here has one, the way it is stood).
`anvil-yard`, 6 x 4: an anvil on its stump, a quench trough, a grindstone, a heap of coal and a rack of bar iron, where
two smiths stand at work (sockets `smith-1` and `smith-2`). `hay-cart`, 4 x 2: a two-wheeled cart heaped with hay, its
shafts resting on the ground. `bollards`: three iron mooring bollards along a quay's edge, a rope made fast round one.
"""
import math

import fittings
import kit
import shapes
import stall_weaponsmith


def crates_barrels(module):
    for at, size, turn in (((-0.8, 0.3, 0.0), (0.9, 0.8, 0.7), 0.04), ((-0.8, 0.3, 0.7), (0.8, 0.7, 0.6), -0.1),
                           ((0.2, 0.45, 0.0), (0.8, 0.7, 0.62), -0.05)):
        fittings.crate(module, at, size, turn=turn)
    module.part((-1.3, -0.15, 0.0), (0.65, 0.85, 1.3))
    for at in ((1.05, 0.35), (0.9, -0.4)):
        fittings.barrel(module, (*at, 0.0), radius=0.32, high=0.9)
    module.part((0.65, -0.75, 0.0), (1.4, 0.7, 0.9))
    fittings.barrel(module, (-0.2, -0.55, 0.0), radius=0.3, high=0.85, lying=True, turn=0.15)
    module.part((-0.7, -0.9, 0.0), (0.3, -0.2, 0.6))
    for at in ((-1.15, -0.55), (-1.25, -0.1)):
        fittings.sack(module, (*at, 0.0), size=0.5)
    fittings.rope_coil(module, (0.3, 0.45, 0.62), radius=0.25, turns=3)
    module.socket('front', (0.0, -0.9, 0.0), (0, -1))


def lamp_post(module):
    shapes.lathe(module, (0.0, 0.0, 0.0), [(0.36, 0.0), (0.36, 0.3), (0.3, 0.36), (0.3, 0.5), (0.0, 0.5)], 'stone',
                 sides=8, smooth=False)
    shapes.lathe(module, (0.0, 0.0, 0.5), [(0.14, 0.0), (0.1, 0.2), (0.07, 0.3), (0.06, 2.6), (0.09, 2.7),
                 (0.06, 2.8), (0.05, 3.25), (0.08, 3.3), (0.0, 3.32)], 'iron', sides=8)
    module.part((-0.3, -0.3, 0.0), (0.3, 0.3, 3.8))
    for side in (-1, 1):
        shapes.rod(module, (0.0, 0.0, 3.4), (side * 0.55, 0.0, 3.52), 0.025, 'iron', sides=4)
        shapes.rod(module, (0.0, 0.0, 3.05), (side * 0.45, 0.0, 3.5), 0.018, 'iron', sides=4)
        shapes.ring(module, (side * 0.3, 0.0, 3.3), 0.1, 0.018, 'iron', turn=(math.pi / 2, 0.0, 0.0), segments=10,
                    sides=3)
        fittings.lantern(module, (side * 0.58, 0.0, 3.0), size=0.34, hung_from=3.52)
    shapes.lathe(module, (0.0, 0.0, 3.5), [(0.06, 0.0), (0.1, 0.12), (0.0, 0.42)], 'iron', sides=6)
    module.socket('front', (0.0, -0.36, 0.0), (0, -1))


def bench(module):
    for x in (-1.0, 1.0):
        kit.block(module, (x, 0.0, 0.0), (0.24, 0.48, 0.4), 'stone', bevel=0.03, wear=0.02, part=False)
        kit.block(module, (x, 0.0, 0.0), (0.3, 0.56, 0.08), 'trim', bevel=0.02, wear=0.0, part=False)
        shapes.slab(module, (x + 0.13 * (1 if x > 0 else -1), 0.04, 0.62), (0.1, 0.52, 0.06), 'iron')
        shapes.slab(module, (x + 0.13 * (1 if x > 0 else -1), 0.27, 0.65), (0.07, 0.07, 0.52), 'iron')
    for slat in range(4):
        shapes.slab(module, (0.0, -0.18 + slat * 0.12, 0.43), (2.4, 0.1, 0.05), 'timber', bevel=0.01)
    for slat in range(3):
        shapes.slab(module, (0.0, 0.3, 0.62 + slat * 0.14), (2.3, 0.04, 0.1), 'timber', turn=(-0.15, 0.0, 0.0),
                    bevel=0.01)
    module.part((-1.2, -0.25, 0.0), (1.2, 0.25, 0.46))
    module.part((-1.2, 0.25, 0.0), (1.2, 0.35, 0.95))
    module.socket('front', (0.0, -0.28, 0.0), (0, -1))


def anvil_yard(module):
    # The yard's floor of trodden flags and the smiths' work: anvil, trough, grindstone, coal, bar iron.
    fittings.floor(module, -2.9, -1.9, 2.9, 1.9, high=0.08)
    stall_weaponsmith.anvil(module, (0.0, 0.0, 0.08), turn=0.0)
    module.socket('smith-1', (-0.85, -0.55, 0.08), (math.cos(0.55), math.sin(0.55)))
    module.socket('smith-2', (0.85, -0.55, 0.08), (-math.cos(0.55), math.sin(0.55)))
    module.socket('front', (0.0, -1.9, 0.0), (0, -1))
    stall_weaponsmith.trough(module, -1.9, 1.0)
    stall_weaponsmith.grindstone(module, 2.0, 0.9)
    for lump in range(16):
        shapes.ball(module, (-1.8 + module.draw(-0.5, 0.5), -1.1 + module.draw(-0.4, 0.4),
                             0.08 + module.draw(0.0, 0.18)), module.draw(0.1, 0.18), 'black', detail=0)
    module.part((-2.4, -1.55, 0.08), (-1.2, -0.65, 0.4))
    for leg in (-0.5, 0.5):
        fittings.post(module, (0.6 + leg, 1.4, 0.08), 1.2, side=0.08, part=False)
    for bar in range(7):
        shapes.slab(module, (0.6, 1.33 + (bar % 2) * 0.05, 0.75 + bar * 0.05), (1.4, 0.04, 0.04), 'iron')
    module.part((-0.05, 1.25, 0.08), (1.25, 1.55, 1.3))


def wheel(module, middle, radius):
    """A cart wheel standing on edge, its axle along y: rim, hub and eight spokes."""
    shapes.ring(module, middle, radius, 0.08, 'timber', turn=(math.pi / 2, 0.0, 0.0), segments=16, sides=4)
    shapes.lathe(module, (middle[0], middle[1] - 0.15, middle[2]), [(0.1, 0.0), (0.12, 0.15), (0.1, 0.3)], 'iron',
                 sides=8, turn=(-math.pi / 2, 0.0, 0.0), smooth=False)
    for spoke in range(8):
        angle = math.tau * spoke / 8
        tip = (middle[0] + math.cos(angle) * radius * 0.95, middle[1], middle[2] + math.sin(angle) * radius * 0.95)
        shapes.rod(module, middle, tip, 0.025, 'timber', sides=4)


def hay_cart(module):
    # The bed on its axle, its side boards, the wheels and the shafts resting on the ground.
    bed = 0.95
    kit.block(module, (0.3, 0.0, bed), (2.6, 1.5, 0.08), 'timber', bevel=0.01, wear=0.0, part=False)
    for side in (-1, 1):
        shapes.slab(module, (0.3, side * 0.72, bed + 0.3), (2.6, 0.05, 0.5), 'timber')
        for stake in range(5):
            shapes.slab(module, (-0.9 + stake * 0.6, side * 0.76, bed + 0.25), (0.07, 0.05, 0.62), 'timber')
        wheel(module, (0.3, side * 0.88, 0.62), 0.62)
        shapes.rod(module, (-0.9, side * 0.45, bed), (-1.95, side * 0.4, 0.05), 0.04, 'timber', sides=5)
    for end in (-1, 1):
        shapes.slab(module, (0.3 + end * 1.28, 0.0, bed + 0.3), (0.05, 1.45, 0.5), 'timber')
    shapes.rod(module, (0.3, -0.95, 0.62), (0.3, 0.95, 0.62), 0.05, 'iron', sides=6)
    module.part((-1.0, -0.95, 0.0), (1.6, 0.95, bed + 0.6))
    # The hay heaped over its boards and a fork stuck in it.
    shapes.ball(module, (0.3, 0.0, bed + 0.55), 1.0, 'straw', detail=2, scale=(1.4, 0.75, 0.5))
    for bale in range(3):
        fittings.hay_bale(module, (-0.3 + bale * 0.6, 0.0, bed + 0.95), turn=math.pi / 2 + module.draw(-0.2, 0.2),
                          size=(0.9, 0.45, 0.4))
    shapes.rod(module, (1.0, 0.2, bed + 0.8), (1.3, 0.3, bed + 2.2), 0.02, 'timber', sides=4)
    module.socket('front', (0.3, -0.95, 0.0), (0, -1))


def bollards(module):
    for x in (-1.6, 0.0, 1.6):
        shapes.lathe(module, (x, 0.0, 0.0), [(0.24, 0.0), (0.2, 0.08), (0.17, 0.5), (0.22, 0.58), (0.26, 0.66),
                     (0.24, 0.72), (0.0, 0.74)], 'iron', sides=10)
        module.part((x - 0.2, -0.2, 0.0), (x + 0.2, 0.2, 0.74))
    fittings.rope_coil(module, (0.0, 0.0, 0.42), radius=0.21, turns=2)
    points = [(0.0, -0.2, 0.45), (0.0, -0.6, 0.12), (0.4, -0.9, 0.04), (1.2, -0.95, 0.04)]
    for start, end in zip(points, points[1:]):
        shapes.rod(module, start, end, 0.035, 'linen', sides=5)
    fittings.rope_coil(module, (1.35, -0.85, 0.0), radius=0.28, turns=3)
    module.socket('front', (0.0, -1.0, 0.0), (0, -1))
