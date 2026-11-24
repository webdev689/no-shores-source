"""The Drowned Vale's props, drawn by the page where its rules say: the crystal seal across a doorway (the Sunken
Gate's, and each way on until its encounter is won), a slab of the Broken Stair that comes and goes, a crystal bell
hung in a frame, and the Lodestone, a pitted lump of grey iron-stone bound in a brass sounding-frame on a line.
"""
import math

import breach_kit as bk
import kit
import latticekit


# The seal's part: a doorway 6 m wide and 8 m high, the seal reaching 0.2 m into each jamb, 1 m through.
SEAL_HALF = 3.2
SEAL_HIGH = 8.0


def seal(module):
    """A wall of the Lattice's crystal grown across a doorway from its jambs, its foot and its head, the shards from
    either side meeting in the middle, their facets dark at the root and alight at its heart, a pane of dark crystal
    behind them so nothing is seen through it; one part, its whole box, and nothing drawn past it either side."""
    pick = latticekit.picker(module.random.randrange(1 << 30))
    materials = latticekit.kinds()
    # Every shard's root stands its own radius and a little more inside the part's sides, top and foot, and none is
    # long enough to pass the far jamb, so the crystal is no wider than the doorway it shuts.
    for side in (-1, 1):
        for row in range(9):
            for _ in range(2):
                radius = pick.uniform(0.18, 0.3)
                z = 0.5 + row * 0.85 + pick.uniform(-0.2, 0.2)
                rise = pick.uniform(0.0 if row == 0 else -0.35, 0.0 if row == 8 else 0.35)
                base = (side * (SEAL_HALF - radius - 0.05), pick.uniform(-0.25, 0.25), z)
                latticekit.shard(module, materials, base, (-side, pick.uniform(-0.08, 0.08), rise),
                                 pick.uniform(1.6, 2.9), radius, pick.uniform(0.0, math.pi), dim=0.8)
    for column in range(8):
        x = -2.45 + column * 0.7 + pick.uniform(-0.1, 0.1)
        for z, way in ((0.0, 1.0), (SEAL_HIGH, -1.0)):
            radius = pick.uniform(0.18, 0.28)
            base = (x, pick.uniform(-0.25, 0.25), z + way * (radius + 0.05))
            latticekit.shard(module, materials, base, (pick.uniform(-0.15, 0.15), pick.uniform(-0.08, 0.08), way),
                             pick.uniform(1.0, 2.2), radius, pick.uniform(0.0, math.pi), dim=0.8)
    latticekit.light(module, materials, (0.0, 0.0, 3.6), 0.8)
    module.part((-SEAL_HALF, -0.5, 0.0), (SEAL_HALF, 0.5, SEAL_HIGH))
    # A sheet of the dark crystal across the whole doorway behind the panes, so nothing shows between them.
    sheet = kit.block(module, (0.0, 0.0, 0.0), (SEAL_HALF * 2 - 0.1, 0.12, SEAL_HIGH - 0.05), 'crystal', bevel=0.0,
                      wear=0.0, part=False)
    module.slots[sheet.name] = [('crystal', 0.1)]
    for row in range(2):
        for column in range(3):
            pane = bk.facet_rock(module, (-2.1 + column * 2.1, 0.0, row * 3.95), (2.0, 0.5, 4.0), 'crystal',
                                 points=18)
            module.slots[pane.name] = [('crystal', 0.15)]


def slab(module):
    """A slab of the Broken Stair: old flags crusted with crystal on their underside, 2.8 m square and 0.6 m deep, its
    top at its foot's height; one part."""
    kit.block(module, (0.0, 0.0, -0.6), (2.8, 2.8, 0.6), 'stone', bevel=0.05, wear=0.06)
    pick = latticekit.picker(module.random.randrange(1 << 30))
    latticekit.cluster(module, latticekit.kinds(), pick, (0.0, 0.0, -0.6), (0.0, 0.0, -1.0), 5, (0.8, 1.6), 0.35, 0.7)


def bell(module):
    """A bell of the crystal, as tall as a child, hung by a loop from an iron yoke: its lip flared wide at its mouth,
    its waist narrow, its shoulder rounded to a flat crown, its wall thick enough to be seen at the mouth and its
    clapper hung inside; its facets catch the light. Drawn only, the rules' bell standing at its foot."""
    mesh = kit.bpy.data.meshes.new('bell')
    made = kit.bmesh.new()
    # Its outside from the lip up to the crown, then its inside back down to the lip, so the wall closes on itself.
    outside = ((0.64, 0.0), (0.66, 0.06), (0.6, 0.14), (0.5, 0.32), (0.42, 0.6), (0.38, 0.9), (0.37, 1.04),
               (0.32, 1.15), (0.2, 1.21), (0.0, 1.23))
    inside = ((0.0, 1.15), (0.28, 1.1), (0.32, 1.0), (0.33, 0.88), (0.37, 0.6), (0.45, 0.32), (0.55, 0.12),
              (0.6, 0.02))
    rings = outside + inside
    sides = 12
    for radius, z in rings:
        for side in range(sides):
            angle = math.tau * side / sides
            made.verts.new((radius * math.cos(angle), radius * math.sin(angle), z + 1.4))
    made.verts.ensure_lookup_table()
    for ring in range(len(rings)):
        after = (ring + 1) % len(rings)
        for side in range(sides):
            corners = [ring * sides + side, ring * sides + (side + 1) % sides, after * sides + (side + 1) % sides,
                       after * sides + side]
            made.faces.new([made.verts[corner] for corner in corners])
    kit.bmesh.ops.remove_doubles(made, verts=made.verts, dist=1e-5)
    made.to_mesh(mesh)
    made.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = False
    item = kit.item_of(module, 'bell', mesh, 'crystal', 0.7)
    item.location = (0.0, 0.0, 0.0)
    bk.bpy_ring(module, (0.0, 0.0, 2.79), 0.14, 0.04)
    kit.block(module, (0.0, 0.0, 2.93), (0.5, 0.14, 0.13), 'iron', bevel=0.0, wear=0.0, part=False)
    kit.column(module, (0.0, 0.0, 1.62), 0.02, 0.9, 'iron', sides=4, wear=0.0, part=False)
    kit.column(module, (0.0, 0.0, 1.5), 0.09, 0.16, 'crystal', sides=6, top=0.5, part=False)


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
