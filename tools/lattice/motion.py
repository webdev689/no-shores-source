"""What every Lattice foe's moves are made of: poses summed in layers over a base, keys eased through, a seeded tremor,
the legs' stances with both feet planted, and the forge's own arm and leg solvers. Angles are degrees about each
joint's rest axes (rig.py `Pose`): an arm or thigh swings forward on -X, a knee bends on +X, an elbow on -X, the trunk
and head lean forward on +X; x is the body's left, -y its front."""
import numpy as np
from mathutils import Vector

import poses
from riding import solve_leg
from rig import offset, solve_arm

TREMBLING = ('spine', 'chest', 'neck', 'head', 'uarm_L', 'uarm_R', 'farm_L', 'farm_R', 'hand_L', 'hand_R')
TRUNK = ('spine', 'chest', 'neck')
ELBOW_L = (0.8, 0.5, -0.6)   # out, back and down, as the forge's cast bends them
ELBOW_R = (-0.8, 0.4, -0.6)
STAND = {'thigh_L': (-6, -6, -6), 'shin_L': (10, 0, 0), 'foot_L': (-4, 0, 6),
         'thigh_R': (4, 6, 6), 'shin_R': (10, 0, 0), 'foot_R': (-6, 0, -6)}   # feet apart, the knees soft
CROUCH = {'thigh_L': (-30, -8, -12), 'shin_L': (40, 0, 0), 'thigh_R': (10, 10, 16), 'shin_R': (44, 0, 0)}
COIL = {'thigh_L': (-34, -8, -12), 'shin_L': (52, 0, 0), 'thigh_R': (14, 10, 16), 'shin_R': (56, 0, 0)}
DRIVE = {'thigh_L': (-34, -8, -12), 'shin_L': (30, 0, 0), 'thigh_R': (24, 10, 16), 'shin_R': (12, 0, 0)}
LUNGE = {'thigh_L': (-46, -8, -12), 'shin_L': (44, 0, 0), 'thigh_R': (34, 10, 16), 'shin_R': (6, 0, 0)}
BUCKLE = {'thigh_L': (-40, -8, -12), 'shin_L': (62, 0, 0), 'thigh_R': (30, 10, 16), 'shin_R': (10, 0, 0)}
BRACE = {'thigh_L': (-20, -10, -12), 'shin_L': (22, 0, 0), 'thigh_R': (10, 10, 14), 'shin_R': (20, 0, 0)}
CONTACT_L, PASSING_L = poses.WALK_LEGS
CONTACT_R, PASSING_R = poses._mirror_legs(CONTACT_L), poses._mirror_legs(PASSING_L)
SOLE_DEPTH = 0.085   # the ankle over the ground with the foot flat (poses.py `SOLE`)


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
    within = span - k
    return blend(keys[k], keys[k + 1], within * within * (3 - 2 * within))


def mirrored(rot):
    """A pose for the other side: each joint's twin, turned the other way about Y and Z (poses.py `_mirror_legs`)."""
    return poses._mirror_legs(rot)


def tremor(move, frame, degrees, joints=TREMBLING):
    """A small shake of the trunk and arms, the same every time the frame is drawn."""
    shake = np.random.default_rng(sum(map(ord, move)) * 100 + frame)
    return {j: tuple(shake.normal(0.0, degrees, 3)) for j in joints}


def sole(W, side):
    """The lowest point of foot `side`'s sole."""
    return min((W[f'foot_{side}'] @ q).z for q in poses.SOLE)


def leg(side):
    """How far a leg puts its ankle from its hip, the knee never quite straight."""
    return (offset(f'shin_{side}').length + offset(f'foot_{side}').length) * 0.98


