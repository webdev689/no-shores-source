"""A tiny pixel canvas for drawing the ship's glyphs: shapes filled by a shading function, an outline traced round
whatever is drawn, and rows of letters out (a the outline, then each tone of the palette)."""

import math

LETTERS = 'abcdefghijklmnop'
N = 24


class Canvas:
    def __init__(self, n=N):
        self.n = n
        self.px = [[None] * n for _ in range(n)]

    def put(self, x, y, tone):
        if 0 <= x < self.n and 0 <= y < self.n and tone is not None:
            self.px[y][x] = tone

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < self.n and 0 <= y < self.n else None

    def fill(self, inside, shade):
        """Every pixel whose centre is inside, toned by shade(x, y)."""
        for y in range(self.n):
            for x in range(self.n):
                if inside(x + 0.5, y + 0.5):
                    self.put(x, y, shade(x, y))

    def rect(self, x0, y0, x1, y1, shade):
        self.fill(lambda x, y: x0 <= x < x1 + 1 and y0 <= y < y1 + 1, shade)

    def ellipse(self, cx, cy, rx, ry, shade):
        self.fill(lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0, shade)

    def poly(self, points, shade):
        def inside(x, y):
            hit = False
            j = len(points) - 1
            for i in range(len(points)):
                (xi, yi), (xj, yj) = points[i], points[j]
                if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                    hit = not hit
                j = i
            return hit

        self.fill(inside, shade)

    def line(self, x0, y0, x1, y1, tone):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.put(x0, y0, tone)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def outline(self, tone=0):
        """The outline: every empty pixel beside a drawn one, side by side (not corner to corner)."""
        edge = []
        for y in range(self.n):
            for x in range(self.n):
                if self.px[y][x] is None and any(
                    self.get(x + dx, y + dy) not in (None,) and self.get(x + dx, y + dy) != tone
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                ):
                    edge.append((x, y))
        for x, y in edge:
            self.px[y][x] = tone

    def rows(self):
        return [''.join('.' if p is None else LETTERS[p] for p in row) for row in self.px]


def ramp(t, tones):
    """A tone along a ramp, t from 0 (lit) to 1 (shade)."""
    t = min(max(t, 0.0), 0.999)
    return tones[int(t * len(tones))]


def dither(x, y, t, tones):
    """A ramp with a checker between neighbouring tones, for a softer turn."""
    t = min(max(t, 0.0), 0.999) * len(tones)
    low = int(t)
    frac = t - low
    if frac > 0.5 and (x + y) % 2 == 0 and low + 1 < len(tones):
        return tones[low + 1]
    return tones[low]


def lit(x, y, cx, cy, r):
    """How shaded a point of a round body is, lit from the top left: 0 lit, 1 shade."""
    dx, dy = (x + 0.5 - cx) / r, (y + 0.5 - cy) / r
    return min(1.0, max(0.0, 0.5 + 0.45 * (dx + dy) / math.sqrt(2) + 0.25 * (dx * dx + dy * dy)))
