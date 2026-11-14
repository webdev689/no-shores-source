"""The bow of every metal, made from numbers: one bow for the first-person forge (fpbow.py), the sprite forge's bodies
(gear.py `build_metal_bow`) and the layered bodies' held bow pictures (bowpics.py) alike.

A limb lies along its own line from the grip to its tip: at each point its centre, its back (the way it faces, toward
the target), its half-width across and half-thickness back to belly. Daggerfall's bow is a plain stave under a mottled
wrap (`look(None)`). Each metal's bow, steel's too, is a make of its own in the language of that metal's warhammer
(fpwarhammers.py): its grip is dressed as the warhammer's haft is, by the warhammer's own work (`grip`), and its limbs
carry the warhammer head's motifs where the first-person eye sees a limb, its first SEEN metres past the riser (its tips
never reach that screen). A held bow's picture sees the whole limb, the same make stretched along it.

Its pieces are (vertices, triangles, stuff), a staff's stuffs (staffs.py): 'wood'; 'metal', sleeves, bands and a metal
stave; 'head', the motif's metal; 'accent', fittings in the metal's own colours; 'grip', a wrap, cord, leather or fur;
'vein', a light of its own. Platings lie on the face the eye meets; blades, horns and claws stand off the limb's
outline. Forged and cut work is flat-faced, so its edges catch the light; wood, wire and horn are smooth."""
import numpy as np

METALS = ('Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')
SEEN = 0.3   # metres of each limb past the riser the first-person eye sees


# a wood bow's own stave, seen whole in third person, where its metal's work is smaller than a pixel and its wood must
# say its metal (sRGB): iron's black bog oak, silver's silvered ash, elven gold, orcish smoked; steel's is the yew
WOODS = {'Iron': (58, 38, 26), 'Silver': (150, 140, 128), 'Elven': (176, 136, 64), 'Orcish': (82, 58, 36)}


# -- shapes

def outward(v, q, inside):
    """Triangles `q` turned so each faces away from its own point `inside` (one for all, or one a triangle)."""
    q = np.asarray(q)
    n = np.cross(v[q[:, 1]] - v[q[:, 0]], v[q[:, 2]] - v[q[:, 0]])
    away = np.einsum('ij,ij->i', n, v[q].mean(axis=1) - inside) >= 0
    return np.where(away[:, None], q, q[:, ::-1])


def facets(v, q):
    """A mesh's every triangle its own corners, so smooth shading draws it flat: forged and cut work."""
    return v[q].reshape(-1, 3), np.arange(len(q) * 3).reshape(-1, 3)


def tube(cs, us, ws, ra, rb, n=8, radius=None):
    """A closed tube of rings: ring i about `cs[i]`, `ra[i]` along `us[i]` and `rb[i]` along `ws[i]` (times
    `radius(k)` at its k-th point round, a cog's teeth), capped at both ends, every face turned away from its ring's
    centre."""
    cs, us, ws = (np.asarray(a, float) for a in (cs, us, ws))
    ra, rb = np.broadcast_to(ra, len(cs)), np.broadcast_to(rb, len(cs))
    th = np.linspace(0.0, 2 * np.pi, n, endpoint=False)
    k = radius(np.arange(n)) if radius else np.ones(n)
    v = np.concatenate([c + np.outer(a * k * np.cos(th), u) + np.outer(b * k * np.sin(th), w)
                        for c, u, w, a, b in zip(cs, us, ws, ra, rb)] + [cs[[0, -1]]])
    q, inside = [], []
    for i in range(len(cs) - 1):
        for j in range(n):
            p0, p1 = i * n + j, i * n + (j + 1) % n
            q += [(p0, p1, p1 + n), (p0, p1 + n, p0 + n)]
            inside += [(cs[i] + cs[i + 1]) / 2] * 2
    first, last = len(cs) * n, len(cs) * n + 1
    for j in range(n):
        q += [(first, j, (j + 1) % n), (last, (len(cs) - 1) * n + j, (len(cs) - 1) * n + (j + 1) % n)]
        inside += [cs[0] + (cs[1] - cs[0]) * 0.01, cs[-1] + (cs[-2] - cs[-1]) * 0.01]
    return v, outward(v, q, np.array(inside))


