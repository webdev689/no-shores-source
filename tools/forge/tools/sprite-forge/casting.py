"""A player's own cast, which Daggerfall draws none of. The weapon is put away and the hands are free: the left hand
gathers the spell low before the body, draws it back beside the shoulder, thrusts it out at the foe and follows
through. The chest winds back and turns into the throw, and the weight goes onto the front foot. The right fist
balances it, and holds a torch where one is carried (torch3p.py). Four frames, keyed in body space as the one-handed
moves are, the same in every view. The light in the hand is the spell's spark, Daggerfall's mage's (gear.py
`build_sparks`), at its three sizes as the mage throws it: small as it gathers, swelling as it is drawn back, burst
out ahead of the palm at the throw, gone after.

A class foe casts as Daggerfall's mage does (poses.py `spell`), its weapon in its fist. This move is the player's, so
no class look's own moves name it (layers.py `own_moves`).

Points and ways are in body space, as poses.py's: the ground under the body, +X its left, -Y ahead, +Z up."""
import math

from mathutils import Matrix, Vector

import poses
from onehand import GUARD
from rig import solve_arm

CAST = {'cast': 4}
WRIST = 0.08   # the palm's middle past the wrist, along the fingers

# the legs: the weight back as it gathers and draws, thrown onto the bent left knee at the throw (attacks.py's)
BACK = {'thigh_L': (-14, -8, -12), 'shin_L': (8, 0, 0), 'thigh_R': (6, 10, 16), 'shin_R': (32, 0, 0)}
DRIVE = {'thigh_L': (-30, -8, -12), 'shin_L': (30, 0, 0), 'thigh_R': (22, 10, 16), 'shin_R': (10, 0, 0)}
LUNGE = {'thigh_L': (-40, -8, -12), 'shin_L': (40, 0, 0), 'thigh_R': (30, 10, 16), 'shin_R': (4, 0, 0)}

# each key: the left palm, the way its fingers point, the way the back of the hand faces; the spark's size (0 none, 1
# to 3) and where it stands off the palm; the right fist; the chest's turn and lean; the legs. Gathered cupped before the
# belly, palm up; drawn back beside the shoulder, palm ahead; thrust out at the foe, the spark burst past the palm;
# followed through, the hand opening and sinking
KEYS = [
    ((0.08, -0.30, 1.16), (-0.3, -1.0, 0.2), (0.0, 0.0, -1.0), 1, (0.0, 0.0, 0.08), (-0.24, -0.08, 0.98), 0, 2,
     BACK),
    ((0.24, 0.04, 1.44), (0.0, -0.25, 1.0), (0.0, 1.0, 0.1), 2, (0.0, -0.07, 0.02), (-0.20, -0.26, 1.02), -24, -4,
     BACK),
    ((0.12, -0.62, 1.40), (0.0, -0.3, 1.0), (0.0, 1.0, 0.25), 3, (0.0, -0.24, 0.03), (-0.26, 0.16, 1.00), 20, 10,
     LUNGE),
    ((0.14, -0.54, 1.28), (0.0, -0.85, 0.5), (0.0, 0.5, 0.85), 0, (0.0, 0.0, 0.0), (-0.24, 0.02, 0.98), 8, 6, DRIVE),
]
ELBOW_L = (0.8, 0.5, -0.6)    # the left elbow's way: out, back and down
ELBOW_R = (-0.8, 0.4, -0.6)


def _stance(turn, lean, legs, yaw):
    rot = dict(GUARD)
    rot['chest'] = (rot['chest'][0] + lean, rot['chest'][1], rot['chest'][2] + turn)
    rot.update(legs)
    return poses.stance(rot, yaw)


def cast(frame, view, yaw):
    """A key of the cast (`KEYS`): the left hand open, the spark off its palm, the right fist closed."""
    palm, fingers, back, spark, off, fist, turn, lean, legs = KEYS[frame]
    p = _stance(turn, lean, legs, yaw)
    R = poses.root_matrix(p)
    rot = R.to_3x3()
    f = (rot @ Vector(fingers)).normalized()
    at = R @ Vector(palm)
    solve_arm(p, 'L', at - f * WRIST, rot @ Vector(ELBOW_L), hand_dir=f, hand_up=rot @ Vector(back))
    solve_arm(p, 'R', R @ Vector(fist), rot @ Vector(ELBOW_R))
    gear = {'fist': {'L': False, 'R': True}}
    if spark:
        gear['spark'] = (Matrix.Translation(at + rot @ Vector(off)) @ Matrix.Rotation(math.radians(yaw), 4, 'Z'), spark)
    return p, gear


ANIMS = {'cast': cast}
poses.ANIMS.update(ANIMS)
poses.FISTS.update({'cast': 'R'})
