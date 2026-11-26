"""The passages' pieces' own forms as plain faces (shapes.py's: corners of (point, uv), metres), so the dungeon's pack
and the islands' kit build them from one source: a piece's frame has its origin at the middle of its foot, x east,
y south, z up, its front to the north (-y). Each piece is {role: faces}; each build turns the roles into its own
parts (ROLES in styles/passage and kits/passage.py).

Only shapes.py's and details.py's calls both builds share are used: whichever pair is on the path makes the faces.
"""
import math
import random

import details
import shapes
from shapes import add, facing, flat, mul, sub, unit

TAU = math.tau
# The grey-green stone's worn edges, metres.
BEVEL = 0.035


def move(faces, at=(0.0, 0.0, 0.0), turn=0.0, tilt=0.0, roll=0.0, about=(0.0, 0.0, 0.0)):
    """Faces tilted `tilt` degrees about x (south toward up), rolled `roll` about y (up toward east) and turned `turn`
    about z (east toward south), all about `about`, then moved by `at`. UVs keep their metres."""
    cos_tilt, sin_tilt = math.cos(math.radians(tilt)), math.sin(math.radians(tilt))
    cos_roll, sin_roll = math.cos(math.radians(roll)), math.sin(math.radians(roll))
    cos_turn, sin_turn = math.cos(math.radians(turn)), math.sin(math.radians(turn))

    def moved(point):
        x, y, z = sub(point, about)
        y, z = y * cos_tilt - z * sin_tilt, y * sin_tilt + z * cos_tilt
        x, z = x * cos_roll + z * sin_roll, -x * sin_roll + z * cos_roll
        x, y = x * cos_turn - y * sin_turn, x * sin_turn + y * cos_turn
        return add(add((x, y, z), about), at)

    return [[(moved(point), uv) for point, uv in face] for face in faces]


def gather(*groups):
    """Faces by role from many {role: faces}, merged in order."""
    found = {}
    for group in groups:
        for role, faces in group.items():
            found.setdefault(role, []).extend(faces)
    return found


def block(x0, y0, z0, x1, y1, z1, seed, wear=0.012, bevel=BEVEL):
    """A dressed block of the grey-green stone, its edges worn round and its faces a little uneven."""
    return shapes.bevelled_box(x0, y0, z0, x1, y1, z1, bevel=bevel, wear=wear, seed=seed)


def cups(centre, normal, rings=0, radius=0.035, seed=None):
    """A cup mark pecked into a face at `centre` facing `normal`: the cup's dark hollow, and `rings` rings round it,
    each a low ridge between grooves. Gives {'carve': faces}."""
    normal = unit(normal)
    faces = shapes.cylinder(sub(centre, mul(normal, 0.006)), add(centre, mul(normal, 0.004)), radius, sides=8)
    draw = random.Random(f'cups {seed} {centre}')
    for number in range(1, rings + 1):
        reach = radius + 0.032 * number + draw.uniform(-0.004, 0.004)
        faces += shapes.ring(centre, reach, 0.007, axis=normal, sides=12 + 2 * number, tube_sides=3)
    return {'carve': faces}


def standing_stone(width, thick, height, seed, sink=0.3, lean=(0.0, 0.0), sections=8, points=10):
    """A standing stone from `sink` under the ground to `height`: an uneven slab `width` across x and `thick` along
    y, swelling a little at its waist and rounding to a weathered top, leaning by `lean` (x, y) at its top."""
    draw = random.Random(f'stone {seed}')
    bulges = [draw.uniform(0.92, 1.06) for _ in range(points)]
    rings = []
    for step in range(sections + 1):
        share = step / sections
        z = -sink + (height + sink) * share
        swell = (1.0 + 0.05 * math.sin(math.pi * min(1.0, share * 1.3))) * (1.0 - 0.28 * share ** 3)
        top = max(0.0, (share - 0.82) / 0.18)
        ring = []
        for number in range(points):
            turn = TAU * number / points
            cosine, sine = math.cos(turn), math.sin(turn)
            # A rounded rectangle: square-ish in its middle, its corners worn.
            reach = 1.0 / max(abs(cosine) ** 4 + abs(sine) ** 4, 1e-9) ** 0.25
            jitter = bulges[number] * draw.uniform(0.97, 1.03)
            x = width / 2 * cosine * reach * swell * jitter * (1 - 0.35 * top)
            y = thick / 2 * sine * reach * swell * jitter * (1 - 0.2 * top)
            crown = 0.12 * top * top * abs(cosine) if top else 0.0
            ring.append((x + lean[0] * share, y + lean[1] * share, z - crown))
        rings.append(ring)
    middles = [shapes._centre(ring) for ring in rings]
    faces = shapes.sweep(rings, closed=True, outward=lambda corners, i: sub(shapes._centre(corners), middles[i]))
    crown = add(middles[-1], (draw.uniform(-0.04, 0.04), 0.0, 0.05))
    for number in range(points):
        corners = [rings[-1][number], rings[-1][(number + 1) % points], crown]
        faces.append(facing(flat(corners), sub(shapes._centre(corners), middles[-1])))
    return faces


