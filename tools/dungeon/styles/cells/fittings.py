"""The cells' pier, wall buttress, set pieces, beams and floor pieces, lean because a dungeon lays hundreds of them.

The pier and the buttress are cut to one section from base to capital, so their stretched shafts meet both ends
cleanly; shafts carry only what runs up them, and the faces where base, shaft and cap meet are left off. The beams
are one timber in all three variants, joined end to end by iron fishplates where they meet across a room.
"""
import details
from styles.cells import forge

# The pier's half width, and how far its iron corner angles reach along each face.
PIER = 0.28
ANGLE = 0.1
# The buttress's section, metres from the wall's face (x across, y out): rough, with a crack up its face.
BUTTRESS = [(-0.46, 0.0), (-0.46, 0.19), (-0.43, 0.232), (-0.24, 0.244), (-0.05, 0.236), (0.06, 0.243),
            (0.075, 0.214), (0.092, 0.241), (0.25, 0.247), (0.43, 0.231), (0.46, 0.198), (0.46, 0.0)]
# The iron tie bar up the buttress's face: x0, y0 (behind the face), x1, y1 (proud of it).
TIE = (0.19, 0.236, 0.26, 0.258)
UP = (0.0, 0.0, 1.0)
OUT = (0.0, 1.0, 0.0)


def _pier(kit, z0, z1):
    """The pier between z0 and z1: square dressed stone, its faces a little full, an iron angle on each corner; its
    ends left open for the piece above and below."""
    half, swell = PIER, 0.008
    outline = [(-half, -half), (0.0, -half - swell), (half, -half), (half + swell, 0.0), (half, half),
               (0.0, half + swell), (-half, half), (-half - swell, 0.0)]
    made = [kit.extrude_outline(outline, z0, z1, 'xy', part='stone', smooth=None)]
    angle = [(half - ANGLE, half), (half, half), (half, half - ANGLE), (half + 0.014, half - ANGLE),
             (half + 0.014, half + 0.014), (half - ANGLE, half + 0.014)]
    corner = kit.extrude_outline(angle, z0, z1, 'xy', part='iron', smooth=None)
    made += kit.array(corner, 4, turn=90.0)
    return forge.cull(kit.join(made, 'pier'), forge.on('z', z0, -1.0), forge.on('z', z1, 1.0))


def pillar_base(kit):
    """A chamfered plinth under the pier's foot, an iron ring on each face, one with a chain run out on the plinth."""
    made = [kit.bevelled_box(-0.46, -0.46, 0.0, 0.46, 0.46, 0.17, bevel=0.03, wear=0.012, seed='cells.pillar.plinth',
                             part='stoneAlt'),
            forge.taper(kit, (-0.43, -0.43, 0.17), (0.43, 0.43, 0.25), (-0.29, -0.29), (0.29, 0.29), part='stoneAlt'),
            _pier(kit, 0.25, 0.45)]
    ring, bottom = forge.staple_ring(kit, (0.0, PIER + 0.014, 0.4), radius=0.055, tube=0.011)
    back, _ = forge.staple_ring(kit, (0.0, PIER + 0.014, 0.4), radius=0.055, tube=0.011)
    made += [ring, kit.rotate_z(back, 180.0)]
    path = [bottom, (0.0, 0.315, 0.235), (0.05, 0.37, 0.205), (0.12, 0.43, 0.19), (0.2, 0.45, 0.185),
            (0.3, 0.44, 0.185)]
    made.append(forge.chain(kit, path, 0.11, 0.013))
    return forge.cull(kit.join(made, 'pillar.base'), forge.on('z', 0.0, -1.0), forge.on('z', 0.17, -1.0))


def pillar_shaft(kit):
    return _pier(kit, 0.0, 1.0)


