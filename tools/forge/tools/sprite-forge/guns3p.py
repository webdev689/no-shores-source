"""The Dwarven Thunderlock and the Dwarven Pistolet as the forge builds them: real flintlocks of Dwemer make, each part
at the size a gunsmith would make it, so they read as weapons and not as toys.

The Thunderlock is a long rifle: a heavy dark steel barrel, octagonal at the breech and round to a finned bronze
crown; the tonal coil the lore winds round its breech, a fine brass wire round barrel and forestock between two
collars, a teal gem on top; a walnut stock with a raked pistol grip and a full forestock held by two chevroned bands to
a brass nose cap, the ramrod under the barrel past it; a brass lock plate on the right with a steel cock and frizzen
over a brass pan, a brass side plate on the left set with a Dwemer cog round a teal medallion; Dwemer plates with a
cog on the butt; a slim brass trigger guard, a brass grip cap and butt plate. The Pistolet is a heavy horse pistol of
the same make: a dark steel barrel ringed in brass to a finned crown, a walnut stock that runs from a brass nose cap
back over the lock and curves down into a grip raked well back to a clawed brass pommel, and the same lock. Each has a
gilded twin, the Hourlock's and the Sunken Sovereign's gold leaf over dark rosewood (`FINISH`). Neither is dyed.

A gun's own frame is a held weapon's (gear.py): the right fist's grip at the origin, its muzzle up +Z. Its belly (the
grip, the guard) hangs toward +X, its top (the cock) toward -X, and its right side, the lock's, is -Y. The parts are
laid out in the gun's space, x its right, y ahead, z up, and turned into that frame as they are made (`_frame`). Flat
parts (`_slab`) are bevelled and their edges kept sharp, so any renderer's smooth shading keeps their flats."""
import math

import numpy as np

import metals

PISTOL_UNIT = 1.25 / 69.99125109   # a Morrowind unit, a quarter larger, in metres: the holster's measure
# degrees each grip is raked back from square to the barrel: a rifle's pistol grip, and a flintlock pistol's, steeper
RAKE = {'thunderlock': 14.0, 'pistolet': 22.0}
# each finish's colours (sRGB): dark blued steel, brass, oiled walnut, the teal of Dwemer enamel; the gilded every
# metal gold leaf over dark rosewood, the enamel a deep gold
FINISH = {
    'plain': {'brass': (178, 128, 58), 'steel': (62, 66, 74), 'stock': (58, 34, 21), 'teal': (34, 96, 88),
              'flint': (110, 104, 96), 'bore': (16, 14, 12)},
    'gilded': {'brass': (220, 172, 70), 'steel': (206, 168, 84), 'stock': (46, 24, 18), 'teal': (130, 88, 28),
               'flint': (150, 128, 84), 'bore': (24, 18, 10)},
}
FINISHES = tuple(FINISH)
KINDS = ('thunderlock', 'pistolet')
# the layers held in the hand: each gun in each finish in the right fist, and the Pistolet in the left for a pair
HELD = tuple(f'{kind}{"" if f == "plain" else "_" + f}' for kind in KINDS for f in FINISHES)
OFF = tuple(f'pistolet{"" if f == "plain" else "_" + f}_l' for f in FINISHES)
# the Pistolet is built at a slim pistol's size and then made a heavy horse pistol: a fifth larger every way and
# thicker still across (its own frame's X and Z, and its Y), about its grip's middle
PISTOL_SCALE = (1.2, 1.3, 1.2)
_PB = 0.105   # the Pistolet's bore over its grip's middle as it is built
# where a hand holds the Pistolet, metres up its grip from the middle: high, the web of the hand under the lock. Its
# frame's origin is moved there, so every fist that closes on the origin holds it so (own frame, +X down, +Z ahead)
PISTOL_HOLD = 0.044
PISTOL_SHIFT = (-math.cos(math.radians(RAKE['pistolet'])) * PISTOL_HOLD, 0.0,
                math.sin(math.radians(RAKE['pistolet'])) * PISTOL_HOLD)
# each gun's bore over the fist's grip (gun space z)
BORE = {'thunderlock': 0.088, 'pistolet': _PB * PISTOL_SCALE[0] + PISTOL_SHIFT[0]}
# where a gun's muzzle is in its own frame (the bore over the grip, -X), where the left fist holds the Thunderlock's
# forestock under its barrel (`FORE_DROP` under the bore, between its bands), and the middle of its butt plate, set to
# the shoulder aimed
MUZZLE = {'thunderlock': (-BORE['thunderlock'], 0.0, 0.7805),
          'pistolet': (-BORE['pistolet'], 0.0, 0.3155 * PISTOL_SCALE[2] - PISTOL_SHIFT[2])}
FORE_DROP = 0.035
FORE_BOTTOM = 0.052   # the forestock's underside below the bore, where the hand holds it
FORESTOCK = (MUZZLE['thunderlock'][0] + FORE_DROP, 0.0, 0.43)
BUTT = (-(BORE['thunderlock'] - 0.069), 0.0, -0.330)


def rake(kind):
    """How far a gun's grip is raked back from square to its barrel, in degrees."""
    return RAKE[kind]


def _frame(p):
    """Points in the gun's space (x its right, y ahead, z up) in its own frame: +X down, -Y its right, +Z ahead."""
    p = np.asarray(p, dtype=np.float64)
    return np.stack([-p[..., 2], -p[..., 0], p[..., 1]], axis=-1)


def _outward(ob):
    """Every face of a part turned to face out of it: a renderer that hides a layer's inner faces (the first-person
    forge's) then draws its outside, whichever way its rings were wound."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def _rings(name, loops, mat, caps=(True, True), smooth=True):
    return _outward(metals.rings(name, [_frame(lp) for lp in loops], mat, caps=caps, smooth=smooth))


def _crisp(ob, bevel=0.0):
    """Keep a hard part's edges hard: a bevel to catch the light (`bevel` metres), then the edges split where faces
    meet at a corner, so smooth shading rounds only the bevels."""
    if bevel:
        b = ob.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments, b.limit_method = bevel, 2, 'ANGLE'
    e = ob.modifiers.new('split', 'EDGE_SPLIT')
    e.split_angle = math.radians(40.0)
    ob.data.shade_smooth()
    return ob


def _along_y(name, profile, mat, sec='round', at=(0.0, 0.0), sides=24, caps=(True, True), smooth=True):
    """A part turned along the barrel's line: `profile` its (radius, y) in order, its section `sec`, its axis through
    (x, z) `at`. A flat of an octagon lies on top; an octagon's flats are kept flat."""
    s = metals.section(sec, 1.0, 1.0, sides)
    if sec == 'octagon':
        a = math.pi / 8
        s = s @ np.array([[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]])
    loops = [np.stack([at[0] + r * s[:, 0], np.full(len(s), y), at[1] + r * s[:, 1]], 1) for r, y in profile]
    ob = _rings(name, loops, mat, caps=caps, smooth=smooth)
    return _crisp(ob) if sec == 'octagon' else ob


def _swept(name, path, half, mat, sec='square'):
    """A section swept along `path` (gun-space points), `half(t)` its half-sizes (across x, along the bend) at share
    `t` of the way."""
    path = np.asarray(path, dtype=np.float64)
    s = metals.section(sec, 1.0, 1.0, 12)
    loops = []
    for i, c in enumerate(path):
        t = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        t /= np.linalg.norm(t)
        x = np.array([1.0, 0.0, 0.0])
        v = np.cross(x, t)
        v /= np.linalg.norm(v)
        hu, hv = half(i / (len(path) - 1))
        loops.append(c + np.outer(s[:, 0] * hu, x) + np.outer(s[:, 1] * hv, v))
    return _rings(name, loops, mat)


def _superellipse(n, p):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    c, s = np.cos(t), np.sin(t)
    return np.sign(c) * np.abs(c) ** (2 / p), np.sign(s) * np.abs(s) ** (2 / p)


def _body(name, rows, mat, p=2.6, n=28, caps=(True, True)):
    """A body along the barrel's line cut square across it: `rows` each (y, top, bottom, half across), in order, its
    section rounded (superellipse `p`). A stock, a forestock, a band."""
    cu, sv = _superellipse(n, p)
    loops = [np.stack([w * cu, np.full(n, y), (t + b) / 2 + (t - b) / 2 * sv], 1) for y, t, b, w in rows]
    if rows[0][0] < rows[-1][0]:   # faces out whichever way the rows run
        loops = [lp[::-1] for lp in loops]
    return _rings(name, loops, mat, caps=caps)


