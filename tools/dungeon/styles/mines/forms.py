"""The mines' own shapes as plain faces (shapes.py's form: corners of (point, uv), the dungeon's frame, metres): hewn
timbers, wedges, nail heads, tools, lanterns, buckets and heaped ground.

The climate's timber picture lays its boards and grain along u, so a timber's u runs along it.
"""
import math

import details
from shapes import (add, cross, dot, extrude_outline, facing, flat, frustum, length, lathe, mul, out_from,
                    sub, sweep, unit)
from shapes import ring as torus

UP = (0.0, 0.0, 1.0)


def lerp(a, b, share):
    return add(a, mul(sub(b, a), share))


def frame(a, b, up=UP):
    """The axis from a to b, and two directions square to it: `side` and `top`, `top` as near `up` as can be."""
    axis = unit(sub(b, a))
    side = cross(axis, up)
    if length(side) < 1e-6:
        side = cross(axis, (0.0, 1.0, 0.0))
    side = unit(side)
    return axis, side, cross(side, axis)


def swapped(faces):
    """The faces with u and v swapped: a turned handle's grain run along it, not round it."""
    return [[(point, (uv[1], uv[0])) for point, uv in face] for face in faces]


def _outline(width, depth, chamfer, facets, check, draw):
    """A hewn section, counter-clockwise in (side, top): a chamfered rectangle, each broad face broken into two adze
    facets up to `facets` deep, and with `check` ('top', 'bottom', 'left' or 'right') a V-shaped crack down that
    face instead."""
    half_w, half_d = width / 2, depth / 2
    cut = min(chamfer, half_w * 0.45, half_d * 0.45)
    if cut > 0:
        corners = [(-half_w + cut, -half_d), (half_w - cut, -half_d), (half_w, -half_d + cut), (half_w, half_d - cut),
                   (half_w - cut, half_d), (-half_w + cut, half_d), (-half_w, half_d - cut), (-half_w, -half_d + cut)]
        broad = {0, 2, 4, 6}
    else:
        corners = [(-half_w, -half_d), (half_w, -half_d), (half_w, half_d), (-half_w, half_d)]
        broad = {0, 1, 2, 3}
    cracked = {'bottom': 0, 'right': 1, 'top': 2, 'left': 3}.get(check, -1) * (2 if cut > 0 else 1)
    points = []
    for index, here in enumerate(corners):
        points.append(here)
        if index not in broad:
            continue
        after = corners[(index + 1) % len(corners)]
        edge = (after[0] - here[0], after[1] - here[1])
        span = math.hypot(*edge)
        inward = (-edge[1] / span, edge[0] / span)
        inserts = []
        if index == cracked:
            share, gap = draw.uniform(0.3, 0.7), min(0.008 / span, 0.1)
            inserts = [(share - gap, 0.0), (share, min(0.03, depth * 0.15)), (share + gap, 0.0)]
        elif facets:
            inserts = [(draw.uniform(0.35, 0.65), draw.uniform(0.35, 1.0) * facets)]
        for share, sink in inserts:
            points.append((here[0] + edge[0] * share + inward[0] * sink, here[1] + edge[1] * share + inward[1] * sink))
    return points


def _fan(ring, centre, outward):
    return [facing(flat([centre, ring[index], ring[(index + 1) % len(ring)]]), outward) for index in range(len(ring))]


def timber(a, b, width, depth, up=UP, chamfer=0.02, facets=0.0, check=None, stations=2, wobble=0.0,
           ragged=(0.0, 0.0), snapped=(0.0, 0.0), caps=(True, True), uv=None, seed=None):
    """A hewn timber from a to b, `width` along its side and `depth` toward `up`: chamfered, its broad faces adzed,
    bowed by `wobble` between its ends; each end cut square, ragged (`ragged`, metres of split) or snapped into
    splinters (`snapped`, metres they reach), or left open where `caps` says it is hidden. u runs along it and v
    round it, or `uv(point, (along, round))` gives its sides' UVs."""
    draw = details.seeded(seed, 'timber', a, b, width, depth)
    axis, side, top = frame(a, b, up)
    total = length(sub(b, a))
    outline = _outline(width, depth, chamfer, facets, check, draw)
    sections, middles = [], []
    for step in range(stations):
        inner = 0 < step < stations - 1
        drift = (draw.uniform(-wobble, wobble), draw.uniform(-wobble, wobble)) if inner else (0.0, 0.0)
        swell = 1.0 + draw.uniform(-0.04, 0.04) if inner and wobble else 1.0
        centre = add(add(a, mul(axis, total * step / (stations - 1))), add(mul(side, drift[0]), mul(top, drift[1])))
        middles.append(centre)
        sections.append([add(centre, add(mul(side, s * swell), mul(top, t * swell))) for s, t in outline])
    for end, inward in ((0, 1.0), (-1, -1.0)):
        if ragged[end]:
            sections[end] = [add(point, mul(axis, inward * draw.uniform(0.0, ragged[end]))) for point in sections[end]]
    sides = sweep(sections, outward=out_from(middles))
    ends = []
    for end, outward in ((0, -1.0), (-1, 1.0)):
        ring, centre = sections[end], middles[end]
        if snapped[end]:
            reach = [draw.uniform(0.15, 1.0) * snapped[end] for _ in ring]
            tips = [add(lerp(centre, point, draw.uniform(0.2, 0.75)), mul(axis, outward * far))
                    for point, far in zip(ring, reach)]
            tip_middle = add(centre, mul(axis, outward * snapped[end] * 0.3))
            pair = [ring, tips] if outward > 0 else [tips, ring]
            sides += sweep(pair, outward=out_from([centre, tip_middle] if outward > 0 else [tip_middle, centre]))
            ends += _fan(tips, tip_middle, mul(axis, outward))
        elif ragged[end]:
            sink = draw.uniform(0.2, 0.6) * ragged[end]
            ends += _fan(ring, add(centre, mul(axis, -outward * sink)), mul(axis, outward))
        elif caps[end]:
            ends.append(facing(flat(ring), mul(axis, outward)))
    if uv is not None:
        sides = [[(point, uv(point, mapped)) for point, mapped in face] for face in sides]
    return sides + ends


