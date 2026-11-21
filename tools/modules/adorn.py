"""What dresses the hub's walls and corners (crates/city/src/hub/adorn.rs places each), after the owner's "wall
adornments. Banners and other small things to spruce up ambience".

A hung piece (banners, lights, ivy, shields, weapons, the keepers' signs) is fixed by its `wall` socket at its
fixing, facing out of the wall (-y); a stood one (planters, trees, statues, a well, a rug, a cart, sacks, amphorae)
by its `front` (-y); the bunting by `end-1`, its line running +x. Each stands on its own foot, z 0 its lowest point,
so a hung piece's socket is as high over its foot as it reaches below its fixing ([[Modules]] lists them).
"""
import math

import bpy  # noqa: F401 (the modules below load bmesh, which loads only after bpy)
import fittings
import kit
import props
import shapes

# Each emblem as an outline (x across, z up, about its middle), a metre high or so: scaled where it is laid.
BEACON = [(-0.2, -0.5), (0.2, -0.5), (0.13, 0.12), (0.17, 0.14), (0.17, 0.2), (0.12, 0.2), (0.12, 0.3), (0.16, 0.3),
          (0.0, 0.42), (-0.16, 0.3), (-0.12, 0.3), (-0.12, 0.2), (-0.17, 0.2), (-0.17, 0.14), (-0.13, 0.12)]
FLAME = [(0.0, 0.5), (0.09, 0.32), (0.12, 0.18), (0.08, 0.08), (0.0, 0.05), (-0.08, 0.08), (-0.12, 0.18),
         (-0.06, 0.28), (-0.04, 0.22)]
BOLT = [(-0.1, 0.42), (0.12, 0.42), (0.0, 0.08), (0.14, 0.1), (-0.12, -0.42), (-0.02, -0.06), (-0.16, -0.08)]
LAMP = [(-0.26, 0.0), (0.26, 0.0), (0.16, -0.14), (0.05, -0.16), (0.05, -0.3), (0.16, -0.34), (-0.16, -0.34),
        (-0.05, -0.3), (-0.05, -0.16), (-0.16, -0.14)]
ANVIL = [(-0.36, 0.08), (0.3, 0.08), (0.3, 0.0), (0.12, -0.04), (0.08, -0.14), (0.2, -0.2), (0.2, -0.24),
         (-0.2, -0.24), (-0.2, -0.2), (-0.08, -0.14), (-0.12, -0.04), (-0.22, 0.0)]
HELM = [(-0.2, -0.26), (0.2, -0.26), (0.21, 0.08), (0.14, 0.22), (0.0, 0.28), (-0.14, 0.22), (-0.21, 0.08)]


def arc(radius, inner, start, end, steps=12, middle=(0.0, 0.0)):
    """A band's outline round `middle`, from angle `start` to `end` on `radius` and back on `inner`."""
    angles = [start + (end - start) * step / steps for step in range(steps + 1)]
    out = [(middle[0] + math.cos(a) * radius, middle[1] + math.sin(a) * radius) for a in angles]
    return out + [(middle[0] + math.cos(a) * inner, middle[1] + math.sin(a) * inner) for a in reversed(angles)]


def star(points, outer, inner):
    return [((outer if step % 2 == 0 else inner) * math.sin(math.pi * step / points),
             (outer if step % 2 == 0 else inner) * math.cos(math.pi * step / points)) for step in range(points * 2)]


def scaled(outline, by):
    return [(x * by, z * by) for x, z in outline]


def emblem(module, outline, material, middle, by=1.0, depth=0.02):
    """An emblem laid flat on a face toward -y, its middle at `middle`."""
    shapes.cutout(module, scaled(outline, by), depth, material, middle)


def crescent(radius):
    """A waxing moon: the outer arc one way, an offset inner arc back."""
    outer = [(math.cos(a) * radius, math.sin(a) * radius) for a in
             [math.radians(70 + 220 * step / 14) for step in range(15)]]
    inner = [(radius * 0.32 + math.cos(a) * radius * 0.82, math.sin(a) * radius * 0.82) for a in
             [math.radians(260 - 160 * step / 10) for step in range(11)]]
    return outer + inner


