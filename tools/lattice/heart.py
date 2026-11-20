"""The Heart, the Lattice's boss on land, after the owner's own in project-final: a rough plumbob of crystal, red
threaded with purple, floating and spinning over its cradle, its core glowing within, walking on jointed tendrils once
it descends (The Lattice as Claude Shapes It). Built on the forge's own body at a quarter of its size and drawn four
times as large: the chest carries and spins the gem over legs held straight and unseen; the cradle stands on a planted
foot; the arms and legs are its four tendrils; the shell's port rides the neck, whose tilt opens it. Its shell, core,
cradle and tendrils are layers of their own, for the game to show by its phase."""
import numpy as np

import growth
import materials
from gear import hang
from heart_moves import MOVES  # noqa: F401
from rig import rest

STRAIN = 'red'
SEED = 23
BODY = False
HANDS = False
CLUSTERS = []
PARTS = ['shell', 'core', 'cradle', 'tendrils']
MAKE = {'scale': 4.0}   # built at a quarter of its size, so it may ride the forge's own body
WORK = (760, 820)
SECTORS = 7   # its shell repeats seven times round, so its spin loops a seventh of a turn
GEM = dict(bottom=1.0, equator=1.66, top=2.66, radius=0.46)   # metres on the forge's body; four times that drawn
CORE_GLOW = (0.9, 0.1, 0.12)   # glowing red, its facets showing; its pulse is the game's to draw


