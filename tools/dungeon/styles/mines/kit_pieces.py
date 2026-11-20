"""The mines' timber sets and doorways: a set on every wall (a post on its sill, a stretched shaft, a bolster on knee
braces blocked and wedged to the roof), the cap beam laid across on those bolsters with lagging over it, the pillars,
and the two doorways.

A dungeon lays some sixty sets, so a wall's three pieces keep to 250 triangles and a beam to 400: faces that lie
against rock, in a joint or in the next cell's piece are left out.
"""
import math

import details
from shapes import add, mul

from .forms import arc_sweep, board, lantern, nail, rod, timber, wedge

# The wall's post, metres in the wall's frame: x along the wall, y out of it. It stands off the rock on wedges.
POST_HALF = 0.13
POST_Y = (0.04, 0.29)
POST_MID = sum(POST_Y) / 2
# The wall's base and cap: the shaft is stretched between the base's top and the cap's foot, the cap laid with its
# top at the ceiling, where the bolster's top meets the cap beam's underside.
BASE_TOP = 0.5
CAP_TOP = 1.0
BEAM_UNDER = 0.30
# The least height a set stands to, metres: the mines' corridors and lowest rooms.
LOW_M = 3.2
# The cap beam under the lagging, metres below the ceiling, and half its width along the way.
BEAM_Z = (-0.30, -0.05)
BEAM_HALF = 0.13
PILLAR_HALF = 0.15
PILLAR_BASE_TOP = 0.6
PILLAR_CAP_TOP = 0.7
OPEN = (False, False)


def make(kit, faces, part='wood', name='mines', smooth=None, closed=True):
    return kit.mesh(faces, part, name, smooth, closed)


def post_uv(base_top, cap_top, piece):
    """UVs for a post cut in three, its grain up it: u its height in a set LOW_M high, v round it. The page adds a
    stretched shaft's rise to v, so the shaft's v takes away the rise of LOW_M's stretch, and its grain runs straight
    up there and leans a little in taller rooms."""
    span = LOW_M - cap_top - base_top
    if piece == 'shaft':
        return lambda point, mapped: (base_top + span * point[2], mapped[1] - base_top - (span - 1.0) * point[2])
    lift = LOW_M - cap_top if piece == 'cap' else 0.0
    return lambda point, mapped: (lift + point[2], mapped[1])


def wall_post(kit, z0, z1, piece):
    """The wall's post from z0 to z1 of the base, shaft or cap: each cuts it from one section, so it runs unbroken from
    the sill to the bolster; its ends lie in the next piece and are left open."""
    return make(kit, timber((0.0, POST_MID, z0), (0.0, POST_MID, z1), POST_HALF * 2, POST_Y[1] - POST_Y[0],
                            up=(0.0, 1.0, 0.0), chamfer=0.028, facets=0.01, check='top', caps=OPEN,
                            uv=post_uv(BASE_TOP, CAP_TOP, piece), seed='mines.wall.post'))


def pillar_post(kit, z0, z1, piece):
    return make(kit, timber((0.0, 0.0, z0), (0.0, 0.0, z1), PILLAR_HALF * 2, PILLAR_HALF * 2, up=(0.0, 1.0, 0.0),
                            chamfer=0.03, facets=0.012, check='top', caps=OPEN,
                            uv=post_uv(PILLAR_BASE_TOP, PILLAR_CAP_TOP, piece), seed='mines.pillar.post'))


def back_wedge(kit, side, height, name):
    """A wedge driven between the post and the rock from one side, its butt showing."""
    return make(kit, wedge((side * 0.24, 0.0, height), (-side, 0.0, 0.0), (0.0, 1.0, 0.0), (0.26, 0.07, POST_Y[0])),
                name=name)


def wall_base(kit):
    sill = make(kit, timber((-0.28, POST_MID, 0.045), (0.28, POST_MID, 0.045), 0.25, 0.09, chamfer=0.015,
                            ragged=(0.035, 0.035), seed='mines.wall.sill'))
    return kit.join([sill, wall_post(kit, 0.09, BASE_TOP, 'base'), back_wedge(kit, 1, 0.2, 'wall.base.wedge')],
                    'wall.base')


def wall_shaft(kit):
    return kit.join([wall_post(kit, 0.0, 1.0, 'shaft')], 'wall.shaft')


def folding_wedges(kit, x0, x1, y, z, thick, width, seed):
    """Two wedges driven against each other between x0 and x1 from z, their top at z + 2 × thick."""
    run, toward = abs(x1 - x0), 1.0 if x1 > x0 else -1.0
    return [make(kit, wedge((x0, y, z), (toward, 0, 0), (0, 0, 1), (run, width, thick)), name=f'{seed}.a'),
            make(kit, wedge((x1, y, z + 2 * thick), (-toward, 0, 0), (0, 0, -1), (run, width, thick)),
                 name=f'{seed}.b')]


