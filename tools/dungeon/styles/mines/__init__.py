"""The mines: timber shoring, rails, ore and tools. A timber set stands on both walls of every cell (a post on its
sill, stretched to the room's height, under a bolster wedged to the roof) with a cap beam laid across, lagged over;
rails run along x the way a corridor runs. kit_pieces.py holds the sets, beams, pillars and doorways; fittings.py
the features, rails, sconce, portal and exit; landmarks.py the Lift Shaft; workings.py the Ore Cart and the Collapse.
"""
from . import fittings, kit_pieces, landmarks, workings


def build(kit):
    """Every module of the mines: {name: object}."""
    return {
        'door.a': kit_pieces.door_a(kit), 'door.b': kit_pieces.door_b(kit),
        'pillar.base': kit_pieces.pillar_base(kit), 'pillar.shaft': kit_pieces.pillar_shaft(kit),
        'pillar.capital': kit_pieces.pillar_capital(kit),
        'wall.base': kit_pieces.wall_base(kit), 'wall.shaft': kit_pieces.wall_shaft(kit),
        'wall.cap': kit_pieces.wall_cap(kit),
        'feature.a': fittings.feature_a(kit), 'feature.b': fittings.feature_b(kit),
        'ceiling.a': kit_pieces.ceiling_a(kit), 'ceiling.b': kit_pieces.ceiling_b(kit),
        'ceiling.c': kit_pieces.ceiling_c(kit),
        'floor.a': fittings.floor_a(kit), 'floor.b': fittings.floor_b(kit),
        'sconce': fittings.sconce(kit), 'portal': fittings.portal(kit), 'exit': fittings.exit_frame(kit),
        'mines.lift-shaft': landmarks.lift_shaft(kit), 'mines.ore-cart': workings.ore_cart(kit),
        'mines.collapse': workings.collapse(kit),
    }
