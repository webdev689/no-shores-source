"""The sanctum's pieces: the temple of a deep faith nobody explains, tall, pointed and candlelit.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand in its great rooms, the shaft
stretched between them; wall.base/.shaft/.cap make a rib on every 2nd wall cell of a room; feature.a/.b stand against a
room's wall; ceiling.a/.b/.c hang at the apex; floor.a/.b lie at the middle of rooms 4 × 4 or more; the sconce holds a
torch's flame; the portal and the exit frame the code's faces; stair.head stands over a flight's head and foot,
stair.side runs down its walls and balustrade rails a gallery over its hall. Landmarks: the Altar of the Deep (on a
wall), the Ritual Circle and the Reflecting Pool.
"""
from . import altar, doors, furnishings, motifs, rites, stairs, structure


def build(kit):
    found = {}
    for part in (doors, structure, furnishings, stairs):
        found.update(part.build(kit))
    found['sanctum.altar'] = altar.build(kit)
    found.update(rites.build(kit))
    return {name: motifs.off_borders(item, kit.UV_LAYER) for name, item in found.items()}
