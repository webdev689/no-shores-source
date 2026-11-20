"""The Lattice's props, made in Blender: what it leaves where it has corrupted and what its world events bring. Its
crystal growths; the ruined ports' own things overtaken, crystal grown through them; the structures it grows itself;
and what an event leaves. Each is built at the origin on the ground, in metres, in either crystal, from the shards its
foes are grown with (growth.py). Run from tools/forge/ with Blender's module to draw a picture of each:

    python -I ../lattice/props.py --out <folder> [--props spire,crate] [--strain red]"""
import argparse
import math
import os
import sys

sys.dont_write_bytecode = True   # nothing written beside the forge's code
HERE = os.path.dirname(os.path.abspath(__file__))
FORGE = os.path.abspath(os.path.join(HERE, '..', 'forge'))
sys.path[:0] = [HERE, os.path.join(FORGE, 'tools', 'sprite-forge')]

import bpy  # noqa: E402
import bmesh  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

import growth  # noqa: E402
import materials  # noqa: E402
from body import blob, blob_mesh  # noqa: E402

UP = np.array((0.0, 0.0, 1.0))


def kinds(strain):
    """What the props are made of: the strain's crystal and its dark roots, its light, and the ports' own stuff."""
    crystal = growth.crystal_material(strain)
    colours = growth.STRAINS[strain]
    return {'crystal': crystal, 'deep': growth.DEEP[crystal.name],
            'light': growth.glowing(f'prop.light_{strain}', colours['crystal'], 2.5, colours['glow']),
            'stone': materials.plain('prop.stone', (0.34, 0.32, 0.3), rough=0.9, spec=0.2),
            'earth': materials.plain('prop.earth', (0.07, 0.06, 0.05), rough=0.95, spec=0.1),
            'wood': materials.plain('prop.wood', (0.26, 0.16, 0.09), rough=0.8, spec=0.2),
            'iron': materials.plain('prop.iron', (0.09, 0.09, 0.1), metal=0.6, rough=0.5),
            'blight': materials.plain(f'prop.blight_{strain}', tuple(0.05 + c * 0.25 for c in colours['crystal']),
                                      rough=0.85, spec=0.15),
            'flesh': materials.plain(f'prop.flesh_{strain}', colours['flesh'], rough=0.4, spec=0.5),
            'hollow': materials.plain('prop.hollow', (0.01, 0.005, 0.005), rough=0.6, spec=0.2)}


def made(kind, mat, **at):
    """One of Blender's own shapes in `mat`: a box, a cylinder, a sphere or a ring."""
    scale = at.pop('scale', (1.0, 1.0, 1.0))
    getattr(bpy.ops.mesh, f'primitive_{kind}_add')(**at)
    ob = bpy.context.active_object
    ob.scale = scale
    ob.data.materials.append(mat)
    return ob


def box(mat, centre, size, turn=(0.0, 0.0, 0.0)):
    return made('cube', mat, location=tuple(centre), rotation=tuple(turn), scale=tuple(s / 2 for s in size))


def lumps(name, blobs, mat, res=0.02):
    mesh = blob_mesh(name, blobs, res=res)
    mesh.materials.append(mat)
    return growth.linked(mesh.name, mesh)


def rock(name, centre, radii, mat, pick, points=22):
    """A boulder broken into flat faces: the hull of points scattered over an egg of `radii` round `centre`."""
    bm = bmesh.new()
    for q in pick.normal(0.0, 1.0, (points, 3)):
        bm.verts.new(tuple(np.asarray(centre) + q / np.linalg.norm(q) * np.asarray(radii) * pick.uniform(0.85, 1.1)))
    hull = bmesh.ops.convex_hull(bm, input=list(bm.verts))
    bmesh.ops.delete(bm, geom=list({g for g in hull['geom_interior'] + hull['geom_unused']
                                    if isinstance(g, bmesh.types.BMVert)}), context='VERTS')
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    return growth.linked(name, mesh)


