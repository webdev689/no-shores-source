"""The Lattice's own props taken into modules: its shards, clusters, crusts and boulders are built by its own code
(tools/lattice/props.py and growth.py), and each Blender material they wear is read as one of the kit's, crystal
glowing as its strain's light says: bright toward a shard's point, dark at its root, alight at its heart.
"""
import importlib
import os
import re
import sys

import numpy as np

import kit

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
FOLDERS = [os.path.join(TOOLS, 'lattice'), os.path.join(TOOLS, 'forge', 'tools', 'sprite-forge')]
# The files the modules share a name with in the Lattice's and the forge's folders.
SHARED_NAMES = ('props', 'shapes', 'render')


def _theirs(*names):
    """The Lattice's and the forge's own modules by `names`, imported with their folders first and the modules'
    same-named files set aside meanwhile, then put back: each side keeps its own `props` and `shapes`."""
    kept = {name: sys.modules.pop(name) for name in SHARED_NAMES if name in sys.modules}
    path = sys.path[:]
    sys.path[:0] = FOLDERS
    try:
        return [importlib.import_module(name) for name in names]
    finally:
        # Left at the path's end, for what their code imports as it runs.
        sys.path[:] = path + [folder for folder in FOLDERS if folder not in path]
        for name in SHARED_NAMES:
            sys.modules.pop(name, None)
        sys.modules.update(kept)


growth, props = _theirs('growth', 'props')

# The red strain is the Lattice's own crystal (the purple is the displaced's): every event prop wears it.
STRAIN = 'red'
UP = props.UP

# Each of the Lattice's materials, by its name without its strain, as the kit's material and its glow: its crystal
# toward a shard's point, its dark twin at the root, its light, and the ground and wood it grows through.
AS_KIT = {
    'lattice.crystal': ('crystal', 0.55),
    'lattice.deep': ('crystal', 0.05),
    'prop.light': ('crystal', 1.0),
    'prop.blight': ('crystal', 0.0),
    'prop.hollow': ('crystal', 0.0),
    'prop.stone': ('chalk', 0.0),
    'prop.earth': ('rubble', 0.0),
    'prop.wood': ('timber', 0.0),
    'prop.iron': ('iron', 0.0),
}


def kinds():
    """The Lattice's materials for its props (props.kinds), made once a module."""
    return props.kinds(STRAIN)


def picker(seed):
    """The Lattice's builders draw from numpy's generator: one a module, from its seed."""
    return np.random.default_rng(seed)


def slots_of(item):
    """The kit's (material, glow) for each of an object's material slots, by the Lattice material's name."""
    slots = []
    for material in item.data.materials:
        name = re.match(r'[a-z]+\.[a-z]+', material.name).group(0)
        slots.append(AS_KIT[name])
    return slots or [('crystal', 0.5)]


def taken(module, items, dim=1.0, at=(0.0, 0.0, 0.0)):
    """The Lattice's built objects taken into the module, each face in its material's kit material, its glow `dim` of
    the Lattice's, moved by `at`."""
    for item in items:
        item.location = tuple(item.location[k] + at[k] for k in range(3))
    kit.bpy.context.view_layer.update()
    for item in items:
        kit.adopted(module, item, [(material, glow * dim) for material, glow in slots_of(item)])
    return items


def shard(module, m, base, way, length, radius, turn, widest=0.66, dim=1.0):
    """One of the Lattice's six-sided shards (growth.shard), dark at its root and bright to its point."""
    name = f'shard{len(module.objects)}'
    return taken(module, [growth.shard(name, np.asarray(base, float), way, length, radius, turn, m['crystal'],
                                       widest=widest)], dim)[0]


def cluster(module, m, pick, base, up, count, length, radius, spread=0.6, dim=1.0):
    """Shards broken out from round `base` (props.cluster)."""
    return taken(module, props.cluster(f'cluster{len(module.objects)}', base, up, count, length, radius, m['crystal'],
                                       pick, spread), dim)


def ring_of(module, m, pick, centre, reach, count, length, radius, lean=0.6):
    """Small shards round `centre`, leaning out, where crystal has crept through the ground (props.ring_of)."""
    return taken(module, props.ring_of(f'ring{len(module.objects)}', centre, reach, count, length, radius,
                                       m['crystal'], pick, lean))


def crust(module, m, pick, centre, reach, dim=1.0):
    """The ground gone to crystal round `centre`, as props.blight crusts it: flat plates of crystal whose facets catch
    the light, dark and bright, and points of it pricking up through them. Its stain is left out: the turf it lies on
    is the game's own ground."""
    return taken(module, props.crust(f'crust{len(module.objects)}', m, pick, reach), dim, centre)


def boulder(module, m, pick, centre, radii, points=22):
    """A boulder broken into flat faces (props.rock), in chalk."""
    return taken(module, [props.rock(f'boulder{len(module.objects)}', centre, radii, m['stone'], pick, points)])[0]


def light(module, m, centre, radius, subdivisions=1):
    """A ball of the crystal's light, its heart seen through the shards round it."""
    return taken(module, [props.made('ico_sphere', m['light'], subdivisions=subdivisions, radius=radius,
                                     location=tuple(centre))])[0]
