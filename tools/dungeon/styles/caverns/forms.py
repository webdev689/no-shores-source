"""The caverns' own forms as faces (shapes.py's: corners of (point, uv), the dungeon's frame, metres): seeded smooth
noise, shapes turned round an upright whose radius follows the turn (flutes, lobes, a lean), crystals, broken
boulders, pebbles, mushrooms, a rock rim round an opening, and the tests that keep a candidate inside its envelope.
Nothing is laid by hand: every form is grown, dripped or broken from a seed.
"""
import math
import random

import bpy

import catalog
import envelope
from details import _icosphere, box_uvs
from shapes import TAU, _centre, add, cross, dot, facing, flat, length, mul, normal_of, revolve, sub, sweep, unit


class Noise:
    """Smooth value noise in three dimensions, from a seed: about -1..1, its fbm about -0.5..0.5."""

    def __init__(self, seed):
        draw = random.Random(f'noise {seed}')
        order = list(range(256))
        draw.shuffle(order)
        self.order = order + order
        self.values = [draw.uniform(-1.0, 1.0) for _ in range(256)]

    def _corner(self, i, j, k):
        order = self.order
        return self.values[order[order[order[i & 255] + (j & 255)] + (k & 255)]]

    def __call__(self, x, y=0.0, z=0.0):
        xi, yi, zi = math.floor(x), math.floor(y), math.floor(z)
        sx, sy, sz = (f * f * f * (f * (f * 6 - 15) + 10) for f in (x - xi, y - yi, z - zi))
        planes = []
        for a in (0, 1):
            rows = []
            for b in (0, 1):
                low, high = self._corner(xi + a, yi + b, zi), self._corner(xi + a, yi + b, zi + 1)
                rows.append(low + (high - low) * sz)
            planes.append(rows[0] + (rows[1] - rows[0]) * sy)
        return planes[0] + (planes[1] - planes[0]) * sx

    def fbm(self, x, y=0.0, z=0.0, octaves=3):
        total, amount, scale, norm = 0.0, 1.0, 1.0, 0.0
        for octave in range(octaves):
            total += amount * self(x * scale + 17.31 * octave, y * scale - 5.7 * octave, z * scale)
            norm += amount
            amount *= 0.5
            scale *= 2.03
        return total / norm


def ease_under(value, limit, knee=0.03):
    """`value` kept under `limit`, easing toward it over the last `knee` metres: a lump flattens against a limit
    instead of being cut off square."""
    start = limit - knee
    return value if value <= start else limit - knee * math.exp(-(value - start) / knee)


def ease_over(value, limit, knee=0.03):
    """`value` kept over `limit`, easing as ease_under does."""
    return -ease_under(-value, -limit, knee)


def turned(profile, radius_at=None, sides=16, centre=(0.0, 0.0), lean=None):
    """A profile [(radius, z), ...] turned round the upright through `centre` (x, y): each point's radius is
    `radius_at(turn, z, radius)` (turn in radians, from north rightward) and the axis is moved by `lean(z)` (dx, dy).
    u runs round it, v along the profile; a radius of 0 closes it to a point."""
    def axis_at(z):
        dx, dy = lean(z) if lean else (0.0, 0.0)
        return centre[0] + dx, centre[1] + dy

    sections = []
    for step in range(sides + 1):
        turn = TAU * (step % sides) / sides
        section = []
        for radius, z in profile:
            reach = radius_at(turn, z, radius) if radius_at else radius
            x, y = axis_at(z)
            section.append((x + reach * math.sin(turn), y - reach * math.cos(turn), z))
        sections.append(section)

    def outward(points, _):
        middle = _centre(points)
        return sub(middle, (*axis_at(middle[2]), middle[2]))

    return sweep(sections, closed=False, outward=outward)


