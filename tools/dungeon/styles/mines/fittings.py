"""The mines' smaller kit: the tool rack and the rope and bucket, the rails, the spike sconce, and the portal's and
the exit's frames; with the tools and rails the landmarks use as well.
"""
import math

import details
from shapes import add, mul, unit

from .forms import arc_sweep, board, bucket, heap, nail, pick_head, plate, rod, tapered, timber, wedge, window
from .kit_pieces import OPEN, folding_wedges, make

# The rails' gauge between their middles, and their bar, metres: they run along x, the way the corridor runs.
GAUGE = 0.6
RAIL = (0.05, 0.026)
SLEEPERS = (-1.2, -0.4, 0.4, 1.2)


def pick(kit, eye, along, toward_grip, length=0.86):
    """A pick: its head through the eye at `eye` along `along`, its handle running from there toward the grip."""
    along, toward_grip = unit(along), unit(toward_grip)
    head, collar = pick_head(eye, along, toward_grip, steps=6)
    grip = add(eye, mul(toward_grip, length))
    return [make(kit, head, 'iron', smooth=40.0), make(kit, collar, 'iron'),
            make(kit, tapered(add(eye, mul(toward_grip, -0.06)), grip, 0.021, 0.017, sides=5), 'wood', smooth=50.0)]


def shovel(kit, foot, top):
    """A shovel from its blade's tip at `foot` to its grip at `top`, its blade's face square to y."""
    outline = [(-0.11, 0.3), (-0.12, 0.12), (-0.06, 0.02), (0.0, 0.0), (0.06, 0.02), (0.12, 0.12), (0.11, 0.3)]
    grip = [(0.07 * math.cos(math.radians(a)), 0, 1.06 + 0.1 * math.sin(math.radians(a))) for a in range(180, -1, -45)]
    tool = kit.join([make(kit, plate(outline, 0.008), 'iron'),
                     make(kit, tapered((0, 0, 0.27), (0, 0, 0.42), 0.032, 0.02, sides=5), 'iron'),
                     make(kit, rod((0, 0, 0.4), (0, 0, 1.06), 0.018, sides=5), smooth=50.0),
                     make(kit, rod((-0.065, 0, 1.16), (0.065, 0, 1.16), 0.014, sides=4), smooth=50.0),
                     make(kit, arc_sweep(grip, [0.012] * len(grip), sides=3))], 'shovel')
    kit.scale(tool, 1, 1, math.dist(foot, top) / 1.17)
    kit.rotate(tool, -math.degrees(math.atan2(top[1] - foot[1], top[2] - foot[2])), 'x')
    kit.rotate(tool, math.degrees(math.atan2(top[0] - foot[0], top[2] - foot[2])), 'y')
    return kit.translate(tool, *foot)


def feature_a(kit):
    found = [make(kit, board((x, 0.0175, 0.95), (x, 0.0175, 1.86), 0.12, 0.035, up=(0, 1, 0), ragged=(0.03, 0.03),
                             seed=f'mines.rack.batten{x}')) for x in (-0.52, 0.52)]
    found.append(make(kit, board((-0.74, 0.055, 1.5), (0.74, 0.055, 1.5), 0.16, 0.04, up=(0, 1, 0),
                                 ragged=(0.03, 0.03), seed='mines.rack.rail')))
    found += [make(kit, nail((x, 0.075, z), (0, 1, 0), 0.02, 0.008), 'iron')
              for x in (-0.52, 0.52) for z in (1.45, 1.55)]
    found += [make(kit, rod((x, 0.06, 1.505), (x, 0.2, 1.53), 0.014, sides=5), smooth=50.0)
              for x in (-0.6, -0.36, -0.12, 0.1)]
    found += pick(kit, (-0.48, 0.15, 1.575), (1, 0, 0), (0, 0, -1))
    found += pick(kit, (-0.01, 0.15, 1.575), (-0.995, 0, 0.1), (0.06, 0.02, -1), length=0.8)
    found.append(shovel(kit, (0.4, 0.22, 0.0), (0.33, 0.12, 1.42)))
    bar = [(-0.7, 0.24, 0.0), (-0.69, 0.2, 0.06), (-0.66, 0.06, 1.3), (-0.67, 0.07, 1.36)]
    found.append(make(kit, arc_sweep(bar, [0.008, 0.013, 0.013, 0.006], sides=4), 'iron'))
    found += [make(kit, timber((0.6, 0.2, 0.05), (0.77, 0.2, 0.05), 0.085, 0.085, chamfer=0.012), 'iron'),
              make(kit, tapered((0.685, 0.2, 0.09), (0.69, 0.07, 0.95), 0.02, 0.017, sides=5), smooth=50.0)]
    for number, (x, y, turn) in enumerate([(-0.36, 0.08, 15), (-0.1, 0.26, 250), (-0.26, 0.1, 160)]):
        found.append(make(kit, wedge((x, y, 0.0 if number < 2 else 0.035),
                                     (math.cos(math.radians(turn)), math.sin(math.radians(turn)), 0), (0, 0, 1),
                                     (0.2, 0.07, 0.035)), name=f'rack.wedge{number}'))
    return kit.join(found, 'feature.a')


