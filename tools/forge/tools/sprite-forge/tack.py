"""The Courser's tack: a bridle, its bit and reins, a saddle on a blanket, a girth, stirrups on their leathers, and a
pair of saddlebags behind the cantle. Each piece is fitted to the horse's own surface at rest (the bake's frame: +Y
ahead, +Z up, metres) by cutting the body with planes, and is carried by the bone under it, so it rides every stride
as the hide does. The reins run from the bit to the rider's hands, their weight passing from the head to the back
along them. Pure: numpy alone. The forge wears it (horse.py); `--bake` writes it for the game's 3D horse.

    python -I tools/sprite-forge/tack.py --bake src/assets/horse

A piece is `{name, material, positions (n, 3), triangles (m, 3), joints (n, 4), weights (n, 4)}`, its joints the
bake's bone indices. Materials are the tack's own swatches (`SWATCHES`): the leather of the straps and the saddle,
its darker seat, the iron of the bit and the stirrups, and the blanket's cloth."""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import horse  # noqa: E402

# each material's colour (sRGB, 0..255): what the forge lights and the game's picture holds
SWATCHES = {'strap': (92, 54, 28), 'seat': (62, 34, 18), 'iron': (150, 150, 156), 'cloth': (122, 28, 30),
            'trim': (196, 160, 72)}
# the seat the rider sits (horseRig.js HORSE_SEAT) and the saddle laid round it, along the back (y, ahead)
SEAT = horse.SEAT
SADDLE = {'from': -0.17, 'to': 0.33, 'sections': 13, 'drop': 0.2, 'flap': 0.33, 'lift': 0.03, 'pommel': 0.07,
          'cantle': 0.06}
BLANKET = {'from': -0.26, 'to': 0.41, 'sections': 15, 'drop': 0.3, 'lift': 0.012}
GIRTH = {'at': 0.32, 'width': 0.06, 'lift': 0.012}
# the stirrups, as the game's saddle hangs them (seatPose.js): either side of the seat's middle, below and ahead of
# the hips, the drop scaled by the rider's height (1 for the measured biped)
STIRRUP_SIDE, STIRRUP_DROP, STIRRUP_AHEAD = 0.32, 0.8, 0.08
# the reins' far ends in the rider's fists (seatPose.js): ahead of, above and either side of the hips
REIN_AHEAD, REIN_UP, REIN_SIDE = 0.36, 0.18, 0.12
BAGS = {'at': -0.36, 'length': 0.3, 'height': 0.26, 'depth': 0.1, 'below': 0.06}
STRAP = 0.025   # a bridle strap's width
LIFT = 0.006    # a strap off the hide


def body_mesh():
    """The body at rest: (positions, triangles, normals), the bake's own."""
    b = horse.bake()
    body = next(m for m in b['meshes'] if m['part'] == 'body')
    p = np.array(body['positions'], dtype=np.float64).reshape(-1, 3)
    t = np.array(body['indices'], dtype=np.int64).reshape(-1, 3)
    n = np.array(body['normals'], dtype=np.float64).reshape(-1, 3)
    return p, t, n


def bone(name):
    return [x['name'] for x in horse.bake()['bones']].index(name)


def section(p, t, n, origin, normal, keep=None):
    """The body cut by a plane: its contour as chains of (point, outward normal), longest first. `keep` filters the
    triangles cut (a part of the body: the head alone)."""
    normal = np.asarray(normal, dtype=np.float64) / np.linalg.norm(normal)
    d = (p - origin) @ normal
    segs = []
    for tri in t if keep is None else t[keep]:
        pts = []
        for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
            if (d[a] > 0) != (d[b] > 0):
                s = d[a] / (d[a] - d[b])
                q = p[a] + (p[b] - p[a]) * s
                m = n[a] + (n[b] - n[a]) * s
                pts.append((q, m / max(np.linalg.norm(m), 1e-9)))
        if len(pts) == 2:
            segs.append(pts)
    chains = []
    while segs:
        chain = list(segs.pop())
        grown = True
        while grown:
            grown = False
            for i, (u, v) in enumerate(segs):
                for a, b in ((u, v), (v, u)):
                    if np.linalg.norm(a[0] - chain[-1][0]) < 1e-6:
                        chain.append(b)
                    elif np.linalg.norm(b[0] - chain[0][0]) < 1e-6:
                        chain.insert(0, a)
                    else:
                        continue
                    segs.pop(i)
                    grown = True
                    break
                if grown:
                    break
        chains.append(chain)
    return sorted(chains, key=len, reverse=True)


