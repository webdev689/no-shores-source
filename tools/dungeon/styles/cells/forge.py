"""The cells' own shapes, made with the kit and kept lean, for a dungeon lays hundreds of its pieces: hewn timber
whose grain runs along it, iron rods, straps, rivets and rings, dressed blocks with only the faces anyone sees, and
the bones a prison keeps. Every number is the dungeon's frame (x east, y south, z up, metres), as the kit's are.
"""
import math

import bmesh

import details
import shapes
from shapes import add, cross, dot, flat, facing, length, mul, sub, unit

# The wood picture's boards run along u: a timber's sides take u along its length, so the grain follows it.
SWEEP_PLANE = {'x': 'yz', 'y': 'xz', 'z': 'xy'}
# How near a face must lie to a plane, metres, and how square to it it must look, to be culled against it.
NEAR_M = 0.004
SQUARE = 0.95


def _swap(face):
    return [(point, (uv[1], uv[0])) for point, uv in face]


def _sheet(kit, faces, part, name, smooth=None):
    """An object of faces already wound outward, left open where faces were left off."""
    return kit.mesh(faces, part, name, smooth, closed=False)


def on(axis, value, facing_sign):
    """A cull test: faces lying on the plane `axis` = `value` and looking along `facing_sign` on that axis."""
    index = 'xyz'.index(axis)
    return lambda centre, normal: abs(centre[index] - value) < NEAR_M and normal[index] * facing_sign > SQUARE


def cull(item, *tests):
    """Takes off an object's faces that any test passes (each given the face's middle and normal in the dungeon's
    frame): the backs against a wall, the feet on the floor, the ends hidden in the next piece."""
    bm = bmesh.new()
    bm.from_mesh(item.data)
    doomed = []
    for face in bm.faces:
        middle, normal = face.calc_center_median(), face.normal
        centre, look = (middle.x, -middle.y, middle.z), (normal.x, -normal.y, normal.z)
        if any(test(centre, look) for test in tests):
            doomed.append(face)
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(item.data)
    bm.free()
    item.data.update()
    return item


def timber(kit, low, high, along='x', chamfer=0.025, rough=0.0, seed=None, part='wood', name='timber'):
    """A squared timber from corner `low` to `high`, its arrises chamfered by `chamfer` and, with `rough`, its faces
    hewn out of true by up to that much (seeded, inside its box), its grain along `along`."""
    axis = 'xyz'.index(along)
    first, second = [index for index in range(3) if index != axis]
    a0, a1 = sorted((low[first], high[first]))
    b0, b1 = sorted((low[second], high[second]))
    cut = min(chamfer, (a1 - a0) * 0.3, (b1 - b0) * 0.3)
    outline = [(a0 + cut, b0), (a1 - cut, b0), (a1, b0 + cut), (a1, b1 - cut), (a1 - cut, b1), (a0 + cut, b1),
               (a0, b1 - cut), (a0, b0 + cut)]
    if rough:
        draw = details.seeded(seed, 'timber', low, high)
        middle = ((a0 + a1) / 2, (b0 + b1) / 2)
        outline = [(a - math.copysign(draw.uniform(0, rough), a - middle[0]),
                    b - math.copysign(draw.uniform(0, rough), b - middle[1])) for a, b in outline]
    faces = shapes.extrude_outline(outline, low[axis], high[axis], SWEEP_PLANE[along])
    if along == 'z':
        faces = [face if abs(shapes.normal_of([point for point, _ in face])[2]) > 0.99 else _swap(face)
                 for face in faces]
    return kit.mesh(faces, part, name, 30.0)


def boards(kit, low, high, along='x', across='y', width=0.2, gap=0.012, split=0.05, seed=None, name='boards'):
    """The kit's planks, their grain turned to run along each board as the wood picture's does."""
    faces = details.planks(low, high, along, across, width, gap, split, seed)
    return kit.mesh([_swap(face) for face in faces], 'wood', name, 30.0)


def _square_to(direction, before):
    found = sub(before, mul(direction, dot(before, direction)))
    if length(found) < 1e-6:
        found = sub((0.0, 0.0, 1.0) if abs(direction[2]) < 0.9 else (1.0, 0.0, 0.0), mul(direction, direction[2]))
    return unit(found)


