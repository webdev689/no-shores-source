"""The High Seat: a two-step dais against the wall, carpeted up its middle to a carved stone throne with a high crested
back; two torn banners and a heraldic shield on the wall behind it, and a brazier burning at each front corner of
the dais. Built to its solids: the dais [0.4, 0, 6.0, 3.2] to 0.4, the throne [2.2, 0.1, 4.2, 1.6] to 2.6 and
the braziers at (0.9, 2.7) and (5.5, 2.7) to 1.0.
"""
import math
import random

import details
import shapes
from styles.halls import dressing, forms
from styles.halls.forms import SOUTH, UP, run, stud

# A step's moulded nosing, (out, up) from its top edge.
NOSING = [(0.0, -0.06), (0.025, -0.05), (0.04, -0.025), (0.04, 0.0), (0.0, 0.0)]
SIDE_M = 6.4


def _step(x0, x1, depth, low, high):
    """A step of the dais from the wall, its nosing returned round its front and sides. {part: faces}"""
    found = {'stoneAlt': forms.slab(x0, 0.0, x1, depth, high, 0.006, low)}
    path = [(x0, 0.0, high), (x0, depth, high), (x1, depth, high), (x1, 0.0, high)]
    found['trim'] = run(path, NOSING, UP, ((x0 + x1) / 2, depth / 2, high), caps=False)
    return found


def _carpet(x0, x1):
    """A carpet laid from the floor up both steps to the throne's foot, brass rods holding it at each riser's foot
    and a fringe at its end on the floor."""
    rises = [(6.1, 0.012), (3.248, 0.012), (3.248, 0.214), (2.365, 0.214), (2.365, 0.414), (1.24, 0.414)]
    faces = []
    for (y_a, z_a), (y_b, z_b) in zip(rises, rises[1:]):
        toward = UP if abs(z_a - z_b) < 1e-6 else SOUTH
        faces.append(shapes.facing(shapes.flat([(x0, y_a, z_a), (x1, y_a, z_a), (x1, y_b, z_b), (x0, y_b, z_b)]),
                                   toward))
    found = {'cloth': faces, 'brass': [], 'rope': []}
    for y, z in ((3.29, 0.03), (2.39, 0.232)):
        found['brass'] += forms.tube([(x0 - 0.05, y, z), (x1 + 0.05, y, z)], 0.012, 5, 2.0)
    draw = random.Random('halls.high-seat.carpet')
    for number in range(16):
        x = x0 + 0.03 + (x1 - x0 - 0.06) * number / 15
        tip = (x + draw.uniform(-0.02, 0.02), 6.1 + draw.uniform(0.05, 0.09), 0.004)
        found['rope'].append(shapes.facing(shapes.flat([(x - 0.012, 6.09, 0.013), (x + 0.012, 6.09, 0.013),
                                                        (tip[0] + 0.007, tip[1], 0.004),
                                                        (tip[0] - 0.007, tip[1], 0.004)]), UP))
    return found


def _throne(z0=0.4):
    """A carved stone throne on the upper step: a moulded seat with a carved apron and a dyed cushion, arms ending in
    scrolls, and a high back hung with cloth under a crested gable, brass finials on its posts."""
    found = {'trim': [], 'relief': [], 'cloth': [], 'brass': []}
    found['trim'] += forms.slab(2.45, 0.38, 3.95, 1.2, z0 + 0.42, 0.02, z0)
    found['relief'] += shapes.box(2.62, 1.2, z0 + 0.07, 3.78, 1.22, z0 + 0.34)
    found['cloth'] += shapes.bevelled_box(2.5, 0.42, z0 + 0.42, 3.9, 1.16, z0 + 0.54, 0.045)
    for low, high in ((2.22, 2.45), (3.95, 4.18)):
        found['trim'] += forms.slab(low, 0.3, high, 1.3, z0 + 0.74, 0.02, z0)
        found['relief'] += shapes.box(low - 0.008 if low < 3 else high, 0.5, z0 + 0.12,
                                      low if low < 3 else high + 0.008, 1.12, z0 + 0.6)
        middle = (low + high) / 2
        curl = [(middle, 1.3 - 0.07 + 0.07 * math.sin(math.radians(a)),
                 z0 + 0.67 + 0.07 * math.cos(math.radians(a))) for a in range(0, 331, 30)]
        found['relief'] += forms.tube(curl, 0.045, 6, 0.05)
        found['brass'] += stud((middle, 1.31, z0 + 0.4), SOUTH, 0.03, 0.02, 5)
    gable = [(2.28, z0 + 0.42), (4.12, z0 + 0.42), (4.12, 2.05), (3.95, 2.18), (3.72, 2.28), (3.48, 2.34),
             (3.32, 2.46), (3.2, 2.58), (3.08, 2.46), (2.92, 2.34), (2.68, 2.28), (2.45, 2.18), (2.28, 2.05)]
    found['trim'] += forms.hidden(shapes.extrude_outline(gable, 0.12, 0.38, 'xz'), 'z', z0 + 0.42)
    found['cloth'] += shapes.box(2.56, 0.38, z0 + 0.6, 3.84, 0.395, 2.0)
    found['relief'] += shapes.extrude_outline([(2.7, 2.06), (3.7, 2.06), (3.7, 2.18), (3.42, 2.27), (3.2, 2.42),
                                               (2.98, 2.27), (2.7, 2.18)], 0.38, 0.4, 'xz')
    for x, z in ((2.62, z0 + 0.66), (3.78, z0 + 0.66), (2.62, 1.94), (3.78, 1.94), (3.2, 2.24)):
        found['brass'] += stud((x, 0.395, z), SOUTH, 0.025, 0.018, 5)
    for x in (2.33, 4.07):
        found['brass'] += forms.turned([(0.0, 0.0), (0.06, 0.0), (0.065, 0.03), (0.035, 0.07), (0.05, 0.12),
                                        (0.02, 0.18), (0.0, 0.2)], (x, 0.25, 2.05), 0, 360, 8)
    return found


