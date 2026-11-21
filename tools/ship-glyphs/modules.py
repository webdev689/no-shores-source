"""The four modules at 24 x 24: Guns, Hull, Sails, Rigging."""

from pix import Canvas, dither, lit, ramp

OUTLINE = '#120e0a'


def guns():
    # a outline; iron b..f light to dark; wood g..j light to dark; brass k
    palette = [OUTLINE, '#c9d1d8', '#8a95a0', '#5f6973', '#3f464e', '#262b31',
               '#c8935a', '#9a6a3a', '#6e4626', '#45291a', '#d9b45a']
    iron = [1, 2, 3, 4, 5]
    wood = [6, 7, 8, 9]
    c = Canvas()
    # The carriage: a stepped wooden bracket under the barrel, its bed running back.
    c.poly([(3, 12), (17, 12), (17, 15), (14, 15), (14, 17), (4, 17), (3, 15)],
           lambda x, y: dither(x, y, (y - 12) / 6 + (x - 3) / 40, wood))
    c.line(4, 14, 13, 14, 8)  # the plank's seam
    # The trucks: two wooden wheels with iron tyres and hubs.
    for wx, wy in ((6, 19), (15, 19)):
        c.ellipse(wx, wy, 3.2, 3.2, lambda x, y, wx=wx, wy=wy: ramp(lit(x, y, wx, wy, 3.2), [2, 3, 4, 5]))
        c.ellipse(wx, wy, 2.1, 2.1, lambda x, y, wx=wx, wy=wy: ramp(lit(x, y, wx, wy, 2.1), wood))
        c.put(int(wx), int(wy), 4)
        c.put(int(wx) - 1, int(wy) - 1, 2)
    # The barrel: thick at the breech, thinner to the muzzle, which swells; lit along its top.
    def barrel(x, y):
        half = 3.0 - 1.1 * (x - 3) / 17
        if x >= 19:
            half = 2.6
        return abs(y + 0.5 - 9) <= half and 3 <= x <= 21
    c.fill(lambda x, y: barrel(int(x), y), lambda x, y: ramp((y - 5.5) / 6.0, iron))
    # Its reinforcing rings and the muzzle's lip, darker and raised.
    for rx in (7, 13, 18):
        column = [y for y in range(5, 13) if c.get(rx, y) is not None]
        for y in column:
            c.put(rx, y, 2 if y == column[0] else (5 if y == column[-1] else 3))
        c.put(rx, column[0] - 1, 3)
        c.put(rx, column[-1] + 1, 5)
    for y in range(6, 13):
        if c.get(21, y) is not None:
            c.put(21, y, 4)
    c.put(22, 9, 5)  # the bore
    c.put(22, 8, 5)
    # The cascabel: the knob behind the breech.
    c.rect(1, 8, 2, 9, lambda x, y: 3 if y == 8 else 4)
    # The touch-hole and its brass, and a glint along the top.
    c.put(5, 6, 10)
    c.line(9, 7, 11, 7, 1)
    c.line(14, 7, 17, 7, 1)
    # A short stack of shot beside it.
    for bx, by in ((19.3, 21.3), (22.3, 21.3), (20.8, 18.6)):
        c.ellipse(bx, by, 1.6, 1.6, lambda x, y, bx=bx, by=by: ramp(lit(x, y, bx, by, 1.6), iron[1:]))
    c.outline()
    return c.rows(), palette


def hull():
    # a outline; planking b..e light to dark; wale f; copper g..i; port red j; window light k; dark l
    palette = [OUTLINE, '#d39a5c', '#a8723f', '#7e522b', '#57361c', '#2c1d12',
               '#7fc0a2', '#4f9378', '#2f6352', '#b8322a', '#ffd88a', '#1c130c']
    plank = [1, 2, 3, 4]
    copper = [6, 7, 8]
    c = Canvas()
    # The hull from the side, its stern raised on the left and its bow sweeping up to the right.
    top = lambda x: 5 if x < 6 else (8 if x < 17 else 8 - (x - 17) * 0.8)
    bottom = lambda x: 19 - max(0.0, (x - 15) * 0.9) - max(0.0, (4 - x) * 0.7)

    def inside(x, y):
        return 1 <= x <= 23 and top(x) <= y <= bottom(x)

    def shade(x, y):
        t, b = top(x + 0.5), bottom(x + 0.5)
        depth = (y + 0.5 - t) / max(1.0, b - t)
        if y >= 15:  # below the waterline: copper sheathing
            return dither(x, y, (y - 15) / 4.5 + 0.1, copper)
        base = int(depth * 2.2)
        return plank[min(3, base + (1 if int(y) % 3 == 2 else 0))]  # a seam every third row

    c.fill(inside, shade)
    # The wale: a heavy dark band along the hull, and the gunports cut through the planking above it.
    for x in range(1, 24):
        for y in (11, 12):
            if c.get(x, y) is not None and y < 15:
                c.put(x, y, 5 if y == 12 else 4)
    for gx in (8, 12, 16):
        c.rect(gx, 9, gx + 1, 10, lambda x, y: 11)
        c.put(gx, 8, 9)  # the red lid raised over each port
        c.put(gx + 1, 8, 9)
    # The stern: lit windows in the raised quarter, and the rudder behind it.
    c.rect(2, 6, 4, 7, lambda x, y: 10 if x != 3 else 4)
    c.line(2, 8, 4, 8, 4)
    c.rect(0, 13, 0, 18, lambda x, y: 4)
    c.line(20, 6, 23, 3, 3)  # the bowsprit
    c.line(21, 6, 23, 4, 4)
    for x in range(1, 24):  # the keel along the bottom
        column = [y for y in range(24) if c.get(x, y) is not None]
        if column:
            c.put(x, column[-1], 8)
    # The waterline: a pale line where the copper starts.
    for x in range(1, 24):
        if c.get(x, 15) is not None:
            c.put(x, 15, 6)
    # The rail along the top, lit.
    for x in range(1, 24):
        for y in range(24):
            if c.get(x, y) is not None:
                c.put(x, y, 1)
                break
    c.outline()
    return c.rows(), palette


