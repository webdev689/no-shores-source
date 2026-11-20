"""The wreckage the ram and the fire left: loose planks, crates, barrels, coils of line, fallen spars, torn canvas, the
heaps of it that close the way on, and torn sections of deck lying across a gap. Each is laid into a `Piece`, in the
ship builder's parts.
"""
import math
import random

from mathutils import Matrix, Vector

from ship_mesh import Piece


def turned(heading, tilt=0.0, roll=0.0):
    """A turn: heading about z (radians, counter-clockwise from east), after a tilt about y and a roll about x."""
    return Matrix.Rotation(heading, 3, 'Z') @ Matrix.Rotation(tilt, 3, 'Y') @ Matrix.Rotation(roll, 3, 'X')


def box_at(piece, centre, size, turn, part):
    """A box of `size` (along, across, up) with its middle at `centre`, turned by `turn`."""
    half = Vector(size) / 2
    edges = [turn @ Vector((size[0], 0, 0)), turn @ Vector((0, size[1], 0)), turn @ Vector((0, 0, size[2]))]
    corner = Vector(centre) - turn @ half
    piece.slab(tuple(corner), [tuple(edge) for edge in edges], part)


def plank(piece, centre, length, heading, rng, tilt=0.0, part='deck'):
    """A loose plank, its ends a little ragged."""
    turn = turned(heading, tilt, rng.uniform(-0.15, 0.15))
    box_at(piece, centre, (length, rng.uniform(0.18, 0.3), 0.06), turn, part)


def crate(piece, base, size, heading, rng, tilt=0.0):
    """A crate standing on `base`, its lid's boards and its corner posts proud of its sides."""
    turn = turned(heading, tilt, rng.uniform(-0.05, 0.05))
    up = turn @ Vector((0, 0, size / 2))
    centre = Vector(base) + up
    box_at(piece, centre, (size, size, size), turn, 'deck')
    for sign_x in (-1, 1):
        for sign_y in (-1, 1):
            post = centre + turn @ Vector((sign_x * size / 2, sign_y * size / 2, 0))
            box_at(piece, post, (0.07, 0.07, size + 0.02), turn, 'spar')


def barrel(piece, base, radius, height, axis, rng):
    """A barrel from `base` along `axis` (a unit vector: up for one standing, level for one on its side), bellied, with
    iron hoops."""
    axis = Vector(axis).normalized()
    start = Vector(base)
    middle = start + axis * height / 2
    end = start + axis * height
    piece.prism(tuple(start), tuple(middle), radius * 0.88, 'deck', sides=10, end_radius=radius, caps=False)
    piece.prism(tuple(middle), tuple(end), radius, 'deck', sides=10, end_radius=radius * 0.88, caps=False)
    piece.prism(tuple(start), tuple(start + axis * 0.01), radius * 0.88, 'deck', sides=10)
    piece.prism(tuple(end - axis * 0.01), tuple(end), radius * 0.88, 'deck', sides=10)
    for share in (0.12, 0.88):
        at = start.lerp(end, share)
        piece.ring(tuple(at), tuple(axis), radius * (0.9 + 0.1 * (1 - abs(share - 0.5) * 2)), 0.03, 'iron', segments=10)


def coil(piece, centre, radius, rng):
    """A coil of line lying flat: rings stacked a little off each other."""
    for turn in range(3):
        at = Vector(centre) + Vector((rng.uniform(-0.03, 0.03), rng.uniform(-0.03, 0.03), 0.04 * turn))
        piece.ring(tuple(at), (0, 0, 1), radius * (1 - 0.12 * turn), 0.05, 'spar', segments=12)


def spar(piece, start, end, radius, rng, broken=True):
    """A fallen spar from `start` to `end`, its broken end tapering to a splintered point."""
    start, end = Vector(start), Vector(end)
    if not broken:
        piece.prism(tuple(start), tuple(end), radius, 'spar', sides=8)
        return
    break_at = start.lerp(end, 0.94)
    piece.prism(tuple(start), tuple(break_at), radius, 'spar', sides=8)
    for _ in range(4):
        tip = end + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * radius
        piece.prism(tuple(break_at), tuple(tip), radius * 0.45, 'spar', sides=4, end_radius=radius * 0.05)


def cloth(piece, corners, rng, rows=6, columns=8, sag=0.25):
    """Torn canvas hung between four corners (a quad, in order round it), sagging and rippled, its far edge ragged."""
    a, b, c, d = (Vector(corner) for corner in corners)
    grid = []
    for row in range(rows + 1):
        line = []
        for column in range(columns + 1):
            u, v = column / columns, row / rows
            point = a.lerp(b, u).lerp(d.lerp(c, u), v)
            point.z -= sag * math.sin(math.pi * u) * math.sin(math.pi * v) + rng.uniform(0, 0.06)
            line.append(piece.point(tuple(point)))
        grid.append(line)
    for row in range(rows):
        for column in range(columns):
            # Its last rows are torn away in places.
            if row >= rows - 2 and rng.random() < 0.45:
                continue
            piece.face((grid[row][column], grid[row][column + 1], grid[row + 1][column + 1], grid[row + 1][column]),
                       'sail')


