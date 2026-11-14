"""The road's food and the dishes: fruit, bread, fish, meat, rations, mushrooms, the cooked plates, and the fire and pan
that cook them. A dish is seen from above and before it, on its plate or in its bowl."""
import math

import numpy as np

from . import shapes
from .kit import Mat
from .models import model


# --- shader masks: a pattern's `mask(nodes, links, coord)` over the object's coordinates, metres ---

def _op(nodes, links, operation, *inputs, vector=False, out='Value'):
    """One math node: `operation` over `inputs`, each a constant or another node's output; its `out` socket."""
    node = nodes.new('ShaderNodeVectorMath' if vector else 'ShaderNodeMath')
    node.operation = operation
    for socket, value in zip(node.inputs, inputs):
        if isinstance(value, (int, float, tuple, list)):
            socket.default_value = value
        else:
            links.new(value, socket)
    return node.outputs[out]


def _local(nodes, links, coord, offset=(0.0, 0.0, 0.0), turn=(0.0, 0.0, 0.0)):
    """A part's coordinates as they were before `shapes.moved(offset, turn)` placed it: the placement undone."""
    mapping = nodes.new('ShaderNodeMapping')
    mapping.vector_type = 'TEXTURE'
    mapping.inputs['Location'].default_value = offset
    mapping.inputs['Rotation'].default_value = [math.radians(t) for t in turn]
    links.new(coord, mapping.inputs['Vector'])
    return mapping.outputs['Vector']


def _any(nodes, links, masks):
    """Where any of `masks` shows."""
    result = masks[0]
    for mask in masks[1:]:
        result = _op(nodes, links, 'MAXIMUM', result, mask)
    return result


def _spots(centres, radius):
    """Round spots of `radius` about each of `centres` (a trout's spots, a biscuit's docking holes, a cap's flecks)."""
    def mask(nodes, links, coord):
        near = [_op(nodes, links, 'LESS_THAN', _op(nodes, links, 'DISTANCE', coord, tuple(c), vector=True), radius)
                for c in centres]
        return _any(nodes, links, near)
    return mask


def _ovals(ovals, above=-1.0):
    """Ovals seen from above, each (centre x, y, half its length, half its width, its angle in degrees), only where
    the surface stands higher than `above`: a loaf's score marks, kept to its crown."""
    def mask(nodes, links, coord):
        found = []
        for centre_x, centre_y, half_length, half_width, angle in ovals:
            rad = math.radians(angle)
            rel = _op(nodes, links, 'SUBTRACT', coord, (centre_x, centre_y, 0.0), vector=True, out='Vector')
            lengthwise = _op(nodes, links, 'DOT_PRODUCT', rel,
                             (math.cos(rad) / half_length, math.sin(rad) / half_length, 0.0), vector=True)
            across = _op(nodes, links, 'DOT_PRODUCT', rel,
                         (-math.sin(rad) / half_width, math.cos(rad) / half_width, 0.0), vector=True)
            reach = _op(nodes, links, 'ADD', _op(nodes, links, 'MULTIPLY', lengthwise, lengthwise),
                        _op(nodes, links, 'MULTIPLY', across, across))
            found.append(_op(nodes, links, 'LESS_THAN', reach, 1.0))
        high = _op(nodes, links, 'GREATER_THAN', _op(nodes, links, 'DOT_PRODUCT', coord, (0.0, 0.0, 1.0), vector=True),
                   above)
        return _op(nodes, links, 'MINIMUM', _any(nodes, links, found), high)
    return mask


def _bars(normal, places, half_width, offset=(0.0, 0.0, 0.0), turn=(0.0, 0.0, 0.0)):
    """Straight bars across a part in its own coordinates: where its point's reach along `normal` lies within
    `half_width` of one of `places` (a fish's grill marks, a parcel's string)."""
    def mask(nodes, links, coord):
        local = _local(nodes, links, coord, offset, turn)
        reach = _op(nodes, links, 'DOT_PRODUCT', local, tuple(normal), vector=True)
        found = [_op(nodes, links, 'LESS_THAN',
                     _op(nodes, links, 'ABSOLUTE', _op(nodes, links, 'SUBTRACT', reach, place)), half_width)
                 for place in places]
        return _any(nodes, links, found)
    return mask


def _cross_bars(bars):
    """Several sets of `_bars` at once, each a dict of its arguments."""
    def mask(nodes, links, coord):
        return _any(nodes, links, [_bars(**one)(nodes, links, coord) for one in bars])
    return mask


def _beyond(normal, depth):
    """Past a plane: where the point's reach along `normal` is over `depth` (a cut face)."""
    def mask(nodes, links, coord):
        return _op(nodes, links, 'GREATER_THAN', _op(nodes, links, 'DOT_PRODUCT', coord, tuple(normal), vector=True),
                   depth)
    return mask


def _blush(nodes, links, coord):
    """A blush over the fruit's right side, its edge broken by a noise."""
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coord, sep.inputs['Vector'])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 60.0
    links.new(coord, noise.inputs['Vector'])
    side = nodes.new('ShaderNodeMath')
    side.operation = 'MULTIPLY_ADD'
    side.inputs[1].default_value = 18.0
    links.new(sep.outputs['X'], side.inputs[0])
    links.new(noise.outputs['Fac'], side.inputs[2])
    return side.outputs['Value']


# --- mesh helpers ---

def _at(point, offset=(0.0, 0.0, 0.0), turn=(0.0, 0.0, 0.0)):
    """Where `point` goes when `shapes.moved(offset, turn)` places its part."""
    return np.asarray(shapes.moved(([tuple(point)], []), offset, turn)[0][0])


def _lowest(mesh, turn):
    """How far below its origin a mesh reaches once turned: the lift that sets it on the ground."""
    verts, _ = shapes.moved(mesh, turn=turn)
    return -min(v[2] for v in verts)


def _flatten(mesh, normal, depth):
    """The mesh cut flat by a plane: every vertex past `depth` along `normal` laid back onto it (a carved face)."""
    verts, faces = mesh
    unit = np.asarray(normal, dtype=np.float64) / np.linalg.norm(normal)
    points = np.asarray(verts, dtype=np.float64)
    over = np.maximum(points @ unit - depth, 0.0)
    return [tuple(point) for point in points - over[:, None] * unit], faces


def _taper(mesh, start, end, share):
    """Narrow a mesh across y and z along x, from whole at `start` to `share` of itself at `end`."""
    verts, faces = mesh
    out = []
    for x, y, z in verts:
        way = min(max((x - start) / (end - start), 0.0), 1.0)
        girth = 1 - (1 - share) * way * way
        out.append((x, y * girth, z * girth))
    return out, faces


