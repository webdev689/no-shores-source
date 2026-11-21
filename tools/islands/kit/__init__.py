"""The kit a kit's `build(kit)` makes its pieces with: every shape of shapes.py, details.py and nature.py as a Blender
object, taking the same numbers (the module's frame: x east, y south, z up, metres) and, by keyword, `part` (one of
kits.json's parts; stones gives its own), `name` and `smooth` (shade's angle, 35 by default; None is flat); and
core.py's tools to move, copy, fit, join, bevel and jitter them. Each object's material is named by its
part, and its UVs are in metres. The plain helpers (sag_path, bent, seeded) give points, not objects.
"""
import functools

import details
import nature
import shapes
from details import sag_path, seeded  # noqa: F401
from kit.core import (PARTS, bevel, copy, fit, jitter, join, mesh, rotate, rotate_z, scale,  # noqa: F401
                      set_part, shade, start, translate, triangles)
from nature import bent  # noqa: F401


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
prism = _maker(shapes.prism, 'rock')
lathe = _maker(shapes.lathe, 'stone')
ring = _maker(shapes.ring, 'iron')
extrude_outline = _maker(shapes.extrude_outline, 'stone')
arch = _maker(details.arch, 'stone')
rock = _maker(details.rock, 'rock')
stones = _maker(details.stones, 'stone')
planks = _maker(details.planks, 'plank')
rope = _maker(details.rope, 'rope')
tube = _maker(nature.tube, 'bark')
frond = _maker(nature.frond, 'leaf', closed=False)
blade = _maker(nature.blade, 'grass', closed=False)
tuft = _maker(nature.tuft, 'grass', closed=False)
