"""The crypt's pillars, engaged columns, wall features, ceiling bosses, floor slabs and sconce. A shaft is a unit
z 0..1 the page stretches to the room's height, so it carries only upright detail; a capital and a wall's cap are
laid with their top at the ceiling, a boss hangs from z 0, and a slab lies under z 0.05. A dungeon lays these by the
hundred, so each is lean and keeps no face against the floor, the wall or the ceiling.
"""
import math
import random

import details
from shapes import extrude_outline, facing, flat, revolve, sweep
from styles.crypt import forms
from styles.crypt.hidden import cull


def half_lathe(profile, sides=8, z=0.0):
    """A profile [(radius, height), ...] turned through the front half only, round the upright through the origin:
    an engaged column's part, open at its back against the wall. u runs round it, v up the profile."""
    sections = []
    for step in range(sides + 1):
        turn = math.radians(-90 + 180 * step / sides)
        sections.append([(radius * math.sin(turn), radius * math.cos(turn), z + height) for radius, height in profile])
    faces = sweep(sections, closed=False, outward=lambda points, _: forms.centre(points)[:2] + (0.0,))
    for end, outward in ((0, -1.0), (-1, 1.0)):
        if profile[end][0] > 1e-6:
            faces.append(facing(flat([section[end] for section in sections]), (0.0, 0.0, outward)))
    return faces


# The base's mouldings over its plinth, (radius, height) from the plinth's top: a fat roll, a deep hollow, a roll.
BASE_PROFILE = [(0.34, 0.0), (0.37, 0.03), (0.345, 0.068), (0.29, 0.085), (0.282, 0.115), (0.318, 0.14),
                (0.3, 0.17)]
NECK_PROFILE = [(0.3, 0.0), (0.335, 0.014), (0.345, 0.036), (0.33, 0.058), (0.305, 0.07)]
PLINTH = 0.12


def pillar_base(kit):
    """A chamfered square plinth under a fat roll, a deep hollow and a roll, a carved skull on each corner where
    the old builders set a spur."""
    draw = random.Random('crypt.pillar.base')
    made = [kit.bevelled_box(-0.5, -0.5, 0.0, 0.5, 0.5, PLINTH, bevel=0.035, wear=0.005, draw=draw, part='trim'),
            kit.lathe(BASE_PROFILE, z=PLINTH, sides=16, part='stone')]
    for corner in range(4):
        at = (0.37 * (1 if corner in (0, 1) else -1), 0.37 * (1 if corner in (0, 3) else -1), PLINTH - 0.004)
        outward = math.degrees(math.atan2(-at[0], at[1]))
        made.append(forms.made(kit, forms.placed(forms.skull(0, half=True), at, turn=outward, size=0.62), 'relief',
                               closed=False))
    return cull(kit.join(made, 'pillar.base'), floor=0.0, ceiling=PLINTH + BASE_PROFILE[-1][1])


def pillar_shaft(kit):
    """A drum column's shaft: hewn faces a little uneven round it, two weathered cracks running up it."""
    draw = random.Random('crypt.pillar.shaft')
    count = 24
    reach = [0.31 + draw.uniform(-0.008, 0.008) for _ in range(count)]
    for crack in (5, 16):
        reach[crack] -= 0.02
    sections = [[(reach[step] * math.sin(math.tau * step / count), reach[step] * math.cos(math.tau * step / count),
                  height) for step in range(count)] for height in (0.0, 1.0)]
    faces = forms.loft(sections, caps=(False, False))
    return forms.made(kit, faces, 'stone', smooth=50.0, closed=False, name='pillar.shaft')


