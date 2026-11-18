"""The forge's naked body under the armour: a man's, or a woman's (`use`). Torso, arms and legs are smooth lofts of measured cross-sections
with the muscles laid on as swells (body.py `vloft`); the head, hands and feet are blended blobs. Armour is grown
over this body (model.py), never instead of it, so one body wears any outfit.

Bearings are degrees round from +X: on the body's left side 0 is outward, 90 is the back, 180 inward, 270 the front;
on the right side outward is 180. Heights are metres from the ground, the arm's after the rig's stretch (arm_z).
Both bodies stand on the one skeleton (rig.py), so every key, grip and fitted adjustment fits either: Daggerfall's
women fighters are as tall as its men. They differ in the flesh: the woman's waist is narrower and her hips wider,
she has a bust for pectorals, slimmer limbs with softer muscles, and a finer face."""
import math

import numpy as np
from mathutils import Matrix, Vector

from body import Skinned, blob, blob_mesh, bone, chain_centre, coords, ramp, vloft
from rig import arm_z, rest

# Daggerfall's bare-chested archer's (TEXTURE.482): a deep chest over a belly drawn in under it, broad at the lats
# and narrow at the waist. The shoulders slope a little from the neck and the trapezius is low, so the shoulders are
# not a yoke that makes the man look squat.
TORSO = [
    (0.82, 0.09, 0.048, 0.04), (0.86, 0.142, 0.074, 0.08), (0.92, 0.172, 0.09, 0.104), (0.99, 0.168, 0.094, 0.097),
    (1.06, 0.146, 0.09, 0.09), (1.14, 0.15, 0.094, 0.088), (1.22, 0.172, 0.112, 0.098), (1.30, 0.196, 0.13, 0.108),
    (1.38, 0.212, 0.128, 0.11), (1.42, 0.216, 0.112, 0.104), (1.455, 0.182, 0.084, 0.093), (1.49, 0.134, 0.068, 0.078),
    (1.525, 0.081, 0.062, 0.07), (1.56, 0.064, 0.056, 0.06), (1.62, 0.058, 0.052, 0.054),
]
TORSO_LEAN = ([1.40, 1.62], [0.0, -0.035])   # the neck's centre comes forward of the chest's
TORSO_MUSCLES = [
    (303, 30, 1.44, 1.27, 0.034), (237, 30, 1.44, 1.27, 0.034),                                   # pectorals
    (333, 14, 1.44, 1.36, 0.010), (207, 14, 1.44, 1.36, 0.010),                                   # their insertions
    (300, 24, 1.475, 1.445, 0.004), (240, 24, 1.475, 1.445, 0.004),                               # collarbones
    (283, 8, 1.255, 1.18, 0.011), (257, 8, 1.255, 1.18, 0.011), (283, 8, 1.19, 1.115, 0.011),     # the abdomen's
    (257, 8, 1.19, 1.115, 0.011), (283, 8, 1.125, 1.045, 0.011), (257, 8, 1.125, 1.045, 0.011),     # six blocks
    (270, 26, 1.07, 0.93, 0.005),                                                                 # the low belly
    (302, 24, 1.01, 0.84, 0.013), (238, 24, 1.01, 0.84, 0.013),                                   # over the hips' joints
    (333, 22, 1.17, 0.99, 0.014), (207, 22, 1.17, 0.99, 0.014),                                   # obliques
    (322, 10, 1.33, 1.22, 0.01), (218, 10, 1.33, 1.22, 0.01),                                     # serratus
    (35, 28, 1.40, 1.16, 0.03), (145, 28, 1.40, 1.16, 0.03),                                      # lats
    (90, 60, 1.56, 1.42, 0.0115), (90, 22, 1.45, 1.16, 0.005),                                     # trapezius
    (58, 18, 1.45, 1.27, 0.007), (122, 18, 1.45, 1.27, 0.007),                                    # shoulder blades
    (80, 11, 1.26, 0.98, 0.007), (100, 11, 1.26, 0.98, 0.007),                                    # spinal erectors
    (60, 27, 1.0, 0.81, 0.03), (120, 27, 1.0, 0.81, 0.03), (90, 5, 0.97, 0.82, -0.01),           # glutes, cleft
    (285, 9, 1.60, 1.49, 0.006), (255, 9, 1.60, 1.49, 0.006),                                     # the neck's cords
]
ARM_DESIGN = [
    (1.485, 0.011, 0.011, 0.011), (1.475, 0.034, 0.034, 0.034), (1.458, 0.048, 0.047, 0.047), (1.435, 0.052, 0.05, 0.05),
    (1.40, 0.049, 0.048, 0.048), (1.34, 0.046, 0.046, 0.046), (1.28, 0.042, 0.042, 0.042), (1.205, 0.037, 0.035, 0.04),
    (1.17, 0.043, 0.04, 0.04), (1.12, 0.042, 0.038, 0.038), (1.05, 0.035, 0.031, 0.031), (0.985, 0.029, 0.024, 0.025),
    (0.962, 0.028, 0.023, 0.024),
]
ARM = [(arm_z(z), a, f, b) for z, a, f, b in ARM_DESIGN]
LEG = [
    (1.00, 0.03, 0.03, 0.03), (0.98, 0.05, 0.044, 0.058), (0.94, 0.074, 0.062, 0.086), (0.90, 0.088, 0.08, 0.092),
    (0.80, 0.085, 0.085, 0.085), (0.70, 0.075, 0.075, 0.074),
    (0.62, 0.064, 0.064, 0.064), (0.56, 0.058, 0.062, 0.058), (0.50, 0.056, 0.055, 0.064), (0.42, 0.056, 0.05, 0.068),
    (0.34, 0.05, 0.045, 0.058), (0.24, 0.042, 0.04, 0.045), (0.14, 0.035, 0.035, 0.038), (0.09, 0.034, 0.036, 0.036), (0.05, 0.03, 0.03, 0.03),
]


