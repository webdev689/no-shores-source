"""The goods: bottles, tins, bags and boxes, tools and kits, books and papers, the gate's spoils and keepsakes."""
import math

import numpy as np

from . import shapes
from .kit import ELEVATION, Mat
from .models import model

BOX_TURN = 24.0     # degrees a box is turned, so its long front faces the eye's right and its short end the left
KNIFE_LIE = 50.0    # a knife lies steeper than a log, so a thin thing fills its small square picture
# a part one texel thin is all edge, and the kit sinks an edge away from the light to its ramp's darkest: a whisper of
# glow keeps a chain, a fishing line or a spoke its own colour
THIN = 0.03


def _brass(dim=1.0):
    return Mat('brass', rough=0.3, metal=0.25, spec=0.8, dim=dim)


def _iron(dim=1.0):
    return Mat('iron', rough=0.45, metal=0.2, spec=0.6, dim=dim)


def _turned(mesh, angle, offset=(0.0, 0.0, 0.0)):
    """The mesh turned `angle` degrees about z, then moved."""
    return shapes.moved(mesh, offset=offset, turn=(0.0, 0.0, angle))


def _point(point, turn, offset=(0.0, 0.0, 0.0)):
    """Where one point goes when its model is turned by `turn` (degrees about x, then y, then z) and moved."""
    return shapes.moved(([point], []), offset=offset, turn=turn)[0][0]


def _teardrop(height, width, base=(0.0, 0.0, 0.0), sides=10):
    """A flame: round at its foot, drawn up to a point."""
    profile = [(0.0001, height), (width * 0.35, height * 0.72), (width * 0.85, height * 0.38), (width, height * 0.2),
               (width * 0.7, height * 0.05), (0.0001, 0.0)]
    verts, faces = shapes.lathe(profile, sides, top=True, foot=True)
    return [(x + base[0], y + base[1], z + base[2]) for x, y, z in verts], faces


def _arc(centre, radii, start, end, count):
    """Points along an ellipse's arc from angle `start` to `end` (radians), upright in x and z through `centre`."""
    cx, cy, cz = centre
    return [(cx + radii[0] * math.cos(t), cy, cz + radii[1] * math.sin(t)) for t in np.linspace(start, end, count)]


def _path_point(path, distance):
    """The point `distance` along a path [(y, z), ...]."""
    pts = np.asarray(path, dtype=np.float64)
    run = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    return float(np.interp(distance, run, pts[:, 0])), float(np.interp(distance, run, pts[:, 1]))


def _drape_length(x, width, side, middle, tongue=0.36):
    """How far down its path a flap reaches at `x`: `side` at its edges, `middle` at the tip of its rounded tongue."""
    share = math.sqrt(max(0.0, 1 - (x / (tongue * width)) ** 2))
    return side + (middle - side) * share


def _drape(width, path, side, middle, columns=20, rows=12):
    """A flap of leather laid over a bag: `path` [(y, z), ...] its middle line from where it starts at the back, laid
    `width` across in x; it reaches `side` down the path at its edges and `middle` at its tongue's tip."""
    verts = []
    for i in range(columns + 1):
        x = (i / columns - 0.5) * width
        length = _drape_length(x, width, side, middle)
        for j in range(rows + 1):
            y, z = _path_point(path, length * j / rows)
            verts.append((x, y, z))
    faces = [(i * (rows + 1) + j, (i + 1) * (rows + 1) + j, (i + 1) * (rows + 1) + j + 1, i * (rows + 1) + j + 1)
             for i in range(columns) for j in range(rows)]
    return verts, faces


def _bent_plank(points, width, thick):
    """A plank bent along `points` [(x, z), ...] upright through y = 0: `width` deep in y, `thick` across its bend."""
    pts = np.asarray(points, dtype=np.float64)
    count = len(pts)
    verts = []
    for i in range(count):
        tangent = pts[min(i + 1, count - 1)] - pts[max(i - 1, 0)]
        tangent /= np.linalg.norm(tangent)
        normal = np.array([-tangent[1], tangent[0]])
        for out, deep in ((1, -1), (1, 1), (-1, 1), (-1, -1)):
            x, z = pts[i] + normal * out * thick / 2
            verts.append((x, deep * width / 2, z))
    faces = [(i * 4 + k, i * 4 + (k + 1) % 4, (i + 1) * 4 + (k + 1) % 4, (i + 1) * 4 + k)
             for i in range(count - 1) for k in range(4)]
    last = (count - 1) * 4
    faces += [(3, 2, 1, 0), (last, last + 1, last + 2, last + 3)]
    return verts, faces


# --- the masks a pattern takes: node sockets over a part's coordinates, in metres ---

def _math(nodes, links, op, first, second=None):
    """A math node `op` over `first` and `second` (each a socket or a number)."""
    node = nodes.new('ShaderNodeMath')
    node.operation = op
    for slot, value in ((0, first), (1, second)):
        if value is None:
            continue
        if isinstance(value, (int, float)):
            node.inputs[slot].default_value = value
        else:
            links.new(value, node.inputs[slot])
    return node.outputs['Value']


def _dot(nodes, links, coord, direction, origin=(0.0, 0.0, 0.0)):
    """How far along `direction` a point lies from `origin`."""
    rel = nodes.new('ShaderNodeVectorMath')
    rel.operation = 'SUBTRACT'
    links.new(coord, rel.inputs[0])
    rel.inputs[1].default_value = origin
    dot = nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    links.new(rel.outputs['Vector'], dot.inputs[0])
    dot.inputs[1].default_value = direction
    return dot.outputs['Value']


def _from_axis(nodes, links, coord, origin, axis):
    """How far a point lies from the line through `origin` along unit `axis`."""
    rel = nodes.new('ShaderNodeVectorMath')
    rel.operation = 'SUBTRACT'
    links.new(coord, rel.inputs[0])
    rel.inputs[1].default_value = origin
    cross = nodes.new('ShaderNodeVectorMath')
    cross.operation = 'CROSS_PRODUCT'
    links.new(rel.outputs['Vector'], cross.inputs[0])
    cross.inputs[1].default_value = axis
    length = nodes.new('ShaderNodeVectorMath')
    length.operation = 'LENGTH'
    links.new(cross.outputs['Vector'], length.inputs[0])
    return length.outputs['Value']


def _between(nodes, links, value, low, high):
    return _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'GREATER_THAN', value, low),
                 _math(nodes, links, 'LESS_THAN', value, high))


def _band(direction, low, high, origin=(0.0, 0.0, 0.0)):
    """A band across a part: where a point lies between `low` and `high` along `direction`."""
    def mask(nodes, links, coord):
        return _between(nodes, links, _dot(nodes, links, coord, direction, origin), low, high)
    return mask


def _lines(direction, spacing, width, origin=(0.0, 0.0, 0.0)):
    """Lines across a part every `spacing` along `direction`, `width` wide: the gaps between boards, a grain."""
    def mask(nodes, links, coord):
        along = _dot(nodes, links, coord, direction, origin)
        frac = _math(nodes, links, 'FRACT', _math(nodes, links, 'DIVIDE', along, spacing))
        return _math(nodes, links, 'LESS_THAN', frac, width / spacing)
    return mask


