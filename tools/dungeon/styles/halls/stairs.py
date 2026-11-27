"""The halls' stairs and galleries: a moulded architrave on rusticated posts over a flight's head and foot, its
keystone carved with a leaf between brass studs; a moulded string course down a flight's walls, studded; and a
gallery's parapet, panelled on both faces under a moulded coping.

The stair head stands on the landing, y 0..0.3, the flight behind it at y < 0, and leaves the way up clear below
2.9 within 1.25 of its middle; the string course and the parapet span their whole edge, x ±1.6, and repeat every
1.6, so the next ones meet them in one run.
"""
import shapes
from styles.halls import forms
from styles.halls.forms import NORTH, SOUTH, UP, leaf, run, stud
from styles.halls.openings import FRAME, IMPOST

LINTEL = 2.9
TOP = 3.2
# The posts' inner faces: an impost's moulding reaches out from them to the way up's edge, 1.25.
POST_IN = 1.3
DEPTH = 0.22


def stair_head(kit):
    """Rusticated posts on plinths under moulded imposts, carrying a stone architrave of three stones and a keystone
    proud with a carved leaf, a row of brass studs either side of it."""
    body = {'stone': [], 'stoneAlt': [], 'trim': [], 'relief': [], 'brass': []}
    courses = ((0.3, 1.17), (1.17, 2.04), (2.04, LINTEL))
    for side in (-1, 1):
        body['trim'] += shapes.bevelled_box(side * 1.25, 0.0, 0.0, side * 1.6, 0.3, 0.3, 0.025)
        for number, (low, high) in enumerate(courses):
            inner = POST_IN + (0.0 if number % 2 else 0.02)
            body['stoneAlt' if number % 2 else 'stone'] += shapes.bevelled_box(
                side * inner, 0.0, low + 0.007, side * 1.6, DEPTH - 0.01 * (number % 2), high - 0.007, 0.025, 0.006,
                seed=f'halls.stair.head.{side}.{number}')
        path = [(side * POST_IN, 0.0, 2.75), (side * POST_IN, DEPTH, 2.75), (side * 1.6, DEPTH, 2.75)]
        body['trim'] += run(path, IMPOST, UP, (side * 1.45, 0.1, 2.75))
        for x in (0.55, 0.9):
            body['brass'] += stud((side * x, DEPTH, 3.05), SOUTH, 0.024, 0.016)
    for number, (x0, x1) in enumerate(((-1.6, -0.62), (-0.62, 0.62), (0.62, 1.6))):
        body['stoneAlt' if number % 2 else 'stone'] += shapes.bevelled_box(
            x0 + 0.005, 0.0, LINTEL, x1 - 0.005, DEPTH, TOP, 0.02, 0.005, seed=f'halls.stair.head.lintel.{number}')
    body['relief'] += shapes.bevelled_box(-0.17, 0.0, LINTEL, 0.17, DEPTH + 0.03, TOP, 0.02)
    body['relief'] += leaf((0.0, DEPTH + 0.03, LINTEL + 0.03), SOUTH, 0.24, 0.2, lean=0.05, curl=0.08)
    body['trim'] += run([(-1.25, DEPTH, LINTEL), (-0.17, DEPTH, LINTEL)], FRAME, SOUTH, (0.0, 0.0, 2.0))
    body['trim'] += run([(0.17, DEPTH, LINTEL), (1.25, DEPTH, LINTEL)], FRAME, SOUTH, (0.0, 0.0, 2.0))
    return forms.made(kit, body, 'stair.head', drop=(('z', 0.0),))


# The string course's section (y, z): a flat band under a cyma and a square fillet.
COURSE = [(0.0, -0.3), (0.04, -0.3), (0.04, 0.16), (0.06, 0.18), (0.09, 0.23), (0.12, 0.28), (0.14, 0.32),
          (0.14, 0.4), (0.0, 0.4)]


def stair_side(kit):
    """A moulded string course: a flat band, a cyma and a fillet, brass studs along the band every 1.6."""
    body = {'trim': shapes.extrude_outline(COURSE, -1.6, 1.6, 'yz'), 'brass': []}
    for x in (-0.8, 0.8):
        body['brass'] += stud((x, 0.04, -0.06), SOUTH, 0.024, 0.016, 4)
    return forms.made(kit, body, 'stair.side', smooth=None, drop=(('y', 0.0),))


# The parapet's coping (y, z): overhanging its body both ways with a chamfered drip, a rounded top.
COPING = [(0.0, 0.84), (0.25, 0.84), (0.25, 0.9), (0.235, 0.95), (0.2, 1.0), (0.05, 1.0), (0.015, 0.95), (0.0, 0.9)]
DADO = (0.035, 0.215)


def balustrade(kit):
    """A solid parapet: a plinth, a dado with a moulded panel on each face every 1.6 and a brass boss in each, under
    an overhanging coping."""
    body = {'trim': shapes.bevelled_box(-1.6, 0.0, 0.0, 1.6, 0.25, 0.16, 0.02),
            'stoneAlt': shapes.box(-1.6, DADO[0], 0.16, 1.6, DADO[1], 0.84),
            'brass': []}
    body['trim'] += shapes.extrude_outline(COPING, -1.6, 1.6, 'yz')
    panel = []
    for middle in (-0.8, 0.8):
        for y, toward in ((DADO[0], NORTH), (DADO[1], SOUTH)):
            corners = [(middle - 0.6, y, 0.26), (middle + 0.6, y, 0.26), (middle + 0.6, y, 0.74),
                       (middle - 0.6, y, 0.74)]
            panel += run(corners, [(out * 0.6, up * 0.6) for out, up in FRAME], toward, (middle, y, 0.5),
                         closed=True)
            body['brass'] += stud((middle, y, 0.5), toward, 0.04, 0.02, 6)
    body['trim'] += panel
    return forms.made(kit, body, 'balustrade', smooth=None, drop=(('z', 0.0),))