SWELL = {'arm': 1.0, 'leg': 1.0, 'deltoid': 1.0}   # how high the limbs' muscles rise: the body's (`use`)
SHARP = {'torso': 2.0, 'arm': 2.0, 'leg': 2.0}   # how blocky each part's muscles are (body.py `vloft`): the body's
PAINT_NOW = []   # the skin's painted lines (materials.py `paint`): the body's (`use`)
EARS = [True]   # a man's ears on the skull; a beast's head has its own (beastfolk.py)


def arm_muscles(x):
    out, inward = (0.0, 180.0) if x > 0 else (180.0, 0.0)
    turn = 1 if x > 0 else -1
    k, d = SWELL['arm'], SWELL['deltoid']   # the deltoid its own: it rounds the shoulder over the arm's root
    return [(b, w, top, bottom, h, SHARP['arm']) for b, w, top, bottom, h in [
        (out, 60, arm_z(1.47), arm_z(1.32), 0.014 * d),                   # the deltoid's cap
        (270 + 25 * turn, 30, arm_z(1.47), arm_z(1.36), 0.008 * d),       # its front head
        (90 - 25 * turn, 30, arm_z(1.47), arm_z(1.36), 0.007 * d),        # its rear head
        (270, 34, arm_z(1.38), arm_z(1.235), 0.014 * k),                  # biceps
        (90 - 30 * turn, 45, arm_z(1.42), arm_z(1.24), 0.012 * k),        # triceps, back and a little outward
        (90, 25, arm_z(1.235), arm_z(1.185), 0.005 * k),                  # the elbow's point
        (270 + 40 * turn, 35, arm_z(1.20), arm_z(1.07), 0.010 * k),       # brachioradialis
        (inward, 35, arm_z(1.19), arm_z(1.06), 0.008 * k),                # the forearm's flexors
        (90 + 20 * turn, 30, arm_z(1.19), arm_z(1.08), 0.006 * k),        # its extensors
    ]]


