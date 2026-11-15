"""The forge's horse: the Courser the Morrowind lane rides, whole. Its meshes, skin weights, bones and gaits are read
from the game's own bake (src/assets/horse/courser.json, tools/bakeHorse.mjs) and its coat and its mane and tail
from the game's own pictures, so the horse the forge draws is the horse the 3D lane draws, stride for stride.

A gait's pose is worked out as the game works it (src/world/horseModel.js `gaitLocals`, `writeHorsePalette`): each
bone's local turn and place at a time, composed down the tree, and each vertex carried by its four bones' pose times
their inverse bind. The seat is the game's too (src/world/horseRig.js `HORSE_SEAT` on its `Spine` bone).

The bake's frame is +Y ahead and +Z up, its origin on the ground under the horse's middle. The forge's body faces
-Y, so the horse is turned half round, then turned with the view as the body is."""
import json
import math
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, '..', '..', 'src', 'assets', 'horse'))
BAKE = os.path.join(ASSETS, 'courser.json')
PICTURES = {'body': os.path.join(ASSETS, 'body.png'), 'hair': os.path.join(ASSETS, 'hair.png')}
# the game's seat: a rider's hips over the back's lowest point, carried by the Spine bone (horseRig.js)
SEAT = (0.0, 0.1, 1.68)
SEAT_BONE = 'Spine'
# each part's material: its name is the class the layer's raster and the grade read it by
MATERIAL_OF = {'body': 'horse', 'hair': 'horsehair'}
# the mane's and the tail's cards cut to the picture's alpha, each piece under this long, so a pixel's depth is the
# hair's where the hair is drawn and the body's behind it where the card is clear
CARD_EDGE = 0.012
ALPHA_CUT = 0.5
# the strands laid on each card, as Daggerfall paints a mane: a strand every so many of the clump's texels across, its
# points every STRAND_STEP texels down, about a pixel round at the view it is drawn for
STRANDS = 160
STRAND_STEP = 3
# the strands gathered into locks, as hair falls: LOCK strands a lock, each drawn toward its lock's middle down its
# length, CLUMP of the way at the tip, so the mane's foot reads as locks and not as noise
LOCK, CLUMP = 8, 0.7
# the mane groomed on the neck for the eye up close (`Courser(groomed=True)`, `Groom`): seen from the saddle the cards
# stand out from the neck as a wing, where Daggerfall's mane falls over the crest and lies down the neck's left side in
# locks, its top level and its tips drooping. Each strand grows from the crest (`CREST`, the bake's +Y from the withers
# to the poll), `rise` degrees off the hide's normal toward the left, bends `bend` a step toward its pull and lies on
# the hide, up to `mass` metres deep. Its pull is its load, but only `along` of it along the crest, so it lies across
# the neck, and its lie, `lie` g to the left, `lie_down` of that down, which holds it out when it floats
CREST, POLL = (0.32, 1.14), (1.17, 1.25)
GROOM = {'locks': 20, 'per_lock': 70, 'length': 0.17, 'segments': 18, 'rise': 75.0, 'bend': 0.1, 'mass': 0.02,
         'along': 0.2, 'lie': 0.45, 'lie_down': 0.05, 'radius': 0.0034, 'seed': 11}
# the forelock, from the poll between the ears (`POLL`), `width` metres either side of `middle` (a little toward the
# right ear, where the mane falling left leaves the poll bare): it hugs the poll (`rise` degrees off the hide's normal,
# nearly along it) and falls forward over the brow, each strand fanned toward its own side (`fan`), so from the saddle
# it is a low tuft as wide as the gap between the ears and not a crest standing up
FORELOCK = {'strands': 90, 'length': 0.06, 'middle': 0.008, 'width': 0.025, 'rise': (88.0, 92.0), 'fan': 0.3,
            'lie_down': 1.0}
# the locks: each `per_lock` strands, `width` the share of a lock's room along the crest it may differ by; the lock's
# middle rooted `root` (metres across the crest, from its edges' and the bump to its middle's), so its edge on the crest
# is a scallop; its length a share of `length` (`profile`: the withers' and the poll's, the whole midway); its strands
# drawn together toward the tip (`clump`), a few flying free (`flyaway`). The deepest (`base`: their share of the
# depth, and their girth) lie loose and thick, a dark mass under the locks
LOCKS = {'width': 0.35, 'cross': 12.0, 'root': (-0.012, 0.014), 'profile': (0.75, 0.5), 'clump': 0.6, 'flyaway': 0.04,
         'base': (0.35, 2.0)}
# the strands' hair, rougher than the sprites' (`HAIR`) so a glint runs along a strand as a stroke, as Daggerfall's
GROOM_HAIR = {'Roughness': 0.4, 'Radial Roughness': 0.5}
# each strand's wave off the hide (metres, and its length): it tilts the strand through the light along its length, so
# its glint shows as strokes all across the mane and not only where the mane droops
WAVE = (0.0006, 0.06)
# the mane's swing (`mane_load`): each lock a damped spring on its root (its own frequency in Hz, and its damping),
# driven by the root's motion through the stride, so the mane floats where the neck drops away under it and lies heavy
# where the neck lifts it. The pace's air lays it back toward the rider (m/s², each gait)
SPRING = (1.3, 0.6)
AIR = {'walk': 0.4, 'gallop': 2.5}
GRAVITY = 9.81
# the card's own shading under the strands: darker, so the mane's mass is one dark body the strands glint over
CARD_SHADE = 0.55
# how the cards' picture is sampled: each texel its own ('Closest', as the 3D lane samples it), or blended ('Linear'),
# which a near view needs, or the picture's fine hair and its alpha's edge show as blocks
CARD_FILTER = 'Closest'
STRAND_RADIUS = 0.0015
# each strand's wave, as Daggerfall's mane strands curl: a wave across its card (texels of the clump, and the wave's
# length down it) and one off the card's face a quarter of a wave behind, so a strand turns through the light and its
# glint breaks into dashes along it
WAVE_ACROSS = 1.5
WAVE_LENGTH = 14.0
CURL = 0.004
STRAND_MATERIAL = 'horsestrand'
# the hide: a groomed coat shines where the light falls across it, as Daggerfall paints its horse's forehead and cheek;
# each texel its own, as the 3D lane samples it (`Courser`'s `coat` for a near view)
COAT = {'roughness': 0.4, 'specular': 0.5, 'filter': 'Closest'}
MASK_SAMPLES = 4   # the coat held out: only the mane's outline is read off it
# the hair shader's settings: a black mane's melanin, a little red in it, and strands glossy enough to glint
HAIR = {'Melanin': 0.92, 'Melanin Redness': 0.35, 'Roughness': 0.22, 'Radial Roughness': 0.35, 'Coat': 0.0,
        'IOR': 1.55, 'Random Color': 0.25, 'Random Roughness': 0.3}

_bake = []


def bake():
    """The game's bake, read once."""
    if not _bake:
        _bake.append(json.load(open(BAKE)))
    return _bake[0]


def use_bake(b):
    """Build and pose from `b` in place of the game's bake from here on, in this process (fphead.py's mouth)."""
    _bake[:] = [b]


def _col(m):
    """A bake's column-major 4x4 as rows."""
    return np.array(m, dtype=np.float64).reshape(4, 4).T


