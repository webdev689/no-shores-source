"""A hull in the Sloop's style from its numbers: faceted sections lofted from her stern to her stem, a deep keel fin
under a flared goblet of a body, a rounded stern, a raked cutwater, thick bulwarks with lined gunports, a capped rail,
her main deck and her raised quarterdeck.

Her frame is the Sloop's: x toward her bow, y to port, z up, metres, her middle at x 0.
"""
import math

from ship_mesh import Piece

# The section's facets from the keel up: how far out each stands, as a share of her half-beam past the keel's own half
# width, and how high, as a share of the way from the fin's top to her deck. Rows from the deck up are the bulwark's.
BODY_ROWS = ((0.0, 0.0), (0.45, 0.25), (0.8, 0.55), (0.97, 0.82), (1.0, 1.0))
KEEL_HALF_M = 0.14
BULWARK_THICK_M = 0.18
# A gunport's sill and lintel over the deck, and its half width: round the Sloop's gun's muzzle, which stands 0.33 m
# over the deck its wheels are on, and is 0.4 m across at its swell.
PORT_SILL_M = 0.06
PORT_LINTEL_M = 0.66
PORT_HALF_M = 0.36
# How the bulwark leans in toward the rail (her tumblehome), as shares of her half-beam at the sill, lintel and rail.
BULWARK_LEAN = (0.99, 0.97, 0.95)


class Hull:
    """A hull's shape from its numbers: her half-beam, keel and deck along her length, and her sections."""

    def __init__(self, numbers):
        self.numbers = numbers
        self.aft = -numbers['length_m'] / 2
        self.fore = numbers['length_m'] / 2

    def half_beam(self, x):
        """Her half-beam at her deck, `x` along her: full between her widest points, rounded aft, fining to her stem
        (the lower `bow_fine`, the sharper her entry)."""
        half = self.numbers['beam_m'] / 2
        aft_widest, fore_widest = self.numbers['widest_m']
        if x < aft_widest:
            share = min(1.0, (aft_widest - x) / (aft_widest - self.aft))
            return half * max(0.0, 1 - share ** self.numbers['stern_round']) ** 0.5
        if x > fore_widest:
            share = min(1.0, (x - fore_widest) / (self.fore - fore_widest))
            return half * max(0.0, 1 - share ** self.numbers['bow_fine']) ** 0.9
        return half

    def deck(self, x):
        """Her main deck's height, rising toward both ends by her sheer, more to her bow than her stern."""
        aft_sheer, fore_sheer = self.numbers['sheer_m']
        return self.numbers['deck_m'] + (fore_sheer if x > 0 else aft_sheer) * (2 * x / self.numbers['length_m']) ** 2

    def plan_out(self, x):
        """The way out from her port side in plan at `x`, square to her outline there: aft round her stern."""
        rise = (self.half_beam(x + 0.05) - self.half_beam(x - 0.05)) / 0.1
        length = (1 + rise * rise) ** 0.5
        return (-rise / length, 1 / length)

    def keel(self, x):
        """The bottom of her keel: level amidships, rising in a curve to her cutwater forward and her sternpost aft."""
        low = self.numbers['keel_m']
        fore_start, aft_start = self.fore - self.numbers['cutwater_m'], self.aft + self.numbers['sternpost_m']
        if x > fore_start:
            share = (x - fore_start) / (self.fore - fore_start)
            return low + (self.deck(self.fore) - 1.0 - low) * share**1.6
        if x < aft_start:
            share = (aft_start - x) / (aft_start - self.aft)
            return low + self.numbers['stern_rise_m'] * share**1.4
        return low

    def section(self, x):
        """Her port side's outline at `x`, (y, z) from the keel's bottom up to her rail."""
        beam, keel, deck = self.half_beam(x), self.keel(x), self.deck(x)
        fin_top = min(keel + self.numbers['fin_m'], deck - 0.4)
        out = lambda share: KEEL_HALF_M + share * max(0.0, beam - KEEL_HALF_M)  # noqa: E731
        rows = [(KEEL_HALF_M, keel)]
        rows += [(out(share), fin_top + height * (deck - fin_top)) for share, height in BODY_ROWS]
        heights = (PORT_SILL_M, PORT_LINTEL_M, self.numbers['bulwark_m'])
        rows += [(out(lean), deck + height) for lean, height in zip(BULWARK_LEAN, heights, strict=True)]
        return rows

    def stations(self):
        """Where her sections stand along her: every `station_m`, closer at her ends, and at each gunport's edges with
        none inside a port."""
        step = self.numbers['station_m']
        count = round((self.fore - self.aft) / step)
        places = [self.aft + (self.fore - self.aft) * (0.5 - 0.5 * math.cos(math.pi * index / count)) for index in
                  range(count + 1)]
        edges = [edge for port in self.numbers['ports'] for edge in (port - PORT_HALF_M, port + PORT_HALF_M)]
        inside = lambda x: any(abs(x - port) < PORT_HALF_M + 0.15 for port in self.numbers['ports'])  # noqa: E731
        front = self.numbers['quarterdeck_m'][0]
        kept = [place for place in places if not inside(place) and abs(place - front) > step / 3]
        return sorted(kept + edges + [front])

    def in_port(self, x0, x1):
        return any(abs(x0 - (port - PORT_HALF_M)) < 1e-9 and abs(x1 - (port + PORT_HALF_M)) < 1e-9
                   for port in self.numbers['ports'])

    def surface(self, x, z):
        """The point on her port side at `x` and height `z`, and the way out from her there in her section."""
        rows = self.section(x)
        for (y0, z0), (y1, z1) in zip(rows, rows[1:]):
            if z0 <= z <= z1 and z1 > z0:
                share = (z - z0) / (z1 - z0)
                length = math.hypot(y1 - y0, z1 - z0)
                return (x, y0 + share * (y1 - y0), z), (0.0, (z1 - z0) / length, -(y1 - y0) / length)
        y, top = rows[-1]
        return (x, y, top), (0.0, 1.0, 0.0)


