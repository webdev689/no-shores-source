"""The caverns' dripped and grown pieces: the stalagnate pillar (a flowstone foot, a waisted fluted shaft, a flared
head hung with drips), the flowstone curtain down a hewn wall, and the stalactite clusters that hang from a cave's
roof. A shaft is a unit tall and stretched to any height, so its only detail runs up and down it. A dungeon lays
many of each, so each is lean: its triangles go on its outline.
"""
import math
import random

from shapes import TAU, sweep

from styles.caverns import forms

PILLAR = 'caverns.pillar'
WALL = 'caverns.wall'
# The pillar's three pieces meet on one fluted ring of this radius, metres, turned the same way.
JOIN_M = 0.26
JOIN_FLUTE = 0.3
SIDES = 24
_PILLAR_FLUTES = forms.flutes(PILLAR, 6)
_PILLAR_NOISE = forms.Noise(PILLAR)
# A cluster's root rises no higher than z 0: the page hangs it from the highest rock over it, so wherever the roof
# stands lower the rock buries the root.
ROOT_M = 0.0


def _pillar_ring(turn, radius, depth, lumps, z):
    """A pillar ring's reach at a turn: its flutes `depth` deep, worn by `lumps` of noise."""
    noise = _PILLAR_NOISE(math.sin(turn) * 1.3, math.cos(turn) * 1.3, z)
    return radius * (1 + depth * (_PILLAR_FLUTES(turn) - 0.5) + lumps * noise)


def streaks(threshold):
    """Flowstone's streaks: stoneAlt down the crests of a fluted shape round the upright through (0, 0)."""
    def choose(middle, _normal):
        turn = math.atan2(middle[0], -middle[1]) % TAU
        return 'stoneAlt' if _PILLAR_FLUTES(turn) > threshold else 'stone'
    return choose


def drip(top, size, radius, draw, sides=5, rings=4):
    """A stalactite hanging from `top`, `size` long: tapering, fluted, a little bent, to a point."""
    lean = (draw.uniform(-0.12, 0.12) * size, draw.uniform(-0.12, 0.12) * size)
    flute = forms.flutes(draw.random(), draw.choice((4, 5, 6)))
    shares = [0.0] + [1 - (1 - step / rings) ** 1.3 for step in range(1, rings)] + [1.0]
    profile = [(radius * (1 - share) ** 0.9, top[2] - size * share) for share in shares]
    return forms.turned(profile, lambda turn, z, r: r * (1 + 0.22 * (flute(turn) - 0.5)), sides, top[:2],
                        lambda z: tuple(value * ((top[2] - z) / size) ** 2 for value in lean))


def pillar_base():
    """The stalagnate's foot: flowstone spread on the floor in lobes, young stalagmites beside it."""
    profile = [(0.47, 0.0), (0.42, 0.07), (0.35, 0.15), (0.3, 0.25), (0.275, 0.35), (JOIN_M, 0.45)]

    def radius_at(turn, z, radius):
        low = max(0.0, 1 - z / 0.25)
        reach = _pillar_ring(turn, radius, JOIN_FLUTE + 0.1 * low, 0.1 * low, z * 3)
        return forms.ease_under(reach, 0.54 if z < 0.25 else 0.345, 0.03)

    faces = forms.turned(profile, radius_at, SIDES)
    draw = random.Random(f'{PILLAR} stubs')
    for turn in (0.6, 2.9, 4.4):
        x, y = 0.44 * math.sin(turn), -0.44 * math.cos(turn)
        size = draw.uniform(0.1, 0.2)
        faces += forms.turned([(0.055, 0.0), (0.035, size * 0.6), (0.0, size)], None, 5, (x, y))
    return faces


def pillar_shaft():
    """The stalagnate's shaft: waisted where the stalactite met the stalagmite, fluted all the way, its flowstone
    swelling and thinning in long drips."""
    rings = 8
    profile = [(JOIN_M * (1 - 0.2 * math.sin(math.pi * k / (rings - 1)) ** 1.3), k / (rings - 1))
               for k in range(rings)]

    def radius_at(turn, z, radius):
        reach = _pillar_ring(turn, radius, JOIN_FLUTE, 0.15 * math.sin(math.pi * z), z * 2.6)
        return forms.ease_under(reach, 0.345, 0.03)

    return forms.turned(profile, radius_at, SIDES)


