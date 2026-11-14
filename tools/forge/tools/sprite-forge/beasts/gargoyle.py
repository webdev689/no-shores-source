"""The gargoyle (TEXTURE.277): a hunched, muscled creature of grey stone near two metres tall, with a broad flat head,
a heavy brow over glowing orange eyes, a gaping fanged muzzle, ivory horns curled in rings at the back of its skull,
long clawed hands and feet, a long narrow arch of red bat wing on its back, and a flail in its right fist: a capped
handle, a chain of heavy links and a skull. It stands on the two-legged plan (biped.py); its wings are the wing kit's
(wing.py), the flail's chain hangs from a joint of its own so it swings behind the arm.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the gargoyle faces -Y): a limb hanging down
swings forward on -X; the trunk, neck or head pitches forward on +X."""
import math

import numpy as np
from mathutils import Matrix

import hides
import materials
from beastkit import cone, hang, rigid, shaggy, tube
from biped import Biped
from body import blob, blob_mesh
from wing import Wing

PLAN = Biped(
    spine={'pelvis': (0.0, 0.95), 'spine': (-0.03, 1.18), 'chest': (-0.1, 1.42), 'neck': (-0.2, 1.6),
           'head': (-0.28, 1.7), 'jaw': (-0.36, 1.62)},
    limbs={'hip': (0.15, 0.0, 0.9), 'knee': (0.2, -0.12, 0.5), 'ankle': (0.23, 0.04, 0.1),
           'shoulder': (0.3, -0.12, 1.45), 'elbow': (0.45, -0.05, 1.15), 'wrist': (0.5, -0.2, 0.9)},
    foot=(0.0, -0.32, -0.1), hand=(0.0, -0.06, -0.13),
    trunk=([(0, 0.05, 0.8), (0, 0.0, 0.95), (0, -0.03, 1.18), (0, -0.1, 1.42), (0, -0.2, 1.62)],
           [(0.0, 0.14, 0.12, 0.12), (0.15, 0.19, 0.15, 0.16), (0.4, 0.16, 0.15, 0.14), (0.72, 0.32, 0.2, 0.18),
            (0.88, 0.34, 0.16, 0.15), (1.0, 0.15, 0.12, 0.12)]),
    head=([(0, -0.18, 1.68), (0, -0.3, 1.72), (0, -0.44, 1.68), (0, -0.55, 1.61)],
          [(0.0, 0.16, 0.1, 0.11), (0.35, 0.22, 0.09, 0.1), (0.75, 0.19, 0.06, 0.07), (1.0, 0.1, 0.04, 0.04)]),
    leg=[(0.0, 0.17, 0.17, 0.17), (0.3, 0.14, 0.14, 0.14), (0.45, 0.1, 0.1, 0.1), (0.6, 0.11, 0.11, 0.11),
         (0.8, 0.07, 0.07, 0.07), (0.9, 0.09, 0.035, 0.035), (1.0, 0.07, 0.02, 0.02)],
    arm=[(0.0, 0.12, 0.12, 0.12), (0.25, 0.1, 0.1, 0.1), (0.5, 0.08, 0.08, 0.08), (0.72, 0.075, 0.075, 0.075),
         (0.85, 0.06, 0.06, 0.06), (1.0, 0.035, 0.025, 0.025)],
    nape=(0.05, 0.3), decimate=0.08)
SKELETON = PLAN.skel
# the wing at rest as it is carried: a long narrow arch, the wrist peaking at the head's top close by it, four fingers
# falling out and down from it, the trailing edge running from their tips back up to the shoulder blade. Its faces
# face back, so a material can tell the side seen from behind
WING = Wing(shoulder=(0.12, 0.12, 1.5), elbow=(0.26, 0.22, 1.72), wrist=(0.38, 0.3, 1.86),
            tips=[(0.75, 0.42, 1.55), (1.0, 0.48, 1.25), (1.15, 0.5, 0.95), (1.05, 0.45, 0.8)],
            hip=(0.1, 0.22, 1.42), foot=(0.3, 0.35, 1.38), body='chest', leg='blade', camber=0.05, scallop=0.22,
            bone_r=(0.03, 0.024, 0.02, 0.02, 0.005), step=0.012, prefix='wing_', faces=(0.0, 1.0, 0.0))
