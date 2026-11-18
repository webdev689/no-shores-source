"""The body's own moves, which Daggerfall draws none of: the run, the crouch, still and walking, the jump, and the
climbing - the hang from a ledge, the shimmy along it, the climb up a face, the mantle over a lip and the vault over a
low wall.

The run, the crouch and the jump are captured (mocap.py --bake, specs/moves.json) and drawn with the weapon in the fist
as well as put away.

The dodge roll (`ELSEWHERE`) is drawn for use outside the game, never played in it: Quaternius's roll, a crouch, a
dive, over on the shoulders, the legs over, sat up and rising, the hands open and nothing held. It is drawn only when
a run names it (layers.py). The run is Quaternius's sprint, four frames of its stride: a foot down, the other knee through,
the other foot down, the first knee through. The climbing's hands are on the wall, so it is drawn only with the weapon put away (`BARE`). The mantle
and the vault play Quaternius's climb onto a box (`climbup`); the hang, the shimmy, the climb and the mantle's pull up
are keyed here, the hands laid on the lip or a hold by the arm's IK (`rig.solve_arm`).

These moves are the player's, so a class look's own moves never name them (layers.py `own_moves`)."""
import math

from mathutils import Matrix, Vector

import poses
from poses import captured, held, root_matrix, grounded
from rig import JOINTS, Pose, solve_arm

# each move's frames a view
MOVES = {'run': 4, 'crouch_idle': 1, 'crouch_walk': 4, 'jump': 3, 'hang': 1, 'shimmy': 4, 'climb': 4, 'mantle': 4, 'vault': 4}
ELSEWHERE = {'roll': 6}   # drawn for use outside the game alone
HELD = ('run', 'crouch_idle', 'crouch_walk', 'jump')     # drawn with the weapon in the fist and put away
BARE = ('hang', 'shimmy', 'climb', 'mantle', 'vault')    # the hands on the wall: the weapon only put away
# the captured climb onto a box, its frames as baked: plant, deep, tucked, knee up, rising, stepping, stepped off
MANTLE_KEYS, VAULT_KEYS = (1, 3, 5), (0, 2, 4, 6)

# the hang: plumb under the hands, the head back to the lip, the legs loose, the toes down
HANG = {'spine': (4, 0, 0), 'chest': (2, 0, 0), 'neck': (-6, 0, 0), 'head': (-14, 0, 0),
        'clav_L': (0, -12, 0), 'clav_R': (0, 12, 0),
        'thigh_L': (-8, -2, 0), 'shin_L': (14, 0, 0), 'foot_L': (28, 0, 0),
        'thigh_R': (-3, 2, 0), 'shin_R': (22, 0, 0), 'foot_R': (22, 0, 0)}
LIP = (0.24, -0.16, 0.50)   # a hand on the lip from its shoulder: out, ahead, up (metres, body space)
# the shimmy toward the body's left, each frame's hands out from the middle (left, right): the left reaches, the body
# shifts under the planted hands, the right is brought in, the body shifts again
SHIMMY_HANDS = ((0.46, 0.20), (0.33, 0.33), (0.36, 0.08), (0.22, 0.22))
SWAY = 10.0                 # the hips' and the legs' swing toward the reaching hand, degrees
# the climb up a face: a hand high and the other foot up, then both halfway, then the other side
CLIMB_HIGH, CLIMB_LOW, CLIMB_MID = 0.56, 0.28, 0.42
DOWN = (0.45, 0.35, -1.0)   # a pulling arm's elbow: down along the body, a little out and back
CLIMB_KNEE = {'thigh': (-55, 0, 0), 'shin': (78, 0, 0), 'foot': (-8, 0, 0)}
CLIMB_HALF = {'thigh': (-28, 0, 0), 'shin': (46, 0, 0), 'foot': (8, 0, 0)}
CLIMB_DOWN = {'thigh': (-4, 0, 0), 'shin': (10, 0, 0), 'foot': (18, 0, 0)}


def _hands(p, at, grip=True, elbows=(1.0, 0.45, -0.2)):
    """Each wrist laid at `at[side]`: (out from the body's middle, ahead of its shoulder, up from its shoulder),
    metres in body space; each elbow toward `elbows` (out, back, up; out mirrored). Gripping, the knuckles lie over the
    hold."""
    R = root_matrix(p)
    rot = R.to_3x3()
    W = p.world()
    for side, sx in (('L', 1.0), ('R', -1.0)):
        shoulder = R.inverted() @ W[f'uarm_{side}'].translation
        out, ahead, up = at[side]
        target = R @ Vector((sx * out, shoulder.y + ahead, shoulder.z + up))
        knuckles = rot @ (Vector((0.0, -0.7, 0.7)) if grip else Vector((0.0, -0.2, -1.0)))
        solve_arm(p, side, target, rot @ Vector((sx * elbows[0], elbows[1], elbows[2])), hand_dir=knuckles)
    return p


