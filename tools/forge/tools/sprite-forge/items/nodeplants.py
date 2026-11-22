"""The material nodes that grow (the stone and water ones, and the helpers they share, are `nodes.py`): amber bled
onto an old tree's stump, a clump of golden grass gone to seed, pale flowers open over low green and thistles going to
down. Each stands as a billboard where its node does, and each as it looks once gathered: the same spot picked over,
less of it left. The eye is a body's on foot a few metres off: each row's `elevation`
(tools/sprite-forge/specs/pictures/nodes.json)."""
import math

import numpy as np

from . import shapes
from .gather import _foliage
from .kit import Mat
from .materials import _bark_relief, _end_cap, _Graph, _stripes
from .models import model
from .nodes import SPOT, _bush, _lay


# --- heartwood resin ---

STUMP = (0.2, 0.42)   # the stump's radius at its top and its height, metres
# the amber's beads on the bark: (angle round the stump, 270 square to the eye; height; radius)
BEADS = [(232, 0.34, 0.046), (262, 0.25, 0.058), (294, 0.35, 0.042), (318, 0.19, 0.048), (246, 0.12, 0.04),
         (282, 0.07, 0.036), (210, 0.21, 0.036), (300, 0.42, 0.04), (250, 0.42, 0.036)]
DRIPS = (1, 3, 6)   # the beads that have run, hanging long down the bark
ROOTS = [(200, 1.0), (250, 0.8), (300, 1.05), (345, 0.85), (20, 0.9), (150, 0.9)]


def _rings_up(gap):
    """Growth rings about the up axis, `gap` metres apart: a stump's sawn top."""
    def mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, _ = graph.xyz(coord)
        return graph.math('LESS_THAN', graph.math('FRACT', graph.math('MULTIPLY', graph.length(x, y), 1.0 / gap)), 0.4)
    return mask


def _bark_at(angle, z, seed):
    """Where the stump's bark is at `angle` degrees round and height `z`, and its outward way."""
    radius, top = STUMP
    relief, _ = _bark_relief('fissure', seed)
    a = math.radians(angle)
    reach = radius * (1 + 0.45 * (1 - z / top) ** 4) * relief(a, z)
    way = np.array([math.cos(a), math.sin(a), 0.0])
    return np.array([0.0, 0.0, z]) + way * reach, way


def _stump(item, seed):
    """An old tree's stump: its bark deep fissured, flaring to roots that grip the ground, its sawn top ringed."""
    radius, top = STUMP
    relief, furrows = _bark_relief('fissure', seed)
    sides, rows = 40, 12
    verts, faces = [], []
    for i in range(rows + 1):
        z = top * i / rows
        for k in range(sides):
            point, _ = _bark_at(360.0 * k / sides, z, seed)
            verts.append(tuple(point))
    for i in range(rows):
        for k in range(sides):
            k1 = (k + 1) % sides
            faces.append((i * sides + k, i * sides + k1, (i + 1) * sides + k1, (i + 1) * sides + k))

    def bark_mask(nodes, links, coord):
        graph = _Graph(nodes, links)
        x, y, z = graph.xyz(coord)
        return furrows(graph, z, graph.math('ARCTAN2', y, x))
    bark = Mat('barkOak', rough=0.9, bump=(0.5, 110.0), pattern=('barkOak', bark_mask, 0.42))
    item.add((verts, faces), bark)
    rim, face = _end_cap(verts[-sides:], 0.86)
    item.add(rim, Mat('barkOak', rough=0.9, dim=0.8), smooth=False)
    item.add(face, Mat('oak', rough=0.85, dim=0.9, pattern=('oak', _rings_up(0.022), 0.7)), smooth=False)
    for angle, reach in ROOTS:
        a = math.radians(angle)
        way = np.array([math.cos(a), math.sin(a), 0.0])
        path = [tuple(way * radius * 1.1 + (0, 0, 0.1)), tuple(way * radius * (1.5 + 0.3 * reach) + (0, 0, 0.03)),
                tuple(way * radius * (1.7 + 0.6 * reach) + (0, 0, 0.0))]
        item.add(shapes.tube(path, 0.06, sides=8, radius_end=0.02), bark)