def rough_gem(name, bottom, equator, top, radius, material, sectors=SECTORS, seed=SEED):
    """A plumbob: a ring of facets round its equator, a ring halfway up its crown, its apexes a little off the axis;
    each sector's jitter the same, so a seventh of a turn brings it back to itself."""
    import bpy
    pick = np.random.default_rng(seed)
    pattern = [(pick.uniform(0.86, 1.14), pick.uniform(-0.04, 0.04)) for _ in range(2)]   # one sector's jitter
    ring, upper = [], []
    for k in range(2 * sectors):
        width, lift = pattern[k % 2]
        t = k * np.pi / sectors
        ring.append((np.cos(t) * radius * width, np.sin(t) * radius * width, equator + lift))
        mid = (top + equator) / 2
        upper.append((np.cos(t + np.pi / (2 * sectors)) * radius * 0.56, np.sin(t + np.pi / (2 * sectors)) * radius * 0.56,
                      mid + lift))
    n = len(ring)
    points = ring + upper + [(0.02, 0.0, top), (0.0, -0.02, bottom)]
    faces = [(k, (k + 1) % n, n + k) for k in range(n)] + [((k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)]
    faces += [(n + k, n + (k + 1) % n, 2 * n) for k in range(n)] + [((k + 1) % n, k, 2 * n + 1) for k in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.materials.append(material)
    mesh.update()
    return growth.linked(name, mesh)


def crusted(red, purple):
    """Shards erupting from its faces, five a sector, the same in each, a third of them its purple veins."""
    g = GEM
    made = []
    spots = [(0.2, 0.15, 0.13, 0.05), (0.55, 0.38, 0.2, 0.06), (0.85, 0.55, 0.16, 0.05), (0.1, 0.66, 0.24, 0.07),
             (0.5, 1.12, 0.14, 0.045)]   # each: its turn in the sector, its height (0 the equator, 1 the top), size
    for sector in range(SECTORS):
        for k, (turn, high, length, width) in enumerate(spots):
            t = (sector + turn) * 2 * np.pi / SECTORS
            z = g['equator'] + (g['top'] - g['equator']) * min(high, 1.0) if high <= 1 else g['equator'] - 0.25
            r = g['radius'] * (1 - min(high, 1.0) * 0.6) if high <= 1 else g['radius'] * 0.7
            out = np.array((np.cos(t), np.sin(t), 0.0))
            base = np.array((0.0, 0.0, z)) + out * r * 0.9
            way = out + np.array((0.0, 0.0, 0.6 if high <= 1 else -0.5))
            made.append(growth.shard(f'heart_crust_{sector}_{k}', base, way, length, width, t,
                                     purple if k in (1, 4) else red))
    return made


def port(red, purple):
    """The front of the shell that opens to loose what it throws: a facet plate and its own shards, hung on the neck,
    so the neck's tilt opens it."""
    g = GEM
    face = np.array((0.0, -g['radius'] * 0.82, g['equator'] + 0.08))
    return [growth.shard('heart_port', face, (0.0, -1.0, 0.2), 0.12, 0.22, 0.0, red, widest=0.2),
            growth.shard('heart_port_vein', face + (0.0, -0.06, 0.08), (0.2, -1.0, 0.6), 0.2, 0.05, 0.3, purple),
            growth.shard('heart_port_spur', face + (0.06, -0.05, -0.08), (0.4, -1.0, -0.4), 0.16, 0.045, 0.7, red)]


def kernel(core, purple):
    """The core: a glowing bipyramid in the gem's heart, a few shards from it, purple veins among them."""
    middle = np.array((0.0, 0.0, GEM['equator'] - 0.05))
    made = [growth.shard('heart_core_up', middle - (0, 0, 0.02), (0, 0, 1), 0.34, 0.19, 0.0, core, widest=0.0),
            growth.shard('heart_core_down', middle + (0, 0, 0.02), (0, 0, -1), 0.29, 0.19, 0.0, core, widest=0.0)]
    for k, t in enumerate(np.linspace(0, 2 * np.pi, 6, endpoint=False)):
        out = np.array((np.cos(t), np.sin(t), 0.3 * (-1) ** k))
        made.append(growth.shard(f'heart_core_shard_{k}', middle + out * 0.1, out, 0.14, 0.035, t,
                                 purple if k % 2 else core))
    return made


def cradle(red, purple):
    """A rough crystal pedestal round the ground under the gem, big shards clasping its point, more bursting from its
    flanks, rubble creeping out over the floor. Ground at the planted foot's sole."""
    pick = np.random.default_rng(SEED + 1)
    made = []
    for k in range(10):   # the pedestal: ten great shards leaning in, a ring
        t = k * 2 * np.pi / 10
        out = np.array((np.cos(t), np.sin(t), 0.0))
        made.append(growth.shard(f'heart_pedestal_{k}', out * 0.55, -out * 0.25 + (0, 0, 1), pick.uniform(0.85, 1.05),
                                 0.14, t, red, widest=0.3))
    for k in range(9):   # the clasp, round the gem's point
        t = k * 2 * np.pi / 9 + 0.2
        out = np.array((np.cos(t), np.sin(t), 0.0))
        made.append(growth.shard(f'heart_clasp_{k}', out * 0.36 + (0, 0, 0.7), out * 0.5 + (0, 0, 1),
                                 pick.uniform(0.3, 0.5), 0.06, t, purple if k % 3 == 0 else red))
    for k in range(10):   # the flanks and the rubble
        t = pick.uniform(0, 2 * np.pi)
        out = np.array((np.cos(t), np.sin(t), 0.0))
        low = k >= 5
        made.append(growth.shard(f'heart_flank_{k}', out * (0.75 if low else 0.6) + (0, 0, 0.0 if low else 0.35),
                                 out + (0, 0, 0.3 if low else 0.8), pick.uniform(0.1, 0.18 if low else 0.32),
                                 0.05, t, red))
    return made


def tendrils(red, purple):
    """Its four tendrils: each of the forge's arms and legs a jointed crystal limb, three segments, girth tapering to
    the tip, a purple vein along each, knots of shards at the joints."""
    made = []
    for chain, tip in ((('uarm_L', 'farm_L', 'hand_L'), 0.32), (('uarm_R', 'farm_R', 'hand_R'), 0.32),
                       (('thigh_L', 'shin_L', 'foot_L'), 0.26), (('thigh_R', 'shin_R', 'foot_R'), 0.26)):
        heads = [np.array(rest(j)) for j in chain]
        last = heads[2] + (heads[2] - heads[1]) / np.linalg.norm(heads[2] - heads[1]) * tip
        ends = heads[1:] + [last]
        for k, (joint, start, stop) in enumerate(zip(chain, heads, ends)):
            girth = 0.045 * 0.72 ** k
            segment = growth.shard(f'heart_tendril_{joint}', start, stop - start, np.linalg.norm(stop - start) + girth,
                                   girth, k, red, widest=0.3)
            vein = growth.shard(f'heart_vein_{joint}', start + (stop - start) * 0.3, stop - start,
                                np.linalg.norm(stop - start) * 0.5, girth * 0.4, k + 1, purple)
            made.append((joint, [segment, vein]))
    return made


def parts(fighter):
    red, purple = growth.crystal_material('red', glow=0.1), growth.crystal_material('purple', glow=0.3)   # so broad faces keep their facets
    core = materials.plain('lattice.heart_core', CORE_GLOW, rough=0.1, spec=1.0)
    shader = core.node_tree.nodes['Principled BSDF']
    shader.inputs['Emission Color'].default_value = (*CORE_GLOW, 1)
    shader.inputs['Emission Strength'].default_value = 1.1
    shell = [rough_gem('heart_gem', GEM['bottom'], GEM['equator'], GEM['top'], GEM['radius'], red), *crusted(red, purple)]
    out = {'shell': [], 'core': [], 'cradle': [], 'tendrils': []}
    for ob in shell:
        hang(fighter.parts, ob, 'chest')
        out['shell'].append(ob)
    for ob in port(red, purple):
        hang(fighter.parts, ob, 'neck')
        out['shell'].append(ob)
    for ob in kernel(core, purple):
        hang(fighter.parts, ob, 'chest')
        out['core'].append(ob)
    for ob in cradle(red, purple):   # built round the ground under the gem; the planted foot holds it there
        hang(fighter.parts, ob, 'foot_L')
        out['cradle'].append(ob)
    for joint, obs in tendrils(red, purple):
        for ob in obs:
            hang(fighter.parts, ob, joint)
        out['tendrils'] += obs
    return out
