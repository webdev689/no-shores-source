"""The horse's head up close, for the touch's close-up (fptouch.py) and its hand's holdout (fpreins.py --touch): the
eyes and the mouth the game's bake has no room for. The bake paints its eyes on the coat and blends its head and its
jaw across the whole face, so its jaw only smears the muzzle.

`install` builds from a bake of the Courser with a mouth: its body subdivided once and cut along the lip line
(`LIP_LINE`) ahead of the corners, the upper lip the head's alone and the lower the jaw's, the cheek's blend sharpened
(`CHEEK`). `Head(courser)` dresses a Courser built from it with the rest, each piece riding its bones as the
tack does: the mouth's inside behind the lips (`MOUTH`; the lips' edges are folded in, `LIP_FOLD`), the incisors
(`TEETH`) and the tongue (`TONGUE`); each eye an eyeball,
glossy and dark, its pupil a bar across it, in lids and lashes (`EYE`); the nostrils (`NOSTRIL`) and the muzzle's dark
skin (`MUZZLE`). `Head.pose(shot)` lays a shot on them: its upper lids (`lid`, 0 open and 1 shut), its nostrils
(`sniff`, 0 to 1), its upper lip reaching forward (`lip`, 0 to 1) and its lips at the bite (`gape`, 0 to 1: the upper
curled off the teeth and the lower drooped, `CURL` and `DROOP`).

`true_texels` sets the scene's pixels to the game's texel, 0.8 as wide as tall. Blender takes no pixel narrower than
it is tall, so a pixel asked 0.8 wide stays square and the picture comes out 1.25 times too tall; the same shape is
asked as 1.25 tall instead."""
import copy
import math

import numpy as np

import horse

# the lip line's height along the muzzle (the bake's frame: y ahead, z up), the front first; the mouth is cut along it
# ahead of the corners (`CORNER`, the right one)
LIP_LINE = ((1.56, 1.445), (1.52, 1.446), (1.48, 1.438), (1.44, 1.436), (1.40, 1.44))
CORNER = (0.06, 1.425, 1.43)
CHEEK = (0.4, 0.7)   # behind the corners, the jaw's share of the two mapped 0..1 between these, so the jaw moves whole
SPLIT = 3e-5   # the lower lip's copy of a point of the line stands this far under it, so the forge never welds them
LIP_FOLD = (0.009, 0.003)   # each lip's edge folds in this far toward the mouth, and this far off the line
# the upper lip's reach for the food: how far it moves (metres, the head's frame), and the part of the muzzle that
# moves, full in front of `REACH_FROM` and under `REACH_TOP`, eased over `REACH_EASE`
REACH, REACH_FROM, REACH_TOP, REACH_EASE = (0.0, 0.013, -0.006), 1.47, 1.525, 0.05
# the mouth's inside, behind the lips: inset this far (the jaw's half `deeper` again, so the head's shows where they
# overlap), reaching this far above and below the line, the halves overlapping by `lap` so it is whole as it opens;
# its front `front` metres each way
MOUTH = {'inset': 0.018, 'deeper': 0.002, 'reach': 0.016, 'lap': 0.012, 'front': 0.035, 'dense': 1}
# each colour of the mouth's inside by its row (0 the head's top row, 1 the jaw's foot): the gums along each lip, its
# throat dark between, at the front and behind (the cheek's)
MOUTH_ROWS = ((0.0, (0.03, 0.01, 0.01)), (0.17, (0.2, 0.06, 0.06)), (0.26, (0.05, 0.014, 0.014)),
              (0.74, (0.2, 0.06, 0.06)), (0.83, (0.03, 0.01, 0.01)))
MOUTH_BACK = ((0.0, (0.03, 0.01, 0.01)), (0.17, (0.15, 0.045, 0.045)), (0.29, (0.04, 0.012, 0.012)),
              (0.71, (0.15, 0.045, 0.045)), (0.83, (0.03, 0.01, 0.01)))
# the mouth lies in the head's own shadow, where the sun never reaches it and it would draw as a black hole: its inside,
# its teeth and its tongue glow this much of their own colour
MOUTH_GLOW = 0.7
# the lips at the bite: the upper lip curled up off the teeth and the lower lip drooped, each by its share of the
# mouth's opening (a shot's `gape`); full in front of `from` + `ease` and at the line, gone `near` metres off it
CURL, DROOP = (0.0, 0.004, 0.01), (0.0, 0.005, -0.011)
LIP_FALL = {'from': 1.45, 'ease': 0.05, 'near': 0.035}
# the incisors, a row above and a row below along the front of the mouth (`span` metres each way of its middle),
# behind the lips, their edges at the line: so tall, leaning forward this many degrees, in their enamel
TEETH = {'span': 0.032, 'inset': 0.008, 'size': 0.02, 'lean': 15.0, 'rgb': (0.72, 0.65, 0.5)}
# the tongue on the jaw's floor behind the lower incisors: its middle (the bake's frame), its half sizes, its pink
TONGUE = {'at': (0.0, 1.49, 1.423), 'size': (0.027, 0.045, 0.011), 'rgb': (0.42, 0.13, 0.13)}
# the right eye (the left its mirror) where the coat's picture paints it: its middle on the hide, its way out and its
# long way (forward and a little down); the eyeball's half length, height and depth, and how far its middle sits under
# the hide; the lids a shell this much larger, open this share of the eyeball's height above its middle and the lower
# lid this share under it; its lashes, their length and their width at the root
EYE = {'at': (0.111, 1.313, 1.706), 'out': (0.90, 0.42, 0.10), 'long': (0.0, 1.0, -0.22),
       'ball': (0.024, 0.019, 0.02), 'sunk': 0.012, 'lid': 1.07, 'open': 0.72, 'low': 0.5,
       'lashes': 6, 'lash': (0.01, 0.0014)}
