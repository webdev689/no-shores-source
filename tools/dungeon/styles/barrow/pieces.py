"""The barrow's kit pieces but its openings: its pillars are uprights on a kerb under corbel courses; its wall sets
orthostats on a sill under a lintel that corbels out toward the roof; its features a niche of grave goods and a
slab of cup-and-ring marks; its ceilings a capstone's underside, the last corbel rings round it, and roots come down
through a joint; its floors a cup-marked paving slab and a cracked cist cover; its sconce a stone bracket.
"""
import math
import random

from shapes import sweep
from styles.barrow.forms import drystone, marks, quartz, slab, upright
from styles.crypt.hidden import cull


def _rough_shaft(kit, half_x, half_y, seed, part='stone', points=10):
    """A unit-high upright with no top or foot, its section an uneven rounded slab: the page stretches it."""
    draw = random.Random(seed)
    reach = [draw.uniform(0.9, 1.0) for _ in range(points)]
    rings = []
    # Its belly swells and its faces wander a little from foot to head, as a slab split from the rock does.
    for z, swell in ((0.0, 0.94), (0.35, 1.0), (0.7, 0.98), (1.0, 0.92)):
        ring = []
        for number in range(points):
            turn = math.tau * number / points
            cosine, sine = math.cos(turn), math.sin(turn)
            square = 1.0 / max(abs(cosine) ** 4 + abs(sine) ** 4, 1e-9) ** 0.25
            wander = swell * reach[(number + round(z * 3)) % points]
            ring.append((half_x * cosine * square * wander, half_y * sine * square * wander, z))
        rings.append(ring)
    faces = sweep(rings, closed=True, outward=lambda corners, i: (sum(point[0] for point in corners),
                                                                   sum(point[1] for point in corners), 0.0))
    return kit.mesh(faces, part, 'shaft', 40.0, False)


def pillar_base(kit):
    """An upright's foot in a kerb: a slab under it, packing stones wedged round it."""
    made = [slab(kit, -0.5, -0.5, 0.0, 0.5, 0.5, 0.14, 'barrow.pillar.base slab', part='stoneAlt'),
            upright(kit, 0.6, 0.5, 0.4, 'barrow.pillar.base', at=(0.0, 0.0, 0.14), sections=3)]
    draw = random.Random('barrow.pillar.base')
    for number, (x, y) in enumerate(((-0.38, -0.3), (0.36, -0.34), (0.4, 0.32), (-0.35, 0.37), (0.0, -0.42))):
        made.append(kit.rock(x, y, 0.1, (0.18, 0.14, draw.uniform(0.08, 0.14)), seed=f'barrow.pillar.base {number}',
                             detail=0, roughness=0.25, part='stone'))
    return cull(kit.join(made, 'pillar.base'), floor=0.0)


def pillar_shaft(kit):
    """The upright itself: an uneven slab of the grey-green stone, a unit high for the page to stretch."""
    return cull(_rough_shaft(kit, 0.31, 0.27, 'barrow.pillar.shaft'), floor=0.0, ceiling=1.0)


def pillar_capital(kit):
    """Corbel courses over the upright, each slab stepping out over the one below, the last a capstone the roof
    rests on."""
    made = []
    for number, (half, low, high) in enumerate(((0.36, 0.0, 0.16), (0.46, 0.16, 0.32), (0.56, 0.32, 0.5),
                                                (0.68, 0.5, 0.7))):
        made.append(slab(kit, -half, -half * 0.9, low + 0.004, half, half * 0.9, high,
                         f'barrow.pillar.capital {number}', part='stoneAlt' if number % 2 else 'stone'))
    return cull(kit.join(made, 'pillar.capital'), floor=0.0, ceiling=0.7)


def wall_base(kit):
    """An orthostat's foot on its sill, dry-stone packed either side of it."""
    made = [slab(kit, -0.72, 0.0, 0.0, 0.72, 0.29, 0.16, 'barrow.wall.base sill', part='stoneAlt'),
            upright(kit, 1.0, 0.24, 0.7, 'barrow.wall.base', at=(0.0, 0.12, 0.16), sections=3, points=8)]
    return cull(kit.join(made, 'wall.base'), floor=0.0, wall=0.0)


def wall_shaft(kit):
    """The orthostat lining the wall, a unit high."""
    return cull(_rough_shaft(kit, 0.5, 0.12, 'barrow.wall.shaft', points=8), floor=0.0, ceiling=1.0)


