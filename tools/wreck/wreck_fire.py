"""The wreck's fires: where each burns and how big, laid as lights for the wreck's lighting to be baked from, and
written for the game, which burns the same fires over it (client/src/cinema/flames.ts).

A fire is round, or burns along a line: a yard, a rail, a strip of fallen canvas. Places are in a ship's frame over her
floor (`lift`), at a height in her frame (`z`), or in the wreck's frame, at a height (`z`) or on what stands there
(`lift`); `along` is the line's far end in the same frame. A fire laid on a floor burns on whatever stands there (a heap, a rail, the deck), never inside it, and never on
a heap that clears in play.
"""
import math

import bpy  # noqa: I001 - Blender's own modules load once bpy has
from mathutils import Vector

from wreck_ships import SEA_Z

# Each fire: (frame, x, y, lift or None, z or None, size in metres, along or None).
FIRES = (
    # The Brig's quarterdeck and the rims of her fallen waist and her broken end.
    ('brig', -14.4, -1.8, 0.0, None, 1.2, None),
    ('brig', -11.4, -3.0, 0.0, None, 1.5, None),
    ('brig', -7.0, 0.9, 0.0, None, 1.6, None),
    # The wreckage of her waist and her torn deck between her halves, burning along their edges.
    ('wreck', -10.5, 11.6, 0.0, None, 1.3, None),
    ('wreck', -8.0, 3.4, 0.0, None, 1.0, (-11.0, 4.4)),
    ('wreck', 4.0, 12.8, 0.0, None, 1.3, None),
    ('wreck', 13.0, 5.2, 0.0, None, 1.0, (15.4, 6.4)),
    # Her bow half: the foremast's course yard and the rags under it, her deck and her forecastle.
    ('brig', 6.85, -5.2, None, 13.9, 1.0, (6.85, 5.2)),
    ('brig', 9.4, 1.6, 0.0, None, 1.4, None),
    ('brig', 13.6, 0.6, 0.0, None, 1.1, None),
    ('brig', 2.8, -2.8, 0.0, None, 1.0, None),
    ('brig', 4.4, 2.8, 0.05, None, 0.8, (7.2, 2.5)),
    # The raft off her fore deck; the wreckage the Sloop drifted into, and burning wreckage afloat round her.
    ('wreck', 33.0, -2.6, 0.0, None, 1.2, None),
    ('wreck', 11.3, -22.6, 0.0, None, 1.4, None),
    ('wreck', 17.4, -9.6, 0.0, None, 1.0, None),
    ('wreck', 21.0, -28.0, None, SEA_Z + 0.05, 1.6, None),
    ('wreck', 7.5, -27.5, None, SEA_Z + 0.05, 1.2, None),
    # The Frigate: her forecastle, her course yards and the rags on them, her waist.
    ('frigate', 14.8, 0.6, 0.0, None, 1.8, None),
    ('frigate', 12.2, -1.6, 0.0, None, 1.2, None),
    ('frigate', 11.4, -6.8, None, 17.4, 1.0, (11.4, 6.8)),
    ('frigate', -0.55, -7.6, None, 18.4, 1.2, (-0.55, 7.6)),
    ('frigate', 4.0, 3.0, 0.0, None, 1.4, None),
    ('frigate', 1.2, -3.9, 0.0, None, 1.0, None),
    # The heaps closing her gangways for good, burning; her gun deck, burning between her guns.
    ('frigate', -2.0, 4.4, 0.6, None, 1.2, None),
    ('frigate', -10.1, -4.4, 0.6, None, 1.2, None),
    ('frigate', -4.6, 2.7, None, 2.32, 1.1, None),
    ('frigate', -9.4, -2.5, None, 2.32, 1.0, None),
    # Her quarterdeck, the arena: her stern rails ablaze behind Thule.
    ('frigate', -18.4, 1.8, 0.0, None, 1.4, None),
    ('frigate', -18.4, -1.8, 0.0, None, 1.4, None),
    ('frigate', -13.2, 4.6, 0.6, None, 0.7, (-17.6, 4.3)),
    ('frigate', -13.2, -4.6, 0.6, None, 0.7, (-17.6, -4.3)),
    # The wreckage off her port bow and her port quarter.
    ('wreck', -21.6, -12.0, 0.0, None, 1.6, None),
    ('wreck', -13.4, -0.8, 0.0, None, 1.1, None),
    ('wreck', -17.6, -30.0, 0.0, None, 1.4, None),
    ('wreck', -9.4, -33.6, 0.0, None, 1.0, None),
    # Patches of burning oil and wreckage on the sea round it all.
    ('wreck', -8.5, -17.6, None, SEA_Z + 0.04, 2.4, None),
    ('wreck', 20.5, -10.0, None, SEA_Z + 0.04, 1.8, None),
    ('wreck', -30.0, -20.0, None, SEA_Z + 0.04, 2.0, None),
    ('wreck', 8.0, 18.0, None, SEA_Z + 0.04, 1.6, None),
    ('wreck', -24.0, 16.0, None, SEA_Z + 0.04, 1.4, None),
    ('wreck', 7.0, -37.0, None, SEA_Z + 0.04, 1.8, None),
    ('wreck', 36.0, -14.0, None, SEA_Z + 0.04, 1.6, None),
)

