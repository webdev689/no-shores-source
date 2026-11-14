"""The forge viewer's art for a published page: every picture the viewer reads, re-encoded as lossless WebP (exact, so
the compositor reads the same texels as from the PNGs) and laid end to end in packs, with an index of each picture's
pack, byte offset and length. A page fetches a picture's bytes out of its pack and decodes it alone. The layer strips
lie by body, then animation, then layer, so one look's frame in one move reads one or two packs.

    python3 -I tools/forgeViewer/pack.py --out <dir> [--files-mib 200]

Writes <dir>/packs/f-NNN.webp (served beside the page, at most 14 MiB each, the first --files-mib of them),
<dir>/packs/a-NNN.webp (for the page's asset store, at most 19 MiB each) and <dir>/index.json:
{"packs": ["packs/f-000.webp", ..., "packs/a-000.webp", ...], "pictures": {"<path>": [pack, offset, length, type]}}.
A path is the studio's (forge/layers/male/body_walk.png) or the site's own outside it (@art/crossbow/crossbow-iron.png).
An asset pack's entry is its file name until the page's store answers its url; the publisher writes the urls in."""
import argparse
import io
import json
import os
from concurrent.futures import ProcessPoolExecutor

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
STUDIO = os.path.join(ROOT, 'public', 'art', 'studio')
ART = os.path.join(ROOT, 'public', 'art')
FILE_PACK = 14 * 1024 * 1024   # a page's binary file is at most 15 MB
ASSET_PACK = 19 * 1024 * 1024   # an image in the asset store is at most 20 MiB
TYPES = {'.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'}


def pictures():
    """Every picture, in pack order: the layer strips by body, animation and layer, then the studio's other pictures,
    then the site's own outside the studio. Each as (path, file on disk)."""
    layers, other = [], []
    for base, _, names in os.walk(STUDIO):
        for name in names:
            if not name.lower().endswith('.png'):
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, STUDIO).replace(os.sep, '/')
            (layers if rel.startswith('forge/layers/') else other).append((rel, full))
    looks = json.load(open(os.path.join(ROOT, 'src', 'systems', 'studioArt', 'forgeLooks.json')))

    def order(item):
        body, file = item[0].split('/')[2:4]
        stem = file[:-len('.png')]
        depth = stem.endswith('_z')
        stem = stem[:-2] if depth else stem
        anims = sorted(looks['bodies'].get(body, {}).get('anims', {}), key=len, reverse=True)
        anim = next((a for a in anims if stem.endswith('_' + a)), '')
        return (body, anim, stem[:-len(anim) - 1] if anim else stem, depth)
    site = []
    for base, dirs, names in os.walk(ART):
        if os.path.relpath(base, ART).split(os.sep)[0] == 'studio':
            dirs[:] = []
            continue
        for name in names:
            if os.path.splitext(name)[1].lower() in TYPES:
                full = os.path.join(base, name)
                site.append(('@art/' + os.path.relpath(full, ART).replace(os.sep, '/'), full))
    return sorted(layers, key=order) + sorted(other) + sorted(site)


def encode(item):
    """A picture's bytes for its pack: a PNG as lossless WebP, its texels exact (alpha's hidden colour kept too); a
    WebP or a JPEG of the site's as it is."""
    path, full = item
    ext = os.path.splitext(full)[1].lower()
    if ext != '.png':
        return path, open(full, 'rb').read(), TYPES[ext]
    out = io.BytesIO()
    Image.open(full).convert('RGBA').save(out, 'WEBP', lossless=True, quality=80, method=4, exact=True)
    return path, out.getvalue(), 'image/webp'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--files-mib', type=float, default=200, help='how much of the art the page serves as its own files')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    args = ap.parse_args()
    os.makedirs(os.path.join(args.out, 'packs'), exist_ok=True)
    budget = args.files_mib * 1024 * 1024
    packs, index = [], {}
    cur, size, filed = None, 0, 0

    def close():
        if cur:
            cur[1].close()

    with ProcessPoolExecutor(args.jobs) as pool:
        for n, (path, data, kind) in enumerate(pool.map(encode, pictures(), chunksize=64)):
            as_file = filed < budget
            limit = FILE_PACK if as_file else ASSET_PACK
            if cur is None or size + len(data) > limit or cur[2] != as_file:
                close()
                name = f'packs/{"f" if as_file else "a"}-{sum(1 for p in packs if p.startswith("packs/" + ("f" if as_file else "a"))):03d}.webp'
                packs.append(name)
                cur, size = (name, open(os.path.join(args.out, name), 'wb'), as_file), 0
            cur[1].write(data)
            index[path] = [len(packs) - 1, size, len(data), kind]
            size += len(data)
            if as_file:
                filed += len(data)
            if n % 5000 == 0:
                print(f'{n} pictures, {len(packs)} packs', flush=True)
    close()
    json.dump({'packs': packs, 'pictures': index}, open(os.path.join(args.out, 'index.json'), 'w'), separators=(',', ':'))
    sizes = [os.path.getsize(os.path.join(args.out, p)) for p in packs]
    print(f'{len(index)} pictures in {len(packs)} packs, {sum(sizes) / 2 ** 30:.2f} GiB '
          f'({sum(s for p, s in zip(packs, sizes) if "/f-" in p) / 2 ** 20:.0f} MiB as the page\'s files)')


if __name__ == '__main__':
    main()
