"""The forge's rider: the body astride the Courser (horse.py), in the three mounted animations Eye of the Beholder's
mount sets play: the horse standing (1 frame), walking (8) and galloping (8), five views each.

The seat is the Morrowind lane's (src/player/seatPose.js `saddleRigInput`): the hips on the horse's seat as its back
carries it, each foot in a stirrup down the horse's side with the knee forward and out round the barrel, each fist on
the reins over the withers, and the trunk leaning into the gallop. The stirrups stand where the horse puts them; their
drop and the reins' reach are the rider's, scaled by the forge body's height against the measured biped's, as the
game scales a race's. The legs and the arms are solved onto their marks (`solve_leg`, rig.py `solve_arm`).

Points are in body space, as poses.py's: the ground under the horse's middle, +X the rider's left, -Y ahead, +Z up."""
import math
import os

from mathutils import Matrix, Quaternion, Vector

import horse
import poses
from rig import Pose, offset, rest, solve_arm

# the game's saddle (seatPose.js), in metres: a stirrup either side of the seat's middle, below and ahead of the hips;
# the reins ahead of and above the hips, either side; the trunk's lean at a full gallop, radians; and the measured
# biped's standing pelvis, against which a body's height is taken
STIRRUP_SIDE = 0.32
STIRRUP_DROP = 0.8
STIRRUP_AHEAD = 0.08
REIN_AHEAD = 0.36
REIN_UP = 0.18
REIN_SIDE = 0.12
SADDLE_LEAN_GALLOP = 0.28
SEAT_PELVIS_HEIGHT = 1.09
# the forge body's height as the game's race height: its standing pelvis over the biped's
HEIGHT = rest('pelvis').z / SEAT_PELVIS_HEIGHT
# the toe turned out of the horse's line toward its own side, and its knee's pole, as shares of the side way
# (seatPose.js `stirrup`)
TOE_OUT = 0.3
KNEE_OUT = (0.85, 0.5)
HEEL_DOWN = 10.0   # degrees the toe is lifted in the stirrup: a rider's heel sits under the ball of the foot

# the mounted animations, their frames, the gait each plays and how far into the gallop it leans
RIDE = {'horseidle': 1, 'horsewalk': 8, 'horsegallop': 8}
GAIT_OF = {'horseidle': 'idle', 'horsewalk': 'walk', 'horsegallop': 'gallop'}
LEAN_OF = {'horseidle': 0.0, 'horsewalk': 0.0, 'horsegallop': 1.0}
# the layers only the mounted animations draw
LAYERS = ('horse',)

# the trunk and the head over the seat: a little round in the back and the chin up, no two sides alike. The lean is
# laid on the pelvis, so the legs are solved from the hips as they lean
SIT = {'spine': (3, 0, 2), 'chest': (2, 0, -2), 'neck': (2, 0, 0), 'head': (-6, 2, 3)}
REIN_LIFT = {'L': 0.0, 'R': 0.015}   # the right fist a little over the left

COURSER = []   # the horse's meshes, made once a scene stands (`mount`)
# a strand's radius at the sprites' 62 pixels a metre: half a pixel across, so the strands glint through the mane's mass
# as Daggerfall's town horse's grey strands do
STRAND_RADIUS = 0.005
# the horse's grade onto Daggerfall's brown town horse (horsegrade.py), which layers.py lays on its layer
HORSE_GRADE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'HORSE-grade.json')


def mount():
    """The horse the layers draw: made once, its meshes in the scene, its strands sized for the sprites."""
    if not COURSER:
        COURSER.append(horse.Courser(strand_radius=STRAND_RADIUS, tack_height=HEIGHT))
    return COURSER[0]


_BAKE_ID = []


def bake_id():
    """The game's horse bake (horse.py BAKE) by its bytes, read once."""
    if not _BAKE_ID:
        import hashlib
        _BAKE_ID.append(hashlib.sha1(open(horse.BAKE, 'rb').read()).hexdigest())
    return _BAKE_ID[0]


class Stride:
    """The horse's frame under a rider, carried in a frame's gear: `place` lays it on the horse's meshes when the
    fighter is placed (forge.py `Fighter.place`)."""

    def __init__(self, gait, time, yaw):
        self.gait, self.time, self.yaw = gait, time, yaw
        self.bake = bake_id()   # the game's bake it is read from: one baked again moves every mounted strip's key

    def place(self):
        mount().pose(self.gait, self.time, self.yaw)   # made here if no layer drew it yet: a rider's cloth lies on it


def time_of(anim, frame):
    """The gait's time a mounted animation's frame shows: its frames spread evenly over one stride."""
    g = horse.bake()['gaits'][GAIT_OF[anim]]
    return g['duration'] * frame / RIDE[anim] if RIDE[anim] > 1 else 0.0


