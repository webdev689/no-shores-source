"""The bare body's skin graded onto Daggerfall's bare archers' (482 the man's, 481 the woman's), a view at a time: the
body rendered ungraded (`layers.py --raw --layers body`), its skin's brightness at each share laid on the colour the
archer's skin has at that share, its shade included (colour.py `with_shadows`). Written to the body's
specs/mannequin-<body>.json `grade` as `skin` and `skin@<view>`.

    python -I tools/sprite-forge/layers.py --body male --raw --out /tmp/raw --layers body \
        --anims walk,idle,hurt,attack_sword,bow
    python -I tools/sprite-forge/skingrade.py --body male --raw /tmp/raw --ref /tmp/forge-ref-482.json

The reference (reference.mjs) stays outside the repo; only the ramps are written."""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from colour import with_shadows  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LOOKS = os.path.join(HERE, '..', '..', 'src', 'systems', 'studioArt', 'forgeLooks.json')
SHARES = 34   # the ramp's steps: a skin's light, darkest to brightest, in this many equal shares of its texels
SKIN = 2      # the reference's skin class (reference.mjs `colourClass`)


def raw_skin(raw, body, looks):
    """The ungraded body's skin by view: each texel's brightness (its channels' mean, as forge.grade_frame reads it)."""
    by_view = {v: [] for v in range(5)}
    anims = looks['bodies'][body]['anims']
    folder = os.path.join(raw, body)
    for name in sorted(os.listdir(folder)):
        if not name.startswith('body_') or name.endswith('_z.png'):
            continue
        anim = name[len('body_'):-len('.png')]
        h = anims[anim]['cell'][1]
        a = np.asarray(Image.open(os.path.join(folder, name)).convert('RGBA'), dtype=np.float64)
        for v in range(5):
            cell = a[v * h:(v + 1) * h]
            by_view[v].append(cell[cell[..., 3] > 0][:, :3].mean(axis=1))
    return {v: np.concatenate(x) for v, x in by_view.items()}


def ref_skin(ref):
    """The archer's skin texels by view, shade and all: [r, g, b] each. A record's view is its place in its five."""
    by_view = {v: [] for v in range(5)}
    for r, rec in enumerate(ref['records']):
        cw, ch = rec['canvas']
        for f, fr in enumerate(rec['frames']):
            cls = np.array([int(c) for c in fr]).reshape(ch, cw)
            rgb = np.frombuffer(bytes.fromhex(rec['rgb'][f]), dtype=np.uint8).reshape(ch, cw, 3)
            by_view[r % 5].append(rgb[cls == SKIN].astype(np.float64))
    return {v: np.concatenate(x) for v, x in by_view.items()}


def ramp(mine, theirs):
    """Our brightness at each share, then the reference's colour there: the mean of its texels in that share."""
    at = (np.arange(SHARES) + 0.5) / SHARES * 100
    src = np.maximum.accumulate(np.percentile(mine, at))
    src = src + np.arange(SHARES) * 1e-3   # strictly rising, for the interpolation
    order = np.argsort(theirs.mean(axis=1), kind='stable')
    bins = np.array_split(theirs[order], SHARES)
    dst = [b.mean(axis=0).round(1).tolist() for b in bins]
    return [src.round(2).tolist(), dst]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--body', required=True, choices=('male', 'female'))
    ap.add_argument('--raw', required=True, help='the folder layers.py --raw wrote the bare body into')
    ap.add_argument('--ref', required=True, help="the bare archer's reference (reference.mjs 482 or 481)")
    args = ap.parse_args()
    looks = json.load(open(LOOKS))
    mine = raw_skin(args.raw, args.body, looks)
    theirs = ref_skin(with_shadows(json.load(open(args.ref))))
    path = os.path.join(HERE, 'specs', f'mannequin-{args.body}.json')
    spec = json.load(open(path))
    grade = spec.setdefault('grade', {})
    grade['skin'] = {'ramp': ramp(np.concatenate(list(mine.values())), np.concatenate(list(theirs.values())))}
    for v in range(5):
        grade[f'skin@{v}'] = {'ramp': ramp(mine[v], theirs[v])}
        lo = np.percentile(theirs[v].mean(axis=1), (10, 50, 90)).round()
        print(f'{args.body} view {v}: ours {np.percentile(mine[v], (10, 50, 90)).round()} -> reference {lo}')
    with open(path, 'w') as fh:
        json.dump(spec, fh, indent=1)
        fh.write('\n')


if __name__ == '__main__':
    main()
