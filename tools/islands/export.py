"""A kit's pack, `<kit>.modules`: every module's triangles in the island module's frame, tagged by part.

The bytes: a u32 little-endian header length, the header as UTF-8 JSON (format, style (the kit), parts, and each module's name,
vertexStart, vertexCount, indexStart, indexCount and bounds), then every vertex (28 bytes: position 3 × f32 metres;
normal 4 × snorm8, the 4th 0; UV 2 × f32 metres; part 4 × u8, the first the part's number), then every index (u32),
each module's counted from its own first vertex. `pack` takes plain arrays, so it runs without Blender; `gather`
reads them off a Blender object.
"""
import json
import struct

import catalog

FORMAT = 1
VERTEX = struct.Struct('<3f4b2f4B')


def snorm8(value):
    return max(-127, min(127, round(value * 127)))


def pack(kit, modules):
    """The pack's bytes. `modules` is a list of (name, triangles), each triangle three corners (position, normal, uv,
    part): position and normal (x, y, z) in the island module's frame, uv (u, v) metres, part a number into the parts."""
    vertices, indices, entries = bytearray(), [], []
    for name, triangles in modules:
        if not triangles:
            raise ValueError(f'{name} has no triangles')
        index_of, low, high = {}, [float('inf')] * 3, [float('-inf')] * 3
        start = len(indices)
        for corners in triangles:
            if len(corners) != 3:
                raise ValueError(f'{name} has a face of {len(corners)} corners, not a triangle')
            for position, normal, uv, part in corners:
                if not 0 <= part < len(catalog.PARTS):
                    raise ValueError(f'{name} has a corner in part {part}, past the {len(catalog.PARTS)} parts')
                packed = VERTEX.pack(*position, *(snorm8(value) for value in normal), 0, *uv, part, 0, 0, 0)
                if packed not in index_of:
                    index_of[packed] = len(index_of)
                    vertices += packed
                    low = [min(old, new) for old, new in zip(low, position)]
                    high = [max(old, new) for old, new in zip(high, position)]
                indices.append(index_of[packed])
        entries.append({
            'name': name,
            'vertexStart': len(vertices) // VERTEX.size - len(index_of),
            'vertexCount': len(index_of),
            'indexStart': start,
            'indexCount': len(indices) - start,
            'bounds': [round(value, 4) for value in low + high],
        })
    header = {'format': FORMAT, 'style': kit, 'parts': list(catalog.PARTS), 'modules': entries}
    text = json.dumps(header, separators=(',', ':'), allow_nan=False).encode()
    # Spaces after the JSON start the vertices on a 4-byte boundary, so a reader views them in place.
    text += b' ' * (-(4 + len(text)) % 4)
    return struct.pack('<I', len(text)) + text + bytes(vertices) + struct.pack(f'<{len(indices)}I', *indices)


def read_header(data):
    """A pack's header, checked against the contracts: its format and parts."""
    length = struct.unpack_from('<I', data, 0)[0]
    header = json.loads(data[4:4 + length])
    if header.get('format') != FORMAT or header.get('parts') != list(catalog.PARTS):
        raise ValueError(f"a pack of format {header.get('format')!r} and other parts than kits.json's")
    return header


def part_names(item):
    """Each material slot's part, refusing a slot that is not one of the parts."""
    names = [slot.material.name if slot.material else None for slot in item.material_slots]
    if not names:
        raise ValueError(f'{item.name} has no material: give it a part with kit.set_part')
    for name in names:
        if name not in catalog.PARTS:
            raise ValueError(f'{item.name} has a face in {name!r}, no part: one of {", ".join(catalog.PARTS)}')
    return names


def gather(item, depsgraph):
    """A Blender object's triangles as `pack` takes them: its evaluated mesh, modifiers and all, placed in the scene,
    y negated back into the island module's frame, each corner's own (split) normal, its UVs as made, and each face's part
    its material's name. An object without UVs is refused: the page draws by them."""
    evaluated = item.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        matrix = item.matrix_world.copy()
        mesh.transform(matrix)
        # A mirrored placement turns its faces inside out, and leaves the normals Blender works out pointing in.
        inward = -1 if matrix.determinant() < 0 else 1
        mesh.calc_loop_triangles()
        names = part_names(item)
        uvs = mesh.uv_layers.active
        if uvs is None:
            raise ValueError(f'{item.name} has no UVs: make it with the kit, or unwrap it in metres')
        triangles = []
        for triangle in mesh.loop_triangles:
            part = catalog.PARTS.index(names[min(triangle.material_index, len(names) - 1)])
            corners = []
            for loop_index in triangle.loops:
                position = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                normal = mesh.corner_normals[loop_index].vector * inward
                corners.append(((position.x, -position.y, position.z), (normal.x, -normal.y, normal.z),
                                tuple(uvs.data[loop_index].uv), part))
            triangles.append(corners)
        return triangles
    finally:
        evaluated.to_mesh_clear()
