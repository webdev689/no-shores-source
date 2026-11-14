"""The centaur (TEXTURE.263): a chestnut horse's body a metre and a quarter at the withers, with a man's muscled torso
rising from its chest, a long black tail of hair from its head, bracers on its forearms, and a spear over two metres
long in its right hand. It stands on the four-legged plan (quadruped.py): the plan's neck and head joints are the man's
waist and chest, and the torso is the plan's head piece, fused onto the horse's withers. The arms are skinned along
their joints; the head, the hair, the bracers and the spear are rigid.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the centaur faces -Y): a limb hanging down
swings forward on -X; the horse's trunk pitches nose-down on +X; the tail rises on +X."""
import math

import numpy as np
from mathutils import Matrix

import hides
import materials
from beastkit import Piece, Skin, chain_weights, cone, hang, rigid, tube, weights_over
from body import blob, blob_mesh, ramp
from faces import face
from quadruped import Quadruped

WAIST, CHEST_TOP = 1.28, 1.86   # the man's waist and the base of its neck


class Centaur(Quadruped):
    """The plan with a man's torso for its head piece: the torso goes with the waist below and the chest above."""

    def head_weights(self, p):
        up = ramp(p[:, 2], 1.5, 1.7)
        return weights_over(self.body_joints, ['neck', 'head'], np.stack([1 - up, up], axis=1))


PLAN = Centaur(
    spine={'pelvis': (0.55, 1.15), 'spine': (-0.1, 1.18), 'chest': (-0.55, 1.15), 'neck': (-0.62, WAIST),
           'head': (-0.64, CHEST_TOP - 0.05), 'jaw': (-0.68, CHEST_TOP + 0.1)},
    legs={'shoulder': (0.17, -0.5, 0.95), 'elbow': (0.17, -0.46, 0.62), 'wrist': (0.16, -0.5, 0.33),
          'hip': (0.18, 0.55, 0.95), 'knee': (0.18, 0.42, 0.6), 'hock': (0.17, 0.65, 0.38)},
    tail=(5, (0.86, 1.15), (0.1, 0.12), (0.09, 0.06)), tail_from=(0, 0.76, 1.12),
    paw=(0.0, -0.04, -0.31), toe=(0.0, -0.06, -0.36),
    # the horse's trunk: a rounded croup set high, a dip behind the withers, a deep girth
    trunk=([(0, 0.86, 1.08), (0, 0.55, 1.13), (0, -0.2, 1.03), (0, -0.55, 1.08), (0, -0.7, 1.05)],
           [(0.0, 0.08, 0.08, 0.08), (0.08, 0.22, 0.24, 0.25), (0.25, 0.26, 0.23, 0.3), (0.55, 0.25, 0.22, 0.38),
            (0.85, 0.24, 0.24, 0.38), (1.0, 0.17, 0.18, 0.2)]),
    # the man's torso, from the horse's chest to the neck, leaning a little back: (t, half width, back, front)
    head=([(0, -0.6, 1.12), (0, -0.62, WAIST + 0.05), (0, -0.64, 1.58), (0, -0.65, CHEST_TOP - 0.06),
           (0, -0.66, CHEST_TOP + 0.04)],
          [(0.0, 0.2, 0.15, 0.16), (0.25, 0.19, 0.11, 0.12), (0.4, 0.17, 0.11, 0.13), (0.55, 0.2, 0.12, 0.15),
           (0.82, 0.22, 0.11, 0.12), (0.93, 0.12, 0.07, 0.07), (1.0, 0.065, 0.055, 0.055)]),
    fore=[(0.0, 0.12, 0.13, 0.13), (0.2, 0.11, 0.12, 0.12), (0.45, 0.07, 0.075, 0.075), (0.85, 0.045, 0.05, 0.05),
          (0.93, 0.055, 0.055, 0.055), (1.0, 0.06, 0.05, 0.05)],
    hind=[(0.0, 0.13, 0.15, 0.15), (0.2, 0.12, 0.14, 0.14), (0.45, 0.075, 0.085, 0.085), (0.7, 0.05, 0.055, 0.055),
          (0.9, 0.05, 0.05, 0.05), (1.0, 0.06, 0.05, 0.05)],
    nape=(-0.62, -0.6))
SKELETON = PLAN.skel
# the man's arm (the left; the right mirrors it): shoulder, elbow, wrist and the hand's end
ARM = [(0.29, -0.64, 1.78), (0.36, -0.62, 1.52), (0.35, -0.7, 1.28), (0.34, -0.74, 1.2)]
for s in 'LR':
    _m = (lambda x: (lambda p: (p[0] * x, p[1], p[2])))(1.0 if s == 'L' else -1.0)
    SKELETON.joints.update({f'arm_{s}': ('head', _m(ARM[0])), f'fore_{s}': (f'arm_{s}', _m(ARM[1])),
                            f'hand_{s}': (f'fore_{s}', _m(ARM[2]))})
    SKELETON.order += [f'arm_{s}', f'fore_{s}', f'hand_{s}']
