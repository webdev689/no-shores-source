"""The factions' chapels in the Hall of the Arts, each 16 x 10 x 12: an apse against a hall's wall (back at +y), its
counter before it on a low forecourt. One shared body: a mass of masonry carved with a semi-elliptic niche under a
half-dome, pilasters, archivolt and cornice, a dais up two steps, the faction's cloth on rug, banners and back hanging.
Stormcallers (storm blue): a coiled iron rod round a glowing core behind a stone altar with a gilt storm bolt.
Lamplighters (white and gold): a great lamp on a plinth, three tiers of hung lamps, the elder's lectern.
Veiled (black and violet): veils on iron frames round a veiled statue, low candles at its feet. Front faces -y.
"""
import math

import bpy

import fittings
import kit
import shapes

HALF_X = 7.6
BACK_Y = 5.0
FACE_Y = -1.3
NICHE = (6.6, 5.6)
SPRING_M = 8.0
DOME_M = 3.2
TOP_M = 12.0
DAIS_M = 0.6
FORE_M = 0.15
DAIS_FRONT_Y = -0.4
COUNTER_Y = -3.6


def in_niche(x, y):
    """Whether a point stands well clear of the apse's wall, inside its niche, at any height under the springing."""
    return (x / NICHE[0]) ** 2 + ((y - FACE_Y) / NICHE[1]) ** 2 < 0.9


def _niche_cutters(module):
    """The niche's shape to carve: an upright elliptic shaft to the springing and a half-ellipsoid dome over it."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=1.0, depth=SPRING_M + 1.0,
                                        location=(0.0, FACE_Y, (SPRING_M - 1.0) / 2))
    shaft = bpy.context.active_object
    shaft.scale = (NICHE[0], NICHE[1], 1.0)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=16, radius=1.0, location=(0.0, FACE_Y, SPRING_M))
    dome = bpy.context.active_object
    dome.scale = (NICHE[0], NICHE[1], DOME_M)
    bpy.context.view_layer.update()
    return shaft, dome


def _arch_outline(inner, outer, rise_inner, rise_outer, segments=16):
    """An elliptic archivolt's outline, `inner` to `outer` half-width, springing at z 0."""
    rim = [(math.cos(math.pi * step / segments) * outer, math.sin(math.pi * step / segments) * rise_outer)
           for step in range(segments + 1)]
    hollow = [(math.cos(math.pi * step / segments) * inner, math.sin(math.pi * step / segments) * rise_inner)
              for step in range(segments, -1, -1)]
    return rim + hollow


def _niche_parts(module):
    """The niche's wall as parts: a slice between each pair of points round its ellipse, from the curve back to the
    mass's back; the masses either side of the opening; the mass over the springing."""
    steps = 24
    points = [(math.cos(math.pi * step / steps) * NICHE[0], FACE_Y + math.sin(math.pi * step / steps) * NICHE[1])
              for step in range(steps + 1)]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        module.part((min(x0, x1), min(y0, y1), 0.0), (max(x0, x1), BACK_Y, SPRING_M))
    for side in (-1, 1):
        module.part((NICHE[0] if side > 0 else -HALF_X, FACE_Y, 0.0), (HALF_X if side > 0 else -NICHE[0], BACK_Y,
                                                                       SPRING_M))
    module.part((-HALF_X, FACE_Y, SPRING_M), (HALF_X, BACK_Y, TOP_M))


