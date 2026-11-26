"""The chalk's own forms as kit objects: cut chalk blocks, the dark flint nodules that lie through it in bands, the
pick marks the cutters left, the shells and urchins the old sea left in it, and the squared oak they propped it with.
Chalk wears `stone` (the chalk's pale set), flint `stoneAlt`, the fossils `bone`, the props `wood`, their dogs and
hooks `iron`. Numbers are the dungeon's frame: x east, y south, z up, metres.
"""
import math
import random


def chalk(kit, x0, y0, z0, x1, y1, z1, seed, wear=0.012, bevel=0.025, part='stone'):
    """A cut block of chalk, its arrises softened and its faces a little uneven."""
    return kit.bevelled_box(x0, y0, z0, x1, y1, z1, bevel=bevel, wear=wear, seed=seed, part=part)


def flints(kit, x0, x1, z, y, seed, count=None, size=(0.07, 0.15), out=1.0, sink=0.6, axis='x', detail=0):
    """A band of flint nodules lying through a face at height z: knobbly dark lumps at seeded places from x0 to x1
    (along y instead with `axis` 'y'), each sunk `sink` of its depth into the face at `y` (x for axis 'y') and
    standing out toward `out` (+1 or -1)."""
    draw = random.Random(f'flints {seed}')
    count = count or max(2, round(abs(x1 - x0) / 0.16))
    made = []
    for number in range(count):
        along = x0 + (x1 - x0) * (number + draw.uniform(0.15, 0.85)) / count
        wide, high = draw.uniform(*size), draw.uniform(size[0] * 0.7, size[1] * 0.8)
        deep = wide * draw.uniform(0.6, 0.9)
        middle = y + out * deep * (0.5 - sink)
        lift = z + draw.uniform(-0.035, 0.035)
        if axis == 'x':
            spot, extent = (along, middle), (wide, deep, high)
        else:
            spot, extent = (middle, along), (deep, wide, high)
        made.append(kit.rock(spot[0], spot[1], lift - high / 2, extent, seed=f'{seed} {number}', detail=detail,
                             roughness=0.38, part='stoneAlt', smooth=50.0))
    return made


def pick_marks(kit, x0, x1, z0, z1, y, seed, count=8, out=1.0, part='relief'):
    """The cutters' pick marks on a face at `y`: short slanting grooves in rows, each a shallow sunk strip standing
    a hair proud so the picture shows it, slanting the way a swing falls."""
    draw = random.Random(f'picks {seed}')
    made = []
    for number in range(count):
        x, z = draw.uniform(x0 + 0.05, x1 - 0.05), draw.uniform(z0 + 0.06, z1 - 0.06)
        long = draw.uniform(0.09, 0.17)
        near, far = sorted((y, y + out * 0.004))
        mark = kit.box(x - 0.008, near, z - long / 2, x + 0.008, far, z + long / 2, part=part)
        made.append(kit.rotate(mark, draw.uniform(25, 50) * draw.choice((-1, 1)), 'y', (x, y, z)))
    return made


def shell(kit, at, size, turn=0.0, tilt=0.0, part='bone'):
    """A scallop's valve, ribbed from its hinge out in a fan, its ears either side of the hinge: `size` across,
    lying in the xz plane facing -y before it is tilted (about x) and turned (about z)."""
    ribs = 7
    outline = [(0.0, 0.0)]
    for number in range(ribs * 2 + 1):
        angle = math.radians(-62 + 124 * number / (ribs * 2))
        reach = size / 2 * (1.0 if number % 2 == 0 else 0.93)
        outline.append((math.sin(angle) * reach, math.cos(angle) * reach))
    made = [kit.extrude_outline([(x, z) for x, z in outline][::-1], -0.012 * size / 0.1, 0.0, 'xz', part=part)]
    made.append(kit.extrude_outline([(-size * 0.2, -size * 0.02), (size * 0.2, -size * 0.02), (size * 0.12, size * 0.1),
                                     (-size * 0.12, size * 0.1)][::-1], -0.008 * size / 0.1, 0.0, 'xz', part=part))
    for number in range(ribs):
        angle = math.radians(-54 + 108 * number / (ribs - 1))
        made.append(kit.cone((0.0, -0.004, 0.02 * size), (math.sin(angle) * size * 0.45, -0.004,
                                                          math.cos(angle) * size * 0.45), size * 0.03, size * 0.015,
                             sides=3, part=part))
    piece = kit.join(made, 'shell')
    kit.rotate(piece, tilt, 'x')
    kit.rotate_z(piece, turn)
    return kit.translate(piece, *at)


