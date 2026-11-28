"""The Heart, the Lattice's boss on land: the people of a ruined port fused by the crystal into one towering giant,
three times a man, bodies half swallowed in its flesh, its chest a cage of dark crystal ribs round a heart grown huge
and glowing through the bars, its weak spot; it drags a ship's anchor torn from the harbour, held by its ring, long
enough to rest its crown on the ground. Built on the forge's own body made huge; the fused people with the cage round
the heart, the heart, the anchor, and the person it tears out of itself are layers of their own, so the game can mark
the heart and the anchor apart and show the torn one only as it is torn out. Drawn by render.py; its moves are
heart_moves.py's."""
import numpy as np
from mathutils import Vector

import growth
import materials
from body import blob, blob_mesh, seg
from heart_moves import MOVES  # noqa: F401

STRAIN = 'red'
SEED = 29
PARTS = ['fused', 'core', 'anchor', 'torn']
MAKE = {'scale': 3.0, 'torso_w': 1.22, 'torso_d': 1.3, 'chest_w': 1.08, 'waist_w': 1.2, 'arm_r': 1.55, 'leg_r': 1.45,
        'hand': 1.4, 'head': 0.78}
WORK = (760, 700)
BELOW = {'heart_walk': 40, 'heart_idle': 30, 'heart_stand': 30, 'heart_slam': 50, 'heart_sweep': 30,
         'heart_stomp': 30, 'heart_tear': 30,
         'heart_hurt': 30, 'heart_stagger': 40}   # rows under the ground for the anchor's crown before its feet
FLESH = (0.075, 0.062, 0.055)     # the fused people's skin: a corpse's grey, darker than the giant's own
HOLLOW = (0.012, 0.002, 0.003)    # their open mouths and eyes, and the wet dark in its chest
HEART = (0.14, 0.006, 0.012)      # the heart's wet flesh, deep crimson, lit from within
HEART_GLOW = (1.0, 0.12, 0.08)
IRON = (0.085, 0.065, 0.05)       # the anchor's iron, dark, but light enough to read against the ground
RUST = (0.16, 0.07, 0.035)        # its flukes, rusted through
GROWN = 1.7   # the fused people drawn larger than a man at the giant's scale, so each reads as a person
ANCHOR = 1.05   # the anchor's length from its ring, metres on the forge's body: from the fist to the ground
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
    ('torso', 'chest', lambda p, n: p[:, 2] - 3 * np.abs(p[:, 0]) - 3 * p[:, 1], 'face'),            # under its chin
    ('arm_R', 'farm_R', lambda p, n: -4 * np.abs(p[:, 2] - 1.06) - n[:, 0] - n[:, 1], 'arm'),      # its right forearm
    ('arm_L', 'uarm_L', lambda p, n: -4 * np.abs(p[:, 2] - 1.3) + n[:, 0] - n[:, 1], 'face'),      # its left arm
]


def sites(fighter):
    """Each fused person's place on the skin: (its joint, where, the way out of the skin, what of it shows)."""
    points, ways, piece = growth.skin_of(fighter)
    return [(joint, points[at], ways[at], kind) for where, joint, score, kind in FUSED
            for at in [growth.best(points, ways, piece, where, score)]]


def wounds(fighter):
    """Every fused person tears the skin where it breaks out, and bleeds from there (growth.py `grow`)."""
    return [(at, 0.05) for _, at, _, _ in sites(fighter)]


def reshape(fighter):
    """Its chest opened at the front, where the cage and the heart show: the skin cut away there."""
    points, _, piece = growth.skin_of(fighter)
    middle, half = (HOLE['low'] + HOLE['high']) / 2, (HOLE['high'] - HOLE['low']) / 2
    opening = ((piece == 'torso') & (points[:, 1] < -0.04)
               & ((points[:, 0] / HOLE['width']) ** 2 + ((points[:, 2] - middle) / half) ** 2 < 1))
    fighter.skins[0].cut(~opening)


def grown(blobs, at):
    """`blobs` grown about `at`, so a fused person reads as one at the giant's scale."""
    return [dict(b, r=b['r'] * GROWN, c=Vector(tuple(at + (np.array(b['c']) - at) * GROWN))) for b in blobs]


def facing(out):
    """`out`, and the ways to a fused person's side and up its face."""
    _, side, up = growth.frame_of(np.asarray(out, float))
    return side, (up if up[2] >= 0 else -up)


def faces(at, out, up=None):
    """Each fused face's open mouth and two eyes: dark hollows sunk in it, at a man's size at a third; the face's up
    its own unless given."""
    side, up = facing(out) if up is None else (np.cross(up, out), np.asarray(up, float))
    head = at + out * 0.03 + up * 0.01
    return [blob(head + out * 0.03 - up * 0.026, (0.01, 0.009, 0.012)),
            *(blob(head + out * 0.026 + up * 0.012 + side * 0.013 * s, (0.007, 0.007, 0.007)) for s in (1.0, -1.0))]


