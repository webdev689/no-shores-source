"""Publishes the island modules a build wrote to R2 and names them in content/islands/modules.json.

    python3 -I tools/islands/publish.py DIR [--dry-run]

DIR is tools/islands/build.py's --out, holding a pack for every kit in kits.json and modules.blend; a pack missing,
not of this repository's format and parts, or not written with the rest by one build, is refused before anything is
uploaded. Each file goes up under its hash through tools/r2.py, comes back checked, and the manifest's one line of
JSON ends the log for a commit to take.
With --dry-run nothing is sent or written: the log shows the manifest the files would make.
"""
import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Run with -I, the script's own folder is not on the path: R2's door is one up, the contract beside it.
sys.path.insert(0, os.path.dirname(HERE))
sys.path.insert(0, HERE)
import catalog  # noqa: E402
import export  # noqa: E402
from r2 import PUBLIC, published, put  # noqa: E402

MANIFEST = os.path.join(catalog.CONTENT, 'modules.json')
FOLDER = 'islands'


def read_build(folder):
    """Each kit's pack and the .blend's bytes, refusing a missing file or a pack not of its kit and parts."""
    packs = {}
    for kit in catalog.KITS:
        path = os.path.join(folder, f'{kit}.modules')
        if not os.path.isfile(path):
            sys.exit(f'{path} is missing: build every kit first (tools/islands/build.py --out {folder})')
        with open(path, 'rb') as file:
            data = file.read()
        try:
            header = export.read_header(data)
        except ValueError as refusal:
            sys.exit(f'{path}: {refusal}')
        if header.get('style') != kit:
            sys.exit(f"{path} holds the kit {header.get('style')!r}, not {kit!r}")
        names = [module.get('name') for module in header.get('modules', [])]
        if names != catalog.required(kit):
            sys.exit(f'{path} holds {names}, not the modules kits.json asks of {kit}')
        packs[kit] = data
    blend = os.path.join(folder, 'modules.blend')
    if not os.path.isfile(blend):
        sys.exit(f'{blend} is missing: build every kit first')
    with open(blend, 'rb') as file:
        model = file.read()
    # Only what one build wrote together goes up: a pack an older (or a one-kit) run left would not match its model.
    stamp = os.path.join(folder, export.STAMP)
    built = json.load(open(stamp)) if os.path.isfile(stamp) else {}
    hashes = {kit: hashlib.sha256(data).hexdigest() for kit, data in packs.items()}
    if built.get('kits') != hashes or built.get('blend') != hashlib.sha256(model).hexdigest():
        sys.exit(f'{folder} is not one build of every kit: build them together (tools/islands/build.py --out {folder})')
    return packs, model


def key_of(data, extension):
    """The key R2 holds bytes under: their hash, as r2.put names them."""
    return f'{FOLDER}/{hashlib.sha256(data).hexdigest()}.{extension}'


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('folder', help="the build's --out folder")
    parser.add_argument('--dry-run', action='store_true', help='check the build and show the manifest; send nothing')
    args = parser.parse_args()
    packs, blend = read_build(os.path.abspath(args.folder))
    upload = (lambda data, extension: key_of(data, extension)) if args.dry_run else (
        lambda data, extension: put(data, FOLDER, extension, 'application/octet-stream'))
    kits = {kit: upload(data, 'modules') for kit, data in packs.items()}
    # Blender stamps each mesh with a seed of its own, so the .blend differs every build: while every pack is the
    # one the manifest names, its model is the one already published.
    committed = json.load(open(MANIFEST)) if os.path.isfile(MANIFEST) else {}
    same = committed.get('kits') == kits and committed.get('base') == PUBLIC and committed.get('source')
    manifest = {
        'base': PUBLIC,
        'parts': list(catalog.PARTS),
        'kits': kits,
        'source': committed['source'] if same else upload(blend, 'blend'),
    }
    if not args.dry_run:
        for key in [*manifest['kits'].values(), manifest['source']]:
            published(manifest, key)
        with open(MANIFEST, 'w') as file:
            file.write(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, separators=(',', ':')))


if __name__ == '__main__':
    main()
