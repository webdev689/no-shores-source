"""The caverns' pieces: plain stand-ins (styles/placeholder.py) until their own are built here.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand at a great room's
corners, the shaft stretched between them; wall.base/.shaft/.cap dress every 3rd wall cell of a hewn room; feature.a/.b
are a room's set pieces against its wall, two at most; ceiling.a/.b/.c hang from 1 in 6 cave cells,
stalactites and the like; floor.a/.b are scree on 1 in 5 cells; sconce holds a torch's flame; portal and exit
frame the code's faces. Landmarks: the Still Lake, the Crystal Heart and the Stone Teeth.
"""
from styles import placeholder


def build(kit):
    return placeholder.build(kit, 'caverns')
