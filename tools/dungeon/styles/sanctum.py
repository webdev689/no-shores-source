"""The sanctum's pieces: plain stand-ins (styles/placeholder.py) until its own are built here.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand at a great room's
corners, the shaft stretched between them; wall.base/.shaft/.cap make a pilaster on every 2nd wall cell of a room;
feature.a/.b are a room's set pieces against its wall, two at most; ceiling.a/.b/.c hang at the apex, a dome's
middle and every 2nd cell of a vault's ridge; floor.a/.b are circles at the middle of rooms 4 × 4 or more;
sconce holds a torch's flame; portal and exit frame the code's faces. Landmarks: the Altar of the Deep (on a
wall), the Ritual Circle and the Reflecting Pool.
"""
from styles import placeholder


def build(kit):
    return placeholder.build(kit, 'sanctum')
