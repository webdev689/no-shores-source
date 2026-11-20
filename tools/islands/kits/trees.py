"""The biome kits' trees, each by code: a trunk and its limbs as tapering tubes, a crown of leafy masses or fronds or
tiers of boughs, each filling its size in kits.json. Numbers are the module's frame: x east, y south, z up, metres.
"""
import math

import catalog

SINK_M = 0.2


def _size(module):
    return catalog.MODULES[module]['size']


def mass(kit, x, y, z, sx, sy, sz, seed, part='leaf', detail=1):
    """A leafy mass: a lumpy ball filling sx × sy × sz from z, its middle at (x, y)."""
    return kit.rock(x, y, z, (sx, sy, sz), seed=seed, detail=detail, roughness=0.35, base=0.0, part=part,
                    smooth=50.0)


def limb(kit, start, end, r0, r1, bow=(0.0, 0.0, 0.0), part='bark', sides=6, steps=3):
    """A branch or trunk from `start` to `end`, bowed by `bow`, tapering from r0 to r1."""
    points = kit.bent(start, end, bow, steps)
    radii = [r0 + (r1 - r0) * step / steps for step in range(steps + 1)]
    return kit.tube(points, radii, sides=sides, part=part)


def _around(count, reach, z, turn=0.0):
    """`count` points `reach` out round the upright at height z, the first `turn` degrees from east."""
    return [(reach * math.cos(math.radians(turn + 360 * k / count)), reach * math.sin(math.radians(turn + 360 * k /
                                                                                                  count)), z)
            for k in range(count)]


def broadleaf(kit, module, trunk_share=0.45, limbs=4, masses=7, part='leaf', bark='bark', slender=1.0,
              flat=1.0, buttress=0, seed=None):
    """A broadleaf tree: a trunk `trunk_share` of its height, `limbs` limbs fanning up and out, and a crown of
    `masses` leafy masses over them; `flat` below 1 squashes the crown into a table (an acacia), `buttress` fins
    at its foot (a rainforest giant)."""
    x, y, z = _size(module)
    seed = seed or module
    fork = z * trunk_share
    made = [limb(kit, (0, 0, -SINK_M), (0.05, 0.03, fork + 0.3), 0.34 * slender, 0.24 * slender, sides=7)]
    depth = (z - fork) * (0.62 if flat >= 1 else 0.3)
    # The limbs end inside the crown's underside, so no crown floats over bare limbs.
    tips = _around(limbs, x * 0.27, z - depth * 0.75, 20.0)
    for number, tip in enumerate(tips):
        made.append(limb(kit, (0, 0, fork), tip, 0.19 * slender, 0.07, bow=(0, 0, 0.4 * flat), sides=5))
    draw = kit.seeded(f'{seed}.crown')
    for number in range(masses):
        if number == 0:
            cx, cy, low = 0.0, 0.0, z - depth
        else:
            angle = math.radians(360 * number / (masses - 1) + draw.uniform(-15, 15))
            reach = x * draw.uniform(0.2, 0.26)
            cx, cy = reach * math.cos(angle), reach * math.sin(angle) * y / x
            low = z - depth - draw.uniform(0.0, depth * 0.45) * flat
        span = x * draw.uniform(0.44, 0.52)
        made.append(mass(kit, cx, cy, low, span, span * y / x, depth * draw.uniform(0.75, 1.0),
                         f'{seed}.m{number}', part))
    made += fins(kit, buttress, 0.3 * slender, x * 0.28, z * 0.22, bark)
    return kit.join(made)


def fins(kit, count, root, reach, height, part='bark'):
    """`count` buttress roots round a trunk of radius `root`: thin fins out to `reach`, `height` up it."""
    made = []
    for number in range(count):
        fin = kit.extrude_outline([(root * 0.6, -SINK_M), (reach, -SINK_M), (root * 0.6, height)], -0.06, 0.06,
                                  'xz', part=part, smooth=None)
        made.append(kit.rotate_z(fin, 360 * number / count + 25))
    return made


