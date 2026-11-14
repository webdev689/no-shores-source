"""The gems (templates 1900-1931, systems/gems.js) and the cracked stone. Each grade is its own size and finish, so a
Chipped Ruby is told from a Perfect one at a glance: a chipped stone is a broken shard, a flawed one a rough stone
with a crack across it, a flawless one cleanly cut, a perfect one larger and cut finer. A clear stone is cut in facets
that each catch the light their own way; an opaque one is a polished dome, or a tumbled lump."""
import math

import numpy as np

from . import shapes
from .kit import Mat
from .models import model


def _split(mesh, every=2):
    """A mesh's faces in two meshes, every `every`th face in the second: alternate facets, to be laid a step apart."""
    verts, faces = mesh
    return (verts, [f for k, f in enumerate(faces) if k % every]), (verts, [f for k, f in enumerate(faces) if not k % every])


def _cut(cut, girdle, crown, pavilion, table):
    """A cut stone, its table up: `girdle` (rx, ry) its widest ring, `crown` above it to a `table` share of the girdle,
    `pavilion` below it to a point. Its outline by `cut`: round (16 sides), oval (12), cushion (8, its sides bowed),
    step (an octagon with its corners cut, stepped twice)."""
    rx, ry = girdle
    sides = {'round': 16, 'brilliant': 20, 'oval': 12, 'cushion': 8, 'step': 8, 'rough': 7}[cut]
    ring = []
    for k in range(sides):
        a = 2 * math.pi * k / sides + (math.pi / sides if cut in ('cushion', 'step') else 0.0)
        bow = 1.0
        if cut == 'cushion':
            bow = 1.06 if k % 2 else 0.94
        ring.append((rx * bow * math.cos(a), ry * bow * math.sin(a)))
    verts = [(x, y, 0.0) for x, y in ring]
    steps = 2 if cut == 'step' else 1
    faces = []
    prev = list(range(sides))
    for s in range(1, steps + 1):
        share = 1 - (1 - table) * s / steps
        z = crown * s / steps
        cur = []
        for x, y in ring:
            verts.append((x * share, y * share, z))
            cur.append(len(verts) - 1)
        faces += [(prev[k], prev[(k + 1) % sides], cur[(k + 1) % sides], cur[k]) for k in range(sides)]
        prev = cur
    faces.append(tuple(prev))   # the table
    verts.append((0.0, 0.0, -pavilion))
    tip = len(verts) - 1
    faces += [(tip, (k + 1) % sides, k) for k in range(sides)]
    return verts, faces


def _shard(size, seed):
    """A shard broken off a stone: a few facets meeting at a point off its middle, its base broken unevenly."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    n = 5
    ring = []
    for k in range(n):
        a = 2 * math.pi * k / n + rng.uniform(0, 0.5)
        reach = size * rng.uniform(0.7, 1.15)
        ring.append((reach * 1.15 * math.cos(a), reach * 0.85 * math.sin(a), rng.uniform(-0.15, 0.15) * size))
    verts = ring + [(-0.2 * size, 0.2 * size, 0.9 * size), (0.1 * size, -0.1 * size, -0.5 * size)]
    top, foot = n, n + 1
    faces = [(k, (k + 1) % n, top) for k in range(n)] + [((k + 1) % n, k, foot) for k in range(n)]
    return verts, faces


def _crack(item, size, seed, z, turn=(0, 0, 0)):
    """A dark crack wandering across a stone's face at height `z`, wide enough to read as a line a texel across: it
    breaks the stone's face into two lit shards."""
    rng = np.random.RandomState((seed + 1) & 0x7fffffff)
    pts = [(-size * 0.75, rng.uniform(-0.25, -0.1) * size, z)]
    for i in range(1, 5):
        pts.append((-size * 0.75 + size * 1.5 * i / 4, rng.uniform(-0.25, 0.3) * size + i * size * 0.05, z))
    item.add(shapes.moved(shapes.tube(pts, size * 0.09, sides=4), turn=turn), Mat('charcoal', rough=0.9), smooth=False)


# the grades' girdles, metres (a perfect stone is about two centimetres across)
SIZE = {'chipped': 0.0062, 'flawed': 0.008, 'flawless': 0.0098, 'perfect': 0.0122}


