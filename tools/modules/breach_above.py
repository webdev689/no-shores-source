"""The Drowned Vale's deeper spaces, each laid square to its frame (Blender's, y north): the Unlit Ways, a maze of the
old town's streets between houses bricked shut; the Broken Stair of slabs hung over the dark; the keep's hall with its
two rifts and the Seam; the two shores, the hall as it was and as it is; and the Steward's court over the dark. Every
floor, wall, flight and piece a body meets is a part; every piece the rules stand on is named by its socket.
"""
import math

import breach_dress
import breach_kit as bk
import kit
import latticekit

CELL = 12.0
HOUSE = 8.0
# The houses of the Ways left standing, by cell (column, row from the south-west, 0 to 5): the rest are open squares.
OPEN_CELLS = {(2, 2), (3, 2), (2, 3)}
HEART_CELL = (3, 3)
# Where the streets are barred to make the way through a maze: (x, y, along x).
BARS = ((-12.0, 0.0, False), (12.0, -12.0, True), (0.0, 12.0, True), (-24.0, 12.0, False), (24.0, 0.0, False),
        (-12.0, -24.0, True), (12.0, 24.0, True), (0.0, -24.0, False))
WATCHERS = ((-24.0, 0.0, (1.0, 0.0)), (0.0, -12.0, (0.0, 1.0)), (12.0, 0.0, (-1.0, 0.0)), (0.0, 24.0, (0.0, -1.0)),
            (24.0, -24.0, (-1.0, 0.0)), (24.0, 24.0, (0.0, -1.0)))


def ways(module):
    """A grid of the old town's houses, bricked shut, between streets 4 m wide; three cells open as squares, the house
    at the heart left open with its chest, barricades across some streets, and the Watchers' posts at the crossings."""
    half = 3 * CELL
    bk.floor(module, -half, -half, half, half, material='paving')
    for west, south, east, north in ((-half - 4, -half - 4, -half, -2.0), (-half - 4, 2.0, -half, half + 4),
                                     (half, -half - 4, half + 4, -2.0), (half, 2.0, half + 4, half + 4),
                                     (-half, -half - 4, half, -half), (-half, half, half, half + 4)):
        bk.wall(module, west, south, east, north, high=6.0, material='plaster')
    bk.floor(module, -half - 6, -2.0, -half, 2.0)
    bk.floor(module, half, -2.0, half + 6, 2.0)
    shut = []
    for column in range(6):
        for row in range(6):
            x, y = -half + CELL * (column + 0.5), -half + CELL * (row + 0.5)
            if (column, row) in OPEN_CELLS:
                continue
            if (column, row) == HEART_CELL:
                bk.cottage(module, (x, y, 0.0), HOUSE, HOUSE, 0, high=5.0, broken=0.0)
                continue
            kit.block(module, (x, y, 0.0), (HOUSE, HOUSE, 5.2), 'plaster', bevel=0.05, wear=0.04)
            kit.block(module, (x, y, 5.2), (HOUSE + 0.4, HOUSE + 0.4, 0.4), 'roof', bevel=0.02, wear=0.0, part=False)
            shut.append((x, y))
            for door in range(2):
                face = (x + (door - 0.5) * 3.0, y - HOUSE / 2 - 0.05, 0.0)
                kit.block(module, face, (1.2, 0.14, 2.2), 'stone', bevel=0.02, wear=0.06, part=False)
    for x, y, along_x in BARS:
        kit.block(module, (x, y, 0.0), (4.2, 0.9, 2.4) if not along_x else (0.9, 4.2, 2.4), 'timber', bevel=0.03,
                  wear=0.05)
    for number, (x, y, facing) in enumerate(WATCHERS, start=1):
        kit.column(module, (x, y, 0.0), 0.9, 0.5, 'stone', sides=12)
        module.socket(f'watcher-{number}', (x, y, 0.5), facing)
    heart = (-half + CELL * (HEART_CELL[0] + 0.5), -half + CELL * (HEART_CELL[1] + 0.5))
    module.socket('heart', (heart[0], heart[1] + 1.0, 0.0), (0.0, -1.0))
    module.socket('entry', (-half - 6, 0.0, 0.0), (-1.0, 0.0))
    module.socket('checkpoint', (-half - 2, 0.0, 0.0), (1.0, 0.0))
    module.socket('exit', (half + 6, 0.0, 0.0), (1.0, 0.0))
    # The mouths the Lattice comes out of: open crossings near three corners, clear of the Watchers and barricades.
    for number, at in enumerate(((-24.0, 24.0), (24.0, -12.0), (-24.0, -24.0)), start=1):
        module.socket(f'mouth-{number}', (*at, 0.0), (0.0, 1.0))
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for x, y, _ in WATCHERS:
        bk.crust(module, pick, (x, y, 0.02), 1.8, dim=0.5)
    breach_dress.ways(module, shut, half, HOUSE)