def pillar_capital(kit):
    """A corbelled block capital: the pier rises into two splayed courses and a heavy abacus of two stones, bound by
    a riveted iron band."""
    made = [_pier(kit, 0.0, 0.1),
            forge.taper(kit, (-0.29, -0.29, 0.1), (0.29, 0.29, 0.24), (-0.38, -0.38), (0.38, 0.38), part='stoneAlt'),
            kit.box(-0.39, -0.39, 0.24, 0.39, 0.39, 0.28, part='stoneAlt'),
            forge.taper(kit, (-0.39, -0.39, 0.28), (0.39, 0.39, 0.4), (-0.47, -0.47), (0.47, 0.47), part='stone'),
            kit.bevelled_box(-0.53, -0.53, 0.4, 0.03, 0.53, 0.62, bevel=0.03, wear=0.012, seed='cells.capital.a',
                             part='stone'),
            kit.bevelled_box(0.04, -0.53, 0.4, 0.53, 0.53, 0.62, bevel=0.03, wear=0.012, seed='cells.capital.b',
                             part='stoneAlt')]
    for turn in (0, 90, 180, 270):
        band = forge.plate(kit, -0.54, 0.53, 0.47, 0.54, 0.542, 0.53, OUT,
                           [(x, 0.542, 0.5) for x in (-0.36, 0.0, 0.36)], 0.013)
        made.append(kit.rotate_z(band, turn))
    return forge.cull(kit.join(made, 'pillar.capital'), forge.on('z', 0.62, 1.0), forge.on('z', 0.24, -1.0),
                      forge.on('z', 0.28, -1.0), forge.on('z', 0.1, -1.0), forge.on('z', 0.24, 1.0),
                      forge.on('z', 0.28, 1.0), forge.on('z', 0.4, 1.0))


def _buttress(kit, z0, z1):
    """The buttress between z0 and z1, an iron tie bar run up its face; its ends left open for the pieces above and
    below."""
    item = kit.join([kit.extrude_outline(BUTTRESS, z0, z1, 'xy', part='stone', smooth=None),
                     forge.plate(kit, *TIE[:2], z0, *TIE[2:], z1, OUT)], 'buttress')
    return forge.cull(item, forge.on('z', z0, -1.0), forge.on('z', z1, 1.0))


def _wall_cull(item):
    return forge.cull(item, forge.on('y', 0.0, -1.0), forge.on('z', 0.0, -1.0))


def wall_base(kit):
    """The buttress's foot: a worn plinth, its weathered offset, and an iron ring with a broken length of chain."""
    made = [forge.slab(kit, (-0.56, 0.0, 0.0), (0.56, 0.3, 0.32), '+y', 0.03, 0.012, 'cells.wall.plinth', 'stoneAlt'),
            forge.taper(kit, (-0.54, 0.0, 0.32), (0.54, 0.29, 0.42), (-0.47, 0.0), (0.47, 0.246), part='stoneAlt'),
            _buttress(kit, 0.42, 0.95)]
    ring, bottom = forge.staple_ring(kit, (-0.18, 0.24, 0.84), radius=0.065, tube=0.012)
    made.append(ring)
    made.append(forge.chain(kit, [bottom, (-0.18, 0.262, 0.5)], 0.12, 0.012))
    made.append(forge.plate(kit, 0.17, 0.236, 0.42, 0.28, 0.262, 0.52, OUT, [(0.225, 0.262, 0.47)], 0.014))
    return forge.cull(_wall_cull(kit.join(made, 'wall.base')), forge.on('z', 0.32, -1.0))


def wall_shaft(kit):
    return _wall_cull(_buttress(kit, 0.0, 1.0))


def wall_cap(kit):
    """The buttress corbelled out under the ceiling to a stone head and the timber plate a beam bears on, with a hook
    under its head."""
    made = [_buttress(kit, 0.0, 0.12),
            forge.taper(kit, (-0.46, 0.0, 0.12), (0.46, 0.244, 0.3), (-0.5, 0.0), (0.5, 0.36), part='stoneAlt'),
            forge.taper(kit, (-0.5, 0.0, 0.3), (0.5, 0.36, 0.48), (-0.54, 0.0), (0.54, 0.5), part='stone'),
            kit.box(-0.56, 0.0, 0.48, 0.56, 0.55, 0.62, part='stoneAlt'),
            kit.box(-0.6, 0.0, 0.62, 0.6, 0.48, 0.72, part='wood'),
            forge.hook(kit, (0.0, 0.46, 0.48), drop=0.2, reach=0.07, radius=0.012, turn=90.0),
            forge.plate(kit, 0.17, 0.236, 0.02, 0.28, 0.262, 0.12, OUT, [(0.225, 0.262, 0.07)], 0.014)]
    return forge.cull(kit.join(made, 'wall.cap'), forge.on('y', 0.0, -1.0), forge.on('z', 0.72, 1.0),
                      forge.on('z', 0.12, -1.0), forge.on('z', 0.3, -1.0), forge.on('z', 0.3, 1.0),
                      forge.on('z', 0.48, 1.0))


