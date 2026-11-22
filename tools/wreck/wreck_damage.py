"""What the ram and the fire did to the ships: masts snapped, sails torn, decks broken through, and splintered timber
along every break. Every random choice comes from a seeded generator, so the wreck is built the same every time.
"""
import math
import random

import bpy  # noqa: I001 - Blender's own modules load once bpy has
import bmesh
from mathutils import Vector, noise

from ship_mesh import Piece
from wreck_ships import bake_placement, connected, meshes

# A splinter stands out of a break this far at most, metres, and is this wide and thick.
SPLINTER_M = (0.25, 1.3)
SPLINTER_WIDE_M = (0.12, 0.26)
SPLINTER_THICK_M = 0.07
# Splinters stand this far apart along a break, metres.
SPLINTER_EVERY_M = 0.22


def part_of_face(item, face):
    """The part a face is painted as, by its material slot."""
    slots = item.material_slots
    material = slots[min(face.material_index, len(slots) - 1)].material if slots else None
    return material.name.split('.')[0] if material else 'spar'


def faces_where(collection, keep, inside):
    """Removes the faces of the collection's meshes whose middle `inside(point, part)` says is in; `keep` names
    objects to leave whole. Empties go."""
    for item in list(meshes(collection)):
        if any(name in item.name for name in keep):
            continue
        bake_placement(item)
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        doomed = [face for face in mesh.faces if inside(face.calc_center_median(), part_of_face(item, face))]
        drop(mesh, item, doomed)


def drop(mesh, item, doomed):
    """Deletes `doomed` faces of `mesh` and points left with none, writes the mesh back, and removes an object left
    empty."""
    bmesh.ops.delete(mesh, geom=list(set(doomed)), context='FACES')
    bmesh.ops.delete(mesh, geom=[vertex for vertex in mesh.verts if not vertex.link_faces], context='VERTS')
    empty = len(mesh.faces) == 0
    mesh.to_mesh(item.data)
    mesh.free()
    item.data.update()
    if empty:
        bpy.data.objects.remove(item)


def carve(collection, box, inside, keep=()):
    """Cuts the collection's meshes along the four sides of `box` (x0, y0, x1, y1), so no face spans its edge, then
    removes the faces in it that `inside(point, part)` says go: a hole with a clean rim, never a whole deck strip whose
    middle happened to fall in it."""
    x0, y0, x1, y1 = box
    planes = (((x0, 0, 0), (1, 0, 0)), ((x1, 0, 0), (1, 0, 0)), ((0, y0, 0), (0, 1, 0)), ((0, y1, 0), (0, 1, 0)))
    for item in list(meshes(collection)):
        if any(name in item.name for name in keep):
            continue
        bake_placement(item)
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        for point, normal in planes:
            bmesh.ops.bisect_plane(mesh, geom=mesh.verts[:] + mesh.edges[:] + mesh.faces[:], plane_co=Vector(point),
                                   plane_no=Vector(normal))
        doomed = []
        for face in mesh.faces:
            middle = face.calc_center_median()
            if x0 < middle.x < x1 and y0 < middle.y < y1 and inside(middle, part_of_face(item, face)):
                doomed.append(face)
        drop(mesh, item, doomed)


def small_pieces_where(collection, inside, longest):
    """Removes each connected piece of the collection's meshes no longer than `longest` metres corner to corner whose
    middle `inside(point)` says is in: a splinter, a beam's stub, a fitting; never a deck or a hull."""
    for item in list(meshes(collection)):
        bake_placement(item)
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        doomed = []
        for piece in connected(mesh.faces):
            points = [vertex.co for face in piece for vertex in face.verts]
            low = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
            high = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
            if (high - low).length <= longest and inside(sum(points, Vector()) / len(points)):
                doomed.extend(piece)
        drop(mesh, item, doomed)


def pieces_where(collection, inside, parts=None):
    """Removes each connected piece (a spar, a line, a sail, a fitting) of the collection's meshes whose middle
    `inside(point)` says is in; with `parts`, only pieces painted as one of them."""
    for item in list(meshes(collection)):
        bake_placement(item)
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        doomed = []
        for piece in connected(mesh.faces):
            if parts and part_of_face(item, piece[0]) not in parts:
                continue
            points = [vertex.co for face in piece for vertex in face.verts]
            if inside(sum(points, Vector()) / len(points)):
                doomed.extend(piece)
        drop(mesh, item, doomed)


def tear_sails(collection, keep_share, seed, near_foot=1.0):
    """Tears every sail of the collection to rags: each is cut fine, and what the fire took is where a seeded noise
    over the canvas falls under the share kept, more of it toward the foot by `near_foot`, so holes and tatters are
    ragged and joined, never a chequer."""
    offset = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for item in list(meshes(collection)):
        bake_placement(item)
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        sails = [face for face in mesh.faces if part_of_face(item, face) == 'sail']
        if not sails:
            mesh.free()
            continue
        bmesh.ops.subdivide_edges(mesh, edges=list({edge for face in sails for edge in face.edges}), cuts=11,
                                  use_grid_fill=True)
        mesh.faces.ensure_lookup_table()
        sails = [face for face in mesh.faces if part_of_face(item, face) == 'sail']
        doomed = []
        for piece in connected(sails):
            heights = [face.calc_center_median().z for face in piece]
            low, high = min(heights), max(heights)
            for face, height in zip(piece, heights, strict=True):
                rise = (height - low) / max(1e-6, high - low)
                middle = face.calc_center_median()
                ragged = noise.fractal(middle * 0.9 + offset, 0.8, 2.3, 5) * 0.5 + 0.5
                if ragged > keep_share + near_foot * 0.45 * rise - near_foot * 0.25:
                    doomed.append(face)
            doomed.extend(adrift([face for face in piece if face not in set(doomed)], high - (high - low) / 10))
        drop(mesh, item, doomed)