# The Broken Stair, laid along x from its west door: landings 6 m square, three slabs 2.8 m square between each two a
# running jump apart (1.8 m), and a flight up between the landings of each pair, each rising 2.4 m; the middle and last
# slab of each run come and go (the Breach's plan times them), the first stands.
LANDING = 6.0
SLAB = 2.8
GAP = 1.8
RISE = 2.4
RUNS = 3


def stair_plan():
    """The Broken Stair's landings, as (west edge, top), and its slabs, as (x, top, steady)."""
    landings, slabs = [], []
    x, top = -50.0, 0.0
    for run in range(RUNS):
        landings.append((x, top))
        x += LANDING + GAP
        for nth in range(3):
            slabs.append((x + SLAB / 2, top, nth == 0))
            x += SLAB + GAP
        landings.append((x, top))
        x += LANDING + bk.flight_run(RISE)
        top += RISE
    landings.append((x, top))
    return landings, slabs


def stair(module):
    """Slabs of crystal-grown stone hung over the dark, from the Ways' door to the keep's: landings joined by flights
    up and by slabs a running jump apart, the steady ones here and the rest the Breach's plan lays; a slab off the
    north of the fourth landing holds the hidden chest."""
    landings, slabs = stair_plan()
    for west, top in landings:
        kit.block(module, (west + LANDING / 2, 0.0, top - 1.2), (LANDING, LANDING, 1.2), 'stone', bevel=0.06, wear=0.05)
    for number in range(RUNS):
        west, top = landings[2 * number + 1]
        bk.stair(module, (west + LANDING, 0.0), (1, 0), 2.6, top, top + RISE)
    phased = 0
    for x, top, steady in slabs:
        if steady:
            kit.block(module, (x, 0.0, top - 0.6), (SLAB, SLAB, 0.6), 'stone', bevel=0.05, wear=0.06)
        else:
            phased += 1
            module.socket(f'slab-{phased}', (x, 0.0, top), (0.0, 1.0))
    west, top = landings[3]
    hidden = (west + LANDING / 2, LANDING / 2 + GAP + SLAB / 2, top)
    kit.block(module, (hidden[0], hidden[1], top - 0.6), (SLAB, SLAB, 0.6), 'stone', bevel=0.05, wear=0.06)
    module.socket('chest-stair', hidden, (0.0, -1.0))
    first, last = landings[0], landings[-1]
    # The way in reaches as far west as the way out does east, so the ground round the Stair is its own to its doors.
    far = last[0] + LANDING + 4.0
    bk.floor(module, -far, -2.0, first[0], 2.0)
    bk.floor(module, last[0] + LANDING, -2.0, far, 2.0, top=last[1])
    module.socket('entry', (-far, 0.0, 0.0), (-1.0, 0.0))
    module.socket('start', (first[0] + 2.0, 0.0, 0.0), (1.0, 0.0))
    module.socket('exit', (far, 0.0, last[1]), (1.0, 0.0))
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for x, top, steady in slabs:
        if steady:
            bk.crystal(module, pick, (x, 0.0, top - 0.6), count=4, length=1.6, radius=0.3, up=(0.0, 0.0, -1.0))
    held = [(x, 0.0, top, SLAB) for x, top, steady in slabs if steady] + [(hidden[0], hidden[1], hidden[2], SLAB)]
    breach_dress.stair(module, landings, LANDING, held)


