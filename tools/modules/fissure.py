"""The Fissure's props: the crack the Lattice tears in a down (`lattice-fissure`), the scar it leaves as the seal closes
it (`lattice-fissure-sealed`), the growth that rises out of the ground for the heroic (`lattice-growth`) and the shard
a player carries to the seal (`lattice-shard`). The ground is a chalk down: slabs of turf over a hand of dark soil
over white chalk, torn up and tilted back from a chasm lined with the Lattice's red crystal, its heart alight at the
bottom. The crystal is the Lattice's own, built by its code (latticekit).

The chasm goes down under the module's foot, where the land stands: its mouth, the outline of the crack at the
ground, is written to the manifest so the page can open the land there and show the chasm (`mouth`).
"""
import math
import random

import kit
import latticekit

# The crack: its length along x, its widest half-width and its deepest, metres; the stations it is laid out on.
LENGTH_M = 12.0
HALF_WIDE_M = 2.0
DEEP_M = 2.8
STATIONS = 48
# The rows a wall is cut in, lip to floor, and each row's material: crystal from the lip down, dim at the lip and
# brightening to the heart, so the far wall seen across the mouth from eye height reads as a red slit from afar.
WALL_ROWS = (('crystal', 0.2), ('crystal', 0.35), ('crystal', 0.5), ('crystal', 0.62), ('crystal', 0.75),
             ('crystal', 0.88), ('crystal', 1.0))
# The torn slabs: how far apart along a lip, and the most they are tipped back from the chasm, radians. Those at the
# lip lie nearly flat and few, so a player walking up, or looking down from a height, sees past the near lip into
# the crack; a row further back is tipped a little more.
SLAB_EVERY_M = 1.25
SLAB_TIP = 0.1
SLAB_TIP_BACK = 0.36
# How far a wall narrows from its lip to the floor, as a share of the lip's half-width: the floor stays wide enough
# that its light is seen from above.
NARROWS = 0.6
# The soil under the turf, and the turf itself, metres down from a slab's top.
TURF_M = 0.07
SOIL_M = 0.2


def crack(seed=7):
    """The crack's line: each station's x, the middle of the crack across, its half-widths north and south and its
    depth. The same for the open fissure and its scar, so the scar lies where the crack was."""
    draw = random.Random(seed)
    stations = []
    phase = draw.uniform(0, math.tau)
    for k in range(STATIONS + 1):
        x = -LENGTH_M / 2 + LENGTH_M * k / STATIONS
        share = abs(x) / (LENGTH_M / 2 + 0.1)
        wide = HALF_WIDE_M * (1 - share ** 2) ** 0.65 + 0.05
        middle = 0.4 * math.sin(x * 0.55 + phase) + 0.12 * math.sin(x * 1.9 + phase * 2)
        north = wide * draw.uniform(0.78, 1.18)
        south = wide * draw.uniform(0.78, 1.18)
        deep = DEEP_M * (1 - share ** 2) ** 0.5 + 0.25
        stations.append((x, middle, north, south, deep))
    return stations