def wall_cap(kit):
    """The orthostat's head under a lintel laid along the wall, cup-marked on its face, and corbel courses stepping
    out over it toward the roof."""
    made = [upright(kit, 1.0, 0.24, 0.36, 'barrow.wall.cap', at=(0.0, 0.12, 0.0), sections=2, points=8),
            slab(kit, -0.92, 0.0, 0.36, 0.92, 0.3, 0.62, 'barrow.wall.cap lintel')]
    for number, (reach, low, high) in enumerate(((0.4, 0.62, 0.8), (0.5, 0.8, 0.98), (0.6, 0.98, 1.2))):
        made.append(slab(kit, -0.96 + number * 0.08, 0.0, low + 0.004, 0.96 - number * 0.08, reach, high,
                         f'barrow.wall.cap corbel {number}', part='stoneAlt' if number % 2 else 'stone'))
    made.append(marks(kit, [(-0.5, 0.3, 0.49, 0), (0.0, 0.3, 0.49, 0), (0.48, 0.3, 0.5, 0)], (0.0, 1.0, 0.0),
                      'barrow.wall.cap'))
    return cull(kit.join(made, 'wall.cap'), floor=0.0, wall=0.0, ceiling=1.2)


def feature_a(kit):
    """A niche of grave goods: two small uprights and a lintel round a dry-stone back, its floor slab holding a pot,
    a beaker, a bronze dagger and a string of jet beads, as they were laid with the dead."""
    made = [slab(kit, -0.76, 0.0, 0.0, 0.76, 0.3, 0.24, 'barrow.feature.a sill', part='stoneAlt')]
    for side in (-1, 1):
        made.append(upright(kit, 0.24, 0.28, 1.18, f'barrow.feature.a {side}', at=(side * 0.62, 0.15, 0.24),
                            sections=4, points=8))
    made.append(slab(kit, -0.8, 0.0, 1.42, 0.8, 0.3, 1.72, 'barrow.feature.a lintel'))
    made.append(drystone(kit, -0.5, 0.5, 0.24, 1.42, 0.0, 0.07, 'barrow.feature.a back'))
    made.append(kit.lathe([(0.0, 0.24), (0.07, 0.24), (0.12, 0.33), (0.13, 0.42), (0.1, 0.5), (0.11, 0.53),
                           (0.0, 0.52)], -0.24, 0.17, 0.0, sides=10, part='relief'))
    made.append(kit.lathe([(0.0, 0.24), (0.04, 0.24), (0.06, 0.31), (0.045, 0.36), (0.06, 0.41), (0.0, 0.4)],
                          0.08, 0.15, 0.0, sides=8, part='floor'))
    made.append(kit.extrude_outline([(0.2, 0.0), (0.42, 0.012), (0.45, 0.0), (0.42, -0.012)], 0.24, 0.252,
                                    part='brass'))
    kit.translate(made[-1], 0.0, 0.18, 0.0)
    made.append(kit.box(0.14, 0.165, 0.24, 0.2, 0.195, 0.262, part='wood'))
    for number in range(9):
        turn = math.tau * number / 9
        made.append(kit.cone((0.3 + 0.05 * math.cos(turn), 0.09 + 0.035 * math.sin(turn), 0.24),
                             (0.3 + 0.05 * math.cos(turn), 0.09 + 0.035 * math.sin(turn), 0.262), 0.011, 0.005,
                             sides=4, part='iron'))
    return cull(kit.join(made, 'feature.a'), floor=0.0, wall=0.0)


def feature_b(kit):
    """A slab of cup-and-ring marks set up against the wall, three great marks ringed round and cups scattered
    among them, and before it an offering stone cupped on its top, white quartz round its foot."""
    made = [upright(kit, 1.36, 0.2, 2.2, 'barrow.feature.b', at=(0.0, 0.11, 0.0), sections=5, points=10)]
    made.append(marks(kit, [(-0.32, 0.21, 1.55, 3), (0.3, 0.21, 1.1, 2), (-0.2, 0.21, 0.62, 2), (0.36, 0.21, 1.72, 0),
                            (0.05, 0.21, 1.9, 0), (-0.5, 0.21, 1.1, 0), (0.48, 0.21, 0.55, 1), (0.0, 0.21, 0.3, 0)],
                      (0.0, 1.0, 0.0), 'barrow.feature.b'))
    made.append(kit.rock(0.0, 0.25, 0.0, (0.5, 0.1, 0.32), seed='barrow.feature.b offering', detail=1,
                         roughness=0.15, part='stoneAlt'))
    made.append(marks(kit, [(-0.1, 0.25, 0.32, 0), (0.12, 0.25, 0.32, 0)], (0.0, 0.0, 1.0), 'barrow.feature.b top'))
    made += quartz(kit, (-0.7, 0.2, 0.7, 0.29), 7, 'barrow.feature.b')
    return cull(kit.join(made, 'feature.b'), floor=0.0, wall=0.0)


