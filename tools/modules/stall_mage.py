"""The Mage's study (`stall-mage`), 10 x 8 x 7: a scholar's room open at its front under a tiled roof. A stone base
of walls holds a raised floor; across its front stands a timber counter laid with an open book, scrolls, an inkwell
and a candle, and on its east end a lens on a stand. Bookcases line the back and side walls; in the west front corner
an orrery of iron rings turns round a glowing core on a stone pedestal; a lamp hangs from the tie beam over the
keeper, and a star chart hangs on the east wall. The front faces -y.
"""
import math

import fittings
import kit
import shapes

HALF_X = 5.0
HALF_Y = 4.0
FLOOR_M = 0.2
COUNTER_Y = -0.9
WALL_M = 4.4
EAVE_M = WALL_M + 0.2
RIDGE_M = 6.8


def orrery(module, at):
    """An orrery on a fluted stone pedestal at `at`: three iron rings set at angles round a glowing core, a gilt
    planet riding each, a gilt meridian arc over all."""
    kit.column(module, at, 0.32, 0.25, 'trim', sides=12, wear=0.0, part=False)
    shapes.lathe(module, (at[0], at[1], at[2] + 0.25), [(0.24, 0.0), (0.18, 0.1), (0.16, 0.8), (0.22, 0.92),
                 (0.3, 1.0), (0.3, 1.06), (0.0, 1.06)], 'stone', sides=12)
    module.part((at[0] - 0.32, at[1] - 0.32, at[2]), (at[0] + 0.32, at[1] + 0.32, at[2] + 1.3))
    middle = (at[0], at[1], at[2] + 1.95)
    shapes.rod(module, (at[0], at[1], at[2] + 1.3), middle, 0.03, 'gold', sides=6)
    shapes.ball(module, middle, 0.17, 'glow', detail=2)
    for radius, tilt, spin in ((0.42, 0.35, 0.0), (0.62, -0.5, 1.1), (0.82, 0.2, 2.2)):
        turn = (tilt, 0.25, spin)
        shapes.ring(module, middle, radius, 0.035, 'iron', turn=turn, segments=28, sides=4)
        planet = ring_point(radius, turn)
        shapes.ball(module, (middle[0] + planet[0], middle[1] + planet[1], middle[2] + planet[2]), 0.06, 'gold',
                    detail=1)
    shapes.ring(module, middle, 0.92, 0.04, 'gold', turn=(math.pi / 2, 0.0, 0.6), segments=28, sides=4)


def ring_point(radius, turn):
    """A point on a level ring of `radius` at its +x, turned as the ring is (x, then y, then z)."""
    x, y, z = radius, 0.0, 0.0
    tx, ty, tz = turn
    y, z = y * math.cos(tx) - z * math.sin(tx), y * math.sin(tx) + z * math.cos(tx)
    x, z = x * math.cos(ty) + z * math.sin(ty), -x * math.sin(ty) + z * math.cos(ty)
    x, y = x * math.cos(tz) - y * math.sin(tz), x * math.sin(tz) + y * math.cos(tz)
    return x, y, z


def lens(module, at):
    """A reading lens on a brass stand: a foot, a stem, a ring and its glass."""
    shapes.lathe(module, at, [(0.12, 0.0), (0.1, 0.03), (0.02, 0.05), (0.0, 0.05)], 'gold', sides=12)
    shapes.rod(module, (at[0], at[1], at[2] + 0.04), (at[0], at[1], at[2] + 0.42), 0.012, 'gold', sides=6)
    middle = (at[0], at[1], at[2] + 0.56)
    shapes.ring(module, middle, 0.13, 0.025, 'gold', turn=(math.pi / 2 - 0.3, 0.0, 0.2), segments=20, sides=4)
    shapes.lathe(module, middle, [(0.12, -0.006), (0.12, 0.006)], 'bone', sides=20,
                 turn=(math.pi / 2 - 0.3, 0.0, 0.2))


def counter_top(module, y, z):
    """What lies on the counter: an open book on a slanted rest, a pile of scrolls, an inkwell with a quill, a
    candle in a dish."""
    for side in (-1, 1):
        shapes.slab(module, (-0.4 + side * 0.17, y, z + 0.06), (0.32, 0.42, 0.03), 'bone', turn=(0.25, side * 0.1, 0.0))
        shapes.slab(module, (-0.4 + side * 0.17, y + 0.005, z + 0.04), (0.34, 0.44, 0.02), 'crimson',
                    turn=(0.25, side * 0.1, 0.0))
    fittings.scrolls(module, (1.0, y, z), 6, length=0.45)
    shapes.lathe(module, (0.45, y + 0.1, z), [(0.05, 0.0), (0.05, 0.06), (0.025, 0.08), (0.025, 0.1),
                 (0.0, 0.1)], 'black', sides=8)
    shapes.slab(module, (0.47, y + 0.1, z + 0.2), (0.012, 0.03, 0.28), 'linen', turn=(0.0, 0.35, 0.3))
    shapes.lathe(module, (-1.3, y + 0.05, z), [(0.09, 0.0), (0.09, 0.015), (0.0, 0.015)], 'gold', sides=12)
    fittings.candle(module, (-1.3, y + 0.05, z + 0.015), high=0.2)


def star_chart(module, x, y, z):
    """A star chart hung on the east wall: black cloth pricked with gilt stars and a ring of the heavens."""
    shapes.slab(module, (x, y, z), (0.02, 1.6, 1.2), 'black')
    for star in range(26):
        spot = (x - 0.02, y + module.draw(-0.7, 0.7), z + module.draw(-0.5, 0.5))
        shapes.slab(module, spot, (0.012, 0.035, 0.035), 'gold', turn=(math.pi / 4, 0.0, 0.0))
    shapes.ring(module, (x - 0.02, y, z), 0.42, 0.02, 'gold', turn=(0.0, math.pi / 2, 0.0), segments=24, sides=3)
    shapes.rod(module, (x - 0.03, y - 0.85, z + 0.62), (x - 0.03, y + 0.85, z + 0.62), 0.02, 'timber', sides=6)


