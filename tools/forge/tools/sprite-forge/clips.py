"""Where one layer shows through another it should cover, read from the strips as the game composes them
(forgeLayers.js `composeFrame`: the nearest surface wins, each layer drawn nearer by its order).

Each pair a character can wear together is checked: the bare body under everything; legs, feet and chest clothes
under one another by their bands; clothes under armour and armour's padding under its pieces; drapes over the clothes,
over armour (`_plated`) and over a full skirt (`_skirted`). Two faults are counted, in pixels a pair:

- a clip: on one part of the body (the depth strip's blue names it), what lies under showing over what covers it,
  by less than `SHALLOW` or where their surfaces cross (a shirt's hem under the trousers, a sleeve through a vest);
- a crossing: where two parts meet or a drape hangs, the two surfaces passing through each other, the nearer of
  them changing between neighbouring pixels both close and both on a smooth surface (a knee through a robe, an
  elbow through a cloak). An arm simply in front of the side is neither, and where two parts of the body meet (an arm
  pressed to the side, a thigh to a thigh) the crossing is the body's own pose, counted apart.

The sheet (`--show`) marks clips magenta and crossings cyan.

python clips.py --body male [--anims idle,walk] [--dirs a:b] [--looks index.json] [--show out.png] [--top 40]"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

import gametables

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
WEAPON, DRAPE = 9, 10   # fit.py's WEAPON_PIECE and FREE_PIECE
TIES = set()   # garments worn together in one band, found as the pairs are made
CONTACT = [0]   # where two parts of the body meet (an arm against the side): the body's own, counted apart
CLOSE = 200   # depth units (1e-4 m): two surfaces within 2 cm of each other where they cross
SMOOTH = 300   # a surface moving less than 3 cm between neighbouring pixels is one surface, not an edge
SHALLOW = 150   # what lies under, over what covers it by less than 1.5 cm


class Strips:
    """A body's strips, found along `dirs` (the first holding a layer's animation wins), as colour, depth and cell."""

    def __init__(self, looks, body, dirs):
        self.looks, self.body, self.dirs = looks, body, dirs
        self.order = looks.get('order', {})
        self.covers = looks.get('cover', {})
        self.scale = looks.get('depth', {}).get('scale', 10000)
        self.drawn = looks['bodies'][body]['layers']
        self.cache = {}

    def cell_of(self, layer, anim):
        """A layer's cell in `anim` and its root: its own where it is drawn past the animation's (forgeLayers.js
        `layerCellOf`)."""
        B = self.looks['bodies'][self.body]
        c = B.get('cells', {}).get(layer, {}).get(anim) or B['anims'][anim]
        return c['cell'], c['root']

    def frame(self, anim):
        """The box every layer of `anim` fills about the body's root, its cell and its root: the animation's cell grown
        round each layer's own, so strips drawn in cells of their own are laid on one another pixel for pixel."""
        B = self.looks['bodies'][self.body]
        boxes = [B['anims'][anim]] + [c[anim] for c in B.get('cells', {}).values() if anim in c]
        left, top = max(b['root'][0] for b in boxes), max(b['root'][1] for b in boxes)
        right = max(b['cell'][0] - b['root'][0] for b in boxes)
        low = max(b['cell'][1] - b['root'][1] for b in boxes)
        return [left + right, top + low], [left, top]

    def get(self, layer, anim):
        key = (layer, anim)
        if key not in self.cache:
            self.cache[key] = None
            for d in self.dirs:
                p = os.path.join(d, self.body, f'{layer}_{anim}.png')
                if os.path.exists(p):
                    c = np.array(Image.open(p).convert('RGBA'))
                    z = np.array(Image.open(p[:-4] + '_z.png').convert('RGBA')).astype(np.int32)
                    c, z = (self.relaid(a, layer, anim) for a in (c, z))
                    depth = z[..., 0] * 256 + z[..., 1]
                    self.cache[key] = (c, depth, c[..., 3] > 0, z[..., 2])
                    break
        return self.cache[key]

    def relaid(self, strip, layer, anim):
        """A strip laid cell by cell on the animation's whole box (`frame`), each cell's root on the box's."""
        (cw, ch), (rx, ry) = self.cell_of(layer, anim)
        (fw, fh), (fx, fy) = self.frame(anim)
        if (cw, ch) == (fw, fh):
            return strip
        rows, cols = strip.shape[0] // ch, strip.shape[1] // cw
        out = np.zeros((rows * fh, cols * fw) + strip.shape[2:], strip.dtype)
        dx, dy = fx - rx, fy - ry
        for v in range(rows):
            for f in range(cols):
                out[v * fh + dy:v * fh + dy + ch, f * fw + dx:f * fw + dx + cw] = \
                    strip[v * ch:(v + 1) * ch, f * cw:(f + 1) * cw]
        return out

    def bias(self, layer):
        return round(self.order.get(layer, 0.0) * self.scale)

    def cover(self, layer):
        return round(self.covers.get(layer, 0.0) * self.scale)


