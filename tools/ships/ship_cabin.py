"""A ship's cabin, below her deck aft: its floor, its walls following her hull in to her stern, its ceiling the
underside of her quarterdeck and main deck, beams across it, the stairs down from her companionway, her stern windows
seen from inside, and a captain's furniture: a table with a chart under a hanging lantern, chairs, a bunk, a sea chest
and a desk.

It stands in a collection of its own that is not rendered, so her outside publishes alone; an empty named
`Cabin.Inside` marks where a player stands on coming down. Cloth and paper wear the sail part here.
"""
import bpy  # noqa: I001 - Blender's own modules load once bpy has

from ship_fittings import TREAD_RISE_M
from ship_mesh import Piece

FLOOR_M = 1.1
WALL_IN_M = 0.12
CEILING_DEPTH_M = 0.12


def build_cabin(hull):
    """Her cabin as an object in its own unrendered collection, with the empty where a player comes down."""
    collection = bpy.data.collections.new('Cabin')
    bpy.context.scene.collection.children.link(collection)
    collection.hide_render = True
    numbers = hull.numbers
    aft, fore = numbers['cabin_m']
    front, rise = numbers['quarterdeck_m']
    piece = Piece()
    places = [aft] + [x for x in hull.stations() if aft < x < fore] + [fore]
    walls = [(x, width(hull, x, FLOOR_M), width(hull, x, ceiling(hull, x)), ceiling(hull, x)) for x in places]
    for (x0, f0, t0, c0), (x1, f1, t1, c1) in zip(walls, walls[1:]):
        piece.quad([(x0, -f0, FLOOR_M), (x1, -f1, FLOOR_M), (x1, f1, FLOOR_M), (x0, f0, FLOOR_M)], 'deck', (0, 0, 1))
        for side in (1, -1):
            piece.quad([(x0, side * f0, FLOOR_M), (x1, side * f1, FLOOR_M), (x1, side * t1, c1),
                        (x0, side * t0, c0)], 'hull', (0, -side, 0))
        piece.quad([(x0, -t0, c0), (x1, -t1, c1), (x1, t1, c1), (x0, t0, c0)], 'hull', (0, 0, -1))
    for (x, f, top, c), facing in ((walls[0], 1), (walls[-1], -1)):
        piece.quad([(x, -f, FLOOR_M), (x, f, FLOOR_M), (x, top, c), (x, -top, c)], 'hull', (facing, 0, 0))
    low = ceiling(hull, front + 0.01)
    half = width(hull, front, low)
    piece.quad([(front, -half, low), (front, half, low), (front, half, low + rise), (front, -half, low + rise)],
               'hull', (1, 0, 0))
    beams(piece, hull, aft, fore)
    stairs(piece, hull, fore)
    windows(piece, hull, aft)
    furniture(piece, hull, aft)
    piece.build('Cabin', collection)
    marker = bpy.data.objects.new('Cabin.Inside', None)
    marker.location = (numbers['cabin_stairs_m'][1] - 0.5, 0.0, FLOOR_M)
    collection.objects.link(marker)
    return collection


def width(hull, x, z):
    """The cabin's half width at `x` and height `z`: her hull's inside there, less a lining, so its walls lean out
    with her sides."""
    return max(0.4, hull.surface(x, min(z, hull.deck(x) - 0.05))[0][1] - WALL_IN_M)


def ceiling(hull, x):
    """The underside of the deck over the cabin: her quarterdeck's aft of its front, her main deck's before it."""
    front, rise = hull.numbers['quarterdeck_m']
    return hull.deck(x) + (rise if x < front else 0.0) - CEILING_DEPTH_M


def beams(piece, hull, aft, fore):
    x = aft + 0.4
    while x < fore - 0.2:
        c = ceiling(hull, x)
        w = width(hull, x, c)
        piece.box((x - 0.09, -w, c - 0.16), (x + 0.09, w, c), 'spar', skip=('top',))
        x += 0.85


def stairs(piece, hull, fore):
    """Treads from the companionway's hatch down to the floor, running aft along her middle."""
    top_x, bottom_x = hull.numbers['cabin_stairs_m']
    top_z = hull.deck(top_x)
    treads = round((top_z - FLOOR_M) / TREAD_RISE_M)
    run = (top_x - bottom_x) / treads
    for step in range(treads):
        x = top_x - (step + 1) * run
        z = top_z - (step + 1) * (top_z - FLOOR_M) / treads
        piece.box((x, -0.45, z - 0.05), (x + run + 0.03, 0.45, z), 'deck')
    for side in (1, -1):
        piece.prism((top_x, side * 0.5, top_z), (bottom_x, side * 0.5, FLOOR_M), 0.05, 'spar', sides=4)
        piece.prism((top_x, side * 0.5, top_z + 0.9), (bottom_x, side * 0.5, FLOOR_M + 0.9), 0.03, 'spar', sides=6)