def rod(kit, points, radius, sides=4, part='iron', name='rod', caps=True, smooth=70.0, turn=45.0):
    """A rod of `sides` sides through every point of a path, no more segments than the path has: a bar, a hook, a
    staple, a cage's strap, a bone. u runs along it, v round."""
    across, sections = (0.0, 0.0, 1.0), []
    for index, point in enumerate(points):
        direction = unit(sub(points[min(index + 1, len(points) - 1)], points[max(index - 1, 0)]))
        across = _square_to(direction, across)
        other = cross(direction, across)
        sections.append([add(point, add(mul(across, radius * math.cos(math.radians(turn) + math.tau * k / sides)),
                                        mul(other, radius * math.sin(math.radians(turn) + math.tau * k / sides))))
                         for k in range(sides)])
    faces = shapes.sweep(sections, outward=shapes.out_from(list(points)))
    if caps:
        faces.append(facing(flat(sections[0]), sub(points[0], points[1])))
        faces.append(facing(flat(sections[-1]), sub(points[-1], points[-2])))
    return _sheet(kit, faces, part, name, smooth)


def bar(kit, start, end, radius, sides=4, part='iron', name='bar', caps=True):
    """A straight rod from `start` to `end`."""
    return rod(kit, [start, end], radius, sides, part, name, caps)


def rivets(kit, points, normal, radius=0.013, height=0.01, part='iron', name='rivets'):
    """Rivet heads standing `height` off a face along `normal`: a four-sided point each, four triangles, no base."""
    normal = unit(normal)
    across = _square_to(normal, (0.0, 0.0, 1.0))
    other = cross(normal, across)
    faces = []
    for point in points:
        tip = add(point, mul(normal, height))
        ring = [add(point, add(mul(across, radius * math.cos(math.tau * k / 4)),
                               mul(other, radius * math.sin(math.tau * k / 4)))) for k in range(4)]
        faces += [facing(flat([ring[k], ring[(k + 1) % 4], tip]), sub(add(ring[k], ring[(k + 1) % 4]),
                                                                      mul(point, 2))) for k in range(4)]
    return _sheet(kit, faces, part, name, 60.0)


def plate(kit, x0, y0, z0, x1, y1, z1, normal=(0.0, -1.0, 0.0), studs=(), stud=0.012, part='iron', name='plate'):
    """A flat plate or strap (a box) without the face it lies on, the one opposite `normal`, and rivet heads at
    `studs` (points on its face)."""
    back = mul(unit(normal), -1.0)
    faces = [face for face in shapes.box(x0, y0, z0, x1, y1, z1)
             if dot(shapes.normal_of([point for point, _ in face]), back) < SQUARE]
    item = _sheet(kit, faces, part, name)
    if studs:
        item = kit.join([item, rivets(kit, studs, normal, stud, stud * 0.8)], name)
    return item


def slab(kit, low, high, toward='-y', inset=0.02, wear=0.0, seed=None, part='stone', name='slab'):
    """A dressed block from corner `low` to `high` laid against a face: its back (away from `toward`, as '-y' or
    '+z') left off, its front drawn in by `inset` all round so its edges read chamfered, and with `wear` its front
    corners knocked in by up to that much more, seeded. Ten triangles."""
    axis, sign = 'xyz'.index(toward[1]), -1.0 if toward[0] == '-' else 1.0
    first, second = [index for index in range(3) if index != axis]
    lows, highs = [min(pair) for pair in zip(low, high)], [max(pair) for pair in zip(low, high)]
    back, front = (highs[axis], lows[axis]) if sign < 0 else (lows[axis], highs[axis])
    draw = details.seeded(seed, 'slab', low, high)

    def corner(depth, a, b, pull):
        point = [0.0, 0.0, 0.0]
        point[axis] = depth
        point[first] = a + math.copysign(pull + (draw.uniform(0, wear) if pull else 0.0), -a + (lows[first] +
                                                                                               highs[first]) / 2)
        point[second] = b + math.copysign(pull + (draw.uniform(0, wear) if pull else 0.0), -b + (lows[second] +
                                                                                                highs[second]) / 2)
        return tuple(point)

    square = [(lows[first], lows[second]), (highs[first], lows[second]), (highs[first], highs[second]),
              (lows[first], highs[second])]
    rear = [corner(back, a, b, 0.0) for a, b in square]
    face = [corner(front, a, b, inset) for a, b in square]
    middle = mul(tuple(map(sum, zip(*(rear + face)))), 1 / 8)
    rings = [face] + [[rear[k], rear[(k + 1) % 4], face[(k + 1) % 4], face[k]] for k in range(4)]
    faces = [facing(flat(ring), sub(shapes._centre(ring), middle)) for ring in rings]
    return _sheet(kit, faces, part, name)


