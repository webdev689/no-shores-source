"""A player's healing drink, which Daggerfall draws none of. The weapon is put away; the right fist takes a small round
flask of red draught from the belt, raises it to the lips, tips it up with the head thrown back, and lowers it before
the chest as the health comes. The left arm hangs at the side as the walk's free arm does. Four frames over the drink's
second, keyed in body space as the cast is, the same in every view. The flask is a prop (props3p.py `flask`) set in the
right fist, a layer of its own drawn in this move and its own on the move (onthemove.py `quaffwalk`).

This move is the player's own, as the cast is: no weapon in hand is drawn in it (layers.py `held_anims`).

Points and ways are in body space, as poses.py's: the ground under the body, +X its left, -Y ahead, +Z up."""
from mathutils import Vector

import people
import poses
from playing import mouth, stand

QUAFF = {'quaff': 4}
HEIGHT = 0.16   # the flask's foot to its mouth (props3p.py `flask`)
HOLD = 0.11     # the fist round its neck, up from its foot
ELBOW_R = (-0.8, 0.3, -0.6)   # the right elbow's way: out, back and down
FREE_L = {'clav_L': (0, -6, 0), 'uarm_L': (2, -4, 0), 'farm_L': (-14, 0, 0)}   # the left arm hanging, as the walk's
# each key: the trunk's bend (spine, neck, head, degrees forward), then the flask: its foot in body space, or None to
# set its mouth at the lips (`lips`, metres off them), and the way from its foot to its mouth. Taken from the belt at the
# right hip, the head bowed to it; raised to the chin, tilted to the mouth; tipped up, the head thrown back; lowered
# before the chest, upright, the head level again
KEYS = [
    ((4, 6, 6), (-0.22, -0.10, 0.90), None, (0.0, -0.1, 1.0)),
    ((0, 0, 0), None, (0.0, -0.03, -0.01), (0.1, 0.45, 0.89)),
    ((-4, -8, -12), None, (0.0, -0.005, 0.0), (0.05, 0.82, -0.5)),
    ((0, 2, 0), (-0.15, -0.28, 1.06), None, (0.0, 0.1, 1.0)),
]


def quaff(frame, view, yaw):
    """A key of the drink (`KEYS`): the flask in the right fist round its neck, the left arm hanging."""
    (spine, neck, head), foot, lips, way = KEYS[frame]
    p = stand({'spine': (spine, 0, 0), 'neck': (neck, 0, 0), 'head': (head, 0, 0), **FREE_L}, yaw)
    way = Vector(way).normalized()
    foot = Vector(foot) if foot is not None else mouth(p) + Vector(lips) - way * HEIGHT
    poses.grip(p, 'R', tuple(foot + way * HOLD), tuple(way), ELBOW_R)
    R = poses.root_matrix(p)
    flask = poses.frame_matrix(R @ foot, R.to_3x3() @ way, R.to_3x3() @ Vector((1.0, 0.0, 0.0)))
    return p, {'fist': {'L': False, 'R': True}, 'props': {'flask': flask}}


ANIMS = {'quaff': quaff}
poses.ANIMS.update(ANIMS)
poses.FISTS.update({'quaff': 'R'})
people.PROPS_OF['quaff'] = ('flask',)   # the flask's layer is drawn where its pose sets it out, as the people's props