def bracket(module, x, out, high):
    """An iron bracket from the wall to a banner's rod end `out` from it, `high` over the foot."""
    shapes.slab(module, (x, -0.02, high - 0.1), (0.1, 0.04, 0.4), 'iron')
    shapes.rod(module, (x, -0.02, high + 0.05), (x, -out, high + 0.05), 0.025, 'iron', sides=6)
    shapes.rod(module, (x, -0.02, high - 0.25), (x, -out * 0.7, high + 0.05), 0.018, 'iron', sides=6)
    shapes.ball(module, (x, -out - 0.03, high + 0.05), 0.045, 'gold', detail=1)


def hung_banner(module, width, drop, cloth, trim, devices, tails=True):
    """A banner on a rod held out from the wall, its devices (outline, material, height share, scale) on its face."""
    out = 0.14
    high = drop + 0.12
    shapes.banner(module, (0.0, -out + 0.03, high - 0.04), width, drop, cloth, trim=trim, tails=tails)
    for side in (-1, 1):
        bracket(module, side * (width / 2 + 0.08), out, high - 0.04)
    for outline, material, share, by in devices:
        emblem(module, outline, material, (0.0, -out - 0.03, high - drop * share), by)
    # A fringe of short tassels along its head, under the rod.
    for tassel in range(int(width / 0.18)):
        x = -width / 2 + 0.09 + tassel * 0.18
        shapes.rod(module, (x, -out - 0.01, high - 0.06), (x, -out - 0.01, high - 0.2), 0.012,
                   'gold' if trim == 'gold' else 'linen', sides=4)
    module.socket('wall', (0.0, 0.0, high), (0, -1))


def banner_overlook(module):
    hung_banner(module, 1.7, 4.0, 'crimson', 'gold', [(BEACON, 'gold', 0.42, 2.2), (FLAME, 'glow', 0.2, 0.9)])


def banner_overlook_long(module):
    hung_banner(module, 2.6, 9.0, 'crimson', 'gold', [(BEACON, 'gold', 0.3, 3.6), (FLAME, 'glow', 0.15, 1.5),
                                                       (star(8, 0.3, 0.12), 'gold', 0.62, 1.2)])


def banner_stormcallers(module):
    hung_banner(module, 1.9, 5.5, 'stormcaller_blue', 'iron', [(BOLT, 'bone', 0.4, 2.4)])


def banner_lamplighters(module):
    hung_banner(module, 1.9, 5.5, 'linen', 'gold', [(FLAME, 'gold', 0.47, 2.0), (LAMP, 'gold', 0.47, 2.2)])


def banner_veiled(module):
    hung_banner(module, 1.9, 5.5, 'black', 'bone', [(crescent(0.5), 'bone', 0.4, 1.0),
                                                     (star(4, 0.12, 0.04), 'bone', 0.22, 1.0)])


def lantern_hung(module):
    high = 1.0
    shapes.slab(module, (0.0, -0.02, high - 0.15), (0.16, 0.04, 0.5), 'iron')
    shapes.rod(module, (0.0, -0.02, high), (0.0, -0.78, high), 0.025, 'iron', sides=6)
    shapes.rod(module, (0.0, -0.02, high - 0.38), (0.0, -0.48, high), 0.018, 'iron', sides=6)
    shapes.ring(module, (0.0, -0.3, high - 0.12), 0.1, 0.015, 'iron', turn=(0.0, math.pi / 2, 0.0), segments=10,
                sides=3)
    shapes.ball(module, (0.0, -0.8, high), 0.04, 'iron', detail=1)
    fittings.lantern(module, (0.0, -0.74, 0.0), size=0.38, hung_from=high)
    module.socket('wall', (0.0, 0.0, high), (0, -1))


