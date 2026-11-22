"""The crypt's own shapes as plain faces, in shapes.py's form (a face its corners, each a point in the dungeon's frame
and a UV in metres): lofts through stacked sections, skulls, long bones, hooded figures, the cushion capital and
chamfered voussoirs. Each is made facing +y with its foot at z 0, then laid where it goes with `placed`.
"""
import math

from shapes import TAU, add, facing, flat, length, mul, out_from, revolve, sub, sweep, unit


def centre(points):
    return mul(tuple(map(sum, zip(*points))), 1 / len(points))


def made(kit, faces, part='stone', smooth=35.0, closed=True, name='crypt'):
    """An object of plain faces in one part; `closed` False for a shell open behind (a carving set into stone)."""
    return kit.mesh(faces, part, name, smooth, closed)


def loft(sections, caps=(True, True)):
    """Faces through closed sections (lists of points of one length), capped at each end that is not a point: u round
    each section, v along the loft, in metres."""
    middles = [centre(section) for section in sections]
    faces = [[(point, (uv[1], uv[0])) for point, uv in face]
             for face in sweep(sections, closed=True, outward=out_from(middles))]
    for end, inward, wanted in ((0, 1, caps[0]), (-1, -2, caps[1])):
        ring = sections[end]
        if wanted and max(length(sub(point, ring[0])) for point in ring) > 1e-6:
            faces.append(facing(flat(ring), sub(middles[end], middles[inward])))
    return faces


def placed(faces, at=(0.0, 0.0, 0.0), turn=0.0, tilt=0.0, roll=0.0, size=1.0, depth=1.0):
    """Faces scaled by `size` (and their y by `depth`: a carving's shallow relief), tilted `tilt` degrees about x
    (its front, +y, down toward -z), rolled `roll` about y (up toward +x), turned `turn` about z (east toward south,
    as the kit's rotate_z), then moved to `at`. UVs scale with `size`, so they stay metres."""
    cos_tilt, sin_tilt = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
    cos_roll, sin_roll = math.cos(math.radians(roll)), math.sin(math.radians(roll))
    cos_turn, sin_turn = math.cos(math.radians(turn)), math.sin(math.radians(turn))

    def move(point):
        x, y, z = mul(point, size)
        y *= depth
        y, z = y * cos_tilt + z * sin_tilt, -y * sin_tilt + z * cos_tilt
        x, z = x * cos_roll + z * sin_roll, -x * sin_roll + z * cos_roll
        x, y = x * cos_turn - y * sin_turn, x * sin_turn + y * cos_turn
        return add((x, y, z), at)

    return [[(move(point), mul(uv, size)) for point, uv in face] for face in faces]


def section(z, half_x, half_y, middle_y=0.0, angles=None, count=12, push=None, middle_x=0.0):
    """An oval section at height z round (middle_x, middle_y), starting at the back (-y): `angles` (degrees, 0 the
    front, 90 east) or `count` even ones. `push(angle)` moves a point out (+) or in (-) by metres, square to the
    oval."""
    angles = angles or [180 - 360 * step / count for step in range(count)]
    points = []
    for angle in angles:
        turn = math.radians(angle)
        out = (math.sin(turn), math.cos(turn))
        point = (middle_x + half_x * out[0], middle_y + half_y * out[1])
        normal = unit((out[0] / max(half_x, 1e-6), out[1] / max(half_y, 1e-6), 0.0))
        moved = push(angle) if push else 0.0
        points.append((point[0] + normal[0] * moved, point[1] + normal[1] * moved, z))
    return points


def _near(angle, at, width):
    """1 at `angle` == `at`, falling to 0 `width` degrees away: a carving's reach round a section."""
    gap = abs((angle - at + 180) % 360 - 180)
    return max(0.0, 1 - gap / width)


