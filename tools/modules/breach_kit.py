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


def rock_face(module, west, south, east, north, bottom, top, seed, triangles=1200):
    """A face of the cavern's rock along a box, roughed out of merged blobs, drawn only: the wall it dresses carries the
    part."""
    blobs = []
    along_x = east - west > north - south
    length = (east - west) if along_x else (north - south)
    count = max(2, int(length // 6))
    for k in range(count):
        share = (k + 0.5) / count
        middle = (west + (east - west) * share, (south + north) / 2, (bottom + top) / 2) if along_x else (
            (west + east) / 2, south + (north - south) * share, (bottom + top) / 2)
        blobs.append((middle, (length / count * 0.75, 2.2, (top - bottom) / 2) if along_x else
                      (2.2, length / count * 0.75, (top - bottom) / 2)))
    return kit.organic(module, blobs, seed, 'rubble', voxel=0.5, rough=0.6, triangles=triangles, flat_foot=bottom)