# the eye's colours: the iris's brown, a ring a little lighter at its edge, the pupil, the pink corner at its front,
# the lids' dark skin (the coat's painted ring about the eye), their margin a little lighter, and the lashes
EYE_RGB = {'iris': (0.11, 0.06, 0.028), 'ring': (0.17, 0.095, 0.045), 'pupil': (0.006, 0.005, 0.005),
           'corner': (0.32, 0.17, 0.15), 'lid': (0.045, 0.022, 0.011), 'margin': (0.1, 0.052, 0.034),
           'lash': (0.015, 0.012, 0.01)}
PUPIL = (0.42, 0.2)   # the pupil's half width and half height, shares of the eyeball's
# the muzzle's dark skin over the coat, where its shading is the coat's (the game's dye keeps it dark on every coat):
# full in front of `from` and under `top` (the bake's frame), eased over `ease`
MUZZLE = {'rgb': (0.045, 0.038, 0.036), 'from': 1.44, 'top': 1.54, 'ease': 0.045}
INNER_LIP = (0.22, 0.07, 0.068)   # the lips' insides, folded in toward the mouth
# the right nostril (the left its mirror): where it lies on the muzzle, the way it faces, its half length and half
# width, its long way (up and in toward the middle), the curl of its top toward the middle, and its colours; a sniff
# widens it by `flare` of its width
NOSTRIL = {'at': (0.04, 1.528, 1.497), 'out': (0.55, 0.8, 0.15), 'size': (0.021, 0.0085),
           'long': (-0.35, -0.1, 1.0), 'curl': 0.35, 'rim': (0.075, 0.06, 0.055), 'hole': (0.02, 0.015, 0.015),
           'flare': 0.5}
LID_OPEN = 0.12   # a lid at rest: a little over the eye

_close = []