def sails():
    # a outline; canvas b..e light to dark; spar f..h wood; line i; pennant j k
    palette = [OUTLINE, '#fbf6e6', '#e6dcc0', '#c4b693', '#998a68', '#b07a44', '#7a4e2a', '#4a2c16',
               '#5a4a36', '#d8443a', '#8a2620']
    cloth = [1, 2, 3, 4]
    c = Canvas()
    # The mast up the middle, and the pennant flying from its head.
    c.rect(11, 0, 12, 23, lambda x, y: 6 if x == 11 else 7)
    c.poly([(13, 1), (19, 2), (13, 3)], lambda x, y: 9 if y < 2 else 10)
    # The yard across the top, tapered at its arms.
    c.poly([(1, 4), (22, 4), (22, 5), (1, 5)], lambda x, y: 5 if y == 4 else 6)
    # The square sail, full of wind: it bellies out, lit on the left and shaded to the right and under.
    def belly(y):
        return (y - 5.5) / 13.0

    def inside(x, y):
        b = belly(y)
        left = 2 + 1.6 * b * b * 3 - 0.4
        right = 21 - 0.6 * b
        return 5.5 <= y <= 19 + 1.5 * (1 - abs((x - 11.5) / 10)) and left <= x <= right

    def shade(x, y):
        across = (x - 2) / 19.0
        b = belly(y)
        t = 0.15 + 0.55 * across + 0.35 * b - 0.3 * (1 - abs(across - 0.45) * 2) * (1 - b)
        return dither(x, y, t, cloth)

    c.fill(inside, shade)
    # Its seams, sewn panel to panel, and a row of reef points under the yard.
    for sx in (6, 10, 14, 18):
        for y in range(7, 21):
            if c.get(sx, y) is not None and c.get(sx, y) not in (6, 7):
                c.put(sx, y, min(4, (c.get(sx, y) or 1) + 1))
    for rx in range(3, 21, 2):
        if c.get(rx, 8) is not None:
            c.put(rx, 8, 8)
    # The sheets run from the clews down and away.
    c.line(3, 20, 1, 23, 8)
    c.line(20, 20, 22, 23, 8)
    c.outline()
    return c.rows(), palette


def rigging():
    # a outline; rope b..e light to dark; wood f..h; iron i..j; the hole k
    palette = [OUTLINE, '#ecd9a8', '#c9ad74', '#957b4c', '#634f2e', '#c8935a', '#8a5a30', '#4f311a',
               '#9aa5ae', '#565f68', '#1c130c']
    c = Canvas()
    # Three shrouds rise from their deadeyes and close on the masthead, the ratlines rigged across them to climb by.
    feet = (4, 12, 20)
    head = (12, 1)
    for fx in feet:
        c.line(fx, 17, head[0] + (fx - 12) // 4, head[1], 2 if fx < 12 else (3 if fx > 12 else 2))
    for ry in range(4, 17, 3):
        span = [x for x in range(24) if c.get(x, ry) is not None]
        if len(span) > 1:
            c.line(span[0], ry, span[-1], ry, 1 if ry < 10 else 2)
    # The deadeyes: round wooden blocks, each with its three holes, lashed to the shroud above.
    for fx in feet:
        c.ellipse(fx + 0.5, 19.5, 2.4, 2.1, lambda x, y, fx=fx: ramp(lit(x, y, fx + 0.5, 19.5, 2.4), [5, 6, 7]))
        for hx, hy in ((fx - 1, 19), (fx + 1, 19), (fx, 20)):
            c.put(hx, hy, 10)
        # The chainplate down from each to the ship's side.
        c.line(fx, 22, fx, 23, 9)
        c.put(fx + 1, 22, 8)
    c.outline()
    return c.rows(), palette


GLYPHS = {'guns': guns, 'hull': hull, 'sails': sails, 'rigging': rigging}

