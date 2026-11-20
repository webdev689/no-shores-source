"""The sanctum's frame: the clustered pillar, the wall's triple colonnette rising as ribs, the bosses where the ribs
meet overhead, and the inlaid circles on the floor. Shafts carry only upright detail, as the page stretches them.
These are laid by the hundred, so their ends and undersides that nobody sees are left open, and runes are plates.
"""
import math

import details
from shapes import TAU, dot, facing, flat, mul, normal_of, sub, unit

from . import motifs
from .motifs import ROUND

# The pillar's plan: four great shafts round a core, four slender ones in the hollows between.
GREAT = [(0.17 * math.cos(turn), 0.17 * math.sin(turn)) for turn in (0.0, TAU / 4, TAU / 2, 3 * TAU / 4)]
GREAT_R = 0.115
SLENDER = [(0.135 * math.cos(turn), 0.135 * math.sin(turn)) for turn in (TAU * k / 8 for k in (1, 3, 5, 7))]
SLENDER_R = 0.045
# The wall's three: a middle shaft and two smaller beside it, engaged in the wall.
TRIPLE = [((0.0, 0.1), 0.095, 8), ((0.19, 0.07), 0.065, 6), ((-0.19, 0.07), 0.065, 6)]
EIGHTH = math.radians(22.5)


def springer(start, end, steps=8):
    """Points (r, z) of a rib leaving `start` upright and meeting `end` level: a quarter ellipse."""
    (r0, z0), (r1, z1) = start, end
    quarter = [math.pi / 2 * k / steps for k in range(steps + 1)]
    return [(r0 + (r1 - r0) * (1 - math.cos(turn)), z0 + (z1 - z0) * math.sin(turn)) for turn in quarter]


def rib(kit, turn, start, end, width=0.05, depth=0.1, part='trim', centre=(0.0, 0.0), steps=6):
    """A keeled rib along a springer, turned `turn` radians about the upright through `centre`, its keel toward the
    springer's hollow side (out and down): a vault rib as seen from below."""

    def at(r, z):
        return (centre[0] + r * math.cos(turn), centre[1] + r * math.sin(turn), z)

    hollow = at(end[0], start[1])

    def keel_of(point, direction):
        toward = sub(hollow, point)
        return unit(sub(toward, mul(direction, dot(toward, direction))))

    points = [at(r, z) for r, z in springer(start, end, steps)]
    return kit.mesh(motifs.keeled(points, width, depth, keel_of), part, 'rib', None, False)


def octagon(kit, low, high, flat, part='trim', bottom=None):
    """An octagonal block, its flats `flat` from the middle facing the axes; its foot `bottom` if it flares."""
    corner = flat / math.cos(EIGHTH)
    seam = (math.sin(EIGHTH), -math.cos(EIGHTH), 0.0)
    foot = corner if bottom is None else bottom / math.cos(EIGHTH)
    return kit.frustum((0.0, 0.0, low), (0.0, 0.0, high), foot, corner, sides=8, seam=seam, part=part, smooth=None)


def water_base(kit, x, y, low, radius, sides=8):
    """A colonnette's faceted base: a plinth, a chamfer, a roll and a hollow up to the shaft."""
    profile = [(radius + 0.04, 0.0), (radius + 0.04, 0.035), (radius + 0.012, 0.07), (radius + 0.02, 0.095),
               (radius, 0.13)]
    return motifs.turned(kit, profile, x, y, low, sides, smooth=None)


def bell(kit, x, y, radius, flare, sides=8, part='stone'):
    """A capital's faceted bell over a shaft: a necking band, then flaring by `flare`."""
    return motifs.turned(kit, [(radius, 0.0), (radius + 0.015, 0.035), (radius + flare, 0.18)], x, y, 0.0, sides,
                         part, smooth=None)