def board(a, b, width, thick, up=UP, seed=None, ragged=(0.0, 0.0), snapped=(0.0, 0.0), caps=(True, True)):
    """A split board from a to b, `thick` toward `up`: square-edged, as a board is too thin to show a chamfer."""
    return timber(a, b, width, thick, up, chamfer=0.0, ragged=ragged, snapped=snapped, caps=caps, seed=seed)


def wedge(at, toward, up, size):
    """A driven wedge, its butt at `at` (the middle of its foot) tapering along `toward` to a thin edge: size is
    (length, width, thickness at the butt)."""
    run, width, thick = size
    axis = unit(toward)
    top = unit(sub(up, mul(axis, dot(up, axis))))
    side = cross(axis, top)

    def at_(along, across, rise):
        return add(at, add(mul(axis, along), add(mul(side, across), mul(top, rise))))

    half, tip = width / 2, thick * 0.12
    butt = [at_(0, -half, 0), at_(0, half, 0), at_(0, half, thick), at_(0, -half, thick)]
    edge = [at_(run, -half, 0), at_(run, half, 0), at_(run, half, tip), at_(run, -half, tip)]
    middle = at_(run / 2, 0, thick / 3)
    rings = [butt, edge, [butt[0], butt[1], edge[1], edge[0]], [butt[3], butt[2], edge[2], edge[3]],
             [butt[0], butt[3], edge[3], edge[0]], [butt[1], butt[2], edge[2], edge[1]]]
    return [facing(flat(ring), sub(sum_points(ring), middle)) for ring in rings]


def sum_points(points):
    return mul(tuple(map(sum, zip(*points))), 1 / len(points))


def nail(at, normal, size=0.018, height=0.008):
    """A square forged nail or spike head, standing `height` off a face along `normal`, open where it meets it."""
    faces = frustum(at, add(at, mul(unit(normal), height)), size * 0.75, size * 0.45, sides=4)
    return faces[:-2] + faces[-1:]


def rod(a, b, radius, sides=6):
    """A turned rod or handle from a to b, its grain along it."""
    return swapped(frustum(a, b, radius, radius, sides))


def tapered(a, b, radius_a, radius_b, sides=6):
    return swapped(frustum(a, b, radius_a, radius_b, sides))


def arc_sweep(points, radii, flatten=1.0, sides=4, up=UP):
    """A tapering bar along a path (a pick's head, a hook): `radii` one a point, `flatten` squashing it toward `up`."""
    sections, middles = [], []
    across = None
    for index, point in enumerate(points):
        ahead = sub(points[min(index + 1, len(points) - 1)], points[max(index - 1, 0)])
        direction = unit(ahead)
        across = unit(sub(up, mul(direction, dot(up, direction)))) if across is None else across
        across = unit(sub(across, mul(direction, dot(across, direction))))
        other = cross(direction, across)
        section = []
        for corner in range(sides):
            turn = math.tau * (corner + 0.5) / sides
            section.append(add(point, add(mul(across, radii[index] * flatten * math.cos(turn)),
                                          mul(other, radii[index] * math.sin(turn)))))
        sections.append(section)
        middles.append(point)
    faces = sweep(sections, outward=out_from(middles))
    faces += _fan(sections[0], middles[0], sub(middles[0], middles[1]))
    faces += _fan(sections[-1], middles[-1], sub(middles[-1], middles[-2]))
    return faces


def pick_head(eye, along, toward_grip, half=0.3, bend=0.06, steps=8):
    """A miner's pick head through the handle's eye: two curved arms along `along`, bowed toward the grip, one a
    point and one a narrow chisel. Gives (faces of the head, faces of its collar)."""
    points, radii = [], []
    for step in range(steps + 1):
        share = -1 + 2 * step / steps
        points.append(add(eye, add(mul(along, share * half), mul(toward_grip, bend * share * share))))
        radii.append(0.004 + 0.022 * (1 - abs(share) ** 1.4))
    head = arc_sweep(points, radii, flatten=0.8, up=toward_grip)
    collar = frustum(add(eye, mul(toward_grip, 0.05)), add(eye, mul(toward_grip, -0.05)), 0.034, 0.03, sides=6)
    return head, collar