def chasm(module, stations):
    """The chasm's walls from each lip down to its floor, crystal from the lip down brightening as it goes, and its
    floor, the crystal's heart. The walls are cut jagged: each row stands in or out of the straight fall by noise."""
    draw = random.Random(module.random.random())
    rows = len(WALL_ROWS)
    points, faces, kinds = [], [], []
    columns = {}
    for side, sign in (('north', 1), ('south', -1)):
        for k, (x, middle, north, south, deep) in enumerate(stations):
            half = north if side == 'north' else south
            for row in range(rows + 1):
                share = row / rows
                # The wall falls steeply, then turns in to a narrow floor; jagged by its own draw.
                across = half * (1 - NARROWS * share ** 1.4) + (draw.uniform(-0.12, 0.12) * half if 0 < row < rows else 0)
                z = -deep * share
                columns[side, k, row] = len(points)
                points.append((x, middle + sign * across, z))
    for side in ('north', 'south'):
        for k in range(STATIONS):
            for row in range(rows):
                faces.append((columns[side, k, row], columns[side, k + 1, row], columns[side, k + 1, row + 1],
                              columns[side, k, row + 1]))
                kinds.append(row)
    floor = len(WALL_ROWS)
    for k in range(STATIONS):
        faces.append((columns['north', k, rows], columns['north', k + 1, rows], columns['south', k + 1, rows],
                      columns['south', k, rows]))
        kinds.append(floor)
    for k in (0, STATIONS):   # the ends, closed between the walls
        for row in range(rows):
            faces.append((columns['north', k, row], columns['north', k, row + 1], columns['south', k, row + 1],
                          columns['south', k, row]))
            kinds.append(row)
    by_station = {round(s[0], 6): s for s in stations}

    def inward(middle):
        x = min(by_station, key=lambda key: abs(key - middle[0]))
        _, centre, _, _, deep = by_station[x]
        return (0.0, centre - middle[1], max(0.0, -deep * 0.3 - middle[2]) + 0.6)

    item = kit.solid_of(module, 'chasm', points, kit.oriented(points, faces, inward))
    for polygon, kind in zip(item.data.polygons, kinds):
        polygon.material_index = kind
    kit.faced(module, item, [*WALL_ROWS, ('crystal', 1.0)])
    lips = [[(x, middle + north, 0.0) for x, middle, north, _, _ in stations],
            [(x, middle - south, 0.0) for x, middle, _, south, _ in stations]]
    module.mouth = lips
    return lips


def slab(module, at, heading, along, out, thick, tip, sunk=0.08):
    """A slab of the down torn up: an outline of seven torn corners, turf on top over a band of dark soil over chalk,
    tipped `tip` radians back about its outer edge (`at`, on the ground) so the edge toward the chasm stands up, a
    fringe of turf and roots hanging off that edge. `heading` turns its own +y (toward the chasm) from north."""
    draw = module.random
    corners = []
    for k in range(7):
        angle = math.tau * k / 7 + draw.uniform(-0.25, 0.25)
        corners.append((math.cos(angle) * along / 2 * draw.uniform(0.75, 1.0),
                        out / 2 + math.sin(angle) * out / 2 * draw.uniform(0.75, 1.0)))
    levels = (0.0, -TURF_M, -SOIL_M, -thick)
    points = [(x, y, z) for z in levels for x, y in corners]
    faces, kinds = [], []
    faces.append(tuple(range(7)))   # top, turf
    kinds.append(1)
    faces.append(tuple(3 * 7 + k for k in reversed(range(7))))   # bottom, chalk
    kinds.append(0)
    for level in range(3):
        for k in range(7):
            j = (k + 1) % 7
            faces.append((level * 7 + j, level * 7 + k, (level + 1) * 7 + k, (level + 1) * 7 + j))
            kinds.append((1, 2, 0)[level])
    # Turf and roots torn and hanging off the edge toward the chasm, each a narrow wedge.
    for k in range(9):
        x = draw.uniform(-along * 0.4, along * 0.4)
        y = out * draw.uniform(0.86, 0.98)
        hang = draw.uniform(0.12, 0.32)
        wide = draw.uniform(0.03, 0.08)
        base = len(points)
        points += [(x - wide, y, -0.02), (x + wide, y, -0.02), (x + draw.uniform(-0.04, 0.04), y + 0.03, -hang)]
        faces.append((base, base + 1, base + 2))
        kinds.append(1)
    middle = (0.0, out / 2, -thick / 2)
    item = kit.solid_of(module, 'slab', points, kit.oriented(points, faces, lambda m: tuple(
        m[axis] - middle[axis] for axis in range(3))))
    for polygon, kind in zip(item.data.polygons, kinds):
        polygon.material_index = kind
    kit.faced(module, item, [('chalk', 0.0), ('turf', 0.0), ('rubble', 0.0)])
    item.location = (at[0], at[1], at[2] - sunk)
    item.rotation_euler = (tip, draw.uniform(-0.08, 0.08), heading)
    bevel = item.modifiers.new('bevel', 'BEVEL')
    bevel.width = 0.025
    bevel.segments = 1
    bevel.limit_method = 'ANGLE'
    return item


