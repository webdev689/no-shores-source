"""The Banner Standard (`outpost-standard-driftwood`, `-oak`, `-iron`, `-brass`, `-whalebone`, `-gilded`), 1 x 1 cell:
a T-shaped staff about 6 m tall on a weighted stone foot, a crossbar 1.8 m wide near its head standing just in front
of its pole and a finial over it. The page hangs the guild's banner from the crossbar, at `cloth`, so no cloth is
modelled. And the scaffolds (`outpost-scaffold-1`, `-2`, `-2x3`, `-3`, `-4`) the page stands over a structure being
built, each filling its footprint: poles and planks in lifts, braces, a ladder, a gin wheel, stacked timber and a tarp
over sacks inside a footing of laid stones.
"""
import math

import fittings
import kit
import outpost_kit as shell
import outpost_props as furnish
import shapes
import timbers

BAR_M = 1.8
BAR_Z = 5.4
TOP_M = 6.0


def weighted_foot(module, material='stone', trim='trim'):
    """The standard's foot: a squared stone stepped in two courses, the pole's socket in it; a part."""
    kit.block(module, (0.0, 0.0, 0.0), (1.3, 1.3, 0.35), material, bevel=0.05, wear=0.03, cuts=1)
    kit.block(module, (0.0, 0.0, 0.35), (0.9, 0.9, 0.3), material, bevel=0.04, wear=0.02)
    kit.block(module, (0.0, 0.0, 0.65), (0.5, 0.5, 0.1), trim, bevel=0.02, wear=0.0, part=False)


def crossbar(module, radius, material, ends=None, end_radius=0.07):
    """The crossbar along x just in front of the pole, its ends capped in `ends` when given, and the `cloth` socket
    under its middle, facing out of its front."""
    y = -radius - 0.06
    shapes.rod(module, (-BAR_M / 2, y, BAR_Z), (BAR_M / 2, y, BAR_Z), 0.05, material, sides=8)
    shapes.slab(module, (0.0, y / 2, BAR_Z), (0.16, -y + 0.06, 0.14), material)
    if ends:
        for side in (-1, 1):
            shapes.lathe(module, (side * (BAR_M / 2 - 0.1), y, BAR_Z), [(0.06, 0.0), (end_radius, 0.03),
                         (end_radius, 0.07), (0.0, 0.1)], ends, sides=8, turn=(0.0, side * math.pi / 2, 0.0))
    module.socket('cloth', (0.0, y, BAR_Z - 0.05), (0, -1))
    return y


def pole_part(module, radius):
    module.part((-max(radius, 0.08), -max(radius, 0.08), 0.0), (max(radius, 0.08), max(radius, 0.08), TOP_M))


def standard_driftwood(module):
    # A cairn of rough stones for its foot; the pole of bleached, crooked driftwood lashed where its lengths meet.
    for k in range(9):
        angle = math.tau * k / 9
        kit.rock(module, (math.cos(angle) * 0.45, math.sin(angle) * 0.45, 0.0), (0.42, 0.36, 0.34), k * 1.9,
                 material='rubble', part=False, detail=2)
    kit.rock(module, (0.0, 0.0, 0.25), (0.6, 0.55, 0.45), 4.4, material='rubble', part=False, detail=2)
    module.part((-0.7, -0.7, 0.0), (0.7, 0.7, 0.6))
    joints = [(0.0, 0.0, 0.0), (0.05, -0.03, 1.4), (-0.04, 0.03, 2.9), (0.04, 0.0, 4.3), (0.0, 0.0, TOP_M - 0.2)]
    for (a, b), radius in zip(zip(joints, joints[1:]), (0.1, 0.09, 0.085, 0.075)):
        shapes.rod(module, a, b, radius, 'bone', sides=7, end_radius=radius * 0.85)
        shapes.lathe(module, (b[0], b[1], b[2] - 0.15), [(radius + 0.025, 0.0), (radius + 0.025, 0.3)], 'linen',
                     sides=8)
    # Its head forks: two crooked tines over the bar, bound with rope.
    for side in (-1, 1):
        shapes.rod(module, (0.0, 0.0, TOP_M - 0.25), (side * 0.22, 0.0, TOP_M + 0.15), 0.05, 'bone', sides=6,
                   end_radius=0.02)
    y = crossbar(module, 0.09, 'bone')
    for side in (-1, 1):
        shapes.lathe(module, (side * 0.75, y, BAR_Z - 0.08), [(0.07, 0.0), (0.07, 0.16)], 'linen', sides=6)
        shapes.rod(module, (0.0, 0.0, BAR_Z + 0.4), (side * 0.7, y, BAR_Z + 0.04), 0.012, 'linen', sides=3)
    pole_part(module, 0.1)
    shell.fits(module, 1, 1)