def apse(module, wall='stone', cloth='stormcaller_blue', trim='trim', hanging=None):
    """The shared body: the carved mass, its front's pilasters, archivolt and cornice, the forecourt, the dais and its
    steps, the rug, the banners, the counter and the sockets."""
    mass = kit.block(module, (0.0, (FACE_Y + BACK_Y) / 2, 0.0), (HALF_X * 2, BACK_Y - FACE_Y, TOP_M), wall,
                     bevel=0.04, wear=0.01, cuts=2, part=False)
    for cutter in _niche_cutters(module):
        kit.cut(mass, cutter)
    _niche_parts(module)
    # The front: pilasters with their bases and capitals, banners on them, the archivolt and the cornice.
    for side in (-1, 1):
        x = side * (NICHE[0] + 0.5)
        kit.block(module, (x, FACE_Y - 0.15, 0.0), (0.85, 0.3, SPRING_M), wall, bevel=0.03, wear=0.01, part=False)
        for z, high in ((0.0, 0.5), (SPRING_M - 0.35, 0.35)):
            kit.block(module, (x, FACE_Y - 0.18, z), (1.05, 0.42, high), trim, bevel=0.03, wear=0.0, part=False)
        shapes.banner(module, (x, FACE_Y - 0.32, SPRING_M - 0.8), 0.7, 4.4, cloth)
    shapes.cutout(module, _arch_outline(NICHE[0], NICHE[0] + 0.55, DOME_M, DOME_M + 0.5), 0.2, trim,
                  (0.0, FACE_Y - 0.1, SPRING_M))
    shapes.slab(module, (0.0, FACE_Y - 0.2, SPRING_M + DOME_M + 0.2), (0.7, 0.3, 0.9), trim)
    shapes.slab(module, (0.0, FACE_Y - 0.15, TOP_M - 0.2), (HALF_X * 2 + 0.2, 0.4, 0.4), trim)
    shapes.slab(module, (0.0, FACE_Y - 0.1, TOP_M - 0.6), (HALF_X * 2, 0.25, 0.25), trim)
    # The forecourt, the dais up two steps, and the rug of the faction's cloth on it.
    fittings.floor(module, -HALF_X, COUNTER_Y + 0.7, HALF_X, DAIS_FRONT_Y, FORE_M)
    fittings.floor(module, -NICHE[0], DAIS_FRONT_Y, NICHE[0], BACK_Y - 0.7, DAIS_M)
    for step in range(2):
        rise = FORE_M + (DAIS_M - FORE_M) * (step + 1) / 3
        kit.block(module, (0.0, DAIS_FRONT_Y - 0.35 * (2 - step) + 0.175, 0.0), (5.0 - step * 0.6, 0.35, rise), trim,
                  bevel=0.02, wear=0.0)
    shapes.banner(module, (0.0, FACE_Y + NICHE[1] - 0.06, SPRING_M - 0.6), 2.4, 5.6, hanging or cloth, tails=False)
    shapes.slab(module, (0.0, 1.4, DAIS_M + 0.006), (3.6, 4.6, 0.012), cloth)
    for side in (-1, 1):
        shapes.slab(module, (side * 1.72, 1.4, DAIS_M + 0.014), (0.12, 4.6, 0.012), 'gold')
    # The counter on the ground before the forecourt, the keeper on the forecourt behind it.
    fittings.counter(module, -2.2, 2.2, COUNTER_Y, high=1.05, top=trim, front=wall)
    shapes.slab(module, (0.0, COUNTER_Y - 0.03, 0.6), (3.0, 0.02, 0.5), cloth)
    module.socket('counter', (0.0, COUNTER_Y - 0.45, 0.0), (0, -1))
    module.socket('keeper', (0.0, COUNTER_Y + 1.15, FORE_M), (0, -1))
    module.socket('front', (0.0, -BACK_Y, 0.0), (0, -1))


def standard(module, x, y, cloth):
    """A faction's standard: an iron pole on a stone foot with a crossbar, its banner, a gilt finial."""
    kit.block(module, (x, y, DAIS_M), (0.5, 0.5, 0.25), 'stone', bevel=0.03, wear=0.0, part=False)
    shapes.rod(module, (x, y, DAIS_M), (x, y, DAIS_M + 4.6), 0.04, 'iron', sides=6)
    shapes.banner(module, (x, y - 0.06, DAIS_M + 4.2), 1.0, 2.6, cloth)
    shapes.lathe(module, (x, y, DAIS_M + 4.6), [(0.06, 0.0), (0.1, 0.1), (0.0, 0.35)], 'gold', sides=6)
    module.part((x - 0.25, y - 0.25, DAIS_M), (x + 0.25, y + 0.25, DAIS_M + 4.6))


