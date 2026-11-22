"""The Idol, the displaced gone ranged. After the owner's own in project-final: a Flicker's gaunt, tall, purple body,
its two crystal arms welded at the wrists into one forward emitter, a barrel running to a focusing lens ringed by an
iris of shards; its head kept where the Flicker's is a headless spray, behind a faceted crystal mask with one eye,
ringed by a crown of eight spikes. The lens and the eye glow cyan, apart from the violet, so the head and the weapon
read as one. Drawn by render.py; its moves are idol_moves.py's."""
import numpy as np

import growth
from flicker import MAKE, limb  # noqa: F401
from idol_moves import MOVES  # noqa: F401

STRAIN = 'purple'
SEED = 13
HANDS = False
OUTFIT = ['breeches']
PARTS = ['emitter']
COLD = (0.59, 0.91, 1.0)   # project-final's lens, [150, 232, 255]
CYAN = (0.25, 0.85, 1.0)   # its light: kept below white, so the glow reads as cyan
# the emitter, metres from the wrists: the breech's hub, the barrel's length and radius, its mouth, and the lens in
# it; project-final's own lengths, slimmed to the forge's figures so it reads as a barrel and not a club
EMITTER = dict(hub=0.1, barrel=0.59, radius=0.055, mouth=0.09, lens=0.07)

CLUSTERS = [
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.3) - 2 * np.abs(p[:, 0]) - p[:, 1],
         count=6, spread=0.1, length=(0.04, 0.12), width=0.03, lean=(0.0, -0.4, 0.2)),   # through the sternum
    dict(piece='torso', joint='spine', middle=lambda p, n: -np.abs(p[:, 2] - 1.12) - 3 * np.abs(p[:, 0]) + p[:, 1],
         count=6, spread=0.12, length=(0.05, 0.12), width=0.03, lean=(0.0, 0.8, 0.2)),   # down the spine
    dict(piece='torso', joint='chest', middle=lambda p, n: p[:, 2] - 2 * np.abs(np.abs(p[:, 0]) - 0.15),
         count=5, spread=0.14, length=(0.05, 0.13), width=0.03, lean=(0.0, 0.2, 0.8)),   # the shoulders' tops
    dict(piece='leg_R', joint='thigh_R', middle=lambda p, n: -np.abs(p[:, 2] - 0.7) - p[:, 1],
         count=3, spread=0.09, length=(0.04, 0.09), width=0.022, lean=(-0.3, -0.5, 0.0)),   # the right thigh
]


def reshape(fighter):
    """Both arms eaten, the skin cut back from them as the forge cuts skin under armour; the head kept."""
    piece = growth.skin_of(fighter)[2]
    fighter.skins[0].cut(~np.isin(piece, ('arm_L', 'arm_R')))


def emitter(crystal, lens):
    """The welded breech at the right wrist and the barrel down from it as the hand points, to the lens in its mouth
    and the iris of six shards round it. The left wrist is laid on the breech in every pose (idol_moves.py)."""
    wrist, way = growth.forearm('R')
    hub_r, length, radius, mouth_r, lens_r = (EMITTER[k] for k in ('hub', 'barrel', 'radius', 'mouth', 'lens'))
    hub = growth.shard('idol_breech', wrist - way * hub_r * 0.5, way, hub_r * 1.4, hub_r, 0.2, crystal, widest=0.4)
    barrel = growth.shard('idol_barrel', wrist, way, length + radius, radius, 0.5, crystal, widest=0.85)
    mouth_at = wrist + way * length
    mouth = growth.shard('idol_mouth', mouth_at - way * 0.05, way, 0.12, mouth_r, 0.0, crystal, widest=0.3)
    glass = growth.shard('idol_lens', mouth_at, way, lens_r * 1.2, lens_r, 0.25, lens, widest=0.4)
    _, side, other = growth.frame_of(way)
    iris = [growth.shard(f'idol_iris_{k}', mouth_at + (np.cos(t) * side + np.sin(t) * other) * mouth_r,
                         way * 0.6 + np.cos(t) * side + np.sin(t) * other, 0.11, 0.02, t, crystal)
            for k, t in enumerate(np.linspace(0, 2 * np.pi, 6, endpoint=False))]
    seams = [growth.shard(f'idol_seam_{s:+.0f}', wrist + other * radius * s, way, length * 0.95, 0.012, 0.0,
                          crystal, widest=0.5) for s in (1.0, -1.0)]   # the welds' ridges along its top and bottom
    return [hub, barrel, mouth, glass, *iris, *seams]


def crowned(fighter, crystal, eye):
    """A faceted crystal mask flat over the face, its one eye in its middle, and a crown of eight spikes round the
    head, long and short in turn, its node at the crown's base."""
    points = fighter.skins[0].rest
    head = points[points[:, 2] > 1.55]
    middle, top, front = head.mean(axis=0), head[:, 2].max(), head[:, 1].min()
    out = np.array((0.0, -1.0, 0.15)) / np.linalg.norm((0.0, -1.0, 0.15))
    up = np.array((0.0, 0.0, 1.0)) - out * out[2]
    rim = [(0.075, 0.0), (0.05, 0.06), (0.0, 0.07), (-0.05, 0.05), (-0.085, 0.0), (-0.05, -0.05), (0.0, -0.07),
           (0.05, -0.06)]
    mask = growth.plate('idol_mask', np.array((0.0, front + 0.004, middle[2] + 0.01)), out, up / np.linalg.norm(up),
                        rim, 0.014, crystal)
    gem = growth.shard('idol_eye', np.array((0.0, front - 0.008, middle[2] + 0.03)), (0.0, -1.0, 0.1), 0.035, 0.02,
                       0.0, eye, widest=0.5)
    spikes = [growth.shard(f'idol_crown_{k}', np.array((np.cos(t) * 0.075, middle[1] + np.sin(t) * 0.085, top - 0.04)),
                           (np.cos(t) * 0.25, np.sin(t) * 0.25, 1.0), 0.28 if k % 2 == 0 else 0.17, 0.022, t, crystal)
              for k, t in enumerate(np.linspace(0, 2 * np.pi, 8, endpoint=False))]
    node = growth.shard('idol_node', np.array((0.0, middle[1], top - 0.02)), (0.0, 0.0, 1.0), 0.06, 0.03, 0.0, eye)
    return [mask, gem, *spikes, node]


def parts(fighter):
    crystal = growth.crystal_material('purple', glow=0.3)
    dim = tuple(c * 0.25 for c in COLD)   # a dark glass lit from within, so its light reads cyan and not white
    lens = growth.glowing('lattice.idol_lens', dim, 1.1, CYAN, rough=0.05, spec=0.8)
    eye = growth.glowing('lattice.idol_eye', dim, 1.4, CYAN, rough=0.05, spec=0.8)
    arms = [ob for side in ('L', 'R') for joint, pieces in limb(f'idol_arm_{side}', side, crystal)
            for ob in growth.hung(fighter, joint, pieces)]
    return {'emitter': arms + growth.hung(fighter, 'hand_R', emitter(crystal, lens))
            + growth.hung(fighter, 'head', crowned(fighter, crystal, eye))}
