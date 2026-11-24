"""What the Drowned Vale's spaces are built from: the old vale's stone, its drowned cottages and their timbers, the
Lattice's red crystal grown through it all, and the pieces its encounters stand on, each a part where a body meets
it. Every space is laid square to its frame in Blender's (x east, y north, z up), its floor's top at 0 unless said,
and names its pieces by socket, so the rules and the page read where each stands from the bake alone.
"""
import math

import kit
import latticekit

# A wall nobody climbs: past a jump's reach and a mantle's (1.8 m) with room to spare.
WALL_M = 7.0
# A riser a body and a foe walk up (the movement rules step 0.5 m), and a tread.
RISE_M = 0.24
RUN_M = 0.42
# A mooring stone: its side and how high it stands, under a step so it is walked onto.
MOORING_M = 3.4
MOORING_HIGH_M = 0.3


def floor(module, west, south, east, north, top=0.0, deep=1.2, material='paving', wear=0.02):
    """A floor slab from west to east and south to north, its top at `top`, one part."""
    at = ((west + east) / 2, (south + north) / 2, top - deep)
    return kit.block(module, at, (east - west, north - south, deep), material, bevel=0.0, wear=wear)


def paving(module, west, south, east, north, top=0.0, broken=0.06):
    """Old flags laid in rows of their own lengths over a floor's top, a few cracked away to the silt under them;
    drawn only, the floor's part under them."""
    y = south
    while y < north - 0.3:
        deep = min(module.draw(1.4, 2.4), north - y)
        x = west
        while x < east - 0.3:
            long = min(module.draw(1.6, 3.0), east - x)
            if module.draw() > broken:
                lift = module.draw(-0.03, 0.02)
                kit.block(module, (x + long / 2, y + deep / 2, top - 0.12 + lift), (long - 0.07, deep - 0.07, 0.12),
                          'paving', bevel=0.0, wear=0.0, part=False, turn=module.draw(-0.01, 0.01))
            x += long
        y += deep


def wall(module, west, south, east, north, bottom=-1.2, high=WALL_M, material='stone', courses=True):
    """A wall of the old vale's cut stone, one part from `bottom` to `high`, its string courses drawn every 1.6 m."""
    at = ((west + east) / 2, (south + north) / 2, bottom)
    item = kit.block(module, at, (east - west, north - south, high - bottom), material, bevel=0.04, wear=0.03)
    if courses:
        thin = 0.12
        z = 1.6
        while z < high - 0.4:
            grown = (east - west + (thin if east - west < north - south else 0.0),
                     north - south + (thin if north - south <= east - west else 0.0), 0.16)
            kit.block(module, (at[0], at[1], z), grown, 'trim', bevel=0.0, wear=0.0, part=False)
            z += 1.6
    return item


def flight_run(rise):
    """How far a flight runs to climb `rise` metres."""
    return max(1, round(rise / RISE_M)) * RUN_M


def stair(module, foot, way, width, z_from, z_to):
    """A flight from `foot` (x, y at the front of its first tread) along `way` from `z_from` up to `z_to`."""
    steps = max(1, round((z_to - z_from) / RISE_M))
    kit.stair(module, (foot[0], foot[1], z_from), way, width, (z_to - z_from) / steps, RUN_M, steps, wear=0.02)
    return steps * RUN_M