def orders_meet(a, b):
    """forgeLayers.js `ordersMeet`, a pixel at a time: whether two layers' orders weigh where their parts meet."""
    a, b = np.asarray(a), np.asarray(b)
    no_hang = np.isin(a, (2, 3, 7, 8, WEAPON))
    no_hang_b = np.isin(b, (2, 3, 7, 8, WEAPON))
    out = (a == b) | ((a == DRAPE) & ~no_hang_b) | ((b == DRAPE) & ~no_hang)
    out &= (a != WEAPON) & (b != WEAPON)
    return out | (a == 0) | (b == 0)


def faults(S, under, over, anim):
    """The pixels where `under` shows through `over`, as two masks, or None: clips, where the two lie on the same
    part of the body and what is under shows over what covers it (by a graze or a crossing); and crossings, where
    two parts meet (an arm against the side) or a drape hangs, and their surfaces pass through each other."""
    a, b = S.get(under, anim), S.get(over, anim)
    if a is None or b is None or a[0].shape != b[0].shape:
        return None
    _, zu, on_u, pu = a
    _, zo, on_o, po = b
    both = on_u & on_o
    if not both.any():
        return None
    meet = orders_meet(pu, po)   # where the two layers' orders weigh, as forgeLayers.js `ordersMeet`
    bu, bo = S.bias(under), S.bias(over)
    torso = (pu == 1) & (po == 1)   # an armour piece over what is worn under it there by its cover
    bo = np.where(torso & (S.cover(over) > 0) & (bu < bo), S.cover(over), bo)
    bu = np.where(torso & (S.cover(under) > 0) & (bo < bu), S.cover(under), bu)
    gap = np.where(meet, (zu - bu) - (zo - bo), zu - zo)   # below 0: `under` drawn in front
    body = S.get('body', anim) if under != 'body' else None
    if body is not None:   # the body in front of both hides them: a garment's inside seen through its own neckline
        _, zb, on_b, _ = body
        both &= ~(on_b & (zb < np.minimum(zu, zo) - max(S.bias(under), S.bias(over))))
    shows = both & (gap < 0)
    graze = shows & (zo - zu < SHALLOW)
    cross = np.zeros_like(both)
    for dy, dx in ((0, 1), (1, 0)):
        p = (slice(0, both.shape[0] - dy), slice(0, both.shape[1] - dx))
        q = (slice(dy, None), slice(dx, None))
        pair = both[p] & both[q]
        flip = pair & ((gap[p] < 0) != (gap[q] < 0)) & (np.abs(gap[p]) < CLOSE) & (np.abs(gap[q]) < CLOSE)
        flip &= (np.abs(zu[p] - zu[q]) < SMOOTH) & (np.abs(zo[p] - zo[q]) < SMOOTH)
        cross[p] |= flip & (gap[p] < 0)
        cross[q] |= flip & (gap[q] < 0)
    same = (pu == po) & (pu > 0) & (po < WEAPON)
    hang = (pu == DRAPE) | (po == DRAPE)
    return (graze | cross) & same, cross & ~same & hang & (pu != WEAPON), cross & ~same & ~hang & (pu < WEAPON)


