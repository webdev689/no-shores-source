"""A style's contact sheet: each module rendered small from a three-quarter view (Cycles on the CPU, a few samples),
laid in a labelled grid by Pillow. With pictures (tools/dungeon/previewPictures.ts) each part wears the game's own,
nearest-sampled through its metre UVs, lit by a torch and a dim cool fill on the dark; flat, each part is a plain
colour in an even light, so the parts read apart.
"""
import json
import math
import os
import struct

import bpy
import numpy
from mathutils import Euler, Vector
from PIL import Image, ImageDraw, ImageFont

import catalog

SIZE = 224
COLUMNS = 6
SAMPLES = 16
LABEL = 34
TITLE = 40
# Each part's flat colour (linear RGB): greys of stone told apart, warm timber, dark iron, and the lit ones glowing.
PALETTE = {
    'stone': (0.32, 0.31, 0.29), 'stoneAlt': (0.2, 0.21, 0.23), 'floor': (0.27, 0.23, 0.19),
    'ceiling': (0.23, 0.26, 0.31), 'trim': (0.47, 0.43, 0.36), 'wood': (0.3, 0.15, 0.06), 'iron': (0.07, 0.075, 0.085),
    'bone': (0.64, 0.58, 0.44), 'relief': (0.44, 0.33, 0.2), 'cloth': (0.36, 0.05, 0.06), 'rope': (0.43, 0.32, 0.16),
    'ore': (0.33, 0.12, 0.05), 'brass': (0.56, 0.4, 0.12), 'water': (0.02, 0.08, 0.1), 'glow': (1.0, 0.62, 0.25),
    'ember': (0.9, 0.25, 0.05), 'crystal': (0.45, 0.6, 1.0), 'fungus': (0.3, 0.9, 0.55), 'wax': (0.85, 0.8, 0.66),
}
GLOWING = {'glow': 6.0, 'ember': 4.0, 'crystal': 3.0, 'fungus': 2.5}
METAL = {'iron': 0.7, 'brass': 0.9}
# The torch: a warm point light 2.1 m over the floor, 2 m before a piece and to its west, and a dim cool fill.
TORCH = {'colour': (1.0, 0.62, 0.3), 'watts': 260.0, 'up': 2.1, 'before': 2.0, 'aside': -1.4}
FILL = {'colour': (0.55, 0.65, 0.9), 'strength': 0.12}
DARK = (0.004, 0.005, 0.007, 1.0)


def _linear(value):
    """A colour channel as the game writes it, made linear for Blender."""
    return math.copysign(abs(value) ** 2.2, value)


def _reset(material):
    """A material's nodes cleared to one shader and its output; gives the shader."""
    nodes = material.node_tree.nodes
    nodes.clear()
    shader = nodes.new('ShaderNodeBsdfPrincipled')
    output = nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    return shader


def paint():
    """Gives every part's material its flat colour, for the flat sheets and for anyone opening the .blend."""
    for part in catalog.PARTS:
        material = bpy.data.materials.get(part) or bpy.data.materials.new(part)
        colour = (*PALETTE[part], 1.0)
        material.diffuse_color = colour
        shader = _reset(material)
        shader.inputs['Base Color'].default_value = colour
        shader.inputs['Roughness'].default_value = 0.12 if part == 'water' else 0.8
        shader.inputs['Metallic'].default_value = METAL.get(part, 0.0)
        if part in GLOWING:
            shader.inputs['Emission Color'].default_value = colour
            shader.inputs['Emission Strength'].default_value = GLOWING[part]


def read_pictures(path):
    """A style's pictures as previewPictures.ts writes them: {part: (tile metres, (width, height, rgba) or None,
    colour or None)}, refusing a file not of kits.json's parts."""
    with open(path, 'rb') as file:
        data = file.read()
    length = struct.unpack_from('<I', data, 0)[0]
    header = json.loads(data[4:4 + length])
    if [part['name'] for part in header['parts']] != list(catalog.PARTS):
        raise ValueError(f"{path} holds other parts than kits.json's")
    found, at = {}, 4 + length
    for part in header['parts']:
        picture = None
        if 'size' in part:
            width, height = part['size']
            picture = (width, height, data[at:at + width * height * 4])
            at += width * height * 4
        found[part['name']] = (part['tile'], picture, part.get('colour'))
    if at != len(data):
        raise ValueError(f'{path} is not as long as its header says')
    return found


