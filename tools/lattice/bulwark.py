"""The Bulwark, the Lattice's captain. After the owner's own in project-final: a hulking mass of flesh, bulked, heavy
and hunched, at 1.2 times a man; its head replaced by a great bulging red crystal with a crown spike and a glowing
core; big crystals at its knees and elbows and its limbs peppered, fewer and smaller than the Husk's, so it reads as
flesh. Fused to its left forearm, a slab of mangled crystal for a shield, a glowing core at its middle, the shield
breaking when the core does. Once the shield is gone a great crystal maul forms in its hands, project-final's crystal
rifle reshaped: no firearms. The shield and the maul are layers of their own, for the game to take away and give.
Bare to the waist, a dock hand's breeches, belt and boots. Drawn by render.py; its moves are bulwark_moves.py's."""
import numpy as np

import growth
from body import blob, blob_mesh
from bulwark_moves import MOVES  # noqa: F401
from rig import rest

STRAIN = 'red'
SEED = 19
OUTFIT = ['breeches', 'belt', 'tall_boots']
PARTS = ['head', 'shield', 'maul']
MAKE = {'scale': 1.2, 'torso_w': 1.3, 'torso_d': 1.28, 'chest_w': 1.12, 'waist_w': 1.25, 'arm_r': 1.4, 'leg_r': 1.3,
        'hand': 1.2}
WORK = (440, 320)   # room for the maul raised over its head at its size
CORE = (1.0, 0.42, 0.36)   # project-final's glow, [255, 104, 102]
BELOW = {'bulwark_slam': 30, 'bulwark_sweep': 20}   # rows under the ground for the maul's head before its feet


def knot(piece, joint, z, count, lean):
    return dict(piece=piece, joint=joint, middle=lambda p, n: -np.abs(p[:, 2] - z) - p[:, 1] * 0.5,
                count=count, spread=0.07, length=(0.06, 0.16), width=0.04, lean=lean)


CLUSTERS = [
    knot('leg_L', 'shin_L', 0.52, 4, (0.2, -0.6, 0.2)), knot('leg_R', 'shin_R', 0.52, 4, (-0.2, -0.6, 0.2)),   # knees
    knot('arm_L', 'farm_L', 1.15, 3, (0.4, 0.5, 0.0)), knot('arm_R', 'farm_R', 1.15, 4, (-0.4, 0.5, 0.0)),   # elbows
    dict(piece='torso', joint='chest', middle=lambda p, n: p[:, 2] + 2 * p[:, 1] - np.abs(p[:, 0]),
         count=5, spread=0.14, length=(0.05, 0.12), width=0.035, lean=(0.0, 0.6, 0.6)),   # up the hump of its back
    dict(piece='leg_R', joint='thigh_R', middle=lambda p, n: -np.abs(p[:, 2] - 0.75) - p[:, 1],
         count=3, spread=0.1, length=(0.03, 0.07), width=0.022, lean=(-0.3, -0.5, 0.0)),   # peppered
    dict(piece='arm_L', joint='uarm_L', middle=lambda p, n: -np.abs(p[:, 2] - 1.36) + n[:, 0],
         count=3, spread=0.08, length=(0.03, 0.07), width=0.022, lean=(0.6, 0.0, 0.2)),
]


def reshape(fighter):
    """The head gone into the crystal: the skin cut back from it as the forge cuts skin under armour."""
    fighter.skins[0].cut(growth.skin_of(fighter)[2] != 'skull')


def boulder(crystal, core):
    """The great crystal where its head was: big shards fused into one bulging, faceted mass on the neck, lumps
    swelling out of it round its sides, a spike for a crown, and its glowing core breaking through the front."""
    neck = np.array(rest('head'))
    pick = np.random.default_rng(SEED)
    made = [growth.shard('bulwark_mass', neck + np.array((0.0, 0.02, -0.05)), (0.0, -0.15, 1.0), 0.42, 0.17, 0.3,
                         crystal, widest=0.45),
            growth.shard('bulwark_crown', neck + np.array((0.0, 0.04, 0.18)), (0.0, 0.25, 1.0), 0.3, 0.05, 0.0,
                         crystal),
            growth.shard('bulwark_core', neck + np.array((0.0, -0.15, 0.14)), (0.0, -1.0, 0.1), 0.1, 0.07, 0.0, core,
                         widest=0.5)]
    for k in range(9):
        t = k * 2 * np.pi / 9 + pick.uniform(-0.2, 0.2)
        if np.sin(t) < -0.8:   # the front, where the core shows
            continue
        way = np.array((np.cos(t), np.sin(t) * 0.8, pick.uniform(0.0, 0.4)))
        made.append(growth.shard(f'bulwark_lump_{k}', neck + way * np.array((0.12, 0.12, 0.1)) + (0, 0, 0.1), way,
                                 pick.uniform(0.08, 0.14), pick.uniform(0.07, 0.1), t, crystal))
    return made