def ceiling_a(kit):
    """The capstone's underside at a corbelled roof's top: an uneven slab, cup marks pecked on the face that looks
    down."""
    made = [kit.lathe([(0.0, -0.16), (0.62, -0.16), (0.74, -0.08), (0.74, 0.0), (0.0, 0.0)], sides=9,
                      part='stone')]
    kit.jitter(made[0], 0.012, seed='barrow.ceiling.a')
    kit.translate(made[0], 0.0, 0.0, -0.03)
    made.append(marks(kit, [(0.2, 0.1, -0.19, 1), (-0.25, -0.12, -0.19, 0), (-0.05, 0.3, -0.19, 0)],
                      (0.0, 0.0, -1.0), 'barrow.ceiling.a'))
    return kit.under_dome(cull(kit.join(made, 'ceiling.a'), ceiling=0.0))


def ceiling_b(kit):
    """The last corbel courses closing in under the capstone, each ring of slabs stepping in from the one above it."""
    made = []
    for number, (outer, inner, low, high) in enumerate(((0.78, 0.6, -0.1, 0.0), (0.62, 0.42, -0.21, -0.1),
                                                       (0.44, 0.0, -0.32, -0.21))):
        ring = kit.lathe([(inner, low), (outer, low), (outer, high), (inner, high)] if inner else
                         [(0.0, low), (outer, low), (outer, high), (0.0, high)], sides=8,
                         part='stoneAlt' if number % 2 else 'stone')
        kit.jitter(ring, 0.01, seed=f'barrow.ceiling.b {number}')
        kit.translate(ring, 0.0, 0.0, -0.03)
        made.append(kit.rotate_z(ring, 22.5 * number))
    return kit.under_dome(cull(kit.join(made, 'ceiling.b'), ceiling=0.0))


def ceiling_c(kit):
    """Roots come down through a joint between the capstones and hang in the dark."""
    draw = random.Random('barrow.ceiling.c')
    made = [kit.box(-0.7, -0.04, -0.035, 0.7, 0.04, 0.0, part='stoneAlt')]
    for number in range(4):
        x = -0.5 + number * 0.33 + draw.uniform(-0.04, 0.04)
        path, z, drift = [(x, 0.0, -0.03)], -0.03, (0.0, 0.0)
        while z > -draw.uniform(0.55, 1.05):
            z -= draw.uniform(0.12, 0.22)
            drift = (drift[0] + draw.uniform(-0.06, 0.06), drift[1] + draw.uniform(-0.06, 0.06))
            path.append((x + drift[0], drift[1], z))
        made.append(kit.rope(path, radius=0.018 - 0.002 * (number % 3), sides=4, strands=1, step=0.2, part='wood'))
    return kit.under_dome(cull(kit.join(made, 'ceiling.c'), ceiling=0.0))


def floor_a(kit):
    """A paving slab, cup-marked on its top."""
    made = [slab(kit, -0.72, -1.02, -0.02, 0.72, 1.02, 0.03, 'barrow.floor.a', part='stoneAlt', wear=0.004,
                 bevel=0.015)]
    made.append(marks(kit, [(0.2, -0.5, 0.03, 1), (-0.25, 0.1, 0.03, 0), (0.15, 0.55, 0.03, 0)], (0.0, 0.0, 1.0),
                      'barrow.floor.a'))
    return cull(kit.join(made, 'floor.a'), floor=0.0)


def floor_b(kit):
    """A cist's cover, cracked across, a ring mark on its larger half, quartz lying on it."""
    made = [slab(kit, -0.6, -0.95, -0.02, 0.6, 0.18, 0.035, 'barrow.floor.b a', wear=0.004, bevel=0.012),
            slab(kit, -0.6, 0.22, -0.02, 0.6, 0.95, 0.03, 'barrow.floor.b b', part='stoneAlt', wear=0.004,
                 bevel=0.012)]
    made.append(marks(kit, [(0.0, -0.4, 0.035, 1)], (0.0, 0.0, 1.0), 'barrow.floor.b'))
    made += quartz(kit, (-0.5, 0.3, 0.5, 0.85), 3, 'barrow.floor.b', z=0.03, size=(0.025, 0.035))
    return cull(kit.join(made, 'floor.b'), floor=0.0)


def sconce(kit):
    """A bracket of the grey-green stone set into the wall over two corbels stepping out under it, its end rounded
    and hollowed into a cup that holds the flame."""
    made = [slab(kit, -0.1, 0.0, -0.16, 0.1, 0.3, -0.075, 'barrow.sconce bracket', wear=0.004, bevel=0.015),
            kit.lathe([(0.0, -0.16), (0.075, -0.16), (0.075, -0.075), (0.0, -0.075)], 0.0, 0.335, 0.0, sides=10,
                      part='stone'),
            kit.box(-0.13, 0.0, -0.27, 0.13, 0.2, -0.16, part='stoneAlt'),
            kit.box(-0.15, 0.0, -0.38, 0.15, 0.11, -0.27, part='stone')]
    made.append(marks(kit, [(0.0, 0.35, -0.078, 0)], (0.0, 0.0, 1.0), 'barrow.sconce'))
    return cull(kit.join(made, 'sconce'), wall=0.0)