def sconce(module):
    high = 0.5
    shapes.slab(module, (0.0, -0.02, high), (0.14, 0.04, 0.4), 'iron')
    shapes.rod(module, (0.0, -0.02, high - 0.12), (0.0, -0.24, high + 0.02), 0.02, 'iron', sides=6)
    shapes.lathe(module, (0.0, -0.26, high), [(0.03, 0.0), (0.07, 0.1), (0.08, 0.13), (0.06, 0.13)], 'iron',
                 sides=8)
    shapes.rod(module, (0.0, -0.26, high + 0.02), (0.0, -0.3, high + 0.42), 0.03, 'timber', sides=6)
    shapes.lathe(module, (0.0, -0.3, high + 0.36), [(0.045, 0.0), (0.05, 0.08), (0.0, 0.09)], 'black', sides=6)
    shapes.ball(module, (0.0, -0.3, high + 0.52), 0.08, 'glow', detail=1, scale=(1.0, 1.0, 1.9))
    module.socket('wall', (0.0, 0.0, high), (0, -1))


def wall_brazier(module):
    # A corbel stepping out of the wall in three courses, the iron bowl on it, coals and a flame.
    high = 0.75
    for course, (out, tall) in enumerate(((0.25, 0.25), (0.45, 0.25), (0.62, 0.25))):
        kit.block(module, (0.0, -out / 2, course * tall), (0.7 - course * 0.05 + course * 0.12, out, tall), 'trim',
                  bevel=0.02, wear=0.02, part=False)
    bowl = (0.0, -0.36, high)
    shapes.lathe(module, bowl, [(0.1, 0.0), (0.26, 0.1), (0.36, 0.26), (0.38, 0.3), (0.34, 0.3)], 'iron', sides=12)
    for leg in range(3):
        angle = math.tau * leg / 3
        shapes.rod(module, (bowl[0] + math.cos(angle) * 0.34, bowl[1] + math.sin(angle) * 0.34, high + 0.3),
                   (bowl[0] + math.cos(angle) * 0.42, bowl[1] + math.sin(angle) * 0.42, high + 0.4), 0.02, 'iron',
                   sides=4)
    for coal in range(7):
        angle = math.tau * coal / 7
        shapes.ball(module, (bowl[0] + math.cos(angle) * 0.18, bowl[1] + math.sin(angle) * 0.18, high + 0.3), 0.09,
                    'black', detail=0)
    shapes.lathe(module, (bowl[0], bowl[1], high + 0.28), [(0.24, 0.0), (0.16, 0.25), (0.06, 0.5), (0.0, 0.62)],
                 'glow', sides=7)
    module.socket('wall', (0.0, 0.0, high), (0, -1))


def ivy(module):
    # Stems climbing the wall from its foot, leafy all the way, thinning as they rise.
    for stem in range(8):
        x = -1.75 + stem * 0.5 + module.draw(-0.2, 0.2)
        top = module.draw(3.5, 6.5)
        previous = (x, -0.04, 0.0)
        for step in range(1, 7):
            z = top * step / 6
            point = (previous[0] + module.draw(-0.35, 0.35), -0.04, z)
            shapes.rod(module, previous, point, 0.025 * (1.2 - step / 7), 'timber', sides=4)
            for leaf in range(6):
                shapes.ball(module, (point[0] + module.draw(-0.35, 0.35), -0.1, z - module.draw(0.0, 0.5)),
                            module.draw(0.16, 0.3) * (1.2 - step / 8), 'verdant', detail=1, scale=(1.0, 0.35, 0.8))
            previous = point
    module.socket('wall', (0.0, 0.0, 0.0), (0, -1))


def shield_wall(module):
    high = 0.7
    shapes.slab(module, (0.0, -0.03, high), (3.6, 0.06, 1.3), 'timber', bevel=0.01)
    for x in (-1.75, 1.75):
        shapes.slab(module, (x, -0.05, high), (0.1, 0.06, 1.4), 'iron')
    fittings.round_shield(module, (-1.15, -0.08, high), radius=0.48, face='crimson')
    fittings.kite_shield(module, (0.0, -0.1, high + 0.15), high=1.1, face='verdant', charge='gold', device='fess')
    fittings.round_shield(module, (1.15, -0.08, high), radius=0.48, face='black', rim='gold')
    module.socket('wall', (0.0, 0.0, high), (0, -1))