def _ring(origin, axis, low, high):
    """A ring round the line through `origin` along `axis`, from `low` to `high` from it: a groove on a lid."""
    def mask(nodes, links, coord):
        return _between(nodes, links, _from_axis(nodes, links, coord, origin, axis), low, high)
    return mask


def _coil(origin, axis, gap, width):
    """Rings round an axis every `gap`, `width` wide: a rolled blanket's end, a coil of rope."""
    def mask(nodes, links, coord):
        dist = _from_axis(nodes, links, coord, origin, axis)
        frac = _math(nodes, links, 'FRACT', _math(nodes, links, 'DIVIDE', dist, gap))
        return _math(nodes, links, 'LESS_THAN', frac, width / gap)
    return mask


def _ticks(count):
    """Upright ticks round a pot's axis, `count` a turn: the figures painted in its band."""
    def mask(nodes, links, coord):
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(coord, sep.inputs['Vector'])
        angle = _math(nodes, links, 'ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
        turns = _math(nodes, links, 'MULTIPLY', angle, count / (2 * math.pi))
        return _math(nodes, links, 'GREATER_THAN', _math(nodes, links, 'FRACT', turns), 0.4)
    return mask


def _weave(scale):
    """A basket's weave: a checker of crossing withies, `scale` checks a metre."""
    def mask(nodes, links, coord):
        checker = nodes.new('ShaderNodeTexChecker')
        checker.inputs['Scale'].default_value = scale
        links.new(coord, checker.inputs['Vector'])
        return checker.outputs['Factor']
    return mask


def _mottle(scale, over):
    """Patches where a noise rises past `over`: burlap's uneven weave, worn leather."""
    def mask(nodes, links, coord):
        noise = nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = scale
        noise.inputs['Detail'].default_value = 1.0
        links.new(coord, noise.inputs['Vector'])
        return _math(nodes, links, 'GREATER_THAN', noise.outputs['Fac'], over)
    return mask


def _either(*masks):
    """Where any of the masks shows."""
    def mask(nodes, links, coord):
        out = masks[0](nodes, links, coord)
        for other in masks[1:]:
            out = _math(nodes, links, 'MAXIMUM', out, other(nodes, links, coord))
        return out
    return mask


def _both(first, second):
    """Where both masks show."""
    def mask(nodes, links, coord):
        return _math(nodes, links, 'MULTIPLY', first(nodes, links, coord), second(nodes, links, coord))
    return mask


def _heights(*bands):
    """Bands round an upright thing: each (low, high) in metres above its foot."""
    return _either(*[_band((0, 0, 1), low, high) for low, high in bands])


# --- bottles ---

def _bottle_profile(shape):
    """A bottle's outline (radius, z) from its lip down to its foot, by `shape`: round (a flask), slim (a vial),
    bottle (a wine bottle). And the heights of its body's top and foot, where a liquid fills between."""
    if shape == 'round':
        body = [(0.044 * math.sin(t), 0.05 + 0.044 * math.cos(t)) for t in [i * math.pi / 12 for i in range(2, 13)]]
        return [(0.011, 0.142), (0.014, 0.138), (0.011, 0.132), (0.011, 0.1)] + body, (0.094, 0.006)
    if shape == 'slim':
        return [(0.009, 0.15), (0.012, 0.146), (0.008, 0.14), (0.008, 0.126), (0.014, 0.121), (0.018, 0.114),
                (0.019, 0.104), (0.019, 0.012), (0.016, 0.002), (0.0, 0.0)], (0.112, 0.004)
    # a wine bottle: a long neck swelling into round shoulders over a tall straight body
    shoulder = [(0.009 + 0.018 * math.sin(t), 0.112 + 0.022 * math.cos(t)) for t in np.linspace(0.0, math.pi / 2, 7)]
    return ([(0.009, 0.186), (0.0125, 0.182), (0.0125, 0.176), (0.009, 0.172), (0.009, 0.134)] + shoulder[1:]
            + [(0.027, 0.012), (0.023, 0.002), (0.0, 0.0)]), (0.112, 0.004)


def _liquid_line(level):
    """The liquid seen through the glass: below a line level across the picture, as clear glass shows what it holds
    up to its surface's far edge. The mask is a plane square to the eye's up, so the line lies flat on screen."""
    e = math.radians(ELEVATION)
    up = (0.0, math.sin(e), math.cos(e))

    def mask(nodes, links, coord):
        return _math(nodes, links, 'LESS_THAN', _dot(nodes, links, coord, up), level)
    return mask


@model
def bottle(item, words, seed):
    """A bottle of `glass`, `shape`d, filled `full` with `liquid` if given, sealed by `seal` (cork or wax), a `label`
    round it if given, a `wisp` of essence in it."""
    profile, (top, foot) = _bottle_profile(words['shape'])
    liquid = words.get('liquid')
    e = math.radians(ELEVATION)
    widest = max(r for r, z in profile if foot < z <= top)
    pattern = None
    if liquid:
        low = foot * math.cos(e) - widest * math.sin(e)
        level = low + (top * math.cos(e) - low) * words.get('full', 0.6)
        pattern = (liquid, _liquid_line(level), 0.9)
    item.add(shapes.lathe(profile, 24, top=True), Mat(words['glass'], rough=0.05, spec=0.9, pattern=pattern))
    lip = profile[0][1]
    if words.get('seal', 'cork') == 'cork':
        cork = [(0.0001, lip + 0.013), (0.0085, lip + 0.013), (0.0095, lip + 0.008), (0.009, lip - 0.004)]
        item.add(shapes.lathe(cork, 12, top=True, foot=True), Mat('cork', rough=0.9, bump=(0.3, 400.0)))
    else:
        item.add(shapes.lathe([(0.0001, lip + 0.008), (0.012, lip + 0.007), (0.015, lip + 0.002), (0.015, lip - 0.012),
                               (0.017, lip - 0.016), (0.012, lip - 0.018)], 16, top=True, foot=True),
                 Mat('waxRed', rough=0.45, spec=0.5))
    if words.get('label'):
        item.add(shapes.lathe([(widest * 1.03, 0.08), (widest * 1.03, 0.044)], 24),
                 Mat(words['label'], rough=0.9, pattern=('ink', _heights((0.059, 0.065)), 0.7)))
    if words.get('wisp'):
        # the wisp hugs the glass's near side, where clear glass would show it
        reach = widest + 0.0012
        wisp = [(reach * math.sin(a), -reach * math.cos(a), z) for a, z in
                ((-0.7, 0.025), (0.5, 0.05), (-0.45, 0.075), (0.6, 0.098))]
        item.add(shapes.tube(wisp, 0.0028, 6), Mat('essence', glow=0.8))
        item.sparkle((-widest * 0.5, -widest, 0.035), ramp='essence', arm=1)


# --- tins, jars, cans ---

@model
def saltsTin(item, words, seed):
    """A squat pewter tin of smelling salts, open, its white crystals heaped in it, its lid leaned on its side."""
    tin = [(0.0275, 0.036), (0.0305, 0.0355), (0.0305, 0.032), (0.03, 0.031), (0.03, 0.004), (0.028, 0.0),
           (0.0001, 0.0)]
    item.add(shapes.lathe(tin, 28, top=True), Mat('pewter', rough=0.4, metal=0.1, spec=0.7,
                                                  pattern=('pewter', _heights((0.021, 0.0235)), 0.55)))
    crystals = shapes.wobble(shapes.ellipsoid((0.027, 0.027, 0.014), centre=(0, 0, 0.033), flat=0.5, sides=20),
                             seed, 0.25, 2.0)
    item.add(crystals, Mat('silkWhite', rough=0.5, spec=0.5, bump=(0.9, 260.0)), smooth=False)
    lid = [(0.0001, 0.0095), (0.005, 0.0095), (0.0065, 0.0085), (0.03, 0.0075), (0.0325, 0.0055), (0.0325, 0.0),
           (0.0305, 0.0), (0.0305, 0.004), (0.0001, 0.004)]
    lid_turn, lid_at = (0, 76, -26), (0.045, 0.006, 0.032)
    groove = _ring(lid_at, _point((0, 0, 1), lid_turn), 0.019, 0.023)
    item.add(shapes.moved(shapes.lathe(lid, 28, top=True, foot=True), offset=lid_at, turn=lid_turn),
             Mat('pewter', rough=0.4, metal=0.1, spec=0.7, pattern=('pewter', groove, 0.55)))
    item.sparkle((-0.012, -0.02, 0.037), ramp='silkWhite', arm=1)


@model
def emberJar(item, words, seed):
    """A clay jar banked with embers, their glow at its mouth, two small flames above them; grooves round its belly."""
    profile = [(0.023, 0.113), (0.0275, 0.118), (0.031, 0.116), (0.031, 0.11), (0.026, 0.104), (0.025, 0.097),
               (0.032, 0.088), (0.042, 0.076), (0.048, 0.06), (0.047, 0.042), (0.04, 0.022), (0.03, 0.008),
               (0.03, 0.002), (0.027, 0.0), (0.0001, 0.0)]
    item.add(shapes.lathe(profile, 28, foot=True), Mat('clay', rough=0.75, bump=(0.15, 120.0),
                                                       pattern=('clay', _heights((0.061, 0.066), (0.091, 0.095)), 0.5)))
    coals = shapes.wobble(shapes.ellipsoid((0.024, 0.024, 0.009), centre=(0, 0, 0.11), flat=0.5, sides=20), seed, 0.3,
                          2.5)
    item.add(coals, Mat('ember', glow=0.45, rough=0.8, bump=(1.0, 300.0)), smooth=False)
    item.add(_teardrop(0.032, 0.0068, (-0.008, -0.004, 0.112)), Mat('flame', glow=0.9))
    item.add(_teardrop(0.023, 0.0055, (0.01, 0.002, 0.111)), Mat('flame', glow=0.9))


@model
def oilCan(item, words, seed):
    """A brass oil can: its round body ringed by a seam, a rolled bead round its flat top, its filler cap, its long
    thin spout and its handle."""
    brass = _brass()
    body = [(0.0001, 0.054), (0.0495, 0.054), (0.0515, 0.052), (0.0515, 0.005), (0.049, 0.0), (0.0001, 0.0)]
    item.add(shapes.lathe(body, 32, top=True, foot=True),
             Mat('brass', rough=0.3, metal=0.1, spec=0.8, pattern=('brass', _heights((0.024, 0.028)), 0.5)))
    # a bead rolled round the top's edge, so the flat top reads as a lid and the can not as a pot
    item.add(shapes.moved(shapes.torus(0.0505, 0.0032, 40, 6), offset=(0, 0, 0.0535)), _brass(0.8))
    item.add(shapes.lathe([(0.0001, 0.064), (0.012, 0.064), (0.014, 0.061), (0.014, 0.053)], 16, top=True),
             _brass(1.1))
    item.add(shapes.lathe([(0.0001, 0.069), (0.0045, 0.069), (0.0055, 0.064)], 10, top=True), brass)
    item.add(shapes.tube([(0.024, -0.003, 0.05), (0.038, -0.005, 0.064)], 0.012, 10, radius_end=0.0065), brass)
    spout = [(0.034, -0.005, 0.06), (0.058, -0.008, 0.086), (0.084, -0.012, 0.112), (0.104, -0.014, 0.132)]
    item.add(shapes.tube(spout, 0.0065, 8, radius_end=0.003), Mat('brass', rough=0.3, metal=0.25, spec=0.8, glow=THIN))
    item.add(shapes.tube([(-0.04, 0.0, 0.048), (-0.062, 0.0, 0.054), (-0.075, 0.0, 0.034), (-0.069, 0.0, 0.013),
                          (-0.051, 0.0, 0.012)], 0.0048, 8), brass)


# --- bags, boxes, bundles ---

@model
def satchel(item, words, seed):
    """A satchel of `ramp`'s leather: its flap down over the front, stitched round its edge, a brass buckle, the strap
    looped over the top."""
    ramp = words.get('ramp', 'leather')
    width, depth, height = 0.26, 0.09, 0.17
    item.add(shapes.box(width, depth, height, (0, 0, height / 2)), Mat(ramp, rough=0.7, bump=(0.2, 90.0), dim=0.72),
             smooth=False, bevel=0.022)
    path = [(0.03, 0.176), (-0.02, 0.177), (-0.04, 0.172), (-0.052, 0.16), (-0.057, 0.14), (-0.061, 0.1),
            (-0.064, 0.04)]
    over = 0.108   # the path's length over the top to the front's upper edge
    side, middle = over + 0.03, over + 0.078
    item.add(_drape(width + 0.006, path, side, middle), Mat(ramp, rough=0.6, bump=(0.15, 90.0)))
    stitches = []
    for x0 in np.arange(-0.115, 0.115, 0.024):
        dash = []
        for x in (x0, x0 + 0.013):
            y, z = _path_point(path, _drape_length(x, width + 0.006, side, middle) - 0.013)
            dash.append((x, y - 0.003, z))
        stitches.append(shapes.tube(dash, 0.0032, 4))
    item.add(shapes.joined(*stitches), Mat(ramp, rough=0.5, glow=THIN, dim=1.3))
    item.add(shapes.box(0.044, 0.008, 0.04, (0, -0.068, 0.07)), _brass(), smooth=False, bevel=0.004)
    item.add(shapes.box(0.018, 0.004, 0.018, (0, -0.073, 0.07)), Mat(ramp, rough=0.6, dim=0.45), smooth=False)
    item.add(shapes.box(0.02, 0.006, 0.05, (0, -0.064, 0.03)), Mat(ramp, rough=0.6), smooth=False, bevel=0.002)
    strap = _arc((0, 0.0, height - 0.006), (0.105, 0.085), math.pi, 0.0, 15)
    item.add(shapes.tube(strap, 0.0085, 8), Mat(ramp, rough=0.6, dim=0.9))
    for x in (-0.105, 0.105):
        item.add(shapes.box(0.026, 0.024, 0.016, (x, 0, height + 0.006)), _brass(), smooth=False, bevel=0.003)


@model
def purse(item, words, seed):
    """A purse of `ramp`'s leather drawn shut at its neck by a cord, its mouth ruffled above, a gold coin leant
    before it."""
    ramp = words.get('ramp', 'darkLeather')
    profile = [(0.0001, 0.126), (0.018, 0.124), (0.024, 0.118), (0.02, 0.11), (0.012, 0.102), (0.011, 0.097),
               (0.022, 0.088), (0.04, 0.073), (0.05, 0.05), (0.048, 0.026), (0.036, 0.008), (0.02, 0.001),
               (0.0001, 0.0)]
    verts, faces = shapes.lathe(profile, 28, top=True, foot=True)
    ruffled = []
    for x, y, z in verts:
        if z > 0.1:
            wave = math.cos(5 * math.atan2(y, x))
            x, y, z = x * (1 + 0.3 * wave), y * (1 + 0.3 * wave), z + 0.004 * wave
        ruffled.append((x, y, z))
    item.add(shapes.wobble((ruffled, faces), seed, 0.06, 2.0),
             Mat(ramp, rough=0.65, bump=(0.25, 110.0), pattern=(ramp, _mottle(70.0, 0.6), 1.15)))
    rope = Mat('rope', rough=0.9, bump=(0.4, 400.0))
    item.add(shapes.moved(shapes.torus(0.014, 0.004, 20, 8), offset=(0, 0, 0.099)), rope)
    item.add(shapes.tube([(0.012, -0.006, 0.098), (0.026, -0.018, 0.09), (0.034, -0.024, 0.076),
                          (0.037, -0.026, 0.062)], 0.0034, 6), Mat('rope', rough=0.9, glow=THIN))
    item.add(shapes.ellipsoid((0.0055, 0.0055, 0.007), centre=(0.037, -0.026, 0.058)), rope)
    coin_turn, coin_at = (62, 0, -18), (0.05, -0.05, 0.0195)
    gold = Mat('gold', rough=0.3, metal=0.25, spec=0.8,
               pattern=('gold', _ring(coin_at, _point((0, 0, 1), coin_turn), 0.011, 0.0135), 0.55))
    coin = [(0.0001, 0.0042), (0.019, 0.0042), (0.021, 0.003), (0.021, 0.0012), (0.019, 0.0), (0.0001, 0.0)]
    item.add(shapes.moved(shapes.lathe(coin, 24, top=True, foot=True), offset=coin_at, turn=coin_turn), gold)
    item.sparkle(_point((-0.009, 0.006, 0.0045), coin_turn, coin_at), ramp='gold', arm=1)


@model
def basket(item, words, seed):
    """A woven basket: its walls checked by the weave, dark inside, its rim bound round, its bowed handle wrapped."""
    outer = [(0.099, 0.104), (0.095, 0.064), (0.086, 0.018), (0.08, 0.005), (0.075, 0.0), (0.0001, 0.0)]
    item.add(shapes.lathe(outer, 36, foot=True), Mat('wicker', rough=0.8, bump=(0.25, 120.0),
                                                     pattern=('wicker', _weave(44.0), 0.68)))
    inner = [(0.091, 0.104), (0.087, 0.064), (0.076, 0.022), (0.0001, 0.018)]
    item.add(shapes.lathe(inner, 36, foot=True), Mat('wicker', rough=0.9, bump=(0.3, 120.0), dim=0.62))
    rim = Mat('wicker', rough=0.6, pattern=('wicker', _lines((0.7, 0.7, 0), 0.014, 0.0045), 0.72))
    item.add(shapes.moved(shapes.torus(0.0955, 0.0078, 40, 8), offset=(0, 0, 0.104)), rim)
    handle = _arc((0, 0, 0.104), (0.093, 0.13), math.pi, 0.0, 19)
    item.add(shapes.tube(handle, 0.0078, 8), Mat('wicker', rough=0.6))
    wraps = _arc((0, 0, 0.104), (0.093, 0.13), math.pi * 0.92, math.pi * 0.08, 7)
    item.add(shapes.joined(*[shapes.moved(shapes.torus(0.0085, 0.003, 10, 5), turn=(90, 0, 0), offset=(x, 0.0, z))
                             for x, _, z in wraps]), Mat('wicker', rough=0.6, dim=0.75))


def _box_side_mats(ramp, turn, spacing, width, dim=1.0):
    """A board-built box's two looks: its sides with gaps between boards laid flat, its top with boards along its
    length."""
    across = (-math.sin(math.radians(turn)), math.cos(math.radians(turn)), 0.0)
    side = Mat(ramp, rough=0.75, bump=(0.25, 70.0), dim=dim, pattern=(ramp, _lines((0, 0, 1), spacing, width), 0.55))
    top = Mat(ramp, rough=0.7, bump=(0.25, 70.0), pattern=(ramp, _lines(across, spacing, width), 0.55))
    return side, top


@model
def crate(item, words, seed):
    """A crate of stores: its boards bound with iron and nailed, a coil of rope and a pot of pitch on its lid."""
    turn = BOX_TURN
    width, depth, height = 0.3, 0.2, 0.18
    side, top = _box_side_mats('wood', turn, 0.045, 0.007)
    item.add(_turned(shapes.box(width, depth, height - 0.012, (0, 0, (height - 0.012) / 2)), turn), side, smooth=False,
             bevel=0.004)
    item.add(_turned(shapes.box(width + 0.004, depth + 0.004, 0.014, (0, 0, height - 0.007)), turn), top, smooth=False,
             bevel=0.003)
    for z in (0.04, 0.125):
        item.add(_turned(shapes.box(width + 0.008, depth + 0.008, 0.013, (0, 0, z)), turn), _iron(), smooth=False)
    nails = []
    for z in (0.04, 0.125):
        for x in (-0.12, -0.04, 0.04, 0.12):
            nails.append(shapes.ellipsoid((0.0042, 0.003, 0.0042), (x, -depth / 2 - 0.0045, z), rings=4, sides=6))
        for y in (-0.06, 0.06):
            nails.append(shapes.ellipsoid((0.003, 0.0042, 0.0042), (-width / 2 - 0.0045, y, z), rings=4, sides=6))
    item.add(_turned(shapes.joined(*nails), turn), Mat('iron', rough=0.3, metal=0.2, spec=0.8, dim=1.3))
    coil_at = _point((-0.06, 0.01, height), (0, 0, turn))
    rope = Mat('rope', rough=0.9, bump=(0.3, 300.0), pattern=('rope', _coil(coil_at, (0, 0, 1), 0.011, 0.0035), 0.6))
    coil = shapes.lathe([(0.016, 0.0), (0.016, 0.012), (0.02, 0.022), (0.048, 0.024), (0.054, 0.012), (0.05, 0.0)],
                        28, loop=True)
    item.add(_turned(shapes.moved(coil, offset=(-0.06, 0.01, height)), turn), rope)
    pot = shapes.lathe([(0.03, 0.07), (0.033, 0.066), (0.032, 0.06), (0.034, 0.03), (0.03, 0.006), (0.026, 0.0),
                        (0.0001, 0.0)], 20, foot=True)
    item.add(_turned(shapes.moved(pot, offset=(0.07, 0.03, height)), turn), Mat('charcoal', rough=0.5, spec=0.5))
    pitch = shapes.ellipsoid((0.028, 0.028, 0.004), centre=(0.07, 0.03, height + 0.064), sides=20)
    item.add(_turned(pitch, turn), Mat('oil', rough=0.15, spec=0.9))


@model
def campPack(item, words, seed):
    """A pack for the road: a leather bag with a buckled pocket and straps, a blanket rolled and strapped over its
    top, an iron pot hung at its side."""
    turn = 14.0
    bag = Mat('leather', rough=0.7, bump=(0.2, 80.0), dim=0.75)
    item.add(_turned(shapes.box(0.24, 0.13, 0.3, (0, 0, 0.15)), turn), bag, smooth=False, bevel=0.03)
    pocket = Mat('leather', rough=0.6, bump=(0.2, 80.0))
    item.add(_turned(shapes.box(0.16, 0.04, 0.1, (0, -0.07, 0.12)), turn), pocket, smooth=False, bevel=0.014)
    item.add(_turned(shapes.box(0.17, 0.05, 0.045, (0, -0.074, 0.17)), turn), Mat('leather', rough=0.6, dim=1.1),
             smooth=False, bevel=0.012)
    straps = Mat('darkLeather', rough=0.6)
    for x in (-0.075, 0.075):
        item.add(_turned(shapes.box(0.022, 0.008, 0.17, (x, -0.068, 0.215)), turn), straps, smooth=False)
        item.add(_turned(shapes.box(0.03, 0.008, 0.024, (x, -0.074, 0.135)), turn), _brass(), smooth=False,
                 bevel=0.002)
    roll_axis = _point((1, 0, 0), (0, 0, turn))
    roll_mid = _point((0.0, -0.005, 0.355), (0, 0, turn))
    blanket = Mat('wool', rough=0.85, bump=(0.3, 120.0))
    item.add(_turned(shapes.cylinder(0.058, 0.34, sides=24), turn, _point((-0.17, -0.005, 0.355), (0, 0, 0))),
             blanket)
    ends = Mat('wool', rough=0.85, pattern=('wool', _coil(roll_mid, roll_axis, 0.017, 0.006), 0.55))
    for x in (-0.172, 0.172):
        item.add(_turned(shapes.ellipsoid((0.006, 0.057, 0.057), centre=(x, -0.005, 0.355), rings=8, sides=20), turn),
                 ends)
    for x in (-0.095, 0.095):
        band = shapes.moved(shapes.torus(0.061, 0.0065, 24, 6), turn=(0, 90, 0), offset=(x, -0.005, 0.355))
        item.add(_turned(band, turn), straps)
    hang = (0.15, -0.035, 0.11)
    bowl = [(0.052, 0.0), (0.056, -0.003), (0.054, -0.008), (0.05, -0.03), (0.034, -0.05), (0.0001, -0.056)]
    item.add(_turned(shapes.moved(shapes.lathe(bowl, 24, foot=True), offset=hang, scale=(1.15, 1.15, 1.15)), turn),
             _iron(1.1))
    lid = shapes.lathe([(0.0001, 0.012), (0.012, 0.011), (0.05, 0.002), (0.052, 0.0)], 24, top=True)
    item.add(_turned(shapes.moved(lid, offset=hang, scale=(1.15, 1.15, 1.15)), turn), _iron(1.2))
    knob = shapes.ellipsoid((0.009, 0.009, 0.007), centre=(hang[0], hang[1], hang[2] + 0.015))
    item.add(_turned(knob, turn), _iron(1.2))
    hook = [(hang[0] - 0.03, hang[1], hang[2] + 0.004), (hang[0] - 0.036, hang[1] - 0.01, hang[2] + 0.06),
            (hang[0] - 0.05, hang[1] - 0.02, hang[2] + 0.09)]
    item.add(_turned(shapes.tube(hook, 0.0035, 5), turn), Mat('iron', rough=0.45, glow=THIN))


@model
def sack(item, words, seed):
    """A sack of `cloth`: `open` with its `grain` heaped at its rolled mouth, or tied at the neck with ears of `grain`
    in the knot."""
    cloth_ramp, grain = words.get('cloth', 'burlap'), words.get('grain', 'oats')
    cloth = Mat(cloth_ramp, rough=0.95, bump=(0.35, 110.0), pattern=(cloth_ramp, _mottle(22.0, 0.58), 1.12))
    rope = Mat('rope', rough=0.9, bump=(0.4, 400.0))
    if words.get('open', True):
        profile = [(0.075, 0.19), (0.09, 0.18), (0.108, 0.155), (0.122, 0.105), (0.126, 0.06), (0.112, 0.022),
                   (0.08, 0.003), (0.0001, 0.0)]
        body = shapes.wobble(shapes.lathe(profile, 28, foot=True), seed, 0.07, 2.0)
        item.add(shapes.moved(body, scale=(1.0, 0.85, 1.0)), cloth)
        lip = shapes.wobble(shapes.torus(0.078, 0.014, 32, 8), seed + 1, 0.06)
        item.add(shapes.moved(lip, offset=(0, 0, 0.192), scale=(1.0, 0.85, 1.0)),
                 Mat(cloth_ramp, rough=0.9, dim=1.1, bump=(0.35, 110.0)))
        heap = shapes.wobble(shapes.ellipsoid((0.068, 0.056, 0.035), centre=(0, 0, 0.19), flat=0.5, sides=24), seed + 2,
                             0.18, 3.0)
        item.add(heap, Mat(grain, rough=0.9, bump=(0.9, 320.0)))
        return
    profile = [(0.0001, 0.268), (0.02, 0.262), (0.03, 0.25), (0.024, 0.234), (0.015, 0.222), (0.026, 0.205),
               (0.06, 0.18), (0.104, 0.145), (0.124, 0.095), (0.12, 0.045), (0.094, 0.01), (0.0001, 0.0)]
    verts, faces = shapes.lathe(profile, 28, top=True, foot=True)
    gathered = []
    for x, y, z in verts:
        pleat = 1 + 0.25 * math.cos(7 * math.atan2(y, x)) if z > 0.2 else 1.0
        gathered.append((x * pleat, y * pleat, z))
    item.add(shapes.moved(shapes.wobble((gathered, faces), seed, 0.06, 2.0), scale=(1.0, 0.85, 1.0)), cloth)
    item.add(shapes.moved(shapes.torus(0.0175, 0.006, 20, 8), offset=(0, 0, 0.222)), rope)
    item.add(shapes.tube([(0.015, -0.01, 0.22), (0.03, -0.026, 0.205), (0.04, -0.032, 0.178)], 0.004, 6),
             Mat('rope', rough=0.9, glow=THIN))
    stalk = Mat(grain, rough=0.7, dim=0.85, glow=THIN)
    ear = Mat(grain, rough=0.6, bump=(0.6, 500.0))
    for lean, tip_z, drop in ((-0.04, 0.318, 0.0), (0.002, 0.335, 0.004), (0.042, 0.314, -0.002)):
        straw = [(lean * 0.15, 0, 0.25), (lean * 0.65, drop, 0.285), (lean, drop, tip_z - 0.02)]
        item.add(shapes.tube(straw, 0.003, 5), stalk)
        item.add(shapes.ellipsoid((0.0095, 0.0085, 0.024), centre=(lean * 1.04, drop, tip_z), rings=8, sides=10), ear)


@model
def spiceBox(item, words, seed):
    """A small wooden box of ground spice heaped above its rim, a quill of cinnamon bark across it."""
    turn = BOX_TURN - 4
    width, depth, height, wall = 0.13, 0.085, 0.042, 0.008
    side, _ = _box_side_mats('wood', turn, 0.021, 0.003)
    walls = [shapes.box(width, wall, height, (0, (depth - wall) / 2 * k, height / 2)) for k in (-1, 1)]
    walls += [shapes.box(wall, depth, height, ((width - wall) / 2 * k, 0, height / 2)) for k in (-1, 1)]
    walls.append(shapes.box(width, depth, 0.006, (0, 0, 0.003)))
    item.add(_turned(shapes.joined(*walls), turn), side, smooth=False, bevel=0.0015)
    heap = shapes.wobble(shapes.ellipsoid((width / 2 - wall * 0.6, depth / 2 - wall * 0.6, 0.03), centre=(0, 0, 0.028),
                                          flat=0.35, sides=24), seed, 0.14, 2.5)
    item.add(_turned(heap, turn), Mat('spice', rough=0.95, bump=(0.7, 380.0)))
    stick_turn, stick_at = (0, -12, 22), (-0.075, -0.012, 0.05)
    quill = shapes.lathe([(0.0068, 0.12), (0.0068, 0.0)], 12, top=True, foot=True)
    quill = shapes.moved(quill, turn=(0, 90, 0))
    item.add(_turned(shapes.moved(quill, offset=stick_at, turn=stick_turn), turn),
             Mat('barkCherry', rough=0.8, pattern=('barkCherry', _lines((0, 0, 1), 0.0055, 0.0016), 0.6)))
    end = shapes.moved(shapes.torus(0.0045, 0.002, 10, 5), turn=(0, 90, 0), offset=(0.121, 0, 0))
    item.add(_turned(shapes.moved(end, offset=stick_at, turn=stick_turn), turn), Mat('barkCherry', rough=0.8, dim=0.6))


# --- tools ---

@model
def knife(item, words, seed):
    """A skinning knife lying across the picture: its wooden grip riveted, a brass bolster, its blade curved back to
    the point with a bright edge ground along it."""
    def put(mesh, mat, **kw):
        item.add(_turned(mesh, KNIFE_LIE, (-0.07, 0.0, 0.0)), mat, **kw)
    grip = Mat('wood', rough=0.6, pattern=('wood', _lines((1, 0, 0), 0.007, 0.0016), 0.75))
    put(shapes.moved(shapes.cylinder(0.0088, 0.056, sides=14, radius_end=0.0098), offset=(0, 0, 0.0098),
                     scale=(1, 1, 0.75)), grip)
    put(shapes.ellipsoid((0.0045, 0.0088, 0.0075), centre=(0.0, 0.0, 0.0098)), grip)
    put(shapes.joined(*[shapes.ellipsoid((0.0026, 0.0026, 0.0016), centre=(x, 0, 0.0168), rings=4, sides=8)
                        for x in (0.016, 0.04)]), _brass(1.2))
    put(shapes.moved(shapes.cylinder(0.012, 0.009, sides=14), offset=(0.056, 0, 0.0098), scale=(1, 1, 0.8)), _brass())
    edge = [(0.0, -0.009), (0.025, -0.0118), (0.05, -0.013), (0.07, -0.01), (0.083, -0.0035), (0.091, 0.004)]
    spine = [(0.075, 0.0065), (0.05, 0.0098), (0.02, 0.0098), (0.0, 0.009)]
    put(shapes.moved(shapes.prism(edge + spine, 0.0025), offset=(0.064, 0, 0.0085)),
        Mat('steel', rough=0.25, metal=0.25, spec=0.9), smooth=False)
    # the edge ground along the blade's near side: a bright strip, so the steel reads as a blade and not a slab
    ground = [(0.004, -0.0092), (0.03, -0.012), (0.055, -0.0126), (0.072, -0.0092), (0.084, -0.0025), (0.09, 0.0035),
              (0.077, 0.0), (0.06, -0.0045), (0.035, -0.006), (0.006, -0.0045)]
    put(shapes.moved(shapes.prism(ground, 0.0012), offset=(0.064, 0, 0.0111)),
        Mat('steel', rough=0.2, metal=0.2, spec=0.9, dim=1.3), smooth=False)


@model
def rod(item, words, seed):
    """The fishing rod leant up across the picture: its tapering pole, its leather grip bound in brass, a brass reel
    with its crank at the grip, rings along the pole, the line run from its tip down to a hook."""
    turn = (0.0, 0.0, 8.0)
    butt, tip = np.array([0.0, 0.0, 0.03]), np.array([0.62, 0.0, 0.78])
    axis = (tip - butt) / np.linalg.norm(tip - butt)
    side = np.array([axis[2], 0.0, -axis[0]])

    def put(mesh, mat, **kw):
        item.add(shapes.moved(mesh, turn=turn), mat, **kw)
    put(shapes.tube([tuple(butt), tuple(tip)], 0.018, 8, radius_end=0.0135),
        Mat('wood', rough=0.5, spec=0.5, glow=THIN))
    grip_end = butt + axis * 0.21
    put(shapes.tube([tuple(butt - axis * 0.01), tuple(grip_end)], 0.029, 10, radius_end=0.026),
        Mat('darkLeather', rough=0.7, pattern=('darkLeather', _lines(tuple(axis), 0.034, 0.009), 0.55)))
    put(shapes.tube([tuple(grip_end), tuple(grip_end + axis * 0.022)], 0.031, 10), _brass())
    put(shapes.tube([tuple(butt - axis * 0.016), tuple(butt + axis * 0.004)], 0.032, 10), _brass())
    reel_at = grip_end + axis * 0.07 + side * 0.06
    reel = shapes.lathe([(0.0001, 0.018), (0.056, 0.018), (0.064, 0.011), (0.064, -0.011), (0.056, -0.018),
                         (0.0001, -0.018)], 24, top=True, foot=True)
    spool = _ring(tuple(reel_at), (0, 1, 0), 0.03, 0.04)
    put(shapes.moved(reel, offset=tuple(reel_at), turn=(90, 0, 0)),
        Mat('brass', rough=0.3, metal=0.25, spec=0.8, pattern=('brass', spool, 0.5)))
    put(shapes.moved(shapes.cylinder(0.012, 0.03), offset=tuple(reel_at - np.array([0.0, 0.045, 0.0])),
                     turn=(0, 0, 90)), _brass(1.1))
    crank = reel_at + np.array([0.034, -0.03, 0.02])
    put(shapes.tube([tuple(reel_at + np.array([0.0, -0.022, 0.0])), tuple(crank)], 0.007, 6), _brass())
    put(shapes.ellipsoid((0.011, 0.011, 0.011), centre=tuple(crank)), Mat('darkLeather', rough=0.5))
    put(shapes.tube([tuple(reel_at - side * 0.04), tuple(grip_end + axis * 0.07)], 0.012, 6), _brass())
    for share in (0.46, 0.68, 0.88):
        at = butt + (tip - butt) * share
        put(shapes.tube([tuple(at), tuple(at + side * 0.034)], 0.0105, 6),
            Mat('steel', rough=0.3, metal=0.2, spec=0.8, glow=THIN))
    line = [tuple(tip), (tip[0] + 0.028, -0.004, tip[2] - 0.2), (tip[0] + 0.03, -0.006, tip[2] - 0.4),
            (tip[0] + 0.012, -0.006, tip[2] - 0.5)]
    put(shapes.tube(line, 0.0165, 6), Mat('silkWhite', rough=0.5, glow=THIN))
    hook = [line[-1], (tip[0] - 0.008, -0.006, tip[2] - 0.56), (tip[0] + 0.006, -0.006, tip[2] - 0.605),
            (tip[0] + 0.04, -0.006, tip[2] - 0.59), (tip[0] + 0.048, -0.006, tip[2] - 0.55)]
    put(shapes.tube(hook, 0.0165, 6), Mat('steel', rough=0.25, metal=0.25, spec=0.9, glow=THIN))


@model
def repairKit(item, words, seed):
    """A smith's repair kit: an oak box with its lid's seam, brass corners and latch, a hammer across its lid and a
    file beside it."""
    turn = BOX_TURN - 2
    width, depth, height = 0.26, 0.16, 0.11
    item.add(_turned(shapes.box(width, depth, height, (0, 0, height / 2)), turn),
             Mat('oak', rough=0.65, bump=(0.2, 70.0), pattern=('oak', _heights((0.077, 0.085)), 0.45)), smooth=False,
             bevel=0.006)
    grain = (-math.sin(math.radians(turn)), math.cos(math.radians(turn)), 0.0)
    item.add(_turned(shapes.box(width - 0.016, depth - 0.016, 0.004, (0, 0, height + 0.001)), turn),
             Mat('oak', rough=0.6, bump=(0.2, 70.0), pattern=('oak', _lines(grain, 0.045, 0.005), 0.8)), smooth=False)
    corners = [shapes.box(0.024, 0.024, 0.026, (x * (width / 2 - 0.01), y * (depth / 2 - 0.01), z))
               for x in (-1, 1) for y in (-1, 1) for z in (0.014, height - 0.012)]
    item.add(_turned(shapes.joined(*corners), turn), _brass(), smooth=False, bevel=0.003)
    item.add(_turned(shapes.box(0.034, 0.01, 0.036, (0.0, -depth / 2 - 0.003, 0.08)), turn), _brass(1.1),
             smooth=False, bevel=0.002)
    item.add(_turned(shapes.box(0.01, 0.004, 0.01, (0.0, -depth / 2 - 0.009, 0.078)), turn), _brass(0.5),
             smooth=False)
    hammer_turn = turn + 16
    handle = shapes.cylinder(0.009, 0.2, sides=10, radius_end=0.008)
    item.add(_turned(shapes.moved(handle, offset=(-0.11, -0.02, height + 0.012)), hammer_turn),
             Mat('wood', rough=0.6, pattern=('wood', _lines((0, 0, 1), 0.006, 0.0015), 0.75)))
    head = shapes.joined(shapes.box(0.034, 0.084, 0.034, (0.075, -0.014, height + 0.02)),
                         shapes.box(0.026, 0.022, 0.026, (0.075, -0.066, height + 0.02)))
    item.add(_turned(head, hammer_turn), Mat('steel', rough=0.3, metal=0.25, spec=0.85), smooth=False, bevel=0.003)
    rasp = shapes.joined(shapes.box(0.12, 0.016, 0.005, (0.0, 0.0, 0.0)),
                         shapes.moved(shapes.cylinder(0.0065, 0.05, sides=8), offset=(-0.11, 0.0, 0.0)))
    item.add(_turned(shapes.moved(rasp, offset=(0.03, 0.045, height + 0.008), turn=(0, 0, -10)), turn),
             Mat('iron', rough=0.5, metal=0.2, spec=0.6, pattern=('iron', _lines((1, 0, 0), 0.006, 0.002), 0.7)),
             smooth=False)


@model
def wheelKit(item, words, seed):
    """A wagon-mender's kit: a spoked wheel shod with iron, leant back, and a mallet stood against it."""
    tilt = (-28.0, 0.0, 10.0)
    radius = 0.28
    centre = np.array([0.0, 0.0, radius])

    def put(mesh, mat, **kw):
        item.add(shapes.moved(mesh, turn=tilt), mat, **kw)
    felloe = Mat('wood', rough=0.7, pattern=('wood', _lines(_point((1, 0, 0), tilt), 0.08, 0.008), 0.6))
    put(shapes.moved(shapes.torus(radius - 0.03, 0.026, 40, 8), turn=(90, 0, 0), offset=tuple(centre),
                     scale=(1, 1, 1.4)), felloe)
    put(shapes.moved(shapes.torus(radius - 0.002, 0.011, 40, 6), turn=(90, 0, 0), offset=tuple(centre),
                     scale=(1, 1, 2.6)), _iron())
    spoke = Mat('wood', rough=0.7, glow=THIN)
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        inner = centre + 0.04 * np.array([math.cos(a), 0, math.sin(a)])
        outer = centre + (radius - 0.045) * np.array([math.cos(a), 0, math.sin(a)])
        put(shapes.tube([tuple(inner), tuple(outer)], 0.0145, 8, radius_end=0.0115), spoke)
    hub = shapes.lathe([(0.0001, -0.05), (0.022, -0.05), (0.03, -0.042), (0.05, -0.03), (0.05, 0.03), (0.03, 0.04)],
                       20, top=True)
    put(shapes.moved(hub, turn=(90, 0, 0), offset=tuple(centre)), Mat('wood', rough=0.6, dim=1.1))
    cap = shapes.lathe([(0.0001, 0.062), (0.018, 0.06), (0.025, 0.05), (0.025, 0.035)], 16, top=True)
    put(shapes.moved(cap, turn=(90, 0, 0), offset=tuple(centre)), _iron(1.2))
    # the mallet stands on its handle's foot before the wheel, its head up past the rim's right
    foot, top = np.array([0.13, -0.2, 0.0]), np.array([0.35, -0.12, 0.42])
    item.add(shapes.tube([tuple(foot), tuple(top)], 0.014, 8, radius_end=0.016),
             Mat('oak', rough=0.6, glow=THIN, pattern=('oak', _lines((0, 0, 1), 0.012, 0.003), 0.7)))
    handle_dir = (top - foot) / np.linalg.norm(top - foot)
    across = np.cross(handle_dir, np.array([0.0, 1.0, 0.0]))
    across /= np.linalg.norm(across)
    item.add(shapes.tube([tuple(top - across * 0.09), tuple(top + across * 0.09)], 0.055, 16),
             Mat('oak', rough=0.55, bump=(0.2, 60.0)))
    for end in (-1, 1):
        ring = top + across * 0.074 * end
        item.add(shapes.tube([tuple(ring - across * 0.008), tuple(ring + across * 0.008)], 0.057, 16), _iron())


@model
def candle(item, words, seed):
    """A thick candle on a brass dish with a finger ring, lit: its wick, its flame, its top hollowed by the heat, wax
    run down its side."""
    dish = [(0.0001, 0.005), (0.042, 0.005), (0.047, 0.009), (0.052, 0.011), (0.054, 0.008), (0.049, 0.002),
            (0.045, 0.0), (0.0001, 0.0)]
    well = _ring((0, 0, 0), (0, 0, 1), 0.026, 0.03)
    item.add(shapes.lathe(dish, 32, top=True, foot=True),
             Mat('brass', rough=0.3, metal=0.25, spec=0.8, pattern=('brass', well, 0.6)))
    item.add(shapes.tube([(0.05, 0.0, 0.008), (0.064, 0.0, 0.01), (0.068, 0.0, 0.018), (0.061, 0.0, 0.023),
                          (0.054, 0.0, 0.015)], 0.0035, 6), Mat('brass', rough=0.3, metal=0.25, spec=0.8, glow=THIN))
    body = [(0.0001, 0.1), (0.013, 0.102), (0.0175, 0.106), (0.0205, 0.104), (0.021, 0.099), (0.021, 0.006),
            (0.023, 0.004), (0.0001, 0.004)]
    item.add(shapes.lathe(body, 28, top=True, foot=True), Mat('candle', rough=0.45, spec=0.4, glow=0.08))
    drip = Mat('candle', rough=0.35, spec=0.5, glow=0.08, dim=1.1)
    for angle, length in ((-2.3, 0.032), (-1.5, 0.058), (-0.75, 0.024)):
        x, y = 0.0213 * math.cos(angle), 0.0213 * math.sin(angle)
        item.add(shapes.tube([(x * 0.95, y * 0.95, 0.106), (x * 1.06, y * 1.06, 0.095),
                              (x * 1.08, y * 1.08, 0.105 - length)], 0.0036, 6, radius_end=0.0042), drip)
    item.add(shapes.tube([(0.0, 0.0, 0.1), (0.001, 0.0, 0.113)], 0.0024, 5), Mat('ink', rough=0.8))
    item.add(_teardrop(0.042, 0.0098, (0.0, 0.0, 0.109)), Mat('flame', glow=0.9))


# --- the gate's spoils and keepsakes ---

@model
def boatParts(item, words, seed):
    """A boat's parts: three curved hull ribs stood one behind another, an oar laid across them, lashed with rope to
    the nearest."""
    rib = Mat('oak', rough=0.7, bump=(0.25, 60.0))
    for y in (0.0, 0.13, 0.26):
        curve = [(x, z) for x, _, z in _arc((0.0, 0.0, 0.0), (0.27, 0.15), math.pi * 1.03, -math.pi * 0.03, 23)]
        item.add(shapes.moved(_bent_plank(curve, 0.05, 0.024), offset=(0.0, y, 0.0)), rib)
    start, rest = np.array([-0.3, -0.24, 0.014]), np.array([-0.06, 0.0, 0.176])
    direction = (rest - start) / np.linalg.norm(rest - start)
    end = start + direction * 0.62
    item.add(shapes.tube([tuple(start), tuple(end)], 0.0135, 8),
             Mat('pine', rough=0.6, glow=THIN, pattern=('pine', _lines(tuple(direction), 0.05, 0.006), 0.8)))
    yaw = math.degrees(math.atan2(direction[1], direction[0]))
    pitch = -math.degrees(math.asin(direction[2]))
    blade = shapes.moved(shapes.ellipsoid((0.1, 0.042, 0.008), rings=8, sides=18), turn=(0, pitch, yaw),
                         offset=tuple(end + direction * 0.085))
    item.add(blade, Mat('pine', rough=0.55, spec=0.4))
    item.add(shapes.tube([tuple(start - direction * 0.02), tuple(start + direction * 0.06)], 0.017, 8),
             Mat('pine', rough=0.6, dim=0.8))
    rope = Mat('rope', rough=0.9, bump=(0.4, 300.0))
    for k in range(3):
        at = rest + direction * (k - 1) * 0.014 + np.array([0.0, 0.0, -0.002])
        item.add(shapes.moved(shapes.torus(0.0175, 0.006, 14, 6), turn=(0, 90 + pitch, yaw), offset=tuple(at)), rope)


@model
def locket(item, words, seed):
    """A silver locket, closed: its lid engraved round a set ruby, its hinge and bail at its top, its chain looped
    above it."""
    tilt = (-34.0, 0.0, 0.0)

    def put(mesh, mat, **kw):
        item.add(shapes.moved(mesh, turn=tilt), mat, **kw)
    face = _point((0, -1, 0), tilt)
    silver = Mat('silver', rough=0.25, metal=0.25, spec=0.9,
                 pattern=('silver', _ring((0, 0, 0), face, 0.0126, 0.0145), 0.45))
    put(shapes.ellipsoid((0.019, 0.0072, 0.021), rings=12, sides=24), silver)
    put(shapes.moved(shapes.torus(0.0192, 0.0014, 32, 5), turn=(90, 0, 0), scale=(1.0, 1.1, 1.0)),
        Mat('silver', rough=0.3, metal=0.2, spec=0.8, dim=0.7))
    put(shapes.ellipsoid((0.0052, 0.0032, 0.0058), centre=(0.0, -0.0064, 0.0)), Mat('ruby', rough=0.15, spec=0.9))
    claws = [shapes.ellipsoid((0.0014, 0.0014, 0.0014), centre=(0.006 * math.cos(a), -0.0062, 0.0066 * math.sin(a)),
                              rings=4, sides=6) for a in (0.8, 2.35, 3.95, 5.5)]
    put(shapes.joined(*claws), Mat('silver', rough=0.25, metal=0.25, spec=0.9))
    put(shapes.moved(shapes.cylinder(0.0026, 0.01, sides=8), offset=(-0.005, 0.0, 0.0212)),
        Mat('silver', rough=0.3, metal=0.2, spec=0.8, dim=0.8))
    put(shapes.moved(shapes.torus(0.0036, 0.0013, 14, 5), turn=(90, 0, 0), offset=(0.0, 0.0, 0.0262)),
        Mat('silver', rough=0.25, metal=0.25, spec=0.9, glow=THIN))
    links = []
    count = 17
    for k in range(count):
        t = 0.4 + (2 * math.pi - 0.8) * k / (count - 1)
        at = (0.03 * math.sin(t), 0.0, 0.0295 + 0.0105 * (1 - math.cos(t)))
        size = 0.0021 if k % 2 else 0.0016
        links.append(shapes.ellipsoid((size, size, size), centre=at, rings=4, sides=8))
    put(shapes.joined(*links), Mat('silver', rough=0.25, metal=0.25, spec=0.9, glow=THIN))
    item.sparkle(_point((-0.009, -0.0065, 0.01), tilt), ramp='silver', arm=1)


@model
def urn(item, words, seed):
    """A burial urn: its round belly on a footed stem, a band of figures round its shoulder between two lines, its
    domed lid and knob."""
    profile = [(0.03, 0.142), (0.033, 0.139), (0.036, 0.132), (0.05, 0.12), (0.06, 0.104), (0.064, 0.085),
               (0.06, 0.064), (0.048, 0.046), (0.032, 0.032), (0.025, 0.024), (0.026, 0.016), (0.034, 0.009),
               (0.037, 0.004), (0.036, 0.0), (0.0001, 0.0)]
    band = _either(_both(_heights((0.092, 0.109)), _ticks(14)), _heights((0.087, 0.09), (0.111, 0.114)))
    item.add(shapes.lathe(profile, 32, foot=True), Mat('ceramic', rough=0.5, spec=0.5, pattern=('ink', band)))
    lid = [(0.0001, 0.172), (0.016, 0.168), (0.03, 0.16), (0.041, 0.15), (0.045, 0.145), (0.045, 0.14),
           (0.04, 0.138), (0.0001, 0.138)]
    item.add(shapes.lathe(lid, 32, top=True, foot=True),
             Mat('ceramic', rough=0.45, spec=0.5, pattern=('ceramic', _heights((0.1475, 0.151)), 0.5)))
    item.add(shapes.lathe([(0.0001, 0.19), (0.007, 0.188), (0.01, 0.181), (0.007, 0.174), (0.005, 0.17)], 14,
                          top=True), Mat('ceramic', rough=0.4, spec=0.5))
