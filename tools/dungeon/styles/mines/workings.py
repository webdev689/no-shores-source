"""Two of the mines' landmarks: the Ore Cart (a loaded cart on its spur against a spoil heap, a lantern on a post)
and the Collapse (a roof come down over broken sets, a dropped lantern still alight), built to landmarks.json.
"""
import math

import details
from shapes import revolve, ring

from .fittings import ore_lumps, pick, rails, shovel
from .forms import board, bumps, heap, rod, rough, timber, wedge, window
from .kit_pieces import make
from .landmarks import floor, lit_lantern


def on(height_of, x, y, lift=0.0):
    """A point on a heap's surface, lifted."""
    return (x, y, height_of(x, y) + lift)


def boulders(kit, height_of, spots, seed, ore_every=3):
    """Rocks bedded in a heap where `spots` says, (x, y, size) each: about a third sunk, every third one ore."""
    found = []
    for number, (x, y, size) in enumerate(spots):
        extent = (size, size * 0.85, size * 0.7)
        found.append(kit.rock(x, y, max(0.0, height_of(x, y) - extent[2] * 0.3), extent, seed=f'{seed}{number}',
                              detail=1 if size > 0.3 else 0, roughness=0.3,
                              part='ore' if number % ore_every == ore_every - 1 else 'stoneAlt', smooth=None))
    return found


def scattered(seed, count, area, sizes):
    draw = details.seeded(seed)
    return [(draw.uniform(area[0], area[2]), draw.uniform(area[1], area[3]), draw.uniform(*sizes))
            for _ in range(count)]


def tub(kit, low, high):
    """A cart's flared tub from its floor rectangle `low` (x0, y0, x1, y1, z) to its rim `high`: three boards a
    side, iron at its corners and round its rim."""
    found = [make(kit, timber((low[0], (low[1] + low[3]) / 2, low[4] + 0.02), (low[2], (low[1] + low[3]) / 2,
                                                                             low[4] + 0.02), low[3] - low[1], 0.04,
                              chamfer=0.0))]
    rise = (high[4] - low[4]) / 3 - 0.012
    for row in range(3):
        share = (row + 0.5) / 3
        x0, y0, x1, y1 = (lo + (hi - lo) * share for lo, hi in zip(low[:4], high[:4]))
        z = low[4] + (high[4] - low[4]) * share
        for side in (-1, 1):
            y = y1 if side > 0 else y0
            found.append(make(kit, board((x0, y, z), (x1, y, z), rise, 0.035, up=(0, side * 0.2, 0.98),
                                         seed=f'mines.cart.side{row}{side}')))
            x = x1 if side > 0 else x0
            found.append(make(kit, board((x, y0 + 0.03, z), (x, y1 - 0.03, z), rise, 0.035, up=(side * 0.2, 0, 0.98),
                                         seed=f'mines.cart.end{row}{side}')))
    for x_at in (0, 2):
        for y_at in (1, 3):
            outward = (1 if x_at else -1, 1 if y_at == 3 else -1, 0)
            found.append(make(kit, timber((low[x_at], low[y_at], low[4]), (high[x_at], high[y_at], high[4]), 0.07,
                                          0.012, up=outward, chamfer=0.0), 'iron'))
    rim = [(high[0], high[1]), (high[2], high[1]), (high[2], high[3]), (high[0], high[3])]
    for (ax, ay), (bx, by) in zip(rim, rim[1:] + rim[:1]):
        found.append(make(kit, timber((ax, ay, high[4] - 0.03), (bx, by, high[4] - 0.03), 0.05, 0.06, chamfer=0.0),
                          'iron'))
    return found


