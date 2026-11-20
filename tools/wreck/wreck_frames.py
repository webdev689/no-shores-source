"""Where a point of a ship's own frame lies in the wreck's: each ship's placement, and her hull's deck heights."""
from mathutils import Vector

from wreck_ships import placing

class Frames:
    """The ships' frames: `on(ship, x, y, lift)` is the point `lift` over her floor at (x, y) of her own frame, in
    the wreck's; the Brig's frame is her stern half's aft of her break and her bow half's forward of it."""

    def __init__(self, places, hulls, ground, break_x=0.0):
        self.matrices = {name: placing(**place) for name, place in places.items()}
        self.hulls = hulls
        self.ground = ground
        self.break_x = break_x
        # The Frigate's gun deck's height in her frame.
        self.lower = hulls['frigate'].numbers['lower_deck_m']

    def matrix(self, ship, x):
        if ship == 'brig':
            return self.matrices['stern' if x < self.break_x else 'bow']
        return self.matrices[ship]

    def floor(self, ship, x):
        return self.hulls[ship].floor_at(x)

    def on(self, ship, x, y, lift=0.0, z=None):
        """The wreck's point for (x, y) of `ship`'s frame, `lift` over her floor there (or at height `z`)."""
        height = self.floor(ship, x) + lift if z is None else z
        return self.matrix(ship, x) @ Vector((x, y, height))

    def area(self, ship, x0, y0, x1, y1):
        """A box of `ship`'s frame laid in the wreck's: the least box round its four corners (x0, y0, x1, y1)."""
        corners = [self.on(ship, x, y) for x in (x0, x1) for y in (y0, y1)]
        return (min(point.x for point in corners), min(point.y for point in corners),
                max(point.x for point in corners), max(point.y for point in corners))


def wreck_frames(ground=None):
    """The frames of the wreck as tools/wreck/wreck_scene.py lays its ships, for laying things after it is built."""
    import os
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'ships'))
    from build_ship import HULLS
    from ship_hull import Hull
    from wreck_scene import BOW, FRIGATE, SLOOP, STERN
    hulls = {'brig': Hull(HULLS['brig']), 'frigate': Hull(HULLS['frigate'])}
    return Frames({'stern': STERN, 'bow': BOW, 'frigate': FRIGATE, 'sloop': SLOOP}, hulls, ground)