def _cushion_capital(kit, half, foot, front_only=False):
    """A cushion capital: a necking roll, the cushion with its lunettes carved, a carved band and a chamfered abacus
    whose top meets the ceiling; `front_only` keeps the half before the wall."""
    curved, lunettes = forms.cushion(half, foot, 0.34, rows=5, count=24)
    neck = revolve([(radius * foot / 0.31, height) for radius, height in NECK_PROFILE], (0.0, 0.0, 0.0),
                   sides=8 if front_only else 16)

    def kept(faces, lift=0.0):
        faces = forms.placed(faces, (0.0, 0.0, lift))
        return [face for face in faces if all(point[1] >= -1e-6 for point, _ in face)] if front_only else faces

    made = [forms.made(kit, kept(neck), 'trim', closed=False),
            forms.made(kit, kept(curved, 0.07), 'stone', closed=False),
            forms.made(kit, kept(lunettes, 0.07), 'relief', smooth=None, closed=False)]
    back = 0.0 if front_only else -half - 0.02
    made.append(kit.bevelled_box(-half - 0.02, back, 0.41, half + 0.02, half + 0.02, 0.48, bevel=0.012,
                                 part='relief'))
    back = 0.0 if front_only else -half - 0.08
    made.append(kit.bevelled_box(-half - 0.08, back, 0.48, half + 0.08, half + 0.08, 0.6, bevel=0.035, part='trim'))
    return made


def pillar_capital(kit):
    return cull(kit.join(_cushion_capital(kit, 0.44, 0.31), 'pillar.capital'), floor=0.0, ceiling=0.6)


def wall_base(kit):
    """An engaged column's base: half a plinth and the pillar's mouldings, on a pilaster's foot."""
    made = [kit.bevelled_box(-0.4, 0.0, 0.0, 0.4, 0.29, PLINTH, bevel=0.03, part='trim'),
            kit.box(-0.36, 0.0, 0.0, 0.36, 0.09, 0.34, part='stoneAlt'),
            forms.made(kit, half_lathe([(radius * 0.78, height) for radius, height in BASE_PROFILE], 8, PLINTH),
                       'stone', closed=False)]
    return cull(kit.join(made, 'wall.base'), floor=0.0, wall=0.0)


def wall_shaft(kit):
    """Half a round shaft 0.24 proud, on a flat pilaster that steps out behind it."""
    made = [forms.made(kit, half_lathe([(0.24, 0.0), (0.24, 1.0)], 10), 'stone', closed=False, smooth=50.0),
            kit.box(-0.36, 0.0, 0.0, 0.36, 0.09, 1.0, part='stoneAlt')]
    return cull(kit.join(made, 'wall.shaft'), floor=0.0, wall=0.0, ceiling=1.0)


def wall_cap(kit):
    """Half a cushion capital over the engaged column, its abacus run out along the pilaster."""
    made = _cushion_capital(kit, 0.34, 0.24, front_only=True)
    made.append(kit.box(-0.36, 0.0, 0.0, 0.36, 0.09, 0.48, part='stoneAlt'))
    return cull(kit.join(made, 'wall.cap'), floor=0.0, wall=0.0, ceiling=0.6)


def _arched_outline(half, low, spring, segments=12):
    """An outline (x, z): straight sides from `low` to `spring`, a round head over them."""
    return [(-half, low), (half, low)] + details.arch_curve(half, spring, segments=segments)[::-1]


def _winged_skull(kit, at, size):
    """A memento mori: a skull between two spread wings, their feathers notched, carved."""
    made = [forms.made(kit, forms.placed(forms.skull(2, half=True), at, size=size, depth=0.55), 'relief',
                       closed=False)]
    for side in (-1, 1):
        feathers = []
        for number in range(5):
            spread = math.radians(8 + number * 17)
            reach = 0.17 + 0.05 * math.sin(math.pi * number / 4)
            feathers.append((side * math.cos(spread) * reach, math.sin(spread) * reach * 0.75))
            if number < 4:
                notch = math.radians(16 + number * 17)
                feathers.append((side * math.cos(notch) * reach * 0.78, math.sin(notch) * reach * 0.6))
        outline = [(side * 0.05, 0.03)] + feathers + [(side * 0.06, 0.11)]
        outline = [(at[0] + x * size / 1.2, at[2] + 0.08 * size + z * size / 1.2) for x, z in outline]
        made.append(forms.made(kit, extrude_outline(outline, at[1] - 0.005, at[1] + 0.025, 'xz'), 'relief'))
    return made


