"""Exports a ship modelled in Blender to Overlook's mesh, and publishes the model and the mesh to R2.

    <python with bpy> tools/ships/export_ship.py /path/to/Ship.blend <name> --waterline <metres> [--dry-run]

bpy is Blender as a Python module: make a Python 3.13 venv and `pip install bpy==5.3.0`. Run it from a folder outside
the repo, with absolute paths: bpy aborts when a module beside the working folder shadows one of its own. With
--dry-run it writes `<name>.mesh` into the working folder and uploads nothing; without, it uploads the .blend (the
source) and the mesh under their hashes and names both in content/ships/ships.json.

The mesh: a header's length (u32), the header (JSON), spaces to a 4-byte boundary, then 20 bytes a vertex (position
3 x float32 metres, normal 4 x snorm8, colour 4 x unorm8 sRGB) and 4 a corner (u32 indices, three a triangle). The
ship's frame: x toward her bow, y to starboard, z up, the origin amidships on her waterline (--waterline metres above
the model's z = 0).
"""
import argparse
import json
import os
import struct
import sys

import bpy  # first: bmesh is Blender's own and only importable once bpy has loaded
import bmesh

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, TOOLS)
from r2 import PUBLIC, published, put  # noqa: E402

MANIFEST = os.path.join(os.path.dirname(TOOLS), 'content', 'ships', 'ships.json')
EMPTY_SLOT_GREY = (0.8, 0.8, 0.8)


def srgb(linear):
    """A linear colour channel (Blender's) as the sRGB byte the canvas shows."""
    value = max(0.0, min(1.0, linear))
    shown = value * 12.92 if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055
    return round(shown * 255)


def colour_of(material):
    """A material's base colour: its Principled BSDF's, else its viewport colour; an empty slot is plain grey."""
    if material is None:
        return EMPTY_SLOT_GREY
    if material.node_tree is not None:
        for node in material.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                return tuple(node.inputs['Base Color'].default_value[:3])
    return tuple(material.diffuse_color[:3])


def snorm8(value):
    return max(-127, min(127, round(value * 127)))


def triangles(depsgraph):
    """Every rendered mesh's triangles in the ship's frame: three (position, normal, colour) corners each."""
    for item in bpy.context.scene.objects:
        if item.type != 'MESH' or item.hide_render:
            continue
        evaluated = item.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.transform(item.matrix_world)
        mirrored = item.matrix_world.determinant() < 0
        built = bmesh.new()
        built.from_mesh(mesh)
        bmesh.ops.triangulate(built, faces=built.faces)
        built.to_mesh(mesh)
        built.free()
        slots = [slot.material for slot in item.material_slots] or [None]
        colours = [srgb_triple(colour_of(material)) for material in slots]
        for polygon in mesh.polygons:
            colour = colours[min(polygon.material_index, len(colours) - 1)]
            corners = []
            for loop_index in polygon.loop_indices:
                position = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                normal = mesh.corner_normals[loop_index].vector
                # Blender's y is to port when x is forward; the ship's is to starboard.
                corners.append(((position.x, -position.y, position.z), (normal.x, -normal.y, normal.z), colour))
            # Mirroring y turns each triangle over, so its corners are taken the other way round.
            yield corners if mirrored else corners[::-1]
        evaluated.to_mesh_clear()


def srgb_triple(colour):
    return tuple(srgb(channel) for channel in colour)


def waterline(faces, level):
    """Where the triangles cross z = `level`: her length and beam there and her draught below it, metres, and the
    middle of that waterline (x, y), which becomes her origin."""
    crossings = []
    lowest = level
    for corners in faces:
        for index, (start, _, _) in enumerate(corners):
            end = corners[(index + 1) % 3][0]
            lowest = min(lowest, start[2])
            if (start[2] <= level <= end[2] or end[2] <= level <= start[2]) and start[2] != end[2]:
                share = (level - start[2]) / (end[2] - start[2])
                crossings.append([start[axis] + (end[axis] - start[axis]) * share for axis in range(2)])
    if not crossings:
        sys.exit(f'nothing in the model crosses z = {level}, so it has no waterline there')
    along = [point[0] for point in crossings]
    across = [point[1] for point in crossings]
    middle = ((max(along) + min(along)) / 2, (max(across) + min(across)) / 2)
    size = {
        'length_m': round(max(along) - min(along), 4),
        'beam_m': round(max(across) - min(across), 4),
        'draught_m': round(level - lowest, 4),
    }
    return size, middle


def moved(faces, offset):
    """The triangles with their corners moved by `offset` (x, y, z)."""
    def shifted(position):
        return tuple(axis + shift for axis, shift in zip(position, offset))

    return [[(shifted(position), normal, colour) for position, normal, colour in corners] for corners in faces]


def mesh_bytes(name, faces, size):
    """The mesh file: shared corners merged, its header first."""
    index_of, vertices, indices = {}, bytearray(), []
    low, high = [float('inf')] * 3, [float('-inf')] * 3
    for corners in faces:
        for position, normal, colour in corners:
            packed = struct.pack('<3f4b4B', *position, *(snorm8(value) for value in normal), 0, *colour, 255)
            if packed not in index_of:
                index_of[packed] = len(index_of)
                vertices += packed
                low = [min(old, new) for old, new in zip(low, position)]
                high = [max(old, new) for old, new in zip(high, position)]
            indices.append(index_of[packed])
    header = {
        'name': name,
        'vertices': len(index_of),
        'indices': len(indices),
        'bounds': [[round(value, 4) for value in low], [round(value, 4) for value in high]],
        'waterline': size,
    }
    text = json.dumps(header, separators=(',', ':')).encode()
    text += b' ' * (-(4 + len(text)) % 4)
    return header, struct.pack('<I', len(text)) + text + bytes(vertices) + struct.pack(f'<{len(indices)}I', *indices)


def publish(name, blend_path, mesh):
    with open(blend_path, 'rb') as file:
        source = put(file.read(), 'sources', 'blend', 'application/octet-stream')
    shape = put(mesh, 'ships', 'mesh', 'application/octet-stream')
    manifest = {'base': PUBLIC, 'ships': {}}
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as file:
            manifest = json.load(file)
    manifest['ships'][name] = {'mesh': shape, 'source': source}
    for key in (shape, source):
        published(manifest, key)
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w') as file:
        json.dump(manifest, file, indent=2)
        file.write('\n')
    print(f'{name}: mesh {shape}, source {source}; manifest written to {MANIFEST}')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('blend', help='the .blend file, an absolute path')
    parser.add_argument('name', help="the ship's name in the manifest, e.g. sloop")
    parser.add_argument('--waterline', type=float, required=True, help="her waterline's height in the model, metres")
    parser.add_argument('--dry-run', action='store_true', help='write <name>.mesh here and upload nothing')
    args = parser.parse_args()
    bpy.ops.wm.open_mainfile(filepath=args.blend)
    faces = list(triangles(bpy.context.evaluated_depsgraph_get()))
    size, (middle_x, middle_y) = waterline(faces, args.waterline)
    header, mesh = mesh_bytes(args.name, moved(faces, (-middle_x, -middle_y, -args.waterline)), size)
    print(json.dumps(header), f'{len(mesh) / 2 ** 20:.2f} MiB')
    if args.dry_run:
        with open(f'{args.name}.mesh', 'wb') as file:
            file.write(mesh)
        return
    publish(args.name, args.blend, mesh)


if __name__ == '__main__':
    main()
