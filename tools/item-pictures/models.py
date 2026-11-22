"""The models the item pictures are baked from, each built in an empty Blender scene of a few shapes, in the colours
its hand-drawn glyph had: each island's resource, the Ammo box and crate, and the ship's materials and modules. Each
entry is the model and how it is seen: from how far round and how high up, and how far it is rolled on the view.
"""
import math

from scene import ball, box, mesh, ring, rod


def brineglass():
    # Salt grown into clear cubes.
    for size, at, turn in (((0.8,) * 3, (0, 0, 0.4), (0, 0, 20)), ((0.55,) * 3, (0.62, 0.3, 0.28), (8, 0, -15)),
                           ((0.45,) * 3, (-0.58, 0.12, 0.22), (0, 8, 40)), ((0.42,) * 3, (0.1, -0.05, 0.98), (25, 15, 35))):
        box(size, at, '#bfe8ff', turn, rough=0.12)


def cairn_iron():
    # Three bars, stacked two and one.
    for at in ((0, -0.31, 0.2), (0, 0.31, 0.2), (0, 0, 0.62)):
        box((1.8, 0.5, 0.38), at, '#9aa0a8', metal=0.25, rough=0.45)


def heartwood_resin():
    # A drop of amber, lit through its foot.
    ball(0.55, (0, 0, 0.55), '#d9973e', rough=0.2, glow=0.35)
    rod((0, 0, 0.75), (0, 0, 1.75), 0.5, '#d9973e', tip=0.0, sides=24, rough=0.2, glow=0.35)


def sunstone(azimuth=-35):
    # A stone giving off the day's heat, its rays round it across the view.
    ball(0.6, (0, 0, 0), '#f0b545', stretch=(1.1, 0.95, 0.85), rings=6, glow=0.7)
    right = (math.cos(math.radians(azimuth)), math.sin(math.radians(azimuth)))
    for ray in range(8):
        angle = ray * math.pi / 4 + math.pi / 8
        way = (right[0] * math.cos(angle), right[1] * math.cos(angle), math.sin(angle))
        rod([0.85 * each for each in way], [1.25 * each for each in way], 0.09, '#fde7a0', tip=0.0, glow=2.0)


def goldgrass_seed():
    # An ear of the grass: grains up a stalk, either side in turn.
    rod((0, 0, -0.5), (0, 0, 2.2), 0.07, '#9c8a44')
    for grain in range(8):
        side = 1 if grain % 2 else -1
        ball(0.17, (side * 0.14, 0, 0.45 + grain * 0.22), '#e4d27a', stretch=(0.8, 0.8, 1.45), turn=(0, side * 28, 0))
    ball(0.14, (0, 0, 2.3), '#e4d27a', stretch=(0.75, 0.75, 1.6))


def mistbloom():
    # A flower open, seen from above: its petals, its heart and its stem.
    for petal in range(6):
        angle = math.radians(petal * 60)
        at = (math.cos(angle) * 0.5, math.sin(angle) * 0.5, 0.05)
        ball(0.38, at, '#c9b8f0', stretch=(1.5, 0.75, 0.22), turn=(0, -18, petal * 60))
    ball(0.24, (0, 0, 0.12), '#fff2b8', glow=0.3)
    rod((0, 0, -1.3), (0, 0, -0.05), 0.06, '#5d8a56')


def windthistle(azimuth=-35):
    # A thistle's head, its down like wire, on its stem.
    ball(0.5, (0, 0, 0.5), '#4f8a72', stretch=(1, 1, 1.1), rings=8)
    right = (math.cos(math.radians(azimuth)), math.sin(math.radians(azimuth)))
    for wire in range(11):
        angle = math.radians(-65 + wire * 13)
        way = (right[0] * math.sin(angle), right[1] * math.sin(angle), math.cos(angle))
        rod((0, 0, 0.85), [0.9 * each + (0.85 if axis == 2 else 0) for axis, each in enumerate(way)], 0.075,
            '#e2fff2', glow=0.15)
    rod((0, 0, -0.8), (0, 0, 0.15), 0.1, '#3d5e3a')


