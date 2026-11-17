"""The deck a body walks on aboard a ship, measured from her mesh: a grid of heights the sea room and the browser both
stand a walker on, and the spot behind her wheel where her helm is kept.

    python3 -I tools/ships/deck.py <name>

reads the mesh the manifest names for <name> from R2 and writes her deck into content/ships/ships.json, as
tools/ships/export_ship.py does when it publishes a ship. The Sailing note says how the grid is laid out and used.
"""
import json
import math
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
MANIFEST = os.path.join(os.path.dirname(TOOLS), 'content', 'ships', 'ships.json')
# The parts as her mesh numbers them (export_ship.py PARTS): a body stands on her hull's and deck's upward faces, and is
# kept off where her spars or iron stand in the room a body takes.
FLOOR_PARTS = (0, 1)
SOLID_PARTS = (2, 4)
# A face this near level is one a body may stand on: its normal's height, of 1.
UPWARD = 0.5
# The grid's cell, metres.
CELL_M = 0.1
# A floor lower than this over her waterline is no deck (her bilge seen through an opening).
LOWEST_DECK_M = 0.6
# The room a body takes over its feet: a spar or gun in it, from just above the planks to over a head, keeps it off.
CLEAR_FROM_M = 0.25
CLEAR_TO_M = 1.8
# The most a cell stands over a neighbour a body walks to from it, centimetres: a slope a body walks up (the movement
# crate walks 1.19 m a metre), so a dip in her planks or a raised part of her deck has a way in and out.
RISE_CM = 8
# Behind her wheel, where the helm's view stands (client/src/game/seaLaw.ts helmEye) and a player leaving the helm
# steps onto her deck: metres aft of her middle.
HELM_AFT_M = 2.7


def mesh_triangles(data):
    """Each triangle of a mesh file (export_ship.py mesh_bytes): its three corners in her frame, its part, and how
    level it faces."""
    length = struct.unpack_from('<I', data, 0)[0]
    header = json.loads(data[4:4 + length])
    start = 4 + length
    count, corners = header['vertices'], header['indices']
    vertices = [struct.unpack_from('<3f4b2f4B', data, start + index * 28) for index in range(count)]
    order = struct.unpack_from(f'<{corners}I', data, start + count * 28)
    for first in range(0, corners, 3):
        three = [vertices[order[first + offset]] for offset in range(3)]
        rise = sum(vertex[5] for vertex in three) / 3 / 127
        yield [vertex[:3] for vertex in three], three[0][9], rise


def height_in(x, y, corners):
    """The height of a triangle over (x, y), or None where it does not cover the point, seen from above."""
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = corners
    across = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(across) < 1e-12:
        return None
    first = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / across
    second = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / across
    third = 1 - first - second
    if min(first, second, third) < -1e-6:
        return None
    return first * az + second * bz + third * cz


