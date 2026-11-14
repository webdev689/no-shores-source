"""The lamia (TEXTURE.297): a woman's torso, arms and clawed hands, with long golden hair falling past her shoulders
and a jewelled gold circlet, leaning forward over a serpent's tail four metres long, brown beneath and green along its
back, thick to a broad fan of a fin. The torso is skinned
over the hips and chest, the arms along their joints, the tail along a chain of eight; the head, the hair, the claws
and the fins are rigid. It swims: nothing grounds it.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the lamia faces -Y): a turn about Z swings
a joint's part of the tail aside, about X pitches it (forward and down on -)."""
import math

import numpy as np

import hides
import materials
from beastkit import Piece, Pose, Skeleton, Skin, apart, chain_weights, cone, hang, rigid, tube, web, weights_over
from body import blob, blob_mesh, seg
from faces import face

FLIES = True   # it hovers in the water: its place is fitted both ways (beastfit.flies)
Z = 0.75       # the hips, where the tail begins
NECK = (0.0, -0.27, Z + 0.66)
ARM = [(0.2, -0.2, Z + 0.6), (0.4, -0.38, Z + 0.42), (0.55, -0.58, Z + 0.45), (0.6, -0.7, Z + 0.47)]   # the left
TORSO_PATH = [(0, 0.02, Z - 0.05), (0, 0.0, Z), (0, -0.1, Z + 0.3), (0, -0.2, Z + 0.52), NECK]
# rows (t, half width, front, back): the hips, a slim waist, the ribs, the shoulders, the neck
TORSO = [(0.0, 0.17, 0.13, 0.12), (0.3, 0.115, 0.1, 0.1), (0.6, 0.16, 0.11, 0.1), (0.85, 0.17, 0.1, 0.09),
         (0.92, 0.12, 0.08, 0.075), (0.97, 0.065, 0.055, 0.055), (1.0, 0.055, 0.05, 0.05)]
# the tail at rest: from the hips down to the belly's low point, then back and gently up to its end
TAIL_PATH = [(0, 0.02, Z - 0.02), (0, 0.15, Z - 0.32), (0, 0.42, Z - 0.5), (0, 0.85, Z - 0.46), (0, 1.35, Z - 0.36),
             (0, 1.85, Z - 0.24), (0, 2.35, Z - 0.14), (0, 2.8, Z - 0.06), (0, 3.15, Z - 0.02)]
TAIL = [(0.0, 0.17, 0.15, 0.15), (0.12, 0.19, 0.19, 0.19), (0.3, 0.16, 0.16, 0.16), (0.55, 0.12, 0.12, 0.12),
        (0.8, 0.09, 0.09, 0.09), (0.95, 0.06, 0.06, 0.06), (1.0, 0.03, 0.03, 0.03)]
SEGS = len(TAIL_PATH) - 1


def _along(path, t):
    """The point a share `t` of the way along the polyline `path`."""
    p = np.asarray(path, dtype=np.float64)
    s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    return np.array([np.interp(t * s[-1], s, p[:, k]) for k in range(3)])


JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'pelvis': ('root', (0.0, 0.0, Z)),
    'chest': ('pelvis', (0.0, -0.1, Z + 0.3)),
    'head': ('chest', NECK),
    'wound': ('head', (0.04, -0.36, Z + 0.95)),
    'mouth': ('head', (0.0, -0.424, Z + 0.73)),
}
for s in 'LR':
    m = (lambda x: (lambda p: (p[0] * x, p[1], p[2])))(1.0 if s == 'L' else -1.0)
    JOINTS.update({f'arm_{s}': ('chest', m(ARM[0])), f'fore_{s}': (f'arm_{s}', m(ARM[1])),
                   f'hand_{s}': (f'fore_{s}', m(ARM[2]))})
for k in range(SEGS):
    JOINTS[f'tail_{k}'] = ('pelvis' if k == 0 else f'tail_{k - 1}', TAIL_PATH[k])
