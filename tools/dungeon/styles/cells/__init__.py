"""The cells: the prison, iron and grime. Every piece is cut square and heavy, bound and riveted in iron, hung with
chains and bars; timber carries the ceilings and the instruments.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand at a great room's corners, the shaft
stretched between them; wall.base/.shaft/.cap make a buttress on every 3rd wall cell of rooms and corridors;
feature.a/.b are a room's one set piece against its wall; ceiling.a/.b/.c are beams on every cell, across the narrower
way; floor.a/.b are drains, one a room; sconce holds a torch's flame; portal and exit frame the code's faces; stair.head
stands over a flight's head and foot, stair.side runs down its walls and balustrade rails a gallery over its hall.
Landmarks: the Oubliette, the Gibbets and the Rack.
"""
from styles.cells import fittings, frames, instruments, landmarks, stairs


def build(kit):
    """Every cells module: {piece or landmark module: object}."""
    found = {
        'door.a': frames.door_a(kit),
        'door.b': frames.door_b(kit),
        'pillar.base': fittings.pillar_base(kit),
        'pillar.shaft': fittings.pillar_shaft(kit),
        'pillar.capital': fittings.pillar_capital(kit),
        'wall.base': fittings.wall_base(kit),
        'wall.shaft': fittings.wall_shaft(kit),
        'wall.cap': fittings.wall_cap(kit),
        'feature.a': fittings.feature_a(kit),
        'feature.b': fittings.feature_b(kit),
        'ceiling.a': fittings.ceiling_a(kit),
        'ceiling.b': fittings.ceiling_b(kit),
        'ceiling.c': fittings.ceiling_c(kit),
        'floor.a': fittings.floor_a(kit),
        'floor.b': fittings.floor_b(kit),
        'sconce': frames.sconce(kit),
        'portal': frames.portal(kit),
        'exit': frames.exit_frame(kit),
        'stair.head': stairs.stair_head(kit),
        'stair.side': stairs.stair_side(kit),
        'balustrade': stairs.balustrade(kit),
        'cells.oubliette': landmarks.oubliette(kit),
        'cells.gibbets': instruments.gibbets(kit),
        'cells.rack': instruments.rack(kit),
    }
    return found
