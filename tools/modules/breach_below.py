"""The Drowned Vale's first spaces past the Sunken Gate, each laid square to its frame (Blender's, y north) with its
way in at its south: the Descent down the old mill race, the Mending's drowned green, and the Choir's chapel. Every
floor, wall, flight and piece a body meets is a part; every piece the rules stand on is named by its socket.
"""
import math

import breach_dress
import breach_kit as bk
import breach_lore
import breach_town
import kit
import latticekit

HIGH = 9.0


def descent(module):
    """Down the mill race: a cut way, a drop of 3 m, the fallen wheel across a gap with a ledge off it (the line's
    chest), a flight down, a gap a running jump crosses, and a last flight down to the green's door."""
    def sides(south, north, floor_top):
        # Each side's mass drawn only as a backing behind the split rock breach_dress lays over its face.
        for west, east in ((-6.0, -4.0), (4.0, 6.0)):
            bk.solid(module, west, south, east, north, floor_top - 1.2, floor_top + 6.0)
            back = west if west < 0 else east - 0.5
            kit.block(module, (back + 0.25, (south + north) / 2, floor_top - 1.2), (0.5, north - south, 7.2), 'rubble',
                      bevel=0.0, wear=0.0, part=False)

    bk.floor(module, -4.0, -34.0, 4.0, -18.0, top=0.0)
    sides(-36.0, -18.0, 0.0)
    bk.wall(module, -6.0, -36.0, 6.0, -34.0, bottom=-1.2, high=6.0, material='rubble', courses=False)
    bk.floor(module, -4.0, -18.0, 4.0, -6.0, top=-3.0)
    sides(-18.0, -6.0, -3.0)
    # The fallen wheel across the gap, and the ledge off it to the east where the line is tied.
    kit.block(module, (0.0, 0.0, -3.6), (2.0, 12.0, 0.6), 'timber', bevel=0.02, wear=0.02)
    bk.floor(module, 3.6, -2.0, 8.0, 4.0, top=-3.0, material='rubble')
    module.socket('chest-descent', (6.4, 1.0, -3.0), (-1.0, 0.0))
    bk.floor(module, -4.0, 6.0, 4.0, 12.6, top=-3.0)
    bk.floor(module, -4.0, 12.6, 4.0, 24.0, top=-6.0)
    run = bk.flight_run(3.0)
    bk.stair(module, (0.0, 12.6 + run), (0, -1), 7.6, -6.0, -3.0)
    sides(6.0, 24.0, -6.0)
    # The gap a running jump crosses, and the last flight down to the door onto the green.
    bk.floor(module, -4.0, 26.4, 4.0, 30.0, top=-6.4)
    bk.floor(module, -4.0, 30.0, 4.0, 40.0, top=-10.0)
    bk.stair(module, (0.0, 30.0 + bk.flight_run(3.6)), (0, -1), 7.6, -10.0, -6.4)
    sides(26.4, 40.0, -10.0)
    module.socket('entry', (0.0, -32.0, 0.0), (0.0, -1.0))
    module.socket('arrival', (0.0, -29.0, 0.0), (0.0, 1.0))
    module.socket('start', (0.0, -26.0, 0.0), (0.0, 1.0))
    module.socket('exit', (0.0, 40.0, -10.0), (0.0, 1.0))
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for base in ((-3.4, -10.0, -3.0), (3.0, 20.0, -6.0), (-3.2, 38.0, -10.0), (0.0, 2.6, -4.4)):
        bk.crystal(module, pick, base, count=5, length=1.8, radius=0.4)
    for spoke in range(8):
        angle = spoke * math.pi / 4
        kit.block(module, (0.0, 0.0, bk.WHEEL_Z), (0.25, 5.6, 0.25), 'timber', turn=angle, bevel=0.0, wear=0.0,
                  part=False).rotation_euler = (bk.WHEEL_TILT, 0.0, angle)
    bk.drowned_floor(module, -4.0, 36.0, 4.0, 40.0, top=-10.0)
    breach_dress.descent(module)
    breach_lore.line(module)


