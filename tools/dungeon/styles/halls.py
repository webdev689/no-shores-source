"""The halls' pieces: plain stand-ins (styles/placeholder.py) until their own are built here.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand at a great room's
corners, the shaft stretched between them; wall.base/.shaft/.cap make a pilaster on every 2nd wall cell of a room;
feature.a/.b are a room's set pieces against its wall, two at most; ceiling.a/.b/.c hang at the apex, a dome's
middle and every 2nd cell of a vault's ridge; floor.a/.b are runners along the corridors' cells; sconce holds a
torch's flame; portal and exit frame the code's faces. Landmarks: the High Seat and the Great Hearth (on a
wall) and the Fallen Chandelier.
"""
from styles import placeholder


def build(kit):
    return placeholder.build(kit, 'halls')