def shaped(kind, at, out):
    """Blobs for a head (and jaw, its mouth open), shoulders, a reaching arm, a ribcage, as `kind` shows of them, at a
    man's size at a third, as the giant is three times one."""
    side, up = facing(out)
    if kind == 'arm':   # an arm reaching out of it alone, its hand open, the fingers spread off the palm
        hand = at + out * 0.12 + up * 0.045
        return ([seg(at + out * 0.01, hand - out * 0.012, 0.022)]
                + [blob(hand, (0.018, 0.011, 0.02), along=tuple(out + up * 0.3))]
                + [seg(hand + side * (k - 1.5) * 0.011, hand + side * (k - 1.5) * 0.014 + out * 0.035 + up * 0.008,
                       0.0055) for k in range(4)])
    head = at + out * 0.03 + up * 0.01
    blobs = [blob(head, (0.034, 0.03, 0.04), along=tuple(up)), blob(head + out * 0.018 - up * 0.03, (0.022, 0.02, 0.016))]
    if kind in ('shoulders', 'torso'):
        chest = at + out * 0.01 - up * 0.07
        blobs.append(blob(chest, (0.06, 0.032, 0.05), along=tuple(up)))
        for s in (1.0, -1.0):   # its arms, one reaching out, one held to it, each one piece from the shoulder
            shoulder = chest + side * 0.055 * s + up * 0.03
            reach = out * (0.07 if s > 0 else 0.03) + up * (0.03 if s > 0 else -0.05) + side * 0.03 * s
            blobs.append(seg(shoulder, shoulder + reach * 1.5, 0.021))
    return blobs


def fused(fighter, flesh, hollow):
    """Each fused person, and the hollows of its face, with the joint that carries them."""
    made = []
    for k, (joint, at, out, kind) in enumerate(sites(fighter)):
        mesh = blob_mesh(f'heart_person_{k}', grown(shaped(kind, at, out), at), res=0.004)
        mesh.materials.append(flesh)
        made.append((joint, growth.linked(mesh.name, mesh)))
        if kind != 'arm':
            dark = blob_mesh(f'heart_face_{k}', grown(faces(at, out), at), res=0.003)
            dark.materials.append(hollow)
            made.append((joint, growth.linked(dark.name, dark)))
    return made


def cage(crystal, heart, dark):
    """Dark crystal ribs across the opening in its chest, the heart huge and glowing behind them, a dark wet hollow
    behind that."""
    middle = np.array((0.0, -0.06, (HOLE['low'] + HOLE['high']) / 2))
    made = []
    for k, z in enumerate(np.linspace(HOLE['low'] + 0.05, HOLE['high'] - 0.05, 3)):
        for s in (1.0, -1.0):   # a rib from each side, curving forward, not meeting: a gap to see the heart through
            base = np.array((HOLE['width'] * s, -0.1, z))
            made.append(growth.shard(f'heart_rib_{k}_{s:+.0f}', base, (-s, -0.6, -0.12), HOLE['width'] * 0.8, 0.024,
                                     k, growth.DEEP[crystal.name], widest=0.35))
    made.append(growth.shard('heart_sternum', np.array((0.0, -0.12, HOLE['low'] - 0.02)), (0, -0.15, 1),
                             HOLE['high'] - HOLE['low'] + 0.04, 0.018, 0.0, growth.DEEP[crystal.name], widest=0.5))
    big = 1.6   # grown huge, filling the hollow and pressing out between the ribs
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
    a, b = np.asarray(a, float), np.asarray(b, float)
    _, side, other = growth.frame_of(b - a)
    ring = [np.cos(t) * side + np.sin(t) * other for t in np.linspace(0, 2 * np.pi, sides, endpoint=False)]
    faces = [(k, (k + 1) % sides, sides + (k + 1) % sides, sides + k) for k in range(sides)]
    faces += [tuple(range(sides - 1, -1, -1)), tuple(range(sides, 2 * sides))]
    return growth.mesh_of(name, [a + r * radius for r in ring] + [b + r * radius for r in ring], faces, [material])


