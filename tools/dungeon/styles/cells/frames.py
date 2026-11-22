"""The cells' openings: the two doorway frames, the portal and the exit, and the torch's crude bracket.

A doorway's frame stands on both faces of the code's jambs (x ±0.9..±1.6, y 0..0.3), the room's face at y < 0 and the
corridor's mirrored past y 0.3; the opening under z 2.3 stays clear. The portal and the exit stand round the code's
face, y 0..0.3, everything inside x ±0.7 kept over z 2.4. Faces against the jambs, the wall and the floor are left
off.
"""
import details
from styles.cells import forge

# The two faces of a doorway: the room's and, mirrored across the jambs' middle, the corridor's.
JAMB_MIDDLE = 0.15
# How a door's room face is layered, metres along y: the stones' face, the iron over it (rivets stand past it).
STONE_Y = -0.1
IRON_Y = -0.11
FRONT = (0.0, -1.0, 0.0)
OUT = (0.0, 1.0, 0.0)


def _both_faces(kit, room_face):
    """The room's face, its mirror on the corridor's side, and both mirrored across the opening."""
    half = kit.join([room_face, kit.mirror(room_face, 'y', JAMB_MIDDLE)])
    return kit.join([half, kit.mirror(half, 'x')])


def _door_cull(kit, item):
    return forge.cull(item, forge.on('y', 0.0, 1.0), forge.on('y', 0.3, -1.0), forge.on('z', 0.0, -1.0))


def door_a(kit):
    """An iron-banded square frame, riveted, its reveal lined in iron, with a portcullis slot: the grille's spiked
    foot hangs out of the lintel's slot, running in grooves left down both jambs."""
    face = forge.courses(kit, 0.9, 1.36, STONE_Y, 0.0, (0.62, 0.74, 0.66, 0.78), wear=0.012, seed='cells.door.a',
                         parts=('stoneAlt', 'stone'), step=0.05)
    face.append(forge.slab(kit, (0.0, -0.095, 2.81), (1.42, 0.0, 3.18), '-y', 0.025, 0.01, 'cells.door.a.head',
                           'stoneAlt'))
    for z in (0.5, 1.42, 2.36):
        face.append(forge.plate(kit, 0.86, IRON_Y, z, 1.38, STONE_Y, z + 0.075, FRONT,
                                [(0.98, IRON_Y, z + 0.037), (1.25, IRON_Y, z + 0.037)]))
    # The head's band, a plate at its middle, and the corner plates where it meets the jambs.
    face.append(forge.plate(kit, 0.0, -0.105, 2.9, 1.42, -0.095, 2.98, FRONT,
                            [(0.34, -0.105, 2.94), (0.62, -0.105, 2.94), (1.14, -0.105, 2.94)], 0.01))
    face.append(forge.plate(kit, 0.0, -0.108, 2.86, 0.17, -0.105, 3.12, FRONT, [(0.11, -0.108, 2.9),
                                                                              (0.11, -0.108, 3.08)], 0.01))
    face.append(forge.plate(kit, 0.81, IRON_Y, 2.62, 0.98, STONE_Y, 3.04, FRONT, [(0.9, IRON_Y, 2.7)], 0.01))
    # The reveal's iron lining, stopping short of the jambs' middle where the portcullis groove runs.
    face.append(forge.plate(kit, 0.81, STONE_Y, 0.0, 0.9, 0.1, 2.8, (-1.0, 0.0, 0.0),
                            [(0.81, -0.04, z) for z in (0.3, 0.9, 1.5, 2.1, 2.6)], 0.01))
    face.append(forge.plate(kit, 0.0, STONE_Y, 2.755, 0.9, 0.1, 2.8, (0.0, 0.0, -1.0)))
    frame = _both_faces(kit, kit.join(face, 'door.a.face'))
    return _door_cull(kit, kit.join([frame, _portcullis(kit)], 'door.a'))


def _portcullis(kit):
    """The portcullis's foot, raised into its slot: square bars ending in spikes, two rails through them."""
    made = []
    for number in range(7):
        x = -0.69 + number * 0.23
        made.append(forge.plate(kit, x - 0.021, 0.129, 2.5, x + 0.021, 0.171, 2.8, (0.0, 0.0, -1.0)))
        made.append(kit.cone((x, 0.15, 2.5), (x, 0.15, 2.4), 0.03, 0.0, sides=4, part='iron', smooth=None))
    for z in (2.55, 2.72):
        made.append(forge.plate(kit, -0.9, 0.122, z, 0.9, 0.178, z + 0.05, (0.0, 0.0, 1.0),
                                [(-0.69 + number * 0.23, 0.122, z + 0.025) for number in range(7)], 0.01))
    return kit.join(made, 'portcullis')