# A fire's light: its colour, and its power by its size, watts a square metre of its size (Cycles' point lights).
FIRE_COLOUR = (1.0, 0.52, 0.18)
WATTS_PER_M2 = 420.0
# A line fire's lights stand this far apart along it, metres.
LIGHT_EVERY_M = 1.2
# A fire laid on a floor is set on the highest face looking up under this height over its floor, metres: over a heap.
SETTLE_FROM_M = 3.4


def standing_ground():
    """The wreck's faces that look up and stay: all but a heap's, which clears as its wave falls (a heap is a `Gate.`
    collection before the wreck is joined, its `piece` after)."""
    from mathutils.bvhtree import BVHTree
    points, triangles = [], []
    for item in bpy.data.objects:
        if item.type != 'MESH' or any(group.name.startswith('Gate.') for group in item.users_collection):
            continue
        # No object of the wreck has a parent: its own placement is where it stands, read before any scene update.
        placement = item.matrix_basis
        turn = placement.to_3x3()
        mesh = item.data
        mesh.calc_loop_triangles()
        pieces = mesh.attributes.get('piece')
        start = len(points)
        points.extend(placement @ vertex.co for vertex in mesh.vertices)
        for triangle in mesh.loop_triangles:
            if pieces is not None and pieces.data[triangle.polygon_index].value > 0:
                continue
            if (turn @ triangle.normal).normalized().z > 0.5:
                triangles.append(tuple(start + index for index in triangle.vertices))
    return BVHTree.FromPolygons(points, triangles, all_triangles=True)


def settled(ground, point):
    """`point` set on the highest face looking up under SETTLE_FROM_M over it, or left where it is over none."""
    hit = ground.ray_cast(point + Vector((0, 0, SETTLE_FROM_M)), Vector((0, 0, -1)))[0]
    return point if hit is None else Vector((point.x, point.y, hit.z))


def fires(frames, ground):
    """Every fire in the wreck's frame: its base, its size, and the vector along it of a line fire (else None); a fire
    laid on a floor set on what stands there, by `ground` (standing_ground)."""
    found = []
    for frame, x, y, lift, z, size, along in FIRES:
        if frame == 'wreck':
            # One on what stands there is looked for from over every raft and deck.
            height = z if lift is None else 6.0
            base = Vector((x, y, height))
            end = None if along is None else Vector((along[0], along[1], height))
            if lift is not None:
                base = settled(ground, base)
                end = None if end is None else settled(ground, end)
        else:
            base = frames.on(frame, x, y, lift or 0.0, z=z)
            end = None if along is None else frames.on(frame, along[0], along[1], lift or 0.0, z=z)
            if lift is not None:
                base = settled(ground, base)
                end = None if end is None else settled(ground, end)
        found.append({'at': base, 'size': size, 'along': None if end is None else end - base})
    return found


def light(collection, burning):
    """Cycles' point lights for each fire, a line fire's spread along it, at the middle of its flames."""
    for index, fire in enumerate(burning):
        along = fire['along']
        count = 1 if along is None else max(2, math.ceil(along.length / LIGHT_EVERY_M))
        power = WATTS_PER_M2 * fire['size'] ** 2 / count * (1 if along is None else along.length / 2)
        for step in range(count):
            share = 0.5 if count == 1 else step / (count - 1)
            at = fire['at'] + (along * share if along is not None else Vector()) + Vector((0, 0, fire['size'] * 0.5))
            data = bpy.data.lights.new(f'Fire.{index}.{step}', 'POINT')
            data.color = FIRE_COLOUR
            data.energy = power
            data.shadow_soft_size = fire['size'] * 0.35
            lamp = bpy.data.objects.new(data.name, data)
            lamp.location = at
            collection.objects.link(lamp)
