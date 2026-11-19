"""Exports a ship modelled in Blender to Overlook's mesh, and publishes the model and the mesh to R2.

    <python with bpy> tools/ships/export_ship.py /path/to/Ship.blend <name> --waterline <metres> [--dry-run]

bpy is Blender as a Python module: make a Python 3.13 venv and `pip install bpy==5.3.0`. The model's faces are in the
part materials tools/ships/paint_ship.py sorts them into, with UVs in metres. With --dry-run it writes `<name>.mesh`
into the working folder (so run it from one outside the repo) and uploads nothing; without, it uploads the .blend and
the mesh under their hashes and names both, with her waterline, guns, boxes, sails and deck, in
content/ships/ships.json.
"""
import argparse
import json
import math
import os
import re
import struct
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)
from deck import HELM_AFT_M, MANIFEST, deck_of, mesh_triangles, write_manifest  # noqa: E402
from r2 import PUBLIC, published, put  # noqa: E402

# The parts the game paints, numbered as her mesh numbers them (client/src/textures/shipPictures.ts).
PARTS = ('hull', 'deck', 'spar', 'sail', 'iron')
# The parts a ball strikes as her hull; her spars and guns take none.
HULL_PARTS = ('hull', 'deck')
# A sail's outline turns at a corner by more than this, degrees: her model's canvas edges bend a little between them.
CORNER_TURN_DEG = 20
GUN_NAME = re.compile(r'Cannon\.(Port|Starboard)\.(\d+)$')
# How near the barrel's outboard end a vertex lies to be its mouth's rim, metres.
MOUTH_M = 0.01


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


def part_names(item):
    """Each material slot's part, refusing a slot that is not one of the parts."""
    names = [slot.material.name if slot.material else None for slot in item.material_slots]
    for name in names:
        if name not in PARTS:
            sys.exit(f'{item.name} has a face in {name!r}, no part: run tools/ships/paint_ship.py on the model first')
    if not names:
        sys.exit(f'{item.name} has no material: run tools/ships/paint_ship.py on the model first')
    return names


def triangles(depsgraph):
    """Every rendered mesh's triangles but her canvas's (the game sets her sails), collection instances among them, in
    the ship's frame: three (position, normal, uv, part) corners each."""
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
        names = part_names(item)
        uvs = mesh.uv_layers.active
        if uvs is None:
            sys.exit(f'{item.name} has no UVs: run tools/ships/paint_ship.py on the model first')
        for triangle in mesh.loop_triangles:
            part = PARTS.index(names[min(triangle.material_index, len(names) - 1)])
            if PARTS[part] == 'sail':
                continue
            corners = []
            for loop_index in triangle.loops:
                position = mesh.vertices[mesh.loops[loop_index].vertex_index].co
                normal = mesh.corner_normals[loop_index].vector * inward
                uv = tuple(uvs.data[loop_index].uv)
                # Blender's y is to port when x is forward; the ship's is to starboard. The world the game draws in
                # (east, south, up) is mirrored the same way, so each face keeps its corners' order.
                corners.append(((position.x, -position.y, position.z), (normal.x, -normal.y, normal.z), uv, part))
            yield corners[::-1] if mirrored else corners
        item.to_mesh_clear()


def wound_outward(faces):
    """The share of faces wound counter-clockwise about their outward normals, as Blender winds a model's faces. The
    ship's frame is the model's mirrored, so here such a face's corners run the other way about its normal."""
    outward = 0
    for corners in faces:
        (first, normal_a, *_), (second, normal_b, *_), (third, normal_c, *_) = corners
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


def waterline(faces, level):
    """Where the triangles cross z = `level`: her length and beam there and her draught below it, metres (with the
    level itself), and the middle of that waterline (x, y), which becomes her origin."""
    crossings = []
    lowest = level
    for corners in faces:
        for index, (start, *_) in enumerate(corners):
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


def guns(objects, offset):
    """Every gun (an object named Cannon.Port.<n> or Cannon.Starboard.<n>, numbered fore to aft): its side, its mouth
    (the middle of the barrel's outboard end) and its bore (the barrel's direction), in the ship's frame moved by
    `offset`. A barrel lies along its mesh's longest axis."""
    found = []
    for item in objects:
        named = GUN_NAME.match(item.name)
        if not named or item.type != 'MESH':
            continue
        matrix = item.matrix_world
        turn = matrix.to_3x3().normalized()
        corners = [matrix @ vertex.co for vertex in item.data.vertices]
        middle_y = sum(corner.y for corner in corners) / len(corners)

        def span(axis):
            along = [corner.dot(turn.col[axis]) for corner in corners]
            return max(along) - min(along)

        bore = turn.col[max(range(3), key=span)]
        if bore.y * middle_y < 0:
            bore = -bore
        end = max(corner.dot(bore) for corner in corners)
        rim = [corner for corner in corners if corner.dot(bore) >= end - MOUTH_M]
        mouth = [sum(corner[axis] for corner in rim) / len(rim) for axis in range(3)]
        found.append({
            'name': item.name,
            'side': named.group(1).lower(),
            'mouth_m': [round(value + shift, 4) for value, shift in zip((mouth[0], -mouth[1], mouth[2]), offset)],
            'bore': [round(value, 4) for value in (bore.x, -bore.y, bore.z)],
        })
    found.sort(key=lambda gun: (gun['side'], int(GUN_NAME.match(gun['name']).group(2))))
    for gun, ahead in zip(found, found[1:]):
        if gun['side'] == ahead['side'] and gun['mouth_m'][0] <= ahead['mouth_m'][0]:
            sys.exit(f"{gun['name']} is not ahead of {ahead['name']}: number a side's guns fore to aft")
    return found


