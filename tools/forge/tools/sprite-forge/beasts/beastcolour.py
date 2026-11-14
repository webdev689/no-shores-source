"""Fit a beast's colours to the classic records, as colour.py fits the fighter's: tint each material until its pixels'
mean colour (in linear light) is the record's over the same pixels, then grade it. A material with a colour class of
its own in the reference (the rat's red eyes, its white teeth) maps each channel of its own pixels onto that class's,
share for share. A hide that covers the creature (the creature's GRADE_RGB: the rat's fur, the spider's legs) maps
each channel onto every reference pixel under it, lit or shadowed, of its own class or shadow's, so its shadows take
Daggerfall's hue and depth as well as its brightness; the others map their brightness alone.

    python -I tools/sprite-forge/beasts/beastcolour.py --spec tools/sprite-forge/beasts/specs/255.json \\
        --ref /tmp/forge-ref-255.json

With `--light N`, the stage's lights are fitted first, N tries: the key's direction and every light's strength,
until the light falls across each record's first frame the way it falls across Daggerfall's: brighter toward the same
side and the same end, by as much for its spread, each view as much brighter or darker than the others. The lights
are fixed to the creature, as Daggerfall's were (<spec>-light.json, `model`).

The reference stays outside the repo; only the lights, the tints (<spec>-colour.json) and the grade
(<spec>-grade.json) are written."""
import argparse
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.dirname(HERE)]

import numpy as np  # noqa: E402

import beastfit  # noqa: E402
import beastforge  # noqa: E402
import beastshape  # noqa: E402
import fit  # noqa: E402
import forge  # noqa: E402
import materials  # noqa: E402
import stage  # noqa: E402
from colour import GRADE_AT, interior, linear  # noqa: E402

MIN_PIXELS = 40   # a material shown on fewer pixels than this over the archive is left as it is


def frames_of(beast, ids, spec, ref, refs, tmp, grade=False):
    """Every frame's pixels: (material index, ours sRGB, the reference's sRGB, the reference's class) where both draw
    and the pixel lies inside its material's region; and each material's own pixels wherever it shows."""
    ids_all, ours_all, theirs_all, cls_all, own = [], [], [], [], {}
    for r, rec in enumerate(spec['records']):
        beastforge.aim(beastforge.density(rec) * beastshape.SHAPE['scale'])
        ids.scale = 1.0
        for f in range(rec['frames']):
            work = beastforge.render_frame(beast, rec, f, tmp, ids if grade else None)
            pic, _ = forge.crop(work, rec['canvas'], rec['place'])
            m = fit.crop(ids.image(beast.pose(rec, f)), rec['canvas'], rec['place'])
            cw, ch = rec['canvas']
            df = np.frombuffer(bytes.fromhex(ref['records'][r]['rgb'][f]), dtype=np.uint8).reshape(ch, cw, 3)
            dfc = refs[r][f]
            shown = (pic[..., 3] > 0) & (m > 0)
            for k in np.unique(m[shown]):
                own.setdefault(int(k), []).append(pic[shown & (m == k)][:, :3].astype(np.float64))
            keep = interior(m) & (dfc > 0) & shown
            ids_all.append(m[keep])
            ours_all.append(pic[keep][:, :3].astype(np.float64))
            theirs_all.append(df[keep].astype(np.float64))
            cls_all.append(dfc[keep])
    own = {k: np.concatenate(v) for k, v in own.items()}
    return (np.concatenate(ids_all), np.concatenate(ours_all), np.concatenate(theirs_all), np.concatenate(cls_all),
            own)


def falloff(mask, rgb):
    """Which way the light falls across a drawn shape: its brightness regressed on the pixel's place (x right, y down,
    each in the shape's own spread), each slope over the brightness's spread; and how many pixels it holds."""
    ys, xs = np.nonzero(mask)
    if len(xs) < 30:
        return None
    lum = rgb[mask].astype(np.float64).mean(axis=1)
    X = np.stack([(xs - xs.mean()) / max(xs.std(), 1.0), (ys - ys.mean()) / max(ys.std(), 1.0), np.ones(len(xs))], 1)
    c = np.linalg.lstsq(X, lum, rcond=None)[0]
    return np.array([c[0], c[1]]) / max(lum.std(), 1e-6), len(xs)


VIEW_LEVEL = 6.0   # how much a view's brightness against the others counts beside the light's falloff


