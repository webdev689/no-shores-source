"""The halls' members: the column (an Attic base with leaf spurs, a fluted octagonal shaft, an acanthus capital under
a concave abacus), the fluted pilaster with its moulded cap on the walls, and the brass sconce. Shafts carry only
upright detail, since the page stretches them to any height.
"""
import math

import shapes
from styles.halls import forms
from styles.halls.forms import SOUTH, UP, leaf, run, stud

# The column's octagon, corner radius metres: inside the ±0.35 a body may meet from z 0.25 to 2.4.
SHAFT_R = 0.3
# The pilaster's half width and its stand off the wall, metres.
PILASTER = (0.38, 0.18)


def pillar_base(kit):
    """An Attic base: a square plinth, a great lower torus kept under z 0.25, a scotia and an upper torus inside the
    ±0.35 above it, an octagonal collar for the shaft, and leaf spurs reaching from the torus to the plinth's
    corners."""
    found = {'trim': shapes.bevelled_box(-0.5, -0.5, 0.0, 0.5, 0.5, 0.13, 0.025)}
    profile = [(0.47, 0.13), (0.495, 0.17), (0.48, 0.22), (0.42, 0.25), (0.345, 0.25), (0.31, 0.28), (0.33, 0.31),
               (0.35, 0.34), (0.31, 0.372)]
    turned = shapes.revolve(profile, (0.0, 0.0, 0.0), UP, 16)
    # Its foot's cap lies on the plinth; its top's shows round the collar.
    found['trim'] += turned[:-2] + turned[-1:]
    collar = forms.octagon(SHAFT_R)
    found['stone'] = forms.sides(collar, 0.372, 0.45) + [shapes.facing(shapes.flat([(x, y, 0.45) for x, y in collar]),
                                                                      UP)]
    found['relief'] = []
    for corner in range(4):
        turn = math.radians(45 + 90 * corner)
        way = (math.cos(turn), math.sin(turn))
        base = (way[0] * 0.43, way[1] * 0.43, 0.2)
        found['relief'] += leaf(base, (way[0] * 0.35, way[1] * 0.35, 1.0), 0.2, 0.17, lean=0.15, curl=0.25,
                                up=(way[0] * 0.85, way[1] * 0.85, -0.5))
    return forms.made(kit, found, 'pillar.base', drop=(('z', 0.0),))


def pillar_shaft(kit):
    """The column's shaft: an octagon with a flute down each face, a unit high, stretched to the room."""
    return forms.made(kit, {'stone': forms.sides(forms.octagon(SHAFT_R, 0.12, 0.022, 3), 0.0, 1.0)}, 'pillar.shaft')


def _volute(centre, way, size):
    """A volute's curl in the upright plane along `way` (x, y): a stem rising to the spiral, which winds out and down
    one and a half turns."""
    points = []
    for step in range(19):
        share = step / 18
        turn = math.radians(180 - 450 * share)
        reach = size * (1 - 0.72 * share)
        points.append((centre[0] + way[0] * reach * math.cos(turn), centre[1] + way[1] * reach * math.cos(turn),
                       centre[2] + reach * math.sin(turn)))
    return points


