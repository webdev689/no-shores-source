"""The sabretooth tiger (TEXTURE.260): a lean striped cat three metres from nose to rump and a metre and a half at the
shoulder, with two long ivory sabers. One fused skin covers trunk, head and legs; the tail is skinned along its own
bones; the jaw, the sabers, the ears and the eyes are rigid. Its coat is orange banded across with black.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the tiger faces -Y): a limb hanging down
swings forward on -X; a trunk, neck or head pitches nose-down on +X; the tail rises on +X."""
import math

import numpy as np

import hides
import materials
from beastkit import Piece, hang, rigid, shaggy, tube
from body import blob, blob_mesh, seg
from quadruped import Quadruped
from shapes import loft

PLAN = Quadruped(
    spine={'pelvis': (1.05, 1.15), 'spine': (0.3, 1.18), 'chest': (-0.55, 1.12), 'neck': (-0.95, 1.1),
           'head': (-1.25, 1.095), 'jaw': (-1.29, 0.97)},
    legs={'shoulder': (0.2, -0.62, 1.02), 'elbow': (0.22, -0.5, 0.62), 'wrist': (0.2, -0.62, 0.12),
          'hip': (0.22, 1.0, 1.02), 'knee': (0.25, 0.68, 0.62), 'hock': (0.22, 1.02, 0.3)},
    tail=(6, (1.38, 1.18), (0.17, 0.1), (0.055, 0.03)), tail_from=(0, 1.3, 1.16),
    paw=(0.0, -0.14, -0.1), toe=(0.0, -0.2, -0.28),
    trunk=([(0, 1.34, 1.12), (0, 1.0, 1.17), (0, 0.3, 1.1), (0, -0.55, 1.06), (0, -0.86, 1.16)],
           [(0.0, 0.064, 0.064, 0.064), (0.06, 0.26, 0.22, 0.28), (0.16, 0.35, 0.27, 0.38), (0.45, 0.31, 0.23, 0.36),
            (0.72, 0.38, 0.28, 0.51), (0.9, 0.29, 0.26, 0.36), (1.0, 0.24, 0.23, 0.26)]),
    # the head hangs low and forward of the shoulders on a long neck, its back rising to the shoulder blades
    head=([(0, -0.84, 1.2), (0, -1.02, 1.16), (0, -1.21, 1.12), (0, -1.41, 1.09), (0, -1.59, 1.04)],
          [(0.0, 0.2, 0.17, 0.18), (0.22, 0.21, 0.17, 0.18), (0.5, 0.28, 0.19, 0.19), (0.78, 0.19, 0.14, 0.15),
           (0.94, 0.13, 0.1, 0.1), (1.0, 0.07, 0.06, 0.06)]),
    fore=[(0.0, 0.15, 0.16, 0.16), (0.3, 0.12, 0.13, 0.13), (0.5, 0.1, 0.1, 0.1), (0.82, 0.085, 0.085, 0.085),
          (0.9, 0.08, 0.06, 0.06), (1.0, 0.06, 0.035, 0.035)],
    hind=[(0.0, 0.18, 0.21, 0.21), (0.25, 0.16, 0.17, 0.17), (0.4, 0.1, 0.1, 0.1), (0.65, 0.067, 0.067, 0.067),
          (0.72, 0.073, 0.055, 0.055), (0.92, 0.073, 0.042, 0.042), (1.0, 0.048, 0.024, 0.024)],
    nape=(-1.17, -1.05), decimate=0.12)
SKELETON = PLAN.skel
SKELETON.joints['wound'] = ('head', (0.05, -1.29, 1.25))   # shown only as it is struck
SKELETON.order.append('wound')


def rest(j):
    return SKELETON.rest(j)


