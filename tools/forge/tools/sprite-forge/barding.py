"""The shop's mount looks as geometry on the Courser: each look's own pieces, cut from the body's own surface as the
tack is (tack.py) and skinned to the hide under them, so they ride every stride the hide rides. The forge wears them
(horse.py `Courser.look_objects`), each look a layer of its own under a rider (riding.py `LOOK_LAYERS`); `--bake`
writes them for the game's 3D horse (barding_bake.py).

- warhorse: Daedric plate in black over a red glow that shows through its seams, blades up the crest and down the
  croup, a chanfron with a blade and swept horns, a spiked peytral, embers at the hooves.
- automaton: Dwemer brass plates, rivets, collars up the neck, a comb of fins, a faceplate with lenses, a gear on each
  shoulder, pistons, joint rings, a tail of segments, a blue glow between the plates and in its cores.
- spectral: long wisps streaming back off the crest and the tail, mist off the hooves.
- dawnfire: a gilded sunburst on the brow, a plume of flame between the ears, a mane and tail of tall flames in two
  ranks, fire off every hoof.
- drowned: the Drowned Vale's: rusted plates crusted with barnacles, weed hanging off them and off the tail, red
  crystal grown up through the mane.

A piece's UV points into the swatches (`SWATCHES`): u its stripe, v along the piece (a flame's root to its tip). The
picture's alpha says how much a texel glows (255 none, 0 all), which the game's character pass and the forge both
read. Pure: numpy alone."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import horse  # noqa: E402
import tack  # noqa: E402

LOOKS = ('warhorse', 'spectral', 'dawnfire', 'automaton', 'drowned')
# each swatch: its colour at a piece's root and at its tip (sRGB), how much it glows (0..1) and whether it is metal
SWATCHES = {
    'daedric': ((30, 22, 26), (30, 22, 26), 0.0, True),
    'daedricrim': ((70, 30, 30), (70, 30, 30), 0.0, True),
    'ember': ((170, 18, 6), (240, 64, 20), 0.65, False),
    'brass': ((178, 128, 58), (178, 128, 58), 0.0, True),
    'bronze': ((104, 70, 38), (104, 70, 38), 0.0, True),
    'rivet': ((222, 186, 104), (222, 186, 104), 0.0, True),
    'aether': ((40, 150, 255), (150, 230, 255), 0.9, False),
    'wisp': ((110, 170, 230), (200, 236, 255), 0.6, False),
    'flame': ((210, 60, 8), (255, 236, 150), 0.95, False),
    'gilt': ((214, 160, 48), (255, 226, 120), 0.35, True),
    'rust': ((62, 44, 34), (62, 44, 34), 0.0, False),
    'barnacle': ((112, 108, 96), (150, 144, 128), 0.0, False),
    'weed': ((18, 44, 30), (64, 104, 60), 0.0, False),
    'crystal': ((128, 12, 22), (255, 120, 120), 0.7, False),
}
STRIPE = (16, 32)   # a stripe's width and height in the picture
LIFT = 0.006


def body():
    return tack.body_mesh()


def skin_near(pos):
    """Each point's bones and weights: the body vertex nearest it, its own four, so a plate bends as the hide does."""
    b = horse.bake()
    m = next(x for x in b['meshes'] if x['part'] == 'body')
    p = np.array(m['positions'], dtype=np.float64).reshape(-1, 3)
    j = np.array(m['joints'], dtype=np.int64).reshape(-1, 4)
    w = np.array(m['weights'], dtype=np.float64).reshape(-1, 4)
    near = np.argmin(((pos[:, None, :] - p[None, :, :]) ** 2).sum(axis=2), axis=1)
    return j[near], w[near]


def part(name, material, pos, tris, v=None):
    """A piece skinned to the hide under it, `v` each point's place along it (0 its root, 1 its tip)."""
    pos = np.asarray(pos, dtype=np.float64)
    j, w = skin_near(pos)
    pc = tack.piece(name, material, pos, tris, j, w)
    pc['v'] = np.zeros(len(pos)) if v is None else np.asarray(v, dtype=np.float64)
    return pc


