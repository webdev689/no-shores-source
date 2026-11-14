"""The third-person horse's grade: the Courser under the rider (riding.py), its coat and its mane graded onto
Daggerfall's brown town horse (TEXTURE.201 record 0), colour for colour at the grade's shares, as fpride.py grades
the ride onto the riding picture. layers.py lays it on the horse's layer.

    ARENA2_PATH=... node tools/sprite-forge/rideReference.mjs /tmp/horse-ref.json TEXTURE.201:0
    python -I tools/sprite-forge/horsegrade.py --reference /tmp/horse-ref.json [--samples 32]

The frames measured are the mounted animations' as the layers draw them, in every view, under the man's lights; the
mane is its strands and its cards, told from the coat by a render with the coat held out. Writes specs/HORSE-grade.json:
the coat as `horse` and the mane as `horsehair`, the layer's own raster classes."""
import argparse
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import forge  # noqa: E402
import horse  # noqa: E402
import riding  # noqa: E402
import stage  # noqa: E402

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
WORK = (360, 240)   # layers.py's work frame
MEASURED = {'horseidle': (0,), 'horsewalk': (0, 2, 4, 6), 'horsegallop': (0, 3, 5)}   # the frames measured


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reference', required=True, help="rideReference.mjs's measure of the town horse")
    ap.add_argument('--samples', type=int, default=32)
    args = ap.parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.load_light(os.path.join(SPECS, '488-light.json'))
    stage.setup(args.samples)
    stage.resize(*WORK)
    courser = riding.mount()
    tmp = os.path.join(tempfile.mkdtemp(), 'h.png')
    parts = []
    for anim, keys in MEASURED.items():
        for k in keys:
            for view, yaw in enumerate(forge.VIEW_YAW):
                courser.pose(riding.GAIT_OF[anim], riding.time_of(anim, k), yaw)
                shot = stage.render_rgba(tmp)
                parts.append((shot, courser.mane_where(shot, lambda: stage.render_rgba(tmp))))
        print(f'{anim}: {len(keys)} frames, five views', flush=True)
    grade = horse.fit_grade(parts, json.load(open(args.reference)), horse.MATERIAL_OF.values())
    with open(riding.HORSE_GRADE, 'w') as fh:
        json.dump(grade, fh, indent=1)
        fh.write('\n')
    print(f'the grade -> {riding.HORSE_GRADE}')


if __name__ == '__main__':
    main()
