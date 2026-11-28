"""The medium fighter's keyed poses: walk (4), attack (6), hurt (1), idle (1) and bow (4) frames, as the classic
class sprites' records hold them, and the forge's own past them (`OWN`): death (5) and the body fallen (1), parry
(3), war cry (4) and a breathing idle (4). One animation serves all five views; the view only turns the body.

Rotations are degrees about the joint's rest axes (+X left, +Y back, +Z up): a thigh or arm swings forward on -X,
a knee bends on +X, an elbow on -X, the trunk leans forward on +X; a left limb spreads out on -Y, a right on +Y.
Points given in body space are in the root's frame: the ground under the body, facing -Y."""
import json
import math
import os
import re

from mathutils import Matrix, Vector

from gear import STAFF_FIST, STAFF_HANDS, STAFF_POLE, STAFF_REACH, STAFF_TOP, SWORD_TIP, bow_tips
from rig import JOINTS, Pose, reach, rehinge, rest, solve_arm

# A frame's fitted adjustment (fit.py): joint rotations added to its keys ('rot'), the body's turn ('turn'), the axe
# grip and haft ('grip', 'haft', body space), the attack's fist and axe head on screen ('fist', 'head'), the axe's
# roll about its haft in degrees ('roll'), the fist's place along it ('slide', metres), and each solved elbow's
# swivel ('elbow_L', 'elbow_R', degrees), and the bow's draw ('draw', metres). Keyed '<anim>:<view>:<frame>'.
FIT = {}
WEAPON = ['axe']   # the weapon the spec names (load_spec): an axe, a long sword or a staff, each held in two hands to strike
# the forge's own carry (layers.py): the walk and the idle hold the weapon as Daggerfall's carriers do, forward and
# level at the hip, its head or point ahead, its edge (an axe's crescent) down; alike in every view, where a fitted
# view turned its weapon its own way, so the blade ran through the hips. The fist sits out and ahead of the fitted one,
# so a long hilt behind it clears the hip. The body keeps its fitted stance; the arm is solved again to the fist
CARRY = [False]
WEAPON_FIT = ('grip', 'haft', 'roll', 'slide', 'elbow_R')   # a fit's weapon and its arm, which the carry leaves
WALK_CARRY = ((-0.35, -0.16, 0.86), (-0.10, -1.0, 0.02), (0.5, -0.1, -0.86), (-1.0, 0.3, -0.5))   # fist, line, edge,
IDLE_CARRY = ((-0.30, -0.28, 0.86), (-0.18, -1.0, 0.13), (0.5, -0.1, -0.86), (-1.0, 0.6, -0.3))   # the elbow's pole
# a record whose frames run in another order than the keys': (anim, view) -> the keyed frame each of its frames takes
KEYS = {}
_adj = {}
_gap = [0.0]   # metres the second hand on the axe falls short of the haft, this frame (pose_for gives it as 'gap')


def load_fit(path):
    FIT.clear()
    if os.path.exists(path):
        FIT.update(json.load(open(path)))


def load_spec(spec):
    """Each record's `keys`: Daggerfall's woman steps off on another foot in some views, so her frame takes another
    keyed frame there. A record without them takes its own frames' keys."""
    KEYS.clear()
    WEAPON[0] = spec.get('weapon', 'axe')
    for rec in spec['records']:
        if rec.get('keys'):
            KEYS[(rec['anim'], rec['view'])] = list(rec['keys'])


def _plus(a, key):
    d = _adj.get(key)
    return Vector(a) + Vector(d) if d else Vector(a)

SOLE = [Vector((0, 0.04, -0.085)), Vector((0, -0.13, -0.08)), Vector((0, -0.19, -0.075))]
FIST = 0.075   # wrist to the middle of a closed fist


# the cloth that swings with the legs, rigid on the pelvis: each panel toward the front (-1) or the back (1), and the
# share of a thigh's swing it takes. A thigh swung forward lifts the front panel; one swung back pushes the back. Each
# outfit's panels, whichever copy Blender numbers their names (a second outfit's are `loin_front.001`)
CLOTH = {'loin_front': -1.0, 'loin_back': 1.0}
CLOTH_SWING = 0.55


def swings(name):
    """Which way a part swings as a panel of cloth (CLOTH), or None: its name without Blender's copy number."""
    return CLOTH.get(re.sub(r'\.\d{3}$', '', name))


def hinge(co):
    """A hanging panel's hinge: the middle of its top edge, in its own coordinates."""
    import numpy as np
    co = np.asarray(co)
    top = co[:, 2].max()
    return (0.0, float(co[co[:, 2] > top - 0.01, 1].mean()), float(top))


def cloth(name, W, at):
    """The turn a cloth panel takes about its hinge `at` (its own coordinates) for the thighs in `W`, the joints'
    world matrices: a 4x4 to lay after its joint's. None for a part that does not swing."""
    import numpy as np
    side = swings(name)
    if side is None:
        return None
    P = np.linalg.inv(np.array(W['pelvis']))
    turns = []
    for s in 'LR':
        hip = (P @ np.array(W[f'thigh_{s}']))[:3, 3]
        knee = (P @ np.array(W[f'shin_{s}']))[:3, 3]
        d = knee - hip
        turns.append(math.atan2(-d[1], -d[2]))   # the thigh's swing forward from hanging straight down
    a = max(0.0, max(turns) if side < 0 else -min(turns)) * CLOTH_SWING
    th = a * (1.0 if side > 0 else -1.0)   # about +X: the panel's foot toward the back for the back panel
    c, sn = math.cos(th), math.sin(th)
    R = np.array([[1, 0, 0, 0], [0, c, -sn, 0], [0, sn, c, 0], [0, 0, 0, 1.0]])
    T, Ti = np.eye(4), np.eye(4)
    T[:3, 3], Ti[:3, 3] = at, [-v for v in at]
    return T @ R @ Ti


def frame_matrix(origin, z_dir, x_dir):
    z = Vector(z_dir).normalized()
    x = Vector(x_dir)
    x = (x - x.project(z)).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(origin)
    return m


def root_matrix(pose):
    return pose.world()['root']


def grounded(pose):
    """Lower or lift the root so the lowest sole point touches the ground."""
    W = pose.world()
    low = min((W[f'foot_{s}'] @ p).z for s in 'LR' for p in SOLE)
    pose.root_loc.z -= low
    return pose


def _along(j, child, t, r):
    """A probe a share `t` of the way down joint `j`'s segment toward `child`'s head, `r` metres round."""
    return (j, (rest(child) - rest(j)) * t, r)