def _grip_axis(kind):
    """Up a gun's grip and toward its front, in the gun's space (y, z)."""
    r = math.radians(RAKE[kind])
    return np.array([math.sin(r), math.cos(r)]), np.array([math.cos(r), -math.sin(r)])


def _along_grip(name, kind, rows, mat, p=2.6, n=28, caps=(True, True)):
    """A body along a gun's raked grip, cut square across it: `rows` each (s up the grip from its middle, half deep
    toward its back, half deep toward its front, half across), in order down the grip."""
    g, f = _grip_axis(kind)
    cu, sv = _superellipse(n, p)
    loops = []
    for s, back, front, w in rows:
        c = g * s
        d = np.where(sv > 0, sv * back, sv * front)   # toward its back the positive half
        y, z = c[0] - f[0] * d, c[1] - f[1] * d
        loops.append(np.stack([w * cu, y, z], 1))
    return _rings(name, loops, mat, caps=caps)


def _catmull(P, k):
    """A smooth curve through the rows of `P` (any width), `k` steps between each two."""
    P = np.asarray(P, dtype=np.float64)
    Q = np.concatenate([2 * P[:1] - P[1:2], P, 2 * P[-1:] - P[-2:-1]])
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for t in np.linspace(0.0, 1.0, k, endpoint=False):
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return np.array(out)


def _flow(name, rows, mat, p=2.6, n=28, k=6, caps=(True, True)):
    """A body swept along a smooth spine in the gun's side plane, its sections square to the spine: `rows` each the
    spine's (y, z) and how far the section reaches to either side of it (`low`, `high`: high to the spine's left as it
    runs, the top as it runs back, the back as it runs down) and its half across. A stock that turns from under the
    barrel down into a grip in one piece: its spine the inner line (the belly, the grip's front), so it never folds."""
    R = _catmull(rows, k)
    cu, sv = _superellipse(n, p)
    loops = []
    for i, (y, z, lo, hi, w) in enumerate(R):
        a, b = R[max(i - 1, 0), :2], R[min(i + 1, len(R) - 1), :2]
        t = (b - a) / np.linalg.norm(b - a)
        nrm = np.array([t[1], -t[0]])
        d = (lo + hi) / 2 + (hi - lo) / 2 * sv
        loops.append(np.stack([w * cu, y + nrm[0] * d, z + nrm[1] * d], 1))
    return _rings(name, loops, mat, caps=caps)


def _wrap(name, y0, y1, top, bottom, across, wire, turns, mat, p=3.5):
    """A wire wound `turns` times round whatever lies within a rounded section (`top`, `bottom`, half `across`) from
    `y0` to `y1`: the Thunderlock's tonal coil, round its barrel and forestock both."""
    k = int(turns * 40) + 1
    th = np.linspace(0.0, 2 * np.pi * turns, k)
    c, s = np.cos(th), np.sin(th)
    sx, sz = np.sign(c) * np.abs(c) ** (2 / p), np.sign(s) * np.abs(s) ** (2 / p)
    mid, half = (top + bottom) / 2, (top - bottom) / 2
    path = np.stack([(across + wire) * sx, np.linspace(y0, y1, k), mid + (half + wire) * sz], 1)
    return _outward(metals.sweep(name, [tuple(q) for q in _frame(path)], metals.section('round', wire, wire, 8),
                                 mat))


