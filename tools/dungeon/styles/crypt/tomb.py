"""The Founder's Tomb: a two-stepped dais, a sarcophagus arcaded on every face with its founder lying in effigy on
the lid, four hooded mourners at the dais's corners and a brazier burning at each end. Its solids: the dais
[0.6..5.8] to 0.3, the tomb [2.3..4.1, 1.5..4.9] to 1.3, the mourners' squares to 1.9 and the braziers to 1.2;
the braziers' flames are its glows.
"""
import math
import random

import shapes
from styles.crypt import forms
from styles.crypt.ground import MIDDLE, SIDE

# The sarcophagus, metres: its chest's sides and its lid's top, where the effigy lies.
CHEST = (2.4, 1.6, 4.0, 4.8)
LID = 0.95
# The effigy's size against a man's: the founder lies a little larger than life.
HEROIC = 1.1
SQUARE = ((-1, -1), (1, -1), (1, 1), (-1, 1))
# The blind arcades' springing and their colonnettes' foot, metres up.
SPRING, FOOT = 0.6, 0.47


def _body_section(along, half, high, groove=0.0, count=11):
    """A lying body's section at `along` (y): an arch `half` wide and `high` over the lid, sunk `groove` between the
    legs."""
    points = []
    for step in range(count):
        turn = math.pi * step / (count - 1)
        x = half * math.cos(turn)
        z = high * math.sin(turn) ** 0.7 - groove * math.exp(-(x / 0.06) ** 2) * math.sin(turn)
        points.append((x, along, z))
    return points


# The effigy from its crown (y 0) to its feet: (y, half width, height over the lid, the legs' groove).
_BODY = ((0.3, 0.12, 0.24, 0.0), (0.37, 0.25, 0.26, 0.0), (0.55, 0.26, 0.29, 0.0), (0.8, 0.23, 0.27, 0.0),
         (0.97, 0.21, 0.235, 0.0), (1.1, 0.23, 0.23, 0.0), (1.34, 0.22, 0.2, 0.05), (1.58, 0.19, 0.17, 0.06),
         (1.84, 0.16, 0.14, 0.06), (1.94, 0.15, 0.13, 0.05))
_HEAD = ((0.0, 0.02, 0.025), (0.05, 0.085, 0.085), (0.12, 0.11, 0.11), (0.2, 0.115, 0.112), (0.27, 0.095, 0.1),
         (0.32, 0.07, 0.08))


def effigy(kit, x, y, z):
    """A knight lying on a pillow, a brass circlet on his brow and a brass belt at his waist, hands joined in
    prayer, his sword laid on him, his feet against a carved skull on crossed bones."""
    def put(faces):
        return forms.placed(faces, (x, y, z), size=HEROIC)

    body = forms.loft([_body_section(*row) for row in _BODY])
    head = forms.loft([[(half_x * math.cos(math.tau * step / 12), along, 0.24 + half_z * math.sin(math.tau * step /
                                                                                                    12))
                        for step in range(12)] for along, half_x, half_z in _HEAD])
    made = [forms.made(kit, put(body), 'relief'), forms.made(kit, put(head), 'relief'),
            forms.made(kit, put(forms.loft([[(0.26 * sx, -0.04 + 0.4 * sy, 0.0) for sx, sy in SQUARE],
                                            [(0.24 * sx, -0.02 + 0.36 * sy, 0.085) for sx, sy in SQUARE]])),
                       'trim', smooth=None),
            forms.made(kit, put(shapes.ring((0.0, 0.125, 0.24), 0.112, 0.014, axis=(0.0, 1.0, 0.0), sides=12,
                                            tube_sides=4)), 'brass'),
            forms.made(kit, put(forms.loft([_body_section(along, 0.218, 0.245, count=9) for along in (0.94, 1.0)])),
                       'brass')]
    for side in (-1, 1):
        shoulder, elbow, wrist = (side * 0.25, 0.42, 0.21), (side * 0.22, 0.86, 0.24), (side * 0.035, 0.7, 0.3)
        made.append(forms.made(kit, put(shapes.frustum(shoulder, elbow, 0.065, 0.055, sides=8)), 'relief'))
        made.append(forms.made(kit, put(shapes.frustum(elbow, wrist, 0.055, 0.045, sides=8)), 'relief'))
        made.append(forms.made(kit, put(shapes.bevelled_box(side * 0.07 - 0.05, 1.92, 0.0, side * 0.07 + 0.05, 2.02,
                                                            0.25, bevel=0.015)), 'trim', smooth=None))
        made.append(forms.made(kit, put(forms.long_bone((side * 0.2, 2.02, 0.022), (-side * 0.2, 2.4, 0.022), 0.018,
                                                        6)), 'relief'))
    hands = forms.loft([[(0.04 * sx, 0.64 + 0.06 * sy, 0.25) for sx, sy in SQUARE],
                        [(0.035 * sx, 0.62 + 0.05 * sy, 0.33) for sx, sy in SQUARE],
                        [(0.012 * sx, 0.6 + 0.02 * sy, 0.38) for sx, sy in SQUARE]])
    made.append(forms.made(kit, put(hands), 'relief', smooth=None))
    sword = shapes.box(-0.028, 0.95, -0.007, 0.028, 1.78, 0.007)
    made.append(forms.made(kit, put(forms.placed(sword, (0.0, 0.0, 0.33), tilt=4.5)), 'iron', smooth=None))
    made.append(forms.made(kit, put(shapes.box(-0.15, 0.91, 0.25, 0.15, 0.95, 0.28)), 'iron', smooth=None))
    made.append(forms.made(kit, put(shapes.box(-0.016, 0.74, 0.26, 0.016, 0.91, 0.29)), 'iron', smooth=None))
    made.append(forms.made(kit, put(forms.placed(forms.skull(1), (0.0, 2.27, 0.1), tilt=-90, size=0.9)), 'relief'))
    return made