def feature_a(kit):
    """Manacles on chains from a riveted wall plate over a stone bench, one pair hanging, one hung up on its peg;
    fetters on a ring at the wall's foot, and what is left of the last prisoner."""
    made = [forge.slab(kit, (-0.5, 0.0, 1.5), (0.5, 0.05, 2.08), '+y', 0.015, 0.008, 'cells.feature.a.slab',
                       'stoneAlt'),
            forge.plate(kit, -0.4, 0.05, 1.74, 0.4, 0.068, 1.9, OUT,
                        [(x, 0.068, z) for x in (-0.34, 0.0, 0.34) for z in (1.78, 1.86)], 0.013),
            forge.slab(kit, (-0.72, 0.0, 0.42), (0.72, 0.28, 0.5), '+y', 0.015, 0.006, 'cells.feature.a.bench',
                       'stone')]
    for x in (-0.55, 0.55):
        made.append(forge.taper(kit, (x - 0.08, 0.0, 0.18), (x + 0.08, 0.1, 0.42), (x - 0.08, 0.0),
                                (x + 0.08, 0.25), part='stoneAlt'))
    for x in (-0.3, 0.3):
        made.append(forge.ring(kit, (x, 0.1, 1.71), 0.035, 0.01, axis=(1.0, 0.0, 0.0), sides=8))
    made.append(forge.chain(kit, [(-0.3, 0.1, 1.68), (-0.3, 0.1, 1.1)], 0.12, 0.014))
    made.append(forge.cuff(kit, (-0.3, 0.1, 1.04), (1.0, 0.0, 0.0)))
    made.append(forge.chain(kit, details.sag_path((0.3, 0.1, 1.68), (0.52, 0.13, 1.62), 0.18, 8), 0.12, 0.014))
    made.append(forge.bar(kit, (0.54, 0.0, 1.62), (0.54, 0.17, 1.6), 0.012))
    made.append(forge.cuff(kit, (0.54, 0.13, 1.567), OUT))
    ring, bottom = forge.staple_ring(kit, (0.1, 0.0, 0.3), radius=0.05, tube=0.01)
    made.append(ring)
    made.append(forge.chain(kit, [bottom, (0.16, 0.12, 0.04), (0.34, 0.2, 0.04)], 0.12, 0.014))
    for x in (0.42, 0.58):
        made.append(forge.ring(kit, (x, 0.2, 0.014), 0.05, 0.012))
    made.append(forge.skull(kit, -0.4, 0.14, 0.5, turn=-35.0, tilt=12.0))
    made.append(forge.long_bone(kit, (-0.3, 0.24, 0.03), (0.06, 0.16, 0.028), 0.014))
    made.append(forge.long_bone(kit, (-0.66, 0.08, 0.026), (-0.38, 0.26, 0.03), 0.012))
    return _wall_cull(kit.join(made, 'feature.a'))


def _streak(kit, x, top, drop, width, seed):
    """A rust streak run down the wall from `top`, narrowing as it falls, wandering a little: from the bars above.
    One face, a hair proud of the wall."""
    draw = details.seeded(seed)
    left, right, steps = [], [], 5
    for step in range(steps + 1):
        share = step / steps
        middle = x + draw.uniform(-0.012, 0.012)
        half = width / 2 * (1 - 0.8 * share)
        z = top - drop * share
        left.append((middle - half, 0.004, z))
        right.append((middle + half, 0.004, z))
    faces = [forge.facing(forge.flat([left[k], right[k], right[k + 1], left[k + 1]]), OUT) for k in range(steps)]
    return kit.mesh(faces, 'iron', 'streak', None, closed=False)