def door_b(kit):
    """A frame under a hewn timber lintel with a barred grille over it, the gate's hinge pins and its hasp left in the
    stone."""
    face = forge.courses(kit, 0.86, 1.42, -0.09, 0.0, (0.88, 0.7, 0.74), wear=0.02, inset=0.03, seed='cells.door.b',
                         parts=('stone', 'stoneAlt'), step=0.08)
    face.append(forge.slab(kit, (0.86, -0.09, 2.32), (1.42, 0.0, 2.8), '-y', 0.03, 0.02, 'cells.door.b.top',
                           'stoneAlt'))
    face.append(forge.slab(kit, (0.0, -0.1, 2.8), (1.5, 0.0, 3.18), '-y', 0.03, 0.015, 'cells.door.b.head'))
    face.append(forge.plate(kit, 0.0, -0.11, 3.02, 1.5, -0.1, 3.1, FRONT, [(0.5, -0.11, 3.06), (1.2, -0.11, 3.06)],
                            0.012))
    # The grille's iron frame on the room's face, round the bars set back in the opening.
    face.append(forge.plate(kit, 0.0, -0.1, 2.76, 0.9, -0.06, 2.8, (0.0, 0.0, -1.0)))
    face.append(forge.plate(kit, 0.84, -0.1, 2.52, 0.9, -0.06, 2.76, (-1.0, 0.0, 0.0)))
    frame = _both_faces(kit, kit.join(face, 'door.b.face'))
    lintel = forge.timber(kit, (-1.1, -0.1, 2.32), (1.1, 0.4, 2.52), 'x', chamfer=0.04, rough=0.012,
                          seed='cells.door.b.lintel')
    bands = [kit.box(x - 0.04, -0.11, 2.31, x + 0.04, 0.41, 2.53, part='iron') for x in (-0.62, 0.62)]
    bands.append(forge.rivets(kit, [(x, -0.11, 2.42) for x in (-0.62, 0.62)], FRONT, 0.014, 0.009))
    return _door_cull(kit, kit.join([frame, lintel, bands, _grille(kit), _hinges(kit)], 'door.b'))


def _grille(kit):
    """The barred grille between the timber lintel and the stone over it, set in the opening's middle."""
    made = [forge.plate(kit, -0.9, 0.13, 2.52, 0.9, 0.17, 2.55, (0.0, 0.0, 1.0)),
            forge.plate(kit, -0.9, 0.13, 2.765, 0.9, 0.17, 2.8, (0.0, 0.0, -1.0)),
            kit.box(-0.9, 0.125, 2.645, 0.9, 0.175, 2.67, part='iron')]
    made += [forge.bar(kit, (x, 0.15, 2.55), (x, 0.15, 2.765), 0.016, caps=False) for x in
             (-0.72, -0.54, -0.36, -0.18, 0.0, 0.18, 0.36, 0.54, 0.72)]
    return kit.join(made, 'grille')


def _hinges(kit):
    """Two pintles on the left jamb's face, their straps' stubs, and a hasp's staple on the right with its lock."""
    made = []
    for z in (0.42, 1.98):
        made.append(forge.plate(kit, -1.02, -0.106, z - 0.035, -0.84, -0.09, z + 0.035, FRONT,
                                [(-0.97, -0.106, z), (-0.9, -0.106, z)], 0.01))
        made.append(forge.bar(kit, (-0.85, -0.106, z - 0.08), (-0.85, -0.106, z + 0.08), 0.013, sides=6))
    made.append(forge.rod(kit, [(0.88, -0.09, 1.16), (0.88, -0.11, 1.16), (0.88, -0.11, 1.06), (0.88, -0.09, 1.06)],
                          0.007))
    made.append(kit.box(0.855, -0.119, 0.94, 0.905, -0.097, 1.0, part='iron'))
    made.append(forge.rod(kit, [(0.865, -0.108, 1.0), (0.865, -0.108, 1.04), (0.88, -0.108, 1.07),
                                (0.895, -0.108, 1.04), (0.895, -0.108, 1.0)], 0.005))
    return kit.join(made, 'hinges')