def taper(kit, low, high, top_low, top_high, part='stone', name='taper'):
    """A block whose foot is the rectangle `low`..`high` (x, y) at z low[2] and whose head is `top_low`..`top_high`
    at z high[2]: a weathered offset, a corbel's splay, a plinth's chamfer."""
    z0, z1 = low[2], high[2]
    foot = [(low[0], low[1], z0), (high[0], low[1], z0), (high[0], high[1], z0), (low[0], high[1], z0)]
    head = [(top_low[0], top_low[1], z1), (top_high[0], top_low[1], z1), (top_high[0], top_high[1], z1),
            (top_low[0], top_high[1], z1)]
    middle = mul(tuple(map(sum, zip(*(foot + head)))), 1 / 8)
    rings = [foot, head] + [[foot[k], foot[(k + 1) % 4], head[(k + 1) % 4], head[k]] for k in range(4)]
    faces = [facing(flat(ring), sub(shapes._centre(ring), middle)) for ring in rings]
    return _sheet(kit, faces, part, name)


def courses(kit, x0, x1, y0, y1, heights, z0=0.0, joint=0.012, inset=0.02, wear=0.01, seed='courses',
            parts=('stone',), step=0.0, toward='-y'):
    """Slabs stacked from z0, one a height in `heights`, each x0..x1 by y0..y1 less a joint, every other one stepped
    back `step` at x1: a jamb's or a post's dressed stones. Parts cycle through `parts`."""
    made, level = [], z0
    for number, height in enumerate(heights):
        right = x1 - (step if number % 2 else 0.0)
        made.append(slab(kit, (x0, y0, level + joint / 2), (right, y1, level + height - joint / 2), toward, inset,
                         wear, f'{seed}.{number}', parts[number % len(parts)]))
        level += height
    return made


def ring(kit, centre, radius, tube, axis=(0.0, 0.0, 1.0), sides=10, tube_sides=3, name='ring'):
    """An iron ring, lean."""
    return kit.ring(centre, radius, tube, axis=axis, sides=sides, tube_sides=tube_sides, part='iron', name=name,
                    smooth=70.0)


def staple_ring(kit, at, radius=0.06, tube=0.011, out=(0.0, 1.0, 0.0), name='ring'):
    """An iron ring hanging flat on a wall from an eye: `at` is the eye on the face, `out` the face's outward
    direction. Gives the ring's lowest point too, for a chain to hang from."""
    out = unit(out)
    eye = rivets(kit, [at], out, 0.022, 0.024)
    centre = add(at, (out[0] * 0.016, out[1] * 0.016, -radius + 0.008))
    loop = ring(kit, centre, radius, tube, axis=out)
    bottom = add(centre, (0.0, 0.0, -radius))
    return kit.join([eye, loop], name), bottom


def chain(kit, points, link=0.12, wire=0.014, name='chain'):
    """Iron links along a path, six-sided to keep them lean: 48 triangles a link."""
    return kit.chain(points, link=link, wire=wire, sides=6, tube_sides=4, part='iron', name=name, smooth=60.0)


def cuff(kit, centre, axis, radius=0.045, name='cuff'):
    """A manacle: a thick iron band round `axis` with its hinge knuckle and lock lug."""
    axis = unit(axis)
    band = kit.ring(centre, radius, 0.012, axis=axis, sides=8, tube_sides=3, part='iron', smooth=50.0)
    side = unit(cross(axis, (0.0, 0.0, 1.0))) if abs(axis[2]) < 0.9 else (1.0, 0.0, 0.0)
    knuckle = add(centre, mul(side, radius + 0.01))
    lug = add(centre, mul(side, -radius - 0.02))
    made = [band, kit.box(*sub(knuckle, (0.012, 0.012, 0.012)), *add(knuckle, (0.012, 0.012, 0.012)), part='iron'),
            kit.box(*sub(lug, (0.014, 0.014, 0.014)), *add(lug, (0.014, 0.014, 0.014)), part='iron')]
    return kit.join(made, name)


def long_bone(kit, start, end, radius=0.016, part='bone', name='bone'):
    """A long bone, knuckled at both ends, from `start` to `end`."""
    span = length(sub(end, start))
    profile = [(0.0, 0.0), (radius * 1.7, span * 0.04), (radius * 1.0, span * 0.18), (radius * 0.9, span * 0.5),
               (radius * 1.0, span * 0.82), (radius * 1.7, span * 0.96), (0.0, span)]
    return kit.revolve(profile, start, sub(end, start), sides=5, part=part, name=name, smooth=60.0)


