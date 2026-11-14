"""The shields as the third person sees them, on the left arm (onehand.py): each kind's outline the first-person
forge's (fpshield.py `_polygon`, in its metal's edge, `_edged`) at a body's scale, its face toward the viewer. A shield
is its face (its boards, or a plate of its metal), bowed out a little; a slim rim along its edge; a boss at its middle;
and its metal's own front over the face (`FRONTS`): silver's cross, steel's loops, dwarven's dome and spine, ebony's
vee. Its metal is its armour set's (armour.py `palette`), so a layer named for the set is graded as the set's plate is.

A shield's own frame: its middle at the origin, +X across it, +Z its up, -Y the way its face looks."""
import math

import numpy as np

import fpshield

KINDS = ('buckler', 'round', 'kite', 'tower')
METALS = (None, 'Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')
SCALE = {'buckler': 1.1, 'round': 1.3, 'kite': 1.1, 'tower': 0.95}   # the first-person outline to a body's shield
BULGE = 0.035     # how far the face bows out at its middle, metres
RIM = (0.012, 0.006)   # the rim: its breadth across the face and how far it stands off it
BOSS = 0.075      # the boss's radius on a round shield (a buckler's is its own)
WOODEN = ('Leather', 'Chain', 'Iron', 'Steel', 'Orcish', None)   # the faces of boards; the rest are plate

# each metal's front over the face, in shares of the shield's half-width and half-height: `cross` arms out from the
# boss, broadening to the rim (how many, the first's angle); `loops`, bands along ovals (middle across and up,
# half-width, half-height); `dome` (across, up, its radius) a raised dome; `spine` a band from the dome down; `vee`
# bands meeting at a point; `ring` a raised ring round the middle
FRONTS = {
    'Silver': {'cross': (4, 45.0), 'ring': 0.46},
    'Steel': {'loops': ((-0.42, 0.0, 0.44, 0.86), (0.42, 0.0, 0.44, 0.86))},
    'Dwarven': {'dome': (0.0, 0.4, 0.26), 'spine': ((0.0, 0.14), (0.0, -0.95))},
    'Ebony': {'dome': (0.0, 0.5, 0.22), 'vee': (((-0.78, 0.42), (0.0, -0.62)), ((0.78, 0.42), (0.0, -0.62)))},
}


def outline(kind, metal=None):
    """The shield's outline in its own plane (x across, z up), as a loop of points."""
    S = {**fpshield.SHAPE, 'design': metal}
    return fpshield._edged(kind, S, fpshield._polygon(kind, S)) * SCALE[kind]


def _face_y(xz, reach):
    """How far out (-Y) the face stands at each point: bowed out most at its middle."""
    r = np.linalg.norm(xz, axis=1) / reach
    return -BULGE * np.clip(1.0 - r ** 2, 0.0, 1.0)