def leg_muscles(x):
    out, inward = (0.0, 180.0) if x > 0 else (180.0, 0.0)
    fo, fi = (315.0, 225.0) if x > 0 else (225.0, 315.0)   # front-outward, front-inward
    side = 1 if x > 0 else -1   # a bearing past the back (90) turns inward by this sign
    k = SWELL['leg']
    return [(b, w, top, bottom, h * k, SHARP['leg']) for b, w, top, bottom, h in [
        (fo, 35, 0.90, 0.62, 0.015),       # vastus lateralis
        (fi, 25, 0.72, 0.57, 0.016),       # vastus medialis, the teardrop over the knee
        (270, 22, 0.95, 0.64, 0.013),      # rectus femoris, bowing the thigh's front
        (inward, 35, 0.96, 0.74, 0.012),   # adductors
        (90, 45, 0.92, 0.62, 0.012),       # hamstrings
        (270, 16, 0.59, 0.53, 0.006),      # kneecap
        (90 - 20 * side, 20, 0.52, 0.33, 0.017), (90 + 22 * side, 22, 0.51, 0.27, 0.022),   # the calf, its inner
        # head the lower
        (fo, 16, 0.50, 0.22, 0.006),       # tibialis
        (out, 14, 0.13, 0.07, 0.006), (inward, 14, 0.13, 0.07, 0.006),   # the ankle's bones
    ]]


# the toes, the big toe first: across the foot (outward +), where each starts and ends forward, its radius
TOES = [(0.089, -0.128, -0.193, 0.0135), (0.104, -0.134, -0.185, 0.0094), (0.116, -0.128, -0.174, 0.009),
        (0.127, -0.12, -0.16, 0.0084), (0.137, -0.11, -0.144, 0.0078)]


def foot(x):
    """A bare foot's blobs: the heel, the instep falling from the ankle to the ball, the outer edge flat on the
    ground, and five toes off the ball."""
    s = 1.0 if x > 0 else -1.0
    parts = [blob((0.11 * s, 0.034, 0.033), (0.028, 0.032, 0.033))]                 # heel
    for k in range(10):
        t = k / 9
        parts.append(blob(((0.109 + 0.003 * t) * s, 0.012 - 0.122 * t, 0.042 - 0.024 * t),
                          (0.03 + 0.012 * t, 0.02, 0.036 - 0.018 * t), stiffness=1.6))
    parts.append(blob((0.128 * s, -0.05, 0.014), (0.016, 0.06, 0.014)))             # the outer edge
    for i, (tx, y0, y1, r) in enumerate(TOES):
        parts.append(bone((tx * s, y0, 0.019 - 0.0012 * i), ((tx - 0.0015 * (2 - i)) * s, y1, 0.012 - 0.0005 * i),
                          r, 0.45, 0.05, 0.9))
    return parts


def torso_centre(z):
    return 0.0, float(np.interp(z, *TORSO_LEAN))


SEAT_RIDE = 0.45   # the share of the thigh's turn the seat's foot takes


def torso_weights(p):
    z, ax = p[:, 2], np.abs(p[:, 0])
    neck = ramp(z, 1.47, 1.53) * (1 - ramp(ax, 0.06, 0.11))
    chest = np.clip(ramp(z, 1.20, 1.30) - neck, 0, 1)
    spine = np.clip(ramp(z, 1.0, 1.08) - ramp(z, 1.20, 1.30), 0, 1)
    # the seat's foot rides a little with the thigh under it: on the pelvis alone, a thigh swung forward bares the
    # seat's underside, a flat shelf under it, where a body's fold is drawn down over the leg
    seat = SEAT_RIDE * ramp(p[:, 1], 0.04, 0.12) * (1 - ramp(z, 0.84, 0.95))
    thigh_l, thigh_r = seat * ramp(p[:, 0], -0.02, 0.04), seat * ramp(-p[:, 0], -0.02, 0.04)
    pelvis = 1 - ramp(z, 1.0, 1.08) - thigh_l - thigh_r
    # the shoulder's top past the neck rides the collarbone, as the trapezius and the shoulder blade's spine do
    top = CLAV_TORSO * ramp(ax, 0.10, 0.19) * ramp(z, 1.34, 1.43)
    clav_l, clav_r = top * (p[:, 0] > 0), top * (p[:, 0] < 0)
    chest = chest * (1 - top)
    return np.stack([pelvis, spine, chest, neck, thigh_l, thigh_r, clav_l, clav_r], axis=1)


def arm_weights(p):
    z = p[:, 2]
    clav = 0.6 * ramp(z, arm_z(1.40), 1.48)
    farm = 1 - ramp(z, arm_z(1.17), arm_z(1.23))
    uarm = np.clip(1 - clav - farm, 0, 1)
    return np.stack([clav, uarm, farm], axis=1)


