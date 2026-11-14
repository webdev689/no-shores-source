"""The armour's geometry kit: plates with thickness and hard edges, fitted to the body's own outline at each height,
and what dresses them: rolled edges, rivets, spikes, fur, straps, buckles. Everything here is numpy and one bpy mesh
an object, made in rest space; `armour.py` hangs it on its joint.

A plate's outline at a height is the body's (`Outline`), pushed out by a gap and shaped by its maker: a keel down its
middle, its corners squared, its faces cut flat, its edge flared or toothed. Each is a solid: an outer face, an inner
one a thickness in, and its edges closed, split sharp where they turn so the light breaks on them."""
import math

import numpy as np

TAU = 2 * math.pi


class Outline:
    """The shaped body's outline about a centre at any height, from its vertices of the pieces named: the farthest
    point in each of `n` directions, filled where none lies and smoothed a little."""

    def __init__(self, rest, piece, n=72):
        self.p, self.piece, self.n = rest, piece, n

    def at(self, region, z, dz=0.014, centre=None, axis=2):
        """The outline of `region` across `axis` at `z` along it: its centre in the plane across (x, y; for the Y
        axis x, z) and its radius in each of `n` directions there, from the plane's first axis toward its second."""
        u, v = (0, 1) if axis == 2 else (0, 2)
        inside = self.p[np.isin(self.piece, region)]
        z = float(np.clip(z, inside[:, axis].min() + dz, inside[:, axis].max() - dz))   # past its end: its end's
        pts = inside[np.abs(inside[:, axis] - z) < dz]
        if len(pts) < 8:
            pts = inside[np.abs(inside[:, axis] - z) < dz * 3]
        if centre is None:
            centre = ((pts[:, u].min() + pts[:, u].max()) / 2, (pts[:, v].min() + pts[:, v].max()) / 2)
        dx, dy = pts[:, u] - centre[0], pts[:, v] - centre[1]
        th = np.mod(np.arctan2(dy, dx), TAU)
        r = np.hypot(dx, dy)
        bins = (th / TAU * self.n).astype(int) % self.n
        out = np.full(self.n, np.nan)
        for b in range(self.n):
            hit = r[bins == b]
            if len(hit):
                out[b] = hit.max()
        ok = ~np.isnan(out)
        idx = np.arange(self.n)
        out = np.interp(idx, np.concatenate([idx[ok] - self.n, idx[ok], idx[ok] + self.n]),
                        np.tile(out[ok], 3))
        out = (np.roll(out, 1) + 2 * out + np.roll(out, -1)) / 4
        return np.array(centre, float), out


def angles(n):
    return np.arange(n) * TAU / n


def front(th, at=-math.pi / 2):
    """How near each direction is to the front (-Y): 1 at it, 0 at the back."""
    return np.cos(th - at) * 0.5 + 0.5


def keel(th, height, width=0.35, at=-math.pi / 2):
    """A ridge down the middle of a plate's face: `height` at its line, gone `width` radians off it."""
    d = np.abs((th - at + math.pi) % TAU - math.pi)
    return height * np.clip(1 - d / width, 0, 1)


def squared(th, r, power):
    """The outline drawn toward a rounded square (a superellipse of `power`): a dwarf's plates."""
    if power <= 2:
        return r
    c, s = np.abs(np.cos(th)), np.abs(np.sin(th))
    k = (c ** power + s ** power) ** (-1.0 / power)
    return r * (0.82 + 0.18 * k / k.max())


def faceted(th, r, facets):
    """The outline cut into `facets` flat faces: a polygon whose corners lie on it."""
    if not facets:
        return r
    step = TAU / facets
    a = np.floor(th / step) * step
    return r * np.cos(step / 2) / np.cos(th - a - step / 2)


def teeth(th, depth, count):
    """An edge toothed `count` times round: a saw's points, an orc's or a daedra's lames."""
    return depth * np.abs(((th / TAU * count) % 1.0) * 2 - 1)


