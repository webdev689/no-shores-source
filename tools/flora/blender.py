"""Blender's side: the detailed model's surfaces as objects wearing the code-made pictures, and Cycles renders of
them through an orthographic camera, read back as numpy arrays. Every render is emission only, so a pixel holds
exactly what is asked of it: the albedo (darkened by ambient occlusion), the normal, or whether it is leaf.
"""
import os
import tempfile

import bpy
import mathutils
import numpy as np

from pictures import bark, leaf_picture

# The modes a render is taken in.
ALBEDO, NORMAL, LEAF = 'albedo', 'normal', 'leaf'


def reset():
    """An empty scene set up for flat, exact Cycles renders on the CPU, the same on every run."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 0
    scene.cycles.seed = 1
    scene.cycles.filter_width = 1.0
    scene.render.film_transparent = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '32'
    scene.render.threads_mode = 'AUTO'
    return scene


def image_of(name, pixels):
    """A float image from rows of RGB or grey, its first row at v = 0 as WebGPU samples it."""
    pixels = np.asarray(pixels, np.float32)
    if pixels.ndim == 2:
        pixels = np.repeat(pixels[..., None], 3, -1)
    rows, columns = pixels.shape[:2]
    image = bpy.data.images.new(name, columns, rows, alpha=True, float_buffer=True)
    image.colorspace_settings.name = 'Non-Color'
    rgba = np.concatenate([pixels, np.ones((rows, columns, 1), np.float32)], -1)
    image.pixels.foreach_set(rgba.ravel())
    image.pack()
    return image


def mesh_object(surface, name):
    points, faces, uvs, tints = surface.arrays()
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points.tolist(), [], faces)
    layer = mesh.uv_layers.new(name='UVMap')
    layer.data.foreach_set('uv', uvs.astype(np.float32).ravel())
    tint = mesh.color_attributes.new('tint', 'FLOAT_COLOR', 'CORNER')
    rgba = np.concatenate([tints, np.ones((len(tints), 1))], 1).astype(np.float32)
    tint.data.foreach_set('color', rgba.ravel())
    mesh.update()
    item = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(item)
    return item


def node(tree, kind, **settings):
    made = tree.nodes.new(kind)
    for key, value in settings.items():
        setattr(made, key, value)
    return made


def material(name, albedo_image, height_image, bump_m, mode, ao, space):
    """A surface's material for one mode: its picture times its tint, bumped by its height; `ao` is (share, metres)
    of ambient occlusion folded into the albedo, `space` the frame its normals are written in."""
    made = bpy.data.materials.new(name)
    tree = made.node_tree
    tree.nodes.clear()
    links = tree.links
    output = node(tree, 'ShaderNodeOutputMaterial')
    emission = node(tree, 'ShaderNodeEmission')
    links.new(emission.outputs['Emission'], output.inputs['Surface'])
    uv = node(tree, 'ShaderNodeUVMap', uv_map='UVMap')
    if mode == LEAF:
        emission.inputs['Color'].default_value = (1, 1, 1, 1) if name.startswith('leaf') else (0, 0, 0, 1)
        return made
    if mode == ALBEDO:
        picture = node(tree, 'ShaderNodeTexImage', image=albedo_image, interpolation='Linear', extension='REPEAT')
        links.new(uv.outputs['UV'], picture.inputs['Vector'])
        tint = node(tree, 'ShaderNodeAttribute', attribute_name='tint')
        tinted = node(tree, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        tinted.inputs['Factor'].default_value = 1.0
        links.new(picture.outputs['Color'], tinted.inputs['A'])
        links.new(tint.outputs['Color'], tinted.inputs['B'])
        occlusion = node(tree, 'ShaderNodeAmbientOcclusion', only_local=True, samples=16)
        occlusion.inputs['Distance'].default_value = ao[1]
        shaded = node(tree, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
        shaded.inputs['Factor'].default_value = ao[0]
        links.new(tinted.outputs['Result'], shaded.inputs['A'])
        links.new(occlusion.outputs['AO'], shaded.inputs['B'])
        links.new(shaded.outputs['Result'], emission.inputs['Color'])
        return made
    height = node(tree, 'ShaderNodeTexImage', image=height_image, interpolation='Linear', extension='REPEAT')
    links.new(uv.outputs['UV'], height.inputs['Vector'])
    bump = node(tree, 'ShaderNodeBump')
    bump.inputs['Distance'].default_value = bump_m
    links.new(height.outputs['Color'], bump.inputs['Height'])
    turned = node(tree, 'ShaderNodeVectorTransform', vector_type='NORMAL', convert_from='WORLD', convert_to=space)
    links.new(bump.outputs['Normal'], turned.inputs['Vector'])
    encoded = node(tree, 'ShaderNodeVectorMath', operation='MULTIPLY_ADD')
    encoded.inputs[1].default_value = (0.5, 0.5, 0.5)
    encoded.inputs[2].default_value = (0.5, 0.5, 0.5)
    links.new(turned.outputs['Vector'], encoded.inputs[0])
    links.new(encoded.outputs['Vector'], emission.inputs['Color'])
    return made


class Plant:
    """A form's detailed model in the scene: an object per surface, and its pictures."""

    def __init__(self, surfaces, model, seed):
        self.objects = [mesh_object(surface, surface.material) for surface in surfaces]
        self.kinds = [surface.material for surface in surfaces]
        bark_albedo, bark_height = bark(model.bark['style'], model.bark['colour'], seed)
        shade, height = leaf_picture(seed)
        self.pictures = {
            'bark': (image_of('bark albedo', bark_albedo), image_of('bark height', bark_height), 0.02),
            'twig': (image_of('twig albedo', bark_albedo), image_of('twig height', bark_height), 0.005),
            'stone': (image_of('stone albedo', bark_albedo), image_of('stone height', bark_height), 0.03),
            'leaf': (image_of('leaf shade', shade), image_of('leaf height', height), 0.002),
        }
        self.bark = (bark_albedo, bark_height)

    def dress(self, mode, ao=(0.0, 1.0), space='CAMERA'):
        """Every surface's material for a mode."""
        for item, kind in zip(self.objects, self.kinds):
            albedo, height, bump = self.pictures[kind]
            item.data.materials.clear()
            item.data.materials.append(material(f'{kind} {mode}', albedo, height, bump, mode, ao, space))


