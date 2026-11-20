"""The kit's built-up shapes as plain faces, without Blender, as shapes.py's are: arches, rocks, masonry, planks,
ropes and hanging cloth, with the paths and placements they are laid along.

Randomness is seeded only: a helper's `seed` (a string), or the call's own numbers when there is none, so the same
call always makes the same mesh.
"""
import math
import random

from shapes import (TAU, _centre, add, bevelled_box, cross, dot, extrude_outline, facing, flat, length, mul,
                    normal_of, out_from, planar_uvs, sub, sweep, unit)


def seeded(seed, *call):
    """A random number source from `seed` when given, else from the call's own numbers."""
    return random.Random(str(seed) if seed is not None else repr(call))


def _arcs(half, spring, shape, rise, sharpness, thickness):
    """An arch's curve as arcs: (centre x, centre z, inner radius, outer radius, inner turns, outer turns)."""
    if shape == 'round':
        return [(0.0, spring, half, half + thickness, (math.pi, 0.0), (math.pi, 0.0))]
    if shape == 'segmental':
        rise = rise or half / 2
        radius = (half * half + rise * rise) / (2 * rise)
        centre = spring + rise - radius
        end = math.atan2(spring - centre, half)
        return [(0.0, centre, radius, radius + thickness, (math.pi - end, end), (math.pi - end, end))]
    if shape == 'pointed':
        radius = max(sharpness, 0.5) * 2 * half
        offset = radius - half
        inner, outer = math.acos(-offset / radius), math.acos(-offset / (radius + thickness))
        return [(offset, spring, radius, radius + thickness, (math.pi, inner), (math.pi, outer)),
                (-offset, spring, radius, radius + thickness, (math.pi - inner, 0.0), (math.pi - outer, 0.0))]
    raise ValueError(f'{shape!r} is no arch: round, pointed or segmental')


def _on_arch(arcs, share, outer, extra=0.0):
    """The point (x, z) `share` (0..1) of the way along an arch's curve, from its left springing."""
    index = min(int(share * len(arcs)), len(arcs) - 1)
    local = share * len(arcs) - index
    centre_x, centre_z, inner_radius, outer_radius, inner_turns, outer_turns = arcs[index]
    start, end = outer_turns if outer else inner_turns
    turn = start + (end - start) * local
    radius = outer_radius + extra if outer else inner_radius
    return centre_x + radius * math.cos(turn), centre_z + radius * math.sin(turn)


def arch_curve(half, spring, shape='round', rise=None, sharpness=1.0, segments=16, x=0.0, offset=0.0):
    """Points (x, z) along an arch's underside from its left springing to its right, or `offset` out from it: an
    arched opening's edge for extrude_outline on 'xz'. `half` is half the span, `spring` the height it springs from."""
    segments += segments % 2 if shape == 'pointed' else 0
    arcs = _arcs(half, spring, shape, rise, sharpness, offset)
    return [(x + px, pz) for px, pz in (_on_arch(arcs, step / segments, offset > 0) for step in range(segments + 1))]


def arch(half, spring, thickness, y0, y1, shape='round', rise=None, sharpness=1.0, stones=0, joint=0.012,
         segments=16, keystone=0.0, x=0.0):
    """An arch over x ±half (centred on `x`) springing at z `spring`, its ring `thickness` deep radially and running
    from y0 to y1: 'round', 'pointed' (radius `sharpness` × the span) or 'segmental' (`rise` over the springing).
    With `stones` it is that many voussoirs, `joint` apart, the middle one `keystone` taller. u runs along the curve,
    v round the ring from its back underside."""
    arcs = _arcs(half, spring, shape, rise, sharpness, thickness)
    pointed = shape == 'pointed'
    count = max(stones, 1)
    span = sum(length(sub(a, b)) for a, b in zip(*(arch_curve(half, spring, shape, rise, sharpness, 32)[k:]
                                                   for k in (0, 1))))
    gap = joint / 2 / span if stones else 0.0
    faces = []
    for number in range(count):
        low, high = number / count + gap, (number + 1) / count - gap
        steps = max(1, round(segments / count))
        shares = sorted({low + (high - low) * step / steps for step in range(steps + 1)}
                        | ({0.5} if pointed and low < 0.5 < high else set()))
        extra = keystone if stones % 2 and number == stones // 2 else 0.0
        sections = []
        for share in shares:
            inner, outer = _on_arch(arcs, share, False), _on_arch(arcs, share, True, extra)
            sections.append([(x + inner[0], y0, inner[1]), (x + inner[0], y1, inner[1]),
                             (x + outer[0], y1, outer[1]), (x + outer[0], y0, outer[1])])
        middles = [_centre(section) for section in sections]
        faces += sweep(sections, outward=out_from(middles))
        faces.append(facing(flat(sections[0]), sub(middles[0], middles[1])))
        faces.append(facing(flat(sections[-1]), sub(middles[-1], middles[-2])))
    return faces