def anchor(iron, rust, crystal):
    """A ship's anchor held by its ring in the fist: the shank down from the ring along the hand, the stock across it
    below the fist, the crown at the foot with its two arms curving up to rusted flukes, barnacles crusted on them;
    its chain wrapped round the wrist; crystal grown on it from the hand that holds it."""
    wrist, way = growth.forearm('R')
    _, across, flat = growth.frame_of(way)   # the arms spread square to the stock, as an anchor's do
    grip, foot = wrist + way * 0.06, wrist + way * ANCHOR
    ring = [grip + (np.cos(t) * way + np.sin(t) * flat) * 0.05 for t in np.linspace(0, 2 * np.pi, 9)]
    made = [bar('anchor_shank', grip + way * 0.05, foot, 0.032, iron),
            bar('anchor_stock', wrist + way * 0.22 - across * 0.32, wrist + way * 0.22 + across * 0.32, 0.022, iron),
            *(bar(f'anchor_ring_{k}', a, b, 0.012, iron) for k, (a, b) in enumerate(zip(ring, ring[1:])))]
    arms = []
    for s in (1.0, -1.0):   # the arms sweep out and up from the crown to broad flukes
        elbow = foot + flat * 0.2 * s - way * 0.05
        tip = foot + flat * 0.34 * s - way * 0.26
        arms += [(foot, elbow), (elbow, tip)]
        made += [bar(f'anchor_arm_{s:+.0f}', foot, elbow, 0.03, iron), bar(f'anchor_arm_up_{s:+.0f}', elbow, tip, 0.026, iron),
                 growth.shard(f'anchor_fluke_{s:+.0f}', tip + way * 0.1, -way + flat * 0.5 * s, 0.17, 0.08, 0.0, rust,
                              widest=0.3)]
    for k in range(4):   # its chain, each link round the wrist a quarter turn on from the last
        middle, t = wrist - way * (0.06 + 0.03 * k), k * np.pi / 2
        made.append(bar(f'anchor_link_{k}', middle + (across * np.cos(t) + flat * np.sin(t)) * 0.055,
                        middle + (across * np.cos(t + np.pi / 2) + flat * np.sin(t + np.pi / 2)) * 0.055, 0.008, iron))
    pick = np.random.default_rng(SEED + 5)
    for k in range(5):   # the crystal has taken it too
        at = grip + way * pick.uniform(0.15, 0.7)
        made.append(growth.shard(f'anchor_crystal_{k}', at, pick.normal(0, 1, 3) + way * 0.3, pick.uniform(0.05, 0.1),
                                 0.022, k, crystal))
    shells = []   # barnacles from its years down, crusted on its arms
    for a, b in arms:
        for _ in range(3):
            on = a + (b - a) * pick.uniform(0.2, 0.9)
            shells.append(blob(on + growth.tangent(growth.frame_of(b - a)[0], pick) * 0.028, (0.016, 0.016, 0.012)))
    mesh = blob_mesh('anchor_barnacles', shells, res=0.003)
    mesh.materials.append(materials.plain('lattice.heart_barnacle', (0.2, 0.19, 0.16), rough=0.9))
    made.append(growth.linked(mesh.name, mesh))
    return made


def torn(flesh, hollow, blood):
    """The person it tears out of itself, gripped by the head in its left fist and hanging from its palm, looking out,
    bloodied: shown only as it is torn out and flung, the palm turned down to hold it (heart_moves.py `tear`)."""
    wrist, way = growth.forearm('L')
    down = np.array((-1.0, 0.0, 0.0))   # the way the left palm faces at rest (rig.py `solve_arm`)
    ahead = np.cross(way, down) / np.linalg.norm(np.cross(way, down))
    across = way
    head = wrist + way * 0.1 + down * 0.05
    body = [blob(head, (0.034, 0.03, 0.04), along=tuple(down)), seg(head + down * 0.05, head + down * 0.17, 0.05, 0.032),
            *(seg(head + down * 0.06 + across * 0.05 * s, head + down * 0.2 + across * 0.07 * s, 0.014) for s in (1, -1)),
            *(seg(head + down * 0.17 + across * 0.022 * s, head + down * 0.34 + across * 0.03 * s, 0.018) for s in (1, -1))]
    soaked = [seg(head + down * 0.06 + ahead * 0.02, head + down * 0.2 + ahead * 0.03, 0.035, 0.02)]
    face = faces(head - ahead * 0.03 + down * 0.01, ahead, up=-down)
    made = []
    for name, blobs, paint in (('heart_torn', body, flesh), ('heart_torn_blood', soaked, blood),
                               ('heart_torn_face', face, hollow)):
        mesh = blob_mesh(name, grown(blobs, head), res=0.004)
        mesh.materials.append(paint)
        made.append(growth.linked(mesh.name, mesh))
    return made


def parts(fighter):
    crystal = growth.crystal_material('red')
    flesh = materials.plain('lattice.heart_flesh', FLESH, rough=0.45, spec=0.4)
    heart = growth.glowing('lattice.heart_heart', HEART, 1.2, HEART_GLOW, rough=0.2, spec=0.8)
    dark = materials.plain('lattice.heart_hollow', HOLLOW, rough=0.3)
    blood = materials.plain('lattice.heart_blood', growth.STRAINS['red']['blood'], rough=0.2, spec=0.6)
    iron = materials.plain('lattice.heart_iron', IRON, metal=0.5, rough=0.6)
    rust = materials.plain('lattice.heart_rust', RUST, metal=0.2, rough=0.8)
    people = [ob for joint, ob in fused(fighter, flesh, dark) for ob in growth.hung(fighter, joint, [ob])]
    ribs, organ = cage(crystal, heart, dark)
    return {'fused': people + growth.hung(fighter, 'chest', ribs), 'core': growth.hung(fighter, 'chest', organ),
            'anchor': growth.hung(fighter, 'hand_R', anchor(iron, rust, crystal)),
            'torn': growth.hung(fighter, 'hand_L', torn(flesh, dark, blood))}