# the body's bulk as spheres on its joints (joint, offset from its head at rest, radius): what touches the ground
# when the body is down on a knee or lying, as no sole does
BULK = [('head', Vector((0, -0.03, 0.12)), 0.12), ('neck', Vector((0, 0, 0.02)), 0.07),
        ('chest', Vector((0, 0.01, 0.08)), 0.15), ('spine', Vector((0, 0.01, 0.06)), 0.13),
        ('pelvis', Vector((0, 0.01, -0.03)), 0.13)]
for _s in 'LR':
    BULK += [_along(f'uarm_{_s}', f'farm_{_s}', 0.0, 0.08), _along(f'uarm_{_s}', f'farm_{_s}', 0.5, 0.06),
             _along(f'farm_{_s}', f'hand_{_s}', 0.0, 0.05), _along(f'farm_{_s}', f'hand_{_s}', 0.5, 0.045),
             (f'hand_{_s}', Vector((0, 0, -0.07)), 0.045),
             _along(f'thigh_{_s}', f'shin_{_s}', 0.5, 0.085), _along(f'shin_{_s}', f'foot_{_s}', 0.0, 0.065),
             _along(f'shin_{_s}', f'foot_{_s}', 0.5, 0.055)]


ARM_JOINTS = ('uarm', 'farm', 'hand')


def lowest(pose, arms=True):
    """The height of the body's lowest point: its soles' or its bulk's, the arms' too unless `arms` is false."""
    W = pose.world()
    soles = min((W[f'foot_{s}'] @ p).z for s in 'LR' for p in SOLE)
    bulk = [(j, c, r) for j, c, r in BULK if arms or j[:4] not in ARM_JOINTS]
    return min(soles, min((W[j] @ c).z - r for j, c, r in bulk))


def grounded_body(pose, arms=False):
    """Lower or lift the root so the body's lowest point touches the ground: a knee, a hip or a chest as readily as
    a sole, and an arm with `arms`."""
    pose.root_loc.z -= lowest(pose, arms)
    return pose


def floor_matrix(pose):
    """The ground under the body, turned as it is: the root's frame at the ground's height, however far
    `grounded_body` sank the root to bring a knee or the chest down."""
    return Matrix.Translation((pose.root_loc.x, pose.root_loc.y, 0.0)) @ Matrix.Rotation(math.radians(pose.yaw), 4, 'Z')


def grip(pose, side, at, haft, pole, knuckles=None):
    """Close the `side` fist around a haft at body-space point `at` running along `haft`: the arm solved to it, the
    elbow toward `pole`. The fist's long axis is the forearm's line squared to the haft, or `knuckles` if given.
    Gives the grip as held (world), the haft's direction and how far short of `at` the fist fell: a grip past the
    arm's reach is held where the straight arm puts the fist, so what it holds never floats off the hand."""
    R = root_matrix(pose)
    rot = R.to_3x3()
    at_w = R @ Vector(at)
    haft_w = (rot @ Vector(haft)).normalized()
    W = pose.world()
    shoulder = W[f'uarm_{side}'].translation
    k = (rot @ Vector(knuckles)) if knuckles is not None else (at_w - shoulder)
    k = (k - k.project(haft_w)).normalized()
    wrist = at_w - k * FIST
    short = max(0.0, (wrist - shoulder).length - reach(side))
    if short:
        wrist = shoulder + (wrist - shoulder).normalized() * reach(side)
        at_w = wrist + k * FIST
    pole_w = rot @ Vector(pole)
    swivel = _adj.get(f'elbow_{side}')
    if swivel:   # the elbow turned about the shoulder-to-wrist line
        pole_w = Matrix.Rotation(math.radians(swivel), 3, (wrist - shoulder).normalized()) @ pole_w
    solve_arm(pose, side, wrist, pole_w, hand_dir=k, hand_up=haft_w.cross(k))
    return at_w, haft_w, short


def axe_at(pose, grip_at, haft, blade_up, left_at=None, pole_r=(-1, 0.3, -0.5), pole_l=(1, 0.3, -0.5),
           knuckles_r=None, knuckles_l=None, slide=0.0):
    """The axe held by its haft at `grip_at` (right fist), the head along `haft`, blades along `blade_up`; with
    `left_at` (a distance up the haft) the left fist holds it too. `slide` is how far down the haft from its own grip
    the right fist holds it (the staff's attack holds it lower than it is carried)."""
    grip_at, haft = _plus(grip_at, 'grip'), _plus(haft, 'haft')
    at_w, haft_w, _ = grip(pose, 'R', grip_at, haft, pole_r, knuckles_r)
    if left_at is not None:   # up the haft from where the right fist holds it
        _, _, short = grip(pose, 'L', root_matrix(pose).inverted() @ (at_w + haft_w * left_at), haft, pole_l, knuckles_l)
        _gap[0] += short
    rot = root_matrix(pose).to_3x3()
    blade = rot @ Vector(blade_up)
    if _adj.get('roll'):
        blade = Matrix.Rotation(math.radians(_adj['roll']), 3, haft_w) @ blade
    # 'slide': the fist further down the haft (+) or up it, so the axe reaches further or less
    return frame_matrix(at_w - haft_w * (slide + _adj.get('slide', 0.0)), haft_w, blade)


def staff_at(pose, key, across=(1.0, -0.4, 0.0), **kw):
    """The staff in the right fist as `key` carries it: (the fist in body space, the staff's line up from it)."""
    grip_at, haft = key
    return axe_at(pose, grip_at, haft, across, **kw)


def stance(rot, yaw, ground=grounded):
    rot = dict(rot)
    for j, d in _adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(rot, yaw=yaw + _adj.get('turn', 0.0))
    ground(p)
    return p


def idle(frame, view, yaw, rest=False):
    # the weight on one leg, its hip a little out and the spine set back over it, the axe's shoulder a little lower,
    # the head tilted and turned a few degrees: no two sides alike, as no one stands
    p = stance({
        'pelvis': (0, 3, 10), 'spine': (4, -2, -4), 'chest': (2, 0, -4), 'neck': (6, 0, 2), 'head': (-8, 4, 3),
        'thigh_R': (-15, 14, 14), 'shin_R': (8, 0, 0), 'foot_R': (8, 0, -8),
        'thigh_L': (25, -2, -10), 'shin_L': (16, 0, 0), 'foot_L': (4, 0, 8),
        'clav_L': (0, -6, 0), 'uarm_L': (4, -12, 0), 'farm_L': (-12, 0, 8),
        **({'clav_R': (0, 3, 0), 'uarm_R': (4, 12, 0), 'farm_R': (-12, 0, -8)} if rest else {'clav_R': (0, 3, 0)}),
    }, yaw)
    if rest:
        return p, bow_in_left(p, BOW_IDLE)
    if WEAPON[0] == 'staff':
        return p, {'axe': staff_at(p, STAFF_IDLE, pole_r=(-1, 0.6, -0.3))}
    if CARRY[0]:
        fist, line, edge, pole = IDLE_CARRY
        return p, {'axe': axe_at(p, fist, line, edge, pole_r=pole)}
    grip_at, haft = IDLE_AXE.get(view, IDLE_AXE[None])
    axe = axe_at(p, grip_at, haft, (-0.7, 0.1, 0.7), pole_r=(-1, 0.6, -0.3))
    return p, {'axe': axe}


