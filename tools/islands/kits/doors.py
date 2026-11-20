"""The common kit's dungeon doors, each with its opening at the front (-y), and its camp pieces. A door's opening is
a dark recess of earth the game draws into. Numbers are the module's frame: x east, y south, z up, metres.
"""
import math

import catalog


def _size(module):
    return catalog.MODULES[module]['size']


def _boulder(kit, x, y, z0, sx, sy, sz, seed, part='rock'):
    return kit.rock(x, y, z0, (sx, sy, sz), seed=seed, detail=1, roughness=0.28, base=0.1, part=part, smooth=None)


def caverns(kit, module):
    """A cave mouth framed in rock, set into a hillside: two cheeks, a brow over them, the hill behind, and the dark
    of the cave in the opening."""
    x, y, z = _size(module)
    made = [kit.box(-1.5, 0.6, -0.4, 1.5, 1.2, 3.4, part='earth')]
    for number, (cx, cy, sx, sy, sz) in enumerate([(-2.5, 0.5, 2.0, 3.6, 4.4), (2.5, 0.3, 2.0, 3.8, 3.8),
                                                   (0.0, 0.7, 6.2, 2.8, 2.6), (0.0, 1.7, 7.0, 1.6, 3.6),
                                                   (-1.8, -1.8, 1.4, 1.2, 0.9), (1.6, -1.6, 1.0, 1.0, 0.6)]):
        low = 3.4 if number == 2 else -0.4
        made.append(_boulder(kit, cx, cy, low, sx, sy, sz, f'{module}.{number}'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.4), (x / 2, y / 2, z))


def crypt(kit, module):
    """A stone stair going down between walls, from its top at the front to a doorway under a carved lintel."""
    x, y, z = _size(module)
    made = []
    steps = 7
    for number in range(steps):
        front = -y / 2 + 0.3 + 0.55 * number
        made.append(kit.bevelled_box(-1.3, front, -0.8, 1.3, front + 0.57, -0.75 * number / steps, bevel=0.03,
                                     wear=0.015, seed=f'{module}.{number}', part='stone'))
    for side in (-1, 1):
        made.append(kit.stones(-y / 2, y / 2 - 1.2, -0.8, 1.0, 0.0, 1.2, block=(0.6, 1.0), course=(0.35, 0.45), bevel=0.0,
                               alt=0.3, seed=f'{module}.wall{side}'))
        made[-1] = kit.translate(kit.rotate_z(made[-1], -90 * side), side * 1.3, 0, 0)
    made.append(kit.box(-0.85, y / 2 - 1.3, -0.8, 0.85, y / 2 - 1.0, 2.0, part='earth'))
    for side in (-1, 1):
        made.append(kit.bevelled_box(side * 0.85, y / 2 - 1.5, -0.8, side * (x / 2), y / 2, z - 1.0, bevel=0.04,
                                     part='stone'))
    made.append(kit.bevelled_box(-x / 2, y / 2 - 1.6, 2.0, x / 2, y / 2, z - 0.4, bevel=0.05, part='stoneAlt'))
    for number in range(5):
        made.append(kit.bevelled_box(-1.6 + 0.8 * number - 0.22, y / 2 - 1.7, 2.35, -1.6 + 0.8 * number + 0.22,
                                     y / 2 - 1.55, 3.05, bevel=0.03, part='stone'))
    made.append(kit.bevelled_box(-x / 2 + 0.2, y / 2 - 1.3, z - 0.4, x / 2 - 0.2, y / 2 - 0.1, z, bevel=0.05,
                                 part='stone'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.8), (x / 2, y / 2, z))


