"""UV-maps a ship's model in metres, sorts her faces into the parts the game paints, and saves the model anew.

    <python with bpy> tools/ships/paint_ship.py Ship.blend Painted.blend [--pictures <file>] [--scale <times>]

Each face goes to a part: `sail` stays canvas, an empty slot or an object with no material is spar (a cannon iron),
any other slot hull, or deck where the face looks up. Her UVs are metres, each face laid flat on the axis it faces most
(a spar along its own), so the painter's pictures repeat at their own scale; --pictures packs each part's in. A model
painted before is painted again so. --scale first brings her to that many times the owner's model about her origin;
the model keeps the scale it is at, so a run on one already there leaves her size alone.
"""
import argparse
import re
import struct
import sys

import bpy  # noqa: I001 - Blender's own modules load once bpy has
import bmesh
from mathutils import Matrix

PARTS = ('hull', 'deck', 'spar', 'sail', 'iron')
GUN_NAME = re.compile(r'Cannon\.(Port|Starboard)\.(\d+)$')
# A face looks up, and is deck, past this share of its normal.
DECK_UP = 0.7
# The game lays a picture at 40 texels a metre, as the forged models do; its pictures are 64 texels a side.
TEXELS_PER_METRE = 40
PICTURE_TEXELS = 64
# The scene's own record of how many times the owner's model she stands, kept in the saved model.
SCALE_KEY = 'overlook_scale'


def part_of(material, face_up):
    """A face's part by the material it was in and whether it looks up."""
    if material is None:
        return 'spar'
    if material.name in PARTS:
        return material.name
    if material.name.lower().startswith('sail'):
        return 'sail'
    return 'deck' if face_up else 'hull'


def picture_materials(pictures):
    """A material a part, by name; with pictures, each shows its own, repeating at the game's scale."""
    found = {}
    for index, name in enumerate(PARTS):
        material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        material.use_nodes = True
        found[name] = material
        if pictures is None:
            continue
        width, height, rgba = pictures[index]
        # A model painted before keeps its picture and nodes: they take the pictures anew.
        image = bpy.data.images.get(f'{name}.picture')
        if image is None or tuple(image.size) != (width, height):
            image = bpy.data.images.new(f'{name}.picture', width, height, alpha=False)
        # The painter's rows run top first, Blender's bottom first.
        rows = [rgba[row * width * 4:(row + 1) * width * 4] for row in range(height)][::-1]
        image.pixels = [byte / 255 for row in rows for byte in row]
        image.pack()
        nodes, links = material.node_tree.nodes, material.node_tree.links
        if any(node.type == 'TEX_IMAGE' for node in nodes):
            next(node for node in nodes if node.type == 'TEX_IMAGE').image = image
            continue
        shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.interpolation = 'Closest'
        mapping = nodes.new('ShaderNodeMapping')
        mapping.inputs['Scale'].default_value = (TEXELS_PER_METRE / width, TEXELS_PER_METRE / height, 1)
        coordinates = nodes.new('ShaderNodeTexCoord')
        links.new(coordinates.outputs['UV'], mapping.inputs['Vector'])
        links.new(mapping.outputs['Vector'], texture.inputs['Vector'])
        links.new(texture.outputs['Color'], shader.inputs['Base Color'])
    return found


def read_pictures(path):
    """The pictures `ship_pictures.ts` wrote: for each part in order, its width and height and its RGBA."""
    with open(path, 'rb') as file:
        data = file.read()
    pictures, at = [], 0
    for _ in PARTS:
        width, height = struct.unpack_from('<II', data, at)
        at += 8
        pictures.append((width, height, data[at:at + width * height * 4]))
        at += width * height * 4
    if at != len(data):
        sys.exit(f'{path} is not the pictures of the five parts')
    return pictures


def long_axis(faces):
    """The axis a piece of faces is longest along: 0, 1 or 2."""
    points = [vertex.co for face in faces for vertex in face.verts]
    spans = [max(point[axis] for point in points) - min(point[axis] for point in points) for axis in range(3)]
    return max(range(3), key=lambda axis: spans[axis])


