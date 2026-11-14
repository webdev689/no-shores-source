"""The hip lantern's pictures for the Eye of the Beholder sprites (src/player/eyeOfTheBeholder/eotbLantern.js):
Daggerfall's Lantern (TEXTURE.200 record 10) made whole - a six-sided iron cage under a bell cap, amber panes lit by
the candle in it, a ring to hang it by and a knob at its foot - HEIGHT tall, at the density of Daggerfall's picture.

    python -I tools/sprite-forge/lanternpics.py --out public/art/studio/forge/lantern [--samples 64]

Writes `lantern.png`, one sheet: a row a view, a column a tilt. Row k is the sprite's view k (eotbBillboard.js
orientationFor: 0 the eye before the body, 2 off its right, 4 behind it); the left's views hide the right hip, so none
is drawn. Column j is the lantern swung TILTS[j] degrees, its foot toward the eye (negative: away). Every cell hangs
from one pixel, its ring's top (HOOK); the sheet's `oFFs` is a cell's top-left from it. The game turns a cell in the
view plane by the swing's sway (systems/lanternSwing.js), so the cells hold only the swing along the line of sight."""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

HEIGHT = 0.3        # metres, the ring's top to the knob's foot (systems/lanternSwing.js HIP_LANTERN_HEIGHT)
PX_M = 128.0        # pixels a metre: Daggerfall's picture draws the lantern 38 pixels tall
VIEWS = 5           # the sprite's views 0..4: the eye before it, round its right side, to behind it
TILTS = (-30, -15, 0, 15, 30)   # degrees the foot swings toward the eye; the swing stops at 35 (LANTERN_SWING)
CELL = (24, 42)     # a cell's width and height, pixels
HOOK = (12, 1)      # the ring's top in a cell: the middle of its width, a pixel below its top
SIDES = 6           # the cage's sides: one faces the sprite's front, as Daggerfall's picture shows a pane
# the colours, as sRGB and read off Daggerfall's picture: iron; the panes' light from beside the flame outward and
# toward their edges as seen; what a near pane lets through; the candle as the amber panes show it; the flame
IRON = (66, 66, 70)
GLASS = ((254, 245, 185), (255, 215, 141), (255, 185, 98), (241, 167, 54), (212, 119, 39))
AMBER = (255, 236, 200)
WAX = (255, 184, 92)
FLAME = (255, 240, 170)
FLAME_AT = -0.157   # metres below the hook, the flame's heart: the panes are brightest beside it
# the parts' heights, metres below the hook (z is up, the hook at 0)
RING = (0.0075, 0.0045)                 # the ring's radius and its wire's: edge on, two pixels wide as Daggerfall's
CAP = (-0.034, -0.080)                  # the bell cap, from its collar to its brim
BODY = (-0.089, -0.212)                 # the panes, between the cap's band and the foot's
BAND = 0.009                            # each band's height
BOWL = (-0.221, -0.262)                 # the foot's bowl
CANDLE = (-0.212, -0.168, 0.011)        # its foot, its top and its radius


