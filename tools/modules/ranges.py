"""The hub's stone ranges and its sealed gate.

`range`, 24 x 10 x 12: a two-storey range dividing the courts: a ground-floor arcade of six round arches on piers at
its front (-y), walked under; string course, windowed upper storey, cornice and roof parapet; windows on both storeys
at its back. Its ends are plain, since segments stand end to end. `range-gate`, 12 x 10 x 12: the same pierced by an
arched passage 6 m wide and 7 m high. `sealed-gate`, 14 x 4 x 14: a great gate shut across a passage 12 m wide, two
iron-banded leaves under a tympanum with a gilt sun.
"""
import math

import fittings
import kit
import shapes

HALF_Y = 4.8
BODY_M = 10.5
STOREY_M = 5.2
ARCADE_DEEP_M = 2.8
PIER_M = 0.8
CROWN_M = 4.4


def _cutter(module, middle, size):
    """A box to cut an opening with, not itself drawn."""
    hole = kit.block(module, middle, size, 'stone', bevel=0.0, wear=0.0, part=False)
    module.objects.remove(hole)
    return hole


def window(module, x, y, sill, facing, wide=1.3, high=2.2):
    """A window on a face at `y` (facing -1 south or 1 north): a dark recessed light with a glazing bar cross, a
    moulded surround, a sill and a lintel with a keystone."""
    out = facing
    shapes.slab(module, (x, y + out * 0.01, sill + high / 2), (wide, 0.04, high), 'black')
    shapes.slab(module, (x, y + out * 0.04, sill + high / 2), (0.06, 0.04, high), 'timber')
    shapes.slab(module, (x, y + out * 0.04, sill + high * 0.62), (wide, 0.04, 0.06), 'timber')
    for side in (-1, 1):
        shapes.slab(module, (x + side * (wide / 2 + 0.1), y + out * 0.08, sill + high / 2), (0.2, 0.16, high + 0.1),
                    'trim')
    shapes.slab(module, (x, y + out * 0.12, sill - 0.06), (wide + 0.6, 0.24, 0.12), 'trim')
    shapes.slab(module, (x, y + out * 0.1, sill + high + 0.12), (wide + 0.5, 0.2, 0.24), 'trim')
    shapes.slab(module, (x, y + out * 0.14, sill + high + 0.15), (0.26, 0.2, 0.36), 'trim')


def door(module, x, y, high=3.0, wide=1.6):
    """A plank door in a stone surround on the arcade's back wall."""
    shapes.slab(module, (x, y - 0.02, high / 2), (wide, 0.06, high), 'timber')
    for plank in range(1, 4):
        shapes.slab(module, (x - wide / 2 + plank * wide / 4, y - 0.055, high / 2), (0.02, 0.01, high - 0.05),
                    'black')
    for z in (0.5, high - 0.6):
        shapes.slab(module, (x, y - 0.06, z), (wide - 0.1, 0.02, 0.08), 'iron')
    for side in (-1, 1):
        shapes.slab(module, (x + side * (wide / 2 + 0.12), y - 0.08, high / 2), (0.24, 0.16, high), 'trim')
    shapes.slab(module, (x, y - 0.08, high + 0.15), (wide + 0.7, 0.18, 0.3), 'trim')


def crown(module, west, east, deep_south, deep_north):
    """The cornice, the parapet and its coping along the top of a block from `west` to `east`, its faces at
    `deep_south` and `deep_north`; the parapet a part."""
    for y, facing in ((deep_south, -1), (deep_north, 1)):
        shapes.slab(module, ((west + east) / 2, y + facing * 0.1, BODY_M + 0.12), (east - west, 0.4, 0.24), 'trim')
        shapes.slab(module, ((west + east) / 2, y + facing * 0.04, BODY_M - 0.12), (east - west, 0.26, 0.24), 'trim')
        kit.block(module, ((west + east) / 2, y - facing * 0.25, BODY_M + 0.24), (east - west, 0.5, 1.0), 'stone',
                  bevel=0.03, wear=0.02)
        shapes.slab(module, ((west + east) / 2, y - facing * 0.25, BODY_M + 1.3), (east - west, 0.62, 0.12), 'trim')
    kit.block(module, ((west + east) / 2, 0.0, BODY_M), (east - west, deep_north - deep_south, 0.06), 'paving',
              bevel=0.0, wear=0.0, part=False)


