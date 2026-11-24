"""The metals' own look, made for any weapon: each metal's materials, and the parts a hilt is built of.

Each metal is a culture's work, and its weapons share one language of parts (`HILTS`): iron a smith's plain bar and
wheel, steel's squared and collared, silver's scrolled, the Altmer's elven in layered wings and a leaf, the Dwemer's
dwarven in stepped blocks and bolts, mithril fine and thin, adamantium broad and riveted, the Dunmer's ebony in black
spikes, the Orsimer's orcish in horns and claws, the daedric in horns, barbs and glow. A part is built in the weapon's
own frame, in metres: the grip's middle on the Z axis, the blade's plane XZ, its faces toward -Y and +Y.

The parts: `sweep` runs a section along a path (a quillon, a horn, a spike), `lathe` turns a profile about an axis (a
pommel, a collar, a rivet; few sides make it faceted), `grip` wraps a section in leather or cord, `block` is a chamfered
box. Each metal's colours are its own (`LOOK`); the first-person blade is still dyed by the game."""
import math
import re

import numpy as np
from mathutils import Vector

from body import rest_attr

# each metal's colours (sRGB): its metal, its fittings' metal, its grip, an accent (gold, a gem), and how metallic and
# how rough the metal is
LOOK = {
    'Iron': {'metal': (112, 112, 124), 'fit': (92, 92, 102), 'grip': (72, 46, 26), 'metallic': 0.5, 'rough': 0.6},
    'Steel': {'metal': (176, 176, 182), 'fit': (120, 120, 126), 'grip': (64, 40, 24), 'metallic': 0.6, 'rough': 0.35},
    'Silver': {'metal': (214, 214, 230), 'fit': (200, 200, 216), 'grip': (40, 34, 70), 'metallic': 0.7, 'rough': 0.22},
    'Elven': {'metal': (222, 218, 206), 'fit': (212, 170, 70), 'grip': (204, 192, 150), 'accent': (212, 170, 70),
              'blade': (222, 180, 82), 'metallic': 0.6, 'rough': 0.25},
    'Dwarven': {'metal': (190, 150, 60), 'fit': (170, 128, 48), 'grip': (60, 36, 22), 'blade': (150, 132, 82),
                'metallic': 0.85, 'rough': 0.35},
    'Mithril': {'metal': (120, 150, 200), 'fit': (150, 176, 214), 'grip': (30, 40, 80), 'accent': (40, 80, 200),
                'blade': (62, 105, 167), 'metallic': 0.7, 'rough': 0.25},
    'Adamantium': {'metal': (82, 90, 86), 'fit': (70, 78, 74), 'grip': (44, 42, 40), 'blade': (122, 122, 137),
                   'inlay': (205, 205, 224), 'metallic': 0.75, 'rough': 0.3},
    'Ebony': {'metal': (34, 32, 36), 'fit': (28, 26, 30), 'grip': (18, 16, 18), 'blade': (124, 124, 132),
              'groove': (34, 33, 38), 'inlay': (150, 150, 156), 'blade_rough': 0.35, 'metallic': 0.5, 'rough': 0.08},
    'Orcish': {'metal': (78, 100, 56), 'fit': (66, 84, 48), 'grip': (78, 54, 32), 'blade': (58, 92, 36),
               'metallic': 0.55, 'rough': 0.6},
    'Daedric': {'metal': (70, 20, 16), 'fit': (52, 14, 12), 'grip': (22, 10, 10), 'glow': (255, 90, 20),
                'blade': (112, 104, 98), 'groove': (20, 18, 18), 'blade_rough': 0.35, 'blade_glow': (110, 14, 9),
                'metallic': 0.7, 'rough': 0.25},
}


def _linear(c):
    return tuple(((v / 255) / 12.92 if v / 255 <= 0.04045 else ((v / 255 + 0.055) / 1.055) ** 2.4) for v in c)


def palette(metal, tone=None):
    """`metal`'s materials by role: its blade's metal, its fittings, its grip, its accent and its glow. Each is named
    for the palette's own (`steel.Iron` a steel, `blade.Iron` a blade, `haft.Iron` a haft) so the fitter reads it in
    the class of the material it stands for. `tone` overrides its look's entries (armour.py's plate)."""
    import materials
    L = {**LOOK[metal], **(tone or {})}
    out = {'metal': materials.plain(f'steel.{metal}', _linear(L['metal']), metal=L['metallic'], rough=L['rough'],
                                    spec=0.6),
           'fit': materials.plain(f'blade.{metal}', _linear(L['fit']), metal=min(L['metallic'] + 0.2, 1.0),
                                  rough=L['rough']),
           'grip': materials.plain(f'haft.{metal}', _linear(L['grip']), rough=0.7, spec=0.3)}
    out['accent'] = (materials.plain(f'edge.{metal}', _linear(L['accent']), metal=1.0, rough=0.2)
                     if 'accent' in L else out['fit'])
    if 'blade' in L:   # a sword's blade in a colour of its own (elven gold), where its other work keeps `metal`
        out['blade'] = materials.plain(f'steel.{metal}.blade', _linear(L['blade']), metal=L['metallic'],
                                       rough=L.get('blade_rough', L['rough']), spec=0.6)
    if 'blade_glow' in L:   # a sword's seam its armour's dull deep red, where its other work keeps `glow`
        m = materials.plain(f'edge.{metal}.blade_glow', _linear(L['blade_glow']), rough=0.5)
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = (*_linear(L['blade_glow']), 1)
        b.inputs['Emission Strength'].default_value = 1.5
        out['blade_glow'] = m
    if 'glow' in L:
        m = materials.plain(f'edge.{metal}.glow', _linear(L['glow']), rough=0.5)
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = (*_linear(L['glow']), 1)
        b.inputs['Emission Strength'].default_value = 6.0
        out['glow'] = m
    return out


# ---- the parts

_CAPTURE = None   # while hilt_arrays reads a hilt: each part's (vertices, faces, role, smooth, name), no object made


