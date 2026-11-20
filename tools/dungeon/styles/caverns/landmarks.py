"""The caverns' landmarks, each built to its footprint, solids and glows in landmarks.json: the Still Lake (dark water
sunk in a rocky shore, two stalagmites over it), the Crystal Heart (a great cluster of crystals of every size from a
mound of rock) and the Stone Teeth (five ridged, wet stalagmites with fungus at their feet). Each draws its own
floor; nothing over 0.05 m stands outside a solid between the floor and a head's height.
"""
import math
import random

import catalog
import envelope
from details import box_uvs
from shapes import TAU, sweep

from styles.caverns import forms

MIDDLE = 3.2
WATER_Z = -0.1
# The page lays the room's floor at z 0 up to the footprint's edge and none under it, so a cave floor eases down to
# meet it over this much, metres, and stands at z 0 on the edge itself.
EDGE_EASE_M = 0.6


def _rock_floor(seed, size, lift=0.02, basins=()):
    """A cave floor over the footprint: gently uneven, never over `lift` + 0.012, sunk into shallow basins at
    `basins` ((x, y, radius) each), and easing to z 0 at the footprint's edge. Gives its faces and its height at a
    point."""
    noise = forms.Noise(seed)

    def height_at(x, y):
        z = 0.008 + lift * 0.5 * (1 + noise.fbm(x * 0.9, y * 0.9))
        for bx, by, radius in basins:
            share = math.hypot(x - bx, y - by) / radius
            if share < 1:
                z = min(z, -0.035 * (1 - share * share) + 0.008 * share)
        edge = max(0.0, min(1.0, min(x, y, size - x, size - y) / EDGE_EASE_M))
        return z * edge * edge * (3 - 2 * edge)

    return forms.ground(0.0, 0.0, size, size, 0.32, height_at), height_at


def _square_reach(half, turn):
    """How far from a square's middle its edge lies at a turn (from north, rightward)."""
    return half / max(abs(math.sin(turn)), abs(math.cos(turn)), 1e-9)


def stalagmite(centre, half, top, seed, shape='cone', sides=14, foot=-0.04):
    """A stalagmite on `centre` up to `top`, kept within the square `half` from its middle (its solid grown): a
    fluted cone, a candle, a stack of rounded plates or one broken off. Gives faces by part: its deep grooves wet."""
    draw = random.Random(seed)
    flute = forms.flutes(seed, draw.choice((6, 7, 8)), 0.9)
    noise = forms.Noise(seed)
    base = half * draw.uniform(0.8, 0.88)
    height = top - foot
    shares = (0.0, 0.04, 0.1, 0.18, 0.3, 0.45, 0.6, 0.74, 0.85, 0.93, 0.98, 1.0)
    if shape == 'candle':
        reach = (1.0, 0.93, 0.85, 0.8, 0.77, 0.74, 0.71, 0.68, 0.63, 0.55, 0.38, 0.0)
    elif shape == 'plates':
        reach = (1.0, 0.92, 0.82, 0.74, 0.8, 0.66, 0.72, 0.56, 0.6, 0.4, 0.2, 0.0)
    elif shape == 'broken':
        shares = shares[:-2] + (0.985, 1.0)
        reach = (1.0, 0.92, 0.84, 0.77, 0.7, 0.64, 0.6, 0.57, 0.54, 0.52, 0.48, 0.0)
    else:
        reach = (1.0, 0.95, 0.9, 0.85, 0.78, 0.68, 0.57, 0.45, 0.33, 0.21, 0.1, 0.0)
    profile = [(base * r, foot + height * share) for r, share in zip(reach, shares)]
    if shape == 'broken':
        profile[-1] = (0.0, top - 0.04)
    lean = (draw.uniform(-0.06, 0.06), draw.uniform(-0.06, 0.06))

    def bend(z):
        return tuple(value * ((z - foot) / height) ** 2 for value in lean)

    def radius_at(turn, z, radius):
        lump = 0.1 * noise(math.sin(turn) * 1.5, math.cos(turn) * 1.5, z * 1.6)
        reach = radius * (1 + 0.32 * (flute(turn) - 0.5) + lump)
        if z < envelope.WALK_HIGH_M + 0.05:
            dx, dy = bend(z)
            reach = forms.ease_under(reach, _square_reach(half - 0.01, turn) - math.hypot(dx, dy), 0.04)
        return reach

    faces = forms.turned(profile, radius_at, sides, centre, bend)
    parts = {'stone': [], 'water': [], 'stoneAlt': []}
    for face in faces:
        middle = [sum(point[axis] for point, _ in face) / len(face) for axis in range(3)]
        dx, dy = bend(middle[2])
        turn = math.atan2(middle[0] - centre[0] - dx, -(middle[1] - centre[1] - dy)) % TAU
        share = flute(turn)
        wet = share < 0.18 and middle[2] < foot + height * 0.8
        parts['water' if wet else 'stoneAlt' if share > 0.9 else 'stone'].append(face)
    return parts


