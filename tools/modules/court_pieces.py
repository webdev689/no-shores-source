"""The courts' pieces: the West Court's bandstand and its fountain.

`bandstand`, 8 x 8 x 5: a low octagonal stage of stone 0.45 m high, so it is stepped onto, under a tiled roof on
eight timber posts with a scalloped valance, a lantern hung under its peak; four music stands before the places where
the band stands (sockets `player-1` .. `player-4`), the audience's side at -y (socket `front`).

`fountain`, 7 x 7 x 4: an octagonal basin of stone with a moulded rim, its water standing in it; a baluster column
from its middle carries an upper bowl brimming over, a finial over that, and four spouts from the column throw water
into the basin. Socket `front` at -y.
"""
import math

import fittings
import kit
import shapes

STAGE_M = 0.45


def octagon_parts(module, apothem, low, high):
    """Parts close round an octagon square to the frame, `apothem` from its middle to each side's middle."""
    side = 2 * apothem * math.tan(math.pi / 8)
    module.part((-apothem, -side / 2, low), (apothem, side / 2, high))
    module.part((-side / 2, -apothem, low), (side / 2, apothem, high))
    inner = apothem - (apothem - side / 2) / 2
    module.part((-inner, -inner, low), (inner, inner, high))


def octagon(radius, rings):
    """A lathe profile's turn of eight sides set flat to the frame: `rings` (radius share, height) pairs."""
    return [(radius * share, z) for share, z in rings]