SKELETON = Skeleton(JOINTS)


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        'skin': hides.hide('skin', (0.4, 0.23, 0.13), (0.5, 0.3, 0.17), mottle=4.0, grain=30.0, grain_share=0.15,
                           relief=0.1, rough=0.7, spec=0.3),
        # golden hair streaked down its fall
        'hair': hides.hide('hair', (0.25, 0.15, 0.05), (0.55, 0.4, 0.17), mottle=10.0, grain=60.0, grain_share=0.5,
                           relief=0.3, stretch=(1.0, 1.0, 0.15)),
        # the belly's brown streaked down the tail, the back's scales green
        'belly': hides.hide('belly', (0.14, 0.08, 0.035), (0.3, 0.19, 0.09), mottle=30.0, grain=60.0, relief=0.2,
                            rough=0.55, spec=0.3, stretch=(1.0, 0.27, 0.27)),
        'scale': materials.speckle('scale', (0.05, 0.1, 0.025), (0.18, 0.34, 0.07), scale=34.0, at=0.42, rough=0.45,
                                   metal=0.0),
        'fin': materials.plain('fin', (0.2, 0.4, 0.25), rough=0.5, spec=0.3),
        'gold': materials.plain('gold', (0.6, 0.4, 0.08), metal=0.8, rough=0.3),
        'jewel': materials.plain('jewel', (0.7, 0.65, 0.5), metal=0.5, rough=0.15, spec=0.9),
        'claw': materials.plain('claw', (0.08, 0.05, 0.03), rough=0.3, spec=0.6),
        'socket': materials.plain('socket', (0.08, 0.04, 0.025), rough=0.8, spec=0.1),
        'mouth': materials.plain('mouth', (0.05, 0.015, 0.01), rough=0.9, spec=0.05),
        'blood': materials.plain('blood', (0.25, 0.01, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    return mats


# colour classes in the reference (`ref_class`): 1 shadow and the belly's brown, 2 the skin, 3 the scales' green
CLASS = {'skin': 2, 'scale': 3, 'fin': 3}
GRADE_RGB = ('skin', 'belly', 'scale', 'hair')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > 130) & (g > 85) & (r > b + 45) & (g > b + 20)] = 2
    out[(g > r + 5) & (g > b + 15)] = 3
    return out


def _chain(name, pts, rows, names, mat, n=12, up=(1, 0, 0), blend=0.05):
    pts = [tuple(p) for p in pts]
    me = tube(name, pts, rows, n=n, up=up, step=0.012)
    w = chain_weights(np.array([v.co[:] for v in me.vertices]), pts, blend)
    joints = sorted(set(names))
    sk = Skin(SKELETON, name, me, mat, joints, weights_over(joints, names, w))
    sk.pieces = [Piece(name, None, None, pts)]
    return sk


def _tail(M):
    """The tail, skinned along its chain: green along its back and over its last half, brown beneath."""
    sk = _chain('tail', TAIL_PATH, TAIL, [f'tail_{k}' for k in range(SEGS)], [M['belly'], M['scale']], n=24,
                up=(0, 0, 1), blend=0.12)
    me = sk.me
    path = np.asarray(TAIL_PATH, dtype=np.float64)
    for f in me.polygons:
        c = np.array(f.center[:])
        mid = np.interp(c[1], path[:, 1], path[:, 2])
        f.material_index = 1 if c[1] > 1.6 or (c[1] > 0.3 and c[2] > mid + 0.03) else 0
    return sk


