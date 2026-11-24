"""The Sunken Gate: where the Drowned Vale is opened, in a hollow of the Gullwing Vale. A cliff of the vale's rock
stands across the hollow's north, an old doorway cut deep into it and sealed by the Lattice's crystal. Before it the
Spire, a column of red crystal grown up through a mill's broken stones, rises from a stepped dais, and three mooring
stones stand round it, ringed in iron, though no water has lain here in anyone's memory. Ledges of rock flank the
hollow, old standing stones ring its south, and field walls cross it. The way in is from the south, its first socket.
"""
import math

import breach_kit as bk
import kit
import latticekit

DAIS = (0.0, 0.0)
TIERS = ((14.0, 0.4), (11.0, 0.8), (8.0, 1.2))
CLIFF_SOUTH = 26.0
CLIFF_NORTH = 36.0
CLIFF_HALF = 26.0
CLIFF_TOP = 14.0
DOOR_HALF = 3.0
DOOR_HIGH = 8.0
DOOR_DEEP = 6.0
LEDGE_TOP = 3.0
# How far the cliff's mass and the ledges' are drawn back behind the rock laid over their faces.
SET_BACK = 2.4
LEDGE_BACK = 0.8
LEDGE_X = (22.0, 28.0)
LEDGE_Y = (-12.0, 18.0)
# The Spire's shaft, as wide as its part; the mooring stones, which the rock and the fieldstones keep clear of.
SPIRE_M = 1.5
# The east stone stands plainly nearest the cliff, where *Soundings* finds the words scratched on one.
MOORINGS = (('mooring-west', (-20.0, 2.0)), ('mooring-east', (19.5, 8.0)), ('mooring-south', (0.0, -19.0)))
FIELD_WALLS = (((-12.0, -12.0), 6.0, True), ((12.0, -12.0), 6.0, True), ((-13.0, 13.0), 5.0, True),
               ((13.0, 13.0), 5.0, True), ((-17.0, -1.0), 4.0, False), ((17.0, -1.0), 4.0, False))


def ground(module):
    """What a body stands on and runs into: the cliff and its doorway, the dais, the ledges and their flights, the
    field walls and the mill's foundation; the land held level under it all."""
    module.pad((-32.0, -34.0), (32.0, CLIFF_SOUTH), 0.0)
    # The cliff either side of the doorway, over it, and the doorway's sealed back. Past the doorway's surround the
    # cliff's mass is drawn set back behind the rock dressing lays over its face, so the split stone is the face.
    for sign in (-1, 1):
        west, east = sorted((sign * CLIFF_HALF, sign * (DOOR_HALF + 0.6)))
        bk.solid(module, west, CLIFF_SOUTH, east, CLIFF_NORTH, -2.0, CLIFF_TOP)
        for near, far, south in ((DOOR_HALF + 0.6, DOOR_HALF + 3.4, CLIFF_SOUTH),
                                 (DOOR_HALF + 3.4, CLIFF_HALF, CLIFF_SOUTH + SET_BACK)):
            at = (sign * (near + far) / 2, (south + CLIFF_NORTH) / 2, -2.0)
            kit.block(module, at, (far - near, CLIFF_NORTH - south, CLIFF_TOP + 2.0), 'rubble', bevel=0.0, wear=0.0,
                      part=False)
    bk.wall(module, -DOOR_HALF - 0.6, CLIFF_SOUTH + DOOR_DEEP, DOOR_HALF + 0.6, CLIFF_NORTH, bottom=-2.0,
            high=CLIFF_TOP, courses=False, material='rubble')
    kit.block(module, (0.0, CLIFF_SOUTH + DOOR_DEEP / 2, DOOR_HIGH), (DOOR_HALF * 2 + 1.2, DOOR_DEEP, CLIFF_TOP - DOOR_HIGH),
              'rubble', bevel=0.0, wear=0.0)
    bk.floor(module, -DOOR_HALF, CLIFF_SOUTH - 0.5, DOOR_HALF, CLIFF_SOUTH + DOOR_DEEP, top=0.05, material='paving')
    # The dais in three tiers, each a step up from the one round it.
    for side, top in TIERS:
        kit.block(module, (*DAIS, 0.0), (side, side, top), 'trim', bevel=0.05, wear=0.02)
    # The ledges against the hollow's sides, each up a flight at its south end.
    for sign in (-1, 1):
        west, east = sorted((sign * LEDGE_X[0], sign * LEDGE_X[1]))
        middle = (west + east) / 2
        bk.solid(module, west, LEDGE_Y[0], east, LEDGE_Y[1], 0.0, LEDGE_TOP)
        # Its mass drawn back from the face the rock dresses, its top level where a body stands.
        inner, outer = (west + LEDGE_BACK, east) if sign > 0 else (west, east - LEDGE_BACK)
        kit.block(module, ((inner + outer) / 2, (LEDGE_Y[0] + LEDGE_Y[1]) / 2, 0.0),
                  (outer - inner, LEDGE_Y[1] - LEDGE_Y[0], LEDGE_TOP), 'rubble', bevel=0.06, wear=0.05, part=False)
        run = round(LEDGE_TOP / bk.RISE_M) * bk.RUN_M
        bk.stair(module, (middle, LEDGE_Y[0] - run), (0, 1), 3.6, 0.0, LEDGE_TOP)
    # The old field walls, low enough to vault, laid dry of fieldstones; and the mill's foundation round the dais,
    # broken.
    for at, long, along_x in FIELD_WALLS:
        size = (long, 0.8, 1.1) if along_x else (0.8, long, 1.1)
        module.part((at[0] - size[0] / 2, at[1] - size[1] / 2, 0.0), (at[0] + size[0] / 2, at[1] + size[1] / 2, 1.1))
        bk.dry_wall(module, at, long, along_x, 1.1)
    for side in range(8):
        if side in (2, 6):
            continue
        angle = side * math.pi / 4 + math.pi / 8
        at = (DAIS[0] + 9.5 * math.cos(angle), DAIS[1] + 9.5 * math.sin(angle))
        along_x = abs(math.cos(angle)) < abs(math.sin(angle))
        size = (3.6, 0.7, module.draw(0.6, 1.0)) if along_x else (0.7, 3.6, module.draw(0.6, 1.0))
        kit.block(module, (*at, 0.0), size, 'stone', bevel=0.05, wear=0.1)


