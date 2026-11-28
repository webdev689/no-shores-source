"""The ships' own hull taken into modules: a hull in the Sloop's style built by the ships' builder
(tools/ships/ship_hull.py) from a hull's numbers, its five painted parts each read as one of the kit's materials, so a
module built on a ship's hull (the Grey Tithe's airship) is the same vessel the sea sails, retrofitted.
"""
import copy
import os
import sys

import kit

HERE = os.path.dirname(os.path.abspath(__file__))
SHIPS = os.path.join(os.path.dirname(HERE), 'ships')
# The ships' builder puts its own folder first on the path as it loads: it is put last again after, so the modules'
# own files are found first.
_KEPT = sys.path[:]
sys.path.append(SHIPS)
import build_ship  # noqa: E402
import ship_hull  # noqa: E402

sys.path[:] = _KEPT + [SHIPS]

# Each of the ships' painted parts as the kit's material: her planking, deck and spars timber, her sails canvas, her
# fittings iron.
AS_KIT = {'hull': 'timber', 'deck': 'timber', 'spar': 'timber', 'sail': 'canvas', 'iron': 'iron'}


def numbers(name, **changed):
    """A hull's numbers as the ships' builder holds them (`build_ship.HULLS`), with `changed` laid over them."""
    made = copy.deepcopy(build_ship.HULLS[name])
    made.update(changed)
    return made


def hull(module, numbers_of):
    """Her shell, bulwarks, rail cap, main deck and quarterdeck from her numbers, as one object of the module, in the
    ships' frame (x toward her bow, y to port, z up from her waterline), and her `Hull` for placing what is fitted to
    her."""
    shape = ship_hull.Hull(numbers_of)
    item = ship_hull.build_hull(shape, kit.bpy.context.scene.collection)
    names = [material.name for material in item.data.materials]
    kit.adopted(module, item, [(AS_KIT.get(name.split('.')[0], 'timber'), 0.0) for name in names])
    return item, shape