def resample(chain, k):
    """A chain of (point, normal) at `k` points evenly along it."""
    q = np.array([c[0] for c in chain])
    m = np.array([c[1] for c in chain])
    s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))])
    at = np.linspace(0, s[-1], k)
    pts = np.stack([np.interp(at, s, q[:, i]) for i in range(3)], axis=1)
    nrm = np.stack([np.interp(at, s, m[:, i]) for i in range(3)], axis=1)
    return pts, nrm / np.linalg.norm(nrm, axis=1, keepdims=True)


def over_back(chain, drop):
    """The part of a cross-section over the back: from its top down `drop` metres either side, left to right."""
    q = np.array([c[0] for c in chain])
    top = q[:, 2].max()
    keep = [c for c in chain if c[0][2] > top - drop]
    keep.sort(key=lambda c: math.atan2(c[0][2] - (top - drop), -c[0][0]))
    return keep


def sheet(rows, close=False):
    """A surface through rows of points (each row the same count): (positions, triangles)."""
    rows = np.asarray(rows)
    r, k = rows.shape[:2]
    pos = rows.reshape(-1, 3)
    tris = []
    for i in range(r - 1):
        for j in range(k - 1 + (1 if close else 0)):
            a, b = i * k + j, i * k + (j + 1) % k
            c, d = (i + 1) * k + j, (i + 1) * k + (j + 1) % k
            tris += [(a, c, b), (b, c, d)]
    return pos, np.array(tris, dtype=np.int64)


def solid(rows_out, rows_in):
    """A shell: an outer and an inner sheet and their rims joined."""
    p1, t1 = sheet(rows_out)
    p2, t2 = sheet(rows_in)
    t2 = t2[:, ::-1] + len(p1)
    r, k = np.asarray(rows_out).shape[:2]
    rim = []
    o = len(p1)
    edge = [(i, 0) for i in range(r)] + [(r - 1, j) for j in range(k)] + [(i, k - 1) for i in range(r - 1, -1, -1)] + \
        [(0, j) for j in range(k - 1, -1, -1)]
    for (i, j), (i2, j2) in zip(edge, edge[1:]):
        a, b = i * k + j, i2 * k + j2
        rim += [(a, b, o + a), (b, o + b, o + a)]
    return np.concatenate([p1, p2]), np.concatenate([t1, t2, np.array(rim, dtype=np.int64)])


def ribbon(pts, nrm, width, lift, thick=0.004):
    """A strap along a line on the hide: `width` across, lying `lift` off it, `thick` deep."""
    pts, nrm = np.asarray(pts), np.asarray(nrm)
    tan = np.gradient(pts, axis=0)
    tan /= np.maximum(np.linalg.norm(tan, axis=1, keepdims=True), 1e-9)
    side = np.cross(nrm, tan)
    side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-9)
    base = pts + nrm * lift
    out = [base - side * width / 2 + nrm * thick, base + side * width / 2 + nrm * thick]
    inn = [base - side * width / 2, base + side * width / 2]
    return solid(np.stack(out, axis=1), np.stack(inn, axis=1))


def ring(centre, axis, radius, tube, k=16, m=6):
    """A ring: `radius` round `centre` in the plane square to `axis`, `tube` thick."""
    axis = np.asarray(axis, dtype=np.float64) / np.linalg.norm(axis)
    u = np.cross(axis, [0, 0, 1.0] if abs(axis[2]) < 0.9 else [1.0, 0, 0])
    u /= np.linalg.norm(u)
    v = np.cross(axis, u)
    rows = []
    for i in range(k + 1):
        a = 2 * math.pi * i / k
        c = centre + radius * (math.cos(a) * u + math.sin(a) * v)
        out = math.cos(a) * u + math.sin(a) * v
        rows.append([c + tube * (math.cos(2 * math.pi * j / m) * out + math.sin(2 * math.pi * j / m) * axis)
                     for j in range(m)])
    return sheet(rows, close=True)