def hook(kit, x, z, reach=0.12):
    """A forged peg driven into a board at y 0.04, turned up at its end."""
    return [make(kit, rod((x, 0.03, z), (x, 0.04 + reach, z + 0.01), 0.011, sides=4), 'iron'),
            make(kit, rod((x, 0.035 + reach, z + 0.005), (x, 0.045 + reach, z + 0.07), 0.009, sides=4), 'iron')]


def coil(kit, x, top, y=0.12, loops=5, seed='mines.coil'):
    """A coil of rope hung on a peg at (x, y, top): loops falling from it, bound near the top, its end hanging."""
    draw = details.seeded(seed)
    found = []
    for number in range(loops):
        wide, drop = draw.uniform(0.11, 0.16), draw.uniform(0.5, 0.6)
        lean, offset = draw.uniform(-0.03, 0.03), y + 0.035 * (number - loops / 2) / loops
        path = [(x + wide * math.sin(turn) + lean * (1 - math.cos(turn)) / 2, offset + 0.02 * math.sin(2 * turn),
                 top - drop * (1 - math.cos(turn)) / 2) for turn in (math.tau * step / 14 for step in range(15))]
        found.append(kit.rope(path, radius=0.017, sides=4, step=0.1))
    wrap = [(x + 0.085 * math.cos(turn), y + 0.06 * math.sin(turn), top - 0.09 - 0.012 * turn)
            for turn in (math.tau * step / 8 for step in range(17))]
    found.append(kit.rope(wrap, radius=0.012, sides=4, step=0.07))
    found.append(kit.rope([(x + 0.08, y + 0.02, top - 0.1), (x + 0.12, y + 0.05, top - 0.5),
                           (x + 0.1, y + 0.06, top - 0.9), (x + 0.14, y + 0.05, top - 1.05)], radius=0.016, sides=4,
                          step=0.1))
    return found


def feature_b(kit):
    found = [make(kit, board((-0.62, 0.02, 1.98), (0.62, 0.02, 1.98), 0.17, 0.04, up=(0, 1, 0), ragged=(0.03, 0.03),
                             seed='mines.feature.b.board'))]
    found += [make(kit, nail((x, 0.04, z), (0, 1, 0), 0.02, 0.008), 'iron')
              for x in (-0.52, 0.52) for z in (1.93, 2.03)]
    found += hook(kit, -0.3, 1.96) + hook(kit, 0.32, 1.96) + coil(kit, -0.3, 2.02)
    pail = kit.join([make(kit, faces, part, smooth=40.0) for part, faces in bucket().items()])
    kit.translate(pail, 0.32, 0.155, 1.0)
    bail = [(0.32 + 0.135 * math.cos(turn), 0.155, 1.235 + 0.15 * math.sin(turn))
            for turn in (math.pi * step / 6 for step in range(7))]
    found += [pail, make(kit, arc_sweep(bail, [0.006] * len(bail), sides=3), 'iron'),
              kit.rope([(0.32, 0.16, 1.98), (0.322, 0.158, 1.7), (0.32, 0.155, 1.385)], radius=0.013, sides=4,
                       step=0.1)]
    return kit.join(found, 'feature.b')


def rails(kit, seed, x0=-1.6, x1=1.6, y=0.0, sleepers=SLEEPERS, ends=OPEN):
    """Two iron rails along x from x0 to x1 on split sleepers, spiked; the bars' ends open where they meet the next
    cell's, unless `ends` closes them."""
    draw = details.seeded(seed)
    found = []
    for number, at in enumerate(sleepers):
        turn = math.radians(draw.uniform(-4, 4))
        reach = 0.48 + draw.uniform(-0.03, 0.04)
        found.append(make(kit, timber((at - reach * math.sin(turn), y - reach * math.cos(turn), 0.014),
                                      (at + reach * math.sin(turn), y + reach * math.cos(turn), 0.014), 0.15, 0.028,
                                      chamfer=0.0, ragged=(0.03, 0.03), seed=f'{seed}.sleeper{number}')))
        for side in (-1, 1):
            edge = side if number % 2 else -side
            spot = (at + edge * 0.03, y + side * GAUGE / 2 + edge * (RAIL[0] / 2 + 0.012), 0.026)
            found.append(make(kit, nail(spot, (0, 0, 1), 0.018, 0.012), 'iron'))
    for side in (-1, 1):
        middle = (y + side * GAUGE / 2, 0.048 - RAIL[1] / 2)
        found.append(make(kit, timber((x0, middle[0], middle[1]), (x1, middle[0], middle[1]), RAIL[0], RAIL[1],
                                      chamfer=0.0, caps=ends), 'iron'))
    return found