def deck_of(triangles):
    """Her deck from her triangles (corners in her frame, part, how level), in the walk's frame."""
    triangles = list(triangles)
    # The walk's frame from hers: x her starboard (her y), y her stern (less her x).
    walk = [([(y, -x, z) for x, y, z in corners], part, rise) for corners, part, rise in triangles]
    points = [corner for corners, _, _ in walk for corner in corners]
    west = math.floor(min(point[0] for point in points) / CELL_M) * CELL_M
    north = math.floor(min(point[1] for point in points) / CELL_M) * CELL_M
    columns = math.ceil((max(point[0] for point in points) - west) / CELL_M)
    rows = math.ceil((max(point[1] for point in points) - north) / CELL_M)
    floor = [[None] * columns for _ in range(rows)]

    def cells(corners):
        xs, ys = [corner[0] for corner in corners], [corner[1] for corner in corners]
        for row in range(max(0, int((min(ys) - north) / CELL_M)), min(rows, int((max(ys) - north) / CELL_M) + 1)):
            for column in range(max(0, int((min(xs) - west) / CELL_M)), min(columns, int((max(xs) - west) / CELL_M) + 1)):
                yield row, column

    for corners, part, rise in walk:
        if part not in FLOOR_PARTS or rise <= UPWARD:
            continue
        for row, column in cells(corners):
            centre = (west + (column + 0.5) * CELL_M, north + (row + 0.5) * CELL_M)
            height = height_in(*centre, corners)
            if height is not None and (floor[row][column] is None or height > floor[row][column]):
                floor[row][column] = height
    for corners, part, _ in walk:
        if part not in SOLID_PARTS:
            continue
        low, high = min(corner[2] for corner in corners), max(corner[2] for corner in corners)
        for row, column in cells(corners):
            under = floor[row][column]
            if under is not None and high > under + CLEAR_FROM_M and low < under + CLEAR_TO_M:
                floor[row][column] = None
    standing = [[None if height is None or height < LOWEST_DECK_M else round(height * 100) for height in line] for line in floor]
    walkable(standing)
    on = [(row, column) for row, line in enumerate(standing) for column, height in enumerate(line) if height is not None]
    if not on:
        sys.exit('her mesh has no deck to stand on')
    # Round the deck, with a cell to spare on each side, so every edge of it meets a wall in the grid.
    top, bottom = max(0, min(row for row, _ in on) - 1), min(rows, max(row for row, _ in on) + 2)
    left, right = max(0, min(column for _, column in on) - 1), min(columns, max(column for _, column in on) + 2)
    return {
        'cell_m': CELL_M,
        'west_m': round(west + left * CELL_M, 4),
        'north_m': round(north + top * CELL_M, 4),
        'columns': right - left,
        'rows': bottom - top,
        'heights_cm': [line[left:right] for line in standing[top:bottom]],
        'helm': [0.0, HELM_AFT_M],
    }


def walkable(heights):
    """Lets each cell down to within `RISE_CM` of every neighbour, in place, until none stands higher: nothing is
    raised, so a body never floats over her planks, and every rise between cells is one it walks up."""
    changed = True
    while changed:
        changed = False
        for row, line in enumerate(heights):
            for column, height in enumerate(line):
                if height is None:
                    continue
                around = [
                    heights[row + down][column + across]
                    for down, across in ((-1, 0), (1, 0), (0, -1), (0, 1))
                    if 0 <= row + down < len(heights) and 0 <= column + across < len(line)
                ]
                lowest = min((near for near in around if near is not None), default=height)
                if height > lowest + RISE_CM:
                    line[column] = lowest + RISE_CM
                    changed = True


def write_manifest(manifest):
    """Writes the manifest as JSON, each row of a deck's heights on a line of its own."""
    text = json.dumps(manifest, indent=2)
    # A list of whole numbers and nulls alone is a deck's row: one line, not one a cell.
    text = re.sub(r'\[\s*((?:-?\d+|null)(?:,\s*(?:-?\d+|null))+)\s*\]', lambda found: '[' + re.sub(r',\s*', ', ', found[1]) + ']', text)
    with open(MANIFEST, 'w') as file:
        file.write(text + '\n')


def main():
    sys.path.insert(0, TOOLS)
    from r2 import published  # noqa: E402

    if len(sys.argv) != 2:
        sys.exit(__doc__.split('\n\n')[1])
    name = sys.argv[1]
    with open(MANIFEST) as file:
        manifest = json.load(file)
    ship = manifest['ships'].get(name)
    if ship is None:
        sys.exit(f'the manifest names no ship {name!r}')
    ship['deck'] = deck_of(mesh_triangles(published(manifest, ship['mesh'])))
    write_manifest(manifest)
    walkable = sum(height is not None for line in ship['deck']['heights_cm'] for height in line)
    print(f"{name}: a deck of {ship['deck']['columns']} by {ship['deck']['rows']} cells, {walkable} to stand on")


if __name__ == '__main__':
    main()