def _fruit(radius, dimple=0.18, squash=0.92, rings=12, sides=20):
    """A fruit's body: a sphere dimpled in at its stem and its foot."""
    profile = []
    for i in range(rings + 1):
        angle = math.pi * i / rings
        z = math.cos(angle)
        pinch = (dimple * math.exp(-((angle / 0.45) ** 2))
                 + dimple * 0.6 * math.exp(-(((math.pi - angle) / 0.45) ** 2)))
        reach = math.sin(angle) * (1 - pinch)
        z -= dimple * 0.7 * math.exp(-((angle / 0.35) ** 2))
        profile.append((max(reach, 1e-4) * radius, z * radius * squash))
    return shapes.lathe(profile, sides, top=True, foot=True)


def _leaf(length, width):
    """A leaf: a pointed oval, a little cupped."""
    outline = [(length * share, width * math.sin(math.pi * share) * side) for side in (1, -1)
               for share in (np.linspace(0, 1, 7) if side > 0 else np.linspace(1, 0, 7))]
    return shapes.prism(outline[:-1], 0.0008)


def _plate(radius, well=0.66, rise=0.016):
    """A plate turned round z: its flat well `well` of its radius across, a broad rim rising to `rise` and rolled at
    its lip, its foot under it."""
    inner = radius * well
    profile = [(0.0001, 0.005), (inner, 0.005), (inner + radius * 0.07, rise * 0.62), (radius * 0.94, rise),
               (radius, rise * 0.94), (radius * 0.995, rise * 0.6), (radius * 0.9, rise * 0.4), (inner, 0.002),
               (inner * 0.92, 0.0), (0.0001, 0.0)]
    return shapes.lathe(profile, 36)


# --- fruit ---

@model
def apple(item, words, seed):
    """An apple of `skin`'s ramp, `blush` over its right side if given, its stem in its dimple and, unless `leaf` is
    false, a leaf; a glint of polish on its upper left."""
    radius = 0.04
    skin = Mat(words['skin'], rough=0.35, spec=0.5,
               pattern=(words['blush'], _blush) if words.get('blush') else None)
    item.add(shapes.moved(_fruit(radius), offset=(0, 0, radius)), skin)
    stem = shapes.tube([(0, 0, radius * 1.7), (radius * 0.08, 0, radius * 2.15), (radius * 0.25, 0, radius * 2.4)],
                       radius * 0.07, 5)
    item.add(stem, Mat('wood', rough=0.9))
    if words.get('leaf', True):
        leaf = shapes.moved(_leaf(radius * 0.9, radius * 0.32), offset=(radius * 0.2, 0, radius * 2.25),
                            turn=(-25, -15, 10))
        item.add(leaf, Mat('leaf', rough=0.6))
    # its polish's glint, where the light comes back to the eye off its upper left
    item.sparkle((-radius * 0.3, -radius * 0.55, radius * 1.68), words['skin'], arm=0)


@model
def orange(item, words, seed):
    """An orange, or a `pair`, its skin dimpled, a green star of calyx at its stem and a leaf off it."""
    pair = words.get('pair', False)
    peel = Mat('orange', rough=0.55, spec=0.4, bump=(0.2, 260.0))
    balls = [(-0.026, 0.01, 0.034), (0.03, -0.006, 0.037)] if pair else [(0, 0, 0.042)]
    calyx = Mat('leaf', rough=0.7, dim=0.8)
    for x, y, radius in balls:
        item.add(shapes.moved(_fruit(radius, dimple=0.08, squash=0.94), offset=(x, y, radius)), peel)
        top = radius + radius * 0.94 * (1 - 0.08 * 0.7)
        item.add(shapes.ellipsoid((radius * 0.16, radius * 0.16, radius * 0.07), (x, y, top - radius * 0.02),
                                  rings=4, sides=10), calyx)
    x, y, radius = balls[-1]
    top = radius + radius * 0.94 * (1 - 0.08 * 0.7)
    leaf = shapes.moved(_leaf(radius * 1.1, radius * 0.42), offset=(x + radius * 0.08, y, top + radius * 0.02),
                        turn=(18, -14, 22))
    item.add(leaf, Mat('leaf', rough=0.6))


# --- bread ---

def _loaf(item, length, width, height, seed, offset=(0.0, 0.0, 0.0), turn=0.0, scores=3, slant=58.0):
    """A loaf of `length` x `width` x `height` lying along x, turned `turn` about z: its crust domed, bulging over a
    floury foot, scored `scores` times across, each cut's pale crumb opened along it."""
    body = shapes.ellipsoid((length / 2, width / 2, height / 0.78), rings=14, sides=28, flat=0.39)
    lift = height / 0.78 * (1 - 2 * 0.39)
    body = shapes.wobble(shapes.moved(body, offset=(0, 0, lift)), seed, 0.035)
    rad = math.radians(turn)
    ovals = []
    gap = length * 0.235
    for k in range(scores):
        along = (k - (scores - 1) / 2) * gap
        ovals.append((offset[0] + along * math.cos(rad), offset[1] + along * math.sin(rad), width * 0.5,
                      length * 0.048, turn + slant))
    crust = Mat('crust', rough=0.7, spec=0.35, bump=(0.25, 110.0),
                pattern=('crumb', _ovals(ovals, offset[2] + lift + height * 0.45)))
    item.add(shapes.moved(body, offset=offset, turn=(0, 0, turn)), crust)
    # a ridge of crust lifts along each cut's upper lip, so the cut reads in the light as well as in colour
    slant_rad = math.radians(slant)
    for k in range(scores):
        along = (k - (scores - 1) / 2) * gap
        lip = []
        for share in np.linspace(-1, 1, 6):
            x = along + share * width * 0.36 * math.cos(slant_rad) - length * 0.04 * math.sin(slant_rad)
            y = share * width * 0.36 * math.sin(slant_rad) + length * 0.04 * math.cos(slant_rad)
            dome = 1 - (x / (length / 2)) ** 2 - (y / (width / 2)) ** 2
            lip.append((x, y, (lift + height / 0.78 * math.sqrt(max(0.0, dome))) * 0.985))
        ridge = shapes.tube(lip, length * 0.012, sides=6, radius_end=length * 0.008)
        item.add(shapes.moved(ridge, offset=offset, turn=(0, 0, turn)), crust)


@model
def bread(item, words, seed):
    """A loaf: its crust domed and scored three times across, the cuts' crumb pale, its floury foot. No words."""
    _loaf(item, 0.28, 0.135, 0.085, seed, turn=8.0)


# --- fish ---

def _fish_depth(along):
    """A fish's depth `along` it as a share of its deepest: 0 the snout, 1 the wrist of its tail."""
    return 0.17 * along + 0.83 * math.sqrt(along) * (1 - along) ** 0.93 / 0.396


