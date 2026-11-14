"""The beast forge's kit: any creature's skeleton from its own joint table, its body sculpted as tubes along its bones and
blended blobs, fused into one skinned mesh, and its rigid parts.

Axes as the fighter's (rig.py): +X is the creature's left, +Y its back, +Z up, and it faces -Y. Every joint's rest
frame is the world's, so a part is modelled in rest space and posed by its joint's matrix alone. The root is the ground
under the creature."""
import math

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

import anatomy
from body import Skinned, coords, ramp


class Skeleton:
    """A creature's joints: {name: (parent, rest head in metres)}, parents listed before their children."""

    def __init__(self, joints):
        self.joints = dict(joints)
        self.order = list(self.joints)
        for j, (p, _) in self.joints.items():
            assert p is None or self.order.index(p) < self.order.index(j), f'{j} comes before its parent {p}'

    def rest(self, j):
        return Vector(self.joints[j][1])

    def offset(self, j):
        p = self.joints[j][0]
        return self.rest(j) - (self.rest(p) if p else Vector((0, 0, 0)))


def euler(deg):
    return Euler([math.radians(a) for a in deg], 'XYZ')


class Pose:
    """Local rotations (degrees, XYZ about the joint's rest axes) per joint, the root's place and turn, and a size for
    any joint whose part grows or shrinks through an animation (`scales`: the dragonling's breath of fire)."""

    def __init__(self, skel, rot=None, root_loc=(0, 0, 0), yaw=0.0, scales=None):
        self.skel = skel
        self.rot = dict(rot or {})
        self.root_loc = Vector(root_loc)
        self.yaw = yaw
        self.scales = dict(scales or {})

    def world(self):
        m = {}
        for j in self.skel.order:
            p = self.skel.joints[j][0]
            local = euler(self.rot.get(j, (0, 0, 0))).to_matrix().to_4x4()
            if j in self.scales:
                local = local @ Matrix.Scale(self.scales[j], 4)
            if p is None:
                base = Matrix.Translation(self.root_loc) @ Matrix.Rotation(math.radians(self.yaw), 4, 'Z')
                m[j] = base @ Matrix.Translation(self.skel.rest(j)) @ local
            else:
                m[j] = m[p] @ Matrix.Translation(self.skel.offset(j)) @ local
        return m


def _pchip(x, ys, at):
    from scipy.interpolate import PchipInterpolator
    return PchipInterpolator(x, ys, axis=0)(at)