def box(centre, size, rounding=0.02, k=6):
    """A rounded box: `size` (x, y, z) about `centre`, its edges rounded by `rounding`."""
    rows = []
    hx, hy, hz = np.asarray(size) / 2
    for i in range(k + 1):   # rings from the bottom to the top
        z = -hz + 2 * hz * i / k
        shrink = rounding * (1 - math.sqrt(max(0.0, 1 - ((abs(z) - (hz - rounding)) / rounding) ** 2))) \
            if abs(z) > hz - rounding else 0.0
        row = []
        for j in range(4 * k):
            a = 2 * math.pi * j / (4 * k)
            cx, cy = math.cos(a), math.sin(a)
            sx = (hx - shrink) * np.sign(cx) * min(1.0, abs(cx) * 1.6)
            sy = (hy - shrink) * np.sign(cy) * min(1.0, abs(cy) * 1.6)
            row.append(centre + np.array([sx, sy, z]))
        rows.append(row)
    pos, tris = sheet(rows, close=True)
    caps = []
    for ring_i, flip in ((0, True), (k, False)):   # the bottom and the top closed
        c = len(pos) + len(caps)
        caps.append(np.mean(rows[ring_i], axis=0))
        for j in range(4 * k):
            a, b = ring_i * 4 * k + j, ring_i * 4 * k + (j + 1) % (4 * k)
            tris = np.concatenate([tris, [(a, c, b) if flip else (a, b, c)]])
    return np.concatenate([pos, np.array(caps)]), tris


def piece(name, material, pos, tris, joints, weights=None):
    pos = np.asarray(pos, dtype=np.float64)
    n = len(pos)
    j = np.zeros((n, 4), dtype=np.int64)
    w = np.zeros((n, 4), dtype=np.float64)
    if weights is None:   # rigid on one bone
        j[:, 0], w[:, 0] = joints, 1.0
    else:
        j[:, :len(joints[0])], w[:, :len(weights[0])] = joints, weights
    return {'name': name, 'material': material, 'positions': pos, 'triangles': np.asarray(tris, dtype=np.int64),
            'joints': j, 'weights': w}


def head_keep(p, t):
    return (p[t][:, :, 1] > 0.9).all(axis=1)


def bits():
    """The bit's rings, at the mouth's corners: beside the muzzle, behind its tip, a little up from its foot."""
    p, _, _ = body_mesh()
    front = p[:, 1].max()
    snout = p[p[:, 1] > front - 0.15]
    foot = snout[:, 2].min()
    out = []
    for side in (1.0, -1.0):
        want = np.array([0.05 * side, front - 0.11, foot + 0.05])
        near = p[np.argmin(np.linalg.norm(p - want, axis=1))]
        out.append(near + np.array([0.012 * side, 0.0, 0.0]))
    return out


def bridle():
    """The headstall over the poll and down the cheeks to the bit, the noseband round the nose, and the bit's rings:
    all on the head's bone."""
    p, t, n = body_mesh()
    keep = head_keep(p, t)
    head = bone('Head')
    bl, br = bits()
    poll = np.array([0.0, 1.1, p[(p[:, 1] > 1.05) & (p[:, 1] < 1.15), 2].max()])
    normal = np.cross(bl - poll, br - poll)
    chain = max(section(p, t, n, poll, normal, keep), key=len)
    top = [c for c in chain if c[0][2] > min(bl[2], br[2]) + 0.02]
    top.sort(key=lambda c: math.atan2(c[0][2] - bl[2], -c[0][0]))
    out = []
    pts, nrm = resample(top, 40)
    out.append(piece('headstall', 'strap', *ribbon(pts, nrm, STRAP, LIFT), head))
    front = p[:, 1].max()
    axis = np.array([0.0, 1.0, -0.6])
    chain = max(section(p, t, n, np.array([0.0, front - 0.16, 0.0]) + np.array([0, 0, 1.6]), axis, keep), key=len)
    pts, nrm = resample(chain + chain[:1], 48)
    out.append(piece('noseband', 'strap', *ribbon(pts, nrm, STRAP, LIFT), head))
    for i, c in enumerate((bl, br)):
        out.append(piece(f'bit_{i}', 'iron', *ring(c, [1.0, 0, 0], 0.03, 0.005), head))
    return out