def _icosphere(subdivisions):
    golden = (1 + 5 ** 0.5) / 2
    points = [unit(point) for point in [
        (-1, golden, 0), (1, golden, 0), (-1, -golden, 0), (1, -golden, 0), (0, -1, golden), (0, 1, golden),
        (0, -1, -golden), (0, 1, -golden), (golden, 0, -1), (golden, 0, 1), (-golden, 0, -1), (-golden, 0, 1)]]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
             (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11),
             (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    for _ in range(subdivisions):
        middle = {}

        def between(a, b, middle=middle):
            key = (min(a, b), max(a, b))
            if key not in middle:
                middle[key] = len(points)
                points.append(unit(mul(add(points[a], points[b]), 0.5)))
            return middle[key]

        faces = [face for a, b, c in faces for face in (
            (a, between(a, b), between(c, a)), (b, between(b, c), between(a, b)),
            (c, between(c, a), between(b, c)), (between(a, b), between(b, c), between(c, a)))]
    return points, [list(face) for face in faces]


def _cube(cuts):
    points, index, faces = [], {}, []

    def at(point):
        key = tuple(round(value, 6) for value in point)
        if key not in index:
            index[key] = len(points)
            points.append(point)
        return index[key]

    grid = [-1 + 2 * step / cuts for step in range(cuts + 1)]
    for axis in range(3):
        others = [other for other in range(3) if other != axis]
        for side in (-1.0, 1.0):
            for i in range(cuts):
                for j in range(cuts):
                    ring = []
                    for a, b in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)):
                        point = [0.0, 0.0, 0.0]
                        point[axis], point[others[0]], point[others[1]] = side, grid[a], grid[b]
                        ring.append(at(tuple(point)))
                    faces.append(ring)
    return points, faces


def box_uvs(points):
    """UVs by a box's projection, metres: a face laid on the axis it faces most."""
    normal = normal_of(points)
    axis = max(range(3), key=lambda each: abs(normal[each]))
    snapped = [0.0, 0.0, 0.0]
    snapped[axis] = math.copysign(1.0, normal[axis])
    return planar_uvs(points, tuple(snapped))


def rock(x, y, z, size, seed=None, detail=1, roughness=0.25, shape='ico', base=0.3):
    """A rock standing on z with its middle at (x, y), filling `size` (one number, or (x, y, z) extents) exactly:
    an icosphere (`detail` 0..2 subdivisions) or a cube (`detail` + 1 cuts a side), its points pushed in and out by
    up to `roughness`, seeded, and flat below the lowest `base` share of its height. UVs by a box's projection."""
    draw = seeded(seed, 'rock', x, y, z, size, detail, roughness, shape)
    points, faces = _icosphere(detail) if shape == 'ico' else _cube(detail + 1)
    near = [set() for _ in points]
    for face in faces:
        for a, b in zip(face, face[1:] + face[:1]):
            near[a].add(b)
            near[b].add(a)
    bumps = [1 + draw.uniform(-roughness, roughness) for _ in points]
    bumps = [(bump + sum(bumps[other] for other in near[index]) / len(near[index])) / 2
             for index, bump in enumerate(bumps)]
    turn = draw.uniform(0, TAU)
    points = [(px * math.cos(turn) - py * math.sin(turn), px * math.sin(turn) + py * math.cos(turn), pz)
              for px, py, pz in (mul(point, bump) for point, bump in zip(points, bumps))]
    low, high = min(point[2] for point in points), max(point[2] for point in points)
    floor = low + base * (high - low)
    points = [(px, py, max(pz, floor)) for px, py, pz in points]
    extents = size if isinstance(size, (tuple, list)) else (size, size, size)
    lows = [min(point[axis] for point in points) for axis in range(3)]
    highs = [max(point[axis] for point in points) for axis in range(3)]
    target = (x - extents[0] / 2, y - extents[1] / 2, z)
    points = [tuple(target[axis] + (point[axis] - lows[axis]) / (highs[axis] - lows[axis]) * extents[axis]
                    for axis in range(3)) for point in points]
    middle = _centre(points)
    found = []
    for face in faces:
        ring = [points[index] for index in face]
        found.append(facing(list(zip(ring, box_uvs(ring))), sub(_centre(ring), middle)))
    return found


