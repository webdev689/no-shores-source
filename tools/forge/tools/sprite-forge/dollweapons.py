"""The forge's weapons on the paper doll: each metal's own sword, dagger, mace, flail, warhammer, battleaxe, staff and
bow drawn in the doll's own records (TEXTURE.234), so the pack and the doll show the weapon the forge made. Daggerfall
draws a weapon in the doll's hand at a set slant, its grip broken where the fingers close over it; a one-handed
weapon has a record a hand. Each record is fitted from the player's own picture (dollReference.mjs) and rendered from
the forge's model (gear.py, daggers3p.py, blunts3p.py, bows.py): its grip on the fist, its length to the record's
reach, its face the way the record's faces, the fingers cut where the record's are. Nothing of Daggerfall's picture is
kept but where the hand is.

    ARENA2_PATH=... node tools/sprite-forge/dollReference.mjs /tmp/doll-ref.json 234
    python -I tools/sprite-forge/dollweapons.py --ref /tmp/doll-ref.json --fit
    python -I tools/sprite-forge/dollweapons.py --ref /tmp/doll-ref.json --out public/art/studio/forge/doll [--metals Iron]

`--fit` writes specs/doll-weapons.json, the woman's doll (233) and the man's (234): each record's template, the forge kind it draws, its size, the fist (`grip`),
the far end (`tip`), the gaps the fingers leave along the grip (`fingers`, distances from the fist along the weapon) and
the fist's half width. `--out` renders each record in every metal as `<archive>_<record>-0_<Metal>.png`, the name the
texture door asks by the metal's dye (systems/studioArt/studioArt.js registers it); Silver, which Daggerfall leaves undyed, is
`<archive>_<record>-0.png`. Each is the whole weapon, its place on the doll written in it (`oFFs`), so a blade past the
record's box is drawn whole."""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
SPEC = os.path.join(SPECS, 'doll-weapons.json')
METALS = ('Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')
UNDYED = 'Silver'   # Daggerfall's Silver dye is Unchanged: its picture is the record's bare name
# each weapon template: the forge's make it is drawn as (forgeWardrobe.js SHEATH_OF_TEMPLATE's kinds), its doll record
# (the template's playerTextureRecord) and whether a hand of each is drawn (an Either-hand weapon, equipRules.js)
TEMPLATES = {
    113: ('dagger', 5, True), 114: ('dagger', 22, True), 115: ('staff', 21, False), 116: ('sword', 19, True),
    117: ('sword', 26, True), 118: ('sword', 2, True), 119: ('sword', 17, True), 120: ('sword', 12, True),
    121: ('sword', 9, True), 122: ('sword', 4, False), 123: ('sword', 7, False), 124: ('mace', 14, True),
    125: ('flail', 8, False), 126: ('warhammer', 25, False), 127: ('battleaxe', 0, True),
    128: ('battleaxe', 24, False), 129: ('shortbow', 16, False), 130: ('longbow', 11, False),
}
SHORT_BLADES = (116, 117)   # the Shortsword and the Wakazashi: a metal's short sword, where it has one (gear.py)
BAND = 2.0          # texels either side of the axis a weapon's haft or grip is read in
HAND_HALF = 3.0     # the fist's half width across the weapon, where the fingers cut it


def records():
    """Every doll record a weapon is drawn in: record -> (template, kind)."""
    out = {}
    for t, (kind, rec, either) in TEMPLATES.items():
        out[rec] = (t, kind)
        if either:
            out[rec + 1] = (t, kind)
    return out


def _mask(rec):
    return np.array([[c != '0' for c in row] for row in rec['rows']], dtype=bool)


def _classes(rec):
    return np.array([[int(c) for c in row] for row in rec['rows']], dtype=np.int8)


