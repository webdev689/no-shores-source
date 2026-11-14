"""The town flats the port stands in for pieces it does not carry (src/world/detStandIns.js DET_FLAT_DRAWINGS): a
table's fruit, cheese, roast and porridge; the clutter of a house, a yard and a studio; and the yard's animals - hens
and roosters, sheep, rats, rock doves and a monkey. Each is a billboard at Daggerfall's own pixel, set in the canvas its
record's size asks and standing on the canvas's bottom row (tools/sprite-forge/specs/pictures/standins.json). The things
on a table are seen from a little above it; the animals and the easel stand before a near-level eye, side-on facing
left or turned to the eye as their pose says."""
import math

import numpy as np

from . import kit, shapes
from .kit import Mat
from .models import model

# The colours these flats need that no item uses, as the item ramps are written (darkest step first). Registered under
# their own `si-` names so no other module's ramp is ever taken or shadowed.
OWN_RAMPS = {
    'si-cheese': [[150, 108, 28], [202, 158, 52], [234, 200, 92], [248, 226, 138], [254, 244, 196]],
    'si-rind': [[56, 28, 10], [96, 52, 18], [136, 82, 30], [170, 112, 46], [198, 144, 72]],
    'si-rindTop': [[140, 98, 30], [188, 144, 52], [222, 188, 88], [240, 214, 130], [250, 236, 178]],
    'si-pear': [[60, 66, 14], [114, 122, 28], [166, 170, 54], [204, 202, 90], [236, 232, 150]],
    'si-russet': [[84, 38, 14], [134, 66, 26], [176, 100, 42], [206, 138, 68], [230, 178, 108]],
    'si-plum': [[26, 8, 32], [58, 22, 66], [92, 42, 100], [130, 78, 138], [172, 132, 182]],
    'si-bloom': [[70, 62, 96], [110, 100, 140], [148, 140, 178], [188, 182, 210]],
    'si-peach': [[130, 62, 20], [196, 112, 48], [232, 160, 80], [246, 198, 118], [252, 228, 170]],
    'si-blush': [[106, 22, 18], [164, 50, 34], [204, 84, 52], [228, 124, 80], [242, 164, 118]],
    'si-olive': [[24, 32, 8], [50, 64, 20], [80, 96, 36], [114, 128, 60], [162, 172, 102]],
    'si-blackOlive': [[14, 10, 14], [34, 24, 30], [56, 42, 50], [86, 70, 78], [128, 112, 118]],
    'si-grape': [[22, 8, 32], [52, 20, 68], [86, 42, 106], [124, 80, 146], [176, 140, 198]],
    'si-greenGrape': [[58, 78, 20], [104, 130, 40], [148, 174, 70], [186, 206, 108], [224, 236, 162]],
    'si-cabbage': [[28, 60, 22], [58, 106, 46], [94, 148, 68], [138, 186, 100], [190, 222, 152]],
    'si-vein': [[104, 132, 86], [154, 184, 126], [196, 218, 166], [226, 238, 202]],
    'si-comb': [[82, 8, 8], [142, 20, 18], [198, 36, 30], [230, 76, 60], [248, 134, 112]],
    'si-beak': [[108, 70, 12], [168, 120, 28], [214, 166, 50], [236, 200, 92], [250, 228, 152]],
    'si-hen': [[50, 24, 10], [98, 52, 24], [146, 88, 44], [186, 128, 72], [220, 172, 114]],
    'si-henDark': [[40, 18, 8], [74, 38, 16], [108, 62, 30], [140, 92, 50], [172, 126, 78]],
    'si-white': [[112, 108, 98], [164, 160, 150], [206, 202, 192], [232, 228, 220], [250, 248, 242]],
    'si-tail': [[8, 14, 12], [20, 32, 28], [36, 54, 44], [58, 80, 64], [92, 116, 92]],
    'si-dove': [[92, 96, 108], [118, 122, 136], [144, 148, 162], [170, 174, 186], [196, 200, 210]],
    'si-doveDark': [[34, 36, 44], [56, 60, 70], [80, 84, 96], [106, 110, 122], [134, 138, 150]],
    'si-sheen': [[40, 84, 76], [62, 120, 106], [92, 156, 136], [138, 192, 170]],
    'si-feet': [[90, 20, 26], [150, 46, 50], [196, 82, 80], [226, 128, 120]],
    'si-face': [[20, 16, 14], [40, 34, 30], [62, 54, 48], [92, 82, 74], [128, 118, 108]],
    'si-fleece': [[116, 110, 94], [168, 162, 144], [206, 200, 182], [230, 226, 210], [246, 244, 234]],
    'si-ratBrown': [[38, 26, 16], [72, 54, 38], [108, 86, 64], [144, 120, 96], [178, 156, 132]],
    'si-ratBlack': [[12, 12, 14], [28, 26, 30], [48, 46, 50], [74, 72, 76], [108, 104, 108]],
    'si-monkey': [[34, 20, 10], [70, 46, 26], [106, 74, 44], [144, 108, 70], [182, 148, 108]],
    'si-skin': [[108, 70, 50], [154, 110, 82], [194, 154, 118], [220, 188, 154], [240, 216, 188]],
    'si-sky': [[58, 88, 128], [94, 128, 170], [126, 160, 200], [164, 192, 224], [206, 224, 242]],
    'si-hill': [[28, 50, 22], [54, 84, 40], [88, 118, 68], [122, 152, 94], [164, 188, 128]],
    'si-toyRed': [[70, 14, 10], [128, 32, 24], [178, 52, 40], [214, 92, 70], [236, 140, 116]],
    'si-toyBlue': [[16, 26, 64], [34, 54, 112], [58, 88, 160], [96, 128, 196], [150, 176, 226]],
    'si-toyYellow': [[110, 80, 14], [168, 128, 32], [216, 180, 60], [236, 210, 108], [250, 236, 170]],
    'si-glassBrown': [[66, 32, 10], [108, 60, 22], [150, 96, 44], [192, 142, 82], [232, 200, 146]],
    'si-glassGreen': [[26, 62, 38], [50, 102, 64], [82, 144, 96], [128, 188, 138], [192, 232, 198]],
    'si-cream': [[148, 136, 106], [194, 184, 154], [224, 214, 186], [240, 234, 214], [250, 248, 238]],
    'si-roast': [[58, 24, 10], [106, 50, 20], [152, 86, 36], [194, 128, 60], [228, 176, 104]],
    'si-grain': [[110, 80, 30], [162, 124, 52], [206, 168, 84], [230, 200, 122], [246, 228, 170]],
}
for _name, _steps in OWN_RAMPS.items():
    kit.RAMPS[_name] = np.asarray(_steps, dtype=np.float64)


# --- shader masks: a pattern's `mask(nodes, links, coord)` over a part's own coordinates, metres ---

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


def _any(nodes, links, masks):
    """Where any of `masks` shows."""
    result = masks[0]
    for mask in masks[1:]:
        result = _op(nodes, links, 'MAXIMUM', result, mask)
    return result


def _axis(nodes, links, coord, which):
    """One coordinate of a point: 'X', 'Y' or 'Z'."""
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coord, sep.inputs['Vector'])
    return sep.outputs[which]


def _spots(centres, radius):
    """Round spots of `radius` about each of `centres`."""
    def mask(nodes, links, coord):
        near = [_op(nodes, links, 'LESS_THAN', _op(nodes, links, 'DISTANCE', coord, tuple(centre), vector=True), radius)
                for centre in centres]
        return _any(nodes, links, near)
    return mask


def _side(normal, depth, noise=0.0, scale=60.0):
    """Past a plane: where the point's reach along `normal` passes `depth`, its edge broken by a noise of `noise`
    metres (a blush on a fruit's far side, a sky above a horizon)."""
    def mask(nodes, links, coord):
        reach = _op(nodes, links, 'DOT_PRODUCT', coord, tuple(normal), vector=True)
        if noise:
            tex = nodes.new('ShaderNodeTexNoise')
            tex.inputs['Scale'].default_value = scale
            links.new(coord, tex.inputs['Vector'])
            reach = _op(nodes, links, 'MULTIPLY_ADD', tex.outputs['Fac'], noise * 2, reach)
            reach = _op(nodes, links, 'SUBTRACT', reach, noise)
        return _op(nodes, links, 'GREATER_THAN', reach, depth)
    return mask


def _blotches(scale, share):
    """Soft patches over `share` of a surface, `scale` cycles a metre: a hen's speckle, a rind's bloom."""
    def mask(nodes, links, coord):
        tex = nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = scale
        tex.inputs['Detail'].default_value = 1.0
        links.new(coord, tex.inputs['Vector'])
        return _op(nodes, links, 'GREATER_THAN', tex.outputs['Fac'], 0.5 + 0.22 * (0.5 - share) / 0.5)
    return mask


# --- mesh helpers ---

def _fruit(radius, dimple=0.18, squash=0.92, rings=12, sides=20):
    """A fruit's body: a sphere dimpled in at its stem and its foot, `squash` its height to its width."""
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


def _crease(mesh, depth, width, normal=(0.0, -1.0, 0.0)):
    """A fruit's suture: a groove `depth` deep and `width` wide pressed down the side facing `normal`, top to foot."""
    verts, faces = mesh
    unit = np.asarray(normal, dtype=np.float64)
    out = []
    for vertex in verts:
        point = np.asarray(vertex, dtype=np.float64)
        flat = np.array([point[0], point[1], 0.0])
        reach = np.linalg.norm(flat)
        if reach < 1e-9:
            out.append(tuple(point))
            continue
        toward = flat / reach
        off = math.acos(max(-1.0, min(1.0, float(toward @ unit))))
        press = depth * math.exp(-((off * reach / width) ** 2))
        out.append(tuple(point - toward * press))
    return out, faces


def _leaf(length, width, cup=0.25, fold=0.0):
    """A leaf in the xy plane from its stalk at the origin along +x: a pointed oval, cupped up along its middle by `cup`
    of its width, folded along its rib by `fold` (radians a side)."""
    rows, across = 8, 4
    verts, faces = [], []
    for i in range(rows + 1):
        share = i / rows
        half = width * math.sin(math.pi * share) ** 0.8 * (1 - 0.25 * share)
        for j in range(-across, across + 1):
            spread = j / across
            y = half * spread
            z = cup * width * spread * spread + abs(y) * math.tan(fold)
            verts.append((length * share, y, z))
    stride = 2 * across + 1
    for i in range(rows):
        for j in range(stride - 1):
            corner = i * stride + j
            faces.append((corner, corner + 1, corner + stride + 1, corner + stride))
    return verts, faces


def _stalk(points, radius, sides=5, radius_end=None):
    """A stem along `points`."""
    return shapes.tube(points, radius, sides=sides, radius_end=radius_end)


