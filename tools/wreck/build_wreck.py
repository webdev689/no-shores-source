"""Builds the wreck at sea, the prologue's level: the Brig broken in two by Thule's Frigate, which rammed her, both
burning, with the wreckage between and round them, painted with the game's pictures, ready for its lighting and export.

    <python with bpy> tools/wreck/build_wreck.py <out.blend> --sloop <the Sloop's source .blend> --pictures <file>

bpy is Blender as a Python module (a Python 3.13 venv with `pip install bpy==5.3.0`); the pictures are the bytes
`node tools/ships/ship_pictures.ts <file>` writes. The frame is the wreck's own: x east, y north, z up, metres, the sea
at z 1.2.
"""
import argparse
import os
import sys

import bpy  # noqa: I001 - Blender's own modules load once bpy has

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'ships'))
from paint_ship import paint, picture_materials, read_pictures  # noqa: E402
from wreck_dress import blockers, gates, ramps, wreckage  # noqa: E402
from wreck_frames import Frames  # noqa: E402
from wreck_fields import fields  # noqa: E402
from wreck_scene import assemble, clear_lane, clear_ways  # noqa: E402
from wreck_ships import Ground, meshes  # noqa: E402


def main():
    arguments = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    arguments.add_argument('out')
    arguments.add_argument('--sloop', required=True, help="the Sloop's source .blend, for every ship's guns")
    arguments.add_argument('--shaped', required=True, help='the Sloop shaped at her size (tools/ships/shape_ship.py)')
    arguments.add_argument('--pictures')
    given = arguments.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    groups, hulls, places = assemble(os.path.abspath(given.sloop), os.path.abspath(given.shaped))
    groups['Fields'] = fields(101)
    # Each half's broken end where a ramp leads off it onto the wreckage of her waist: nothing of hers stands there.
    clear_lane((groups['Brig.Stern'],), (-19.6, 6.2, -15.5, 9.6), 2.4, 5.6)
    clear_lane((groups['Brig.Bow'],), (16.0, 7.2, 20.6, 10.8), 2.4, 5.6)
    # Her port gangway is the way along her fallen waist.
    clear_lane((groups['Brig.Stern'],), (-26.2, 7.9, -19.0, 10.3), 2.6, 5.2)
    # The timber fallen from the Frigate's gun deck lands on her quarterdeck: what stood there was knocked down, her
    # companionway with it.
    clear_lane((groups['Frigate'],), (-1.7, -33.8, 1.7, -30.0), 4.4, 7.0)
    frames = Frames(places, hulls, Ground(groups.values()))
    groups['Ramps'] = ramps(frames, 201)
    clear_ways([group for name, group in groups.items() if name != 'Ramps'], groups['Ramps'])
    frames = Frames(places, hulls, Ground(groups.values()))
    groups['Blockers'] = blockers(frames, 301)
    groups['Wreckage'] = wreckage(frames, 401)
    for zone, group in gates(frames, 501).items():
        groups[f'Gate.{zone}'] = group
    materials = picture_materials(read_pictures(given.pictures) if given.pictures else None)
    for item in [item for group in groups.values() for item in meshes(group)]:
        paint(item, materials)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(given.out), compress=True)
    print(f'saved {given.out}')


if __name__ == '__main__':
    main()
