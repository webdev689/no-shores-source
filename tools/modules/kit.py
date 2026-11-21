"""The modules' kit: what every handcrafted playspace is built from in Blender, and how it leaves Blender for the game.

A module is built in Blender's frame (x east, y north, z up), its origin the middle of its foot. It is three things:
its surfaces, each object wearing one of the game's materials; its parts, the boxes a body stands on and runs into,
square to its frame; and its sockets, where a way or a floor meets it. `exported` turns all three into the game's
frame (x east, y south, z up: Blender's y turned round) for the bake.
"""
import math
import random

import bpy  # noqa: I001 (Blender's bmesh and mathutils load with bpy)
import bmesh
import mathutils

# The game's materials a module's surfaces wear (city's `Material`), each drawn in the climate's picture, in the order
# its groups are written: paving last, as the first group carries the parts and paving is never run into. Crystal is
# the Lattice's: drawn by code, not a picture, its core glowing as much as its vertices' glow says.
MATERIALS = ('stone', 'trim', 'rubble', 'chalk', 'turf', 'timber', 'canvas', 'iron', 'gold', 'crystal', 'paving')


class Module:
    """What a module script builds: its name, its parts and sockets as it adds them, and its random draws."""

    def __init__(self, name, seed):
        self.name = name
        self.parts = []
        self.sockets = []
        self.pads = []
        self.random = random.Random(seed)
        self.objects = []
        # An object's materials by its faces' material index, with each one's glow: [(material, glow), ...].
        self.slots = {}
        # Where the module opens the land under its foot (a chasm's mouth): its two lips, each a line of points along
        # it at the ground, the land between them not drawn.
        self.mouth = None

    def part(self, low, high):
        """A box a body stands on and runs into, from its low corner to its high one."""
        self.parts.append([*low, *high])

    def pad(self, low, high, level):
        """Ground levelled under the module, from its low corner to its high one (x and y), at `level` over its foot:
        land that would stand through a floor is held under it."""
        self.pads.append([low[0], low[1], high[0], high[1], level])

    def socket(self, name, at, facing):
        """Where a way or a floor meets the module: its point and the way it faces out, level."""
        self.sockets.append(dict(name=name, at=list(at), facing=list(facing)))

    def draw(self, low=0.0, high=1.0):
        return low + (high - low) * self.random.random()


def reset():
    """An empty scene."""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _object(module, name, mesh, material, glow=0.0):
    item = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(item)
    module.objects.append(item)
    module.slots[item.name] = [(material, glow)]
    return item


def faced(module, item, slots):
    """Gives an object one material a face, by the face's material index: `slots` is [(material, glow), ...], glow
    from 0 (crystal dark to its depths) to 1 (its core alight); only crystal glows."""
    module.slots[item.name] = list(slots)
    return item


def adopted(module, item, slots):
    """Takes an object built elsewhere in this scene (the Lattice's props) into the module, its faces' materials as
    `faced` gives them."""
    if item.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(item)
    module.objects.append(item)
    return faced(module, item, slots)