def _object(name, verts, faces, mat, smooth=True):
    if _CAPTURE is not None:
        _CAPTURE.append((np.asarray([tuple(map(float, v)) for v in verts]), [tuple(int(i) for i in f) for f in faces],
                         mat, smooth, name))
        return name
    import bpy
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(int(i) for i in f) for f in faces])
    me.materials.append(mat)
    me.update()
    if smooth:
        me.shade_smooth()
    else:
        me.shade_flat()
    rest_attr(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def rings(name, loops, mat, caps=(True, True), smooth=True):
    """A closed surface through `loops` (each the same number of points, in order round), capped at either end."""
    loops = [np.asarray(lp, dtype=np.float64) for lp in loops]
    n = len(loops[0])
    verts = np.concatenate(loops)
    faces = [(i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k)
             for i in range(len(loops) - 1) for k in range(n)]
    verts = list(verts)
    for end, at in ((0, caps[0]), (len(loops) - 1, caps[1])):
        if not at:
            continue
        centre = len(verts)
        verts.append(loops[end].mean(axis=0))
        for k in range(n):
            a, b = end * n + k, end * n + (k + 1) % n
            faces.append((centre, b, a) if end == 0 else (centre, a, b))
    return _object(name, verts, faces, mat, smooth)


def section(kind, a, b=None, n=24):
    """A closed section, `a` across and `b` deep (half-sizes): round, square (rounded), octagon, diamond, lens, star."""
    b = a if b is None else b
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    c, s = np.cos(t), np.sin(t)
    if kind == 'round':
        return np.stack([a * c, b * s], 1)
    if kind == 'square':
        p = 4.0
        return np.stack([a * np.sign(c) * np.abs(c) ** (2 / p), b * np.sign(s) * np.abs(s) ** (2 / p)], 1)
    if kind == 'octagon':
        k = np.cos(np.pi / 8) / np.cos(((t + np.pi / 8) % (np.pi / 4)) - np.pi / 8)
        return np.stack([a * c * k, b * s * k], 1)
    if kind == 'diamond':
        k = 1 / (np.abs(c) + np.abs(s))
        return np.stack([a * c * k, b * s * k], 1)
    if kind == 'lens':   # two arcs meeting in edges along the across axis
        return np.stack([a * c, b * s * np.abs(s) ** 0.3], 1)
    if kind == 'star':   # a ridged horn: six ridges round it
        k = 1 + 0.25 * np.cos(6 * t)
        return np.stack([a * c * k, b * s * k], 1)
    raise KeyError(kind)


def sweep(name, path, sec, mat, scale=lambda t: (1.0, 1.0), up=(0.0, 0.0, 1.0), caps=(True, True), smooth=True,
          point=False):
    """`sec` (a section's points, its first axis across the path's side, its second toward `up`) run along `path`,
    sized by `scale(t)` at each share `t` of the way; with `point` the far end closes to a point."""
    path = [Vector(p) for p in path]
    up = Vector(up)
    loops = []
    for i, p in enumerate(path):
        tan = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        side = tan.cross(up)
        if side.length < 1e-6:
            side = tan.cross(Vector((0, 1, 0)))
        side.normalize()
        upv = side.cross(tan).normalized()
        su, sv = scale(i / (len(path) - 1))
        if point and i == len(path) - 1:
            su, sv = 1e-4, 1e-4
        loops.append([p + side * (u * su) + upv * (v * sv) for u, v in sec])
    return rings(name, loops, mat, caps=(caps[0], caps[1] and not point), smooth=smooth)


def lathe(name, profile, mat, sides=24, axis='Z', at=(0.0, 0.0, 0.0), phase=0.0, smooth=True, squash=1.0):
    """`profile` (each a radius and a height along `axis`, in order) turned about the axis through `at`. Few sides make
    it faceted; `squash` flattens it across Y."""
    at = Vector(at)
    t = np.linspace(0, 2 * np.pi, sides, endpoint=False) + phase
    loops = []
    for r, h in profile:
        r = max(r, 1e-5)
        if axis == 'Z':
            loops.append([at + Vector((r * math.cos(a), r * math.sin(a) * squash, h)) for a in t])
        elif axis == 'Y':
            loops.append([at + Vector((r * math.cos(a), h, r * math.sin(a))) for a in t])
        else:
            loops.append([at + Vector((h, r * math.cos(a) * squash, r * math.sin(a))) for a in t])
    return rings(name, loops, mat, smooth=smooth)


def block(name, centre, size, mat, bevel=0.2):
    """A box `size` (full sizes x, y, z) at `centre`, its edges along Z chamfered by `bevel` of the smaller side."""
    cx, cy, cz = centre
    hx, hy, hz = (s / 2 for s in size)
    c = bevel * min(hx, hy)
    ring = [(hx, hy - c), (hx - c, hy), (-hx + c, hy), (-hx, hy - c), (-hx, -hy + c), (-hx + c, -hy), (hx - c, -hy),
            (hx, -hy + c)]
    e = bevel * hz
    loops = [[(cx + x * k, cy + y * k, cz + z) for x, y in ring] for z, k in
             ((-hz, 1 - bevel * 0.5), (-hz + e, 1.0), (hz - e, 1.0), (hz, 1 - bevel * 0.5))]
    return rings(name, loops, mat, smooth=False)


def grip(name, z0, z1, r, mat, kind='round', wrap='strip', aspect=1.0, pitch=0.02, depth=0.0012, swell=0.07,
         n=48, rows=110):
    """A grip from `z0` up to `z1`: `kind`'s section, `r` across (times `aspect` along X, the blade's edges), swelling
    a little in its middle, wrapped: `strip` a leather strip spiralled on with each turn overlapping the last, `cord`
    a cord wound close, `cross` two cords crossed, `bands` ribbed, `plain` bare."""
    sec = section(kind, r * aspect, r, n)
    th = np.arctan2(sec[:, 1], sec[:, 0])
    loops = []
    for z in np.linspace(z0, z1, rows):
        u = (z - z0) / (z1 - z0)
        k = 1 + swell * math.sin(math.pi * u)
        ends = min(1.0, min(z - z0, z1 - z) / 0.004)   # the wrap eases off where a collar or the guard covers it
        ph = (z - z0) / pitch + th / (2 * np.pi)
        if wrap == 'strip':
            d = depth * (ph - np.floor(ph))
        elif wrap == 'cord':
            d = depth * np.sqrt(np.abs(np.sin(np.pi * ph)))
        elif wrap == 'cross':
            q = (z - z0) / pitch - th / (2 * np.pi)
            d = depth * np.maximum(1 - np.abs(2 * (ph % 1) - 1), 1 - np.abs(2 * (q % 1) - 1)) ** 2
        elif wrap == 'bands':
            d = depth * np.full(len(th), max(0.0, math.cos(2 * math.pi * (z - z0) / pitch)) ** 4)
        else:
            d = np.zeros(len(th))
        rad = np.hypot(sec[:, 0], sec[:, 1])
        grow = (rad * k + d * ends) / np.maximum(rad, 1e-9)
        loops.append(np.stack([sec[:, 0] * grow, sec[:, 1] * grow, np.full(len(th), z)], 1))
    return rings(name, loops, mat)


def collar(name, z, h, r, mat, kind='round', aspect=1.0, n=48, beads=0):
    """A ferrule round a grip at `z`, `h` tall, chamfered at both ends; `beads` rings of beading along it."""
    sec = section(kind, r * aspect, r, n)
    hs = np.linspace(-h / 2, h / 2, 9 if beads else 4)
    loops = []
    for i, dz in enumerate(hs):
        e = min(i, len(hs) - 1 - i)
        k = 0.92 if e == 0 else 1.0
        if beads and 0 < e:
            k += 0.06 * abs(math.sin(math.pi * beads * (dz + h / 2) / h))
        loops.append(np.stack([sec[:, 0] * k, sec[:, 1] * k, np.full(n, z + dz)], 1))
    return rings(name, loops, mat)


def rivet(name, at, mat, r=0.004, face=-1.0):
    """A domed rivet head on a face (its normal along Y, `face` -1 the front, 1 the back)."""
    prof = [(r * math.cos(a), r * 0.6 * math.sin(a) * face) for a in np.linspace(0, math.pi / 2, 6)]
    return lathe(name, prof, mat, sides=12, axis='Y', at=at)


def mirror_x(fn):
    """A part built for the right side (+X) and again for the left."""
    return [fn(1.0, 'R'), fn(-1.0, 'L')]


# ---- the hilts: each metal's guard, grip and pommel, the grip from the pommel (GRIP_FOOT) up into the guard

GRIP_FOOT = -0.172


def _bar(name, half, z, mat, kind, a, b, droop=0.0, flare=1.0, n=13):
    """A cross guard's bar along X through z, `half` long each way, ends drooping `droop` and grown `flare` times."""
    xs = np.linspace(-half, half, n)
    path = [(x, 0.0, z - droop * (x / half) ** 2) for x in xs]
    return sweep(name, path, section(kind, b, a, 16), mat,
                 scale=lambda t: (1 + (flare - 1) * abs(2 * t - 1) ** 2,) * 2)


def _plate(name, pts, y, depth, mat, bevel=0.0):
    """A flat plate of outline `pts` (x, z) standing `depth` thick about y; with `bevel` its faces' rims are chamfered
    in by that share of the outline, so they catch the light."""
    if not bevel:
        return sweep(name, [(0, y - depth / 2, 0.0), (0, y + depth / 2, 0.0)], pts, mat, up=(0, 0, 1), smooth=False)
    cx, cz = np.mean([p[0] for p in pts]), np.mean([p[1] for p in pts])
    rel = [(x - cx, z - cz) for x, z in pts]
    h, b = depth / 2, depth * 0.3
    path = [(cx, y - h, cz), (cx, y - h + b, cz), (cx, y + h - b, cz), (cx, y + h, cz)]
    return sweep(name, path, rel, mat, up=(0, 0, 1), smooth=False,
                 scale=lambda t: ((1 - bevel,) * 2 if t in (0.0, 1.0) else (1.0, 1.0)))


def _iron(P):
    obs = [_bar('sword_guard', 0.086, 0.031, P['fit'], 'square', 0.0095, 0.0125, droop=0.008, flare=0.85),
           block('sword_guard_block', (0, 0, 0.031), (0.026, 0.03, 0.026), P['fit'])]
    obs.append(grip('sword_hilt', GRIP_FOOT, 0.022, 0.0165, P['grip'], aspect=1.12, wrap='strip', pitch=0.024,
                    depth=0.0014))
    obs.append(collar('sword_collar', 0.016, 0.008, 0.0192, P['fit'], aspect=1.12))
    obs.append(lathe('sword_pommel', [(0.0, 0.013), (0.025, 0.013), (0.031, 0.009), (0.032, 0.0), (0.031, -0.009),
                                      (0.025, -0.013), (0.0, -0.013)], P['fit'], sides=28, axis='Y',
                     at=(0, 0, -0.203), smooth=False))
    obs.append(block('sword_peen', (0, 0, -0.234), (0.012, 0.012, 0.008), P['fit']))
    return obs, 0.044


def _steel(P):
    obs = [_bar('sword_guard', 0.094, 0.033, P['fit'], 'square', 0.0085, 0.012, flare=1.3)]
    obs += mirror_x(lambda x, s: block(f'sword_guard_{s}', (0.1 * x, 0, 0.033), (0.014, 0.03, 0.022), P['fit']))
    for y, s in ((-0.0128, 'F'), (0.0128, 'B')):   # a diamond langet over the blade's root on each face
        diamond = [(0.0, 0.012), (0.017, 0.033), (0.0, 0.058), (-0.017, 0.033)]
        obs.append(sweep(f'sword_langet_{s}', [(0, y - 0.0015, 0.0), (0, y + 0.0015, 0.0)],
                         [(x, z) for x, z in diamond], P['fit'], up=(0, 0, 1), smooth=False))
    obs.append(grip('sword_hilt', GRIP_FOOT, 0.022, 0.016, P['grip'], aspect=1.06, wrap='strip', pitch=0.016,
                    depth=0.0009))
    obs += [collar('sword_collar_top', 0.017, 0.009, 0.0185, P['fit'], aspect=1.06),
            collar('sword_collar_foot', GRIP_FOOT + 0.004, 0.01, 0.0185, P['fit'], aspect=1.06)]
    obs.append(lathe('sword_pommel', [(0.0, 0.0145), (0.011, 0.0145), (0.013, 0.012), (0.024, 0.012), (0.03, 0.007),
                                      (0.03, -0.007), (0.024, -0.012), (0.013, -0.012), (0.011, -0.0145),
                                      (0.0, -0.0145)], P['fit'], sides=12, axis='Y', at=(0, 0, -0.203), smooth=False))
    obs.append(block('sword_peen', (0, 0, -0.238), (0.011, 0.011, 0.007), P['fit']))
    return obs, 0.045


def _scroll(name, end, side, mat):
    """A scroll curled at a quillon's end: one turn, tightening, out and back up."""
    pts = []
    for k in range(20):
        a = -math.pi / 2 + k / 19 * 1.7 * math.pi
        r = 0.0075 * (1 - 0.6 * k / 19)
        pts.append((end[0] + side * (0.0055 + r * math.cos(a)), 0.0, end[2] + 0.0075 + r * math.sin(a)))
    return sweep(name, [end] + pts, section('round', 0.0032), mat, scale=lambda t: (1 - 0.45 * t,) * 2)


def _silver(P):
    """Silver's: a broad straight guard of flat arms, a leaf laid along each face of each arm, each arm ending in a
    rounded lobe studded twice; a block at its middle inlaid with a dark arch and crowned by a fan of flames up the
    blade's root on each face; a long grip in a braided weave of dark leather; and a tall eight-sided pommel under
    a ring, widening a little to a blunt point."""
    import materials
    leather = materials.plain('haft.Silver.braid', _linear((52, 40, 30)), rough=0.75, spec=0.25)
    obs = [_bar('sword_guard', 0.125, 0.032, P['fit'], 'square', 0.021, 0.0115, flare=1.0)]
    lobe = [(0.0, -0.034), (0.013, -0.03), (0.021, -0.017), (0.023, 0.0), (0.021, 0.017), (0.013, 0.03),
            (0.0, 0.034), (-0.013, 0.03), (-0.021, 0.017), (-0.023, 0.0), (-0.021, -0.017), (-0.013, -0.03)]
    leaf = [(-0.034, 0.0), (-0.019, 0.011), (0.0, 0.015), (0.019, 0.011), (0.034, 0.0), (0.019, -0.011), (0.0, -0.015),
            (-0.019, -0.011)]
    for x, side in ((1.0, 'R'), (-1.0, 'L')):
        obs.append(_plate(f'sword_lobe_{side}', [(0.135 * x + u, 0.032 + v) for u, v in lobe], 0.0, 0.026, P['fit'],
                          bevel=0.16))
        for y, face in ((-0.0115, 'F'), (0.0115, 'B')):
            obs.append(_plate(f'sword_leaf_{side}{face}', [(0.09 * x + u, 0.032 + v) for u, v in leaf], y * 1.05, 0.003,
                              P['fit'], bevel=0.3))
            obs += [lathe(f'sword_stud_{side}{face}{k}', [(0.0, y * 1.38), (0.0035, y * 1.33), (0.0045, y * 1.12)],
                          P['fit'], sides=12, axis='Y', at=(0.138 * x, 0, 0.032 + dz))
                    for k, dz in enumerate((0.013, -0.013))]
    obs.append(block('sword_guard_block', (0, 0, 0.034), (0.096, 0.031, 0.044), P['fit'], bevel=0.25))
    slot = [(0.0, 0.024), (0.006, 0.026), (0.0095, 0.031), (0.0105, 0.04), (0.0105, 0.055), (-0.0105, 0.055),
            (-0.0105, 0.04), (-0.0095, 0.031), (-0.006, 0.026)]
    base = [(0.048, 0.054), (0.048, 0.064), (0.0, 0.072), (-0.048, 0.064), (-0.048, 0.054)]
    flames = [[(0.03, 0.06), (0.05, 0.068), (0.054, 0.096), (0.04, 0.084), (0.024, 0.07)],
              [(0.016, 0.064), (0.03, 0.08), (0.032, 0.11), (0.018, 0.094), (0.006, 0.072)],
              [(-0.009, 0.066), (0.009, 0.066), (0.008, 0.1), (0.0, 0.126), (-0.008, 0.1)],
              [(-0.006, 0.072), (-0.018, 0.094), (-0.032, 0.11), (-0.03, 0.08), (-0.016, 0.064)],
              [(-0.024, 0.07), (-0.04, 0.084), (-0.054, 0.096), (-0.05, 0.068), (-0.03, 0.06)]]
    for y, s in ((-0.0128, 'F'), (0.0128, 'B')):   # each face: the dark arch inlaid in the block, the crest above it
        obs.append(_plate(f'sword_inlay_{s}', slot, y * 1.22, 0.002, leather))
        obs.append(_plate(f'sword_crest_{s}', base, y, 0.0045, P['fit'], bevel=0.1))
        obs += [_plate(f'sword_flame_{s}{k}', f, y, 0.004, P['fit'], bevel=0.12) for k, f in enumerate(flames)]
    obs.append(grip('sword_hilt', GRIP_FOOT, 0.022, 0.0163, leather, kind='octagon', wrap='cross', pitch=0.012,
                    depth=0.0012))   # the size the fist closes round, as every sword's
    obs += [collar('sword_collar_top', 0.017, 0.008, 0.0188, P['fit']),
            collar('sword_collar_foot', GRIP_FOOT - 0.002, 0.009, 0.0215, P['fit'], kind='octagon')]
    obs.append(lathe('sword_pommel', [(0.0, -0.176), (0.0195, -0.176), (0.02, -0.186), (0.0232, -0.222),
                                      (0.0185, -0.233), (0.008, -0.24), (0.0, -0.243)], P['fit'], sides=8,
                     phase=np.pi / 8, smooth=False))
    return obs, 0.042


def _elven(P):
    """The Altmer's: wings of gold sweeping out from the guard, feathered in two layers, the fins' foot drawn to a
    point down into the grip; a slim dark grip bound in crossed gold cords; and a pommel forked as a fish's tail."""
    import materials
    obs = []
    leather = materials.plain('haft.Elven.dark', _linear((40, 30, 22)), rough=0.7, spec=0.3)

    for x, s in ((1.0, 'R'), (-1.0, 'L')):   # a fan of three feathers a side, from level to a little down
        for k, (deg, length, w) in enumerate(((8.0, 0.14, 0.02), (-8.0, 0.124, 0.018), (-24.0, 0.1, 0.016))):
            c, n = math.cos(math.radians(deg)), math.sin(math.radians(deg))
            leaf = [(0.0, 0.0), (0.3 * length, w), (length, 0.0), (0.3 * length, -w)]
            obs.append(_plate(f'sword_wing{k}_{s}', [(x * (0.026 + u * c - v * n), 0.044 + u * n + v * c)
                                                       for u, v in leaf], 0.0, 0.006, P['fit'], bevel=0.15))
    obs.append(lathe('sword_guard', [(0.0, 0.05), (0.03, 0.05), (0.03, 0.04), (0.016, 0.012), (0.013, 0.0)], P['fit'],
                     sides=4, phase=np.pi / 4, squash=0.6, smooth=False))
    obs.append(grip('sword_hilt', GRIP_FOOT, 0.022, 0.0142, leather, wrap='strip', pitch=0.014, depth=0.0006))
    for hand in (1.0, -1.0):   # two gold cords wound opposite ways, crossing in diamonds down the grip
        turns = np.linspace(0.0, 1.0, 120)
        z = GRIP_FOOT + 0.006 + turns * (0.012 - GRIP_FOOT)
        a = hand * 2 * np.pi * 4.5 * turns
        path = [(0.0152 * np.cos(t), 0.0152 * np.sin(t), zz) for t, zz in zip(a, z)]
        side = 'R' if hand > 0 else 'L'
        obs.append(sweep(f'sword_cord_{side}', path, section('round', 0.0014, 0.0014, 8), P['fit']))
    obs += [collar('sword_collar_top', 0.016, 0.008, 0.0165, P['fit']),
            collar('sword_collar_foot', GRIP_FOOT + 0.002, 0.008, 0.0165, P['fit'])]
    for x, s in ((1.0, 'R'), (-1.0, 'L')):   # the fish's tail: a prong out and down each side
        prong = [(0.0, -0.174), (0.014, -0.177), (0.034, -0.2), (0.058, -0.222), (0.074, -0.244), (0.056, -0.241),
                 (0.03, -0.222), (0.0, -0.208)]
        obs.append(_plate(f'sword_pommel_{s}', [(px * x, pz) for px, pz in prong], 0.0, 0.014, P['fit'], bevel=0.12))
    return obs, 0.045


def _dwarven(P):
    """The Dwemer's, all in the blade's olive brass (its own, where its daggers keep the look's): a stepped block
    guard bolted across each face, a dark grip banded thrice, and a stepped six-sided pommel."""
    import materials
    f = P['blade']
    dark = materials.plain('haft.Dwarven.dark', _linear((46, 40, 26)), rough=0.6, spec=0.35)
    obs = [block('sword_guard', (0, 0, 0.033), (0.05, 0.042, 0.03), f, bevel=0.15),
           block('sword_guard_low', (0, 0, 0.015), (0.13, 0.032, 0.012), f, bevel=0.15),
           block('sword_guard_high', (0, 0, 0.0485), (0.09, 0.036, 0.008), f, bevel=0.15)]
    obs += mirror_x(lambda x, s: block(f'sword_guard_{s}', (0.07 * x, 0, 0.022), (0.016, 0.04, 0.032), f, bevel=0.2))
    for x in (-0.015, 0.0, 0.015):   # bolts across each face of the middle block
        obs += [rivet(f'sword_bolt_{x:+.3f}_F', (x, -0.021, 0.033), f, r=0.0036, face=-1.0),
                rivet(f'sword_bolt_{x:+.3f}_B', (x, 0.021, 0.033), f, r=0.0036, face=1.0)]
    obs.append(grip('sword_hilt', GRIP_FOOT, 0.012, 0.018, dark, kind='square', wrap='strip', pitch=0.02,
                    depth=0.0008))
    obs += [collar(f'sword_band_{k}', z, 0.008, 0.0205, f, kind='square') for k, z in
            enumerate((-0.13, -0.08, -0.03))]
    obs += [collar('sword_collar_foot', GRIP_FOOT + 0.004, 0.01, 0.021, f, kind='square')]
    obs.append(lathe('sword_pommel', [(0.02, -0.17), (0.02, -0.178), (0.028, -0.18), (0.028, -0.205),
                                      (0.022, -0.208), (0.022, -0.214), (0.014, -0.216), (0.014, -0.222),
                                      (0.0, -0.224)], f, sides=6, phase=math.pi / 6, smooth=False))
    return obs, 0.052


def _ladder(name, curve, y, w, dark, metal, rungs):
    """A dark band `w` wide along `curve` (points x, z) on the face at `y`, crossed by `rungs` raised bars: a guard's
    or a pommel's chequered panel."""
    c = np.asarray(curve, dtype=np.float64)
    tan = np.gradient(c, axis=0)
    tan /= np.linalg.norm(tan, axis=1, keepdims=True)
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1)
    band = [tuple(p) for p in c + nrm * w / 2] + [tuple(p) for p in (c - nrm * w / 2)[::-1]]
    face = 1.0 if y > 0 else -1.0
    obs = [_plate(f'{name}_band', band, y + face * 0.0005, 0.001, dark)]
    for k, f in enumerate(np.linspace(0.04, 0.96, rungs)):
        i = f * (len(c) - 1)
        p = c[int(i)] + (c[min(int(i) + 1, len(c) - 1)] - c[int(i)]) * (i - int(i))
        t, n = tan[int(round(i))], nrm[int(round(i))]
        u, v = 0.0013 * t, 0.42 * w * n
        obs.append(_plate(f'{name}_rung{k}', [tuple(p - u - v), tuple(p + u - v), tuple(p + u + v), tuple(p - u + v)],
                          y + face * 0.0012, 0.0014, metal))
    return obs


