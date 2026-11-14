"""The spriggan (TEXTURE.257): a tall, thin creature of pale grooved wood two metres high, a narrow face with a long
pointed chin under a crown of twigs, its long arms ending in fans of flat blades, long spiked feet, a skirt of broad
shards before its hips, sharp shards on its shoulders, and sprigs of green leaves at its crown, on one forearm and at
its knees. It stands on the two-legged plan (biped.py); the twigs, the splinters, the bark
and the leaves are rigid on the joints they grow from.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the spriggan faces -Y): a limb hanging down
swings forward on -X; the trunk, neck or head pitches forward on +X."""
import math

import numpy as np

import hides
import materials
from beastkit import cone, hang, rigid, shaggy, tube
from biped import Biped
from body import blob, blob_mesh

PLAN = Biped(
    spine={'pelvis': (0.0, 1.05), 'spine': (0.0, 1.3), 'chest': (-0.02, 1.55), 'neck': (-0.04, 1.75),
           'head': (-0.06, 1.84), 'jaw': (-0.11, 1.8)},
    limbs={'hip': (0.1, 0.0, 1.0), 'knee': (0.12, -0.04, 0.55), 'ankle': (0.12, 0.02, 0.08),
           'shoulder': (0.24, -0.02, 1.68), 'elbow': (0.31, 0.0, 1.38), 'wrist': (0.33, -0.05, 1.08)},
    foot=(0.0, -0.38, -0.02), hand=(0.0, -0.03, -0.1),
    trunk=([(0, 0.0, 0.92), (0, 0.0, 1.05), (0, 0.0, 1.3), (0, -0.02, 1.55), (0, -0.04, 1.76)],
           [(0.0, 0.11, 0.09, 0.09), (0.15, 0.15, 0.12, 0.12), (0.38, 0.09, 0.08, 0.08), (0.68, 0.15, 0.12, 0.11),
            (0.88, 0.19, 0.1, 0.1), (1.0, 0.07, 0.06, 0.06)]),
    head=([(0, -0.03, 1.78), (0, -0.07, 1.9), (0, -0.1, 2.0)],
          [(0.0, 0.045, 0.05, 0.05), (0.3, 0.09, 0.07, 0.08), (0.7, 0.1, 0.07, 0.07), (1.0, 0.06, 0.04, 0.04)]),
    leg=[(0.0, 0.1, 0.1, 0.1), (0.3, 0.08, 0.08, 0.08), (0.45, 0.045, 0.045, 0.045), (0.6, 0.05, 0.05, 0.05),
         (0.85, 0.035, 0.035, 0.035), (0.9, 0.045, 0.025, 0.025), (1.0, 0.008, 0.006, 0.006)],
    arm=[(0.0, 0.08, 0.08, 0.08), (0.3, 0.06, 0.06, 0.06), (0.5, 0.048, 0.048, 0.048), (0.75, 0.045, 0.045, 0.045),
         (0.9, 0.04, 0.04, 0.04), (1.0, 0.025, 0.025, 0.025)],
    nape=(0.1, 0.4), decimate=0.05)
SKELETON = PLAN.skel
SKELETON.joints['wound'] = ('head', (0.0, -0.1, 2.0))   # shown only as it is struck
SKELETON.order.append('wound')


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        # pale matte wood cut by crooked dark grooves
        'wood': hides.grooved('wood', (0.32, 0.22, 0.11), (0.4, 0.28, 0.14), (0.14, 0.09, 0.045), share=0.04,
                              distortion=8.0),
        'knot': materials.plain('knot', (0.12, 0.08, 0.04), rough=0.9, spec=0.2),
        'leaf': materials.speckle('leaf', (0.02, 0.08, 0.02), (0.08, 0.22, 0.05), scale=60.0, at=0.45, rough=0.5,
                                  metal=0.0),
        'hollow': materials.plain('hollow', (0.04, 0.025, 0.012), rough=0.8, spec=0.2),
        'blood': materials.plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    return mats


# colour classes in the reference (`ref_class`): 1 shadow, 2 the wood's tan, 3 the leaves' green
CLASS = {'wood': 2, 'leaf': 3}
GRADE_RGB = ('wood',)


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > g + 15) & (g > b + 15) & (r > 80)] = 2
    out[(g > r + 10) & (g > b + 10)] = 3
    return out


def _shard(name, a, b, face, width=0.04, depth=0.015, bend=0.0):
    """A flat shard of wood from `a` to `b`, broad across and thin toward `face`, tapering to its point, bowed `bend`
    metres down at its middle."""
    a, b = np.asarray(a, dtype=np.float64), np.asarray(b, dtype=np.float64)
    mid = (a + b) / 2 + np.array((0, 0, -bend))
    return tube(name, [tuple(a), tuple(mid), tuple(b)], [(0.0, width, depth, depth), (0.6, width * 0.65, depth * 0.7,
                                                                                        depth * 0.7),
                                                         (1.0, 0.004, 0.004, 0.004)], n=8, up=face, step=0.012)


