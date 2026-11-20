"""The Lattice's Husk drawn by the Sprite Forge: the forge's own bare body with red crystal broken out through its
skull, shoulders and spine, a torn wound round each, rendered as the forge renders a layer. Run from tools/forge/ with
Blender's module:

    python -I ../lattice/husk.py --body male --anims idle,walk --out <folder>

It writes the forge's strips, `body_<move>` and `lattice_husk_<move>` with their depth twins, into <folder>/<body>.
Nothing inside tools/forge/ changes: the forge's index, keys and fitted lists go to <folder> too."""
import os
import sys

FORGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'forge', 'tools', 'sprite-forge')
sys.path.insert(0, os.path.abspath(FORGE))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import anatomy  # noqa: E402
import layers  # noqa: E402
import materials  # noqa: E402
from body import blob, blob_mesh  # noqa: E402
from gear import hang  # noqa: E402

CRYSTAL_RED = (0.30, 0.01, 0.02)
CRYSTAL_GLOW = (0.9, 0.08, 0.05)
GLOW_STRENGTH = 0.35   # a little light of its own, so the crystal shows in shadow without drowning its facets
WOUND_RED = (0.09, 0.01, 0.008)
FLESH_RED = (0.2, 0.055, 0.045)   # torn flesh round a wound, raw and wet
BLOOD_RED = (0.07, 0.004, 0.004)   # blood run from each wound, dark and wet
SEED = 7

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
]
MOUTH = lambda p: (p[:, 1] < -0.07) & (np.abs(p[:, 0]) < 0.025) & (np.abs(p[:, 2] - 1.6) < 0.015)   # noqa: E731


def crystal_material():
    m = materials.plain('lattice.crystal', CRYSTAL_RED, rough=0.08, spec=1.0)
    shader = m.node_tree.nodes['Principled BSDF']
    shader.inputs['Emission Color'].default_value = (*CRYSTAL_GLOW, 1)
    shader.inputs['Emission Strength'].default_value = GLOW_STRENGTH
    return m


def shard(name, base, way, length, radius, turn, material):
    """A six-sided shard: sunk a little under the skin at `base`, its widest ring two thirds out, its point at
    `length` along `way`. Flat faces, so each facet catches the light on its own."""
    way = way / np.linalg.norm(way)
    side = np.cross(way, (0.0, 0.0, 1.0) if abs(way[2]) < 0.9 else (1.0, 0.0, 0.0))
    side /= np.linalg.norm(side)
    other = np.cross(way, side)
    ring = [np.cos(turn + k * np.pi / 3) * side + np.sin(turn + k * np.pi / 3) * other for k in range(6)]
    root = base - way * radius
    points = ([root + r * radius * 0.6 for r in ring] + [base + way * length * 0.66 + r * radius for r in ring]
              + [base + way * length, root])
    faces = [(k, (k + 1) % 6, 6 + (k + 1) % 6, 6 + k) for k in range(6)]
    faces += [(6 + k, 6 + (k + 1) % 6, 12) for k in range(6)] + [((k + 1) % 6, k, 13) for k in range(6)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(p) for p in points], [], faces)
    mesh.materials.append(material)
    mesh.update()
    return linked(name, mesh)


def linked(name, mesh):
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def torn(at, normal, width, pick):
    """A wound's torn edge: small flat lumps in a broken ring round a shard's base, each a little off the ring."""
    side = np.cross(normal, (0.0, 0.0, 1.0) if abs(normal[2]) < 0.9 else (1.0, 0.0, 0.0))
    side /= np.linalg.norm(side)
    other = np.cross(normal, side)
    lumps = []
    for k in range(5):
        turn = k * 2 * np.pi / 5 + pick.uniform(-0.4, 0.4)
        centre = at + (np.cos(turn) * side + np.sin(turn) * other) * width * pick.uniform(0.9, 1.3)
        size = width * pick.uniform(0.35, 0.6)
        lumps.append(blob(centre, (size, size, 0.007), along=tuple(normal)))
    return lumps