def course(module, west, east, y, facing, z):
    """A string course along a face."""
    shapes.slab(module, ((west + east) / 2, y + facing * 0.08, z), (east - west, 0.2, 0.22), 'trim')


def range_segment(module):
    half_x = 12.0
    front = -HALF_Y
    arcade_back = front + ARCADE_DEEP_M + PIER_M
    # The body behind the arcade, the arcade's front wall pierced by six arches, and its vault over the walk.
    kit.block(module, (0.0, (arcade_back + HALF_Y) / 2, 0.0), (half_x * 2, HALF_Y - arcade_back, BODY_M), 'stone',
              bevel=0.04, wear=0.02, cuts=2)
    wall = kit.block(module, (0.0, front + PIER_M / 2, 0.0), (half_x * 2, PIER_M, BODY_M), 'stone', bevel=0.04,
                     wear=0.02, cuts=2, part=False)
    bays = 6
    pitch = half_x * 2 / bays
    radius = (pitch - PIER_M * 1.25) / 2
    spring = CROWN_M - radius
    for bay in range(bays):
        x = -half_x + pitch * (bay + 0.5)
        kit.cut(wall, _cutter(module, (x, front + PIER_M / 2, -0.1), (radius * 2, PIER_M + 1.0, spring + 0.1)))
        kit.cut(wall, kit.cylinder_cutter((x, front + PIER_M / 2, spring), radius, PIER_M + 1.0))
        # The arch's voussoirs and keystone, and the pier's impost.
        shapes.cutout(module, _arch_band(radius, radius + 0.35), 0.1, 'trim', (x, front - 0.05, spring))
        shapes.slab(module, (x, front - 0.1, CROWN_M + 0.15), (0.4, 0.2, 0.55), 'trim')
        if bay % 2 == 0:
            door(module, x, arcade_back, high=3.0)
        else:
            window(module, x, arcade_back, 1.0, -1, wide=1.2, high=1.9)
        module.part((x - pitch / 2, front, CROWN_M), (x + pitch / 2, front + PIER_M, BODY_M))
    for pier in range(bays + 1):
        x = -half_x + pitch * pier
        west, east = max(-half_x, x - PIER_M * 0.625), min(half_x, x + PIER_M * 0.625)
        module.part((west, front, 0.0), (east, front + PIER_M, CROWN_M))
        shapes.slab(module, ((west + east) / 2, front - 0.06, spring), (east - west + 0.1, 0.14, 0.2), 'trim')
        shapes.slab(module, ((west + east) / 2, front - 0.06, 0.2), (east - west + 0.12, 0.14, 0.4), 'trim')
    kit.block(module, (0.0, (front + PIER_M + arcade_back) / 2, CROWN_M), (half_x * 2, ARCADE_DEEP_M, STOREY_M -
              CROWN_M + 0.4), 'stone', bevel=0.0, wear=0.0, part=False)
    module.part((-half_x, front + PIER_M, CROWN_M), (half_x, arcade_back, BODY_M))
    kit.block(module, (0.0, (front + PIER_M + arcade_back) / 2, 0.0), (half_x * 2, ARCADE_DEEP_M, 0.04), 'paving',
              bevel=0.0, wear=0.0, part=False)
    # The upper storey: a string course, windows over each arch, and windows on both storeys at the back.
    course(module, -half_x, half_x, front, -1, STOREY_M)
    course(module, -half_x, half_x, HALF_Y, 1, STOREY_M)
    for bay in range(bays):
        x = -half_x + pitch * (bay + 0.5)
        window(module, x, front, STOREY_M + 1.1, -1)
        window(module, x, HALF_Y, STOREY_M + 1.1, 1)
        window(module, x, HALF_Y, 1.3, 1)
    crown(module, -half_x, half_x, front, HALF_Y)
    kit.block(module, (0.0, HALF_Y, 0.0), (half_x * 2, 0.24, 0.45), 'trim', bevel=0.03, wear=0.0, part=False)
    module.socket('front', (0.0, front, 0.0), (0, -1))


