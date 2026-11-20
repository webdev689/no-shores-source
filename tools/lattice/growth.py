"""The Lattice's crystal on a forge body: shards broken out through the skin in clusters, each dark at its root and
bright toward its point; a torn wound round each; the flesh and blood about them, the blood spattered, and the
crystal's veins creeping under the skin from every wound, as shells of the skin. A foe's module says where its crystal
grows; this draws it the same way for every one, and holds the shapes every foe builds from."""
import bpy
import numpy as np

import anatomy
import materials
from body import blob, blob_mesh, normals
from gear import hang
from rig import rest

# each strain's crystal (its colour, its own dim light) and its wounds: the red the overtaken's, the purple the
# displaced's, their flesh dry and their blood long gone dark
STRAINS = {
    'red': dict(crystal=(0.30, 0.01, 0.02), glow=(0.9, 0.08, 0.05), wound=(0.09, 0.01, 0.008),
                flesh=(0.2, 0.055, 0.045), blood=(0.07, 0.004, 0.004)),
    'purple': dict(crystal=(0.16, 0.02, 0.30), glow=(0.55, 0.12, 1.0), wound=(0.05, 0.02, 0.04),
                   flesh=(0.12, 0.06, 0.08), blood=(0.03, 0.006, 0.02)),
}
GLOW_STRENGTH = 0.35   # a little light of its own, so the crystal shows in shadow without drowning its facets
SHINE = dict(rough=0.32, spec=0.45)   # facets that catch the light without flashing white in a frame
DEEP = {}   # each crystal's darker twin, by name, for the roots of its shards (`shard`)
MOUTH = lambda p: (p[:, 1] < -0.07) & (np.abs(p[:, 0]) < 0.025) & (np.abs(p[:, 2] - 1.6) < 0.015)   # noqa: E731


def glowing(name, colour, strength, glow=None, rough=SHINE['rough'], spec=SHINE['spec']):
    """A plain material with a light of its own, in `glow`'s colour or its own."""
    material = materials.plain(name, colour, rough=rough, spec=spec)
    shader = material.node_tree.nodes['Principled BSDF']
    shader.inputs['Emission Color'].default_value = (*(glow or colour), 1)
    shader.inputs['Emission Strength'].default_value = strength
    return material


def crystal_material(strain, glow=GLOW_STRENGTH):
    """A strain's crystal, and its darker twin for the roots of its shards."""
    colours = STRAINS[strain]
    bright = glowing(f'lattice.crystal_{strain}', colours['crystal'], glow, colours['glow'])
    # matte: a broad dark face (a shield's, a rib's) that mirrored the light would render as noise at a sprite's samples
    DEEP[bright.name] = glowing(f'lattice.deep_{strain}', tuple(c * 0.4 for c in colours['crystal']), glow * 0.25,
                                colours['glow'], rough=0.65, spec=0.3)
    return bright


def linked(name, mesh):
    ob = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def hung(fighter, joint, obs):
    """Each of `obs` hung on `joint`, as the forge hangs a helm's pieces."""
    for ob in obs:
        hang(fighter.parts, ob, joint)
    return list(obs)


def skin_of(fighter):
    """The body's skin: each vertex's rest place, its way out of the skin, and the anatomy piece it belongs to."""
    skin = fighter.skins[0]
    return skin.rest, normals(skin.me), np.array(anatomy.PIECES)[np.argmax(skin.alpha, axis=1)]


def best(points, ways, piece, where, score):
    """The vertex of the body's piece `where` that `score` rates highest."""
    on = np.nonzero(piece == where)[0]
    if not len(on):
        raise ValueError(f'the body has no {where} left to grow from: the foe cut it away')
    return on[np.argmax(score(points[on], ways[on]))]


def forearm(side):
    """The wrist's rest place, and the way the forearm runs to it."""
    wrist = np.array(rest(f'hand_{side}'))
    way = wrist - np.array(rest(f'farm_{side}'))
    return wrist, way / np.linalg.norm(way)


def frame_of(way):
    """`way`, and two directions square to it and to each other."""
    way = way / np.linalg.norm(way)
    side = np.cross(way, (0.0, 0.0, 1.0) if abs(way[2]) < 0.9 else (1.0, 0.0, 0.0))
    side /= np.linalg.norm(side)
    return way, side, np.cross(way, side)


def mesh_of(name, points, faces, kinds, kind_of_face=None):
    """A mesh object of `points` and `faces`, every face turned to face out from the middle of its points, so both
    hands' pieces shade alike; `kinds` its materials, `kind_of_face` which each face wears."""
    points = [np.asarray(q, float) for q in points]
    middle = np.mean(points, axis=0)
    facing = []
    for face in faces:
        corners = [points[i] for i in face]
        out = np.cross(corners[1] - corners[0], corners[2] - corners[0])
        facing.append(face if out @ (np.mean(corners, axis=0) - middle) >= 0 else tuple(reversed(face)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(q) for q in points], [], facing)
    for kind in kinds:
        mesh.materials.append(kind)
    if kind_of_face:
        mesh.polygons.foreach_set('material_index', kind_of_face)
    mesh.update()
    return linked(name, mesh)