def tube(name, path, sections, n=36, up=(0, 0, 1), step=0.006):
    """A smooth body of rings along the polyline `path` (rest space), eased through its points. `sections` rows are
    (t, half width, up, down[, lift]): the share of the path's length, the ring's half width across, its height above
    and below its centre, and the centre raised along the ring's up. Every ring is square to the path; its up is kept
    toward `up` (a direction the path never runs along). Ends taper as the rows ask and are closed."""
    import bmesh
    path = np.asarray(path, dtype=np.float64)
    s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    length = s[-1]
    rows = np.array([list(r) + [0.0] * (5 - len(r)) for r in sections], dtype=np.float64)
    rows = rows[np.argsort(rows[:, 0])]
    ts = np.linspace(0.0, 1.0, max(int(length / step), 8))
    centres = _pchip(s / length, path, ts)
    tang = np.gradient(centres, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True)
    half, hi, lo, lift = (_pchip(rows[:, 0], rows[:, k], ts) for k in range(1, 5))
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    c, s_ = np.cos(th), np.sin(th)
    upv = np.asarray(up, dtype=np.float64)
    side = np.cross(upv, tang[0])
    side /= np.linalg.norm(side)
    bm = bmesh.new()
    loops = []
    for i, t in enumerate(tang):
        if i:   # carried along the path: the frame turns only as the path does
            side = side - t * (side @ t)
            side /= np.linalg.norm(side)
        u = np.cross(t, side)
        r = np.where(s_ > 0, hi[i], lo[i])
        pts = centres[i] + u * lift[i] + np.outer(c * half[i], side) + np.outer(s_ * r, u)
        loops.append([bm.verts.new(tuple(p)) for p in pts])
    for a, b in zip(loops, loops[1:]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    for loop, at in ((loops[0], centres[0]), (loops[-1], centres[-1])):   # each end closed by a fan to its centre
        mid = bm.verts.new(tuple(at))
        for k in range(n):
            bm.faces.new((loop[k], loop[(k + 1) % n], mid))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    return me


def cone(name, a, b, r0, r1=0.002, n=6, step=0.008):
    """A spike from `a` (radius `r0`) to `b` (`r1`): a claw, a fang, a horn's tip, a fin's ray."""
    d = np.abs(np.subtract(b, a))
    return tube(name, [a, b], [(0.0, r0, r0, r0), (1.0, r1, r1, r1)], n=n, up=np.eye(3)[int(np.argmin(d))], step=step)


def web(name, pairs, sag=0.3, cols=4, rows=3):
    """A membrane: for each two rays side by side (each a (root, tip)), a sheet between them, its free edge bowed in
    toward the roots by `sag` between the tips."""
    import bmesh
    bm = bmesh.new()
    for (ra, ta), (rb, tb) in pairs:
        ra, ta, rb, tb = (np.asarray(q, dtype=np.float64) for q in (ra, ta, rb, tb))
        grid = []
        for c in range(cols + 1):
            u = c / cols
            root, tip = ra + (rb - ra) * u, ta + (tb - ta) * u
            tip = tip + (root - tip) * sag * math.sin(math.pi * u)
            grid.append([bm.verts.new(tuple(root + (tip - root) * r / rows)) for r in range(rows + 1)])
        for a, b in zip(grid, grid[1:]):
            for r in range(rows):
                bm.faces.new((a[r], b[r], b[r + 1], a[r + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    return me


def apart(params):
    """Fit parameters with each mirrored pair (`left|right`, beastfit.pair) split into its two joints' own: for the
    views where a creature need not be a mirror image of itself."""
    return [(j, a, st) for joint, a, st in params for j in joint.split('|')]


def roughen(me, depth=0.015, scale=25.0, along=(1.0, 1.0, 1.0)):
    """A mesh's surface pushed in and out along its normals by a noise `depth` metres deep, `scale` waves a metre
    (squeezed along each axis by `along`): a broken, furred or weathered outline. For a rigid part, before `rigid`."""
    from mathutils import Vector, noise
    me.update()
    k = np.asarray(along, dtype=np.float64) * scale
    for v in me.vertices:
        v.co += v.normal * depth * noise.noise(Vector(np.asarray(v.co) * k))
    return me


def shaggy(skin, depth=0.015, scale=25.0, along=(1.0, 1.0, 1.0)):
    """A skin's surface pushed in and out along its normals by a noise `depth` metres deep, `scale` waves a metre
    (squeezed along each rest axis by `along`): fur's broken outline, where a smooth tube reads as a toy. Done before
    the skin is shaped or posed, it moves its rest place with it."""
    me = roughen(skin.me, depth, scale, along)
    skin.rest = coords(me)
    me.attributes['rest'].data.foreach_set('vector', skin.rest.astype(np.float32).ravel())
    return skin


def buried(rows, depth=0.1, share=0.5):
    """A limb's section rows with its end inside the trunk narrowed: `share` of its first row's girth at the path's
    start, swelling to the full row by `depth` of the path. A limb begun at full girth inside the trunk shows its
    flat end as a ledge where it breaks the trunk's surface."""
    first = rows[0]
    narrow = (0.0,) + tuple(v * share for v in first[1:4]) + tuple(first[4:])
    rest = [r for r in rows if r[0] > depth]
    return [narrow, (depth,) + tuple(first[1:])] + rest


def chain_place(p, pts):
    """Each point's arc-length place along the polyline `pts`, at its nearest point: (place, that point)."""
    pts = np.asarray(pts, dtype=np.float64)
    a, b = pts[:-1], pts[1:]
    d = b - a
    lens = np.linalg.norm(d, axis=1)
    starts = np.concatenate([[0.0], np.cumsum(lens)[:-1]])
    t = np.clip(((p[:, None, :] - a[None]) * d[None]).sum(-1) / np.maximum(lens ** 2, 1e-12)[None], 0.0, 1.0)
    near = a[None] + t[..., None] * d[None]
    dist = np.linalg.norm(p[:, None, :] - near, axis=2)
    k = np.argmin(dist, axis=1)
    idx = np.arange(len(p))
    return starts[k] + t[idx, k] * lens[k], near[idx, k]


def chain_weights(p, pts, blend=0.03):
    """Each point's weights over the bones of the polyline `pts` (bone k runs from pts[k] to pts[k + 1]): a point
    goes with the bone at its nearest place along the chain, shared over `blend` metres either side of each joint."""
    at, _ = chain_place(p, pts)
    lens = np.linalg.norm(np.diff(np.asarray(pts, dtype=np.float64), axis=0), axis=1)
    joints = np.cumsum(lens)[:-1]
    over = [ramp(at, j - blend, j + blend) for j in joints]   # how far past each joint a point lies
    w = [1.0 - over[0] if over else np.ones(len(p))]
    for k in range(1, len(lens)):
        w.append(over[k - 1] - (over[k] if k < len(over) else 0.0))
    return np.clip(np.stack(w, axis=1), 0.0, 1.0)


class Skin(Skinned):
    """A mesh posed by linear-blend skinning over the creature's own joints (body.Skinned reads the fighter's). With
    no weights it follows its one joint whole."""

    def __init__(self, skel, name, me, mat, joints, weights):
        self.me = me
        self.ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(self.ob)
        for m in mat if isinstance(mat, (list, tuple)) else [mat]:
            me.materials.append(m)
        self.joints = list(joints)
        self.rest = coords(me)
        w = np.ones((len(self.rest), 1)) if weights is None else np.asarray(weights, dtype=np.float64)
        self.w = w / np.maximum(w.sum(axis=1, keepdims=True), 1e-9)
        self.heads = np.array([skel.rest(j) for j in self.joints])
        self.alpha = np.ones((len(self.rest), 1))   # one piece, unless fuse() lays its pieces' shares
        self.pieces = []
        attr = me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')
        attr.data.foreach_set('vector', self.rest.astype(np.float32).ravel())


class Piece:
    """One piece of a body: its rest mesh, its weights (a function of rest points, over the body's joints), the axis
    its girth is fitted about (a polyline, or a centre point), the shares along that axis of its section rows
    (`rows`), if its girth is fitted row by row, and the key and centre it is sized by (`size`), with its group."""

    def __init__(self, name, me, weights, axis, rows=None, size=None):
        self.name, self.me, self.weights = name, me, weights
        self.axis = np.asarray(axis, dtype=np.float64)
        self.rows = None if rows is None else [float(r) for r in rows]
        self.size = size   # (key, centre): the piece sized whole about a centre, as its group's key asks


def fuse(skel, name, pieces, joints, mats, pick=None, decimate=None):
    """The pieces fused into one closed skinned mesh (anatomy's remesh, crease fill and thinning): every vertex keeps
    its share of each piece (`alpha`), its weights blended by those shares. `pick(rest point, alpha)` gives each face
    its material slot among `mats`. `decimate` is the share of the remesh's faces kept (anatomy's, unless a creature
    drawn small asks for fewer)."""
    me = anatomy._union([pc.me for pc in pieces])
    co = coords(me)
    edges = np.array([e.vertices[:] for e in me.edges], dtype=np.int64)
    d = anatomy._distances(co, [pc.me for pc in pieces])
    two = np.sort(d, axis=1)[:, 1] if len(pieces) > 1 else np.full(len(co), 1.0)
    co = anatomy._smooth(co, edges, 1 - ramp(two, 0.0, anatomy.FILLET), 20, mu=0.0)
    co = anatomy._smooth(co, edges, np.full(len(co), 0.5), 6)
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    me = anatomy._decimate(me, anatomy.DECIMATE if decimate is None else decimate)
    co = coords(me)
    d = anatomy._distances(co, [pc.me for pc in pieces])
    a = np.exp(-(d - d.min(axis=1, keepdims=True)) / 0.004)
    alpha = a / a.sum(axis=1, keepdims=True)
    w = sum(alpha[:, k:k + 1] * pc.weights(co) for k, pc in enumerate(pieces))
    for pc in pieces:
        bpy.data.meshes.remove(pc.me)
    me.name = name
    me.shade_smooth()
    if pick is not None:
        cen = np.array([f.center[:] for f in me.polygons])
        fa = np.array([alpha[list(f.vertices)].mean(axis=0) for f in me.polygons])
        me.polygons.foreach_set('material_index', [int(pick(c, s)) for c, s in zip(cen, fa)])
    sk = Skin(skel, name, me, mats, joints, w)
    sk.alpha = alpha
    sk.pieces = pieces
    return sk


def weights_over(joints, names, w):
    """Weights `w` over the joints `names`, laid into the body's `joints`."""
    out = np.zeros((len(w), len(joints)))
    for k, j in enumerate(names):
        out[:, joints.index(j)] += w[:, k]
    return out


def hang(parts, skel, ob, joint, rides=None):
    """A rigid part on its joint: its mesh moved into the joint's space (its `rest` attribute stays in rest space).
    `rides` names the piece of the body it sits on, so it moves as that piece is shaped (beastshape.py)."""
    ob.data.transform(Matrix.Translation(-skel.rest(joint)))
    if rides:
        ob['rides'] = rides
    parts.append((ob, joint))


def rigid(name, me_or_ob, mat=None):
    """A rigid part: an object of its own, its `rest` attribute its own coordinates (the patterns read it)."""
    if isinstance(me_or_ob, bpy.types.Object):
        ob = me_or_ob
    else:
        ob = bpy.data.objects.new(name, me_or_ob)
        bpy.context.scene.collection.objects.link(ob)
    if mat is not None and not ob.data.materials:
        ob.data.materials.append(mat)
    v = coords(ob.data)
    attr = ob.data.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')
    attr.data.foreach_set('vector', v.astype(np.float32).ravel())
    return ob
