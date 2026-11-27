"""Cloth that hangs free of the body - a skirt, a robe below the belt, a cloak - made again each frame from the body as
posed. At each station down the cloth it is laid round the outline of everything it hangs over there: the convex hull of
the posed body's points in that slice (and of whatever it is worn over, armour too), pushed out by its ease. So a
stepping knee pushes a robe forward, a trailing leg pushes a cloak back, and the cloth never cuts into what it covers.
Down the cloth the outline never narrows faster than cloth hangs, so a skirt drapes over a knee and down from it; its
folds only ever stand out from that line. The middle it is laid round is smoothed down it, never jumping from one
station to the next, and a cloak's is held below the shoulder blades, where it hangs straight. What it must clear is
each slice's hull widened over its neighbours and smoothed, so it spans the body's hollows and never bands across.

A skirt hangs round the legs from a height on the body; a cloak hangs behind the body from the shoulders, round the back
from one side to the other. Each hangs down the world when the body stands and along the body when it lies. Each is one
grid of rows and columns, two-faced: its cloth outside, its lining inside, its edges closed."""
import math
import os

import numpy as np

from clothkit import ripple

TAU = 2 * math.pi


def _unit(v):
    v = np.asarray(v, float)
    return v / max(np.linalg.norm(v), 1e-12)


def _shift(a, s, axis, mode):
    """`a` moved `s` along `axis`: its ends wrapped round ('wrap') or repeated."""
    if mode == 'wrap':
        return np.roll(a, s, axis=axis)
    return np.take(a, np.clip(np.arange(a.shape[axis]) - s, 0, a.shape[axis] - 1), axis=axis)


def blur(a, passes, axis=0, mode='edge'):
    """`a` smoothed along `axis`, a quarter of each neighbour a pass: 'hold' keeps its first and last as they are,
    'wrap' smooths round a closed drape, 'edge' smooths its ends against themselves."""
    a = np.array(a, float)
    for _ in range(passes):
        b = 0.25 * _shift(a, 1, axis, mode) + 0.5 * a + 0.25 * _shift(a, -1, axis, mode)
        if mode == 'hold':
            ends = [0, a.shape[axis] - 1]
            np.put_along_axis(b, np.array(ends).reshape([-1 if i == axis else 1 for i in range(a.ndim)]),
                              np.take(a, ends, axis=axis), axis=axis)
        a = b
    return a


def clearance(hull, reach=3, across='edge', down=None):
    """The least a drape lies out from its middle, rows by columns, to clear what it covers: `hull` widened `reach`
    columns round and `down` rows (`reach` unless given) and smoothed within that widening, so it spans a body's
    hollows and bumps as cloth does and never dips below any point it widened over. `across` is how its columns end
    ('wrap' round a closed drape)."""
    down = reach if down is None else down
    c = np.array(hull, float)
    for k in range(max(reach, down)):
        if k < down:
            c = np.maximum.reduce([_shift(c, 1, 0, 'edge'), c, _shift(c, -1, 0, 'edge')])
        if k < reach:
            c = np.maximum.reduce([_shift(c, 1, 1, across), c, _shift(c, -1, 1, across)])
    return blur(blur(c, down, 0), reach, 1, across)


def hull_reach(pts2, centre, th):
    """How far from `centre` along each direction `th` a point must lie to be outside the convex hull of 2D points
    `pts2`: where the ray leaves the hull, or 0 where it never meets it (a centre may lie outside the hull)."""
    from scipy.spatial import ConvexHull
    try:
        poly = pts2[ConvexHull(pts2).vertices]
    except Exception:   # a slice too thin to span an area
        return np.zeros(len(th))
    a, e = poly, np.roll(poly, -1, axis=0) - poly
    d = np.stack([np.cos(th), np.sin(th)], axis=1)
    rel = a - centre
    den = d[:, None, 0] * (-e[None, :, 1]) - d[:, None, 1] * (-e[None, :, 0])
    with np.errstate(divide='ignore', invalid='ignore'):
        t = (rel[None, :, 0] * (-e[None, :, 1]) - rel[None, :, 1] * (-e[None, :, 0])) / den
        s = (d[:, None, 0] * rel[None, :, 1] - d[:, None, 1] * rel[None, :, 0]) / den
    t = np.where((s >= -1e-6) & (s <= 1 + 1e-6) & np.isfinite(t), t, -np.inf)
    return np.maximum(t.max(axis=1), 0.0)


def sector_reach(pts2, centre, th, half=0.2):
    """How far from `centre` the 2D points `pts2` reach in each direction `th`: the farthest within `half` radians of
    it, or 0 where none is."""
    rel = pts2 - centre
    ang, rho = np.arctan2(rel[:, 1], rel[:, 0]), np.hypot(rel[:, 0], rel[:, 1])
    off = np.abs((ang[None, :] - th[:, None] + math.pi) % TAU - math.pi)
    return np.where(off < half, rho[None, :], 0.0).max(axis=1)


class Frame:
    """The way a drape hangs this frame: `down` the way it falls, `up` against it, and two axes across it (`x` the
    body's right to left, `y` its front to back), from the joints' world matrices."""

    def __init__(self, W):
        pelvis, chest = np.array(W['pelvis']), np.array(W['chest'])
        body_up = _unit(chest[:3, 3] - pelvis[:3, 3])
        world_up = np.array([0.0, 0.0, 1.0])
        stand = np.clip((body_up @ world_up - 0.35) / 0.4, 0.0, 1.0)   # upright: cloth falls down the world
        self.stand = float(stand)   # 1 standing, 0 lying: lying, cloth settles on the legs and the ground
        self.up = _unit(stand * world_up + (1 - stand) * body_up)
        back = chest[:3, :3] @ np.array([0.0, 1.0, 0.0])   # the chest's back, its rest +Y
        self.y = _unit(back - self.up * (back @ self.up))
        self.x = np.cross(self.y, self.up)

    def to2(self, p, origin):
        q = p - origin
        return np.stack([q @ self.x, q @ self.y], axis=1), q @ self.up


REST_SIZE = (1.2, 1.0)   # metres round a drape and down it its rest position is laid over: about a skirt's or a cloak's


class Drape:
    """A drape's grid, its object and its materials. `rows` stations from its top to its hem, `cols` directions round
    it, `span` the directions it covers (radians round from the body's right through its back; a full turn closes it),
    `make(W, fighter)` its outer surface this frame (rows, cols, 3) and the way out at each point."""
    reads_hands = False   # whether it hangs clear of the hands as they show, a fist or open (`arm_points`)

    def __init__(self, name, mats, rows, cols, closed, thick=0.003, slots=(0, 5), border=(0, 0, 0), size=REST_SIZE, gaps=()):
        """`border` (top rows, foot rows, edge columns) drawn in the hem's cloth (slot 1): a cloak's turned edges.
        `size` (metres round it, metres down it) is the span its rest position, which patterns read, is laid over.
        `gaps`: the columns the cloth leaves open after them, between a loincloth's panels."""
        import bpy
        self.name, self.rows, self.cols, self.closed, self.thick = name, rows, cols, closed, thick
        top_b, foot_b, edge_b = border
        banded = lambda r, k: r < top_b or r >= rows - 1 - foot_b or (not closed and (k < edge_b or k >= cols - 1 - edge_b))   # noqa: E731
        n = rows * cols
        cw = [k for k in range(cols if closed else cols - 1) if k not in gaps]
        at = lambda r, k: r * cols + (k % cols)   # noqa: E731
        faces, mat = [], []
        for r in range(rows - 1):
            for k in cw:
                a, b, c, d = at(r, k), at(r, k + 1), at(r + 1, k + 1), at(r + 1, k)
                faces.append((a, d, c, b)); mat.append(1 if banded(r, k) else slots[0])   # the cloth, outside
                faces.append((a + n, b + n, c + n, d + n)); mat.append(slots[1])   # its lining
        for r in (0, rows - 1):
            for k in cw:
                a, b = at(r, k), at(r, k + 1)
                faces.append((a, b, b + n, a + n) if r == 0 else (a, a + n, b + n, b)); mat.append(slots[0])
        if not closed:   # each edge closed where the cloth starts or ends round: its two ends, either side of a gap
            on = set(cw)
            edges = [(k, True) for k in range(cols) if k in on and k - 1 not in on]
            edges += [(k, False) for k in range(cols) if k - 1 in on and k not in on]
            for k, left in edges:
                for r in range(rows - 1):
                    a, b = at(r, k), at(r + 1, k)
                    faces.append((a, a + n, b + n, b) if left else (a, b, b + n, a + n)); mat.append(slots[0])
        self.faces = faces
        me = bpy.data.meshes.new(name)
        me.from_pydata(np.zeros((2 * n, 3)).tolist(), [], faces)
        for m in mats:
            me.materials.append(m)
        me.polygons.foreach_set('material_index', mat)
        me.polygons.foreach_set('use_smooth', [True] * len(faces))
        me.update()
        self.me = me
        self.ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(self.ob)
        rest = me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')   # the patterns read it: here, the grid's own
        uv = np.zeros((2 * n, 3), np.float32)
        rr, kk = np.divmod(np.arange(n), cols)
        uv[:n, 0], uv[:n, 2] = kk / cols * size[0], -rr / rows * size[1]   # metres round it and down it, as a shell's
        uv[n:] = uv[:n]
        rest.data.foreach_set('vector', uv.ravel())
        self.verts = np.zeros((2 * n, 3))

    def set(self, outer, out):
        """Lay the drape's outer surface `outer` (rows, cols, 3) and its lining `thick` in along `out`."""
        o = outer.reshape(-1, 3)
        inner = o - out.reshape(-1, 3) * self.thick
        self.verts = np.concatenate([o, inner])
        self.me.vertices.foreach_set('co', self.verts.ravel())
        self.me.update()

    def triangles(self):
        """The drape's triangles as they stand: (vertices, triangles, slot a triangle) for the fitter's raster."""
        t, s = [], []
        mats = list(self.me.polygons)
        for face, poly in zip(self.faces, mats):
            for j in range(1, len(face) - 1):
                t.append((face[0], face[j], face[j + 1]))
                s.append(poly.material_index)
        return self.verts, np.array(t), np.array(s)