def mooring(module, name, at):
    """A mooring stone: a squat round-cornered slab under a step's height, ringed in iron, an iron ring on a post at its
    back where the old vale tied its boats; its socket at its top's middle."""
    x, y, z = at
    kit.block(module, (x, y, z), (MOORING_M, MOORING_M, MOORING_HIGH_M), 'trim', bevel=0.12, wear=0.02)
    kit.block(module, (x, y, z + MOORING_HIGH_M), (MOORING_M - 0.8, MOORING_M - 0.8, 0.03), 'stone', bevel=0.0,
              wear=0.0, part=False)
    for side in range(4):
        angle = side * math.pi / 2
        edge = (x + math.cos(angle) * (MOORING_M / 2 - 0.08), y + math.sin(angle) * (MOORING_M / 2 - 0.08))
        size = (0.08, MOORING_M - 0.3, 0.05) if side % 2 == 0 else (MOORING_M - 0.3, 0.08, 0.05)
        kit.block(module, (*edge, z + MOORING_HIGH_M - 0.02), size, 'iron', bevel=0.0, wear=0.0, part=False)
    kit.column(module, (x, y + MOORING_M / 2 - 0.35, z + MOORING_HIGH_M), 0.12, 0.7, 'iron', sides=8, part=False)
    ring = bpy_ring(module, (x, y + MOORING_M / 2 - 0.35, z + MOORING_HIGH_M + 0.8), 0.22, 0.04)
    module.socket(name, (x, y, z + MOORING_HIGH_M), (0.0, 1.0))
    return ring


def bpy_ring(module, at, radius, thick, material='iron'):
    """An iron ring standing upright, facing y."""
    kit.bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thick, major_segments=12, minor_segments=5,
                                         location=at, rotation=(math.pi / 2, 0.0, 0.0))
    ring = kit.bpy.context.active_object
    module.objects.append(ring)
    module.slots[ring.name] = [(material, 0.0)]
    return ring


def plinth(module, name, at):
    """The Lodestone's plinth: a stepped stone drum, iron-banded, its socket on its top where the stone rests."""
    x, y, z = at
    kit.column(module, (x, y, z), 0.9, 0.35, 'trim', sides=16, part=False)
    kit.column(module, (x, y, z + 0.35), 0.6, 0.75, 'stone', sides=16, part=False)
    kit.column(module, (x, y, z + 0.6), 0.62, 0.08, 'iron', sides=16, part=False)
    kit.column(module, (x, y, z + 1.1), 0.72, 0.12, 'trim', sides=16, part=False)
    module.part((x - 0.6, y - 0.6, z), (x + 0.6, y + 0.6, z + 1.22))
    module.socket(name, (x, y, z + 1.22), (0.0, 1.0))


def bell_frame(module, name, at, facing):
    """A timber frame a crystal bell hangs in, set on a low stone foot: two posts and a beam across, braced; its
    socket on the foot's top before the frame, where the bell stands for the rules. `facing` the way it looks out."""
    x, y, z = at
    across = (facing[1], -facing[0])
    kit.block(module, (x, y, z), (1.8, 1.8, 0.4), 'stone', bevel=0.05, wear=0.03)
    for side in (-1, 1):
        post = (x + across[0] * 1.0 * side, y + across[1] * 1.0 * side, z + 0.4)
        kit.block(module, post, (0.22, 0.22, 3.4), 'timber', bevel=0.02, wear=0.0, part=False)
    beam = (x, y, z + 3.6)
    size = (2.4, 0.26, 0.26) if abs(across[0]) > 0.5 else (0.26, 2.4, 0.26)
    kit.block(module, beam, size, 'timber', bevel=0.02, wear=0.0, part=False)
    kit.column(module, (x, y, z + 3.0), 0.05, 0.6, 'iron', sides=6, part=False)
    module.socket(name, (x, y, z + 0.4), facing)


def lectern(module, name, at):
    """A writing desk of the old vale's stone on a round step, where the Scrivener writes itself; its socket the step's
    middle, where a body stands to blot it."""
    x, y, z = at
    kit.column(module, (x, y, z), 2.6, 0.2, 'trim', sides=20, part=False)
    module.part((x - 1.8, y - 1.8, z), (x + 1.8, y + 1.8, z + 0.2))
    kit.block(module, (x, y + 1.4, z + 0.2), (1.0, 0.6, 1.1), 'stone', bevel=0.05, wear=0.03, part=False)
    kit.block(module, (x, y + 1.35, z + 1.3), (1.2, 0.8, 0.08), 'stone', bevel=0.02, wear=0.0, part=False)
    module.socket(name, (x, y, z + 0.2), (0.0, 1.0))


