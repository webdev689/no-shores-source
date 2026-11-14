"""The small own pictures: the Lockpick, Starfall Glass, the Weir Key, and the Witches' Festival's - the Soul Cake, the
Hearth Offering, the turnip lantern, the straw effigy and the ward-staff (src/world/festivalArt.js). Each row's eye is
its own (tools/sprite-forge/specs/pictures.json): the cakes lie under the item's eye, the key and the pick are seen from
high over them so their outlines read, and the town's three stand before a level eye, as their billboards do."""
import math

import numpy as np

from . import shapes
from .kit import Mat
from .models import model


def _math(nodes, links, op, first, second=None, third=None):
    """A math node `op` over up to three inputs, each a socket or a number."""
    node = nodes.new('ShaderNodeMath')
    node.operation = op
    for slot, value in ((0, first), (1, second), (2, third)):
        if value is None:
            continue
        if isinstance(value, (int, float)):
            node.inputs[slot].default_value = value
        else:
            links.new(value, node.inputs[slot])
    return node.outputs['Value']


def _cross(width):
    """A cross of icing on a cake's top: within `width` (metres) of the x or the y axis."""
    def mask(nodes, links, coord):
        sep = nodes.new('ShaderNodeSeparateXYZ')
        links.new(coord, sep.inputs['Vector'])
        near_x = _math(nodes, links, 'LESS_THAN', _math(nodes, links, 'ABSOLUTE', sep.outputs['X']), width)
        near_y = _math(nodes, links, 'LESS_THAN', _math(nodes, links, 'ABSOLUTE', sep.outputs['Y']), width)
        high = _math(nodes, links, 'GREATER_THAN', sep.outputs['Z'], 0.024)
        return _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'MAXIMUM', near_x, near_y), high)
    return mask


def _bun(radius, height, seed):
    """A round bun: domed, its sides falling to a flat, slightly flared foot."""
    profile = []
    for i in range(11):
        t = (math.pi / 2) * i / 10
        profile.append((max(radius * math.sin(t) * (1.0 + 0.05 * math.sin(t) ** 6), 1e-4), height * math.cos(t) ** 0.7))
    profile.append((radius * 0.97, 0.0))
    return shapes.wobble(shapes.lathe(profile, 28, top=True, foot=True), seed, 0.025)


@model
def soulCake(item, words, seed):
    """The Soul Cake: a round spiced bun, its top crossed with icing, its crust flecked with spice."""
    crust = Mat('soulCake', rough=0.6, spec=0.3, bump=(0.35, 220.0), pattern=('icing', _cross(0.0045), 1.0))
    item.add(_bun(0.05, 0.032, seed), crust)
    rng = np.random.RandomState(seed & 0x7fffffff)
    for _ in range(9):
        a, r = rng.uniform(0, 2 * math.pi), rng.uniform(0.012, 0.04)
        z = 0.032 * max(0.0, 1 - (r / 0.05) ** 2) ** 0.35 + 0.0005
        item.add(shapes.ellipsoid((0.0022, 0.0022, 0.001), centre=(r * math.cos(a), r * math.sin(a), z)),
                 Mat('charcoal', rough=0.8))


def _flame(height, width):
    profile = [(0.0001, height), (width * 0.35, height * 0.72), (width * 0.85, height * 0.38), (width, height * 0.2),
               (width * 0.7, height * 0.05), (0.0001, 0.0)]
    return shapes.lathe(profile, 10, top=True, foot=True)


@model
def offeringIcon(item, words, seed):
    """The Hearth Offering: a soul cake on a shallow clay dish, a tallow candle standing lit beside it."""
    dish = shapes.lathe([(0.0001, 0.012), (0.055, 0.012), (0.07, 0.018), (0.075, 0.014), (0.062, 0.002), (0.0001, 0.0)],
                        28, top=True, foot=True)
    item.add(dish, Mat('clay', rough=0.55, spec=0.35))
    item.add(shapes.moved(_bun(0.04, 0.026, seed), offset=(-0.008, 0.004, 0.012)),
             Mat('soulCake', rough=0.6, spec=0.3, bump=(0.35, 220.0), pattern=('icing', _cross(0.0036), 1.0)))
    candle = shapes.lathe([(0.0001, 0.07), (0.008, 0.069), (0.0085, 0.02), (0.009, 0.012)], 12, top=True, foot=True)
    item.add(shapes.moved(candle, offset=(0.048, -0.01, 0.0)), Mat('tallow', rough=0.5, spec=0.3))
    item.add(shapes.moved(shapes.cylinder(0.0012, 0.006), offset=(0.048, -0.01, 0.07), turn=(0, -90, 0)),
             Mat('charcoal', rough=0.9))
    item.add(shapes.moved(_flame(0.022, 0.0055), offset=(0.048, -0.01, 0.073)), Mat('festivalFlame', glow=0.85))


