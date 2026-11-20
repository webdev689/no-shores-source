"""The common kit's wreckage: pieces of a broken carvel-built hull (planks laid edge to edge on frames, a keel under
them), heeled and half sunk in sand, and what the sea threw up beside it: a mast, a crate, a barrel, planks and a gun.
Numbers are the module's frame: x east, y south, z up, metres; a hull's length runs along y, its front at -y.
"""
import math

import catalog
from shapes import out_from, sweep, facing, flat, sub

STRAKES = 7
HEEL = 16.0


def _size(module):
    return catalog.MODULES[module]['size']


def _section(beam, depth, share):
    """A point (x, z) `share` (0 at the keel, 1 at the rail) round one side of the hull's section."""
    angle = share * math.pi / 2
    return beam * math.sin(angle), depth * (1 - math.cos(angle))


def strake(beam_at, depth, low, high, ys, side, thick=0.07):
    """One strake (a run of planking) from `low` to `high` up the section, along the stations `ys`, on `side` (±1),
    `thick` thick, a closed run with its ends capped."""
    sections, middles = [], []
    for y in ys:
        beam = beam_at(y)
        (xa, za), (xb, zb) = _section(beam, depth, low), _section(beam, depth, high)
        inner = max(beam - thick, 0.02) / max(beam, 0.02)
        ring = [(side * xa, y, za), (side * xb, y, zb), (side * xb * inner, y, zb), (side * xa * inner, y, za)]
        sections.append(ring)
        middles.append(tuple(sum(point[axis] for point in ring) / 4 for axis in range(3)))
    faces = sweep(sections, outward=out_from(middles))
    faces.append(facing(flat(sections[0]), sub(middles[0], middles[1])))
    faces.append(facing(flat(sections[-1]), sub(middles[-1], middles[-2])))
    return faces


def hull(kit, module, beam_at, y0, y1, depth, seed, frames=6, torn=0.3, stem=None, transom=False):
    """A piece of hull from y0 to y1, its half-breadth beam_at(y): strakes of plank on both sides (a share `torn`
    of them broken short, so the frames show), frames standing above them, the keel, and with `stem` a stem post
    rising at y0, with `transom` a flat stern at y0. Heeled to port and sunk to its turn of the bilge in a bank of
    sand, then fitted to its size."""
    x, y, z = _size(module)
    draw = kit.seeded(seed)
    made = [kit.box(-0.13, y0 + 0.2, -0.3, 0.13, y1, 0.05, part='wood')]
    for side in (-1, 1):
        for number in range(STRAKES):
            low, high = number / STRAKES + 0.006, (number + 1) / STRAKES - 0.006
            start, end = y0, y1
            if draw.random() < torn and number > 1:
                if draw.random() < 0.5:
                    start = y0 + (y1 - y0) * draw.uniform(0.25, 0.6)
                else:
                    end = y1 - (y1 - y0) * draw.uniform(0.25, 0.6)
            ys = [start + (end - start) * k / 6 for k in range(7)]
            made.append(kit.mesh(strake(beam_at, depth, low, high, ys, side), 'plank' if number % 2 else 'wood',
                                 'strake', None))
    for number in range(frames):
        at = y0 + 0.4 + (y1 - y0 - 0.6) * number / max(frames - 1, 1)
        beam = beam_at(at) - 0.08
        rise = 1.0 + (0.12 if number % 2 else 0.0) - (0.35 if draw.random() < 0.3 else 0.0)
        for side in (-1, 1):
            points = [(side * px, at, pz) for px, pz in (_section(beam, depth, share / 5 * rise) for share in
                                                         range(6))]
            made.append(kit.tube(points, 0.07, sides=4, part='wood', smooth=None))
    if stem:
        made.append(kit.tube(kit.bent((0, y0 + 0.5, -0.2), (0, y0, depth * 1.1), (0, -0.5, 0), 4), 0.14, sides=5,
                             part='wood', smooth=None))
    if transom:
        made.append(kit.planks((-beam_at(y0), y0, depth * 0.15), (beam_at(y0), y0 + 0.1, depth * 1.05), along='x',
                               across='z', width=0.3, seed=f'{seed}.transom'))
    piece = kit.rotate(kit.join(made), -HEEL, 'y', (0, 0, 0))
    sand = kit.rock(0, 0, -0.8, (x, y * 0.86, 1.6), seed=f'{seed}.sand', detail=1, roughness=0.12, base=0.0,
                    part='sand', smooth=40.0)
    kit.fit(piece, (-x / 2 + 0.05, -y / 2, -0.8), (x / 2 - 0.3, y / 2, z))
    return kit.join([piece, sand])


def mast(kit, module):
    """A broken mast lying along y with its spar beside it, a torn sail over them and rope trailing off."""
    x, y, z = _size(module)
    made = [kit.tube([(0.1, -y / 2 + 0.2, 0.35), (0.05, y / 2 - 0.5, 0.4)], [0.32, 0.22], sides=7, part='wood')]
    made.append(kit.cone((0.1, -y / 2 + 0.25, 0.35), (0.25, -y / 2, 0.55), 0.18, 0.0, sides=4, part='wood',
                         smooth=None))
    made.append(kit.tube([(-0.38, -y / 2 + 2.5, 0.15), (-0.3, y / 2, 0.15)], 0.13, sides=6, part='wood'))
    sail = kit.drape(-2.6, 2.2, 0.55, -0.55, y=0.0, folds=5, depth=0.18, ragged=0.3, seed=f'{module}.sail')
    made.append(kit.translate(kit.rotate_z(kit.rotate(sail, 90, 'x'), 90), 0, -1.5, 0.05))
    made.append(kit.tube(kit.sag_path((0.4, 1.0, 0.6), (0.5, y / 2 - 0.1, 0.05), -0.2, 8), 0.04, sides=4, part='rope'))
    made.append(kit.tube(kit.sag_path((-0.2, -3.0, 0.6), (-0.55, -1.0, 0.05), -0.1, 6), 0.04, sides=4, part='rope'))
    piece = kit.join(made)
    return kit.fit(piece, (-x / 2, -y / 2, -0.1), (x / 2, y / 2, z))


