"""The sanctum's motifs, the marks that tell its pieces from any other style's: pointed and trefoil heads, dark
clustered colonnettes, rune bands, the crescent and the whorl, ribs that spring toward the vault, and tapering fronds
that may be weed or may be the reach of something far larger. Each gives plain faces (shapes.py's) or, given the kit,
an object; every one is seeded by its own numbers.
"""
import math

import details
from shapes import TAU, add, cross, dot, facing, flat, length, mul, normal_of, out_from, planar_uvs, sub, sweep, unit

# Round things are smooth even at six sides, sharp only where a cap meets the side.
ROUND = 65.0
# The parts whose pictures are darker at their tiles' edges, and half a tile, metres.
BORDERED = ('trim', 'ceiling')
HALF_TILE = 1.6


def square_to(direction, before):
    """A direction square to `direction`, as near `before` as can be: a frame carried along a path without twist."""
    found = sub(before, mul(direction, dot(before, direction)))
    if length(found) < 1e-6:
        found = sub((0.0, 0.0, 1.0) if abs(direction[2]) < 0.9 else (1.0, 0.0, 0.0), mul(direction, direction[2]))
    return unit(found)


def swept(points, radii, sides=8, caps=True):
    """A tube along a path whose radius runs through `radii` (one a point): a rib, a roll moulding, a tapering frond.
    Capped where its radius is not 0, unless `caps` is False (its ends hidden). u runs along it, v round."""
    if isinstance(radii, (int, float)):
        radii = [radii] * len(points)
    across = square_to(unit(sub(points[1], points[0])), (0.0, 0.0, 1.0))
    sections = []
    for index, point in enumerate(points):
        direction = unit(sub(points[min(index + 1, len(points) - 1)], points[max(index - 1, 0)]))
        across = square_to(direction, across)
        other = cross(direction, across)
        sections.append([add(point, add(mul(across, radii[index] * math.cos(turn)),
                                        mul(other, radii[index] * math.sin(turn))))
                         for turn in (TAU * k / sides for k in range(sides))])
    faces = sweep(sections, outward=out_from(points))
    for end, inward in ((0, 1), (-1, -2)):
        if caps and radii[end] > 1e-6:
            faces.append(facing(flat(sections[end]), sub(points[end], points[inward])))
    return faces


def keeled(points, width, depth, keel_of):
    """A vault rib along a path: a triangular section, flat on its back and `depth` deep to a sharp keel along
    `keel_of(point, direction)` (a unit direction square to the path), `width` either side. Open at its ends, which
    stand in a capital or the vault."""
    sections, middles = [], []
    for index, point in enumerate(points):
        direction = unit(sub(points[min(index + 1, len(points) - 1)], points[max(index - 1, 0)]))
        keel = keel_of(point, direction)
        across = unit(cross(direction, keel))
        back, edge = sub(point, mul(keel, 0.01)), add(point, mul(keel, depth))
        middles.append(mul(add(mul(back, 2), edge), 1 / 3))
        sections.append([add(back, mul(across, -width)), edge, add(back, mul(across, width))])
    return sweep(sections, outward=out_from(middles))


def tube(kit, points, radius, part='trim', sides=8, name='tube'):
    return kit.mesh(swept(points, radius, sides), part, name, ROUND)


def shaft(kit, x, y, z0, z1, radius, part='stoneAlt', sides=10, top=None):
    """An upright round shaft without ends (they stand in a base and a capital), narrowing to `top` if given."""
    return kit.mesh(swept([(x, y, z0), (x, y, z1)], [radius, radius if top is None else top], sides, caps=False),
                    part, 'shaft', ROUND, False)


def frond(kit, points, start, end, part='relief', sides=7, name='frond'):
    """A tapering tube from radius `start` to `end` along a path."""
    count = len(points) - 1
    radii = [start + (end - start) * (index / count) ** 0.8 for index in range(count + 1)]
    return kit.mesh(swept(points, radii, sides), part, name, ROUND)


def smooth_path(points, steps=6):
    """A Catmull-Rom curve through `points`, `steps` segments between each two."""
    padded = [points[0]] + list(points) + [points[-1]]
    found = []
    for index in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[index - 1:index + 3]
        for step in range(steps):
            t = step / steps
            found.append(tuple(0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t
                                      + (3 * b - a - 3 * c + d) * t ** 3) for a, b, c, d in zip(p0, p1, p2, p3)))
    return found + [points[-1]]


