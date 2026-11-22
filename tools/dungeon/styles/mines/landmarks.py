"""The mines' three landmarks, built to landmarks.json's solids and glows in the footprint's own frame (origin at its
north-west corner): the Lift Shaft, the Ore Cart and the Collapse. Each lays its own floor over the whole footprint.
"""
import math

import details
from shapes import extrude_outline, revolve, ring

from .forms import arc_sweep, board, lantern, nail, rod, tapered, timber
from .kit_pieces import make


def floor(kit, width, depth, hole=None):
    """The footprint's floor at z 0, round a rectangular `hole` (x0, y0, x1, y1) if given."""
    if hole is None:
        rects = [(0.0, 0.0, width, depth)]
    else:
        x0, y0, x1, y1 = hole
        rects = [(0.0, 0.0, width, y0), (0.0, y1, width, depth), (0.0, y0, x0, y1), (x1, y0, width, y1)]
    return [kit.polygon([(a, b, 0.0), (c, b, 0.0), (c, d, 0.0), (a, d, 0.0)], part='floor', smooth=None)
            for a, b, c, d in rects]


def lit_lantern(kit, height=0.3):
    return kit.join([make(kit, faces, part, smooth=30.0) for part, faces in lantern(lit=True, height=height).items()])


def sheave(kit, centre, radius, spokes=6, tube=0.03):
    """A grooved wheel turning about y at `centre`: two iron flanges, a hub and its spokes."""
    x, y, z = centre
    found = [make(kit, ring((x, y + side * 0.025, z), radius, tube, axis=(0, 1, 0), sides=18, tube_sides=4), 'iron',
                  smooth=40.0) for side in (-1, 1)]
    found.append(make(kit, revolve([(0.0, -0.06), (0.07, -0.06), (0.07, 0.06), (0.0, 0.06)], (x, y, z), (0, 1, 0),
                                   sides=8), 'iron', smooth=None))
    for number in range(spokes):
        turn = math.tau * number / spokes
        tip = (x + (radius - tube) * math.cos(turn), y, z + (radius - tube) * math.sin(turn))
        found.append(make(kit, timber((x, y, z), tip, 0.035, 0.02, up=(0, 1, 0), chamfer=0.0), 'iron'))
    return found


def rope_path(kit, points, radius=0.018, step=0.09):
    return kit.rope(points, radius=radius, sides=5, step=step)


def arc(centre, radius, start, end, steps):
    """Points round a wheel turning about y, from angle `start` to `end` (degrees, 0 east, 90 up)."""
    x, y, z = centre
    return [(x + radius * math.cos(math.radians(a)), y, z + radius * math.sin(math.radians(a)))
            for a in (start + (end - start) * step / steps for step in range(steps + 1))]


def lift_shaft(kit):
    hole = (1.5, 1.5, 4.9, 4.9)
    found = floor(kit, 6.4, 6.4, hole)
    # The collar: four heavy timbers round the shaft's mouth, crossing at the corners.
    for start, end in (((1.22, 1.35), (5.18, 1.35)), ((1.22, 5.05), (5.18, 5.05)), ((1.35, 1.22), (1.35, 5.18)),
                       ((5.05, 1.22), (5.05, 5.18))):
        found.append(make(kit, timber((*start, -0.1), (*end, -0.1), 0.3, 0.28, chamfer=0.03, facets=0.012,
                                      ragged=(0.04, 0.04), seed=f'mines.lift.collar{start}')))
    # The shaft's walls: sets every 0.9 m down, lagged behind with boards on end, and still water below.
    for number, depth in enumerate((-0.55, -1.45, -2.35)):
        for start, end in (((1.5, 1.6), (4.9, 1.6)), ((1.5, 4.8), (4.9, 4.8)), ((1.6, 1.5), (1.6, 4.9)),
                           ((4.8, 1.5), (4.8, 4.9))):
            found.append(make(kit, timber((*start, depth), (*end, depth), 0.2, 0.2, chamfer=0.02,
                                          seed=f'mines.lift.set{number}{start}')))
    draw = details.seeded('mines.lift.walls')
    for wall in range(4):
        at = 1.5
        while at < 4.85:
            width = min(draw.uniform(0.28, 0.4), 4.9 - at)
            middle = at + width / 2
            spot = {0: (middle, 1.515), 1: (middle, 4.885), 2: (1.515, middle), 3: (4.885, middle)}[wall]
            facing_y = wall < 2
            found.append(make(kit, board((*spot, -2.7), (*spot, -0.2 - draw.uniform(0.0, 0.08)), width, 0.03,
                                         up=(0, 1, 0) if facing_y else (1, 0, 0), ragged=(0.0, 0.04),
                                         seed=f'mines.lift.wall{wall}.{at:.2f}')))
            at += width + draw.uniform(0.0, 0.03)
    found.append(kit.polygon([(1.5, 1.5, -2.6), (4.9, 1.5, -2.6), (4.9, 4.9, -2.6), (1.5, 4.9, -2.6)], part='water',
                             smooth=None))
    found += railing(kit) + headframe(kit) + cage(kit) + winch(kit)
    return kit.join(found, 'mines.lift-shaft')


