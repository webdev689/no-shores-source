"""The clothing's geometry kit: a garment that clings is the body's own surface a few millimetres out, cut cleanly
along the garment's edges and skinned with the body's own weights, so it bends exactly as the body under it does and
never meets it (`Shell`). Its edges are where a field over the body crosses nought: a hem's height, a neckline, a
sleeve's end, an open front. The cut runs through the body's triangles at that crossing, so an edge is a clean line
whatever the body's mesh, and each new vertex takes its neighbours' weights as it takes their place.

A shell is given its cloth's thickness, its edges turned and hemmed, its folds laid in along its normals. What hangs
free of the body - a cloak, a skirt, a robe below the belt - is drape.py's, made again each frame."""
import math

import numpy as np

import anatomy
from body import normals

TAU = 2 * math.pi
PIECE = {name: k for k, name in enumerate(anatomy.PIECES)}
# while a garment is made, the least it stands out at each of the body's vertices (or None): enough to clear what can
# be worn under it, so nothing under it ever shows through
FLOOR = None


def triangles(me):
    """A mesh's faces as triangles, each polygon fanned from its first corner."""
    tris = []
    for p in me.polygons:
        vs = list(p.vertices)
        for j in range(1, len(vs) - 1):
            tris.append((vs[0], vs[j], vs[j + 1]))
    return np.array(tris, dtype=np.int64)


def cut(f, tris, attrs):
    """The part of a triangle mesh where the field `f` (one a vertex) is below nought, cut exactly along its zero line:
    a triangle across it keeps its inside, the crossing on each edge a new vertex whose attributes (`attrs`, arrays a
    row a vertex) are its two ends' in proportion. Gives (attrs, triangles, the boundary's edges)."""
    f = np.asarray(f, float)
    inside = f < 0
    rows = [np.asarray(a, float) for a in attrs]
    extra = [[] for _ in rows]
    made = {}
    n0 = len(f)

    def mid(a, b):
        key = (a, b) if a < b else (b, a)
        if key not in made:
            t = f[a] / (f[a] - f[b])
            for k, r in enumerate(rows):
                extra[k].append(r[a] + (r[b] - r[a]) * t)
            made[key] = n0 + len(made)
        return made[key]
    out = []
    for tri in tris:
        ins = inside[tri]
        n = int(ins.sum())
        if n == 3:
            out.append(tuple(tri))
        elif n == 0:
            continue
        else:
            k = int(np.argmax(ins)) if n == 1 else int(np.argmin(ins))   # the odd one out
            a, b, c = tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]
            ab, ac = mid(a, b), mid(a, c)
            if n == 1:
                out.append((a, ab, ac))
            else:
                out.append((ab, b, c))
                out.append((ab, c, ac))
    attrs_out = [np.concatenate([r, np.array(e).reshape(-1, r.shape[1])]) if e else r for r, e in zip(rows, extra)]
    t = np.array(out, dtype=np.int64).reshape(-1, 3)
    used = np.unique(t)
    remap = np.full(len(attrs_out[0]), -1)
    remap[used] = np.arange(len(used))
    attrs_out = [r[used] for r in attrs_out]
    t = remap[t]
    return attrs_out, t, boundary(t)


def boundary(tris):
    """A triangle mesh's open edges, each as its triangle runs it: the loops a cut leaves."""
    from collections import Counter
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    key = np.sort(e, axis=1)
    count = Counter(map(tuple, key))
    return np.array([edge for edge, k in zip(e, key) if count[tuple(k)] == 1], dtype=np.int64).reshape(-1, 2)


def loops(edges):
    """Open edges joined into loops of vertices, each in its own order."""
    nxt = {int(a): int(b) for a, b in edges}
    out, seen = [], set()
    for start in list(nxt):
        if start in seen:
            continue
        loop, v = [], start
        while v not in seen and v in nxt:
            seen.add(v)
            loop.append(v)
            v = nxt[v]
        if len(loop) > 2:
            out.append(np.array(loop))
    return out