def bog_pearl():
    # A pearl in its open shell.
    ball(0.9, (0, 0, 0), '#7f948a', stretch=(1, 0.85, 0.28))
    ball(0.9, (0, 0.62, 0.62), '#2a3530', stretch=(1, 0.85, 0.28), turn=(62, 0, 0))
    ball(0.34, (0, -0.05, 0.32), '#e8e0c8', rough=0.15)


def rimecrystal():
    # A shard of frost: a six-sided spar to a point, a smaller one off its foot.
    rod((0, 0, 0), (0, 0, 1.3), 0.32, '#d8f0ff', sides=6, smooth=False, rough=0.1)
    rod((0, 0, 1.3), (0, 0, 1.95), 0.32, '#d8f0ff', sides=6, tip=0.0, smooth=False, rough=0.1)
    rod((0.2, 0, 0.15), (0.55, 0, 0.75), 0.16, '#86b8dc', sides=6, smooth=False, rough=0.1)
    rod((0.55, 0, 0.75), (0.7, 0, 1.0), 0.16, '#86b8dc', sides=6, tip=0.0, smooth=False, rough=0.1)


def ammo_box():
    # A small olive can, its lid lit, a brass round stamped on its side and a handle on top.
    box((1.2, 0.8, 0.8), (0, 0, 0.4), '#5b6b3a', rough=0.6)
    box((1.26, 0.86, 0.12), (0, 0, 0.84), '#8f9f5e', rough=0.5)
    box((0.5, 0.12, 0.08), (0, 0, 0.94), '#3a4424')
    for side in (-1, 1):
        rod((0, side * 0.4, 0.42), (0, side * 0.45, 0.42), 0.17, '#c08a3e', metal=0.8, rough=0.3)


def ammo_crate():
    # A wooden crate braced corner to corner on every side, its corners shod in brass.
    box((1.3, 1.0, 1.0), (0, 0, 0.5), '#d0985a', rough=0.8)
    for face, (width, depth) in enumerate(((1.3, 0.51), (1.3, -0.51), (1.0, 0.66), (1.0, -0.66))):
        along_x = face < 2
        for slope in (-1, 1):
            turn = (0, slope * 37, 0) if along_x else (slope * 45, 0, 0)
            at = (0, depth, 0.5) if along_x else (depth, 0, 0.5)
            size = (width * 1.1, 0.05, 0.2) if along_x else (0.05, width * 1.25, 0.2)
            box(size, at, '#5a3a1a', turn, rough=0.8)
    for x in (-0.62, 0.62):
        for y in (-0.47, 0.47):
            for z in (0.03, 0.97):
                box((0.16, 0.16, 0.16), (x, y, z), '#d8a464', metal=0.7, rough=0.35)


def timber():
    # Three sawn planks stacked two and one, their end grain to the left, a rope lashed round them.
    for at in ((0, -0.3, 0.13), (0, 0.3, 0.13), (0, 0, 0.39)):
        box((2.2, 0.56, 0.26), at, '#b07a44', rough=0.8)
        box((0.03, 0.5, 0.2), (at[0] - 1.11, at[1], at[2]), '#f0d39c', rough=0.9)
    ring(0.5, 0.045, (0.45, 0, 0.27), '#e2cb94', turn=(0, 90, 0))


def canvas():
    # A bolt of sailcloth on its side, its rolled end to us, tied with red twine, a fold of it unrolled below.
    rod((-0.9, 0, 0.47), (0.9, 0, 0.47), 0.45, '#e6dcc0', sides=24, rough=0.9)
    for radius in (0.32, 0.18):
        ring(radius, 0.025, (-0.91, 0, 0.47), '#c4b693', turn=(0, 90, 0))
    for x in (-0.45, 0.45):
        ring(0.465, 0.04, (x, 0, 0.47), '#b0523a', turn=(0, 90, 0))
    box((1.2, 0.55, 0.04), (0.25, -0.62, 0.02), '#c4b693', turn=(0, 0, -8), rough=0.9)


