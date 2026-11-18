"""The forge's organic body: each part a metaball of blended ellipsoids (muscle on muscle), made a mesh and skinned to
the rig's joints by the forge's own linear-blend weights. Armour that fits the body is a shell of a body part's
region, pushed out along its normals, sharing the part's weights, so it bends exactly as the body under it does.

Every mesh carries a `rest` point attribute: its rest position (about the limb's own axis for a limb). Patterns read
it, so a lattice or a fleck stays on its texel however the mesh is posed."""
import bpy
import numpy as np
from mathutils import Matrix, Vector

from rig import rest

K = 0.57   # an isolated ellipsoid element's surface lies at this share of its size (threshold 0.6, stiffness 2)


def _link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def blob(centre, radii, along=None, stiffness=2.0, negative=False):
    """An ellipsoid of the given surface radii (x, y, z); with `along`, its z axis turned onto that direction."""
    return {'c': Vector(centre), 'r': Vector(radii), 'along': along, 's': stiffness, 'neg': negative}


def seg(a, b, r_side, r_depth=None, stiffness=2.0):
    """An ellipsoid spanning a to b, `r_side` across and `r_depth` deep."""
    a, b = Vector(a), Vector(b)
    return blob((a + b) / 2, (r_side, r_depth or r_side, (b - a).length / 2), along=b - a, stiffness=stiffness)


def bone(a, b, r, back=0.3, on=0.3, flat=0.92):
    """A finger's or a toe's bone from a to b, its blob run on past both ends into the next one's, so a finger is one
    smooth length with its joints swelling a little, never a string of beads."""
    a, b = Vector(a), Vector(b)
    d = b - a
    return seg(a - d * back, b + d * on, r, r * flat)


def blob_mesh(name, blobs, res=0.007):
    mb = bpy.data.metaballs.new(name)
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = 0.6
    mob = _link(bpy.data.objects.new(name + '_mb', mb))
    for b in blobs:
        e = mb.elements.new()
        e.type = 'ELLIPSOID'
        e.co = b['c']
        e.radius = 1.0
        e.size_x, e.size_y, e.size_z = (b['r'].x / K, b['r'].y / K, b['r'].z / K)
        e.stiffness = b['s']
        e.use_negative = b['neg']
        if b['along'] is not None:
            e.rotation = Vector((0, 0, 1)).rotation_difference(Vector(b['along']).normalized())
    me = bpy.data.meshes.new_from_object(mob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(mob)
    bpy.data.metaballs.remove(mb)
    me.name = name
    me.shade_smooth()
    return me


def vloft(name, sections, centre, n=40, cap_top=True, cap_bottom=True, muscles=()):
    """A smooth body of horizontal rings. `sections` rows are (z, half width, front depth, back depth[, pecs, abs]),
    eased between rows (PCHIP, so no overshoot); `centre(z)` gives the ring's centre (x, y). Pecs swell the front
    either side of the middle, abs the middle; a ring's points run round from +X. `muscles` are swells of their own,
    each (bearing in degrees round from +X, half-width in degrees, top, bottom, height in metres[, sharpness[, along
    its length]]): a muscle rises and falls smoothly along its length and across its width; sharper than 2, its top is
    flatter and its sides steeper, a block with a crease round it. Sharper along its length alone, it is a round bulb
    in profile with soft sides, where a peaked one is a tent."""
    import bmesh
    from scipy.interpolate import PchipInterpolator
    rows = np.array([list(r) + [0.0] * (6 - len(r)) for r in sections], dtype=float)
    rows = rows[np.argsort(rows[:, 0])]
    zs = np.linspace(rows[0, 0], rows[-1, 0], max(int((rows[-1, 0] - rows[0, 0]) / 0.008), 8))
    par = [PchipInterpolator(rows[:, 0], rows[:, k])(zs) for k in range(1, 6)]
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    c, s_ = np.cos(th), np.sin(th)
    bm = bmesh.new()
    loops = []
    for i, z in enumerate(zs):
        a, f, b, pec, ab = (p[i] for p in par)
        depth = np.where(s_ > 0, b, f)
        front = s_ < 0
        bump = np.where(front, pec * (np.exp(-((c - 0.42) / 0.28) ** 2) + np.exp(-((c + 0.42) / 0.28) ** 2))
                        + ab * np.exp(-(c / 0.3) ** 2), 0.0)
        cx, cy = centre(z)
        swell = np.zeros(n)
        for bearing, half, top, bottom, height, *sharp in muscles:
            if bottom < z < top:
                p = sharp[0] if sharp else 2.0
                along = np.sin(np.pi * (z - bottom) / (top - bottom)) ** (4.0 / (sharp[1] if len(sharp) > 1 else p))
                gap = np.angle(np.exp(1j * (th - np.radians(bearing))))
                swell += height * along * np.exp(-np.abs(gap / np.radians(half)) ** p)
        xs = cx + a * c + swell * c
        ys = cy + (depth + bump) * s_ + swell * s_
        loops.append([bm.verts.new((float(x), float(y), float(z))) for x, y in zip(xs, ys)])
    for lo, hi in zip(loops, loops[1:]):
        for k in range(n):
            bm.faces.new((lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k]))
    if cap_bottom:
        bm.faces.new(list(reversed(loops[0])))
    if cap_top:
        bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth()
    return me