def _bowl(radius, height, wall, foot=0.0, sides=28):
    """A turned bowl: its outside from the rim down to a foot `foot` of its radius, its inside a hollow `wall` thick,
    its rim rounded."""
    outer = []
    for i in range(9):
        angle = (math.pi / 2) * i / 8
        outer.append((radius * math.cos(angle) + 1e-4, height - height * math.sin(angle)))
    outer = [(max(reach, radius * foot), z) for reach, z in outer]
    inner = []
    for i in range(8, -1, -1):
        angle = (math.pi / 2) * i / 8
        inner.append((max((radius - wall) * math.cos(angle), 1e-4), height - (height - wall) * math.sin(angle)))
    profile = [(radius - wall * 0.5, height + wall * 0.3)] + outer + [(0.0001, 0.0)]
    verts, faces = shapes.lathe(profile, sides, foot=True)
    inside = shapes.lathe([(radius - wall * 0.5, height + wall * 0.3)] + inner[:-1] + [(0.0001, wall)], sides,
                          foot=True)
    # the inside's faces turned to face up out of the bowl
    inner_verts, inner_faces = inside
    return shapes.joined((verts, faces), (inner_verts, [tuple(reversed(face)) for face in inner_faces]))


def _rng(seed):
    """The row's own random stream: one row, one picture, every time."""
    return np.random.RandomState(seed & 0x7fffffff)


# --- the fruit ---------------------------------------------------------------------------------------------------

@model
def cherryPair(item, words, seed):
    """Two cherries hanging from one forked stem, a small leaf where the stems join: round, glossy and dark red, each
    with a glint on its upper left. The stems are drawn thick: a real one is finer than a texel at this size."""
    radius = 0.0115
    skin = Mat('appleRed', rough=0.25, spec=0.7)
    stem = Mat('si-olive', rough=0.8, dim=1.25)
    join = (0.001, 0.006, 0.04)
    for x, y in ((-0.0095, -0.006), (0.0098, 0.004)):
        item.add(shapes.moved(_fruit(radius, dimple=0.16, squash=0.92), offset=(x, y, radius * 0.95)), skin)
        top = (x * 0.9, y, radius * 1.7)
        bend = (x * 0.3 + join[0], (y + join[1]) / 2, join[2] - 0.007)
        item.add(_stalk([top, (x * 0.75, y, radius * 2.6), bend, join], 0.0023), stem)
        item.sparkle((x - radius * 0.35, y - radius * 0.75, radius * 1.3), 'appleRed', arm=0)
    leaf = shapes.moved(_leaf(0.017, 0.0075, cup=0.2), offset=join, turn=(-50, -8, 12))
    item.add(leaf, Mat('leaf', rough=0.6))


@model
def pearFruit(item, words, seed):
    """A pear standing on its foot: a full round base narrowing to a long neck, its yellow-green skin freckled and
    russet-blushed on its far right, a short woody stem leaning from its top and a leaf off it."""
    profile = []
    height = 0.105
    for i in range(17):
        share = i / 16
        z = height * (1 - share)
        # the neck's girth to the full base's: a pear's curve, waisted above the middle
        base = math.sin(math.pi * min(1.0, (share + 0.02) / 1.0)) ** 0.7
        girth = 0.034 * (0.42 + 0.58 * (1 / (1 + math.exp(-(share - 0.48) * 9)))) * base ** 0.35
        if share > 0.86:
            girth *= math.sqrt(max(0.0, 1 - ((share - 0.86) / 0.14) ** 2)) * 0.9 + 0.1 * (1 - share)
        profile.append((max(girth, 1e-4), z))
    profile[0] = (0.004, height)
    body = shapes.lathe(profile, 22, top=True, foot=True)
    body = shapes.wobble(body, seed, 0.02)
    skin = Mat('si-pear', rough=0.45, spec=0.4, bump=(0.12, 300.0),
               pattern=('si-russet', _side((0.8, 0.5, -0.2), 0.012, noise=0.008, scale=90.0)))
    item.add(shapes.moved(body, turn=(0, 6, 0)), skin)
    item.add(_stalk([(0.0, 0.0, height - 0.004), (0.003, 0.0, height + 0.008), (0.008, 0.0, height + 0.015)], 0.0034,
                    radius_end=0.0026), Mat('wood', rough=0.9))
    item.add(shapes.moved(_leaf(0.032, 0.011, cup=0.2, fold=0.2), offset=(0.003, -0.002, height + 0.004),
                          turn=(-20, -25, 18)), Mat('leaf', rough=0.6))
    item.sparkle((-0.014, -0.03, 0.03), 'si-pear', arm=0)


@model
def plumFruit(item, words, seed):
    """A plum: a plump oval, deep purple dusted with a paler bloom, its crease running down the side toward the eye, a
    short stem in its dimple."""
    radius = 0.024
    body = _crease(_fruit(radius, dimple=0.12, squash=1.08, rings=14, sides=24), radius * 0.12, radius * 0.35,
                   normal=(-0.35, -0.94, 0.0))
    skin = Mat('si-plum', rough=0.35, spec=0.55, pattern=('si-bloom', _blotches(160.0, 0.22), 0.95))
    item.add(shapes.moved(body, offset=(0, 0, radius * 1.02), scale=(1.0, 0.94, 1.0)), skin)
    item.add(_stalk([(0, 0, radius * 1.9), (0.002, 0, radius * 2.35), (0.006, 0, radius * 2.55)], 0.003),
             Mat('wood', rough=0.9))
    item.sparkle((-radius * 0.4, -radius * 0.75, radius * 1.55), 'si-plum', arm=0)


@model
def peachFruit(item, words, seed):
    """A peach: round and downy, warm gold flushed deep red over its upper right, its crease down the side toward the
    eye, a leaf at its stem."""
    radius = 0.032
    body = _crease(_fruit(radius, dimple=0.14, squash=0.96, rings=14, sides=24), radius * 0.2, radius * 0.3,
                   normal=(-0.3, -0.95, 0.0))
    skin = Mat('si-peach', rough=0.7, spec=0.2, bump=(0.05, 200.0),
               pattern=('si-blush', _side((0.75, 0.25, 0.6), radius * 0.7, noise=radius * 0.1, scale=50.0)))
    item.add(shapes.moved(body, offset=(0, 0, radius * 0.97)), skin)
    # the crease's shadowed line, drawn as a thin groove's floor laid in the suture
    groove = [(-math.sin(0.3) * radius * reach, -math.cos(0.3) * radius * reach, radius * 0.97 + radius * 0.96 * rise)
              for reach, rise in ((0.25, 0.97), (0.62, 0.78), (0.8, 0.45), (0.8, 0.05), (0.62, -0.45))]
    item.add(_stalk(groove, radius * 0.07, sides=5), Mat('si-peach', rough=0.8, dim=0.72))
    item.add(_stalk([(0, 0, radius * 1.85), (0.002, 0, radius * 2.1)], 0.0025), Mat('wood', rough=0.9))
    item.add(shapes.moved(_leaf(0.05, 0.014, cup=0.2, fold=0.25), offset=(0.002, 0.0, radius * 2.0),
                          turn=(-15, -18, 30)), Mat('leaf', rough=0.6))


def _berry_cluster(seed, count, radius):
    """A bunch's berries: rows narrowing from its broad shoulders to its tip, each berry a little apart."""
    rng = _rng(seed)
    berries = []
    rows = [(4, 0.0), (4, 0.9), (3, 1.8), (3, 2.6), (2, 3.4), (1, 4.1)]
    for row, (count_in_row, down) in enumerate(rows):
        spread = radius * (1.9 - row * 0.28)
        for k in range(count_in_row):
            angle = 2 * math.pi * k / count_in_row + row * 0.7 + rng.uniform(-0.25, 0.25)
            berries.append((spread * math.cos(angle), spread * math.sin(angle) * 0.8, -down * radius * 1.45))
    return berries[:count]


@model
def grapeBunch(item, words, seed):
    """A bunch of grapes hanging from its woody stem: round berries crowded broad at the shoulders and narrowing to a
    point, each with a glint, a vine leaf off the stem. `skin` the grapes' ramp (dark purple or pale green)."""
    radius = 0.0105
    skin = Mat(words.get('skin', 'si-grape'), rough=0.3, spec=0.6)
    top = 0.122
    berries = _berry_cluster(seed, 17, radius)
    for x, y, z in berries:
        item.add(shapes.ellipsoid((radius, radius, radius * 1.06), centre=(x, y, top - 0.012 + z), rings=8, sides=12),
                 skin)
    near = sorted(berries, key=lambda berry: berry[1])[:7]
    for x, y, z in near:
        item.sparkle((x - radius * 0.3, y - radius * 0.8, top - 0.012 + z + radius * 0.4), skin.ramp, arm=0)
    wood = Mat('wood', rough=0.9)
    item.add(_stalk([(0.002, 0.004, top - 0.004), (0.003, 0.004, top + 0.01), (-0.004, 0.004, top + 0.022)], 0.0022),
             wood)
    vine = _vine_leaf(0.034)
    item.add(shapes.moved(vine, offset=(0.003, 0.006, top + 0.012), turn=(-25, -28, 20)), Mat('leaf', rough=0.6))


def _vine_leaf(size):
    """A vine leaf: five rounded lobes about its stalk, a little cupped, in the xy plane from its stalk along +x."""
    outline = []
    for k in range(41):
        angle = -math.pi + 2 * math.pi * k / 40
        lobes = 0.72 + 0.28 * abs(math.cos(2.5 * angle))
        reach = size * 0.5 * lobes * (0.35 + 0.65 * math.cos(angle / 2) ** 0.6)
        outline.append((size * 0.5 + reach * math.cos(angle), reach * math.sin(angle)))
    verts, faces = shapes.prism(outline[:-1], 0.0008)
    return [(x, y, z + 0.08 * size * (y / size) ** 2 * 4) for x, y, z in verts], faces


@model
def cabbageHead(item, words, seed):
    """A head of cabbage: its tight heart wrapped in broad leaves, each cupped round it with its pale rib and veins
    running out, the outer leaves darker and curling back at their edges."""
    rng = _rng(seed)
    radius = 0.06
    heart = shapes.wobble(shapes.ellipsoid((radius, radius, radius * 0.9), centre=(0, 0, radius * 0.92), rings=12,
                                           sides=20), seed, 0.04)
    item.add(heart, Mat('si-cabbage', rough=0.55, spec=0.35, bump=(0.3, 70.0), dim=1.08,
                        pattern=('si-vein', _veins(0.0035), 1.0)))
    outer = Mat('si-cabbage', rough=0.6, spec=0.3, bump=(0.35, 60.0), dim=0.86, pattern=('si-vein', _veins(0.004), 0.9))
    for k in range(7):
        bearing = 2 * math.pi * k / 7 + rng.uniform(-0.2, 0.2)
        item.add(_wrap_leaf(radius * 1.08, bearing, 1.25, rng.uniform(0.75, 0.95), seed + k), outer)