def blight(m, pick, reach=1.6):
    """The ground round a Lattice prop gone to crystal: blackened, its stain broken at its edge, crusted with flat
    plates of crystal whose facets catch the light, and points of it pricking up through them."""
    stains = [blob((0.0, 0.0, -0.03), (reach * 0.7, reach * 0.7, 0.045))]   # sunk, so a crust a few cm stands proud
    for turn in np.linspace(0.0, 2 * math.pi, 9, endpoint=False) + pick.uniform(-0.3, 0.3, 9):
        out = reach * pick.uniform(0.5, 0.95)
        stains.append(blob((math.cos(turn) * out, math.sin(turn) * out, -0.03),
                           (reach * pick.uniform(0.2, 0.4), reach * pick.uniform(0.15, 0.3), 0.042)))
    crust = [lumps('blight', stains, m['blight'], res=0.015)]
    for k in range(int(reach * 18)):
        turn, out, wide = pick.uniform(0.0, 2 * math.pi), reach * pick.uniform(0.0, 0.9), pick.uniform(0.06, 0.2)
        crust.append(rock(f'blight_plate_{k}', (math.cos(turn) * out, math.sin(turn) * out, 0.0),
                          (wide, wide * pick.uniform(0.5, 1.0), 0.035), m['deep' if k % 3 else 'crystal'], pick, 9))
    for k in range(int(reach * 14)):   # crystal pricking up through the crust
        turn, out = pick.uniform(0.0, 2 * math.pi), reach * pick.uniform(0.1, 0.85)
        crust.append(growth.shard(f'blight_{k}', np.array((math.cos(turn) * out, math.sin(turn) * out, 0.0)),
                                  UP + pick.normal(0.0, 0.5, 3) * (1, 1, 0), pick.uniform(0.03, 0.12), 0.02, turn,
                                  m['crystal']))
    return crust


def cluster(name, base, up, count, length, radius, mat, pick, spread=0.6):
    """Shards broken out from round `base`, each leaning off `up` by up to `spread`, the longest in the middle."""
    up = np.asarray(up, float) / np.linalg.norm(up)
    out = []
    for k in range(count):
        lean = pick.normal(0.0, spread, 3)
        way = up + lean - up * (lean @ up)
        near = 1.0 - min(1.0, np.linalg.norm(lean) / (2 * spread + 1e-9))
        at = np.asarray(base, float) + pick.normal(0.0, radius * 1.5, 3) * (1.0, 1.0, 0.3)
        out.append(growth.shard(f'{name}_{k}', at, way, pick.uniform(*length) * (0.55 + 0.45 * near),
                                radius * pick.uniform(0.6, 1.1), pick.uniform(0, math.pi), mat))
    return out


def ring_of(name, centre, reach, count, length, radius, mat, pick, lean=0.6):
    """Small shards round `centre` at `reach`, leaning out: where crystal has crept through the ground."""
    out = []
    for k, turn in enumerate(np.linspace(0.0, 2 * math.pi, count, endpoint=False) + pick.uniform(-0.3, 0.3, count)):
        away = np.array((math.cos(turn), math.sin(turn), 0.0))
        at = np.asarray(centre, float) + away * reach * pick.uniform(0.7, 1.3)
        out.append(growth.shard(f'{name}_{k}', at, away * lean + UP, pick.uniform(*length), radius, turn, mat))
    return out


# -- its crystal growths

def spire(m, pick):
    """A spire of crystal four metres high, leaning a little, shards broken out round its root and the ground."""
    return ([growth.shard('spire', np.array((0.0, 0.0, -0.3)), (0.12, 0.05, 1.0), 4.4, 0.38, 0.3, m['crystal'],
                          widest=0.5)]
            + cluster('spire_root', (0.0, 0.0, 0.0), UP, 8, (0.6, 1.7), 0.15, m['crystal'], pick, spread=0.9)
            + ring_of('spire_ground', (0.0, 0.0, 0.0), 1.1, 10, (0.12, 0.35), 0.05, m['crystal'], pick))


