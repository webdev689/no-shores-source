"""A ship's fittings in the Sloop's style: her wheel on its post, the rails across her quarterdeck's front and her
forecastle's back with steps at their corners, the posts paired along her rail, her stem and bitts, a hatch with its
grating, fife rails at her masts, stern windows, the companionway into her cabin, and her guns, which are the Sloop's
own.

The companionway's doors are her cabin's entrance; an empty named `Cabin.Entrance` marks where a player stands to
open them.
"""
import math

import bpy  # noqa: I001 - Blender's own modules load once bpy has
from mathutils import Euler, Matrix

from ship_hull import BODY_ROWS, inner
from ship_mesh import Piece, part_materials

# How far a gun's muzzle stands out past her planks, as the Sloop's do.
MUZZLE_OUT_M = 0.25
# A tread of her steps rises this much, as the Sloop's (tools/ships/deck.py walks 13 cm).
TREAD_RISE_M = 0.13


def inside(hull, x):
    """Her bulwark's inner face's half width at her deck, at `x`."""
    return inner(hull.section(x), len(BODY_ROWS))[0][0]


def build_fittings(hull, collection):
    """Her fittings as one object, and the empty that marks her cabin's entrance."""
    piece = Piece()
    numbers = hull.numbers
    wheel(piece, hull)
    breast_rail(piece, hull, *numbers['quarterdeck_m'], 1)
    if numbers.get('forecastle_m'):
        breast_rail(piece, hull, *numbers['forecastle_m'], -1)
    rail_posts(piece, hull)
    bow(piece, hull)
    hatch(piece, hull)
    for mast in numbers['masts']:
        fife_rail(piece, hull, mast['x'])
    stern_windows(piece, hull)
    entrance = companionway(piece, hull)
    item = piece.build('Fittings', collection)
    marker = bpy.data.objects.new('Cabin.Entrance', None)
    marker.location = entrance
    collection.objects.link(marker)
    return item


def wheel(piece, hull):
    """The wheel, its rim upright across her, on a post on her quarterdeck."""
    x = hull.numbers['helm_x_m']
    deck = hull.deck(x) + hull.numbers['quarterdeck_m'][1]
    for side in (1, -1):
        piece.box((x - 0.08, side * 0.12 - 0.06, deck), (x + 0.08, side * 0.12 + 0.06, deck + 1.05), 'spar')
    piece.box((x - 0.1, -0.2, deck + 1.0), (x + 0.1, 0.2, deck + 1.12), 'spar')
    # The rim stands aft of its posts, toward the hand at it, so the helm's spot behind it is clear of them.
    centre = (x - 0.15, 0.0, deck + 1.2)
    rim, spokes = 0.55, 8
    for step in range(16):
        first, second = (2 * math.pi * (step + offset) / 16 for offset in (0, 1))
        start = (centre[0], centre[1] + rim * math.cos(first), centre[2] + rim * math.sin(first))
        end = (centre[0], centre[1] + rim * math.cos(second), centre[2] + rim * math.sin(second))
        piece.prism(start, end, 0.035, 'spar', sides=4)
    for step in range(spokes):
        angle = 2 * math.pi * step / spokes
        tip = (centre[0], centre[1] + (rim + 0.18) * math.cos(angle), centre[2] + (rim + 0.18) * math.sin(angle))
        piece.prism(centre, tip, 0.025, 'spar', sides=4)
        piece.prism(tip, tuple(tip[axis] + (0, 0.04 * math.cos(angle), 0.04 * math.sin(angle))[axis]
                               for axis in range(3)), 0.04, 'spar', sides=6)
    piece.prism((centre[0] - 0.08, 0.0, centre[2]), (x, 0.0, centre[2]), 0.1, 'spar', sides=8)