def feature_b(kit):
    """A barred window high in the wall: a splayed embrasure narrowing to a dark slit, four bars on two flats, one
    bar bent out, the rust run down the wall from its sill, and the stones knocked loose below."""
    made = [forge.slab(kit, (-0.58, 0.0, 1.76), (0.58, 0.28, 1.9), '+y', 0.02, 0.012, 'cells.feature.b.sill',
                       'stoneAlt'),
            forge.slab(kit, (-0.62, 0.0, 2.54), (0.62, 0.26, 2.78), '+y', 0.025, 0.012, 'cells.feature.b.head'),
            forge.plate(kit, -0.07, 0.0, 1.9, 0.07, 0.004, 2.54, OUT)]
    for side in (-1, 1):
        jamb = forge.courses(kit, 0.36, 0.56, 0.0, 0.25, (0.3, 0.34), z0=1.9, wear=0.012, seed=f'cells.window.{side}',
                             parts=('stone', 'stoneAlt'), toward='+y')
        splay = kit.extrude_outline([(0.36, 0.0), (0.36, 0.22), (0.07, 0.0)], 1.9, 2.38, 'xy', part='stoneAlt',
                                    smooth=None)
        piece = kit.join(jamb + [splay])
        made.append(piece if side > 0 else kit.scale(piece, -1.0, 1.0, 1.0))
    made.append(forge.taper(kit, (-0.36, 0.0, 2.38), (0.36, 0.22, 2.54), (-0.36, 0.0), (0.36, 0.06),
                            part='stoneAlt'))
    for z in (2.06, 2.3):
        made.append(kit.box(-0.37, 0.115, z, 0.37, 0.155, z + 0.026, part='iron'))
    # Spikes along the sill's lip, so nobody climbs to the bars.
    made.append(kit.box(-0.5, 0.2, 1.9, 0.5, 0.24, 1.915, part='iron'))
    made += [kit.cone((x, 0.22, 1.915), (x, 0.22, 2.03), 0.016, 0.0, sides=4, part='iron', smooth=None)
             for x in (-0.44, -0.3, -0.16, -0.02, 0.12, 0.26, 0.4)]
    for x in (-0.24, -0.08, 0.24):
        made.append(forge.bar(kit, (x, 0.135, 1.9), (x, 0.135, 2.54), 0.017, sides=5, caps=False))
    made.append(forge.rod(kit, [(0.08, 0.135, 1.9), (0.08, 0.135, 2.06), (0.1, 0.17, 2.13), (0.115, 0.205, 2.19),
                                (0.1, 0.17, 2.25), (0.08, 0.135, 2.3), (0.08, 0.135, 2.54)], 0.017, sides=5,
                          caps=False))
    for number, (x, drop, width) in enumerate(((-0.24, 1.0, 0.07), (-0.07, 0.62, 0.05), (0.1, 1.16, 0.09),
                                               (0.27, 0.74, 0.05))):
        made.append(_streak(kit, x, 1.76, drop, width, f'cells.feature.b.streak.{number}'))
    for number, (x, y, size) in enumerate(((-0.2, 0.16, 0.12), (0.06, 0.2, 0.09), (0.3, 0.12, 0.1))):
        made.append(kit.rock(x, y, 0.0, (size, size * 0.9, size * 0.6), seed=f'cells.feature.b.rubble.{number}',
                             detail=0, roughness=0.2))
    return _wall_cull(kit.join(made, 'feature.b'))


def _beam(kit):
    """The one beam all three ceiling pieces share, with the fishplates that join it to its neighbours."""
    made = [forge.timber(kit, (-1.6, -0.14, -0.32), (1.6, 0.14, 0.0), 'x', chamfer=0.035, rough=0.008,
                         seed='cells.ceiling.beam')]
    for side in (-1, 1):
        made.append(kit.box(side * 1.43, -0.152, -0.334, side * 1.6, 0.152, 0.0, part='iron'))
        for y in (-0.152, 0.152):
            made.append(forge.rivets(kit, [(side * 1.515, y, z) for z in (-0.08, -0.25)], (0.0, y / 0.152, 0.0),
                                     0.018, 0.012))
        made.append(forge.rivets(kit, [(side * 1.515, 0.0, -0.334)], (0.0, 0.0, -1.0), 0.022, 0.014))
    return made


def _ceiling_cull(item):
    return forge.cull(item, forge.on('z', 0.0, 1.0), forge.on('x', -1.6, -1.0), forge.on('x', 1.6, 1.0))


def ceiling_a(kit):
    """The beam with three iron hooks hung from it on straps."""
    made = _beam(kit)
    for x, drop, turn in ((-0.78, 0.3, 0.0), (0.04, 0.42, 180.0), (0.72, 0.26, 90.0)):
        made.append(kit.box(x - 0.025, -0.15, -0.336, x + 0.025, 0.15, 0.0, part='iron'))
        made.append(forge.hook(kit, (x, 0.0, -0.33), drop=drop, reach=0.075, radius=0.012, turn=turn))
    return _ceiling_cull(kit.join(made, 'ceiling.a'))


def ceiling_b(kit):
    """The beam with a chain hung from an eye in it, an open manacle at its end."""
    made = _beam(kit)
    made.append(forge.ring(kit, (0.18, 0.0, -0.36), 0.035, 0.011, axis=(1.0, 0.0, 0.0), sides=8))
    made.append(kit.box(0.14, -0.04, -0.336, 0.22, 0.04, -0.318, part='iron'))
    made.append(forge.chain(kit, [(0.18, 0.0, -0.385), (0.18, 0.0, -0.69)], 0.13, 0.015))
    made.append(forge.cuff(kit, (0.18, 0.0, -0.73), (1.0, 0.0, 0.0), 0.045))
    return _ceiling_cull(kit.join(made, 'ceiling.b'))