SKELETON.joints['wound'] = ('head', (0.04, -0.82, CHEST_TOP + 0.24))   # shown only as it is struck
SKELETON.order.append('wound')


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        'coat': materials.speckle('coat', (0.16, 0.072, 0.036), (0.2, 0.09, 0.045), scale=30.0, at=0.45, rough=0.7,
                                  metal=0.0),   # a chestnut barely mottled: its muscles shade it
        'skin': materials.speckle('skin', (0.38, 0.24, 0.13), (0.52, 0.34, 0.19), scale=20.0, at=0.45, rough=0.45,
                                  metal=0.0),
        'hoof': materials.plain('hoof', (0.3, 0.12, 0.14), rough=0.4, spec=0.5),
        'hair': hides.hide('hair', (0.015, 0.015, 0.017), (0.08, 0.08, 0.09), mottle=10.0, grain=60.0, grain_share=0.5,
                           relief=0.3, stretch=(1.0, 1.0, 0.15)),   # black, streaked down its fall
        'bracer': materials.plain('bracer', (0.04, 0.04, 0.04), metal=0.2, rough=0.55),
        'crown': materials.plain('crown', (0.6, 0.6, 0.65), rough=0.5, spec=0.3),
        'shaft': materials.plain('shaft', (0.12, 0.07, 0.03), rough=0.6, spec=0.3),
        'blade': materials.plain('blade', (0.04, 0.04, 0.045), metal=0.8, rough=0.3),
        'socket': materials.plain('socket', (0.04, 0.025, 0.015), rough=0.8, spec=0.1),
        'mouth': materials.plain('mouth', (0.06, 0.02, 0.012), rough=0.8, spec=0.1),
        'blood': materials.plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    return mats


# colour classes in the reference (`ref_class`): 1 shadow, 2 the man's skin, 3 the horse's chestnut, 4 the hair and
# the black of the gear
CLASS = {'skin': 2, 'coat': 3, 'hair': 4, 'bracer': 4, 'blade': 4}
GRADE_RGB = ('coat', 'skin', 'hair')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    lo, hi = np.minimum(np.minimum(r, g), b), np.maximum(np.maximum(r, g), b)
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > g + 30) & (g > b + 10) & (r > 60) & (g < 0.62 * r)] = 3
    out[(r > 120) & (g >= 0.62 * r) & (r > b + 40)] = 2
    out[(hi - lo < 16) & (hi < 90)] = 4
    return out


def _pick(c, a):
    """A face's slot: the skin on the torso, a hoof under a fetlock, the horse's coat elsewhere."""
    if a[1] > 0.5 and c[2] > 1.2:
        return 1
    return 2 if c[2] < 0.07 else 0