def weapon_rack_wall(module):
    # A rack standing on the floor against a wall, its fixing 1.2 m up: spears and halberds in it, two swords
    # leaning in its middle, a round shield over them.
    high = 1.2
    for x in (-1.45, 1.45):
        kit.block(module, (x, -0.12, 0.0), (0.12, 0.12, 2.4), 'timber', bevel=0.01, wear=0.0, part=False)
    for z, y in ((0.12, -0.2), (high, -0.12), (2.0, -0.12)):
        shapes.slab(module, (0.0, y, z), (3.0, 0.1, 0.08), 'timber')
    for number, x in enumerate((-1.15, -0.75, 0.75, 1.15)):
        fittings.polearm(module, (x, -0.18, 0.16), high=2.3, head='spear' if number % 2 == 0 else 'halberd')
    for side in (-1, 1):
        fittings.sword(module, (side * 0.18, -0.2, 0.18), length=1.05, roll=side * 0.22)
    fittings.round_shield(module, (0.0, -0.1, 1.75), radius=0.36, face='crimson')
    module.part((-1.55, -0.3, 0.0), (1.55, 0.0, 2.4))
    module.socket('wall', (0.0, 0.0, high), (0, -1))


def shop_sign(device):
    """A keeper's sign on its bracket, its device through the board so it reads from both sides."""
    def build(module):
        fix = 0.55
        middle = fittings.sign(module, (0.0, 0.0, fix), board=device[0], size=0.8)
        device[1](module, middle)
        module.socket('wall', (0.0, 0.0, fix + 0.3), (0, -1))
    return build


def through(module, outline, material, middle, by=1.0):
    """An outline laid through the board (edge-on to the street), showing on both its faces."""
    shapes.cutout(module, scaled(outline, by), 0.08, material, middle, turn=(0.0, 0.0, math.pi / 2))


def sign_mage(module, middle):
    through(module, star(8, 0.3, 0.12), 'gold', middle)


def faces(middle):
    """The board's two faces about its middle, for a device laid on each."""
    return [(middle[0] + side * 0.045, middle[1], middle[2]) for side in (-1, 1)]


def sign_vault(module, middle):
    for x, y, z in faces(middle):
        shapes.ring(module, (x, y + 0.12, z + 0.12), 0.12, 0.04, 'gold', turn=(0.0, math.pi / 2, 0.0), segments=12)
    # Its shaft runs from the bow down the diagonal; its two teeth stand square off the shaft's end.
    x, y, z = middle
    shapes.slab(module, (x, y - 0.06, z - 0.06), (0.12, 0.06, 0.34), 'gold', turn=(-math.pi / 4, 0.0, 0.0))
    for tooth_y, tooth_z in ((-0.092, -0.176), (-0.036, -0.12)):
        shapes.slab(module, (x, y + tooth_y, z + tooth_z), (0.12, 0.05, 0.12), 'gold', turn=(math.pi / 4, 0.0, 0.0))


def sign_weaponsmith(module, middle):
    through(module, ANVIL, 'gold', middle, by=0.9)


def sign_armorsmith(module, middle):
    through(module, HELM, 'gold', middle)
    shapes.slab(module, (middle[0], middle[1], middle[2] + 0.04), (0.09, 0.3, 0.04), 'black')


def sign_tailor(module, middle):
    # Open shears: each blade leaning across the other from the pivot, its ring handle on the far side below.
    x, y, z = middle
    for side in (-1, 1):
        shapes.cutout(module, [(-0.03, 0.0), (0.03, 0.0), (0.0, 0.4)], 0.08, 'bone', (x, y, z - 0.1),
                      turn=(0.0, side * 0.35, math.pi / 2))
        for face_x, _, _ in faces(middle):
            shapes.ring(module, (face_x, y - side * 0.11, z - 0.24), 0.07, 0.03, 'gold', turn=(0.0, math.pi / 2, 0.0),
                        segments=10)


def sign_tack(module, middle):
    through(module, arc(0.24, 0.15, math.radians(140), math.radians(400), steps=14), 'iron', middle)


