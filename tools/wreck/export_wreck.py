"""Exports the lit wreck for the game, and publishes its mesh, its light and its model to R2.

    <python with bpy> tools/wreck/export_wreck.py <lit.blend> <light.png> [--dry-run]

Writes content/prologue/wreck.json: the mesh's and the light's keys on R2, the ground a body walks on as blocks, each
heap's block, the fires, and the level (where the player wakes, the way to Thule, the zones and their waves, the
arena), all in the game's frame (x east, y south, z up from the sea, metres). It refuses a level its own ground does
not hold (wreck_level.check). With --dry-run it writes `wreck.mesh` into the working folder and uploads nothing; the
keys are those the files would be published under.
"""
import argparse
import hashlib
import json
import math
import os
import struct
import sys

import bpy  # noqa: I001 - Blender's own modules load once bpy has

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)
sys.path.insert(0, os.path.join(TOOLS, 'ships'))
from light_wreck import FIRE_FULL, SKY_FULL  # noqa: E402
from wreck_course import CELL_M, SQUARE_CELLS, blocks, measure, squares  # noqa: E402
from wreck_dress import GATES, gate_boxes  # noqa: E402
from wreck_fire import fires, standing_ground  # noqa: E402
from wreck_frames import wreck_frames  # noqa: E402
from wreck_level import ARENA_ZONE, FLIGHT_BACK, MASTS, PATH, THULE, WAKE, ZONES, check, game, game_area  # noqa: E402
from wreck_reach import CLIMB_M, Reach  # noqa: E402
from wreck_ships import SEA_Z  # noqa: E402

CONTENT = os.path.join(os.path.dirname(TOOLS), 'content', 'prologue', 'wreck.json')
PARTS = ('hull', 'deck', 'spar', 'sail', 'iron')
# The ground is measured over this box of the wreck's frame (west, south, east, north), round every piece.
BOUNDS = (-26.0, -46.0, 26.0, 12.0)
HALF_SQUARE_M = CELL_M * SQUARE_CELLS / 2
# A vertex: position (3 × float32), normal (4 × snorm8), the picture's UV (2 × float32, metres), its part and piece
# (4 × uint8), the light's UV (2 × unorm16).
VERTEX = '<3f4b2f4B2H'


def snorm8(value):
    return max(-127, min(127, round(value * 127)))


def unorm16(value):
    return max(0, min(65535, round(value * 65535)))


def corners(wreck):
    """Each triangle of the wreck by its piece: three corners (position, normal, uv, part, light uv) each, in the
    game's frame, mirrored from Blender's as the ships' are, so each keeps its corners' order."""
    mesh = wreck.data
    mesh.calc_loop_triangles()
    names = [slot.material.name.split('.')[0] for slot in wreck.material_slots]
    pieces = mesh.attributes['piece'].data
    pictures = next(layer for layer in mesh.uv_layers if layer.name != 'light')
    light = mesh.uv_layers['light']
    by_piece = {}
    for triangle in mesh.loop_triangles:
        part = PARTS.index(names[min(triangle.material_index, len(names) - 1)])
        found = []
        for loop in triangle.loops:
            point = mesh.vertices[mesh.loops[loop].vertex_index].co
            normal = mesh.corner_normals[loop].vector
            found.append(((point.x, -point.y, point.z - SEA_Z), (normal.x, -normal.y, normal.z),
                          tuple(pictures.data[loop].uv), part, tuple(light.data[loop].uv)))
        by_piece.setdefault(pieces[triangle.polygon_index].value, []).append(found)
    return by_piece


def mesh_bytes(by_piece):
    """The mesh file: its header's length, the header (its pieces' runs of corners among them), the vertices, then
    the corners, the wreck's own first and each heap's after it."""
    index_of, vertices, indices, runs = {}, bytearray(), [], []
    for piece in sorted(by_piece):
        first = len(indices)
        for triangle in by_piece[piece]:
            for position, normal, uv, part, light in triangle:
                packed = struct.pack(VERTEX, *position, *(snorm8(value) for value in normal), 0, *uv, part, piece, 0,
                                     0, unorm16(light[0]), unorm16(light[1]))
                if packed not in index_of:
                    index_of[packed] = len(index_of)
                    vertices += packed
                indices.append(index_of[packed])
        runs.append({'piece': piece, 'first': first, 'count': len(indices) - first})
    header = {'name': 'wreck', 'vertices': len(index_of), 'indices': len(indices), 'stride': struct.calcsize(VERTEX),
              'pieces': runs, 'light': {'fire': FIRE_FULL, 'sky': SKY_FULL}}
    text = json.dumps(header, separators=(',', ':')).encode()
    text += b' ' * (-(4 + len(text)) % 4)
    return header, struct.pack('<I', len(text)) + text + bytes(vertices) + struct.pack(f'<{len(indices)}I', *indices)


