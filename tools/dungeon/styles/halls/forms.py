"""The halls' own shapes as plain faces, in shapes.py's form (corners of (point, uv), the dungeon's frame, metres):
mouldings run along a path, turned and fluted shapes, the acanthus leaf of their carving, brass studs, bands and
tubes, the heater shield, flames, candles and braziers, and the floors and slabs of the landmarks. kit.mesh makes
each an object; `made` does it by part.
"""
import math
import random

import details
import shapes
from shapes import add, cross, dot, facing, flat, mul, sub, sweep, unit

UP = (0.0, 0.0, 1.0)
DOWN = (0.0, 0.0, -1.0)
NORTH = (0.0, -1.0, 0.0)
SOUTH = (0.0, 1.0, 0.0)


TILE_M = 3.2
# How near a picture's edge, metres, the trim picture's painted frame runs.
FRAME_M = 0.3


def off_frame(faces):
    """Faces whose UVs would show the trim picture's painted frame moved, axis by axis, to its middle: mouldings are
    narrow, and from u or v 0 they would wear only the frame's band. Their scale stays metres."""
    found = []
    for face in faces:
        uvs = [uv for _, uv in face]
        shift = []
        for axis in (0, 1):
            low, high = min(uv[axis] for uv in uvs), max(uv[axis] for uv in uvs)
            near = low % TILE_M < FRAME_M or (high % TILE_M) > TILE_M - FRAME_M or high - low >= TILE_M - FRAME_M
            near = near or math.floor(low / TILE_M) != math.floor(high / TILE_M)
            shift.append(TILE_M / 2 - (low + high) / 2 if near and high - low < TILE_M else 0.0)
        found.append([(point, (uv[0] + shift[0], uv[1] + shift[1])) for point, uv in face])
    return found


def made(kit, faces_by_part, name='piece', smooth=40.0, drop=()):
    """One object of {part: faces}, each part's faces made as it was built (facing out already), trim kept off its
    picture's frame, less the faces lying on each plane of `drop` ((axis, value): the wall behind, the floor)."""
    found = []
    for part, faces in faces_by_part.items():
        for axis, value in drop:
            faces = hidden(faces, axis, value)
        if faces:
            found.append(kit.mesh(off_frame(faces) if part == 'trim' else faces, part, name, smooth, False))
    return kit.join(found, name)


def arc(cx, cz, radius, start, end, steps, y=0.0):
    """Points (x, y, z) round a circle upright in the plane y, centred (cx, cz), from `start` to `end` degrees (0
    east, 90 up)."""
    turns = [math.radians(start + (end - start) * step / steps) for step in range(steps + 1)]
    return [(cx + radius * math.cos(turn), y, cz + radius * math.sin(turn)) for turn in turns]


def _area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, list(points[1:]) + [points[0]]))


def run(path, profile, normal, inside, closed=False, caps=True):
    """A moulding: `profile` [(out, up), ...] swept along `path` (points in a plane square to `normal`), `out` away
    from the point `inside` and `up` along `normal`, mitred where the path turns. u runs along the path, v round the
    profile. The profile's ends stay open where it meets its wall."""
    normal = unit(normal)
    count = len(path)
    outs = []
    for number in range(count if closed else count - 1):
        a, b = path[number], path[(number + 1) % count]
        out = unit(cross(unit(sub(b, a)), normal))
        outs.append(out if dot(out, sub(mul(add(a, b), 0.5), inside)) >= 0 else mul(out, -1))
    sections = []
    for number, point in enumerate(path):
        before = outs[number - 1] if closed or number > 0 else None
        after = outs[number] if closed or number < count - 1 else None
        if before is None or after is None:
            mitre = before or after
        else:
            mitre = mul(add(before, after), 1 / (1 + dot(before, after)))
        sections.append([add(point, add(mul(mitre, a), mul(normal, b))) for a, b in profile])
    if closed:
        sections.append(sections[0])
    turn = 1 if _area(profile) > 0 else -1
    edges = len(profile) - 1
    found = []
    for index, face in enumerate(sweep(sections, closed=False)):
        segment, edge = divmod(index, edges)
        da, db = (profile[edge + 1][axis] - profile[edge][axis] for axis in (0, 1))
        found.append(facing(face, add(mul(outs[segment], turn * db), mul(normal, -turn * da))))
    if caps and not closed:
        found.append(facing(flat(sections[0]), sub(path[0], path[1])))
        found.append(facing(flat(sections[-1]), sub(path[-1], path[-2])))
    return found


