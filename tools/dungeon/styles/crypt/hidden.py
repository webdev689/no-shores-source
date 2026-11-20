"""Finishing a piece: taking out the faces nobody sees (an underside lying on the floor, a back against the wall, a
top against the ceiling), since a dungeon lays hundreds of kit pieces and pays for each hidden triangle many times
over; and moving the trim's picture off the middle of a centred piece.
"""
import bmesh

import catalog

# How near a face must lie to its plane, metres, and how squarely it must face into it, to be hidden by it.
NEAR_M = 0.004
SQUARE = 0.985


def cull(item, floor=None, wall=None, ceiling=None):
    """Deletes from an object every face lying at or under z `floor` facing down, at or behind y `wall` facing -y
    (into the wall), or at or over z `ceiling` facing up; gives the object."""
    bm = bmesh.new()
    bm.from_mesh(item.data)
    bm.normal_update()
    doomed = []
    for face in bm.faces:
        normal, points = face.normal, [vertex.co for vertex in face.verts]
        # Blender holds the dungeon's y negated: a face looking into the wall (-y) looks +y there.
        if floor is not None and normal.z < -SQUARE and max(point.z for point in points) <= floor + NEAR_M:
            doomed.append(face)
        elif wall is not None and normal.y > SQUARE and min(point.y for point in points) >= -wall - NEAR_M:
            doomed.append(face)
        elif ceiling is not None and normal.z > SQUARE and min(point.z for point in points) >= ceiling - NEAR_M:
            doomed.append(face)
    bmesh.ops.delete(bm, geom=doomed, context='FACES')
    bm.to_mesh(item.data)
    bm.free()
    item.data.update()
    return item


def off_border(item, part='trim'):
    """Moves the UVs of an object's faces in `part` half a picture (1.6 m) each way. The trim's picture is darker at
    its tile's edges, and planar UVs put an edge at x 0 and y 0, down the middle of a centred piece (or at 3.2,
    the middle of a landmark's footprint); gives the object."""
    names = [slot.material.name if slot.material else None for slot in item.material_slots]
    if part not in names:
        return item
    index, half = names.index(part), catalog.CELL_M / 2
    layer = item.data.uv_layers.active
    for polygon in item.data.polygons:
        if polygon.material_index == index:
            for loop_index in polygon.loop_indices:
                u, v = layer.data[loop_index].uv
                layer.data[loop_index].uv = (u + half, v + half)
    item.data.update()
    return item
