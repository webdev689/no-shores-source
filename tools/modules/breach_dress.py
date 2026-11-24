"""How the Drowned Vale's spaces look past what a body meets: the dressing each space's builder lays last, drawn only,
so no part or socket moves. Walls get their faces (a plinth, pilasters, blind lancets, a broken cornice), pillars
their bases and capitals, naves their arcades and ribs, and every piece hung over the dark the rock it was torn from,
hanging under it. The stone is the old vale's, drowned and grown through by the Lattice's red crystal.
"""
import math

import breach_kit as bk
import kit
import latticekit


def face(module, west, south, east, north, bottom, top, toward, bay=4.0, lancets=True, ruin=0.25,
         material='stone'):
    """Dresses the face of a wall's box that looks `toward` (along x or y): a plinth along its foot, pilasters every
    `bay` metres, a blind pointed lancet in each bay, and a cornice along its top, a share `ruin` of it fallen."""
    along_x = toward[0] == 0.0
    length = (east - west) if along_x else (north - south)
    front = (north if toward[1] > 0 else south) if along_x else (east if toward[0] > 0 else west)
    out = toward[1] if along_x else toward[0]
    start = west if along_x else south
    high = top - bottom

    def at(along, proud, z):
        return (start + along, front + out * proud, z) if along_x else (front + out * proud, start + along, z)

    def size(long, proud, tall):
        return (long, abs(proud) * 2, tall) if along_x else (abs(proud) * 2, long, tall)

    kit.block(module, at(length / 2, 0.0, bottom), size(length, 0.3, 0.8), 'trim', bevel=0.03, wear=0.03, part=False)
    bays = max(1, round(length / bay))
    span = length / bays
    for number in range(bays + 1):
        along = number * span
        if 0.4 < along < length - 0.4:
            kit.block(module, at(along, 0.0, bottom), size(0.9, 0.4, high - 0.6), 'trim', bevel=0.03, wear=0.03,
                      part=False)
        if lancets and number < bays and high > 6.0:
            middle = along + span / 2
            wide = min(span * 0.42, 1.8)
            sill, head = bottom + 2.2, top - 2.2 - wide
            kit.block(module, at(middle, 0.0, sill), size(wide, 0.04, head - sill), 'black', bevel=0.0, wear=0.0,
                      part=False)
            kit.block(module, at(middle, 0.0, sill - 0.25), size(wide + 0.5, 0.25, 0.25), 'trim', bevel=0.02,
                      wear=0.0, part=False)
            turn = (0.0 if out < 0 else math.pi) if along_x else (-math.pi / 2 if out < 0 else math.pi / 2)
            spot = at(middle, 0.12, head)
            bk.arch(module, spot, wide / 2, 0.3, 0.32, stones=6, turn=turn, pointed=True)
    run = 0.0
    while run < length - 0.2:
        long = min(module.draw(2.0, 5.0), length - run)
        if module.draw() > ruin:
            kit.block(module, at(run + long / 2, 0.0, top - 0.5), size(long, 0.45, 0.5), 'trim', bevel=0.03, wear=0.05,
                      part=False)
        else:
            spot = at(run + long / 2, -0.2, top - 0.3)
            bk.facet_rock(module, spot, (1.2, 1.0, 0.8), material, points=12, turn=module.draw(0.0, math.pi))
        run += long


def pillar(module, at, radius, height, material='trim'):
    """A pillar's square base and its capital, abacus over echinus, round a shaft already standing at `at`."""
    x, y, z = at
    kit.block(module, (x, y, z), (radius * 2.6, radius * 2.6, 0.45), material, bevel=0.04, wear=0.03, part=False)
    kit.column(module, (x, y, z + 0.45), radius * 1.18, 0.22, material, sides=14, part=False)
    kit.column(module, (x, y, z + height - 0.8), radius * 1.2, 0.35, material, sides=14, part=False)
    kit.block(module, (x, y, z + height - 0.45), (radius * 2.7, radius * 2.7, 0.45), material, bevel=0.03, wear=0.03,
              part=False)