def shell_rows(origins, normals, pick, lift, k=13, keep=None):
    """Rows over the body, one a cross-section through each origin square to its normal: the section's points `pick`
    keeps (a function of the chain's points, answering a mask), resampled to `k`, lifted `lift` off the hide. Gives
    (points, outward normals) a row."""
    p, t, n = body()
    rows, nrms = [], []
    for o, nv in zip(origins, normals):
        chains = tack.section(p, t, n, np.asarray(o, dtype=np.float64), nv, keep)
        if not chains:
            continue
        chain = max(chains, key=len)
        q = np.array([c[0] for c in chain])
        mask = pick(q)
        kept = [c for c, m in zip(chain, mask) if m]
        if len(kept) < 3:
            continue
        nv = np.asarray(nv, dtype=np.float64) / np.linalg.norm(nv)
        centre = q.mean(axis=0)
        u = np.array([1.0, 0.0, 0.0]) - nv * nv[0]
        u = u / np.linalg.norm(u) if np.linalg.norm(u) > 1e-6 else np.array([0.0, 1.0, 0.0])
        w = np.cross(nv, u)
        mid = np.mean([c[0] for c in kept], axis=0) - centre
        a0 = math.atan2(mid @ w, mid @ u)

        def angle(c):   # round the section from the arc's middle, so a kept arc is in order whatever its span
            d = c[0] - centre
            return (math.atan2(d @ w, d @ u) - a0 + math.pi) % (2 * math.pi) - math.pi
        kept.sort(key=angle)
        pts, nr = tack.resample(kept, k)
        rows.append(pts + nr * lift)
        nrms.append(nr)
    return np.array(rows), np.array(nrms)


def plate(name, material, rows, nrms, thick=0.008):
    """A plate through `rows` (the hide's side), `thick` deep."""
    return part(name, material, *tack.solid(rows + nrms * thick, rows))


def lames(name, material, rows, nrms, per=3, thick=0.008, gap=0.35):
    """`rows` cut into lames of `per` rows each, a gap between each two (`gap` of a row's step), each a plate of its own,
    the next lame lapping the one before it a little higher off the hide."""
    out = []
    for i, k0 in enumerate(range(0, len(rows) - 1, per)):
        k1 = min(len(rows), k0 + per + 1)
        r, nr = rows[k0:k1].copy(), nrms[k0:k1]
        if len(r) < 2:
            break
        r[0] += (r[1] - r[0]) * gap / 2
        r[-1] -= (r[-1] - r[-2]) * gap / 2
        out.append(plate(f'{name}_{i}', material, r + nr * (0.002 * (i % 2)), nr, thick))
    return out


def under(name, material, rows, nrms):
    """The glow under a plate's seams: a sheet on the hide the plates' gaps show."""
    return part(name, material, *tack.sheet(rows - nrms * 0.003))


def neck_path(n):
    """Points up the neck's crest axis, withers to poll, and the axis' way there."""
    a, b = np.array([0.0, 0.55, 1.28]), np.array([0.0, 1.1, 1.72])
    way = (b - a) / np.linalg.norm(b - a)
    return [a + (b - a) * s for s in np.linspace(0.0, 1.0, n)], way


def neck_rows(lift, top_share=0.55, n=13, k=13):
    """The neck's top `top_share` of each section, withers to poll."""
    p, t, _ = body()
    keep = ((p[t][:, :, 1] > 0.4) & (p[t][:, :, 1] < 1.25)).all(axis=1)
    origins, way = neck_path(n)

    def pick(q):
        z = q[:, 2]
        return z >= z.max() - (z.max() - z.min()) * top_share
    return shell_rows(origins, [way] * len(origins), pick, lift, k, keep)


def face_rows(lift, n=9, k=11):
    """The face's front, from the brow to above the nostrils: the head's sections' upper half."""
    p, t, _ = body()
    keep = (p[t][:, :, 1] > 1.12).all(axis=1)
    a, b = np.array([0.0, 1.2, 1.78]), np.array([0.0, 1.47, 1.52])
    way = (b - a) / np.linalg.norm(b - a)

    def pick(q):
        z = q[:, 2]
        return z >= z.max() - (z.max() - z.min()) * 0.45
    return shell_rows([a + (b - a) * s for s in np.linspace(0, 1, n)], [way] * n, pick, lift, k, keep)


def chest_rows(lift, n=9, k=13):
    """The chest's front from the neck's foot down between the forelegs: horizontal sections' front half."""
    p, t, _ = body()
    keep = (p[t][:, :, 1] > 0.35).all(axis=1) & (p[t][:, :, 2] > 0.95).all(axis=1) & (p[t][:, :, 2] < 1.5).all(axis=1)

    def pick(q):
        return q[:, 1] >= q[:, 1].max() - 0.16
    origins = [np.array([0.0, 0.7, z]) for z in np.linspace(1.42, 1.02, n)]
    return shell_rows(origins, [np.array([0.0, 0.0, 1.0])] * n, pick, lift, k, keep)


