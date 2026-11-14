"""Each gun's paper-doll and list pictures, rendered from its forge model (guns3p.py). A doll picture is drawn as the
doll draws a weapon in the hand: seen in profile at the doll's scale (`DOLL_PX_M`), hung from the fist with its muzzle
down at the angle its hand holds it, outlined dark as a painted weapon is, and the fist's gap cut across its grip so
the doll's hand shows through. The game snaps it to the player's palette as it is decoded
(src/systems/textureReplacement.js `look`). A list picture (`ICONS`) is the whole gun level, its muzzle to the left,
at the list's scale, in each finish: what the inventory, the hotbar and every list draw (src/systems/thunderlock.js
and pistolet.js, records 1 and 3).

    python -I tools/sprite-forge/gunpics.py --out public/art [--samples 64]

Writes `<name>.png` for each of `PICTURES` and `ICONS` and prints where a doll picture's fist lies in it: the gap's
middle, which src/systems/thunderlock.js and pistolet.js seat on the doll's fist."""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402,F401  (Blender's mathutils, which the models need, comes with it)
import numpy as np  # noqa: E402

import guns3p  # noqa: E402

# the doll's pixels a metre: Daggerfall's doll draws a long sword about 93 px long and a staff 174 (TEXTURE.234)
DOLL_PX_M = 85.0
# each picture: its gun, finish and hand, how far its muzzle points below level (degrees) and to which side of the
# picture (1 its right). The right hand's Thunderlock and Pistolet point down across the body to the picture's right,
# as the doll's long sword and claymore do and as the owner hung the right hand's Pistolet; the left hand's Pistolet
# points down and out to the picture's left, as the owner hung it
PICTURES = {
    'thunderlock-doll': ('thunderlock', 'plain', 38.0, 1),
    'thunderlock-doll-gilded': ('thunderlock', 'gilded', 38.0, 1),
    'pistolet-doll': ('pistolet', 'plain', 60.0, 1),
    'pistolet-doll-gilded': ('pistolet', 'gilded', 60.0, 1),
    'pistolet-doll-left': ('pistolet', 'plain', 45.0, -1),
    'pistolet-doll-left-gilded': ('pistolet', 'gilded', 45.0, -1),
}
# each list picture: its gun and finish, its muzzle raised (degrees below level, so negative) to the picture's right,
# so its lock shows, and its pixels a metre. A list fits its picture to a square-ish tile, so the rifle lies on a
# diagonal and the pistol nearly level, each drawn about a weapon's median size, which a tile shrinks smoothly
ICONS = {
    'thunderlock-list': ('thunderlock', 'plain', -32.0, 1, 120.0),
    'thunderlock-list-gilded': ('thunderlock', 'gilded', -32.0, 1, 120.0),
    'pistolet-list': ('pistolet', 'plain', -12.0, 1, 150.0),
    'pistolet-list-gilded': ('pistolet', 'gilded', -12.0, 1, 150.0),
}
# the fist's gap: a band across the grip at its middle, `thick` pixels along the grip and `length` across it, so the
# barrel stays above the fist and the butt below it (tools/gunPaperdoll.mjs `punchBand`)
GAP = {'thunderlock': (5.0, 12.0), 'pistolet': (5.0, 11.0)}
OUTLINE = 0.45   # the outline's darkness, a share of the edge texel's colour (fpinstruments.py ICON_OUTLINE)
MARGIN = 2       # clear pixels round the gun before it is cut to what it draws


def ways(degrees, side):
    """The muzzle's way and the top's in the picture's plane (world X right, Z up): down at `degrees` to `side`, the
    top square to it and upward."""
    a = math.radians(degrees)
    muzzle = np.array([side * math.cos(a), 0.0, -math.sin(a)])
    top = np.array([side * math.sin(a), 0.0, math.cos(a)])
    return muzzle, top


def grip_way(muzzle, top, kind):
    """Up the raked grip, toward the barrel (guns3p.py RAKE)."""
    r = math.radians(guns3p.rake(kind))
    return top * math.cos(r) + muzzle * math.sin(r)


def gap(pic, fist, along, thick, length):
    """Cut the band across the grip: clear every pixel whose middle lies within `thick` / 2 of the fist along the grip
    (`along`, the picture's x right, y down) and `length` / 2 across it. Gives how many it cleared."""
    h, w = pic.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w] + 0.5
    dx, dy = xs - fist[0], ys - fist[1]
    a = np.array(along) / np.linalg.norm(along)
    on = (np.abs(dx * a[0] + dy * a[1]) <= thick / 2) & (np.abs(-dx * a[1] + dy * a[0]) <= length / 2) & (pic[..., 3] > 0)
    pic[on] = 0
    return int(on.sum())


