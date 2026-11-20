"""Pictures a module as Blender builds it, for a look before it goes into the game: a three-quarter view under a low
sun, each material its own plain colour, its parts drawn as wire boxes when asked.

    python -I tools/modules/render.py <module> <picture.png> [--parts] [--turn degrees]
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402
import mathutils  # noqa: E402

import catalogue  # noqa: E402
import kit  # noqa: E402

COLOURS = {'stone': (0.42, 0.40, 0.37), 'trim': (0.55, 0.50, 0.42), 'paving': (0.50, 0.48, 0.44),
           'rubble': (0.36, 0.33, 0.29), 'timber': (0.33, 0.22, 0.13), 'iron': (0.12, 0.12, 0.13)}


def coloured(name):
    made = bpy.data.materials.new(name)
    shader = made.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = (*COLOURS[name], 1.0)
    shader.inputs['Roughness'].default_value = 0.9
    return made


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('module')
    parser.add_argument('picture')
    parser.add_argument('--parts', action='store_true')
    parser.add_argument('--turn', type=float, default=35.0)
    asked = parser.parse_args()
    kit.reset()
    module = kit.Module(asked.module, catalogue.SEEDS[asked.module])
    catalogue.BUILDERS[asked.module](module)
    materials = {name: coloured(name) for name in kit.MATERIALS}
    for item in module.objects:
        item.data.materials.append(materials[item['material']])
    if asked.parts:
        for number, (x0, y0, z0, x1, y1, z1) in enumerate(module.parts):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
            box = bpy.context.active_object
            box.scale = (x1 - x0, y1 - y0, z1 - z0)
            box.display_type = 'WIRE'
            wire = box.modifiers.new(f'wire{number}', 'WIREFRAME')
            wire.thickness = 0.06
            red = bpy.data.materials.new(f'part{number}')
            red.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.1, 0.05, 1)
            box.data.materials.append(red)
    low = [min(v[axis] for item in module.objects for v in item.bound_box) for axis in range(3)]
    reach = max(max(abs(item.location.x), abs(item.location.y)) for item in module.objects) + 4
    scene = bpy.context.scene
    bpy.ops.mesh.primitive_plane_add(size=reach * 6, location=(0, 0, min(low[2], 0) - 0.01))
    ground = bpy.data.materials.new('ground')
    ground.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.22, 0.3, 0.16, 1)
    bpy.context.active_object.data.materials.append(ground)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 2.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(asked.turn + 60))
    scene.collection.objects.link(sun)
    scene.world = bpy.data.worlds.new('sky')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.65, 0.8, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    scene.collection.objects.link(camera)
    turn = math.radians(asked.turn)
    distance = reach * 2.2
    camera.location = (math.sin(turn) * distance, -math.cos(turn) * distance, distance * 0.6)
    direction = mathutils.Vector((0, 0, 2)) - camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.view_settings.view_transform = 'Standard'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.render.filepath = asked.picture
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
