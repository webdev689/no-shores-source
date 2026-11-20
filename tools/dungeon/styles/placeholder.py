"""Plain pieces any style can stand in with until its own are built: each kit piece a few boxes, arches and turned
shapes inside its envelope, and each landmark its floor, a box a solid and a marker a glow.
"""
import catalog

# The part a glow's marker wears, by glow kind (landmarks.json glowKinds).
GLOW_PARTS = ('ember', 'glow', 'crystal', 'glow', 'ember', 'fungus', 'glow', 'glow', 'water', 'glow')


def _pair(kit, x0, y0, z0, x1, y1, z1, part='stone'):
    """A box and its mirror across x = 0, joined."""
    first = kit.box(x0, y0, z0, x1, y1, z1, part=part)
    return kit.join([first, kit.mirror(first)])


def kit_pieces(kit):
    """Every kit piece, plain."""
    door_b_sides = _pair(kit, 0.85, 0.0, 0.0, 1.6, 0.3, 2.3)
    exit_arch = kit.arch(0.75, 2.5, 0.2, 0.0, 0.18, shape='segmental', rise=0.3, part='trim')
    return {
        'door.a': kit.join([_pair(kit, 0.85, -0.12, 0.0, 1.6, 0.42, 2.3),
                            kit.box(-1.6, -0.1, 2.3, 1.6, 0.4, 2.8, part='trim')]),
        'door.b': kit.join([door_b_sides, kit.arch(0.85, 2.3, 0.2, 0.0, 0.3, stones=7, keystone=0.03)]),
        'pillar.base': kit.join([kit.bevelled_box(-0.5, -0.5, 0.0, 0.5, 0.5, 0.25, part='trim'),
                                 kit.box(-0.33, -0.33, 0.25, 0.33, 0.33, 0.4)]),
        'pillar.shaft': kit.cylinder((0, 0, 0), (0, 0, 1), 0.3),
        'pillar.capital': kit.join([kit.cone((0, 0, 0), (0, 0, 0.45), 0.3, 0.55, part='trim'),
                                    kit.box(-0.6, -0.6, 0.45, 0.6, 0.6, 0.6, part='trim')]),
        'wall.base': kit.bevelled_box(-0.6, 0.0, 0.0, 0.6, 0.25, 0.45, part='trim'),
        'wall.shaft': kit.box(-0.45, 0.0, 0.0, 0.45, 0.18, 1.0),
        'wall.cap': kit.box(-0.7, 0.0, 0.0, 0.7, 0.35, 0.4, part='trim'),
        'feature.a': kit.stones(-0.6, 0.6, 0.0, 1.8, 0.0, 0.25, alt=0.25),
        'feature.b': kit.join([kit.box(-0.35, 0.0, 0.0, 0.35, 0.3, 0.8, part='trim'),
                               kit.lathe([(0, 0), (0.1, 0), (0.14, 0.2), (0.06, 0.35), (0.09, 0.4), (0, 0.4)],
                                         0.0, 0.15, 0.8, part='bone')]),
        'ceiling.a': kit.cone((0, 0, 0), (0, 0, -0.3), 0.3, 0.08, part='relief'),
        'ceiling.b': kit.box(-1.6, -0.15, -0.3, 1.6, 0.15, 0.0, part='wood'),
        'ceiling.c': kit.lathe([(0, 0), (0.12, 0.1), (0.2, 0.4), (0.25, 0.5)], z=-0.5, part='iron'),
        'floor.a': kit.bevelled_box(-1.2, -1.2, 0.0, 1.2, 1.2, 0.03, bevel=0.01, part='floor'),
        'floor.b': kit.planks((-0.6, -0.6, 0.0), (0.6, 0.6, 0.03)),
        'sconce': kit.join([kit.box(-0.06, 0.0, -0.25, 0.06, 0.03, 0.05, part='iron'),
                            kit.box(-0.02, 0.03, -0.17, 0.02, 0.29, -0.13, part='iron'),
                            kit.box(-0.06, 0.29, -0.15, 0.06, 0.41, -0.07, part='iron')]),
        'portal': kit.join([_pair(kit, 0.75, 0.0, 0.0, 1.05, 0.18, 2.6, part='trim'),
                            kit.box(-1.05, 0.0, 2.6, 1.05, 0.18, 2.9, part='trim')]),
        'exit': kit.join([_pair(kit, 0.75, 0.0, 0.0, 1.05, 0.18, 2.5, part='trim'), exit_arch]),
    }


def _glow(kit, landmark, x, y, z, kind):
    """A glow's marker: a small block over a solid, or a patch on the floor (under the walk zone) where none is."""
    part = GLOW_PARTS[int(kind)]
    if any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1, _ in landmark['solids']):
        return kit.box(x - 0.05, y - 0.05, z - 0.05, x + 0.05, y + 0.05, z + 0.05, part=part)
    return kit.box(x - 0.15, y - 0.15, 0.02, x + 0.15, y + 0.15, 0.04, part=part)


def landmark(kit, entry):
    """A landmark, plain: its floor over the whole footprint, a stone box a solid and a marker a glow."""
    width, depth = (cells * catalog.CELL_M for cells in entry['cells'])
    made = [kit.box(0.0, 0.0, 0.0, width, depth, 0.02, part='floor')]
    made += [kit.box(x0, y0, 0.02, x1, y1, top) for x0, y0, x1, y1, top in entry['solids']]
    made += [_glow(kit, entry, *glow) for glow in entry['glows']]
    return kit.join(made)


def build(kit, style):
    """Every module of a style, plain: {name: object}."""
    found = kit_pieces(kit)
    for entry in catalog.landmarks_of(style):
        found[entry['module']] = landmark(kit, entry)
    return found