def chapel_stormcallers(module):
    apse(module, cloth='stormcaller_blue')
    # The altar, its gilt lightning, and the coiled rod round its glowing core behind it.
    altar = (0.0, 1.0, DAIS_M)
    kit.block(module, altar, (2.6, 1.2, 1.0), 'stone', bevel=0.05, wear=0.02)
    kit.block(module, (altar[0], altar[1], DAIS_M + 1.0), (2.9, 1.45, 0.14), 'trim', bevel=0.03, wear=0.0, part=False)
    kit.block(module, altar, (2.9, 1.45, 0.2), 'trim', bevel=0.03, wear=0.0, part=False)
    shapes.cutout(module, [(-0.1, 0.42), (0.12, 0.42), (0.0, 0.08), (0.14, 0.1), (-0.12, -0.42), (-0.02, -0.06),
                           (-0.16, -0.08)], 0.03, 'gold', (0.0, altar[1] - 0.61, DAIS_M + 0.5))
    for side in (-1, 1):
        fittings.candle(module, (side * 1.1, altar[1], DAIS_M + 1.14), high=0.35, radius=0.05)
    shapes.slab(module, (0.0, altar[1], DAIS_M + 1.15), (1.4, 0.6, 0.02), 'stormcaller_blue')
    rod = (0.0, 3.0, DAIS_M)
    shapes.lathe(module, rod, [(0.6, 0.0), (0.55, 0.25), (0.3, 0.35), (0.25, 0.7), (0.35, 0.8), (0.0, 0.8)], 'stone',
                 sides=12)
    module.part((-0.6, 2.4, DAIS_M), (0.6, 3.6, DAIS_M + 6.6))
    shapes.lathe(module, (rod[0], rod[1], DAIS_M + 0.8), [(0.14, 0.0), (0.11, 2.6), (0.14, 5.2), (0.0, 5.3)], 'glow',
                 sides=10)
    turns, per_turn, high = 6, 14, 5.2
    previous = None
    for step in range(turns * per_turn + 1):
        angle = math.tau * step / per_turn
        lift = high * step / (turns * per_turn)
        reach = 0.38 + 0.12 * math.sin(math.pi * step / (turns * per_turn))
        point = (rod[0] + math.cos(angle) * reach, rod[1] + math.sin(angle) * reach, DAIS_M + 0.8 + lift)
        if previous is not None:
            shapes.rod(module, previous, point, 0.045, 'iron', sides=5)
        previous = point
    crown = DAIS_M + 6.1
    shapes.ball(module, (rod[0], rod[1], crown + 0.1), 0.3, 'glow', detail=2)
    for prong in range(6):
        angle = math.tau * prong / 6
        shapes.rod(module, (rod[0] + math.cos(angle) * 0.38, rod[1] + math.sin(angle) * 0.38, crown - 0.15),
                   (rod[0] + math.cos(angle) * 0.25, rod[1] + math.sin(angle) * 0.25, crown + 0.6), 0.03, 'iron',
                   sides=4, end_radius=0.005)
    shapes.ring(module, (rod[0], rod[1], crown - 0.15), 0.4, 0.06, 'iron', segments=16)
    for side in (-1, 1):
        standard(module, side * 3.4, 2.0, 'stormcaller_blue')


def great_lamp(module, at):
    """The great lamp: a stepped plinth, a fluted stem and a gilt bowl with its flame."""
    x, y, z = at
    kit.block(module, (x, y, z), (1.6, 1.6, 0.3), 'trim', bevel=0.03, wear=0.0)
    kit.block(module, (x, y, z + 0.3), (1.2, 1.2, 0.9), 'plaster', bevel=0.03, wear=0.0)
    kit.block(module, (x, y, z + 1.2), (1.4, 1.4, 0.15), 'gold', bevel=0.02, wear=0.0, part=False)
    shapes.lathe(module, (x, y, z + 1.35), [(0.25, 0.0), (0.16, 0.2), (0.14, 0.7), (0.22, 0.85), (0.75, 1.15),
                 (0.82, 1.3), (0.7, 1.3), (0.0, 1.05)], 'gold', sides=16)
    shapes.ball(module, (x, y, z + 2.75), 0.5, 'glow', detail=2, scale=(1.0, 1.0, 1.6))


