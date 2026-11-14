"""The forge's layer strips as lossless WebP, for a production build that ships them in place of the PNGs.

    python3 -I tools/studioWebp.py --cache <dir> [--src public/art/studio/forge/layers] [--jobs N]

Each PNG under --src is encoded to <dir>/<same path>.webp, with every texel exact: the colour under a clear texel is
kept too. The encoder decodes each WebP again and fails unless its RGBA bytes are the PNG's. <dir>/manifest.json names
each strip's PNG by its SHA-256, so a later run encodes only the strips that changed and removes the WebP of a strip
that is gone. The build (scripts/forgeWebp.mjs) refuses a cache that does not match the strips it ships."""
import argparse
import hashlib
import io
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

import PIL
from PIL import Image, features

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
SRC = os.path.join(ROOT, 'public', 'art', 'studio', 'forge', 'layers')
MANIFEST = 'manifest.json'
# A different encoder may write different bytes for the same strip, so a cache made by another one is encoded again
ENCODER = f'pillow {PIL.__version__}, libwebp {features.version("webp")}, lossless quality 80 method 4 exact'
SAVE = dict(lossless=True, quality=80, method=4, exact=True)


def strips(src):
    """Every PNG under src, as paths under it with / between folders, sorted."""
    out = []
    for base, dirs, names in os.walk(src):
        dirs.sort()
        for name in names:
            if name.endswith('.png'):
                out.append(os.path.relpath(os.path.join(base, name), src).replace(os.sep, '/'))
    return sorted(out)


def webp_of(rel):
    return rel[:-len('.png')] + '.webp'


def work(job):
    """One strip: kept when its PNG's hash and its WebP's size are the manifest's, else encoded and checked exact.
    Answers (path, sha256, WebP bytes, PNG bytes, whether it was encoded)."""
    rel, png, out, known = job
    raw = open(png, 'rb').read()
    sha = hashlib.sha256(raw).hexdigest()
    if known and known.get('sha256') == sha and os.path.isfile(out) and os.path.getsize(out) == known.get('webp'):
        return rel, sha, known['webp'], len(raw), False
    image = Image.open(io.BytesIO(raw))
    image.load()
    rgba = image if image.mode == 'RGBA' else image.convert('RGBA')
    buf = io.BytesIO()
    rgba.save(buf, 'WEBP', **SAVE)
    data = buf.getvalue()
    back = Image.open(io.BytesIO(data))
    back.load()
    if back.mode != 'RGBA' or back.size != rgba.size or back.tobytes() != rgba.tobytes():
        raise RuntimeError(f'{rel}: the WebP does not decode to the PNG\'s texels')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    # written beside and moved into place, so a build that linked the old file keeps its bytes
    tmp = f'{out}.tmp{os.getpid()}'
    with open(tmp, 'wb') as f:
        f.write(data)
    os.replace(tmp, out)
    return rel, sha, len(data), len(raw), True


def read_manifest(cache):
    try:
        doc = json.load(open(os.path.join(cache, MANIFEST)))
    except (OSError, ValueError):
        return {}
    files = doc.get('files') if isinstance(doc, dict) and doc.get('encoder') == ENCODER else None
    return files if isinstance(files, dict) else {}


def write_manifest(cache, files):
    path = os.path.join(cache, MANIFEST)
    with open(path + '.tmp', 'w') as f:
        json.dump({'encoder': ENCODER, 'files': dict(sorted(files.items()))}, f, separators=(',', ':'))
    os.replace(path + '.tmp', path)


def sweep(cache, keep):
    """Remove every file under the cache that is not the manifest or a kept strip's WebP, then the empty folders."""
    gone = 0
    for base, _, names in os.walk(cache, topdown=False):
        for name in names:
            rel = os.path.relpath(os.path.join(base, name), cache).replace(os.sep, '/')
            if rel != MANIFEST and rel not in keep:
                os.remove(os.path.join(base, name))
                gone += 1
        if base != cache and not os.listdir(base):
            os.rmdir(base)
    return gone


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--cache', required=True, help='the folder that holds the WebP strips and the manifest')
    ap.add_argument('--src', default=SRC, help='the PNG strips (default: the studio\'s forge layers)')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    args = ap.parse_args()
    began = time.time()
    cache = os.path.abspath(args.cache)
    os.makedirs(cache, exist_ok=True)
    paths = strips(args.src) if os.path.isdir(args.src) else []
    present = set(paths)
    known = read_manifest(cache)
    removed = sum(1 for rel in known if rel not in present)
    files, encoded, png_bytes, webp_bytes = {}, 0, 0, 0
    jobs = [(rel, os.path.join(args.src, rel), os.path.join(cache, webp_of(rel)), known.get(rel)) for rel in paths]
    with ProcessPoolExecutor(max(1, args.jobs)) as pool:
        for n, (rel, sha, webp, png, fresh) in enumerate(pool.map(work, jobs, chunksize=32), 1):
            files[rel] = {'sha256': sha, 'webp': webp}
            encoded += fresh
            png_bytes += png
            webp_bytes += webp
            if n % 5000 == 0:
                write_manifest(cache, {**{k: v for k, v in known.items() if k in present}, **files})
                print(f'{n} of {len(paths)} strips, {encoded} encoded, {time.time() - began:.0f} s', flush=True)
    write_manifest(cache, files)
    strays = sweep(cache, {webp_of(rel) for rel in files})
    share = f' ({100 * webp_bytes / png_bytes:.1f}%)' if png_bytes else ''
    print(f'{len(files)} strips: {png_bytes:,} bytes as PNG, {webp_bytes:,} bytes as WebP{share}')
    print(f'{encoded} encoded, {len(files) - encoded} kept, {removed} removed, {strays} files cleared, '
          f'{time.time() - began:.1f} s on {max(1, args.jobs)} processes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