def sign_harbourmaster(module, middle):
    # A ship's wheel on each face: its rim, eight spokes running out past it to handles, its hub.
    for x, y, z in faces(middle):
        shapes.ring(module, (x, y, z), 0.2, 0.04, 'gold', turn=(0.0, math.pi / 2, 0.0), segments=16)
        for spoke in range(8):
            angle = math.tau * spoke / 8
            shapes.rod(module, (x, y, z), (x, y + math.cos(angle) * 0.3, z + math.sin(angle) * 0.3), 0.018, 'gold',
                       sides=4)
        shapes.ball(module, (x, y, z), 0.05, 'gold', detail=1)


def sign_chandler(module, middle):
    # Three candles on a shelf through the board, on each face.
    x, y, z = middle
    shapes.slab(module, (x, y, z - 0.27), (0.24, 0.42, 0.04), 'timber')
    for face_x, _, _ in faces(middle):
        for at in (-0.14, 0.0, 0.14):
            fittings.candle(module, (x + (face_x - x) * 1.6, y + at, z - 0.25), high=0.3 - abs(at), radius=0.035)


SIGNS = {'mage': ('black', sign_mage), 'vault': ('crimson', sign_vault), 'weaponsmith': ('black', sign_weaponsmith),
         'armorsmith': ('crimson', sign_armorsmith), 'tailor': ('verdant', sign_tailor), 'tack': ('linen', sign_tack),
         'harbourmaster': ('verdant', sign_harbourmaster), 'chandler': ('timber', sign_chandler)}


def planter(module):
    # A stone box of earth, for two bushes, the world's own plants (crates/city/src/hub/plants.rs).
    kit.block(module, (0.0, 0.0, 0.0), (1.8, 0.7, 0.55), 'stone', bevel=0.04, wear=0.03)
    kit.block(module, (0.0, 0.0, 0.55), (1.9, 0.8, 0.08), 'trim', bevel=0.02, wear=0.0, part=False)
    shapes.slab(module, (0.0, 0.0, 0.6), (1.6, 0.5, 0.06), 'rubble')
    module.socket('front', (0.0, -0.4, 0.0), (0, -1))


def potted_tree(module):
    # A glazed pot of earth, for a young tree, one of the world's own (crates/city/src/hub/plants.rs).
    shapes.lathe(module, (0.0, 0.0, 0.0), [(0.42, 0.0), (0.5, 0.1), (0.62, 0.7), (0.68, 0.8), (0.6, 0.82),
                                           (0.6, 0.78)], 'roof', sides=14)
    module.part((-0.6, -0.6, 0.0), (0.6, 0.6, 0.82))
    shapes.lathe(module, (0.0, 0.0, 0.74), [(0.6, 0.0), (0.6, 0.04)], 'rubble', sides=14)
    module.socket('front', (0.0, -0.7, 0.0), (0, -1))


def plinth(module, side, high):
    kit.block(module, (0.0, 0.0, 0.0), (side + 0.4, side + 0.4, 0.3), 'trim', bevel=0.03, wear=0.02)
    kit.block(module, (0.0, 0.0, 0.3), (side, side, high - 0.5), 'stone', bevel=0.04, wear=0.03)
    kit.block(module, (0.0, 0.0, high - 0.2), (side + 0.3, side + 0.3, 0.2), 'trim', bevel=0.03, wear=0.0,
              part=False)
    return high


def figure(module, foot, material, tall=3.2):
    """A robed figure standing on `foot`, `tall` high: its robe, shoulders, hood and head. Returns its shoulder."""
    x, y, z = foot
    shapes.lathe(module, foot, [(0.62, 0.0), (0.6, 0.15), (0.46, 0.4 * tall), (0.36, 0.72 * tall),
                                (0.4, 0.8 * tall), (0.0, 0.82 * tall)], material, sides=14)
    shapes.ball(module, (x, y, z + 0.82 * tall), 0.42, material, detail=1, scale=(1.0, 0.75, 0.42))
    shapes.ball(module, (x, y + 0.02, z + 0.92 * tall), 0.2, material, detail=2, scale=(1.0, 1.0, 1.2))
    shapes.lathe(module, (x, y + 0.04, z + 0.86 * tall), [(0.27, 0.0), (0.26, 0.12 * tall), (0.0, 0.17 * tall)],
                 material, sides=10)
    return (x, y, z + 0.82 * tall)


