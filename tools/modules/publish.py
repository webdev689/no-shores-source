"""Uploads the module meshes the manifest names to R2, from a bake's folder, and checks each answers.

    python -I tools/modules/publish.py <folder>

Run after `bake.py <folder>`, which writes content/modules/modules.json: a key already on R2 is left as it is.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from r2 import PUBLIC, fetch, put  # noqa: E402

MANIFEST = os.path.join(os.path.dirname(os.path.dirname(HERE)), 'content', 'modules', 'modules.json')


def main():
    folder = sys.argv[1]
    with open(MANIFEST) as file:
        manifest = json.load(file)
    for module in manifest['modules']:
        for group in module['groups']:
            with open(os.path.join(folder, group['mesh']), 'rb') as file:
                key = put(file.read(), 'modules', 'mesh', 'application/octet-stream')
            if key != group['mesh'] or fetch('HEAD', PUBLIC + key)[0] != 200:
                sys.exit(f'{module["name"]}: {group["mesh"]} is not served as published ({key})')
    print(json.dumps(manifest), flush=True)


if __name__ == '__main__':
    main()