def growth_cluster(m, pick):
    """A cluster of shards broken out of the ground, as tall as a man."""
    return (cluster('cluster', (0.0, 0.0, -0.05), UP, 14, (0.4, 1.8), 0.11, m['crystal'], pick, spread=0.75)
            + ring_of('cluster_ground', (0.0, 0.0, 0.0), 0.8, 8, (0.1, 0.3), 0.045, m['crystal'], pick))


def vein(m, pick):
    """A vein of crystal along a crack in the ground, lit from within, small shards standing out of it."""
    path = [np.array((x, 0.35 * math.sin(x * 1.3) + pick.uniform(-0.08, 0.08), 0.0)) for x in np.linspace(-2.0, 2.0, 9)]
    out = []
    for k, (a, b) in enumerate(zip(path, path[1:])):
        middle, way = (a + b) / 2, b - a
        length = np.linalg.norm(way)
        out.append(box(m['light'], middle + (0.0, 0.0, 0.01), (length + 0.05, 0.11, 0.03),
                       (0.0, 0.0, math.atan2(way[1], way[0]))))
        out.append(box(m['deep'], middle, (length + 0.1, 0.34, 0.04), (0.0, 0.0, math.atan2(way[1], way[0]))))
        for j in range(5):
            at = a + way * pick.uniform(0.0, 1.0)
            out.append(growth.shard(f'vein_{k}_{j}', at, UP + pick.normal(0.0, 0.5, 3) * (1, 1, 0),
                                    pick.uniform(0.12, 0.5), pick.uniform(0.04, 0.07), pick.uniform(0, 3), m['crystal']))
    return out


def crusted_rock(m, pick):
    """A boulder broken into flat faces, crystal broken out of its top and its side."""
    return ([rock('rock', (0.0, 0.0, 0.45), (0.75, 0.6, 0.55), m['stone'], pick)]
            + cluster('rock_top', (0.1, 0.0, 0.92), (0.2, 0.0, 1.0), 8, (0.35, 1.0), 0.09, m['crystal'], pick)
            + cluster('rock_side', (0.68, -0.1, 0.45), (1.0, -0.2, 0.4), 5, (0.25, 0.6), 0.07, m['crystal'], pick))


# -- the ruined ports' things, overtaken

def crate(m, pick):
    """A crate burst open from inside, its lid and a side gone, crystal standing out of it."""
    out = []
    s = 0.8
    for x in (-1, 1):   # its frame's posts and its rails, the lid and the front side gone
        for y in (-1, 1):
            out.append(box(m['wood'], (x * s / 2, y * s / 2, s / 2), (0.07, 0.07, s)))
    for side, (cx, cy, w, h) in enumerate(((0, s / 2, s, 0.05), (s / 2, 0, 0.05, s), (-s / 2, 0, 0.05, s))):
        for k in range(4):
            if side == 0 or k != 3 or pick.random() < 0.5:
                out.append(box(m['wood'], (cx, cy, 0.1 + k * 0.2), (w, h, 0.16),
                               (0.0, pick.uniform(-0.15, 0.15) if k == 3 else 0.0, 0.0)))
    out.append(box(m['wood'], (0.6, -0.5, 0.03), (0.8, 0.18, 0.04), (0.0, 0.0, 0.5)))   # a plank thrown off
    return out + cluster('crate', (0.0, 0.0, 0.15), UP, 9, (0.6, 1.3), 0.1, m['crystal'], pick, spread=0.55)


def barrel(m, pick):
    """A barrel split by crystal out of its head and through its side."""
    out = [made('cylinder', m['wood'], vertices=12, radius=0.32, depth=0.9, location=(0.0, 0.0, 0.45))]
    for z in (0.12, 0.45, 0.78):
        out.append(made('torus', m['iron'], major_radius=0.33, minor_radius=0.018, location=(0.0, 0.0, z)))
    return (out + cluster('barrel_top', (0.0, 0.0, 0.85), UP, 7, (0.4, 0.9), 0.08, m['crystal'], pick, spread=0.5)
            + [growth.shard('barrel_side', np.array((0.25, -0.15, 0.4)), (1.0, -0.5, 0.3), 0.55, 0.09, 0.4,
                            m['crystal'])])


