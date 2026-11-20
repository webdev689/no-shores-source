"""The wreck dressed for play: a heap of wreckage closing the way on from each zone until its wave falls, wreckage that
closes for good the ways round a zone, the ramps of fallen timber that join the pieces, loose wreckage on the decks,
and flotsam on the sea round it all. Places come from the ships' own frames (wreck_frames.py) where they stand on a
ship, from the wreck's where they join two.
"""
import math

import bpy  # noqa: I001 - Blender's own modules load once bpy has
from mathutils import Vector

from ship_mesh import Piece
from wreck_level import PATH, ZONES
from wreck_pieces import build, crate, deck_section, heap, scatter, seeded, spar
from wreck_ships import SEA_Z

# How high a heap is piled over the deck it stands on: past what a body climbs or jumps.
HEAP_M = 2.9
# The middle of the strip of the Sloop's side a body walks along, x in the wreck's frame (wreck_scene.SLOOP).
SLOOP_STRIP_X = 12.3


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
# there. The last is the gate into the arena.
GATES = (
    ('brig', (-10.0, 0.5, -8.9, 4.9)),
    ('wreck', (-5.0, 0.2, -3.6, 6.6)),
    ('wreck', (3.2, -2.6, 4.8, 7.0)),
    ('brig', (3.8, -4.6, 8.0, -3.0)),
    ('frigate', (4.4, -5.6, 8.2, -4.2)),
    ('frigate', (-2.8, -3.6, -1.7, 3.6)),
    ('frigate', (-13.0, -5.4, -10.8, 5.4)),
)

# Wreckage that closes for good the ways round a zone: the Frigate's gangways either side of her burnt-out gun deck,
# whose only way aft is down through it, heaped over her rails too.
BLOCKERS = (
    ('frigate', (-2.8, 3.4, -1.8, 5.9)),
    ('frigate', (-2.8, -5.9, -1.8, -3.4)),
    ('frigate', (-10.7, 3.4, -9.5, 5.9)),
    ('frigate', (-10.7, -5.9, -9.5, -3.4)),
)


def gate_boxes(frames):
    """Each gate's box in the wreck's frame (west, south, east, north), by the zone it closes: the ground its heap
    is piled over, which the game holds closed until the zone's wave falls."""
    return [box if ship == 'wreck' else frames.area(ship, *box) for ship, box in GATES]


def gates(frames, seed):
    """Each gate's heap in a collection of its own, `Gate.<zone>`: gives the collections in zone order."""
    made = []
    for zone, (ship, box) in enumerate(GATES):
        rng = seeded(seed + zone)
        piece = Piece()
        if ship == 'wreck':
            base = frames.ground.z((box[0] + box[2]) / 2, (box[1] + box[3]) / 2) or 3.0
            heap(piece, box, base, HEAP_M, rng)
        else:
            lay_heap(piece, frames, ship, box, rng)
        group = collection(f'Gate.{zone}')
        build(piece, f'Gate.{zone}.Heap', group)
        made.append(group)
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
    """The ways of fallen timber between the pieces: down from the Brig's bow half onto the Sloop's side; up from the
    Sloop's side into the Frigate's stove-in waist; and down into her gun deck and up out of it to her quarterdeck.
    Each is ground a body walks on."""
    rng = seeded(seed)
    group = collection('Ramps')
    ground = frames.ground

    def sloop_top(y, lift=0.04):
        """The middle of the strip of the Sloop's side a body walks at `y` in the wreck's frame, between her keel's
        turn and her rail."""
        x = SLOOP_STRIP_X
        return Vector((x, y, ground.z(x, y, below=4.5) + lift))

    ways = (
        (frames.on('brig', 5.9, -2.3, 0.05), sloop_top(-8.6)),
        (sloop_top(-13.0), frames.on('frigate', 6.3, -3.4, 0.05)),
        (frames.on('frigate', -1.7, 0.0, 0.03), frames.on('frigate', -5.2, 0.0, z=frames.lower + 0.04)),
        (frames.on('frigate', -6.8, 0.0, z=frames.lower + 0.04), frames.on('frigate', -12.3, 0.0, 0.05)),
    )
    for index, (start, end) in enumerate(ways):
        piece = Piece()
        deck_section(piece, start, end, 2.2, rng)
        item = build(piece, f'Ramp.{index}', group, walk=True)
        item['ends'] = [list(start), list(end)]
    # A broken yard lies along the Sloop's ramp, as if it fell there and the planks after it: on its south side, away
    # from the way along her that comes onto it.
    yard = Piece()
    first, last = ways[1]
    side = -(last - first).cross(Vector((0, 0, 1))).normalized()
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
    ('frigate', (-9.4, -3.2, -5.6, -1.6), 4),
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
    build(piece, 'Wreckage.Decks', group)
    afloat = Piece()
    rng = seeded(seed + 50)
    for _ in range(160):
        angle = rng.uniform(0, math.tau)
        reach = rng.uniform(8, 46)
        x, y = 2 + math.cos(angle) * reach * 1.1, -14 + math.sin(angle) * reach
        if frames.ground.z(x, y) is None:
            scatter(afloat, (x - 0.1, y - 0.1, x + 0.1, y + 0.1), SEA_Z + 0.02, 1, rng, floating=True)
    build(afloat, 'Wreckage.Flotsam', group)
    return group