def render(out, name, samples):
    """One picture: the gun laid in the picture's plane, rendered at its scale, outlined, a doll picture's gap cut, and
    cut to what it draws. Gives its path and its fist (pixels; a list picture's, where its grip's middle lies)."""
    from mathutils import Matrix, Vector
    from PIL import Image
    import fpforge
    import stage
    icon = name in ICONS
    kind, finish, degrees, side, px_m = ICONS[name] if icon else (*PICTURES[name], DOLL_PX_M)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    obs = guns3p.BUILD[kind](finish)   # its materials dressed as every view of it is (guns3p.materials_of)
    muzzle, top = ways(degrees, side)
    belly = -top
    M = Matrix((belly, np.cross(muzzle, belly), muzzle)).transposed().to_4x4()   # the gun's frame: +X belly, +Z muzzle
    for ob in obs:
        ob.matrix_world = M
    pts = np.concatenate([np.array([M @ v.co for v in ob.data.vertices]) for ob in obs])
    lo, hi = pts.min(axis=0), pts.max(axis=0)
    w = int(math.ceil((hi[0] - lo[0]) * px_m)) + 2 * MARGIN
    h = int(math.ceil((hi[2] - lo[2]) * px_m)) + 2 * MARGIN
    centre = (lo + hi) / 2
    sc = bpy.context.scene
    cam = bpy.data.objects.new('eye', bpy.data.cameras.new('eye'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(w, h) / px_m
    cam.location = (centre[0], -5.0, centre[2])
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)   # looking along +Y, up +Z, right +X
    sc.camera = cam
    for way, energy in (((0.8, 0.6, -0.8), 3.5), ((-0.3, 1.0, 0.2), 1.0)):   # a key from the eye's upper left, a fill
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
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x, sc.render.resolution_y = w, h
    tmp = os.path.join(out, f'.{name}.png')
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    pic = np.array(Image.open(tmp).convert('RGBA'))
    os.remove(tmp)
    pic[..., 3] = np.where(pic[..., 3] > 127, 255, 0)
    pic[pic[..., 3] == 0] = 0
    pic = fpforge.outlined(pic, OUTLINE)
    # the fist: the gun's origin, where the fist closes on the grip's middle
    fist = (w / 2 + (0.0 - centre[0]) * px_m, h / 2 - (0.0 - centre[2]) * px_m)
    g = grip_way(muzzle, top, kind)
    cut = 0 if icon else gap(pic, fist, (g[0], -g[2]), *GAP[kind])
    ys, xs = np.nonzero(pic[..., 3])
    y0, x0 = ys.min(), xs.min()
    pic = pic[y0:ys.max() + 1, x0:xs.max() + 1]
    fist = (round(float(fist[0] - x0), 2), round(float(fist[1] - y0), 2))
    path = os.path.join(out, f'{name}.png')
    stage.write_png(path, pic)
    return path, pic.shape[1], pic.shape[0], fist, cut


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--only', default='', help='these pictures alone (comma-separated names)')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for name in [n for n in (*PICTURES, *ICONS) if not args.only or n in args.only.split(',')]:
        path, w, h, fist, cut = render(args.out, name, args.samples)
        print(f'{path}: {w}x{h}, the fist at {fist}, {cut} px cut for it', flush=True)


if __name__ == '__main__':
    main()
