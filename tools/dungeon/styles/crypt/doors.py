"""The crypt's doorways: a round arch of chunky voussoirs under a skull keystone, a lintel doorway with its jambs faced
in stacked bones behind iron bars, the portal's arch of hooded mourners' heads and the exit's rough surround under an
iron-strapped lintel. A doorway's room is toward -y; its code-built jambs fill x ±0.9..±1.6, y 0..0.3, under a
lintel at 2.8.
"""
import math
import random

from styles.crypt import forms
from styles.crypt.hidden import cull

# The doorway's opening, metres: its half width and the code's lintel; a round arch on it springs where its crown
# meets the lintel, so the arch alone shapes the opening.
HALF = 0.9
LINTEL = 2.8
SPRING = LINTEL - HALF


def _quoins(kit, draw, side, top, inner, room, corridor, courses=6, parts=('trim', 'stone'), base=0.0,
            widths=(0.42, 0.58)):
    """A jamb dressed in quoins from `base` to `top`, short and long in turn (`widths`), wrapping the code's jamb from
    `room` to `corridor` (y), their reveal at x `inner` (by side, ±)."""
    found, level = [], base
    heights = [draw.uniform(0.85, 1.15) for _ in range(courses)]
    heights = [share / sum(heights) * (top - base) for share in heights]
    for number, height in enumerate(heights):
        reach = inner + widths[number % 2] + draw.uniform(-0.03, 0.0)
        low, high = sorted((side * inner, side * reach))
        proud = draw.uniform(0.0, 0.02)
        found.append(kit.bevelled_box(low, room + proud, level + 0.006, high, corridor - proud, level + height - 0.006,
                                      bevel=0.03, wear=0.008, draw=draw, part=parts[number % 2]))
        level += height
    return found


def _skull_carving(kit, at, turn, size, depth=0.45):
    """A skull carved on a stone's face, its front half only, set in."""
    return forms.made(kit, forms.placed(forms.skull(1, half=True), at, turn=turn, size=size, depth=depth), 'relief',
                      closed=False)


def door_a(kit):
    """A round arch of nine chunky voussoirs on chamfered imposts, its keystone a carved skull on either face."""
    draw = random.Random('crypt.door.a')
    room, corridor = -0.08, 0.38
    extra = [draw.uniform(0.0, 0.07) for _ in range(9)]
    extra[4] = 0.14
    stones = forms.voussoirs(HALF, SPRING, 0.32, room, corridor, count=9, extra=extra, chamfer=0.03)
    made = [forms.made(kit, faces, 'relief' if number == 4 else ('stoneAlt' if number in (2, 7) else 'trim'))
            for number, faces in enumerate(stones)]
    for side in (-1, 1):
        made += _quoins(kit, draw, side, SPRING - 0.16, HALF - 0.02, room + 0.02, corridor - 0.02, courses=5, base=0.22)
        low, high = sorted((side * (HALF - 0.04), side * (HALF + 0.56)))
        impost = kit.bevelled_box(low, room - 0.03, SPRING - 0.16, high, corridor + 0.03, SPRING, bevel=0.05,
                                  part='trim')
        made.append(impost)
        foot_low, foot_high = sorted((side * (HALF - 0.05), side * (HALF + 0.62)))
        made.append(kit.bevelled_box(foot_low, room - 0.04, 0.0, foot_high, corridor + 0.04, 0.22, bevel=0.04,
                                     wear=0.006, part='stoneAlt'))
    crown = SPRING + HALF + 0.24
    made.append(_skull_carving(kit, (0.0, room + 0.01, crown - 0.13), 180, 1.35))
    made.append(_skull_carving(kit, (0.0, corridor - 0.01, crown - 0.13), 0, 1.35))
    return cull(kit.join(made, 'door.a'), floor=0.0)


