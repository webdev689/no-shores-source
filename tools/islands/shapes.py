"""The kit's shapes as plain faces, without Blender: each shape a list of faces, a face its corners in order round
it, a corner a point (x, y, z) in the island module's frame and its UV (u, v) in metres. kit/ makes each an object.

Faces wind by the right-hand rule in the module's numbers, facing out. UVs, metres (a picture covers 3.2): a flat
face by its own plane, u rightward as one faces it and v up it (a top or a floor by x, and v north); a sweep (a
cylinder, cone or lathe round its axis, a ring, an arch, a rope) u along the sweep and v along its profile, so a
cylinder's u runs round it and its v up it. Seams lie at the back (-y) or in a hollow.
"""
import math
import random

TAU = 2 * math.pi


def add(a, b):
    return tuple(p + q for p, q in zip(a, b))


def sub(a, b):
    return tuple(p - q for p, q in zip(a, b))


def mul(a, factor):
    return tuple(p * factor for p in a)


def dot(a, b):
    return sum(p * q for p, q in zip(a, b))


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def length(a):
    return math.sqrt(dot(a, a))


def unit(a):
    size = length(a)
    return mul(a, 1 / size) if size > 1e-12 else (0.0, 0.0, 0.0)


def normal_of(points):
    """A polygon's normal by Newell's sum: sound for a bent or concave one."""
    total = [0.0, 0.0, 0.0]
    for index, here in enumerate(points):
        after = points[(index + 1) % len(points)]
        total[0] += (here[1] - after[1]) * (here[2] + after[2])
        total[1] += (here[2] - after[2]) * (here[0] + after[0])
        total[2] += (here[0] - after[0]) * (here[1] + after[1])
    return unit(tuple(total))


def planar_uvs(points, normal=None):
    """UVs of a flat face by its own plane, metres: u rightward as one faces it, v up it; a face looking mostly up or
    down by x, and v north."""
    normal = normal or normal_of(points)
    if abs(normal[2]) > 0.7072:
        return [(x, -y) for x, y, _ in points]
    across = unit((normal[1], -normal[0], 0.0))
    up = cross(across, normal)
    return [(dot(point, across), dot(point, up)) for point in points]


def flat(points, normal=None):
    """One flat face with UVs by its plane."""
    return list(zip(points, planar_uvs(points, normal)))


def facing(face, direction):
    """The face, its corners reversed if it does not face along `direction`."""
    points = [point for point, _ in face]
    return face if dot(normal_of(points), direction) >= 0 else face[::-1]


def polygon(points):
    """A one-sided flat face through 3 or more points, facing by the right-hand rule: a pool's water, a sheet."""
    return [flat([tuple(point) for point in points])]


def box(x0, y0, z0, x1, y1, z1):
    """A box between two corners, its faces flat."""
    (x0, x1), (y0, y1), (z0, z1) = sorted((x0, x1)), sorted((y0, y1)), sorted((z0, z1))
    corner = {(i, j, k): (x1 if i else x0, y1 if j else y0, z1 if k else z0)
              for i in (0, 1) for j in (0, 1) for k in (0, 1)}
    sides = [[(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)], [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],
             [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)], [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)],
             [(0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)], [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]]
    return [flat([corner[key] for key in side]) for side in sides]