def _mithril(P):
    """An arming sword's: a long guard of flat arms curving toward the blade, a chequered panel down each face; a
    leather grip banded at the guard, its middle and its foot; and a wheel pommel, its rim chequered round. All in
    the blade's steel-blue (its own, where its daggers keep the look's)."""
    import materials
    f = P['blade']
    dark = materials.plain('haft.Mithril.inlay', _linear((34, 38, 46)), rough=0.7, spec=0.3)
    leather = materials.plain('haft.Mithril.leather', _linear((104, 72, 44)), rough=0.75, spec=0.25)
    half, rise, dz, dy = 0.112, 0.03, 0.0155, 0.0095
    xs = np.linspace(-half, half, 31)
    zc = 0.044 - dz
    path = [(x, 0.0, zc + rise * (x / half) ** 2) for x in xs]
    obs = [sweep('sword_guard', path, section('square', dy, dz, 16), f, up=(0, 0, 1))]
    for y, s in ((-dy, 'F'), (dy, 'B')):
        for side, a, b in (('R', 0.012, half - 0.006), ('L', -0.012, -half + 0.006)):
            arm = [(x, zc + rise * (x / half) ** 2) for x in np.linspace(a, b, 16)]
            obs += _ladder(f'sword_panel_{s}{side}', arm, y, 1.25 * dz, dark, f, 11)
    obs.append(grip('sword_hilt', GRIP_FOOT, 0.022, 0.0158, leather, wrap='strip', pitch=0.018, depth=0.001))
    obs += [collar('sword_collar_top', 0.018, 0.01, 0.0176, f),
            collar('sword_band', -0.064, 0.014, 0.0174, f, beads=3),
            collar('sword_collar_foot', GRIP_FOOT + 0.003, 0.012, 0.0178, f)]
    r, zp = 0.038, GRIP_FOOT - 0.035
    obs.append(lathe('sword_pommel', [(0.0, -0.0135), (0.012, -0.0135), (0.02, -0.0118), (0.03, -0.0105),
                                      (0.0355, -0.009), (r, -0.0062), (r, 0.0062), (0.0355, 0.009), (0.03, 0.0105),
                                      (0.02, 0.0118), (0.012, 0.0135), (0.0, 0.0135)], f, sides=40, axis='Y',
                     at=(0.0, 0.0, zp)))
    obs.append(lathe('sword_pommel_rim', [(r - 0.001, -0.0052), (r + 0.0007, -0.0048), (r + 0.0007, 0.0048),
                                          (r - 0.001, 0.0052)], dark, sides=40, axis='Y', at=(0.0, 0.0, zp)))
    for k, a in enumerate(np.linspace(0.0, 2 * np.pi, 30, endpoint=False)):
        if abs(math.sin(a) - 1.0) < 0.05:   # none under the grip's foot
            continue
        c, s_ = math.cos(a), math.sin(a)
        rect = [(0.0, -0.0012), (0.0, 0.0012), (0.0024, 0.0012), (0.0024, -0.0012)]
        pts = [((r - 0.0006 + u) * c - v * s_, zp + (r - 0.0006 + u) * s_ + v * c) for u, v in rect]
        obs.append(_plate(f'sword_pommel_rung{k}', pts, 0.0, 0.0092, f))
    return obs, 0.044


