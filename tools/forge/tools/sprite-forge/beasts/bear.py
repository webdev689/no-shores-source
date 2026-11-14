"""The grizzly bear (TEXTURE.259): a heavy brown bear two and a half metres from nose to rump, its shoulders humped a
metre and a third high and its head carried low. It walks on all fours and rears onto its hind legs to strike, two
and a half metres tall, its long pale claws spread. One fused skin covers trunk, head and legs on the four-legged plan
(quadruped.py); the jaw, the ears, the eyes, the nose and the claws are rigid.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the bear faces -Y): a limb hanging down
swings forward on -X; a trunk, neck or head pitches nose-down on +X."""
import math

import numpy as np
from mathutils import Vector

import hides
import materials
from beastkit import Piece, chain_weights, cone, hang, rigid, shaggy, tube, weights_over
from body import blob, blob_mesh
from quadruped import SPINE, Quadruped
from shapes import loft

PLAN = Quadruped(
    spine={'pelvis': (0.85, 0.95), 'spine': (0.2, 1.05), 'chest': (-0.45, 1.0), 'neck': (-0.8, 0.95),
           'head': (-1.0, 0.92), 'jaw': (-1.06, 0.83)},
    legs={'shoulder': (0.25, -0.5, 0.85), 'elbow': (0.27, -0.42, 0.48), 'wrist': (0.25, -0.55, 0.1),
          'hip': (0.27, 0.8, 0.85), 'knee': (0.28, 0.55, 0.48), 'hock': (0.25, 0.8, 0.18)},
    tail=(2, (1.15, 0.9), (0.08, 0.03), (0.06, 0.03)), tail_from=(0, 1.08, 0.9),
    paw=(0.0, -0.18, -0.08), toe=(0.0, -0.24, -0.16),
    trunk=([(0, 1.14, 0.86), (0, 0.85, 0.95), (0, 0.2, 1.0), (0, -0.45, 0.98), (0, -0.78, 0.98)],
           [(0.0, 0.1, 0.1, 0.1), (0.08, 0.39, 0.29, 0.39), (0.2, 0.49, 0.33, 0.49), (0.5, 0.49, 0.34, 0.52),
            (0.75, 0.52, 0.43, 0.52), (0.92, 0.39, 0.34, 0.39), (1.0, 0.29, 0.26, 0.29)]),
    head=([(0, -0.74, 1.0), (0, -0.95, 1.0), (0, -1.15, 0.93), (0, -1.33, 0.87)],
          [(0.0, 0.2, 0.18, 0.18), (0.35, 0.23, 0.18, 0.17), (0.7, 0.12, 0.1, 0.1), (0.92, 0.08, 0.07, 0.07),
           (1.0, 0.04, 0.04, 0.04)]),
    fore=[(0.0, 0.2, 0.2, 0.2), (0.3, 0.16, 0.16, 0.16), (0.55, 0.12, 0.12, 0.12), (0.85, 0.1, 0.1, 0.1),
          (0.92, 0.11, 0.08, 0.08), (1.0, 0.09, 0.05, 0.05)],
    hind=[(0.0, 0.245, 0.245, 0.245), (0.3, 0.2, 0.2, 0.2), (0.5, 0.135, 0.135, 0.135), (0.75, 0.1, 0.1, 0.1),
          (0.85, 0.11, 0.08, 0.08), (1.0, 0.09, 0.045, 0.045)],
    nape=(-0.82, -0.74), decimate=0.12)
SKELETON = PLAN.skel
SKELETON.joints['wound'] = ('head', (0.04, -1.1, 1.12))   # shown only as it is struck
SKELETON.order.append('wound')


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        # a grizzly's coat: coarse clumps of dark and light brown streaked along the body and down the legs, deep
        # relief, so the fur reads a pixel at a time as Daggerfall's does
        'fur': hides.hide('fur', (0.09, 0.04, 0.014), (0.34, 0.16, 0.05), mottle=14.0, grain=45.0, grain_share=0.45,
                          soft=0.14, relief=0.6, relief_scale=40.0, rough=0.85, spec=0.25, stretch=(1.0, 0.75, 0.85)),
        'muzzle': hides.hide('muzzle', (0.36, 0.22, 0.1), (0.48, 0.32, 0.16), mottle=8.0, relief=0.2, rough=0.8),
        'mouth': materials.plain('mouth', (0.25, 0.04, 0.02), rough=0.6, spec=0.3),
        'claw': materials.plain('claw', (0.6, 0.58, 0.55), rough=0.3, spec=0.6),
        'eye': materials.plain('eye', (0.02, 0.01, 0.005), rough=0.2, spec=0.7),
        'nose': materials.plain('nose', (0.03, 0.015, 0.01), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    return mats


# colour classes in the reference (`ref_class`): 1 shadow, 2 the fur's brown, 3 the claws' white
CLASS = {'fur': 2, 'muzzle': 2, 'claw': 3}
GRADE_RGB = ('fur',)


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > g + 20) & (g > b) & (r > 70)] = 2
    out[(np.minimum(np.minimum(r, g), b) > 140) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 50)] = 3
    return out


