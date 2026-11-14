"""The first-person forge's wear maps: where each frame shows its weapon's wear as the weapon's condition falls.

    python -I tools/sprite-forge/fpwear.py --out <dir> [--frames public/art/studio/forge] [--files WEAPON04,WEAPON08]
    python -I tools/sprite-forge/fpmetals.py --out public/art/studio/forge/WEAPON04 --wear-only

A map lies beside its frame, the same size, named as the frame with `_wear` before `.png`. Each channel holds the
condition at which a wear shows at that pixel, lower sooner, 255 never: red a scratch (a thin streak along its piece),
green rust, tarnish and pitting (blotches, denser where pieces meet), blue a nick (a spot on a cutting edge or a point).
Alpha is 255 on the metal and 0 elsewhere. Every value is a function of the pixel's point on the weapon at rest (the
fitter's raster, fpforge.Eye.surface), so a mark keeps its place on the weapon through every frame. No render is made.

Each script that writes a weapon's frames takes `--wear-only` and writes their maps instead. This one runs them all,
then cuts each map to its frame's pixels and reports how much wear shows at a few conditions."""
import argparse
import math
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

SUFFIX = '_wear'
# metal that may be nicked: a blade, a bit, a head, a spike, an arrow's point
EDGE = ('blade', 'dagger_blade', 'sword_blade', 'axehead', 'macehead', 'macecore', 'mace_edge', 'flailiron',
        'flail_head', 'hammer_head', 'head')
# every metal: scratched and rusted, its grooves, sleeves, collars, guards and fittings too
METAL = EDGE + ('blade_groove', 'dagger_groove', 'sword_groove', 'sword_fit', 'axe_groove', 'axe_sleeve', 'axe_accent', 'mace_sleeve',
                'mace_accent', 'flail_sleeve', 'flail_accent', 'hammer_collar', 'hammer_accent', 'ferrule', 'collar',
                'hilt', 'pommel', 'skull_dark', 'dagger_fit', 'dagger_accent')
# the weapon's other stuffs, unworn but a place the metal meets (a socket on its haft); the hands are none of these
WEAPON = METAL + ('staff', 'haft', 'macehaft', 'flailwood', 'wood', 'haft_wrap', 'axe_grip', 'mace_grip', 'flail_grip',
                  'hammer_grip', 'dagger_grip', 'lash', 'wrap', 'string', 'shaft', 'fletch', 'gem', 'glow', 'mace_glow',
                  'flail_core', 'hammer_glow', 'dagger_glow', 'vein', 'sword_grip', 'sword_inlay', 'sword_glow',
                  'sword_blade_glow')
# metres of a weapon a frame's pixel spans, about (its median over the archive's frames): every mark is sized in it
PIXEL = {'staff': 4.8e-3, 'dagger': 2.7e-3, 'sword': 4.0e-3, 'mace': 2.5e-3, 'flail': 1.9e-3,
         'warhammer': 2.0e-3, 'battleaxe': 4.2e-3, 'bow': 2.2e-3}