def standard_oak(module):
    weighted_foot(module)
    shapes.lathe(module, (0.0, 0.0, 0.75), [(0.11, 0.0), (0.1, 0.2), (0.085, 0.4), (0.08, TOP_M - 1.0),
                 (0.09, TOP_M - 0.95), (0.08, TOP_M - 0.9), (0.075, TOP_M - 0.75)], 'timber', sides=8, smooth=False)
    for z in (1.2, 2.6, 4.0):
        shapes.lathe(module, (0.0, 0.0, z), [(0.1, 0.0), (0.1, 0.08)], 'iron', sides=8, smooth=False)
        for k in range(4):
            shapes.cutout(module, [(-0.04, 0.0), (0.04, 0.0), (0.0, 0.25)], 0.02, 'timber',
                          (math.cos(k * math.pi / 2 + math.pi / 4) * 0.085, math.sin(k * math.pi / 2 + math.pi / 4) *
                           0.085, z + 0.1), turn=(0.0, 0.0, k * math.pi / 2 + math.pi / 4 + math.pi / 2))
    shapes.lathe(module, (0.0, 0.0, TOP_M - 0.2), [(0.1, 0.0), (0.12, 0.08), (0.09, 0.2), (0.11, 0.3), (0.0, 0.48)],
                 'iron', sides=8, smooth=False)
    crossbar(module, 0.09, 'timber', ends='iron')
    pole_part(module, 0.11)
    shell.fits(module, 1, 1)


def standard_iron(module):
    weighted_foot(module, trim='iron')
    shapes.lathe(module, (0.0, 0.0, 0.75), [(0.08, 0.0), (0.06, 0.15), (0.06, TOP_M - 0.8)], 'iron', sides=8)
    for z in range(6):
        height = 1.1 + z * 0.8
        shapes.lathe(module, (0.0, 0.0, height), [(0.075, 0.0), (0.075, 0.06)], 'iron', sides=8, smooth=False)
        for k in range(4):
            angle = k * math.pi / 2
            shapes.ball(module, (math.cos(angle) * 0.078, math.sin(angle) * 0.078, height + 0.03), 0.016, 'iron')
    y = crossbar(module, 0.06, 'iron', ends='iron', end_radius=0.08)
    for k in range(9):
        shapes.ball(module, (-0.8 + k * 0.2, y - 0.045, BAR_Z), 0.018, 'iron')
    for side in (-1, 1):
        shapes.rod(module, (0.0, -0.03, BAR_Z - 0.6), (side * 0.5, y, BAR_Z - 0.04), 0.022, 'iron', sides=4)
    shapes.cutout(module, [(-0.12, 0.0), (0.12, 0.0), (0.05, 0.08), (0.0, 0.55), (-0.05, 0.08)], 0.04, 'iron',
                  (0.0, 0.0, TOP_M - 0.08))
    shapes.lathe(module, (0.0, 0.0, TOP_M - 0.12), [(0.09, 0.0), (0.09, 0.08), (0.05, 0.1)], 'iron', sides=8)
    pole_part(module, 0.08)
    shell.fits(module, 1, 1)


def standard_brass(module):
    weighted_foot(module, trim='gold')
    profile = [(0.09, 0.0), (0.06, 0.12)]
    for ring in range(7):
        z = 0.5 + ring * 0.7
        profile += [(0.055, z - 0.08), (0.085, z), (0.07, z + 0.04), (0.085, z + 0.08), (0.055, z + 0.16)]
    profile += [(0.05, TOP_M - 0.85)]
    shapes.lathe(module, (0.0, 0.0, 0.75), profile, 'gold', sides=10)
    shapes.lathe(module, (0.0, 0.0, TOP_M - 0.12), [(0.06, 0.0), (0.1, 0.06), (0.13, 0.18), (0.1, 0.3), (0.04, 0.36),
                 (0.05, 0.42), (0.0, 0.62)], 'gold', sides=12)
    crossbar(module, 0.06, 'gold', ends='gold', end_radius=0.09)
    pole_part(module, 0.09)
    shell.fits(module, 1, 1)