class Mesh:
    """Vertices, quads and each face's material slot, gathered before they are made one Blender object."""

    def __init__(self):
        self.v, self.f, self.m = [], [], []

    def add(self, verts, faces, slot=0):
        """`slot` one for all the faces, or one a face."""
        base = sum(len(v) for v in self.v)
        self.v.append(np.asarray(verts, float))
        self.f += [tuple(i + base for i in face) for face in faces]
        self.m += [int(k) for k in slot] if np.ndim(slot) else [slot] * len(faces)
        return self

    def __bool__(self):
        return bool(self.f)

    def object(self, name, mats, split=0.55):
        """One object of all of it: smooth faces, split where they turn more than `split` radians."""
        import bpy
        me = bpy.data.meshes.new(name)
        me.from_pydata(np.concatenate(self.v).tolist(), [], self.f)
        for mat in mats:
            me.materials.append(mat)
        me.polygons.foreach_set('material_index', self.m)
        me.polygons.foreach_set('use_smooth', [True] * len(self.f))
        me.validate()
        me.update()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        mod = ob.modifiers.new('edges', 'EDGE_SPLIT')
        mod.split_angle = split
        return ob


def solid(mesh, grid, thickness, slot=0, closed=True, inward=None, outer=None):
    """A plate of the outer surface `grid` (rows, columns, 3): an inner face `thickness` in (toward `inward`, a point
    or a function of a point; else toward each row's centre), its rims closed. `closed`: the columns wrap round.
    `outer`, a slot for each of the outer surface's faces (rows - 1, columns or columns - 1), where they differ."""
    g = np.asarray(grid, float)
    rows, cols = g.shape[:2]
    if inward is None:
        c = g.mean(axis=1, keepdims=True)
        d = c - g
        d[..., 2] = 0
    elif callable(inward):
        d = np.array(np.broadcast_to(inward(g), g.shape), float)
    else:
        d = np.asarray(inward, float) - g
    d /= np.maximum(np.linalg.norm(d, axis=-1, keepdims=True), 1e-9)
    inner = g + d * thickness
    v = np.concatenate([g.reshape(-1, 3), inner.reshape(-1, 3)])
    n = rows * cols
    cw = cols if closed else cols - 1
    faces, slots = [], []
    at = lambda r, k: r * cols + (k % cols)   # noqa: E731
    for r in range(rows - 1):
        for k in range(cw):
            a, b, cc, dd = at(r, k), at(r, k + 1), at(r + 1, k + 1), at(r + 1, k)
            faces.append((a, dd, cc, b))
            faces.append((a + n, b + n, cc + n, dd + n))
            slots += [slot if outer is None else outer[r][k], slot]
    for r in (0, rows - 1):   # the rims at the top and the foot
        for k in range(cw):
            a, b = at(r, k), at(r, k + 1)
            faces.append((a, b, b + n, a + n) if r == 0 else (a, a + n, b + n, b))
    if not closed:
        for k in (0, cols - 1):
            for r in range(rows - 1):
                a, b = at(r, k), at(r + 1, k)
                faces.append((a, a + n, b + n, b) if k == 0 else (a, b, b + n, a + n))
    mesh.add(v, faces, slots + [slot] * (len(faces) - len(slots)))
    return g


def ring_grid(rings):
    """A surface from rings: each (centre (x, y), z, radii by direction, directions)."""
    return np.array([[(c[0] + r * math.cos(t), c[1] + r * math.sin(t), z) for r, t in zip(rr, th)]
                     for c, z, rr, th in rings])


def tube(mesh, pts, radius, slot=0, n=8, closed=False):
    """A tube along `pts`: a rolled edge, a strap's piping, a horn. `radius` a number or one a point."""
    pts = np.asarray(pts, float)
    rad = np.broadcast_to(np.asarray(radius, float), (len(pts),))
    rings = []
    for i, p in enumerate(pts):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        if closed:
            a, b = pts[i - 1], pts[(i + 1) % len(pts)]
        t = b - a
        t /= max(np.linalg.norm(t), 1e-9)
        u = np.cross(t, [0.0, 0.0, 1.0]) if abs(t[2]) < 0.9 else np.cross(t, [1.0, 0.0, 0.0])
        u /= np.linalg.norm(u)
        w = np.cross(t, u)
        rings.append([p + rad[i] * (math.cos(a2) * u + math.sin(a2) * w) for a2 in angles(n)])
    v = np.array(rings).reshape(-1, 3)
    faces = []
    m = len(pts) if closed else len(pts) - 1
    for i in range(m):
        j = (i + 1) % len(pts)
        for k in range(n):
            faces.append((i * n + k, i * n + (k + 1) % n, j * n + (k + 1) % n, j * n + k))
    if not closed:
        faces.append(tuple(range(n - 1, -1, -1)))
        faces.append(tuple((len(pts) - 1) * n + k for k in range(n)))
    mesh.add(v, faces, slot)