def statue_keeper(module):
    # The keeper of the Beacon: a robed figure on a plinth, her lamp raised high in her right hand, alight.
    top = plinth(module, 1.4, 1.6)
    x, y, shoulder = figure(module, (0.0, 0.0, top), 'stone')
    hand = (x + 0.55, y - 0.25, shoulder + 0.85)
    shapes.rod(module, (x + 0.35, y, shoulder - 0.05), hand, 0.1, 'stone', sides=6, end_radius=0.07)
    shapes.rod(module, (x - 0.35, y, shoulder - 0.05), (x - 0.2, y - 0.3, shoulder - 0.9), 0.1, 'stone', sides=6)
    shapes.lathe(module, (hand[0], hand[1], hand[2]), [(0.06, 0.0), (0.2, 0.12), (0.24, 0.18), (0.2, 0.2)], 'gold',
                 sides=10)
    shapes.ball(module, (hand[0], hand[1], hand[2] + 0.34), 0.16, 'glow', detail=1, scale=(1.0, 1.0, 1.8))
    module.socket('front', (0.0, -0.9, 0.0), (0, -1))


def statue_sentinel(module):
    # A sentinel in mail and a long cloak on a plinth, a spear grounded at its side and a shield before it.
    top = plinth(module, 1.3, 1.4)
    x, y, shoulder = figure(module, (0.0, 0.0, top), 'stone', tall=3.0)
    shapes.lathe(module, (x, y + 0.02, shoulder + 0.12), [(0.24, 0.0), (0.26, 0.2), (0.2, 0.4), (0.0, 0.46)],
                 'iron', sides=10)
    shapes.rod(module, (x + 0.55, y - 0.15, top), (x + 0.55, y - 0.15, top + 3.6), 0.05, 'iron', sides=6)
    shapes.cutout(module, [(0.0, 0.0), (0.09, 0.18), (0.0, 0.55), (-0.09, 0.18)], 0.03, 'iron',
                  (x + 0.55, y - 0.15, top + 3.6))
    shapes.rod(module, (x + 0.35, y, shoulder - 0.05), (x + 0.55, y - 0.15, shoulder + 0.2), 0.1, 'stone', sides=6)
    fittings.kite_shield(module, (x - 0.1, y - 0.85, top + 1.6), high=1.3, face='stone', charge='gold',
                         device='chevron')
    module.socket('front', (0.0, -0.85, 0.0), (0, -1))


def well(module):
    # A round well of stone, a timber frame over it with a little roof, its windlass, rope and bucket.
    shapes.lathe(module, (0.0, 0.0, 0.0), [(1.1, 0.0), (1.1, 0.85), (1.2, 0.9), (1.2, 1.0), (0.9, 1.0),
                                           (0.9, 0.5)], 'stone', sides=18, smooth=False)
    shapes.lathe(module, (0.0, 0.0, 0.4), [(0.9, 0.0), (0.9, 0.02)], 'black', sides=18)
    module.part((-1.2, -1.2, 0.0), (1.2, 1.2, 1.0))
    for side in (-1, 1):
        fittings.post(module, (side * 1.0, 0.0, 1.0), 1.8, side=0.16, part=False)
    shapes.rod(module, (-1.05, 0.0, 2.2), (1.05, 0.0, 2.2), 0.08, 'timber', sides=8)
    shapes.rod(module, (1.0, 0.0, 2.2), (1.3, 0.0, 2.2), 0.03, 'iron', sides=6)
    shapes.rod(module, (1.3, 0.0, 2.2), (1.3, -0.3, 2.0), 0.03, 'iron', sides=6)
    shapes.lathe(module, (0.0, 0.0, 2.12), [(0.12, 0.0), (0.12, 0.16)], 'linen', sides=8,
                 turn=(0.0, math.pi / 2, 0.0))
    shapes.rod(module, (0.0, -0.1, 2.1), (0.0, -0.1, 1.45), 0.012, 'linen', sides=4)
    shapes.lathe(module, (0.0, -0.1, 1.05), [(0.16, 0.0), (0.2, 0.36), (0.2, 0.38), (0.18, 0.38)], 'timber', sides=10)
    shapes.ring(module, (0.0, -0.1, 1.42), 0.2, 0.012, 'iron', turn=(0.0, math.pi / 2, 0.0), segments=12, sides=3)
    fittings.gable_roof(module, -1.25, 1.25, -0.75, 0.75, 2.75, 3.4, ends='timber', overhang=0.2)
    module.socket('front', (0.0, -1.2, 0.0), (0, -1))


