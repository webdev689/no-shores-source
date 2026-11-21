"""The quay's two keepers. The Harbourmaster's office (`stall-harbourmaster`), 10 x 8 x 7: a boarded timber house on a
stone footing, its front hatch propped open over a counter ledge; inside, the chart table spread with charts and a
compass, a chart of the coast on the wall and a ship's wheel; outside, the harbour bell in its frame, a lantern on a
post, a mooring bollard with its rope and a flagstaff on the roof. The chandlery (`stall-chandler`), 9 x 7 x 6: a
lean-to shop of shelves full of candles, lanterns hung from its beam, coils of rope and barrels of pitch and oil, its
counter under a striped awning. Both fronts face -y.
"""
import math

import fittings
import kit
import shapes

FLOOR_M = 0.3


def boarded_wall(module, start, end, high, base=0.0):
    """A timber wall square to the frame from `start` to `end` (its middle line's ends), 0.2 thick, its boards
    lapped in courses along it; a part."""
    along_x = abs(end[0] - start[0]) > abs(end[1] - start[1])
    length = abs(end[0] - start[0]) if along_x else abs(end[1] - start[1])
    middle = ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
    kit.block(module, (*middle, base), (length, 0.2, high) if along_x else (0.2, length, high), 'timber', bevel=0.01,
              wear=0.0)
    for course in range(1, int(high / 0.45)):
        z = base + course * 0.45
        for side in (-1, 1):
            spot = (middle[0], middle[1] + side * 0.11, z) if along_x else (middle[0] + side * 0.11, middle[1], z)
            shapes.slab(module, spot, (length, 0.025, 0.05) if along_x else (0.025, length, 0.05), 'timber')



def bell_frame(module, x, y):
    """The harbour bell in its timber frame: two posts, a beam with a little roof, the bronze bell and its rope."""
    for dy in (-0.6, 0.6):
        fittings.post(module, (x, y + dy, 0.0), 3.0, side=0.18)
    shapes.slab(module, (x, y, 3.05), (0.22, 1.6, 0.2), 'timber')
    for side in (-1, 1):
        shapes.slab(module, (x + side * 0.22, y, 3.38), (0.5, 1.9, 0.05), 'roof', turn=(0.0, side * 0.6, 0.0))
    shapes.lathe(module, (x, y, 2.25), [(0.32, 0.0), (0.3, 0.05), (0.22, 0.25), (0.18, 0.55), (0.12, 0.66),
                 (0.0, 0.68)], 'gold', sides=12)
    shapes.rod(module, (x, y, 2.5), (x, y, 2.95), 0.03, 'iron', sides=4)
    shapes.ball(module, (x, y, 2.18), 0.06, 'iron', detail=0)
    shapes.rod(module, (x, y + 0.05, 2.18), (x - 0.05, y + 0.25, 0.9), 0.012, 'linen', sides=3)


def bollard(module, at):
    """An iron mooring bollard with a rope made fast round it and the rest coiled beside it."""
    shapes.lathe(module, at, [(0.26, 0.0), (0.2, 0.08), (0.17, 0.5), (0.26, 0.62), (0.24, 0.72), (0.0, 0.74)], 'iron',
                 sides=10)
    module.part((at[0] - 0.26, at[1] - 0.26, at[2]), (at[0] + 0.26, at[1] + 0.26, at[2] + 0.74))
    shapes.ring(module, (at[0], at[1], at[2] + 0.45), 0.2, 0.06, 'linen', segments=10, sides=3)
    coil(module, (at[0] + 0.6, at[1] + 0.3, at[2]), 0.32)


def coil(module, at, radius, turns=3, material='linen'):
    """A coil of rope lying on `at`, lighter than the kit's for a quay that holds many."""
    for number in range(turns):
        shapes.ring(module, (at[0], at[1], at[2] + 0.035 + number * 0.06), radius * (1 - number * 0.07), 0.07,
                    material, segments=12, sides=3)


