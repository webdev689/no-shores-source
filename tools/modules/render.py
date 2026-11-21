"""Pictures a module as Blender builds it, for a look before it goes into the game: a three-quarter view under a low
sun, each material its own plain colour, its parts drawn as wire boxes when asked.

    python -I tools/modules/render.py <module> <picture.png> [--parts] [--turn degrees] [--eye x,y,z]
"""
import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy  # noqa: E402,I001 (Blender's bmesh loads with bpy)
import bmesh  # noqa: E402
import mathutils  # noqa: E402

import catalogue  # noqa: E402
import kit  # noqa: E402

COLOURS = {'stone': (0.42, 0.40, 0.37), 'trim': (0.55, 0.50, 0.42), 'paving': (0.50, 0.48, 0.44),
           'rubble': (0.36, 0.33, 0.29), 'timber': (0.33, 0.22, 0.13), 'iron': (0.12, 0.12, 0.13),
           'chalk': (0.78, 0.77, 0.72), 'turf': (0.2, 0.3, 0.11), 'canvas': (0.42, 0.42, 0.4),
           'gold': (0.7, 0.5, 0.18), 'crystal': (0.35, 0.02, 0.04)}


def coloured(name, glow=0.0):
    made = bpy.data.materials.new(f'{name}{glow}')
    shader = made.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = (*COLOURS[name], 1.0)
    shader.inputs['Roughness'].default_value = 0.9 if name != 'crystal' else 0.3
    if glow > 0:
        shader.inputs['Emission Color'].default_value = (1.0, 0.1, 0.06, 1)
        shader.inputs['Emission Strength'].default_value = glow * 4
    return made


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('module')
    parser.add_argument('picture')
    parser.add_argument('--parts', action='store_true')
    parser.add_argument('--turn', type=float, default=35.0)
    parser.add_argument('--near', type=float, default=1.0, help='the eye this share of its usual distance away')
    parser.add_argument('--eye', help='the eye at this point, metres in the module\'s frame, as a player sees it')
    asked = parser.parse_args()
    kit.reset()
    module = kit.Module(asked.module, catalogue.SEEDS[asked.module])
    catalogue.BUILDERS[asked.module](module)
    materials = {}
    for item in module.objects:
        # Clearing a mesh's materials sets every face's index to 0: each face's slot is kept and put back.
        kept = [polygon.material_index for polygon in item.data.polygons]
        item.data.materials.clear()
        for slot in module.slots[item.name]:
            if slot not in materials:
                materials[slot] = coloured(*slot)
            item.data.materials.append(materials[slot])
        item.data.polygons.foreach_set('material_index', kept)
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
    reach = max(max(abs(item.location.x), abs(item.location.y)) for item in module.objects) + 4
    scene = bpy.context.scene
    if module.mouth:
        # The land stands at the foot, opened along the mouth: the ground filled round the mouth's outline.
        north, south = module.mouth
        outline = [(x, y) for x, y, _ in north] + [(x, y) for x, y, _ in reversed(south)]
        side = reach * 3
        made = bmesh.new()
        loops = [[made.verts.new((x, y, 0.0)) for x, y in ring]
                 for ring in ([(-side, -side), (side, -side), (side, side), (-side, side)], outline)]
        edges = [made.edges.new((loop[k], loop[(k + 1) % len(loop)])) for loop in loops for k in range(len(loop))]
        bmesh.ops.triangle_fill(made, use_beauty=True, use_dissolve=False, edges=edges)
        land = bpy.data.meshes.new('land')
        made.to_mesh(land)
        made.free()
        item = bpy.data.objects.new('land', land)
        scene.collection.objects.link(item)
        bpy.context.view_layer.objects.active = item
    else:
        bpy.ops.mesh.primitive_plane_add(size=reach * 6, location=(0, 0, -0.01))
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
    distance = reach * 2.2 * asked.near
    camera.location = (math.sin(turn) * distance, -math.cos(turn) * distance, distance * 0.6)
    if asked.eye:
        camera.location = tuple(float(v) for v in asked.eye.split(','))
    high = max(v[2] for item in module.objects for v in item.bound_box)
    direction = mathutils.Vector((0, 0, min(2.0, high * 0.4))) - camera.location
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
