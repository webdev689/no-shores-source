"""The gathering's own pictures (src/systems/gatherDebrisArt.js): the cut an axe opens in a trunk, the chips it throws,
the logs, leafy clumps and branches a felled tree breaks into and the dust it raises, the Basket's finds (mushrooms, a
clutch of eggs, a sprig of berries) and the leaves the Sickle throws. Each is a billboard or a flying chunk sized in
metres by the door, so each row sets its picture in the painted canvas (its aspect is the world size's) and stands it on
its foot, as a piece lying on the ground does; the axe's cut sits on the trunk by its middle. The eye is near level, as
it is on a billboard: each row's `elevation` (tools/sprite-forge/specs/pictures/gather.json)."""
import math

import numpy as np

from . import shapes
from .food import _leaf, _mushroom
from .kit import Mat
from .materials import _bark_relief, _disc, _either, _end_cap, _fourth, _Graph, _place, _rings, _veins
from .models import model


def _relief_sheet(width, height, columns, rows, depth, part_of):
    """A sheet in the xz plane facing the eye (-y), each vertex pushed `depth(x, z)` into the picture, cut into parts
    by `part_of(x, z)` at each quad's middle (an index, or None where the sheet is not): a list of meshes."""
    verts = []
    for j in range(rows + 1):
        for i in range(columns + 1):
            x, z = (i / columns - 0.5) * width, (j / rows - 0.5) * height
            verts.append((x, depth(x, z), z))
    parts = {}
    for j in range(rows):
        for i in range(columns):
            quad = (j * (columns + 1) + i, j * (columns + 1) + i + 1, (j + 1) * (columns + 1) + i + 1,
                    (j + 1) * (columns + 1) + i)
            which = part_of(((i + 0.5) / columns - 0.5) * width, ((j + 0.5) / rows - 0.5) * height)
            if which is not None:
                parts.setdefault(which, []).append(quad)
    return [(verts, parts.get(k, [])) for k in range(max(parts) + 1)]


def _end_grain(radius, gap, seed):
    """A trunk's growth rings where a cut crosses them: arcs about the trunk's axis, `radius` behind the bark (+y)."""
    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, _ = graph.xyz(coord)
        reach = graph.length(x, graph.math('SUBTRACT', y, radius))
        wander = graph.math('MULTIPLY', graph.noise(coord, 30.0, 1.0, _fourth(seed)), gap * 0.8)
        phase = graph.math('MULTIPLY', graph.math('ADD', reach, wander), 1.0 / gap)
        return graph.math('LESS_THAN', graph.math('FRACT', phase), 0.32)
    return mask


@model
def gatherNotch(item, words, seed):
    """The cut an axe opens in a trunk, as it shows on the bark: a lens of pale fresh wood inside a lip of torn bark -
    its upper face sloping in to the crease and turned down, in shadow; its lower face lit, the growth rings crossing
    it in arcs; a dark crease where the two meet. Only the lip's bark is drawn, so the trunk's own shows round it.
    No words."""
    half_w, half_h, crease, deep, trunk = 0.135, 0.088, -0.03, 0.08, 0.3

    def opening(x, grow=1.0):
        return max(1.0 - (x / (half_w * grow)) ** 2, 0.0) ** 0.5

    def depth(x, z):
        bark = x * x / (2 * trunk)   # the trunk curving away to either side
        share = opening(x)
        top, bottom = half_h * share, -half_h * share * 0.75
        if share <= 0 or not bottom < z < top:
            return bark - 0.01   # the torn lip stands a little proud of the trunk
        middle = crease * share
        reach = (top - z) / (top - middle) if z > middle else (z - bottom) / (middle - bottom)
        return bark + deep * share ** 0.8 * min(max(reach, 0.0), 1.0) ** 0.8

    def part_of(x, z):
        share, lip = opening(x), opening(x, 1.14)
        if share > 0 and -half_h * share * 0.75 < z < half_h * share:
            return 0 if z > crease * share else 1
        if lip > 0 and -half_h * 1.05 * lip < z < half_h * 1.28 * lip:
            return 2
        return None

    upper, lower, bark = _relief_sheet(half_w * 2.3, half_h * 2.6, 60, 46, depth, part_of)
    rings = _end_grain(trunk, 0.011, seed)
    # the upper face turns down from the light: a step darker than the light alone lays it, so the wedge reads
    item.add(upper, Mat('pine', rough=0.75, dim=0.62, pattern=('pine', rings, 0.48)))
    item.add(lower, Mat('pine', rough=0.75, pattern=('pine', rings, 0.76)))
    item.add(bark, Mat('barkPine', rough=0.9, bump=(0.5, 120.0)))


