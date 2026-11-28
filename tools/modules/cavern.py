"""The cavern chamber: the hollow under a coven's or a cave's roof, 28 m square in a hollow of 20 m reach and under
7 m of headroom. Its entry at its -y side is left open to the tunnel; a rock shelf 2.2 m high along its back is
climbed by worn steps at its west end, a way kept clear to them from the entry, with the coven's dolmen, its stones and
a cauldron on it; two columns of dripstone stand floor to roof, stalagmites crowd its sides and boulders give cover in
its middle, under stalactites. Every natural form is `kit.organic` rock: merged, cragged and decimated, never a plain
cone.
"""
import math

import kit

HALF_M = 14.0
SHELF = (6.0, 2.2)
# The roof's underside, metres: what hangs from it starts inside the roof.
ROOF_M = 7.4
# What nothing stands in, as (west, south, east, north) in Blender's frame: the lane from the entry to the middle,
# and the way across from it to the foot of the shelf's steps and up them.
CLEAR = ((-4.5, -HALF_M, 4.5, 2.0), (-HALF_M, -0.8, 4.5, 2.8), (-HALF_M, -0.8, -HALF_M + 5.0, SHELF[0]))


def clear_of_ways(at, reach):
    return all(at[0] < west - reach or at[0] > east + reach or at[1] < south - reach or at[1] > north + reach
               for west, south, east, north in CLEAR)


def dripstone(module, at, radius, height, hanging=False, part=True):
    """A stalagmite of drips stacked one on another, each narrower, or with `hanging` a stalactite down from `at`."""
    blobs = []
    rings = max(4, round(height / (radius * 0.9)))
    for ring in range(rings):
        share = ring / rings
        wide = radius * (1.0 - share) ** 1.2 + 0.08
        rise = height * (share + 0.5 / rings)
        drift = (module.draw(-0.15, 0.15) * radius, module.draw(-0.15, 0.15) * radius)
        z = at[2] - rise if hanging else at[2] + rise
        # Each drip reaches well into the next, so they read as one tapering column with bumps, not a stack.
        blobs.append(((at[0] + drift[0], at[1] + drift[1], z), (wide, wide * module.draw(0.85, 1.15), height / rings * 1.7)))
    voxel = max(0.07, radius / 7)
    item = kit.organic(module, blobs, module.draw(0, 99), voxel=voxel, rough=radius * 0.18,
                       triangles=round(80 + 110 * height), flat_foot=-0.2 if not hanging else -99.0)
    # Its foot as wide as it is drawn, then its shaft: a body meets the rock where it is seen.
    if part and not hanging and height > 1.0:
        for reach, top in ((radius * 0.85, height * 0.3), (radius * 0.5, height * 0.75)):
            module.part((at[0] - reach, at[1] - reach, at[2]), (at[0] + reach, at[1] + reach, at[2] + top))
    return item