def pillar_capital():
    """The stalagnate's head: the stalactite's root flaring into the roof in lobes, drips hanging round it."""
    profile = [(JOIN_M, 0.0), (0.29, 0.18), (0.37, 0.36), (0.47, 0.48), (0.57, 0.58), (0.615, 0.65)]

    def radius_at(turn, z, radius):
        rise = z / 0.65
        reach = _pillar_ring(turn, radius, JOIN_FLUTE - 0.12 * rise, 0.1 * rise, z * 3)
        return forms.ease_under(reach, 0.69, 0.03)

    faces = forms.turned(profile, radius_at, SIDES)
    draw = random.Random(f'{PILLAR} drips')
    for number in range(5):
        turn = TAU * (number + draw.uniform(0.1, 0.9)) / 5
        reach = draw.uniform(0.38, 0.46)
        z = 0.36 + (reach - 0.37) / 0.1 * 0.12
        faces += drip((reach * math.sin(turn), -reach * math.cos(turn), z + 0.02), draw.uniform(0.14, 0.3),
                      draw.uniform(0.035, 0.05), draw)
    return faces


_WALL_FOLDS = forms.flutes(WALL, 4, 1.2)
_WALL_NOISE = forms.Noise(WALL)
WALL_HALF_M = 0.74
WALL_COLUMNS = 16


def _fold_depth(share):
    """How far the curtain stands out at `share` across it (-1..1): folds, thinning to the wall at its edges."""
    edge = max(0.0, 1 - share * share) ** 0.6
    swell = 1 + 0.3 * _WALL_NOISE(share * 2.5, 0.3)
    return edge * (0.05 + 0.17 * _WALL_FOLDS((share + 1) * math.pi)) * swell


def _curtain(rows, place):
    """The curtain's sheet: columns across it, each a line of `rows` points up it, `place(share, z_share)` giving
    each point. It faces out of the wall (+y); its back against the wall is left open."""
    sections = []
    for column in range(WALL_COLUMNS + 1):
        share = -1 + 2 * column / WALL_COLUMNS
        sections.append([place(share, row / rows) for row in range(rows + 1)])
    return sweep(sections, closed=False, outward=lambda points, i: (0.0, 1.0, 0.0))


def wall_streaks(middle, _normal):
    """A curtain's parts: calcite down its folds, in the cave's floor picture, its smoothest and palest; the cave's
    rock in their grooves, so the folds band it and it stands out of the wall it hangs on."""
    share = max(-1.0, min(1.0, middle[0] / WALL_HALF_M))
    return 'floor' if _WALL_FOLDS((share + 1) * math.pi) > 0.35 else 'stone'


def wall_base():
    """The curtain's foot: its folds spreading on the floor in rounded lobes."""
    def place(share, rise):
        spread = (1 - rise) ** 2
        lobe = 0.06 * spread * (1 + _WALL_NOISE(share * 4, 7.0)) * max(0.0, 1 - share * share)
        y = forms.ease_under(_fold_depth(share) * (1 + 0.3 * spread) + lobe, 0.29, 0.03)
        x = share * (WALL_HALF_M + 0.04 * spread)
        return forms.ease_over(forms.ease_under(x, 0.79, 0.02), -0.79, 0.02), y, 0.4 * rise
    return _curtain(3, place)


def wall_shaft():
    """The curtain itself: folds running down the wall, swelling and thinning in long drips."""
    def place(share, rise):
        bulge = math.sin(math.pi * rise)
        swell = 1 + 0.4 * bulge * _WALL_NOISE(share * 6, rise * 2.4)
        edge = WALL_HALF_M + 0.04 * bulge * _WALL_NOISE(share * 3, rise * 3 + 9.0)
        return share * edge, forms.ease_under(_fold_depth(share) * swell, 0.29, 0.03), rise
    return _curtain(4, place)


