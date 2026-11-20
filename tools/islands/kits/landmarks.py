"""The common kit's landmarks, one to an isle: a ruined watchtower, a fallen temple and a quarry with its crane.
Numbers are the module's frame: x east, y south, z up, metres; the front at -y.
"""
import math

import catalog
from kits.ruins import shaft


def _size(module):
    return catalog.MODULES[module]['size']


def tower(kit, module):
    """A ruined round watchtower: its wall of blocks in three tiers, broken away toward the front and lowest over
    the doorway at -y, a stair of corbels inside, rubble at its foot."""
    x, y, z = _size(module)
    made = []
    count, radius = 22, x / 2 - 0.7
    for number in range(count):
        angle = math.tau * number / count
        facing_front = -math.sin(angle)
        top = z * (0.98 - 0.36 * max(0.0, facing_front) ** 2) - (number % 3) * 0.6
        low = 3.2 if facing_front > 0.95 else -0.4
        width = math.tau * radius / count + 0.06
        # Courses of blocks, each course turned half a block from the last, as a mason lays them.
        for tier in range(9):
            z0, z1 = max(low, -0.4 + tier * 2.5), min(top, -0.4 + (tier + 1) * 2.5 - 0.05)
            if z1 - z0 < 0.2:
                continue
            out = radius + 0.7 - (0.15 if tier == 0 else 0.0)
            block = kit.bevelled_box(radius - 0.6, -width / 2 + 0.03, z0, out, width / 2 - 0.03, z1, bevel=0.05,
                                     part='stone' if (number + tier) % 5 else 'stoneAlt')
            made.append(kit.rotate_z(block, math.degrees(angle + math.pi / count * (tier % 2))))
    made.append(kit.box(-1.0, -radius - 0.75, 3.0, 1.0, -radius + 0.1, 3.4, part='stoneAlt'))
    for number in range(10):
        angle = math.tau * number / 14 + 0.6
        level = 1.0 + number * 1.3
        step = kit.box(radius - 1.6, -0.4, level, radius - 0.5, 0.4, level + 0.25, part='stone')
        made.append(kit.rotate_z(step, math.degrees(angle)))
    for number, (rx, ry) in enumerate(((-3.0, -4.3), (2.6, -4.4), (4.3, 2.4))):
        made.append(kit.rock(rx, ry, -0.2, (1.2, 0.9, 0.8), seed=f'{module}.r{number}', detail=1, roughness=0.2,
                             part='stone', smooth=None))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.4), (x / 2, y / 2, z))


def temple(kit, module):
    """A colonnaded ruin on a stepped platform: two rows of columns, some standing to their architrave and some
    snapped, the cella's walls broken, and the roof fallen in slabs across the floor."""
    x, y, z = _size(module)
    contract = catalog.MODULES[module]
    made = [kit.bevelled_box(-x / 2, -y / 2, -0.4, x / 2, y / 2, 0.4, bevel=0.06, part='stoneAlt'),
            kit.bevelled_box(-x / 2 + 0.6, -y / 2 + 0.6, 0.4, x / 2 - 0.6, y / 2 - 0.6, 0.8, bevel=0.06,
                             part='stone'),
            kit.bevelled_box(-x / 2 + 1.1, -y / 2 + 1.1, 0.8, x / 2 - 1.1, y / 2 - 1.1, 1.2, bevel=0.06,
                             part='stoneAlt')]
    draw = kit.seeded(module)
    standing = []
    for number, (cx, cy, radius) in enumerate(contract['solids'][:-1]):
        whole = number in (0, 1, 2, 6, 7)
        top = z - 1.4 if whole else draw.uniform(2.5, 6.0)
        made.append(shaft(kit, cx, cy, 1.2, top, radius - 0.2, flutes=10, broken=0.0 if whole else 0.6,
                          seed=f'{module}.{number}'))
        if whole:
            made.append(kit.bevelled_box(cx - radius, cy - radius, top, cx + radius, cy + radius, top + 0.4,
                                         bevel=0.05, part='stoneAlt'))
            standing.append((cx, cy, top + 0.4))
    for (ax, ay, at), (bx, by, _) in zip(standing, standing[1:]):
        if ay == by and abs(ax - bx) < 6:
            made.append(kit.bevelled_box(min(ax, bx) - 0.8, ay - 0.6, at, max(ax, bx) + 0.8, ay + 0.6, z,
                                         bevel=0.05, part='stone'))
    cx, cy, radius = contract['solids'][-1]
    for side in (-1, 1):
        made.append(kit.stones(cy - radius, cy + radius, 1.2, 4.5 if side < 0 else 3.0, side * radius - 0.35,
                               side * radius + 0.35, block=(0.8, 1.3), course=(0.45, 0.6), bevel=0.0, alt=0.3,
                               seed=f'{module}.cella{side}'))
        made[-1] = kit.rotate_z(made[-1], 90, (0.0, 0.0))
        made[-1] = kit.translate(made[-1], 0, cy, 0)
    for number, (sx, sy, tilt) in enumerate(((-6.0, 0.5, 14), (5.0, -1.5, -10), (1.0, 4.4, 8))):
        slab = kit.bevelled_box(sx - 2.2, sy - 1.0, 1.2, sx + 2.2, sy + 1.0, 1.6, bevel=0.05, part='stoneAlt')
        made.append(kit.rotate(slab, tilt, 'y', (sx, sy, 1.2)))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.4), (x / 2, y / 2, z))