def _claws(put, M, s, joint, tip, length, spread):
    """Five long pale hooked claws on top of a paw's toes, fanned, curving down in front of it."""
    x = 1.0 if s == 'L' else -1.0
    w = rest(joint)
    for k, d in enumerate((-2, -1, 0, 1, 2)):
        a = w + Vector((tip[0] * x + d * spread, tip[1] - 0.02, tip[2] + 0.06))
        b = a + Vector((d * spread * 0.6, -length * 0.75, -length * 0.9))
        put(rigid(f'claw_{joint}{k}', loft(f'claw_{joint}{k}', a[:], b[:], [(0, 0.018, 0.013), (1, 0.004, 0.004)],
                                           M['claw'], n=6, subsurf=1)), joint)


def build(M):
    """The bear's meshes: (skins, rigid parts as (object, joint))."""
    # the muscle under the fur: the scapulae over the shoulders, the haunches, a deep chest; fused into the skin
    bones = [rest(n)[:] for n in SPINE]
    masses = [blob((0.33 * x, -0.45, 1.15), (0.12, 0.22, 0.2), along=(0.0, 0.6, 1.0)) for x in (1, -1)]
    masses += [blob((0.3 * x, 0.75, 1.0), (0.14, 0.25, 0.22)) for x in (1, -1)]
    masses += [blob((0, -0.72, 0.82), (0.3, 0.12, 0.2))]
    muscle = Piece('muscle', blob_mesh('muscle', masses, res=0.02),
                   lambda p: weights_over(PLAN.body_joints, list(SPINE[:4]), chain_weights(p, bones, 0.15)),
                   [b for b in bones[:3]])
    body, tail = PLAN.build([M['fur']], extra=[muscle])
    shaggy(body, 0.02, 22.0, (1.0, 0.6, 1.0))   # the fur's broken outline
    shaggy(tail, 0.012, 22.0)
    parts = []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    put(rigid('jaw', loft('jaw', (0, -0.95, 0.84), (0, -1.3, 0.8), [(0, 0.12, 0.06), (0.6, 0.09, 0.05), (1, 0.05, 0.03)],
                          M['fur'], n=12)), 'jaw', 'head')
    # a heavy brow over the eyes, a long pale muzzle ending in a broad flat nose, the mouth's red lining under it and
    # four fangs at its front: a face that reads head on
    put(rigid('brow', blob_mesh('brow', [blob((0.07 * x, -1.07, 1.07), (0.1, 0.05, 0.045)) for x in (1, -1)],
                                res=0.008), M['fur']), 'head', 'head')
    put(rigid('muzzle', blob_mesh('muzzle', [blob((0, -1.27, 0.93), (0.1, 0.13, 0.075))], res=0.008), M['muzzle']),
        'head', 'head')
    put(rigid('mouth', blob_mesh('mouth', [blob((0, -1.22, 0.84), (0.09, 0.1, 0.02))], res=0.006), M['mouth']),
        'head', 'head')
    for x in (1, -1):
        put(rigid(f'fang_up{x}', cone(f'fang_up{x}', (0.05 * x, -1.31, 0.87), (0.05 * x, -1.315, 0.835), 0.016),
                  M['claw']), 'head', 'head')
        put(rigid(f'fang_lo{x}', cone(f'fang_lo{x}', (0.045 * x, -1.26, 0.8), (0.045 * x, -1.265, 0.83), 0.014),
                  M['claw']), 'jaw', 'head')
    put(rigid('blood', blob_mesh('blood', [blob(rest('wound')[:], (0.06, 0.04, 0.04))], res=0.01), M['mouth']),
        'wound', 'head')
    for x in (1, -1):   # small round ears set back at the skull's sides; dark eyes under the brow, where the
        # front view sees them
        put(rigid(f'ear_{x}', blob_mesh(f'ear_{x}', [blob((0.2 * x, -0.82, 1.12), (0.055, 0.03, 0.05),
                                                           along=(0.3 * x, -0.5, 1.0))], res=0.006), M['fur']),
            'head', 'head')
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.115 * x, -1.12, 1.025), (0.03, 0.02, 0.026))],
                                         res=0.004), M['eye']), 'head', 'head')
    put(rigid('nose', blob_mesh('nose', [blob((0, -1.39, 0.945), (0.036, 0.018, 0.022))], res=0.005), M['nose']),
        'head', 'head')
    for s in 'LR':
        _claws(put, M, s, f'wrist_{s}', PLAN.paw, 0.14, 0.035)
        _claws(put, M, s, f'hock_{s}', PLAN.toe, 0.09, 0.035)
    return [body, tail], parts