def breast_rail(piece, hull, edge, rise, way):
    """A panelled rail across the edge of a raised deck, its posts topped by a rail, and steps at both its corners
    down onto her main deck, which lies the `way` along her from it (1 for her quarterdeck, -1 for her forecastle)."""
    deck = hull.deck(edge)
    top = deck + rise
    half = inside(hull, edge)
    gap = 0.9
    across = lambda back, front: tuple(edge + pick(way * back, way * front) for pick in (min, max))  # noqa: E731
    for side in (1, -1):
        near, far = side * (half - gap), side * 0.0
        low, high = min(near, far), max(near, far)
        x0, x1 = across(-0.06, 0.02)
        piece.box((x0, low, top), (x1, high, top + 0.5), 'hull')
        x0, x1 = across(-0.1, 0.06)
        piece.box((x0, low, top + 0.5), (x1, high, top + 0.6), 'spar')
        # Its posts stand proud of the rail and the panel both ways: a face shared with either renders black.
        for y in (near, near * 0.5) if side > 0 else (near, near * 0.5, 0.0):
            x0, x1 = across(-0.08, 0.08)
            piece.box((x0, y - 0.07, top), (x1, y + 0.07, top + 0.68), 'spar')
        treads = max(1, round(rise / TREAD_RISE_M))
        for step in range(treads):
            x0, x1 = across(0.0, (treads - step) * 0.25)
            z0, z1 = (deck + (step + level) * rise / treads for level in (0, 1))
            outer, inward = side * (half - 0.02), side * (half - gap + 0.05)
            piece.box((x0, min(outer, inward), z0), (x1, max(outer, inward), z1), 'deck', skip=('bottom',))


def rail_posts(piece, hull):
    """Short posts in pairs along her rail cap, between her gunports and toward her ends."""
    numbers = hull.numbers
    ports = sorted(numbers['ports'])
    places = [(first + second) / 2 for first, second in zip(ports, ports[1:])]
    places += [ports[0] - 1.6, ports[-1] + 1.6, hull.aft + 3.2, hull.fore - 3.6]
    for x in places:
        rows = hull.section(x)
        y, z = rows[-1]
        for offset in (-0.16, 0.16):
            for side in (1, -1):
                centre_y = side * (y - 0.05)
                piece.box((x + offset - 0.08, centre_y - 0.08, z + 0.08), (x + offset + 0.08, centre_y + 0.08,
                          z + 0.42), 'spar')


def bow(piece, hull):
    """Her stem, from where her keel meets her bow to over her rail, and the bitts the bowsprit seats between."""
    fore = hull.fore
    rail = hull.section(fore - 0.3)[-1][1]
    piece.box((fore - 0.35, -0.16, hull.keel(fore) - 0.05), (fore + 0.12, 0.16, rail + 0.55), 'hull')
    sprit = hull.numbers['bowsprit']['from_x_m']
    deck = hull.floor_at(sprit)
    for side in (1, -1):
        piece.box((sprit - 0.12, side * 0.3 - 0.11, deck), (sprit + 0.12, side * 0.3 + 0.11, deck + 1.25), 'spar')
    piece.box((sprit - 0.08, -0.45, deck + 0.75), (sprit + 0.08, 0.45, deck + 0.9), 'spar')


def hatch(piece, hull):
    """A hatch amidships: its coaming, and a grating of slats both ways."""
    x, half_length, half_width = hull.numbers['hatch_x_m'], 0.8, 0.7
    deck = hull.deck(x)
    piece.box((x - half_length, -half_width, deck), (x + half_length, half_width, deck + 0.3), 'hull',
              skip=('bottom', 'top'))
    # The slats' ends stop short of the coaming, so none shares its plane.
    inset = 0.02
    for step in range(7):
        y = -half_width + (step + 0.5) * 2 * half_width / 7
        piece.box((x - half_length + inset, y - 0.04, deck + 0.24), (x + half_length - inset, y + 0.04, deck + 0.3),
                  'deck')
    for step in range(8):
        x_slat = x - half_length + (step + 0.5) * 2 * half_length / 8
        piece.box((x_slat - 0.04, -half_width + inset, deck + 0.28), (x_slat + 0.04, half_width - inset, deck + 0.33),
                  'deck')


