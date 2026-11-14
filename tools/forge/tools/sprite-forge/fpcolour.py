"""Grade a first-person weapon's colours onto the classic record's: render every fitted frame, and map each metal's
brightness onto the reference's metal, share for share, over every frame. Every other material's channels are mapped,
share for share, onto the reference's colours where both draw it.

    python -I tools/sprite-forge/fpcolour.py --spec tools/sprite-forge/specs/WEAPON04.json --ref /tmp/ref-W04.json

The reference (reference.mjs) stays outside the repo; only the grade's curves are written, beside the spec as
<spec>-grade.json. The game snaps a metal's grey into the palette's metal band, so the grade lays the forge's metal on
the band's steps as Daggerfall used them."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fparm  # noqa: E402
import fpforge  # noqa: E402
import fpmodel  # noqa: E402

GRADE_AT = (0.5, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99.5)   # the shares a grade maps
# leather, the flail's wood, the map's paper, the dagger's brass: graded by brightness onto the reference's own ramp
RAMPED = ('gauntlet', 'flailwood', 'parchment', 'hilt')
# metals graded as one, their brightness onto the band's together, so a collar darker than its wrap stays darker
SHARED = {'collar': 'wrap', 'head': 'wrap', 'macecore': 'macehead', 'dagger_groove': 'dagger_blade',
          'sword_groove': 'sword_blade',
          'skull_dark': 'pommel', 'hammer_collar': 'hammer_head'}
# metals graded onto Daggerfall's metal under them alone, never the whole band: the dagger's skull, white with dark
# hollows whatever the blade's light (fpdagger.py BONE_GLOW); on the band's whole, it would take the blade's brightest
UNDER = ('pommel',)
# metals whose shadow Daggerfall draws off the band, in dark greys no dye touches (the bow's grip): their darkest share,
# as much as the archive draws grey off the band under them, takes the archive's own colours there
SHADED = ('wrap',)
# a material whose colours are the archive's own of a hue, wherever its texels lie (the bow's green fletching): too
# small to stand on Daggerfall's where our render draws it, it would read the hand or the stave beside it
HUES = {'fletch': lambda rgb: (rgb[:, 1] > rgb[:, 0] + 12) & (rgb[:, 1] > rgb[:, 2] + 12)}
RAMP_AT = range(12)       # the ramp's steps, each a twelfth of the reference's texels by brightness


def reference_pixels(spec, ref, cls, records=None):
    """Every texel of class `cls` over the fitted records' frames (or `records`'), its brightness (0-255)."""
    out = []
    for r, rec in enumerate(spec['records']):
        if 'mirror' in rec or (records and r not in records):
            continue
        cw, ch = rec['canvas']
        for f in range(rec['frames']):
            c = np.array([int(x) for x in ref['records'][r]['frames'][f]]).reshape(ch, cw)
            rgb = np.frombuffer(bytes.fromhex(ref['records'][r]['rgb'][f]), dtype=np.uint8).reshape(ch, cw, 3)
            out.append(rgb[c == cls].astype(np.float64).mean(axis=1))
    return np.concatenate(out)


def reference_colours(spec, ref, keep, records=None):
    """Every drawn texel's colour over the fitted records' frames (or `records`') that `keep` keeps."""
    out = []
    for r, rec in enumerate(spec['records']):
        if 'mirror' in rec or (records and r not in records):
            continue
        cw, ch = rec['canvas']
        for f in range(rec['frames']):
            c = np.array([int(x) for x in ref['records'][r]['frames'][f]]).reshape(ch, cw)
            rgb = np.frombuffer(bytes.fromhex(ref['records'][r]['rgb'][f]), dtype=np.uint8).reshape(ch, cw, 3)
            drawn = rgb[c > 0].astype(np.float64)
            out.append(drawn[keep(drawn)])
    return np.concatenate(out)


def own_pixels(eye, spec, ref, records=None):
    """Each material's rendered pixels over the fitted frames, inside each record's canvas: {name: (all its colours,
    its colours where the reference draws its class, the reference's colours there)}. The pairs are read a texel inside
    the material's edge, where the two outlines may not line up; and every texel the reference draws under it, ours and
    theirs side by side, and its class there."""
    from scipy import ndimage as ndi
    out = {n: ([], [], [], [], []) for n in eye.names}
    for r, rec in enumerate(spec['records']):
        if 'mirror' in rec or (records and r not in records) or (not records and str(r) in fpforge.RECORD_GRADE):
            continue
        for f in range(rec['frames']):
            pose, part = fpforge.FIT[f'{r}:{f}'], fpforge.part_of(spec, rec)
            work = eye.screen(pose, part, raw=True, record=r, frame=f)
            ids = eye.id_map(pose, part, record=r)
            x, y, cw, ch = fpforge.rect(rec)
            keep = np.zeros(ids.shape, dtype=bool)
            keep[y:y + ch, x:x + cw] = True
            keep &= work[..., 3] > 0
            theirs = np.zeros(ids.shape + (3,))
            theirs[y:y + ch, x:x + cw] = np.frombuffer(bytes.fromhex(ref['records'][r]['rgb'][f]),
                                                       dtype=np.uint8).reshape(ch, cw, 3)
            cls = np.zeros(ids.shape, dtype=np.int8)
            cls[y:y + ch, x:x + cw] = np.array([int(c) for c in ref['records'][r]['frames'][f]]).reshape(ch, cw)
            detail = fpmodel.WEAPONS[spec['weapon']].get('detail')
            for k, n in enumerate(eye.names):
                m = keep & (ids == k + 1)
                if not m.any():
                    continue
                if detail and fpforge.CLASSES.get(n) == 5:   # a metal graded by its faces' tones (fpforge.tone)
                    work = work.copy()
                    whole = (work[..., 3] > 0) & (ids == k + 1)
                    work[m, :3] = np.round(fpforge.tone(work[..., :3].astype(np.float64).mean(axis=2), whole,
                                                        detail[0])[m])[:, None]
                pair = ndi.binary_erosion(m) & fpforge.pairs_with(n, cls)
                out[n][0].append(work[m][:, :3].astype(np.float64))
                out[n][1].append(work[pair][:, :3].astype(np.float64))
                out[n][2].append(theirs[pair])
                under = ndi.binary_erosion(m) & (cls > 0)   # every texel the reference draws under it, any class
                out[n][3].append(np.concatenate([work[under][:, :3].astype(np.float64), theirs[under]], axis=1))
                out[n][4].append(cls[under])
    return {n: tuple(np.concatenate(a) for a in v) for n, v in out.items() if v[0]}


def frame_grades(eye, spec, ref):
    """Each fitted frame's own grade of its metal: its brightness at the shares, Daggerfall's frame's at the same,
    {'<record>:<frame>': {material: {'lum': [ours, theirs]}}}. A frame with too little metal on either side has none."""
    out = {}
    borrowed = fpmodel.borrowed(spec['weapon'])   # the arm's grey sleeve is the arm's archive's, never this one's metal
    metals = [n for n in eye.names if fpforge.CLASSES.get(n) == 5 and n not in borrowed]
    for r, rec in enumerate(spec['records']):
        if 'mirror' in rec:
            continue
        x, y, cw, ch = fpforge.rect(rec)
        for f in range(rec['frames']):
            pose, part = fpforge.FIT[f'{r}:{f}'], fpforge.part_of(spec, rec)
            work = eye.screen(pose, part, raw=True, record=r, frame=f)
            ids = eye.id_map(pose, part, record=r)
            cls = np.array([int(c) for c in ref['records'][r]['frames'][f]]).reshape(ch, cw)
            rgb = np.frombuffer(bytes.fromhex(ref['records'][r]['rgb'][f]), dtype=np.uint8).reshape(ch, cw, 3)
            theirs = rgb[cls == 5].astype(np.float64).mean(axis=1)
            mine = work[y:y + ch, x:x + cw]
            own = {}
            for n in metals:   # metals graded as one (SHARED) share one curve, so each keeps its light against the rest
                group = [k for k in metals if SHARED.get(k, k) == SHARED.get(n, n)]
                m = (mine[..., 3] > 0) & np.isin(ids[y:y + ch, x:x + cw], [eye.names.index(k) + 1 for k in group])
                lum = mine[m][:, :3].astype(np.float64).mean(axis=1)
                if len(lum) >= 40 and len(theirs) >= 40:
                    own[n] = {'lum': [rising(np.percentile(lum, GRADE_AT)).round(2).tolist(),
                                      np.percentile(theirs, GRADE_AT).round(1).tolist()]}
            if own:
                out[f'{r}:{f}'] = own
    return out


def gentle(src, dst, steepest):
    """A grade held at its middle share and no steeper than `steepest` anywhere out from it: an evenly lit face stays
    even, where the reference's spread would be laid over the faint differences across it."""
    out = np.array(dst, dtype=np.float64)
    j = len(out) // 2
    for i in range(j + 1, len(out)):
        out[i] = out[i - 1] + min(dst[i] - dst[i - 1], steepest * (src[i] - src[i - 1]))
    for i in range(j - 1, -1, -1):
        out[i] = out[i + 1] - min(dst[i + 1] - dst[i], steepest * (src[i + 1] - src[i]))
    return np.clip(out, 0.0, 255.0)


def rising(src):
    """A grade's source shares, made to rise (so the map is one-to-one) and kept within 0-255."""
    return np.clip(np.maximum.accumulate(src + np.arange(len(src)) * 1e-3), 0.0, 255.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--ref', required=True)
    ap.add_argument('--samples', type=int, default=32)
    ap.add_argument('--records', default='', help='one record\'s own grade, laid over the archive\'s')
    ap.add_argument('--frames', action='store_true', help='each frame\'s own grade of its metal, over the rest')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    spec = fpforge.load(args.spec)
    ref = json.load(open(args.ref))
    eye = fpforge.Eye(spec, args.samples)
    path = args.spec[:-len('.json')] + '-grade.json'
    if args.frames:
        table = json.load(open(path)) if os.path.exists(path) else {}
        fpforge.FRAME_GRADE.clear()   # each frame's own is graded from its raw render: none of the old is needed
        table['frames'] = frame_grades(eye, spec, ref)
        with open(path, 'w') as fh:
            fh.write(json.dumps(table, indent=1) + '\n')
        print(f"{len(table['frames'])} frames graded apart")
        return
    only = {int(r) for r in args.records.split(',') if r != ''} or None
    own = own_pixels(eye, spec, ref, only)
    grade = {}
    worn = fparm.mats() if fpmodel.WEAPONS[spec['weapon']].get('hands') else ()   # our hands keep their own colours
    borrowed = fpmodel.borrowed(spec['weapon'])
    for n in eye.names:
        if n not in own or n in worn or n in borrowed:   # the arm's grade is its own archive's (fpforge.load)
            continue
        mine, paired, theirs_here, under, under_cls = own[n]
        if fpforge.CLASSES.get(n) == 5:   # drawn grey: its brightness onto the band's, over every frame
            group = [m for m in own if SHARED.get(m, m) == SHARED.get(n, n) and len(own[m][0])]
            lum = np.concatenate([own[m][0].mean(axis=1) for m in group])
            theirs = reference_pixels(spec, ref, 5, only)
            if SHARED.get(n, n) in UNDER:
                theirs = np.concatenate([own[m][2] for m in group]).mean(axis=1)
            if len(lum) < 40 or len(theirs) < 40:
                continue
            shade = None
            if n in SHADED or SHARED.get(n) in SHADED:   # its shadow off the band, in the archive's own dark colours
                both = np.concatenate([own[m][3] for m in group])
                rgb = both[:, 3:]   # its shadow is grey: the string, the wood or a glove under it is no shadow of it
                off = (np.concatenate([own[m][4] for m in group]) != 5) & (rgb.max(axis=1) - rgb.min(axis=1) <= 24)
                share = off.mean() if len(off) else 0.0
                if share > 0.05 and off.sum() >= 40:
                    cut = float(np.percentile(lum, 100.0 * share))
                    dark, theirs_dark = lum[lum < cut], both[off][:, 3:]
                    tl = theirs_dark.mean(axis=1)
                    order = np.argsort(tl)
                    bins = np.array_split(order, len(RAMP_AT))
                    shade = [round(cut, 2), [rising(np.percentile(dark, GRADE_AT)).round(2).tolist(),
                                             np.percentile(tl, GRADE_AT).round(1).tolist(),
                                             [float(tl[b].mean().round(1)) for b in bins],
                                             [theirs_dark[b].mean(axis=0).round(1).tolist() for b in bins]]]
                    lum = lum[lum >= cut]
            src, dst = rising(np.percentile(lum, GRADE_AT)), np.percentile(theirs, GRADE_AT)
            detail = fpmodel.WEAPONS[spec['weapon']].get('detail')
            if detail:
                dst = gentle(src, dst, detail[2])
            grade[n] = {'lum': [src.round(2).tolist(), dst.round(1).tolist()], **({'shade': shade} if shade else {})}
            if fpmodel.WEAPONS[spec['weapon']].get('detail'):
                grade[n]['detail'] = list(fpmodel.WEAPONS[spec['weapon']]['detail'])
            print(f'{n}: ours {np.percentile(lum, (10, 50, 90)).round()} reference {np.percentile(theirs, (10, 50, 90)).round()}'
                  + (f', its darkest {100 * share:.0f}% off the band' if shade else ''))
            continue
        if n in HUES and len(mine) >= 40:   # its hue's colours, wherever the archive draws them
            paired, theirs_here = mine, reference_colours(spec, ref, HUES[n], only)
        if len(paired) < 40 or len(theirs_here) < 40:
            continue
        if n in RAMPED:   # leather: its brightness onto the reference's, share for share, and the colour the reference
            # draws at that brightness (its own ramp), so a highlight is the reference's highlight, never a hue between
            lum, ref_lum = paired.mean(axis=1), theirs_here.mean(axis=1)
            order = np.argsort(ref_lum)
            bins = np.array_split(order, len(RAMP_AT))
            grade[n] = {'ramp': [rising(np.percentile(lum, GRADE_AT)).round(2).tolist(),
                                 np.percentile(ref_lum, GRADE_AT).round(1).tolist(),
                                 [ref_lum[b].mean().round(1) for b in bins],
                                 [theirs_here[b].mean(axis=0).round(1).tolist() for b in bins]]}
            grade[n]['ramp'][2] = [float(x) for x in grade[n]['ramp'][2]]
            print(f'{n}: ours {paired.mean(axis=0).round()} reference {theirs_here.mean(axis=0).round()} ({len(paired)} texels, ramped)')
            continue
        # any other material: each channel onto the reference's colours under it, share for share
        grade[n] = {'rgb': [[rising(np.percentile(paired[:, c], GRADE_AT)).round(2).tolist(),
                             np.percentile(theirs_here[:, c], GRADE_AT).round(1).tolist()] for c in range(3)]}
        print(f'{n}: ours {paired.mean(axis=0).round()} reference {theirs_here.mean(axis=0).round()} ({len(paired)} texels)')
    table = json.load(open(path)) if os.path.exists(path) else {}
    frames = table.pop('frames', None)
    if only:   # a record's own grade, laid over the archive's
        table.setdefault('records', {})[','.join(str(r) for r in sorted(only))] = grade
    else:
        table = dict(grade, **({'records': table['records']} if 'records' in table else {}))
    if frames is not None:
        table['frames'] = frames
    with open(path, 'w') as fh:
        fh.write(json.dumps(table, indent=1) + '\n')


if __name__ == '__main__':
    main()