def chart_table(module, x, y):
    """The chart table: charts spread on it, one held flat by a compass and a pair of dividers, a rolled one beside."""
    for dx in (-0.7, 0.7):
        for dy in (-0.4, 0.4):
            fittings.post(module, (x + dx, y + dy, FLOOR_M), 0.85, side=0.08, part=False)
    kit.block(module, (x, y, FLOOR_M + 0.85), (1.6, 1.0, 0.06), 'timber', bevel=0.01, wear=0.0, part=False)
    module.part((x - 0.8, y - 0.5, FLOOR_M), (x + 0.8, y + 0.5, FLOOR_M + 0.91))
    top = FLOOR_M + 0.91
    shapes.slab(module, (x - 0.1, y, top + 0.004), (1.1, 0.8, 0.008), 'linen', turn=(0.0, 0.0, 0.08))
    shapes.slab(module, (x + 0.35, y + 0.1, top + 0.01), (0.7, 0.55, 0.008), 'bone', turn=(0.0, 0.0, -0.15))
    for line in range(5):
        shapes.slab(module, (x - 0.3 + line * 0.12, y - 0.1 + module.draw(-0.1, 0.1), top + 0.012),
                    (module.draw(0.15, 0.4), 0.008, 0.004), 'black', turn=(0.0, 0.0, module.draw(-1, 1)))
    shapes.ring(module, (x - 0.35, y + 0.15, top + 0.03), 0.07, 0.02, 'gold', segments=10, sides=3)
    for side in (-1, 1):
        shapes.rod(module, (x + 0.2, y - 0.15, top + 0.04), (x + 0.2 + side * 0.08, y - 0.4, top + 0.012), 0.006,
                   'iron', sides=3)
    fittings.scrolls(module, (x + 0.6, y + 0.35, top), 3, length=0.6)


def ship_wheel(module, middle):
    """A ship's wheel hung on the back wall, facing -y: rim, hub and eight spokes with handles."""
    turn = (math.pi / 2, 0.0, 0.0)
    shapes.ring(module, middle, 0.45, 0.06, 'timber', turn=turn, segments=16, sides=4)
    shapes.lathe(module, (middle[0], middle[1] + 0.04, middle[2]), [(0.1, 0.0), (0.1, 0.12), (0.0, 0.12)], 'timber',
                 sides=8, turn=(-math.pi / 2, 0.0, 0.0))
    for spoke in range(8):
        angle = math.tau * spoke / 8
        end = (middle[0] + math.cos(angle) * 0.62, middle[1] - 0.02, middle[2] + math.sin(angle) * 0.62)
        shapes.rod(module, (middle[0], middle[1] - 0.02, middle[2]), end, 0.02, 'timber', sides=4)


