"""The halls' openings: the two doorway dressings, the portal's grand arch and the exit's crested surround, each built
round the parts the code keeps (a doorway's jambs at x ±0.9 under its lintel at 2.8, the portal's and the exit's
1.4 × 2.4 faces at y 0.04) and inside the plan's envelopes.
"""
import math

import details
import shapes
from styles.halls import forms
from styles.halls.forms import DOWN, NORTH, SOUTH, UP, arc, leaf, run, stud

HALF = 0.9
SPRING = 1.9
FLOOR = (('z', 0.0),)
FLOOR_AND_WALL = (('z', 0.0), ('y', 0.0))
# Moulding profiles, (out, proud) metres: out away from the opening or edge they frame, proud off the face.
ARCHIVOLT = [(0.0, 0.0), (0.0, 0.03), (0.035, 0.03), (0.035, 0.042), (0.12, 0.042), (0.165, 0.06), (0.23, 0.06),
             (0.24, 0.0)]
PORTAL_ARCHIVOLT = [(0.0, 0.0), (0.0, 0.025), (0.03, 0.025), (0.03, 0.04), (0.11, 0.04), (0.15, 0.06), (0.175, 0.06),
                    (0.18, 0.0)]
IMPOST = [(0.0, 0.0), (0.014, 0.0), (0.014, 0.03), (0.03, 0.06), (0.045, 0.1), (0.05, 0.11), (0.05, 0.15),
          (0.0, 0.15)]
FRAME = [(0.0, 0.0), (0.0, 0.02), (0.015, 0.035), (0.03, 0.04), (0.06, 0.04), (0.07, 0.03), (0.08, 0.0)]
HOOD = [(0.0, 0.0), (0.015, 0.0), (0.015, 0.02), (0.04, 0.04), (0.065, 0.07), (0.08, 0.08), (0.08, 0.12),
        (0.0, 0.12)]
SURROUND = [(0.0, 0.0), (0.0, 0.06), (0.04, 0.06), (0.04, 0.08), (0.12, 0.08), (0.13, 0.095), (0.145, 0.09),
            (0.17, 0.11), (0.2, 0.13), (0.22, 0.13), (0.23, 0.12), (0.24, 0.0)]
CORNICE = [(0.0, 0.0), (0.2, 0.0), (0.2, 0.06), (0.18, 0.06), (0.18, 0.12), (0.2, 0.13), (0.23, 0.15), (0.26, 0.17),
           (0.28, 0.19), (0.3, 0.2), (0.3, 0.24), (0.0, 0.24)]
SMALL_CORNICE = [(0.0, 0.0), (0.12, 0.0), (0.14, 0.02), (0.16, 0.04), (0.19, 0.07), (0.22, 0.09), (0.24, 0.1),
                 (0.24, 0.14), (0.0, 0.14)]
# A corbel's side, (x, z): it may reach in past the jamb to x 0.8 below 2.3, the way through's limit, and on to 0.55
# above it, where it meets the lintel.
CORBEL = [(0.93, 1.96), (1.25, 1.96), (1.25, 2.45), (0.55, 2.45), (0.556, 2.41), (0.6, 2.37), (0.68, 2.335),
          (0.8, 2.3), (0.81, 2.24), (0.84, 2.16), (0.88, 2.08), (0.91, 2.01)]


def _voussoirs(ring, stones, skip=()):
    """An arch's faces split stone by stone, alternate ones in stoneAlt, leaving out those in `skip`."""
    per = len(ring) // stones
    found = {'stone': [], 'stoneAlt': []}
    for number in range(stones):
        if number not in skip:
            found['stoneAlt' if number % 2 else 'stone'] += ring[number * per:(number + 1) * per]
    return found


def _faced(kit, parts, at, name):
    """A face's dressing on the room's side and its mirror on the corridor's, about y = `at`."""
    face = forms.made(kit, parts, name, drop=FLOOR)
    return [face, kit.mirror(face, 'y', at)]


