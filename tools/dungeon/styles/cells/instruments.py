"""The Gibbets and the Rack: the prison's instruments, timber and iron, built to their solids in landmarks.json.

Under 2.2 m everything stands inside a solid grown by 0.05: the gibbets' platform and cages inside the cages' box,
the rack, its stool and its bucket inside the rack's, the irons inside the brazier's.
"""
import math

from shapes import add, mul
from styles.cells import forge

# A gibbet cage's shape: (radius, height over its foot), a body's outline, narrow at the feet and full at the
# shoulders, closing over the head.
CAGE = [(0.11, 0.0), (0.2, 0.18), (0.27, 0.55), (0.3, 0.95), (0.32, 1.32), (0.27, 1.62), (0.17, 1.8), (0.05, 1.9)]
# The heights (indices into CAGE) its hoops go round.
HOOPS = (1, 3, 4, 5)
BARS = 10


def _around(x, y, z0, turn, index):
    radius, height = CAGE[index]
    return (x + radius * math.cos(turn), y + radius * math.sin(turn), z0 + height)


def _arc(kit, x, y, z0, index, start, end, steps):
    """A hoop's arc at CAGE[index], from `start` to `end` radians round."""
    path = [_around(x, y, z0, start + (end - start) * step / steps, index) for step in range(steps + 1)]
    return forge.rod(kit, path, 0.012, sides=4)


def _bar(kit, x, y, z0, turn):
    return forge.rod(kit, [_around(x, y, z0, turn, index) for index in range(len(CAGE))], 0.011, sides=4)


def cage(kit, x, y, z0, door=0.0):
    """A gibbet cage with its foot at z0, hung from the ring over its head; with `door` (degrees), its front swung
    open on its hinge by that much."""
    turns = [math.radians(18 + 36 * number) for number in range(BARS)]
    hinge, latch = math.radians(54), math.radians(126)
    shut = [turn for turn in turns if not (hinge < turn <= latch + 1e-6)] if door else turns
    made = [_bar(kit, x, y, z0, turn) for turn in shut]
    leaf = []
    for index in HOOPS:
        if door:
            made.append(_arc(kit, x, y, z0, index, latch, hinge + 2 * math.pi, 16))
            leaf.append(_arc(kit, x, y, z0, index, hinge, latch, 4))
        else:
            made.append(_arc(kit, x, y, z0, index, 0.0, 2 * math.pi, 20))
    made.append(kit.cylinder((x, y, z0 - 0.02), (x, y, z0 + 0.012), 0.13, sides=10, part='iron'))
    made.append(kit.ring((x, y, z0 + 1.93), 0.04, 0.012, axis=(1.0, 0.0, 0.0), sides=10, tube_sides=4, part='iron'))
    if door:
        leaf += [_bar(kit, x, y, z0, turn) for turn in turns if hinge < turn <= latch + 1e-6]
        open_leaf = kit.join(leaf, 'cage.door')
        pivot = _around(x, y, z0, hinge, 4)
        made.append(kit.rotate_z(open_leaf, -door, about=(pivot[0], pivot[1])))
    return made


def _skeleton(kit, x, y, z0):
    """What is left of a prisoner, slumped in a cage: skull dropped forward, spine, ribs, arms and legs."""
    made = [forge.skull(kit, x + 0.02, y + 0.05, z0 + 1.56, turn=10.0, tilt=40.0),
            forge.rod(kit, [(x, y - 0.05, z0 + 1.55), (x, y - 0.08, z0 + 1.25), (x + 0.01, y - 0.06, z0 + 0.95),
                            (x + 0.02, y - 0.02, z0 + 0.8)], 0.02, sides=5, part='bone'),
            kit.bevelled_box(x - 0.13, y - 0.06, z0 + 0.72, x + 0.13, y + 0.06, z0 + 0.84, bevel=0.03, part='bone')]
    for number in range(5):
        level = z0 + 1.46 - number * 0.07
        reach = 0.13 - number * 0.008
        for side in (-1, 1):
            path = [(x + side * reach * math.sin(math.pi * step / 6), y - 0.07 + reach * 1.1 *
                     (1 - math.cos(math.pi * step / 6)) * 0.55, level - 0.03 * step / 6) for step in range(7)]
            made.append(forge.rod(kit, path, 0.008, sides=4, part='bone'))
    for side in (-1, 1):
        shoulder = (x + side * 0.17, y - 0.04, z0 + 1.45)
        elbow = (x + side * 0.2, y + 0.04, z0 + 1.15)
        made.append(forge.long_bone(kit, shoulder, elbow, 0.013))
        made.append(forge.long_bone(kit, elbow, (x + side * 0.12, y + 0.12, z0 + 0.92), 0.01))
        knee = (x + side * 0.12, y + 0.16, z0 + 0.55)
        made.append(forge.long_bone(kit, (x + side * 0.1, y, z0 + 0.8), knee, 0.016))
        made.append(forge.long_bone(kit, knee, (x + side * 0.07, y + 0.02, z0 + 0.06), 0.013))
    return made