def wall_cap(kit):
    under = CAP_TOP - BEAM_UNDER
    found = [wall_post(kit, 0.0, under - 0.08, 'cap'),
             make(kit, timber((-0.46, POST_MID, under - 0.08), (0.46, POST_MID, under - 0.08), 0.25, 0.16,
                              chamfer=0.02, ragged=(0.04, 0.04), seed='mines.wall.bolster'))]
    for side in (-1, 1):
        found.append(make(kit, timber((side * 0.08, POST_MID, 0.12), (side * 0.42, POST_MID, under - 0.13), 0.1,
                                      0.17, up=(0.0, 1.0, 0.0), chamfer=0.0, caps=OPEN,
                                      seed=f'mines.wall.brace{side}')))
        found.append(make(kit, timber((side * 0.16, POST_MID, under + 0.08), (side * 0.43, POST_MID, under + 0.08),
                                      0.22, 0.16, chamfer=0.0, ragged=(0.03, 0.03), seed=f'mines.wall.block{side}')))
        # One wedge a side drives the block tight to the roof: its butt is the cap's top.
        found.append(make(kit, wedge((side * 0.43, POST_MID, under + 0.16), (-side, 0, 0), (0, 0, 1),
                                     (0.25, 0.15, CAP_TOP - under - 0.16)), name=f'wall.cap.wedge{side}'))
    found.append(back_wedge(kit, -1, under - 0.24, 'wall.cap.wedge'))
    return kit.join(found, 'wall.cap')


def lagging_layout(half=1.26):
    """Where the lagging's boards lie across the beam, (middle x, width) each: the same over every beam, so the
    boards run on from cell to cell."""
    draw = details.seeded('mines.lagging')
    found, at = [], -half
    while at < half - 0.1:
        width = min(draw.uniform(0.17, 0.25), half - at)
        found.append((at + width / 2, width))
        at += width + draw.uniform(0.04, 0.12)
    return found


def lagging(kit, skip=()):
    """The boards over the cap beam, along the way from cell to cell, but those numbered in `skip`."""
    return [make(kit, board((middle, -1.6, BEAM_Z[1] + 0.0175), (middle, 1.6, BEAM_Z[1] + 0.0175), width, 0.035,
                            caps=OPEN, seed=f'mines.lagging{number}'))
            for number, (middle, width) in enumerate(lagging_layout()) if number not in skip]


def cap_beam(kit, seed):
    """The cap beam across the way, its ends in the rock or against the next cell's beam."""
    return make(kit, timber((-1.6, 0.0, sum(BEAM_Z) / 2), (1.6, 0.0, sum(BEAM_Z) / 2), BEAM_HALF * 2,
                            BEAM_Z[1] - BEAM_Z[0], chamfer=0.03, facets=0.012, check='bottom', stations=3,
                            wobble=0.01, caps=OPEN, seed=seed))


def band(kit, x, width=0.07):
    """An iron band round the cap beam at x, nailed underneath."""
    middle = sum(BEAM_Z) / 2
    hoop = make(kit, timber((x - width / 2, 0, middle), (x + width / 2, 0, middle), BEAM_HALF * 2 + 0.018,
                            BEAM_Z[1] - BEAM_Z[0] + 0.012, chamfer=0.032), 'iron')
    return [hoop, make(kit, nail((x, 0.0, BEAM_Z[0] - 0.006), (0, 0, -1), 0.022, 0.01), 'iron')]


def ceiling_a(kit):
    return kit.join([cap_beam(kit, 'mines.ceiling.a'), lagging(kit), band(kit, 0.62), band(kit, 0.98)],
                    'ceiling.a')


def ceiling_b(kit):
    x, under = 0.42, BEAM_Z[0]
    shank = make(kit, rod((x, 0, under + 0.03), (x, 0, under - 0.07), 0.011, sides=4), 'iron')
    curl = [(x + 0.04 * math.sin(turn), 0, under - 0.07 - 0.04 * (1 - math.cos(turn)))
            for turn in (math.radians(step * 45) for step in range(-1, 6))]
    hook = make(kit, arc_sweep(curl, [0.009] * len(curl), sides=3), 'iron')
    # An unlit lantern on the hook: the mines' lights are the landmarks' and the code's torches.
    lamp = kit.join([make(kit, faces, part, smooth=30.0) for part, faces in lantern(False, 0.27, 6).items()])
    kit.translate(lamp, x, 0, under - 0.15 - 0.265)
    return kit.join([cap_beam(kit, 'mines.ceiling.b'), lagging(kit), hook, shank, lamp], 'ceiling.b')