def cart(kit):
    """A wooden ore cart on the spur: a flared tub on two iron axles and flanged wheels, heaped with ore."""
    found = []
    for x in (1.45, 2.15):
        for rail, way in ((1.272, 1), (1.928, -1)):
            found.append(make(kit, revolve([(0.0, 0.0), (0.14, 0.0), (0.14, 0.053), (0.165, 0.056), (0.165, 0.068),
                                            (0.05, 0.068), (0.0, 0.075)], (x, rail, 0.19), (0, way, 0), sides=10),
                              'iron', smooth=40.0))
        found.append(make(kit, rod((x, 1.25, 0.19), (x, 1.95, 0.19), 0.025, sides=5), 'iron'))
    for y in (1.42, 1.78):
        found.append(make(kit, timber((1.1, y, 0.34), (2.5, y, 0.34), 0.1, 0.08, chamfer=0.01, ragged=(0.02, 0.02),
                                      seed=f'mines.cart.sill{y}')))
    found += tub(kit, (1.18, 1.2, 2.42, 2.0, 0.38), (1.06, 1.08, 2.54, 2.12, 0.95))
    for x in (1.03, 2.57):
        found.append(make(kit, ring((x, 1.6, 0.52), 0.035, 0.009, axis=(0, 1, 0), sides=8, tube_sides=3), 'iron'))
    load = bumps('mines.cart.load', 4, (1.3, 1.3, 2.3, 1.9), (0.2, 0.4), (0.15, 0.3))
    edge = window((1.08, 1.1, 2.52, 2.1), 0.25)
    found.append(make(kit, heap(1.08, 1.1, 2.52, 2.1, lambda x, y: 0.82 + min(0.38, load(x, y)) * edge(x, y) + 0.06,
                                step=0.2), 'ore', closed=False))
    found += boulders(kit, lambda x, y: 0.9 + min(0.28, load(x, y)),
                      scattered('mines.cart.lumps', 9, (1.3, 1.3, 2.3, 1.9), (0.12, 0.22)), 'mines.cart.lump', 1)
    found += pick(kit, (2.585, 1.45, 0.99), (0, 1, 0.08), (0.02, 0.22, -1), length=0.82)
    return found


def ore_cart(kit):
    found = floor(kit, 6.4, 3.2)
    found += rails(kit, 'mines.cart.rails', 0.15, 3.45, 1.6, sleepers=(0.45, 1.1, 1.75, 2.4, 3.05), ends=(True, False))
    found.append(make(kit, timber((3.48, 1.05, 0.13), (3.48, 2.15, 0.13), 0.22, 0.26, chamfer=0.02, facets=0.01,
                                  ragged=(0.04, 0.04), seed='mines.cart.buffer')))
    found += cart(kit)
    rise = bumps('mines.cart.spoil', 6, (3.9, 0.9, 5.5, 2.3), (0.45, 0.8), (0.5, 0.9))
    edge = window((3.42, 0.42, 5.98, 2.78), 0.7)

    def smooth(x, y):
        return min(1.25, rise(x, y)) * edge(x, y)
    spoil = rough(smooth, 0.07, 'mines.cart.spoil')
    found.append(make(kit, heap(3.42, 0.42, 5.98, 2.78, spoil, step=0.26), 'stoneAlt', closed=False))
    found += boulders(kit, smooth, scattered('mines.cart.rocks', 26, (3.75, 0.75, 5.65, 2.45), (0.14, 0.42)),
                      'mines.cart.rock')
    found += pick(kit, on(spoil, 4.45, 1.2, 0.05), (0.8, 0.2, -0.55), (-0.35, 0.3, 0.88))
    found.append(shovel(kit, on(spoil, 5.2, 2.0, -0.16), on(spoil, 5.0, 2.25, 1.05)))
    # The lantern on its post at the heap's far corner, its foot wedged on a flat stone.
    found.append(kit.rock(6.1, 2.8, 0.0, (0.36, 0.34, 0.08), seed='mines.cart.post.stone', detail=0, roughness=0.2,
                          part='stoneAlt', smooth=None))
    found.append(make(kit, timber((6.1, 2.8, 0.06), (6.1, 2.8, 1.85), 0.15, 0.15, up=(0, 1, 0), chamfer=0.02,
                                  facets=0.008, seed='mines.cart.post')))
    found.append(make(kit, board((5.97, 2.8, 1.865), (6.23, 2.8, 1.865), 0.24, 0.03, seed='mines.cart.shelf')))
    found += [make(kit, wedge((6.1 + dx * 0.15, 2.8 + dy * 0.15, 0.06), (-dx, -dy, 0), (0, 0, 1), (0.1, 0.06, 0.04)),
                   name='cart.post.wedge') for dx, dy in ((1, 0), (0, 1), (-1, 0))]
    found.append(kit.translate(lit_lantern(kit, 0.3), 6.1, 2.8, 1.88))
    track = [(0.15, 1.24, 3.45, 1.36), (0.15, 1.84, 3.45, 1.96), (1.0, 1.0, 2.6, 2.2)]
    found += ore_lumps(kit, 'mines.cart.spill', 10, (0.3, 0.3, 3.3, 2.9), avoid=track)
    return kit.join(found, 'mines.ore-cart')


