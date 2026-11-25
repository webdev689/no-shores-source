"""The chalk's three landmarks, each in its own frame from its footprint's north-west corner (metres; a wall's
landmark has the wall at y 0): the Shell Bed, a wall of shells heaped down to a pool as if the sea left yesterday;
the Chalk Figure, a figure cut white into a face of dark flint over a step where candles burn; and the Fallen Shaft,
a heap of chalk and broken shaft timbers under the daylight that comes down it.
"""
import math
import random

from styles.chalk import forms
from styles.crypt import ground

SIDE = 6.4


def _cockle(kit, x, y, z, size, draw, part='bone'):
    """A cockle's valve lying as the sea left it, ribbed round, cupped up or down."""
    profile = [(0.0, 0.0), (size / 2, 0.0), (size * 0.42, size * 0.22), (size * 0.2, size * 0.34), (0.0, size * 0.36)]
    shell = kit.lathe(profile, sides=7, part=part)
    kit.rotate(shell, draw.uniform(-35, 35), 'x')
    kit.rotate(shell, draw.uniform(-35, 35), 'y')
    return kit.translate(shell, x, y, z - size * 0.08)


def _whelk(kit, x, y, z, size, draw):
    """A whelk's shell lying on its side, its spire to one side."""
    shell = kit.cone((0.0, 0.0, 0.0), (size, 0.0, 0.0), size * 0.32, 0.0, sides=5, part='bone')
    kit.rotate(shell, draw.uniform(-20, 20), 'y')
    kit.rotate_z(shell, draw.uniform(0, 360))
    return kit.translate(shell, x, y, z + size * 0.2)


def shell_bed(kit, entry):
    """A bank of shells heaped against the wall to near the roof, spilling down to the floor where a pool still
    lies: cockles, whelks and scallops by the hundred, flints sticking out of it."""
    draw = random.Random(entry['module'])
    lumps = ground.bumps(draw, 22, (0.0, 0.0, SIDE, 1.9), (0.04, 0.16), (0.25, 0.6))

    def spill(x):
        return min(1.0, max(0.0, (x - 0.62) / 0.5), max(0.0, (5.78 - x) / 0.5))

    def height(x, y):
        if y < 1.2:
            return 0.5 + 2.35 * (1 - y / 1.2) ** 1.6 + ground.lumps(lumps, x, y)
        if y < 2.0:
            share = (2.0 - y) / 0.8
            return spill(x) * (0.5 * share * share * (3 - 2 * share) + ground.lumps(lumps, x, y) * share)
        dip = ((x - 3.2) / 0.55) ** 2 + ((y - 2.5) / 0.12) ** 2
        return -0.03 * max(0.0, 1 - dip) ** 0.5 if dip < 1 else 0.0

    xs = ground.steps(0.0, SIDE, 32, (0.6, 5.8))
    # The pool's basin dips only at grid points well inside its water, so its edge lies on the level floor.
    ys = ground.steps(0.0, 3.2, 16, (1.2, 2.0, 2.3, 2.5, 2.7))
    made = ground.ground(kit, xs, ys, height, lambda x, y: 'bone' if y < 1.75 else 'floor')
    pool = [(3.2 + 0.9 * math.cos(turn), 2.5 + 0.31 * math.sin(turn), 0.0)
            for turn in (math.tau * step / 14 for step in range(14))]
    made.append(kit.polygon(pool, part='water'))
    for number in range(150):
        y = draw.uniform(0.15, 1.9)
        low, high = (0.15, SIDE - 0.15) if y < 1.15 else (0.75, 5.65)
        x = draw.uniform(low, high)
        size = draw.uniform(0.05, 0.12)
        z = height(x, y)
        if number % 5 == 0:
            made.append(forms.shell(kit, (x, y, z + 0.01), size * 1.3, turn=draw.uniform(0, 360),
                                    tilt=draw.uniform(-110, -60)))
        elif number % 5 == 1:
            made.append(_whelk(kit, x, y, z, size, draw))
        else:
            made.append(_cockle(kit, x, y, z, size, draw))
    for number in range(9):
        x, y = draw.uniform(0.4, SIDE - 0.4), draw.uniform(0.2, 1.0)
        made.append(kit.rock(x, y, height(x, y) - 0.05, (0.14, 0.1, 0.12), seed=f'{entry["module"]} flint {number}',
                             detail=1, roughness=0.38, part='stoneAlt'))
    return kit.join(made, entry['module'])