def _sprig(name, at, out):
    """Two big leaves on a stem, opened toward `out`."""
    import bpy
    at, out = np.asarray(at, dtype=np.float64), np.asarray(out, dtype=np.float64)
    out = out / np.linalg.norm(out)
    side = np.cross(out, (0, 0, 1.0))
    side = side / max(np.linalg.norm(side), 1e-9)
    leaves = [blob(tuple(at + out * 0.08 + side * 0.05 * k + np.array((0, 0, 0.03))), (0.075, 0.012, 0.04),
                   along=tuple(out + side * k * 0.8)) for k in (-1, 1)]
    me = blob_mesh(name, leaves, res=0.01)
    stem = cone(f'{name}_stem', tuple(at), tuple(at + out * 0.06 + np.array((0, 0, 0.03))), 0.008, 0.006)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    so = bpy.data.objects.new(f'{name}_stem', stem)
    bpy.context.scene.collection.objects.link(so)
    with bpy.context.temp_override(active_object=ob, selected_editable_objects=[ob, so]):
        bpy.ops.object.join()
    return ob


def build(M):
    """The spriggan's meshes: (skins, rigid parts as (object, joint))."""
    body = shaggy(PLAN.build([M['wood']]), 0.008, 20.0, (1.0, 1.0, 0.4))   # knotted, uneven wood
    body.me.shade_flat()   # faceted: flat planes and crisp edges, as Daggerfall's wood is drawn
    skins, parts = [body], []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    # the face: a brow over two dark eye hollows, a long pointed chin; a crown of four twigs
    put(rigid('chin', blob_mesh('chin', [blob((0, -0.11, 1.74), (0.035, 0.035, 0.07))], res=0.008), M['wood']),
        'head', 'head')
    put(rigid('brow', blob_mesh('brow', [blob((0, -0.135, 1.93), (0.07, 0.02, 0.015))], res=0.006), M['wood']),
        'head', 'head')
    for x in (1, -1):
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.035 * x, -0.148, 1.9), (0.022, 0.012, 0.014))],
                                         res=0.004), M['hollow']), 'head', 'head')
        for k, (cx, cy, cz) in enumerate(((0.04, -0.06, 1.99), (0.08, -0.04, 1.95))):
            base = np.array((cx * x, cy, cz))
            lean = np.array((math.sin(math.radians(20)) * x, 0.0, math.cos(math.radians(20))))
            put(rigid(f'crown_{x}{k}', cone(f'crown_{x}{k}', tuple(base), tuple(base + lean * 0.1), 0.018, 0.003),
                      M['wood']), 'head', 'head')
        # two sharp shards a shoulder: one rising up and out, one jutting forward
        put(rigid(f'shard_up{x}', _shard(f'shard_up{x}', (0.2 * x, 0.0, 1.7), (0.32 * x, 0.0, 1.9), (0, 1, 0)),
                  M['wood']), 'chest', 'trunk')
        put(rigid(f'shard_fwd{x}', _shard(f'shard_fwd{x}', (0.22 * x, -0.05, 1.66), (0.25 * x, -0.32, 1.68),
                                          (0, 0, 1)), M['wood']), 'chest', 'trunk')
    for s, x in (('L', 1.0), ('R', -1.0)):
        # each hand a fan of four flat blades, broad across the palm; a spur back from each elbow; a knot at each knee
        w = np.array(rest(f'wrist_{s}')[:]) + np.array(PLAN.hand) * np.array((x, 1, 1))
        for k, dx in enumerate((-0.14, -0.05, 0.05, 0.14)):
            tip = w + np.array((dx * x, -0.06, -0.34))
            put(rigid(f'blade_{s}{k}', _shard(f'blade_{s}{k}', w, tip, (0, -1, 0), 0.03, 0.012, bend=-0.04),
                      M['wood']), f'wrist_{s}')
        el = np.array(rest(f'elbow_{s}')[:])
        put(rigid(f'spur_{s}', cone(f'spur_{s}', tuple(el), tuple(el + np.array((0.02 * x, 0.12, 0.01))), 0.025),
                  M['wood']), f'elbow_{s}')
        put(rigid(f'knot_{s}', blob_mesh(f'knot_{s}', [blob(rest(f'knee_{s}')[:], (0.05, 0.05, 0.05))], res=0.01),
                  M['knot']), f'knee_{s}')
    # the skirt: five broad shards before the hips, the middle one longest
    for k, length in enumerate((0.18, 0.24, 0.32, 0.24, 0.18)):
        a = -math.pi / 2 + math.pi * 0.25 * (k - 2) / 2
        out = np.array((math.cos(a), math.sin(a), 0.0))
        p = np.array((0.13 * math.cos(a), 0.09 * math.sin(a), 0.98))
        q = p + out * 0.04 + np.array((0, 0, -length))
        put(rigid(f'shard{k}', _shard(f'shard{k}', p, q, tuple(out), 0.04, 0.012), M['wood']), 'pelvis', 'trunk')
    put(rigid('sprig_head', _sprig('sprig_head', (0, -0.08, 1.97), (0.0, 0.0, 1.0)), M['leaf']), 'head', 'head')
    put(rigid('sprig_arm', _sprig('sprig_arm', (0.33, -0.02, 1.3), (1.0, 0.0, 0.3)), M['leaf']), 'elbow_L')
    put(rigid('sprig_knee_L', _sprig('sprig_knee_L', (0.15, -0.06, 0.62), (1.0, -0.3, 0.2)), M['leaf']), 'knee_L')
    put(rigid('sprig_knee_R', _sprig('sprig_knee_R', (-0.15, -0.06, 0.5), (-1.0, -0.3, 0.2)), M['leaf']), 'knee_R')
    # the wound: droplets flung up from the crown
    rng = np.random.default_rng(257)
    drops = [blob((rng.uniform(-0.08, 0.08), -0.1 + rng.uniform(-0.04, 0.06), 2.02 + rng.uniform(0.0, 0.25)),
                  (r, r, r)) for r in rng.uniform(0.012, 0.02, 16)]
    put(rigid('blood', blob_mesh('blood', drops, res=0.005), M['blood']), 'wound', 'head')
    return skins, parts