def _smooth(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def lip_z(y):
    """The lip line's height at `y` ahead."""
    line = np.array(LIP_LINE)
    return np.interp(y, line[::-1, 0], line[::-1, 1])


def _set_share(J, W, i, bone, w, other, w_other):
    """Vertex `i`'s weights for two bones set, its others kept: a bone without a slot takes an empty one, or the
    lightest other's."""
    for b_, value in ((bone, w), (other, w_other)):
        slot = np.nonzero(J[i] == b_)[0]
        if len(slot):
            W[i, slot[0]] = value
            W[i, slot[1:]] = 0.0
        elif value > 0:
            free = [k for k in range(4) if W[i, k] == 0 or J[i, k] not in (bone, other)]
            k = min(free, key=lambda k: W[i, k])
            J[i, k], W[i, k] = b_, value
    W[i] /= W[i].sum()


def _subdivided(P, N, UV, T, J, W):
    """The mesh with each triangle split in four at its edges' middles, its shape unchanged: (P, N, UV, T, J, W).
    A middle is made once for each pair of bake vertices, so a seam of the picture keeps its own UV on each side; its
    weights are its ends' shared out, the four heaviest kept."""
    mids, extra = {}, []

    def mid(a, b):
        key = (min(a, b), max(a, b))
        if key not in mids:
            mids[key] = len(P) + len(extra)
            extra.append(key)
        return mids[key]
    faces = []
    for a, b, c in T:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        faces += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
    e = np.array(extra)
    n = N[e[:, 0]] + N[e[:, 1]]
    J2, W2 = np.zeros((len(e), 4), np.int64), np.zeros((len(e), 4))
    for i, (a, b) in enumerate(e):
        share = {}
        for jj, ww in zip(np.concatenate([J[a], J[b]]), np.concatenate([W[a], W[b]]) / 2):
            share[int(jj)] = share.get(int(jj), 0.0) + float(ww)
        top = sorted(share.items(), key=lambda kv: -kv[1])[:4]
        total = sum(w for _, w in top) or 1.0
        for k, (jj, ww) in enumerate(top):
            J2[i, k], W2[i, k] = jj, ww / total
    return (np.vstack([P, (P[e[:, 0]] + P[e[:, 1]]) / 2]), np.vstack([N, n / np.linalg.norm(n, axis=1, keepdims=True)]),
            np.vstack([UV, (UV[e[:, 0]] + UV[e[:, 1]]) / 2]), np.array(faces, np.int64), np.vstack([J, J2]),
            np.vstack([W, W2]))


def _cut(b):
    """The bake with a mouth: its body subdivided once, then cut along the lip line itself (`lip_z`) wherever the
    muzzle crosses it ahead of `CORNER`. Each crossing point is two vertices, the upper lip's (the head's) and the
    lower's (the jaw's); at the corners, where the cut ends, it stays one, shared by both, so the corner stretches as
    skin. Each lip's edge is folded in toward the mouth (`LIP_FOLD`). Answers (bake, (the mouth's path - its rest
    points from the left corner round the front to the right - and their outward ways))."""
    out = copy.deepcopy(b)
    mesh = next(m for m in out['meshes'] if m['part'] == 'body')
    names = [x['name'] for x in out['bones']]
    head, jaw = names.index('Head'), names.index('Jaw')
    arrays = [np.array(mesh[k], dtype=t).reshape(-1, w) for k, t, w in
              (('positions', np.float64, 3), ('normals', np.float64, 3), ('uvs', np.float64, 2),
               ('indices', np.int64, 3), ('joints', np.int64, 4), ('weights', np.float64, 4))]
    P, N, UV, T, J, W = _subdivided(*arrays)   # a finer mesh, so the lips run smooth
    share = lambda i, bone: W[i][J[i] == bone].sum()   # noqa: E731
    mouthy = np.array([share(i, head) + share(i, jaw) > 0.5 for i in range(len(P))])
    f = P[:, 2] - lip_z(P[:, 1])
    f = np.where(np.abs(f) < 1e-7, 1e-7, f)
    zone = mouthy & (P[:, 1] >= CORNER[1])   # the cut's ground: the muzzle ahead of the corners
    made = {}   # an edge's crossing: (upper, lower) vertices, one and the same where the cut ends
    newP, newN, newUV, newJ, newW, kind = [], [], [], [], [], []

    def add(p, n, uv, j, w, k):
        newP.append(p), newN.append(n), newUV.append(uv), newJ.append(j), newW.append(w), kind.append(k)
        return len(P) + len(newP) - 1

    def cross(a, c):
        key = (min(a, c), max(a, c))
        if key not in made:
            t = f[key[0]] / (f[key[0]] - f[key[1]])
            p = P[key[0]] + (P[key[1]] - P[key[0]]) * t
            n = N[key[0]] + (N[key[1]] - N[key[0]]) * t
            uv = UV[key[0]] + (UV[key[1]] - UV[key[0]]) * t
            j, w = (J[key[0]], W[key[0]]) if t < 0.5 else (J[key[1]], W[key[1]])
            if zone[key[0]] and zone[key[1]]:
                below = p - np.array([0.0, 0.0, SPLIT])
                made[key] = (add(p, n, uv, j, w, 'upper'), add(below, n, uv, j, w, 'lower'))
            else:
                v = add(p, n, uv, j, w, 'corner')
                made[key] = (v, v)
        return made[key]
    faces = []
    for tri in T:
        side = f[tri] > 0
        near_mouth = mouthy[tri].all() and (P[tri, 1] >= CORNER[1] - 0.03).all()
        if side.all() or not side.any() or not near_mouth:
            faces.append(tuple(tri))
            continue
        solo = int(np.nonzero(side != (side.sum() >= 2))[0][0])   # the one corner alone on its side
        s_, p_, q_ = tri[solo], tri[(solo + 1) % 3], tri[(solo + 2) % 3]
        xp, xq = cross(s_, p_), cross(s_, q_)
        up = side[solo]
        mine, theirs = (0, 1) if up else (1, 0)   # the solo corner's side takes its copies
        faces += [(s_, xp[mine], xq[mine]), (xp[theirs], p_, q_), (xp[theirs], q_, xq[theirs])]
    first_new = len(P)
    P = np.vstack([P, np.array(newP)])
    N, UV = np.vstack([N, np.array(newN)]), np.vstack([UV, np.array(newUV)])
    J, W = np.vstack([J, np.array(newJ)]), np.vstack([W, np.array(newW)])
    T = np.array(faces, np.int64)
    kind = ['old'] * first_new + kind
    for i in range(len(P)):
        h, j = share(i, head), share(i, jaw)
        total = h + j
        if total <= 0:
            continue
        if kind[i] == 'upper':
            to_jaw = 0.0
        elif kind[i] == 'lower':
            to_jaw = 1.0
        elif kind[i] == 'corner':
            to_jaw = 0.5
        elif zone[i] if i < len(zone) else False:
            to_jaw = 1.0 if P[i, 2] < lip_z(P[i, 1]) else 0.0
        else:
            to_jaw = float(np.clip((j / total - CHEEK[0]) / (CHEEK[1] - CHEEK[0]), 0.0, 1.0))
        _set_share(J, W, i, head, total * (1 - to_jaw), jaw, total * to_jaw)
    # the mouth's path: its crossings round the muzzle, the left corner first
    pairs = sorted(set(made.values()), key=lambda uv_: math.atan2(P[uv_[0], 0], P[uv_[0], 1] - 1.40))
    seen, path = set(), []
    for upper_, lower_ in pairs:
        key = tuple(np.round(P[upper_], 5))
        if key not in seen:
            seen.add(key)
            path.append((upper_, lower_))
    inner_from = len(P)   # the folds' vertices, the lips' insides, are those from here on
    for which, sign in ((0, 1.0), (1, -1.0)):   # each lip's edge folded in toward the mouth
        rim = [pair[which] for pair in path]
        fold = []
        for i, v in enumerate(rim):
            if path[i][0] == path[i][1]:   # a corner: the cut ends there
                fold.append(v)
                continue
            o = N[v] * np.array([1.0, 1.0, 0.0])
            o /= max(np.linalg.norm(o), 1e-9)
            fold.append(len(P))
            P = np.vstack([P, P[v] - o * LIP_FOLD[0] + np.array([0.0, 0.0, sign * LIP_FOLD[1]])])
            N, UV, J, W = (np.vstack([a_, a_[v:v + 1]]) for a_ in (N, UV, J, W))
            N[-1] = -o
        ways = {(t[k], t[(k + 1) % 3]) for t in T for k in range(3)}   # each face's edges, as it winds them
        quads = []
        for a_ in range(len(rim) - 1):
            ring = (rim[a_], rim[a_ + 1], fold[a_ + 1], fold[a_])
            if (ring[0], ring[1]) in ways:   # wound against the lip's face beside it, so the hide stays one way out
                ring = (rim[a_ + 1], rim[a_], fold[a_], fold[a_ + 1])
            quads += [t for t in ((ring[0], ring[1], ring[2]), (ring[0], ring[2], ring[3])) if len(set(t)) == 3]
        if quads:
            T = np.vstack([T, np.array(quads, dtype=np.int64)])
    mesh.update(positions=P.ravel().tolist(), normals=N.ravel().tolist(), uvs=UV.ravel().tolist(),
                indices=T.ravel().tolist(), joints=J.ravel().tolist(), weights=W.ravel().tolist())
    mesh['inner_from'] = inner_from
    tips = np.array([pair[0] for pair in path])
    way = N[tips] * np.array([1.0, 1.0, 0.0])
    return out, (tips, way / np.linalg.norm(way, axis=1, keepdims=True))


def cast(P, tris, origin, way):
    """A ray from `origin` along `way` onto the mesh: (the nearest point hit, the face's unit normal), or None."""
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    e1, e2 = b - a, c - a
    h = np.cross(way, e2)
    det = (e1 * h).sum(1)
    ok = np.abs(det) > 1e-12
    f = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = origin - a
    u = f * (s * h).sum(1)
    q = np.cross(s, e1)
    v = f * (q @ way)
    t = f * (e2 * q).sum(1)
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6)
    if not hit.any():
        return None
    i = np.nonzero(hit)[0][t[hit].argmin()]
    n = np.cross(e1[i], e2[i])
    return origin + way * t[i], n / np.linalg.norm(n)


