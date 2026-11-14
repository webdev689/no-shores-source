"""The Aurum coffer's two pictures (src/world/aurumCofferArt.js), the billboard a dungeon stands where the coffer's 3D
chest cannot be drawn: a chest of dark oak planks bound in gold, shut, or open and heaped with glowing gold. Both are one
chest: the open one only lifts the lid back on its hinge, so the body stands texel for texel where the shut one's does
(each row sets the picture in its painted canvas, on its foot: tools/sprite-forge/specs/pictures/coffer.json). It stands
square to the eye, which looks down on it a little as on a chest at the player's feet: turned, the open lid would reach
past the shut chest's sides and the two would stand at two sizes.
"""
import math

import numpy as np

from . import shapes
from .kit import Mat
from .models import model

WIDTH, DEPTH = 0.8, 0.42       # the body, metres
PLINTH, BODY = 0.045, 0.3      # the gold plinth's height, then the oak body's above it
ARCH = 0.17                    # the barrel lid's rise above the body
STRAPS = (-0.25, 0.25)         # the two gold straps' places across the front
TOP = PLINTH + BODY            # where the lid sits
OPENED = 140.0                 # degrees the open lid swings back on its hinge
GOLD = {'rough': 0.32, 'metal': 0.2, 'spec': 0.8}


def _facing(mesh, x, z, proud):
    """A part built round its own z axis, stood on the coffer's front face at (x, z), its axis toward the eye."""
    return shapes.moved(mesh, offset=(x, -DEPTH / 2 - proud, z), turn=(90.0, 0.0, 0.0))


def _arch(width, half_depth, rise, base=0.0, inner=None, steps=18, x0=None):
    """A barrel lid's shell along x: an elliptical arch over the depth (y), `rise` tall from `base`, `width` long; with
    `inner` (a share) hollowed to that share of the arch, so its underside is a concave inside. `x0` its left end."""
    start = -width / 2 if x0 is None else x0
    outer = [(-half_depth * math.cos(math.pi * k / steps), base + rise * math.sin(math.pi * k / steps))
             for k in range(steps + 1)]
    share = 0.0 if inner is None else inner
    inside = [(y * share if inner else y, base + (z - base) * share) for y, z in reversed(outer)]
    section = outer + inside
    count = len(section)
    verts = [(start, y, z) for y, z in section] + [(start + width, y, z) for y, z in section]
    faces = [(k, (k + 1) % count, count + (k + 1) % count, count + k) for k in range(count)]
    for k in range(steps):   # each end a strip between the outer arch and the inner
        out_low, out_high = k, k + 1
        in_high, in_low = count - 1 - (k + 1), count - 1 - k
        faces.append((in_low, in_high, out_high, out_low))
        faces.append((count + out_low, count + out_high, count + in_high, count + in_low))
    return verts, faces


def _flattened(mesh, front):
    """A part pressed flat against the front (`front` its y): every vertex more than a centimetre before it drawn back
    to that centimetre, so a round tube lies on the face as a strap."""
    verts, faces = mesh
    return [(x, max(y, front - 0.01), z) for x, y, z in verts], faces


def _plank_mats(dims):
    """One oak look a plank: the planks a step apart in light, so a run of them reads plank by plank."""
    return [Mat('festivalWood', rough=0.75, spec=0.25, bump=(0.35, 90.0), dim=dim) for dim in dims]


def _body(item, gold, studs):
    """The body: a gold plinth, oak walls of three planks a side round a gold-lined hollow, gold brackets at its corners
    and the two straps, a gold band round its top; the studs' places along the straps and brackets go into `studs`."""
    item.add(shapes.box(WIDTH + 0.04, DEPTH + 0.04, PLINTH, (0, 0, PLINTH / 2)), gold, smooth=False,
             bevel=0.008)
    wall = 0.035
    planks = _plank_mats((1.0, 0.84, 0.94))
    tall = BODY / 3
    for k, mat in enumerate(planks):
        z = PLINTH + tall * (k + 0.5)
        for size, centre in (((WIDTH, wall, tall), (0, -DEPTH / 2 + wall / 2, z)),
                             ((WIDTH, wall, tall), (0, DEPTH / 2 - wall / 2, z)),
                             ((wall, DEPTH - 2 * wall, tall), (-WIDTH / 2 + wall / 2, 0, z)),
                             ((wall, DEPTH - 2 * wall, tall), (WIDTH / 2 - wall / 2, 0, z))):
            item.add(shapes.box(*size, centre), mat, smooth=False, bevel=0.004)
    item.add(shapes.box(WIDTH - 2 * wall, DEPTH - 2 * wall, 0.02, (0, 0, PLINTH + 0.01)), planks[1],
             smooth=False)
    # the lining, gilded: seen only once the lid is up, glowing a little in the hollow
    lining = Mat('gold', rough=0.4, metal=0.15, spec=0.6, glow=0.32)
    inner_w, inner_d, low = WIDTH - 2 * wall - 0.004, DEPTH - 2 * wall - 0.004, PLINTH + 0.02
    for size, centre in (((inner_w, 0.004, BODY - 0.02), (0, inner_d / 2, low + (BODY - 0.02) / 2)),
                         ((inner_w, 0.004, BODY - 0.02), (0, -inner_d / 2, low + (BODY - 0.02) / 2)),
                         ((0.004, inner_d, BODY - 0.02), (-inner_w / 2, 0, low + (BODY - 0.02) / 2)),
                         ((0.004, inner_d, BODY - 0.02), (inner_w / 2, 0, low + (BODY - 0.02) / 2)),
                         ((inner_w, inner_d, 0.004), (0, 0, low + 0.002))):
        item.add(shapes.box(*size, centre), lining, smooth=False)
    band = 0.032
    item.add(shapes.box(WIDTH + 0.016, DEPTH + 0.016, band, (0, 0, TOP - band / 2)), gold, smooth=False,
             bevel=0.005)
    for x in STRAPS:
        item.add(shapes.box(0.062, DEPTH + 0.012, BODY - band, (x, 0, PLINTH + (BODY - band) / 2)), gold,
                 smooth=False, bevel=0.004)
        for z in (PLINTH + 0.06, PLINTH + 0.18):
            studs.append((x, z))
    # gold brackets clasp each corner at its foot and its head, the oak bare between them
    corner, clasp = 0.056, 0.075
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z in (PLINTH + clasp / 2, TOP - band - clasp / 2):
                centre = (sx * (WIDTH / 2 - corner / 2 + 0.006), sy * (DEPTH / 2 - corner / 2 + 0.006), z)
                item.add(shapes.box(corner, corner, clasp, centre), gold, smooth=False, bevel=0.005)
        for z in (PLINTH + clasp / 2, TOP - band - clasp / 2):
            studs.append((sx * (WIDTH / 2 - 0.024), z))


