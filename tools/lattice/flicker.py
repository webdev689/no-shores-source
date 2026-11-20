"""The Flicker, "the displaced": a port's person the crystal has nearly eaten, gaunt and tall, purple. After the owner's
own in project-final: the head gone, a spray of small shards from the neck's stump in its place; both arms gone, each
a faceted crystal limb ending in a long angled blade past where the hand was; the torso and legs peppered, the flesh
losing to the crystal. Each blade is a layer of its own, so the game can take one away when it is shot off. In the
rags of its breeches. Drawn by render.py; its moves are flicker_moves.py's."""
import numpy as np

import anatomy
import growth
from flicker_moves import MOVES  # noqa: F401
from gear import hang
from rig import rest

STRAIN = 'purple'
SEED = 11
HANDS = False
OUTFIT = ['breeches']
PARTS = ['blade_L', 'blade_R']
# gaunt and tall: a child's make, the other way (the forge lays it over the man's as it lays a child's)
MAKE = {'scale': 1.12, 'torso_w': 0.78, 'torso_d': 0.82, 'chest_w': 0.88, 'waist_w': 0.78, 'arm_r': 0.72,
        'leg_r': 0.74}
BLADE = dict(length=1.04, width=0.18, thick=0.027, barb=0.2)   # project-final's own blade, metres past the wrist


def band(low, high):
    return lambda p, n: (p[:, 2] > low) & (p[:, 2] < high)


CLUSTERS = [
    dict(piece='torso', joint='neck', middle=lambda p, n: p[:, 2] - 2 * np.abs(p[:, 0]),
         count=10, spread=0.1, length=(0.06, 0.22), width=0.026, lean=(0.0, 0.1, 1.2)),   # the spray where the head was
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.32) - 2 * np.abs(p[:, 0]) - p[:, 1],
         count=7, spread=0.11, length=(0.05, 0.14), width=0.034, lean=(0.0, -0.4, 0.2)),  # eating through the sternum
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.22) + 2 * p[:, 0],
         count=5, spread=0.09, length=(0.04, 0.1), width=0.026, lean=(0.6, 0.0, 0.1)),    # the left ribs
    dict(piece='torso', joint='spine', middle=lambda p, n: -np.abs(p[:, 2] - 1.08) - 3 * np.abs(p[:, 0]) + p[:, 1],
         count=6, spread=0.12, length=(0.05, 0.12), width=0.03, lean=(0.0, 0.8, 0.2)),    # down the spine
    dict(piece='torso', joint='pelvis', middle=lambda p, n: -np.abs(p[:, 2] - 0.98) - 2 * p[:, 0] - p[:, 1],
         count=4, spread=0.08, length=(0.04, 0.09), width=0.024, lean=(-0.5, -0.3, 0.0)),  # the right hip
    dict(piece='leg_L', joint='thigh_L', middle=lambda p, n: -np.abs(p[:, 2] - 0.72) - p[:, 1],
         count=4, spread=0.1, length=(0.04, 0.1), width=0.024, lean=(0.3, -0.5, 0.0)),    # the left thigh
    dict(piece='leg_R', joint='shin_R', middle=lambda p, n: -np.abs(p[:, 2] - 0.36) - p[:, 1],
         count=4, spread=0.09, length=(0.03, 0.08), width=0.02, lean=(-0.3, -0.5, 0.0)),   # the right shin
]


def reshape(fighter):
    """The head and both arms eaten: the skin cut back to the torso and legs, as the forge cuts skin under armour."""
    skin = fighter.skins[0]
    piece = np.array(anatomy.PIECES)[np.argmax(skin.alpha, axis=1)]
    skin.cut(~np.isin(piece, ('skull', 'arm_L', 'arm_R')))


def blade(name, side, crystal):
    """A long flat blade from the wrist down past where the hand was, its edges forward and back, widest a third of the
    way out, with one barb off its back edge: a diamond in section, so its faces catch the light."""
    import bpy
    x = 1.0 if side == 'L' else -1.0
    wrist = np.array(rest(f'hand_{side}'))
    way = wrist - np.array(rest(f'farm_{side}'))
    way /= np.linalg.norm(way)
    # the edge leads forward and out, the flats turned half toward the front, so a blade reads broad in every view
    edge, flat = np.array((x * 0.7, -0.7, 0.0)), np.array((x * 0.7, 0.7, 0.0))
    stations = [(0.0, 0.07), (0.33, 1.0), (0.8, 0.62), (1.0, 0.0)]
    points, faces = [], []
    for s, wide in stations:
        at = wrist + way * BLADE['length'] * s
        half = BLADE['width'] * wide / 2
        points += [at + edge * half, at + flat * BLADE['thick'] / 2, at - edge * half * 0.7, at - flat * BLADE['thick'] / 2]
    for k in range(len(stations) - 1):
        a, b = 4 * k, 4 * (k + 1)
        faces += [(a + i, a + (i + 1) % 4, b + (i + 1) % 4, b + i) for i in range(4)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(p) for p in points], [], faces)
    mesh.materials.append(growth.DEEP.get(crystal.name, crystal))
    mesh.materials.append(crystal)
    # the faces either side of its leading edge bright, its back dark: an edge that reads as sharp
    mesh.polygons.foreach_set('material_index', [1 if i in (0, 3) else 0 for _ in range(len(stations) - 1) for i in range(4)])
    mesh.update()
    barbs = [growth.shard(f'{name}_barb_{k}', wrist + way * BLADE['length'] * s - edge * BLADE['width'] * 0.3,
                          -edge + way * 0.6, BLADE['barb'] * size, 0.022 * size, 0.3 + k, crystal)
             for k, (s, size) in enumerate(((0.3, 0.7), (0.5, 1.0), (0.72, 0.6)))]   # barbs off its back edge
    return [growth.linked(name, mesh), *barbs]


def limb(name, side, crystal):
    """The arm as crystal: a faceted shaft from the shoulder to the elbow and one from the elbow to the wrist, each
    hung on its own joint, with a knot of shards at the shoulder and the elbow."""
    made = []
    for joint, end, radius in ((f'uarm_{side}', f'farm_{side}', 0.05), (f'farm_{side}', f'hand_{side}', 0.04)):
        start, stop = np.array(rest(joint)), np.array(rest(end))
        shaft = growth.shard(f'{name}_{joint}', start, stop - start, np.linalg.norm(stop - start) + radius, radius,
                             0.4, crystal, widest=0.45)
        knot = [growth.shard(f'{name}_{joint}_knot{k}', start, way, 0.07, 0.024, k, crystal)
                for k, way in enumerate(((0.3, -0.4, 0.6), (0.6, 0.3, 0.4), (-0.2, 0.5, 0.7)))]
        made.append((joint, [shaft, *knot]))
    return made


def parts(fighter):
    crystal = growth.crystal_material('purple', glow=0.45)   # the displaced glow brighter: charged, about to phase
    out = {}
    for side in ('L', 'R'):
        obs = []
        for joint, pieces in limb(f'flicker_arm_{side}', side, crystal):
            for ob in pieces:
                hang(fighter.parts, ob, joint)
            obs += pieces
        for ob in blade(f'flicker_blade_{side}', side, crystal):
            hang(fighter.parts, ob, f'hand_{side}')
            obs.append(ob)
        out[f'blade_{side}'] = obs
    return out
