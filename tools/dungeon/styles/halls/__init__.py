"""The halls: the great halls of a sunken keep, proud and decayed. Round arches with moulded architraves and brass
studs, octagonal fluted columns under acanthus capitals, heraldry and banners in dyed cloth, brass and iron.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand at a great room's corners, the shaft
stretched between them; wall.base/.shaft/.cap make a pilaster on every 2nd wall cell of a room; feature.a/.b are a
room's set pieces against its wall, two at most; ceiling.a/.b/.c hang at the apex, a dome's middle and every 2nd cell of
a vault's ridge; floor.a/.b lie along the corridors' cells; sconce holds a torch's flame; portal and exit frame the
code's faces; stair.head stands over a flight's head and foot, stair.side runs down its walls and balustrade is a
gallery's parapet over its hall. Landmarks: the High Seat and the Great Hearth (on a wall) and the Fallen Chandelier.
"""
from styles.halls import chandelier, dressing, hearth, members, openings, seat, stairs


def build(kit):
    """Every halls module: {piece or landmark module: object}."""
    found = {}
    for module in (openings, members, dressing):
        found.update(module.pieces(kit))
    found.update({'stair.head': stairs.stair_head(kit), 'stair.side': stairs.stair_side(kit),
                  'balustrade': stairs.balustrade(kit)})
    found['halls.high-seat'] = seat.high_seat(kit)
    found['halls.fallen-chandelier'] = chandelier.fallen_chandelier(kit)
    found['halls.great-hearth'] = hearth.great_hearth(kit)
    return found