def shard(name, base, way, length, radius, turn, material, widest=0.66):
    """A six-sided shard: sunk a little under the skin at `base`, its widest ring `widest` of the way out, its point
    at `length` along `way`. Flat faces, so each facet catches the light on its own; a crystal with a darker twin
    (`DEEP`) is dark from its root to its widest and bright from there to its point, so it reads as deep and lit."""
    way, side, other = frame_of(np.asarray(way, float))
    ring = [np.cos(turn + k * np.pi / 3) * side + np.sin(turn + k * np.pi / 3) * other for k in range(6)]
    root = base - way * radius
    points = ([root + r * radius * 0.6 for r in ring] + [base + way * length * widest + r * radius for r in ring]
              + [base + way * length, root])
    faces = [(k, (k + 1) % 6, 6 + (k + 1) % 6, 6 + k) for k in range(6)]
    faces += [(6 + k, 6 + (k + 1) % 6, 12) for k in range(6)] + [((k + 1) % 6, k, 13) for k in range(6)]
    if material.name in DEEP:
        return mesh_of(name, points, faces, [DEEP[material.name], material], [0] * 6 + [1] * 6 + [0] * 6)
    return mesh_of(name, points, faces, [material])


def blade(name, start, way, edge, flat, size, stations, crystal):
    """A flat blade from `start` along `way`, a diamond in section: its leading edge toward `edge`, its flats facing
    `flat`; `size` its (length, width, thickness); each station a (share of its length, share of its width). The faces
    either side of its leading edge are bright, its back dark, so the edge reads as sharp."""
    length, width, thick = size
    points, faces = [], []
    for share, wide in stations:
        at = start + way * length * share
        half = width * wide / 2
        points += [at + edge * half, at + flat * thick / 2, at - edge * half * 0.7, at - flat * thick / 2]
    for k in range(len(stations) - 1):
        faces += [(4 * k + i, 4 * k + (i + 1) % 4, 4 * (k + 1) + (i + 1) % 4, 4 * (k + 1) + i) for i in range(4)]
    bright = [1 if i in (0, 3) else 0 for _ in range(len(stations) - 1) for i in range(4)]
    return mesh_of(name, points, faces, [DEEP.get(crystal.name, crystal), crystal], bright)


def plate(name, middle, out, along, rim, depth, material, edge=None):
    """A flat, faceted plate on `middle` facing `out`: its rim each (along, across) in metres, its face rising `depth`
    to its middle, as thick behind; its rim's sides in `edge`, if given, so it reads bevelled."""
    across = np.cross(along, out)
    front = [middle + along * a + across * c for a, c in rim]
    back = [q - out * depth for q in front]
    count = len(rim)
    faces = [(k, (k + 1) % count, 2 * count) for k in range(count)]
    faces += [((k + 1) % count, k, count + k, count + (k + 1) % count) for k in range(count)]
    faces += [tuple(range(2 * count - 1, count - 1, -1))]
    if edge is None:
        return mesh_of(name, front + back + [middle + out * depth], faces, [material])
    return mesh_of(name, front + back + [middle + out * depth], faces, [material, edge],
                   [0] * count + [1] * count + [0])


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


def tangent(normal, pick):
    """A random way along the skin at a point whose way out is `normal`."""
    way = pick.normal(0.0, 1.0, 3)
    way -= normal * (way @ normal)
    return way / np.linalg.norm(way)


def nearest(points, at):
    return int(np.argmin(np.linalg.norm(points - at, axis=1)))


