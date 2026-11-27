"""The crypt's stairs and galleries: a flat arch of chunky voussoirs over a flight's head and foot, a skull for its
keystone, on quoined posts; a chamfered string course of long stones down a flight's walls; and a gallery's rail of
squat turned balusters between a plinth and a heavy coping, a half pier at each end.

The stair head stands on the landing, y 0..0.3, the flight behind it at y < 0, and leaves the way up clear below
2.9 within 1.25 of its middle; the string course and the rail span their whole edge, x ±1.6, so the next ones meet
them in one run.
"""
import random

from styles.crypt import forms
from styles.crypt.doors import _quoins, _skull_carving
from styles.crypt.hidden import cull

# The stair head's way through and its lintel, metres.
WAY = 1.25
LINTEL = 2.9
TOP = 3.2
# A flat arch's joints all point at one centre this far below its underside, as a jack arch's do.
FAN_M = 1.6


def _splay(x, z):
    """Where the joint through x on the underside meets the height z."""
    return max(-1.6, min(1.6, x * (z - LINTEL + FAN_M) / FAN_M))


def _flat_voussoirs(kit, count, y0, y1):
    """A flat arch over x ±WAY from LINTEL to TOP, `count` wedged stones with their joints fanning from a point below,
    alternate stones in stoneAlt and the middle one left for its keystone."""
    made, joint = [], 0.006
    edges = [-WAY - 0.35 + (2 * WAY + 0.7) * number / count for number in range(count + 1)]

    for number in range(count):
        if number == count // 2:
            continue
        low, high = edges[number] + joint, edges[number + 1] - joint
        outline = [(low, LINTEL), (high, LINTEL), (_splay(high, TOP), TOP), (_splay(low, TOP), TOP)]
        made.append(kit.extrude_outline(outline, y0, y1, 'xz', part='stoneAlt' if number % 2 else 'trim'))
    return made, edges[count // 2] + joint, edges[count // 2 + 1] - joint


def stair_head(kit):
    """A flat arch of seven wedged voussoirs on quoined posts and chamfered imposts, its keystone proud and a skull
    carved on it, looking down the landing."""
    draw = random.Random('crypt.stair.head')
    made, low, high = _flat_voussoirs(kit, 7, 0.0, 0.22)
    key = [(low, LINTEL), (high, LINTEL), (_splay(high, TOP), TOP), (_splay(low, TOP), TOP)]
    made.append(kit.extrude_outline(key, 0.0, 0.25, 'xz', part='relief'))
    made.append(_skull_carving(kit, (0.0, 0.245, LINTEL + 0.02), 0, 1.25, depth=0.4))
    for side in (-1, 1):
        made += _quoins(kit, draw, side, LINTEL - 0.16, WAY, 0.0, 0.3, courses=6, parts=('trim', 'stoneAlt'),
                        base=0.26, widths=(0.35, 0.28))
        low_x, high_x = sorted((side * WAY, side * 1.6))
        made.append(kit.bevelled_box(low_x, 0.0, LINTEL - 0.16, high_x, 0.3, LINTEL, bevel=0.035, part='trim'))
        made.append(kit.bevelled_box(low_x, 0.0, 0.0, high_x, 0.3, 0.26, bevel=0.035, wear=0.006, draw=draw,
                                     part='stone'))
    return cull(kit.join(made, 'stair.head'), floor=0.0)


def stair_side(kit):
    """A string course of two long stones, a flat band under a chamfered drip, their joint and ends left plain."""
    profile = [(0.0, -0.3), (0.05, -0.3), (0.06, -0.29), (0.06, 0.18), (0.13, 0.25), (0.13, 0.36), (0.1, 0.39),
               (0.0, 0.39)]
    made = []
    for number, (x0, x1) in enumerate(((-1.6, -0.004), (0.004, 1.6))):
        made.append(kit.extrude_outline(profile, x0, x1, 'yz', part='stoneAlt' if number else 'trim', smooth=None))
    return cull(kit.join(made, 'stair.side'), wall=0.0)


# A squat baluster's turning, (radius, height) from the plinth's top: a foot, a fat belly, a neck and a cushion.
BALUSTER = [(0.0, 0.0), (0.07, 0.0), (0.07, 0.05), (0.088, 0.22), (0.04, 0.47), (0.075, 0.56), (0.075, 0.64),
            (0.0, 0.64)]
PLINTH = 0.18
COPING = 0.82


def balustrade(kit):
    """Five squat balusters between a worn plinth and a heavy chamfered coping, a half pier at each end that meets
    the next rail's in one, and a small skull carved on each pier's face over the gallery."""
    draw = random.Random('crypt.balustrade')
    made = [kit.bevelled_box(-1.6, 0.0, 0.0, 1.6, 0.25, PLINTH, bevel=0.03, part='trim'),
            kit.bevelled_box(-1.6, 0.0, COPING, 1.6, 0.25, 1.0, bevel=0.035, wear=0.008, draw=draw, part='trim')]
    for side in (-1, 1):
        low, high = sorted((side * 1.6, side * 1.42))
        made.append(kit.box(low, 0.02, PLINTH, high, 0.23, COPING, part='stoneAlt'))
        made.append(forms.made(kit, forms.placed(forms.skull(0, half=True), (side * 1.52, 0.229, 0.43), size=0.7,
                                                 depth=0.3), 'relief', closed=False))
    for number in range(5):
        x = -1.1 + 0.55 * number
        made.append(kit.lathe([(radius, height * (COPING - PLINTH) / 0.64) for radius, height in BALUSTER],
                              x, 0.125, PLINTH, sides=6, part='stone'))
    return cull(kit.join(made, 'balustrade'), floor=0.0)