def sides(outline, z0, z1):
    """The upright sides of an outline [(x, y), ...] from z0 to z1, without ends: a shaft, hidden at both. u runs round
    it and v up it, so a stretched shaft keeps its picture's scale."""
    outline = list(outline) if _area(outline) > 0 else list(outline)[::-1]
    sections = [[(x, y, z0) for x, y in outline], [(x, y, z1) for x, y in outline]]

    def outward(points, _):
        edge = sub(points[1], points[0])
        return (edge[1], -edge[0], 0.0)

    return [[(point, (uv[1], uv[0] + z0)) for point, uv in face] for face in sweep(sections, outward=outward)]


def turned(profile, centre, start=0.0, end=360.0, steps=16):
    """A profile [(radius, height), ...] turned about the upright through `centre` from `start` to `end` degrees (0
    east, 90 south), without caps: a half-column's base, a cup. u runs round it, v up the profile."""
    sections = []
    for step in range(steps + 1):
        turn = math.radians(start + (end - start) * step / steps)
        sections.append([add(centre, (math.cos(turn) * r, math.sin(turn) * r, h)) for r, h in profile])
    closed = [(0.0, profile[0][1])] + list(profile) + [(0.0, profile[-1][1])]
    sign = 1 if _area(closed) > 0 else -1
    edges = len(profile) - 1
    found = []
    for index, face in enumerate(sweep(sections, closed=False)):
        step, edge = divmod(index, edges)
        turn = math.radians(start + (end - start) * (step + 0.5) / steps)
        dr, dh = (profile[edge + 1][axis] - profile[edge][axis] for axis in (0, 1))
        found.append(facing(face, (math.cos(turn) * sign * dh, math.sin(turn) * sign * dh, -sign * dr)))
    return found


def octagon(radius, flute=0.0, depth=0.0, steps=4, first=0, last=8):
    """An octagon's outline [(x, y), ...] of corner radius `radius`, its faces square to the axes and the diagonals,
    each with a flute `flute` wide and `depth` deep down its middle; faces `first` to `last` (0 faces east, counting
    toward south), so a half-column takes 4 of them."""
    corners = [(radius * math.cos(math.radians(-22.5 + 45 * k)), radius * math.sin(math.radians(-22.5 + 45 * k)))
               for k in range(9)]
    points = []
    for k in range(first, last):
        a, b = corners[k], corners[k + 1]
        points.append(a)
        if flute:
            middle = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            along = unit((b[0] - a[0], b[1] - a[1], 0.0))
            inward = unit((-middle[0], -middle[1], 0.0))
            for step in range(steps + 1):
                share = step / steps
                offset, sink = (share - 0.5) * flute, depth * math.sin(math.pi * share)
                points.append((middle[0] + along[0] * offset + inward[0] * sink,
                               middle[1] + along[1] * offset + inward[1] * sink))
    if last - first < 8:
        points.append(corners[last])
    return points


def leaf(base, out, height, width, lean=0.3, curl=0.2, rows=3, up=UP):
    """A stiff acanthus leaf rising `height` from `base` along `up`, its face toward `out`, leaning out by `lean` of
    its height and its tip curling over by `curl`: the halls' carved foliage. One-sided, its edges folding back from a
    raised midrib, for it is seen only from before the stone it grows on."""
    out, up = unit(out), unit(up)
    across = unit(cross(up, out))
    middles = []
    for row in range(rows + 1):
        share = row / rows
        rise, reach = height * share, lean * height * share * share
        if share > 0.5:
            bend = (share - 0.5) / 0.5
            reach += curl * height * bend
            rise -= curl * height * bend * bend * 0.9
        middles.append(add(base, add(mul(up, rise), mul(out, reach))))
    rings, faces_out = [], []
    for row, middle in enumerate(middles):
        share = row / rows
        tangent = unit(sub(middles[min(row + 1, rows)], middles[max(row - 1, 0)]))
        face_out = unit(cross(across, tangent))
        half = 0.5 * width * (0.8 + 0.3 * math.sin(math.pi * share)) * (1 - share ** 3)
        fold = 0.22 * half
        rings.append([add(middle, add(mul(across, -half), mul(face_out, -fold))),
                      add(middle, mul(face_out, 0.15 * fold + 0.004)),
                      add(middle, add(mul(across, half), mul(face_out, -fold)))])
        faces_out.append(face_out)
    return [facing(flat([rings[row][k], rings[row][k + 1], rings[row + 1][k + 1], rings[row + 1][k]]), faces_out[row])
            for row in range(rows) for k in (0, 1)]


