"""The Lattice's crystal on a forge body: shards broken out through the skin in clusters, a torn wound round each, and
the flesh and blood about them as shells of the skin. A foe's own module (husk.py and the rest) says where its crystal
grows; this draws it the same way for every one."""
import bpy
import numpy as np

import anatomy
import materials
from body import blob, blob_mesh
from gear import hang

# each strain's crystal (its colour, its own dim light) and its wounds: the red the overtaken's, the purple the
# displaced's, their flesh dry and their blood long gone dark
STRAINS = {
    'red': dict(crystal=(0.30, 0.01, 0.02), glow=(0.9, 0.08, 0.05), wound=(0.09, 0.01, 0.008),
                flesh=(0.2, 0.055, 0.045), blood=(0.07, 0.004, 0.004)),
    'purple': dict(crystal=(0.16, 0.02, 0.30), glow=(0.55, 0.12, 1.0), wound=(0.05, 0.02, 0.04),
                   flesh=(0.12, 0.06, 0.08), blood=(0.03, 0.006, 0.02)),
}
GLOW_STRENGTH = 0.35   # a little light of its own, so the crystal shows in shadow without drowning its facets
MOUTH = lambda p: (p[:, 1] < -0.07) & (np.abs(p[:, 0]) < 0.025) & (np.abs(p[:, 2] - 1.6) < 0.015)   # noqa: E731


def crystal_material(strain, glow=GLOW_STRENGTH):
    colours = STRAINS[strain]
    m = materials.plain(f'lattice.crystal_{strain}', colours['crystal'], rough=0.08, spec=1.0)
    shader = m.node_tree.nodes['Principled BSDF']
    shader.inputs['Emission Color'].default_value = (*colours['glow'], 1)
    shader.inputs['Emission Strength'].default_value = glow
    return m


def linked(name, mesh):
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def frame_of(way):
    """Two directions square to `way` and to each other."""
    way = way / np.linalg.norm(way)
    side = np.cross(way, (0.0, 0.0, 1.0) if abs(way[2]) < 0.9 else (1.0, 0.0, 0.0))
    side /= np.linalg.norm(side)
    return way, side, np.cross(way, side)


def shard(name, base, way, length, radius, turn, material, widest=0.66):
    """A six-sided shard: sunk a little under the skin at `base`, its widest ring `widest` of the way out, its point
    at `length` along `way`. Flat faces, so each facet catches the light on its own."""
    way, side, other = frame_of(np.asarray(way, float))
    ring = [np.cos(turn + k * np.pi / 3) * side + np.sin(turn + k * np.pi / 3) * other for k in range(6)]
    root = base - way * radius
    points = ([root + r * radius * 0.6 for r in ring] + [base + way * length * widest + r * radius for r in ring]
              + [base + way * length, root])
    faces = [(k, (k + 1) % 6, 6 + (k + 1) % 6, 6 + k) for k in range(6)]
    faces += [(6 + k, 6 + (k + 1) % 6, 12) for k in range(6)] + [((k + 1) % 6, k, 13) for k in range(6)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(p) for p in points], [], faces)
    mesh.materials.append(material)
    mesh.update()
    return linked(name, mesh)


def torn(at, normal, width, pick):
    """A wound's torn edge: small flat lumps in a broken ring round a shard's base, each a little off the ring."""
    _, side, other = frame_of(np.asarray(normal, float))
    lumps = []
    for k in range(5):
        turn = k * 2 * np.pi / 5 + pick.uniform(-0.4, 0.4)
        centre = at + (np.cos(turn) * side + np.sin(turn) * other) * width * pick.uniform(0.9, 1.3)
        size = width * pick.uniform(0.35, 0.6)
        lumps.append(blob(centre, (size, size, 0.007), along=tuple(normal)))
    return lumps


def gore(fighter, wounds, strain, pick):
    """The flesh torn round each wound, and the blood run down the skin from it and from the mouth: shells of the skin
    as the forge paints a face, so they bend with the body. Both stand just past a shirt's band off the skin, so any
    cloth is soaked with the blood and torn open on the flesh; the blood lies under the flesh."""
    skin = fighter.skins[0]
    p = skin.rest
    flesh = np.zeros(len(p), bool)
    blood = np.zeros(len(p), bool)
    mouth = [(p[MOUTH(p)].mean(axis=0), 0.012)] if MOUTH(p).any() else []   # a headless foe bleeds from none
    for at, width in [*wounds, *mouth]:
        near = np.linalg.norm(p - at, axis=1)
        reach = min(width * 1.8, 0.06)   # a great crystal's wound kept off the face, so the head still reads as one
        flesh |= near < reach
        blood |= near < reach * 1.4
        wander = at[0] + 0.012 * np.sin(p[:, 2] * 35 + pick.uniform(0, 2 * np.pi))
        across = (p[:, 0] - wander) ** 2 + 0.3 * (p[:, 1] - at[1]) ** 2
        run = pick.uniform(0.2, 0.5)
        blood |= (across < max(width * 0.6, 0.012) ** 2) & (p[:, 2] < at[2]) & (p[:, 2] > at[2] - run)
    colours = STRAINS[strain]
    blood_paint = materials.plain(f'lattice.blood_{strain}', colours['blood'], rough=0.2, spec=0.8)
    flesh_paint = materials.plain(f'lattice.flesh_{strain}', colours['flesh'], rough=0.3, spec=0.6)
    fighter.skins.append(skin.shell('lattice_blood', blood_paint, blood, 0.0065))
    fighter.skins.append(skin.shell('lattice_flesh', flesh_paint, flesh, 0.0075))
    return [fighter.skins[-2].ob, fighter.skins[-1].ob]


def grow(fighter, clusters, strain, seed):
    """Every cluster's shards on the shaped body, and under each a torn wound round where it broke out; each cluster
    hung on its joint as the forge hangs a helm's pieces. Returns the crystal and wounds, and the gore."""
    skin = fighter.skins[0]
    points = skin.rest
    normals = np.array([v.normal for v in skin.me.vertices])
    piece = np.array(anatomy.PIECES)[np.argmax(skin.alpha, axis=1)]
    pick = np.random.default_rng(seed)
    crystal = crystal_material(strain)
    wound = materials.plain(f'lattice.wound_{strain}', STRAINS[strain]['wound'], rough=0.25, spec=0.7)
    made, wounds = [], []
    for c, cluster in enumerate(clusters):
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
            hang(fighter.parts, ob, cluster['joint'])
            made.append(ob)
            lumps += torn(points[at], normals[at], width, pick)
            wounds.append((points[at], width))
        mesh = blob_mesh(f'lattice_wound_{c}', lumps, res=0.003)
        mesh.materials.append(wound)
        ob = linked(mesh.name, mesh)
        hang(fighter.parts, ob, cluster['joint'])
        made.append(ob)
    return made, gore(fighter, wounds, strain, pick) if wounds else []
