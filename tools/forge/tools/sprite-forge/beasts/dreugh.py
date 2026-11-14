"""The dreugh (TEXTURE.296): a sea creature near three metres from its crest to its tentacles' ends. A lean V of a
torso, glossy gold lit pink, and a horned, frilled head over a brown trunk that parts into a skirt of tentacles, four
thick and brown, three thin and green; thin arms ending in open orange pincers; six long thorned green legs fanned
from a ring between its shoulder blades. The torso and the
arms are skinned along their joints, each leg along its own two, each tentacle along a chain of four; the head, the
claws and the crest are rigid. It swims: nothing grounds it.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the dreugh faces -Y): a turn about X swings a
limb back on + and forward on -."""
import math

import numpy as np
from mathutils import Vector

import hides
import materials
from beastkit import Piece, Pose, Skeleton, Skin, apart, chain_weights, cone, hang, rigid, tube, weights_over
from body import blob, blob_mesh
from faces import face

FLIES = True   # it hovers in the water: its place is fitted both ways (beastfit.flies)
W = 1.8        # the waist, where the trunk narrows above the tentacles
HUB = (0.0, 0.14, W + 0.3)   # the legs' root, between the shoulder blades
ARM = [(0.28, 0.0, W + 0.46), (0.52, -0.05, W + 0.22), (0.5, -0.36, W + 0.12)]   # shoulder, elbow, wrist (left)
TORSO_PATH = [(0, 0.0, W - 0.25), (0, 0.0, W - 0.05), (0, 0.0, W + 0.2), (0, 0.0, W + 0.45), (0, -0.01, W + 0.58)]
# rows (t, half width, front, back): the trunk above the tentacles, the hips, a narrow waist, the chest, the shoulders
# broadest, the neck: a V
TORSO = [(0.0, 0.12, 0.1, 0.1), (0.25, 0.125, 0.1, 0.1), (0.48, 0.13, 0.1, 0.1), (0.63, 0.095, 0.08, 0.075),
         (0.8, 0.2, 0.12, 0.1), (0.89, 0.24, 0.1, 0.09), (0.95, 0.12, 0.07, 0.07), (1.0, 0.07, 0.06, 0.06)]
TRUNK_TOP = W + 0.2   # the gold hide ends at the waist; the brown trunk below it
# the legs (the left; the right mirrors them): their root's height on the hub, their slope from level in the body's
# plane, their tilt back, the femur's and tibia's lengths and the tibia's droop from the femur (degrees)
LEGS = [(0.12, 30, 12, 0.46, 0.56, 25), (0.0, -22, 14, 0.46, 0.56, 15), (-0.16, -50, 16, 0.44, 0.52, 8)]
# the tentacles: root, the way each hangs (its bend aside and forward at each quarter, degrees), length, root radius.
# The thick four splay from the trunk's foot in an inverted V and curl out at their ends
TENTACLES = [((0.05, -0.03, W - 0.15), (25, 18, 12, 50), (4, 2, 0, -4), 1.3, 0.075),
             ((-0.05, -0.03, W - 0.15), (-25, -18, -12, -50), (2, 0, -2, -4), 1.35, 0.075),
             ((0.04, 0.05, W - 0.15), (22, 26, 16, 55), (-6, -8, -6, -4), 1.2, 0.065),
             ((-0.04, 0.05, W - 0.15), (-22, -26, -16, -55), (-6, -6, -8, -6), 1.25, 0.065),
             ((0.08, 0.0, W - 0.12), (28, 30, 10, -20), (0, -6, -12, -18), 1.1, 0.032),
             ((-0.08, 0.02, W - 0.12), (-30, -26, -6, 18), (0, 6, 10, 14), 1.05, 0.032),
             ((0.0, 0.08, W - 0.14), (6, -10, -22, -30), (-10, -14, -18, -10), 1.15, 0.032)]
THICK = 4   # the first four tentacles are the thick brown ones, the rest thin and green
BENDS = 4