def flutes(seed, count, irregular=0.6):
    """A turn's share of a flute (0 in a groove, 1 on a crest), the flutes `count` round and unevenly spaced: the
    ribs flowstone leaves running down a column."""
    draw = random.Random(f'flutes {seed}')
    shifts = [(draw.randint(1, 3), draw.uniform(0, TAU), draw.uniform(0.3, 1.0) * irregular) for _ in range(3)]

    def share(turn):
        phase = count * turn + sum(amount * math.sin(wave * turn + offset) for wave, offset, amount in shifts)
        return (0.5 + 0.5 * math.cos(phase)) ** 0.6
    return share


def _square_to(axis):
    first = unit(cross(axis, (0.0, 0.0, 1.0) if abs(axis[2]) < 0.9 else (1.0, 0.0, 0.0)))
    return first, cross(axis, first)


def _out_from_axis(base, axis):
    def outward(points):
        middle = _centre(points)
        return sub(middle, add(base, mul(axis, dot(sub(middle, base), axis))))
    return outward


def crystal(base, axis, radius, size, draw, sides=6, point=0.3, ends=1):
    """A crystal from `base` along `axis`, `size` long: a prism of `sides` uneven faces ending in a point about `point`
    of its length, a little off its middle; with `ends` 2 pointed at both ends (a loose shard), else open at its foot
    (it grows out of rock)."""
    axis = unit(axis)
    first, second = _square_to(axis)
    start = draw.uniform(0, TAU)
    spokes = [add(mul(first, math.cos(start + TAU * k / sides)), mul(second, math.sin(start + TAU * k / sides)))
              for k in range(sides)]
    reaches = [radius * draw.uniform(0.8, 1.15) for _ in range(sides)]
    cut = size * point * draw.uniform(0.75, 1.25)
    low_at = cut if ends == 2 else 0.0

    def ring(along, shrink):
        return [add(add(base, mul(axis, along)), mul(spoke, reach * shrink)) for spoke, reach in zip(spokes, reaches)]

    def apex(along):
        aside = add(mul(first, draw.uniform(-0.25, 0.25) * radius), mul(second, draw.uniform(-0.25, 0.25) * radius))
        return add(add(base, mul(axis, along)), aside)

    low, high = ring(low_at, 1.0), ring(size - cut, draw.uniform(0.85, 1.0))
    outward = _out_from_axis(base, axis)
    faces = []
    for k in range(sides):
        j = (k + 1) % sides
        points = [low[k], low[j], high[j], high[k]]
        faces.append(facing(flat(points), outward(points)))
    tips = [(high, apex(size))] + ([(low, apex(0.0))] if ends == 2 else [])
    for edge, tip in tips:
        for k in range(sides):
            points = [edge[k], edge[(k + 1) % sides], tip]
            faces.append(facing(flat(points), outward(points)))
    return faces


def boulder(centre, radii, seed, detail=2, rough=0.3, grain=1.3, cuts=0, floor=None, limit=None):
    """A boulder round `centre`, `radii` (x, y, z) before its lumps: an icosphere pushed in and out by smooth seeded
    noise up to `rough` of its size, and with `cuts` broken off flat. Below `floor` it is flattened and the faces lying
    there (hidden on the ground) left out; `limit(point)` gives each point kept inside an envelope."""
    noise = Noise(seed)
    draw = random.Random(f'boulder {seed}')
    planes = [(unit((draw.uniform(-1, 1), draw.uniform(-1, 1), draw.uniform(-0.6, 1))), draw.uniform(0.62, 0.85))
              for _ in range(cuts)]
    points, faces = _icosphere(detail)
    placed = []
    for direction in points:
        reach = 1 + rough * 1.6 * noise.fbm(*(value * grain for value in direction))
        for normal, offset in planes:
            toward = dot(direction, normal)
            if toward > 1e-6:
                reach = min(reach, offset / toward)
        point = tuple(centre[axis] + direction[axis] * radii[axis] * reach for axis in range(3))
        if floor is not None:
            point = (point[0], point[1], max(point[2], floor))
        placed.append(limit(point) if limit else point)
    found = []
    for face in faces:
        ring = [placed[index] for index in face]
        if floor is not None and all(point[2] <= floor + 1e-4 for point in ring):
            continue
        found.append(facing(list(zip(ring, box_uvs(ring))), sub(_centre(ring), centre)))
    return found