def cart(m, pick):
    """A two-wheeled cart sunk on one wheel, its bed broken by crystal grown up through it."""
    tilt = (0.0, math.radians(9), 0.0)
    out = [box(m['wood'], (0.0, 0.0, 0.62), (1.7, 1.0, 0.08), tilt)]
    for y in (-0.5, 0.5):
        out.append(box(m['wood'], (0.0, y, 0.78), (1.7, 0.06, 0.28), tilt))
    out.append(box(m['wood'], (0.85, 0.0, 0.74), (0.06, 1.0, 0.24), tilt))
    for y, sink in ((-0.58, 0.0), (0.58, 0.12)):   # its wheels, one sunk in the ground
        out.append(made('cylinder', m['wood'], vertices=16, radius=0.48, depth=0.08,
                        location=(0.0, y, 0.48 - sink), rotation=(math.pi / 2, 0.0, 0.0)))
        out.append(made('torus', m['iron'], major_radius=0.48, minor_radius=0.025, location=(0.0, y, 0.48 - sink),
                        rotation=(math.pi / 2, 0.0, 0.0)))
    for y in (-0.35, 0.35):   # its shafts, resting on the ground
        out.append(box(m['wood'], (-1.45, y, 0.32), (1.4, 0.06, 0.06), (0.0, math.radians(-22), 0.0)))
    return (out + [growth.shard('cart_spire', np.array((0.2, 0.1, -0.2)), (0.15, 0.1, 1.0), 2.0, 0.2, 0.2,
                                m['crystal'], widest=0.5)]
            + cluster('cart_bed', (0.3, 0.0, 0.66), UP, 6, (0.3, 0.8), 0.08, m['crystal'], pick))


def wall(m, pick):
    """A stretch of a port's stone wall broken open by a spire of crystal, its stones thrown down."""
    out = []
    for row in range(4):
        for k in range(6):
            x = -1.65 + k * 0.62 + (0.31 if row % 2 else 0.0)
            if abs(x) < 0.45 and row >= 1:   # the gap the crystal broke
                continue
            out.append(box(m['stone'], (x, 0.0, 0.2 + row * 0.4), (0.58, 0.45, 0.37),
                           (0.0, 0.0, pick.uniform(-0.03, 0.03))))
    for k in range(4):   # its stones thrown down
        out.append(box(m['stone'], (pick.uniform(-0.8, 0.8), pick.uniform(-1.1, -0.5), 0.17), (0.56, 0.44, 0.34),
                       tuple(pick.uniform(-0.5, 0.5, 3))))
    return (out + [growth.shard('wall_spire', np.array((0.0, 0.0, -0.2)), (0.05, -0.25, 1.0), 2.8, 0.3, 0.6,
                                m['crystal'], widest=0.5)]
            + cluster('wall_gap', (0.0, -0.1, 0.4), (0.0, -0.6, 1.0), 6, (0.4, 1.0), 0.09, m['crystal'], pick))


def lamppost(m, pick):
    """A street's iron lamppost bent over, its lantern burst into a cluster of crystal, crystal crusting its post."""
    out = [box(m['stone'], (0.0, 0.0, 0.1), (0.4, 0.4, 0.2)),
           made('cylinder', m['iron'], vertices=8, radius=0.05, depth=1.6, location=(0.0, 0.0, 1.0))]
    bend = math.radians(28)
    top = np.array((math.sin(bend) * 0.6, 0.0, 1.8 + math.cos(bend) * 0.6))
    out.append(made('cylinder', m['iron'], vertices=8, radius=0.045, depth=1.2,
                    location=tuple((np.array((0.0, 0.0, 1.8)) + top) / 2), rotation=(0.0, bend, 0.0)))
    out += cluster('lamp', top + np.array((0.25, 0.0, 0.0)), (0.6, 0.0, 0.5), 8, (0.25, 0.6), 0.07, m['crystal'], pick)
    for z in (0.6, 1.1, 1.5):
        out += cluster(f'post_{z}', (0.05, 0.0, z), (1.0, pick.uniform(-0.5, 0.5), 0.3), 2, (0.1, 0.25), 0.04,
                       m['crystal'], pick)
    return out