def _pinned(build, frame):
    """Frame `frame` of a keyed move at frame 0's height: hanging or climbing, the body does not bob as the lowest
    foot changes."""
    p = build(frame)
    z = grounded(build(0)).root_loc.z
    p.root_loc.z = z
    return p


def _hang_pose(yaw, sway=0.0):
    rot = dict(HANG)
    rot['pelvis'] = (0, sway, 0)
    rot['thigh_L'] = (HANG['thigh_L'][0], HANG['thigh_L'][1] - sway, 0)
    rot['thigh_R'] = (HANG['thigh_R'][0], HANG['thigh_R'][1] - sway, 0)
    return Pose(rot, yaw=yaw)


def hang(frame, view, yaw):
    p = _pinned(lambda f: _hang_pose(yaw), frame)
    return _hands(p, {'L': LIP, 'R': LIP}), {'fist': {'L': True, 'R': True}}


def shimmy(frame, view, yaw):
    """Along the lip toward the body's left: the leading hand reaches, the trailing hand follows, the hips swing
    against them. Played backward it goes the other way."""
    p = _pinned(lambda f: _hang_pose(yaw, SWAY * math.cos(f * math.pi / 2)), frame)
    left, right = SHIMMY_HANDS[frame]
    at = {'L': (left, LIP[1], LIP[2]), 'R': (right, LIP[1], LIP[2])}
    return _hands(p, at), {'fist': {'L': True, 'R': True}}


def _climb_pose(frame, yaw):
    rot = {'spine': (6, 0, 0), 'chest': (3, 0, 0), 'neck': (-4, 0, 0), 'head': (-12, 0, 0),
           'clav_L': (0, -8, 0), 'clav_R': (0, 8, 0)}
    up = {0: 'R', 2: 'L'}.get(frame)   # the knee raised: the side opposite the high hand
    for side, sx in (('L', 1.0), ('R', -1.0)):
        leg = CLIMB_HALF if up is None else CLIMB_KNEE if side == up else CLIMB_DOWN
        rot[f'thigh_{side}'] = (leg['thigh'][0], -2 * sx, 0)
        rot[f'shin_{side}'] = leg['shin']
        rot[f'foot_{side}'] = leg['foot']
    return Pose(rot, yaw=yaw)


def climb(frame, view, yaw):
    """Up a face, hand over hand: the left hand high and the right knee up, both halfway, then the other side."""
    p = _pinned(lambda f: _climb_pose(f, yaw), frame)
    high = {0: 'L', 2: 'R'}.get(frame)
    at = {s: (0.22, -0.14, CLIMB_MID if high is None else CLIMB_HIGH if s == high else CLIMB_LOW) for s in 'LR'}
    return _hands(p, at, elbows=DOWN), {'fist': {'L': True, 'R': True}}


def _pull_pose(yaw):
    rot = {'spine': (10, 0, 0), 'chest': (6, 0, 0), 'neck': (-4, 0, 0), 'head': (-8, 0, 0),
           'clav_L': (0, -10, 0), 'clav_R': (0, 10, 0),
           'thigh_L': (-6, -2, 0), 'shin_L': (24, 0, 0), 'foot_L': (26, 0, 0),
           'thigh_R': (-48, 2, 0), 'shin_R': (82, 0, 0), 'foot_R': (-6, 0, 0)}
    return grounded(Pose(rot, yaw=yaw))


def mantle(frame, view, yaw):
    """Up over a lip from the hang: pulled up, the chest at the lip and a knee coming up; then pushed up on straight
    arms, the knee onto the top, and risen onto it."""
    if frame == 0:
        p = _pull_pose(yaw)
        at = {s: (0.22, -0.30, 0.10) for s in 'LR'}
        return _hands(p, at, elbows=DOWN), {'fist': {'L': True, 'R': True}}
    return captured('climbup', MANTLE_KEYS[frame - 1], yaw), {'fist': {'L': False, 'R': False}}


def vault(frame, view, yaw):
    """Over a low wall without stopping: the hands planted, the legs tucked over them, landed, stepped off."""
    return captured('climbup', VAULT_KEYS[frame], yaw), {'fist': {'L': False, 'R': False}}