def _adamantium(P):
    """An S-guard's: a block at its middle crowned by four points, one arm swept out and up toward the blade, its end
    a broad paddle, the other out and down toward the pommel; a flared collar under it; a dark grip; and a stepped
    eight-sided cap. All in the blade's steel (its own, where its daggers keep the look's)."""
    import materials
    f = P['blade']
    dark = materials.plain('haft.Adamantium.dark', _linear((30, 34, 36)), rough=0.6, spec=0.35)
    zc = 0.03   # the block's middle: its top the blade's root, a little broader than the blade
    obs = [block('sword_guard', (0.0, 0.0, zc), (0.084, 0.034, 0.04), f, bevel=0.3)]
    for k, (dx, dz) in enumerate(((1, 1), (-1, 1), (1, -1), (-1, -1))):   # the crown's points, out from each corner
        pts = [(0.03 * dx, zc + 0.008 * dz), (0.054 * dx, zc + 0.036 * dz), (0.014 * dx, zc + 0.022 * dz)]
        obs.append(_plate(f'sword_point_{k}', pts, 0.0, 0.026, f, bevel=0.15))
    for y, s in ((-0.016, 'F'), (0.016, 'B')):   # a boss on each face of the block
        obs.append(lathe(f'sword_boss_{s}', [(0.0, y * 1.55), (0.007, y * 1.45), (0.0115, y * 1.15), (0.012, y * 0.9)],
                         f, sides=10, axis='Y', at=(0.0, 0.0, zc)))
    up = [(-0.038, 0.0, 0.034), (-0.055, 0.0, 0.04), (-0.085, 0.0, 0.043), (-0.112, 0.0, 0.049), (-0.13, 0.0, 0.06),
          (-0.14, 0.0, 0.074)]
    down = [(0.038, 0.0, 0.028), (0.055, 0.0, 0.025), (0.08, 0.0, 0.014), (0.099, 0.0, -0.003), (0.11, 0.0, -0.022),
            (0.114, 0.0, -0.04)]
    obs.append(sweep('sword_arm_up', up, section('square', 0.008, 0.013, 16), f, up=(0, 0, 1),
                     scale=lambda t: (1.0, 1.0 + 0.6 * t ** 3)))   # its end a broad paddle
    obs.append(sweep('sword_arm_down', down, section('square', 0.008, 0.013, 16), f, up=(0, 0, 1),
                     scale=lambda t: (1.0, 1.0 + 0.3 * t ** 3)))
    obs.append(lathe('sword_collar', [(0.0, 0.016), (0.0215, 0.016), (0.0225, 0.01), (0.0215, -0.006),
                                      (0.0175, -0.014), (0.0, -0.014)], f, sides=24))
    obs.append(grip('sword_hilt', GRIP_FOOT, -0.01, 0.0162, dark, wrap='bands', pitch=0.022, depth=0.0009))
    obs.append(collar('sword_collar_foot', GRIP_FOOT + 0.002, 0.012, 0.0186, f))
    obs.append(lathe('sword_pommel', [(0.0, -0.172), (0.0205, -0.172), (0.0215, -0.18), (0.0215, -0.192),
                                      (0.016, -0.2), (0.008, -0.204), (0.0, -0.205)], f, sides=8, phase=np.pi / 8,
                     smooth=False))
    return obs, 0.05


