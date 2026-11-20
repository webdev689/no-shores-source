"""The Heart, the Lattice's boss on land: the people of a ruined port fused by the crystal into one towering giant,
three times a man, bodies half swallowed in its flesh, its chest a cage of crystal ribs round a heart grown huge and
glowing through the bars, its weak spot; it drags a ship's anchor torn from the harbour (The Lattice as Claude Shapes
It). Built on the forge's own body made huge; the fused people, the cage and heart, and the anchor are layers of their
own, so the game can mark the heart and the anchor apart. Drawn by render.py; its moves are heart_moves.py's."""
import numpy as np
from mathutils import Vector

import anatomy
import growth
import materials
from body import blob, blob_mesh
from gear import hang
from heart_moves import MOVES  # noqa: F401
from rig import rest

STRAIN = 'red'
SEED = 29
HANDS = True
PARTS = ['fused', 'core', 'anchor']
MAKE = {'scale': 3.0, 'torso_w': 1.22, 'torso_d': 1.3, 'chest_w': 1.08, 'waist_w': 1.2, 'arm_r': 1.55, 'leg_r': 1.45,
        'hand': 1.4, 'head': 0.78}
WORK = (760, 700)
FLESH = (0.22, 0.2, 0.185)        # the fused people's skin: a corpse's grey, a little paler than the giant's own
HOLLOW = (0.012, 0.002, 0.003)    # their open mouths and eyes, and the wet dark in its chest
HEART = (0.14, 0.006, 0.012)      # the heart's wet flesh, deep crimson, lit from within
HEART_GLOW = (1.0, 0.12, 0.08)
IRON = (0.035, 0.026, 0.02)       # the anchor's rusted iron, dark
GROWN = 1.5   # the fused people drawn half again a man's size, so each reads as a person
HOLE = dict(width=0.12, low=1.16, high=1.42)   # the round opening in its chest, metres on the forge's body

CLUSTERS = [
    dict(piece='torso', joint='chest', middle=lambda p, n: p[:, 2] + 1.5 * p[:, 0] + 0.5 * n[:, 2],
         count=8, spread=0.12, length=(0.1, 0.28), width=0.055, lean=(0.4, 0.3, 0.8)),    # the left shoulder
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.32) - 3 * np.abs(p[:, 0]) + 2 * p[:, 1],
         count=9, spread=0.2, length=(0.12, 0.3), width=0.06, lean=(0.0, 0.9, 0.4)),      # a ridge down its back
    dict(piece='arm_R', joint='farm_R', middle=lambda p, n: -4 * np.abs(p[:, 2] - 1.05) - n[:, 0] + n[:, 2],
         count=4, spread=0.06, length=(0.05, 0.12), width=0.03, lean=(-0.6, 0.2, 0.3)),   # the anchor arm
    dict(piece='leg_L', joint='shin_L', middle=lambda p, n: -np.abs(p[:, 2] - 0.52) - p[:, 1],
         count=4, spread=0.07, length=(0.05, 0.12), width=0.035, lean=(0.2, -0.6, 0.2)),  # the left knee
    dict(piece='skull', joint='head', middle=lambda p, n: p[:, 2] - 1.5 * p[:, 0],
         count=3, spread=0.04, length=(0.05, 0.12), width=0.025, lean=(-0.4, 0.4, 0.6)),  # through its small skull
]
# Where the fused people break out of it: the piece of its skin, the joint that carries them, where (the vertex scoring
# highest), and what of them shows. A person is a third of its height.
FUSED = [
    ('torso', 'chest', lambda p, n: p[:, 2] + 2.0 * p[:, 0] - 0.5 * p[:, 1], 'shoulders'),   # from its left shoulder
    ('torso', 'spine', lambda p, n: -np.abs(p[:, 2] - 1.05) - 2 * np.abs(p[:, 0] + 0.08) - 2 * p[:, 1], 'arm'),  # belly
    ('leg_R', 'thigh_R', lambda p, n: -np.abs(p[:, 2] - 0.74) - 2 * p[:, 1], 'face'),       # its right thigh
    ('torso', 'chest', lambda p, n: -np.abs(p[:, 2] - 1.2) - 2 * np.abs(p[:, 0] - 0.06) + 2 * p[:, 1], 'torso'),  # back
    ('torso', 'pelvis', lambda p, n: -np.abs(p[:, 2] - 0.98) + 2 * p[:, 0] - p[:, 1], 'face'),   # its left hip
]


