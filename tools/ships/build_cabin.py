"""Builds the one cabin every ship opens into: a captain's cabin with walls leaning out as a ship's sides do, beams
across its ceiling, stairs down from a hatch at its forward end, windows across its stern, and a table with a chart
under a hanging lantern, chairs, a bunk, a sea chest and a desk.

    <python with bpy> tools/ships/build_cabin.py <out.blend>

Each ship's companionway is her entrance to it (tools/ships/ship_fittings.py, `Cabin.Entrance`). Here an empty named
`Cabin.Inside` marks where a player stands on coming down, and `Cabin.Exit` the foot of the stairs, where they go back
up. Its frame is a ship's (x toward her bow, y to port, z up), its floor at 0. Cloth and paper wear the sail part.
"""
import argparse
import os
import sys

import bpy  # noqa: I001 - Blender's own modules load once bpy has

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ship_fittings import TREAD_RISE_M  # noqa: E402
from ship_mesh import Piece  # noqa: E402

# The room, metres: its length, its half width at the floor and at the ceiling, and its height. It is roomy, its
# middle and forward floor left open, since players will furnish it as their own; entered as a space of its own, it
# need not fit inside a hull.
LENGTH_M = 10.0
FLOOR_HALF_M = 3.2
CEILING_HALF_M = 3.7
HEIGHT_M = 3.0
# The hatch the stairs come down through, at the room's forward end: its length and half width.
HATCH = (3.4, 0.6)
BEAM_EVERY_M = 0.9
# The stern windows: how many, how high their sills stand, and how tall each is.
WINDOWS = 6
WINDOW_FROM_M = 1.15
WINDOW_TALL_M = 0.95


def half_width(z):
    """The room's half width at height `z`: its walls lean out from the floor to the ceiling."""
    return FLOOR_HALF_M + (CEILING_HALF_M - FLOOR_HALF_M) * z / HEIGHT_M


def build_cabin(collection):
    """The cabin as one object, and the empties where a player comes down and goes back up."""
    piece = Piece()
    aft, fore = -LENGTH_M / 2, LENGTH_M / 2
    low, high = FLOOR_HALF_M, CEILING_HALF_M
    piece.quad([(aft, -low, 0), (fore, -low, 0), (fore, low, 0), (aft, low, 0)], 'deck', (0, 0, 1))
    for side in (1, -1):
        piece.quad([(aft, side * low, 0), (fore, side * low, 0), (fore, side * high, HEIGHT_M),
                    (aft, side * high, HEIGHT_M)], 'hull', (0, -side, 0))
    for x, facing in ((aft, 1), (fore, -1)):
        piece.quad([(x, -low, 0), (x, low, 0), (x, high, HEIGHT_M), (x, -high, HEIGHT_M)], 'hull', (facing, 0, 0))
    hatch_aft, hatch_half = fore - HATCH[0], HATCH[1]
    for y0, y1 in ((-high, -hatch_half), (hatch_half, high)):
        piece.quad([(aft, y0, HEIGHT_M), (fore, y0, HEIGHT_M), (fore, y1, HEIGHT_M), (aft, y1, HEIGHT_M)], 'hull',
                   (0, 0, -1))
    piece.quad([(aft, -hatch_half, HEIGHT_M), (hatch_aft, -hatch_half, HEIGHT_M), (hatch_aft, hatch_half, HEIGHT_M),
                (aft, hatch_half, HEIGHT_M)], 'hull', (0, 0, -1))
    beams(piece, aft, hatch_aft)
    foot = stairs(piece, fore, hatch_aft)
    windows(piece, aft)
    furniture(piece, aft)
    item = piece.build('Cabin', collection)
    for name, place in (('Cabin.Inside', (foot - 0.6, 0.0, 0.0)), ('Cabin.Exit', (foot - 0.1, 0.0, 0.0))):
        marker = bpy.data.objects.new(name, None)
        marker.location = place
        collection.objects.link(marker)
    return item


def beams(piece, aft, hatch_aft):
    """Beams across the ceiling, as far forward as the hatch."""
    x = aft + 0.4
    while x < hatch_aft - 0.1:
        piece.box((x - 0.09, -CEILING_HALF_M, HEIGHT_M - 0.16), (x + 0.09, CEILING_HALF_M, HEIGHT_M), 'spar',
                  skip=('top',))
        x += BEAM_EVERY_M
    piece.box((hatch_aft - 0.1, -CEILING_HALF_M, HEIGHT_M - 0.2), (hatch_aft, CEILING_HALF_M, HEIGHT_M), 'spar',
              skip=('top',))


def stairs(piece, fore, hatch_aft):
    """Treads from the hatch down to the floor, running aft along the room's middle, with a rail each side. Answers
    where their foot stands."""
    treads = round(HEIGHT_M / TREAD_RISE_M)
    run = (fore - hatch_aft + 0.4) / treads
    top = fore - 0.1
    for step in range(treads):
        x = top - (step + 1) * run
        z = HEIGHT_M - (step + 1) * HEIGHT_M / treads
        piece.box((x, -0.55, max(0.0, z - 0.05)), (x + run + 0.03, 0.55, max(0.05, z)), 'deck')
    bottom = top - treads * run
    for side in (1, -1):
        piece.prism((top, side * 0.6, HEIGHT_M), (bottom, side * 0.6, 0.0), 0.05, 'spar', sides=4)
        piece.prism((top, side * 0.6, HEIGHT_M + 0.9), (bottom, side * 0.6, 0.9), 0.03, 'spar', sides=6)
    return bottom