def planted(pose, sides='LR', drop=0.0):
    """The feet of `sides` flat on the ground: each the stance left in the air (it grounds only the lowest sole) laid
    down by the forge's leg solver, its knee bent forward. The hips sink by `drop`, or further where a leg is too
    straight to reach, and then every other foot is held where it was; a foot still out of reach is drawn in under
    its hip."""
    W = pose.world()
    lifted = [side for side in sides if sole(W, side) > 0.004]
    sink = max([W[f'thigh_{side}'].translation.z - SOLE_DEPTH - leg(side) for side in lifted] + [drop])
    held = {side: (W[f'foot_{side}'].translation.copy(), W[f'foot_{side}'].to_quaternion())
            for side in 'LR' if side not in lifted and sink > 0.0}
    pose.root_loc.z -= max(sink, 0.0)
    ahead = (poses.root_matrix(pose).to_3x3() @ Vector((0.0, -1.0, 0.0))).normalized()
    level = Vector((0.0, -1.0, 0.0)).rotation_difference(Vector((ahead.x, ahead.y, 0.0)).normalized())
    for side in 'LR':
        W = pose.world()
        if side in held:
            ankle, turn = held[side]
        elif side in lifted:
            hip = W[f'thigh_{side}'].translation
            ankle, turn = Vector((*W[f'foot_{side}'].translation.xy, SOLE_DEPTH)), level
            drop_to, out = hip.z - SOLE_DEPTH, Vector((ankle.x - hip.x, ankle.y - hip.y, 0.0))
            room = max(leg(side) ** 2 - drop_to ** 2, 0.0) ** 0.5
            if out.length > room:
                ankle = Vector((hip.x, hip.y, SOLE_DEPTH)) + out.normalized() * room
        else:
            continue
        solve_leg(pose, side, ankle, ahead)
        pose.quat[f'foot_{side}'] = pose.world()[f'shin_{side}'].to_quaternion().inverted() @ turn
    return pose


def drawn(rot, yaw, left_fist=False, right_fist=False, plant='LR', drop=0.0):
    """The pose of `rot` grounded, the feet of `plant` flat on the ground (none for a raised knee or a foot a walk
    swings, one for a walk's foot bearing its weight), the hips sunk `drop` metres, and the hands open or closed."""
    pose = planted(poses.stance(rot, yaw), plant, drop) if plant or drop else poses.stance(rot, yaw)
    return pose, {'fist': {'L': left_fist, 'R': right_fist}}


def downed(rot, yaw, left_fist=False, right_fist=False):
    """The pose of `rot` set down on whatever of it touches the ground first, a knee, a hip, the chest or an arm, as
    the forge sets a body down (poses.py `grounded_body`): for a body down on a knee."""
    pose = poses.stance(rot, yaw, ground=lambda p: poses.grounded_body(p, arms=True))
    return pose, {'fist': {'L': left_fist, 'R': right_fist}}


# A body struck: the trunk thrown back and twisted, the head after it (`recoil`, by how hard).
def recoil(hard, twist=0.0):
    return {'spine': (-6 * hard, 0, twist * 0.4), 'chest': (-10 * hard, 0, twist), 'neck': (-6 * hard, 0, 0),
            'clav_L': (0, 0, 8 * hard), 'clav_R': (0, 0, -8 * hard)}


HURT = (1.0, 0.65, 0.3, 0.0)                              # a flinch's four frames, how hard each is thrown
STAGGER = (0.7, 1.3, 1.5, 1.2, 0.8, 0.45, 0.18, 0.0)      # a stagger's eight: thrown back off its feet, finding them
STEP_BACK = {'thigh_L': (-14, -6, -6), 'shin_L': (16, 0, 0), 'thigh_R': (22, 6, 6), 'shin_R': (20, 0, 0)}


def reach(pose, left=None, right=None):
    """Each wrist given (body space, metres) laid there, the elbows bent as the forge's cast bends them."""
    at = poses.root_matrix(pose)
    turn = at.to_3x3()
    for side, wrist, elbow in (('L', left, ELBOW_L), ('R', right, ELBOW_R)):
        if wrist is not None:
            solve_arm(pose, side, at @ Vector(wrist), turn @ Vector(elbow))
    return pose


def laid(pose, side, wrist, way, up=(0.0, -1.0, 0.0)):
    """A wrist laid (body space) with its hand along `way` and its back toward `up`, the elbow bent as the cast's."""
    at = poses.root_matrix(pose)
    turn = at.to_3x3()
    elbow = ELBOW_L if side == 'L' else ELBOW_R
    solve_arm(pose, side, at @ Vector(wrist), turn @ Vector(elbow), hand_dir=(turn @ Vector(way)).normalized(),
              hand_up=turn @ Vector(up))
    return pose