ARM, LEG = (1, 2), (3, 4)   # anatomy.PIECES' arms and legs
FEET_Z = 0.22   # at rest, the top of a shoe: only a skirt's stations below it hang clear of the feet


def named(sk, names):
    """Whether skin `sk` is one of `names`: by its name whole (an envelope's copy, `<garment>_under.001`) or by its
    name before Blender's copy number (`body` for a second fighter's `body.002`)."""
    return names is None or sk.ob.name in names or sk.ob.name.split('.')[0] in names


def arm_points(fighter, side, names=None, rigid=()):
    """The posed points of one arm alone (the vertices of its skins, those named or every one, that are mostly that
    arm's), and of the rigid parts named `rigid` that the forearm and the hand carry (a gauntlet)."""
    from body import coords
    k = 1 if side == 'L' else 2
    pts = []
    for ob in getattr(fighter, 'hands', {}).get(side, {}).values():   # the hand as it shows, a fist or open
        if not ob.hide_render:
            M = np.array(ob.matrix_world)
            pts.append(coords(ob.data) @ M[:3, :3].T + M[:3, 3])
    for ob, joint in fighter.parts:
        if rigid and joint in (f'farm_{side}', f'hand_{side}') and ob.name.startswith(tuple(rigid)) and not ob.hide_render:
            M = np.array(ob.matrix_world)
            pts.append(coords(ob.data) @ M[:3, :3].T + M[:3, 3])
    for sk in fighter.skins:
        if not named(sk, names):
            continue
        co = coords(sk.me)
        if sk.alpha is not None and len(sk.alpha) == len(co):
            pts.append(co[sk.alpha[:, k] > 0.5])
    return np.concatenate(pts) if pts else np.zeros((0, 3))


def posed_points(fighter, names=None, rigid=(), feet=True, below=None, legs=True):
    """The posed points a skirt hangs over: the body's skins (those named, or every one) without the arms (the hands
    swing outside it) and the rigid parts whose names start with `rigid`, all in the world as they stand. `below`:
    only what lies below that height at rest (a skirt hangs over the hips and the legs, never over a torso leaning
    out over it). Without `legs`, the hips alone: what a waistband closes round."""
    from body import coords
    pts = []
    for sk in fighter.skins:
        if not named(sk, names):
            continue
        co = coords(sk.me)
        if sk.alpha is not None and len(sk.alpha) == len(co):
            keep = ~(sk.alpha[:, list(ARM)].sum(axis=1) > 0.5)
            if not feet:
                keep &= ~(sk.alpha[:, [6, 7]].sum(axis=1) > 0.5)
            if not legs:
                keep &= ~(sk.alpha[:, list(LEG)].sum(axis=1) > 0.5)
            if below is not None:
                keep &= sk.rest[:, 2] < below
            co = co[keep]
        pts.append(co)
    # the armour it hangs over: the body's own, never what the arms carry; under a skirt never the chest's
    carried = ('pelvis', 'spine', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'foot_L', 'foot_R')
    if below is None:
        carried += ('chest',)
    for ob, joint in fighter.parts:
        if joint not in carried:
            continue
        if rigid and ob.name.startswith(tuple(rigid)):   # drawn or not: an envelope's armour is never drawn
            M = np.array(ob.matrix_world)
            co = coords(ob.data)
            pts.append(co @ M[:3, :3].T + M[:3, 3])
    return np.concatenate(pts) if pts else np.zeros((0, 3))


def _folds(th, count, phase, depth, seed=0.0):
    """Folds round a drape: broad ridges and sharper valleys, never two alike, as a share of its radius (never below
    its line: they only stand out)."""
    w = 0.6 * np.sin(th * count + phase) + 0.3 * np.sin(th * (count * 0.53) + 1.7 + seed) + 0.25 * np.sin(th * 2.3 + seed * 3)
    return depth * (0.5 + 0.5 * np.tanh(1.6 * w))


# how far below what it lies on a skirt may hang free of it, as from a knee in a stride: under a leg thrown up into
# the air the cloth is spent there, and runs from that foot to the next as Daggerfall's robes do, never a curtain
HANG = 0.04
# the moves a short skirt rides up in (layers.py sets them: the body's own that spread the legs, agility.py). There a
# skirt whose hem stands above the knee (`RIDE_ABOVE`, clothes.py KNEE_Z) is drawn `RIDE_KEEP` of its length, the same
# in every frame: laid round both legs it would stretch between them, and cut by each frame's stride it would jump
# from frame to frame. A skirt at the knee or below, and every other move, hang as they always have.
RIDE_UP = frozenset()
RIDE_KEEP = 0.35
RIDE_ABOVE = 0.55


def rides_up(d):
    """Whether drape `d` rides up in the moves that spread the legs: a skirt whose hem stands above the knee."""
    return isinstance(d, Skirt) and d.hem > RIDE_ABOVE