# the idle's axe, by view: carried forward and level, but in the front view the classic frame lets it hang down and
# out to the ground, which no single carry shows from every side
IDLE_AXE = {None: ((-0.26, -0.22, 0.86), (-0.18, -1.0, 0.13)),
            0: ((-0.26, -0.16, 0.84), (-0.5, -0.45, -0.75))}


# The staff as Daggerfall's mage carries it (TEXTURE.486, 485), in the right fist, upright. A key: the fist in body
# space, and the staff's line up from it. Measured where the front view and the side view show the fist, the knob and
# the foot. Walking, it is a walking stick: planted ahead, passed, lifted and carried on. Its foot stays
# level with the feet on screen, as Daggerfall's does, never lower
STAFF_WALK = [((-0.45, -0.36, 1.30), (0.0, 0.18, 1.0)),
              ((-0.47, -0.42, 1.30), (0.0, -0.06, 1.0)),
              ((-0.45, -0.30, 1.42), (0.0, 0.05, 1.0)),
              ((-0.47, -0.30, 1.30), (-0.06, 0.10, 1.0))]
STAFF_IDLE = ((-0.40, -0.52, 1.32), (0.0, 0.03, 1.0))   # planted before the right foot
STAFF_HURT = ((-0.50, 0.0, 1.45), (0.46, 0.47, 0.75))   # thrown back over the right shoulder, its foot flung out


# walk: contact, passing, contact, passing - the left leg leads on frame 0
WALK_LEGS = [
    {'thigh_L': (-24, -5, -6), 'shin_L': (6, 0, 0), 'foot_L': (-6, 0, 6),
     'thigh_R': (20, 5, 6), 'shin_R': (22, 0, 0), 'foot_R': (10, 0, -6)},
    {'thigh_L': (-4, -5, -6), 'shin_L': (4, 0, 0), 'foot_L': (2, 0, 6),
     'thigh_R': (-14, 5, 6), 'shin_R': (48, 0, 0), 'foot_R': (-6, 0, -6)},
]


def _mirror_legs(legs):
    """The other foot's step: the legs mirrored."""
    out = {}
    for j, (x, y, z) in legs.items():
        out[j.replace('_L', '_X').replace('_R', '_L').replace('_X', '_R')] = (x, -y, -z)
    return out


def walk(frame, view, yaw, rest=False):
    # the right foot's step mirrors the left's, the free arm swings as far back as forward
    legs = WALK_LEGS[frame % 2] if frame < 2 else _mirror_legs(WALK_LEGS[frame % 2])
    lead_left = frame in (0, 1)
    swing = (16 if frame == 0 else -16 if frame == 2 else 0)
    arm = {'clav_L': (0, -6, 0), 'uarm_L': (swing, -15, 0), 'farm_L': (-16, 0, 8)}
    if rest:   # the right arm empty, swinging against the left leg as the free arm swings against the right
        back = (-14 if frame == 0 else 11 if frame == 2 else 0)
        arm.update({'clav_R': (0, 6, 0), 'uarm_R': (back, 15, 0), 'farm_R': (-16, 0, -8)})
    else:   # the free left arm hangs as near the side as the right's carry: its fist as far out as the right fist
        arm.update({'uarm_L': (swing, -4, 0), 'farm_L': (-16, 0, 0), 'clav_R': (0, 6, 0)})
    p = stance({
        'pelvis': (0, 0, -5 if lead_left else 5), 'spine': (8, 0, 0), 'chest': (3, 0, 3 if lead_left else -3),
        'neck': (6, 0, 0), 'head': (-8, 0, 0), **arm, **legs}, yaw)
    if rest:
        return p, bow_in_left(p, BOW_WALK[frame])
    if WEAPON[0] == 'staff':
        return p, {'axe': staff_at(p, STAFF_WALK[frame])}
    bob = (0.0, 0.015, 0.0, 0.015)[frame]
    if CARRY[0]:   # the owner's carry
        (x, y, z), line, edge, pole = WALK_CARRY
        return p, {'axe': axe_at(p, (x, y, z + bob), line, edge, pole_r=pole)}
    axe = axe_at(p, (-0.31, -0.10, 0.86 + bob), (-0.10, -1.0, 0.02), (-0.7, 0.1, 0.7))
    return p, {'axe': axe}


# The attack, keyed per view as the classic records draw it: the body turns differently in each view (its back to
# the viewer at the wind-up from the side), so one motion turned five ways cannot match them. A key is
# (turn, fist, axe head, depth, crouch, lean, blades): the turn in degrees past the view's angle; the right fist and
# the axe head's centre as the viewer sees them (metres right and up from the ground under the body); how far the
# head sits away from the viewer (+) or toward them (-) when the axe is foreshortened; and blades 'face' (seen flat)
# or 'edge'.
AXE_REACH = 0.62   # grip to the axe head's centre
ATTACK = {
    0: [(0, (-0.22, 1.70), (0.05, 2.02), 1, 0.0, -4, 'face'),
        (0, (-0.12, 1.76), (-0.05, 2.14), 1, 0.0, -4, 'face'),
        (-15, (-0.30, 1.10), (-0.95, 1.42), 0, 0.04, 8, 'face'),
        (-30, (0.05, 1.08), (0.05, 0.55), -1, 0.12, 20, 'edge'),
        (-20, (0.50, 0.84), (0.56, 1.32), -1, 0.08, 14, 'face'),
        (0, (0.18, 1.66), (0.36, 2.02), 1, 0.0, -4, 'face')],
    1: [(0, (-0.50, 1.80), (0.14, 2.06), 0, 0.0, -4, 'face'),
        (0, (-0.58, 1.66), (-0.14, 2.12), 1, 0.0, -4, 'face'),
        (0, (-0.60, 1.18), (-1.04, 1.40), -1, 0.04, 8, 'face'),
        (0, (-0.20, 0.82), (-0.69, 1.18), -1, 0.12, 18, 'edge'),
        (20, (0.34, 0.92), (0.66, 1.30), -1, 0.08, 12, 'face'),
        (0, (-0.06, 1.74), (0.34, 2.08), 1, 0.0, -4, 'face')],
    2: [(-90, (-0.26, 1.74), (0.30, 2.00), 0, 0.0, -4, 'face'),
        (-90, (-0.32, 1.62), (0.18, 2.02), 0, 0.0, -4, 'face'),
        (0, (-0.56, 1.28), (-0.80, 1.36), -1, 0.04, 8, 'face'),
        (30, (-0.42, 0.88), (-0.86, 1.18), 0, 0.12, 18, 'edge'),
        (80, (-0.18, 0.76), (0.40, 1.28), -1, 0.08, 12, 'face'),
        (-60, (-0.26, 1.70), (0.24, 1.98), 0, 0.0, -4, 'face')],
    3: [(-45, (0.16, 1.72), (0.21, 2.0), 1, 0.0, -4, 'face'),
        (-45, (0.13, 1.68), (0.30, 1.98), 1, 0.0, -4, 'face'),
        (45, (0.10, 1.36), (0.167, 0.739), 1, 0.04, 8, 'edge'),
        (45, (-0.34, 0.86), (-0.68, 1.20), -1, 0.12, 14, 'face'),
        (45, (-0.55, 0.86), (-0.037, 0.353), 1, 0.12, 18, 'edge'),
        (0, (-0.40, 1.68), (-0.19, 1.98), 1, 0.0, -4, 'face')],
    4: [(0, (0.24, 1.66), (-0.08, 2.03), 1, 0.0, -4, 'face'),
        (0, (0.34, 1.74), (0.30, 2.08), 1, 0.0, -4, 'face'),
        (0, (0.21, 1.28), (0.84, 1.48), 1, 0.04, 8, 'edge'),
        (0, (0.0, 0.92), (0.05, 0.85), 1, 0.12, 20, 'edge'),
        (20, (-0.44, 0.88), (-0.60, 1.22), 1, 0.08, 12, 'face'),
        (0, (-0.32, 1.80), (-0.44, 2.06), 1, 0.0, -4, 'face')],
}


