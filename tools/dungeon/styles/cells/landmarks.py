"""The cells' three landmarks, built to their solids and glows in content/dungeon/landmarks.json, each drawing its
own floor over its whole footprint. Below 2.2 m everything stands over a solid (grown 0.05): a body is stopped by the
solid whatever stands on it, so the timber and iron that reach out stay inside the boxes until they are overhead.
"""

import details
import shapes
from shapes import add, mul, unit
from styles.cells import forge

DIAGONAL = unit((1.0, 1.0, 0.0))


def _kerb(kit):
    """The pit's coping: eight worn blocks round the opening, 0.14 high."""
    spans = [(0.5, 0.9), (0.9, 1.6), (1.6, 2.3), (2.3, 2.7)]
    made = []
    for number, (a0, a1) in enumerate(spans):
        for side, (b0, b1) in enumerate(((0.5, 0.9), (2.3, 2.7))):
            part = 'stoneAlt' if (number + side) % 2 else 'stone'
            made.append(kit.bevelled_box(a0 + 0.006, b0, 0.0, a1 - 0.006, b1, 0.14, bevel=0.025, wear=0.01,
                                         seed=f'cells.oubliette.kerb.{number}.{side}', part=part))
            if 0 < number < 3:
                made.append(kit.bevelled_box(b0, a0 + 0.006, 0.0, b1, a1 - 0.006, 0.14, bevel=0.025, wear=0.01,
                                             seed=f'cells.oubliette.kerb.y{number}.{side}', part=part))
    return made


def _pit(kit):
    """The shaft under the grate: its walls, a ledge part-way down, and bones heaped on its floor."""
    low, high, bottom = 0.9, 2.3, -2.6
    walls = []
    for x0, y0, x1, y1 in ((low, low, high, low), (high, low, high, high), (high, high, low, high),
                           (low, high, low, low)):
        walls.append([(x0, y0, 0.0), (x1, y1, 0.0), (x1, y1, bottom), (x0, y0, bottom)])
    faces = [shapes.facing(shapes.flat(ring), shapes.sub((1.6, 1.6, -1.0), ring[0])) for ring in walls]
    made = [kit.mesh(faces, 'stone', 'pit', None, closed=False),
            forge.floor_plane(kit, low, low, high, high, z=bottom)]
    for z, part in ((-0.62, 'stoneAlt'), (-1.55, 'stoneAlt')):
        made += [kit.box(low, low, z, high, low + 0.05, z + 0.12, part=part),
                 kit.box(low, high - 0.05, z, high, high, z + 0.12, part=part),
                 kit.box(low, low, z, low + 0.05, high, z + 0.12, part=part),
                 kit.box(high - 0.05, low, z, high, high, z + 0.12, part=part)]
    for x, y, turn in ((1.25, 1.35, 30.0), (1.95, 1.9, 200.0), (1.5, 2.05, 110.0)):
        made.append(forge.skull(kit, x, y, bottom, turn=turn, tilt=20.0, jaw=False))
    bones = [((1.0, 1.1), (1.6, 1.4)), ((1.3, 1.9), (2.1, 1.6)), ((1.7, 1.1), (2.2, 1.5)), ((1.0, 2.1), (1.4, 1.6)),
             ((1.9, 1.2), (1.4, 1.8)), ((2.15, 2.15), (1.65, 2.2))]
    for number, ((x0, y0), (x1, y1)) in enumerate(bones):
        lift = 0.03 + 0.03 * (number % 3)
        made.append(forge.long_bone(kit, (x0, y0, bottom + lift), (x1, y1, bottom + lift + 0.04), 0.016))
    return made


def _grate(kit):
    """An iron lattice on the coping, a hatch in it thrown open for the rope, its padlock hanging from the hasp."""
    made = [kit.box(0.82, 0.82, 0.14, 2.38, 0.9, 0.18, part='iron'), kit.box(0.82, 2.3, 0.14, 2.38, 2.38, 0.18,
                                                                              part='iron'),
            kit.box(0.82, 0.9, 0.14, 0.9, 2.3, 0.18, part='iron'), kit.box(2.3, 0.9, 0.14, 2.38, 2.3, 0.18,
                                                                           part='iron')]
    hatch = (1.3, 1.9)
    for at in (1.1, 1.3, 1.9, 2.1):
        made.append(kit.box(at - 0.018, 0.9, 0.14, at + 0.018, 2.3, 0.175, part='iron'))
        made.append(kit.box(0.9, at - 0.018, 0.145, 2.3, at + 0.018, 0.17, part='iron'))
    for at in (1.5, 1.7):
        for a0, a1 in ((0.9, hatch[0]), (hatch[1], 2.3)):
            made.append(kit.box(at - 0.018, a0, 0.14, at + 0.018, a1, 0.175, part='iron'))
            made.append(kit.box(a0, at - 0.018, 0.145, a1, at + 0.018, 0.17, part='iron'))
    made.append(forge.rivets(kit, [(x, y, 0.18) for x in (0.86, 2.34) for y in (0.86, 1.6, 2.34)], (0.0, 0.0, 1.0),
                             0.018, 0.012))
    leaf = [kit.box(hatch[0], hatch[0], 0.0, hatch[1], hatch[0] + 0.04, 0.035, part='iron'),
            kit.box(hatch[0], hatch[1] - 0.04, 0.0, hatch[1], hatch[1], 0.035, part='iron'),
            kit.box(hatch[0], hatch[0], 0.0, hatch[0] + 0.04, hatch[1], 0.035, part='iron'),
            kit.box(hatch[1] - 0.04, hatch[0], 0.0, hatch[1], hatch[1], 0.035, part='iron')]
    leaf += [kit.box(hatch[0], at - 0.015, 0.005, hatch[1], at + 0.015, 0.03, part='iron') for at in (1.5, 1.7)]
    leaf.append(kit.box(1.55, hatch[1], 0.0, 1.65, hatch[1] + 0.06, 0.02, part='iron'))
    door = kit.join(leaf, 'hatch')
    # Hinged on its north edge and thrown back past upright, leaning on its stop.
    kit.rotate(door, 105.0, 'x', about=(0.0, hatch[0], 0.0))
    kit.translate(door, 0.0, 0.0, 0.175)
    made.append(door)
    made += [kit.cylinder((x - 0.05, hatch[0], 0.18), (x + 0.05, hatch[0], 0.18), 0.018, sides=6, part='iron')
             for x in (1.38, 1.82)]
    made.append(kit.bevelled_box(1.56, hatch[1] + 0.03, 0.08, 1.64, hatch[1] + 0.06, 0.17, bevel=0.008,
                                 part='iron'))
    made.append(forge.rod(kit, [(1.575, hatch[1] + 0.045, 0.17), (1.575, hatch[1] + 0.045, 0.2),
                                (1.6, hatch[1] + 0.045, 0.22), (1.625, hatch[1] + 0.045, 0.2),
                                (1.625, hatch[1] + 0.045, 0.17)], 0.006))
    return made


