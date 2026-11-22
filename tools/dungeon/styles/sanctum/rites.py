"""The sanctum's two free-standing landmarks: the Ritual Circle (eight carved standing stones on a rune-cut floor round
a brazier) and the Reflecting Pool (a quatrefoil basin of still water with a hooded statue rising at its far end). Each
builds to its solids and glows in landmarks.json and draws its own floor.
"""
import math

import details
from shapes import TAU

from . import altar, furnishings, motifs
from .motifs import ROUND

MIDDLE = (3.2, 3.2)
RING_M = 2.4
# The pool's quatrefoil: four lobes round the middle, their reach 2.6 to keep inside the basin's solid.
LOBE_OFFSET = 1.2
LOBE_RADIUS = 1.4
RIM_M = 0.25


def floor_runes(seed, count, radius, height, lift=0.01):
    """Runes round a circle on the floor, read from outside it, standing `height` toward the middle from `radius`."""
    faces = []
    for number in range(count):
        turn = number * TAU / count
        out = (math.cos(turn), math.sin(turn), 0.0)
        along = (math.sin(turn), -math.cos(turn), 0.0)
        width = height * 0.7
        origin = (MIDDLE[0] + (radius - height) * out[0] - width / 2 * along[0],
                  MIDDLE[1] + (radius - height) * out[1] - width / 2 * along[1], lift)
        faces += motifs.glyph(motifs.rune(f'{seed}.{number}'), origin, along, out, width, height, 0.03, 0.008)
    return faces