def back_rows(spec, extra=lambda y: 0.0, drop_of=None):
    """Rows over the back, one a cross-section from `from` to `to`: each the section's top `drop` either side, lifted
    `lift` (and `extra(y)`) off the hide. Gives the outer rows, the inner rows (on the hide)."""
    p, t, n = body_mesh()
    out, inn = [], []
    for y in np.linspace(spec['from'], spec['to'], spec['sections']):
        chain = max(section(p, t, n, np.array([0.0, y, 0.0]), [0.0, 1.0, 0.0]), key=len)
        arc = over_back(chain, drop_of(y) if drop_of else spec['drop'])
        pts, nrm = resample(arc, 21)
        rise = spec['lift'] + extra(y)
        inn.append(pts + nrm * spec['lift'] * 0.3)
        out.append(pts + nrm * rise)
    return np.array(out), np.array(inn)


def saddle_pieces():
    """The blanket, the saddle (its seat dipping between a raised pommel and cantle, its flaps down either side), and
    the girth under the belly: on the spine's bone, the girth on the chest's."""
    spine, chest = bone('Spine'), bone('Chest')
    s = SADDLE

    def rise(y):   # the seat's dip between the pommel ahead and the cantle behind
        u = (y - s['from']) / (s['to'] - s['from'])
        return s['pommel'] * max(0.0, (u - 0.75) / 0.25) ** 2 + s['cantle'] * max(0.0, (0.2 - u) / 0.2) ** 2

    def flap(y):   # the flaps hang lowest under the rider's legs
        u = (y - s['from']) / (s['to'] - s['from'])
        return s['drop'] + (s['flap'] - s['drop']) * max(0.0, math.sin(math.pi * min(1.0, max(0.0, (u - 0.15) / 0.7))))
    blanket = back_rows(BLANKET)
    seat = back_rows(SADDLE, rise, flap)
    p, t, n = body_mesh()
    chain = max(section(p, t, n, np.array([0.0, GIRTH['at'], 0.0]), [0.0, 1.0, 0.0]), key=len)
    q = np.array([c[0] for c in chain])
    low = [c for c in chain if c[0][2] < q[:, 2].max() - SADDLE['flap'] + 0.04]
    low.sort(key=lambda c: math.atan2(-c[0][0], c[0][2] - q[:, 2].min() - 0.2))
    gp, gn = resample(low, 30)
    return [piece('blanket', 'cloth', *solid(*blanket), spine),
            piece('saddle', 'seat', *solid(*seat), spine),
            piece('girth', 'strap', *ribbon(gp, gn, GIRTH['width'], GIRTH['lift']), chest)]


def stirrup_pieces(height=1.0):
    """Each stirrup's leather from the saddle's side down to its iron, where the rider's foot stands (seatPose.js), at
    a rider `height` (the biped's 1): on the spine's bone."""
    spine = bone('Spine')
    out = []
    seat = np.array(SEAT)
    for i, side in enumerate((1.0, -1.0)):
        iron = seat + np.array([side * STIRRUP_SIDE, STIRRUP_AHEAD * height, -STIRRUP_DROP * height])
        top = seat + np.array([side * 0.24, 0.02, -0.2])
        line = np.linspace(top, iron + np.array([0, 0, 0.06]), 12)
        nrm = np.tile([side, 0.0, 0.0], (12, 1))
        out.append(piece(f'leather_{i}', 'strap', *ribbon(line, nrm, 0.025, 0.0), spine))
        out.append(piece(f'stirrup_{i}', 'iron', *ring(iron + np.array([0, 0, 0.02]), [0.0, 1.0, 0.0], 0.055, 0.007),
                         spine))
    return out