def hall(module):
    """The keep's hall: its floor between pillars, the Seam grown up in its middle, a rift's arch in each side wall
    with a mooring stone before it, the Lodestone's plinth, and the Steward's Door at its head."""
    bk.floor(module, -20.0, -26.0, 20.0, 26.0)
    for west, south, east, north in ((-24.0, -30.0, -20.0, 30.0), (20.0, -30.0, 24.0, 30.0), (-20.0, -30.0, -2.5, -26.0),
                                     (2.5, -30.0, 20.0, -26.0), (-20.0, 26.0, -3.0, 30.0), (3.0, 26.0, 20.0, 30.0)):
        bk.wall(module, west, south, east, north, high=12.0)
    bk.floor(module, -2.5, -32.0, 2.5, -26.0)
    bk.floor(module, -3.0, 26.0, 3.0, 32.0)
    # The Seam's part as wide as the crystal breach_dress.hall draws there.
    module.part([-bk.SEAM_M, -bk.SEAM_M, 0.0], [bk.SEAM_M, bk.SEAM_M, 9.0])
    for x in (-10.0, 10.0):
        for y in (-14.0, 14.0):
            kit.column(module, (x, y, 0.0), 0.8, 11.0, 'stone', sides=14)
    bk.rift(module, 'rift-was', (-19.0, 0.0, 0.0), (1.0, 0.0))
    bk.rift(module, 'rift-is', (19.0, 0.0, 0.0), (-1.0, 0.0))
    bk.mooring(module, 'mooring-was', (-13.0, 0.0, 0.0))
    bk.mooring(module, 'mooring-is', (13.0, 0.0, 0.0))
    bk.plinth(module, 'plinth', (0.0, -10.0, 0.0))
    module.socket('seam', (0.0, 0.0, 0.0), (0.0, -1.0))
    module.socket('warden', (0.0, 8.0, 0.0), (0.0, -1.0))
    module.socket('entry', (0.0, -32.0, 0.0), (0.0, -1.0))
    module.socket('checkpoint', (0.0, -24.0, 0.0), (0.0, 1.0))
    module.socket('chest', (6.0, -18.0, 0.0), (0.0, -1.0))
    module.socket('exit', (0.0, 32.0, 0.0), (0.0, 1.0))
    for number, at in enumerate(((-16.0, -22.0), (16.0, -22.0), (-16.0, 22.0), (16.0, 22.0)), start=1):
        module.socket(f'mouth-{number}', (*at, 0.0), (0.0, 1.0))
    pick = latticekit.picker(module.random.randrange(1 << 30))
    bk.crust(module, pick, (0.0, 0.0, 0.02), 3.2)
    for base in ((1.4, 1.0, 0.0), (-1.2, -1.3, 0.0)):
        bk.crystal(module, pick, base, count=6, length=2.6, radius=0.5)
    breach_dress.hall(module)


def shore(was):
    """A shore: the hall as it was (whole, its hearth lit) or as it is (drowned and overtaken), small and walled, the
    rift back in its south wall, its Keeper's post, the Lodestone's plinth and five bells' frames."""

    def build(module):
        bk.floor(module, -14.0, -14.0, 14.0, 14.0, material='paving' if was else 'rubble')
        for west, south, east, north in ((-18.0, -18.0, -14.0, 18.0), (14.0, -18.0, 18.0, 18.0),
                                         (-14.0, -18.0, -4.0, -14.0), (4.0, -18.0, 14.0, -14.0),
                                         (-14.0, 14.0, 14.0, 18.0)):
            bk.wall(module, west, south, east, north, high=10.0, material='stone' if was else 'rubble')
        bk.rift(module, 'rift', (0.0, -15.0, 0.0), (0.0, 1.0))
        # The rift's opening floored, so a body walking into it shut stands stranded, not fallen into the dark.
        bk.floor(module, -4.0, -18.0, 4.0, -14.0, material='paving' if was else 'rubble')
        bk.wall(module, -4.0, -19.0, 4.0, -18.0, high=10.0)
        bk.plinth(module, 'plinth', (0.0, -5.0, 0.0))
        for number, (x, y) in enumerate(((-10.0, 9.0), (10.0, 9.0), (-10.0, -4.0), (10.0, -4.0), (0.0, 11.0)), start=1):
            bk.bell_frame(module, f'bell-{number}', (x, y, 0.0), (0.0, -1.0) if number == 5 else (-math.copysign(1.0, x), 0.0))
        module.socket('arrival', (0.0, -11.0, 0.0), (0.0, 1.0))
        module.socket('keeper', (0.0, 5.0, 0.0), (0.0, -1.0))
        for number, at in enumerate(((-11.0, 12.0), (11.0, 12.0)), start=1):
            module.socket(f'mouth-{number}', (*at, 0.0), (0.0, 1.0))
        if was:
            kit.block(module, (0.0, 13.0, 0.0), (4.0, 1.6, 2.4), 'stone', bevel=0.05, wear=0.02, part=False)
            kit.block(module, (0.0, 12.6, 0.3), (2.2, 0.6, 1.2), 'glow', bevel=0.0, wear=0.0, part=False)
            for side in (-1, 1):
                kit.block(module, (side * 13.6, 0.0, 3.0), (0.1, 2.4, 4.0), 'crimson', bevel=0.0, wear=0.0, part=False)
        else:
            pick = latticekit.picker(module.random.randrange(1 << 30))
            bk.drowned_floor(module, -14.0, -14.0, 14.0, 14.0)
            for base in ((-12.0, 12.0, 0.0), (12.0, 12.0, 0.0), (-12.0, -12.0, 0.0), (12.0, -8.0, 0.0), (0.0, 13.0, 0.0)):
                bk.crystal(module, pick, base, count=7, length=3.2, radius=0.6)
            bk.crust(module, pick, (0.0, 4.0, 0.02), 6.0)
        breach_dress.shore(module, was)

    return build