# The long sword's attack, keyed as the axe's: (turn, fist, the blade's point, depth, crouch, lean, blades). Measured from
# where Daggerfall's archers show the hilt and the point on screen.
SWORD_ATTACK = {
    0: [(0, (-0.506, 0.953), (-1.227, 1.273), 0, 0.04, 4, 'face'),
        (0, (-0.406, 0.809), (-1.303, 0.857), 0, 0.04, 4, 'face'),
        (0, (-0.409, 1.161), (-1.29, 1.161), 0, 0.04, 4, 'face'),
        (0, (-0.208, 1.626), (-0.448, 1.706), 1, 0.04, 4, 'face'),
        (0, (0.466, 1.546), (0.562, 1.866), -1, 0.04, 4, 'edge'),
        (0, (0.256, 1.065), (0.785, 1.241), 0, 0.04, 4, 'face')],
    1: [(0, (-0.306, 1.033), (-0.53, 1.273), 0, 0.04, 4, 'face'),
        (0, (-0.401, 0.889), (-0.689, 0.889), -1, 0.04, 4, 'face'),
        (0, (-0.485, 1.177), (-0.886, 1.161), -1, 0.04, 4, 'face'),
        (0, (-0.496, 1.546), (-0.977, 1.658), -1, 0.04, 4, 'face'),
        (0, (0.812, 1.786), (1.004, 1.898), 0, 0.04, 4, 'face'),
        (0, (0.812, 1.786), (1.004, 1.898), 0, 0.04, 4, 'edge')],
    2: [(0, (-0.096, 0.921), (-0.128, 0.761), 1, 0.04, 4, 'edge'),
        (0, (-0.096, 0.921), (-0.128, 0.761), -1, 0.04, 4, 'face'),
        (0, (0.424, 0.809), (0.424, 0.649), 0, 0.04, 4, 'edge'),
        (0, (-0.537, 1.434), (-1.018, 1.594), -1, 0.04, 4, 'face'),
        (0, (0.472, 1.754), (0.905, 1.962), 0, 0.04, 4, 'face'),
        (0, (0.416, 0.745), (0.448, 0.601), 0, 0.04, 4, 'face')],
    3: [(0, (0.57, 0.921), (1.163, 1.225), 0, 0.04, 4, 'face'),
        (0, (0.419, 0.857), (1.076, 0.857), -1, 0.04, 4, 'face'),
        (0, (0.415, 1.113), (0.719, 1.113), -1, 0.04, 4, 'face'),
        (0, (0.415, 1.113), (0.719, 1.113), 1, 0.04, 4, 'edge'),
        (0, (-0.275, 1.578), (-0.019, 1.834), 0, 0.04, 4, 'face'),
        (0, (0.001, 0.937), (-0.704, 1.193), -1, 0.04, 4, 'face')],
    4: [(0, (0.505, 0.921), (1.258, 1.241), -1, 0.04, 4, 'face'),
        (0, (0.432, 0.841), (1.297, 0.841), -1, 0.04, 4, 'edge'),
        (0, (0.378, 1.097), (1.115, 1.097), -1, 0.04, 4, 'face'),
        (0, (0.378, 1.097), (1.115, 1.097), -1, 0.04, 4, 'edge'),
        (0, (-0.444, 1.466), (-0.556, 1.947), 1, 0.04, 4, 'edge'),
        (0, (-0.258, 1.033), (-0.691, 1.161), -1, 0.04, 4, 'face')],
}