def _spike(name, path, r, mat, kind='diamond', flat=0.8, up=(0.0, 0.0, 1.0)):
    return sweep(name, path, section(kind, r, r * flat, 12), mat, scale=lambda t: (1 - 0.85 * t,) * 2, point=True,
                 smooth=False, up=up)


def _chevrons(name, z, r, h, mat, w=0.0016):
    """A pale ring round a grip at `z`, dipping `h` to a V on each face: a chevron down the front and the back."""
    path = [(r * math.sin(a), -r * math.cos(a), z - h * (1 - abs(math.sin(a)))) for a in np.linspace(0, 2 * np.pi, 49)]
    return sweep(name, path, section('square', w, 1.4 * w, 8), mat, up=(0, 0, 1))


def _ebony(P):
    """The Dunmer's: no cross bar, the blade's root flowing into a block, a curl swept out and down from its back
    edge round an eye on each face and a wing swept down from its front; a black grip banded in pale chevrons; and
    a beaked cap. Black, its eyes' rings and chevrons a pale silver."""
    import materials
    f = materials.plain('haft.Ebony.black', _linear((66, 64, 72)), metal=0.5, rough=0.35, spec=0.5)
    pale = materials.plain('edge.Ebony.trim', _linear(LOOK['Ebony']['inlay']), metal=0.8, rough=0.25, spec=0.6)
    obs = [block('sword_guard', (0.0, 0.0, 0.03), (0.044, 0.028, 0.032), f, bevel=0.35)]
    curl = [(-0.014, 0.07), (-0.03, 0.06), (-0.044, 0.044), (-0.05, 0.026), (-0.047, 0.01), (-0.038, -0.002),
            (-0.026, -0.008), (-0.018, -0.002), (-0.03, 0.006), (-0.036, 0.018), (-0.034, 0.034), (-0.022, 0.046),
            (-0.012, 0.05)]
    wing = [(0.014, 0.05), (0.03, 0.042), (0.046, 0.022), (0.054, -0.004), (0.05, -0.02), (0.04, -0.006),
            (0.026, 0.01), (0.014, 0.016)]
    obs += [_plate('sword_curl', curl, 0.0, 0.022, f, bevel=0.18), _plate('sword_wing', wing, 0.0, 0.02, f, bevel=0.18)]
    for y, s in ((-0.0125, 'F'), (0.0125, 'B')):   # the eye on each face, ringed pale
        obs.append(lathe(f'sword_eye_{s}', [(0.0, y * 1.5), (0.006, y * 1.4), (0.008, y * 1.1), (0.0085, y * 0.9)],
                         f, sides=12, axis='Y', at=(-0.012, 0.0, 0.026)))
        obs.append(lathe(f'sword_eye_ring_{s}', [(0.0085, y * 1.3), (0.011, y * 1.3), (0.011, y * 0.9),
                                                 (0.0085, y * 0.9)], pale, sides=16, axis='Y', at=(-0.012, 0.0, 0.026)))
    obs.append(grip('sword_hilt', GRIP_FOOT, 0.016, 0.0158, f, kind='octagon', wrap='strip', pitch=0.02,
                    depth=0.0007))
    obs += [_chevrons(f'sword_chevron_{k}', z, 0.0168, 0.012, pale) for k, z in enumerate((0.008, -0.004, -0.09))]
    beak = [(-0.02, -0.168), (0.02, -0.168), (0.03, -0.188), (0.026, -0.206), (0.004, -0.226), (-0.018, -0.214),
            (-0.024, -0.19)]
    obs.append(_plate('sword_pommel', beak, 0.0, 0.03, f, bevel=0.15))
    obs += [_chevrons(f'sword_pommel_chevron_{k}', z, 0.0172, 0.01, pale) for k, z in enumerate((-0.158, -0.166))]
    return obs, 0.046