def iron():
    # Three cast ingots stacked two and one, a mark cast in each.
    for at in ((0, -0.36, 0.15), (0, 0.36, 0.15), (0, 0, 0.47)):
        box((1.4, 0.6, 0.3), at, '#6a737c', metal=0.3, rough=0.4)
        box((1.2, 0.44, 0.04), (at[0], at[1], at[2] + 0.16), '#b9c2ca', metal=0.3, rough=0.4)
        box((0.3, 0.12, 0.03), (at[0], at[1], at[2] + 0.19), '#4b525a', turn=(0, 0, 45))


def heartwood():
    # An old keel sawn across: bark, growth rings and its red heart, the log running back behind it.
    rod((-1.2, 0, 0.55), (0.8, 0, 0.55), 0.55, '#3f2716', sides=10, rough=0.95)
    for radius, colour, out in ((0.5, '#e3c08a', 0.02), (0.36, '#c9a066', 0.03), (0.21, '#e0584a', 0.04)):
        rod((-1.2 - out, 0, 0.55), (-1.19, 0, 0.55), radius, colour, sides=20, rough=0.8)


def guns():
    # A gun on its carriage: an iron barrel with its rings and cascabel, the wooden bracket and trucks, shot by it.
    rod((-0.8, 0, 0.78), (1.1, 0, 0.86), 0.21, '#5f6973', tip=0.16, metal=0.75, rough=0.35)
    for x in (-0.55, 0.1, 0.95):
        ring(0.2, 0.04, (x, 0, 0.78 + (x + 0.8) * 0.04), '#3f464e', turn=(0, 90, 0), metal=0.75)
    ball(0.11, (-0.95, 0, 0.77), '#3f464e', metal=0.75)
    for side in (-0.3, 0.3):
        box((1.2, 0.12, 0.45), (-0.15, side, 0.45), '#7e522b', rough=0.8)
        for x in (-0.6, 0.3):
            rod((x, side * 1.45, 0.24), (x, side * 1.05, 0.24), 0.24, '#57361c', rough=0.8)
    for at in ((1.0, -0.75, 0.14), (1.28, -0.75, 0.14), (1.14, -0.75, 0.37)):
        ball(0.14, at, '#262b31', metal=0.6)


def hull():
    # Its hull from the side: planks, the wale and its gunports with red lids, lit stern windows, copper below the
    # waterline, and the bowsprit.
    stations = [(-1.6, 0.6, 1.15), (-0.9, 0.72, 1.4), (0.0, 0.74, 1.45), (0.9, 0.62, 1.3), (1.5, 0.35, 1.0),
                (1.85, 0.05, 0.7)]
    for low, high, colour in ((0.0, 0.42, '#b87333'), (0.42, 1.0, '#a8723f')):
        points, faces = [], []
        for x, width, depth in stations:
            for share in (low, high):
                along = 1 - share
                points += [(x, -width * math.sqrt(1 - along ** 2 * 0.85), 1.2 - depth * along),
                           (x, width * math.sqrt(1 - along ** 2 * 0.85), 1.2 - depth * along)]
        for station in range(len(stations) - 1):
            first, second = station * 4, station * 4 + 4
            faces += [(first, second, second + 2, first + 2), (first + 1, first + 3, second + 3, second + 1)]
        faces += [(0, 2, 3, 1)]
        if high == 1.0:
            faces += [(station * 4 + 2, station * 4 + 6, station * 4 + 7, station * 4 + 3)
                      for station in range(len(stations) - 1)]
        mesh(points, faces, colour, metal=0.4 if colour == '#b87333' else 0.0, rough=0.7)
    box((3.0, 0.04, 0.1), (0.0, -0.72, 0.82), '#57361c')
    for x in (-0.9, -0.3, 0.3, 0.9):
        box((0.24, 0.05, 0.22), (x, -0.73, 1.02), '#b8322a')
    box((0.9, 1.2, 0.4), (-1.2, 0, 1.4), '#7e522b', rough=0.8)
    for y in (-0.3, 0.1):
        box((0.04, 0.22, 0.14), (-1.66, y, 1.38), '#f3cf86', glow=1.5)
    rod((1.7, 0, 1.15), (2.6, 0, 1.55), 0.07, '#7e522b')


