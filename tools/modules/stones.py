"""The Old Stones: a shrine's dais of two broken tiers of cut stone, a flight up each side of the lower and two up the
upper, a ring of standing stones round the top, some fallen and one leaning, an altar at its middle and rubble where
the edge courses have come away. Built square to its frame, so every tier and stair is a part.
"""
import math

import kit

# The tiers' half-widths and how high each stands over the one under it, metres.
TIERS = ((14.0, 1.4), (9.0, 1.4))
# Each flight's rise and run a step, metres: 6 steps of about 0.23 m up a tier.
STEPS = 6
RUN_M = 0.45
STAIR_WIDE_M = 5.0
# The ring of standing stones: how many, how far out from the middle, and their tallest, metres.
STONES = 11
RING_M = 7.0


def course(module, half, base, high, keep=0.86):
    """The edge course of a tier: cut blocks laid round its rim, a few gone and lying fallen beside it."""
    for side in range(4):
        along = -half
        while along < half:
            length = module.draw(1.2, 2.1)
            length = min(length, half - along)
            middle = along + length / 2
            along += length
            depth = 1.0
            # x along the side, out along y, turned for each side.
            spot = {0: (middle, -half + depth / 2), 1: (half - depth / 2, middle), 2: (-middle, half - depth / 2),
                    3: (-half + depth / 2, -middle)}[side]
            size = (length - 0.06, depth, high) if side % 2 == 0 else (depth, length - 0.06, high)
            if module.draw() < keep:
                worn = (size[0], size[1], size[2] + module.draw(-0.08, 0.03))
                kit.block(module, (spot[0], spot[1], base), worn, 'stone', bevel=0.07, wear=0.08, part=False,
                          turn=module.draw(-0.015, 0.015))
            else:
                out = {0: (0, -1), 1: (1, 0), 2: (0, 1), 3: (-1, 0)}[side]
                fallen = (spot[0] + out[0] * 1.6, spot[1] + out[1] * 1.6, base - high)
                kit.block(module, fallen, (size[0] * 0.8, size[1] * 0.9, high * 0.6), 'stone',
                          turn=module.draw(-0.5, 0.5), wear=0.08, part=False)
                kit.rock(module, (spot[0], spot[1], base + high * 0.4), (0.9, 0.8, 0.5), module.draw(0, 99), part=False, detail=2)


def slabs(module, half, top, inner):
    """The paving of a tier's top inside its course: rows of slabs of their own lengths, so the joints break as laid
    masonry does, over a bed of rubble that shows where a slab is cracked away."""
    edge = half - 1.0
    kit.block(module, (0.0, 0.0, top - 1.2), (edge * 2, edge * 2, 0.95), 'rubble', bevel=0.0, wear=0.0, part=False)
    y = -edge
    while y < edge - 0.3:
        deep = min(module.draw(1.3, 2.2), edge - y)
        x = -edge
        while x < edge - 0.3:
            long = min(module.draw(1.2, 2.8), edge - x)
            middle = (x + long / 2, y + deep / 2)
            x += long
            if max(abs(middle[0]), abs(middle[1])) < inner - 0.5:
                continue
            if module.draw() < 0.06:
                kit.rock(module, (*middle, top - 0.35), (long * 0.5, deep * 0.5, 0.3), module.draw(0, 99),
                         part=False, detail=2)
                continue
            lift = module.draw(-0.05, 0.02)
            kit.block(module, (*middle, top - 0.22 + lift), (long - 0.07, deep - 0.07, 0.22), 'paving', bevel=0.02,
                      wear=0.0, part=False, turn=module.draw(-0.012, 0.012))
        y += deep


def build(module):
    base = 0.0
    for number, (half, high) in enumerate(TIERS):
        top = base + high
        module.part((-half, -half, base), (half, half, top))
        course(module, half, base, high)
        inner = TIERS[number + 1][0] if number + 1 < len(TIERS) else 0.0
        slabs(module, half, top, inner)
        # A flight up each side of the lower tier, up the east and west of the upper.
        sides = range(4) if number == 0 else (1, 3)
        rise = high / STEPS
        for side in sides:
            way = {0: (0, 1), 1: (-1, 0), 2: (0, -1), 3: (1, 0)}[side]
            foot = (-way[0] * (half + STEPS * RUN_M), -way[1] * (half + STEPS * RUN_M), base)
            kit.stair(module, foot, way, STAIR_WIDE_M, rise, RUN_M, STEPS)
        base = top
    # The ring, on the upper tier round the top: standing, fallen across the paving, or leaning on its neighbour.
    for stone in range(STONES):
        angle = math.tau * (stone + module.draw(-0.15, 0.15)) / STONES
        at = (math.cos(angle) * RING_M, math.sin(angle) * RING_M, base)
        tall = module.draw(2.6, 4.6)
        roll = module.draw()
        # Each a megalith, rough as it was raised: rock in the stone's own colour, not a cut block.
        if roll < 0.2:
            item = kit.rock(module, at, (tall, 1.2, 0.9), module.draw(0, 99), 'stone', part=False)
            item.rotation_euler[2] = angle + math.pi / 2 + module.draw(-0.4, 0.4)
        elif roll < 0.3:
            item = kit.rock(module, at, (1.3, 0.85, tall), module.draw(0, 99), 'stone', part=False)
            item.rotation_euler = (module.draw(0.18, 0.3), 0.0, angle)
        else:
            item = kit.rock(module, at, (1.3, 0.8, tall), module.draw(0, 99), 'stone', part=False)
            item.rotation_euler[2] = angle
            inner = 0.4
            module.part((at[0] - inner, at[1] - inner, base), (at[0] + inner, at[1] + inner, base + tall * 0.9))
    # The altar, and its sockets: the middle of each lower flight's foot, where a way arrives.
    kit.block(module, (0.0, 0.0, base), (2.4, 1.3, 1.0), 'stone', bevel=0.08, wear=0.03, cuts=1)
    kit.block(module, (0.0, 0.0, base + 1.0), (2.8, 1.7, 0.18), 'trim', bevel=0.04, wear=0.0, part=False)
    half = TIERS[0][0] + STEPS * RUN_M
    for name, at, facing in (('north', (0, half, 0), (0, 1)), ('east', (half, 0, 0), (1, 0)),
                             ('south', (0, -half, 0), (0, -1)), ('west', (-half, 0, 0), (-1, 0))):
        module.socket(name, at, facing)
