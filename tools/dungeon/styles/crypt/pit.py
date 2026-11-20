"""The Bone Pit: a square pit sunk in the floor and heaped with bones and skulls, inside a low coped parapet with a
carved skull on each face, a skull-capped post at each corner. Its solids: the parapet and pit [0.4..6.0] to 0.7,
the posts [0.3..0.9] at each corner to 1.4; the spirit's glow rises from the heap's middle.
"""
import math
import random

import shapes
from styles.crypt import forms, ground
from styles.crypt.ground import MIDDLE, SIDE

# The parapet: its outer and inner faces in from the footprint's edge, and its height under the coping (metres).
OUTER, INNER, TOP = 0.4, 0.75, 0.62


def _coping(kit, draw):
    """Chamfered stones round the parapet's top, over both its faces a little."""
    made = []
    low_x, high_x = OUTER - 0.03, SIDE - OUTER + 0.03
    runs = (((low_x, low_x), (high_x, INNER + 0.03), 0), ((low_x, SIDE - INNER - 0.03), (high_x, high_x), 0),
            ((low_x, INNER + 0.03), (INNER + 0.03, SIDE - INNER - 0.03), 1),
            ((SIDE - INNER - 0.03, INNER + 0.03), (high_x, SIDE - INNER - 0.03), 1))
    for low, high, axis in runs:
        at, end = low[axis], high[axis]
        while at < end - 0.05:
            length = min(draw.uniform(0.7, 1.05), end - at)
            if end - at - length < 0.35:
                length = end - at
            first, last = list(low), list(high)
            first[axis], last[axis] = at + 0.006, at + length - 0.006
            made.append(kit.bevelled_box(first[0], first[1], TOP, last[0], last[1], TOP + draw.uniform(0.07, 0.08),
                                         bevel=0.025, wear=0.006, draw=draw, part='trim'))
            at += length
    return made


def _roundel(kit, turn, x, y):
    """A carved skull in a wreath on the parapet's outer face at (x, y), looking out along `turn`."""
    skull = forms.placed(forms.skull(1, half=True), (0.0, -0.004, 0.22), size=0.95, depth=0.42)
    wreath = shapes.ring((0.0, 0.0, 0.31), 0.165, 0.02, axis=(0.0, 1.0, 0.0), sides=20, tube_sides=5)
    return [forms.made(kit, forms.placed(skull, (x, y, 0.0), turn=turn), 'relief', closed=False),
            forms.made(kit, forms.placed(wreath, (x, y, 0.0), turn=turn), 'relief')]


def _corner_post(kit, draw, x, y):
    """A square post on a plinth under a moulded cap, carved panels on its outer faces and a skull set on it looking
    out from the pit."""
    made = [kit.bevelled_box(x - 0.3, y - 0.3, 0.0, x + 0.3, y + 0.3, 0.16, bevel=0.03, part='trim'),
            kit.bevelled_box(x - 0.24, y - 0.24, 0.16, x + 0.24, y + 0.24, 1.04, bevel=0.035, wear=0.006, draw=draw,
                             part='stone'),
            kit.bevelled_box(x - 0.29, y - 0.29, 1.04, x + 0.29, y + 0.29, 1.12, bevel=0.025, part='trim'),
            kit.bevelled_box(x - 0.25, y - 0.25, 1.12, x + 0.25, y + 0.25, 1.2, bevel=0.03, part='trim')]
    out_x, out_y = (1 if x > MIDDLE else -1), (1 if y > MIDDLE else -1)
    made.append(kit.bevelled_box(x + out_x * 0.235, y - 0.14, 0.4, x + out_x * 0.255, y + 0.14, 0.86, bevel=0.006,
                                 part='relief'))
    made.append(kit.bevelled_box(x - 0.14, y + out_y * 0.235, 0.4, x + 0.14, y + out_y * 0.255, 0.86, bevel=0.006,
                                 part='relief'))
    look = math.degrees(math.atan2(-out_x, out_y))
    made.append(forms.made(kit, forms.placed(forms.skull(2), (x - out_x * 0.02, y - out_y * 0.02, 1.2), turn=look),
                           'bone'))
    return made


def bone_pit(kit, entry):
    draw = random.Random(entry['module'])
    heaped = ground.bumps(draw, 14, (1.2, 1.2, 5.2, 5.2), (0.06, 0.22), (0.3, 0.7))

    def heap(x, y):
        reach = math.hypot(x - MIDDLE, y - MIDDLE) / 2.7
        return -0.9 + 1.0 * max(0.0, 1 - reach * reach) ** 0.7 + ground.lumps(heaped, x, y)

    grid = ground.steps(INNER, SIDE - INNER, 26)
    made = ground.ground(kit, grid, grid, heap, lambda x, y: 'bone')
    for x0, y0, x1, y1 in ((0, 0, SIDE, OUTER), (0, SIDE - OUTER, SIDE, SIDE), (0, OUTER, OUTER, SIDE - OUTER),
                           (SIDE - OUTER, OUTER, SIDE, SIDE - OUTER)):
        made.append(kit.box(x0, y0, -0.05, x1, y1, 0.0, part='floor'))
    walls = ((OUTER, OUTER, SIDE - OUTER, INNER), (OUTER, SIDE - INNER, SIDE - OUTER, SIDE - OUTER),
             (OUTER, INNER, INNER, SIDE - INNER), (SIDE - INNER, INNER, SIDE - OUTER, SIDE - INNER))
    for x0, y0, x1, y1 in walls:
        made.append(kit.box(x0, y0, 0.0, x1, y1, TOP, part='stone'))
        made.append(kit.box(x0, y0, -1.2, x1, y1, 0.0, part='stoneAlt'))
    low, high = OUTER - 0.02, SIDE - OUTER + 0.02
    for x0, y0, x1, y1 in ((low, low, high, low + 0.1), (low, high - 0.1, high, high), (low, low + 0.1, low + 0.1,
                                                                                         high - 0.1),
                           (high - 0.1, low + 0.1, high, high - 0.1)):
        made.append(kit.bevelled_box(x0, y0, 0.0, x1, y1, 0.14, bevel=0.03, part='stoneAlt'))
    made += _coping(kit, draw)
    for turn, x, y in ((180, MIDDLE, OUTER), (0, MIDDLE, SIDE - OUTER), (90, OUTER, MIDDLE),
                       (270, SIDE - OUTER, MIDDLE)):
        made += _roundel(kit, turn, x, y)
    for x, y in ((0.6, 0.6), (5.8, 0.6), (0.6, 5.8), (5.8, 5.8)):
        made += _corner_post(kit, draw, x, y)
    for x, y, _, scale in ground.scatter(draw, 9, (1.3, 1.3, 5.1, 5.1)):
        made.append(ground.skull_on(kit, draw, x, y, heap(x, y), size=scale))
    made += ground.lying_bones(kit, draw, 22, (1.0, 1.0, 5.4, 5.4), heap)
    made += ground.lying_bones(kit, draw, 2, (0.26, 2.0, 0.3, 4.4), lambda x, y: 0.0, radius=0.011)
    return kit.join(made, entry['module'])