COIN = PLINTH + BODY * 0.47    # the coin's middle on the front


def _coin(item):
    """The lock plate, struck as the Aurum coin: a dark rim, a gold face, the sun of Aetherius - four long rays and four
    short between them - round a white heart that glows."""
    rim = shapes.lathe([(0.118, 0.0), (0.118, 0.012), (0.108, 0.017), (0.097, 0.012), (0.097, 0.0)], 36, loop=True)
    item.add(_facing(rim, 0.0, COIN, 0.002), Mat('gold', rough=0.5, metal=0.1, dim=0.36))
    face = shapes.lathe([(0.0001, 0.011), (0.099, 0.009), (0.099, 0.0)], 36, top=True)
    item.add(_facing(face, 0.0, COIN, 0.002), Mat('gold', rough=0.35, metal=0.2, spec=0.7, dim=0.86))
    sun = Mat('varla', rough=0.3, spec=0.8, glow=0.45)
    for k in range(8):
        reach, wide = (0.088, 0.03) if k % 2 == 0 else (0.052, 0.022)
        ray = shapes.prism([(0.0, -wide / 2), (reach, -wide * 0.18), (reach, wide * 0.18), (0.0, wide / 2)], 0.006)
        ray = shapes.moved(ray, turn=(0.0, 0.0, 45.0 * k))
        item.add(_facing(ray, 0.0, COIN, 0.014), sun, smooth=False)
    heart = shapes.ellipsoid((0.03, 0.03, 0.014), rings=6, sides=16)
    item.add(_facing(heart, 0.0, COIN, 0.02), Mat('varla', rough=0.3, glow=0.95))


def _studs(item, places, gold):
    """Round gold studs on the front at each (x, z)."""
    for x, z in places:
        stud = shapes.ellipsoid((0.016, 0.016, 0.01), rings=6, sides=12)
        item.add(_facing(stud, x, z, 0.008), gold)