# A skull's sections, a real one's metres: (height, half width, half depth, middle's y, sockets, nose, cheek).
_SKULL = (
    (0.000, 0.036, 0.026, 0.050, 0.0, 0.0, 0.0),
    (0.022, 0.046, 0.034, 0.046, 0.0, 0.0, 0.0),
    (0.044, 0.05, 0.044, 0.040, 0.0, 0.0, 0.0),
    (0.062, 0.054, 0.072, 0.020, 0.0, 0.014, 0.004),
    (0.080, 0.067, 0.088, 0.004, 0.012, 0.032, 0.013),
    (0.096, 0.068, 0.093, -0.002, 0.044, 0.008, 0.006),
    (0.114, 0.067, 0.095, -0.004, 0.042, 0.0, -0.009),
    (0.132, 0.068, 0.095, -0.006, -0.008, 0.0, -0.006),
    (0.156, 0.064, 0.088, -0.008, 0.0, 0.0, 0.0),
    (0.176, 0.052, 0.072, -0.010, 0.0, 0.0, 0.0),
    (0.191, 0.032, 0.046, -0.012, 0.0, 0.0, 0.0),
    (0.198, 0.006, 0.010, -0.012, 0.0, 0.0, 0.0),
)
# Each detail's angles round a section (degrees, 0 the face) and the sections it keeps, finest last.
_DETAIL = (
    ([180, 120, 66, 28, 0, -28, -66, -120], (0, 3, 4, 5, 6, 8, 10, 11)),
    ([180, 128, 86, 52, 28, 0, -28, -52, -86, -128], (0, 2, 3, 4, 5, 6, 8, 9, 10, 11)),
    ([180, 142, 106, 78, 52, 28, 12, 0, -12, -28, -52, -78, -106, -142], tuple(range(len(_SKULL)))),
)


def skull(detail=2, half=False):
    """A skull 0.14 wide, 0.19 deep and 0.2 high, its face to +y and its jaw on z 0: the cranium's dome, two deep
    sockets, the nose's hole and the cheekbones. `detail` 2 is ~360 triangles, 1 ~170, 0 ~100; `half` keeps its
    front only, open behind, to set into stone or a heap."""
    angles, kept = _DETAIL[detail]
    rows = [_SKULL[index] for index in kept]
    if half:
        angles = [angle for angle in angles if abs(angle) <= 106]
    sections, middles = [], []
    for height, half_x, half_y, middle_y, sockets, nose, cheek in rows:
        def push(angle, sockets=sockets, nose=nose, cheek=cheek):
            front = max(0.0, math.cos(math.radians(angle)))
            return (-sockets * max(_near(angle, 28, 24), _near(angle, -28, 24)) - nose * _near(angle, 0, 16)
                    + cheek * max(_near(angle, 78, 30), _near(angle, -78, 30))) * (0.4 + 0.6 * front)
        # The face is flatter than the dome: its front half is squared off toward the jaw.
        points = section(height, half_x, half_y, middle_y, angles, push=push)
        sections.append([(x, middle_y + (y - middle_y) * (0.86 if y > middle_y else 1.0), z) for x, y, z in points])
        middles.append((0.0, middle_y, height))
    if not half:
        return loft(sections)
    faces = sweep(sections, closed=False, outward=out_from(middles))
    faces = [[(point, (uv[1], uv[0])) for point, uv in face] for face in faces]
    return faces + [facing(flat(sections[-1]), (0.0, 0.0, 1.0)), facing(flat(sections[0]), (0.0, 0.0, -1.0))]


def long_bone(start, end, radius=0.014, sides=6):
    """A long bone from `start` to `end`: a shaft `radius` thick with knuckled ends, ~100 triangles at 6 sides."""
    span = length(sub(end, start))
    knob = min(0.07, span * 0.18)
    profile = [(0.0, 0.0), (radius * 1.55, span * 0.006), (radius * 1.9, knob * 0.35), (radius * 1.15, knob),
               (radius, span * 0.5), (radius * 1.2, span - knob), (radius * 1.8, span - knob * 0.3),
               (radius * 1.4, span - span * 0.006), (0.0, span)]
    return revolve(profile, start, sub(end, start), sides)


def bone_end(x, y, z, reach=0.08, radius=0.016, sides=5):
    """A long bone's knuckled end as an ossuary stacks it, its shaft running back into the heap along -y from y."""
    profile = [(radius, 0.0), (radius, reach - 0.03), (radius * 1.65, reach - 0.012), (radius * 0.9, reach), (0.0,
               reach)]
    return revolve(profile, (x, y - reach, z), (0.0, 1.0, 0.0), sides)


def cushion(half, foot, high, rows=7, count=32):
    """A cushion capital's block, z 0..high: round of radius `foot` below, squared to ±`half` above, the cube cut by a
    sphere as the old builders did. Gives (curved faces, lunette faces): its four flat faces, the lunettes, apart."""
    reach = half * math.sqrt(2)
    depth = math.sqrt(max(reach * reach - foot * foot, 1e-9))
    sections = []
    for row in range(rows + 1):
        share = row / rows
        height = high * share
        sphere = math.sqrt(max(reach * reach - (depth * (1 - share)) ** 2, 0.0))
        ring = []
        for step in range(count):
            turn = math.pi + TAU * step / count
            out = (math.sin(turn), math.cos(turn))
            square = half / max(abs(out[0]), abs(out[1]))
            ring.append((out[0] * min(square, sphere), out[1] * min(square, sphere), height))
        sections.append(ring)
    curved, lunettes = [], []
    for face in loft(sections, caps=(False, False)):
        points = [point for point, _ in face]
        on_square = all(abs(max(abs(point[0]), abs(point[1])) - half) < 1e-4 for point in points)
        (lunettes if on_square else curved).append(face)
    return curved, lunettes


