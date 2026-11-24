"""The Unlit Ways' town as it is drawn: each house bricked shut a house of its own, in plaster, stone, chalk or rubble,
some a storey higher under a jettied upper floor, some with their roofs fallen in to the rafters, ridges either way;
its doors bricked in porches deep enough to wait in and its windows bricked up, the Lattice's crystal grown through
some, a hand of water lying in its streets, the old lamp-stands where the Watchers keep their posts and dead lamps at
other crossings. Drawn only but for its porches' jambs: each house's part is the box its builder lays
(breach_above.ways), the town's own over it.
"""
import math

import breach_dress
import breach_kit as bk
import fittings
import kit
import latticekit
import shapes

WALLS = ('plaster', 'stone', 'chalk', 'rubble')
# A house's walls stand as high as its part; its roof starts there.
EAVE_M = 5.2
# Crossings no Watcher or mouth stands at, where a dead lamp still stands at a corner.
LAMPS = ((-24.0, -12.0), (-12.0, -12.0), (-12.0, 12.0), (0.0, 0.0), (12.0, -24.0), (12.0, 12.0), (24.0, 12.0))
# Streets and a square where the water lies a hand deep: (west, south, east, north).
POOLS = ((-10.0, -26.0, 10.0, -22.0), (-11.0, -11.0, -3.0, -3.0), (14.0, 10.0, 34.0, 14.0), (22.0, -22.0, 26.0, -14.0),
         (-34.0, 22.0, -26.0, 26.0), (-26.0, -10.0, -22.0, 10.0))


def roof(module, at, half, eave, rise, along_x, ends, fallen=False):
    """A pitched roof over a square house's walls, from its eaves at `eave` (0.4 m past the walls) up `rise` to a
    ridge along x or y, gable ends of `ends` under it; `fallen`, one slope gone to its bare rafters."""
    x, y = at
    run = half + 0.4
    pitch = math.atan2(rise, half)
    slope = math.hypot(run, rise * run / half)
    for side in (-1, 1):
        middle = (x, y + side * run / 2) if along_x else (x + side * run / 2, y)
        middle = (*middle, eave + rise - rise * run / half / 2)
        turn = (-side * pitch, 0.0, 0.0) if along_x else (0.0, side * pitch, 0.0)
        if fallen and side > 0:
            for rafter in range(4):
                along = (rafter - 1.5) * half * 0.55
                spot = (middle[0] + along, middle[1], middle[2]) if along_x else (middle[0], middle[1] + along,
                                                                                  middle[2])
                size = (0.16, slope, 0.16) if along_x else (slope, 0.16, 0.16)
                shapes.slab(module, spot, size, 'timber', turn=turn)
            continue
        size = (half * 2 + 0.8, slope, 0.16) if along_x else (slope, half * 2 + 0.8, 0.16)
        shapes.slab(module, middle, size, 'roof', turn=turn)
    for end in (-1, 1):
        spot = (x + end * (half - 0.25), y, eave) if along_x else (x, y + end * (half - 0.25), eave)
        shapes.cutout(module, [(-half, 0.0), (half, 0.0), (0.0, rise)], 0.3, ends, spot,
                      turn=(0.0, 0.0, math.pi / 2) if along_x else (0.0, 0.0, 0.0))


# How far a porch's jambs stand out from its house's front: a body (0.35 m round) stands between them hidden from
# down the street, the jamb nearer a Watcher cutting its sight, which reads the parts.
PORCH_M = 1.0


def porch(module, at, front):
    """A bricked door in a porch of dressed stone standing PORCH_M out from the house's front at `front`, its jambs
    parts."""
    x, y = at, front
    kit.block(module, (x, y - 0.05, 0.0), (1.2, 0.14, 2.2), 'stone', bevel=0.02, wear=0.06, part=False)
    for side in (-1, 1):
        kit.block(module, (x + side * 0.78, y - PORCH_M / 2, 0.0), (0.3, PORCH_M, 2.6), 'trim', bevel=0.0, wear=0.0)
    kit.block(module, (x, y - PORCH_M / 2, 2.6), (1.9, PORCH_M, 0.25), 'trim', bevel=0.0, wear=0.0, part=False)