def _platform(kit):
    """The low stone dais the cages hang over, laid in four slabs, and a drain in it."""
    made = []
    edges = (1.02, 2.1, 3.25, 4.32, 5.38)
    for number, (x0, x1) in enumerate(zip(edges, edges[1:])):
        made.append(kit.bevelled_box(x0 + 0.006, 0.92, 0.0, x1 - 0.006, 2.28, 0.12, bevel=0.025, wear=0.008,
                                     seed=f'cells.gibbets.slab.{number}', part='stoneAlt'))
    made += [kit.box(2.62, y - 0.012, 0.118, 2.96, y + 0.012, 0.134, part='iron') for y in (2.0, 2.06, 2.12, 2.18)]
    return made


def _gallows(kit):
    """Two posts on stone pads, a beam over them on knee braces, and an eye for each cage's chain."""
    made = []
    for x in (0.55, 5.85):
        made.append(kit.bevelled_box(x - 0.24, 1.21, 0.0, x + 0.24, 1.99, 0.2, bevel=0.03, wear=0.01,
                                     seed=f'cells.gibbets.pad.{x}', part='stone'))
        made.append(forge.timber(kit, (x - 0.15, 1.42, 0.2), (x + 0.15, 1.78, 2.98), 'z', chamfer=0.03, rough=0.012,
                                 seed=f'cells.gibbets.post.{x}'))
        made.append(kit.box(x - 0.16, 1.41, 0.32, x + 0.16, 1.79, 0.38, part='iron'))
        inward = 1.0 if x < 3.2 else -1.0
        made.append(forge.bar(kit, (x + inward * 0.12, 1.6, 2.27), (x + inward * 0.62, 1.6, 2.76), 0.06, sides=6,
                              part='wood'))
        made.append(kit.box(x - 0.16, 1.41, 2.66, x + 0.16, 1.79, 2.74, part='iron'))
        made.append(forge.rivets(kit, [(x, 1.79, 2.7)], (0.0, 1.0, 0.0), 0.02, 0.014))
    made.append(forge.timber(kit, (0.32, 1.45, 2.74), (6.08, 1.75, 3.06), 'x', chamfer=0.035, rough=0.012,
                             seed='cells.gibbets.beam'))
    return made


def gibbets(kit):
    """A timber gallows frame with three iron cages hung from it, one swung open, over a low stone dais: one cage
    still holds its prisoner, another his skull, and the open one has let its bones fall."""
    made = [forge.floor_plane(kit, 0.0, 0.0, 6.4, 3.2)] + _platform(kit) + _gallows(kit)
    for x, z0, door in ((1.75, 0.42, 0.0), (3.2, 0.36, 80.0), (4.65, 0.5, 0.0)):
        hung = kit.join(cage(kit, x, 1.6, z0, door), 'cage')
        top = z0 + 1.93
        made.append(hung)
        made.append(kit.ring((x, 1.6, 2.72), 0.035, 0.011, axis=(0.0, 1.0, 0.0), sides=10, tube_sides=4,
                             part='iron'))
        made.append(forge.chain(kit, [(x, 1.6, 2.69), (x, 1.6, top + 0.03)], 0.11, 0.013))
    made += _skeleton(kit, 4.65, 1.6, 0.5)
    made.append(forge.skull(kit, 1.78, 1.6, 0.43, turn=160.0, tilt=10.0, jaw=False))
    made.append(forge.long_bone(kit, (1.62, 1.5, 0.47), (1.88, 1.72, 0.5), 0.014))
    made.append(forge.skull(kit, 3.45, 2.12, 0.12, turn=-40.0, tilt=25.0))
    made += [forge.long_bone(kit, start, end, 0.015) for start, end in (
        ((3.0, 2.0, 0.145), (3.42, 1.86, 0.15)), ((3.62, 1.96, 0.15), (3.82, 2.22, 0.145)),
        ((3.2, 1.65, 0.38), (3.36, 1.98, 0.15)))]
    return kit.join(made, 'cells.gibbets')


