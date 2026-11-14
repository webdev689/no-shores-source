"""The placed people's poses: how Daggerfall's shopkeepers, beggars, musicians, smiths and dancers stand, sit, kneel and
work, keyed in body space as the idle and the walk are, the same in every view (a placed person is a flat, seen from
ahead). Each gives the body and its gear: the fists, what a hand holds (`axe`, an instrument or a tool) and each prop
by name (`props`: a stool, an anvil, a broom), each a matrix in the world.

A seated or kneeling body is set on its lowest point, a hip or a knee as readily as a sole (`poses.grounded_body`)."""
import math

from mathutils import Matrix, Vector

import poses
from playing import STAND, fist, joint, laid, mouth, palm

PEOPLE = {'crouch': 1, 'sit': 1, 'sit_ground': 1, 'kneel': 1, 'beg': 1, 'lie': 1, 'lean_cane': 1, 'serve': 1,
          'carry': 1, 'pray': 1, 'gesture': 1, 'hold': 1, 'drink': 1, 'dance': 6, 'juggle': 6, 'smith': 4, 'sweep': 4,
          'charm': 4}
# the props each pose sets out, and the instrument it plays (playing.py's): props3p.py builds them
PROPS_OF = {'sit': ('stool', 'chest', 'book', 'bottle'), 'lean_cane': ('cane', 'bottle'), 'serve': ('tray', 'bottle'),
            'carry': ('yoke',), 'juggle': ('balls',), 'smith': ('anvil', 'hammer'), 'sweep': ('broom',),
            'charm': ('snake_basket',), 'beg': ('bowl',), 'lie': ('bottle',), 'hold': ('bowl', 'book', 'bottle'),
            'drink': ('bottle',)}
PLAYS = {'charm': 'flute'}
HANDS_DOWN = {'clav_L': (0, -6, 0), 'uarm_L': (4, -12, 0), 'farm_L': (-12, 0, 8), 'clav_R': (0, 6, 0),
              'uarm_R': (4, 12, 0), 'farm_R': (-12, 0, -8)}


def _pose(rot, yaw, body=False):
    """`rot` (degrees by joint) posed and set on the ground: on its soles, or (`body`) on its lowest point."""
    p = poses.Pose(dict(rot), yaw=yaw)
    return poses.grounded_body(p) if body else poses.grounded(p)


def _stand(extra, yaw):
    rot = dict(STAND)
    for j, d in extra.items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    return _pose(rot, yaw)


def _ground(p, at, turn=0.0):
    """A prop's matrix on the ground at body-space (x, y), turned `turn` degrees about the upright."""
    F = poses.floor_matrix(p)
    return F @ Matrix.Translation((at[0], at[1], 0.0)) @ Matrix.Rotation(math.radians(turn), 4, 'Z')


def _rest_hands(p, at_l, at_r):
    """Each open hand laid on a body-space point (on a knee, a thigh), its fingers ahead and its back up."""
    R = poses.root_matrix(p)
    palm(p, 'L', R, at_l, (0.0, -1.0, -0.3), (0.0, 0.0, 1.0), (0.6, 0.6, -0.4))
    palm(p, 'R', R, at_r, (0.0, -1.0, -0.3), (0.0, 0.0, 1.0), (-0.6, 0.6, -0.4))


def _knees(p):
    return joint(p, 'shin_L'), joint(p, 'shin_R')


def _on(p, at, up=0.015):
    """A prop stood on a body-space point (an upturned palm, a tray), upright."""
    return poses.root_matrix(p) @ Matrix.Translation(at + Vector((0.0, 0.0, up)))


def _book(p, at, tilt):
    """The open book's matrix: its middle on body-space `at`, its tops away from the reader, lifted `tilt` degrees."""
    return (poses.root_matrix(p) @ Matrix.Translation(at) @ Matrix.Rotation(math.radians(-tilt), 4, 'X')
            @ Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation((0.0, -0.095, 0.0)))


# Crouched on the heels, the back bent over the knees, the hands on them
def crouch(frame, view, yaw):
    p = _pose({'pelvis': (0, 0, 0), 'spine': (28, 0, 0), 'chest': (12, 0, 0), 'neck': (-14, 0, 0), 'head': (-18, 0, 0),
               'thigh_L': (-118, -6, -10), 'shin_L': (132, 0, 0), 'foot_L': (-14, 0, 6),
               'thigh_R': (-118, 6, 10), 'shin_R': (132, 0, 0), 'foot_R': (-14, 0, -6)}, yaw)
    kl, kr = _knees(p)
    _rest_hands(p, kl + Vector((0.0, -0.06, 0.04)), kr + Vector((0.0, -0.06, 0.04)))
    return p, {'fist': {'L': False, 'R': False}}