def _mushrooms(spots, draw, landmark, tall=(0.06, 0.2)):
    """Mushrooms at spots (x, y, z), each kept only if it stays over a solid (or under the walk zone)."""
    found = {}
    for x, y, z in spots:
        height = draw.uniform(*tall)
        made = forms.mushroom((x, y, z - 0.01), height, height * draw.uniform(0.5, 0.9), draw,
                              (draw.uniform(-0.03, 0.03), draw.uniform(-0.03, 0.03)))
        if forms.landmark_fits([face for each in made.values() for face in each], landmark):
            found = forms.gather(found, made)
    return found


def _mat(x, y, radius, height_at, seed, lift=0.014):
    """A mat of glowing fungus on the floor round (x, y), following it `lift` above."""
    noise = forms.Noise(seed)
    outline = []
    for k in range(10):
        turn = TAU * k / 10
        reach = radius * (0.7 + 0.5 * (0.5 + noise(math.cos(turn), math.sin(turn))))
        px, py = x + reach * math.cos(turn), y + reach * math.sin(turn)
        outline.append((px, py, height_at(px, py) + lift))
    faces = forms.fan((x, y, height_at(x, y) + lift), outline, rings=2)
    return [[((px, py, height_at(px, py) + lift), uv) for (px, py, _), uv in face] for face in faces]


