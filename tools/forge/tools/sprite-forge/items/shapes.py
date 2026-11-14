"""The item forge's meshes, in metres, z up. Each builder returns (vertices, faces): plain lists, so a model can move,
turn and bend them before the kit makes them an object (`kit.Item.add`). Pure: no Blender here, and a seeded builder
draws its noise from its own seed, so one row gives one mesh."""
import math

import numpy as np


def lathe(profile, sides=16, top=False, foot=False, loop=False):
    """A solid of turning: `profile` [(radius, z), ...] from top to foot, turned round z in `sides` steps. `top` and
    `foot` close the ends with a fan; `loop` joins the last point to the first (a ring's section)."""
    verts, faces = [], []
    n = len(profile)
    for r, z in profile:
        for k in range(sides):
            a = 2 * math.pi * k / sides
            verts.append((r * math.cos(a), r * math.sin(a), z))
    for i in range(n if loop else n - 1):
        j = (i + 1) % n
        for k in range(sides):
            k1 = (k + 1) % sides
            faces.append((i * sides + k, j * sides + k, j * sides + k1, i * sides + k1))
    if top:
        verts.append((0.0, 0.0, profile[0][1]))
        faces += [(len(verts) - 1, (k + 1) % sides, k) for k in range(sides)]
    if foot:
        verts.append((0.0, 0.0, profile[-1][1]))
        base = (n - 1) * sides
        faces += [(len(verts) - 1, base + k, base + (k + 1) % sides) for k in range(sides)]
    return verts, faces