class Skirt(Drape):
    """A skirt round the legs: from `top` (a height at rest on the hips or the waist) down to `hem` (a height at rest),
    laid round the hull of the legs and the hips (and whatever `over` names) at each station, eased by `ease` at its top
    and flaring by `flare` toward its hem, folded `folds` times round. `span` (radians each side of the front, or None
    all round) leaves it open: a tabard's panels, a split skirt."""
    reads_hands = True

    def __init__(self, name, mats, top, hem, ease=0.012, flare=0.12, folds=12, fold_depth=0.18, rows=18, cols=72,
                 over=None, rigid=('armour_',), panels=None, thick=0.003, cinch=None, fall=0.95, size=REST_SIZE):
        """`cinch`: its ease at the top, drawn in by a belt or a cord, opening to `ease` a little below. `fall`: how
        far each row may draw in under the row above, below whatever pushed it out (a heavy cloth falls in sooner).
        `size`: the metres round it and down it its pattern is read over (Drape)."""
        self.top, self.hem, self.ease, self.flare, self.cinch, self.fall = top, hem, ease, flare, cinch, fall
        self.fold_n, self.fold_depth, self.over, self.rigid = folds, fold_depth, over, rigid
        self.panels = panels   # [(from, to)] radians round from the front, the parts of the round the cloth covers
        gaps = ()
        if panels:
            lo = min(a for a, _ in panels)
            hi = max(b for _, b in panels)
            self.th = np.linspace(lo, hi, cols)
            # laid round from the first panel to the last, the cloth between them left out
            mid = (self.th[:-1] + self.th[1:]) / 2
            gaps = tuple(k for k, m in enumerate(mid) if not any(a <= m <= b for a, b in panels))
        else:
            self.th = np.linspace(0, TAU, cols, endpoint=False)
        super().__init__(name, mats, rows, cols, panels is None, thick, size=size, gaps=gaps)

    def update(self, W, fighter):
        if mounted(fighter):
            return self._ride(W, fighter)
        F = Frame(W)
        pelvis = np.array(W['pelvis'])[:3, 3]
        top = pelvis + F.up * (self.top - 0.97)   # the pelvis joint stands at 0.97 at rest
        # what lies under it: the hips and the legs below its own top, never a torso leaning out over it
        below = self.top + 0.04
        pts = posed_points(fighter, self.over, self.rigid, feet=False, below=below)
        q2, h = F.to2(pts, top)
        # the feet only at an ankle-length hem: a hem clears the shoe, a heel lifted behind a robe does not tent it
        everything = posed_points(fighter, self.over, self.rigid, below=below)
        f2, fh = F.to2(everything, top)
        rows, cols = self.rows, self.cols
        grid = np.zeros((rows, cols, 3))
        outv = np.zeros((rows, cols, 3))
        th = self.th + (-math.pi / 2 if self.panels else 0.0)   # panels measured from the front
        across = 'hold' if self.panels else 'wrap'
        T = np.arange(rows) / (rows - 1)
        D = (self.top - self.hem) * T
        ankle = (self.top - D) < FEET_Z
        SL = [(f2 if a else q2)[np.abs((fh if a else h) + d) < 0.02 + 0.01 * t] for t, d, a in zip(T, D, ankle)]
        # its waistband closes round the hips alone: a thigh thrown up to the waist lifts the cloth below the band
        w2, wh = F.to2(posed_points(fighter, self.over, self.rigid, feet=False, below=below, legs=False), top)
        band = w2[np.abs(wh) < 0.02]
        SL[0] = band if len(band) >= 3 else SL[0]
        # the middle it is laid round: each slice's, smoothed down it, so it wanders less than the legs under it and
        # never jumps from one station to the next
        C = np.zeros((rows, 2))
        for i, sl in enumerate(SL):
            C[i] = sl.mean(axis=0) if len(sl) else (C[i - 1] if i else np.zeros(2))
        C = blur(C, 6, 0)
        # what it hangs over: round a closed skirt the hull of the legs, the cloth spanning between them; a panel only
        # what lies behind it, so a leg thrown out to the side passes it by
        reach_of = sector_reach if self.panels else hull_reach
        HULL = np.array([reach_of(sl, c, th) if len(sl) >= 3 else np.zeros(cols) for sl, c in zip(SL, C)])
        ease = np.full(rows, self.ease)
        if self.cinch is not None:
            u = np.clip(T / 0.18, 0.0, 1.0)
            ease = self.cinch + (self.ease - self.cinch) * (u * u * (3 - 2 * u))
        HULL = HULL + ease[:, None] * (0.5 + 0.5 * F.stand)
        # lying, it settles: no flare, its folds shallow, its hem closing round the ankles
        R = HULL + self.flare * T[:, None] ** 1.4 * F.stand
        for i in range(1, rows):   # hangs down from the row above: never pulled in faster than cloth falls
            R[i] = np.maximum(R[i], R[i - 1] * (self.fall if F.stand > 0.5 else 0.9))
        # its waist hugs the waist: the top rows are neither widened nor smoothed toward the hips below them
        w = np.clip(T / 0.3, 0.0, 1.0)[:, None]
        w = w * w * (3 - 2 * w)
        clear = clearance(HULL, 2, across, 1)   # a row down: over a leg thrown out it never swells past it
        clear = HULL + (clear - HULL) * w
        R = np.maximum(R, clear)
        R = np.maximum(R + (blur(R, 3, 0, 'hold') - R) * w, clear)
        R = np.maximum(blur(R, 3, 1, across), clear)
        CAP = self._arms(fighter, F, top, T, D, C, th, clear)
        R = np.minimum(R, CAP)
        ride = D[int(round(RIDE_KEEP * (len(D) - 1)))] if getattr(self, 'anim', None) in RIDE_UP and rides_up(self) else None
        # its folds: soft, broad and uneven, deepening toward the hem, never sharp enough to star it
        FR = np.array([np.minimum(r * (1 + self.fold_depth * 0.85 * t ** 1.2 * ripple(
            th + 0.25 * np.sin(th * 3 + t * 2), self.fold_n, self.top * 11 + self.hem * 5) * (0.3 + 0.7 * F.stand)), cap)
            for t, r, cap in zip(T, R, CAP)])
        # each column ends HANG below the last station it lies on what it covers: there the stations close up. A
        # panel hangs free between the legs as it is cut to
        lies = R <= clear + self.flare * T[:, None] ** 1.4 + 0.01
        last = rows - 1 - np.argmax(lies[::-1], axis=0)
        reach = np.full(cols, D[-1]) if self.panels else blur(np.minimum(D[-1], D[last] + HANG), 3, 0, across)
        if ride is not None:
            reach = np.minimum(reach, ride)
        DD = T[:, None] * reach[None, :]   # each station's drop, by column
        FR = np.array([np.interp(DD[:, k], D, FR[:, k]) for k in range(cols)]).T
        CC = np.stack([np.interp(DD, D, C[:, j]) for j in range(2)], axis=-1)
        for i in range(rows):
            p2 = CC[i] + np.stack([np.cos(th), np.sin(th)], axis=1) * FR[i][:, None]
            grid[i] = top + np.outer(p2[:, 0], F.x) + np.outer(p2[:, 1], F.y) - np.outer(DD[i], F.up)
            if F.stand < 0.5:   # lying: the cloth under the legs lies on the ground, never through it
                grid[i, :, 2] = np.maximum(grid[i, :, 2], 0.004)
            outv[i] = np.outer(np.cos(th), F.x) + np.outer(np.sin(th), F.y)
        self.set(grid, outv)


    def _ride(self, W, fighter):
        """Astride, the skirt lies as cloth lies over a saddle: each column from its band taut over the thighs and
        the horse below it (`hang`), then straight down. So it parts over the saddle, lies over the pommel and the
        cantle, and falls down each flank past the knee, never under the belly."""
        F = Frame(W)
        pelvis = np.array(W['pelvis'])[:3, 3]
        top = pelvis + F.up * (self.top - 0.97)
        w2, wh = F.to2(posed_points(fighter, self.over, self.rigid, feet=False, below=self.top + 0.04, legs=False), top)
        band = w2[np.abs(wh) < 0.02]
        c = band.mean(axis=0) if len(band) else np.zeros(2)
        th = self.th + (-math.pi / 2 if self.panels else 0.0)
        reach = (sector_reach if self.panels else hull_reach)(band, c, th) if len(band) >= 3 else np.zeros(self.cols)
        reach = blur(reach + (self.cinch if self.cinch is not None else self.ease), 2, 0, 'edge' if self.panels else 'wrap')
        out = np.outer(np.cos(th), F.x) + np.outer(np.sin(th), F.y)
        ring = top + c[0] * F.x + c[1] * F.y + out * reach[:, None]
        sup = support(fighter, self.over, self.rigid)
        ease = self.ease + 0.004
        steps = np.full(self.rows - 1, (self.top - self.hem) / (self.rows - 1))
        under = posed_points(fighter, self.over, self.rigid, below=self.top + 0.04)
        G = settle(hang(ring, out, F.up, steps, under, horse_points()[0], ease), not self.panels, sup, ease)
        self.set(G, _grid_out(G.reshape(-1, 3), self.rows, self.cols, pelvis, F.up).reshape(G.shape))

    def _arms(self, fighter, F, top, T, D, C, th, clear, gap=0.007):
        """How far out the skirt may lie in each direction at each station: just inside an arm hanging beside it, so a
        hand lies against the skirt and never in it, wherever the arm lies outside the legs it covers (a hand on the
        thigh cannot be cleared); without bound elsewhere."""
        cap = np.full((len(T), len(th)), np.inf)
        arms = np.concatenate([arm_points(fighter, s, self.over) for s in 'LR'])
        if not len(arms):
            return cap
        q2, h = F.to2(arms, top)
        for i, (t, d) in enumerate(zip(T, D)):
            sl = q2[np.abs(h + d) < 0.02 + 0.01 * t] - C[i]
            if len(sl) < 3:
                continue
            rho, phi = np.hypot(sl[:, 0], sl[:, 1]), np.arctan2(sl[:, 1], sl[:, 0])
            near = np.abs((phi[None, :] - th[:, None] + math.pi) % TAU - math.pi) < 0.05 / np.maximum(rho, 0.05)[None, :] + 0.08
            inner = np.where(near, rho[None, :], np.inf).min(axis=1) - gap
            cap[i] = np.where(inner > clear[i] + 0.004, inner, np.inf)
        return cap


# how an animation's keys pass: seconds a key, whether it goes round, and how fast the body travels (the air it meets)
PACE = {'walk': (0.24, True, 1.0), 'walk_staff': (0.24, True, 1.0), 'bow': (0.25, False, 0.0),
        'spell': (0.15, False, 0.0), 'horsewalk': (0.13, True, 1.2), 'horsegallop': (0.08, True, 3.0)}
PACE_ELSE = (0.11, False, 0.0)
# a cloak hung once on the body standing and worn on its bones after (rigcape.py), or with FORGE_RIG=0 hung and carried
# as cloth at every key, as it was before
RIG = os.environ.get('FORGE_RIG', '1') != '0'
YOKE = 0.2   # how far down a cloak its yoke lies over the shoulders
YOKE_SPAN = 1.1   # the yoke's foot, either way round from the back: on the shoulder blades, so it hangs between the arms
MANTLE = 6   # the row of a cloak's yoke its hood's mantle is sewn to, most of the way down the shoulders
_MESHES = {}


def _filled(me, co, outer=None):
    """A mesh's triangles (of its first `outer` vertices alone: a shell's outside), and over each wider than a
    cloth's step the points that fill it in (which triangle, and where in it), made once a mesh."""
    key = me.as_pointer()
    if key not in _MESHES:
        me.calc_loop_triangles()
        t = np.zeros(len(me.loop_triangles) * 3, np.int64)
        me.loop_triangles.foreach_get('vertices', t)
        t = t.reshape(-1, 3)
        if outer is not None:
            t = t[t.max(axis=1) < outer]
        e = np.max([np.linalg.norm(co[t[:, b]] - co[t[:, a]], axis=1) for a, b in ((0, 1), (1, 2), (2, 0))], axis=0)
        n = np.ceil(e / 0.015).astype(int)
        T, B = [np.zeros(0, int)], [np.zeros((0, 3))]
        for k in np.unique(n[n > 1]):
            ij = [(i, j) for i in range(k + 1) for j in range(k + 1 - i) if (i, j) not in ((0, 0), (k, 0), (0, k))]
            bary = np.array([(1 - (i + j) / k, i / k, j / k) for i, j in ij])
            tris = np.flatnonzero(n == k)
            T.append(np.repeat(tris, len(bary)))
            B.append(np.tile(bary, (len(tris), 1)))
        # its triangles turned outward, away from its middle: one wound inside out would pull a cloth into it
        a, b, c = co[t[:, 0]], co[t[:, 1]], co[t[:, 2]]
        if (np.cross(b - a, c - a) * ((a + b + c) / 3 - co.mean(axis=0))).sum() < 0:
            t = t[:, ::-1].copy()
        _MESHES[key] = (t, np.concatenate(T), np.concatenate(B))
    return _MESHES[key]


