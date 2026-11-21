"""The Lattice's death, one wave for all: a foe killed disperses in a wave of crystallized energy, burst from where it
stood as the game fades its figure. A burst of light at its heart, its figure gone to crystal over its whole height
and flung outward and up; a ring of shards broken out of the ground, rushing outward on a band of light, falling as
they go; shards lifting and fading; the ring thinned and gone. Drawn
once at a man's size and from one side (it is the same from every side), as a brightness map the game colours in the
foe's crystal and scales to its size, as it does the Arts' birds. Run from tools/forge/ with Blender's module:

    python -I ../lattice/wave.py --out <folder>

Writes `lattice_wave.png` (its frames left to right) and `lattice_wave.json` (their count, cell and root)."""
import argparse
import json
import math
import os
import sys
import tempfile

sys.dont_write_bytecode = True   # nothing written beside the forge's code
HERE = os.path.dirname(os.path.abspath(__file__))
FORGE = os.path.abspath(os.path.join(HERE, '..', 'forge'))
sys.path[:0] = [HERE, os.path.join(FORGE, 'tools', 'sprite-forge')]

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import growth  # noqa: E402
import materials  # noqa: E402
import stage  # noqa: E402

FRAMES = 10
REACH = 2.0              # how far the ring runs out, metres at a man's size
CELL = (320, 200, 36)    # the frame, and its rows under the ground: the ring runs out toward the eye too
HEART = np.array((0.0, 0.0, 1.05))


def eased(t):
    return 1.0 - (1.0 - t) ** 2


def lights():
    """Its crystal as brightness: its points bright and lit from within, its roots dark, and the band brighter still."""
    bright = materials.plain('wave.bright', (0.8, 0.8, 0.8), rough=0.3, spec=0.5)
    node = bright.node_tree.nodes['Principled BSDF']
    node.inputs['Emission Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    node.inputs['Emission Strength'].default_value = 0.6
    growth.DEEP[bright.name] = materials.plain('wave.deep', (0.22, 0.22, 0.22), rough=0.6, spec=0.3)
    band = materials.plain('wave.band', (1.0, 1.0, 1.0), rough=0.5, spec=0.2)
    node = band.node_tree.nodes['Principled BSDF']
    node.inputs['Emission Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    node.inputs['Emission Strength'].default_value = 2.0
    return bright, band


def ring(radius, thick, band):
    """The band of light along the ground under the ring of shards."""
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thick, major_segments=48, minor_segments=6,
                                     location=(0.0, 0.0, thick))
    ob = bpy.context.active_object
    ob.data.materials.append(band)
    return ob


def frame(f, bright, band, pick):
    """Frame `f`'s crystal: each of its parts as far through its life as the frame is."""
    made = []
    if f < 2:   # a burst of light at its heart
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=(0.3, 0.42)[f], location=tuple(HEART))
        made.append(bpy.context.active_object)
        made[-1].data.materials.append(band)
    if f < 5:   # the figure gone to crystal over its whole height, flung outward and up
        grow, fly = (0.6, 1.0, 0.85, 0.55, 0.25)[f], (0.0, 0.05, 0.35, 0.75, 1.2)[f]
        for k, (at, way) in enumerate(pick['body']):
            made.append(growth.shard(f'wave_body_{k}', at + way * fly + np.array((0.0, 0.0, 0.25 * fly)), way,
                                     0.26 * grow * (0.7 + 0.3 * (k % 3) / 2), 0.04 * grow + 0.01, k * 0.7, bright))
    if f >= 1:
        t = (f - 1) / (FRAMES - 2)
        out = 0.3 + (REACH - 0.3) * eased(t)
        for k, turn in enumerate(pick['ring']):   # the ring of shards broken out of the ground, falling as it runs
            base = np.array((math.cos(turn) * out, math.sin(turn) * out, 0.0))
            tall = 0.62 * (1.0 - t) ** 1.1 * (0.6 + 0.4 * pick['tall'][k]) + 0.04
            made.append(growth.shard(f'wave_ring_{k}', base, (math.cos(turn) * 0.7, math.sin(turn) * 0.7, 1.0), tall,
                                     0.075 * (1.0 - t) + 0.015, turn, bright))
        if f < FRAMES - 1:
            made.append(ring(out, 0.05 * (1.0 - t) + 0.008, band))
    if 2 <= f <= 7:   # shards lifting off it and fading
        t = (f - 2) / 5
        for k, (x, y, z) in enumerate(pick['lift']):
            made.append(growth.shard(f'wave_lift_{k}', np.array((x, y, z + 1.2 * t)), (x, y, 1.0),
                                     0.16 * (1.0 - t) + 0.02, 0.03 * (1.0 - t) + 0.006, k, bright))
    return made


def main():
    asked = argparse.ArgumentParser()
    asked.add_argument('--out', required=True)
    asked.add_argument('--samples', type=int, default=32)
    args = asked.parse_args()
    out = os.path.abspath(args.out)
    if os.path.commonpath([out, FORGE]) == FORGE:
        sys.exit('--out is inside tools/forge/, which a Lattice render never writes into')
    os.makedirs(out, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(args.samples)
    w, h, below = CELL
    stage.resize(w, h, below)
    bright, band = lights()
    rng = np.random.default_rng(31)
    turns, heights = rng.uniform(0.0, 2 * math.pi, 30), rng.uniform(0.1, 1.75, 30)
    body = [(np.array((math.cos(a) * 0.2, math.sin(a) * 0.14, z)),
             np.array((math.cos(a), math.sin(a), rng.uniform(-0.2, 0.8)))) for a, z in zip(turns, heights)]
    pick = {'body': [(at, way / np.linalg.norm(way)) for at, way in body],   # over a man's height and girth
            'ring': np.linspace(0.0, 2 * math.pi, 36, endpoint=False) + rng.uniform(-0.06, 0.06, 36),
            'tall': rng.uniform(0.0, 1.0, 36),
            'lift': [(*rng.uniform(-0.35, 0.35, 2), rng.uniform(0.4, 1.2)) for _ in range(10)]}
    cells = []
    with tempfile.TemporaryDirectory() as tmp:
        for f in range(FRAMES):
            made = frame(f, bright, band, pick)
            rgba = stage.render_rgba(os.path.join(tmp, 'wave.png'))
            light = rgba[..., :3].astype(np.float32).mean(axis=2, keepdims=True).astype(np.uint8)
            cells.append(np.concatenate([np.repeat(light, 3, axis=2), rgba[..., 3:]], axis=2))
            for ob in made:
                bpy.data.objects.remove(ob, do_unlink=True)
    stage.write_png(os.path.join(out, 'lattice_wave.png'), np.concatenate(cells, axis=1))
    with open(os.path.join(out, 'lattice_wave.json'), 'w') as f:
        json.dump({'frames': FRAMES, 'cell': [w, h], 'root': list(stage.ROOT_PX), 'samples': args.samples}, f)


if __name__ == '__main__':
    main()