def vertex_normals(co, tris):
    n = np.zeros_like(co)
    fn = np.cross(co[tris[:, 1]] - co[tris[:, 0]], co[tris[:, 2]] - co[tris[:, 0]])
    for k in range(3):
        np.add.at(n, tris[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def smooth_field(f, tris, rounds=2):
    """A field over a mesh, each vertex's value eased toward its neighbours' a few rounds: an edge drawn by it runs
    smooth over the body's triangles instead of stepping with them."""
    f = np.asarray(f, float).copy()
    n = len(f)
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    for _ in range(rounds):
        s, c = np.zeros(n), np.zeros(n)
        np.add.at(s, e[:, 0], f[e[:, 1]])
        np.add.at(c, e[:, 0], 1.0)
        f = 0.5 * f + 0.5 * s / np.maximum(c, 1)
    return f


def bridge(w, alpha, tris, reach=0.6, rounds=12):
    """A shell's weights eased across the creases where pieces meet (an armpit, the crotch), so its cloth bridges
    the crease as cloth does instead of following the skin into it: a vertex as far as it lies near a blend of pieces
    takes its neighbours' weights, round after round."""
    mix = np.clip((1.0 - alpha.max(axis=1)) / 0.5, 0.0, 1.0)
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    near = mix.copy()
    for _ in range(rounds // 2):   # how near a crease each vertex is, spread a few rings out from it
        s = np.zeros(len(near))
        np.maximum.at(s, e[:, 0], near[e[:, 1]])
        near = np.maximum(near, s * 0.8)
    k = (reach * near)[:, None]
    w = w.copy()
    for _ in range(rounds):
        s, c = np.zeros_like(w), np.zeros(len(w))
        np.add.at(s, e[:, 0], w[e[:, 1]])
        np.add.at(c, e[:, 0], 1.0)
        w = (1 - k) * w + k * s / np.maximum(c, 1)[:, None]
    return w / np.maximum(w.sum(axis=1, keepdims=True), 1e-9)


def bridged(body, tris):
    """The body's weights bridged across its creases once, over the whole body (`bridge`): every garment takes them,
    so all that lies over one point of the body moves with it alike, and what lies outside stays outside in every
    pose."""
    if getattr(body, 'bridged_w', None) is None or len(body.bridged_w) != len(body.w):
        body.bridged_w = bridge(body.w, body.alpha, tris)
    return body.bridged_w


class Shell:
    """A garment that clings: the shaped body's surface where the garment's field is below nought, `push` metres out
    along its normals (a number or a function of the body's rest points), cut along the field's zero line. Its vertices
    carry the body's weights and its shares of the pieces, so it is skinned as the body is.

    `thick` gives it its cloth's thickness and closes its edges; `folds(p, n)` lays its folds in, metres along the
    normal; `slots(p)` its triangles' materials (a trim, a band)."""

    def __init__(self, body, field, push, thick=0.0025, folds=None, crease=0.014):
        self.body = body
        co = body.rest
        tris = triangles(body.me)
        n = normals(body.me)
        d = push(co) if callable(push) else np.full(len(co), float(push))
        # eased out where two pieces blend (the armpits, the crotch): there the body's own surfaces cross as it moves
        mix = np.clip((1.0 - body.alpha.max(axis=1)) * 2.5, 0.0, 1.0)
        d = d + crease * mix * mix * (3 - 2 * mix)
        if FLOOR is not None and len(FLOOR) == len(d):
            d = np.maximum(d, FLOOR)
        p = co + n * d[:, None]
        f = smooth_field(field(co, body.alpha), tris)
        (self.p, self.rest, self.n, self.w, self.alpha), self.t, self.edges = cut(
            f, tris, [p, co, n, bridged(body, tris), body.alpha])
        self.n /= np.maximum(np.linalg.norm(self.n, axis=1, keepdims=True), 1e-12)
        if folds is not None:
            self.p = self.p + self.n * folds(self.rest, self.n)[:, None]
        self.thick = thick
        self.extra = []   # (vertices, triangles, slot, weights, alpha): pieces laid on it, skinned as it is

    def loops(self):
        """The shell's edges as loops: a hem, a cuff, a neckline, an opening."""
        return loops(self.edges)

    def add(self, v, t, slot, src):
        """A piece laid on the shell (a hem's roll, a button, a lace), each of its vertices skinned as shell vertex
        `src[i]` is."""
        src = np.asarray(src)
        self.extra.append((np.asarray(v, float), np.asarray(t, np.int64), slot, self.w[src], self.alpha[src],
                           self.rest[src]))

    def roll(self, loop, radius, slot=1, n=5):
        """A rolled edge along a loop of the shell's vertices: a tube just proud of it."""
        pts = self.p[loop] + self.n[loop] * radius * 0.5
        m = len(pts)
        ring = []
        for i in range(m):
            t = pts[(i + 1) % m] - pts[i - 1]
            t /= max(np.linalg.norm(t), 1e-9)
            u = self.n[loop[i]]
            u = u - t * (u @ t)
            u /= max(np.linalg.norm(u), 1e-9)
            w = np.cross(t, u)
            ring.append([pts[i] + radius * (math.cos(a) * u + math.sin(a) * w) for a in np.linspace(0, TAU, n, endpoint=False)])
        v = np.array(ring).reshape(-1, 3)
        tris = []
        for i in range(m):
            j = (i + 1) % m
            for k in range(n):
                a, b, c, d = i * n + k, i * n + (k + 1) % n, j * n + (k + 1) % n, j * n + k
                tris += [(a, b, c), (a, c, d)]
        self.add(v, tris, slot, np.repeat(loop, n))

    def solid(self):
        """The shell and its cloth's thickness: an inner face `thick` in, its edges closed. Gives (vertices,
        triangles, weights, alpha, rest) before the pieces laid on it."""
        n = len(self.p)
        inner = self.p - self.n * self.thick
        v = np.concatenate([self.p, inner])
        t = [self.t, self.t[:, ::-1] + n]
        rim = []
        for a, b in self.edges:
            rim += [(a, b + n, b), (a, a + n, b + n)]
        if rim:
            t.append(np.array(rim, dtype=np.int64))
        return (v, np.concatenate(t), np.concatenate([self.w, self.w]), np.concatenate([self.alpha, self.alpha]),
                np.concatenate([self.rest, self.rest]))

    def skinned(self, name, mats, slots=None):
        """The shell as a Skinned object posed as the body is: its cloth (slot 0, or `slots(rest)` a triangle) and the
        pieces laid on it."""
        import bpy
        from body import Skinned
        v, t, w, alpha, rest = self.solid()
        m = np.zeros(len(t), dtype=np.int64) if slots is None else slots(rest[t].mean(axis=1))
        vs, ts, ms, ws, al, rs = [v], [t], [m], [w], [alpha], [rest]
        base = len(v)
        for ev, et, slot, ew, ea, er in self.extra:
            vs.append(ev)
            ts.append(et + base)
            ms.append(np.full(len(et), slot))
            ws.append(ew)
            al.append(ea)
            rs.append(er)
            base += len(ev)
        v, t, m = np.concatenate(vs), np.concatenate(ts), np.concatenate(ms)
        me = bpy.data.meshes.new(name)
        me.from_pydata(v.tolist(), [], t.tolist())
        me.validate()
        sk = Skinned(name, me, list(mats), self.body.joints, np.concatenate(ws))
        me.polygons.foreach_set('material_index', m.tolist())
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        me.update()
        sk.alpha, sk.axes = np.concatenate(al), self.body.axes
        sk.loops = self.loops()   # its edges' loops, by its outer vertices (the mesh's first): a hood's seam reads one
        sk.base = np.concatenate(rs)   # the body's point each vertex stands off
        sk.outer = len(self.p)   # its cloth's outer face, the mesh's first vertices
        return sk


def keep_out(body, skins):
    """Each posed shell of `skins` (made on `body`) kept outside the posed body: a vertex closer to the skin along the
    body's normal there than it stood at rest is set back out to its rest distance. Weights bridged over a crease
    smooth a bent elbow's or a lowered arm's bulge, and would let the cloth sink into it; every shell over one point
    of the body is set out alike, so what lies outside stays outside."""
    from scipy.spatial import cKDTree
    from body import coords
    co = coords(body.me)
    n = vertex_normals(co, _body_tris(body))
    tree = cKDTree(co)
    for sk in skins:
        base = getattr(sk, 'base', None)
        if base is None or len(base) != len(sk.rest):
            continue
        if getattr(sk, 'base_idx', None) is None:
            sk.base_idx = cKDTree(body.rest).query(base)[1]
            sk.base_off = np.linalg.norm(sk.rest - base, axis=1)
        p = coords(sk.me)
        i = sk.base_idx
        o = ((p - co[i]) * n[i]).sum(axis=1)
        low = o < sk.base_off
        moved = low.any()
        if moved:
            p[low] += n[i[low]] * (sk.base_off - o)[low, None]
        # and clear of whatever skin comes nearest, the other thigh rising into a crotch's cloth, an arm into a side
        j = tree.query(p)[1]
        o = ((p - co[j]) * n[j]).sum(axis=1)
        low = (j != i) & (o < sk.base_off)
        if low.any():
            p[low] += n[j[low]] * (sk.base_off - o)[low, None]
            moved = True
        if moved:
            sk.me.vertices.foreach_set('co', p.ravel())
            sk.me.update()


def _body_tris(body):
    if getattr(body, 'tris_all', None) is None:
        body.tris_all = triangles(body.me)
    return body.tris_all


def reach(body, skins, tol=0.015):
    """How far out from the body the shells `skins` (made on `body`) stand at each of its vertices, their rolled edges
    and the pieces laid on them (a buckle, a lace) too; -inf where none lies."""
    from scipy.spatial import cKDTree
    out = np.full(len(body.rest), -np.inf)
    tree = cKDTree(body.rest)
    for sk in skins:
        base = getattr(sk, 'base', None)
        if base is None or len(base) != len(sk.rest):
            continue
        dist, idx = tree.query(base, distance_upper_bound=tol)
        ok = np.isfinite(dist)
        np.maximum.at(out, idx[ok], np.linalg.norm(sk.rest - base, axis=1)[ok])
    return out


def spread(values, tris, rounds=3, margin=0.002):
    """A floor over the body: `values` (-inf where nothing lies) raised by `margin`, widened to each vertex's
    neighbours `rounds` times and eased within that widening, so cloth laid over it swells smoothly over what is
    under it and clears every point it widened over. Nought where nothing lies."""
    f = np.where(np.isfinite(values), values + margin, 0.0)
    e = np.concatenate([tris[:, [0, 1]], tris[:, [1, 2]], tris[:, [2, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    for _ in range(rounds):
        g = f.copy()
        np.maximum.at(g, e[:, 0], f[e[:, 1]])
        f = g
    n = len(f)
    for _ in range(rounds):
        s, c = np.zeros(n), np.zeros(n)
        np.add.at(s, e[:, 0], f[e[:, 1]])
        np.add.at(c, e[:, 0], 1.0)
        f = (f + s) / (1.0 + c)
    return f


# -- fields over the body: each negative where the garment is, its zero line the garment's edge

def share(alpha, *pieces):
    """A vertex's share of the pieces named (arm_L, torso, ...)."""
    return sum(alpha[:, PIECE[p]] for p in pieces)


def around(p, centre=(0.0, 0.0)):
    """Each point's direction round the body's upright axis, from +X toward +Y; the front is -pi/2."""
    return np.mod(np.arctan2(p[:, 1] - centre[1], p[:, 0] - centre[0]), TAU)


def facing(th, at=-math.pi / 2):
    """How far each direction is from `at`, in radians, 0..pi."""
    return np.abs((th - at + math.pi) % TAU - math.pi)


def blend(alpha, parts, outside=1.0):
    """A field made of each piece's own, by each vertex's shares: `parts` maps a piece to its field (an array a vertex);
    a piece not named is outside the garment."""
    f = np.zeros(len(alpha))
    left = np.ones(len(alpha))
    for piece, field in parts.items():
        a = alpha[:, PIECE[piece]]
        f = f + a * field
        left = left - a
    return f + np.clip(left, 0.0, 1.0) * outside


def ripple(x, count, seed=0.0, rise=0.72, sharp=0.55):
    """Cloth's folds round or along a garment, as a share of their depth (0 to 1, never below the cloth's line), at
    `x` (radians round, or a length along) with about `count` folds a turn: each fold a slow rise to its ridge and a
    sharp fall into its crease on one side (`rise` the share of a fold the rise takes), their spacing wandering and
    their depths uneven, so no two folds are alike and none is the mirror of another."""
    x = np.asarray(x, float)
    s1, s2, s3 = math.sin(seed * 12.9898) * 43758.5453 % TAU, seed * 2.17 + 0.4, seed * 3.71 + 1.3
    phase = x * count + s1 + 0.95 * np.sin(x * count * 0.37 + s2) + 0.45 * np.sin(x * count * 0.61 + s3)
    p = np.mod(phase / TAU, 1.0)
    up = np.clip(p / rise, 0, 1)
    down = np.clip((1 - p) / (1 - rise), 0, 1)
    f = np.where(p < rise, 0.5 - 0.5 * np.cos(up * math.pi), down ** sharp)
    depth = 0.55 + 0.45 * np.sin(x * count * 0.23 + s3 * 1.7) * np.sin(x * count * 0.11 + s2)
    return f * np.clip(depth + 0.25, 0.15, 1.0)