def _frames(path):
    """A path's own across and back at each point, turning with it."""
    d = np.gradient(path, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-12
    ref = np.where(np.abs(d[:, [2]]) < 0.9, [[0.0, 0.0, 1.0]], [[1.0, 0.0, 0.0]])
    u = np.cross(d, ref)
    u /= np.linalg.norm(u, axis=1, keepdims=True) + 1e-12
    return u, np.cross(d, u)


def wire(path, r, n=5):
    """A round wire along `path`."""
    u, w = _frames(path)
    return tube(path, u, w, r, r, n=n)


def rod(a, b, r):
    """A thin square rod from point `a` to point `b`: a frame's side, a rib, a feather's ridge."""
    return facets(*wire(np.array([a, b], float), r, n=4))


def ball(at, r, n=6):
    """A small ball: a bead, a rivet's head."""
    lat = np.linspace(-np.pi / 2, np.pi / 2, n // 2 + 2)[1:-1]
    cs = [at + np.array([0.0, 0.0, r * np.sin(t)]) for t in lat]
    rr = [r * np.cos(t) for t in lat]
    return tube(cs, [[1.0, 0.0, 0.0]] * len(cs), [[0.0, 1.0, 0.0]] * len(cs), rr, rr, n=n)


def pyramid(foot, along, across, up, half, wide, tall, lean):
    """A four-sided pyramid: its foot `half` along and `wide` across, its point `tall` up and leaning `lean` along."""
    v = np.array([foot - along * half - across * wide, foot + along * half - across * wide,
                  foot + along * half + across * wide, foot - along * half + across * wide,
                  foot + up * tall + along * lean])
    q = outward(v, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [0, 2, 1], [0, 3, 2]], foot + up * tall * 0.25)
    return facets(v, q)


def _lofted(rings, centres):
    """Rings of as many points each, joined face to face about their centres and capped at both ends."""
    n = len(rings[0])
    v = np.concatenate(rings + [np.array([centres[0], centres[-1]])])
    q, inside = [], []
    for i in range(len(rings) - 1):
        for j in range(n):
            p0, p1 = i * n + j, i * n + (j + 1) % n
            q += [(p0, p1, p1 + n), (p0, p1 + n, p0 + n)]
            inside += [(centres[i] + centres[i + 1]) / 2] * 2
    lo, hi = len(v) - 2, len(v) - 1
    last = (len(rings) - 1) * n
    for j in range(n):
        q += [(lo, j, (j + 1) % n), (hi, last + j, last + (j + 1) % n)]
        inside += [centres[0] + (centres[1] - centres[0]) * 0.01, centres[-1] + (centres[-2] - centres[-1]) * 0.01]
    return v, outward(v, q, np.array(inside))


def _unit(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v) + 1e-12)


# -- a limb

