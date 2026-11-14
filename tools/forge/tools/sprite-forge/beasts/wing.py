"""A membrane wing for the beast forge's flyers (the giant bat, the dragonling): an arm of humerus and forearm, a hand
of long fingers fanned from the wrist, and a membrane stretched from the fingertips back to the body and the leg. The
membrane is skinned to the bones at its corners, scalloped between the fingertips and bellied between its bones, so it
bends as the fingers spread and fold and reads as a band, not a line, seen edge on."""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix

from beastkit import Piece, Skin, rigid, tube


class Wing:
    """The left wing's rest points (the right mirrors them): `shoulder`, `elbow`, `wrist`, the fingers' `tips` and the
    membrane's root on the body (`hip`) and on the leg (`foot`). `body` and `leg` name the joints the root rides;
    `camber` is how far the membrane sags between its bones at most (metres). `bone_r` are the radii at the shoulder,
    the elbow, the wrist, a finger's root and its tip; `step` the bones' ring spacing, about half a pixel at the
    nearest size the creature is drawn. With `faces_up` every face of the membrane faces up at rest, so a material can
    tell its upper side from its under side (the harpy's feathers); `faces` names another way for them to face, for a
    wing carried upright (the gargoyle's faces back). `prefix` starts its joints' names, for a creature
    whose arms already take `shoulder_L` and the rest (the gargoyle's `wing_`). `bare` is the share of each finger
    that runs on past the membrane, and `bend` how far (degrees) its last third curves back toward the trailing edge.
    `serrate` cuts the trailing edges into feather tips: every other point along them pulled that far (metres) in."""

    def __init__(self, shoulder, elbow, wrist, tips, hip, foot, body='body', leg='leg', camber=0.09, scallop=0.16,
                 bone_r=(0.035, 0.025, 0.02, 0.016, 0.005), step=0.006, faces_up=False,
                 prefix='', bare=0.0, bend=0.0, serrate=0.0, faces=None):
        self.shoulder, self.elbow, self.wrist = shoulder, elbow, wrist
        self.tips, self.hip, self.foot = list(tips), hip, foot
        self.body, self.leg, self.camber, self.scallop, self.bone_r = body, leg, camber, scallop, bone_r
        self.step, self.prefix = step, prefix
        self.faces = faces if faces is not None else ((0.0, 0.0, 1.0) if faces_up else None)
        self.bare, self.bend, self.serrate = bare, bend, serrate

    def corner(self, k):
        """Where the membrane meets finger `k` (the left wing's): its tip, or short of it by the bare share."""
        w, t = np.array(self.wrist), np.array(self.tips[k])
        return tuple(w + (t - w) * (1.0 - self.bare))

    def finger_path(self, k):
        """Finger `k`'s bone (the left wing's): straight from the wrist, its last third curving `bend` back."""
        w, t = np.array(self.wrist), np.array(self.tips[k])
        if not self.bend:
            return [tuple(w), tuple(t)]
        knee = w + (t - w) * (2.0 / 3.0)
        a = math.radians(self.bend)
        d = t - knee
        bent = knee + np.array((d[0] * math.cos(a) - d[1] * math.sin(a), d[0] * math.sin(a) + d[1] * math.cos(a), d[2]))
        return [tuple(w), tuple(knee), tuple(bent)]

    @staticmethod
    def mirror(p, s):
        x = 1.0 if s == 'L' else -1.0
        return (p[0] * x, p[1], p[2])

    def joints(self, s, parent):
        """The wing's joints on side `s`, the shoulder on `parent`."""
        m = lambda p: self.mirror(p, s)   # noqa: E731
        q = self.prefix
        out = {f'{q}shoulder_{s}': (parent, m(self.shoulder)), f'{q}elbow_{s}': (f'{q}shoulder_{s}', m(self.elbow)),
               f'{q}wrist_{s}': (f'{q}elbow_{s}', m(self.wrist))}
        for k in range(len(self.tips)):
            out[f'{q}finger{k}_{s}'] = (f'{q}wrist_{s}', m(self.wrist))
        return out

    def bones(self, s, put, mat):
        """The arm's and the fingers' bones, rigid on their joints."""
        m = lambda p: self.mirror(p, s)   # noqa: E731
        hr, fr, kr, tr, tip = self.bone_r
        put(rigid(f'humerus_{s}', tube(f'humerus_{s}', [m(self.shoulder), m(self.elbow)],
                                       [(0.0, hr, hr, hr), (1.0, fr, fr, fr)], n=10, step=self.step), mat),
            f'{self.prefix}shoulder_{s}')
        put(rigid(f'forearm_{s}', tube(f'forearm_{s}', [m(self.elbow), m(self.wrist)],
                                       [(0.0, fr, fr, fr), (1.0, kr, kr, kr)], n=10, step=self.step), mat),
            f'{self.prefix}elbow_{s}')
        for k in range(len(self.tips)):
            put(rigid(f'finger{k}_{s}', tube(f'finger{k}_{s}', [m(p) for p in self.finger_path(k)],
                                             [(0.0, tr, tr, tr), (1.0, tip, tip, tip)], n=8, step=self.step), mat),
                f'{self.prefix}finger{k}_{s}')

    def membrane(self, skel, s, mat, n=6):
        """The membrane on side `s`: triangles between the body, the arm, each finger and the leg, each split `n` a
        side, every point weighted to the joints at its triangle's corners by its own shares."""
        m = lambda p: np.array(self.mirror(p, s))   # noqa: E731
        last = len(self.tips) - 1
        pts = {'sh': m(self.shoulder), 'el': m(self.elbow), 'wr': m(self.wrist), 'hip': m(self.hip),
               'foot': m(self.foot)}
        pts.update({f't{k}': m(self.corner(k)) for k in range(len(self.tips))})
        q = self.prefix
        j = {'sh': self.body, 'el': f'{q}shoulder_{s}', 'wr': f'{q}elbow_{s}', 'hip': self.body,
             'foot': f'{self.leg}_{s}'}
        j.update({f't{k}': f'{q}finger{k}_{s}' for k in range(len(self.tips))})
        tris = [('wr', f't{k}', f't{k + 1}') for k in range(last)] + [
            ('wr', f't{last}', 'el'), ('el', f't{last}', 'foot'), ('el', 'foot', 'hip'), ('el', 'hip', 'sh')]
        # the trailing edges, bowed in toward the wrist
        scallop = {(f't{k}', f't{k + 1}') for k in range(last)} | {(f't{last}', 'foot')}
        joints = sorted(set(j.values()))
        verts, faces, weights = [], [], []
        for a, b, c in tris:
            idx = {}
            for i in range(n + 1):
                for k in range(n + 1 - i):
                    u, v = i / n, k / n
                    w = 1 - u - v
                    p = w * pts[a] + u * pts[b] + v * pts[c]
                    if i + k == n and (b, c) in scallop:
                        p = p + (pts['wr'] - p) * self.scallop * math.sin(math.pi * v / max(u + v, 1e-9))
                        if self.serrate and k % 2:
                            p = p + (pts['wr'] - p) / np.linalg.norm(pts['wr'] - p) * self.serrate
                    p = p - np.array((0, 0, self.camber * 27 * w * u * v))
                    wt = np.zeros(len(joints))
                    for share, corner in ((w, a), (u, b), (v, c)):
                        wt[joints.index(j[corner])] += share
                    idx[(i, k)] = len(verts)
                    verts.append(p)
                    weights.append(wt)
            for i in range(n):
                for k in range(n - i):
                    faces.append((idx[(i, k)], idx[(i + 1, k)], idx[(i, k + 1)]))
                    if k < n - i - 1:
                        faces.append((idx[(i + 1, k)], idx[(i + 1, k + 1)], idx[(i, k + 1)]))
        me = bpy.data.meshes.new(f'wing_{s}')
        me.from_pydata([tuple(v) for v in verts], [], faces)
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        if self.faces is not None:
            bm.normal_update()
            way = m(self.faces)
            flip = [f for f in bm.faces if np.dot(f.normal[:], way) < 0]
            bmesh.ops.reverse_faces(bm, faces=flip)
        bm.to_mesh(me)
        bm.free()
        co = np.array([v.co[:] for v in me.vertices])
        V, W = np.array(verts), np.array(weights)
        near = np.argmin(((co[:, None, :] - V[None]) ** 2).sum(-1), axis=1)   # a merged point keeps its shares
        me.shade_smooth()
        sk = Skin(skel, f'wing_{s}', me, mat, joints, W[near])
        sk.pieces = [Piece('wing', None, None, [skel.rest(f'{q}wrist_{s}')[:]])]
        return sk

    @staticmethod
    def flap(s, beat, fold=0.0, spread=0.0, curl=0.0, sweep=0.0, fingers=4, prefix=''):
        """Wing `s` beaten, folded and spread (`beat`), its hand curled `curl` degrees down from the arm and the
        whole of it swept `sweep` degrees back: the sweep is about the body's crosswise axis, after the beat."""
        x = 1.0 if s == 'L' else -1.0
        rot = Wing.beat(s, beat, fold, spread, fingers, prefix)
        r = Matrix.Rotation(math.radians(sweep), 3, 'X') @ Matrix.Rotation(math.radians(-beat * x), 3, 'Y')
        rot[f'{prefix}shoulder_{s}'] = tuple(math.degrees(a) for a in r.to_euler('XYZ'))
        w = rot[f'{prefix}wrist_{s}']
        rot[f'{prefix}wrist_{s}'] = (w[0], w[1] + curl * x, w[2])
        return rot

    @staticmethod
    def beat(s, beat, fold=0.0, spread=0.0, fingers=4, prefix=''):
        """Wing `s` beaten `beat` degrees up (+) or down about the body's long axis, its elbow and wrist folded `fold`
        degrees toward the body, its fingers fanned `spread` degrees more (+) or closed."""
        x = 1.0 if s == 'L' else -1.0
        q = prefix
        rot = {f'{q}shoulder_{s}': (0, -beat * x, 0), f'{q}elbow_{s}': (0, 0, fold * 0.6 * x),
               f'{q}wrist_{s}': (0, -fold * 0.3 * x, fold * 0.5 * x)}
        for k in range(fingers):
            rot[f'{q}finger{k}_{s}'] = (0, 0, spread * (k - (fingers - 1) / 2) * 0.5 * x)
        return rot