def door_a(kit):
    """A round arch of eleven voussoirs on moulded imposts over rusticated jambs, a studded archivolt on each face and
    a carved keystone standing proud of both."""
    ring = details.arch(HALF, SPRING, 0.4, -0.05, 0.35, stones=11, joint=0.014, segments=22)
    key = details.arch(HALF, SPRING, 0.4, -0.12, 0.42, stones=11, joint=0.014, segments=22, keystone=0.1)
    body = _voussoirs(ring, 11, skip=(5,))
    body['relief'] = key[5 * len(key) // 11:6 * len(key) // 11]
    body['trim'] = []
    for side in (-1, 1):
        body['trim'] += shapes.bevelled_box(side * 0.87, -0.09, 0.0, side * 1.4, 0.39, 0.3, 0.03)
        for number, (low, high, outer) in enumerate(((0.3, 1.02, 1.3), (1.02, 1.75, 1.42))):
            body['stoneAlt' if number % 2 else 'stone'] += shapes.bevelled_box(
                side * 0.9, -0.05, low + 0.007, side * outer, 0.35, high - 0.007, 0.025, 0.006,
                seed=f'halls.door.a.{side}.{number}')
        path = [(side * 1.44, -0.05, 1.75), (side * 0.9, -0.05, 1.75), (side * 0.9, 0.35, 1.75),
                (side * 1.44, 0.35, 1.75)]
        body['trim'] += run(path, IMPOST, UP, (side * 1.2, 0.15, 1.75))
    face = {'trim': run(arc(0.0, SPRING, HALF, 180, 0, 16, -0.05), ARCHIVOLT, NORTH, (0.0, -0.05, SPRING)),
            'brass': []}
    for turn in (163, 136, 109, 71, 44, 17):
        radians = math.radians(turn)
        centre = (0.9725 * math.cos(radians), -0.09, SPRING + 0.9725 * math.sin(radians))
        face['brass'] += stud(centre, NORTH, 0.02, 0.016)
    return kit.join([forms.made(kit, body, 'door.a', drop=FLOOR), _faced(kit, face, 0.15, 'door.a.face')], 'door.a')


def door_b(kit):
    """A square-headed doorway: an iron-banded timber lintel studded with brass, on corbels carved with a hanging
    leaf, over quoined jambs; a framed carved panel under a hood above it."""
    body = {'stone': [], 'stoneAlt': [], 'trim': [], 'relief': [], 'iron': [], 'brass': []}
    leaves = {'relief': []}
    courses = ((0.28, 0.78, 1.5), (0.78, 1.2, 1.3), (1.2, 1.7, 1.5), (1.7, 2.0, 1.3))
    for side in (-1, 1):
        body['trim'] += shapes.bevelled_box(side * 0.88, -0.1, 0.0, side * 1.54, 0.4, 0.28, 0.03)
        for number, (low, high, outer) in enumerate(courses):
            body['stoneAlt' if number % 2 else 'stone'] += shapes.bevelled_box(
                side * 0.9, -0.06, low + 0.007, side * outer, 0.36, high - 0.007, 0.03, 0.006,
                seed=f'halls.door.b.{side}.{number}')
        body['relief'] += shapes.extrude_outline([(side * x, z) for x, z in CORBEL], -0.06, 0.36, 'xz')
        leaves['relief'] += leaf((side * 1.05, -0.06, 2.42), NORTH, 0.34, 0.17, lean=0.02, curl=0.06, up=DOWN)
        body['iron'] += shapes.box(side * 1.34, -0.108, 2.442, side * 1.42, 0.408, 2.808)
    body['relief'] += shapes.box(-0.95, -0.04, 2.88, 0.95, 0.34, 3.2)
    face = {'trim': [], 'brass': [], 'relief': leaves['relief']}
    for x in (-1.15, -0.58, 0.0, 0.58, 1.15):
        face['brass'] += stud((x, -0.1, 2.625), NORTH, 0.04, 0.018)
    rectangle = [(-0.95, -0.04, 2.88), (0.95, -0.04, 2.88), (0.95, -0.04, 3.2), (-0.95, -0.04, 3.2)]
    face['trim'] += run(rectangle, FRAME, NORTH, (0.0, -0.04, 3.04), closed=True)
    face['trim'] += run([(-1.2, -0.04, 3.28), (1.2, -0.04, 3.28)], HOOD, UP, (0.0, 0.5, 3.28))
    face['brass'] += stud((0.0, -0.04, 3.04), NORTH, 0.06, 0.03, 6)
    beam = kit.bevelled_box(-1.55, -0.1, 2.45, 1.55, 0.4, 2.8, bevel=0.035, wear=0.01, seed='halls.door.b.beam',
                            part='wood')
    faces = _faced(kit, face, 0.15, 'door.b.face')
    return kit.join([forms.made(kit, body, 'door.b', drop=FLOOR), beam, faces], 'door.b')


def half_column(centre, low, high, leaves=3):
    """A half-column standing out of a pier toward +y: a moulded base, a fluted octagonal shaft and a capital of
    acanthus, from z `low` to `high`, {part: faces}."""
    x, y = centre
    base = [(0.2, 0.0), (0.2, 0.025), (0.17, 0.065), (0.15, 0.09), (0.16, 0.115), (0.13, 0.14)]
    found = {'trim': shapes.bevelled_box(x - 0.21, 0.0, low, x + 0.21, y + 0.2, low + 0.12, 0.02)}
    found['trim'] += forms.turned(base, (x, y, low + 0.12), 0, 180, 8)
    shaft = [(x + px, y + py) for px, py in forms.octagon(0.13, 0.05, 0.012, 3, 0, 5)]
    found['stone'] = forms.sides(shaft, low + 0.26, high - 0.22)
    top = high - 0.22
    found['trim'] += forms.turned([(0.13, 0.0), (0.145, 0.015), (0.145, 0.03), (0.13, 0.045)], (x, y, top), 0, 180, 8)
    found['trim'] += forms.turned([(0.125, 0.045), (0.13, 0.09), (0.16, 0.17), (0.19, 0.22)], (x, y, top), 0, 180, 8)
    found['relief'] = []
    for number in range(leaves):
        turn = math.radians(20 + 140 * number / max(leaves - 1, 1))
        spoke = (math.cos(turn), math.sin(turn), 0.0)
        found['relief'] += leaf((x + spoke[0] * 0.125, y + spoke[1] * 0.125, top + 0.04), spoke, 0.17, 0.12,
                                lean=0.25, curl=0.15)
    return found


def portal(kit):
    """A grand segmental arch between two half-columns, a carved console for its keystone under a full cornice, a
    fan in its lunette and brass roundels in its spandrels."""
    spring, half, rise = 2.22, 0.9, 0.45
    radius = (half * half + rise * rise) / (2 * rise)
    middle = spring + rise - radius
    ring = details.arch(half, spring, 0.2, 0.0, 0.2, shape='segmental', rise=rise, stones=9, joint=0.012,
                        segments=18)
    body = _voussoirs(forms.hidden(ring, 'y', 0.0), 9, skip=(4,))
    body.update({'trim': [], 'relief': [], 'brass': []})
    for side in (-1, 1):
        for number, (low, high) in enumerate(((0.0, 0.72), (0.72, 1.44), (1.44, 2.14))):
            body['stone' if number % 2 else 'stoneAlt'] += shapes.bevelled_box(
                side * 0.72, 0.0, low + 0.006, side * 1.3, 0.1, high - 0.006, 0.02, 0.005,
                seed=f'halls.portal.{side}.{number}')
        for part, faces in half_column((side * 1.05, 0.08), 0.0, 2.14).items():
            body[part] = body.get(part, []) + faces
        body['trim'] += shapes.bevelled_box(side * 0.72, 0.0, 2.14, side * 1.3, 0.29, 2.22, 0.015)
        body['brass'] += _roundel(side * 1.12, 0.1, 2.56)
    curve = details.arch_curve(half, spring, 'segmental', rise=rise, segments=12)
    outline = [(-1.3, spring)] + curve + [(1.3, spring), (1.3, 2.86), (-1.3, 2.86)]
    body['stoneAlt'] += shapes.extrude_outline(outline, 0.0, 0.1, 'xz')
    path = [(x, 0.2, z) for x, z in curve]
    body['trim'] += run(path, PORTAL_ARCHIVOLT, SOUTH, (0.0, 0.2, middle))
    # The lunette fills the arch over the face's top (z 2.4), a fan of ribs spreading from its foot.
    above = 2.4 - middle
    reach = math.degrees(math.asin(above / (radius - 0.005)))
    lunette = [(x, max(z, 2.4)) for x, _, z in arc(0.0, middle, radius - 0.005, 180 - reach, reach, 10)]
    body['relief'] += shapes.extrude_outline(lunette, 0.0, 0.03, 'xz')
    for turn in (25, 57, 90, 123, 155):
        lift = math.sin(math.radians(turn))
        far = -above * lift + math.sqrt(above * above * lift * lift - above * above + radius * radius) - 0.02
        spoke = [(d * math.cos(math.radians(turn)), 0.03, 2.4 + d * lift) for d in (0.09, (0.09 + far) / 2, far)]
        body['trim'] += forms.band(spoke, SOUTH, 0.03, 0.018)
    body['brass'] += stud((0.0, 0.03, 2.47), SOUTH, 0.06, 0.03, 6)
    body['trim'] += run([(-1.3, 0.0, 2.86), (1.3, 0.0, 2.86)], CORNICE, UP, (0.0, -1.0, 2.86))
    console = [(0.0, 2.6), (0.2, 2.6), (0.235, 2.64), (0.235, 2.72), (0.26, 2.8), (0.285, 2.86), (0.285, 3.0),
               (0.0, 3.0)]
    body['relief'] += shapes.extrude_outline(console, -0.12, 0.12, 'yz')
    body['relief'] += leaf((0.0, 0.235, 2.62), SOUTH, 0.2, 0.15, lean=0.05, curl=0.08)
    for x in (-1.15, -0.85, 0.85, 1.15):
        body['brass'] += stud((x, 0.2, 2.89), SOUTH, 0.016, 0.014)
    return forms.made(kit, body, 'portal', drop=FLOOR_AND_WALL)


def _roundel(x, y, z):
    """A brass roundel on a face toward +y: a dished disc with a boss."""
    profile = [(0.09, 0.0), (0.09, 0.012), (0.06, 0.024), (0.0, 0.034)]
    return shapes.revolve(profile, (x, y, z), SOUTH, 8)[:-1]


def exit_(kit):
    """A moulded surround on plinths, a studded frieze and a broken cornice round a carved crest: a shield on a
    scrolled cartouche, leaves falling from its shoulders and a brass finial on top."""
    body = {'trim': [], 'stoneAlt': [], 'relief': [], 'brass': []}
    path = [(-0.7, 0.0, 0.3), (-0.7, 0.0, 2.4), (0.7, 0.0, 2.4), (0.7, 0.0, 0.3)]
    body['trim'] += run(path, SURROUND, SOUTH, (0.0, 0.0, 1.2))
    for side in (-1, 1):
        body['trim'] += shapes.bevelled_box(side * 0.7, 0.0, 0.0, side * 0.98, 0.17, 0.3, 0.02)
        body['trim'] += run([(side * 0.28, 0.0, 2.8), (side * 1.06, 0.0, 2.8)], SMALL_CORNICE, UP, (0.0, -1.0, 2.8))
        for x in (0.42, 0.62, 0.84):
            body['brass'] += stud((side * x, 0.1, 2.72), SOUTH, 0.02, 0.016)
        curl = [(side * (0.26 + 0.07 * math.cos(t)), 0.14, 2.66 + 0.07 * math.sin(t))
                for t in (math.radians(a) for a in range(-90, 271, 30))]
        body['trim'] += forms.tube(curl, 0.018, 6, 0.03)
        body['relief'] += leaf((side * 0.17, 0.16, 2.98), (side * 0.4, 1.0, 0.0), 0.3, 0.14, lean=0.2, curl=0.15,
                               up=(side * 0.55, 0.0, -0.85))
    body['stoneAlt'] += shapes.box(-0.94, 0.0, 2.64, 0.94, 0.1, 2.8)
    cartouche = [(-0.26, 2.56), (0.26, 2.56), (0.3, 2.7), (0.26, 2.86), (0.3, 3.0), (0.16, 3.04), (0.0, 3.0),
                 (-0.16, 3.04), (-0.3, 3.0), (-0.26, 2.86), (-0.3, 2.7)]
    body['relief'] += shapes.extrude_outline(cartouche, 0.0, 0.13, 'xz')
    crest, rim = forms.shield(0.0, 0.14, 2.98, 0.36, 0.42, 0.04, rows=6, columns=4)
    body['relief'] += crest['face'] + crest['back']
    body['trim'] += forms.tube(rim, 0.012, 5, 0.04)
    chevron = [(-0.15, 0.0, 2.68), (0.0, 0.0, 2.86), (0.15, 0.0, 2.68)]
    chevron = [(x, 0.14 + 0.04 * (1 - (x / 0.18) ** 2), z) for x, _, z in chevron]
    body['brass'] += forms.band(chevron, SOUTH, 0.05, 0.008)
    body['brass'] += forms.turned([(0.035, 0.0), (0.045, 0.02), (0.03, 0.045), (0.012, 0.06), (0.0, 0.07)],
                                  (0.0, 0.07, 3.03), 0, 360, 8)
    return forms.made(kit, body, 'exit', drop=FLOOR_AND_WALL)


def pieces(kit):
    """The halls' doorways, portal and exit: {piece: object}."""
    return {'door.a': door_a(kit), 'door.b': door_b(kit), 'portal': portal(kit), 'exit': exit_(kit)}
