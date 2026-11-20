"""The mines' pieces: plain stand-ins (styles/placeholder.py) until their own are built here.

door.a/.b dress a doorway round the code's jambs; pillar.base/.shaft/.capital stand at a great room's
corners, the shaft stretched between them; wall.base/.shaft/.cap make a timber set on every wall cell of rooms and
corridors, both walls; feature.a/.b are a room's one set piece against its wall; ceiling.a/.b/.c are the
beams over each set; floor.a/.b are rails along straight corridor runs; sconce holds a torch's flame; portal
and exit frame the code's faces. Landmarks: the Lift Shaft, the Ore Cart and the Collapse.
"""
from styles import placeholder


def build(kit):
    return placeholder.build(kit, 'mines')