def bandstand(module):
    apothem = 3.6
    corner = apothem / math.cos(math.pi / 8)
    flat = (0.0, 0.0, math.pi / 8)
    rings = ((1.04, 0.0), (1.04, 0.12), (1.0, 0.16), (1.0, STAGE_M - 0.08), (1.03, STAGE_M - 0.06), (1.03, STAGE_M),
             (0.0, STAGE_M))
    shapes.lathe(module, (0.0, 0.0, 0.0), octagon(corner, rings), 'stone', sides=8, turn=flat, smooth=False)
    octagon_parts(module, apothem, 0.0, STAGE_M)
    # The stage's boards, laid north and south inside a border of stone round its edge, and a step at its front.
    inner = apothem - 0.3
    half_side = inner * math.tan(math.pi / 8)
    for board in range(-11, 12):
        x = board * 0.3
        reach = inner - max(0.0, abs(x) + 0.15 - half_side)
        if reach > 0.3:
            kit.block(module, (x, 0.0, STAGE_M), (0.28, reach * 2, 0.03), 'timber', bevel=0.0, wear=0.0, part=False)
    for face in range(8):
        angle = math.tau * face / 8
        middle = (math.cos(angle) * (apothem - 0.15), math.sin(angle) * (apothem - 0.15), STAGE_M)
        shapes.slab(module, (middle[0], middle[1], STAGE_M + 0.02), (0.32, 2 * apothem * math.tan(math.pi / 8) + 0.02,
                    0.04), 'trim', turn=(0.0, 0.0, angle))
    kit.block(module, (0.0, -apothem - 0.25, 0.0), (2.4, 0.5, 0.22), 'trim', bevel=0.03, wear=0.02)
    # Eight posts with brackets under the eaves, the roof, its valance and finial.
    eave = 3.7
    for post in range(8):
        angle = math.tau * post / 8 + math.pi / 8
        spot = (math.cos(angle) * (corner - 0.35), math.sin(angle) * (corner - 0.35))
        shapes.lathe(module, (*spot, STAGE_M), [(0.16, 0.0), (0.16, 0.2), (0.11, 0.25), (0.1, eave - STAGE_M - 0.3),
                     (0.15, eave - STAGE_M - 0.15), (0.15, eave - STAGE_M)], 'timber', sides=8)
        module.part((spot[0] - 0.12, spot[1] - 0.12, STAGE_M), (spot[0] + 0.12, spot[1] + 0.12, eave))
        inward = (-math.cos(angle) * 0.5, -math.sin(angle) * 0.5)
        shapes.rod(module, (spot[0], spot[1], eave - 0.7), (spot[0] + inward[0], spot[1] + inward[1], eave - 0.02),
                   0.05, 'timber', sides=4)
    shapes.lathe(module, (0.0, 0.0, eave), octagon(corner + 0.6, ((1.0, 0.0), (1.0, 0.18), (0.08, 1.45), (0.0, 1.5))),
                 'roof', sides=8, turn=flat, smooth=False)
    for rib in range(8):
        angle = math.tau * rib / 8 + math.pi / 8
        shapes.rod(module, (math.cos(angle) * (corner + 0.6), math.sin(angle) * (corner + 0.6), eave + 0.2),
                   (0.0, 0.0, eave + 1.5), 0.07, 'trim', sides=4)
    shapes.lathe(module, (0.0, 0.0, eave - 0.2), octagon(corner - 0.1, ((1.0, 0.0), (1.0, 0.2))), 'trim', sides=8,
                 turn=flat, smooth=False)
    octagon_parts(module, apothem, eave - 0.2, eave + 0.7)
    shapes.lathe(module, (0.0, 0.0, eave + 1.45), [(0.12, 0.0), (0.18, 0.12), (0.06, 0.3), (0.1, 0.4), (0.0, 0.62)],
                 'gold', sides=8)
    for face in range(8):
        angle = math.tau * face / 8
        middle = (math.cos(angle) * (apothem + 0.5), math.sin(angle) * (apothem + 0.5))
        across = 2 * (apothem + 0.5) * math.tan(math.pi / 8)
        flap = [(-across / 2, 0.0), (across / 2, 0.0)] + [
            (across / 2 - across * share, -0.35 + 0.12 * math.sin(math.pi * ((share * 4) % 1))) for share in
            (0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0)]
        shapes.cutout(module, flap, 0.02, 'crimson' if face % 2 else 'linen', (*middle, eave + 0.02),
                      turn=(0.0, 0.0, angle + math.pi / 2))
    fittings.lantern(module, (0.0, 0.0, 3.1), size=0.32, hung_from=eave + 0.6)
    # The band's places in an arc toward the audience, a music stand before each.
    for number, angle in enumerate((-2.3, -1.9, -1.25, -0.85)):
        spot = (math.cos(angle) * 1.7, math.sin(angle) * 1.4 + 0.6, STAGE_M)
        module.socket(f'player-{number + 1}', spot, (0, -1))
        stand = (spot[0], spot[1] - 0.6, STAGE_M)
        for leg in range(3):
            turn = math.tau * leg / 3
            shapes.rod(module, (stand[0] + math.cos(turn) * 0.2, stand[1] + math.sin(turn) * 0.2, STAGE_M),
                       (stand[0], stand[1], STAGE_M + 0.3), 0.012, 'iron', sides=4)
        shapes.rod(module, (stand[0], stand[1], STAGE_M + 0.3), (stand[0], stand[1], STAGE_M + 1.05), 0.012, 'iron',
                   sides=4)
        shapes.slab(module, (stand[0], stand[1] - 0.03, STAGE_M + 1.1), (0.42, 0.02, 0.3), 'iron',
                    turn=(-0.35, 0.0, 0.0))
        shapes.slab(module, (stand[0], stand[1] - 0.05, STAGE_M + 1.12), (0.36, 0.01, 0.24), 'bone',
                    turn=(-0.35, 0.0, 0.0))
    # A drum and a stool at the back of the stage.
    shapes.lathe(module, (1.4, 1.6, STAGE_M), [(0.28, 0.0), (0.3, 0.05), (0.3, 0.45), (0.28, 0.5), (0.0, 0.5)],
                 'crimson', sides=12)
    for z in (0.04, 0.46):
        shapes.ring(module, (1.4, 1.6, STAGE_M + z), 0.3, 0.03, 'gold', segments=12, sides=3)
    shapes.lathe(module, (-1.5, 1.5, STAGE_M), [(0.18, 0.0), (0.05, 0.05), (0.05, 0.42), (0.2, 0.44), (0.2, 0.5),
                 (0.0, 0.5)], 'timber', sides=8)
    module.socket('front', (0.0, -apothem - 0.5, 0.0), (0, -1))