def fife_rail(piece, hull, x):
    """A rail round a mast's foot on four posts, with belaying pins through it, on the deck the mast stands on."""
    deck = hull.floor_at(x)
    for dx in (-0.55, 0.55):
        for dy in (-0.55, 0.55):
            piece.box((x + dx - 0.06, dy - 0.06, deck), (x + dx + 0.06, dy + 0.06, deck + 0.75), 'spar')
    for dy in (-0.55, 0.55):
        piece.box((x - 0.62, dy - 0.07, deck + 0.68), (x + 0.62, dy + 0.07, deck + 0.78), 'spar')
        for step in range(4):
            px = x - 0.35 + step * 0.23
            piece.prism((px, dy, deck + 0.62), (px, dy, deck + 0.95), 0.025, 'spar', sides=5)


def stern_windows(piece, hull):
    """Windows round her stern, each square to her side where it stands: a frame, a pane of glass and a mullion."""
    middle = hull.deck(hull.aft + 1) - 0.72
    for x, side in hull.numbers['stern_windows']:
        (_, py, _), _ = hull.surface(x, middle)
        out_x, out_y = hull.plan_out(x)
        out = (out_x, side * out_y, 0.0)
        across = (side * out_y, -out_x, 0.0)
        centre = (x, side * py, middle)
        panel(piece, centre, (across, out), (0.62, 0.78, 0.07), 'spar')
        pane = [tuple(centre[axis] + out[axis] * 0.075 + across[axis] * da + (0, 0, dz)[axis] for axis in range(3))
                for da, dz in ((-0.24, -0.3), (0.24, -0.3), (0.24, 0.3), (-0.24, 0.3))]
        piece.quad(pane, 'glass', out)
        panel(piece, tuple(centre[axis] + out[axis] * 0.08 for axis in range(3)), (across, out), (0.05, 0.6, 0.03),
              'spar')


def panel(piece, centre, frame, size, part):
    """A box standing on a curved side: `size` across, up and out, its back on `centre`, facing `frame`'s out."""
    across, out = frame
    width, height, depth = size
    corner = lambda a, z, o: tuple(centre[axis] + across[axis] * a + out[axis] * o + (0, 0, z)[axis]  # noqa: E731
                                   for axis in range(3))
    half_w, half_h = width / 2, height / 2
    faces = (
        ([(-half_w, -half_h), (half_w, -half_h), (half_w, half_h), (-half_w, half_h)], depth, out),
        ([(-half_w, -half_h), (-half_w, half_h), (half_w, half_h), (half_w, -half_h)], 0.0, tuple(-v for v in out)),
    )
    for corners, depth_at, facing in faces:
        piece.quad([corner(a, z, depth_at) for a, z in corners], part, facing)
    for (a0, z0), (a1, z1), facing in (((-half_w, -half_h), (half_w, -half_h), (0, 0, -1)),
                                       ((half_w, half_h), (-half_w, half_h), (0, 0, 1)),
                                       ((half_w, -half_h), (half_w, half_h), across),
                                       ((-half_w, half_h), (-half_w, -half_h), tuple(-v for v in across))):
        piece.quad([corner(a0, z0, 0.0), corner(a1, z1, 0.0), corner(a1, z1, depth), corner(a0, z0, depth)], part,
                   facing)