def snag(kit, module, part='wood', bark='bark', twist=0.0, snow=False, vines=0, seed=None):
    """A dead tree: a trunk broken off in splinters, bare limbs (twisting by `twist`), and with `snow` a cap on its
    break, with `vines` vines hanging from its limbs."""
    x, y, z = _size(module)
    seed = seed or module
    top = z * 0.86
    made = [limb(kit, (0, 0, -SINK_M), (0.1, 0.05, top), 0.3, 0.2, bow=(twist * 0.6, twist * 0.3, 0), part=bark,
                 sides=7, steps=4)]
    for number, (dx, dy) in enumerate(((0.12, 0.0), (-0.08, 0.1), (0.0, -0.12))):
        made.append(kit.cone((0.1 + dx, 0.05 + dy, top - 0.2), (0.1 + dx * 2.5, 0.05 + dy * 2.5, z - 0.4 * number
                                                                 * (1 - twist / 3)), 0.12, 0.0, sides=4,
                             part=part, smooth=None))
    ends = [(x * 0.45, 0.2, z * 0.7), (-x * 0.45, -0.3, z * 0.55), (0.3, y * 0.45, z * 0.78), (-0.2, -y * 0.42,
                                                                                               z * 0.42)]
    for number, end in enumerate(ends):
        root = (0.05, 0.03, end[2] - 1.2)
        made.append(limb(kit, root, end, 0.13, 0.03, bow=(twist * 0.4, -twist * 0.4, 0.5), part=part, sides=5))
        for strand in range(vines):
            hang = (end[0] * (0.5 + 0.25 * strand), end[1] * (0.5 + 0.25 * strand), end[2] - 0.3 * strand)
            made.append(limb(kit, hang, (hang[0] * 1.05, hang[1] * 1.05, max(0.4, hang[2] - 3.2 + strand)), 0.035,
                             0.025, bow=(0.1, 0.1, 0), part='leaf', sides=4, steps=3))
            made.append(mass(kit, hang[0], hang[1], hang[2] - 1.2, 0.45, 0.45, 0.7, f'{seed}.v{number}{strand}',
                             'leafAlt', detail=0))
    if snow:
        made.append(mass(kit, 0.1, 0.05, top - 0.05, 0.6, 0.6, 0.25, f'{seed}.snow', 'snow', detail=0))
    return kit.join(made)


def palm(kit, module, lean=0.0, fronds=12, droop=1.5, part='leaf', fruit='wood', rings=True, seed=None):
    """A palm: a trunk (its foot leaning `lean` metres west of its top), ringed where old fronds fell with `rings`,
    a head of `fronds` drooping fronds and a cluster of fruit under them."""
    x, y, z = _size(module)
    head = (lean * 0.45, 0.0, z * 0.84)
    foot = (-lean * 0.55, 0.0, -SINK_M)
    steps = 8
    points = kit.bent(foot, head, (lean * -0.25, 0, 0), steps)
    radii = [0.3 - 0.11 * step / steps + (0.04 if rings and step % 2 else 0.0) for step in range(steps + 1)]
    made = [kit.tube(points, radii, sides=7, part='bark')]
    reach = x / 2 - abs(lean) * 0.45 - 0.08
    for number in range(fronds):
        heading = 360 * number / fronds + (17 if number % 2 else 0)
        up = 0.55 if number % 3 == 0 else 0.25
        made.append(kit.frond(head, heading, reach * (0.93 + 0.07 * (number % 2)), 0.7, droop, rise=up, segments=4,
                              part=part))
    made.append(mass(kit, head[0], head[1], head[2] - 0.55, 0.9, 0.9, 0.7, f'{seed or module}.fruit', fruit,
                     detail=1))
    return kit.join(made)