def _stroke(kit, start, end, width, y0, y1, part='stone'):
    """A line of the figure cut in the face from (x, z) `start` to `end`, `width` wide, standing y0..y1."""
    dx, dz = end[0] - start[0], end[1] - start[1]
    span = math.hypot(dx, dz)
    piece = kit.box(-span / 2 - width / 2, y0, -width / 2, span / 2 + width / 2, y1, width / 2, part=part)
    kit.rotate(piece, -math.degrees(math.atan2(dz, dx)), 'y')
    return kit.translate(piece, (start[0] + end[0]) / 2, 0.0, (start[1] + end[1]) / 2)


# The figure's lines (x, z), metres in the face: a walker with a staff in each hand, as tall as the face allows.
FIGURE = [
    ((3.2, 2.35), (3.2, 1.7)), ((3.04, 2.3), (3.36, 2.3)), ((3.04, 2.3), (2.62, 2.0)), ((2.62, 2.0), (2.34, 2.22)),
    ((3.36, 2.3), (3.78, 2.0)), ((3.78, 2.0), (4.06, 2.22)), ((3.1, 1.7), (3.3, 1.7)), ((3.12, 1.7), (2.92, 1.02)),
    ((2.92, 1.02), (2.72, 0.42)), ((2.72, 0.42), (2.5, 0.4)), ((3.28, 1.7), (3.48, 1.02)), ((3.48, 1.02), (3.66, 0.42)),
    ((3.66, 0.42), (3.88, 0.4)), ((2.3, 0.42), (2.3, 2.86)), ((4.1, 0.42), (4.1, 2.86)),
]


def chalk_figure(kit, entry):
    """A face of knapped flint, dark, with a figure cut into it and filled white with chalk: a walker holding a staff
    in each hand. A step of chalk before it holds two candles and the shells laid there."""
    draw = random.Random(entry['module'])
    made = ground.ground(kit, ground.steps(0.0, SIDE, 16), ground.steps(0.0, 3.2, 8), lambda x, y: 0.0,
                         lambda x, y: 'floor')
    made.append(kit.box(0.04, 0.0, 0.0, SIDE - 0.04, 0.38, 3.05, part='stoneAlt'))
    for column in range(25):
        for row in range(12):
            x, z = 0.08 + column * 0.25, 0.02 + row * 0.25
            made.append(kit.box(x, 0.38, z, x + 0.23, 0.38 + draw.uniform(0.008, 0.03), z + 0.23, part='stoneAlt'))
    # The figure's packed chalk wears wax, the game's plain cream, so it shows white against the flint.
    made += [_stroke(kit, start, end, 0.1, 0.38, 0.46, part='wax') for start, end in FIGURE]
    made.append(kit.ring((3.2, 0.42, 2.6), 0.2, 0.05, axis=(0.0, 1.0, 0.0), sides=16, tube_sides=4, part='wax'))
    made += forms.pick_marks(kit, 0.3, 6.1, 0.2, 2.9, 0.41, f'{entry["module"]} picks', count=24, part='stone')
    made.append(forms.chalk(kit, 1.42, 0.5, 0.0, 4.98, 1.18, 0.35, f'{entry["module"]} step', wear=0.01))
    for x in (1.7, 4.7):
        made.append(kit.lathe([(0.0, 0.35), (0.035, 0.35), (0.032, 0.47), (0.0, 0.47)], x, 0.85, 0.0, sides=8,
                              part='wax'))
        made.append(kit.cone((x, 0.85, 0.47), (x, 0.85, 0.53), 0.012, 0.0, sides=5, part='glow'))
    for x in (2.3, 2.9, 3.5, 4.1):
        made.append(forms.shell(kit, (x + draw.uniform(-0.1, 0.1), 0.86, 0.36), 0.12, turn=draw.uniform(-30, 30),
                                tilt=-90))
    return kit.join(made, entry['module'])