FINGERS = 4
FLAIL = (-0.5, -0.95, 1.1)   # the handle's end, forward of the right fist and rising, where the chain hangs
CHAIN = (0.0, -0.03, -0.33)   # the chain's end from the handle's, as it hangs
for s in 'LR':
    _m = (lambda x: (lambda p: (p[0] * x, p[1], p[2])))(1.0 if s == 'L' else -1.0)
    SKELETON.joints.update(WING.joints(s, 'chest'))
    SKELETON.joints[f'blade_{s}'] = ('chest', _m(WING.foot))
    SKELETON.order += list(WING.joints(s, 'chest')) + [f'blade_{s}']
SKELETON.joints['chain'] = ('wrist_R', FLAIL)
SKELETON.joints['wound'] = ('head', (0.0, -0.42, 1.78))
SKELETON.order += ['chain', 'wound']


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        # grey stone, pitted and weathered: dark in its cracks
        'stone': hides.hide('stone', (0.06, 0.06, 0.065), (0.17, 0.17, 0.18), mottle=8.0, grain=40.0, grain_share=0.4,
                            soft=0.18, relief=0.7, relief_scale=35.0, rough=0.9, spec=0.1),
        # the membrane deep red seen from before, orange lit through from behind, veined
        'wing': hides.two_sided('wing', ((0.65, 0.24, 0.05), (0.75, 0.28, 0.06)), ((0.26, 0.025, 0.007),
                                                                                (0.3, 0.03, 0.008)),
                                mottle=4.0, grain=70.0, grain_share=0.15, soft=0.3, rough=0.85, spec=0.2, veins=0.4,
                                vein_scale=7.0),
        'claw': materials.plain('claw', (0.03, 0.03, 0.03), rough=0.4, spec=0.5),
        'horn': materials.plain('horn', (0.6, 0.55, 0.4), rough=0.4, spec=0.5),
        'tooth': materials.plain('tooth', (0.65, 0.62, 0.55), rough=0.3, spec=0.6),
        'mouth': materials.plain('mouth', (0.3, 0.02, 0.01), rough=0.5, spec=0.3),
        'eye': materials.plain('eye', (0.9, 0.3, 0.02), rough=0.3, spec=0.4),
        'wood': materials.plain('wood', (0.1, 0.06, 0.04), rough=0.6, spec=0.3),
        'iron': materials.plain('iron', (0.05, 0.05, 0.05), metal=0.8, rough=0.4),
        'blood': materials.plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    b = mats['eye'].node_tree.nodes['Principled BSDF']
    b.inputs['Emission Color'].default_value = (1.0, 0.35, 0.02, 1)
    b.inputs['Emission Strength'].default_value = 2.0
    return mats


# colour classes in the reference (`ref_class`): 1 shadow, 2 the stone's grey, 3 the wings' red, 4 the ivory
CLASS = {'stone': 2, 'wing': 3, 'horn': 4, 'tooth': 4}
GRADE_RGB = ('stone', 'wing')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    lo, hi = np.minimum(np.minimum(r, g), b), np.maximum(np.maximum(r, g), b)
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(hi - lo < 14) & (hi > 45)] = 2
    out[(r > g + 60) & (r > 90)] = 3
    out[(lo > 120) & (r >= b)] = 4
    return out


def _horn(x):
    """A horn curled in a flat ring on the side of the skull's back, seen edge on from before."""
    c = np.array((0.29 * x, -0.18, 1.72))
    turns = np.linspace(math.pi * 0.9, -math.pi * 0.7, 13)
    pts = [tuple(c + np.array((0.0, 0.09 * math.sin(a), 0.09 * math.cos(a)))) for a in turns]
    return tube(f'horn_{x}', pts, [(0.0, 0.032, 0.032, 0.032), (1.0, 0.018, 0.018, 0.018)], n=10, up=(1, 0, 0),
                step=0.01)


