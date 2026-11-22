"""The caverns' set pieces against a wall and on the floor: a rock outcrop where fungus grows, a mineral seam where
crystals break out, a scree of fallen pebbles, and a drip puddle of still water in a pebble rim.
"""
import math
import random

from details import box_uvs
from shapes import TAU, add, mul, sweep, unit

from styles.caverns import forms


def _feature_limit(point):
    """A feature's room against its wall: |x| ≤ 0.8, y ≤ 0.3, under 3.0."""
    x, y, z = point
    x = forms.ease_over(forms.ease_under(x, 0.785, 0.04), -0.785, 0.04)
    return x, forms.ease_under(y, 0.285, 0.04), forms.ease_under(z, 2.95, 0.05)


def _in_rock(point):
    """Whether a point of a feature lies in the rock behind it: on a cave's wall the page sets a feature back until
    its back meets the rock, so nothing behind its face is seen."""
    return point[1] < -0.02 or point[2] < 0.0


def _grow(piece, candidates):
    """Faces of each candidate (a list of faces, or {part: faces}) that keeps the piece's envelope, by part."""
    found = {}
    for candidate in candidates:
        parts = candidate if isinstance(candidate, dict) else {'crystal': candidate}
        if forms.kit_fits([face for each in parts.values() for face in each], piece):
            for part, each in parts.items():
                found.setdefault(part, []).extend(each)
    return found


def outcrop(seed):
    """A rock outcrop against the wall, broken into ledges, where glowing fungus grows: a crowd at its foot, more on
    its ledge, and shelf fungus in tiers up its face."""
    draw = random.Random(seed)
    rock = []
    for number, (centre, radii, top) in enumerate((((-0.15, -0.08, 0.7), (0.56, 0.23, 0.8), None),
                                                    ((0.43, -0.02, 0.2), (0.33, 0.27, 0.5), 0.44),
                                                    ((0.3, -0.12, 1.3), (0.34, 0.18, 0.4), None),
                                                    ((-0.6, 0.03, 0.08), (0.17, 0.2, 0.14), None))):
        detail = 2 if number < 2 else 1

        def keep(point, top=top):
            x, y, z = _feature_limit(point)
            return x, y, (forms.ease_under(z, top, 0.015) if top else z)
        rock += forms.boulder(centre, radii, f'{seed} {number}', detail=detail, rough=0.22, cuts=3, floor=0.0,
                              limit=keep)
    candidates = []
    for _ in range(10):
        x, y = draw.uniform(-0.72, 0.2), draw.uniform(0.1, 0.25)
        tall = draw.uniform(0.06, 0.3) * (1.2 - abs(x + 0.25))
        candidates.append(forms.mushroom((x, y, -0.01), tall, tall * draw.uniform(0.45, 0.8), draw,
                                         (draw.uniform(-0.04, 0.04), draw.uniform(0.0, 0.04))))
    for _ in range(4):
        x, y = draw.uniform(0.25, 0.65), draw.uniform(-0.02, 0.2)
        found = forms.cast(rock, (x, y, 2.0), (0.0, 0.0, -1.0))
        if found and found[0][2] > 0.38:
            tall = draw.uniform(0.05, 0.16)
            candidates.append(forms.mushroom(add(found[0], (0, 0, -0.01)), tall, tall * draw.uniform(0.5, 0.8), draw))
    for column in range(3):
        x = draw.uniform(-0.6, 0.2)
        z = draw.uniform(0.35, 1.1)
        for tier in range(2):
            found = forms.cast(rock, (x + draw.uniform(-0.04, 0.04), 1.0, z + tier * 0.09), (0.0, -1.0, 0.0))
            if found and found[1][1] > 0.3:
                width = draw.uniform(0.06, 0.11) * (1 - 0.2 * tier)
                bracket = forms.bracket(add(found[0], (0, -0.01, 0)), (draw.uniform(-0.25, 0.25), 1.0), width, draw)
                candidates.append({'fungus': bracket})
    parts = _grow('feature.a', candidates)
    parts['stone'] = forms.cull(rock, _in_rock)
    return parts