def rug_long(module):
    # A long runner from the Hall's door toward the war table, a gilt border and a beacon worked at each end.
    length, wide = 18.0, 3.6
    shapes.slab(module, (0.0, 0.0, 0.015), (wide, length, 0.03), 'crimson')
    for side in (-1, 1):
        shapes.slab(module, (side * (wide / 2 - 0.15), 0.0, 0.033), (0.12, length - 0.2, 0.01), 'lamplighter_gold')
        shapes.slab(module, (0.0, side * (length / 2 - 0.15), 0.033), (wide - 0.2, 0.12, 0.01), 'lamplighter_gold')
        shapes.cutout(module, scaled(BEACON, 2.4), 0.01, 'lamplighter_gold', (0.0, side * (length / 2 - 1.6), 0.04),
                      turn=(-math.pi / 2, 0.0, 0.0 if side > 0 else math.pi))
        for tassel in range(12):
            x = -wide / 2 + 0.15 + tassel * (wide - 0.3) / 11
            shapes.slab(module, (x, side * (length / 2 + 0.06), 0.01), (0.05, 0.12, 0.02), 'linen')
    module.socket('front', (0.0, -length / 2, 0.0), (0, -1))


def cart(module):
    # A trader's handcart: its bed on two wheels, its handles down on a prop, crates, a barrel and cloth bolts on it.
    bed = 0.8
    kit.block(module, (0.0, 0.0, bed), (2.2, 1.3, 0.08), 'timber', bevel=0.01, wear=0.0, part=False)
    for side in (-1, 1):
        shapes.slab(module, (0.0, side * 0.63, bed + 0.22), (2.2, 0.05, 0.36), 'timber')
        props.wheel(module, (0.2, side * 0.78, 0.55), 0.55)
        shapes.rod(module, (-1.1, side * 0.45, bed), (-2.1, side * 0.5, 0.75), 0.04, 'timber', sides=5)
    shapes.rod(module, (0.2, -0.85, 0.55), (0.2, 0.85, 0.55), 0.05, 'iron', sides=6)
    shapes.slab(module, (0.9, 0.0, bed / 2), (0.08, 0.08, bed), 'timber')
    module.part((-1.1, -0.8, 0.0), (1.1, 0.8, bed + 0.5))
    fittings.crate(module, (-0.5, -0.2, bed + 0.08), (0.7, 0.6, 0.5), turn=0.1)
    fittings.barrel(module, (0.5, 0.25, bed + 0.08), radius=0.28, high=0.75)
    for bolt, cloth in enumerate(('verdant', 'crimson', 'straw')):
        shapes.rod(module, (-0.1, -0.5 + bolt * 0.22, bed + 0.2), (0.7, -0.5 + bolt * 0.22, bed + 0.2), 0.1, cloth,
                   sides=8)
    module.socket('front', (0.0, -0.8, 0.0), (0, -1))