def gore(husk, wounds, pick):
    """The flesh torn round each wound, and the blood run down the skin from it and from the mouth: shells of the skin
    as the forge paints a face, so they bend with the body. The blood lies under the flesh, both under any cloth."""
    skin = husk.skins[0]
    p = skin.rest
    mouth = p[MOUTH(p)].mean(axis=0)
    flesh = np.zeros(len(p), bool)
    blood = np.zeros(len(p), bool)
    for at, width in [*wounds, (mouth, 0.012)]:
        near = np.linalg.norm(p - at, axis=1)
        torn = min(width * 1.8, 0.06)   # a great crystal's wound kept off the face, so the head still reads as one
        flesh |= near < torn
        blood |= near < torn * 1.4
        wander = at[0] + 0.012 * np.sin(p[:, 2] * 35 + pick.uniform(0, 2 * np.pi))
        across = (p[:, 0] - wander) ** 2 + 0.3 * (p[:, 1] - at[1]) ** 2
        blood |= (across < max(width * 0.6, 0.012) ** 2) & (p[:, 2] < at[2]) & (p[:, 2] > at[2] - pick.uniform(0.2, 0.5))
    plain = materials.plain
    husk.skins.append(skin.shell('lattice_blood', plain('lattice.blood', BLOOD_RED, rough=0.2, spec=0.8), blood, 0.0025))
    husk.skins.append(skin.shell('lattice_flesh', plain('lattice.flesh', FLESH_RED, rough=0.3, spec=0.6), flesh, 0.004))
    return [husk.skins[-2].ob, husk.skins[-1].ob]


def grow(husk, crystal, wound):
    """Every cluster's shards on the shaped body, and under each shard a torn wound, a flat swelling of wet flesh
    round where it broke out; each cluster hung on its joint as the forge hangs a helm's pieces."""
    skin = husk.skins[0]
    points = skin.rest
    normals = np.array([v.normal for v in skin.me.vertices])
    piece = np.array(anatomy.PIECES)[np.argmax(skin.alpha, axis=1)]
    pick = np.random.default_rng(SEED)
    made, wounds = [], []
    for c, cluster in enumerate(CLUSTERS):
        on = np.nonzero(piece == cluster['piece'])[0]
        middle = on[np.argmax(cluster['middle'](points[on], normals[on]))]
        near = on[np.linalg.norm(points[on] - points[middle], axis=1) <= cluster['spread']]
        chosen = [middle, *pick.choice(near, size=min(cluster['count'] - 1, len(near)), replace=False)]
        lumps = []
        for k, at in enumerate(chosen):
            width = cluster['width'] * (1.0 if k == 0 else pick.uniform(0.6, 1.0))
            way = normals[at] + np.array(cluster['lean']) + pick.normal(0.0, 0.2, 3)
            ob = shard(f'lattice_{c}_{k}', points[at], way, pick.uniform(*cluster['length']), width,
                       pick.uniform(0, np.pi), crystal)
            hang(husk.parts, ob, cluster['joint'])
            made.append(ob)
            lumps += torn(points[at], normals[at], width, pick)
            wounds.append((points[at], width))
        mesh = blob_mesh(f'lattice_wound_{c}', lumps, res=0.003)
        mesh.materials.append(wound)
        ob = linked(mesh.name, mesh)
        hang(husk.parts, ob, cluster['joint'])
        made.append(ob)
    return made + gore(husk, wounds, pick)


def husk_layers(body, classify, want=None):
    husk = layers.Bare(body, 'axe')
    grown = grow(husk, crystal_material(), materials.plain('lattice.wound', WOUND_RED, rough=0.25, spec=0.7))
    skins = {sk.ob.name: sk.ob for sk in husk.skins}
    hands = [ob for kinds in husk.hands.values() for ob in kinds.values()]
    return [layers.Layer('body', husk, [skins['body'], *hands], classify),
            layers.Layer('lattice_husk', husk, grown, classify)]


if __name__ == '__main__':
    layers.LOOKS = os.path.join(sys.argv[sys.argv.index('--out') + 1], 'forgeLooks.json')   # never the studio's
    layers.build_layers = husk_layers
    sys.argv += ['--layers', 'body,lattice_husk']
    layers.main()