def _quat(x, y, z, w):
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def locals_at(b, gait, time):
    """Gait `gait`'s bones at `time` seconds: each bone's local place (n, 3) and turn (n, 4: x, y, z, w), between the
    bake's two frames either side, as horseModel.js `gaitLocals` gives them."""
    g = b['gaits'][gait]
    nb = len(b['bones'])
    span = (time / g['duration']) % 1.0
    at = span * (g['frames'] - 1)
    f0 = min(g['frames'] - 1, int(math.floor(at)))
    f1 = min(g['frames'] - 1, f0 + 1)
    k = at - f0
    t = np.array(g['rest'], dtype=np.float64).reshape(nb, 3)
    q = np.array(g['q'], dtype=np.float64).reshape(g['frames'], nb, 4)
    a, c = q[f0], q[f1]
    sign = np.where((a * c).sum(axis=1, keepdims=True) < 0, -1.0, 1.0)
    rot = a + (sign * c - a) * k
    moves = g['moves']
    if moves:
        tm = np.array(g['t'], dtype=np.float64).reshape(g['frames'], len(moves), 3)
        t[moves] = tm[f0] + (tm[f1] - tm[f0]) * k
    return t, rot


def _mean_turn(b, gait, i):
    """Bone `i`'s turn averaged over `gait`'s frames (x, y, z, w), each frame's sign matched to the first's."""
    g = b['gaits'][gait]
    qs = np.array(g['q'], dtype=np.float64).reshape(g['frames'], len(b['bones']), 4)[:, i, :].copy()
    qs[(qs @ qs[0]) < 0] *= -1
    m = qs.mean(axis=0)
    return m / np.linalg.norm(m)


def _axis_turn(axis, degrees):
    a = math.radians(degrees)
    x, y, z = np.asarray(axis, dtype=np.float64) / np.linalg.norm(axis)
    c, s_, t = math.cos(a), math.sin(a), 1 - math.cos(a)
    return np.array([[t * x * x + c, t * x * y - s_ * z, t * x * z + s_ * y],
                     [t * x * y + s_ * z, t * y * y + c, t * y * z - s_ * x],
                     [t * x * z - s_ * y, t * y * z + s_ * x, t * z * z + c]])


OWN_AXES = {'x': np.array([1.0, 0.0, 0.0]), 'y': np.array([0.0, 1.0, 0.0]), 'z': np.array([0.0, 0.0, 1.0])}


def worlds(b, gait, time, extra=None, calm=None):
    """Each bone's world matrix in the bake's frame at `time` of `gait`. `calm` ({bone: share}) holds a bone's turn that
    share of the way from the gait's average to its own, so its swing is that much smaller; `extra` ({bone: [(axis,
    degrees), ...]}) turns a bone further about axes of the bake's frame, at its own joint, after the gait's turn; an
    axis named 'x', 'y' or 'z' is the bone's own (an ear's 'y' runs up it, from its root to its tip)."""
    t, q = locals_at(b, gait, time)
    names = [bone['name'] for bone in b['bones']]
    for name, share in (calm or {}).items():
        i = names.index(name)
        m = _mean_turn(b, gait, i)
        own = q[i] if q[i] @ m >= 0 else -q[i]
        v = m + share * (own - m)
        q[i] = v / np.linalg.norm(v)
    out = []
    for i, bone in enumerate(b['bones']):
        L = np.eye(4)
        L[:3, :3] = _quat(*q[i])
        L[:3, 3] = t[i]
        p = bone['parent']
        W = L if p < 0 else out[p] @ L
        for axis, degrees in (extra or {}).get(bone['name'], ()):
            local = OWN_AXES[axis] if isinstance(axis, str) else W[:3, :3].T @ np.asarray(axis, dtype=np.float64)
            L[:3, :3] = L[:3, :3] @ _axis_turn(local, degrees)
            W = L if p < 0 else out[p] @ L
        out.append(W)
    return out


def skins(b, W):
    """Each bone's skin matrix: its pose times its inverse bind."""
    return np.stack([W[i] @ _col(bone['inverseBind']) for i, bone in enumerate(b['bones'])])


def posed(mesh, S):
    """A bake mesh's vertices carried by their four bones (`S`, `skins`), in the bake's frame."""
    p = np.array(mesh['positions'], dtype=np.float64).reshape(-1, 3)
    j = np.array(mesh['joints'], dtype=np.int64).reshape(-1, 4)
    w = np.array(mesh['weights'], dtype=np.float64).reshape(-1, 4)
    h = np.hstack([p, np.ones((len(p), 1))])
    out = np.zeros_like(p)
    for k in range(4):
        out += w[:, k:k + 1] * np.einsum('nij,nj->ni', S[j[:, k]], h)[:, :3]
    return out


def turned(yaw):
    """The bake's frame into the forge's: half round so the horse faces -Y as the body does, then `yaw` degrees about
    +Z as the view turns the body (rig.py `Pose`)."""
    a = math.radians(yaw + 180.0)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def seat(gait, time, yaw=0.0):
    """Where a rider's hips sit at `time` of `gait`, in the forge's world: the game's seat on the Spine bone as the
    stride carries it."""
    b = bake()
    i = next(k for k, bone in enumerate(b['bones']) if bone['name'] == SEAT_BONE)
    local = _col(b['bones'][i]['inverseBind']) @ np.array([*SEAT, 1.0])
    return turned(yaw) @ (worlds(b, gait, time)[i] @ local)[:3]


def _weld(mesh):
    """The mesh's corners welded by place alone, so the shading runs smooth across a seam of its picture, and each
    corner's UV kept: (places, triangles as place indices, each corner's UV, each place's first bake vertex)."""
    p = np.array(mesh['positions'], dtype=np.float64).reshape(-1, 3)
    uv = np.array(mesh['uvs'], dtype=np.float64).reshape(-1, 2)
    tri = np.array(mesh['indices'], dtype=np.int64).reshape(-1, 3)
    _, first, inverse = np.unique(np.round(p, 5), axis=0, return_index=True, return_inverse=True)
    return first, inverse.reshape(-1)[tri], uv[tri]


def _alpha(img, uv):
    """The picture's alpha (0..1) at each UV, nearest texel; v runs up from the picture's foot."""
    h, w = img.shape[:2]
    x = np.clip((uv[..., 0] % 1.0) * w, 0, w - 1).astype(int)
    y = np.clip((1.0 - uv[..., 1] % 1.0) * h, 0, h - 1).astype(int)
    return img[y, x, 3] / 255.0


def cut_cards(mesh, img):
    """The hair's cards split until no edge is longer than CARD_EDGE at rest, and each piece kept where any of its
    corners, its edges' middles or its centre lands on hair: (bake vertex weights a corner, as (n, 3) barycentric rows
    over its card triangle's corners; the card triangle; each corner's UV)."""
    p = np.array(mesh['positions'], dtype=np.float64).reshape(-1, 3)
    uv = np.array(mesh['uvs'], dtype=np.float64).reshape(-1, 2)
    tri = np.array(mesh['indices'], dtype=np.int64).reshape(-1, 3)
    bars, owners = [], []
    for t, (a, b, c) in enumerate(tri):
        longest = max(np.linalg.norm(p[b] - p[a]), np.linalg.norm(p[c] - p[b]), np.linalg.norm(p[a] - p[c]))
        n = max(1, int(math.ceil(longest / CARD_EDGE)))
        i, j = (g.ravel() for g in np.meshgrid(np.arange(n), np.arange(n), indexing='ij'))
        up = i + j < n
        down = i + j < n - 1
        steps = np.concatenate([
            np.stack([np.stack([i, j], 1), np.stack([i + 1, j], 1), np.stack([i, j + 1], 1)], 1)[up],
            np.stack([np.stack([i + 1, j], 1), np.stack([i + 1, j + 1], 1), np.stack([i, j + 1], 1)], 1)[down]])
        u, v = steps[..., 0] / n, steps[..., 1] / n
        corners = np.stack([1 - u - v, u, v], axis=-1)   # (pieces, 3 corners, 3 weights)
        probe = np.concatenate([corners, (corners + np.roll(corners, 1, axis=1)) / 2,
                                corners.mean(axis=1, keepdims=True)], axis=1)
        keep = (_alpha(img, probe @ uv[[a, b, c]]) >= ALPHA_CUT).any(axis=1)
        bars.append(corners[keep])
        owners.append(np.full(int(keep.sum()), t, dtype=np.int64))
    return np.concatenate(bars), np.concatenate(owners), tri