def _leg_points(k, s):
    """Leg `k` on side `s`: its root, knee, tip and the tip's hook."""
    dz, slope, tilt, femur, tibia, droop = LEGS[k]
    x = 1.0 if s == 'L' else -1.0
    a, t = math.radians(slope), math.radians(tilt)
    d = Vector((math.cos(a) * math.cos(t) * x, math.sin(t), math.sin(a) * math.cos(t)))
    root = Vector((0.1 * x, HUB[1], HUB[2] + dz))
    knee = root + d * femur
    d2 = _droop(d, droop)
    tip = knee + d2 * tibia
    hook = tip + _droop(d2, 40) * 0.07
    return [root, knee, tip, hook]


def _droop(d, deg):
    """Direction `d` turned `deg` degrees down in its own upright plane."""
    across = d.cross(Vector((0, 0, 1))).normalized()
    up = across.cross(d).normalized()
    a = math.radians(deg)
    return (d * math.cos(a) - up * math.sin(a)).normalized()


def _tentacle_points(k):
    """Tentacle `k` at rest: its root, its four joints' heads after it and its tip, a quarter of its length apart."""
    root, aside, ahead, length, _ = TENTACLES[k]
    p, out = Vector(root), [Vector(root)]
    step = length / BENDS
    for i in range(BENDS):
        a, b = math.radians(aside[i]), math.radians(ahead[i])
        d = Vector((math.sin(a), -math.sin(b), -math.cos(a) * math.cos(b))).normalized()
        p = p + d * step
        out.append(p.copy())
    return out


JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'pelvis': ('root', (0.0, 0.0, W - 0.3)),
    'chest': ('pelvis', (0.0, 0.0, W + 0.15)),
    'head': ('chest', (0.0, -0.02, W + 0.55)),
    'wound': ('head', (0.03, -0.1, W + 0.72)),
    'hub': ('chest', HUB),
}
for s in 'LR':
    m = (lambda x: (lambda p: (p[0] * x, p[1], p[2])))(1.0 if s == 'L' else -1.0)
    JOINTS.update({f'arm_{s}': ('chest', m(ARM[0])), f'fore_{s}': (f'arm_{s}', m(ARM[1])),
                   f'claw_{s}': (f'fore_{s}', m(ARM[2])), f'pincer_{s}': (f'claw_{s}', m(ARM[2]))})
    for k in range(len(LEGS)):
        root, knee, _, _ = _leg_points(k, s)
        JOINTS[f'coxa{k}_{s}'] = ('hub', root[:])
        JOINTS[f'knee{k}_{s}'] = (f'coxa{k}_{s}', knee[:])
for k in range(len(TENTACLES)):
    pts = _tentacle_points(k)
    for i in range(BENDS):
        JOINTS[f'tent{k}_{i}'] = ('pelvis' if i == 0 else f'tent{k}_{i - 1}', pts[i][:])
SKELETON = Skeleton(JOINTS)


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        # a smooth glossy gold, its highlights pink; the trunk brown; the legs a clean yellow-green
        'hide': hides.hide('hide', (0.17, 0.13, 0.075), (0.22, 0.17, 0.1), mottle=6.0, grain=40.0, grain_share=0.2,
                           relief=0.2, rough=0.3, spec=0.6),
        'trunk': hides.hide('trunk', (0.14, 0.1, 0.055), (0.2, 0.14, 0.08), mottle=6.0, grain=40.0, relief=0.3,
                            rough=0.6, spec=0.3, stretch=(1.0, 1.0, 0.4)),
        'leg': hides.hide('leg', (0.1, 0.18, 0.06), (0.2, 0.3, 0.1), mottle=8.0, grain=40.0, grain_share=0.2,
                          relief=0.2, rough=0.5, spec=0.4),
        'frill': materials.plain('frill', (0.25, 0.38, 0.15), rough=0.5, spec=0.3),
        'claw': materials.plain('claw', (0.42, 0.13, 0.035), rough=0.35, spec=0.6),
        'horn': materials.plain('horn', (0.12, 0.09, 0.08), rough=0.4, spec=0.5),
        'socket': materials.plain('socket', (0.03, 0.02, 0.015), rough=0.8, spec=0.1),
        'mouth': materials.plain('mouth', (0.05, 0.02, 0.015), rough=0.8, spec=0.1),
        'blood': materials.plain('blood', (0.5, 0.02, 0.0), rough=0.4, spec=0.5),
    }
    b = mats['hide'].node_tree.nodes['Principled BSDF']
    b.inputs['Specular Tint'].default_value = (0.55 / 0.55, 0.3 / 0.55, 0.42 / 0.55, 1)   # lit muscle reads pink
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    return mats


