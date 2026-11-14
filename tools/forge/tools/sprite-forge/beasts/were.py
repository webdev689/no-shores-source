"""The were-creatures' shared body (the werewolf, the wereboar): a hunched beast-man near two metres tall on the
two-legged plan (biped.py), its head sunk between heavy shoulders, running on broad clawed paws with its hocks
raised, long arms ending in clawed hands, a shaggy mane from its crown over its shoulders and down its back, and a
low tail. A creature module gives its head - the path and rows of its face, its ears, its teeth or tusks, where its
eyes sit, its tail - and its coat; `Were` gives the rest.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; it faces -Y): a limb hanging down swings
forward on -X and a knee bends on +X; the trunk, neck or head pitches forward on +X."""
import math

import numpy as np

import hides
import materials
from beastkit import cone, hang, rigid, roughen, shaggy, tube
from biped import Biped
from body import blob, blob_mesh

LIMBS = {'hip': (0.2, 0.0, 1.0), 'knee': (0.23, -0.15, 0.68), 'ankle': (0.25, 0.12, 0.38),
         'shoulder': (0.3, -0.08, 1.62), 'elbow': (0.44, -0.02, 1.26), 'wrist': (0.45, -0.12, 0.95)}
SPINE = {'pelvis': (0.0, 1.05), 'spine': (-0.03, 1.28), 'chest': (-0.08, 1.5), 'neck': (-0.14, 1.64),
         'head': (-0.2, 1.75), 'jaw': (-0.3, 1.67)}
TRUNK = ([(0, 0.03, 0.9), (0, 0.0, 1.05), (0, -0.03, 1.28), (0, -0.08, 1.5), (0, -0.14, 1.7)],
         [(0.0, 0.14, 0.1, 0.1), (0.15, 0.19, 0.12, 0.13), (0.4, 0.17, 0.12, 0.12), (0.7, 0.27, 0.17, 0.16),
          (0.88, 0.33, 0.17, 0.16), (1.0, 0.11, 0.1, 0.1)])
LEG = [(0.0, 0.11, 0.11, 0.11), (0.3, 0.085, 0.085, 0.085), (0.45, 0.06, 0.06, 0.06), (0.7, 0.045, 0.045, 0.045),
       (0.8, 0.05, 0.05, 0.05), (1.0, 0.05, 0.02, 0.02)]
ARM = [(0.0, 0.11, 0.11, 0.11), (0.3, 0.085, 0.085, 0.085), (0.5, 0.065, 0.065, 0.065), (0.75, 0.06, 0.06, 0.06),
       (0.88, 0.055, 0.055, 0.055), (1.0, 0.035, 0.03, 0.03)]


def coat(dark, mane_dark, mane_light, extra=None):
    """A were-creature's materials: its fur (smooth, barely mottled: its muscles shade it), its lighter streaked
    mane, claws, red eyes in dark sockets, grey teeth, and any `extra` of the creature's own."""
    mats = {
        'fur': hides.hide('fur', dark, tuple(c * 1.8 for c in dark), mottle=10.0, grain=45.0, grain_share=0.35,
                          soft=0.2, relief=0.5, relief_scale=45.0, rough=0.85, spec=0.2, stretch=(1.0, 0.7, 0.6)),
        'mane': hides.hide('mane', mane_dark, mane_light, mottle=10.0, grain=55.0, grain_share=0.5, relief=0.5,
                           relief_scale=45.0, rough=0.85, spec=0.2, stretch=(1.0, 0.4, 0.6)),   # streaked locks
        'claw': materials.plain('claw', (0.03, 0.025, 0.02), rough=0.3, spec=0.6),
        'eye': materials.plain('eye', (0.4, 0.008, 0.0), rough=0.2, spec=0.7),
        'tooth': materials.plain('tooth', (0.35, 0.34, 0.31), rough=0.3, spec=0.6),
        'mouth': materials.plain('mouth', (0.18, 0.03, 0.03), rough=0.5, spec=0.3),
        'blood': materials.plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
        **(extra or {}),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    b = mats['eye'].node_tree.nodes['Principled BSDF']
    b.inputs['Emission Color'].default_value = (0.5, 0.01, 0.0, 1)
    b.inputs['Emission Strength'].default_value = 2.0
    return mats


# colour classes in the reference (`ref_class`): 1 shadow, 2 the fur's brown, 3 the mane's lit tan, 4 the teeth
CLASS = {'fur': 2, 'mane': 3, 'tooth': 4}
GRADE_RGB = ('fur', 'mane')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    lo, hi = np.minimum(np.minimum(r, g), b), np.maximum(np.maximum(r, g), b)
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > g + 15) & (g > b + 5) & (r > 60)] = 2
    out[(r > 150) & (g > 95) & (r > b + 60)] = 3
    out[(lo > 85) & (hi - lo < 30) & (lo < 160)] = 4
    return out