def slab(centre, along, up, half_along, half_up, depth, back=False, front_only=False):
    """A block standing out of a plane: `centre` on the plane, `along` and `up` in it (unit, square to each other),
    reaching `depth` out of it along their cross product. Its back, on the plane, only when `back`; with `front_only`
    its front face alone, a plate laid `depth` proud (cheap where its sides would not be seen)."""
    out = cross(along, up)
    corners = {}
    for a in (-1, 1):
        for b in (-1, 1):
            for c in (0, 1):
                corners[a, b, c] = add(centre, add(add(mul(along, a * half_along), mul(up, b * half_up)),
                                                    mul(out, c * depth)))
    sides = [((-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)), ((-1, -1, 0), (-1, -1, 1), (-1, 1, 1), (-1, 1, 0)),
             ((1, -1, 0), (1, 1, 0), (1, 1, 1), (1, -1, 1)), ((-1, -1, 0), (1, -1, 0), (1, -1, 1), (-1, -1, 1)),
             ((-1, 1, 0), (-1, 1, 1), (1, 1, 1), (1, 1, 0))]
    if back:
        sides.append(((-1, -1, 0), (-1, 1, 0), (1, 1, 0), (1, -1, 0)))
    if front_only:
        sides = sides[:1]
    middle = add(centre, mul(out, depth / 2))
    faces = []
    for side in sides:
        ring = [corners[key] for key in side]
        faces.append(facing(flat(ring), sub(mul(add(ring[0], ring[2]), 0.5), middle)))
    return faces


# A rune is drawn on a lattice of three columns and four rows: a stem down the middle and strokes off it.
_STEMS = (((1, 0), (1, 3)),)
_BRANCHES = (((1, 3), (2, 2)), ((1, 3), (0, 2)), ((1, 2), (2, 3)), ((1, 2), (0, 3)), ((1, 1), (2, 2)),
             ((1, 1), (0, 2)), ((1, 2), (2, 1)), ((1, 2), (0, 1)), ((0, 1), (2, 1)), ((1, 0), (2, 1)),
             ((0, 3), (2, 3)), ((2, 2), (2, 0)), ((0, 2), (0, 0)), ((1, 1), (2, 0)))


def rune(seed):
    """A rune of the sanctum's script, seeded: a stem and two to three strokes, as segments in a unit cell (u across
    0..1, v up 0..1)."""
    draw = details.seeded(seed, 'rune')
    strokes = list(_STEMS) + draw.sample(_BRANCHES, draw.choice((2, 2, 3)))
    return [((a[0] / 2, a[1] / 3), (b[0] / 2, b[1] / 3)) for a, b in strokes]


def glyph(strokes, origin, along, up, width, height, stroke=0.016, depth=0.012, front_only=False):
    """A rune's strokes raised out of a plane, its cell `width` × `height` from `origin` (the cell's lower left); with
    `front_only` each stroke is only its face, laid `depth` proud: two triangles a stroke."""
    faces = []
    for (u0, v0), (u1, v1) in strokes:
        start = add(origin, add(mul(along, u0 * width), mul(up, v0 * height)))
        end = add(origin, add(mul(along, u1 * width), mul(up, v1 * height)))
        run = sub(end, start)
        way = unit(run)
        faces += slab(mul(add(start, end), 0.5), way, cross(cross(along, up), way), length(run) / 2 + stroke / 2,
                      stroke / 2, depth, front_only=front_only)
    return faces


def rune_row(seed, count, start, step, up, width, height, stroke=0.016, depth=0.012, front_only=False):
    """`count` runes in a row on a plane, the first cell's lower left at `start`, each `step` on: a rune band."""
    along = unit(step)
    return [face for number in range(count)
            for face in glyph(rune(f'{seed}.{number}'), add(start, mul(step, number)), along, up, width, height,
                              stroke, depth, front_only)]


def pointed(half, spring, sharpness, segments=16, offset=0.0, x=0.0):
    """Points (x, z) along a pointed arch's underside from its left springing to its right, or `offset` out from it."""
    return details.arch_curve(half, spring, 'pointed', sharpness=sharpness, segments=segments, x=x, offset=offset)


def on_xz(points, y):
    """Points (x, z) stood in the plane at `y`."""
    return [(px, y, pz) for px, pz in points]


def along_curve(points, share):
    """The point `share` (0..1) of the way along a polyline (2D or 3D) by length, and the direction there."""
    lengths = [length(sub(b, a)) for a, b in zip(points, points[1:])]
    goal = share * sum(lengths)
    for index, run in enumerate(lengths):
        if goal <= run or index == len(lengths) - 1:
            portion = goal / run if run else 0.0
            return add(points[index], mul(sub(points[index + 1], points[index]), portion)), unit(
                sub(points[index + 1], points[index]))
        goal -= run
    raise ValueError('a curve needs two points')