def _veins(width):
    """A cabbage leaf's rib and veins: lines fanning up from its foot, as stretched noise crossing its middle."""
    def mask(nodes, links, coord):
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(coord, sep.inputs['Vector'])
        angle = _op(nodes, links, 'ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
        rib = _op(nodes, links, 'SINE', _op(nodes, links, 'MULTIPLY', angle, 9.0))
        thin = _op(nodes, links, 'LESS_THAN', _op(nodes, links, 'ABSOLUTE', rib), width * 40)
        high = _op(nodes, links, 'GREATER_THAN', sep.outputs['Z'], 0.02)
        return _op(nodes, links, 'MINIMUM', thin, high)
    return mask


def _wrap_leaf(radius, bearing, span, rise, seed):
    """One leaf wrapped round the head, facing `bearing` (radians about z): a cupped shell `span` radians wide that
    rises from the foot to `rise` of the head's height, its rim curling outward."""
    verts, faces = [], []
    rows, cols = 7, 9
    for i in range(rows + 1):
        height_share = i / rows
        polar = math.pi * (1 - height_share * rise * 0.95)
        for j in range(cols + 1):
            across = (j / cols - 0.5) * span * math.sin(math.pi * (0.25 + 0.75 * min(1.0, height_share * 1.4)))
            out = 1.0 + 0.08 * height_share ** 3 + 0.03 * math.sin(7 * across + seed)
            reach = radius * math.sin(polar) * out
            z = radius * 0.92 * (1 - math.cos(polar)) * 0.98
            angle = bearing + across
            verts.append((reach * math.cos(angle), reach * math.sin(angle), z))
    stride = cols + 1
    for i in range(rows):
        for j in range(cols):
            corner = i * stride + j
            faces.append((corner, corner + 1, corner + stride + 1, corner + stride))
    return verts, faces


# --- the cheese and the dishes -----------------------------------------------------------------------------------

def _wheel_profile(radius, height):
    """A cheese wheel's section from its top's middle out round its bulging rind to its foot's middle."""
    return [(1e-4, height), (radius * 0.5, height), (radius * 0.9, height), (radius * 0.965, height * 0.975),
            (radius * 0.995, height * 0.88), (radius, height * 0.7), (radius * 1.005, height * 0.5),
            (radius, height * 0.3), (radius * 0.99, height * 0.1), (radius * 0.95, height * 0.02),
            (radius * 0.9, 0.0), (radius * 0.5, 0.0), (1e-4, 0.0)]


def _sector(profile, start, end, steps=24):
    """A solid turned from `profile` [(r, z), ...] round z from angle `start` to `end` (radians): the turned skin, and
    the two flat faces where it was cut, apart, so the rind and the paste each take their own look."""
    verts, faces = [], []
    count = len(profile)
    for k in range(steps + 1):
        angle = start + (end - start) * k / steps
        for reach, z in profile:
            verts.append((reach * math.cos(angle), reach * math.sin(angle), z))
    for k in range(steps):
        for i in range(count - 1):
            corner = k * count + i
            faces.append((corner, corner + count, corner + count + 1, corner + 1))
    cut_v, cut_f = [], []
    for k, angle in ((0, start), (1, end)):
        base = len(cut_v)
        for reach, z in profile:
            cut_v.append((reach * math.cos(angle), reach * math.sin(angle), z))
        ring = list(range(base, base + count))
        cut_f.append(tuple(ring if k == 1 else reversed(ring)))
    return (verts, faces), (cut_v, cut_f)


@model
def cheeseWheel(item, words, seed):
    """A whole cheese wheel lying flat: its rounded side a deep orange rind, its top a golden rind, the light on its
    upper left. `cut` takes a wedge from its front, showing the pale paste of the two cut faces against the rinds."""
    radius, height = 0.12, 0.05
    side = Mat('si-rind', rough=0.6, spec=0.3, bump=(0.15, 90.0))
    top = Mat('si-rindTop', rough=0.65, spec=0.25)
    paste = Mat('si-cheese', rough=0.55, spec=0.35, dim=1.05)
    profile = _wheel_profile(radius, height)
    flat_top, rim, foot = profile[:3], profile[2:-2], profile[-3:]
    start, end = 0.0, 2 * math.pi
    if words.get('cut'):
        start, end = math.radians(-30), math.radians(-100) + 2 * math.pi   # the wedge taken toward the eye
        item.add(_sector(profile, start, end, steps=40)[1], paste, smooth=False)
    item.add(_sector(rim, start, end, steps=40)[0], side)
    item.add(_sector(flat_top, start, end, steps=40)[0], top, smooth=False)
    item.add(_sector(foot, start, end, steps=40)[0], side, smooth=False)


def _placed(points, offset=(0.0, 0.0, 0.0), turn=(0.0, 0.0, 0.0)):
    """Where `points` go when `shapes.moved(offset, turn)` places their part: a pattern's spots follow the part."""
    return shapes.moved(([tuple(point) for point in points], []), offset, turn)[0]


@model
def cheeseSlice(item, words, seed):
    """A wedge of hard cheese standing on its long cut face, its point to the left: its triangular face toward the eye
    and its sloping top the gold paste, its curved back at the right the rind, turned a little to the eye. `holes`
    riddles the paste with round holes, dark inside."""
    radius, thick = 0.11, 0.05
    spread = math.radians(30)
    edge = [(radius * 0.96, thick), (radius, thick * 0.86), (radius * 1.01, thick * 0.5), (radius, thick * 0.14),
            (radius * 0.96, 0.0)]
    # the wheel's own frame: its axis is the wedge's thickness, laid toward the eye; the lower cut face on the table
    place = dict(offset=(0, thick / 2, 0), turn=(90, 0, -16))
    rind, _ = _sector(edge, 0.0, spread, steps=10)
    flats = shapes.joined(_sector([(0.0, thick), (radius * 0.96, thick)], 0.0, spread, steps=10)[0],
                          _sector([(radius * 0.96, 0.0), (0.0, 0.0)], 0.0, spread, steps=10)[0])
    _, cuts = _sector([(0.0, thick)] + edge + [(0.0, 0.0)], 0.0, spread, steps=10)
    pattern = None
    if words.get('holes'):
        rng = _rng(seed)
        centres = []
        for _ in range(9):   # holes on the two triangular faces
            reach, angle = rng.uniform(0.3, 0.86) * radius, rng.uniform(0.15, 0.85) * spread
            centres.append((reach * math.cos(angle), reach * math.sin(angle), thick))
        for reach, z in ((0.42, 0.55), (0.75, 0.25), (0.68, 0.8)):   # and on the sloping top
            centres.append((reach * radius * math.cos(spread), reach * radius * math.sin(spread), z * thick))
        pattern = ('si-cheese', _spots(_placed(centres, **place), radius * 0.1), 0.42)
    paste = Mat('si-cheese', rough=0.55, spec=0.35, dim=1.04, pattern=pattern)
    item.add(shapes.moved(rind, **place), Mat('si-rind', rough=0.6, spec=0.3, bump=(0.12, 90.0)))
    item.add(shapes.moved(flats, **place), paste, smooth=False)
    item.add(shapes.moved(cuts, **place), paste, smooth=False)


def _oval_dish(length, width, depth, rim=0.012, sides=36):
    """A shallow oval dish: a turned dish of `length` across, drawn in to `width` front to back, its rim rolled."""
    radius = length / 2
    profile = [(radius - rim * 0.5, depth), (radius, depth * 0.9), (radius * 0.995, depth * 0.5),
               (radius * 0.96, 0.1 * depth), (radius * 0.9, 0.0), (1e-4, 0.0)]
    inside = [(radius - rim * 0.5, depth), (radius - rim, depth * 0.9), (radius * 0.8, depth * 0.3),
              (radius * 0.6, depth * 0.22), (1e-4, depth * 0.2)]
    outer = shapes.lathe(profile, sides, foot=True)
    inner_verts, inner_faces = shapes.lathe(inside, sides, foot=True)
    dish = shapes.joined(outer, (inner_verts, [tuple(reversed(face)) for face in inner_faces]))
    return shapes.moved(dish, scale=(1.0, width / length, 1.0))


@model
def oliveDish(item, words, seed):
    """A shallow cream-glazed dish heaped with olives, green and a few black, each glossy, a sprig of olive leaves laid
    across its back rim."""
    rng = _rng(seed)
    length, width, depth = 0.16, 0.1, 0.016
    item.add(_oval_dish(length, width, depth), Mat('ivory', rough=0.35, spec=0.5))
    green = Mat('si-olive', rough=0.3, spec=0.6)
    black = Mat('si-blackOlive', rough=0.3, spec=0.6)
    places = [(-0.046, 0.012), (-0.024, 0.02), (0.0, 0.016), (0.024, 0.02), (0.046, 0.01), (-0.036, -0.012),
              (-0.012, -0.008), (0.012, -0.01), (0.036, -0.014), (-0.004, 0.004), (0.022, 0.0), (-0.026, 0.002)]
    for k, (x, y) in enumerate(places):
        lift = 0.016 + (0.01 if abs(x) < 0.03 and abs(y) < 0.012 else 0.0)
        mat = black if k in (2, 7, 10) else green
        olive = shapes.ellipsoid((0.0125, 0.0092, 0.0092), centre=(0, 0, 0), rings=8, sides=12)
        item.add(shapes.moved(olive, offset=(x, y, lift), turn=(0, rng.uniform(-20, 20), rng.uniform(0, 180))), mat)
        if y < 0.0:
            item.sparkle((x - 0.003, y - 0.006, lift + 0.005), 'si-blackOlive' if mat is black else 'si-olive', arm=0)
    for k, swing in enumerate((-12, 18)):
        item.add(shapes.moved(_leaf(0.04, 0.007, cup=0.1), offset=(0.03 + 0.012 * k, 0.034, depth + 0.004),
                              turn=(0, 0, 160 + swing)), Mat('si-olive', rough=0.6, dim=0.8))


@model
def softCheese(item, words, seed):
    """A small round of soft cheese on a board: its white bloomy rind slumped round its edge, a wedge cut from its
    front and the pale paste bulging out of the cut."""
    radius, height = 0.06, 0.03
    profile = [(1e-4, height), (radius * 0.6, height), (radius * 0.85, height * 0.96), (radius * 0.98, height * 0.75),
               (radius * 1.03, height * 0.35), (radius * 1.02, height * 0.08), (radius * 0.96, 0.0), (1e-4, 0.0)]
    start, end = math.radians(-50), math.radians(-110) + 2 * math.pi
    skin, cuts = _sector(profile, start, end, steps=36)
    board_h = 0.012
    rind = Mat('si-cream', rough=0.8, spec=0.15, bump=(0.25, 160.0))
    item.add(shapes.moved(skin, offset=(0, 0, board_h)), rind)
    # the cut faces bulge: the paste pushed out past the rind toward the eye
    cut_v, cut_f = cuts
    bulged = []
    for x, y, z in cut_v:
        mid = math.radians(-80)
        out = 0.006 * math.sin(math.pi * min(max(z / height, 0.0), 1.0)) * min(1.0, math.hypot(x, y) / radius * 1.5)
        bulged.append((x + out * math.cos(mid), y + out * math.sin(mid), z + board_h))
    item.add((bulged, cut_f), Mat('tallow', rough=0.5, spec=0.35), smooth=False)
    board = shapes.moved(shapes.lathe([(radius * 1.45, board_h), (radius * 1.5, board_h * 0.6), (radius * 1.45, 0.0),
                                       (1e-4, 0.0)], 32), scale=(1.0, 0.75, 1.0))
    item.add(shapes.joined(board, shapes.moved(shapes.lathe([(1e-4, board_h), (radius * 1.45, board_h)], 32),
                                               scale=(1.0, 0.75, 1.0))), Mat('wood', rough=0.6, bump=(0.2, 120.0)),
             smooth=False)


@model
def porridgeBowl(item, words, seed):
    """A turned wooden bowl of porridge: its rim's lip catching the light, the oats heaped soft inside with a pool of
    honey on them, a wooden spoon standing in it, its handle to the upper right."""
    radius, height = 0.06, 0.052
    item.add(_bowl(radius, height, 0.006, foot=0.6), Mat('wood', rough=0.55, spec=0.35, bump=(0.15, 120.0), dim=1.1))
    fill = shapes.lathe([(1e-4, height * 0.9), (radius * 0.5, height * 0.86), (radius * 0.84, height * 0.77),
                         (radius - 0.005, height * 0.7)], 28, top=True)
    item.add(shapes.wobble(fill, seed, 0.03), Mat('oats', rough=0.8, bump=(0.45, 150.0)))
    item.add(shapes.ellipsoid((0.014, 0.01, 0.002), centre=(-0.01, -0.006, height * 0.895), rings=4, sides=14),
             Mat('amber', rough=0.2, spec=0.7))
    spoon = [(0.008, 0.01, height * 0.8), (0.045, 0.024, height * 1.0), (0.08, 0.034, height * 1.12)]
    item.add(_stalk(spoon, 0.0045, sides=6, radius_end=0.0055), Mat('oak', rough=0.6))
    item.add(shapes.moved(shapes.ellipsoid((0.012, 0.008, 0.003)), offset=(0.004, 0.002, height * 0.84),
                          turn=(0, -25, 33)), Mat('oak', rough=0.6))


def _pig(length, seed):
    """A roast suckling pig lying on its belly along x, its head to the right: a long round body, its snout, its ears
    laid back, its legs tucked under it."""
    body = shapes.ellipsoid((length * 0.36, length * 0.17, length * 0.14), centre=(-length * 0.04, 0, length * 0.13),
                            rings=12, sides=20)
    verts, faces = body
    shaped = []
    for x, y, z in verts:
        # flat beneath, a rounder rump, its back highest over the shoulders
        lift = max(z, length * 0.03)
        shaped.append((x, y * (1 - 0.12 * (x / length)), lift + 0.012 * math.cos(math.pi * x / length) * (z > 0.1)))
    head = shapes.ellipsoid((length * 0.13, length * 0.11, length * 0.1), centre=(length * 0.34, 0, length * 0.13))
    snout = shapes.moved(shapes.cylinder(length * 0.055, length * 0.08, sides=12, radius_end=length * 0.05),
                         offset=(length * 0.42, 0, length * 0.115))
    return shapes.wobble((shaped, faces), seed, 0.02), head, snout


@model
def roastPig(item, words, seed):
    """A roast suckling pig on an oval pewter platter: its crackling browned and glossy, its ears laid back, an apple
    in its mouth, its legs tucked, greens and two roast apples round it."""
    length = 0.33
    # a flat platter, its edge only rounded: a raised rim would hide the platter's floor in front of the pig
    tray = shapes.lathe([(1e-4, 0.01), (0.23, 0.01), (0.247, 0.008), (0.25, 0.004), (0.24, 0.0), (1e-4, 0.0)], 40)
    item.add(shapes.moved(tray, scale=(1.0, 0.5, 1.0)), Mat('pewter', rough=0.45, spec=0.45, dim=1.05))
    skin = Mat('si-roast', rough=0.35, spec=0.6, bump=(0.25, 90.0))
    body, head, snout = _pig(length, seed)
    lift = (0, 0, 0.008)
    item.add(shapes.moved(body, offset=lift), skin)
    item.add(shapes.moved(head, offset=lift), skin)
    item.add(shapes.moved(snout, offset=lift), Mat('si-roast', rough=0.4, spec=0.5, dim=0.92))
    for side in (-1, 1):
        ear = shapes.moved(_leaf(0.05, 0.024, cup=0.3), offset=(length * 0.32, side * length * 0.05, length * 0.2),
                           turn=(side * 30, -55, 180 + side * 30))
        item.add(shapes.moved(ear, offset=lift), Mat('si-roast', rough=0.4, dim=0.82))
        for x in (-length * 0.28, length * 0.16):
            leg = shapes.ellipsoid((0.04, 0.018, 0.016), centre=(x, side * length * 0.13, 0.024))
            item.add(shapes.moved(leg, offset=lift), Mat('si-roast', rough=0.4, dim=0.85))
    item.add(shapes.ellipsoid((0.022, 0.022, 0.022), centre=(length * 0.49, 0, length * 0.115 + 0.008)),
             Mat('appleRed', rough=0.3, spec=0.6))
    item.add(_stalk([(-length * 0.4, 0.0, 0.06), (-length * 0.47, -0.01, 0.075), (-length * 0.45, -0.02, 0.06)], 0.005),
             Mat('si-roast', rough=0.4, dim=0.85))
    rng = _rng(seed)
    greens = Mat('leaf', rough=0.6)
    for k in range(9):
        angle = math.pi * (0.15 + 0.7 * k / 8) + rng.uniform(-0.1, 0.1)
        x, y = 0.2 * math.cos(angle) * 1.05, -0.085 * math.sin(angle) - 0.008
        item.add(shapes.moved(_leaf(0.04, 0.016, cup=0.3), offset=(x, y, 0.01),
                              turn=(0, -10, math.degrees(angle) + 180 + rng.uniform(-30, 30))), greens)
    for x, y in ((-0.19, -0.04), (0.2, 0.03)):
        item.add(shapes.moved(_fruit(0.02, squash=0.9), offset=(x, y, 0.024)), Mat('si-russet', rough=0.4, spec=0.5))


# --- the clutter -------------------------------------------------------------------------------------------------

def _bottle_profile(radius, height, neck):
    """A wine bottle's turned outline from its lip down to its foot: a long neck widening at the shoulder."""
    return [(neck * 1.25, height), (neck * 1.25, height * 0.96), (neck, height * 0.94), (neck, height * 0.72),
            (radius * 0.75, height * 0.6), (radius, height * 0.5), (radius, 0.0)]


@model
def brokenBottles(item, words, seed):
    """Broken bottles on the floor: the foot of a brown bottle standing with its jagged break, a green bottle's neck
    and shoulder lying to its right, and broad flat shards of both glasses scattered round, a glint on each glass."""
    rng = _rng(seed)
    green = Mat('si-glassGreen', rough=0.12, spec=0.9)
    brown = Mat('si-glassBrown', rough=0.12, spec=0.9)
    # the brown bottle's foot, its break running in teeth round its top
    radius = 0.036
    verts, faces = shapes.lathe([(radius * 0.92, 0.0), (radius, 0.006), (radius, 0.02), (radius, 0.06)], 24)
    teeth = []
    for x, y, z in verts:
        if z > 0.05:
            angle = math.atan2(y, x)
            z = 0.022 + 0.032 * abs(math.sin(angle * 1.5 + 2.4)) + 0.006 * math.sin(angle * 6)
        teeth.append((x, y, z))
    inner = shapes.lathe([(radius * 0.86, 0.004), (radius * 0.88, 0.022)], 24)
    item.add(shapes.moved(shapes.joined((teeth, faces), inner), offset=(-0.05, 0.015, 0)), brown)
    item.sparkle((-0.064, -0.022, 0.03), 'glass', arm=0)
    # the green bottle's neck and shoulder, lying with its lip to the right
    neck = shapes.lathe(_bottle_profile(0.034, 0.15, 0.011)[:-1] + [(0.032, 0.062)], 18, top=True)
    item.add(shapes.moved(neck, offset=(-0.035, 0.0, 0.031), turn=(0, 90, -8)), green)
    item.sparkle((0.02, -0.03, 0.05), 'glass', arm=0)
    # the shards: broad flat pieces, jagged, tipped a little so their faces catch the light
    for k, (x, y, kind, size) in enumerate([(-0.105, -0.01, green, 0.026), (-0.08, -0.055, brown, 0.02),
                                            (0.01, -0.055, green, 0.018), (0.115, -0.03, brown, 0.022)]):
        outline = []
        for j in range(5):
            angle = 2 * math.pi * j / 5 + rng.uniform(-0.35, 0.35)
            reach = size * rng.uniform(0.6, 1.0)
            outline.append((reach * math.cos(angle) * 1.4, reach * math.sin(angle) * 0.9))
        tilt = (rng.uniform(-18, 18), rng.uniform(-12, 12), rng.uniform(0, 60))
        item.add(shapes.moved(shapes.prism(outline, 0.003), offset=(x, y, 0.004), turn=tilt), kind, smooth=False)


@model
def rollingPin(item, words, seed):
    """A wooden rolling pin lying across: its long barrel, a turned collar at each end and a handle beyond it, the
    grain running along it and the light along its top."""
    wood = Mat('pine', rough=0.5, spec=0.35, bump=(0.12, 140.0))
    dark = Mat('oak', rough=0.55, spec=0.35)
    length, radius = 0.3, 0.026
    item.add(shapes.moved(shapes.cylinder(radius, length, sides=18), offset=(-length / 2, 0, radius)), wood)
    for side in (-1, 1):
        x = side * length / 2
        collar = shapes.cylinder(radius * 0.62, 0.012, sides=14)
        handle = shapes.lathe([(radius * 0.46, 0.0), (radius * 0.52, 0.03), (radius * 0.6, 0.06),
                               (radius * 0.52, 0.075), (1e-4, 0.078)], 14, foot=True)
        handle = [(z, y, along) for along, y, z in handle[0]], handle[1]
        if side < 0:
            item.add(shapes.moved(collar, offset=(x - 0.012, 0, radius)), dark)
            item.add(shapes.moved(handle, offset=(x - 0.012, 0, radius), turn=(0, 0, 180)), dark)
        else:
            item.add(shapes.moved(collar, offset=(x, 0, radius)), dark)
            item.add(shapes.moved(handle, offset=(x + 0.012, 0, radius)), dark)


def _local(nodes, links, coord, offset=(0.0, 0.0, 0.0), turn=(0.0, 0.0, 0.0)):
    """A part's coordinates as they were before `shapes.moved(offset, turn)` placed it: the placement undone."""
    mapping = nodes.new('ShaderNodeMapping')
    mapping.vector_type = 'TEXTURE'
    mapping.inputs['Location'].default_value = offset
    mapping.inputs['Rotation'].default_value = [math.radians(degrees) for degrees in turn]
    links.new(coord, mapping.inputs['Vector'])
    return mapping.outputs['Vector']


def _letter(size, offset, turn):
    """A block's carved letter: a square ring cut in each upright face, half the face across, read in the block's
    own frame (`size` its side, placed by `offset` and `turn`)."""
    def mask(nodes, links, coord):
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(_local(nodes, links, coord, offset, turn), sep.inputs['Vector'])
        across = _op(nodes, links, 'MINIMUM', _op(nodes, links, 'ABSOLUTE', sep.outputs['X']),
                     _op(nodes, links, 'ABSOLUTE', sep.outputs['Y']))
        ring = None
        for reach in (across, _op(nodes, links, 'ABSOLUTE', sep.outputs['Z'])):
            band = _op(nodes, links, 'MULTIPLY', _op(nodes, links, 'GREATER_THAN', reach, size * 0.2),
                       _op(nodes, links, 'LESS_THAN', reach, size * 0.33))
            ring = band if ring is None else _op(nodes, links, 'MAXIMUM', ring, band)
        inside = _op(nodes, links, 'MULTIPLY', _op(nodes, links, 'LESS_THAN', across, size * 0.33),
                     _op(nodes, links, 'LESS_THAN', _op(nodes, links, 'ABSOLUTE', sep.outputs['Z']), size * 0.33))
        return _op(nodes, links, 'MULTIPLY', ring, inside)
    return mask


@model
def blockToy(item, words, seed):
    """A child's wooden blocks: a red and a blue cube side by side, a yellow one set on them, a smaller yellow one at
    the right, each upright face's letter carved as a pale square ring."""
    side = 0.04
    for colour, (x, y, z), turn, size in (('si-toyRed', (-0.022, 0.0, side / 2), -8, side),
                                          ('si-toyBlue', (0.021, 0.004, side / 2), 6, side),
                                          ('si-toyYellow', (-0.002, 0.004, side * 1.47), 14, side * 0.94),
                                          ('si-toyYellow', (0.064, -0.016, side * 0.36), -24, side * 0.72)):
        place = dict(offset=(x, y, z), turn=(0, 0, turn))
        mat = Mat(colour, rough=0.45, spec=0.4, pattern=('pine', _letter(size, **place), 1.05))
        item.add(shapes.moved(shapes.box(size, size, size), **place), mat, smooth=False, bevel=size * 0.06)


@model
def grainPile(item, words, seed):
    """A heap of threshed grain on the floor: a rounded mound slumped at its foot, its surface rough with kernels, loose
    grains and a few stalks of straw scattered at its front edge."""
    rng = _rng(seed)
    radius, height = 0.3, 0.17
    profile = []
    for i in range(15):
        share = i / 14
        z = height * (1 - share ** 2) ** 0.9 * (1 - 0.25 * share) + 0.003
        profile.append((max(radius * share, 1e-4), z))
    profile.append((radius * 1.02, 0.0))
    mound = shapes.wobble(shapes.lathe(profile, 36), seed, 0.05)
    mound = shapes.moved(mound, scale=(1.0, 0.7, 1.0))
    item.add(mound, Mat('si-grain', rough=0.85, spec=0.2, bump=(0.6, 160.0),
                        pattern=('si-grain', _blotches(60.0, 0.35), 0.74)))
    kernel = Mat('si-grain', rough=0.8, dim=1.05)
    for _ in range(10):
        angle, reach = rng.uniform(math.pi * 1.05, math.pi * 1.95), radius * rng.uniform(0.92, 1.06)
        grain = (reach * math.cos(angle), reach * math.sin(angle) * 0.7, 0.004)
        item.add(shapes.ellipsoid((0.008, 0.005, 0.005), centre=grain, rings=4, sides=8), kernel)
    straw = Mat('straw', rough=0.8)
    for k in range(3):
        angle = rng.uniform(math.pi * 1.2, math.pi * 1.8)
        x, y = radius * 0.9 * math.cos(angle), radius * 0.66 * math.sin(angle) - 0.02
        heading = rng.uniform(-0.5, 0.5)
        end = (x + 0.09 * math.cos(heading), y + 0.03 * math.sin(heading), 0.006)
        item.add(_stalk([(x, y, 0.004), end], 0.004), straw)


def _strands(nodes, links, coord):
    """Straw's strands: thin streaks running up a bundle, broken along their length."""
    stretch = _op(nodes, links, 'MULTIPLY', coord, (1.0, 1.0, 0.1), vector=True, out='Vector')
    tex = nodes.new('ShaderNodeTexNoise')
    tex.inputs['Scale'].default_value = 60.0
    tex.inputs['Detail'].default_value = 2.0
    links.new(stretch, tex.inputs['Vector'])
    return _op(nodes, links, 'GREATER_THAN', tex.outputs['Fac'], 0.53)


@model
def wheatSheaf(item, words, seed):
    """A sheaf of wheat standing on its cut stalks: the stalks bound in its middle by a twist of straw, splayed out
    below to stand on and fanning out above, a crown of golden ears along the fan's top, leaning out from its middle.
    Drawn stout: a real stalk is finer than a texel at this size, so the bundle and the ears are its mass."""
    rng = _rng(seed)
    waist, top = 0.3, 0.6
    stalks = Mat('straw', rough=0.75, spec=0.3, pattern=('straw', _strands, 0.72))
    bundle = [(0.13, top), (0.115, 0.52), (0.085, 0.42), (0.062, waist + 0.03), (0.06, waist), (0.072, 0.2),
              (0.105, 0.08), (0.13, 0.015), (0.132, 0.0)]
    item.add(shapes.moved(shapes.wobble(shapes.lathe(bundle, 18, top=True, foot=True), seed, 0.03),
                          scale=(1.0, 0.7, 1.0)), stalks)
    item.add(shapes.moved(shapes.torus(0.066, 0.018, 20, 6), offset=(0, 0, waist + 0.015), scale=(1.0, 0.75, 1.6)),
             Mat('wood', rough=0.9, bump=(0.4, 120.0)))
    # the ears: a front row and a back row between them, each ear apart from the next so the crown's edge is spiked
    ears = Mat('si-grain', rough=0.6, spec=0.35, bump=(0.35, 140.0))
    for layer, (count, depth, reach) in enumerate(((5, -0.04, 0.15), (4, 0.03, 0.11))):
        for k in range(count):
            fan = (k / (count - 1) - 0.5) * 2          # -1 at the left, 1 at the right
            lean = fan * (38 if layer == 0 else 22) + rng.uniform(-4, 4)
            base = (fan * reach * 0.75, depth, top - 0.04 + 0.03 * layer - 0.03 * abs(fan))
            ear = shapes.ellipsoid((0.022, 0.02, 0.075), centre=(0, 0, 0.07), rings=6, sides=8)
            item.add(shapes.moved(shapes.wobble(ear, seed + 9 * layer + k, 0.1, 3.0), offset=base,
                                  turn=(0, lean, 0)), ears)


def _split_log(length, radius, seed, squash=0.8):
    """A log lying along y from its cut end at y = 0, toward the eye, back: round, a little flattened by `squash`
    where the stack's weight has settled it, its bark uneven."""
    verts, faces = shapes.cylinder(radius, length, sides=14)
    verts = [(y, x, z * squash) for x, y, z in verts]
    return shapes.wobble((verts, faces), seed, 0.04)


def _end_rings(centre, spacing):
    """A log's growth rings on its cut end: circles about its heart."""
    def mask(nodes, links, coord):
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(coord, sep.inputs['Vector'])
        across = _op(nodes, links, 'SUBTRACT', sep.outputs['X'], centre[0])
        rise = _op(nodes, links, 'SUBTRACT', sep.outputs['Z'], centre[1])
        reach = _op(nodes, links, 'SQRT', _op(nodes, links, 'ADD', _op(nodes, links, 'MULTIPLY', across, across),
                                              _op(nodes, links, 'MULTIPLY', rise, rise)))
        wave = _op(nodes, links, 'SINE', _op(nodes, links, 'MULTIPLY', reach, 2 * math.pi / spacing))
        front = _op(nodes, links, 'LESS_THAN', sep.outputs['Y'], 0.004)
        return _op(nodes, links, 'MULTIPLY', _op(nodes, links, 'GREATER_THAN', wave, 0.55), front)
    return mask


@model
def logStack(item, words, seed):
    """A stack of firewood, its cut ends toward the eye: logs in three courses, four, three and one, each end pale
    wood ringed with its growth and rimmed by its bark, the logs a little uneven in length and girth."""
    rng = _rng(seed)
    radius, squash = 0.06, 0.74
    rise = radius * squash * 1.75
    for count, row in ((4, 0), (3, 1), (1, 2)):
        for k in range(count):
            x = (k - (count - 1) / 2) * radius * 2.06 + rng.uniform(-0.005, 0.005)
            log_radius = radius * (rng.uniform(0.92, 1.04) if count > 1 else 0.86)
            z = radius * squash + row * rise
            out = rng.uniform(-0.025, 0.015)
            log = _split_log(0.3, log_radius, seed + k + count * 7, squash)
            item.add(shapes.moved(log, offset=(x, out, z)), Mat('barkPine', rough=0.85, bump=(0.5, 70.0)))
            # the cut end: a disc of pale wood just proud of the bark's end, ringed about its heart
            face = shapes.moved(shapes.lathe([(1e-4, 0.0), (log_radius * 0.8, 0.0)], 16), turn=(90, 0, 0),
                                scale=(1.0, 1.0, 1.0))
            face = shapes.moved(face, offset=(x, out - 0.003, z), scale=(1.0, 1.0, 1.0))
            face = ([(face_x, face_y, z + (face_z - z) * squash) for face_x, face_y, face_z in face[0]], face[1])
            item.add(face, Mat('pine', rough=0.7, bump=(0.2, 120.0),
                               pattern=('pine', _end_rings((x, z), log_radius * 0.45), 0.72)), smooth=False)


def _facing(points, y, thick=0.002):
    """A flat shape standing square to the eye: `points` [(x, z), ...] counter-clockwise as the eye sees them, its face
    at `y`, `thick` deep behind it."""
    verts, faces = shapes.prism(points, thick)
    return [(px, y + pz, py) for px, py, pz in verts], [tuple(reversed(face)) for face in faces]


@model
def easel(item, words, seed):
    """A painter's easel: two front legs leaning together to its head and a third leg behind, a ledge across them, and
    a canvas set on the ledge with a landscape begun on it - a blue sky, green hills, a tree, a pale sun - its stretched
    cloth showing as a pale border. Seen square to its face, as a billboard stands; its legs drawn stout."""
    wood = Mat('oak', rough=0.6, spec=0.3, bump=(0.15, 60.0))
    height = 1.7
    for side in (-1, 1):
        item.add(_stalk([(side * 0.36, 0.04, 0.0), (side * 0.07, 0.04, height)], 0.03, sides=6), wood)
    item.add(_stalk([(0.0, 0.42, 0.0), (0.0, 0.08, height * 0.94)], 0.028, sides=6), Mat('oak', rough=0.6, dim=0.75))
    item.add(shapes.box(0.2, 0.06, 0.05, (0.0, 0.05, height - 0.02)), wood, smooth=False, bevel=0.006)
    # the ledge the canvas stands on
    ledge_z = 0.6
    item.add(shapes.box(0.86, 0.08, 0.05, (0.0, -0.005, ledge_z)), wood, smooth=False, bevel=0.008)
    # the canvas: its stretched cloth, pale at the border, the painting inside it
    width, tall = 0.78, 0.66
    bottom = ledge_z + 0.025
    item.add(shapes.box(width, 0.03, tall, (0.0, 0.0, bottom + tall / 2)), Mat('linen', rough=0.8), smooth=False)
    face = -0.016
    inset = 0.05
    left, right, low, high = -width / 2 + inset, width / 2 - inset, bottom + inset, bottom + tall - inset
    item.add(_facing([(left, low), (right, low), (right, high), (left, high)], face), Mat('si-sky', rough=0.8),
             smooth=False)
    hills = [(right, low)]
    for k in range(12, -1, -1):
        x = left + (right - left) * k / 12
        hills.append((x, low + 0.2 + 0.08 * math.sin(k * 0.9 + 0.4) + 0.04 * math.sin(k * 2.1)))
    hills.append((left, low))
    item.add(_facing(hills[::-1], face - 0.002), Mat('si-hill', rough=0.8), smooth=False)
    near = [(left, low), (right, low), (right, low + 0.09), (right - 0.14, low + 0.12), (left + 0.22, low + 0.06),
            (left, low + 0.1)]
    item.add(_facing(near, face - 0.004), Mat('si-hill', rough=0.8, dim=0.7), smooth=False)
    item.add(_facing([(0.12, low + 0.1), (0.155, low + 0.1), (0.155, low + 0.27), (0.12, low + 0.27)], face - 0.006),
             Mat('wood', rough=0.8), smooth=False)
    crown = [(0.137 + 0.085 * math.cos(2 * math.pi * k / 12), low + 0.32 + 0.075 * math.sin(2 * math.pi * k / 12))
             for k in range(12)]
    item.add(_facing(crown, face - 0.008), Mat('si-hill', rough=0.8, dim=0.55), smooth=False)
    sun = [(-0.17 + 0.05 * math.cos(2 * math.pi * k / 12), high - 0.1 + 0.05 * math.sin(2 * math.pi * k / 12))
           for k in range(12)]
    item.add(_facing(sun, face - 0.004), Mat('si-toyYellow', rough=0.8), smooth=False)


# --- the animals -------------------------------------------------------------------------------------------------
# Every animal is built side-on facing left (its head toward -x), z up, standing on z = 0, the eye before it at -y.
# Small parts that make the animal at this size - a beak, a comb, an eye, a leg - are drawn larger than life, as a
# painted sprite draws them, or they would fall between two texels.

def _aim(mesh, start, end):
    """A mesh built along +z from the origin, its length 1, stood at `start` and stretched to reach `end`."""
    start, end = np.asarray(start, dtype=np.float64), np.asarray(end, dtype=np.float64)
    way = end - start
    length = np.linalg.norm(way)
    direction = way / length
    z = np.array([0.0, 0.0, 1.0])
    axis = np.cross(z, direction)
    sine, cosine = np.linalg.norm(axis), float(z @ direction)
    if sine < 1e-9:
        turn = np.eye(3) if cosine > 0 else np.diag([1.0, -1.0, -1.0])
    else:
        k = axis / sine
        cross = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
        turn = np.eye(3) + sine * cross + (1 - cosine) * cross @ cross
    verts, faces = mesh
    points = np.asarray(verts, dtype=np.float64) * np.array([1.0, 1.0, length])
    return [tuple(point) for point in points @ turn.T + start], faces


def _cone(radius, tip=0.0, sides=10):
    """A cone along +z from a base of `radius` to a point (or a blunt end of `tip`), length 1."""
    return shapes.lathe([(max(tip, 1e-4), 1.0), (radius * 0.7, 0.45), (radius, 0.0)], sides, top=True, foot=True)


def _egg(radii, centre, front=1.0, back=1.0, rings=12, sides=18):
    """An ellipsoid whose -x half is grown by `front` and +x half by `back` across y and z: a breast, a rump."""
    verts, faces = shapes.ellipsoid(radii, rings=rings, sides=sides)
    out = []
    for x, y, z in verts:
        grow = front if x < 0 else back
        girth = 1 + (grow - 1) * min(1.0, abs(x) / radii[0])
        out.append((centre[0] + x, centre[1] + y * girth, centre[2] + z * girth))
    return out, faces


def _sawtooth(points_x, low, high, thick, y=0.0):
    """A comb or a crest: a flat serrated shape in the xz plane, its teeth at `points_x` rising to `high`, its notches
    at `low`, `thick` across in y."""
    outline = [(points_x[0], low[0])]
    for k, x in enumerate(points_x):
        outline.append((x, high[k]))
        if k + 1 < len(points_x):
            outline.append(((x + points_x[k + 1]) / 2, low[1]))
    outline.append((points_x[-1], low[0]))
    verts, faces = shapes.prism(outline[::-1], thick)
    return [(px, y + pz - thick / 2, py) for px, py, pz in verts], faces


def _bars(axis_index, places, half):
    """Bars across a part where its coordinate `axis_index` (0 x, 2 z) lies within `half` of one of `places` (a dove's
    wing bars)."""
    which = 'XYZ'[axis_index]

    def mask(nodes, links, coord):
        value = _axis(nodes, links, coord, which)
        apart = [_op(nodes, links, 'ABSOLUTE', _op(nodes, links, 'SUBTRACT', value, place)) for place in places]
        found = [_op(nodes, links, 'LESS_THAN', gap, half) for gap in apart]
        return _any(nodes, links, found)
    return mask


def _below(z):
    """Under a height `z` (a bird's dark tail tip, a sheep's legs below its fleece)."""
    def mask(nodes, links, coord):
        return _op(nodes, links, 'LESS_THAN', _axis(nodes, links, coord, 'Z'), z)
    return mask


def _beyond_x(x):
    """Past `x` along the body toward the tail."""
    def mask(nodes, links, coord):
        return _op(nodes, links, 'GREATER_THAN', _axis(nodes, links, coord, 'X'), x)
    return mask


# --- the chickens ---

CHICKEN_POSES = {
    # head centre, how far the body pitches forward (degrees), the beak's way (x, y, z)
    'stand': {'head': (-0.125, -0.005, 0.33), 'pitch': -14, 'beak': (-1.0, 0.0, -0.15)},
    'peck': {'head': (-0.175, -0.01, 0.06), 'pitch': 14, 'beak': (-0.35, 0.0, -1.0)},
    'look': {'head': (-0.1, -0.02, 0.37), 'pitch': -22, 'beak': (-0.45, -0.85, 0.05)},
}


@model
def chicken(item, words, seed):
    """A chicken side-on, facing left: its plump body tipped up to its tail, its folded wing, its neck and small head
    with the red comb and wattles, a yellow beak and a dark eye, standing on two yellow legs with spread toes.
    `feathers` 'brown' (a red-brown hen flecked darker, her wing darker still) or 'white'; `pose` 'stand', 'peck' (the
    head down at the ground, the tail tipped up) or 'look' (the neck stretched up, the head turned to the eye);
    `rooster` a cock: a tall comb and long wattles, gold hackles over his neck and back, and high arching sickle
    feathers in his tail, dark on a brown bird."""
    pose = CHICKEN_POSES[words.get('pose', 'stand')]
    rooster = words.get('rooster', False)
    white = words.get('feathers', 'brown') == 'white'
    base = 'si-white' if white else 'si-hen'
    spots = [] if white else [('si-henDark', _blotches(150.0, 0.14), 1.1)]
    plumage = Mat(base, rough=0.75, spec=0.25, bump=(0.3, 90.0), pattern=spots or None)
    wing_mat = Mat(base, rough=0.75, spec=0.25, bump=(0.3, 90.0), dim=0.95 if white else 1.0,
                   pattern=None if white else [('si-henDark', _beyond_x(0.03), 1.0)])
    hackle = Mat('si-white' if white else 'si-beak', rough=0.7, spec=0.3, bump=(0.4, 120.0),
                 dim=1.0 if white else 0.92)
    tail_mat = Mat('si-white' if white else ('si-tail' if rooster else 'si-henDark'), rough=0.5 if rooster else 0.7,
                   spec=0.5 if rooster else 0.25, dim=0.92 if white else 1.0)
    red = Mat('si-comb', rough=0.5, spec=0.4)
    yellow = Mat('si-beak', rough=0.5, spec=0.4)
    pitch = pose['pitch']
    body_at = dict(offset=(0.0, 0.0, 0.2), turn=(0, pitch, 0))
    body = _egg((0.125, 0.085, 0.09), (0.0, 0.0, 0.0), front=1.12, back=0.92)
    item.add(shapes.moved(body, **body_at), plumage)
    # the wing, folded along the near flank
    wing = shapes.ellipsoid((0.085, 0.03, 0.05), centre=(0.025, -0.07, 0.01), rings=8, sides=12)
    item.add(shapes.moved(shapes.moved(wing, turn=(0, -10, 0)), **body_at), wing_mat)
    # the tail: a hen's short fan raised behind; a cock's sickles arching high and falling
    root = np.asarray(shapes.moved(([(0.105, 0.0, 0.045)], []), **body_at)[0][0])
    if rooster:
        for rise, reach, drop, across in ((0.16, 0.1, 0.07, -0.012), (0.13, 0.12, 0.1, 0.0), (0.1, 0.12, 0.12, 0.012)):
            steps = ((0.0, across, 0.0), (0.03, across, rise * 0.75), (0.07, across, rise),
                     (reach, across, rise * 0.75), (reach + 0.012, across, rise - drop))
            arc = [tuple(root + step) for step in steps]
            item.add(shapes.tube(arc, 0.016, sides=6, radius_end=0.006), tail_mat)
        item.add(shapes.ellipsoid((0.05, 0.03, 0.05), centre=tuple(root + (0.0, 0.0, 0.03))), tail_mat)
    else:
        # a wedge of tail feathers raised steep behind, flat across, its tip pointed up and back
        fan = shapes.ellipsoid((0.045, 0.024, 0.085), centre=(0.0, 0.0, 0.0), rings=8, sides=10)
        item.add(shapes.moved(fan, offset=tuple(root + (0.025, 0.0, 0.045)), turn=(0, 28, 0)), tail_mat)
    # the neck: from the shoulders to the head, the hackles over it
    head = np.asarray(pose['head'])
    shoulder = np.asarray(shapes.moved(([(-0.085, 0.0, 0.05)], []), **body_at)[0][0])
    mid = (shoulder + head) / 2 + np.array([0.012, 0.0, 0.0])
    item.add(shapes.tube([tuple(shoulder), tuple(mid), tuple(head)], 0.045, sides=10, radius_end=0.03),
             hackle if rooster else plumage)
    if rooster:   # the saddle's gold over his back
        item.add(shapes.moved(shapes.ellipsoid((0.06, 0.06, 0.03), centre=(0.035, 0.0, 0.075)), **body_at), hackle)
    item.add(shapes.ellipsoid((0.04, 0.034, 0.038), centre=tuple(head), rings=8, sides=12), plumage)
    # the beak, the eye, the comb and the wattles, turned with the head: `crown` the way the top of its head faces
    look = np.asarray(pose['beak'], dtype=np.float64)
    look /= np.linalg.norm(look)
    crown = np.array([0.0, 0.0, 1.0]) - look[2] * look
    crown /= np.linalg.norm(crown)
    item.add(_aim(_cone(0.012, sides=8), head + look * 0.026, head + look * 0.056), yellow)
    cheek = np.array([-look[1], look[0], 0.0])
    cheek = cheek / np.linalg.norm(cheek) if np.linalg.norm(cheek) > 1e-6 else np.array([0.0, -1.0, 0.0])
    if cheek[1] > 0:
        cheek = -cheek
    eye = head + look * 0.012 + cheek * 0.026 + crown * 0.008
    item.add(shapes.ellipsoid((0.0085, 0.006, 0.0085), centre=tuple(eye), rings=4, sides=8),
             Mat('charcoal', rough=0.3, spec=0.6))
    teeth = 5 if rooster else 3
    tall = 0.05 if rooster else 0.034
    peaks = [tall * (0.75 + 0.25 * math.sin(math.pi * (k + 0.5) / teeth)) for k in range(teeth)]
    comb_verts, comb_faces = _sawtooth([0.02 - 0.016 * k for k in range(teeth)], (0.0, tall * 0.45), peaks, 0.016)
    # the comb laid along the crown: its front toward the beak, its teeth up out of the head
    frame = np.stack([look, np.cross(crown, look), crown], axis=1)
    top = head + crown * 0.03
    item.add(([tuple(top + frame @ np.array(vertex)) for vertex in comb_verts], comb_faces), red, smooth=False)
    chin = head + look * 0.02 - crown * (0.03 if rooster else 0.024)
    item.add(shapes.ellipsoid((0.012, 0.007, 0.022 if rooster else 0.013), centre=tuple(chin)), red)
    # the legs: from under the body to the ground, scaled yellow, three toes forward and one back
    for x, y in ((-0.03, -0.03), (0.03, 0.03)):
        hip = np.asarray(shapes.moved(([(x, y, -0.06)], []), **body_at)[0][0]) + np.array([0.0, 0.0, 0.02])
        foot = np.array([hip[0], y, 0.008])
        item.add(shapes.tube([tuple(hip), tuple(foot)], 0.012, sides=6), yellow)
        for toe in ((-0.045, 0.0), (-0.035, -0.02), (0.02, 0.0)):
            item.add(shapes.tube([tuple(foot), tuple(foot + np.array([toe[0], toe[1], -0.003]))], 0.006, sides=5),
                     yellow)


# --- the rock doves ---

@model
def dove(item, words, seed):
    """A rock dove side-on, facing left: its plump grey breast and body, a darker head on a short neck with its green
    sheen, two black bars across the folded wing and a dark band at the tail's tip, a dark beak with its pale cere, a
    red eye-ring and pink-red feet. `pose` 'stand', 'peck' (the head down at the ground) or 'wing' (the far wing raised
    high over the back, half open, the near one lifted)."""
    pose = words.get('pose', 'stand')
    grey = Mat('si-dove', rough=0.9, spec=0.15)
    wing_mat = Mat('si-dove', rough=0.7, spec=0.3, dim=1.08,
                   pattern=[('si-dove', _bars(0, (0.05,), 0.012), 0.62), ('si-dove', _beyond_x(0.09), 0.7)])
    tail_mat = Mat('si-dove', rough=0.7, spec=0.3, dim=0.9, pattern=('si-doveDark', _beyond_x(0.125), 1.0))
    peck = pose == 'peck'
    pitch = 18 if peck else -6
    body_at = dict(offset=(0.01, 0.0, 0.11), turn=(0, pitch, 0))
    item.add(shapes.moved(_egg((0.078, 0.055, 0.066), (0.0, 0.0, 0.0), front=1.1, back=0.85), **body_at), grey)
    # the tail: a flat fan off the rump, its tip dark
    tail = shapes.moved(shapes.ellipsoid((0.045, 0.03, 0.018), centre=(0.0, 0.0, 0.0)), offset=(0.095, 0.0, 0.015),
                        turn=(0, -12, 0))
    item.add(shapes.moved(tail, **body_at), tail_mat)
    # the folded near wing, barred
    wing = shapes.ellipsoid((0.075, 0.02, 0.042), centre=(0.03, -0.042, 0.012), rings=8, sides=12)
    if pose == 'wing':
        wing = shapes.moved(wing, offset=(0.0, 0.0, 0.0), turn=(-18, -14, 0))
    item.add(shapes.moved(wing, **body_at), wing_mat)
    if pose == 'wing':
        # the far wing raised high over the back, half open: a broad feathered blade, its primaries dark
        blade = [(-0.05, 0.0), (0.05, 0.0), (0.095, 0.03), (0.11, 0.07), (0.07, 0.08), (0.02, 0.06), (-0.03, 0.025)]
        verts, faces = shapes.prism(blade[::-1], 0.01)
        raised = [(px, 0.025 + pz, py + 0.045) for px, py, pz in verts], [tuple(reversed(face)) for face in faces]
        item.add(shapes.moved(raised, **body_at),
                 Mat('si-dove', rough=0.7, spec=0.3, dim=0.95,
                     pattern=[('si-doveDark', _bars(0, (0.03, 0.055), 0.008), 1.0),
                              ('si-dove', _beyond_x(0.075), 0.6)]), smooth=False)
    # the head, set low on the breast as a dove holds it, the green sheen of its neck below it; a little toward the
    # eye of the body's middle, so it is seen beside the breast and never sunk behind it
    head = np.array([-0.072, -0.022, 0.178]) if not peck else np.array([-0.1, -0.024, 0.05])
    sheen = head[2] - 0.016 if not peck else head[2] + 0.02
    neck_mat = Mat('si-dove', rough=0.6, spec=0.4, dim=0.8, pattern=('si-sheen', _below(sheen), 1.0))
    if peck:   # the neck bent down to the ground, its sheen on it, the head grey below
        neck = np.asarray(shapes.moved(([(-0.065, -0.02, 0.02)], []), **body_at)[0][0])
        item.add(shapes.tube([tuple(neck), tuple(head + np.array([0.01, 0.0, 0.02]))], 0.036, sides=10),
                 Mat('si-sheen', rough=0.5, spec=0.5))
        neck_mat = Mat('si-dove', rough=0.6, spec=0.4, dim=0.8)
    item.add(shapes.ellipsoid((0.052, 0.046, 0.05), centre=tuple(head), rings=8, sides=12), neck_mat)
    look = np.array([-1.0, 0.0, -0.15]) if not peck else np.array([-0.3, 0.0, -1.0])
    look /= np.linalg.norm(look)
    item.add(_aim(_cone(0.014, tip=0.004, sides=6), head + look * 0.036, head + look * 0.072),
             Mat('si-doveDark', rough=0.4))
    item.add(shapes.ellipsoid((0.009, 0.008, 0.008), centre=tuple(head + look * 0.04 + np.array([0, 0, 0.011]))),
             Mat('si-white', rough=0.6))
    eye = head + look * 0.012 + np.array([0.0, -0.04, 0.012])
    item.add(shapes.ellipsoid((0.009, 0.006, 0.009), centre=tuple(eye)), Mat('si-comb', rough=0.4, dim=0.6))
    # the feet, pink-red, under the breast
    for x, y in ((-0.015, -0.02), (0.012, 0.02)):
        hip = np.asarray(shapes.moved(([(x, y, -0.04)], []), **body_at)[0][0])
        item.add(shapes.tube([tuple(hip), (hip[0], y, 0.008)], 0.01, sides=5), Mat('si-feet', rough=0.5))
        item.add(shapes.tube([(hip[0], y, 0.008), (hip[0] - 0.024, y, 0.006)], 0.008, sides=5),
                 Mat('si-feet', rough=0.5))


# --- the rats ---

@model
def rat(item, words, seed):
    """A rat side-on, facing left: its long low body full at the haunch, a pointed snout with a pink nose and a dark
    bead of an eye, round pink-lined ears, small pink feet and a long bare tail trailing behind in a curve. `fur`
    'brown' or 'black'; `pose` 'run' (low on all fours) or 'sit' (up on its haunches, its forepaws held at its chest,
    its tail curled on the ground)."""
    fur = Mat('si-ratBlack' if words.get('fur') == 'black' else 'si-ratBrown', rough=0.75, spec=0.3, bump=(0.3, 160.0))
    pink = Mat('pink', rough=0.5, spec=0.35)
    sitting = words.get('pose') == 'sit'
    if sitting:
        body = _egg((0.045, 0.04, 0.06), (0.0, 0.0, 0.0), front=0.92, back=1.0)
        item.add(shapes.moved(body, offset=(0.005, 0.0, 0.062), turn=(0, -18, 0)), fur)
        item.add(shapes.ellipsoid((0.04, 0.038, 0.03), centre=(0.022, 0.0, 0.03)), fur)   # the haunches
        head, look = np.array([-0.018, -0.006, 0.128]), np.array([-0.85, 0.0, 0.35])
        tail = [(0.05, 0.0, 0.01), (0.08, -0.01, 0.006), (0.1, -0.03, 0.005), (0.09, -0.06, 0.005),
                (0.06, -0.07, 0.005)]
        for y in (-0.02, 0.02):   # the forepaws at the chest
            item.add(shapes.tube([(-0.03, y, 0.08), (-0.045, y - 0.006, 0.07), (-0.045, y - 0.008, 0.062)], 0.008,
                                 sides=5), pink)
        feet = [(0.0, -0.025), (0.004, 0.025)]
    else:
        body = _egg((0.075, 0.042, 0.048), (0.0, 0.0, 0.0), front=0.85, back=1.1)
        item.add(shapes.moved(body, offset=(0.0, 0.0, 0.056), turn=(0, -6, 0)), fur)
        head, look = np.array([-0.078, -0.008, 0.058]), np.array([-1.0, 0.0, -0.15])
        tail = [(0.07, 0.0, 0.034), (0.1, -0.005, 0.018), (0.13, -0.012, 0.01), (0.16, -0.02, 0.01),
                (0.185, -0.03, 0.016)]
        feet = [(-0.05, -0.02), (0.045, -0.02), (-0.045, 0.02), (0.05, 0.02)]
    look /= np.linalg.norm(look)
    item.add(shapes.ellipsoid((0.032, 0.028, 0.03), centre=tuple(head), rings=8, sides=12), fur)
    item.add(_aim(_cone(0.02, tip=0.006, sides=8), head + look * 0.012, head + look * 0.05), fur)
    item.add(shapes.ellipsoid((0.007, 0.007, 0.007), centre=tuple(head + look * 0.05)), pink)
    item.add(shapes.ellipsoid((0.006, 0.004, 0.006), centre=tuple(head + look * 0.012 + np.array([0.0, -0.024, 0.01]))),
             Mat('charcoal', rough=0.2, spec=0.8))
    for k, y in enumerate((-0.018, 0.018)):
        ear = head - look * 0.014 + np.array([0.0, y, 0.03])
        item.add(shapes.moved(shapes.ellipsoid((0.016, 0.005, 0.018)), offset=tuple(ear), turn=(0, -15, 0)),
                 pink if k == 0 else fur)
    item.add(shapes.tube(tail, 0.012, sides=6, radius_end=0.007), pink)
    for x, y in feet:
        item.add(shapes.ellipsoid((0.012, 0.006, 0.005), centre=(x - 0.004, y, 0.005)), pink)


# --- the sheep ---

def _fleece(radii, centre, seed, lumps=0.07):
    """A fleece: an ellipsoid grown into soft lumps of wool, deterministic in `seed`."""
    body = shapes.ellipsoid(radii, centre=centre, rings=16, sides=24)
    return shapes.wobble(body, seed, lumps, scale=2.6)


def _sheep_head(item, poll, look, face, wool, scale=1.0):
    """A sheep's long dark face from its poll at `at` along `look` (its muzzle's way): its muzzle, its eyes, its ears
    out sideways and a tuft of fleece on its poll."""
    look = np.asarray(look, dtype=np.float64)
    look /= np.linalg.norm(look)
    poll = np.asarray(poll, dtype=np.float64)
    skull = _aim(shapes.lathe([(0.04 * scale, 1.0), (0.068 * scale, 0.7), (0.075 * scale, 0.35), (0.07 * scale, 0.0)],
                              12, top=True, foot=True), poll - look * 0.04 * scale, poll + look * 0.2 * scale)
    item.add(skull, face)
    side = np.cross(look, np.array([0.0, 0.0, 1.0]))
    if np.linalg.norm(side) < 1e-6:
        side = np.array([1.0, 0.0, 0.0])
    side /= np.linalg.norm(side)
    for k in (-1, 1):
        root = poll + side * k * 0.06 * scale + np.array([0.0, 0.0, 0.03 * scale])
        tip = root + side * k * 0.09 * scale - look * 0.02 * scale - np.array([0.0, 0.0, 0.01 * scale])
        item.add(_aim(shapes.ellipsoid((0.022 * scale, 0.012 * scale, 0.5), centre=(0, 0, 0.5)), root, tip), face)
        eye = poll + look * 0.05 * scale + side * k * 0.066 * scale + np.array([0.0, 0.0, 0.028 * scale])
        item.add(shapes.ellipsoid((0.012 * scale,) * 3, centre=tuple(eye)), Mat('si-white', rough=0.4, dim=0.9))
    item.add(shapes.ellipsoid((0.07 * scale, 0.07 * scale, 0.045 * scale),
                              centre=tuple(poll - look * 0.025 * scale + np.array([0.0, 0.0, 0.05 * scale]))), wool)


@model
def sheep(item, words, seed):
    """A sheep: a deep fleece of cream wool in soft lumps, a long black face with its ears out to the sides and a tuft
    of wool on its poll, thin black legs. `pose` 'side' (standing, side-on, facing left), 'front' (standing, its face
    to the eye, its body behind it) or 'rest' (lying with its legs folded under it, its head up, facing left)."""
    pose = words.get('pose', 'side')
    wool = Mat('si-fleece', rough=0.9, spec=0.15, bump=(0.6, 30.0), pattern=('si-fleece', _blotches(16.0, 0.32), 0.8))
    face = Mat('si-face', rough=0.6, spec=0.3)
    legs = Mat('si-face', rough=0.6, spec=0.25, dim=0.9)
    turn = (0, 0, 90) if pose == 'front' else (0, 0, 0)
    rest = pose == 'rest'
    body_z = 0.26 if rest else 0.6
    radii = (0.48, 0.3, 0.24 if rest else 0.29)
    fleece = _fleece(radii, (0.04, 0.0, body_z), seed)
    if rest:   # its belly settled flat on the ground
        verts, faces = fleece
        fleece = ([(x, y, max(z, 0.04 + 0.03 * (abs(x) / 0.5) ** 2)) for x, y, z in verts], faces)
    item.add(shapes.moved(fleece, turn=turn), wool)
    item.add(shapes.moved(_fleece((0.06, 0.06, 0.08), (0.5, 0.0, body_z + 0.05), seed + 3), turn=turn), wool)
    # the head held out before the fleece and a little toward the eye, so its dark face is never lost in the wool
    poll = np.array([-0.5, -0.08, body_z + 0.16]) if not rest else np.array([-0.48, -0.1, body_z + 0.12])
    look = (-0.8, -0.1, -0.55)
    if pose == 'front':
        poll, look = np.array([0.0, -0.42, body_z + 0.14]), (0.0, -0.72, -0.69)
    _sheep_head(item, poll, look, face, wool, scale=1.5)
    # the neck's wool joining head to body
    neck_from = np.array([-0.3, 0.0, body_z + 0.06]) if pose != 'front' else np.array([0.0, -0.24, body_z + 0.06])
    item.add(shapes.tube([tuple(neck_from), tuple(poll - np.asarray(look) * 0.02)], 0.13, sides=12), wool)
    if rest:   # the forelegs folded under the breast, a knee showing
        for x, y in ((-0.3, -0.14), (0.35, -0.2)):
            item.add(shapes.tube([(x, y, 0.06), (x - 0.12, y - 0.02, 0.05)], 0.04, sides=6), legs)
        return
    for x, y in ((-0.28, -0.12), (-0.22, 0.13), (0.32, -0.13), (0.38, 0.12)):
        leg = shapes.tube([(x, y, body_z - 0.2), (x, y, 0.02)], 0.034, sides=6, radius_end=0.03)
        item.add(shapes.moved(leg, turn=turn), legs)


# --- the monkey ---

@model
def sittingMonkey(item, words, seed):
    """A small monkey sitting up and facing out: its brown furred body and round head, a pale bare face with dark eyes
    and a muzzle, pale ears out at the sides, its long arms down to its hands on its knees, its feet before it and its
    tail curling up beside it."""
    fur = Mat('si-monkey', rough=0.8, spec=0.25, bump=(0.35, 90.0))
    skin = Mat('si-skin', rough=0.55, spec=0.35)
    item.add(_egg((0.085, 0.075, 0.11), (0.0, 0.01, 0.12), front=1.0, back=1.0), fur)   # the body
    for k in (-1, 1):
        # the thighs drawn up before it, the feet on the ground, the hands on the knees
        knee = np.array([k * 0.06, -0.09, 0.08])
        item.add(shapes.tube([(k * 0.05, -0.01, 0.05), tuple(knee)], 0.04, sides=8), fur)
        item.add(shapes.tube([tuple(knee), (k * 0.07, -0.11, 0.015)], 0.028, sides=8), fur)
        item.add(shapes.ellipsoid((0.024, 0.04, 0.014), centre=(k * 0.075, -0.13, 0.012)), skin)
        shoulder = np.array([k * 0.08, -0.01, 0.19])
        elbow = np.array([k * 0.105, -0.05, 0.11])
        item.add(shapes.tube([tuple(shoulder), tuple(elbow), tuple(knee + np.array([k * 0.01, -0.02, 0.025]))], 0.026,
                             sides=8), fur)
        item.add(shapes.ellipsoid((0.022, 0.018, 0.016), centre=tuple(knee + np.array([k * 0.012, -0.03, 0.03]))), skin)
    head = np.array([0.0, -0.01, 0.285])
    item.add(shapes.ellipsoid((0.068, 0.062, 0.064), centre=tuple(head)), fur)
    item.add(shapes.ellipsoid((0.048, 0.03, 0.05), centre=tuple(head + np.array([0.0, -0.04, -0.008]))), skin)
    item.add(shapes.ellipsoid((0.03, 0.022, 0.02), centre=tuple(head + np.array([0.0, -0.066, -0.03]))), skin)
    for k in (-1, 1):
        item.add(shapes.ellipsoid((0.011, 0.006, 0.011), centre=tuple(head + np.array([k * 0.02, -0.068, 0.006]))),
                 Mat('charcoal', rough=0.2, spec=0.8))
        item.add(shapes.ellipsoid((0.016, 0.01, 0.022), centre=tuple(head + np.array([k * 0.07, -0.0, 0.0]))), skin)
    # the brow's fur over the face
    item.add(shapes.ellipsoid((0.055, 0.03, 0.018), centre=tuple(head + np.array([0.0, -0.04, 0.04]))), fur)
    tail = [(0.06, 0.06, 0.03), (0.13, 0.04, 0.02), (0.17, 0.0, 0.07), (0.16, -0.02, 0.15), (0.13, -0.02, 0.2),
            (0.11, -0.03, 0.18)]
    item.add(shapes.tube(tail, 0.017, sides=8, radius_end=0.012), fur)