@model
def nodeHeartwoodResin(item, words, seed):
    """Heartwood resin: an old tree's stump, golden amber bled out of its bark in glossy beads, three of them run long
    down it, more along the rim of its sawn top, and two lumps of it fallen at its foot."""
    _stump(item, SPOT)
    amber = Mat('amber', rough=0.06, spec=1.0, glow=0.22)
    for k, (angle, z, r) in enumerate(BEADS):
        at, way = _bark_at(angle, min(z, STUMP[1] - 0.01), SPOT)
        long = 1.8 if k in DRIPS else 1.1
        at = at + way * r * 0.35 - (0.0, 0.0, r * (long - 1.1))
        bead = shapes.ellipsoid((r, r * 0.85, r * long), tuple(at), rings=8, sides=14)
        item.add(shapes.wobble(bead, seed + k, 0.08), amber)
        if k < 4:
            item.sparkle(tuple(at + np.array([-0.4, -0.5, 0.5]) * r), ramp='amber', arm=1 if k == 1 else 0)
    for k, (x, y) in enumerate(((-0.42, -0.2), (0.4, -0.26))):
        _lay(item, 'lightAmber', {}, seed + 20 + k, (x, y, 0.05), turn=40 * k, scale=4.0)


@model
def nodeHeartwoodResinSpent(item, words, seed):
    """The stump gathered: its amber scraped off, dark stains on the bark where the beads were and pale wood where the
    knife bit."""
    _stump(item, SPOT)
    stain = Mat('amber', rough=0.7, dim=0.45)
    scraped = Mat('oak', rough=0.8, dim=1.1)
    for k, (angle, z, r) in enumerate(BEADS):
        at, way = _bark_at(angle, min(z, STUMP[1] - 0.01), SPOT)
        mark = shapes.ellipsoid((r * 0.7, 0.006, r * 0.9), (0.0, 0.0, 0.0), rings=4, sides=10)
        item.add(shapes.moved(mark, offset=tuple(at), turn=(0.0, 0.0, angle - 270.0)), stain if k % 2 else scraped)


# --- goldgrass seed ---

def _grass(item, rng, stalks, blades, heads, cut=None):
    """A clump of tall grass: `stalks` rising from its heart and leaning out, a seed head nodding from each top that
    `heads` names; long `blades` arching out low round it. `cut` cuts each stalk short at that height, its head gone."""
    straw = Mat('straw', rough=0.7, pattern=('straw', _stripes((0.0, 0.0, 1.0), 0.04, 3, 0.25), 0.8))
    blade_mat = Mat('straw2', rough=0.75)
    for x, y, height, lean in blades:
        out = x + lean
        item.add(shapes.tube([(x, y, 0.0), (x + lean * 0.35, y - 0.02, height * 0.8), (out, y - 0.05, height),
                              (out + lean * 0.3, y - 0.06, height * 0.7)], 0.014, sides=5, radius_end=0.004), blade_mat)
    seed_mat = Mat('straw', rough=0.55, spec=0.35, dim=1.12, bump=(0.4, 140.0))
    for k, (x, y, height, lean) in enumerate(stalks):
        if cut is not None:
            item.add(shapes.tube([(x, y, 0.0), (x + lean * cut / height, y, cut)], 0.01, sides=5), straw)
            continue
        top = (x + lean, y, height)
        item.add(shapes.tube([(x, y, 0.0), (x + lean * 0.15, y, height * 0.5), top], 0.01, sides=5, radius_end=0.006),
                 straw)
        if k in heads:
            nod = math.degrees(math.atan2(lean, height)) * 1.8 + rng.uniform(-8, 8)
            ear = shapes.wobble(shapes.ellipsoid((0.026, 0.024, 0.075), (0.0, 0.0, 0.07), rings=6, sides=8), k, 0.12,
                                3.0)
            item.add(shapes.moved(ear, offset=top, turn=(0.0, nod, 0.0)), seed_mat)


