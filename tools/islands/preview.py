"""A kit's contact sheet: each module rendered small from a three-quarter view (Cycles on the CPU, a few samples) in
flat part colours under an even sun on a light ground, laid in a labelled grid by Pillow, so a person can look the
shapes over. The island pictures are the game's, so the sheet does not paint them.
"""
import math
import os

import bpy
from mathutils import Euler, Vector
from PIL import Image, ImageDraw, ImageFont

import catalog

SIZE = 224
COLUMNS = 6
SAMPLES = 16
LABEL = 34
TITLE = 40
# Each part's flat colour (linear RGB), so the parts read apart: greys of rock, warm timber, greens of growth.
PALETTE = {
    'rock': (0.22, 0.21, 0.2), 'rockAlt': (0.09, 0.09, 0.1), 'sand': (0.62, 0.52, 0.32), 'earth': (0.18, 0.11, 0.06),
    'grass': (0.2, 0.38, 0.08), 'bark': (0.13, 0.07, 0.035), 'leaf': (0.06, 0.22, 0.04),
    'leafAlt': (0.3, 0.36, 0.05), 'wood': (0.42, 0.36, 0.28), 'plank': (0.3, 0.16, 0.06),
    'rope': (0.43, 0.32, 0.16), 'iron': (0.04, 0.045, 0.05), 'stone': (0.5, 0.46, 0.38), 'stoneAlt': (0.33, 0.3, 0.27),
    'moss': (0.15, 0.26, 0.03), 'snow': (0.85, 0.88, 0.92), 'cloth': (0.55, 0.47, 0.33), 'ember': (0.9, 0.25, 0.05),
}
GLOWING = {'ember': 4.0}
METAL = {'iron': 0.7}
GROUND = (232, 230, 222)


def paint():
    """Gives every part's material its flat colour, for the sheets and for anyone opening the .blend."""
    for part in catalog.PARTS:
        material = bpy.data.materials.get(part) or bpy.data.materials.new(part)
        colour = (*PALETTE[part], 1.0)
        material.diffuse_color = colour
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        output = nodes.new('ShaderNodeOutputMaterial')
        material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
        shader.inputs['Base Color'].default_value = colour
        shader.inputs['Roughness'].default_value = 0.85
        shader.inputs['Metallic'].default_value = METAL.get(part, 0.0)
        if part in GLOWING:
            shader.inputs['Emission Color'].default_value = colour
            shader.inputs['Emission Strength'].default_value = GLOWING[part]


def _stage():
    """The scene's renderer, its pale world, an orthographic camera and a sun, made once."""
    scene = bpy.context.scene
    if scene.camera is not None:
        return scene.camera, bpy.data.objects['preview.sun']
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = True
    scene.render.use_persistent_data = True
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('preview')
    world.use_nodes = True
    background = world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (0.6, 0.62, 0.66, 1.0)
    background.inputs['Strength'].default_value = 0.9
    scene.world = world
    camera = bpy.data.objects.new('preview.camera', bpy.data.cameras.new('preview.camera'))
    camera.data.type = 'ORTHO'
    camera.data.clip_end = 2000
    sun = bpy.data.objects.new('preview.sun', bpy.data.lights.new('preview.sun', 'SUN'))
    sun.data.energy = 3.5
    for item in (camera, sun):
        scene.collection.objects.link(item)
    scene.camera = camera
    return camera, sun


def _frame(item, camera, sun):
    """Points the camera at an object from the north-east and above, its front toward the viewer, and fits it;
    keeps the sun over the camera's shoulder."""
    corners = [item.matrix_world @ Vector(corner) for corner in item.bound_box]
    middle = sum(corners, Vector()) / len(corners)
    elevation, azimuth = math.radians(28), math.radians(35)
    # The view's direction from the north-east, where the module's front (-y) looks, y negated into Blender's.
    toward = Vector((math.sin(azimuth) * math.cos(elevation), math.cos(azimuth) * math.cos(elevation),
                     math.sin(elevation)))
    turn = (-toward).to_track_quat('-Z', 'Y')
    right, up = turn @ Vector((1, 0, 0)), turn @ Vector((0, 1, 0))
    wide = max(abs((corner - middle).dot(right)) for corner in corners) * 2
    high = max(abs((corner - middle).dot(up)) for corner in corners) * 2
    camera.data.ortho_scale = max(wide, high) * 1.08 + 0.05
    camera.location = middle + toward * (max(wide, high) * 2 + 10)
    camera.rotation_euler = turn.to_euler()
    sun.rotation_euler = (turn.to_matrix() @ Euler((math.radians(-35), math.radians(-30), 0)).to_matrix()).to_euler()


def sheet(kit_name, modules, counts, folder):
    """Renders each of a kit's modules ({name: object}, in order) into folder/<kit>/ and lays them in a labelled grid
    at folder/<kit>.png, each with its size and triangle count; gives the sheet's path."""
    camera, sun = _stage()
    singles = os.path.join(folder, kit_name)
    os.makedirs(singles, exist_ok=True)
    font = ImageFont.load_default(size=13)
    rows = math.ceil(len(modules) / COLUMNS)
    picture = Image.new('RGB', (COLUMNS * SIZE, TITLE + rows * (SIZE + LABEL)), GROUND)
    draw = ImageDraw.Draw(picture)
    draw.text((10, 10), f'{kit_name}: {len(modules)} modules, flat parts', fill=(30, 30, 30),
              font=ImageFont.load_default(size=18))
    for number, (module, item) in enumerate(modules.items()):
        for other in bpy.data.objects:
            if other.type == 'MESH':
                other.hide_render = other is not item
        _frame(item, camera, sun)
        path = os.path.join(singles, f'{module}.png')
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        left, top = (number % COLUMNS) * SIZE, TITLE + (number // COLUMNS) * (SIZE + LABEL)
        with Image.open(path) as render:
            picture.paste(render.convert('RGBA'), (left, top), render.convert('RGBA'))
        size = 'x'.join(f'{value:g}' for value in catalog.MODULES[module]['size'])
        draw.text((left + 6, top + SIZE + 3), catalog.piece_of(module), fill=(20, 20, 20), font=font)
        draw.text((left + 6, top + SIZE + 18), f'{size} m, {counts[module]} triangles', fill=(90, 90, 90), font=font)
    for other in bpy.data.objects:
        other.hide_render = False
    path = os.path.join(folder, f'{kit_name}.png')
    picture.save(path)
    return path