def bevelled_box(x0, y0, z0, x1, y1, z1, bevel=0.03, wear=0.0, seed=None, draw=None):
    """A box between two corners with every edge chamfered by `bevel` metres. With `wear`, each point sinks inward by
    up to `wear` on each axis, seeded by `seed` (or `draw`, a random source): a worn block, inside its corners."""
    draw = draw or random.Random(str(seed) if seed is not None else repr((x0, y0, z0, x1, y1, z1, bevel, wear)))
    (x0, x1), (y0, y1), (z0, z1) = sorted((x0, x1)), sorted((y0, y1)), sorted((z0, z1))
    middle = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    half = ((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)
    cut = min(bevel, *(value * 0.49 for value in half))
    if cut <= 0:
        return box(x0, y0, z0, x1, y1, z1)
    signs = [(i, j, k) for i in (-1, 1) for j in (-1, 1) for k in (-1, 1)]
    point = {}
    for sign in signs:
        for face_axis in range(3):
            offset = [sign[axis] * (half[axis] - (0 if axis == face_axis else cut)) for axis in range(3)]
            if wear:
                offset = [value - math.copysign(draw.uniform(0, wear), value) for value in offset]
            point[sign, face_axis] = add(middle, offset)
    faces = []
    for axis in range(3):
        others = [other for other in range(3) if other != axis]
        for side in (-1, 1):
            ring = []
            for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                sign = [0, 0, 0]
                sign[axis], sign[others[0]], sign[others[1]] = side, a, b
                ring.append(point[tuple(sign), axis])
            faces.append(ring)
        # The chamfer along `axis`: between the faces of the two other axes, at each pair of their sides.
        for a in (-1, 1):
            for b in (-1, 1):
                ends = []
                for along in (-1, 1):
                    sign = [0, 0, 0]
                    sign[axis], sign[others[0]], sign[others[1]] = along, a, b
                    ends.append(tuple(sign))
                faces.append([point[ends[0], others[0]], point[ends[1], others[0]], point[ends[1], others[1]],
                              point[ends[0], others[1]]])
    faces += [[point[sign, 0], point[sign, 1], point[sign, 2]] for sign in signs]
    return [facing(flat(ring), sub(_centre(ring), middle)) for ring in faces]


def _centre(points):
    return mul(tuple(map(sum, zip(*points))), 1 / len(points))


def sweep(sections, closed=True, outward=None):
    """The faces between successive sections (lists of points of one length): u along the sweep, each corner's own
    distance travelled, v round or along the section. `closed`: the section's last point joins its first, the seam
    there. `outward(points, i)` gives a face's outward direction; without it, faces wind (i, j) (i, j + 1)
    (i + 1, j + 1) (i + 1, j), as a cylinder round its axis does with its profile running up it."""
    if closed:
        sections = [list(section) + [section[0]] for section in sections]
    count = len(sections[0])
    along = [[0.0] * count]
    for before, here in zip(sections, sections[1:]):
        along.append([travelled + length(sub(b, a)) for travelled, a, b in zip(along[-1], before, here)])
    faces = []
    for i in range(len(sections) - 1):
        rounds = [[0.0], [0.0]]
        for side, section in enumerate((sections[i], sections[i + 1])):
            for a, b in zip(section, section[1:]):
                rounds[side].append(rounds[side][-1] + length(sub(b, a)))
        for j in range(count - 1):
            keys = ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))
            corners = [(sections[a][b], (along[a][b], rounds[a - i][b])) for a, b in keys]
            # A pole (a point the sweep does not move) takes the middle of the u across from it.
            for pole, across in (((0, 3), (1, 2)), ((1, 2), (0, 3))):
                if length(sub(corners[pole[0]][0], corners[pole[1]][0])) < 1e-9:
                    middle = (corners[across[0]][1][0] + corners[across[1]][1][0]) / 2
                    for at in pole:
                        corners[at] = (corners[at][0], (middle, corners[at][1][1]))
            if outward is not None:
                corners = facing(corners, outward([point for point, _ in corners], i))
            faces.append(corners)
    return faces


def out_from(middles):
    """A sweep's outward test for sections round a line through `middles` (a point a section): away from it."""
    return lambda points, i: sub(_centre(points), mul(add(middles[i], middles[i + 1]), 0.5))


def _frame(axis, seam):
    """Two directions square to `axis`: the seam's (made square to it) and the one round from it."""
    seam = sub(seam, mul(axis, dot(seam, axis)))
    if length(seam) < 1e-6:
        seam = sub((0.0, 0.0, 1.0), mul(axis, axis[2]))
    seam = unit(seam)
    return seam, cross(axis, seam)


def revolve(profile, start=(0.0, 0.0, 0.0), axis=(0.0, 0.0, 1.0), sides=16, seam=(0.0, -1.0, 0.0)):
    """A profile [(radius, height), ...] turned round an axis from `start`, capped where it ends off the axis. The
    seam faces `seam` (the back); u runs round it, rightward as one faces it, v up the profile."""
    axis = unit(axis)
    ring_out, ring_round = _frame(axis, seam)
    # The profile closed along the axis must run counter-clockwise (the solid on its left) for faces to look out.
    closed = [(0.0, profile[0][1])] + list(profile) + [(0.0, profile[-1][1])]
    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(closed, closed[1:] + closed[:1]))
    profile = list(profile) if area >= 0 else list(profile)[::-1]
    sections = []
    for step in range(sides + 1):
        turn = TAU * (step % sides) / sides
        spoke = add(mul(ring_out, math.cos(turn)), mul(ring_round, -math.sin(turn)))
        sections.append([add(start, add(mul(axis, height), mul(spoke, radius))) for radius, height in profile])
    faces = sweep(sections, closed=False)
    for end, outward in ((0, mul(axis, -1)), (-1, axis)):
        if profile[end][0] > 1e-9:
            ring = [section[end] for section in sections[:-1]]
            faces.append(facing(flat(ring), outward))
    return faces


