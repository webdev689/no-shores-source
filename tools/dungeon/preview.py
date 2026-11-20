"""A style's contact sheet: each module rendered small from a three-quarter view (Cycles on the CPU, a few samples),
its parts in plain colours so they read apart, then laid in a labelled grid by Pillow.
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
# Each part's colour (linear RGB): greys of stone told apart, warm timber, dark iron, and the lit ones glowing.
PALETTE = {
    'stone': (0.32, 0.31, 0.29), 'stoneAlt': (0.2, 0.21, 0.23), 'floor': (0.27, 0.23, 0.19),
    'ceiling': (0.23, 0.26, 0.31), 'trim': (0.47, 0.43, 0.36), 'wood': (0.3, 0.15, 0.06), 'iron': (0.07, 0.075, 0.085),
    'bone': (0.64, 0.58, 0.44), 'relief': (0.44, 0.33, 0.2), 'cloth': (0.36, 0.05, 0.06), 'rope': (0.43, 0.32, 0.16),
    'ore': (0.33, 0.12, 0.05), 'brass': (0.56, 0.4, 0.12), 'water': (0.02, 0.08, 0.1), 'glow': (1.0, 0.62, 0.25),
    'ember': (0.9, 0.25, 0.05), 'crystal': (0.45, 0.6, 1.0), 'fungus': (0.3, 0.9, 0.55), 'wax': (0.85, 0.8, 0.66),
}
GLOWING = {'glow': 6.0, 'ember': 4.0, 'crystal': 3.0, 'fungus': 2.5}
METAL = {'iron': 0.7, 'brass': 0.9}


def paint():
    """Gives every part's material its colour, for the renders and for anyone opening the .blend."""
    for part in catalog.PARTS:
        material = bpy.data.materials.get(part) or bpy.data.materials.new(part)
        colour = (*PALETTE[part], 1.0)
        material.diffuse_color = colour
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = colour
        shader.inputs['Roughness'].default_value = 0.12 if part == 'water' else 0.8
        shader.inputs['Metallic'].default_value = METAL.get(part, 0.0)
        if part in GLOWING:
            shader.inputs['Emission Color'].default_value = colour
            shader.inputs['Emission Strength'].default_value = GLOWING[part]


def _stage():
    """The scene's renderer, a dark world, an orthographic camera and a sun, made once."""
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
    scene.render.use_persistent_data = True
    world = bpy.data.worlds.new('preview')
    background = world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (0.05, 0.05, 0.06, 1.0)
    background.inputs['Strength'].default_value = 1.6
    scene.world = world
    camera = bpy.data.objects.new('preview.camera', bpy.data.cameras.new('preview.camera'))
    camera.data.type = 'ORTHO'
    camera.data.clip_end = 1000
    sun = bpy.data.objects.new('preview.sun', bpy.data.lights.new('preview.sun', 'SUN'))
    sun.data.energy = 3.5
    for item in (camera, sun):
        scene.collection.objects.link(item)
    scene.camera = camera
    return camera, sun


def _frame(item, camera, sun, from_below):
    """Points the camera at an object from the south-east, above it (below it for a ceiling piece), and fits it."""
    corners = [item.matrix_world @ Vector(corner) for corner in item.bound_box]
    middle = sum(corners, Vector()) / len(corners)
    elevation = math.radians(-30 if from_below else 30)
    azimuth = math.radians(35)
    # The view's direction in the dungeon's frame (from the south-east), y negated into Blender's.
    toward = Vector((math.sin(azimuth) * math.cos(elevation), -math.cos(azimuth) * math.cos(elevation),
                     math.sin(elevation)))
    turn = (-toward).to_track_quat('-Z', 'Y')
    right, up = turn @ Vector((1, 0, 0)), turn @ Vector((0, 1, 0))
    wide = max(abs((corner - middle).dot(right)) for corner in corners) * 2
    high = max(abs((corner - middle).dot(up)) for corner in corners) * 2
    camera.data.ortho_scale = max(wide, high) * 1.12 + 0.05
    camera.location = middle + toward * (max(wide, high) * 2 + 10)
    camera.rotation_euler = turn.to_euler()
    sun.rotation_euler = (turn.to_matrix() @ Euler((math.radians(-35), math.radians(-30), 0)).to_matrix()).to_euler()


def _label(module):
    landmark = catalog.landmark(module)
    return landmark['name'] if landmark else catalog.piece_of(module)


def sheet(style, modules, counts, folder):
    """Renders each of a style's modules ({name: object}, in order) into folder/<style>/ and lays them in a labelled
    grid at folder/<style>.png, each with its triangle count from `counts`; gives that path."""
    camera, sun = _stage()
    singles = os.path.join(folder, style)
    os.makedirs(singles, exist_ok=True)
    font = ImageFont.load_default(size=13)
    rows = math.ceil(len(modules) / COLUMNS)
    picture = Image.new('RGB', (COLUMNS * SIZE, TITLE + rows * (SIZE + LABEL)), (24, 24, 27))
    draw = ImageDraw.Draw(picture)
    draw.text((10, 10), f'{style}: {len(modules)} modules', fill=(235, 235, 235), font=ImageFont.load_default(size=18))
    for number, (module, item) in enumerate(modules.items()):
        for other in bpy.data.objects:
            if other.type == 'MESH':
                other.hide_render = other is not item
        _frame(item, camera, sun, (catalog.piece_of(module) or '').startswith('ceiling'))
        path = os.path.join(singles, f'{module}.png')
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        left, top = (number % COLUMNS) * SIZE, TITLE + (number // COLUMNS) * (SIZE + LABEL)
        with Image.open(path) as render:
            picture.paste(render.convert('RGB'), (left, top))
        draw.text((left + 6, top + SIZE + 3), _label(module), fill=(235, 235, 235), font=font)
        draw.text((left + 6, top + SIZE + 18), f'{counts[module]} triangles', fill=(150, 150, 150), font=font)
    for other in bpy.data.objects:
        other.hide_render = False
    path = os.path.join(folder, f'{style}.png')
    picture.save(path)
    return path