@model
def gatherChip(item, words, seed):
    """A chip of fresh wood an axe throws: a thin curled flake, pale on its split face, a strip of bark along its back
    edge. No words."""
    outline = [(-0.04, -0.012), (0.026, -0.022), (0.045, -0.004), (0.03, 0.02), (-0.03, 0.022), (-0.046, 0.006)]
    flake = shapes.prism(outline, 0.006)
    verts = [(x, y, z + 0.06 * x * x - 0.2 * y * y) for x, y, z in flake[0]]   # curled as it split away
    chip = shapes.moved((verts, flake[1]), turn=(62, -14, 8))
    item.add(chip, Mat('pine', rough=0.7, bump=(0.3, 160.0)), smooth=False)
    edge = shapes.tube([(-0.032, 0.021, 0.004), (0.0, 0.023, 0.005), (0.03, 0.02, 0.004)], 0.0045, sides=5)
    item.add(shapes.moved(edge, turn=(62, -14, 8)), Mat('barkPine', rough=0.9))


@model
def gatherLog(item, words, seed):
    """A length of felled trunk lying across the picture, its right end sawn and turned a little toward the eye to
    show its rings: deep fissured bark, a sawn branch stub on its top, a check split across its end. No words."""
    girth, length, turn = 0.15, 1.0, -32.0
    at = (0.0, 0.0, girth)
    relief, furrows = _bark_relief('fissure', seed)
    sides, segments = 40, 30
    verts, faces = [], []
    for i in range(segments + 1):
        x = -length / 2 + length * i / segments
        swell = 1.0 + 0.06 * (1 - i / segments) + 0.025 * math.sin(i * 1.7 + seed)
        for k in range(sides):
            angle = 2 * math.pi * k / sides
            reach = girth * swell * relief(angle, x)
            verts.append((x, reach * math.cos(angle), reach * math.sin(angle)))
    for i in range(segments):
        for k in range(sides):
            k1 = (k + 1) % sides
            faces.append((i * sides + k, i * sides + k1, (i + 1) * sides + k1, (i + 1) * sides + k))

    def bark_mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(graph.local(coord, at, turn))
        return furrows(graph, x, graph.math('ARCTAN2', z, y))
    bark = Mat('barkPine', rough=0.9, bump=(0.5, 90.0), pattern=('barkPine', bark_mask, 0.62))
    item.add(_place((verts, faces), at, turn), bark)
    rings = _either(_rings(0.016, at, turn, heart=0.012), _veins(40.0, seed, 0.025, at, turn))
    end = Mat('pine', rough=0.8, pattern=('pine', rings, 0.66))
    for ring in (verts[:sides], verts[-sides:]):
        rim, face = _end_cap(ring, 0.88)
        item.add(_place(rim, at, turn), Mat('barkPine', rough=0.9, dim=0.8), smooth=False)
        item.add(_place(face, at, turn), end, smooth=False)
    # a branch stub on its top, leaning toward the eye, sawn off short: its end pale wood in a ring of bark
    way = np.array([math.sin(math.radians(24.0)), -0.5, 0.86])
    way /= np.linalg.norm(way)
    base = np.array([0.2, 0.0, 0.0]) + way * girth * 0.8
    tip = base + way * girth * 0.6
    stub = shapes.tube([tuple(base), tuple(tip)], girth * 0.4, 10, radius_end=girth * 0.32, caps=False)
    item.add(_place(stub, at, turn), Mat('barkPine', rough=0.9, dim=0.9))
    item.add(_place(_disc(tip, way, girth * 0.32, 10), at, turn), Mat('pine', rough=0.8, dim=0.92), smooth=False)