def true_texels():
    """The scene's pixels the game's texel (fpride.py TEXEL_X wide to 1 tall), asked as 1 wide to 1.25 tall."""
    import bpy
    import fpride
    sc = bpy.context.scene
    sc.render.pixel_aspect_x, sc.render.pixel_aspect_y = 1.0, 1.0 / fpride.TEXEL_X


def install():
    """Build and pose from the bake with a mouth from here on, in this process (horse.py `use_bake`): its mouth's
    path, as `_cut` answers it."""
    if not _close:
        _close.append(_cut(horse.bake()))
    horse.use_bake(_close[0][0])
    return _close[0][1]


def _piece(name, positions, triangles, bones, material, attributes=(), smooth=True):
    """A piece riding `bones` ({bone: weight}) as the tack does (horse.py `posed`), in `material`, with point
    attributes ((name, type, values)): (object, piece)."""
    import bpy
    b = horse.bake()
    names = [x['name'] for x in b['bones']]
    n = len(positions)
    joints, weights = np.zeros((n, 4), np.int64), np.zeros((n, 4))
    for k, (bone, w) in enumerate(bones.items()):
        joints[:, k], weights[:, k] = names.index(bone), w
    me = bpy.data.meshes.new(name)
    me.from_pydata([(0.0, 0.0, 0.0)] * n, [], [tuple(int(i) for i in t) for t in triangles])
    for attr, kind, values in attributes:
        me.attributes.new(attr, kind, 'POINT').data.foreach_set(
            'color' if kind == 'FLOAT_COLOR' else 'vector', np.asarray(values, np.float32).ravel())
    for poly in me.polygons:
        poly.use_smooth = smooth
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, {'name': name, 'positions': np.asarray(positions, np.float64), 'joints': joints, 'weights': weights}


def _grid(rows, cols):
    """The triangles of a grid of `rows` by `cols` points, row by row."""
    out = []
    for r in range(rows - 1):
        for c in range(cols - 1):
            a = r * cols + c
            out += [(a, a + 1, a + cols + 1), (a, a + cols + 1, a + cols)]
    return np.array(out)


def _rings(rings, k):
    """The triangles between `rings` closed rings of `k` points each, ring by ring."""
    out = []
    for r in range(rings - 1):
        for c in range(k):
            a, b = r * k + c, r * k + (c + 1) % k
            out += [(a, b, b + k), (a, b + k, a + k)]
    return np.array(out)


def reach_share(r):
    """Each rest point's share of the upper lip's reach: the front of the muzzle above the lip line."""
    return _smooth((r[:, 1] - REACH_FROM) / REACH_EASE) * _smooth((REACH_TOP - r[:, 2]) / REACH_EASE) * \
        (r[:, 2] > lip_z(r[:, 1]) - SPLIT / 2)