def stones(x0, x1, z0, z1, y0=0.0, y1=0.2, block=(0.3, 0.6), course=(0.2, 0.35), joint=0.01, bevel=0.015,
           proud=0.02, wear=0.004, alt=0.0, seed=None):
    """Masonry along x from x0 to x1, z0 to z1: courses `course` high (metres, a range) of blocks `block` long, their
    joints staggered and `joint` wide, each chamfered by `bevel`, worn by `wear`, its face (y1) sunk by up to `proud`.
    A share `alt` of the blocks is stoneAlt. Gives {'stone': faces, 'stoneAlt': faces}; all stays in its box."""
    draw = seeded(seed, 'stones', x0, x1, z0, z1, y0, y1, block, course)
    parts = {'stone': [], 'stoneAlt': []}
    level, row = z0, 0
    while level < z1 - 1e-6:
        height = draw.uniform(*course)
        if z1 - level - height < course[0]:
            height = z1 - level
        along, first = x0, True
        while along < x1 - 1e-6:
            run = draw.uniform(*block) * (draw.uniform(0.35, 1.0) if first and row % 2 else 1.0)
            if x1 - along - run < block[0] / 2:
                run = x1 - along
            part = 'stoneAlt' if draw.random() < alt else 'stone'
            parts[part] += bevelled_box(along + joint / 2, y0, level + joint / 2, along + run - joint / 2,
                                        y1 - draw.uniform(0, proud), level + height - joint / 2, bevel, wear,
                                        draw=draw)
            along += run
            first = False
        level += height
        row += 1
    return parts


def planks(low, high, along='x', across='y', width=0.2, gap=0.012, split=0.04, seed=None):
    """Boards filling the box from corner `low` to `high`, running along `along`, laid side by side across `across`,
    the third axis their thickness: a floor ('x', 'y'), a door leaf ('z', 'x'), a crate's side. Widths and ends vary,
    seeded; ends are cut straight, slanted or split by up to `split`. Each board's grain runs along v."""
    draw = seeded(seed, 'planks', low, high, along, across, width, gap)
    lows, highs = [min(pair) for pair in zip(low, high)], [max(pair) for pair in zip(low, high)]
    first, second = 'xyz'.index(along), 'xyz'.index(across)
    third = 3 - first - second
    room = highs[second] - lows[second]
    count = max(1, round((room + gap) / (width + gap)))
    widths = [draw.uniform(0.85, 1.15) for _ in range(count)]
    widths = [share / sum(widths) * (room - gap * (count - 1)) for share in widths]
    faces, start = [], lows[second]
    for board in widths:
        side_a, side_b = start, start + board
        start += board + gap
        outline = _board_end(draw, lows[first], 1, side_a, side_b, split) + \
            _board_end(draw, highs[first], -1, side_b, side_a, split)
        if first > second:
            outline = [(b, a) for a, b in outline]
        plane = ''.join(sorted((along, across)))
        top = highs[third] - draw.uniform(0, 0.15) * (highs[third] - lows[third])
        for face in extrude_outline(outline, lows[third], top, plane):
            points = [point for point, _ in face]
            if abs(normal_of(points)[third]) > 0.99:
                face = [(point, (point[second], point[first])) for point in points]
            faces.append(face)
    return faces


def _board_end(draw, at, inward, side_a, side_b, split):
    """A board's end at `at` (the board lies to `inward` of it) from side_a to side_b: straight, slanted or split."""
    cut, kind = draw.uniform(0.3, 1.0) * split, draw.random()
    if kind < 0.4:
        return [(at, side_a), (at, side_b)]
    if kind < 0.7:
        return [(at + inward * cut, side_a), (at, side_b)]
    return [(at, side_a), (at + inward * cut, (side_a + side_b) / 2), (at, side_b)]


def _along(points):
    """A path's points with the distance travelled to each, and its length."""
    travelled = [0.0]
    for a, b in zip(points, points[1:]):
        travelled.append(travelled[-1] + length(sub(b, a)))
    return travelled


def _at(points, travelled, distance):
    """The point `distance` along a path and the path's direction there."""
    for index in range(len(points) - 1):
        if distance <= travelled[index + 1] or index == len(points) - 2:
            span = max(travelled[index + 1] - travelled[index], 1e-12)
            share = (distance - travelled[index]) / span
            return add(points[index], mul(sub(points[index + 1], points[index]), share)), unit(
                sub(points[index + 1], points[index]))
    raise ValueError('a path needs two points')