def pieces(module):
    """The Spire, the mooring stones and the sockets the rules and the page read. The first socket is the way in."""
    module.socket('way', (0.0, -33.0, 0.0), (0.0, -1.0))
    top = TIERS[-1][1]
    bk.shaft(module, (*DAIS, top), SPIRE_M, 16.0)
    module.part([DAIS[0] - SPIRE_M, DAIS[1] - SPIRE_M, top], [DAIS[0] + SPIRE_M, DAIS[1] + SPIRE_M, top + 16.0])
    for name, at in MOORINGS:
        bk.mooring(module, name, (*at, 0.0))
    module.socket('gate', (0.0, CLIFF_SOUTH + 1.0, 0.05), (0.0, -1.0))
    module.socket('arrival', (0.0, -28.0, 0.0), (0.0, 1.0))
    for number, at in enumerate(((-24.0, -24.0), (24.0, -24.0), (-19.0, 21.0), (19.0, 21.0)), start=1):
        module.socket(f'mouth-{number}', (*at, 0.0), (0.0, 1.0))
    for number, x in enumerate((-LEDGE_X[1] + 1.5, LEDGE_X[1] - 1.5), start=1):
        module.socket(f'perch-{number}', (x, 8.0, LEDGE_TOP), (-math.copysign(1.0, x), 0.0))


