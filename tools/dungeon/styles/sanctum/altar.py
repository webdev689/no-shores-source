"""The Altar of the Deep (landmarks.json's sanctum.altar), against its room's north wall and facing south: a stepped
platform, an altar of lit candles, a tall idol that is not quite any creature under a pointed arch, its carved crown
spread over the wall, banners either side, and braziers burning before the steps. Also the braziers the Ritual
Circle shares.
"""
import math

import details
from shapes import TAU

from . import doors, furnishings, motifs
from .motifs import ROUND

SIZE = 6.4


def floor(kit):
    """The landmark's own floor over its whole footprint."""
    return kit.polygon([(0.0, 0.0, 0.0), (SIZE, 0.0, 0.0), (SIZE, SIZE, 0.0), (0.0, SIZE, 0.0)], part='floor')


def flame(kit, x, y, z, height, radius, seed):
    """A small flame, leaning a little."""
    draw = details.seeded(seed)
    tip = (x + draw.uniform(-0.2, 0.2) * height, y + draw.uniform(-0.2, 0.2) * height, z + height)
    return kit.cone((x, y, z), tip, radius, 0.0, sides=6, part='glow', smooth=ROUND)


def lit_candle(kit, x, y, z, height, radius, seed):
    """A candle with its flame."""
    return kit.join([furnishings.candle(kit, x, y, z, height, radius, seed),
                     flame(kit, x, y, z + height + 0.008, 0.045 + radius, radius * 0.6, seed)])


def brazier(kit, x, y, seed):
    """A brazier 1 m to its rim within 0.3 of (x, y): a fluted brass bowl of coals and flames on a knopped stem, and
    three iron legs curling at their feet."""
    draw = details.seeded(seed)
    bowl = [(0.05, 0.0), (0.12, 0.04), (0.2, 0.11), (0.255, 0.2), (0.275, 0.26), (0.28, 0.28), (0.26, 0.28),
            (0.24, 0.23), (0.0, 0.21)]
    made = [kit.mesh(motifs.lobed(bowl, lobes=10, depth=0.05, centre=(x, y, 0.72), sides=30), 'brass', 'bowl', ROUND),
            kit.lathe([(0.045, 0.0), (0.065, 0.03), (0.04, 0.07), (0.034, 0.17), (0.06, 0.21), (0.034, 0.25),
                       (0.05, 0.32)], x, y, 0.4, sides=10, part='brass', smooth=ROUND),
            kit.ring((x, y, 0.3), 0.13, 0.012, sides=14, tube_sides=4, part='iron', smooth=ROUND),
            kit.rock(x, y, 0.9, (0.44, 0.44, 0.09), seed=f'{seed}.coals', detail=1, roughness=0.4, part='ember')]
    for number in range(3):
        turn = number * TAU / 3 + draw.uniform(-0.1, 0.1)
        way = (math.cos(turn), math.sin(turn))
        path = [(0.03, 0.58), (0.1, 0.48), (0.17, 0.3), (0.23, 0.12), (0.27, 0.035), (0.29, 0.06), (0.275, 0.09),
                (0.255, 0.075)]
        points = motifs.smooth_path([(x + way[0] * r, y + way[1] * r, z) for r, z in path], 3)
        made.append(motifs.frond(kit, points, 0.024, 0.01, 'iron', sides=6))
    for number in range(6):
        turn = number * TAU / 6 + draw.uniform(0, 1)
        reach = draw.uniform(0.02, 0.15)
        made.append(flame(kit, x + reach * math.cos(turn), y + reach * math.sin(turn), 0.95,
                          draw.uniform(0.18, 0.4), draw.uniform(0.05, 0.08), f'{seed}.flame.{number}'))
    return kit.join(made)