def rump_rows(lift, y0=-0.42, y1=-0.8, drop=0.42, n=9, k=15):
    """Over the croup and down its sides, from behind the saddlebags to the buttocks."""
    p, t, _ = body()

    def pick(q):
        return q[:, 2] >= q[:, 2].max() - drop
    origins = [np.array([0.0, y, 0.0]) for y in np.linspace(y0, y1, n)]
    return shell_rows(origins, [np.array([0.0, 1.0, 0.0])] * n, pick, lift, k)


def flank_rows(lift, side, y0=0.38, y1=-0.12, n=7, k=9):
    """A flank's plate under the saddle's flap, its top below the flap's foot."""
    p, t, _ = body()

    def pick(q):
        return (q[:, 0] * side > 0.12) & (q[:, 2] < 1.32) & (q[:, 2] > 1.0)
    origins = [np.array([0.0, y, 0.0]) for y in np.linspace(y0, y1, n)]
    return shell_rows(origins, [np.array([0.0, 1.0, 0.0])] * n, pick, lift, k)


def horn(name, material, base, way, length, radius, m=8):
    """A horn swept back from `base` along `way`, curving up, tapering to a point."""
    way = np.asarray(way, dtype=np.float64) / np.linalg.norm(way)
    s = np.linspace(0.0, 1.0, 9)
    pts = base[None, :] + way[None, :] * (length * s[:, None]) + np.array([0.0, 0.0, 1.0]) * (0.35 * length * s ** 2)[:, None]
    pos, tris = tack.tube(pts, radius, m)
    r = (1 - s * 0.92)
    centre = np.repeat(pts, m, axis=0)
    pos = centre + (pos - centre) * np.repeat(r, m)[:, None]
    return part(name, material, pos, tris, np.repeat(s, m))


def tongue(name, material, root, way, length, radius, wave=0.0, m=5, seed=0):
    """A tapering tongue of flame or a wisp from `root` along `way`, waving `wave` metres across as it rises."""
    rng = np.random.default_rng(seed)
    way = np.asarray(way, dtype=np.float64) / np.linalg.norm(way)
    across = np.cross(way, [1.0, 0.0, 0.0])
    if np.linalg.norm(across) < 1e-6:
        across = np.array([0.0, 1.0, 0.0])
    across /= np.linalg.norm(across)
    s = np.linspace(0.0, 1.0, 7)
    phase = rng.uniform(0, 2 * math.pi)
    pts = root[None, :] + way[None, :] * (length * s[:, None]) \
        + across[None, :] * (wave * np.sin(phase + s * 2.6 * math.pi) * s)[:, None]
    pos, tris = tack.tube(pts, radius, m)
    centre = np.repeat(pts, m, axis=0)
    r = np.repeat(np.sin(math.pi * np.clip(s * 0.85 + 0.15, 0, 1)) * (1 - s) ** 0.6 + 0.05, m)
    pos = centre + (pos - centre) * r[:, None]
    return part(name, material, pos, tris, np.repeat(s, m))


def crest_points(n):
    """Points along the mane's crest, withers to poll, on the hide's top."""
    rows, nrms = neck_rows(0.0, top_share=0.08, n=n, k=3)
    return rows[:, 1], nrms[:, 1]


def tail_points(n):
    """Points down the tail's dock and hair, as the bake's cards hang it at rest."""
    b = horse.bake()
    cards = next(m for m in b['meshes'] if m['alpha'])
    p = np.array(cards['positions'], dtype=np.float64).reshape(-1, 3)
    tail = p[p[:, 1] < -0.6]
    if not len(tail):
        return np.zeros((0, 3))
    order = np.argsort(-tail[:, 2])
    tail = tail[order]
    picks = np.linspace(0, len(tail) - 1, n).astype(int)
    return tail[picks]


