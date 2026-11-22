"""What the crypt's landmarks lie on and scatter over it: grounds of a height at every point, seeded heaps, and
bones and skulls lying where the ground puts them. A landmark's frame has its origin at the footprint's north-west
corner, metres.
"""
import math

from shapes import facing, flat
from styles.crypt import forms

SIDE = 6.4
MIDDLE = SIDE / 2


def steps(low, high, count, edges=()):
    """`count` even steps from low to high, with each of `edges` among them: a ground's grid lines, a solid's edge on
    one so no face of it leans across the edge."""
    return sorted({round(low + (high - low) * step / count, 5) for step in range(count + 1)} | set(edges))


def ground(kit, xs, ys, height, part_of=lambda x, y: 'stone'):
    """A ground over the grid of `xs` by `ys`, its height `height(x, y)`, facing up, UVs by x and north; each quad in
    the part `part_of(x, y)` gives at its middle. Gives its objects, one a part."""
    found = {}
    for left, right in zip(xs, xs[1:]):
        for top, bottom in zip(ys, ys[1:]):
            ring = [(x, y, height(x, y)) for x, y in ((left, top), (right, top), (right, bottom), (left, bottom))]
            part = part_of((left + right) / 2, (top + bottom) / 2)
            found.setdefault(part, []).append(facing(flat(ring), (0.0, 0.0, 1.0)))
    return [forms.made(kit, faces, part, smooth=45.0, closed=False) for part, faces in found.items()]


def bumps(draw, count, area, high, wide):
    """Seeded lumps for a heap: [(x, y, height, width)], in `area` (x0, y0, x1, y1)."""
    return [(draw.uniform(area[0], area[2]), draw.uniform(area[1], area[3]), draw.uniform(*high), draw.uniform(*wide))
            for _ in range(count)]


def lumps(found, x, y):
    """The lumps' height at (x, y)."""
    return sum(lift * math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (width * width)) for bx, by, lift, width in found)


def scatter(draw, count, area, avoid=()):
    """Up to `count` places in `area`, each (x, y, turn, scale), clear of the rectangles in `avoid`."""
    found = []
    for _ in range(count * 20):
        if len(found) == count:
            break
        x, y = draw.uniform(area[0], area[2]), draw.uniform(area[1], area[3])
        if not any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in avoid):
            found.append((x, y, draw.uniform(0, 360), draw.uniform(0.85, 1.2)))
    return found


def lying_bones(kit, draw, count, area, height, avoid=(), radius=0.013):
    """Long bones lying where `height(x, y)` puts the ground, at seeded turns."""
    made = []
    for x, y, turn, scale in scatter(draw, count, area, avoid):
        reach_x = math.cos(math.radians(turn)) * 0.2 * scale
        reach_y = math.sin(math.radians(turn)) * 0.2 * scale
        start = (x - reach_x, y - reach_y, height(x - reach_x, y - reach_y) + radius)
        end = (x + reach_x, y + reach_y, height(x + reach_x, y + reach_y) + radius)
        made.append(forms.made(kit, forms.long_bone(start, end, radius * scale, 5), 'bone'))
    return made


def skull_on(kit, draw, x, y, height, size=1.0, detail=1, part='bone'):
    """A skull lying on the ground at (x, y), tipped as skulls in a heap lie, sunk a little into it."""
    return forms.made(kit, forms.placed(forms.skull(detail), (x, y, height - 0.025 * size), turn=draw.uniform(0, 360),
                                        tilt=draw.uniform(-30, 30), roll=draw.uniform(-25, 25), size=size), part)
