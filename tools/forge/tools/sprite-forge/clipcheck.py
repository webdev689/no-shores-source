"""Where one forge layer pokes through another in the composed frame: a leg through a skirt, a shirt through a
cuirass, a pauldron through hair, a blade sunk into a thigh. Strips only, no render.

    python -I tools/sprite-forge/clipcheck.py --body male [--anims walk,idle] [--strips <layers dir>] \\
        [--json out.json] [--sheet worst.png --worst 40]

Each pair of layers a look can wear together is laid on one canvas by its roots (forgeLayers.js `layerCellOf`) and
weighed as the composer weighs them: each drawn nearer by its order where their parts meet, armour over the clothes
under it by its cover (forgeLayers.js `composeFrame`, `ordersMeet`). A texel of the layer meant to lie outside that
loses to the inner one, with the outer's surface under `GAP` behind the inner's, is the inner poking through: a
surface behind by more is the far side of a form, which the inner rightly hides. A held or worn weapon's surface
within `TOUCH` of the body's, inside the body's outline, is a blade passing through it."""
import argparse
import json
import os
import re

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
LOOKS = os.path.join(ROOT, 'src', 'systems', 'studioArt', 'forgeLooks.json')
STRIPS = os.path.join(ROOT, 'public', 'art', 'studio', 'forge', 'layers')
PART = {'none': 0, 'torso': 1, 'armL': 2, 'armR': 3, 'head': 6, 'footL': 7, 'footR': 8, 'weapon': 9, 'drape': 10,
        'horse': 11, 'hair': 12}
NO_HANG = {PART['armL'], PART['armR'], PART['footL'], PART['footR'], PART['weapon']}
GAP = 0.03     # metres: an outer surface this near behind an inner one is the inner poking through it
TOUCH = 0.015  # metres: a weapon's surface this near the body's, inside its outline, passes through it
EDGE = 1       # texels: an outer layer's own edge is left out, where the render softens it
ARMOUR = re.compile(r'^(cuirass|greaves|gauntlets|boots|pauldrons|helm|under)_')
WEAPON = re.compile(r'^(sword|axe|mace|flail|warhammer|dagger|bow|crossbow|staff|sheath|scabbard|quiver)(_|$)')
SKIP = re.compile(r'^(horse|spark|lute|flute|recorder|tambourine|shield)(_|$)')


def meets(a, b):
    """forgeLayers.js `ordersMeet`, per texel."""
    out = (a == b) | (a == PART['none']) | (b == PART['none'])
    out |= (a == PART['drape']) & ~np.isin(b, list(NO_HANG))
    out |= (b == PART['drape']) & ~np.isin(a, list(NO_HANG))
    out &= (a != PART['horse']) & (b != PART['horse']) & (a != PART['weapon']) & (b != PART['weapon'])
    out |= ((a == PART['none']) | (b == PART['none'])) & (a != PART['horse']) & (b != PART['horse'])
    return out


class Strips:
    def __init__(self, looks, body, folder):
        self.own, self.folder, self.cache = looks['bodies'][body], os.path.join(folder, body), {}
        self.looks = looks
        self.scale = looks['depth']['scale']
        self.order = {k: round(v * self.scale) for k, v in looks.get('order', {}).items()}
        self.cover = {k: round(v * self.scale) for k, v in looks.get('cover', {}).items()}

    def cell(self, layer, anim):
        own = self.own.get('cells', {}).get(layer, {}).get(anim) or self.own['anims'][anim]
        return own['cell'], own['root']

    def strip(self, layer, anim):
        key = (layer, anim)
        if key not in self.cache:
            c = os.path.join(self.folder, f'{layer}_{anim}.png')
            z = os.path.join(self.folder, f'{layer}_{anim}_z.png')
            self.cache[key] = (np.asarray(Image.open(c).convert('RGBA')), np.asarray(Image.open(z).convert('RGBA')))\
                if os.path.exists(c) and os.path.exists(z) else None
        return self.cache[key]

    def frame(self, layer, anim, view, key, canvas, place):
        """A layer's frame on the canvas: alpha, depth (its units), part, colour."""
        got = self.strip(layer, anim)
        w, h = canvas
        alpha = np.zeros((h, w), bool)
        lies = np.zeros((h, w), np.int32)
        part = np.zeros((h, w), np.uint8)
        rgb = np.zeros((h, w, 3), np.uint8)
        if got is None:
            return alpha, lies, part, rgb
        colour, depth = got
        (cw, ch), (rx, ry) = self.cell(layer, anim)
        ox, oy = place[0] - rx, place[1] - ry
        c = colour[view * ch:(view + 1) * ch, key * cw:(key + 1) * cw]
        d = depth[view * ch:(view + 1) * ch, key * cw:(key + 1) * cw]
        if c.shape[:2] != (ch, cw):
            return alpha, lies, part, rgb
        ys, xs = slice(oy, oy + ch), slice(ox, ox + cw)
        alpha[ys, xs] = c[..., 3] > 0
        lies[ys, xs] = d[..., 0].astype(np.int32) * 256 + d[..., 1]
        part[ys, xs] = d[..., 2]
        rgb[ys, xs] = c[..., :3]
        return alpha, lies, part, rgb

    def canvas(self, layers, anim):
        left = top = right = low = 0
        for n in layers:
            (cw, ch), (rx, ry) = self.cell(n, anim)
            left, top, right, low = max(left, rx), max(top, ry), max(right, cw - rx), max(low, ch - ry)
        return (left + right, top + low), (left, top)


