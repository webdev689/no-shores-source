"""The wreck's ships as the ram left them: the Brig broken in two, her mainmast down and her waist fallen into her
flooded hold; Thule's Frigate with her bowsprit torn off, her mizzen down, her side stove in and her port bulwark
broken; and a pirate Sloop sunk in the fight before, floating on her beam ends between them. Each ship is damaged in
her own frame (x her bow, y her port, z up, her waterline at 1.2), then laid in the wreck's.
"""
import bpy  # noqa: I001 - Blender's own modules load once bpy has
from mathutils import Vector

from wreck_damage import (
    carve,
    faces_where,
    pieces_where,
    small_pieces_where,
    snap_mast,
    splinter_break,
    splinter_rim,
    tear_sails,
)
from wreck_pieces import seeded
from wreck_ships import SEA_Z, bake_placement, build_ship, meshes, move, placing, split

# Where each piece lies in the wreck's frame (x east, y north): the Frigate bow on into where the Brig's waist was; the
# Brig's halves thrown far apart by her bow, each turned about its far end and settled a little lower at its break, the
# wreckage of her waist between them; the Sloop on her beam ends east of the Frigate's bow, her port side up and her
# masts flat on the sea away from the Frigate, floating high enough that her side stays out of the swell.
FRIGATE = {'at': (0.0, -19.2, 0.0), 'heading_deg': 90.0, 'pitch_deg': -1.5, 'roll_deg': 2.0}
STERN = {'pivot': (-17.0, 0.0, SEA_Z), 'at': (-34.0, 6.0, SEA_Z), 'heading_deg': 6.0, 'pitch_deg': 1.0,
         'roll_deg': -3.0}
BOW = {'pivot': (16.0, 0.0, SEA_Z), 'at': (34.0, 6.5, SEA_Z + 0.2), 'heading_deg': -9.0, 'pitch_deg': -1.5,
       'roll_deg': -4.0}
SLOOP = {'at': (25.0, -15.0, SEA_Z - 0.5), 'heading_deg': 95.0, 'roll_deg': 88.0, 'pitch_deg': 1.5,
         'pivot': (0.0, 0.0, SEA_Z)}
BREAK_X = 0.0


def collection(name):
    found = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(found)
    return found


def brig(sloop, seed):
    """The Brig, broken: gives her stern half and her bow half, each laid where it lies."""
    stern = collection('Brig.Stern')
    hull = build_ship('brig', stern, sloop)
    rng = seeded(seed)
    deck = hull.deck
    # Her mainmast went over the side with all its hamper; her foremast stands, its canvas burning to rags.
    snap_mast(stern, (-3.55, 0.0, deck(-3.55)), 1.6, 9.5, rng)
    tear_sails(stern, keep_share=0.5, seed=seed, near_foot=0.9)
    # Her waist on the side the Frigate struck fell into her hold; the guns there went with it.
    waist = (-9.3, -4.7, -0.4, 0.6)

    carve(stern, waist, lambda point, part: deck(point.x) - 0.4 < point.z < deck(point.x) + 0.45
          and part in ('deck', 'hull') and point.y > -4.05, keep=('Cannon',))
    # Her quarterdeck's breast rail was thrown down on her port side: the way off it, a drop to her waist.
    front, rise = hull.numbers['quarterdeck_m']
    thrown = (front - 0.4, 1.9, front + 0.4, 3.6)
    carve(stern, thrown, lambda point, part: deck(front) + rise - 0.05 < point.z < deck(front) + rise + 1.2,
          keep=('Cannon', 'Hull'))
    pieces_where(stern, lambda point: waist[0] < point.x < waist[2] and waist[1] < point.y < waist[3]
                 and deck(point.x) - 0.2 < point.z < deck(point.x) + 1.4 and abs(point.y) < 4.05)
    splinter_rim(stern, lambda point: waist[0] - 0.05 < point.x < waist[2] + 0.05 and waist[1] < point.y
                 < waist[3] + 0.05 and abs(point.z - deck(point.x)) < 0.3,
                 lambda point: Vector((0, -1, 0)) if point.y > waist[3] - 0.1 else Vector((1 if point.x < -5 else -1,
                                                                                            0, 0)), seed + 1,
                 'Brig.Waist.Splinters')
    # Her starboard bulwark forward of her break, where the Sloop's hull ground against her, and the gun there.
    opening = (3.6, 8.2)
    faces_where(stern, (), lambda point, part: opening[0] < point.x < opening[1]
                and point.y < -(hull.half_beam(point.x) - 0.45) and point.z > deck(point.x) + 0.12)
    pieces_where(stern, lambda point: opening[0] < point.x < opening[1] and point.y < -(hull.half_beam(point.x) - 0.9)
                 and point.z > deck(point.x) - 0.2)
    bow = split(stern, (BREAK_X, 0, 0), (1, 0, 0), 'Brig.Bow')
    splinter_break(stern, (BREAK_X, 0, 0), (1, 0, 0), (1, 0, -0.15), seed + 2, 'Brig.Stern.Break')
    splinter_break(bow, (BREAK_X, 0, 0), (1, 0, 0), (-1, 0, -0.15), seed + 3, 'Brig.Bow.Break')
    move(stern, placing(**STERN))
    move(bow, placing(**BOW))
    return stern, bow, hull