def pillar_capital(kit):
    """An acanthus capital: an astragal and a flaring bell under two tiers of eight curling leaves, volutes under the
    corners of a concave-sided abacus, a brass stud at the middle of each side; its top meets the ceiling."""
    bell = [(0.3, 0.0), (0.335, 0.03), (0.29, 0.06), (0.3, 0.15), (0.33, 0.33), (0.4, 0.46), (0.46, 0.52)]
    found = {'trim': shapes.revolve(bell, (0.0, 0.0, 0.0), UP, 12)[:-1], 'relief': [], 'brass': []}
    for number in range(8):
        for tier, (radius, low, height, lean) in enumerate(((0.29, 0.07, 0.26, 0.12), (0.3, 0.14, 0.34, 0.15))):
            turn = math.radians(45 * number + 22.5 * tier)
            way = (math.cos(turn), math.sin(turn), 0.0)
            found['relief'] += leaf((way[0] * radius, way[1] * radius, low), way, height, 0.27, lean=lean, curl=0.35)
    for corner in range(4):
        turn = math.radians(45 + 90 * corner)
        way = (math.cos(turn), math.sin(turn))
        stem = [(way[0] * 0.4, way[1] * 0.4, 0.34), (way[0] * 0.47, way[1] * 0.47, 0.44)]
        curl = _volute((way[0] * 0.53, way[1] * 0.53, 0.5), way, 0.065)
        found['relief'] += forms.tube(stem + curl, 0.022, 4, 0.08)
    side = [(0.64 - 0.08 * (1 - (y / 0.58) ** 2), y) for y in (-0.58 + 0.29 * k for k in range(5))]
    outline = []
    for quarter in range(4):
        turn = math.radians(90 * quarter)
        outline += [(x * math.cos(turn) - y * math.sin(turn), x * math.sin(turn) + y * math.cos(turn)) for x, y in side]
    found['trim'] += forms.hidden(shapes.extrude_outline(outline, 0.52, 0.62), 'z', 0.62)
    found['trim'] += forms.hidden(shapes.bevelled_box(-0.66, -0.66, 0.62, 0.66, 0.66, 0.7, 0.02), 'z', 0.7)
    for quarter in range(4):
        turn = math.radians(90 * quarter)
        way = (math.cos(turn), math.sin(turn), 0.0)
        found['brass'] += stud((way[0] * 0.56, way[1] * 0.56, 0.57), way, 0.035, 0.02, 4)
    return forms.made(kit, found, 'pillar.capital')


def _pilaster_path(z):
    """The pilaster's outline at z, round its two sides and its face, for a moulding to run along."""
    half, proud = PILASTER
    return [(-half, 0.0, z), (-half, proud, z), (half, proud, z), (half, 0.0, z)]


def wall_base(kit):
    """The pilaster's base: a plinth and an Attic moulding returned round the pilaster's sides to the wall."""
    profile = [(0.0, 0.0), (0.11, 0.0), (0.115, 0.03), (0.1, 0.07), (0.065, 0.09), (0.045, 0.12), (0.05, 0.16),
               (0.065, 0.19), (0.04, 0.225), (0.0, 0.25)]
    found = {'trim': shapes.bevelled_box(-0.5, 0.0, 0.0, 0.5, 0.29, 0.18, 0.02)}
    found['trim'] += run(_pilaster_path(0.18), profile, UP, (0.0, 0.05, 0.18), caps=False)
    return forms.made(kit, found, 'wall.base', drop=(('z', 0.0), ('y', 0.0)))


def _fluted_face(count=5, flute=0.09, fillet=0.03, depth=0.03, steps=4):
    """The pilaster's outline (x, y) from the wall round its chamfered face, `count` flutes sunk in it."""
    half, proud = PILASTER
    points = [(-half, 0.0), (-half, proud - 0.02), (-half + 0.02, proud)]
    start = -(count * flute + (count - 1) * fillet) / 2
    for number in range(count):
        left = start + number * (flute + fillet)
        for step in range(steps + 1):
            share = step / steps
            points.append((left + flute * share, proud - depth * math.sin(math.pi * share)))
    return points + [(half - 0.02, proud), (half, proud - 0.02), (half, 0.0)]


def wall_shaft(kit):
    """The pilaster's shaft: five flutes down its face, a unit high, stretched to the room."""
    return forms.made(kit, {'stoneAlt': forms.sides(_fluted_face(), 0.0, 1.0)}, 'wall.shaft', drop=(('y', 0.0),))