def bag_pieces():
    """A pair of saddlebags behind the cantle, one either side against the croup, joined over the back by a strap:
    on the pelvis' bone."""
    pelvis = bone('Pelvis')
    p, t, n = body_mesh()
    g = BAGS
    chain = max(section(p, t, n, np.array([0.0, g['at'], 0.0]), [0.0, 1.0, 0.0]), key=len)
    q = np.array([c[0] for c in chain])
    top = q[:, 2].max()
    out = []
    for i, side in enumerate((1.0, -1.0)):
        z = top - g['below'] - g['height'] / 2
        band = q[np.abs(q[:, 2] - z) < 0.06]
        x = (band[:, 0] * side).max() * side if len(band) else side * 0.25
        centre = np.array([x + side * g['depth'] / 2, g['at'], z])
        out.append(piece(f'bag_{i}', 'strap', *box(centre, (g['depth'], g['length'], g['height']), 0.03), pelvis))
        flap = centre + np.array([side * (g['depth'] / 2 + 0.004), 0.0, g['height'] * 0.25])
        out.append(piece(f'bagflap_{i}', 'seat', *box(flap, (0.01, g['length'] * 0.9, g['height'] * 0.5), 0.004),
                         pelvis))
        out.append(piece(f'buckle_{i}', 'trim', *box(flap + np.array([side * 0.008, 0, -g['height'] * 0.22]),
                                                    (0.008, 0.03, 0.025), 0.003), pelvis))
    arc = over_back(chain, g['below'] + 0.02)
    pts, nrm = resample(arc, 20)
    out.append(piece('bagstrap', 'strap', *ribbon(pts, nrm, 0.05, 0.01), pelvis))
    return out


def rein_pieces(height=1.0):
    """The reins from the bit's rings to the rider's fists, a strap each, their weight passing from the head's bone at
    the bit to the spine's at the hands, so they stretch and give as the head nods."""
    head, spine = bone('Head'), bone('Spine')
    seat = np.array(SEAT)
    out = []
    for i, (side, ring_at) in enumerate(zip((1.0, -1.0), bits())):
        hand = seat + np.array([side * REIN_SIDE, REIN_AHEAD * height, REIN_UP * height])
        k = 24
        s = np.linspace(0.0, 1.0, k)
        line = ring_at[None, :] + (hand - ring_at)[None, :] * s[:, None]
        line[:, 2] -= 0.05 * np.sin(math.pi * s)   # a little slack
        nrm = np.tile([0.0, 0.0, 1.0], (k, 1))
        pos, tris = ribbon(line, nrm, 0.018, 0.0, 0.003)
        along = np.tile(np.repeat(s, 2), 2)   # the ribbon's outer rows then its inner, each two rails a step
        weights = np.stack([1 - along, along], axis=1)
        joints = np.tile([head, spine], (len(pos), 1))
        out.append(piece(f'rein_{i}', 'strap', pos, tris, joints, weights))
    return out


def tube(pts, radius, m=8):
    """A round bar along the line `pts`, `radius` thick."""
    pts = np.asarray(pts, dtype=np.float64)
    tan = np.gradient(pts, axis=0)
    tan /= np.maximum(np.linalg.norm(tan, axis=1, keepdims=True), 1e-9)
    u = np.cross(tan, [0.0, 0.0, 1.0])
    u[np.linalg.norm(u, axis=1) < 1e-6] = [1.0, 0.0, 0.0]
    u /= np.linalg.norm(u, axis=1, keepdims=True)
    v = np.cross(tan, u)
    rows = [[c + radius * (math.cos(2 * math.pi * j / m) * a + math.sin(2 * math.pi * j / m) * b) for j in range(m)]
            for c, a, b in zip(pts, u, v)]
    return sheet(rows, close=True)


# the driving harness the Small Cart's horse wears: blinkers beside the eyes, on the cheeks' straps, and a padded collar
# round the neck's foot, two brass hames along its sides rising over its top, a terret on each for the reins
# a pole team's back pad (in place of the saddle: no one rides a team), along the back as the saddle is, and the two
# terrets on top of it the lines run through, either side of the spine
PAD = {'from': 0.12, 'to': 0.38, 'sections': 9, 'drop': 0.17, 'lift': 0.03}
PAD_TERRET = {'at': 0.25, 'side': 0.07, 'radius': 0.024}
BLINKER = {'y': 1.2, 'z': 1.75, 'out': 0.024, 'size': (0.014, 0.11, 0.095)}
COLLAR = {'at': (0.0, 0.76, 1.3), 'way': (0.0, 1.0, 0.5), 'pad': 0.045, 'hame': 0.013, 'over': 0.1, 'from': 0.32}