def slabs(module, stations, tip_most, sunk=0.08, keep=1.0, beyond=0.0, smaller=1.0):
    """The slabs torn up along both lips, every SLAB_EVERY_M, tipped most near the crack's middle; a second row
    stands `beyond` further back, `smaller`."""
    draw = module.random
    for sign in (1, -1):
        x = -LENGTH_M / 2 + draw.uniform(0.3, 0.9)
        while x < LENGTH_M / 2 - 0.6:
            k = min(STATIONS, max(0, round((x + LENGTH_M / 2) / LENGTH_M * STATIONS)))
            _, middle, north, south, _ = stations[k]
            nxt = stations[min(STATIONS, k + 1)]
            way = math.atan2(nxt[1] - middle, LENGTH_M / STATIONS)
            along = draw.uniform(1.0, 1.75) * smaller
            out = draw.uniform(0.9, 1.7) * smaller * (0.55 + 0.45 * (1 - abs(x) / (LENGTH_M / 2)))
            thick = draw.uniform(0.5, 0.85)
            tip = tip_most * draw.uniform(0.5, 1.0) * (0.45 + 0.55 * (1 - abs(x) / (LENGTH_M / 2)))
            lip = middle + sign * (north if sign > 0 else south)
            if draw.random() < keep:
                # The outer edge lies `out` back from the lip as the slab stands tipped; its +y points into the crack.
                back = out * math.cos(tip) + 0.05 + beyond
                at = (x - math.sin(way) * back * sign, lip + sign * back * math.cos(way), 0.0)
                heading = way + (math.pi if sign > 0 else 0.0)
                slab(module, at, heading, along, out, thick, tip, sunk)
            x += SLAB_EVERY_M * draw.uniform(0.85, 1.15)


def rubble(module, m, pick, stations, count, reach):
    """Chalk broken out of the crack: lumps on the turf round it, the biggest nearest its lips."""
    draw = module.random
    for _ in range(count):
        x, middle, north, south, _ = stations[draw.randrange(len(stations))]
        sign = draw.choice((1, -1))
        out = (north if sign > 0 else south) + draw.uniform(0.2, reach)
        size = draw.uniform(0.05, 0.2) * (1.3 if out < 2.4 else 1.0)
        latticekit.boulder(module, m, pick, (x + draw.uniform(-0.4, 0.4), middle + sign * out, size * 0.45),
                           (size, size * draw.uniform(0.6, 1.0), size * draw.uniform(0.6, 0.95)), 14)


