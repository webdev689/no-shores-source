"""Cliff stairs: a stairway cut into the rock between two places at different heights, one module for each 2 m of
rise from 4 m to 24 m. Steps of 0.25 m by 0.42 m rise along +y (Blender's frame) from the stair's foot to a landing
at its top, with a landing every 6 m of rise between; rough rock cheeks stand either side, higher than a body steps,
and an arched gateway set into them stands at the foot. Each module is centred on its own run, its foot at -y.
"""
import math

import kit

WIDE_M = 4.0
CHEEK_M = 1.4
RISE_M = 0.25
RUN_M = 0.42
LANDING_EVERY_M = 6.0
LANDING_M = 2.4
TOP_M = 3.0
RISES = tuple(range(4, 25, 2))


def length_of(rise):
    """The run of a stairway rising `rise` metres, its landings and its top's landing in."""
    landings = max(0, math.ceil(rise / LANDING_EVERY_M) - 1)
    return round(rise / RISE_M) * RUN_M + landings * LANDING_M + TOP_M


def builder(rise):
    """The builder of the stairway rising `rise` metres."""

    def build(module):
        steps = round(rise / RISE_M)
        half = length_of(rise) / 2
        y = -half
        z = 0.0
        per_landing = round(LANDING_EVERY_M / RISE_M)
        cheek_from = []
        for step in range(steps):
            z += RISE_M
            kit.block(module, (0.0, y + RUN_M / 2, 0.0), (WIDE_M, RUN_M + 0.02, z), 'stone', bevel=0.025,
                      wear=0.03 if step % 3 else 0.06)
            cheek_from.append((y, z))
            y += RUN_M
            if (step + 1) % per_landing == 0 and step + 1 < steps:
                kit.block(module, (0.0, y + LANDING_M / 2, 0.0), (WIDE_M, LANDING_M, z), 'paving', bevel=0.02,
                          wear=0.02)
                cheek_from.append((y + LANDING_M / 2, z))
                kit.column(module, (WIDE_M / 2 - 0.5, y + LANDING_M / 2, z), 0.3, 1.0, 'iron', sides=10, top=1.4,
                           wear=0.0, part=False)
                y += LANDING_M
        kit.block(module, (0.0, y + TOP_M / 2, 0.0), (WIDE_M, TOP_M, rise), 'paving', bevel=0.02, wear=0.02)
        cheek_from.append((y + TOP_M / 2, rise))
        # The cheeks: rock either side, its line a metre over the steps', its parts every few steps.
        for side in (-1, 1):
            x = side * (WIDE_M / 2 + CHEEK_M / 2)
            for start in range(0, len(cheek_from), 4):
                group = cheek_from[start:start + 4]
                low_y, high_y = group[0][0] - RUN_M / 2, group[-1][0] + RUN_M / 2
                top = max(z for _, z in group) + 1.1
                module.part((x - CHEEK_M / 2, low_y, 0.0), (x + CHEEK_M / 2, high_y, top))
            blobs = [((x, at_y, at_z * 0.5 + 0.3), (CHEEK_M * 0.75, 1.6, at_z * 0.5 + 1.0))
                     for at_y, at_z in cheek_from[::3]]
            kit.organic(module, blobs, module.draw(0, 99), voxel=0.2, rough=0.3,
                        triangles=round(400 + 120 * rise), flat_foot=-0.3)
        # The gateway at the foot: piers in the cheeks and an arch over the first steps.
        foot = -half + 0.6
        for side in (-1, 1):
            kit.block(module, (side * (WIDE_M / 2 + 0.5), foot, -0.3), (1.2, 1.2, 4.6), 'stone', bevel=0.06, wear=0.03)
        over = kit.block(module, (0.0, foot, 3.2), (WIDE_M + 2.2, 1.2, 1.8), 'stone', bevel=0.05, wear=0.03,
                         part=False)
        kit.cut(over, kit.cylinder_cutter((0.0, foot, 3.2), WIDE_M / 2, 2.0))
        module.part((-WIDE_M / 2 - 1.1, foot - 0.6, 4.0), (WIDE_M / 2 + 1.1, foot + 0.6, 5.0))
        kit.block(module, (0.0, foot, 5.0), (WIDE_M + 2.6, 1.4, 0.3), 'trim', bevel=0.03, wear=0.0, part=False)
        module.socket('foot', (0.0, -half, 0.0), (0, -1))
        module.socket('top', (0.0, half, rise), (0, 1))

    return build