# The staff's attack, keyed as the axe's: (turn, the right fist, the knob's spike, depth, crouch, lean, blades). The
# fist holds the staff 0.75 m up from its foot, the left fist 0.45 m above it. Measured from where Daggerfall's mage
# shows the knob and the foot on screen; seen from behind (views 3 and 4) the knob turns its dark side
STAFF_ATTACK = {
    0: [(0, (-0.366, 1.074), (0.394, 2.074), -1, 0.06, 6, 'face'),
        (0, (-0.42, 1.081), (0.763, 1.842), 0, 0.06, 6, 'face'),
        (0, (-0.306, 1.19), (1.08, 1.207), 1, 0.06, 6, 'face'),
        (0, (-0.048, 1.278), (0.938, 0.907), 1, 0.06, 6, 'face'),
        (0, (-0.592, 1.058), (0.561, 1.653), -1, 0.06, 6, 'face'),
        (0, (-0.476, 1.05), (0.509, 1.871), -1, 0.06, 6, 'face')],
    1: [(0, (-0.367, 1.089), (-0.221, 2.07), -1, 0.06, 6, 'face'),
        (0, (-0.466, 1.085), (0.123, 1.823), -1, 0.06, 6, 'face'),
        (0, (-0.609, 1.171), (0.787, 1.146), -1, 0.06, 6, 'face'),
        (0, (-0.501, 1.242), (0.946, 0.83), 0, 0.06, 6, 'face'),
        (0, (-0.559, 1.047), (-0.321, 1.605), -1, 0.06, 6, 'face'),
        (0, (-0.468, 1.043), (-0.283, 1.831), -1, 0.06, 6, 'face')],
    2: [(0, (-0.32, 1.198), (-0.729, 2.014), -1, 0.06, 6, 'face'),
        (0, (-0.368, 1.16), (-0.603, 1.792), -1, 0.06, 6, 'face'),
        (0, (-0.596, 1.185), (0.115, 1.18), -1, 0.06, 6, 'face'),
        (0, (-0.696, 1.226), (0.264, 0.778), -1, 0.06, 6, 'face'),
        (0, (-0.313, 1.043), (-1.011, 1.591), -1, 0.06, 6, 'face'),
        (0, (-0.319, 1.103), (-0.858, 1.807), -1, 0.06, 6, 'face')],
    3: [(0, (-0.234, 1.437), (-0.665, 1.938), 0, 0.06, 6, 'face'),
        (0, (-0.369, 1.36), (-0.897, 1.698), -1, 0.06, 6, 'face'),
        (0, (-0.381, 1.264), (-0.763, 1.176), -1, 0.06, 6, 'face'),
        (0, (-0.24, 1.234), (-0.492, 0.841), -1, 0.06, 6, 'face'),
        (0, (0.237, 1.062), (-0.897, 1.554), 0, 0.06, 6, 'face'),
        (0, (0.17, 1.038), (-0.833, 1.73), 0, 0.06, 6, 'face')],
    4: [(0, (0.386, 1.014), (-0.312, 1.922), 1, 0.06, 6, 'face'),
        (0, (0.43, 1.035), (-0.633, 1.682), 0, 0.06, 6, 'face'),
        (0, (0.25, 1.204), (-0.905, 1.153), -1, 0.06, 6, 'face'),
        (0, (-0.247, 1.155), (-0.825, 0.865), -1, 0.06, 6, 'face'),
        (0, (0.633, 1.038), (-0.392, 1.586), 1, 0.06, 6, 'face'),
        (0, (0.514, 1.013), (-0.376, 1.762), 1, 0.06, 6, 'face')],
}


def attack(frame, view, yaw):
    sword, staff = WEAPON[0] == 'sword', WEAPON[0] == 'staff'
    turn, fist, head, depth, crouch, lean, blades = (SWORD_ATTACK if sword else STAFF_ATTACK if staff
                                                     else ATTACK)[view][frame]
    fist, head = tuple(_plus(fist, 'fist')), tuple(_plus(head, 'head'))
    bend = crouch * 220
    p = stance({
        'pelvis': (0, 0, 0), 'spine': (lean * 0.5, 0, 0), 'chest': (lean * 0.5, 0, 0), 'neck': (4, 0, 0),
        'head': (-6 - lean * 0.4, 0, 0),
        'thigh_L': (-14 - bend * 0.5, -14, -14), 'shin_L': (10 + bend, 0, 0), 'foot_L': (4 - bend * 0.5, 0, 10),
        'thigh_R': (16 - bend * 0.5, 14, 12), 'shin_R': (12 + bend, 0, 0), 'foot_R': (2 - bend * 0.5, 0, -8),
    }, yaw + turn)
    # screen to body space: the root turned by the yaw; the fist sits a little in front of the trunk
    R = root_matrix(p)
    to_body = R.inverted().to_3x3()
    fwd = R.to_3x3() @ Vector((0, -1, 0))
    fist_w = Vector((fist[0], 0, fist[1])) + Vector((fwd.x, fwd.y, 0)) * 0.28
    span = Vector((head[0] - fist[0], 0, head[1] - fist[1]))
    reach = SWORD_TIP if sword else STAFF_REACH if staff else AXE_REACH
    lift = max(reach ** 2 - span.length_squared, 0.0) ** 0.5
    haft_w = (span + Vector((0, lift * depth, 0))).normalized()
    if blades == 'face':
        blade_w = haft_w.cross(Vector((0, 1, 0)))
        if blade_w.length < 1e-3:
            blade_w = Vector((1, 0, 0))
    else:
        blade_w = Vector((0, 1, 0))
    # two hands: up the axe's haft or the staff, or under the sword's guard toward its pommel
    axe = axe_at(p, R.inverted() @ fist_w, to_body @ haft_w, to_body @ blade_w,
                 left_at=-0.09 if sword else STAFF_HANDS if staff else 0.20, slide=STAFF_FIST if staff else 0.0)
    return p, {'axe': axe}


def hurt(frame, view, yaw, rest=False):
    """Knocked back: thrown onto the left leg, the right knee kicked up, the free arm flung straight out to the side,
    the axe raised high and back over the right shoulder. At rest the bow is held out in the flung left fist and the
    empty right arm is flung out as the left is."""
    p = stance({
        'pelvis': (-12, 0, 0), 'spine': (-16, 0, 4), 'chest': (-14, 0, 4), 'neck': (-8, 0, 0), 'head': (-20, 0, 0),
        'thigh_R': (-62, 12, 12), 'shin_R': (72, 0, 0), 'foot_R': (-10, 0, -6),
        'thigh_L': (12, -6, -8), 'shin_L': (10, 0, 0), 'foot_L': (2, 0, 6),
        'clav_L': (0, -14, 0), 'uarm_L': (-12, -82, 0), 'farm_L': (-6, 0, 0),
        **({'clav_R': (0, 12, 0), 'uarm_R': (-20, 70, 0), 'farm_R': (-10, 0, 0)} if rest else {'clav_R': (0, 16, 0)}),
    }, yaw)
    if rest:
        return p, bow_in_left(p)
    if WEAPON[0] == 'staff':
        return p, {'axe': staff_at(p, STAFF_HURT, pole_r=(-1, 0.3, -0.5))}
    axe = axe_at(p, (-0.36, 0.04, 1.44), (-0.8, 0.22, 0.8), (1, 0, 0.8), pole_r=(-1, 0.3, -0.5))
    return p, {'axe': axe}


# The bow: full draw, held, loose, lowered. The archer stands side-on to the shot, the bow arm out along the body's
# left (+X) toward the target, in every view; drawn, that arm is straight. Keys: (left fist, bow's up direction, draw
# in metres, arrow nocked); a full draw's is None, as far as DRAW_FIST asks
BOW_KEYS = [
    ((0.86, -0.16, 1.48), (0.0, 0.0, 1.0), None, True),
    ((0.86, -0.16, 1.48), (0.04, 0.0, 1.0), None, True),
    ((0.60, -0.10, 1.34), (0.35, 0.0, 1.0), 0.02, False),
    ((0.36, -0.22, 1.02), (0.8, 0.0, 0.6), 0.0, False),
]
BOW_TURN = -90   # the body's front a quarter turn right of the shot
# Drawn, the string fist comes back before the right shoulder (DRAW_FIST, metres along the body's +X), its elbow
# straight out to the side at the shoulder's height (DRAW_POLE): from behind, both arms one level line, as
# Daggerfall's archer draws. Back to the jaw, the elbow could only tuck in behind the head or rise over it
DRAW_FIST = -0.20
DRAW_POLE = (-1.0, 0.0, 0.0)
# Loosed and lowered, the string fist is off the string: before the chest, its elbow still out to the side, then
# down at the right hip, its elbow out behind. (fist in body space, elbow's pole)
BOW_RIGHT = [None, None, ((-0.05, -0.28, 1.30), (-1.0, 0.3, 0.0)), ((-0.26, -0.10, 1.02), (-0.6, 1.0, 0.0))]