def doorway(module):
    """The old doorway cut in the cliff: dressed jambs carved in bands, a heavy lintel, and the seal's frame; the seal
    itself the page draws, lit while a company is inside."""
    for side in (-1, 1):
        x = side * (DOOR_HALF + 0.35)
        kit.block(module, (x, CLIFF_SOUTH - 0.2, 0.0), (0.7, 1.0, DOOR_HIGH), 'trim', bevel=0.05, wear=0.02, part=False)
        for band in range(5):
            kit.block(module, (x, CLIFF_SOUTH - 0.75, 0.8 + band * 1.5), (0.8, 0.12, 0.35), 'stone', bevel=0.02,
                      wear=0.0, part=False)
    kit.block(module, (0.0, CLIFF_SOUTH - 0.2, DOOR_HIGH), (DOOR_HALF * 2 + 2.2, 1.2, 1.4), 'trim', bevel=0.06,
              wear=0.02, part=False)
    kit.block(module, (0.0, CLIFF_SOUTH - 0.85, DOOR_HIGH + 0.4), (2.4, 0.15, 0.6), 'gold', bevel=0.01, wear=0.0,
              part=False)
    for step in range(3):
        kit.block(module, (0.0, CLIFF_SOUTH - 1.6 + step * 0.5, 0.0), (DOOR_HALF * 2 + 2.0 - step * 0.6, 0.5, 0.05),
                  'stone', bevel=0.01, wear=0.0, part=False)
    # Stepped pilasters either side, and over the lintel a relieving arch of wedged stones round a carved tympanum,
    # under a cornice the rock has half swallowed.
    for side in (-1, 1):
        for step, (wide, deep) in enumerate(((1.6, 1.4), (1.2, 1.8))):
            x = side * (DOOR_HALF + 1.0 + wide / 2 + step * 0.2)
            kit.block(module, (x, CLIFF_SOUTH - deep / 2 + 0.3, 0.0), (wide, deep, DOOR_HIGH + 1.4 - step * 0.4), 'trim',
                      bevel=0.04, wear=0.03, part=False)
        kit.block(module, (side * (DOOR_HALF + 1.9), CLIFF_SOUTH - 1.4, 0.0), (2.2, 1.4, 0.6), 'stone', bevel=0.05,
                  wear=0.04, part=False)
    bk.arch(module, (0.0, CLIFF_SOUTH - 0.5, DOOR_HIGH + 1.4), DOOR_HALF + 1.2, 1.1, 1.2, stones=13)
    kit.block(module, (0.0, CLIFF_SOUTH - 0.45, DOOR_HIGH + 1.4), (DOOR_HALF * 2 + 1.6, 0.6, DOOR_HALF + 0.6), 'stone',
              bevel=0.02, wear=0.02, part=False)
    bk.arch(module, (0.0, CLIFF_SOUTH - 0.78, DOOR_HIGH + 1.4), 1.6, 0.06, 0.16, stones=9, material='gold')
    kit.block(module, (0.0, CLIFF_SOUTH - 0.8, DOOR_HIGH + 1.9), (0.5, 0.06, 0.5), 'gold', turn=0.0, bevel=0.0,
              wear=0.0, part=False).rotation_euler = (0.0, math.pi / 4, 0.0)
    kit.block(module, (0.0, CLIFF_SOUTH - 0.9, DOOR_HIGH + DOOR_HALF + 2.9), (DOOR_HALF * 2 + 6.4, 1.6, 0.7), 'trim',
              bevel=0.05, wear=0.06, part=False)