def build(module):
    # The shelf along the back: boulders merged into one ledge, cut flat where it is walked, sunk into the floor.
    # Each boulder's middle set back from the shelf's front so its flat top's lip meets the shelf's part at
    # SHELF[0]: a body steps from the stairs onto rock it sees.
    blob_y, blob_z, blob_rz = 4.4, 0.9, 2.0
    lip = blob_y * math.sqrt(1.0 - ((SHELF[1] - blob_z) / blob_rz) ** 2)
    blobs = []
    x = -HALF_M - 0.5
    while x < HALF_M + 0.5:
        reach = module.draw(2.6, 3.6)
        blobs.append(((x, SHELF[0] + lip, blob_z), (reach, blob_y, blob_rz)))
        x += reach * 1.3
    kit.organic(module, blobs, module.draw(0, 99), voxel=0.22, rough=0.45, triangles=3600, flat_top=SHELF[1],
                flat_foot=-0.3)
    module.part((-HALF_M, SHELF[0], 0.0), (HALF_M, HALF_M, SHELF[1]))
    steps = 7
    kit.stair(module, (-HALF_M + 3.0, SHELF[0] - steps * 0.6, 0.0), (0, 1), 3.0, SHELF[1] / steps, 0.6, steps,
              material='stone', wear=0.1)
    # On the shelf: the dolmen, its ring of small stones, and the cauldron by it.
    top = SHELF[1]
    for side in (-1, 1):
        kit.block(module, (4.0 + side * 1.1, 10.0, top), (0.6, 1.4, 1.1), 'stone', bevel=0.1, wear=0.1, cuts=1)
    kit.block(module, (4.0, 10.0, top + 1.1), (3.2, 2.0, 0.35), 'stone', bevel=0.12, wear=0.12, cuts=2)
    for stone in range(5):
        angle = math.tau * stone / 5 + 0.3
        at = (4.0 + math.cos(angle) * 3.4, 10.0 + math.sin(angle) * 2.6, top)
        kit.rock(module, at, (0.6, 0.5, module.draw(0.9, 1.5)), module.draw(0, 99), 'stone')
    kit.column(module, (-1.5, 9.5, top), 0.65, 0.75, 'iron', sides=12, top=1.15, wear=0.0)
    # The two columns, floor to roof, waisted where the dripstone met.
    for at in ((-7.5, -5.0), (8.0, 4.0)):
        widths = (2.0, 1.6, 1.2, 0.9, 0.8, 0.95, 1.3, 1.8, 2.2)
        blobs = [((at[0] + module.draw(-0.2, 0.2), at[1] + module.draw(-0.2, 0.2), ROOF_M * step / 8),
                  (width, width * 0.9, 1.4)) for step, width in enumerate(widths)]
        kit.organic(module, blobs, module.draw(0, 99), voxel=0.14, rough=0.25, triangles=1800, flat_foot=-0.2)
        module.part((at[0] - 1.6, at[1] - 1.6, 0.0), (at[0] + 1.6, at[1] + 1.6, 1.4))
        module.part((at[0] - 1.0, at[1] - 1.0, 0.0), (at[0] + 1.0, at[1] + 1.0, ROOF_M))
    # Stalagmites crowding the sides and round the columns, clear of the lane and the steps.
    placed = 0
    while placed < 12:
        at = (module.draw(-HALF_M + 1.0, HALF_M - 1.0), module.draw(-HALF_M + 1.0, SHELF[0] - 1.0))
        radius = module.draw(0.35, 0.9)
        if not clear_of_ways(at, radius):
            continue
        if abs(at[0]) < 9.0 and module.draw() < 0.6:
            continue
        dripstone(module, (*at, 0.0), radius, radius * module.draw(2.5, 4.5))
        placed += 1
    # Boulders for cover in the middle third, either side of the lane.
    for side in (-1, 1):
        for number in range(2):
            size = (module.draw(0.9, 1.3), module.draw(0.8, 1.1), module.draw(0.6, 0.9))
            at = (side * module.draw(6.5, 10.0), module.draw(-10.0, -3.0))
            if not clear_of_ways(at, size[0] * 1.6):
                continue
            blobs = [((at[0], at[1], size[2] * 0.6), size), ((at[0] + size[0] * 0.5, at[1], size[2] * 0.4),
                                                              (size[0] * 0.6, size[1] * 0.7, size[2] * 0.7))]
            kit.organic(module, blobs, module.draw(0, 99), voxel=0.1, rough=0.18, triangles=500, flat_foot=-0.1)
            module.part((at[0] - size[0], at[1] - size[1], 0.0), (at[0] + size[0] * 1.3, at[1] + size[1], size[2] * 1.2))
    # Stalactites over all of it, none lower than 4.2 m.
    for number in range(14):
        at = (module.draw(-HALF_M, HALF_M), module.draw(-HALF_M, HALF_M))
        dripstone(module, (*at, ROOF_M + 0.3), module.draw(0.3, 0.75), module.draw(1.2, ROOF_M - 4.2 + 0.3),
                  hanging=True, part=False)
    # Rubble strewn on the floor.
    for number in range(16):
        at = (module.draw(-HALF_M, HALF_M), module.draw(-HALF_M, SHELF[0]))
        kit.rock(module, (*at, -0.05), (module.draw(0.3, 0.8),) * 2 + (module.draw(0.15, 0.35),), module.draw(0, 99),
                 part=False, detail=1)
    module.socket('entry', (0.0, -HALF_M, 0.0), (0, -1))
    module.socket('shelf', (4.0, 8.0, SHELF[1]), (0, 1))