def dome(mesh, centre, radius, normal, slot=0, height=None, n=8):
    """A rivet's head: a low dome `radius` across on a surface facing `normal`."""
    c, nrm = np.asarray(centre, float), np.asarray(normal, float)
    nrm /= max(np.linalg.norm(nrm), 1e-9)
    u = np.cross(nrm, [0.0, 0.0, 1.0]) if abs(nrm[2]) < 0.9 else np.cross(nrm, [1.0, 0.0, 0.0])
    u /= np.linalg.norm(u)
    w = np.cross(nrm, u)
    h = radius * 0.7 if height is None else height
    rings = []
    for lat in (0.0, 0.55, 0.9):
        rr, hh = radius * math.cos(lat * math.pi / 2), h * math.sin(lat * math.pi / 2)
        rings.append([c + nrm * hh + rr * (math.cos(a) * u + math.sin(a) * w) for a in angles(n)])
    v = np.concatenate([np.array(rings).reshape(-1, 3), [c + nrm * h]])
    faces = [(r * n + k, r * n + (k + 1) % n, (r + 1) * n + (k + 1) % n, (r + 1) * n + k)
             for r in range(2) for k in range(n)]
    top = 3 * n
    faces += [(2 * n + k, 2 * n + (k + 1) % n, top) for k in range(n)]
    mesh.add(v, faces, slot)


def spike(mesh, base, tip, radius, slot=0, n=6, curve=None):
    """A spike from `base` to `tip`, `radius` at its foot; `curve` bends it toward a direction as it rises."""
    base, tip = np.asarray(base, float), np.asarray(tip, float)
    steps = 5
    pts = []
    for i in range(steps + 1):
        t = i / steps
        p = base + (tip - base) * t
        if curve is not None:
            p = p + np.asarray(curve, float) * math.sin(t * math.pi / 2) ** 2 * t
        pts.append(p)
    tube(mesh, pts, [radius * (1 - i / steps) ** 1.2 + 0.0008 for i in range(steps + 1)], slot, n)


def fur(mesh, ring_pts, outward, length, slot=0, rows=2, seed=0):
    """A fur trim along a line of points: tufts standing out from it (toward `outward`, one a point) and drooping,
    ragged in length, so its outline is shaggy."""
    rng = np.random.default_rng(seed)
    pts = np.asarray(ring_pts, float)
    for row in range(rows):
        for i, p in enumerate(pts):
            o = np.asarray(outward[i], float)
            o /= max(np.linalg.norm(o), 1e-9)
            jitter = rng.normal(0, 0.35, 3)
            d = o + np.array([0.0, 0.0, -0.45 - 0.3 * row]) + jitter * 0.4
            d /= np.linalg.norm(d)
            L = length * rng.uniform(0.55, 1.15)
            q = p + o * 0.004 * row + rng.normal(0, 0.004, 3)
            spike(mesh, q, q + d * L, length * 0.22, slot, n=5)


def fleece(mesh, pts, radius, slot=0, seed=0, closed=False):
    """A fur trim drawn for a sprite: one soft roll along `pts`, swelling and thinning in a few lumps, where tufts
    finer than a pixel only speckle."""
    rng = np.random.default_rng(seed)
    t = np.linspace(0.0, TAU, len(pts), endpoint=not closed)
    k, ph = int(rng.integers(4, 7)), rng.uniform(0.0, TAU)
    tube(mesh, pts, radius * (1.0 + 0.2 * np.sin(k * t + ph)), slot, n=8, closed=closed)


