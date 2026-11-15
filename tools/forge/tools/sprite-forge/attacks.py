"""The forge's own attacks, beside Daggerfall's two: a thrust, an overhead chop and a two-handed swing, six frames
each, keyed in body space as the one-handed moves are (onehand.py) and the same in every view. They are own moves
(poses.py `OWN`): every look draws them in its own archive, its weapon in its fist, and the game swings with them
(src/characters/enemy/foeOwnMoves.js).

Each key: (the right fist, the weapon's line up from it), the chest's turn and lean, and the legs. A one-handed weapon's
edge leads its stroke: down the chop, across the swing; a thrust's flat lies level. The two-handed swing holds the left
fist on the haft above the right (`TWO_HANDS` up it).

Points and ways are in body space, as poses.py's: the ground under the body, +X its left, -Y ahead, +Z up."""
from mathutils import Vector

import poses
from onehand import GUARD, SWORD_GUARD, sword

ATTACKS = {'thrust': 6, 'chop': 6, 'swing2h': 6}
TWO_HANDS = 0.16   # the left fist up the haft from the right, metres

# the legs: the weight back as the blow winds up, thrown onto the bent left knee as it lands, the right driving behind
BACK = {'thigh_L': (-14, -8, -12), 'shin_L': (8, 0, 0), 'thigh_R': (6, 10, 16), 'shin_R': (32, 0, 0)}
LUNGE = {'thigh_L': (-40, -8, -12), 'shin_L': (40, 0, 0), 'thigh_R': (30, 10, 16), 'shin_R': (4, 0, 0)}
DRIVE = {'thigh_L': (-30, -8, -12), 'shin_L': (30, 0, 0), 'thigh_R': (22, 10, 16), 'shin_R': (10, 0, 0)}

# the thrust: drawn back to the ribs, driven out on a lunge, held, drawn back to the guard. The point rises a little and
# crosses the body toward its middle, as a thrust at a standing foe's chest does: a line straight ahead points at the
# front view's eye and draws no blade in the view a foe attacks from.
THRUST = [(SWORD_GUARD, 0, 0, {}),
          (((-0.28, 0.04, 1.14), (0.28, -0.90, 0.33)), -22, -2, BACK),
          (((-0.18, -0.34, 1.18), (0.32, -0.84, 0.43)), -4, 6, DRIVE),
          (((-0.06, -0.62, 1.24), (0.36, -0.80, 0.48)), 14, 12, LUNGE),
          (((-0.10, -0.48, 1.20), (0.33, -0.83, 0.45)), 8, 8, DRIVE),
          (SWORD_GUARD, 0, 0, {})]

# the chop: raised high over the head, the head behind it, brought straight down before the body and through, back
CHOP = [(SWORD_GUARD, 0, 0, {}),
        (((-0.12, -0.02, 1.92), (0.0, 0.75, 0.66)), -10, -6, BACK),
        (((-0.10, -0.28, 1.84), (0.0, -0.3, 0.95)), -4, 2, DRIVE),
        (((-0.06, -0.56, 1.24), (0.0, -0.86, -0.5)), 6, 16, LUNGE),
        (((-0.04, -0.46, 0.94), (0.0, -0.4, -0.92)), 8, 20, LUNGE),
        (SWORD_GUARD, 0, 0, {})]

# the two-handed swing: wound back over the right shoulder, swept down and round from the right, through the front and
# out to the left, and back to the ready, both fists on the haft. The sweep falls from high right to low left, and at
# the blow the head is already past the middle: a head swept flat through the middle points at the front view's eye.
SWING2H = [(((-0.12, -0.30, 1.00), (0.2, -0.5, 0.85)), 0, 0, {}),
           (((-0.28, 0.04, 1.30), (-0.6, 0.5, 0.62)), -36, -4, BACK),
           (((-0.30, -0.28, 1.18), (-0.82, -0.30, 0.48)), -12, 4, DRIVE),
           (((-0.04, -0.50, 1.10), (0.42, -0.86, 0.22)), 12, 10, LUNGE),
           (((0.22, -0.34, 1.00), (0.84, -0.36, -0.40)), 36, 12, LUNGE),
           (((-0.12, -0.30, 1.00), (0.2, -0.5, 0.85)), 0, 0, {})]

def _stance(turn, lean, legs, yaw):
    rot = dict(GUARD)
    rot['chest'] = (rot['chest'][0] + lean, rot['chest'][1], rot['chest'][2] + turn)
    rot.update(legs)
    return poses.stance(rot, yaw)


def _leading(way, axis):
    """The way a weapon's edge faces as it moves: across its line, about the stroke's own axis (body space)."""
    return tuple(Vector(axis).cross(Vector(way)).normalized())


FISTS = {'L': True, 'R': True}


def thrust(frame, view, yaw):
    key, turn, lean, legs = THRUST[frame]
    p = _stance(turn, lean, legs, yaw)
    return p, {'axe': sword(p, 'R', key), 'fist': dict(FISTS)}


def chop(frame, view, yaw):
    key, turn, lean, legs = CHOP[frame]
    p = _stance(turn, lean, legs, yaw)
    at, way = key
    return p, {'axe': poses.axe_at(p, at, way, _leading(way, (1.0, 0.0, 0.0)), pole_r=(-1, 0.6, -0.3)),
               'fist': dict(FISTS)}


def swing2h(frame, view, yaw):
    key, turn, lean, legs = SWING2H[frame]
    p = _stance(turn, lean, legs, yaw)
    at, way = key
    return p, {'axe': poses.axe_at(p, at, way, _leading(way, (0.0, 0.0, 1.0)), left_at=TWO_HANDS,
                                   pole_r=(-1, 0.6, -0.3)), 'fist': dict(FISTS)}


ANIMS = {'thrust': thrust, 'chop': chop, 'swing2h': swing2h}
poses.ANIMS.update(ANIMS)
poses.OWN.update(ATTACKS)
poses.FISTS.update({a: 'LR' for a in ANIMS})
