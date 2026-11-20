"""Bakes the wreck's light: joins the built wreck into one mesh, lays a second UV map over it for its light, and bakes
two lights into one picture the game draws it with: its fires' (red, green and blue), with their shadows and the light
they throw back off the timber, and the storm sky's (alpha), which every hollow and overhang darkens.

    <python with bpy> tools/wreck/light_wreck.py <built.blend> <lit.blend> <light.png> [--size N] [--samples N]

The game flickers the fires' light and flashes the sky's with the lightning, so the two are kept apart. Each face keeps
the piece it belongs to (`piece`: 0 the wreck, z + 1 the heap closing zone z), whether a body walks on it
(`walk`) and whether it is solid that no body stands on (`wall`).
"""
import argparse
import math
import os
import sys
import time

import bpy  # noqa: I001 - Blender's own modules load once bpy has
import numpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'ships'))
from wreck_fire import fires, light, standing_ground  # noqa: E402
from wreck_frames import wreck_frames  # noqa: E402

# The light the picture holds at its brightest, each of the bake's own units: the fires' and the sky's.
FIRE_FULL = 3.0
SKY_FULL = 1.0
# The storm sky's colour as it lights the wreck, before it is darkened by what hides it.
SKY = (1.0, 1.0, 1.0)


def joined():
    """Every mesh of the wreck joined into one object, each face marked with its piece and whether it is walked."""
    items = [item for item in bpy.data.objects if item.type == 'MESH']
    for item in items:
        piece = 0
        for group in item.users_collection:
            if group.name.startswith('Gate.'):
                piece = int(group.name.split('.')[1]) + 1
        mesh = item.data
        mesh.attributes.new('piece', 'INT', 'FACE').data.foreach_set('value', [piece] * len(mesh.polygons))
        for mark in ('walk', 'wall'):
            marked = bool(item.get(mark))
            mesh.attributes.new(mark, 'BOOLEAN', 'FACE').data.foreach_set('value', [marked] * len(mesh.polygons))
    bpy.ops.object.select_all(action='DESELECT')
    for item in items:
        item.select_set(True)
    bpy.context.view_layer.objects.active = items[0]
    bpy.ops.object.join()
    wreck = bpy.context.view_layer.objects.active
    wreck.name = 'Wreck'
    # The joined object keeps the first part's own marks: its faces' marks are the ones that hold.
    for mark in ('walk', 'wall'):
        if mark in wreck:
            del wreck[mark]
    for group in list(bpy.data.collections):
        if group.name.startswith('Gate.') and not group.objects:
            bpy.data.collections.remove(group)
    return wreck


def light_uvs(wreck):
    """A second UV map, `light`, every face its own place on the light's picture."""
    pictures = wreck.data.uv_layers.active
    layer = wreck.data.uv_layers.new(name='light')
    wreck.data.uv_layers.active = layer
    pictures.active_render = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002, area_weight=1.0,
                             scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=0.003, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_into(wreck, name, size, world, lamps_on, samples):
    """One bake of the light falling on the wreck (no colour of its own) into a new float picture."""
    image = bpy.data.images.new(name, size, size, float_buffer=True)
    for slot in wreck.material_slots:
        nodes = slot.material.node_tree.nodes
        target = nodes.get('Light') or nodes.new('ShaderNodeTexImage')
        target.name = 'Light'
        target.image = image
        nodes.active = target
    scene = bpy.context.scene
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (*world, 1.0)
    for lamp in [item for item in bpy.data.objects if item.type == 'LIGHT']:
        lamp.hide_render = not lamps_on
    scene.cycles.samples = samples
    started = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=6, use_clear=True,
                        target='IMAGE_TEXTURES')
    print(f'baked {name} in {time.time() - started:.0f} s')
    return image


def combined(fire, sky, path):
    """The two lights in one picture: the fires' in red, green and blue, the sky's in alpha, each to its full."""
    size = fire.size[0]
    lit = numpy.empty(size * size * 4, dtype=numpy.float32)
    fire.pixels.foreach_get(lit)
    skies = numpy.empty(size * size * 4, dtype=numpy.float32)
    sky.pixels.foreach_get(skies)
    lit = lit.reshape(-1, 4)
    skies = skies.reshape(-1, 4)
    for name, values, full in (('fire', lit[:, :3].max(axis=1), FIRE_FULL), ('sky', skies[:, :3].mean(axis=1),
                                                                            SKY_FULL)):
        held = values[values > 0]
        print(name, 'of full at 50/90/99%:', [round(float(numpy.percentile(held, share)) / full, 3)
                                              for share in (50, 90, 99)])
    lit[:, :3] = numpy.clip(lit[:, :3] / FIRE_FULL, 0, 1)
    lit[:, 3] = numpy.clip(skies[:, :3].mean(axis=1) / SKY_FULL, 0, 1)
    picture = bpy.data.images.new('WreckLight', size, size, alpha=True)
    # Light, not colour: written as it is, its alpha its own, as the game reads it back.
    picture.colorspace_settings.name = 'Non-Color'
    picture.alpha_mode = 'STRAIGHT'
    picture.pixels.foreach_set(lit.ravel())
    picture.filepath_raw = path
    picture.file_format = 'PNG'
    picture.save()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('built')
    parser.add_argument('lit')
    parser.add_argument('picture')
    parser.add_argument('--size', type=int, default=2048)
    parser.add_argument('--samples', type=int, default=96)
    given = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(given.built))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.max_bounces = 3
    scene.world = scene.world or bpy.data.worlds.new('Sky')
    scene.world.use_nodes = True
    lamps = bpy.data.collections.new('Fires')
    scene.collection.children.link(lamps)
    light(lamps, fires(wreck_frames(), standing_ground()))
    wreck = joined()
    light_uvs(wreck)
    fire = bake_into(wreck, 'FireLight', given.size, (0.0, 0.0, 0.0), True, given.samples)
    sky = bake_into(wreck, 'SkyLight', given.size, SKY, False, max(16, given.samples // 2))
    combined(fire, sky, os.path.abspath(given.picture))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(given.lit), compress=True)
    print(f'saved {given.lit} and {given.picture}')


if __name__ == '__main__':
    main()