def window(module, at, facing, z):
    """A window bricked up flush with the wall whose face is at `at` (x, y), `facing` out of it along x or y: a dark
    infill under a lintel, over a sill. Drawn only."""
    x, y = at
    across_x = facing[1] != 0.0

    def size(long, out, tall):
        return (long, out, tall) if across_x else (out, long, tall)

    def spot(out, rise):
        return (x + facing[0] * out, y + facing[1] * out, z + rise)

    kit.block(module, spot(0.03, 0.0), size(0.9, 0.06, 1.2), 'rubble', bevel=0.0, wear=0.0, part=False)
    kit.block(module, spot(0.08, 1.2), size(1.3, 0.16, 0.22), 'trim', bevel=0.0, wear=0.0, part=False)
    kit.block(module, spot(0.1, -0.12), size(1.2, 0.2, 0.12), 'trim', bevel=0.0, wear=0.0, part=False)


def house(module, at, size, pick):
    """One shut house of the town on `at`, `size` square, drawn as its own draws choose."""
    x, y = at
    half = size / 2
    walls = WALLS[min(3, int(module.draw(0.0, 4.0)))]
    kind = module.draw()
    along_x = module.draw() < 0.5
    rise = module.draw(1.4, 2.6)
    kit.block(module, (x, y, 0.0), (size, size, EAVE_M), walls, bevel=0.05, wear=0.04, part=False)
    for door in (-1.5, 1.5):
        porch(module, x + door, y - half)
        # A window bricked up over each door, and two in its back.
        window(module, (x + door, y - half), (0.0, -1.0), 3.3)
        window(module, (x + door, y + half), (0.0, 1.0), 2.0)
    for side in (-1, 1):
        window(module, (x + side * half, y), (side, 0.0), 2.0)
    eave = EAVE_M
    if 0.3 <= kind < 0.55:
        # A storey more, its timber-framed upper floor jettied out over the street.
        kit.block(module, (x, y, EAVE_M - 0.1), (size + 0.6, size + 0.6, 0.2), 'timber', bevel=0.0, wear=0.0,
                  part=False)
        kit.block(module, (x, y, EAVE_M + 0.1), (size + 0.4, size + 0.4, 2.5), 'plaster', bevel=0.0, wear=0.0,
                  part=False)
        for corner_x in (-1, 1):
            for corner_y in (-1, 1):
                spot = (x + corner_x * (half + 0.12), y + corner_y * (half + 0.12), EAVE_M + 0.1)
                kit.block(module, spot, (0.3, 0.3, 2.5), 'timber', bevel=0.0, wear=0.0, part=False)
        for side in (-1, 1):
            kit.block(module, (x + side * (half + 0.25), y, 6.1), (0.12, 1.0, 1.0), 'timber', bevel=0.0, wear=0.0,
                      part=False)
        eave = EAVE_M + 2.6
    roof(module, at, half, eave, rise, along_x, walls if eave == EAVE_M else 'plaster', fallen=kind < 0.3)
    if kind >= 0.55:
        spot = (x + half / 2, y + half / 2, eave) if along_x else (x - half / 2, y + half / 2, eave)
        kit.block(module, spot, (0.7, 0.7, rise + 0.8), 'stone', bevel=0.03, wear=0.05, part=False)
    if module.draw() < 0.28:
        # The Lattice's crystal broken up through the house, out of its roof and its walls' foot.
        bk.crystal(module, pick, (x + module.draw(-1.5, 1.5), y + module.draw(-1.5, 1.5), eave - 0.6), count=6,
                   length=3.2, radius=0.6)
        side = 1 if module.draw() < 0.5 else -1
        bk.crystal(module, pick, (x + side * half, y + module.draw(-2.0, 2.0), 0.0), count=3, length=1.3, radius=0.3,
                   up=(side * 0.7, 0.0, 1.0))


