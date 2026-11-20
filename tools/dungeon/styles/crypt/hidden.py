"""Taking out the faces of a piece nobody sees: an underside lying on the floor, a back against the wall, a top
against the ceiling. A dungeon lays hundreds of kit pieces, so every hidden triangle is paid for many times over.
"""
import bmesh

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