def _slab(name, outline, x0, x1, mat, bevel=0.0006, turn=0.0, about=0.0):
    """A flat part cut from plate: `outline` its (y, z) corners in order round, from `x0` to `x1` across, bevelled;
    turned `turn` degrees about the line along y at height `about` (a fin standing off a barrel's side)."""
    import bmesh
    import bpy
    c, sn = math.cos(math.radians(turn)), math.sin(math.radians(turn))

    def at(x, y, z):
        dz = z - about
        return tuple(_frame((x * c - dz * sn, y, about + x * sn + dz * c)))
    bm = bmesh.new()
    a = [bm.verts.new(at(x0, y, z)) for y, z in outline]
    b = [bm.verts.new(at(x1, y, z)) for y, z in outline]
    bm.faces.new(a)
    bm.faces.new(b)
    k = len(outline)
    for i in range(k):
        bm.faces.new((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    metals.rest_attr(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return _crisp(ob, min(bevel, 0.3 * abs(x1 - x0)))


def _disc(name, at, r, x0, x1, mat, n=16):
    """A round boss or screw head standing out of a side: centre `at` (y, z), from `x0` to `x1` across."""
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return _slab(name, [(at[0] + r * math.cos(a), at[1] + r * math.sin(a)) for a in t], x0, x1, mat,
                 bevel=0.25 * min(r, abs(x1 - x0)))


def _coil(name, y0, y1, radius, wire, turns, mat, at):
    """A wire wound round the barrel's line from `y0` to `y1`, `turns` times, at `radius` from it."""
    k = int(turns * 28) + 1
    th = np.linspace(0.0, 2 * np.pi * turns, k)
    path = np.stack([radius * np.cos(th), np.linspace(y0, y1, k), at[1] + radius * np.sin(th)], 1)
    return _outward(metals.sweep(name, [tuple(q) for q in _frame(path)], metals.section('round', wire, wire, 8),
                                 mat))


def _cog(name, at, r, teeth, x0, x1, mat, depth=0.18):
    """A Dwemer cogwheel standing out of a side: `teeth` square teeth round a wheel of radius `r`, centre `at` (y, z),
    from `x0` to `x1` across."""
    pts = []
    for k in range(teeth):
        for f, rr in ((0.0, r * (1 - depth)), (0.18, r * (1 - depth)), (0.28, r), (0.72, r), (0.82, r * (1 - depth))):
            a = 2 * math.pi * (k + f) / teeth
            pts.append((at[0] + rr * math.cos(a), at[1] + rr * math.sin(a)))
    return _slab(name, pts, x0, x1, mat, bevel=0.0003)


def _fins(name, y0, y1, r, reach, bz, mat, turns=(90.0, -90.0), thick=0.0014):
    """Dwemer fins swept back off a barrel at radius `r`, from `y0` to `y1`, reaching `reach` out at their front; one
    at each angle of `turns` (degrees about the bore from straight up)."""
    L = y1 - y0
    blade = [(y0, bz + r - 0.001), (y1, bz + r - 0.001), (y1 - 0.08 * L, bz + r + reach),
             (y0 + 0.55 * L, bz + r + 0.55 * reach), (y0 + 0.15 * L, bz + r + 0.18 * reach)]
    return [_slab(f'{name}{k}', blade, -thick / 2, thick / 2, mat, bevel=0.0003, turn=t, about=bz)
            for k, t in enumerate(turns)]


def _gem(name, at, r, mat):
    """A cut gem, an octahedron, its middle at gun-space point `at`."""
    import bpy
    x, y, z = at
    v = [(x + r, y, z), (x - r, y, z), (x, y + r * 1.4, z), (x, y - r * 1.4, z), (x, y, z + r), (x, y, z - r)]
    f = [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(_frame(p)) for p in v], [], f)
    me.materials.append(mat)
    me.update()
    metals.rest_attr(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return _crisp(_outward(ob))


def _crown(name, y0, y1, r, bz, M):
    """A Dwemer crown at the muzzle: an octagonal bronze sleeve stepped out to a flared lip, its bore dark, two fins
    swept back off its sides."""
    L = y1 - y0
    prof = [(r * 1.04, y0), (r * 1.16, y0 + 0.06 * L), (r * 1.16, y0 + 0.55 * L), (r * 1.30, y0 + 0.62 * L),
            (r * 1.30, y0 + 0.86 * L), (r * 1.42, y0 + 0.92 * L), (r * 1.42, y1 - 0.02 * L), (r * 1.05, y1)]
    return ([_along_y(f'{name}.crown', prof, M['brass'], 'octagon', (0.0, bz), sides=8),
             _along_y(f'{name}.bore', [(r * 0.62, y1 - 0.003), (r * 0.62, y1 + 0.0012)], M['bore'], at=(0.0, bz),
                      sides=16)]
            + _fins(f'{name}.crownfin', y0 + 0.06 * L, y0 + 0.88 * L, r * 1.16, r * 1.35, bz, M['brass'],
                    turns=(62.0, -62.0, 180.0), thick=0.0016))


def _spine(name, y0, y1, top, bz, steps, mat, thick=0.0026):
    """A stepped Dwemer spine along a barrel's top, rising in `steps` terraces from both ends to its middle."""
    L = y1 - y0
    h = 0.0018
    up = [(y0, top)]
    for k in range(1, steps + 1):
        a = y0 + L * 0.5 * k / (steps + 1)
        up += [(a, top + h * (k - 1)), (a, top + h * k)]
    down = [(y1 - (y - y0), z) for y, z in up[::-1]]
    return _slab(name, up + down[1:], -thick / 2, thick / 2, mat, bevel=0.0004)


def _chevrons(name, y, top, bottom, x, mat, w=0.0045):
    """A band's chevron on each side of a stock: a bronze plate pointing down from the band, at `x` out."""
    plate = [(y - w, top), (y + w, top), (y + w, bottom + 0.4 * (top - bottom)), (y, bottom),
             (y - w, bottom + 0.4 * (top - bottom))]
    return [_slab(f'{name}R', plate, x, x + 0.0013, mat, bevel=0.0003),
            _slab(f'{name}L', plate, -x - 0.0013, -x, mat, bevel=0.0003)]


def _claws(name, outline, x, mat):
    """A pair of bronze plates, one on each side at `x` out, cut to `outline` (y, z)."""
    return [_slab(f'{name}R', outline, x, x + 0.0014, mat, bevel=0.0003),
            _slab(f'{name}L', outline, -x - 0.0014, -x, mat, bevel=0.0003)]


def _shell(name, rows, p, y0, y1, top, bottom, thick, mat, side=1.0, ny=14, nz=10):
    """A bronze plate laid on a body's side (`_body`'s `rows`, its section `p`), bent to it: from `y0` to `y1`, at
    each y between `top(y)` and `bottom(y)`, `thick` proud of the surface; on the right (`side` 1) or the left (-1)."""
    import bpy
    R = np.asarray(rows, dtype=np.float64)
    order = np.argsort(R[:, 0])
    R = R[order]

    def surface(y, z):
        t, b, w = (np.interp(y, R[:, 0], R[:, k]) for k in (1, 2, 3))
        v = np.clip(abs((z - (t + b) / 2) / ((t - b) / 2)), 0.0, 0.999)
        return w * (1 - v ** p) ** (1 / p)
    ys = np.linspace(y0, y1, ny)
    grid = []
    for y in ys:
        zs = np.linspace(bottom(y), top(y), nz)
        grid.append([(y, z, surface(y, z)) for z in zs])
    verts, faces = [], []
    for lift in (-0.0004, thick):   # the plate's back, sunk a little, and its face
        for row in grid:
            for y, z, x in row:
                verts.append(tuple(_frame((side * (x + lift), y, z))))
    n = ny * nz

    def at(layer, i, j):
        return layer * n + i * nz + j
    for i in range(ny - 1):
        for j in range(nz - 1):
            q = [at(1, i, j), at(1, i + 1, j), at(1, i + 1, j + 1), at(1, i, j + 1)]
            faces.append(q if side > 0 else q[::-1])
            q = [at(0, i, j), at(0, i, j + 1), at(0, i + 1, j + 1), at(0, i + 1, j)]
            faces.append(q if side > 0 else q[::-1])
    rim = ([(i, 0) for i in range(ny)] + [(ny - 1, j) for j in range(1, nz)]
           + [(i, nz - 1) for i in range(ny - 2, -1, -1)] + [(0, j) for j in range(nz - 2, 0, -1)])
    for k in range(len(rim)):
        (i0, j0), (i1, j1) = rim[k], rim[(k + 1) % len(rim)]
        q = [at(0, i0, j0), at(0, i1, j1), at(1, i1, j1), at(1, i0, j0)]
        faces.append(q if side > 0 else q[::-1])
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.materials.append(mat)
    me.update()
    metals.rest_attr(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return _crisp(_outward(ob))


def _rib(name, y0, y1, r0, r1, bz, mat, step=0.036, h=(0.0026, 0.0040), w=0.0022):
    """A Dwemer rib along a round barrel's top, from `y0` to `y1` (the barrel's radius `r0` to `r1` there), its top
    stepped in terraces `step` long, low and high in turn."""
    k = max(2, int(round((y1 - y0) / step)))
    ys = np.linspace(y0, y1, k + 1)
    top = []
    for i in range(k):
        a, b = ys[i], ys[i + 1]
        r = np.interp((a + b) / 2, (y0, y1), (r0, r1))
        hh = h[i % 2]
        top += [(a + 0.002, bz + r + hh), (b - 0.002, bz + r + hh)]
    base = [(y1, bz + r1 - 0.0015), (y0, bz + r0 - 0.0015)]
    return _slab(name, [(y0, bz + r0 + h[0])] + top + [(y1, bz + r1 + h[0])] + base, -w, w, mat, bevel=0.0004)


def _cylinder(name, a, b, r, mat, sides=12):
    """A pin or a screw's shaft from gun-space point `a` to `b`."""
    return _swept(name, [a, b], lambda t: (r, r), mat, sec='round')


def _conduits(name, y0, y1, r0, r1, bz, mat, pipe, clamps=(), lift=0.0015):
    """Dwemer conduits: a brass pipe hugging each side of a barrel from `y0` to `y1` (the barrel's radius `r0` to `r1`
    there), `lift` over the bore's height, held by a clamp at each y of `clamps`."""
    obs = []
    for s, tag in ((1.0, 'R'), (-1.0, 'L')):
        def x(y):
            return s * (float(np.interp(y, (y0, y1), (r0, r1))) + 0.9 * pipe)
        obs.append(_cylinder(f'{name}{tag}', (x(y0), y0, bz + lift), (x(y1), y1, bz + lift), pipe, mat))
        obs += [_cylinder(f'{name}{tag}clamp{k}', (x(y), y - 0.0024, bz + lift), (x(y), y + 0.0024, bz + lift),
                          1.5 * pipe, mat) for k, y in enumerate(clamps)]
    return obs


def _peep(name, y, base, r, wire, mat):
    """A Dwemer ring sight on the barrel's top at `y`: a ring of radius `r` the eye looks through along the bore, on a
    post rising from height `base`."""
    z = base + 0.0012 + r
    return [_coil(f'{name}.peep', y, y, r, wire, 1.0, mat, (0.0, z)),
            _slab(f'{name}.peeppost', [(y - 0.0022, base - 0.001), (y + 0.0022, base - 0.001),
                                       (y + 0.0012, z - r + 0.0004), (y - 0.0012, z - r + 0.0004)],
                  -0.0009, 0.0009, mat, bevel=0.0002)]


def materials_of(finish):
    """A finish's materials by role, each named for the palette's own class (`blade.` a fitting, `steel.` a metal,
    `edge.` the enamel, `haft.` the wood), so the layers keep their render as the swords' do; dressed for the eye
    (`dress`), so the gun is one gun in every view: third person, first person, the doll and the list."""
    import axes
    import materials
    C = FINISH[finish]
    lin = metals._linear
    wood = lin(C['stock'])
    stock = axes.wood(f'haft.Gun.{finish}.stock', tuple(0.6 * c for c in wood), tuple(1.3 * c for c in wood),
                      scale=(160.0, 160.0, 6.0))
    b = stock.node_tree.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value, b.inputs['Specular IOR Level'].default_value = 0.5, 0.35   # oiled
    own = {'brass': materials.plain(f'blade.Gun.{finish}.brass', lin(C['brass']), metal=0.85, rough=0.3, spec=0.5),
           'steel': materials.plain(f'steel.Gun.{finish}.steel', lin(C['steel']), metal=0.8, rough=0.32, spec=0.5),
           'stock': stock,
           'teal': materials.speckle(f'edge.Gun.{finish}.teal', tuple(0.85 * c for c in lin(C['teal'])),
                                     tuple(1.12 * c for c in lin(C['teal'])), scale=420.0, rough=0.36, metal=0.55),
           'flint': materials.plain(f'steel.Gun.{finish}.flint', lin(C['flint']), rough=0.8),
           'bore': materials.plain(f'haft.Gun.{finish}.bore', lin(C['bore']), rough=0.9, spec=0.1)}
    return dress(own, finish)


# each finish's metals and wood as the eye sees them: (base lift, or a lift each channel; metallic, roughness, sky
# tint, sky strength, edge radius in metres, how dark a crevice goes). The plain brass is deepened toward gold: the
# lamps' white highlights would wash a paler one out, and the game finds the brass by its saturation
# (thunderlockArt.js).
# A mirror of a dark room is black, so each reflects a sky over the eye (`_look`): bright above, dark below, a glint at
# its horizon, so a barrel's top reads bright, its flank mid, its belly dark. Its edges are rounded to catch the lamps
# and its crevices darkened: a coil's grooves, a cog's teeth.
LOOK = {'plain': {'brass': ((1.15, 1.0, 0.5), 0.65, 0.30, (1.0, 0.56, 0.10), 0.40, 0.0010, 0.45),
                  'steel': (1.0, 0.55, 0.28, (0.46, 0.58, 0.92), 0.36, 0.0010, 0.40),
                  'stock': (1.0, 0.0, 1.00, (1.0, 0.70, 0.45), 0.08, 0.0012, 0.55)},
        'gilded': {'brass': (1.0, 0.5, 0.28, (1.0, 0.80, 0.42), 0.45, 0.0010, 0.35),
                   'steel': (1.0, 0.5, 0.30, (1.0, 0.78, 0.40), 0.40, 0.0010, 0.40),
                   'stock': (1.0, 0.0, 1.00, (1.0, 0.65, 0.45), 0.08, 0.0012, 0.55)}}
GRAIN = (0.5, 1.45)   # the walnut's grain, dark and light against its colour: figured, so it reads at a texel a cm
GEM_COLOUR = (0.10, 0.95, 0.80)
GEM_GLOW = (0.5, 9.0)   # the teal gems' own light: a faint glow at rest, flaring with a shot (fpguns.py)


def _socket(node, name, kind):
    return next(s for s in node.inputs if s.name == name and s.type == kind)


def _look(m, tint, sky, edge, cavity):
    """Material `m` dressed for the eye: its edges rounded (a bevel `edge` metres), its colour darkened toward
    `cavity` in its crevices, and a sky in `tint` reflected at `sky`'s strength that only the eye sees."""
    nt = m.node_tree
    L = nt.links
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    bevel = nt.nodes.new('ShaderNodeBevel')
    bevel.samples = 6
    bevel.inputs['Radius'].default_value = edge
    L.new(bevel.outputs['Normal'], b.inputs['Normal'])
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = 8
    ao.inputs['Distance'].default_value = 0.006
    occ = nt.nodes.new('ShaderNodeMapRange')
    occ.inputs['To Min'].default_value = cavity
    L.new(ao.outputs['AO'], occ.inputs['Value'])
    base = b.inputs['Base Color']
    dark = nt.nodes.new('ShaderNodeMix')
    dark.data_type, dark.blend_type = 'RGBA', 'MULTIPLY'
    dark.inputs['Factor'].default_value = 1.0
    if base.is_linked:
        L.new(base.links[0].from_socket, _socket(dark, 'A', 'RGBA'))
    else:
        _socket(dark, 'A', 'RGBA').default_value = base.default_value
    L.new(occ.outputs['Result'], _socket(dark, 'B', 'RGBA'))
    L.new(next(s for s in dark.outputs if s.type == 'RGBA'), base)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(tc.outputs['Reflection'], sep.inputs['Vector'])
    up = nt.nodes.new('ShaderNodeMapRange')
    up.inputs['From Min'].default_value = -1.0
    L.new(sep.outputs['Z'], up.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')   # the sky by how far up the reflection looks: (z + 1) / 2
    els = ramp.color_ramp.elements
    for at, val in ((0.0, 0.02), (0.48, 0.05), (0.5, 0.62), (0.53, 0.24), (0.75, 0.42), (1.0, 0.78)):
        e = els.new(at) if at not in (0.0, 1.0) else (els[0] if at == 0.0 else els[-1])
        e.position, e.color = at, (val, val, val, 1.0)
    L.new(up.outputs['Result'], ramp.inputs['Fac'])
    lit = nt.nodes.new('ShaderNodeMix')
    lit.data_type, lit.blend_type = 'RGBA', 'MULTIPLY'
    lit.inputs['Factor'].default_value = 1.0
    L.new(ramp.outputs['Color'], _socket(lit, 'A', 'RGBA'))
    L.new(occ.outputs['Result'], _socket(lit, 'B', 'RGBA'))
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*tint, 1.0)
    tinted = nt.nodes.new('ShaderNodeMix')
    tinted.data_type, tinted.blend_type = 'RGBA', 'MULTIPLY'
    tinted.inputs['Factor'].default_value = 1.0
    L.new(next(s for s in lit.outputs if s.type == 'RGBA'), _socket(tinted, 'A', 'RGBA'))
    _socket(tinted, 'B', 'RGBA').default_value = (*tint, 1.0)
    L.new(next(s for s in tinted.outputs if s.type == 'RGBA'), em.inputs['Color'])
    eye = nt.nodes.new('ShaderNodeMath')   # the eye's alone: the sky lights nothing round it
    eye.operation = 'MULTIPLY'
    eye.inputs[1].default_value = sky
    L.new(nt.nodes.new('ShaderNodeLightPath').outputs['Is Camera Ray'], eye.inputs[0])
    L.new(eye.outputs[0], em.inputs['Strength'])
    add = nt.nodes.new('ShaderNodeAddShader')
    L.new(b.outputs['BSDF'], add.inputs[0])
    L.new(em.outputs['Emission'], add.inputs[1])
    L.new(add.outputs['Shader'], out.inputs['Surface'])
    return m


def dress(own, finish):
    """A gun's materials by role dressed for the eye (`LOOK`, `_look`): the wood matte, lit as the first-person fitter
    lights wood, so a lamp by the eye never glares off the stock nearest it, its grain figured (`GRAIN`); the gems
    glowing (fpguns.py `frame_light` flares them with a shot)."""
    for node in own['stock'].node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            node.inputs['Metallic'].default_value = 0.0
            node.inputs['Specular IOR Level'].default_value = 0.0
            node.inputs['Roughness'].default_value = 1.0
    wood = FINISH[finish]['stock']
    for node in own['stock'].node_tree.nodes:
        if node.type == 'VALTORGB':
            for e, k in zip(node.color_ramp.elements, GRAIN):
                e.color = (*(k * c for c in metals._linear(wood)), 1.0)
    for n, (lift, metal, rough, tint, sky, edge, cavity) in LOOK[finish].items():
        for node in own[n].node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                node.inputs['Metallic'].default_value = metal
                c = node.inputs['Base Color'].default_value
                k = lift if isinstance(lift, tuple) else (lift,) * 3
                node.inputs['Base Color'].default_value = (c[0] * k[0], c[1] * k[1], c[2] * k[2], 1.0)
                node.inputs['Roughness'].default_value = rough
        _look(own[n], tint, sky, edge, cavity)
    for node in own['teal'].node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            node.inputs['Emission Color'].default_value = (*GEM_COLOUR, 1.0)
            node.inputs['Emission Strength'].default_value = GEM_GLOW[0]
    return own


COCKED = 38.0   # degrees the cock stands back from the frizzen at rest, cocked: the shot lets it fall (fpguns.py)
COCK_PARTS = ('cock', 'cocktail', 'cockblade', 'jaw', 'flint', 'topjaw', 'jawscrew', 'jawhead')


def _lock_pivots(zc, at):
    """Where a lock's cock turns (its tumbler) and the frizzen's toe hinges, (y, z) in the gun's space."""
    y0, y1 = at
    px, pz = y0 + 0.20 * (y1 - y0), zc - 0.002
    fy = px + 0.003 + 0.022
    return (px, pz), (fy + 0.017, zc + 0.015)


def _swing(obs, pivot, deg):
    """Parts turned `deg` degrees forward about the line across the gun through `pivot` (y, z): the top toward the
    muzzle. Their pattern coordinates with them."""
    a = math.radians(deg)
    py, pz = pivot
    for ob in obs:
        me = ob.data
        co = np.empty(len(me.vertices) * 3, dtype=np.float64)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        dy, dz = co[:, 2] - py, -co[:, 0] - pz   # the own frame: +X down, +Z ahead
        co[:, 2] = py + dy * math.cos(a) + dz * math.sin(a)
        co[:, 0] = -(pz - dy * math.sin(a) + dz * math.cos(a))
        flat = co.astype(np.float32).ravel()
        me.vertices.foreach_set('co', flat)
        if 'rest' in me.attributes:
            me.attributes['rest'].data.foreach_set('vector', flat)
        me.update()
    return obs


def _lock(name, M, zc, at, x, flip=False):
    """A flintlock on the right side, its plate's face at `x` and its middle at height `zc`: the plate (`at`: its
    rear tip's and its nose's y), the cock on its tumbler with a flint in its jaws and the jaw screw, cocked back
    (`COCKED`), the pan and the frizzen standing over it to take the flint's strike, the frizzen's spring, a screw."""
    y0, y1 = at
    L = y1 - y0

    def Y(f):   # a share of the plate's length from its tail
        return y0 + f * L
    plate = [(Y(0.0), zc), (Y(0.08), zc + 0.0075), (Y(0.25), zc + 0.0105), (Y(0.62), zc + 0.011), (Y(0.86), zc + 0.009),
             (Y(0.96), zc + 0.0035), (Y(1.0), zc - 0.002), (Y(0.93), zc - 0.0075), (Y(0.70), zc - 0.0105),
             (Y(0.30), zc - 0.0105), (Y(0.10), zc - 0.007)]
    obs = [_slab(f'{name}.lockplate', plate, x - 0.0032, x, M['brass'])]
    px, pz = Y(0.20), zc - 0.002   # the tumbler
    cx = x + 0.0034   # the cock's middle, standing off the plate
    obs.append(_disc(f'{name}.tumbler', (px, pz), 0.0052, x, x + 0.0058, M['steel']))
    neck = [(px, pz), (px - 0.005, pz + 0.008), (px - 0.008, pz + 0.017), (px - 0.006, pz + 0.026),
            (px + 0.001, pz + 0.032), (px + 0.008, pz + 0.033)]
    obs.append(_swept(f'{name}.cock', [(cx, y, z) for y, z in neck], lambda t: (0.0034, 0.0060 - 0.0022 * t),
                      M['steel']))
    obs.append(_swept(f'{name}.cocktail', [(cx, px, pz), (cx, px - 0.007, pz - 0.004), (cx, px - 0.014, pz - 0.005)],
                      lambda t: (0.0026, 0.0030 - 0.0015 * t), M['steel']))
    obs.append(_slab(f'{name}.cockblade', [(px - 0.004, pz + 0.004), (px - 0.016, pz + 0.012), (px - 0.019, pz + 0.020),
                                           (px - 0.014, pz + 0.018), (px - 0.007, pz + 0.020)],
                     cx - 0.0009, cx + 0.0009, M['brass'], bevel=0.0003))
    jy = px + 0.003   # the jaws' heel
    obs.append(_slab(f'{name}.jaw', [(jy, pz + 0.029), (jy + 0.016, pz + 0.030), (jy + 0.017, pz + 0.034),
                                     (jy, pz + 0.035)], cx - 0.0028, cx + 0.0028, M['steel']))
    obs.append(_slab(f'{name}.flint', [(jy + 0.009, pz + 0.0345), (jy + 0.021, pz + 0.0352), (jy + 0.018, pz + 0.0395),
                                       (jy + 0.009, pz + 0.040)], cx - 0.0025, cx + 0.0025, M['flint'], bevel=0.0004))
    obs.append(_slab(f'{name}.topjaw', [(jy, pz + 0.040), (jy + 0.016, pz + 0.0405), (jy + 0.015, pz + 0.0440),
                                        (jy, pz + 0.0445)], cx - 0.0028, cx + 0.0028, M['steel']))
    obs.append(_cylinder(f'{name}.jawscrew', (cx, jy + 0.005, pz + 0.033), (cx, jy + 0.005, pz + 0.052), 0.0013,
                         M['steel']))
    obs.append(_cylinder(f'{name}.jawhead', (cx, jy + 0.005, pz + 0.0505), (cx, jy + 0.005, pz + 0.0535), 0.0030,
                         M['steel']))
    fy = jy + 0.022   # the frizzen's face, where the flint strikes
    obs.append(_slab(f'{name}.pan', [(fy, zc + 0.0095), (fy + 0.016, zc + 0.0095), (fy + 0.016, zc + 0.015),
                                     (fy, zc + 0.015)], x - 0.0016, x + 0.0068, M['brass']))
    _swing([ob for ob in obs if ob.name.rsplit('.', 1)[-1] in COCK_PARTS], (px, pz), -COCKED)   # cocked
    frizzen = [(fy, zc + 0.015), (fy + 0.017, zc + 0.015), (fy + 0.017, zc + 0.0176), (fy + 0.0035, zc + 0.0176),
               (fy + 0.0015, zc + 0.041), (fy - 0.002, zc + 0.041)]
    obs.append(_slab(f'{name}.frizzen', frizzen, x - 0.0002, x + 0.0074, M['steel']))
    obs.append(_slab(f'{name}.spring', [(fy + 0.020, zc - 0.004), (Y(0.93), zc - 0.002), (Y(0.93), zc + 0.001),
                                        (fy + 0.022, zc + 0.0005)], x, x + 0.0018, M['steel'], bevel=0.0004))
    obs.append(_disc(f'{name}.screw', (Y(0.80), zc - 0.0005), 0.0021, x, x + 0.0012, M['steel']))
    return obs


def _side_plate(name, M, zc, at, x, medallion):
    """The brass side plate on the left, its face at `x` (negative), set with a Dwemer cog round a teal medallion at
    `medallion` (y)."""
    y0, y1 = at
    L = y1 - y0

    def Y(f):
        return y0 + f * L
    plate = [(Y(0.0), zc + 0.001), (Y(0.15), zc + 0.008), (Y(0.6), zc + 0.0095), (Y(0.92), zc + 0.0055),
             (Y(1.0), zc), (Y(0.92), zc - 0.0065), (Y(0.6), zc - 0.0095), (Y(0.15), zc - 0.0075)]
    return [_slab(f'{name}.sideplate', plate, x, x + 0.003, M['brass']),
            _cog(f'{name}.cog', (medallion, zc), 0.0098, 10, x - 0.0016, x + 0.001, M['brass']),
            _disc(f'{name}.medallion', (medallion, zc), 0.0058, x - 0.0024, x + 0.001, M['teal']),
            _disc(f'{name}.hub', (medallion, zc), 0.0020, x - 0.0030, x + 0.001, M['brass'])]


_TB = BORE['thunderlock']
# each gun's lock as it is built: its plate's middle height, its tail's and nose's y, its face across (gun space)
LOCKS = {'thunderlock': (_TB - 0.016, (-0.042, 0.114), 0.0212), 'pistolet': (_PB - 0.0165, (0.030, 0.120), 0.0170)}


def lock_pivots(kind):
    """Where a gun's cock turns and its frizzen hinges, each a point in the gun's own frame (the line they turn about
    runs across the gun, its own Y), as the model stands after it is built (the Pistolet made larger and moved)."""
    zc, at, _ = LOCKS[kind]
    out = []
    for y, z in _lock_pivots(zc, at):
        p = _frame((0.0, y, z))
        if kind == 'pistolet':
            p = p * np.asarray(PISTOL_SCALE) - np.asarray(PISTOL_SHIFT)
        out.append(p)
    return tuple(out)


def pan_point(kind):
    """The top of a gun's priming pan, where the flint's sparks light the powder, in its own frame (`_lock` builds
    the pan just ahead of the jaws: its middle across the plate's face, over its top)."""
    zc, at, x = LOCKS[kind]
    (py, _), _ = _lock_pivots(zc, at)
    p = _frame((x + 0.0026, py + 0.025 + 0.008, zc + 0.016))
    if kind == 'pistolet':
        p = p * np.asarray(PISTOL_SCALE) - np.asarray(PISTOL_SHIFT)
    return p
# the Thunderlock's forestock and butt, each (y, top, bottom, half across): the walnut, and the plates bent to it
FORE_ROWS = [(0.600, _TB - 0.004, _TB - 0.034, 0.0136), (0.565, _TB - 0.004, _TB - 0.041, 0.0152),
             (0.480, _TB - 0.004, _TB - 0.049, 0.0172), (0.430, _TB - 0.004, _TB - 0.052, 0.0176),
             (0.380, _TB - 0.004, _TB - 0.052, 0.0174), (0.330, _TB - 0.004, _TB - 0.050, 0.0168),
             (0.200, _TB - 0.002, _TB - 0.046, 0.0170), (0.140, _TB + 0.002, _TB - 0.038, 0.0180),
             (0.110, _TB + 0.003, _TB - 0.036, 0.0182)]
BUTT_ROWS = [(-0.030, _TB + 0.000, _TB - 0.040, 0.0164), (-0.055, _TB - 0.001, _TB - 0.047, 0.0160),
             (-0.090, _TB - 0.002, _TB - 0.062, 0.0172), (-0.140, _TB - 0.004, _TB - 0.083, 0.0188),
             (-0.200, _TB - 0.006, _TB - 0.101, 0.0200), (-0.260, _TB - 0.008, _TB - 0.115, 0.0207),
             (-0.300, _TB - 0.009, _TB - 0.123, 0.0210), (-0.325, _TB - 0.010, _TB - 0.128, 0.0210)]


def build_thunderlock(finish='plain', name='thunderlock'):
    """The Dwarven Thunderlock, a Dwemer long rifle, in its own frame: 1.11 m from its butt plate to its muzzle."""
    M = materials_of(finish)
    bz = BORE['thunderlock']
    at = (0.0, bz)
    obs = _crown(name, 0.728, 0.7805, 0.0134, bz, M) + [
        # the barrel: octagonal from the breech, a brass ring, round to the Dwemer crown at its muzzle
        _along_y(f'{name}.breech', [(0.0172, -0.005), (0.0160, 0.302)], M['steel'], 'octagon', at, sides=8),
        _along_y(f'{name}.barrel', [(0.0148, 0.300), (0.0134, 0.730)], M['steel'], at=at),
        _rib(f'{name}.rib', 0.312, 0.696, 0.0148, 0.0136, bz, M['brass']),
        _along_y(f'{name}.ring', [(0.0158, 0.297), (0.0172, 0.300), (0.0172, 0.305), (0.0150, 0.308)], M['brass'],
                 at=at),
        # the focus ring behind the crown, where the conduits end, a teal gem in a bronze cup on its top
        _along_y(f'{name}.focus', [(0.0138, 0.699), (0.0160, 0.7015), (0.0160, 0.7165), (0.0138, 0.719)], M['brass'],
                 at=at),
        _cylinder(f'{name}.focuscup', (0.0, 0.709, bz + 0.0150), (0.0, 0.709, bz + 0.0182), 0.0031, M['brass']),
        _gem(f'{name}.focusgem', (0.0, 0.709, bz + 0.0202), 0.0026, M['teal']),
        # the Dwemer spine stepped along the breech's top, a ring sight on its highest terrace; the front sight a
        # bronze blade on the crown
        _spine(f'{name}.spine', 0.210, 0.296, bz + 0.0150, bz, 3, M['brass']),
        _slab(f'{name}.frontsight', [(0.770, bz + 0.0140), (0.756, bz + 0.0140), (0.760, bz + 0.0200),
                                     (0.768, bz + 0.0205)], -0.0011, 0.0011, M['brass'], bevel=0.0003),
        # the walnut: the action round the breech running on as the forestock under the barrel, the butt and the grip
        _body(f'{name}.action', [(0.120, bz + 0.003, bz - 0.036, 0.0182), (0.0, bz + 0.003, bz - 0.036, 0.0185),
                                 (-0.040, bz + 0.000, bz - 0.040, 0.0172)], M['stock'], p=3.2),
        _body(f'{name}.forestock', FORE_ROWS, M['stock'], p=2.8),
        _body(f'{name}.butt', BUTT_ROWS, M['stock'], p=2.3),
        _along_grip(f'{name}.grip', 'thunderlock', [(0.068, 0.0190, 0.0190, 0.0158), (0.030, 0.0192, 0.0192, 0.0160),
                                                    (-0.010, 0.0199, 0.0198, 0.0166), (-0.040, 0.0199, 0.0196, 0.0165),
                                                    (-0.055, 0.0204, 0.0199, 0.0168), (-0.060, 0.0207, 0.0201, 0.0170)],
                    M['stock']),
        # the tonal coil: a fine brass wire wound round the barrel and the forestock where they leave the action,
        # between two angular collars, a teal resonance gem set in a bronze cup on its top
        _wrap(f'{name}.coil', 0.152, 0.198, bz + 0.0178, bz - 0.0465, 0.0188, 0.0014, 10, M['brass']),
        _body(f'{name}.collar0', [(0.2035, bz + 0.0198, bz - 0.0488, 0.0206), (0.1985, bz + 0.0198, bz - 0.0488,
                                                                               0.0206)], M['brass'], p=7.0),
        _body(f'{name}.collar1', [(0.1515, bz + 0.0198, bz - 0.0488, 0.0206), (0.1465, bz + 0.0198, bz - 0.0488,
                                                                               0.0206)], M['brass'], p=7.0),
        _cylinder(f'{name}.cup', (0.0, 0.175, bz + 0.0186), (0.0, 0.175, bz + 0.0218), 0.0044, M['brass']),
        _gem(f'{name}.gem', (0.0, 0.175, bz + 0.0241), 0.0034, M['teal']),
        # the brass furniture: the bands, the nose cap, the grip cap and the butt plate
        _body(f'{name}.nosecap', [(0.616, bz - 0.0070, bz - 0.0290, 0.0110), (0.606, bz - 0.0040, bz - 0.0345, 0.0141),
                                  (0.598, bz - 0.0035, bz - 0.0355, 0.0143)], M['brass'], p=5.0),
        _along_grip(f'{name}.gripcap', 'thunderlock', [(-0.059, 0.0209, 0.0203, 0.0172),
                                                       (-0.064, 0.0204, 0.0198, 0.0168),
                                                       (-0.069, 0.0150, 0.0146, 0.0122)], M['brass'], p=5.0),
        _body(f'{name}.buttplate', [(-0.3245, bz - 0.0085, bz - 0.1295, 0.0216),
                                    (-0.3290, bz - 0.0088, bz - 0.1300, 0.0215),
                                    (-0.3310, bz - 0.0105, bz - 0.1280, 0.0200)], M['brass'], p=2.3),
    ]
    obs += _peep(name, 0.253, bz + 0.0204, 0.0040, 0.0009, M['brass'])
    # the conduits from the coil's front collar to the focus ring, standing off the barrel on their clamps
    obs += _conduits(f'{name}.conduit', 0.2035, 0.7015, 0.0166, 0.0136, bz, M['brass'], 0.0019,
                     clamps=(0.27, 0.43, 0.62, 0.68))
    for k, y in enumerate((0.335, 0.525)):   # the barrel bands, round barrel, conduits and forestock all
        bottom = bz - (0.0505 if y < 0.47 else 0.0465) - 0.0012
        obs.append(_body(f'{name}.band{k}', [(y + 0.004, bz + 0.0158, bottom, 0.0188),
                                             (y, bz + 0.0161, bottom - 0.0003, 0.0191),
                                             (y - 0.004, bz + 0.0158, bottom, 0.0188)], M['brass'], p=6.0))
        obs += _chevrons(f'{name}.chevron{k}', y, bz - 0.004, bottom + 0.006, 0.0163 if y < 0.47 else 0.0153,
                         M['brass'])
    # the ramrod under the barrel, out past the nose cap through a brass pipe, its tip brass
    rz = bz - 0.0195
    obs += [_along_y(f'{name}.ramrod', [(0.0034, 0.590), (0.0034, 0.712)], M['steel'], at=(0.0, rz), sides=10),
            _along_y(f'{name}.ramtip', [(0.0040, 0.709), (0.0042, 0.712), (0.0042, 0.718), (0.0034, 0.720)], M['brass'],
                     at=(0.0, rz), sides=10),
            _along_y(f'{name}.pipe', [(0.0050, 0.660), (0.0054, 0.663), (0.0054, 0.670), (0.0050, 0.673)], M['brass'],
                     at=(0.0, rz), sides=12)]
    # Dwemer armour on the butt's sides, a cog on each; a fluted bronze forend over the forestock's nose
    for side in (1.0, -1.0):
        obs.append(_shell(f'{name}.buttplate{"R" if side > 0 else "L"}', BUTT_ROWS, 2.3, -0.302, -0.140,
                          lambda y: bz + np.interp(y, (-0.302, -0.200, -0.140), (-0.026, -0.028, -0.050)),
                          lambda y: bz + np.interp(y, (-0.302, -0.200, -0.140), (-0.108, -0.086, -0.056)),
                          0.0014, M['brass'], side))
        obs.append(_cog(f'{name}.buttcog{"R" if side > 0 else "L"}', (-0.252, bz - 0.064), 0.0115, 10,
                        side * 0.0218 if side > 0 else -0.0234, 0.0234 if side > 0 else -0.0218, M['brass']))
        obs.append(_disc(f'{name}.buttgem{"R" if side > 0 else "L"}', (-0.252, bz - 0.064), 0.0062,
                         0.0225 if side > 0 else -0.0242, 0.0242 if side > 0 else -0.0225, M['teal']))
        obs.append(_shell(f'{name}.forend{"R" if side > 0 else "L"}', FORE_ROWS, 2.8, 0.540, 0.598,
                          lambda y: bz + np.interp(y, (0.540, 0.565, 0.598), (-0.022, -0.007, -0.006)),
                          lambda y: bz + np.interp(y, (0.540, 0.565, 0.598), (-0.024, -0.038, -0.034)),
                          0.0012, M['brass'], side))
    zc, at, x = LOCKS['thunderlock']
    obs += _lock(name, M, zc, at, x)
    obs += _side_plate(name, M, zc, (-0.030, 0.095), -0.0212, 0.032)
    # Dwemer claws of bronze reaching forward from the butt plate along the butt's sides
    obs += _claws(f'{name}.buttclaw', [(-0.3245, bz - 0.038), (-0.3245, bz - 0.100), (-0.306, bz - 0.093),
                                       (-0.288, bz - 0.069), (-0.306, bz - 0.045)], 0.0190, M['brass'])
    # the trigger guard: a brass strap along the action's belly, its bow round the trigger to the grip's front
    g, f = _grip_axis('thunderlock')
    end = g * 0.040 + f * 0.0195
    guard = [(0.108, bz - 0.0362), (0.074, bz - 0.0362), (0.068, 0.047), (0.062, 0.037), (0.053, 0.0295),
             (0.042, 0.0265), (0.033, 0.0290), (float(end[0]), float(end[1]))]
    obs.append(_swept(f'{name}.guard', [(0.0, y, z) for y, z in guard], lambda t: (0.0034, 0.0013), M['brass']))
    obs.append(_swept(f'{name}.trigger', [(0.0, 0.050, bz - 0.036), (0.0, 0.049, 0.046), (0.0, 0.046, 0.039),
                                          (0.0, 0.041, 0.035)], lambda t: (0.0011, 0.0018 - 0.0008 * t), M['steel']))
    return obs


def _pistol_front(s, depth=0.0185):
    """A point on the Pistolet's grip's front, `s` up the grip from its middle."""
    g, f = _grip_axis('pistolet')
    return tuple(float(v) for v in g * s + f * depth)


def build_pistolet(finish='plain', name='pistolet'):
    """The Dwarven Pistolet, a heavy Dwemer horse pistol, in its own frame: 0.45 m from its pommel to its muzzle."""
    M = materials_of(finish)
    bz = _PB
    at = (0.0, bz)
    # the walnut stock in one sweep along its belly: from the nose under the barrel back over the lock, round the
    # trigger's corner and down the grip's front; its top and back fall where it reaches (y, z, low, high, half across)
    stock = [(0.214, 0.0808, -0.0005, 0.0190, 0.0108), (0.170, 0.0790, -0.0005, 0.0215, 0.0118),
             (0.122, 0.0755, -0.0005, 0.0268, 0.0130), (0.098, 0.0708, -0.0005, 0.0372, 0.0150),
             (0.074, 0.0682, -0.0005, 0.0402, 0.0160), (0.060, 0.0662, -0.0005, 0.0418, 0.0160),
             (0.0505, 0.0600, -0.0005, 0.0410, 0.0158), (0.0440, 0.0500, -0.0005, 0.0388, 0.0153),
             (*_pistol_front(0.030), -0.0005, 0.0372, 0.0149), (*_pistol_front(0.0), -0.0005, 0.0380, 0.0153),
             (*_pistol_front(-0.018), -0.0005, 0.0390, 0.0157), (*_pistol_front(-0.028), -0.0005, 0.0400, 0.0162)]
    obs = [
        _along_y(f'{name}.breech', [(0.0128, 0.034), (0.0120, 0.152)], M['steel'], 'octagon', at, sides=8),
        _along_y(f'{name}.ring', [(0.0124, 0.149), (0.0142, 0.151), (0.0142, 0.155), (0.0120, 0.157)], M['brass'],
                 'octagon', at, sides=8),
        _along_y(f'{name}.barrel', [(0.0111, 0.155), (0.0101, 0.281)], M['steel'], at=at),
        _along_y(f'{name}.band', [(0.0118, 0.2265), (0.0142, 0.2275), (0.0142, 0.2325), (0.0118, 0.2335)], M['brass'],
                 at=at),
        _spine(f'{name}.spine', 0.062, 0.140, bz + 0.0114, bz, 2, M['brass'], thick=0.0022),
        *_peep(name, 0.101, bz + 0.0150, 0.0030, 0.0008, M['brass']),
        # the conduits from the breech's ring to the band, as the Thunderlock's
        *_conduits(f'{name}.conduit', 0.157, 0.2275, 0.0111, 0.0105, bz, M['brass'], 0.0014, clamps=(0.192,),
                   lift=0.0010),
        _slab(f'{name}.frontsight', [(0.310, bz + 0.0110), (0.300, bz + 0.0110), (0.303, bz + 0.0160),
                                     (0.308, bz + 0.0164)], -0.0009, 0.0009, M['brass'], bevel=0.0003),
        _flow(f'{name}.stock', stock, M['stock']),
        # the bulbed brass pommel, the nose cap, the breech tang over the wrist
        _along_grip(f'{name}.pommel', 'pistolet', [(-0.026, 0.0206, 0.0201, 0.0164), (-0.033, 0.0216, 0.0210, 0.0172),
                                                   (-0.040, 0.0210, 0.0204, 0.0168), (-0.045, 0.0160, 0.0156, 0.0128),
                                                   (-0.0525, 0.0030, 0.0030, 0.0026)], M['brass'], p=5.0),
        _body(f'{name}.nosecap', [(0.2185, bz - 0.0068, bz - 0.0232, 0.0094),
                                  (0.2095, bz - 0.0042, bz - 0.0272, 0.0117),
                                  (0.2045, bz - 0.0038, bz - 0.0282, 0.0124)], M['brass'], p=5.0),
        _swept(f'{name}.tang', [(0.0, 0.040, bz + 0.0040), (0.0, 0.031, 0.1035), (0.0, 0.023, 0.0935),
                                (0.0, 0.016, 0.0800)], lambda t: (0.0046 - 0.0018 * t, 0.0010), M['steel']),
    ]
    rz = bz - 0.0150
    obs += [_along_y(f'{name}.ramrod', [(0.0030, 0.205), (0.0030, 0.294)], M['steel'], at=(0.0, rz), sides=10),
            _along_y(f'{name}.ramtip', [(0.0035, 0.291), (0.0037, 0.294), (0.0037, 0.299), (0.0030, 0.300)], M['brass'],
                     at=(0.0, rz), sides=10),
            _along_y(f'{name}.pipe', [(0.0044, 0.256), (0.0048, 0.258), (0.0048, 0.264), (0.0044, 0.266)], M['brass'],
                     at=(0.0, rz), sides=12)]
    zc, at, x = LOCKS['pistolet']
    obs += _lock(name, M, zc, at, x)
    obs += _side_plate(name, M, zc, (0.036, 0.104), -0.0170, 0.068)
    obs += _crown(name, 0.278, 0.3155, 0.0101, bz, M)
    obs.append(_rib(f'{name}.rib', 0.160, 0.276, 0.0110, 0.0102, bz, M['brass'], step=0.029, h=(0.0022, 0.0034),
                    w=0.0019))
    # Dwemer claws of bronze reaching up the grip's sides from the pommel
    g, f = _grip_axis('pistolet')
    claw = [tuple(g * -0.027 + f * 0.0150), tuple(g * -0.004 + f * 0.0040), tuple(g * 0.002),
            tuple(g * -0.004 - f * 0.0040), tuple(g * -0.027 - f * 0.0150)]
    obs += _claws(f'{name}.claw', [(float(y), float(z)) for y, z in claw], 0.0150, M['brass'])
    end = _pistol_front(0.046)
    guard = [(0.098, 0.0702), (0.074, 0.0672), (0.067, 0.058), (0.0615, 0.048), (0.0535, 0.0405), (0.044, 0.0365),
             (end[0] + 0.0012, end[1])]
    obs.append(_swept(f'{name}.guard', [(0.0, y, z) for y, z in guard], lambda t: (0.0032, 0.0012), M['brass']))
    obs.append(_swept(f'{name}.trigger', [(0.0, 0.0610, 0.0668), (0.0, 0.0600, 0.0595), (0.0, 0.0572, 0.0530),
                                          (0.0, 0.0528, 0.0498)], lambda t: (0.0010, 0.0017 - 0.0007 * t), M['steel']))
    return _scaled(obs, PISTOL_SCALE, PISTOL_SHIFT)


def _scaled(obs, k, shift=(0.0, 0.0, 0.0)):
    """`obs` made larger about their frame's origin (the grip's middle), `k` along their own X, Y and Z, then moved
    so `shift` is the origin; their pattern coordinates with them."""
    k = np.asarray(k, dtype=np.float32)
    for ob in obs:
        me = ob.data
        co = np.empty(len(me.vertices) * 3, dtype=np.float32)
        me.vertices.foreach_get('co', co)
        co = (co.reshape(-1, 3) * k - np.asarray(shift, dtype=np.float32)).ravel()
        me.vertices.foreach_set('co', co)
        if 'rest' in me.attributes:
            me.attributes['rest'].data.foreach_set('vector', co)
        me.update()
    return obs


BUILD = {'thunderlock': build_thunderlock, 'pistolet': build_pistolet}
# a shot's flash: the spell's star of light (gear.py `build_sparks`) in the blue of the orb the guns fire
FLASH_CORE, FLASH_THREAD = (214, 236, 255), (96, 160, 255)


def build_flashes():
    """The flash at each of the spark's sizes, hidden until a shot shows one (`gunner`)."""
    import gear
    return gear.build_sparks(FLASH_CORE, FLASH_THREAD, name='gunflash', sizes=gear.FLASH_SPARKS, star=None, glow=0.8,
                             shape=gear.FLASH_SHAPE)


def class_hold(pose, m):
    """A gun's frame in place of a class weapon's frame `m`, held as gunplay.py's `gun_at` holds it: its raked grip up
    the right fist's line (the hand's +Y, along which `m` runs), its muzzle out over the knuckles (the hand's -Z), its
    top toward the thumb. `m`'s own turn about the fist is a blade's edge, so the hand sets the muzzle. One rake for
    both guns, their grips' mean: each grip lies within 4 degrees of the fist's line."""
    from mathutils import Matrix, Vector
    H = pose.world()['hand_R'].to_3x3()
    up, knuckles = (H @ Vector((0.0, 1.0, 0.0))).normalized(), H @ Vector((0.0, 0.0, -1.0))
    knuckles = (knuckles - knuckles.project(up)).normalized()
    r = math.radians(sum(RAKE.values()) / len(RAKE))
    muzzle = knuckles * math.cos(r) + up * math.sin(r)
    belly = knuckles * math.sin(r) - up * math.cos(r)
    out = Matrix((belly, muzzle.cross(belly), muzzle)).transposed().to_4x4()
    out.translation = m.translation
    return out


def as_class_weapon(pose, m):
    """Whether frame `m` is a class weapon's (the hurt, the spell, the forge's own), run up the right fist's line (the
    hand's +Y), and not a gun's laid by its own moves, whose muzzle runs out over the knuckles."""
    from mathutils import Vector
    up = pose.world()['hand_R'].to_3x3() @ Vector((0.0, 1.0, 0.0))
    return m.to_3x3().col[2].normalized().dot(up.normalized()) > math.cos(math.radians(40.0))


def gunner(Bare):
    """`Bare` (layers.py) holding guns: as it, and showing a shot's flash where its frame fires one (the gear's `flash`:
    where, its size), so the spell's spark never lights a gun. Where the frame is a class weapon's, the gun is laid
    by the hand (`class_hold`), so it is held by its grip and never as a blade."""
    class Gunner(Bare):
        flashes = ()

        def key_gear(self, pose, gear):
            """The gear as `place` lays it: the strip's key (layers.py `Keys.pose`) holds the gun's hold."""
            m = gear.get('axe')
            return {**gear, 'axe': class_hold(pose, m)} if m is not None and as_class_weapon(pose, m) else gear

        def place(self, pose, gear):
            # turned in the frame's own gear: the depth cloud (fit.py) lays the gun from it after this
            gear.update(self.key_gear(pose, gear))
            super().place(pose, gear)
            flash = gear.get('flash')
            for size, ob in enumerate(self.flashes, 1):
                ob.hide_render = not flash or flash[1] != size
                if flash and flash[1] == size:
                    ob.matrix_world = flash[0]
    return Gunner


def held_layers(body, classify, Bare, Layer):
    """Every gun's held layer on `body`: each gun in each finish in the right fist (`HELD`), and the Pistolet in the
    left for a pair (`OFF`), each with its flash."""
    Gunner = gunner(Bare)
    right = Gunner(body, 'axe')
    made = build_all()
    right.arm_held([ob for obs in made.values() for ob in obs])
    right.flashes = build_flashes()
    left = Gunner(body, 'sword')
    left.flashes = build_flashes()
    off = {name: build(name) for name in OFF}
    left.off = [ob for obs in off.values() for ob in obs]
    return ([Layer(name, right, obs + right.flashes, classify) for name, obs in made.items()]
            + [Layer(name, left, obs + left.flashes, classify) for name, obs in off.items()])


def build(layer):
    """A held layer's gun (`HELD`, `OFF`): its kind in its finish, each part its own object named for the layer."""
    kind = 'thunderlock' if layer.startswith('thunderlock') else 'pistolet'
    return BUILD[kind]('gilded' if 'gilded' in layer else 'plain', name=layer)


def build_all():
    """Every held gun, the right fist's: {layer: [object]}."""
    return {name: build(name) for name in HELD}


# the holster a Pistolet is worn in: leather round its barrel and lock from the lock's front to past the muzzle, the
# grip and the hammer standing out of its mouth; a band of the sheath's metal at the mouth and a cap at its foot
HOLSTER = ((1.95, 2.0), (2.05, 4.2), (1.75, 12.0), (1.5, 18.4), (1.1, 19.2))   # (half its girth, y), Pistolet units


def build_holster(name, A):
    """A Pistolet's holster, in the gun's own frame: leather (`A['strap']`, a worn sheath's) round the barrel, its
    mouth and foot in the sheath's metal (`A['trim']`)."""
    u = PISTOL_UNIT
    bz = _PB
    axis = (0, bz - 0.4 * u)   # a little under the bore, round the barrel and the ramrod
    body = _along_y(name, [(r * u, y * u) for r, y in HOLSTER], A['strap'], 'square', axis)
    mouth = _along_y(f'{name}.mouth', [(2.08 * u, 1.9 * u), (2.15 * u, 2.6 * u)], A['trim'], 'square', axis)
    foot = _along_y(f'{name}.foot', [(1.55 * u, 17.6 * u), (1.2 * u, 19.3 * u)], A['trim'], 'square', axis)
    return _scaled([body, mouth, foot], PISTOL_SCALE, PISTOL_SHIFT)