FISH_RINGS = (0.012, 0.04, 0.08, 0.13, 0.19, 0.26, 0.34, 0.43, 0.52, 0.61, 0.7, 0.79, 0.87, 0.94, 1.0)


def _fish_ring(along, height, thick):
    """A ring's middle height, depth (half) and width (half) at the share `along` the fish."""
    depth = _fish_depth(along)
    return -0.05 * height * depth, height / 2 * depth, thick / 2 * depth * (1 - 0.55 * along) + thick * 0.04


def _fish_surface(along, angle, length, height, thick, out=0.0):
    """A point on the fish's skin at the share `along` it and `angle` round it (0 its back, a half turn its belly;
    the eye's flank is the negative y), pushed `out` beyond it."""
    centre, depth, width = _fish_ring(along, height, thick)
    return (along * length, (width + out) * math.sin(angle), centre + (depth + out) * math.cos(angle))


def _fish_body(length, height, thick, sides=16, belly_line=-0.12):
    """A fish's body along x, upright, its flank to the eye: rings of ovals, a blunt snout, narrowing to its tail's
    wrist. Two meshes on one set of points: its back and its belly (the faces below `belly_line` round it)."""
    verts = []
    for along in FISH_RINGS:
        for k in range(sides):
            verts.append(_fish_surface(along, 2 * math.pi * k / sides, length, height, thick))
    centre, _, _ = _fish_ring(0.0, height, thick)
    verts.append((-length * 0.006, 0.0, centre + height * 0.02))
    snout = len(verts) - 1
    centre, _, _ = _fish_ring(1.0, height, thick)
    verts.append((length * 1.004, 0.0, centre))
    tail = len(verts) - 1
    back, belly = [], []
    count = len(FISH_RINGS)
    for i in range(count - 1):
        for k in range(sides):
            k1 = (k + 1) % sides
            face = (i * sides + k, i * sides + k1, (i + 1) * sides + k1, (i + 1) * sides + k)
            mid = 2 * math.pi * (k + 0.5) / sides
            (belly if math.cos(mid) < belly_line else back).append(face)
    for k in range(sides):
        k1 = (k + 1) % sides
        mid = 2 * math.pi * (k + 0.5) / sides
        (belly if math.cos(mid) < belly_line else back).append((snout, k1, k))
        last = (count - 1) * sides
        (belly if math.cos(mid) < belly_line else back).append((tail, last + k, last + k1))
    return (verts, back), (verts, belly)


def _fin(points, thick):
    """A fin: a thin flat shape upright in the xz plane, `points` its outline (x, z)."""
    return shapes.moved(shapes.prism(points, thick, -thick / 2), turn=(90, 0, 0))


def _fish(item, words, seed, length, height, offset=(0.0, 0.0, 0.0), turn=(0.0, 0.0, 0.0), ground=True, dim=1.0,
          fins=True):
    """A fish of `length` and `height` lying on its side, head to the left, placed by `offset` and `turn` (it is
    built upright, its flank to the eye, so a turn about x of -90 lays it flat): its body, its belly of `belly`, its
    forked tail and fins, its gill cover's edge, its eye. `cooked` scores it with grill marks and whitens its eye;
    `spots` dots its back. `dim` darkens its skin (a fish lying flat takes the full light); without `fins` it keeps
    only its tail (a fish served, its fins trimmed)."""
    skin_ramp, cooked = words['skin'], words.get('cooked', False)
    belly_ramp, spot_ramp = words.get('belly'), words.get('spots')
    thick = height * 0.42
    back_mesh, belly_mesh = _fish_body(length, height, thick)
    if ground:
        offset = (offset[0], offset[1], offset[2] + _lowest(shapes.joined(back_mesh, belly_mesh), turn))
    grill = None
    if cooked:
        slant = np.array([1.0, 0.0, -0.42]) / math.hypot(1.0, 0.42)
        grill = ('black', _bars(slant, [length * share for share in (0.33, 0.53, 0.73)], length * 0.03, offset, turn),
                 0.55)
    skin = Mat(skin_ramp, rough=0.45 if cooked else 0.3, spec=0.35 if cooked else 0.7,
               bump=(0.25, 160.0) if cooked else None, pattern=grill, dim=dim)
    item.add(shapes.moved(back_mesh, offset, turn), skin)
    under = Mat(belly_ramp, rough=0.3, spec=0.7, pattern=grill, dim=0.9) if belly_ramp else skin
    item.add(shapes.moved(belly_mesh, offset, turn), under)
    # the fins and tail a step darker than the flank, as thin fins let the light through
    fin_mat = Mat(skin_ramp, rough=0.5, dim=0.72, bump=(0.35, 220.0) if cooked else None)
    fin_thick = length * 0.012
    tail_x = length + height * 0.75
    tail = [(length * 0.93, height * 0.08), (tail_x - height * 0.08, height * 0.66), (tail_x, height * 0.6),
            (tail_x - height * 0.24, 0.0), (tail_x, -height * 0.6), (tail_x - height * 0.08, -height * 0.66),
            (length * 0.93, -height * 0.1)]

    def top(along):
        centre, depth, _ = _fish_ring(along, height, thick)
        return centre + depth

    def low(along):
        centre, depth, _ = _fish_ring(along, height, thick)
        return centre - depth
    dorsal = [(length * 0.34, top(0.34) - height * 0.1), (length * 0.4, top(0.4) + height * 0.36),
              (length * 0.46, top(0.46) + height * 0.4), (length * 0.62, top(0.62) + height * 0.03),
              (length * 0.62, top(0.62) - height * 0.1)]
    anal = [(length * 0.56, low(0.56) + height * 0.1), (length * 0.72, low(0.72) + height * 0.1),
            (length * 0.7, low(0.7) - height * 0.2), (length * 0.6, low(0.6) - height * 0.22)]
    pelvic = [(length * 0.36, low(0.36) + height * 0.1), (length * 0.46, low(0.46) + height * 0.08),
              (length * 0.47, low(0.47) - height * 0.2), (length * 0.4, low(0.4) - height * 0.16)]
    for outline in (tail, dorsal, anal, pelvic) if fins else (tail,):
        item.add(shapes.moved(_fin(outline, fin_thick), offset, turn), fin_mat, smooth=False)
    # the pectoral fin lies back along the flank behind the gill
    pectoral = [(0.0, 0.0), (length * 0.13, height * 0.1), (length * 0.15, -height * 0.02),
                (length * 0.02, -height * 0.1)]
    base = _fish_surface(0.23, math.pi * 1.4, length, height, thick, out=length * 0.004)
    fin = shapes.moved(shapes.prism(pectoral, fin_thick * 0.8), turn=(90, -12, 0), offset=base)
    if fins:
        item.add(shapes.moved(fin, offset, turn), fin_mat, smooth=False)
    # the gill cover's edge: a dark curve where the head meets the body
    gill = [_fish_surface(0.2 + 0.04 * math.sin(angle), math.pi + angle, length, height, thick, out=height * 0.01)
            for angle in np.linspace(0.2 * math.pi, 0.88 * math.pi, 8)]
    item.add(shapes.moved(shapes.tube(gill, height * 0.05, sides=6), offset, turn), Mat(skin_ramp, rough=0.6, dim=0.4))
    if spot_ramp and not cooked:
        rng = np.random.RandomState(seed & 0x7fffffff)
        spot = Mat(spot_ramp, rough=0.5)
        for _ in range(9):
            along, angle = rng.uniform(0.22, 0.86), math.pi * rng.uniform(1.56, 1.9)
            centre = _fish_surface(along, angle, length, height, thick, out=-height * 0.03)
            item.add(shapes.moved(shapes.ellipsoid((height * 0.1,) * 3, centre, rings=5, sides=8), offset, turn), spot)
    # the eye: a bead set in the head, its glint on its upper edge
    eye_centre = _fish_surface(0.085, math.pi * 1.68, length, height, thick, out=-height * 0.035)
    eye = height * 0.1
    item.add(shapes.moved(shapes.ellipsoid((eye,) * 3, eye_centre, rings=6, sides=10), offset, turn),
             Mat('bone' if cooked else 'black', rough=0.3, spec=0.8, dim=0.8 if cooked else 1.0))
    if not cooked:
        item.sparkle(_at((eye_centre[0] - eye * 0.2, eye_centre[1] - eye * 0.7, eye_centre[2] + eye * 0.65),
                         offset, turn), 'diamond', arm=0)