def veins(module, stations, count):
    """Crystal crept out from the crack's lips through the turf: each vein a forking line of light lying in the grass,
    its bright core between dark crystal edges, narrowing as it runs out."""
    draw = module.random
    for _ in range(count):
        k = draw.randrange(4, STATIONS - 4)
        x, middle, north, south, _ = stations[k]
        sign = draw.choice((1, -1))
        heading = math.pi / 2 * sign + draw.uniform(-0.9, 0.9)
        point = (x, middle + sign * ((north if sign > 0 else south) + 0.15))
        wide = draw.uniform(0.05, 0.09)
        for _branch in range(draw.choice((1, 2))):
            path = [point]
            way = heading + draw.uniform(-0.3, 0.3)
            for _step in range(draw.randrange(5, 10)):
                way += draw.uniform(-0.45, 0.45)
                step = draw.uniform(0.2, 0.4)
                path.append((path[-1][0] + math.cos(way) * step, path[-1][1] + math.sin(way) * step))
            points, faces, kinds = [], [], []
            for j, (px, py) in enumerate(path):
                a = path[max(0, j - 1)]
                b = path[min(len(path) - 1, j + 1)]
                along = math.atan2(b[1] - a[1], b[0] - a[0])
                nx, ny = -math.sin(along), math.cos(along)
                half = wide * (1 - j / len(path)) + 0.008
                # Across: dark edge, bright core, dark edge, its core a hair over the turf.
                for across, z in ((-2.2, 0.012), (-0.6, 0.02), (0.6, 0.02), (2.2, 0.012)):
                    points.append((px + nx * half * across, py + ny * half * across, z))
            for j in range(len(path) - 1):
                for lane in range(3):
                    a, b = j * 4 + lane, (j + 1) * 4 + lane
                    faces.append((a, a + 1, b + 1, b))
                    kinds.append(1 if lane == 1 else 0)
            item = kit.solid_of(module, 'vein', points, kit.oriented(points, faces, lambda middle: (0.0, 0.0, 1.0)))
            for polygon, kind in zip(item.data.polygons, kinds):
                polygon.material_index = kind
            kit.faced(module, item, [('crystal', 0.05), ('crystal', 0.95)])
            heading += draw.uniform(-0.8, 0.8)


def fissure(module):
    """The open crack: some 12 m long and 4 across at its widest, nearly 3 m deep; turf and chalk slabs lying low
    along its lips, a few more tipped up further back; crystal teeth leaning in over it, clusters grown out of its
    walls and spires standing up out of its heart, crusts of crystal crept out across the turf at either end."""
    m = latticekit.kinds()
    pick = latticekit.picker(module.random.randrange(1 << 30))
    stations = crack()
    chasm(module, stations)
    slabs(module, stations, SLAB_TIP, keep=0.5)
    slabs(module, stations, SLAB_TIP_BACK, sunk=0.12, keep=0.55, beyond=1.8, smaller=0.75)
    rubble(module, m, pick, stations, 46, 2.6)
    veins(module, stations, 14)
    draw = module.random
    for k, (x, middle, north, south, deep) in enumerate(stations):
        if k in (0, STATIONS):
            continue
        for sign, half in ((1, north), (-1, south)):
            # Teeth on the lip, leaning low in over the crack, so they frame the chasm rather than wall it.
            if draw.random() < 0.3:
                latticekit.shard(module, m, (x + draw.uniform(-0.12, 0.12), middle + sign * half * 0.94, -0.2),
                                 (draw.uniform(-0.3, 0.3), -sign * draw.uniform(0.7, 1.2), 0.45),
                                 draw.uniform(0.2, 0.7) * (0.4 + half), draw.uniform(0.04, 0.1), draw.uniform(0, 3))
            # Clusters grown out of the walls, low down, pointing up and in, their points under the lip.
            if k % 3 == 1:
                share = draw.uniform(0.45, 0.8)
                latticekit.cluster(module, m, pick, (x, middle + sign * half * (1 - NARROWS * share ** 1.4) * 0.9,
                                                     -deep * share), (0.0, -sign * 0.6, 1.0), 4,
                                   (0.3, 0.5 + deep * 0.2), 0.08, 0.5)
    # Spires out of the heart, standing a little over the ground, their roots crowded with shards: seen over the lip
    # from afar, never a ridge that hides the crack.
    for x, lean, tall in ((-2.6, (0.25, 0.3, 1.0), 1.3), (0.4, (-0.1, -0.25, 1.0), 1.9), (3.1, (-0.3, 0.2, 1.0), 1.1),
                          (-0.9, (0.35, -0.2, 1.0), 0.8)):
        k = round((x + LENGTH_M / 2) / LENGTH_M * STATIONS)
        _, middle, _, _, deep = stations[k]
        latticekit.shard(module, m, (x, middle, -deep), lean, tall + deep, 0.3, draw.uniform(0, 3), widest=0.55)
        latticekit.cluster(module, m, pick, (x, middle, -deep * 0.85), (0.0, 0.0, 1.0), 7, (0.5, 1.4), 0.1, 0.8)
        module.part((x - 0.2, middle - 0.2, 0.0), (x + 0.2, middle + 0.2, tall * 0.6))
    # The heart's light, seen down the crack.
    for x in (-4.5, -3.0, -1.5, 0.0, 1.5, 3.0, 4.5):
        k = round((x + LENGTH_M / 2) / LENGTH_M * STATIONS)
        _, middle, _, _, deep = stations[k]
        latticekit.light(module, m, (x, middle, -deep + 0.2), 0.36, 2)
    # Crystal crept out across the turf past the crack's ends and along it.
    for x in (-LENGTH_M / 2 - 0.6, LENGTH_M / 2 + 0.6):
        latticekit.crust(module, m, pick, (x, 0.0, 0.0), 1.3)
        latticekit.ring_of(module, m, pick, (x, 0.0, 0.0), 0.9, 7, (0.15, 0.55), 0.05, 0.9)
    for x in (-3.5, 1.8):
        for sign in (1, -1):
            latticekit.crust(module, m, pick, (x, sign * 2.9, 0.0), 0.7)