def surface(fighter):
    skin = fighter.skins[0]
    piece = np.array(anatomy.PIECES)[np.argmax(skin.alpha, axis=1)]
    return skin.rest, np.array([v.normal for v in skin.me.vertices]), piece


def sites(fighter):
    """Each fused person's place on the skin: (its joint, where, the way out of the skin, what of it shows)."""
    points, normals, piece = surface(fighter)
    out = []
    for where, joint, score, kind in FUSED:
        on = np.nonzero(piece == where)[0]
        at = on[np.argmax(score(points[on], normals[on]))]
        out.append((joint, points[at], normals[at], kind))
    return out


def wounds(fighter):
    """Every fused person tears the skin where it breaks out, and bleeds from there (growth.py `grow`)."""
    return [(at, 0.05) for _, at, _, _ in sites(fighter)]


def reshape(fighter):
    """Its chest opened at the front, where the cage and the heart show: the skin cut away there."""
    points, _, piece = surface(fighter)
    front = points[:, 1] < -0.04
    middle, half = (HOLE['low'] + HOLE['high']) / 2, (HOLE['high'] - HOLE['low']) / 2
    opening = (piece == 'torso') & front & ((points[:, 0] / HOLE['width']) ** 2 + ((points[:, 2] - middle) / half) ** 2 < 1)
    fighter.skins[0].cut(~opening)


def person(kind, at, out):
    """A person half out of the skin at `at`, along `out`, as `kind` shows of it, half again a man's size at the
    giant's scale so it reads as one (`shaped`)."""
    return [dict(b, r=b['r'] * GROWN, c=Vector(tuple(at + (np.array(b['c']) - at) * GROWN))) for b in shaped(kind, at, out)]


def faces(at, out):
    """Each fused face's open mouth and two eyes: dark hollows sunk in it."""
    _, side, up = growth.frame_of(np.asarray(out, float))
    up = up if up[2] >= 0 else -up
    head = at + (out * 0.03 + up * 0.01) * GROWN
    front = head + out * 0.05
    return [blob(front - up * 0.03, (0.016, 0.01, 0.02)), blob(front + up * 0.012 + side * 0.02, (0.009, 0.008, 0.009)),
            blob(front + up * 0.012 - side * 0.02, (0.009, 0.008, 0.009))]


def shaped(kind, at, out):
    """Blobs for a head (and jaw, its mouth open), shoulders, a reaching arm, a ribcage, as `kind` shows of them, at a
    man's size at a third, as the giant is three times one."""
    _, side, up = growth.frame_of(np.asarray(out, float))
    up = up if up[2] >= 0 else -up
    head = at + out * 0.03 + up * 0.01
    blobs = [blob(head, (0.034, 0.03, 0.04), along=tuple(up)), blob(head + out * 0.018 - up * 0.03, (0.022, 0.02, 0.016))]
    if kind in ('shoulders', 'torso'):
        chest = at + out * 0.01 - up * 0.07
        blobs.append(blob(chest, (0.06, 0.032, 0.05), along=tuple(up)))
        for s in (1.0, -1.0):   # its arms, one reaching out, one held to it
            shoulder = chest + side * 0.055 * s + up * 0.03
            reach = out * (0.09 if s > 0 else 0.03) + up * (0.04 if s > 0 else -0.05) + side * 0.03 * s
            blobs += [blob(shoulder + reach * 0.5, (0.016, 0.016, 0.05), along=tuple(reach)),
                      blob(shoulder + reach * 1.15, (0.013, 0.013, 0.04), along=tuple(reach))]
    if kind == 'arm':   # an arm reaching out of it alone, the fingers spread
        blobs = []
        for k in range(3):
            blobs.append(blob(at + out * (0.03 + 0.05 * k) + up * 0.02 * k, (0.016, 0.016, 0.03), along=tuple(out + up * 0.4)))
        hand = at + out * 0.17 + up * 0.07
        blobs += [blob(hand + side * (k - 1.5) * 0.009 + out * 0.025, (0.004, 0.004, 0.018), along=tuple(out + up * 0.3))
                  for k in range(4)]
    if kind == 'face':   # only its face, pressed out through the skin
        blobs = blobs[:2]
    return blobs