def blinker_pieces():
    """A blinker either side of the head, off the cheek beside the eye, its stay strap up to the headstall; and the
    driving bridle's studs along the headstall, as Daggerfall's cart horse wears them: all on the head's bone."""
    p, t, n = body_mesh()
    head = bone('Head')
    near = p[(np.abs(p[:, 1] - BLINKER['y']) < 0.04) & (np.abs(p[:, 2] - BLINKER['z']) < 0.06)]
    half = np.abs(near[:, 0]).max()
    out = []
    for i, side in enumerate((1.0, -1.0)):
        at = np.array([side * (half + BLINKER['out']), BLINKER['y'], BLINKER['z']])
        out.append(piece(f'blinker_{i}', 'seat', *box(at, BLINKER['size'], 0.012, 4), head))
        top = at + np.array([0.0, 0.0, BLINKER['size'][2] / 2])
        poll = np.array([side * 0.04, 1.1, p[(p[:, 1] > 1.05) & (p[:, 1] < 1.15), 2].max() + LIFT])
        line = np.linspace(top, poll, 12)
        out.append(piece(f'stay_{i}', 'strap', *tube(line, 0.006, 5), head))
    for j, stud in enumerate(stud_points()):
        out.append(piece(f'stud_{j}', 'iron', *box(stud, (0.014, 0.014, 0.014), 0.006, 2), head))
    return out


def stud_points(step=0.045):
    """Points along the headstall's outer face, a stud every `step` metres (bridle's headstall)."""
    strap = bridle()[0]['positions']
    q = strap[: len(strap) // 2]   # its outer face
    mid = (q[0::2] + q[1::2]) / 2   # the middle of the strap, along it
    run = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(mid, axis=0), axis=1))])
    return [mid[np.argmin(np.abs(run - s_))] for s_ in np.arange(step / 2, run[-1], step)]


def collar_pieces():
    """The collar: a padded roll round the neck's foot where it meets the shoulders, the plane of it leaning forward
    with the neck; the hames along its two sides, from a third of the way down to over its top, and a terret on each
    hame's tip: all on the neck's foot."""
    p, t, n = body_mesh()
    neck = bone('NeckBase')
    keep = ((p[t][:, :, 1] > 0.45) & (p[t][:, :, 1] < 1.05) & (p[t][:, :, 2] > 0.85)).all(axis=1)
    origin, way = np.array(COLLAR['at']), np.array(COLLAR['way']) / np.linalg.norm(COLLAR['way'])
    chain = max(section(p, t, n, origin, way, keep), key=len)
    pts, nrm = resample(chain + chain[:1], 64)
    roll = pts + nrm * COLLAR['pad']
    out = [piece('collar', 'seat', *tube(roll, COLLAR['pad'], 10), neck)]
    top, low = roll[:, 2].max(), roll[:, 2].min()
    for i, side in enumerate((1.0, -1.0)):
        mine = np.where(side * roll[:, 0] > 0.02)[0]
        arc = roll[mine]
        arc = arc[arc[:, 2] > top - COLLAR['from'] * (top - low)]
        arc = arc[np.argsort(arc[:, 2])]
        out_way = np.array([side, 0.0, 0.3]) / np.linalg.norm([side, 0.0, 0.3])
        tip = np.array([side * 0.07, arc[-1][1], top + COLLAR['over']])
        line = np.concatenate([arc + out_way * COLLAR['pad'] * 0.9, [tip]])
        out.append(piece(f'hame_{i}', 'trim', *tube(line, COLLAR['hame'], 6), neck))
        out.append(piece(f'terret_{i}', 'iron', *ring(tip + np.array([0.0, 0.0, 0.03]), [0.0, 1.0, 0.0], 0.026, 0.006),
                         neck))
    return out


def pad_pieces():
    """A pole team's back pad over the back where a saddle would sit, its girth under the belly and a terret either
    side of the spine on top of it: the pad and terrets on the spine's bone, the girth on the chest's."""
    spine, chest = bone('Spine'), bone('Chest')
    pad = back_rows(PAD)
    p, t, n = body_mesh()
    chain = max(section(p, t, n, np.array([0.0, GIRTH['at'], 0.0]), [0.0, 1.0, 0.0]), key=len)
    q = np.array([c[0] for c in chain])
    low = [c for c in chain if c[0][2] < q[:, 2].max() - PAD['drop'] + 0.04]
    low.sort(key=lambda c: math.atan2(-c[0][0], c[0][2] - q[:, 2].min() - 0.2))
    gp, gn = resample(low, 30)
    out = [piece('pad', 'seat', *solid(*pad), spine),
           piece('girth', 'strap', *ribbon(gp, gn, GIRTH['width'], GIRTH['lift']), chest)]
    top = max(section(p, t, n, np.array([0.0, PAD_TERRET['at'], 0.0]), [0.0, 1.0, 0.0]), key=len)
    crest = max(c[0][2] for c in top) + PAD['lift'] + 0.012
    for i, side in enumerate((1.0, -1.0)):
        at = np.array([side * PAD_TERRET['side'], PAD_TERRET['at'], crest + PAD_TERRET['radius']])
        out.append(piece(f'pad_terret_{i}', 'iron', *ring(at, [0.0, 1.0, 0.0], PAD_TERRET['radius'], 0.006), spine))
    return out


