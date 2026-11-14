"""A four-legged beast's body plan for the beast forge (the sabretooth tiger, the grizzly bear): a spine of pelvis,
spine, chest, neck and head with a jaw, four legs of three bones each, and a tail on bones of its own. A creature
gives its tables - where its joints stand, its trunk's, head's and legs' sections - and gets its skeleton, its fused
skin and skinned tail, its grounding and its walk.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the beast faces -Y): a limb hanging down
swings forward on -X; a trunk, neck or head pitches nose-down on +X; the tail rises on +X."""
import math

import numpy as np
from mathutils import Vector

from beastkit import Piece, Pose, Skeleton, Skin, buried, chain_weights, fuse, tube, weights_over
from body import ramp

SPINE = ('pelvis', 'spine', 'chest', 'neck', 'head')
FORE, HIND = ('shoulder', 'elbow', 'wrist'), ('hip', 'knee', 'hock')


class Quadruped:
    """`spine`: each of SPINE's joints and the jaw, {name: (y, z)}. `legs`: the left side's leg joints, {name: (x, y, z)}
    (the right is its mirror). `tail`: (bones, the first bone's (y, z), each bone's step back and drop, its radius at
    the root and the tip). `paw`, `toe`: a forepaw's and a hind foot's tip from its wrist or hock. `trunk`, `head`:
    (path, section rows), as beastkit.tube takes them; `fore`, `hind`: a leg's section rows. `nape`: the shares of
    the way back over which the head hands its weight to the neck."""

    def __init__(self, spine, legs, tail, paw, toe, trunk, head, fore, hind, nape, tail_from, decimate=None):
        self.decimate = decimate   # the share of the fused skin's remeshed faces kept (beastkit.fuse)
        self.n_tail, (ty, tz), (self.step, self.drop), self.tail_r = tail[0], tail[1], tail[2], tail[3]
        self.paw, self.toe, self.trunk, self.head, self.fore, self.hind, self.nape = paw, toe, trunk, head, fore, hind, nape
        joints = {'root': (None, (0.0, 0.0, 0.0))}
        parent = 'root'
        for j in SPINE:
            joints[j] = (parent, (0.0, *spine[j]))
            parent = j
        joints['jaw'] = ('head', (0.0, *spine['jaw']))
        for k in range(self.n_tail):
            joints[f'tail_{k}'] = ('pelvis' if k == 0 else f'tail_{k - 1}',
                                   (0.0, ty + self.step * k, tz - self.drop * k))
        for s, x in (('L', 1.0), ('R', -1.0)):
            for chain, top in ((FORE, 'chest'), (HIND, 'pelvis')):
                for j in chain:
                    lx, ly, lz = legs[j]
                    joints[f'{j}_{s}'] = (top, (lx * x, ly, lz))
                    top = f'{j}_{s}'
        self.skel = Skeleton(joints)
        self.tail_from = tail_from
        self.body_joints = list(SPINE) + [f'{j}_{s}' for s in 'LR' for j in FORE + HIND]
        self.tail_joints = ['pelvis'] + [f'tail_{k}' for k in range(self.n_tail)]
        self.soles = {f'wrist_{s}': [Vector((0, paw[1], paw[2] - 0.02))] for s in 'LR'}
        self.soles.update({f'hock_{s}': [Vector((0, 0, toe[2] + 0.01)), Vector((0, toe[1], toe[2] - 0.02))]
                           for s in 'LR'})

    def rest(self, j):
        return self.skel.rest(j)

    def leg_points(self, s, kind):
        """A leg's chain of points, from inside the trunk above its top joint to its toes."""
        x = 1.0 if s == 'L' else -1.0
        top, mid, low = (self.rest(f'{j}_{s}') for j in (FORE if kind == 'fore' else HIND))
        tip = self.paw if kind == 'fore' else self.toe
        inward = 0.04 if kind == 'fore' else 0.05
        return [top + Vector((-inward * x, 0, 0.1)), top, mid, low, low + Vector((tip[0] * x, tip[1], tip[2]))]

    def head_weights(self, p):
        neck = ramp(p[:, 1], *self.nape)
        return weights_over(self.body_joints, ['neck', 'head'], np.stack([neck, 1 - neck], axis=1))

    def build(self, mats, extra=(), pick=None):
        """The fused skin of trunk, head and legs (and any `extra` pieces), and the tail skinned on its bones. `pick`
        gives a face its slot among `mats` from its centre and its shares of the pieces (trunk, head, then the legs)."""
        j = self.body_joints
        bones = [self.rest(n)[:] for n in SPINE]
        (tpath, trows), (hpath, hrows) = self.trunk, self.head
        pieces = [Piece('trunk', tube('trunk', tpath, trows, n=44),
                        lambda p: weights_over(j, list(SPINE[:4]), chain_weights(p, bones, 0.15)), tpath,
                        rows=[r[0] for r in trows]),
                  Piece('head', tube('head', hpath, hrows, n=36), self.head_weights, hpath,
                        size=('head_s', self.rest('head')[:]))]
        for s in 'LR':
            for kind, rows, chain in (('fore', self.fore, FORE), ('hind', self.hind, HIND)):
                pts = [p[:] for p in self.leg_points(s, kind)]
                bj = [f'{n}_{s}' for n in chain]
                top = 'chest' if kind == 'fore' else 'pelvis'
                pieces.append(Piece(f'{kind}_{s}', tube(f'{kind}_{s}', pts, buried(rows), n=24, up=(0, -1, 0)),
                                    lambda p, pts=pts, bj=bj, top=top: weights_over(
                                        j, [top] + bj, chain_weights(p, pts, 0.05)), pts))
        pieces += list(extra)
        body = fuse(self.skel, 'body', pieces, j, mats, pick=pick, decimate=self.decimate)
        last = self.rest(f'tail_{self.n_tail - 1}')
        pts = [self.tail_from] + [self.rest(f'tail_{k}')[:] for k in range(self.n_tail)] + [
            (0.0, last.y + self.step, last.z - self.drop)]
        r0, r1 = self.tail_r
        rows = [(t, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t) for t in np.linspace(0, 1, 6)]
        me = tube('tail', pts, rows, n=14)
        bones_t = [self.rest('pelvis')[:]] + pts[1:]
        tail = Skin(self.skel, 'tail', me, mats[0], self.tail_joints,
                    chain_weights(np.array([v.co[:] for v in me.vertices]), bones_t, 0.08))
        tail.pieces = [Piece('tail', None, None, bones_t)]
        return body, tail

    def grounded(self, p, joints=None):
        """Lower or lift the root so the lowest of the soles (or of `joints`' soles) touches the ground."""
        W = p.world()
        p.root_loc.z -= min((W[j] @ q).z for j, qs in self.soles.items() if joints is None or j in joints for q in qs)
        return p

    def tail_pose(self, droop, lift=0.0, sway=0.0):
        """The tail's bones: its root lifted `lift` degrees, each bone after it drooped `droop` (down, +)."""
        out = {'tail_0': (lift, 0, sway)}
        for k in range(1, self.n_tail):
            out[f'tail_{k}'] = (-droop, 0, sway * 0.5)
        return out

    @staticmethod
    def walk_legs(phase, stride=1.0, fore=(22, 30, 25), hind=(20, 15, 25, 8), lag=0.25):
        """The walk: each foot forward through half the cycle and back on the ground through the other, the near hind
        leg `lag` of a cycle behind its fore leg. `fore`: the shoulder's swing, the elbow's and wrist's fold; `hind`: the
        hip's swing, the knee's fold, the hock's fold and its swing."""
        rot = {}
        for s, off in (('L', 0.0), ('R', 0.5)):
            for kind, extra in (('fore', 0.0), ('hind', lag)):
                ph = 2 * math.pi * (phase + off + extra)
                swing, lift = math.cos(ph) * stride, max(0.0, math.sin(ph)) * stride
                if kind == 'fore':
                    rot[f'shoulder_{s}'] = (-fore[0] * swing, 0, 0)
                    rot[f'elbow_{s}'] = (fore[1] * lift, 0, 0)
                    rot[f'wrist_{s}'] = (-fore[2] * lift, 0, 0)
                else:
                    rot[f'hip_{s}'] = (-hind[0] * swing, 0, 0)
                    rot[f'knee_{s}'] = (-hind[1] * lift, 0, 0)
                    rot[f'hock_{s}'] = (hind[2] * lift - hind[3] * swing, 0, 0)
        return rot

    def pose(self, rot, planted, lift, yaw, adj):
        """A keyed pose with its fitted adjustment (beastfit.py) added: grounded on its planted soles, then lifted."""
        adj = adj or {}
        for j, d in adj.get('rot', {}).items():
            rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
        p = Pose(self.skel, rot, yaw=yaw + adj.get('turn', 0.0))
        self.grounded(p, planted)
        p.root_loc.z += lift + adj.get('lift', 0.0)
        return p

    def params(self, tail_bones=(0, 2, 4)):
        """What the fit may turn: the spine, the jaw, each leg, and the tail's `tail_bones`."""
        trunk = [('pelvis', 0, 5), ('pelvis', 1, 4), ('pelvis', 2, 5), ('spine', 0, 5), ('spine', 2, 5),
                 ('chest', 0, 5), ('chest', 2, 5), ('neck', 0, 7), ('neck', 2, 7), ('head', 0, 7), ('head', 1, 6),
                 ('head', 2, 7), ('jaw', 0, 8)]
        legs = [p for s in 'LR' for p in [(f'shoulder_{s}', 0, 8), (f'shoulder_{s}', 1, 5), (f'elbow_{s}', 0, 10),
                                          (f'wrist_{s}', 0, 10), (f'hip_{s}', 0, 8), (f'hip_{s}', 1, 5),
                                          (f'knee_{s}', 0, 10), (f'hock_{s}', 0, 10)]]
        return trunk + legs + [(f'tail_{k}', a, 10) for k in tail_bones for a in (0, 2)]