def _mesh(name, verts, faces, mat):
    import bpy
    from gear import rest_attr
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(map(int, f)) for f in faces])
    me.materials.append(mat)
    me.update()
    me.shade_smooth()
    rest_attr(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _face(name, pts, mat, rings=8):
    """The face: rings from the middle out to the outline, bowed out, and a back a board's breadth behind."""
    reach = np.linalg.norm(pts, axis=1).max()
    verts, faces = [(0.0, -BULGE, 0.0)], []
    n = len(pts)
    for k in range(1, rings + 1):
        xz = pts * (k / rings)
        y = _face_y(xz, reach)
        verts += [(x, yy, z) for (x, z), yy in zip(xz, y)]
    for j in range(n):   # the middle's fan
        faces.append((0, 1 + j, 1 + (j + 1) % n))
    for k in range(1, rings):
        a, b = 1 + (k - 1) * n, 1 + k * n
        for j in range(n):
            faces.append((a + j, b + j, b + (j + 1) % n, a + (j + 1) % n))
    back = len(verts)   # the back, flat, a board behind the edge
    verts += [(x, 0.012, z) for x, z in pts]
    edge = 1 + (rings - 1) * n
    for j in range(n):
        faces.append((edge + j, back + j, back + (j + 1) % n, edge + (j + 1) % n))
    return _mesh(name, verts, faces, mat)


def _band(name, path, half_w, lift, mat, reach):
    """A flat band lying on the face along `path` (points x, z), `half_w` either side, standing `lift` off it."""
    path = np.asarray(path, float)
    d = np.gradient(path, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-12
    side = np.column_stack([-d[:, 1], d[:, 0]])
    hw = np.broadcast_to(half_w, len(path))[:, None]
    verts, faces = [], []
    for s in (-1.0, 1.0):
        xz = path + s * side * hw
        y = _face_y(xz, reach) - lift
        verts.append(np.column_stack([xz[:, 0], y, xz[:, 1]]))
    for s in (-1.0, 1.0):   # its sides down to the face
        xz = path + s * side * hw
        verts.append(np.column_stack([xz[:, 0], _face_y(xz, reach), xz[:, 1]]))
    V = np.concatenate(verts)
    n = len(path)
    for j in range(n - 1):
        faces.append((j, j + 1, n + j + 1, n + j))                   # its top
        faces.append((2 * n + j, 2 * n + j + 1, j + 1, j))           # one side
        faces.append((n + j, n + j + 1, 3 * n + j + 1, 3 * n + j))   # the other
    return _mesh(name, V, faces, mat)


def _dome(name, mid, r, h, mat, reach, n=16):
    """A dome on the face at `mid` (x, z), its radius `r`, standing `h` off it."""
    verts, faces = [], []
    rings = 5
    for k in range(rings + 1):
        a = (k / rings) * math.pi / 2
        rr, hh = r * math.cos(a), h * math.sin(a)
        for j in range(n):
            t = 2 * math.pi * j / n
            x, z = mid[0] + rr * math.cos(t), mid[1] + rr * math.sin(t)
            verts.append((x, float(_face_y(np.array([[x, z]]), reach)[0]) - hh, z))
    for k in range(rings):
        for j in range(n):
            a, b = k * n + j, k * n + (j + 1) % n
            faces.append((a, b, b + n, a + n))
    return _mesh(name, verts, faces, mat)


def _within(pts, path, share=0.92):
    """The runs of `path` that lie inside the outline shrunk to `share` (fpshield.py's own test)."""
    keep = fpshield._within(pts, path, share)
    return [path[a:b + 1] for a, b in fpshield._runs(keep) if b - a > 2]


def build(kind, metal, M, A):
    """`metal`'s shield of `kind`: [objects] in the shield's own frame. `M` the body's palette (its wood), `A` the
    metal's armour palette (armour.py `palette`: plate, trim, strap)."""
    pts = outline(kind, metal)
    reach = np.linalg.norm(pts, axis=1).max()
    hw = np.abs(pts).max(axis=0)
    wooden = metal in WOODEN
    tag = f'shield_{kind}_{(metal or "plain").lower()}'
    obs = [_face(f'{tag}.face', pts, M['wood'] if wooden else A['plate'])]
    ring = np.vstack([pts, pts[:1]]) * (1.0 - RIM[0] / reach)
    obs.append(_band(f'{tag}.rim', ring, RIM[0], RIM[1], A['trim'], reach))
    boss = BOSS * (0.6 if kind == 'buckler' else 1.0)
    F = FRONTS.get(metal, {})
    if 'dome' not in F:
        obs.append(_dome(f'{tag}.boss', (0.0, 0.0), boss, boss * 0.6, A['trim'], reach))
    for k in range(F.get('cross', (0, 0.0))[0]):   # arms broadening from the boss to the rim
        a = math.radians(F['cross'][1]) + 2 * math.pi * k / F['cross'][0]
        t = np.linspace(boss / reach, 0.94, 24)
        path = np.column_stack([np.cos(a) * t * hw[0], np.sin(a) * t * hw[1]])
        for run in _within(pts, path, 0.95):
            r = np.linalg.norm(run, axis=1) / reach
            obs.append(_band(f'{tag}.cross', run, 0.018 + 0.05 * r, 0.004, A['plate'] if wooden else A['trim'], reach))
    if F.get('ring'):
        t = np.linspace(0.0, 2 * math.pi, 73)
        circle = np.column_stack([np.cos(t) * F['ring'] * hw[0], np.sin(t) * F['ring'] * hw[0]])
        obs.append(_band(f'{tag}.ring', circle, 0.008, 0.006, A['trim'], reach))
    for cx, cz, rx, rz in F.get('loops', ()):
        t = np.linspace(0.0, 2 * math.pi, 97)
        path = np.column_stack([(cx + rx * np.cos(t)) * hw[0], (cz + rz * np.sin(t)) * hw[1]])
        for run in _within(pts, path):
            obs.append(_band(f'{tag}.loop', run, 0.016, 0.006, A['trim'], reach))
    if F.get('dome'):
        dx, dz, dr = F['dome']
        obs.append(_dome(f'{tag}.dome', (dx * hw[0], dz * hw[1]), dr * hw[0], dr * hw[0] * 0.55, A['trim'], reach))
    for a, b in ([F['spine']] if F.get('spine') else []) + list(F.get('vee', ())):
        path = (np.array(a) + (np.array(b) - np.array(a)) * np.linspace(0.0, 1.0, 30)[:, None]) * hw
        for run in _within(pts, path):
            obs.append(_band(f'{tag}.band', run, 0.016, 0.005, A['trim'], reach))
    return obs
