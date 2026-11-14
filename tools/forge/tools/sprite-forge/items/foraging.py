"""Foraging's seven pictures (src/systems/foraging/foragingInstall.js): the Wood-Axe, the Pick-Axe, the Sickle, the
Fishing-Net, the wood bundle, the egg and the Spade. A tool is drawn as Daggerfall draws a weapon in a list: whole, in
the picture's plane, its handle at the lower left and its head at the upper right, seen square to its face (each row's
`elevation` 0, tools/sprite-forge/specs/pictures.json). Each is built along +z, its face toward the eye (-y), then
leaned over by `LEAN`."""
import math

import numpy as np

from . import shapes
from .kit import Mat
from .models import model

LEAN = 38.0   # degrees a tool leans to the right from upright, its head to the upper right


def _lean(mesh, degrees=LEAN):
    return shapes.moved(mesh, turn=(0.0, degrees, 0.0))


def _wood():
    return Mat('oak', rough=0.6, spec=0.35, bump=(0.25, 70.0))


def _iron():
    return Mat('iron', rough=0.35, metal=0.2, spec=0.75)


def _steel():
    return Mat('steel', rough=0.25, metal=0.2, spec=0.9)


def _haft(length, radius, swell=1.08, sides=10):
    """A haft along +z from 0: a little swelled toward its foot, as a hand grips it, and rounded at its end."""
    profile = [(radius * 0.85, length), (radius, length * 0.92), (radius * 0.95, length * 0.5),
               (radius * swell, length * 0.12), (radius * 1.12, length * 0.03), (radius * 0.8, 0.0)]
    return shapes.lathe(profile, sides, top=True, foot=True)


def _slab(outline, thick, edge=None, edge_thick=None):
    """A flat blade in the xz plane (`outline` [(x, z), ...] counter-clockwise), `thick` through y; where `edge` names
    a run of outline indices, that run is ground thin (`edge_thick`), so the light falls on its bevel apart."""
    n = len(outline)
    verts = []
    for side in (-1, 1):
        for k, (x, z) in enumerate(outline):
            t = (edge_thick if edge and k in edge else thick) / 2
            verts.append((x, side * t, z))
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces += [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)]
    return verts, faces


@model
def woodAxe(item, words, seed):
    """The Wood-Axe: a long haft swelled at its foot, and at its top a felling head - an eye round the haft, a flat
    poll behind, and one broad bit before it sweeping down into a beard, its edge ground bright."""
    length, radius = 0.62, 0.016
    item.add(_lean(_haft(length + 0.02, radius)), _wood())
    top = length - 0.02
    eye = shapes.box(0.05, 0.034, 0.075, (0.0, 0.0, top - 0.02))
    item.add(_lean(eye), _iron(), smooth=False, bevel=0.003)
    poll = shapes.box(0.035, 0.03, 0.05, (-0.038, 0.0, top - 0.02))
    item.add(_lean(poll), _iron(), smooth=False, bevel=0.003)
    # the bit: from the eye out to a long swept edge, its beard hanging below
    bit = [(0.02, top - 0.05), (0.08, top - 0.09), (0.145, top - 0.135), (0.165, top - 0.12), (0.172, top + 0.0),
           (0.162, top + 0.07), (0.125, top + 0.08), (0.02, top + 0.012)]
    item.add(_lean(_slab(bit, 0.024, edge={2, 3, 4, 5}, edge_thick=0.004)), Mat('steel', rough=0.35, metal=0.2, spec=0.75),
             smooth=False)
    # the edge itself, a bright band along the bit's front
    edge = [(0.148, top - 0.128), (0.165, top - 0.12), (0.172, top + 0.0), (0.162, top + 0.07), (0.146, top + 0.074),
            (0.155, top + 0.0), (0.15, top - 0.112)]
    item.add(_lean(_slab(edge, 0.0065)), _steel(), smooth=False)
    # the wedge driven into the haft's top through the eye
    item.add(_lean(shapes.box(0.006, 0.036, 0.008, (0.0, 0.0, top + 0.02))), Mat('rust', rough=0.8), smooth=False)