def _unit_rows(v):
    return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-12)


def surfaces(fighter, names=None, rigid=(), top=1.52):
    """The posed surfaces a cloth lies on, as points and the way out at each: the body's skins (those named, or every
    one) and the rigid parts whose names start with `rigid` (an armour's plates), each triangle wider than a cloth's
    step filled in, and which of them it may touch: those below `top` at rest (never the head, kept to close the
    body round). The same points, in the same order, every pose."""
    from body import coords
    P, N, U = [], [], []

    def add(me, co, M=None, keep=None, outer=None):
        t, ft, fb = _filled(me, co, outer)
        if M is not None:
            co = co @ M[:3, :3].T + M[:3, 3]
        fn = np.cross(co[t[:, 1]] - co[t[:, 0]], co[t[:, 2]] - co[t[:, 0]])
        vn = np.zeros_like(co)
        for j in range(3):
            np.add.at(vn, t[:, j], fn)
        vn, fn = _unit_rows(vn), _unit_rows(fn)
        kv = np.ones(len(co), bool)
        kv[np.setdiff1d(np.arange(len(co)), t.ravel())] = False   # a point on none of them (a shell's inside) left out
        under = np.ones(len(co), bool) if keep is None else keep
        P.append(co[kv])
        N.append(vn[kv])
        U.append(under[kv])
        P.append((co[t[ft]] * fb[:, :, None]).sum(axis=1))
        N.append(fn[ft])
        U.append(under[t[ft, 0]])

    for sk in fighter.skins:
        if not named(sk, names):
            continue
        add(sk.me, coords(sk.me), keep=sk.rest[:, 2] < top, outer=getattr(sk, 'outer', None))
    for ob, joint in fighter.parts:
        if rigid and ob.name.startswith(tuple(rigid)) and joint != 'head':
            add(ob.data, coords(ob.data), M=np.array(ob.matrix_world))
    return np.concatenate(P), np.concatenate(N), np.concatenate(U)



def mounted(fighter):
    """Whether `fighter` was last placed astride the horse (forge.py `Fighter.place`): a ride's frame."""
    return bool(getattr(fighter, 'mounted', False))


# what of the horse's tack a cloth lies on: the saddle, its blanket and girth and the bags behind it, never a strap or
# a rein, which a skirt passes over without lying on it
SEAT = ('tack_blanket', 'tack_saddle', 'tack_girth', 'tack_bag')
# the horse a cloth may reach: its hide above this height at rest, never its legs below the barrel, whose stride would
# only make a cloak's carry take its smallest steps
BARREL_Z = 0.8
_REST_UP = {}


def horse_points():
    """The horse as it stands this frame (riding.py's Courser), its hide above its legs and its saddle: points over
    each triangle as `surfaces` gives them, and the way out at each, the same points every frame."""
    import riding
    from body import coords
    horse = riding.mount()
    obs = [horse.parts['body'][0]] + [ob for ob, _ in horse.tack if ob.name.startswith(SEAT)]
    P, N = [], []
    for ob in obs:
        me = ob.data
        co = coords(me)
        t, ft, fb = _filled(me, co)
        if me.as_pointer() not in _REST_UP:   # which triangles lie above the legs, by where the hide lies at rest
            rest = me.attributes.get('rest')
            if rest is None:
                up = np.ones(len(t), bool)
            else:
                r = np.zeros(len(co) * 3, np.float32)
                rest.data.foreach_get('vector', r)
                up = r.reshape(-1, 3)[t, 2].mean(axis=1) > BARREL_Z
            _REST_UP[me.as_pointer()] = up
        up = _REST_UP[me.as_pointer()]
        fn = _unit_rows(np.cross(co[t[:, 1]] - co[t[:, 0]], co[t[:, 2]] - co[t[:, 0]]))
        vn = np.zeros_like(co)
        for j in range(3):
            np.add.at(vn, t[:, j], fn)
        on = np.zeros(len(co), bool)
        on[t[up].ravel()] = True
        keep = up[ft]
        P += [co[on], (co[t[ft[keep]]] * fb[keep][:, :, None]).sum(axis=1)]
        N += [_unit_rows(vn)[on], fn[ft[keep]]]
    return np.concatenate(P), np.concatenate(N)


class Support:
    """What a cloth may not pass into astride: the rider and the horse as solids (each cell of a grid round them that
    the air outside cannot reach) and their surfaces, which it keeps `ease` off."""

    def __init__(self, P, h=0.01):
        from scipy import ndimage
        from scipy.spatial import cKDTree
        self.tree, self.h = cKDTree(P), h
        self.lo = P.min(axis=0) - 4 * h
        at = np.floor((P - self.lo) / h).astype(np.int64)
        solid = np.zeros(at.max(axis=0) + 5, bool)
        solid[tuple(at.T)] = True
        solid = ndimage.binary_dilation(solid)
        cells, _ = ndimage.label(~solid)
        edge = np.unique(np.concatenate([cells[0].ravel(), cells[-1].ravel(), cells[:, 0].ravel(),
                                         cells[:, -1].ravel(), cells[:, :, 0].ravel(), cells[:, :, -1].ravel()]))
        self.air = np.isin(cells, edge[edge > 0])

    def clear(self, X, ease):
        """Whether each point of `X` lies in the air, `ease` off every surface."""
        at = np.floor((X - self.lo) / self.h).astype(np.int64)
        inside = np.all((at >= 0) & (at < np.array(self.air.shape)), axis=1)
        air = np.ones(len(X), bool)
        air[inside] = self.air[tuple(at[inside].T)]
        d, _ = self.tree.query(X, distance_upper_bound=ease)
        return air & ~np.isfinite(d)


_SUPPORT = {}


def support(fighter, names=None, rigid=()):
    """The rider (`surfaces` of `fighter`, those named) and the horse as this frame poses them: a `Support`, made once
    a frame."""
    key = (id(getattr(fighter, 'W', None)), tuple(names or ()), tuple(rigid))
    if key not in _SUPPORT:
        _SUPPORT.clear()
        P, _, _ = surfaces(fighter, names, rigid)
        _SUPPORT[key] = Support(np.concatenate([P, horse_points()[0]]))
    return _SUPPORT[key]


LAP = 0.3      # how far along a cloth it may climb over what it lies on (a pommel, a cantle), metres
RISE = 0.15    # and how far over where it is sewn
CLIMB = 0.05   # past its lap the steepest it climbs, rise over run: steeper, it gathers there
SPREAD = 0.45  # radians round either way a gathered column holds its neighbours' hems up (a skirt rides up the knee)
SLAB = 0.035   # half the width of the upright slab a column of cloth is laid over


BIN = 0.01   # the run over which a slab's top is read, metres


def _laid(r, z):
    """The line a cloth laid out from (0, 0) takes over 2D points (`r` out, `z` up): taut over their top, read a `BIN`
    at a time outward, until the top rises ahead steeper than it climbs (`CLIMB`, `LAP`). Gives its corners, and
    whether it was stopped there, so it gathers rather than falls on."""
    if not len(r):
        return np.zeros((1, 2)), False
    rb = np.floor(r / BIN).astype(np.int64)
    order = np.lexsort((-z, rb))
    first = np.ones(len(order), bool)
    first[1:] = rb[order][1:] != rb[order][:-1]
    hull, run = [(0.0, 0.0)], 0.0
    for p in zip(r[order][first], z[order][first]):
        a = hull[-1]
        over = run < LAP and p[1] < RISE   # over a pommel or a cantle near where it is sewn
        if not over and p[1] - a[1] > CLIMB * (p[0] - a[0]) + BIN:   # a rise ahead: it gathers here
            return np.array(hull), True
        while len(hull) >= 2:
            (r1, z1), (r2, z2) = hull[-2], hull[-1]
            if (r2 - r1) * (p[1] - z1) - (z2 - z1) * (p[0] - r1) >= 0:   # no right turn: the middle lies under
                hull.pop()
            else:
                break
        hull.append(p)
        run = float(np.sum(np.hypot(*np.diff(np.array(hull), axis=0).T))) if len(hull) > 1 else 0.0
    return np.array(hull), False


