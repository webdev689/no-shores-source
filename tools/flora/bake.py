"""Bakes the flora: grows every form of every kind of a biome as a detailed model in Blender, and bakes it two ways,
a near mesh and an impostor sheet, the biome's pictures packed into a few layers.

    python -I tools/flora/bake.py <out folder> [biome ...] [--samples N]

bpy is Blender as a Python module (`pip install bpy==5.3.0`, on Python 3.13). It writes into `<out folder>/<biome>/`
each form's `.mesh` and each layer's albedo and normal `.png`, and `<out folder>/<biome>.json`, the biome's entry
of content/nature/flora.json with file names where publish.py puts R2 keys.
"""
import argparse
import json
import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import atlas  # noqa: E402
import blender  # noqa: E402
import near as near_mesh  # noqa: E402
import sprites  # noqa: E402
from detail import surfaces as detailed  # noqa: E402
from growers import grown  # noqa: E402
from grow import UP, unit  # noqa: E402
from pictures import bark, normals  # noqa: E402
from species import BIOMES, NEAR_ONLY  # noqa: E402

# The most of a form's triangles its wood may take; the rest go to its cards.
CARD_SHARE = {'tree': 200, 'shrub': 60, 'low': 0, 'rock': 0}


def bark_tile(model, seed):
    """The bark or stone picture as the near mesh wears it: opaque, its normals from its height."""
    albedo, height = bark(model.bark['style'], model.bark['colour'], seed)
    rgba = np.concatenate([albedo, np.ones(albedo.shape[:2] + (1,))], -1)
    normal = np.concatenate([normals(height, 6.0) * 0.5 + 0.5, np.zeros(albedo.shape[:2] + (1,))], -1)
    return rgba.astype(np.float32), normal.astype(np.float32)


def frond_normal(model):
    top = model.fronds[0].spine[0]
    return lambda point: unit(point - top + UP * 0.6)