def _orcish(P):
    """The Orsimer's: no cross bar, a hooked claw swept down from the root's convex edge toward the pommel; a ruff of
    hide round the root; a grip of crossed leather thongs; and a broad flared cap, flat across the blade's faces. All
    in the blade's olive metal (its own, where its daggers keep the look's)."""
    import materials
    f = P['blade']
    hide = materials.plain('haft.Orcish.hide', _linear((52, 36, 24)), rough=0.85, spec=0.2)
    thong = materials.plain('haft.Orcish.thong', _linear((70, 48, 32)), rough=0.75, spec=0.25)
    obs = [block('sword_guard', (0.0, 0.0, 0.036), (0.034, 0.018, 0.018), f, bevel=0.35)]
    claw = [(0.012, 0.052), (0.036, 0.05), (0.054, 0.04), (0.066, 0.022), (0.069, 0.0), (0.064, -0.02),
            (0.054, -0.036), (0.055, -0.016), (0.052, 0.002), (0.044, 0.018), (0.032, 0.028), (0.014, 0.03)]
    obs.append(_plate('sword_claw', claw, 0.0, 0.016, f, bevel=0.2))   # a crescent outside the blade's bend
    obs.append(lathe('sword_ruff', [(0.0, 0.032), (0.019, 0.032), (0.022, 0.026), (0.021, 0.018), (0.024, 0.012),
                                    (0.018, 0.006), (0.0, 0.006)], hide, sides=14, smooth=False))
    obs.append(grip('sword_hilt', GRIP_FOOT, 0.012, 0.0145, thong, wrap='cross', pitch=0.022, depth=0.0016))
    obs.append(lathe('sword_pommel', [(0.0, -0.164), (0.012, -0.164), (0.014, -0.172), (0.02, -0.182),
                                      (0.034, -0.192), (0.042, -0.198), (0.04, -0.205), (0.026, -0.209),
                                      (0.0, -0.21)], f, sides=20, squash=0.5))
    return obs, 0.044