def wreckage(kit, ground):
    """The broken sets: a post still holding one end of its cap, a snapped post and its top, a beam broken in two,
    a post fallen against the roof, and boards strewn over the rock or hanging from the roof."""
    hewn = {'chamfer': 0.028, 'facets': 0.012}
    found = [make(kit, timber((0.82, 2.3, 0.0), (0.9, 2.38, 2.72), 0.26, 0.26, up=(0, 1, 0), check='top',
                              seed='mines.collapse.post', **hewn)),
             make(kit, timber((0.78, 2.34, 2.85), on(ground, 3.4, 2.75, 0.14), 0.26, 0.25, snapped=(0.0, 0.3),
                              seed='mines.collapse.cap', **hewn)),
             make(kit, timber((5.5, 4.75, 0.0), (5.48, 4.72, 1.25), 0.26, 0.26, up=(0, 1, 0), snapped=(0.0, 0.28),
                              seed='mines.collapse.stump', **hewn)),
             make(kit, timber(on(ground, 5.15, 4.35, 0.14), on(ground, 3.7, 3.55, 0.14), 0.26, 0.26,
                              snapped=(0.25, 0.0), seed='mines.collapse.top', **hewn)),
             make(kit, timber(on(ground, 1.05, 4.55, 0.13), on(ground, 2.85, 4.92, 0.13), 0.26, 0.25,
                              snapped=(0.0, 0.25), ragged=(0.04, 0.0), seed='mines.collapse.beam0', **hewn)),
             make(kit, timber(on(ground, 3.05, 5.05, 0.13), on(ground, 4.7, 5.35, 0.13), 0.26, 0.25,
                              snapped=(0.3, 0.0), ragged=(0.0, 0.04), seed='mines.collapse.beam1', **hewn)),
             make(kit, timber((4.75, 0.75, 0.0), (4.15, 1.4, 2.75), 0.24, 0.24, up=(0, 1, 0), snapped=(0.0, 0.2),
                              seed='mines.collapse.lean', **hewn))]
    draw = details.seeded('mines.collapse.boards')
    for number in range(11):
        x, y, turn = draw.uniform(1.0, 5.4), draw.uniform(1.0, 5.4), draw.uniform(0, math.tau)
        run = draw.uniform(0.35, 0.75)
        ends = [(min(5.8, max(0.6, x + way * run * math.cos(turn))), min(5.8, max(0.6, y + way * run * math.sin(turn))))
                for way in (-1, 1)]
        lift = draw.uniform(0.1, 0.45) if number % 3 == 0 else 0.03
        found.append(make(kit, board(on(ground, *ends[0], 0.03), on(ground, *ends[1], lift), draw.uniform(0.15, 0.24),
                                     0.035, snapped=(0.0, 0.1 if number % 2 else 0.0),
                                     seed=f'mines.collapse.board{number}')))
    for number, (x, y) in enumerate(((4.7, 1.2), (5.25, 1.6))):
        found.append(make(kit, board((x, y, 3.07), (x + 0.12, y + 0.55, 2.35 + 0.15 * number), 0.2, 0.035,
                                     snapped=(0.0, 0.12), seed=f'mines.collapse.hanging{number}')))
    return found


def collapse(kit):
    found = floor(kit, 6.4, 6.4)
    area = (0.45, 0.45, 5.95, 5.95)
    mounds = bumps('mines.collapse.mounds', 8, (1.4, 1.4, 5.0, 5.0), (0.7, 1.3), (0.45, 0.85))
    edge = window(area, 1.0)

    def ground(x, y):
        # The roof came down hardest in the north-east: the heap climbs toward it.
        fall = 1.7 * math.exp(-((x - 4.9) ** 2 + (y - 1.5) ** 2) / (2 * 0.9 * 0.9))
        return min(2.7, (mounds(x, y) + fall) * edge(x, y))
    found.append(make(kit, heap(*area, rough(ground, 0.09, 'mines.collapse'), step=0.27), 'stoneAlt',
                      closed=False))
    found += boulders(kit, ground, scattered('mines.collapse.big', 16, (1.1, 1.1, 5.3, 5.3), (0.4, 1.0)),
                      'mines.collapse.big')
    found += boulders(kit, ground, scattered('mines.collapse.small', 22, (0.8, 0.8, 5.6, 5.6), (0.12, 0.3)),
                      'mines.collapse.small')
    found += wreckage(kit, ground)
    # The dropped lantern lies on its side by the heap's foot, still alight, its glass where the glow is.
    lamp = kit.rotate(lit_lantern(kit, 0.3), 78, 'y')
    found.append(kit.translate(lamp, 2.0 - 0.12, 5.6, 0.3 - 0.025))
    found += boulders(kit, ground, [(1.93, 5.6, 0.2), (2.12, 5.5, 0.16)], 'mines.collapse.rest')
    found += pick(kit, on(ground, 2.7, 5.25, 0.02), (0.6, 0.3, -0.75), (-0.5, 0.25, 0.83), length=0.84)
    found += ore_lumps(kit, 'mines.collapse.margin', 16, (0.05, 0.05, 6.35, 6.35), avoid=[(0.5, 0.5, 5.9, 5.9)],
                       part='stoneAlt')
    return kit.join(found, 'mines.collapse')