def annulus(inner, outer, low, high, sides=32, centre=(0.0, 0.0), start=0.0, end=TAU, bottom=False, walls=True):
    """A flat ring, or a sector of one from `start` to `end` (radians from east toward south), between radii and
    heights: an inlaid band, a tessera, a rim. Its top's UVs by x and v north; its sides round it. Without `walls`,
    only its top (and its outer edge if `walls` is 'outer'): a thin inlay whose edges nobody sees."""
    cx, cy = centre
    whole = abs(end - start - TAU) < 1e-9
    turns = [start + (end - start) * step / sides for step in range(sides + 1)]

    def at(radius, turn, z):
        return (cx + radius * math.cos(turn), cy + radius * math.sin(turn), z)

    faces = []
    for a, b in zip(turns, turns[1:]):
        middle = (a + b) / 2
        out = (math.cos(middle), math.sin(middle), 0.0)
        faces.append(facing(flat([at(inner, a, high), at(outer, a, high), at(outer, b, high), at(inner, b, high)]),
                            (0, 0, 1)))
        if bottom:
            faces.append(facing(flat([at(inner, a, low), at(outer, a, low), at(outer, b, low), at(inner, b, low)]),
                                (0, 0, -1)))
        if walls:
            faces.append(facing(flat([at(outer, a, low), at(outer, b, low), at(outer, b, high), at(outer, a, high)]),
                                out))
        if inner > 1e-6 and walls is True:
            faces.append(facing(flat([at(inner, a, low), at(inner, b, low), at(inner, b, high),
                                      at(inner, a, high)]), mul(out, -1)))
    if not whole and walls is True:
        for turn, sign in ((start, -1), (end, 1)):
            side = (-math.sin(turn) * sign, math.cos(turn) * sign, 0.0)
            faces.append(facing(flat([at(inner, turn, low), at(outer, turn, low), at(outer, turn, high),
                                      at(inner, turn, high)]), side))
    return faces


def crescent(outer, inner, lift, steps=12):
    """A crescent's outline (a, b), horns up: the disc of radius `outer` round the origin less the disc of radius
    `inner` raised `lift` above it."""
    tip_b = (outer * outer - inner * inner + lift * lift) / (2 * lift)
    tip_a = math.sqrt(max(outer * outer - tip_b * tip_b, 0.0))
    first = math.atan2(tip_b, tip_a)
    rim = [first - (math.pi + 2 * first) * step / steps for step in range(steps + 1)]
    left, right = math.atan2(tip_b - lift, -tip_a), math.atan2(tip_b - lift, tip_a)
    if left > right:
        left -= TAU
    hollow = [left + (right - left) * step / steps for step in range(1, steps)]
    return ([(outer * math.cos(turn), outer * math.sin(turn)) for turn in rim]
            + [(inner * math.cos(turn), lift + inner * math.sin(turn)) for turn in hollow])


def spiral(centre, start, end, turns, steps_per_turn=14, phase=0.0):
    """Points (a, b) of a spiral round `centre`, its radius running from `start` to `end`: the whorl."""
    count = max(2, round(turns * steps_per_turn))
    return [(centre[0] + (start + (end - start) * step / count) * math.cos(phase + TAU * turns * step / count),
             centre[1] + (start + (end - start) * step / count) * math.sin(phase + TAU * turns * step / count))
            for step in range(count + 1)]


def star(points, outer, inner, turn=0.0):
    """A star's outline (a, b): `points` tips at radius `outer`, its notches at `inner`."""
    return [((outer if step % 2 == 0 else inner) * math.cos(turn + math.pi * step / points),
             (outer if step % 2 == 0 else inner) * math.sin(turn + math.pi * step / points))
            for step in range(2 * points)]


def lobed(profile, lobes=8, depth=0.1, twist=0.0, centre=(0.0, 0.0, 0.0), sides=24, squash=1.0, lean=None,
          caps=True):
    """A turned shape whose sections are lobed: radius × (1 + depth × cos(lobes × turn + twist × height)), squashed
    by `squash` along y and shifted by `lean(height)` (dx, dy): fluted pendants, a robe's folds, the idol. The profile
    is [(radius, height), ...]; it is capped where it ends off the axis, unless `caps` is False. u runs round it, v
    up."""
    sections, middles = [], []
    for radius, height in profile:
        dx, dy = lean(height) if lean else (0.0, 0.0)
        middle = (centre[0] + dx, centre[1] + dy, centre[2] + height)
        middles.append(middle)
        section = []
        for k in range(sides):
            turn = TAU * k / sides - math.pi / 2
            reach = radius * (1 + depth * math.cos(lobes * turn + twist * height))
            section.append((middle[0] + reach * math.cos(turn), middle[1] + reach * math.sin(turn) * squash,
                            middle[2]))
        sections.append(section)
    rings = [list(column) for column in zip(*sections)]
    faces = sweep(rings + [rings[0]], closed=False)
    faces = [facing(face, sub(_centre(face), _axis_point(middles, _centre(face)[2]))) for face in faces]
    for end, other in ((0, 1), (-1, -2)):
        if caps and profile[end][0] > 1e-6:
            faces.append(facing(flat(sections[end]), (0, 0, profile[end][1] - profile[other][1])))
    return faces