class _Limb:
    """A limb's line and its faces at each place along it: the face the eye meets (`seen`: 'belly', the first-person
    eye's, behind the string; 'side', a held bow's picture, the bow's plane), the way across that face, and the limb's
    outline beside it, where what stands off it shows. A make's places are metres past the riser, `riser` along the
    line, stretched `k` times along a longer span (`z`)."""

    def __init__(self, c, w, a, b, x, seen, riser=0.0, k=1.0):
        self.c, self.w, self.a, self.b, self.x = c, w, a, b, x
        self.s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))])
        self.belly = seen == 'belly'
        self.riser, self.k = riser, k

    def z(self, p):
        """A make's place `p` (metres past the riser) as metres along the line."""
        return self.riser + p * self.k

    def sec(self, z):
        """At `z` metres: (centre, way along, across, its half-size, back, its half-size)."""
        s = self.s
        i = np.interp(z, s, np.arange(len(s)))
        j = min(int(i), len(s) - 2)
        f = i - j
        lerp = lambda arr: arr[j] * (1 - f) + arr[j + 1] * f   # noqa: E731
        return lerp(self.c), _unit(self.c[j + 1] - self.c[j]), self.x, lerp(self.a), _unit(lerp(self.w)), lerp(self.b)

    def at(self, z):
        """At `z` metres: (centre, way along, face, its half-size, across, its half-size, outline's way)."""
        p, d, x, a, w, b = self.sec(z)
        if self.belly:
            return p, d, -w, b, x, a, -x
        return p, d, -x, a, w, b, w

    def sleeve(self, rows, n=8, radius=None, flat=True, lift=0.0015):
        """A sleeve round the limb: a ring at each (place, growth) row, the limb's girth that many times there and a
        hair proud of it."""
        secs = [self.sec(self.z(p)) for p, _ in rows]
        m = tube([s[0] for s in secs], [s[2] for s in secs], [s[4] for s in secs],
                 [s[3] * g + lift for s, (_, g) in zip(secs, rows)],
                 [s[5] * g + lift for s, (_, g) in zip(secs, rows)], n=n, radius=radius)
        return facets(*m) if flat else m

    def band(self, p, long, grow, n=8, bevel=0.3):
        """A band round the limb from place `p`, `long` metres along, `grow` times its girth, its ends bevelled."""
        q = long / self.k
        return self.sleeve([(p, grow * 0.92), (p + q * bevel, grow), (p + q * (1 - bevel), grow), (p + q, grow * 0.92)],
                           n=n)

    def spot(self, p, off=0.0, side=1.0, lift=0.0):
        """A point on the face the eye meets at place `p` (`side` -1 the face behind it), `off` of its half-span
        across: (the point, along, out of the face, across)."""
        c, d, f, hf, g, hg, e = self.at(self.z(p))
        f = f * side
        return c + g * off * hg + f * (hf + lift), d, f, g

    def stud(self, p, off, half, tall, side=1.0):
        """A four-sided point on the face."""
        at, d, f, g = self.spot(p, off, side)
        return pyramid(at - f * 0.0008, d, g, f, half, half, tall, 0.0)

    def rivet(self, p, off, r, side=1.0):
        """A rivet's round head on the face."""
        return ball(self.spot(p, off, side, r * 0.4)[0], r)

    def boss(self, p, r, tall, side=1.0, n=10):
        """A round boss on the face, its top flat and narrower."""
        at, d, f, g = self.spot(p, 0.0, side)
        return facets(*tube([at - f * 0.001, at + f * tall], [d, d], [g, g], [r, r * 0.62], [r, r * 0.62], n=n))

    def lozenge(self, p, long, wide, tall, side=1.0):
        """A lozenge boss on the face, its points along the limb and across it."""
        at, d, f, g = self.spot(p, 0.0, side)
        v = np.array([at - d * long, at + g * wide, at + d * long, at - g * wide, at + f * tall])
        return facets(v, outward(v, [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [0, 2, 1], [0, 3, 2]],
                                 at + f * tall * 0.25))

    def frame(self, p0, p1, share, r, side=1.0, bars=()):
        """A raised frame on the face from place `p0` to `p1`, `share` of its half-span across, bars across it at
        `bars` places: [(vertices, triangles)]."""
        corners = [self.spot(p, o * share, side, r)[0] for p, o in ((p0, -1), (p1, -1), (p1, 1), (p0, 1))]
        out = [rod(corners[j], corners[(j + 1) % 4], r) for j in range(4)]
        return out + [rod(self.spot(p, -share, side, r)[0], self.spot(p, share, side, r)[0], r) for p in bars]

    def strap(self, p0, p1, share, thin, side=1.0, point=0.3):
        """A strap lying along the face from place `p0` to `p1`, `share` of its half-span wide, its last `point` of its
        length drawn to a point."""
        ps = np.linspace(p0, p1, 8)
        u = (ps - p0) / (p1 - p0)
        w = share * np.clip((1 - u) / point, 0.04, 1.0)
        rows = [self.spot(p, 0.0, side, thin) for p in ps]
        return facets(*tube([r[0] for r in rows], [r[3] for r in rows], [r[2] for r in rows],
                            [self.at(self.z(p))[5] * ww for p, ww in zip(ps, w)], thin, n=4))

    def facing(self, p0, p1, share, thin, n=8, k=16):
        """A strip lying on the face the eye meets, `share` of its half-span wide."""
        rows = [self.at(self.z(p)) for p in np.linspace(p0, p1, k)]
        return tube([r[0] + r[2] * (r[3] + thin) for r in rows], [r[4] for r in rows], [r[2] for r in rows],
                    [r[5] * share for r in rows], thin, n=n)

    def round(self, ps, turns, lift, phase=0.0):
        """A path wound round the limb, `turns` round over places `ps`, `lift` off its surface."""
        out = []
        for p, t in zip(ps, phase + 2 * np.pi * turns * (ps - ps[0]) / max(ps[-1] - ps[0], 1e-9)):
            c, d, x, a, w, b = self.sec(self.z(p))
            out.append(c + x * np.cos(t) * (a + lift) + w * np.sin(t) * (b + lift))
        return np.array(out)

    def blade(self, ps, h, thick, sweep=0.0):
        """A thin blade off the outline, `h` tall at each of places `ps`, its edge swept `sweep` of its height toward
        the tip: a diamond section from inside the limb to its edge, its midrib a crease toward the eye. Gives the
        blade and its edge's points."""
        rows = [self.at(self.z(p)) for p in ps]
        root = [r[0] + r[6] * r[5] * 0.4 for r in rows]
        top = [r[0] + r[6] * (r[5] + hh) + r[1] * sweep * hh for r, hh in zip(rows, h)]
        cs = [(p + q) / 2 for p, q in zip(root, top)]
        us = [_unit(q - p) for p, q in zip(root, top)]
        ra = [np.linalg.norm(q - p) / 2 for p, q in zip(root, top)]
        return facets(*tube(cs, us, [r[2] for r in rows], ra, thick, n=4)), np.array(top)

    def horn(self, p, tall, hook, girth, bend=1.6):
        """A horn or a claw off the outline: thick at its root, curving `hook` along as it rises to its point."""
        c, d, f, hf, g, hg, e = self.at(self.z(p))
        t = np.linspace(0.0, 1.0, 12)
        path = c + np.outer(hg * 0.55 + tall * t, e) + np.outer(hook * t ** bend, d)
        u, w = _frames(path)
        r = girth * (1.0 - t) ** 0.85 + 0.0005
        return tube(path, u, w, r, r, n=8)

    def claw(self, p0, p1, turn, bow, girth, n=6):
        """A claw from place `p0` round the limb at angle `turn` (0 its outline, a quarter turn the face the eye
        meets), bowing `bow` out from it and curling in to its point at `p1`."""
        t = np.linspace(0.0, 1.0, 10)
        pts = []
        for tt in t:
            c, d, x, a, w, b = self.sec(self.z(p0 + (p1 - p0) * tt))
            way = (-x if self.belly else w) * np.cos(turn) + (-w if self.belly else -x) * np.sin(turn)
            reach = (a if self.belly else b) * abs(np.cos(turn)) + (b if self.belly else a) * abs(np.sin(turn))
            pts.append(c + way * (reach * (0.9 + 0.4 * np.sin(np.pi * tt * 0.8)) + bow * np.sin(np.pi * tt) ** 0.8
                                  - 0.004 * tt ** 3))
        pts = np.array(pts)
        u, w = _frames(pts)
        r = girth * (1.0 - t * 0.92)
        return facets(*tube(pts, u, w, r, r * 1.3, n=n))

    def feather(self, p, angle, length, wide, thick, lift):
        """A feather off the outline from place `p`, leaving it `angle` radians from the limb's line and sweeping
        `length` toward the tip, `wide` at its broadest, `lift` toward the eye over the one before: a leaf of the metal
        and its quill. [((vertices, triangles), stuff)]"""
        c, d, f, hf, g, hg, e = self.at(self.z(p))
        s = np.linspace(0.0, 1.0, 12)
        root = c + e * hg * 0.5 + f * lift
        path = root + np.outer(s * length, d * np.cos(angle) + e * np.sin(angle)) - np.outer(
            (s * length) ** 2 * 1.2 * np.sin(angle), e)
        inner = np.stack([_unit(np.cross(f, q)) for q in np.gradient(path, axis=0)])
        w = wide * np.sin(np.pi * np.clip(s, 0.0, 1.0) ** 0.75) ** 0.7 + 0.0008
        leaf = facets(*tube(path, inner, [f] * len(s), w / 2, thick, n=4))
        return [(leaf, 'metal'), (rod(path[0] + f * thick, path[9] + f * thick, 0.0009), 'metal')]

    def cog(self, p, rad, teeth):
        """A toothed wheel lying on the face the eye meets, its hub and axle standing from it."""
        c, d, f, hf, g, hg, e = self.at(self.z(p))
        base = c + f * hf
        tooth = lambda j: np.where(j % 4 < 2, 1.0, 1.22)   # noqa: E731
        wheel = facets(*tube([base + f * 0.0005, base + f * 0.0055], [d, d], [g, g], rad, rad, n=teeth * 4,
                             radius=tooth))
        hub = facets(*tube([base + f * 0.005, base + f * 0.009], [d, d], [g, g], rad * 0.42, rad * 0.42, n=8))
        axle = ball(base + f * 0.009, rad * 0.16)
        return [wheel, hub, axle]

    def crescent(self, p, half, tall, wide, thick):
        """A thin crescent standing off the outline at place `p`: its back on the limb, its two horns `half` along
        either way and rising `tall` off it, `wide` across at its middle."""
        c, d, f, hf, g, hg, e = self.at(self.z(p))
        th = np.linspace(-1.0, 1.0, 15)
        mid = c + e * (hg * 0.6)
        path = mid + np.outer(th * half, d) + np.outer(tall * np.abs(th) ** 1.6 + wide * 0.5, e)
        inner = np.stack([_unit(np.cross(f, q)) for q in np.gradient(path, axis=0)])
        w = wide * np.cos(th * np.pi / 2) ** 0.7 + 0.0008
        return facets(*tube(path, inner, [f] * len(th), w / 2, thick, n=4))

    def ruff(self, p, many, long, girth, seed=3):
        """A ruff of fur round the limb at place `p`: tufts out from it and back toward the grip."""
        rng = np.random.default_rng(seed)
        c, d, x, a, w, b = self.sec(self.z(p))
        out = []
        for j in range(many):
            t = 2 * np.pi * (j + rng.uniform(-0.2, 0.2)) / many
            radial = x * np.cos(t) * a + w * np.sin(t) * b
            foot = c + radial * 1.15
            up = _unit(_unit(radial) * 0.8 - d * 0.6)
            across = _unit(np.cross(up, d))
            out.append(pyramid(foot, _unit(np.cross(across, up)), across, up, girth, girth,
                               long * rng.uniform(0.8, 1.25), 0.0))
        return out

    def stones(self, p, many, r, turn=0.0):
        """Stones set round the limb at place `p`, `many` of them: four-sided, low."""
        c, d, x, a, w, b = self.sec(self.z(p))
        out = []
        for j in range(many):
            t = turn + 2 * np.pi * j / many
            radial = x * np.cos(t) * (a + 0.0012) + w * np.sin(t) * (b + 0.0012)
            up = _unit(x * np.cos(t) * b + w * np.sin(t) * a)
            out.append(pyramid(c + radial, d, _unit(np.cross(up, d)), up, r, r, r * 0.7, 0.0))
        return out