def bounds(points):
    """The box round some points: its low and high corners."""
    return [[round(min(point[axis] for point in points), 4) for axis in range(3)],
            [round(max(point[axis] for point in points), 4) for axis in range(3)]]


def boxes(depsgraph, offset):
    """What a ball can strike, in the ship's frame moved by `offset`: her hull (the box round every face of her hull and
    deck) and her sails (a box round each connected piece of her canvas). Her spars and guns take no balls."""
    hidden = render_hidden(bpy.context.scene)
    hull, pieces = [], []
    for instance in depsgraph.object_instances:
        item = instance.object
        if item.type != 'MESH' or not rendered(instance, hidden) or GUN_NAME.match(item.original.name):
            continue
        mesh = item.to_mesh()
        mesh.transform(instance.matrix_world.copy())
        names = part_names(item)
        # The canvas's pieces: faces of a sail material joined through the vertices they share.
        joined = {}

        def root(vertex):
            while joined.setdefault(vertex, vertex) != vertex:
                vertex = joined[vertex]
            return vertex

        canvas = []
        for polygon in mesh.polygons:
            name = names[min(polygon.material_index, len(names) - 1)]
            corners = [mesh.vertices[index].co for index in polygon.vertices]
            points = [(corner.x + offset[0], -corner.y + offset[1], corner.z + offset[2]) for corner in corners]
            if name == 'sail':
                first = root(polygon.vertices[0])
                for index in polygon.vertices[1:]:
                    joined[root(index)] = first
                canvas.append((polygon.vertices[0], points))
            elif name in HULL_PARTS:
                hull.extend(points)
        by_piece = {}
        for vertex, points in canvas:
            by_piece.setdefault(root(vertex), []).extend(points)
        pieces.extend(by_piece.values())
        item.to_mesh_clear()
    if not hull:
        sys.exit('no face of the model is her hull or deck, so she has no hull to strike')
    # Fore to aft, as the guns are numbered.
    sails = sorted((bounds(points) for points in pieces), key=lambda box: -box[1][0])
    return {'hull': bounds(hull), 'sails': sails}


def outline_corners(polygons):
    """A piece of canvas's corners, in order round it: the points where its outline (the edges one face alone has)
    turns by more than CORNER_TURN_DEG."""
    edges = {}
    for polygon in polygons:
        for start, end in zip(polygon, polygon[1:] + polygon[:1]):
            key = (min(start, end), max(start, end))
            edges[key] = edges.get(key, 0) + 1
    following = {}
    for start, end in (key for key, count in edges.items() if count == 1):
        following.setdefault(start, []).append(end)
        following.setdefault(end, []).append(start)
    first = next(iter(following))
    ring, previous = [first], None
    while True:
        here = ring[-1]
        step = next((other for other in following[here] if other != previous), None)
        if step is None or step == first:
            break
        ring.append(step)
        previous = here
    corners = []
    for index, point in enumerate(ring):
        before, after = ring[index - 1], ring[(index + 1) % len(ring)]
        incoming = [point[axis] - before[axis] for axis in range(3)]
        outgoing = [after[axis] - point[axis] for axis in range(3)]
        dot = sum(a * b for a, b in zip(incoming, outgoing))
        size = math.hypot(*incoming) * math.hypot(*outgoing)
        if size and math.degrees(math.acos(max(-1.0, min(1.0, dot / size)))) > CORNER_TURN_DEG:
            corners.append(point)
    return corners