def _turn(yaw):
    return Matrix.Rotation(math.radians(yaw), 3, 'Z')


def solve_leg(pose, side, ankle, pole):
    """Two-bone IK: the ankle of leg `side` on `ankle` (world), the knee bent toward `pole` (a world way)."""
    W = pose.world()
    hip = W[f'thigh_{side}'].translation
    a, b = offset(f'shin_{side}').length, offset(f'foot_{side}').length
    d = Vector(ankle) - hip
    dist = min(d.length, (a + b) * 0.999)
    d.normalize()
    cos_s = max(-1.0, min(1.0, (a * a + dist * dist - b * b) / (2 * a * dist)))
    pv = Vector(pole) - Vector(pole).project(d)
    pv.normalize()
    knee = hip + d * (cos_s * a) + pv * (math.sqrt(1 - cos_s * cos_s) * a)
    foot = hip + d * dist
    up = W['pelvis'].to_quaternion()
    pose.quat[f'thigh_{side}'] = offset(f'shin_{side}').normalized().rotation_difference(
        up.inverted() @ (knee - hip).normalized())
    W = pose.world()
    pose.quat[f'shin_{side}'] = offset(f'foot_{side}').normalized().rotation_difference(
        W[f'thigh_{side}'].to_quaternion().inverted() @ (foot - knee).normalized())
    return knee


def set_foot(pose, side, way):
    """The foot laid along `way` (a world way, level), its toe lifted HEEL_DOWN: the foot's rest points -Y, flat."""
    W = pose.world()
    turn = Vector((0.0, -1.0, 0.0)).rotation_difference(Vector((way.x, way.y, 0.0)).normalized())
    lift = Quaternion((1.0, 0.0, 0.0), math.radians(-HEEL_DOWN))
    pose.quat[f'foot_{side}'] = W[f'shin_{side}'].to_quaternion().inverted() @ turn @ lift


def astride(anim, frame, yaw):
    """The rider's pose and the horse's frame for `frame` of mounted animation `anim`, the view turned `yaw` degrees."""
    gait, t, lean = GAIT_OF[anim], time_of(anim, frame), LEAN_OF[anim]
    hips = Vector(horse.seat(gait, t, 0.0))
    R = _turn(yaw)
    rot = dict(SIT)
    rot['pelvis'] = (math.degrees(SADDLE_LEAN_GALLOP * lean), 0, 0)
    rot['neck'] = (rot['neck'][0] - math.degrees(SADDLE_LEAN_GALLOP * lean) * 0.6, *rot['neck'][1:])
    p = Pose(rot, root_loc=R @ (hips - rest('pelvis')), yaw=yaw)
    ahead, right = Vector((0.0, -1.0, 0.0)), Vector((-1.0, 0.0, 0.0))

    def at(fwd, side, up):
        return R @ (hips + ahead * fwd + right * side + Vector((0.0, 0.0, up)))
    for s, side in (('L', -1.0), ('R', 1.0)):   # seatPose.js names the left -1 and the right 1
        solve_leg(p, s, at(STIRRUP_AHEAD * HEIGHT, side * STIRRUP_SIDE, -STIRRUP_DROP * HEIGHT),
                  R @ (ahead * KNEE_OUT[0] + right * side * KNEE_OUT[1]))
        set_foot(p, s, R @ (ahead + right * side * TOE_OUT))
    for s, side in (('L', -1.0), ('R', 1.0)):
        fist = at(REIN_AHEAD * HEIGHT, side * REIN_SIDE, REIN_UP * HEIGHT + REIN_LIFT[s])
        way = (R @ (ahead + Vector((0.0, 0.0, -0.35)))).normalized()   # the knuckles ahead, a little down
        pole = R @ (right * side * 0.6 - ahead * 0.3 + Vector((0.0, 0.0, -0.75)))
        solve_arm(p, s, fist - way * poses.FIST, pole, hand_dir=way,
                  hand_up=R @ (Vector((0.0, 0.0, 1.0)) + right * side * 0.4))
    return p, {'horse': Stride(gait, t, yaw), 'fist': {'L': True, 'R': True}}


def horseidle(frame, view, yaw):
    return astride('horseidle', frame, yaw)


def horsewalk(frame, view, yaw):
    return astride('horsewalk', frame, yaw)


def horsegallop(frame, view, yaw):
    return astride('horsegallop', frame, yaw)


ANIMS = {'horseidle': horseidle, 'horsewalk': horsewalk, 'horsegallop': horsegallop}
poses.ANIMS.update(ANIMS)
poses.FISTS.update({a: 'LR' for a in ANIMS})