# colour classes in the reference (`ref_class`): 1 shadow and the brown, 2 the legs' and tendrils' green, 3 the claws
CLASS = {'leg': 2, 'frill': 2, 'claw': 3}
GRADE_RGB = ('hide', 'trunk', 'leg')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(g > r + 8) & (g > b + 5)] = 2
    out[(r > g + 40) & (r > b + 60) & (r > 110)] = 3
    return out


def _chain(name, pts, radii, names, mat, n=12, blend=0.03, up=(1, 0, 0)):
    """A tube through `pts` skinned along them: the stretch from pts[k] to pts[k + 1] goes with joint `names[k]`. Its
    rings are 15 mm apart, under a pixel at the dreugh's one size."""
    pts = [tuple(p) for p in pts]
    me = tube(name, pts, [(t, r, r, r) for t, r in radii], n=n, up=up, step=0.015)
    w = chain_weights(np.array([v.co[:] for v in me.vertices]), pts, blend)
    joints = sorted(set(names))
    sk = Skin(SKELETON, name, me, mat, joints, weights_over(joints, names, w))
    sk.pieces = [Piece(name, None, None, pts)]
    return sk


def build(M):
    """The dreugh's meshes: (skins, rigid parts as (object, joint))."""
    skins, parts = [], []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    me = tube('torso', TORSO_PATH, TORSO, n=28, up=(0, -1, 0), step=0.015)
    for f in me.polygons:   # the trunk's brown below the waist
        f.material_index = 1 if f.center.z < TRUNK_TOP else 0
    torso = Skin(SKELETON, 'torso', me, [M['hide'], M['trunk']], ['pelvis', 'chest'],
                 chain_weights(np.array([v.co[:] for v in me.vertices]),
                               [(0, 0, W - 0.25), (0, 0, W + 0.15), (0, 0, W + 0.58)], 0.1))
    torso.pieces = [Piece('torso', None, None, TORSO_PATH, rows=[r[0] for r in TORSO])]
    skins.append(torso)
    # the muscle: pectorals, deltoids and three pairs of abdominals on the chest
    muscle = []
    for x in (1, -1):
        muscle += [blob((0.09 * x, -0.1, W + 0.4), (0.09, 0.04, 0.06)),
                   blob((0.27 * x, 0.0, W + 0.47), (0.07, 0.07, 0.08))]
        muscle += [blob((0.035 * x, -0.07, W + z), (0.035, 0.03, 0.032)) for z in (0.22, 0.28, 0.34)]
    put(rigid('muscle', blob_mesh('muscle', muscle, res=0.01), M['hide']), 'chest', 'torso')
    # its face (faces.py): deep sockets and a wide mouth carved under a heavy brow, no nose to speak of
    face('head', (0, -0.03, W + 0.66), 0.27, 'dreugh', M, put, 'head', skin='hide', eye='socket')
    put(rigid('crest', tube('crest', [(0, 0.0, W + 0.78), (0, 0.015, W + 0.9), (0, 0.025, W + 1.0)],
                            [(0.0, 0.03, 0.03, 0.03), (1.0, 0.004, 0.004, 0.004)], n=8, up=(0, 1, 0)), M['horn']),
        'head')
    for x in (1, -1):
        put(rigid(f'horn_{x}', tube(f'horn_{x}', [(0.06 * x, -0.02, W + 0.76), (0.075 * x, 0.0, W + 0.85),
                                                   (0.08 * x, 0.01, W + 0.92)],
                                    [(0.0, 0.022, 0.022, 0.022), (1.0, 0.004, 0.004, 0.004)], n=8, up=(0, 1, 0)),
                  M['horn']), 'head')
        fan = (math.sin(math.radians(30)) * x, 0.0, math.cos(math.radians(30)))   # the frills fanned out
        put(rigid(f'fin_{x}', blob_mesh(f'fin_{x}', [blob((0.1 * x + 0.06 * fan[0], 0.0, W + 0.72),
                                                           (0.015, 0.06, 0.13), along=fan)], res=0.008), M['frill']),
            'head')
    for s in 'LR':
        x = 1.0 if s == 'L' else -1.0
        m = lambda p: (p[0] * x, p[1], p[2])   # noqa: E731
        sh, el, wr = (m(p) for p in ARM)
        skins.append(_chain(f'arm_{s}', [sh, el, wr], [(0.0, 0.05), (0.45, 0.04), (1.0, 0.035)],
                            [f'arm_{s}', f'fore_{s}'], M['hide']))
        # the claw: two thin prongs 0.3 m long from a small palm, aimed forward and in; the lower one moves
        w = np.array(wr)
        d = np.array((-0.5 * x, -0.75, -0.25))
        d /= np.linalg.norm(d)
        bow = np.cross(d, (x, 0.0, 0.0))
        bow /= np.linalg.norm(bow)
        put(rigid(f'palm_{s}', blob_mesh(f'palm_{s}', [blob(tuple(w + d * 0.03), (0.045, 0.045, 0.045))], res=0.008),
                  M['claw']), f'claw_{s}')
        for name, lift, joint in ((f'claw_{s}', 0.025, f'claw_{s}'), (f'pincer_{s}', -0.025, f'pincer_{s}')):
            base = w + d * 0.04 + bow * lift
            pts = [base, base + d * 0.15 + bow * lift * 1.2, base + d * 0.3 - bow * lift * 0.4]
            put(rigid(name, tube(name, [tuple(p) for p in pts], [(0.0, 0.03, 0.03, 0.03), (1.0, 0.006, 0.006, 0.006)],
                                 n=10), M['claw']), joint)
        for k in range(len(LEGS)):
            pts = _leg_points(k, s)
            skins.append(_chain(f'leg{k}_{s}', pts, [(0.0, 0.048), (0.42, 0.036), (0.45, 0.042), (0.5, 0.034),
                                                    (0.9, 0.02), (1.0, 0.006)],
                                [f'coxa{k}_{s}', f'knee{k}_{s}', f'knee{k}_{s}'], M['leg'], n=8))
            knee, tip = np.array(pts[1][:]), np.array(pts[2][:])
            for t in (0.0, 1 / 3, 2 / 3):   # thorns at the knee and down the tibia, pointing out and back
                at = knee + (tip - knee) * t
                out = np.array((x, 0.6, 0.2))
                out /= np.linalg.norm(out)
                put(rigid(f'thorn{k}_{s}{t:.1f}', cone(f'thorn{k}_{s}{t:.1f}', tuple(at), tuple(at + out * 0.05), 0.01),
                          M['leg']), f'knee{k}_{s}')
    for k in range(len(TENTACLES)):
        pts = _tentacle_points(k)
        r0 = TENTACLES[k][4]
        radii = [(0.0, r0), (0.3, r0 * 0.8), (0.7, r0 * 0.4), (1.0, r0 * 0.06)]
        names = [f'tent{k}_{i}' for i in range(BENDS)]
        skins.append(_chain(f'tent{k}', pts, radii, names, M['trunk'] if k < THICK else M['leg'],
                            n=14 if k < THICK else 8, blend=0.08, up=(0, 1, 0)))
    # the ring the legs root on, between the shoulder blades over two humps of back muscle
    put(rigid('ring', _ring('ring', HUB, 0.17, 0.035), M['leg']), 'hub', 'torso')
    put(rigid('humps', blob_mesh('humps', [blob((0.12 * x, 0.1, W + 0.15), (0.12, 0.06, 0.14)) for x in (1, -1)],
                                 res=0.012), M['hide']), 'chest', 'torso')
    # the wound: droplets flung up and out from the brow
    w = np.array(rest('wound')[:])
    drops = [blob(tuple(w + np.array((0.04 * t, -0.01, 0.05 + 0.15 * t))), (r, r, r))
             for t, r in zip(np.linspace(0, 1, 5), (0.02, 0.019, 0.017, 0.016, 0.015))]
    put(rigid('blood', blob_mesh('blood', drops, res=0.005), M['blood']), 'wound')
    return skins, parts