def _ossuary(kit, draw, side, room):
    """A jamb's face inlaid with an ossuary: a row of skulls and bones laid lengthwise against the heap's dark, behind
    four iron bars and two straps, in a stone frame."""
    low, high = sorted((side * 0.97, side * 1.5))
    bottom, top = 0.26, 2.56
    made = []
    for z0, z1 in ((0.0, bottom), (top, LINTEL - 0.02)):
        made.append(kit.box(low - 0.07, room, z0, high + 0.07, 0.0, z1, part='trim'))
    for x0, x1 in ((low - 0.07, low), (high, high + 0.07)):
        made.append(kit.box(x0, room, bottom, x1, 0.0, top, part='trim'))
    made.append(kit.box(low, -0.02, bottom, high, -0.005, top, part='bone'))
    middle = (low + high) / 2
    for column in (-1, 0, 1):
        spot = (middle + column * 0.165 + draw.uniform(-0.01, 0.01), -0.035, 1.38 + draw.uniform(0.0, 0.01))
        made.append(forms.made(kit, forms.placed(forms.skull(0, half=True), spot, turn=180 + draw.uniform(-12, 12),
                                                 size=draw.uniform(0.76, 0.82), depth=0.75), 'bone', closed=False))
    for level in (1.18, 1.62):
        for row in range(2):
            lift = draw.uniform(-0.004, 0.004)
            height = level + 0.048 * row + 0.022 * (1 if level > 1.5 else -1)
            made.append(forms.made(kit, forms.long_bone((low - 0.01, -0.045, height + lift),
                                                        (high + 0.01, -0.045, height - lift), 0.012, 4), 'bone'))
    for step in range(4):
        x = low + (high - low) * (step + 0.5) / 4
        made.append(kit.prism((x, -0.1, bottom - 0.02), (x, -0.1, top + 0.02), 0.016, 4, 45.0, part='iron'))
    for height in (0.62, 2.2):
        made.append(kit.box(low - 0.04, -0.118, height - 0.03, high + 0.04, -0.085, height + 0.03, part='iron'))
    return made


def door_b(kit):
    """A great lintel over jambs faced with ossuaries behind bars, the gate long gone but for its iron in the stone."""
    draw = random.Random('crypt.door.b')
    made = [kit.bevelled_box(-1.56, -0.06, LINTEL, 1.56, 0.4, LINTEL + 0.5, bevel=0.05, wear=0.012, draw=draw,
                             part='trim'),
            kit.bevelled_box(-0.72, -0.075, LINTEL + 0.08, 0.72, -0.05, LINTEL + 0.42, bevel=0.012, part='relief'),
            _skull_carving(kit, (0.0, -0.07, LINTEL + 0.1), 180, 1.05, depth=0.5)]
    for side in (-1, 1):
        made += _ossuary(kit, draw, side, -0.12)
        low, high = sorted((side * HALF, side * 1.45))
        made.append(kit.box(low, 0.3, 0.0, high, 0.38, LINTEL, part='stoneAlt'))
    for height in (0.42, 2.1):
        made.append(kit.box(-0.9, 0.2, height, -0.84, 0.28, height + 0.07, part='iron'))
        made.append(kit.cylinder((-0.86, 0.24, height + 0.07), (-0.86, 0.24, height + 0.17), 0.013, sides=6,
                                 part='iron'))
    made.append(kit.box(0.84, 0.19, 1.04, 0.9, 0.29, 1.08, part='iron'))
    made.append(kit.box(0.845, 0.19, 1.12, 0.9, 0.29, 1.16, part='iron'))
    made.append(kit.box(0.82, 0.215, 1.04, 0.845, 0.265, 1.16, part='iron'))
    return cull(kit.join(made, 'door.b'), floor=0.0)


def _mourner_head(kit, middle, angle, size):
    """A hooded head carved on a voussoir, its crown along the arch's radius `angle` (degrees from up)."""
    head = forms.placed(forms.hooded(angles=12, fold=0.0, bow=0.0, head=True), (0.0, 0.0, -1.55))
    return forms.made(kit, forms.placed(head, middle, roll=angle, size=size, depth=0.8), 'relief')