def nearby(scene, plant, model, form, budget, tiles, pictures, kind, first, rng):
    """The form's near mesh; the first form of a kind also renders the pictures its kind's cards wear."""
    mesh = near_mesh.Near()
    total = near_mesh.BUDGETS[budget]
    if model.rock:
        near_mesh.rock(mesh, model)
        return mesh
    near_mesh.wood(mesh, model, CARD_SHARE[budget] if model.clusters else total - 12 * len(model.fronds))
    if model.clusters:
        groups = near_mesh.groups_of(model.clusters, (total - mesh.triangles) // 4)
        if first:
            for index, (centre, out, radius) in enumerate(groups[:3]):
                pictures[f'{kind} spray {index}'] = sprites.spray_tile(scene, plant, model, centre, out, radius,
                                                                        np.random.default_rng(index))
                tiles.append(f'{kind} spray {index}')
        sprays = [tile for tile in tiles if ' spray ' in tile]
        near_mesh.cards(mesh, model, groups, sprays, near_mesh.crown_normal(model), rng)
    if model.fronds:
        if first:
            pictures[f'{kind} frond'], length = sprites.frond_tile(scene, plant, model, np.random.default_rng(5))
            tiles.append(f'{kind} frond')
            pictures[f'{kind} frond length'] = length
        length = pictures[f'{kind} frond length']
        for strip in model.fronds:
            near_mesh.strip(mesh, strip.spine, strip.width, f'{kind} frond', frond_normal(model),
                            uv_width=strip.width / length)
    if model.blades:
        size = max(model.height, 2 * max(np.linalg.norm(blade.spine[-1][:2]) for blade in model.blades))
        if first:
            for index, tile in enumerate(sprites.tuft_tiles(scene, plant, size)):
                pictures[f'{kind} tuft {index}'] = tile
                tiles.append(f'{kind} tuft {index}')
        near_mesh.crossed(mesh, size, [f'{kind} tuft 0', f'{kind} tuft 1'])
    if model.moss:
        if first:
            pictures[f'{kind} moss'] = sprites.moss_tile(scene, plant, model, np.random.default_rng(6))
            tiles.append(f'{kind} moss')
        for strip in model.moss:
            hanging = strip.spine[::-1]
            for turn in (0.3, 0.3 + math.pi / 2):
                side = np.array([math.cos(turn), math.sin(turn), 0.0])
                near_mesh.strip(mesh, hanging, 0.5, f'{kind} moss', lambda point: unit(UP + side),
                                leaf=near_mesh.MOSS_LEAF, uv_width=0.5 / 1.6, side=side)
    return mesh


def measures(model, surfaces, mesh):
    """What the client reads of a form besides its pictures: its height and reach, its contact shade, its crown."""
    points = np.array([each['p'] for each in mesh.corners])
    spread = float(np.hypot(points[:, 0], points[:, 1]).max())
    foliage = [surface for surface in surfaces if surface.material == 'leaf']
    leaves = np.concatenate([surface.arrays()[0] for surface in foliage]) if foliage else None
    if leaves is not None and len(leaves):
        reach = float(np.hypot(leaves[:, 0], leaves[:, 1]).max())
        shade = [round(reach * 0.9, 3), round(float(leaves[:, 2].mean()), 3)]
        crown = round(float(leaves[:, 0].max() - leaves[:, 0].min()), 3)
    else:
        shade, crown = [round(spread * 0.9, 3), 0.0], 0.0
    return dict(triangles=mesh.triangles, top=round(float(points[:, 2].max()), 3), spread=round(spread, 3),
                shade=shade, leafy=leaves is not None and len(leaves) > 0, crown=crown)


def bake_biome(biome, out, samples):
    """Bakes a biome into `out`; gives its manifest entry, file names where the keys go."""
    sprites.SAMPLES = samples
    folder = os.path.join(out, biome)
    os.makedirs(folder, exist_ok=True)
    pictures, sheets, groups, forms = {}, [], [], []
    for kind, kind_forms in BIOMES[biome]:
        tiles = [f'{kind} bark']
        for index, form in enumerate(kind_forms):
            started = time.time()
            scene = blender.reset()
            model = grown(form)
            surfaces = detailed(model, np.random.default_rng(form['seed'] + 7919))
            plant = blender.Plant(surfaces, model, kind_forms[0]['seed'])
            if index == 0:
                pictures[f'{kind} bark'] = bark_tile(model, kind_forms[0]['seed'])
            mesh = nearby(scene, plant, model, form, near_mesh.budget_of(form), tiles, pictures, kind, index == 0,
                          np.random.default_rng(form['seed'] + 31))
            near_mesh.occlusion(mesh, surfaces, float(np.clip(model.height * 0.25, 0.5, 4.0)))
            entry = dict(kind=kind, mesh=mesh, model=model, **measures(model, surfaces, mesh))
            if kind not in NEAR_ONLY:
                centre, radius = sprites.sphere_of(surfaces)
                name = f'{kind} {index} impostor'
                pictures[name] = sprites.impostor(scene, plant, centre, radius)
                sheets.append(name)
                entry.update(impostor=name, centre=centre, radius=radius, canopy=sprites.canopy_of(pictures[name]))
            forms.append(entry)
            print(f'{biome} {kind} {index}: {mesh.triangles} triangles, {time.time() - started:.0f} s', flush=True)
        groups.append(tiles)
    pictures = {name: value for name, value in pictures.items() if not name.endswith(' length')}
    places, count = atlas.packed(sheets, groups)
    layers = []
    for layer, (albedo, normal) in enumerate(atlas.layers(pictures, places, count)):
        names = (f'layer-{layer}-albedo.png', f'layer-{layer}-normal.png')
        for name, data in zip(names, (albedo, normal)):
            with open(os.path.join(folder, name), 'wb') as file:
                file.write(data)
        layers.append(dict(albedo=f'{biome}/{names[0]}', normal=f'{biome}/{names[1]}'))
    rects = {name: (x / atlas.LAYER, y / atlas.LAYER, 0.25, 0.25) for name, (_, x, y) in places.items()}
    kinds = {}
    for entry in forms:
        kind = entry['kind']
        name = f'{kind.replace(" ", "-")}-{len(kinds.get(kind, []))}.mesh'
        with open(os.path.join(folder, name), 'wb') as file:
            file.write(near_mesh.encoded(entry['mesh'], entry['model'].height, rects))
        layer, x, y = places[f'{kind} bark']
        made = dict(mesh=f'{biome}/{name}', triangles=entry['triangles'], layer=layer,
                    bark=[x / atlas.LAYER, y / atlas.LAYER, 0.25, 0.25], top=entry['top'], spread=entry['spread'],
                    shade=entry['shade'], leafy=entry['leafy'], crown=entry['crown'])
        if 'impostor' in entry:
            sheet_layer, _, top = places[entry['impostor']]
            centre = entry['centre']
            made['impostor'] = dict(layer=sheet_layer, top=top / atlas.LAYER,
                                    centre=[round(float(centre[0]), 3), round(-float(centre[1]), 3),
                                            round(float(centre[2]), 3)],
                                    radius=round(entry['radius'], 3))
            made['canopy'] = entry['canopy']
        kinds.setdefault(kind, []).append(made)
    return dict(layers=layers, kinds=kinds)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('biomes', nargs='*')
    parser.add_argument('--samples', type=int, default=24)
    arguments = parser.parse_args()
    for biome in arguments.biomes or list(BIOMES):
        entry = bake_biome(biome, arguments.out, arguments.samples)
        with open(os.path.join(arguments.out, f'{biome}.json'), 'w') as file:
            json.dump(entry, file, indent=1)


if __name__ == '__main__':
    main()