def _ring(name, centre, radius, r, n=40, m=10):
    """A torus about `centre` facing back (+Y): the ring between the dreugh's shoulder blades."""
    import bpy
    verts, faces = [], []
    for i in range(n):
        a = 2 * math.pi * i / n
        c = np.array((math.cos(a), 0.0, math.sin(a)))
        for k in range(m):
            b = 2 * math.pi * k / m
            verts.append(tuple(np.array(centre) + c * (radius + r * math.cos(b)) + np.array((0, r * math.sin(b), 0))))
    for i in range(n):
        for k in range(m):
            faces.append((i * m + k, ((i + 1) % n) * m + k, ((i + 1) % n) * m + (k + 1) % m, i * m + (k + 1) % m))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.shade_smooth()
    return me


def _sway(phase, gain=1.0):
    """The tentacles' and the legs' slow beat at a share `phase` of a stroke. The thick tentacles open and close
    together, ±10 degrees at the root growing to ±25 at the tip; the thin ones wave each in its own time. The legs
    rise and fall together, both sides in step, each pair a little after the one above."""
    rot = {}
    for k, (root, *_rest) in enumerate(TENTACLES):
        side = 1.0 if root[0] >= 0 else -1.0
        for i in range(BENDS):
            if k < THICK:
                a = 2 * math.pi * phase + 0.3 * k
                rot[f'tent{k}_{i}'] = (gain * 0.5 * (4 + 3 * i) * math.sin(a - 0.8 * i),
                                       -side * gain * (10 if i == 0 else 5) * math.sin(a), 0)
            else:
                a = 2 * math.pi * phase - 0.8 * i + 1.3 * k
                rot[f'tent{k}_{i}'] = (gain * 0.5 * (4 + 3 * i) * math.sin(a), gain * (3 + 2 * i) * math.cos(a), 0)
    for s, x in (('L', 1.0), ('R', -1.0)):
        for k in range(len(LEGS)):
            a = 2 * math.pi * phase + 0.6 * k
            rot[f'coxa{k}_{s}'] = (0, -gain * 25 * math.sin(a) * x, 0)
            rot[f'knee{k}_{s}'] = (0, -gain * 12 * math.cos(a) * x, 0)
    return rot