@model
def pickAxe(item, words, seed):
    """The Pick-Axe: a haft and, across its top, an iron head curving down at both arms - a long point before, a
    short chisel behind - held on by a collar."""
    length, radius = 0.6, 0.016
    item.add(_lean(_haft(length + 0.03, radius)), _wood())
    top = length
    # the head: a tapering bar bent down at each end, square in section
    arc = []
    for t in np.linspace(-1.0, 1.0, 17):
        reach = 0.2 if t > 0 else 0.13
        x = t * reach
        z = top + 0.03 - 0.06 * t * t
        arc.append((x, 0.0, z))
    radii = [0.009 + 0.016 * (1 - abs(t)) ** 0.7 for t in np.linspace(-1.0, 1.0, 17)]
    head = Mat('steel', rough=0.35, metal=0.2, spec=0.75)
    for k in range(16):
        seg = shapes.tube([arc[k], arc[k + 1]], radii[k], sides=6, radius_end=radii[k + 1])
        item.add(_lean(seg), head, smooth=False)
    # the chisel's flat end and the point's bright tip
    item.add(_lean(shapes.box(0.018, 0.014, 0.008, (arc[0][0] + 0.004, 0.0, arc[0][2] + 0.003))), _steel(), smooth=False)
    item.add(_lean(shapes.tube([arc[14], arc[16]], 0.006, sides=4, radius_end=0.0015)), _steel(), smooth=False)
    # the collar round the haft under the head
    item.add(_lean(shapes.lathe([(radius * 1.45, top + 0.01), (radius * 1.5, top - 0.02), (radius * 1.4, top - 0.035)],
                                10, top=True, foot=True)), _iron(), smooth=False, bevel=0.002)


@model
def sickle(item, words, seed):
    """The Sickle: a short turned handle bound at its top with a ferrule, and out of it a thin blade in a deep
    crescent, its inner edge ground bright."""
    handle = shapes.lathe([(0.012, 0.12), (0.015, 0.1), (0.016, 0.04), (0.018, 0.012), (0.012, 0.0)], 10, top=True,
                          foot=True)
    item.add(_lean(handle, 30), _wood())
    item.add(_lean(shapes.lathe([(0.0135, 0.14), (0.016, 0.125), (0.016, 0.112), (0.014, 0.108)], 10, top=True,
                                foot=True), 30), _iron(), smooth=False)
    # the crescent: a band between two arcs, wide at the tang and drawn to a point
    outer, inner = [], []
    for t in np.linspace(0.0, 1.0, 22):
        a = math.pi * (1.05 - 1.25 * t)
        r_out = 0.15
        width = 0.046 * (1 - t) ** 0.75 + 0.003
        cx, cz = 0.12, 0.17
        outer.append((cx + r_out * math.cos(a), cz + r_out * math.sin(a)))
        inner.append((cx + (r_out - width) * math.cos(a), cz + (r_out - width) * math.sin(a)))
    blade = outer + inner[::-1]
    edge = set(range(len(outer), len(blade)))
    item.add(_lean(_slab(blade, 0.007, edge=edge, edge_thick=0.0015), 30), Mat('steel', rough=0.3, metal=0.2, spec=0.8),
             smooth=False)
    shine = [(x, z) for x, z in inner[2:-2]]
    lip = [(0.12 + (math.hypot(x - 0.12, z - 0.17) - 0.009) * (x - 0.12) / math.hypot(x - 0.12, z - 0.17),
            0.17 + (math.hypot(x - 0.12, z - 0.17) - 0.009) * (z - 0.17) / math.hypot(x - 0.12, z - 0.17)) for x, z in shine]
    item.add(_lean(_slab(shine + lip[::-1], 0.0035), 30), Mat('silver', rough=0.2, metal=0.2, spec=0.9), smooth=False)
    # the tang into the ferrule
    item.add(_lean(shapes.box(0.008, 0.005, 0.04, (0.0, 0.0, 0.155)), 30), _iron(), smooth=False)


@model
def fishingNet(item, words, seed):
    """The Fishing-Net: an oval hoop of bent wood, a diamond mesh of knotted cord strung across it, and cork floats
    tied round its rim, laid a little toward the eye."""
    rx, rz = 0.3, 0.22
    tilt = dict(turn=(-14, 32, 0))
    hoop = [(rx * math.cos(a), 0.0, rz * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 49)]
    item.add(shapes.moved(shapes.tube(hoop, 0.009, sides=8, caps=False), **tilt), Mat('pine', rough=0.6, spec=0.3))
    cord = Mat('rope', rough=0.85)
    gap = 0.045
    for direction in (1, -1):
        for k in range(-14, 15):
            # a cord along x + direction * z = k * gap, clipped to the hoop
            pts = []
            for t in np.linspace(-0.6, 0.6, 61):
                x = t
                z = (k * gap - x) * direction
                if (x / (rx * 0.985)) ** 2 + (z / (rz * 0.985)) ** 2 <= 1:
                    pts.append((x, 0.0, z))
            if len(pts) >= 2:
                item.add(shapes.moved(shapes.tube([pts[0], pts[-1]], 0.0028, sides=4), **tilt), cord, smooth=False)
    # the knots where the cords cross, and the cork floats on the rim
    for a in np.linspace(0.25, math.pi - 0.25, 5):
        float_at = (rx * math.cos(a), -0.004, rz * math.sin(a))
        item.add(shapes.moved(shapes.ellipsoid((0.018, 0.012, 0.012), centre=float_at), **tilt), Mat('cork', rough=0.85))