def railing(kit):
    """A post-and-rail fence round the mouth between the headframe's posts, its gate on the south a slung rope."""
    found = []
    for share in (0.35, 0.65):
        along = 1.2 + 4.0 * share
        for number, (x, y) in enumerate(((along, 1.06), (along, 5.34), (1.06, along), (5.34, along))):
            found.append(make(kit, timber((x, y, 0.0), (x, y, 0.93), 0.12, 0.12, up=(0, 1, 0), chamfer=0.015,
                                          ragged=(0.0, 0.02), seed=f'mines.lift.rail.post{share}{number}')))
    spans = [((1.1, 1.06), (5.3, 1.06)), ((1.06, 1.1), (1.06, 5.3)), ((5.34, 1.1), (5.34, 5.3)),
             ((1.1, 5.34), (2.6, 5.34)), ((3.8, 5.34), (5.3, 5.34))]
    for height, size in ((0.86, (0.11, 0.08)), (0.47, (0.09, 0.07))):
        for number, (start, end) in enumerate(spans):
            found.append(make(kit, timber((*start, height), (*end, height), *size, chamfer=0.012, stations=3,
                                          wobble=0.01, ragged=(0.02, 0.02), seed=f'mines.lift.rail{height}{number}')))
    found.append(rope_path(kit, details.sag_path((2.6, 5.34, 0.8), (3.8, 5.34, 0.8), 0.18, 8), 0.016, 0.07))
    found += [make(kit, nail((x, 5.4, 0.8), (0, 1, 0), 0.025, 0.012), 'iron') for x in (2.6, 3.8)]
    return found


