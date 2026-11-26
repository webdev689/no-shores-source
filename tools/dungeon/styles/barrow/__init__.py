"""The barrow's pieces, for the passages: ways and chambers lined with the grey-green stone no quarry on Saltmere
gives, upright slabs (orthostats) under great lintels, dry-stone walling between them, corbelled roofs in the rooms,
cup marks pecked in the stones, and niches for the grave goods laid with the dead.

Doors: a trilithon and a corbelled doorway; pillars and wall sets: orthostats under corbel courses; features: grave
goods' niche and a cup-and-ring slab; ceilings: a capstone, corbel rings, roots; floors: paving and a cist cover.
Landmarks: the Capstone Chamber, the Stone Ring and the Sealed Forecourt.
"""
import catalog
from styles.barrow import landmarks, openings, pieces
from styles.crypt.hidden import off_border


def build(kit):
    """Every barrow module: {piece or module name: object}."""
    makers = {
        'door.a': openings.door_a, 'door.b': openings.door_b, 'portal': openings.portal, 'exit': openings.exit_frame,
        'pillar.base': pieces.pillar_base, 'pillar.shaft': pieces.pillar_shaft,
        'pillar.capital': pieces.pillar_capital, 'wall.base': pieces.wall_base, 'wall.shaft': pieces.wall_shaft,
        'wall.cap': pieces.wall_cap, 'feature.a': pieces.feature_a, 'feature.b': pieces.feature_b,
        'ceiling.a': pieces.ceiling_a, 'ceiling.b': pieces.ceiling_b, 'ceiling.c': pieces.ceiling_c,
        'floor.a': pieces.floor_a, 'floor.b': pieces.floor_b, 'sconce': pieces.sconce,
    }
    found = {name: make(kit) for name, make in makers.items()}
    builders = {'barrow.capstone-chamber': landmarks.capstone_chamber, 'barrow.stone-ring': landmarks.stone_ring,
                'barrow.sealed-forecourt': landmarks.sealed_forecourt}
    for entry in catalog.landmarks_of('barrow'):
        found[entry['module']] = builders[entry['module']](kit, entry)
    return {name: off_border(item) for name, item in found.items()}
