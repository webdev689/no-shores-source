"""The sanctum's set pieces against a wall and its sconce: the votive shelf, the carved panel of the deep, and the brass
crescent that holds a torch. Each stands on the wall's face at y 0, out along +y.
"""
import math

import details
from shapes import TAU, normal_of

from . import doors, motifs
from .motifs import ROUND


def lancet(half, spring, radius, low, segments=12):
    """A lancet's outline (x, z): upright sides from `low` to `spring`, a pointed head of `radius`."""
    return [(-half, low)] + motifs.pointed(half, spring, radius / (2 * half), segments) + [(half, low)]


def lancet_plate(kit, half, spring, radius, low, y, part):
    """A lancet's face alone, at `y` looking out of the wall: a niche's back, a panel set in a frame."""
    points = [(x, y, z) for x, z in lancet(half, spring, radius, low)][::-1]
    return kit.polygon(points if normal_of(points)[1] > 0 else points[::-1], part=part)


def lancet_band(kit, half, spring, radius, width, low, y0, y1, part='trim'):
    """A lancet frame `width` wide: the outline less the one `width` inside it."""
    outer = motifs.pointed(half, spring, radius / (2 * half), 12)
    inner = motifs.pointed(half - width, spring, (radius - width) / (2 * (half - width)), 12)
    outline = [(-half, low)] + outer + [(half, low), (half - width, low)] + inner[::-1] + [(width - half, low)]
    return kit.extrude_outline(outline, y0, y1, plane='xz', part=part)


def candle(kit, x, y, z, height, radius, seed):
    """An unlit candle: its body, a softened top, a pool of wax at its foot and a drip down its side."""
    draw = details.seeded(seed)
    top = z + height
    made = [motifs.shaft(kit, x, y, z, top - 0.01, radius, 'wax', sides=6),
            motifs.turned(kit, [(radius, 0.0), (radius * 0.8, 0.01), (0.0, 0.013)], x, y, top - 0.01, 6, 'wax'),
            motifs.plates(kit, motifs.annulus(0.0, radius + draw.uniform(0.008, 0.02), z, z + 0.004, 8, (x, y),
                                              walls=False), 'wax', 'pool')]
    turn = draw.uniform(0, TAU)
    rim = (x + radius * math.cos(turn), y + radius * math.sin(turn))
    drop = draw.uniform(0.25, 0.7) * height
    made.append(motifs.frond(kit, [(rim[0], rim[1], top), (rim[0], rim[1], top - drop * 0.6),
                                   (rim[0], rim[1], top - drop)], 0.006, 0.004, 'wax', sides=4))
    return kit.join(made)


def bowl(kit, x, y, z, size, sides=8):
    """A shallow brass offering bowl."""
    profile = [(0.0, 0.0), (size * 0.5, 0.0), (size * 0.85, 0.03), (size, 0.06), (size * 0.85, 0.05), (0.0, 0.03)]
    return motifs.turned(kit, profile, x, y, z, sides, 'brass', True)


def feature_a(kit):
    """A votive shelf in a blind lancet niche: unlit candles of many heights in their own wax, brass offering bowls,
    a scrolled corbel under it and the crescent at the niche's head."""
    made = [lancet_band(kit, 0.58, 1.75, 0.93, 0.11, 0.62, 0.0, 0.07),
            lancet_plate(kit, 0.47, 1.75, 0.82, 0.62, 0.02, 'stoneAlt'),
            kit.box(-0.64, 0.0, 0.56, 0.64, 0.1, 0.64, part='trim'),
            doors.sigil(kit, 0.0, 2.18, 0.12, 0.02, 1)]
    made.append(kit.bevelled_box(-0.62, 0.0, 1.0, 0.62, 0.26, 1.08, bevel=0.015, part='trim'))
    made.append(motifs.tube(kit, [(-0.6, 0.262, 1.045), (0.6, 0.262, 1.045)], 0.026, 'trim', sides=6))
    corbel = [(0.0, 0.6), (0.05, 0.6), (0.07, 0.66), (0.1, 0.75), (0.15, 0.85), (0.21, 0.93), (0.25, 1.0), (0.0, 1.0)]
    made.append(kit.extrude_outline(corbel, -0.14, 0.14, plane='yz', part='stone'))
    for hand in (1, -1):
        curl = motifs.spiral((0.085, 0.8), 0.065, 0.012, 1.4, 7, phase=math.pi * 0.4)
        made.append(motifs.tube(kit, [(hand * 0.145, a, b) for a, b in curl], 0.013, 'relief', sides=4))
    carved = doors.face_runes('feature.a', 4, -0.5, 0.5, 0.585, 0.045, 0.1, 1, front_only=True)
    made.append(motifs.plates(kit, carved, 'relief', 'runes'))
    draw = details.seeded('feature.a.candles')
    for number, x in enumerate((-0.53, -0.44, -0.35, -0.02, 0.07, 0.4, 0.5)):
        made.append(candle(kit, x + draw.uniform(-0.02, 0.02), draw.uniform(0.07, 0.2), 1.08,
                           draw.choice((0.07, 0.1, 0.14, 0.2, 0.26, 0.31)), draw.uniform(0.018, 0.032),
                           f'feature.a.{number}'))
    made += [bowl(kit, -0.17, 0.14, 1.08, 0.08), bowl(kit, 0.26, 0.14, 1.08, 0.07)]
    for x in (-0.36, 0.12):
        made.append(motifs.frond(kit, [(x, 0.27, 1.06), (x + 0.005, 0.285, 1.03), (x + 0.004, 0.287, 0.97)], 0.009,
                                 0.004, 'wax', sides=4))
    return kit.join(made)