# the clump: each stalk's foot, height and lean (metres its top leans right); each blade's foot, height and reach
STALKS = [(-0.06, 0.02, 0.5, -0.26), (-0.03, 0.04, 0.56, -0.15), (0.0, 0.05, 0.6, -0.04), (0.03, 0.03, 0.58, 0.07),
          (0.06, 0.02, 0.53, 0.17), (0.08, 0.0, 0.45, 0.28), (-0.08, -0.01, 0.4, -0.32), (0.01, -0.03, 0.48, 0.0),
          (-0.04, -0.04, 0.44, -0.1), (0.05, -0.04, 0.42, 0.12), (0.1, 0.04, 0.37, 0.36), (-0.1, 0.05, 0.35, -0.37)]
BLADES = [(-0.06, -0.02, 0.26, -0.3), (0.06, -0.02, 0.27, 0.3), (-0.02, -0.05, 0.22, -0.16), (0.03, -0.05, 0.24, 0.2),
          (0.0, 0.04, 0.3, -0.08), (-0.08, 0.03, 0.19, -0.4), (0.09, 0.02, 0.2, 0.4)]


@model
def nodeGoldgrassSeed(item, words, seed):
    """Goldgrass seed: a clump of tall golden grass, its stalks fanned out from its heart and each nodding under a
    heavy head of seed, long blades arching out low round its foot."""
    _grass(item, np.random.RandomState(seed & 0x7fffffff), STALKS, BLADES, range(len(STALKS)))