# -- each metal's make: the stave, then its work. Places are metres past the riser along SEEN.

def _iron(L):
    """Forged rough: a socket flaring from the riser up a heavy stave, nailed through a strap down its face and its
    back, and square bands up the limb, all hammered."""
    out = [(L.sleeve([(-0.012, 1.46), (-0.004, 1.5), (0.008, 1.4), (0.032, 1.2), (0.05, 1.12)]), 'head')]
    for side in (1.0, -1.0):
        out += [(L.strap(0.03, 0.13, 0.42, 0.0018, side), 'head'), (L.stud(0.09, 0.0, 0.0034, 0.0032, side), 'head'),
                (L.stud(0.014, 0.0, 0.0038, 0.0034, side), 'head')]
    out += [(L.band(p, 0.016, 1.18), 'head') for p in (0.16, 0.25)]
    return out


def _steel(L):
    """A smith's dressed work: a squared band at the riser, each face a framed panel round a boss, and a band before
    the limb runs on; the grip strapped, ringed and corded (`grip`)."""
    out = [(L.band(-0.012, 0.02, 1.32), 'metal'), (L.band(0.105, 0.012, 1.16), 'metal'),
           (L.band(0.2, 0.01, 1.14), 'metal')]
    for side in (1.0, -1.0):
        out += [(m, 'metal') for m in L.frame(0.022, 0.092, 0.62, 0.0018, side)]
        out.append((L.boss(0.057, 0.0085, 0.0038, side), 'metal'))
        out += [(m, 'metal') for m in L.frame(0.125, 0.185, 0.56, 0.0016, side)]
        out.append((L.boss(0.155, 0.007, 0.0032, side), 'metal'))
    return out