class Were:
    """A were-creature: the shared body with the head a creature module gives. `head` is (path, rows) for the plan's
    head piece; `ears(put, M)` and `teeth(put, M)` hang its own parts; `eyes` is the left eye's place on the face and
    `tail` (path, root radius) its tail."""

    def __init__(self, head, ears, teeth, eyes, tail):
        self.plan = Biped(spine=SPINE, limbs=LIMBS, foot=(0.0, -0.16, -0.36), hand=(0.0, -0.05, -0.14), trunk=TRUNK,
                          head=head, leg=LEG, arm=ARM, nape=(0.05, 0.3), decimate=0.08)
        self.skel = self.plan.skel
        self.skel.joints['wound'] = ('head', (0.0, -0.28, 1.9))
        self.skel.order.append('wound')
        self.ears, self.teeth, self.eyes, self.tail = ears, teeth, eyes, tail

    def build(self, M):
        skins, parts = [shaggy(self.plan.build([M['fur']]), 0.012, 25.0, (1.0, 0.7, 0.6))], []
        skel = self.skel

        def put(ob, joint, rides=None):
            hang(parts, skel, ob, joint, rides)
        self.ears(put, M)
        self.teeth(put, M)
        ex, ey, ez = self.eyes
        for x in (1, -1):   # red eyes set in dark sockets on the face
            put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((ex * x, ey - 0.005, ez), (0.022, 0.02, 0.02))],
                                             res=0.004), M['eye']), 'head', 'head')
            put(rigid(f'socket_{x}', blob_mesh(f'socket_{x}', [blob((ex * x, ey + 0.008, ez), (0.025, 0.02, 0.025))],
                                                res=0.004), M['mouth']), 'head', 'head')
        self._mane(put, M)
        # heavy trapezius muscles raising the shoulders round the neck
        put(rigid('traps', blob_mesh('traps', [blob((0.15 * x, 0.0, 1.68), (0.14, 0.1, 0.07)) for x in (1, -1)],
                                     res=0.012), M['fur']), 'chest', 'trunk')
        path, r0 = self.tail   # the tail, low, leaving the rump nearly level and curling down at its tip
        put(rigid('tail', tube('tail', path, [(0.0, r0, r0, r0), (1.0, r0 * 0.4, r0 * 0.4, r0 * 0.4)], n=8,
                               up=(1, 0, 0), step=0.015), M['fur']), 'pelvis', 'trunk')
        for s, x in (('L', 1.0), ('R', -1.0)):
            self._hand(put, M, s, x)
            self._paw(put, M, s, x)
        # the wound: a column of droplets flung up from the head
        w = np.array(skel.rest('wound')[:])
        drops = [blob(tuple(w + np.array((0.015 * math.sin(5 * k), 0.13 * t, 0.3 * t))), (0.02 - 0.008 * t,) * 3)
                 for k, t in enumerate(np.linspace(0, 1, 14))]
        put(rigid('blood', blob_mesh('blood', drops, res=0.005), M['blood']), 'wound', 'head')
        return skins, parts

    def _mane(self, put, M):
        """The mane: a heavy, shaggy mass from the crown over the nape, spread wide over the shoulders and down the
        upper back, in clumps that ride the joints under them; a ruff round the face, seen from before."""
        clumps = {'head': [], 'neck': [], 'chest': [], 'spine': []}
        for k in range(16):
            t = k / 15
            y, z = -0.18 + 0.34 * t, 1.86 - 0.58 * t
            wide = 0.09 + 0.14 * math.sin(math.pi * min(1.0, t * 1.6))   # broadest over the shoulders
            joint = 'head' if k < 3 else 'neck' if k < 6 else 'chest' if k < 11 else 'spine'
            clumps[joint].append(blob((0.0, y + 0.06, z), (wide, 0.09, 0.07)))
        for x in (1, -1):   # the ruff: clumps at the cheeks and the throat
            clumps['head'] += [blob((0.11 * x, -0.21, 1.72), (0.06, 0.06, 0.08)),
                               blob((0.07 * x, -0.25, 1.64), (0.05, 0.05, 0.06))]
        for joint, blobs in clumps.items():
            me = roughen(blob_mesh(f'mane_{joint}', blobs, res=0.012), 0.025, 18.0, (1.0, 0.5, 1.0))
            put(rigid(f'mane_{joint}', me, M['mane']), joint, 'trunk' if joint != 'head' else 'head')

    def _hand(self, put, M, s, x):
        """A broad hand: a palm and four fingers fanned, each ending in a claw hooked down."""
        tip = np.array(self.plan.rest(f'wrist_{s}')[:]) + np.array((self.plan.hand[0] * x, *self.plan.hand[1:]))
        joint = f'wrist_{s}'
        put(rigid(f'palm_{s}', blob_mesh(f'palm_{s}', [blob(tuple(tip), (0.06, 0.04, 0.03))], res=0.006), M['fur']),
            joint)
        for k, a in enumerate((-25, -8, 8, 25)):
            d = np.array((math.sin(math.radians(a)) * x, -0.35, -math.cos(math.radians(a))))
            d /= np.linalg.norm(d)
            knuckle = tip + d * 0.09
            put(rigid(f'finger_{s}{k}', cone(f'finger_{s}{k}', tuple(tip), tuple(knuckle), 0.018, 0.014), M['fur']),
                joint)
            put(rigid(f'claw_{s}{k}', cone(f'claw_{s}{k}', tuple(knuckle), tuple(knuckle + d * 0.03 + (0, -0.02, -0.035)),
                                           0.012, 0.002), M['claw']), joint)

    def _paw(self, put, M, s, x):
        """A big flat paw on the ground, reaching forward of the foot's tip, with four toe claws."""
        tip = np.array(self.plan.rest(f'ankle_{s}')[:]) + np.array((self.plan.foot[0] * x, *self.plan.foot[1:]))
        joint = f'ankle_{s}'
        centre = tip + np.array((0.0, -0.06, 0.0))
        put(rigid(f'paw_{s}', blob_mesh(f'paw_{s}', [blob(tuple(centre), (0.08, 0.12, 0.03))], res=0.01), M['fur']),
            joint)
        for k, dx in enumerate((-0.06, -0.02, 0.02, 0.06)):
            root = centre + np.array((dx, -0.1, -0.005))
            put(rigid(f'toe_{s}{k}', cone(f'toe_{s}{k}', tuple(root), tuple(root + (dx * 0.3, -0.06, -0.02)), 0.012,
                                          0.002), M['claw']), joint)

    def _hunch(self, rot):
        rot.update({'pelvis': (25, 0, 0), 'spine': (10, 0, 0), 'chest': (10, 0, 0), 'neck': (-22, 0, 0),
                    'head': (-14, 0, 0), 'jaw': (12, 0, 0)})
        return rot

    LOPE = [0.0, 0.14, 0.0, 0.14]   # its lope leaves the ground between the strides

    def walk(self, frame, n=4):
        """Its lope: long strides on its toes, the arms swung low and forward, planted with its feet apart and
        airborne between the strides (the frames with the feet together)."""
        rot = self._hunch(self.plan.walk(frame / n, hip=32, knee=50, ankle=20, arm=24, elbow=30))
        for s in 'LR':
            rot[f'hip_{s}'] = (rot[f'hip_{s}'][0] - 20, 0, 0)
            rot[f'shoulder_{s}'] = (rot[f'shoulder_{s}'][0] - 25, 0, 0)
        return rot, None, self.LOPE[frame % 4], {'wound': 0.0}

    # the swipe over its three frames: the left arm flung up high and raked down, the right held low; the jaws open
    # wide. Each arm's raise and elbow's bend, frame by frame
    SWIPE_L = [(-120, -60), (-175, -30), (-40, -20)]
    SWIPE_R = [(-20, -30), (-30, -30), (-50, -20)]
    JAW = [35, 45, 25]

    def attack(self, frame, n=3):
        # planted on both feet, crouched
        rot, _, _, _ = self.walk(0, 4)
        rot.update(self.plan.walk(0.0, 0.0))
        for s, x, keys in (('L', 1.0, self.SWIPE_L), ('R', -1.0, self.SWIPE_R)):
            raise_, elbow = keys[frame]
            rot.update({f'shoulder_{s}': (raise_, -15 * x, 0), f'elbow_{s}': (elbow, 0, 0),
                        f'hip_{s}': (-35, 0, 0), f'knee_{s}': (55, 0, 0)})
        rot.update({'pelvis': (15, 0, 0), 'jaw': (self.JAW[frame], 0, 0)})
        return rot, [f'ankle_{s}' for s in 'LR'], 0.0, {'wound': 0.0}

    def hurt(self, frame, n=1):
        # both arms flung up to its head, the elbows out and the claws up, its head thrown back
        rot, _, _, _ = self.walk(1, 4)
        rot.update({'pelvis': (5, 0, 0), 'chest': (-10, 0, 8), 'neck': (-20, 0, 10), 'head': (-35, 0, 0),
                    'jaw': (30, 0, 0), 'shoulder_L': (-140, -20, 0), 'shoulder_R': (-140, 20, 0),
                    'elbow_L': (-85, 0, 0), 'elbow_R': (-85, 0, 0)})
        return rot, None, 0.0, {'wound': 1.0}

    def anims(self):
        return {'walk': self.walk, 'attack': self.attack, 'hurt': self.hurt}

    def pose_for(self, anim, frame, yaw, adj=None):
        rot, planted, lift, scales = self.anims()[anim](frame)
        return self.plan.pose(rot, planted, lift, yaw, adj, scales)

    def params(self):
        return {a: self.plan.params() for a in self.anims()}
