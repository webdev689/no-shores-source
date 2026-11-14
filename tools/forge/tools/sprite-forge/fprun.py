"""The running arms' stride: the punching arm (the fists' own, specs/WEAPON10.json) through one stride, a pose an
eighth of it, written as specs/RUN-fit.json for fpforge.py to render. Daggerfall has no running arm to fit, so the
stroke is a few numbers: where the knuckles stand at its top, how far they travel down and out to its bottom, and how
the elbow, its depth, the turn and the wrist follow.

    python -I tools/sprite-forge/fprun.py

Frame k is k eighths of the stride, the right arm's stroke at sin(2 pi k / 8): the top (forward, the left foot planted)
at frame 2, the bottom (the hand passing the hip, below the view) at frame 6. The left arm is the right mirrored, half a
stride behind, in the game (src/combat/runForge.js)."""
import json
import math
import os

FIT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'RUN-fit.json')
FRAMES = 8
# the fist closed as the jab's, its back to the eye
FIST = {'knuckle': 88.0, 'fold': 86.0, 'spread': 0.0, 'thumb_in': 55.0, 'thumb_bend': 35.0}
# the knuckles' screen point at the stroke's top and their travel to its bottom; the elbow out from them and below the
# view, further out and lower as the arm falls; its depth, nearer at the top; the turn and the tilt held, the wrist
# leading the fist up and trailing it down
STROKE = {'tip': (214.0, 118.0), 'travel': (42.0, 100.0), 'elbow': (45.0, 262.0), 'elbow_travel': (20.0, 20.0),
          'depth': (0.5, 0.15), 'roll': 100.0, 'tilt': 10.0, 'wrist': 12.0}


def stride(k, n=FRAMES, S=STROKE):
    """Frame `k`'s pose: the stroke `t` from its top (0) to its bottom (1), rising while cos > 0."""
    phi = 2.0 * math.pi * k / n
    t, rising = (1.0 - math.sin(phi)) / 2.0, math.cos(phi)
    tip = [S['tip'][0] + S['travel'][0] * t, S['tip'][1] + S['travel'][1] * t]
    base = [tip[0] + S['elbow'][0] + S['elbow_travel'][0] * t, S['elbow'][1] + S['elbow_travel'][1] * t]
    pose = {'base': base, 'depth': S['depth'][0] + S['depth'][1] * t, 'tip': tip, 'roll': S['roll'],
            'wrist': S['wrist'] * rising, 'tilt': S['tilt'], **FIST}
    return {key: [round(x, 3) for x in v] if isinstance(v, list) else round(v, 3) for key, v in pose.items()}


def main():
    rows = [f'  "0:{k}": ' + json.dumps(stride(k)) for k in range(FRAMES)]
    with open(FIT, 'w') as f:
        f.write('{\n' + ',\n'.join(rows) + '\n}\n')
    print(f'{FRAMES} poses -> {FIT}')


if __name__ == '__main__':
    main()
