"""The wreck dressed for play: a heap of wreckage closing the way on from each zone until its wave falls, wreckage that
closes for good the ways round a zone, the ramps of fallen timber that join the pieces, loose wreckage on the decks,
and flotsam on the sea round it all. Places come from the ships' own frames (wreck_frames.py) where they stand on a
ship, from the wreck's where they join two.
"""
import math

import bpy  # noqa: I001 - Blender's own modules load once bpy has
from mathutils import Vector

from ship_mesh import Piece
from wreck_fields import FIELDS, at as on_field
from wreck_level import PATH, ZONES
from wreck_pieces import build, crate, deck_section, heap, scatter, seeded, spar
from wreck_scene import SLOOP
from wreck_ships import SEA_Z

# How high a heap is piled over the deck it stands on: past what a body climbs or jumps.
HEAP_M = 2.9
# The middle of the strip of the Sloop's side a body walks along, x in the wreck's frame: this far east of her middle.
SLOOP_STRIP_X = SLOOP['at'][0] + 0.7


def collection(name):
    found = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(found)
    return found


def lay_heap(piece, frames, ship, box, rng, height=HEAP_M):
    """A heap over `box` (x0, y0, x1, y1) of `ship`'s frame, on her floor there."""
    x0, y0, x1, y1 = frames.area(ship, *box)
    base = frames.on(ship, (box[0] + box[2]) / 2, (box[1] + box[3]) / 2).z
    heap(piece, (x0, y0, x1, y1), base, height, rng)


# The heaps that close the way on from each zone, by the zone they close: the ship's frame they stand in and their box
# there, or none for the quiet deck the player wakes on, whose way on is open. The last is the gate into the arena, on
# the ramp up to the Frigate's quarterdeck from the wreckage off her port quarter, a body's room short of her side. A
# heap on a ramp is piled from the ramp under its box's middle, which stands on one of its planks, not between two.
GATES = (
    None,
    ('wreck', (-0.6, 2.4, 1.1, 13.6)),
    ('wreck', (16.2, 5.6, 18.8, 11.8)),
    ('wreck', (23.0, -9.6, 29.0, -5.6)),
    ('frigate', (4.4, -5.6, 8.2, -4.2)),
    ('wreck', (-14.5, -18.8, -11.3, -17.2)),
    ('wreck', (-7.6, -25.5, -5.3, -22.7)),
)

# Wreckage that closes for good the ways round a zone: the steps up to the Frigate's quarterdeck at its front's
# corners, whose only way up is from the wreckage off her port quarter, heaped over her rails too.
BLOCKERS = (
    ('frigate', (-2.3, 3.3, -0.3, 5.9)),
    ('frigate', (-2.3, -5.9, -0.3, -3.3)),
)


def gate_boxes(frames):
    """Each gate's box in the wreck's frame (west, south, east, north), by the zone it closes: the ground its heap
    is piled over, which the game holds closed until the zone's wave falls."""
    def box(gate):
        if gate is None:
            return None
        ship, area = gate
        return area if ship == 'wreck' else frames.area(ship, *area)

    return [box(gate) for gate in GATES]


def gates(frames, seed):
    """Each gate's heap in a collection of its own, `Gate.<zone>`: gives the collections by the zone each closes."""
    made = {}
    for zone, gate in enumerate(GATES):
        if gate is None:
            continue
        ship, box = gate
        rng = seeded(seed + zone)
        piece = Piece()
        if ship == 'wreck':
            base = frames.ground.z((box[0] + box[2]) / 2, (box[1] + box[3]) / 2) or 3.0
            heap(piece, box, base, HEAP_M, rng)
        else:
            lay_heap(piece, frames, ship, box, rng)
        group = collection(f'Gate.{zone}')
        build(piece, f'Gate.{zone}.Heap', group)
        made[zone] = group
    return made


def core(piece, frames, ship, box, rng):
    """Crates stacked three high over all of `box` of `ship`'s frame, under a heap's loose wreckage, higher than her
    rail: no gap through it a body could find between its planks, nor a way along her rail over it."""
    x0, y0, x1, y1 = box
    size = 0.75
    across = max(1, round((x1 - x0) / size))
    along = max(1, round((y1 - y0) / size))
    # Each crate a little wider than the spacing, so they press into each other and leave no gap between them.
    wide = max((x1 - x0) / across, (y1 - y0) / along) + 0.1
    for column in range(across):
        for row in range(along):
            x = x0 + (column + 0.5) * (x1 - x0) / across
            y = y0 + (row + 0.5) * (y1 - y0) / along
            base = frames.on(ship, x, y)
            for level in range(3):
                crate(piece, base + Vector((0, 0, level * size)), wide, rng.uniform(-0.15, 0.15), rng)


def blockers(frames, seed):
    """The wreckage that closes ways for good, part of the wreck as it stands."""
    group = collection('Blockers')
    piece = Piece()
    for index, (ship, box) in enumerate(BLOCKERS):
        rng = seeded(seed + index)
        core(piece, frames, ship, box, rng)
        lay_heap(piece, frames, ship, box, rng, height=HEAP_M + 0.3)
    # No body stands on them, or climbs their planks over them.
    build(piece, 'Blockers.Heaps', group, wall=True)
    return group