WELD = 1e-6      # metres: vertices this close are one (a blade's faces are strips apart)
# scratches: a grid of streaks along each piece's length, two grids at a slant to each other; a streak SCRATCH_W
# pixels wide, its cell SCRATCH_L pixels long, SCRATCH_P of the cells holding one
SCRATCH_W, SCRATCH_L, SCRATCH_P = 0.7, 10.0, 0.16
SCRATCH_TILT = (7.0, -11.0)   # degrees off the piece's length
LONG = 1.5   # a piece this many times longer than broad is scratched along its own length
SCRATCH_AT = ([0.0, 0.15, 0.42, 0.85, 1.0], [20.0, 48.0, 110.0, 180.0, 254.0])   # a streak's draw onto its condition
# rust: blotches of three sizes (pixels) and their weights, more where another piece lies within a few pixels
RUST = ((14.0, 0.5), (5.0, 0.3), (2.0, 0.2))
RECESS, RECESS_W = 1.6, 0.18   # how far a meeting's pull reaches (pixels), and how strongly
UNDER = 0.6   # a piece this square under the surface (its offset's share along the normal) lies under it
# the rust's score onto its condition by its share of the part's metal at rest (the score at each hundredth, measured
# over the mesh once): the same share of every weapon's metal rusts at each condition, a small cap's as a long blade's
RUST_SHARES, RUST_AT = [0.0, 30.0, 70.0, 89.0, 97.0, 100.0], [255.0, 254.0, 180.0, 110.0, 48.0, 0.0]
# nicks: on metal that may be nicked, along an edge where its piece's two faces meet (one toward each side of its
# depth, turning past SHARP degrees: a blade's, a bit's, never a block's corner) and at a point sharper than POINT
# radians (its cone's gap); at most one nick to a cell NICK_GAP pixels wide, NICK_P of an edge's cells holding one
SHARP, FACING, POINT = 60.0, 0.2, 2.6
CONE = 0.3   # a point's neighbours each within this cosine of their mean direction from it
GAP, ACROSS = 0.4, 0.7   # two open rims this close (pixels), one across the other's face: a bit's faces at its edge
NICK_GAP, NICK_P = 12.0, 0.6
NICK_R = (0.5, 1.0)   # a nick's reach, pixels: its least and most
NICK_AT = ([0.0, 1.0], [70.0, 250.0])
SEED = 0x5EA1


def _mix(x):
    x = x + np.uint64(0x9E3779B97F4A7C15)
    x = (x ^ (x >> np.uint64(30))) * np.uint64(0xBF58476D1CE4E5B9)
    x = (x ^ (x >> np.uint64(27))) * np.uint64(0x94D049BB133111EB)
    return x ^ (x >> np.uint64(31))


def _hash(seed, *keys):
    """A number in [0, 1) for each integer key (arrays, broadcast), the same for the same keys and seed."""
    keys = np.broadcast_arrays(*[np.atleast_1d(np.asarray(k, dtype=np.int64)) for k in keys])
    h = np.full(keys[0].shape, seed, dtype=np.uint64)
    with np.errstate(over='ignore'):
        for k in keys:
            h = _mix(h ^ k.astype(np.uint64))
    return (h >> np.uint64(11)).astype(np.float64) / float(1 << 53)


def _noise(p, cell, seed):
    """Value noise over points `p` (n, 3), its lattice `cell` metres apart: smooth, in [0, 1]."""
    q = p / cell
    i = np.floor(q).astype(np.int64)
    s = q - i
    s = s * s * (3 - 2 * s)
    out = np.zeros(len(p))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = np.prod([s[:, k] if d else 1 - s[:, k] for k, d in enumerate((dx, dy, dz))], axis=0)
                out += w * _hash(seed, i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz)
    return out