def stall_harbourmaster(module):
    west, east, front, back = -3.6, 3.4, -1.4, 3.6
    kit.block(module, ((west + east) / 2, (front + back) / 2, 0.0), (east - west + 0.4, back - front + 0.4, FLOOR_M),
              'stone', bevel=0.04, wear=0.02)
    kit.block(module, ((west + east) / 2, (front + back) / 2, FLOOR_M - 0.02), (east - west - 0.2, back - front - 0.2,
              0.04), 'timber', bevel=0.0, wear=0.0, part=False)
    wall_high = 3.2
    boarded_wall(module, (west, back), (east, back), wall_high, FLOOR_M)
    for x in (west, east):
        boarded_wall(module, (x, front), (x, back), wall_high, FLOOR_M)
    # The front wall round its hatch, the hatch's shutter propped open as a canopy, the ledge under it.
    hatch = (-1.9, 1.9, FLOOR_M + 0.95, FLOOR_M + 2.45)
    for x0, x1 in ((west, hatch[0]), (hatch[1], east)):
        boarded_wall(module, (x0, front), (x1, front), wall_high, FLOOR_M)
    boarded_wall(module, (hatch[0], front), (hatch[1], front), hatch[2] - FLOOR_M, FLOOR_M)
    kit.block(module, (0.0, front, hatch[3]), (hatch[1] - hatch[0], 0.2, FLOOR_M + wall_high - hatch[3]), 'timber',
              bevel=0.01, wear=0.0)
    shapes.slab(module, (0.0, front - 0.62, hatch[3] + 0.3), (hatch[1] - hatch[0] + 0.1, 1.3, 0.06), 'timber',
                turn=(-0.45, 0.0, 0.0))
    for x in (hatch[0] + 0.1, hatch[1] - 0.1):
        shapes.rod(module, (x, front - 0.05, hatch[2]), (x, front - 1.15, hatch[3] + 0.5), 0.025, 'timber', sides=4)
    fittings.counter(module, hatch[0] - 0.1, hatch[1] + 0.1, front - 0.7, high=hatch[2], deep=0.6, panels=False)
    shapes.slab(module, (-0.9, front - 0.45, hatch[2] + 0.005), (0.5, 0.35, 0.01), 'linen', turn=(0.0, 0.0, 0.2))
    fittings.candle(module, (1.2, front - 0.45, hatch[2]), high=0.18)
    fittings.books(module, 0.1, 0.5, front - 0.45, hatch[2], deep=0.24, high=0.28)
    fittings.gable_roof(module, west - 0.1, east + 0.1, front - 0.1, back + 0.1, FLOOR_M + wall_high,
                        FLOOR_M + wall_high + 1.9)
    # The flagstaff on the gable, its pennant the city's crimson and linen.
    staff = (east - 0.4, (front + back) / 2, FLOOR_M + wall_high + 1.4)
    shapes.rod(module, staff, (staff[0], staff[1], 6.9), 0.04, 'timber', sides=6)
    shapes.ball(module, (staff[0], staff[1], 6.92), 0.06, 'gold', detail=0)
    shapes.cutout(module, [(0.0, 0.0), (1.3, -0.25), (0.0, -0.5)], 0.015, 'crimson', (staff[0], staff[1], 6.75),
                  turn=(0.0, 0.0, -math.pi / 2))
    shapes.cutout(module, [(0.0, -0.18), (0.9, -0.25), (0.0, -0.32)], 0.02, 'linen', (staff[0], staff[1], 6.75),
                  turn=(0.0, 0.0, -math.pi / 2))
    # Inside: the chart table, the wall chart, the wheel, a shelf of rolled charts, a lantern.
    chart_table(module, -0.2, 1.4)
    shapes.slab(module, (-2.0, back - 0.13, FLOOR_M + 1.9), (1.4, 0.02, 1.0), 'linen')
    for line in range(7):
        shapes.slab(module, (-2.0 + module.draw(-0.5, 0.5), back - 0.15, FLOOR_M + 1.9 + module.draw(-0.35, 0.35)),
                    (module.draw(0.2, 0.5), 0.01, 0.015), 'black', turn=(0.0, module.draw(-1, 1), 0.0))
    ship_wheel(module, (1.6, back - 0.2, FLOOR_M + 1.9))
    kit.block(module, (west + 0.4, 1.5, FLOOR_M + 1.5), (0.5, 2.2, 0.05), 'timber', bevel=0.0, wear=0.0, part=False)
    fittings.scrolls(module, (west + 0.4, 1.5, FLOOR_M + 1.55), 8, length=0.45, along_x=True)
    fittings.lantern(module, (0.0, 0.4, FLOOR_M + 2.4), size=0.28, hung_from=FLOOR_M + wall_high)
    # Outside: the bell, a lantern on its post, the bollard and a barrel by the door's corner.
    bell_frame(module, 4.4, 0.6)
    fittings.post(module, (west - 0.9, front - 0.8, 0.0), 2.6, side=0.16)
    fittings.lantern(module, (west - 0.9, front - 0.8, 2.6), size=0.32)
    bollard(module, (-4.3, -3.4, 0.0))
    fittings.barrel(module, (west - 0.75, back - 0.6, 0.0), radius=0.32, high=0.9)
    module.part((west - 1.1, back - 0.95, 0.0), (west - 0.4, back - 0.25, 0.9))
    # Where a hanging shop sign's bracket is fixed, high on the east wall, facing along the front away from its middle.
    module.socket('sign', (east + 0.1, front + 0.2, 3.6), (1, 0))
    module.socket('counter', (0.0, front - 0.7 - 0.45, 0.0), (0, -1))
    module.socket('keeper', (0.0, front + 0.6, FLOOR_M), (0, -1))