def sconce(kit):
    """A crude iron bracket: a nailed strap, a bent arm and its strut, and a cup with two prongs and a curled foot
    under the code's flame."""
    made = [forge.slab(kit, (-0.045, 0.0, -0.36), (0.045, 0.014, -0.02), '+y', 0.006, part='iron'),
            forge.rivets(kit, [(0.0, 0.014, -0.06), (0.0, 0.014, -0.32)], OUT, 0.016, 0.012),
            forge.rod(kit, [(0.0, 0.012, -0.29), (0.0, 0.15, -0.255), (0.0, 0.27, -0.205), (0.0, 0.33, -0.165)],
                      0.012),
            forge.bar(kit, (0.0, 0.012, -0.09), (0.0, 0.3, -0.12), 0.007, sides=3),
            kit.frustum((0.0, 0.35, -0.16), (0.0, 0.35, -0.088), 0.024, 0.05, sides=6, part='iron', smooth=None)]
    for side in (-1, 1):
        made.append(forge.rod(kit, [(side * 0.05, 0.35, -0.09), (side * 0.064, 0.35, -0.04),
                                    (side * 0.084, 0.35, 0.0)], 0.0055, sides=3))
    made.append(forge.rod(kit, [(0.0, 0.35, -0.155), (0.0, 0.352, -0.19), (0.0, 0.335, -0.215), (0.0, 0.312, -0.208),
                                (0.0, 0.312, -0.186)], 0.007, sides=3))
    return forge.cull(kit.join(made, 'sconce'), forge.on('y', 0.0, -1.0))


# The portal's segmental arch: its half span, springing, rise and ring's depth, metres.
ARCH = {'half': 0.72, 'spring': 2.4, 'rise': 0.3, 'ring': 0.3}


def _spandrel(kit):
    """The stone filling the portal's right shoulder, from the arch's back to the iron frame."""
    back = [(x, z) for x, z in details.arch_curve(ARCH['half'], ARCH['spring'], 'segmental', ARCH['rise'],
                                                  segments=16, offset=ARCH['ring']) if x >= 0.15]
    outline = [(0.72, 2.4), (1.24, 2.4), (1.24, 3.04), (0.15, 3.04)] + sorted(back)
    return kit.extrude_outline(outline, 0.0, 0.17, 'xz', part='stone', smooth=None)


def portal(kit):
    """An iron-framed arch hung with chains: iron-clad stone posts, a segmental arch of voussoirs with an iron band
    under it and a grille in its head over the code's face, and chains swagged across it and hung down its posts."""
    post = forge.courses(kit, 0.74, 1.24, 0.0, 0.2, (0.55, 0.62, 0.58, 0.65), wear=0.012, seed='cells.portal',
                         parts=('stoneAlt', 'stone'), step=0.04, toward='+y')
    post.append(forge.plate(kit, 0.7, 0.0, 0.0, 0.74, 0.2, 2.4, (-1.0, 0.0, 0.0)))
    post.append(forge.plate(kit, 0.7, 0.2, 0.0, 0.86, 0.22, 2.4, OUT,
                            [(0.8, 0.22, z) for z in (0.25, 0.8, 1.35, 1.9)], 0.012))
    post.append(forge.plate(kit, 1.24, 0.0, 0.0, 1.28, 0.22, 3.04, (1.0, 0.0, 0.0)))
    post.append(_spandrel(kit))
    post.append(forge.plate(kit, 0.0, 0.0, 3.04, 1.28, 0.22, 3.1, (0.0, 0.0, 1.0)))
    half = kit.join(post, 'portal.post')
    made = [half, kit.mirror(half, 'x')]
    made.append(kit.arch(ARCH['half'], ARCH['spring'], ARCH['ring'], 0.0, 0.18, shape='segmental', rise=ARCH['rise'],
                         stones=7, joint=0.016, keystone=0.04, segments=14, part='stoneAlt', smooth=None))
    # The iron band under the voussoirs: the same circle, a little smaller.
    made.append(kit.arch(0.684, 2.4, 0.025, 0.0, 0.2, shape='segmental', rise=0.275, segments=10, part='iron',
                         smooth=None))
    made += [forge.bar(kit, (x, 0.08, 2.44), (x, 0.08, 2.75), 0.014, caps=False) for x in (-0.5, -0.25, 0.0, 0.25,
                                                                                         0.5)]
    made.append(kit.box(-0.7, 0.06, 2.41, 0.7, 0.1, 2.44, part='iron'))
    for side in (-1, 1):
        made.append(forge.ring(kit, (side * 1.0, 0.24, 2.95), 0.045, 0.012, axis=(1.0, 0.0, 0.0), sides=8))
        made.append(forge.chain(kit, [(side * 1.0, 0.246, 2.9), (side * 1.0, 0.246, 2.02)], 0.16, 0.018))
        made.append(forge.cuff(kit, (side * 1.0, 0.246, 1.95), (0.0, 1.0, 0.0), 0.05))
    made.append(forge.chain(kit, details.sag_path((-0.98, 0.246, 2.93), (0.98, 0.246, 2.93), 0.34, 12), 0.16, 0.018))
    return forge.cull(kit.join(made, 'portal'), forge.on('y', 0.0, -1.0), forge.on('z', 0.0, -1.0))