def hidden(faces, axis, value, tolerance=0.002):
    """The faces less those lying flat on the plane where `axis` ('x', 'y' or 'z') is `value`: a back against a wall,
    an underside on the floor, a top against the ceiling, which nobody sees."""
    index = 'xyz'.index(axis)
    return [face for face in faces if any(abs(point[index] - value) > tolerance for point, _ in face)]


def stud(centre, toward, radius=0.02, height=0.014, sides=5):
    """A domed stud standing `height` from a surface at `centre` toward `toward`: the halls' brass nail heads. Its
    foot, on the surface, is left open."""
    return shapes.revolve([(radius, 0.0), (radius * 0.7, height * 0.6), (0.0, height)], centre, toward, sides)[:-1]


def tube(points, radius, sides=6, step=None):
    """A round bar along a path, capped at its ends: a rod, a rim, a scroll's curl, a hook."""
    return details.rope(points, radius, sides, strands=0, step=step or max(radius * 3, 0.04))


def band(points, toward, width, thick):
    """A flat band `width` wide and `thick` deep laid along a path, its face toward `toward` (a direction, or a
    function of the point): a strap, a chevron on a shield."""
    sections = []
    for number, point in enumerate(points):
        tangent = unit(sub(points[min(number + 1, len(points) - 1)], points[max(number - 1, 0)]))
        normal = toward(point) if callable(toward) else toward
        side = unit(cross(normal, tangent))
        normal = unit(cross(tangent, side))
        half, lift = mul(side, width / 2), mul(normal, thick)
        sections.append([sub(point, half), add(point, half), add(add(point, half), lift),
                         add(sub(point, half), lift)])
    middles = [shapes._centre(section) for section in sections]
    faces = sweep(sections, outward=shapes.out_from(middles))
    faces.append(facing(flat(sections[0]), sub(middles[0], middles[1])))
    faces.append(facing(flat(sections[-1]), sub(middles[-1], middles[-2])))
    return faces


def heater_half(width, height, depth):
    """The half-width of a heater shield `width` by `height` at `depth` below its top edge: straight sides for its
    upper third, then arcs to its point."""
    shoulder = 0.35 * height
    if depth <= shoulder:
        return width / 2
    radius = (width * width / 4 + (height - shoulder) ** 2) / width
    below = min(depth - shoulder, radius)
    return max(0.0, width / 2 - radius + math.sqrt(max(radius * radius - below * below, 0.0)))


def shield(x, y, top, width, height, bulge, rows=7, columns=6):
    """A heater shield hung square to y, its face bulging `bulge` toward +y: {'face': its front, 'back': a flat back
    and edge} and the rim's path round its edge, for an iron tube."""
    def at(column, row):
        depth = height * row / rows
        half = heater_half(width, height, depth)
        across = -half + 2 * half * column / columns
        return (x + across, y + bulge * (1 - (across / (width / 2)) ** 2), top - depth)

    grid = [[at(column, row) for column in range(columns + 1)] for row in range(rows + 1)]
    front = [facing(flat([grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]]), SOUTH)
             for r in range(rows) for c in range(columns)]
    rim = [grid[r][0] for r in range(rows, -1, -1)] + [grid[0][c] for c in range(1, columns + 1)]
    rim += [grid[r][columns] for r in range(1, rows + 1)]
    back_ring = [(px, y - 0.012, pz) for px, _, pz in rim[:-1]]
    back = [facing(flat(back_ring), NORTH)]
    for a, b in zip(rim[:-1], rim[1:]):
        flat_a, flat_b = (a[0], y - 0.012, a[2]), (b[0], y - 0.012, b[2])
        middle = mul(add(a, b), 0.5)
        back.append(facing(flat([a, b, flat_b, flat_a]), sub(middle, (x, middle[1], top - height * 0.45))))
    return {'face': front, 'back': back}, rim


def flame(x, y, z, height, radius, lean=(0.0, 0.0), sides=5):
    """A flame's tongue standing from (x, y, z): swelling above its root, then thinning to a tip that leans by `lean`
    (x, y) and flickers aside on the way: a candle's, a brazier's, a hearth's."""
    across = unit((-lean[1], lean[0], 0.0)) if abs(lean[0]) + abs(lean[1]) > 1e-9 else (1.0, 0.0, 0.0)
    sections, middles = [], []
    for row, swell in enumerate((0.55, 1.0, 0.85, 0.55, 0.25, 0.0)):
        share = row / 5
        flicker = 0.35 * radius * math.sin(2 * math.pi * share)
        middle = (x + lean[0] * share * share + across[0] * flicker, y + lean[1] * share * share + across[1] * flicker,
                  z + height * share)
        sections.append([(middle[0] + radius * swell * math.cos(math.tau * k / sides),
                          middle[1] + radius * swell * math.sin(math.tau * k / sides), middle[2])
                         for k in range(sides)])
        middles.append(middle)
    return sweep(sections, outward=shapes.out_from(middles))