def _rack_frame(kit):
    """The rack's timber: four legs, two rails, stretchers and a slatted bed."""
    made = []
    for x in (0.78, 3.32):
        for y in (1.1, 2.1):
            made.append(forge.timber(kit, (x - 0.07, y - 0.07, 0.0), (x + 0.07, y + 0.07, 0.96), 'z', chamfer=0.02,
                                     rough=0.008, seed=f'cells.rack.leg.{x}.{y}'))
        made.append(forge.timber(kit, (x - 0.05, 1.1, 0.2), (x + 0.05, 2.1, 0.3), 'y', chamfer=0.015,
                                 seed=f'cells.rack.cross.{x}'))
    for y in (1.1, 2.1):
        made.append(forge.timber(kit, (0.66, y - 0.065, 0.66), (3.44, y + 0.065, 0.82), 'x', chamfer=0.02, rough=0.01,
                                 seed=f'cells.rack.rail.{y}'))
        made.append(forge.timber(kit, (0.85, y - 0.04, 0.2), (3.25, y + 0.04, 0.28), 'x', chamfer=0.012,
                                 seed=f'cells.rack.stretcher.{y}'))
        made += [kit.box(x - 0.03, y - 0.075, 0.64, x + 0.03, y + 0.075, 0.83, part='iron') for x in (1.3, 2.1, 2.9)]
    made.append(forge.boards(kit, (1.25, 1.165, 0.73), (2.85, 2.035, 0.78), along='y', across='x', width=0.17,
                             gap=0.05, split=0.02, seed='cells.rack.bed'))
    return made


def _roller(kit, x, ropes_toward):
    """A roller across the rack's end, rope wound on it and run out to two iron cuffs on the bed."""
    made = [kit.cylinder((x, 0.97, 0.86), (x, 2.23, 0.86), 0.085, sides=10, part='wood')]
    made += [kit.bevelled_box(x - 0.07, y0, 0.79, x + 0.07, y1, 0.93, bevel=0.012, part='wood')
             for y0, y1 in ((0.93, 1.02), (2.18, 2.27))]
    made.append(forge.rope_along(kit, forge.coil((x, 1.6, 0.86), (0.0, 1.0, 0.0), 0.105, 4.5, 0.5, steps=9), 0.02))
    for y in (1.43, 1.77):
        start = (x, y, 0.965)
        end = (x + ropes_toward * 0.5, y, 0.84)
        made.append(forge.rope_along(kit, [start, end], 0.018))
        made.append(forge.cuff(kit, (end[0] + ropes_toward * 0.05, y, 0.82), (0.0, 0.0, 1.0), 0.05))
    return made


def _capstan(kit):
    """The foot roller's crossed capstan bars, and the head roller's ratchet wheel with its pawl."""
    made = []
    for angle in (30.0, 120.0):
        along = (math.cos(math.radians(angle)), 0.0, math.sin(math.radians(angle)))
        made.append(forge.bar(kit, add((3.12, 2.225, 0.86), mul(along, -0.5)), add((3.12, 2.225, 0.86),
                                                                                   mul(along, 0.5)), 0.022, sides=6,
                              part='wood'))
    made.append(kit.cylinder((0.98, 0.9, 0.86), (0.98, 0.93, 0.86), 0.15, sides=16, part='iron'))
    for tooth in range(12):
        turn = math.radians(tooth * 30.0)
        tip = (0.98 + 0.18 * math.cos(turn), 0.915, 0.86 + 0.18 * math.sin(turn))
        made.append(kit.cone((0.98 + 0.14 * math.cos(turn), 0.915, 0.86 + 0.14 * math.sin(turn)), tip, 0.022,
                             sides=3, part='iron', smooth=None))
    made.append(forge.bar(kit, (0.78, 0.9, 1.05), (0.95, 0.9, 1.03), 0.016))
    return made