def stripes(name, coat, stripe, bands=8.0, along='Y', width=(0.2, 0.3), broken=0.0):
    """A cat's coat: black bands across the body (square to the rest place's `along`), wavering and broken by noise,
    each band as wide as `width` (the wave's shares from black to coat). With `broken`, a share of each band is cut
    away by a broader noise, so the stripes fork and stop as a tiger's do."""
    m, b = materials._principled(name, coat, rough=0.7, spec=0.3)
    nt, L = m.node_tree, m.node_tree.links
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type, at.attribute_name = 'GEOMETRY', 'rest'
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type, wave.bands_direction, wave.wave_profile = 'BANDS', along, 'SIN'
    wave.inputs['Scale'].default_value = bands / 6.0
    wave.inputs['Distortion'].default_value = 9.0
    wave.inputs['Detail'].default_value = 3.0
    L.new(at.outputs['Vector'], wave.inputs['Vector'])
    ramp_ = nt.nodes.new('ShaderNodeValToRGB')
    ramp_.color_ramp.elements[0].position, ramp_.color_ramp.elements[0].color = width[0], (*stripe, 1)
    ramp_.color_ramp.elements[1].position, ramp_.color_ramp.elements[1].color = width[1], (*coat, 1)
    fac = wave.outputs['Fac']
    if broken > 0:
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 6.0
        nz.inputs['Detail'].default_value = 2.0
        L.new(at.outputs['Vector'], nz.inputs['Vector'])
        cut = nt.nodes.new('ShaderNodeMath')
        cut.operation = 'GREATER_THAN'
        cut.inputs[1].default_value = 1.0 - broken
        L.new(nz.outputs['Fac'], cut.inputs[0])
        keep = nt.nodes.new('ShaderNodeMath')
        keep.operation = 'MAXIMUM'
        L.new(fac, keep.inputs[0])
        L.new(cut.outputs[0], keep.inputs[1])
        fac = keep.outputs[0]
    L.new(fac, ramp_.inputs['Fac'])
    L.new(ramp_.outputs['Color'], b.inputs['Base Color'])
    return m


def palette():
    plain = materials.plain
    mats = {
        'coat': stripes('coat', (0.42, 0.14, 0.02), (0.03, 0.015, 0.008), bands=10.0, width=(0.22, 0.3),
                        broken=0.2),
        # the face's stripes run up its brow and down its cheeks: bands along the body would ring it seen head on
        'face': stripes('face', (0.42, 0.14, 0.02), (0.03, 0.015, 0.008), bands=12.0, along='X', width=(0.1, 0.18),
                        broken=0.25),
        # the white of the muzzle, chin, the ruffs' fringe, the chest and the belly
        'belly': hides.hide('belly', (0.45, 0.43, 0.4), (0.58, 0.56, 0.53), mottle=6.0, relief=0.2, rough=0.8),
        'saber': plain('saber', (0.62, 0.58, 0.48), rough=0.3, spec=0.6),
        'eye': plain('eye', (0.45, 0.42, 0.05), rough=0.2, spec=0.7),
        'pupil': plain('pupil', (0.01, 0.01, 0.01), rough=0.2, spec=0.7),
        'nose': plain('nose', (0.45, 0.18, 0.18), rough=0.4, spec=0.5),
        'mouth': plain('mouth', (0.2, 0.04, 0.04), rough=0.6, spec=0.3),
        'blood': plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    return mats


# colour classes in the reference (`ref_class`): 1 the stripes and shadow, 2 the coat's orange, 3 the sabers' ivory and
# the white fur, 4 the eyes' yellow-green
CLASS = {'coat': 2, 'face': 2, 'nose': 2, 'saber': 3, 'belly': 3, 'eye': 4}
GRADE_RGB = ('coat', 'face')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > g + 25) & (g > b + 10) & (r > 90)] = 2
    out[(np.minimum(np.minimum(r, g), b) > 150) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 50)] = 3
    out[(g > 110) & (r > 90) & (g >= r - 10) & (b < 70)] = 4
    return out


