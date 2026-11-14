"""The grow step: every picture of a weapon file's records, rendered whole (FORGE_WHOLE=1: each frame's whole canvas,
the screen and any room past it, fpforge.py `room_of`), cut to the one rect its record draws in. That rect holds what
every picture of the record draws (each metal's, armour set's, left twin's and layer's) and Daggerfall's box, with
DRAWN_PAD round it, held to the canvas. So no frame ends where its picture does: it ends at the screen's foot, or past
the screen's edge by the room a resting frame has. Each picture, its depth and its wear map are written cut, with
their place (oFFs) and, on a spec grown past Daggerfall's boxes, where the box lies in them (boXs). Each record's rect
goes into the spec as its `drawn` (a swing's into its `sway`).

    python -I tools/sprite-forge/fpgrow.py --spec tools/sprite-forge/specs/WEAPON08.json \\
      --dir public/art/studio/forge/WEAPON08

`--records 0` grows those records alone, the rest left as they are. `--keep <dir>` names the pictures as they were cut
before (the folder's layout under it): inside the rect each was cut to, its pixels are kept, so growing a frame never
changes what it already showed, and the share of them a fresh render draws otherwise is reported. Last, each mirrored
record's pictures are made again from its source's as cut, flipped as the forge flips them (fpforge.py `flipped`), so
a mirror is its source's texel for texel; `--mirrors` does that alone, on a folder already grown."""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fpforge  # noqa: E402
import fpstage  # noqa: E402

AUX = ('_z', '_wear')   # a layer's depth and a frame's wear map: cut as their picture is, never measured


def pictures(spec, folder):
    """Each record's pictures in `folder` and its `layers`: {record: [path, ...]}."""
    name = re.compile(rf"^{re.escape(spec['archive'])}_(\d+)-(\d+)(_[A-Za-z_]+)?\.png$")
    out = {}
    for sub in ('', 'layers'):
        d = os.path.join(folder, sub)
        if not os.path.isdir(d):
            continue
        for n in sorted(os.listdir(d)):
            m = name.match(n)
            if m:
                out.setdefault(int(m.group(1)), []).append(os.path.join(d, n))
    return out


def box_on_canvas(spec, r):
    """Record `r`'s Daggerfall box ([x, y, w, h]) on its whole canvas, and the canvas's room (left, top, right)."""
    room = fpforge.room_of(spec, r)
    rec = fpforge.record_of(spec, r)
    x, y, w, h = fpforge.sway_rect(rec) if r >= len(spec['records']) else fpforge.rect(rec)
    return [x + room[0], y + room[1], w, h], room


def offset(path):
    """A PNG's place from its `oFFs` chunk, or None."""
    import struct
    b = open(path, 'rb').read()
    at = 8
    while at + 8 <= len(b):
        n, t = struct.unpack('>I4s', b[at:at + 8])
        if t in (b'IDAT', b'IEND'):
            return None
        if t == b'oFFs':
            x, y, unit = struct.unpack('>iiB', b[at + 8:at + 17])
            return (x, y) if unit == 0 else None
        at += 12 + n
    return None


def kept(spec, r, pics, folder, keep, read):
    """Lay each picture's earlier cut (under `keep`) back over its fresh whole canvas, where it was cut. Answers the
    share of those pixels the fresh render drew otherwise, by kind of picture."""
    (bx, by, bw, bh), (left, top, _) = box_on_canvas(spec, r)
    off = {}
    for p, pic in pics.items():
        was = os.path.join(keep, os.path.relpath(p, folder))
        if not os.path.exists(was):
            continue
        old = read(was)
        h, w = old.shape[:2]
        at = offset(was)
        if at is None:   # no place written (a map): its record's rect as the spec had it, at that size, else the box
            drawn = fpforge.record_of(spec, r).get('drawn') if r < len(spec['records']) else None
            at = drawn[:2] if drawn and [w, h] == drawn[2:] else None
        x, y = (at[0] + left, at[1] + top) if at else (bx, by)
        assert x >= 0 and y >= 0 and x + w <= pic.shape[1] and y + h <= pic.shape[0], f'{was}: past the canvas'
        fresh = pic[y:y + h, x:x + w]
        kind = re.sub(r'_\d+-\d+', '', os.path.basename(p))
        off.setdefault(kind, []).append(float((fresh != old).any(axis=2).mean()))
        pic[y:y + h, x:x + w] = old
    return {k: max(v) for k, v in off.items()}