@model
def fish(item, words, seed):
    """A fish lying on its side, head to the left: `skin` its ramp, `belly` its pale underside if given, `spots` dots
    along its back, `cooked` grill marks across it and a cooked eye, `len` its length against its depth."""
    _fish(item, words, seed, 0.22 * words.get('len', 1), 0.22 * 0.46, turn=(-44, 0, 0))


# --- meat ---

@model
def haunch(item, words, seed):
    """A roast haunch on its bone: the browned meat swelling from the knuckle, a slice carved from its near right side
    showing the red within, a collar of crisped skin where it draws in, the bone's knobbed end out to the upper right.
    No words."""
    meat = shapes.ellipsoid((0.08, 0.07, 0.062), rings=14, sides=22)
    meat = _taper(meat, -0.005, 0.08, 0.45)
    meat = shapes.wobble(meat, seed, 0.05)
    turn = 34.0
    meat = shapes.moved(meat, offset=(0, 0, 0.056), turn=(0, 0, turn))
    cut_normal = np.array([0.55, -0.68, 0.48])
    cut_normal /= np.linalg.norm(cut_normal)
    depth = np.array([0.0, 0.0, 0.056]) @ cut_normal + 0.052
    meat = _flatten(meat, cut_normal, depth)
    flesh = Mat('meatCooked', rough=0.4, spec=0.6, bump=(0.45, 90.0),
                pattern=('meatRaw', _beyond(cut_normal, depth - 0.0015)))
    item.add(meat, flesh)
    rad = math.radians(turn)
    axis = np.array([math.cos(rad), math.sin(rad), 0.0])
    side = np.array([-math.sin(rad), math.cos(rad), 0.0])
    bone = Mat('bone', rough=0.45, spec=0.5)
    start = axis * 0.04 + np.array([0, 0, 0.064])
    end = axis * 0.17 + np.array([0, 0, 0.092])
    item.add(shapes.tube([tuple(start), tuple((start + end) / 2 + np.array([0, 0, -0.004])), tuple(end)], 0.013,
                         sides=10, radius_end=0.011), bone)
    for sign in (-1, 1):
        knob = end + axis * 0.01 + side * sign * 0.012 + np.array([0, 0, sign * 0.004])
        item.add(shapes.ellipsoid((0.0155, 0.0155, 0.0145), tuple(knob), rings=8, sides=12), bone)
    # a collar of crisped skin where the meat draws in round the bone
    collar = shapes.moved(shapes.torus(0.022, 0.009, 18, 8), turn=(0, 80, turn), offset=tuple(
        axis * 0.074 + np.array([0, 0, 0.066])))
    item.add(shapes.wobble(collar, seed + 1, 0.06), Mat('meatCooked', rough=0.6, dim=0.72, bump=(0.5, 140.0)))


# --- rations ---