def coronets():
    """Each hoof's coronet: the ring round the leg at the hooves' crown (horseModel.js horseHide's crown)."""
    b = horse.bake()
    p, _, _ = body()
    out = []
    for bone in b['bones']:
        if 'Hoof' not in bone['name']:
            continue
        x, y, z = bone['bind'][12], bone['bind'][13], bone['bind'][14]
        near = p[(np.abs(p[:, 2] - 0.09) < 0.03) & (np.hypot(p[:, 0] - x, p[:, 1] - y) < 0.12)]
        c = near.mean(axis=0) if len(near) else np.array([x, y, 0.09])
        r = np.hypot(near[:, 0] - c[0], near[:, 1] - c[1]).max() if len(near) else 0.05
        out.append((c, r))
    return out


def unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / max(np.linalg.norm(v), 1e-9)


def blade(name, material, base, way, flat, length, width, thick=0.008):
    """A flat tapering blade from `base` along `way`, its flat face square to `flat`, `width` across at its root: a
    spike, a fin, a ray."""
    d, n = unit(way), unit(flat)
    side = unit(np.cross(n, d))
    tip = base + d * length
    q = [base - side * width / 2, base + side * width / 2, tip]
    pos = np.array([*(x + n * thick / 2 for x in q), *(x - n * thick / 2 for x in q)])
    tris = [(0, 1, 2), (3, 5, 4), (0, 3, 1), (1, 3, 4), (1, 4, 2), (2, 4, 5), (2, 5, 0), (0, 5, 3)]
    return part(name, material, pos, tris, [0.0, 0.0, 1.0, 0.0, 0.0, 1.0])


def loops_solid(loops):
    """Closed loops of `k` points each joined in turn, the last back to the first: a ring of a solid."""
    loops = [np.asarray(lp, dtype=np.float64) for lp in loops]
    k = len(loops[0])
    pos = np.concatenate(loops)
    tris = []
    for i in range(len(loops)):
        a, b = i * k, ((i + 1) % len(loops)) * k
        for j in range(k):
            j2 = (j + 1) % k
            tris += [(a + j, b + j, a + j2), (a + j2, b + j, b + j2)]
    return pos, np.array(tris, dtype=np.int64)


def frame_of(normal):
    n = unit(normal)
    u = unit(np.cross(n, [0.0, 0.0, 1.0] if abs(n[2]) < 0.9 else [1.0, 0.0, 0.0]))
    return n, u, np.cross(n, u)


def gear(name, material, centre, normal, root, tip, hole, teeth, thick=0.014):
    """A gear lying on the hide: `teeth` teeth from `root` out to `tip`, a hole of radius `hole` in its middle."""
    n, u, v = frame_of(normal)
    k = teeth * 4
    outer, inner = [], []
    for j in range(k):
        a = 2 * math.pi * j / k
        r = tip if (j % 4) in (1, 2) else root
        w = math.cos(a) * u + math.sin(a) * v
        outer.append(centre + w * r)
        inner.append(centre + w * hole)
    front, back = n * thick / 2, -n * thick / 2
    return part(name, material, *loops_solid([[x + front for x in inner], [x + front for x in outer],
                                               [x + back for x in outer], [x + back for x in inner]]))


def disc(name, material, centre, normal, radius, thick=0.01, k=12):
    """A round boss lying on the hide."""
    n, u, v = frame_of(normal)
    rim = [centre + radius * (math.cos(2 * math.pi * j / k) * u + math.sin(2 * math.pi * j / k) * v) for j in range(k)]
    mid = [centre + 0.15 * radius * (math.cos(2 * math.pi * j / k) * u + math.sin(2 * math.pi * j / k) * v)
           for j in range(k)]
    return part(name, material, *loops_solid([[x + n * thick for x in mid], [x + n * thick * 0.6 for x in rim],
                                               [x - n * thick * 0.4 for x in rim], [x - n * thick * 0.4 for x in mid]]))


def surface_at(want, side=None, reach=0.06):
    """The hide's point nearest `want` (a point and its outward normal), `side` the body's half it is on."""
    p, _, n = body()
    keep = np.ones(len(p), bool) if side is None else (p[:, 0] * side > 0)
    d = np.linalg.norm(p - np.asarray(want), axis=1) + np.where(keep, 0.0, 9.0)
    i = int(np.argmin(d))
    return p[i], unit(n[i])


def leg_outside(a, b, side, s):
    """A point on the outside of the leg between bone joints `a` and `b`, `s` of the way down, and its normal."""
    want = np.asarray(a) + (np.asarray(b) - np.asarray(a)) * s + np.array([side * 0.15, 0.0, 0.0])
    return surface_at(want, side)