def _face(nodes, links, coord):
    """The turnip lantern's carved face, as cut through its skin toward the eye (-y): two slanted eyes and a wide
    jagged grin, in its own coordinates (metres)."""
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coord, sep.inputs['Vector'])
    x, z = sep.outputs['X'], sep.outputs['Z']
    front = _math(nodes, links, 'LESS_THAN', sep.outputs['Y'], -0.02)
    cut = None
    for side in (-1, 1):
        # an eye: a triangle, its point toward the nose
        ex = _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'SUBTRACT', x, side * 0.022), side)
        ez = _math(nodes, links, 'SUBTRACT', z, 0.078)
        inside = _math(nodes, links, 'MULTIPLY',
                       _math(nodes, links, 'LESS_THAN', _math(nodes, links, 'ABSOLUTE', ex), 0.015),
                       _math(nodes, links, 'LESS_THAN', _math(nodes, links, 'ABSOLUTE', ez),
                             _math(nodes, links, 'MULTIPLY_ADD', ex, 0.45, 0.0095)))
        cut = inside if cut is None else _math(nodes, links, 'MAXIMUM', cut, inside)
    # the grin: a band curved up at its ends, its top edge toothed
    mz = _math(nodes, links, 'SUBTRACT', z, _math(nodes, links, 'MULTIPLY_ADD', _math(nodes, links, 'MULTIPLY', x, x), 16.0, 0.04))
    teeth = _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'SINE', _math(nodes, links, 'MULTIPLY', x, 380.0)), 0.003)
    grin = _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'LESS_THAN', _math(nodes, links, 'ABSOLUTE', x), 0.036),
                 _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'GREATER_THAN', mz, -0.007),
                       _math(nodes, links, 'LESS_THAN', mz, _math(nodes, links, 'ADD', teeth, 0.008))))
    return _math(nodes, links, 'MULTIPLY', _math(nodes, links, 'MAXIMUM', cut, grin), front)


@model
def turnipLantern(item, words, seed):
    """The turnip lantern: a fat turnip, violet at its shoulders fading to white, its face carved through and lit
    from within, its leaves standing up from its crown and its root trailing below."""
    profile = []
    for i in range(15):
        t = math.pi * i / 14
        r = math.sin(t) * (0.055 + 0.008 * math.sin(2 * t))
        profile.append((max(r, 0.002), 0.06 + 0.052 * math.cos(t)))
    body = shapes.wobble(shapes.lathe(profile, 28, top=True, foot=True), seed, 0.02)
    item.add(body, Mat('turnip', rough=0.5, spec=0.35, dim=0.78, pattern=('festivalFlame', _face)))
    item.add(shapes.tube([(0, 0, 0.012), (0.003, 0, -0.004), (0.008, 0, -0.012)], 0.006, sides=6, radius_end=0.0015),
             Mat('turnip', rough=0.6))
    leaf = Mat('turnipLeaf', rough=0.6)
    for k, a in enumerate((-0.5, -0.15, 0.2, 0.55)):
        tip = (math.sin(a) * 0.036, 0.004 * k, 0.134 + 0.006 * math.cos(3 * a))
        item.add(shapes.tube([(0, 0, 0.108), (tip[0] * 0.5, tip[1], 0.122), tip], 0.0065, sides=5, radius_end=0.0025), leaf)
    # the face's glow seen through it reads as light, not as paint: the flame's ramp at its glow (pattern above)


