"""The mount looks (barding.py) as the game's 3D horse reads them: each look's pieces as one mesh skinned to the bake's
bones, and the swatches' picture they point into.

    python -I tools/sprite-forge/barding_bake.py --bake src/assets/horse

Pure: numpy alone, and PIL to write the picture."""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from barding import LOOKS, STRIPE, SWATCHES, near_rider, pieces, swatch_uv  # noqa: E402


def swatch_picture():
    """The swatches: a stripe each, its colour from its root (the picture's foot) to its tip, its alpha 255 less its
    glow."""
    names = list(SWATCHES)
    w, h = STRIPE
    img = np.zeros((h, w * len(names), 4), np.uint8)
    for i, n in enumerate(names):
        root, tip, glow, _ = SWATCHES[n]
        for y in range(h):
            s = 1.0 - (y + 0.5) / h   # the foot is the root
            img[y, i * w:(i + 1) * w, :3] = np.round(np.array(root) + (np.array(tip) - np.array(root)) * s)
            img[y, i * w:(i + 1) * w, 3] = round(255 * (1 - glow))
    return img


# the bake's numbers as whole numbers of these steps (horseModel.js `withBarding` reads them back): millimetres, a
# thousandth of the swatches' picture, a hundredth of a weight; the normals are worked out again where it is read
QUANT = {'positions': 0.001, 'uvs': 0.001, 'weights': 0.01}


def bake_mesh(look, made):
    """A look's pieces as one mesh of the game's bake, its UVs into the swatches, its numbers whole (`QUANT`)."""
    pos, uv, jj, ww, idx = [], [], [], [], []
    base = 0
    for pc in made:
        pos.append(pc['positions'])
        uv.append(swatch_uv(pc['material'], pc['v']))
        jj.append(pc['joints'])
        ww.append(pc['weights'])
        idx.append(pc['triangles'] + base)
        base += len(pc['positions'])
    w = np.round(np.concatenate(ww) / QUANT['weights']).astype(np.int64)
    w[:, 0] += 100 - w.sum(axis=1)   # each vertex's weights still sum to one
    whole = lambda a, q: np.round(np.concatenate(a) / q).astype(np.int64).ravel().tolist()   # noqa: E731
    return {'part': f'look_{look}', 'texture': 'barding', 'alpha': False, 'quant': QUANT,
            'positions': whole(pos, QUANT['positions']), 'uvs': whole(uv, QUANT['uvs']),
            'joints': np.concatenate(jj).ravel().tolist(), 'weights': w.ravel().tolist(),
            'indices': np.concatenate(idx).ravel().tolist()}


def bake_barding(out_dir):
    """The looks as the game's 3D horse reads them: `barding.json`, a mesh a look skinned to the bake's bones, and
    `barding.png`, the swatches."""
    from PIL import Image
    meshes = []
    for look in LOOKS:   # each look's own, and the pieces a first-person view leaves out apart (`<look>_near`)
        made = pieces(look)
        meshes.append(bake_mesh(look, [pc for pc in made if not near_rider(pc)]))
        near = [pc for pc in made if near_rider(pc)]
        if near:
            meshes.append(bake_mesh(f'{look}_near', near))
    with open(os.path.join(out_dir, 'barding.json'), 'w') as fh:
        json.dump({'barding': 1, 'looks': list(LOOKS), 'swatches': list(SWATCHES), 'meshes': meshes}, fh,
                  separators=(',', ':'))
        fh.write('\n')
    Image.fromarray(swatch_picture()).save(os.path.join(out_dir, 'barding.png'), optimize=True)
    return {m['part']: len(m['positions']) // 3 for m in meshes}


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--bake', required=True, help='the folder the game reads the horse from')
    args = ap.parse_args()
    print(bake_barding(args.bake))