def mending(module):
    """The drowned green: a square of the old hamlet walled by its houses' backs, three seams in it, cottages for cover,
    a well, and four street mouths the overtaken come out of."""
    bk.floor(module, -30.0, -30.0, 30.0, 30.0, material='rubble')
    for west, south, east, north in ((-34.0, -34.0, -30.0, 34.0), (30.0, -34.0, 34.0, 34.0),
                                     (-30.0, -34.0, -3.0, -30.0), (3.0, -34.0, 30.0, -30.0),
                                     (-30.0, 30.0, -3.0, 34.0), (3.0, 30.0, 30.0, 34.0)):
        bk.wall(module, west, south, east, north, high=HIGH, material='plaster')
    bk.floor(module, -3.0, -36.0, 3.0, -30.0)
    bk.floor(module, -3.0, 30.0, 3.0, 36.0)
    for at, wide, deep, turn in (((-21.0, 21.0, 0.0), 7.0, 5.0, 0), ((21.0, 21.0, 0.0), 7.0, 5.0, 0),
                                 ((-22.0, -20.0, 0.0), 6.0, 5.0, 1), ((22.0, -20.0, 0.0), 6.0, 5.0, 1),
                                 ((-9.0, 8.0, 0.0), 5.0, 4.0, 0), ((9.0, 8.0, 0.0), 5.0, 4.0, 0)):
        bk.cottage(module, at, wide, deep, turn, high=3.6)
    kit.column(module, (0.0, -8.0, 0.0), 1.1, 0.9, 'stone', sides=16)
    for name, at in (('seam-north', (0.0, 18.0, 0.0)), ('seam-west', (-18.0, -4.0, 0.0)),
                     ('seam-east', (18.0, -4.0, 0.0))):
        module.socket(name, at, (0.0, -1.0))
    for number, at in enumerate(((-27.0, -27.0), (27.0, -27.0), (-27.0, 27.0), (27.0, 27.0)), start=1):
        module.socket(f'mouth-{number}', (*at, 0.0), (0.0, 1.0))
    module.socket('entry', (0.0, -36.0, 0.0), (0.0, -1.0))
    module.socket('checkpoint', (0.0, -28.0, 0.0), (0.0, 1.0))
    module.socket('mender', (0.0, 4.0, 0.0), (0.0, -1.0))
    module.socket('chest', (5.0, -2.0, 0.0), (0.0, -1.0))
    module.socket('exit', (0.0, 36.0, 0.0), (0.0, 1.0))
    # The seal across the way on stands in the doorway, through its walls' thickness.
    module.socket('seal', (0.0, 32.0, 0.0), (0.0, 1.0))
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for x, y in ((0.0, 18.0), (-18.0, -4.0), (18.0, -4.0)):
        bk.crust(module, pick, (x, y, 0.02), 2.4)
    for x, y in ((-27.0, -27.0), (27.0, -27.0), (-27.0, 27.0), (27.0, 27.0)):
        bk.crystal(module, pick, (x, y, 0.0), count=6, length=2.6, radius=0.5)
    for west, south, east, north in ((-30.0, -30.0, -12.0, -12.0), (12.0, -30.0, 30.0, -12.0), (-12.0, 12.0, 12.0, 30.0)):
        bk.drowned_floor(module, west, south, east, north)
    breach_dress.mending(module)
    breach_lore.green(module)
    breach_town.green(module)


BELLS_Y = (-18.0, -2.0, 14.0)
# How far east the side door's causeway runs: the streets it leads to stand clear of the Mending's green beside them.
SIDE_DOOR_M = 35.0
LECTERNS = ((0.0, 29.7, 1.2), (-8.0, -20.0, 0.0), (8.0, -20.0, 0.0), (-8.0, 10.0, 0.0), (8.0, 10.0, 0.0))