def _silver(L):
    """Ornate: an engraved sleeve at the riser, ringed and beaded at its lip; a slender horn off the outline curving
    up; a lozenge boss in a frame on each face, and a beaded ring past it."""
    out = [(L.sleeve([(-0.012, 1.5), (-0.004, 1.3), (0.055, 1.12)]), 'metal')]
    out += [(L.band(p, 0.007, 1.24), 'metal') for p in (-0.006, 0.024, 0.052)]
    out += _beads(L, 0.064, 12)
    out.append((L.horn(0.075, 0.042, 0.05, L.at(L.z(0.075))[5] * 0.55, bend=1.8), 'metal'))
    for side in (1.0, -1.0):
        out += [(m, 'metal') for m in L.frame(0.1, 0.18, 0.6, 0.0016, side)]
        out.append((L.lozenge(0.14, 0.03, L.at(L.z(0.14))[5] * 0.45, 0.004, side), 'metal'))
    out += _beads(L, 0.21, 12)
    return out


def _beads(L, p, many):
    """A ring of beads between two fine bands."""
    out = [(L.band(p - 0.0065, 0.002, 1.08, n=12), 'metal'), (L.band(p + 0.0045, 0.002, 1.08, n=12), 'metal')]
    c, d, x, a, w, b = L.sec(L.z(p))
    for t in np.linspace(0.0, 2 * np.pi, many + 1)[:-1]:
        out.append((ball(c + x * np.cos(t) * (a + 0.0014) + w * np.sin(t) * (b + 0.0014), 0.0024), 'metal'))
    return out


def _elven(L):
    """A bird of prey's: the limb's face in gold, a sleeve flaring into the riser with a leaf raised on each face and a
    band at its foot, and a wing of four feathers fanned up off the outline, a smaller wing of two past it."""
    out = [(L.facing(0.0, SEEN, 0.62, 0.0009), 'metal'),
           (L.sleeve([(-0.012, 1.3), (-0.004, 1.24), (0.03, 1.1), (0.068, 1.05)], n=12), 'metal'),
           (L.band(0.068, 0.008, 1.18), 'metal')]
    for side in (1.0, -1.0):
        out.append((L.lozenge(0.034, 0.024, L.at(L.z(0.034))[5] * 0.5, 0.003, side), 'metal'))
    for k, (angle, length, wide) in enumerate(((0.12, 0.2, 0.022), (0.24, 0.16, 0.021), (0.37, 0.12, 0.019),
                                                (0.5, 0.085, 0.016))):
        out += L.feather(0.05, angle, length, wide, 0.0012, k * 0.0014)
    for k, (angle, length, wide) in enumerate(((0.16, 0.09, 0.014), (0.34, 0.065, 0.012))):
        out += L.feather(0.21, angle, length, wide, 0.0011, k * 0.0013)
    return out


def _dwarven(L):
    """Dwemer work, square and engineered: a ribbed drum at the riser flaring to a toothed rim, a wheel on the face
    past it, then framed panels parted by a bar and riveted, and rails down both edges."""
    out = [(L.sleeve([(-0.012, 1.22), (0.0, 1.22), (0.008, 1.42), (0.046, 1.52), (0.05, 1.68), (0.06, 1.68),
                      (0.064, 1.5)]), 'metal'),
           (L.sleeve([(0.05, 1.82), (0.058, 1.82)], n=32, radius=lambda j: np.where(j % 2, 1.0, 1.14)), 'metal')]
    c, d, x, a, w, b = L.sec(L.z(0.028))
    for j in range(8):   # the drum's ribs
        t = 2 * np.pi * (j + 0.5) / 8
        ends = [L.sec(L.z(p))[0] + x * np.cos(t) * (a * g + 0.0015) + w * np.sin(t) * (b * g + 0.0015)
                for p, g in ((0.012, 1.45), (0.044, 1.53))]
        out.append((rod(*ends, 0.0022), 'metal'))
    out += [(m, 'metal') for m in L.cog(0.095, 0.017, 12)]
    for side in (1.0, -1.0):
        out += [(m, 'metal') for m in L.frame(0.125, 0.29, 0.74, 0.0022, side, bars=(0.2075,))]
        out += [(L.rivet(p, o, 0.0019, side), 'metal') for p in (0.135, 0.195, 0.22, 0.28) for o in (-0.42, 0.42)]
    for edge in (-1.0, 1.0):   # square rails down both edges
        rows = [L.sec(L.z(p)) for p in np.linspace(0.07, SEEN, 12)]
        cs = [r[0] + r[2] * edge * (r[3] + 0.0026) for r in rows]
        out.append((facets(*tube(cs, [r[2] for r in rows], [r[4] for r in rows], 0.0026, 0.0026, n=4)), 'metal'))
    return out