def leg_weights(p):
    z = p[:, 2]
    pelvis = 0.5 * ramp(z, 0.88, 0.98)
    foot = 0.5 * (1 - ramp(z, 0.07, 0.12))
    shin = np.clip(1 - ramp(z, 0.50, 0.60) - foot, 0, 1)
    thigh = np.clip(1 - pelvis - shin - foot, 0, 1)
    return np.stack([pelvis, thigh, shin, foot], axis=1)


def limb_axis(x):
    return lambda p: np.stack([np.full(len(p), x), np.zeros(len(p)), np.zeros(len(p))], axis=1)


# the fused body's joints, and the pieces it is fused from (shape.py shapes each piece by its name)
JOINTS = ['pelvis', 'spine', 'chest', 'neck', 'head'] + [f'{j}_{s}' for s in 'LR'
                                                        for j in ('clav', 'uarm', 'farm', 'thigh', 'shin', 'foot')]
PIECES = ['torso', 'arm_L', 'arm_R', 'leg_L', 'leg_R', 'skull', 'barefoot_L', 'barefoot_R']
VOXEL = 0.006    # the remesh's cell: under half a pixel at the sprites' scale
DECIMATE = 0.3   # the share of the remesh's faces kept: where the surface is flat they are many more than it needs
FILLET = 0.035   # how far from where two pieces meet the crease is rounded
EASE = 6   # the voxels' last easing, in rounds: enough to lose their steps, few enough to keep a muscle's crease
# Each arm is spread SPREAD degrees from the side while the pieces are fused, then turned back down by its own
# weights: fused hanging, the arm sinks into the torso's side and the armpit fills solid, so a raised arm drags a
# sheet of torso after it. The shoulder's weights are eased over SEAM_EASE rounds where the torso meets the arm.
SPREAD = 35.0
SEAM_EASE = 40
CLAV_TORSO = 0.6   # the share of the collarbone in the torso's skin over the shoulder


def _weights(joints, w):
    """Weights over `joints` laid into the body's JOINTS."""
    out = np.zeros((len(w), len(JOINTS)))
    for k, j in enumerate(joints):
        out[:, JOINTS.index(j)] = w[:, k]
    return out


def _pieces(M):
    """Each piece: (name, mesh in rest space, weights of points over JOINTS, axis of points or None)."""
    muscles = [m if len(m) > 5 else (*m, SHARP['torso']) for m in TORSO_MUSCLES]
    out = [('torso', vloft('torso', TORSO, torso_centre, n=48, muscles=muscles),
            lambda p: _weights(['pelvis', 'spine', 'chest', 'neck', 'thigh_L', 'thigh_R', 'clav_L', 'clav_R'],
                               torso_weights(p)), None)]
    for s, x in (('L', 1.0), ('R', -1.0)):
        pts = [rest(f'uarm_{s}') + Vector((-0.03 * x, 0, 0.06)), rest(f'uarm_{s}'), rest(f'farm_{s}'), rest(f'hand_{s}')]
        out.append((f'arm_{s}', vloft(f'arm_{s}', ARM, chain_centre(pts), n=36, muscles=arm_muscles(x)),
                    lambda p, s=s: _weights([f'clav_{s}', f'uarm_{s}', f'farm_{s}'], arm_weights(p)), None))
        pts = [rest(f'thigh_{s}') + Vector((0, 0, 0.06)), rest(f'thigh_{s}'), rest(f'shin_{s}'), rest(f'foot_{s}')]
        out.append((f'leg_{s}', vloft(f'leg_{s}', LEG, chain_centre(pts), n=40, muscles=leg_muscles(x)),
                    lambda p, s=s: _weights(['pelvis', f'thigh_{s}', f'shin_{s}', f'foot_{s}'], leg_weights(p)),
                    limb_axis(0.105 * x)))
        out.append((f'barefoot_{s}', blob_mesh(f'barefoot_{s}', foot(x), res=0.0025),
                    lambda p, s=s: _weights([f'foot_{s}'], np.ones((len(p), 1))), None))
    ears = [blob((0.074 * x, -0.025, 1.645), (0.01, 0.018, 0.026)) for x in (1.0, -1.0)] if EARS[0] else []
    out.append(('skull', blob_mesh('skull', HEAD + ears, res=0.004),
                lambda p: _weights(['head'], np.ones((len(p), 1))), None))
    return out


def _mesh_arrays(me):
    co = coords(me)
    return co, [tuple(f.vertices) for f in me.polygons]