def quarry(kit, module):
    """A quarry: a timber derrick crane, guyed, its jib over the workings and a block hanging from it; cut blocks
    stacked ready, a sledge to drag them, and the stepped face they were cut from behind."""
    x, y, z = _size(module)
    made = []
    for number, (fx, top, depth) in enumerate(((-6.0, 6.5, 1.8), (-2.4, 5.0, 2.2), (1.2, 6.0, 2.0),
                                               (4.8, 4.2, 2.4))):
        made.append(kit.rock(fx + 1.8, y / 2 - depth / 2, -0.4, (3.6, depth, top), seed=f'{module}.face{number}',
                             shape='cube', detail=1, roughness=0.06, base=0.0, part='rock', smooth=None))
    made.append(kit.box(-5.0, -1.0, -0.2, -3.0, 1.0, 0.3, part='wood'))
    made.append(kit.tube([(-4.0, 0.0, 0.3), (-4.0, 0.0, z)], [0.24, 0.16], sides=8, part='wood'))
    tip = (3.2, -2.0, z * 0.78)
    made.append(kit.tube([(-4.0, 0.0, 1.2), tip], [0.18, 0.1], sides=6, part='wood'))
    made.append(kit.tube([(-4.0, 0.0, z - 0.3), tip], 0.03, sides=4, part='rope'))
    made.append(kit.tube([tip, (3.2, -2.0, 3.0)], 0.035, sides=4, part='rope'))
    for corner in ((-6.8, -4.6), (-6.8, 4.6), (-1.0, 4.6)):
        made.append(kit.tube([(-4.0, 0.0, z - 0.2), (*corner, 0.0)], 0.03, sides=4, part='rope'))
    made.append(kit.bevelled_box(2.6, -2.5, 1.9, 3.8, -1.5, 3.0, bevel=0.04, part='stone'))
    for number, (bx, by, bz) in enumerate(((2.0, 0.6, 0.0), (3.6, 0.6, 0.0), (2.8, 1.6, 0.0), (2.8, 1.0, 1.1))):
        made.append(kit.bevelled_box(bx - 0.75, by - 0.5, bz - 0.2 * (bz == 0), bx + 0.75, by + 0.5, bz + 1.1,
                                     bevel=0.04, part='stone' if number % 2 else 'stoneAlt'))
    for side in (-1, 1):
        made.append(kit.box(-2.0, -3.6 + side * 0.5 - 0.06, 0.0, 0.4, -3.6 + side * 0.5 + 0.06, 0.2, part='wood'))
    made.append(kit.planks((-1.8, -4.2, 0.2), (0.2, -3.0, 0.28), along='x', across='y', width=0.3,
                           seed=f'{module}.sledge'))
    made.append(kit.bevelled_box(-1.5, -4.0, 0.28, -0.3, -3.2, 1.0, bevel=0.04, part='stone'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.4), (x / 2, y / 2, z))


def pieces(kit):
    """Every landmark of the common kit."""
    return {'landmark.tower': tower(kit, 'common.landmark.tower'),
            'landmark.temple': temple(kit, 'common.landmark.temple'),
            'landmark.quarry': quarry(kit, 'common.landmark.quarry')}