def sacks_grain(module):
    kit.block(module, (0.0, 0.0, 0.0), (1.6, 1.2, 0.14), 'timber', bevel=0.01, wear=0.0, part=False)
    for row, (x, y) in enumerate(((-0.4, -0.25), (0.4, -0.25), (-0.4, 0.3), (0.4, 0.3))):
        fittings.sack(module, (x, y, 0.14), size=0.6, turn=row * 0.4)
    for x in (-0.05, 0.4):
        fittings.sack(module, (x, 0.05, 0.62), size=0.55, turn=x)
    shapes.lathe(module, (-0.75, -0.55, 0.0), [(0.25, 0.0), (0.27, 0.22), (0.25, 0.24)], 'timber', sides=10)
    for grain in range(5):
        shapes.ball(module, (-0.75 + module.draw(-0.12, 0.12), -0.55 + module.draw(-0.12, 0.12), 0.24), 0.08,
                    'straw', detail=0)
    module.part((-0.8, -0.6, 0.0), (0.8, 0.6, 1.1))
    module.socket('front', (0.0, -0.8, 0.0), (0, -1))


def amphorae(module):
    # Tall jars standing in a timber frame, one lying, two small ones by them.
    profile = [(0.08, 0.0), (0.22, 0.25), (0.3, 0.55), (0.26, 0.85), (0.1, 1.0), (0.08, 1.15), (0.11, 1.2),
               (0.0, 1.2)]
    for number in range(4):
        shapes.lathe(module, (-0.75 + number * 0.5, 0.1, 0.05), profile, 'roof', sides=12)
    shapes.slab(module, (0.0, 0.1, 0.55), (2.1, 0.06, 0.06), 'timber')
    shapes.slab(module, (0.0, 0.1, 0.05), (2.1, 0.5, 0.1), 'timber')
    shapes.lathe(module, (0.5, -0.45, 0.32), profile, 'roof', sides=12, turn=(0.0, math.pi / 2, 0.2))
    for x in (-0.7, -0.35):
        shapes.lathe(module, (x, -0.4, 0.0), [(0.12, 0.0), (0.18, 0.18), (0.08, 0.36), (0.1, 0.42), (0.0, 0.42)],
                     'roof', sides=10)
    module.part((-1.05, -0.65, 0.0), (1.05, 0.4, 1.25))
    module.socket('front', (0.0, -0.65, 0.0), (0, -1))


def bunting_24(module):
    # A line slung 24 m between two posts, sagging a metre, hung with pennants in turn.
    span, sag, high = 24.0, 1.0, 1.5
    steps = 24
    line = [(-span / 2 + span * step / steps, 0.0, high - sag * math.sin(math.pi * step / steps))
            for step in range(steps + 1)]
    for start, end in zip(line, line[1:]):
        shapes.rod(module, start, end, 0.012, 'linen', sides=4)
    cloths = ('crimson', 'lamplighter_gold', 'linen', 'verdant', 'stormcaller_blue')
    for flag in range(36):
        share = (flag + 0.5) / 36
        x = -span / 2 + span * share
        z = high - sag * math.sin(math.pi * share)
        shapes.cutout(module, [(-0.2, 0.0), (0.2, 0.0), (0.0, -0.38)], 0.01, cloths[flag % len(cloths)],
                      (x, 0.0, z - 0.01))
    module.socket('end-1', (-span / 2, 0.0, high), (1, 0))


# Every adornment, by the name the hub asks for, in the order the catalogue appends them.
ADORNMENTS = (
    ('banner-overlook', banner_overlook),
    ('banner-overlook-long', banner_overlook_long),
    ('banner-stormcallers', banner_stormcallers),
    ('banner-lamplighters', banner_lamplighters),
    ('banner-veiled', banner_veiled),
    ('lantern-hung', lantern_hung),
    ('sconce', sconce),
    ('wall-brazier', wall_brazier),
    ('ivy', ivy),
    ('shield-wall', shield_wall),
    ('weapon-rack-wall', weapon_rack_wall),
    *((f'shop-sign-{keeper}', shop_sign(device)) for keeper, device in SIGNS.items()),
    ('planter', planter),
    ('potted-tree', potted_tree),
    ('statue-keeper', statue_keeper),
    ('statue-sentinel', statue_sentinel),
    ('well', well),
    ('rug-long', rug_long),
    ('cart', cart),
    ('sacks-grain', sacks_grain),
    ('amphorae', amphorae),
    ('bunting-24', bunting_24),
)