def bow(frame, view, yaw):
    global _adj
    at, up, draw, nocked = BOW_KEYS[frame]
    at, up = _plus(at, 'grip'), _plus(up, 'haft')
    full = draw is None
    if not full:
        draw = max(0.0, draw + _adj.get('draw', 0.0))   # how far the string is drawn back, the fit's to lengthen
    p = stance({
        'pelvis': (0, 0, 0), 'spine': (2, 0, 0), 'chest': (0, 0, 0),
        'neck': (4, 0, 30), 'head': (-4, 0, 30),
        'thigh_L': (-16, -12, -10), 'shin_L': (8, 0, 0), 'foot_L': (6, 0, 14),
        'thigh_R': (18, 12, 8), 'shin_R': (12, 0, 0), 'foot_R': (2, 0, -8),
        **({} if full else {'clav_R': (0, 4, 0)}),
    }, yaw + BOW_TURN)
    R = root_matrix(p)
    rot = R.to_3x3()
    at_w, up_w, _ = grip(p, 'L', at, up, (0.2, 1, -0.6), knuckles=(1, 0, 0))
    bow_m = frame_matrix(at_w, up_w, rot @ Vector((0, 1, 0)))
    string_rest = bow_m @ (sum(bow_tips(), Vector()) / 2)   # the braced string's middle
    back = (rot @ Vector((-1, 0, 0))).normalized()
    # the string arm is keyed, never fitted: a fit's swivel would turn its elbow back in across the chest
    fit, _adj = _adj, {k: v for k, v in _adj.items() if k != 'elbow_R'}
    if full:   # drawn to DRAW_FIST
        draw = max(0.0, (R @ Vector((DRAW_FIST, 0.0, 0.0)) - string_rest).dot(back) - 0.03)
    if nocked:
        held, _, _ = grip(p, 'R', R.inverted() @ (string_rest + back * (draw + 0.03)), (0, 0, 1), DRAW_POLE,
                          knuckles=(1, 0, 0))
    else:
        fist, pole = BOW_RIGHT[frame]
        grip(p, 'R', fist, (0, 0, 1), pole)
    _adj = fit
    # nocked, the string is where the fist holds it; loosed, the fist has let it go
    nock = held - back * 0.03 if nocked else string_rest + back * draw
    # the limbs bend as far as the string is drawn back from its rest
    gear = {'bow': bow_m, 'nock': nock, 'draw': max(0.0, (nock - string_rest).dot(back))}
    if nocked:   # past the bow by a hand however long the draw
        brace = (string_rest - bow_m.translation).dot(back)
        gear['arrow'] = nock - back * max(0.80, gear['draw'] + brace + 0.12)
    return p, gear


# The spell, as Daggerfall's mage casts it (records 20-24): the staff held out in the right fist, its foot planted
# wide, while the left hand winds up high and behind with the spark in it, flings it out, thrusts the burst forward and
# points. A weapon held one-handed stands upright in the right fist where the staff would. Keys: the staff (as STAFF_WALK's), the open left hand's palm (body space), and the spark: its size (0 none,
# 1 to 3) and how far it stands off the palm, up (+Z) and toward the foe (-Y)
SPELL = [(((-0.56, -0.20, 1.30), (0.25, 0.23, 0.95)), (0.20, 0.35, 1.85), 1, (0.0, 0.0, 0.11)),
         (((-0.60, -0.18, 1.40), (0.32, 0.17, 0.93)), (0.58, -0.05, 1.53), 2, (0.04, -0.06, 0.03)),
         (((-0.60, -0.16, 1.55), (0.40, 0.16, 0.90)), (0.30, -0.55, 1.32), 3, (0.0, -0.22, 0.04)),
         (((-0.60, -0.16, 1.55), (0.40, 0.16, 0.90)), (0.30, -0.62, 1.26), 0, (0.0, 0.0, 0.0))]


def spell(frame, view, yaw):
    staff_key, palm, spark, off = SPELL[frame]
    palm = _plus(palm, 'hand')
    p = stance({
        'pelvis': (0, 0, -6), 'spine': (4, 0, -4), 'chest': (2, 0, -6), 'neck': (4, 0, 4), 'head': (-6, 0, 6),
        'thigh_L': (-24, -14, -10), 'shin_L': (14, 0, 0), 'foot_L': (8, 0, 10),
        'thigh_R': (16, 16, 12), 'shin_R': (18, 0, 0), 'foot_R': (2, 0, -10),
        'clav_L': (0, -4 - 8 * (frame == 0), 0), 'clav_R': (0, 6, 0),
    }, yaw)
    # a weapon held one-handed keeps its own grip in the fist, however far the staff's fit slid the staff
    held = 0.0 if WEAPON[0] == 'staff' else -_adj.get('slide', 0.0)
    gear = {'axe': staff_at(p, staff_key, pole_r=(-1, 0.4, -0.5), slide=held)}
    R = root_matrix(p)
    rot = R.to_3x3()
    W = p.world()
    shoulder = W['uarm_L'].translation
    at = R @ Vector(palm)
    toward = (at - shoulder).normalized()   # the hand runs on out along the arm, its palm to the foe
    solve_arm(p, 'L', at - toward * 0.08, rot @ Vector((0.6, 0.8, -0.4)), hand_dir=toward,
              hand_up=(rot @ Vector((0, 1, 0))).cross(toward))
    if spark:
        gear['spark'] = (Matrix.Translation(at + rot @ Vector(off)) @ Matrix.Rotation(math.radians(yaw), 4, 'Z'), spark)
    gear['fist'] = {'L': False, 'R': True}
    return p, gear


# The bow at rest: a bow or a crossbow in the left fist, the right hand empty, in the animations a carried weapon shows
# in. Each is the animation it rests in (`AT_REST`), its arms changed, so the body draws them as animations of their own
AT_REST = {'walk_bow': 'walk', 'idle_bow': 'idle', 'hurt_bow': 'hurt', 'parry_bow': 'parry', 'warcry_bow': 'warcry',
           'breathe_bow': 'breathe'}