def pairs(T, S, body):
    """Every (under, over) a character of `body` can wear together, as `wornLook` stacks them, of the layers the body
    has: a drape over the body alone, over a full skirt (`_skirted`, a cloak) or over armour (`_plated`)."""
    lo, hi = (141, 181) if body == 'male' else (182, 216)
    has = set(S.drawn)
    mine = set()
    for t in T['garments']:
        if lo <= int(t) <= hi:
            for v in T['garments'][t]:
                mine.update(v.split(' '))
    slot_of, _ = gametables.slots()
    shells = sorted(g for g in mine if g in has)
    hangs = sorted(g for g in mine if f'{g}_drape' in has)
    full = set(T['full'])
    metals = sorted({n.split('_', 1)[1] for n in has if n.startswith('cuirass_')})
    armour = [f'{p}_{m}' for m in metals for p in sorted(set(T['pieces'].values())) if f'{p}_{m}' in has]
    out = set()
    for layer in shells + [f'{g}_drape' for g in hangs] + [f'{g}_plated' for g in hangs if f'{g}_plated' in has]:
        out.add(('body', layer))
    for a in shells:   # clothes worn together, the lower band under the higher
        for b in shells:
            if a < b and gametables.worn_with(a, b):
                if S.bias(a) == S.bias(b):   # neither lies over the other: a fault of the wardrobe's bands
                    TIES.add((a, b))
                    continue
                out.add((a, b) if S.bias(a) < S.bias(b) else (b, a))
    skirted = any(g in full for g in hangs)
    for g in hangs:   # what hangs over the clothes worn with it and its own garment's
        cloak = slot_of.get(g) == 'Cloak'
        for b in shells:
            if b == g or gametables.worn_with(b, g):
                out.add((b, f'{g}_drape'))
                if cloak and f'{g}_skirted' in has:
                    out.add((b, f'{g}_skirted'))
        if cloak:
            for b in hangs:
                if slot_of.get(b) != 'Cloak':
                    over = f'{g}_skirted' if b in full and f'{g}_skirted' in has else f'{g}_drape'
                    out.add((f'{b}_drape', over))
            if skirted and f'{g}_skirted' in has:
                out.add(('body', f'{g}_skirted'))
    for piece in armour:   # armour over the clothes, its padding under it
        out.add(('body', piece))
        for b in shells:
            out.add((b, piece))
        m = piece.rsplit('_', 1)[1]
        if f'under_{m}' in has:
            out.add((f'under_{m}', piece))
    for g in hangs:   # what hangs over armour
        if f'{g}_plated' not in has:
            continue
        for piece in armour:
            out.add((piece, f'{g}_plated'))
        for b in shells:
            if b == g or gametables.worn_with(b, g):
                out.add((b, f'{g}_plated'))
        if slot_of.get(g) == 'Cloak':
            for b in hangs:
                if slot_of.get(b) != 'Cloak' and f'{b}_plated' in has:
                    over = f'{g}_plated_skirted' if b in full and f'{g}_plated_skirted' in has else f'{g}_plated'
                    out.add((f'{b}_plated', over))
    return sorted(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--body', default='male')
    ap.add_argument('--anims', default='idle')
    ap.add_argument('--looks', default=os.path.join(ROOT, 'src', 'systems', 'studioArt', 'forgeLooks.json'))
    ap.add_argument('--dirs', default=os.path.join(ROOT, 'public', 'art', 'studio', 'forge', 'layers'))
    ap.add_argument('--top', type=int, default=40)
    ap.add_argument('--show', default='', help='a sheet of the worst pairs\' worst cells, the faults in magenta')
    ap.add_argument('--json', default='', help='every pair\'s counts, as JSON')
    ap.add_argument('--within', default='', help='only the pairs whose two layers are both in these folders (a:b)')
    args = ap.parse_args()
    T = gametables.tables()
    S = Strips(json.load(open(args.looks)), args.body, args.dirs.split(':'))
    anims = [a for a in args.anims.split(',') if a]
    rows = []
    for under, over in pairs(T, S, args.body):
        for anim in anims:
            if anim not in S.drawn.get(under, []) or anim not in S.drawn.get(over, []):
                continue
            if args.within and not all(any(os.path.exists(os.path.join(w, args.body, f'{n}_{anim}.png'))
                                           for w in args.within.split(':')) for n in (under, over)):
                continue
            got = faults(S, under, over, anim)
            if got is None:
                continue
            clip, cross, contact = got
            bad = clip | cross
            n = int(bad.sum())
            touch = int(contact.sum())
            if touch:
                CONTACT[0] += touch
            if n:
                cw, ch = S.frame(anim)[0]
                per = bad.reshape(bad.shape[0] // ch, ch, bad.shape[1] // cw, cw).sum(axis=(1, 3))
                v, f = np.unravel_index(per.argmax(), per.shape)
                rows.append({'under': under, 'over': over, 'anim': anim, 'pixels': n, 'clip': int(clip.sum()),
                             'cross': int(cross.sum()), 'worst': [int(v), int(f), int(per.max())]})
    rows.sort(key=lambda r: -r['pixels'])
    total = sum(r['pixels'] for r in rows)
    print(f'{args.body} {",".join(anims)}: {len(rows)} pairs at fault, {total} pixels; {len(TIES)} pairs in one band; '
          f'{CONTACT[0]} pixels where two parts of the body meet')
    for a, b in sorted(TIES)[:args.top]:
        print(f'  in one band: {a} and {b}')
    for r in rows[:args.top]:
        print(f"{r['pixels']:6d}  clip {r['clip']:5d}  cross {r['cross']:5d}  {r['under']:>28} under {r['over']:<30} "
              f"{r['anim']} worst view {r['worst'][0]} frame {r['worst'][1]} ({r['worst'][2]})")
    if args.json:
        json.dump(rows, open(args.json, 'w'), indent=1)
    if args.show and rows:
        show(S, rows[:args.top], args.show)


def show(S, rows, path):
    """Each pair's worst cell, three times the size: the pair composed, its faults in magenta, its name above."""
    from PIL import ImageDraw
    tiles = []
    for r in rows:
        cw, ch = S.frame(r['anim'])[0]
        v, f, _ = r['worst']
        cell = (slice(v * ch, (v + 1) * ch), slice(f * cw, (f + 1) * cw))
        best = np.full((ch, cw), 1 << 30)
        img = np.zeros((ch, cw, 3), np.uint8)
        for layer in (r['under'], r['over']):
            c, z, on, _ = S.get(layer, r['anim'])
            e = np.where(on[cell], z[cell] - S.bias(layer), 1 << 30)
            win = e < best
            best = np.where(win, e, best)
            img[win] = c[cell][..., :3][win]
        clip, cross, _ = faults(S, r['under'], r['over'], r['anim'])
        img[clip[cell]] = (255, 0, 255)
        img[cross[cell]] = (0, 255, 255)
        tiles.append((r, Image.fromarray(img).resize((cw * 3, ch * 3), Image.NEAREST)))
    w = max(t.size[0] for _, t in tiles)
    h = max(t.size[1] for _, t in tiles) + 16
    cols = 6
    sheet = Image.new('RGB', (w * cols, h * ((len(tiles) + cols - 1) // cols)), (40, 40, 46))
    d = ImageDraw.Draw(sheet)
    for i, (r, t) in enumerate(tiles):
        x, y = (i % cols) * w, (i // cols) * h
        sheet.paste(t, (x, y + 16))
        d.text((x + 3, y + 2), f"{r['under']} < {r['over']} {r['anim']} {r['pixels']}", fill=(240, 210, 150))
    sheet.save(path)
    print(path, sheet.size)


if __name__ == '__main__':
    sys.exit(main())