def pieces(faces):
    """The faces joined through their edges, a list a piece."""
    left, found = set(faces), []
    while left:
        stack, piece = [left.pop()], []
        while stack:
            face = stack.pop()
            piece.append(face)
            for edge in face.edges:
                for other in edge.link_faces:
                    if other in left:
                        left.remove(other)
                        stack.append(other)
        found.append(piece)
    return found


def project(face, along=None):
    """Each corner's UV, metres: the face laid flat on the axis it faces most. With `along`, a spar's long axis, the
    grain runs up the picture (v) along it, and u across it."""
    normal = [abs(value) for value in face.normal]
    facing = max(range(3), key=lambda axis: normal[axis])
    if along is None:
        # x, her length, runs along the planks wherever it can.
        u_axis, v_axis = {0: (1, 2), 1: (0, 2), 2: (0, 1)}[facing]
    else:
        across = [axis for axis in range(3) if axis != along]
        u_axis = min(across, key=lambda axis: normal[axis])
        v_axis = along
    return [(loop.vert.co[u_axis], loop.vert.co[v_axis]) for loop in face.loops]


def paint(item, materials):
    """Sorts one mesh object's faces into parts and gives it UVs in metres, in place."""
    slots = [slot.material for slot in item.material_slots]
    bm = bmesh.new()
    bm.from_mesh(item.data)
    # Metres: the object's own placement, so the UVs and the up test are the world's.
    bm.transform(item.matrix_world)
    bm.normal_update()
    if item.matrix_world.determinant() < 0:
        sys.exit(f'{item.name} is placed mirrored: apply its scale in Blender first')
    gun = GUN_NAME.match(item.name)
    parts = {}
    for face in bm.faces:
        if not slots:
            parts[face] = 'iron' if gun else 'spar'
        else:
            material = slots[min(face.material_index, len(slots) - 1)]
            parts[face] = part_of(material, face.normal.z > DECK_UP)
    uv = bm.loops.layers.uv.verify()
    for piece in pieces([face for face in bm.faces if parts[face] == 'spar']):
        along = long_axis(piece)
        for face in piece:
            for loop, corner in zip(face.loops, project(face, along)):
                loop[uv].uv = corner
    for face in bm.faces:
        if parts[face] != 'spar':
            for loop, corner in zip(face.loops, project(face)):
                loop[uv].uv = corner
    item.data.materials.clear()
    for name in PARTS:
        item.data.materials.append(materials[name])
    for face in bm.faces:
        face.material_index = PARTS.index(parts[face])
    bm.transform(item.matrix_world.inverted())
    bm.to_mesh(item.data)
    bm.free()
    counts = {name: sum(1 for value in parts.values() if value == name) for name in PARTS}
    print(item.name, {name: count for name, count in counts.items() if count})


def size(times):
    """Brings the model to `times` the owner's model, about her origin, from the scale it is at."""
    scene = bpy.context.scene
    grow = times / scene.get(SCALE_KEY, 1.0)
    if abs(grow - 1.0) > 1e-9:
        for item in bpy.data.objects:
            if item.parent is None:
                item.matrix_world = Matrix.Scale(grow, 4) @ item.matrix_world
    scene[SCALE_KEY] = times
    print(f'{times} times the owner\'s model')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('blend', help='the model, an absolute path')
    parser.add_argument('out', help='where to save the painted model, an absolute path')
    parser.add_argument('--pictures', help="the parts' pictures, from tools/ships/ship_pictures.ts")
    parser.add_argument('--scale', type=float, help="how many times the owner's model she stands")
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
    bpy.ops.wm.open_mainfile(filepath=args.blend)
    if args.scale:
        size(args.scale)
    materials = picture_materials(read_pictures(args.pictures) if args.pictures else None)
    for item in bpy.data.objects:
        if item.type == 'MESH':
            paint(item, materials)
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    bpy.ops.wm.save_as_mainfile(filepath=args.out, compress=True)
    print(f'saved {args.out}')


if __name__ == '__main__':
    main()