def build(module):
    # The raised floor, the walls round the back and sides, and the front piers.
    fittings.floor(module, -HALF_X + 0.3, COUNTER_Y - 0.3, HALF_X - 0.3, HALF_Y - 0.3, FLOOR_M)
    fittings.wall(module, (-HALF_X + 0.25, HALF_Y - 0.25), (HALF_X - 0.25, HALF_Y - 0.25), WALL_M)
    for side in (-1, 1):
        x = side * (HALF_X - 0.25)
        fittings.wall(module, (x, COUNTER_Y - 0.6), (x, HALF_Y - 0.5), WALL_M)
        kit.block(module, (x, COUNTER_Y - 0.6, 0.0), (0.8, 0.8, WALL_M + 0.2), 'trim', bevel=0.05, wear=0.02)
    # The front beam over the opening, and the curtains drawn aside to either end of it.
    kit.block(module, (0.0, COUNTER_Y - 0.6, WALL_M - 0.5), (HALF_X * 2 - 1.6, 0.5, 0.7), 'timber', bevel=0.03,
              wear=0.0, part=False)
    module.part((-HALF_X + 0.8, COUNTER_Y - 0.85, WALL_M - 0.5), (HALF_X - 0.8, COUNTER_Y - 0.35, WALL_M + 0.2))
    for side in (-1, 1):
        x = side * (HALF_X - 0.85)
        fittings.post(module, (x, COUNTER_Y - 0.25, 0.0), WALL_M - 0.5, side=0.18, part=False)
        shapes.drape(module, (x - side * 0.05, COUNTER_Y - 0.3, WALL_M - 0.55), (x - side * 0.7, COUNTER_Y - 0.3,
                     WALL_M - 0.55), WALL_M - 0.7, 'crimson', folds=3, depth=0.07, hem=0.0)
        shapes.rod(module, (x - side * 0.75, COUNTER_Y - 0.36, 1.3), (x + side * 0.05, COUNTER_Y - 0.36, 1.3), 0.025,
                   'gold', sides=5)
    # The counter, its top's things, and the lens on its east end.
    fittings.counter(module, -2.6, 2.6, COUNTER_Y, high=1.05)
    counter_top(module, COUNTER_Y + 0.35, 1.05)
    lens(module, (2.2, COUNTER_Y + 0.35, 1.05))
    # Bookcases on the back wall, either side of a reading desk, and down the west wall.
    fittings.bookcase(module, -HALF_X + 0.55, -0.9, HALF_Y - 0.72, 3.4, 6)
    fittings.bookcase(module, 0.9, HALF_X - 0.55, HALF_Y - 0.72, 3.4, 6)
    desk(module, (0.0, HALF_Y - 1.05, FLOOR_M))
    orrery(module, (-HALF_X + 1.6, COUNTER_Y + 0.9, FLOOR_M))
    star_chart(module, HALF_X - 0.52, 1.0, 2.4)
    # The roof on a tie beam, and the lamp hung from the beam over the keeper.
    for x in (-1.8, 1.8):
        south, north = COUNTER_Y - 0.35, HALF_Y - 0.5
        kit.block(module, (x, (south + north) / 2, WALL_M - 0.2), (0.24, north - south, 0.3), 'timber', bevel=0.02,
                  wear=0.0, part=False)
    # Where a hanging shop sign's bracket is fixed, high on the east pier, facing along the front away from its middle.
    module.socket('sign', (HALF_X + 0.15, COUNTER_Y - 0.6, 3.6), (1, 0))
    fittings.gable_roof(module, -HALF_X + 0.1, HALF_X - 0.1, COUNTER_Y - 1.0, HALF_Y, EAVE_M, RIDGE_M)
    fittings.lantern(module, (0.0, COUNTER_Y + 1.4, 3.1), size=0.34, hung_from=WALL_M - 0.05)
    module.socket('counter', (0.0, COUNTER_Y - 0.45, 0.0), (0, -1))
    module.socket('keeper', (0.0, COUNTER_Y + 1.15, FLOOR_M), (0, -1))


def desk(module, at):
    """The scholar's writing desk against the back wall between the cases: a sloped top on turned legs, a stool, a
    skull for company and a candle."""
    x, y, z = at
    for dx in (-0.7, 0.7):
        for dy in (-0.3, 0.3):
            shapes.lathe(module, (x + dx, y + dy, z), [(0.05, 0.0), (0.035, 0.3), (0.05, 0.45), (0.035, 0.7),
                         (0.045, 0.82)], 'timber', sides=8)
    shapes.slab(module, (x, y, z + 0.86), (1.6, 0.75, 0.06), 'timber', turn=(-0.12, 0.0, 0.0), bevel=0.01)
    module.part((x - 0.8, y - 0.4, z), (x + 0.8, y + 0.4, z + 0.95))
    fittings.books(module, x - 0.6, x - 0.1, y + 0.2, z + 0.92, deep=0.2, high=0.28)
    shapes.ball(module, (x + 0.4, y + 0.15, z + 1.02), 0.1, 'bone', detail=2, scale=(0.85, 1.05, 0.9))
    fittings.candle(module, (x + 0.15, y + 0.2, z + 0.9), high=0.18)
    shapes.lathe(module, (x, y - 0.75, z), [(0.2, 0.0), (0.2, 0.04), (0.06, 0.06), (0.06, 0.42), (0.22, 0.44),
                 (0.22, 0.5), (0.0, 0.5)], 'timber', sides=12)