def _arch_band(inner, outer, segments=12, flatten=1.0):
    """The outline of an arch's ring of voussoirs, from `inner` to `outer` radius, springing at z 0, its height
    `flatten` of its half-width (a flattened arch below one)."""
    def point(radius, step, squash):
        angle = math.pi * step / segments
        return (math.cos(angle) * radius, math.sin(angle) * radius * squash)

    inner_squash = flatten if flatten == 1.0 else (flatten * outer - (outer - inner)) / inner
    rim = [point(outer, step, flatten) for step in range(segments + 1)]
    hollow = [point(inner, step, inner_squash) for step in range(segments, -1, -1)]
    return rim + hollow


def range_gate(module):
    half_x = 6.0
    wide = 3.0
    spring = 7.0 - wide
    body = kit.block(module, (0.0, 0.0, 0.0), (half_x * 2, HALF_Y * 2, BODY_M), 'stone', bevel=0.04, wear=0.02,
                     cuts=2, part=False)
    kit.cut(body, _cutter(module, (0.0, 0.0, -0.1), (wide * 2, HALF_Y * 2 + 1.0, spring + 0.1)))
    kit.cut(body, kit.cylinder_cutter((0.0, 0.0, spring), wide, HALF_Y * 2 + 1.0))
    for side in (-1, 1):
        module.part((side * wide if side > 0 else -half_x, -HALF_Y, 0.0),
                    (half_x if side > 0 else -wide, HALF_Y, BODY_M))
    module.part((-wide, -HALF_Y, 7.0), (wide, HALF_Y, BODY_M))
    kit.block(module, (0.0, 0.0, 0.0), (wide * 2, HALF_Y * 2, 0.04), 'paving', bevel=0.0, wear=0.0, part=False)
    for y, facing in ((-HALF_Y, -1), (HALF_Y, 1)):
        shapes.cutout(module, _arch_band(wide, wide + 0.55, 14), 0.12, 'trim', (0.0, y + facing * 0.06, spring))
        shapes.slab(module, (0.0, y + facing * 0.12, 7.25), (0.6, 0.24, 0.8), 'trim')
        for side in (-1, 1):
            shapes.slab(module, (side * (wide + 0.3), y + facing * 0.08, spring), (0.9, 0.16, 0.3), 'trim')
            shapes.slab(module, (side * (wide + 0.3), y + facing * 0.08, 0.25), (0.9, 0.16, 0.5), 'trim')
            fittings.lantern(module, (side * (wide + 1.4), y + facing * 0.45, 3.0), size=0.34)
            shapes.rod(module, (side * (wide + 1.4), y, 2.95), (side * (wide + 1.4), y + facing * 0.45, 2.95), 0.035,
                       'iron', sides=6)
            window(module, side * (wide + 1.6), y, STOREY_M + 1.1, facing, wide=1.1)
        for side in (-1, 1):
            west, east = (-half_x, -wide - 0.6) if side < 0 else (wide + 0.6, half_x)
            course(module, west, east, y, facing, STOREY_M)
        for side in (-1, 1):
            west, east = (-half_x, -wide) if side < 0 else (wide, half_x)
            kit.block(module, ((west + east) / 2, y, 0.0), (east - west, 0.24, 0.45), 'trim', bevel=0.03, wear=0.0,
                      part=False)
    crown(module, -half_x, half_x, -HALF_Y, HALF_Y)
    module.socket('front', (0.0, -HALF_Y, 0.0), (0, -1))
    module.socket('through', (0.0, -HALF_Y, 0.0), (0, -1))
    module.socket('through', (0.0, HALF_Y, 0.0), (0, 1))