def creeping(points, ways, start, pick, steps):
    """A vein's path over the skin from vertex `start`: steps of 2.5 cm, each snapped to the skin and turned a little,
    now and then forking. Returns the points along it."""
    path, heads = [], [(start, tangent(ways[start], pick), steps)]
    while heads:
        at, way, left = heads.pop()
        while left > 0:
            at = nearest(points, points[at] + way * 0.025)
            path.append(points[at])
            way = way + tangent(ways[at], pick) * 0.5
            way -= ways[at] * (way @ ways[at])
            way /= np.linalg.norm(way)
            left -= 1
            if left > 3 and pick.random() < 0.15:   # a fork
                heads.append((at, tangent(ways[at], pick), left // 2))
    return path


def veins(fighter, wounds, strain, pick):
    """The crystal's veins under the skin, three creeping from every wound, forking, narrowing as they go: a shell of
    the skin a hair off it, so any cloth lies over them."""
    points, ways, _ = skin_of(fighter)
    mask = np.zeros(len(points), bool)
    for at, _ in wounds:
        start = nearest(points, at)
        for _ in range(3):
            path = creeping(points, ways, start, pick, int(pick.integers(6, 13)))
            for k, step in enumerate(path):
                mask |= np.linalg.norm(points - step, axis=1) < 0.009 - 0.004 * k / len(path)
    colours = STRAINS[strain]
    paint = glowing(f'lattice.vein_{strain}', tuple(c * 0.6 for c in colours['crystal']), 0.15, colours['glow'])
    fighter.skins.append(fighter.skins[0].shell('lattice_veins', paint, mask, 0.0012))
    return [fighter.skins[-1].ob]


def gore(fighter, wounds, strain, pick):
    """The flesh torn round each wound, and the blood run down the skin from it and from the mouth, and spattered round
    it: shells of the skin as the forge paints a face, so they bend with the body. Both stand just past a shirt's band
    off the skin, so any cloth is soaked with the blood and torn open on the flesh; the blood lies under the flesh."""
    p, ways, _ = skin_of(fighter)
    flesh = np.zeros(len(p), bool)
    blood = np.zeros(len(p), bool)
    mouth = MOUTH(p)
    for at, width in [*wounds, *([(p[mouth].mean(axis=0), 0.012)] if mouth.any() else [])]:   # a headless foe has none
        near = np.linalg.norm(p - at, axis=1)
        reach = min(width * 1.8, 0.06)   # a great crystal's wound kept off the face, so the head still reads as one
        flesh |= near < reach
        blood |= near < reach * 1.4
        wander = at[0] + 0.012 * np.sin(p[:, 2] * 35 + pick.uniform(0, 2 * np.pi))
        across = (p[:, 0] - wander) ** 2 + 0.3 * (p[:, 1] - at[1]) ** 2
        run = pick.uniform(0.2, 0.5)
        blood |= (across < max(width * 0.6, 0.012) ** 2) & (p[:, 2] < at[2]) & (p[:, 2] > at[2] - run)
        centre = int(np.argmin(near))
        for _ in range(int(pick.integers(3, 7))):   # spatter: drops thrown out across the skin, each landing on it
            drop = p[nearest(p, p[centre] + tangent(ways[centre], pick) * pick.uniform(0.03, 0.09))]
            blood |= np.linalg.norm(p - drop, axis=1) < pick.uniform(0.006, 0.013)
    colours = STRAINS[strain]
    skin = fighter.skins[0]
    fighter.skins.append(skin.shell('lattice_blood', materials.plain(f'lattice.blood_{strain}', colours['blood'],
                                                                     rough=0.2, spec=0.6), blood, 0.0065))
    fighter.skins.append(skin.shell('lattice_flesh', materials.plain(f'lattice.flesh_{strain}', colours['flesh'],
                                                                     rough=0.3, spec=0.5), flesh, 0.0075))
    return [fighter.skins[-2].ob, fighter.skins[-1].ob]


def grow(fighter, clusters, strain, seed, torn_open=()):
    """Every cluster's shards on the shaped body, and under each a torn wound round where it broke out; each cluster
    hung on its joint; `torn_open`, more wounds the foe made itself (a body half out of it), each (where, how wide).
    Returns the crystal and wounds, the gore, and the veins."""
    points, ways, piece = skin_of(fighter)
    pick = np.random.default_rng(seed)
    crystal = crystal_material(strain)
    wound = materials.plain(f'lattice.wound_{strain}', STRAINS[strain]['wound'], rough=0.25, spec=0.6)
    made, wounds = [], list(torn_open)
    for c, cluster in enumerate(clusters):
        middle = best(points, ways, piece, cluster['piece'], cluster['middle'])
        on = np.nonzero(piece == cluster['piece'])[0]
        near = on[(np.linalg.norm(points[on] - points[middle], axis=1) <= cluster['spread']) & (on != middle)]
        chosen = [middle, *pick.choice(near, size=min(cluster['count'] - 1, len(near)), replace=False)]
        lumps, shards = [], []
        for k, at in enumerate(chosen):
            width = cluster['width'] * (1.0 if k == 0 else pick.uniform(0.6, 1.0))
            way = ways[at] + np.array(cluster['lean']) + pick.normal(0.0, 0.2, 3)
            shards.append(shard(f'lattice_{c}_{k}', points[at], way, pick.uniform(*cluster['length']), width,
                                pick.uniform(0, np.pi), crystal))
            lumps += torn(points[at], ways[at], width, pick)
            wounds.append((points[at], width))
        mesh = blob_mesh(f'lattice_wound_{c}', lumps, res=0.003)
        mesh.materials.append(wound)
        made += hung(fighter, cluster['joint'], [*shards, linked(mesh.name, mesh)])
    if not wounds:
        return made, [], []
    return made, gore(fighter, wounds, strain, pick), veins(fighter, wounds, strain, pick)