def chain_centre(points):
    """The centre (x, y) at height z along a chain of joint points, by straight lines between them."""
    pts = sorted((Vector(p) for p in points), key=lambda v: v.z)
    zs = [p.z for p in pts]
    return lambda z: (float(np.interp(z, zs, [p.x for p in pts])), float(np.interp(z, zs, [p.y for p in pts])))


def face_materials(me, pick):
    """Give each face the material slot `pick(centre)` answers."""
    idx = [pick(np.array(f.center)) for f in me.polygons]
    me.polygons.foreach_set('material_index', idx)


def coords(me):
    v = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', v)
    return v.reshape(-1, 3)


def normals(me):
    n = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('normal', n)
    return n.reshape(-1, 3)


def keep(me, mask):
    """A new mesh of the vertices where `mask` holds (faces whose every vertex does)."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    gone = [v for v in bm.verts if not mask[v.index]]
    bmesh.ops.delete(bm, geom=gone, context='VERTS')
    out = bpy.data.meshes.new(me.name + '_part')
    bm.to_mesh(out)
    bm.free()
    out.shade_smooth()
    return out


def smooth01(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ramp(x, lo, hi):
    """0 below lo, 1 above hi, smooth between."""
    return smooth01((x - lo) / (hi - lo))


DUAL = [True]   # dual-quaternion skinning; off, the plain linear blend


def _qmul(a, b):
    """Quaternions (w, x, y, z) multiplied, row by row."""
    a0, a1, a2, a3 = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    b0, b1, b2, b3 = b[..., 0], b[..., 1], b[..., 2], b[..., 3]
    return np.stack([a0 * b0 - a1 * b1 - a2 * b2 - a3 * b3, a0 * b1 + a1 * b0 + a2 * b3 - a3 * b2,
                     a0 * b2 - a1 * b3 + a2 * b0 + a3 * b1, a0 * b3 + a1 * b2 - a2 * b1 + a3 * b0], axis=-1)


def skin(rest, heads, joints, w, W):
    """Points at rest (`rest`, each weighted `w` over `joints`, whose rest heads are `heads`) posed by the joints'
    world matrices `W`. Dual quaternions blend each joint's turn and move as one rigid motion, so a point shared by a
    raised arm and the chest keeps its distance from the shoulder; a linear blend of the two pulls it in toward the
    joint, and the shoulder's top caves into a flat slab (DUAL off)."""
    if not DUAL[0]:
        out = np.zeros_like(rest)
        for k, j in enumerate(joints):
            M = np.array(W[j])
            out += w[:, k:k + 1] * ((rest - heads[k]) @ M[:3, :3].T + M[:3, 3])
        return out
    qr, qd = [], []
    for k, j in enumerate(joints):
        M = np.asarray(W[j], float)   # a Blender matrix or its numbers, as the caller keeps them
        q = Matrix(M[:3, :3].tolist()).to_quaternion()
        r = np.array([q.w, q.x, q.y, q.z])
        t = M[:3, 3] - M[:3, :3] @ heads[k]   # the rest point's move after the turn
        qr.append(r)
        qd.append(0.5 * _qmul(np.array([0.0, *t]), r))
    qr, qd = np.array(qr), np.array(qd)
    lead = np.argmax(w, axis=1)
    sign = np.sign((qr @ qr.T)[lead])   # each joint's turn on the same side of the sphere as the vertex's own lead
    sign[sign == 0] = 1.0
    ws = w * sign
    br, bd = ws @ qr, ws @ qd
    n = np.linalg.norm(br, axis=1, keepdims=True)
    br, bd = br / n, bd / n
    v = br[:, 1:]
    out = rest + 2.0 * br[:, :1] * np.cross(v, rest) + 2.0 * np.cross(v, np.cross(v, rest))
    conj = br * np.array([1.0, -1.0, -1.0, -1.0])
    return out + 2.0 * _qmul(bd, conj)[:, 1:]