def standard_whalebone(module):
    weighted_foot(module)
    shapes.lathe(module, (0.0, 0.0, 0.75), [(0.12, 0.0), (0.1, 0.3), (0.085, 2.5), (0.075, TOP_M - 0.85),
                 (0.06, TOP_M - 0.75)], 'bone', sides=10)
    for z in (1.3, 2.3, 3.3, 4.3):
        shapes.lathe(module, (0.0, 0.0, z), [(0.09, 0.0), (0.11, 0.05), (0.09, 0.1)], 'bone', sides=10)
        shapes.lathe(module, (0.0, 0.0, z + 0.14), [(0.088, 0.0), (0.1, 0.03), (0.088, 0.06)], 'black', sides=10)
    # A jawbone for its crossbar: a long bone bowed upward, thick at its hinge ends, teeth set along its foot.
    y = -0.15
    outline = [(-BAR_M / 2, 0.06), (-0.5, 0.16), (0.0, 0.2), (0.5, 0.16), (BAR_M / 2, 0.06), (BAR_M / 2, -0.12),
               (0.5, -0.02), (0.0, 0.02), (-0.5, -0.02), (-BAR_M / 2, -0.12)]
    shapes.cutout(module, outline, 0.1, 'bone', (0.0, y, BAR_Z))
    shapes.slab(module, (0.0, y / 2, BAR_Z + 0.08), (0.16, -y + 0.06, 0.16), 'bone')
    for k in range(7):
        x = -0.6 + k * 0.2
        shapes.cutout(module, [(-0.03, 0.0), (0.03, 0.0), (0.0, -0.08)], 0.05, 'bone',
                      (x, y, BAR_Z + 0.03 - 0.04 * math.cos(x / 0.9 * math.pi / 2)))
    module.socket('cloth', (0.0, y, BAR_Z - 0.12), (0, -1))
    shapes.lathe(module, (0.0, 0.0, TOP_M - 0.2), [(0.07, 0.0), (0.1, 0.12), (0.07, 0.3), (0.02, 0.62), (0.0, 0.65)],
                 'bone', sides=8)
    pole_part(module, 0.12)
    shell.fits(module, 1, 1)


def standard_gilded(module):
    weighted_foot(module, trim='gold')
    kit.block(module, (0.0, 0.0, 0.35), (0.96, 0.96, 0.06), 'gold', bevel=0.01, wear=0.0, part=False)
    # The timber pole, sheathed in gilt between collars so the wood shows only in a band above each.
    shapes.lathe(module, (0.0, 0.0, 0.75), [(0.08, 0.0), (0.075, TOP_M - 0.95)], 'timber', sides=10)
    for low, high in ((0.75, 1.9), (2.25, 3.3), (3.65, 4.7), (5.05, TOP_M - 0.2)):
        shapes.lathe(module, (0.0, 0.0, low), [(0.1, 0.0), (0.09, 0.08), (0.088, high - low - 0.08), (0.1, high - low)],
                     'gold', sides=10)
        shapes.lathe(module, (0.0, 0.0, high), [(0.08, 0.0), (0.12, 0.05), (0.08, 0.1)], 'gold', sides=10)
    y = crossbar(module, 0.08, 'gold', ends='gold', end_radius=0.1)
    for side in (-1, 1):
        scroll = [(0.0, 0.0), (0.14, 0.04), (0.22, 0.14), (0.2, 0.26), (0.1, 0.28), (0.08, 0.2), (0.14, 0.14),
                  (0.06, 0.08)]
        shapes.cutout(module, [(side * x, z) for x, z in scroll], 0.03, 'gold', (side * (BAR_M / 2 - 0.3), y,
                      BAR_Z + 0.03))
    # The ornate finial: a gilt crown of points round an orb, a star over it.
    shapes.lathe(module, (0.0, 0.0, TOP_M - 0.2), [(0.07, 0.0), (0.16, 0.1), (0.14, 0.18), (0.0, 0.2)], 'gold',
                 sides=12)
    for k in range(6):
        angle = math.tau * k / 6
        shapes.cutout(module, [(-0.05, 0.0), (0.05, 0.0), (0.0, 0.18)], 0.02, 'gold',
                      (math.cos(angle) * 0.13, math.sin(angle) * 0.13, TOP_M - 0.02), turn=(0.0, 0.0, angle + math.pi
                                                                                          / 2))
    shapes.ball(module, (0.0, 0.0, TOP_M + 0.12), 0.09, 'gold', detail=2)
    star = [((0.16 if k % 2 == 0 else 0.06) * math.sin(math.pi * k / 4), (0.16 if k % 2 == 0 else 0.06) *
             math.cos(math.pi * k / 4)) for k in range(8)]
    shapes.cutout(module, star, 0.03, 'gold', (0.0, 0.0, TOP_M + 0.38))
    pole_part(module, 0.1)
    shell.fits(module, 1, 1)