def feature_a(kit):
    """A memorial tablet with a round head on a corbel, the lines of its epitaph standing from a carved field, a
    winged skull over it, between two iron prickets standing empty."""
    draw = random.Random('crypt.feature.a')
    made = [forms.made(kit, extrude_outline(_arched_outline(0.38, 0.95, 1.8), 0.0, 0.1, 'xz'), 'trim'),
            forms.made(kit, extrude_outline(_arched_outline(0.31, 1.02, 1.8), 0.1, 0.115, 'xz'), 'relief'),
            kit.extrude_outline([(-0.3, 0.95), (0.3, 0.95), (0.16, 0.74), (-0.16, 0.74)], 0.0, 0.12, 'xz',
                                part='trim'),
            kit.bevelled_box(-0.42, 0.0, 0.9, 0.42, 0.13, 0.97, bevel=0.015, part='trim')]
    for line in range(6):
        width = draw.uniform(0.17, 0.25) if line else 0.12
        height = 1.66 - line * 0.1
        made.append(kit.box(-width, 0.112, height, width, 0.13, height + 0.04, part='trim'))
    made += _winged_skull(kit, (0.0, 0.1, 2.1), 1.3)
    for side in (-1, 1):
        x = side * 0.6
        made.append(kit.bevelled_box(x - 0.04, 0.0, 1.18, x + 0.04, 0.02, 1.42, bevel=0.008, part='iron'))
        made.append(forms.made(kit, details.rope([(x, 0.02, 1.22), (x, 0.1, 1.26), (x, 0.17, 1.32)], 0.011, 6, 4,
                                                 0.06), 'iron'))
        made.append(kit.lathe([(0.0, 0.0), (0.02, 0.0), (0.07, 0.03), (0.075, 0.045), (0.065, 0.04), (0.0, 0.035)],
                              x, 0.17, 1.31, sides=10, part='iron'))
        made.append(kit.cone((x, 0.17, 1.345), (x, 0.17, 1.47), 0.01, 0.0, sides=5, part='iron'))
    return cull(kit.join(made, 'feature.a'), floor=0.0, wall=0.0)


def feature_b(kit):
    """A skull niche: a round-headed frame on a sill, three shelves of skulls against the heap's dark behind."""
    draw = random.Random('crypt.feature.b')
    made = [kit.bevelled_box(-0.62, 0.0, 0.0, 0.62, 0.28, 0.42, bevel=0.03, wear=0.006, draw=draw, part='stone'),
            kit.box(-0.4, 0.27, 0.08, 0.4, 0.3, 0.34, part='relief'),
            kit.polygon([(x, 0.002, z) for x, z in _arched_outline(0.46, 0.42, 1.78, 10)][::-1], part='bone')]
    for side in (-1, 1):
        low, high = sorted((side * 0.46, side * 0.62))
        made.append(kit.bevelled_box(low, 0.0, 0.42, high, 0.3, 1.78, bevel=0.025, part='trim'))
    extra = [draw.uniform(0.0, 0.03) for _ in range(5)]
    extra[2] = 0.06
    stones = forms.voussoirs(0.46, 1.78, 0.16, 0.0, 0.3, count=5, chamfer=0.02, steps=2, extra=extra)
    made += [forms.made(kit, faces, 'stoneAlt' if number % 2 else 'trim') for number, faces in enumerate(stones)]
    for shelf, columns in ((0.42, (-1, 0, 1)), (0.86, (-1, 0, 1)), (1.3, (-1, 0, 1))):
        made.append(kit.box(-0.46, 0.0, shelf - 0.04, 0.46, 0.25, shelf, part='trim'))
        for column in columns:
            spot = (column * 0.29 + draw.uniform(-0.02, 0.02), 0.13 + draw.uniform(0.0, 0.02), shelf)
            made.append(forms.made(kit, forms.placed(forms.skull(1, half=True), spot, turn=draw.uniform(-15, 15),
                                                     size=draw.uniform(0.95, 1.05)), 'bone', closed=False))
    return cull(kit.join(made, 'feature.b'), floor=0.0, wall=0.0)


def _boss_disc(kit, radius=0.34, sides=12):
    """The disc a boss is cut on, a bead round its rounded edge, set into the vault."""
    return kit.lathe([(radius, 0.0), (radius + 0.015, -0.025), (radius - 0.02, -0.04), (radius - 0.05, -0.06),
                      (0.0, -0.06)], sides=sides, part='stone')


