"""The halls' dressing: the heraldic shield over crossed spears and the torn banner on the walls, the carved boss, the
iron ring chandelier and the hooked boss under the ceiling, the runner rug and the brass-inlaid medallion on the
floor. The shield and banner makers serve the landmarks too.
"""
import math
import random

import details
import shapes
from styles.halls import forms
from styles.halls.forms import DOWN, SOUTH, UP, leaf, stud, tube

# An octagon's seam, for the revolve helper, so its faces stand square to the axes.
OCTAGON = (0.3827, -0.9239, 0.0)


def blade(start, direction, length, width, thick, across=(1.0, 0.0, 0.0)):
    """A leaf-shaped spearhead from `start` along `direction`: a diamond section, widest a third of the way up."""
    direction = shapes.unit(direction)
    side = shapes.unit(shapes.sub(across, shapes.mul(direction, shapes.dot(across, direction))))
    face = shapes.cross(direction, side)
    sections, middles = [], []
    for share, wide in ((0.0, 0.25), (0.12, 0.8), (0.32, 1.0), (0.6, 0.7), (0.85, 0.3), (1.0, 0.0)):
        middle = shapes.add(start, shapes.mul(direction, length * share))
        reach, depth = width / 2 * wide, thick / 2 * max(wide, 0.2) if share < 1 else 0.0
        sections.append([shapes.add(middle, shapes.mul(side, reach)), shapes.add(middle, shapes.mul(face, depth)),
                         shapes.sub(middle, shapes.mul(side, reach)), shapes.sub(middle, shapes.mul(face, depth))])
        middles.append(middle)
    faces = shapes.sweep(sections, outward=shapes.out_from(middles))
    return faces + [shapes.facing(shapes.flat(sections[0]), shapes.mul(direction, -1))]


def spear(butt, tip, tassel=True):
    """A spear from its butt to its tip: an ash shaft, an iron butt spike and socket, a leaf blade, and a dyed tassel
    hanging under the head. {part: faces}"""
    way = shapes.unit(shapes.sub(tip, butt))
    head = shapes.sub(tip, shapes.mul(way, 0.3))
    socket = shapes.sub(head, shapes.mul(way, 0.09))
    found = {'wood': forms.grain(shapes.cylinder(shapes.add(butt, shapes.mul(way, 0.07)), socket, 0.02, 8)),
             'iron': shapes.cone(shapes.add(butt, shapes.mul(way, 0.07)), butt, 0.021, 0.004, 6)}
    found['iron'] += shapes.cone(socket, head, 0.024, 0.016, 8) + blade(head, way, 0.3, 0.075, 0.016)
    found['cloth'] = []
    if tassel:
        hang = shapes.add(socket, shapes.mul(way, 0.02))
        profile = [(0.0, 0.0), (0.012, -0.004), (0.028, -0.05), (0.034, -0.15), (0.0, -0.16)]
        found['cloth'] = forms.turned(profile, hang, 0, 360, 7)
    return found


def heraldry(x, y, top, width, height, bulge):
    """A heater shield in dyed cloth on a backing, rimmed in iron and charged with a brass chevron. {part: faces}"""
    parts, rim = forms.shield(x, y, top, width, height, bulge)
    half = width / 2

    def on_face(px, pz):
        return (px, y + bulge * (1 - ((px - x) / half) ** 2) + 0.004, pz)

    legs = [[on_face(x + side * half * 0.8 * (1 - k / 5), top - height * (0.62 - 0.32 * k / 5)) for k in range(6)]
            for side in (-1, 1)]
    chevron = legs[0] + legs[1][-2::-1]
    found = {'cloth': parts['face'], 'iron': parts['back'] + tube(rim, 0.018, 5, 0.07),
             'brass': forms.band(chevron, SOUTH, width * 0.11, 0.008)}
    for px, pz in ((x - half * 0.75, top - 0.06), (x + half * 0.75, top - 0.06)):
        found['brass'] += stud(on_face(px, pz), SOUTH, 0.02, 0.014)
    return found


def feature_a(kit):
    """A heraldic shield over two crossed spears, their tassels hanging under the heads."""
    found = {}
    for side, y in ((-1, 0.06), (1, 0.1)):
        for part, faces in spear((side * 0.62, y, 0.72), (-side * 0.66, y, 2.94)).items():
            found[part] = found.get(part, []) + faces
    for part, faces in heraldry(0.0, 0.14, 2.42, 0.7, 0.84, 0.07).items():
        found[part] = found.get(part, []) + faces
    return forms.made(kit, found, 'feature.a')


