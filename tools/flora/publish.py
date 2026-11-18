"""Publishes the baked flora to R2 and writes its manifest, content/nature/flora.json.

    python -I tools/flora/publish.py [--baked <folder>] [--samples N]

With --baked it publishes what tools/flora/bake.py wrote there; without, it bakes every biome first (bpy needed,
see bake.py). Every mesh and picture is uploaded under its hash, unless R2 already serves it, and each key is
checked to answer before the manifest names it.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)
import atlas  # noqa: E402
from r2 import PUBLIC, fetch, put  # noqa: E402
from species import BIOMES  # noqa: E402

MANIFEST = os.path.join(os.path.dirname(TOOLS), 'content', 'nature', 'flora.json')
KINDS = {'.mesh': 'application/octet-stream', '.png': 'image/png'}


def upload(folder, name):
    """Uploads one baked file and gives its key, once R2 answers for it."""
    with open(os.path.join(folder, name), 'rb') as file:
        data = file.read()
    extension = os.path.splitext(name)[1]
    key = put(data, 'flora', extension[1:], KINDS[extension])
    if fetch('HEAD', PUBLIC + key)[0] != 200:
        sys.exit(f'{key} was uploaded but R2 does not serve it')
    return key


def published(folder):
    """The manifest of the bake in `folder`, every file in it uploaded."""
    biomes = {}
    for biome in BIOMES:
        with open(os.path.join(folder, f'{biome}.json')) as file:
            entry = json.load(file)
        for layer in entry['layers']:
            for channel in ('albedo', 'normal'):
                layer[channel] = upload(folder, layer[channel])
        for forms in entry['kinds'].values():
            for form in forms:
                form['mesh'] = upload(folder, form['mesh'])
        biomes[biome] = entry
    return dict(base=PUBLIC, layer=atlas.LAYER, mips=atlas.MIPS,
                frames=dict(azimuths=atlas.AZIMUTHS, elevations=list(atlas.ELEVATIONS), cell=atlas.CELL / atlas.LAYER),
                biomes=biomes)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--baked')
    parser.add_argument('--samples', type=int, default=24)
    arguments = parser.parse_args()
    with tempfile.TemporaryDirectory() as scratch:
        folder = arguments.baked or scratch
        if not arguments.baked:
            subprocess.run([sys.executable, '-I', os.path.join(HERE, 'bake.py'), folder, '--samples',
                            str(arguments.samples)], check=True)
        manifest = published(folder)
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w') as file:
        json.dump(manifest, file, indent=1)
        file.write('\n')
    print(f'wrote {MANIFEST}')


if __name__ == '__main__':
    main()
