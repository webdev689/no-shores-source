"""Exports a ship modelled in Blender to Overlook's mesh, and publishes the model and the mesh to R2.

    <python with bpy> tools/ships/export_ship.py /path/to/Ship.blend <name> --waterline <metres> [--dry-run]

bpy is Blender as a Python module: make a Python 3.13 venv and `pip install bpy==5.3.0`. With --dry-run it writes
`<name>.mesh` into the working folder (so run it from one outside the repo) and uploads nothing; without, it uploads
the .blend and the mesh under their hashes and names both, with her waterline, in content/ships/ships.json. The
format and the ship's frame are in the Sailing note.
"""
import argparse
import json
import os
import struct
import sys

import bpy

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
                base = node.inputs['Base Color']
                if base.is_linked:
                    print(f"warning: {material.name}'s base colour comes from a node; its own value is used")
                return tuple(base.default_value[:3])
    return tuple(material.diffuse_color[:3])


def snorm8(value):
    return max(-127, min(127, round(value * 127)))


def render_hidden(scene):
    """The names of the collections Blender would not render: hidden themselves, or inside one that is."""
    hidden = set()

    def walk(collection, parent_hidden):
        now = parent_hidden or collection.hide_render
        if now:
            hidden.add(collection.name)
        for child in collection.children:
            walk(child, now)

    walk(scene.collection, False)
    return hidden


def rendered(instance, hidden):
    """Whether Blender would render an instance: its object, and the object that places it, shown in a render."""
    owners = [instance.object.original] + ([instance.parent.original] if instance.is_instance else [])
    shown = [any(collection.name not in hidden for collection in owner.users_collection) for owner in owners]
    return all(not owner.hide_render for owner in owners) and all(shown)


def triangles(depsgraph):
    """Every rendered mesh's triangles, collection instances among them, in the ship's frame: three (position, normal,
    colour) corners each."""
    hidden = render_hidden(bpy.context.scene)
    for instance in depsgraph.object_instances:
        item = instance.object
        if item.type != 'MESH' or not rendered(instance, hidden):
            continue
        matrix = instance.matrix_world.copy()
        mesh = item.to_mesh()
        mesh.transform(matrix)
        # A mirrored placement turns its faces inside out, and leaves the normals Blender works out pointing in.
        mirrored = matrix.determinant() < 0
        inward = -1 if mirrored else 1
        mesh.calc_loop_triangles()
        slots = [slot.material for slot in item.material_slots] or [None]
        colours = [srgb_triple(colour_of(material)) for material in slots]
        for triangle in mesh.loop_triangles:
            colour = colours[min(triangle.material_index, len(colours) - 1)]
            corners = []
            for loop_index in triangle.loops:
                position = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                normal = mesh.corner_normals[loop_index].vector * inward
                # Blender's y is to port when x is forward; the ship's is to starboard. The world the game draws in
                # (east, south, up) is mirrored the same way, so each face keeps its corners' order.
                corners.append(((position.x, -position.y, position.z), (normal.x, -normal.y, normal.z), colour))
            yield corners[::-1] if mirrored else corners
        item.to_mesh_clear()


def wound_outward(faces):
    """The share of faces wound counter-clockwise about their outward normals, as Blender winds a model's faces. The
    ship's frame is the model's mirrored, so here such a face's corners run the other way about its normal."""
    outward = 0
    for corners in faces:
        (first, normal_a, _), (second, normal_b, _), (third, normal_c, _) = corners
        along = [second[axis] - first[axis] for axis in range(3)]
        across = [third[axis] - first[axis] for axis in range(3)]
        turn = [
            along[1] * across[2] - along[2] * across[1],
            along[2] * across[0] - along[0] * across[2],
            along[0] * across[1] - along[1] * across[0],
        ]
        normal = [normal_a[axis] + normal_b[axis] + normal_c[axis] for axis in range(3)]
        outward += sum(turn[axis] * normal[axis] for axis in range(3)) < 0
    return outward / max(len(faces), 1)


def srgb_triple(colour):
    return tuple(srgb(channel) for channel in colour)


def waterline(faces, level):
    """Where the triangles cross z = `level`: her length and beam there and her draught below it, metres (with the
    level itself), and the middle of that waterline (x, y), which becomes her origin."""
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
        'level_m': level,
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


def publish(name, blend_path, mesh, size):
    with open(blend_path, 'rb') as file:
        source = put(file.read(), 'sources', 'blend', 'application/octet-stream')
    shape = put(mesh, 'ships', 'mesh', 'application/octet-stream')
    manifest = {'base': PUBLIC, 'ships': {}}
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as file:
            manifest = json.load(file)
    manifest['ships'][name] = {'mesh': shape, 'source': source, 'waterline': size}
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
    outward = wound_outward(faces)
    if outward < 0.99:
        sys.exit(f'only {outward:.1%} of the faces are wound outward: recalculate the normals in Blender (Shift+N)')
    size, (middle_x, middle_y) = waterline(faces, args.waterline)
    header, mesh = mesh_bytes(args.name, moved(faces, (-middle_x, -middle_y, -args.waterline)), size)
    print(json.dumps(header), f'{len(mesh) / 2 ** 20:.2f} MiB')
    if args.dry_run:
        with open(f'{args.name}.mesh', 'wb') as file:
            file.write(mesh)
        return
    publish(args.name, args.blend, mesh, size)


if __name__ == '__main__':
    main()
