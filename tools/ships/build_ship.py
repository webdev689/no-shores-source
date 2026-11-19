"""Builds a ship's model in the Sloop's style from her numbers, ready for tools/ships/paint_ship.py.

    <python with bpy> tools/ships/build_ship.py <hull> <out.blend> --sloop <the Sloop's source .blend>

Her cannons are the Sloop's own, read from her source, so every ship's guns are one gun. Her companionway is her
entrance to the one cabin every ship shares, which tools/ships/build_cabin.py builds.
"""
import argparse
import os
import sys

import bpy  # noqa: I001 - Blender's own modules load once bpy has

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ship_details import build_details  # noqa: E402
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
             'boom_to_m': -1.2, 'gaff_m': 12.6, 'gaff_to_m': 0.6, 'gaff_rise_m': 2.0},
            {'x': -2.2, 'height_m': 16.0, 'topmast_m': 3.5, 'rake_deg': 5, 'radius_m': 0.27, 'boom_m': 2.75,
             'boom_to_m': -14.2, 'gaff_m': 14.0, 'gaff_to_m': -9.4, 'gaff_rise_m': 3.0},
        ),
        'bowsprit': {'from_x_m': 10.4, 'to_x_m': 20.5, 'rise_m': 2.2, 'radius_m': 0.22},
        'staysail': {'head_m': 13.4, 'clew_m': 2.8, 'clew_ahead_m': 1.0},
        'helm_x_m': -11.0,
        'hatch_x_m': 3.7,
        'boat_x_m': 0.6,
        'stern_windows': ((-12.35, 1), (-12.35, -1), (-12.85, 1), (-12.85, -1)),
    },
    # A square mast's yards are (height, reach either side): course, topsail, topgallant. Its masts stand where their
    # channels' chainplates fall between her gunports.
    'brig': {
        'length_m': 32.0,
        'beam_m': 8.6,
        'widest_m': (-8.0, 3.0),
        'stern_round': 2.6,
        'bow_fine': 1.25,
        'keel_m': -1.0,
        'fin_m': 0.85,
        'cutwater_m': 6.0,
        'sternpost_m': 3.6,
        'stern_rise_m': 1.5,
        'deck_m': 3.4,
        'sheer_m': (0.5, 1.0),
        'bulwark_m': 1.6,
        'station_m': 0.6,
        'quarterdeck_m': (-9.8, 0.7),
        'forecastle_m': (10.4, 0.6),
        'ports': (-7.8, -5.2, -2.6, 0.0, 2.6, 5.2, 7.8),
        'masts': (
            {'rig': 'square', 'x': 6.85, 'height_m': 11.5, 'topmast_m': 8.0, 'topgallant_m': 5.0, 'rake_deg': 2,
             'radius_m': 0.3, 'top_m': 1.5, 'course_foot_m': 2.2, 'yards': ((10.7, 6.0), (18.5, 4.6), (23.4, 3.2))},
            {'rig': 'square', 'x': -3.55, 'height_m': 12.5, 'topmast_m': 8.5, 'topgallant_m': 5.5, 'rake_deg': 4,
             'radius_m': 0.32, 'top_m': 1.6, 'course_foot_m': 2.2, 'yards': ((11.7, 6.6), (20.0, 5.0), (25.1, 3.4)),
             'spanker': {'boom_m': 3.4, 'boom_to_m': -17.6, 'gaff_m': 10.9, 'gaff_to_m': -11.0, 'gaff_rise_m': 2.4}},
        ),
        'bowsprit': {'from_x_m': 11.6, 'to_x_m': 22.5, 'rise_m': 2.6, 'radius_m': 0.3, 'jibboom_m': 6.5},
        # Her headsails: each bent to a stay from `stay_from_m` up her fore topmast, to her bowsprit's end or her
        # jibboom's; `clew_m` is over her deck at her stem, and `y_m` keeps the two out of one plane.
        'headsails': (
            {'stay_from_m': 19.1, 'head_x_m': 13.0, 'tack_x_m': 21.8, 'clew_x_m': 13.6, 'clew_m': 2.7, 'y_m': 0.15},
            {'stay_from_m': 18.95, 'to_jibboom': True, 'head_x_m': 15.0, 'tack_x_m': 28.2, 'clew_x_m': 18.5,
             'clew_m': 3.9, 'y_m': -0.15},
        ),
        'helm_x_m': -13.4,
        'hatch_x_m': 3.6,
        'boat_x_m': 0.8,
        'stern_windows': ((-15.35, 1), (-15.35, -1), (-15.85, 1), (-15.85, -1)),
    },
    # Her second gun deck lies `lower_deck_m` high inside her, its ports between those of her main deck. Her mizzen
    # stands on her quarterdeck, its lowest yard bare over her helm, with the spanker abaft it.
    'frigate': {
        'length_m': 40.0,
        'beam_m': 10.4,
        'widest_m': (-10.0, 4.0),
        'stern_round': 2.6,
        'bow_fine': 1.25,
        'keel_m': -1.2,
        'fin_m': 0.9,
        'cutwater_m': 7.5,
        'sternpost_m': 4.5,
        'stern_rise_m': 1.8,
        'deck_m': 3.8,
        'sheer_m': (0.55, 1.1),
        'bulwark_m': 1.7,
        'station_m': 0.6,
        'quarterdeck_m': (-11.0, 0.8),
        'forecastle_m': (13.5, 0.7),
        'ports': (-7.2, -3.0, 1.2, 5.4, 9.6),
        'lower_deck_m': 2.3,
        'lower_ports': (-9.3, -5.1, -0.9, 3.3, 7.5),
        'masts': (
            {'rig': 'square', 'x': 11.4, 'height_m': 13.5, 'topmast_m': 9.5, 'topgallant_m': 6.0, 'rake_deg': 2,
             'radius_m': 0.36, 'top_m': 1.8, 'course_foot_m': 2.4, 'yards': ((12.3, 7.4), (21.6, 5.6), (27.4, 3.9))},
            {'rig': 'square', 'x': -0.55, 'height_m': 14.5, 'topmast_m': 10.0, 'topgallant_m': 6.5, 'rake_deg': 3,
             'radius_m': 0.4, 'top_m': 2.0, 'course_foot_m': 2.4, 'yards': ((13.6, 8.2), (23.1, 6.2), (29.4, 4.3))},
            {'rig': 'square', 'x': -13.5, 'height_m': 12.0, 'topmast_m': 8.0, 'topgallant_m': 5.0, 'rake_deg': 4,
             'radius_m': 0.3, 'top_m': 1.5, 'course_foot_m': 2.4, 'yards': ((11.2, 6.0), (18.9, 4.4), (24.0, 3.0)),
             'bare_yards': 1,
             'spanker': {'boom_m': 3.6, 'boom_to_m': -22.5, 'gaff_m': 10.5, 'gaff_to_m': -17.5, 'gaff_rise_m': 2.6}},
        ),
        'bowsprit': {'from_x_m': 15.0, 'to_x_m': 28.0, 'rise_m': 3.0, 'radius_m': 0.38, 'jibboom_m': 8.0},
        'headsails': (
            {'stay_from_m': 22.4, 'head_x_m': 16.0, 'tack_x_m': 27.2, 'clew_x_m': 17.0, 'clew_m': 3.6, 'y_m': 0.15},
            {'stay_from_m': 22.1, 'to_jibboom': True, 'head_x_m': 18.5, 'tack_x_m': 35.0, 'clew_x_m': 23.0,
             'clew_m': 5.6, 'y_m': -0.15},
        ),
        'helm_x_m': -16.5,
        'hatch_x_m': 7.6,
        'boat_x_m': 3.5,
        'stern_windows': ((-19.35, 1), (-19.35, -1), (-19.85, 1), (-19.85, -1)),
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
    build_details(hull, collection)
    place_guns(hull, collection, os.path.abspath(given.sloop))
    # Where a hand stands behind her wheel, as the Sloop's 0.45 m aft of hers: the export keeps her helm there.
    helm = bpy.data.objects.new('Helm', None)
    wheel_x = hull.numbers['helm_x_m'] - 0.15
    helm.location = (wheel_x - 0.45, 0.0, hull.deck(wheel_x) + hull.numbers['quarterdeck_m'][1])
    collection.objects.link(helm)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(given.out))


if __name__ == '__main__':
    main()