def _mithril(L):
    """Light and keen, on wood: a slender sleeve at the riser banded blue at both ends, a blue orb on each face past
    it, and two thin crescents off the outline, their horns rising."""
    out = [(L.sleeve([(-0.012, 1.34), (0.0, 1.22), (0.05, 1.12)]), 'metal'),
           (L.band(-0.012, 0.008, 1.42, n=12), 'accent'), (L.band(0.044, 0.008, 1.24, n=12), 'accent')]
    out.append((L.sleeve([(0.06, 1.1), (0.066, 1.26), (0.084, 1.26), (0.09, 1.1)], n=12), 'metal'))
    for side in (1.0, -1.0):   # an orb set in that collar on each face
        at, d, f, g = L.spot(0.075, 0.0, side)
        out.append((ball(at + f * 0.0025, 0.0078, n=12), 'accent'))
    out += [(L.crescent(0.12, 0.05, 0.036, 0.016, 0.0018), 'metal'),
            (L.crescent(0.22, 0.04, 0.028, 0.013, 0.0016), 'metal')]
    out += [(L.band(p, 0.006, 1.16, n=12), 'accent') for p in (0.165, 0.265)]
    return out


def _adamantium(L):
    """The mountain's heart: a shard of dark crystal round the limb's root, held at its middle by a crowned band, gold
    points along both its edges and dark stones between; past it the pale limb banded in gold, dark stones set round
    it between its bands."""
    rng = np.random.default_rng(7)
    th0 = np.linspace(0.0, 2 * np.pi, 7, endpoint=False) + rng.uniform(-0.2, 0.2, 7)
    rings, centres = [], []
    for p, s in ((-0.012, 1.05), (0.0, 1.5), (0.028, 1.75), (0.055, 1.62), (0.08, 1.25), (0.095, 1.0)):
        c, d, x, a, w, b = L.sec(L.z(p))
        th, r = th0 + rng.uniform(-0.1, 0.1, 7), s * rng.uniform(0.86, 1.12, 7)
        rings.append(c + np.outer(np.cos(th) * r * a, x) + np.outer(np.sin(th) * r * b * 1.25, w))
        centres.append(c)
    out = [(facets(*_lofted(rings, centres)), 'head')]
    out.append((L.sleeve([(0.03, 1.86), (0.032, 1.96), (0.046, 1.96), (0.048, 1.86)], n=14), 'accent'))
    c, d, x, a, w, b = L.sec(L.z(0.039))
    for j in range(8):   # its crown: a gold point out along the limb from each edge, a dark stone between
        t = 2 * np.pi * (j + 0.5) / 8
        radial = x * np.cos(t) * a * 1.9 + w * np.sin(t) * b * 1.9
        for way in (-1.0, 1.0):
            foot = c + radial + d * way * 0.008
            out.append((pyramid(foot, _unit(radial), _unit(np.cross(d, radial)), d * way, 0.0032, 0.0032, 0.013, 0.0),
                        'accent'))
    out += [(m, 'head') for m in L.stones(0.039, 8, 0.0034)]
    out += [(L.band(p, 0.01, 1.2), 'accent') for p in (0.12, 0.2, 0.28)]
    out += [(m, 'head') for p in (0.15, 0.17) for m in L.stones(p, 4, 0.0042, turn=np.pi / 4)]
    return out


def _ebony(L):
    """Black glass worked sharp: an engraved sleeve at the riser, ringed, a wire wound up it; a long edged blade off the
    outline curving up, and a crest of glassy shards past it, each edged bright."""
    out = [(L.sleeve([(-0.012, 1.5), (-0.004, 1.3), (0.05, 1.16)]), 'metal')]
    out += [(L.band(p, 0.006, 1.3), 'metal') for p in (-0.004, 0.016, 0.034, 0.05)]
    out.append((wire(L.round(np.linspace(0.0, 0.05, 60), 2.5, 0.0035), 0.0012), 'metal'))
    ps = np.linspace(0.04, 0.16, 25)
    u = (ps - ps[0]) / (ps[-1] - ps[0])
    blade, top = L.blade(ps, 0.036 * u ** 0.9 * (1 - u) ** 0.25 / 0.8 + 0.0015, 0.0016, sweep=0.8)
    out += [(blade, 'metal'), (wire(top, 0.0011, n=4), 'accent')]
    rng = np.random.default_rng(7)
    many = 7
    for i in range(many):
        p = 0.17 + 0.13 * (i + 0.5 + rng.uniform(-0.3, 0.3)) / many
        c, d, f, hf, g, hg, e = L.at(L.z(p))
        h = 0.03 * rng.uniform(0.35, 1.0) ** 1.4
        up = _unit(e + f * rng.uniform(-0.3, 0.3))
        foot = c + e * min(hg, hf) * 0.6
        half, lean = rng.uniform(0.005, 0.011), h * rng.uniform(0.2, 0.7)
        out.append((pyramid(foot, d, np.cross(up, d), up, half, hf * 0.5, h, lean), 'metal'))
        tip = foot + up * h + d * lean
        out += [(rod(foot + d * s * half, tip, 0.0008), 'accent') for s in (-1.0, 1.0)]
    return out


