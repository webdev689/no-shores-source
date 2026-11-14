"""A two-legged beast's body plan for the beast forge (the gargoyle): a spine of pelvis, spine, chest, neck and head
with a jaw, two legs and two arms of three bones each, fused into one skin. A creature gives its tables - where its
joints stand, its trunk's, head's and limbs' sections - and gets its skeleton, its fused skin, its grounding, its walk
and what the fit may turn.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the beast faces -Y): a limb hanging down
swings forward on -X and a knee bends on +X; the trunk, neck or head pitches forward on +X."""
import math

import numpy as np
from mathutils import Vector

from beastkit import Piece, Pose, Skeleton, buried, chain_place, chain_weights, fuse, tube, weights_over
from body import ramp

SPINE = ('pelvis', 'spine', 'chest', 'neck', 'head')
LEG, ARM = ('hip', 'knee', 'ankle'), ('shoulder', 'elbow', 'wrist')


class Biped:
    """`spine`: each of SPINE's joints and the jaw, {name: (y, z)}. `limbs`: the left side's leg and arm joints,
    {name: (x, y, z)} (the right is its mirror). `foot`, `hand`: the toes' and the fingers' tip from the ankle and
    the wrist. `trunk`, `head`: (path, section rows) as beastkit.tube takes them, the trunk's rows (t, half width,
    front, back); `leg`, `arm`: a limb's rows. `nape`: the shares of the head's path over which it hands its weight to
    the neck. `decimate` is the share of the fused skin's remeshed faces kept (beastkit.fuse)."""

    def __init__(self, spine, limbs, foot, hand, trunk, head, leg, arm, nape, decimate=None):
        self.foot, self.hand, self.trunk, self.head, self.leg, self.arm, self.nape = (foot, hand, trunk, head, leg,
                                                                                       arm, nape)
        self.decimate = decimate
        joints = {'root': (None, (0.0, 0.0, 0.0))}
        parent = 'root'
        for j in SPINE:
            joints[j] = (parent, (0.0, *spine[j]))
            parent = j
        joints['jaw'] = ('head', (0.0, *spine['jaw']))
        for s, x in (('L', 1.0), ('R', -1.0)):
            for chain, top in ((LEG, 'pelvis'), (ARM, 'chest')):
                for j in chain:
                    lx, ly, lz = limbs[j]
                    joints[f'{j}_{s}'] = (top, (lx * x, ly, lz))
                    top = f'{j}_{s}'
        self.skel = Skeleton(joints)
        self.body_joints = list(SPINE) + [f'{j}_{s}' for s in 'LR' for j in LEG + ARM]
        # each foot stands on its heel, under the ankle a little behind, and its toes
        self.soles = {f'ankle_{s}': [Vector((0, 0.05, foot[2])), Vector((0, foot[1], foot[2]))] for s in 'LR'}

    def rest(self, j):
        return self.skel.rest(j)

    def limb_points(self, s, kind):
        """A limb's chain of points, from inside the trunk by its top joint to its toes or fingertips."""
        x = 1.0 if s == 'L' else -1.0
        top, mid, low = (self.rest(f'{j}_{s}') for j in (LEG if kind == 'leg' else ARM))
        tip = self.foot if kind == 'leg' else self.hand
        inside = Vector((-0.04 * x, 0, 0.08)) if kind == 'leg' else Vector((-0.07 * x, 0, -0.02))
        return [top + inside, top, mid, low, low + Vector((tip[0] * x, tip[1], tip[2]))]

    def head_weights(self, p):
        """The head's points go with the neck at its root and the head past the nape's shares of its path."""
        path = np.asarray(self.head[0], dtype=np.float64)
        at, _ = chain_place(p, path)
        share = at / np.linalg.norm(np.diff(path, axis=0), axis=1).sum()
        head = ramp(share, *self.nape)
        return weights_over(self.body_joints, ['neck', 'head'], np.stack([1 - head, head], axis=1))

    def build(self, mats, extra=(), pick=None):
        """The fused skin of trunk, head and limbs (and any `extra` pieces). `pick` gives a face its slot among `mats`
        from its centre and its shares of the pieces (trunk, head, then the legs and arms)."""
        j = self.body_joints
        bones = [self.rest(n)[:] for n in SPINE]
        (tpath, trows), (hpath, hrows) = self.trunk, self.head
        pieces = [Piece('trunk', tube('trunk', tpath, trows, n=36, up=(0, -1, 0)),
                        lambda p: weights_over(j, list(SPINE[:4]), chain_weights(p, bones, 0.08)), tpath,
                        rows=[r[0] for r in trows]),
                  Piece('head', tube('head', hpath, hrows, n=32), self.head_weights, hpath,
                        size=('head_s', self.rest('head')[:]))]
        for s in 'LR':
            for kind, rows, chain, top in (('leg', self.leg, LEG, 'pelvis'), ('arm', self.arm, ARM, 'chest')):
                pts = [p[:] for p in self.limb_points(s, kind)]
                bj = [f'{n}_{s}' for n in chain]
                pieces.append(Piece(f'{kind}_{s}', tube(f'{kind}_{s}', pts, buried(rows), n=20, up=(0, -1, 0)),
                                    lambda p, pts=pts, bj=bj, top=top: weights_over(
                                        j, [top] + bj, chain_weights(p, pts, 0.05)), pts))
        pieces += list(extra)
        return fuse(self.skel, 'body', pieces, j, mats, pick=pick, decimate=self.decimate)

    def grounded(self, p, joints=None):
        """Lower or lift the root so the lowest of the soles (or of `joints`' soles) touches the ground."""
        W = p.world()
        p.root_loc.z -= min((W[j] @ q).z for j, qs in self.soles.items() if joints is None or j in joints for q in qs)
        return p

    @staticmethod
    def walk(phase, stride=1.0, hip=24, knee=40, ankle=15, arm=16, elbow=20):
        """The walk: each foot forward through half the cycle, lifted with its knee bent, and back on the ground
        through the other; each arm swung against its leg, its elbow bent."""
        rot = {}
        for s, off in (('L', 0.0), ('R', 0.5)):
            ph = 2 * math.pi * (phase + off)
            swing, lift = math.cos(ph) * stride, max(0.0, math.sin(ph)) * stride
            rot[f'hip_{s}'] = (-hip * swing - knee * 0.3 * lift, 0, 0)
            rot[f'knee_{s}'] = (knee * lift, 0, 0)
            rot[f'ankle_{s}'] = (-ankle * lift, 0, 0)
            rot[f'shoulder_{s}'] = (arm * swing, 0, 0)
            rot[f'elbow_{s}'] = (-elbow, 0, 0)
        return rot

    def pose(self, rot, planted, lift, yaw, adj, scales=None):
        """A keyed pose with its fitted adjustment (beastfit.py) added: grounded on its planted soles, then lifted."""
        adj = adj or {}
        for j, d in adj.get('rot', {}).items():
            rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
        p = Pose(self.skel, rot, yaw=yaw + adj.get('turn', 0.0), scales=scales)
        self.grounded(p, planted)
        p.root_loc.z += lift + adj.get('lift', 0.0)
        return p

    def params(self):
        """What the fit may turn: the spine, the jaw, each leg and each arm."""
        trunk = [('pelvis', 0, 5), ('pelvis', 1, 4), ('pelvis', 2, 5), ('spine', 0, 5), ('chest', 0, 5),
                 ('chest', 2, 5), ('neck', 0, 7), ('head', 0, 7), ('head', 2, 7), ('jaw', 0, 8)]
        limbs = [p for s in 'LR' for p in [(f'hip_{s}', 0, 8), (f'hip_{s}', 1, 5), (f'knee_{s}', 0, 10),
                                           (f'ankle_{s}', 0, 8), (f'shoulder_{s}', 0, 10), (f'shoulder_{s}', 1, 8),
                                           (f'elbow_{s}', 0, 10)]]
        return trunk + limbs