def _union(meshes):
    """One closed surface round every mesh's volume (a voxel remesh)."""
    import bpy
    co, faces, base = [], [], 0
    for me in meshes:
        c, f = _mesh_arrays(me)
        co.append(c)
        faces += [tuple(i + base for i in poly) for poly in f]
        base += len(c)
    src = bpy.data.meshes.new('body_src')
    src.from_pydata(np.concatenate(co).tolist(), [], faces)
    ob = bpy.data.objects.new('body_src', src)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new('remesh', 'REMESH')
    mod.mode, mod.voxel_size, mod.adaptivity = 'VOXEL', VOXEL, 0.0
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(src)
    return me


def _decimate(me, ratio):
    import bpy
    ob = bpy.data.objects.new('body_dec', me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new('decimate', 'DECIMATE')
    mod.ratio = ratio
    out = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    return out


def _bisect(me, heights):
    """Cut every face crossing each height, so a layer's edge there is a clean ring."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(me)
    for z in heights:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, z), plane_no=(0, 0, 1))
    bm.to_mesh(me)
    bm.free()
    return me


def _smooth(co, edges, w, iters, lam=0.5, mu=-0.53):
    """Taubin smoothing (a shrink and a swell a step), each vertex moved by its own share `w`."""
    n = len(co)
    i, j = edges[:, 0], edges[:, 1]
    deg = np.maximum(np.bincount(i, minlength=n) + np.bincount(j, minlength=n), 1)[:, None]
    for _ in range(iters):
        for f in (lam, mu) if mu else (lam,):
            s = np.stack([np.bincount(i, co[j, a], n) + np.bincount(j, co[i, a], n) for a in range(3)], 1)
            co = co + f * w[:, None] * (s / deg - co)
    return co


def _distances(co, meshes):
    """Each point's distance to each mesh's surface: (points, meshes)."""
    from mathutils.bvhtree import BVHTree
    out = np.zeros((len(co), len(meshes)))
    for k, me in enumerate(meshes):
        c, f = _mesh_arrays(me)
        tree = BVHTree.FromPolygons(c.tolist(), f)
        out[:, k] = [tree.find_nearest(p)[3] for p in co.tolist()]
    return out


def _spread(side, k=1.0):
    """The turn spreading arm `side` out from the side, `k` of SPREAD, about its shoulder."""
    j = rest(f'uarm_{side}')
    sign = 1.0 if side == 'L' else -1.0
    return Matrix.Translation(j) @ Matrix.Rotation(math.radians(-SPREAD * sign * k), 4, 'Y') @ Matrix.Translation(-j)


def _hang_arms(co, pieces, spread):
    """The fused body's points, fused with its arms spread, turned back down: each by its share of the arm it lies on
    (the upper arm's and the forearm's weights), the torso where it is the torso's."""
    d = _distances(co, spread)
    a = np.exp(-(d - d.min(axis=1, keepdims=True)) / 0.004)
    alpha = a / a.sum(axis=1, keepdims=True)
    out = co.copy()
    for s in 'LR':
        k = [n for n, _, _, _ in pieces].index(f'arm_{s}')
        back = np.array(_spread(s, -1.0))
        down = co @ back[:3, :3].T + back[:3, 3]
        w = arm_weights(down)
        share = alpha[:, k] * (w[:, 1] + w[:, 2])
        out += share[:, None] * (down - co)
    return out


def _ease_weights(w, edges, mask, rounds):
    """The weights eased over the mesh where `mask` holds: a seam a vertex wide becomes a blend some fingers wide."""
    n = len(w)
    i, j = edges[:, 0], edges[:, 1]
    deg = np.maximum(np.bincount(i, minlength=n) + np.bincount(j, minlength=n), 1)[:, None]
    m = mask[:, None].astype(float)
    for _ in range(rounds):
        s = np.stack([np.bincount(i, w[j, k], n) + np.bincount(j, w[i, k], n) for k in range(w.shape[1])], 1)
        w = w + 0.5 * m * (s / deg - w)
    return w / np.maximum(w.sum(axis=1, keepdims=True), 1e-9)


def build(M, hand_blobs, rigid, hang, cuts=()):
    """The naked body as one skinned mesh fused from its pieces, and its hands (open, or closed round a grip), rigid on
    the hand joints: (body Skinned, [(hand object, joint)], {side: {'open': ob, 'fist': ob}}). The mesh is cut along
    each of `cuts` (heights at rest), where a layer of armour will end. The body keeps each
    vertex's share of each piece (`alpha`, over PIECES), so the proportions and the armour's patterns follow the
    piece a vertex lies on, blended where pieces meet."""
    import bpy
    pieces = sorted(_pieces(M), key=lambda pc: PIECES.index(pc[0]))
    spread = []
    for name, m, _, _ in pieces:
        if name.startswith('arm_'):
            m = m.copy()
            m.transform(_spread(name[-1]))
        spread.append(m)
    me = _union(spread)
    co = coords(me)
    edges = np.array([e.vertices[:] for e in me.edges], dtype=np.int64)
    d = _distances(co, spread)
    two = np.sort(d, axis=1)[:, 1]
    # fill the creases where pieces meet (a plain Laplacian fills a concave crease), then ease the voxels everywhere
    co = _smooth(co, edges, 1 - ramp(two, 0.0, FILLET), 30, mu=0.0)
    co = _smooth(co, edges, np.full(len(co), 0.5), EASE)
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    me = _decimate(me, DECIMATE)
    me.vertices.foreach_set('co', _hang_arms(coords(me), pieces, spread).ravel())
    me.update()
    for m, piece in zip(spread, pieces):
        if m is not piece[1]:
            bpy.data.meshes.remove(m)
    me = _bisect(me, cuts)
    co = coords(me)
    d = _distances(co, [m for _, m, _, _ in pieces])
    a = np.exp(-(d - d.min(axis=1, keepdims=True)) / 0.004)
    alpha = a / a.sum(axis=1, keepdims=True)
    w = sum(alpha[:, k:k + 1] * fn(co) for k, (_, _, fn, _) in enumerate(pieces))
    edges = np.array([e.vertices[:] for e in me.edges], dtype=np.int64)
    shoulder = (np.abs(co[:, 0]) > 0.10) & (co[:, 2] > 1.20) & (co[:, 2] < 1.56)
    w = _ease_weights(w, edges, shoulder, SEAM_EASE)
    axes = [ax for _, _, _, ax in pieces]

    def axis(p, alpha=alpha):
        return sum(alpha[:, k:k + 1] * ax(p) for k, ax in enumerate(axes) if ax is not None)
    for _, m, _, _ in pieces:
        bpy.data.meshes.remove(m)
    me.name = 'body'
    me.shade_smooth()
    if PAINT_NOW and not M['skin'].get('painted'):   # the muscles' lines painted on, as Daggerfall's skin is
        import materials
        materials.paint(M['skin'], PAINT_NOW)
        M['skin']['painted'] = True
    body = Skinned('body', me, M['skin'], JOINTS, w)
    body.alpha, body.axes = alpha, axes
    parts, hands = [], {}
    for s, x in (('L', 1.0), ('R', -1.0)):
        hands[s] = {}
        for kind, closed in (('open', False), ('fist', True)):
            ob = rigid(f'hand_{s}_{kind}', blob_mesh(f'hand_{s}_{kind}', hand_blobs(x, closed), res=0.004), M['skin'])
            hang(parts, ob, f'hand_{s}')
            hands[s][kind] = ob
    return body, parts, hands


# the bald head: the cranium, the face's mass and the jaw under it, chin, a modest nose and brow, the cheekbones
HEAD = [
    blob((0, -0.03, 1.69), (0.076, 0.094, 0.092)), blob((0, -0.062, 1.625), (0.064, 0.07, 0.07)),
    blob((0, -0.072, 1.575), (0.05, 0.05, 0.035)), blob((0, -0.108, 1.556), (0.022, 0.018, 0.016)),
    blob((0, -0.128, 1.63), (0.009, 0.014, 0.02)), blob((0, -0.112, 1.672), (0.05, 0.014, 0.01)),
    blob((0.045, -0.098, 1.63), (0.018, 0.014, 0.012)), blob((-0.045, -0.098, 1.63), (0.018, 0.014, 0.012)),
]


# The woman's body: each table row for row the man's, so the fitted proportions (shape.py) lay on either. Daggerfall's
# woman archer's (TEXTURE.481): a narrow waist over full hips, her seat out behind and her bust forward (an S seen from
# the side), her shoulders round
TORSO_F = [
    (0.82, 0.09, 0.05, 0.04), (0.86, 0.158, 0.078, 0.095), (0.92, 0.2, 0.094, 0.13), (0.99, 0.195, 0.094, 0.115),
    (1.06, 0.134, 0.09, 0.076), (1.14, 0.12, 0.086, 0.07), (1.22, 0.13, 0.092, 0.078), (1.30, 0.158, 0.108, 0.092),
    (1.38, 0.174, 0.104, 0.092), (1.42, 0.171, 0.087, 0.09), (1.455, 0.156, 0.074, 0.082), (1.49, 0.12, 0.06, 0.068),
    (1.525, 0.066, 0.05, 0.055), (1.56, 0.05, 0.046, 0.05), (1.62, 0.046, 0.042, 0.045),
]
TORSO_MUSCLES_F = [
    (300, 24, 1.41, 1.24, 0.03), (240, 24, 1.41, 1.24, 0.03),                                     # the bust: its upper
    (300, 19, 1.36, 1.205, 0.034), (240, 19, 1.36, 1.205, 0.034),                                 # slope, its fuller foot
    (302, 18, 1.475, 1.45, 0.002), (238, 18, 1.475, 1.45, 0.002),                                 # collarbones
    (270, 14, 1.24, 1.02, 0.004),                                                                 # the belly's line
    (302, 24, 1.01, 0.84, 0.012), (238, 24, 1.01, 0.84, 0.012),                                   # over the hips' joints
    (335, 22, 1.15, 0.99, 0.006), (205, 22, 1.15, 0.99, 0.006),                                   # obliques
    (35, 26, 1.38, 1.18, 0.008), (145, 26, 1.38, 1.18, 0.008),                                    # lats
    (90, 50, 1.55, 1.42, 0.007), (58, 18, 1.44, 1.28, 0.004), (122, 18, 1.44, 1.28, 0.004),       # trapezius, blades
    (80, 10, 1.24, 0.98, 0.005), (100, 10, 1.24, 0.98, 0.005),                                    # spinal erectors
    # her glutes rise from the small of her back in one curve, round in profile and soft at their sides (sharper
    # along than across): one starting under the waist on a full back stands off it in a step, a point at its foot
    (62, 30, 1.02, 0.81, 0.035, 2.5, 4.0), (118, 30, 1.02, 0.81, 0.035, 2.5, 4.0), (90, 5, 0.97, 0.82, -0.012),
    (285, 9, 1.60, 1.49, 0.004), (255, 9, 1.60, 1.49, 0.004),                                     # the neck's cords
]
ARM_F = [(z, a * 0.86, f * 0.86, b * 0.86) for z, a, f, b in ARM_DESIGN]
DELTOID_F = 0.8   # her deltoid fuller than her arm's other muscles: as slight as they, her shoulder was a bare root


def _leg_f(z, a, f, b):
    k = float(np.interp(z, [0.05, 0.14, 0.34, 0.50, 0.58, 0.70, 0.90, 1.0], [0.85, 0.88, 0.88, 0.9, 0.9, 1.0, 1.04, 1.04]))
    return z, a * k, f * k, b * k


LEG_F = [_leg_f(*row) for row in LEG]
# the face finer: a narrower jaw, a smaller chin, nose and brow
HEAD_F = [
    blob((0, -0.03, 1.69), (0.072, 0.09, 0.088)), blob((0, -0.06, 1.628), (0.058, 0.064, 0.066)),
    blob((0, -0.07, 1.585), (0.042, 0.044, 0.03)), blob((0, -0.1, 1.565), (0.016, 0.014, 0.012)),
    blob((0, -0.122, 1.632), (0.007, 0.011, 0.016)), blob((0, -0.106, 1.672), (0.044, 0.01, 0.007)),
    blob((0.042, -0.094, 1.635), (0.016, 0.013, 0.011)), blob((-0.042, -0.094, 1.635), (0.016, 0.013, 0.011)),
]
# The lines Daggerfall paints on its figures' skin (materials.py `paint`): (x, z, half-width, half-height, depth, side
# -1 front or +1 back[, soft]). Its muscles read by them at a sprite's size, where no swell of the body's would: the
# crease under the pecs, the belly in their shade, the abs' rows parted and their tops lit, the spine, the lats in shade
F, B = -1, 1
PAINT = [(x, 1.282, 0.075, 0.014, 0.5, F) for x in (0.06, -0.06)] + [
    (0.0, 1.35, 0.008, 0.06, 0.12, F), (0.0, 1.165, 0.007, 0.1, 0.12, F),
    *[(x, z, 0.026, 0.009, 0.22, F) for x in (0.028, -0.028) for z in (1.214, 1.15)],
    (0.0, 1.22, 0.009, 0.22, 0.3, B), (0.07, 1.31, 0.04, 0.012, 0.3, B), (-0.07, 1.31, 0.04, 0.012, 0.3, B),
    (0.0, 1.15, 0.12, 0.16, 0.6, F, 1), (0.05, 0.84, 0.045, 0.13, 0.4, F, 1), (-0.05, 0.84, 0.045, 0.13, 0.4, F, 1),
    *[(x, z, 0.024, 0.012, -0.35, F) for z in (1.245, 1.18) for x in (0.028, -0.028)],
    (0.026, 1.115, 0.022, 0.011, -0.25, F), (-0.026, 1.115, 0.022, 0.011, -0.25, F),
    (0.075, 1.37, 0.045, 0.045, -0.3, B, 1), (-0.075, 1.37, 0.045, 0.045, -0.3, B, 1),
    (0.115, 1.24, 0.035, 0.12, 0.35, B, 1), (-0.115, 1.24, 0.035, 0.12, 0.35, B, 1),
]
# hers: the line between her breasts and the shade under them, their tops lit, the navel, her waist's sides, the inner
# thighs, the cleft of her seat and its foot, the spine
PAINT_F = [
    (0.0, 1.33, 0.008, 0.05, 0.4, F), (0.055, 1.235, 0.06, 0.014, 0.45, F), (-0.055, 1.235, 0.06, 0.014, 0.45, F),
    (0.05, 1.33, 0.035, 0.03, -0.2, F, 1), (-0.05, 1.33, 0.035, 0.03, -0.2, F, 1), (0.0, 1.06, 0.008, 0.008, 0.4, F),
    (0.11, 1.12, 0.03, 0.09, 0.3, F, 1), (-0.11, 1.12, 0.03, 0.09, 0.3, F, 1),
    (0.05, 0.84, 0.045, 0.13, 0.4, F, 1), (-0.05, 0.84, 0.045, 0.13, 0.4, F, 1),
    (0.0, 0.9, 0.008, 0.08, 0.4, B), (0.0, 0.81, 0.13, 0.012, 0.4, B), (0.0, 1.22, 0.008, 0.18, 0.25, B),
]
BODIES = {
    'male': {'torso': list(TORSO), 'muscles': list(TORSO_MUSCLES), 'arm': list(ARM), 'leg': list(LEG),
             'head': list(HEAD), 'swell': {'arm': 1.8, 'leg': 1.4, 'deltoid': 1.8},
             'sharp': {'torso': 4.0, 'arm': 2.5, 'leg': 3.0},
             'paint': PAINT, 'ease': 3},
    'female': {'torso': TORSO_F, 'muscles': TORSO_MUSCLES_F, 'arm': [(arm_z(z), a, f, b) for z, a, f, b in ARM_F],
               'leg': LEG_F, 'head': HEAD_F, 'swell': {'arm': 0.5, 'leg': 0.55, 'deltoid': DELTOID_F},
               'sharp': {'torso': 3.0, 'arm': 2.0, 'leg': 2.5}, 'paint': PAINT_F, 'ease': 6},
}


def use(body):
    """Build the named body ('male', 'female') from here on: its tables are laid into this module's in place, so the
    builders and shape.py, which hold them, read the body's."""
    global EASE
    b = BODIES[body]
    for table, rows in ((TORSO, b['torso']), (TORSO_MUSCLES, b['muscles']), (ARM, b['arm']), (LEG, b['leg']),
                        (HEAD, b['head'])):
        table[:] = rows
    SWELL.update(b['swell'])
    SHARP.update(b.get('sharp', {'torso': 2.0, 'arm': 2.0, 'leg': 2.0}))
    PAINT_NOW[:] = b.get('paint', [])
    EASE = b.get('ease', 6)