def headframe(kit):
    """Four posts on stone pads, head beams crossing on them, bearers carrying the sheave, the lantern between."""
    found = []
    corners = [(0.95, 0.95), (5.45, 0.95), (0.95, 5.45), (5.45, 5.45)]
    for number, (x, y) in enumerate(corners):
        found.append(kit.rock(x, y, 0.0, (0.48, 0.46, 0.16), seed=f'mines.lift.pad{number}', detail=1,
                              roughness=0.12, shape='cube', base=0.4, part='stoneAlt', smooth=30.0))
        found.append(make(kit, timber((x, y, 0.12), (x, y, 2.5), 0.32, 0.32, up=(0, 1, 0), chamfer=0.03,
                                      facets=0.012, check='top', stations=3, wobble=0.008,
                                      seed=f'mines.lift.post{number}')))
        inward = (1 if x < 3 else -1, 1 if y < 3 else -1)
        found.append(make(kit, timber((x + inward[0] * 0.1, y, 2.25), (x + inward[0] * 0.55, y, 2.82), 0.1, 0.2,
                                      up=(0, 1, 0), chamfer=0.015, seed=f'mines.lift.brace{number}x')))
        found.append(make(kit, timber((x, y + inward[1] * 0.1, 2.05), (x, y + inward[1] * 0.5, 2.56), 0.1, 0.2,
                                      up=(1, 0, 0), chamfer=0.015, seed=f'mines.lift.brace{number}y')))
    for x in (0.95, 5.45):
        found.append(make(kit, timber((x, 0.7, 2.63), (x, 5.7, 2.63), 0.3, 0.26, chamfer=0.03, facets=0.012,
                                      check='bottom', stations=4, wobble=0.01, ragged=(0.04, 0.04),
                                      seed=f'mines.lift.head{x}')))
    for y in (0.95, 5.45):
        found.append(make(kit, timber((0.7, y, 2.89), (5.7, y, 2.89), 0.3, 0.26, chamfer=0.03, facets=0.012,
                                      stations=4, wobble=0.008, ragged=(0.04, 0.04), seed=f'mines.lift.top{y}')))
    for y in (2.72, 3.45):
        found.append(make(kit, timber((0.85, y, 2.87), (5.55, y, 2.87), 0.2, 0.22, chamfer=0.02, facets=0.01,
                                      ragged=(0.03, 0.03), seed=f'mines.lift.bearer{y}')))
    for y in (2.82, 3.18):
        found.append(make(kit, timber((5.3, y, 2.85), (6.3, y, 2.85), 0.16, 0.18, chamfer=0.02, ragged=(0.0, 0.03),
                                      seed=f'mines.lift.outrigger{y}')))
    wheel, guide = (3.52, 3.0, 2.47), (5.72, 3.0, 2.65)
    found += sheave(kit, wheel, 0.31)
    found += sheave(kit, guide, 0.15, spokes=4, tube=0.022)
    found.append(make(kit, rod((wheel[0], 2.66, wheel[2]), (wheel[0], 3.5, wheel[2]), 0.025, sides=6), 'iron'))
    found.append(make(kit, rod((guide[0], 2.76, guide[2]), (guide[0], 3.24, guide[2]), 0.02, sides=6), 'iron'))
    for x, y, low in ((wheel[0], 2.72, 2.42), (wheel[0], 3.45, 2.42), (guide[0], 2.82, 2.6), (guide[0], 3.18, 2.6)):
        found.append(make(kit, timber((x, y, 2.78), (x, y, low), 0.07, 0.025, up=(0, 1, 0), chamfer=0.0),
                          'iron'))
    # The rope: down the shaft to the cage, over the sheave and the guide wheel, down onto the winch's drum.
    over = arc(wheel, 0.33, 180, 80, 6) + arc(guide, 0.172, 100, 0, 5)
    found.append(rope_path(kit, [(3.19, 3.0, 0.32)] + over + [(5.84, 3.0, 1.02)]))
    found.append(make(kit, rod((3.2, 2.66, 2.995), (3.2, 3.5, 2.995), 0.014, sides=4), 'iron'))
    found.append(make(kit, arc_sweep([(3.2, 3.2, 2.99), (3.2, 3.2, 2.955), (3.215, 3.2, 2.94)], [0.007] * 3,
                                     sides=4), 'iron'))
    lamp = lit_lantern(kit, 0.27)
    found.append(kit.translate(lamp, 3.2, 3.2, 2.955 - 0.265))
    return found


def cage(kit):
    """The lift's cage: a planked deck on a frame, hung by four ropes from a ring under the hoisting rope."""
    found, low = [], -1.05
    for number, x in enumerate((2.34, 2.72, 3.1, 3.48, 3.86)):
        found.append(make(kit, board((x, 2.2, low + 0.12), (x, 4.0, low + 0.12), 0.36, 0.04, ragged=(0.02, 0.02),
                                     seed=f'mines.lift.deck{number}')))
    for start, end in (((2.12, 2.18), (4.08, 2.18)), ((2.12, 4.02), (4.08, 4.02)), ((2.18, 2.12), (2.18, 4.08)),
                       ((4.02, 2.12), (4.02, 4.08))):
        found.append(make(kit, timber((*start, low + 0.04), (*end, low + 0.04), 0.12, 0.13, chamfer=0.015,
                                      seed=f'mines.lift.frame{start}')))
    hang = (3.19, 3.0, 0.15)
    found.append(make(kit, ring(hang, 0.06, 0.012, axis=(1, 0, 0), sides=10, tube_sides=4), 'iron', smooth=40.0))
    for x, y in ((2.18, 2.18), (4.02, 2.18), (2.18, 4.02), (4.02, 4.02)):
        found.append(rope_path(kit, [(x, y, low + 0.1), hang], 0.013, 0.2))
        found.append(make(kit, ring((x, y, low + 0.12), 0.035, 0.01, axis=(0, 0, 1), sides=8, tube_sides=4), 'iron'))
    found.append(make(kit, rod((3.19, 3.0, 0.2), (3.19, 3.0, 0.34), 0.03, sides=6), 'iron'))
    return found