def box(sx, sy, sz, centre=(0.0, 0.0, 0.0)):
    """A box `sx` x `sy` x `sz` about `centre`."""
    cx, cy, cz = centre
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    verts = [(cx + x * hx, cy + y * hy, cz + z * hz) for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    return verts, faces


def frustum(bottom, top, height, z0=0.0):
    """A box that narrows upward: `bottom` and `top` its (x, y) sizes, `height` tall from `z0` (an ingot)."""
    (bx, by), (tx, ty) = bottom, top
    verts = [(x * bx / 2, y * by / 2, z0) for y in (-1, 1) for x in (-1, 1)]
    verts += [(x * tx / 2, y * ty / 2, z0 + height) for y in (-1, 1) for x in (-1, 1)]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    return verts, faces


def ellipsoid(radii, centre=(0.0, 0.0, 0.0), rings=10, sides=16, flat=None):
    """An ellipsoid of `radii` (x, y, z) about `centre`. `flat` cuts it flat at that share of its height from its foot
    (0 none: a whole ellipsoid), as a lump rests on its base."""
    rx, ry, rz = radii
    cx, cy, cz = centre
    profile = []
    for i in range(rings + 1):
        t = math.pi * i / rings
        profile.append((math.sin(t), math.cos(t)))
    if flat:
        cut = -1 + 2 * flat
        profile = [(r, z) for r, z in profile if z >= cut] + [(math.sqrt(max(0.0, 1 - cut * cut)), cut)]
    verts, faces = lathe([(max(r, 1e-4), z) for r, z in profile], sides, top=True, foot=True)
    return [(cx + x * rx, cy + y * ry, cz + z * rz) for x, y, z in verts], faces


def cylinder(radius, length, sides=12, caps=True, radius_end=None):
    """A cylinder along +x from 0 to `length`, `radius` at its start and `radius_end` at its end (a log, a rod)."""
    r1 = radius if radius_end is None else radius_end
    verts, faces = lathe([(radius, 0.0), (r1, length)], sides, top=caps, foot=caps)
    return [(z, x, y) for x, y, z in verts], faces


def prism(points, depth, z0=0.0):
    """A flat shape `points` [(x, y), ...] (counter-clockwise) raised `depth` from `z0`: a board, a tag, a blade."""
    n = len(points)
    verts = [(x, y, z0) for x, y in points] + [(x, y, z0 + depth) for x, y in points]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    faces += [(k, (k + 1) % n, n + (k + 1) % n, n + k) for k in range(n)]
    return verts, faces


def torus(major, minor, steps=24, around=10):
    """A ring in the xy plane about z: `major` its radius, `minor` its wire's."""
    verts, faces = [], []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        for k in range(around):
            b = 2 * math.pi * k / around
            r = major + minor * math.cos(b)
            verts.append((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
    for i in range(steps):
        for k in range(around):
            i1, k1 = (i + 1) % steps, (k + 1) % around
            faces.append((i * around + k, i1 * around + k, i1 * around + k1, i * around + k1))
    return verts, faces


def tube(points, radius, sides=8, radius_end=None, caps=True):
    """A tube along `points` [(x, y, z), ...], `radius` at its start to `radius_end` at its end: a stem, a strap, a
    handle bent along its way."""
    pts = np.asarray(points, dtype=np.float64)
    r_end = radius if radius_end is None else radius_end
    n = len(pts)
    seg = np.diff(pts, axis=0)
    lengths = np.linalg.norm(seg, axis=1)
    along = np.concatenate([[0.0], np.cumsum(lengths)]) / max(lengths.sum(), 1e-9)
    verts, faces = [], []
    up = np.array([0.0, 0.0, 1.0])
    for i in range(n):
        d = seg[min(i, n - 2)] + (seg[i - 1] if 0 < i < n - 1 else 0)
        d = d / (np.linalg.norm(d) or 1.0)
        side = np.cross(d, up)
        if np.linalg.norm(side) < 1e-6:
            side = np.cross(d, np.array([1.0, 0.0, 0.0]))
        side /= np.linalg.norm(side)
        lift = np.cross(side, d)
        r = radius + (r_end - radius) * along[i]
        for k in range(sides):
            a = 2 * math.pi * k / sides
            verts.append(tuple(pts[i] + r * (math.cos(a) * side + math.sin(a) * lift)))
    for i in range(n - 1):
        for k in range(sides):
            k1 = (k + 1) % sides
            faces.append((i * sides + k, i * sides + k1, (i + 1) * sides + k1, (i + 1) * sides + k))
    if caps:
        verts.append(tuple(pts[0]))
        faces += [(len(verts) - 1, (k + 1) % sides, k) for k in range(sides)]
        verts.append(tuple(pts[-1]))
        last = (n - 1) * sides
        faces += [(len(verts) - 1, last + k, last + (k + 1) % sides) for k in range(sides)]
    return verts, faces


def sheet(sx, sy, nx=8, ny=8, lift=None):
    """A thin flat sheet `sx` x `sy` in the xy plane, `nx` x `ny` quads, its z raised by `lift(x, y)` (a pelt that
    lies in folds, a page that curls). One-sided: the kit draws its back as its front."""
    verts = []
    for j in range(ny + 1):
        for i in range(nx + 1):
            x, y = (i / nx - 0.5) * sx, (j / ny - 0.5) * sy
            verts.append((x, y, lift(x, y) if lift else 0.0))
    faces = [(j * (nx + 1) + i, j * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i + 1, (j + 1) * (nx + 1) + i)
             for j in range(ny) for i in range(nx)]
    return verts, faces


def outline_sheet(points, thick, z0=0.0):
    """A flat shape cut from a sheet `thick` deep: `prism` under another name, for pelts, leaves and paper whose
    outline is the drawing."""
    return prism(points, thick, z0)


def wobble(mesh, seed, amp, scale=1.0):
    """Every vertex pushed out along its distance from the mesh's middle by up to `amp` of it, smoothly by place: a
    lump of ore, a stone, a loaf - no two of one model alike. Deterministic in `seed`."""
    verts, faces = mesh
    v = np.asarray(verts, dtype=np.float64)
    mid = v.mean(axis=0)
    rng = np.random.RandomState(seed & 0x7fffffff)
    waves = rng.normal(size=(6, 3)) * scale
    phase = rng.uniform(0, 2 * math.pi, size=6)
    rel = v - mid
    dist = np.linalg.norm(rel, axis=1, keepdims=True)
    unit = rel / np.maximum(dist, 1e-9)
    field = sum(np.sin(unit @ waves[k] * 3.0 + phase[k]) for k in range(6)) / 6
    v = mid + rel * (1 + amp * field[:, None])
    return [tuple(p) for p in v], faces


def moved(mesh, offset=(0.0, 0.0, 0.0), turn=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)):
    """The mesh scaled, then turned by `turn` (degrees about x, then y, then z), then moved by `offset`."""
    verts, faces = mesh
    v = np.asarray(verts, dtype=np.float64) * np.asarray(scale, dtype=np.float64)
    ax, ay, az = (math.radians(t) for t in turn)
    rx = np.array([[1, 0, 0], [0, math.cos(ax), -math.sin(ax)], [0, math.sin(ax), math.cos(ax)]])
    ry = np.array([[math.cos(ay), 0, math.sin(ay)], [0, 1, 0], [-math.sin(ay), 0, math.cos(ay)]])
    rz = np.array([[math.cos(az), -math.sin(az), 0], [math.sin(az), math.cos(az), 0], [0, 0, 1]])
    v = v @ (rz @ ry @ rx).T + np.asarray(offset, dtype=np.float64)
    return [tuple(p) for p in v], faces


def joined(*meshes):
    """Several meshes as one."""
    verts, faces = [], []
    for v, f in meshes:
        base = len(verts)
        verts += list(v)
        faces += [tuple(i + base for i in face) for face in f]
    return verts, faces
