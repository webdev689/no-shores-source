"""The casting hands' light: each element's, drawn round the forged hand a record at a time, as Daggerfall's gathers -
strands reaching in from the edges of the sight, running down onto the hand, netting round it, drawn into a ball before
the fingers, and flung away. The light is the forge's own drawing, made from numbers here, never traced: only its
colours are Daggerfall's, each element's ramp read from its own casting archive's light (`<spec>-elements.json`), so
the brightest strand is that element's brightest.

Each strand lies in front of the hand or behind it; the hand (its fitted pose, as the fitter rasters it) cuts what lies
behind, so the layer drawn over the hand's layers shows the light wrapping round the fingers.

    python -I tools/sprite-forge/fpspell.py --spec tools/sprite-forge/specs/CAST.json --ref /tmp/ref-CAST.json --grade
    python -I tools/sprite-forge/fpspell.py --spec tools/sprite-forge/specs/CAST.json --out public/art/cast

The first reads the ramps from the reference (outside the repo); the second draws every element's frames from them."""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fparm  # noqa: E402
import fpforge  # noqa: E402
import fphand  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402

AT = (0.5, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99.5)   # the shares a ramp maps, as fpcolour's grade
BINS = 12   # a ramp's colours: the reference's light in this many steps of brightness
SUPER = 3   # each texel drawn from this many samples a side, so a strand's edge falls between texels as painted

# Each element's drawing: `kind` web (strands with a bright core and a dark rim) or flame (ragged tongues licking
# upward); `core` and `rim` the strand's half-width and its rim's, texels; `jag` how far a strand wanders; `twigs` short
# shoots a strand puts out, a ten texels of it; `net` the cells round the hand, texels across; `stars` sparkles a frame,
# `bright` whether they take the archive's spark colours (else its ramp's brightest); `rings` whether the light coils
# round the finger joints; `burst` the shape it leaves the hand in.
STYLE = {
    'fire': {'kind': 'flame', 'core': 3.6, 'rim': 2.4, 'jag': 0.12, 'twigs': 0.0, 'net': 30.0, 'stars': 0,
             'rings': False, 'burst': 'ball'},
    'frost': {'kind': 'web', 'core': 1.0, 'rim': 1.4, 'jag': 0.15, 'twigs': 0.9, 'net': 11.0, 'stars': 14,
              'bright': False,
              'rings': True, 'burst': 'shard'},
    'poison': {'kind': 'web', 'core': 1.5, 'rim': 1.3, 'jag': 0.12, 'twigs': 0.5, 'net': 10.0, 'stars': 0,
               'rings': True, 'burst': 'blob'},
    'shock': {'kind': 'web', 'core': 0.8, 'rim': 1.5, 'jag': 0.19, 'twigs': 1.2, 'net': 12.0, 'stars': 0,
              'rings': True, 'burst': 'flash'},
    'magic': {'kind': 'web', 'core': 0.9, 'rim': 1.2, 'jag': 0.16, 'twigs': 0.9, 'net': 11.0, 'stars': 26,
              'bright': True,
              'rings': True, 'burst': 'flare'},
}
ELEMENTS = tuple(STYLE)   # the game's order (src/combat/fpsSpellCasting.js ELEMENT_TYPES)
MIDDLE = 150.0   # the casting screen's middle (300 wide): where the right hand's mirrored light meets the left's

# Each record's light, as Daggerfall's cast runs: (how far along its strands the light has come, from where to where -
# a share of each strand's run; the net round the hand, its reach as a share of the hand's height, or 0; the ball before
# the fingers, its reach, or 0; the burst flung off, or not)
STAGES = (
    {'strands': None, 'net': 0.0, 'ball': 0.0, 'burst': False},
    {'strands': (0.0, 0.32), 'net': 0.0, 'ball': 0.0, 'burst': False},
    {'strands': (0.0, 1.0), 'net': 0.0, 'ball': 0.0, 'burst': False},
    {'strands': (0.45, 1.0), 'net': 0.6, 'ball': 0.0, 'burst': False},
    {'strands': (0.8, 1.0), 'net': 0.0, 'ball': 0.5, 'burst': False},
    {'strands': None, 'net': 0.0, 'ball': 0.22, 'burst': True},
)