def sealed(module):
    """The scar the crack leaves as the seal closes it: where the crack was, a low ridge of dark soil heaved up along
    the line with grey-white chalk broken and heaped on it, dull stubs of dark crystal standing out of it, their glow
    dying; the slabs settled back nearly flat, the teeth broken off and lying in the grass, and the crust it crept out
    across the turf at either end dulled."""
    m = latticekit.kinds()
    pick = latticekit.picker(module.random.randrange(1 << 30))
    stations = crack()
    draw = random.Random(module.random.random())
    # The seam itself: dark soil and broken chalk heaved up along the line in a low ridge, narrowing to its ends.
    ridge = []
    for k in range(2, STATIONS - 1, 2):
        x, middle, north, south, _ = stations[k]
        wide = min(north, south)
        ridge.append(((x, middle, -0.05), (0.55, 0.3 + wide * 0.3, 0.1 + wide * 0.07)))
    kit.organic(module, ridge, draw.uniform(0, 99), voxel=0.12, rough=0.06, triangles=2400)
    for k in range(1, STATIONS):
        x, middle, north, south, _ = stations[k]
        wide = min(north, south)
        for _ in range(3):   # the chalk heaped along the seam
            size = draw.uniform(0.12, 0.3) * (0.5 + wide / HALF_WIDE_M)
            latticekit.boulder(module, m, pick, (x + draw.uniform(-0.15, 0.15), middle + draw.uniform(-0.6, 0.6) * wide,
                                                 size * 0.3), (size, size * draw.uniform(0.6, 1.0), size * 0.6), 14)
        if draw.random() < 0.45:   # a stub of the crystal it was sealed with, broken off short
            latticekit.shard(module, m, (x, middle + draw.uniform(-0.3, 0.3) * wide, -0.05),
                             (draw.uniform(-0.4, 0.4), draw.uniform(-0.4, 0.4), 1.0), draw.uniform(0.12, 0.38),
                             draw.uniform(0.05, 0.11), draw.uniform(0, 3), widest=0.8, dim=0.05)
    module.part((-LENGTH_M / 2, -1.5, 0.0), (LENGTH_M / 2, 1.5, 0.35))
    slabs(module, stations, 0.14, sunk=0.03, keep=0.7)
    rubble(module, m, pick, stations, 50, 1.8)
    for _ in range(20):   # the teeth broken off, lying in the grass
        x, middle, north, south, _ = stations[draw.randrange(1, STATIONS)]
        sign = draw.choice((1, -1))
        out = (north if sign > 0 else south) + draw.uniform(0.1, 1.6)
        turn = draw.uniform(0, math.tau)
        latticekit.shard(module, m, (x, middle + sign * out, 0.04), (math.cos(turn), math.sin(turn), 0.12),
                         draw.uniform(0.2, 0.7), draw.uniform(0.04, 0.08), draw.uniform(0, 3), dim=0.08)
    # The crust it crept out across the turf, its glow nearly gone, past either end of the seam.
    for x in (-LENGTH_M / 2 - 0.4, LENGTH_M / 2 + 0.4):
        latticekit.crust(module, m, pick, (x, 0.0, 0.0), 0.9, dim=0.1)