def still_lake(entry):
    """An irregular pool of dark water sunk below the floor, a rocky shore rising round it to a low bank and falling
    to the footprint's rim, two stalagmites over it, boulders on its shore and in its shallows."""
    seed = entry['module']
    size = entry['cells'][0] * catalog.CELL_M
    draw = random.Random(seed)
    noise = forms.Noise(seed)
    inner = 0.3
    turns = sorted({TAU * k / 72 for k in range(72)} | {TAU * (k + 0.5) / 4 for k in range(4)})

    def lake_reach(turn):
        reach = 2.25 + 0.55 * noise(math.sin(turn) * 1.4, math.cos(turn) * 1.4)
        for corner in (TAU * 0.625, TAU * 0.375):
            reach -= 0.35 * max(0.0, math.cos(turn - corner)) ** 6
        return reach

    knots = ((0.0, 0.0), (0.1, 0.07), (0.25, 0.13), (0.4, 0.15), (0.55, 0.1), (0.7, 0.02), (0.82, -0.05),
             (0.92, -0.15), (1.0, -0.3))

    def shore(turn, share):
        outer = _square_reach(MIDDLE - inner, turn)
        reach = outer + (lake_reach(turn) - outer) * share
        x, y = MIDDLE + reach * math.sin(turn), MIDDLE - reach * math.cos(turn)
        z = knots[-1][1]
        for (a, za), (b, zb) in zip(knots, knots[1:]):
            if a <= share <= b:
                z = za + (zb - za) * (share - a) / (b - a)
        z += 0.06 * math.sin(math.pi * min(share, 0.9) / 0.9) * noise.fbm(x * 1.2, y * 1.2, 4.0)
        return x, y, min(z, 0.2)

    sections = [[shore(turn, share) for share in (0.0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.82, 0.92, 1.0)]
                for turn in turns + turns[:1]]
    ground = sweep(sections, closed=False, outward=lambda points, i: (0.0, 0.0, 1.0))
    ground = [list(zip(points, box_uvs(points))) for points in ([point for point, _ in face] for face in ground)]
    rim = []
    for x0, y0, x1, y1 in ((0, 0, size, inner), (0, size - inner, size, size), (0, inner, inner, size - inner),
                           (size - inner, inner, size, size - inner)):
        rim += forms.ground(x0, y0, x1, y1, 0.4, lambda x, y: 0.0)
    edge = [shore(turn, 1.0) for turn in turns]
    water = forms.fan((MIDDLE, MIDDLE, WATER_Z), [(x, y, WATER_Z) for x, y, _ in edge], rings=2)
    parts = {'floor': rim + ground, 'water': water}
    def keep(point):
        x, y, z = point
        x = forms.ease_over(forms.ease_under(x, size - inner - 0.03, 0.04), inner + 0.03, 0.04)
        return x, forms.ease_over(forms.ease_under(y, size - inner - 0.03, 0.04), inner + 0.03, 0.04), z

    rocks = []
    for number in range(16):
        turn, share = draw.uniform(0, TAU), draw.uniform(0.15, 0.8)
        x, y, z = shore(turn, share)
        if min(math.hypot(x - 0.7, y - 0.7), math.hypot(x - 5.7, y - 5.3)) < 0.75:
            continue
        wide = draw.uniform(0.18, 0.5)
        rocks += forms.boulder((x, y, z - 0.04), (wide, wide * draw.uniform(0.6, 1.0), draw.uniform(0.1, 0.26)),
                               f'{seed} shore {number}', detail=1, rough=0.25, cuts=2, floor=z - 0.06, limit=keep)
    for number in range(4):
        turn = draw.uniform(0, TAU)
        x, y, _ = shore(turn, draw.uniform(1.05, 1.35))
        rocks += forms.boulder((x, y, -0.32), (draw.uniform(0.2, 0.4), draw.uniform(0.16, 0.3), 0.36),
                               f'{seed} islet {number}', detail=1, rough=0.25, cuts=2)
    # The water hides whatever lies under it.
    parts['stone'] = forms.cull(rocks, lambda point: point[2] < WATER_Z - 0.01)
    for (x0, y0, x1, y1, top), shape, number in zip(entry['solids'][1:], ('cone', 'candle'), range(2)):
        middle = ((x0 + x1) / 2, (y0 + y1) / 2)
        parts = forms.gather(parts, stalagmite(middle, (x1 - x0) / 2 + 0.05, top, f'{seed} {number}', shape))
        parts = forms.gather(parts, stalagmite((middle[0] + 0.22 * (1 if number else -1), middle[1] + 0.25),
                                               0.14, top * 0.4, f'{seed} {number} young', 'cone', 9))
        spots = [forms.cast(ground, (middle[0] + dx, middle[1] + dy, 3.0), (0.0, 0.0, -1.0))
                 for dx, dy in ((0.42, 0.1), (0.3, 0.45), (0.5, 0.35), (-0.1, 0.5))]
        spots = [found[0] for found in spots if found]
        parts = forms.gather(parts, _mushrooms(spots, draw, entry, (0.05, 0.14)))
    return parts