def clump_paths(mesh, img, n=STRANDS, step=STRAND_STEP, seed=7, clump=None):
    """The strands every card draws, in its UV: `n` paths from the clump's root edge down through its picture, fanned
    across its opaque width as the clump fans, each ending where its column's hair ends. A path's points are UVs, each
    with its curl off the card's face (-1..1, `CURL`). `clump` how far a strand draws to its lock's middle at its tip
    (`CLUMP` by default)."""
    clump = CLUMP if clump is None else clump
    uv = np.array(mesh['uvs'], dtype=np.float64).reshape(-1, 2)
    (u0, v0), (u1, v1) = uv.min(axis=0), uv.max(axis=0)
    h, w = img.shape[:2]
    x0, x1 = int(round(u0 * w)), int(round(u1 * w))
    y0, y1 = int(round((1 - v1) * h)), int(round((1 - v0) * h))
    hair = img[y0:y1, x0:x1, 3] >= 128
    rows = [np.nonzero(r)[0] for r in hair]
    top = next(r for r, cols in enumerate(rows) if len(cols))   # the root edge: the clump's first row of hair
    rng = np.random.default_rng(seed)
    locks = max(1, n // LOCK)
    middles = [(i + rng.uniform(0.3, 0.7)) / locks for i in range(locks)]
    bottom = len(rows)
    paths = []
    for k in range(n):
        f = (k + rng.uniform(0.15, 0.85)) / n
        lock = middles[min(locks - 1, int(f * locks))]
        phase = rng.uniform(0, 2 * math.pi)
        pts = []
        for r in range(top, len(rows), step):
            if not len(rows[r]):
                break
            down = (r - top) / max(1, bottom - top)
            x = rows[r][0] + (f + (lock - f) * clump * down ** 1.2) * (rows[r][-1] - rows[r][0])
            if not hair[r, int(round(x))]:
                break   # this column's hair ends: the strand's tip
            turn = 2 * math.pi * (r - top) / WAVE_LENGTH + phase
            x = min(max(x + WAVE_ACROSS * math.sin(turn), rows[r][0]), rows[r][-1])
            pts.append((u0 + (x + 0.5) / w, v1 - (r + 0.5) / h, math.cos(turn)))
        if len(pts) >= 3:
            paths.append(np.array(pts))
    return paths


def _in_triangle(q, a, b, c):
    """The barycentric weights of UV point `q` in triangle (a, b, c), or None outside it."""
    m = np.array([[b[0] - a[0], c[0] - a[0]], [b[1] - a[1], c[1] - a[1]]])
    if abs(np.linalg.det(m)) < 1e-12:
        return None
    s, t = np.linalg.solve(m, q - a)
    if s < -1e-6 or t < -1e-6 or s + t > 1 + 1e-6:
        return None
    return np.array([1 - s - t, s, t])


def card_strands(mesh, paths):
    """Every card's strands, each point held on its card's triangle: (corners (points, 3), weights (points, 3), each
    strand's point count, each point's offset off its card's face in metres: its side and its curl). A card is a run of
    triangles sharing vertices; a strand stops where it leaves its card."""
    tri = np.array(mesh['indices'], dtype=np.int64).reshape(-1, 3)
    uv = np.array(mesh['uvs'], dtype=np.float64).reshape(-1, 2)
    root = list(range(len(uv)))

    def find(x):
        while root[x] != x:
            root[x] = root[root[x]]
            x = root[x]
        return x
    for a, b, c in tri:
        root[find(a)], root[find(c)] = find(b), find(b)
    cards = {}
    for t, (a, _, _) in enumerate(tri):
        cards.setdefault(find(a), []).append(t)
    corners, weights, sizes, offsets = [], [], [], []
    for n_card, own in enumerate(cards.values()):
        for k, path in enumerate(paths):
            held = []
            for q in path:
                hit = next(((tri[t], wt) for t in own
                            if (wt := _in_triangle(q[:2], *uv[tri[t]])) is not None), None)
                if hit is None:
                    break
                held.append((*hit, q[2]))
            if len(held) < 3:
                continue
            side = 1.0 if (k + n_card) % 2 else -1.0
            corners += [c for c, _, _ in held]
            weights += [wt for _, wt, _ in held]
            offsets += [side * (STRAND_RADIUS + CURL * (1 + curl) / 2) for _, _, curl in held]
            sizes.append(len(held))
    return np.array(corners), np.array(weights), np.array(sizes), np.array(offsets)


def ear_ramp(b):
    """Each body vertex's share of its ear's own turn: its weight on the ear's bone, times its way up the ear from the
    root (0) to the tip (1) along the bone's own long axis, so the root stays sewn to the head."""
    body = next(m for m in b['meshes'] if m['part'] == 'body')
    p = np.array(body['positions'], dtype=np.float64).reshape(-1, 3)
    j = np.array(body['joints'], dtype=np.int64).reshape(-1, 4)
    w = np.array(body['weights'], dtype=np.float64).reshape(-1, 4)
    names = [bone['name'] for bone in b['bones']]
    W = worlds(b, 'idle', 0.0)
    out = np.zeros(len(p))
    for ear in ('Ear.L', 'Ear.R'):
        i = names.index(ear)
        on = (w * (j == i)).sum(axis=1)
        h = (p - W[i][:3, 3]) @ W[i][:3, 1]   # the way up the ear's own axis
        mine = on > 0
        h0, h1 = h[mine].min(), h[mine].max()
        up = np.clip((h - h0) / max(h1 - h0, 1e-9), 0.0, 1.0)
        out += on * up * up * (3 - 2 * up)   # smoothly from the root
    return np.clip(out, 0.0, 1.0)


def _down_hits(P, T, xy):
    """Where a ray straight down from over each (x, y) of `xy` first meets the mesh (places `P`, triangles `T` of
    them): each one's triangle and its barycentric weights over that triangle's corners."""
    a, b_, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    e1, e2 = b_ - a, c - a
    d = np.array([0.0, 0.0, -1.0])
    h = np.cross(d, e2)
    det = (e1 * h).sum(axis=1)
    ok = np.abs(det) > 1e-12
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    tris, bars = [], []
    for x, y in xy:
        s = np.array([x, y, 10.0]) - a
        u = inv * (s * h).sum(axis=1)
        q = np.cross(s, e1)
        v = inv * (q @ d)
        t = inv * (e2 * q).sum(axis=1)
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0)
        if not hit.any():
            raise ValueError(f'no hide under {x:.3f}, {y:.3f}')
        k = np.nonzero(hit)[0][t[hit].argmin()]
        tris.append(k)
        bars.append((1 - u[k] - v[k], u[k], v[k]))
    return np.array(tris), np.array(bars)