def camera(scene, origin, forward, up, width_m, depth=None):
    """An orthographic camera at `origin` looking along `forward`, `width_m` across; with `depth` (near, far) only
    what lies between is seen."""
    lens = bpy.data.cameras.new('lens')
    lens.type = 'ORTHO'
    lens.ortho_scale = width_m
    lens.sensor_fit = 'HORIZONTAL'
    lens.clip_start, lens.clip_end = depth if depth else (0.01, 10_000.0)
    holder = bpy.data.objects.new('camera', lens)
    forward, up = np.asarray(forward, float), np.asarray(up, float)
    right = np.cross(forward, up)
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    rotation = mathutils.Matrix((right, up, -forward)).transposed()
    holder.matrix_world = mathutils.Matrix.Translation(origin) @ rotation.to_4x4()
    scene.collection.objects.link(holder)
    scene.camera = holder
    return holder


def render(scene, width, height, samples):
    """Renders the scene's camera and gives the pixels, (height, width, 4) floats, the top row first."""
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.cycles.samples = samples
    with tempfile.TemporaryDirectory() as folder:
        scene.render.filepath = os.path.join(folder, 'render.exr')
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(scene.render.filepath)
        pixels = np.array(image.pixels[:], np.float32).reshape(height, width, 4)
        bpy.data.images.remove(image)
    return pixels[::-1].copy()


def remove(holder):
    bpy.data.objects.remove(holder, do_unlink=True)