def light_gap(beast, spec, ref, tmp, frames):
    """How far the render's light falls from Daggerfall's way on `frames` [(record, frame)]: the gap between the two
    falloffs, and the spread over the frames of how much brighter Daggerfall's frame is than ours (a back view lit
    as Daggerfall lit it is as much brighter or darker than its front), weighted by the frames' sizes. The overall
    brightness and the colour are the tints' and the grade's."""
    num = den = 0.0
    levels, weights = [], []
    for r, f in frames:
        rec = spec['records'][r]
        beastforge.aim(beastforge.density(rec) * beastshape.SHAPE['scale'])
        pic, _ = forge.crop(beastforge.render_frame(beast, rec, f, tmp), rec['canvas'], rec['place'])
        cw, ch = rec['canvas']
        df = np.frombuffer(bytes.fromhex(ref['records'][r]['rgb'][f]), dtype=np.uint8).reshape(ch, cw, 3)
        drawn = np.array([c != '0' for c in ref['records'][r]['frames'][f]]).reshape(ch, cw)
        a, b = falloff(pic[..., 3] > 0, pic[..., :3]), falloff(drawn, df)
        if a is None or b is None:
            continue
        num += float(((a[0] - b[0]) ** 2).sum()) * b[1]
        den += b[1]
        mine, theirs = pic[..., :3][pic[..., 3] > 0].astype(np.float64).mean(), df[drawn].astype(np.float64).mean()
        levels.append(np.log((theirs + 1.0) / (mine + 1.0)))
        weights.append(b[1])
    if not levels:
        return 0.0
    mean = np.average(levels, weights=weights)
    spread = np.average((np.array(levels) - mean) ** 2, weights=weights)
    return num / max(den, 1.0) + VIEW_LEVEL * float(spread)


LIGHT_KEYS = [('key', 0), ('key', 1), ('key', 2), ('key', 3), ('fill', 3), ('top', 3), ('world', None)]
LIGHT_STEPS = np.array([0.3, 0.3, 0.3, 1.0, 0.3, 0.4, 0.3])


def fit_light(beast, spec, ref, tmp, iters):
    """The stage's lights, fitted by a (1+1) search from the stage's own until `light_gap` is least."""
    frames = [(r, 0) for r in range(len(spec['records']))]
    stage.LIGHT['model'] = True   # fixed to the creature, as Daggerfall's were

    def light_of(x):
        L = json.loads(json.dumps(stage.LIGHT))
        for (k, i), v in zip(LIGHT_KEYS, x):
            if i is None:   # some ambient, never black shadows, never so much it lights every side alike
                L[k] = float(np.clip(v, 0.3, 1.2))
            else:
                L[k][i] = float(max(v, 0.0) if i == 3 else v)
        return L

    def value(x):
        stage.LIGHT.update(light_of(x))
        return light_gap(beast, spec, ref, tmp, frames)
    x = np.array([stage.LIGHT[k][i] if i is not None else stage.LIGHT[k] for k, i in LIGHT_KEYS], dtype=np.float64)
    first = value(x)
    # the key's side first, by a coarse grid over where it comes from (round the creature, and how high), since the
    # gap has a valley for each side; then every light's strength and the key's aim refined together
    grid = []
    for az in range(0, 360, 30):
        for el in (20, 40, 60, 80):
            a, e = np.radians(az), np.radians(el)
            c = x.copy()
            c[:3] = -np.array((np.sin(a) * np.cos(e), -np.cos(a) * np.cos(e), np.sin(e)))
            grid.append((value(c), az, el, c))
    best, az, el, x = min(grid, key=lambda g: g[0])
    print(f'light grid: {first:.3f} -> {best:.3f} (key from {az} deg round, {el} up)', flush=True)
    rng = np.random.default_rng(5)
    sigma = LIGHT_STEPS.copy()
    for it in range(iters):
        c = x + rng.normal(size=len(x)) * sigma
        v = value(c)
        if v < best:
            x, best = c, v
            sigma = np.minimum(sigma * 1.3, LIGHT_STEPS * 2)
        else:
            sigma = np.maximum(sigma * 0.9, LIGHT_STEPS * 0.05)
        print(f'light {it}: {best:.3f}', flush=True)
    print(f'light: {first:.3f} -> {best:.3f}', flush=True)
    stage.LIGHT.update(light_of(x))
    return light_of(x)


