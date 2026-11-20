"""The keep's citadel: a curtain wall 60 m square on a plinth, round towers at its corners and a gatehouse in its
-y side, reached up a ramp. Inside, the lower bailey stands 1.2 m over the citadel's foot and the upper ward 3.6 m,
up a broad flight between them; the donjon stands on the upper ward. Flights along the inside of the east and west
walls climb to the wall-walk behind the parapet. Land up to the bailey's height lies hidden under it, so the citadel
stands on uneven ground without a pad.
"""
import math

import kit

HALF_M = 30.0
THICK_M = 2.4
INSIDE_M = HALF_M - THICK_M
BAILEY_M = 1.2
WARD_M = 3.6
# Where the upper ward's retaining face runs across, y.
WARD_FROM_M = 2.0
WALK_M = BAILEY_M + 8.0
GATE_HALF_M = 3.0
TOWER = (4.5, 13.0)
RISE_M = 0.24
RUN_M = 0.42


def paving(module, west, south, east, north, z):
    """Slabs laid in rows of their own lengths over a rectangle, top at `z`."""
    y = south
    while y < north - 0.3:
        deep = min(module.draw(1.6, 2.6), north - y)
        x = west
        while x < east - 0.3:
            long = min(module.draw(1.6, 3.2), east - x)
            kit.block(module, (x + long / 2, y + deep / 2, z - 0.2 + module.draw(-0.03, 0.01)),
                      (long - 0.06, deep - 0.06, 0.2), 'paving', bevel=0.0, wear=0.0, part=False)
            x += long
        y += deep


def wall(module, start, end, high):
    """A run of curtain wall from `start` to `end` (its outer face's ends), its parapet and merlons, battered at its
    foot; its body and parapet as parts. Walls run square to the frame."""
    along_x = abs(end[0] - start[0]) > abs(end[1] - start[1])
    length = abs(end[0] - start[0]) if along_x else abs(end[1] - start[1])
    outward = (0.0, math.copysign(1.0, start[1])) if along_x else (math.copysign(1.0, start[0]), 0.0)
    middle = ((start[0] + end[0]) / 2 - outward[0] * THICK_M / 2, (start[1] + end[1]) / 2 - outward[1] * THICK_M / 2)
    size = (length, THICK_M, high) if along_x else (THICK_M, length, high)
    kit.block(module, (*middle, -0.8), (size[0], size[1], high + 0.8), 'stone', bevel=0.05, wear=0.02)
    # The batter at its foot and the string course under its walk.
    batter = (middle[0] + outward[0] * 0.5, middle[1] + outward[1] * 0.5)
    kit.block(module, (*batter, -0.8), (size[0] + (0 if along_x else 1.0), size[1] + (1.0 if along_x else 0), 3.2),
              'stone', bevel=0.3, wear=0.03, part=False)
    course = (middle[0] + outward[0] * 0.25, middle[1] + outward[1] * 0.25)
    kit.block(module, (*course, high - 0.6), (size[0] + (0 if along_x else 0.5), size[1] + (0.5 if along_x else 0), 0.35),
              'trim', bevel=0.04, wear=0.0, part=False)
    # The parapet on its outer edge, and the merlons on it.
    edge = (start[0] - outward[0] * 0.3, start[1] - outward[1] * 0.3)
    far = (end[0] - outward[0] * 0.3, end[1] - outward[1] * 0.3)
    parapet = ((edge[0] + far[0]) / 2, (edge[1] + far[1]) / 2)
    kit.block(module, (*parapet, high), (length, 0.6, 1.1) if along_x else (0.6, length, 1.1), 'stone', bevel=0.03,
              wear=0.02)
    kit.battlements(module, edge, far, high + 1.1, 0.6)


def tower(module, at, radius, high):
    """A round tower with a corbelled crown and merlons round it; its part the box inside its round."""
    kit.column(module, (*at, -0.8), radius, high + 0.8, 'stone', sides=20, top=0.94, wear=0.02, part=False)
    module.part((at[0] - radius * 0.8, at[1] - radius * 0.8, 0.0), (at[0] + radius * 0.8, at[1] + radius * 0.8, high))
    kit.column(module, (*at, high - 0.9), radius * 1.06, 0.9, 'trim', sides=20, wear=0.0, part=False)
    for merlon in range(12):
        angle = math.tau * merlon / 12
        spot = (at[0] + math.cos(angle) * radius * 0.92, at[1] + math.sin(angle) * radius * 0.92, high)
        kit.block(module, spot, (1.1, 0.6, 1.2), 'stone', turn=angle + math.pi / 2, bevel=0.03, wear=0.03, part=False)


