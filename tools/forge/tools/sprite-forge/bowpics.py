"""Each bow's held picture for the layered bodies (src/player/eyeOfTheBeholder/layeredWeapon.js): the long and the short
bow of every metal (bows.py, seen from its side) braced and seen in its own plane, as the paper doll's bow picture is -
its string a line a pixel wide from nock to nock, a gap in the limb at the grip for the hand - so a body holding a bow
holds that metal's own, in that metal's colours (metals.py). The short bow is recurved, as first person draws it.

    python -I tools/sprite-forge/bowpics.py --out public/art/studio/forge/bows [--metals Iron,Daedric] [--samples 32]

Writes `<code>.png`, the layered body's weapon code (`lb9` the daedric long bow, `sb0` the iron short bow)."""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import bows  # noqa: E402

PX_CM = 3.0     # pixels a centimetre
HALF = 0.66     # the long bow's limb, grip to tip (gear.py BOW_HALF)
# each bow's limb a share of HALF, the radians its braced limb turns grip to tip, and those its last share turns back
# toward the target: the long bow an even arc (gear.py BOW_ARC), the short bow recurved as first person draws it
SHAPES = {'lb': (1.0, 0.336, 0.0), 'sb': (0.75, 0.55, 0.9)}
RECURVE_FROM = 0.72   # the share of the limb where the recurve starts (fpbow.py _bend)
GAP = 0.045     # metres of the limb either side of the grip the hand covers, left out
STRING = (104, 96, 80, 255)   # the string's colour, as the layered body draws a bow's


def _bent(p, half, arc, recurve):
    """Points of the straight bow (limbs along +-Z, its back toward -Y) braced: each limb keeps its length, turning `arc`
    radians evenly toward +Y (the string's side) as it goes, and over its last share `recurve` back again."""
    s = np.linspace(0.0, 1.6 * half, 4001)
    turn = arc * s / half - recurve * np.clip((s / half - RECURVE_FROM) / (1 - RECURVE_FROM), 0.0, 1.0) ** 2
    ds = s[1] - s[0]
    run = lambda f: np.concatenate([[0.0], np.cumsum((f[1:] + f[:-1]) / 2 * ds)])   # noqa: E731
    ys, zs = run(np.sin(turn)), run(np.cos(turn))
    z = np.abs(p[:, 2])
    side = np.sign(p[:, 2])
    a = side * np.interp(z, s, turn)
    return np.stack([p[:, 0], np.interp(z, s, ys) + p[:, 1] * np.cos(a),
                     side * np.interp(z, s, zs) - p[:, 1] * np.sin(a)], axis=1)


def pieces(metal, shape):
    """The bow's pieces, braced: [(vertices, triangles, stuff)]."""
    share, arc, recurve = SHAPES[shape]
    half = HALF * share
    s = np.linspace(GAP, half, 40)
    r = 0.018 - 0.007 * s / half   # the stave's girth, thickest at the grip (gear.py)
    out = []
    for sign in (1.0, -1.0):
        c = np.stack([np.zeros_like(s), np.zeros_like(s), sign * s], axis=1)
        back = np.tile([0.0, -1.0, 0.0], (len(s), 1))
        for v, q, kind in bows.limb(bows.look(metal), c, back, r, r, (1.0, 0.0, 0.0), seen='side', span=half - GAP,
                                    own=True):
            out.append((_bent(v, half, arc, recurve), q, kind))
    return out


def string(parts):
    """The braced string as (y, z) points from the upper tip to the lower: taut round the bow's string side (+Y), as
    the convex hull of the bow seen in its own plane - from nock to nock, lying along the belly of a recurve."""
    pts = np.unique(np.round(np.concatenate([v[:, [2, 1]] for v, _, _ in parts]), 5), axis=0)   # (z, y), by z
    chain = []   # Andrew's monotone chain: the hull's +Y side, z rising
    for p in pts:
        while len(chain) >= 2:
            (z0, y0), (z1, y1) = chain[-2], chain[-1]
            if (z1 - z0) * (p[1] - y0) - (y1 - y0) * (p[0] - z0) < 0:   # a right turn keeps the corner
                break
            chain.pop()
        chain.append(p)
    return np.array(chain)[::-1, ::-1]


