"""The item forge's pictures, each rendered from a model of its own (tools/sprite-forge/items/).

The items (`--set items`, the default): each new item's picture, what the pack, the hotbar, every list and the item's
flat in the world draw (src/systems/itemArt/itemArtInstall.js). The rows and their sizes are
tools/sprite-forge/specs/items.json (node tools/sprite-forge/itemSpecs.mjs writes it from the item table). Writes
`<index>.png` for each row: its longest side the row's `px`, its ground clear.

    python -I tools/sprite-forge/itempics.py --out public/art/studio/forge/items [--only 532,1900] [--samples 24]
    python -I tools/sprite-forge/itempics.py --sheet /tmp/items.png   (every picture at 4x on one sheet, to look at)

The pictures (`--set pictures`): every other picture of a thing the forge renders in place of one painted in code,
named for the texture it replaces under the forge's studio folder, so the studio wears it (07-Rendering/Studio-Art.md).
Their rows are tools/sprite-forge/specs/pictures/<family>.json, keyed by the picture's path under the folder. A row names its
model, words and `px` as an item's does, or takes them `from` an item's row; and may name a `spoil` stage (kit.SPOIL),
an eye's `elevation` (degrees; a billboard is seen from level), a `seed`, and a `canvas` [w, h] the picture is set in,
`anchor`ed by its `foot` (a billboard stands on its canvas's bottom row) or its `centre`.

    python -I tools/sprite-forge/itempics.py --set pictures --out public/art/studio/forge [--only survival/538_2-0]"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

from items import kit  # noqa: E402
from items.models import load_all  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SPECS = os.path.join(HERE, 'specs', 'items.json')
PICTURES = os.path.join(HERE, 'specs', 'pictures')


def items():
    with open(SPECS) as fh:
        return json.load(fh)['items']


def rows(only=None, which='items'):
    """The set's rows, in order: (index, row) for the items, (path, row) for the pictures, a picture's row filled in
    from the item it names."""
    if which == 'items':
        table = items()
        keys = sorted(table, key=int)
        if only:
            keys = [k for k in keys if k in only]
        return [(int(k), table[k]) for k in keys]
    table = {}
    for name in sorted(os.listdir(PICTURES)):
        if name.endswith('.json'):
            with open(os.path.join(PICTURES, name)) as fh:
                for key, row in json.load(fh)['pictures'].items():
                    if key in table:
                        raise ValueError(f'itempics: {key} in two picture files')
                    table[key] = row
    out = []
    for key in sorted(table):
        if only and key not in only:
            continue
        row = dict(table[key])
        if 'from' in row:
            base = items()[str(row['from'])]
            row = {**base, 'seed': row['from'], **{k: v for k, v in row.items() if k != 'from'}}
        out.append((key, row))
    return out


def set_in(pic, canvas, anchor):
    """The picture set in a `canvas` [w, h]: its middle on the canvas's middle, its foot on the bottom row for `foot`."""
    w, h = canvas
    ph, pw = pic.shape[:2]
    if pw > w or ph > h:
        raise ValueError(f'itempics: a {pw}x{ph} picture does not fit its {w}x{h} canvas')
    out = np.zeros((h, w, 4), dtype=np.uint8)
    x0 = (w - pw) // 2
    y0 = h - ph if anchor == 'foot' else (h - ph) // 2
    out[y0:y0 + ph, x0:x0 + pw] = pic
    return out


def picture(index, row, samples):
    """One row's picture: its model built on a fresh stage and rendered."""
    models = load_all()
    fn = models.get(row['model'])
    if fn is None:
        raise KeyError(f'itempics: {index} names no model "{row["model"]}"')
    elevation = kit.ELEVATION
    kit.ELEVATION = row.get('elevation', elevation)
    try:
        sc = kit.setup(samples)
        words = dict(row['words'])
        seed = int(row.get('seed', words.pop('seed', index)))
        words.pop('seed', None)
        item = kit.Item(sc, spoil=row.get('spoil'), seed=seed)
        fn(item, words, seed)
        pic = item.render(row['px'], samples)
    finally:
        kit.ELEVATION = elevation
    return set_in(pic, row['canvas'], row.get('anchor', 'centre')) if row.get('canvas') else pic


def read_png(path):
    """A PNG as (h, w, 4) uint8 rows top first, read by Blender: the references the sheet sets beside each render."""
    import bpy
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(img)
    return np.clip(np.round(arr * 255), 0, 255).astype(np.uint8)


def sheet(pics, scale=4, cols=13, cell=44, ground=(60, 62, 66)):
    """Every picture on one sheet, `scale` times as large, in row order; a cell grown to the largest picture."""
    cell = max([cell] + [max(p.shape[:2]) + 4 for p in pics])
    n = len(pics)
    r = (n + cols - 1) // cols
    out = np.zeros((r * cell * scale, cols * cell * scale, 4), dtype=np.uint8)
    out[..., :3], out[..., 3] = ground, 255
    for i, pic in enumerate(pics):
        h, w = pic.shape[:2]
        big = np.repeat(np.repeat(pic, scale, axis=0), scale, axis=1)
        y0 = ((i // cols) * cell + (cell - h) // 2) * scale
        x0 = ((i % cols) * cell + (cell - w) // 2) * scale
        region = out[y0:y0 + h * scale, x0:x0 + w * scale]
        on = big[..., 3] > 0
        region[on] = big[on]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='')
    ap.add_argument('--sheet', default='')
    ap.add_argument('--only', default='', help='indices, comma-separated')
    ap.add_argument('--samples', type=int, default=kit.SAMPLES)
    ap.add_argument('--ref', default='', help='a folder of <index>.png the sheet sets to the left of each render')
    ap.add_argument('--set', default='items', choices=('items', 'pictures'))
    ap.add_argument('--cols', type=int, default=0, help='the sheet\'s columns (12 with --ref, else 13)')
    ap.add_argument('--scale', type=int, default=4, help='the sheet\'s magnification')
    args = ap.parse_args()
    only = set(args.only.split(',')) if args.only else None
    pics = []
    for index, row in rows(only, args.set):
        pic = picture(index, row, args.samples)
        pics.append(pic)
        if args.out:
            os.makedirs(args.out, exist_ok=True)
            path = os.path.join(args.out, f'{index}.png')
            os.makedirs(os.path.dirname(path), exist_ok=True)
            kit.write_png(path, pic)
        print(f'{index} {row["model"]} {pic.shape[1]}x{pic.shape[0]}', flush=True)
    if args.sheet:
        if args.ref:
            paired = []
            for (index, _), pic in zip(rows(only, args.set), pics):
                ref = os.path.join(args.ref, f'{index}.png')
                if os.path.exists(ref):
                    paired.append(read_png(ref))
                paired.append(pic)
            kit.write_png(args.sheet, sheet(paired, scale=args.scale, cols=args.cols or 12))
        else:
            kit.write_png(args.sheet, sheet(pics, scale=args.scale, cols=args.cols or 13))


if __name__ == '__main__':
    main()