def build(M):
    """The gargoyle's meshes: (skins, rigid parts as (object, joint))."""
    skins, parts = [shaggy(PLAN.build([M['stone']]), 0.012, 16.0)], []   # weathered, craggy stone

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    put(rigid('jaw', tube('jaw', [(0, -0.22, 1.6), (0, -0.4, 1.58), (0, -0.52, 1.56)],
                          [(0.0, 0.11, 0.04, 0.04), (0.6, 0.11, 0.035, 0.035), (1.0, 0.07, 0.03, 0.03)], n=16,
                          step=0.01), M['stone']), 'jaw', 'head')
    put(rigid('mouth', blob_mesh('mouth', [blob((0, -0.42, 1.62), (0.14, 0.12, 0.05))], res=0.01), M['mouth']),
        'head', 'head')
    put(rigid('brow', blob_mesh('brow', [blob((0, -0.42, 1.76), (0.2, 0.05, 0.035))], res=0.01), M['stone']),
        'head', 'head')
    for x in (1, -1):
        put(rigid(f'horn_{x}', _horn(x), M['horn']), 'head', 'head')
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.12 * x, -0.47, 1.735), (0.025, 0.025, 0.025))], res=0.004),
                  M['eye']), 'head', 'head')
        for k in range(3):   # fangs down from the upper jaw, the front ones long, and up from the lower
            fx, fy = (0.04 + 0.03 * k) * x, -0.52 + 0.06 * k
            put(rigid(f'fang_up{x}{k}', tube(f'fang_up{x}{k}', [(fx, fy, 1.64), (fx, fy - 0.01, 1.64 - (0.1 if k == 0
                                                                                                    else 0.07))],
                                             [(0.0, 0.012, 0.012, 0.012), (1.0, 0.002, 0.002, 0.002)], n=6,
                                             up=(0, -1, 0), step=0.01), M['tooth']), 'head', 'head')
            put(rigid(f'fang_lo{x}{k}', tube(f'fang_lo{x}{k}', [(fx, fy + 0.02, 1.57), (fx, fy + 0.01, 1.63)],
                                             [(0.0, 0.011, 0.011, 0.011), (1.0, 0.002, 0.002, 0.002)], n=6,
                                             up=(0, -1, 0), step=0.01), M['tooth']), 'jaw', 'head')
    # the stone's muscle: a broad chest, a band of abdominals, deltoids
    chest = [blob((0, -0.25, 1.38), (0.26, 0.045, 0.08))]
    chest += [blob((0.33 * x, -0.12, 1.45), (0.1, 0.1, 0.1)) for x in (1, -1)]
    put(rigid('muscle', blob_mesh('muscle', chest, res=0.012), M['stone']), 'chest', 'trunk')
    put(rigid('abs', blob_mesh('abs', [blob((0, -0.2, 1.12), (0.12, 0.04, 0.12))], res=0.012), M['stone']), 'spine',
        'trunk')
    for s in 'LR':
        x = 1.0 if s == 'L' else -1.0
        WING.bones(s, put, M['horn'])
        skins.append(WING.membrane(SKELETON, s, M['wing']))
        wr = np.array(rest(f'wing_wrist_{s}')[:])   # a claw at the wing's wrist, pointing up
        put(rigid(f'wclaw_{s}', cone(f'wclaw_{s}', tuple(wr), tuple(wr + np.array((0.01 * x, -0.02, 0.07))), 0.012),
                  M['horn']), f'wing_wrist_{s}')
        ank = np.array(rest(f'ankle_{s}')[:])   # three long toe claws at each foot's end, four at each hand
        toe = ank + np.array((0.0, PLAN.foot[1], PLAN.foot[2] + 0.02))
        for k, d in enumerate((-0.05, 0.0, 0.05)):
            put(rigid(f'toe_{s}{k}', cone(f'toe_{s}{k}', tuple(toe + (d, 0.02, 0)),
                                          tuple(toe + (d * 1.3, -0.08, -0.03)), 0.014), M['claw']), f'ankle_{s}')
        hand = np.array(rest(f'wrist_{s}')[:]) + np.array((PLAN.hand[0] * x, PLAN.hand[1], PLAN.hand[2]))
        for k, d in enumerate((-0.04, -0.013, 0.013, 0.04)):
            put(rigid(f'claw_{s}{k}', cone(f'claw_{s}{k}', tuple(hand + (d, 0.0, 0.02)),
                                           tuple(hand + (d * 1.4, -0.04, -0.06)), 0.012), M['claw']), f'wrist_{s}')
    # the flail: a capped handle forward and up from the right fist, a chain of heavy links and a skull at its end
    fist = np.array(rest('wrist_R')[:]) + np.array(PLAN.hand) * np.array((-1, 1, 1)) * 0.6
    put(rigid('handle', tube('handle', [tuple(fist + (0, 0.06, -0.02)), FLAIL],
                             [(0.0, 0.026, 0.026, 0.026), (1.0, 0.026, 0.026, 0.026)], n=8, up=(1, 0, 0), step=0.015),
              M['wood']), 'wrist_R')
    put(rigid('cap', blob_mesh('cap', [blob(FLAIL, (0.035, 0.035, 0.035))], res=0.006), M['iron']), 'wrist_R')
    end = np.array(FLAIL) + np.array(CHAIN)
    links = [blob(tuple(np.array(FLAIL) + (end - np.array(FLAIL)) * (k + 0.5) / 6), (0.016, 0.022, 0.03) if k % 2
                  else (0.022, 0.016, 0.03)) for k in range(6)]
    put(rigid('links', blob_mesh('links', links, res=0.005), M['iron']), 'chain')
    c = end + np.array((0, 0, -0.07))
    skull = [blob(tuple(c), (0.095, 0.085, 0.075)), blob(tuple(c + (0, -0.05, -0.06)), (0.06, 0.05, 0.035))]
    put(rigid('skull', blob_mesh('skull', skull, res=0.008), M['tooth']), 'chain')
    put(rigid('sockets', blob_mesh('sockets', [blob(tuple(c + (0.035 * x, -0.08, 0.01)), (0.022, 0.022, 0.022))
                                               for x in (1, -1)], res=0.004), M['mouth']), 'chain')
    # the wound: a column of droplets flung up and back from the head
    drops = []
    for k, t in enumerate(np.linspace(0, 1, 16)):
        a = t * math.pi * 0.5
        drops.append(blob((0.02 * math.sin(7 * k), -0.4 + 0.2 * (1 - math.cos(a)), 1.85 + 0.35 * math.sin(a)),
                          (0.02 - 0.008 * t,) * 3))
    put(rigid('blood', blob_mesh('blood', drops, res=0.005), M['blood']), 'wound', 'head')
    return skins, parts