def growth(module):
    """The heroic's growth: a spire of crystal some 5 m high out of a heave of chalk, four lesser spires leaning out
    from its root, shards crowding its foot, the turf round it crusted and tipped up."""
    m = latticekit.kinds()
    pick = latticekit.picker(module.random.randrange(1 << 30))
    draw = module.random
    latticekit.shard(module, m, (0.0, 0.0, -0.4), (0.06, 0.04, 1.0), 5.4, 0.62, 0.2, widest=0.42)
    for k in range(5):
        turn = math.tau * k / 5 + draw.uniform(-0.3, 0.3)
        away = (math.cos(turn), math.sin(turn))
        latticekit.shard(module, m, (away[0] * 0.55, away[1] * 0.55, -0.3), (away[0] * 0.45, away[1] * 0.45, 1.0),
                         draw.uniform(2.0, 3.6), draw.uniform(0.24, 0.36), turn, widest=0.5)
    latticekit.cluster(module, m, pick, (0.0, 0.0, 0.1), (0.0, 0.0, 1.0), 16, (0.6, 1.8), 0.13, 0.95)
    latticekit.cluster(module, m, pick, (0.2, 0.1, 2.2), (0.3, 0.0, 1.0), 6, (0.3, 0.8), 0.07, 0.7)
    latticekit.ring_of(module, m, pick, (0.0, 0.0, 0.0), 1.6, 12, (0.2, 0.7), 0.06, 0.8)
    for k in range(9):   # the chalk it heaved up as it rose
        turn = math.tau * k / 9 + draw.uniform(-0.2, 0.2)
        out = draw.uniform(1.0, 1.7)
        size = draw.uniform(0.25, 0.5)
        latticekit.boulder(module, m, pick, (math.cos(turn) * out, math.sin(turn) * out, size * 0.3),
                           (size, size * 0.8, size * 0.6))
    latticekit.crust(module, m, pick, (0.0, 0.0, 0.0), 2.4)
    for k in range(10):   # the turf it broke through, tipped up round it
        turn = math.tau * k / 10 + draw.uniform(-0.15, 0.15)
        out = draw.uniform(1.9, 2.4)
        slab(module, (math.cos(turn) * out, math.sin(turn) * out, 0.0), turn + math.pi / 2, draw.uniform(0.8, 1.3),
             draw.uniform(0.8, 1.2), draw.uniform(0.35, 0.55), draw.uniform(0.25, 0.6))
    module.part((-0.5, -0.5, 0.0), (0.5, 0.5, 4.5))


def shard(module):
    """The shard a player carries to the seal: a hand's length of the Lattice's crystal, half a metre, two lesser
    points grown off its root."""
    m = latticekit.kinds()
    latticekit.shard(module, m, (0.0, 0.0, 0.03), (0.05, 0.0, 1.0), 0.5, 0.065, 0.4, widest=0.4)
    latticekit.shard(module, m, (0.03, 0.02, 0.03), (0.55, 0.2, 1.0), 0.22, 0.035, 1.1, widest=0.4)
    latticekit.shard(module, m, (-0.02, -0.02, 0.03), (-0.5, -0.35, 1.0), 0.16, 0.03, 2.0, widest=0.4)
    module.part((-0.05, -0.05, 0.0), (0.05, 0.05, 0.45))