def build(M):
    """The centaur's meshes: (skins, rigid parts as (object, joint))."""
    body, tail = PLAN.build([M['coat'], M['skin'], M['hoof']], pick=_pick)
    tail.me.materials[0] = M['hair']
    skins, parts = [body, tail], []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    hz = CHEST_TOP + 0.16
    # a man's face (faces.py): sockets and a mouth carved under a heavy brow, a nose, cheekbones and a square jaw
    face('man_head', (0, -0.67, hz), 0.25, 'man', M, put, 'head', 'head', eye='socket')
    # the man's muscle: pectorals and deltoids on the chest, three pairs of abdominals down to the waist; the horse's
    # two broad breast muscles
    upper = [blob((0.09 * x, -0.78, 1.72), (0.1, 0.04, 0.07)) for x in (1, -1)]
    upper += [blob((0.29 * x, -0.64, 1.8), (0.07, 0.07, 0.08)) for x in (1, -1)]
    upper += [blob((0.045 * x, -0.765, 1.62), (0.035, 0.02, 0.035)) for x in (1, -1)]
    lower = [blob((0.045 * x, -0.765, z), (0.035, 0.02, 0.035)) for x in (1, -1) for z in (1.5, 1.38)]
    put(rigid('muscle', blob_mesh('muscle', upper, res=0.01), M['skin']), 'head', 'head')
    put(rigid('abs', blob_mesh('abs', lower, res=0.01), M['skin']), 'neck', 'head')
    put(rigid('breast', blob_mesh('breast', [blob((0.11 * x, -0.66, 0.9), (0.11, 0.08, 0.13)) for x in (1, -1)],
                                  res=0.014), M['coat']), 'chest', 'trunk')
    # the horse's tail full, its last third parted into strands
    root, end = np.array(rest('tail_3')[:]), np.array(rest('tail_4')[:]) + np.array((0.0, 0.1, -0.12))
    for k, a in enumerate(np.linspace(-1, 1, 7)):
        base = root + (end - root) * (0.3 + 0.1 * abs(a))
        tip = end + np.array((0.06 * a, 0.03 * abs(a), -0.12 + 0.04 * abs(a)))
        put(rigid(f'tailhair{k}', cone(f'tailhair{k}', tuple(base), tuple(tip), 0.03, 0.006), M['hair']), 'tail_4', 'tail')
    # the hair: a grey crown, and a sheet falling straight down the back, its end parted into strands
    put(rigid('crown', blob_mesh('crown', [blob((0, -0.66, hz + 0.1), (0.08, 0.1, 0.03))], res=0.008), M['crown']),
        'head', 'head')
    sheet = tube('hair', [(0, -0.64, hz + 0.1), (0, -0.56, hz + 0.03), (0, -0.52, 1.85), (0, -0.5, 1.7)],
                 [(0.0, 0.08, 0.02, 0.02), (0.2, 0.125, 0.015, 0.015), (1.0, 0.125, 0.015, 0.015)], n=16,
                 up=(0, -1, 0), step=0.012)
    put(rigid('hair', sheet, M['hair']), 'head', 'head')
    for k, x in enumerate(np.linspace(-0.1, 0.1, 7)):
        put(rigid(f'strand{k}', cone(f'strand{k}', (x, -0.5, 1.72), (x * 1.3, -0.48, 1.5), 0.016, 0.005), M['hair']),
            'head', 'head')
    for s in 'LR':
        x = 1.0 if s == 'L' else -1.0
        pts = [(p[0] * x, p[1], p[2]) for p in ARM]
        me = tube(f'arm_{s}', pts, [(0.0, 0.075, 0.075, 0.075), (0.3, 0.06, 0.06, 0.06), (0.55, 0.05, 0.05, 0.05),
                                    (0.85, 0.04, 0.04, 0.04), (1.0, 0.04, 0.04, 0.04)], n=14, up=(1, 0, 0), step=0.012)
        names = [f'arm_{s}', f'fore_{s}', f'hand_{s}']
        arm = Skin(SKELETON, f'arm_{s}', me, M['skin'], names,
                   weights_over(names, names, chain_weights(np.array([v.co[:] for v in me.vertices]), pts, 0.04)))
        arm.pieces = [Piece(f'arm_{s}', None, None, pts)]
        skins.append(arm)
        el, wr = np.array(pts[1]), np.array(pts[2])
        put(rigid(f'bracer_{s}', tube(f'bracer_{s}', [tuple(el + (wr - el) * 0.3), tuple(el + (wr - el) * 0.95)],
                                      [(0.0, 0.058, 0.058, 0.058), (1.0, 0.05, 0.05, 0.05)], n=12, up=(1, 0, 0),
                                      step=0.012), M['bracer']), f'fore_{s}')
        # a hand: a palm and four long fingers spread
        end = np.array(pts[3])
        d = (end - wr) / np.linalg.norm(end - wr)
        put(rigid(f'palm_{s}', blob_mesh(f'palm_{s}', [blob(tuple(end), (0.045, 0.02, 0.05))], res=0.006), M['skin']),
            f'hand_{s}')
        for k, a in enumerate((-20, -7, 7, 20)):
            c, sn = math.cos(math.radians(a)), math.sin(math.radians(a))
            f = np.array((d[0] * c - d[2] * sn * x, d[1], d[2] * c + d[0] * sn * x))
            put(rigid(f'finger_{s}{k}', cone(f'finger_{s}{k}', tuple(end + d * 0.03), tuple(end + d * 0.03 + f * 0.08),
                                             0.01, 0.007), M['skin']), f'hand_{s}')
    # the spear, through the right fist and level, its blade ahead
    fist = np.array(rest('hand_R')[:]) + np.array((0.0, -0.05, -0.05))
    butt, neck = fist + np.array((0, 0.75, 0)), fist + np.array((0, -1.45, 0))
    r = 0.016
    put(rigid('shaft', tube('shaft', [tuple(butt), tuple(neck)], [(0.0, r, r, r), (1.0, r, r, r)], n=8, up=(0, 0, 1),
                            step=0.02), M['shaft']), 'hand_R')
    # its head a broad black blade standing in the shaft's upright plane, two barbs swept back at its base
    tip = neck + np.array((0, -0.18, 0))
    put(rigid('blade', blob_mesh('blade', [blob(tuple(tip), (0.012, 0.18, 0.07))], res=0.008), M['blade']), 'hand_R')
    for z in (1, -1):
        put(rigid(f'barb{z}', cone(f'barb{z}', tuple(neck + np.array((0, -0.02, 0.05 * z))),
                                   tuple(neck + np.array((0, 0.04, 0.09 * z))), 0.012), M['blade']), 'hand_R')
    w = np.array(rest('wound')[:])
    drops = [blob(tuple(w + np.array((0.06 * t, -0.02, 0.05 + 0.15 * t))), (r, r, r))
             for t, r in zip(np.linspace(0, 1, 5), (0.02, 0.018, 0.016, 0.014, 0.012))]
    put(rigid('blood', blob_mesh('blood', drops, res=0.004), M['blood']), 'wound', 'head')
    return skins, parts