def platform(kit):
    """Three steps up to the dais, nosed in trim, the dais's sides cut with runes and its riser with a wave."""
    made = [kit.bevelled_box(0.3, 0.0, 0.0, 6.1, 2.25, 0.46, bevel=0.02),
            kit.bevelled_box(0.28, 0.0, 0.44, 6.12, 2.28, 0.52, bevel=0.02, part='trim'),
            kit.bevelled_box(0.45, 2.2, 0.0, 5.95, 2.82, 0.3, bevel=0.02),
            kit.bevelled_box(0.43, 2.2, 0.29, 5.97, 2.85, 0.35, bevel=0.015, part='trim'),
            kit.bevelled_box(0.6, 2.8, 0.0, 5.8, 3.4, 0.13, bevel=0.02),
            kit.bevelled_box(0.58, 2.8, 0.12, 5.82, 3.43, 0.18, bevel=0.015, part='trim')]
    wave = [(x, 2.29, 0.4 + 0.025 * math.sin(x * 7.0)) for x in (0.5 + 5.4 * k / 60 for k in range(61))]
    made.append(motifs.tube(kit, wave, 0.022, 'relief', sides=5))
    carved = []
    for hand, x in ((1, 0.3), (-1, 6.1)):
        start = (x, 2.0, 0.12) if hand > 0 else (x, 0.25, 0.12)
        step = (0.0, -0.3, 0.0) if hand > 0 else (0.0, 0.3, 0.0)
        carved += motifs.rune_row(f'altar.dais.{hand}', 6, start, step, (0.0, 0.0, 1.0), 0.2, 0.24, 0.025, 0.014)
    made.append(kit.mesh(carved, 'relief', 'runes'))
    return kit.join(made)


def altar_block(kit):
    """The altar: a plinth, a body with a blind arcade of three lancets, a mensa, a green cloth over it, an offering
    bowl and lit candles crowded on it, wax running over its edge."""
    made = [kit.bevelled_box(2.0, 0.6, 0.52, 4.4, 1.8, 0.62, bevel=0.02, part='trim'),
            kit.bevelled_box(2.1, 0.7, 0.62, 4.3, 1.7, 1.08, bevel=0.015),
            kit.bevelled_box(2.0, 0.6, 1.08, 4.4, 1.8, 1.2, bevel=0.025, part='trim')]
    for x in (2.55, 3.2, 3.85):
        made.append(kit.extrude_outline([(px + x, pz) for px, pz in furnishings.lancet(0.2, 0.9, 0.3, 0.68)],
                                        1.7, 1.72, plane='xz', part='relief'))
    for x in (2.24, 2.875, 3.525, 4.16):
        made.append(doors.colonnette(kit, x, 1.73, 0.62, 1.08, 0.032, sides=8))
    made.append(kit.box(2.85, 0.75, 1.2, 3.55, 1.8, 1.208, part='cloth'))
    made.append(kit.drape(2.85, 3.55, 1.205, 0.74, y=1.8, folds=2, depth=0.03, thickness=0.008, ragged=0.04,
                          seed='altar.cloth'))
    shell = [(0.05, 0.0), (0.11, 0.03), (0.16, 0.08), (0.17, 0.1), (0.15, 0.1), (0.0, 0.06)]
    made.append(kit.mesh(motifs.lobed(shell, lobes=10, depth=0.12, centre=(3.2, 1.25, 1.208), sides=30), 'brass',
                         'shell', ROUND))
    draw = details.seeded('altar.candles')
    spots = [(2.2, 0.8), (2.35, 1.0), (2.2, 1.35), (2.45, 1.6), (2.75, 0.8), (2.65, 1.15), (3.7, 0.78), (3.85, 1.1),
             (4.05, 0.85), (4.2, 1.2), (3.95, 1.55), (4.2, 1.6), (3.55, 1.45)]
    for number, (x, y) in enumerate(spots):
        made.append(lit_candle(kit, x, y, 1.2, draw.uniform(0.07, 0.36), draw.uniform(0.02, 0.035),
                               f'altar.candle.{number}'))
    for x in (2.3, 2.62, 3.92, 4.25):
        made.append(motifs.frond(kit, [(x, 1.795, 1.2), (x + 0.005, 1.81, 1.14), (x, 1.812, 1.05 + 0.04 * (x % 0.3))],
                                 0.011, 0.005, 'wax', sides=4))
    return kit.join(made)


