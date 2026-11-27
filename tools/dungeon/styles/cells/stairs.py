"""The cells' stairs and galleries: a hewn timber lintel bound in riveted iron over a flight's head and foot, on posts
of dressed stone banded in iron and backed by an iron plate; a stone kerb down a flight's walls under an iron
handrail on forged brackets; and a gallery's railing of square iron bars between riveted rails, on a stone kerb.

The stair head stands on the landing, y 0..0.3, the flight behind it at y < 0, and leaves the way up clear below
2.9 within 1.25 of its middle; the kerb and the railing span their whole edge, x ±1.6, and repeat every 1.6, so the
next ones meet them in one run.
"""
from styles.cells import forge

LINTEL = 2.9
TOP = 3.2
OUT = (0.0, 1.0, 0.0)
BACK = (0.0, -1.0, 0.0)
# The posts' stones stand this far out, iron bands lying on them.
STONE_Y = 0.27
BAND_Y = 0.285


def stair_head(kit):
    """Dressed stone posts, an iron plate behind and riveted iron bands across, under a hewn lintel bound in two
    riveted straps."""
    half = forge.courses(kit, 1.25, 1.6, 0.012, STONE_Y, (0.52, 0.62, 0.56, 0.6, 0.6), wear=0.012,
                         seed='cells.stair.head', parts=('stoneAlt', 'stone'), step=0.04, toward='+y')
    half.append(forge.plate(kit, 1.25, 0.0, 0.0, 1.6, 0.012, LINTEL, BACK))
    for z in (0.42, 1.5, 2.6):
        half.append(forge.plate(kit, 1.25, STONE_Y, z, 1.6, BAND_Y, z + 0.08, OUT,
                                [(1.32, BAND_Y, z + 0.04), (1.5, BAND_Y, z + 0.04)], 0.012))
    side = kit.join(half, 'stair.head.side')
    made = [side, kit.mirror(side, 'x')]
    made.append(forge.timber(kit, (-1.6, 0.0, LINTEL), (1.6, STONE_Y, TOP), 'x', chamfer=0.04, rough=0.012,
                             seed='cells.stair.head.lintel'))
    for x in (-0.7, 0.7):
        made.append(forge.plate(kit, x - 0.05, STONE_Y, LINTEL + 0.01, x + 0.05, BAND_Y, TOP - 0.01, OUT,
                                [(x, BAND_Y, LINTEL + 0.07), (x, BAND_Y, TOP - 0.07)], 0.014))
    made.append(forge.plate(kit, -0.3, STONE_Y, LINTEL + 0.06, 0.3, BAND_Y, TOP - 0.06, OUT,
                            [(x, BAND_Y, (LINTEL + TOP) / 2) for x in (-0.22, 0.0, 0.22)], 0.014))
    return forge.cull(kit.join(made, 'stair.head'), forge.on('z', 0.0, -1.0), forge.on('x', 1.6, 1.0),
                      forge.on('x', -1.6, -1.0))


RAIL = (0.11, 0.36)


def stair_side(kit):
    """A stone kerb of two blocks and an iron handrail over it on two forged brackets, each nailed to the wall by a
    riveted plate."""
    made = [forge.slab(kit, (-1.6, 0.0, -0.3), (-0.006, 0.08, 0.12), '+y', 0.015, 0.01, 'cells.stair.side.a'),
            forge.slab(kit, (0.006, 0.0, -0.3), (1.6, 0.08, 0.12), '+y', 0.015, 0.01, 'cells.stair.side.b',
                       'stoneAlt'),
            forge.bar(kit, (-1.6, RAIL[0], RAIL[1]), (1.6, RAIL[0], RAIL[1]), 0.016, caps=False)]
    for x in (-0.8, 0.8):
        made.append(forge.plate(kit, x - 0.03, 0.0, 0.2, x + 0.03, 0.01, 0.34, OUT, [(x, 0.01, 0.31)], 0.011))
        made.append(forge.rod(kit, [(x, 0.01, 0.27), (x, RAIL[0], 0.27), (x, RAIL[0], RAIL[1])], 0.009,
                              caps=False))
    return forge.cull(kit.join(made, 'stair.side'), forge.on('y', 0.0, -1.0))


def balustrade(kit):
    """Square iron bars every 0.2 between a riveted top rail, a middle rail and a foot rail, leaded into a stone kerb
    of two blocks."""
    made = [forge.slab(kit, (-1.6, 0.0, 0.0), (-0.006, 0.25, 0.2), '+z', 0.015, 0.01, 'cells.balustrade.a'),
            forge.slab(kit, (0.006, 0.0, 0.0), (1.6, 0.25, 0.2), '+z', 0.015, 0.01, 'cells.balustrade.b',
                       'stoneAlt')]
    bars = [-1.5 + 0.2 * number for number in range(16)]
    for z0, z1 in ((0.2, 0.235), (0.54, 0.58), (0.94, 1.0)):
        made.append(kit.box(-1.6, 0.095, z0, 1.6, 0.155, z1, part='iron', smooth=None))
    for y, toward in ((0.155, OUT), (0.095, BACK)):
        made.append(forge.rivets(kit, [(x, y, 0.97) for x in bars[1::2]], toward, 0.012, 0.009))
    for x in bars:
        made.append(forge.bar(kit, (x, 0.125, 0.2), (x, 0.125, 0.94), 0.014, caps=False))
    return forge.cull(kit.join(made, 'balustrade'), forge.on('z', 0.0, -1.0))