def scaffold(module, wide, deep):
    """A scaffold filling `wide` by `deep` cells: two rings of poles (one on a single cell) braced in lifts of 2 m,
    planks laid on each lift between them, a ladder and a gin wheel; inside, the laid stones of the footing, timber
    stacked and a tarp over sacks."""
    half = (wide * shell.CELL_M / 2 - 0.45, deep * shell.CELL_M / 2 - 0.45)
    lifts = 1 if wide * deep == 1 else (2 if wide * deep < 9 else 3)
    rings = [half] if wide * deep == 1 else [half, (half[0] - 1.1, half[1] - 1.1)]
    top = lifts * 2.0 + 1.0

    def ring_points(half_x, half_y):
        steps_x, steps_y = max(1, round(2 * half_x / 2.2)), max(1, round(2 * half_y / 2.2))
        columns = [-half_x + 2 * half_x * k / steps_x for k in range(steps_x + 1)]
        rows = [-half_y + 2 * half_y * k / steps_y for k in range(steps_y + 1)]
        return columns, rows

    for half_x, half_y in rings:
        columns, rows = ring_points(half_x, half_y)
        for i, x in enumerate(columns):
            for j, y in enumerate(rows):
                if i in (0, len(columns) - 1) or j in (0, len(rows) - 1):
                    shell.pole(module, (x, y, 0.0), (x, y, top), 0.05)
                    shapes.slab(module, (x, y, 0.03), (0.3, 0.3, 0.06), 'timber')
        for lift in range(1, lifts + 1):
            z = lift * 2.0
            for y in (-half_y, half_y):
                shapes.rod(module, (-half_x - 0.15, y, z), (half_x + 0.15, y, z), 0.04, 'timber', sides=6)
            for x in (-half_x, half_x):
                shapes.rod(module, (x, -half_y - 0.15, z), (x, half_y + 0.15, z), 0.04, 'timber', sides=6)
    # Planks on each lift along the outer ring, and braces across the outer faces bay by bay.
    half_x, half_y = half
    band = 1.1 if len(rings) > 1 else 0.6
    for lift in range(1, lifts + 1):
        z = lift * 2.0 + 0.06
        for k in range(3):
            inset = band * (k + 0.5) / 3
            for y in (-half_y + inset, half_y - inset):
                shapes.slab(module, (0.0, y, z), (half_x * 2 - 0.1, band / 3 - 0.03, 0.05), 'timber')
            for x in (-half_x + inset, half_x - inset):
                shapes.slab(module, (x, 0.0, z + 0.05), (band / 3 - 0.03, half_y * 2 - band * 2, 0.05), 'timber')
        for y in (-half_y, half_y):
            module.part((-half_x, min(y, y - band if y > 0 else y + band), z - 0.06),
                        (half_x, max(y, y - band if y > 0 else y + band), z + 0.1))
        for x in (-half_x, half_x):
            module.part((min(x, x - band if x > 0 else x + band), -half_y + band, z - 0.06),
                        (max(x, x - band if x > 0 else x + band), half_y - band, z + 0.1))
    columns, rows = ring_points(half_x, half_y)
    for lift in range(lifts):
        for a, b in zip(columns, columns[1:]):
            for y in (-half_y - 0.07, half_y + 0.07):
                low, high = (a, b) if lift % 2 else (b, a)
                shapes.rod(module, (low, y, lift * 2.0 + 0.1), (high, y, lift * 2.0 + 1.9), 0.03, 'timber', sides=5)
        for a, b in zip(rows, rows[1:]):
            for x in (-half_x - 0.07, half_x + 0.07):
                shapes.rod(module, (x, a, lift * 2.0 + 0.1), (x, b, lift * 2.0 + 1.9), 0.03, 'timber', sides=5)
    # A ladder up the front to the first lift, a gin wheel out from the top at a corner with its rope and bucket.
    ladder_x = half_x - 0.7
    for side in (-0.22, 0.22):
        shapes.rod(module, (ladder_x + side, -half_y - 0.15, 0.0), (ladder_x + side, -half_y - 0.15, 3.0), 0.03,
                   'timber', sides=5)
    for rung in range(10):
        height = 0.25 + rung * 0.28
        shapes.rod(module, (ladder_x - 0.22, -half_y - 0.15, height), (ladder_x + 0.22, -half_y - 0.15, height), 0.018,
                   'timber', sides=4)
    corner = (-half_x + 0.1, -half_y + 0.1)
    shapes.slab(module, (corner[0], corner[1] + 0.25, top - 0.15), (0.1, 0.7, 0.1), 'timber')
    shapes.ring(module, (corner[0], corner[1] + 0.5, top - 0.35), 0.15, 0.04, 'iron', turn=(0.0, math.pi / 2, 0.0),
                segments=10, sides=4)
    shapes.rod(module, (corner[0], corner[1] + 0.35, top - 0.35), (corner[0], corner[1] + 0.35, 1.0), 0.012, 'linen',
               sides=3)
    shapes.lathe(module, (corner[0], corner[1] + 0.35, 0.6), [(0.14, 0.0), (0.18, 0.36), (0.0, 0.36)], 'timber',
                 sides=8)
    # Inside: a course of laid stones round the footing, timber stacked, sacks under a tarp.
    inner = (half_x - band - 0.25, half_y - band - 0.25)
    if min(inner) > 1.2:
        for start_x, start_y, end_x, end_y in ((-inner[0], -inner[1], inner[0], -inner[1]),
                                               (-inner[0], inner[1], inner[0], inner[1]),
                                               (-inner[0], -inner[1], -inner[0], inner[1]),
                                               (inner[0], -inner[1], inner[0], inner[1])):
            kit.block(module, ((start_x + end_x) / 2, (start_y + end_y) / 2, 0.0),
                      (abs(end_x - start_x) + 0.4, abs(end_y - start_y) + 0.4, 0.35),
                      'stone', bevel=0.04, wear=0.04, cuts=1)
    room = min(inner)
    if room > 1.8:
        furnish.timber_stack(module, (-inner[0] / 2, 0.0, 0.0), min(3.0, inner[0]), layers=3, count=4,
                             along_x=False)
        sacks = [(inner[0] / 2 + along, across) for along, across in ((-0.35, -0.3), (0.3, -0.25), (0.0, 0.3),
                                                                       (-0.4, 0.35))]
    else:
        for k in range(3):
            shapes.slab(module, (0.0, -0.4 + k * 0.05, 0.08 + k * 0.1), (1.6, 0.25, 0.08), 'timber')
        module.part((-0.8, -0.55, 0.0), (0.8, -0.2, 0.3))
        sacks = [(-0.3, 0.45), (0.25, 0.5)]
    if room > 4.0:
        # A big footing waits on more: cut stones stacked by the timber, a second stack of timber at the back.
        for layer, count in enumerate((3, 2, 1)):
            for stone in range(count):
                kit.block(module, (-0.6 * (count - 1) / 2 + stone * 0.6 + 0.0, -inner[1] / 2, layer * 0.42),
                          (0.56, 0.9, 0.4), 'stone', bevel=0.03, wear=0.02, part=False)
        module.part((-0.9, -inner[1] / 2 - 0.45, 0.0), (0.9, -inner[1] / 2 + 0.45, 1.26))
        furnish.timber_stack(module, (0.0, inner[1] / 2, 0.0), 3.0, layers=2, count=4, along_x=True, beam=0.18)
    for x, y in sacks:
        fittings.sack(module, (x, y, 0.0), size=0.55, material='canvas')
    middle = (sum(x for x, _ in sacks) / len(sacks), sum(y for _, y in sacks) / len(sacks))
    reach = max(max(abs(x - middle[0]), abs(y - middle[1])) for x, y in sacks) + 0.35
    timbers.tarp(module, middle, (reach * 2 + 0.3, reach * 2 + 0.3), [(middle[0] - reach, middle[1] - reach,
                 middle[0] + reach, middle[1] + reach, 0.55)], sag=0.05)
    module.part((middle[0] - reach, middle[1] - reach, 0.0), (middle[0] + reach, middle[1] + reach, 0.6))
    shell.fits(module, wide, deep)


def scaffold_builder(wide, deep):
    return lambda module: scaffold(module, wide, deep)


STANDARDS = (('outpost-standard-driftwood', standard_driftwood), ('outpost-standard-oak', standard_oak),
             ('outpost-standard-iron', standard_iron), ('outpost-standard-brass', standard_brass),
             ('outpost-standard-whalebone', standard_whalebone), ('outpost-standard-gilded', standard_gilded))
SCAFFOLDS = (('outpost-scaffold-1', scaffold_builder(1, 1)), ('outpost-scaffold-2', scaffold_builder(2, 2)),
             ('outpost-scaffold-2x3', scaffold_builder(2, 3)), ('outpost-scaffold-3', scaffold_builder(3, 3)),
             ('outpost-scaffold-4', scaffold_builder(4, 4)))