def _wings(rot, beat=0, fold=0, spread=0, curl=0, sweep=0):
    """The wings half spread behind the shoulders: their sweep is taken from the world, so a hunched back does not
    tip their trailing edges up."""
    pitch = sum(rot.get(j, (0, 0, 0))[0] for j in ('pelvis', 'spine', 'chest'))
    for s in 'LR':
        rot.update(Wing.flap(s, beat, fold, spread, curl, sweep - pitch, fingers=FINGERS, prefix='wing_'))
    return rot


def walk(frame, n=4):
    rot = PLAN.walk(frame / n, hip=22, knee=38)
    rot.update({'pelvis': (9, 0, 0), 'spine': (5, 0, 0), 'chest': (10, 0, 0), 'neck': (-25, 0, 0),
                'head': (-12, 0, 0), 'jaw': (30, 0, 0), 'chain': (-20 * math.cos(2 * math.pi * frame / n), 0, 0)})
    for s in 'LR':
        k = rot[f'knee_{s}'][0]
        rot[f'knee_{s}'] = (k + 17, 0, 0)   # its knees never straighten: it walks crouched
        rot[f'hip_{s}'] = (rot[f'hip_{s}'][0] - 29, 0, 0)
        rot[f'ankle_{s}'] = (rot[f'ankle_{s}'][0] - 8, 0, 0)
    return _wings(rot), None, 0.0, {'wound': 0.0}


# the flail's roundhouse over its six frames: the arm held out straight and the flail taut in line with it, swung out
# to its right, round ahead with the body turning into it, up and over to its left and level out there, and back.
# Each frame's raise of the right arm, its swing across and the chain's lag behind the handle
SWING = [(-80, -70, 0), (-90, -35, 0), (-95, 5, 0), (-115, 40, 0), (-125, 70, 0), (-70, 25, 10)]


def attack(frame, n=6):
    rot, _, _, _ = walk(0, 4)
    rot.update(PLAN.walk(0.0, 0.3))
    raise_, across, lag = SWING[frame]
    rot.update({'shoulder_R': (raise_, 0, across), 'elbow_R': (-5, 0, 0), 'chain': (lag, 0, 0),
                'chest': (6 - raise_ * 0.05, 0, across * -0.3), 'jaw': (40, 0, 0)})
    return _wings(rot, beat=20, fold=-10), None, 0.0, {'wound': 0.0}


