"""Blender's side of the item pictures: an empty scene lit from the top left as the kit's bevels are, solids made of a
few shapes, and a Cycles render through an orthographic camera fitted round them, read back as an RGBA array and made
a glyph (`pixels.py`).
"""
import math
import os
import tempfile

import bpy
import mathutils
import numpy as np

from pixels import SCALE, glyph

# How far round the camera stands unless a view says otherwise, degrees; the models that lay parts across the view read
# it too.
AZIMUTH = -35


def reset():
    """An empty scene for Cycles on the CPU, the same each run: a soft grey sky and a sun set by `look`."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.cycles.seed = 1
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('sky')
    world.use_nodes = True
    background = world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (0.62, 0.64, 0.7, 1)
    background.inputs['Strength'].default_value = 0.45
    scene.world = world
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 5.5
    sun.data.angle = math.radians(8)
    scene.collection.objects.link(sun)


def material(colour, rough=0.55, metal=0.0, glow=0.0):
    """A plain surface in `colour` (#rrggbb), optionally metal, optionally giving light of its own."""
    found = bpy.data.materials.new(colour)
    found.use_nodes = True
    shader = found.node_tree.nodes['Principled BSDF']
    rgb = [int(colour[k:k + 2], 16) / 255 for k in (1, 3, 5)]
    linear = [value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in rgb]
    shader.inputs['Base Color'].default_value = (*linear, 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    if glow:
        shader.inputs['Emission Color'].default_value = (*linear, 1)
        shader.inputs['Emission Strength'].default_value = glow
    return found


def dressed(made, colour, smooth=False, **kinds):
    made.data.materials.append(material(colour, **kinds))
    if smooth:
        for polygon in made.data.polygons:
            polygon.use_smooth = True
    return made


def box(size, at=(0, 0, 0), colour='#808080', turn=(0, 0, 0), **kinds):
    """A box `size` across, deep and tall, its middle at `at`, turned by `turn` (degrees about x, y, z)."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at, rotation=[math.radians(each) for each in turn])
    made = bpy.context.object
    made.scale = size
    return dressed(made, colour, **kinds)


def ball(radius, at=(0, 0, 0), colour='#808080', stretch=(1, 1, 1), turn=(0, 0, 0), rings=12, **kinds):
    """A sphere, stretched along x, y and z, smooth."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=at, segments=rings * 2, ring_count=rings,
                                         rotation=[math.radians(each) for each in turn])
    made = bpy.context.object
    made.scale = stretch
    return dressed(made, colour, smooth=True, **kinds)


def rod(start, end, radius, colour='#808080', sides=12, tip=None, smooth=True, **kinds):
    """A cylinder from `start` to `end`, or a cone narrowing to `tip`'s radius there."""
    start, end = mathutils.Vector(start), mathutils.Vector(end)
    way = end - start
    turn = way.to_track_quat('Z', 'Y').to_euler()
    middle = (start + end) / 2
    if tip is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=sides, radius=radius, depth=way.length, location=middle,
                                            rotation=turn)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=radius, radius2=tip, depth=way.length,
                                        location=middle, rotation=turn)
    return dressed(bpy.context.object, colour, smooth=smooth, **kinds)


def ring(radius, thickness, at=(0, 0, 0), colour='#808080', turn=(0, 0, 0), **kinds):
    """A torus round `at`, flat in its own x and y."""
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thickness, location=at,
                                     rotation=[math.radians(each) for each in turn], major_segments=24,
                                     minor_segments=8)
    return dressed(bpy.context.object, colour, smooth=True, **kinds)


def mesh(points, faces, colour='#808080', smooth=False, **kinds):
    """A solid from its own points and faces."""
    data = bpy.data.meshes.new(colour)
    data.from_pydata(points, [], faces)
    made = bpy.data.objects.new(colour, data)
    bpy.context.scene.collection.objects.link(made)
    return dressed(made, colour, smooth=smooth, **kinds)


def look(azimuth, elevation, cells, spin=0.0, roll=0.0, steady=False):
    """Turns what stands `spin` degrees round its upright and `roll` degrees round the view, and aims an orthographic
    camera at it from `azimuth` round and `elevation` up (degrees), fitted to its silhouette with a cell spare all
    round for the outline (`steady`: to its silhouette at every spin, so a turn holds its size); the sun comes from
    the camera's upper left."""
    scene = bpy.context.scene
    # A shape's scale is set after it is added, so the last one's matrix waits on this to hold it.
    bpy.context.view_layer.update()
    solids = [each for each in scene.objects if each.type == 'MESH']
    across, up = math.radians(azimuth), math.radians(elevation)
    toward = mathutils.Vector((math.sin(across) * math.cos(up), -math.cos(across) * math.cos(up), math.sin(up)))
    right = mathutils.Vector((0, 0, 1)).cross(toward).normalized()
    upward = toward.cross(right).normalized()
    rolled = mathutils.Matrix.Rotation(math.radians(roll), 4, toward)
    turned = lambda degrees: rolled @ mathutils.Matrix.Rotation(math.radians(degrees), 4, 'Z')
    points = [each.matrix_world @ vertex.co for each in solids for vertex in each.data.vertices]
    fitted = [turned(degrees) @ point for degrees in (range(0, 360, 15) if steady else [spin]) for point in points]
    for each in solids:
        each.matrix_world = turned(spin) @ each.matrix_world
    bpy.context.view_layer.update()
    sideways = [point.dot(right) for point in fitted]
    heights = [point.dot(upward) for point in fitted]
    middle = right * (min(sideways) + max(sideways)) / 2 + upward * (min(heights) + max(heights)) / 2
    span = max(max(sideways) - min(sideways), max(heights) - min(heights))
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = span * cells / (cells - 2.5)
    camera.location = middle + toward * 50
    camera.rotation_euler = (-toward).to_track_quat('-Z', 'Y').to_euler()
    camera.data.clip_end = 200
    scene.collection.objects.link(camera)
    scene.camera = camera
    sun = scene.objects['sun']
    light = (toward * 0.55 + upward * 0.75 - right * 0.6).normalized()
    sun.rotation_euler = (-light).to_track_quat('-Z', 'Y').to_euler()
    scene.render.resolution_x = scene.render.resolution_y = cells * SCALE
    scene.render.resolution_percentage = 100


def render():
    """The scene rendered, as rows of RGBA from the top, each from 0 to 1 as written (sRGB)."""
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, 'render.png')
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(path)
        size = image.size[0]
        pixels = np.array(image.pixels[:], dtype=np.float64).reshape(size, size, 4)[::-1]
        bpy.data.images.remove(image)
    return pixels


def bake(build, cells, azimuth=AZIMUTH, elevation=25, spin=0.0, roll=0.0, steady=False, most=11):
    """`build` made in an empty scene and rendered as a glyph of `cells` a side."""
    reset()
    build()
    look(azimuth, elevation, cells, spin, roll, steady)
    return glyph(render(), cells, most)
