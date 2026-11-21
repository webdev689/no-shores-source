"""The five posts' emblems at 24 x 24: First Mate, Gunner, Bosun, Carpenter, Lookout."""

import math

from pix import Canvas, dither, lit, ramp

OUTLINE = '#120e0a'


def first_mate():
    # A tricorne: black felt b..d, its brim bound in gold braid e..f, a cockade g..h.
    palette = [OUTLINE, '#4a4f5a', '#2e323a', '#1f2228', '#f3cf86', '#c08a3e', '#e8e2d2', '#b8322a']
    c = Canvas()
    # The crown, rounded, lit on its left.
    c.ellipse(12, 11, 6.0, 5.5, lambda x, y: ramp(lit(x, y, 12, 11, 6), [1, 2, 3]))
    # The brim cocked up in three: two horns out to the sides and the front point down.
    c.poly([(1, 10), (6, 13), (12, 15), (18, 13), (23, 10), (21, 16), (12, 20), (3, 16)],
           lambda x, y: ramp((y - 10) / 10 + abs(x - 12) / 40, [1, 2, 3]))
    # Gold braid along the brim's edge.
    for x in range(24):
        column = [y for y in range(24) if c.get(x, y) is not None]
        if column and column[-1] >= 13:
            c.put(x, column[-1], 5)
            if column[-1] - 1 >= 0 and c.get(x, column[-1] - 1) is not None:
                c.put(x, column[-1] - 1, 4)
    # The cockade on its left side: a white rosette round a red heart.
    c.ellipse(7, 12, 1.7, 1.7, lambda x, y: 6)
    c.put(7, 12, 7)
    c.outline()
    return c.rows(), palette


def gunner():
    # A powder horn: horn b..d, its dark tip e, brass caps f..g, its strap h..i.
    palette = [OUTLINE, '#f3e6c4', '#d9c08a', '#a8854e', '#4a2c16', '#f3cf86', '#b07a2c', '#7a4e2a', '#4f311a']
    c = Canvas()
    # The horn curves from its wide brass-capped butt on the left down to its spout on the right.
    def centre(t):
        return 4 + 15 * t, 8 + 8 * math.sin(t * math.pi * 0.85)

    for step in range(200):
        t = step / 199
        cx, cy = centre(t)
        r = 4.2 * (1 - t) + 1.0 * t
        tone = lambda x, y, cx=cx, cy=cy, r=r, t=t: (4 if t > 0.86 else ramp(lit(x, y, cx, cy, max(r, 1.5)) * 0.95, [1, 2, 3]))
        c.ellipse(cx, cy, r, r, tone)
    # The butt's brass cap and the spout's.
    c.ellipse(4, 8, 1.6, 4.2, lambda x, y: ramp((y - 4) / 9, [5, 6]))
    c.rect(19, 15, 20, 16, lambda x, y: 5 if y == 15 else 6)
    # Bands of brass round the horn.
    for t in (0.35, 0.62):
        cx, cy = centre(t)
        for y in range(24):
            if c.get(int(cx), y) is not None and abs(y + 0.5 - cy) < 4:
                c.put(int(cx), y, 6 if y > cy else 5)
    # The strap that hangs it from the shoulder.
    c.line(5, 3, 12, 1, 7)
    c.line(12, 1, 19, 13, 8)
    c.outline()
    return c.rows(), palette


