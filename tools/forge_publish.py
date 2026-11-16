"""Publishes the sprite forge's renders and tables to R2, and pulls the tables back so the forge can render more.

    python3 -I tools/forge_publish.py publish   # pack tools/forge/public/art/studio, upload, write the manifest
    python3 -I tools/forge_publish.py pull [--strips]   # the tables back, and with --strips every strip as PNG

Every object is named by the SHA-256 of its bytes, so a published object never changes and is cached for good. The
upload goes through tools/r2.py.
"""
import argparse
import io
import json
import os
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Run with -I, the script's own folder is not on the path: R2's door sits beside it.
sys.path.insert(0, HERE)
from r2 import PUBLIC, published, put  # noqa: E402

REPO = os.path.dirname(HERE)
FORGE = os.path.join(HERE, 'forge')
TABLES_DIR = os.path.join(FORGE, 'src', 'systems', 'studioArt')
PACKED = os.path.join(FORGE, 'packs')
MANIFEST = os.path.join(REPO, 'content', 'forge', 'renders.json')
TABLES = {
    'looks': 'forgeLooks.json',
    'skins': 'forgeRaceSkins.json',
    'hair': 'forgeHairColours.json',
    'points-male': 'forgePoints-male.json',
    'points-female': 'forgePoints-female.json',
    'dyes': 'forgeDyes.json',
    'frames': 'forgeFrames.json',
}
ART = os.path.join(FORGE, 'public', 'art')


def placed(path):
    """Where a first-person frame sits on the 320 x 200 screen (its PNG's `oFFs`), and the box within it Daggerfall
    aligns (`boXs`), or None. WebP keeps neither, so they are kept in the frames table."""
    with open(path, 'rb') as file:
        data = file.read()
    found, at = {}, 8
    while at + 8 <= len(data):
        length, kind = struct.unpack('>I4s', data[at:at + 8])
        body = data[at + 8:at + 8 + length]
        if kind == b'oFFs':
            found['at'] = list(struct.unpack('>ii', body[:8]))
        elif kind == b'boXs':
            found['box'] = list(struct.unpack('>iiii', body[:16]))
        elif kind == b'IDAT':
            break
        at += 12 + length
    return found or None


def frames_table():
    """Every picture's placement, by its path in the pack index: the studio's own, and the site's own as `@art/`."""
    table = {}
    for base, _dirs, names in os.walk(ART):
        for name in names:
            if not name.endswith('.png'):
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, ART).replace(os.sep, '/')
            key = rel[len('studio/'):] if rel.startswith('studio/') else f'@art/{rel}'
            where = placed(full)
            if where:
                table[key] = where
    with open(os.path.join(TABLES_DIR, TABLES['frames']), 'w') as file:
        json.dump(table, file, separators=(',', ':'))
    print(f'{len(table)} placed frames', flush=True)


def publish():
    frames_table()
    pack = os.path.join(FORGE, 'tools', 'forgeViewer', 'pack.py')
    # Every pack as an asset pack: R2 has no per-page file budget to split them by.
    subprocess.run([sys.executable, '-I', pack, '--out', PACKED, '--files-mib', '0'], check=True)
    with open(os.path.join(PACKED, 'index.json')) as file:
        index = json.load(file)
    keys = []
    for name in index['packs']:
        with open(os.path.join(PACKED, name), 'rb') as file:
            keys.append(put(file.read(), 'packs', 'webp', 'image/webp'))
    index['packs'] = keys
    listing = json.dumps(index, separators=(',', ':')).encode()
    manifest = {'base': PUBLIC, 'index': put(listing, 'index', 'json', 'application/json'), 'tables': {}}
    for name, file_name in TABLES.items():
        with open(os.path.join(TABLES_DIR, file_name), 'rb') as file:
            manifest['tables'][name] = put(file.read(), 'tables', 'json', 'application/json')
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w') as file:
        json.dump(manifest, file, indent=2)
        file.write('\n')
    print(f'{len(index["pictures"])} pictures in {len(keys)} packs; manifest written to {MANIFEST}')


def pull(strips):
    from PIL import Image

    with open(MANIFEST) as file:
        manifest = json.load(file)
    os.makedirs(TABLES_DIR, exist_ok=True)
    for name, key in manifest['tables'].items():
        with open(os.path.join(TABLES_DIR, TABLES[name]), 'wb') as file:
            file.write(published(manifest, key))
        print(f'pulled {TABLES[name]}')
    if not strips:
        return
    index = json.loads(published(manifest, manifest['index']))
    by_pack = {}
    for path, (pack, offset, length, _kind) in index['pictures'].items():
        by_pack.setdefault(pack, []).append((path, offset, length))
    studio = os.path.join(FORGE, 'public', 'art', 'studio')
    for pack, pictures in sorted(by_pack.items()):
        data = published(manifest, index['packs'][pack])
        for path, offset, length in pictures:
            out = os.path.join(studio, path)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            # Lossless WebP back to PNG: the same texels the forge wrote.
            Image.open(io.BytesIO(data[offset:offset + length])).save(out)
        print(f'unpacked pack {pack + 1} of {len(index["packs"])}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('command', choices=['publish', 'pull'])
    parser.add_argument('--strips', action='store_true', help='pull: unpack every strip as PNG too')
    args = parser.parse_args()
    if args.command == 'publish':
        publish()
    else:
        pull(args.strips)


if __name__ == '__main__':
    main()
