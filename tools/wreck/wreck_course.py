"""The ground a body walks on in the wreck, measured from its model: a grid of heights, then the blocks the game's
movement stands a body on (server/roomDoor.ts CourseBlock), as tools/ships/deck.py measures a ship's deck.

A face is ground where it looks up and is hull or deck, or belongs to an object marked `walk` (a fallen mast laid as a
way across); a spar or gun in the room a body takes over the ground stands as a wall; sails and lines are neither.
"""
import math

import bpy  # noqa: I001 - Blender's own modules load once bpy has
from mathutils import Vector
from mathutils.bvhtree import BVHTree

PARTS = ('hull', 'deck', 'spar', 'sail', 'iron')
FLOOR = {'hull', 'deck'}
SOLID = {'hull', 'deck', 'spar', 'iron'}
# A face this near level is ground: its normal's height, of 1.
UPWARD = 0.5
# The grid's cell, metres, and the block's square, in cells (as client/src/game/prologue/wreckDecks.ts takes them).
CELL_M = 0.1
SQUARE_CELLS = 3
# Ground lower than this over the sea is none: the sea's own, or a bilge under water.
LOWEST_M = 0.5
# The room a body takes over its feet: what is solid in it, from just above the ground to over a head, is a wall.
CLEAR_FROM_M = 0.25
CLEAR_TO_M = 1.8
# A wall stands this high over the ground under it: past what a jump reaches.
WALL_M = 1.9
# Heights are kept to this, metres, so gentle slopes make few blocks.
HEIGHT_STEP = 0.05


def faces_of(items):
    """Every triangle of the objects, as world points, with whether it is ground and whether it is solid."""
    points, triangles, ground, solid = [], [], [], []
    for item in items:
        mesh = item.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
        mesh.calc_loop_triangles()
        walk = bool(item.get('walk'))
        names = [slot.material.name.split('.')[0] if slot.material else 'spar' for slot in item.material_slots]
        start = len(points)
        points.extend(item.matrix_world @ vertex.co for vertex in mesh.vertices)
        for triangle in mesh.loop_triangles:
            part = names[min(triangle.material_index, len(names) - 1)] if names else 'spar'
            corners = [points[start + index] for index in triangle.vertices]
            normal = (corners[1] - corners[0]).cross(corners[2] - corners[0])
            up = normal.normalized().z if normal.length > 1e-12 else 0.0
            triangles.append(tuple(start + index for index in triangle.vertices))
            ground.append(up > UPWARD and (part in FLOOR or walk))
            solid.append(part in SOLID or walk)
        item.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh_clear()
    return points, triangles, ground, solid


def measure(items, sea_z, bounds):
    """The grid of heights over `bounds` (west, south, east, north in the model's frame, metres): for each cell, its
    ground's height over the sea, a wall's height where something solid stands in a body's room, or None. Rows run
    from the north, as the game's grid does (its y is south)."""
    points, triangles, ground, solid = faces_of(items)
    tree = BVHTree.FromPolygons(points, triangles, all_triangles=True)
    west, south, east, north = bounds
    columns = math.ceil((east - west) / CELL_M)
    rows = math.ceil((north - south) / CELL_M)
    top = max(point.z for point in points) + 1
    heights = []
    for row in range(rows):
        y = north - (row + 0.5) * CELL_M
        line = []
        for column in range(columns):
            x = west + (column + 0.5) * CELL_M
            line.append(cell_height(tree, ground, solid, Vector((x, y, top)), sea_z))
        heights.append(line)
    return {'west': west, 'north': north, 'columns': columns, 'rows': rows, 'heights': heights}


def cell_height(tree, ground, solid, start, sea_z):
    """A cell's ground over the sea, the highest a body stands on there with room over it; or a wall over ground
    whose room is taken; or None where there is no ground."""
    down = Vector((0, 0, -1))
    at = start.copy()
    blocked_ground = None
    while True:
        hit, _, index, _ = tree.ray_cast(at, down)
        if hit is None or hit.z < sea_z + LOWEST_M:
            break
        if ground[index]:
            if room_clear(tree, solid, hit):
                return round(hit.z - sea_z, 3)
            blocked_ground = blocked_ground if blocked_ground is not None else hit.z
        at = hit + down * 0.002
    return None if blocked_ground is None else round(blocked_ground - sea_z + WALL_M, 3)


def room_clear(tree, solid, floor):
    """Whether nothing solid stands in a body's room over `floor`."""
    start = floor + Vector((0, 0, CLEAR_FROM_M))
    span = CLEAR_TO_M - CLEAR_FROM_M
    at = start
    while True:
        hit, _, index, distance = tree.ray_cast(at, Vector((0, 0, 1)), span - (at.z - start.z))
        if hit is None:
            return True
        if solid[index]:
            return False
        at = hit + Vector((0, 0, 0.002))


def squares(grid):
    """The grid in squares of SQUARE_CELLS cells: the highest of each square's cells, kept to HEIGHT_STEP, where at
    least three are held; None elsewhere."""
    rows, columns = grid['rows'], grid['columns']
    found = []
    for down in range(0, rows, SQUARE_CELLS):
        line = []
        for across in range(0, columns, SQUARE_CELLS):
            held = [grid['heights'][row][column]
                    for row in range(down, min(rows, down + SQUARE_CELLS))
                    for column in range(across, min(columns, across + SQUARE_CELLS))
                    if grid['heights'][row][column] is not None]
            line.append(round(max(held) / HEIGHT_STEP) * HEIGHT_STEP if len(held) >= 3 else None)
        found.append(line)
    return found


def blocks(grid):
    """The squares as blocks in the game's frame (x east, y south, the sea at 0): each run of one height along a row
    one block, runs alike in the rows after it joined."""
    size = CELL_M * SQUARE_CELLS
    rows = squares(grid)
    runs = []
    for line in rows:
        found = []
        for across, height in enumerate(line):
            if height is None:
                continue
            if found and found[-1][1] == across - 1 and found[-1][2] == height:
                found[-1][1] = across
            else:
                found.append([across, across, height])
        runs.append(found)
    done = [[False] * len(line) for line in runs]
    made = []
    for along, line in enumerate(runs):
        for index, (first, last, height) in enumerate(line):
            if done[along][index]:
                continue
            end = along
            while end + 1 < len(runs):
                match = next((spot for spot, run in enumerate(runs[end + 1])
                              if run[0] == first and run[1] == last and run[2] == height and not done[end + 1][spot]),
                             None)
                if match is None:
                    break
                end += 1
                done[end][match] = True
            west = grid['west'] + first * size
            # The grid's rows run from its north edge, which is the game's least y (its y is south).
            made.append({'minX': round(west, 3), 'maxX': round(west + (last - first + 1) * size, 3),
                         'minY': round(-grid['north'] + along * size, 3),
                         'maxY': round(-grid['north'] + (end + 1) * size, 3), 'top': round(height, 3)})
    return made