def _square_to(direction, before):
    """A direction square to `direction`, as near `before` as can be: a frame carried along a path without twist."""
    found = sub(before, mul(direction, dot(before, direction)))
    if length(found) < 1e-6:
        found = sub((0.0, 0.0, 1.0) if abs(direction[2]) < 0.9 else (1.0, 0.0, 0.0), mul(direction, direction[2]))
    return unit(found)


def rope(points, radius=0.02, sides=9, strands=3, lay=None, step=None):
    """A rope of `strands` twisted strands along a path (a list of points), capped at its ends: a coil, a lashing,
    a noose, a stay. `lay` is the length of one twist, `step` the length of a segment. u runs along it, v round."""
    lay, step = lay or radius * 7, step or radius * 2
    travelled = _along(points)
    count = max(1, round(travelled[-1] / step))
    across = _square_to(unit(sub(points[1], points[0])), (0.0, 0.0, 1.0))
    sections, middles = [], []
    for number in range(count + 1):
        distance = travelled[-1] * number / count
        middle, direction = _at(points, travelled, distance)
        across = _square_to(direction, across)
        other = cross(direction, across)
        twist = TAU * distance / lay
        section = []
        for k in range(sides):
            turn = TAU * k / sides
            reach = radius * (0.84 + 0.16 * math.cos(strands * (turn - twist)))
            section.append(add(middle, add(mul(across, reach * math.cos(turn)), mul(other, reach * math.sin(turn)))))
        sections.append(section)
        middles.append(middle)
    faces = sweep(sections, outward=out_from(middles))
    faces.append(facing(flat(sections[0]), sub(middles[0], middles[1])))
    faces.append(facing(flat(sections[-1]), sub(middles[-1], middles[-2])))
    return faces


def drape(x0, x1, top, bottom, y=0.0, folds=3, depth=0.06, thickness=0.01, ragged=0.0, rows=4, seed=None):
    """Cloth hanging from x0..x1 at z `top` to `bottom` against the plane y, falling in `folds` up to `depth` deep
    (deeper toward its hem), `thickness` thick, its hem torn by up to `ragged`: a banner, a shroud, a curtain. It
    fills y..y + thickness + depth. u runs across it along its folds, v up it."""
    draw = seeded(seed, 'drape', x0, x1, top, bottom, y, folds, depth)
    columns = max(4, folds * 4)
    swell = [draw.uniform(0.6, 1.0) for _ in range(folds)]
    hem = [draw.uniform(0, ragged) for _ in range(columns + 1)]
    sheets = {'front': [], 'back': []}
    for row in range(rows + 1):
        down = row / rows
        for name, lift in (('front', thickness), ('back', 0.0)):
            line = []
            for column in range(columns + 1):
                across = column / columns
                fold = swell[min(int(across * folds), folds - 1)] * (0.5 - 0.5 * math.cos(TAU * folds * across))
                height = top - (top - bottom) * down + (hem[column] if row == rows else 0.0)
                line.append((x0 + (x1 - x0) * across, y + lift + depth * fold * (0.55 + 0.45 * down), height))
            sheets[name].append(line)
    faces = []
    for name, outward in (('front', (0.0, 1.0, 0.0)), ('back', (0.0, -1.0, 0.0))):
        for face in sweep(sheets[name], closed=False):
            faces.append(facing([(point, (uv[1], -uv[0])) for point, uv in face], outward))
    front, back = sheets['front'], sheets['back']
    rims = [([front[0][k], front[0][k + 1], back[0][k + 1], back[0][k]], (0.0, 0.0, 1.0)) for k in range(columns)]
    rims += [([front[-1][k], front[-1][k + 1], back[-1][k + 1], back[-1][k]], (0.0, 0.0, -1.0))
             for k in range(columns)]
    for edge, outward in ((0, (-1.0, 0.0, 0.0)), (-1, (1.0, 0.0, 0.0))):
        rims += [([front[r][edge], front[r + 1][edge], back[r + 1][edge], back[r][edge]], outward) for r in range(rows)]
    return faces + [facing(flat(ring), outward) for ring, outward in rims]


def sag_path(start, end, sag, steps=8):
    """Points from `start` to `end` hanging `sag` metres low in the middle: a chain's or rope's slack."""
    return [add(add(start, mul(sub(end, start), share)), (0.0, 0.0, -4 * sag * share * (1 - share)))
            for share in (step / steps for step in range(steps + 1))]