def hurt(frame, n=1):
    # it rears its flail high overhead, the skull swinging out at the top, and kicks its left knee up
    rot, _, _, _ = walk(0, 4)
    rot.update({'pelvis': (4, 0, 0), 'chest': (-12, 0, 8), 'neck': (-20, 0, 10), 'head': (-12, 0, 0),
                'jaw': (30, 0, 0), 'shoulder_R': (-160, 0, -25), 'elbow_R': (-70, 0, 0), 'chain': (60, 0, 0),
                'hip_L': (-55, 0, 0), 'knee_L': (75, 0, 0)})
    return _wings(rot, beat=-10, fold=10), ['ankle_R'], 0.0, {'wound': 1.0}


def idle(frame, n=1):
    rot, _, _, _ = walk(0, 4)
    rot.update(PLAN.walk(0.0, 0.1))
    return _wings(rot, beat=10, spread=4), None, 0.0, {'wound': 0.0}


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt, 'idle': idle}


def _local(p, parent, world):
    e = (p.world()[parent].to_3x3().inverted() @ world).to_euler('XYZ')
    return tuple(math.degrees(a) for a in e)


def _carried(p, swing, turn=0.0, fitted=(0.0, 0.0, 0.0)):
    """The flail as it is carried: the handle held ahead (turned `turn` degrees to its right) and the chain hung down
    from its end, set in the world however the hunched arm is turned, its chain swung `swing` degrees and then by its
    `fitted` adjustment."""
    ahead = Matrix.Rotation(math.radians(p.yaw + turn), 3, 'Z')
    p.rot['wrist_R'] = _local(p, 'elbow_R', ahead)
    hang_ = ahead @ Matrix.Rotation(math.radians(swing), 3, 'X')
    p.rot['chain'] = tuple(a + b for a, b in zip(_local(p, 'wrist_R', hang_), fitted))
    return p


def _taut(p, lag, up=False):
    """The flail swung: the handle held out in line with the arm (or straight up), the chain in line with the handle
    but for `lag` degrees, so the skull flies out."""
    from mathutils import Vector
    W = p.world()
    handle = Vector(FLAIL) - (Vector(rest('wrist_R')[:]) + Vector(PLAN.hand) * Vector((-0.6, 0.6, 0.6)))
    want = Vector((0, 0, 1)) if up else (W['wrist_R'].translation - W['shoulder_R'].translation)
    turn = handle.normalized().rotation_difference(W['elbow_R'].to_3x3().inverted() @ want.normalized())
    p.rot['wrist_R'] = tuple(math.degrees(a) for a in turn.to_euler('XYZ'))
    line = Vector(CHAIN).normalized().rotation_difference(handle.normalized()).to_matrix()
    p.rot['chain'] = tuple(math.degrees(a) for a in (line @ Matrix.Rotation(math.radians(lag), 3, 'X')).to_euler('XYZ'))
    return p


def pose_for(anim, frame, yaw, adj=None):
    rot, planted, lift, scales = ANIMS[anim](frame)
    fitted = tuple((adj or {}).get('rot', {}).get('chain', (0.0, 0.0, 0.0)))
    p = PLAN.pose(rot, planted, lift, yaw, adj, scales)
    if anim in ('walk', 'idle'):   # in the idle the handle is held out to its right
        _carried(p, -15 * math.cos(2 * math.pi * frame / 4), -45.0 if anim == 'idle' else 0.0, fitted)
    elif anim == 'attack':
        _taut(p, SWING[frame][2] + fitted[0])
    else:
        _taut(p, 60.0 + fitted[0], up=True)
    return p


# the wings are fitted as a mirrored pair, and only in the strike and the hurt: Daggerfall's keep one shape through the
# walk and the idle
_WING_P = [('wing_shoulder_L|wing_shoulder_R', 0, 8), ('wing_shoulder_L|wing_shoulder_R', 1, 10),
           ('wing_elbow_L|wing_elbow_R', 2, 10)]
PARAMS = {a: PLAN.params() + [('chain', 0, 12), ('chain', 2, 10)] + (_WING_P if a in ('attack', 'hurt') else [])
          for a in ANIMS}
