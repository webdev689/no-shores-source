"""The bow's own holds, a bow's alone (a crossbow and a torch keep the bow at rest, poses.py `AT_REST`).

- `bowready`, the combat hold: both hands on the bow, the arrow nocked and the string drawn back part way. The body is
  bladed, the left shoulder toward the target. The bow is held out low before the left hip, canted, its arrow ahead
  and down at the ground; the string fist sits by the right hip. The arms hang easy, elbows bent and down.
- `bowwalk`, the hold carried over the march's legs.
- `bowrun`, the sprint: the captured run, the bow level in the left fist beside the hip, an arrow in the right fist.

Points are in the root's frame: the ground under the body, the target ahead (-Y), +X the body's left."""
import math

from mathutils import Vector

import gear
import onehand
import poses

ANIMS = {'bowready': 1, 'bowwalk': 4, 'bowrun': 4}

TURN = -50.0   # degrees the shoulders turn right of the feet's ahead, the pelvis three fifths of it
TWIST = {'pelvis': (0, 0, TURN * 0.6), 'spine': (5, 0, TURN * 0.2), 'chest': (3, 0, TURN * 0.2),
         'neck': (6, 0, -TURN * 0.55), 'head': (-2, -4, -TURN * 0.4)}
LEGS = {'thigh_L': (-14, -8, 14), 'shin_L': (10, 0, 0), 'foot_L': (4, 0, 8),
        'thigh_R': (12, 10, 18), 'shin_R': (14, 0, 0), 'foot_R': (0, 0, -6)}
PITCH = 18.0                    # degrees the arrow points down from level
CANT = 24.0                     # degrees the bow's top leans right, toward the string hand
STRING = (-0.24, -0.10, 1.10)   # the string fist: by the right hip
DRAW = 0.30                     # metres the string is drawn past its brace
POLE_L, POLE_R = (1.0, 0.1, -0.7), (-0.8, 0.5, -0.6)   # the elbows: out and down; back, out and down
BOB = (0.0, 0.012, 0.0, 0.012)  # the hold's rise through the march's steps

# The sprint. The captured left fist swings across the body, where a long bow would pass through the legs, so the fist
# keeps the run's fore and aft but stays out beside the hip (OUT_X, HIP_Z). The bow is carried level, its top ahead
# and a little in (SPLAY), so the limb behind stays off the hip. The right fist holds an arrow ahead and a little down.
OUT_X, HIP_Z = 0.36, (0.95, 1.08)
SPLAY = 8.0        # degrees the bow's top turns in toward the body's line ahead
RISE = 0.08        # its top's rise per metre ahead
ARROW_DIP = 10.0   # degrees the arrow in the right fist points down from level
ARROW_HELD = 0.25  # metres of it behind the fist, the nock's end
ARROW = 0.80       # its length


def _aim():
    p = math.radians(PITCH)
    return Vector((0.0, -math.cos(p), -math.sin(p)))


def hold(p, lift=0.0):
    """The bow and the string fist, placed from the string fist (STRING): the bow out ahead along the arrow, the left
    fist on its grip. The bow's gear: its frame, the nock, the draw and the arrow."""
    R = poses.root_matrix(p)
    rot = R.to_3x3()
    aim = _aim()
    up0 = Vector((0.0, 0.0, 1.0))
    up0 = (up0 - up0.project(aim)).normalized()
    right = aim.cross(up0).normalized()
    c = math.radians(CANT)
    up = (up0 * math.cos(c) + right * math.sin(c)).normalized()
    fist_s = Vector(STRING) + Vector((0.0, 0.0, lift))
    back = -aim   # the bow's +Y, toward the archer: the string's side
    m = poses.frame_matrix((0, 0, 0), up, back.cross(up))
    string_mid = m.to_3x3() @ (sum(gear.bow_tips(), Vector()) / 2)   # the braced string's middle, off the grip
    grip_at = fist_s - back * (0.03 + DRAW) - string_mid
    at_w, up_w, _ = poses.grip(p, 'L', tuple(grip_at), tuple(up), POLE_L)
    bow_m = poses.frame_matrix(at_w, up_w, rot @ back.cross(up))
    back_w = (bow_m.to_3x3() @ Vector((0.0, 1.0, 0.0))).normalized()
    string_rest = bow_m @ (sum(gear.bow_tips(), Vector()) / 2)
    held, _, _ = poses.grip(p, 'R', tuple(R.inverted() @ (string_rest + back_w * (DRAW + 0.03))), tuple(up), POLE_R,
                            knuckles=tuple(aim))
    nock = held - back_w * 0.03
    return {'bow': bow_m, 'nock': nock, 'draw': max(0.0, (nock - string_rest).dot(back_w)),
            'arrow': nock - back_w * ARROW, 'fist': {'L': True, 'R': True}}


def bowready(frame, view, yaw):
    p = poses.stance({**LEGS, **TWIST}, yaw)
    return p, hold(p)


def bowwalk(frame, view, yaw):
    legs = {k: v for k, v in onehand._march_legs(frame).items() if k not in TWIST}
    p = poses.stance({**legs, **TWIST}, yaw)
    return p, hold(p, BOB[frame])


def bowrun(frame, view, yaw):
    p = poses.captured('run', frame, yaw)
    R = poses.root_matrix(p)
    rot = R.to_3x3()
    W = p.world()
    H = W['hand_L']
    x, y, z = R.inverted() @ (H.translation + H.to_3x3() @ Vector((0, 0, -poses.FIST)))
    fist = (max(x, OUT_X), y, min(max(z, HIP_Z[0]), HIP_Z[1]))
    a = math.radians(SPLAY)
    at_w, up_w, _ = poses.grip(p, 'L', fist, (-math.sin(a), -math.cos(a), RISE), (1.0, 0.3, -0.5))
    string = rot @ Vector((0.0, 0.0, 1.0))   # carried level, its string up
    bow_m = poses.frame_matrix(at_w, up_w, string.cross(up_w))
    # the right fist round the arrow, its elbow where the run put it
    W = p.world()
    H = W['hand_R']
    fist_r = R.inverted() @ (H.translation + H.to_3x3() @ Vector((0, 0, -poses.FIST)))
    sh, el = W['uarm_R'].translation, W['farm_R'].translation
    line = (H.translation - sh).normalized()
    pole = rot.inverted() @ ((el - sh) - (el - sh).project(line))
    d = math.radians(ARROW_DIP)
    at_r, way, _ = poses.grip(p, 'R', tuple(fist_r), (0.0, -math.cos(d), -math.sin(d)), tuple(pole))
    return p, {'bow': bow_m, 'loose': (at_r - way * ARROW_HELD, at_r + way * (ARROW - ARROW_HELD)),
               'fist': {'L': True, 'R': True}}


poses.ANIMS.update({'bowready': bowready, 'bowwalk': bowwalk, 'bowrun': bowrun})
poses.FISTS.update(dict.fromkeys(ANIMS, 'LR'))