def ceiling_c(kit):
    # One board of the run split over the beam: its far half hangs, splintered, into the way.
    layout = lagging_layout()
    split = len(layout) - 3
    x, width = layout[split]
    pieces = [make(kit, board((x, -1.6, BEAM_Z[1] + 0.0175), (x, 0.12, BEAM_Z[1] + 0.0175), width, 0.035,
                              snapped=(0.0, 0.12), caps=OPEN, seed='mines.ceiling.c.split')),
              make(kit, board((x + 0.02, 0.2, BEAM_Z[1] - 0.01), (x + 0.07, 1.42, -0.62), width - 0.01, 0.035,
                              snapped=(0.1, 0.0), seed='mines.ceiling.c.hang'))]
    lash = []
    for step in range(13):
        turn = step / 12 * math.tau * 1.25
        lash.append((-0.62 + step * 0.005, -0.145 * math.cos(turn), sum(BEAM_Z) / 2 - 0.14 * math.sin(turn)))
    tail = [(-0.55, 0.12, -0.34), (-0.53, 0.14, -0.5), (-0.56, 0.12, -0.66), (-0.6, 0.09, -0.77)]
    rope = kit.rope(lash + tail, radius=0.017, sides=4, step=0.1)
    return kit.join([cap_beam(kit, 'mines.ceiling.c'), lagging(kit, skip=(split,)), pieces, rope], 'ceiling.c')


def pillar_base(kit):
    pad = kit.rock(0.0, 0.0, 0.0, (0.92, 0.88, 0.17), seed='mines.pillar.pad', detail=1, roughness=0.12,
                   shape='cube', base=0.4, part='stoneAlt', smooth=30.0)
    found = [pad, pillar_post(kit, 0.12, PILLAR_BASE_TOP, 'base')]
    for number, (x, y, toward) in enumerate([(0.3, -0.05, (-1, 0, 0)), (-0.05, -0.3, (0, 1, 0)),
                                             (-0.3, 0.07, (1, 0, 0)), (0.06, 0.3, (0, -1, 0))]):
        found.append(make(kit, wedge((x, y, 0.14), toward, (0, 0, 1), (0.22, 0.08, 0.045)),
                          name=f'pillar.base.wedge{number}'))
    return kit.join(found, 'pillar.base')


def pillar_shaft(kit):
    return kit.join([pillar_post(kit, 0.0, 1.0, 'shaft')], 'pillar.shaft')


def pillar_capital(kit):
    found = [pillar_post(kit, 0.0, 0.44, 'cap'),
             make(kit, timber((-0.64, 0, 0.5), (0.64, 0, 0.5), 0.28, 0.16, chamfer=0.02, facets=0.01,
                              ragged=(0.04, 0.04), seed='mines.pillar.bolster')),
             make(kit, timber((0, -0.62, 0.64), (0, 0.62, 0.64), 0.26, 0.12, chamfer=0.02, facets=0.008,
                              ragged=(0.035, 0.035), seed='mines.pillar.cross'))]
    for side in (-1, 1):
        found.append(make(kit, timber((side * 0.08, 0, 0.06), (side * 0.47, 0, 0.47), 0.1, 0.19, up=(0, 1, 0),
                                      chamfer=0.015, caps=OPEN, seed=f'mines.pillar.brace.x{side}')))
        found.append(make(kit, timber((0, side * 0.08, 0.1), (0, side * 0.46, 0.62), 0.1, 0.19, up=(1, 0, 0),
                                      chamfer=0.015, caps=OPEN, seed=f'mines.pillar.brace.y{side}')))
        found += folding_wedges(kit, side * 0.62, side * 0.2, 0.0, 0.58, 0.06, 0.13, f'mines.pillar.wedge{side}')
    found.append(make(kit, timber((0, 0, 0.3), (0, 0, 0.37), PILLAR_HALF * 2 + 0.016, PILLAR_HALF * 2 + 0.016,
                                  chamfer=0.035), 'iron'))
    found += [make(kit, nail(add((0, 0, 0.335), mul(way, PILLAR_HALF + 0.008)), way), 'iron')
              for way in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0))]
    return kit.join(found, 'pillar.capital')