def winch(kit):
    """The hand winch: two A-framed stands, a hooped drum wound with rope, a crank and a ratchet with its pawl."""
    found, middle = [], (5.95, 0.82)
    for number, y in enumerate((2.5, 3.9)):
        for side in (-1, 1):
            found.append(make(kit, timber((middle[0] + side * 0.28, y, 0.0), (middle[0] + side * 0.03, y, 1.02), 0.1,
                                          0.12, up=(0, 1, 0), chamfer=0.015, ragged=(0.02, 0.0),
                                          seed=f'mines.winch.leg{number}{side}')))
        found.append(make(kit, timber((middle[0] - 0.27, y, 0.32), (middle[0] + 0.27, y, 0.32), 0.12, 0.08,
                                      chamfer=0.012, seed=f'mines.winch.tie{number}')))
        found.append(make(kit, timber((middle[0] - 0.33, y, 0.04), (middle[0] + 0.33, y, 0.04), 0.16, 0.08,
                                      chamfer=0.012, ragged=(0.03, 0.03), seed=f'mines.winch.foot{number}')))
    drum = [make(kit, tapered((middle[0], 2.6, middle[1]), (middle[0], 3.8, middle[1]), 0.21, 0.21, sides=12),
                 smooth=40.0)]
    drum += [make(kit, revolve([(0.0, 0.0), (0.27, 0.0), (0.27, 0.03), (0.0, 0.03)], (middle[0], y, middle[1]),
                               (0, 1, 0), sides=12), 'iron', smooth=None) for y in (2.58, 3.79)]
    drum.append(make(kit, rod((middle[0], 2.4, middle[1]), (middle[0], 3.98, middle[1]), 0.025), 'iron'))
    turns = [(middle[0] + 0.228 * math.cos(turn), 2.78 + 0.0055 * turn, middle[1] + 0.228 * math.sin(turn))
             for turn in (math.tau * step / 9 for step in range(9 * 6 + 3))]
    drum.append(rope_path(kit, turns, 0.019, 0.1))
    found += drum
    crank = [make(kit, timber((middle[0], 2.42, middle[1]), (middle[0] + 0.05, 2.42, middle[1] - 0.3), 0.04, 0.025,
                              up=(0, 1, 0), chamfer=0.0), 'iron'),
             make(kit, rod((middle[0] + 0.05, 2.43, middle[1] - 0.3), (middle[0] + 0.05, 2.36, middle[1] - 0.3), 0.02),
                  smooth=50.0)]
    teeth = []
    for step in range(24):
        turn = math.tau * step / 24
        reach = 0.2 if step % 2 == 0 else 0.17
        teeth.append((middle[0] + reach * math.cos(turn), middle[1] + reach * math.sin(turn)))
    gear = make(kit, extrude_outline(teeth, 3.82, 3.86, 'xz'), 'iron')
    pawl = make(kit, timber((middle[0] + 0.3, 3.84, 0.98), (middle[0] + 0.13, 3.84, 0.94), 0.03, 0.03, chamfer=0.0),
                'iron')
    found += crank + [gear, pawl]
    flat_coil = details.helix((6.0, 3.3, 0.03), 0.06, 3.5, 0.0, steps=10, radius_end=0.22)
    found.append(rope_path(kit, flat_coil, 0.02, 0.09))
    return found