def windows(piece, aft):
    """Windows across the stern wall, framed and mullioned, their panes dark."""
    z0, tall = WINDOW_FROM_M, WINDOW_TALL_M
    width = half_width(z0) - 0.3
    spacing = 2 * width / WINDOWS
    for index in range(WINDOWS):
        y = -width + (index + 0.5) * spacing
        half = min(0.4, spacing / 2 - 0.08)
        piece.box((aft, y - half, z0 - 0.08), (aft + 0.06, y + half, z0 + tall + 0.08), 'spar')
        piece.quad([(aft + 0.065, y - half + 0.06, z0), (aft + 0.065, y + half - 0.06, z0),
                    (aft + 0.065, y + half - 0.06, z0 + tall), (aft + 0.065, y - half + 0.06, z0 + tall)], 'iron',
                   (1, 0, 0))
        piece.box((aft + 0.06, y - 0.025, z0), (aft + 0.09, y + 0.025, z0 + tall), 'spar')
        piece.box((aft + 0.06, y - half + 0.06, z0 + tall / 2 - 0.02), (aft + 0.09, y + half - 0.06,
                  z0 + tall / 2 + 0.02), 'spar')
        piece.box((aft + 0.02, y - half - 0.05, z0 - 0.14), (aft + 0.28, y + half + 0.05, z0 - 0.08), 'deck')


def furniture(piece, aft):
    """A captain's: a table with a chart under a lantern, two chairs, a bunk, a sea chest and a desk."""
    table_x = aft + 2.4
    top = 0.76
    piece.box((table_x - 0.85, -0.5, top - 0.06), (table_x + 0.85, 0.5, top), 'deck')
    for dx in (-0.75, 0.75):
        for dy in (-0.4, 0.4):
            piece.box((table_x + dx - 0.05, dy - 0.05, 0), (table_x + dx + 0.05, dy + 0.05, top - 0.06), 'spar')
    piece.box((table_x - 0.45, -0.3, top), (table_x + 0.35, 0.3, top + 0.01), 'sail')
    for side in (1, -1):
        chair(piece, table_x + 0.1, side * 0.85, side)
    lantern_top = HEIGHT_M - 0.16
    piece.prism((table_x, 0.0, lantern_top), (table_x, 0.0, lantern_top - 0.45), 0.012, 'iron', sides=4)
    piece.prism((table_x, 0.0, lantern_top - 0.45), (table_x, 0.0, lantern_top - 0.75), 0.11, 'iron', sides=6,
                end_radius=0.09)
    wall = FLOOR_HALF_M
    bunk_x = aft + 1.3
    piece.box((bunk_x - 1.0, -wall, 0), (bunk_x + 1.0, -wall + 0.9, 0.45), 'spar')
    piece.box((bunk_x - 0.95, -wall + 0.05, 0.45), (bunk_x + 0.95, -wall + 0.85, 0.6), 'sail')
    piece.box((bunk_x - 1.0, -wall + 0.82, 0.45), (bunk_x + 1.0, -wall + 0.9, 0.7), 'spar')
    chest_x = bunk_x + 1.55
    piece.box((chest_x - 0.4, -wall + 0.1, 0), (chest_x + 0.4, -wall + 0.65, 0.5), 'hull')
    for dx in (-0.25, 0.25):
        piece.box((chest_x + dx - 0.03, -wall + 0.08, 0), (chest_x + dx + 0.03, -wall + 0.67, 0.52), 'iron')
    desk_x = aft + 1.0
    piece.box((desk_x - 0.7, wall - 0.6, 0), (desk_x + 0.7, wall, 0.8), 'spar')
    for z in (0.2, 0.5):
        piece.box((desk_x - 0.6, wall - 0.62, z), (desk_x + 0.6, wall - 0.6, z + 0.22), 'deck')
    piece.box((desk_x - 0.65, wall - 0.55, 0.8), (desk_x + 0.65, wall - 0.05, 1.25), 'deck', skip=('bottom',))


def chair(piece, x, y, side):
    seat = 0.45
    piece.box((x - 0.22, y - 0.22, seat - 0.05), (x + 0.22, y + 0.22, seat), 'deck')
    for dx in (-0.18, 0.18):
        for dy in (-0.18, 0.18):
            piece.box((x + dx - 0.03, y + dy - 0.03, 0), (x + dx + 0.03, y + dy + 0.03, seat - 0.05), 'spar')
    back = y + side * 0.2
    piece.box((x - 0.22, back - 0.03, seat), (x + 0.22, back + 0.03, seat + 0.5), 'spar')


def main():
    arguments = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    arguments.add_argument('out')
    given = arguments.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_cabin(bpy.context.scene.collection)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(given.out))


if __name__ == '__main__':
    main()