# Sat on a low stool (or a chest), the thighs level, the shins down, the hands on the thighs, the head bowed to the
# lap (a book open on it); a bottle stood by the seat
def sit(frame, view, yaw):
    p = _pose({'pelvis': (0, 0, 0), 'spine': (6, 0, 0), 'chest': (2, 0, 0), 'neck': (8, 0, 0), 'head': (8, 0, 0),
               'thigh_L': (-88, -4, -6), 'shin_L': (86, 0, 0), 'foot_L': (2, 0, 6),
               'thigh_R': (-88, 4, 6), 'shin_R': (86, 0, 0), 'foot_R': (2, 0, -6)}, yaw)
    kl, kr = _knees(p)
    _rest_hands(p, (kl + joint(p, 'thigh_L')) / 2 + Vector((0.0, 0.0, 0.06)),
                (kr + joint(p, 'thigh_R')) / 2 + Vector((0.0, 0.0, 0.06)))
    seat = joint(p, 'pelvis')
    stool = _ground(p, (seat.x, seat.y + 0.02))
    lap = (joint(p, 'thigh_L') + kl + joint(p, 'thigh_R') + kr) / 4 + Vector((0.0, 0.0, 0.075))
    return p, {'fist': {'L': False, 'R': False}, 'props': {'stool': stool, 'chest': stool, 'book': _book(p, lap, 10),
                                                         'bottle': _ground(p, (seat.x - 0.34, seat.y + 0.06))}}


def _cross(yaw):
    return _pose({'pelvis': (0, 0, 0), 'spine': (8, 0, 0), 'chest': (2, 0, 0), 'neck': (2, 0, 0), 'head': (-6, 0, 0),
                  'thigh_L': (-76, -34, -26), 'shin_L': (150, 0, 12), 'foot_L': (0, 0, 24),
                  'thigh_R': (-76, 34, 26), 'shin_R': (150, 0, -12), 'foot_R': (0, 0, -24)}, yaw, body=True)


# Sat cross-legged on the ground, the hands on the knees
def sit_ground(frame, view, yaw):
    p = _cross(yaw)
    kl, kr = _knees(p)
    _rest_hands(p, kl + Vector((0.0, -0.04, 0.05)), kr + Vector((0.0, -0.04, 0.05)))
    return p, {'fist': {'L': False, 'R': False}}


def _kneeling(yaw, lean=0.0):
    return _pose({'pelvis': (0, 0, 0), 'spine': (4 + lean, 0, 0), 'chest': (2 + lean / 2, 0, 0),
                  'neck': (-lean / 2, 0, 0),
                  'head': (-4, 0, 0), 'thigh_L': (-4, -2, -4), 'shin_L': (100, 0, 0), 'foot_L': (40, 0, 4),
                  'thigh_R': (-4, 2, 4), 'shin_R': (100, 0, 0), 'foot_R': (40, 0, -4)}, yaw, body=True)


# Down on both knees, upright, the hands on the thighs
def kneel(frame, view, yaw):
    p = _kneeling(yaw)
    _rest_hands(p, (joint(p, 'thigh_L') + joint(p, 'shin_L')) / 2 + Vector((0.0, -0.05, 0.0)),
                (joint(p, 'thigh_R') + joint(p, 'shin_R')) / 2 + Vector((0.0, -0.05, 0.0)))
    return p, {'fist': {'L': False, 'R': False}}


# Knelt and bent forward, the right hand held out, cupped (a bowl in it), the left on the thigh
def beg(frame, view, yaw):
    p = _kneeling(yaw, lean=18)
    R = poses.root_matrix(p)
    hand = joint(p, 'uarm_R') + Vector((0.04, -0.42, -0.12))
    palm(p, 'R', R, hand, (0.0, -1.0, 0.1), (0.0, 0.0, -1.0), (-0.6, 0.3, -0.8))
    palm(p, 'L', R, (joint(p, 'thigh_L') + joint(p, 'shin_L')) / 2 + Vector((0.0, -0.05, 0.0)),
         (0.0, -1.0, -0.3), (0.0, 0.0, 1.0), (0.6, 0.6, -0.4))
    return p, {'fist': {'L': False, 'R': False}, 'props': {'bowl': _on(p, hand)}}