def boat(m, pick):
    """A rowboat beached on its side, a spire of crystal driven up through its hull."""
    rows = []
    for x in np.linspace(-1.6, 1.6, 9):   # its hull from stem to stern, each section a U narrowing to its ends
        half = 0.62 * (1.0 - (x / 1.65) ** 2) ** 0.6 + 0.02
        deep = 0.42 * (1.0 - (x / 1.7) ** 2) ** 0.5 + 0.04
        rows.append([(x, half * math.sin(a), 0.5 - deep * math.cos(a)) for a in np.linspace(-1.5, 1.5, 9)])
    points = [q for row in rows for q in row]
    faces = [(i * 9 + j, i * 9 + j + 1, (i + 1) * 9 + j + 1, (i + 1) * 9 + j) for i in range(8) for j in range(8)]
    hull = growth.mesh_of('boat_hull', points, faces, [m['wood']])
    mod = hull.modifiers.new('thick', 'SOLIDIFY')
    mod.thickness = 0.05
    hull.rotation_euler = (math.radians(68), 0.0, 0.0)   # on its side
    hull.location = (0.0, 0.0, 0.25)
    return ([hull, growth.shard('boat_spire', np.array((0.2, 0.15, -0.2)), (0.1, -0.35, 1.0), 2.3, 0.22, 0.4,
                                m['crystal'], widest=0.5)]
            + cluster('boat', (0.2, -0.1, 0.5), (0.0, -0.5, 1.0), 6, (0.3, 0.8), 0.07, m['crystal'], pick))


# -- what the Lattice grows itself

def nest(m, pick):
    """A mound of the flesh it has taken, ribbed over by crystal bent in over it, a dark wet mouth at its foot that
    the Husks crawl out of, crystal veins and shards broken out of the flesh."""
    flesh = [blob((pick.uniform(-0.6, 0.6), pick.uniform(-0.3, 0.6), pick.uniform(0.15, 0.45)),
                  tuple(pick.uniform(0.25, 0.42, 3))) for _ in range(16)]
    lip = [blob((math.cos(t) * 0.38, -0.62 + math.sin(t) * 0.08, 0.28 + math.sin(t) * 0.22), (0.11, 0.11, 0.11))
           for t in np.linspace(0.0, 2 * math.pi, 10, endpoint=False)]   # the mouth's swollen lip
    out = [lumps('nest', flesh + lip, m['flesh']), lumps('nest_mouth', [blob((0.0, -0.6, 0.28), (0.3, 0.16, 0.24))],
                                                         m['hollow'])]
    for k, turn in enumerate(np.linspace(0.45, 2 * math.pi - 0.45, 8)):   # ribs bent in over it, its front left open
        away = np.array((math.cos(turn - math.pi / 2), math.sin(turn - math.pi / 2), 0.0)) * -1
        root, knee = away * 1.25, away * 1.05 + UP * 0.8
        out.append(growth.shard(f'nest_rib_{k}', root, knee - root, np.linalg.norm(knee - root), 0.08, turn,
                                m['crystal'], widest=0.4))
        out.append(growth.shard(f'nest_bend_{k}', knee, -away * 0.9 + UP * 0.35, 0.65, 0.06, turn, m['crystal'],
                                widest=0.3))
    out += cluster('nest_top', (0.0, 0.2, 0.75), UP, 5, (0.25, 0.6), 0.06, m['crystal'], pick, spread=0.7)
    return out + ring_of('nest_ground', (0.0, 0.0, 0.0), 1.6, 9, (0.1, 0.35), 0.05, m['crystal'], pick)