def candle_shelves(module, west, east, y, rows):
    """Shelves of candles against the back wall: tapers standing in rows of the waxes, thick church candles, and
    bundles of tapers tied in fives."""
    for x in (west, east):
        fittings.post(module, (x, y, FLOOR_M), 2.6, side=0.08, part=False)
    for row in range(rows):
        z = FLOOR_M + 0.4 + row * 0.55
        kit.block(module, ((west + east) / 2, y - 0.15, z - 0.04), (east - west, 0.4, 0.04), 'timber', bevel=0.0,
                  wear=0.0, part=False)
        x = west + 0.12
        while x < east - 0.12:
            if row % 2:
                shapes.lathe(module, (x, y - 0.15, z), [(0.06, 0.0), (0.06, 0.28), (0.0, 0.29)], 'bone', sides=6)
                x += 0.16
            else:
                for taper in range(4):
                    shapes.rod(module, (x + taper * 0.04, y - 0.1, z), (x + taper * 0.04, y - 0.1, z + 0.36), 0.014,
                               'bone' if (row + taper) % 3 else 'lamplighter_gold', sides=3)
                x += 0.22
    module.part((west, y - 0.4, FLOOR_M), (east, y + 0.05, FLOOR_M + 0.4 + rows * 0.55))


def candle_tree(module, at):
    """An iron candle tree on a tripod at the stall's front, its three tiers of arms each holding a lit candle: the
    chandler's wares burning where the street sees them."""
    x, y, z = at
    for leg in range(3):
        angle = math.tau * leg / 3
        shapes.rod(module, (x, y, z + 0.3), (x + math.cos(angle) * 0.35, y + math.sin(angle) * 0.35, z), 0.02, 'iron',
                   sides=3)
    shapes.rod(module, (x, y, z), (x, y, z + 1.9), 0.025, 'iron', sides=4)
    for tier, (high, reach, arms) in enumerate(((1.0, 0.45, 6), (1.45, 0.3, 4), (1.9, 0.0, 1))):
        for arm in range(arms):
            angle = math.tau * arm / arms + tier * 0.4
            tip = (x + math.cos(angle) * reach, y + math.sin(angle) * reach, z + high)
            if reach:
                shapes.rod(module, (x, y, z + high - 0.08), tip, 0.012, 'iron', sides=3)
            fittings.candle(module, tip, high=0.18, radius=0.025)
    module.part((x - 0.4, y - 0.4, z), (x + 0.4, y + 0.4, z + 2.1))