def crate(kit, module):
    """A crate of planks on a frame of battens, its lid stove in on one side."""
    x, y, z = _size(module)
    h = x / 2
    made = [kit.planks((-h, -h, 0), (h, -h + 0.05, z * 0.95), along='z', across='x', width=0.24, seed='crate.n'),
            kit.planks((-h, h - 0.05, 0), (h, h, z * 0.95), along='z', across='x', width=0.24, seed='crate.s'),
            kit.planks((-h, -h, 0), (-h + 0.05, h, z * 0.95), along='z', across='y', width=0.24, seed='crate.w'),
            kit.planks((h - 0.05, -h, 0), (h, h, z * 0.95), along='z', across='y', width=0.24, seed='crate.e'),
            kit.planks((-h, -h, z - 0.05), (h * 0.2, h, z), along='y', across='x', width=0.24, seed='crate.lid')]
    for sx in (-1, 1):
        made.append(kit.box(sx * h - 0.04, -h - 0.02, 0, sx * h + 0.04 - 0.08 * sx, -h + 0.06, z, part='wood'))
    lid = kit.planks((h * 0.2, -h, z - 0.05), (h, h, z), along='y', across='x', width=0.24, seed='crate.loose')
    made.append(kit.rotate(lid, 25, 'y', (h * 0.2, 0, z - 0.05)))
    return kit.fit(kit.join(made), (-h, -y / 2, 0), (h, y / 2, z))


def barrel(kit, module):
    """A barrel standing, its staves bellied and bound with three iron hoops."""
    x, y, z = _size(module)
    r = x / 2 - 0.03
    profile = [(0.0, 0.0), (r * 0.82, 0.0), (r, z * 0.5), (r * 0.82, z), (0.0, z - 0.04)]
    made = [kit.lathe(profile, sides=14, part='plank', smooth=None)]
    for height in (0.12, 0.5, 0.88):
        reach = r * (0.82 + 0.18 * math.sin(math.pi * height)) + 0.012
        made.append(kit.ring((0, 0, z * height), reach, 0.025, sides=14, tube_sides=4))
    return kit.join(made)


def heap(kit, module):
    """A heap of broken planks and a frame or two, thrown up criss-cross."""
    x, y, z = _size(module)
    draw = kit.seeded(module)
    made = []
    for number in range(9):
        length, turn = draw.uniform(1.4, 2.6), draw.uniform(-70, 70)
        level = 0.04 * number
        board = kit.box(-length / 2, -0.11, level, length / 2, 0.11, level + 0.05, part='plank' if number % 3 else
                        'wood')
        made.append(kit.rotate_z(kit.translate(board, draw.uniform(-0.5, 0.5), draw.uniform(-0.6, 0.6)), turn))
    made.append(kit.rotate(kit.box(-1.0, -0.08, 0.2, 1.0, 0.08, 0.3, part='wood'), 12, 'x'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.05), (x / 2, y / 2, z))


def cannon(kit, module):
    """A fallen gun: its barrel along y, muzzle north, tipped off a broken carriage with one wheel."""
    x, y, z = _size(module)
    profile = [(0.0, 0.0), (0.2, 0.0), (0.24, 0.15), (0.2, 0.3), (0.17, 1.2), (0.14, 1.9), (0.17, 1.95),
               (0.06, 2.0)]
    gun = kit.lathe(profile, sides=10, part='iron', smooth=40.0)
    made = [kit.translate(kit.rotate(gun, 90 - 6, 'x'), 0, 0.85, 0.48)]
    made.append(kit.box(-0.32, 0.1, 0.0, -0.18, 1.3, 0.25, part='wood'))
    made.append(kit.rotate(kit.box(0.18, 0.2, 0.0, 0.32, 1.1, 0.25, part='wood'), 14, 'y', (0.25, 0, 0)))
    made.append(kit.cylinder((-0.4, 1.0, 0.18), (-0.3, 1.0, 0.18), 0.2, sides=10, part='wood'))
    return kit.fit(kit.join(made), (-x / 2, -y / 2, -0.1), (x / 2, y / 2, z))


def pieces(kit):
    """Every wreck piece of the common kit."""
    def bow_beam(at):
        return 2.0 * min(1.0, max(0.08, (at + 4.5) / 6.0)) ** 0.6

    return {
        'wreck.bow': hull(kit, 'common.wreck.bow', bow_beam, -4.5, 4.5, 3.6, 'bow', frames=6, stem=True),
        'wreck.stern': hull(kit, 'common.wreck.stern', lambda at: 2.0 - 0.25 * max(0.0, (-at - 1) / 3), -4.0, 4.0,
                            4.2, 'stern', frames=5, transom=True, torn=0.2),
        'wreck.ribs': hull(kit, 'common.wreck.ribs', lambda at: 2.1, -6.0, 6.0, 2.6, 'ribs', frames=8, torn=0.85),
        'wreck.mast': mast(kit, 'common.wreck.mast'),
        'wreck.crate': crate(kit, 'common.wreck.crate'),
        'wreck.barrel': barrel(kit, 'common.wreck.barrel'),
        'wreck.planks': heap(kit, 'common.wreck.planks'),
        'wreck.cannon': cannon(kit, 'common.wreck.cannon'),
    }