def heap(piece, area, base_z, height, rng, heading=0.0):
    """A heap of wreckage over `area` (x0, y0, x1, y1, metres): planks and spars thrown across each other, crates and
    barrels in among them, piled to about `height` over `base_z`."""
    x0, y0, x1, y1 = area
    span = Vector((x1 - x0, y1 - y0))
    count = int(max(span.x, span.y) * 9)
    for index in range(count):
        share = index / count
        level = base_z + height * share * rng.uniform(0.7, 1.0)
        centre = Vector((rng.uniform(x0, x1), rng.uniform(y0, y1), level))
        choice = rng.random()
        if choice < 0.55:
            plank(piece, centre, rng.uniform(1.0, 2.6), heading + rng.uniform(-1.2, 1.2), rng,
                  tilt=rng.uniform(-0.5, 0.5))
        elif choice < 0.75:
            length = rng.uniform(1.5, 3.2)
            direction = turned(heading + rng.uniform(-1.0, 1.0), rng.uniform(-0.4, 0.4)) @ Vector((length / 2, 0, 0))
            spar(piece, centre - direction, centre + direction, rng.uniform(0.1, 0.2), rng)
        elif choice < 0.88:
            crate(piece, centre - Vector((0, 0, 0.3)), rng.uniform(0.5, 0.8), rng.uniform(0, math.pi), rng,
                  tilt=rng.uniform(-0.3, 0.3))
        else:
            lying = turned(rng.uniform(0, math.pi * 2)) @ Vector((1, 0, rng.uniform(-0.2, 0.2)))
            barrel(piece, centre, 0.3, 0.85, lying, rng)


def deck_section(piece, start, end, width, rng):
    """A section of deck torn away whole, lying from `start` to `end` (the middles of its two ends): planks laid
    across beams under it, its ends splintered."""
    start, end = Vector(start), Vector(end)
    along = end - start
    length = along.length
    forward = along.normalized()
    side = Vector((0, 0, 1)).cross(forward).normalized()
    up = forward.cross(side).normalized()
    planks = int(width / 0.25)
    for index in range(planks):
        offset = side * ((index + 0.5) / planks - 0.5) * width
        # Each plank ends ragged: a little short or long of the section's ends.
        first = start + offset - forward * rng.uniform(-0.15, 0.4)
        last = end + offset + forward * rng.uniform(-0.15, 0.4)
        corner = first - side * 0.11
        piece.slab(tuple(corner), [tuple(last - first), tuple(side * 0.22), tuple(up * 0.08)], 'deck')
    for step in range(int(length / 1.1) + 1):
        middle = start + forward * min(length, step * 1.1 + 0.3) - up * 0.12
        piece.prism(tuple(middle - side * (width / 2 + 0.1)), tuple(middle + side * (width / 2 + 0.1)), 0.11, 'spar',
                    sides=4)


def scatter(piece, area, base_z, count, rng, floating=False):
    """Loose wreckage scattered over `area`: planks, barrels, crates and coils, on a deck or afloat."""
    x0, y0, x1, y1 = area
    for _ in range(count):
        at = Vector((rng.uniform(x0, x1), rng.uniform(y0, y1), base_z))
        choice = rng.random()
        if choice < 0.5:
            plank(piece, at + Vector((0, 0, 0.03)), rng.uniform(0.8, 2.8), rng.uniform(0, math.pi), rng,
                  tilt=rng.uniform(-0.08, 0.08) if floating else 0.0)
        elif choice < 0.7:
            lying = turned(rng.uniform(0, math.pi * 2)) @ Vector((1, 0, 0))
            barrel(piece, at + Vector((0, 0, 0.0 if floating else 0.3)), 0.3, 0.85,
                   lying if floating or rng.random() < 0.5 else (0, 0, 1), rng)
        elif choice < 0.88:
            crate(piece, at - Vector((0, 0, 0.25 if floating else 0)), rng.uniform(0.45, 0.75),
                  rng.uniform(0, math.pi), rng, tilt=rng.uniform(-0.15, 0.15) if floating else 0.0)
        elif not floating:
            coil(piece, at + Vector((0, 0, 0.03)), rng.uniform(0.25, 0.4), rng)


def seeded(seed):
    """A generator for one piece of the wreck, the same every build."""
    return random.Random(seed)


def build(piece, name, collection, walk=False):
    """The piece as an object in `collection`; `walk` marks it ground a body walks on whatever its part."""
    if not piece.faces:
        return None
    item = piece.build(name, collection)
    if walk:
        item['walk'] = True
    return item