def _pick(c, a):
    """A face's slot: the face's coat on the head; white on the muzzle, the chin, the cheeks' ruffs, the chest and
    the belly; the striped coat elsewhere, down to the paws. `a` holds the face's shares of the trunk, the head, the
    four legs and the cheeks."""
    head = a[1] + a[6] > 0.5
    if head:   # the whisker pads and chin, and the fringe of the cheeks' ruffs
        return 2 if (c[1] < -1.5 and c[2] < 1.05) or (abs(c[0]) > 0.17 and c[1] < -1.15 and c[2] < 0.97) else 1
    legs = a[2:6].sum() > 0.5
    if not legs and c[2] < 0.72 + 0.06 * (c[1] < -0.3):
        return 2
    return 0


def build(M):
    """The tiger's meshes: (skins, rigid parts as (object, joint))."""
    # a cat's face: the ruffs of its cheeks, a brow over each eye, the bridge of its nose, its chin and the two white
    # pads of its muzzle
    face = [blob((0, -1.34, 1.2), (0.13, 0.06, 0.045)), blob((0, -1.57, 0.957), (0.09, 0.07, 0.06)),
            seg((0, -1.4, 1.2), (0, -1.6, 1.1), 0.05)]
    for x in (1, -1):
        face += [blob((0.21 * x, -1.3, 0.98), (0.12, 0.11, 0.12)), blob((0.12 * x, -1.42, 1.24), (0.065, 0.045, 0.03)),
                 blob((0.06 * x, -1.58, 1.02), (0.065, 0.05, 0.05))]
    cheeks = Piece('cheeks', blob_mesh('cheeks', face, res=0.008), PLAN.head_weights, [rest('head')[:]],
                   size=('head_s', rest('head')[:]))
    body, tail = PLAN.build([M['coat'], M['face'], M['belly']], extra=[cheeks], pick=_pick)
    shaggy(body, 0.006, 35.0, (1.0, 0.6, 1.0))   # short fur's broken outline
    parts = []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    put(rigid('jaw', loft('jaw', (0, -1.17, 0.954), (0, -1.53, 0.95),
                          [(0, 0.1, 0.05), (0.6, 0.08, 0.04), (1, 0.04, 0.02)], M['belly'], n=12)), 'jaw', 'head')
    put(rigid('mouth', blob_mesh('mouth', [blob((0, -1.47, 0.97), (0.07, 0.09, 0.02))], res=0.006), M['mouth']),
        'head', 'head')
    for x in (1, -1):
        # the sabers: long, curved a little back, from the upper jaw to well below the chin
        put(rigid(f'saber_{x}', tube(f'saber_{x}', [(0.07 * x, -1.5, 1.0), (0.078 * x, -1.535, 0.84),
                                                     (0.072 * x, -1.51, 0.66)],
                                     [(0.0, 0.04, 0.03, 0.03), (0.6, 0.029, 0.022, 0.022), (1.0, 0.005, 0.005, 0.005)],
                                     n=10, up=(0, -1, 0)), M['saber']), 'head', 'head')
        # rounded ears at the crown's corners, tilted out
        ear = [(0.17 * x, -1.12, 1.24), (0.21 * x, -1.115, 1.35), (0.24 * x, -1.11, 1.44)]
        put(rigid(f'ear_{x}', tube(f'ear_{x}', ear, [(0.0, 0.085, 0.03, 0.03), (0.6, 0.065, 0.024, 0.024),
                                                     (1.0, 0.012, 0.01, 0.01)], n=8,
                                   up=(0, -1, 0)), M['face']), 'head', 'head')
        # the eyes set in the brow's front, under it, with a dark pupil each
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.12 * x, -1.445, 1.186), (0.055, 0.032, 0.04))],
                                         res=0.004), M['eye']), 'head', 'head')
        put(rigid(f'rim_{x}', blob_mesh(f'rim_{x}', [blob((0.12 * x, -1.432, 1.184), (0.07, 0.032, 0.052))],
                                         res=0.004), M['pupil']), 'head', 'head')   # a black rim round it
        put(rigid(f'pupil_{x}', blob_mesh(f'pupil_{x}', [blob((0.12 * x, -1.47, 1.19), (0.012, 0.008, 0.016))],
                                           res=0.003), M['pupil']), 'head', 'head')
    put(rigid('nose', blob_mesh('nose', [blob((0, -1.635, 1.09), (0.05, 0.03, 0.035))], res=0.005), M['nose']),
        'head', 'head')
    put(rigid('blood', blob_mesh('blood', [blob(rest('wound')[:], (0.05, 0.035, 0.035))], res=0.008), M['blood']),
        'wound', 'head')
    return [body, tail], parts