def lamp_tiers(module, middle):
    """Three gilt rings of lamps hung one under another from the dome's crown, each on its chains."""
    x, y = middle
    top = SPRING_M + DOME_M - 0.4
    above = None
    for radius, z, lamps in ((2.2, 6.6, 8), (1.6, 5.6, 6), (1.0, 4.6, 4)):
        shapes.ring(module, (x, y, z), radius, 0.07, 'gold', segments=24)
        # The top ring hangs from the crown, each ring under it from the ring above.
        for chain in range(4):
            angle = math.tau * chain / 4 + 0.4
            low = (x + math.cos(angle) * radius, y + math.sin(angle) * radius, z)
            high = (x, y, top) if above is None else (x + math.cos(angle) * above[0], y + math.sin(angle) * above[0],
                                                      above[1])
            shapes.rod(module, low, high, 0.012, 'iron', sides=3)
        for lamp in range(lamps):
            angle = math.tau * (lamp + 0.5) / lamps
            at = (x + math.cos(angle) * radius, y + math.sin(angle) * radius)
            assert in_niche(at[0] + math.cos(angle) * 0.13, at[1] + math.sin(angle) * 0.13), f'a lamp in the wall at {at}'
            fittings.lantern(module, (*at, z - 0.75), size=0.26, hung_from=z)
        above = (radius, z)
    shapes.lathe(module, (x, y, top - 0.3), [(0.0, 0.0), (0.25, 0.15), (0.12, 0.3), (0.0, 0.4)], 'gold', sides=10)


def lectern(module, at):
    """The elder's lectern: a turned timber stem on a foot, a sloping desk, an open book on it."""
    x, y, z = at
    shapes.lathe(module, (x, y, z), [(0.3, 0.0), (0.3, 0.06), (0.08, 0.12), (0.06, 0.6), (0.09, 0.9), (0.06, 1.0),
                 (0.0, 1.0)], 'timber', sides=10)
    shapes.slab(module, (x, y, z + 1.08), (0.62, 0.46, 0.05), 'timber', turn=(-0.35, 0.0, 0.0), bevel=0.01)
    for side in (-1, 1):
        shapes.slab(module, (x + side * 0.15, y - 0.01, z + 1.13), (0.28, 0.36, 0.02), 'bone',
                    turn=(-0.35, side * 0.08, 0.0))
    shapes.slab(module, (x, y + 0.02, z + 1.11), (0.6, 0.38, 0.015), 'lamplighter_gold', turn=(-0.35, 0.0, 0.0))
    module.part((x - 0.31, y - 0.3, z), (x + 0.31, y + 0.3, z + 1.2))


def chapel_lamplighters(module):
    apse(module, wall='plaster', cloth='lamplighter_gold', trim='trim')
    great_lamp(module, (0.0, 2.6, DAIS_M))
    lamp_tiers(module, (0.0, 1.6))
    lectern(module, (2.6, 0.4, DAIS_M))
    for side in (-1, 1):
        shapes.drape(module, (side * 4.2, 1.2, SPRING_M - 0.4), (side * 2.8, 2.9, SPRING_M - 0.4), SPRING_M - 1.2,
                     'linen', folds=3, depth=0.08)
        fittings.candle(module, (side * 1.2, 2.0, DAIS_M), high=0.9, radius=0.07)
        shapes.lathe(module, (side * 1.2, 2.0, DAIS_M), [(0.2, 0.0), (0.2, 0.04), (0.0, 0.04)], 'gold', sides=12)


def veil_frame(module, x, y, width, turn, cloth):
    """An iron frame hung with a veil: two posts on feet, a rail with finials, the veil falling to just above the
    dais."""
    with shapes.frame(module, (x, y, 0.0), quarter=0):
        cos, sin = math.cos(turn), math.sin(turn)
        ends = [(-cos * width / 2, -sin * width / 2), (cos * width / 2, sin * width / 2)]
        assert all(in_niche(x + end_x, y + end_y) for end_x, end_y in ends), f'a veil frame in the wall at {(x, y)}'
        for end_x, end_y in ends:
            shapes.rod(module, (end_x, end_y, DAIS_M), (end_x, end_y, DAIS_M + 3.2), 0.035, 'iron', sides=6)
            shapes.lathe(module, (end_x, end_y, DAIS_M), [(0.16, 0.0), (0.04, 0.08), (0.0, 0.08)], 'iron', sides=6)
            shapes.ball(module, (end_x, end_y, DAIS_M + 3.27), 0.07, 'iron', detail=0)
        shapes.rod(module, (*ends[0], DAIS_M + 3.1), (*ends[1], DAIS_M + 3.1), 0.025, 'iron', sides=5)
        shapes.drape(module, (ends[0][0] * 0.95, ends[0][1] * 0.95, DAIS_M + 3.08),
                     (ends[1][0] * 0.95, ends[1][1] * 0.95, DAIS_M + 3.08), 2.9, cloth, folds=3, depth=0.07,
                     hem=0.25)
    reach = max(abs(cos * width / 2), 0.15)
    deep = max(abs(sin * width / 2), 0.15)
    module.part((x - reach, y - deep, DAIS_M), (x + reach, y + deep, DAIS_M + 3.2))