def _petals(height, reach, count, lobes, amp, twist=0.0):
    """A ring of `lobes` petals curling down from `height`, as a loft of lobed sections."""
    rows = [(height + 0.01, reach, amp), (height - 0.045, reach * 0.95, amp * 1.2), (height - 0.09, reach * 0.65,
                                                                                      amp), (height - 0.115, 0.0, 0.0)]
    return forms.loft([forms.section(level, radius, radius, count=count, push=lambda angle, amp=amp: amp * (
        math.cos(math.radians(angle - twist) * lobes) - 0.4)) for level, radius, amp in rows])


def ceiling_a(kit):
    """A rosette boss: eight broad petals curling down round a ring of small ones and a turned button."""
    made = [_boss_disc(kit),
            forms.made(kit, _petals(-0.05, 0.31, 32, 8, 0.055), 'relief', smooth=60.0),
            forms.made(kit, _petals(-0.1, 0.17, 16, 8, 0.03, 22.5), 'relief', smooth=60.0),
            kit.lathe([(0.0, -0.19), (0.05, -0.19), (0.07, -0.235), (0.045, -0.28), (0.0, -0.29)], sides=8,
                      part='trim')]
    return kit.under_dome(cull(kit.join(made, 'ceiling.a'), ceiling=0.0))


def ceiling_b(kit):
    """A skull boss: a great carved skull staring down, two bones crossed behind it."""
    made = [_boss_disc(kit, 0.36, 14)]
    for side in (-1, 1):
        made.append(forms.made(kit, forms.long_bone((side * 0.31, -0.29, -0.08), (-side * 0.31, 0.29, -0.08), 0.026,
                                                    5), 'relief'))
    made.append(forms.made(kit, forms.placed(forms.skull(1), (0.0, -0.21, -0.27), tilt=90, size=2.2), 'relief'))
    return kit.under_dome(cull(kit.join(made, 'ceiling.b'), ceiling=0.0))


def ceiling_c(kit):
    """A knot boss: three rings interlaced round a turned button."""
    made = [_boss_disc(kit, 0.34, 12)]
    for number in range(3):
        turn = math.radians(90 + 120 * number)
        middle = (0.1 * math.cos(turn), 0.1 * math.sin(turn), -0.1)
        ring = kit.ring(middle, 0.13, 0.026, sides=12, tube_sides=4, part='relief')
        kit.rotate(ring, 16, 'x', middle)
        kit.rotate_z(ring, math.degrees(turn), middle[:2])
        made.append(ring)
    made.append(kit.lathe([(0.0, -0.06), (0.075, -0.06), (0.08, -0.12), (0.045, -0.165), (0.0, -0.175)], sides=8,
                          part='trim'))
    return kit.under_dome(cull(kit.join(made, 'ceiling.c'), ceiling=0.0))


def floor_a(kit):
    """A tomb slab: a raised border, a carved field and on it a cross on its steps, a rosette at each corner."""
    made = [kit.box(-0.56, -1.06, 0.0, 0.56, 1.06, 0.022, part='relief')]
    for x0, y0, x1, y1 in ((-0.56, -1.06, 0.56, -0.97), (-0.56, 0.97, 0.56, 1.06), (-0.56, -0.97, -0.47, 0.97),
                           (0.47, -0.97, 0.56, 0.97)):
        made.append(kit.box(x0, y0, 0.0, x1, y1, 0.036, part='trim'))
    cross = [(-0.035, 0.74), (0.035, 0.74), (0.035, -0.4), (0.24, -0.4), (0.24, -0.47), (0.035, -0.47),
             (0.035, -0.72), (-0.035, -0.72), (-0.035, -0.47), (-0.24, -0.47), (-0.24, -0.4), (-0.035, -0.4)]
    made.append(kit.extrude_outline(cross, 0.0, 0.042, part='trim'))
    for step, half in enumerate((0.18, 0.12)):
        made.append(kit.box(-half, 0.74 + step * 0.06, 0.0, half, 0.8 + step * 0.06, 0.036 + 0.006 * step,
                            part='trim'))
    for x, y, radius in ((0.38, 0.86, 0.05), (-0.38, 0.86, 0.05), (0.38, -0.86, 0.05), (-0.38, -0.86, 0.05),
                         (0.0, -0.435, 0.07)):
        made.append(kit.cone((x, y, 0.0), (x, y, 0.045), radius, radius * 0.3, sides=6, part='trim'))
    return cull(kit.join(made, 'floor.a'), floor=0.0)