def _unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


_loads = {}


def mane_load(b, gait, time, calm, at):
    """Each lock's load from its swing (m/s², the bake's frame) at `time` of `gait`: the lock a damped spring on its
    root (`SPRING`), driven by the root's motion through the stride in its steady beat. `at(S)` gives the locks' roots
    for skin matrices `S`. A lock's displacement u answers u'' + 2 z w0 u' + w0^2 u = -r'' for its root r; its load is
    w0^2 u, the pull that would hold a still lock as far out."""
    key = (gait, tuple(sorted((calm or {}).items())))
    if key not in _loads:
        D, K = b['gaits'][gait]['duration'], 48
        r = np.stack([at(skins(b, worlds(b, gait, D * k / K, None, calm))) for k in range(K)])
        R = np.fft.rfft(r, axis=0)
        w = 2 * math.pi * np.arange(R.shape[0]) / D
        w0, z = 2 * math.pi * SPRING[0], SPRING[1]
        H = w0 * w0 * w * w / (w0 * w0 - w * w + 2j * z * w0 * w)
        _loads[key] = (D, K, H[:, None, None] * R)
    D, K, F = _loads[key]
    k = np.arange(F.shape[0])
    share = np.full(len(k), 2.0)
    share[0] = 1.0
    if K % 2 == 0:
        share[-1] = 1.0
    turn = np.exp(2j * math.pi * k * time / D)
    return ((share * turn)[:, None, None] * F).real.sum(axis=0) / K


class Groom:
    """The groomed mane (`GROOM`): its strands' roots on the hide, laid out at rest, grown each frame from where the
    hide stands. A strand's root and a point a little toward the poll from it are (triangle, weights) on the body's
    welded mesh, so they ride the hide as it moves."""

    def __init__(self, b, seed=None):
        g, k_ = GROOM, LOCKS
        body = next(m for m in b['meshes'] if m['part'] == 'body')
        self.first, self.faces, _ = _weld(body)
        rest = np.array(body['positions'], dtype=np.float64).reshape(-1, 3)[self.first]
        rng = np.random.default_rng(g['seed'] if seed is None else seed)
        rows = []   # x, y, lock, length, rise, sweep, bend, depth, share, free
        y0, y1 = CREST
        room = (y1 - y0) / g['locks']
        edges = np.linspace(y0, y1, g['locks'] + 1)
        edges[1:-1] += rng.uniform(-k_['width'], k_['width'], g['locks'] - 1) * room / 2   # locks uneven
        for i in range(g['locks']):
            s = (i + 0.5) / g['locks']   # the way from the withers to the poll
            w, p = k_['profile']
            length = g['length'] * ((1 - s) * w + s * p + (1 - (w + p) / 2) * math.sin(math.pi * s)) * \
                rng.uniform(0.88, 1.12)
            rise, sweep = g['rise'] + rng.uniform(-8, 8), rng.uniform(-10, 10)
            bend = g['bend'] * rng.uniform(0.85, 1.15)
            for j in range(g['per_lock']):
                u = (j + rng.uniform(0.1, 0.9)) / g['per_lock']
                x = k_['root'][0] + k_['root'][1] * math.sin(math.pi * u) * rng.uniform(0.7, 1.0)   # a scallop
                free = rng.uniform() < k_['flyaway']
                rows.append((x, edges[i] + u * (edges[i + 1] - edges[i]), i,
                             length * rng.uniform(0.9, 1.05), rise + rng.uniform(-4, 4),
                             sweep + rng.uniform(-k_['cross'], k_['cross']), bend * (0.8 if free else 1.0),
                             rng.uniform(), 0.6 if free else 1.0, free))
        locks, f_ = g['locks'], FORELOCK
        for j in range(f_['strands']):
            x = f_['middle'] + rng.uniform(-f_['width'], f_['width'])
            rows.append((x, rng.uniform(*POLL), locks + min(3, int((x - f_['middle'] + f_['width']) / f_['width'] * 2)),
                         f_['length'] * rng.uniform(0.8, 1.1), rng.uniform(*f_['rise']), 0.0, g['bend'],
                         rng.uniform(), 1.0, False))
        a = np.array(rows, dtype=object)
        xy = np.array(a[:, :2], dtype=np.float64)
        self.lock = np.array(a[:, 2], dtype=np.int64)
        self.forelock = self.lock >= locks
        self.length, self.rise, self.sweep, self.bend, self.depth, self.share = \
            (np.array(a[:, k], dtype=np.float64) for k in range(3, 9))
        self.free = np.array(a[:, 9], dtype=bool)
        self.share = np.where(self.depth < k_['base'][0], k_['base'][1], self.share)   # the base: thick, deep, loose
        self.phase = rng.uniform(0, 2 * math.pi, len(rows))
        f_ = FORELOCK   # each forelock strand fanned toward its own side of the tuft
        self.fan = np.where(self.forelock, -(xy[:, 0] - f_['middle']) / f_['width'] * f_['fan'], 0.0)
        self.root = _down_hits(rest, self.faces, xy)
        self.ahead = _down_hits(rest, self.faces, xy + np.array([0.0, 0.03]))
        heads = [np.nonzero(self.lock == k)[0][0] for k in range(self.lock.max() + 1)]
        self.lock_root = (self.root[0][heads], self.root[1][heads])
        # the hide near the mane, which the strands lie on, and each place's way out of the body
        self.near = np.nonzero((rest[:, 1] > CREST[0] - 0.25) & (rest[:, 2] > 1.25))[0]
        n = self._normals(rest)
        self.out = 1.0 if n[self.near][:, 2].mean() > 0 else -1.0

    def _normals(self, P):
        f = self.faces
        fn = np.cross(P[f[:, 1]] - P[f[:, 0]], P[f[:, 2]] - P[f[:, 0]])
        n = np.zeros_like(P)
        for k in range(3):
            np.add.at(n, f[:, k], fn)
        return _unit(n)

    def _at(self, P, where):
        tri, bars = where
        return np.einsum('nk,nkd->nd', bars, P[self.faces[tri]])

    def roots(self, body):
        """The locks' roots for a posed body (each bake vertex placed)."""
        return self._at(body[self.first], self.lock_root)

    def grow(self, body, load):
        """Every strand's points (strands, segments + 1, 3) on the posed `body`, each lock under its load (`load`,
        m/s² a lock: gravity, its swing and the air together)."""
        from scipy.spatial import cKDTree
        g = GROOM
        P = body[self.first]
        N = self._normals(P) * self.out
        near = self.near
        tree = cKDTree(P[near])
        r, ahead = self._at(P, self.root), self._at(P, self.ahead)
        tri = self.faces[self.root[0]]
        n = _unit(np.cross(P[tri[:, 1]] - P[tri[:, 0]], P[tri[:, 2]] - P[tri[:, 0]])) * self.out
        t = _unit(ahead - r)
        left = _unit(np.cross(n, t))
        side = np.where(self.forelock[:, None], _unit(t + self.fan[:, None] * left), left)   # the forelock ahead
        rise = np.radians(self.rise)[:, None]
        d = _unit(np.cos(rise) * n + np.sin(rise) * side - np.tan(np.radians(self.sweep))[:, None] * t)
        pull = load[self.lock] / GRAVITY
        across = ~self.forelock[:, None]   # the forelock falls forward over the brow, along its own way
        pull = pull - across * (1.0 - g['along']) * (pull * t).sum(axis=1, keepdims=True) * t
        down = np.where(self.forelock, FORELOCK['lie_down'], g['lie_down'])[:, None]
        pull = pull + g['lie'] * _unit(side - down * n)
        seg = (self.length / g['segments'])[:, None]
        want = 0.002 + self.depth * g['mass']
        p = r + n * 0.001
        pts = [p]
        for _ in range(g['segments']):
            d = _unit(d + self.bend[:, None] * pull)
            q = p + seg * d
            dist, idx = tree.query(q, k=4)
            idx = near[idx]
            w = 1.0 / (dist + 1e-3) ** 2
            w /= w.sum(axis=1, keepdims=True)
            off = (w * ((q[:, None, :] - P[idx]) * N[idx]).sum(axis=2)).sum(axis=1)
            nq = _unit((w[..., None] * N[idx]).sum(axis=1))
            q = q + np.maximum(want - off, 0.0)[:, None] * nq   # the hide holds it, at its depth in the mane
            d = _unit(q - p)
            pts.append(q)
            p = q
        pts = np.stack(pts, axis=1)
        down = (np.arange(g['segments'] + 1) / g['segments']) ** 1.2
        way = np.cumsum(np.r_[0.0, np.ones(g['segments'])]) * seg   # metres along each strand
        pts += (WAVE[0] * down * np.sin(2 * np.pi * way / WAVE[1] + self.phase[:, None]))[..., None] * n[:, None, :]
        for k in range(self.lock.max() + 1):   # a lock's strands drawn together toward their tips, the top ones most
            mine = (self.lock == k) & ~self.free
            if mine.sum() > 1:
                middle = pts[mine].mean(axis=0)
                pts[mine] += (LOCKS['clump'] * self.depth[mine])[:, None, None] * down[None, :, None] * \
                    (middle[None] - pts[mine])
        return pts


