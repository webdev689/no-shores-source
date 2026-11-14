"""The first-person forge's eye: a perspective camera over Daggerfall's 320 x 200 screen, its lights, a weapon's pose in
front of it, and the exact raster the fitter reads.

Camera space: +X right, +Y forward (away from the eye), +Z up. A point at depth y lands on the screen at
u = CX + focal * x / y, v = CY - focal * aspect * z / y (pixels, v down). Each record's canvas is a rect of that screen,
where the game draws it (fpsWeapon.js `fpsWeaponQuad`), so a swing is one weapon moving in front of one eye."""
import json
import math
import os

import numpy as np

W, H = 320, 200
CX, CY = W / 2, H / 2
# The canvas the eye renders: the screen, and room past its top and sides (`bleed`) for a frame the Weapon Widget moves
# at rest, so the weapon runs on past the screen's edge instead of ending there. The screen's top left is (OX, OY) on
# it, RW x RH its size; with no room it is the screen itself.
OX = OY = 0
RW, RH = W, H
FOCAL = None   # the eye's focal length in pixels, once `setup` has made the camera
NEAR = 0.02   # metres: nearer than this nothing is drawn
# Daggerfall lit its first-person weapons from the eye: the near end of a blade almost white, its point fallen dark, one
# bevel brighter than the other. So the light is a lamp by the eye: its place in camera space (metres) and its power
# (watts), and the ambient's strength
# A sun may join it (the direction it shines toward, its strength): Daggerfall lit its gloves and boots from above as
# well as from the eye. The strengths are the fitter's (`shade`); the scene's lights are set to give the same ratios.
LIGHT = {'lamp': [-0.15, 0.0, 0.12, 6.0], 'sun': [0.0, 0.0, -1.0, 0.0], 'world': 0.15}
# a record lit apart: Daggerfall drew each record's light by hand, and some (the fists' idle) far from the rest's. A
# frame ('<record>:<frame>') may have its own too: a weapon swung up to the lamp would whiten in the archive's exposure
RECORD_LIGHT = {}


def load_light(path):
    RECORD_LIGHT.clear()
    if os.path.exists(path):
        table = json.load(open(path))
        RECORD_LIGHT.update(table.pop('records', {}))
        LIGHT.update(table)


def light_for(record, frame=None):
    """The light a record's frame is drawn in: the archive's, under the record's own and the frame's own where they
    have them."""
    own = {**RECORD_LIGHT.get(str(record), {}), **RECORD_LIGHT.get(f'{record}:{frame}', {})}
    return dict(LIGHT, **own) if own else LIGHT


def ray(u, v, S):
    """The direction from the eye through screen point (u, v)."""
    d = np.array([(u - CX) / S['focal'], 1.0, -(v - CY) / (S['focal'] * S['aspect'])])
    return d / np.linalg.norm(d)


def unproject(u, v, depth, S):
    """The camera-space point at `depth` that lands on screen point (u, v)."""
    return np.array([(u - CX) * depth / S['focal'], depth, -(v - CY) * depth / (S['focal'] * S['aspect'])])


def pose_matrix(p, S, length):
    """A weapon's place before the eye: its root (where the blade leaves the guard, or the head leaves the haft) at
    screen point `base` [u, v] and `depth`, its far end (the point, the head's top) on screen point `tip` [u, v], turned
    `roll` degrees about its own axis from facing the eye flat. Answers (4 x 4 weapon-to-camera matrix, metres the far
    end falls short of its screen point). Weapon space: the axis up +Z from the root, the width along +X."""
    B = unproject(p['base'][0], p['base'][1], p['depth'], S)
    r = ray(p['tip'][0], p['tip'][1], S)
    rb = float(r @ B)
    disc = rb * rb - float(B @ B) + length * length
    short = 0.0
    if disc < 0:   # the far end cannot reach the ray: aimed at the nearest point of it
        short = math.sqrt(-disc)
        disc = 0.0
    T = r * (rb + math.sqrt(disc))   # the far root: the weapon points away from the eye
    d = T - B
    d /= max(np.linalg.norm(d), 1e-9)
    view = B + d * length * 0.5
    view /= np.linalg.norm(view)
    w = np.cross(d, view)
    if np.linalg.norm(w) < 1e-6:
        w = np.cross(d, np.array([0.0, 0.0, 1.0]))
    w /= np.linalg.norm(w)
    a = math.radians(p.get('roll', 0.0))
    w = w * math.cos(a) + np.cross(d, w) * math.sin(a)
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = w, np.cross(d, w), d, B
    return M, short


def project(P, S):
    """Camera-space points to screen (u, v) and depth."""
    y = np.maximum(P[:, 1], 1e-6)
    return CX + S['focal'] * P[:, 0] / y, CY - S['focal'] * S['aspect'] * P[:, 2] / y, P[:, 1]