def banner(x0, x1, top, bottom, y, seed, cords=True):
    """A banner hung from an iron rod on two wall brackets, brass finials at its ends: the cloth wrapped round the
    rod, falling in folds, torn ragged at its foot, and a corded tassel at each end. {part: faces}"""
    reach = (x1 - x0) / 2 + 0.16
    middle = (x0 + x1) / 2
    rod = y + 0.025
    found = {'iron': tube([(middle - reach, rod, top), (middle + reach, rod, top)], 0.016, 6, 0.5), 'brass': [],
             'cloth': tube([(x0 + 0.02, rod, top), (x1 - 0.02, rod, top)], 0.03, 8, 0.4), 'rope': []}
    for side in (-1, 1):
        end = middle + side * reach
        found['brass'] += shapes.revolve([(0.022, 0.0), (0.03, 0.02), (0.028, 0.045), (0.015, 0.065), (0.0, 0.08)],
                                         (end, rod, top), (side, 0.0, 0.0), 8)
        hold = middle + side * (reach - 0.12)
        found['iron'] += shapes.box(hold - 0.035, 0.0, top - 0.08, hold + 0.035, 0.015, top + 0.08)
        found['iron'] += tube([(hold, 0.015, top), (hold, rod - 0.02, top)], 0.011, 5, 0.2)
        found['iron'] += shapes.ring((hold, rod, top), 0.021, 0.006, (1.0, 0.0, 0.0), 8, 4)
        if cords:
            cord = details.sag_path((hold + side * 0.04, rod + 0.02, top - 0.02), (hold + side * 0.06, rod + 0.05,
                                                                                    top - 0.62), 0.0, 6)
            found['rope'] += tube(cord, 0.007, 5, 0.12)
            tassel = [(0.0, 0.0), (0.014, -0.006), (0.024, -0.04), (0.028, -0.13), (0.0, -0.14)]
            found['rope'] += forms.turned(tassel, cord[-1], 0, 360, 7)
    found['cloth'] += details.drape(x0, x1, top - 0.02, bottom, y, folds=4, depth=0.07, thickness=0.012, ragged=0.3,
                                    rows=8, seed=seed)
    return found


def feature_b(kit):
    """A banner falling in folds from an iron rod, torn at its foot, corded tassels at its ends."""
    return forms.made(kit, banner(-0.5, 0.5, 2.86, 0.85, 0.115, 'halls.feature.b'), 'feature.b')


def ceiling_a(kit):
    """A carved boss: an octagonal moulded frame studded in brass, two rings of acanthus radiating from a turned brass
    pendant."""
    frame = [(0.62, 0.0), (0.62, -0.03), (0.54, -0.06), (0.47, -0.1), (0.4, -0.1), (0.36, -0.06), (0.0, -0.06)]
    found = {'trim': shapes.revolve(frame, (0.0, 0.0, 0.0), UP, 8, seam=OCTAGON)[:-1], 'relief': [], 'brass': []}
    for number in range(16):
        turn = math.radians(22.5 * number)
        way = (math.cos(turn), math.sin(turn), 0.0)
        size = (0.34, 0.26, 0.15) if number % 2 == 0 else (0.24, 0.2, 0.3)
        found['relief'] += leaf((way[0] * 0.07, way[1] * 0.07, -0.06), DOWN, size[0], size[1], lean=size[2],
                                curl=0.3, up=way)
    for number in range(8):
        turn = math.radians(22.5 + 45 * number)
        found['brass'] += stud((math.cos(turn) * 0.5, math.sin(turn) * 0.5, -0.1), DOWN, 0.026, 0.018, 4)
    pendant = [(0.0, 0.0), (0.1, -0.02), (0.12, -0.08), (0.09, -0.15), (0.05, -0.2), (0.065, -0.25), (0.0, -0.33)]
    found['brass'] += forms.turned(pendant, (0.0, 0.0, -0.04), 0, 360, 8)
    return kit.under_dome(forms.made(kit, found, 'ceiling.a'))


