"""The mines' stairs and galleries: a timber set over a flight's head and foot, its posts strapped to its cap in iron
and a tally board nailed on the cap; a plank stringer nailed down a flight's walls under a pole handrail on blocks;
and a gallery's fence of posts, two rails, a brace and a toe board.

The stair head stands on the landing, y 0..0.3, the flight behind it at y < 0, and leaves the way up clear below
2.9 within 1.25 of its middle; the stringer and the fence span their whole edge, x ±1.6, and repeat every 1.6, so
the next ones meet them in one run.
"""
from .forms import board, nail, rod, timber
from .kit_pieces import OPEN, iron_l, make

LINTEL = 2.9
TOP = 3.2
FRONT = (0.0, 1.0, 0.0)
BACK = (0.0, -1.0, 0.0)


def stair_head(kit):
    """Two squared posts under a cap laid across, their ends in the rock, an iron L strapped over each joint on the
    landing's side, and a tally board nailed to the middle of the cap."""
    found = [make(kit, timber((-1.6, 0.15, (LINTEL + TOP) / 2), (1.6, 0.15, (LINTEL + TOP) / 2), 0.26, TOP - LINTEL,
                              chamfer=0.03, facets=0.012, check='bottom', stations=4, caps=OPEN,
                              seed='mines.stair.head.cap'))]
    for side in (-1, 1):
        found.append(make(kit, timber((side * 1.43, 0.15, 0.0), (side * 1.43, 0.15, LINTEL), 0.28, 0.24, up=FRONT,
                                      chamfer=0.03, facets=0.012, check='top', caps=OPEN,
                                      seed=f'mines.stair.head.post{side}')))
        found += iron_l(kit, side * 1.33, 0.274, 1, 2.5, LINTEL, side * 0.98)
    found.append(make(kit, board((-0.32, 0.2875, 3.05), (0.32, 0.2875, 3.05), 0.18, 0.015, up=FRONT,
                                 ragged=(0.02, 0.0), seed='mines.stair.head.tally')))
    found += [make(kit, nail((x, 0.295, 3.05), FRONT, 0.02, 0.004), 'iron') for x in (-0.26, 0.26)]
    return kit.join(found, 'stair.head')


def stair_side(kit):
    """A plank on edge along the wall, nailed, under a pole handrail on two blocks."""
    found = [make(kit, board((-1.6, 0.03, -0.08), (1.6, 0.03, -0.08), 0.38, 0.05, up=FRONT,
                             seed='mines.stair.side.plank')),
             make(kit, rod((-1.6, 0.06, 0.36), (1.6, 0.06, 0.36), 0.035, 6))]
    for x in (-0.8, 0.8):
        found.append(make(kit, timber((x, 0.0, 0.285), (x, 0.09, 0.285), 0.07, 0.08, caps=(False, True),
                                      seed=f'mines.stair.side.block{x}')))
        found += [make(kit, nail((x, 0.055, z), FRONT, 0.022, 0.008), 'iron') for z in (-0.18, 0.02)]
    return kit.join(found, 'stair.side')


def balustrade(kit):
    """Two squared posts every 1.6 carrying a top rail and a middle rail run through, a brace between them and a toe
    board nailed along the foot over the drop."""
    found = [make(kit, timber((-1.6, 0.125, 0.88), (1.6, 0.125, 0.88), 0.11, 0.08, chamfer=0.012, stations=3,
                              seed='mines.balustrade.rail')),
             make(kit, timber((-1.6, 0.125, 0.48), (1.6, 0.125, 0.48), 0.09, 0.07, chamfer=0.01,
                              seed='mines.balustrade.middle')),
             make(kit, timber((-0.74, 0.125, 0.52), (0.74, 0.125, 0.84), 0.07, 0.06, up=FRONT, chamfer=0.0,
                              caps=OPEN, seed='mines.balustrade.brace')),
             make(kit, board((-1.6, 0.05, 0.08), (1.6, 0.05, 0.08), 0.15, 0.03, up=FRONT,
                             seed='mines.balustrade.toe'))]
    for x in (-0.8, 0.8):
        found.append(make(kit, timber((x, 0.125, 0.0), (x, 0.125, 0.97), 0.12, 0.12, up=FRONT, chamfer=0.015,
                                      ragged=(0.0, 0.02), caps=(False, True), seed=f'mines.balustrade.post{x}')))
        found += [make(kit, nail((x, 0.035, z), BACK, 0.022, 0.008), 'iron') for z in (0.08,)]
        found += [make(kit, nail((x, 0.185, z), FRONT, 0.022, 0.008), 'iron') for z in (0.48, 0.88)]
    return kit.join(found, 'balustrade')
