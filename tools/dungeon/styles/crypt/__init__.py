"""The crypt's pieces: burial vaults, cramped and old, round-arched and heavy, and full of the dead.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand at a great room's corners, the
shaft stretched between them; wall.base/.shaft/.cap make an engaged column on every 2nd wall cell of a room;
feature.a/.b are a room's set pieces against its wall, two at most; ceiling.a/.b/.c are carved bosses, at each
dome's middle and every 2nd cell of a vault's ridge; floor.a/.b are tomb slabs on 1 in 4 quiet cells; sconce holds a
torch's flame; portal and exit frame the code's faces. Landmarks: the Charnel Pit, the Founder's Tomb and the
Broken Vault.
"""
import catalog
from styles.crypt import doors, pieces, pit, tomb, vault
from styles.crypt.hidden import off_border


def build(kit):
    """Every crypt module: {piece or module name: object}."""
    makers = {
        'door.a': doors.door_a, 'door.b': doors.door_b, 'portal': doors.portal, 'exit': doors.exit_door,
        'pillar.base': pieces.pillar_base, 'pillar.shaft': pieces.pillar_shaft, 'pillar.capital': pieces.pillar_capital,
        'wall.base': pieces.wall_base, 'wall.shaft': pieces.wall_shaft, 'wall.cap': pieces.wall_cap,
        'feature.a': pieces.feature_a, 'feature.b': pieces.feature_b,
        'ceiling.a': pieces.ceiling_a, 'ceiling.b': pieces.ceiling_b, 'ceiling.c': pieces.ceiling_c,
        'floor.a': pieces.floor_a, 'floor.b': pieces.floor_b, 'sconce': pieces.sconce,
    }
    found = {name: make(kit) for name, make in makers.items()}
    landmarks = {'crypt.bone-pit': pit.bone_pit, 'crypt.founders-tomb': tomb.founders_tomb,
                 'crypt.collapsed-vault': vault.collapsed_vault}
    for entry in catalog.landmarks_of('crypt'):
        found[entry['module']] = landmarks[entry['module']](kit, entry)
    return {name: off_border(item) for name, item in found.items()}