# the left fist in body space as it walks, the forearm forward as a staff's is, swinging with the stride; and standing
BOW_WALK = [(0.29, -0.30, 0.95), (0.29, -0.25, 0.96), (0.29, -0.19, 0.95), (0.29, -0.25, 0.96)]
BOW_IDLE = (0.30, -0.24, 0.94)
BOW_UP = (0.0, 0.17, 1.0)        # the bow's up at rest: upright, its foot a little ahead, clear of the leg
XBOW_AIM = (0.0, -0.5, -0.87)    # the crossbow at rest: pointing down and forward from the fist
XBOW_HOLD = 0.45                 # held at this share of its length back from the prod, by its stock


def bow_in_left(pose, fist=None):
    """The bow held at rest in the left fist, at `fist` (body space) or where the left hand is: upright, its string
    toward the body, the arm solved to it, the right hand open. Gives the gear: the bow's frame, and the crossbow's
    (`xbow`) held by its stock in the same fist, pointing down and forward."""
    R = root_matrix(pose)
    rot = R.to_3x3()
    W = pose.world()
    if fist is None:
        H = W['hand_L']
        fist = R.inverted() @ (H.translation + H.to_3x3() @ Vector((0, 0, -FIST)))
    fist = Vector(fist)
    # the knuckles out along the forearm's line, squared to the stave; forward where the forearm hangs along it
    fore = R.inverted().to_3x3() @ (R @ fist - W['farm_L'].translation)
    up = Vector(BOW_UP).normalized()
    k = fore - fore.project(up)
    k = k.normalized() if k.length > 0.05 * fore.length else Vector((0.0, -1.0, 0.0))
    at_w, up_w, _ = grip(pose, 'L', fist, BOW_UP, (1.0, 0.3, -0.5), knuckles=k)
    bow_m = frame_matrix(at_w, up_w, rot @ Vector((0, 1, 0)))
    aim = (rot @ Vector(XBOW_AIM)).normalized()
    lift = Vector((0.0, 0.0, 1.0))
    return {'bow': bow_m, 'xbow': (at_w, aim, (lift - lift.project(aim)).normalized(), XBOW_HOLD),
            'fist': {'L': True, 'R': False}}


def walk_bow(frame, view, yaw):
    return walk(frame, view, yaw, rest=True)


def idle_bow(frame, view, yaw):
    return idle(frame, view, yaw, rest=True)


def hurt_bow(frame, view, yaw):
    return hurt(frame, view, yaw, rest=True)


def _captured_bow(name):
    """A captured move at rest: its pose as captured, the bow in its left fist."""
    def move(frame, view, yaw):
        p = captured(name, frame, yaw)
        return p, bow_in_left(p)
    return move


# The forge's own animations, which Daggerfall has none of: each one's frame count. Each plays captured motion
# (MOVES), the same keys for either body, and every view shows it turned. 'fallen' is the death's last frame alone:
# the body as it lies once it has fallen, which a body the game lays down without its fall wears
OWN = {'death': 6, 'fallen': 1, 'parry': 3, 'warcry': 4, 'breathe': 4}


# The captured keys (mocap.py --bake, tools/sprite-forge/specs/moves.json): each frame's joint turns and the body's
# travel over the ground. Only the turns are kept, never the capture
MOVES = {}
MOVES_PATH = [os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'moves.json')]


def moves():
    if not MOVES and os.path.exists(MOVES_PATH[0]):
        MOVES.update(json.load(open(MOVES_PATH[0])))
    return MOVES


def captured(name, frame, yaw):
    """Frame `frame` of the captured animation `name`: each joint turned as captured, the body moved by its travel
    over the ground and set on its lowest point, a knee, a hip or a shoulder blade as readily as a sole."""
    from mathutils import Quaternion
    key = moves()[name]['keys'][frame]
    p = Pose(yaw=yaw + _adj.get('turn', 0.0))
    for j, q in key.items():
        if j in JOINTS:   # a key's travel, and the ways a captured weapon lay (`captured_blade`), are no joint's
            p.quat[j] = Quaternion(q)
    tx, ty = key['travel']
    p.root_loc = Matrix.Rotation(math.radians(p.yaw), 3, 'Z') @ Vector((tx, ty, 0.0))
    for s in 'LR':   # baked by turns, each arm rolled onto its elbow's hinge where it is
        rehinge(p, s)
    grounded_body(p, arms=True)
    return p


def captured_blade(name, frame, side='R'):
    """The way the captured weapon in `side`'s fist ran and its edge faced in frame `frame` of `name` (body space), or
    None where the capture had no weapon slot (mocap.py `bake`)."""
    key = moves()[name]['keys'][frame]
    if f'blade_{side}' not in key:
        return None
    return tuple(key[f'blade_{side}']), tuple(key[f'edge_{side}'])


def in_hand(pose, side='R'):
    """The weapon in `side`'s fist as the captured hand is turned, for a clip whose hand holds a sword: its grip in
    the fist, its business end out past the thumb, its blades along the knuckles."""
    H = pose.world()[f'hand_{side}']
    rot = H.to_3x3()
    knuckles = rot @ Vector((0, 0, -1))   # the hand's long axis, wrist to knuckles
    thumb = rot @ Vector((0, -1 if side == 'R' else 1, 0))   # where mocap.retarget lays the thumb
    return frame_matrix(H.translation + knuckles * FIST, thumb, knuckles)


def held(pose, haft, side='R', blades=(-0.7, 0.1, 0.7), upright=True, knuckles=None):
    """The weapon in `side`'s fist where the captured hand is, its haft along `haft` (body space): a hand captured
    empty and at rest has a turn no weapon would follow. The arm is solved again to the same fist, its elbow kept, the
    knuckles toward `knuckles` if given. A staff carried is stood head up (`upright`); one struck with goes where the
    blow takes it."""
    W = pose.world()
    R = root_matrix(pose)
    H = W[f'hand_{side}']
    fist = H.translation + H.to_3x3() @ Vector((0, 0, -FIST))
    shoulder, elbow = W[f'uarm_{side}'].translation, W[f'farm_{side}'].translation
    line = (fist - shoulder).normalized()
    pole = (elbow - shoulder) - (elbow - shoulder).project(line)
    # its far end never through the floor: a point aimed lower is raised, its heading kept, until it clears
    h = (R.to_3x3() @ Vector(haft)).normalized()
    if WEAPON[0] == 'staff' and upright:   # a staff is held head up, and stands on its foot where the fist is too low
        h = h if h.z > 0 else -h
        at_w, haft_w, _ = grip(pose, side, R.inverted() @ fist, R.inverted().to_3x3() @ h, R.inverted().to_3x3() @ pole,
                               knuckles)
        foot = at_w - haft_w * (STAFF_POLE - STAFF_TOP)
        rise = max(0.0, (0.02 - foot.z) / max(haft_w.z, 0.2))
        return frame_matrix(at_w + haft_w * rise, haft_w, R.to_3x3() @ Vector(blades))
    h = _off_floor(fist, h)
    at_w, haft_w, _ = grip(pose, side, R.inverted() @ fist, R.inverted().to_3x3() @ h, R.inverted().to_3x3() @ pole,
                           knuckles)
    return frame_matrix(at_w, haft_w, R.to_3x3() @ Vector(blades))


