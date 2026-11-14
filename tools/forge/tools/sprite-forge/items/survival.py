"""Climates & Calories' own two pictures: raw meat and the waterskin (src/systems/survival/itemIcons.js). Their
spoiled faces, and those of the road's fresh food, are these models and the food's own rendered at a spoil stage
(kit.SPOIL; tools/sprite-forge/specs/pictures.json)."""
import math

import numpy as np

from . import shapes
from .kit import Mat
from .models import model


def _marbling(nodes, links, coord):
    """Fat run through lean meat: thin wandering streaks where a stretched noise crosses its middle."""
    scale = nodes.new('ShaderNodeMapping')
    scale.inputs['Scale'].default_value = (1.0, 2.6, 1.0)
    links.new(coord, scale.inputs['Vector'])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 20.0
    noise.inputs['Detail'].default_value = 1.0
    links.new(scale.outputs['Vector'], noise.inputs['Vector'])
    near = nodes.new('ShaderNodeMath')
    near.operation = 'COMPARE'
    near.inputs[1].default_value = 0.5
    near.inputs[2].default_value = 0.022
    links.new(noise.outputs['Fac'], near.inputs[0])
    return near.outputs['Value']


@model
def rawMeat(item, words, seed):
    """A raw cut of meat lying across the picture: a thick slab of lean, run through with fat and capped by a rind of
    it along its back, the round end of its bone showing at its right, its cut face toward the eye."""
    length, width, height = 0.2, 0.12, 0.06
    lean = Mat('meatRaw', rough=0.45, spec=0.5, pattern=('fat', _marbling, 0.8))
    slab = shapes.ellipsoid((length / 2, width / 2, height / 2), centre=(0, 0, height / 2), rings=12, sides=28)
    # a slab: an ellipsoid flattened top and bottom, its back thicker than its front
    verts, faces = slab
    shaped = []
    for x, y, z in verts:
        top = height * (0.86 + 0.18 * (y / width))
        shaped.append((x * (1 + 0.12 * math.cos(math.pi * y / width)), y, min(max(z, height * 0.08), top)))
    slab = shapes.wobble((shaped, faces), seed, 0.05)
    item.add(shapes.moved(slab, turn=(0, 0, -8)), lean)
    # the fat cap along the back, a little proud of the lean
    cap = shapes.tube([(-length * 0.42, width * 0.36, height * 0.62), (0, width * 0.44, height * 0.78),
                       (length * 0.4, width * 0.34, height * 0.64)], height * 0.24, sides=10)
    item.add(shapes.moved(cap, turn=(0, 0, -8)), Mat('fat', rough=0.55, spec=0.4))
    # the bone: a shank standing out of the slab's right end, its knuckle round, its marrow dark at the cut
    bone = shapes.joined(shapes.cylinder(height * 0.24, length * 0.22, sides=14),
                         shapes.ellipsoid((height * 0.3, height * 0.36, height * 0.36), centre=(length * 0.22, 0, 0)))
    bone_at = dict(offset=(length * 0.44, -width * 0.02, height * 0.5), turn=(0, 0, -8))
    item.add(shapes.moved(bone, **bone_at), Mat('bone', rough=0.45, spec=0.4))
    marrow = shapes.ellipsoid((0.003, height * 0.13, height * 0.13), centre=(-0.001, 0, 0))
    item.add(shapes.moved(marrow, **bone_at), Mat('meatCooked', rough=0.8))


def _bag(seed):
    """A waterskin's bag: broad and slumped, wider than it is tall, its foot settled flat and full, its top drawn up
    toward its spout at the upper left, its belly bulging toward the eye."""
    verts, faces = shapes.ellipsoid((1.0, 1.0, 1.0), rings=16, sides=28)
    out = []
    for x, y, z in verts:
        lift = (z + 1) / 2                                  # 0 at the foot, 1 at the top
        girth = 0.085 * (1.0 - 0.35 * lift ** 2.5)           # full below, a little narrower above
        reach = -0.04 * lift ** 3 * (1 - x) / 2              # the top drawn toward the spout, to the left
        out.append((x * girth + reach, y * girth * 0.62, 0.062 + z * 0.062 * (0.8 if z < 0 else 1.0)))
    return shapes.wobble((out, faces), seed, 0.03)


def _band(points, width, thick):
    """A flat strap along `points` (in the xz plane): `width` across it, facing the eye, `thick` deep."""
    pts = np.asarray(points, dtype=np.float64)
    verts, faces = [], []
    for i, p in enumerate(pts):
        d = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        d /= np.linalg.norm(d) or 1.0
        side = np.array([-d[2], 0.0, d[0]])   # across the strap, in the picture's plane
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            verts.append(tuple(p + side * sx * width / 2 + np.array([0.0, sy * thick / 2, 0.0])))
    for i in range(len(pts) - 1):
        for k in range(4):
            k1 = (k + 1) % 4
            faces.append((i * 4 + k, i * 4 + k1, (i + 1) * 4 + k1, (i + 1) * 4 + k))
    faces += [(0, 3, 2, 1), tuple((len(pts) - 1) * 4 + k for k in range(4))]
    return verts, faces


@model
def waterskin(item, words, seed):
    """A leather waterskin: a broad, full bag slumped on its foot, a darker welt where its hides are sewn round its
    edge, a wooden spout at its upper left bound with cord and stopped, and a flat strap of paler leather looped high
    over it from the spout to its right shoulder."""
    leather = Mat('leather', rough=0.55, spec=0.4, bump=(0.3, 110.0))
    item.add(_bag(seed), leather)
    # the welt round its edge, where its two hides are sewn: just behind its widest line, so it shows as a rim
    welt = []
    for t in np.linspace(0.15, math.pi * 2 - 0.4, 22):
        x, z = math.cos(t), math.sin(t)
        lift = (z + 1) / 2
        girth = 0.085 * (1.0 - 0.35 * lift ** 2.5)
        welt.append((x * girth - 0.04 * lift ** 3 * (1 - x) / 2, 0.012, 0.062 + z * 0.062 * (0.8 if z < 0 else 1.0)))
    item.add(shapes.tube(welt, 0.0045, sides=5, caps=False), Mat('darkLeather', rough=0.7))
    # the spout: a turned wooden throat at the upper left, bound with cord, its stopper in it
    spout = dict(offset=(-0.062, 0.0, 0.1), turn=(0, -28, 0))
    item.add(shapes.moved(shapes.lathe([(0.009, 0.05), (0.011, 0.04), (0.012, 0.02), (0.018, 0.004), (0.022, 0.0)], 12),
                          **spout), Mat('wood' if 'wood' in _ramps() else 'oak', rough=0.6))
    item.add(shapes.moved(shapes.moved(shapes.torus(0.0145, 0.003, 14, 5), offset=(0, 0, 0.016)), **spout),
             Mat('rope', rough=0.9))
    item.add(shapes.moved(shapes.lathe([(0.0001, 0.07), (0.008, 0.068), (0.0095, 0.058), (0.0085, 0.046)], 10, top=True,
                                       foot=True), **spout), Mat('cork', rough=0.85))
    # the strap: a flat band from the spout, high over the top, down to the bag's right shoulder
    strap = [(-0.07, -0.004, 0.125), (-0.075, -0.004, 0.16), (-0.045, -0.004, 0.19), (0.01, -0.004, 0.2),
             (0.055, -0.004, 0.175), (0.075, -0.004, 0.125), (0.078, -0.004, 0.085)]
    item.add(_band(strap, 0.016, 0.004), Mat('tan', rough=0.6, spec=0.35))


def _ramps():
    from .kit import RAMPS
    return RAMPS