# ---- the hand: where it is and what it covers ------------------------------------------------------------------------

def hand_of(r, S=None):
    """A record's hand as the fitter rasters it: (its cover on the screen, its depth there, the palm's middle, the
    fingertips', the hand's height on the screen in texels, the fingers' middle joints')."""
    S = S or fpmodel.shape_for(r)
    pose = {k: v for k, v in fpforge.FIT[f'{r}:0'].items() if k != 'hold'}
    v, t, _ = fpmodel.arrays('castarm', S, 'arm')[:3]
    k, c = S['hand'], S.get('cuff') or S['hand']
    rig = fparm._RIGS[(k, c, len(v))]
    vv = fpmodel.posed('castarm', 'arm', v, pose, S)
    M, _ = fpstage.pose_matrix(pose, S, fpmodel.length('castarm', S, 'arm'))
    P = vv @ M[:3, :3].T + M[:3, 3]
    u, w, d = fpstage.project(P, S)
    tri = fpstage.raster(u, w, d, t)
    cover = tri >= 0
    depth = np.where(cover, d[t[np.maximum(tri, 0)]].mean(axis=-1), np.inf)
    uv = np.stack([u, w], axis=1)
    palm = uv[rig['piece'] == fphand.PIECES.index('palm')].mean(axis=0)
    tips, pips = [], []
    for i in range(4):
        F = rig[f'f{i}']
        along = (v[F['on']] - F['mcp']) @ F['way']
        tips.append(uv[F['on']][int(np.argmax(along))])
        pips.append(uv[F['on']][int(np.argmin(np.abs(along - (F['pip'] - F['mcp']) @ F['way'])))])
    ys = np.nonzero(cover.any(axis=1))[0]
    return cover, depth, palm, np.array(tips), float(fpstage.H - ys.min()) if len(ys) else 80.0, np.array(pips)


# ---- the strands -----------------------------------------------------------------------------------------------------

def bolt(rng, a, b, jag, levels=6):
    """A wandering path from `a` to `b`: each run split at its middle, pushed aside by `jag` of the run's length."""
    pts = [np.asarray(a, float), np.asarray(b, float)]
    for lv in range(levels):
        out = [pts[0]]
        for p, q in zip(pts[:-1], pts[1:]):
            d = q - p
            n = np.array([-d[1], d[0]]) / (np.linalg.norm(d) + 1e-9)
            out += [(p + q) / 2 + n * rng.normal(0.0, jag) * np.linalg.norm(d), q]
        pts = out
    return np.array(pts)


def part(path, lo, hi):
    """The share `lo` to `hi` of a path's run."""
    seg = np.linalg.norm(np.diff(path, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)]) / max(seg.sum(), 1e-9)
    keep = (s >= lo) & (s <= hi)
    a, b = np.interp(lo, s, path[:, 0]), np.interp(lo, s, path[:, 1])
    c, d = np.interp(hi, s, path[:, 0]), np.interp(hi, s, path[:, 1])
    return np.vstack([[a, b], path[keep], [c, d]])


def branches(rng, path, jag, n):
    """Shorter strands forking off a path at random places, turned off its way."""
    out = []
    for _ in range(n):
        i = int(rng.integers(2, max(len(path) - 2, 3)))
        way = path[min(i + 1, len(path) - 1)] - path[i - 1]
        ang = math.atan2(way[1], way[0]) + rng.choice([-1, 1]) * rng.uniform(0.4, 1.1)
        length = rng.uniform(0.12, 0.3) * np.linalg.norm(path[-1] - path[0])
        end = path[i] + length * np.array([math.cos(ang), math.sin(ang)])
        out.append(bolt(rng, path[i], end, jag, levels=4))
    return out