def _canopy(x0=2.0, x1=4.4, depth=1.45, top=3.42):
    """A cloth of estate over the throne: a timber tester hung from the wall on iron rods, studded in brass, its
    valances falling in folds on three sides, and a cloth hanging down the wall behind the throne."""
    found = {'wood': forms.hidden(shapes.bevelled_box(x0, 0.0, top - 0.12, x1, depth, top, 0.02), 'z', top),
             'iron': [], 'brass': []}
    for x in (x0 + 0.05, x1 - 0.05):
        found['iron'] += forms.tube([(x, 0.02, 3.86), (x, depth - 0.05, top)], 0.014, 4, 3.0)
    for number in range(7):
        found['brass'] += stud((x0 + 0.2 + (x1 - x0 - 0.4) * number / 6, depth, top - 0.06), SOUTH, 0.022, 0.014, 5)
    found['cloth'] = details.drape(x0, x1, top - 0.1, top - 0.46, depth, folds=6, depth=0.04, thickness=0.01,
                                   ragged=0.05, rows=2, seed='halls.high-seat.valance')
    for side, edge in ((-1, x0), (1, x1)):
        sheet = details.drape(0.0 if side < 0 else -depth, depth if side < 0 else 0.0, top - 0.1, top - 0.46, 0.0,
                              folds=4, depth=0.04, thickness=0.01, ragged=0.05, rows=2,
                              seed=f'halls.high-seat.valance.{side}')
        found['cloth'] += forms.moved(sheet, (lambda p, e=edge: (e - p[1], p[0], p[2])) if side < 0 else
                                      (lambda p, e=edge: (e + p[1], -p[0], p[2])))
    found['cloth'] += details.drape(x0 + 0.05, x1 - 0.05, top - 0.12, 0.85, 0.005, folds=5, depth=0.03,
                                    thickness=0.01, rows=6, seed='halls.high-seat.cloth')
    return found


def high_seat(kit):
    """The High Seat: {part: faces} joined into one object."""
    found = forms.merge(
        {'floor': forms.ground(0.0, 3.2, SIDE_M, SIDE_M) + forms.ground(0.0, 0.0, 0.4, 3.2)
         + forms.ground(6.0, 0.0, SIDE_M, 3.2)},
        _step(0.4, 6.0, 3.2, 0.0, 0.2), _step(1.5, 4.9, 2.3, 0.2, 0.4), _carpet(2.6, 3.8), _throne(),
        forms.brazier(0.9, 2.7, 0.2, 'halls.high-seat.west'), forms.brazier(5.5, 2.7, 0.2, 'halls.high-seat.east'),
        dressing.banner(0.85, 1.95, 3.7, 1.45, 0.115, 'halls.high-seat.banner.west'),
        dressing.banner(4.45, 5.55, 3.7, 1.45, 0.115, 'halls.high-seat.banner.east'),
        _canopy(), dressing.heraldry(3.2, 0.085, 3.22, 0.5, 0.6, 0.05))
    draw = random.Random('halls.high-seat.floor')
    # The floor before the dais has broken: a few flags heaved and cracked, low enough to walk over.
    broken = []
    for x, y in ((0.9, 4.6), (1.4, 5.6), (5.1, 4.2), (4.6, 5.8), (2.0, 3.8)):
        width, depth = draw.uniform(0.35, 0.6), draw.uniform(0.3, 0.5)
        broken += forms.slab(x, y, x + width, y + depth, draw.uniform(0.025, 0.04), 0.008)
    found['stone'] = found.get('stone', []) + broken
    return forms.made(kit, found, 'halls.high-seat', drop=(('y', 0.0),))
