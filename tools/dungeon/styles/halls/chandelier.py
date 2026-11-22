"""The Fallen Chandelier: the hall's great iron wheel crashed onto a feasting table and broke it in two. The wheel
leans across the table's south edge, its south rim on the floor and its north side high, its arms bent or snapped,
candles still burning on its hub and in one bent-up cup; plate and goblets spilt, benches thrown, its chain heaped
beside it, the flags cracked. Everything stands inside its solid [0.8, 0.8, 5.6, 5.6] to 0.9; its candles light
(3.2, 3.2, 0.9) and (1.6, 4.4, 0.6).
"""
import math
import random

import details
import shapes
from styles.halls import forms
from styles.halls.forms import UP

SIDE_M = 6.4
HUB = (3.2, 3.2, 0.68)
# The wheel leans about the east-west line through its hub, its south rim down on the floor.
LEAN = math.radians(-26.0)
WHEEL_R = 1.45
TABLE_Y = (1.95, 3.05)
# The south-west arm, bent up when the wheel struck, holds the candle that lights (1.6, 4.4, 0.6).
FIRST = math.degrees(math.atan2(0.6, -0.8))


def _lay(point):
    """A point of the wheel, built flat round the origin, where it fell."""
    x, y, z = point
    return (x + HUB[0], y * math.cos(LEAN) - z * math.sin(LEAN) + HUB[1],
            y * math.sin(LEAN) + z * math.cos(LEAN) + HUB[2])


def _clear(x, y, z):
    """A point of the wheel lifted, in its own frame, as far as keeps it off the floor: arms crushed upward."""
    least = (0.06 - HUB[2] - y * math.sin(LEAN)) / math.cos(LEAN)
    return (x, y, max(z, least))


def _tilt(pivot_x, pivot_z, degrees):
    """A point turned about the east-west line through (pivot_x, pivot_z): a broken half of the table dropping its
    end, a heaved flag."""
    turn = math.radians(degrees)

    def place(point):
        x, y, z = point[0] - pivot_x, point[1], point[2] - pivot_z
        return (pivot_x + x * math.cos(turn) + z * math.sin(turn), y, pivot_z - x * math.sin(turn) + z * math.cos(turn))
    return place


def _table():
    """The feasting table broken in two, each half still on its trestle at its outer end, its inner end dropped and
    split; a leg from the middle thrown on the floor."""
    found = {'wood': []}
    north, south = TABLE_Y
    for low, high, pivot, turn in ((1.0, 3.12, 1.25, 13.0), (3.28, 5.4, 5.15, -13.0)):
        boards = details.planks((low, north, 0.71), (high, south, 0.78), 'x', 'y', 0.26, 0.01, 0.14,
                                seed=f'halls.fallen-chandelier.{low}')
        found['wood'] += forms.moved(forms.grain(boards), _tilt(pivot, 0.71, turn))
        apron = shapes.box(low + 0.1, north + 0.1, 0.62, high - 0.1, north + 0.17, 0.71)
        found['wood'] += forms.moved(apron, _tilt(pivot, 0.71, turn))
        leg = pivot - 0.07
        for y in (north + 0.12, south - 0.22):
            found['wood'] += forms.grain(forms.hidden(shapes.box(leg, y, 0.0, leg + 0.14, y + 0.1, 0.71), 'z', 0.0))
        found['wood'] += forms.hidden(shapes.box(leg - 0.04, north + 0.05, 0.0, leg + 0.18, south - 0.05, 0.08), 'z',
                                      0.0)
    found['wood'] += forms.hidden(shapes.box(2.6, 1.48, 0.0, 3.32, 1.6, 0.1), 'z', 0.0)
    return found


def _benches():
    """A bench still standing north of the table, and another thrown on its side to the south-east."""
    found = {'wood': forms.slab(1.3, 1.36, 2.6, 1.7, 0.45, 0.01, 0.39)}
    for x in (1.45, 2.35):
        found['wood'] += forms.grain(forms.hidden(shapes.box(x, 1.4, 0.0, x + 0.1, 1.66, 0.39), 'z', 0.0))
    found['wood'] += forms.hidden(shapes.box(3.9, 4.95, 0.0, 5.4, 5.01, 0.34), 'z', 0.0)
    for x in (4.05, 5.15):
        found['wood'] += forms.hidden(shapes.box(x, 5.01, 0.02, x + 0.1, 5.39, 0.3), 'z', 0.0)
    return found