def rift(module, name, at, facing, wide=5.0, high=7.5):
    """A rift's arch of old stone, heavy and round-headed, its jambs parts; the rift itself the page draws in its
    opening. Its socket on the floor in the opening's middle, `facing` out of it."""
    x, y, z = at
    across = (facing[1], -facing[0])
    for side in (-1, 1):
        jamb = (x + across[0] * (wide / 2 + 0.7) * side, y + across[1] * (wide / 2 + 0.7) * side, z)
        size = (1.4, 1.6, high) if abs(across[0]) > 0.5 else (1.6, 1.4, high)
        kit.block(module, jamb, size, 'stone', bevel=0.06, wear=0.03)
    lintel = kit.block(module, (x, y, z + high - 1.2),
                       (wide + 2.8, 1.6, 2.6) if abs(across[0]) > 0.5 else (1.6, wide + 2.8, 2.6), 'trim', bevel=0.05,
                       wear=0.02, part=False)
    kit.cut(lintel, kit.cylinder_cutter((x, y, z + high - 1.6), wide / 2, 3.0, along_y=abs(across[0]) <= 0.5))
    module.socket(name, (x, y, z), facing)


def crystal(module, pick, base, count=6, length=2.4, radius=0.5, up=(0.0, 0.0, 1.0), spread=0.6, dim=1.0):
    """A burst of the Lattice's red crystal from `base`, its shards up to `length` long."""
    materials = latticekit.kinds()
    return latticekit.cluster(module, materials, pick, base, up, count, (length * 0.6, length), radius, spread, dim)


def crust(module, pick, centre, reach, dim=0.8):
    """Ground gone to crystal round `centre`."""
    return latticekit.crust(module, latticekit.kinds(), pick, centre, reach, dim)