def _lid(item, gold, opened):
    """The barrel lid: three oak planks over the arch, hollow beneath, a gold band round its foot, gold bands over its
    ends and the two straps over its crown; shut, a gold hasp from its front down to the coin. `opened` degrees it
    swings back on its hinge along the body's back top edge."""
    half = DEPTH / 2 + 0.012
    width = WIDTH + 0.02
    hinge = np.array([0.0, half, TOP])

    def swung(mesh):
        verts, faces = shapes.moved(mesh, offset=tuple(-hinge))
        verts, faces = shapes.moved((verts, faces), turn=(-opened, 0.0, 0.0), offset=tuple(hinge))
        return verts, faces
    rim = 0.026
    planks = _plank_mats((0.96, 1.0, 0.86))
    steps = 18
    verts, faces = _arch(width - 0.002, half - 0.004, ARCH, TOP + rim, inner=0.82, steps=steps)
    count = 2 * (steps + 1)
    for k, mat in enumerate(planks):
        lo, hi = k * steps // 3, (k + 1) * steps // 3
        # one plank: the arch's steps lo..hi, outside (ring face s) and in (ring face 2 * steps - s)
        own = [faces[s] for s in range(lo, hi)] + [faces[2 * steps - s] for s in range(lo, hi)]
        item.add(swung((verts, own)), mat, smooth=False)
    item.add(swung((verts, faces[count:] + [faces[steps], faces[count - 1]])), planks[1], smooth=False)
    shell = Mat('gold', **GOLD)
    for x0 in (-width / 2 - 0.004, width / 2 - 0.028):
        item.add(swung(_arch(0.032, half + 0.006, ARCH + 0.008, TOP + rim - 0.002, inner=0.8, x0=x0)), shell,
                 smooth=False)
    for x in STRAPS:
        item.add(swung(_arch(0.062, half + 0.006, ARCH + 0.008, TOP + rim - 0.002, inner=0.8, x0=x - 0.031)), shell,
                 smooth=False)
    frame = []
    for size, centre in (((width + 0.008, 0.03, rim), (0, -half + 0.011, TOP + rim / 2)),
                         ((width + 0.008, 0.03, rim), (0, half - 0.011, TOP + rim / 2)),
                         ((0.03, 2 * half, rim), (-width / 2 + 0.011, 0, TOP + rim / 2)),
                         ((0.03, 2 * half, rim), (width / 2 - 0.011, 0, TOP + rim / 2))):
        frame.append(shapes.box(*size, centre))
    item.add(swung(shapes.joined(*frame)), shell, smooth=False, bevel=0.004)
    if opened:
        # the lid's inside: rivets where the straps' ends are clenched through it
        for x in STRAPS:
            for angle in (35.0, 90.0, 145.0):
                at = (x, -(half - 0.004) * 0.8 * math.cos(math.radians(angle)),
                      TOP + rim + ARCH * 0.8 * math.sin(math.radians(angle)))
                item.add(swung(shapes.ellipsoid((0.015, 0.015, 0.015), at, 6, 12)), shell)
    else:
        # the hasp: a gold tongue from the lid's front down over the band to the coin's top
        tongue = [(0.0, -half - 0.006, TOP + rim + ARCH * 0.45), (0.0, -half - 0.01, TOP + rim * 0.4),
                  (0.0, -DEPTH / 2 - 0.016, TOP - 0.04), (0.0, -DEPTH / 2 - 0.016, COIN + 0.1)]
        item.add(_flattened(shapes.tube(tongue, 0.022, sides=4), -DEPTH / 2 - 0.012), shell, smooth=False)


@model
def cofferShut(item, words, seed):
    """The Aurum coffer shut and full: dark oak planks bound in gold - the plinth, the corners, two straps over the
    body and the barrel lid, bands round the lid's ends and foot, studs - and the Aurum coin struck on its lock plate,
    a gold hasp from the lid down to it. No words."""
    gold = Mat('gold', **GOLD)
    studs = []
    _body(item, gold, studs)
    _coin(item)
    _studs(item, studs, gold)
    _lid(item, gold, 0.0)


@model
def cofferOpen(item, words, seed):
    """The Aurum coffer open: the same chest, its lid thrown back on its hinge to stand behind it, the lid's oak inside
    and its gold frame toward the eye, the gold-lined hollow heaped with coins above its rim. No words."""
    gold = Mat('gold', **GOLD)
    studs = []
    _body(item, gold, studs)
    _coin(item)
    _studs(item, studs, gold)
    _lid(item, gold, OPENED)
    _hoard(item, seed)


# the hoard's crown over the rim: the eye looks down only a little, so the heap must stand this far proud of the band
# before its middle shows over the front rim, a few texels of it
HOARD_RISE = 0.12
HOARD_COINS = 16


def _hoard(item, seed):
    """The coins heaped in the open hollow: a mound of gold glowing a little, its crown over the rim, and loose coins
    lying tilted on it, each catching the light its own way, two of them glinting."""
    rng = np.random.default_rng(seed)
    half_w, half_d = WIDTH / 2 - 0.04, DEPTH / 2 - 0.04
    tall = HOARD_RISE + 0.04
    base = TOP - 0.04
    mound = shapes.wobble(shapes.ellipsoid((half_w, half_d, tall), centre=(0, 0, base), rings=12, sides=24, flat=0.5),
                          seed, 0.04)
    item.add(mound, Mat('gold', rough=0.45, metal=0.15, spec=0.7, glow=0.38, bump=(0.6, 220.0)))
    loose = Mat('gold', rough=0.3, metal=0.2, spec=0.9, glow=0.22, dim=1.15)
    tops = []
    for _ in range(HOARD_COINS):
        u, v = rng.uniform(-0.75, 0.75), rng.uniform(-0.8, 0.35)   # the near half shows over the rim
        if u * u + v * v > 0.7:
            continue
        x, y = u * half_w, v * half_d
        z = base + tall * math.sqrt(max(0.0, 1.0 - u * u - v * v)) + 0.002
        coin = shapes.cylinder(0.026, 0.006, sides=12)
        tilt = rng.uniform(10.0, 35.0)
        item.add(shapes.moved(coin, offset=(x, y, z), turn=(rng.uniform(-tilt, tilt), -90.0 + rng.uniform(-tilt, tilt),
                                                            rng.uniform(0.0, 360.0))), loose)
        tops.append((x, y, z + 0.006))
    if tops:   # the nearest coin glints, and the one farthest across from it
        first = min(tops, key=lambda p: p[1])
        for point in {first, max(tops, key=lambda p: abs(p[0] - first[0]))}:
            item.sparkle(point, ramp='varla', arm=1)
