"""The Bulwark, the Lattice's captain. After the owner's own in project-final: a hulking mass of flesh, bulked, heavy
and hunched, at 1.2 times a man; its head replaced by a great bulging red crystal with a crown spike and a glowing
core; big crystals at its knees and elbows and its limbs peppered, fewer and smaller than the Husk's, so it reads as
flesh. Fused to its left forearm, a slab of mangled crystal for a shield, a glowing core at its middle, the shield
breaking when the core does (project-final's first form of it; its later bubble would not be flanked). Once the
shield is gone a great crystal maul forms in its hands, project-final's crystal rifle reshaped: no firearms. The
shield and the maul are layers of their own, for the game to take away and give. Bare to the waist, a dock hand's
breeches, belt and boots. Drawn by render.py; its moves are bulwark_moves.py's."""
import numpy as np

import anatomy
import growth
import materials
from bulwark_moves import MOVES  # noqa: F401
from gear import hang
from rig import rest

STRAIN = 'red'
SEED = 19
OUTFIT = ['breeches', 'belt', 'tall_boots']
PARTS = ['head', 'shield', 'maul']
MAKE = {'scale': 1.2, 'torso_w': 1.3, 'torso_d': 1.28, 'chest_w': 1.12, 'waist_w': 1.25, 'arm_r': 1.4, 'leg_r': 1.3,
        'hand': 1.2}
WORK = (440, 320)   # room for the maul raised over its head at its size
CORE = (1.0, 0.42, 0.36)   # project-final's glow, [255, 104, 102], hot


def knot(piece, joint, z, count, lean):
    return dict(piece=piece, joint=joint, middle=lambda p, n: -np.abs(p[:, 2] - z) - p[:, 1] * 0.5,
                count=count, spread=0.07, length=(0.06, 0.16), width=0.04, lean=lean)


CLUSTERS = [
    knot('leg_L', 'shin_L', 0.52, 4, (0.2, -0.6, 0.2)), knot('leg_R', 'shin_R', 0.52, 4, (-0.2, -0.6, 0.2)),   # knees
    knot('arm_L', 'farm_L', 1.2, 3, (0.4, 0.5, 0.0)), knot('arm_R', 'farm_R', 1.2, 4, (-0.4, 0.5, 0.0)),     # elbows
    dict(piece='torso', joint='chest', middle=lambda p, n: p[:, 2] + 2 * p[:, 1] - np.abs(p[:, 0]),
         count=5, spread=0.14, length=(0.05, 0.12), width=0.035, lean=(0.0, 0.6, 0.6)),   # up the hump of its back
    dict(piece='leg_R', joint='thigh_R', middle=lambda p, n: -np.abs(p[:, 2] - 0.75) - p[:, 1],
         count=3, spread=0.1, length=(0.03, 0.07), width=0.022, lean=(-0.3, -0.5, 0.0)),   # peppered
    dict(piece='arm_L', joint='uarm_L', middle=lambda p, n: -np.abs(p[:, 2] - 1.36) + n[:, 0],
         count=3, spread=0.08, length=(0.03, 0.07), width=0.022, lean=(0.6, 0.0, 0.2)),
]


def reshape(fighter):
    """The head gone into the crystal: the skin cut back from it as the forge cuts skin under armour."""
    skin = fighter.skins[0]
    piece = np.array(anatomy.PIECES)[np.argmax(skin.alpha, axis=1)]
    skin.cut(piece != 'skull')


def glowing(name, colour, strength):
    m = materials.plain(name, colour, rough=0.1, spec=1.0)
    shader = m.node_tree.nodes['Principled BSDF']
    shader.inputs['Emission Color'].default_value = (*colour, 1)
    shader.inputs['Emission Strength'].default_value = strength
    return m