def pylon(m, pick):
    """A pylon of dark crystal, lit seams up its faces, shards round its root and a ring of them held in the air
    round its head, turning about it."""
    out = [growth.shard('pylon', np.array((0.0, 0.0, -0.2)), UP, 3.8, 0.34, 0.0, m['deep'], widest=0.88)]
    for k in range(6):   # its seams of light, up each face
        turn = k * math.pi / 3 + math.pi / 6
        at = np.array((math.cos(turn), math.sin(turn), 0.0)) * 0.3
        out.append(box(m['light'], at + (0.0, 0.0, 1.6), (0.03, 0.03, 2.6), (0.0, 0.0, turn)))
    out += ring_of('pylon_root', (0.0, 0.0, 0.0), 0.55, 6, (0.4, 0.8), 0.09, m['crystal'], pick, lean=0.35)
    for k, turn in enumerate(np.linspace(0.0, 2 * math.pi, 7, endpoint=False)):   # held in the air round its head
        at = np.array((math.cos(turn) * 0.75, math.sin(turn) * 0.75, 3.1 + 0.15 * math.sin(turn * 2)))
        out.append(growth.shard(f'pylon_orbit_{k}', at, (math.cos(turn + 1.6), math.sin(turn + 1.6), 0.4), 0.3, 0.06,
                                turn, m['crystal']))
    return out


def shrine(m, pick):
    """A ring of standing crystals round a stone, and on it one of the port's people fused into crystal, a light at
    its heart: where the Lattice gathers."""
    out = [box(m['stone'], (0.0, 0.0, 0.35), (1.0, 0.6, 0.7))]
    out.append(lumps('shrine_figure', [blob((0.0, 0.0, 1.05), (0.2, 0.16, 0.28)), blob((0.0, -0.02, 1.42),
                                                                                    (0.1, 0.1, 0.12))], m['flesh']))
    out += cluster('shrine_figure', (0.0, 0.05, 1.1), UP, 9, (0.25, 0.7), 0.06, m['crystal'], pick, spread=0.9)
    out.append(made('ico_sphere', m['light'], subdivisions=1, radius=0.09, location=(0.0, -0.17, 1.1)))
    for k, turn in enumerate(np.linspace(0.0, 2 * math.pi, 7, endpoint=False)):   # the ring, leaning in
        away = np.array((math.cos(turn), math.sin(turn), 0.0))
        out.append(growth.shard(f'shrine_stone_{k}', away * 1.7, UP - away * 0.15, pick.uniform(1.3, 1.9), 0.17, turn,
                                m['crystal'], widest=0.5))
    return out


# -- what its world events leave

def fissure(m, pick):
    """A fissure torn in the ground, lit from deep within, crystal teeth along both its lips leaning in over it."""
    out = []
    xs = np.linspace(-2.2, 2.2, 10)
    ys = 0.25 * np.sin(xs * 1.1)
    for k in range(len(xs) - 1):
        a, b = np.array((xs[k], ys[k], 0.0)), np.array((xs[k + 1], ys[k + 1], 0.0))
        way, middle = b - a, (a + b) / 2
        turn = math.atan2(way[1], way[0])
        width = 0.95 * (1.0 - abs(middle[0]) / 2.5) + 0.08
        out.append(box(m['hollow'], middle - (0.0, 0.0, 0.02), (np.linalg.norm(way) + 0.05, width, 0.04),
                       (0.0, 0.0, turn)))
        out.append(box(m['light'], middle + (0.0, 0.0, 0.0), (np.linalg.norm(way) + 0.05, width * 0.25, 0.045),
                       (0.0, 0.0, turn)))
        across = np.array((-way[1], way[0], 0.0)) / np.linalg.norm(way)
        for lip in (1.0, -1.0):
            at = middle + across * lip * width * 0.6
            for j in range(2):
                tooth = at + way * pick.uniform(-0.4, 0.4)
                out.append(growth.shard(f'fissure_{k}_{lip:+.0f}_{j}', tooth, UP * 0.8 - across * lip * 0.7,
                                        pick.uniform(0.3, 1.0) * (1.0 - abs(middle[0]) / 3.0), 0.1,
                                        pick.uniform(0, 3), m['crystal']))
    return out


