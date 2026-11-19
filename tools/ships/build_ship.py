"""Builds a ship's model in the Sloop's style from her numbers, ready for tools/ships/paint_ship.py.

    <python with bpy> tools/ships/build_ship.py <hull> <out.blend> --sloop <the Sloop's source .blend>

Her cannons are the Sloop's own, read from her source, so every ship's guns are one gun. Her cabin is built in a
collection of its own that is not rendered, so tools/ships/export_ship.py publishes her outside alone.
"""
import argparse
import os
import sys

import bpy  # noqa: I001 - Blender's own modules load once bpy has

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ship_cabin import build_cabin  # noqa: E402
from ship_fittings import build_fittings, place_guns  # noqa: E402
from ship_hull import Hull, build_hull  # noqa: E402
from ship_rig import build_rig  # noqa: E402

# Each hull's numbers, metres, in her frame (x to her bow, y to port, z up) with her waterline at 1.2 m as the Sloop's.
# Her sections stand every `station_m`; `widest_m` is the stretch of her at full beam; `stern_round` shapes her stern
# in plan (larger is fuller); her keel rises over `cutwater_m` to her stem and `sternpost_m` to her stern.
HULLS = {
    'schooner': {
        'length_m': 26.0,
        'beam_m': 6.6,
        'widest_m': (-6.5, 2.5),
        'stern_round': 2.6,
        'bow_fine': 1.25,
        'keel_m': -0.8,
        'fin_m': 0.7,
        'cutwater_m': 5.0,
        'sternpost_m': 3.0,
        'stern_rise_m': 1.3,
        'deck_m': 3.1,
        'sheer_m': (0.45, 0.9),
        'bulwark_m': 1.5,
        'station_m': 0.6,
        'quarterdeck_m': (-7.6, 0.6),
        'ports': (-6.0, -3.4, -0.8, 1.8, 4.4),
        'masts': (
            {'x': 5.4, 'height_m': 14.5, 'topmast_m': 3.0, 'rake_deg': 4, 'radius_m': 0.24, 'boom_m': 1.9,
             'boom_to_m': -1.2, 'gaff_m': 12.6, 'gaff_to_m': 0.6, 'gaff_rise_m': 2.6},
            {'x': -2.2, 'height_m': 16.0, 'topmast_m': 3.5, 'rake_deg': 5, 'radius_m': 0.27, 'boom_m': 2.75,
             'boom_to_m': -14.2, 'gaff_m': 14.0, 'gaff_to_m': -9.4, 'gaff_rise_m': 3.0},
        ),
        'bowsprit': {'from_x_m': 10.4, 'to_x_m': 20.5, 'rise_m': 2.2, 'radius_m': 0.22},
        'staysail': {'head_m': 13.4, 'clew_m': 2.2, 'clew_ahead_m': 1.0},
        'helm_x_m': -11.0,
        'hatch_x_m': 1.6,
        'stern_windows': ((-12.35, 1), (-12.35, -1), (-12.85, 1), (-12.85, -1)),
        'cabin_m': (-12.3, -6.0),
        'cabin_stairs_m': (-6.3, -8.6),
        'cabin_table_x_m': -10.0,
    },
}


def main():
    arguments = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    arguments.add_argument('hull', choices=sorted(HULLS))
    arguments.add_argument('out')
    arguments.add_argument('--sloop', required=True)
    given = arguments.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collection = bpy.context.scene.collection
    hull = Hull(HULLS[given.hull])
    build_hull(hull, collection)
    build_rig(hull, collection)
    build_fittings(hull, collection)
    place_guns(hull, collection, os.path.abspath(given.sloop))
    build_cabin(hull)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(given.out))


if __name__ == '__main__':
    main()
