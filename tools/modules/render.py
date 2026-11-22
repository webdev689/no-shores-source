"""Pictures a module as Blender builds it, for a look before it goes into the game: a three-quarter view of its front
(Blender's -y) under a low sun, each material its own plain colour near the game's (cloth the page's own dyes, glow
lit), its parts drawn as red wire boxes when asked.

    python -I tools/modules/render.py <module> <picture.png> [--parts] [--turn degrees] [--high share] [--near share]
        [--eye x,y,z]
"""
import argparse
import json
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

GEAR = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'content', 'gear')

# Near each climate picture's mean (temperate), and the page's plain colours (client/src/city/cityShaders.ts; the
# Lattice's crystal as game/eventPropsDraw.ts draws it, its glow lit).
COLOURS = {'stone': (0.46, 0.44, 0.4), 'trim': (0.62, 0.57, 0.48), 'paving': (0.50, 0.48, 0.44),
           'rubble': (0.36, 0.33, 0.29), 'timber': (0.36, 0.24, 0.14), 'iron': (0.24, 0.25, 0.27),
           'plaster': (0.78, 0.74, 0.66), 'roof': (0.44, 0.28, 0.21), 'gold': (0.86, 0.66, 0.26),
           'bone': (0.86, 0.83, 0.74), 'glow': (1.0, 0.62, 0.28), 'linen': (0.8, 0.75, 0.63),
           'crimson': (0.56, 0.11, 0.12), 'verdant': (0.2, 0.42, 0.22), 'black': (0.1, 0.1, 0.11),
           'straw': (0.78, 0.66, 0.36), 'lawn': (0.25, 0.42, 0.2), 'water': (0.16, 0.32, 0.36),
           'chalk': (0.78, 0.77, 0.72), 'turf': (0.2, 0.3, 0.11), 'canvas': (0.42, 0.42, 0.4),
           'crystal': (0.35, 0.02, 0.04)}


def dye_colours():
    """Each faction's cloth as the page draws it (client/src/city/pictures.ts CLOTH_COLOURS): its cape dye's middle."""
    with open(os.path.join(GEAR, 'cosmetics.json')) as file:
        looks = {each['id']: each['look'] for each in json.load(file)['cosmetics']}
    with open(os.path.join(GEAR, 'factions.json')) as file:
        dyes = {each['key']: each['dye'] for each in json.load(file)['factions']}
    colours = {}
    for faction, material in (('stormcallers', 'stormcaller_blue'), ('lamplighters', 'lamplighter_gold'),
                              ('veiled', 'veiled_dusk')):
        look = looks[dyes[faction]]
        colours[material] = tuple((int(look[1][at:at + 2], 16) + int(look[2][at:at + 2], 16)) / 2 / 255
                                  for at in (1, 3, 5))
    return colours


def linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def coloured(name, colour, glow=0.0):
    made = bpy.data.materials.new(f'{name}{glow}')
    shader = made.node_tree.nodes['Principled BSDF']
    shader.inputs['Base Color'].default_value = (*(linear(channel) for channel in colour), 1.0)
    shader.inputs['Roughness'].default_value = 0.45 if name in ('gold', 'iron') else 0.3 if name == 'crystal' else 0.9
    shader.inputs['Metallic'].default_value = 0.6 if name in ('gold', 'iron') else 0.0
    if name == 'glow':
        shader.inputs['Emission Color'].default_value = (1.0, 0.55, 0.2, 1.0)
        shader.inputs['Emission Strength'].default_value = 6.0
    elif glow > 0:
        shader.inputs['Emission Color'].default_value = (1.0, 0.1, 0.06, 1)
        shader.inputs['Emission Strength'].default_value = glow * 4
    return made


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('module')
    parser.add_argument('picture')
    parser.add_argument('--parts', action='store_true')
    parser.add_argument('--turn', type=float, default=35.0)
    parser.add_argument('--high', type=float, default=0.55, help='how high the eye stands, a share of its distance')
    parser.add_argument('--near', type=float, default=1.0, help='the eye this share of its usual distance away')
    parser.add_argument('--eye', help='the eye at this point, metres in the module\'s frame, as a player sees it')
    asked = parser.parse_args()
    kit.reset()
    module = kit.Module(asked.module, catalogue.SEEDS[asked.module])
    # As the bake builds it: an event prop's rock is roughed out along its steady normals.
    module.steady = asked.module in catalogue.EVENTS
    catalogue.BUILDERS[asked.module](module)
    colours = {**COLOURS, **dye_colours()}
    materials = {}
    for item in module.objects:
        # Clearing a mesh's materials sets every face's index to 0: each face's slot is kept and put back.
        kept = [polygon.material_index for polygon in item.data.polygons]
        item.data.materials.clear()
        for slot in module.slots[item.name]:
            if slot not in materials:
                materials[slot] = coloured(slot[0], colours[slot[0]], slot[1])
            item.data.materials.append(materials[slot])
        item.data.polygons.foreach_set('material_index', kept)
    if asked.parts:
        red = bpy.data.materials.new('part')
        red.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.1, 0.05, 1)
        red.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (0.9, 0.1, 0.05, 1)
        red.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.5
        for number, (x0, y0, z0, x1, y1, z1) in enumerate(module.parts):
            bpy.ops.mesh.primitive_cube_add(size=1.0, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
            box = bpy.context.active_object
            box.scale = (x1 - x0, y1 - y0, z1 - z0)
            wire = box.modifiers.new(f'wire{number}', 'WIREFRAME')
            wire.thickness = 0.05
            box.data.materials.append(red)
    bpy.context.view_layer.update()
    corners = [item.matrix_world @ mathutils.Vector(corner) for item in module.objects for corner in item.bound_box]
    low = mathutils.Vector([min(corner[axis] for corner in corners) for axis in range(3)])
    high = mathutils.Vector([max(corner[axis] for corner in corners) for axis in range(3)])
    middle = (low + high) / 2
    reach = (high - low).length / 2
    scene = bpy.context.scene
    if module.mouth:
        # The land stands at the foot, opened along the mouth: the ground filled round the mouth's outline.
        north, south = module.mouth
        outline = [(x, y) for x, y, _ in north] + [(x, y) for x, y, _ in reversed(south)]
        side = reach * 6
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
        bpy.ops.mesh.primitive_plane_add(size=reach * 12, location=(middle.x, middle.y, min(low.z, 0.0) - 0.01))
    ground = bpy.data.materials.new('ground')
    ground.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.16, 0.2, 0.12, 1)
    bpy.context.active_object.data.materials.append(ground)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 2.6
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(48), 0, math.radians(asked.turn - 25))
    scene.collection.objects.link(sun)
    scene.world = bpy.data.worlds.new('sky')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.6, 0.78, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.5
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    camera.data.lens = 35
    scene.collection.objects.link(camera)
    turn = math.radians(asked.turn)
    distance = (reach * 2.4 + 1.0) * asked.near
    camera.location = middle + mathutils.Vector((math.sin(turn), -math.cos(turn), asked.high)) * distance
    if asked.eye:
        camera.location = mathutils.Vector(tuple(float(v) for v in asked.eye.split(',')))
    direction = middle - camera.location
    camera.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = -0.6
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 800
    scene.render.filepath = asked.picture
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