def crystal_heart(entry):
    """A great cluster of crystals of every size breaking from a mound of rock: four giants from its heart, a ring
    of tall ones leaning out, small ones crusting the mound, two clusters at its corners, and shards on the floor."""
    seed = entry['module']
    size = entry['cells'][0] * catalog.CELL_M
    draw = random.Random(seed)
    noise = forms.Noise(seed)
    x0, y0, x1, y1, _ = entry['solids'][0]
    half = (x1 - x0) / 2
    floor, height_at = _rock_floor(seed, size, 0.012)
    parts = {'floor': floor}

    def mound_reach(turn):
        reach = 1.9 * (1 + 0.14 * noise(math.sin(turn) * 1.5, math.cos(turn) * 1.5))
        return min(reach * (1 + 0.25 * abs(math.sin(2 * turn))), _square_reach(half - 0.02, turn))

    def mound_z(x, y):
        turn = math.atan2(x - MIDDLE, -(y - MIDDLE)) % TAU
        share = min(1.0, math.hypot(x - MIDDLE, y - MIDDLE) / mound_reach(turn))
        return 0.95 * (1 - share * share) ** 0.7 * (1 + 0.3 * noise.fbm(x * 1.4, y * 1.4)) - 0.04

    sides = 56
    sections = []
    for step in range(sides + 1):
        turn = TAU * (step % sides) / sides
        reach = mound_reach(turn)
        section = []
        for share in (1.0, 0.86, 0.7, 0.54, 0.38, 0.22, 0.08, 0.0):
            x, y = MIDDLE + reach * share * math.sin(turn), MIDDLE - reach * share * math.cos(turn)
            section.append((x, y, mound_z(x, y)))
        sections.append(section)
    mound = sweep(sections, closed=False, outward=lambda points, i: (0.0, 0.0, 1.0))
    mound = [list(zip(points, box_uvs(points))) for points in ([point for point, _ in face] for face in mound)]

    def keep(point):
        x, y, z = point
        low, high = x0 + 0.03, x1 - 0.03
        x = forms.ease_over(forms.ease_under(x, high, 0.05), low, 0.05)
        y = forms.ease_over(forms.ease_under(y, high, 0.05), low, 0.05)
        return x, y, z

    rocks = []
    for number in range(7):
        turn = TAU * (number + draw.uniform(0.1, 0.9)) / 7
        reach = mound_reach(turn) * draw.uniform(0.55, 0.85)
        x, y = MIDDLE + reach * math.sin(turn), MIDDLE - reach * math.cos(turn)
        wide = draw.uniform(0.35, 0.6)
        rocks += forms.boulder((x, y, mound_z(x, y) - 0.1), (wide, wide * draw.uniform(0.7, 1.0), wide * 0.8),
                               f'{seed} rock {number}', detail=2, rough=0.22, cuts=3, floor=0.0, limit=keep)
    parts['stone'] = mound + rocks
    crystals = []

    def grow(base, axis, radius, length, sides=6, ends=1):
        made = forms.crystal(base, axis, radius, length, draw, sides=sides, ends=ends)
        if forms.landmark_fits(made, entry):
            crystals.extend(made)
            return True
        return False

    for number in range(4):
        turn = TAU * (number + draw.uniform(0.2, 0.8)) / 4
        tilt = math.radians(draw.uniform(4, 20) if number else 2)
        axis = (math.sin(tilt) * math.sin(turn), -math.sin(tilt) * math.cos(turn), math.cos(tilt))
        base = (MIDDLE + 0.22 * math.sin(turn), MIDDLE - 0.22 * math.cos(turn), 0.45)
        length = (4.2 - 0.45) / math.cos(tilt) * (1.0 if number == 0 else draw.uniform(0.55, 0.85))
        for shrink in (1.0, 0.85, 0.7, 0.55):
            if grow(base, axis, draw.uniform(0.24, 0.34) * (1.1 if number == 0 else 0.9), length * shrink):
                break
    for wanted, reach_range, tilt_range, length_range, radius_range in (
            (16, (0.35, 0.75), (14, 45), (0.6, 1.8), (0.07, 0.15)),
            (46, (0.45, 0.98), (25, 75), (0.12, 0.5), (0.025, 0.07))):
        for _ in range(wanted * 3):
            if not wanted:
                break
            turn = draw.uniform(0, TAU)
            reach = mound_reach(turn) * draw.uniform(*reach_range)
            x, y = MIDDLE + reach * math.sin(turn), MIDDLE - reach * math.cos(turn)
            tilt = math.radians(draw.uniform(*tilt_range))
            out = turn + draw.uniform(-0.4, 0.4)
            axis = (math.sin(tilt) * math.sin(out), -math.sin(tilt) * math.cos(out), math.cos(tilt))
            radius = draw.uniform(*radius_range)
            if grow((x, y, mound_z(x, y) - 0.06), axis, radius, draw.uniform(*length_range),
                    6 if radius > 0.05 else 5):
                wanted -= 1
    for gx, gy, _, _ in entry['glows'][1:]:
        out = math.atan2(gx - MIDDLE, -(gy - MIDDLE))
        for _ in range(16):
            turn = out + draw.uniform(-0.9, 0.9)
            tilt = math.radians(draw.uniform(10, 50))
            axis = (math.sin(tilt) * math.sin(turn), -math.sin(tilt) * math.cos(turn), math.cos(tilt))
            x, y = gx + draw.uniform(-0.25, 0.25), gy + draw.uniform(-0.25, 0.25)
            grow((x, y, max(mound_z(x, y), 0.0) - 0.05), axis, draw.uniform(0.04, 0.1), draw.uniform(0.35, 1.1))
    for _ in range(14):
        turn, reach = draw.uniform(0, TAU), draw.uniform(2.3, 2.95)
        x, y = MIDDLE + reach * math.sin(turn), MIDDLE - reach * math.cos(turn)
        lie = draw.uniform(0, TAU)
        length = draw.uniform(0.1, 0.26)
        start = (x, y, height_at(x, y) + 0.011)
        grow(start, (math.cos(lie), math.sin(lie), 0.0), 0.013, length, 5, 2)
    parts['crystal'] = crystals
    return parts