def frustum(start, end, radius_start, radius_end, sides=12, seam=(0.0, -1.0, 0.0)):
    """A cylinder, cone or frustum from point `start` to point `end`, its radii at each; a radius of 0 is a point."""
    axis = sub(end, start)
    return revolve([(radius_start, 0.0), (radius_end, length(axis))], start, axis, sides, seam)


def cylinder(start, end, radius, sides=12, seam=(0.0, -1.0, 0.0)):
    """A cylinder from point `start` to point `end`: a column, a beam, an axle, a candle."""
    return frustum(start, end, radius, radius, sides, seam)


def cone(start, end, radius_start, radius_end=0.0, sides=12, seam=(0.0, -1.0, 0.0)):
    """A cone (or a frustum, with `radius_end`) from `start` to `end`: a stalactite, a spike, a capital's bell."""
    return frustum(start, end, radius_start, radius_end, sides, seam)


def prism(start, end, radius, sides=6, turn=0.0):
    """An n-sided prism from `start` to `end`, its corners `radius` out, turned `turn` degrees: a square post is
    sides=4, turn=45."""
    seam = (math.sin(math.radians(turn)), -math.cos(math.radians(turn)), 0.0)
    return frustum(start, end, radius, radius, sides, seam)


def lathe(profile, x=0.0, y=0.0, z=0.0, sides=16):
    """A profile [(radius, height), ...] turned round the upright through (x, y), heights from z: an urn, a baluster,
    a bowl, a bell. Start or end it at radius 0 to close it there, else it is capped flat."""
    return revolve(profile, (x, y, z), (0.0, 0.0, 1.0), sides)


def ring(centre, radius, tube, axis=(0.0, 0.0, 1.0), sides=16, tube_sides=6, seam=(0.0, -1.0, 0.0)):
    """A ring (torus) round `centre`: `radius` to the middle of its tube, `tube` the tube's radius, lying square to
    `axis`: an iron hoop, a door ring, a chain's link. u runs round the ring, v round the tube from its inside."""
    axis = unit(axis)
    ring_out, ring_round = _frame(axis, seam)
    sections = []
    for step in range(sides + 1):
        turn = TAU * (step % sides) / sides
        spoke = add(mul(ring_out, math.cos(turn)), mul(ring_round, -math.sin(turn)))
        middle = add(centre, mul(spoke, radius))
        sections.append([add(middle, add(mul(spoke, -tube * math.cos(TAU * k / tube_sides)),
                                         mul(axis, tube * math.sin(TAU * k / tube_sides))))
                         for k in range(tube_sides)])
    return sweep(sections, outward=out_from([_centre(section) for section in sections]))


_PLANES = {'xy': (0, 1, 2), 'xz': (0, 2, 1), 'yz': (1, 2, 0)}


def extrude_outline(outline, low, high, plane='xy'):
    """A 2D outline [(a, b), ...] (convex or not, no holes) in `plane` ('xy', 'xz' or 'yz'), stood from `low` to
    `high` on the third axis: a plinth, a slab with an arched opening, a moulding's run. On 'xy' its sides' u runs
    round the outline from its first point (start it at the back) and v up; on 'xz' or 'yz' u runs along the third
    axis and v round the outline."""
    first, second, third = _PLANES[plane]
    low, high = sorted((low, high))

    def point(a, b, c):
        found = [0.0, 0.0, 0.0]
        found[first], found[second], found[third] = a, b, c
        return tuple(found)

    area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(outline, list(outline[1:]) + [outline[0]]))
    outline = list(outline) if area > 0 else list(outline)[::-1]
    sections = [[point(a, b, low) for a, b in outline], [point(a, b, high) for a, b in outline]]

    def outward(points, _):
        # Counter-clockwise, the outside of each edge is on its right.
        edge = sub(points[1], points[0])
        return point(edge[second], -edge[first], 0.0)

    sides = sweep(sections, outward=outward)
    if plane == 'xy':
        sides = [[(spot, (uv[1], uv[0] + low)) for spot, uv in face] for face in sides]
    up = point(0.0, 0.0, 1.0)
    return sides + [facing(flat(section), mul(up, side)) for section, side in zip(sections, (-1, 1))]