def floor_b(kit):
    """A tomb slab broken in three, one piece sunk, a corner gone to chips, with a brass name plate and an iron
    lifting ring."""
    draw = random.Random('crypt.floor.b')
    cracks = [[(-0.56, -0.22), (-0.3, -0.16), (-0.05, -0.27), (0.2, -0.12), (0.56, -0.2)],
              [(-0.56, 0.42), (-0.2, 0.5), (0.1, 0.36), (0.32, 0.47), (0.56, 0.41)]]
    edges = [[(-0.56, -1.0), (0.56, -1.0)]] + cracks + [[(-0.56, 1.0), (0.38, 1.0), (0.56, 0.84)]]
    made = []
    for number in range(3):
        below = [(x, y + 0.008) for x, y in edges[number]] if number else edges[number]
        above = [(x, y - 0.008) for x, y in edges[number + 1]]
        piece = kit.extrude_outline(below + above[::-1], 0.0, 0.026, part='trim')
        if number == 1:
            kit.rotate(piece, 1.2, 'x', (0.0, 0.1, 0.0))
            kit.translate(piece, 0.0, 0.0, -0.006)
        made.append(piece)
    made.append(kit.box(-0.22, -0.72, 0.022, 0.22, -0.54, 0.033, part='brass'))
    for line in range(2):
        made.append(kit.box(-0.15 + line * 0.03, -0.67 + line * 0.06, 0.033, 0.15 - line * 0.06,
                            -0.65 + line * 0.06, 0.036, part='brass'))
    for x in (-0.19, 0.19):
        for y in (-0.7, -0.56):
            made.append(kit.cone((x, y, 0.033), (x, y, 0.04), 0.012, 0.0, sides=4, part='brass'))
    made.append(kit.ring((0.0, 0.76, 0.024), 0.05, 0.009, sides=8, tube_sides=3, part='iron'))
    for chip in range(3):
        size = draw.uniform(0.04, 0.07)
        made.append(kit.rock(draw.uniform(0.36, 0.56), draw.uniform(0.9, 1.06), 0.0, (size, size * 0.8, 0.022),
                             seed=f'crypt.floor.b.{chip}', detail=0, roughness=0.3, part='trim'))
    return cull(kit.join(made, 'floor.b'), floor=0.0)


# The sconce's plate, (x, z) metres: a skull's outline, crown, cheekbones and jaw, its torch arm from the mouth.
_PLATE = [(0.0, 0.13), (0.075, 0.112), (0.115, 0.065), (0.128, -0.01), (0.118, -0.07), (0.078, -0.1),
          (0.082, -0.17), (0.06, -0.225), (0.0, -0.24), (-0.06, -0.225), (-0.082, -0.17), (-0.078, -0.1),
          (-0.118, -0.07), (-0.128, -0.01), (-0.115, 0.065), (-0.075, 0.112)]


def sconce(kit):
    """A torch ring on an iron arm, out of the mouth of a skull carved as the sconce's plate, iron set in its eyes."""
    made = [kit.extrude_outline([(x, z - 0.2) for x, z in _PLATE], 0.0, 0.045, 'xz', part='relief')]
    for side in (-1, 1):
        made.append(kit.cone((side * 0.048, 0.04, -0.232), (side * 0.048, 0.058, -0.232), 0.036, 0.0, sides=4,
                             part='iron'))
    for start, end in (((0.0, 0.03, -0.36), (0.0, 0.2, -0.3)), ((0.0, 0.2, -0.3), (0.0, 0.3, -0.115))):
        made.append(kit.prism(start, end, 0.014, 4, 45.0, part='iron'))
    made.append(kit.ring((0.0, 0.35, -0.1), 0.054, 0.01, sides=8, tube_sides=3, part='iron'))
    made.append(kit.cone((0.0, 0.35, -0.2), (0.0, 0.35, -0.1), 0.0, 0.046, sides=6, part='iron'))
    return cull(kit.join(made, 'sconce'), wall=0.0)