@model
def clearGem(item, words, seed):
    """A clear stone of `stone`'s ramp, cut `cut`, by `grade`."""
    stone, cut, grade = words['stone'], words['cut'], words['grade']
    r = SIZE[grade]
    glass = Mat(stone, rough=0.3, spec=0.9, steps=5, dim=1.12)
    if grade == 'chipped':
        mesh = shapes.moved(_shard(r, seed), turn=(0, 0, 20))
        item.add(mesh, glass, smooth=False)
        return
    if grade == 'flawed':
        tip = (30, 0, 10)
        mesh = shapes.wobble(_cut('rough', (r * 1.05, r * 0.95), r * 0.45, r * 0.6, 0.55), seed, 0.18)
        item.add(shapes.moved(mesh, turn=tip), Mat(stone, rough=0.4, spec=0.5, steps=4), smooth=False)
        _crack(item, r * 0.75, seed, r * 0.47, turn=tip)
        return
    if grade == 'perfect' and cut == 'round':
        cut = 'brilliant'
    rx, ry = {'oval': (r * 1.2, r * 0.95), 'step': (r * 1.08, r * 1.02)}.get(cut, (r, r))
    mesh = _cut(cut, (rx, ry), r * (0.5 if cut == 'step' else 0.46), r * 0.8, 0.45 if cut == 'step' else 0.52)
    # the table tipped a little toward the eye, so the crown's facets face it round the table; alternate facets a
    # step apart, as a cut stone throws back the light facet by facet
    tip = (24, 0, 8)
    lit, dark = _split(mesh)
    item.add(shapes.moved(lit, turn=tip), glass, smooth=False)
    item.add(shapes.moved(dark, turn=tip), Mat(stone, rough=0.3, spec=0.9, steps=5, dim=0.86), smooth=False)
    if grade == 'perfect':
        item.sparkle((-rx * 0.75, -r * 0.3, r * 0.6))


@model
def opaqueGem(item, words, seed):
    """An opaque stone of `stone`'s ramp by `grade`: a chip, a tumbled lump with a crack, a polished cabochon;
    `pattern` what runs through it (bands, a matrix of dark veins, an inner glow)."""
    stone, grade, pattern = words['stone'], words['grade'], words.get('pattern')
    r = SIZE[grade]
    mat = Mat(stone, rough=0.16, spec=0.95, glow=0.3 if pattern == 'glow' else 0.0,
              pattern=_PATTERNS[pattern] if pattern in _PATTERNS else None)
    if grade == 'chipped':
        item.add(shapes.moved(_shard(r, seed), turn=(0, 0, -15)), Mat(stone, rough=0.5, steps=4), smooth=False)
        return
    if grade == 'flawed':
        lump = shapes.wobble(shapes.ellipsoid((r * 1.05, r * 0.95, r * 0.6), flat=0.25), seed, 0.22)
        item.add(lump, Mat(stone, rough=0.55, pattern=mat.pattern), smooth=True)
        _crack(item, r * 0.8, seed, r * 0.62)
        return
    # a cabochon: a high polished dome on a flat back, a touch longer than it is wide, its back tipped up a little
    # toward the eye so it reads as a dome and not a disc from above
    dome = shapes.ellipsoid((r * 1.0, r * 0.92, r * 0.78), flat=0.24, rings=16, sides=24)
    item.add(dome, mat)
    if grade == 'perfect':
        item.sparkle((-r * 0.8, -r * 0.2, r * 0.5))


def _bands(nodes, links, coord):
    """Malachite's bands: rings round a point off the stone's middle."""
    wave = nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'RINGS'
    wave.inputs['Scale'].default_value = 110.0
    wave.inputs['Distortion'].default_value = 4.0
    wave.inputs['Detail'].default_value = 1.0
    links.new(coord, wave.inputs['Vector'])
    return wave.outputs['Fac']


def _matrix(nodes, links, coord):
    """Turquoise's matrix: thin dark veins where a noise crosses its middle."""
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 260.0
    noise.inputs['Detail'].default_value = 2.0
    links.new(coord, noise.inputs['Vector'])
    near = nodes.new('ShaderNodeMath')
    near.operation = 'COMPARE'
    near.inputs[1].default_value = 0.5
    near.inputs[2].default_value = 0.024
    links.new(noise.outputs['Fac'], near.inputs[0])
    return near.outputs['Value']


_PATTERNS = {'bands': ('malachite', _bands, 0.45), 'matrix': ('darkRock', _matrix)}


def _half(r, seed, side):
    """Half a rough-cut stone split down its middle: the cut stone with every vertex past the split laid on it, so
    its broken face is flat and shows as one plane of the stone's dark inside."""
    verts, faces = shapes.wobble(_cut('rough', (r, r * 0.9), r * 0.5, r * 0.65, 0.5), seed, 0.1)
    laid = [(side * max(side * x, r * 0.02), y, z) for x, y, z in verts]
    return laid, faces


@model
def crackedGem(item, words, seed):
    """A stone split through, its two halves fallen a little apart, the break between them dark: `stone`'s ramp,
    its faces dull."""
    r = SIZE['perfect']
    mat = Mat(words['stone'], rough=0.35, spec=0.6, steps=4)
    item.add(shapes.moved(_half(r, seed, -1), offset=(-r * 0.12, 0, 0), turn=(28, -14, 12)), mat, smooth=False)
    item.add(shapes.moved(_half(r, seed, 1), offset=(r * 0.18, r * 0.05, -r * 0.05), turn=(30, 18, 4)), mat, smooth=False)
    # the inside, seen down the split
    item.add(shapes.box(r * 0.08, r * 1.2, r * 0.7, (r * 0.03, 0, -r * 0.05)), Mat('charcoal', rough=0.9), smooth=False)