def iron_l(kit, x_post, y_face, outward, z_low, z_joint, x_end):
    """An L-shaped iron strap over a post's joint with its cap, on the face at y_face, nailed."""
    found = [make(kit, timber((x_post, y_face, z_low), (x_post, y_face, z_joint + 0.05), 0.05, 0.008,
                              up=(0, outward, 0), chamfer=0.0), 'iron'),
             make(kit, timber((x_post - math.copysign(0.025, x_end - x_post), y_face, z_joint + 0.025),
                              (x_end, y_face, z_joint + 0.025), 0.05, 0.008, up=(0, outward, 0), chamfer=0.0),
                  'iron')]
    spots = [(x_post, z_low + 0.06), (x_post, (z_low + z_joint) / 2), (x_end - math.copysign(0.03, x_end - x_post),
                                                                         z_joint + 0.025)]
    found += [make(kit, nail((x, y_face + outward * 0.004, z), (0, outward, 0), 0.016, 0.006), 'iron')
              for x, z in spots]
    return found


def door_a(kit):
    found = [make(kit, timber((-1.25, 0.15, 2.68), (1.25, 0.15, 2.68), 0.46, 0.24, chamfer=0.03, facets=0.012,
                              check='bottom', stations=4, wobble=0.01, ragged=(0.05, 0.05), seed='mines.door.a.cap'))]
    for side in (-1, 1):
        found.append(make(kit, timber((side * 0.94, 0.15, 0.0), (side * 0.94, 0.15, 2.62), 0.28, 0.46,
                                      up=(0, 1, 0), chamfer=0.03, facets=0.012, check='top', caps=OPEN,
                                      seed=f'mines.door.a.post{side}')))
        found.append(make(kit, timber((side * 0.9, 0.15, 2.33), (side * 0.52, 0.15, 2.66), 0.1, 0.3,
                                      up=(0, 1, 0), chamfer=0.015, caps=OPEN, seed=f'mines.door.a.brace{side}')))
        for y_face, outward in ((-0.08, -1), (0.38, 1)):
            found += iron_l(kit, side * 0.88, y_face + outward * 0.004, outward, 2.2, 2.56, side * 1.18)
        found.append(make(kit, wedge((side * 1.26, -0.04, 0.0), (-side, 0, 0), (0, 0, 1), (0.2, 0.07, 0.04)),
                          name='door.a.wedge'))
    return kit.join(found, 'door.a')


def rubble_lining(kit, x0, x1, z0, z1, seed, y0=-0.09, y1=0.0, proud=0.03):
    """Rough stones laid dry in courses from x0 to x1 and y0 to y1, each block knocked out of square and some
    standing proud of the rest toward -y."""
    draw = details.seeded(seed)
    found, level = [], z0
    while level < z1 - 0.05:
        height = draw.uniform(0.2, 0.36)
        height = z1 - level if z1 - level - height < 0.15 else height
        along = x0
        while along < x1 - 0.05:
            run = draw.uniform(0.24, 0.5)
            run = x1 - along if x1 - along - run < 0.15 else run
            out = draw.uniform(0.0, proud)
            found.append(kit.rock(along + run / 2, (y0 - out + y1) / 2, level + 0.008, (run - 0.022, y1 - y0 + out,
                                                                                      height - 0.018),
                                  seed=f'{seed}{len(found)}', detail=0, roughness=0.24, shape='cube', base=0.0,
                                  part='stoneAlt', smooth=None))
            along += run
        level += height
    return found


def door_b(kit):
    found = [rubble_lining(kit, 0.8, 1.58, 0.0, 2.46, 'mines.door.b.right'),
             rubble_lining(kit, -1.58, -0.8, 0.0, 2.46, 'mines.door.b.left'),
             rubble_lining(kit, -1.5, 1.5, 2.8, 3.14, 'mines.door.b.head'),
             make(kit, timber((-1.42, 0.15, 2.63), (1.42, 0.15, 2.63), 0.5, 0.34, chamfer=0.04, facets=0.016,
                              check='bottom', stations=4, wobble=0.012, ragged=(0.06, 0.06), seed='mines.door.b.head'))]
    for side in (-1, 1):
        # The lining turns into the reveal, a stone deep, to the jamb's far face.
        reveal = rubble_lining(kit, 0.0, 0.3, 0.0, 2.44, f'mines.door.b.reveal{side}', y0=-0.9, y1=-0.8, proud=0.0)
        for stone in reveal:
            kit.rotate_z(stone, 90)
            if side < 0:
                kit.scale(stone, -1, 1, 1)
        found += reveal
        found += [make(kit, nail((side * x, -0.1, 2.63), (0, -1, 0), 0.04, 0.015), 'iron') for x in (0.55, 1.2)]
    return kit.join(found, 'door.b')