def _orcish(L):
    """Crude and cruel: a broad sleeve at the riser, two ridges down each face and a rivet between, a ruff of fur at its
    far end; heavy claws hooking back off the outline, an iron band and a braided binding between them."""
    out = [(L.sleeve([(-0.012, 1.36), (-0.004, 1.32), (0.02, 1.22), (0.052, 1.1)], n=10), 'metal')]
    for side in (1.0, -1.0):
        for o in (-0.45, 0.45):
            out.append((rod(L.spot(0.002, o * 1.3, side, 0.004)[0], L.spot(0.046, o * 1.1, side, 0.0028)[0], 0.0018),
                        'metal'))
        out.append((L.rivet(0.026, 0.0, 0.0034, side), 'metal'))
    out += [(m, 'grip') for m in L.ruff(0.056, 18, 0.02, 0.0036)]
    for p, tall, girth in ((0.1, 0.05, 1.0), (0.18, 0.044, 0.9), (0.26, 0.038, 0.8)):
        out.append((L.horn(p, tall, -0.034, L.at(L.z(p))[5] * girth, bend=2.2), 'head'))
    out.append((L.band(0.14, 0.016, 1.2, n=7), 'metal'))
    zs = np.linspace(0.205, 0.235, 120)
    for way in (1.0, -1.0):
        out.append((wire(L.round(zs, way * 3.5, 0.0016), 0.0021, n=5), 'grip'))
    return out


def _daedric(L):
    """Daedric: a jagged collar at the riser, a cage of black claws bowing out round a glowing core and curling in past
    it; a serrated spine up the outline, horns curving back toward the grip, studs down the face and a vein glowing
    down it."""
    out = [(L.sleeve([(-0.012, 1.3), (-0.004, 1.5), (0.006, 1.2)], n=12, radius=lambda j: np.where(j % 2, 1.0, 1.3)),
            'head'),
           (L.sleeve([(0.012, 1.0), (0.02, 1.32), (0.046, 1.36), (0.056, 1.0)], n=12, flat=False), 'vein')]
    for j in range(5):
        out.append((L.claw(0.0, 0.074, 2 * np.pi * (j + 0.5) / 5, 0.009, 0.0032), 'head'))
    ps = np.linspace(0.09, SEEN, int((SEEN - 0.09) / 0.013) * 8 + 1)
    out.append((L.blade(ps, 0.002 + 0.008 * ((ps - ps[0]) / 0.013 % 1.0), 0.0018)[0], 'head'))
    for p, tall in ((0.13, 0.05), (0.21, 0.054), (0.29, 0.05)):
        out.append((L.horn(p, tall, -0.042, L.at(L.z(p))[3] * 1.3, bend=2.0), 'head'))
    out.append((L.band(0.085, 0.01, 1.2), 'head'))
    for side in (1.0, -1.0):
        out += [(L.stud(p, o, 0.0026, 0.003, side), 'head') for p in (0.115, 0.165, 0.215, 0.265) for o in (-0.6, 0.6)]
    out.append((L.facing(0.09, SEEN, 0.16, 0.0007, n=6), 'vein'))
    return out


def _plain(L):
    return []


def _steel_grip(H):
    import fpwarhammers as wh
    return wh._dressed(H, strap=0.04, rings=(0.046, 0.054, 0.062), wound=(0.07, H['haft_len'] - 0.012), turns=2.5)


def _iron_grip(H):
    import fpwarhammers as wh
    return wh._bands(H, at=(0.032,))


def _silver_grip(H):
    import fpwarhammers as wh
    return wh._wrapped(H, sleeve=0.04, turns=5.0)


def _elven_grip(H):
    import fpwarhammers as wh
    return wh._leafed(H, sleeve=0.045, turns=4.0)


def _sheathed_grip(collars=(0.012, 0.062), studs=0.03, stones=()):
    """A grip sheathed in the metal, collared at `collars` above its middle and studded down each side every `studs`;
    or, with `stones`, banded in the metal's own colour, dark stones set round it at those heights (adamantium's)."""
    def work(H):
        import fpwarhammers as wh
        from fpwarhammer import HEAD
        out = wh._sheathed(H, collars=collars, studs=None if stones else studs,
                           bands=wh.ACCENT if stones else wh.COLLAR)
        for z in stones:
            g = H['haft_r'] * 1.08
            out += [wh.stud(np.array([np.cos(t) * g, np.sin(t) * g, z]), [np.cos(t), np.sin(t), 0.0], 0.0055, 0.0035,
                            HEAD) for t in np.arange(4) * np.pi / 2 + np.pi / 4]
        return out
    return work


def _mithril_grip(H):
    import fpwarhammers as wh
    return wh._collar({**H, 'haft_len': H['haft_len'] - 0.03, 'collar_len': 0.03, 'collar_r': 1.14}, 'banded')


def _ebony_grip(H):
    import fpwarhammers as wh
    return wh._engraved(H, sleeve=0.045, turns=3.0)


def _orcish_grip(H):
    import fpwarhammers as wh
    return wh._bound(H, sleeve=0.045, turns=5.0)