def pillar_base(kit):
    """A stepped octagonal plinth under the cluster's eight faceted bases."""
    made = [octagon(kit, 0.0, 0.16, 0.5), octagon(kit, 0.16, 0.25, 0.44, bottom=0.5)]
    made += [water_base(kit, x, y, 0.25, GREAT_R) for x, y in GREAT]
    made += [motifs.turned(kit, [(SLENDER_R + 0.03, 0.0), (SLENDER_R + 0.03, 0.05), (SLENDER_R, 0.15)], x, y, 0.25, 6,
                           smooth=None) for x, y in SLENDER]
    return kit.join(made)


def pillar_shaft(kit):
    """Four great dark shafts, each keeled, four slender ones between, round an octagonal core: all upright."""
    made = [kit.mesh(motifs.swept([(0, 0, 0.0), (0, 0, 1.0)], 0.2, 8, caps=False), 'stone', 'core', None, False)]
    made += [motifs.shaft(kit, x, y, 0.0, 1.0, GREAT_R, sides=10) for x, y in GREAT]
    made += [motifs.shaft(kit, x, y, 0.0, 1.0, SLENDER_R, 'stone', sides=6) for x, y in SLENDER]
    made += [motifs.plates(kit, _keel(turn), 'trim', 'keel') for turn in range(4)]
    return kit.join(made)


def _keel(quarter):
    """A fillet down a great shaft's face, `quarter` quarter turns round: its front and two sides, its ends in the
    base and capital. Made in place, so its faces keep their own flat UVs."""
    x0, x1, half = 0.17 + GREAT_R - 0.008, 0.17 + GREAT_R + 0.012, 0.012
    cos, sin = round(math.cos(quarter * TAU / 4)), round(math.sin(quarter * TAU / 4))

    def turned(x, y, z):
        return (x * cos - y * sin, x * sin + y * cos, z)

    faces = [([(x1, -half, 0.0), (x1, half, 0.0), (x1, half, 1.0), (x1, -half, 1.0)], (1, 0, 0)),
             ([(x0, -half, 0.0), (x1, -half, 0.0), (x1, -half, 1.0), (x0, -half, 1.0)], (0, -1, 0)),
             ([(x1, half, 0.0), (x0, half, 0.0), (x0, half, 1.0), (x1, half, 1.0)], (0, 1, 0))]
    return [facing(flat([turned(*point) for point in face]), turned(*way)) for face, way in faces]


def pillar_capital(kit):
    """Bells over the shafts, an octagonal drum cut with a rune on each face, a broad abacus, and eight keeled ribs
    springing from it to meet the vault."""
    made = [bell(kit, x, y, GREAT_R, 0.06) for x, y in GREAT]
    made += [motifs.turned(kit, [(SLENDER_R, 0.0), (SLENDER_R + 0.035, 0.18)], x, y, 0.0, 6, 'stone', smooth=None)
             for x, y in SLENDER]
    made.append(octagon(kit, 0.17, 0.34, 0.37, part='relief'))
    flat = 0.37
    width = 2 * flat * math.tan(EIGHTH) * 0.5
    carved = []
    for face in range(8):
        turn = face * TAU / 8
        out = (math.cos(turn), math.sin(turn), 0.0)
        along = (-math.sin(turn), math.cos(turn), 0.0)
        origin = (out[0] * flat - along[0] * width / 2, out[1] * flat - along[1] * width / 2, 0.195)
        carved += motifs.glyph(motifs.rune(f'pillar.capital.{face}'), origin, along, (0.0, 0.0, 1.0), width, 0.12,
                               0.018, 0.004, front_only=True)
    made.append(motifs.plates(kit, carved, 'trim', 'runes'))
    made += [octagon(kit, 0.34, 0.38, 0.46, bottom=0.39), octagon(kit, 0.38, 0.45, 0.46)]
    for number in range(8):
        reach = 0.66 if number % 2 == 0 else 0.86
        made.append(rib(kit, number * TAU / 8, (0.3, 0.45), (reach, 0.69)))
    return kit.join(made)