def fused(fighter, flesh, hollow):
    made = []
    for k, (joint, at, out, kind) in enumerate(sites(fighter)):
        mesh = blob_mesh(f'heart_person_{k}', person(kind, at, out), res=0.004)
        mesh.materials.append(flesh)
        made.append((joint, growth.linked(mesh.name, mesh)))
        if kind != 'arm':
            dark = blob_mesh(f'heart_face_{k}', faces(at, out), res=0.003)
            dark.materials.append(hollow)
            made.append((joint, growth.linked(dark.name, dark)))
    return made


def cage(crystal, heart, dark):
    """Crystal ribs across the opening in its chest, the heart huge behind them, a dark wet hollow behind that."""
    middle = np.array((0.0, -0.06, (HOLE['low'] + HOLE['high']) / 2))
    made = []
    for k, z in enumerate(np.linspace(HOLE['low'] + 0.05, HOLE['high'] - 0.05, 3)):
        for s in (1.0, -1.0):   # a rib from each side, curving forward, not meeting: a gap to see the heart through
            base = np.array((HOLE['width'] * s, -0.1, z))
            made.append(growth.shard(f'heart_rib_{k}_{s:+.0f}', base, (-s, -0.6, -0.12), HOLE['width'] * 0.8, 0.024,
                                     k, crystal, widest=0.35))
    made.append(growth.shard('heart_sternum', np.array((0.0, -0.12, HOLE['low'] - 0.02)), (0, -0.15, 1),
                             HOLE['high'] - HOLE['low'] + 0.04, 0.018, 0.0, crystal, widest=0.5))
    big = 1.5   # grown huge, filling the hollow and pressing out between the ribs
    organ = [blob(middle + np.array((0.025, -0.02, 0.02)) * big, np.array((0.05, 0.045, 0.055)) * big),
             blob(middle + np.array((-0.03, -0.02, 0.025)) * big, np.array((0.045, 0.04, 0.05)) * big),
             blob(middle + np.array((-0.01, -0.02, -0.045)) * big, np.array((0.035, 0.035, 0.05)) * big, along=(0.3, 0.0, 1.0)),
             blob(middle + np.array((0.01, 0.0, 0.08)) * big, np.array((0.016, 0.016, 0.04)) * big),
             blob(middle + np.array((-0.03, 0.0, 0.075)) * big, np.array((0.012, 0.012, 0.035)) * big)]
    mesh = blob_mesh('heart_organ', organ, res=0.003)
    mesh.materials.append(heart)
    hollow = blob_mesh('heart_hollow', [blob(middle + (0, 0.05, 0), (0.11, 0.05, 0.13))], res=0.006)
    hollow.materials.append(dark)
    return made, [growth.linked(mesh.name, mesh), growth.linked(hollow.name, hollow)]


def bar(name, a, b, radius, material, sides=6):
    """A straight bar of `sides` faces from `a` to `b`."""
    import bpy
    a, b = np.asarray(a, float), np.asarray(b, float)
    _, side, other = growth.frame_of(b - a)
    ring = [np.cos(t) * side + np.sin(t) * other for t in np.linspace(0, 2 * np.pi, sides, endpoint=False)]
    points = [a + r * radius for r in ring] + [b + r * radius for r in ring]
    faces = [(k, (k + 1) % sides, sides + (k + 1) % sides, sides + k) for k in range(sides)]
    faces += [tuple(range(sides - 1, -1, -1)), tuple(range(sides, 2 * sides))]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(p) for p in points], [], faces)
    mesh.materials.append(material)
    mesh.update()
    return growth.linked(name, mesh)


