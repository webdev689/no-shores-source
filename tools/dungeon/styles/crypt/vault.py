"""The Broken Vault: a heap of fallen vault round a broken column still standing. Voussoirs, slabs, drums and a
fallen capital lie half sunk in the rubble with a few bones from the burials it fell on, and dust spreads to the
walls. Its solids: the rubble [0.5..5.9] to 1.6 and the column [2.6..3.8] to 2.9; daylight falls in on the column.
"""
import math
import random

from styles.crypt import forms, ground, pieces
from styles.crypt.ground import MIDDLE, SIDE

# The rubble's square (its solid), and the share of it next to its edge where the heap runs down to dust.
EDGE = 0.5
FALL = 0.7


def _sunk(faces, at, turn, tilt, roll):
    """Faces moved so their middle lies at `at`, turned, tilted and rolled about it."""
    middle = forms.centre([point for face in faces for point, _ in face])
    return forms.placed(forms.placed(faces, (-middle[0], -middle[1], -middle[2])), at, turn, tilt, roll)


def _column(kit, draw):
    """The broken column: a buried plinth, its base's mouldings and a shaft snapped off higher on one side, the break
    rough."""
    made = [kit.bevelled_box(2.66, 2.66, 0.0, 3.74, 3.74, 0.3, bevel=0.04, wear=0.01, draw=draw, part='trim'),
            kit.lathe([(radius * 1.32, height) for radius, height in pieces.BASE_PROFILE] + [(0.0, 0.225 * 1.32)],
                      MIDDLE, MIDDLE, 0.3, sides=24, part='stone')]
    count, low = 24, draw.uniform(0, math.tau)
    reach = [0.41 + draw.uniform(-0.008, 0.008) for _ in range(count)]
    for crack in (3, 11, 19):
        reach[crack] -= 0.02
    rings = []
    for height in (0.55, 1.4, 2.1):
        rings.append([(MIDDLE + reach[step] * math.sin(math.tau * step / count),
                       MIDDLE + reach[step] * math.cos(math.tau * step / count), height) for step in range(count)])
    tops = [2.52 + 0.3 * math.cos(math.tau * step / count - low) + draw.uniform(-0.07, 0.07) for step in range(count)]
    rings.append([(x, y, top) for (x, y, _), top in zip(rings[-1], tops)])
    rings.append([(MIDDLE + (x - MIDDLE) * 0.6, MIDDLE + (y - MIDDLE) * 0.6, top - draw.uniform(0.02, 0.12))
                  for (x, y, _), top in zip(rings[-1], tops)])
    rings.append([(MIDDLE, MIDDLE, 2.5)] * count)
    made.append(forms.made(kit, forms.loft(rings), 'stone', smooth=50.0))
    return made