def hanging(module, west, south, east, north, top, deep):
    """The rock a piece hung over the dark was torn from, under it from `top` down some `deep` metres: split stone
    narrowing as it hangs, its last shards pointing down."""
    long, wide = east - west, north - south
    middle = ((west + east) / 2, (south + north) / 2)
    z, scale = top, 1.0
    while z > top - deep and scale > 0.15:
        # Each layer as deep as a good share of its width, so the mass hangs rather than lies flat.
        tall = min(long, wide) * scale * module.draw(0.22, 0.34)
        pieces = max(1, min(9, round(long * wide * scale * scale / 40.0)))
        for _ in range(pieces):
            share = 0.75 if pieces > 1 else 1.0
            spot = (middle[0] + module.draw(-0.3, 0.3) * long * scale, middle[1] + module.draw(-0.3, 0.3) * wide * scale,
                    z - tall)
            bk.facet_rock(module, spot, (long * scale * module.draw(0.5, 0.8) * share,
                                         wide * scale * module.draw(0.5, 0.8) * share, tall * 1.15), 'rubble',
                          points=14, turn=module.draw(-0.3, 0.3))
        z -= tall * 0.8
        scale *= module.draw(0.58, 0.72)


def rubble(module, centre, reach, count, top=0.0):
    """Fallen work round `centre`: cut blocks, a pillar's drums, and split stone."""
    for _ in range(count):
        angle, far = module.draw(0.0, math.tau), module.draw(0.0, reach)
        spot = (centre[0] + far * math.cos(angle), centre[1] + far * math.sin(angle), top - 0.05)
        kind = module.draw()
        if kind < 0.35:
            kit.block(module, spot, (module.draw(0.5, 1.2), module.draw(0.4, 0.8), module.draw(0.3, 0.6)), 'stone',
                      turn=module.draw(0.0, math.pi), bevel=0.04, wear=0.06, part=False)
        elif kind < 0.55:
            drum = kit.column(module, (spot[0], spot[1], top + 0.4), 0.45, 0.6, 'trim', sides=10, part=False)
            drum.rotation_euler = (math.pi / 2, 0.0, module.draw(0.0, math.pi))
        else:
            size = module.draw(0.3, 0.8)
            bk.facet_rock(module, spot, (size * 1.3, size, size * 0.7), 'rubble', points=10,
                          turn=module.draw(0.0, math.pi))


def descent(module):
    """The mill race: its cut sides split rock leaning in, the race's water along its floor's edges, sluice frames at
    each drop, the fallen wheel's rim and paddles, and rubble washed down it."""
    for south, north, floor_top in ((-36.0, -18.0, 0.0), (-18.0, -6.0, -3.0), (6.0, 24.0, -6.0), (26.4, 40.0, -10.0)):
        for west, east, toward in ((-6.0, -4.2, 1.0), (4.2, 6.0, -1.0)):
            bk.rock_face(module, west, south, east, north, floor_top - 0.3, floor_top + 6.6, face=(toward, 0.0))
        for west, east in ((-4.0, -3.2), (3.2, 4.0)):
            bk.drowned_floor(module, west, south + 0.5, east, north - 0.5, top=floor_top)
    for y, top in ((-18.0, 0.0), (12.6, -3.0), (30.0, -6.4)):
        for x in (-4.0, 4.0):
            kit.block(module, (x, y, top - 3.6), (0.4, 0.4, 5.4), 'timber', bevel=0.02, wear=0.0, part=False)
        kit.block(module, (0.0, y, top + 1.6), (8.4, 0.4, 0.4), 'timber', bevel=0.02, wear=0.0, part=False)
    for half in (0, 1):
        ring = bk.bpy_ring(module, (0.0, 0.0, -3.0), 2.8 - half * 0.25, 0.14, material='timber')
        ring.rotation_euler = (0.0, 0.0, 0.0)
    for paddle in range(12):
        angle = paddle * math.tau / 12
        kit.block(module, (math.cos(angle) * 3.0, math.sin(angle) * 3.0, -3.25), (0.7, 0.12, 0.5), 'timber',
                  turn=angle, bevel=0.0, wear=0.0, part=False)
    for centre in ((0.0, -24.0, 0.0), (0.0, 9.0, -3.0), (0.0, 20.0, -6.0), (0.0, 34.0, -10.0)):
        rubble(module, centre[:2], 3.0, 5, top=centre[2])