def lamp(module, at, standing):
    """An old street lamp, dead: standing at a crossing's corner, or fallen by the stand a Watcher keeps."""
    x, y = at
    if standing:
        shapes.lathe(module, (x, y, 0.0), [(0.22, 0.0), (0.16, 0.12), (0.07, 0.3), (0.06, 3.2), (0.0, 3.2)], 'iron',
                     sides=6, smooth=False)
        shapes.rod(module, (x, y, 3.1), (x - 0.5, y, 3.1), 0.035, 'iron', sides=4)
        fittings.lantern(module, (x - 0.5, y, 2.45), size=0.3, hung_from=3.1, pane='black')
        return
    # The stand's foot under the Watcher dressed as a lamp's, its post broken off and lying in the street.
    kit.column(module, (x, y, 0.5), 0.7, 0.08, 'iron', sides=12, wear=0.0, part=False)
    shapes.rod(module, (x + 1.0, y + 0.4, 0.08), (x + 3.6, y + 1.1, 0.1), 0.07, 'iron', sides=6)
    kit.block(module, (x + 3.8, y + 1.15, 0.0), (0.32, 0.32, 0.36), 'black', turn=0.3, bevel=0.0, wear=0.0,
              part=False)


def ways(module, cells, half, house_m, watchers):
    """The town's houses, its lamps and stands, its standing water and the cobbles at its crossings, and the rock it
    hangs on."""
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for at in cells:
        house(module, at, house_m, pick)
    for x, y, _ in watchers:
        lamp(module, (x, y), False)
    for x, y in LAMPS:
        lamp(module, (x + 1.75, y + 1.75), True)
    for west, south, east, north in POOLS:
        bk.drowned_floor(module, west, south, east, north)
    for column in range(1, 6):
        for row in range(1, 6):
            spot = (-half + 12.0 * column, -half + 12.0 * row, -0.04)
            kit.block(module, spot, (3.6, 3.6, 0.08), 'paving', turn=math.pi / 4, bevel=0.0, wear=0.0, part=False)
    breach_dress.hanging(module, -30.0, -30.0, 30.0, 30.0, -1.2, 18.0)


SEAMS = (((0.0, 18.0), True), ((-18.0, -4.0), False), ((18.0, -4.0), False))
MOUTHS = ((-27.0, -27.0), (27.0, -27.0), (-27.0, 27.0), (27.0, 27.0))


def green(module):
    """The Mending's seams and mouths read at a glance: each seam a crack 7 m long torn in the turf, its lips heaved
    up and crystal grown along it; each mouth crystal climbing the corner of the houses' backs it comes out of."""
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for (x, y), along_x in SEAMS:
        kit.block(module, (x, y, -0.03), (7.0, 0.7, 0.06) if along_x else (0.7, 7.0, 0.06), 'black', bevel=0.0,
                  wear=0.0, part=False)
        for step in range(-3, 4):
            spot = (x + step, y, 0.0) if along_x else (x, y + step, 0.0)
            bk.crystal(module, pick, spot, count=3, length=1.7 - abs(step) * 0.2, radius=0.3, spread=0.5)
            for lip in (-1, 1):
                turf = (spot[0], spot[1] + lip * 0.6, 0.0) if along_x else (spot[0] + lip * 0.6, spot[1], 0.0)
                slab = kit.block(module, turf, (0.9, 0.5, 0.16) if along_x else (0.5, 0.9, 0.16), 'turf', bevel=0.0,
                                 wear=0.0, part=False)
                tilt = lip * module.draw(0.15, 0.35)
                slab.rotation_euler = (tilt, 0.0, 0.0) if along_x else (0.0, -tilt, 0.0)
    for x, y in MOUTHS:
        sign_x, sign_y = math.copysign(1.0, x), math.copysign(1.0, y)
        for far, z in ((1.0, 0.0), (2.6, 1.2), (1.6, 2.8), (3.6, 0.3), (1.1, 4.4)):
            bk.crystal(module, pick, (sign_x * 29.9, sign_y * (30.0 - far), z), count=3, length=2.2, radius=0.35,
                       up=(-sign_x * 0.8, 0.0, 1.0))
            bk.crystal(module, pick, (sign_x * (30.0 - far), sign_y * 29.9, z + 0.6), count=3, length=2.2,
                       radius=0.35, up=(0.0, -sign_y * 0.8, 1.0))