def voussoirs(half, spring, depth, y0, y1, count=9, joint=0.014, chamfer=0.025, extra=(), x=0.0, steps=3):
    """A round arch of `count` chunky voussoirs, each chamfered on its four long edges, `depth` deep radially plus its
    own `extra` (a list, one a stone), y0..y1 through: gives a list of each stone's faces, from the west."""
    stones = []
    for number in range(count):
        gap = joint / 2 / (half + depth / 2)
        first = math.pi - math.pi * number / count - gap
        last = math.pi - math.pi * (number + 1) / count + gap
        outer = half + depth + (extra[number] if number < len(extra) else 0.0)
        sections = []
        for step in range(steps + 1):
            turn = first + (last - first) * step / steps
            out = (math.cos(turn), math.sin(turn))
            ring = [(half + chamfer, y0), (half, y0 + chamfer), (half, y1 - chamfer), (half + chamfer, y1),
                    (outer - chamfer, y1), (outer, y1 - chamfer), (outer, y0 + chamfer), (outer - chamfer, y0)]
            sections.append([(x + out[0] * reach, along, spring + out[1] * reach) for reach, along in ring])
        stones.append(loft(sections))
    return stones


def hooded(height=1.62, angles=16, fold=0.05, bow=0.08, head=False):
    """A hooded mourner in a robe to the ground, `height` tall, facing +y with its head bowed `bow` forward: the robe
    falls in vertical folds, the arms meet before the chest, and the hood's opening is a deep shadow. ~600
    triangles; `head` gives the hood alone, its foot (z 1.4 of 1.62) capped, for a carving."""
    scale = height / 1.62
    count = angles
    rows = (  # height, half width, half depth, middle's y, folds, the hood's opening
        (0.00, 0.27, 0.24, 0.00, 1.0, 0.0), (0.05, 0.265, 0.235, 0.0, 1.0, 0.0), (0.42, 0.225, 0.19, 0.0, 0.8, 0.0),
        (0.82, 0.19, 0.15, 0.0, 0.6, 0.0), (1.06, 0.2, 0.15, 0.015, 0.4, 0.0), (1.24, 0.225, 0.15, 0.025, 0.3, 0.0),
        (1.34, 0.19, 0.15, 0.035, 0.2, 0.0), (1.4, 0.13, 0.13, 0.5, 0.0, 0.03), (1.47, 0.125, 0.135, 0.8, 0.0, 0.075),
        (1.56, 0.118, 0.13, 1.0, 0.0, 0.08), (1.63, 0.095, 0.11, 0.9, 0.0, 0.04), (1.69, 0.06, 0.075, 0.7, 0.0, 0.0),
        (1.74, 0.012, 0.018, 0.5, 0.0, 0.0))
    sections = []
    for number, (level, half_x, half_y, forward, folds, opening) in enumerate(rows):
        middle = forward * bow if number >= 7 else forward

        def push(angle, folds=folds, opening=opening):
            return (fold * folds * math.cos(math.radians(angle) * count / 2)
                    - opening * max(0.0, 1 - abs(angle) / 50))
        sections.append([mul(point, scale) for point in section(level, half_x, half_y, middle, count=count, push=push)])
    if head:
        return loft(sections[7:])
    faces = loft(sections)
    for side in (-1, 1):
        shoulder, hand = (side * 0.18 * scale, 0.05 * scale, 1.26 * scale), (side * 0.03 * scale, 0.2 * scale,
                                                                            1.04 * scale)
        faces += revolve([(0.075 * scale, 0.0), (0.07 * scale, length(sub(hand, shoulder)) * 0.8),
                          (0.085 * scale, length(sub(hand, shoulder)))], shoulder, sub(hand, shoulder), 8)
    hands = section(0.0, 0.045 * scale, 0.04 * scale, 0.22 * scale, count=8)
    faces += loft([[(x, y, z + 0.98 * scale) for x, y, z in hands], [(x, y, z + 1.14 * scale) for x, y, z in hands],
                   [(x * 0.4, y, z + 1.2 * scale) for x, y, z in hands]])
    return faces