def outer_wins(s, inner, outer, fi, fo):
    """Where the outer layer's texel stands over the inner's as the composer weighs them (the outer drawn after)."""
    ai, li, pi, _ = fi
    ao, lo, po, _ = fo
    meet = meets(po, pi)
    mine = np.where(meet, s.order.get(outer, 0), 0)
    theirs = np.where(meet, s.order.get(inner, 0), 0)
    torso = (po == PART['torso']) & (pi == PART['torso'])
    bo, bi = s.order.get(outer, 0), s.order.get(inner, 0)
    if s.cover.get(outer) and bi < bo:
        mine = np.where(torso, s.cover[outer], mine)
    elif s.cover.get(inner) and bo < bi:
        theirs = np.where(torso, s.cover[inner], theirs)
    return (lo - mine) < (li - theirs)


def pairs_of(names, looks):
    """The pairs a look can wear together that should never cross: (inner, outer, kind). A class look's own gear
    (forgeLooks.json `looks`) is worn only in its class look, on the bare body, each piece over those of lower order;
    a dressed look wears the sets' armour, the wardrobe and hair, on any race's body."""
    classic = {g for lk in looks.get('looks', {}).values() for g in lk.get('gear', [])}
    order = looks.get('order', {})
    body = [n for n in names if n == 'body']
    beasts = [n for n in names if n.startswith('body_')]
    covers = [n for n in names if not n.startswith('body') and not WEAPON.match(n) and not SKIP.match(n)]
    weapons = [n for n in names if WEAPON.match(n)]
    dressed = [n for n in covers if n not in classic]
    armour = [n for n in dressed if ARMOUR.match(n)]
    hair = [n for n in dressed if n.startswith('hair_')]
    clothes = [n for n in dressed if n not in armour and n not in hair and not n.startswith('face')]
    hangs = [n for n in clothes if re.search(r'_(drape|plated|skirted|plated_skirted)$', n)]
    under = [n for n in clothes if n not in hangs]
    out = [(b, c, 'body') for b in body for c in covers]
    out += [(b, c, 'body') for b in beasts for c in dressed]
    out += [(b, w, 'weapon') for b in body + beasts for w in weapons]
    out += [(a, h, 'hang') for h in hangs if h.endswith(('_plated', '_plated_skirted')) for a in armour
            if not a.startswith(('helm_', 'gauntlets_', 'face_'))]
    out += [(u, a, 'armour') for a in armour if a.startswith(('cuirass_', 'greaves_')) for u in under]
    out += [(a, h, 'hair') for h in hair if '_plated' in h for a in armour if a.startswith(('cuirass_', 'pauldrons_'))]
    out += [(c, h, 'hair') for h in hair if '_cloaked' in h for c in hangs if 'cloak' in c]
    for lk in looks.get('looks', {}).values():   # a class look's own pieces, each over those of lower order
        gear = [g for g in lk.get('gear', []) if g in names and not WEAPON.match(g) and not SKIP.match(g)]
        out += [(a, b, 'class') for a in gear for b in gear if order.get(a, 0) < order.get(b, 0)]
    return list(dict.fromkeys(out))