def _arms(rot, right=(-10, 25, 0), left=(-5, -25, 0), fore=(-15, -25)):
    rot.update({'arm_R': right, 'arm_L': left, 'fore_R': (fore[0], 0, 0), 'fore_L': (fore[1], 0, 0),
                'hand_R': (-right[0] - fore[0], 0, 0)})   # the spear kept level
    return rot


def walk(frame, n=4):
    rot = PLAN.walk_legs(frame / n, fore=(22, 45, 30), hind=(20, 25, 30, 8))
    rot.update(PLAN.tail_pose(-12, 10, 6 * math.sin(2 * math.pi * frame / n)))
    rot.update({'neck': (-4, 0, 2 * math.sin(2 * math.pi * frame / n)), 'head': (0, 0, 0)})
    return _arms(rot), None, 0.0


# the thrust over its five frames: the spear drawn up and back over the shoulder, levelled overhead, driven forward
# and down, and drawn back
# the thrust over its five frames: the spear drawn up and out to the side and levelled overhead, driven forward and
# down, and drawn back: the right arm's raise, its swing out, the elbow's bend, and the spear's pitch down
THRUST = [(-70, 50, -60, 0), (-110, 60, -20, 0), (-110, 45, -5, 15), (-60, 20, -40, 15), (-20, 10, -30, 0)]


def attack(frame, n=5):
    # braced on all four hooves, the forelegs ahead and the hind legs back
    rot = PLAN.walk_legs(0.0, 0.0)
    for s in 'LR':
        rot[f'shoulder_{s}'] = (-12, 0, 0)
        rot[f'hip_{s}'] = (10, 0, 0)
    rot.update(PLAN.tail_pose(-12, 10))
    arm, out, el, _ = THRUST[frame]
    rot.update({'neck': (-6 + 4 * (frame >= 2), 0, -10 + 6 * frame), 'head': (0, 0, 0)})
    return _arms(rot, right=(arm, out, 0), fore=(el, -25)), None, 0.0


def hurt(frame, n=1):
    # it stands, leaning back with its head thrown back, the spear held upright out to its right
    rot = PLAN.walk_legs(0.0, 0.1)
    rot.update({'neck': (-10, 0, 8), 'head': (-20, 0, 6)})
    rot.update(PLAN.tail_pose(-5, 25))
    return _arms(rot, right=(-30, 50, 0), left=(-5, -25, 0), fore=(-20, -25)), None, 0.0


def idle(frame, n=1):
    rot = PLAN.walk_legs(0.0, 0.15)
    rot.update(PLAN.tail_pose(-14, 8))
    return _arms(rot), None, 0.0


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt, 'idle': idle}


def pose_for(anim, frame, yaw, adj=None):
    rot, planted, lift = ANIMS[anim](frame)
    p = PLAN.pose(rot, planted, lift, yaw, adj)
    p.scales = {'wound': 1.0 if anim == 'hurt' else 0.0}
    # the spear held as Daggerfall's is, however the arm is turned: level and ahead as it walks and waits, upright as
    # it is struck, and through the thrust levelled or pitched down
    down = {'hurt': -90.0, 'attack': THRUST[frame][3] if anim == 'attack' else 0.0}.get(anim, 0.0)
    fore = p.world()['fore_R'].to_3x3()
    aim = Matrix.Rotation(math.radians(p.yaw), 3, 'Z') @ Matrix.Rotation(math.radians(down), 3, 'X')
    p.rot['hand_R'] = tuple(math.degrees(a) for a in (fore.inverted() @ aim).to_euler('XYZ'))
    return p


_ARM_P = [p for s in 'LR' for p in [(f'arm_{s}', 0, 10), (f'arm_{s}', 1, 8), (f'fore_{s}', 0, 10)]]
PARAMS = {a: [q for q in PLAN.params(tail_bones=(0, 2)) if q[0] != 'jaw'] + _ARM_P for a in ANIMS}