def sealed_gate(module):
    half_x, half_y = 7.0, 2.0
    opening = 6.0
    spring = 7.6
    rise = 4.0
    # The piers either side, each with a pilaster on both faces, its plinth and its capital.
    for side in (-1, 1):
        middle = side * (opening + half_x) / 2
        kit.block(module, (middle, 0.0, 0.0), (half_x - opening, half_y * 2, 14.0), 'stone', bevel=0.05, wear=0.02,
                  cuts=2)
        for z, high in ((0.0, 0.7), (spring - 0.35, 0.35), (13.0, 0.3)):
            kit.block(module, (middle, 0.0, z), (half_x - opening + 0.3, half_y * 2 + 0.3, high), 'trim', bevel=0.04,
                      wear=0.0, part=False)
        for face in (-1, 1):
            kit.block(module, (middle, face * (half_y + 0.1), 0.7), (0.7, 0.2, spring - 1.05), 'stone', bevel=0.03,
                      wear=0.01, part=False)
    # The wall over the passage, cut in a flattened arch; the tympanum filling it, set back; the archivolt.
    over = kit.block(module, (0.0, 0.0, spring), (opening * 2, half_y * 2, 14.0 - spring), 'stone', bevel=0.04,
                     wear=0.02, cuts=2, part=False)
    cutter = kit.cylinder_cutter((0.0, 0.0, spring), opening, half_y * 2 + 1.0)
    cutter.scale = (1.0, rise / opening, 1.0)
    kit.cut(over, cutter)
    module.part((-opening, -half_y, spring), (opening, half_y, 14.0))
    shapes.cutout(module, _arch_band(opening, opening, 16, rise / opening)[:17], 0.5, 'stone', (0.0, 0.0, spring))
    for face in (-1, 1):
        shapes.cutout(module, _arch_band(opening, opening + 0.7, 16, (rise + 0.7) / (opening + 0.7)), 0.14, 'trim',
                      (0.0, face * (half_y + 0.04), spring))
        shapes.slab(module, (0.0, face * (half_y + 0.1), spring + rise + 0.25), (0.8, 0.24, 1.1), 'trim')
        shapes.slab(module, (0.0, face * (half_y + 0.08), 13.15), (half_x * 2 + 0.3, 0.3, 0.3), 'trim')
        shapes.slab(module, (0.0, face * (half_y + 0.14), 13.75), (half_x * 2 + 0.4, 0.4, 0.5), 'trim')
    # The gilt sun on the tympanum's face toward the walk.
    sun = (0.0, -0.27, spring + 1.9)
    shapes.lathe(module, sun, [(0.7, 0.0), (0.7, 0.06), (0.0, 0.12)], 'gold', sides=20, turn=(math.pi / 2, 0.0, 0.0))
    for ray in range(12):
        angle = math.tau * ray / 12
        shapes.cutout(module, [(-0.14, 0.0), (0.14, 0.0), (0.0, 0.6 if ray % 2 else 0.95)], 0.04, 'gold',
                      (sun[0] + math.cos(angle) * 0.75, sun[1], sun[2] + math.sin(angle) * 0.75),
                      turn=(0.0, math.pi / 2 - angle, 0.0))
    # The two leaves, their planks, the iron bands across both, their studs, the rings and the bar.
    for side in (-1, 1):
        shapes.slab(module, (side * opening / 2, 0.0, spring / 2), (opening - 0.04, 0.4, spring), 'timber')
        for plank in range(1, 6):
            for face in (-1, 1):
                shapes.slab(module, (side * plank * opening / 6, face * 0.205, spring / 2), (0.03, 0.02, spring - 0.1),
                            'black')
    module.part((-opening, -0.3, 0.0), (opening, 0.3, spring))
    for face in (-1, 1):
        for z in (0.8, 2.9, 5.0, 7.0):
            shapes.slab(module, (0.0, face * 0.23, z), (opening * 2 - 0.1, 0.05, 0.24), 'iron')
            for stud in range(16):
                shapes.slab(module, (-opening + 0.4 + stud * (opening * 2 - 0.8) / 15, face * 0.27, z),
                            (0.07, 0.04, 0.07), 'iron', turn=(0.0, math.pi / 4, 0.0))
        for side in (-1, 1):
            shapes.ring(module, (side * 0.6, face * 0.33, 3.6), 0.28, 0.06, 'iron', turn=(math.pi / 2, 0.0, 0.0))
            shapes.slab(module, (side * 0.6, face * 0.27, 3.9), (0.24, 0.06, 0.24), 'iron')
    shapes.slab(module, (0.0, -0.4, 4.2), (opening * 2 - 0.6, 0.22, 0.32), 'iron', bevel=0.02)
    for x in (-4.5, -1.5, 1.5, 4.5):
        shapes.slab(module, (x, -0.33, 4.2), (0.18, 0.12, 0.6), 'iron')
    for side in (-1, 1):
        fittings.lantern(module, (side * (opening + 0.5), -half_y - 0.35, 4.0), size=0.4)
        shapes.rod(module, (side * (opening + 0.5), -half_y, 3.95), (side * (opening + 0.5), -half_y - 0.35, 3.95),
                   0.04, 'iron', sides=6)
    module.socket('front', (0.0, -half_y, 0.0), (0, -1))