def _centre(face):
    points = [point for point, _ in face]
    return mul(tuple(map(sum, zip(*points))), 1 / len(points))


def _axis_point(middles, height):
    """The lobed shape's axis at a height, between the sections' middles."""
    for low, high in zip(middles, middles[1:]):
        if min(low[2], high[2]) - 1e-9 <= height <= max(low[2], high[2]) + 1e-9 and abs(high[2] - low[2]) > 1e-9:
            share = (height - low[2]) / (high[2] - low[2])
            return add(low, mul(sub(high, low), share))
    return min(middles, key=lambda middle: abs(middle[2] - height))


def turned(kit, profile, x, y, z, sides=10, part='trim', caps=False, smooth=ROUND):
    """A plain turned shape about the upright through (x, y), its ends open unless `caps`: a base, a bell, a bowl;
    faceted when `smooth` is None."""
    return kit.mesh(lobed(profile, 1, 0.0, centre=(x, y, z), sides=sides, caps=caps), part, 'turned', smooth, caps)


def plates(kit, faces, part, name='plates'):
    """Faces that are not a closed solid (plates, inlays, open shells): kept facing as made."""
    return kit.mesh(faces, part, name, 35.0, False)


def polar_sweep(radius_of, profile, steps=96, centre=(0.0, 0.0)):
    """A wall run round a star-shaped outline: `radius_of(turn)` its outer edge, `profile` [(inward, height, part),
    ...] the section's corners, each segment taking the part of its first corner. Gives {part: faces}; u runs round,
    v along the section."""
    cx, cy = centre
    turns = [TAU * step / steps for step in range(steps + 1)]
    rows = []
    for turn in turns:
        reach = radius_of(turn)
        way = (math.cos(turn), math.sin(turn), 0.0)
        rows.append([(cx + (reach - inward) * way[0], cy + (reach - inward) * way[1], height)
                     for inward, height, _ in profile])
    found = {}
    travelled = [0.0]
    for a, b in zip(profile, profile[1:]):
        travelled.append(travelled[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    for index in range(steps):
        middle = (turns[index] + turns[index + 1]) / 2
        way = (math.cos(middle), math.sin(middle), 0.0)
        for j in range(len(profile) - 1):
            ring = [rows[index][j], rows[index + 1][j], rows[index + 1][j + 1], rows[index][j + 1]]
            if len({tuple(round(value, 6) for value in point) for point in ring}) < 3:
                continue
            inward = profile[j + 1][0] - profile[j][0]
            rise = profile[j + 1][1] - profile[j][1]
            # The section runs outside-in over the top, so its outward side is to its right.
            outward = add(mul(way, rise), (0.0, 0.0, inward))
            arc = [math.hypot(*sub(point, (cx, cy, point[2]))[:2]) * turn for point, turn in
                   zip(ring, (turns[index], turns[index + 1], turns[index + 1], turns[index]))]
            uvs = [(arc[k], travelled[j + (k >= 2)]) for k in range(4)]
            face = facing(list(zip(ring, uvs)), outward if length(outward) > 1e-9 else normal_of(ring))
            found.setdefault(profile[j][2], []).append(face)
    return found


def parts_mesh(kit, faces_by_part, name, smooth=35.0):
    """One object of faces sorted by part."""
    return kit.join([kit.mesh(faces, part, name, smooth) for part, faces in faces_by_part.items() if faces], name)


def off_borders(item, layer_name):
    """Moves every flat-mapped face of a bordered part half a tile along its UVs (both ways on a top or an
    underside), so the picture's darker tile edge leaves a piece centred on the origin's lines. Swept and turned
    faces keep theirs: their seams already lie at the back and at the edges. Gives the object."""
    data, layer = item.data, item.data.uv_layers[layer_name]
    names = [slot.material.name if slot.material else None for slot in item.material_slots]
    for polygon in data.polygons:
        if names[polygon.material_index] not in BORDERED:
            continue
        points = [(co.x, -co.y, co.z) for co in (data.vertices[index].co for index in polygon.vertices)]
        loops = list(polygon.loop_indices)
        found = [tuple(layer.data[index].uv) for index in loops]
        flat_up = abs(normal_of(points)[2]) > 0.7072
        expected = planar_uvs(points)
        same = all(abs(u - eu) < 1e-3 and abs(v - ev) < 1e-3 for (u, v), (eu, ev) in zip(found, expected))
        turned_over = all(abs(u + eu) < 1e-3 and abs(v - ev) < 1e-3 for (u, v), (eu, ev) in zip(found, expected))
        if same or turned_over:
            for index in loops:
                u, v = layer.data[index].uv
                layer.data[index].uv = (u + HALF_TILE, v + (HALF_TILE if flat_up else 0.0))
    return item