def _fallen(kit, draw, height):
    """The fallen vault: its rib's voussoirs, a run of three still joined, slabs, two drums and the capital."""
    made = []
    stones = forms.voussoirs(1.5, 0.0, 0.38, -0.24, 0.24, count=12, chamfer=0.035,
                             extra=[draw.uniform(0.0, 0.06) for _ in range(12)])
    spots = ground.scatter(draw, 9, (1.0, 1.0, 5.4, 5.4), avoid=((2.3, 2.3, 4.1, 4.1),))
    for number, (x, y, turn, _) in enumerate(spots):
        at = (x, y, height(x, y) + 0.08)
        part = 'stoneAlt' if number % 3 == 0 else 'trim'
        made.append(forms.made(kit, _sunk(stones[number], at, turn, draw.uniform(-35, 35), draw.uniform(-40, 40)),
                               part))
    run = [face for faces in stones[9:12] for face in faces]
    made.append(forms.made(kit, _sunk(run, (4.55, 2.15, height(4.55, 2.15) + 0.15), 62, 12, 70), 'trim'))
    for x, y, turn, scale in ground.scatter(draw, 5, (1.2, 1.2, 5.2, 5.2), avoid=((2.2, 2.2, 4.2, 4.2),)):
        slab = kit.bevelled_box(-0.45 * scale, -0.28 * scale, -0.06, 0.45 * scale, 0.28 * scale, 0.06, bevel=0.025,
                                wear=0.01, draw=draw, part='stoneAlt' if scale > 1.05 else 'floor')
        kit.rotate(slab, draw.uniform(-22, 22), 'x')
        kit.rotate(slab, draw.uniform(-15, 15), 'y')
        kit.rotate_z(slab, turn)
        made.append(kit.translate(slab, x, y, height(x, y) + 0.03))
    for x, y, turn in ((1.75, 4.3, 30), (4.6, 4.75, -65)):
        drum = kit.cylinder((-0.27, 0.0, 0.0), (0.27, 0.0, 0.0), 0.41, sides=20, part='stone')
        kit.rotate(drum, draw.uniform(-8, 8), 'y')
        kit.rotate_z(drum, turn)
        made.append(kit.translate(drum, x, y, height(x, y) + 0.22))
    capital = pieces.pillar_capital(kit)
    kit.translate(capital, 0.0, 0.0, -0.3)
    kit.rotate(capital, 74, 'x')
    kit.rotate_z(capital, 205)
    made.append(kit.translate(capital, 1.7, 2.1, height(1.7, 2.1) + 0.28))
    return made


def collapsed_vault(kit, entry):
    draw = random.Random(entry['module'])
    heaped = ground.bumps(draw, 18, (1.0, 1.0, 5.4, 5.4), (0.08, 0.3), (0.35, 0.8))

    def height(x, y):
        edge = min(x - EDGE, SIDE - EDGE - x, y - EDGE, SIDE - EDGE - y)
        if edge <= 0:
            return 0.012 + 0.012 * math.sin(x * 7.1) * math.sin(y * 5.3) ** 2
        fall = min(1.0, edge / FALL) ** 1.4
        mound = 0.7 * math.exp(-((x - 3.0) ** 2 + (y - 3.45) ** 2) / 3.2) + ground.lumps(heaped, x, y)
        return 0.024 + fall * mound

    lines = ([0.0, 0.25] + ground.steps(EDGE, SIDE - EDGE, 27) + [SIDE - 0.25, SIDE])
    made = ground.ground(kit, lines, lines, height,
                         lambda x, y: 'trim' if height(x, y) > 0.16 else 'floor')
    made += _column(kit, draw)
    made += _fallen(kit, draw, height)
    for x, y, _, scale in ground.scatter(draw, 26, (0.9, 0.9, 5.5, 5.5), avoid=((2.5, 2.5, 3.9, 3.9),)):
        size = 0.12 * scale + draw.uniform(0.0, 0.2)
        made.append(kit.rock(x, y, height(x, y) - size * 0.25, (size, size * draw.uniform(0.7, 1.0), size * 0.7),
                             seed=f'{entry["module"]}.rock.{x:.2f}', detail=1, roughness=0.3,
                             part='stoneAlt' if scale > 1.1 else 'trim'))
    for x, y in ((3.9, 1.6), (1.4, 3.3)):
        made.append(ground.skull_on(kit, draw, x, y, height(x, y)))
    made += ground.lying_bones(kit, draw, 5, (1.2, 1.2, 5.2, 5.2), height, avoid=((2.4, 2.4, 4.0, 4.0),))
    for number in range(14):
        side = number % 4
        along = draw.uniform(0.3, SIDE - 0.3)
        across = draw.uniform(0.12, 0.38)
        x, y = ((along, across), (along, SIDE - across), (across, along), (SIDE - across, along))[side]
        size = draw.uniform(0.05, 0.1)
        made.append(kit.rock(x, y, 0.0, (size, size * 0.8, 0.035), seed=f'{entry["module"]}.grit.{number}', detail=0,
                             roughness=0.3, part='trim'))
    return kit.join(made, entry['module'])
