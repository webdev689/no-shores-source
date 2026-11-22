"""The Great Hearth: a fireplace against the wall, its masonry cheeks carved and capped, a great lintel under a
mantel, a carved sloping hood and a chimney breast bearing a shield; andirons, logs and a fire on its hearthstone
before an iron fireback; a brass fender and a rug before it. Built to its solids: the hearth [0.6, 0, 5.8, 1.3]
to 2.4 and the fender [1.2, 1.3, 5.2, 1.6] to 0.5; its fire lights (3.2, 0.6, 0.5).
"""
import random

import details
import shapes
from styles.halls import dressing, forms
from styles.halls.forms import SOUTH, UP, flame, leaf, run, stud

WIDTH_M, DEPTH_M = 6.4, 3.2
CHEEKS = ((0.6, 1.5), (4.9, 5.8))
FRONT = 1.3
# The cheeks' capitals, (out, up): they may stand out 0.05 past the hearth's solid, as far as the walk zone allows.
CAPITAL = [(0.0, 0.0), (0.02, 0.0), (0.02, 0.03), (0.04, 0.08), (0.05, 0.12), (0.05, 0.15), (0.0, 0.15)]
NOSING = [(0.0, -0.12), (0.03, -0.1), (0.05, -0.06), (0.06, -0.02), (0.06, 0.0), (0.0, 0.0)]


def _cheeks():
    """The two masonry cheeks of the firebox: a plinth, three courses with a carved panel, a moulded capital."""
    found = {'trim': [], 'stone': [], 'stoneAlt': [], 'relief': []}
    for x0, x1 in CHEEKS:
        found['trim'] += forms.slab(x0, 0.0, x1, FRONT + 0.02, 0.25, 0.015)
        for number, (low, high) in enumerate(((0.25, 0.7), (0.7, 1.15), (1.15, 1.6))):
            found['stoneAlt' if number % 2 else 'stone'] += shapes.bevelled_box(
                x0 + 0.03, 0.0, low + 0.006, x1 - 0.03, FRONT, high - 0.006, 0.02, 0.006,
                seed=f'halls.great-hearth.{x0}.{number}')
        found['relief'] += shapes.box(x0 + 0.18, FRONT, 0.42, x1 - 0.18, FRONT + 0.015, 1.45)
        path = [(x0 + 0.02, 0.0, 1.6), (x0 + 0.02, FRONT, 1.6), (x1 - 0.02, FRONT, 1.6), (x1 - 0.02, 0.0, 1.6)]
        found['trim'] += run(path, CAPITAL, UP, ((x0 + x1) / 2, 0.5, 1.6), caps=False)
    return found


def _overmantel():
    """The lintel with its carved frieze, the mantel shelf studded in brass, the carved sloping hood with a row of
    leaves at its foot, and the chimney breast with its shield."""
    found = {'trim': forms.slab(0.6, 0.0, 5.8, 1.33, 2.2, 0.02, 1.75), 'relief': [], 'stone': [], 'brass': []}
    found['trim'] += shapes.box(1.5, 0.05, 1.75, 4.9, 1.33, 1.76)
    found['relief'] += shapes.box(1.0, 1.33, 1.83, 5.4, 1.345, 2.12)
    found['trim'] += shapes.bevelled_box(0.45, 0.0, 2.2, 5.95, 1.55, 2.32, 0.02)
    found['trim'] += run([(0.45, 0.0, 2.32), (0.45, 1.55, 2.32), (5.95, 1.55, 2.32), (5.95, 0.0, 2.32)],
                         NOSING, UP, (3.2, 0.5, 2.32), caps=False)
    for x in (0.75, 1.4, 2.05, 2.7, 3.7, 4.35, 5.0, 5.65):
        found['brass'] += stud((x, 1.61, 2.27), SOUTH, 0.025, 0.016, 5)
    low = [(0.75, 1.4, 2.42), (5.65, 1.4, 2.42)]
    high = [(1.7, 0.75, 3.05), (4.7, 0.75, 3.05)]
    found['relief'] += [shapes.facing(shapes.flat([low[0], low[1], high[1], high[0]]), (0.0, 0.75, 0.66))]
    found['stone'] += [shapes.facing(shapes.flat([low[0], high[0], (1.7, 0.0, 3.05), (0.75, 0.0, 2.42)]),
                                     (-0.6, 0.0, 0.8)),
                       shapes.facing(shapes.flat([low[1], high[1], (4.7, 0.0, 3.05), (5.65, 0.0, 2.42)]),
                                     (0.6, 0.0, 0.8))]
    found['stone'] += [shapes.facing(shapes.flat([(0.75, 1.4, 2.32), (5.65, 1.4, 2.32), low[1], low[0]]), SOUTH)]
    for x, way in ((0.75, -1.0), (5.65, 1.0)):
        found['stone'].append(shapes.facing(shapes.flat([(x, 0.0, 2.32), (x, 1.4, 2.32), (x, 1.4, 2.42),
                                                         (x, 0.0, 2.42)]), (way, 0.0, 0.0)))
    for number in range(9):
        x = 1.0 + 0.55 * number
        found['relief'] += leaf((x, 1.36, 2.44), (0.0, 0.75, 0.66), 0.36, 0.34, lean=0.1, curl=0.3,
                                up=(0.0, -0.66, 0.75))
    found['stone'] += shapes.box(1.7, 0.0, 3.05, 4.7, 0.75, 3.9)
    found['trim'] += run([(1.7, 0.0, 3.05), (1.7, 0.75, 3.05), (4.7, 0.75, 3.05), (4.7, 0.0, 3.05)],
                         [(0.0, 0.0), (0.04, 0.0), (0.05, 0.03), (0.03, 0.06), (0.0, 0.08)], UP, (3.2, 0.3, 3.05),
                         caps=False)
    return forms.merge(found, dressing.heraldry(3.2, 0.78, 3.84, 0.5, 0.6, 0.05))