def _daedric(P):
    """The Daedra's: a black block at the root, a horn curving up from its back and a long hook curving down from its
    front, a spur on the hook; a long grey grip studded down each face; and a crescent blade for a pommel, its points
    up toward the front and down toward the back. Black, its grip grey, a dull red seam round the block."""
    import materials
    f = materials.plain('haft.Daedric.black', _linear((30, 26, 26)), metal=0.5, rough=0.35, spec=0.5)
    grey = materials.plain('haft.Daedric.grey', _linear((112, 108, 110)), metal=0.6, rough=0.4, spec=0.5)
    obs = [block('sword_guard', (0.0, 0.0, 0.032), (0.05, 0.03, 0.026), f, bevel=0.4)]
    obs.append(_spike('sword_horn', [(-0.02, 0, 0.04), (-0.04, 0, 0.046), (-0.054, 0, 0.064), (-0.058, 0, 0.09),
                                     (-0.052, 0, 0.114)], 0.012, f, 'diamond', flat=0.5, up=(0, 1, 0)))
    obs.append(_spike('sword_hook', [(0.02, 0, 0.034), (0.044, 0, 0.028), (0.064, 0, 0.01), (0.074, 0, -0.016),
                                     (0.074, 0, -0.044), (0.066, 0, -0.068)], 0.013, f, 'diamond', flat=0.5,
                      up=(0, 1, 0)))
    obs.append(_spike('sword_spur', [(0.05, 0, 0.022), (0.06, 0, 0.042), (0.062, 0, 0.06)], 0.006, f, 'diamond',
                      flat=0.5, up=(0, 1, 0)))
    obs.append(collar('sword_seam', 0.02, 0.003, 0.0172, P['blade_glow']))
    obs.append(grip('sword_hilt', GRIP_FOOT, 0.02, 0.0135, grey, kind='octagon', wrap='bands', pitch=0.012,
                    depth=0.0007))
    obs += [collar('sword_collar_top', 0.016, 0.01, 0.0165, f, kind='octagon'),
            collar('sword_collar_foot', GRIP_FOOT + 0.002, 0.014, 0.0175, f, kind='octagon', beads=2)]
    crescent = [(-0.012, -0.176), (0.012, -0.178), (0.032, -0.19), (0.05, -0.204), (0.062, -0.214), (0.04, -0.212),
                (0.018, -0.214), (0.0, -0.222), (-0.022, -0.236), (-0.046, -0.246), (-0.03, -0.226), (-0.018, -0.204)]
    obs.append(_plate('sword_pommel', crescent, 0.0, 0.014, f, bevel=0.2))
    return obs, 0.045