def walk(frame, n=4):
    rot = PLAN.walk_legs(frame / n, fore=(34, 30, 30), hind=(36, 25, 30, 12))
    rot.update({'neck': (0, 0, 0), 'head': (10, 0, 0), 'jaw': (20, 0, 0), 'spine': (0, 0, 3 * math.sin(
        2 * math.pi * frame / n))})
    return rot, None, 0.0


# the strike: crouched forward on all fours, then leaning in reared, one forepaw raised over the head and one swept
# wide, both swept forward, and coming down. Each frame's pitch, the jaw, and each arm's (shoulder swing, its spread
# out, elbow): the left and the right swing apart, as Daggerfall's do
# (solved for Daggerfall's paws' places: the left high and out, the right out at the shoulder's height)
ATTACK = [(6, 25, (-25, 0, 25), (-25, 0, 25)), (-55, 35, (-15, -36, -5), (13, -40, -5)),
          (-60, 30, (-41, -72, -5), (14, -51, -5)), (-45, 20, (-3, -17, -5), (18, -24, -5))]


def attack(frame, n=4):
    pitch, jaw, left, right = ATTACK[frame]
    rot = {'pelvis': (pitch, 0, 0), 'neck': (-pitch * 0.45, 0, 0), 'head': (-pitch * 0.4, 0, 0), 'jaw': (jaw, 0, 0)}
    if pitch > 0:   # on all fours: the forelegs reach forward, the hind legs bunched under to spring
        for s in 'LR':
            rot.update({f'shoulder_{s}': (left[0], 0, 0), f'elbow_{s}': (left[2], 0, 0), f'hip_{s}': (-15, 0, 0),
                        f'knee_{s}': (-25, 0, 0), f'hock_{s}': (25, 0, 0)})
        return rot, None, 0.0
    rot['tail_0'] = (-pitch * 0.9, 0, 0)   # the tail kept level against the rump, not hanging between the legs
    for (s, x), (sh, spread, el) in zip((('L', 1), ('R', -1)), (left, right)):
        rot[f'shoulder_{s}'] = (sh, spread * x, 0)
        rot[f'elbow_{s}'] = (el, 0, 0)
        rot[f'wrist_{s}'] = (-20, 0, 0)
        rot[f'hip_{s}'] = (-pitch * 0.85, 0, 0)   # the hind legs turned back under the reared body, feet down
        rot[f'knee_{s}'] = (-10, 0, 0)
        rot[f'hock_{s}'] = (-pitch * 0.15 + 10, 0, 0)
    return rot, [f'hock_{s}' for s in 'LR'], 0.0


def hurt(frame, n=1):
    pitch = -50
    # reared, the face still toward the viewer and tilted, the arms flung out
    rot = {'pelvis': (pitch, 0, 0), 'neck': (25, 0, 6), 'head': (15, 0, 8), 'jaw': (35, 0, 0),
           'tail_0': (-pitch * 0.9, 0, 0)}
    for s, x in (('L', 1), ('R', -1)):
        rot[f'shoulder_{s}'] = (-50, -35 * x, 0)
        rot[f'elbow_{s}'] = (40, 0, 0)
        rot[f'hip_{s}'] = (-pitch * 0.85, 0, 0)
        rot[f'hock_{s}'] = (-pitch * 0.15 + 10, 0, 0)
    return rot, [f'hock_{s}' for s in 'LR'], 0.0


def idle(frame, n=1):
    rot = PLAN.walk_legs(0.0, 0.6)
    rot['hip_R'] = (rot['hip_R'][0] + 20, 0, 0)   # the far hind leg stretched back
    rot.update({'neck': (12, 0, 0), 'head': (-12, 0, 0), 'jaw': (6, 0, 0)})   # the face toward the viewer
    return rot, None, 0.0


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt, 'idle': idle}


def pose_for(anim, frame, yaw, adj=None):
    rot, planted, lift = ANIMS[anim](frame)
    p = PLAN.pose(rot, planted, lift, yaw, adj)
    p.scales = {'wound': 1.0 if anim == 'hurt' else 0.0}
    return p


PARAMS = {a: PLAN.params(tail_bones=(0,)) for a in ANIMS}
