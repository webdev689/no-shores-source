"""The cells' pieces: plain stand-ins (styles/placeholder.py) until their own are built here.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand at a great room's
corners, the shaft stretched between them; wall.base/.shaft/.cap make a pier on every 3rd wall cell of rooms and
corridors; feature.a/.b are a room's one set piece against its wall; ceiling.a/.b/.c are beams on every cell,
across the narrower way; floor.a/.b are drains, one a room; sconce holds a torch's flame; portal and exit frame
the code's faces. Landmarks: the Oubliette, the Gibbets and the Rack.
"""
from styles import placeholder


def build(kit):
    return placeholder.build(kit, 'cells')