def _end_flap(size_y, size_z, x, thick):
    """A wrapped parcel's end folded up: a triangle of cloth laid on the end face at `x` (its local x)."""
    corners = [(-size_y * 0.46, size_z * 0.12), (size_y * 0.46, size_z * 0.12), (0.0, size_z * 0.86)]
    sign = 1 if x > 0 else -1
    verts = [(x + sign * thick * k, y, z) for k in (0, 1) for y, z in corners]
    faces = [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    return verts, faces


@model
def rations(item, words, seed):
    """A traveller's rations: a linen parcel, its ends folded up, tied both ways with string knotted on top, a hard
    biscuit pricked with holes leaned on it. No words."""
    size_x, size_y, size_z = 0.17, 0.115, 0.05
    turn = 30.0
    place = (0, 0, turn)
    parcel = shapes.box(size_x, size_y, size_z, (0, 0, size_z / 2))
    string = _cross_bars([dict(normal=(1, 0, 0), places=[0.012], half_width=0.0058, turn=place),
                          dict(normal=(0, 1, 0), places=[-0.004], half_width=0.0058, turn=place)])
    linen = Mat('linen', rough=0.85, bump=(0.06, 150.0), pattern=('rope', string, 0.7))
    item.add(shapes.moved(parcel, turn=place), linen, smooth=False, bevel=0.012)
    flap_mat = Mat('linen', rough=0.85, dim=0.92, pattern=('rope', string, 0.7))
    for x in (-size_x / 2, size_x / 2):
        item.add(shapes.moved(_end_flap(size_y, size_z, x, 0.003), turn=place), flap_mat, smooth=False)
    # the knot where the strings cross, and its two loose ends
    rope = Mat('rope', rough=0.9, bump=(0.4, 300.0), dim=0.8)
    knot = _at((0.012, -0.004, size_z + 0.004), turn=place)
    item.add(shapes.ellipsoid((0.0105, 0.0095, 0.007), tuple(knot), rings=6, sides=10), rope)
    for end in ((0.034, -0.03), (-0.02, -0.034)):
        tip = _at((0.012 + end[0], -0.004 + end[1], size_z + 0.002), turn=place)
        item.add(shapes.tube([tuple(knot), tuple((knot + tip) / 2 + np.array([0, 0, 0.003])), tuple(tip)], 0.0036,
                             sides=5), rope)
    # the biscuit rests on the parcel's far end, tipped up on the knot toward the eye
    radius = 0.036
    centre = _at((size_x * 0.17, size_y * 0.2, size_z + 0.013), turn=place)
    biscuit = shapes.lathe([(0.0001, 0.0075), (radius * 0.78, 0.0072), (radius * 0.94, 0.005), (radius, 0.0),
                            (radius * 0.94, -0.005), (radius * 0.78, -0.0068), (0.0001, -0.007)], 22)
    tilt = (16, -8, 0)
    holes = [_at((radius * reach * math.cos(angle), radius * reach * math.sin(angle), 0.0075), centre, tilt)
             for angle, reach in ((0.0, 0.0), (0.4, 0.58), (2.5, 0.58), (4.5, 0.58))]
    hard = Mat('crust', rough=0.75, spec=0.3, bump=(0.3, 160.0), pattern=('crust', _spots(holes, 0.0068), 0.3))
    item.add(shapes.moved(biscuit, centre, tilt), hard)


# --- the dishes ---

@model
def stewBowl(item, words, seed):
    """A turned wooden bowl of stew, its rim's lip, its grain in rings, lumps of carrot, potato and meat and a leaf
    of herb in the stew, a spoon stood in it leaning out to the right. No words."""
    rim, top = 0.072, 0.058
    level = top - 0.006
    wall = [(rim - 0.007, level - 0.004), (rim - 0.0065, top - 0.002), (rim - 0.0035, top + 0.0015),
            (rim, top), (rim + 0.001, top - 0.006), (rim - 0.002, top - 0.02), (rim - 0.012, top - 0.038),
            (rim - 0.028, top - 0.052), (0.036, 0.005), (0.036, 0.0), (0.0001, 0.0)]
    grain = Mat('wood', rough=0.55, spec=0.45, bump=(0.15, 120.0),
                pattern=('wood', _bars((0, 0, 1), [top - 0.016, top - 0.03, top - 0.043], 0.0018), 0.72))
    item.add(shapes.lathe(wall, 32), grain)
    # a turned bead round the bowl below its rim
    item.add(shapes.moved(shapes.torus(rim - 0.0008, 0.0022, 40, 6), offset=(0, 0, top - 0.009)),
             Mat('wood', rough=0.5, spec=0.45, dim=0.9))
    stew = shapes.wobble(shapes.lathe([(0.0001, level + 0.003), (0.035, level + 0.002), (rim - 0.006, level),
                                       (rim - 0.006, level - 0.01)], 28, top=True), seed, 0.006)
    item.add(stew, Mat('stew', rough=0.35, spec=0.6, bump=(0.25, 70.0)))
    rng = np.random.RandomState(seed & 0x7fffffff)
    bits = [(-0.03, -0.012, 'carrot'), (0.004, 0.024, 'meatCooked'), (-0.008, -0.032, 'carrot'),
            (0.032, -0.018, 'meatCooked'), (-0.036, 0.018, 'crumb'), (0.024, 0.03, 'carrot'),
            (-0.016, 0.004, 'crumb'), (0.016, -0.036, 'crumb'), (-0.012, 0.034, 'leaf')]
    looks = {'carrot': Mat('carrot', rough=0.4, spec=0.5), 'crumb': Mat('crumb', rough=0.5, dim=0.85),
             'meatCooked': Mat('meatCooked', rough=0.5, bump=(0.4, 200.0)), 'leaf': Mat('leaf', rough=0.6)}
    for x, y, ramp in bits:
        if ramp == 'carrot':
            piece = shapes.cylinder(0.0095, 0.006, sides=10)
            piece = shapes.moved(piece, offset=(-0.003, 0, 0), turn=(0, rng.uniform(55, 80), rng.uniform(0, 360)))
        elif ramp == 'leaf':
            piece = shapes.moved(_leaf(0.016, 0.006), turn=(0, 0, rng.uniform(0, 360)))
        else:
            piece = shapes.wobble(shapes.box(0.015, 0.014, 0.011), seed + int(x * 1000), 0.12)
            piece = shapes.moved(piece, turn=tuple(rng.uniform(0, 40, 3)))
            if ramp == 'meatCooked':
                piece = shapes.moved(piece, offset=(0, 0, 0.002))
        # sunk to show only their tops, so they read as colour in the stew and not as lumps on it
        item.add(shapes.moved(piece, offset=(x, y, level + 0.0015)), looks[ramp], smooth=ramp != 'meatCooked')
    # the spoon: its bowl sunk in the stew, its handle out over the rim to the upper right
    spoon = Mat('wood', rough=0.5, spec=0.5, dim=1.08)
    handle = [(0.012, -0.004, level + 0.002), (0.036, 0.01, level + 0.032), (0.06, 0.024, level + 0.066),
              (0.076, 0.033, level + 0.088)]
    item.add(shapes.tube(handle, 0.0055, sides=8, radius_end=0.0068), spoon)
    item.add(shapes.ellipsoid((0.016, 0.011, 0.004), (0.008, -0.007, level + 0.003)), spoon)


@model
def supper(item, words, seed):
    """A pewter plate, its broad rim catching the light: a grilled fish on it, greens heaped at its head and slices of
    carrot by its tail. No words."""
    radius = 0.13
    pewter = Mat('pewter', rough=0.3, metal=0.2, spec=0.8)
    item.add(_plate(radius), pewter)
    # a line turned in the rim, as pewter plates have
    item.add(shapes.moved(shapes.torus(radius * 0.86, 0.0016, 48, 5), offset=(0, 0, 0.0128)),
             Mat('pewter', rough=0.4, metal=0.2, spec=0.6, dim=0.7))
    _fish(item, {'skin': 'fishCooked', 'cooked': True}, seed, 0.155, 0.07, offset=(-0.098, 0.014, 0.005),
          turn=(-70, 0, -5), dim=0.8, fins=False)
    rng = np.random.RandomState(seed & 0x7fffffff)
    greens = Mat('leaf', rough=0.6, bump=(0.4, 260.0))
    for k in range(5):
        x, y = -0.072 + rng.uniform(-0.015, 0.015), -0.05 + rng.uniform(-0.012, 0.012)
        leaf = shapes.moved(_leaf(0.034, 0.013), turn=(rng.uniform(-30, 30), rng.uniform(-20, 20), rng.uniform(0, 360)))
        item.add(shapes.moved(shapes.wobble(leaf, seed + k, 0.05), offset=(x, y, 0.012 + 0.003 * k)), greens)
    item.add(shapes.wobble(shapes.ellipsoid((0.022, 0.018, 0.012), (-0.072, -0.05, 0.01)), seed, 0.2), greens)
    # carrot coins, overlapped, their cut faces up to the light
    coin = Mat('carrot', rough=0.4, spec=0.5)
    for k, (x, y) in enumerate(((0.064, -0.07), (0.084, -0.058), (0.064, -0.052))):
        piece = shapes.moved(shapes.cylinder(0.0135, 0.007, sides=14), offset=(-0.0035, 0, 0), turn=(0, -78, 25 * k))
        item.add(shapes.moved(piece, offset=(x, y, 0.009 + 0.004 * k)), coin)


@model
def tart(item, words, seed):
    """A fruit tart: its crust's sides and its crimped rim, its dark fruit glossy under a lattice of pastry, whole
    berries shining in the lattice's windows. No words."""
    radius, height = 0.095, 0.034
    pastry = Mat('crust', rough=0.6, spec=0.4, bump=(0.2, 130.0))
    shell = shapes.lathe([(radius * 0.9, height - 0.004), (radius * 0.98, height - 0.008), (radius, height - 0.016),
                          (radius * 0.94, 0.003), (radius * 0.9, 0.0), (0.0001, 0.0)], 40)
    item.add(shell, pastry)
    # the rim crimped by a thumb all round: a ring whose girth swells and pinches
    verts, faces = shapes.torus(radius * 0.9, 0.009, 64, 8)
    crimped = []
    ring = radius * 0.9
    for x, y, z in verts:
        swell = 1 + 0.18 * math.cos(math.atan2(y, x) * 17)
        reach = math.hypot(x, y)
        out = (ring + (reach - ring) * swell) / reach
        crimped.append((x * out, y * out, height + z * swell * 0.8))
    item.add((crimped, faces), pastry)
    fill_r = radius * 0.86
    fruit = Mat('berry', rough=0.2, spec=0.8, bump=(0.35, 120.0))
    item.add(shapes.wobble(shapes.lathe([(0.0001, height + 0.0035), (fill_r * 0.6, height + 0.003),
                                         (fill_r, height), (fill_r, height - 0.01)], 36, top=True), seed, 0.01), fruit)
    # the lattice: flat strips each way, one set laid over the other
    strip = Mat('crust', rough=0.55, spec=0.45, bump=(0.1, 160.0), dim=1.06)
    gap = 0.038
    for way, lift in ((0.0, 0.0042), (90.0, 0.0066)):
        for k in (-1.5, -0.5, 0.5, 1.5):
            across = k * gap
            half = math.sqrt(max(0.0, (fill_r * 1.02) ** 2 - across ** 2))
            bar = shapes.box(2 * half, 0.0125, 0.003, (0.0, across, height + lift))
            item.add(shapes.moved(bar, turn=(0, 0, way)), strip, smooth=False, bevel=0.0012)
    # whole berries shining in the lattice's windows
    bead = Mat('berry', rough=0.15, spec=0.9, dim=1.1)
    for i, j in ((0, 0), (-1, 1), (1, -1), (2, 0), (-2, 0)):
        x, y = i * gap, j * gap
        if math.hypot(x, y) < fill_r - 0.012:
            item.add(shapes.ellipsoid((0.0065, 0.0065, 0.005), (x, y, height + 0.004), rings=6, sides=10), bead)


@model
def feast(item, words, seed):
    """A feast on an oval pewter platter: a roast bird breast up, its drumsticks raised with bare bone at their ends,
    a scored roll at its left, two red apples at its right, greens round its foot. No words."""
    pewter = Mat('pewter', rough=0.3, metal=0.2, spec=0.8)
    item.add(shapes.moved(_plate(0.165, well=0.7, rise=0.018), scale=(1.3, 1.0, 1.0)), pewter)
    item.add(shapes.moved(shapes.torus(0.165 * 0.87, 0.0018, 56, 5), offset=(0, 0, 0.0142), scale=(1.3, 1.0, 1.0)),
             Mat('pewter', rough=0.4, metal=0.2, spec=0.6, dim=0.7))
    roast = Mat('meatCooked', rough=0.35, spec=0.65, bump=(0.4, 100.0))
    bird = shapes.wobble(shapes.ellipsoid((0.085, 0.066, 0.068), rings=14, sides=24, flat=0.3), seed, 0.04)
    lift = 0.068 * (1 - 2 * 0.3)
    item.add(shapes.moved(bird, offset=(0.0, 0.01, 0.005 + lift)), roast)
    # the breastbone's ridge down its middle, crisped darker
    keel = [(-0.07, 0.0, 0.07), (-0.03, 0.002, 0.094), (0.02, 0.004, 0.098), (0.06, 0.006, 0.085)]
    item.add(shapes.moved(shapes.tube(keel, 0.006, sides=6), offset=(0, 0.004, 0.005 + lift - 0.027)),
             Mat('meatCooked', rough=0.5, dim=0.82, bump=(0.4, 160.0)))
    # the wings folded to its sides, near the eye
    for sign in (-1, 1):
        wing = shapes.wobble(shapes.ellipsoid((0.04, 0.02, 0.022), (sign * 0.05, -0.04, 0.04)), seed + sign, 0.1)
        item.add(wing, roast)
    # the drumsticks: meat swelling from the bird's far sides, raised, a knob of bone at each end
    bone = Mat('bone', rough=0.45, spec=0.5)
    for sign in (-1, 1):
        thigh = shapes.wobble(shapes.ellipsoid((0.022, 0.022, 0.042)), seed + 3 + sign, 0.08)
        item.add(shapes.moved(thigh, offset=(sign * 0.062, 0.05, 0.078), turn=(-50, sign * 48, 0)), roast)
        shank = (sign * 0.104, 0.078, 0.112)
        item.add(shapes.tube([(sign * 0.08, 0.062, 0.096), shank], 0.0058, sides=8), bone)
        knob = (shank[0] + sign * 0.004, shank[1] + 0.003, shank[2] + 0.005)
        item.add(shapes.ellipsoid((0.0095, 0.0095, 0.0085), knob, rings=6, sides=10), bone)
    # a roll at the left, scored once
    roll_turn = 20.0
    roll = shapes.wobble(shapes.ellipsoid((0.042, 0.032, 0.03), rings=10, sides=18, flat=0.3), seed, 0.05)
    item.add(shapes.moved(roll, offset=(-0.135, -0.012, 0.005 + 0.012), turn=(0, 0, roll_turn)),
             Mat('crust', rough=0.65, spec=0.35, bump=(0.25, 120.0),
                 pattern=('crumb', _ovals([(-0.135, -0.012, 0.03, 0.006, roll_turn + 80)], 0.03))))
    # two apples at the right
    skin = Mat('appleRed', rough=0.3, spec=0.6)
    stalk = Mat('wood', rough=0.9)
    for x, y, radius in ((0.125, 0.0, 0.028), (0.15, -0.045, 0.026)):
        item.add(shapes.moved(_fruit(radius), offset=(x, y, 0.006 + radius)), skin)
        item.add(shapes.tube([(x, y, 0.006 + radius * 1.7), (x + radius * 0.15, y, 0.006 + radius * 2.2)],
                             radius * 0.09, 5), stalk)
    # greens tucked round the bird's foot
    rng = np.random.RandomState(seed & 0x7fffffff)
    greens = Mat('leaf', rough=0.6, bump=(0.4, 260.0))
    for k, (x, y, spin) in enumerate(((-0.07, -0.074, 200), (-0.035, -0.084, 250), (0.04, -0.082, 300),
                                      (0.075, -0.07, 330))):
        leaf = shapes.moved(_leaf(0.05, 0.019), turn=(rng.uniform(-20, 20), rng.uniform(-10, 10), spin))
        item.add(shapes.moved(shapes.wobble(leaf, seed + k, 0.05), offset=(x, y, 0.012 + 0.002 * k)), greens)


# --- the wild ---

def _mushroom(item, cap_r, stem_h, at, lean, cap, flecks, seed, ring=False):
    """One mushroom at `at`, leaning `lean` (degrees about x, then y; back from the eye shows its gills): its pale stem
    swelling at its foot, a torn `ring` skirting it under the cap if asked, its domed cap rolled under at the rim, the
    gills dark beneath in ribs, `flecks` pale scales on its cap."""
    turn = (lean[0], lean[1], 0.0)
    place = (at[0], at[1], 0.0)
    stem_r = cap_r * 0.27
    stem = shapes.lathe([(stem_r * 0.82, stem_h), (stem_r * 0.92, stem_h * 0.6), (stem_r * 1.05, stem_h * 0.22),
                         (stem_r * 1.35, stem_h * 0.07), (stem_r * 1.15, 0.0), (0.0001, 0.0)], 14)
    flesh = Mat('stem', rough=0.7, bump=(0.2, 300.0))
    item.add(shapes.moved(stem, offset=place, turn=turn), flesh)
    if ring:
        skirt = shapes.lathe([(stem_r * 0.9, stem_h * 0.8), (stem_r * 1.7, stem_h * 0.72),
                              (stem_r * 1.75, stem_h * 0.66), (stem_r * 0.95, stem_h * 0.74)], 16, loop=True)
        item.add(shapes.moved(shapes.wobble(skirt, seed + 7, 0.08), offset=place, turn=turn),
                 Mat('stem', rough=0.7, dim=0.85))
    dome = cap_r * 0.56
    profile = [(0.0001, stem_h + dome)]
    for angle in np.linspace(0.12, 0.5 * math.pi, 8):
        profile.append((cap_r * math.sin(angle), stem_h + dome * math.cos(angle) ** 0.85))
    profile += [(cap_r * 0.97, stem_h - cap_r * 0.1), (cap_r * 0.88, stem_h - cap_r * 0.12)]
    spots = []
    if flecks:
        rng = np.random.RandomState(seed & 0x7fffffff)
        for k in range(flecks):
            angle, reach = 2 * math.pi * (k + rng.uniform(0.0, 0.6)) / flecks, rng.uniform(0.3, 0.62)
            z = stem_h + dome * math.cos(math.asin(reach)) ** 0.85
            spots.append(tuple(_at((cap_r * reach * math.cos(angle), cap_r * reach * math.sin(angle), z), place,
                                   turn)))
    top = Mat(cap, rough=0.45, spec=0.5, bump=(0.15, 200.0),
              pattern=('stem', _spots(spots, cap_r * 0.17), 0.95) if spots else None)
    item.add(shapes.moved(shapes.lathe(profile, 24), offset=place, turn=turn), top)
    # the gills: a dark ring under the cap, ribbed
    gills = shapes.lathe([(cap_r * 0.9, stem_h - cap_r * 0.11), (stem_r * 1.1, stem_h - cap_r * 0.02)], 24)
    rib = Mat(cap, rough=0.8, dim=0.5, pattern=(cap, _radial(20, at, turn), 0.3))
    item.add(shapes.moved(gills, offset=place, turn=turn), rib)


def _radial(count, centre, turn):
    """`count` thin spokes round a part's own z axis: the gills under a cap."""
    def mask(nodes, links, coord):
        local = _local(nodes, links, coord, (centre[0], centre[1], 0.0), turn)
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(local, sep.inputs['Vector'])
        angle = _op(nodes, links, 'ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
        wave = _op(nodes, links, 'SINE', _op(nodes, links, 'MULTIPLY', angle, float(count)))
        return _op(nodes, links, 'GREATER_THAN', wave, 0.55)
    return mask


@model
def mushrooms(item, words, seed):
    """Two mushrooms, a large one behind and a small one before it to the right, both leaning back: domed brown caps,
    the large one's flecked pale, pale stems, the large one's skirted by a ring, the dark ribbed gills under the rims.
    No words."""
    _mushroom(item, 0.034, 0.062, (-0.014, 0.014), (-24, -8), 'mushroom', 4, seed, ring=True)
    _mushroom(item, 0.025, 0.046, (0.03, -0.014), (-26, 12), 'mushroom', 0, seed + 1)


# --- the camp ---

def _flame(height, radius, lean, seed):
    """A tongue of flame: a teardrop drawn up to a point, its tip bent by `lean`, rippled."""
    profile = []
    for down in np.linspace(0.0, 1.0, 12):
        reach = radius * (down ** 1.5) * math.sqrt(max(1.0 - down, 0.0)) / 0.4648
        profile.append((max(reach, 1e-4), height * (1 - down)))
    verts, faces = shapes.lathe(profile, 14, top=True, foot=True)
    verts = [(x + lean * (z / height) ** 2, y, z) for x, y, z in verts]
    return shapes.wobble((verts, faces), seed, 0.08)


@model
def campfire(item, words, seed):
    """A campfire: a ring of stones, two logs crossed over it, their cut ends showing, embers glowing between them, and
    a fire of tongues rising out of the crossing, white-hot at its heart. No words."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    stone = Mat('rock', rough=0.85, bump=(0.5, 90.0))
    count = 10
    for k in range(count):
        angle = 2 * math.pi * (k + 0.3) / count + rng.uniform(-0.12, 0.12)
        size = rng.uniform(0.034, 0.046)
        lump = shapes.wobble(shapes.ellipsoid((size * 1.25, size, size * 0.8), rings=7, sides=11, flat=0.3),
                             seed + k, 0.18)
        item.add(shapes.moved(lump, offset=(0.2 * math.cos(angle), 0.17 * math.sin(angle), size * 0.3),
                              turn=(0, 0, math.degrees(angle) + 90)), stone)
    # ash and embers in the ring's floor
    item.add(shapes.ellipsoid((0.14, 0.115, 0.012), (0, 0, 0.0), flat=0.5, rings=6, sides=20),
             Mat('rock', rough=1.0, dim=0.85, bump=(0.6, 120.0)))
    ember = Mat('ember', rough=0.7, glow=0.55)
    for k in range(9):
        x, y = rng.uniform(-0.09, 0.09), rng.uniform(-0.08, 0.06)
        coal = shapes.wobble(shapes.ellipsoid((0.016, 0.013, 0.01), rings=5, sides=8), seed + 20 + k, 0.25)
        item.add(shapes.moved(coal, offset=(x, y, 0.008)), ember)
    girth, length = 0.033, 0.42
    logs = (('barkOak', 33.0, girth + 0.01), ('barkPine', -33.0, girth * 2.9 + 0.01))
    for k, (bark_ramp, turn, height) in enumerate(logs):
        bark = Mat(bark_ramp, rough=0.95, bump=(0.8, 110.0))
        body = shapes.cylinder(girth, length, sides=12, caps=False, radius_end=girth * 0.9)
        body = shapes.wobble(body, seed + k, 0.05)
        log = shapes.moved(shapes.moved(body, offset=(-length / 2, 0, 0)), offset=(0, 0, height), turn=(0, 0, turn))
        item.add(log, bark)
        rad = math.radians(turn)
        for sign, end_girth in ((-1, girth), (1, girth * 0.9)):
            centre = (sign * length / 2 * math.cos(rad), sign * length / 2 * math.sin(rad), height)
            face = shapes.moved(shapes.ellipsoid((0.003, end_girth * 0.94, end_girth * 0.94), rings=5, sides=12),
                                offset=centre, turn=(0, 0, turn))
            item.add(face, Mat('oak', rough=0.8, pattern=('oak', _spots([centre], end_girth * 0.42), 0.7)))
        # the log charred black where the fire licks it, glowing in its cracks
        char = shapes.wobble(shapes.cylinder(girth * 1.04, length * 0.34, sides=12, caps=False), seed + 9 + k, 0.08)
        char = shapes.moved(shapes.moved(char, offset=(-length * 0.17, 0, 0)), offset=(0, 0, height), turn=(0, 0, turn))
        item.add(char, Mat('black', rough=0.9, bump=(0.9, 160.0),
                           pattern=('ember', _bars((0, 0, 1), [height + girth * 0.55], girth * 0.12))))
    # the fire: a tall tongue in the middle, smaller ones beside it, a white-hot heart before them
    fire = Mat('flame', rough=0.6, glow=0.5)
    base = girth * 2.2
    for x, y, tall, wide, lean in ((0.0, 0.0, 0.34, 0.068, 0.015), (-0.062, -0.015, 0.19, 0.044, -0.025),
                                   (0.064, -0.01, 0.21, 0.046, 0.03), (0.024, 0.03, 0.24, 0.04, 0.035)):
        item.add(shapes.moved(_flame(tall, wide, lean, seed + int(x * 100)), offset=(x, y, base - 0.03)), fire)
    heart = Mat('flame', rough=0.6, glow=0.88)
    item.add(shapes.moved(_flame(0.15, 0.052, 0.0, seed + 5), offset=(0.0, -0.05, base - 0.02)), heart)
    # sparks thrown up off the tongues, each a single bright texel
    for x, z in ((-0.05, base + 0.24), (0.07, base + 0.29), (0.03, base + 0.38)):
        item.sparkle((x, -0.02, z), 'flame', arm=0)


@model
def skillet(item, words, seed):
    """An iron skillet: its pan with a rolled rim and pouring lips, the cooking floor blackened, its long handle out to
    the upper right with a hole to hang it by. No words."""
    rim, top = 0.11, 0.046
    iron = Mat('iron', rough=0.4, metal=0.2, spec=0.65, bump=(0.15, 160.0))
    # the rim rolled thick and worn bright by the hand, so the pan's mouth reads as a light ring round its dark floor
    outer = [(rim - 0.013, top), (rim - 0.008, top + 0.003), (rim - 0.001, top + 0.003), (rim + 0.003, top),
             (rim + 0.001, top - 0.007), (rim - 0.014, 0.006), (rim - 0.02, 0.0), (0.0001, 0.0)]
    item.add(shapes.lathe(outer, 40), iron)
    inside = [(rim - 0.013, top), (rim - 0.024, 0.009), (rim - 0.032, 0.006), (0.0001, 0.006)]
    item.add(shapes.lathe(inside, 40), Mat('iron', rough=0.7, metal=0.1, spec=0.4, dim=0.4, bump=(0.4, 120.0)))
    turn = 36.0
    rad = math.radians(turn)
    # the handle: a flat bar from the rim, widening to a rounded end with a hole through it
    start, end = rim - 0.004, rim + 0.18
    knob = 0.025
    outline = [(start, -0.026), (start + 0.04, -0.02), (end - 0.034, -0.019)]
    outline += [(end + knob * math.cos(angle), knob * math.sin(angle))
                for angle in np.linspace(-0.62 * math.pi, 0.62 * math.pi, 9)]
    outline += [(end - 0.034, 0.019), (start + 0.04, 0.02), (start, 0.026)]
    place, tilt = (0, 0, top - 0.009), (0, -7, turn)
    item.add(shapes.moved(shapes.prism(outline, 0.014, -0.007), place, tilt), iron, smooth=False, bevel=0.003)
    # the hole to hang it by, dark through the handle's end
    hole = shapes.lathe([(0.0001, 0.0074), (0.011, 0.0074), (0.011, 0.006)], 14)
    item.add(shapes.moved(shapes.moved(hole, (end + 0.002, 0.0, 0.0)), place, tilt), Mat('black', rough=0.9))
    # a rib down the handle's top, the casting's spine
    rib = [(start + 0.012, 0.0, 0.008), (end - 0.034, 0.0, 0.008)]
    item.add(shapes.moved(shapes.tube(rib, 0.0034, sides=6), place, tilt), iron)
    # the two pouring lips, pinched out at the sides
    for sign in (-1, 1):
        angle = rad + sign * math.pi / 2
        item.add(shapes.ellipsoid((0.01, 0.006, 0.0035), (rim * math.cos(angle), rim * math.sin(angle), top - 0.001)),
                 iron)