def idol(kit):
    """The idol on its pedestal: a tall ribbed mass twisting as it rises and leaning out at its top, a crown of lappets
    falling over its shoulders, brass bosses scattered where a face might be, and tendrils down over the altar."""
    made = [kit.bevelled_box(2.62, 0.0, 0.52, 3.78, 0.58, 0.8, bevel=0.02, part='trim'),
            kit.bevelled_box(2.66, 0.0, 0.8, 3.74, 0.54, 0.88, bevel=0.015, part='trim')]
    profile = [(0.4, 0.0), (0.48, 0.25), (0.54, 0.6), (0.55, 0.95), (0.5, 1.3), (0.43, 1.6), (0.37, 1.85),
               (0.31, 2.1), (0.21, 2.38), (0.11, 2.58), (0.0, 2.7)]

    def lean(height):
        return 0.04 * math.sin(height * 2.3), 0.13 * (height / 2.7) ** 3

    made.append(kit.mesh(motifs.lobed(profile, lobes=7, depth=0.09, twist=2.6, centre=(3.2, 0.28, 0.88), sides=28,
                                      squash=0.5, lean=lean), 'stoneAlt', 'idol', ROUND))

    def front(x, z):
        height = z - 0.88
        reach = next(r0 + (r1 - r0) * (height - h0) / (h1 - h0) for (r0, h0), (r1, h1) in zip(profile, profile[1:])
                     if h0 <= height <= h1)
        dx, dy = lean(height)
        return 0.28 + dy + 0.5 * math.sqrt(max(reach * reach - (x - 3.2 - dx) ** 2, 0.0))

    draw = details.seeded('altar.idol')
    for x, z in ((3.05, 2.95), (3.3, 3.0), (3.18, 2.8), (2.98, 2.7), (3.4, 2.75), (3.25, 2.58), (3.08, 2.5)):
        size = draw.uniform(0.03, 0.05)
        made.append(kit.revolve([(size, 0.0), (size * 0.8, size * 0.5), (0.0, size * 0.8)],
                                start=(x, front(x, z) - 0.015, z), axis=(0.0, 1.0, 0.0), sides=10, part='brass',
                                smooth=ROUND))
    for number in range(7):
        x = 2.86 + 0.11 * number + draw.uniform(-0.02, 0.02)
        top = 2.3 - 0.12 * abs(number - 3)
        points = [(x, front(x, top) + 0.01, top)]
        for step in range(1, 6):
            z = top - 0.12 * step
            points.append((x + 0.02 * math.sin(step + number), front(x, z) + 0.015, z))
        made.append(motifs.frond(kit, points, 0.045, 0.012, 'relief', sides=6))
    for number, (x, end) in enumerate(((2.8, (2.75, 0.62, 0.6)), (2.95, (2.9, 0.72, 1.215)),
                                       (3.2, (3.0, 0.9, 1.22)), (3.45, (3.55, 0.75, 1.215)), (3.62, (3.7, 0.6, 0.62)))):
        start = (x, front(x, 1.55), 1.55)
        middle = ((start[0] + end[0]) / 2, max(start[1], end[1]) + 0.04, (start[2] + end[2]) / 2 + 0.08)
        curl = (end[0] + 0.06 * (1 if number % 2 else -1), end[1] + 0.06, end[2] + 0.01)
        made.append(motifs.frond(kit, motifs.smooth_path([start, middle, end, curl], 4), 0.04, 0.008, 'relief',
                                 sides=6))
    return kit.join(made)