def build_hull(hull, collection):
    """Her shell, bulwarks, rail cap, main deck and quarterdeck, as one object."""
    piece = Piece()
    stations = hull.stations()
    sections = [hull.section(x) for x in stations]
    sill, lintel = len(BODY_ROWS) + 1, len(BODY_ROWS) + 2
    first_bulwark = len(BODY_ROWS)
    for index in range(len(stations) - 1):
        x0, x1 = stations[index], stations[index + 1]
        a, b = sections[index], sections[index + 1]
        port = hull.in_port(x0, x1)
        inner_a, inner_b = inner(a, first_bulwark), inner(b, first_bulwark)
        for side in (1, -1):
            for row in range(len(a) - 1):
                if not (port and row == sill):
                    rise, out = a[row + 1][1] - a[row][1], a[row + 1][0] - a[row][0]
                    piece.quad(strip(x0, x1, a, b, row, side), 'hull', (0, side * rise, -out))
            for row in range(len(inner_a) - 1):
                if not (port and row + first_bulwark == sill):
                    piece.quad(strip(x0, x1, inner_a, inner_b, row, side), 'hull', (0, -side, 0))
            if port:
                line_port(piece, (x0, a, inner_a), (x1, b, inner_b), side, (sill, lintel, first_bulwark))
            cap(piece, (x0, a[-1], inner_a[-1]), (x1, b[-1], inner_b[-1]), side)
        piece.quad([(x0, -a[0][0], a[0][1]), (x1, -b[0][0], b[0][1]), (x1, b[0][0], b[0][1]),
                    (x0, a[0][0], a[0][1])], 'hull', (0, 0, -1))
        floor(piece, hull, (x0, inner_a[0]), (x1, inner_b[0]))
    for x, rows in ((stations[0], sections[0]), (stations[-1], sections[-1])):
        for row in range(len(rows) - 1):
            corners = [(x, rows[row][0], rows[row][1]), (x, rows[row + 1][0], rows[row + 1][1]),
                       (x, -rows[row + 1][0], rows[row + 1][1]), (x, -rows[row][0], rows[row][1])]
            piece.quad(corners, 'hull', (1 if x > 0 else -1, 0, 0))
    quarterdeck_front(piece, hull)
    ends(piece, hull)
    return piece.build('Hull', collection)