def strap(mesh, pts, normals, width, thickness, slot=0):
    """A strap laid along `pts` over a surface (its `normals` out of it), `width` across and `thickness` proud."""
    pts, nrm = np.asarray(pts, float), np.asarray(normals, float)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
    t = np.gradient(pts, axis=0)
    side = np.cross(t, nrm)
    side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-9)
    a, b = pts - side * width / 2, pts + side * width / 2
    grid = np.stack([a + nrm * thickness, b + nrm * thickness], axis=1)
    solid(mesh, grid, thickness, slot, closed=False, inward=lambda g: -np.repeat(nrm[:, None, :], 2, axis=1))


def box(mesh, centre, size, normal, up, slot=0):
    """A small box on a surface: a buckle, a boss, a stud."""
    c = np.asarray(centre, float)
    nrm = np.asarray(normal, float)
    nrm /= max(np.linalg.norm(nrm), 1e-9)
    upv = np.asarray(up, float)
    upv = upv - nrm * (upv @ nrm)
    upv /= max(np.linalg.norm(upv), 1e-9)
    side = np.cross(upv, nrm)
    sx, sy, sz = size
    v = [c + side * x * sx / 2 + upv * y * sy / 2 + nrm * z * sz for z in (0.0, 1.0) for y in (-1, 1) for x in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh.add(v, faces, slot)


def cap_band(mesh, centre, radii, lat, lon, thickness, slot=0, tilt=None, rows=6, cols=24, edge=None, point=0.0):
    """A band of an ellipsoid's shell between latitudes `lat` (radians, -pi/2..pi/2) and longitudes `lon`: a lame of
    a pauldron, a helm's skull. `tilt` a 3x3 turn about the centre; `edge(lon)` lowers the foot row (teeth, a point);
    `point` draws its upper half in toward its top, a share of its width at the top (a helm drawn up to a point)."""
    c, rd = np.asarray(centre, float), np.asarray(radii, float)
    R = np.eye(3) if tilt is None else np.asarray(tilt, float)
    grid = []
    for i in range(rows + 1):
        a = lat[0] + (lat[1] - lat[0]) * i / rows
        row = []
        for k in range(cols + 1):
            b = lon[0] + (lon[1] - lon[0]) * k / cols
            drop = edge(b) if (edge is not None and i == 0) else 0.0
            a2 = a - drop
            p = np.array([math.cos(a2) * math.cos(b), math.cos(a2) * math.sin(b), math.sin(a2)]) * rd
            if point:
                p[:2] *= 1 - point * max(math.sin(a2), 0.0) ** 2
            row.append(c + R @ p)
        grid.append(row)
    closed = abs((lon[1] - lon[0]) - TAU) < 1e-6
    if closed:
        grid = [row[:-1] for row in grid]
    return solid(mesh, grid, thickness, slot, closed=closed, inward=c)


def sleeve(mesh, a, b, radius, dorsal, span, thickness, slot=0, rows=3, cols=9, flare=0.0, tip=False):
    """A lame over a bone from `a` to `b`: an arc of a tube `radius` round it, `span` radians either side of `dorsal`
    (the way its back faces), flared by `flare` at its head so it laps the one before; `tip` rounds it shut over the
    bone's end, a fingertip's. Gives its rows."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    t = b - a
    L = max(np.linalg.norm(t), 1e-9)
    t /= L
    up = np.asarray(dorsal, float) - t * (np.asarray(dorsal, float) @ t)
    up /= max(np.linalg.norm(up), 1e-9)
    side = np.cross(t, up)
    grid = []
    for i in range(rows + 1):
        s = i / rows
        rr = radius * (1 + flare * (1 - s))
        reach = L * s
        if tip and s > 0.5:   # the cap: the arc closing over the end of the bone
            q = (s - 0.5) / 0.5
            rr *= math.cos(q * math.pi / 2) * 0.85 + 0.15
            reach = L * 0.5 + (L * 0.5 + radius * 0.8) * math.sin(q * math.pi / 2)
        row = [a + t * reach + rr * (math.cos(w) * up + math.sin(w) * side) for w in np.linspace(-span, span, cols)]
        grid.append(row)
    centre_line = lambda g: (a + t * np.clip(((g - a) @ t), 0, L)[..., None]) - g   # noqa: E731
    solid(mesh, grid, thickness, slot, closed=False, inward=centre_line)
    return np.array(grid)


def rot(axis, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    x, y, z = axis
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])