def _off_floor(fist, h):
    """Way `h` (world) from `fist` raised, its heading kept, until a weapon's far end along it clears the floor."""
    reach = SWORD_TIP if WEAPON[0] == 'sword' else 0.92
    if fist.z + h.z * reach < 0.03 and fist.z < reach:
        z = (0.03 - fist.z) / reach
        flat = Vector((h.x, h.y, 0.0)).normalized() * math.sqrt(max(0.0, 1 - z * z))
        h = Vector((flat.x, flat.y, z))
    return h


def in_fist(pose, haft, side='L', blades=(0.7, 0.1, 0.7)):
    """What `side`'s fist holds where the pose closes it, its line along `haft` and its flat along `blades` (body
    space), its far end off the floor: laid at the fist's middle, the arm never solved again, so every layer drawn
    with the pose sees the same hand. The frame `held` gives, for a fist that is not moved."""
    H = pose.world()[f'hand_{side}']
    R = root_matrix(pose)
    fist = H.translation + H.to_3x3() @ Vector((0, 0, -FIST))
    return frame_matrix(fist, _off_floor(fist, (R.to_3x3() @ Vector(haft)).normalized()), R.to_3x3() @ Vector(blades))


def dropped(pose, at, along, lift=0.03):
    """The weapon let go, lying flat on the ground: its grip at `at` (x, y over the ground under the body), its
    business end along `along`, its blades or flats down. `lift` is half the weapon's thickness."""
    F = floor_matrix(pose)
    z = (F.to_3x3() @ Vector((along[0], along[1], 0))).normalized()
    return frame_matrix(F @ Vector((at[0], at[1], lift)), z, Vector((0, 0, 1)).cross(z))


def dropped_by(pose, side='R'):
    """The weapon let go from `side`'s hand: flat on the ground under it, pointing on out from the arm."""
    W = pose.world()
    Fi = floor_matrix(pose).inverted()
    hand, shoulder = Fi @ W[f'hand_{side}'].translation, Fi @ W[f'uarm_{side}'].translation
    out = Vector((hand.x - shoulder.x, hand.y - shoulder.y))
    out = out.normalized() if out.length > 1e-3 else Vector((-1.0, 0.0))
    return dropped(pose, (hand.x + out.x * 0.04, hand.y + out.y * 0.04), (out.x, out.y))


# Death (Death01): struck, the knees going, down hard and over onto the back, still. The fist lets the weapon go as
# the body goes over, and it lies flat by the right hand
DEATH_DROP = 3   # the first frame the weapon lies on the ground


def death(frame, view, yaw):
    p = captured('death', frame, yaw)
    if frame < DEATH_DROP:   # still in the fist, its point sagging
        return p, {'axe': held(p, (-0.15, -0.45, -0.88)), 'fist': {'L': False, 'R': True}}
    return p, {'axe': dropped_by(p), 'fist': {'L': False, 'R': False}}


def fallen(frame, view, yaw):
    return death(OWN['death'] - 1, view, yaw)


# Parry (Sword_Block): crouched into the guard with the blade across the body, the blow taken on it, risen out of it.
# The captured fist holds a sword, so the weapon follows it
def parry(frame, view, yaw):
    p = captured('parry', frame, yaw)
    return p, {'axe': in_hand(p)}


# War cry (Yes): the weapon arm thrown up and shaken at the foe, and down again. The weapon rides up out of the fist
# along the forearm
def warcry(frame, view, yaw):
    p = captured('warcry', frame, yaw)
    W = p.world()
    fore = (W['hand_R'].translation - W['farm_R'].translation).normalized()
    haft = root_matrix(p).inverted().to_3x3() @ (fore + Vector((0.0, 0.0, 0.8)))
    return p, {'axe': held(p, tuple(haft))}


# Breathing (Idle_Loop): the weight shifting, the chest rising and falling, the weapon carried low in the right fist,
# its blades edge on to the body so no flat of them turns up into the light
def breathe(frame, view, yaw):
    p = captured('breathe', frame, yaw)
    return p, {'axe': held(p, (-0.12, -0.55, -0.82), blades=(0.0, -0.83, 0.55))}


ANIMS = {'idle': idle, 'walk': walk, 'attack': attack, 'hurt': hurt, 'bow': bow, 'spell': spell,
         'death': death, 'fallen': fallen, 'parry': parry, 'warcry': warcry, 'breathe': breathe,
         'walk_bow': walk_bow, 'idle_bow': idle_bow, 'hurt_bow': hurt_bow, 'parry_bow': _captured_bow('parry'),
         'warcry_bow': _captured_bow('warcry'), 'breathe_bow': _captured_bow('breathe')}


# which fists close round a grip: the axe's right hand (both hands in the attack), the bow's and the string's; the
# left in the flinch, which a torch is held through (torch3p.py)
FISTS = {'idle': 'R', 'walk': 'R', 'hurt': 'LR', 'attack': 'LR', 'bow': 'LR', 'spell': 'R', 'parry': 'R', 'warcry': 'R',
         'breathe': 'R', **dict.fromkeys(AT_REST, 'L')}


def pose_for(anim, frame, view, yaw, adj=None):
    """A frame's pose and gear. An animation at rest (`AT_REST`) takes the fit and the keys of the one it rests in."""
    global _adj
    base = AT_REST.get(anim, anim)
    _adj = adj if adj is not None else FIT.get(f'{base}:{view}:{frame}', {})
    if CARRY[0] and base in ('walk', 'idle') or base != anim:
        _adj = {k: v for k, v in _adj.items() if k not in WEAPON_FIT}
    if CARRY[0] and base == 'walk' and adj is None:
        # one walk turned to every view: a view's own fit would twist the body its own way frame to frame, so the
        # walk would wobble from behind and the side and change as a walker is circled
        _adj = {}
    _gap[0] = 0.0
    pose, gear = ANIMS[anim](KEYS.get((base, view), range(frame + 1))[frame], view, yaw)
    _adj = {}
    gear['gap'] = _gap[0]
    gear.setdefault('fist', {s: s in FISTS.get(anim, '') for s in 'LR'})   # an animation may open a fist itself
    return pose, gear
