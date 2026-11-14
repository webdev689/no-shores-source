"""Cloth that swings: a cut of cloth laid flat as a grid of points, sewn where it is held, falling under gravity and
through the air, kept off the body as the body moves through an animation's keys.

Position-based. Each step moves every point on by its speed and its weight, then puts back each length between
neighbours as the cloth was cut: hard against stretching, soft against crushing, so the cloth folds rather than
shrinks. Between, each point is held on its side of the surface it lay against, so pulled hard it never passes
through; then it is lifted off the nearest surface, with friction. A lift moves a point and never throws it. A
grid's lengths fall into batches that share no point, so each batch is put back at once."""
import math

import numpy as np

GRAVITY = np.array([0.0, 0.0, -9.81])


def _batches(rows, cols):
    """Each pair of neighbours a grid holds the length of, in batches that share no point: its sides (along a row and
    down a column), its diagonals (shear) and its next-but-one (bend)."""
    idx = np.arange(rows * cols).reshape(rows, cols)
    out = []
    for p in (0, 1):
        a = idx[:, p:cols - 1:2]
        out.append((a.ravel(), (a + 1).ravel(), 'side'))
        a = idx[p:rows - 1:2, :]
        out.append((a.ravel(), (a + cols).ravel(), 'side'))
        a = idx[p:rows - 1:2, :cols - 1]
        out.append((a.ravel(), (a + cols + 1).ravel(), 'shear'))
        a = idx[p:rows - 1:2, 1:]
        out.append((a.ravel(), (a + cols - 1).ravel(), 'shear'))
        a = idx[:, [k for k in range(cols - 2) if (k // 2) % 2 == p]]
        out.append((a.ravel(), (a + 2).ravel(), 'bend'))
        a = idx[[k for k in range(rows - 2) if (k // 2) % 2 == p], :]
        out.append((a.ravel(), (a + 2 * cols).ravel(), 'bend'))
    return [(a, b, kind) for a, b, kind in out if len(a)]


def grid_normals(X, rows, cols):
    """The way out of a grid of points at each, across its rows and down its columns (unit, its sign the grid's)."""
    G = X.reshape(rows, cols, 3)
    dr = np.gradient(G, axis=0)
    dc = np.gradient(G, axis=1)
    n = np.cross(dc, dr).reshape(-1, 3)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


class Surface:
    """What the cloth lies on at one moment: points of the body's surfaces and the way out of each, searched by
    nearness."""

    def __init__(self, P, N):
        from scipy.spatial import cKDTree
        self.P, self.N = P, N
        self.tree = cKDTree(P)

    def planes(self, X, reach=0.05):
        """The plane each point of `X` lies against, where it lies within `reach` of the surface: its nearest point
        and the way out there, read before the point is moved."""
        d, i = self.tree.query(X, distance_upper_bound=reach)
        j = np.flatnonzero(np.isfinite(d))
        return j, self.P[i[j]], self.N[i[j]]

    def lift(self, X, X0, margin, friction, reach=0.12, kick=None):
        """Every point of `X` lifted to `margin` off the surface where it lies within it, along the way out at the
        surface's nearest point, and held back there by `friction` against sliding (from where it was, `X0`). Each
        lift is added to `kick`: a lift moves a point, it never throws it."""
        d, i = self.tree.query(X, distance_upper_bound=reach)
        near = np.isfinite(d)
        if not near.any():
            return
        j = np.flatnonzero(near)
        n = self.N[i[near]]
        s = ((X[j] - self.P[i[near]]) * n).sum(axis=1)
        under = margin - s
        hit = (under > 0) & (s > -0.1)   # deeper than a limb is thick, the point is beside a surface, never in it
        if not hit.any():
            return
        j, n, under = j[hit], n[hit], under[hit]
        X[j] += n * under[:, None]
        if kick is not None:
            kick[j] += n * under[:, None]
        # friction, as the push that lifted it bears on it: held still under `friction` times that push, slowed
        # by it beyond (static, then sliding)
        move = X[j] - X0[j]
        slide = move - n * (move * n).sum(axis=1)[:, None]
        far = np.linalg.norm(slide, axis=1)
        grip = friction * under
        keep = np.where(far <= grip, 1.0, np.minimum(0.6 * grip / np.maximum(far, 1e-12), 1.0))
        X[j] -= slide * keep[:, None]


def outside(P, h=0.01):
    """Which of the points `P` (a body's surfaces, sampled finer than `h`) lie open to the air, and the way out of the
    body at each: never on skin folded in on itself where a joint bends (an arm's run on into the shoulder), sealed
    inside the body, which a cloth caught there would lie on inside it. The air is every cell of a grid round them
    that reaches its edge without crossing a surface."""
    from scipy import ndimage
    lo = P.min(axis=0) - 4 * h
    at = np.floor((P - lo) / h).astype(np.int64)
    solid = np.zeros(at.max(axis=0) + 5, bool)
    solid[tuple(at.T)] = True
    solid = ndimage.binary_dilation(solid)
    cells, _ = ndimage.label(~solid)
    edge = np.unique(np.concatenate([cells[0].ravel(), cells[-1].ravel(), cells[:, 0].ravel(), cells[:, -1].ravel(),
                                     cells[:, :, 0].ravel(), cells[:, :, -1].ravel()]))
    air = np.isin(cells, edge[edge > 0])
    # the way out of the body at each point, from the air round it: where skin folds over itself at a bent joint its
    # triangles turn inside out, and their own way out points into the body
    grad = np.gradient(ndimage.gaussian_filter(air.astype(float), 1.5))
    out = np.stack([g[tuple(at.T)] for g in grad], axis=1)
    out /= np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-12)
    air = ndimage.binary_dilation(air, iterations=2)
    return air[tuple(at.T)], out


def hold(X, planes, margin, kick):
    """Every point of `X` kept `margin` on the outside of the plane it lay against (`Surface.planes`): a point pulled
    hard against what it lies on stays on its side of it and is never drawn through it."""
    j, P, N = planes
    if not len(j):
        return
    s = ((X[j] - P) * N).sum(axis=1)
    under = margin - s
    hit = under > 0
    if hit.any():
        push = N[hit] * under[hit][:, None]
        X[j[hit]] += push
        kick[j[hit]] += push


class Cloth:
    """A cut of cloth: `flat` (rows, cols, 2 or 3) its grid laid out as cut, in metres. `stretch`, `shear` and `bend`
    how hard each kind of length is put back, `crush` how much less a side and a bend resist being shortened than
    stretched (a cloth folds where it is crowded). `drag` the air's hold across its face and along it."""

    def __init__(self, flat, stretch=1.0, shear=0.5, bend=0.18, crush=0.12, drag=(2.4, 0.25), iters=10):
        self.rows, self.cols = flat.shape[:2]
        f = flat.reshape(self.rows * self.cols, -1)
        self.pairs = []
        for a, b, kind in _batches(self.rows, self.cols):
            self.pairs.append([a, b, np.linalg.norm(f[b] - f[a], axis=1), kind])
        self.cut = [p[2].copy() for p in self.pairs]
        self.guess = None
        self.k = {'side': stretch, 'shear': shear, 'bend': bend}
        self.crush, self.drag, self.iters = crush, drag, iters

    def ease(self, X, u):
        """Its lengths at rest `u` of the way from those of `X` (a first guess at how it hangs, kept from the first
        call) to its cut, so it is drawn onto the body from the guess and never snaps."""
        if self.guess is None:
            self.guess = [np.linalg.norm(X[p[1]] - X[p[0]], axis=1) for p in self.pairs]
        for p, was, cut in zip(self.pairs, self.guess, self.cut):
            p[2] = was + (cut - was) * u

    def keep(self, X, w):
        """Each length put back, batch by batch."""
        for a, b, L, kind in self.pairs:
            d = X[b] - X[a]
            n = np.sqrt((d * d).sum(axis=1))
            c = n - L
            k = self.k[kind]
            if kind != 'shear':
                k = np.where(c > 0, k, k * self.crush)
            wa, wb = w[a], w[b]
            s = k * c / np.maximum((wa + wb) * n, 1e-12)
            corr = d * s[:, None]
            X[a] += corr * wa[:, None]
            X[b] -= corr * wb[:, None]

    def step(self, X, Xp, dt, w, pins, pin_at, surface, wind, margin, friction, damp, gravity=GRAVITY):
        """One step of `dt`: moved on, its lengths kept, its pins sewn, lifted off `surface`. Gives (X, X before)."""
        n = grid_normals(X, self.rows, self.cols)
        v = (X - Xp) / dt
        rel = v - wind
        across, along = self.drag
        acc = gravity - across * (rel * n).sum(axis=1)[:, None] * n - along * rel
        Xn = X + (X - Xp) * math.exp(-damp * dt) + acc * dt * dt
        Xn[pins] = pin_at
        kick = np.zeros_like(X)
        planes = surface.planes(X)
        for it in range(self.iters):
            self.keep(Xn, w)
            hold(Xn, planes, margin, kick)
            Xn[pins] = pin_at
        surface.lift(Xn, X, margin, friction, kick=kick)
        Xn[pins] = pin_at
        return Xn, X + kick


def _held(key, R, c, follow):
    """A key's surfaces, pins and air as the frame (`R` its axes, `c` its origin) it is carried in sees them, and its
    gravity `follow` of the way from the world's down to the frame's own (its -Z)."""
    g = (1 - follow) * (GRAVITY @ R) + follow * np.array([0.0, 0.0, -9.81])
    return {**key, 'P': (key['P'] - c) @ R, 'N': key['N'] @ R, 'pin': (key['pin'] - c) @ R, 'wind': key['wind'] @ R,
            'gravity': g * 9.81 / max(np.linalg.norm(g), 1e-9)}


def carry(cloth, X, keys, pins, per_key, loop, margin=0.012, friction=0.35, damp=1.2, settle=420, cycles=3,
          step_reach=0.006, frames=None, rest=0, follow=0.0):
    """`cloth` hung from first guess `X` (its points, rows by columns) and carried through `keys`: each a dict of the
    surfaces it lies on (`P` points, `N` the way out of each, the same points in every key, `open` those open to the
    air there), where its `pins` are sewn (`pin`), and the air's flow past it (`wind`). It first settles on the first
    key, its lengths drawn from the guess's to its cut; then it is carried from key to key, `per_key` seconds apart,
    in steps short enough that the surfaces move no more than `step_reach` a step, and `rest` steps more at each key
    to come to rest there. A `loop` goes round `cycles` times and gives its last. Gives its points at each key.

    `frames` (one a key, each its axes and origin): it is carried in what holds it (a cloak in the chest), which moves
    it as it moves, so a body turned or set down elsewhere from key to key, as a sprite's fitted poses are, never
    throws it; gravity turns in that frame as the body leans, `follow` of the way back toward the frame's own down,
    so a body leant far over keeps the cloth along it as a sprite draws it."""
    X = np.array(X, float).reshape(-1, 3)
    if frames is not None:
        keys = [_held(k, R, c, follow) for k, (R, c) in zip(keys, frames)]
        X = (X - frames[0][1]) @ frames[0][0]
    else:
        keys = [{**k, 'gravity': GRAVITY} for k in keys]
    w = np.ones(len(X))
    w[pins] = 0.0
    k0 = keys[0]
    s0 = Surface(k0['P'][k0['open']], k0['N'][k0['open']])
    Xp = X.copy()
    dt0 = 1.0 / 120
    cloth.guess = None
    grow = int(0.6 * settle)
    for s in range(settle):
        u = min(1.0, s / grow)
        cloth.ease(X, u * u * (3 - 2 * u))
        X, Xp = cloth.step(X, Xp, dt0, w, pins, k0['pin'], s0, k0['wind'], margin, friction, damp * 4, k0['gravity'])
    n = len(keys)

    def world(x, k):
        if frames is not None:
            x = x @ frames[k][0].T + frames[k][1]
        return x.reshape(cloth.rows, cloth.cols, 3)

    if n == 1:   # a still pose: it hangs at rest
        for s in range(160):
            X, Xp = cloth.step(X, Xp, dt0, w, pins, k0['pin'], s0, k0['wind'], margin, friction, damp * 2,
                               k0['gravity'])
        return [world(X, 0)]
    out = [None] * n
    out[0] = X.copy()
    legs = [(k, (k + 1) % n) for k in range(n)] * cycles if loop else [(k, k + 1) for k in range(n - 1)]
    for leg, (a, b) in enumerate(legs):
        A, B = keys[a], keys[b]
        reach = float(np.percentile(np.linalg.norm(B['P'] - A['P'], axis=1), 99.5))
        reach = max(reach, float(np.linalg.norm(B['pin'] - A['pin'], axis=1).max()))
        steps = int(np.clip(math.ceil(reach / step_reach), 10, 90))
        dt = per_key / steps
        for s in range(1, steps + 1):
            u = s / steps
            on = A['open'] | B['open']   # open to the air at either key
            P = A['P'][on] + (B['P'][on] - A['P'][on]) * u
            N = A['N'][on] + (B['N'][on] - A['N'][on]) * u
            N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
            surf = Surface(P, N)
            pin = A['pin'] + (B['pin'] - A['pin']) * u
            wind = A['wind'] + (B['wind'] - A['wind']) * u
            g = A['gravity'] + (B['gravity'] - A['gravity']) * u
            g *= 9.81 / max(np.linalg.norm(g), 1e-9)
            X, Xp = cloth.step(X, Xp, dt, w, pins, pin, surf, wind, margin, friction, damp, g)
        for s in range(rest):   # come to rest at the key, still: a frame shows it hanging, never thrown
            X, Xp = cloth.step(X, Xp, dt0, w, pins, B['pin'], surf, B['wind'], margin, friction, damp * 4,
                               B['gravity'])
        if not loop or leg >= len(legs) - n:
            out[b] = X.copy()
    return [world(x, k) for k, x in enumerate(out)]
