"""The wreck's ships as the ram left them: the Brig broken in two, her mainmast down and her waist fallen into her
flooded hold; Thule's Frigate with her bowsprit torn off, her mizzen down, her deck burnt through over her gun deck and
her side stove in; and a pirate Sloop sunk in the fight before, floating on her beam ends between them. Each ship is damaged in
her own frame (x her bow, y her port, z up, her waterline at 1.2), then laid in the wreck's.
"""
import bpy  # noqa: I001 - Blender's own modules load once bpy has
from mathutils import Vector

from ship_mesh import Piece
from wreck_damage import carve, faces_where, pieces_where, snap_mast, splinter_break, splinter_rim, tear_sails
from wreck_pieces import deck_section, seeded
from wreck_ships import SEA_Z, bake_placement, build_ship, meshes, move, placing, split

# Where each piece lies in the wreck's frame (x east, y north): the Frigate bow on into the Brig's starboard side; the
# Brig's halves pushed apart by her bow, each turned about its far end and settled lower at its break; the Sloop on
# her beam ends east of the Frigate's bow, her port side up and her masts flat on the sea away from the Frigate.
FRIGATE = {'at': (0.0, -19.2, 0.0), 'heading_deg': 90.0, 'pitch_deg': -1.5, 'roll_deg': 2.0}
STERN = {'pivot': (-17.0, 0.0, SEA_Z), 'at': (-19.4, 0.3, SEA_Z), 'heading_deg': 6.0, 'pitch_deg': 2.0,
         'roll_deg': -3.0}
BOW = {'pivot': (16.0, 0.0, SEA_Z), 'at': (18.8, 0.6, SEA_Z + 0.2), 'heading_deg': -9.0, 'pitch_deg': -3.0,
       'roll_deg': -6.0}
SLOOP = {'at': (11.6, -11.0, SEA_Z - 1.7), 'heading_deg': 95.0, 'roll_deg': 88.0, 'pitch_deg': 1.5,
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
    # Her deck burnt through between her mainmast and her quarterdeck: her gun deck lies open under it.
    breach = (-10.9, -3.5, -2.4, 3.5)
    lower = hull.numbers['lower_deck_m']

    carve(ship, breach, lambda point, part: lower + 0.35 < point.z < deck(point.x) + 1.6, keep=('Cannon',))
    pieces_where(ship, lambda point: breach[0] < point.x < breach[2] and breach[1] < point.y < breach[3]
                 and lower + 0.35 < point.z < deck(point.x) + 1.6)
    gun_deck(ship, hull, breach, rng)
    # The timber fallen from her gun deck up to her quarterdeck broke through its front and its breast rail.
    front = (-11.9, -1.35, -10.8, 1.35)
    carve(ship, front, lambda point, part: deck(point.x) - 0.2 < point.z < hull.floor_at(point.x) + 2.0,
          keep=('Cannon',))
    pieces_where(ship, lambda point: front[0] < point.x < front[2] and front[1] < point.y < front[3]
                 and deck(point.x) - 0.2 < point.z < hull.floor_at(point.x) + 2.0)
    # Her starboard bulwark stove in amidships, where the fallen yard from the Sloop leans on her.
    faces_where(ship, ('Cannon.Starboard.4',), lambda point, part: 4.2 < point.x < 8.4 and point.y < -4.4
                and point.z > deck(point.x) + 0.1)
    pieces_where(ship, lambda point: 4.2 < point.x < 8.4 and point.y < -3.8 and point.z > deck(point.x) - 0.2)
    move(ship, placing(**FRIGATE))
    return ship, hull


def gun_deck(ship, hull, breach, rng):
    """Her gun deck where her deck burnt away over it: its planks, the stubs of the deck's beams at the breach's
    sides, and the splintered rim."""
    x0, y0, x1, y1 = breach
    lower = hull.numbers['lower_deck_m']
    piece = Piece()
    half = hull.half_beam((x0 + x1) / 2) * 0.96
    piece.box((x0 - 0.8, -half, lower - 0.12), (x1 + 0.8, half, lower), 'deck')
    for x in (x0 + 1.2, (x0 + x1) / 2, x1 - 1.2):
        z = hull.deck(x) - 0.16
        for side in (-1, 1):
            reach = rng.uniform(0.3, 0.9)
            piece.prism((x, side * (y1 + 0.2), z), (x + rng.uniform(-0.1, 0.1), side * (y1 - reach), z - 0.1), 0.12,
                        'spar', sides=4, end_radius=0.04)
    piece.build('Frigate.GunDeck', ship)
    splinter_rim(ship, lambda point: x0 - 0.05 < point.x < x1 + 0.05 and y0 - 0.05 < point.y < y1 + 0.05
                 and abs(point.z - hull.deck(point.x)) < 0.4,
                 lambda point: Vector((0, -1 if point.y > 0 else 1, 0)) if abs(point.y) > y1 - 0.1
                 else Vector((1 if point.x < (x0 + x1) / 2 else -1, 0, 0)), 41, 'Frigate.Breach.Splinters')


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


def bridges(ground, seed):
    """The way across the gap between the Brig's halves: a section of her deck torn away whole, lying from one
    half's broken end to the other's, on the lower length of her fallen mainmast, which spans the gap under it; its
    upper length went into the sea."""
    rng = seeded(seed)
    way = collection('Bridges')
    piece = Piece()
    start = Vector((-3.6, 2.9, 0))
    end = Vector((3.4, 2.4, 0))
    start.z = (ground.z(start.x, start.y) or 3.0) + 0.06
    end.z = (ground.z(end.x, end.y) or 3.0) + 0.06
    deck_section(piece, start, end, 2.3, rng)
    item = piece.build('Bridge.Deck', way)
    item['walk'] = True
    mast = Piece()
    across = (end - start).normalized()
    foot = start + across * 1.1 - Vector((0, 0.35, 0.5))
    tip = end - across * 1.1 - Vector((0, 0.35, 0.5))
    mast.prism(tuple(foot), tuple(tip), 0.32, 'spar', sides=8)
    # Its upper length, broken off, lies afloat beside the gap.
    afloat = Vector((4.5, 8.5, SEA_Z + 0.05))
    mast.prism(tuple(afloat), tuple(afloat + Vector((14.0, 3.2, 0.0))), 0.3, 'spar', sides=8, end_radius=0.22)
    mast.build('Bridge.Mainmast', way)
    return way


def assemble(sloop_source, sloop_shaped, seed=7):
    """Every ship of the wreck, broken and laid: gives the collections by name, and the Brig's and the Frigate's
    hulls with each piece's placement, for laying things on them."""
    stern, bow, brig_hull = brig(sloop_source, seed)
    ship, frigate_hull = frigate(sloop_source, seed + 10)
    sunk = sloop(sloop_shaped)
    groups = {'Brig.Stern': stern, 'Brig.Bow': bow, 'Frigate': ship, 'Sloop': sunk}
    places = {'stern': STERN, 'bow': BOW, 'frigate': FRIGATE, 'sloop': SLOOP}
    return groups, {'brig': brig_hull, 'frigate': frigate_hull}, places
