"""Jointed legs for the beast forge's many-legged creatures (the spider, the scorpion): each a femur rising from its
root to the knee, a tibia falling to the ankle and a foot reaching the ground, skinned along its own bones, and turned
about its own axes: swung forward along the ground, its femur raised, its knee and ankle bent."""
import math

import numpy as np
from mathutils import Matrix, Vector

from beastkit import Piece, Skin, chain_weights, tube


def about(axis, deg):
    """A turn of `deg` degrees about `axis` (rest space), as the XYZ Euler degrees a joint takes."""
    e = Matrix.Rotation(math.radians(deg), 3, Vector(axis).normalized()).to_euler('XYZ')
    return tuple(math.degrees(a) for a in e)


class Leg:
    """Leg `name` on side `side` ('L' +X, 'R' -X), set at `root` on its `parent` joint, reaching out at `bearing`
    degrees round from forward toward its side. `bones` are the femur's, tibia's and foot's lengths; `rise` is the
    femur's slope up to the knee and `fall` the tibia's down to the ankle (sines); the foot runs `reach` metres on
    outward as it falls to the ground. `radii` are its girth at shares of its length."""

    def __init__(self, name, side, parent, root, bearing, bones, rise, fall, reach=0.12,
                 radii=((0.0, 0.07), (0.4, 0.058), (0.43, 0.062), (0.75, 0.048), (0.78, 0.042), (1.0, 0.01))):
        self.name, self.side, self.parent = name, side, parent
        self.x = 1.0 if side == 'L' else -1.0
        b = math.radians(bearing)
        self.d = Vector((math.sin(b) * self.x, -math.cos(b), 0.0))
        self.root = Vector(root)
        femur, tibia, foot = bones
        self.knee = self.root + self.d * (femur * math.sqrt(1 - rise ** 2)) + Vector((0, 0, femur * rise))
        self.ankle = self.knee + self.d * (tibia * math.sqrt(1 - fall ** 2)) - Vector((0, 0, tibia * fall))
        ground = self.ankle + self.d * reach
        ground.z = 0.0
        self.foot = self.ankle + (ground - self.ankle).normalized() * foot
        self.radii = radii
        self.across = Vector((0, 0, 1)).cross(self.d)   # the line across the leg's plane: a raise lifts the knee

    @property
    def joint_names(self):
        return f'coxa_{self.name}', f'knee_{self.name}', f'ankle_{self.name}'

    def joints(self):
        coxa, knee, ankle = self.joint_names
        return {coxa: (self.parent, self.root[:]), knee: (coxa, self.knee[:]), ankle: (knee, self.ankle[:])}

    def skin(self, skel, mat, n=14):
        """The leg's mesh, skinned along its bones, its girth fitted as every leg's (`leg_g`)."""
        pts = [self.root - self.d * 0.05, self.root, self.knee, self.ankle, self.foot]
        ts, rs = zip(*self.radii)
        rows = [(t, *([float(np.interp(t, ts, rs))] * 3)) for t in np.linspace(0.0, 1.0, 14)]
        me = tube(f'leg_{self.name}', [p[:] for p in pts], rows, n=n, up=self.across[:])
        bones = [p[:] for p in pts]
        w = chain_weights(np.array([v.co[:] for v in me.vertices]), bones, 0.04)
        sk = Skin(skel, f'leg_{self.name}', me, mat, list(self.joint_names),
                  np.stack([w[:, 0] + w[:, 1], w[:, 2], w[:, 3]], 1))
        sk.pieces = [Piece('leg', None, None, bones)]
        return sk

    def turn(self, swing=0.0, raise_=0.0, knee=0.0, ankle=0.0):
        """The leg swung `swing` degrees forward along the ground, its femur raised `raise_`, its knee and ankle bent
        `knee`, `ankle` degrees (+ folds the leg under)."""
        q = Matrix.Rotation(math.radians(-swing * self.x), 3, 'Z') @ Matrix.Rotation(math.radians(-raise_), 3,
                                                                                     self.across)
        coxa, kn, an = self.joint_names
        return {coxa: tuple(math.degrees(a) for a in q.to_euler('XYZ')), kn: about(self.across, knee),
                an: about(self.across, ankle)}

    def sole(self, W):
        """The foot's tip, posed: world matrices `W`."""
        an = self.joint_names[2]
        return W[an] @ (self.foot - self.ankle)

    def params(self, step=6):
        """What the fit may turn on this leg: (joint, axis, step)."""
        coxa, knee, _ = self.joint_names
        return [(coxa, 0, step), (coxa, 1, step), (coxa, 2, step), (knee, 0, step + 2), (knee, 1, step + 2)]


def ground(p, legs, count=1):
    """Lower or lift the pose's root so the lowest foot touches the ground, or the mean of the `count` lowest: a far
    foot the fit has turned down cannot then hold the near legs up in the air."""
    W = p.world()
    soles = sorted(leg.sole(W).z for leg in legs)
    p.root_loc.z -= sum(soles[:count]) / count
    return p