def flags(inner, outer, count, seed, top=0.03, sink=0.03):
    """A ring of flagstones lying flush round a middle, from radius `inner` to `outer`, each a worn slab."""
    draw = random.Random(f'flags {seed}')
    faces = []
    for number in range(count):
        middle = TAU * (number + draw.uniform(-0.1, 0.1)) / count
        wide = TAU / count * draw.uniform(0.38, 0.46)
        near, far = inner + draw.uniform(0.0, 0.05), outer - draw.uniform(0.0, 0.12)
        corners = [(math.sin(middle + side * wide) * reach, -math.cos(middle + side * wide) * reach)
                   for side, reach in ((-1, near), (1, near), (1, far), (-1, far))]
        rise = top - draw.uniform(0.0, 0.015)
        faces += shapes.extrude_outline(corners[::-1] if _clockwise(corners) else corners, -sink, rise)
    return faces


def laid_stone(outline, top, sink, slope=(0.0, 0.0), bevel=BEVEL):
    """A flat stone laid in a floor: a convex outline [(x, y), ...] stood from `sink` under the floor to `top` at its
    middle, its top worn round `bevel` in from its edge and half that down, and tipped by `slope` (its rise a metre
    along x and along y), so no two stones catch the light alike."""
    count = len(outline)
    middle = (sum(x for x, _ in outline) / count, sum(y for _, y in outline) / count)

    def inward(start, end):
        normal = unit((start[1] - end[1], end[0] - start[0], 0.0))
        between = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
        toward = (middle[0] - between[0]) * normal[0] + (middle[1] - between[1]) * normal[1]
        return normal if toward > 0 else mul(normal, -1.0)

    normals = [inward(outline[number], outline[(number + 1) % count]) for number in range(count)]
    inner = []
    for number, (x, y) in enumerate(outline):
        before, after = normals[number - 1], normals[number]
        # Each edge moved in by the bevel: the corner moves along the two edges' bisector, farther the sharper it is.
        reach = bevel / (1.0 + before[0] * after[0] + before[1] * after[1])
        inner.append((x + (before[0] + after[0]) * reach, y + (before[1] + after[1]) * reach))

    def lifted(corners, z):
        return [(x, y, z + slope[0] * (x - middle[0]) + slope[1] * (y - middle[1])) for x, y in corners]

    low = [(x, y, -sink) for x, y in outline]
    edge, crown = lifted(outline, top - bevel / 2), lifted(inner, top)
    faces = [facing(flat(crown), (0.0, 0.0, 1.0)), facing(flat(low), (0.0, 0.0, -1.0))]
    for number in range(count):
        after = (number + 1) % count
        out = mul(normals[number], -1.0)
        faces.append(facing(flat([low[number], low[after], edge[after], edge[number]]), out))
        faces.append(facing(flat([edge[number], edge[after], crown[after], crown[number]]), add(out, (0.0, 0.0, 1.0))))
    return faces


def _clockwise(outline):
    area = sum(first[0] * second[1] - second[0] * first[1] for first, second in zip(outline, outline[1:] + outline[:1]))
    return area < 0


def rod(start, end, radius, sides=6):
    """An iron rod or a stick from `start` to `end`."""
    return shapes.cylinder(start, end, radius, sides=sides)


def bent(points, radius, sides=6):
    """An iron bar bent along a path of points, a short rod a step, its joints closed by small knuckles."""
    faces = []
    for start, end in zip(points, points[1:]):
        faces += shapes.cylinder(start, end, radius, sides=sides)
    return faces


def crust(spots, count, seed, size=(0.08, 0.22), proud=0.025):
    """Chalk grown over a face that looks north (-y): flat lumps lying on it, at seeded places near `spots` (x, y, z),
    the face's own y each."""
    draw = random.Random(f'crust {seed}')
    faces = []
    for number in range(count):
        x, y, z = spots[draw.randrange(len(spots))]
        spread = draw.uniform(*size)
        at = (x + draw.uniform(-0.12, 0.12), y, z + draw.uniform(-0.12, 0.12))
        lump = details.rock(0.0, 0.0, 0.0, (spread, spread * draw.uniform(0.6, 0.9), proud * draw.uniform(0.7, 1.3)),
                            seed=f'{seed} {number}', detail=0, roughness=0.3)
        # Stood up from lying on its foot, its top toward the north, out of the face.
        faces += move(lump, at=at, tilt=90.0)
    return faces