def _plan(half, depth, cut):
    """A half-octagon's outline (x, y) standing out of the wall: `half` wide each way, `depth` out, its front
    corners cut by `cut`."""
    return [(-half, 0.0), (half, 0.0), (half, depth - cut), (half - cut, depth), (cut - half, depth),
            (-half, depth - cut)]


def wall_base(kit):
    """A half-octagon plinth and the three shafts' faceted bases."""
    made = [kit.extrude_outline(_plan(0.36, 0.24, 0.1), 0.0, 0.27, part='trim')]
    made += [water_base(kit, x, y, 0.27, radius, sides) for (x, y), radius, sides in TRIPLE]
    return kit.join(made)


def wall_shaft(kit):
    """The triple colonnette, keeled in front, against a flat dosseret."""
    dosseret = [((-0.3, 0.04), (0.3, 0.04), (0, 1, 0)), ((0.3, 0.0), (0.3, 0.04), (1, 0, 0)),
                ((-0.3, 0.04), (-0.3, 0.0), (-1, 0, 0)), ((-0.012, 0.205), (0.012, 0.205), (0, 1, 0)),
                ((0.012, 0.18), (0.012, 0.205), (1, 0, 0)), ((-0.012, 0.205), (-0.012, 0.18), (-1, 0, 0))]
    faces = [facing(flat([(a[0], a[1], 0.0), (b[0], b[1], 0.0), (b[0], b[1], 1.0), (a[0], a[1], 1.0)]), way)
             for a, b, way in dosseret]
    made = [motifs.plates(kit, faces[:3], 'stone', 'dosseret'), motifs.plates(kit, faces[3:], 'trim', 'keel')]
    made += [motifs.shaft(kit, x, y, 0.0, 1.0, radius, sides=sides) for (x, y), radius, sides in TRIPLE]
    return kit.join(made)


def wall_cap(kit):
    """Bells, a rune band and an abacus round the three shafts, and three keeled ribs springing from it, one across
    the room and two diagonal, to meet the vault at the cap's top."""
    made = [bell(kit, x, y, radius, 0.04, sides) for (x, y), radius, sides in TRIPLE]
    made.append(kit.extrude_outline(_plan(0.36, 0.24, 0.1), 0.18, 0.34, part='relief'))
    carved = []
    for number, (start, end) in enumerate((((0.36, 0.14), (0.26, 0.24)), ((0.08, 0.24), (-0.08, 0.24)),
                                           ((-0.26, 0.24), (-0.36, 0.14)))):
        along = (end[0] - start[0], end[1] - start[1])
        size = math.hypot(*along)
        along = (along[0] / size, along[1] / size, 0.0)
        origin = (start[0] + along[0] * size * 0.15, start[1] + along[1] * size * 0.15, 0.2)
        carved += motifs.glyph(motifs.rune(f'wall.cap.{number}'), origin, along, (0.0, 0.0, 1.0), size * 0.7, 0.12,
                               0.016, 0.004, front_only=True)
    made.append(motifs.plates(kit, carved, 'trim', 'runes'))
    made.append(kit.extrude_outline(_plan(0.42, 0.29, 0.12), 0.34, 0.44, part='trim'))
    made.append(rib(kit, TAU / 4, (0.14, 0.44), (0.54, 1.09), 0.055, 0.11))
    for hand in (1, -1):
        made.append(rib(kit, math.atan2(1.0, hand * 1.0), (0.2, 0.44), (0.72, 1.09)))
    return kit.join(made)