def ceiling_b(kit):
    """An iron chandelier ring, unlit: eight brass drip pans with empty spikes on its rim, hung by three rods from a
    hub on a short chain under a brass ceiling rose, a brass drop under the hub."""
    ring_z, hub_z = -1.25, -0.44
    found = {'brass': forms.turned([(0.16, 0.0), (0.16, -0.02), (0.1, -0.06), (0.03, -0.09), (0.0, -0.1)],
                                   (0.0, 0.0, 0.0), 0, 360, 8)}
    found['iron'] = details.chain([(0.0, 0.0, -0.09), (0.0, 0.0, hub_z + 0.02)], 0.13, 0.013, 4, 3)
    found['iron'] += forms.turned([(0.0, 0.03), (0.045, 0.0), (0.05, -0.04), (0.0, -0.06)], (0.0, 0.0, hub_z), 0,
                                  360, 6)
    for number in range(3):
        turn = math.radians(90 + 120 * number)
        end = (math.cos(turn) * 0.62, math.sin(turn) * 0.62, ring_z)
        found['iron'] += tube([(math.cos(turn) * 0.04, math.sin(turn) * 0.04, hub_z - 0.02), end], 0.011, 4, 2.0)
    found['iron'] += shapes.ring((0.0, 0.0, ring_z), 0.62, 0.03, UP, 12, 4)
    found['brass'] += forms.turned([(0.0, 0.0), (0.045, -0.03), (0.055, -0.08), (0.03, -0.13), (0.0, -0.18)],
                                   (0.0, 0.0, hub_z - 0.06), 0, 360, 6)
    for number in range(8):
        turn = math.radians(22.5 + 45 * number)
        cup = (math.cos(turn) * 0.62, math.sin(turn) * 0.62, ring_z + 0.035)
        found['brass'] += forms.turned([(0.0, -0.01), (0.05, 0.012), (0.055, 0.024), (0.0, 0.01)], cup, 0, 360, 4)
        found['iron'] += shapes.cone((cup[0], cup[1], cup[2] + 0.01), (cup[0], cup[1], cup[2] + 0.06), 0.008, 0.0,
                                     3)[:-1]
    return kit.under_dome(forms.made(kit, found, 'ceiling.b'))


def ceiling_c(kit):
    """A round boss of six leaves round a brass eye, hung with a short chain and an iron hook for a lamp."""
    frame = [(0.34, 0.0), (0.34, -0.025), (0.28, -0.055), (0.2, -0.08), (0.0, -0.08)]
    found = {'trim': shapes.revolve(frame, (0.0, 0.0, 0.0), UP, 12)[:-1], 'relief': [], 'brass': [], 'iron': []}
    for number in range(6):
        turn = math.radians(60 * number)
        way = (math.cos(turn), math.sin(turn), 0.0)
        found['relief'] += leaf((way[0] * 0.06, way[1] * 0.06, -0.08), DOWN, 0.26, 0.2, lean=0.3, curl=0.3, up=way)
    found['brass'] += forms.turned([(0.0, 0.0), (0.06, -0.01), (0.065, -0.05), (0.03, -0.08), (0.0, -0.09)],
                                   (0.0, 0.0, -0.07), 0, 360, 6)
    found['brass'] += shapes.ring((0.0, 0.0, -0.19), 0.035, 0.009, (1.0, 0.0, 0.0), 8, 3)
    found['iron'] += details.chain([(0.0, 0.0, -0.21), (0.0, 0.0, -0.52)], 0.12, 0.011, 4, 3)
    bend = [math.radians(a) for a in range(210, 361, 30)]
    hook = [(0.0, 0.0, -0.5), (0.0, 0.0, -0.6)] + [(0.06 + 0.06 * math.cos(a), 0.0, -0.6 + 0.06 * math.sin(a))
                                                    for a in bend]
    found['iron'] += tube(hook + [(0.13, 0.0, -0.54)], 0.012, 4, 0.05)
    return kit.under_dome(forms.made(kit, found, 'ceiling.c'))