def seam(seed):
    """A mineral seam slanting across a rock face against the wall: a vein of ore standing proud of it, crystals
    breaking out along it, the largest where the vein is thickest. Gives its faces by part, and the part of each of
    its rock's faces, ore along the seam."""
    draw = random.Random(seed)
    noise = forms.Noise(f'{seed} vein')
    rock = []
    for number, (centre, radii) in enumerate((((0.0, -0.13, 1.0), (0.74, 0.24, 1.08)),
                                              ((0.32, -0.09, 2.0), (0.4, 0.18, 0.4)),
                                              ((-0.52, -0.04, 0.24), (0.27, 0.2, 0.26)))):
        rock += forms.boulder(centre, radii, f'{seed} {number}', detail=2 if number == 0 else 1, rough=0.16, cuts=4,
                              floor=0.0, limit=_feature_limit)
    path = [(-0.7 + 1.4 * k / 12, 0.35 + 1.35 * k / 12 + 0.12 * noise(k * 0.67, 0.5)) for k in range(13)]

    def near(x, z):
        return min(math.hypot(x - px, z - pz) for px, pz in path)

    vein = []
    sections = []
    for k, (x, z) in enumerate(path):
        found = forms.cast(rock, (x, 1.0, z), (0.0, -1.0, 0.0))
        if not found:
            continue
        (sx, sy, sz), _ = found
        after, before = path[min(k + 1, 12)], path[max(k - 1, 0)]
        across = unit((-(after[1] - before[1]), 0.0, after[0] - before[0]))
        width = 0.05 + 0.03 * math.sin(math.pi * k / 12)
        section = []
        for j in range(5):
            angle = math.pi * j / 4
            lift = 0.035 * math.sin(angle) * (1 + 0.3 * noise(k * 0.7, j))
            section.append(add((sx, sy - 0.02 + lift, sz), mul(across, width * math.cos(angle))))
        sections.append(section)
    if len(sections) > 1:
        vein = sweep(sections, closed=False, outward=lambda points, i: (0.0, 1.0, 0.0))
    candidates = []
    for k in (1, 3, 5, 6, 7, 9, 11):
        x, z = path[k]
        found = forms.cast(rock, (x, 1.0, z), (0.0, -1.0, 0.0))
        if not found:
            continue
        point, _ = found
        big = math.sin(math.pi * k / 12)
        for _ in range(6):
            axis = unit((draw.uniform(-1, 1), draw.uniform(0.2, 0.75), draw.uniform(-0.4, 1.0)))
            base = add(point, (draw.uniform(-0.06, 0.06), -0.03, draw.uniform(-0.06, 0.06)))
            radius = draw.uniform(0.015, 0.03 + 0.03 * big)
            candidates.append(forms.crystal(base, axis, radius, draw.uniform(0.06, 0.12 + 0.3 * big), draw,
                                            sides=6 if radius > 0.035 else 5))
    for _ in range(8):
        x, z = path[draw.randrange(13)]
        found = forms.cast(rock, (x + draw.uniform(-0.05, 0.05), 1.0, z), (0.0, -1.0, 0.0))
        if found:
            candidates.append(forms.crystal(add(found[0], (0, -0.01, 0)), (draw.uniform(-1, 1), 0.6, 0.5),
                                            0.01, draw.uniform(0.03, 0.06), draw, sides=4))
    parts = _grow('feature.b', candidates)
    parts['ore'] = vein if forms.kit_fits(vein, 'feature.b') else []
    parts['stone'] = forms.cull(rock, _in_rock)
    return parts, lambda middle, normal: 'ore' if near(middle[0], middle[2]) < 0.1 + 0.04 * noise(
        middle[0] * 6, middle[2] * 6) else 'stone'