def walk(frame, n=4):
    rot = PLAN.walk(frame / n, hip=22, knee=40, arm=14, elbow=25)
    for s in 'LR':
        rot[f'knee_{s}'] = (rot[f'knee_{s}'][0] + 12, 0, 0)   # it walks stooped, its knees never straight
        rot[f'hip_{s}'] = (rot[f'hip_{s}'][0] - 16, 0, 0)
    rot.update({'pelvis': (10, 0, 0), 'chest': (15, 0, 0), 'neck': (10, 0, 0), 'head': (-4, 0, 0)})
    for s, x in (('L', 1.0), ('R', -1.0)):
        sh = rot[f'shoulder_{s}']
        rot[f'shoulder_{s}'] = (sh[0] - 10, -16 * x, 0)   # its long arms held out, the elbows wide
        rot[f'elbow_{s}'] = (-35, 0, 10 * x)
    return rot, None, 0.0, {'wound': 0.0}


# the rake over its five frames: the right arm raised high, held, then raked down across and through
RAKE = [(-165, 20), (-170, 10), (-110, -15), (-60, -40), (-20, -20)]   # the right arm's raise and swing across


def attack(frame, n=5):
    rot, _, _, _ = walk(0, 4)
    rot.update(PLAN.walk(0.0, 0.2))
    raise_, across = RAKE[frame]
    rot.update({'shoulder_R': (raise_, 0, across), 'elbow_R': (-25, 0, 0), 'chest': (8 + frame * 3, 0, -6 * frame),
                'shoulder_L': (-20, 0, 15), 'elbow_L': (-50, 0, 0)})
    return rot, None, 0.0, {'wound': 0.0}


def hurt(frame, n=1):
    # it throws both arms up, the elbows bent and out and the blades up, and kicks its left leg forward
    rot, _, _, _ = walk(0, 4)
    rot.update({'chest': (-15, 0, 8), 'neck': (-10, 0, 0), 'head': (-20, 0, 10), 'shoulder_L': (-150, -25, 0),
                'shoulder_R': (-150, 25, 0), 'elbow_L': (-80, 0, 0), 'elbow_R': (-80, 0, 0), 'hip_L': (-55, 0, 0),
                'knee_L': (25, 0, 0)})
    return rot, ['ankle_R'], 0.0, {'wound': 1.0}


def idle(frame, n=1):
    # it waits in a stride, its right arm held out level ahead
    rot, _, _, _ = walk(0, 4)
    rot.update(PLAN.walk(0.0, 0.8, elbow=25))
    rot.update({'shoulder_R': (-85, 0, 10), 'elbow_R': (-15, 0, 0)})
    return rot, None, 0.0, {'wound': 0.0}


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt, 'idle': idle}


def pose_for(anim, frame, yaw, adj=None):
    rot, planted, lift, scales = ANIMS[anim](frame)
    return PLAN.pose(rot, planted, lift, yaw, adj, scales)


PARAMS = {a: [q for q in PLAN.params() if q[0] != 'jaw'] for a in ANIMS}