def ceiling_a(kit):
    """A pendant boss whose flutes twist like a shell, four ribs meeting it, and a brass censer hung on a chain."""
    boss = [(0.26, 0.0), (0.27, -0.08), (0.2, -0.2), (0.13, -0.31), (0.06, -0.42), (0.0, -0.48)]
    made = [kit.mesh(motifs.lobed(boss, lobes=8, depth=0.12, sides=16, caps=False), 'relief', 'boss', None, False)]
    made += [rib(kit, number * TAU / 4 + TAU / 8, (0.22, -0.22), (0.9, -0.012), part='stone') for number in range(4)]
    made.append(kit.chain([(0.0, 0.0, -0.45), (0.0, 0.0, -1.05)], link=0.12, wire=0.012, sides=4, tube_sides=3,
                          part='brass'))
    made.append(motifs.turned(kit, [(0.045, 0.0), (0.035, 0.04), (0.0, 0.06)], 0.0, 0.0, -1.1, 6, 'brass', True))
    for number in range(3):
        turn = number * TAU / 3
        made.append(motifs.tube(kit, [(0.15 * math.cos(turn), 0.15 * math.sin(turn), -1.45),
                                      (0.02 * math.cos(turn), 0.02 * math.sin(turn), -1.09)], 0.006, 'brass', 3))
    censer = [(0.0, 0.0), (0.04, 0.02), (0.13, 0.1), (0.15, 0.16), (0.12, 0.2), (0.05, 0.29), (0.0, 0.33)]
    made.append(kit.mesh(motifs.lobed(censer, lobes=4, depth=0.08, centre=(0.0, 0.0, -1.62), sides=8), 'brass',
                         'censer', ROUND))
    return kit.join(made)


def ceiling_b(kit):
    """A plain round boss stepped in rings like spreading ripples, four ribs running into it."""
    profile = [(0.34, 0.0), (0.33, -0.04), (0.28, -0.07), (0.25, -0.11), (0.18, -0.13), (0.14, -0.18), (0.07, -0.2),
               (0.0, -0.24)]
    made = [motifs.turned(kit, profile, 0.0, 0.0, 0.0, 16, 'trim')]
    made += [rib(kit, number * TAU / 4, (0.3, -0.12), (1.05, -0.012), part='stone') for number in range(4)]
    return kit.join(made)


def ceiling_c(kit):
    """A star boss: an eight-pointed carved star, a brass star on it and a fluted drop, and ribs running out from its
    points into a wider star."""
    made = [kit.bevel(kit.extrude_outline(motifs.star(8, 0.6, 0.27), -0.07, 0.0, part='relief'), 0.012),
            kit.extrude_outline(motifs.star(8, 0.36, 0.17, math.pi / 8), -0.09, -0.07, part='brass'),
            kit.mesh(motifs.lobed([(0.15, -0.09), (0.15, -0.13), (0.09, -0.19), (0.0, -0.25)], lobes=8, depth=0.1,
                                  sides=16, caps=False), 'relief', 'drop', ROUND, False)]
    ends = []
    for number in range(8):
        turn = number * TAU / 8
        made.append(kit.mesh(motifs.keeled([(0.55 * math.cos(turn), 0.55 * math.sin(turn), -0.012),
                                            (1.45 * math.cos(turn), 1.45 * math.sin(turn), -0.012)], 0.05, 0.1, down),
                             'stone', 'rib', None, False))
        ends.append((1.45 * math.cos(turn), 1.45 * math.sin(turn), -0.012))
        middle = turn + TAU / 16
        ends.append((0.98 * math.cos(middle), 0.98 * math.sin(middle), -0.012))
    made.append(kit.mesh(motifs.keeled(ends + ends[:1], 0.04, 0.08, down), 'trim', 'liernes', None, False))
    return kit.join(made)


def down(point, direction):
    """A keel straight down: a rib lying along a flat vault."""
    return (0.0, 0.0, -1.0)