def _axis(mask, seed=None):
    """The weapon's line: a point and a unit direction, from the texels near it (twice refined, so a head or a hanging
    chain off the line does not bend it). `seed` the texels to start from (a haft's wood), else every texel."""
    ys, xs = np.nonzero(mask)
    pts = np.stack([xs + 0.5, ys + 0.5], axis=1)
    if seed is not None and seed.sum() >= 8:
        sy, sx = np.nonzero(seed)
        start = np.stack([sx + 0.5, sy + 0.5], axis=1)
    else:
        start = pts
    c = start.mean(axis=0)
    _, _, vt = np.linalg.svd(start - c, full_matrices=False)
    d = vt[0]
    for width in (6.0, 3.0):
        perp = np.abs((pts - c) @ np.array([-d[1], d[0]]))
        near = pts[perp <= width]
        c = near.mean(axis=0)
        _, _, vt = np.linalg.svd(near - c, full_matrices=False)
        d = vt[0]
    return c, d, pts


HAFTED = ('battleaxe', 'mace', 'flail', 'warhammer', 'staff')
WOOD = (6, 7)   # a haft's texels: tan or red-brown


def fit_bow(rec):
    """A bow's record: its string the line between its two farthest texels, its grip the texel of the stave farthest
    from that line. `tip` is set along the string from the grip by half the string, so the bow turns to the string."""
    mask = _mask(rec)
    cls = _classes(rec)
    ys, xs = np.nonzero(mask)
    pts = np.stack([xs + 0.5, ys + 0.5], axis=1)
    sy, sx = np.nonzero(cls == 1)   # the string: the thin dark line, neither wood nor metal
    cord = np.stack([sx + 0.5, sy + 0.5], axis=1) if len(sx) >= 10 else pts
    c = cord.mean(axis=0)
    _, _, vt = np.linalg.svd(cord - c, full_matrices=False)
    t = (cord - c) @ vt[0]
    a, b = cord[t.argmin()], cord[t.argmax()]
    if a[1] > b[1]:
        a, b = b, a   # `a` the upper nock
    u = (a - b) / np.linalg.norm(a - b)
    n = np.array([-u[1], u[0]])
    wy, wx = np.nonzero(np.isin(cls, WOOD))
    stave = np.stack([wx + 0.5, wy + 0.5], axis=1) if len(wx) >= 10 else pts
    apex = stave[np.abs((stave - b) @ n).argmax()]
    half = float(np.linalg.norm(a - b)) / 2
    tip = apex + u * half
    return {'size': [rec['width'], rec['height']], 'hand': 'left', 'miss': 0.0,
            'grip': [round(float(v), 2) for v in apex], 'tip': [round(float(v), 2) for v in tip],
            'butt': [round(float(v), 2) for v in apex - u * half], 'fingers': []}


# the doll's fists, in the doll's own texels (each record stands at its offset there): Daggerfall's hands never move,
# so a weapon's grip is where its line passes its fist - the right hand's records slant down and away, the left's lie
# across the body
FISTS = {234: {'right': (221.0, 96.0), 'left': (276.0, 101.0)},   # the man's doll
         233: {'right': (221.0, 94.0), 'left': (275.0, 100.0)}}   # the woman's, her hands a texel or two higher
ARCHIVES = (233, 234)