@model
def nodeGoldgrassSeedSpent(item, words, seed):
    """The clump gathered: its stalks cut to stubble, the low blades left, two cut stalks dropped beside it."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    _grass(item, rng, STALKS, [(x, y, h * 0.7, lean * 0.8) for x, y, h, lean in BLADES], (), cut=0.09)
    straw = Mat('straw', rough=0.7, dim=0.9)
    for x, y, turn in ((-0.32, -0.16, 12), (0.18, -0.2, -20)):
        stalk = shapes.tube([(-0.2, 0.0, 0.01), (0.0, 0.0, 0.016), (0.2, 0.0, 0.01)], 0.009, sides=5)
        item.add(shapes.moved(stalk, offset=(x, y, 0.0), turn=(0.0, 0.0, turn)), straw)


# --- mistbloom ---

GREEN = [(-0.3, 0.06, 0.1, 0.15), (-0.1, 0.1, 0.12, 0.17), (0.12, 0.1, 0.12, 0.17), (0.32, 0.05, 0.1, 0.14),
         (0.0, -0.06, 0.08, 0.13), (-0.2, -0.08, 0.07, 0.11), (0.22, -0.08, 0.07, 0.11)]
# the flowers: where each opens, how wide
BLOOMS = [(-0.28, -0.04, 0.3, 0.065), (-0.08, 0.0, 0.38, 0.075), (0.13, 0.02, 0.35, 0.07), (0.31, -0.02, 0.28, 0.06),
          (0.02, -0.12, 0.24, 0.06), (-0.18, -0.12, 0.2, 0.055), (0.22, -0.12, 0.21, 0.055)]


def _flower(item, centre, radius, petals, mats, heart, face=40.0):
    """A flower open toward the eye: `petals` petals round its heart, cupped a little, its face tipped `face`
    degrees from looking up toward the eye."""
    for k in range(petals):
        petal = shapes.ellipsoid((radius * 0.5, radius * 0.27, radius * 0.08), (radius * 0.5, 0.0, 0.0), rings=5,
                                 sides=10)
        petal = shapes.moved(petal, turn=(0.0, -14.0, 360.0 * k / petals + 18.0))
        item.add(shapes.moved(petal, offset=centre, turn=(face, 0.0, 0.0)), mats[k % len(mats)])
    item.add(shapes.ellipsoid((radius * 0.22,) * 3, centre, rings=6, sides=10), heart)


@model
def nodeMistbloom(item, words, seed):
    """Mistbloom: a low mound of green, pale white flowers standing open over it, a little lit from within as they
    show in fog."""
    _bush(item, SPOT, GREEN)
    stem = Mat('green', rough=0.6)
    petals = [Mat('silkWhite', rough=0.6, glow=0.25), Mat('silkWhite', rough=0.6, glow=0.25, dim=0.88)]
    heart = Mat('straw', rough=0.6, glow=0.2, dim=1.1)
    for x, y, z, radius in BLOOMS:
        item.add(shapes.tube([(x * 0.8, y + 0.04, z * 0.4), (x, y, z - radius * 0.3)], 0.006, sides=5), stem)
        _flower(item, (x, y, z), radius * 2, 5, petals, heart)


@model
def nodeMistbloomSpent(item, words, seed):
    """The mound gathered: its flowers picked, their stems standing bare, and three petals fallen on the green."""
    _bush(item, SPOT, GREEN, dim=0.92)
    stem = Mat('green', rough=0.6, dim=0.9)
    for x, y, z, radius in BLOOMS:
        item.add(shapes.tube([(x * 0.8, y + 0.04, z * 0.4), (x, y, z - radius)], 0.006, sides=5), stem)
    petal = Mat('silkWhite', rough=0.6, glow=0.15, dim=0.9)
    for k, (x, y, z) in enumerate(((-0.24, -0.16, 0.12), (0.1, -0.15, 0.13), (0.36, -0.12, 0.05))):
        item.add(shapes.moved(shapes.ellipsoid((0.035, 0.018, 0.006)), offset=(x, y, z), turn=(20.0, 0.0, 50.0 * k)),
                 petal)


# --- windthistle ---

def _spiny(length, width, teeth=4):
    """A thistle's leaf: a long blade in the xy plane from its foot at the origin, its edge cut into spines."""
    lower, upper = [], []
    for i in range(2 * teeth + 1):
        share = i / (2 * teeth)
        reach = width * math.sin(math.pi * share) ** 0.7 * (1.5 if i % 2 else 0.7)
        lower.append((length * share, -reach))
        upper.append((length * share, reach))
    return shapes.prism(lower + upper[::-1][1:-1], 0.003)


def _rosette(item, mats, leaves):
    """A thistle's leaves round its foot, each `(angle from the right, length)`, spread and lifted toward the eye."""
    for k, (angle, length) in enumerate(leaves):
        leaf = shapes.moved(_spiny(length, length * 0.2), turn=(0.0, -22.0, angle))
        item.add(shapes.moved(leaf, offset=(0.0, 0.0, 0.04), turn=(18.0, 0.0, 0.0)), mats[k % 2])


# the thistles: each stem's foot, its top and whether its head has gone to down
THISTLES = [((-0.1, 0.04), (-0.36, 0.02, 0.53), False), ((0.0, 0.06), (0.03, 0.06, 0.62), False),
            ((0.06, 0.02), (0.3, 0.0, 0.48), True), ((-0.03, -0.02), (-0.14, -0.06, 0.38), False),
            ((0.04, -0.03), (0.18, -0.08, 0.31), False)]
LEAVES = [(200, 0.32), (250, 0.28), (300, 0.3), (340, 0.32), (160, 0.3), (20, 0.28), (110, 0.24), (70, 0.24)]
DRIFT = [(0.48, -0.04, 0.6), (0.58, -0.06, 0.48), (0.53, -0.08, 0.7)]   # down blown off on the wind


