"""The barrow's three landmarks, each in its own frame from its footprint's north-west corner (metres; a wall's
landmark has the wall at y 0): the Capstone Chamber, uprights carrying one great capstone over a dark cist, an
offering slab before it with candles and quartz; the Stone Ring, nine stones round a flat stone where a brazier
burns; and the Sealed Forecourt, a façade of orthostats between two horns, its way shut by a blocking slab, braziers
on stone stands either side.
"""
import math
import random

from styles.barrow.forms import drystone, marks, quartz, slab, upright
from styles.crypt import ground

SIDE = 6.4


def _floor(kit, depth, part='floor'):
    """A level floor over the whole footprint at z 0."""
    return ground.ground(kit, ground.steps(0.0, SIDE, 16), ground.steps(0.0, depth, round(depth / 0.4)),
                         lambda x, y: 0.0, lambda x, y: part)


def _brazier(kit, x, y, top):
    """An iron bowl of embers on a stone's top at height `top`."""
    return [kit.lathe([(0.0, top), (0.08, top), (0.17, top + 0.12), (0.19, top + 0.15), (0.0, top + 0.15)], x, y, 0.0,
                      sides=10, part='iron'),
            kit.lathe([(0.0, top + 0.11), (0.16, top + 0.11), (0.1, top + 0.17), (0.0, top + 0.19)], x, y, 0.0,
                      sides=8, part='ember')]


def capstone_chamber(kit, entry):
    """A chamber of five uprights under one great capstone, cup-marked on its top and edge, a gap between the front
    stones showing the dark cist inside; before it an offering slab, cupped, with two candles and white quartz."""
    module = entry['module']
    draw = random.Random(module)
    made = _floor(kit, SIDE)
    stones = [((1.68, 3.25), 0.34, 3.0, 90), ((4.72, 3.25), 0.34, 3.0, 90), ((3.2, 4.62), 0.32, 2.7, 0),
              ((2.08, 1.86), 0.34, 1.05, 0), ((4.32, 1.86), 0.34, 1.05, 0)]
    for number, ((x, y), thick, wide, turn) in enumerate(stones):
        made.append(upright(kit, wide, thick, 2.5, f'{module} {number}', at=(x, y, 0.0), turn=turn, sections=6,
                            points=10))
    cap = slab(kit, 1.45, 1.65, 2.5, 4.95, 4.85, 3.05, f'{module} cap', wear=0.05, bevel=0.08)
    kit.rotate(cap, 3.0, 'x', (3.2, 3.25, 2.75))
    made.append(cap)
    made.append(marks(kit, [(2.3, 2.6, 3.06, 2), (3.5, 3.4, 3.07, 0), (4.1, 4.0, 3.06, 1), (2.9, 4.2, 3.05, 0),
                            (2.6, 3.6, 3.06, 0)], (0.0, 0.0, 1.0), f'{module} cap'))
    made.append(marks(kit, [(2.6, 1.64, 2.76, 1), (3.8, 1.64, 2.74, 0)], (0.0, -1.0, 0.0), f'{module} edge'))
    made.append(slab(kit, 2.25, 2.4, 0.0, 4.15, 4.2, 0.5, f'{module} cist', part='stoneAlt'))
    for number in range(4):
        made.append(kit.rock(2.4 + number * 0.5, draw.uniform(2.1, 2.3), 0.0, (0.3, 0.24, 0.28),
                             seed=f'{module} pack {number}', detail=1, roughness=0.25, part='stone'))
    made.append(slab(kit, 2.52, 0.62, 0.0, 3.88, 1.28, 0.42, f'{module} offering', part='stoneAlt'))
    made.append(marks(kit, [(2.95, 0.95, 0.42, 0), (3.45, 0.95, 0.42, 1)], (0.0, 0.0, 1.0), f'{module} offering'))
    for x in (2.75, 3.65):
        made.append(kit.lathe([(0.0, 0.42), (0.03, 0.42), (0.027, 0.54), (0.0, 0.54)], x, 0.85, 0.0, sides=8,
                              part='wax'))
        made.append(kit.cone((x, 0.85, 0.54), (x, 0.85, 0.6), 0.011, 0.0, sides=5, part='glow'))
    made += quartz(kit, (2.6, 1.05, 3.8, 1.24), 8, f'{module} offering', z=0.42)
    for number in range(10):
        turn = math.tau * number / 10
        x, y = 3.2 + 1.55 * math.cos(turn), 3.25 + 1.45 * math.sin(turn)
        if 1.5 < x < 4.9 and 1.7 < y < 4.8:
            made.append(kit.rock(x, y, 0.0, (0.3, 0.26, 0.2), seed=f'{module} kerb {number}', detail=1,
                                 roughness=0.25, part='stone'))
    return kit.join(made, module)