def cottage(module, at, wide, deep, turn_quarter, high=4.0, broken=0.4):
    """A drowned cottage of the old vale: chalk walls on a stone foot, broken down toward one end, the stumps of its
    roof timbers over it, a door gap in its front; every wall a part to its broken height."""
    x, y, z = at
    quarter = turn_quarter % 2
    w, d = (wide, deep) if quarter == 0 else (deep, wide)
    thick = 0.5
    door = 1.4
    sides = ((x, y - d / 2 + thick / 2, w, thick, 'front'), (x, y + d / 2 - thick / 2, w, thick, 'back'),
             (x - w / 2 + thick / 2, y, thick, d - thick * 2, 'side'), (x + w / 2 - thick / 2, y, thick, d - thick * 2,
                                                                       'side'))
    for number, (sx, sy, sw, sd, kind) in enumerate(sides):
        fall = 1.0 - broken * (number / 3)
        tall = max(1.2, high * fall + module.draw(-0.4, 0.2))
        if kind == 'front':
            for half in (-1, 1):
                span = (sw - door) / 2
                cx = sx + half * (door / 2 + span / 2)
                kit.block(module, (cx, sy, z), (span, sd, tall), 'chalk', bevel=0.05, wear=0.05)
        else:
            kit.block(module, (sx, sy, z), (sw, sd, tall), 'chalk', bevel=0.05, wear=0.05)
        kit.block(module, (sx, sy, z), (sw + 0.1, sd + 0.1, 0.6), 'stone', bevel=0.04, wear=0.04, part=False)
    for rafter in range(int(w // 1.6)):
        rx = x - w / 2 + 0.8 + rafter * 1.6
        if module.draw() < 0.6:
            kit.block(module, (rx, y, z + high - 0.1), (0.18, d + 0.4, 0.2), 'timber', bevel=0.0, wear=0.0, part=False,
                      turn=module.draw(-0.05, 0.05))


def drowned_floor(module, west, south, east, north, top=0.0):
    """Still water lying a hand deep over flags, silt heaped at its edges: drawn only."""
    kit.block(module, ((west + east) / 2, (south + north) / 2, top + 0.02), (east - west, north - south, 0.04),
              'water', bevel=0.0, wear=0.0, part=False)


def facet_rock(module, at, size, material='rubble', points=16, turn=0.0, dip=(0.0, 0.0)):
    """A rock split along flat faces: the hull of points drawn near the corners and over the faces of a box `size` on
    `at` (its foot's middle), so it keeps a block's mass and reads as broken stone, not a pebble; turned `turn` and
    dipped `dip` (radians about x and y) as its bed lies. Drawn only."""
    made = kit.bmesh.new()
    for corner in range(points):
        pick = corner % 8
        point = [(pick & 1) - 0.5, ((pick >> 1) & 1) - 0.5, float((pick >> 2) & 1)]
        if corner >= 8:
            axis = module.random.randrange(3)
            point = [module.draw(-0.5, 0.5), module.draw(-0.5, 0.5), module.draw(0.0, 1.0)]
            point[axis] = (-0.5 if module.draw() < 0.5 else 0.5) + (0.5 if axis == 2 else 0.0)
        # Each point pulled in toward the middle, by more at its corners, so no face stays square.
        pull = module.draw(0.0, 0.34)
        x = point[0] * (1.0 - pull) * size[0]
        y = point[1] * (1.0 - module.draw(0.0, 0.3)) * size[1]
        z = (0.5 + (point[2] - 0.5) * (1.0 - module.draw(0.0, 0.25))) * size[2]
        made.verts.new((x, y, z))
    hull = kit.bmesh.ops.convex_hull(made, input=made.verts)
    loose = [each for each in hull['geom_interior'] if isinstance(each, kit.bmesh.types.BMVert)]
    kit.bmesh.ops.delete(made, geom=loose, context='VERTS')
    mesh = kit.bpy.data.meshes.new('facet')
    made.to_mesh(mesh)
    made.free()
    item = kit.item_of(module, f'facet{len(module.objects)}', mesh, material)
    item.location = at
    item.rotation_euler = (dip[0], dip[1], turn)
    return item


def rock_face(module, west, south, east, north, bottom, top, seed=0, triangles=None, face=None, ragged=True):
    """The vale's rock filling a box, drawn only (the wall or ledge it dresses carries the part): beds of split stone
    from `bottom` to `top`, each bed its own height, its blocks set in and out and dipping a little as the beds lie.
    With `face` (the way it looks out, along x or y) each bed stands back from the one under it, as a cliff leans;
    `ragged` breaks the last bed's tops into a skyline, else they end level at `top` for a body to stand on."""
    del seed, triangles  # Its blocks are sized by its beds, and laid by the module's own draws in order.
    along_x = east - west >= north - south
    length = (east - west) if along_x else (north - south)
    deep = (north - south) if along_x else (east - west)
    dip = (module.draw(-0.05, 0.05), module.draw(-0.05, 0.05))
    z = bottom
    while z < top - 0.3:
        bed = min(module.draw(1.6, 3.0), top - z)
        last = z + bed >= top - 0.3
        back = 0.0 if face is None else -(z - bottom) * 0.1
        offset = -length / 2
        while offset < length / 2 - 0.4:
            long = min(bed * module.draw(1.0, 2.0), 7.0)
            # The bed's last block runs to the box's end rather than leave a sliver after it.
            end = length / 2 - offset < long * 1.4
            if end:
                long = length / 2 - offset
            middle = offset + long / 2
            tall = bed * module.draw(1.02, 1.25) * (2.0 if not last and module.draw() < 0.12 else 1.0)
            if last and ragged:
                tall += module.draw(0.0, 1.8)
            elif last:
                tall = top - z + 0.15
            # A deep box is filled by rows of blocks across it, none much deeper than it is long.
            rows = max(1, math.ceil(deep / 4.0))
            for row_across in range(rows):
                thick = deep / rows * module.draw(0.85, 1.15)
                across = (row_across + 0.5) / rows * deep - deep / 2 + module.draw(-0.12, 0.12) * deep / rows
                material = 'stone' if module.draw() < 0.14 else 'rubble'
                rise = tall * module.draw(0.85, 1.1) if rows > 1 and (last and ragged) else tall
                if along_x:
                    lean = 0.0 if face is None else back * face[1]
                    at = ((west + east) / 2 + middle, (south + north) / 2 + across - lean, z - 0.15)
                    facet_rock(module, at, (long, thick, rise), material, turn=module.draw(-0.08, 0.08), dip=dip)
                else:
                    lean = 0.0 if face is None else back * face[0]
                    at = ((west + east) / 2 + across - lean, (south + north) / 2 + middle, z - 0.15)
                    facet_rock(module, at, (long, thick, rise), material,
                               turn=math.pi / 2 + module.draw(-0.08, 0.08), dip=dip)
            if end:
                break
            offset += long * module.draw(0.8, 0.95)
        z += bed
    if face is None:
        return
    # Buttresses of the same rock standing out of a cliff's face every few metres, up from its foot.
    offset = -length / 2 + module.draw(2.0, 6.0)
    while offset < length / 2 - 2.0:
        wide, out, tall = module.draw(3.0, 5.5), module.draw(1.5, 2.8), (top - bottom) * module.draw(0.35, 0.8)
        front = (west if face[0] < 0 else east) if not along_x else (south if face[1] < 0 else north)
        if along_x:
            at = ((west + east) / 2 + offset, front + face[1] * out / 2, bottom)
        else:
            at = (front + face[0] * out / 2, (south + north) / 2 + offset, bottom)
        facet_rock(module, at, (wide, out * 1.6, tall), 'rubble', points=20,
                   turn=(0.0 if along_x else math.pi / 2) + module.draw(-0.15, 0.15))
        offset += module.draw(7.0, 11.0)


def shaft(module, at, radius, height, lesser=5):
    """A shaft of the Lattice's crystal grown up from `at`: a tall split prism, its seven faces each a little off true,
    narrowing to a broken point, and lesser shafts leaning out from its foot. Drawn only."""
    made = kit.bmesh.new()
    sides = 7
    for ring, (share, width) in enumerate(((0.0, 1.0), (0.18, 0.92), (0.7, 0.62), (0.9, 0.34))):
        for side in range(sides):
            angle = math.tau * (side + module.draw(-0.12, 0.12)) / sides + ring * 0.08
            reach = radius * width * module.draw(0.9, 1.08)
            made.verts.new((math.cos(angle) * reach, math.sin(angle) * reach, share * height))
    made.verts.new((radius * 0.12, -radius * 0.08, height))
    kit.bmesh.ops.convex_hull(made, input=made.verts)
    mesh = kit.bpy.data.meshes.new('shaft')
    made.to_mesh(mesh)
    made.free()
    item = kit.item_of(module, f'shaft{len(module.objects)}', mesh, 'crystal', glow=0.35)
    item.location = at
    for number in range(lesser):
        angle = math.tau * (number + module.draw(0.0, 0.6)) / lesser
        foot = (at[0] + math.cos(angle) * radius * 0.8, at[1] + math.sin(angle) * radius * 0.8, at[2])
        tall = height * module.draw(0.18, 0.34)
        lean = module.draw(0.25, 0.5)
        made = kit.bmesh.new()
        for ring, width in ((0.0, 1.0), (0.75, 0.7), (1.0, 0.15)):
            for side in range(5):
                turn = math.tau * side / 5 + module.draw(-0.2, 0.2)
                made.verts.new((math.cos(turn) * radius * 0.3 * width, math.sin(turn) * radius * 0.3 * width,
                                ring * tall))
        kit.bmesh.ops.convex_hull(made, input=made.verts)
        mesh = kit.bpy.data.meshes.new('shard')
        made.to_mesh(mesh)
        made.free()
        shard = kit.item_of(module, f'shard{len(module.objects)}', mesh, 'crystal', glow=0.25)
        shard.location = foot
        shard.rotation_euler = (lean * -math.sin(angle), lean * math.cos(angle), 0.0)
    return item


def arch(module, at, radius, deep, thick, stones=11, material='trim', turn=0.0, pointed=False, broken=0):
    """An arch of wedged stones, its springing line's middle at `at`, `radius` to its stones' inner edge (half its
    span), `deep` through and `thick` from inner edge to outer, facing south (Blender's -y) turned `turn` about z; round,
    or `pointed` as two arcs struck from a third of the span in from each side meeting at its crown. The keystone is a
    little proud; `broken` stones fallen from its crown leave its springers standing. Drawn only."""
    if pointed:
        centre, reach = radius * 0.5, radius * 1.5
        crown = math.acos(-centre / reach)
        half = stones // 2
        arcs = [(-centre, (math.pi - crown) * k / half, (math.pi - crown) * (k + 1) / half) for k in range(half)]
        # The second arc from the crown down, so the stones run springer to springer.
        arcs += [(centre, math.pi - (math.pi - crown) * (half - k) / half, math.pi - (math.pi - crown) * (half - k - 1)
                  / half) for k in range(half)]
    else:
        reach = radius
        arcs = [(0.0, math.pi * k / stones, math.pi * (k + 1) / stones) for k in range(stones)]
    cosine, sine = math.cos(turn), math.sin(turn)
    fallen = set()
    if broken:
        crown = len(arcs) / 2
        fallen = {number for number in range(len(arcs)) if abs(number + 0.5 - crown) < broken / 2}
    for number, (middle, start, end) in enumerate(arcs):
        if number in fallen:
            continue
        key = number == stones // 2 if not pointed else number in (len(arcs) // 2 - 1, len(arcs) // 2)
        made = kit.bmesh.new()
        corners = []
        for angle in (start + 0.006, end - 0.006):
            for out in (reach, reach + thick * (1.25 if key else 1.0)):
                for y in (-deep / 2 - (0.08 if key else 0.0), deep / 2):
                    x, z = middle + math.cos(angle) * out, math.sin(angle) * out
                    corners.append(made.verts.new((x * cosine - y * sine, x * sine + y * cosine, z)))
        kit.bmesh.ops.convex_hull(made, input=corners)
        mesh = kit.bpy.data.meshes.new('voussoir')
        made.to_mesh(mesh)
        made.free()
        item = kit.item_of(module, f'voussoir{len(module.objects)}', mesh, material)
        item.location = at


def dry_wall(module, at, long, along_x, high):
    """A field wall laid dry: courses of fieldstones of their own sizes, each split stone set a little off the line,
    and its coping stones set on edge; its middle at `at`, `long` along x or y. Drawn only, its part the caller's."""
    z = 0.0
    course = 0
    while z < high - 0.35:
        tall = module.draw(0.28, 0.4)
        offset = -long / 2 + (0.2 if course % 2 else 0.0)
        while offset < long / 2 - 0.15:
            length = min(module.draw(0.45, 0.9), long / 2 - offset)
            middle = offset + length / 2
            across = module.draw(-0.06, 0.06)
            spot = (at[0] + middle, at[1] + across, z) if along_x else (at[0] + across, at[1] + middle, z)
            facet_rock(module, spot, (length * 1.05, 0.78, tall * 1.08), 'stone', points=10,
                       turn=(0.0 if along_x else math.pi / 2) + module.draw(-0.1, 0.1))
            offset += length
        z += tall
        course += 1
    offset = -long / 2
    while offset < long / 2 - 0.1:
        spot = (at[0] + offset + 0.17, at[1], z) if along_x else (at[0], at[1] + offset + 0.17, z)
        facet_rock(module, spot, (0.3, 0.7, high - z + 0.1), 'stone', points=8,
                   turn=(0.0 if along_x else math.pi / 2) + module.draw(-0.15, 0.15))
        offset += 0.34