def stone(kit, number):
    """A standing stone, its lancet head 2 m up, its inner face carved with a great rune under a brass crescent, its
    outer face with a smaller rune, a band round its foot; made facing +y, then turned to face the middle."""
    seed = f'circle.stone.{number}'
    outline = [(-0.22, 0.0), (0.22, 0.0)] + motifs.pointed(0.19, 1.6, 1.2, 8)[::-1]
    made = [kit.jitter(kit.bevel(kit.extrude_outline(outline, -0.13, 0.13, plane='xz', part='stoneAlt'), 0.025),
                       0.008, seed)]
    made.append(kit.bevelled_box(-0.235, -0.145, 0.22, 0.235, 0.145, 0.3, bevel=0.012, part='relief'))
    carved = motifs.glyph(motifs.rune(seed), (-0.12, 0.13, 0.72), (1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.24, 0.62,
                          0.035, 0.016)
    carved += motifs.glyph(motifs.rune(f'{seed}.back'), (0.07, -0.13, 0.9), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.14,
                           0.34, 0.025, 0.012)
    made.append(kit.mesh(carved, 'relief', 'rune'))
    crescent = [(0.075 * a, 1.5 + 0.075 * b) for a, b in motifs.crescent(1.0, 0.78, 0.42, 8)]
    made.append(kit.extrude_outline(crescent, 0.125, 0.142, plane='xz', part='brass'))
    if number % 2 == 0:
        draw = details.seeded(seed)
        for spot, x in enumerate((-0.12, 0.09)):
            made.append(furnishings.candle(kit, x, 0.19 + draw.uniform(0, 0.02), 0.0, draw.uniform(0.05, 0.14),
                                           draw.uniform(0.022, 0.03), f'{seed}.candle.{spot}'))
    piece = kit.join(made)
    turn = -math.pi / 2 + number * TAU / 8
    centre = (MIDDLE[0] + RING_M * math.cos(turn), MIDDLE[1] + RING_M * math.sin(turn))
    kit.rotate_z(piece, math.degrees(math.atan2(math.cos(turn), -math.sin(turn))))
    return kit.translate(piece, centre[0], centre[1], 0.0)


def ritual_circle(kit):
    """Eight standing stones on a paved ring round a band of brass runes, an eight-pointed star of brass joining the
    stones across the floor, and a brazier on a round hearth in the middle."""
    made = [altar.floor(kit),
            kit.mesh(motifs.annulus(2.05, 2.75, 0.0, 0.02, 48, MIDDLE), 'trim', 'paving'),
            kit.mesh(motifs.annulus(1.95, 2.0, 0.0, 0.022, 48, MIDDLE), 'brass', 'ring'),
            kit.mesh(motifs.annulus(1.55, 1.95, 0.0, 0.01, 48, MIDDLE), 'relief', 'band'),
            kit.mesh(motifs.annulus(1.5, 1.55, 0.0, 0.022, 48, MIDDLE), 'brass', 'ring'),
            kit.mesh(motifs.annulus(0.0, 0.5, 0.0, 0.04, 24, MIDDLE), 'trim', 'hearth'),
            kit.mesh(motifs.annulus(0.5, 0.55, 0.0, 0.03, 24, MIDDLE), 'brass', 'ring'),
            kit.mesh(floor_runes('circle.band', 20, 1.92, 0.32), 'brass', 'runes')]
    points = [(MIDDLE[0] + RING_M * math.cos(turn), MIDDLE[1] + RING_M * math.sin(turn))
              for turn in (-math.pi / 2 + number * TAU / 8 for number in range(8))]
    star = []
    for number in range(8):
        (ax, ay), (bx, by) = points[number], points[(number + 3) % 8]
        run = math.hypot(bx - ax, by - ay)
        way = ((bx - ax) / run, (by - ay) / run, 0.0)
        star += motifs.slab(((ax + bx) / 2, (ay + by) / 2, 0.0), way, (-way[1], way[0], 0.0), run / 2 - 0.3, 0.022,
                            0.025)
    made.append(kit.mesh(star, 'brass', 'star'))
    made += [stone(kit, number) for number in range(8)]
    made.append(altar.brazier(kit, MIDDLE[0], MIDDLE[1], 'circle.brazier'))
    return kit.join(made)


def lobe_reach(turn):
    """How far the quatrefoil's edge lies from the middle along a direction: the farthest of its four lobes."""
    found = 0.0
    for lobe in range(4):
        apart = turn - lobe * TAU / 4
        across = LOBE_OFFSET * math.sin(apart)
        found = max(found, LOBE_OFFSET * math.cos(apart) + math.sqrt(LOBE_RADIUS ** 2 - across ** 2))
    return found


def statue(kit):
    """A hooded figure rising from a rock at the pool's far end, its robe falling in folds, its hood empty, a brass
    shell held out before it, and its hem trailing away into the water as weed."""
    x, y = 3.2, 1.3
    made = [kit.rock(x, y, 0.3, (0.92, 0.84, 0.42), seed='pool.rock', detail=1, roughness=0.3)]
    robe = [(0.34, 0.0), (0.33, 0.25), (0.3, 0.55), (0.27, 0.85), (0.26, 1.05), (0.28, 1.22), (0.3, 1.32),
            (0.26, 1.42), (0.17, 1.5), (0.0, 1.53)]
    made.append(kit.mesh(motifs.lobed(robe, lobes=11, depth=0.07, centre=(x, y - 0.02, 0.62), sides=33), 'stone',
                         'robe', ROUND))
    hood = [(0.23, 0.0), (0.25, 0.14), (0.235, 0.33), (0.19, 0.48), (0.12, 0.62), (0.05, 0.72), (0.0, 0.76)]

    def lean(height):
        return 0.0, 0.12 * (height / 0.76) ** 1.5

    made.append(kit.mesh(motifs.lobed(hood, lobes=5, depth=0.03, centre=(x, y - 0.04, 2.02), sides=20, lean=lean),
                         'stone', 'hood', ROUND))
    made.append(kit.revolve([(0.12, 0.0), (0.11, 0.02), (0.0, 0.03)], start=(x, y + 0.13, 2.36),
                            axis=(0.0, 1.0, 0.0), sides=12, part='iron', smooth=ROUND))
    made.append(kit.scale(kit.ring((x, y + 0.165, 2.36), 0.125, 0.025, axis=(0.0, 1.0, 0.0), sides=14, tube_sides=4,
                                   part='stone', smooth=ROUND), 1.0, 1.0, 1.35, about=(x, y + 0.165, 2.36)))
    for hand in (1, -1):
        arm = [(x + hand * 0.25, y, 2.08), (x + hand * 0.29, y + 0.12, 1.86), (x + hand * 0.2, y + 0.26, 1.66),
               (x + hand * 0.1, y + 0.32, 1.58)]
        made.append(motifs.frond(kit, motifs.smooth_path(arm, 3), 0.075, 0.05, 'stone', sides=8))
    shell = [(0.04, 0.0), (0.12, 0.04), (0.17, 0.09), (0.18, 0.11), (0.16, 0.11), (0.0, 0.07)]
    made.append(kit.mesh(motifs.lobed(shell, lobes=10, depth=0.12, centre=(x, y + 0.32, 1.45), sides=30), 'brass',
                         'shell', ROUND))
    draw = details.seeded('pool.weed')
    for number in range(7):
        turn = math.radians(25 + 130 * number / 6) + draw.uniform(-0.1, 0.1)
        way = (math.cos(turn), math.sin(turn))
        reach = draw.uniform(0.75, 1.3)
        guide = [(x + way[0] * 0.33, y + way[1] * 0.33, 0.7), (x + way[0] * 0.48, y + way[1] * 0.46, 0.5),
                 (x + way[0] * reach * 0.7, y + way[1] * reach * 0.75, 0.41),
                 (x + way[0] * reach + draw.uniform(-0.15, 0.15), y + way[1] * reach, 0.405)]
        made.append(motifs.frond(kit, motifs.smooth_path(guide, 3), 0.035, 0.008, 'relief', sides=5))
    return kit.join(made)


def post(kit, x, y):
    """A slender pinnacle on the rim where two lobes meet, a brass crescent at its point."""
    made = [kit.bevelled_box(x - 0.12, y - 0.12, 0.5, x + 0.12, y + 0.12, 0.62, bevel=0.015, part='trim'),
            kit.prism((x, y, 0.62), (x, y, 1.0), 0.085, sides=8, turn=22.5, part='stoneAlt'),
            kit.bevelled_box(x - 0.1, y - 0.1, 1.0, x + 0.1, y + 0.1, 1.06, bevel=0.012, part='relief'),
            kit.cone((x, y, 1.06), (x, y, 1.36), 0.11, 0.0, sides=4, seam=(0.7071, -0.7071, 0.0), part='trim',
                     smooth=None)]
    outline = [(x + 0.07 * a, 1.42 + 0.07 * b) for a, b in motifs.crescent(1.0, 0.78, 0.42, 8)]
    made.append(kit.extrude_outline(outline, y - 0.008, y + 0.008, plane='xz', part='brass'))
    return kit.join(made)


def pool(kit):
    """A quatrefoil basin with a plinth, a carved band and a moulded rim round still water, pinnacles where its lobes
    meet, and the statue."""
    profile = [(0.0, 0.0, 'trim'), (0.0, 0.1, 'trim'), (0.03, 0.12, 'stone'), (0.05, 0.13, 'stone'),
               (0.05, 0.18, 'relief'), (0.05, 0.33, 'stone'), (0.05, 0.37, 'trim'), (0.0, 0.41, 'trim'),
               (0.0, 0.46, 'trim'), (0.02, 0.5, 'trim'), (RIM_M - 0.03, 0.5, 'trim'), (RIM_M, 0.47, 'stone'),
               (RIM_M, 0.36, 'stone')]
    made = [altar.floor(kit), motifs.parts_mesh(kit, motifs.polar_sweep(lobe_reach, profile, 96, MIDDLE), 'basin')]
    water = [(MIDDLE[0] + (lobe_reach(turn) - RIM_M) * math.cos(turn),
              MIDDLE[1] + (lobe_reach(turn) - RIM_M) * math.sin(turn), 0.4)
             for turn in (TAU * step / 96 for step in range(96))]
    made.append(kit.polygon(water, part='water'))
    for number in range(4):
        turn = TAU / 8 + number * TAU / 4
        reach = lobe_reach(turn) - 0.12
        made.append(post(kit, MIDDLE[0] + reach * math.cos(turn), MIDDLE[1] + reach * math.sin(turn)))
    made.append(statue(kit))
    return kit.join(made)


def build(kit):
    return {'sanctum.ritual-circle': ritual_circle(kit), 'sanctum.pool': pool(kit)}