def exit_frame(kit):
    """A heavy timber frame bound in iron straps, bolted, in a rough stone surround; the iron bracket of its drop bar
    left empty and the bar leant against the wall beside it."""
    half = [forge.timber(kit, (0.72, 0.0, 0.0), (1.02, 0.25, 2.42), 'z', chamfer=0.035, rough=0.01,
                         seed='cells.exit.post')]
    half += forge.courses(kit, 1.02, 1.28, 0.0, 0.15, (0.7, 0.55, 0.75, 0.58, 0.47), wear=0.015, inset=0.025,
                          seed='cells.exit.surround', parts=('stoneAlt', 'stone'), step=0.06, toward='+y')
    for z in (0.3, 1.18, 2.02):
        half.append(forge.plate(kit, 0.7, 0.25, z, 1.04, 0.268, z + 0.09, OUT,
                                [(0.79, 0.268, z + 0.045), (0.95, 0.268, z + 0.045)], 0.016))
        half.append(forge.plate(kit, 0.7, 0.0, z, 0.72, 0.25, z + 0.09, (-1.0, 0.0, 0.0)))
    # The drop bar's empty bracket.
    half.append(forge.rod(kit, [(0.78, 0.25, 1.48), (0.78, 0.284, 1.48), (0.78, 0.284, 1.36), (0.95, 0.284, 1.36),
                                (0.95, 0.284, 1.48), (0.95, 0.25, 1.48)], 0.012))
    # The corner plate where the lintel sits on the post.
    half.append(forge.plate(kit, 0.7, 0.25, 2.3, 1.08, 0.266, 2.86, OUT,
                            [(0.8, 0.266, 2.5), (0.98, 0.266, 2.5), (0.98, 0.266, 2.76)], 0.016))
    side = kit.join(half, 'exit.side')
    made = [side, kit.mirror(side, 'x')]
    made.append(forge.timber(kit, (-1.12, 0.0, 2.42), (1.12, 0.26, 2.8), 'x', chamfer=0.04, rough=0.012,
                             seed='cells.exit.lintel'))
    made.append(forge.slab(kit, (-1.3, 0.0, 2.8), (1.3, 0.17, 3.08), '+y', 0.03, 0.015, 'cells.exit.head'))
    made.append(forge.plate(kit, -0.45, 0.26, 2.52, 0.45, 0.276, 2.7, OUT,
                            [(x, 0.276, 2.61) for x in (-0.36, -0.12, 0.12, 0.36)], 0.018))
    bar = forge.timber(kit, (-0.055, -0.045, 0.0), (0.055, 0.045, 1.95), 'z', chamfer=0.02, seed='cells.exit.bar')
    caps = [kit.box(-0.06, -0.05, z, 0.06, 0.05, z + 0.08, part='iron') for z in (0.06, 1.8)]
    leant = kit.join([bar, caps], 'exit.bar')
    kit.rotate(leant, -3.5, 'y')
    kit.translate(leant, 1.235, 0.23, 0.0)
    made.append(leant)
    return forge.cull(kit.join(made, 'exit'), forge.on('y', 0.0, -1.0), forge.on('z', 0.0, -1.0))
