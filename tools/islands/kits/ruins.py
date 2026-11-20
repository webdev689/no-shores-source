"""The common kit's ruins: a broken fluted column, its drums fallen, a broken wall, an arch, a stair and a weathered
statue, all of one worn stone. Numbers are the module's frame: x east, y south, z up, metres; the front at -y.
"""
import math

import catalog


def _size(module):
    return catalog.MODULES[module]['size']


def shaft(kit, x, y, z0, z1, radius, flutes=12, broken=0.0, seed=None, part='stone'):
    """A fluted drum or shaft standing on (x, y) from z0 to z1, `flutes` channels round it; with `broken` its top
    snapped off in a slant that falls `broken` metres across it."""
    sides = flutes * 2
    profile = [(radius * (1.0 if k % 2 else 0.93), 0) for k in range(sides)]
    points = []
    for k, (reach, _) in enumerate(profile):
        angle = math.tau * k / sides
        points.append((reach * math.cos(angle), reach * math.sin(angle)))
    item = kit.extrude_outline(points, z0, z1, 'xy', part=part, smooth=None)
    if broken:
        draw = kit.seeded(seed)
        for vertex in item.data.vertices:
            if vertex.co.z > z1 - 1e-4:
                vertex.co.z -= broken * (0.5 + 0.5 * vertex.co.x / radius) + draw.uniform(0, broken * 0.25)
        item.data.update()
    return kit.translate(item, x, y)


def column(kit, module):
    """A fluted column on its base, snapped off high, a drum fallen at its foot."""
    x, y, z = _size(module)
    made = [kit.bevelled_box(-x / 2, -y / 2, -0.2, x / 2, y / 2, 0.35, bevel=0.05, part='stoneAlt'),
            kit.lathe([(0.62, 0.35), (0.6, 0.5), (0.52, 0.6), (0.0, 0.6)], part='stone'),
            shaft(kit, 0, 0, 0.6, z, 0.48, broken=0.9, seed=module)]
    return kit.join(made)


def fallen(kit, module):
    """Three column drums lying along y where they fell, rolled apart, the middle one cracked."""
    x, y, z = _size(module)
    made = []
    for number, (dy, dx, length) in enumerate(((-2.1, 0.0, 1.6), (0.0, 0.1, 1.4), (2.1, -0.1, 1.5))):
        drum = shaft(kit, 0, 0, -length / 2, length / 2, z / 2 - 0.02, flutes=10)
        drum = kit.rotate(kit.rotate(drum, 90, 'x'), 14 * (number - 1), 'z')
        made.append(kit.translate(drum, dx, dy, z / 2 - 0.08))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.1), (x / 2, y / 2, z))


def wall(kit, module):
    """A run of coursed wall along x, its top broken away in steps, fallen blocks at its foot."""
    x, y, z = _size(module)
    made = []
    heights = [z, z * 0.82, z * 0.55, z * 0.68, z * 0.35, z * 0.5]
    run = x / len(heights)
    for number, top in enumerate(heights):
        x0 = -x / 2 + run * number
        made.append(kit.stones(x0, x0 + run, -0.3, top, -0.4, 0.4, block=(0.7, 1.2), course=(0.45, 0.6),
                               bevel=0.0, alt=0.3,
                               seed=f'{module}.{number}'))
    for number, (bx, by) in enumerate(((0.9, -0.5), (2.2, 0.45))):
        made.append(kit.bevelled_box(bx - 0.3, by - 0.12, 0, bx + 0.35, by + 0.12, 0.3, bevel=0.04, wear=0.03,
                                     seed=f'{module}.b{number}', part='stoneAlt'))
    return kit.join(made)


def arch(kit, module):
    """An arch on two piers, whole, its voussoirs and keystone standing proud."""
    x, y, z = _size(module)
    half = x / 2 - 0.9
    made = []
    for side in (-1, 1):
        made.append(kit.bevelled_box(side * half, -y / 2, -0.2, side * (x / 2), y / 2, z - 2.2, bevel=0.04,
                                     part='stone'))
        made.append(kit.bevelled_box(side * (half - 0.08), -y / 2, z - 2.35, side * (x / 2), y / 2, z - 2.2,
                                     bevel=0.03, part='stoneAlt'))
    made.append(kit.arch(half, z - 2.2, 0.7, -y / 2 + 0.05, y / 2 - 0.05, stones=9, keystone=0.15, part='stone'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.2), (x / 2, y / 2, z))


def stair(kit, module):
    """A flight of steps rising toward the north (-y) between low cheek walls, its edges worn."""
    x, y, z = _size(module)
    steps = 8
    made = []
    for number in range(steps):
        front = -y / 2 + (y - 0.4) * number / steps
        top = z * (steps - number) / steps
        made.append(kit.bevelled_box(-x / 2 + 0.4, front, -0.2, x / 2 - 0.4, front + (y - 0.4) / steps + 0.02, top,
                                     bevel=0.04, wear=0.02, seed=f'{module}.{number}', part='stone'))
    for side in (-1, 1):
        outline = [(-y / 2, z), (-y / 2, -0.2), (y / 2, -0.2), (y / 2, 0.3)]
        cheek = kit.extrude_outline(outline, side * (x / 2 - 0.4), side * x / 2, 'yz',
                                    part='stoneAlt', smooth=None)
        made.append(cheek)
    return kit.join(made)


def statue(kit, module):
    """A weathered robed figure on a plinth: its robe falling in folds, arms at its breast, its face worn away."""
    x, y, z = _size(module)
    plinth = z * 0.28
    made = [kit.bevelled_box(-x / 2, -y / 2, -0.2, x / 2, y / 2, plinth * 0.25, bevel=0.05, part='stoneAlt'),
            kit.bevelled_box(-x / 2 + 0.2, -y / 2 + 0.2, plinth * 0.25, x / 2 - 0.2, y / 2 - 0.2, plinth,
                             bevel=0.05, part='stone')]
    top = z - plinth
    robe = [(0.0, 0.0), (0.62, 0.0), (0.55, top * 0.3), (0.42, top * 0.62), (0.36, top * 0.72), (0.22, top * 0.8),
            (0.0, top * 0.8)]
    made.append(kit.jitter(kit.lathe(robe, 0, 0, plinth, sides=12, part='stone', smooth=30.0), 0.04, seed=module))
    for side in (-1, 1):
        made.append(kit.tube([(side * 0.36, 0.0, plinth + top * 0.74), (side * 0.32, -0.12, plinth + top * 0.55),
                              (side * 0.08, -0.32, plinth + top * 0.6)], 0.09, sides=5, part='stone'))
    made.append(kit.rock(0, -0.03, plinth + top * 0.79, (0.36, 0.4, top * 0.21), seed=f'{module}.head', detail=1,
                         roughness=0.08, base=0.0, part='stone'))
    return kit.join(made)


def pieces(kit):
    """Every ruin piece of the common kit."""
    return {'ruin.column': column(kit, 'common.ruin.column'), 'ruin.fallen': fallen(kit, 'common.ruin.fallen'),
            'ruin.wall': wall(kit, 'common.ruin.wall'), 'ruin.arch': arch(kit, 'common.ruin.arch'),
            'ruin.stair': stair(kit, 'common.ruin.stair'), 'ruin.statue': statue(kit, 'common.ruin.statue')}