def twigs(rng, path, per_ten, jag):
    """Short shoots off a strand, `per_ten` a ten texels of its run: each a few texels long, turned well off its way,
    as a painted bolt's crackle is."""
    seg = np.linalg.norm(np.diff(path, axis=0), axis=1)
    n = int(rng.poisson(per_ten * seg.sum() / 10.0))
    out = []
    for _ in range(n):
        i = int(rng.integers(1, max(len(path) - 1, 2)))
        way = path[min(i + 1, len(path) - 1)] - path[i - 1]
        ang = math.atan2(way[1], way[0]) + rng.choice([-1, 1]) * rng.uniform(0.7, 1.9)
        end = path[i] + rng.uniform(2.5, 7.0) * np.array([math.cos(ang), math.sin(ang)])
        out.append(bolt(rng, path[i], end, jag, levels=2))
    return out


def hand_net(rng, cover, reach, cell, jag):
    """A net of cells about `cell` texels across over the hand and out to `reach` texels round it, as light wrapped
    about the hand clings to it: (each edge, whether it lies over the hand)."""
    from scipy import ndimage as ndi
    from scipy.spatial import Voronoi
    near = ndi.distance_transform_edt(~cover) <= reach
    near[-3:] = False   # not along the sight's foot, where the arm runs off it
    ys, xs = np.nonzero(near)
    if len(xs) < 8:
        return []
    # thick round the outline, thin over the back of the hand: a third as many cells' points there
    weight = np.where(cover[ys, xs], 0.33, 1.0)
    count = max(int(weight.sum() / cell ** 2 * 1.6), 6)
    pick = rng.choice(len(xs), size=min(count, len(xs)), replace=False, p=weight / weight.sum())
    vor = Voronoi(np.stack([xs[pick] + rng.uniform(0, 1, len(pick)), ys[pick] + rng.uniform(0, 1, len(pick))], axis=1))
    def inside(p):
        return 0 <= p[0] < cover.shape[1] and 0 <= p[1] < cover.shape[0] and near[int(p[1]), int(p[0])]
    out = []
    for a, b in vor.ridge_vertices:
        if a < 0 or b < 0:
            continue
        p, q = vor.vertices[a], vor.vertices[b]
        if inside(p) and inside(q):
            m = (p + q) / 2
            out.append((bolt(rng, p, q, jag, levels=3), bool(cover[int(m[1]), int(m[0])])))
    return out


def ring(at, way, across, along, front):
    """The half of a ring of light round a finger at `at` (its way along the finger `way`) that passes before it
    (`front`) or behind: `across` texels out to either side, `along` up and down the finger."""
    d = way / (np.linalg.norm(way) + 1e-9)
    n = np.array([-d[1], d[0]])
    t = np.linspace(0.0, math.pi, 9) + (0.0 if front else math.pi)
    return at + np.outer(np.cos(t), n * across) + np.outer(np.sin(t), d * along)


def contour(cover, reach, below):
    """The hand's outline `reach` texels out, as runs of points, leaving out what lies below `below` (the arm running
    off the sight's foot)."""
    from scipy import ndimage as ndi
    from skimage.measure import find_contours
    grown = ndi.binary_dilation(cover, iterations=max(int(reach), 1))
    runs = []
    for c in find_contours(grown.astype(float), 0.5):
        pts = c[:, ::-1]
        keep = pts[:, 1] < below
        cut = np.nonzero(np.diff(keep.astype(int)))[0] + 1
        for seg in np.split(np.arange(len(pts)), cut):
            if len(seg) > 6 and keep[seg[0]]:
                runs.append(pts[seg])
    return runs


def net(rng, centre, reach, cell, jag):
    """A net of cells round `centre` out to `reach` texels, each cell about `cell` across: the edges of the cells of
    points scattered there, each edge wandering a little."""
    from scipy.spatial import Voronoi
    n = max(int((reach / cell) ** 2 * 3.2), 6)
    ang, rad = rng.uniform(0, 2 * math.pi, n), reach * np.sqrt(rng.uniform(0, 1, n)) * 1.25
    pts = centre + np.stack([np.cos(ang) * rad, np.sin(ang) * rad], axis=1)
    vor = Voronoi(pts)
    out = []
    for a, b in vor.ridge_vertices:
        if a < 0 or b < 0:
            continue
        p, q = vor.vertices[a], vor.vertices[b]
        if max(np.linalg.norm(p - centre), np.linalg.norm(q - centre)) > reach:
            continue
        out.append(bolt(rng, p, q, jag, levels=3))
    return out