# Lying back on the ground, as the fallen are, a bottle on its side by the right hand
def lie(frame, view, yaw):
    p, _ = poses.death(poses.OWN['death'] - 1, view, yaw)
    F = poses.floor_matrix(p)
    hand = F.inverted() @ p.world()['hand_R'].translation
    bottle = (F @ Matrix.Translation((hand.x - 0.08, hand.y, 0.036)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
              @ Matrix.Translation((0.0, 0.0, -0.12)))
    return p, {'fist': {'L': False, 'R': False}, 'props': {'bottle': bottle}}


# Stooped over a cane, the right hand on its crook ahead and to the right, its foot on the ground before the right toe
def lean_cane(frame, view, yaw):
    p = _stand({'spine': (14, 0, 0), 'chest': (8, 0, 0), 'neck': (-6, 0, 0), 'head': (-10, 0, 0),
                'thigh_R': (-6, 0, 0), 'shin_R': (8, 0, 0)}, yaw)
    top, foot = Vector((-0.2, -0.3, 0.86)), Vector((-0.24, -0.36, 0.0))
    cane = poses.frame_matrix(poses.root_matrix(p) @ foot, (poses.root_matrix(p).to_3x3() @ (top - foot)).normalized(),
                              poses.root_matrix(p).to_3x3() @ Vector((0.0, -1.0, 0.0)))
    poses.grip(p, 'R', tuple(top), tuple(top - foot), (-0.8, 0.4, -0.4))
    palm(p, 'L', poses.root_matrix(p), joint(p, 'thigh_L') + Vector((0.04, -0.05, -0.08)), (0.0, 0.0, -1.0),
         (1.0, 0.0, 0.0), (0.6, 0.6, -0.4))
    return p, {'fist': {'L': False, 'R': True}, 'props': {'cane': cane, 'bottle': _ground(p, (0.22, -0.16))}}


# A tray of cups (and a bottle) held up on the left palm at the shoulder, the right hand at the side
def serve(frame, view, yaw):
    p = _stand({'chest': (0, 0, -6), 'head': (0, 0, 6)}, yaw)
    R = poses.root_matrix(p)
    at = joint(p, 'uarm_L') + Vector((0.16, -0.24, 0.12))
    tray = R @ Matrix.Translation(at)
    palm(p, 'L', R, at - Vector((0.0, 0.0, 0.03)), (-0.3, -1.0, 0.0), (0.0, 0.0, -1.0), (1.0, 0.2, -0.6))
    bottle = tray @ Matrix.Translation((0.0, -0.06, 0.014))
    return p, {'fist': {'L': False, 'R': False}, 'props': {'tray': tray, 'bottle': bottle}}


# A yoke across the shoulders, a pail hung from each end, the hands up on the ropes
def carry(frame, view, yaw):
    p = _stand({'spine': (4, 0, 0), 'neck': (8, 0, 0), 'head': (-6, 0, 0)}, yaw)
    R = poses.root_matrix(p)
    nape = joint(p, 'neck') + Vector((0.0, 0.03, -0.02))
    yoke = R @ Matrix.Translation(nape)
    for side, x in (('L', 1.0), ('R', -1.0)):
        rope = nape + Vector((0.42 * x, 0.0, -0.22))
        poses.grip(p, side, tuple(rope), (0.0, 0.0, 1.0), (x, 0.6, -0.6))
    return p, {'fist': {'L': True, 'R': True}, 'props': {'yoke': yoke}}


# Stood with the hands together before the breast, the head bowed
def pray(frame, view, yaw):
    p = _stand({'neck': (10, 0, 0), 'head': (8, 0, 0)}, yaw)
    R = poses.root_matrix(p)
    at = (joint(p, 'chest') + joint(p, 'neck')) / 2 + Vector((0.0, -0.2, -0.02))
    palm(p, 'L', R, at + Vector((0.012, 0.0, 0.0)), (0.0, -0.3, 1.0), (1.0, 0.0, 0.0), (0.8, 0.4, -0.6))
    palm(p, 'R', R, at - Vector((0.012, 0.0, 0.0)), (0.0, -0.3, 1.0), (-1.0, 0.0, 0.0), (-0.8, 0.4, -0.6))
    return p, {'fist': {'L': False, 'R': False}}


# Stood addressing someone, the right arm raised ahead, the hand open; the left on the hip
def gesture(frame, view, yaw):
    p = _stand({'chest': (0, 0, 6), 'head': (-4, 0, -4)}, yaw)
    R = poses.root_matrix(p)
    palm(p, 'R', R, joint(p, 'uarm_R') + Vector((-0.12, -0.46, 0.18)), (0.0, -0.6, 0.8), (0.0, 1.0, 0.3),
         (-0.8, 0.2, -0.6))
    palm(p, 'L', R, joint(p, 'pelvis') + Vector((0.2, -0.02, 0.12)), (-0.3, 0.0, -1.0), (1.0, 0.3, 0.0),
         (1.0, 0.6, 0.0))
    return p, {'fist': {'L': False, 'R': False}}


# Stood holding a thing on the left palm before the belly (a bowl, an open book), the head bowed to it; the right
# hand down at the side, its fist round a bottle's neck
def hold(frame, view, yaw):
    p = _stand({'neck': (6, 0, 0), 'head': (8, 0, 0)}, yaw)
    R = poses.root_matrix(p)
    at = joint(p, 'pelvis') + Vector((0.08, -0.3, 0.18))
    palm(p, 'L', R, at, (-0.4, -0.9, 0.0), (0.0, 0.0, -1.0), (0.8, 0.4, -0.6))
    neck = joint(p, 'pelvis') + Vector((-0.24, -0.04, -0.12))
    poses.grip(p, 'R', tuple(neck), (0.0, 0.0, 1.0), (-0.6, 0.6, 0.0))
    return p, {'fist': {'L': False, 'R': True}, 'props': {'bowl': _on(p, at), 'book': _book(p, at + Vector((
        0.0, 0.0, 0.02)), 25), 'bottle': _on(p, neck, -0.21)}}


# Stood drinking: the bottle tipped up to the lips in the right fist, the head back, the left hand on the hip
def drink(frame, view, yaw):
    p = _stand({'spine': (-4, 0, 0), 'neck': (-8, 0, 0), 'head': (-12, 0, 0)}, yaw)
    R = poses.root_matrix(p)
    way = Vector((0.05, 0.82, -0.5)).normalized()   # the bottle's foot to its mouth, the mouth at the lips
    foot = mouth(p) + Vector((0.0, -0.005, 0.0)) - way * 0.26
    poses.grip(p, 'R', tuple(foot + way * 0.09), tuple(way), (-0.8, 0.2, -0.6))
    palm(p, 'L', R, joint(p, 'pelvis') + Vector((0.2, -0.02, 0.12)), (-0.3, 0.0, -1.0), (1.0, 0.3, 0.0),
         (1.0, 0.6, 0.0))
    bottle = poses.frame_matrix(R @ foot, R.to_3x3() @ way, R.to_3x3() @ Vector((1.0, 0.0, 0.0)))
    return p, {'fist': {'L': False, 'R': True}, 'props': {'bottle': bottle}}


# A dance: the hips swaying side to side, a heel kicked up in turn, one arm swept over the head while the other
# curves out at the waist, changing over as the hips do
DANCE_SWAY = (12, 6, -6, -12, -6, 6)


def dance(frame, view, yaw):
    s = DANCE_SWAY[frame]
    lift_l, lift_r = (40, 0) if frame < 3 else (0, 40)
    p = _pose({'pelvis': (0, s, 0), 'spine': (0, -s, 0), 'chest': (0, -s / 2, s / 2), 'neck': (0, 0, 0),
               'head': (-6, s / 2, -s / 2),
               'thigh_L': (-lift_l / 2, -4, -6), 'shin_L': (lift_l * 1.8, 0, 0), 'foot_L': (lift_l / 2, 0, 6),
               'thigh_R': (-lift_r / 2, 4, 6), 'shin_R': (lift_r * 1.8, 0, 0), 'foot_R': (lift_r / 2, 0, -6)}, yaw)
    R = poses.root_matrix(p)
    high = 'L' if frame < 3 else 'R'
    for side, x in (('L', 1.0), ('R', -1.0)):
        sh = joint(p, f'uarm_{side}')
        if side == high:   # swept up over the head
            palm(p, side, R, sh + Vector((-x * 0.06, -0.04, 0.5)), (-x * 0.3, 0.0, 1.0), (x, 0.0, 0.0),
                 (x, 0.4, -0.4))
        else:   # curved out at the waist, the hand turned up
            palm(p, side, R, sh + Vector((x * 0.38, -0.12, -0.3)), (x, -0.3, 0.3), (0.0, 0.0, 1.0), (x, 0.6, 0.0))
    return p, {'fist': {'L': False, 'R': False}}


# Juggling three balls before the chest: the hands rising and dropping in turn, the balls wheeling between them
def juggle(frame, view, yaw):
    p = _stand({'neck': (-6, 0, 0), 'head': (-10, 0, 0)}, yaw)
    R = poses.root_matrix(p)
    centre = joint(p, 'chest') + Vector((0.0, -0.32, 0.0))
    for side, x, ph in (('L', 1.0, 0.0), ('R', -1.0, math.pi)):
        z = 0.05 * math.sin(frame / 6 * 2 * math.pi + ph)
        palm(p, side, R, centre + Vector((0.13 * x, 0.0, -0.08 + z)), (0.0, -1.0, 0.0), (0.0, 0.0, -1.0),
             (x, 0.6, -0.4))
    turn = Matrix.Rotation(-frame / 6 * 2 * math.pi, 4, 'Y')
    balls = R @ Matrix.Translation(centre + Vector((0.0, 0.0, 0.12))) @ turn
    return p, {'fist': {'L': False, 'R': False}, 'props': {'balls': balls}}


# At the anvil: the hammer raised over the right shoulder, brought down on the work held in the left fist's tongs,
# its face flat on the work, and lifted off it again. The head's length lies in the swing (`up`)
SMITH_HAMMER = [((-0.22, -0.16, 1.56), (0.2, 0.7, 0.68)), ((-0.18, -0.36, 1.34), (0.2, -0.4, 0.9)),
                ((-0.066, -0.3, 1.02), (0.05, -0.82, -0.57)), ((-0.14, -0.38, 1.14), (0.15, -0.8, 0.45))]
ANVIL = -0.52   # the anvil's middle ahead of the smith


def smith(frame, view, yaw):
    p = _stand({'spine': (14, 0, 0), 'chest': (8, 0, -4 if frame < 2 else 4), 'neck': (-6, 0, 0), 'head': (-10, 0, 0),
                'thigh_L': (-10, -6, -8), 'shin_L': (12, 0, 0), 'thigh_R': (8, 8, 8), 'shin_R': (10, 0, 0)}, yaw)
    at, haft = SMITH_HAMMER[frame]
    hammer = poses.axe_at(p, at, haft, (0.0, 0.0, 1.0))
    poses.grip(p, 'L', (0.13, ANVIL + 0.02, 0.79), (-0.2, -1.0, -0.1), (0.8, 0.4, -0.5))
    return p, {'fist': {'L': True, 'R': True}, 'axe': hammer, 'props': {'anvil': _ground(p, (0.0, ANVIL)),
                                                                        'hammer': hammer}}


# Sweeping: the broom's head swept across the ground before the feet, the left hand high on the handle, the right low
SWEEP = (-0.24, -0.08, 0.1, -0.02)


def sweep(frame, view, yaw):
    s = SWEEP[frame]
    p = _stand({'spine': (16, 0, -s * 30), 'chest': (6, 0, -s * 20), 'neck': (-8, 0, 0), 'head': (-10, 0, 0),
                'thigh_L': (-8, -6, -6), 'thigh_R': (6, 6, 6)}, yaw)
    R = poses.root_matrix(p)
    head = Vector((s, -0.5, 0.0))
    up = Vector((-s * 0.6 - 0.1, 0.32, 1.0)).normalized()
    broom = poses.frame_matrix(R @ head, R.to_3x3() @ up, R.to_3x3() @ Vector((1.0, 0.0, 0.0)))
    poses.grip(p, 'L', tuple(head + up * 1.15), tuple(up), (0.8, 0.4, -0.5))
    poses.grip(p, 'R', tuple(head + up * 0.72), tuple(up), (-0.8, 0.4, -0.5))
    return p, {'fist': {'L': True, 'R': True}, 'props': {'broom': broom}}


# The snake charmer: sat cross-legged, playing the flute out to the right over a basket, the snake swaying up out of it
CHARM_SWAY = (0.0, 6.0, 0.0, -6.0)


def charm(frame, view, yaw):
    p = _cross(yaw)
    M = laid(p, mouth(p) + Vector((-0.005, -0.02, -0.015)), (-0.6, -0.7, -0.3), (0.0, 0.2, 1.0))
    fist(p, 'L', M, (0.0, 0.0, 0.237), (0.0, 0.0, 1.0), (0.2, 0.4, -1.0))
    fist(p, 'R', M, (0.0, 0.0, 0.362), (0.0, 0.0, 1.0), (-0.8, 0.2, -0.6))
    basket = _ground(p, (-0.02, -0.52), CHARM_SWAY[frame])
    return p, {'fist': {'L': True, 'R': True}, 'axe': M, 'props': {'snake_basket': basket}}


ANIMS = {name: globals()[name] for name in PEOPLE}
poses.ANIMS.update(ANIMS)