COURT = 26.0


def court(module):
    """The Steward's court: a round floor over the dark, stepped out of squares so every piece is square to the frame,
    reached by a bridge from the hall's door; the Steward's throne on a dais at its head, a rift's arch at each side
    with a mooring stone inside it, and four growths at its rim the Lattice comes out of."""
    for step in range(8):
        across = COURT * math.cos(math.asin((step + 0.5) / 8))
        for sign in (-1, 1):
            south, north = sorted((sign * COURT * step / 8, sign * COURT * (step + 1) / 8))
            bk.floor(module, -across, south, across, north, deep=3.0, material='paving')
    bk.floor(module, -3.0, -46.0, 3.0, -COURT + 0.5, deep=2.0)
    kit.block(module, (0.0, 21.0, 0.0), (12.0, 6.0, 2.0), 'trim', bevel=0.05, wear=0.02)
    bk.stair(module, (0.0, 18.0 - bk.flight_run(2.0)), (0, 1), 6.0, 0.0, 2.0)
    kit.block(module, (0.0, 22.5, 2.0), (3.2, 2.0, 3.6), 'stone', bevel=0.08, wear=0.03)
    bk.rift(module, 'rift-was', (-COURT + 2.0, 0.0, 0.0), (1.0, 0.0))
    bk.rift(module, 'rift-is', (COURT - 2.0, 0.0, 0.0), (-1.0, 0.0))
    bk.mooring(module, 'mooring-was', (-17.0, 0.0, 0.0))
    bk.mooring(module, 'mooring-is', (17.0, 0.0, 0.0))
    module.socket('glyphs-was', (-17.0, 0.0, 4.0), (1.0, 0.0))
    module.socket('glyphs-is', (17.0, 0.0, 4.0), (-1.0, 0.0))
    module.socket('steward', (0.0, 13.0, 0.0), (0.0, -1.0))
    module.socket('entry', (0.0, -46.0, 0.0), (0.0, -1.0))
    module.socket('checkpoint', (0.0, -30.0, 0.0), (0.0, 1.0))
    module.socket('chest', (6.0, -10.0, 0.0), (0.0, -1.0))
    module.socket('portal', (0.0, -18.0, 0.0), (0.0, 1.0))
    for number, angle in enumerate((225.0, 315.0, 135.0, 45.0), start=1):
        x, y = 20.0 * math.cos(math.radians(angle)), 20.0 * math.sin(math.radians(angle))
        module.socket(f'mouth-{number}', (round(x, 3), round(y, 3), 0.0), (0.0, 1.0))
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for socket in module.sockets:
        if socket['name'].startswith('mouth-'):
            x, y, _ = socket['at']
            bk.crystal(module, pick, (x * 1.12, y * 1.12, 0.0), count=7, length=3.4, radius=0.6)
    bk.crust(module, pick, (0.0, 16.0, 0.02), 4.0)
    breach_dress.court(module, COURT)