def check(s, body, anims, worst_n):
    """Every pair, every view and frame of each animation: each frame's layers laid once on the animation's canvas."""
    rows, worst = {}, []
    for anim in anims:
        s.cache.clear()   # an animation's strips at a time
        names = [n for n, a in s.own['layers'].items() if anim in a and s.strip(n, anim) is not None]
        print(f'{body} {anim}: {len(names)} layers', flush=True)
        frames = s.own['anims'][anim]['frames']
        pairs = pairs_of(names, s.looks)
        canvas, place = s.canvas(names, anim)
        for view in range(5):
            for key in range(frames):
                got = {}
                lay = lambda n: got.setdefault(n, s.frame(n, anim, view, key, canvas, place))  # noqa: E731
                for inner, outer, kind in pairs:
                    fi, fo = lay(inner), lay(outer)
                    both = fi[0] & fo[0]
                    if not both.any():
                        continue
                    ys, xs = np.nonzero(both)
                    box = (slice(max(0, ys.min() - 3), ys.max() + 4), slice(max(0, xs.min() - 3), xs.max() + 4))
                    ci = tuple(a[box] for a in fi)
                    co = tuple(a[box] for a in fo)
                    gap = (co[1] - ci[1]) / s.scale   # metres the outer's surface lies behind the inner's
                    if kind == 'weapon':
                        bad = ci[0] & co[0] & ndimage.binary_erosion(ci[0], iterations=2) & (np.abs(gap) < TOUCH)
                    else:
                        lost = ~outer_wins(s, inner, outer, ci, co)
                        bad = ci[0] & co[0] & ndimage.binary_erosion(co[0], iterations=EDGE) & lost & (gap >= 0) & (gap < GAP)
                    n = int(bad.sum())
                    if not n:
                        continue
                    r = rows.setdefault((anim, inner, outer), {'body': body, 'anim': anim, 'inner': inner, 'outer': outer,
                                                               'kind': kind, 'texels': 0, 'peak': 0, 'frames': 0})
                    r['texels'] += n
                    r['frames'] += 1
                    r['peak'] = max(r['peak'], n)
                    worst.append((n, body, anim, view, key, inner, outer, kind))
        worst = sorted(worst, key=lambda r: -r[0])[:worst_n]
    worst.sort(key=lambda r: -r[0])
    return list(rows.values()), worst[:worst_n]


def sheet(s_of, worst, path, scale=3):
    """The worst frames: the pair as composed, the poking texels in magenta, each with its label."""
    from PIL import ImageDraw, ImageFont
    tiles = []
    for n, body, anim, view, key, inner, outer, kind in worst:
        s = s_of[body]
        canvas, place = s.canvas([inner, outer], anim)
        fi = s.frame(inner, anim, view, key, canvas, place)
        fo = s.frame(outer, anim, view, key, canvas, place)
        img = np.zeros((canvas[1], canvas[0], 3), np.uint8) + 58
        img[fi[0]] = fi[3][fi[0]]
        wins = outer_wins(s, inner, outer, fi, fo) | ~fi[0]
        show = fo[0] & wins
        img[show] = fo[3][show]
        gap = (fo[1] - fi[1]) / s.scale
        both = fi[0] & fo[0]
        if kind == 'weapon':
            bad = both & ndimage.binary_erosion(fi[0], iterations=2) & (np.abs(gap) < TOUCH)
        else:
            bad = both & ndimage.binary_erosion(fo[0], iterations=EDGE) & ~wins & (gap >= 0) & (gap < GAP)
        img[bad] = (255, 0, 255)
        tile = Image.fromarray(img).resize((canvas[0] * scale, canvas[1] * scale), Image.NEAREST)
        tiles.append((tile, f'{body} {anim} v{view} f{key}: {inner} through {outer} ({n})'))
    if not tiles:
        return
    cw = max(t.width for t, _ in tiles) + 8
    ch = max(t.height for t, _ in tiles) + 22
    cols = 5
    out = Image.new('RGB', (cw * cols, ch * ((len(tiles) + cols - 1) // cols)), (40, 42, 48))
    d = ImageDraw.Draw(out)
    font = ImageFont.load_default(size=12)
    for i, (t, label) in enumerate(tiles):
        x, y = (i % cols) * cw, (i // cols) * ch
        out.paste(t, (x + 4, y + 18))
        d.text((x + 4, y + 2), label[:70], fill=(250, 214, 130), font=font)
    out.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--body', default='male,female')
    ap.add_argument('--anims', default='')
    ap.add_argument('--strips', default=STRIPS)
    ap.add_argument('--json', default='')
    ap.add_argument('--sheet', default='')
    ap.add_argument('--worst', type=int, default=40)
    args = ap.parse_args()
    looks = json.load(open(LOOKS))
    rows, worst, s_of = [], [], {}
    for body in args.body.split(','):
        s = s_of[body] = Strips(looks, body, args.strips)
        anims = [a for a in (args.anims.split(',') if args.anims else s.own['anims']) if a in s.own['anims']]
        r, w = check(s, body, anims, args.worst)
        rows += r
        worst += w
    worst.sort(key=lambda r: -r[0])
    rows.sort(key=lambda r: -r['peak'])
    by_kind = {}
    for r in rows:
        k = by_kind.setdefault(r['kind'], [0, 0])
        k[0] += 1
        k[1] += r['texels']
    print('pairs that cross, by kind (pairs, texels):', by_kind)
    for r in rows[:25]:
        print(f"{r['body']:6} {r['anim']:12} {r['inner']:28} through {r['outer']:30} peak {r['peak']:4} frames {r['frames']}")
    if args.json:
        json.dump(rows, open(args.json, 'w'), indent=1)
    if args.sheet:
        sheet(s_of, worst[:args.worst], args.sheet)


if __name__ == '__main__':
    main()