def _facing_leaf(length, width, angle, place, tilt=0.0):
    """A leaf in the picture's plane, its face to the eye, pointing `angle` degrees round from the right (up at 90),
    its base at `place`, tipped `tilt` degrees out of the plane."""
    leaf = shapes.moved(_leaf(length, width), turn=(90.0 + tilt, -angle, 0.0))
    return shapes.moved(leaf, offset=tuple(place))


def _foliage(scale, seed):
    """Leaves crowded on a mass: dark seams where one leaf's edge meets the next, in cells `scale` a metre."""
    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        shifted = graph.vec(*[graph.math('ADD', axis, _fourth(seed) * 0.1) for axis in graph.xyz(coord)])
        cells = graph.voronoi(shifted, scale)
        return graph.math('GREATER_THAN', cells.outputs['Distance'], 0.62)
    return mask


def _leaf_ball(item, rng, centre, radius, mass, edge, seed):
    """A ball of leaves: a lumpy mass of crowded leaves, and single leaves standing out round its edge."""
    ball = shapes.ellipsoid((radius, radius * 0.7, radius * 0.9), centre, 8, 14)
    item.add(shapes.wobble(ball, seed, 0.22), mass)
    for k in range(13):
        angle = 360.0 * k / 13 + rng.uniform(-12, 12)
        reach = radius * rng.uniform(0.7, 0.85)
        base = (centre[0] + reach * math.cos(math.radians(angle)), centre[1] - radius * 0.3,
                centre[2] + reach * 0.9 * math.sin(math.radians(angle)))
        length = radius * rng.uniform(0.75, 1.0)
        item.add(_facing_leaf(length, length * 0.45, angle, base, rng.uniform(-25, 25)), edge[k % len(edge)])


@model
def gatherLeaves(item, words, seed):
    """A clump torn from a felled tree's crown: a bent branch through it, its twigs ending in balls of crowded leaves in
    three greens, single leaves standing out at their edges and gaps showing between them. No words."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    bark = Mat('barkPine', rough=0.9)
    item.add(shapes.tube([(-0.46, -0.05, 0.12), (-0.2, -0.05, 0.22), (0.1, -0.05, 0.3), (0.42, -0.05, 0.46)], 0.026,
                         sides=7, radius_end=0.012), bark)
    looks = [('leaf', 1.0), ('leaf', 0.82), ('green', 1.0)]
    balls = [(-0.3, 0.2, 0.17), (-0.06, 0.42, 0.19), (0.2, 0.26, 0.17), (0.32, 0.5, 0.15), (-0.02, 0.14, 0.13),
             (0.06, 0.6, 0.12), (-0.3, 0.46, 0.12)]
    for k, (x, z, radius) in enumerate(balls):
        ramp, dim = looks[k % 3]
        mass = Mat(ramp, rough=0.7, dim=dim, bump=(0.7, 30.0), pattern=(ramp, _foliage(9.0, seed + k), 0.72))
        edge = [Mat(ramp, rough=0.6, dim=dim), Mat(ramp, rough=0.6, dim=dim * 0.85)]
        item.add(shapes.tube([(x * 0.55, -0.05, 0.22 + x * 0.25), (x, 0.0, z)], 0.009, sides=5), bark)
        _leaf_ball(item, rng, (x, 0.02 * (k % 2), z), radius, mass, edge, seed + k)


@model
def gatherTwig(item, words, seed):
    """A broken branch: a crooked stick, its left end snapped to pale splinters, a fork rising from it to the right and
    a short spur, a few leaves at their tips. No words."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    bark = Mat('barkPine', rough=0.85, bump=(0.3, 120.0))
    main = [(-0.33, 0.0, 0.06), (-0.18, 0.0, 0.085), (-0.02, 0.0, 0.06), (0.14, 0.0, 0.09), (0.33, 0.0, 0.075)]
    item.add(shapes.tube(main, 0.024, sides=8, radius_end=0.012), bark)
    fork = [(-0.04, 0.0, 0.065), (0.04, 0.0, 0.14), (0.13, 0.0, 0.2), (0.22, 0.0, 0.225)]
    item.add(shapes.tube(fork, 0.02, sides=7, radius_end=0.01), bark)
    item.add(shapes.tube([(-0.19, 0.0, 0.085), (-0.15, 0.0, 0.14), (-0.12, 0.0, 0.17)], 0.011, sides=6,
                         radius_end=0.006), bark)
    for k in range(5):
        splinter = shapes.moved(shapes.cylinder(0.007, 0.045, sides=4, radius_end=0.001),
                                turn=(0, rng.uniform(-35, 35), 180 + rng.uniform(-12, 12)))
        item.add(shapes.moved(splinter, offset=(-0.32, 0.0, 0.05 + 0.007 * k)), Mat('pine', rough=0.8))
    greens = [Mat('leaf', rough=0.6), Mat('leaf', rough=0.6, dim=0.82)]
    for k, (x, z, angle) in enumerate(((0.22, 0.225, 30), (0.22, 0.225, 100), (0.33, 0.075, 25), (-0.12, 0.17, 115),
                                       (0.08, 0.17, 150))):
        item.add(_facing_leaf(0.095, 0.044, angle, (x, -0.01, z), rng.uniform(-20, 20)), greens[k % 2])


