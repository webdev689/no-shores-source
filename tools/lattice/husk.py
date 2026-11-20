"""The Husk: a port's person overtaken, red crystal broken out of its skull, its right eye, both shoulders, its spine
and its left forearm, in a townsman's clothes torn and soaked. Drawn by render.py; its moves are husk_moves.py's."""
import numpy as np

from husk_moves import MOVES  # noqa: F401

STRAIN = 'red'
SEED = 7
OUTFIT = ['shirt_long_round', 'belt', 'breeches', 'boots']   # a townsman's plainest, from the forge's wardrobe

# Each cluster: the body's piece it breaks out of, the joint that carries it, where its middle is (the piece's vertex
# scoring highest), how many shards within `spread` metres of it, their length and width in metres, and how far each
# leans from the skin's normal toward `lean`. Rest positions are in metres, x to the body's left, y to its back.
CLUSTERS = [
    dict(piece='skull', joint='head', middle=lambda p, n: p[:, 2] + 0.8 * p[:, 1] - 0.6 * p[:, 0],
         count=3, spread=0.06, length=(0.18, 0.34), width=0.075, lean=(-0.5, 0.7, 0.5)),   # the great mass, back right
    dict(piece='skull', joint='head', middle=lambda p, n: -2.0 * p[:, 0] - 1.0 * p[:, 1] + 0.2 * p[:, 2],
         count=3, spread=0.05, length=(0.05, 0.11), width=0.03, lean=(-0.6, -0.3, 0.3)),   # through the right eye
    dict(piece='torso', joint='chest', middle=lambda p, n: p[:, 2] + 1.5 * p[:, 0] + 0.5 * n[:, 2],
         count=5, spread=0.08, length=(0.08, 0.2), width=0.045, lean=(0.5, 0.2, 0.7)),    # the left shoulder, heavy
    dict(piece='torso', joint='chest', middle=lambda p, n: p[:, 2] - 1.5 * p[:, 0] + 0.5 * n[:, 2],
         count=2, spread=0.05, length=(0.05, 0.1), width=0.03, lean=(-0.5, 0.2, 0.6)),    # the right, lighter
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.3) - 4 * np.abs(p[:, 0]) + p[:, 1],
         count=5, spread=0.12, length=(0.06, 0.14), width=0.035, lean=(0.0, 0.8, 0.3)),   # down the spine
    dict(piece='arm_L', joint='farm_L', middle=lambda p, n: -4 * np.abs(p[:, 2] - 1.05) + n[:, 0] - n[:, 2],
         count=3, spread=0.05, length=(0.05, 0.12), width=0.03, lean=(0.6, 0.2, 0.1)),    # out of the left forearm
    dict(piece='skull', joint='head', middle=lambda p, n: -np.abs(p[:, 2] - 1.56) - 2 * p[:, 1] + 1.5 * p[:, 0],
         count=2, spread=0.03, length=(0.04, 0.08), width=0.018, lean=(0.4, -0.5, -0.3)),  # through the left jaw
    dict(piece='leg_R', joint='shin_R', middle=lambda p, n: -np.abs(p[:, 2] - 0.52) - p[:, 1],
         count=3, spread=0.05, length=(0.04, 0.1), width=0.026, lean=(-0.2, -0.6, 0.2)),   # the right knee
]
