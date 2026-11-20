"""The kit a style's `build(kit)` makes its pieces with: every shape of shapes.py and details.py as a Blender object,
taking the same numbers (the dungeon's frame: x east, y south, z up, metres) and, by keyword, `part` (one of the 19
parts; stones gives its own), `name` and `smooth` (shade's angle, 35 by default; None is flat); and core.py's tools
to move, copy, mirror, array, join, bevel and jitter them, and to bend a ceiling piece under a dome. Each object's
material is named by its part, and its UVs are in metres. The plain helpers (scatter, sag_path, helix, arch_curve,
seeded) give points, not objects.
"""
import functools

import details
import shapes
from details import arch_curve, helix, sag_path, scatter, seeded  # noqa: F401
from kit.core import (CELL_M, PARTS, UV_LAYER, array, bevel, copy, jitter, join, mesh, mirror, rotate,  # noqa: F401
                      rotate_z, scale, set_part, shade, start, translate, triangles, under_dome)


def _maker(shape, part, closed=True):
    """A shape made an object: the shape's own arguments, and `part`, `name` and `smooth` by keyword."""
    @functools.wraps(shape)
    def make(*args, part=part, name=None, smooth=35.0, **kwargs):
        faces = shape(*args, **kwargs)
        if isinstance(faces, dict):
            made = [mesh(found, each, name or shape.__name__, smooth, closed) for each, found in faces.items() if found]
            return join(made, name or shape.__name__)
        return mesh(faces, part, name or shape.__name__, smooth, closed)
    return make


box = _maker(shapes.box, 'stone')
bevelled_box = _maker(shapes.bevelled_box, 'stone')
cylinder = _maker(shapes.cylinder, 'stone')
cone = _maker(shapes.cone, 'stone')
frustum = _maker(shapes.frustum, 'stone')
prism = _maker(shapes.prism, 'stone')
lathe = _maker(shapes.lathe, 'stone')
revolve = _maker(shapes.revolve, 'stone')
ring = _maker(shapes.ring, 'iron')
extrude_outline = _maker(shapes.extrude_outline, 'stone')
polygon = _maker(shapes.polygon, 'water', closed=False)
arch = _maker(details.arch, 'stone')
rock = _maker(details.rock, 'stone')
stones = _maker(details.stones, 'stone')
planks = _maker(details.planks, 'wood')
chain = _maker(details.chain, 'iron')
rope = _maker(details.rope, 'rope')
drape = _maker(details.drape, 'cloth')