def walk(frame, n=4):
    rot = PLAN.walk_legs(frame / n, fore=(32, 30, 25))
    rot.update({'neck': (2, 0, 0), 'head': (-8, 0, 0), 'jaw': (10, 0, 0)})
    # the tail runs out low behind and hooks up at its tip
    rot.update(PLAN.tail_pose(-4, lift=-25, sway=6 * math.sin(2 * math.pi * frame / n)))
    return rot, None, 0.0


# the strike: crouched low, rearing up off planted hind feet, lunging up and forward with the forepaws flung out and
# wide, the claws spread, and down again. It never leaves the ground, as Daggerfall's does not
ATTACK = [  # (pelvis pitch, fore swing, its spread out, crouch, jaw)
    (6, 10, 0, 0.25, 20), (-12, -40, -10, 0.15, 30), (-30, -100, -25, 0.0, 45), (-40, -100, -25, 0.0, 45),
    (-20, -60, -15, 0.05, 35), (2, -5, 0, 0.05, 15)]


def attack(frame, n=6):
    pitch, fore, spread, crouch, jaw = ATTACK[frame]
    rot = {'pelvis': (pitch, 0, 0), 'neck': (-pitch * 0.5 + 20 * (pitch < 0), 0, 0),
           'head': (10 * (pitch < 0), 0, 0), 'jaw': (jaw, 0, 0)}
    for s, x in (('L', 1), ('R', -1)):
        rot[f'shoulder_{s}'] = (fore, spread * x, 0)
        rot[f'elbow_{s}'] = (60 * crouch, 0, 0)
        rot[f'wrist_{s}'] = (-15 * (fore < -60), 0, 0)
        # the hind legs turned back under the reared body, the feet planted
        rot[f'hip_{s}'] = (-pitch * 0.85 - 15 * (pitch < -10) - 60 * crouch, 0, 0)
        rot[f'knee_{s}'] = (-90 * crouch, 0, 0)
        rot[f'hock_{s}'] = (90 * crouch + 20 * (pitch < -10) - pitch * 0.15, 0, 0)
    rot.update(PLAN.tail_pose(4, lift=-5 - pitch * 0.8))
    return rot, [f'hock_{s}' for s in 'LR'], 0.0


def hurt(frame, n=1):
    # it crouches, its head flung round to the viewer's left
    rot = {'pelvis': (6, 0, 0), 'neck': (-10, 0, 35), 'head': (-6, 0, 30), 'jaw': (35, 0, 0)}
    rot.update(PLAN.walk_legs(0.15, 0.4))
    for s in 'LR':
        rot.update({f'elbow_{s}': (45, 0, 0), f'knee_{s}': (-45, 0, 0), f'hock_{s}': (45, 0, 0)})
    rot.update(PLAN.tail_pose(4, lift=8, sway=12))
    return rot, None, 0.0


def idle(frame, n=1):
    rot = {'neck': (2, 0, 0), 'head': (-8, 0, 0), 'jaw': (12, 0, 0)}
    rot.update(PLAN.walk_legs(0.0, 0.2))
    rot.update(PLAN.tail_pose(-4, lift=-25, sway=10))
    return rot, None, 0.0


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt, 'idle': idle}


def pose_for(anim, frame, yaw, adj=None):
    rot, planted, lift = ANIMS[anim](frame)
    p = PLAN.pose(rot, planted, lift, yaw, adj)
    p.scales = {'wound': 1.0 if anim == 'hurt' else 0.0}
    return p


PARAMS = {a: PLAN.params() for a in ANIMS}