def _strands(nodes, links, coord):
    """Straw's strands: thin streaks running down a sheaf, broken along their length."""
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coord, sep.inputs['Vector'])
    stretch = nodes.new('ShaderNodeCombineXYZ')
    links.new(_math(nodes, links, 'MULTIPLY', sep.outputs['X'], 1.0), stretch.inputs['X'])
    links.new(_math(nodes, links, 'MULTIPLY', sep.outputs['Y'], 1.0), stretch.inputs['Y'])
    links.new(_math(nodes, links, 'MULTIPLY', sep.outputs['Z'], 0.12), stretch.inputs['Z'])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 44.0
    noise.inputs['Detail'].default_value = 2.0
    links.new(stretch.outputs['Vector'], noise.inputs['Vector'])
    return _math(nodes, links, 'GREATER_THAN', noise.outputs['Fac'], 0.52)


def _cross_strands(nodes, links, coord):
    """The arms' straw: streaks running along x."""
    sep = nodes.new('ShaderNodeSeparateXYZ')
    links.new(coord, sep.inputs['Vector'])
    stretch = nodes.new('ShaderNodeCombineXYZ')
    links.new(_math(nodes, links, 'MULTIPLY', sep.outputs['X'], 0.12), stretch.inputs['X'])
    links.new(sep.outputs['Y'], stretch.inputs['Y'])
    links.new(sep.outputs['Z'], stretch.inputs['Z'])
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 44.0
    noise.inputs['Detail'].default_value = 2.0
    links.new(stretch.outputs['Vector'], noise.inputs['Vector'])
    return _math(nodes, links, 'GREATER_THAN', noise.outputs['Fac'], 0.52)


@model
def strawEffigy(item, words, seed):
    """The straw effigy: a straw man bound to a pole - his round head under a violet hood, his arms a sheaf bound
    across the pole, his body and skirt of straw tied at the waist with a cord, the pole standing below him."""
    straw = Mat('straw2', rough=0.85, bump=(0.6, 40.0), pattern=('straw2', _strands, 0.62))
    pole = Mat('festivalWood', rough=0.7, bump=(0.3, 40.0))
    item.add(shapes.lathe([(0.03, 1.75), (0.035, 0.0)], 10, top=True, foot=True), pole)
    # the body: a sheaf thick at the chest, drawn in at the waist, flared into a skirt
    body = [(0.06, 1.62), (0.17, 1.5), (0.18, 1.36), (0.14, 1.22), (0.13, 1.16)]
    item.add(shapes.wobble(shapes.lathe(body, 16, top=True, foot=True), seed, 0.04), straw)
    # the skirt: a sheaf flaring from the waist, its hem ragged where the straw ends unevenly
    rng = np.random.RandomState(seed & 0x7fffffff)
    hem = []
    for k in range(24):
        a = 2 * math.pi * k / 24
        hem.append(0.86 + rng.uniform(-0.04, 0.04))
    skirt_v, skirt_f = shapes.lathe([(0.14, 1.2), (0.2, 1.08), (0.26, 0.95), (0.28, 0.86)], 24, top=True, foot=True)
    skirt_v = [(x, y, z if z > 0.9 else hem[k % 24]) for k, (x, y, z) in enumerate(skirt_v)]
    item.add(shapes.wobble((skirt_v, skirt_f), seed + 2, 0.03), straw)
    item.add(shapes.lathe([(0.15, 1.22), (0.158, 1.18), (0.15, 1.14)], 16), Mat('hood', rough=0.6))
    # the arms: a sheaf bound across the pole, its ends ragged
    arms = shapes.wobble(shapes.moved(shapes.cylinder(0.075, 0.92, sides=10, radius_end=0.068), offset=(-0.46, 0, 1.47)),
                         seed + 1, 0.06)
    item.add(arms, Mat('straw2', rough=0.85, bump=(0.6, 40.0), pattern=('straw2', _cross_strands, 0.62)))
    for x in (-0.37, 0.37):
        item.add(shapes.moved(shapes.torus(0.078, 0.012, 12, 4), offset=(x, 0, 1.47), turn=(0, 90, 0)), Mat('rope', rough=0.9))
    # the head under its hood, and the hood itself falling to the shoulders
    item.add(shapes.ellipsoid((0.12, 0.11, 0.13), centre=(0, -0.03, 1.73)), Mat('straw2', rough=0.8, dim=0.92))
    hood = [(0.0001, 1.92), (0.11, 1.89), (0.155, 1.78), (0.16, 1.66), (0.19, 1.6), (0.15, 1.57)]
    verts, faces = shapes.lathe(hood, 18, top=True, foot=True)
    # an opening cut in the hood's front for the face, its brow and its sides kept, so the straw face shows in it
    def opening(face):
        x = np.mean([verts[i][0] for i in face])
        y = np.mean([verts[i][1] for i in face])
        z = np.mean([verts[i][2] for i in face])
        return y < -0.06 and abs(x) < 0.09 and 1.62 < z < 1.8
    open_faces = [f for f in faces if not opening(f)]
    item.add((verts, open_faces), Mat('hood', rough=0.65, bump=(0.2, 50.0)))


