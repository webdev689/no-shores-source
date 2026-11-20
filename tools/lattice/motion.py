"""What every Lattice foe's moves are made of: poses summed in layers over a base, keys eased through, a seeded tremor
and the legs' stances. Angles are degrees about each joint's rest axes (rig.py `Pose`): an arm or thigh swings
forward on -X, a knee bends on +X, an elbow on -X, the trunk and head lean forward on +X; x is the body's left, -y its
front."""
import numpy as np
from mathutils import Vector

import poses
from rig import solve_arm

TREMBLING = ('spine', 'chest', 'neck', 'head', 'uarm_L', 'uarm_R', 'farm_L', 'farm_R', 'hand_L', 'hand_R')
ELBOW_L = (0.8, 0.5, -0.6)   # out, back and down, as the forge's cast bends them
ELBOW_R = (-0.8, 0.4, -0.6)
CROUCH = {'thigh_L': (-30, -8, -12), 'shin_L': (40, 0, 0), 'thigh_R': (10, 10, 16), 'shin_R': (44, 0, 0)}
COIL = {'thigh_L': (-34, -8, -12), 'shin_L': (52, 0, 0), 'thigh_R': (14, 10, 16), 'shin_R': (56, 0, 0)}
DRIVE = {'thigh_L': (-34, -8, -12), 'shin_L': (30, 0, 0), 'thigh_R': (24, 10, 16), 'shin_R': (12, 0, 0)}
LUNGE = {'thigh_L': (-46, -8, -12), 'shin_L': (44, 0, 0), 'thigh_R': (34, 10, 16), 'shin_R': (6, 0, 0)}
BUCKLE = {'thigh_L': (-40, -8, -12), 'shin_L': (62, 0, 0), 'thigh_R': (30, 10, 16), 'shin_R': (10, 0, 0)}
CONTACT_L, PASSING_L = poses.WALK_LEGS
CONTACT_R, PASSING_R = poses._mirror_legs(CONTACT_L), poses._mirror_legs(PASSING_L)


def summed(*parts):
    """Rotations added joint by joint: a base pose, then each layer of motion over it."""
    out = {}
    for part in parts:
        for joint, turn in part.items():
            out[joint] = tuple(a + b for a, b in zip(out.get(joint, (0, 0, 0)), turn))
    return out


def scaled(part, by):
    return {joint: tuple(v * by for v in turn) for joint, turn in part.items()}


def blend(a, b, t):
    return {j: tuple(x + (y - x) * t for x, y in zip(a.get(j, (0, 0, 0)), b.get(j, (0, 0, 0)))) for j in {*a, *b}}


def through(keys, t):
    """`keys` (poses at even steps from 0 to 1) at `t`, each step eased in and out."""
    span = t * (len(keys) - 1)
    k = min(int(span), len(keys) - 2)
    u = span - k
    return blend(keys[k], keys[k + 1], u * u * (3 - 2 * u))


def tremor(move, frame, degrees, joints=TREMBLING):
    """A small shake of the trunk and arms, the same every time the frame is drawn."""
    shake = np.random.default_rng(sum(map(ord, move)) * 100 + frame)
    return {j: tuple(shake.normal(0.0, degrees, 3)) for j in joints}


def drawn(rot, yaw, left_fist=False, right_fist=False):
    return poses.stance(rot, yaw), {'fist': {'L': left_fist, 'R': right_fist}}


def reach(pose, left=None, right=None):
    """Each wrist given (body space, metres) laid there, the elbows bent as the forge's cast bends them."""
    at = poses.root_matrix(pose)
    turn = at.to_3x3()
    for side, wrist, elbow in (('L', left, ELBOW_L), ('R', right, ELBOW_R)):
        if wrist is not None:
            solve_arm(pose, side, at @ Vector(wrist), turn @ Vector(elbow))
    return pose
