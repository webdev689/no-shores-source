"""The wide wreckage between and beside the ships, where most of the fighting is: rafts of the Brig's waist and decks
torn away whole, jammed on her fallen spars and casks, each laid within an ellipse over the sea. Each ellipse is also
where the game draws no sea (export_wreck.footprints): the swell rises past a raft's planking, and would show through
it.
"""
import math

import bpy  # noqa: I001 - Blender's own modules load once bpy has
from mathutils import Vector

from ship_mesh import Piece
from wreck_pieces import barrel, build, deck_section, seeded, spar, turned
from wreck_ships import SEA_Z

# Each raft: its name; its middle (x, y of the wreck's frame); its half length along its heading (degrees
# counter-clockwise from east) and its half breadth across; the height its planking's top lies at. Their order is the
# way's: the Brig's waist and her torn deck between her halves, the raft off her fore deck, the wreckage the Sloop drifted
# into, and off the Frigate's port bow and port quarter.
FIELDS = (
    ('Waist', (-7.5, 7.8), 9.5, 8.0, 0.0, 3.15),
    ('TornDeck', (8.0, 8.6), 9.5, 6.5, 0.0, 3.15),
    ('Fore', (27.5, -2.4), 12.5, 5.2, -9.0, 3.4),
    ('Sloop', (13.5, -16.5), 10.0, 7.0, 90.0, 3.1),
    ('PortBow', (-20.0, -8.8), 15.0, 9.0, 0.0, 4.0),
    ('PortQuarter', (-13.0, -29.2), 10.5, 6.5, 90.0, 3.0),
)
# A raft is laid in strips this wide, along its length.
STRIP_M = 1.0


def top(name):
    """The height of a raft's planking's top, by its name."""
    return next(field[5] for field in FIELDS if field[0] == name)


def at(name, along, across):
    """The point of a raft's planking `along` its length and `across` it from its middle, metres, on its top."""
    _, (x, y), _, _, heading, height = next(field for field in FIELDS if field[0] == name)
    turn = turned(math.radians(heading))
    return Vector((x, y, height)) + turn @ Vector((along, across, 0))


def raft(piece, field, rng):
    """One raft: strips of deck torn away whole, side by side, each as long as the ellipse is there at the strip's
    inner edge, so the planking covers the ellipse; beams under them, and under it all the spars and casks it rests
    on."""
    _, (x, y), half_length, half_breadth, heading, height = field
    turn = turned(math.radians(heading))
    middle = Vector((x, y, height))
    strips = math.ceil(half_breadth * 2 / STRIP_M)
    for index in range(strips):
        across = (index + 0.5) * STRIP_M - strips * STRIP_M / 2
        inner = max(0.0, abs(across) - STRIP_M / 2)
        if inner >= half_breadth:
            continue
        reach = half_length * math.sqrt(1 - (inner / half_breadth) ** 2)
        lift = rng.uniform(-0.02, 0.02) - 0.08
        start = middle + turn @ Vector((-reach, across, lift))
        end = middle + turn @ Vector((reach, across, lift))
        deck_section(piece, start, end, STRIP_M + 0.04, rng)


def underneath(piece, field, rng):
    """What a raft rests on, low over the sea: two lengths of mast along it and casks between them."""
    _, (x, y), half_length, half_breadth, heading, _ = field
    turn = turned(math.radians(heading))
    middle = Vector((x, y, SEA_Z + 0.15))
    for side in (-0.45, 0.45):
        start = middle + turn @ Vector((-half_length * 0.8, side * half_breadth, 0))
        end = middle + turn @ Vector((half_length * 0.85, side * half_breadth, 0))
        spar(piece, start, end, 0.34, rng)
    for _ in range(int(half_length)):
        place = middle + turn @ Vector((rng.uniform(-0.7, 0.7) * half_length, rng.uniform(-0.3, 0.3) * half_breadth,
                                        -0.2))
        barrel(piece, place, 0.32, 0.9, turn @ Vector((0, 1, 0)), rng)


def rim(piece, field, rng):
    """Broken timbers round a raft's edge, under its planking's top, so none stands in a body's way."""
    _, (x, y), half_length, half_breadth, heading, height = field
    turn = turned(math.radians(heading))
    middle = Vector((x, y, height - 0.3))
    pieces = 10
    for index in range(pieces):
        if rng.random() < 0.3:
            continue
        first = (index + rng.uniform(0.0, 0.2)) / pieces * math.tau
        last = (index + rng.uniform(0.7, 0.95)) / pieces * math.tau
        ends = [middle + turn @ Vector((math.cos(angle) * half_length, math.sin(angle) * half_breadth, 0))
                for angle in (first, last)]
        spar(piece, ends[0], ends[1], rng.uniform(0.12, 0.18), rng)


def fields(seed):
    """Every raft in a collection of its own, its planking ground a body walks on, what is under it not."""
    group = bpy.data.collections.new('Fields')
    bpy.context.scene.collection.children.link(group)
    for index, field in enumerate(FIELDS):
        rng = seeded(seed + index)
        planking = Piece()
        raft(planking, field, rng)
        build(planking, f'Field.{field[0]}', group, walk=True)
        under = Piece()
        underneath(under, field, rng)
        rim(under, field, rng)
        build(under, f'Field.{field[0]}.Under', group)
    return group


def footprints():
    """Each raft's ellipse in the wreck's frame: its middle, heading (degrees counter-clockwise from east), half length
    and half breadth."""
    return [(x, y, heading, half_length, half_breadth) for _, (x, y), half_length, half_breadth, heading, _ in FIELDS]