# ---- drawing ---------------------------------------------------------------------------------------------------------

def _distance(h, w, path, pad):
    """Each sample's distance from a path, texels, within `pad` of it (inf further)."""
    dist = np.full((h, w), np.inf)
    for p, q in zip(path[:-1], path[1:]):
        x0, x1 = int(max(min(p[0], q[0]) - pad, 0)), int(min(max(p[0], q[0]) + pad + 1, w))
        y0, y1 = int(max(min(p[1], q[1]) - pad, 0)), int(min(max(p[1], q[1]) + pad + 1, h))
        if x0 >= x1 or y0 >= y1:
            continue
        ys, xs = np.mgrid[y0:y1, x0:x1] + 0.5
        d = q - p
        t = np.clip(((xs - p[0]) * d[0] + (ys - p[1]) * d[1]) / max(d @ d, 1e-9), 0.0, 1.0)
        dd = np.hypot(xs - (p[0] + t * d[0]), ys - (p[1] + t * d[1]))
        dist[y0:y1, x0:x1] = np.minimum(dist[y0:y1, x0:x1], dd)
    return dist


def _noise(h, w, scale, seed, octaves=3, tall=1.0):
    """Smooth noise, -1 to 1, its features about `scale` samples across and `tall` times that high."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        s = scale / 2 ** o
        gh, gw = int(h / (s * tall)) + 3, int(w / s) + 3
        g = rng.uniform(-1, 1, (gh, gw))
        ys, xs = np.mgrid[0:h, 0:w] / s
        ys = ys / tall
        y0, x0 = ys.astype(int), xs.astype(int)
        fy, fx = ys - y0, xs - x0
        fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
        top = g[y0, x0] * (1 - fx) + g[y0, x0 + 1] * fx
        bot = g[y0 + 1, x0] * (1 - fx) + g[y0 + 1, x0 + 1] * fx
        out += amp * (top * (1 - fy) + bot * fy)
        total += amp
        amp *= 0.5
    return out / total


def strand_light(dist, style):
    """A web strand's light by its distance, in three tones as a painted one's: white-hot on its line, its own colour
    to its edge, then a dark rim round it."""
    core, rim = style['core'], style['rim']
    hot = max(0.45 * core, 0.6)   # never thinner than a texel's breadth, so a thin strand still shows its hot line
    lit = np.where(dist <= core, np.where(dist <= hot, 1.0, 0.72 - 0.12 * (dist / core)), 0.0)
    return np.where((dist > core) & (dist <= core + rim), 0.3 - 0.12 * (dist - core) / rim, lit)


def flame_light(dist, style, h, w, seed):
    """A flame's light along a path: a broad, ragged sheet, white-hot along its line, its tongues licking upward
    from it - tall, narrow and each its own height."""
    half = (style['core'] + style['rim']) * SUPER
    near = np.minimum(dist, 1e4)
    ragged = _noise(h, w, 6.0 * SUPER, seed)
    tongues = np.clip(_noise(h, w, 3.0 * SUPER, seed + 1, tall=3.5), 0.0, 1.0)
    above = np.clip(-np.gradient(near, axis=0), 0.0, 1.0)   # 1 where the line lies below, so a tongue rises from it
    f = 1.0 - near / half + 0.55 * ragged + 2.2 * above * tongues * np.clip(1.0 - near / (3.5 * half), 0.0, 1.0)
    return np.where(f > 0, 0.15 + 0.85 * np.clip(f, 0.0, 1.0) ** 0.8, 0.0)


def star(h, w, at, size):
    """A sparkle: a bright point with four rays `size` texels long, each a texel wide (samples are SUPER a texel), on
    the texel grid so its rays stay crisp."""
    out = np.zeros((h, w))
    cx, cy = int(at[0] // SUPER), int(at[1] // SUPER)
    for k in range(-size, size + 1):
        for tx, ty in ((cx + k, cy), (cx, cy + k)):
            if 0 <= tx < w // SUPER and 0 <= ty < h // SUPER:
                v = 1.0 - 0.45 * abs(k) / max(size, 1)
                blk = out[ty * SUPER:(ty + 1) * SUPER, tx * SUPER:(tx + 1) * SUPER]
                np.maximum(blk, v, out=blk)
    return out


def burst_light(h, w, at, radius, shape, seed):
    """What leaves the hand: a ball of the element's light `radius` texels across at `at`, in its element's shape."""
    ys, xs = np.mgrid[0:h, 0:w] + 0.5
    dx, dy = xs - at[0], ys - at[1]
    r = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    n = _noise(h, w, radius * 0.6, seed)
    if shape == 'shard':   # an ice crystal: a star of long facets
        edge = radius * (0.45 + 0.55 * np.abs(np.cos(ang * 3.0 + 0.4)) ** 3)
        facet = 0.55 + 0.45 * np.cos(ang * 6.0 + 0.4)
        return np.where(r < edge, 0.35 + 0.6 * facet * (1.0 - r / np.maximum(edge, 1e-6)), 0.0)
    if shape == 'flare':   # a star of light: a hot core and long thin rays
        rays = np.abs(np.cos(ang * 4.0)) ** 24 + 0.6 * np.abs(np.cos(ang * 4.0 + math.pi / 4)) ** 24
        edge = radius * (0.4 + 1.1 * rays)
        return np.where(r < edge, np.clip(1.0 - r / np.maximum(edge, 1e-6), 0.0, 1.0) ** 0.7, 0.0)
    if shape == 'flash':   # a lightning ball: a white core, its rim crackling
        edge = radius * (0.8 + 0.35 * n)
        return np.where(r < edge, np.clip(1.15 - r / np.maximum(edge, 1e-6), 0.0, 1.0) ** 0.6, 0.0)
    if shape == 'blob':   # a bubbling cloud: bright in the middle, its bubbles' rims darker, each its own size
        edge = radius * (0.85 + 0.3 * n)
        bubbles = np.abs(_noise(h, w, radius * 0.35, seed + 1, octaves=2))
        rim = np.clip(1.0 - bubbles * 4.0, 0.0, 1.0)   # dark where the noise crosses its middle: between bubbles
        inner = np.clip(1.05 - r / np.maximum(edge, 1e-6), 0.0, 1.0)
        return np.where(r < edge, 0.25 + 0.75 * inner ** 0.7 * (1.0 - 0.55 * rim), 0.0)
    edge = radius * (0.9 + 0.35 * n)   # a ball of fire
    return np.where(r < edge, 0.25 + 0.75 * np.clip(1.0 - r / np.maximum(edge, 1e-6), 0.0, 1.0) ** 0.6, 0.0)


def _within(img, at, edge):
    """A ball's light drawn back left, its middle `at` with it, so it ends before screen texel `edge`: a canvas's
    edge never cuts it flat."""
    cols = np.nonzero(img.any(axis=0))[0]
    over = int(cols.max()) + 1 - int(edge * SUPER) if cols.size else 0
    if over <= 0:
        return img, at
    return np.pad(img[:, over:], ((0, 0), (0, over))), at - np.array([over / SUPER, 0.0])


def frame_light(r, element, seed=7, sparks=0, right=fpstage.W):
    """A record's light for one element on the whole screen: its brightness 0-1 where drawn, 0 elsewhere, and 2 + k
    where a star is drawn in the element's `k`th spark colour (of `sparks`; the others in its ramp). One seed for every
    record of an element, so its strands are the same strands frame to frame. A ball stays left of `right`, the
    canvas's edge."""
    style, stage = STYLE[element], STAGES[r]
    cover, depth, palm, tips, tall, pips = hand_of(r)
    h, w = fpstage.H * SUPER, fpstage.W * SUPER
    rng = np.random.default_rng(seed + ELEMENTS.index(element))
    pad = (style['core'] + style['rim']) * SUPER * (3.0 if style['kind'] == 'flame' else 1.0) + 2
    front, back = np.zeros((h, w)), np.zeros((h, w))
    spark = np.zeros((h, w), np.int16)   # a star's spark colour, 1 + its index; 0 none

    def lay(path, in_front, scale=1.0, hot=False):
        d = _distance(h, w, path * SUPER, pad) / max(scale, 1e-6)
        if hot:   # a thread of the light at its hottest, with no rim, in the archive's first spark colour if it has one
            lit = np.where(d / SUPER <= 0.75, 1.0, 0.0)
            if sparks and in_front:
                spark[lit > 0] = 1
        elif style['kind'] == 'flame':
            lit = flame_light(d, style, h, w, int(rng.integers(1, 1 << 30)))
        else:
            lit = strand_light(d / SUPER, style)
        tgt = front if in_front else back
        np.maximum(tgt, lit, out=tgt)

    # the strands: from the sight's top and its near edge, each to a fingertip or the palm - the same for every record
    starts = [(rng.uniform(0.15, 0.45) * fpstage.W * 0.5, -6.0) for _ in range(2)]
    starts += [(-6.0, rng.uniform(0.3, 0.7) * fpstage.H) for _ in range(2)]
    starts += [(rng.uniform(0.0, 0.25) * fpstage.W * 0.5, fpstage.H + 4.0)]
    goals = list(tips) + [palm]
    paths = []
    for i, a in enumerate(starts):
        b = goals[i % len(goals)]
        path = bolt(rng, a, b, style['jag'])
        forks = branches(rng, path, style['jag'], 1)
        shoots = [t for p in [path] + forks for t in twigs(rng, p, style['twigs'], style['jag'])]
        paths.append((path, forks, shoots, bool(rng.uniform() < 0.35)))
    run = lambda path, p: np.linalg.norm(p - path[0]) / max(np.linalg.norm(path[-1] - path[0]), 1e-6)  # noqa: E731
    if stage['strands']:
        lo, hi = stage['strands']
        if style['kind'] == 'flame' and stage['net']:
            lo = max(lo, 0.75)   # fire burns down its strands to the hand it wreathes
        for path, forks, shoots, in_front in paths:
            lay(part(path, lo, hi), in_front)
            # a fork or a shoot shows once the strand has come past where it leaves it
            for f, thin in [(f, 1.0) for f in forks] + [(t, 0.7) for t in shoots]:
                if lo <= run(path, f[0]) <= hi:
                    lay(f, in_front, thin)
    reach = tips.mean(axis=0)   # where the fingers reach: the light gathers before them, not at the heel of the hand
    if stage['net'] and style['kind'] == 'flame':
        # fire wraps the hand as a corona along its outline, behind it, so the glove shows black against the flame
        for c in contour(cover, 3.0, fpstage.H - 3):
            for seg in np.array_split(c, max(len(c) // 14, 1)):
                if len(seg) > 2:
                    lay(seg, False, rng.uniform(0.9, 1.9))   # each stretch its own height: flames, not a halo
    elif stage['net']:
        # webs cling to it: a net of small cells over the hand and round it, a share of it before the hand
        for i, (edge, over) in enumerate(hand_net(rng, cover, stage['net'] * tall * 0.45, style['net'], style['jag'])):
            lay(edge, over and i % 5 < 2)
    if style['rings'] and r in (2, 3, 4):
        # the light coils round each finger's middle joint, before it and behind it
        for pip, tip in zip(pips, tips):
            for before in (True, False):
                lay(ring(pip, tip - pip, 2.4, 0.9, before), before, 1.0, hot=True)
    ball_at = reach + np.array([0.32 * tall, 0.12 * tall])
    if stage['ball'] and style['kind'] == 'flame':
        # fire gathers into a fireball behind the fingers, so the glove shows against it
        size = stage['ball'] * tall * 0.95
        ball = burst_light(h, w, ball_at * SUPER, size * SUPER, style['burst'], int(rng.integers(1, 1 << 30)))
        ball, ball_at = _within(ball, ball_at, right - 1.0)
        np.maximum(back, ball, out=back)
    elif stage['ball']:
        # the ball gathers beside the fingers, the hand's own net still clinging to it; most of it behind the fingers,
        # so they show against it
        for i, (edge, over) in enumerate(hand_net(rng, cover, 0.12 * tall, style['net'], style['jag'])):
            lay(edge, over and i % 4 == 0)
        reach_ = stage['ball'] * tall * 0.7
        ball_at = np.array([min(ball_at[0], right - 3.0 - reach_ - style['rim']), ball_at[1]])   # whole in its canvas
        for i, edge in enumerate(net(rng, ball_at, reach_, style['net'] * 0.45, style['jag'])):
            lay(edge, i % 5 == 0)
        for k, tip in enumerate(tips[1:]):
            lay(bolt(rng, tip, ball_at, style['jag'] * 0.6, levels=4), k == 0)
    if stage['burst']:
        # whole within the hand's own canvas and touching the middle: two hands' meet there as one bolt, and a lone
        # spell hand's is a whole ball, never one cut in half
        size = stage['ball'] * tall * 1.6
        at = np.array([MIDDLE - 0.9 * size, reach[1] + 0.05 * tall])
        burst = burst_light(h, w, at * SUPER, size * SUPER, style['burst'], int(rng.integers(1, 1 << 30)))
        burst, at = _within(burst, at, min(MIDDLE, right) - 1.0)
        np.maximum(front, burst, out=front)
        for tip in tips[1:]:
            lay(part(bolt(rng, tip, at, style['jag'] * 0.6, levels=4), 0.25, 0.8), True)
    for _ in range(style['stars'] if (stage['strands'] or stage['net'] or stage['ball']) else 0):
        anchor = (palm + reach) / 2 + rng.normal(0.0, 0.4 * tall, 2) if r >= 3 else np.array(
            [rng.uniform(0, fpstage.W * 0.45), rng.uniform(0, fpstage.H)])
        s = star(h, w, anchor * SUPER, int(rng.choice([1, 2, 2, 3])))
        k = int(rng.integers(0, sparks + 1))   # the last choice is the ramp's own brightest
        if k < sparks and style.get('bright'):
            spark[s > 0] = k + 1
        np.maximum(front, s, out=front)
    # what lies behind the hand is cut where the hand is drawn
    cut = np.kron(cover, np.ones((SUPER, SUPER), bool))
    lit = np.maximum(front, np.where(cut, 0.0, back))
    # each texel the mean of its samples, drawn where most of them are lit; a star's colour where most are its
    lit = lit.reshape(fpstage.H, SUPER, fpstage.W, SUPER)
    on = (lit > 0).mean(axis=(1, 3)) >= 0.4
    val = lit.sum(axis=(1, 3)) / np.maximum((lit > 0).sum(axis=(1, 3)), 1)
    sp = spark.reshape(fpstage.H, SUPER, fpstage.W, SUPER)
    star_at = (sp > 0).mean(axis=(1, 3)) >= 0.4
    out = np.where(on, val, 0.0)
    return np.where(on & star_at, 1.0 + sp.max(axis=(1, 3)), out)


# ---- the ramps -------------------------------------------------------------------------------------------------------

def fit_ramps(spec, ref):
    """Each element's ramp from its archive's light: its brightness at the shares AT, and its colour in BINS steps of
    brightness."""
    out = {}
    for name, records in ref['elements'].items():
        px = []
        for rec in records:
            on = np.array([c == '1' for c in rec['light']])
            rgb = np.frombuffer(bytes.fromhex(rec['rgb']), np.uint8).reshape(-1, 3).astype(np.float64)
            px.append(rgb[on])
        px = np.concatenate(px)
        lum = px.mean(axis=1)
        order = np.argsort(lum)
        bins = np.array_split(order, BINS)
        out[name] = {'lum': np.percentile(lum, AT).round(1).tolist(),
                     'at': [round(float(lum[b].mean()), 1) for b in bins],
                     'rgb': [px[b].mean(axis=0).round(1).tolist() for b in bins]}
        out[name]['sparks'] = sparks_of(px, lum, out[name])
        print(f'{name}: {len(px)} texels, brightness {np.percentile(lum, (10, 50, 90)).round()}, '
              f'{len(out[name]["sparks"])} spark colours')
    return out


def sparks_of(px, lum, ramp, k=3):
    """The colours an archive's light draws its sparks in: its bright texels far from the ramp's colour at their own
    brightness (a magic star's yellow among its greens), in up to `k` colours, each a share of them."""
    rgb = np.asarray(ramp['rgb'], np.float64)
    want = np.stack([np.interp(lum, ramp['at'], rgb[:, c]) for c in range(3)], axis=1)
    odd = px[(np.linalg.norm(px - want, axis=1) > 70.0) & (lum > np.percentile(lum, 50))]
    if len(odd) < 20:
        return []
    centres = odd[np.linspace(0, len(odd) - 1, k).astype(int)]
    for _ in range(12):   # k-means, a few rounds
        near = np.argmin(((odd[:, None] - centres[None]) ** 2).sum(-1), axis=1)
        centres = np.array([odd[near == i].mean(axis=0) if (near == i).any() else centres[i] for i in range(k)])
    share = np.bincount(near, minlength=k) / len(odd)
    return [c.round(1).tolist() for c, s in zip(centres, share) if s >= 0.1]


def colour(light, ramp, ours):
    """Brightness 0-1 onto the element's: share for share against `ours` (every drawn texel of the element's frames),
    then the colour its archive draws at that brightness. RGBA, clear where nothing is drawn."""
    on = light > 0
    out = np.zeros(light.shape + (4,), np.uint8)
    if not on.any():
        return out
    src = np.maximum.accumulate(np.percentile(ours, AT)) + np.arange(len(AT)) * 1e-6
    want = np.interp(np.minimum(light[on], 1.0), src, ramp['lum'])
    rgb = np.asarray(ramp['rgb'], np.float64)
    px = np.clip(np.round(np.stack([np.interp(want, ramp['at'], rgb[:, c]) for c in range(3)], axis=1)), 0, 255)
    star = light[on] >= 2.0   # a star in one of the archive's spark colours
    if star.any() and ramp.get('sparks'):
        which = np.clip(light[on][star].astype(int) - 2, 0, len(ramp['sparks']) - 1)
        px[star] = np.asarray(ramp['sparks'], np.float64)[which]
    grey = (px[:, 0] == px[:, 1]) & (px[:, 1] == px[:, 2])   # the game reads a grey texel as metal: light never is
    px[grey, 2] = np.where(px[grey, 2] < 255, px[grey, 2] + 1, 254)
    out[on, :3] = px.astype(np.uint8)
    out[on, 3] = 255
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--ref', help='with --grade: the reference the ramps are read from')
    ap.add_argument('--grade', action='store_true', help='read each element\'s ramp from the reference')
    ap.add_argument('--out', help='draw every element\'s frames into this folder')
    ap.add_argument('--elements', default='', help='only these (comma-separated)')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    spec = fpforge.load(args.spec)
    table = args.spec[:-len('.json')] + '-elements.json'
    if args.grade:
        with open(table, 'w') as fh:
            fh.write(json.dumps(fit_ramps(spec, json.load(open(args.ref))), indent=1) + '\n')
        return
    import stage
    ramps = json.load(open(table))
    only = [e for e in args.elements.split(',') if e] or list(ELEMENTS)
    for element in only:
        sparks = len(ramps[element].get('sparks', []))
        frames = [frame_light(r, element, sparks=sparks, right=sum(fpforge.rect(rec)[::2]))
                  for r, rec in enumerate(spec['records'])]
        ours = np.concatenate([f[(f > 0) & (f <= 1.0)] for f in frames])
        os.makedirs(os.path.join(args.out, element), exist_ok=True)
        for r, (rec, light) in enumerate(zip(spec['records'], frames)):
            pic = fpstage.crop(colour(light, ramps[element], ours), fpforge.rect(rec))
            stage.write_png(os.path.join(args.out, element, f"{rec['series']['name']}.png"), pic)
        print(f'{element}: {len(frames)} frames', flush=True)


if __name__ == '__main__':
    main()