def mending(module):
    """The drowned green: the houses' backs framed in timber with shuttered windows under their eaves, a well with its
    roof and windlass, the cottages' chimneys, a cart and barrels left in the square, and fieldstone walls."""
    for west, south, east, north, toward in ((-34.0, -30.0, -30.0, 30.0, (1.0, 0.0)), (30.0, -30.0, 34.0, 30.0, (-1.0, 0.0)),
                                             (-30.0, -34.0, -3.0, -30.0, (0.0, 1.0)), (3.0, -34.0, 30.0, -30.0, (0.0, 1.0)),
                                             (-30.0, 30.0, -3.0, 34.0, (0.0, -1.0)), (3.0, 30.0, 30.0, 34.0, (0.0, -1.0))):
        timbered(module, west, south, east, north, toward)
    # The well: a stone ring with a roof on two posts and its windlass.
    for side in (-1, 1):
        kit.block(module, (side * 1.2, -8.0, 0.9), (0.2, 0.2, 2.4), 'timber', bevel=0.02, wear=0.0, part=False)
    roof = kit.block(module, (0.0, -8.0, 3.3), (2.8, 1.2, 0.12), 'roof', bevel=0.0, wear=0.0, part=False)
    roof.rotation_euler = (0.5, 0.0, 0.0)
    roof = kit.block(module, (0.0, -8.0, 3.3), (2.8, 1.2, 0.12), 'roof', bevel=0.0, wear=0.0, part=False)
    roof.rotation_euler = (-0.5, 0.0, 0.0)
    kit.column(module, (-1.1, -8.0, 2.2), 0.12, 2.2, 'timber', sides=8, part=False).rotation_euler = (0.0, math.pi / 2,
                                                                                                    0.0)
    for at in ((-21.0, 21.0), (21.0, 21.0), (-22.0, -20.0), (22.0, -20.0)):
        kit.block(module, (at[0] + 2.0, at[1] + 1.5, 0.0), (0.9, 0.9, 5.0), 'stone', bevel=0.04, wear=0.06,
                  part=False)
    # A cart tipped by the east cottage, barrels by the west.
    cart = kit.block(module, (14.0, -12.0, 0.6), (2.6, 1.5, 0.5), 'timber', bevel=0.02, wear=0.02, part=False)
    cart.rotation_euler = (0.18, 0.0, 0.4)
    for wheel in (-1, 1):
        bk.bpy_ring(module, (14.0 + wheel * 0.9, -12.9, 0.55), 0.5, 0.06, material='timber')
    for barrel in range(5):
        kit.column(module, (-14.0 + (barrel % 3) * 0.75, -12.0 + (barrel // 3) * 0.75, 0.0), 0.35, 0.9, 'timber',
                   sides=10, part=False)
    for at, long, along_x in (((-15.0, 14.0), 5.0, True), ((15.0, 14.0), 5.0, True), ((-26.0, 0.0), 6.0, False)):
        bk.dry_wall(module, at, long, along_x, 0.8)
    rubble(module, (0.0, 0.0), 22.0, 14)


def timbered(module, west, south, east, north, toward):
    """A house's back as the green sees it: timber posts and braces over its plaster, a shuttered window between each
    two posts, and its eaves along the top."""
    along_x = toward[0] == 0.0
    length = (east - west) if along_x else (north - south)
    front = (north if toward[1] > 0 else south) if along_x else (east if toward[0] > 0 else west)
    out = toward[1] if along_x else toward[0]
    start = west if along_x else south

    def at(along, z):
        return (start + along, front + out * 0.06, z) if along_x else (front + out * 0.06, start + along, z)

    def size(long, tall):
        return (long, 0.14, tall) if along_x else (0.14, long, tall)

    posts = max(2, round(length / 3.0))
    for number in range(posts + 1):
        along = length * number / posts
        kit.block(module, at(along, 0.0), size(0.28, 9.0), 'timber', bevel=0.0, wear=0.0, part=False)
        if number < posts:
            middle = along + length / posts / 2
            kit.block(module, at(middle, 4.4), size(length / posts, 0.24), 'timber', bevel=0.0, wear=0.0, part=False)
            kit.block(module, at(middle, 5.6), size(1.1, 1.3), 'timber', bevel=0.0, wear=0.0, part=False)
            kit.block(module, at(middle, 1.6), size(1.0, 1.2), 'black', bevel=0.0, wear=0.0, part=False)
    eave = at(length / 2, 8.8)
    eave = (eave[0], eave[1] + out * 0.4, 8.8) if along_x else (eave[0] + out * 0.4, eave[1], 8.8)
    kit.block(module, eave, (length + 0.6, 0.9, 0.35) if along_x else (0.9, length + 0.6, 0.35), 'roof', bevel=0.0,
              wear=0.0, part=False)


def choir(module):
    """The chapel: its walls faced with pilasters and blind lancets, its pillars based and capitalled, pointed arcades
    from pillar to pillar down the nave and ribs across it, a rose in the head wall over the altar, the altar itself
    with its candles, the pews' backs, and the roof's fallen timbers."""
    for west, south, east, north, toward in ((-20.0, -32.0, -16.0, 36.0, (1.0, 0.0)), (16.0, -20.0, 20.0, 36.0, (-1.0, 0.0)),
                                             (-16.0, 36.0, 16.0, 38.0, (0.0, -1.0))):
        face(module, west, south, east, north, 0.0, 12.0, toward)
    columns = (-24.0, -12.0, 0.0, 12.0, 22.0)
    for x in (-10.0, 10.0):
        for y in columns:
            pillar(module, (x, y, 0.0), 0.75, 11.0)
        for first, second in zip(columns, columns[1:]):
            bk.arch(module, (x, (first + second) / 2, 8.2), (second - first) / 2 - 0.9, 1.0, 0.7, stones=8,
                    turn=math.pi / 2, pointed=True)
    for y in columns[1:-1]:
        bk.arch(module, (0.0, y, 11.0), 9.2, 0.8, 0.7, stones=12, pointed=True, broken=6)
    rose = (0.0, 35.7, 7.2)
    bk.arch(module, (rose[0], rose[1], rose[2] - 2.0), 2.2, 0.4, 0.35, stones=10)
    for spoke in range(8):
        angle = spoke * math.pi / 8
        bar = kit.block(module, (rose[0], rose[1], rose[2] - 2.0), (4.4, 0.12, 0.12), 'glow', bevel=0.0, wear=0.0,
                        part=False)
        bar.rotation_euler = (0.0, angle, 0.0)
    kit.block(module, (0.0, 32.6, 1.2), (4.0, 1.6, 1.1), 'trim', bevel=0.04, wear=0.02, part=False)
    kit.block(module, (0.0, 32.6, 2.3), (4.4, 1.9, 0.12), 'linen', bevel=0.0, wear=0.0, part=False)
    for candle in range(7):
        kit.column(module, (-1.6 + candle * 0.53, 32.4, 2.42), 0.05, 0.3 + (candle % 3) * 0.1, 'glow', sides=6,
                   part=False)
    for row_y in (-27.0, -15.0, -3.0, 5.0):
        for side in (-1, 1):
            kit.block(module, (side * 4.5, row_y + 0.45, 0.9), (5.0, 0.12, 0.6), 'timber', bevel=0.0, wear=0.0,
                      part=False)
    for _ in range(6):
        beam = kit.block(module, (module.draw(-9.0, 9.0), module.draw(-28.0, 18.0), 0.3), (0.5, module.draw(5.0, 9.0),
                                                                                        0.5), 'timber', bevel=0.0,
                         wear=0.0, part=False)
        beam.rotation_euler = (module.draw(-0.25, 0.25), module.draw(-0.1, 0.1), module.draw(0.0, math.pi))
    bk.drowned_floor(module, -15.0, -31.0, -11.0, 20.0)
    bk.drowned_floor(module, 11.0, -31.0, 15.0, 20.0)
    rubble(module, (-12.0, 16.0), 3.0, 5)
    rubble(module, (12.0, -18.0), 3.0, 5)


def ways(module, cells, half, house):
    """The Unlit Ways' houses: each roofed in a ridge of two pitches with a chimney, its doors bricked under arches and
    its windows shuttered; the streets cobbled at their crossings; the barricades braced."""
    for x, y in cells:
        for pitch in (-1, 1):
            roof = kit.block(module, (x, y + pitch * house / 4, 5.4), (house + 0.6, house / 2 + 0.5, 0.18), 'roof',
                             bevel=0.0, wear=0.0, part=False)
            roof.rotation_euler = (-pitch * 0.5, 0.0, 0.0)
        kit.block(module, (x + house / 4, y + house / 4, 5.6), (0.8, 0.8, 2.0), 'stone', bevel=0.03, wear=0.05,
                  part=False)
        for door in range(2):
            spot = (x + (door - 0.5) * 3.0, y - house / 2 - 0.12, 2.2)
            bk.arch(module, spot, 0.6, 0.2, 0.22, stones=5)
        for side in (-1, 1):
            kit.block(module, (x + side * (house / 2 + 0.05), y, 2.6), (0.12, 1.1, 1.2), 'timber', bevel=0.0, wear=0.0,
                      part=False)
    for column in range(1, 6):
        for row in range(1, 6):
            spot = (-half + 12.0 * column, -half + 12.0 * row, -0.04)
            kit.block(module, spot, (3.6, 3.6, 0.08), 'paving', turn=math.pi / 4, bevel=0.0, wear=0.0, part=False)


def stair(module, landings, size, steady):
    """The Broken Stair's rock hanging under each landing and steady slab, the stumps of a balustrade along the
    landings' edges, and chains hanging from them into the dark."""
    for west, top in landings:
        hanging(module, west, -size / 2, west + size, size / 2, top - 1.2, 7.0)
        for side in (-1, 1):
            for post in range(3):
                if module.draw() < 0.35:
                    continue
                kit.block(module, (west + 1.0 + post * 2.0, side * (size / 2 - 0.25), top), (0.3, 0.3,
                                                                                             module.draw(0.3, 1.0)),
                          'trim', bevel=0.02, wear=0.06, part=False)
        if module.draw() < 0.5:
            chain = kit.column(module, (west + module.draw(1.0, size - 1.0), -size / 2 - 0.1, top - 6.0), 0.04, 5.0,
                               'iron', sides=4, part=False)
            chain.rotation_euler = (module.draw(-0.05, 0.05), 0.0, 0.0)
    for x, y, top, slab in steady:
        hanging(module, x - slab / 2, y - slab / 2, x + slab / 2, y + slab / 2, top - 0.6, 3.5)


def hall(module):
    """The keep's hall: its walls faced and hung with the vale's crimson, its pillars based and capitalled, ribs across
    it, the Steward's Door at its head under a deep arch, and the Seam a shaft of crystal."""
    for west, south, east, north, toward in ((-24.0, -26.0, -20.0, -4.6, (1.0, 0.0)), (-24.0, 4.6, -20.0, 26.0, (1.0, 0.0)),
                                             (20.0, -26.0, 24.0, -4.6, (-1.0, 0.0)), (20.0, 4.6, 24.0, 26.0, (-1.0, 0.0))):
        face(module, west, south, east, north, 0.0, 12.0, toward, bay=5.0)
    for x in (-10.0, 10.0):
        for y in (-14.0, 14.0):
            pillar(module, (x, y, 0.0), 0.8, 11.0)
    for y in (-14.0, 14.0):
        bk.arch(module, (0.0, y, 11.0), 9.2, 0.9, 0.8, stones=12, pointed=True, broken=6)
    for side in (-1, 1):
        for y in (-18.0, 18.0):
            kit.block(module, (side * 19.85, y, 3.0), (0.06, 2.4, 6.0), 'crimson', bevel=0.0, wear=0.0, part=False)
            kit.block(module, (side * 19.8, y, 9.05), (0.14, 2.8, 0.12), 'iron', bevel=0.0, wear=0.0, part=False)
    bk.arch(module, (0.0, 25.8, 5.6), 3.4, 1.6, 1.0, stones=11)
    for side in (-1, 1):
        kit.block(module, (side * 3.9, 25.6, 0.0), (1.4, 1.4, 5.6), 'trim', bevel=0.04, wear=0.02, part=False)
    bk.shaft(module, (0.0, 0.0, 0.0), 1.7, 9.5, lesser=6)
    rubble(module, (-15.0, -20.0), 3.0, 6)
    rubble(module, (15.0, 20.0), 3.0, 6)


def shore(module, was):
    """A shore's dressing: as it was, a long table set before the hearth, benches, the floor's rugs, tapestries and lit
    sconces on faced walls; as it is, the same walls fallen to ragged tops, the table broken, rubble, and crystal."""
    for west, south, east, north, toward in ((-18.0, -14.0, -14.0, 14.0, (1.0, 0.0)), (14.0, -14.0, 18.0, 14.0, (-1.0, 0.0)),
                                             (-14.0, 14.0, 14.0, 18.0, (0.0, -1.0))):
        face(module, west, south, east, north, 0.0, 10.0, toward, lancets=was, ruin=0.0 if was else 0.7)
        if not was:
            bk.rock_face(module, west, south, east, north, 9.0, 11.5)
    table = kit.block(module, (0.0, 2.0, 0.75), (2.0, 7.0, 0.14), 'timber', bevel=0.02, wear=0.0, part=False)
    for corner_x in (-0.8, 0.8):
        for corner_y in (-3.0, 3.0):
            kit.block(module, (corner_x, 2.0 + corner_y, 0.0), (0.14, 0.14, 0.75), 'timber', bevel=0.0, wear=0.0,
                      part=False)
    for side in (-1, 1):
        bench = kit.block(module, (side * 1.6, 2.0, 0.45), (0.5, 6.0, 0.1), 'timber', bevel=0.0, wear=0.0, part=False)
        if not was:
            bench.rotation_euler = (0.0, side * 0.3, 0.1)
    if was:
        kit.block(module, (0.0, 2.0, 0.01), (5.0, 10.0, 0.02), 'crimson', bevel=0.0, wear=0.0, part=False)
        for x, y in ((-13.9, 6.0), (13.9, 6.0), (-13.9, -6.0), (13.9, -6.0)):
            kit.block(module, (x, y, 3.2), (0.12, 0.3, 0.5), 'glow', bevel=0.0, wear=0.0, part=False)
        for x in (-6.0, 6.0):
            kit.block(module, (x, 13.95, 2.5), (3.0, 0.06, 5.0), 'crimson', bevel=0.0, wear=0.0, part=False)
    else:
        table.rotation_euler = (0.0, 0.25, 0.08)
        rubble(module, (0.0, 0.0), 11.0, 16)


def court(module, radius):
    """The Steward's court over the dark: the rock it was torn from hanging under it, a broken balustrade's stumps round
    its rim, a throne's back grown into a crown of crystal, and its dais' edges banded in gold."""
    hanging(module, -radius * 0.8, -radius * 0.8, radius * 0.8, radius * 0.8, -3.0, 16.0)
    hanging(module, -3.0, -46.0, 3.0, -radius, -2.0, 4.0)
    for post in range(40):
        angle = post * math.tau / 40
        if module.draw() < 0.45 or abs(angle - 1.5 * math.pi) < 0.2:
            continue
        spot = (math.cos(angle) * (radius - 0.5), math.sin(angle) * (radius - 0.5), 0.0)
        kit.block(module, spot, (0.35, 0.35, module.draw(0.3, 1.1)), 'trim', turn=angle, bevel=0.02, wear=0.05,
                  part=False)
    kit.block(module, (0.0, 23.3, 5.6), (3.6, 0.6, 3.4), 'stone', bevel=0.05, wear=0.03, part=False)
    pick = latticekit.picker(module.random.randrange(1 << 30))
    for x in (-1.2, 0.0, 1.2):
        bk.crystal(module, pick, (x, 23.3, 8.8), count=3, length=2.4 if x == 0.0 else 1.6, radius=0.35)
    for sign in (-1, 1):
        kit.block(module, (0.0, 21.0 + sign * 3.02, 1.7), (12.0, 0.06, 0.12), 'gold', bevel=0.0, wear=0.0,
                  part=False)
    # Rings inlaid in the floor round where the Steward stands: gold within, the old vale's stone without.
    for reach, count, material in ((6.0, 32, 'gold'), (12.0, 48, 'trim'), (19.5, 72, 'trim')):
        for stone in range(count):
            angle = stone * math.tau / count
            long = math.tau * reach / count * 0.92
            kit.block(module, (math.cos(angle) * reach, math.sin(angle) * reach, -0.02), (0.35, long, 0.04), material,
                      turn=angle, bevel=0.0, wear=0.0, part=False)