def pebble(x, y, size, height, draw, z=0.0, corners=7, rounded=True):
    """A pebble lying on z: a low uneven dome `size` across and `height` high (`rounded`, else a chip with one
    point), with no underside."""
    turn = draw.uniform(0, TAU)
    stretch = draw.uniform(0.6, 1.0)
    reaches = [draw.uniform(0.75, 1.0) for _ in range(corners)]

    def spot(share, k, lift):
        angle = turn + TAU * k / corners
        reach = size / 2 * reaches[k] * share
        return (x + reach * math.cos(angle), y + reach * math.sin(angle) * stretch, z + lift)

    rings = [[spot(1.0, k, 0.0) for k in range(corners)]]
    if rounded:
        rings.append([spot(0.66, k, height * draw.uniform(0.6, 0.85)) for k in range(corners)])
    top = (x + draw.uniform(-0.15, 0.15) * size, y + draw.uniform(-0.15, 0.15) * size, z + height)
    below = (x, y, z - height)
    faces = []
    for k in range(corners):
        j = (k + 1) % corners
        bands = [[low[k], low[j], high[j], high[k]] for low, high in zip(rings, rings[1:])]
        for ring in bands + [[rings[-1][k], rings[-1][j], top]]:
            faces.append(facing(list(zip(ring, box_uvs(ring))), sub(_centre(ring), below)))
    return faces


def rod(start, end, radius_start, radius_end, sides=5):
    """A rod from `start` to `end` with no ends (they are buried): a stem, a handle. u runs round it, v along."""
    axis = sub(end, start)
    return revolve([(radius_start, 0.0), (radius_end, length(axis))], start, axis, sides)[:sides]


def mushroom(foot, height, cap, draw, lean=(0.0, 0.0)):
    """A mushroom from `foot`: a pale stem `height` tall, leaning by `lean`, under a cap `cap` across.
    Gives {'bone': stem, 'fungus': cap}."""
    top = (foot[0] + lean[0], foot[1] + lean[1], foot[2] + height)
    stem = cap * draw.uniform(0.14, 0.22)
    half = cap / 2
    rise = half * draw.uniform(0.35, 0.8)
    profile = [(stem * 0.8, -half * 0.1), (half, 0.0), (half * 0.55, rise * 0.85), (0.0, rise)]
    return {'bone': rod(foot, top, stem * 1.2, stem * 0.85, 4), 'fungus': revolve(profile, top, sub(top, foot), 7)}


def cull(faces, hidden):
    """Faces someone may see: a face whose every corner is `hidden(point)` (in rock, under the floor) goes."""
    return [face for face in faces if not all(hidden(point) for point, _ in face)]


def bracket(point, out, width, draw):
    """A shelf fungus from `point` on a rock face, reaching `width` along `out` (level): two stacked half-discs."""
    out = unit((out[0], out[1], 0.0))
    side = (-out[1], out[0], 0.0)
    faces = []
    for lift, share, thick in ((0.0, 1.0, width * 0.16), (width * 0.12, 0.7, width * 0.1)):
        outline = []
        for k in range(9):
            angle = -math.pi / 2 + math.pi * k / 8
            reach = width * share * draw.uniform(0.85, 1.05)
            outline.append(add(add(point, mul(out, reach * math.cos(angle) - width * 0.15)),
                               mul(side, reach * 0.8 * math.sin(angle))))
        low = [(p[0], p[1], p[2] + lift) for p in outline]
        high = [(p[0], p[1], p[2] + lift + thick) for p in outline]
        middle = add(_centre(low), (0.0, 0.0, thick / 2))
        for k in range(len(outline) - 1):
            ring = [low[k], low[k + 1], high[k + 1], high[k]]
            faces.append(facing(flat(ring), sub(_centre(ring), middle)))
        faces.append(facing(flat(high), (0.0, 0.0, 1.0)))
        faces.append(facing(flat(low), (0.0, 0.0, -1.0)))
    return faces