def lantern(lit=True, height=0.3, sides=8):
    """A miner's lantern standing at the origin: an iron foot, four bars, a hood with a ring to hang it by, and
    with `lit` glowing glass. Gives {part: faces}."""
    k = height / 0.3
    iron = lathe([(0.0, 0.0), (0.075 * k, 0.0), (0.08 * k, 0.02 * k), (0.068 * k, 0.035 * k), (0.0, 0.035 * k)],
                 sides=sides)
    for turn in range(4):
        angle = math.tau * (turn + 0.5) / 4
        x, y = 0.066 * k * math.cos(angle), 0.066 * k * math.sin(angle)
        iron += frustum((x, y, 0.03 * k), (x, y, 0.215 * k), 0.008 * k, 0.008 * k, sides=3)
    iron += lathe([(0.082 * k, 0.21 * k), (0.07 * k, 0.235 * k), (0.03 * k, 0.27 * k), (0.0, 0.272 * k)], sides=sides)
    iron += torus((0.0, 0.0, 0.29 * k), 0.03 * k, 0.005 * k, axis=(0.0, 1.0, 0.0), sides=8, tube_sides=3)
    parts = {'iron': iron}
    if lit:
        parts['glow'] = lathe([(0.0, 0.035 * k), (0.05 * k, 0.035 * k), (0.056 * k, 0.12 * k), (0.05 * k, 0.21 * k),
                               (0.0, 0.21 * k)], sides=sides)
    return parts


def bucket(radius=0.13, height=0.26):
    """A stave bucket with two iron hoops standing at the origin. Gives {part: faces}."""
    wall = 0.014
    wood = swapped(lathe([(0.0, 0.0), (radius * 0.82, 0.0), (radius, height), (radius - wall, height),
                          (radius * 0.82 - wall, 0.03), (0.0, 0.03)], sides=12))
    hoops = []
    for share in (0.15, 0.85):
        reach = radius * (0.82 + 0.18 * share)
        hoops += torus((0.0, 0.0, height * share), reach, 0.007, sides=12, tube_sides=3)
    return {'wood': wood, 'iron': hoops}


def rough(height_of, amount, seed):
    """A heap's height made lumpy: each point moved up or down by up to `amount`, seeded by the point itself, so a
    point shared by two faces moves once."""
    def height(x, y):
        base = height_of(x, y)
        if base <= 0.0:
            return base
        return max(0.0, base + details.seeded(f'{seed}{x:.3f},{y:.3f}').uniform(-amount, amount) * min(1.0, base * 4))
    return height


def window(area, margin):
    """A height's falloff to nothing at the edges of `area` (x0, y0, x1, y1), over `margin` metres."""
    def ease(value):
        value = min(1.0, max(0.0, value / margin))
        return value * value * (3 - 2 * value)
    return lambda x, y: ease(x - area[0]) * ease(area[2] - x) * ease(y - area[1]) * ease(area[3] - y)


def heap(x0, y0, x1, y1, height_of, step=0.25):
    """Heaped ground over a rectangle: the height `height_of(x, y)` on a grid `step` apart, UVs by a box's
    projection. One-sided, facing up."""
    columns, rows = max(2, round((x1 - x0) / step)), max(2, round((y1 - y0) / step))
    grid = [[(x0 + (x1 - x0) * i / columns, y0 + (y1 - y0) * j / rows) for i in range(columns + 1)]
            for j in range(rows + 1)]
    points = [[(x, y, height_of(x, y)) for x, y in row] for row in grid]
    faces = []
    for j in range(rows):
        for i in range(columns):
            ring = [points[j][i], points[j][i + 1], points[j + 1][i + 1], points[j + 1][i]]
            for tri in ([ring[0], ring[1], ring[2]], [ring[0], ring[2], ring[3]]):
                faces.append(facing(list(zip(tri, details.box_uvs(tri))), UP))
    return faces


def bumps(seed, count, area, size, height):
    """A heap's height as a sum of seeded mounds: give it to `heap`."""
    draw = details.seeded(seed, 'bumps')
    mounds = [(draw.uniform(area[0], area[2]), draw.uniform(area[1], area[3]), draw.uniform(*size),
               draw.uniform(*height)) for _ in range(count)]

    def height_of(x, y):
        return sum(rise * math.exp(-((x - mx) ** 2 + (y - my) ** 2) / (2 * reach * reach))
                   for mx, my, reach, rise in mounds)
    return height_of


def plate(outline, thick, plane='xz'):
    """A flat plate of a 2D outline, `thick` metres deep: a shovel's blade, a strap's end."""
    return extrude_outline(outline, -thick / 2, thick / 2, plane)
