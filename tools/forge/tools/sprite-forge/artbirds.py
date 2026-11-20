"""The Arts' birds: Divine's Dawnflare, a bird of fire, and Shadow's Duskraven, a raven, each in its four wing beats
(up, half down, down, half up), seen a little from above in the forge's five views as its figures are: facing the
eye, then turned to the eye's left an eighth at a time to its back (the other three are these mirrored).

    python -I tools/sprite-forge/artbirds.py --out public/art/arts/birds

Each frame is a brightness map, not a colour: the game turns its light into the four steps of the caster's element,
so one render serves any Art. Writes `<bird>-<view>-<beat>.png` at the bird's size in the game's figure pixels, grey
in its colour and its cover in its alpha, each view the same size, the body in its middle. Renders with Cycles on the
CPU at four times the size, then each block of texels is averaged down, so its edges are clean at the game's size."""
import argparse
import math
import os

import bpy
import numpy as np
from mathutils import Vector

# Each bird's frame in figure pixels, as the game draws it, and the metres of the bird's own measure it spans: wide
# and tall enough for its tail, its spread wings and its raised ones in every view, at the same pixels a unit.
# Each as long side on as the spell's own bird was drawn: the phoenix 78 pixels, the raven 23.
BIRDS = {'fire': (110, 110), 'raven': (40, 40)}
SPANS = {'fire': 8.35, 'raven': 7.13}
# The bird turned in each of the forge's views (its head on +X): facing the eye, then to the eye's left to its back,
# as forge.py's VIEW_YAW turns a figure.
VIEW_YAW = [-90.0, -135.0, -180.0, -225.0, -270.0]
OVERSAMPLE = 4
# How far back from straight out a wing reaches from its shoulder, degrees.
SWEEP_BACK = 28
# The wings' turn about the body's long axis at each beat, degrees (up on +), the hand's fold, and their twist about
# their own length (the trailing edge up on +): a bird's wing twists through its stroke, trailing edge up on the way
# down and down on the way up, so its face, edge on from ahead and behind, turns to the front on the downstroke and
# to the back on the upstroke.
BEATS = [(62, 18, -10), (8, 6, 30), (-55, -10, 10), (20, 26, -25)]


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, light, glow=0.0):
    """A grey surface of `light` (0 dark to 1 white), lit by the scene, glowing `glow` of its own."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (light, light, light, 1)
    bsdf.inputs['Roughness'].default_value = 0.7
    if glow:
        bsdf.inputs['Emission Color'].default_value = (1, 1, 1, 1)
        bsdf.inputs['Emission Strength'].default_value = glow
    return mat


def blob(name, at, radii, mat, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=at)
    ob = bpy.context.object
    ob.name = name
    ob.scale = radii
    ob.data.materials.append(mat)
    if parent:
        ob.parent = parent
    bpy.ops.object.shade_smooth()
    return ob


def feather(name, root, tip, width, mat, parent=None, curl=0.0, normal=(0, 0, 1), bend=0.0):
    """A flat tapered feather from `root` to `tip`, `width` wide at its middle, lying in the plane whose normal is
    `normal`: its tip curled out of that plane by `curl` and bent across it, in the plane, by `bend`."""
    root, tip = Vector(root), Vector(tip)
    up = Vector(normal).normalized()
    along = tip - root
    side = along.cross(up).normalized()
    verts, faces = [], []
    steps = 8
    for k in range(steps + 1):
        t = k / steps
        half = width * math.sin(math.pi * min(1.0, t * 1.15)) * (1.0 - 0.6 * t) / 2 + 0.01
        centre = root + along * t + up * (curl * t * t) + side * (bend * t * t)
        verts += [centre + side * half, centre - side * half]
    for k in range(steps):
        a = 2 * k
        faces.append((a, a + 1, a + 3, a + 2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    mod = ob.modifiers.new('thick', 'SOLIDIFY')
    mod.thickness = 0.03
    if parent:
        ob.parent = parent
    return ob


def cone(name, root, tip, radius, mat, parent=None):
    root, tip = Vector(root), Vector(tip)
    along = tip - root
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=radius, radius2=0.0, depth=along.length,
                                    location=root + along / 2)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(along.normalized())
    ob.data.materials.append(mat)
    if parent:
        ob.parent = parent
    return ob


def wing(side, beat, fold, twist, shapes, mats):
    """A wing from its shoulder, twisted `twist` degrees about its length and turned `beat` degrees up about the
    body's long axis, its hand folded `fold` back: long
    secondaries along the arm's trailing edge under lighter coverts, and the flight feathers fanned from the hand,
    straight out at the front to swept back behind."""
    sign = 1 if side == 'L' else -1
    pivot = bpy.data.objects.new(f'shoulder_{side}', None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = shapes['shoulder']
    # the wing sweeps back from its shoulder, so a raised one points up and behind, as a bird's does
    pivot.rotation_mode = 'ZYX'   # swept back first, then twisted, then turned up or down about the body
    pivot.rotation_euler = (math.radians(beat) * sign, math.radians(twist), math.radians(SWEEP_BACK) * sign)
    arm, chord = shapes['span'] * 0.5, shapes['chord']
    for k in range(shapes['coverts']):
        t = (k + 0.5) / shapes['coverts']
        root = (0.15, sign * (0.1 + t * arm), 0.0)
        feather(f'secondary_{side}{k}', root, (root[0] - chord, root[1] + sign * 0.08, -0.04), 0.7, mats['primaries'],
                pivot)
        feather(f'covert_{side}{k}', (root[0] + 0.1, root[1], 0.04), (root[0] - chord * 0.55, root[1], 0.03), 0.75,
                mats['coverts'], pivot)
    hand = (0.1, sign * arm, 0.0)
    for k in range(shapes['primaries']):
        t = k / max(1, shapes['primaries'] - 1)
        angle = math.radians(6 - t * shapes['sweep'] - fold)
        length = shapes['primary'] * (1.0 - 0.45 * t)
        tip = (hand[0] + math.sin(angle) * length, hand[1] + sign * math.cos(angle) * length, 0.0)
        feather(f'primary_{side}{k}', hand, tip, 0.62, mats['primaries'], pivot, curl=shapes['curl'])
    return pivot


SHAPES = {
    # a phoenix: a slim body under a crest of flame, broad wings, and a long tail of plumes curling up at their ends
    'fire': {'body': (1.25, 0.5, 0.5), 'head': (1.35, 0.0, 0.42, 0.4), 'beak': ((1.7, 0, 0.36), (2.15, 0, 0.22), 0.11),
             'shoulder': (0.25, 0.0, 0.3), 'span': 3.4, 'chord': 1.3, 'sweep': 34, 'coverts': 6, 'covert': 0.8,
             'primaries': 7, 'primary': 2.0, 'curl': 0.35, 'tail': 6, 'tail_length': 3.4, 'tail_curl': 0.9, 'crest': 3},
    # a raven: a heavy beak and a shaggy throat, fingered wings, a wedge of a tail
    'raven': {'body': (1.2, 0.55, 0.52), 'head': (1.3, 0.0, 0.3, 0.42), 'beak': ((1.65, 0, 0.3), (2.35, 0, 0.12), 0.17),
              'shoulder': (0.2, 0.0, 0.28), 'span': 3.2, 'chord': 1.2, 'sweep': 26, 'coverts': 6, 'covert': 0.9,
              'primaries': 6, 'primary': 1.8, 'curl': 0.12, 'tail': 7, 'tail_length': 1.6, 'tail_curl': 0.05,
              'crest': 0},
}


def build(bird, beat, fold, twist, yaw):
    """The bird posed at its beat, turned `yaw` degrees about its middle."""
    s = SHAPES[bird]
    fire = bird == 'fire'
    # Fire is lit from within, hottest at its heart; the raven is of Cosmic light, its eye the brightest of it.
    mats = {
        'body': material('body', 0.85 if fire else 0.62, glow=0.28 if fire else 0.12),
        'head': material('head', 0.85 if fire else 0.64, glow=0.22 if fire else 0.12),
        'coverts': material('coverts', 0.7 if fire else 0.58, glow=0.08 if fire else 0.05),
        'primaries': material('primaries', 0.48 if fire else 0.42),
        'tail': material('tail', 0.62 if fire else 0.45, glow=0.05 if fire else 0.0),
        'beak': material('beak', 0.85 if fire else 0.3),
        'eye': material('eye', 1.0, glow=4.0),
    }
    blob('body', (0, 0, 0), s['body'], mats['body'])
    hx, hy, hz, hr = s['head']
    blob('head', (hx, hy, hz), (hr, hr * 0.9, hr * 0.95), mats['head'])
    root, tip, radius = s['beak']
    cone('beak', root, tip, radius, mats['beak'])
    for side in (-1, 1):   # an eye each side, so it shows in each side view
        blob(f'eye{side}', (hx + hr * 0.45, side * hr * 0.7, hz + hr * 0.25), (0.07, 0.04, 0.07), mats['eye'])
    if not fire:   # a raven's shaggy throat
        for k in range(4):
            feather(f'hackle{k}', (hx - 0.1, 0, hz - 0.15 - k * 0.06), (hx - 0.45, 0, hz - 0.55 - k * 0.08), 0.25,
                    mats['head'], normal=(0, 1, 0))
    for k in range(s['crest']):   # flames off the crown
        feather(f'crest{k}', (hx - 0.1, 0, hz + 0.2), (hx - 0.9 - k * 0.3, 0, hz + 0.8 + k * 0.25), 0.3, mats['head'],
                normal=(0, 1, 0), bend=-0.3)
    for k in range(s['tail']):
        t = k / max(1, s['tail'] - 1) - 0.5
        length = s['tail_length'] * (1.0 - 0.25 * abs(t) * 2)
        # the tail's fan stands in the side's plane, each plume's end curling up
        feather(f'tail{k}', (-1.0, 0.0, t * 0.3), (-1.0 - length, 0.0, t * 1.6 * (1 if fire else 0.5)),
                0.55 if fire else 0.5, mats['tail'], normal=(0, 1, 0), bend=-s['tail_curl'] * (1 + abs(t)))
    for side in 'LR':
        wing(side, beat, fold, twist, s, mats)
    root = bpy.data.objects.new('root', None)
    bpy.context.collection.objects.link(root)
    for ob in bpy.context.collection.objects:
        if ob is not root and ob.parent is None and ob.type != 'CAMERA' and ob.type != 'LIGHT':
            ob.parent = root
    root.rotation_euler = (0, 0, math.radians(yaw))


def stage(bird):
    scene = bpy.context.scene
    width, height = BIRDS[bird]
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.render.film_transparent = True
    scene.render.resolution_x, scene.render.resolution_y = width * OVERSAMPLE, height * OVERSAMPLE
    scene.view_settings.view_transform = 'Standard'
    cam_data = bpy.data.cameras.new('camera')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = SPANS[bird]
    cam = bpy.data.objects.new('camera', cam_data)
    bpy.context.collection.objects.link(cam)
    # Looking along +Y from a little above, as on the figures; each view turns the bird, not the camera.
    elevation = math.radians(20)
    cam.location = (0.0, -12 * math.cos(elevation), 12 * math.sin(elevation))
    cam.rotation_euler = (math.radians(90) - elevation, 0, 0)
    scene.camera = cam
    for name, rotation, energy in (('key', (40, 0, 30), 3.0), ('fill', (120, 0, -150), 1.0)):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        light.data.energy = energy
        light.rotation_euler = tuple(math.radians(a) for a in rotation)
        bpy.context.collection.objects.link(light)
    world = bpy.data.worlds.new('world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25
    scene.world = world


def downsampled(path, bird):
    """The render averaged down in blocks to the bird's size: its light as grey, its cover as alpha."""
    image = bpy.data.images.load(path)
    width, height = image.size
    rgba = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)[::-1]
    bpy.data.images.remove(image)
    out_w, out_h = BIRDS[bird]
    # A texel's light is its colour weighted by its cover: a half-covered edge is no brighter than what covers it.
    weighted = np.concatenate([rgba[..., :3] * rgba[..., 3:4], rgba[..., 3:4]], axis=-1)
    blocks = weighted.reshape(out_h, OVERSAMPLE, out_w, OVERSAMPLE, 4).mean(axis=(1, 3))
    alpha = blocks[..., 3:4]
    light = np.where(alpha > 1e-4, blocks[..., :3] / np.maximum(alpha, 1e-4), 0.0)
    grey = np.clip(light @ np.array([0.2126, 0.7152, 0.0722]), 0.0, 1.0)
    return np.dstack([grey, grey, grey, alpha[..., 0]])


def save(pixels, path):
    height, width = pixels.shape[:2]
    image = bpy.data.images.new(os.path.basename(path), width, height, alpha=True)
    image.pixels[:] = pixels[::-1].reshape(-1).tolist()
    image.filepath_raw = path
    image.file_format = 'PNG'
    image.save()
    bpy.data.images.remove(image)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--out', required=True)
    parser.add_argument('--birds', default='fire,raven')
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for bird in args.birds.split(','):
        for view, yaw in enumerate(VIEW_YAW):
            for beat, (turn, fold, twist) in enumerate(BEATS):
                clear()
                stage(bird)
                build(bird, turn, fold, twist, yaw)
                name = f'{bird}-{view}-{beat}'
                work = os.path.join(args.out, f'.{name}-work.png')
                bpy.context.scene.render.filepath = work
                bpy.ops.render.render(write_still=True)
                save(downsampled(work, bird), os.path.join(args.out, f'{name}.png'))
                os.remove(work)
                print(name, flush=True)


if __name__ == '__main__':
    main()
