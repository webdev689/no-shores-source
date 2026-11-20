"""The Idol, the displaced gone ranged. After the owner's own in project-final: a Flicker's gaunt, tall, purple body,
its two crystal arms welded at the wrists into one forward emitter, a barrel running to a focusing lens ringed by an
iris of shards; its head kept, iconic and venerated where the Flicker's is a headless spray: a faceted crystal mask
with one cold eye, ringed by a crown of eight spikes. The lens and the eye glow cold, cyan and white, apart from the
violet, so the head and the weapon read as one. No weak spot, as the owner declined one. Drawn by render.py; its moves
are idol_moves.py's."""
import numpy as np

import anatomy
import growth
import materials
from flicker import MAKE, limb  # noqa: F401
from gear import hang
from idol_moves import MOVES  # noqa: F401
from rig import rest

STRAIN = 'purple'
SEED = 13
HANDS = False
OUTFIT = ['breeches']
PARTS = ['emitter']
COLD = (0.59, 0.91, 1.0)   # project-final's lens, [150, 232, 255]
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
    skin = fighter.skins[0]
    piece = np.array(anatomy.PIECES)[np.argmax(skin.alpha, axis=1)]
    skin.cut(~np.isin(piece, ('arm_L', 'arm_R')))


def cold(name, strength):
    m = materials.plain(name, COLD, rough=0.05, spec=1.0)
    shader = m.node_tree.nodes['Principled BSDF']
    shader.inputs['Emission Color'].default_value = (*COLD, 1)
    shader.inputs['Emission Strength'].default_value = strength
    return m


def emitter(crystal, lens):
    """The welded breech at the right wrist and the barrel down from it as the hand points, to the lens in its mouth
    and the iris of six shards round it. The left wrist is laid on the breech in every pose (idol_moves.py)."""
    wrist = np.array(rest('hand_R'))
    way = wrist - np.array(rest('farm_R'))
    way /= np.linalg.norm(way)
    e = EMITTER
    hub = growth.shard('idol_breech', wrist - way * e['hub'] * 0.5, way, e['hub'] * 1.4, e['hub'], 0.2, crystal,
                       widest=0.4)
    barrel = growth.shard('idol_barrel', wrist, way, e['barrel'] + e['radius'], e['radius'], 0.5, crystal, widest=0.85)
    mouth_at = wrist + way * e['barrel']
    mouth = growth.shard('idol_mouth', mouth_at - way * 0.05, way, 0.12, e['mouth'], 0.0, crystal, widest=0.3)
    glass = growth.shard('idol_lens', mouth_at, way, e['lens'] * 1.2, e['lens'], 0.25, lens, widest=0.4)
    _, side, other = growth.frame_of(way)
    iris = [growth.shard(f'idol_iris_{k}', mouth_at + (np.cos(t) * side + np.sin(t) * other) * e['mouth'],
                         way * 0.6 + np.cos(t) * side + np.sin(t) * other, 0.11, 0.02, t, crystal)
            for k, t in enumerate(np.linspace(0, 2 * np.pi, 6, endpoint=False))]
    seams = [growth.shard(f'idol_seam_{s:+.0f}', wrist + other * e['radius'] * s, way, e['barrel'] * 0.95, 0.012, 0.0,
                          crystal, widest=0.5) for s in (1.0, -1.0)]   # the welds' ridges along its top and bottom
    return [hub, barrel, mouth, glass, *iris, *seams]


def crowned(fighter, crystal, eye):
    """A faceted crystal mask over the face, one cold eye in its middle, and a crown of eight spikes round the head,
    long and short in turn, its hot node at the crown's base."""
    skin = fighter.skins[0]
    p = skin.rest
    head = p[p[:, 2] > 1.55]
    middle = head.mean(axis=0)
    top = head[:, 2].max()
    front = head[:, 1].min()
    mask = growth.shard('idol_mask', np.array((0.0, front + 0.03, middle[2] + 0.01)), (0.0, -1.0, 0.25), 0.07, 0.085,
                        0.0, crystal, widest=0.35)
    gem = growth.shard('idol_eye', np.array((0.0, front - 0.02, middle[2] + 0.03)), (0.0, -1.0, 0.1), 0.05, 0.022,
                       0.0, eye, widest=0.5)
    spikes = []
    for k, t in enumerate(np.linspace(0, 2 * np.pi, 8, endpoint=False)):
        ring = np.array((np.cos(t) * 0.075, middle[1] + np.sin(t) * 0.085, top - 0.04))
        spikes.append(growth.shard(f'idol_crown_{k}', ring, (np.cos(t) * 0.25, np.sin(t) * 0.25, 1.0),
                                   0.28 if k % 2 == 0 else 0.17, 0.022, t, crystal))
    node = growth.shard('idol_node', np.array((0.0, middle[1], top - 0.02)), (0.0, 0.0, 1.0), 0.06, 0.03, 0.0, eye)
    return [mask, gem, *spikes, node]


def parts(fighter):
    crystal = growth.crystal_material('purple', glow=0.3)
    lens, eye = cold('lattice.idol_lens', 2.4), cold('lattice.idol_eye', 3.0)
    obs = []
    for side in ('L', 'R'):
        for joint, pieces in limb(f'idol_arm_{side}', side, crystal):
            for ob in pieces:
                hang(fighter.parts, ob, joint)
            obs += pieces
    for ob in emitter(crystal, lens):
        hang(fighter.parts, ob, 'hand_R')
        obs.append(ob)
    for ob in crowned(fighter, crystal, eye):
        hang(fighter.parts, ob, 'head')
        obs.append(ob)
    return {'emitter': obs}