def _arcade(kit, start, end, count, face, outward):
    """Round-headed blind arches along one of the chest's faces: colonnettes, arches and carved panels. `face` is the
    face's x (outward ±x) or y (outward ±y)."""
    made = []
    span = (end - start) / count
    for number in range(count + 1):
        along = start + span * number
        made.append(_on_face(kit, kit.cylinder((0.0, -0.025, FOOT), (0.0, -0.025, SPRING - 0.02), 0.03, sides=8,
                                               part='trim'), along, face, outward))
        made.append(_on_face(kit, kit.box(-0.045, -0.06, FOOT - 0.02, 0.045, 0.0, FOOT + 0.02, part='trim'), along,
                             face, outward))
        made.append(_on_face(kit, kit.box(-0.05, -0.06, SPRING - 0.04, 0.05, 0.0, SPRING, part='trim'), along, face,
                             outward))
    for number in range(count):
        middle = start + span * (number + 0.5)
        half = span / 2 - 0.04
        made.append(_on_face(kit, kit.arch(half, SPRING, 0.045, -0.05, 0.0, segments=8, part='trim'), middle, face,
                             outward))
        made.append(_on_face(kit, kit.bevelled_box(-half + 0.02, -0.012, FOOT + 0.03, half - 0.02, 0.0,
                                                   SPRING + half * 0.75, bevel=0.006, part='relief'), middle, face,
                             outward))
    return made


def _on_face(kit, item, along, face, outward):
    """A piece made facing -y at the origin, laid on a chest face: along y when `face` is an x, else along x."""
    turn = {(1, 0): 90, (-1, 0): -90, (0, 1): 180, (0, -1): 0}[outward]
    kit.rotate_z(item, turn)
    if outward[0]:
        return kit.translate(item, face, along, 0.0)
    return kit.translate(item, along, face, 0.0)


def sarcophagus(kit):
    """The founder's chest on its plinth under a chamfered lid, blind-arcaded down its sides and at its foot, his
    arms in brass at its head, and his effigy on the lid."""
    x0, y0, x1, y1 = CHEST
    made = [kit.bevelled_box(x0 - 0.1, y0 - 0.1, 0.25, x1 + 0.1, y1 + 0.1, 0.45, bevel=0.03, part='trim'),
            kit.bevelled_box(x0, y0, 0.44, x1, y1, LID - 0.09, bevel=0.015, part='floor'),
            kit.bevelled_box(x0 - 0.08, y0 - 0.08, LID - 0.1, x1 + 0.08, y1 + 0.08, LID, bevel=0.045, part='trim')]
    made += _arcade(kit, y0 + 0.1, y1 - 0.1, 6, x0, (-1, 0))
    made += _arcade(kit, y0 + 0.1, y1 - 0.1, 6, x1, (1, 0))
    made += _arcade(kit, x0 + 0.1, x1 - 0.1, 3, y1, (0, 1))
    shield = [(-0.14, 0.8), (0.14, 0.8), (0.14, 0.65), (0.09, 0.56), (0.0, 0.5), (-0.09, 0.56), (-0.14, 0.65)]
    made.append(kit.extrude_outline([(MIDDLE + x, z) for x, z in shield], y0 - 0.03, y0, 'xz', part='brass'))
    made.append(kit.box(MIDDLE - 0.02, y0 - 0.04, 0.54, MIDDLE + 0.02, y0 - 0.03, 0.78, part='brass'))
    made.append(kit.box(MIDDLE - 0.11, y0 - 0.04, 0.67, MIDDLE + 0.11, y0 - 0.03, 0.71, part='brass'))
    for side in (-1, 1):
        made.append(kit.bevelled_box(MIDDLE + side * 0.55 - 0.18, y0 - 0.012, 0.5, MIDDLE + side * 0.55 + 0.18, y0,
                                     0.8, bevel=0.006, part='relief'))
    made += effigy(kit, MIDDLE, y0 + 0.3, LID)
    return made