def _winch(kit):
    """The timber windlass over the pit: two posts at opposite corners, a drum on a diagonal axle, rope wound on it
    and paid out down the shaft, a crank turned up out of reach."""
    made = []
    for corner in (0.5, 2.7):
        made.append(kit.bevelled_box(corner - 0.19, corner - 0.19, 0.0, corner + 0.19, corner + 0.19, 0.16,
                                     bevel=0.03, wear=0.012, seed=f'cells.oubliette.pad.{corner}', part='stoneAlt'))
        made.append(forge.timber(kit, (corner - 0.14, corner - 0.14, 0.16), (corner + 0.14, corner + 0.14, 2.62), 'z',
                                 chamfer=0.03, rough=0.012, seed=f'cells.oubliette.post.{corner}'))
        made += [kit.box(corner - 0.15, corner - 0.15, z, corner + 0.15, corner + 0.15, z + 0.06, part='iron')
                 for z in (0.3, 2.3)]
        inward = 1.0 if corner < 1.6 else -1.0
        foot = (corner + inward * 0.1, corner + inward * 0.1, 1.72)
        head = (corner + inward * 0.62, corner + inward * 0.62, 2.36)
        made.append(forge.bar(kit, foot, head, 0.055, sides=6, part='wood'))
    axle_from, axle_to = (0.3, 0.3, 2.47), (2.86, 2.86, 2.47)
    made.append(forge.bar(kit, axle_from, axle_to, 0.06, sides=10, part='wood'))
    middle = (1.6, 1.6, 2.47)
    made.append(kit.cylinder(add(middle, mul(DIAGONAL, -0.34)), add(middle, mul(DIAGONAL, 0.34)), 0.15, sides=12,
                             part='wood'))
    made += [kit.ring(add(middle, mul(DIAGONAL, side * 0.34)), 0.152, 0.014, axis=DIAGONAL, sides=12, tube_sides=4,
                      part='iron') for side in (-1, 1)]
    made.append(forge.rope_along(kit, forge.coil(middle, DIAGONAL, 0.17, 5.5, 0.6, steps=9), 0.021))
    leave = add(middle, (-0.17 * DIAGONAL[1], 0.17 * DIAGONAL[0], 0.0))
    made.append(forge.rope_along(kit, [leave, (leave[0], leave[1], 0.4), (leave[0], leave[1], -1.9)], 0.021))
    made.append(forge.hook(kit, (leave[0], leave[1], -1.9), drop=0.22, reach=0.08, radius=0.013))
    made.append(forge.bar(kit, axle_from, (axle_from[0], axle_from[1], 2.86), 0.02))
    made.append(forge.bar(kit, (axle_from[0], axle_from[1], 2.86), (0.12, 0.12, 2.86), 0.028, part='wood'))
    return made


def _kerb_things(kit):
    """What the gaoler leaves on the coping: the pail that takes the prisoner's food down, and spare rope."""
    made = forge.pail(kit, 0.72, 2.48, 0.14)
    spiral = details.helix((2.46, 0.74, 0.158), 0.13, 2.5, 0.006, steps=10, radius_end=0.05)
    made.append(forge.rope_along(kit, spiral, 0.016))
    return made


def oubliette(kit):
    """A grated pit in the floor under a timber windlass, the rope run down into the dark."""
    made = [forge.floor_plane(kit, 0.0, 0.0, 3.2, 3.2, holes=[(0.9, 0.9, 2.3, 2.3)])]
    made += _kerb(kit) + _pit(kit) + _grate(kit) + _winch(kit) + _kerb_things(kit)
    return kit.join(made, 'cells.oubliette')