def fountain(module):
    apothem = 3.3
    corner = apothem / math.cos(math.pi / 8)
    flat = (0.0, 0.0, math.pi / 8)
    shapes.lathe(module, (0.0, 0.0, 0.0), octagon(corner, ((1.06, 0.0), (1.06, 0.15), (1.0, 0.2), (1.0, 0.55),
                 (1.05, 0.6), (1.05, 0.7), (0.9, 0.7), (0.9, 0.2), (0.0, 0.2))), 'stone', sides=8, turn=flat,
                 smooth=False)
    shapes.lathe(module, (0.0, 0.0, 0.46), octagon(corner * 0.91, ((1.0, 0.0), (1.0, 0.04), (0.0, 0.04))),
                 'stormcaller_blue', sides=8, turn=flat, smooth=False)
    octagon_parts(module, apothem, 0.0, 0.7)
    # The column, the upper bowl brimming over, the finial.
    shapes.lathe(module, (0.0, 0.0, 0.2), [(0.55, 0.0), (0.55, 0.2), (0.45, 0.3), (0.32, 0.5), (0.26, 1.0),
                 (0.3, 1.2), (0.42, 1.3), (1.15, 1.55), (1.2, 1.65), (1.1, 1.7), (0.0, 1.7)], 'trim', sides=16)
    module.part((-0.45, -0.45, 0.0), (0.45, 0.45, 1.9))
    shapes.lathe(module, (0.0, 0.0, 1.83), [(1.08, 0.0), (1.08, 0.03), (0.0, 0.03)], 'stormcaller_blue', sides=16,
                 smooth=False)
    shapes.lathe(module, (0.0, 0.0, 1.86), [(0.22, 0.0), (0.18, 0.4), (0.24, 0.6), (0.12, 0.9), (0.2, 1.1),
                 (0.08, 1.4), (0.14, 1.55), (0.0, 1.9)], 'trim', sides=12)
    # Water spilling over the bowl's lip in streams, and four spouts from the column throwing arcs into the basin.
    for stream in range(16):
        angle = math.tau * stream / 16 + math.pi / 16
        top = (math.cos(angle) * 1.2, math.sin(angle) * 1.2, 1.8)
        foot = (math.cos(angle) * 1.38, math.sin(angle) * 1.38, 0.5)
        shapes.rod(module, top, foot, 0.018, 'stormcaller_blue', sides=4, end_radius=0.03)
    for spout in range(4):
        angle = math.tau * spout / 4
        out = (math.cos(angle), math.sin(angle))
        shapes.lathe(module, (out[0] * 0.25, out[1] * 0.25, 1.05), [(0.07, 0.0), (0.05, 0.22), (0.07, 0.26)],
                     'gold', sides=6, turn=(0.0, math.pi / 2, angle), smooth=False)
        points = []
        for step in range(7):
            share = step / 6
            reach = 0.5 + share * 1.6
            points.append((out[0] * reach, out[1] * reach, 1.05 + 0.5 * share - 1.05 * share * share))
        for start, end in zip(points, points[1:]):
            shapes.rod(module, start, end, 0.035, 'stormcaller_blue', sides=4)
        shapes.lathe(module, (points[-1][0], points[-1][1], 0.5), [(0.18, 0.0), (0.05, 0.08), (0.0, 0.09)], 'linen',
                     sides=6, smooth=False)
    module.socket('front', (0.0, -apothem, 0.0), (0, -1))