class Mesh:
    """A part's rest, read once for its wear: its pieces (what is joined, welded), each piece's frame, its cutting
    edges and points and the nicks along them, points over the whole weapon (for where another piece lies near), and
    its rust's score at each share of its metal."""

    def __init__(self, rest, tris, mats, names, unit):
        from scipy.sparse import coo_matrix
        from scipy.sparse.csgraph import connected_components
        from scipy.spatial import cKDTree
        self.rest, self.tris, self.unit = rest, tris, unit
        named = np.array(['', *names])
        self.metal = np.isin(named, METAL)[mats]   # a triangle's role, by its material
        self.edge = np.isin(named, EDGE)[mats]
        _, wid = np.unique(np.round(rest / WELD).astype(np.int64), axis=0, return_inverse=True)
        F = wid.ravel()[tris]
        n = int(F.max()) + 1
        a, b, c = rest[tris[:, 0]], rest[tris[:, 1]], rest[tris[:, 2]]
        cross = np.cross(b - a, c - a)
        area = np.linalg.norm(cross, axis=1) / 2
        live = (area > 1e-12) & (F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])
        normal = self.normal = cross / np.maximum(2 * area, 1e-30)[:, None]
        pairs = F[live][:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2)
        graph = coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(n, n))
        _, label = connected_components(graph, directed=False)
        self.piece = label[F[:, 0]]
        self.axes = self._axes(a, b, c, area, live)
        pos = np.zeros((n, 3))
        pos[F.ravel()] = rest[tris.ravel()]
        A, B, rims = self._edges(F, live, normal, pos)
        places, self.nick_r, self.nick_at = self._nicks(A, B, self._points(F, live, pos, rims))
        self.nicks = cKDTree(places) if len(places) else None
        weapon = live & (np.isin(named, WEAPON) | np.char.startswith(named, 'sword:'))[mats]   # a hilt's own stuffs
        pts, which = self._spread(a[weapon], b[weapon], c[weapon], area[weapon], np.nonzero(weapon)[0])
        self.near, self.near_piece = cKDTree(pts), self.piece[which]
        metal = self.metal[which]
        score = self._rust(pts[metal], self.near_piece[metal], normal[which[metal]]) if metal.any() else np.zeros(1)
        self.rust_at = np.percentile(score, RUST_SHARES) + np.arange(len(RUST_SHARES)) * 1e-9

    def _axes(self, a, b, c, area, live):
        """Each piece's frame (pieces, 3, 3): its length, its breadth, its depth (the spread of its faces)."""
        k = self.piece
        m = (a + b + c) / 3
        w = np.where(live, area, 0.0)
        n = int(k.max()) + 1
        total = np.bincount(k, w, n) + 1e-30
        mean = np.stack([np.bincount(k, w * m[:, i], n) for i in range(3)], axis=1) / total[:, None]
        d = m - mean[k]
        cov = np.zeros((n, 3, 3))
        np.add.at(cov, k, w[:, None, None] * d[:, :, None] * d[:, None, :])
        val, vec = np.linalg.eigh(cov + np.eye(3) * 1e-18)
        spread = np.sqrt(np.maximum(val[:, ::-1], 0.0) / total[:, None])
        # a scratch runs along its piece where the piece is long, else along the part (its axis +Z, its width +X): a
        # block or a stud scratched its own way would read as speckle
        long = (spread[:, 0] > LONG * spread[:, 1]) & (spread[:, 0] > SCRATCH_L * self.unit / 4)
        self.grain = np.where(long[:, None, None], vec[:, :, ::-1].transpose(0, 2, 1), np.eye(3)[[2, 0, 1]])
        return vec[:, :, ::-1].transpose(0, 2, 1)   # rows: the most spread first

    def _edges(self, F, live, normal, pos):
        """The cutting edges of nickable metal, each a segment's ends (A, B): where a piece's two sides meet, a turn
        between a face toward one side of its depth and one toward the other, or two open rims a hair apart (a bit's
        faces, left open where they close to nothing). Answers (A, B, the rims' vertices)."""
        T = np.nonzero(live)[0]
        e = np.stack([F[T][:, [0, 1]], F[T][:, [1, 2]], F[T][:, [2, 0]]], axis=1).reshape(-1, 2)
        face = np.repeat(T, 3)
        n = len(pos)
        key = np.minimum(e[:, 0], e[:, 1]) * n + np.maximum(e[:, 0], e[:, 1])
        order = np.argsort(key, kind='stable')
        key, e, face = key[order], e[order], face[order]
        start = np.r_[0, np.nonzero(np.diff(key))[0] + 1]
        count = np.diff(np.r_[start, len(key)])
        two = start[count == 2]
        f1, f2 = face[two], face[two + 1]
        same = e[two, 0] == e[two + 1, 0]   # both faces run the edge one way: one is wound the other way round
        n2 = normal[f2] * np.where(same, -1.0, 1.0)[:, None]
        turn = np.degrees(np.arccos(np.clip((normal[f1] * n2).sum(axis=1), -1.0, 1.0)))
        depth = self.axes[self.piece[f1], 2]
        d1, d2 = (normal[f1] * depth).sum(axis=1), (n2 * depth).sum(axis=1)
        sides = (np.minimum(np.abs(d1), np.abs(d2)) > FACING) & (d1 * d2 < 0)
        crease = e[two][(turn > SHARP) & sides & self.edge[f1] & self.edge[f2]]
        one = start[count == 1]
        rf = face[one]
        keep = self.edge[rf] & (np.abs((normal[rf] * self.axes[self.piece[rf], 2]).sum(axis=1)) > FACING)
        rim, rf = e[one][keep], rf[keep]
        if len(rim) > 1:   # the other rim across the thickness, not beside it along the surface (a seam)
            from scipy.spatial import cKDTree
            mid = (pos[rim[:, 0]] + pos[rim[:, 1]]) / 2
            d, j = cKDTree(mid).query(mid, k=2)
            across = np.abs(((mid[j[:, 1]] - mid) * normal[rf]).sum(axis=1)) > ACROSS * d[:, 1]
            crease = np.concatenate([crease, rim[(d[:, 1] < GAP * self.unit) & across]])
        rims = np.zeros(n, bool)
        rims[e[start[count != 2]].ravel()] = True
        return pos[crease[:, 0]], pos[crease[:, 1]], rims

    def _points(self, F, live, pos, rims):
        """The points of nickable metal: vertices whose faces' corners fall short of a full turn by more than POINT
        (a spike's tip, a blade's point), never on an open rim (`rims`)."""
        T = np.nonzero(live)[0]
        n = len(pos)
        corner = np.zeros(n)
        for i in range(3):
            p, q, r = pos[F[T, i]], pos[F[T, (i + 1) % 3]], pos[F[T, (i + 2) % 3]]
            x, y = q - p, r - p
            cos = (x * y).sum(axis=1) / np.maximum(np.linalg.norm(x, axis=1) * np.linalg.norm(y, axis=1), 1e-30)
            np.add.at(corner, F[T, i], np.arccos(np.clip(cos, -1.0, 1.0)))
        nickable = np.zeros(n, bool)
        nickable[F[T][self.edge[T]].ravel()] = True
        tip = nickable & ~rims & (2 * math.pi - corner > POINT)
        # and it stands out: its neighbours all lie back within a cone from it (where faces closed to nothing in a
        # flat face, their corners are lost and the turn looks short, but the neighbours lie all round)
        a, b = F[T][:, [0, 1, 1, 2, 2, 0]].reshape(-1, 2).T
        a, b = np.r_[a, b], np.r_[b, a]
        a, b = a[tip[a]], b[tip[a]]
        to = pos[b] - pos[a]
        to /= np.maximum(np.linalg.norm(to, axis=1, keepdims=True), 1e-30)
        mean = np.zeros((n, 3))
        np.add.at(mean, a, to)
        mean /= np.maximum(np.linalg.norm(mean, axis=1, keepdims=True), 1e-30)
        least = np.ones(n)
        np.minimum.at(least, a, (to * mean[a]).sum(axis=1))
        return pos[tip & (least > CONE)]

    def _nicks(self, A, B, points):
        """The nicks: (their places, reaches, conditions). At most one a cell: a point there if it holds one (a stud
        of many points has one nick, not one a corner), else the edge's spot there that draws lowest, a share of such
        cells holding one."""
        u = self.unit
        steps = np.maximum(np.ceil(np.linalg.norm(B - A, axis=1) / (0.5 * u)).astype(int), 1)
        at = np.concatenate([(np.arange(s) + 0.5) / s for s in steps]) if len(steps) else np.zeros(0)
        line = np.repeat(A, steps, axis=0) + at[:, None] * np.repeat(B - A, steps, axis=0)
        spots = np.concatenate([points, line])
        if not len(spots):
            return spots, np.zeros(0), np.zeros(0)
        cell = np.floor(spots / (NICK_GAP * u)).astype(np.int64)
        edge = np.arange(len(spots)) >= len(points)
        draw = _hash(SEED + 1, *np.round(spots / (0.25 * u)).astype(np.int64).T) + edge   # a point draws first
        order = np.lexsort((draw, cell[:, 2], cell[:, 1], cell[:, 0]))
        first = order[np.r_[True, np.any(np.diff(cell[order], axis=0) != 0, axis=1)]]
        places = spots[first[~edge[first] | (_hash(SEED + 2, *cell[first].T) < NICK_P)]]
        key = np.round(places / (0.25 * u)).astype(np.int64).T
        reach = u * (NICK_R[0] + (NICK_R[1] - NICK_R[0]) * _hash(SEED + 3, *key))
        return places, reach, np.interp(_hash(SEED + 4, *key), *NICK_AT)

    def _spread(self, a, b, c, area, which):
        """Points over triangles (a, b, c), about one each half pixel square, each with its triangle: the same each
        time for the same mesh."""
        rng = np.random.default_rng(SEED)
        k = np.floor(area / (0.5 * self.unit) ** 2 + rng.random(len(area))).astype(int) + 1
        t = np.repeat(np.arange(len(area)), k)
        r1, r2 = rng.random(len(t)), rng.random(len(t))
        flip = r1 + r2 > 1
        r1, r2 = np.where(flip, 1 - r1, r1), np.where(flip, 1 - r2, r2)
        return a[t] + r1[:, None] * (b[t] - a[t]) + r2[:, None] * (c[t] - a[t]), which[t]

    def paint(self, p, tri):
        """The four channels at rest points `p` on triangles `tri`: (n, 4) uint8."""
        out = np.full((len(p), 4), 255, dtype=np.uint8)
        metal = self.metal[tri]
        out[~metal, 3] = 0
        p, tri = p[metal], tri[metal]
        piece = self.piece[tri]
        frame = self.grain[piece]
        out[metal, 0] = np.round(np.min([self._streaks(p, frame, a, SEED + 10 + k)
                                         for k, a in enumerate(SCRATCH_TILT)], axis=0))
        out[metal, 1] = np.round(np.interp(self._rust(p, piece, self.normal[tri]), self.rust_at, RUST_AT))
        out[metal, 2] = np.round(self._nicked(p, self.edge[tri]))
        return out

    def _streaks(self, p, frame, tilt, seed):
        """Scratches: each streak along its piece's length (turned `tilt` degrees in its breadth), its condition,
        else 255."""
        t = math.radians(tilt)
        along = frame[:, 0] * math.cos(t) + frame[:, 1] * math.sin(t)
        across = frame[:, 1] * math.cos(t) - frame[:, 0] * math.sin(t)
        s, x, y = (p * along).sum(1), (p * across).sum(1), (p * frame[:, 2]).sum(1)
        w, length = SCRATCH_W * self.unit, SCRATCH_L * self.unit
        ix, iy = np.floor(x / w).astype(np.int64), np.floor(y / w).astype(np.int64)
        q = s / length + _hash(seed, ix, iy)   # each column's cells start apart
        iz = np.floor(q).astype(np.int64)
        f = q - iz
        h = [_hash(seed + k, ix, iy, iz) for k in (1, 2, 3, 4)]
        on = (h[0] < SCRATCH_P) & (np.abs(f - (0.2 + 0.6 * h[1])) < 0.15 + 0.3 * h[2])
        return np.where(on, np.interp(h[3], *SCRATCH_AT), 255.0)

    def _rust(self, p, piece, normal):
        """Rust's score: blotches, and more where another piece meets the surface at `p` (a guard, a socket, a
        flange's root). A piece under the surface is no meeting: a sleeve lies on its haft all along."""
        score = sum(w * _noise(p, size * self.unit, SEED + 20 + k) for k, (size, w) in enumerate(RUST))
        d, i = self.near.query(p, k=16, distance_upper_bound=4 * RECESS * self.unit)
        found = i < len(self.near_piece)
        j = np.minimum(i, len(self.near_piece) - 1)
        off = self.near.data[j] - p[:, None]
        under = np.abs((off * normal[:, None]).sum(axis=2)) > UNDER * np.maximum(d, 1e-12)
        other = found & ~under & (self.near_piece[j] != piece[:, None])
        gap = np.where(other, d, np.inf).min(axis=1)
        return score + RECESS_W * np.exp(-gap / (RECESS * self.unit))

    def _nicked(self, p, edge):
        """Nicks: the lowest condition of the nicks reaching each point of nickable metal, else 255."""
        out = np.full(len(p), 255.0)
        if self.nicks is None or not edge.any():
            return out
        d, i = self.nicks.query(p[edge], k=4, distance_upper_bound=NICK_R[1] * self.unit)
        found = i < len(self.nick_r)
        j = np.minimum(i, len(self.nick_r) - 1)
        hit = found & (d < self.nick_r[j])
        out[edge] = np.where(hit, self.nick_at[j], 255.0).min(axis=1)
        return out