def rim(path, width, y0, y1, seed, rings=12, rough=0.07, grain=2.2, limit=None, step=0.12):
    """Rock round an opening: `path` is the opening's edge [(x, z), ...] from its left foot round to its right, and
    the rock reaches `width(share)` out from it (share 0..1 along it), from y0 to y1, worn by noise and broken along
    sharp crests. The edge itself is kept: nothing reaches into the opening. UVs by a box's projection, as rock."""
    noise, crags = Noise(seed), Noise(f'{seed} crags')
    travelled = [0.0]
    for a, b in zip(path, path[1:]):
        travelled.append(travelled[-1] + math.dist(a, b))
    total = travelled[-1]
    count = max(2, round(total / step))
    middle_y, half_y = (y0 + y1) / 2, (y1 - y0) / 2
    sections = []
    for number in range(count + 1):
        distance = total * number / count
        index = max(1, min(next((i for i, t in enumerate(travelled) if t >= distance), len(path) - 1), len(path) - 1))
        a, b = path[index - 1], path[index]
        share_in = (distance - travelled[index - 1]) / max(travelled[index] - travelled[index - 1], 1e-9)
        x, z = a[0] + (b[0] - a[0]) * share_in, a[1] + (b[1] - a[1]) * share_in
        tx, tz = unit((b[0] - a[0], 0.0, b[1] - a[1]))[0::2]
        out = (-tz, tx)
        reach = width(number / count)
        section = []
        for k in range(rings):
            angle = TAU * k / rings
            c, s = math.cos(angle), math.sin(angle)
            across = reach / 2 * (1 - math.copysign(abs(c) ** (2 / 3), c))
            deep = middle_y + half_y * math.copysign(abs(s) ** (2 / 3), s)
            point = (x + out[0] * across, deep, z + out[1] * across)
            scaled = [value * grain for value in point]
            bump = rough * (1.6 * noise.fbm(*scaled) + 0.9 * (0.35 - abs(crags(*(value * 0.7 for value in scaled)))))
            across = ease_over(across + bump * (1 - c) * 0.5 + bump * 0.6, 0.012, 0.03)
            deep = deep + bump * s * 0.8
            point = (x + out[0] * across, deep, z + out[1] * across)
            section.append(limit(point) if limit else point)
        sections.append(section)
    middles = [_centre(section) for section in sections]
    faces = sweep(sections, outward=lambda points, i: sub(_centre(points), mul(add(middles[i], middles[i + 1]), 0.5)))
    return [list(zip(points, box_uvs(points))) for points in ([point for point, _ in face] for face in faces)]


def ground(x0, y0, x1, y1, step, height_at):
    """A floor from (x0, y0) to (x1, y1) of quads about `step` across, each point raised by `height_at(x, y)`."""
    columns, rows = max(1, round((x1 - x0) / step)), max(1, round((y1 - y0) / step))
    xs = [x0 + (x1 - x0) * i / columns for i in range(columns + 1)]
    ys = [y0 + (y1 - y0) * j / rows for j in range(rows + 1)]
    faces = []
    for i in range(columns):
        for j in range(rows):
            ring = [(x, y, height_at(x, y)) for x, y in ((xs[i], ys[j]), (xs[i], ys[j + 1]), (xs[i + 1], ys[j + 1]),
                                                         (xs[i + 1], ys[j]))]
            faces.append(facing(flat(ring), (0.0, 0.0, 1.0)))
    return faces