def hang(start, out, up, steps, under, beside, ease):
    """Cloth laid down from `start` (cols, 3), each column in the upright plane along its way `out` (cols, 3): taut
    over the top of what lies beyond and below its start (`under`, the rider below it, and `beside`, the horse, all of
    it), then straight down past the last of it. Where it would climb (a horse's neck rising ahead) it gathers instead.
    `steps` each row's length; it lies `ease` off what it covers."""
    cols, rows = len(start), len(steps) + 1
    G = np.zeros((rows, cols, 3))
    at = np.concatenate([[0.0], np.cumsum(steps)])
    paths, ends = [], np.full(cols, at[-1])
    for k in range(cols):
        o = out[k]
        side = np.cross(up, o)
        r, z = [], []
        for pts, top in ((under, 0.02), (beside, np.inf)):
            rel = pts - start[k]
            rk, zk, wk = rel @ o, rel @ up, rel @ side
            sel = (np.abs(wk) < SLAB) & (rk > 0.005) & (zk < top)
            r.append(rk[sel])
            z.append(zk[sel])
        path, stopped = _laid(np.concatenate(r), np.concatenate(z))
        # each corner `ease` out along its two sides' way up and out, the start where it is sewn
        seg = np.diff(path, axis=0)
        n = np.stack([-seg[:, 1], seg[:, 0]], axis=1) / np.maximum(np.hypot(seg[:, 0], seg[:, 1]), 1e-9)[:, None]
        if len(seg):
            corner = np.vstack([n[:1], n[1:] + n[:-1], n[-1:]])
            corner = corner / np.maximum(np.linalg.norm(corner, axis=1, keepdims=True), 1e-9)
            path = path + np.vstack([[0.0, 0.0], ease * corner[1:]])
        if not stopped:   # past the last of what it lies on, straight down
            path = np.vstack([path, path[-1] + [0.0, -10.0]])
        seg = np.diff(path, axis=0)
        s = np.concatenate([[0.0], np.cumsum(np.hypot(seg[:, 0], seg[:, 1]))])
        paths.append((path, s))
        if stopped:
            ends[k] = min(ends[k], s[-1])
    # a gathered column holds up its neighbours' hems, so the cloth between them never runs from one gathered far
    # out to one hanging far down
    turn = np.arccos(np.clip(out @ out.T, -1.0, 1.0))
    held = np.array([ends[turn[k] < SPREAD].min() for k in range(cols)])
    held = np.minimum(blur(held, 2, 0, 'edge'), at[-1])
    for k, (path, s) in enumerate(paths):
        u = np.minimum(at, held[k])
        G[:, k] = start[k] + np.outer(np.interp(u, s, path[:, 0]), out[k]) + np.outer(np.interp(u, s, path[:, 1]), up)
    return G


def settle(G, closed, sup, ease, passes=3):
    """A hung grid smoothed across its columns and down its rows, as cloth spans between them, each point kept
    where it was wherever the smoothing would take it into what it lies on."""
    for _ in range(passes):
        S = blur(blur(G, 1, 1, 'wrap' if closed else 'edge'), 1, 0, 'edge')
        S[0] = G[0]
        flat = S.reshape(-1, 3)
        ok = sup.clear(flat, ease).reshape(G.shape[:2])
        G = np.where(ok[..., None], S, G)
    return G


def ride_clear(drapes, fighter, margin=0.008):
    """Astride, every drape's cloth lifted `margin` off the horse wherever it lies within reach of its hide or saddle,
    its lining with it: a sleeve's bell or a belt's tails hanging over the saddle lies on it."""
    if not mounted(fighter):
        return
    import cloth
    P, N = horse_points()
    on = cloth.Surface(P, N)
    for d in drapes:
        n = len(d.verts) // 2
        o = d.verts[:n].copy()
        on.lift(o, o.copy(), margin, 0.0)
        d.verts = np.concatenate([o, d.verts[n:] + (o - d.verts[:n])])
        d.me.vertices.foreach_set('co', d.verts.ravel())
        d.me.update()