def fit_record(rec, kind, archive=234):
    """A record's fist, far end and fingers, in the record's texels."""
    if kind in ('longbow', 'shortbow'):
        return fit_bow(rec)
    mask = _mask(rec)
    cls = _classes(rec)
    c, d, pts = _axis(mask, np.isin(cls, WOOD) if kind in HAFTED else None)
    n = np.array([-d[1], d[0]])
    t = (pts - c) @ d
    on = np.abs((pts - c) @ n) <= BAND
    lo, hi = float(t[on].min()), float(t[on].max())
    off = np.array([rec['offset']['x'], rec['offset']['y']], dtype=np.float64)
    best = None
    for hand, at in FISTS[archive].items():
        fist = np.asarray(at) - off
        ft = float(np.clip((fist - c) @ d, lo, hi))
        miss = float(np.linalg.norm(c + d * ft - fist))
        if best is None or miss < best[2]:
            best = (hand, ft, miss)
    hand, grip_t, miss = best
    tip_t = hi if hi - grip_t >= grip_t - lo else lo
    sign = 1.0 if tip_t == hi else -1.0
    # the fingers: along the grip, within a fist's reach, the texels the record leaves clear on its line
    occupied = set(np.round(t[on]).astype(int).tolist())
    fingers = []
    for k in range(int(round(grip_t)) - 5, int(round(grip_t)) + 6):
        if lo < k < hi and k not in occupied:
            fingers.append(round((k - grip_t) * sign, 2))
    grip, tip = c + d * grip_t, c + d * tip_t
    butt = c + d * (lo if sign > 0 else hi)
    return {'size': [rec['width'], rec['height']], 'hand': hand, 'miss': round(miss, 2),
            'grip': [round(float(v), 2) for v in grip], 'tip': [round(float(v), 2) for v in tip],
            'butt': [round(float(v), 2) for v in butt], 'fingers': fingers}


def fit(ref_path):
    """Every weapon record of both dolls, fitted: archive -> record -> fit."""
    ref = json.load(open(ref_path))
    old = json.load(open(SPEC)) if os.path.exists(SPEC) else {}
    spec = {}
    for archive in ARCHIVES:
        spec[str(archive)] = {}
        for rec, (template, kind) in sorted(records().items()):
            f = fit_record(ref[str(archive)][str(rec)], kind, archive)
            flip = old.get(str(archive), {}).get(str(rec), {}).get('flip', False)   # a face the render chose is kept
            spec[str(archive)][str(rec)] = {'template': template, 'kind': kind, **f, 'flip': flip}
    with open(SPEC, 'w') as fh:
        json.dump(spec, fh, indent=1)
        fh.write('\n')
    return spec


def face(ref_path, metal='Steel', samples=8):
    """Each record's face: the weapon rendered both ways round its own length, the way whose outline overlaps the
    record's the more (intersection over union) kept, the man's choice the woman's too."""
    import dollrender
    ref = json.load(open(ref_path))
    spec = json.load(open(SPEC))
    for key, fit in spec['234'].items():
        want = _mask(ref['234'][key])
        score = {}
        for flip in (False, True):
            got = dollrender.render_one(fit, fit['kind'], metal, samples, flip=flip)[..., 3] > 0
            score[flip] = (want & got).sum() / max(1, (want | got).sum())
        flip = score[True] > score[False]
        for archive in spec:
            spec[archive][key]['flip'] = bool(flip)
    with open(SPEC, 'w') as fh:
        json.dump(spec, fh, indent=1)
        fh.write('\n')
    return spec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', default='')
    ap.add_argument('--fit', action='store_true')
    ap.add_argument('--out', default='')
    ap.add_argument('--metals', default=','.join(METALS))
    ap.add_argument('--records', default='')
    ap.add_argument('--samples', type=int, default=32)
    ap.add_argument('--face', action='store_true', help='choose each record\'s face by its overlap with the reference')
    args = ap.parse_args()
    if args.fit:
        spec = fit(args.ref)
        for a, recs in spec.items():
            for k, v in recs.items():
                print(a, k, v['kind'], v['hand'], 'miss', v['miss'], 'grip', v['grip'], 'tip', v['tip'])
    if args.face:
        spec = face(args.ref)
        for a, recs in spec.items():
            print(a, ' '.join(f"{k}:{'flip' if v['flip'] else '-'}" for k, v in recs.items()))
    if args.out:
        import dollrender
        dollrender.render_weapons(args.out, json.load(open(SPEC)), [m for m in args.metals.split(',') if m],
                                  [int(r) for r in args.records.split(',') if r], args.samples,
                                  json.load(open(args.ref)))


if __name__ == '__main__':
    main()