def urchin(kit, at, size, part='bone', facing=(0.0, -1.0, 0.0), studs=(0.35, 0.7)):
    """A sea urchin turned to flint and chalk: a low dome `size` across with its five rows of studs running from its
    crown, set into a face looking along `facing` (north by default) or lying on the floor (up)."""
    half = size / 2
    dome = kit.lathe([(0.0, 0.0), (half, 0.0), (half * 0.95, half * 0.35), (half * 0.6, half * 0.72),
                      (0.0, half * 0.85)], sides=10, part=part)
    made = [dome]
    for row in range(5):
        turn = math.tau * row / 5
        for step in studs:
            reach = half * (1.0 - step * 0.8)
            z = half * 0.85 * math.sin(step * math.pi / 2)
            made.append(kit.cone((math.sin(turn) * reach, math.cos(turn) * reach, z - 0.004),
                                 (math.sin(turn) * reach * 1.05, math.cos(turn) * reach * 1.05, z + size * 0.07),
                                 size * 0.05, 0.0, sides=3, part='stoneAlt'))
    piece = kit.join(made, 'urchin')
    if facing[2] < 0.5:
        # Stood from lying up to facing north, out of a wall.
        kit.rotate(piece, 90 if facing[1] < 0 else -90, 'x')
    return kit.translate(piece, *at)


def post(kit, x, y, z0, z1, seed, half=0.1, part='wood'):
    """A squared oak prop, adzed: its faces a little uneven, its arrises taken off."""
    return kit.bevelled_box(x - half, y - half, z0, x + half, y + half, z1, bevel=0.018, wear=0.006, seed=seed,
                            part=part)


def wedge(kit, x, y, z, size=0.12, flip=1, deep=0.06):
    """A timber wedge driven in along x from `x`, toward `flip` (+1 or -1), lying on `z`: a thin slab tipped up."""
    low, high = sorted((x, x + flip * size))
    piece = kit.box(low, y - deep / 2, z, high, y + deep / 2, z + 0.028, part='wood')
    return kit.rotate(piece, 7 * flip, 'y', (x, y, z))


def dog(kit, x0, x1, y, z, part='iron'):
    """An iron dog: a staple driven across a joint, its two points into the timbers either side, along x at `y`."""
    near, far = sorted((y, y + 0.02))
    made = [kit.box(x0, near, z - 0.012, x1, far, z + 0.012, part=part)]
    # Its points go into the timber behind it, toward +y.
    for x in (x0, x1 - 0.022):
        made.append(kit.box(x, far, z - 0.012, x + 0.022, far + 0.03, z + 0.012, part=part))
    return kit.join(made, 'dog')


def spoil(kit, area, count, seed, high=(0.02, 0.045), size=(0.06, 0.2), part='floor', flint_share=0.2, z=-0.005,
          detail=0):
    """Spoil the cutters left: flat lumps of chalk lying on the floor in `area` (x0, y0, x1, y1), no higher than
    `high`, a share of them flint chips."""
    draw = random.Random(f'spoil {seed}')
    made = []
    for number in range(count):
        x, y = draw.uniform(area[0], area[2]), draw.uniform(area[1], area[3])
        wide = draw.uniform(*size)
        flint = draw.random() < flint_share
        made.append(kit.rock(x, y, z, (wide, wide * draw.uniform(0.55, 0.95), draw.uniform(*high)),
                             seed=f'{seed} {number}', detail=detail, roughness=0.3,
                             part='stoneAlt' if flint else part))
    return made