def ends(piece, hull):
    """Solid timber where her bulwarks meet at her stem and her stern, each thicker than she is wide there, so no
    gap between their inner faces opens to the sky. It stays inside her narrowest planks, so none of it shows."""
    rise = hull.numbers['quarterdeck_m'][1]
    half = KEEL_HALF_M - 0.01
    for x0, x1, floor_rise in ((hull.fore - 0.8, hull.fore, 0.0), (hull.aft, hull.aft + 0.45, rise)):
        middle = (x0 + x1) / 2
        top = hull.section(middle)[-1][1] + 0.08
        piece.box((x0, -half, hull.deck(middle) + floor_rise), (x1, half, top), 'hull')


def strip(x0, x1, a, b, row, side):
    """The facet between two rows of two sections, on one side."""
    return [(x0, side * a[row][0], a[row][1]), (x1, side * b[row][0], b[row][1]),
            (x1, side * b[row + 1][0], b[row + 1][1]), (x0, side * a[row + 1][0], a[row + 1][1])]


def inner(rows, first):
    """The bulwark's inner face: its rows from the deck up, set in by its thickness."""
    return [(max(0.02, y - BULWARK_THICK_M), z) for y, z in rows[first:]]


def line_port(piece, start, end, side, rows):
    """A gunport's sill, lintel and sides on one side, from her outer planks to her inner."""
    (x0, a, inner_a), (x1, b, inner_b) = start, end
    sill, lintel, first = rows
    for row, up in ((sill, 1), (lintel, -1)):
        corners = [(x0, side * a[row][0], a[row][1]), (x1, side * b[row][0], b[row][1]),
                   (x1, side * inner_b[row - first][0], inner_b[row - first][1]),
                   (x0, side * inner_a[row - first][0], inner_a[row - first][1])]
        piece.quad(corners, 'hull', (0, 0, up))
    for x, outer_rows, inner_rows, toward in ((x0, a, inner_a, 1), (x1, b, inner_b, -1)):
        corners = [(x, side * outer_rows[sill][0], outer_rows[sill][1]),
                   (x, side * inner_rows[sill - first][0], inner_rows[sill - first][1]),
                   (x, side * inner_rows[lintel - first][0], inner_rows[lintel - first][1]),
                   (x, side * outer_rows[lintel][0], outer_rows[lintel][1])]
        piece.quad(corners, 'hull', (toward, 0, 0))


def cap(piece, start, end, side):
    """Her rail's cap on one side: a board laid on the bulwark, proud of it either side."""
    (x0, outer_a, inner_a), (x1, outer_b, inner_b) = start, end
    rim = [(x0, outer_a[0] + 0.05, outer_a[1]), (x1, outer_b[0] + 0.05, outer_b[1]),
           (x1, max(0.0, inner_b[0] - 0.04), inner_b[1]), (x0, max(0.0, inner_a[0] - 0.04), inner_a[1])]
    top = [(x, y, z + 0.08) for x, y, z in rim]
    for corners, facing in ((top, (0, 0, 1)), ([rim[0], rim[1], top[1], top[0]], (0, side, 0)),
                            ([rim[3], top[3], top[2], rim[2]], (0, -side, 0))):
        piece.quad([(x, side * y, z) for x, y, z in corners], 'hull', facing)


def floor(piece, hull, start, end):
    """Her main deck between two stations forward of her quarterdeck, and her quarterdeck's planks aft of its front."""
    (x0, (y0, z0)), (x1, (y1, z1)) = start, end
    front, rise = hull.numbers['quarterdeck_m']
    lift = rise if x1 <= front + 1e-9 else 0.0
    piece.quad([(x0, -y0, z0 + lift), (x1, -y1, z1 + lift), (x1, y1, z1 + lift), (x0, y0, z0 + lift)], 'deck',
               (0, 0, 1))


def quarterdeck_front(piece, hull):
    """The step up from her main deck to her quarterdeck, across her from bulwark to bulwark."""
    front, rise = hull.numbers['quarterdeck_m']
    deck = hull.deck(front)
    half = inner(hull.section(front), len(BODY_ROWS))[0][0]
    piece.quad([(front, -half, deck), (front, half, deck), (front, half, deck + rise), (front, -half, deck + rise)],
               'hull', (1, 0, 0))
