"""The forge's driver: the body seated on a bench wagon's bench, the reins in both fists, in the two moves the game
plays on the bench: stopped (1 frame) and rolling (4), five views each.

The seat is the game's own (src/player/seatPose.js, src/world/wagonModels.js `driverSeatFor`): the hips SEATED_HIP over
the footboard, the soles on it ahead of the hips, and the fists over the knees where the world's reins end
(DRIVER_HANDS_TOP over the feet). Each is scaled by the forge body's height against the measured biped's, as the rider's
is (riding.py `HEIGHT`). Rolling, the wagon's bed lifts the hips a little twice a turn of its wheels and the trunk nods
with it, the fists riding along on the lines.

Points are in body space, as poses.py's: the footboard under the hips, +X the driver's left, -Y ahead, +Z up."""
import math

from mathutils import Matrix, Vector

import poses
from riding import HEIGHT, set_foot, solve_leg
from rig import Pose, rest, solve_arm

# the game's seat (seatPose.js), in metres of the measured biped: the hips over the footboard (SEATED_HIP_HEIGHT),
# each sole ahead of them and to its side (SEAT_FOOT_AHEAD, SEAT_FOOT_SIDE) with the ankle over the board
# (SEAT_ANKLE), and the reins' fists ahead, apart and over the board (DRIVER_HANDS_TOP + SEAT_HAND_OVER)
SEATED_HIP = 0.61
FOOT_AHEAD = 0.45
FOOT_SIDE = 0.12
ANKLE = 0.08
REIN_AHEAD = 0.42
REIN_SIDE = 0.13
REIN_UP = 0.82
REIN_LIFT = {'L': 0.0, 'R': 0.012}   # the right fist a little over the left, as the rider's

# the moves and their frames
DRIVE = {'benchidle': 1, 'benchdrive': 4}
# rolling: the hips' lift at a bump (metres of the biped) and the trunk's nod with it (degrees), two bumps a cycle,
# and its sway from side to side (degrees), once a cycle
BUMP = 0.018
NOD = 3.0
SWAY = 1.5

# the trunk and the head on the bench: a driver's easy stoop over the lines, the chin up to the road
SIT = {'spine': (8, 0, 1), 'chest': (2, 0, -1), 'neck': (0, 0, 0), 'head': (-8, 1, 2)}


def _turn(yaw):
    return Matrix.Rotation(math.radians(yaw), 3, 'Z')


def seated(anim, frame, yaw):
    """The driver's pose for `frame` of driving move `anim`, the view turned `yaw` degrees."""
    phase = frame / DRIVE[anim] if DRIVE[anim] > 1 else 0.0
    bump = 0.5 - 0.5 * math.cos(4 * math.pi * phase) if anim == 'benchdrive' else 0.0   # 0..1, twice a cycle
    hips = Vector((0.0, 0.0, (SEATED_HIP + BUMP * bump) * HEIGHT))
    R = _turn(yaw)
    rot = dict(SIT)
    sway = SWAY * math.sin(2 * math.pi * phase) if anim == 'benchdrive' else 0.0
    rot['spine'] = (rot['spine'][0] + NOD * bump, rot['spine'][1], rot['spine'][2] + sway)
    rot['head'] = (rot['head'][0] - NOD * bump * 0.6, *rot['head'][1:])   # the eyes stay on the road
    p = Pose(rot, root_loc=R @ (hips - rest('pelvis')), yaw=yaw)
    ahead, right = Vector((0.0, -1.0, 0.0)), Vector((-1.0, 0.0, 0.0))

    def at(fwd, side, up):
        return R @ (ahead * fwd + right * side + Vector((0.0, 0.0, up)))
    for s, side in (('L', -1.0), ('R', 1.0)):   # seatPose.js names the left -1 and the right 1
        solve_leg(p, s, at(FOOT_AHEAD * HEIGHT, side * FOOT_SIDE * HEIGHT, ANKLE * HEIGHT),
                  R @ (ahead + Vector((0.0, 0.0, 0.6)) + right * side * 0.15))
        set_foot(p, s, R @ (ahead + right * side * 0.12))
    lift = BUMP * bump * HEIGHT * 0.6   # the fists ride the hips' bump, a little behind it
    for s, side in (('L', -1.0), ('R', 1.0)):
        fist = at(REIN_AHEAD * HEIGHT, side * REIN_SIDE * HEIGHT, REIN_UP * HEIGHT + REIN_LIFT[s] + lift)
        way = (R @ (ahead + Vector((0.0, 0.0, -0.35)))).normalized()   # the knuckles ahead, a little down
        pole = R @ (right * side * 0.6 - ahead * 0.3 + Vector((0.0, 0.0, -0.75)))
        solve_arm(p, s, fist - way * poses.FIST, pole, hand_dir=way,
                  hand_up=R @ (Vector((0.0, 0.0, 1.0)) + right * side * 0.4))
    return p, {'fist': {'L': True, 'R': True}}


def benchidle(frame, view, yaw):
    return seated('benchidle', frame, yaw)


def benchdrive(frame, view, yaw):
    return seated('benchdrive', frame, yaw)


ANIMS = {'benchidle': benchidle, 'benchdrive': benchdrive}
poses.ANIMS.update(ANIMS)
poses.FISTS.update({a: 'LR' for a in ANIMS})
