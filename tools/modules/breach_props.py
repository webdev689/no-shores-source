"""The Drowned Vale's props, drawn by the page where its rules say: the crystal seal across a doorway (the Sunken
Gate's, and each way on until its encounter is won), a slab of the Broken Stair that comes and goes, a crystal bell
hung in a frame, and the Lodestone, a pitted lump of grey iron-stone bound in a brass sounding-frame on a line.
"""
import math

import kit
import latticekit


def seal(module):
    """A wall of the Lattice's crystal grown across a doorway 6 m wide and 8 m high, its facets dark at the root and
    alight at its heart; one part, its whole box."""
    pick = latticekit.picker(module.random.randrange(1 << 30))
    materials = latticekit.kinds()
    for row in range(4):
        for column in range(5):
            base = (-2.6 + column * 1.3 + pick.uniform(-0.2, 0.2), pick.uniform(-0.2, 0.2), row * 1.9)
            up = (pick.uniform(-0.4, 0.4), pick.uniform(-0.15, 0.15), 1.0)
            latticekit.cluster(module, materials, pick, base, up, 3, (1.6, 2.6), 0.45, 0.35, 0.8)
    latticekit.light(module, materials, (0.0, 0.0, 3.6), 0.8)
    module.part((-3.2, -0.5, 0.0), (3.2, 0.5, 8.0))


def slab(module):
    """A slab of the Broken Stair: old flags crusted with crystal on their underside, 2.8 m square and 0.6 m deep, its
    top at its foot's height; one part."""
    kit.block(module, (0.0, 0.0, -0.6), (2.8, 2.8, 0.6), 'stone', bevel=0.05, wear=0.06)
    pick = latticekit.picker(module.random.randrange(1 << 30))
    latticekit.cluster(module, latticekit.kinds(), pick, (0.0, 0.0, -0.6), (0.0, 0.0, -1.0), 5, (0.8, 1.6), 0.35, 0.7)


def bell(module):
    """A bell of the crystal, as tall as a child, hung from an iron crown: its mouth wide and its shoulder narrow, its
    facets catching the light; drawn only, the rules' bell standing at its foot."""
    mesh = kit.bpy.data.meshes.new('bell')
    made = kit.bmesh.new()
    rings = ((0.62, 0.0), (0.66, 0.08), (0.55, 0.3), (0.42, 0.7), (0.36, 1.0), (0.28, 1.2), (0.0, 1.26))
    sides = 9
    for radius, z in rings:
        for side in range(sides):
            angle = math.tau * side / sides
            made.verts.new((radius * math.cos(angle), radius * math.sin(angle), z + 1.4))
    made.verts.ensure_lookup_table()
    for ring in range(len(rings) - 1):
        for side in range(sides):
            corners = [ring * sides + side, ring * sides + (side + 1) % sides, (ring + 1) * sides + (side + 1) % sides,
                       (ring + 1) * sides + side]
            made.faces.new([made.verts[corner] for corner in corners])
    made.to_mesh(mesh)
    made.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    item = kit.item_of(module, 'bell', mesh, 'crystal', 0.7)
    item.location = (0.0, 0.0, 0.0)
    kit.column(module, (0.0, 0.0, 2.66), 0.12, 0.4, 'iron', sides=8, part=False)
    kit.column(module, (0.0, 0.0, 1.5), 0.08, 0.4, 'crystal', sides=6, top=0.4, part=False)


def lodestone(module):
    """The Lodestone: a pitted lump of grey iron-stone the size of two fists, bound in a brass sounding-frame of four
    bands, a ring at its top for the line; drawn only, held before its bearer."""
    kit.rock(module, (0.0, 0.0, 0.0), (0.26, 0.24, 0.3), 31, 'iron', part=False, detail=3)
    for band in range(4):
        angle = band * math.pi / 4
        kit.bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.012, major_segments=16, minor_segments=4,
                                             location=(0.0, 0.0, 0.15), rotation=(math.pi / 2, 0.0, angle))
        hoop = kit.bpy.context.active_object
        module.objects.append(hoop)
        module.slots[hoop.name] = [('gold', 0.0)]
    kit.bpy.ops.mesh.primitive_torus_add(major_radius=0.05, minor_radius=0.01, major_segments=10, minor_segments=4,
                                         location=(0.0, 0.0, 0.36), rotation=(math.pi / 2, 0.0, 0.0))
    ring = kit.bpy.context.active_object
    module.objects.append(ring)
    module.slots[ring.name] = [('gold', 0.0)]