def slab(crystal, core):
    """A slab of mangled crystal fused along the left forearm's outside: a flat plate the length of the forearm and
    more, dark, its face rising to a ridge and its rim lit, shards jutting from its rim and its face, glowing seams
    laid over its face out from the core at its middle, ringed by shards."""
    elbow, wrist = np.array(rest('farm_L')), np.array(rest('hand_L'))
    along = (wrist - elbow) / np.linalg.norm(wrist - elbow)
    out = np.array((1.0, 0.0, 0.0))
    across = np.cross(along, out)
    middle = (elbow + wrist) / 2 + along * 0.05 + out * 0.14   # clear of its bulked arm, short of its upper arm
    rim = [(0.46, 0.02), (0.32, 0.29), (-0.24, 0.31), (-0.36, 0.04), (-0.27, -0.28), (0.3, -0.31)]   # along, across
    made = [growth.plate('bulwark_slab', middle + out * 0.04, out, along, rim, 0.06, growth.DEEP[crystal.name],
                         edge=crystal)]
    pick = np.random.default_rng(SEED + 2)
    for k, (a, c) in enumerate(rim):   # mangled: shards jutting from its rim, out and back
        base = middle + along * a * 0.9 + across * c * 0.9
        way = along * a + across * c + out * pick.uniform(0.1, 0.5)
        made.append(growth.shard(f'bulwark_rim_{k}', base, way, pick.uniform(0.12, 0.24), pick.uniform(0.04, 0.06),
                                 k, crystal))
    for k in range(4):   # and from its face
        a, c = pick.uniform(-0.3, 0.3), pick.uniform(-0.22, 0.22)
        if abs(a) < 0.12 and abs(c) < 0.12:
            a += 0.2
        made.append(growth.shard(f'bulwark_face_{k}', middle + along * a + across * c + out * 0.05,
                                 out + along * pick.normal(0, 0.3) + across * pick.normal(0, 0.3),
                                 pick.uniform(0.08, 0.15), 0.035, k, crystal))
    face = middle + out * 0.12
    made.append(growth.shard('bulwark_shield_core', face, out, 0.07, 0.075, 0.0, core, widest=0.5))
    for k, turn in enumerate((0.4, 1.9, 3.3, 4.6)):   # cracks lit from within, down the face's slope off its ridge
        crack = along * np.cos(turn) + across * np.sin(turn)
        made.append(growth.shard(f'bulwark_seam_{k}', middle + out * 0.105 + crack * 0.08, crack - out * 0.2, 0.2,
                                 0.012, 0.0, core, widest=0.2))
    for k, turn in enumerate(np.linspace(0, 2 * np.pi, 7, endpoint=False)):
        ring = along * np.cos(turn) + across * np.sin(turn)
        made.append(growth.shard(f'bulwark_bezel_{k}', face + ring * 0.11, ring * 0.5 + out * 0.8, 0.08, 0.022, turn,
                                 crystal))
    return made


def club(crystal):
    """The maul that forms in its right hand: a thick haft of crystal from the fist, and at its head one great
    faceted block across it, a hammer, a few shards broken out of it."""
    wrist, way = growth.forearm('R')
    _, side, other = growth.frame_of(way)
    head = wrist + way * 0.95
    pick = np.random.default_rng(SEED + 3)
    made = [growth.shard('bulwark_haft', wrist - way * 0.2, way, 1.1, 0.055, 0.0, crystal, widest=0.5)]
    made += [growth.shard(f'bulwark_hammer_{k}', head, side * end, 0.28, 0.13, 0.5, crystal, widest=0.75)
             for k, end in enumerate((1.0, -1.0))]
    for k in range(4):
        out = other * pick.choice((-1.0, 1.0)) + side * pick.uniform(-0.6, 0.6) + way * pick.uniform(0.0, 0.4)
        made.append(growth.shard(f'bulwark_maul_{k}', head + out * 0.06, out, pick.uniform(0.1, 0.16),
                                 pick.uniform(0.04, 0.06), k, crystal))
    return made


# Its own flesh, after the owner's "flesh slabs and lumps (pecs, belly roll, deltoids, a neckless trapezius hump)":
# each the piece of skin it swells from, the joint carrying it, where (the vertex scoring highest) and its size.
SLABS = [
    ('torso', 'chest', lambda p, n: p[:, 2] + 2 * p[:, 1] - 3 * np.abs(p[:, 0]), (0.2, 0.11, 0.11)),    # the hump
    ('arm_L', 'uarm_L', lambda p, n: p[:, 2] + n[:, 0], (0.09, 0.09, 0.11)),                            # deltoids
    ('arm_R', 'uarm_R', lambda p, n: p[:, 2] - n[:, 0], (0.09, 0.09, 0.11)),
    ('torso', 'pelvis', lambda p, n: -np.abs(p[:, 2] - 1.02) - 2 * p[:, 1] - np.abs(p[:, 0]),
     (0.18, 0.07, 0.07)),  # belly
    ('torso', 'chest', lambda p, n: -np.abs(p[:, 2] - 1.3) - 2 * p[:, 1] - 3 * np.abs(p[:, 0] - 0.1), (0.1, 0.05, 0.07)),
    ('torso', 'chest', lambda p, n: -np.abs(p[:, 2] - 1.3) - 2 * p[:, 1] - 3 * np.abs(p[:, 0] + 0.1), (0.1, 0.05, 0.07)),
]


def flesh(fighter):
    """Each slab swelling from its skin, in the skin's own paint, so the game colours it as the body."""
    points, ways, piece = growth.skin_of(fighter)
    paint = fighter.skins[0].me.materials[0]
    made = []
    for k, (where, joint, score, size) in enumerate(SLABS):
        at = growth.best(points, ways, piece, where, score)
        mesh = blob_mesh(f'bulwark_flesh_{k}', [blob(points[at] - ways[at] * min(size) * 0.4, size,
                                                   along=tuple(ways[at]))], res=0.006)
        mesh.materials.append(paint)
        made += growth.hung(fighter, joint, [growth.linked(mesh.name, mesh)])
    return made


def parts(fighter):
    crystal = growth.crystal_material('red')
    core = growth.glowing('lattice.bulwark_core', tuple(c * 0.25 for c in CORE), 0.9, CORE, rough=0.1)
    return {'head': growth.hung(fighter, 'head', boulder(crystal, core)),
            'shield': growth.hung(fighter, 'farm_L', slab(crystal, core)),
            'maul': growth.hung(fighter, 'hand_R', club(crystal))}