def build(M):
    """The lamia's meshes: (skins, rigid parts as (object, joint))."""
    skins, parts = [], []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    me = tube('torso', TORSO_PATH, TORSO, n=24, up=(0, -1, 0), step=0.012)
    path = np.asarray(TORSO_PATH, dtype=np.float64)
    for v in me.vertices:   # a shallow crease down the spine
        mid = np.interp(v.co.z, path[:, 2], path[:, 1])
        if abs(v.co.x) < 0.02 and v.co.y > mid + 0.03 and Z + 0.1 < v.co.z < Z + 0.58:
            v.co.y -= 0.012 * (1.0 - abs(v.co.x) / 0.02)
    torso = Skin(SKELETON, 'torso', me, M['skin'], ['pelvis', 'chest', 'head'],
                 chain_weights(np.array([v.co[:] for v in me.vertices]),
                               [(0, 0.02, Z - 0.1), (0, -0.1, Z + 0.3), NECK, (0, -0.3, Z + 0.72)], 0.06))
    torso.pieces = [Piece('torso', None, None, TORSO_PATH, rows=[r[0] for r in TORSO])]
    skins.append(torso)
    skins.append(_tail(M))
    # the breast's two smooth rounds, set on the chest's front
    put(rigid('bust', blob_mesh('bust', [blob((x, -0.27, Z + 0.37), (0.07, 0.06, 0.065)) for x in (0.08, -0.08)],
                                res=0.01), M['skin']), 'chest', 'torso')
    put(rigid('blades', blob_mesh('blades', [blob((0.08 * x, -0.12, Z + 0.5), (0.06, 0.02, 0.08)) for x in (1, -1)],
                                  res=0.01), M['skin']), 'chest', 'torso')
    # the face (faces.py): sockets and a mouth carved under a brow, a nose and cheekbones; the mouth opens as she
    # strikes
    mouth = face('head', (0, -0.33, Z + 0.8), 0.23, 'woman', M, put, 'head', eye='socket')
    put(rigid('gape', blob_mesh('gape', [blob(mouth, (0.024, 0.01, 0.018))], res=0.003), M['mouth']), 'mouth')
    # the hair: a cap, locks at the sides and falling in front over the collarbones, a sheet down the back
    hair = [blob((0, -0.3, Z + 0.87), (0.105, 0.11, 0.075)), blob((0.115, -0.29, Z + 0.76), (0.035, 0.075, 0.14)),
            blob((-0.115, -0.29, Z + 0.76), (0.035, 0.075, 0.14)), blob((0, -0.21, Z + 0.7), (0.1, 0.07, 0.2)),
            seg((0, -0.25, Z + 0.86), (0, -0.12, Z + 0.45), 0.13, 0.05)]
    hair += [blob((0.115 * x, -0.31, Z + 0.68), (0.035, 0.04, 0.16)) for x in (1, -1)]
    put(rigid('hair', blob_mesh('hair', hair, res=0.01), M['hair']), 'head')
    # the circlet on the crown, a jewel at its front
    tilt = math.tan(math.radians(10))
    band = [(math.cos(a) * 0.09, -0.3 + math.sin(a) * 0.09, Z + 0.92 - math.sin(a) * 0.09 * tilt)
            for a in np.linspace(0, 2 * math.pi, 25)]
    put(rigid('band', tube('band', band, [(0.0, 0.012, 0.012, 0.012), (1.0, 0.012, 0.012, 0.012)], n=6,
                           up=(0, 0, 1), step=0.01), M['gold']), 'head')
    put(rigid('jewel', blob_mesh('jewel', [blob((0, -0.39, Z + 0.935), (0.02, 0.012, 0.02))], res=0.004),
              M['jewel']), 'head')
    for s in 'LR':
        x = 1.0 if s == 'L' else -1.0
        pts = [(p[0] * x, p[1], p[2]) for p in ARM]
        skins.append(_chain(f'arm_{s}', pts, [(0.0, 0.05, 0.05, 0.05), (0.4, 0.038, 0.038, 0.038),
                                              (0.8, 0.03, 0.03, 0.03), (1.0, 0.032, 0.032, 0.032)],
                            [f'arm_{s}', f'fore_{s}', f'hand_{s}'], M['skin']))
        # a broad hand: a palm and four long fingers spread, each ending in a claw
        wrist, tip = np.array(pts[2]), np.array(pts[3])
        put(rigid(f'palm_{s}', blob_mesh(f'palm_{s}', [blob(tuple(tip), (0.04, 0.05, 0.02),
                                                            along=tuple(tip - wrist))], res=0.006), M['skin']),
            f'hand_{s}')
        d = (tip - wrist) / np.linalg.norm(tip - wrist)
        for k, a in enumerate((-25, -8, 8, 25)):
            c, sn = math.cos(math.radians(a)), math.sin(math.radians(a))
            f = np.array((d[0] * c - d[1] * sn, d[0] * sn + d[1] * c, d[2]))
            base, knuckle = tip + f * 0.03, tip + f * 0.11
            put(rigid(f'finger_{s}{k}', cone(f'finger_{s}{k}', tuple(base), tuple(knuckle), 0.012, 0.008), M['skin']),
                f'hand_{s}')
            put(rigid(f'claw_{s}{k}', cone(f'claw_{s}{k}', tuple(knuckle), tuple(knuckle + f * 0.03 - (0, 0, 0.025)),
                                           0.006, 0.001), M['claw']), f'hand_{s}')
    # the ridge of spines along the tail's back, and its end's fin
    for k in range(28):
        t = 0.3 + 0.62 * k / 27
        c = _along(TAIL_PATH, t)
        r = float(np.interp(t, [row[0] for row in TAIL], [row[2] for row in TAIL]))
        part = min(int(t * SEGS), SEGS - 1)
        put(rigid(f'spine{k}', tube(f'spine{k}', [(0, c[1], c[2] + r - 0.01), (0, c[1] + 0.07, c[2] + r + 0.1)],
                                    [(0.0, 0.014, 0.014, 0.014), (1.0, 0.002, 0.002, 0.002)], n=6, up=(0, -1, 0),
                                    step=0.01), M['scale']), f'tail_{part}', 'tail')
    # the fin: nine rays fanned 35 degrees either way from the tail's end, the outer ones longest, a vane between
    root = np.array(_along(TAIL_PATH, 0.96))
    tips = [tuple(root + (0.3 + 0.15 * abs(a) / 35) * np.array((0, math.cos(math.radians(a)),
                                                                   math.sin(math.radians(a)))))
            for a in np.linspace(-35, 35, 9)]
    put(rigid('fin', web('fin', [((tuple(root), a), (tuple(root), b)) for a, b in zip(tips, tips[1:])], sag=0.2),
              M['fin']), f'tail_{SEGS - 1}', 'tail')
    for k, t in enumerate(tips):
        put(rigid(f'ray{k}', cone(f'ray{k}', tuple(root), t, 0.01, 0.003), M['fin']), f'tail_{SEGS - 1}', 'tail')
    # the wound: droplets flung up and out above the brow
    w = np.array(rest('wound')[:])
    drops = [blob(tuple(w + np.array((0.06 * t, -0.02, 0.05 + 0.15 * t))), (r, r, r))
             for t, r in zip(np.linspace(0, 1, 5), (0.018, 0.016, 0.015, 0.013, 0.012))]
    put(rigid('blood', blob_mesh('blood', drops, res=0.004), M['blood']), 'wound')
    return skins, parts