class Painter:
    """The wear maps of an eye's frames (fpforge.Eye, its render off or on): `screen` as the eye's own, a map."""

    def __init__(self, eye):
        self.eye, self._mesh = eye, {}

    def mesh(self, part):
        if part not in self._mesh:
            v, t, c = self.eye.ids[part]
            self._mesh[part] = Mesh(v, t, c.astype(np.int64), self.eye.names,
                                    PIXEL.get(self.eye.weapon, 3e-3))
        return self._mesh[part]

    def screen(self, pose, part, record=None, frame=None, only=None, **_):
        """The whole screen's map with `part` at `pose`: (h, w, 4) uint8. Of `only` those materials, where given."""
        ids, tri, shares = self.eye.surface(pose, part, only, record)
        mesh = self.mesh(part)
        assert len(self.eye.drawn(part, record)[2][1]) == len(mesh.tris), 'a record\'s own shape keeps its triangles'
        on = tri >= 0
        out = np.zeros(tri.shape + (4,), dtype=np.uint8)
        out[..., :3] = 255
        k = tri[on]
        p = (shares[on][:, :, None] * mesh.rest[mesh.tris[k]]).sum(axis=1)   # the pixel's point at rest
        out[on] = mesh.paint(p, k)
        return out


def wear_name(name):
    """A frame's map's name: `WEAPON04.CIF_1-2_Daedric.png` -> `WEAPON04.CIF_1-2_Daedric_wear.png`."""
    stem, ext = os.path.splitext(name)
    return f'{stem}{SUFFIX}{ext}'