def oriented(points, faces, toward):
    """Each face wound so it faces `toward(middle)` (a direction from its middle): a chasm's walls face into it."""
    out = []
    for face in faces:
        a, b, c = (points[i] for i in face[:3])
        normal = ((b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
                  (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
                  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
        middle = [sum(points[i][axis] for i in face) / len(face) for axis in range(3)]
        hint = toward(middle)
        out.append(tuple(face) if sum(n * h for n, h in zip(normal, hint)) >= 0 else tuple(reversed(face)))
    return out


def solid_of(module, name, points, faces, material='stone', glow=0.0, smooth=False):
    """An object of `points` and `faces` (each a tuple of point numbers, wound to face out) in one material, its faces
    flat unless `smooth`, so a facet or a split board catches the light on its own."""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(point) for point in points], [], [tuple(face) for face in faces])
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    return _object(module, f'{name}{len(module.objects)}', mesh, material, glow)


def _box_mesh(size):
    mesh = bpy.data.meshes.new('box')
    made = bmesh.new()
    bmesh.ops.create_cube(made, size=1.0)
    bmesh.ops.scale(made, vec=mathutils.Vector(size), verts=made.verts)
    made.to_mesh(mesh)
    made.free()
    return mesh


def _worn(item, bevel, wear, seed, cuts=0):
    """Bevels a solid's edges and roughens its faces by noise, so a cut stone reads as old and handled."""
    if cuts:
        made = bmesh.new()
        made.from_mesh(item.data)
        bmesh.ops.subdivide_edges(made, edges=made.edges, cuts=cuts, use_grid_fill=True)
        made.to_mesh(item.data)
        made.free()
    if bevel > 0:
        modifier = item.modifiers.new('bevel', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 1
        modifier.limit_method = 'ANGLE'
    if wear > 0:
        texture = bpy.data.textures.new(f'wear{seed}', 'CLOUDS')
        texture.noise_scale = 0.35
        texture.noise_depth = 2
        modifier = item.modifiers.new('wear', 'DISPLACE')
        modifier.texture = texture
        modifier.strength = wear
        modifier.mid_level = 0.5
        modifier.texture_coords = 'GLOBAL'
    bpy.context.view_layer.update()


def block(module, at, size, material='stone', turn=0.0, bevel=0.06, wear=0.04, cuts=0, part=True):
    """A cut block standing on `at` (the middle of its foot), `size` across x, y and up, turned `turn` radians about
    up; a part where it is square to the frame and `part` is asked."""
    item = _object(module, f'block{len(module.objects)}', _box_mesh(size), material)
    item.location = (at[0], at[1], at[2] + size[2] / 2)
    item.rotation_euler = (0.0, 0.0, turn)
    _worn(item, bevel, wear, len(module.objects), cuts)
    if part and abs(math.sin(2 * turn)) < 1e-9:
        sx, sy = (size[0], size[1]) if abs(math.cos(turn)) > 0.5 else (size[1], size[0])
        module.part([at[0] - sx / 2, at[1] - sy / 2, at[2]], [at[0] + sx / 2, at[1] + sy / 2, at[2] + size[2]])
    return item


def column(module, at, radius, height, material='stone', sides=12, top=1.0, wear=0.03, part=True):
    """A round column on `at`, its top `top` of its foot's radius; its part the box round its middle half."""
    mesh = bpy.data.meshes.new('column')
    made = bmesh.new()
    bmesh.ops.create_cone(made, cap_ends=True, segments=sides, radius1=radius, radius2=radius * top, depth=height)
    bmesh.ops.translate(made, vec=(0.0, 0.0, height / 2), verts=made.verts)
    made.to_mesh(mesh)
    made.free()
    item = _object(module, f'column{len(module.objects)}', mesh, material)
    item.location = at
    _worn(item, 0.03, wear, len(module.objects), 0)
    if part:
        inner = radius * (1 + top) / 2 * 0.8
        module.part([at[0] - inner, at[1] - inner, at[2]], [at[0] + inner, at[1] + inner, at[2] + height])
    return item


def rock(module, at, size, seed, material='rubble', part=True, flat_foot=True, detail=3):
    """A lump of natural rock: an icosphere stretched to `size` (x, y, up) on `at`, pushed out by noise into crags,
    its foot cut flat where it stands; its part the box of its middle two thirds."""
    mesh = bpy.data.meshes.new('rock')
    made = bmesh.new()
    bmesh.ops.create_icosphere(made, subdivisions=detail, radius=0.5)
    noise = mathutils.noise
    for vertex in made.verts:
        point = vertex.co
        bulge = 1.0 + 0.28 * noise.fractal(point * 2.2 + mathutils.Vector((seed, 0, 0)), 0.6, 2.0, 3)
        crag = 0.08 * noise.ridged_multi_fractal(point * 6.0 + mathutils.Vector((0, seed, 0)), 0.8, 2.0, 2, 1.0, 2.0)
        point *= bulge + crag
        point.x *= size[0]
        point.y *= size[1]
        point.z = point.z * size[2] + size[2] / 2
        if flat_foot:
            point.z = max(point.z, 0.0)
    made.to_mesh(mesh)
    made.free()
    item = _object(module, f'rock{len(module.objects)}', mesh, material)
    item.location = at
    if part:
        module.part(
            [at[0] - size[0] / 3, at[1] - size[1] / 3, at[2]], [at[0] + size[0] / 3, at[1] + size[1] / 3, at[2] + size[2] * 0.85]
        )
    return item


def organic(module, blobs, seed, material='rubble', voxel=0.18, rough=0.35, triangles=1500, flat_top=None,
            flat_foot=0.0):
    """Natural rock made as a sculptor roughs it out: ellipsoids (`blobs`, each its middle and its three radii)
    merged into one surface by a voxel remesh, cut into crags and bulges by noise `rough` metres deep, cut flat on top
    at `flat_top` (a shelf a body stands on) and at its foot at `flat_foot`, then decimated to about `triangles`."""
    mesh = bpy.data.meshes.new('organic')
    made = bmesh.new()
    for middle, radii in blobs:
        sphere = bmesh.ops.create_icosphere(made, subdivisions=3, radius=1.0)['verts']
        bmesh.ops.scale(made, vec=mathutils.Vector(radii), verts=sphere)
        bmesh.ops.translate(made, vec=mathutils.Vector(middle), verts=sphere)
    made.to_mesh(mesh)
    made.free()
    item = _object(module, f'organic{len(module.objects)}', mesh, material)
    remesh = item.modifiers.new('merge', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = voxel
    bpy.context.view_layer.objects.active = item
    bpy.ops.object.modifier_apply(modifier='merge')
    noise = mathutils.noise
    offset = mathutils.Vector((seed * 1.37, seed * 0.71, seed * 0.29))
    for vertex in item.data.vertices:
        point = vertex.co
        bulge = noise.fractal(point * 0.35 + offset, 0.55, 2.0, 3)
        crag = noise.ridged_multi_fractal(point * 1.1 + offset, 0.9, 2.1, 3, 1.0, 2.0) - 0.5
        vertex.co = point + vertex.normal * rough * (0.7 * bulge + 0.6 * crag)
        if flat_top is not None and vertex.co.z > flat_top:
            vertex.co.z = flat_top + 0.04 * noise.noise(point * 2.0 + offset)
        if vertex.co.z < flat_foot:
            vertex.co.z = flat_foot
    item.data.update()
    decimate = item.modifiers.new('budget', 'DECIMATE')
    decimate.ratio = min(1.0, triangles / max(1, len(item.data.polygons) * 2))
    bpy.ops.object.modifier_apply(modifier='budget')
    for polygon in item.data.polygons:
        polygon.use_smooth = True
    return item


def spire(module, at, radius, height, seed, material='rubble', hanging=False, part=True):
    """A cone of dripstone on `at`: a stalagmite rising `height`, or with `hanging` a stalactite hanging down from it,
    its sides rippled by noise and leaning a little; its part the box round its lower half's core, where it rises."""
    mesh = bpy.data.meshes.new('spire')
    made = bmesh.new()
    rings, sides = 8, 10
    noise = mathutils.noise
    lean = mathutils.Vector((module.draw(-0.12, 0.12), module.draw(-0.12, 0.12), 0.0))
    for ring in range(rings + 1):
        share = ring / rings
        width = radius * (1.0 - share) ** 1.3 + 0.03
        for side in range(sides):
            angle = math.tau * side / sides
            point = mathutils.Vector((math.cos(angle) * width, math.sin(angle) * width, share * height))
            ripple = 1.0 + 0.25 * noise.noise(point * 1.7 + mathutils.Vector((seed, seed * 0.5, 0.0)))
            point.x *= ripple
            point.y *= ripple
            point += lean * point.z
            if hanging:
                point.z = -point.z
            made.verts.new(point)
    made.verts.ensure_lookup_table()
    for ring in range(rings):
        for side in range(sides):
            corners = [ring * sides + side, ring * sides + (side + 1) % sides,
                       (ring + 1) * sides + (side + 1) % sides, (ring + 1) * sides + side]
            face = [made.verts[corner] for corner in corners]
            made.faces.new(face if not hanging else face[::-1])
    made.faces.new([made.verts[side] for side in range(sides)][::-1] if not hanging else
                   [made.verts[side] for side in range(sides)])
    made.to_mesh(mesh)
    made.free()
    item = _object(module, f'spire{len(module.objects)}', mesh, material)
    item.location = at
    if part and not hanging and height > 1.0:
        core = radius * 0.5
        module.part([at[0] - core, at[1] - core, at[2]], [at[0] + core, at[1] + core, at[2] + height * 0.5])
    return item


def stair(module, foot, way, width, rise, run, steps, material='stone', wear=0.03):
    """A flight of `steps` from `foot` (the middle of its first tread's front edge) along `way` (a unit along x or y),
    each `rise` up and `run` deep, `width` across; each step a block and a part."""
    for step in range(steps):
        along = run * (step + 0.5)
        at = (foot[0] + way[0] * along, foot[1] + way[1] * along, foot[2])
        size = (width, run, rise * (step + 1)) if way[0] == 0 else (run, width, rise * (step + 1))
        block(module, at, size, material, bevel=0.03, wear=wear)


def cut(item, cutter):
    """Cuts one solid out of another (an arch's opening out of its wall), and lets the cutter go."""
    modifier = item.modifiers.new('cut', 'BOOLEAN')
    modifier.operation = 'DIFFERENCE'
    modifier.solver = 'EXACT'
    modifier.object = cutter
    bpy.context.view_layer.objects.active = item
    bpy.ops.object.modifier_apply(modifier='cut')
    bpy.data.objects.remove(cutter)


def cylinder_cutter(at, radius, length, along_y=True):
    """A round bar to cut an arch with: its middle at `at`, lying along y (or x), `length` long."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=length, location=at)
    bar = bpy.context.active_object
    bar.rotation_euler = (math.pi / 2, 0.0, 0.0) if along_y else (0.0, math.pi / 2, 0.0)
    bpy.context.view_layer.update()
    return bar


def battlements(module, start, end, z, thick, material='stone', every=2.0, wide=1.1, high=0.9):
    """Merlons along a wall's outer edge from `start` to `end` (two points level at `z`), `thick` deep."""
    length = math.dist(start, end)
    count = max(1, int(length / every))
    along = ((end[0] - start[0]) / length, (end[1] - start[1]) / length)
    turn = math.atan2(along[1], along[0])
    for merlon in range(count):
        share = (merlon + 0.5) / count
        at = (start[0] + (end[0] - start[0]) * share, start[1] + (end[1] - start[1]) * share, z)
        block(module, at, (wide, thick, high), material, turn=turn, bevel=0.03, wear=0.03, part=False)


def exported(module):
    """The module's surfaces by material, each a list of vertices (position, normal, glow) and triangles, its parts and its
    sockets, all in the game's frame (x east, y south, z up), and its size: the box round its surfaces and parts."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    groups = {}
    low = [math.inf] * 3
    high = [-math.inf] * 3
    for item in module.objects:
        evaluated = item.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        mesh.transform(item.matrix_world)
        mesh.calc_loop_triangles()
        normals = [corner.vector.copy() for corner in mesh.corner_normals]
        slots = module.slots[item.name]
        for triangle in mesh.loop_triangles:
            material, glow = slots[min(triangle.material_index, len(slots) - 1)]
            group = groups.setdefault(material, dict(vertices=[], index={}, triangles=[]))
            corners = []
            for loop in triangle.loops:
                point = mesh.vertices[mesh.loops[loop].vertex_index].co
                normal = normals[loop]
                game = (round(point.x, 4), round(-point.y, 4), round(point.z, 4))
                facing = (round(normal.x, 3), round(-normal.y, 3), round(normal.z, 3))
                key = (game, facing, round(glow, 3))
                if key not in group['index']:
                    group['index'][key] = len(group['vertices'])
                    group['vertices'].append(key)
                corners.append(group['index'][key])
                for axis in range(3):
                    low[axis] = min(low[axis], game[axis])
                    high[axis] = max(high[axis], game[axis])
            # Blender's y turned round mirrors the frame, so each triangle is wound the other way to face out.
            group['triangles'].append((corners[0], corners[2], corners[1]))
        evaluated.to_mesh_clear()
    parts = [[x0, -y1, z0, x1, -y0, z1] for x0, y0, z0, x1, y1, z1 in module.parts]
    pads = [[x0, -y1, x1, -y0, level] for x0, y0, x1, y1, level in module.pads]
    # The size holds the parts as well as the surfaces: a cheek's part stands over its rock's drawn line.
    for part in parts:
        for axis in range(3):
            low[axis] = min(low[axis], part[axis])
            high[axis] = max(high[axis], part[axis + 3])
    sockets = [dict(name=s['name'], at=[s['at'][0], -s['at'][1], s['at'][2]], facing=[s['facing'][0], -s['facing'][1]])
               for s in module.sockets]
    size = [max(abs(low[0]), abs(high[0])) * 2, max(abs(low[1]), abs(high[1])) * 2, high[2]]
    mouth = module.mouth and [[[x, -y] for x, y, _ in lip] for lip in module.mouth]
    return dict(groups={name: groups[name] for name in MATERIALS if name in groups}, parts=parts, sockets=sockets,
                pads=pads, size=[round(side, 3) for side in size], mouth=mouth)