def heaps(by_piece, frames):
    """Each heap's block in the game's frame, by the zone it closes: the ground it is piled over, as high as it is
    piled there."""
    found = []
    for zone, (west, south, east, north) in enumerate(gate_boxes(frames)):
        points = [corner[0] for triangle in by_piece.get(zone + 1, []) for corner in triangle]
        if not points:
            sys.exit(f'the heap closing zone {zone} has no faces')
        found.append([round(west, 3), round(-north, 3), round(east, 3), round(-south, 3),
                      round(max(point[2] for point in points), 3)])
    return found


def centred(point):
    """A figure's place in the game's frame at the middle of its square of ground, never on the edge between two
    blocks of the ground, where the room and the page could stand it at either one's height."""
    size = CELL_M * SQUARE_CELLS
    west, north_y = BOUNDS[0], -BOUNDS[3]
    x, y = point
    return [round(west + (math.floor((x - west) / size) + 0.5) * size, 3),
            round(north_y + (math.floor((y - north_y) / size) + 0.5) * size, 3)]


def level(gates, burning, frames):
    """The level as the game reads it: content/prologue/wreck.json without its keys."""
    zones = []
    for index, zone in enumerate(ZONES):
        zones.append({
            'name': zone['name'],
            'area': list(game_area(zone['area'])),
            'checkpoint': list(game(zone['checkpoint'])),
            'gate': gates[index] if index < len(gates) else None,
            'wave': [{'type': kind, 'rank': rank, 'at': centred(game(at)), 'facing': facing}
                     for kind, rank, at, facing in zone['wave']],
        })
    masts = [frames.on(ship, along, 0.0) for ship, along in MASTS]
    return {
        'wake': [*game(WAKE[0]), WAKE[1]],
        'path': [list(game(point)) for point in PATH],
        'zones': zones,
        'arena': {'zone': ARENA_ZONE, 'thule': centred(game(THULE))},
        'masts': [list(game((mast.x, mast.y))) for mast in masts],
        'flightBack': [[*game((x, y)), height] for x, y, height in FLIGHT_BACK],
        'fires': [{'at': [round(fire['at'].x, 3), round(-fire['at'].y, 3), round(fire['at'].z - SEA_Z, 3)],
                   'size': fire['size'],
                   **({'along': [round(fire['along'].x, 3), round(-fire['along'].y, 3), round(fire['along'].z, 3)]}
                      if fire['along'] is not None else {})} for fire in burning],
    }


def key_of(data, folder, extension):
    return f'{folder}/{hashlib.sha256(data).hexdigest()}.{extension}'


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('lit')
    parser.add_argument('light')
    parser.add_argument('--dry-run', action='store_true')
    given = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(given.lit))
    wreck = bpy.data.objects['Wreck']
    by_piece = corners(wreck)
    header, mesh = mesh_bytes(by_piece)
    frames = wreck_frames()
    gates = heaps(by_piece, frames)
    grid = measure([wreck], SEA_Z, BOUNDS, piece=0)
    # The level is checked on the ground as the game's blocks lay it, and laid half a square across and along: a gap
    # either finds is one a body might take.
    shifted = measure([wreck], SEA_Z, tuple(edge + HALF_SQUARE_M for edge in BOUNDS), piece=0)
    for ground in (grid, shifted):
        faults = check(Reach(ground, squares(ground)), [gate[:4] for gate in gates], CLIMB_M)
        if faults:
            sys.exit('the wreck does not hold its level:\n' + '\n'.join(faults))
    with open(os.path.abspath(given.light), 'rb') as file:
        light = file.read()
    laid = {'mesh': key_of(mesh, 'wreck', 'mesh'), 'light': key_of(light, 'wreck', 'png'),
            'course': blocks(grid), **level(gates, fires(frames, standing_ground()), frames)}
    if given.dry_run:
        with open('wreck.mesh', 'wb') as file:
            file.write(mesh)
    else:
        from r2 import put
        with open(os.path.abspath(given.lit), 'rb') as file:
            laid['source'] = put(file.read(), 'sources', 'blend', 'application/octet-stream')
        laid['mesh'] = put(mesh, 'wreck', 'mesh', 'application/octet-stream')
        laid['light'] = put(light, 'wreck', 'png', 'image/png')
    with open(CONTENT, 'w') as file:
        json.dump(laid, file, separators=(',', ':'))
        file.write('\n')
    print(json.dumps({key: laid[key] for key in ('mesh', 'light', *(('source',) if 'source' in laid else ()))}),
          f'{len(mesh) / 2 ** 20:.2f} MiB mesh, {len(light) / 2 ** 20:.2f} MiB light,',
          f"{header['vertices']} vertices, {header['indices'] // 3} triangles, {len(laid['course'])} blocks")


if __name__ == '__main__':
    main()