def _fire():
    """The hearthstone and iron fireback, two andirons with brass knobs, three logs across them on a bed of coals,
    and the fire's flames."""
    draw = random.Random('halls.great-hearth.fire')
    found = {'stoneAlt': forms.slab(1.5, 0.0, 4.9, FRONT, 0.06, 0.01), 'iron': [], 'brass': [], 'wood': [],
             'ember': [], 'glow': []}
    back = [(2.0, 0.06), (4.4, 0.06), (4.4, 1.05), (4.1, 1.3), (3.2, 1.42), (2.3, 1.3), (2.0, 1.05)]
    found['iron'] += shapes.extrude_outline(back, 0.0, 0.04, 'xz')
    for x in (2.3, 4.1):
        found['iron'] += forms.tube([(x - 0.13, 1.08, 0.06), (x, 1.08, 0.2), (x + 0.13, 1.08, 0.06)], 0.02, 4, 0.1)
        found['iron'] += forms.tube([(x, 1.08, 0.2), (x, 1.08, 0.55)], 0.024, 5, 1.0)
        found['iron'] += forms.tube([(x, 1.08, 0.24), (x, 0.3, 0.24), (x, 0.25, 0.06)], 0.018, 4, 0.5)
        found['brass'] += forms.turned([(0.0, 0.0), (0.035, 0.01), (0.045, 0.05), (0.03, 0.085), (0.0, 0.1)],
                                       (x, 1.08, 0.55), 0, 360, 8)
    for start, end, radius in (((1.95, 0.55, 0.33), (4.45, 0.6, 0.33), 0.09),
                               ((2.05, 0.8, 0.32), (4.35, 0.76, 0.32), 0.08),
                               ((2.25, 0.66, 0.48), (4.15, 0.72, 0.47), 0.075)):
        found['wood'] += forms.grain(shapes.cylinder(start, end, radius, 8))
    found['ember'] += details.rock(3.2, 0.66, 0.06, (2.5, 0.85, 0.16), seed='halls.great-hearth.coals', detail=1,
                                   roughness=0.3)
    # Tongues in clusters along the logs, tallest in the middle of the fire, leaning toward the flue.
    for middle in (2.25, 2.75, 3.2, 3.65, 4.15):
        tall = 1.0 - abs(middle - 3.2) / 1.6
        for _ in range(3):
            x, y = middle + draw.uniform(-0.18, 0.18), draw.uniform(0.5, 0.82)
            found['glow'] += flame(x, y, draw.uniform(0.3, 0.42), draw.uniform(0.3, 0.45) + 0.45 * tall * draw.random(),
                                   draw.uniform(0.07, 0.15), (draw.uniform(-0.08, 0.08), draw.uniform(-0.12, 0.0)), 6)
    return found


def _fender():
    """A brass fender before the fire: turned posts, a brass top rail and an iron foot rail, iron bars between."""
    found = {'brass': [], 'iron': []}
    post = [(0.0, 0.0), (0.04, 0.0), (0.045, 0.03), (0.02, 0.07), (0.018, 0.38), (0.035, 0.42), (0.04, 0.46),
            (0.0, 0.5)]
    for x in (1.25, 2.2, 3.2, 4.2, 5.15):
        found['brass'] += forms.turned(post, (x, 1.45, 0.0), 0, 360, 6)
    found['brass'] += forms.tube([(1.25, 1.45, 0.45), (5.15, 1.45, 0.45)], 0.02, 5, 5.0)
    found['iron'] += forms.tube([(1.25, 1.45, 0.08), (5.15, 1.45, 0.08)], 0.015, 4, 5.0)
    for number in range(1, 20):
        x = 1.25 + 3.9 * number / 20
        found['iron'] += forms.tube([(x, 1.45, 0.08), (x, 1.45, 0.45)], 0.008, 3, 1.0)
    return found


def _before():
    """A rug on the floor before the fender, fringed at its ends, and the fire irons leaning in the hearth's east
    corner."""
    draw = random.Random('halls.great-hearth.rug')
    found = {'cloth': forms.slab(1.7, 1.78, 4.7, 2.95, 0.016, 0.004), 'rope': [], 'iron': [], 'brass': []}
    for side, edge in ((-1, 1.7), (1, 4.7)):
        for number in range(12):
            y = 1.81 + 1.11 * number / 11
            tip = (edge + side * draw.uniform(0.05, 0.08), y + draw.uniform(-0.02, 0.02), 0.004)
            found['rope'].append(shapes.facing(shapes.flat([(edge, y - 0.012, 0.012), (edge, y + 0.012, 0.012),
                                                            (tip[0], tip[1] + 0.007, 0.004),
                                                            (tip[0], tip[1] - 0.007, 0.004)]), UP))
    for foot, top in (((4.8, 1.2, 0.06), (4.87, 1.14, 0.95)), ((4.72, 1.24, 0.06), (4.86, 1.04, 0.9))):
        found['iron'] += forms.tube([foot, top], 0.011, 4, 2.0)
        found['brass'] += forms.turned([(0.0, 0.0), (0.025, 0.01), (0.028, 0.04), (0.0, 0.06)], top, 0, 360, 6)
    return found


def great_hearth(kit):
    """The Great Hearth, one object."""
    found = forms.merge({'floor': forms.ground(0.0, 0.0, WIDTH_M, DEPTH_M)}, _cheeks(), _overmantel(), _fire(),
                        _fender(), _before())
    return forms.made(kit, found, 'halls.great-hearth', drop=(('y', 0.0),))