@model
def gatherDust(item, words, seed):
    """A puff of dust and bark-meal off a fallen tree: soft billows heaped at its heart, thinning to loose grains at
    its edge, flecked with darker bark. No words."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    dust = [Mat('wool', rough=1.0, glow=0.35), Mat('wool', rough=1.0, dim=0.88, glow=0.3)]   # lit through, never sunk
    meal = Mat('barkOak', rough=1.0, glow=0.2)
    for k in range(150):
        out = rng.uniform(0.0, 1.0) ** 0.7
        angle = rng.uniform(0, 2 * math.pi)
        x, z = 0.78 * out * math.cos(angle), 0.48 + 0.5 * out * math.sin(angle)
        radius = 0.13 * (1 - out) ** 1.5 + 0.034
        if out > 0.45 and rng.uniform() < 0.35:
            continue   # the loose edge: grains with air between them
        puff = shapes.ellipsoid((radius, radius, radius * 0.9), (x, rng.uniform(-0.2, 0.2), z), 6, 10)
        item.add(shapes.wobble(puff, seed + k, 0.2), meal if rng.uniform() < 0.14 else dust[k % 2])


@model
def gatherMushrooms(item, words, seed):
    """Mushrooms come up through the leaf litter: a tall one with a broad brown cap flecked pale, a smaller one leaning
    beside it and a button pushing up at the right, their pale stems under the dark gills. No words."""
    # caps drawn broad for their stems, as they must be to read at a dozen texels
    _mushroom(item, 0.1, 0.17, (0.01, 0.02), (-12, -2), 'mushroom', 4, seed)
    _mushroom(item, 0.074, 0.105, (-0.105, -0.03), (-10, -6), 'mushroom', 0, seed + 1)
    _mushroom(item, 0.05, 0.05, (0.115, -0.03), (-8, 8), 'mushroom', 0, seed + 2)


@model
def gatherEggs(item, words, seed):
    """A clutch of three cream eggs in a nest of woven twigs, their tops standing over its rim, stray twigs bristling
    from its weave. No words."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    nest = shapes.lathe([(0.135, 0.06), (0.17, 0.052), (0.175, 0.025), (0.14, 0.0), (0.0001, 0.0)], 30, foot=True)
    weave = Mat('wicker', rough=0.9, bump=(0.5, 140.0), pattern=('wicker', _veins(50.0, seed, 0.06), 0.62))
    item.add(shapes.wobble(nest, seed, 0.06), weave)
    item.add(shapes.lathe([(0.135, 0.06), (0.11, 0.04), (0.0001, 0.035)], 30, foot=True),
             Mat('wicker', rough=0.9, dim=0.6))
    for k in range(11):
        angle = 2 * math.pi * k / 11 + rng.uniform(-0.2, 0.2)
        a, b = angle - 0.45, angle + 0.45
        twig = [(0.15 * math.cos(a), 0.15 * math.sin(a), 0.03 + rng.uniform(0.0, 0.03)),
                (0.17 * math.cos(angle), 0.17 * math.sin(angle), 0.05),
                (0.16 * math.cos(b), 0.16 * math.sin(b), 0.06 + rng.uniform(-0.01, 0.01))]
        item.add(shapes.tube(twig, 0.006, sides=5), Mat('barkPine', rough=0.9))
    profile = []
    for i in range(17):
        t = math.pi * i / 16
        radius = math.sin(t) * (1.0 - 0.16 * math.cos(t))
        profile.append((max(radius, 1e-4) * 0.036, 0.05 * (1 + math.cos(t))))
    egg = shapes.lathe(profile, 20, top=True, foot=True)
    shell = Mat('egg', rough=0.5, spec=0.35)
    for x, y, lean in ((-0.092, 0.03, -12), (0.092, 0.035, 14), (0.0, -0.02, 3)):
        item.add(shapes.moved(egg, offset=(x, y, 0.035), turn=(0, lean, rng.uniform(0, 360))), shell)