class Skinned:
    """A mesh posed by linear-blend skinning: `weights` (n, joints) over `joints`."""

    def __init__(self, name, me, mat, joints, weights, axis=None):
        self.me = me
        self.ob = _link(bpy.data.objects.new(name, me))
        for m in (mat if isinstance(mat, (list, tuple)) else [mat] if mat else []):
            me.materials.append(m)
        self.joints = list(joints)
        self.rest = coords(me)
        w = np.asarray(weights, dtype=np.float64)
        self.w = w / np.maximum(w.sum(axis=1, keepdims=True), 1e-9)
        self.heads = np.array([rest(j) for j in self.joints])
        self.alpha, self.axes = None, None   # a fused body's shares of its pieces (anatomy.py), kept by its shells
        base = self.rest - (axis(self.rest) if axis else 0.0)
        attr = me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')
        attr.data.foreach_set('vector', base.astype(np.float32).ravel())

    def pose(self, W):
        out = skin(self.rest, self.heads, self.joints, self.w, W)
        self.me.vertices.foreach_set('co', out.ravel())
        self.me.update()

    def cut(self, mask):
        """Keep only the vertices where `mask` holds (and the faces of them): the skin under armour, which no view
        can see, goes."""
        import bpy
        me = keep(self.me, mask)
        for m in self.me.materials:
            me.materials.append(m)
        old, self.me = self.me, me
        self.ob.data = me
        bpy.data.meshes.remove(old)
        self.rest, self.w = self.rest[mask], self.w[mask]
        if self.alpha is not None:
            self.alpha = self.alpha[mask]

    def shell(self, name, mat, mask, push, axis=None):
        """Armour over a region of this part: the vertices where `mask` holds, pushed `push` metres out (a number, or
        one a vertex), with this part's weights."""
        sub = keep(self.me, mask)
        sub.polygons.foreach_set('material_index', [0] * len(sub.polygons))
        n = normals(self.me)[mask]
        p = self.rest[mask] + n * (np.asarray(push)[mask, None] if np.ndim(push) else push)
        sub.vertices.foreach_set('co', p.ravel())
        sub.update()
        out = Skinned(name, sub, mat, self.joints, self.w[mask], axis=axis)
        if self.alpha is not None:
            out.alpha, out.axes = self.alpha[mask], self.axes
        return out


def rest_attr(me, base=None):
    """The `rest` attribute of a rigid part: its own mesh coordinates."""
    v = coords(me) if base is None else base
    attr = me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')
    attr.data.foreach_set('vector', v.astype(np.float32).ravel())