def companionway(piece, hull):
    """A companionway on her main deck before her quarterdeck: walls, a roof, and two doors facing forward. Answers
    where a player stands to open them."""
    front = hull.numbers['quarterdeck_m'][0]
    x0, x1, half, height = front + 0.1, front + 1.5, 0.75, 1.3
    deck = hull.deck(x1)
    piece.box((x0, -half, deck), (x1, half, deck + height), 'hull', skip=('bottom', 'top', 'fore'))
    for side in (1, -1):
        piece.box((x1 - 0.06, side * 0.62 - 0.14, deck), (x1 + 0.02, side * 0.62 + 0.14, deck + height), 'hull')
    piece.box((x0 - 0.08, -half - 0.1, deck + height), (x1 + 0.12, half + 0.1, deck + height + 0.1), 'hull')
    piece.box((x0 - 0.04, -half + 0.05, deck + height + 0.1), (x1 + 0.06, half - 0.05, deck + height + 0.22), 'deck')
    for side in (1, -1):
        y0, y1 = sorted((side * 0.02, side * 0.49))
        piece.box((x1 - 0.02, y0, deck + 0.04), (x1 + 0.03, y1, deck + height - 0.06), 'deck')
        piece.box((x1 + 0.03, side * 0.08 - 0.03, deck + 0.6), (x1 + 0.08, side * 0.08 + 0.03, deck + 0.68), 'iron')
        for z in (deck + 0.25, deck + height - 0.3):
            piece.box((x1 + 0.03, min(side * 0.4, side * 0.47), z), (x1 + 0.05, max(side * 0.4, side * 0.47),
                      z + 0.06), 'iron')
    return (x1 + 0.7, 0.0, deck)


def place_guns(hull, collection, sloop):
    """Her guns: the Sloop's port and starboard cannon, one at each of her ports on each side, named as hers are,
    numbered from her bow to her stern on her main deck and any lower gun deck together."""
    with bpy.data.libraries.load(sloop) as (source, wanted):
        wanted.objects = [name for name in source.objects if name in ('Cannon.Port.1', 'Cannon.Starboard.1')]
    models = {}
    parts = {material.name: material for material in part_materials()}
    for item in wanted.objects:
        mesh = item.data.copy()
        for slot, material in enumerate(mesh.materials):
            # Her materials come in as `iron.001` and the like beside this file's own parts; each is one of them.
            mesh.materials[slot] = parts[material.name.split('.')[0]]
        side = 1 if 'Port' in item.name else -1
        models[side] = (mesh, tuple(item.rotation_euler), tuple(item.scale), muzzle_of(item, side))
        bpy.data.objects.remove(item)
    for side, side_name in ((1, 'Port'), (-1, 'Starboard')):
        mesh, rotation, scale, (muzzle, bottom) = models[side]
        batteries = [(x, hull.deck(x)) for x in hull.numbers['ports']]
        batteries += [(x, hull.numbers['lower_deck_m']) for x in hull.numbers.get('lower_ports', ())]
        for number, (x, deck) in enumerate(sorted(batteries, reverse=True), start=1):
            gun = bpy.data.objects.new(f'Cannon.{side_name}.{number}', mesh.copy())
            gun.rotation_euler = rotation
            gun.scale = scale
            (_, out_y, _), _ = hull.surface(x, deck + bottom_to_muzzle(muzzle, bottom))
            gun.location = (x - muzzle[0], side * (out_y + MUZZLE_OUT_M) - muzzle[1], deck - bottom)
            collection.objects.link(gun)


def muzzle_of(item, side):
    """A gun's muzzle, the middle of its mouth, from its origin as placed and turned; and its lowest point, its wheels
    on the deck, below its origin."""
    # Loaded from the Sloop's file without a scene, its world matrix is not kept: its turn and size are.
    shape = Euler(item.rotation_euler).to_matrix() @ Matrix.Diagonal(item.scale)
    points = [shape @ vertex.co for vertex in item.data.vertices]
    outermost = max(side * point.y for point in points)
    mouth = [point for point in points if side * point.y > outermost - 0.03]
    centre = [sum(point[axis] for point in mouth) / len(mouth) for axis in range(3)]
    return centre, min(point.z for point in points)


def bottom_to_muzzle(muzzle, bottom):
    return muzzle[2] - bottom