class Courser:
    """The horse as Blender meshes, its body and its cards, each in its own textured material, and the strands of its
    mane and tail laid on the cards (`strand_radius` metres round: about a pixel at the view it is drawn for). `pose`
    lays a gait's frame on them, turned as the view turns the body."""

    def __init__(self, strand_radius=STRAND_RADIUS, tack_height=None, reins=True, harness=False, groomed=False,
                 coat=None, team=False, seed=None, locks=None, horn=False, looks=(), keep=None):
        """`tack_height`: the horse wears its tack (tack.py), the stirrups and reins hung for a rider of that height
        (1 the measured biped); None, bare. `reins` off leaves the reins to the hands that hold them (fpreins.py).
        `harness` puts the Small Cart's driving harness on as well (tack.py `all_pieces`). `groomed`: the mane grown
        on the neck for the eye up close (`Groom`), and no cards, so no tail. `coat`: the hide's own shine and sampling
        for a near view ({'roughness', 'specular', 'filter'}), the sprites' by default. `team`: a pole team's harness
        in place of the riding tack (tack.py `all_pieces`). `seed`: the groomed mane's own (a pair's manes differ).
        `locks`: the cards' strands as locks for the sprites ({'strands', 'radius', 'clump'}, `SPRITE_LOCKS`), where a
        lone strand is a speck. `horn`: each hoof below the crown in dark horn (`HORN`), as the sprites draw it.
        `looks`: the shop's mount looks whose own pieces it carries (barding.py), each hidden until shown; `keep`
        says which of their pieces it carries (all by default)."""
        import bpy
        b = bake()
        self.strand_radius = strand_radius
        self.groom = Groom(b, seed) if groomed else None
        self.parts = {}
        for mesh in b['meshes']:
            part = mesh['part']
            if groomed and mesh['alpha']:
                continue
            mat = self._material(MATERIAL_OF[part], PICTURES[mesh['texture']], mesh['alpha'], coat,
                                 horn=horn and not mesh['alpha'])
            if mesh['alpha']:
                img = _rgba(PICTURES[mesh['texture']])
                bars, owners, tri = cut_cards(mesh, img)
                uv = np.array(mesh['uvs'], dtype=np.float64).reshape(-1, 2)
                corner_uv = np.einsum('pkc,pcd->pkd', bars, uv[tri[owners]])
                faces = np.arange(len(bars) * 3).reshape(-1, 3)
                place = ('cards', bars, tri[owners])
                count = len(bars) * 3
            else:
                first, faces, corner_uv = _weld(mesh)
                place = ('welded', first)
                count = len(first)
            me = bpy.data.meshes.new(f'horse_{part}')
            me.from_pydata([(0.0, 0.0, 0.0)] * count, [], faces.tolist())
            layer = me.uv_layers.new(name='UVMap')
            layer.data.foreach_set('uv', corner_uv.reshape(-1).astype(np.float32))
            me.materials.append(mat)
            for poly in me.polygons:
                poly.use_smooth = not mesh['alpha']
            if place[0] == 'welded':   # where each point lies at rest and its way up an ear, for the fur (`COAT`)
                rest = np.array(mesh['positions'], dtype=np.float64).reshape(-1, 3)[place[1]]
                me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT').data.foreach_set(
                    'vector', rest.astype(np.float32).ravel())
                me.attributes.new('ear_up', 'FLOAT', 'POINT').data.foreach_set(
                    'value', ear_ramp(b)[place[1]].astype(np.float32))
            ob = bpy.data.objects.new(f'horse_{part}', me)
            bpy.context.scene.collection.objects.link(ob)
            self.parts[part] = (ob, mesh, place)
        self.objects = [ob for ob, _, _ in self.parts.values()]
        if groomed:
            g = self.groom
            self.strand_ob = self._strand_object(np.full(len(g.lock), GROOM['segments'] + 1), GROOM['radius'],
                                                 g.share, {**HAIR, **GROOM_HAIR})
        else:
            cards = next(m for m in b['meshes'] if m['alpha'])
            lk = locks or {}
            self.strands = card_strands(cards, clump_paths(cards, _rgba(PICTURES[cards['texture']]),
                                                           n=lk.get('strands', STRANDS), clump=lk.get('clump')))
            if not len(self.strands[2]):
                raise ValueError('the mane\'s cards hold no strand')
            self.strand_ob = self._strand_object(self.strands[2], lk.get('radius', strand_radius),
                                                 hair={**HAIR, **lk['hair']} if 'hair' in lk else None)
        self.objects.append(self.strand_ob)
        self.ear_ramp = ear_ramp(b)
        self.tack = []
        if tack_height is not None:
            import tack
            for pc in tack.all_pieces(tack_height, reins, harness, team):
                me = bpy.data.meshes.new(f'tack_{pc['name']}')
                me.from_pydata(pc['positions'].tolist(), [], pc['triangles'].tolist())
                me.materials.append(_tack_material(pc['material']))
                smooth = pc['material'] in ('cloth', 'seat')
                for poly in me.polygons:
                    poly.use_smooth = smooth
                ob = bpy.data.objects.new(f'tack_{pc['name']}', me)
                bpy.context.scene.collection.objects.link(ob)
                self.tack.append((ob, pc))
            self.objects += [ob for ob, _ in self.tack]
        self.looks = {}
        for look in looks:   # each mount look's own pieces (barding.py), hidden until its layer shows them
            import barding
            made = []
            for pc in barding.pieces(look):
                if keep is not None and not keep(pc):
                    continue
                me = bpy.data.meshes.new(f'look_{look}_{pc['name']}')
                me.from_pydata(pc['positions'].tolist(), [], pc['triangles'].tolist())
                uv = barding.swatch_uv(pc['material'], pc['v'])
                layer = me.uv_layers.new(name='UVMap')
                layer.data.foreach_set('uv', uv[pc['triangles'].ravel()].astype(np.float32).ravel())
                me.materials.append(_look_material(pc['material']))
                for poly in me.polygons:
                    poly.use_smooth = not barding.SWATCHES[pc['material']][3]
                ob = bpy.data.objects.new(f'look_{look}_{pc['name']}', me)
                bpy.context.scene.collection.objects.link(ob)
                ob.hide_render = True
                made.append((ob, pc))
            self.looks[look] = made

    def look_objects(self, look):
        """Mount look `look`'s own objects."""
        return [ob for ob, _ in self.looks.get(look, ())]

    @staticmethod
    def _material(name, picture, alpha, coat=None, horn=False):
        import bpy
        coat = {**COAT, **(coat or {})}
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes['Principled BSDF']
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(picture, check_existing=True)
        tex.interpolation = CARD_FILTER if alpha else coat['filter']
        if not alpha and coat.get('fur'):   # flecks of fur on the ears, fixed on the hide whatever the pose, and
            amp, scale, tip, root = coat['fur']   # each ear lighter toward its tip, as Daggerfall paints them
            rest = nt.nodes.new('ShaderNodeAttribute')
            rest.attribute_name = 'rest'
            noise = nt.nodes.new('ShaderNodeTexNoise')
            noise.inputs['Scale'].default_value = scale
            noise.inputs['Detail'].default_value = 1.0
            nt.links.new(rest.outputs['Vector'], noise.inputs['Vector'])
            fleck = nt.nodes.new('ShaderNodeMapRange')
            fleck.inputs['From Min'].default_value, fleck.inputs['From Max'].default_value = 0.3, 0.7
            fleck.inputs['To Min'].default_value, fleck.inputs['To Max'].default_value = 1.0 - amp, 1.0 + amp
            nt.links.new(noise.outputs['Fac'], fleck.inputs['Value'])
            up = nt.nodes.new('ShaderNodeAttribute')
            up.attribute_name = 'ear_up'
            lit = nt.nodes.new('ShaderNodeMath')
            lit.operation = 'MULTIPLY_ADD'   # 1 at the root, 1 + tip at the tip
            nt.links.new(up.outputs['Fac'], lit.inputs[0])
            lit.inputs[1].default_value, lit.inputs[2].default_value = tip, 1.0
            ear_light = nt.nodes.new('ShaderNodeMath')
            ear_light.operation = 'MULTIPLY'
            nt.links.new(fleck.outputs['Result'], ear_light.inputs[0])
            nt.links.new(lit.outputs['Value'], ear_light.inputs[1])
            ear_proper = nt.nodes.new('ShaderNodeMapRange')   # the ear above its root: its skin runs onto the poll
            ear_proper.inputs['From Min'].default_value, ear_proper.inputs['From Max'].default_value = root, root + 0.25
            nt.links.new(up.outputs['Fac'], ear_proper.inputs['Value'])
            on = nt.nodes.new('ShaderNodeMix')
            on.data_type = 'FLOAT'
            nt.links.new(ear_proper.outputs['Result'], on.inputs['Factor'])
            on.inputs['A'].default_value = 1.0
            nt.links.new(ear_light.outputs['Value'], on.inputs['B'])
            fur = nt.nodes.new('ShaderNodeVectorMath')
            fur.operation = 'SCALE'
            nt.links.new(tex.outputs['Color'], fur.inputs[0])
            nt.links.new(on.outputs['Result'], fur.inputs['Scale'])
            nt.links.new(fur.outputs[0], bsdf.inputs['Base Color'])
        elif alpha:   # the cards under the strands, darkened (`CARD_SHADE`)
            shade = nt.nodes.new('ShaderNodeVectorMath')
            shade.operation = 'SCALE'
            shade.inputs['Scale'].default_value = CARD_SHADE
            nt.links.new(tex.outputs['Color'], shade.inputs[0])
            nt.links.new(shade.outputs[0], bsdf.inputs['Base Color'])
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
        else:
            nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if horn:   # below the crown the hoof's horn, dark and dull, in place of the picture's grey-white noise
            rest = nt.nodes.new('ShaderNodeAttribute')
            rest.attribute_name = 'rest'
            xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
            nt.links.new(rest.outputs['Vector'], xyz.inputs[0])
            under = nt.nodes.new('ShaderNodeMath')
            under.operation = 'LESS_THAN'
            nt.links.new(xyz.outputs['Z'], under.inputs[0])
            under.inputs[1].default_value = HORN['crown']
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            nt.links.new(under.outputs['Value'], mix.inputs['Factor'])
            was = bsdf.inputs['Base Color'].links[0].from_socket
            nt.links.new(was, mix.inputs['A'])
            mix.inputs['B'].default_value = (*HORN['colour'], 1.0)
            nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
            rough = nt.nodes.new('ShaderNodeMix')
            rough.data_type = 'FLOAT'
            nt.links.new(under.outputs['Value'], rough.inputs['Factor'])
            rough.inputs['A'].default_value = coat['roughness']
            rough.inputs['B'].default_value = HORN['roughness']
            nt.links.new(rough.outputs['Result'], bsdf.inputs['Roughness'])
        bsdf.inputs['Roughness'].default_value = 0.7 if alpha else coat['roughness']
        bsdf.inputs['Specular IOR Level'].default_value = 0.25 if alpha else coat['specular']
        return m

    @staticmethod
    def _strand_object(sizes, radius, share=None, hair=None):
        """The strands as hair curves in the hair shader (`hair`, `HAIR` by default): black, a glint along each strand
        where the light catches it, a few strands browner or greyer than the rest. `share` each strand's root radius, a
        share of `radius`."""
        import bpy
        c = bpy.data.hair_curves.new('horse_strands')
        c.add_curves(sizes.tolist())
        r = c.attributes.get('radius') or c.attributes.new('radius', 'FLOAT', 'POINT')
        share = np.ones(len(sizes)) if share is None else share
        taper = np.concatenate([np.linspace(1.0, 0.35, n) * s for n, s in zip(sizes, share)])   # thinning to its tip
        r.data.foreach_set('value', (taper * radius).astype(np.float32))
        m = bpy.data.materials.new(STRAND_MATERIAL)
        m.use_nodes = True
        nt = m.node_tree
        out = nt.nodes['Material Output']
        nt.nodes.remove(nt.nodes['Principled BSDF'])
        hair = nt.nodes.new('ShaderNodeBsdfHairPrincipled')
        hair.parametrization = 'MELANIN'
        for name, value in (hair or HAIR).items():
            hair.inputs[name].default_value = value
        nt.links.new(hair.outputs[0], out.inputs['Surface'])
        c.materials.append(m)
        ob = bpy.data.objects.new('horse_strands', c)
        bpy.context.scene.collection.objects.link(ob)
        return ob

    def pose(self, gait, time, yaw=0.0, extra=None, calm=None):
        """Lay `gait` at `time` seconds on the meshes, in the forge's world at view turn `yaw`, its bones turned further
        by `extra` and calmed by `calm` (`worlds`). An ear's own turn fades from nothing at its root to the whole at its
        tip (`ear_ramp`), so the hide round its root stays on the head. A groomed mane grows where the hide stands,
        under gravity, its swing (`mane_load`) and the pace's air (`AIR`)."""
        b = bake()
        S = skins(b, worlds(b, gait, time, extra, calm))
        R = turned(yaw)
        # an ear flicked alone leaves the hair where it lies: the forelock's cards hang partly on the ears' bones, and
        # the groomed mane grows on the hide as the gait holds the ears
        still = {bone: turns for bone, turns in (extra or {}).items() if not bone.startswith('Ear')}
        S_hair = skins(b, worlds(b, gait, time, still, calm)) if extra else S
        body = rest = posed(self.parts['body'][1], S)
        if any(bone.startswith('Ear') for bone in (extra or {})):
            rest = posed(self.parts['body'][1], S_hair)   # the ears as the gait holds them
            body = rest + self.ear_ramp[:, None] * (body - rest)
        p_hair = None
        if self.groom:
            mesh = self.parts['body'][1]
            load = mane_load(b, gait, time, calm, lambda S_: self.groom.roots(posed(mesh, S_)))
            load = load + np.array([0.0, -AIR.get(gait, 0.0), -GRAVITY])
            at = self.groom.grow(rest, load).reshape(-1, 3) @ R.T
        else:
            cards = next(m for m in b['meshes'] if m['alpha'])
            p_hair = posed(cards, S_hair)
            p = p_hair @ R.T
            corners, weights, _, offsets = self.strands
            at = np.einsum('pk,pkd->pd', weights, p[corners])
            normal = np.cross(p[corners[:, 1]] - p[corners[:, 0]], p[corners[:, 2]] - p[corners[:, 0]])
            normal /= np.maximum(np.linalg.norm(normal, axis=1, keepdims=True), 1e-9)
            at += normal * offsets[:, None]   # a strand on either face of its card, curling off it
        self.strand_ob.data.position_data.foreach_set('vector', at.astype(np.float32).ravel())
        self.strand_ob.data.update_tag()
        for ob, pc in [*self.tack, *(x for made in self.looks.values() for x in made)]:   # on the bones under it
            co = posed(pc, S) @ R.T
            ob.data.vertices.foreach_set('co', co.astype(np.float32).ravel())
            ob.data.update()
        for name, (ob, mesh, place) in self.parts.items():
            p = (body if name == 'body' else p_hair) @ R.T
            if place[0] == 'welded':
                co = p[place[1]]
            else:
                _, bars, corners = place
                co = np.einsum('pk,pkd->pd', bars.reshape(-1, 3), p[np.repeat(corners, 3, axis=0)]) \
                    .reshape(-1, 3)
            ob.data.vertices.foreach_set('co', co.astype(np.float32).ravel())
            ob.data.update()

    def show(self, on):
        for ob in self.objects:
            ob.hide_render = not on

    def mane_where(self, shot, render, samples=MASK_SAMPLES):
        """Each texel's part of `shot` (rendered as the horse stands): 2 where the mane shows with the coat and the
        tack held out, 3 where the tack shows with the coat and the mane held out, 1 where the coat shows, 0
        elsewhere. `render` renders the scene; the parts are held out for it, in `samples`."""
        mane = self._showing(render, samples, held=['body', *TACK])
        tack_on = self._showing(render, samples, held=['body', 'hair', 'strands']) if self.tack else mane & False
        on = shot[..., 3] > 0
        return np.where(on & tack_on, 3, np.where(on & mane, 2, np.where(on, 1, 0)))

    def _datas(self, names):
        """The mesh and curve data of the parts `names` (body, hair, strands, and TACK for every piece of it)."""
        out = [self.parts[n][0].data for n in names if n in self.parts]
        if 'strands' in names:
            out.append(self.strand_ob.data)
        if TACK[0] in names:
            out += [ob.data for ob, _ in self.tack]
        return out

    def _showing(self, render, samples, held):
        """Where anything shows with the parts `held` held out: a mask."""
        import bpy
        datas = self._datas(held)
        own = [d.materials[0] for d in datas]
        sc = bpy.context.scene
        was = sc.cycles.samples
        for d in datas:
            d.materials[0] = _holdout()
        sc.cycles.samples = samples
        try:
            return render()[..., 3] > 0
        finally:
            for d, m in zip(datas, own):
                d.materials[0] = m
            sc.cycles.samples = was


    def coat_texels(self, coat, render):
        """Which coat texel each pixel of a frame shows: (h, w, 2) uint8 (its column and its row in the coat's picture,
        top row first), every texel of `coat` (the frame's coat pixels, `mane_where`) filled from the nearest one the
        pass found. `render` renders the scene; for it the coat glows its own texel's address, the mane is held out
        and the colour is left raw, so the numbers come through as they are."""
        import bpy
        from scipy import ndimage
        sc = bpy.context.scene
        body = self.parts['body'][0].data
        others = self._datas(['hair', 'strands', *TACK])
        own = [body.materials[0]] + [d.materials[0] for d in others]
        was = (sc.cycles.samples, sc.view_settings.view_transform)
        body.materials[0] = _texel_address(PICTURES['body'])
        for d in others:
            d.materials[0] = _holdout()
        sc.cycles.samples, sc.view_settings.view_transform = 1, 'Raw'
        try:
            shot = render()
        finally:
            for d, m in zip([body, *others], own):
                d.materials[0] = m
            sc.cycles.samples, sc.view_settings.view_transform = was
        found = shot[..., 3] > 0
        if not found.any():
            return np.zeros(shot.shape[:2] + (2,), np.uint8)
        _, (iy, ix) = ndimage.distance_transform_edt(~found, return_indices=True)
        address = shot[iy, ix, :2]   # every pixel takes the nearest found texel's address
        return np.where(coat[..., None], address, 0).astype(np.uint8)

    def _swap(self, pairs):
        """Each (data, material) laid on; answers what to put back."""
        was = [(d, d.materials[0]) for d, _ in pairs]
        for d, m in pairs:
            d.materials[0] = m
        return was

    def texel_kinds(self, shot, render):
        """What each pixel of a frame of the horse (`shot`, rendered as the horse stands) shows: (h, w, 4) uint8, its
        hide texel in red and green (the body's picture's column and row, top row first), its part (`KIND`) in blue,
        255 in alpha where `shot` draws. A pixel the pass missed (a softened edge, a strand finer than its one ray)
        takes its nearest found neighbour's. `render` renders the scene; for it every part glows its numbers raw."""
        import bpy
        from scipy import ndimage
        sc = bpy.context.scene
        pairs = [(self.parts['body'][0].data, _texel_address(PICTURES['body']))]
        if 'hair' in self.parts:
            pairs.append((self.parts['hair'][0].data, _kind_glow('hair', KIND['hair'], PICTURES['hair'])))
        pairs.append((self.strand_ob.data, _kind_glow('strands', KIND['hair'])))
        for ob, pc in self.tack:
            kind = TACK_KIND.get(pc['material'], 'leather')
            pairs.append((ob.data, _kind_glow(kind, KIND[kind])))
        was = self._swap(pairs)
        settings = (sc.cycles.samples, sc.view_settings.view_transform, sc.render.dither_intensity)
        # one ray a pixel, and no dither: the numbers come through as they are, never a step off
        sc.cycles.samples, sc.view_settings.view_transform, sc.render.dither_intensity = 1, 'Raw', 0.0
        try:
            got = render()
        finally:
            self._swap(was)
            sc.cycles.samples, sc.view_settings.view_transform, sc.render.dither_intensity = settings
        on = shot[..., 3] > 0
        found = (got[..., 3] > 0) & (got[..., 2] >= KIND_STEP // 2)   # a card's clear edge glows under half a step
        out = np.zeros(shot.shape[:2] + (4,), np.uint8)
        if not found.any():
            return out
        _, (iy, ix) = ndimage.distance_transform_edt(~found, return_indices=True)
        out[..., :3] = got[iy, ix, :3]
        out[..., 2] = np.round(out[..., 2] / KIND_STEP)   # a part glows KIND_STEP apart, read back to its number
        out[..., 3] = 255
        out[~on] = 0
        return out

    def held_out(self, on):
        """The horse itself (its body, mane, strands and tack) held out of the render, or put back: a look's layer
        shows only its own pieces where they stand in front of the horse."""
        if on:
            datas = self._datas(['body', 'hair', 'strands', *TACK])
            self._held = self._swap([(d, _holdout()) for d in datas])
        elif getattr(self, '_held', None):
            self._swap(self._held)
            self._held = None


def _kind_glow(name, kind, cut=None):
    """A material that glows (0, 0, kind) raw: what `Courser.texel_kinds` reads a part by. `cut` an alpha picture: the
    material is clear where its alpha is under ALPHA_CUT (a card between its strands)."""
    import bpy
    key = f'kind_{name}'
    m = bpy.data.materials.get(key)
    if m is not None:
        return m
    m = bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    glow = nt.nodes.new('ShaderNodeEmission')
    glow.inputs['Color'].default_value = (0.0, 0.0, kind * KIND_STEP / 255.0, 1.0)
    out = nt.nodes['Material Output'].inputs['Surface']
    if cut is None:
        nt.links.new(glow.outputs[0], out)
        return m
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(cut, check_existing=True)
    tex.interpolation = CARD_FILTER
    over = nt.nodes.new('ShaderNodeMath')
    over.operation = 'GREATER_THAN'
    nt.links.new(tex.outputs['Alpha'], over.inputs[0])
    over.inputs[1].default_value = ALPHA_CUT
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(over.outputs['Value'], mix.inputs['Fac'])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(glow.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out)
    return m


def _texel_address(picture):
    """A material that glows, at each point of the coat, the address of the coat texel there: its column in red and
    its row (top row first) in green, each 0..255 over a 256-texel picture, never filtered; its part (`KIND`) in blue."""
    import bpy
    m = bpy.data.materials.get('texel_address')
    if m is not None:
        return m
    img = bpy.data.images.load(picture, check_existing=True)
    w, h = img.size
    if (w, h) != (256, 256):
        raise ValueError(f'the coat is {w} x {h}: a texel address takes a byte a side, 256 at most')
    cols, rows = np.meshgrid(np.arange(w), np.arange(h)[::-1])   # Blender's rows run from the foot up
    px = np.stack([cols / 255.0, rows / 255.0, np.full(cols.shape, KIND['hide'] * KIND_STEP / 255.0), np.ones_like(cols, dtype=float)],
                  axis=-1)
    address = bpy.data.images.new('texel_address', w, h, float_buffer=True)
    address.colorspace_settings.name = 'Non-Color'
    address.pixels.foreach_set(px.astype(np.float32).ravel())
    m = bpy.data.materials.new('texel_address')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = address
    tex.interpolation = 'Closest'
    glow = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(tex.outputs['Color'], glow.inputs['Color'])
    nt.links.new(glow.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


TACK = ('tack',)   # the name `_datas` reads as every piece of the tack
# what a horse pixel shows, the texel strip's blue (forgeLayers.js HORSE_KIND): the hide (its texel in red and green),
# the mane and tail, the tack's leather, its cloth, its metal
KIND = {'hide': 1, 'hair': 2, 'leather': 3, 'cloth': 4, 'metal': 5}
KIND_STEP = 40   # how far apart the parts glow in the pass, so a step's error never reads as another part
TACK_KIND = {'strap': 'leather', 'seat': 'leather', 'cloth': 'cloth', 'iron': 'metal', 'trim': 'metal'}
# the hooves' horn below the crown (horseModel.js horseHide: the coronet, 8.75 cm up), its colour linear
HORN = {'crown': 0.0875, 'colour': (0.018, 0.014, 0.012), 'roughness': 0.6}
# the mane and tail as the sprites draw them: locks a pixel or two round, a few dozen a card, each a dark mass with a
# soft sheen along it, not single strands that glint as grey specks
SPRITE_LOCKS = {'strands': 36, 'radius': 0.011, 'clump': 0.9,
                'hair': {'Roughness': 0.38, 'Radial Roughness': 0.75, 'Random Color': 0.1, 'Random Roughness': 0.15}}


def _look_material(name):
    """A mount look's swatch (barding.py SWATCHES): its stripe of the swatches' picture by the piece's UV, a metal or a
    hide's sheen, and its glow, the stripe's colour by how much it glows."""
    import bpy
    import barding
    m = bpy.data.materials.get(f'look{name}')
    if m is not None:
        return m
    picture = os.path.join(ASSETS, 'barding.png')
    root, tip, glow, metal = barding.SWATCHES[name]
    m = bpy.data.materials.new(f'look{name}')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(picture, check_existing=True)
    tex.image.alpha_mode = 'CHANNEL_PACKED'   # its alpha is the glow's code (barding.py), never a coverage
    tex.interpolation = 'Linear'
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Metallic'].default_value = 0.85 if metal else 0.0
    b.inputs['Roughness'].default_value = 0.32 if metal else 0.6
    if glow:
        nt.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = 1.6 * glow   # bright, but never past white
    return m


def _tack_material(name):
    """A tack material, its colour the swatch's (tack.py SWATCHES): leather, its seat darker, iron, cloth, brass."""
    import bpy
    import metals
    m = bpy.data.materials.get(f'tack{name}')
    if m is not None:
        return m
    import tack
    rgb = metals._linear(tack.SWATCHES[name])
    m = bpy.data.materials.new(f'tack{name}')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    metal = name in ('iron', 'trim')
    b.inputs['Metallic'].default_value = 0.9 if metal else 0.0
    b.inputs['Roughness'].default_value = 0.35 if metal else 0.85 if name == 'cloth' else 0.5
    b.inputs['Specular IOR Level'].default_value = 0.5 if metal else 0.35
    return m


def _holdout():
    """A material that hides what wears it and what lies behind it: the coat, held out to find the mane."""
    import bpy
    m = bpy.data.materials.get('held_out')
    if m is None:
        m = bpy.data.materials.new('held_out')
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.remove(nt.nodes['Principled BSDF'])
        nt.links.new(nt.nodes.new('ShaderNodeHoldout').outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


def fit_grade(parts, ref, names):
    """A grade (forge.py `grade_frame`'s 'rgb'): each part's channels at the reference's shares in ungraded frames,
    against the reference's hide and mane. `parts`: [(shot, each texel's part)], `names` the coat's and the mane's."""
    at = ref['at']
    grade = {}
    for k, (name, theirs) in enumerate(zip(names, (ref['hide'], ref['mane'])), 1):
        mine = np.concatenate([shot[ids == k][:, :3] for shot, ids in parts])
        rows = []
        for c in range(3):
            src = np.percentile(mine[:, c], at) + np.arange(len(at)) * 1e-3   # strictly rising, as interpolation needs
            rows.append([src.round(3).tolist(), list(theirs[c])])
        grade[name] = {'rgb': rows}
    return grade


def _rgba(path):
    """A picture's texels as (h, w, 4) uint8, top row first, read by Blender as the render reads it."""
    import bpy
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    return np.clip(np.round(px * 255), 0, 255).astype(np.uint8)