def crown(kit):
    """The idol's crown spread over the wall behind it: long fronds radiating and curling, too many and too large."""
    made = []
    draw = details.seeded('altar.crown')
    for number in range(11):
        turn = math.radians(-12 + 204 * number / 10) + draw.uniform(-0.06, 0.06)
        length = draw.uniform(1.0, 1.6)
        bend = draw.uniform(0.5, 0.9) * (1 if number % 2 else -1)
        points, angle, at = [], turn, (3.2 + 0.3 * math.cos(turn), 3.0 - 0.3 * math.sin(turn))
        for step in range(13):
            points.append((at[0], 0.085, at[1]))
            angle += bend * (step / 12) ** 2 * 0.5
            at = (at[0] + length / 12 * math.cos(angle), at[1] - length / 12 * math.sin(angle) * -1)
        points = [(min(max(px, 0.4), 6.0), py, min(pz, 4.22)) for px, py, pz in points]
        made.append(motifs.frond(kit, points, 0.075, 0.012, 'relief', sides=5))
    return kit.join(made)


def canopy(kit):
    """Two clustered pillars behind the altar's corners carrying a pointed arch over the idol."""
    made = []
    for x in (2.0, 4.4):
        made.append(kit.bevelled_box(x - 0.2, 0.0, 0.52, x + 0.2, 0.36, 0.66, bevel=0.02, part='trim'))
        for dx, dy, radius in ((0.0, 0.2, 0.075), (0.12, 0.13, 0.055), (-0.12, 0.13, 0.055)):
            made.append(doors.colonnette(kit, x + dx, dy, 0.66, 2.62, radius, sides=10))
        made.append(kit.bevelled_box(x - 0.21, 0.0, 2.62, x + 0.21, 0.34, 2.76, bevel=0.015, part='relief'))
        made.append(kit.bevelled_box(x - 0.24, 0.0, 2.76, x + 0.24, 0.36, 2.82, bevel=0.015, part='trim'))
    made.append(doors.ring(kit, 1.2, 1.3, 2.82, 0.0, 0.15, 0.04, 0.32, part='trim', segments=24, x=3.2))
    made.append(motifs.tube(kit, doors.offset_curve(1.2, 1.3, 2.82, 0.0, 24, 0.3, x=3.2), 0.035, sides=6))
    band = doors.offset_curve(1.2, 1.3, 2.82, 0.075, 40, x=3.2)
    made.append(motifs.plates(kit, doors.curve_runes(band, 0.32, 13, 'altar.arch', cell=(0.08, 0.1), toward=1),
                              'relief', 'runes'))
    return kit.join(made)


def banners(kit):
    """Two banners on the wall either side, the crescent on each, hung from iron rods."""
    made = []
    for number, x in enumerate((0.75, 4.95)):
        made.append(kit.drape(x, x + 0.7, 3.9, 1.55, y=0.0, folds=3, depth=0.05, thickness=0.01, ragged=0.08,
                              seed=f'altar.banner.{number}'))
        made.append(kit.cylinder((x - 0.06, 0.04, 3.93), (x + 0.76, 0.04, 3.93), 0.016, sides=6, part='iron'))
        outline = [(x + 0.35 + 0.14 * a, 3.25 + 0.14 * b) for a, b in motifs.crescent(1.0, 0.78, 0.42)]
        made.append(kit.extrude_outline(outline, 0.065, 0.075, plane='xz', part='brass'))
    return kit.join(made)


def build(kit):
    strip = [kit.mesh(motifs.slab((3.2, 4.8, 0.0), (0.0, 1.0, 0.0), (-1.0, 0.0, 0.0), 1.4, 0.5, 0.01), 'relief',
                      'strip')]
    strip += [kit.mesh(motifs.slab((3.2 + side * 0.52, 4.8, 0.0), (0.0, 1.0, 0.0), (-1.0, 0.0, 0.0), 1.4, 0.025,
                                   0.014), 'brass', 'edge') for side in (1, -1)]
    return kit.join([floor(kit), platform(kit), altar_block(kit), idol(kit), crown(kit), canopy(kit), banners(kit),
                     brazier(kit, 0.9, 3.9, 'altar.brazier.west'), brazier(kit, 5.5, 3.9, 'altar.brazier.east')]
                    + strip)