def ramps(frames, seed):
    """The ways of fallen timber between the pieces: off the Brig's stern half onto the wreckage of her waist, from her
    torn deck up onto her bow half, from her fore deck onto the raft beside her and down from it onto the Sloop's side,
    off the Sloop onto the wreckage she drifted into and up from it into the Frigate's stove-in waist; out over her
    port bow, across from the wreckage there onto the wreckage off her port quarter, and up from it onto her
    quarterdeck. Each is ground a body walks on."""
    rng = seeded(seed)
    group = collection('Ramps')
    ground = frames.ground

    def sloop_top(y, lift=0.04):
        """The middle of the strip of the Sloop's side a body walks at `y` in the wreck's frame, between her keel's
        turn and her rail."""
        x = SLOOP_STRIP_X
        return Vector((x, y, ground.z(x, y, below=4.5) + lift))

    def field(name, along, across):
        """A point on a raft's planking, a ramp's end resting on it."""
        return on_field(name, along, across) - Vector((0, 0, 0.05))

    ways = (
        (frames.on('brig', -1.4, 0.0, 0.05), field('Waist', -6.6, 0.0)),
        (field('TornDeck', 7.2, 0.2), frames.on('brig', 1.4, 0.0, 0.05)),
        (frames.on('brig', 5.9, -2.3, 0.05), field('Fore', -4.0, 2.4)),
        (field('Fore', -0.6, -2.4), sloop_top(-11.0)),
        (sloop_top(-17.0), field('Sloop', -1.5, -4.2)),
        (field('Sloop', 2.4, 4.4), frames.on('frigate', 6.3, -3.4, 0.05)),
        (frames.on('frigate', 9.0, 3.6, 0.05), field('PortBow', 12.0, -1.4)),
        (field('PortBow', 7.0, -7.4), field('PortQuarter', 8.4, 0.0)),
        (field('PortQuarter', 5.0, -3.0), frames.on('frigate', -5.0, 4.4, 0.05)),
    )
    for index, (start, end) in enumerate(ways):
        piece = Piece()
        deck_section(piece, start, end, 2.2, rng)
        item = build(piece, f'Ramp.{index}', group, walk=True)
        item['ends'] = [list(start), list(end)]
    # A broken yard lies along the ramp up into the Frigate, as if it fell there and the planks after it: on its north
    # side, away from the way on aft.
    yard = Piece()
    first, last = ways[5]
    side = (last - first).cross(Vector((0, 0, 1))).normalized()
    spar(yard, first + side * 1.35 - Vector((0, 0, 0.1)), last + side * 1.35 + Vector((0, 0, 0.2)), 0.2, rng)
    build(yard, 'Ramp.Yard', group)
    return group


# Decks the wreckage is strewn over, by the ship's frame and a box in it, kept off the ways a body takes.
STREWN = (
    ('brig', (-16.8, -3.6, -11.0, -0.6), 9),
    ('brig', (-8.6, 2.9, -1.8, 3.9), 5),
    ('brig', (2.0, 0.6, 15.0, 3.9), 12),
    ('frigate', (9.0, -4.4, 15.5, 4.4), 12),
    ('frigate', (0.5, 1.8, 9.0, 4.4), 8),
    ('frigate', (-19.2, 2.6, -16.8, 3.9), 3),
)


# Strewn wreckage keeps this far off the way a body takes, its checkpoints and where its foes stand, metres.
CLEAR_OF_WAY_M = 1.3


def in_the_way(x, y):
    """Whether (x, y) of the wreck's frame lies on the way through it, or by a checkpoint or a foe."""
    spots = [zone['checkpoint'] for zone in ZONES] + [at for zone in ZONES for _, _, at, _ in zone['wave']]
    if any(math.hypot(x - spot[0], y - spot[1]) < CLEAR_OF_WAY_M for spot in spots):
        return True
    for (ax, ay), (bx, by) in zip(PATH, PATH[1:]):
        length = math.hypot(bx - ax, by - ay) or 1e-9
        share = max(0.0, min(1.0, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / length ** 2))
        if math.hypot(x - (ax + share * (bx - ax)), y - (ay + share * (by - ay))) < CLEAR_OF_WAY_M:
            return True
    return False


def wreckage(frames, seed):
    """Loose wreckage on the decks, kept off the way through, and flotsam on the sea all round."""
    group = collection('Wreckage')
    piece = Piece()
    for index, (ship, box, count) in enumerate(STREWN):
        rng = seeded(seed + index)
        x0, y0, x1, y1 = box
        # Each thing strewn draws its own place and its own seed first, so one kept off the way moves no other.
        for x, y, own in [(rng.uniform(x0, x1), rng.uniform(y0, y1), rng.random()) for _ in range(count)]:
            at = frames.on(ship, x, y)
            if not in_the_way(at.x, at.y):
                scatter(piece, (at.x - 0.1, at.y - 0.1, at.x + 0.1, at.y + 0.1), at.z, 1, seeded(int(own * 1e9)))
    # The rafts, strewn near their edges, their middles kept open to fight in.
    for index, (name, _, half_length, half_breadth, _, _) in enumerate(FIELDS):
        rng = seeded(seed + 20 + index)
        for _ in range(int(half_length * half_breadth / 6)):
            angle, reach, own = rng.uniform(0, math.tau), rng.uniform(0.6, 0.85), rng.random()
            spot = on_field(name, math.cos(angle) * reach * half_length, math.sin(angle) * reach * half_breadth)
            if not in_the_way(spot.x, spot.y):
                scatter(piece, (spot.x - 0.1, spot.y - 0.1, spot.x + 0.1, spot.y + 0.1), spot.z, 1, seeded(int(own * 1e9)))
    build(piece, 'Wreckage.Decks', group)
    afloat = Piece()
    rng = seeded(seed + 50)
    for _ in range(260):
        angle = rng.uniform(0, math.tau)
        reach = rng.uniform(10, 60)
        x, y = math.cos(angle) * reach * 1.2, -12 + math.sin(angle) * reach
        if frames.ground.z(x, y) is None:
            scatter(afloat, (x - 0.1, y - 0.1, x + 0.1, y + 0.1), SEA_Z + 0.02, 1, rng, floating=True)
    build(afloat, 'Wreckage.Flotsam', group)
    return group