def _star(points, outer, inner, thick):
    """A flat five-pointed star in the xz plane, its points `outer` and its notches `inner` from its middle."""
    ring = []
    for k in range(points * 2):
        a = math.pi / 2 + math.pi * k / points
        r = outer if k % 2 == 0 else inner
        ring.append((r * math.cos(a), r * math.sin(a)))
    n = len(ring)
    verts = [(x, -thick / 2, z) for x, z in ring] + [(x, thick / 2, z) for x, z in ring]
    verts += [(0.0, -thick, 0.0), (0.0, thick, 0.0)]
    front, back = 2 * n, 2 * n + 1
    faces = [(front, (k + 1) % n, k) for k in range(n)] + [(back, n + k, n + (k + 1) % n) for k in range(n)]
    faces += [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)]
    return verts, faces


@model
def wardStaff(item, words, seed):
    """The ward-staff: a tall pole with a small skull bound to it below a five-pointed star of carved wood, a green
    stone set in the star's heart glowing."""
    wood = Mat('festivalWood', rough=0.65, bump=(0.3, 50.0))
    item.add(shapes.lathe([(0.04, 1.5), (0.048, 0.0)], 10, top=True, foot=True), wood)
    item.add(shapes.moved(_star(5, 0.4, 0.17, 0.06), offset=(0, 0, 1.74)), wood, smooth=False)
    item.add(shapes.moved(_star(5, 0.27, 0.115, 0.07), offset=(0, -0.008, 1.74)), Mat('festivalWood', rough=0.7, dim=0.72),
             smooth=False)
    item.add(shapes.ellipsoid((0.085, 0.05, 0.085), centre=(0, -0.05, 1.74)), Mat('emerald', rough=0.15, spec=0.9, glow=0.6))
    # the skull: a round cranium, its jaw narrower, two dark sockets and the nose's notch
    item.add(shapes.ellipsoid((0.12, 0.11, 0.125), centre=(0, -0.04, 1.3)), Mat('bone', rough=0.5))
    item.add(shapes.ellipsoid((0.08, 0.085, 0.055), centre=(0, -0.06, 1.19)), Mat('bone', rough=0.55))
    for x in (-0.045, 0.045):
        item.add(shapes.ellipsoid((0.03, 0.015, 0.032), centre=(x, -0.145, 1.31)), Mat('charcoal', rough=0.9))
    item.add(shapes.ellipsoid((0.012, 0.012, 0.018), centre=(0, -0.155, 1.25)), Mat('charcoal', rough=0.9))
    for z in (1.45, 1.1):
        item.add(shapes.moved(shapes.torus(0.05, 0.01, 12, 4), offset=(0, 0, z)), Mat('rope', rough=0.9))


@model
def lockpick(item, words, seed):
    """The Lockpick: a thief's pair lying together - the pick, its leather-wrapped grip at the lower left and its long
    steel shaft rising to the upper right to a bent tip; and the tension wrench along the bottom, bent up at its end,
    so the two make an angle. Drawn bold: a pick's real wire is finer than a texel at an icon's size."""
    steel = Mat('silver', rough=0.22, metal=0.2, spec=0.95)
    rise = math.radians(44)
    along = np.array([math.cos(rise), math.sin(rise), 0.0])
    grip_end = np.array([-0.05, -0.04, 0.006])
    tip = grip_end + along * 0.13
    item.add(shapes.tube([tuple(grip_end + along * 0.028), tuple(tip)], 0.0055, sides=6), steel)
    item.add(shapes.tube([tuple(tip), tuple(tip + np.array([0.008, -0.004, 0.0]))], 0.0055, sides=6), steel)
    item.add(shapes.tube([tuple(grip_end), tuple(grip_end + along * 0.034)], 0.0105, sides=10, radius_end=0.0095),
             Mat('leather', rough=0.65, bump=(0.4, 300.0)))
    wrench = [(-0.03, -0.052, 0.004), (0.058, -0.052, 0.004), (0.064, -0.046, 0.004), (0.066, -0.03, 0.004)]
    item.add(shapes.moved(shapes.tube(wrench, 0.0052, sides=4), scale=(1, 1, 0.6)), steel, smooth=False)