def grow(spec, r, paths, read, write, folder=None, keep=None):
    """Cut record `r`'s pictures (`paths`) to the rect they all draw in, each first laid over with its earlier cut
    where `keep` has one. Answers the rect on the screen and `kept`'s shares."""
    (bx, by, bw, bh), (left, top, right) = box_on_canvas(spec, r)
    size = (fpstage.H + top, fpstage.W + left + right)
    pics = {p: np.array(read(p)) for p in paths}
    stale = [os.path.basename(p) for p, pic in pics.items() if pic.shape[:2] != size]
    assert not stale, f'record {r}: not rendered whole on its {size[1]} x {size[0]} canvas: {stale[:4]}'
    off = kept(spec, r, pics, folder, keep, read) if keep else {}
    x0, y0, x1, y1 = bx, by, bx + bw, by + bh
    for p, pic in pics.items():
        if os.path.splitext(p)[0].endswith(AUX):
            continue
        ys, xs = np.nonzero(pic[..., 3])
        if len(xs):
            x0, y0, x1, y1 = min(x0, xs.min()), min(y0, ys.min()), max(x1, xs.max() + 1), max(y1, ys.max() + 1)
    pad = fpforge.DRAWN_PAD
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(size[1], x1 + pad), min(size[0], y1 + pad)
    drawn = [int(x0 - left), int(y0 - top), int(x1 - x0), int(y1 - y0)]
    box = [int(bx - x0), int(by - y0), bw, bh] if spec.get('grown') else None
    for p, pic in pics.items():
        write(p, pic[y0:y1, x0:x1], drawn[:2], box)
    return drawn, off


def remirror(spec, folder, read, write):
    """Each mirrored record's pictures made again from its source's, of the same name past the record: the source laid on
    the screen at its place, flipped (`drop`, `shift`) and cut to the mirror's rect, with the mirror's place and box.
    Answers how many."""
    n = 0
    by_record = pictures(spec, folder)
    for r, rec in enumerate(spec['records']):
        if 'mirror' not in rec:
            continue
        assert fpforge.room_of(spec, r) == (0, 0, 0), 'a mirror is a strike: no room past the screen'
        src = rec['mirror']
        x, y, w, h = rec['drawn']
        box = fpforge.box_of(spec, rec)
        for path in by_record.get(r, []):
            name = os.path.basename(path)
            source = os.path.join(os.path.dirname(path), name.replace(f"_{r}-", f"_{src}-", 1))
            pic = read(source)
            sx, sy = offset(source)
            screen = np.zeros((fpstage.H, fpstage.W, 4), np.uint8)
            screen[sy:sy + pic.shape[0], sx:sx + pic.shape[1]] = pic
            flipped = fpforge.flipped(screen, rec)
            out = flipped[y:y + h, x:x + w].copy()
            lost = int((flipped[..., 3] > 0).sum() - (out[..., 3] > 0).sum())
            assert lost == 0, f'{name}: its source flipped draws {lost} texels past its rect'
            if name.endswith(f'{AUX[1]}.png'):   # a map holds 255 wherever it shows no metal (fpwear.py `save`)
                out[out[..., 3] == 0, :3] = 255
            write(path, out, [x, y], box)
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--dir', required=True, help="the weapon file's folder: its frames, and its layers beneath")
    ap.add_argument('--records', default='')
    ap.add_argument('--keep', default=None, help='the pictures as they were cut before, in the same layout')
    ap.add_argument('--mirrors', action='store_true', help='only make each mirrored record again from its source')
    args = ap.parse_args()
    import stage
    from PIL import Image
    spec = json.load(open(args.spec))
    assert spec.get('grown') or spec.get('placed'), 'a spec drawn on its own canvases or grown past the boxes'
    only = {int(r) for r in args.records.split(',') if r != ''} or None
    read = lambda p: np.asarray(Image.open(p).convert('RGBA'))   # noqa: E731
    write = lambda p, pic, at, box: stage.write_png(p, pic, at, box)   # noqa: E731
    for r, paths in sorted(pictures(spec, args.dir).items()):
        if args.mirrors or (only and r not in only):
            continue
        drawn, off = grow(spec, r, paths, read, write, args.dir, args.keep)
        if r < len(spec['records']):
            spec['records'][r]['drawn'] = drawn
        else:
            fpforge.record_of(spec, r)['sway']['drawn'] = drawn
        print(f'record {r}: {len(paths)} pictures cut to {drawn}', flush=True)
        for kind, share in sorted(off.items()):
            if share:
                print(f'  {kind}: the fresh render differs on {100 * share:.1f}% of the kept pixels', flush=True)
    if not args.mirrors:
        fpforge.write_spec(args.spec, spec)
    print(f'{remirror(spec, args.dir, read, write)} mirrored pictures made from their sources', flush=True)


if __name__ == '__main__':
    main()