def adrift(kept, head_z):
    """The canvas left of a sail that no longer hangs from its head: every patch not joined, edge to edge, to one
    along its head (over `head_z`)."""
    left = set(kept)
    stack = [face for face in kept if face.calc_center_median().z > head_z]
    hung = set(stack)
    while stack:
        face = stack.pop()
        for edge in face.edges:
            for other in edge.link_faces:
                if other in left and other not in hung:
                    hung.add(other)
                    stack.append(other)
    return [face for face in kept if face not in hung]


def snap_mast(collection, foot, stump_m, reach_m, rng):
    """Snaps the mast standing at `foot` (x, y, deck z) `stump_m` over its deck: every spar, line and sail of its top
    hamper within `reach_m` of its line goes, and the stump's top is left jagged."""
    fx, fy, fz = foot

    def aloft(point):
        return point.z > fz + stump_m and math.hypot(point.x - fx, point.y - fy) < reach_m

    pieces_where(collection, aloft, parts=('spar', 'sail'))
    faces_where(collection, (), lambda point, part: part == 'spar' and math.hypot(point.x - fx, point.y - fy) < 0.6
                and point.z > fz + stump_m - 0.3 * rng.random())


def splinters(piece, edges, outward, rng, part):
    """Splintered planks along a break: along each edge (a pair of points), splinters standing out `outward`,
    each its own length, lean and taper."""
    out = Vector(outward).normalized()
    for start, end in edges:
        start, end = Vector(start), Vector(end)
        length = (end - start).length
        for step in range(max(1, int(length / SPLINTER_EVERY_M))):
            at = start.lerp(end, (step + rng.random()) / max(1, int(length / SPLINTER_EVERY_M)))
            reach = rng.uniform(*SPLINTER_M) * (0.4 if rng.random() < 0.4 else 1.0)
            lean = Vector((rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(-0.35, 0.2)))
            tip = at + (out + lean).normalized() * reach
            wide = rng.uniform(*SPLINTER_WIDE_M)
            piece.prism(tuple(at), tuple(tip), wide / 2, part, sides=4, end_radius=wide * rng.uniform(0.05, 0.3))


def break_edges(collection, point, normal, within=0.02):
    """The open edges a cut left: each edge of a face on one side only, lying in the cut's plane, as point pairs,
    with the part of the face it bounds."""
    point, normal = Vector(point), Vector(normal).normalized()
    found = []
    for item in meshes(collection):
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        for edge in mesh.edges:
            if len(edge.link_faces) != 1:
                continue
            ends = [vertex.co.copy() for vertex in edge.verts]
            if all(abs((end - point).dot(normal)) < within for end in ends):
                found.append((ends, part_of_face(item, edge.link_faces[0])))
        mesh.free()
    return found


def open_edges(collection, near):
    """The open edges of the collection's hull and deck whose middle `near(point)` says is in: a hole's rim."""
    found = []
    for item in meshes(collection):
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        for edge in mesh.edges:
            if len(edge.link_faces) != 1 or part_of_face(item, edge.link_faces[0]) not in ('hull', 'deck'):
                continue
            ends = [vertex.co.copy() for vertex in edge.verts]
            if (ends[1] - ends[0]).length > 0.05 and near((ends[0] + ends[1]) / 2):
                found.append(ends)
        mesh.free()
    return found


def splinter_rim(collection, near, inward, seed, name):
    """Splintered planks along a hole's rim, hanging into it toward `inward(point)`: one object."""
    rng = random.Random(seed)
    piece = Piece()
    for ends in open_edges(collection, near):
        middle = (ends[0] + ends[1]) / 2
        splinters(piece, [ends], inward(middle) + Vector((0, 0, -0.6)), rng, 'deck')
    return splintered(piece, name, collection)


def splintered(piece, name, collection):
    """The splinters as one object, solid that no body stands on: their points are no ledge along a break."""
    if not piece.faces:
        return None
    item = piece.build(name, collection)
    item['wall'] = True
    return item


def splinter_break(collection, point, normal, outward, seed, name):
    """Splintered timber along every edge a cut left in `collection`, standing out `outward`: one object."""
    rng = random.Random(seed)
    piece = Piece()
    by_part = {}
    for ends, part in break_edges(collection, point, normal):
        # Only the hull's and deck's planks splinter: lines and spars cut through stay as they are.
        if part in ('hull', 'deck') and (ends[1] - ends[0]).length > 0.05:
            by_part.setdefault(part, []).append(ends)
    for part, edges in by_part.items():
        splinters(piece, edges, outward, rng, part)
    return splintered(piece, name, collection)