def scree(seed):
    """A scree of fallen stone on the floor: a few rounded stones among broken chips, thick in the middle and thinning
    out, and one broken soda straw, none over 0.05 m."""
    draw = random.Random(seed)
    noise = forms.Noise(seed)
    faces = {'stone': [], 'stoneAlt': [], 'floor': []}
    placed = []
    for _ in range(400):
        if len(placed) >= 40:
            break
        turn = draw.uniform(0, TAU)
        edge = 1.2 + 0.28 * noise(math.cos(turn) * 1.4, math.sin(turn) * 1.4)
        reach = edge * draw.random() ** 0.7
        x, y = reach * math.cos(turn) * 1.1, reach * math.sin(turn) * 0.95
        if draw.random() > (1 - (reach / edge) ** 2) ** 0.5 + 0.08:
            continue
        rounded = len(placed) < 7
        size = (0.36 if rounded else 0.24 - 0.14 * reach / edge) * draw.uniform(0.6, 1.1)
        if any(math.hypot(x - px, y - py) < (size + other) * 0.42 for px, py, other in placed):
            continue
        placed.append((x, y, size))
        height = min(0.048, size * draw.uniform(0.2, 0.4))
        part = 'stone' if rounded else draw.choices(('stone', 'stoneAlt', 'floor'), (5, 4, 1))[0]
        faces[part] += forms.pebble(x, y, size, height, draw, corners=6 if rounded else 5, rounded=rounded)
    turn = draw.uniform(0, TAU)
    start = (0.4 * math.cos(turn), 0.4 * math.sin(turn), 0.014)
    faces['stoneAlt'] += forms.rod(start, add(start, (0.15 * math.cos(turn + 1), 0.15 * math.sin(turn + 1), 0.0)),
                                   0.013, 0.012, 4)
    return faces


def puddle(seed):
    """A shallow drip puddle: still water at 0.012 m in a low lip of mud, chips of stone round its rim, two stones in
    it, and cave pearls the drips have rolled smooth."""
    draw = random.Random(seed)
    noise = forms.Noise(seed)
    count = 14
    reaches = []
    for k in range(count):
        turn = TAU * (k + draw.uniform(-0.25, 0.25)) / count
        reach = 0.72 + 0.3 * noise(math.cos(turn) * 1.3, math.sin(turn) * 1.3)
        reaches.append((turn, reach * draw.uniform(0.9, 1.08)))

    def at(turn, reach, scale, z):
        return (reach * scale * math.cos(turn) * 1.3, reach * scale * math.sin(turn), z)

    water = forms.fan((0.0, 0.0, 0.012), [at(turn, reach, 0.96, 0.012) for turn, reach in reaches], rings=1)
    sections = [[at(turn, reach, scale, z) for scale, z in ((0.92, 0.004), (1.05, 0.026), (1.22, 0.0))]
                for turn, reach in reaches + reaches[:1]]
    lip = sweep(sections, closed=False, outward=lambda points, i: (0.0, 0.0, 1.0))
    lip = [list(zip(points, box_uvs(points))) for points in ([point for point, _ in face] for face in lip)]
    stones = {'stone': [], 'stoneAlt': []}
    for k in range(16):
        turn, reach = reaches[(k * 5) % count]
        x, y, _ = at(turn + draw.uniform(-0.12, 0.12), reach, draw.uniform(1.02, 1.3), 0.0)
        size = draw.uniform(0.05, 0.14)
        stones[draw.choice(('stone', 'stone', 'stoneAlt'))] += forms.pebble(
            x, y, size, min(0.034, size * 0.4), draw, z=0.012, corners=5, rounded=False)
    for x, y, size in ((0.25, -0.12, 0.13), (-0.38, 0.2, 0.1)):
        stones['stone'] += forms.pebble(x, y, size, 0.04, draw, corners=5)
    for _ in range(5):
        turn, share = draw.uniform(0, TAU), draw.uniform(0.0, 0.5)
        stones['stoneAlt'] += forms.pebble(share * math.cos(turn), share * math.sin(turn), draw.uniform(0.03, 0.045),
                                           0.022, draw, corners=4, rounded=False)
    return {'water': water, 'floor': lip, **stones}