def walk(frame, n=8):
    rot = _sway(frame / n)
    rot.update({'chest': (0, 0, 0), 'head': (4, 0, 0), 'pincer_L': (SNAP[0], 0, 0), 'pincer_R': (SNAP[0], 0, 0)})
    return rot, {'wound': 0.0}


# the strike over its eight frames: the claws drawn back and up, flung forward and snapped shut
REACH = [0, 25, 60, 90, 90, 85, 40, 10]   # the arms raised forward (degrees), level and straight at the thrust
SNAP = [18, 25, 35, 40, 18, 10, 10, 18]     # the pincers opened: they stand a little open even at rest


def attack(frame, n=8):
    rot = _sway(frame / n, 1.4)
    for s, x in (('L', 1.0), ('R', -1.0)):
        reach = REACH[frame]
        rot.update({f'arm_{s}': (-reach, 0, 0.2 * x * reach), f'fore_{s}': (reach * 0.8, 0, 0),
                    f'pincer_{s}': (SNAP[frame], 0, 0)})
    rot.update({'chest': (REACH[frame] * 0.15, 0, 0), 'head': (4, 0, 0)})
    return rot, {'wound': 0.0}


def hurt(frame, n=1):
    rot = _sway(0.0)
    # it throws its head back and flings its left claw up over it, open
    rot.update({'chest': (-8, 0, 6), 'head': (-25, 0, 10), 'arm_L': (-150, 0, 20), 'fore_L': (-30, 0, 0),
                'pincer_L': (30, 0, 0), 'pincer_R': (SNAP[0], 0, 0)})
    return rot, {'wound': 1.0}


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
_ARM_P = [('arm_L|arm_R', 0, 10), ('arm_L|arm_R', 2, 10), ('fore_L|fore_R', 0, 10)]
_LEG_P = [(f'coxa{k}_L|coxa{k}_R', ax, 8) for k in range(len(LEGS)) for ax in (1, 2)]
_TENT_P = [(f'tent{k}_{i}', ax, 10) for k in range(THICK) for i in (0, 2) for ax in (0, 1)]
_BODY_P = [('pelvis', 0, 6), ('chest', 0, 6), ('head', 0, 8)]
PARAMS = {a: _BODY_P + [('pelvis', 1, 6), ('pelvis', 2, 6)] + apart(_ARM_P + _LEG_P) + _TENT_P for a in ANIMS}