def choir(module):
    """The chapel of a vale that never had one: a nave between rows of pillars, seven bells in timber frames down its
    walls and on its altar, the font in the middle of the nave, five desks the Scrivener writes at, the Lodestone's
    plinth before the altar on a raised apse, and a side door onto a causeway to the old streets."""
    bk.floor(module, -16.0, -32.0, 16.0, 26.0)
    for west, south, east, north in ((-20.0, -36.0, -16.0, 38.0), (16.0, -36.0, 20.0, -26.0), (16.0, -20.0, 20.0, 38.0),
                                     (-16.0, -36.0, -2.5, -32.0), (2.5, -36.0, 16.0, -32.0), (-16.0, 36.0, 16.0, 38.0)):
        bk.wall(module, west, south, east, north, high=12.0)
    bk.floor(module, -2.5, -38.0, 2.5, -32.0)
    bk.floor(module, 16.0, -26.0, SIDE_DOOR_M, -20.0)
    # The apse: a dais up a broad flight across the nave's head.
    kit.block(module, (0.0, 31.0, 0.0), (32.0, 10.0, 1.2), 'trim', bevel=0.04, wear=0.02)
    bk.stair(module, (0.0, 26.0 - bk.flight_run(1.2)), (0, 1), 12.0, 0.0, 1.2)
    for x in (-10.0, 10.0):
        for y in (-24.0, -12.0, 0.0, 12.0, 22.0):
            kit.column(module, (x, y, 0.0), 0.75, 11.0, 'stone', sides=14)
    for row_y in (-27.0, -15.0, -3.0, 5.0):
        for side in (-1, 1):
            kit.block(module, (side * 4.5, row_y, 0.0), (5.0, 0.7, 0.9), 'timber', bevel=0.02, wear=0.02)
    for number, (x, y) in enumerate(((-13.0, BELLS_Y[0]), (-13.0, BELLS_Y[1]), (-13.0, BELLS_Y[2]), (13.0, BELLS_Y[0]),
                                     (13.0, BELLS_Y[1]), (13.0, BELLS_Y[2])), start=1):
        bk.bell_frame(module, f'bell-{number}', (x, y, 0.0), (-math.copysign(1.0, x), 0.0))
    bk.bell_frame(module, 'bell-7', (0.0, 34.4, 1.2), (0.0, -1.0))
    for number, at in enumerate(LECTERNS, start=1):
        bk.lectern(module, f'lectern-{number}', at)
    bk.plinth(module, 'plinth', (0.0, 26.9, 1.2))
    module.part((-2.0, bk.ALTAR_Y - 0.8, 1.2), (2.0, bk.ALTAR_Y + 0.8, 2.3))
    kit.column(module, (0.0, -6.0, 0.0), 2.6, 0.25, 'trim', sides=24, part=False)
    kit.block(module, (0.0, -6.0, 0.05), (3.6, 3.6, 0.06), 'water', bevel=0.0, wear=0.0, part=False)
    module.socket('font', (0.0, -6.0, 0.0), (0.0, 1.0))
    module.socket('scrivener', (0.0, LECTERNS[0][1], 1.4), (0.0, -1.0))
    for number, at in enumerate(((-13.0, -30.0), (13.0, -30.0), (-13.0, 24.0), (13.0, 24.0)), start=1):
        module.socket(f'mouth-{number}', (*at, 0.0), (0.0, 1.0))
    module.socket('entry', (0.0, -38.0, 0.0), (0.0, -1.0))
    module.socket('checkpoint', (0.0, -30.0, 0.0), (0.0, 1.0))
    module.socket('chest', (-7.5, 23.0, 0.0), (0.0, -1.0))
    module.socket('chest-page', (5.0, 32.0, 1.2), (0.0, -1.0))
    module.socket('exit', (SIDE_DOOR_M, -23.0, 0.0), (1.0, 0.0))
    module.socket('seal', (18.0, -23.0, 0.0), (1.0, 0.0))
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for base in ((-15.0, 30.0, 1.2), (15.0, 30.0, 1.2), (-15.4, -30.0, 0.0), (15.4, -10.0, 0.0)):
        bk.crystal(module, pick, base, count=6, length=2.8, radius=0.5)
    for x in (-10.0, 10.0):
        kit.block(module, (x, 0.0, 11.0), (1.2, 52.0, 1.2), 'timber', bevel=0.02, wear=0.0, part=False)
    breach_dress.choir(module)