def floor_a(kit):
    """A runner rug 3.2 m along x and 1.2 across, lying in gentle rucks, its ends frayed into a fringe."""
    draw = random.Random('halls.floor.a')
    rucks = [(draw.uniform(-1.2, 1.2), draw.uniform(0.008, 0.018), draw.uniform(0.12, 0.22)) for _ in range(3)]
    columns, rows, half_x, half_y = 12, 4, 1.5, 0.6

    def lift(x, y):
        bump = sum(height * math.exp(-((x - at) / spread) ** 2) * (1 - 0.3 * abs(y) / half_y)
                   for at, height, spread in rucks)
        return 0.012 + bump

    ends = [[draw.uniform(-0.025, 0.0) for _ in range(rows + 1)] for _ in (0, 1)]

    def at(column, row):
        x = -half_x + 2 * half_x * column / columns + ends[0][row] * (column == 0) - ends[1][row] * (column == columns)
        y = -half_y + 2 * half_y * row / rows
        return (x, y, lift(x, y))

    grid = [[at(column, row) for column in range(columns + 1)] for row in range(rows + 1)]
    faces = [shapes.facing(shapes.flat([grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]]), UP)
             for r in range(rows) for c in range(columns)]
    rim = [grid[0][c] for c in range(columns + 1)] + [grid[r][columns] for r in range(1, rows + 1)]
    rim += [grid[rows][c] for c in range(columns - 1, -1, -1)] + [grid[r][0] for r in range(rows - 1, 0, -1)]
    for a, b in zip(rim, rim[1:] + rim[:1]):
        out = (a[0] + b[0], (a[1] + b[1]) * 4, 0.0)
        faces.append(shapes.facing(shapes.flat([a, b, (b[0], b[1], 0.002), (a[0], a[1], 0.002)]), out))
    fringe = []
    for side in (-1, 1):
        for number in range(14):
            y = -half_y + 0.03 + (2 * half_y - 0.06) * number / 13
            start = side * (half_x - 0.01)
            tip = (start + side * draw.uniform(0.05, 0.09), y + draw.uniform(-0.025, 0.025), 0.004)
            fringe.append(shapes.facing(shapes.flat([(start, y - 0.012, 0.008), (start, y + 0.012, 0.008),
                                                     (tip[0], tip[1] + 0.008, 0.004),
                                                     (tip[0], tip[1] - 0.008, 0.004)]), UP))
    return forms.made(kit, {'cloth': faces, 'rope': fringe}, 'floor.a', smooth=50.0)


def floor_b(kit):
    """A medallion let into the floor: an octagonal slab, an eight-pointed star of brass and carved stone in a brass
    ring, a brass boss at its heart."""
    found = {'trim': shapes.revolve([(1.08, 0.006), (1.06, 0.012), (0.0, 0.012)], (0.0, 0.0, 0.0), UP, 8,
                                    seam=OCTAGON)[:-1],
             'stoneAlt': shapes.revolve([(0.86, 0.012), (0.86, 0.018), (0.0, 0.018)], (0.0, 0.0, 0.0), UP, 16)[:-1],
             'brass': forms.turned([(0.86, 0.018), (0.86, 0.03), (0.93, 0.03), (0.93, 0.012)], (0.0, 0.0, 0.0), 0,
                                   360, 16),
             'relief': []}
    found['trim'] += [shapes.facing(shapes.flat([(px, py, 0.0), (qx, qy, 0.0), (qx, qy, 0.006), (px, py, 0.006)]),
                                    (px + qx, py + qy, 0.0))
                      for (px, py), (qx, qy) in zip(forms.octagon(1.08), forms.octagon(1.08)[1:] +
                                                    forms.octagon(1.08)[:1])]
    found['brass'] += forms.turned([(0.0, 0.045), (0.09, 0.038), (0.16, 0.026), (0.2, 0.018)], (0.0, 0.0, 0.0), 0, 360,
                                   8)
    for number in range(16):
        turn = math.radians(22.5 * number)
        reach = 0.84 if number % 2 == 0 else 0.56
        tip = (math.cos(turn) * reach, math.sin(turn) * reach, 0.02)
        ridge = (math.cos(turn) * 0.18, math.sin(turn) * 0.18, 0.034)
        halves = (('brass', 'relief') if number % 2 == 0 else ('stoneAlt', 'relief'))
        for side, part in zip((-1, 1), halves):
            flank = math.radians(22.5 * number + side * 11.25)
            corner = (math.cos(flank) * 0.24, math.sin(flank) * 0.24, 0.02)
            found[part].append(shapes.facing(shapes.flat([ridge, tip, corner]), UP))
    return forms.made(kit, found, 'floor.b')


def pieces(kit):
    """The halls' features, ceiling and floor pieces: {piece: object}."""
    return {'feature.a': feature_a(kit), 'feature.b': feature_b(kit), 'ceiling.a': ceiling_a(kit),
            'ceiling.b': ceiling_b(kit), 'ceiling.c': ceiling_c(kit), 'floor.a': floor_a(kit), 'floor.b': floor_b(kit)}