# each metal's make: its stave (its width and thickness over the fitted bow's, its sides, its stuff, its twist), the
# work on its limbs past the riser, its grip's dressing, and whether Daggerfall's collars still bind its grip.
# Steel's departs from Daggerfall's plain bow: a smith's dressed work, as its warhammer is
LOOK = {
    None: {'make': _plain},
    'Iron': {'width': 1.15, 'thick': 1.15, 'make': _iron, 'grip': _iron_grip},
    'Steel': {'make': _steel, 'grip': _steel_grip, 'collars': False},
    'Silver': {'width': 0.85, 'thick': 0.9, 'make': _silver, 'grip': _silver_grip, 'collars': False},
    'Elven': {'width': 0.8, 'thick': 0.85, 'make': _elven, 'grip': _elven_grip, 'collars': False},
    'Dwarven': {'width': 1.3, 'thick': 1.1, 'sides': 4, 'metal': True, 'facet': True, 'make': _dwarven,
                'grip': _sheathed_grip(), 'collars': False},
    'Mithril': {'width': 0.9, 'thick': 0.9, 'make': _mithril, 'grip': _mithril_grip},
    'Adamantium': {'width': 1.5, 'thick': 0.85, 'sides': 6, 'metal': True, 'facet': True, 'make': _adamantium,
                   'grip': _sheathed_grip(collars=(0.07,), stones=(0.036, 0.048)), 'collars': False},
    'Ebony': {'width': 0.85, 'thick': 1.25, 'sides': 6, 'metal': True, 'facet': True, 'twist': 0.35, 'make': _ebony,
              'grip': _ebony_grip, 'collars': False},
    'Orcish': {'width': 1.4, 'thick': 1.3, 'sides': 8, 'make': _orcish, 'grip': _orcish_grip, 'collars': False},
    'Daedric': {'width': 1.1, 'metal': True, 'make': _daedric, 'grip': _sheathed_grip(studs=0.026), 'collars': False},
}
# the warhammer's materials (fpwarhammer.py, fpwarhammers.py) as a bow's stuffs, by their index there
HAMMER_STUFF = ('head', 'metal', 'wood', 'accent', 'vein', 'grip')
# a bow built in the stuffs a sprite's bow knows (gear.py `build_metal_bow`): its motif and fittings its grey metal for
# the dye, its leather its armour's strap, as a staff's are (staffs.py `PLAIN`)
PLAIN = {'head': 'metal', 'accent': 'metal', 'grip': 'cord'}
GRIP_R = 1.0   # the grip's dressing's girth over the wrap's: its own wrap and sheath clear of the wrap's corners
RING_AT = 0.012   # its band over the hands, above the grip's middle, and its twin below
# the grip's dressing held near a collar's girth (fpbow.py `collar_r`): past CAP times the wrap's girth, its reach is
# drawn in to SQUEEZE of itself. A haft's sleeve flares into a head several times its girth; a limb is no wider than
# the grip, and the full flare stood round the riser as a lampshade
CAP, SQUEEZE = 1.3, 0.3


def look(metal):
    """`metal`'s make; Daggerfall's plain bow for none."""
    return LOOK[metal]


def grip(lk, r, g):
    """The grip's dressing in first person, about the bow's axis (+Z): the metal's warhammer's haft work, as its staff's
    pole wears it, from the wrap's middle up to its upper collar at `g` (`r` the wrap's girth), and its mirror down to
    the lower. [(vertices, triangles, stuff)]"""
    work = lk.get('grip')
    if not work:
        return []
    H = {'haft_len': g, 'haft_r': r * GRIP_R, 'haft_taper': 1.0, 'collar_len': 0.0, 'haft_below': 0.0,
         'ring_at': RING_AT}
    out = []
    for v, t, m in work(H):
        v, t = np.asarray(v, float).copy(), np.asarray(t)
        reach = np.hypot(v[:, 0], v[:, 1])
        cap = CAP * r
        far = reach > cap
        v[far, :2] *= ((cap + (reach[far] - cap) * SQUEEZE) / reach[far])[:, None]
        out += [(v, t, HAMMER_STUFF[m]), (v * np.array([1.0, 1.0, -1.0]), t[:, ::-1], HAMMER_STUFF[m])]
    return out


def limb(lk, c, w, a, b, x, seen='belly', span=SEEN, riser=0.0, own=None):
    """A limb in look `lk`: along its line `c` (its back `w`, its half-width `a` and half-thickness `b` at each point,
    `x` its across), the stave and its work, which runs `span` metres past the riser at `riser` along the line (SEEN's
    places stretched along it): [(vertices, triangles, stuff)]. `seen` is the face the eye meets (_Limb). Its stuffs
    are its own with `own` (first person's, by default), else folded onto a sprite bow's (PLAIN)."""
    c, w, x = np.asarray(c, float), np.asarray(w, float), np.asarray(x, float)
    a, b = a * lk.get('width', 1.0), b * lk.get('thick', 1.0)
    k = span / SEEN
    L = _Limb(c, w, a, b, x, seen, riser, k)
    stuff = 'metal' if lk.get('metal') else 'wood'
    th = (2 * np.pi * lk.get('twist', 0.0) * L.s / SEEN)[:, None]   # its section turned `twist` times along SEEN
    us, ws = np.cos(th) * x + np.sin(th) * w, np.cos(th) * w - np.sin(th) * x
    stave = tube(c, us, ws, a, b, n=lk.get('sides', 10))
    out = [(*(facets(*stave) if lk.get('facet') else stave), stuff)]
    out += [(np.asarray(v, float), np.asarray(q), s) for (v, q), s in lk['make'](L)]
    own = seen == 'belly' if own is None else own
    return out if own else [(v, q, PLAIN.get(s, s)) for v, q, s in out]