def veiled_statue(module, at):
    """A robed figure on a plinth, taller than a man: broad shoulders, hands folded on its breast, its head and
    shoulders under a violet veil that falls past its elbows, the face a shadow in the veil's opening."""
    x, y, z = at
    kit.block(module, (x, y, z), (1.4, 1.4, 0.45), 'trim', bevel=0.04, wear=0.0)
    kit.block(module, (x, y, z + 0.45), (1.05, 1.05, 0.75), 'stone', bevel=0.03, wear=0.02)
    shapes.slab(module, (x, y - 0.53, z + 0.85), (0.8, 0.02, 0.12), 'gold')
    foot = z + 1.2
    shapes.lathe(module, (x, y, foot), [(0.5, 0.0), (0.44, 0.15), (0.34, 0.9), (0.3, 1.5), (0.4, 1.85), (0.36, 2.0),
                 (0.14, 2.08), (0.0, 2.1)], 'stone', sides=16)
    shapes.ball(module, (x, y, foot + 2.28), 0.17, 'stone', detail=2, scale=(1.0, 1.0, 1.2))
    for side in (-1, 1):
        shapes.slab(module, (x + side * 0.1, y - 0.3, foot + 1.45), (0.36, 0.14, 0.12), 'stone',
                    turn=(0.0, side * 0.5, 0.0))
    veil = shapes.lathe(module, (x, y, foot + 1.25), [(0.5, 0.0), (0.47, 0.35), (0.44, 0.7), (0.28, 0.95),
                        (0.22, 1.1), (0.23, 1.3), (0.15, 1.45), (0.0, 1.5)], 'veiled_dusk', sides=16)
    veil.scale = (1.0, 0.9, 1.0)
    shapes.ball(module, (x, y - 0.17, foot + 2.27), 0.12, 'black', detail=1, scale=(1.0, 0.5, 1.3))
    module.part((x - 0.7, y - 0.7, z), (x + 0.7, y + 0.7, foot + 2.75))


def chapel_veiled(module):
    apse(module, wall='stone', cloth='veiled_dusk', trim='trim', hanging='black')
    veiled_statue(module, (0.0, 2.2, DAIS_M))
    for x, y, width, turn, cloth in ((-3.6, 1.0, 2.2, 0.5, 'veiled_dusk'), (3.6, 1.0, 2.2, -0.5, 'veiled_dusk'),
                                     (-2.0, 2.9, 2.0, 0.9, 'black'), (2.0, 2.9, 2.0, -0.9, 'black')):
        veil_frame(module, x, y, width, turn, cloth)
    # Low candles at the statue's feet, in a crescent and in clusters on the steps' ends.
    for candle in range(9):
        angle = math.pi * (0.15 + 0.7 * candle / 8)
        spot = (math.cos(angle) * 1.2, 2.2 - math.sin(angle) * 1.2, DAIS_M)
        fittings.candle(module, spot, high=module.draw(0.08, 0.2), radius=0.05)
    for side in (-1, 1):
        for candle in range(3):
            fittings.candle(module, (side * (2.8 + candle * 0.16), DAIS_FRONT_Y + 0.25 + (candle % 2) * 0.12, DAIS_M),
                            high=module.draw(0.06, 0.16), radius=0.045)
    shapes.slab(module, (0.0, 1.4, DAIS_M + 0.02), (1.4, 3.4, 0.012), 'black')
