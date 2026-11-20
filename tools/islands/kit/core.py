"""The kit's core: making an object from points in the island module's frame, its part, joining, copying and moving.

Every number a helper takes is the module's: x east, y south, z up, metres, the ground at z 0. Blender holds the same
points with y negated, (x, -y, z); the exporter negates it back. Moves are baked into the mesh, so every object's own
placement stays the identity, and a helper's result can be moved, copied or joined freely.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import catalog
from details import seeded

PARTS = catalog.PARTS
# Turning the island module's frame into Blender's and back: y negated.
_FLIP = Matrix.Diagonal((1, -1, 1, 1))
_AXES = {'x': 'X', 'y': 'Y', 'z': 'Z'}
# Every helper's UVs go in a layer of this name, so joined objects keep one layer.
UV_LAYER = 'UVMap'
_target = {'collection': None}


def start(name):
    """Makes `name` the collection new objects go into (the build makes one a kit), and gives it."""
    collection = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if collection.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(collection)
    _target['collection'] = collection
    return collection


def _collection():
    return _target['collection'] or bpy.context.scene.collection


def set_part(item, part):
    """Puts every face of an object in `part`, the material of that name (one of PARTS), and gives the object."""
    if part not in PARTS:
        raise ValueError(f'{part!r} is no part: one of {", ".join(PARTS)}')
    material = bpy.data.materials.get(part) or bpy.data.materials.new(part)
    item.data.materials.clear()
    item.data.materials.append(material)
    for polygon in item.data.polygons:
        polygon.material_index = 0
    return item


def shade(item, smooth_degrees=None):
    """Flat faces, or with `smooth_degrees` smooth ones, sharp where faces meet at more than that angle."""
    if smooth_degrees:
        item.data.shade_smooth()
        item.data.set_sharp_from_angle(angle=math.radians(smooth_degrees))
    else:
        item.data.shade_flat()
    return item


def mesh(faces, part='stone', name='piece', smooth=35.0, closed=True):
    """A new object from faces (shapes.py's: each a list of (point, uv) corners, the island module's frame, metres), its
    points shared where they meet. A closed shape has its normals checked to face out; an open one (a sheet) faces as
    its faces wind. `smooth` is shade's angle: smooth, sharp where faces meet at more than it (None: flat)."""
    index_of, points, polygons, corners = {}, [], [], []
    for face in faces:
        ring, maps = [], []
        for point, uv in face:
            key = tuple(round(value, 6) for value in point)
            if key not in index_of:
                index_of[key] = len(points)
                points.append(point)
            if not ring or ring[-1] != index_of[key]:
                ring.append(index_of[key])
                maps.append(uv)
        if len(ring) > 1 and ring[0] == ring[-1]:
            ring.pop()
            maps.pop()
        if len(set(ring)) >= 3:
            polygons.append(ring)
            corners.append(maps)
    data = bpy.data.meshes.new(name)
    # The frame's mirror turns the faces inside out; reversing each turns them back.
    data.from_pydata([(x, -y, z) for x, y, z in points], [], [ring[::-1] for ring in polygons])
    layer = data.uv_layers.new(name=UV_LAYER)
    for polygon, maps in zip(data.polygons, corners):
        for loop_index, uv in zip(polygon.loop_indices, maps[::-1]):
            layer.data[loop_index].uv = uv
    data.validate()
    if closed:
        bm = bmesh.new()
        bm.from_mesh(data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        bm.to_mesh(data)
        bm.free()
    item = bpy.data.objects.new(name, data)
    _collection().objects.link(item)
    set_part(item, part)
    return shade(item, smooth)


def _apply(item, matrix):
    """Moves an object's mesh by a matrix in the module's numbers."""
    blender = _FLIP @ matrix @ _FLIP
    item.data.transform(blender)
    if blender.determinant() < 0:
        item.data.flip_normals()
    item.data.update()
    return item


def _pivot(about):
    point = Vector((*about, 0.0)[:3]) if len(about) == 2 else Vector(about)
    return Matrix.Translation(point), Matrix.Translation(-point)


def translate(item, x=0.0, y=0.0, z=0.0):
    """Moves an object by (x, y, z) metres, and gives it."""
    return _apply(item, Matrix.Translation((x, y, z)))


def rotate(item, degrees, axis='z', about=(0.0, 0.0, 0.0)):
    """Turns an object about an axis ('x', 'y' or 'z') through `about`, by the right-hand rule in the module's numbers:
    about z, east turns toward south, as a placement's quarter turn does; about x, south toward up; about y, up toward
    east."""
    there, back = _pivot(about)
    return _apply(item, there @ Matrix.Rotation(math.radians(degrees), 4, _AXES[axis]) @ back)


def rotate_z(item, degrees, about=(0.0, 0.0)):
    """Turns an object about the upright through `about` (x, y): east toward south by `degrees`."""
    return rotate(item, degrees, 'z', about)


def scale(item, x, y=None, z=None, about=(0.0, 0.0, 0.0)):
    """Scales an object about a point: by `x` on every axis, or by (x, y, z). A negative factor mirrors it. Its UVs
    stretch with it, out of metres: size a shape as it is made where you can."""
    there, back = _pivot(about)
    factors = (x, x if y is None else y, x if z is None else z, 1.0)
    return _apply(item, there @ Matrix.Diagonal(factors) @ back)


def copy(item):
    """A copy of an object, its own mesh, in the current collection."""
    twin = item.copy()
    twin.data = item.data.copy()
    _collection().objects.link(twin)
    return twin


def mirror(item, axis='x', at=0.0):
    """A mirrored copy of an object, across the plane where `axis` equals `at`: join it with the first for a
    symmetric piece."""
    factors = {'x': (-1, 1, 1), 'y': (1, -1, 1), 'z': (1, 1, -1)}[axis]
    about = tuple(at if name == axis else 0.0 for name in 'xyz')
    return scale(copy(item), *factors, about=about)


def array(item, count, step=(0.0, 0.0, 0.0), turn=0.0, about=(0.0, 0.0)):
    """The object and count - 1 copies, the n-th turned by n × `turn` degrees about `about` (x, y), then moved by n ×
    `step`: a row, or a ring round a point. Gives the list; join it for one piece."""
    found = [item]
    for number in range(1, count):
        twin = rotate_z(copy(item), turn * number, about) if turn else copy(item)
        found.append(translate(twin, *(value * number for value in step)))
    return found


def _flatten(items):
    for entry in items:
        if isinstance(entry, (list, tuple)):
            yield from _flatten(entry)
        elif entry is not None:
            yield entry


def join(items, name='piece'):
    """One object of many (lists may nest), their modifiers applied and their parts kept. The objects joined are
    removed: use the one given back."""
    items = list(_flatten(items))
    if not items:
        raise ValueError('nothing to join')
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bm = bmesh.new()
    parts = []
    for item in items:
        evaluated = item.evaluated_get(depsgraph)
        data = evaluated.to_mesh()
        data.transform(item.matrix_world)
        if item.matrix_world.determinant() < 0:
            data.flip_normals()
        names = [slot.material.name if slot.material else None for slot in item.material_slots]
        if not names or any(part not in PARTS for part in names):
            raise ValueError(f'{item.name} has faces in {names}, not only parts: give it one with set_part')
        first = len(bm.faces)
        bm.from_mesh(data)
        bm.faces.ensure_lookup_table()
        for face in bm.faces[first:]:
            part = names[min(face.material_index, len(names) - 1)]
            if part not in parts:
                parts.append(part)
            face.material_index = parts.index(part)
        evaluated.to_mesh_clear()
    data = bpy.data.meshes.new(name)
    bm.to_mesh(data)
    bm.free()
    for part in parts:
        data.materials.append(bpy.data.materials[part])
    joined = bpy.data.objects.new(name, data)
    _collection().objects.link(joined)
    for item in items:
        old = item.data
        bpy.data.objects.remove(item)
        if old.users == 0:
            bpy.data.meshes.remove(old)
    return joined


def triangles(item):
    """How many triangles an object draws, modifiers and all: envelope.py holds each role's budget."""
    evaluated = item.evaluated_get(bpy.context.evaluated_depsgraph_get())
    data = evaluated.to_mesh()
    data.calc_loop_triangles()
    count = len(data.loop_triangles)
    evaluated.to_mesh_clear()
    return count


# How near a plane a point lies to be on it, metres.
PLANE_M = 1e-5


def _uv_map(face, layer):
    """A face's UVs as a map of position: its first corner's UV plus each UV's gradient in the face's plane."""
    corners = [(loop.vert.co.copy(), loop[layer].uv.copy()) for loop in face.loops]
    origin, at_origin = corners[0]
    best = max(((first, second) for first in corners[1:] for second in corners[1:] if first is not second),
               key=lambda pair: (pair[0][0] - origin).cross(pair[1][0] - origin).length)
    (first, uv_first), (second, uv_second) = best
    one, two = first - origin, second - origin
    aa, ab, bb = one.dot(one), one.dot(two), two.dot(two)
    det = aa * bb - ab * ab
    if abs(det) < 1e-18:
        return lambda point: at_origin.copy()
    gradients = []
    for axis in range(2):
        du, dv = uv_first[axis] - at_origin[axis], uv_second[axis] - at_origin[axis]
        gradients.append(one * ((du * bb - dv * ab) / det) + two * ((dv * aa - du * ab) / det))
    return lambda point: Vector((at_origin[0] + gradients[0].dot(point - origin),
                                 at_origin[1] + gradients[1].dot(point - origin)))


def bevel(item, width=0.02, segments=1, degrees=30.0):
    """Chamfers (one segment) or rounds an object's edges where its faces meet at more than `degrees`, in place.
    Blender's bevel works its corners' UVs out in an order that changes from run to run, so their last bits do:
    each face's UVs are taken again from one old face's map, its own (found by its plane) or, for a chamfer, the
    old face it touches that faces most its way, and the build stays the same bytes."""
    bm = bmesh.new()
    bm.from_mesh(item.data)
    layer = bm.loops.layers.uv.active
    edges = [edge for edge in bm.edges if edge.is_manifold and math.degrees(edge.calc_face_angle(0.0)) > degrees]
    planes = [(face.normal.copy(), face.normal.dot(face.verts[0].co), _uv_map(face, layer))
              for face in bm.faces] if layer is not None else []
    if edges:
        bmesh.ops.bevel(bm, geom=edges, offset=width, offset_type='OFFSET', segments=segments, profile=0.5,
                        affect='EDGES', clamp_overlap=True)
    for face in bm.faces if edges else ():
        own = next((plane for plane in planes if plane[0].dot(face.normal) > 0.9999
                    and abs(plane[0].dot(face.calc_center_median()) - plane[1]) < PLANE_M), None)
        # A chamfer lies in no old face: it takes one map, the old face it touches that faces most its way, so no
        # corner of it is mapped by another face's and its picture is not dragged across it.
        touched = [plane for plane in planes
                   if any(abs(plane[0].dot(loop.vert.co) - plane[1]) < PLANE_M for loop in face.loops)]
        plane = own or max(touched, key=lambda each: each[0].dot(face.normal), default=None)
        if plane is not None:
            for loop in face.loops:
                loop[layer].uv = plane[2](loop.vert.co)
    bm.to_mesh(item.data)
    bm.free()
    item.data.update()
    return item


def jitter(item, amount, seed=None):
    """Moves each point of an object by up to `amount` metres on each axis, seeded by `seed` or by the points
    themselves: worn, uneven stone."""
    points = [tuple(round(value, 5) for value in vertex.co) for vertex in item.data.vertices]
    draw = seeded(seed, 'jitter', amount, points)
    for vertex in item.data.vertices:
        vertex.co += Vector([draw.uniform(-amount, amount) for _ in range(3)])
    item.data.update()
    return item



def fit(item, low, high):
    """Moves and stretches an object so its bounds run exactly from corner `low` to corner `high` (module numbers):
    a built-up piece made to fill its size. Its UVs stretch with it: keep the stretch near 1."""
    points = [(vertex.co.x, -vertex.co.y, vertex.co.z) for vertex in item.data.vertices]
    least = [min(point[axis] for point in points) for axis in range(3)]
    most = [max(point[axis] for point in points) for axis in range(3)]
    factors = [(high[axis] - low[axis]) / max(most[axis] - least[axis], 1e-9) for axis in range(3)]
    scale(item, *factors, about=tuple(least))
    return translate(item, *(low[axis] - least[axis] for axis in range(3)))