def _swim(phase, amp=1.0):
    """The tail's undulation at a share `phase` of a stroke: each joint swung aside a little later than the one before,
    harder toward the end, with a slight rise and fall."""
    rot = {}
    for k in range(SEGS):
        a = 2 * math.pi * phase - 0.75 * k
        rot[f'tail_{k}'] = (amp * 2 * math.cos(a), 0, amp * (2 + 1.2 * k) * math.sin(a))
    return rot


def walk(frame, n=8):
    rot = _swim(frame / n)
    sway = 4 * math.sin(2 * math.pi * frame / n)
    rot.update({'pelvis': (0, 0, -sway), 'chest': (-12, 0, sway), 'head': (10, 0, 0)})
    for s, x in (('L', 1.0), ('R', -1.0)):
        rot.update({f'arm_{s}': (sway * x, 0, 0), f'fore_{s}': (0, 0, 0), f'hand_{s}': (0, 0, 0)})
    return rot, {'wound': 0.0, 'mouth': 0.0}


# the strike over its eight frames: the arms flung up and wide, the forearms raised, held out level, then raked down
# to the hips with the claws down; the mouth open as she rakes. Each frame's left upper arm (x, y, z) and elbow, solved
# for Daggerfall's hands' places (the right mirrors it)
STRIKE = [((23, -12, 9), -72), ((13, -21, 27), -50), ((3, -30, 36), -27), ((10, -26, 32), 0), ((39, 15, 8), 0),
          ((49, 25, 1), -3), ((52, 23, -5), -4), ((48, -12, 9), -38)]
GAPE = [0, 0, 0, 1, 1, 1, 1, 0]


def attack(frame, n=8):
    rot, _ = walk(frame, n)
    (ax, ay, az), elbow = STRIKE[frame]
    for s, x in (('L', 1.0), ('R', -1.0)):
        rot.update({f'arm_{s}': (ax, ay * x, az * x), f'fore_{s}': (elbow, 0, 0)})
    rot['chest'] = (-12 + 8 * (frame >= 4), 0, rot['chest'][2])
    return rot, {'wound': 0.0, 'mouth': float(GAPE[frame])}


def hurt(frame, n=1):
    # the tail hangs under her, the torso twisted aside and the head thrown back, one arm flung out and the other
    # hand at her chest
    rot = _swim(0.25)
    for k in range(3):
        r = rot[f'tail_{k}']
        rot[f'tail_{k}'] = (r[0] - 25, r[1], r[2])
    rot.update({'chest': (-15, 0, 20), 'head': (-25, 0, 10), 'arm_L': (0, -30, 0), 'arm_R': (-30, 0, 0),
                'fore_R': (0, 0, 80)})
    return rot, {'wound': 1.0, 'mouth': 1.0}


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt}


def pose_for(anim, frame, yaw, adj=None):
    adj = adj or {}
    rot, scales = ANIMS[anim](frame)
    for j, d in adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(SKELETON, rot, yaw=yaw + adj.get('turn', 0.0), scales=scales)
    p.root_loc.z += adj.get('lift', 0.0)
    return p


# the limbs are fitted each its own way (the pairs split, beastkit.apart): Daggerfall's is not a mirror image of
# itself even from the front
_ARM_P = [('arm_L|arm_R', 0, 10), ('arm_L|arm_R', 1, 10), ('fore_L|fore_R', 0, 10)]
_TAIL_P = [(f'tail_{k}', ax, 8) for k in range(0, SEGS, 2) for ax in (0, 2)]
_BODY_P = [('pelvis', 0, 6), ('chest', 0, 6), ('head', 0, 8)]
PARAMS = {a: _BODY_P + [('pelvis', 1, 6), ('pelvis', 2, 6), ('chest', 2, 6)] + apart(_ARM_P) + _TAIL_P
          for a in ANIMS}