def floor_a(kit):
    """A rune circle 2 m across: a brass ring round a band of brass runes, an inner brass ring, rays, and a crescent
    on a disc at its heart; inlays a hair proud of the floor."""
    made = [motifs.plates(kit, motifs.annulus(0.94, 1.0, 0.0, 0.018, 20, walls='outer'), 'brass', 'ring'),
            motifs.plates(kit, motifs.annulus(0.72, 0.94, 0.0, 0.008, 20, walls=False), 'relief', 'band'),
            motifs.plates(kit, motifs.annulus(0.68, 0.72, 0.0, 0.014, 20, walls=False), 'brass', 'ring'),
            motifs.plates(kit, motifs.annulus(0.0, 0.2, 0.0, 0.01, 12, walls=False), 'relief', 'heart')]
    carved = []
    for number in range(10):
        turn = number * TAU / 10
        out = (math.cos(turn), math.sin(turn), 0.0)
        along = (math.sin(turn), -math.cos(turn), 0.0)
        origin = (0.75 * out[0] - 0.055 * along[0], 0.75 * out[1] - 0.055 * along[1], 0.0)
        carved += motifs.glyph(motifs.rune(f'floor.a.{number}'), origin, along, out, 0.11, 0.16, 0.022, 0.013,
                               front_only=True)
    for number in range(8):
        turn = number * TAU / 8 + TAU / 16
        reach = 0.64 if number % 2 == 0 else 0.45
        way = (math.cos(turn), math.sin(turn), 0.0)
        middle = ((0.22 + reach) / 2 * way[0], (0.22 + reach) / 2 * way[1], 0.0)
        carved += motifs.slab(middle, way, (-way[1], way[0], 0.0), (reach - 0.22) / 2, 0.014, 0.012,
                              front_only=True)
    crescent = [(0.13 * a, 0.13 * b - 0.03, 0.014) for a, b in motifs.crescent(1.0, 0.78, 0.42, 6)]
    crescent = crescent if normal_of(crescent)[2] > 0 else crescent[::-1]
    made += [motifs.plates(kit, carved, 'brass', 'inlay'), kit.polygon(crescent, part='brass')]
    return kit.join(made)


def floor_b(kit):
    """A mosaic medallion 1.9 m across: rings of tesserae turned into a three-armed whirlpool of brass round a dark eye,
    a few tiles lost; each tile only its top, a hair proud."""
    draw = details.seeded('floor.b')
    radii = [0.12, 0.27, 0.42, 0.57, 0.72, 0.87]
    parts = {'brass': [], 'trim': [], 'stoneAlt': [], 'relief': []}
    for ring_number, (inner, outer) in enumerate(zip(radii, radii[1:])):
        middle = (inner + outer) / 2
        count = max(8, round(TAU * middle / 0.165))
        for tile in range(count):
            if draw.random() < 0.05:
                continue
            start, end = TAU * tile / count, TAU * (tile + 1) / count
            gap = 0.007 / middle
            arm = ((start + end) / 2 - 2.6 * middle) % (TAU / 3)
            part = ('brass' if arm < 0.6 else 'relief' if arm < 0.85 else
                    'trim' if ring_number % 2 == 0 else 'stoneAlt')
            parts[part] += motifs.annulus(inner + 0.007, outer - 0.007, 0.0, draw.uniform(0.007, 0.012), 1,
                                          start=start + gap, end=end - gap, walls=False)
    made = [motifs.plates(kit, faces, part, 'tiles') for part, faces in parts.items() if faces]
    made += [motifs.plates(kit, motifs.annulus(0.0, 0.11, 0.0, 0.01, 8, walls=False), 'stoneAlt', 'eye'),
             motifs.plates(kit, motifs.annulus(0.88, 0.93, 0.0, 0.014, 16, walls=False), 'trim', 'border'),
             motifs.plates(kit, motifs.annulus(0.93, 0.95, 0.0, 0.016, 16, walls='outer'), 'brass', 'border')]
    return kit.join(made)


def build(kit):
    return {'pillar.base': pillar_base(kit), 'pillar.shaft': pillar_shaft(kit), 'pillar.capital': pillar_capital(kit),
            'wall.base': wall_base(kit), 'wall.shaft': wall_shaft(kit), 'wall.cap': wall_cap(kit),
            'ceiling.a': ceiling_a(kit), 'ceiling.b': ceiling_b(kit), 'ceiling.c': ceiling_c(kit),
            'floor.a': floor_a(kit), 'floor.b': floor_b(kit)}