def dressing(module):
    """The hollow's look: the cliff's rock face, standing stones round its south, the mill's millstone broken by the
    Spire, crystal crept from the Spire's foot and the seal, and the four growths the Lattice comes out of."""
    pick = latticekit.picker(module.random.randrange(1 << 30))
    # The cliff's face drawn from its part's south face, so no body walks into the rock.
    bk.rock_face(module, -CLIFF_HALF - 2.0, CLIFF_SOUTH, -DOOR_HALF - 3.4, CLIFF_SOUTH + 2.0, -0.5, CLIFF_TOP + 1.5,
                 face=(0.0, -1.0))
    bk.rock_face(module, DOOR_HALF + 3.4, CLIFF_SOUTH, CLIFF_HALF + 2.0, CLIFF_SOUTH + 2.0, -0.5, CLIFF_TOP + 1.5,
                 face=(0.0, -1.0))
    bk.rock_face(module, -DOOR_HALF - 3.4, CLIFF_SOUTH - 0.2, DOOR_HALF + 3.4, CLIFF_SOUTH + 2.0,
                 DOOR_HIGH + DOOR_HALF + 3.4, CLIFF_TOP + 1.5)
    bk.rock_face(module, -CLIFF_HALF, CLIFF_SOUTH + 2.0, CLIFF_HALF, CLIFF_NORTH, CLIFF_TOP - 3.0, CLIFF_TOP + 2.5)
    for sign in (-1, 1):
        west, east = sorted((sign * LEDGE_X[0], sign * (LEDGE_X[1] + 1.5)))
        bk.rock_face(module, west, LEDGE_Y[0] + 0.3, east, LEDGE_Y[1], -0.3, LEDGE_TOP, face=(-sign, 0.0),
                     ragged=False, clear=[at for _, at in MOORINGS])
        for drum in range(3):
            at = (sign * module.draw(23.5, 26.5), module.draw(-4.0, 14.0), LEDGE_TOP)
            kit.column(module, at, 0.55, 0.7, 'trim', sides=10, part=False).rotation_euler = (
                math.pi / 2, 0.0, module.draw(0.0, math.pi))
    # The ring of standing stones round the hollow's south, two of them pairs still bearing their lintels.
    for stone in range(9):
        angle = math.pi + math.pi * (stone + 0.5) / 9
        at = (31.0 * math.cos(angle), 31.0 * math.sin(angle) - 2.0, -0.4)
        along = (-math.sin(angle), math.cos(angle))
        if stone in (2, 6):
            for side in (-1, 1):
                foot = (at[0] + along[0] * 1.5 * side, at[1] + along[1] * 1.5 * side, -0.4)
                bk.facet_rock(module, foot, (1.1, 0.9, 4.0), 'stone', points=18, turn=angle + math.pi / 2)
            bk.facet_rock(module, (at[0], at[1], 3.5), (4.4, 1.0, 0.8), 'stone', points=16, turn=angle + math.pi / 2)
            continue
        lean = (module.draw(-0.1, 0.1), module.draw(-0.1, 0.1)) if stone % 4 else (0.0, 0.0)
        bk.facet_rock(module, at, (1.3, 0.9, module.draw(2.8, 4.6)), 'stone', points=18, turn=angle + math.pi / 2,
                      dip=lean)
    # Talus fallen from the cliff along its foot, clear of the doorway.
    for boulder in range(16):
        x = module.draw(-CLIFF_HALF + 1.0, CLIFF_HALF - 1.0)
        if abs(x) < DOOR_HALF + 4.0:
            continue
        size = module.draw(0.8, 2.2)
        at = (x, CLIFF_SOUTH - 1.8 - module.draw(0.0, 1.6), -0.2)
        bk.facet_rock(module, at, (size * 1.4, size, size * 0.8), 'rubble', points=14, turn=module.draw(0, math.pi))
    # Flags of the mill's yard still lying round the dais, and fieldstones fallen across the hollow.
    for flag in range(26):
        angle, reach = module.draw(0.0, math.tau), module.draw(8.0, 12.5)
        at = (DAIS[0] + reach * math.cos(angle), DAIS[1] + reach * math.sin(angle), -0.06)
        kit.block(module, at, (module.draw(1.0, 1.8), module.draw(0.8, 1.4), 0.1), 'paving', turn=angle, bevel=0.0,
                  wear=0.0, part=False)
    for stone in range(22):
        at = (module.draw(-29.0, 29.0), module.draw(-30.0, 22.0), -0.1)
        if abs(at[0]) < 9.0 and abs(at[1]) < 9.0 or any(math.dist(at[:2], spot) < 3.0 for _, spot in MOORINGS):
            continue
        size = module.draw(0.4, 1.0)
        bk.facet_rock(module, at, (size * 1.3, size, size * 0.7), 'rubble', points=12, turn=module.draw(0, math.pi))
    # Each tier of the dais banded below its lip, its corners set with squared blocks, its top worn smooth.
    for side, top in TIERS:
        half = side / 2
        for sign_x, sign_y in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            kit.block(module, (sign_x * (half - 0.35), sign_y * (half - 0.35), top - 0.02), (0.7, 0.7, 0.06), 'stone',
                      bevel=0.01, wear=0.0, part=False)
        for along_x in (True, False):
            for sign in (-1, 1):
                at = (0.0, sign * (half + 0.02), top - 0.22) if along_x else (sign * (half + 0.02), 0.0, top - 0.22)
                size = (side - 0.2, 0.06, 0.1) if along_x else (0.06, side - 0.2, 0.1)
                kit.block(module, at, size, 'gold' if side == TIERS[-1][0] else 'stone', bevel=0.0, wear=0.0,
                          part=False)
    kit.column(module, (2.6, -2.4, TIERS[-1][1]), 1.5, 0.45, 'stone', sides=18, part=False)
    kit.column(module, (-2.4, 2.8, TIERS[-1][1]), 1.4, 0.35, 'stone', sides=18, part=False)
    for base in ((1.3, -1.0, 1.2), (-1.4, 0.9, 1.2), (0.6, 1.4, 1.2)):
        bk.crystal(module, pick, base, count=5, length=2.4, radius=0.45)
    bk.crust(module, pick, (DAIS[0], DAIS[1], TIERS[-1][1] + 0.02), 3.6)
    for number in range(1, 5):
        socket = next(each for each in module.sockets if each['name'] == f'mouth-{number}')
        x, y, _ = socket['at']
        bk.crust(module, pick, (x, y, 0.02), 3.2)
        bk.crystal(module, pick, (x + 1.0, y + 0.6, 0.0), count=7, length=3.0, radius=0.55)
    bk.crust(module, pick, (0.0, CLIFF_SOUTH - 0.6, 0.06), 4.0)
    for base in ((-DOOR_HALF - 0.9, CLIFF_SOUTH - 0.9, 0.0), (DOOR_HALF + 0.9, CLIFF_SOUTH - 0.9, 0.0),
                 (-DOOR_HALF - 0.5, CLIFF_SOUTH - 0.9, DOOR_HIGH + 1.0)):
        bk.crystal(module, pick, base, count=4, length=1.6, radius=0.35, up=(0.0, -0.4, 1.0))


def build(module):
    pieces(module)
    ground(module)
    doorway(module)
    dressing(module)