def _head(item, top, down, mats):
    """A thistle's head at `top`: a green bulb of spined bracts, crowned with a brush of purple, or gone to a puff of
    white down."""
    bract, spine, crown, fluff = mats
    x, y, z = top
    item.add(shapes.ellipsoid((0.054, 0.054, 0.06), (x, y, z), rings=8, sides=12), bract)
    for k in range(7):
        a = 2 * math.pi * k / 7
        way = np.array([math.cos(a), math.sin(a), -0.5])
        base = np.array(top) + way * 0.048
        item.add(shapes.tube([tuple(base), tuple(base + way * 0.04)], 0.008, sides=4, radius_end=0.0015), spine)
    if down:
        puff = shapes.wobble(shapes.ellipsoid((0.095, 0.09, 0.09), (x, y, z + 0.08), rings=8, sides=14), 7, 0.22)
        item.add(puff, fluff)
        return
    brush = shapes.lathe([(1e-4, 0.1), (0.045, 0.094), (0.07, 0.074), (0.05, 0.034), (0.036, 0.0)], 14, top=True)
    item.add(shapes.moved(brush, offset=(x, y, z + 0.026)), crown)


def _thistle_mats():
    """A thistle head's bracts, their spines, its purple crown streaked with its florets, and its down."""
    florets = ('portal', _stripes((1.0, 0.3, 0.0), 0.012, 4, 0.35), 1.0)
    return (Mat('green', rough=0.6, dim=0.85, pattern=('leaf', _foliage(60.0, 5), 0.9)), Mat('green', rough=0.6),
            Mat('liquidViolet', rough=0.7, bump=(0.6, 160.0), pattern=florets), Mat('silkWhite', rough=0.9, glow=0.35))


@model
def nodeWindthistle(item, words, seed):
    """Windthistle: a stand of thistles stiff as wire over a rosette of spined leaves, their heads crowned purple and
    one gone to white down, tufts of it blowing off on the wind."""
    leaf = [Mat('green', rough=0.6), Mat('green', rough=0.6, dim=0.82)]
    _rosette(item, leaf, LEAVES)
    mats = _thistle_mats()
    for (fx, fy), top, down in THISTLES:
        item.add(shapes.tube([(fx, fy, 0.0), ((fx + top[0]) / 2, (fy + top[1]) / 2, top[2] * 0.55), top], 0.015,
                             sides=6, radius_end=0.011), leaf[0])
        _head(item, top, down, mats)
    for k, (x, y, z) in enumerate(DRIFT):
        item.add(shapes.wobble(shapes.ellipsoid((0.034, 0.03, 0.03), (x, y, z), rings=6, sides=10), k, 0.25), mats[3])
        item.add(shapes.tube([(x, y, z - 0.025), (x - 0.008, y, z - 0.06)], 0.005, sides=4), Mat('straw2', rough=0.8))


@model
def nodeWindthistleSpent(item, words, seed):
    """The stand gathered: its heads cut, the stems standing broken off short, the rosette left, two tufts of down
    caught on its leaves."""
    leaf = [Mat('green', rough=0.6), Mat('green', rough=0.6, dim=0.82)]
    _rosette(item, leaf, LEAVES)
    for (fx, fy), top, _down in THISTLES:
        short = 0.45
        end = (fx + (top[0] - fx) * short, fy + (top[1] - fy) * short, top[2] * short)
        item.add(shapes.tube([(fx, fy, 0.0), end], 0.015, sides=6, radius_end=0.012), leaf[1])
    fluff = Mat('silkWhite', rough=0.9, glow=0.3)
    for k, (x, y, z) in enumerate(((-0.24, -0.2, 0.08), (0.3, -0.18, 0.06))):
        item.add(shapes.wobble(shapes.ellipsoid((0.036, 0.03, 0.028), (x, y, z), rings=6, sides=10), k, 0.25), fluff)
