"""The chalk's pieces, for the passages: cut chalk, white to cream, dark flint lying through it in bands, the shells
and urchins of a sea that once came this far inland set in its walls, the cutters' pick marks, the oak they propped
it with where it is cut, chalk dust and spoil underfoot, and a lamp hook for a sconce.

door.a is a timber door-set wedged into the cut, door.b the chalk cut to a low arch; the pillar is chalk left
standing under an oak head-board; the wall trio a prop on its sole-block under a head-plank; feature.a a face with
fossils in it, feature.b a cutter's niche; ceiling.a a head-tree, .b a band of chalk left uncut, .c lagging over a
crack; floor.a spoil, floor.b trodden dust; the portal a chequer of flint and chalk, the exit an adit's timbered
mouth. Landmarks: the Shell Bed, the Chalk Figure and the Fallen Shaft.
"""
import catalog
from styles.chalk import landmarks, openings, pieces
from styles.crypt.hidden import off_border


def build(kit):
    """Every chalk module: {piece or module name: object}."""
    makers = {
        'door.a': pieces.door_a, 'door.b': pieces.door_b, 'portal': openings.portal, 'exit': openings.exit_frame,
        'pillar.base': pieces.pillar_base, 'pillar.shaft': pieces.pillar_shaft,
        'pillar.capital': pieces.pillar_capital, 'wall.base': pieces.wall_base, 'wall.shaft': pieces.wall_shaft,
        'wall.cap': pieces.wall_cap, 'feature.a': pieces.feature_a, 'feature.b': pieces.feature_b,
        'ceiling.a': pieces.ceiling_a, 'ceiling.b': pieces.ceiling_b, 'ceiling.c': pieces.ceiling_c,
        'floor.a': pieces.floor_a, 'floor.b': pieces.floor_b, 'sconce': pieces.sconce,
    }
    found = {name: make(kit) for name, make in makers.items()}
    builders = {'chalk.shell-bed': landmarks.shell_bed, 'chalk.chalk-figure': landmarks.chalk_figure,
                'chalk.fallen-shaft': landmarks.fallen_shaft}
    for entry in catalog.landmarks_of('chalk'):
        found[entry['module']] = builders[entry['module']](kit, entry)
    return {name: off_border(item) for name, item in found.items()}
