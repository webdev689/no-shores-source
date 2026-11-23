"""The two ships of the wreck, built as the ships tool builds them, then broken, cut and laid where the ram left them.

Blender's frame here is the wreck's: x east, y north, z up, metres, the sea at z 1.2 as the ships are built (their
waterline). The export turns it into the game's (x east, y south, the sea at 0).
"""
import math
import os
import sys

import bpy  # noqa: I001 - Blender's own modules load once bpy has
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'ships'))
from build_ship import HULLS  # noqa: E402
from ship_details import build_details  # noqa: E402
from ship_fittings import build_fittings, place_guns  # noqa: E402
from ship_hull import Hull, build_hull  # noqa: E402
from ship_rig import build_rig  # noqa: E402

# The sea's height in the ships' frame: their waterline.
SEA_Z = 1.2
# The ships as the wreck builds them: the Frigate's quarterdeck, Thule's arena, runs forward to just abaft her mainmast.
WRECK_HULLS = {**HULLS, 'frigate': {**HULLS['frigate'], 'quarterdeck_m': (-2.0, 0.8)}}


def build_ship(name, collection, sloop):
    """Builds the ship `name` (a hull of the ships tool, as the wreck has her) into `collection` in her own frame;
    gives her Hull."""
    hull = Hull(WRECK_HULLS[name])
    build_hull(hull, collection)
    build_rig(hull, collection)
    build_fittings(hull, collection)
    build_details(hull, collection)
    place_guns(hull, collection, sloop)
    # Her guns share one gun's mesh: each takes its own, so moving one moves only it.
    for item in meshes(collection):
        if item.data.users > 1:
            item.data = item.data.copy()
    return hull


def meshes(collection):
    """The mesh objects of a collection."""
    return [item for item in collection.objects if item.type == 'MESH']


def bake_placement(item):
    """Applies an object's placement to its mesh, so its points are the wreck's own and its placement is none."""
    # Its own location, turn and size: the world matrix is only worked out at the scene's next update. None of the
    # ships' objects has a parent.
    placed = item.matrix_basis.copy()
    if placed == Matrix.Identity(4):
        return
    item.data.transform(placed)
    item.matrix_basis = Matrix.Identity(4)


def move(collection, matrix):
    """Moves every mesh of `collection` by `matrix`, into its points."""
    for item in meshes(collection):
        bake_placement(item)
        item.data.transform(matrix)
        item.data.update()


def placing(at, heading_deg=0.0, pitch_deg=0.0, roll_deg=0.0, pivot=(0.0, 0.0, 0.0)):
    """A placement about `pivot`: roll about x, pitch about y, then heading about z (counter-clockwise from east),
    the pivot then moved to `at`."""
    turn = (Matrix.Rotation(math.radians(heading_deg), 4, 'Z') @ Matrix.Rotation(math.radians(pitch_deg), 4, 'Y')
            @ Matrix.Rotation(math.radians(roll_deg), 4, 'X'))
    return Matrix.Translation(Vector(at)) @ turn @ Matrix.Translation(-Vector(pivot))


def cut(item, point, normal, keep_front):
    """Cuts an object's mesh by a plane through `point` facing `normal`, keeping the side the normal points to when
    `keep_front`, the other side otherwise; gives False where nothing of it is left."""
    bake_placement(item)
    mesh = bmesh.new()
    mesh.from_mesh(item.data)
    bmesh.ops.bisect_plane(mesh, geom=mesh.verts[:] + mesh.edges[:] + mesh.faces[:], plane_co=Vector(point),
                           plane_no=Vector(normal), clear_inner=keep_front, clear_outer=not keep_front)
    left = len(mesh.faces) > 0
    mesh.to_mesh(item.data)
    mesh.free()
    item.data.update()
    return left


def split(collection, point, normal, front_name):
    """Splits every mesh of `collection` by a plane: what lies on the normal's side goes to a new collection named
    `front_name`, the rest stays. Gives the new collection."""
    front = bpy.data.collections.new(front_name)
    bpy.context.scene.collection.children.link(front)
    for item in meshes(collection):
        twin = item.copy()
        twin.data = item.data.copy()
        twin.name = f'{front_name}.{item.name}'
        front.objects.link(twin)
        if not cut(twin, point, normal, keep_front=True):
            bpy.data.objects.remove(twin)
        if not cut(item, point, normal, keep_front=False):
            bpy.data.objects.remove(item)
    return front


def remove_where(collection, inside):
    """Removes every face of the collection's meshes whose middle `inside(point)` says is in; empties go."""
    for item in meshes(collection):
        bake_placement(item)
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        doomed = [face for face in mesh.faces if inside(face.calc_center_median())]
        bmesh.ops.delete(mesh, geom=doomed, context='FACES')
        loose = [vertex for vertex in mesh.verts if not vertex.link_faces]
        bmesh.ops.delete(mesh, geom=loose, context='VERTS')
        empty = len(mesh.faces) == 0
        mesh.to_mesh(item.data)
        mesh.free()
        item.data.update()
        if empty:
            bpy.data.objects.remove(item)


def remove_pieces_where(collection, inside):
    """Removes every connected piece of the collection's meshes whose middle `inside(point)` says is in: whole spars,
    lines and fittings at a time, never half of one."""
    for item in meshes(collection):
        bake_placement(item)
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        doomed = []
        for piece in connected(mesh.faces):
            points = [vertex.co for face in piece for vertex in face.verts]
            middle = sum(points, Vector()) / len(points)
            if inside(middle):
                doomed.extend(piece)
        bmesh.ops.delete(mesh, geom=doomed, context='FACES')
        loose = [vertex for vertex in mesh.verts if not vertex.link_faces]
        bmesh.ops.delete(mesh, geom=loose, context='VERTS')
        empty = len(mesh.faces) == 0
        mesh.to_mesh(item.data)
        mesh.free()
        item.data.update()
        if empty:
            bpy.data.objects.remove(item)


class Ground:
    """The wreck's surfaces that look up, for laying things on them: the height of the highest under a point."""

    def __init__(self, collections):
        from mathutils.bvhtree import BVHTree
        points, triangles = [], []
        for group in collections:
            for item in meshes(group):
                bake_placement(item)
                mesh = item.data
                mesh.calc_loop_triangles()
                start = len(points)
                points.extend(vertex.co.copy() for vertex in mesh.vertices)
                for triangle in mesh.loop_triangles:
                    if triangle.normal.z > 0.5:
                        triangles.append(tuple(start + index for index in triangle.vertices))
        self.tree = BVHTree.FromPolygons(points, triangles, all_triangles=True)

    def z(self, x, y, below=8.0):
        """The height of the highest upward face under (x, y) and below `below` (by default under every yard and
        top, over every deck), or None."""
        hit = self.tree.ray_cast(Vector((x, y, below)), Vector((0, 0, -1)))[0]
        return None if hit is None else hit.z


def connected(faces):
    """The faces joined through shared points, a list a piece."""
    left, found = set(faces), []
    while left:
        stack, piece = [left.pop()], []
        while stack:
            face = stack.pop()
            piece.append(face)
            for vertex in face.verts:
                for other in vertex.link_faces:
                    if other in left:
                        left.remove(other)
                        stack.append(other)
        found.append(piece)
    return found