def view(size=None):
    """The screen the eye renders: Daggerfall's 320 x 200, or a spec's own (`view`: a picture the game draws at its
    own size, a texel to a pixel), the eye's middle at its centre."""
    global W, H, CX, CY
    W, H = (320, 200) if size is None else (int(size[0]), int(size[1]))
    CX, CY = W / 2, H / 2
    bleed()


def bleed(left=0, top=0, right=0):
    """Render the screen with `left`, `top` and `right` pixels of room past it (none below: the game never lifts a
    frame off the screen's foot). The camera widens and shifts so the screen's pixels stay where they were."""
    global OX, OY, RW, RH
    OX, OY, RW, RH = int(left), int(top), W + int(left) + int(right), H + int(top)
    _aim()


def _aim():
    """The camera over the canvas: its lens from the eye's focal length across the canvas's width, shifted so the
    eye's middle lands on the screen's middle (Blender's shift is a share of the width under a horizontal fit)."""
    if FOCAL is None:
        return
    import bpy
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = RW, RH
    cam = sc.camera.data
    cam.lens = FOCAL * 36.0 / RW
    cam.shift_x = -((OX + CX) - RW / 2) / RW
    cam.shift_y = ((OY + CY) - RH / 2) / RW


def raster(u, v, depth, tris, w=None, h=None):
    """Each pixel the index of the nearest triangle over its centre (-1 none), as Cycles samples a pixel at one point.
    A triangle of any size: every pixel centre in its box is tested. A triangle reaching nearer than NEAR is left out."""
    if w is None and h is None:   # the canvas the eye renders: the screen's points laid where it sits on it
        w, h, u, v = RW, RH, u + OX, v + OY
    w, h = W if w is None else w, H if h is None else h
    index = np.nonzero(depth[tris].min(axis=1) > NEAR)[0]
    tris = tris[index]
    img = np.full(w * h, -1, dtype=np.int32)
    if not len(tris):
        return img.reshape(h, w)
    U, V, Z = u[tris], v[tris], depth[tris]
    x0 = np.maximum(np.ceil(U.min(axis=1) - 0.5), 0).astype(np.int64)
    x1 = np.minimum(np.floor(U.max(axis=1) - 0.5), w - 1).astype(np.int64)
    y0 = np.maximum(np.ceil(V.min(axis=1) - 0.5), 0).astype(np.int64)
    y1 = np.minimum(np.floor(V.max(axis=1) - 0.5), h - 1).astype(np.int64)
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    on = (nx > 0) & (ny > 0)
    if not on.any():
        return img.reshape(h, w)
    U, V, Z, index, x0, y0, nx, ny = U[on], V[on], Z[on], index[on], x0[on], y0[on], nx[on], ny[on]
    count = nx * ny
    t = np.repeat(np.arange(len(count)), count)
    k = np.arange(count.sum()) - np.repeat(np.cumsum(count) - count, count)
    ix, iy = x0[t] + k % nx[t], y0[t] + k // nx[t]
    px, py = ix + 0.5, iy + 0.5
    ax, ay, bx, by, qx, qy = U[t, 0], V[t, 0], U[t, 1], V[t, 1], U[t, 2], V[t, 2]
    area = (bx - ax) * (qy - ay) - (qx - ax) * (by - ay)
    w0 = (bx - px) * (qy - py) - (qx - px) * (by - py)
    w1 = (qx - px) * (ay - py) - (ax - px) * (qy - py)
    w2 = (ax - px) * (by - py) - (bx - px) * (ay - py)
    s = np.sign(area)
    inside = (area != 0) & (w0 * s >= 0) & (w1 * s >= 0) & (w2 * s >= 0)
    if not inside.any():
        return img.reshape(h, w)
    t, ix, iy = t[inside], ix[inside], iy[inside]
    # nearness: 1 / depth, laid across the triangle as the screen sees it
    near = (w0[inside] / Z[t, 0] + w1[inside] / Z[t, 1] + w2[inside] / Z[t, 2]) / area[inside]
    order = np.argsort(near, kind='stable')
    img[(iy * w + ix)[order]] = index[t[order]]
    return img.reshape(h, w)


def shade(P, tris, light=None):
    """Each triangle's light as the lamp gives it: its face turned to the eye, lit by the lamp's power over the square of
    its distance, as far as the face turns to it, and the ambient. What the fitter weighs the reference's light by."""
    light = light or LIGHT
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    n = np.cross(b - a, c - a)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    mid = (a + b + c) / 3
    n *= -np.sign((n * mid).sum(axis=1, keepdims=True) + 1e-12)   # the side the eye sees
    to = np.array(light['lamp'][:3]) - mid
    d = np.maximum(np.linalg.norm(to, axis=1), 1e-3)
    out = light['lamp'][3] * np.maximum((n * to).sum(axis=1) / d, 0.0) / (d * d) + light['world']
    sun = light.get('sun', [0.0, 0.0, -1.0, 0.0])
    if sun[3]:
        toward = -np.array(sun[:3]) / max(np.linalg.norm(sun[:3]), 1e-9)
        out = out + sun[3] * np.maximum(n @ toward, 0.0)
    return out