class Cloak(Drape):
    """A cloak: a cut of cloth sewn round the foot of the neck and hung from it (cloth.py), as a cloak is worn. Cut as
    a gore of a circle, `fullness` times wider at its hem than across its shoulders, so its hem flares and its folds
    are its own cloth's. It falls over the shoulders and off their edges, behind the arms and down the
    back to `hem` (a height at rest), and is carried through each animation: a stride sways it and the air the body
    walks into blows it back, an arm swung back pushes into it, an arm raised lifts its edge. Its collar opens a
    hand's width at the throat where its clasp closes it; its edges are turned (the hem's cloth)."""

    def __init__(self, name, mats, hem=0.42, ease=0.012, fullness=1.4, gap=0.3, rows=40, cols=44, over=None,
                 rigid=('armour_',), thick=0.004, seed=1.1):
        from rig import rest
        self.hem, self.ease, self.fullness, self.gap = hem, ease, fullness, gap
        self.over, self.rigid, self.seed = over, rigid, seed
        self.collar_h, self.dip = -0.01, 0.035   # the collar's height on the neck behind, and its dip to the throat
        self.neck_z = float(np.array(rest('neck'))[2])   # the neck's height at rest
        self.length = self.neck_z + self.collar_h - hem + 0.03   # down the back to the hem
        self.th = np.linspace(-(math.pi - gap), math.pi - gap, cols)   # round the neck from the back, to the left
        self.yoke_rows = int(YOKE / (self.length / (rows - 1))) + 1   # the rows that lie on the shoulders
        self.cloth, self.drop, self.states, self.frame = None, None, None, 0
        self.clear = None
        self.corners, self.worn = None, None
        super().__init__(name, mats, rows, cols, False, thick, border=(1, 1, 2))

    def snapshot(self, W, fighter):
        """What the cloak hangs on at one key: the surfaces under it (the body, what is worn under it, an armour's
        plates, a full skirt it hangs clear of), its collar, and the way the body faces. Rigged (`RIG`), once its rig
        is made, nothing is read off the skin: a key gives only the horse under it, astride."""
        import cloth
        if RIG and getattr(self, 'rig', None) is not None:
            return {'extra': self._ridden(W, fighter)}
        P, N, under = surfaces(fighter, self.over, self.rigid)
        if mounted(fighter):   # astride, it falls over the horse's back and rump
            hp, hn = horse_points()
            P, N, under = np.concatenate([P, hp]), np.concatenate([N, hn]), np.concatenate([under, np.ones(len(hp), bool)])
        if self.clear is not None:   # a full skirt's outside, which it hangs clear of
            self.clear.update(W, fighter)
            g = self.clear.verts[:self.clear.rows * self.clear.cols]
            n = _grid_out(g, self.clear.rows, self.clear.cols, np.array(W['pelvis'])[:3, 3], Frame(W).up)
            P, N, under = np.concatenate([P, g]), np.concatenate([N, n]), np.concatenate([under, np.ones(len(g), bool)])
        F = Frame(W)
        neck = np.array(W['neck'])[:3, 3]
        # the air kept out of the body: its spine's joints lie inside it whatever it does
        air, out = cloth.outside(P, inside=[np.array(W[j])[:3, 3] for j in ('pelvis', 'spine', 'chest')])
        open_ = under & air
        N = np.where(((N * out).sum(axis=1) < -0.2)[:, None], -N, N)   # a triangle turned inside out by a bend
        ring = self._collar(W, P[open_], N[open_])
        shot = {'P': P, 'N': N, 'open': open_, 'pin': self._yoke(ring, P[open_], N[open_], W), 'F': F, 'neck': neck}
        if mounted(fighter):   # what its first guess lies over astride: the rider's trunk and legs, and the horse
            shot['under'], shot['beside'] = posed_points(fighter, self.over, self.rigid), horse_points()[0]
        if RIG:
            shot['extra'] = self._ridden(W, fighter)
            if getattr(self, 'cut_from', None) is None:   # the body standing, which its rig is made on
                self._cut_shot = shot
        return shot

    def _ridden(self, W, fighter):
        """Astride, the horse under it as a capsule round its barrel and rump (rigcape.py `horse`), else none."""
        if not mounted(fighter):
            return []
        import rigcape
        return [rigcape.horse(horse_points()[0], np.array(W['pelvis'])[:3, 3])]

    def _axes(self, W):
        C = np.array(W['chest'])[:3, :3]
        return C[:, 0], C[:, 1], C[:, 2]   # the chest's left, back and up

    def _collar(self, W, P, N):
        """Its collar at one key: a ring round the foot of the neck, `ease` off whatever is there, from one side of the
        throat round the back to the other, dipping in front to the notch of the throat, and lying on the slope of
        the shoulders where they rise into the neck."""
        import cloth
        x, y, z = self._axes(W)
        q = P - np.array(W['neck'])[:3, 3]
        qx, qy, qz = q @ x, q @ y, q @ z
        near = np.hypot(qx, qy) < 0.11   # the neck alone, never the shoulders round it
        h = self.collar_h - self.dip * np.clip(-np.cos(self.th), 0.0, 1.0) ** 2
        r = np.zeros(len(self.th))
        for c, (t, hh) in enumerate(zip(self.th, h)):
            sl = near & (np.abs(qz - hh) < 0.012)
            pts = np.stack([qx[sl], qy[sl]], axis=1)
            got = hull_reach(pts, np.zeros(2), np.array([math.pi / 2 - t]))[0] if len(pts) >= 3 else 0.0
            r[c] = max(got, 0.05) + self.ease + 0.004
        r = blur(r, 2, 0, 'edge')
        ring = (np.array(W['neck'])[:3, 3] + np.outer(r * np.sin(self.th), x) + np.outer(r * np.cos(self.th), y)
                + np.outer(h, z))
        on = cloth.Surface(P, N)
        for _ in range(3):
            on.lift(ring, ring.copy(), self.ease + 0.004, 0.0)
            ring = blur(ring, 1, 0, 'edge')
        on.lift(ring, ring.copy(), self.ease + 0.004, 0.0)
        return ring

    def _yoke(self, ring, P, N, W):
        """Its yoke at one key, the rows that lie on the shoulders, laid on the body as it stands (`P`, `N` its
        surfaces open to the air): from the collar (`ring`) out over the shoulders, its front edges drawn back from
        the throat across the fronts of the shoulders to their sides. Each column is laid as a chain is: a cloth's
        step at a time out from the collar, as steeply down as it can go clear of the body, so it lies on the
        shoulders and falls straight past their edges, and a lifted arm lifts it."""
        import cloth
        x, y, z = self._axes(W)
        u = self.th / (math.pi - self.gap)
        k = self.yoke_rows
        step = YOKE / (k - 1)
        on = cloth.Surface(P, N)
        G = np.zeros((k, self.cols, 3))
        G[0] = ring
        falls = np.radians(np.arange(90, -45, -5))   # down first, then out, then up over what is in the way
        for i in range(1, k):
            v = i / (k - 1)
            v = v * v * (3 - 2 * v)
            t = u * ((math.pi - self.gap) + (YOKE_SPAN - (math.pi - self.gap)) * v)
            out = np.outer(np.sin(t), x) + np.outer(np.cos(t), y)
            # its front edges run from the throat over the shoulders, never down the chest: in front of the side a
            # column may fall less the nearer the front it is
            w = np.clip((np.abs(t) - 1.6) / 0.6, 0.0, 1.0)
            steepest = np.radians(90 - 75 * w * w * (3 - 2 * w))
            best = np.full(self.cols, -np.inf)
            for f in falls:
                p = G[i - 1] + step * (math.cos(f) * out - math.sin(f) * z)
                d, j = on.tree.query(p, distance_upper_bound=0.08)
                sd = np.full(self.cols, np.inf)
                hit = np.isfinite(d)
                sd[hit] = ((p[hit] - on.P[j[hit]]) * on.N[j[hit]]).sum(axis=1)
                take = (sd >= self.ease) & ~np.isfinite(best) & (f <= steepest + 1e-9)
                G[i, take] = p[take]
                best[take] = f
                if np.isfinite(best).all():
                    break
            last = ~np.isfinite(best)   # nowhere clear: straight out over it
            G[i, last] = G[i - 1, last] + step * out[last]
        G[1:] = blur(G[1:], 2, 1, 'edge')
        flat = G.reshape(-1, 3)
        on.lift(flat, flat.copy(), self.ease, 0.0)
        G = flat.reshape(G.shape)
        G[0] = ring
        return G

    def _cut(self, yoke, W):
        """Its cut, laid flat below its yoke: rows round from one front edge to the other, as wide as the yoke's foot
        (`yoke`, as it lies) and widening evenly to `fullness` times that at its hem, so the hem flares and the cloth
        gathers into its own folds."""
        rows, cols, k = self.rows, self.cols, self.yoke_rows
        foot = float(np.linalg.norm(np.diff(yoke[-1], axis=0), axis=1).sum())
        # from the yoke's foot down the back to the hem, by the chest's own up from the neck, so a cloak first hung on a
        # body leant over (a hurt) is cut as long as one first hung on a body standing
        z = self._axes(W)[2]
        free = self.neck_z + float((yoke[-1, cols // 2] - np.array(W['neck'])[:3, 3]) @ z) - self.hem
        drop = np.concatenate([np.linspace(0.0, YOKE, k), YOKE + np.linspace(0.0, free, rows - k + 1)[1:]])
        self.drop = np.repeat(drop[:, None], cols, axis=1)
        s = self.drop
        width = foot * (1 + (self.fullness - 1) * np.clip((s - YOKE) / free, 0.0, None))
        rho = 0.15 + s
        a = width / rho * np.linspace(-1.0, 1.0, cols)[None, :] / 2
        return np.stack([rho * np.sin(a), -rho * np.cos(a)], axis=-1)

    def _guess(self, shot, W):
        """A first guess at how it hangs below its yoke, clear of the body: straight down from the yoke's foot and a
        little out, a few folds begun in it, each row moved out whole until it clears the body (a point moved alone
        would leave the cloth between it and the next through the body)."""
        import cloth
        x, y, z = self._axes(W)
        neck = shot['neck']
        k = self.yoke_rows
        G = np.zeros((self.rows, self.cols, 3))
        G[:k] = shot['pin']
        foot = G[k - 1]
        o = foot - neck
        o = o - np.outer(o @ z, z)
        o /= np.maximum(np.linalg.norm(o, axis=1, keepdims=True), 1e-9)
        if 'under' in shot:   # astride, laid over the horse's back and rump as cloth falls on them
            sup = Support(shot['P'])
            steps = np.diff(self.drop[k - 1:, 0])
            G[k - 1:] = settle(hang(foot, o, np.array([0.0, 0.0, 1.0]), steps, shot['under'], shot['beside'],
                                    2 * self.ease), False, sup, 2 * self.ease)
            return G
        t = self.th / (math.pi - self.gap) * YOKE_SPAN
        on = cloth.Surface(shot['P'], shot['N'])
        out = np.zeros(self.cols)   # how far out each column above had to stand: below it stands at least as far
        for i in range(k, self.rows):
            below = self.drop[i, 0] - self.drop[k - 1, 0]
            wave = 0.02 * (below / self.length) * np.sin(t * 5 + self.seed)
            for _ in range(50):
                G[i] = foot - z * below + o * (0.12 * below + out + wave)[:, None]
                d, j = on.tree.query(G[i])
                sd = ((G[i] - on.P[j]) * on.N[j]).sum(axis=1)
                near = (sd < 2 * self.ease) & (d < 0.15)
                if not near.any():
                    break
                out = np.maximum(blur(out + 0.008 * near, 2, 0, 'edge'), out)   # smoothed across, all of a piece
        return G

    def carry(self, shots, anim, Ws):
        """Carry it through `anim`'s keys (`shots`, one a key, `snapshot`, with each key's joints `Ws`), each key's
        cloth kept for its frame. Rigged (`RIG`): hung as cloth once, on the body standing (`_hang`), its rig made
        from that (rigcape.py), and swung on it through every move after; else hung as cloth at every key (`_hang`)."""
        if not RIG:
            return self._hang(shots, anim, Ws)
        import rigcape
        if getattr(self, 'rig', None) is None:
            cut = getattr(self, '_cut_shot', None) or shots[0]
            W0 = self.cut_from[1] if getattr(self, 'cut_from', None) is not None else Ws[0]
            self._hang([cut], 'idle', [W0])
            self.rig = rigcape.Rig(self.states[0], W0, cut['P'], self.yoke_rows)
        extras = [s.get('extra', ()) for s in shots]
        X = self.rig.swing(anim, Ws, PACE.get(anim, PACE_ELSE), extras)
        self.states = [self.rig.grid(x, W, e) for x, W, e in zip(X, Ws, extras)]

    def _hang(self, shots, anim, Ws):
        """Hang it on the first of `shots` (one a key, `snapshot`, with each key's joints `Ws`) and carry it through
        them as `anim` passes (PACE); each key's cloth is kept for its frame. Its yoke lies on the shoulders at each
        key; the cloth below it hangs and swings."""
        import cloth
        pace, loop, travel = PACE.get(anim, PACE_ELSE)
        if self.cloth is None:   # cut on the body standing (`cut_from`, layers.py `swing`), never on the first move
            pin, W = getattr(self, 'cut_from', None) or (shots[0]['pin'], Ws[0])
            self.cloth = cloth.Cloth(self._cut(pin, W), bend=0.5, crush=0.3, drag=(1.6, 0.25))
        # the surfaces thinned to a cloth's step, the same points at every key
        P0 = shots[0]['P']
        _, keep = np.unique(np.floor(P0 / 0.01).astype(np.int64), axis=0, return_index=True)
        keep = np.sort(keep)
        keys = [{'P': s['P'][keep], 'N': s['N'][keep], 'open': s['open'][keep], 'pin': s['pin'].reshape(-1, 3),
                 'wind': s['F'].y * travel} for s in shots]
        X = self._guess({**shots[0], 'P': shots[0]['P'][shots[0]['open']], 'N': shots[0]['N'][shots[0]['open']]}, Ws[0])
        frames = [(np.array(w['chest'])[:3, :3], np.array(w['neck'])[:3, 3]) for w in Ws]   # carried in the chest
        self.states = cloth.carry(self.cloth, X, keys, np.arange(self.yoke_rows * self.cols), pace,
                                  loop and len(shots) > 1, margin=self.ease, friction=1.0, damp=2.0,
                                  frames=frames, rest=100, cycles=2, follow=0.5)

    def update(self, W, fighter):
        if self.states is None or self.frame >= len(self.states):
            self.carry([self.snapshot(W, fighter)], 'idle', [W])
            self.frame = 0
        G = self.states[self.frame]
        F = Frame(W)
        neck = np.array(W['neck'])[:3, 3]
        out = _grid_out(G.reshape(-1, 3), self.rows, self.cols, neck, F.up).reshape(G.shape)
        self.corners = (G[1, 0], G[1, -1], F)
        self.worn = G   # as it lies this frame: a hood's mantle is sewn to its yoke
        self.set(G, out)


def _grid_out(g, rows, cols, at, up):
    """A grid's way out at each point, turned away from the upright line through `at` (a body's middle)."""
    import cloth
    n = cloth.grid_normals(g, rows, cols)
    o = g - at
    o = o - np.outer(o @ up, up)
    return n if (n * o).sum() >= 0 else -n


class Hood(Drape):
    """A hood over the head, open at the face, as Daggerfall's mages wear theirs: roomy over the skull, rising behind
    to a soft peak, its rim standing forward round the face so the face lies deep in its shade, folds
    running from the crown. Worn alone (a robe's) its cowl falls over the shoulders; on a cloak (`cloak`) its foot
    spreads over the cloak's yoke as a short mantle and is sewn to it there, so hood and cloak are one cloth. `skull`
    is the shaped skull's rest points."""

    def __init__(self, name, mats, skull, ease=0.048, tail=0.035, opening=0.72, peak=0.07, brim=0.045,
                 flare=0.4, rows=24, cols=56, thick=0.004, cloak=None, neck=None, seed=2.3):
        from rig import rest
        self.head = np.array(rest('head'))
        c = skull.mean(axis=0)
        self.c = np.array([c[0], c[1] + 0.012, c[2] + 0.004])
        q = skull - self.c
        self.radii = np.array([np.abs(q[:, 0]).max() + ease * 1.15, np.abs(q[:, 1]).max() + ease,
                               np.abs(q[:, 2]).max() * 0.94 + ease * 0.8])
        self.tail, self.opening, self.cloak, self.seed = tail, opening, cloak, seed
        self.peak, self.brim, self.flare = peak, brim, flare
        # on a garment (a robe's top), its foot is sewn to that garment's neckline: its highest edge
        self.neck, self.neck_loop = neck, None
        if neck is not None:
            loops = [lp for lp in getattr(neck, 'loops', []) if len(lp) > 8]
            self.neck_loop = max(loops, key=lambda lp: neck.rest[lp, 2].mean()) if loops else None
        self.needs = [neck.ob.name] if neck is not None else []   # the skins it is posed with
        # round the head from one side of the face round the back to the other: the face is -Y
        self.th = -math.pi / 2 + np.linspace(opening, TAU - opening, cols)
        super().__init__(name, mats, rows, cols, False, thick, border=(0, 0, 2))

    def _head_rows(self, H, rows):
        th = self.th
        lats = np.linspace(1.55, -0.62, rows)   # from its crown, closed, to the jaw
        back = np.clip(np.sin(th), 0, 1)                 # 1 at the back of the head
        edge = np.clip(1 - np.abs(np.linspace(-1, 1, len(th))), 0, 1)   # 0 at the rim, 1 behind
        rim = (1 - edge) ** 3
        g, o = [], []
        for lat in lats:
            s = (1.55 - lat) / 2.17                         # 0 at the crown, 1 at the jaw
            p = np.stack([np.cos(lat) * np.cos(th), np.cos(lat) * np.sin(th), np.full(len(th), math.sin(lat))], axis=1)
            # roomy below the ears and widening down into its foot, a bell from its peak, never pinched at the neck
            roomy = 1 + self.flare * np.clip(-lat / 0.62, 0, 1) ** 1.3 + 0.05 * back * np.clip((0.4 - lat) / 1.0, 0, 1)
            p = p * self.radii * roomy[:, None]
            fall = back ** 3 * np.clip((lat - 0.2) / 1.0, 0, 1)   # its tail, gathered behind and falling soft
            p[:, 1] += self.tail * fall
            p[:, 2] -= self.tail * 0.6 * fall * np.clip((1.2 - lat) / 0.6, 0, 1)
            # its peak, up and back over the crown; its rim forward round the face
            crown = max(0.0, 1 - abs(lat - 0.95) / 0.5)
            p[:, 1] += self.peak * 0.8 * back ** 2 * crown
            p[:, 2] += self.peak * 0.5 * back ** 2 * crown
            p[:, 1] -= self.brim * rim * np.clip((lat + 0.4) / 0.6, 0, 1)
            out = p / np.maximum(np.linalg.norm(p, axis=1, keepdims=True), 1e-9)
            fold = 0.011 * s ** 1.2 * edge * ripple(th + 0.3 * s, 6.0, self.seed) * (0.6 + 0.4 * np.cos(th - 1.1))
            lip = np.zeros(len(th))
            lip[:2], lip[-2:] = 0.006, 0.006   # the rim turned back round the face
            p = p + out * (fold + lip)[:, None]
            g.append((self.c + p - self.head) @ H[:3, :3].T + H[:3, 3])
            o.append(out @ H[:3, :3].T)
        return np.array(g), np.array(o)

    def update(self, W, fighter):
        H = np.array(W['head'])
        neck = np.array(W['neck'])[:3, 3]
        rows, cols = self.rows, self.cols
        F = Frame(W)
        foot = 6
        head, hout = self._head_rows(H, rows - foot)
        grid, outv = np.zeros((rows, cols, 3)), np.zeros((rows, cols, 3))
        grid[:rows - foot], outv[:rows - foot] = head, hout
        last = head[-1]
        ring = last - neck
        flat = ring - F.up * (ring @ F.up)[:, None]
        way = flat / np.maximum(np.linalg.norm(flat, axis=1, keepdims=True), 1e-9)
        collar, over = None, 0.004
        if self.cloak is not None and self.cloak.worn is not None:   # a mantle over the cloak's yoke, sewn to it
            collar, over = self.cloak.worn[MANTLE], 0.014
        elif self.neck_loop is not None:   # sewn to the garment's neckline, as it stands
            from body import coords
            collar = coords(self.neck.me)[self.neck_loop]
        if collar is not None:
            # each column meets the collar where it lies round the neck
            q = collar - neck
            ang_c = np.arctan2(q @ F.y, q @ F.x)
            ang_h = np.arctan2(flat @ F.y, flat @ F.x)
            order = np.argsort(ang_c)
            seam = np.stack([np.interp(ang_h, ang_c[order], collar[order, k], period=TAU) for k in range(3)], axis=1)
            o = seam - neck
            o = o - np.outer(o @ F.up, F.up)
            o /= np.maximum(np.linalg.norm(o, axis=1, keepdims=True), 1e-9)
            seam = seam + o * over - F.up * 0.004   # its foot laid over what it is sewn to, outside it
            for j in range(foot):
                s = (j + 1) / foot
                e = s * s * (3 - 2 * s)
                grid[rows - foot + j] = last + (seam - last) * e + way * 0.01 * math.sin(s * math.pi)
                outv[rows - foot + j] = way
        else:
            # alone, its cowl spreads over the shoulders round the neck, hanging down the world in uneven folds
            for j in range(foot):
                s = (j + 1) / foot
                folds = 0.012 * s * ripple(self.th + 0.5 * s, 9.0, self.seed + 1)
                grid[rows - foot + j] = last + flat * (0.42 * s) + way * folds[:, None] - F.up * (0.05 * s)
                outv[rows - foot + j] = way
        self.set(grid, outv)


class Clasp(Drape):
    """A cloak's clasp at the throat: a gilt boss at each of its front corners and a cord between them across the
    chest, drawn each frame from where the cloak hangs (`cloak`)."""

    def __init__(self, name, mats, cloak, rows=10, cols=6):
        self.cloak = cloak
        super().__init__(name, [mats[3]] + list(mats[1:]), rows, cols, True, 0.002, slots=(0, 0))

    def update(self, W, fighter):
        a, b, F = self.cloak.corners
        rows, cols = self.rows, self.cols
        grid, outv = np.zeros((rows, cols, 3)), np.zeros((rows, cols, 3))
        fwd = -F.y
        for i in range(rows):
            t = i / (rows - 1)
            c = (a + (b - a) * t + fwd * (0.006 + 0.008 * math.sin(t * math.pi))
                 - F.up * 0.012 * math.sin(t * math.pi))   # a short cord across the throat, sagging a little
            rad = 0.003 + 0.009 * max(0.0, 1 - min(t, 1 - t) * 8)                      # a boss at each end
            u, w = F.up, fwd
            ring = np.array([c + rad * (math.cos(q) * u + math.sin(q) * w) for q in np.linspace(0, TAU, cols, endpoint=False)])
            grid[i] = ring
            outv[i] = (ring - c) / max(rad, 1e-9)
        self.set(grid, outv)


class Fur(Drape):
    """A fur collar over a cloak's shoulders, as Daggerfall's formal cloak wears one: thick, soft fur round the neck
    and over the shoulders' tops, the cloak's cloth showing below it, swelling and thinning in a few lumps. Tufts
    finer than a pixel only speckle, as the armour's fur shows (armourkit.py `fleece`)."""

    def __init__(self, name, mats, cloak, rows=7, cols=150):
        self.cloak = cloak
        rng = np.random.default_rng(5)
        self.lumps, self.phase = int(rng.integers(4, 7)), rng.uniform(0.0, TAU)
        super().__init__(name, [mats[7]] + list(mats[1:]), rows, cols, False, 0.004, slots=(0, 0))

    def update(self, W, fighter):
        g = self.cloak.verts[:self.cloak.rows * self.cloak.cols].reshape(self.cloak.rows, self.cloak.cols, 3)
        F = Frame(W)
        neck = np.array(W['neck'])[:3, 3]
        rows, cols = self.rows, self.cols
        k = np.linspace(0, self.cloak.cols - 1, cols).astype(int)
        grid, outv = np.zeros((rows, cols, 3)), np.zeros((rows, cols, 3))
        swell = 1.0 + 0.2 * np.sin(self.lumps * np.linspace(0.0, TAU, cols) + self.phase)
        for i in range(rows):
            t = i / (rows - 1)
            base = g[min(int(t * 4), self.cloak.rows - 1), k]   # the collar and the shoulders' tops, the cloth below
            o = base - neck
            o = o - F.up * (o @ F.up)[:, None]
            o /= np.maximum(np.linalg.norm(o, axis=1, keepdims=True), 1e-9)
            puff = 0.042 * math.sin(t * math.pi) ** 0.7 * swell
            grid[i] = base + o * puff[:, None] + F.up * 0.012 * (1 - t)
            outv[i] = o
        self.set(grid, outv)


class Bell(Drape):
    """A sleeve belling from the elbow (a robe's, a kimono's): rings round the forearm from `start` (a height at rest
    on the upper arm) for `length` down it, widening toward the cuff and sagging down the world under their weight,
    their folds deepening; the forearm and the hand always inside."""
    reads_hands = True

    def __init__(self, name, mats, side, start=1.24, length=0.32, ease=0.018, flare=0.07, rows=12, cols=36):
        self.side, self.start, self.length, self.ease, self.flare = side, start, length, ease, flare
        super().__init__(name, mats, rows, cols, True, 0.003, border=(0, 1, 0))

    def update(self, W, fighter):
        from rig import rest
        s = self.side
        U, Fa, Hd = (np.array(W[j]) for j in (f'uarm_{s}', f'farm_{s}', f'hand_{s}'))
        joints = [U[:3, 3], Fa[:3, 3], Hd[:3, 3]]
        rest_z = [rest(f'uarm_{s}')[2], rest(f'farm_{s}')[2], rest(f'hand_{s}')[2]]
        F = Frame(W)
        rows, cols = self.rows, self.cols
        grid, outv = np.zeros((rows, cols, 3)), np.zeros((rows, cols, 3))
        th = np.linspace(0, TAU, cols, endpoint=False)
        pts = arm_points(fighter, s, getattr(self, 'over', None), getattr(self, 'rigid', ()))
        for i in range(rows):
            t = i / (rows - 1)
            z = self.start - self.length * t
            # the point on the arm's line at this height at rest, and its way along the arm
            if z >= rest_z[1]:
                u = (rest_z[0] - z) / (rest_z[0] - rest_z[1])
                c, way = joints[0] + (joints[1] - joints[0]) * u, joints[1] - joints[0]
            else:
                u = min((rest_z[1] - z) / (rest_z[1] - rest_z[2]), 1.0)
                c, way = joints[1] + (joints[2] - joints[1]) * u, joints[2] - joints[1]
            way = _unit(way)
            a = _unit(np.cross(way, F.up) if abs(way @ F.up) < 0.95 else np.cross(way, F.x))
            b = np.cross(way, a)
            near = pts[np.abs((pts - c) @ way) < 0.02]
            q = near - c
            arm_r = np.linalg.norm(q - np.outer(q @ way, way), axis=1)
            # the arm's own girth here: a bent forearm lying beside the upper arm is no part of it
            own = arm_r < 0.095   # a sleeve over a clothed arm stands out to here
            ease = 0.002 + (self.ease - 0.002) * min(1.0, t / 0.3)   # sewn to the sleeve at its top, then belling
            base = min(np.percentile(arm_r[own], 96) if own.sum() > 8 else 0.045, 0.06) + ease
            if own.sum() > 8:   # and clear of the arm's outline, and of the sleeve under it, every way round
                base = np.maximum(base, hull_reach(np.stack([q[own] @ a, q[own] @ b], axis=1), np.zeros(2), th) + 0.008)
            r = base + self.flare * t ** 1.2 * (0.35 + 0.65 * F.stand)   # lying, it settles on the arm
            fold = 1 + 0.14 * t * ripple(th + 0.4 * t, 7.0, 3.3 + (self.side == 'L'))
            ring = c + (np.outer(np.cos(th), a) + np.outer(np.sin(th), b)) * (r * fold)[:, None]
            # it sags: the cloth below the arm falls away from it toward the ground
            down = np.array([0.0, 0.0, 1.0])   # it sags toward the ground, whichever way the body lies
            low = np.clip(-(np.cos(th)[:, None] * a + np.sin(th)[:, None] * b) @ down, 0, 1)
            ring = ring - np.outer(low * 0.06 * t ** 1.5, down)
            ring[:, 2] = np.maximum(ring[:, 2], 0.004)
            grid[i] = ring
            outv[i] = np.outer(np.cos(th), a) + np.outer(np.sin(th), b)
        self.set(grid, outv)


class Tails(Drape):
    """A cord's knot at the waist and its two ends hanging from it (a robe's rope belt), each end down the world from
    the knot to `length`, swinging a little with the hips, a tassel at each foot. Laid from the pelvis as it stands:
    `at` the knot's place at rest (the belt's front), `side` how far apart the ends hang."""

    def __init__(self, name, mats, at=(0.03, -0.13, 1.1), length=0.32, radius=0.006, side=0.03, rows=14, cols=8):
        from rig import rest
        self.at, self.length, self.radius, self.side = np.array(at), length, radius, side
        self.pelvis = np.array(rest('pelvis'))
        self.rows1 = rows
        super().__init__(name, mats, rows * 2 + 2, cols, True, 0.002, slots=(6, 6))

    def update(self, W, fighter):
        P = np.array(W['pelvis'])
        F = Frame(W)
        knot = (self.at - self.pelvis) @ P[:3, :3].T + P[:3, 3]
        fwd = _unit(-F.y)
        th = np.linspace(0, TAU, self.cols, endpoint=False)
        laid = None
        if mounted(fighter):   # astride, each end laid over the saddle's front as cloth falls on it
            ends = np.array([knot + F.x * s * self.side for s in (-1, 1)])
            under = posed_points(fighter, getattr(self, 'over', None), getattr(self, 'rigid', ()),
                                 below=self.at[2] + 0.04)
            laid = [hang(ends[k:k + 1], fwd[None, :], F.up,
                         np.full(self.rows1 - 1, self.length * (0.8 + 0.2 * k) / (self.rows1 - 1)), under,
                         horse_points()[0], 0.012)[:, 0] for k in (0, 1)]
        rows = []
        for k, s in enumerate((-1, 1)):
            for i in range(self.rows1):
                t = i / (self.rows1 - 1)
                c = (knot + F.x * s * self.side * (0.3 + 0.7 * t) + fwd * 0.01 * math.sin(t * 2.5)
                     - np.array([0.0, 0.0, 1.0]) * self.length * (0.8 + 0.2 * k) * t) if laid is None else laid[k][i]
                c[2] = max(c[2], 0.004)
                rad = self.radius * (1.6 if i == 0 else 1.0) * (1.8 if t > 0.92 else 1.0)   # the knot; the tassel
                a, b = F.x, fwd
                rows.append(c + np.outer(np.cos(th), a) * rad + np.outer(np.sin(th), b) * rad)
            if k == 0:
                rows.append(rows[-1])   # the two ends' seam: collapsed between them
                rows.append(rows[0])
        grid = np.array(rows[:self.rows])
        outv = grid - grid.mean(axis=1, keepdims=True)
        outv /= np.maximum(np.linalg.norm(outv, axis=2, keepdims=True), 1e-9)
        self.set(grid, outv)


class Cord(Drape):
    """A cord round a drape (a robe's rope belt round its skirt's top): a thick twisted tube along that drape's row
    `row`, a little outside it."""

    def __init__(self, name, mats, under, row=1, radius=0.007, cols=8):
        self.under, self.row, self.radius = under, row, radius
        super().__init__(name, mats, under.cols, cols, True, 0.002, slots=(6, 6))

    def update(self, W, fighter):
        g = self.under.verts[:self.under.rows * self.under.cols].reshape(self.under.rows, self.under.cols, 3)
        line = g[self.row]
        c = line.mean(axis=0)
        out = line - c
        out[:, 2] = 0
        out /= np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-9)
        th = np.linspace(0, TAU, self.cols, endpoint=False)
        twist = np.arange(len(line)) * 1.3   # its strands twisted round it
        grid = np.array([p + o * self.radius * 1.2
                         + self.radius * (np.outer(np.cos(th + tw), o) + np.outer(np.sin(th + tw), [0, 0, 1.0]))
                         * (1 + 0.15 * np.cos(3 * (th + tw)))[:, None]
                         for p, o, tw in zip(line, out, twist)])
        outv = grid - grid.mean(axis=1, keepdims=True)
        outv /= np.maximum(np.linalg.norm(outv, axis=2, keepdims=True), 1e-9)
        self.set(grid, outv)