def frame_name(name):
    """A map's frame's name: its `_wear` taken out."""
    stem, ext = os.path.splitext(name)
    return f'{stem[:-len(SUFFIX)]}{ext}' if stem.endswith(SUFFIX) else name


def save(path, pic, offset=None, box=None):
    """Write a frame's map where the frame would be written, under the map's name, with its frame's place and box.
    Wherever it shows no metal it holds 255 in every channel."""
    import stage
    pic = pic.copy()
    pic[pic[..., 3] == 0, :3] = 255
    stage.write_png(os.path.join(os.path.dirname(path), wear_name(os.path.basename(path))), pic, offset, box)


def move(work, out, tag):
    """Every picture the forge wrote into `work` moved into `out` under `tag` (a metal's or a type's): a frame's
    `<name>_<tag>.png`, a map's `<name>_<tag>_wear.png`. Then `work` is gone."""
    for name in sorted(os.listdir(work)):
        stem, ext = os.path.splitext(name)
        wear = stem.endswith(SUFFIX)
        to = f'{stem[:-len(SUFFIX)]}_{tag}{SUFFIX}{ext}' if wear else f'{stem}_{tag}{ext}'
        shutil.move(os.path.join(work, name), os.path.join(out, to))
    os.rmdir(work)


def layer(eye, spec, mats, out, stem, records=None):
    """A layer's maps (the dagger alone, a bow alone: `mats` alone seen, nothing over them), each named as its frame,
    `<archive>_<record>-<frame>_<stem>_wear.png`. Answers how many."""
    import fpforge
    import fpstage
    paint = Painter(eye)
    n = 0
    draw = lambda pose, part, record=None, frame=None: paint.screen(pose, part, record, only=mats)   # noqa: E731
    for r, frames in sorted(fpforge.screens(eye, spec, records, draw).items()):
        if records is not None and r not in records:
            continue
        rec = spec['records'][r]
        for f, scr in enumerate(frames):
            pic = fpforge.cut(scr, fpforge.out_rect(rec))
            save(os.path.join(out, f"{spec['archive']}_{r}-{f}_{stem}.png"), pic, **fpforge.marks(spec, rec))
            n += 1
    return n