def sails():
    # A square sail on its yard, full of wind, the mast behind it and the pennant at the masthead.
    points = [(x / 4, -0.35 * (1 - (x / 4) ** 2) * (1 - ((z / 4) - 0.1) ** 2), z / 3.4) for z in range(-4, 5)
              for x in range(-4, 5)]
    faces = [(row * 9 + column, row * 9 + column + 1, row * 9 + column + 10, row * 9 + column + 9)
             for row in range(8) for column in range(8)]
    mesh(points, faces, '#e6dcc0', smooth=True, rough=0.9)
    rod((-1.2, 0.02, 1.2), (1.2, 0.02, 1.2), 0.06, '#7a4e2a')
    rod((0, 0.12, -1.6), (0, 0.12, 2.0), 0.08, '#7a4e2a')
    rod((0, 0.12, 1.95), (0.75, 0.12, 1.82), 0.09, '#b0523a', tip=0.0, sides=3)


def rigging():
    # Shrouds rising from their deadeyes to the masthead, the ratlines rigged across them.
    feet = [x * 0.45 for x in (-2, -1, 0, 1, 2)]
    top = (0, 0.3, 2.5)
    rod((0, 0.3, -0.15), (0, 0.3, 2.75), 0.09, '#8a5a30')
    for x in feet:
        rod((x, 0, 0.1), top, 0.06, '#634f2e')
        rod((x, -0.05, 0.0), (x, 0.05, 0.0), 0.13, '#4f311a')
    for height in (0.45, 0.8, 1.15, 1.5, 1.85):
        reach = 0.9 * (1 - height / 2.4) + 0.02
        rod((-reach, 0.3 * height / 2.4 - 0.06, height), (reach, 0.3 * height / 2.4 - 0.06, height), 0.05,
            '#ecd9a8')
    box((2.3, 0.25, 0.12), (0, 0.05, -0.12), '#c8935a', rough=0.8)


# Each island's resource in the catalogue's order, then ammunition, then the ship's: its model, and its view.
RESOURCES = [('Brineglass', brineglass, {}), ('Cairn Iron', cairn_iron, {'azimuth': -55, 'elevation': 30}),
             ('Heartwood Resin', heartwood_resin, {'roll': -15}), ('Sunstone', sunstone, {'elevation': 0}),
             ('Goldgrass Seed', goldgrass_seed, {'roll': -40}), ('Mistbloom', mistbloom, {'elevation': 55}),
             ('Windthistle', windthistle, {'roll': -20}), ('Bog Pearl', bog_pearl, {'elevation': 35}),
             ('Rimecrystal', rimecrystal, {'roll': -20})]
AMMUNITION = [('Ammo box', ammo_box), ('Ammo crate', ammo_crate)]
SHIP = {
    'timber': (timber, {'azimuth': -55}), 'canvas': (canvas, {'azimuth': -55}),
    'iron': (iron, {'azimuth': -40, 'elevation': 38}), 'heartwood': (heartwood, {'azimuth': -60}), 'guns': (guns, {'azimuth': -30, 'elevation': 20}),
    'hull': (hull, {'azimuth': -30, 'elevation': 18}), 'sails': (sails, {'azimuth': -15, 'elevation': 8}),
    'rigging': (rigging, {'azimuth': -12, 'elevation': 6}),
}