def brazier(kit, draw, x, y):
    """An iron bowl of coals on three legs, on a stone pedestal, its fire burning up out of it."""
    made = [kit.bevelled_box(x - 0.23, y - 0.23, 0.1, x + 0.23, y + 0.23, 0.5, bevel=0.025, part='trim'),
            kit.bevelled_box(x - 0.26, y - 0.26, 0.5, x + 0.26, y + 0.26, 0.56, bevel=0.015, part='stone')]
    for leg in range(3):
        turn = math.tau * leg / 3 + 0.5
        foot = (x + 0.19 * math.cos(turn), y + 0.19 * math.sin(turn), 0.56)
        knee = (x + 0.2 * math.cos(turn), y + 0.2 * math.sin(turn), 0.7)
        top = (x + 0.13 * math.cos(turn), y + 0.13 * math.sin(turn), 0.84)
        made.append(kit.cylinder(foot, knee, 0.018, sides=5, part='iron'))
        made.append(kit.cylinder(knee, top, 0.018, sides=5, part='iron'))
    made.append(kit.lathe([(0.0, 0.8), (0.11, 0.8), (0.22, 0.87), (0.265, 0.98), (0.278, 1.02), (0.255, 1.02),
                           (0.235, 0.985), (0.0, 0.985)], x, y, 0.0, sides=16, part='iron'))
    for coal in range(8):
        turn, reach = draw.uniform(0, math.tau), draw.uniform(0.0, 0.17)
        size = draw.uniform(0.07, 0.11)
        made.append(kit.rock(x + reach * math.cos(turn), y + reach * math.sin(turn), 0.97, (size, size, size * 0.6),
                             seed=f'coal.{x:.1f}.{y:.1f}.{coal}', detail=0, part='ember'))
    for tongue in range(5):
        turn, reach = draw.uniform(0, math.tau), draw.uniform(0.0, 0.1) if tongue else 0.0
        base = (x + reach * math.cos(turn), y + reach * math.sin(turn))
        high = draw.uniform(0.22, 0.32) if tongue else 0.42
        lean = draw.uniform(-0.04, 0.04), draw.uniform(-0.04, 0.04)
        sections = []
        for row, (share, radius) in enumerate(((0.0, 0.07), (0.3, 0.075), (0.62, 0.045), (1.0, 0.004))):
            middle = (base[0] + lean[0] * share * 2, base[1] + lean[1] * share * 2)
            ring = forms.section(1.0 + share * high, radius, radius, count=6)
            twist = row * 0.4
            sections.append([(middle[0] + px * math.cos(twist) - py * math.sin(twist),
                              middle[1] + px * math.sin(twist) + py * math.cos(twist), pz) for px, py, pz in ring])
        made.append(forms.made(kit, forms.loft(sections), 'glow', smooth=60.0))
    return made


def founders_tomb(kit, entry):
    draw = random.Random(entry['module'])
    made = []
    for x0, y0, x1, y1 in ((0, 0, SIDE, 0.6), (0, 5.8, SIDE, SIDE), (0, 0.6, 0.6, 5.8), (5.8, 0.6, SIDE, 5.8)):
        made.append(kit.box(x0, y0, -0.05, x1, y1, 0.0, part='floor'))
    made.append(kit.bevelled_box(0.6, 0.6, -0.05, 5.8, 5.8, 0.15, bevel=0.03, wear=0.004, draw=draw, part='trim'))
    made.append(kit.bevelled_box(0.85, 0.85, 0.1, 5.55, 5.55, 0.3, bevel=0.03, wear=0.004, draw=draw, part='floor'))
    for x0, y0, x1, y1 in ((2.12, 1.32, 4.28, 1.38), (2.12, 5.02, 4.28, 5.08), (2.12, 1.38, 2.18, 5.02),
                           (4.22, 1.38, 4.28, 5.02)):
        made.append(kit.box(x0, y0, 0.29, x1, y1, 0.306, part='brass'))
    made += sarcophagus(kit)
    for x, y in ((1.2, 1.2), (5.2, 1.2), (1.2, 5.2), (5.2, 5.2)):
        made.append(kit.bevelled_box(x - 0.36, y - 0.36, 0.28, x + 0.36, y + 0.36, 0.36, bevel=0.02, part='trim'))
        look = math.degrees(math.atan2(-(MIDDLE - x), MIDDLE - y))
        made.append(forms.made(kit, forms.placed(forms.hooded(height=1.43), (x, y, 0.36), turn=look), 'trim'))
    for y in (0.9, 5.5):
        made += brazier(kit, draw, MIDDLE, y)
    return kit.join(made, entry['module'])