def lip_shares(r):
    """Each rest point's share of the upper lip's curl and of the lower lip's droop at the bite: the front of the mouth,
    near the line, the upper lip above it and the lower below."""
    f = LIP_FALL
    ahead = _smooth((r[:, 1] - f['from']) / f['ease'])
    off = r[:, 2] - lip_z(r[:, 1])
    near = _smooth(1.0 - np.abs(off) / f['near'])
    upper = off > -SPLIT / 2
    return ahead * near * upper, ahead * near * ~upper


def lip_moves(r, lip, gape):
    """The rest points `r` moved by the upper lip's reach (`lip`) and the bite's curl and droop (`gape`)."""
    curl, droop = lip_shares(r)
    return r + reach_share(r)[:, None] * np.array(REACH) * lip + \
        (curl[:, None] * np.array(CURL) + droop[:, None] * np.array(DROOP)) * gape


def _material(name, rgb=None, rough=0.5, spec=0.5, coat=0.0, attribute=None, ior=None):
    """A material of one colour, or of a point attribute's colour (`attribute`). `ior` 1: no gloss at all, even at a
    grazing look (dry skin and hair, where the sky would sheen it grey)."""
    import bpy
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    if attribute:
        at = m.node_tree.nodes.new('ShaderNodeAttribute')
        at.attribute_name = attribute
        m.node_tree.links.new(at.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (*rgb, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Specular IOR Level'].default_value = spec
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = 0.03
    if ior:
        bsdf.inputs['IOR'].default_value = ior
    return m


def _mouth_material():
    """The mouth's inside: its colour by its row, the front's (`MOUTH_ROWS`) and the cheek's behind (`MOUTH_BACK`),
    from its `mouth` attribute (row, front), glowing a little of it (`MOUTH_GLOW`)."""
    import bpy
    m = bpy.data.materials.new('touch_mouth')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 'mouth'
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(at.outputs['Vector'], xyz.inputs[0])
    def ramp_of(rows, how):   # a colour by the row, stop to stop
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.interpolation = how
        stops = ramp.color_ramp.elements
        while len(stops) < len(rows):
            stops.new(0.5)
        for stop, (at_, rgb) in zip(stops, rows):
            stop.position, stop.color = at_, (*rgb, 1.0)
        nt.links.new(xyz.outputs['X'], ramp.inputs['Fac'])
        return ramp
    ramp, back = ramp_of(MOUTH_ROWS, 'LINEAR'), ramp_of(MOUTH_BACK, 'LINEAR')
    front = nt.nodes.new('ShaderNodeMath')
    front.operation = 'GREATER_THAN'
    front.inputs[1].default_value = 0.5
    nt.links.new(xyz.outputs['Y'], front.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(back.outputs['Color'], mix.inputs['A'])
    nt.links.new(front.outputs[0], mix.inputs['Factor'])
    nt.links.new(ramp.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    nt.links.new(mix.outputs['Result'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = MOUTH_GLOW
    bsdf.inputs['Roughness'].default_value = 0.35
    bsdf.inputs['Specular IOR Level'].default_value = 0.4
    return m


def _frame(side):
    """The eye's frame on `side` (1 the right, -1 the left): (middle on the hide, way out, long way, way up)."""
    flip = np.array([side, 1.0, 1.0])
    at, out = np.array(EYE['at']) * flip, np.array(EYE['out']) * flip
    out /= np.linalg.norm(out)
    along = np.array(EYE['long']) * flip
    along -= out * (along @ out)
    along /= np.linalg.norm(along)
    up = np.cross(out, along)
    return at, out, along, up if up[2] > 0 else -up


def _shell(side, scale, u, v):
    """Points on the eyeball's ellipsoid grown `scale` times, at `u` along it and `v` up it (shares of its half
    length and height), on its outer half."""
    at, out, along, up = _frame(side)
    ra, rb, rn = EYE['ball']
    middle = at - out * EYE['sunk']
    w = np.sqrt(np.clip(1.0 - u * u - v * v, 0.0, None))
    return middle + scale * (along * ra * u[..., None] + up * rb * v[..., None] + out * rn * w[..., None])


def _lid_edge(u, lid):
    """The upper lid's edge (a share of the eyeball's height) at `u`: open at `LID_OPEN`-ish, down to the lower lid's
    edge shut."""
    arc = np.sqrt(np.clip(1.0 - u * u, 0.0, None))
    return EYE['open'] * arc * (1 - lid) - EYE['low'] * arc * lid


class Head:
    """A Courser built from `install`'s bake, dressed with its mouth's inside, its eyes, lids and lashes."""

    U = np.linspace(-1.08, 1.08, 23)   # the lids' columns, along the eye

    def __init__(self, courser):
        path, outward = install()
        self.courser = courser
        self.mesh = courser.parts['body'][1]
        self.rest = np.array(self.mesh['positions'], dtype=np.float64).reshape(-1, 3).copy()
        self.pieces = []
        self._mouth(path, outward)
        for side in (1, -1):
            self._eye(side)
            self._nostril(side)
        body, mesh, place = courser.parts['body']
        inner = (np.asarray(place[1]) >= mesh['inner_from']).astype(np.float32)
        body.data.attributes.new('inner', 'FLOAT', 'POINT').data.foreach_set('value', inner)
        self._muzzle(body.data.materials[0])
        for ob, pc in self.pieces:
            courser.tack.append((ob, pc))
            courser.objects.append(ob)
        self.pose_lids(LID_OPEN)

    def _add(self, *args, **kw):
        ob, pc = _piece(*args, **kw)
        self.pieces.append((ob, pc))
        return pc

    def _mouth(self, path, outward):
        """The mouth's inside: rows inset behind the lip line from the left corner round to the right, the head's above
        and the jaw's below, overlapping where the lips meet."""
        m = MOUTH
        line = self.rest[path]
        k = m['dense']
        s = np.linspace(0, len(line) - 1, (len(line) - 1) * k + 1)
        at = np.array([np.interp(s, np.arange(len(line)), line[:, d]) for d in range(3)]).T
        way = np.array([np.interp(s, np.arange(len(line)), outward[:, d]) for d in range(3)]).T
        way /= np.linalg.norm(way, axis=1, keepdims=True)
        inner = at - way * m['inset']
        up = np.array([0.0, 0.0, 1.0])
        along = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(at, axis=0), axis=1))])
        middle = along[np.argmax(at[:, 1])]
        front = (np.abs(along - middle) < m['front']).astype(np.float64)
        rows = ((m['reach'], 0.0, 'Head'), (0.0, 0.17, 'Head'), (-m['lap'], 0.36, 'Head'),
                (m['lap'], 0.64, 'Jaw'), (-SPLIT, 0.83, 'Jaw'), (-m['reach'], 1.0, 'Jaw'))
        n = len(inner)
        for half, picked, deep in (('head', rows[:3], 0.0), ('jaw', rows[3:], m['deeper'])):
            pts = np.concatenate([inner - way * deep + up * dz for dz, _, _ in picked])
            mouth = np.concatenate([np.stack([np.full(n, row), front, np.zeros(n)], axis=1) for _, row, _ in picked])
            self._add(f'touch_mouth_{half}', pts, _grid(len(picked), n), {picked[0][2]: 1.0}, _mouth_material(),
                      attributes=(('mouth', 'FLOAT_VECTOR', mouth),))
        # the stretch between them, the head's lowest row to the jaw's highest
        pts = np.concatenate([inner + up * rows[2][0], inner - way * m['deeper'] + up * rows[3][0]])
        mouth = np.concatenate([np.stack([np.full(n, row), front, np.zeros(n)], axis=1) for row in (0.36, 0.64)])
        ob, pc = _piece('touch_mouth_gap', pts, _grid(2, n), {'Head': 1.0}, _mouth_material(),
                        attributes=(('mouth', 'FLOAT_VECTOR', mouth),))
        b = horse.bake()
        jaw = [x['name'] for x in b['bones']].index('Jaw')
        pc['joints'][n:, 0] = jaw   # its lower row the jaw's
        self.pieces.append((ob, pc))
        self.mouth_at = (inner, front)
        self._teeth(at, way, along, middle)
        self._tongue()

    def _teeth(self, at, way, along, middle):
        """The incisors: a curved row along the front of the mouth behind the lips, the upper the head's and the lower
        the jaw's, their edges meeting at the line, leaning a little forward."""
        te = TEETH
        w, h = te['span'], te['size']
        enamel = _material('touch_teeth', te['rgb'], rough=0.3, spec=0.5)
        bsdf = enamel.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Emission Color'].default_value, bsdf.inputs['Emission Strength'].default_value = \
            (*te['rgb'], 1.0), MOUTH_GLOW
        s_ = np.linspace(middle - w, middle + w, 15)
        c = np.array([np.interp(s_, along, at[:, j]) for j in range(3)]).T
        o = np.array([np.interp(s_, along, way[:, j]) for j in range(3)]).T * np.array([1.0, 1.0, 0.0])
        o /= np.linalg.norm(o, axis=1, keepdims=True)
        base = c - o * te['inset']
        lean = math.tan(math.radians(te['lean']))
        for name, side, bone in (('upper', 1.0, 'Head'), ('lower', -1.0, 'Jaw')):
            rows = [base + np.array([0.0, 0.0, side * (z - 0.0008)]) - o * lean * z for z in np.linspace(0.0, h, 4)]
            self._add(f'touch_teeth_{name}', np.concatenate(rows), _grid(4, len(s_)), {bone: 1.0}, enamel)

    def _tongue(self):
        """The tongue on the jaw's floor behind the lower incisors."""
        to = TONGUE
        t = np.linspace(-math.pi / 2, math.pi / 2, 9)
        lon = np.linspace(0.0, 2 * math.pi, 17)
        T_, L_ = np.meshgrid(t, lon, indexing='ij')
        a, b, c = to['size']
        pts = np.stack([a * np.cos(T_) * np.cos(L_), b * np.sin(T_), c * np.cos(T_) * np.sin(L_)], axis=-1)
        m = _material('touch_tongue', to['rgb'], rough=0.35, spec=0.5)
        m.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (*to['rgb'], 1.0)
        m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = MOUTH_GLOW
        self._add('touch_tongue', pts.reshape(-1, 3) + np.array(to['at']), _grid(len(t), len(lon)), {'Jaw': 1.0}, m)

    def _eye(self, side):
        """An eye: its eyeball, its lower lid, its upper lid and its lashes (those two laid by `pose_lids`)."""
        at, out, along, up = _frame(side)
        ra, rb, rn = EYE['ball']
        middle = at - out * EYE['sunk']
        t = np.linspace(-math.pi / 2, math.pi / 2, 33)
        lon = np.linspace(0.0, 2 * math.pi, 49)
        T_, L_ = np.meshgrid(t, lon, indexing='ij')
        u, v, w = np.sin(T_), np.cos(T_) * np.cos(L_), np.cos(T_) * np.sin(L_)
        pts = middle + along * ra * u[..., None] + up * rb * v[..., None] + out * rn * w[..., None]
        pupil = (np.abs(u) < PUPIL[0]) & (np.abs(v) < PUPIL[1]) & (w > 0)
        ring = np.hypot(u / 0.9, v / 0.9) > 0.8
        rgb = np.where(pupil[..., None], EYE_RGB['pupil'], np.where(ring[..., None], EYE_RGB['ring'], EYE_RGB['iris']))
        rgb = np.where(((u > 0.82) & (w > 0))[..., None], EYE_RGB['corner'], rgb)
        tint = np.concatenate([rgb.reshape(-1, 3), np.ones((u.size, 1))], axis=1)
        self._add(f'touch_eyeball_{side}', pts.reshape(-1, 3), _grid(len(t), len(lon)), {'Head': 1.0},
                  _material(f'touch_eyeball_{side}', rough=0.15, spec=0.45, coat=0.35, attribute='tint'),
                  attributes=(('tint', 'FLOAT_COLOR', tint),))
        lid = _material(f'touch_lid_{side}', rough=0.9, spec=0.05, attribute='tint', ior=1.0)
        edge = -EYE['low'] * np.sqrt(np.clip(1 - self.U ** 2, 0, None))
        share = np.linspace(0, 1, 8)[:, None]
        low = -1.15 * (1 - share) + edge * share
        U = np.broadcast_to(self.U, low.shape)
        cols = len(self.U)

        def skin(margin_row):   # each row's colour: the lid's, its edge's row the margin's
            return np.concatenate([np.tile((*EYE_RGB['margin' if r == margin_row else 'lid'], 1.0), (cols, 1))
                                   for r in range(8)])
        self._add(f'touch_lidlow_{side}', _shell(side, EYE['lid'], U, low).reshape(-1, 3), _grid(*low.shape),
                  {'Head': 1.0}, lid, attributes=(('tint', 'FLOAT_COLOR', skin(7)),))
        self._add(f'touch_lidup_{side}', np.zeros((8 * cols, 3)), _grid(8, cols), {'Head': 1.0}, lid,
                  attributes=(('tint', 'FLOAT_COLOR', skin(0)),))
        n = EYE['lashes']
        self._add(f'touch_lashes_{side}', np.zeros((n * 4 * 2, 3)), self._lash_tris(n), {'Head': 1.0},
                  _material(f'touch_lash_{side}', EYE_RGB['lash'], rough=1.0, spec=0.0, ior=1.0))

    def _muzzle(self, m):
        """The coat's material darkened to the muzzle's skin over the muzzle (`MUZZLE`), by each point's rest place, and
        the lips' insides their own (`INNER_LIP`)."""
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        link = bsdf.inputs['Base Color'].links[0]
        coat = link.from_socket
        nt.links.remove(link)
        rest = nt.nodes.new('ShaderNodeAttribute')
        rest.attribute_name = 'rest'
        xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(rest.outputs['Vector'], xyz.inputs[0])

        def ramp(socket, lo, hi):   # 0 at lo, 1 at hi, smooth between
            r = nt.nodes.new('ShaderNodeMapRange')
            r.interpolation_type = 'SMOOTHSTEP'
            r.inputs['From Min'].default_value, r.inputs['From Max'].default_value = lo, hi
            nt.links.new(socket, r.inputs['Value'])
            return r.outputs['Result']
        mu = MUZZLE
        both = nt.nodes.new('ShaderNodeMath')
        both.operation = 'MULTIPLY'
        nt.links.new(ramp(xyz.outputs['Y'], mu['from'], mu['from'] + mu['ease']), both.inputs[0])
        nt.links.new(ramp(xyz.outputs['Z'], mu['top'], mu['top'] - mu['ease']), both.inputs[1])
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        nt.links.new(both.outputs[0], mix.inputs['Factor'])
        nt.links.new(coat, mix.inputs['A'])
        mix.inputs['B'].default_value = (*mu['rgb'], 1.0)
        inner = nt.nodes.new('ShaderNodeAttribute')
        inner.attribute_name = 'inner'
        lips = nt.nodes.new('ShaderNodeMix')
        lips.data_type = 'RGBA'
        nt.links.new(inner.outputs['Fac'], lips.inputs['Factor'])
        nt.links.new(mix.outputs['Result'], lips.inputs['A'])
        lips.inputs['B'].default_value = (*INNER_LIP, 1.0)
        nt.links.new(lips.outputs['Result'], bsdf.inputs['Base Color'])

    def _nostril(self, side):
        """A nostril laid on the muzzle's hide: a bean, dark at its rim and darker in its hole, a little off the hide.
        Its rings are cast onto the rest mesh, so it lies on the hide where it is."""
        no = NOSTRIL
        flip = np.array([side, 1.0, 1.0])
        out = np.array(no['out']) * flip
        out /= np.linalg.norm(out)
        b = horse.bake()
        mesh = next(m for m in b['meshes'] if m['part'] == 'body')
        tris = np.array(mesh['indices'], dtype=np.int64).reshape(-1, 3)
        at = cast(self.rest, tris, np.array(no['at']) * flip + out * 0.08, -out)
        if at is None:
            raise ValueError('the nostril misses the muzzle')
        centre, normal = at
        normal = normal if normal @ out > 0 else -normal
        along = np.array(no['long']) * flip
        along -= normal * (along @ normal)
        along /= np.linalg.norm(along)
        across = np.cross(normal, along)
        if across @ (np.array([-side, 0.0, 0.0])) < 0:   # across toward the middle
            across = -across
        self.nostril_frames = getattr(self, 'nostril_frames', {})
        self.nostril_frames[side] = (centre, normal, along, across, tris)
        rings, k = (1.0, 0.8, 0.5, 0.0), 24
        tint = np.concatenate([np.tile((*(no['rim'] if r == 1.0 else no['hole']), 1.0), (k, 1)) for r in rings])
        self._add(f'touch_nostril_{side}', np.zeros((len(rings) * k, 3)), _rings(len(rings), k), {'Head': 1.0},
                  _material(f'touch_nostril_{side}', rough=0.7, spec=0.1, attribute='tint', ior=1.0),
                  attributes=(('tint', 'FLOAT_COLOR', tint),))
        self.pose_nostril(side, 0.0)

    def pose_nostril(self, side, flare, lip=0.0):
        """The nostril on `side` at `flare` (0 at rest, 1 sniffing), carried with the hide by the upper lip's reach."""
        no = NOSTRIL
        centre, normal, along, across, tris = self.nostril_frames[side]
        a, w = no['size'][0], no['size'][1] * (1.0 + no['flare'] * flare)
        t = np.linspace(0.0, 2 * math.pi, 24, endpoint=False)
        pts = []
        for r in (1.0, 0.8, 0.5, 0.0):
            for tt in t:
                s_, c_ = math.sin(tt), math.cos(tt)
                curl = no['curl'] * a * max(s_, 0.0) ** 2   # its top curling in toward the middle
                p = centre + along * a * r * s_ + across * (w * r * c_ + curl * r)
                hit = cast(self.rest, tris, p + normal * 0.03, -normal)
                pts.append((hit[0] if hit is not None else p) + normal * 0.0015)
        pts = np.array(pts)
        pc = next(pc for ob, pc in self.pieces if pc['name'] == f'touch_nostril_{side}')
        pc['positions'] = lip_moves(pts, lip, 0.0)

    @staticmethod
    def _lash_tris(n):
        out = []
        for k in range(n):
            a = k * 8   # four pairs along a lash, root to tip
            for s in range(3):
                p = a + s * 2
                out += [(p, p + 1, p + 3), (p, p + 3, p + 2)]
        return np.array(out)

    def pose_lids(self, lid):
        """The upper lids and their lashes at `lid` (0 open, 1 shut)."""
        rng = np.random.default_rng(11)
        for side in (1, -1):
            pc = next(pc for ob, pc in self.pieces if pc['name'] == f'touch_lidup_{side}')
            edge = _lid_edge(self.U, lid)
            share = np.linspace(0, 1, 8)[:, None]
            V = edge * (1 - share) + 1.15 * share
            U = np.broadcast_to(self.U, V.shape)
            pc['positions'] = _shell(side, EYE['lid'], U, V).reshape(-1, 3)
            at, out, along, up = _frame(side)
            lashes = next(pc for ob, pc in self.pieces if pc['name'] == f'touch_lashes_{side}')
            n = EYE['lashes']
            us = np.linspace(-0.1, 0.8, n)   # the lashes from the eye's middle toward its front corner
            root = _shell(side, EYE['lid'], us, _lid_edge(us, lid))
            length, width = EYE['lash']
            pts = []
            for k in range(n):
                size = length * rng.uniform(0.75, 1.15) * (1.0 - 0.35 * abs(us[k] - 0.3))
                way = out * 0.9 + up * (0.25 - 0.3 * lid) + along * 0.3
                way /= np.linalg.norm(way)
                p = root[k]
                for s in range(4):
                    f = s / 3
                    c = p + way * size * f - up * size * 0.3 * f * f   # out from the lid, curling down to its tip
                    half = along * width * (1 - 0.8 * f) / 2
                    pts += [c - half, c + half]
            lashes['positions'] = np.array(pts)

    def pose(self, shot, extra):
        """The Courser posed in the touch's idle with `extra` (fptouch.py `turns`), its lids, its nostrils and its lips
        as the shot holds them (`lid`, `sniff`, `lip` and `gape`)."""
        import fptouch
        self.pose_lids(shot.get('lid', LID_OPEN))
        lip, gape = shot.get('lip', 0.0), shot.get('gape', 0.0)
        for side in (1, -1):
            self.pose_nostril(side, shot.get('sniff', 0.0), lip)
        self.mesh['positions'] = lip_moves(self.rest, lip, gape)
        try:
            self.courser.pose('idle', fptouch.IDLE_TIME, 180.0, extra, None)
        finally:
            self.mesh['positions'] = self.rest