def stone_ring(kit, entry):
    """Nine stones in a ring, each turned to face its middle and cup-marked on that face, round a flat stone where a
    brazier burns."""
    module = entry['module']
    draw = random.Random(module)
    made = _floor(kit, SIDE)
    for number in range(9):
        angle = math.radians(40 * number + 20)
        x, y = 3.2 + 2.5 * math.sin(angle), 3.2 - 2.5 * math.cos(angle)
        height = draw.uniform(1.5, 2.4)
        made.append(upright(kit, 0.58, 0.34, height, f'{module} {number}', at=(x, y, 0.0),
                            turn=40 * number + 20, sections=6, points=10, part='stoneAlt' if number % 3 else 'stone'))
        inward = (-math.sin(angle), math.cos(angle), 0.0)
        face = (x + inward[0] * 0.16, y + inward[1] * 0.16)
        made.append(marks(kit, [(face[0], face[1], height * 0.55, number % 3), (face[0], face[1], height * 0.3, 0)],
                          inward, f'{module} {number}'))
    made.append(slab(kit, 2.72, 2.72, 0.0, 3.68, 3.68, 0.55, f'{module} middle'))
    made.append(marks(kit, [(2.92, 2.95, 0.55, 0), (3.5, 3.45, 0.55, 0)], (0.0, 0.0, 1.0), f'{module} middle'))
    made += _brazier(kit, 3.2, 3.2, 0.55)
    made += quartz(kit, (2.0, 2.0, 4.4, 2.6), 6, f'{module} path')
    return kit.join(made, module)


def sealed_forecourt(kit, entry):
    """A barrow's façade: orthostats of the grey-green stone with dry-stone walling between them, a lintel over its
    way and a great slab standing before the way to seal it, cup-marked; two horns of uprights reaching out to hold
    the forecourt, braziers on stone stands, quartz strewn on its floor."""
    module = entry['module']
    draw = random.Random(module)
    made = _floor(kit, 3.2)
    made.append(drystone(kit, 0.0, SIDE, 0.0, 3.3, 0.0, 0.5, f'{module} wall'))
    for number, x in enumerate((0.45, 1.25, 2.05, 4.35, 5.15, 5.95)):
        made.append(upright(kit, 0.62, 0.3, draw.uniform(2.5, 3.3), f'{module} façade {number}', at=(x, 0.52, 0.0),
                            sections=6, points=10, part='stoneAlt' if number % 2 else 'stone'))
    for x in (2.62, 3.78):
        made.append(upright(kit, 0.36, 0.32, 2.55, f'{module} portal {x}', at=(x, 0.5, 0.0), sections=5, points=8))
    made.append(slab(kit, 2.3, 0.3, 2.55, 4.1, 0.68, 3.0, f'{module} lintel'))
    made.append(marks(kit, [(2.8, 0.68, 2.78, 0), (3.2, 0.68, 2.8, 2), (3.6, 0.68, 2.78, 0)], (0.0, 1.0, 0.0),
                      f'{module} lintel'))
    made.append(slab(kit, 2.45, 0.72, 0.0, 3.95, 1.16, 2.62, f'{module} blocking', wear=0.03))
    made.append(marks(kit, [(3.2, 1.16, 1.6, 3), (2.8, 1.16, 0.9, 0), (3.6, 1.16, 2.1, 1), (3.55, 1.16, 0.8, 0)],
                      (0.0, 1.0, 0.0), f'{module} blocking'))
    for side, x in ((-1, 0.45), (1, 5.95)):
        for number, y in enumerate((1.05, 1.75)):
            made.append(upright(kit, 0.5, 0.3, 2.4 - number * 0.4, f'{module} horn {side} {number}',
                                at=(x, y, 0.0), turn=90 + side * 12, sections=5, points=8))
    for x in (1.65, 4.75):
        made.append(slab(kit, x - 0.24, 1.51, 0.0, x + 0.24, 1.99, 0.86, f'{module} stand {x}', part='stoneAlt'))
        made += _brazier(kit, x, 1.75, 0.86)
    made += quartz(kit, (1.0, 1.3, 5.4, 3.0), 26, f'{module} floor')
    return kit.join(made, module)