def _stool(kit):
    """A three-legged stool at the rack's foot, a pair of pincers left on it."""
    made = [kit.cylinder((3.76, 1.16, 0.42), (3.76, 1.16, 0.47), 0.16, sides=10, part='wood')]
    for number in range(3):
        turn = math.radians(90 + number * 120)
        foot = (3.76 + 0.2 * math.cos(turn), 1.16 + 0.2 * math.sin(turn), 0.0)
        top = (3.76 + 0.1 * math.cos(turn), 1.16 + 0.1 * math.sin(turn), 0.43)
        made.append(forge.bar(kit, foot, top, 0.022, sides=5, part='wood'))
    made.append(forge.rod(kit, [(3.62, 1.08, 0.48), (3.76, 1.16, 0.485), (3.9, 1.12, 0.48)], 0.008))
    made.append(forge.rod(kit, [(3.62, 1.2, 0.48), (3.76, 1.15, 0.485), (3.9, 1.22, 0.48)], 0.008))
    return made


def _brazier(kit):
    """An iron brazier on three legs, coals glowing in it, three irons heating, flames licking up."""
    x, y = 5.1, 1.6
    made = [kit.lathe([(0.0, 0.78), (0.14, 0.8), (0.25, 0.88), (0.3, 1.0), (0.27, 1.0), (0.22, 0.92), (0.12, 0.89),
                       (0.0, 0.88)], x, y, 0.0, sides=14, part='iron')]
    for number in range(3):
        turn = math.radians(30 + number * 120)
        out = (math.cos(turn), math.sin(turn), 0.0)
        made.append(forge.rod(kit, [add((x, y, 0.84), mul(out, 0.2)), add((x, y, 0.4), mul(out, 0.25)),
                                    add((x, y, 0.06), mul(out, 0.27)), add((x, y, 0.02), mul(out, 0.3))], 0.02,
                              sides=5))
    made.append(kit.ring((x, y, 0.36), 0.245, 0.01, sides=14, tube_sides=4, part='iron'))
    for number, (dx, dy, size) in enumerate(((-0.1, -0.06, 0.11), (0.08, -0.1, 0.1), (0.1, 0.07, 0.12),
                                             (-0.06, 0.1, 0.1), (0.0, 0.0, 0.13), (-0.16, 0.03, 0.08),
                                             (0.15, -0.02, 0.08), (0.03, 0.16, 0.08))):
        made.append(kit.rock(x + dx, y + dy, 0.9, size, seed=f'cells.rack.coal.{number}', detail=0,
                             roughness=0.3, part='ember'))
    for number, (dx, dy, high) in enumerate(((0.0, 0.0, 1.34), (-0.08, 0.05, 1.2), (0.07, -0.05, 1.24),
                                             (0.05, 0.08, 1.15))):
        made.append(kit.cone((x + dx, y + dy, 0.96), (x + dx * 1.3, y + dy * 1.3, high), 0.06, 0.0, sides=5,
                             part='glow', smooth=None))
    irons = (((5.04, 1.55, 0.95), (5.36, 1.84, 1.4)), ((5.16, 1.58, 0.95), (4.82, 1.33, 1.42)),
             ((5.1, 1.7, 0.96), (5.22, 1.9, 1.38)))
    for number, (start, end) in enumerate(irons):
        made.append(forge.bar(kit, start, end, 0.01))
        grip = add(end, mul((end[0] - start[0], end[1] - start[1], end[2] - start[2]), -0.25))
        made.append(forge.bar(kit, grip, end, 0.022, sides=6, part='wood'))
    made.append(kit.ring((5.04, 1.55, 0.97), 0.035, 0.008, axis=(0.7, -0.7, 0.0), sides=8, tube_sides=3,
                         part='iron'))
    return made


def rack(kit):
    """A torture rack: a timber frame and slatted bed, rollers at both ends wound with rope run to iron cuffs, a
    capstan and a ratchet; a stool and a bucket by it, and a brazier with irons in its coals."""
    made = [forge.floor_plane(kit, 0.0, 0.0, 6.4, 3.2)] + _rack_frame(kit) + _roller(kit, 0.98, 1.0)
    made += _roller(kit, 3.12, -1.0) + _capstan(kit) + _stool(kit) + forge.pail(kit, 2.05, 1.62) + _brazier(kit)
    return kit.join(made, 'cells.rack')
