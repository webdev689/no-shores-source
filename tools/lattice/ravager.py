"""The Ravager, the Husk gone ranged. After the owner's own in project-final: the Husk's body, red, reading apart by
what it carries, not its colour: a ragged crystal hood over its head in place of the Husk's great crystal, open at the
front so the face reads in shadow with its two eyes glowing through, swept back to a peak, ragged points hanging off
its rim; a mantle of two rows of hanging shards round the shoulders, open at the front and longer behind; and a
crystal blade grown out of each hand, its edge the weapon when cornered. Project-final's gun-blades are reshaped:
no firearms, so it hurls the shards that grow on its blades. In a townsman's vest. Drawn by render.py; its moves are
ravager_moves.py's."""
import numpy as np

import growth
import materials
from gear import hang
from ravager_moves import MOVES  # noqa: F401
from rig import rest

STRAIN = 'red'
SEED = 17
OUTFIT = ['shirt_short_v', 'vest', 'belt', 'casual_pants', 'tall_boots']   # a townsman's, the forge's archive 384
PARTS = ['shroud', 'blades']
EYES = (1.0, 0.25, 0.18)
BLADE = dict(length=0.56, width=0.11, thick=0.042)   # project-final's own blade, metres past the knuckles

CLUSTERS = [
    dict(piece='arm_L', joint='farm_L', middle=lambda p, n: -4 * np.abs(p[:, 2] - 1.05) + n[:, 0] - n[:, 1],
         count=4, spread=0.06, length=(0.04, 0.1), width=0.026, lean=(0.5, -0.3, 0.1)),   # shards growing to throw
    dict(piece='arm_R', joint='farm_R', middle=lambda p, n: -4 * np.abs(p[:, 2] - 1.05) - n[:, 0] - n[:, 1],
         count=4, spread=0.06, length=(0.04, 0.1), width=0.026, lean=(-0.5, -0.3, 0.1)),
    dict(piece='torso', joint='chest', middle=lambda p, n: -np.abs(p[:, 2] - 1.25) - 2 * np.abs(p[:, 0] + 0.06) - p[:, 1],
         count=4, spread=0.08, length=(0.05, 0.12), width=0.032, lean=(-0.2, -0.6, 0.1)),  # through the chest
    dict(piece='skull', joint='head', middle=lambda p, n: -2.0 * p[:, 0] - 1.0 * p[:, 1] + 0.2 * p[:, 2],
         count=2, spread=0.04, length=(0.04, 0.08), width=0.022, lean=(-0.6, -0.3, 0.3)),  # through the right cheek
]


def hood(fighter, crystal, eye):
    """Shards round the head but its face, swept back to a peak, ragged points off the rim about the face, and two
    eyes glowing in the shadow under it."""
    skin = fighter.skins[0]
    p = skin.rest
    normals = np.array([v.normal for v in skin.me.vertices])
    head = np.nonzero(p[:, 2] > 1.52)[0]
    front = p[head, 1].min()
    pick = np.random.default_rng(SEED)
    behind = head[p[head, 1] > front + 0.05]   # all of the head but its face
    made = []
    for k, at in enumerate(pick.choice(behind, size=18, replace=False)):
        peak = max(0.0, p[at, 1] - front - 0.1) * 1.2 + max(0.0, p[at, 2] - 1.7) * 1.2   # longer up and back
        made.append(growth.shard(f'ravager_hood_{k}', p[at], normals[at] + np.array((0.0, 0.5, 0.2)),
                                 0.05 + peak + pick.uniform(0, 0.04), 0.032, pick.uniform(0, np.pi), crystal))
    rim = head[np.abs(p[head, 1] - front - 0.06) < 0.02]
    for k, at in enumerate(pick.choice(rim, size=min(8, len(rim)), replace=False)):
        made.append(growth.shard(f'ravager_rim_{k}', p[at] + np.array((0.0, -0.02, 0.0)), (0.0, -0.3, -1.0),
                                 pick.uniform(0.05, 0.1), 0.016, k, crystal))
    for side in (1.0, -1.0):
        made.append(growth.shard(f'ravager_eye_{side:+.0f}', np.array((0.032 * side, front + 0.004, 1.635)),
                                 (0.0, -1.0, 0.0), 0.012, 0.009, 0.0, eye, widest=0.5))
    return made


def mantle(crystal):
    """Two rows of shards hanging from a ring round the shoulders, open at the front, longer behind."""
    pick = np.random.default_rng(SEED + 1)
    made = []
    for row, (ring, drop) in enumerate(((0.31, 0.0), (0.25, 0.08))):
        for k, t in enumerate(np.linspace(0, 2 * np.pi, 16, endpoint=False)):
            out = np.array((np.cos(t), np.sin(t), 0.0))   # y > 0 behind
            if out[1] < -0.55:   # open at the front, for the arms
                continue
            behind = (out[1] + 1) / 2
            base = np.array((out[0] * ring, out[1] * ring * 0.8, 1.5 - drop))
            way = out * 0.12 + np.array((0.0, 0.1, -1.0))   # hanging, not swept
            made.append(growth.shard(f'ravager_mantle_{row}_{k}', base, way,
                                     0.14 + 0.28 * behind * (1.0 - row * 0.3) + pick.uniform(0, 0.06), 0.03, t,
                                     crystal, widest=0.2))
    return made


def blade(side, crystal):
    """A flat blade grown from the knuckles along the fist's line, a diamond in section, widest a third of the way."""
    import bpy
    x = 1.0 if side == 'L' else -1.0
    wrist = np.array(rest(f'hand_{side}'))
    way = wrist - np.array(rest(f'farm_{side}'))
    way /= np.linalg.norm(way)
    start = wrist + way * 0.09
    edge, flat = np.array((x * 0.5, -0.86, 0.0)), np.array((x * 0.86, 0.5, 0.0))
    points, faces = [], []
    stations = [(0.0, 0.5), (0.33, 1.0), (0.8, 0.6), (1.0, 0.0)]
    for s, wide in stations:
        at = start + way * BLADE['length'] * s
        half = BLADE['width'] * wide / 2
        points += [at + edge * half, at + flat * BLADE['thick'] / 2, at - edge * half, at - flat * BLADE['thick'] / 2]
    for k in range(len(stations) - 1):
        a, b = 4 * k, 4 * (k + 1)
        faces += [(a + i, a + (i + 1) % 4, b + (i + 1) % 4, b + i) for i in range(4)]
    mesh = bpy.data.meshes.new(f'ravager_blade_{side}')
    mesh.from_pydata([tuple(q) for q in points], [], faces)
    mesh.materials.append(crystal)
    mesh.update()
    return growth.linked(mesh.name, mesh)


def parts(fighter):
    crystal = growth.crystal_material('red')
    eye = materials.plain('lattice.ravager_eye', EYES, rough=0.1)
    shader = eye.node_tree.nodes['Principled BSDF']
    shader.inputs['Emission Color'].default_value = (*EYES, 1)
    shader.inputs['Emission Strength'].default_value = 4.0
    shroud = hood(fighter, crystal, eye)
    for ob in shroud:
        hang(fighter.parts, ob, 'head')
    cloak = mantle(crystal)
    for ob in cloak:
        hang(fighter.parts, ob, 'chest')
    blades = []
    for side in ('L', 'R'):
        ob = blade(side, crystal)
        hang(fighter.parts, ob, f'hand_{side}')
        blades.append(ob)
    return {'shroud': shroud + cloak, 'blades': blades}