# each metal's guard's top, where its blade's root sits
TOPS = {'Iron': 0.044, 'Steel': 0.045, 'Silver': 0.042, 'Elven': 0.045, 'Dwarven': 0.052, 'Mithril': 0.044,
        'Adamantium': 0.05, 'Ebony': 0.046, 'Orcish': 0.044, 'Daedric': 0.045}
HILTS = {'Iron': _iron, 'Steel': _steel, 'Silver': _silver, 'Elven': _elven, 'Dwarven': _dwarven,
         'Mithril': _mithril, 'Adamantium': _adamantium, 'Ebony': _ebony, 'Orcish': _orcish, 'Daedric': _daedric}


def hilt(metal, P=None):
    """`metal`'s sword hilt: its parts, the grip from the pommel up into the guard, whose top is `TOPS[metal]`."""
    obs, top = HILTS[metal](P or palette(metal))
    assert abs(top - TOPS[metal]) < 1e-9, metal
    return obs


HILT_ROLES = ('fit', 'grip', 'blade', 'blade_glow')   # the palette's roles a hilt's parts wear
# the materials of a weapon's hilt, guard and trim, by their palette class (`palette`): its fittings (`blade.`), its
# grip, haft and cords (`haft.`) and its accents (`edge.`). A faction's colour lies on them on a faction's weapon; a
# glow keeps its fire, and a blade or a head (`steel.`) and a haft's wood keep their own.
TRIM_CLASSES = ('blade.', 'haft.', 'edge.')


def is_trim(name):
    """Whether a material, by its name, is a weapon's hilt, guard or trim (`TRIM_CLASSES`)."""
    return name.startswith(TRIM_CLASSES) and 'glow' not in name


def _key(mat):
    """A captured part's material as a name: its palette role, or a material a hilt makes of its own (silver's braid)
    by its name, a copy's `.001` dropped."""
    return mat if isinstance(mat, str) else re.sub(r'\.\d{3}$', '', mat.name)


def hilt_materials(metal):
    """Every material `metal`'s hilt wears, by the names hilt_arrays gives them: its palette's roles and the materials
    it makes of its own. Made in Blender's current scene."""
    global _CAPTURE
    P = palette(metal)
    _CAPTURE = []
    try:
        hilt(metal, P)
        parts = _CAPTURE
    finally:
        _CAPTURE = None
    own = {_key(m): m for _, _, m, _, _ in parts if not any(m is P[r] for r in HILT_ROLES if r in P)}
    return {**{r: P[r] for r in HILT_ROLES if r in P}, **own}


def hilt_arrays(metal):
    """`metal`'s sword hilt as `hilt` makes it, read as arrays: (vertices, triangles, each triangle's material name - a
    role in HILT_ROLES or one the hilt makes of its own -, and each triangle's part's name: `sword_hilt` the grip's
    wrap). A part made flat has vertices of its own on each face, so it shades flat when drawn smooth."""
    global _CAPTURE
    _CAPTURE = []
    try:
        hilt(metal, {role: role for role in HILT_ROLES})
        parts = _CAPTURE
    finally:
        _CAPTURE = None
    vs, ts, roles, names, base = [], [], [], [], 0
    for v, faces, role, smooth, name in parts:
        tris = [(f[0], f[k], f[k + 1]) for f in faces for k in range(1, len(f) - 1)]
        if smooth:
            vs.append(v)
            ts += [(a + base, b + base, c + base) for a, b, c in tris]
            base += len(v)
        else:
            for a, b, c in tris:
                vs.append(v[[a, b, c]])
                ts.append((base, base + 1, base + 2))
                base += 3
        roles += [_key(role)] * len(tris)
        names += [name] * len(tris)
    return np.concatenate(vs), np.array(ts, dtype=np.int64), roles, names