def dress(style, pictures):
    """Puts each part's material in the style's picture, repeating every tile metres along its UVs, nearest-sampled;
    a glowing part in its own colour, still water and wax lit as the game lights them."""
    for part, (tile, picture, colour) in pictures.items():
        material = bpy.data.materials.get(part) or bpy.data.materials.new(part)
        shader = _reset(material)
        shader.inputs['Roughness'].default_value = 0.9
        if picture is None:
            linear = (*(_linear(value) for value in colour), 1.0)
            if part in ('wax', 'water'):
                shader.inputs['Base Color'].default_value = linear
                shader.inputs['Roughness'].default_value = 0.1 if part == 'water' else 0.6
            else:
                shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
                shader.inputs['Emission Color'].default_value = linear
                shader.inputs['Emission Strength'].default_value = 1.0
            continue
        width, height, rgba = picture
        name = f'{style}.{part}'
        image = bpy.data.images.get(name) or bpy.data.images.new(name, width, height, alpha=False)
        # The painter's rows run top first, Blender's bottom first.
        texels = numpy.frombuffer(rgba, numpy.uint8).reshape(height, width, 4)[::-1]
        image.pixels.foreach_set((texels.astype(numpy.float32) / 255).ravel())
        nodes, links = material.node_tree.nodes, material.node_tree.links
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.interpolation = 'Closest'
        mapping = nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1)
        links.new(nodes.new('ShaderNodeTexCoord').outputs['UV'], mapping.inputs['Vector'])
        links.new(mapping.outputs['Vector'], texture.inputs['Vector'])
        links.new(texture.outputs['Color'], shader.inputs['Base Color'])


def _stage(lit):
    """The scene's renderer, its world, an orthographic camera and its lights, made once: a torch and a cool fill on
    the dark when `lit`, else an even sun."""
    scene = bpy.context.scene
    if scene.camera is not None:
        return scene.camera, bpy.data.objects['preview.light']
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.use_persistent_data = True
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('preview')
    background = world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = DARK if lit else (0.05, 0.05, 0.06, 1.0)
    background.inputs['Strength'].default_value = 1.0 if lit else 1.6
    scene.world = world
    camera = bpy.data.objects.new('preview.camera', bpy.data.cameras.new('preview.camera'))
    camera.data.type = 'ORTHO'
    camera.data.clip_end = 1000
    light = bpy.data.lights.new('preview.light', 'POINT' if lit else 'SUN')
    light.energy = TORCH['watts'] if lit else 3.5
    if lit:
        light.color = TORCH['colour']
        light.shadow_soft_size = 0.05
        fill = bpy.data.objects.new('preview.fill', bpy.data.lights.new('preview.fill', 'SUN'))
        fill.data.energy, fill.data.color = FILL['strength'], FILL['colour']
        fill.rotation_euler = Euler((math.radians(50), 0, math.radians(-140)))
        scene.collection.objects.link(fill)
    for item in (camera, bpy.data.objects.new('preview.light', light)):
        scene.collection.objects.link(item)
    scene.camera = camera
    return camera, bpy.data.objects['preview.light']


def _frame(item, camera, light, piece):
    """Points the camera at an object from the south-east, above it (below a ceiling piece), and fits it; puts the
    torch 2 m before it (south) and to its west, 2.1 m over the floor, or keeps the sun over the camera's shoulder."""
    corners = [item.matrix_world @ Vector(corner) for corner in item.bound_box]
    middle = sum(corners, Vector()) / len(corners)
    elevation = math.radians(-30 if piece.startswith('ceiling') else 30)
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
    if light.data.type == 'SUN':
        light.rotation_euler = (turn.to_matrix() @ Euler((math.radians(-35), math.radians(-30), 0)).to_matrix()
                                ).to_euler()
        return
    # A ceiling piece hangs from z 0 over a floor 3.2 below; a sconce's frame is the torch's own height.
    floor = -catalog.CELL_M if piece.startswith('ceiling') else -1.9 if piece == 'sconce' else 0.0
    front = min(corner.y for corner in corners)
    light.location = (middle.x + TORCH['aside'], front - TORCH['before'], floor + TORCH['up'])


def _label(module):
    landmark = catalog.landmark(module)
    return landmark['name'] if landmark else catalog.piece_of(module) or module


def sheet(style, modules, counts, folder, pictures=None):
    """Renders each of a style's modules ({name: object}, in order) into folder/<style>/ and lays them in a labelled
    grid at folder/<style>.png, each with its triangle count from `counts`, in the style's pictures (read_pictures)
    by torchlight, or flat without them; gives the sheet's path."""
    camera, light = _stage(pictures is not None)
    if pictures is not None:
        dress(style, pictures)
    singles = os.path.join(folder, style)
    os.makedirs(singles, exist_ok=True)
    font = ImageFont.load_default(size=13)
    rows = math.ceil(len(modules) / COLUMNS)
    picture = Image.new('RGB', (COLUMNS * SIZE, TITLE + rows * (SIZE + LABEL)), (14, 14, 16))
    draw = ImageDraw.Draw(picture)
    title = f'{style}: {len(modules)} modules, ' + ('pictures by torchlight' if pictures is not None else 'flat parts')
    draw.text((10, 10), title, fill=(235, 235, 235), font=ImageFont.load_default(size=18))
    for number, (module, item) in enumerate(modules.items()):
        for other in bpy.data.objects:
            if other.type == 'MESH':
                other.hide_render = other is not item
        _frame(item, camera, light, catalog.piece_of(module) or '')
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