def wall_cap():
    """The curtain's head: its folds fanning out across the roof where the water first ran, drips hung under it."""
    height = 0.9

    def place(share, rise):
        spread = rise ** 1.5
        lumps = 0.05 * rise * _WALL_NOISE(share * 4, 3.0 + rise * 2) * max(0.0, 1 - share * share)
        y = forms.ease_under(_fold_depth(share) * (1 + 1.3 * spread) + lumps, 0.57, 0.03)
        return share * (WALL_HALF_M + 0.6 * spread), y, height * rise

    faces = _curtain(4, place)
    draw = random.Random(f'{WALL} drips')
    for share in (-0.55, -0.1, 0.35, 0.7):
        x, y, z = place(share, 0.45)
        faces += drip((x, y - 0.04, z), draw.uniform(0.14, 0.3), draw.uniform(0.03, 0.045), draw, 4, 3)
    return faces


def _root(radius, depth, seed, stretch):
    """The rock a cluster hangs from: a lumpy swelling of the roof, open at z 0. Gives
    its faces and how far it hangs at a reach (share of its radius) from its middle."""
    noise = forms.Noise(seed)
    shares = (1.05, 1.0, 0.82, 0.55, 0.25, 0.0)
    drops = (-ROOT_M / depth, 0.0, 0.35, 0.72, 0.94, 1.0)
    profile = [(radius * share, -depth * drop) for share, drop in zip(shares, drops)]

    def radius_at(turn, z, reach):
        long = 1 + (stretch - 1) * abs(math.sin(turn))
        return reach * long * (1 + 0.25 * noise(math.sin(turn) * 1.6, math.cos(turn) * 1.6, z * 4))

    def hang_at(share):
        for (a, za), (b, zb) in zip(zip(shares[1:], drops[1:]), zip(shares[2:], drops[2:])):
            if b <= share <= a:
                return -depth * (za + (zb - za) * (a - share) / (a - b))
        return -depth
    return forms.turned(profile, radius_at, 9), hang_at


def cluster(seed, radius, depth, longest, drips, straws=0, stretch=1.0, giant=0.0, row=False):
    """A stalactite cluster: a root of roof rock `depth` deep, `drips` stalactites whose tips come down to at most
    `longest` under z 0, and `straws` soda straws; with `giant`, one great stalactite from its middle down to that;
    with `row`, the stalactites in a line along x, as they hang from a crack."""
    draw = random.Random(seed)
    faces, hang_at = _root(radius, depth, seed, stretch)
    if giant:
        top = (0.03, -0.02, hang_at(0.0) + 0.06)
        faces += drip(top, giant + top[2], radius * 0.32, draw, 8, 6)
    for number in range(drips):
        share = draw.uniform(0.3 if giant else 0.0, 0.75)
        turn = TAU * (number + draw.uniform(0.2, 0.8)) / drips
        long = 1 + (stretch - 1) * abs(math.sin(turn))
        x, y = radius * long * share * math.sin(turn), -radius * share * math.cos(turn)
        if row:
            along = -1 + 2 * (number + draw.uniform(0.3, 0.7)) / drips
            x, y, share = radius * stretch * 0.8 * along, draw.uniform(-0.08, 0.08), abs(along) * 0.8
        top = (x, y, hang_at(share) + 0.04)
        # One drip runs the full length, so the cluster hangs as deep as its kind says; the rest fall short.
        size = (longest + top[2]) * (1.0 if number == drips // 2 else draw.uniform(0.35, 0.9) * (1 - 0.3 * share))
        faces += drip(top, size, draw.uniform(0.05, 0.09) * (0.6 + size), draw, 6 if size > 0.5 else 5)
    for _ in range(straws):
        share, turn = draw.uniform(0.2, 0.85), draw.uniform(0, TAU)
        x, y = radius * share * math.sin(turn), -radius * share * math.cos(turn)
        top, size = hang_at(share) + 0.03, draw.uniform(0.08, 0.3)
        faces += forms.turned([(0.014, top), (0.015, top - size), (0.0, top - size - 0.008)], None, 4, (x, y))
    return {'stone': faces}