@model
def woodBundle(item, words, seed):
    """A bundle of firewood: five split logs laid together, bound twice round with rope, their cut ends to the right
    showing their rings."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    bark = Mat('barkPine', rough=0.9, bump=(0.7, 110.0))
    ring_mask = None
    from .materials import _rings
    end = Mat('pine', rough=0.8, pattern=('pine', _rings(1.8), 0.7))
    length = 0.26
    places = [(-0.022, 0.0, 0.02), (0.022, 0.0, 0.02), (0.0, 0.0, 0.055), (-0.044, 0.004, 0.055), (0.044, -0.004, 0.055)]
    turn = (0, 0, -52)   # the right end turned toward the eye, so the cut ends and their rings face it
    for k, (y, _, z) in enumerate(places):
        r = 0.02 * rng.uniform(0.85, 1.1)
        log = shapes.wobble(shapes.cylinder(r, length, sides=10, caps=False), seed + k, 0.05)
        at = (-length / 2 + rng.uniform(-0.01, 0.01), y, z)
        item.add(shapes.moved(shapes.moved(log, offset=at), turn=turn), bark)
        cap = shapes.ellipsoid((0.002, r * 0.95, r * 0.95), centre=(at[0] + length + 0.001, y, z), rings=5, sides=10)
        item.add(shapes.moved(cap, turn=turn), end)
        near = shapes.ellipsoid((0.002, r * 0.95, r * 0.95), centre=(at[0] - 0.001, y, z), rings=5, sides=10)
        item.add(shapes.moved(near, turn=turn), end)
    for x in (-0.06, 0.06):
        band = [(x, 0.08 * math.cos(a), 0.04 + 0.05 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 25)]
        item.add(shapes.moved(shapes.tube(band, 0.0045, sides=5, caps=False), turn=turn), Mat('rope', rough=0.9))
    del ring_mask


def _speckles(nodes, links, coord):
    """An egg's speckles: small round flecks where a fine noise peaks."""
    noise = nodes.new('ShaderNodeTexVoronoi')
    noise.inputs['Scale'].default_value = 140.0
    links.new(coord, noise.inputs['Vector'])
    small = nodes.new('ShaderNodeMath')
    small.operation = 'LESS_THAN'
    small.inputs[1].default_value = 0.2
    links.new(noise.outputs['Distance'], small.inputs[0])
    return small.outputs['Value']


@model
def forageEgg(item, words, seed):
    """An egg: pale, speckled brown, its broad end down, standing a little tipped."""
    profile = []
    for i in range(17):
        t = math.pi * i / 16
        r = math.sin(t) * (1.0 - 0.18 * math.cos(t))
        profile.append((max(r, 1e-4) * 0.022, 0.03 * (1 + math.cos(t)) * (1.0 + 0.12 * math.cos(t))))
    egg = shapes.lathe(profile, 24, top=True, foot=True)
    item.add(shapes.moved(egg, turn=(0, 14, 0)), Mat('egg', rough=0.5, spec=0.35, pattern=('brown', _speckles, 0.9)))


@model
def spade(item, words, seed):
    """The Spade: a haft with a crosspiece grip at its top, an iron socket at its foot and a broad blade drawn to a
    blunt point, its tread turned over at the shoulders and its edge worn bright."""
    length, radius = 0.42, 0.014
    item.add(_lean(shapes.moved(_haft(length, radius, swell=1.0), offset=(0, 0, 0.1))), _wood())
    item.add(_lean(shapes.moved(shapes.cylinder(0.011, 0.11, sides=8), offset=(-0.055, 0.0, length + 0.1))), _wood())
    socket = shapes.lathe([(radius * 1.3, 0.16), (radius * 1.4, 0.12), (radius * 1.6, 0.095)], 10, top=True, foot=True)
    item.add(_lean(socket), _iron(), smooth=False)
    blade = [(-0.07, 0.1), (-0.072, 0.03), (-0.045, -0.04), (0.0, -0.065), (0.045, -0.04), (0.072, 0.03), (0.07, 0.1)]
    item.add(_lean(_slab(blade, 0.008, edge={1, 2, 3, 4, 5}, edge_thick=0.003)), Mat('steel', rough=0.4, metal=0.2,
                                                                                         spec=0.7), smooth=False)
    item.add(_lean(shapes.box(0.15, 0.016, 0.012, (0.0, 0.0, 0.098))), _iron(), smooth=False, bevel=0.003)
    edge = [(-0.06, -0.012), (-0.045, -0.04), (0.0, -0.065), (0.045, -0.04), (0.06, -0.012), (0.04, -0.03),
            (0.0, -0.052), (-0.04, -0.03)]
    item.add(_lean(_slab(edge, 0.0035)), Mat('silver', rough=0.2, metal=0.2, spec=0.9), smooth=False)
