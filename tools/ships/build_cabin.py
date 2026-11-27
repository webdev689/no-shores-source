"""Builds the one cabin every ship opens into: a captain's cabin with walls leaning out as a ship's sides do, beams
across its ceiling, stairs down from a hatch at its forward end, and windows across its stern, furnished by
tools/ships/cabin_props.py along its walls and stern.

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
from cabin_props import furnish  # noqa: E402
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
    furnish(piece, {'aft': aft, 'fore': fore, 'hatch_aft': hatch_aft, 'hatch_half': hatch_half, 'height': HEIGHT_M,
                    'floor_half': FLOOR_HALF_M, 'ceiling_half': CEILING_HALF_M, 'beam_every': BEAM_EVERY_M})
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
        piece.slab((bottom, side * 0.55, -0.1), ((top - bottom, 0, HEIGHT_M), (0, side * 0.06, 0), (0, 0, 0.32)),
                   'spar')
        handrail(piece, (bottom, top), side * 0.6)
    return bottom


def handrail(piece, run, y):
    """A rail up one side of the stairs: a newel post at their foot, balusters standing on the stringer, and the
    rail rising with the treads until a post ties it into the hatch's coaming."""
    bottom, top = run
    rail_at = lambda share: (bottom + share * (top - bottom), y, 0.95 + share * HEIGHT_M)  # noqa: E731
    end = (HEIGHT_M - 0.25 - 0.95) / HEIGHT_M
    piece.box((bottom - 0.07, y - 0.07, 0.0), (bottom + 0.07, y + 0.07, 1.05), 'spar')
    piece.box((bottom - 0.09, y - 0.09, 1.05), (bottom + 0.09, y + 0.09, 1.12), 'spar')
    piece.prism(rail_at(0.0), rail_at(end), 0.035, 'spar', sides=6)
    share = 0.1
    while share < end:
        x, _, rail_z = rail_at(share)
        piece.prism((x, y, 0.22 + share * HEIGHT_M), (x, y, rail_z), 0.018, 'spar', sides=4, caps=False)
        share += 0.09
    x, _, rail_z = rail_at(end)
    piece.box((x - 0.05, y - 0.05, rail_z - 0.05), (x + 0.05, y + 0.05, HEIGHT_M - 0.2), 'spar')


def windows(piece, aft):
    """Windows across the stern wall, framed and mullioned, their panes glass."""
    z0, tall = WINDOW_FROM_M, WINDOW_TALL_M
    width = half_width(z0) - 0.3
    spacing = 2 * width / WINDOWS
    for index in range(WINDOWS):
        y = -width + (index + 0.5) * spacing
        half = min(0.4, spacing / 2 - 0.08)
        piece.box((aft, y - half, z0 - 0.08), (aft + 0.06, y + half, z0 + tall + 0.08), 'spar')
        piece.quad([(aft + 0.065, y - half + 0.06, z0), (aft + 0.065, y + half - 0.06, z0),
                    (aft + 0.065, y + half - 0.06, z0 + tall), (aft + 0.065, y - half + 0.06, z0 + tall)], 'glass',
                   (1, 0, 0))
        piece.box((aft + 0.06, y - 0.025, z0), (aft + 0.09, y + 0.025, z0 + tall), 'spar')
        piece.box((aft + 0.06, y - half + 0.06, z0 + tall / 2 - 0.02), (aft + 0.09, y + half - 0.06,
                  z0 + tall / 2 + 0.02), 'spar')
        piece.box((aft + 0.02, y - half - 0.05, z0 - 0.14), (aft + 0.28, y + half + 0.05, z0 - 0.08), 'deck')


def main():
    arguments = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    arguments.add_argument('out')
    given = arguments.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build_cabin(bpy.context.scene.collection)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(given.out))


if __name__ == '__main__':
    main()