def ore_lumps(kit, seed, count, area, height=0.045, avoid=(), part='ore'):
    """Flat lumps of ore, with a little rock among them, lying on the floor under `height`."""
    found = []
    for number, (x, y, _, size) in enumerate(details.scatter(count, area, seed=seed, gap=0.06, avoid=avoid,
                                                            scales=(0.5, 1.0))):
        found.append(kit.rock(x, y, 0.0, (0.14 * size, 0.11 * size, height * (0.5 + size * 0.5)),
                              seed=f'{seed}{number}', detail=0, roughness=0.3,
                              part=part if number % 4 else 'stoneAlt', smooth=None))
    return found


def floor_a(kit):
    track = [(-1.6, y - 0.06, 1.6, y + 0.06) for y in (-GAUGE / 2, GAUGE / 2)]
    return kit.join(rails(kit, 'mines.floor.a') + ore_lumps(kit, 'mines.floor.a.grit', 5, (-1.4, -0.75, 1.4, 0.75),
                                                            0.03, track), 'floor.a')


def floor_b(kit):
    # The rails run on through the spill, so a run of them is never broken by the variant drawn.
    track = [(-1.6, y - 0.06, 1.6, y + 0.06) for y in (-GAUGE / 2, GAUGE / 2)]
    spread = details.seeded('mines.floor.b.spread')
    bumps = [(spread.uniform(-0.9, 0.5), spread.uniform(-0.6, 0.6), spread.uniform(0.2, 0.35)) for _ in range(4)]

    edge = window((-1.3, -0.9, 0.9, 0.9), 0.3)

    # The pile's edges lie under the floor, so only its heaps show, ragged, through it.
    def height_of(x, y):
        rise = sum(math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * reach * reach)) for bx, by, reach in bumps)
        return min(0.04, 0.05 * rise * min(1.0, abs(abs(y) - GAUGE / 2) / 0.08)) * edge(x, y) - 0.012
    pile = make(kit, heap(-1.3, -0.9, 0.9, 0.9, height_of, step=0.36), 'ore', closed=False)
    return kit.join(rails(kit, 'mines.floor.b') + [pile] + ore_lumps(kit, 'mines.floor.b.ore', 3,
                                                                      (-1.1, -0.8, 0.8, 0.8), 0.045, track),
                    'floor.b')


def sconce(kit):
    block = make(kit, timber((0, 0.035, -0.44), (0, 0.035, 0.1), 0.17, 0.07, up=(0, 1, 0), chamfer=0.012,
                             ragged=(0.0, 0.04), seed='mines.sconce.block'))
    spike = make(kit, timber((0, 0.02, -0.02), (0, 0.305, -0.13), 0.022, 0.022, chamfer=0.0, caps=OPEN), 'iron')
    strut = make(kit, timber((0, 0.05, -0.37), (0, 0.32, -0.16), 0.018, 0.012, up=(1, 0, 0), chamfer=0.0,
                             caps=OPEN), 'iron')
    cup = kit.lathe([(0.0, 0.0), (0.03, 0.0), (0.054, 0.075), (0.042, 0.075), (0.0, 0.04)], 0.0, 0.35, -0.155,
                    sides=7, part='iron', smooth=40.0)
    heads = [make(kit, nail((0, 0.07, z), (0, 1, 0), 0.03, 0.012), 'iron') for z in (0.05, -0.39)]
    return kit.join([block, spike, strut, cup, heads], 'sconce')


def heap_at(kit, x0, x1, seed, count=9, top=0.45, y0=0.025, y1=0.275):
    """Rubble fallen against a post's foot, x0..x1 and y0..y1: big stones low, small ones on them."""
    draw = details.seeded(seed)
    found = []
    for number in range(count):
        size = min(x1 - x0, 0.36 - 0.24 * number / count + draw.uniform(-0.04, 0.04))
        deep = min(size * 0.75, y1 - y0)
        x, y = draw.uniform(x0 + size / 2, x1 - size / 2), draw.uniform(y0 + deep / 2, y1 - deep / 2)
        z = max(0.0, top * number / count * draw.uniform(0.6, 1.0) - size * 0.35)
        found.append(kit.rock(x, y, z, (size, deep, size * 0.75), seed=f'{seed}{number}',
                              detail=1 if size > 0.22 else 0, roughness=0.3,
                              part='ore' if number % 3 == 2 else 'stoneAlt', smooth=None))
    return found


