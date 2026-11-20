"""The crypt's pieces: plain stand-ins (styles/placeholder.py) until its own are built here.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand at a great room's
corners, the shaft stretched between them; wall.base/.shaft/.cap make a pilaster on every 2nd wall cell of a room;
feature.a/.b are a room's set pieces against its wall, two at most; ceiling.a/.b/.c are carved bosses, at each
dome's middle and every 2nd cell of a vault's ridge; floor.a/.b are slabs on 1 in 4 quiet cells; sconce holds a
torch's flame; portal and exit frame the code's faces. Landmarks: the Bone Pit, the Founder's Tomb and the
Collapsed Vault.
"""
from styles import placeholder


def build(kit):
    return placeholder.build(kit, 'crypt')