def boulder(crystal, core):
    """The great crystal where its head was: big shards fused into a faceted mass on the neck, a spike for a crown,
    and its glowing core showing through the front."""
    neck = np.array(rest('head'))
    pick = np.random.default_rng(SEED)
    made = [growth.shard('bulwark_mass', neck + np.array((0.0, 0.02, -0.05)), (0.0, -0.15, 1.0), 0.42, 0.17, 0.3,
                         crystal, widest=0.45),
            growth.shard('bulwark_crown', neck + np.array((0.0, 0.04, 0.18)), (0.0, 0.25, 1.0), 0.3, 0.05, 0.0,
                         crystal),
            growth.shard('bulwark_core', neck + np.array((0.0, -0.13, 0.12)), (0.0, -1.0, 0.1), 0.07, 0.06, 0.0, core,
                         widest=0.5)]
    for k in range(9):
        t = k * 2 * np.pi / 9 + pick.uniform(-0.2, 0.2)
        way = np.array((np.cos(t), np.sin(t) * 0.8, pick.uniform(0.2, 0.9)))
        made.append(growth.shard(f'bulwark_lump_{k}', neck + way * np.array((0.12, 0.12, 0.1)) + (0, 0, 0.06), way,
                                 pick.uniform(0.12, 0.24), pick.uniform(0.05, 0.08), t, crystal))
    return made


def slab(crystal, core):
    """A slab of mangled crystal fused along the left forearm's outside: a flat, faceted plate the length of the
    forearm and more, its face rising to a ridge, shards jutting from its rim and its face, its core glowing at the
    middle in a ring of shards."""
    import bpy
    elbow, wrist = np.array(rest('farm_L')), np.array(rest('hand_L'))
    along = (wrist - elbow) / np.linalg.norm(wrist - elbow)
    out = np.array((1.0, 0.0, 0.0))
    across = np.cross(along, out)
    middle = (elbow + wrist) / 2 + out * 0.1
    rim = [(0.46, 0.02), (0.32, 0.29), (-0.3, 0.31), (-0.44, 0.04), (-0.33, -0.28), (0.3, -0.31)]   # along, across
    front = [middle + along * a + across * c + out * 0.04 for a, c in rim]
    back = [q - out * 0.08 for q in front]
    points = front + back + [middle + out * 0.1]
    n = len(rim)
    faces = [(k, (k + 1) % n, 2 * n) for k in range(n)]   # the face, rising to its middle
    faces += [((k + 1) % n, k, n + k, n + (k + 1) % n) for k in range(n)] + [tuple(range(2 * n - 1, n - 1, -1))]
    mesh = bpy.data.meshes.new('bulwark_slab')
    mesh.from_pydata([tuple(q) for q in points], [], faces)
    mesh.materials.append(crystal)
    mesh.update()
    made = [growth.linked(mesh.name, mesh)]
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
    for k, turn in enumerate(np.linspace(0, 2 * np.pi, 7, endpoint=False)):
        ring = along * np.cos(turn) + across * np.sin(turn)
        made.append(growth.shard(f'bulwark_bezel_{k}', face + ring * 0.11, ring * 0.5 + out * 0.8, 0.08, 0.022, turn,
                                 crystal))
    return made


def club(crystal):
    """The maul that forms in its right hand: a haft of crystal from the fist, a mass of shards at its head."""
    wrist = np.array(rest('hand_R'))
    way = wrist - np.array(rest('farm_R'))
    way /= np.linalg.norm(way)
    head = wrist + way * 0.95
    pick = np.random.default_rng(SEED + 3)
    made = [growth.shard('bulwark_haft', wrist - way * 0.2, way, 1.05, 0.04, 0.0, crystal, widest=0.5)]
    for k in range(10):
        out = pick.normal(0, 1, 3)
        made.append(growth.shard(f'bulwark_maul_{k}', head + out * 0.04, out / np.linalg.norm(out) + way * 0.3,
                                 pick.uniform(0.2, 0.34), pick.uniform(0.08, 0.12), k, crystal))
    return made


def parts(fighter):
    crystal = growth.crystal_material('red')
    core = glowing('lattice.bulwark_core', CORE, 3.5)
    out = {}
    for part, joint, obs in (('head', 'head', boulder(crystal, core)), ('shield', 'farm_L', slab(crystal, core)),
                             ('maul', 'hand_R', club(crystal))):
        for ob in obs:
            hang(fighter.parts, ob, joint)
        out[part] = obs
    return out