def windows(piece, hull, aft):
    """Her stern windows from inside: frames on the aft wall and the walls beside it, their panes dark."""
    z0 = hull.deck(hull.aft + 1) - 1.05
    w = width(hull, aft, z0)
    for y in (-0.75 * w, -0.25 * w, 0.25 * w, 0.75 * w):
        half = min(0.3, w / 4 - 0.04)
        piece.box((aft, y - half, z0 - 0.07), (aft + 0.06, y + half, z0 + 0.72), 'spar')
        piece.quad([(aft + 0.065, y - half + 0.06, z0), (aft + 0.065, y + half - 0.06, z0),
                    (aft + 0.065, y + half - 0.06, z0 + 0.65), (aft + 0.065, y - half + 0.06, z0 + 0.65)], 'iron',
                   (1, 0, 0))


def furniture(piece, hull, aft):
    """A captain's: a table with a chart under a lantern, two chairs, a bunk, a sea chest and a desk."""
    table_x = hull.numbers['cabin_table_x_m']
    top = FLOOR_M + 0.76
    piece.box((table_x - 0.85, -0.5, top - 0.06), (table_x + 0.85, 0.5, top), 'deck')
    for dx in (-0.75, 0.75):
        for dy in (-0.4, 0.4):
            piece.box((table_x + dx - 0.05, dy - 0.05, FLOOR_M), (table_x + dx + 0.05, dy + 0.05, top - 0.06),
                      'spar')
    piece.box((table_x - 0.45, -0.3, top), (table_x + 0.35, 0.3, top + 0.01), 'sail')
    for side in (1, -1):
        chair(piece, table_x + 0.1, side * 0.85, side)
    lantern_top = ceiling(hull, table_x) - 0.16
    piece.prism((table_x, 0.0, lantern_top), (table_x, 0.0, lantern_top - 0.45), 0.012, 'iron', sides=4)
    piece.prism((table_x, 0.0, lantern_top - 0.45), (table_x, 0.0, lantern_top - 0.75), 0.11, 'iron', sides=6,
                end_radius=0.09)
    bunk_x = aft + 1.9
    w = width(hull, bunk_x, FLOOR_M)
    piece.box((bunk_x - 1.0, -w, FLOOR_M), (bunk_x + 1.0, -w + 0.9, FLOOR_M + 0.45), 'spar')
    piece.box((bunk_x - 0.95, -w + 0.05, FLOOR_M + 0.45), (bunk_x + 0.95, -w + 0.85, FLOOR_M + 0.6), 'sail')
    piece.box((bunk_x - 1.0, -w + 0.82, FLOOR_M + 0.45), (bunk_x + 1.0, -w + 0.9, FLOOR_M + 0.7), 'spar')
    chest_x = bunk_x + 1.4
    piece.box((chest_x - 0.4, -w + 0.1, FLOOR_M), (chest_x + 0.4, -w + 0.65, FLOOR_M + 0.5), 'hull')
    for dx in (-0.25, 0.25):
        piece.box((chest_x + dx - 0.03, -w + 0.08, FLOOR_M), (chest_x + dx + 0.03, -w + 0.67, FLOOR_M + 0.52),
                  'iron')
    desk_x = aft + 1.7
    w = width(hull, desk_x, FLOOR_M)
    piece.box((desk_x - 0.7, w - 0.6, FLOOR_M), (desk_x + 0.7, w, FLOOR_M + 0.8), 'spar')
    for z in (FLOOR_M + 0.2, FLOOR_M + 0.5):
        piece.box((desk_x - 0.6, w - 0.62, z), (desk_x + 0.6, w - 0.6, z + 0.22), 'deck')
    piece.box((desk_x - 0.65, w - 0.55, FLOOR_M + 0.8), (desk_x + 0.65, w - 0.05, FLOOR_M + 1.25), 'deck',
              skip=('bottom',))


def chair(piece, x, y, side):
    seat = FLOOR_M + 0.45
    piece.box((x - 0.22, y - 0.22, seat - 0.05), (x + 0.22, y + 0.22, seat), 'deck')
    for dx in (-0.18, 0.18):
        for dy in (-0.18, 0.18):
            piece.box((x + dx - 0.03, y + dy - 0.03, FLOOR_M), (x + dx + 0.03, y + dy + 0.03, seat - 0.05), 'spar')
    back = y + side * 0.2
    piece.box((x - 0.22, back - 0.03, seat), (x + 0.22, back + 0.03, seat + 0.5), 'spar')