def anchor(iron, crystal):
    """A ship's anchor gripped by its shank below the ring, hanging from the fist: the shank down along the hand, the
    stock across it at the top, the crown at the foot with its two arms curving up and their flukes; its chain wrapped
    round the wrist; crystal grown on it from the hand that holds it."""
    wrist = np.array(rest('hand_R'))
    way = wrist - np.array(rest('farm_R'))
    way /= np.linalg.norm(way)
    _, across, _ = growth.frame_of(way)
    top, foot = wrist + way * 0.02, wrist + way * 0.78
    flat = np.cross(way, across)   # the arms spread square to the stock, as an anchor's do
    flat /= np.linalg.norm(flat)
    eye = top - way * 0.16
    ring = [eye + (np.cos(t) * way + np.sin(t) * flat) * 0.06 for t in np.linspace(0, 2 * np.pi, 9)]
    made = [bar('anchor_shank', top - way * 0.1, foot, 0.032, iron),
            bar('anchor_stock', top - way * 0.03 - across * 0.32, top - way * 0.03 + across * 0.32, 0.022, iron),
            *(bar(f'anchor_ring_{k}', a, b, 0.012, iron) for k, (a, b) in enumerate(zip(ring, ring[1:])))]
    for s in (1.0, -1.0):   # the arms sweep out and up from the crown to broad flukes
        elbow = foot + flat * 0.2 * s - way * 0.05
        tip = foot + flat * 0.34 * s - way * 0.26
        made += [bar(f'anchor_arm_{s:+.0f}', foot, elbow, 0.03, iron), bar(f'anchor_arm_up_{s:+.0f}', elbow, tip, 0.026, iron),
                 growth.shard(f'anchor_fluke_{s:+.0f}', tip + way * 0.1, -way + flat * 0.5 * s, 0.17, 0.08, 0.0, iron,
                              widest=0.3)]
    for k in range(4):   # its chain, wrapped round the wrist
        t = k * np.pi / 2
        made.append(bar(f'anchor_link_{k}', wrist - way * (0.06 + 0.03 * k) + across * 0.04 * np.cos(t),
                        wrist - way * (0.06 + 0.03 * k) + across * 0.04 * np.cos(t + np.pi / 2) + flat * 0.04, 0.008, iron))
    pick = np.random.default_rng(SEED + 5)
    for k in range(5):   # the crystal has taken it too
        at = top + way * pick.uniform(0.1, 0.6)
        made.append(growth.shard(f'anchor_crystal_{k}', at, pick.normal(0, 1, 3) + way * 0.3, pick.uniform(0.05, 0.1),
                                 0.022, k, crystal))
    return made


def parts(fighter):
    crystal = growth.crystal_material('red')
    flesh = materials.plain('lattice.heart_flesh', FLESH, rough=0.45, spec=0.4)
    heart = materials.plain('lattice.heart_heart', HEART, rough=0.2, spec=0.8)
    shader = heart.node_tree.nodes['Principled BSDF']
    shader.inputs['Emission Color'].default_value = (*HEART_GLOW, 1)
    shader.inputs['Emission Strength'].default_value = 0.55
    dark = materials.plain('lattice.heart_hollow', HOLLOW, rough=0.3)
    iron = materials.plain('lattice.heart_iron', IRON, metal=0.4, rough=0.8)
    out = {'fused': [], 'core': [], 'anchor': []}
    for joint, ob in fused(fighter, flesh, dark):
        hang(fighter.parts, ob, joint)
        out['fused'].append(ob)
    ribs, organ = cage(crystal, heart, dark)
    for ob in ribs:
        hang(fighter.parts, ob, 'chest')
        out['fused'].append(ob)
    for ob in organ:
        hang(fighter.parts, ob, 'chest')
        out['core'].append(ob)
    for ob in anchor(iron, crystal):
        hang(fighter.parts, ob, 'hand_R')
        out['anchor'].append(ob)
    return out