def render(out, metal, shape, samples):
    import bpy
    import materials
    import metals
    from mathutils import Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts = pieces(metal, shape)
    cord = string(parts)
    P = metals.palette(metal)
    wood = metals._linear(bows.WOODS[metal]) if metal in bows.WOODS else (0.35, 0.17, 0.06)
    # a glow is its blade's deep red seam where it has one: a daedric core in the bright glow came out white
    stuff = {'wood': materials.plain('wood', wood, rough=0.5), 'metal': P['metal'], 'head': P['metal'],
             'accent': P['accent'], 'grip': P['grip'], 'vein': P.get('blade_glow', P.get('glow', P['accent'])),
             'cord': materials.plain('cord', (0.42, 0.33, 0.2), rough=0.9)}
    sc = bpy.context.scene
    for v, q, kind in parts:
        me = bpy.data.meshes.new('bow')
        me.from_pydata(v.tolist(), [], q.tolist())
        me.materials.append(stuff[kind])
        me.update()
        me.shade_smooth()
        sc.collection.objects.link(bpy.data.objects.new('bow', me))
    lo = np.min([v.min(axis=0) for v, _, _ in parts], axis=0) - 0.02
    hi = np.max([v.max(axis=0) for v, _, _ in parts], axis=0) + 0.02
    w, h = int(math.ceil((hi[1] - lo[1]) * 100 * PX_CM)), int(math.ceil((hi[2] - lo[2]) * 100 * PX_CM))
    cam = bpy.data.objects.new('eye', bpy.data.cameras.new('eye'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(w, h) / (100 * PX_CM)
    centre = (lo + hi) / 2
    cam.location = (-5.0, centre[1], centre[2])
    cam.rotation_euler = (math.radians(90), 0.0, math.radians(-90))   # looking along +X, up +Z, right -Y
    sc.camera = cam
    for way, energy in (((1.0, 0.6, -0.8), 3.5), ((0.3, -1.0, 0.2), 1.0)):   # a key from the eye's upper left, a fill
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        sun.data.energy = energy
        sun.rotation_euler = Vector(way).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(sun)
    sc.world = bpy.data.worlds.new('world')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.25, 0.25, 0.25, 1)
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.filter_width = 0.01   # a pixel's colour is the one surface at its middle: hard edges, as a sprite's
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = w, h
    tmp = os.path.join(out, '.bowpic.png')
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    import stage
    from PIL import Image
    pic = np.array(Image.open(tmp).convert('RGBA'))
    os.remove(tmp)
    pic[..., 3] = np.where(pic[..., 3] > 127, 255, 0)
    scale = 100 * PX_CM

    def px(y, z):   # a point in the bow's plane to the picture's pixel: right is -Y, up +Z
        return w / 2 - (y - centre[1]) * scale, h / 2 - (z - centre[2]) * scale
    for (ya, za), (yb, zb) in zip(cord[:-1], cord[1:]):   # the string, a pixel wide, over the bow
        (x0, y0), (x1, y1) = px(ya, za), px(yb, zb)
        for t in np.linspace(0.0, 1.0, int(max(abs(x1 - x0), abs(y1 - y0))) * 2 + 2):
            x, y = int(round(x0 + (x1 - x0) * t)), int(round(y0 + (y1 - y0) * t))
            if 0 <= x < w and 0 <= y < h:
                pic[y, x] = STRING
    path = os.path.join(out, f'{shape}{bows.METALS.index(metal)}.png')
    stage.write_png(path, pic)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--metals', default=','.join(bows.METALS))
    ap.add_argument('--samples', type=int, default=32)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for metal in [m for m in args.metals.split(',') if m]:
        for shape in ('lb', 'sb'):
            print(render(args.out, metal, shape, args.samples), flush=True)


if __name__ == '__main__':
    main()