def stone_teeth(entry):
    """Five stalagmites of different heights and shapes, ridged and wet, standing in a damp floor: puddles round
    their feet, fungus crowding their bases and a glowing mat spreading where the fungus is thickest."""
    seed = entry['module']
    size = entry['cells'][0] * catalog.CELL_M
    draw = random.Random(seed)
    glow_x, glow_y = entry['glows'][0][:2]
    basins = [((x0 + x1) / 2 + draw.uniform(-0.3, 0.3), (y0 + y1) / 2 + 0.55, draw.uniform(0.35, 0.55))
              for x0, y0, x1, y1, _ in entry['solids'][::2]] + [(glow_x - 0.6, glow_y - 0.9, 0.4)]
    floor, height_at = _rock_floor(seed, size, 0.02, basins)
    parts = {'floor': floor}
    shapes = ('cone', 'plates', 'candle', 'broken', 'cone')
    for number, ((x0, y0, x1, y1, top), shape) in enumerate(zip(entry['solids'], shapes)):
        middle = ((x0 + x1) / 2, (y0 + y1) / 2)
        tooth = stalagmite(middle, (x1 - x0) / 2 + 0.05, top, f'{seed} {number}', shape, 16)
        parts = forms.gather(parts, tooth)
        corners = [(middle[0] + sx * draw.uniform(0.24, 0.36), middle[1] + sy * draw.uniform(0.24, 0.36))
                   for sx, sy in ((1, 1), (-1, 1), (1, -1), (-1, -1)) for _ in range(2)]
        found = [forms.cast(tooth['stone'] + tooth['water'] + tooth['stoneAlt'], (x, y, 3.0), (0.0, 0.0, -1.0))
                 for x, y in corners]
        spots = [hit[0] if hit else (x, y, height_at(x, y)) for hit, (x, y) in zip(found, corners)]
        parts = forms.gather(parts, _mushrooms(spots, draw, entry, (0.08, 0.26)))
    parts = forms.gather(parts, {'fungus': _mat(glow_x, glow_y, 0.3, height_at, f'{seed} glow')})
    buttons = []
    for _ in range(14):
        x, y = glow_x + draw.uniform(-0.45, 0.45), glow_y + draw.uniform(-0.45, 0.45)
        made = forms.mushroom((x, y, height_at(x, y) - 0.005), 0.02, draw.uniform(0.02, 0.035), draw)
        if forms.landmark_fits([face for each in made.values() for face in each], entry):
            buttons.append(made)
    parts = forms.gather(parts, *buttons)
    water = []
    for x, y, radius in basins:
        outline = [(x + radius * 0.92 * math.cos(TAU * k / 12), y + radius * 0.92 * math.sin(TAU * k / 12), -0.006)
                   for k in range(12)]
        water += forms.fan((x, y, -0.006), outline, rings=1)
    parts['water'] = parts.get('water', []) + water
    stones = []
    for _ in range(30):
        x, y = draw.uniform(0.2, size - 0.2), draw.uniform(0.2, size - 0.2)
        if any(math.hypot(x - bx, y - by) < radius for bx, by, radius in basins):
            continue
        z = height_at(x, y)
        stones += forms.pebble(x, y, draw.uniform(0.06, 0.16), min(0.045 - z, 0.03), draw, z=z, corners=5,
                               rounded=False)
    parts['stone'] = parts.get('stone', []) + stones
    return parts


def build(kit):
    """The caverns' three landmarks: {module: object}."""
    makers = {'caverns.still-lake': still_lake, 'caverns.crystal-heart': crystal_heart,
              'caverns.stone-teeth': stone_teeth}
    return {entry['module']: forms.make(kit, makers[entry['module']](entry), entry['module'], 50.0)
            for entry in catalog.landmarks_of('caverns')}