def _wheel():
    """The wheel, built flat round its hub: a heavy iron rim and an inner ring joined by spokes, brass rosettes on the
    rim, a brass crown at the hub with burning candles, and eight arms with brass pans, some bent, one snapped off,
    their candles burnt down, fallen or one still alight. {part: faces}"""
    draw = random.Random('halls.fallen-chandelier.wheel')
    found = {'iron': shapes.ring((0.0, 0.0, 0.0), WHEEL_R, 0.065, UP, 28, 6), 'brass': [], 'wax': [], 'glow': []}
    found['iron'] += shapes.ring((0.0, 0.0, 0.0), 1.28, 0.028, UP, 24, 4)
    found['iron'] += shapes.ring((0.0, 0.0, 0.16), 0.3, 0.04, UP, 12, 4)
    found['brass'] += forms.turned([(0.0, 0.06), (0.24, 0.12), (0.29, 0.22), (0.26, 0.27), (0.0, 0.25)],
                                   (0.0, 0.0, 0.0), 0, 360, 10)
    found['brass'] += forms.turned([(0.0, 0.06), (0.1, 0.02), (0.13, -0.08), (0.08, -0.16), (0.0, -0.22)],
                                   (0.0, 0.0, 0.0), 0, 360, 8)
    for number in range(3):
        turn = math.radians(30 + 120 * number)
        found = forms.merge(found, forms.candle(0.13 * math.cos(turn), 0.13 * math.sin(turn), 0.25,
                                                draw.uniform(0.1, 0.18), 0.028))
    for number in range(8):
        turn = math.radians(FIRST + 45 * number)
        way = (math.cos(turn), math.sin(turn))
        spoke = math.radians(FIRST + 22.5 + 45 * number)
        found['iron'] += forms.tube([(0.3 * math.cos(spoke), 0.3 * math.sin(spoke), 0.15),
                                     (WHEEL_R * math.cos(spoke), WHEEL_R * math.sin(spoke), 0.0)], 0.024, 4, 2.0)
        found['brass'] += forms.stud((WHEEL_R * math.cos(spoke), WHEEL_R * math.sin(spoke), 0.06), UP, 0.05, 0.03, 6)
        if number == 5:
            found['iron'] += forms.tube([(way[0] * WHEEL_R, way[1] * WHEEL_R, 0.0),
                                         (way[0] * 1.62, way[1] * 1.62, 0.02)], 0.022, 4, 1.0)
            continue
        lift = 0.38 if number == 0 else draw.uniform(-0.08, 0.06)
        swing = draw.uniform(-0.3, 0.3) if number % 3 == 1 else 0.0
        side = (-way[1] * swing, way[0] * swing)
        points = [_clear(way[0] * reach + side[0] * share, way[1] * reach + side[1] * share, rise + lift * share)
                  for reach, rise, share in ((WHEEL_R, 0.0, 0.0), (1.72, 0.04, 0.45), (1.95, 0.12, 1.0))]
        found['iron'] += forms.tube(points, 0.022, 4, 0.2)
        cup = (points[-1][0], points[-1][1], points[-1][2] + 0.02)
        found['brass'] += forms.turned([(0.0, -0.03), (0.085, 0.0), (0.09, 0.018), (0.0, 0.0)], cup, 0, 360, 6)
        if number == 0:
            found = forms.merge(found, forms.candle(cup[0], cup[1], cup[2], 0.09, 0.026))
        elif number in (1, 3, 6):
            found = forms.merge(found, forms.candle(cup[0], cup[1], cup[2], draw.uniform(0.04, 0.11), 0.026, False))
    return found


def _spilt():
    """The snapped arm, fallen candles, plate and goblets, the chain heaped where it fell, and flags cracked and
    heaved round where the wheel struck."""
    draw = random.Random('halls.fallen-chandelier.spilt')
    found = {'iron': [], 'brass': [], 'wax': [], 'stoneAlt': []}
    found['iron'] += forms.tube([(4.95, 3.85, 0.025), (5.2, 3.95, 0.025), (5.35, 4.15, 0.07)], 0.022, 4, 0.2)
    found['brass'] += forms.turned([(0.0, -0.03), (0.085, 0.0), (0.09, 0.018), (0.0, 0.0)], (5.38, 4.2, 0.1), 0,
                                   360, 6)
    for x, y, turn in ((2.3, 1.15, 20), (4.4, 4.45, 110), (1.25, 3.6, 70)):
        way = (math.cos(math.radians(turn)), math.sin(math.radians(turn)), 0.0)
        found['wax'] += shapes.cylinder((x, y, 0.026), (x + way[0] * 0.2, y + way[1] * 0.2, 0.026), 0.026, 6)
    plate = [(0.0, 0.0), (0.14, 0.0), (0.16, 0.02), (0.13, 0.014), (0.0, 0.007)]
    goblet = [(0.0, 0.0), (0.055, 0.0), (0.014, 0.025), (0.014, 0.09), (0.05, 0.12), (0.056, 0.19), (0.044, 0.19),
              (0.0, 0.13)]
    for x, y in ((1.7, 1.05), (4.9, 4.4), (2.5, 4.95), (5.3, 1.4)):
        found['brass'] += forms.turned(plate, (x, y, 0.0), 0, 360, 10)
    found['brass'] += forms.turned(goblet, (4.6, 3.75, 0.0), 0, 360, 8)
    for x, y, turn in ((1.95, 1.75, 30), (2.9, 4.6, 200)):
        found['brass'] += shapes.revolve(goblet, (x, y, 0.056), (math.cos(math.radians(turn)),
                                                                 math.sin(math.radians(turn)), 0.0), 8)
    fall = [(3.22, 3.28, 0.93), (3.5, 3.1, 0.66), (3.8, 2.8, 0.52), (3.95, 2.3, 0.5), (4.05, 1.9, 0.2),
            (4.15, 1.68, 0.03)]
    found['iron'] += details.chain(fall + details.helix((4.45, 1.38, 0.03), 0.26, 1.6, 0.0, 10, 0.08, start=150),
                                   0.13, 0.013, 4, 3)
    for x, y in ((1.0, 4.7), (2.3, 5.0), (4.9, 3.25), (3.5, 0.9), (1.0, 0.95)):
        width, depth = draw.uniform(0.4, 0.6), draw.uniform(0.3, 0.5)
        found['stoneAlt'] += forms.moved(forms.slab(x, y, x + width, y + depth, 0.05, 0.008),
                                         _tilt(x, 0.0, draw.uniform(-6, 6)))
    return found


def fallen_chandelier(kit):
    """The Fallen Chandelier, one object."""
    found = forms.merge({'floor': forms.ground(0.0, 0.0, SIDE_M, SIDE_M)}, _table(), _benches(),
                        {part: forms.moved(faces, _lay) for part, faces in _wheel().items()}, _spilt())
    return forms.made(kit, found, 'halls.fallen-chandelier')