@model
def gatherBerries(item, words, seed):
    """A sprig of berries: a green stem arching over from its broken foot, three leaves along it and three clusters of
    glossy red berries hanging under it. No words."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    stem = Mat('green', rough=0.6)
    arch = [(-0.13, 0.0, 0.0), (-0.09, 0.0, 0.09), (-0.02, 0.0, 0.15), (0.06, 0.0, 0.16), (0.13, 0.0, 0.12)]
    item.add(shapes.tube(arch, 0.008, sides=6, radius_end=0.005), stem)
    leaves = [Mat('leaf', rough=0.6), Mat('leaf', rough=0.6, dim=0.84)]
    for k, (x, z, angle) in enumerate(((-0.09, 0.09, 150), (-0.02, 0.15, 70), (0.1, 0.15, 20))):
        item.add(_facing_leaf(0.085, 0.038, angle, (x, 0.006, z), 15), leaves[k % 2])
    berry = Mat('berry', rough=0.25, spec=0.7)
    for x, z, cx, cz in ((-0.06, 0.12, -0.065, 0.04), (0.03, 0.16, 0.035, 0.08), (0.11, 0.13, 0.12, 0.035)):
        item.add(shapes.tube([(x, 0.0, z), (cx, -0.012, cz + 0.02)], 0.004, sides=4), stem)
        for k in range(5):
            angle = 2 * math.pi * k / 5 + rng.uniform(-0.3, 0.3)
            place = (cx + 0.026 * math.cos(angle), -0.02 + rng.uniform(-0.01, 0.01), cz + 0.026 * math.sin(angle))
            item.add(shapes.ellipsoid((0.023, 0.023, 0.023), place, 8, 12), berry)


@model
def gatherHerbBits(item, words, seed):
    """The leaves and a petal a sickle throws as it reaps: a torn leaf, a smaller one and a yellow petal between them.
    No words."""
    item.add(_facing_leaf(0.055, 0.03, 15, (-0.055, 0.0, 0.02), 10), Mat('leaf', rough=0.6))
    item.add(_facing_leaf(0.035, 0.022, 150, (0.055, 0.0, 0.03), -10), Mat('leaf', rough=0.6, dim=0.8))
    item.add(shapes.ellipsoid((0.014, 0.006, 0.01), (0.012, -0.01, 0.012)), Mat('straw', rough=0.5))