def conifer(kit, module, tiers=7, part='leaf', snow=False, bend=0.0, spread=1.0, seed=None):
    """A conifer: a straight trunk under tiers of drooping boughs, each ragged and turned from the last, wider
    toward the foot; `snow` lies on each tier; `bend` (metres) pushes the crown east, flagged by the wind."""
    x, y, z = _size(module)
    seed = seed or module
    made = [limb(kit, (0, 0, -SINK_M), (bend, 0, z - 0.3), 0.3, 0.06, bow=(bend * 0.3, 0, 0), sides=6, steps=4)]
    base = z * 0.16
    for tier in range(tiers):
        share = tier / tiers
        low = base + (z - base - 0.8) * share
        reach = (x / 2 - 0.16) * spread * (1 - share * 0.78) * (0.95 if tier % 2 else 1.0)
        centre = bend * (share ** 1.6) + (reach * 0.25 if bend else 0.0)
        height = min((z - base) / tiers * 1.7, z - 0.2 - low)
        profile = [(0.0, height), (reach * 0.5, height * 0.55), (reach, 0.0), (reach * 0.8, -0.18)]
        bough = kit.lathe(profile, centre, 0.0, low, sides=8, part=part, smooth=None)
        made.append(kit.rotate_z(kit.jitter(bough, 0.14, seed=f'{seed}.{tier}'), 22.5 * tier, (centre, 0.0)))
        if snow:
            cap = [(0.0, min(height + 0.07, z - 0.05 - low)), (reach * 0.52, height * 0.6), (reach * 0.82, height * 0.2),
                   (reach * 0.6, height * 0.25)]
            made.append(kit.lathe(cap, centre, 0.0, low + 0.06, sides=8, part='snow', smooth=None))
    made.append(kit.cone((bend, 0, z - 0.9), (bend, 0, z - 0.02), 0.35, 0.0, sides=5, part=part, smooth=None))
    return kit.join(made)


def windswept(kit, module, part='leaf', seed=None):
    """A pine bent by the wind: a trunk leaning hard east, its few masses streaming out to the east."""
    x, y, z = _size(module)
    seed = seed or module
    made = [limb(kit, (-x * 0.3, 0, -SINK_M), (x * 0.18, 0, z * 0.82), 0.34, 0.12, bow=(-1.4, 0, 0.4), sides=6,
                 steps=5)]
    for number, (cx, cy, cz, sx) in enumerate([(x * 0.1, 0, z * 0.74, x * 0.5), (x * 0.24, -0.8, z * 0.66,
                                                                                 x * 0.44),
                                               (x * 0.2, 0.9, z * 0.6, x * 0.4), (-x * 0.06, 0.2, z * 0.52, x * 0.34)]):
        made.append(limb(kit, (cx - sx * 0.4, cy * 0.3, cz - 0.6), (cx + sx * 0.3, cy, cz + 0.3), 0.1, 0.04,
                         sides=4, steps=2))
        made.append(mass(kit, cx, cy, cz, sx, y * 0.5, z - cz if number == 0 else z * 0.14, f'{seed}.{number}',
                         part))
    return kit.join(made)


def scots_pine(kit, module, part='leaf', seed=None):
    """A pine of the high ground: a tall bare trunk, a few short limbs near its top and flat clumps of needles."""
    x, y, z = _size(module)
    seed = seed or module
    made = [limb(kit, (0, 0, -SINK_M), (0.4, 0.2, z * 0.9), 0.4, 0.12, bow=(0.5, 0.2, 0), sides=7, steps=4)]
    clumps = [(-x * 0.26, -y * 0.1, z * 0.58, x * 0.42), (x * 0.24, y * 0.16, z * 0.66, x * 0.46),
              (-x * 0.06, y * 0.3, z * 0.74, x * 0.36), (x * 0.1, -y * 0.28, z * 0.78, x * 0.4),
              (0.3, 0.1, z * 0.86, x * 0.38)]
    for number, (cx, cy, cz, sx) in enumerate(clumps):
        made.append(limb(kit, (0.3, 0.15, cz - 0.4), (cx, cy, cz + 0.2), 0.12, 0.05, bow=(0, 0, 0.3), sides=4,
                         steps=2))
        made.append(mass(kit, cx, cy, cz, sx, sx * 0.9, z - cz if number == 4 else z * 0.1, f'{seed}.{number}',
                         part))
    return kit.join(made)