def srgb(c):
    """An sRGB colour (0-255) as Blender's linear one."""
    def one(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return tuple(one(v) for v in c)


def lathe(profile, sides, closed_top=False, closed_foot=False, loop=False):
    """A solid of turning: `profile` (radius, z) top to foot turned round z in `sides` steps, a corner on +X. A six-
    sided one's radius is its corners'. `loop` joins the profile's last point to its first (a band's section)."""
    verts, faces = [], []
    n = len(profile)
    for r, z in profile:
        for k in range(sides):
            a = 2 * math.pi * k / sides
            verts.append((r * math.cos(a), r * math.sin(a), z))
    rows = n if loop else n - 1
    for i in range(rows):
        j = (i + 1) % n
        for k in range(sides):
            k1 = (k + 1) % sides
            faces.append((i * sides + k, j * sides + k, j * sides + k1, i * sides + k1))
    if closed_top:
        verts.append((0.0, 0.0, profile[0][1]))
        faces += [(len(verts) - 1, k1, k) for k, k1 in ((k, (k + 1) % sides) for k in range(sides))]
    if closed_foot:
        verts.append((0.0, 0.0, profile[-1][1]))
        base = (n - 1) * sides
        faces += [(len(verts) - 1, base + k, base + (k + 1) % sides) for k in range(sides)]
    return verts, faces


def torus(major, minor, centre, steps=16, around=8):
    """A ring in the plane of y and z (the sprite's forward and up): seen edge on from the front, whole from the side."""
    verts, faces = [], []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        for k in range(around):
            b = 2 * math.pi * k / around
            r = major + minor * math.cos(b)
            verts.append((minor * math.sin(b), centre[1] + r * math.cos(a), centre[2] + r * math.sin(a)))
    for i in range(steps):
        for k in range(around):
            i1, k1 = (i + 1) % steps, (k + 1) % around
            faces.append((i * around + k, i1 * around + k, i1 * around + k1, i * around + k1))
    return verts, faces


def post(angle, radius, top, foot, half=0.004):
    """A square bar up a corner of the cage, `half` its half-width, faced along the corner's radius."""
    c, s = math.cos(angle), math.sin(angle)
    verts = []
    for z in (top, foot):
        for dr, dt in ((-half, -half), (half, -half), (half, half), (-half, half)):
            r = radius + dr
            verts.append((r * c - dt * s, r * s + dt * c, z))
    faces = [(0, 1, 2, 3), (7, 6, 5, 4)] + [(k, k + 4, (k + 1) % 4 + 4, (k + 1) % 4) for k in range(4)]
    return verts, faces


def pieces():
    """The lantern's pieces: [(vertices, faces, stuff)], z up and the ring's top at the origin."""
    out = []
    major, minor = RING
    out.append((*torus(major, minor, (0.0, 0.0, -(major + minor))), 'ring'))
    out.append((*lathe([(0.0015, -0.019), (0.0045, -0.0205), (0.0058, -0.024), (0.0052, -0.028), (0.003, -0.030),
                        (0.003, -0.033), (0.016, -0.034)], 12, closed_top=True), 'iron'))   # the finial and its collar
    top, brim = CAP
    bell = [(0.013 + 0.055 * t ** 1.7, top - (top - brim) * t) for t in np.linspace(0.0, 1.0, 9)]
    out.append((*lathe([(0.016, top)] + bell, SIDES, closed_top=True), 'iron'))
    r_out, r_in = 0.072, 0.061
    for z in (brim, BODY[1]):   # the cap's band and the foot's, each a six-sided ring
        out.append((*lathe([(r_in, z), (r_out, z), (r_out, z - BAND), (r_in, z - BAND)], SIDES, loop=True), 'iron'))
    for k in range(SIDES):
        out.append((*post(2 * math.pi * k / SIDES, 0.066, brim - BAND, BODY[1]), 'iron'))
    out.append((*lathe([(0.064, brim - BAND), (0.064, BODY[1])], SIDES), 'glass'))
    out.append((*lathe([(0.062, BODY[1]), (0.0, BODY[1])], SIDES), 'iron'))   # the floor the candle stands on
    bowl_top, bowl_foot = BOWL
    bowl = [(0.018 + 0.05 * (1 - t ** 2), bowl_top - (bowl_top - bowl_foot) * t) for t in np.linspace(0.0, 1.0, 8)]
    knob = [(0.006, -0.270), (0.009, -0.276), (0.0095, -0.283), (0.007, -0.292), (0.003, -0.298),
            (0.0, -HEIGHT)]
    out.append((*lathe(bowl + knob, SIDES, closed_top=True), 'iron'))
    foot, wick, r = CANDLE
    out.append((*lathe([(0.0, wick), (r, wick), (r, foot)], 16), 'wax'))
    out.append((*lathe([(0.0, wick - 0.002), (0.0045, -0.162), (0.0055, FLAME_AT), (0.0042, -0.150),
                        (0.0015, -0.143), (0.0, -0.139)][::-1], 12), 'flame'))
    return out


def _glass():
    """The panes, lit by the flame: palest level with it and facing the eye, deeper amber up and down from it and where
    a pane turns away. A near pane lets some of the inside through, amber (the candle reads against the far panes);
    a far pane is met from inside, by its back, and lets nothing through, so the cage reads solid."""
    m = bpy.data.materials.new('glass')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    new, link = nt.nodes.new, nt.links.new

    def math_node(op, a, b):
        n = new('ShaderNodeMath')
        n.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, float):
                n.inputs[i].default_value = v
            else:
                link(v, n.inputs[i])
        return n.outputs['Value']
    coord = new('ShaderNodeTexCoord')
    squash = new('ShaderNodeVectorMath')   # the light falls off more slowly up and down the pane than across it
    squash.operation = 'MULTIPLY'
    squash.inputs[1].default_value = (1.0, 1.0, 0.5)
    link(coord.outputs['Object'], squash.inputs[0])
    dist = new('ShaderNodeVectorMath')
    dist.operation = 'DISTANCE'
    dist.inputs[1].default_value = (0.0, 0.0, FLAME_AT * 0.5)
    link(squash.outputs['Vector'], dist.inputs[0])
    span = new('ShaderNodeMapRange')
    span.inputs['From Min'].default_value = 0.058
    span.inputs['From Max'].default_value = 0.085
    link(dist.outputs['Value'], span.inputs['Value'])
    turn = new('ShaderNodeLayerWeight')
    turn.inputs['Blend'].default_value = 0.5
    fac = math_node('ADD', math_node('MULTIPLY', span.outputs['Result'], 0.6),
                    math_node('MULTIPLY', turn.outputs['Facing'], 0.9))
    ramp = new('ShaderNodeValToRGB')
    stops = ramp.color_ramp.elements
    while len(stops) < len(GLASS):
        stops.new(0.5)
    for k, (e, c) in enumerate(zip(stops, GLASS)):
        e.position, e.color = k / (len(GLASS) - 1), (*srgb(c), 1.0)
    link(fac, ramp.inputs['Fac'])
    glow = new('ShaderNodeEmission')
    glow.inputs['Strength'].default_value = 1.0
    link(ramp.outputs['Color'], glow.inputs['Color'])
    see = new('ShaderNodeBsdfTransparent')
    see.inputs['Color'].default_value = (*srgb(AMBER), 1.0)
    geo = new('ShaderNodeNewGeometry')
    share = math_node('MULTIPLY', math_node('SUBTRACT', 1.0, geo.outputs['Backfacing']), 0.6)
    mix = new('ShaderNodeMixShader')
    link(share, mix.inputs['Fac'])
    link(glow.outputs['Emission'], mix.inputs[1])
    link(see.outputs['BSDF'], mix.inputs[2])
    link(mix.outputs['Shader'], new('ShaderNodeOutputMaterial').inputs['Surface'])
    return m