def portal(kit):
    """A heavy segmental arch on quoined posts, each voussoir carrying a hooded mourner's head."""
    draw = random.Random('crypt.portal')
    made = []
    half, spring, depth = 0.74, 2.42, 0.34
    rise = 0.22
    radius = (half * half + rise * rise) / (2 * rise)
    centre = spring + rise - radius
    sweep_angle = math.atan2(half, radius - rise)
    count = 7
    for number in range(count):
        first = -sweep_angle + 2 * sweep_angle * number / count + 0.008
        last = -sweep_angle + 2 * sweep_angle * (number + 1) / count - 0.008
        outer = radius + depth + (0.1 if number == count // 2 else draw.uniform(0.0, 0.05))
        sections = []
        for step in range(3):
            turn = first + (last - first) * step / 2
            out = (math.sin(turn), math.cos(turn))
            ring = [(radius + 0.03, 0.0), (radius, 0.03), (radius, 0.15), (radius + 0.03, 0.18),
                    (outer - 0.03, 0.18), (outer, 0.15), (outer, 0.03), (outer - 0.03, 0.0)]
            sections.append([(out[0] * reach, along, centre + out[1] * reach) for reach, along in ring])
        part = 'stoneAlt' if number % 2 else 'trim'
        made.append(forms.made(kit, forms.loft(sections), part))
        turn = (first + last) / 2
        reach = radius + depth * 0.5
        made.append(_mourner_head(kit, (math.sin(turn) * reach, 0.17, centre + math.cos(turn) * reach),
                                  math.degrees(turn), 0.68))
    for side in (-1, 1):
        made += _quoins(kit, draw, side, spring - 0.14, 0.74, 0.0, 0.18, courses=5, parts=('trim', 'stoneAlt'),
                        base=0.24, widths=(0.36, 0.5))
        low, high = sorted((side * 0.72, side * 1.29))
        made.append(kit.bevelled_box(low, -0.02, spring - 0.14, high, 0.22, spring, bevel=0.04, part='trim'))
        foot_low, foot_high = sorted((side * 0.72, side * 1.3))
        made.append(kit.bevelled_box(foot_low, -0.02, 0.0, foot_high, 0.24, 0.24, bevel=0.035, part='stone'))
    return cull(kit.join(made, 'portal'), floor=0.0, wall=0.0)


def exit_door(kit):
    """A rough-hewn surround of uneven blocks under a heavy lintel bound in three riveted iron straps."""
    draw = random.Random('crypt.exit')
    made = []
    for side in (-1, 1):
        level = 0.0
        while level < 2.36:
            height = min(draw.uniform(0.34, 0.52), 2.4 - level)
            if 2.4 - level - height < 0.2:
                height = 2.4 - level
            reach = draw.uniform(0.42, 0.55)
            low, high = sorted((side * 0.72, side * (0.72 + reach)))
            made.append(kit.rock((low + high) / 2, 0.12, level, (high - low, 0.24, height - 0.012),
                                 seed=f'crypt.exit.{side}.{level:.2f}', detail=1, roughness=0.12, shape='cube',
                                 base=0.0, part='stone' if draw.random() < 0.6 else 'stoneAlt'))
            level += height
    made.append(kit.bevelled_box(-1.28, 0.0, 2.4, 1.28, 0.27, 2.92, bevel=0.05, wear=0.02, draw=draw, part='trim'))
    for x in (-0.82, 0.0, 0.82):
        made.append(kit.box(x - 0.07, -0.006, 2.4 if x == 0.0 else 2.38, x + 0.07, 0.285, 2.94, part='iron'))
        for z in (2.5, 2.82):
            made.append(kit.cone((x, 0.285, z), (x, 0.3, z), 0.022, 0.012, sides=6, part='iron'))
    return cull(kit.join(made, 'exit'), floor=0.0, wall=0.0)