def class_pixels(ref, refs, cls):
    """Every reference texel of class `cls`, sRGB."""
    out = []
    for r, rec in enumerate(ref['records']):
        cw, ch = rec['canvas']
        for f, h in enumerate(rec['rgb']):
            rgb = np.frombuffer(bytes.fromhex(h), dtype=np.uint8).reshape(ch, cw, 3)
            out.append(rgb[refs[r][f] == cls])
    return np.concatenate(out).astype(np.float64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--ref', required=True)
    ap.add_argument('--rounds', type=int, default=3)
    ap.add_argument('--samples', type=int, default=32)
    ap.add_argument('--light', type=int, default=0, help='first fit the lights for this many tries')
    args = ap.parse_args()
    spec = beastforge.read_spec(args.spec, fitting=True)[0]
    ref = json.load(open(args.ref))
    beastforge.load_tables(args.spec)
    beastforge.GRADE.clear()   # the tints are fitted to the ungraded render; the grade is fitted after them
    tints = {k: list(v) for k, v in materials.TINT.items()}
    beast = beastforge.setup(spec, args.samples)
    fit.MAX_EDGE = 1.8 / (max(beastforge.density(rec) for rec in spec['records']) * beastshape.SHAPE['scale'] * 1.15)
    classify = beastfit.material_ids(beast)
    names = classify.names
    ids = beastfit.Cloud(beast, classify)
    refs = beastfit.reference(ref, beast)
    tmp = os.path.join(tempfile.mkdtemp(), 'c.png')
    cls_of = np.array([beast.kind.CLASS.get(n, 1) for n in names])
    if args.light:
        light = fit_light(beast, spec, ref, tmp, args.light)
        with open(args.spec.replace('.json', '-light.json'), 'w') as fh:
            fh.write(json.dumps(light, indent=1) + '\n')
    tint_path = args.spec.replace('.json', '-colour.json')
    for rnd in range(args.rounds):
        m, ours, theirs, dfc, _ = frames_of(beast, ids, spec, ref, refs, tmp)
        agree = dfc == cls_of[np.maximum(m, 1) - 1]
        report = []
        for k, n in enumerate(names):
            sel = agree & (m == k + 1)
            if sel.sum() < MIN_PIXELS:
                continue
            a, b = linear(ours[sel]).mean(axis=0), linear(theirs[sel]).mean(axis=0)
            factor = np.clip((b + 1e-4) / (a + 1e-4), 0.25, 4.0) ** 0.85
            materials.tint(beast.M[n], list(factor))
            tints[n] = [round(float(t * g), 4) for t, g in zip(tints.get(n, [1.0, 1.0, 1.0]), factor)]
            report.append(f'{n} {np.abs(a - b).mean():.3f}')
        print(f'round {rnd}: ' + ', '.join(report), flush=True)
        with open(tint_path, 'w') as fh:
            fh.write(json.dumps(dict(sorted(tints.items())), indent=1) + '\n')
    m, ours, theirs, dfc, own = frames_of(beast, ids, spec, ref, refs, tmp)
    grade = {}
    for k, n in enumerate(names):
        c = int(cls_of[k])
        mine = own.get(k + 1)
        if mine is None or len(mine) < MIN_PIXELS:
            continue
        if n in getattr(beast.kind, 'GRADE_RGB', ()):   # a hide: each channel onto the reference pixels under it
            # that are its own class or shadow: a gum's red or a tooth's white beside it is not the hide's colour
            others = [v for v in set(beast.kind.CLASS.values()) if v not in (1, c)]
            sel = (m == k + 1) & (dfc > 0) & ~np.isin(dfc, others)
            if sel.sum() >= MIN_PIXELS:
                grade[n] = {'rgb': [[np.percentile(ours[sel][:, ch], GRADE_AT).round(1).tolist(),
                                     np.percentile(theirs[sel][:, ch], GRADE_AT).round(1).tolist()] for ch in range(3)]}
            continue
        if c != 1:   # a class of its own: each channel onto the class's pixels, share for share
            theirs_c = class_pixels(ref, refs, c)
            if len(theirs_c) < MIN_PIXELS:
                continue
            grade[n] = {'rgb': [[np.percentile(mine[:, ch], GRADE_AT).round(1).tolist(),
                                 np.percentile(theirs_c[:, ch], GRADE_AT).round(1).tolist()] for ch in range(3)]}
            continue
        sel = (m == k + 1) & (dfc == 1)
        if sel.sum() < MIN_PIXELS:
            continue
        lo, lt = ours[sel].mean(axis=1), theirs[sel].mean(axis=1)   # brightness as grade_frame reads it
        grade[n] = {'lum': [np.percentile(lo, GRADE_AT).round(1).tolist(), np.percentile(lt, GRADE_AT).round(1).tolist()]}
    with open(args.spec.replace('.json', '-grade.json'), 'w') as fh:
        fh.write(json.dumps(grade, indent=1) + '\n')
    print('graded: ' + ', '.join(sorted(grade)), flush=True)


if __name__ == '__main__':
    main()