def _read(path):
    from PIL import Image
    return np.asarray(Image.open(path).convert('RGBA'))


def fit(path, frames):
    """A map cut to its frame's pixels, its frame read from `frames` by its name: no metal where the frame draws
    nothing. Answers (the frame's size, the map's, the pixels cut), or None with no frame there."""
    import stage
    frame = os.path.join(frames, frame_name(os.path.basename(path)))
    if not os.path.exists(frame):
        return None
    pic, own = _read(path).copy(), _read(frame)
    if pic.shape != own.shape:
        return own.shape[:2], pic.shape[:2], 0
    clear = own[..., 3] == 0
    cut = int((clear & (pic[..., 3] > 0)).sum())
    if cut:
        pic[clear] = (255, 255, 255, 0)
        stage.write_png(path, pic)
    return own.shape[:2], pic.shape[:2], cut


# what writes each weapon file's frames, and so its maps: (script, its arguments past --out, a spec by its name; a
# folder under the file's)
RUNS = {
    'WEAPON01': (('fpforge', ['--spec', 'WEAPON01'], ''), ('fpstaffs', [], '')),
    'WEAPON02': (('fpforge', ['--spec', 'WEAPON02'], ''), ('fplayers', [], 'layers')),
    'WEAPON04': (('fpforge', ['--spec', 'WEAPON04'], ''), ('fplayers', ['--weapon', 'sword'], 'layers')),
    'WEAPON05': (('fpforge', ['--spec', 'WEAPON05'], ''), ('fpmaces', [], '')),
    'WEAPON06': (('fpforge', ['--spec', 'WEAPON06'], ''), ('fpflails', [], '')),
    'WEAPON07': (('fpforge', ['--spec', 'WEAPON07'], ''), ('fpwarhammers', [], '')),
    'WEAPON08': (('fpforge', ['--spec', 'WEAPON08'], ''), ('fpmetals', ['--weapon', 'battleaxe'], '')),
    'WEAPON09': (('fpforge', ['--spec', 'WEAPON09'], ''), ('fpbowtypes', [], ''), ('fpbowlayers', [], '')),
}
SHOW = (48, 110, 180)   # the conditions the report reads