def stall_chandler(module):
    west, east, front, back = -4.3, 4.3, -1.4, 3.3
    kit.block(module, (0.0, (front + back) / 2, 0.0), (east - west, back - front, FLOOR_M), 'stone', bevel=0.04,
              wear=0.02)
    kit.block(module, (0.0, (front + back) / 2, FLOOR_M - 0.02), (east - west - 0.3, back - front - 0.3, 0.04),
              'timber', bevel=0.0, wear=0.0, part=False)
    back_high, front_high = 4.6, 3.4
    boarded_wall(module, (west + 0.1, back - 0.1), (east - 0.1, back - 0.1), back_high, FLOOR_M)
    for x in (west + 0.1, east - 0.1):
        boarded_wall(module, (x, front + 0.3), (x, back - 0.2), front_high, FLOOR_M)
    for x in (west + 0.1, -1.9, 1.9, east - 0.1):
        fittings.post(module, (x, front, 0.0), front_high + FLOOR_M, side=0.24)
    kit.block(module, (0.0, front, front_high + FLOOR_M - 0.1), (east - west + 0.2, 0.3, 0.3), 'timber', bevel=0.02,
              wear=0.0)
    # The lean-to roof, falling from the back wall to the front beam and out over it.
    rise = back_high - front_high
    run = back - front + 0.8
    pitch = math.atan2(rise, back - front)
    shapes.slab(module, (0.0, (front + back) / 2 - 0.3, FLOOR_M + (back_high + front_high) / 2 + 0.08),
                (east - west + 0.6, math.hypot(run, rise), 0.14), 'roof', turn=(pitch, 0.0, 0.0))
    slope = math.hypot(run, rise)
    for course in range(1, int(slope / 0.45)):
        along = course * 0.45 - slope / 2
        shapes.slab(module, (0.0, (front + back) / 2 - 0.3 + math.cos(pitch) * along - math.sin(pitch) * 0.08,
                             FLOOR_M + (back_high + front_high) / 2 + 0.08 + math.sin(pitch) * along +
                             math.cos(pitch) * 0.08), (east - west + 0.6, 0.05, 0.04), 'roof', turn=(pitch, 0.0, 0.0))
    for side in (-1, 1):
        shapes.cutout(module, [(front, front_high), (back, back_high), (back, front_high)], 0.2, 'timber',
                      (side * (east - 0.1), 0.0, FLOOR_M), turn=(0.0, 0.0, math.pi / 2))
    # Its parts step up under the slope in thirds, each topped by the slope at its front edge, so none stands proud.
    for third in range(3):
        top = FLOOR_M + front_high + rise * third / 3 + 0.1
        module.part((west, front + (back - front) * third / 3, top - 0.35),
                    (east, front + (back - front) * (third + 1) / 3, top))
    # The counter under its awning, laid with candles, a lantern and a tray of wicks.
    shapes.awning(module, -1.8, 1.8, front - 0.2, -3.35, 3.1, 2.65, ('crimson', 'lamplighter_gold'), stripes=6)
    fittings.counter(module, -1.8, 1.8, front - 0.9, high=1.0)
    for spot in range(5):
        fittings.candle(module, (-1.4 + spot * 0.18, front - 0.55, 1.0), high=0.12 + spot * 0.04, radius=0.03 + spot
                        * 0.005)
    fittings.lantern(module, (0.6, front - 0.55, 1.0), size=0.26)
    shapes.slab(module, (1.3, front - 0.55, 1.02), (0.4, 0.25, 0.04), 'timber')
    # Candles, lanterns hung from the beam, rope, and barrels.
    candle_shelves(module, -3.9, 0.6, back - 0.25, 3)
    for x in (-3.1, 3.1):
        fittings.lantern(module, (x, front - 0.1, 2.75), size=0.26, hung_from=FLOOR_M + front_high - 0.25)
    for x in (-1.2, 0.0, 1.2):
        fittings.lantern(module, (x, front + 0.6, 2.75), size=0.26, hung_from=FLOOR_M + front_high)
    candle_tree(module, (3.0, front + 1.0, FLOOR_M))
    for spot, (x, y) in enumerate(((1.6, back - 0.6), (2.4, back - 0.7), (3.4, back - 0.6), (2.0, back - 0.75))):
        coil(module, (x, y, FLOOR_M + (0.0 if spot < 3 else 0.2)), 0.38 if spot < 3 else 0.3)
    shapes.rod(module, (1.4, back - 0.25, FLOOR_M + 2.4), (3.8, back - 0.25, FLOOR_M + 2.4), 0.03, 'timber', sides=4)
    for hang in range(3):
        shapes.ring(module, (1.9 + hang * 0.8, back - 0.3, FLOOR_M + 2.0), 0.28, 0.06, 'linen',
                    turn=(math.pi / 2, 0.0, 0.0), segments=12, sides=3)
    module.part((1.1, back - 1.2, FLOOR_M), (3.9, back - 0.1, FLOOR_M + 0.5))
    for x, y in ((-3.6, 0.2), (-3.0, -0.3), (3.6, 0.6)):
        fittings.barrel(module, (x, y, FLOOR_M), radius=0.3, high=0.85)
        module.part((x - 0.3, y - 0.3, FLOOR_M), (x + 0.3, y + 0.3, FLOOR_M + 0.85))
    fittings.barrel(module, (-3.3, 0.0, FLOOR_M + 0.85), radius=0.28, high=0.8, lying=True, turn=0.3)
    # Where a hanging shop sign's bracket is fixed, high on the east wall, facing along the front away from its middle.
    module.socket('sign', (east, front + 0.4, 3.6), (1, 0))
    module.socket('counter', (0.0, front - 0.9 - 0.45, 0.0), (0, -1))
    module.socket('keeper', (0.0, front + 0.5, FLOOR_M), (0, -1))