def skull(kit, x, y, z, turn=0.0, tilt=0.0, size=1.0, jaw=True, name='skull'):
    """A skull resting with its crown's foot at (x, y, z), looking toward +y turned `turn` degrees (east toward
    south), tipped `tilt` degrees forward."""
    s = size
    crown = kit.lathe([(0.0, 0.0), (0.06 * s, 0.014 * s), (0.074 * s, 0.06 * s), (0.06 * s, 0.112 * s),
                       (0.0, 0.142 * s)], sides=8, part='bone', smooth=60.0)
    kit.scale(crown, 0.92, 1.2, 1.0)
    face = taper(kit, (-0.05 * s, 0.03 * s, 0.0), (0.05 * s, 0.1 * s, 0.075 * s), (-0.058 * s, 0.03 * s),
                 (0.058 * s, 0.098 * s), part='bone')
    made = [crown, face]
    if jaw:
        made.append(taper(kit, (-0.036 * s, 0.03 * s, -0.022 * s), (0.036 * s, 0.096 * s, 0.002 * s),
                          (-0.044 * s, 0.03 * s), (0.044 * s, 0.096 * s), part='bone'))
    item = kit.join(made, name)
    if tilt:
        kit.rotate(item, -tilt, 'x')
    kit.rotate_z(item, turn)
    return kit.translate(item, x, y, z + (0.022 * s if jaw else 0.0))


def floor_plane(kit, x0, y0, x1, y1, z=0.0, holes=(), part='floor', name='floor'):
    """A floor laid over x0..x1 by y0..y1 at z, open over each rectangle in `holes` (x0, y0, x1, y1): the strips round
    them, so a pit or a well shows through."""
    cuts_x = sorted({x0, x1} | {value for hole in holes for value in (hole[0], hole[2])})
    cuts_y = sorted({y0, y1} | {value for hole in holes for value in (hole[1], hole[3])})
    faces = []
    for left, right in zip(cuts_x, cuts_x[1:]):
        for top, bottom in zip(cuts_y, cuts_y[1:]):
            middle = ((left + right) / 2, (top + bottom) / 2)
            if any(h[0] < middle[0] < h[2] and h[1] < middle[1] < h[3] for h in holes):
                continue
            faces.append(facing(flat([(left, top, z), (left, bottom, z), (right, bottom, z), (right, top, z)]),
                                (0.0, 0.0, 1.0)))
    return _sheet(kit, faces, part, name)


def hook(kit, top, drop=0.22, reach=0.06, radius=0.01, turn=0.0, name='hook'):
    """A forged hook hanging from `top`: a shank, a curve and a point turned up, opening toward `turn` degrees from
    +x. Eight points, four sides."""
    out = (math.cos(math.radians(turn)), math.sin(math.radians(turn)), 0.0)
    x, y, z = top
    bottom = z - drop
    path = [(x, y, z), (x, y, bottom + reach)]
    for step in range(1, 6):
        angle = math.pi * step / 5
        across = reach / 2 * (1 - math.cos(angle))
        path.append((x + out[0] * across, y + out[1] * across, bottom + reach - reach * 0.9 * math.sin(angle)))
    tip = path[-1]
    path.append((tip[0] - out[0] * 0.012, tip[1] - out[1] * 0.012, tip[2] + reach * 0.5))
    return rod(kit, path, radius, name=name)


def coil(centre, axis, radius, turns, span, steps=10):
    """Points of a rope wound round an axis through `centre`: `turns` turns over `span` metres along it, starting
    level with the axis on the side `axis` turned a quarter left of it."""
    axis = unit(axis)
    across = unit((-axis[1], axis[0], 0.0)) if abs(axis[2]) < 0.9 else (1.0, 0.0, 0.0)
    up = cross(axis, across)
    total = max(2, round(turns * steps))
    found = []
    for step in range(total + 1):
        share = step / total
        turn = math.tau * turns * share
        offset = add(mul(across, radius * math.cos(turn)), mul(up, radius * math.sin(turn)))
        found.append(add(add(centre, mul(axis, span * (share - 0.5))), offset))
    return found


def rope_along(kit, points, radius=0.02, sides=5, name='rope'):
    """Laid rope through every point of a path: a windlass's, a rack's, a lashing. Its pictures carry the lay."""
    return rod(kit, points, radius, sides, 'rope', name, smooth=60.0, turn=0.0)


def pail(kit, x, y, z=0.0):
    """A wooden pail standing at (x, y, z), two iron hoops round it and its bail handle laid over."""
    made = [kit.lathe([(0.0, 0.0), (0.12, 0.0), (0.15, 0.26), (0.135, 0.26), (0.11, 0.03), (0.0, 0.03)], x, y, z,
                      sides=10, part='wood')]
    made += [ring(kit, (x, y, z + height), 0.124 + height * 0.11, 0.008) for height in (0.05, 0.21)]
    made.append(rod(kit, [(x - 0.148, y, z + 0.22), (x - 0.12, y + 0.08, z + 0.27), (x, y + 0.13, z + 0.28),
                          (x + 0.12, y + 0.08, z + 0.27), (x + 0.148, y, z + 0.22)], 0.006, sides=3))
    return made