def feature_b(kit):
    """A carved panel in a lancet frame on dark colonnettes: a sea's surface with a tiny ship on it, and far below a
    vast ribbed shape reaching up, too large for the frame and never quite anything."""
    made = [kit.bevelled_box(-0.6, 0.0, 0.0, 0.6, 0.2, 0.5, bevel=0.02),
            kit.bevelled_box(-0.66, 0.0, 0.5, 0.66, 0.24, 0.58, bevel=0.015, part='trim'),
            lancet_band(kit, 0.62, 2.0, 1.0, 0.12, 0.58, 0.0, 0.12),
            lancet_plate(kit, 0.5, 2.0, 0.88, 0.58, 0.03, 'stoneAlt')]
    for hand in (1, -1):
        made.append(doors.colonnette(kit, hand * 0.57, 0.15, 0.58, 1.94, 0.04, sides=8))
        made.append(kit.box(hand * 0.5, 0.0, 1.94, hand * 0.66, 0.2, 2.02, part='relief'))
    made += [kit.box(-0.3, 0.2, 0.2, 0.3, 0.212, 0.36, part='brass'),
             motifs.plates(kit, doors.face_runes('feature.b.plate', 5, -0.27, 0.27, 0.235, 0.09, 0.212, 1,
                                                 front_only=True), 'relief', 'runes')]
    for number, height in enumerate((2.3, 2.42, 2.54)):
        reach = 0.44 - 0.07 * number
        wave = [(x, 0.045, height + 0.025 * math.sin(x * 15 + number * 1.7))
                for x in (reach * (2 * k / 12 - 1) for k in range(13))]
        made.append(motifs.tube(kit, wave, 0.017, 'relief', sides=4))
    hull = [(-0.07, 2.6), (0.07, 2.6), (0.045, 2.575), (-0.05, 2.575)]
    made += [kit.extrude_outline([(x + 0.12, z) for x, z in hull], 0.03, 0.07, plane='xz', part='relief'),
             kit.box(0.117, 0.04, 2.6, 0.123, 0.06, 2.7, part='relief'),
             kit.extrude_outline([(0.125, 2.61), (0.175, 2.62), (0.125, 2.69)], 0.04, 0.055, plane='xz',
                                 part='relief')]
    mass = [(0.46, 0.0), (0.46, 0.14), (0.4, 0.36), (0.28, 0.55), (0.12, 0.7), (0.0, 0.75)]
    made.append(kit.mesh(motifs.lobed(mass, lobes=7, depth=0.06, twist=4.0, centre=(0.0, 0.03, 0.6), sides=16,
                                      squash=0.22), 'relief', 'mass', ROUND))
    for x, z in ((-0.2, 0.96), (-0.09, 1.03), (0.03, 1.05), (0.15, 1.0), (0.24, 0.92)):
        made.append(kit.revolve([(0.026, 0.0), (0.02, 0.02), (0.0, 0.028)], start=(x, 0.1, z),
                                axis=(0.0, 1.0, 0.0), sides=6, part='relief', smooth=ROUND))
    draw = details.seeded('feature.b.fronds')
    for number, (root, lean) in enumerate(((-0.3, -0.1), (-0.16, 0.06), (-0.02, -0.05), (0.12, 0.1),
                                            (0.27, 0.02), (0.36, -0.12))):
        base_z = 0.95 + 0.25 * (1 - abs(root) / 0.4)
        tip = 1.75 + draw.uniform(0, 0.4)
        guide = [(root, 0.08, base_z), (root + lean, 0.07, base_z + 0.35),
                 (root - lean * 0.6, 0.06, (base_z + tip) / 2 + 0.1), (root + lean * 0.4, 0.05, tip),
                 (root + lean * 0.4 + 0.05 * (1 if number % 2 else -1), 0.05, tip - 0.06)]
        made.append(motifs.frond(kit, motifs.smooth_path(guide, 2), 0.03, 0.006, 'relief', sides=4))
    coil = [(-0.56, 0.05, 1.5), (-0.4, 0.07, 1.25), (-0.22, 0.08, 1.12), (-0.05, 0.08, 1.3), (0.02, 0.07, 1.55),
            (-0.08, 0.06, 1.7)]
    made.append(motifs.frond(kit, motifs.smooth_path(coil, 2), 0.045, 0.012, 'relief', sides=5))
    return kit.join(made)


def sconce(kit):
    """A brass crescent on the wall, horns up round the flame, and a curved arm lifting a cup under it."""
    outline = [(a, b - 0.12) for a, b in motifs.crescent(0.17, 0.15, 0.055, 6)]
    made = [kit.extrude_outline(outline, 0.0, 0.025, plane='xz', part='brass')]
    arm = [(0.0, 0.025, -0.26), (0.0, 0.14, -0.29), (0.0, 0.27, -0.27), (0.0, 0.35, -0.21)]
    made.append(kit.mesh(motifs.swept(arm, 0.015, 4), 'brass', 'arm', ROUND))
    cup = [(0.0, 0.0), (0.05, 0.05), (0.064, 0.11), (0.06, 0.135), (0.05, 0.115), (0.0, 0.1)]
    made.append(motifs.turned(kit, cup, 0.0, 0.35, -0.215, 7, 'brass', True))
    return kit.join(made)


def build(kit):
    return {'feature.a': feature_a(kit), 'feature.b': feature_b(kit), 'sconce': sconce(kit)}