def crater(m, pick):
    """A crater with a great crystal fallen into its heart, its rim thrown up round it, shards scattered from it."""
    rim = lumps('crater_rim', [blob((math.cos(t) * 2.0, math.sin(t) * 2.0, 0.05), (0.55, 0.55, 0.28))
                               for t in np.linspace(0.0, 2 * math.pi, 14, endpoint=False)], m['earth'], res=0.04)
    bowl = made('cylinder', m['hollow'], vertices=24, radius=1.75, depth=0.02, location=(0.0, 0.0, 0.01))
    out = [rim, bowl, growth.shard('crater_heart', np.array((0.0, 0.0, -0.6)), (0.5, 0.2, 1.0), 2.9, 0.5, 0.4,
                                   m['crystal'], widest=0.55)]
    out.append(made('ico_sphere', m['light'], subdivisions=1, radius=0.35, location=(0.1, 0.0, 0.05)))
    return out + ring_of('crater_shards', (0.0, 0.0, 0.0), 1.2, 12, (0.15, 0.5), 0.06, m['crystal'], pick, lean=1.2)


PROPS = {'blight': blight, 'spire': spire, 'cluster': growth_cluster, 'vein': vein, 'crusted_rock': crusted_rock,
         'crate': crate, 'barrel': barrel, 'cart': cart, 'wall': wall, 'lamppost': lamppost, 'boat': boat,
         'nest': nest, 'pylon': pylon, 'shrine': shrine, 'fissure': fissure, 'crater': crater}


def picture(name, strain, path, samples):
    """`name` built in `strain` on a stretch of dark ground, lit from the front and above, seen from three quarters."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine, sc.cycles.device, sc.cycles.samples = 'CYCLES', 'CPU', samples
    sc.render.resolution_x, sc.render.resolution_y = 640, 480
    sc.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.05, 0.05, 0.06, 1)
    sc.world = world
    m = kinds(strain)
    pick = np.random.default_rng(sum(map(ord, name)))
    obs = PROPS[name](m, pick)
    bpy.context.view_layer.update()
    corners = np.array([ob.matrix_world @ Vector(c) for ob in obs for c in ob.bound_box])
    middle, size = (corners.min(axis=0) + corners.max(axis=0)) / 2, max(np.ptp(corners, axis=0).max(), 1.0)
    if name != 'blight':   # each on the ground it has corrupted, as it would stand
        blight(m, pick, reach=np.ptp(corners[:, :2], axis=0).max() * 0.55 + 0.4)
    made('plane', m['earth'], size=30.0, location=(0.0, 0.0, -0.002))
    for way, energy in (((0.5, 1.0, -0.9), 3.0), ((-1.0, 0.3, -0.4), 0.8)):
        light = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        light.data.energy = energy
        light.rotation_euler = Vector(way).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(light)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    eye = Vector(tuple(middle)) + Vector((0.55, -1.0, 0.55)).normalized() * size * 2.1
    cam.location = eye
    cam.rotation_euler = (Vector(tuple(middle)) - eye).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    asked = argparse.ArgumentParser()
    asked.add_argument('--out', required=True)
    asked.add_argument('--props', default=','.join(PROPS))
    asked.add_argument('--strain', choices=('red', 'purple'), default='red')
    asked.add_argument('--samples', type=int, default=32)
    args = asked.parse_args()
    out = os.path.abspath(args.out)
    if os.path.commonpath([out, FORGE]) == FORGE:
        sys.exit('--out is inside tools/forge/, which a Lattice render never writes into')
    os.makedirs(out, exist_ok=True)
    for name in args.props.split(','):
        picture(name, args.strain, os.path.join(out, f'{name}_{args.strain}.png'), args.samples)


if __name__ == '__main__':
    main()