def all_pieces(height=1.0, reins=True, harness=False, team=False):
    """Every piece of the tack, the stirrups and reins at a rider `height`; with `harness`, the Small Cart's driving
    harness on too (its driver rides the horse in its shafts). With `team`, a pole team's harness instead: the driving
    bridle and the collar, and a back pad in the saddle's place, no saddle, bags, stirrups or reins (a bench wagon's
    pair, which no one rides; the lines are the driver's, fpreins.py)."""
    if team:
        return [*bridle(), *blinker_pieces(), *collar_pieces(), *pad_pieces()]
    return [*bridle(), *saddle_pieces(), *stirrup_pieces(height), *bag_pieces(),
            *(rein_pieces(height) if reins else []), *(blinker_pieces() + collar_pieces() if harness else [])]


def bake_mesh(part, pieces, names):
    """`pieces` as one mesh of the game's bake: each vertex's place, normal, UV into the swatches' stripes, four bones and
    weights, and the triangles."""
    pos, nrm, uv, jj, ww, idx = [], [], [], [], [], []
    base = 0
    for pc in pieces:
        p, t = pc['positions'], pc['triangles']
        normals = np.zeros_like(p)
        a, b, c = p[t[:, 0]], p[t[:, 1]], p[t[:, 2]]
        fn = np.cross(b - a, c - a)
        for k in range(3):
            np.add.at(normals, t[:, k], fn)
        normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
        u = (names.index(pc['material']) + 0.5) / len(names)
        pos.append(p)
        nrm.append(normals)
        uv.append(np.tile([u, 0.5], (len(p), 1)))
        jj.append(pc['joints'])
        ww.append(pc['weights'])
        idx.append(t + base)
        base += len(p)
    return {'part': part, 'texture': 'tack', 'alpha': False,
            'positions': np.round(np.concatenate(pos), 4).ravel().tolist(),
            'normals': np.round(np.concatenate(nrm), 4).ravel().tolist(),
            'uvs': np.round(np.concatenate(uv), 4).ravel().tolist(),
            'joints': np.concatenate(jj).ravel().tolist(),
            'weights': np.round(np.concatenate(ww), 4).ravel().tolist(),
            'indices': np.concatenate(idx).ravel().tolist()}


def bake_tack(out_dir, size=32):
    """The tack as the game's 3D horse reads it: `tack.json`, two meshes skinned to the bake's bones (the tack a horse
    wears, and the reins up to a rider's fists, drawn only under a rider), and `tack.png` (the swatches, a stripe
    each)."""
    from PIL import Image
    names = list(SWATCHES)
    meshes = [bake_mesh('tack', all_pieces(1.0, reins=False), names), bake_mesh('reins', rein_pieces(1.0), names)]
    with open(os.path.join(out_dir, 'tack.json'), 'w') as fh:
        json.dump({'tack': 1, 'swatches': names, 'meshes': meshes}, fh, separators=(',', ':'))
        fh.write('\n')
    img = np.full((size, size * len(names), 4), 255, np.uint8)
    for i, n in enumerate(names):
        img[:, i * size:(i + 1) * size, :3] = SWATCHES[n]
    Image.fromarray(img).save(os.path.join(out_dir, 'tack.png'))
    return sum(len(m['positions']) // 3 for m in meshes)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--bake', required=True, help='the folder the game reads the horse from')
    args = ap.parse_args()
    v = bake_tack(args.bake)
    print(f'{v} vertices -> {args.bake}/tack.json, tack.png')
