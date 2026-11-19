"""Shapes the owner's Sloop: her size, and a gap and steps down from her quarterdeck.

    <python with bpy> tools/ships/shape_ship.py Sloop.blend Shaped.blend --scale <times>

Her parts must be painted already, as the published source is: her steps wear the hull and deck parts that
tools/ships/paint_ship.py names, and painting her again afterwards lays her UVs at her new size. The model keeps a
record of each change it has had, so a run on one already shaped changes nothing.
"""
import argparse
import sys

import bpy  # noqa: I001 - Blender's own modules load once bpy has
import bmesh
from mathutils import Matrix, Vector

# The scene's own record of how many times the owner's model she stands, and whether her quarterdeck is opened.
SCALE_KEY = 'overlook_scale'
STEPS_KEY = 'overlook_steps'
# Her quarterdeck as the owner modelled it, in the model's frame (x her bow, y her port, z up) at its own size: the
# front of its planks, how far out its two front corners reach either side of her hatch, its planks' height and her
# deck's, and the depth of the rail along its front.
FRONT_X = -3.179
CORNER_Y = (0.2333, 0.45)
PLANKS_Z = 1.2233
DECK_Z = 1.0
RAIL_X = (-0.1033, 0.03)
# The rail is cut from just over her planks to over its top.
CUT_Z = (0.01, 0.41)
# Steps down from her planks to her deck, each this deep, at the owner's size.
STEPS = 4
STEP_X = 0.0833
NEAR = 1e-5


def size(times):
    """Brings the model to `times` the owner's model, about her origin, from the scale it is at."""
    scene = bpy.context.scene
    grow = times / scene.get(SCALE_KEY, 1.0)
    if abs(grow - 1.0) > 1e-9:
        for item in bpy.data.objects:
            if item.parent is None:
                item.matrix_world = Matrix.Scale(grow, 4) @ item.matrix_world
    scene[SCALE_KEY] = times
    print(f"{times} times the owner's model")


def gaps(times):
    """The two cuts through her quarterdeck's rail, at its front corners: each a box's low and high corners."""
    low_x, high_x = FRONT_X + RAIL_X[0], FRONT_X + RAIL_X[1]
    low_z, high_z = PLANKS_Z + CUT_Z[0], PLANKS_Z + CUT_Z[1]
    boxes = []
    for side in (1, -1):
        low_y, high_y = sorted((side * CORNER_Y[0], side * CORNER_Y[1]))
        boxes.append((Vector((low_x, low_y, low_z)) * times, Vector((high_x, high_y, high_z)) * times))
    return boxes


def inside(point, box):
    low, high = box
    return all(low[axis] - NEAR <= point[axis] <= high[axis] + NEAR for axis in range(3))


def touches(face, box):
    """Whether a face's bounds meet a box's."""
    low, high = box
    points = [vertex.co for vertex in face.verts]
    return all(
        min(point[axis] for point in points) <= high[axis] and max(point[axis] for point in points) >= low[axis]
        for axis in range(3)
    )


def cut(mesh, box):
    """Cuts every face that meets `box` along its six sides, takes away what is inside, and closes the cut ends."""
    low, high = box
    for axis in range(3):
        for value, sign in ((low[axis], -1), (high[axis], 1)):
            near = [face for face in mesh.faces if touches(face, box)]
            geom = list({element for face in near for element in (*face.verts, *face.edges)}) + near
            normal = Vector((0, 0, 0))
            normal[axis] = sign
            point = Vector((0, 0, 0))
            point[axis] = value
            bmesh.ops.bisect_plane(mesh, geom=geom, plane_co=point, plane_no=normal)
    gone = [face for face in mesh.faces if inside(face.calc_center_median(), box)]
    bmesh.ops.delete(mesh, geom=gone, context='FACES')
    on_box = [
        edge
        for edge in mesh.edges
        if edge.is_boundary and all(touches_side(vertex.co, box) for vertex in edge.verts)
    ]
    # Each cut end is closed facing into the cut, away from what is left of the rail.
    middle = (low + high) / 2
    for face in bmesh.ops.holes_fill(mesh, edges=on_box, sides=0)['faces']:
        face.normal_update()
        if face.normal.dot(middle - face.calc_center_median()) < 0:
            face.normal_flip()
    return len(gone)


def touches_side(point, box):
    """Whether a point lies on one of a box's sides."""
    low, high = box
    return inside(point, box) and any(
        abs(point[axis] - low[axis]) < NEAR * 10 or abs(point[axis] - high[axis]) < NEAR * 10 for axis in range(3)
    )


def add_steps(mesh, times, materials):
    """Steps down from her quarterdeck's planks to her deck at each gap, forward of it; the top one reaches back under
    what is left of the rail, so no sliver of deck lies between them."""
    hull, deck = materials
    for side in (1, -1):
        low_y, high_y = sorted((side * CORNER_Y[0], side * CORNER_Y[1]))
        for step in range(STEPS):
            top = PLANKS_Z - (step + 1) * (PLANKS_Z - DECK_Z) / (STEPS + 1)
            back_x = FRONT_X + (step * STEP_X if step else RAIL_X[0])
            low = Vector((back_x, low_y, DECK_Z)) * times
            high = Vector((FRONT_X + (step + 1) * STEP_X, high_y, top)) * times
            middle, span = (low + high) / 2, high - low
            shape = Matrix.Translation(middle) @ Matrix.Diagonal((*span, 1.0))
            made = bmesh.ops.create_cube(mesh, size=1.0, matrix=shape)['verts']
            for face in {face for vertex in made for face in vertex.link_faces}:
                face.normal_update()
                face.material_index = deck if face.normal.z > 0.7 else hull
            under = [face for vertex in made for face in vertex.link_faces if face.normal.z < -0.7]
            bmesh.ops.delete(mesh, geom=list(set(under)), context='FACES')


def open_quarterdeck(times):
    """Opens her quarterdeck's rail at its two front corners and lays steps down from each, once."""
    scene = bpy.context.scene
    if scene.get(STEPS_KEY):
        return
    boxes = gaps(times)
    laid = False
    for item in bpy.data.objects:
        if item.type != 'MESH':
            continue
        mesh = bmesh.new()
        mesh.from_mesh(item.data)
        mesh.transform(item.matrix_world)
        taken = sum(cut(mesh, box) for box in boxes if any(touches(face, box) for face in mesh.faces))
        names = [material.name if material else None for material in item.data.materials]
        if taken:
            if 'hull' not in names or 'deck' not in names:
                sys.exit(f'{item.name}: her steps wear her painted hull and deck: paint her (paint_ship.py) first')
            add_steps(mesh, times, (names.index('hull'), names.index('deck')))
            print(f'{item.name}: {taken} faces of her quarterdeck rail taken away, {STEPS} steps laid each side')
            laid = True
        mesh.normal_update()
        mesh.transform(item.matrix_world.inverted())
        mesh.to_mesh(item.data)
        mesh.free()
    if not laid:
        sys.exit("no face of her quarterdeck's rail met its gaps: nothing was opened")
    scene[STEPS_KEY] = True


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('blend', help='the model, an absolute path')
    parser.add_argument('out', help='where to save the shaped model, an absolute path')
    parser.add_argument('--scale', type=float, required=True, help="how many times the owner's model she stands")
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None)
    bpy.ops.wm.open_mainfile(filepath=args.blend)
    size(args.scale)
    open_quarterdeck(args.scale)
    bpy.ops.wm.save_as_mainfile(filepath=args.out, compress=True)
    print(f'saved {args.out}')


if __name__ == '__main__':
    main()
