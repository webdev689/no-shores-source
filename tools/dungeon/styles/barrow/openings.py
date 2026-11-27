"""The barrow's openings. door.a is a trilithon, two orthostats under a cup-marked lintel, dry-stone walled to the
doorway's edges; door.b a corbelled doorway, dry-stone jambs whose top courses step in to a capstone. The portal is a
great trilithon whose lintel bears rings round its cups; the exit a dry-stone mouth under a lintel, its blocking slab
stood on end as one jamb. A doorway's room is toward -y; the portal's and the exit's toward +y.
"""
from styles.barrow.forms import drystone, marks, quartz, slab, upright
from styles.crypt.hidden import cull

HALF = 0.82
ROOM, CORRIDOR = -0.08, 0.38


def door_a(kit):
    """A trilithon: two orthostats under a lintel cup-marked on both faces, dry-stone walling either side and over
    it to the doorway's edges."""
    made = []
    for side in (-1, 1):
        made.append(upright(kit, 0.46, 0.42, 2.36, f'barrow.door.a {side}', at=(side * 1.07, 0.15, 0.0), sections=5,
                            points=8))
        near, far = sorted((side * 1.31, side * 1.6))
        made.append(drystone(kit, near, far, 0.0, 2.36, ROOM + 0.02, CORRIDOR - 0.02, f'barrow.door.a wall {side}'))
    made.append(slab(kit, -1.55, ROOM, 2.36, 1.55, CORRIDOR, 2.92, 'barrow.door.a lintel'))
    made.append(drystone(kit, -1.6, 1.6, 2.92, 3.34, ROOM + 0.02, CORRIDOR - 0.02, 'barrow.door.a over'))
    made.append(marks(kit, [(-0.9, ROOM, 2.62, 0), (-0.42, ROOM, 2.66, 1), (0.1, ROOM, 2.62, 2), (0.6, ROOM, 2.68, 0),
                            (1.05, ROOM, 2.6, 1)], (0.0, -1.0, 0.0), 'barrow.door.a'))
    made.append(marks(kit, [(-0.5, CORRIDOR, 2.64, 1), (0.45, CORRIDOR, 2.62, 0)], (0.0, 1.0, 0.0),
                      'barrow.door.a back'))
    return cull(kit.join(made, 'door.a'), floor=0.0)


def door_b(kit):
    """A corbelled doorway: dry-stone jambs, and over the way through three courses of slabs stepping in until a
    capstone closes it; a cup marked on the capstone's face."""
    made = []
    for side in (-1, 1):
        near, far = sorted((side * HALF, side * 1.58))
        made.append(drystone(kit, near, far, 0.0, 2.3, ROOM + 0.02, CORRIDOR - 0.02, f'barrow.door.b jamb {side}'))
        for number, (reach, low, high) in enumerate(((0.66, 2.3, 2.46), (0.46, 2.46, 2.62))):
            near, far = sorted((side * reach, side * 1.58))
            made.append(slab(kit, near, ROOM, low + 0.004, far, CORRIDOR, high, f'barrow.door.b corbel {side} {number}',
                             part='stoneAlt' if number else 'stone'))
    made.append(slab(kit, -1.0, ROOM - 0.02, 2.62, 1.0, CORRIDOR + 0.02, 2.94, 'barrow.door.b capstone'))
    made.append(drystone(kit, -1.58, 1.58, 2.94, 3.32, ROOM + 0.02, CORRIDOR - 0.02, 'barrow.door.b over'))
    made.append(marks(kit, [(0.0, ROOM - 0.02, 2.78, 2), (-0.6, ROOM - 0.02, 2.8, 0)], (0.0, -1.0, 0.0),
                      'barrow.door.b'))
    return cull(kit.join(made, 'door.b'), floor=0.0)


def portal(kit):
    """The return portal's trilithon: two great orthostats and a lintel whose face bears three cups ringed round,
    white quartz laid at the stones' feet."""
    made = []
    for side in (-1, 1):
        made.append(upright(kit, 0.5, 0.24, 2.45, f'barrow.portal {side}', at=(side * 0.99, 0.14, 0.0), sections=6,
                            points=10))
    made.append(slab(kit, -1.29, 0.0, 2.45, 1.29, 0.27, 3.08, 'barrow.portal lintel'))
    made.append(marks(kit, [(-0.75, 0.27, 2.76, 3), (0.0, 0.27, 2.78, 4), (0.75, 0.27, 2.76, 3)], (0.0, 1.0, 0.0),
                      'barrow.portal'))
    for side in (-1, 1):
        near, far = sorted((side * 0.74, side * 1.26))
        made += quartz(kit, (near, 0.04, far, 0.26), 6, f'barrow.portal {side}')
    return cull(kit.join(made, 'portal'), wall=0.0)


def exit_frame(kit):
    """A dry-stone mouth under a lintel, the slab that blocked it stood on end beside the way as its east jamb."""
    made = [drystone(kit, -1.28, -0.74, 0.0, 2.44, 0.0, 0.27, 'barrow.exit jamb')]
    # The blocking slab, dragged out of the way and stood on end as the east jamb, dry-stone packed over it.
    made.append(slab(kit, 0.76, 0.03, 0.0, 1.27, 0.25, 2.26, 'barrow.exit slab', part='stoneAlt'))
    made.append(drystone(kit, 0.74, 1.28, 2.26, 2.44, 0.0, 0.27, 'barrow.exit packing'))
    made.append(slab(kit, -1.29, 0.0, 2.44, 1.29, 0.28, 2.86, 'barrow.exit lintel'))
    made.append(drystone(kit, -1.29, 1.29, 2.86, 3.08, 0.0, 0.26, 'barrow.exit over'))
    made.append(marks(kit, [(1.02, 0.25, 1.3, 1), (1.0, 0.25, 0.7, 0)], (0.0, 1.0, 0.0), 'barrow.exit'))
    made.append(marks(kit, [(0.0, 0.28, 2.65, 1), (-0.6, 0.28, 2.66, 0)], (0.0, 1.0, 0.0), 'barrow.exit lintel'))
    return cull(kit.join(made, 'exit'), floor=0.0, wall=0.0)