def frigate(sloop, seed):
    """Thule's Frigate as the ram and the fire left her: gives her collection, laid where she lies, and her Hull."""
    ship = collection('Frigate')
    hull = build_ship('frigate', ship, sloop)
    rng = seeded(seed)
    deck = hull.deck
    # Her bowsprit and jibboom tore away in the ram, and every headsail and stay to them.
    pieces_where(ship, lambda point: point.x > 17.0, parts=('spar', 'sail'))
    # Her fore topmast went by the board; her mizzen fell over the side, clearing her quarterdeck.
    snap_mast(ship, (11.4, 0.0, deck(11.4)), 13.0, 12.0, rng)
    snap_mast(ship, (-13.5, 0.0, deck(-13.5) + 0.8), 1.3, 11.0, rng)
    tear_sails(ship, keep_share=0.45, seed=seed, near_foot=0.8)
    # Her quarterdeck, Thule's ground, is open from its front to her wheel: the binnacle before the wheel and the
    # skylight on it were smashed and swept away, and so was the companionway before its front, by her mainmast.
    front = hull.numbers['quarterdeck_m'][0]
    pieces_where(ship, lambda point: -16.0 < point.x < front - 0.3 and abs(point.y) < 1.4
                 and point.z > hull.floor_at(point.x) - 0.05, parts=('hull', 'iron', 'spar'))
    faces_where(ship, (), lambda point, part: part != 'spar' and front + 0.05 < point.x < front + 1.7
                and abs(point.y) < 0.9 and deck(point.x) + 0.02 < point.z < deck(point.x) + 1.6)
    # Her starboard bulwark stove in amidships, where the fallen yard from the Sloop leans on her.
    faces_where(ship, ('Cannon.Starboard.4',), lambda point, part: 4.2 < point.x < 8.4 and point.y < -4.4
                and point.z > deck(point.x) + 0.1)
    pieces_where(ship, lambda point: 4.2 < point.x < 8.4 and point.y < -3.8 and point.z > deck(point.x) - 0.2)
    # Her port bulwark forward, broken where the wreckage off her port bow drifted against her: the way onto it.
    faces_where(ship, (), lambda point, part: 7.8 < point.x < 10.2 and point.y > hull.half_beam(point.x) - 0.45
                and point.z > deck(point.x) + 0.12)
    pieces_where(ship, lambda point: 7.8 < point.x < 10.2 and point.y > hull.half_beam(point.x) - 0.9
                 and point.z > deck(point.x) - 0.2)
    # Her port side stove in abreast her quarterdeck, where the wreckage off her port quarter drifted against her: her
    # bulwark and her side down to her lower guns are gone between the ports there, the way up onto it. Her
    # quarterdeck's planking stays, and nothing of her side stands under the way, where a body would meet it.
    side = (-6.5, 4.2, -3.5, 6.0)
    lower = hull.numbers['lower_deck_m']
    carve(ship, side, lambda point, part: lower - 0.3 < point.z < hull.floor_at(point.x) + 2.0
          and not (part == 'deck' and abs(point.z - hull.floor_at(point.x)) < 0.1), keep=('Cannon',))
    pieces_where(ship, lambda point: side[0] < point.x < side[2] and side[1] < point.y < side[3] + 0.4
                 and lower + 0.35 < point.z < hull.floor_at(point.x) + 2.0)
    move(ship, placing(**FRIGATE))
    return ship, hull