def wall_cap(kit):
    """The pilaster's cap: a bead, a frieze of three acanthus leaves between corner volutes, a moulded abacus with a
    brass stud, and a deep cyma corbel spreading to carry the ceiling, studded along its top."""
    bead = [(0.0, 0.0), (0.02, 0.008), (0.028, 0.025), (0.02, 0.042), (0.0, 0.05)]
    abacus = [(0.0, 0.0), (0.05, 0.0), (0.07, 0.02), (0.09, 0.05), (0.1, 0.07), (0.1, 0.1), (0.0, 0.1)]
    corbel = [(0.0, 0.0), (0.1, 0.0), (0.1, 0.03), (0.13, 0.06), (0.18, 0.1), (0.24, 0.16), (0.29, 0.22),
              (0.32, 0.26), (0.34, 0.28), (0.36, 0.3), (0.36, 0.4), (0.0, 0.4)]
    half, proud = PILASTER
    found = {'trim': run(_pilaster_path(0.0), bead, UP, (0.0, 0.05, 0.0), caps=False)}
    found['trim'] += run(_pilaster_path(0.45), abacus, UP, (0.0, 0.05, 0.45), caps=False)
    found['trim'] += forms.hidden(run(_pilaster_path(0.55), corbel, UP, (0.0, 0.05, 0.55), caps=False), 'z', 0.95)
    found['stoneAlt'] = forms.sides([(x, y) for x, y, _ in _pilaster_path(0.0)], 0.05, 0.45)
    found['relief'] = []
    for x in (-0.2, 0.0, 0.2):
        found['relief'] += leaf((x, proud, 0.06), SOUTH, 0.34, 0.22, lean=0.1, curl=0.35)
    for side in (-1, 1):
        curl = _volute((side * (half - 0.06), proud + 0.03, 0.37), (side, 0.0), 0.06)
        found['relief'] += forms.tube([(side * (half - 0.12), proud + 0.02, 0.2)] + curl, 0.02, 4, 0.06)
    found['brass'] = stud((0.0, proud + 0.1, 0.5), SOUTH, 0.03, 0.02)
    for x in (-0.45, 0.45):
        found['brass'] += stud((x, proud + 0.36, 0.9), SOUTH, 0.022, 0.016)
    return forms.made(kit, found, 'wall.cap', drop=(('y', 0.0),))


def sconce(kit):
    """A brass sconce: a shaped back plate nailed in iron, a curved arm and a deep drip pan holding the code's
    flame."""
    right = [(0.0, 0.12), (0.045, 0.06), (0.1, 0.0), (0.08, -0.08), (0.05, -0.13), (0.09, -0.22), (0.07, -0.3),
             (0.0, -0.36)]
    plate = right + [(-x, z) for x, z in right[-2:0:-1]]
    found = {'brass': shapes.extrude_outline(plate, 0.0, 0.025, 'xz')}
    arm = [(0.0, 0.025, -0.24), (0.0, 0.14, -0.27), (0.0, 0.27, -0.24), (0.0, 0.35, -0.17)]
    found['brass'] += forms.tube(arm, 0.017, 4, 0.1)
    pan = [(0.0, -0.18), (0.03, -0.16), (0.064, -0.105), (0.066, -0.085), (0.05, -0.1), (0.0, -0.1)]
    found['brass'] += forms.turned(pan, (0.0, 0.35, 0.0), 0, 360, 6)
    found['iron'] = stud((0.0, 0.025, 0.04), SOUTH, 0.018, 0.012, 4) + stud((0.0, 0.025, -0.3), SOUTH, 0.018, 0.012, 4)
    return forms.made(kit, found, 'sconce', drop=(('y', 0.0),))


def pieces(kit):
    """The halls' column, pilaster and sconce: {piece: object}."""
    return {'pillar.base': pillar_base(kit), 'pillar.shaft': pillar_shaft(kit), 'pillar.capital': pillar_capital(kit),
            'wall.base': wall_base(kit), 'wall.shaft': wall_shaft(kit), 'wall.cap': wall_cap(kit),
            'sconce': sconce(kit)}