def bone_at(name):
    b = horse.bake()
    return np.array(next(x for x in b['bones'] if x['name'] == name)['bind'][12:15], dtype=np.float64)


def eyes():
    """Each eye's middle on the hide (horseTexelDye.js EYES), and its outward normal."""
    return [surface_at([side * 0.12, 1.27, 1.69], side) for side in (1.0, -1.0)]


def warhorse():
    """Daedric barding: black lames over a red glow, a row of blades up the crest and down the croup, a chanfron with a
    blade and swept horns, a spiked peytral, and the hooves in embers."""
    out = []
    rows, nrms = neck_rows(LIFT + 0.006, top_share=0.62)
    out.append(under('crinet_glow', 'ember', rows, nrms))
    out += lames('crinet', 'daedric', rows, nrms, per=2, thick=0.012, gap=0.3)
    pts, ns = crest_points(9)
    for i, (q, nv) in enumerate(zip(pts[1:], ns[1:])):   # the crest's blades, tallest at the withers
        out.append(blade(f'crest_blade_{i}', 'daedricrim', q + nv * 0.02, nv + np.array([0.0, -0.75, 0.0]),
                         [1.0, 0.0, 0.0], 0.15 - 0.008 * i, 0.06))
    rows, nrms = face_rows(LIFT + 0.006)
    out += lames('chanfron', 'daedric', rows, nrms, per=4, thick=0.01, gap=0.7)
    brow, bn = rows[1][len(rows[1]) // 2], nrms[1][len(rows[1]) // 2]
    nose, nn = rows[-3][len(rows[-3]) // 2], nrms[-3][len(rows[-3]) // 2]
    out.append(blade('chanfron_blade', 'daedricrim', nose + nn * 0.02, nn + np.array([0.0, 0.4, 0.6]), [1.0, 0.0, 0.0],
                     0.12, 0.05))
    for i, side in enumerate((1.0, -1.0)):
        out.append(horn(f'horn_{i}', 'daedricrim', brow + bn * 0.01 + np.array([side * 0.05, -0.02, 0.0]),
                        [side * 0.55, -1.0, 0.35], 0.3, 0.034))
    rows, nrms = chest_rows(LIFT + 0.006)
    out.append(under('peytral_glow', 'ember', rows, nrms))
    out += lames('peytral', 'daedric', rows, nrms, per=3, thick=0.012, gap=0.3)
    mid = len(rows) // 2
    for i, j in enumerate((2, rows.shape[1] // 2, rows.shape[1] - 3)):   # three spikes forward off the chest
        out.append(blade(f'peytral_spike_{i}', 'daedricrim', rows[mid][j] + nrms[mid][j] * 0.015, nrms[mid][j],
                         [0.0, 0.0, 1.0], 0.1, 0.045))
    rows, nrms = rump_rows(LIFT + 0.008)
    out.append(under('crupper_glow', 'ember', rows, nrms))
    out += lames('crupper', 'daedric', rows, nrms, per=2, thick=0.012, gap=0.3)
    for i in range(1, len(rows) - 1, 2):   # blades down the croup's ridge
        c, nv = rows[i][rows.shape[1] // 2], nrms[i][rows.shape[1] // 2]
        out.append(blade(f'croup_blade_{i}', 'daedricrim', c + nv * 0.015, nv + np.array([0.0, -0.8, 0.0]),
                         [1.0, 0.0, 0.0], 0.1, 0.05))
    for i, (c, r) in enumerate(coronets()):   # the hooves in embers
        out.append(part(f'ember_{i}', 'ember', *tack.ring(c + np.array([0.0, 0.0, 0.005]), [0.0, 0.0, 1.0],
                                                         r + 0.006, 0.01, 10, 4)))
    return out


def automaton():
    """A Dwemer automaton: brass plates over a blue glow, brass rings stacked up the neck, a comb of fins on the crest,
    a faceplate with lenses for eyes, a gear with a blue core on each shoulder, pistons down the legs, rings at every
    joint and a tail of brass segments."""
    out = []
    for name, (rows, nrms), per in (('neck', neck_rows(LIFT + 0.006, top_share=0.75), 2),
                                    ('chest', chest_rows(LIFT + 0.006), 4),
                                    ('rump', rump_rows(LIFT + 0.008, drop=0.5), 3),
                                    ('flankL', flank_rows(LIFT + 0.006, 1.0), 3),
                                    ('flankR', flank_rows(LIFT + 0.006, -1.0), 3)):
        if len(rows) < 2:
            continue
        out.append(under(f'{name}_glow', 'aether', rows, nrms))
        out += lames(name, 'brass', rows, nrms, per=per, thick=0.01, gap=0.42)
        for i, k0 in enumerate(range(0, len(rows) - 1, per)):   # rivets along each lame's leading edge
            edge = rows[min(len(rows) - 1, k0)] + nrms[min(len(rows) - 1, k0)] * 0.012
            for j in range(2, edge.shape[0] - 2, 4):
                out.append(part(f'{name}_rivet_{i}_{j}', 'rivet', *tack.box(edge[j], (0.014, 0.014, 0.014), 0.006, 1)))
    p, t, nb = body()   # the neck's rings: whole collars round it, stacked from the withers to the throat
    keep = ((p[t][:, :, 1] > 0.4) & (p[t][:, :, 1] < 1.25)).all(axis=1)
    origins, way = neck_path(9)
    for i, o in enumerate(origins[1:-1]):
        chains = tack.section(p, t, nb, o, way, keep)
        if not chains:
            continue
        pts, ns = tack.resample(max(chains, key=len), 16)
        out.append(part(f'collar_{i}', 'bronze', *tack.tube(np.vstack([pts + ns * 0.02, pts[:1] + ns[:1] * 0.02]),
                                                            0.011, 4)))
    pts, ns = crest_points(11)
    for i, (q, nv) in enumerate(zip(pts[1:-1], ns[1:-1])):   # the crest's comb of fins
        out.append(blade(f'fin_{i}', 'brass', q + nv * 0.02, nv + np.array([0.0, -0.35, 0.0]), [1.0, 0.0, 0.0],
                         0.1, 0.07, 0.006))
    rows, nrms = face_rows(LIFT + 0.006)
    out += lames('faceplate', 'brass', rows, nrms, per=3, thick=0.01, gap=0.5)
    for i, (c, nv) in enumerate(eyes()):   # lenses for eyes
        out.append(part(f'lens_{i}', 'aether', *tack.ring(c + nv * 0.012, nv, 0.024, 0.009, 10, 4)))
        out.append(part(f'lensrim_{i}', 'bronze', *tack.ring(c + nv * 0.012, nv, 0.036, 0.006, 10, 4)))
    for i, side in enumerate((1.0, -1.0)):   # a gear on each shoulder, its core glowing
        c, nv = surface_at([side * 0.3, 0.5, 1.2], side)
        c = c + nv * 0.018
        out.append(gear(f'gear_{i}', 'brass', c, nv, 0.11, 0.145, 0.06, 10))
        out.append(disc(f'gearcore_{i}', 'aether', c + nv * 0.004, nv, 0.06))
        out.append(part(f'gearhub_{i}', 'bronze', *tack.ring(c + nv * 0.012, nv, 0.02, 0.008, 10, 4)))
    for leg in ('Fore.L', 'Fore.R', 'Hind.L', 'Hind.R'):   # pistons down the legs and a ring at each joint
        side = 1.0 if '.L' in leg else -1.0
        top, mid = (f'{leg}.Forearm', f'{leg}.Cannon') if leg.startswith('Fore') else (f'{leg}.Shin', f'{leg}.Cannon')
        a, b = bone_at(top), bone_at(mid)
        q0, n0 = leg_outside(a, b, side, 0.12)
        q1, n1 = leg_outside(a, b, side, 0.88)
        rod = np.linspace(q0 + n0 * 0.03, q1 + n1 * 0.03, 8)
        out.append(part(f'piston_{leg}', 'bronze', *tack.tube(rod, 0.009, 4)))
        out.append(part(f'sleeve_{leg}', 'brass', *tack.tube(rod[:4], 0.017, 6)))
        for k, name in enumerate((mid, f'{leg}.Pastern')):
            c = bone_at(name)
            out.append(part(f'joint_{leg}_{k}', 'bronze', *tack.ring(c, [1.0, 0.0, 0.0], 0.055 - 0.012 * k, 0.016, 10, 4)))
            out.append(part(f'jointcore_{leg}_{k}', 'aether', *tack.ring(c + np.array([side * 0.035, 0.0, 0.0]),
                                                                       [1.0, 0.0, 0.0], 0.026, 0.007, 10, 4)))
    rows, nrms = chest_rows(LIFT + 0.024)
    mid, mn = rows[len(rows) // 3][rows.shape[1] // 2], nrms[len(rows) // 3][rows.shape[1] // 2]
    out.append(disc('core', 'aether', mid + mn * 0.004, mn, 0.05))
    out.append(gear('core_bezel', 'bronze', mid, mn, 0.06, 0.075, 0.05, 8, 0.012))
    tail = tail_points(9)
    for i in range(len(tail) - 1):   # the tail: brass segments, each narrower
        way = tail[i + 1] - tail[i]
        out.append(part(f'tailseg_{i}', 'brass', *tack.ring(tail[i] + way * 0.5, way, 0.035 - 0.003 * i, 0.012, 10, 4)))
    return out


def spectral():
    """A ghost: long wisps streaming back off the crest and the tail, and mist curling off the hooves. The bones that
    glow through its hide are its material's (horseTexelDye.js)."""
    out = []
    pts, nrms = crest_points(14)
    for i, (q, nv) in enumerate(zip(pts, nrms)):
        out.append(tongue(f'wisp_crest_{i}', 'wisp', q + nv * 0.01, nv * 0.35 + np.array([0.0, -1.0, 0.2]),
                          0.42 + 0.08 * math.sin(i * 1.3), 0.04, 0.08, seed=i))
    for i, q in enumerate(tail_points(10)):
        out.append(tongue(f'wisp_tail_{i}', 'wisp', q, [0.0, -1.0, -0.3 - 0.08 * i], 0.42, 0.04, 0.08, seed=40 + i))
    for i, (c, r) in enumerate(coronets()):
        for k in range(4):
            a = 2 * math.pi * k / 4 + i
            root = c + np.array([math.cos(a) * r, math.sin(a) * r, 0.03])
            out.append(tongue(f'wisp_hoof_{i}_{k}', 'wisp', root, [math.cos(a) * 0.4, -1.0, 0.35], 0.26, 0.026, 0.04,
                              seed=80 + i * 4 + k))
    return out


def dawnfire():
    """The sun's charger: a gilded sunburst on its brow, a plume of flame between its ears, a mane and a tail of tall
    flames in two ranks, and fire rising off every hoof."""
    out = []
    pts, nrms = crest_points(16)
    for rank, off in enumerate((0.03, -0.03)):
        for i, (q, nv) in enumerate(zip(pts, nrms)):
            out.append(tongue(f'flame_crest_{rank}_{i}', 'flame', q + nv * 0.005 + np.array([off, 0.0, 0.0]),
                              nv + np.array([off * 4, -0.5, 0.0]), 0.28 + 0.1 * math.sin(i * 1.7 + rank),
                              0.038, 0.05, seed=i + 20 * rank))
    poll = surface_at([0.0, 1.12, 1.92])[0]
    for k in range(5):   # the plume between the ears
        a = (k - 2) * 0.35
        out.append(tongue(f'flame_plume_{k}', 'flame', poll + np.array([0.0, 0.0, 0.01]),
                          [math.sin(a) * 0.5, -0.25, 1.0], 0.22 - 0.03 * abs(k - 2), 0.035, 0.04, seed=60 + k))
    for i, q in enumerate(tail_points(11)):
        out.append(tongue(f'flame_tail_{i}', 'flame', q, [0.0, -0.7, 0.5 - 0.1 * i], 0.32, 0.038, 0.05, seed=30 + i))
    for i, (c, r) in enumerate(coronets()):   # fire off every hoof
        for k in range(5):
            a = 2 * math.pi * k / 5 + i
            root = c + np.array([math.cos(a) * r * 0.9, math.sin(a) * r * 0.9, 0.0])
            out.append(tongue(f'flame_hoof_{i}_{k}', 'flame', root, [math.cos(a) * 0.25, -0.35, 1.0], 0.2, 0.028,
                              0.03, seed=90 + i * 5 + k))
    rows, nrms = face_rows(LIFT + 0.006)
    c, nv = rows[2][len(rows[2]) // 2] + nrms[2][len(rows[2]) // 2] * 0.015, nrms[2][len(rows[2]) // 2]
    out.append(disc('sun', 'gilt', c, nv, 0.05, 0.014))
    n, u, v = frame_of(nv)
    for k in range(12):   # its rays, long and short in turn
        a = 2 * math.pi * k / 12
        w = math.cos(a) * u + math.sin(a) * v
        out.append(blade(f'ray_{k}', 'gilt', c + w * 0.045, w, nv, 0.11 if k % 2 == 0 else 0.065, 0.03, 0.008))
    return out


def drowned():
    """The Drowned Vale's: a crinet, peytral and crupper of iron gone to rust, crusted with barnacles, weed hanging off
    their lowest edges and trailing from the tail, and the vale's red crystal grown up through the mane, tallest at the
    withers."""
    out = []
    for name, (rows, nrms), per in (('crinet', neck_rows(LIFT + 0.006, top_share=0.6), 2),
                                    ('peytral', chest_rows(LIFT + 0.006), 3),
                                    ('crupper', rump_rows(LIFT + 0.008), 2)):
        if len(rows) < 2:
            continue
        out += lames(name, 'rust', rows, nrms, per=per, thick=0.01, gap=0.3)
        for i in range(0, len(rows), 2):   # barnacles over the plates
            for j in range(1 + i % 3, rows.shape[1] - 1, 3):
                out.append(disc(f'{name}_barnacle_{i}_{j}', 'barnacle', rows[i][j] + nrms[i][j] * 0.013, nrms[i][j],
                                0.008 + 0.003 * ((i + j) % 3), 0.01, k=6))
        points, normals = rows.reshape(-1, 3), nrms.reshape(-1, 3)
        low = np.argsort(points[:, 2])[:max(4, len(points) // 5)]
        for n, k in enumerate(low[::3]):   # weed off the plates' lowest edge, hanging
            out.append(tongue(f'{name}_weed_{n}', 'weed', points[k] + normals[k] * 0.012,
                              np.array([0.0, 0.0, -1.0]) + normals[k] * 0.25, 0.14 + 0.05 * math.sin(n * 1.9), 0.012,
                              0.02, m=4, seed=200 + 17 * n + len(name)))
    pts, ns = crest_points(10)
    for i, (q, nv) in enumerate(zip(pts, ns)):   # crystal up the mane in splayed clusters, the withers' the tallest
        for k in range(2 + i % 2):
            splay = np.array([(k - 0.5 - 0.5 * (i % 2)) * 0.7, -0.3 + 0.15 * k, 0.0])
            length = (0.22 - 0.011 * i) * (1.0, 0.62, 0.45)[k] * (1.0 + 0.15 * math.sin(i * 2.3))
            out.append(horn(f'crystal_crest_{i}_{k}', 'crystal', q + nv * 0.008, nv + splay, length,
                            (0.026 - 0.001 * i) * (1.0, 0.75, 0.6)[k], m=5))
    for i, q in enumerate(tail_points(8)):
        out.append(tongue(f'weed_tail_{i}', 'weed', q, [0.0, -0.6, -1.0], 0.36, 0.02, 0.06, m=4, seed=70 + i))
    for i, (c, r) in enumerate(coronets()):   # barnacles round each hoof's crown
        for k in range(3):
            a = 2 * math.pi * k / 3 + i
            spot = c + np.array([math.cos(a) * r, math.sin(a) * r, 0.02])
            out.append(disc(f'hoof_barnacle_{i}_{k}', 'barnacle', spot, [math.cos(a), math.sin(a), 0.2], 0.014,
                            0.012, k=6))
    return out


BUILD = {'warhorse': warhorse, 'spectral': spectral, 'dawnfire': dawnfire, 'automaton': automaton, 'drowned': drowned}
# a flame or a wisp off the crest behind this far up the neck (the bake's +Y) streams back at the rider's eye and hides
# the horse in first person, so the ride draws only those toward the poll; seen from outside they are all drawn
NEAR_FROM = 0.9


def near_rider(pc):
    """Whether a piece streams back at the rider's eye (`NEAR_FROM`): left out of a first-person view."""
    crest = pc['name'].startswith(('flame_crest_', 'wisp_crest_'))
    return crest and pc['positions'][:, 1].min() < NEAR_FROM


def pieces(look):
    """Every piece of mount look `look`."""
    return BUILD[look]()


def swatch_uv(material, v):
    """A point's UV in the swatches: its stripe across, its place along the piece down it (v up from the foot)."""
    names = list(SWATCHES)
    u = (names.index(material) + 0.5) / len(names)
    return np.stack([np.full(len(v), u), 0.03 + 0.94 * np.asarray(v)], axis=1)