def flight(module, foot, way, width, rise_to):
    """Steps from `foot` (on the floor at its height) along `way` up to the height `rise_to`."""
    steps = max(1, round((rise_to - foot[2]) / RISE_M))
    kit.stair(module, foot, way, width, (rise_to - foot[2]) / steps, RUN_M, steps, wear=0.04)
    return steps * RUN_M


def build(module):
    # The plinth under the bailey and the upper ward, and their floors.
    module.part((-INSIDE_M, -INSIDE_M, 0.0), (INSIDE_M, WARD_FROM_M, BAILEY_M))
    module.part((-INSIDE_M, WARD_FROM_M, 0.0), (INSIDE_M, INSIDE_M, WARD_M))
    module.pad((-INSIDE_M, -INSIDE_M), (INSIDE_M, INSIDE_M), BAILEY_M - 0.3)
    kit.block(module, (0.0, (WARD_FROM_M - INSIDE_M) / 2, -0.8), (INSIDE_M * 2, INSIDE_M + WARD_FROM_M, BAILEY_M + 0.6),
              'rubble', bevel=0.0, wear=0.0, part=False)
    kit.block(module, (0.0, (WARD_FROM_M + INSIDE_M) / 2, -0.8), (INSIDE_M * 2, INSIDE_M - WARD_FROM_M, WARD_M + 0.6),
              'stone', bevel=0.05, wear=0.02, part=False)
    paving(module, -INSIDE_M, -INSIDE_M, INSIDE_M, WARD_FROM_M, BAILEY_M)
    paving(module, -INSIDE_M, WARD_FROM_M, INSIDE_M, INSIDE_M, WARD_M)
    # The broad flight from the bailey to the ward, and the ward's parapet either side of it.
    steps = round((WARD_M - BAILEY_M) / RISE_M)
    flight(module, (0.0, WARD_FROM_M - steps * RUN_M, BAILEY_M), (0, 1), 10.0, WARD_M)
    for side in (-1, 1):
        middle = side * (5.0 + (INSIDE_M - 5.0) / 2)
        kit.block(module, (middle, WARD_FROM_M + 0.3, WARD_M), (INSIDE_M - 5.0, 0.6, 1.0), 'stone', bevel=0.03, wear=0.02)
    # The curtain wall, broken by the gate in its -y side, and its corner towers.
    high = WALK_M
    for start, end in (((-HALF_M, HALF_M), (HALF_M, HALF_M)), ((HALF_M, -HALF_M), (HALF_M, HALF_M)),
                       ((-HALF_M, -HALF_M), (-HALF_M, HALF_M)), ((-HALF_M, -HALF_M), (-GATE_HALF_M - 3.0, -HALF_M)),
                       ((GATE_HALF_M + 3.0, -HALF_M), (HALF_M, -HALF_M))):
        wall(module, start, end, high)
    for x in (-HALF_M, HALF_M):
        for y in (-HALF_M, HALF_M):
            tower(module, (x, y), *TOWER)
    # The gatehouse: two square towers either side of the passage and an arch over it, the portcullis raised in it.
    for side in (-1, 1):
        at = (side * (GATE_HALF_M + 3.0), -HALF_M + 1.0)
        kit.block(module, (at[0], at[1], -0.8), (6.0, 8.0, 12.8), 'stone', bevel=0.06, wear=0.02)
        kit.battlements(module, (at[0] - 3.0, at[1] - 4.0), (at[0] + 3.0, at[1] - 4.0), 12.0, 0.6)
    over = kit.block(module, (0.0, -HALF_M + 1.0, 4.0), (GATE_HALF_M * 2, 8.0, high - 4.0 + 1.1), 'stone', bevel=0.04,
                     wear=0.02, part=False)
    kit.cut(over, kit.cylinder_cutter((0.0, -HALF_M + 1.0, 4.0), GATE_HALF_M, 9.0))
    module.part((-GATE_HALF_M, -HALF_M - 3.0, 6.6), (GATE_HALF_M, -HALF_M + 5.0, high + 1.1))
    for bar in range(7):
        x = -GATE_HALF_M + 0.4 + bar * (GATE_HALF_M * 2 - 0.8) / 6
        kit.block(module, (x, -HALF_M + 0.2, 5.4), (0.12, 0.12, 2.0), 'iron', bevel=0.0, wear=0.0, part=False)
    kit.block(module, (0.0, -HALF_M + 0.2, 5.6), (GATE_HALF_M * 2, 0.14, 0.12), 'iron', bevel=0.0, wear=0.0, part=False)
    # The passage's floor at the bailey's height, and the ramp up to it from the citadel's foot.
    module.part((-GATE_HALF_M, -HALF_M - 3.0, 0.0), (GATE_HALF_M, -INSIDE_M, BAILEY_M))
    paving(module, -GATE_HALF_M, -HALF_M - 3.0, GATE_HALF_M, -INSIDE_M, BAILEY_M)
    ramp = 8
    for step in range(ramp):
        y = -HALF_M - 3.0 - (ramp - step) * 1.0
        z = BAILEY_M * (step + 1) / (ramp + 1)
        kit.block(module, (0.0, y + 0.5, -0.4), (GATE_HALF_M * 2 + 1.0, 1.0, z + 0.4), 'paving', bevel=0.02, wear=0.02)
    # The donjon on the upper ward, its turrets, its door to the flight, and the braziers at its door and the gate.
    donjon = (0.0, 16.0)
    keep = kit.block(module, (*donjon, WARD_M - 0.5), (16.0, 16.0, 18.5), 'stone', bevel=0.08, wear=0.02)
    # Its windows: tall slots cut in three storeys round every face.
    for storey in (7.0, 11.5, 16.0):
        for side in range(4):
            for slot in (-4.0, 0.0, 4.0):
                if side == 0 and storey == 7.0 and slot == 0.0:
                    continue
                normal = ((0, -1), (1, 0), (0, 1), (-1, 0))[side]
                spot = (donjon[0] + normal[0] * 8.0 + (slot if normal[0] == 0 else 0.0),
                        donjon[1] + normal[1] * 8.0 + (slot if normal[1] == 0 else 0.0), WARD_M + storey)
                bpy_cutter = kit.block(module, spot, (0.7, 1.6, 2.2) if normal[0] == 0 else (1.6, 0.7, 2.2), 'stone',
                                       bevel=0.0, wear=0.0, part=False)
                module.objects.remove(bpy_cutter)
                kit.cut(keep, bpy_cutter)
    kit.battlements(module, (-8.0, 8.0), (8.0, 8.0), WARD_M + 18.0, 0.6)
    kit.battlements(module, (-8.0, 24.0), (8.0, 24.0), WARD_M + 18.0, 0.6)
    for x in (-8.0, 8.0):
        for y in (8.0, 24.0):
            kit.column(module, (x, y, WARD_M + 12.0), 1.6, 9.0, 'stone', sides=16, wear=0.01, part=False)
            kit.column(module, (x, y, WARD_M + 21.0), 1.9, 2.4, 'trim', sides=16, top=0.0, wear=0.0, part=False)
    kit.block(module, (0.0, 7.9, WARD_M), (3.0, 0.3, 4.2), 'timber', bevel=0.02, wear=0.0, part=False)
    for at in ((-2.6, 7.2, WARD_M), (2.6, 7.2, WARD_M), (-GATE_HALF_M - 1.0, -INSIDE_M + 1.5, BAILEY_M),
               (GATE_HALF_M + 1.0, -INSIDE_M + 1.5, BAILEY_M)):
        kit.column(module, at, 0.35, 1.2, 'iron', sides=10, top=1.4, wear=0.0)
    # The flights to the wall-walk: up the inside of the east wall from the bailey, of the west wall from the ward.
    flight(module, (INSIDE_M - 1.2, -INSIDE_M + 4.0, BAILEY_M), (0, 1), 2.2, WALK_M)
    flight(module, (-INSIDE_M + 1.2, WARD_FROM_M + 4.0, WARD_M), (0, 1), 2.2, WALK_M)
    # The bailey's well, its stores and a stack of timber.
    kit.column(module, (-12.0, -12.0, BAILEY_M), 1.3, 0.9, 'stone', sides=16, wear=0.03)
    for side in (-1, 1):
        kit.block(module, (-12.0 + side * 1.4, -12.0, BAILEY_M), (0.25, 0.25, 2.6), 'timber', bevel=0.0, wear=0.0,
                  part=False)
    kit.block(module, (-12.0, -12.0, BAILEY_M + 2.5), (3.2, 0.25, 0.25), 'timber', bevel=0.0, wear=0.0, part=False)
    for number in range(9):
        at = (14.0 + (number % 3) * 0.95 + module.draw(-0.1, 0.1), -20.0 + (number // 3) * 0.95, BAILEY_M)
        kit.column(module, at, 0.42, 0.95, 'timber', sides=10, top=0.9, wear=0.0, part=number % 3 == 0)
    for number in range(4):
        at = (18.5 + module.draw(-0.2, 0.2), -14.0 + number * 1.3, BAILEY_M)
        kit.block(module, at, (1.2, 1.2, 1.0 + (number % 2) * 0.2), 'timber', turn=module.draw(-0.1, 0.1), bevel=0.03,
                  wear=0.02, part=False)
    module.part((17.8, -14.7, BAILEY_M), (19.2, -9.4, BAILEY_M + 1.0))
    module.socket('gate', (0.0, -HALF_M - 3.0 - ramp, 0.0), (0, -1))