def mines(kit, module):
    """A timbered mine adit in a rock face: two sets of posts and caps, rails on sleepers running in, and a lantern
    hanging from a hook on the first cap."""
    x, y, z = _size(module)
    made = [kit.box(-1.2, 1.2, -0.3, 1.2, 1.6, 2.8, part='earth')]
    for number, (cx, cy, sx, sy, sz, low) in enumerate([(-1.9, 0.9, 1.3, 3.0, 3.6, -0.3), (1.9, 0.8, 1.3, 3.2, 3.2,
                                                                                           -0.3),
                                                        (0.0, 1.5, 5.0, 2.0, 2.0, 2.6), (0.0, 0.6, 4.6, 1.4, 1.6,
                                                                                          2.9)]):
        made.append(_boulder(kit, cx, cy, low, sx, sy, sz, f'{module}.{number}'))
    for at in (-0.6, 0.6):
        for side in (-1, 1):
            made.append(kit.box(side * 1.25 - 0.14, at - 0.14, -0.2, side * 1.25 + 0.14, at + 0.14, 2.6, part='wood'))
        made.append(kit.box(-1.55, at - 0.16, 2.6, 1.55, at + 0.16, 2.92, part='wood'))
    for side in (-1, 1):
        made.append(kit.box(side * 0.45 - 0.04, -y / 2, 0.05, side * 0.45 + 0.04, 1.4, 0.13, part='iron'))
    for number in range(8):
        at = -y / 2 + 0.25 + 0.48 * number
        made.append(kit.box(-0.7, at - 0.1, -0.05, 0.7, at + 0.1, 0.05, part='wood'))
    made.append(kit.ring((0.0, -0.6, 2.47), 0.09, 0.02, axis=(1.0, 0.0, 0.0), sides=8, tube_sides=4))
    made.append(kit.box(-0.1, -0.7, 2.05, 0.1, -0.5, 2.38, part='iron'))
    made.append(kit.box(-0.06, -0.66, 2.1, 0.06, -0.54, 2.3, part='ember'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.3), (x / 2, y / 2, z))


def tent(kit, module):
    """A ridge tent of canvas on two poles, its flap at the front, guyed out to pegs."""
    x, y, z = _size(module)
    made = [kit.extrude_outline([(-1.6, 0.0), (1.6, 0.0), (0.0, z - 0.15)], -1.5, 1.5, 'xz', part='cloth',
                                smooth=None)]
    made.append(kit.extrude_outline([(-0.6, 0.0), (0.6, 0.0), (0.0, 1.5)], -1.54, -1.5, 'xz', part='earth',
                                    smooth=None))
    for at in (-1.55, 1.55):
        made.append(kit.cylinder((0, at, 0), (0, at, z), 0.05, sides=6, part='wood'))
        for side in (-1, 1):
            peg = (side * 1.95, at * 1.25, 0.0)
            made.append(kit.tube([(0, at, z - 0.1), peg], 0.015, sides=4, part='rope'))
            made.append(kit.box(peg[0] - 0.03, peg[1] - 0.03, -0.2, peg[0] + 0.03, peg[1] + 0.03, 0.12, part='wood'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.2), (x / 2, y / 2, z))


def palisade(kit, module):
    """A run of sharpened stakes along x, bound to two rails behind them."""
    x, y, z = _size(module)
    made = []
    count = 20
    draw = kit.seeded(module)
    for number in range(count):
        at = -x / 2 + 0.2 + (x - 0.4) * number / (count - 1)
        top = z - 0.5 - draw.uniform(0, 0.35)
        made.append(kit.prism((at, 0, -0.4), (at, 0, top), 0.18, sides=5, part='wood'))
        made.append(kit.cone((at, 0, top), (at, 0, top + 0.5), 0.18, 0.0, sides=5, part='wood', smooth=None))
    for height in (0.7, 1.9):
        made.append(kit.box(-x / 2, 0.18, height, x / 2, 0.36, height + 0.18, part='plank'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.4), (x / 2, y / 2, z))


def fire(kit, module):
    """A camp fire: a ring of stones round charred logs stacked to a point, the ember glowing on the coals."""
    x, y, z = _size(module)
    made = []
    for number in range(9):
        angle = math.tau * number / 9
        made.append(kit.rock(0.66 * math.cos(angle), 0.66 * math.sin(angle), -0.05, (0.28, 0.26, 0.24),
                             seed=f'{module}.{number}', detail=0, roughness=0.2, base=0.1, part='stoneAlt',
                             smooth=None))
    for number in range(5):
        angle = math.tau * number / 5
        made.append(kit.tube([(0.5 * math.cos(angle), 0.5 * math.sin(angle), 0.02), (0.05 * math.cos(angle),
                                                                                       0.05 * math.sin(angle), z)],
                             [0.07, 0.04], sides=5, part='bark'))
    made.append(kit.rock(0, 0, -0.02, (0.6, 0.6, 0.18), seed=f'{module}.coals', detail=1, roughness=0.3, base=0.0,
                         part='ember'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.05), (x / 2, y / 2, z))


def pieces(kit):
    """Every door and camp piece of the common kit."""
    return {'door.caverns': caverns(kit, 'common.door.caverns'), 'door.crypt': crypt(kit, 'common.door.crypt'),
            'door.mines': mines(kit, 'common.door.mines'), 'camp.tent': tent(kit, 'common.camp.tent'),
            'camp.palisade': palisade(kit, 'common.camp.palisade'), 'camp.fire': fire(kit, 'common.camp.fire')}
