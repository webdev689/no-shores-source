"""Publishes the dungeon modules a build wrote to R2 and names them in content/dungeon/modules.json.

    python3 -I tools/dungeon/publish.py DIR

DIR is tools/dungeon/build.py's --out, holding a pack for every style in kits.json and modules.blend; a pack missing,
or not of this repository's format and parts, is refused before anything is uploaded. Each file goes up under its
hash through tools/r2.py, comes back checked, and the manifest's one line of JSON ends the log for a commit to take.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Run with -I, the script's own folder is not on the path: R2's door is one up, the contracts beside it.
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
import catalog  # noqa: E402
import export  # noqa: E402
from r2 import PUBLIC, published, put  # noqa: E402

MANIFEST = os.path.join(catalog.CONTENT, 'modules.json')


def read_build(folder):
    """Each style's pack and the .blend's bytes, refusing a missing file or a pack not of its style and parts."""
    packs = {}
    for style in catalog.STYLES:
        path = os.path.join(folder, f'{style}.modules')
        if not os.path.isfile(path):
            sys.exit(f'{path} is missing: build every style first (tools/dungeon/build.py --out {folder})')
        with open(path, 'rb') as file:
            data = file.read()
        try:
            header = export.read_header(data)
        except ValueError as refusal:
            sys.exit(f'{path}: {refusal}')
        if header.get('style') != style:
            sys.exit(f"{path} holds the style {header.get('style')!r}, not {style!r}")
        names = [module.get('name') for module in header.get('modules', [])]
        if names != catalog.required(style):
            sys.exit(f'{path} holds {names}, not the modules kits.json and landmarks.json ask of {style}')
        packs[style] = data
    blend = os.path.join(folder, 'modules.blend')
    if not os.path.isfile(blend):
        sys.exit(f'{blend} is missing: build every style first')
    with open(blend, 'rb') as file:
        return packs, file.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('folder', help="the build's --out folder")
    args = parser.parse_args()
    packs, blend = read_build(os.path.abspath(args.folder))
    styles = {style: put(data, 'dungeon', 'modules', 'application/octet-stream') for style, data in packs.items()}
    # Blender stamps each mesh with a seed of its own, so the .blend differs every build: while every pack is the
    # one the manifest names, its model is the one already published.
    committed = json.load(open(MANIFEST)) if os.path.isfile(MANIFEST) else {}
    same = committed.get('styles') == styles and committed.get('base') == PUBLIC and committed.get('source')
    manifest = {
        'base': PUBLIC,
        'parts': list(catalog.PARTS),
        'styles': styles,
        'source': committed['source'] if same else put(blend, 'dungeon', 'blend', 'application/octet-stream'),
    }
    for key in [*manifest['styles'].values(), manifest['source']]:
        published(manifest, key)
    with open(MANIFEST, 'w') as file:
        file.write(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, separators=(',', ':')))


if __name__ == '__main__':
    main()
