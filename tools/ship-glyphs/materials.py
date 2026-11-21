"""The ship's four materials at 24 x 24: Timber, Canvas, Iron, Heartwood."""

from pix import Canvas, dither, lit, ramp

OUTLINE = '#120e0a'


def timber():
    # a outline; face b..e light to dark; end grain f..h; rope i..j
    palette = [OUTLINE, '#d6a066', '#b07a44', '#86592f', '#5c3a1c', '#f0d39c', '#cfa76c', '#8f6a3c',
               '#e2cb94', '#8f774a']
    face = [1, 2, 3, 4]
    c = Canvas()
    # Three sawn planks stacked two and one, a seam of shade between them, each with its end grain to the left.
    for (x0, y0, x1) in ((1, 14, 22), (1, 19, 22), (4, 8, 20)):
        c.rect(x0 + 3, y0, x1, y0 + 3, lambda x, y, y0=y0: ramp((y - y0) / 4.2, face))
        # Grain running along the face, and a knot.
        c.line(x0 + 5, y0 + 1, x0 + 10, y0 + 1, 3)
        c.line(x0 + 12, y0 + 2, x1 - 1, y0 + 2, 3)
        c.put(x0 + 14, y0 + 1, 4)
        # The sawn end, light, its rings drawn round the pith.
        c.rect(x0, y0, x0 + 2, y0 + 3, lambda x, y: 5)
        c.put(x0 + 1, y0 + 1, 6)
        c.put(x0 + 1, y0 + 2, 7)
        c.put(x0 + 2, y0 + 3, 6)
        c.put(x0, y0 + 3, 6)
    # A rope lashed round the stack.
    for y in range(8, 23):
        if c.get(15, y) is not None:
            c.put(15, y, 8)
            c.put(16, y, 9)
    c.outline()
    return c.rows(), palette


def canvas():
    # a outline; cloth b..e light to dark; roll lines f; twine g..h
    palette = [OUTLINE, '#fbf6e6', '#e6dcc0', '#c4b693', '#998a68', '#6e604a', '#b0523a', '#7a3020']
    cloth = [1, 2, 3, 4]
    c = Canvas()
    # A bolt of sailcloth lying on its side, lit along its top, its far end rounding off to the right.
    c.rect(7, 5, 20, 15, lambda x, y: ramp(abs(y - 7.5) / 9.0 + (y > 7.5) * 0.3, cloth))
    c.ellipse(20.5, 10, 2.0, 5.5, lambda x, y: ramp(0.45 + (y - 10) / 12, cloth))
    # A loose end of the cloth unrolled and lying folded below it.
    c.poly([(10, 15), (22, 15), (22, 18), (17, 20), (9, 20)], lambda x, y: ramp(0.25 + (y - 15) / 7, cloth))
    c.line(12, 17, 20, 17, 3)
    # The rolled end facing us: the cloth wound round and round to its core.
    c.ellipse(7, 10, 4.6, 5.6, lambda x, y: 1)
    for r in (3.4, 1.7):
        for y in range(24):
            for x in range(24):
                d = ((x + 0.5 - 7) ** 2 + ((y + 0.5 - 10) / 1.2) ** 2) ** 0.5
                if abs(d - r) < 0.55:
                    c.put(x, y, 5 if x + y > 17 else 3)
    c.put(7, 10, 5)
    # Two ties of red twine round the bolt.
    for tx in (12, 17):
        for y in range(4, 17):
            if c.get(tx, y) is not None:
                c.put(tx, y, 6 if y < 9 else 7)
    c.outline()
    return c.rows(), palette


def iron():
    # a outline; top b..c; front d..e; side f..g; stamp h
    palette = [OUTLINE, '#e3e8ec', '#b9c2ca', '#8a949e', '#6a737c', '#4b525a', '#353a40', '#2a2f35']
    c = Canvas()
    # Three ingots stacked two and one, each a bar seen from above and in front: lit top, mid front, dark end.
    def ingot(x0, y0):
        c.poly([(x0 + 1, y0), (x0 + 10, y0), (x0 + 11, y0 + 2), (x0, y0 + 2)], lambda x, y: 1 if y == y0 else 2)
        c.rect(x0, y0 + 3, x0 + 10, y0 + 6, lambda x, y: dither(x, y, (y - y0 - 3) / 5, [3, 4, 5]))
        c.poly([(x0 + 11, y0 + 2), (x0 + 12, y0 + 3), (x0 + 12, y0 + 6), (x0 + 11, y0 + 7)], lambda x, y: 6)
        # A cast mark on the front, a little anchor's crown.
        c.put(x0 + 5, y0 + 4, 7)
        c.put(x0 + 4, y0 + 5, 7)
        c.put(x0 + 6, y0 + 5, 7)
    ingot(0, 14)
    ingot(11, 14)
    ingot(6, 6)
    c.outline()
    return c.rows(), palette


def heartwood():
    # a outline; bark b..c; sapwood d..e; rings f; heart g..i; side j..k
    palette = [OUTLINE, '#6a4628', '#3f2716', '#e3c08a', '#c9a066', '#9a7444', '#e0584a', '#b8322a',
               '#7a1d16', '#8a5a30', '#5c3a1c']
    c = Canvas()
    # An old keel's end sawn across, the log running back behind it to the right.
    c.ellipse(15, 11, 8.0, 9.0, lambda x, y: ramp(lit(x, y, 15, 11, 9) + 0.15, [9, 10]))
    c.ellipse(10.5, 12, 9.5, 10.5, lambda x, y: 1 if x + y < 20 else 2)
    c.ellipse(10.5, 12, 8.3, 9.3, lambda x, y: 3 if x + y < 22 else 4)
    # Its growth rings, and a check splitting out from the middle.
    for r, tone in ((6.4, 5), (4.4, 4)):
        for y in range(24):
            for x in range(24):
                d = ((x + 0.5 - 10.5) ** 2 + ((y + 0.5 - 12) / 1.1) ** 2) ** 0.5
                if abs(d - r) < 0.5:
                    c.put(x, y, tone)
    # The red heart at its middle, glowing lighter at its core.
    c.ellipse(10.5, 12, 2.7, 3.0, lambda x, y: ramp(lit(x, y, 10.5, 12, 2.8), [6, 7, 8]))
    c.put(10, 11, 6)
    c.line(12, 13, 16, 18, 5)
    c.outline()
    return c.rows(), palette


GLYPHS = {'timber': timber, 'canvas': canvas, 'iron': iron, 'heartwood': heartwood}