def candle(x, y, z, height, radius=0.022, lit=True, sides=6):
    """A candle standing on (x, y, z): {'wax': its stick, worn at its top, 'glow': its flame if lit}."""
    wax = shapes.revolve([(radius, 0.0), (radius, height * 0.9), (radius * 0.7, height), (0.0, height * 0.97)],
                         (x, y, z), UP, sides)
    lights = flame(x, y, z + height * 0.97, 0.07, radius * 0.6) if lit else []
    return {'wax': wax, 'glow': lights}


def ground(x0, y0, x1, y1, z=0.0):
    """A floor's face, one quad over a rectangle at z: a landmark's floor wherever nothing stands on it."""
    return [facing(flat([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]), UP)]


def slab(x0, y0, x1, y1, top, chamfer=0.012, low=0.0):
    """A block from z `low` to `top`, its top edges chamfered, without an underside: a flagstone, a step, a hearth."""
    inner = [(x0 + chamfer, y0 + chamfer), (x1 - chamfer, y0 + chamfer), (x1 - chamfer, y1 - chamfer),
             (x0 + chamfer, y1 - chamfer)]
    outer = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    middle = ((x0 + x1) / 2, (y0 + y1) / 2, low)
    faces = [facing(flat([(x, y, top) for x, y in inner]), UP)]
    for k in range(4):
        after = (k + 1) % 4
        edge = [(*outer[k], top - chamfer), (*outer[after], top - chamfer)]
        out = sub(mul(add(edge[0], edge[1]), 0.5), middle)
        faces.append(facing(flat([(*inner[k], top), (*inner[after], top), edge[1], edge[0]]), (out[0], out[1], 0.5)))
        faces.append(facing(flat([edge[0], edge[1], (*outer[after], low), (*outer[k], low)]), (out[0], out[1], 0.0)))
    return faces


def grain(faces):
    """Faces with u and v swapped: the timber picture's grain runs along u, and a plank's, a round log's or an
    upright leg's own UVs run v along the wood."""
    return [[(point, (uv[1], uv[0])) for point, uv in face] for face in faces]


def moved(faces, place):
    """Faces with each point put through `place` (a function of a point), UVs kept: a piece built flat and laid
    tilted, sheared or turned where it fell."""
    return [[(place(point), uv) for point, uv in face] for face in faces]


def brazier(x, y, z, seed, bowl=0.27, height=0.62):
    """A brazier standing on z: three splayed iron legs braced by a ring, a brass bowl heaped with glowing coals and
    flames rising from them. {part: faces}"""
    draw = random.Random(seed)
    top = z + height
    found = {'iron': shapes.ring((x, y, z + height * 0.32), bowl * 0.62, 0.01, UP, 8, 3), 'ember': [], 'glow': []}
    for leg in range(3):
        turn = math.radians(90 + 120 * leg)
        way = (math.cos(turn), math.sin(turn))
        points = [(x + way[0] * bowl * share, y + way[1] * bowl * share, z + rise)
                  for share, rise in ((0.95, 0.0), (0.6, height * 0.5), (0.62, height - 0.1))]
        found['iron'] += tube(points, 0.016, 4, 0.25)
    cup = [(0.0, -0.13), (0.14, -0.12), (bowl * 0.88, -0.05), (bowl, 0.02), (bowl + 0.02, 0.04),
           (bowl - 0.01, 0.045), (bowl - 0.03, 0.02)]
    found['brass'] = turned(cup, (x, y, top), 0, 360, 10)
    found['ember'] = turned([(bowl - 0.03, 0.02), (bowl * 0.55, 0.06), (0.0, 0.075)], (x, y, top), 0, 360, 10)
    for _ in range(5):
        turn = draw.uniform(0, math.tau)
        reach = draw.uniform(0.0, bowl * 0.55)
        found['glow'] += flame(x + reach * math.cos(turn), y + reach * math.sin(turn), top + 0.04,
                               draw.uniform(0.28, 0.5), draw.uniform(0.06, 0.09),
                               (draw.uniform(-0.04, 0.04), draw.uniform(-0.04, 0.04)))
    return found


def merge(*dicts):
    """{part: faces} dicts joined part by part."""
    found = {}
    for each in dicts:
        for part, faces in each.items():
            found[part] = found.get(part, []) + faces
    return found