def run(files, out):
    """Every map of `files` into `out`/<file>, each script in this process in turn."""
    import importlib
    specs = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
    for file in files:
        for script, extra, sub in RUNS[file]:
            extra = [os.path.join(specs, f'{a}.json') if a.startswith('WEAPON') else a for a in extra]
            sys.argv = [f'{script}.py', '--out', os.path.join(out, file, sub), '--wear-only', *extra]
            importlib.import_module(script).main()


def report(out, frames):
    """Each map cut to its frame (`frames`/<file>), then how much of the metal shows wear at each of SHOW. Answers the
    lines to print."""
    lines, worn, metal, bad = [], np.zeros((4, len(SHOW))), 0, []
    for folder, _, names in sorted(os.walk(out)):
        own = os.path.join(frames, os.path.relpath(folder, out))
        for name in sorted(n for n in names if os.path.splitext(n)[0].endswith(SUFFIX)):
            path = os.path.join(folder, name)
            got = fit(path, own)
            if got is None:
                bad.append(f'{name}: no frame')
                continue
            size, mine, cut = got
            if size != mine:
                bad.append(f'{name}: {mine} against its frame\'s {size}')
            if cut:
                lines.append(f'{name}: {cut} metal pixels off the frame cut')
            pic = _read(path)
            on = pic[..., 3] == 255
            v = pic[on][:, :3].astype(int)
            metal += len(v)
            for k, t in enumerate(SHOW):
                worn[:3, k] += (v <= t).sum(axis=0)
                worn[3, k] += (v.min(axis=1) <= t).sum()
    for k, label in enumerate(('scratches', 'rust', 'nicks', 'any')):
        shares = ', '.join(f'{t}: {100 * worn[k, j] / max(metal, 1):.1f}%' for j, t in enumerate(SHOW))
        lines.append(f'{label:9s} {shares}')
    return bad + lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--frames', default=os.path.join('public', 'art', 'studio', 'forge'), help='where the frames are')
    ap.add_argument('--files', default=','.join(RUNS))
    ap.add_argument('--report', action='store_true', help='only cut and report the maps already in --out')
    args = ap.parse_args()
    files = [f for f in args.files.split(',') if f]
    if not args.report:
        run(files, args.out)
    for line in report(args.out, args.frames):
        print(line)


if __name__ == '__main__':
    main()