def sails(depsgraph, offset):
    """Her sails' corners, in the ship's frame moved by `offset`, fore to aft: a staysail's three (its head the
    highest, its tack the foremost of the others, its clew the last) and a gaff sail's four (its luff the two nearest
    the bow, its tack and throat, the foot's after end its clew, the head's its peak). The game builds each canvas on
    them (client/src/ships/sails.ts)."""
    hidden = render_hidden(bpy.context.scene)
    found = []
    for instance in depsgraph.object_instances:
        item = instance.object
        if item.type != 'MESH' or not rendered(instance, hidden):
            continue
        mesh = item.to_mesh()
        mesh.transform(instance.matrix_world.copy())
        names = part_names(item)
        canvas = [polygon for polygon in mesh.polygons if names[min(polygon.material_index, len(names) - 1)] == 'sail']
        pieces = {}
        joined = {}

        def root(vertex):
            while joined.setdefault(vertex, vertex) != vertex:
                vertex = joined[vertex]
            return vertex

        for polygon in canvas:
            for index in polygon.vertices[1:]:
                joined[root(index)] = root(polygon.vertices[0])
        for polygon in canvas:
            pieces.setdefault(root(polygon.vertices[0]), []).append(
                [tuple(round(value, 4) for value in (corner.x + offset[0], -corner.y + offset[1], corner.z + offset[2]))
                 for corner in (mesh.vertices[index].co for index in polygon.vertices)]
            )
        for polygons in pieces.values():
            corners = outline_corners(polygons)
            point = lambda corner: [round(value, 4) for value in corner]  # noqa: E731
            if len(corners) == 3:
                head = max(corners, key=lambda corner: corner[2])
                tack, clew = sorted((corner for corner in corners if corner is not head), key=lambda corner: -corner[0])
                found.append({'kind': 'stay', 'tack': point(tack), 'clew': point(clew), 'head': point(head)})
            elif len(corners) == 4:
                luff = sorted(corners, key=lambda corner: -corner[0])[:2]
                leech = [corner for corner in corners if corner not in luff]
                tack, throat = sorted(luff, key=lambda corner: corner[2])
                clew, peak = sorted(leech, key=lambda corner: corner[2])
                found.append({'kind': 'gaff', 'tack': point(tack), 'clew': point(clew), 'throat': point(throat),
                              'peak': point(peak)})
            else:
                sys.exit(f'a sail of {len(corners)} corners is neither a staysail (3) nor a gaff sail (4)')
        item.to_mesh_clear()
    return sorted(found, key=lambda sail: -max(sail[corner][0] for corner in sail if corner != 'kind'))


def moved(faces, offset):
    """The triangles with their corners moved by `offset` (x, y, z)."""
    def shifted(position):
        return tuple(axis + shift for axis, shift in zip(position, offset))

    return [[(shifted(position), *rest) for position, *rest in corners] for corners in faces]


def mesh_bytes(name, faces, size):
    """The mesh file: shared corners merged, its header first."""
    index_of, vertices, indices = {}, bytearray(), []
    low, high = [float('inf')] * 3, [float('-inf')] * 3
    for corners in faces:
        for position, normal, uv, part in corners:
            packed = struct.pack('<3f4b2f4B', *position, *(snorm8(value) for value in normal), 0, *uv, part, 0, 0, 0)
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


def publish(name, blend_path, mesh, size, armed, struck, rigged, walked):
    with open(blend_path, 'rb') as file:
        source = put(file.read(), 'sources', 'blend', 'application/octet-stream')
    shape = put(mesh, 'ships', 'mesh', 'application/octet-stream')
    manifest = {'base': PUBLIC, 'ships': {}}
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as file:
            manifest = json.load(file)
    manifest['ships'][name] = {
        'mesh': shape, 'source': source, 'waterline': size, 'guns': armed, 'boxes': struck, 'sails': rigged,
        'deck': walked,
    }
    for key in (shape, source):
        published(manifest, key)
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    write_manifest(manifest)
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
    offset = (-middle_x, -middle_y, -args.waterline)
    armed = guns(bpy.data.objects, offset)
    struck = boxes(bpy.context.evaluated_depsgraph_get(), offset)
    rigged = sails(bpy.context.evaluated_depsgraph_get(), offset)
    header, mesh = mesh_bytes(args.name, moved(faces, offset), size)
    print(json.dumps(armed))
    print(json.dumps(struck))
    print(json.dumps(rigged))
    print(json.dumps(header), f'{len(mesh) / 2 ** 20:.2f} MiB')
    if args.dry_run:
        with open(f'{args.name}.mesh', 'wb') as file:
            file.write(mesh)
        return
    # Her deck from the mesh as published, so this and tools/ships/deck.py measure the same numbers.
    publish(args.name, args.blend, mesh, size, armed, struck, rigged,
            deck_of(mesh_triangles(mesh), helm_aft(bpy.data.objects, offset)))


def helm_aft(objects, offset):
    """How far aft of her middle her helm is kept: where an empty named `Helm` stands in her model (as
    tools/ships/build_ship.py places it), or the Sloop's spot for a model without one."""
    helm = objects.get('Helm')
    if helm is None:
        return HELM_AFT_M
    return round(-(helm.matrix_world.translation.x + offset[0]), 4)


if __name__ == '__main__':
    main()