def portal(kit):
    found = [make(kit, timber((-1.26, 0.12, 2.58), (1.26, 0.12, 2.58), 0.24, 0.3, chamfer=0.03, facets=0.014,
                              check='bottom', stations=4, wobble=0.01, ragged=(0.05, 0.05), seed='mines.portal.cap'))]
    for side in (-1, 1):
        found.append(make(kit, timber((side * 0.86, 0.11, 0.0), (side * 0.86, 0.11, 2.45), 0.28, 0.22,
                                      up=(0, 1, 0), chamfer=0.03, facets=0.012, check='top', caps=OPEN,
                                      seed=f'mines.portal.post{side}')))
        found.append(make(kit, timber((side * 0.92, 0.11, 1.85), (side * 1.22, 0.11, 2.46), 0.1, 0.2, up=(0, 1, 0),
                                      chamfer=0.015, caps=OPEN, seed=f'mines.portal.spur{side}')))
        found.append(make(kit, timber((side * 0.34, 0.12, 2.81), (side * 1.08, 0.12, 2.81), 0.24, 0.16,
                                      chamfer=0.02, ragged=(0.03, 0.03), seed=f'mines.portal.block{side}')))
        found += folding_wedges(kit, side * 1.0, side * 0.42, 0.12, 2.89, 0.06, 0.16, f'mines.portal.wedge{side}')
        # Rubble heaped beside each post, and a skirt of stones fallen before its foot.
        outer = (1.0, 1.3) if side > 0 else (-1.3, -1.0)
        found += heap_at(kit, *outer, f'mines.portal.rubble{side}', count=9 if side > 0 else 6,
                         top=0.85 if side > 0 else 0.45)
        found += heap_at(kit, side * 0.74 if side > 0 else -1.04, 1.04 if side > 0 else -0.74,
                         f'mines.portal.skirt{side}', count=4, top=0.1, y0=0.21, y1=0.295)
    found.append(make(kit, board((1.14, 0.2, 0.0), (1.21, 0.1, 1.5), 0.16, 0.03, up=(0, 1, 0), snapped=(0.0, 0.1),
                                 seed='mines.portal.board')))
    found += [make(kit, nail((x, 0.0, 2.58), (0, -1, 0), 0.035, 0.015), 'iron') for x in (-0.86, 0.86)]
    return kit.join(found, 'portal')


def exit_frame(kit):
    found = [make(kit, timber((-1.22, 0.165, 2.55), (1.22, 0.165, 2.55), 0.24, 0.26, chamfer=0.03, facets=0.014,
                              check='bottom', stations=4, wobble=0.01, ragged=(0.05, 0.05), seed='mines.exit.cap'))]
    # Head lagging: two split boards across over the cap, against the rock.
    for number, (z, tilt) in enumerate(((2.77, 0.02), (2.95, -0.015))):
        found.append(make(kit, board((-1.18, 0.05, z), (1.15, 0.05, z + tilt), 0.17, 0.03, up=(0, 1, 0),
                                     ragged=(0.04, 0.04), seed=f'mines.exit.head{number}')))
    for side in (-1, 1):
        # The posts lean in: a set battered against the rock's push from the sides.
        found.append(make(kit, timber((side * 1.08, 0.17, 0.0), (side * 0.86, 0.17, 2.46), 0.24, 0.24, up=(0, 1, 0),
                                      chamfer=0.03, facets=0.012, check='top', caps=OPEN,
                                      seed=f'mines.exit.post{side}')))
        for number, x in enumerate((1.16, 0.97)):
            found.append(make(kit, board((side * x, 0.02, 0.0), (side * (x - 0.1), 0.02, 2.4), 0.17, 0.028,
                                         up=(0, 1, 0), ragged=(0.0, 0.05), seed=f'mines.exit.lag{side}{number}')))
        found.append(make(kit, wedge((side * 0.72, 0.18, 2.68), (side, 0, 0), (0, 0, 1), (0.26, 0.2, 0.05)),
                          name='exit.wedge'))
        found += [make(kit, nail((side * (0.96 - z * 0.09), 0.06, z), (0, -1, 0), 0.03, 0.012), 'iron')
                  for z in (0.3, 2.3)]
    return kit.join(found, 'exit')