def ceiling_c(kit):
    """The beam with a lantern hook: a strap round it, a drop rod and a broad hook."""
    made = _beam(kit)
    made.append(kit.box(-0.36, -0.155, -0.34, -0.28, 0.155, 0.0, part='iron'))
    made.append(forge.bar(kit, (-0.32, 0.0, -0.34), (-0.32, 0.0, -0.5), 0.014))
    made.append(forge.hook(kit, (-0.32, 0.0, -0.5), drop=0.18, reach=0.12, radius=0.014, turn=0.0))
    made.append(forge.rivets(kit, [(-0.32, y, -0.17) for y in (-0.155, 0.155)], (0.0, 1.0, 0.0), 0.018, 0.012))
    return _ceiling_cull(kit.join(made, 'ceiling.c'))


def _floor_cull(item):
    return forge.cull(item, forge.on('z', 0.0, -1.0))


def floor_a(kit):
    """An iron drain grate in a stone surround, its gutter run in from one side."""
    kerb = [(-0.46, -0.46, 0.3, -0.3), (0.3, -0.46, 0.46, 0.3), (-0.3, 0.3, 0.46, 0.46), (-0.46, -0.3, -0.3, 0.46)]
    made = [forge.taper(kit, (x0, y0, 0.0), (x1, y1, 0.034), (x0 + 0.015, y0 + 0.015), (x1 - 0.015, y1 - 0.015),
                        part='stoneAlt') for x0, y0, x1, y1 in kerb]
    made.append(forge.floor_plane(kit, -0.3, -0.3, 0.3, 0.3, z=0.003, part='iron', name='sump'))
    made += [kit.box(-0.3, side * 0.3 - 0.015, 0.0, 0.3, side * 0.3 + 0.015, 0.03, part='iron') for side in (-1, 1)]
    made += [kit.box(side * 0.3 - 0.015, -0.3, 0.0, side * 0.3 + 0.015, 0.3, 0.03, part='iron') for side in (-1, 1)]
    made += [kit.box(-0.29, y - 0.014, 0.008, 0.29, y + 0.014, 0.03, part='iron') for y in (-0.19, -0.095, 0.0,
                                                                                            0.095, 0.19)]
    made += [kit.box(x - 0.01, -0.29, 0.004, x + 0.01, 0.29, 0.016, part='iron') for x in (-0.12, 0.12)]
    made.append(forge.rivets(kit, [(x, y, 0.03) for x in (-0.3, 0.3) for y in (-0.3, 0.3)], UP, 0.018, 0.012))
    for side in (-1, 1):
        made.append(forge.taper(kit, (0.47, side * 0.1, 0.0), (1.45, side * 0.17, 0.022), (0.47, side * 0.1),
                                (1.45, side * 0.165), part='stoneAlt'))
    made.append(forge.floor_plane(kit, 0.46, -0.1, 1.45, 0.1, z=0.003, part='iron', name='gutter'))
    return _floor_cull(kit.join(made, 'floor.a'))


def floor_b(kit):
    """A worn trapdoor of planks bound by iron straps on hinges, a ring to lift it, in a stone curb."""
    curb = [(-0.66, -0.52, 0.56, -0.42), (0.56, -0.52, 0.66, 0.42), (-0.56, 0.42, 0.66, 0.52),
            (-0.66, -0.42, -0.56, 0.52)]
    made = [forge.taper(kit, (x0, y0, 0.0), (x1, y1, 0.03), (x0 + 0.012, y0 + 0.012), (x1 - 0.012, y1 - 0.012),
                        part='stoneAlt') for x0, y0, x1, y1 in curb]
    made.append(forge.boards(kit, (-0.555, -0.415, 0.0), (0.555, 0.415, 0.032), along='y', across='x', width=0.16,
                             split=0.03, seed='cells.trap.boards'))
    for y in (-0.24, 0.24):
        made.append(forge.plate(kit, -0.62, y - 0.035, 0.032, 0.5, y + 0.035, 0.04, UP,
                                [(x, y, 0.04) for x in (-0.3, 0.32)], 0.012))
        made.append(forge.bar(kit, (-0.62, y - 0.06, 0.024), (-0.62, y + 0.06, 0.024), 0.016, sides=5))
    made.append(kit.box(0.36, -0.04, 0.032, 0.46, 0.04, 0.038, part='iron'))
    made.append(forge.ring(kit, (0.44, 0.0, 0.042), 0.05, 0.007, sides=8))
    return _floor_cull(kit.join(made, 'floor.b'))