def _glowing(name, rgb, strength, lit=1.0):
    """A surface that glows `rgb`, and takes `lit` of the light that falls on it (the wax beside the flame would wash
    out white and lose the colour the panes give it)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*(v * lit for v in srgb(rgb)), 1)
    b.inputs['Emission Color'].default_value = (*srgb(rgb), 1)
    b.inputs['Emission Strength'].default_value = strength
    return m


def build():
    """The lantern as one object, its materials by piece."""
    import materials
    # the ring rougher than the cage: a glint on its curve is a lone white pixel at sprite size
    stuff = {'iron': materials.plain('iron', srgb(IRON), metal=0.3, rough=0.35),
             'ring': materials.plain('ring', srgb(IRON), metal=0.3, rough=0.7), 'glass': _glass(),
             'wax': _glowing('wax', WAX, 1.0, lit=0.15), 'flame': _glowing('flame', FLAME, 6.0)}
    order = list(stuff)
    verts, faces, kinds = [], [], []
    for v, f, kind in pieces():
        base = len(verts)
        verts += [tuple(p) for p in v]
        faces += [tuple(base + i for i in q) for q in f]
        kinds += [order.index(kind)] * len(f)
    me = bpy.data.meshes.new('lantern')
    me.from_pydata(verts, [], faces)
    for kind in order:
        me.materials.append(stuff[kind])
    me.polygons.foreach_set('material_index', kinds)
    me.update()
    ob = bpy.data.objects.new('lantern', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def frame(cam):
    """The camera at PX_M, looking down as the bodies' does (stage.ELEVATION), the hook landing on HOOK."""
    import stage
    w, h = CELL
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = w, h
    cam.data.ortho_scale = max(w, h) / PX_M
    e = math.radians(stage.ELEVATION)
    cam.rotation_euler = (math.pi / 2 - e, 0, 0)
    up = Vector((0, math.sin(e), math.cos(e)))
    fwd = Vector((0, math.cos(e), -math.sin(e)))
    centre = up * ((HOOK[1] - h / 2) / PX_M) - Vector((1, 0, 0)) * ((HOOK[0] - w / 2) / PX_M)
    cam.location = centre - fwd * 4


def pose(ob, view, tilt):
    """The lantern turned to the sprite's view `view` (its front to the eye at 0, its right at 2) and swung `tilt`
    degrees about the hook, its foot toward the eye: the eye looks along +y, so toward it is -y."""
    ob.matrix_world = Matrix.Rotation(math.radians(-tilt), 4, 'X') @ Matrix.Rotation(math.radians(45.0 * view), 4, 'Z')


def render(out, samples):
    import stage
    bpy.ops.wm.read_factory_settings(use_empty=True)
    cam = stage.setup(samples)
    frame(cam)
    ob = build()
    w, h = CELL
    sheet = np.zeros((h * VIEWS, w * len(TILTS), 4), np.uint8)
    tmp = os.path.join(out, '.lantern.png')
    for view in range(VIEWS):
        for j, tilt in enumerate(TILTS):
            pose(ob, view, tilt)
            cell = stage.render_rgba(tmp)
            on = cell[..., 3] > 0
            ys, xs = np.nonzero(on)
            assert len(xs) and ys.min() > 0 and xs.min() > 0 and xs.max() < w - 1 and ys.max() < h - 1, \
                f'view {view} tilt {tilt}: the lantern runs past its cell'
            sheet[view * h:(view + 1) * h, j * w:(j + 1) * w] = cell
    os.remove(tmp)
    path = os.path.join(out, 'lantern.png')
    stage.write_png(path, sheet, (-HOOK[0], -HOOK[1]))
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--samples', type=int, default=64)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    print(render(args.out, args.samples), flush=True)


if __name__ == '__main__':
    main()
