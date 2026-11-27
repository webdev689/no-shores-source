"""The Flicker, "the displaced": a port's person the crystal has nearly eaten, gaunt and tall, purple. After its
design in project-final: the head gone, a spray of small shards from the neck's stump in its place; both arms gone, each
a faceted crystal limb ending in a long angled blade past where the hand was, barbed down its back edge; the torso and
legs peppered, the flesh losing to the crystal, its back broken open between the shoulder blades and down the spine.
Each blade is a layer of its own, so the game can take one away when it is shot off. In its breeches. Drawn by
render.py; its moves are flicker_moves.py's."""
import numpy as np

import growth
from flicker_moves import MOVES  # noqa: F401
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


CLUSTERS = [
    dict(piece='torso', joint='neck', middle=lambda p, n: p[:, 2] - 2 * np.abs(p[:, 0]),
         count=10, spread=0.1, length=(0.06, 0.22), width=0.026, lean=(0.0, 0.1, 1.2)),   # the spray where the head was
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.32) - 2 * np.abs(p[:, 0]) - p[:, 1],
         count=7, spread=0.11, length=(0.05, 0.14), width=0.034, lean=(0.0, -0.4, 0.2)),  # eating through the sternum
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.22) + 2 * p[:, 0],
         count=5, spread=0.09, length=(0.04, 0.1), width=0.026, lean=(0.6, 0.0, 0.1)),    # the left ribs
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.36) - 3 * np.abs(p[:, 0]) + 2 * p[:, 1],
         count=7, spread=0.14, length=(0.06, 0.17), width=0.034, lean=(0.0, 0.8, 0.5)),   # between the shoulder blades
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
    piece = growth.skin_of(fighter)[2]
    fighter.skins[0].cut(~np.isin(piece, ('skull', 'arm_L', 'arm_R')))


def blade(name, side, crystal):
    """A long flat blade from the wrist down past where the hand was, its edge leading forward and out and its flats
    turned half toward the front, so it reads broad in every view; widest a third of the way out, with three barbs
    off its back edge."""
    x = 1.0 if side == 'L' else -1.0
    wrist, way = growth.forearm(side)
    edge, flat = np.array((x * 0.7, -0.7, 0.0)), np.array((x * 0.7, 0.7, 0.0))
    size = (BLADE['length'], BLADE['width'], BLADE['thick'])
    made = growth.blade(name, wrist, way, edge, flat, size, [(0.0, 0.07), (0.33, 1.0), (0.8, 0.62), (1.0, 0.0)],
                        crystal)
    barbs = [growth.shard(f'{name}_barb_{k}', wrist + way * BLADE['length'] * share - edge * BLADE['width'] * 0.3,
                          -edge + way * 0.6, BLADE['barb'] * scale, 0.022 * scale, 0.3 + k, crystal)
             for k, (share, scale) in enumerate(((0.3, 0.7), (0.5, 1.0), (0.72, 0.6)))]
    return [made, *barbs]


def limb(name, side, crystal):
    """The arm as crystal: a faceted shaft from the shoulder to the elbow and one from the elbow to the wrist, each
    with a knot of shards where it starts, turned out on its own side. Returns each joint and what it carries."""
    x = 1.0 if side == 'L' else -1.0
    made = []
    for joint, end, radius in ((f'uarm_{side}', f'farm_{side}', 0.05), (f'farm_{side}', f'hand_{side}', 0.04)):
        start, stop = np.array(rest(joint)), np.array(rest(end))
        shaft = growth.shard(f'{name}_{joint}', start, stop - start, np.linalg.norm(stop - start) + radius, radius,
                             0.4, crystal, widest=0.45)
        knot = [growth.shard(f'{name}_{joint}_knot{k}', start, (x * out, back, up), 0.07, 0.024, k, crystal)
                for k, (out, back, up) in enumerate(((0.3, -0.4, 0.6), (0.6, 0.3, 0.4), (-0.2, 0.5, 0.7)))]
        made.append((joint, [shaft, *knot]))
    return made


def parts(fighter):
    crystal = growth.crystal_material('purple', glow=0.45)   # the displaced glow brighter than the overtaken
    out = {}
    for side in ('L', 'R'):
        arm = [ob for joint, pieces in limb(f'flicker_arm_{side}', side, crystal)
               for ob in growth.hung(fighter, joint, pieces)]
        out[f'blade_{side}'] = arm + growth.hung(fighter, f'hand_{side}', blade(f'flicker_blade_{side}', side, crystal))
    return out