def occlusion(v, tris, rays=24, reach=0.06, seed=3):
    """Each triangle's share of open sky (0 to 1): of `rays` directions over the hemisphere its face looks out on, the
    share that leave the mesh's own surface unblocked within `reach` metres. Both of a face's sides are tried and the
    more open kept, so a mesh's winding does not matter. Cycles darkens a hollow so (the fist's tunnel, a boot's
    creases); the fitter's light (`shade`) is multiplied by it, so it reads them dark too."""
    __import__('bpy')   # Blender's module brings mathutils with it
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons(v.tolist(), tris.tolist())
    a, b, c = v[tris[:, 0]], v[tris[:, 1]], v[tris[:, 2]]
    n = np.cross(b - a, c - a)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    mid = (a + b + c) / 3
    rng = np.random.default_rng(seed)
    d = rng.normal(size=(rays, 3))
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    out = np.ones(len(tris))
    for i in range(len(tris)):
        best = 0.0
        for side in (1.0, -1.0):
            nn = n[i] * side
            dirs = d * np.sign(d @ nn)[:, None]   # the hemisphere over this side
            start = Vector(mid[i] + nn * 1e-4)
            free = sum(tree.ray_cast(start, Vector(x), reach)[0] is None for x in dirs)
            best = max(best, free / rays)
        out[i] = best
    return out


def crop(screen, rect):
    """A record's canvas cut from a whole screen: `rect` is [x, y, width, height] on it, and on the canvas the eye
    renders (`bleed`) where the screen sits on it."""
    x, y, cw, ch = rect
    if screen.shape[:2] == (RH, RW):
        x, y = x + OX, y + OY
    assert x >= 0 and y >= 0 and x + cw <= screen.shape[1] and y + ch <= screen.shape[0], f'{rect} past the canvas'
    return screen[y:y + ch, x:x + cw]


def setup(S, samples=64):
    """The scene: Cycles at one sample point a pixel, the eye's camera, the lamp by it."""
    import bpy
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    sc.cycles.seed = 7
    sc.cycles.filter_width = 0.01   # one point a pixel: hard edges, as the classic renders have
    sc.cycles.max_bounces = 4
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    world = bpy.data.worlds.new('world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.08, 0.08, 0.08, 1)
    sc.world = world
    cam_data = bpy.data.cameras.new('eye')
    cam_data.type = 'PERSP'
    cam_data.sensor_fit = 'HORIZONTAL'
    cam_data.sensor_width = 36.0
    cam_data.lens = S['focal'] * 36.0 / W
    global FOCAL
    FOCAL = S['focal']
    cam_data.clip_start = NEAR
    cam_data.clip_end = 100.0
    cam = bpy.data.objects.new('eye', cam_data)
    sc.collection.objects.link(cam)
    cam.rotation_euler = (math.pi / 2, 0, 0)   # looking along +Y, +Z up
    sc.camera = cam
    _aim()
    ld = bpy.data.lights.new('lamp', 'POINT')
    ld.shadow_soft_size = 0.0
    sc.collection.objects.link(bpy.data.objects.new('lamp', ld))
    sd = bpy.data.lights.new('sun', 'SUN')
    sd.angle = 0.05
    sc.collection.objects.link(bpy.data.objects.new('sun', sd))
    set_lights()
    return cam


def set_lights(light=None):
    """The scene's lights in the fitter's ratios: a point light of power P gives P / (4 pi d^2) on a face square to it,
    a sun of strength E gives E, and a world of strength W gives pi W all round, so the sun is set to E / 4 pi and the
    world to W / 4 pi^2 against the lamp's P."""
    import bpy
    from mathutils import Vector
    light = light or LIGHT
    ob = bpy.data.objects['lamp']
    ob.location = light['lamp'][:3]
    ob.data.energy = light['lamp'][3]
    sun = light.get('sun', [0.0, 0.0, -1.0, 0.0])
    so = bpy.data.objects['sun']
    so.rotation_euler = Vector(sun[:3]).to_track_quat('-Z', 'Y').to_euler()
    so.data.energy = sun[3] / (4 * math.pi)
    world = bpy.context.scene.world.node_tree.nodes['Background'].inputs['Strength']
    world.default_value = light['world'] / (4 * math.pi ** 2)
    bpy.context.scene.view_settings.exposure = light.get('exposure', 0.0)