@model
def starglass(item, words, seed):
    """Starfall Glass: a shard of the fallen star's glass, cut in long facets, pale lilac lit from within, a violet
    vein running through it."""
    rng = np.random.RandomState(seed & 0x7fffffff)
    ring = []
    for k in range(6):
        a = 2 * math.pi * k / 6 + rng.uniform(-0.2, 0.2)
        ring.append((0.021 * math.cos(a) * rng.uniform(0.8, 1.15), 0.013 * math.sin(a), 0.0))
    verts = [v for v in ring] + [(x * 1.08, y * 1.08, 0.034) for x, y, _ in ring] + [(0.003, 0.0, 0.07), (0.0, 0.0, -0.022)]
    top, foot = 12, 13
    faces = [(k, (k + 1) % 6, 6 + (k + 1) % 6, 6 + k) for k in range(6)]
    faces += [(6 + k, 6 + (k + 1) % 6, top) for k in range(6)] + [((k + 1) % 6, k, foot) for k in range(6)]
    from .gems import _split
    lit, dark = _split((verts, faces))
    item.add(shapes.moved(lit, turn=(-6, 14, 0)), Mat('starGlass', rough=0.25, spec=0.8, glow=0.08, steps=5, dim=0.86),
             smooth=False)
    item.add(shapes.moved(dark, turn=(-6, 14, 0)), Mat('starGlass', rough=0.25, spec=0.8, glow=0.08, steps=5, dim=0.66),
             smooth=False)
    vein = [(0.004, -0.009, 0.0), (-0.003, -0.011, 0.025), (0.004, -0.009, 0.05)]
    item.add(shapes.moved(shapes.tube(vein, 0.0028, sides=4), turn=(-6, 14, 0)), Mat('starVein', glow=0.35))
    for k in range(4):
        fleck = (rng.uniform(-0.012, 0.012), -0.011, rng.uniform(0.01, 0.05))
        item.add(shapes.moved(shapes.ellipsoid((0.0022, 0.002, 0.0022), centre=fleck), turn=(-6, 14, 0)),
                 Mat('starVein', glow=0.35))


@model
def weirKey(item, words, seed):
    """The Weir Key: a heavy gilded key - its bow a thick ring round a blue stone, a collar where the bow meets the
    shank, and a bit of two stepped wards."""
    gold = Mat('weirGold', rough=0.3, metal=0.25, spec=0.85)
    turn = (0, 0, 8)
    item.add(shapes.moved(shapes.torus(0.016, 0.0055, 24, 8), offset=(-0.03, 0, 0.004), turn=turn), gold)
    item.add(shapes.moved(shapes.ellipsoid((0.009, 0.009, 0.006), centre=(-0.03, 0, 0.005)), turn=turn),
             Mat('weirStone', rough=0.15, spec=0.95, glow=0.15))
    item.add(shapes.moved(shapes.cylinder(0.0052, 0.066, sides=10), offset=(-0.014, 0, 0.004), turn=turn), gold)
    item.add(shapes.moved(shapes.cylinder(0.0065, 0.008, sides=10), offset=(-0.012, 0, 0.004), turn=turn), gold,
             bevel=0.001)
    item.add(shapes.moved(shapes.box(0.008, 0.016, 0.004, (0.03, -0.012, 0.004)), turn=turn), gold, smooth=False,
             bevel=0.0008)
    item.add(shapes.moved(shapes.box(0.012, 0.024, 0.004, (0.044, -0.016, 0.004)), turn=turn), gold, smooth=False,
             bevel=0.0008)