def fallen_shaft(kit, entry):
    """Where a shaft came down: a heap of chalk under the hole, the shaft's broken lining timbers standing out of it
    and its windlass's drum fallen with them, the rope still round it; dust spread to the walls."""
    draw = random.Random(entry['module'])
    heaped = ground.bumps(draw, 18, (1.0, 1.0, 5.4, 5.4), (0.06, 0.22), (0.3, 0.7))
    edge_in = 0.7

    def height(x, y):
        edge = min(x - edge_in, SIDE - edge_in - x, y - edge_in, SIDE - edge_in - y)
        if edge <= 0:
            share = max(0.0, edge / edge_in + 1)
            return 0.02 * share * share * (3 - 2 * share)
        fall = min(1.0, edge / 0.6) ** 1.3
        return 0.02 + fall * (0.82 * math.exp(-((x - 3.2) ** 2 + (y - 3.2) ** 2) / 2.6) + ground.lumps(heaped, x, y))

    lines = [0.0, 0.3] + ground.steps(edge_in, SIDE - edge_in, 25) + [SIDE - 0.3, SIDE]
    made = ground.ground(kit, lines, lines, height, lambda x, y: 'stone' if height(x, y) > 0.1 else 'floor')
    for number, (x, y, lean, turn) in enumerate(((2.6, 2.7, 18, 30), (3.8, 2.6, 24, 140), (3.6, 3.85, 12, 250),
                                                 (2.7, 3.7, 28, 320))):
        timber = forms.post(kit, 0.0, 0.0, 0.0, 2.1, f'{entry["module"]} lining {number}', half=0.09)
        kit.rotate(timber, lean, 'x')
        kit.rotate_z(timber, turn)
        made.append(kit.translate(timber, x, y, height(x, y) - 0.15))
    drum = kit.cylinder((-0.55, 0.0, 0.0), (0.55, 0.0, 0.0), 0.17, sides=12, part='wood')
    made.append(kit.translate(kit.rotate_z(drum, 25), 3.15, 3.2, height(3.15, 3.2) + 0.12))
    for number in range(5):
        turn = math.radians(25)
        along = -0.35 + number * 0.17
        middle = (3.15 + math.cos(turn) * along, 3.2 + math.sin(turn) * along, height(3.15, 3.2) + 0.12)
        made.append(kit.ring(middle, 0.18, 0.018, axis=(math.cos(turn), math.sin(turn), 0.0), sides=12, tube_sides=3,
                             part='rope'))
    for x, y, turn, scale in ground.scatter(draw, 7, (1.2, 1.2, 5.2, 5.2), avoid=((2.4, 2.4, 4.0, 4.0),)):
        board = kit.box(-0.6 * scale, -0.1, -0.025, 0.6 * scale, 0.1, 0.025, part='wood')
        kit.rotate(board, draw.uniform(-14, 14), 'x')
        kit.rotate_z(board, turn)
        made.append(kit.translate(board, x, y, height(x, y) + 0.03))
    for x, y, turn, scale in ground.scatter(draw, 10, (1.0, 1.0, 5.4, 5.4), avoid=((2.3, 2.3, 4.1, 4.1),)):
        made.append(forms.chalk(kit, -0.22 * scale, -0.16 * scale, -0.12, 0.22 * scale, 0.16 * scale, 0.14,
                                f'{entry["module"]} block {x:.2f}', wear=0.02))
        kit.rotate(made[-1], draw.uniform(-20, 20), 'x')
        kit.rotate_z(made[-1], turn)
        kit.translate(made[-1], x, y, height(x, y))
    for number in range(16):
        x, y = draw.uniform(1.0, 5.4), draw.uniform(1.0, 5.4)
        made.append(kit.rock(x, y, height(x, y) - 0.04, (0.12, 0.1, 0.11), seed=f'{entry["module"]} flint {number}',
                             detail=1, roughness=0.38, part='stoneAlt'))
    return kit.join(made, entry['module'])