# the right fist's weapon in each held move: its line and its edge's way (body space). The run's raised, the blade up
# and a little ahead, its edge to the front; the crouch's low and ahead
HAFTS = {'run': ((-0.0999, -0.5496, 0.8294), (0.0657, -0.8354, -0.5456)),
         'crouch_idle': ((-0.10, -0.85, -0.50), (0.0, -0.5, 0.86)),
         'crouch_walk': ((-0.10, -0.85, -0.50), (0.0, -0.5, 0.86))}
JUMP_BLADES = (-0.7, 0.1, 0.7)   # poses.py `held`'s own


def run(frame, view, yaw):
    """The sprint's stride, the weapon raised in the pumping fist: the blade up and a little ahead, its edge to the
    front, ready to strike."""
    p = captured('run', frame, yaw)
    haft, blades = HAFTS['run']
    return p, {'axe': held(p, haft, blades=blades)}


def crouch_idle(frame, view, yaw):
    p = captured('crouch_idle', frame, yaw)
    haft, blades = HAFTS['crouch_idle']
    return p, {'axe': held(p, haft, blades=blades)}


def crouch_walk(frame, view, yaw):
    p = captured('crouch_walk', frame, yaw)
    haft, blades = HAFTS['crouch_walk']
    return p, {'axe': held(p, haft, blades=blades)}


def _forearm_up(p, side):
    """The jump's weapon line from `side`'s fist: up along the forearm, the arm out for the balance (body space)."""
    W = p.world()
    fore = (W[f'hand_{side}'].translation - W[f'farm_{side}'].translation).normalized()
    return tuple(root_matrix(p).inverted().to_3x3() @ (fore + Vector((0.0, 0.0, 0.6))))


JUMP_SPREAD = 60.0   # the jump's arms out at most this far from hanging: raised higher, the armpit's skin sheets out


def _arms_down(p, most=JUMP_SPREAD):
    """The captured arms let down at the shoulder, about the body's front-to-back axis, to `most` degrees out from the
    side; an arm already lower is left as captured."""
    R = root_matrix(p).to_3x3()
    axis = R @ Vector((0.0, 1.0, 0.0))
    for side, sign in (('L', 1.0), ('R', -1.0)):
        W = p.world()
        j = f'uarm_{side}'
        d = (R.inverted() @ (W[f'farm_{side}'].translation - W[j].translation)).normalized()
        spread = math.degrees(math.atan2(abs(d.x), -d.z))
        if spread > most:
            turn = Matrix.Rotation(math.radians(sign * (spread - most)), 3, axis)
            p.quat[j] = (W[JOINTS[j][0]].to_3x3().inverted() @ turn @ W[j].to_3x3()).to_quaternion()


def jump(frame, view, yaw):
    """Up, at the top, coming down: the arms out for the balance, the weapon up along the forearm."""
    p = captured('jump', frame, yaw)
    _arms_down(p)
    return p, {'axe': held(p, _forearm_up(p, 'R'), blades=JUMP_BLADES)}


def roll(frame, view, yaw):
    """The dodge roll: crouched, diving, over on the shoulders, the legs over, sat up, rising; the hands open."""
    return captured('roll', frame, yaw), {}


def _mirrored(v):
    return (-v[0], v[1], v[2])


def left_hold(p, anim):
    """A second sword in the left fist in held move `anim` (`HELD`), held as the right holds its own, across the body's
    middle: laid in the fist as the move closes it (poses.py `in_fist`), so the arm is the one the body is drawn with."""
    if anim == 'jump':
        return poses.in_fist(p, _forearm_up(p, 'L'), 'L', _mirrored(JUMP_BLADES))
    haft, blades = HAFTS[anim]
    return poses.in_fist(p, _mirrored(haft), 'L', _mirrored(blades))


ANIMS = {'run': run, 'crouch_idle': crouch_idle, 'crouch_walk': crouch_walk, 'jump': jump, 'roll': roll, 'hang': hang,
         'shimmy': shimmy, 'climb': climb, 'mantle': mantle, 'vault': vault}
poses.ANIMS.update(ANIMS)
# both fists closed in the held moves, which a pair's second blade and a torch are held in (layers.py `PairBearer`)
poses.FISTS.update({**dict.fromkeys(HELD, 'LR'), **dict.fromkeys(BARE, 'LR'), 'mantle': '', 'vault': '', 'roll': ''})