def sloop(shaped):
    """The pirate Sloop sunk in the fight, on her beam ends, from her shaped model: gives her collection, laid where she
    floats, her canvas gone."""
    ship = collection('Sloop')
    with bpy.data.libraries.load(shaped) as (source, wanted):
        wanted.objects = list(source.objects)
    for item in wanted.objects:
        if item is None or item.type != 'MESH':
            continue
        item.data = item.data.copy()
        ship.objects.link(item)
    for item in meshes(ship):
        bake_placement(item)
    pieces_where(ship, lambda point: True, parts=('sail',))
    move(ship, placing(**SLOOP))
    return ship


def clear_lane(groups, box, low, high):
    """Clears a way laid across a break (`box`, x0, y0, x1, y1 of the wreck's frame, between `low` and `high`): the
    splinters, fittings, lines and the broken boat there would stand in a body crossing it. Her hull stays."""
    x0, y0, x1, y1 = box
    for group in groups:
        for item in [item for item in meshes(group) if not item.get('walk') and 'Hull' not in item.name.split('.')]:
            lane = bpy.data.collections.new('Lane')
            lane.objects.link(item)
            pieces_where(lane, lambda point: x0 < point.x < x1 and y0 < point.y < y1 and low < point.z < high)
            bpy.data.collections.remove(lane)


# What stands in a body's way where a ramp meets a deck or a raft is cleared within this much of the ramp's line to
# either side, this far before its start and past its end, from just under it to over a head, metres; no piece longer
# than WAY_PIECE_M goes, so the decks and hulls a ramp lands on stay.
WAY_HALF_M = 1.3
WAY_PAST_M = 1.0
WAY_UNDER_M = 0.3
WAY_OVER_M = 2.0
WAY_PIECE_M = 2.0


def on_way(ends, point):
    """Whether `point` stands on a ramp's way, its `ends` (start, end): within WAY_HALF_M of its line across, from
    WAY_PAST_M before its start to as far past its end, from WAY_UNDER_M under it to WAY_OVER_M over it."""
    start, end = (Vector(end) for end in ends)
    run = Vector((end.x - start.x, end.y - start.y))
    length = run.length
    if length < 1e-6:
        return False
    along_unit = run / length
    offset = Vector((point.x - start.x, point.y - start.y))
    along = offset.dot(along_unit)
    if along < -WAY_PAST_M or along > length + WAY_PAST_M:
        return False
    if abs(offset.x * along_unit.y - offset.y * along_unit.x) > WAY_HALF_M:
        return False
    height = start.z + (end.z - start.z) * min(1.0, max(0.0, along / length))
    return height - WAY_UNDER_M < point.z < height + WAY_OVER_M


def clear_ways(groups, ramps):
    """Clears each ramp's way where it meets a deck or a raft: the splinters along a break or a hole's rim, the stubs
    of beams and the fittings standing on it, which with no climbing would close it (`on_way`). Hulls stay, as does
    what a body walks."""
    ways = [item['ends'] for item in meshes(ramps) if 'ends' in item]
    for group in groups:
        for item in [item for item in meshes(group) if not item.get('walk') and 'Hull' not in item.name.split('.')]:
            way = bpy.data.collections.new('Way')
            way.objects.link(item)
            small_pieces_where(way, lambda point: any(on_way(ends, point) for ends in ways), WAY_PIECE_M)
            bpy.data.collections.remove(way)


def assemble(sloop_source, sloop_shaped, seed=7):
    """Every ship of the wreck, broken and laid: gives the collections by name, and the Brig's and the Frigate's
    hulls with each piece's placement, for laying things on them."""
    stern, bow, brig_hull = brig(sloop_source, seed)
    ship, frigate_hull = frigate(sloop_source, seed + 10)
    sunk = sloop(sloop_shaped)
    groups = {'Brig.Stern': stern, 'Brig.Bow': bow, 'Frigate': ship, 'Sloop': sunk}
    places = {'stern': STERN, 'bow': BOW, 'frigate': FRIGATE, 'sloop': SLOOP}
    return groups, {'brig': brig_hull, 'frigate': frigate_hull}, places