def bosun():
    # A bosun's call: silver b..e on its chain f..g.
    palette = [OUTLINE, '#f4f7f9', '#c9d1d8', '#8a959f', '#566069', '#d9c08a', '#957b4c']
    silver = [1, 2, 3, 4]
    c = Canvas()
    # The chain looped up over it, link by link.
    for step in range(40):
        a = math.pi * (0.08 + 0.84 * step / 39)
        x, y = 12 + 9 * math.cos(a), 12 - 9.5 * math.sin(a)
        c.put(int(round(x)), int(round(y)), 5 if step % 3 else 6)
    # The gun: a slim pipe rising from its mouthpiece on the left.
    c.poly([(2, 13), (15, 14), (15, 16), (2, 15)], lambda x, y: ramp((y - 13) / 3.5, silver))
    c.put(2, 14, 4)
    # The keel: a flat blade under the pipe.
    c.poly([(6, 16), (16, 17), (14, 20), (8, 19)], lambda x, y: ramp(0.35 + (y - 16) / 6, silver))
    # The buoy: the round chamber at the end, its hole on top.
    c.ellipse(18, 15.5, 3.3, 3.3, lambda x, y: ramp(lit(x, y, 18, 15.5, 3.3), silver))
    c.put(18, 13, 4)
    c.put(19, 13, 4)
    c.put(17, 14, 1)
    c.outline()
    return c.rows(), palette


def carpenter():
    # A mallet and a chisel crossed: wood b..e, steel f..h.
    palette = [OUTLINE, '#e0b07a', '#b07a44', '#7a4e2a', '#4a2c16', '#e3e8ec', '#a8b2bb', '#5f6973']
    wood = [1, 2, 3, 4]
    c = Canvas()
    # The chisel: its wooden handle at the top right, its steel blade broadening to its edge at the bottom left.
    c.poly([(17, 2), (21, 6), (16, 11), (12, 7)], lambda x, y: ramp((x + y - 14) / 14, wood))
    c.poly([(12, 8), (15, 11), (6, 20), (3, 21), (3, 18)], lambda x, y: ramp((x + y - 18) / 12 + 0.1, [5, 6, 7]))
    c.line(4, 20, 13, 11, 5)
    # The mallet: its handle from the bottom right, its heavy round-cornered head at the top left.
    c.line(21, 21, 10, 10, 3)
    c.line(21, 20, 11, 10, 2)
    c.poly([(1, 7), (7, 1), (13, 7), (7, 13)], lambda x, y: ramp((x + y - 6) / 14 + 0.05, wood))
    c.line(2, 7, 7, 2, 1)
    c.line(8, 12, 12, 8, 4)
    c.outline()
    return c.rows(), palette


def lookout():
    # A spyglass: brass b..e, leather f..g, the lens h..i.
    palette = [OUTLINE, '#f6dfa0', '#d9a84e', '#a8742a', '#6e4a1a', '#7a4e2a', '#4a2c16', '#bfe6ff', '#4a7aa0']
    brass = [1, 2, 3, 4]
    c = Canvas()
    # Its draws laid along a diagonal, widest at the objective (top right), slimmest at the eyepiece.
    def tube(t0, t1, r, tones):
        for step in range(60):
            t = t0 + (t1 - t0) * step / 59
            cx, cy = 3 + 17 * t, 20 - 16 * t
            c.ellipse(cx, cy, r, r, lambda x, y, cx=cx, cy=cy: ramp(lit(x, y, cx, cy, r + 0.6), tones))
    tube(0.0, 0.22, 1.5, brass)
    tube(0.22, 0.45, 2.0, brass)
    tube(0.45, 1.0, 2.7, [5, 5, 6, 6])  # the leather-bound barrel
    tube(0.9, 1.0, 3.1, brass)  # the objective's brass cap
    # Brass rings at the joints of the draws.
    for t in (0.22, 0.45):
        cx, cy = 3 + 17 * t, 20 - 16 * t
        c.ellipse(cx, cy, 2.3 + t * 2, 2.3 + t * 2, lambda x, y, cx=cx, cy=cy: ramp(lit(x, y, cx, cy, 3), [1, 2, 3]))
    # The lens glinting at the objective.
    c.ellipse(20.6, 3.6, 1.4, 1.4, lambda x, y: 7 if x + y < 25 else 8)
    c.outline()
    return c.rows(), palette


GLYPHS = {'first_mate': first_mate, 'gunner': gunner, 'bosun': bosun, 'carpenter': carpenter, 'lookout': lookout}