def fan(middle, outline, rings=2):
    """A flat-ish sheet from `middle` (x, y, z) out to `outline` (points round it, star-shaped from it), facing up:
    still water, a mat of fungus."""
    layers = [[add(middle, mul(sub(point, middle), share)) for point in outline]
              for share in (k / rings for k in range(1, rings + 1))]
    faces = []
    for k in range(len(outline)):
        j = (k + 1) % len(outline)
        faces.append(facing(flat([middle, layers[0][k], layers[0][j]]), (0.0, 0.0, 1.0)))
        for inner, outer in zip(layers, layers[1:]):
            faces.append(facing(flat([inner[k], outer[k], outer[j], inner[j]]), (0.0, 0.0, 1.0)))
    return faces


def _hit(origin, direction, a, b, c):
    """How far along a ray it meets a triangle, or None (Moller and Trumbore's test)."""
    edge, other = sub(b, a), sub(c, a)
    across = cross(direction, other)
    det = dot(edge, across)
    if abs(det) < 1e-12:
        return None
    offset = sub(origin, a)
    u = dot(offset, across) / det
    turned_edge = cross(offset, edge)
    v = dot(direction, turned_edge) / det
    distance = dot(other, turned_edge) / det
    return distance if u >= 0 and v >= 0 and u + v <= 1 and distance > 0 else None


def cast(faces, origin, direction):
    """The nearest point where a ray from `origin` along `direction` meets the faces, and that face's outward
    direction, or None."""
    direction = unit(direction)
    best = None
    for face in faces:
        points = [point for point, _ in face]
        for k in range(1, len(points) - 1):
            found = _hit(origin, direction, points[0], points[k], points[k + 1])
            if found is not None and (best is None or found < best[0]):
                best = (found, points)
    if best is None:
        return None
    return add(origin, mul(direction, best[0])), normal_of(best[1])


def triangles_of(faces):
    """Faces as triangles of three points, fanned from each face's first corner."""
    found = []
    for face in faces:
        points = [point for point, _ in face]
        found += [(points[0], points[k], points[k + 1]) for k in range(1, len(points) - 1)]
    return found


def kit_fits(faces, piece, style='caverns', height=None):
    """Whether faces keep a kit piece's envelope."""
    rules = envelope.kit_rules(piece, catalog.least_ceiling(style), height or 0.0)
    triangles = triangles_of(faces)
    return not any(envelope.reaches(corners, box) for _, box in rules for corners in triangles)


def landmark_fits(faces, landmark):
    """Whether faces keep a landmark's walk zone, footprint and height."""
    triangles = triangles_of(faces)
    loose, spans = envelope.walk_zone(triangles, landmark)
    width, depth = (cells * catalog.CELL_M for cells in landmark['cells'])
    top = catalog.least_ceiling(landmark['style']) - 0.1
    inside = all(-0.001 <= x <= width + 0.001 and -0.001 <= y <= depth + 0.001 and z <= top
                 for corners in triangles for x, y, z in corners)
    return inside and not loose and not spans


def make(kit, parts, name, smooth=50.0):
    """One object of faces by part ({part: faces}), each part's faces sharing points where they meet."""
    made = [kit.mesh(faces, part, f'{name}.{part}', smooth, False) for part, faces in parts.items() if faces]
    return kit.join(made, name)


def paint(item, choose):
    """Puts each face of an object in the part `choose(middle, normal)` gives (the dungeon's frame), keeping its
    shared points, so smooth shading runs on across the parts: streaks down flowstone, a seam through rock."""
    names, picks = [], []
    for polygon in item.data.polygons:
        (x, y, z), (nx, ny, nz) = polygon.center, polygon.normal
        part = choose((x, -y, z), (nx, -ny, nz))
        if part not in names:
            names.append(part)
        picks.append(names.index(part))
    item.data.materials.clear()
    for part in names:
        item.data.materials.append(bpy.data.materials.get(part) or bpy.data.materials.new(part))
    for polygon, index in zip(item.data.polygons, picks):
        polygon.material_index = index
    return item


def gather(*groups):
    """Faces by part from many {part: faces} groups or (part, faces) pairs, merged."""
    found = {}
    for group in groups:
        pairs = group.items() if isinstance(group, dict) else [group]
        for part, faces in pairs:
            found.setdefault(part, []).extend(faces)
    return found
