"""Each armour set's own make of each piece: what tells one set from another at a sprite's size, piece by piece.

armour.py fits a set to the body (`Fit`), dresses it in its materials (`palette`) and wears its under-suit and yoke.
Where a set has its own make of a piece here (`MAKES`), that make draws the whole piece; armour.py's shared builders
draw only what a set has no make for. A make is built from the kit's solids (armourkit.py) and the shapes below,
never from another set's make, so no two sets share a piece's design.

A sprite's pixel is 1.6 cm, so a make is told by its outline and its broad masses: a splint, a band, a flute, a fur
roll or a blade is two pixels or more across, and a rivet is drawn only where a row of them reads as a line."""
import math

import numpy as np

import armour as A
from armourkit import TAU, Mesh, box, cap_band, dome, rot, solid, spike, strap, tube
from rig import arm_z, rest

FRONT = -math.pi / 2
BACK = math.pi / 2


# -- shapes the makes are built from

def outward(fit, region, z, p):
    """The way out of the limb or torso at `p`, level, from the outline's centre at `z`."""
    o = np.asarray(p, float) - np.array([*fit.outline(region, z)[0], z])
    o[2] = 0.0
    return o / max(np.linalg.norm(o), 1e-9)


def hoop(m, fit, region, z, gap, half=0.007, thick=0.004, slot=A.S_STRAP, th=None, keel_h=0.0, closed=None):
    """A band round a limb or the torso at `z`, `half` above and below it: a strap, a raised band, a garter."""
    g = fit.band(region, [z + half, z - half], gap, th=th, keel_h=keel_h)
    solid(m, g, thick, slot, closed=th is None if closed is None else closed)
    return g


def splints(m, fit, region, top, foot, gap, centre, span, n, width, thick, slot=A.S_PLATE, rivets=True, rows=5):
    """`n` splints down a limb from `top` to `foot`, spread `span` radians either side of `centre`, each `width`
    radians across: a solid strip with a rivet at each end."""
    out = []
    for t in np.linspace(centre - span, centre + span, n):
        g = fit.band(region, np.linspace(top, foot, rows), gap, th=np.linspace(t - width / 2, t + width / 2, 3),
                     keel_h=0.0)
        solid(m, g, thick, slot, closed=False)
        if rivets:
            for r in (1, rows - 2):
                p = g[r, 1]
                dome(m, p + outward(fit, region, float(p[2]), p) * thick * 0.5, 0.0055,
                     outward(fit, region, float(p[2]), p), A.S_TRIM)
        out.append(g)
    return out


def flutes(m, grid, every, radius, slot=A.S_TRIM, rows=None):
    """Raised flutes along a plate's columns, every `every`th, each a tube a little proud of its face."""
    g = np.asarray(grid, float)
    r0, r1 = rows or (0, len(g))
    for k in range(every // 2, g.shape[1], every):
        line = g[r0:r1, k]
        c = line.mean(axis=0)
        o = line - c
        o[:, 2] = 0.0
        tube(m, line + o / np.maximum(np.linalg.norm(o, axis=1, keepdims=True), 1e-9) * radius * 0.4, radius, slot,
             n=5)


def scallops(depth, count, at=FRONT):
    """A hem's lowering cut in round lobes, `count` round the whole loop: each lobe's foot round, a cusp between."""
    return lambda t: depth * np.abs(np.sin(count * (np.asarray(t, float) - at) / 2))


def disc(m, centre, normal, radius, thick, slot=A.S_PLATE, rim=None, boss=0.0, rivets=0, notch=0):
    """A round plate standing on a surface: its face toward `normal`, its edge rolled (`rim`), a domed `boss` at its
    heart and `rivets` round it; `notch` cuts its edge into a gear's teeth."""
    n = np.asarray(normal, float)
    n /= max(np.linalg.norm(n), 1e-9)
    u = np.cross(n, (0.0, 0.0, 1.0) if abs(n[2]) < 0.9 else (1.0, 0.0, 0.0))
    u /= np.linalg.norm(u)
    w = np.cross(n, u)
    th = np.linspace(0.0, TAU, 33)[:-1]
    rr = radius * (1.0 - (0.14 * (np.sin(th * notch) > 0.2) if notch else np.zeros_like(th)))
    c = np.asarray(centre, float)
    face = np.array([[c + n * thick + (u * math.cos(t) + w * math.sin(t)) * k * rr[i] for i, t in enumerate(th)]
                     for k in (1.0, 0.985)])
    solid(m, face, thick, slot, inward=lambda g: -np.broadcast_to(n, g.shape))
    if rim:
        tube(m, [c + n * thick + (u * math.cos(t) + w * math.sin(t)) * radius for t in th], rim, A.S_TRIM, n=5,
             closed=True)
    if boss:
        dome(m, c + n * thick, boss, n, A.S_TRIM, height=boss * 0.8)
    for t in np.linspace(0.0, TAU, rivets + 1)[:-1] if rivets else ():
        dome(m, c + n * thick + (u * math.cos(t) + w * math.sin(t)) * radius * 0.7, 0.0055, n, A.S_TRIM)
    return c + n * thick


def blade(m, root, tip, width, normal, thick, slot=A.S_PLATE, curve=None, rows=8, rim=None, belly=0.35):
    """A flat blade from `root` to `tip`, `width` across at its broadest (`belly` of the way along), its face toward
    `normal`, bowed by `curve` toward a direction as it runs out: a feather, a fin, a leaf, a tusk's flat."""
    root, tip, n = (np.asarray(v, float) for v in (root, tip, normal))
    d = tip - root
    across = np.cross(d, n)
    across /= max(np.linalg.norm(across), 1e-9)
    spine, half = [], []
    for f in np.linspace(0.0, 1.0, rows):
        p = root + d * f
        if curve is not None:
            p = p + np.asarray(curve, float) * math.sin(f * math.pi / 2) ** 2
        spine.append(p)
        grow = f / belly if f < belly else 1.0 - (f - belly) / (1.0 - belly)
        half.append(width / 2 * max(grow, 0.0) ** 0.7 + 0.0012)
    spine, half = np.array(spine), np.array(half)
    g = np.stack([spine - across * half[:, None], spine, spine + across * half[:, None]], axis=1)
    g[:, 1] += n * thick * 0.6   # a ridge down its middle, so its two faces take the light apart
    solid(m, g, thick, slot, closed=False, inward=lambda gg: -np.broadcast_to(n, gg.shape))
    if rim:
        tube(m, np.concatenate([g[:, 0], g[::-1, 2]]), rim, A.S_TRIM, n=4)
    return spine


def wraps(m, fit, region, top, foot, gap, turns, width, thick, slot=A.S_STRAP, rows=30, start=0.0):
    """A strip wound round a limb from `top` down to `foot`, `turns` times round: a puttee, a leather wrap."""
    pts, nrm = [], []
    for f in np.linspace(0.0, 1.0, rows):
        z = top + (foot - top) * f
        t = start + TAU * turns * f
        p = fit.band(region, [z], gap, th=[t], keel_h=0.0)[0, 0]
        pts.append(p)
        nrm.append(outward(fit, region, z, p))
    strap(m, pts, nrm, width, thick, slot)


def cuff(m, fit, region, wrist, reach, flare, gap, thick, slot, facing, rows=5, hem=None, top=None, keel_h=0.0):
    """A gauntlet's cuff from `reach` above the wrist down to just past it, flaring `flare` metres out at its foot
    (a bell), its foot lowered by `hem(th)` and its top raised by `top(th)`."""
    g = fit.band(region, np.linspace(wrist + reach, wrist - 0.006, rows),
                 lambda z: gap + flare * max(0.0, 1.0 - (z - wrist + 0.006) / (reach + 0.006)) ** 1.6,
                 keel_h=keel_h, facing=facing, hem=hem, top=top)
    solid(m, g, thick, slot)
    return g


def head_shell(hc, radii, lat, lon, point=0.0, tilt=None, out=0.0):
    """A point on a helm's skull (cap_band's ellipsoid, drawn in toward its top by `point`), `out` proud of it."""
    lat, lon = np.broadcast_arrays(np.asarray(lat, float), np.asarray(lon, float))
    p = np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1) * np.asarray(radii)
    if point:
        p[..., :2] *= (1 - point * np.maximum(np.sin(lat), 0.0) ** 2)[..., None]
    n = p / np.asarray(radii) ** 2
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    p = p + n * out
    R = np.eye(3) if tilt is None else np.asarray(tilt)
    return hc + p @ R.T


def helm_frame(fit, tall=1.0, wide=(1.0, 1.0), above=0.0):
    """The head a helm is fitted to: its centre, its skull's radii (`tall`, `wide`), its brow's latitude, and the
    skull's points."""
    hc, radii = A.head(fit)
    sr, low, p = A.skull(fit, hc, radii, tall, wide, above)
    return hc, sr, low, p


def visor_front(hc, sr, p, out=0.01):
    """How far forward a face-closing plate must stand: past the nose."""
    return np.array([sr[0] + 0.006, max(sr[1], hc[1] - p[:, 1].min()) + out, sr[2]])


class section:
    """A band drawn in another section for a while (a squared or faceted vambrace on a round set)."""

    def __init__(self, fit, sec):
        self.fit, self.sec = fit, sec

    def __enter__(self):
        self.old = self.fit.s.get('section')
        self.fit.s['section'] = self.sec

    def __exit__(self, *_):
        if self.old is None:
            self.fit.s.pop('section', None)
        else:
            self.fit.s['section'] = self.old


def shoulder_frame(fit, side):
    """A shoulder's cap: its centre under the shoulder's top, its half-breadth across, front to back and up, the
    direction of the arm's side (`mid`), and its sign."""
    x = 1.0 if side == 'L' else -1.0
    lo, hi = fit.shoulder(side)
    r = np.array([(hi[0] - lo[0]) / 2, (hi[1] - lo[1]) / 2, 0.1])
    c = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, hi[2] - r[2]])
    return c, r, (0.0 if side == 'L' else math.pi), x, lo, hi


def standing_lip(m, fit, side, height, width=0.075, lean=0.25, thick=0.006, slot=A.S_PLATE, peak=False):
    """A plate standing up along a pauldron's inner edge by the neck (a haute-piece), front to back, leaning out,
    its top rolled."""
    c, r, mid, x, lo, hi = shoulder_frame(fit, side)
    xin = (lo[0] if x > 0 else hi[0]) + x * 0.03
    y = np.linspace(-width, width, 11)
    f = np.linspace(-1.0, 1.0, 11)
    rise = height * (np.clip(1.0 - np.abs(f), 0, 1) ** 1.2 if peak else np.cos(f * math.pi / 2) ** 0.6)
    base = np.stack([np.full_like(y, xin), c[1] + y, np.full_like(y, hi[2] + 0.012) - 0.02 * f ** 2], axis=1)
    top = base + np.stack([x * lean * rise, 0 * y, rise], axis=1)
    solid(m, np.array([base, (base + top) / 2, top]), thick, slot, closed=False,
          inward=lambda g: np.broadcast_to([-x, 0.0, 0.0], g.shape))
    tube(m, top, 0.0045, A.S_TRIM, n=5)


def knuckles(x, closed, P):
    """The points across a hand's knuckles, thumb side last, and the way out of them."""
    if closed:
        kc = [np.array(P(0.021, f, _knuckle_d())) for f in np.linspace(-0.032, 0.036, 5)]
        out = np.array(P(0.6, 0, 0.8)) - np.array(P(0, 0, 0))
    else:
        kc = [np.array(P(0.004, f, 0.084)) for f in np.linspace(-0.032, 0.036, 5)]
        out = np.array(P(1, 0, 0)) - np.array(P(0, 0, 0))
    return np.array(kc), out / np.linalg.norm(out)


def _knuckle_d():
    import model
    return model.knuckle_at(0.093) - 0.003


def back_of_hand(P, d):
    """The middle of the back of the hand `d` down it, and the way out of it."""
    out = np.array(P(1, 0, 0)) - np.array(P(0, 0, 0))
    return np.array(P(0.03, 0.002, d)), out / np.linalg.norm(out)


def eye_z(p):
    """The eyes' height on this head: a little above its nose's tip."""
    ridge = p[(np.abs(p[:, 0]) < 0.006) & (p[:, 2] > 1.58) & (p[:, 2] < 1.72)]
    return float(ridge[np.argmin(ridge[:, 1])][2]) + 0.034


def over_shoulder(fit, side, u, v, z, lift, reach=0.04, spread=0.035, start=0.015):
    """A flat plate's grid over a shoulder: `u` from the neck (0) out past the arm (1, `reach` beyond it), `v` from
    the front (-1) to the back (1), `z(u, v)` its height off the shoulder's top, each point lifted clear of the
    shoulder and arm under it by `lift`."""
    c, r, mid, x, lo, hi = shoulder_frame(fit, side)
    xin, xout = (lo[0], hi[0]) if x > 0 else (hi[0], lo[0])
    span, cy, half = abs(xout - xin), (lo[1] + hi[1]) / 2, (hi[1] - lo[1]) / 2 + spread
    U, V = np.meshgrid(np.asarray(u, float), np.asarray(v, float), indexing='ij')
    X = xin + x * (start + (span + reach) * U)
    Y = cy + half * V
    Z = hi[2] + z(U, V)
    piece = fit.piece.astype(str)
    under = (piece == 'torso') | np.char.startswith(piece, 'arm_')
    near = fit.body.rest[under & (fit.body.rest[:, 2] > hi[2] - 0.3)]
    for i in range(X.shape[0]):
        for j in range(X.shape[1]):
            d = (near[:, 0] - X[i, j]) ** 2 + (near[:, 1] - Y[i, j]) ** 2
            below = near[d < 0.016 ** 2]
            if len(below):
                Z[i, j] = max(Z[i, j], below[:, 2].max() + lift)
    return np.stack([X, Y, Z], axis=-1)


def flat(m, g, thick, slot, rim=None, rim_slot=A.S_TRIM):
    """A plate of grid `g` (as `over_shoulder` lays it), thick downward, its edge rolled all round."""
    solid(m, g, thick, slot, closed=False, inward=lambda gg: np.broadcast_to([0.0, 0.0, -1.0], gg.shape))
    if rim:
        tube(m, np.concatenate([g[0], g[1:, -1], g[-1, ::-1][1:], g[::-1, 0][1:]]), rim, rim_slot, n=5, closed=True)
    return g


def tongue(m, top, foot, width, normal, thick, slot, rim=None):
    """A flat strip from `top` down to `foot`, `width` across, its end rounded: a fringe's tail, a hanging lappet."""
    top, foot, n = (np.asarray(v, float) for v in (top, foot, normal))
    d = foot - top
    across = np.cross(d, n)
    across /= max(np.linalg.norm(across), 1e-9)
    rows = []
    for f in np.linspace(0.0, 1.0, 6):
        w = width / 2 * (math.cos((f - 0.7) / 0.3 * math.pi / 2) ** 0.5 if f > 0.7 else 1.0) + 0.001
        p = top + d * f
        rows.append([p - across * w, p, p + across * w])
    g = np.array(rows)
    solid(m, g, thick, slot, closed=False, inward=lambda gg: -np.broadcast_to(n, gg.shape))
    if rim:
        tube(m, np.concatenate([g[:, 0], g[::-1, 2]]), rim, A.S_TRIM, n=4)
    return g


def hang(parts, mat, fit, items):
    A._hang_all(parts, mat, items, fit)


def leg_frame(side):
    """A leg's knee height, its outer side's direction and its sign."""
    x = 1.0 if side == 'L' else -1.0
    return rest(f'shin_{side}')[2] + 0.005, (0.0 if side == 'L' else math.pi), x


def arm_frame(side):
    """A forearm's wrist and elbow heights (the shared gauntlet's), its outer side and its sign."""
    x = 1.0 if side == 'L' else -1.0
    return arm_z(0.972) - 0.04, rest(f'farm_{side}')[2] - 0.025, (0.0 if side == 'L' else math.pi), x


def foot_base(ft, fit, side, slot, thick, kh=0.0, sole=A.S_DARK, sole_th=0.006):
    """What every boot needs under its make: the heel cup wrapped round the heel and shut, and the sole, so no bare
    heel shows in a stride. Gives (heel, toe) along Y and the over-the-foot directions."""
    pts = fit.body.rest[fit.piece == f'barefoot_{side}']
    heel, toe = float(pts[:, 1].max()) - 0.004, float(pts[:, 1].min()) + 0.004
    over = np.linspace(-0.4, math.pi + 0.4, 21)
    under = np.linspace(math.pi + 0.4, TAU - 0.4, 9)
    back = A._foot_rows(fit, side, np.linspace(heel - 0.03, heel, 3), 0.005, A.angles(32), kh)
    back = A._shut(back, [heel + 0.007, heel + 0.011, heel + 0.013], [0.65, 0.25, 0.0])
    solid(ft, back, thick, slot, closed=True, inward=lambda gg: A._toward_axis(gg))
    cup = A._foot_rows(fit, side, np.linspace(0.02, heel - 0.025, 4), 0.005, over, kh)
    solid(ft, cup, thick, slot, closed=False, inward=lambda gg: A._toward_axis(gg))
    s = A._foot_rows(fit, side, np.linspace(heel, toe, 12), 0.003, under)
    solid(ft, s, sole_th, sole, closed=False, inward=lambda gg: A._toward_axis(gg))
    return heel, toe, over


def foot_shell(ft, fit, side, ys, gap, over, thick, slot, kh=0.0):
    rows = A._foot_rows(fit, side, ys, gap, over, kh)
    solid(ft, rows, thick, slot, closed=False, inward=lambda gg: A._toward_axis(gg))
    return rows


def foot_top(fit, side, y, gap=0.008):
    """A point on the top of the foot at `y` along it, and the way up out of it."""
    q = A._foot_rows(fit, side, [y], gap, [math.pi / 2])[0, 0]
    return q, np.array([0.0, 0.0, 1.0])


# ===================================================================================================================
# IRON: the north's crude iron, hammered in bands and splints and riveted, over mail, under fur. A spangenhelm,
# conical and framed in riveted ribs, a nasal, bone horns; a cuirass of hoops round the body, a strap down the back;
# each shoulder angular lames folded hard, strapped, fur at the neck; splinted forearms and shins, a round riveted disc
# over each knee; heavy round-toed boots shod in iron, a strap over the instep
# ===================================================================================================================

def iron_cuirass(parts, fit, mat):
    s = fit.s
    gap, thick = s['gap'], s['thick']
    chest, spine, pelvis = Mesh(), Mesh(), Mesh()
    torso = ['torso']
    vee = s.get('neckline')   # hers cut down in a V to the breast
    neck = (lambda t: -(vee[0] * np.clip(1 - np.abs((t - FRONT + math.pi) % TAU - math.pi) / vee[1], 0, 1))) \
        if vee else None
    # hoops round the body, each lapping the one below: the top one under the collar, the last on the belly
    zs = np.linspace(1.49, 1.04, 8)
    for k, (a, b) in enumerate(zip(zs, zs[1:])):
        on = chest if a > 1.2 else spine
        g = fit.band(torso, np.linspace(a + 0.006, b - 0.004, 3), gap + 0.0035 * (len(zs) - k) * 0.5,
                     top=neck if k == 0 else None,
                     bulge=(lambda z, t: 0.006 * A._toward(t, FRONT, 1.2)) if a > 1.2 and not fit.woman else None)
        solid(on, g, thick, A.S_PLATE)
        A._edge(on, g, len(g) - 1, 0.0045, A.S_TRIM)   # each hoop's foot rolled, a dark line under it
    # a strap down the front and the back over the hoops, where they close
    for at, on_top in ((FRONT, 1.47), (BACK, 1.49)):
        pts, nrm = [], []
        for z in np.linspace(on_top, 1.06, 14):
            p = fit.band(torso, [z], gap + thick + 0.006, th=[at], keel_h=0.0)[0, 0]
            pts.append(p)
            nrm.append(outward(fit, torso, z, p))
        strap(chest, pts, nrm, 0.028, 0.004, A.S_STRAP)
    # a riveted collar of iron round the neck
    cg = fit.band(torso, np.linspace(1.545, 1.49, 3), gap * 0.7 + 0.004)
    solid(chest, cg, thick, A.S_PLATE)
    tube(chest, A._out(cg, 0, 0.004)[0], 0.006, A.S_TRIM, n=6, closed=True)
    A._belt(pelvis, fit, 1.06, out=0.012)
    hang(parts, mat, fit, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                           ('armour_cuirass.pelvis', pelvis, 'pelvis')])
    # the arms in hoops to the elbow under the mantle, a riveted disc over each elbow
    for side in 'LR':
        rere, lower = Mesh(), Mesh()
        _, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        ez = rest(f'farm_{side}')[2]
        hz = np.linspace(arm_z(1.40), ez + 0.03, 5)
        for k, (a, b) in enumerate(zip(hz, hz[1:])):
            g = fit.band(region, np.linspace(a + 0.005, b, 3), gap * 0.7 + 0.002 * (len(hz) - k), keel_h=0.0)
            solid(rere, g, thick * 0.8, A.S_PLATE)
            A._edge(rere, g, len(g) - 1, 0.004, A.S_TRIM)
        p = fit.band(region, [ez], gap * 0.7 + 0.008, th=[BACK], keel_h=0.0)[0, 0]
        disc(lower, p, outward(fit, region, ez, p) + np.array([0.0, 0.0, -0.1]), 0.034, 0.005, rim=0.004, boss=0.011)
        hang(parts, mat, fit, [(f'armour_cuirass.rere_{side}', rere, f'uarm_{side}'),
                               (f'armour_cuirass.couter_{side}', lower, f'farm_{side}')])


def iron_pauldrons(parts, fit, mat):
    """Angular spaulders of hammered lames, none of them round: each lame flat across the shoulder's top and folded
    hard down the front and the back, the top one broadest from the neck out, each under it lower and further out
    down the arm, every foot rolled; a leather strap buckled down their middle, a roll of fur at the neck."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        c, r, mid, x, lo, hi = shoulder_frame(fit, side)
        xin, xout = (lo[0], hi[0]) if x > 0 else (hi[0], lo[0])
        span, cy, half = abs(xout - xin), (lo[1] + hi[1]) / 2, (hi[1] - lo[1]) / 2
        piece = fit.piece.astype(str)
        under = (piece == 'torso') | np.char.startswith(piece, 'arm_')
        near = fit.body.rest[under & (fit.body.rest[:, 2] > hi[2] - 0.3)]
        v = np.array([-1.0, -0.82, -0.5, 0.5, 0.82, 1.0])   # across, front to back: its flat top and its folds
        fold = np.array([0.075, 0.05, 0.0, 0.0, 0.05, 0.075])
        lames = 4
        mids = []
        for k in range(lames):
            u0 = 0.0 if k == 0 else 0.42 + 0.14 * (k - 1)   # where it starts out from the neck
            u = np.linspace(u0, 1.0, 9)[:, None]
            reach = span * u + 0.035 * u ** 2 * (1.0 + 0.4 * k)   # past the arm a little
            X = xin + x * (0.012 + reach) + 0 * v
            Y = cy + v * (half + 0.03 - 0.006 * k)
            past = np.clip((u - 0.62) / 0.38, 0.0, 1.0)
            Z = hi[2] + 0.016 - 0.04 * k - 0.07 * past ** 1.6 - fold * (1.0 + 0.3 * past)
            X, Y, Z = (np.array(a, float) for a in np.broadcast_arrays(X, Y, Z))
            for i in range(X.shape[0]):   # clear of the shoulder, and of the lames under it
                for j in range(X.shape[1]):
                    d = (near[:, 0] - X[i, j]) ** 2 + (near[:, 1] - Y[i, j]) ** 2
                    under = near[d < 0.016 ** 2]
                    if len(under):
                        Z[i, j] = max(Z[i, j], under[:, 2].max() + s['gap'] + 0.006 + 0.007 * (lames - k))
            g = np.stack([X, Y, Z], axis=-1)
            solid(m, g, s['thick'], A.S_PLATE, closed=False,
                  inward=lambda gg: np.broadcast_to([0.0, 0.0, -1.0], gg.shape))
            tube(m, np.concatenate([g[-1, :], g[::-1, -1][1:], g[0, ::-1][1:], g[:, 0][1:]]), 0.0045, A.S_TRIM, n=5)
            mids.append(g[:, 2:4].mean(axis=1))
        # the strap from the top lame's crown down over each lame's middle to the last, buckled on the top one
        line = np.concatenate([mm[[0, len(mm) // 2, -1]] for mm in mids])
        line = line[np.argsort(-line[:, 2])]
        line = line + np.array([0.0, 0.0, 0.009])
        strap(m, line, np.tile([0.0, 0.0, 1.0], (len(line), 1)), 0.026, 0.004, A.S_STRAP)
        box(m, line[2] + np.array([0.0, 0.0, 0.006]), (0.024, 0.02, 0.007), (0.0, 0.0, 1.0), (x, 0.0, 0.0), A.S_TRIM)
        # the fur at the neck, under the top lame's inner edge
        fur_line = np.stack([np.full(9, xin + x * 0.01), cy + np.linspace(-half - 0.02, half + 0.02, 9),
                             np.full(9, hi[2] + 0.004)], axis=1)
        A._fur(m, {'fleece': True}, fur_line, np.tile([-x, 0.0, 0.4], (9, 1)), 0.03, seed=4 if side == 'L' else 8)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def iron_gauntlets(parts, fit, mat):
    """Splints down the forearm's outer side and back, strapped on twice, over a mail sleeve; a short iron cuff."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        solid(m, fit.band(region, np.linspace(elbow, wrist + 0.02, 5), 0.004, keel_h=0.0), 0.003, A.S_MAIL)
        splints(m, fit, region, elbow - 0.005, wrist + 0.035, 0.009, out, 1.25, 5, 0.34, s['thick'] * 0.8)
        for z in (elbow - 0.04, wrist + 0.07):
            hoop(m, fit, region, z, 0.016, half=0.008)
        cuff(m, fit, region, wrist, 0.035, 0.012, 0.01, s['thick'] * 0.8, A.S_PLATE, out)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def iron_greaves(parts, fit, mat):
    """Mail on the thighs (the under-suit's); a round riveted disc over each knee, strapped; splints down the shin."""
    s = fit.s
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        p = fit.band(region, [kz + 0.01], 0.022, th=[FRONT], keel_h=0.0)[0, 0]
        disc(shin, p, outward(fit, region, kz, p) + np.array([0.0, 0.0, 0.15]), 0.05, 0.007, rim=0.006, boss=0.017,
             rivets=6)
        hoop(shin, fit, region, kz + 0.07, 0.012, half=0.009)   # its straps above and below the knee
        hoop(shin, fit, region, kz - 0.06, 0.016, half=0.009)
        splints(shin, fit, region, kz - 0.08, 0.17, 0.014, FRONT, 1.35, 5, 0.38, s['thick'])
        for z in (kz - 0.17, 0.26):
            hoop(shin, fit, region, z, 0.022, half=0.009)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def iron_boots(parts, fit, mat):
    """Heavy boots: an iron shaft to mid-shin under a riveted band, a broad round toe-cap and an instep plate, a
    leather strap buckled over the instep."""
    s = fit.s
    thick = s['thick'] * 0.85
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        region = [f'leg_{side}']
        g = fit.band(region, np.linspace(0.34, 0.03, 9), 0.007, keel_h=0.0)
        solid(sh, g, thick, A.S_PLATE)
        top = hoop(sh, fit, region, 0.33, 0.014, half=0.014, thick=0.005, slot=A.S_PLATE)
        A._rivets(sh, top, 0, 8, 0.0055)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        foot_shell(ft, fit, side, np.linspace(0.03, toe + 0.07, 4), 0.006, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.075, toe, 5), 0.011, over)
        cap = A._shut(cap, toe - np.array([0.008, 0.016]), [0.8, 0.4])
        solid(ft, cap, thick * 1.2, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        tube(ft, A._out(cap, 0, 0.002, axis=1)[0], 0.0055, A.S_TRIM, n=5)
        q, up = foot_top(fit, side, toe + 0.1, 0.012)   # the instep strap, across the foot, buckled outside
        band = A._foot_rows(fit, side, [toe + 0.105, toe + 0.09], 0.012, over)
        solid(ft, band, 0.004, A.S_STRAP, closed=False, inward=lambda gg: A._toward_axis(gg))
        j = 0 if x > 0 else band.shape[1] - 1
        box(ft, band[:, j].mean(axis=0), (0.022, 0.02, 0.006), np.array([x, 0.0, 0.3]), (0, 1, 0), A.S_TRIM)
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def iron_helm(parts, fit, mat):
    """A spangenhelm: a cone of iron framed by four riveted ribs from a broad brow band to a knob at its point, a
    nasal down over the nose, bone horns out wide from the temples and curling up to the crown's height."""
    s = fit.s
    m = Mesh()
    hc, sr, low, p = helm_frame(fit, tall=1.16)
    point = 0.55
    cap_band(m, hc, sr, (low, 1.5707), (0, TAU), s['thick'], A.S_PLATE, rows=12, cols=32, point=point)
    for lon in (FRONT, BACK, 0.0, math.pi):   # the frame's ribs, each riveted twice
        line = head_shell(hc, sr, np.linspace(low + 0.05, 1.5, 12), lon, point, out=0.004)
        tube(m, line, 0.0075, A.S_TRIM, n=6)
        for f in (3, 8):
            dome(m, line[f], 0.0065, line[f] - hc, A.S_TRIM)
    band = cap_band(m, hc, sr * 1.03, (low - 0.02, low + 0.16), (0, TAU), s['thick'] * 0.8, A.S_TRIM, rows=2,
                    cols=32)
    tube(m, A._out(band, 0, 0.002)[0], 0.0055, A.S_TRIM, n=5, closed=True)
    top = head_shell(hc, sr, 1.5707, 0.0, point)
    dome(m, top - np.array([0.0, 0.0, 0.008]), 0.016, (0.0, 0.0, 1.0), A.S_TRIM, height=0.018)
    cap_band(m, hc, sr + 0.008, (low - 0.5, low + 0.1), (FRONT - 0.11, FRONT + 0.11), s['thick'] * 0.9, A.S_PLATE,
             rows=4, cols=3)   # the nasal
    pts, r0 = A.HORNS['horned']
    past = max(0.0, sr[0] - 0.098)   # a broader head's horns start as far out of its side
    for x in (1, -1):
        P = np.array([hc + np.array([(px + past) * x, py, pz]) for px, py, pz in pts])
        t = np.linspace(0, 1, 12)
        Q = np.array([np.interp(t, np.linspace(0, 1, len(P)), P[:, k]) for k in range(3)]).T
        tube(m, Q, r0 * (1 - t) ** 0.9 + 0.003, A.S_HORN, n=8)
        tube(m, Q[:2] + np.array([0.0, 0.0, 0.0]), r0 * 1.25, A.S_TRIM, n=8)   # an iron collar round each horn's root
    hang(parts, mat, fit, [('armour_helm', m, 'head')])


# ===================================================================================================================
# STEEL: plain polished plate, well made. Its round helm with a nasal and mail hung from it is armour.py's shared
# builder, which only steel wears so, and its own comb keels the crown. Its own: a ridged breastplate under an arched
# plackart, a rib in a V, flank straps, a fauld, culet and tassets; spaulders of lames; arms jointed at a pointed,
# winged elbow; a keeled vambrace strapped above a short cuff; a round knee cop fanned outside; a cuffed boot
# ===================================================================================================================
def steel_cuirass(parts, fit, mat):
    """A polished cuirass, ridged and well fitted. The breastplate swells over the chest, keeled down its middle,
    its edges at the neck and the arms rolled bold, a raised rib across its top in a V; a plackart over its foot,
    arched and rolled; buckled straps joining breast and back at each flank; a gorget of two lames; the back ridged
    down the spine; a fauld of three rolled lames under a narrow belt, a culet over the seat and a small tasset of two
    lames over each thigh. The arms are jointed at the elbow: a ridged rerebrace flared under the pauldron, a lame
    above and below a pointed cop winged on its outer side."""
    s = fit.s
    gap, thick = s['gap'], s['thick']
    chest, spine, pelvis = Mesh(), Mesh(), Mesh()
    torso = ['torso']
    from armourkit import keel
    hole = lambda t: -0.075 * np.abs(np.cos(t)) ** 4   # noqa: E731  (its top cut down toward the armpits)
    breast = 0.3 if fit.woman else 1.0   # hers shaped by her own form
    swell = lambda z, t: (0.012 * breast * A._bump(z, 1.33, 0.13) * A._toward(t, FRONT, 1.4)   # noqa: E731
                          + keel(t, 0.007, 0.3, BACK))
    g = fit.band(torso, np.linspace(1.5, 1.17, 16), gap, keel_h=0.013, top=hole, bulge=swell)
    solid(chest, g, thick, A.S_PLATE)
    tube(chest, A._out(g, 0, 0.004)[0], 0.0065, A.S_TRIM, n=6, closed=True)
    t = np.linspace(FRONT - 0.95, FRONT + 0.95, 19)   # the rib across its top, dipped in a V to the keel
    rib = [fit.band(torso, [1.455 - 0.06 * (1.0 - abs(tt - FRONT) / 0.95)], gap + thick + 0.003, th=[tt],
                    keel_h=0.013, bulge=swell)[0, 0] for tt in t]
    tube(chest, rib, 0.005, A.S_TRIM, n=5)
    pk = fit.band(torso, np.linspace(1.29, 1.165, 6), gap + thick + 0.004,
                  th=np.linspace(FRONT - 1.55, FRONT + 1.55, 31), keel_h=0.01, bulge=swell,
                  top=lambda t: 0.06 * A._toward(t, FRONT, 1.5) ** 1.2)
    solid(chest, pk, thick, A.S_PLATE, closed=False)
    tube(chest, A._out(pk, 0, 0.004)[0], 0.0062, A.S_TRIM, n=6)
    for side in (0.0, math.pi):   # the flank straps, buckled
        for z in (1.38, 1.25):
            st = fit.band(torso, [z + 0.011, z - 0.011], gap + thick + 0.002,
                          th=np.linspace(side - 0.32, side + 0.32, 9), keel_h=0.0)
            solid(chest, st, 0.004, A.S_STRAP, closed=False)
            q = st[:, 4].mean(axis=0)
            box(chest, q, (0.02, 0.024, 0.006), outward(fit, torso, z, q), (0, 0, 1), A.S_TRIM)
    for k, (a, b) in enumerate(((1.55, 1.505), (1.51, 1.47))):   # the gorget
        gg = fit.band(torso, np.linspace(a, b, 3), gap * 0.7 + 0.004 * k)
        solid(chest, gg, thick * 0.8, A.S_PLATE)
        tube(chest, A._out(gg, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
    zs = (1.175, 1.115, 1.06, 1.0)
    for k, (a, b) in enumerate(zip(zs, zs[1:])):   # the fauld, each lame over the one below
        on = spine if a > 1.1 else pelvis
        lg = fit.band(torso, np.linspace(a + 0.008, b, 3), gap + 0.004 + 0.003 * k,
                      hem=(lambda t: -0.03 * A._toward(t, BACK, 1.3)) if fit.woman and k == 2 else None)
        solid(on, lg, thick, A.S_PLATE)
        tube(on, A._out(lg, len(lg) - 1, 0.003)[0], 0.0055, A.S_TRIM, n=5, closed=True)
    cu = fit.band(torso, np.linspace(1.0, 0.93, 3), gap + 0.016, th=np.linspace(BACK - 1.2, BACK + 1.2, 21),
                  keel_h=0.0, hem=lambda t: 0.02 * A._toward(t, BACK, 1.2))   # the culet over the seat
    solid(pelvis, cu, thick, A.S_PLATE, closed=False)
    A._rim(pelvis, cu, 0.0048, A.S_TRIM)
    A._belt(spine, fit, 1.12, out=0.012)
    hang(parts, mat, fit, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                           ('armour_cuirass.pelvis', pelvis, 'pelvis')])
    for side in 'LR':   # a small tasset of two lames over each thigh
        tm = Mesh()
        x = 1.0 if side == 'L' else -1.0
        leg = [f'leg_{side}']
        at = FRONT + 0.3 * x
        for k, (a, b) in enumerate(((0.96, 0.9), (0.91, 0.85))):
            tg = fit.band(leg, np.linspace(a, b, 3), gap + 0.018 + 0.003 * k, th=np.linspace(at - 0.9, at + 0.9, 13),
                          keel_h=0.0, hem=(lambda t: 0.015 * A._toward(t, at, 0.9)) if k == 1 else None)
            solid(tm, tg, thick, A.S_PLATE, closed=False)
            A._rim(tm, tg, 0.0045, A.S_TRIM)
        hang(parts, mat, fit, [(f'armour_cuirass.tasset_{side}', tm, f'thigh_{side}')])
    for side in 'LR':
        rere, lower = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        out = 0.0 if side == 'L' else math.pi
        region = [f'arm_{side}']
        ez = rest(f'farm_{side}')[2]
        top = arm_z(1.42)
        g = fit.band(region, np.linspace(top, ez + 0.07, 8),
                     lambda z: gap * 0.7 + 0.012 * max(0.0, (z - (top - 0.04)) / 0.04), keel_h=0.006, facing=out)
        solid(rere, g, thick * 0.8, A.S_PLATE)   # the rerebrace, ridged, its top flared under the pauldron
        tube(rere, A._out(g, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        tube(rere, A._out(g, len(g) - 1, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        la = fit.band(region, np.linspace(ez + 0.072, ez + 0.042, 3), gap * 0.7 + 0.004, keel_h=0.0)
        solid(rere, la, thick * 0.8, A.S_PLATE)   # a lame above the cop
        tube(rere, A._out(la, len(la) - 1, 0.003)[0], 0.004, A.S_TRIM, n=5, closed=True)
        cop = A._cop(fit, lower, region, ez, BACK, gap * 0.7 + 0.006, 0.045, 0.02, span=2.4)
        A._rim(lower, cop, 0.0045, A.S_TRIM)
        q = fit.band(region, [ez - 0.012], gap * 0.7 + 0.03, th=[BACK], keel_h=0.0)[0, 0]
        spike(lower, q - np.array([0.0, 0.01, -0.005]), q + np.array([0.0, 0.022, -0.012]), 0.012, A.S_PLATE, n=6)
        wq = fit.band(region, [ez], gap * 0.7 + 0.016, th=[out + 0.7 * x], keel_h=0.0)[0, 0]
        blade(lower, wq + np.array([0.0, 0.0, 0.028]), wq + np.array([0.0, 0.0, -0.03]), 0.05,
              outward(fit, region, ez, wq), 0.004, A.S_PLATE, curve=outward(fit, region, ez, wq) * 0.01,
              rim=0.0035, belly=0.5)   # the cop's wing, a leaf on its outer side
        lb = fit.band(region, np.linspace(ez - 0.042, ez - 0.072, 3), gap * 0.7 + 0.004, keel_h=0.0)
        solid(lower, lb, thick * 0.8, A.S_PLATE)   # and a lame below it
        tube(lower, A._out(lb, len(lb) - 1, 0.003)[0], 0.004, A.S_TRIM, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_cuirass.rere_{side}', rere, f'uarm_{side}'),
                               (f'armour_cuirass.couter_{side}', lower, f'farm_{side}')])


def steel_gauntlets(parts, fit, mat):
    """A vambrace keeled down its outer side, rolled at both ends, a leather strap buckled round it above the wrist;
    a short cuff over the wrist, its lip rolled."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow - 0.035, wrist + 0.045, 7), 0.008, keel_h=0.007, facing=out)
        solid(m, g, s['thick'] * 0.8, A.S_PLATE)
        tube(m, A._out(g, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        sg = hoop(m, fit, region, wrist + 0.075, 0.008 + s['thick'] + 0.004, half=0.008, slot=A.S_STRAP)
        j = int(np.argmax(sg[0, :, 0] * x))
        box(m, sg[:, j].mean(axis=0) + np.array([x * 0.003, 0.0, 0.0]), (0.018, 0.02, 0.006), np.array([x, 0.0, 0.0]),
            (0, 0, 1), A.S_TRIM)
        cf = cuff(m, fit, region, wrist, 0.045, 0.016, 0.011, s['thick'] * 0.8, A.S_PLATE, out)
        tube(m, A._out(cf, len(cf) - 1, 0.004)[0], 0.005, A.S_TRIM, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])



def steel_greaves(parts, fit, mat):
    s = fit.s
    gap = max(0.007, s['gap'] * 0.75)
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        A._cop(fit, shin, region, kz + 0.01, FRONT, gap + 0.004, 0.08, 0.026, span=1.45)
        p = fit.band(region, [kz + 0.005], gap + 0.022, th=[FRONT + 1.05 * x], keel_h=0.0)[0, 0]
        disc(shin, p, outward(fit, region, kz, p), 0.034, 0.005)
        hoop(thigh, fit, region, kz + 0.1, gap + 0.002, half=0.008)
        g2 = fit.band(region, np.linspace(kz - 0.065, 0.15, 9), gap, keel_h=0.008,
                      top=lambda t: 0.03 * A._toward(t, FRONT, 1.1))
        solid(shin, g2, s['thick'], A.S_PLATE)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def steel_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.8
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        region = [f'leg_{side}']
        solid(sh, fit.band(region, np.linspace(0.32, 0.03, 8), 0.006, keel_h=0.0), thick, A.S_PLATE)
        cf = fit.band(region, np.linspace(0.37, 0.29, 4), lambda z: 0.012 + 0.08 * (z - 0.29), keel_h=0.0)
        solid(sh, cf, thick, A.S_PLATE)   # its top turned down in a cuff
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.05, 3), 0.007, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.06, toe, 5), 0.005, over)
        cap = A._shut(cap, toe - np.array([0.006, 0.011]), [0.7, 0.25])
        solid(ft, cap, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def steel_hand(m, x, closed, P):
    """A bar across the knuckles, its ends rounded."""
    kc, out = knuckles(x, closed, P)
    tube(m, kc + out * 0.011, 0.0065, A.S_PLATE, n=6)


# ===================================================================================================================
# SILVER: Daggerfall's medium fighter (TEXTURE.488) made silversmith's work: fluted and scalloped. A dark burgonet,
# its comb tall, its peak over the eyes; broad shoulder plates fluted out from the neck, their
# edges cut in round lobes, a haute-piece standing by the neck; a dark bracer fluted down its length, rimmed bright,
# its cuff's lip lobed; a knee cop fluted like a shell over a fluted shin; a boot whose cuff is lobed and whose toe is
# long and pointed and fluted down the instep
# ===================================================================================================================

def silver_helm(parts, fit, mat):
    """A burgonet in the dark plate: a tall comb from the brow over the crown to the nape, its edge rolled bright; a
    peak standing out over the eyes; broad cheek plates down to the jaw, rimmed bright; a neck guard flared in two
    lames. Hers carries her bone horns up in a crescent."""
    s = fit.s
    m = Mesh()
    hc, sr, low, p = helm_frame(fit, tall=1.04, wide=(1.06, 1.05))
    thick = s['thick']
    cap_band(m, hc, sr, (low, 1.5707), (0, TAU), thick, A.S_SHADE, rows=10, cols=32)
    a = np.linspace(-1.2, 1.45, 19)   # the comb, front to back over the crown
    line = hc + np.stack([np.zeros_like(a), -np.sin(a) * sr[1], np.cos(a) * sr[2]], axis=1)
    up = (line - hc) / np.linalg.norm(line - hc, axis=1, keepdims=True)
    h = 0.048 * np.clip(np.cos(a * 0.8), 0, 1) ** 0.6 + 0.004
    crest = line + up * h[:, None]
    solid(m, np.stack([line, (line + crest) / 2, crest], axis=1), 0.008, A.S_SHADE, closed=False,
          inward=lambda g: np.broadcast_to([1.0, 0.0, 0.0], g.shape))
    tube(m, crest, 0.0048, A.S_TRIM, n=5)
    lon = np.linspace(FRONT - 1.05, FRONT + 1.05, 15)   # the peak over the eyes
    inner = head_shell(hc, sr, low + 0.03, lon, out=0.002)
    reach = 0.038 * np.cos((lon - FRONT) / 1.05 * math.pi / 2) ** 0.8
    o = inner - hc
    o[:, 2] = 0.0
    o /= np.linalg.norm(o, axis=1, keepdims=True)
    outer = inner + o * reach[:, None] - np.array([0.0, 0.0, 0.01])
    solid(m, np.stack([inner, outer]), thick * 0.8, A.S_SHADE, closed=False,
          inward=lambda g: np.broadcast_to([0.0, 0.0, -1.0], g.shape))
    tube(m, outer, 0.0045, A.S_TRIM, n=5)
    for x in (1, -1):   # the cheek plates
        a0 = FRONT + 0.62 * x
        cg = cap_band(m, hc, sr + 0.006, (-0.85, low + 0.03), (min(a0, a0 + 1.05 * x), max(a0, a0 + 1.05 * x)),
                      thick * 0.9, A.S_SHADE, rows=5, cols=9,
                      edge=lambda b, at=a0: 0.12 * max(0.0, 1.0 - abs(b - at) / 0.5))
        A._rim(m, cg, 0.0042, A.S_TRIM)
    for k in range(2):   # the neck guard
        a0 = low - 0.02 - 0.17 * k
        g = cap_band(m, hc + np.array([0.0, 0.004 * k, 0.0]), sr * (1.02 + 0.03 * (k + 1)), (a0 - 0.2, a0),
                     (BACK - 1.4, BACK + 1.4), thick * 0.8, A.S_SHADE, tilt=rot((1, 0, 0), -7 * (k + 1)), rows=2,
                     cols=14)
        tube(m, g[0], 0.004, A.S_TRIM, n=5)
    if fit.woman:   # her horns, as the woman medium fighter's
        pts, r0 = A.HORNS['bowl_horned']
        past = max(0.0, sr[0] - 0.098)
        for x in (1, -1):
            P = np.array([hc + np.array([(px + past) * x, py, pz]) for px, py, pz in pts])
            t = np.linspace(0, 1, 12)
            Q = np.array([np.interp(t, np.linspace(0, 1, len(P)), P[:, k]) for k in range(3)]).T
            tube(m, Q, r0 * (1 - t) ** 0.9 + 0.003, A.S_HORN, n=8)
    hang(parts, mat, fit, [('armour_helm', m, 'head')])


def silver_pauldrons(parts, fit, mat):
    s = fit.s
    pointed = s['paul'].get('point')   # hers drawn to a point over the arm
    for side in 'LR':
        m = Mesh()
        c, r, mid, x, lo, hi = shoulder_frame(fit, side)
        radii = (r + s['gap'] + 0.008) * np.array([1.3, 1.12, 0.62])
        R = rot((0, 1, 0), -22 * x)
        lon = (mid - 2.35, mid + 2.35)
        lobes = scallops(0.12, 11, at=mid)
        edge = (lambda b: float(lobes(b)) + 0.3 * max(0.0, math.cos(b - mid)) ** 4) if pointed else \
            (lambda b: float(lobes(b)))
        cap = cap_band(m, c, radii, (-0.2, 1.42), lon, s['thick'], A.S_PLATE, tilt=R, rows=10, cols=44, edge=edge)
        tube(m, cap[0], 0.0045, A.S_TRIM, n=5)
        for lo_ in np.linspace(lon[0] + 0.35, lon[1] - 0.35, 7):   # flutes fanned out from the neck
            tube(m, A._on_shell(c, radii, R, np.linspace(-0.05, 1.25, 9), lo_, 0.003), 0.0042, A.S_TRIM, n=5)
        standing_lip(m, fit, side, 0.04, lean=0.15)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def silver_gauntlets(parts, fit, mat):
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow - 0.005, wrist + 0.03, 7), 0.007, keel_h=0.0, facing=out)
        solid(m, g, s['thick'], A.S_SHADE)
        flutes(m, g, 6, 0.004)
        tube(m, A._out(g, 0, 0.004)[0], 0.005, A.S_TRIM, n=6, closed=True)
        cf = cuff(m, fit, region, wrist, 0.035, 0.016, 0.01, s['thick'], A.S_SHADE, out, hem=scallops(0.01, 12))
        tube(m, A._out(cf, len(cf) - 1, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def silver_greaves(parts, fit, mat):
    s = fit.s
    gap = max(0.007, s['gap'] * 0.75)
    woman = fit.woman and s.get('cuisse')
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        if woman:   # her thigh plates, in the breast's dark plate
            g = fit.band(region, np.linspace(0.9, kz + 0.07, 6), gap, th=np.linspace(FRONT - 1.6, FRONT + 1.6, 25),
                         keel_h=0.0)
            solid(thigh, g, s['thick'], A.S_SHADE, closed=False)
            flutes(thigh, g, 6, 0.004)
        cop = A._cop(fit, shin, region, kz + 0.01, FRONT, gap + 0.004, 0.08, 0.026, span=1.4)
        flutes(shin, cop, 4, 0.0042)   # fluted like a shell
        tube(shin, A._out(cop, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5)
        g2 = fit.band(region, np.linspace(kz - 0.06, 0.16, 8), gap, keel_h=0.006,
                      top=lambda t: 0.018 + scallops(0.015, 10)(t))
        solid(shin, g2, s['thick'], A.S_PLATE)
        flutes(shin, g2[:, :], 9, 0.004, rows=(0, len(g2) - 1))
        tube(shin, A._out(g2, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def silver_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.8
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        region = [f'leg_{side}']
        solid(sh, fit.band(region, np.linspace(0.31, 0.03, 8), 0.006, keel_h=0.0), thick, A.S_PLATE)
        cf = fit.band(region, np.linspace(0.36, 0.28, 4), lambda z: 0.01 + 0.07 * (z - 0.28), keel_h=0.0,
                      hem=scallops(0.022, 8))
        solid(sh, cf, thick, A.S_PLATE)   # its cuff lobed round its foot
        tube(sh, A._out(cf, len(cf) - 1, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.05, 3), 0.007, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.06, toe, 5), 0.006, over)
        cap = A._shut(cap, toe - np.array([0.014, 0.03, 0.05]), [0.72, 0.38, 0.05], drop=0.008)
        solid(ft, cap, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        line = A._foot_rows(fit, side, np.linspace(0.02, toe - 0.03, 9), 0.01, [math.pi / 2])[:, 0]
        tube(ft, line, 0.0042, A.S_TRIM, n=5)   # a flute down the instep to its point
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


# ===================================================================================================================
# LEATHER: a hunter's harness of boiled leather. Its cap with ear flaps and its strapped jerkin under a fur collar
# are armour.py's shared builders, which only leather wears so. Its own: each shoulder three stitched leather lappets
# hung over the arm and held by a strap; a stiff flared leather cuff over a bracer buckled twice; leather wound round
# the shin in a puttee under a padded knee; soft boots under a roll of fur
# ===================================================================================================================

def leather_pauldrons(parts, fit, mat):
    for side in 'LR':
        m = Mesh()
        c, r, mid, x, lo, hi = shoulder_frame(fit, side)
        R = rot((0, 1, 0), -26 * x)
        for k, (at, out) in enumerate(((mid - 0.75, 0.0), (mid + 0.75, 0.0), (mid, 0.006))):
            radii = (r + fit.s['gap'] + 0.01 + out) * np.array([1.05, 1.08, 1.0])
            lap = cap_band(m, c, radii, (-0.55, 1.25), (at - 0.42, at + 0.42), 0.006, A.S_LEATHER, tilt=R, rows=7,
                           cols=8, edge=lambda b, a=at: 0.18 * (1.0 - math.cos((b - a) / 0.42 * math.pi / 2)))
            A._rim(m, lap, 0.0035, A.S_STRAP)   # its edge stitched dark
        band = cap_band(m, c, (r + fit.s['gap'] + 0.022) * np.array([1.05, 1.08, 1.0]), (0.55, 0.72),
                        (mid - 1.4, mid + 1.4), 0.004, A.S_STRAP, tilt=R, rows=1, cols=16)
        box(m, band[1, 8], (0.024, 0.02, 0.007), band[1, 8] - c, (0, 0, 1), A.S_TRIM)   # its buckle
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def leather_gauntlets(parts, fit, mat):
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow, wrist + 0.06, 6), 0.007, keel_h=0.0)
        solid(m, g, 0.005, A.S_LEATHER)
        for z in (elbow - 0.035, wrist + 0.1):
            sg = hoop(m, fit, region, z, 0.0115, half=0.008)
            j = int(np.argmax(sg[0, :, 0] * x))
            box(m, sg[:, j].mean(axis=0) + np.array([x * 0.003, 0.0, 0.0]), (0.02, 0.02, 0.006),
                np.array([x, 0.0, 0.0]), (0, 0, 1), A.S_TRIM)
        cf = cuff(m, fit, region, wrist, 0.06, 0.04, 0.009, 0.005, A.S_LEATHER, out)
        tube(m, A._out(cf, len(cf) - 1, 0.003)[0], 0.0045, A.S_STRAP, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def leather_greaves(parts, fit, mat):
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        off = fit.s['gap']
        solid(shin, fit.band(region, np.linspace(kz - 0.02, 0.18, 6), off, keel_h=0.0), 0.004, A.S_STRAP)
        wraps(shin, fit, region, kz - 0.04, 0.19, off + 0.006, 4.0, 0.042, 0.004, A.S_LEATHER, rows=44,
              start=0.0 if side == 'L' else math.pi)
        A._cop(fit, shin, region, kz + 0.005, FRONT, 0.014, 0.06, 0.018, span=1.3, slot=A.S_LEATHER)
        hoop(shin, fit, region, kz + 0.075, off + 0.006, half=0.007)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def leather_boots(parts, fit, mat):
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        region = [f'leg_{side}']
        g = fit.band(region, np.linspace(0.3, 0.03, 8), 0.006, keel_h=0.0)
        solid(sh, g, 0.005, A.S_LEATHER)
        pts, o = A._out(fit.band(region, [0.3], 0.012, keel_h=0.0), 0)
        A._fur(sh, {'fleece': True}, pts, o, 0.034, seed=3 if side == 'L' else 4, closed=True)
        heel, toe, over = foot_base(ft, fit, side, A.S_LEATHER, 0.005)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.012, 10), 0.005, over, 0.005, A.S_LEATHER)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.012, toe, 3), 0.005, over)
        cap = A._shut(cap, toe - np.array([0.006, 0.011]), [0.7, 0.25])
        solid(ft, cap, 0.005, A.S_LEATHER, closed=False, inward=lambda gg: A._toward_axis(gg))
        seam = A._foot_rows(fit, side, np.linspace(0.02, toe + 0.01, 8), 0.006, [math.pi / 2])[:, 0]
        tube(ft, seam, 0.0022, A.S_STRAP, n=4)
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


# ===================================================================================================================
# CHAIN: a hauberk of riveted mail and its coif (armour.py's shared coif). Its own: the hauberk's hem and sleeves cut
# in round dags bound in leather, a mail tippet over the shoulders, dagged the same, a belt whose end hangs down; mail
# sleeves on the forearms under two leather bands and a stiff leather cuff; chausses cross-gartered under a boiled
# leather knee cop; low leather boots strapped at the ankle
# ===================================================================================================================

def chain_cuirass(parts, fit, mat):
    s = fit.s
    gap, thick = s['gap'], s['thick']
    chest, spine, pelvis = Mesh(), Mesh(), Mesh()
    torso = ['torso']
    solid(chest, fit.band(torso, np.linspace(1.48, 1.18, 8), gap), thick, A.S_MAIL)
    solid(spine, fit.band(torso, np.linspace(1.20, 0.98, 6), gap + 0.002), thick, A.S_MAIL)
    dags = scallops(0.035, 18)
    hem = fit.band(torso, np.linspace(1.0, 0.86, 4), lambda z: gap + 0.004 + 0.25 * (1.0 - z), hem=dags)
    solid(pelvis, hem, thick, A.S_MAIL)
    tube(pelvis, A._out(hem, len(hem) - 1, 0.002)[0], 0.0042, A.S_STRAP, n=5, closed=True)
    A._belt(pelvis, fit, 1.06)
    end = [fit.band(torso, [z], gap + 0.016, th=[FRONT + 0.32], keel_h=0.0)[0, 0] for z in np.linspace(1.05, 0.9, 6)]
    strap(pelvis, end, [outward(fit, torso, float(q[2]), q) for q in end], 0.026, 0.004, A.S_STRAP)
    # the tippet: mail over the shoulders' tops, flared and dagged, its middle on the chest and its sides with each
    # shoulder, so a raised arm carries its side up with it
    pieces = [(chest, 'chest', np.linspace(FRONT - 0.9, FRONT + 0.9, 15)),
              (chest, 'chest', np.linspace(BACK - 0.9, BACK + 0.9, 15))]
    shoulders = {'L': Mesh(), 'R': Mesh()}
    for side, at in (('L', 0.0), ('R', math.pi)):
        pieces.append((shoulders[side], side, np.linspace(at - 0.75, at + 0.75, 13)))
    region = ['torso', 'arm_L', 'arm_R']
    for m, _, th in pieces:
        g = fit.band(region, np.linspace(1.56, 1.37, 5), lambda z: gap + 0.012 + 0.05 * (1.56 - z) / 0.19, th=th,
                     keel_h=0.0, hem=scallops(0.022, 30))
        solid(m, g, thick, A.S_MAIL, closed=False)
        tube(m, A._out(g, len(g) - 1, 0.002)[0], 0.0042, A.S_STRAP, n=5)
    hang(parts, mat, fit, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                           ('armour_cuirass.pelvis', pelvis, 'pelvis'),
                           ('armour_cuirass.tippet_L', shoulders['L'], 'clav_L'),
                           ('armour_cuirass.tippet_R', shoulders['R'], 'clav_R')])
    for side in 'LR':   # the sleeves to above the elbow, dagged and bound
        rere = Mesh()
        region = [f'arm_{side}']
        ez = rest(f'farm_{side}')[2]
        g = fit.band(region, np.linspace(arm_z(1.43), ez + 0.08, 6), 0.012, keel_h=0.0, hem=scallops(0.018, 10))
        solid(rere, g, s['thick'] * 0.8, A.S_MAIL)
        tube(rere, A._out(g, len(g) - 1, 0.002)[0], 0.0038, A.S_STRAP, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_cuirass.rere_{side}', rere, f'uarm_{side}')])


def chain_gauntlets(parts, fit, mat):
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        solid(m, fit.band(region, np.linspace(elbow + 0.01, wrist + 0.02, 6), 0.006, keel_h=0.0), 0.004, A.S_MAIL)
        for z in (wrist + 0.085, wrist + 0.06):
            hoop(m, fit, region, z, 0.011, half=0.0075)
        cf = cuff(m, fit, region, wrist, 0.045, 0.026, 0.01, 0.005, A.S_STRAP, out)
        tube(m, A._out(cf, len(cf) - 1, 0.003)[0], 0.004, A.S_STRAP, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def chain_greaves(parts, fit, mat):
    s = fit.s
    off = s['gap']
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        solid(shin, fit.band(region, np.linspace(kz + 0.08, 0.2, 6), off, keel_h=0.0), 0.004, A.S_MAIL)
        hoop(shin, fit, region, kz + 0.08, off + 0.004, half=0.008)   # its garter
        for turn in (1.0, -1.0):   # cross-gartered down the shin
            wraps(shin, fit, region, kz - 0.06, 0.22, off + 0.006, turn * 1.5, 0.018, 0.0035, A.S_STRAP, rows=30,
                  start=FRONT + 0.3 * turn)
        A._cop(fit, shin, region, kz + 0.008, FRONT, off + 0.008, 0.065, 0.02, span=1.3, slot=A.S_LEATHER)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def chain_boots(parts, fit, mat):
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        region = [f'leg_{side}']
        g = fit.band(region, np.linspace(0.21, 0.03, 6), 0.006, keel_h=0.0)
        solid(sh, g, 0.005, A.S_LEATHER)
        tube(sh, A._out(g, 0, 0.003)[0], 0.0045, A.S_STRAP, n=5, closed=True)
        sg = hoop(sh, fit, region, 0.13, 0.009, half=0.009)
        j = int(np.argmax(sg[0, :, 0] * x))
        box(sh, sg[:, j].mean(axis=0) + np.array([x * 0.003, 0.0, 0.0]), (0.02, 0.022, 0.006), np.array([x, 0.0, 0.0]),
            (0, 0, 1), A.S_TRIM)
        heel, toe, over = foot_base(ft, fit, side, A.S_LEATHER, 0.005)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.012, 10), 0.005, over, 0.005, A.S_LEATHER)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.012, toe, 3), 0.005, over)
        cap = A._shut(cap, toe - np.array([0.006, 0.011]), [0.72, 0.3])
        solid(ft, cap, 0.005, A.S_LEATHER, closed=False, inward=lambda gg: A._toward_axis(gg))
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def silver_cuirass(parts, fit, mat):
    """A dark breastplate round to the flanks, its back left to the mail: smooth and swelling to a low peascod,
    fluted in a fan from the waist up to the collar, its foot cut in lobes, rimmed bright; two dark lames to the belt
    (hers a plate over her seat besides)."""
    s = fit.s
    gap, thick = s['gap'], s['thick']
    chest, spine, pelvis = Mesh(), Mesh(), Mesh()
    torso = ['torso']
    vee = s.get('neckline')
    cut = (lambda t: vee[0] * np.clip(1 - np.abs((t - FRONT + math.pi) % TAU - math.pi) / vee[1], 0, 1)) if vee else \
        (lambda t: 0.0)
    neck = lambda t: -0.08 * np.abs(np.cos(t)) ** 4 - cut(t)   # noqa: E731
    wrap = np.linspace(FRONT - 1.95, FRONT + 1.95, 60)
    swell = lambda z, t: 0.014 * A._bump(z, 1.27, 0.12) * A._toward(t, FRONT, 1.3)   # noqa: E731
    g = fit.band(torso, np.linspace(1.5, 1.17, 16), gap, th=wrap, bulge=swell, top=neck, hem=scallops(0.018, 22))
    solid(chest, g, thick, A.S_SHADE, closed=False)
    A._rim(chest, g, 0.0045, A.S_TRIM)
    for k in np.linspace(-3, 3, 7):   # the fan of flutes, from the waist's middle up and out to the collar
        line = [fit.band(torso, [z], gap + thick + 0.002, th=[FRONT + k * (0.05 + 0.32 * f)], bulge=swell)[0, 0]
                for f, z in zip(np.linspace(0, 1, 9), np.linspace(1.2, 1.45 - 0.03 * abs(k), 9))]
        tube(chest, line, 0.0042, A.S_TRIM, n=5)
    for k, (a, b) in enumerate(((1.19, 1.13), (1.14, 1.085))):
        lg = fit.band(torso, np.linspace(a, b, 3), gap + 0.003 + 0.002 * k, th=wrap)
        solid(spine, lg, thick, A.S_SHADE, closed=False)
        tube(spine, lg[-1], 0.004, A.S_TRIM, n=5)
    if s.get('fauld') == 'back':   # her plate over the seat
        seat = np.linspace(BACK - 0.85, BACK + 0.85, 25)
        solid(pelvis, fit.band(torso, np.linspace(1.095, 0.94, 6), gap + 0.006, th=seat), thick, A.S_PLATE,
              closed=False)
    A._belt(pelvis, fit, 1.085, out=0.01)
    hang(parts, mat, fit, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                           ('armour_cuirass.pelvis', pelvis, 'pelvis')])


# ===================================================================================================================
# ELVEN: gold worked like leaves. Its helm and its breast's chevrons are armour.py's shared builders, which only
# elven wears so. Its own: three curved leaf lames layered down each shoulder; leaves down the forearm, a
# cuff drawn to a leaf's point over the back of the hand; a knee plate drawn to a point above and below round a
# spiral, a shin ridged in a long S; boots whose toes curl up, a leaf swept back from each ankle
# ===================================================================================================================

def elven_gauntlets(parts, fit, mat):
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow, wrist + 0.03, 6), 0.006, keel_h=0.004, facing=out)
        solid(m, g, s['thick'] * 0.8, A.S_PLATE)
        for k in range(3):   # leaves lapped down the outer forearm, each pointing to the wrist
            z0 = elbow - 0.01 - 0.062 * k
            lift = 0.006 + s['thick'] + 0.003 * (3 - k)
            root = fit.band(region, [z0], lift, th=[out])[0, 0]
            tip = fit.band(region, [z0 - 0.09], lift, th=[out])[0, 0]
            blade(m, root, tip, 0.048, outward(fit, region, z0, root), 0.004, A.S_PLATE, rim=0.003, belly=0.4)
        q, o = A._out(g, 1, s['thick'])
        k = int(np.argmax(o[:, 1]))   # the spiral behind the elbow
        A._spiral(m, q[k], o[k], 0.028)
        cf = cuff(m, fit, region, wrist, 0.04, 0.012, 0.01, s['thick'] * 0.8, A.S_PLATE, out,
                  hem=lambda t, at=out: 0.04 * A._toward(t, at, 0.8) ** 1.5)
        tube(m, A._out(cf, len(cf) - 1, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def elven_greaves(parts, fit, mat):
    s = fit.s
    gap = max(0.007, s['gap'] * 0.75)
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        kp = fit.band(region, np.linspace(kz + 0.07, kz - 0.06, 8), gap + 0.006,
                      th=np.linspace(FRONT - 1.3, FRONT + 1.3, 19), keel_h=0.006,
                      bulge=lambda z, t: 0.02 * A._bump(z, kz + 0.005, 0.07) * A._toward(t, FRONT, 1.3),
                      top=lambda t: 0.07 * A._toward(t, FRONT, 0.9) ** 1.5,
                      hem=lambda t: 0.035 * A._toward(t, FRONT, 0.9) ** 1.5)
        solid(shin, kp, s['thick'], A.S_PLATE, closed=False)
        A._rim(shin, kp, 0.004, A.S_TRIM)
        q = kp[len(kp) // 2, kp.shape[1] // 2]
        A._spiral(shin, q, outward(fit, region, kz, q), 0.03)
        g2 = fit.band(region, np.linspace(kz - 0.075, 0.16, 9), gap, keel_h=0.004,
                      top=lambda t: 0.02 * A._toward(t, FRONT, 0.9))
        solid(shin, g2, s['thick'], A.S_PLATE)
        line = [fit.band(region, [z], gap + s['thick'] + 0.002, th=[FRONT + 0.3 * math.sin(f * TAU)])[0, 0]
                for f, z in zip(np.linspace(0, 1, 12), np.linspace(kz - 0.09, 0.18, 12))]
        tube(shin, line, 0.0045, A.S_TRIM, n=5)   # the long S of its ridge
        A._edge(shin, g2, len(g2) - 1, 0.0045)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def elven_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.8
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        region = [f'leg_{side}']
        g = fit.band(region, np.linspace(0.33, 0.03, 8), 0.006, keel_h=0.0,
                     top=lambda t: 0.04 * A._toward(t, FRONT, 0.8) ** 2)
        solid(sh, g, thick, A.S_PLATE)
        A._edge(sh, g, 0, 0.0045)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.05, 3), 0.007, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.06, toe, 5), 0.006, over)
        cap = A._shut(cap, toe - np.array([0.014, 0.028, 0.04]), [0.7, 0.35, 0.05], drop=-0.03)   # curled up
        solid(ft, cap, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        tube(ft, A._out(cap, 0, 0.002, axis=1)[0], 0.0045, A.S_TRIM, n=5)
        p = fit.band(region, [0.09], 0.016, th=[0.0 if x > 0 else math.pi], keel_h=0.0)[0, 0]
        blade(sh, p + np.array([0.0, -0.01, -0.01]), p + np.array([x * 0.012, 0.075, 0.05]), 0.04,
              np.array([x, 0.0, 0.0]), 0.004, A.S_PLATE, rim=0.003)   # a leaf swept back off the ankle
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def elven_hand(m, x, closed, P):
    """A leaf over the back of the hand, pointing to the knuckles."""
    a, o = back_of_hand(P, 0.012)
    b, _ = back_of_hand(P, 0.07 if not closed else 0.075)
    blade(m, a + o * 0.004, b + o * (0.012 if closed else 0.002), 0.034, o, 0.003, A.S_PLATE, rim=0.0025)


# ===================================================================================================================
# DWARVEN: bronze over near-black cloth, the plates standing apart from the dark. A closed helm under a tall crest,
# a grim faceplate barred at the mouth; a collar of stacked rolls; a broad breast banded, a studded strip down it, a
# dark belt under a bronze plate; rounded pauldrons studded at the rim and horned behind; bulky vambraces drawn to a
# point behind the elbow; a square knee over a tall ridged greave; blocky boots on thick soles, square toes
# ===================================================================================================================

def dwarven_gauntlets(parts, fit, mat):
    """A bulky vambrace up the forearm, banded twice, its top flared over the elbow and drawn up behind it to a point;
    a cuff flared over the wrist."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow + 0.015, wrist + 0.04, 8),
                     lambda z: 0.014 + 0.022 * max(0.0, (z - (elbow - 0.035)) / 0.05), keel_h=0.004, facing=out,
                     top=lambda t: 0.07 * A._toward(t, BACK, 0.8) ** 1.6)
        solid(m, g, s['thick'], A.S_PLATE)
        tube(m, A._out(g, 0, 0.003)[0], 0.006, A.S_TRIM, n=5, closed=True)
        for z in (elbow - 0.06, wrist + 0.07):
            hoop(m, fit, region, z, 0.014 + s['thick'] + 0.002, half=0.009, thick=0.006, slot=A.S_TRIM)
        cf = cuff(m, fit, region, wrist, 0.035, 0.016, 0.015, s['thick'], A.S_PLATE, out)
        tube(m, A._out(cf, len(cf) - 1, 0.003)[0], 0.0055, A.S_TRIM, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def dwarven_greaves(parts, fit, mat):
    """The thighs left to the dark cloth; a square knee plate, bordered and bossed; a tall greave cut square from the
    knee to the ankle, flared under the knee, ridged down its front and banded over the ankle."""
    s = fit.s
    gap = max(0.012, s['gap'])
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        with section(fit, ('square', 3)):
            kp = fit.band(region, np.linspace(kz + 0.08, kz - 0.05, 5), gap + 0.016,
                          th=np.linspace(FRONT - 1.3, FRONT + 1.3, 15), keel_h=0.0)
            g2 = fit.band(region, np.linspace(kz - 0.05, 0.14, 10),
                          lambda z: gap + 0.006 + 0.018 * np.clip((z - (kz - 0.12)) / 0.07, 0.0, 1.0), keel_h=0.0)
        solid(shin, kp, s['thick'] * 1.2, A.S_PLATE, closed=False)
        A._rim(shin, kp, 0.006, A.S_TRIM)
        q = kp[2, kp.shape[1] // 2]
        dome(shin, q + outward(fit, region, kz, q) * 0.004, 0.017, outward(fit, region, kz, q), A.S_PLATE, height=0.011)
        solid(shin, g2, s['thick'], A.S_PLATE)
        tube(shin, A._out(g2, 0, 0.004)[0], 0.006, A.S_TRIM, n=5, closed=True)
        for t in (FRONT - 0.45, FRONT, FRONT + 0.45):
            line = fit.band(region, np.linspace(kz - 0.1, 0.2, 7), gap + 0.006 + s['thick'] + 0.003, th=[t],
                            keel_h=0.0)[:, 0]
            tube(shin, line, 0.0055, A.S_TRIM, n=5)
        hoop(shin, fit, region, 0.17, gap + 0.006 + s['thick'] + 0.001, half=0.013, thick=0.006, slot=A.S_TRIM)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def dwarven_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.9
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        region = [f'leg_{side}']
        with section(fit, ('square', 3)):
            solid(sh, fit.band(region, np.linspace(0.3, 0.03, 8), 0.008, keel_h=0.0), thick, A.S_PLATE)
            for z in (0.29, 0.1):
                hoop(sh, fit, region, z, 0.016, half=0.014, thick=0.006, slot=A.S_TRIM)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick, sole_th=0.016)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.045, 3), 0.009, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.05, toe, 4), 0.01, over)
        cap = A._shut(cap, toe - np.array([0.006, 0.01]), [1.0, 0.92])
        solid(ft, cap, thick * 1.2, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        tube(ft, A._out(cap, 0, 0.002, axis=1)[0], 0.0055, A.S_TRIM, n=5)
        q, up = foot_top(fit, side, toe + 0.08, 0.016)
        box(ft, q, (0.05, 0.06, 0.008), up, (0, -1, 0), A.S_TRIM)   # a plate over the instep
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def dwarven_hand(m, x, closed, P):
    """A gear on the back of the hand."""
    c, o = back_of_hand(P, 0.045)
    disc(m, c + o * 0.006, o, 0.022, 0.004, A.S_TRIM, boss=0.008, notch=8)


# ===================================================================================================================
# MITHRIL: slight and winged. Its feathered helm, its pointed breast and its two-banded pauldrons are armour.py's
# shared builders, which only mithril wears so. Its own: a slender vambrace and a fan of three feathers swept back
# from the wrist; a narrow cuisse, a feathered wing off each knee's outer side, a shin drawn up to a long point over
# the knee; long pointed toes and two feathers swept back off each heel
# ===================================================================================================================

def feathers(m, root, out, back, n, length, spread, width=0.026, slot=A.S_TRIM):
    """`n` feathers fanned from `root`: out from the surface (`out`) and swept toward `back`, each `length`, fanned
    `spread` radians about the middle one."""
    out, back = (np.asarray(v, float) / np.linalg.norm(v) for v in (out, back))
    side = np.cross(out, back)
    for k in np.linspace(-1.0, 1.0, n):
        a = k * spread
        d = back * math.cos(a) + side * math.sin(a) + out * 0.25
        d /= np.linalg.norm(d)
        blade(m, root + side * 0.006 * k, root + d * length * (1.0 - 0.15 * abs(k)), width, out, 0.003, slot,
              curve=out * 0.012, belly=0.55)


def mithril_gauntlets(parts, fit, mat):
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow, wrist + 0.03, 7), 0.004, keel_h=0.003, facing=out)
        solid(m, g, s['thick'] * 0.7, A.S_PLATE)
        cf = cuff(m, fit, region, wrist, 0.03, 0.008, 0.007, s['thick'] * 0.7, A.S_PLATE, out)
        tube(m, A._out(cf, 0, 0.003)[0], 0.0038, A.S_TRIM, n=5, closed=True)
        root = fit.band(region, [wrist + 0.045], 0.012, th=[out], keel_h=0.0)[0, 0]
        feathers(m, root, outward(fit, region, wrist, root), (0.0, 0.0, 1.0), 3, 0.15, 0.4, width=0.036)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def mithril_greaves(parts, fit, mat):
    s = fit.s
    gap = max(0.006, s['gap'] * 0.6)
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        cu = fit.band(region, np.linspace(0.9, kz + 0.08, 6), gap, th=np.linspace(FRONT - 1.2, FRONT + 1.2, 17),
                      keel_h=0.006)
        solid(thigh, cu, s['thick'] * 0.8, A.S_PLATE, closed=False)
        A._rim(thigh, cu, 0.0035, A.S_TRIM)
        A._cop(fit, shin, region, kz + 0.008, FRONT, gap + 0.003, 0.06, 0.016, span=1.2)
        root = fit.band(region, [kz + 0.01], gap + 0.02, th=[FRONT + 1.2 * x], keel_h=0.0)[0, 0]
        feathers(shin, root, outward(fit, region, kz, root), (0.0, 0.6, 0.8), 3, 0.14, 0.45, width=0.036)
        g2 = fit.band(region, np.linspace(kz - 0.07, 0.16, 9), gap, keel_h=0.005,
                      top=lambda t: 0.08 * A._toward(t, FRONT, 0.55) ** 2)
        solid(shin, g2, s['thick'] * 0.8, A.S_PLATE)
        A._edge(shin, g2, 0, 0.0035)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def mithril_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.7
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        region = [f'leg_{side}']
        g = fit.band(region, np.linspace(0.32, 0.03, 8), 0.005, keel_h=0.0)
        solid(sh, g, thick, A.S_PLATE)
        A._edge(sh, g, 0, 0.0035)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.05, 3), 0.006, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.06, toe, 5), 0.005, over)
        cap = A._shut(cap, toe - np.array([0.016, 0.034, 0.058]), [0.7, 0.35, 0.04], drop=0.006)
        solid(ft, cap, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        root = fit.band(region, [0.1], 0.012, th=[BACK + 0.6 * x], keel_h=0.0)[0, 0]
        feathers(sh, root, np.array([x, 0.4, 0.0]), (0.0, 1.0, 0.45), 2, 0.09, 0.3, width=0.03)
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


# ===================================================================================================================
# ADAMANTIUM: polished, massive, rounded. Its plackarted breast is armour.py's shared builder, which only adamantium
# wears so. Its own: a smooth closed helm opened in a dark T under a comb and the pale blue gem; rounded pauldrons
# flared at the foot like a bell, combed and gemmed; keeled arms to a domed cop fanned outside; a vambrace drawn up
# behind the elbow; a heavy cuisse over a great domed knee, a shin ribbed round under a flared top; broad sabatons
# ===================================================================================================================

def adamantium_gauntlets(parts, fit, mat):
    """A vambrace keeled down its outer side, its top drawn up behind into a rounded tongue over the elbow's foot, two
    bands round it above the wrist, a cuff a little flared over the wrist, its lip rolled."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow + 0.005, wrist + 0.045, 8), 0.011, keel_h=0.007, facing=out,
                     top=lambda t: 0.035 * A._toward(t, BACK, 0.9) ** 1.5)
        solid(m, g, s['thick'], A.S_PLATE)
        tube(m, A._out(g, 0, 0.004)[0], 0.0055, A.S_TRIM, n=5, closed=True)
        for z in (wrist + 0.075, wrist + 0.105):
            hoop(m, fit, region, z, 0.011 + s['thick'] + 0.002, half=0.006, thick=0.005, slot=A.S_PLATE)
        cf = cuff(m, fit, region, wrist, 0.045, 0.024, 0.012, s['thick'], A.S_PLATE, out)
        tube(m, A._out(cf, len(cf) - 1, 0.004)[0], 0.006, A.S_TRIM, n=6, closed=True)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def adamantium_greaves(parts, fit, mat):
    s = fit.s
    gap = s['gap'] + 0.004
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        cu = fit.band(region, np.linspace(0.92, kz + 0.09, 7), gap, th=np.linspace(FRONT - 1.9, FRONT + 1.9, 29),
                      keel_h=0.006, bulge=lambda z, t: 0.01 * A._toward(t, FRONT, 1.5))
        solid(thigh, cu, s['thick'], A.S_PLATE, closed=False)
        A._rim(thigh, cu, 0.0055, A.S_TRIM)
        A._cop(fit, shin, region, kz + 0.01, FRONT, gap + 0.006, 0.1, 0.045, span=1.6)
        g2 = fit.band(region, np.linspace(kz - 0.08, 0.15, 9),
                      lambda z: gap + 0.016 * np.clip((z - (kz - 0.13)) / 0.05, 0.0, 1.0), keel_h=0.006)
        solid(shin, g2, s['thick'], A.S_PLATE)
        hoop(shin, fit, region, 0.33, gap + s['thick'] + 0.002, half=0.009, thick=0.007, slot=A.S_TRIM)
        tube(shin, A._out(g2, 0, 0.004)[0], 0.0065, A.S_TRIM, n=6, closed=True)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def adamantium_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.9
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        region = [f'leg_{side}']
        solid(sh, fit.band(region, np.linspace(0.32, 0.03, 8), 0.008, keel_h=0.0), thick, A.S_PLATE)
        pts, o = A._out(fit.band(region, [0.12], 0.018, keel_h=0.0), 0)
        tube(sh, pts, 0.012, A.S_PLATE, n=8, closed=True)   # a thick roll round the ankle
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        ys = np.linspace(0.025, toe + 0.05, 4)
        for k in range(3):
            rows = A._foot_rows(fit, side, np.linspace(ys[k] + 0.008, ys[k + 1], 3), 0.008 + 0.002 * (3 - k), over)
            solid(ft, rows, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
            tube(ft, A._out(rows, len(rows) - 1, 0.001, axis=1)[0], 0.005, A.S_TRIM, n=5)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.055, toe, 4), 0.01, over)
        cap = A._shut(cap, toe - np.array([0.006, 0.014]), [1.18, 0.85])   # its toes spread like a paw
        solid(ft, cap, thick * 1.2, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def adamantium_hand(m, x, closed, P):
    """A thick roll over the knuckles."""
    kc, out = knuckles(x, closed, P)
    tube(m, kc + out * 0.012, 0.0085, A.S_PLATE, n=7)


# ===================================================================================================================
# EBONY: black steel cut to points. Its bladed helm, its shielded breast and its scythe pauldrons are armour.py's
# shared builders, which only ebony wears so. Its own: a vambrace whose cuff is drawn up the outer forearm to a long
# point, a single blade swept back off the elbow; a knee plate drawn up over the thigh to a point, a shin ridged
# down its middle into it; boots cut to a point up the shin, long pointed toes and a spur of a blade at the heel
# ===================================================================================================================

def ebony_gauntlets(parts, fit, mat):
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow, wrist + 0.05, 7), 0.006, keel_h=0.005, facing=out)
        solid(m, g, s['thick'] * 0.8, A.S_PLATE)
        cf = cuff(m, fit, region, wrist, 0.05, 0.02, 0.012, s['thick'] * 0.8, A.S_PLATE, out,
                  top=lambda t, at=out: 0.12 * A._toward(t, at, 0.7) ** 1.6)
        A._edge(m, cf, 0, 0.004)
        tube(m, A._out(cf, len(cf) - 1, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        q = fit.band(region, [elbow - 0.02], 0.012, th=[BACK + 0.4 * x], keel_h=0.0)[0, 0]
        blade(m, q, q + np.array([x * 0.03, 0.05, 0.11]), 0.03, np.array([x, 0.0, 0.0]), 0.004, A.S_PLATE,
              curve=(x * 0.01, 0.015, 0.0), rim=0.003, belly=0.25)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def ebony_greaves(parts, fit, mat):
    s = fit.s
    gap = max(0.007, s['gap'] * 0.75)
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        cu = fit.band(region, np.linspace(0.9, kz + 0.07, 6), gap, th=np.linspace(FRONT - 1.7, FRONT + 1.7, 25),
                      keel_h=0.008)
        solid(thigh, cu, s['thick'], A.S_PLATE, closed=False)
        A._rim(thigh, cu, 0.0045, A.S_TRIM)
        kp = fit.band(region, np.linspace(kz + 0.06, kz - 0.06, 8), gap + 0.009,
                      th=np.linspace(FRONT - 1.3, FRONT + 1.3, 19), keel_h=0.01,
                      bulge=lambda z, t: 0.018 * A._bump(z, kz, 0.06) * A._toward(t, FRONT, 1.3),
                      top=lambda t: 0.1 * A._toward(t, FRONT, 0.7) ** 1.6)
        solid(shin, kp, s['thick'], A.S_PLATE, closed=False)
        A._rim(shin, kp, 0.0045, A.S_TRIM)
        g2 = fit.band(region, np.linspace(kz - 0.07, 0.15, 9), gap, keel_h=0.012,
                      top=lambda t: 0.03 * A._toward(t, FRONT, 0.8) ** 2)
        solid(shin, g2, s['thick'], A.S_PLATE)
        line = fit.band(region, np.linspace(kz - 0.05, 0.17, 9), gap + s['thick'] + 0.01, th=[FRONT],
                        keel_h=0.012)[:, 0]
        tube(shin, line, 0.004, A.S_TRIM, n=5)   # its ridge, bright
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def ebony_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.8
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        region = [f'leg_{side}']
        g = fit.band(region, np.linspace(0.3, 0.03, 8), 0.006, keel_h=0.004,
                     top=lambda t: 0.08 * A._toward(t, FRONT, 0.6) ** 2)
        solid(sh, g, thick, A.S_PLATE)
        A._edge(sh, g, 0, 0.004)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.05, 3), 0.007, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.06, toe, 5), 0.006, over)
        cap = A._shut(cap, toe - np.array([0.016, 0.036, 0.062]), [0.72, 0.36, 0.04], drop=0.012)
        solid(ft, cap, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        tube(ft, A._out(cap, 0, 0.002, axis=1)[0], 0.004, A.S_TRIM, n=5)
        h = A._foot_rows(fit, side, [heel - 0.01], 0.008, [math.pi / 2])[0, 0]
        spike(ft, h + np.array([0.0, 0.0, 0.01]), h + np.array([0.0, 0.065, 0.02]), 0.012, A.S_PLATE, n=5)
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def ebony_hand(m, x, closed, P):
    """A fin down the back of the hand to the knuckles."""
    a, o = back_of_hand(P, 0.01)
    b, _ = back_of_hand(P, 0.07)
    blade(m, a + o * 0.006, b + o * (0.02 if closed else 0.008), 0.016, np.cross(o, b - a), 0.003, A.S_TRIM,
          belly=0.6)


# ===================================================================================================================
# ORCISH: dark old bronze, hammered heavy and hung with tusks. Its crested helm, its chevroned breast and its horned
# round pauldrons are armour.py's shared builders, which only orcish wears so. Its own: a thick bracer, three bone tusks
# curving back off the outer forearm, leather wound round the wrist; tall boot-greaves flared under the knee, a tusk
# standing up from each knee, fur round the ankle; big round toes, two straps buckled over the instep; spikes on the
# knuckles
# ===================================================================================================================

def orcish_gauntlets(parts, fit, mat):
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow, wrist + 0.06, 6), 0.01, keel_h=0.004, facing=out)
        solid(m, g, s['thick'], A.S_PLATE)
        A._edge(m, g, 0, 0.0055)
        A._edge(m, g, len(g) - 1, 0.0055)
        for k, z in enumerate(np.linspace(elbow - 0.03, wrist + 0.1, 3)):
            q = fit.band(region, [z], 0.01 + s['thick'], th=[out], keel_h=0.0)[0, 0]
            o = outward(fit, region, z, q)
            spike(m, q, q + o * 0.045 + np.array([0.0, 0.0, 0.03]), 0.011, A.S_HORN, n=6, curve=(0.0, 0.0, 0.02))
        wraps(m, fit, region, wrist + 0.055, wrist - 0.004, 0.013, 2.0, 0.02, 0.004, A.S_STRAP, rows=20)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def orcish_greaves(parts, fit, mat):
    s = fit.s
    gap = max(0.007, s['gap'] * 0.75)
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        g2 = fit.band(region, np.linspace(kz - 0.03, 0.13, 9),
                      lambda z: gap + 0.016 * np.clip((z - (kz - 0.1)) / 0.07, 0.0, 1.0), keel_h=0.004)
        solid(shin, g2, s['thick'], A.S_PLATE)
        A._edge(shin, g2, 0, 0.006)
        vp = fit.band(region, np.linspace(kz - 0.05, 0.3, 6), gap + s['thick'] + 0.004,
                      th=np.linspace(FRONT - 0.95, FRONT + 0.95, 15), keel_h=0.004,
                      hem=lambda t: 0.08 * A._toward(t, FRONT, 0.95) ** 1.2)
        solid(shin, vp, s['thick'] * 0.8, A.S_PLATE, closed=False)
        A._rim(shin, vp, 0.005)
        q = fit.band(region, [kz - 0.02], gap + 0.02, th=[FRONT], keel_h=0.0)[0, 0]
        spike(shin, q, q + np.array([0.0, -0.035, 0.085]), 0.016, A.S_HORN, n=6, curve=(0.0, -0.012, 0.0))
        pts, o = A._out(fit.band(region, [0.14], gap + s['thick']), 0)
        A._fur(shin, s, pts, o, 0.022, rows=1, seed=5 if x > 0 else 6, closed=True)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def orcish_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.85
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        region = [f'leg_{side}']
        solid(sh, fit.band(region, np.linspace(0.3, 0.03, 8), 0.007, keel_h=0.0), thick, A.S_PLATE)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.05, 3), 0.007, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.06, toe, 5), 0.013, over)
        cap = A._shut(cap, toe - np.array([0.01, 0.02]), [0.92, 0.55])
        solid(ft, cap, thick * 1.2, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        tube(ft, A._out(cap, 0, 0.002, axis=1)[0], 0.0055, A.S_TRIM, n=5)
        for y in (toe + 0.085, toe + 0.125):   # two straps buckled over the instep
            band = A._foot_rows(fit, side, [y + 0.009, y - 0.009], 0.013, over)
            solid(ft, band, 0.004, A.S_STRAP, closed=False, inward=lambda gg: A._toward_axis(gg))
            j = 0 if x > 0 else band.shape[1] - 1
            box(ft, band[:, j].mean(axis=0), (0.02, 0.02, 0.006), np.array([x, 0.0, 0.3]), (0, 1, 0), A.S_TRIM)
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def orcish_hand(m, x, closed, P):
    """Short spikes on the knuckles."""
    kc, out = knuckles(x, closed, P)
    for q in kc[::2]:
        spike(m, q + out * 0.008, q + out * 0.03, 0.007, A.S_PLATE, n=5)


def iron_hand(m, x, closed, P):
    """Studs on the knuckles."""
    kc, out = knuckles(x, closed, P)
    for q in kc[::1][:4]:
        dome(m, q + out * 0.008, 0.0075, out, A.S_TRIM, height=0.006)



# ===================================================================================================================
# DAEDRIC: blackened, faceted, horned and spiked, a dull red seam aglow between its plates. Its horned helm, its
# layered breast and its winged pauldrons are armour.py's shared builders, which only daedric wears so. Its own: a
# faceted vambrace, a seam aglow round its wrist, two blades swept back off it, a toothed cuff; a faceted knee under a
# horn curving forward, blades off the shin, a seam under the knee; faceted boots on clawed toes, a spike off the heel;
# spikes on the knuckles and claws on the fingers
# ===================================================================================================================

def daedric_gauntlets(parts, fit, mat):
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        with section(fit, ('facet', 8)):
            g = fit.band(region, np.linspace(elbow, wrist + 0.05, 6), 0.008, keel_h=0.006, facing=out)
            solid(m, g, s['thick'], A.S_PLATE)
            hoop(m, fit, region, wrist + 0.06, 0.006, half=0.005, thick=0.003, slot=A.S_GLOW)
            cf = cuff(m, fit, region, wrist, 0.05, 0.026, 0.012, s['thick'], A.S_PLATE, out,
                      hem=lambda t: 0.018 * np.abs(np.sin(5 * np.asarray(t, float))) ** 3)
        tube(m, A._out(g, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        tube(m, A._out(cf, len(cf) - 1, 0.003)[0], 0.0042, A.S_TRIM, n=5, closed=True)
        for z, length in ((elbow - 0.03, 0.1), (wrist + 0.1, 0.08)):
            q = fit.band(region, [z], 0.008 + s['thick'], th=[out + 0.4 * x], keel_h=0.0)[0, 0]
            o = outward(fit, region, z, q)
            way = o * 0.5 + np.array([0.0, 0.25, 0.85])
            blade(m, q, q + way / np.linalg.norm(way) * length, 0.03, np.cross(o, [0.0, 0.0, 1.0]), 0.004,
                  A.S_PLATE, curve=o * 0.02, belly=0.2)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def daedric_greaves(parts, fit, mat):
    s = fit.s
    gap = max(0.008, s['gap'] * 0.75)
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        with section(fit, ('facet', 10)):
            cu = fit.band(region, np.linspace(0.92, kz + 0.08, 6), gap, th=np.linspace(FRONT - 1.8, FRONT + 1.8, 27),
                          keel_h=0.014)
            solid(thigh, cu, s['thick'], A.S_PLATE, closed=False)
            A._rim(thigh, cu, 0.0045, A.S_TRIM)
            cop = A._cop(fit, shin, region, kz + 0.01, FRONT, gap + 0.006, 0.08, 0.03, span=1.5)
            g2 = fit.band(region, np.linspace(kz - 0.075, 0.15, 9), gap, keel_h=0.016)
            solid(shin, g2, s['thick'], A.S_PLATE)
            hoop(shin, fit, region, kz - 0.085, gap - 0.001, half=0.006, thick=0.003, slot=A.S_GLOW)
        q = cop[len(cop) // 2, cop.shape[1] // 2]
        o = outward(fit, region, kz, q)
        spike(shin, q, q + o * 0.05 + np.array([0.0, 0.0, 0.045]), 0.017, A.S_PLATE, n=6, curve=o * 0.02)
        for z, length in ((kz - 0.12, 0.09), (0.26, 0.075)):
            p = fit.band(region, [z], gap + s['thick'], th=[out], keel_h=0.0)[0, 0]
            o = outward(fit, region, z, p)
            way = o * 0.55 + np.array([0.0, 0.35, 0.75])
            blade(shin, p, p + way / np.linalg.norm(way) * length, 0.03, np.cross(o, [0.0, 0.0, 1.0]), 0.004,
                  A.S_PLATE, curve=o * 0.02, belly=0.2)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def daedric_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.85
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        region = [f'leg_{side}']
        with section(fit, ('facet', 8)):
            g = fit.band(region, np.linspace(0.32, 0.03, 8), 0.008, keel_h=0.008,
                         top=lambda t: 0.02 * np.abs(np.sin(4 * np.asarray(t, float))) ** 2)
            solid(sh, g, thick, A.S_PLATE)
        A._edge(sh, g, 0, 0.004)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.05, 3), 0.007, over, thick, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.06, toe, 5), 0.007, over)
        cap = A._shut(cap, toe - np.array([0.008, 0.016]), [0.8, 0.35])
        solid(ft, cap, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        for a in (math.pi / 2 - 0.75, math.pi / 2, math.pi / 2 + 0.75):   # three claws off the toe
            k = int(np.argmin(np.abs(over - a)))
            b = cap[len(cap) - 3, k]
            spike(ft, b, b + np.array([0.0, -0.05, -0.014]), 0.009, A.S_TRIM, n=5, curve=(0, 0, -0.012))
        h = A._foot_rows(fit, side, [heel - 0.008], 0.008, [math.pi / 2])[0, 0]
        spike(ft, h, h + np.array([0.0, 0.05, -0.03]), 0.013, A.S_PLATE, n=5)
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def daedric_hand(m, x, closed, P):
    """Spikes on the knuckles, and a claw off each finger's tip."""
    import model
    kc, out = knuckles(x, closed, P)
    for q in kc[:4]:
        spike(m, q + out * 0.008, q + out * 0.026, 0.006, A.S_PLATE, n=5)
    fingers, thumb = model.hand_bones(x, closed)
    for bones in fingers + [thumb]:
        a, b, r = bones[-1]
        a, b = np.array(a), np.array(b)
        d = (b - a) / np.linalg.norm(b - a)
        spike(m, b - d * 0.004, b + d * 0.016, r * 0.8, A.S_TRIM, n=5)


# ===================================================================================================================
# THIEVES GUILD: brown leather, brass at its buckles, cut to move unheard. Its hood, its high-collared jacket and its
# bandolier are armour.py's shared builders, which only the thieves wear so. Its own: shoulders not alike, the right
# a flat studded pad under the bandolier, the left a strap alone; a snug bracer buckled three
# times down its outer side; padded knees, a pouch strapped to the right thigh, a shin guard strapped twice; tall soft
# boots turned down under the knee, buckled at the ankle
# ===================================================================================================================

def thieves_gauntlets(parts, fit, mat):
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow, wrist + 0.025, 6), 0.008, keel_h=0.0)
        solid(m, g, 0.005, A.S_PLATE)
        A._edge(m, g, 0, 0.0035, A.S_TRIM)
        A._edge(m, g, len(g) - 1, 0.0035, A.S_TRIM)
        for z in np.linspace(elbow - 0.03, wrist + 0.05, 3):
            sg = hoop(m, fit, region, z, 0.0125, half=0.0065, slot=A.S_TRIM)
            j = int(np.argmax(sg[0, :, 0] * x))
            box(m, sg[:, j].mean(axis=0) + np.array([x * 0.003, 0.0, 0.0]), (0.016, 0.016, 0.005),
                np.array([x, 0.0, 0.0]), (0, 0, 1), A.S_GLOW)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def thieves_greaves(parts, fit, mat):
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        A._cop(fit, shin, region, kz + 0.005, FRONT, 0.012, 0.06, 0.016, span=1.3, slot=A.S_PLATE)
        sg = fit.band(region, np.linspace(kz - 0.07, 0.36, 5), 0.013, th=np.linspace(FRONT - 1.0, FRONT + 1.0, 13),
                      keel_h=0.004)
        solid(shin, sg, 0.005, A.S_PLATE, closed=False)
        A._rim(shin, sg, 0.0032, A.S_TRIM)
        for z in (kz - 0.1, 0.4):
            hoop(shin, fit, region, z, 0.017, half=0.006, slot=A.S_TRIM)
        if side == 'R':   # a pouch strapped to the right thigh
            z = 0.8
            hoop(thigh, fit, region, z, 0.01, half=0.009, slot=A.S_TRIM)
            q = fit.band(region, [z - 0.035], 0.02, th=[math.pi - 0.35], keel_h=0.0)[0, 0]
            o = outward(fit, region, z, q)
            box(thigh, q, (0.05, 0.065, 0.022), o, (0, 0, 1), A.S_PLATE)
            box(thigh, q + o * 0.022 + np.array([0.0, 0.0, 0.018]), (0.052, 0.03, 0.004), o, (0, 0, 1), A.S_TRIM)
            box(thigh, q + o * 0.026 + np.array([0.0, 0.0, 0.006]), (0.014, 0.012, 0.004), o, (0, 0, 1), A.S_GLOW)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def thieves_boots(parts, fit, mat):
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        kz, _, _ = leg_frame(side)
        region = [f'leg_{side}']
        top = kz - 0.06
        solid(sh, fit.band(region, np.linspace(top, 0.03, 10), 0.006, keel_h=0.0), 0.005, A.S_PLATE)
        cf = fit.band(region, np.linspace(top + 0.008, top - 0.07, 4),
                      lambda z: 0.01 + 0.12 * max(0.0, z - (top - 0.07)), keel_h=0.0)
        solid(sh, cf, 0.005, A.S_PLATE)   # its top turned down in a cuff
        A._edge(sh, cf, len(cf) - 1, 0.0035, A.S_TRIM)
        sg = hoop(sh, fit, region, 0.13, 0.009, half=0.008, slot=A.S_TRIM)
        j = int(np.argmax(sg[0, :, 0] * x))
        box(sh, sg[:, j].mean(axis=0) + np.array([x * 0.003, 0.0, 0.0]), (0.016, 0.016, 0.005),
            np.array([x, 0.0, 0.0]), (0, 0, 1), A.S_GLOW)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, 0.005)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.012, 10), 0.005, over, 0.005, A.S_PLATE)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.012, toe, 3), 0.005, over)
        cap = A._shut(cap, toe - np.array([0.006, 0.011]), [0.66, 0.22])
        solid(ft, cap, 0.005, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


# ===================================================================================================================
# DARK BROTHERHOOD: black leather plated in deep crimson, every plate drawn to a point. Its close hood and its breast
# of crimson plates in a V are armour.py's shared builders, which only the brotherhood wears so. Its own: two crimson
# plates layered over each shoulder, pointed; a crimson bracer drawn to a point toward the elbow, banded black;
# crimson plates down the thighs, a knee drawn up to a point, a crimson shin guard; tall crimson boots cut to a point
# over the knee
# ===================================================================================================================

def brotherhood_gauntlets(parts, fit, mat):
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        g = fit.band(region, np.linspace(elbow - 0.01, wrist + 0.03, 6), 0.009, keel_h=0.0,
                     top=lambda t, at=out: 0.07 * A._toward(t, at, 0.8) ** 1.8)
        solid(m, g, 0.005, A.S_TRIM)
        A._edge(m, g, 0, 0.003, A.S_PLATE)
        for z in np.linspace(wrist + 0.05, elbow - 0.03, 3):
            hoop(m, fit, region, z, 0.0135, half=0.006, thick=0.003, slot=A.S_PLATE)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def brotherhood_greaves(parts, fit, mat):
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        tp = fit.band(region, np.linspace(0.9, kz + 0.12, 6), 0.009, th=np.linspace(FRONT - 0.75, FRONT + 0.75, 13),
                      keel_h=0.0, top=lambda t: 0.04 * A._toward(t, FRONT, 0.75),
                      hem=lambda t: 0.05 * A._toward(t, FRONT, 0.75))
        solid(thigh, tp, 0.004, A.S_TRIM, closed=False)
        A._rim(thigh, tp, 0.003, A.S_PLATE)
        kp = fit.band(region, np.linspace(kz + 0.05, kz - 0.05, 6), 0.014, th=np.linspace(FRONT - 1.2, FRONT + 1.2, 15),
                      keel_h=0.004, bulge=lambda z, t: 0.012 * A._bump(z, kz, 0.05) * A._toward(t, FRONT, 1.2),
                      top=lambda t: 0.06 * A._toward(t, FRONT, 0.6) ** 1.6)
        solid(shin, kp, 0.005, A.S_TRIM, closed=False)
        A._rim(shin, kp, 0.003, A.S_PLATE)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def brotherhood_boots(parts, fit, mat):
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        kz, _, _ = leg_frame(side)
        region = [f'leg_{side}']
        g = fit.band(region, np.linspace(kz - 0.07, 0.03, 10), 0.007, keel_h=0.0,
                     top=lambda t: 0.06 * A._toward(t, FRONT, 0.7) ** 1.6)
        solid(sh, g, 0.005, A.S_TRIM)
        A._edge(sh, g, 0, 0.003, A.S_PLATE)
        hoop(sh, fit, region, 0.13, 0.01, half=0.007, slot=A.S_PLATE)
        heel, toe, over = foot_base(ft, fit, side, A.S_TRIM, 0.005)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.012, 10), 0.005, over, 0.005, A.S_TRIM)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.012, toe, 3), 0.005, over)
        cap = A._shut(cap, toe - np.array([0.008, 0.018]), [0.62, 0.15])
        solid(ft, cap, 0.005, A.S_TRIM, closed=False, inward=lambda gg: A._toward_axis(gg))
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


# ===================================================================================================================
# MAGES GUILD: a coat of teal cloth trimmed in brown leather and clasped in silver. Its hood and its coat under a
# capelet are armour.py's shared builders, which only the mages wear so. Its own: stiff teal epaulettes rimmed in
# brown and fringed; a brown bracer laced in cream under a turned-back teal cuff; brown panels laced
# down the thighs' outer sides; tall brown boots laced up the front under a rolled top
# ===================================================================================================================

def mages_gauntlets(parts, fit, mat):
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        br = fit.band(region, np.linspace(elbow, wrist + 0.06, 6), 0.009, keel_h=0.0, facing=out)
        solid(m, br, 0.005, A.S_TRIM)
        zs = np.linspace(elbow - 0.02, wrist + 0.08, 6)
        pts = [fit.band(region, [z], 0.0145, th=[out + (0.35 if k % 2 else -0.35)], keel_h=0.0)[0, 0]
               for k, z in enumerate(zs)]
        for a, b in zip(pts, pts[1:]):
            tube(m, [a, b], 0.0022, A.S_GLOW, n=4)
        cf = cuff(m, fit, region, wrist, 0.05, 0.03, 0.01, 0.006, A.S_PLATE, out)   # the teal cuff, turned back
        tube(m, A._out(cf, len(cf) - 1, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def mages_greaves(parts, fit, mat):
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        at = out
        pn = fit.band(region, np.linspace(0.92, kz + 0.06, 7), 0.011, th=np.linspace(at - 0.55, at + 0.55, 9),
                      keel_h=0.0)
        solid(thigh, pn, 0.005, A.S_TRIM, closed=False)
        zs = np.linspace(0.9, kz + 0.09, 9)
        pts = [fit.band(region, [z], 0.0175, th=[at + (0.22 if k % 2 else -0.22)], keel_h=0.0)[0, 0]
               for k, z in enumerate(zs)]
        for a, b in zip(pts, pts[1:]):
            tube(thigh, [a, b], 0.0022, A.S_GLOW, n=4)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def mages_boots(parts, fit, mat):
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        kz, _, _ = leg_frame(side)
        region = [f'leg_{side}']
        top = kz - 0.035
        g = fit.band(region, np.linspace(top, 0.03, 10), 0.007, keel_h=0.0)
        solid(sh, g, 0.005, A.S_TRIM)
        tube(sh, A._out(g, 0, 0.004)[0], 0.0065, A.S_TRIM, n=6, closed=True)   # its top rolled
        zs = np.linspace(top - 0.03, 0.12, 9)
        pts = [fit.band(region, [z], 0.0125, th=[FRONT + (0.3 if k % 2 else -0.3)], keel_h=0.0)[0, 0]
               for k, z in enumerate(zs)]
        for a, b in zip(pts, pts[1:]):
            tube(sh, [a, b], 0.0022, A.S_GLOW, n=4)
        heel, toe, over = foot_base(ft, fit, side, A.S_TRIM, 0.005)
        foot_shell(ft, fit, side, np.linspace(0.025, toe + 0.012, 10), 0.005, over, 0.005, A.S_TRIM)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.012, toe, 3), 0.005, over)
        cap = A._shut(cap, toe - np.array([0.006, 0.011]), [0.7, 0.25])
        solid(ft, cap, 0.005, A.S_TRIM, closed=False, inward=lambda gg: A._toward_axis(gg))
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


# ===================================================================================================================
# FIGHTERS GUILD: a sellsword's kit, mail and polished steel and red-brown leather. A kettle hat, its brim round, over
# a mail coif; a mail shirt to the hips under a steel breastplate on the front alone, strapped round the flanks, a
# gorget, a red-brown belt; mail sleeves to a round cop at the elbow; splinted leather spaulders strapped across; an
# hourglass gauntlet; a knee fanned in a heart over a leather strap; round-toed sabatons strapped at the ankle
# ===================================================================================================================

def fighters_gauntlets(parts, fit, mat):
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        mid = (elbow + wrist) / 2
        g = fit.band(region, np.linspace(elbow + 0.005, wrist + 0.04, 8),
                     lambda z: 0.006 + 0.016 * ((z - mid) / (elbow - wrist)) ** 2 * 4, keel_h=0.004, facing=out)
        solid(m, g, s['thick'] * 0.8, A.S_PLATE)   # an hourglass, narrow at its waist
        tube(m, A._out(g, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        cf = cuff(m, fit, region, wrist, 0.045, 0.024, 0.012, s['thick'] * 0.8, A.S_PLATE, out)
        tube(m, A._out(cf, len(cf) - 1, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        hoop(m, fit, region, elbow - 0.02, 0.02, half=0.008)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def fighters_greaves(parts, fit, mat):
    s = fit.s
    gap = max(0.007, s['gap'] * 0.75)
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        cu = fit.band(region, np.linspace(0.9, kz + 0.07, 6), gap, th=np.linspace(FRONT - 1.75, FRONT + 1.75, 27),
                      keel_h=0.005)
        solid(thigh, cu, s['thick'], A.S_PLATE, closed=False)
        A._rim(thigh, cu, 0.0045, A.S_TRIM)
        A._cop(fit, shin, region, kz + 0.01, FRONT, gap + 0.004, 0.075, 0.024, span=1.4)
        q = fit.band(region, [kz + 0.005], gap + 0.02, th=[FRONT + 1.15 * x], keel_h=0.0)[0, 0]
        o = outward(fit, region, kz, q)
        across = np.cross(o, [0.0, 0.0, 1.0])
        for k in (-1, 1):   # the heart: two lobes and a point
            blade(shin, q + np.array([0.0, 0.0, 0.03]), q + np.array([0.0, 0.0, -0.035]) + k * across * 0.001,
                  0.05, o, 0.004, A.S_PLATE, curve=k * across * 0.018, belly=0.35)
        hoop(shin, fit, region, kz - 0.085, gap + s['thick'] + 0.002, half=0.012, slot=A.S_STRAP)
        g2 = fit.band(region, np.linspace(kz - 0.07, 0.15, 9), gap, keel_h=0.008)
        solid(shin, g2, s['thick'], A.S_PLATE)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def fighters_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.8
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        region = [f'leg_{side}']
        solid(sh, fit.band(region, np.linspace(0.32, 0.03, 8), 0.006, keel_h=0.0), thick, A.S_PLATE)
        sg = hoop(sh, fit, region, 0.14, 0.012, half=0.009, slot=A.S_STRAP)
        j = int(np.argmax(sg[0, :, 0] * x))
        box(sh, sg[:, j].mean(axis=0) + np.array([x * 0.003, 0.0, 0.0]), (0.018, 0.02, 0.006), np.array([x, 0.0, 0.0]),
            (0, 0, 1), A.S_TRIM)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        ys = np.linspace(0.025, toe + 0.05, 4)
        for k in range(3):
            rows = A._foot_rows(fit, side, np.linspace(ys[k] + 0.008, ys[k + 1], 3), 0.006 + 0.0015 * (3 - k), over)
            solid(ft, rows, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
            tube(ft, A._out(rows, len(rows) - 1, 0.001, axis=1)[0], 0.004, A.S_TRIM, n=5)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.055, toe, 4), 0.006, over)
        cap = A._shut(cap, toe - np.array([0.008, 0.014]), [0.82, 0.45])
        solid(ft, cap, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


# ===================================================================================================================
# KNIGHTLY ORDERS: bright plate under the order's colour. An armet, its visor a sparrow's beak, a plume of the blue;
# a surcoat of the order's blue from the shoulders to the hips over the plate, a cross on the breast and the back, a
# dark belt; a flat plate a shoulder, an ailette of the blue standing on it; faceted
# vambraces and greaves (the order's facets), a great round fan off each knee, square sabatons spurred at the heel
# ===================================================================================================================

def knights_gauntlets(parts, fit, mat):
    s = fit.s
    for side in 'LR':
        m = Mesh()
        wrist, elbow, out, x = arm_frame(side)
        region = [f'arm_{side}']
        with section(fit, ('facet', 8)):
            g = fit.band(region, np.linspace(elbow, wrist + 0.05, 6), 0.011, keel_h=0.0, facing=out)
            solid(m, g, s['thick'] * 0.8, A.S_PLATE)
            cf = cuff(m, fit, region, wrist, 0.075, 0.05, 0.01, s['thick'] * 0.8, A.S_PLATE, out,
                      top=lambda t, at=out: 0.05 * A._toward(t, at, 0.8) ** 1.5)
        tube(m, A._out(cf, len(cf) - 1, 0.004)[0], 0.005, A.S_TRIM, n=5, closed=True)
        line = fit.band(region, np.linspace(elbow, wrist + 0.08, 8), 0.007 + s['thick'] + 0.003, th=[out],
                        keel_h=0.0)[:, 0]
        tube(m, line, 0.0045, A.S_TRIM, n=5)
        hang(parts, mat, fit, [(f'armour_gauntlets.{side}', m, f'farm_{side}')])


def knights_greaves(parts, fit, mat):
    s = fit.s
    gap = max(0.008, s['gap'] * 0.75)
    for side in 'LR':
        thigh, shin = Mesh(), Mesh()
        kz, out, x = leg_frame(side)
        region = [f'leg_{side}']
        with section(fit, ('facet', 10)):
            cu = fit.band(region, np.linspace(0.9, kz + 0.07, 6), gap, th=np.linspace(FRONT - 1.8, FRONT + 1.8, 27),
                          keel_h=0.012)
            solid(thigh, cu, s['thick'], A.S_PLATE, closed=False)
            A._rim(thigh, cu, 0.004, A.S_TRIM)
            A._cop(fit, shin, region, kz + 0.01, FRONT, gap + 0.005, 0.08, 0.026, span=1.45)
            g2 = fit.band(region, np.linspace(kz - 0.07, 0.15, 9), gap, keel_h=0.018)
            solid(shin, g2, s['thick'], A.S_PLATE)
        q = fit.band(region, [kz + 0.005], gap + 0.024, th=[FRONT + 1.1 * x], keel_h=0.0)[0, 0]
        disc(shin, q, outward(fit, region, kz, q), 0.052, 0.005, rim=0.005, boss=0.012)
        hang(parts, mat, fit, [(f'armour_greaves.thigh_{side}', thigh, f'thigh_{side}'),
                               (f'armour_greaves.shin_{side}', shin, f'shin_{side}')])


def knights_boots(parts, fit, mat):
    s = fit.s
    thick = s['thick'] * 0.8
    for side in 'LR':
        sh, ft = Mesh(), Mesh()
        region = [f'leg_{side}']
        with section(fit, ('facet', 8)):
            solid(sh, fit.band(region, np.linspace(0.32, 0.03, 8), 0.007, keel_h=0.008), thick, A.S_PLATE)
        heel, toe, over = foot_base(ft, fit, side, A.S_PLATE, thick)
        ys = np.linspace(0.025, toe + 0.045, 5)
        for k in range(4):
            rows = A._foot_rows(fit, side, np.linspace(ys[k] + 0.006, ys[k + 1], 3), 0.006 + 0.0015 * (4 - k), over)
            solid(ft, rows, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
            tube(ft, A._out(rows, len(rows) - 1, 0.001, axis=1)[0], 0.0038, A.S_TRIM, n=5)
        cap = A._foot_rows(fit, side, np.linspace(toe + 0.05, toe, 4), 0.006, over)
        cap = A._shut(cap, toe - np.array([0.006, 0.009]), [0.97, 0.32])
        solid(ft, cap, thick, A.S_PLATE, closed=False, inward=lambda gg: A._toward_axis(gg))
        h = A._foot_rows(fit, side, [heel - 0.004], 0.01, [math.pi / 2])[0, 0] + np.array([0.0, 0.0, -0.01])
        tube(ft, [h, h + np.array([0.0, 0.045, -0.006])], 0.0035, A.S_TRIM, n=4)   # the spur's neck
        disc(ft, h + np.array([0.0, 0.05, -0.006]), np.array([1.0, 0.0, 0.0]), 0.014, 0.002, A.S_TRIM, notch=6)
        hang(parts, mat, fit, [(f'armour_boots.shaft_{side}', sh, f'shin_{side}'),
                               (f'armour_boots.foot_{side}', ft, f'foot_{side}')])


def knights_hand(m, x, closed, P):
    """A ridge over the knuckles set with short gadlings."""
    kc, out = knuckles(x, closed, P)
    tube(m, kc + out * 0.01, 0.0055, A.S_PLATE, n=6)
    for q in kc[[0, 2, 4]]:
        spike(m, q + out * 0.012, q + out * 0.026, 0.0055, A.S_PLATE, n=5)


def fighters_hand(m, x, closed, P):
    """A plate across the knuckles, its edge rolled."""
    kc, out = knuckles(x, closed, P)
    tube(m, kc + out * 0.01, 0.006, A.S_PLATE, n=6)


def dwarven_pauldrons(parts, fit, mat):
    """Rounded pauldrons over the dark sleeve: a cap and two lames under it stepping down the arm, every edge rolled,
    studs along the cap's rim, and its outer edge swept up behind into a horn of plate. At a shoulder's own size."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        c, r, mid, x, lo, hi = shoulder_frame(fit, side)
        R = rot((0, 1, 0), -22 * x)
        radii = (r + s['gap'] + 0.01) * np.array([1.08, 1.14, 0.95])
        lon = (mid - 2.2, mid + 2.2)
        cap = cap_band(m, c, radii, (-0.15, 1.38), lon, s['thick'] * 1.1, A.S_PLATE, tilt=R, rows=9, cols=26)
        tube(m, cap[0], 0.006, A.S_TRIM, n=6)
        for lo_ in np.linspace(lon[0] + 0.3, lon[1] - 0.3, 11):   # the studs along its rim, close as a row
            q = A._on_shell(c, radii, R, [0.1], lo_, 0.003)[0]
            dome(m, q, 0.009, q - c, A.S_PLATE, height=0.007)
        for k in range(2):
            ck = c + np.array([0.024 * x * (k + 1), 0.0, -0.05 * (k + 1)])
            lg = cap_band(m, ck, radii * (0.93 - 0.06 * k), (-0.35, 0.2), lon, s['thick'], A.S_PLATE,
                          tilt=rot((0, 1, 0), -(32 + 9 * k) * x), rows=3, cols=24)
            tube(m, lg[0], 0.0055, A.S_TRIM, n=5)
        back = mid + 0.7 * x   # the horn, swept up off the cap's outer edge toward the back
        root = A._on_shell(c, radii, R, [0.55], back, 0.0)[0]
        blade(m, root, root + np.array([x * 0.03, 0.025, 0.075]), 0.05, (root - c) / np.linalg.norm(root - c),
              0.007, A.S_PLATE, curve=(x * 0.02, 0.0, -0.01), rim=0.004, belly=0.25)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def dwarven_helm(parts, fit, mat):
    """A closed helm under a tall crest: the crest a blade from the brow over the crown and down behind, tallest over
    the crown; a grim faceplate, its brow heavy over a dark slit for the eyes, a ridge down the nose, a grille of bars
    over a dark mouth; its cheeks flared out at their feet; a lame over the nape."""
    s = fit.s
    m = Mesh()
    hc, sr, low, p = helm_frame(fit, tall=1.06)
    thick = s['thick']
    cap_band(m, hc, sr, (low - 0.04, 1.5707), (0, TAU), thick, A.S_PLATE, rows=10, cols=32)
    fr = visor_front(hc, sr, p, 0.012)
    ez = eye_z(p)
    eye = math.asin(np.clip((ez - hc[2]) / fr[2], -0.9, 0.9))
    face = cap_band(m, hc, fr, (-0.92, eye + 0.16), (FRONT - 1.05, FRONT + 1.05), thick, A.S_PLATE, rows=7, cols=14)
    A._rim(m, face, 0.004, A.S_TRIM)
    br = cap_band(m, hc, fr * 1.03 + 0.007, (eye + 0.05, eye + 0.17), (FRONT - 1.1, FRONT + 1.1), thick * 1.4,
                  A.S_PLATE, rows=1, cols=14)   # the heavy brow
    tube(m, A._out(br, 0, 0.003)[0], 0.006, A.S_TRIM, n=5)
    cap_band(m, hc, fr + 0.004, (eye - 0.05, eye + 0.04), (FRONT - 0.65, FRONT + 0.65), 0.002, A.S_DARK, rows=1,
             cols=8)   # the eyes' slit
    tube(m, [hc + np.array([0.0, -(fr[1] + 0.01) * math.cos(t), fr[2] * math.sin(t)])
             for t in np.linspace(eye + 0.04, eye - 0.34, 5)], 0.007, A.S_PLATE, n=6)   # the nose
    cap_band(m, hc, fr + 0.004, (eye - 0.72, eye - 0.44), (FRONT - 0.42, FRONT + 0.42), 0.002, A.S_DARK, rows=1,
             cols=6)   # the mouth, dark
    for b in np.linspace(FRONT - 0.28, FRONT + 0.28, 4):   # the grille's bars across it
        tube(m, [hc + (fr + 0.007) * np.array([math.cos(la) * math.cos(b), math.cos(la) * math.sin(b), math.sin(la)])
                 for la in (eye - 0.42, eye - 0.74)], 0.004, A.S_PLATE, n=4)
    for x in (1, -1):   # the cheeks, flared out at their feet
        a0 = FRONT + 0.9 * x
        cg = cap_band(m, hc, fr * np.array([1.08, 1.0, 1.0]) + 0.007, (-0.85, eye - 0.05),
                      tuple(sorted((a0, a0 + 0.75 * x))), thick, A.S_PLATE, rows=4, cols=6, tilt=rot((0, 1, 0), 8 * x))
        A._rim(m, cg, 0.004, A.S_TRIM)
    th = np.linspace(-0.3, 1.5, 22)   # the crest, from the brow over the crown and down behind
    line = hc + np.stack([0 * th, -np.sin(th) * (sr[1] + 0.002), np.cos(th) * (sr[2] + 0.002)], axis=1)
    up = (line - hc) / np.linalg.norm(line - hc, axis=1, keepdims=True)
    tall = 0.016 + 0.1 * np.clip(np.cos(th * 1.05), 0, 1) ** 1.4
    top = line + up * tall[:, None] + np.outer(tall, [0.0, -0.3, 0.0])
    wide = np.array([0.012, 0.0, 0.0])   # a wedge, broad at its foot, so it reads from the front
    solid(m, np.stack([line - wide, top, line + wide], axis=1), 0.004, A.S_PLATE, closed=False,
          inward=lambda g: np.broadcast_to(hc, g.shape) - g)
    tube(m, top, 0.0055, A.S_PLATE, n=5)
    ng = cap_band(m, hc + np.array([0.0, 0.006, 0.0]), sr * 1.06, (low - 0.32, low - 0.04), (BACK - 1.3, BACK + 1.3),
                  thick, A.S_PLATE, tilt=rot((1, 0, 0), 8), rows=2, cols=14)
    tube(m, ng[0], 0.0045, A.S_TRIM, n=5)
    hang(parts, mat, fit, [('armour_helm', m, 'head')])


def fighters_helm(parts, fit, mat):
    s = fit.s
    m = Mesh()
    hc, sr, low, p = helm_frame(fit, tall=1.0)
    cap_band(m, hc + np.array([0.0, 0.004, 0.0]), sr + 0.004, (-1.05, low + 0.15), (FRONT + 0.8, FRONT + TAU - 0.8),
             0.004, A.S_MAIL, rows=8, cols=28)   # the coif round the face
    crown = cap_band(m, hc, sr + 0.006, (low + 0.04, 1.5707), (0, TAU), s['thick'], A.S_PLATE, rows=8, cols=32)
    inner = crown[0]
    o = inner - hc
    o[:, 2] = 0.0
    o /= np.linalg.norm(o, axis=1, keepdims=True)
    outer = inner + o * 0.05 - np.array([0.0, 0.0, 0.022])   # the brim, round and sloping down
    solid(m, np.stack([inner, (inner + outer) / 2, outer]), s['thick'] * 0.8, A.S_PLATE, closed=True,
          inward=lambda g: np.broadcast_to([0.0, 0.0, -1.0], g.shape))
    tube(m, outer, 0.0045, A.S_TRIM, n=5, closed=True)
    a = np.linspace(-1.1, 1.1, 13)   # a low comb from front to back over the crown
    line = hc + np.stack([0 * a, -np.sin(a) * (sr[1] + 0.006), np.cos(a) * (sr[2] + 0.006)], axis=1)
    tube(m, line + (line - hc) / np.linalg.norm(line - hc, axis=1, keepdims=True) * 0.004, 0.0055, A.S_TRIM, n=5)
    hang(parts, mat, fit, [('armour_helm', m, 'head')])


def fighters_cuirass(parts, fit, mat):
    s = fit.s
    gap, thick = s['gap'], s['thick']
    chest, spine, pelvis = Mesh(), Mesh(), Mesh()
    torso = ['torso']
    solid(chest, fit.band(torso, np.linspace(1.5, 1.17, 8), gap), 0.004, A.S_MAIL)
    solid(spine, fit.band(torso, np.linspace(1.19, 1.0, 5), gap + 0.002), 0.004, A.S_MAIL)
    hem = fit.band(torso, np.linspace(1.01, 0.9, 3), lambda z: gap + 0.004 + 0.2 * (1.01 - z))
    solid(pelvis, hem, 0.004, A.S_MAIL)
    tube(pelvis, A._out(hem, len(hem) - 1, 0.002)[0], 0.004, A.S_STRAP, n=5, closed=True)
    wrap = np.linspace(FRONT - 1.35, FRONT + 1.35, 41)   # the breastplate, on the front alone
    bp = fit.band(torso, np.linspace(1.47, 1.14, 14), gap + 0.009, th=wrap, keel_h=0.012,
                  top=lambda t: -0.06 * A._toward(t, FRONT + 1.35, 0.5) - 0.06 * A._toward(t, FRONT - 1.35, 0.5),
                  hem=lambda t: 0.03 * A._toward(t, FRONT, 1.0))
    solid(chest, bp, thick, A.S_PLATE, closed=False)
    A._rim(chest, bp, 0.0055, A.S_TRIM)
    for z in (1.36, 1.24):   # strapped round the flanks and across the back
        st = fit.band(torso, [z + 0.012, z - 0.012], gap + 0.006, th=np.linspace(FRONT + 1.3, FRONT + TAU - 1.3, 31),
                      keel_h=0.0)
        solid(chest, st, 0.004, A.S_STRAP, closed=False)
        for j in (0, st.shape[1] - 1):
            q = st[:, j].mean(axis=0)
            box(chest, q, (0.022, 0.024, 0.006), outward(fit, torso, z, q), (0, 0, 1), A.S_TRIM)
    for k, (a, b) in enumerate(((1.55, 1.505), (1.51, 1.47))):   # the gorget
        gg = fit.band(torso, np.linspace(a, b, 3), gap * 0.7 + 0.004 * k)
        solid(chest, gg, thick * 0.8, A.S_PLATE)
        tube(chest, A._out(gg, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
    A._belt(pelvis, fit, 1.06, out=0.012)
    hang(parts, mat, fit, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                           ('armour_cuirass.pelvis', pelvis, 'pelvis')])
    for side in 'LR':   # mail sleeves to the elbow, a round cop over it
        rere, lower = Mesh(), Mesh()
        region = [f'arm_{side}']
        ez = rest(f'farm_{side}')[2]
        solid(rere, fit.band(region, np.linspace(arm_z(1.43), ez + 0.02, 6), 0.008, keel_h=0.0), 0.004, A.S_MAIL)
        cop = A._cop(fit, lower, region, ez, BACK, 0.016, 0.045, 0.016, span=2.4)
        A._rim(lower, cop, 0.0045, A.S_TRIM)
        hang(parts, mat, fit, [(f'armour_cuirass.rere_{side}', rere, f'uarm_{side}'),
                               (f'armour_cuirass.couter_{side}', lower, f'farm_{side}')])


def knights_cuirass(parts, fit, mat):
    s = fit.s
    gap, thick = s['gap'], s['thick']
    chest, spine, pelvis = Mesh(), Mesh(), Mesh()
    torso = ['torso']
    with section(fit, ('round',)):
        hole = lambda t: -0.085 * np.abs(np.cos(t)) ** 4   # noqa: E731
        sc = fit.band(torso, np.linspace(1.52, 1.17, 10), gap + 0.004, top=hole, keel_h=0.0)
        solid(chest, sc, 0.005, A.S_SASH)
        solid(spine, fit.band(torso, np.linspace(1.18, 1.05, 4), gap + 0.006, keel_h=0.0), 0.005, A.S_SASH)
        hm = fit.band(torso, np.linspace(1.06, 0.94, 4), lambda z: gap + 0.008 + 0.15 * max(0.0, 1.06 - z),
                      keel_h=0.0)
        solid(pelvis, hm, 0.005, A.S_SASH)   # to the hips, no skirt
        tube(pelvis, A._out(hm, len(hm) - 1, 0.002)[0], 0.004, A.S_SASH, n=5, closed=True)
        for at in (FRONT, BACK):   # the cross on the breast and the back
            v = fit.band(torso, np.linspace(1.47, 1.15, 6), gap + 0.01, th=np.linspace(at - 0.13, at + 0.13, 5),
                         keel_h=0.0)
            solid(chest, v, 0.004, A.S_TRIM, closed=False)
            h = fit.band(torso, [1.37, 1.325], gap + 0.011, th=np.linspace(at - 0.62, at + 0.62, 13), keel_h=0.0)
            solid(chest, h, 0.004, A.S_TRIM, closed=False)
        bg = fit.band(torso, [1.1, 1.065], gap + 0.012)   # a dark belt, its buckle bright
        solid(spine, bg, 0.005, A.S_STRAP)
        q = fit.band(torso, [1.083], gap + 0.018, th=[FRONT], keel_h=0.0)[0, 0]
        box(spine, q, (0.04, 0.034, 0.008), outward(fit, torso, 1.083, q), (0, 0, 1), A.S_TRIM)
        for k, (a, b) in enumerate(((1.555, 1.51), (1.515, 1.475))):   # the gorget
            gg = fit.band(torso, np.linspace(a, b, 3), gap * 0.6 + 0.004 * k)
            solid(chest, gg, thick * 0.8, A.S_PLATE)
            tube(chest, A._out(gg, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
    hang(parts, mat, fit, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                           ('armour_cuirass.pelvis', pelvis, 'pelvis')])
    for side in 'LR':   # plate arms to a cop fanned on its outer side
        rere, lower = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        region = [f'arm_{side}']
        ez = rest(f'farm_{side}')[2]
        with section(fit, ('round',)):
            g = fit.band(region, np.linspace(arm_z(1.42), ez + 0.03, 8), gap * 0.6, keel_h=0.0)
            solid(rere, g, thick * 0.8, A.S_PLATE)
            tube(rere, A._out(g, len(g) - 1, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
            A._cop(fit, lower, region, ez, BACK, gap * 0.6 + 0.005, 0.05, 0.016, span=2.6)
            q = fit.band(region, [ez], gap * 0.6 + 0.02, th=[(0.0 if side == 'L' else math.pi) + 0.6 * x],
                         keel_h=0.0)[0, 0]
        disc(lower, q, outward(fit, region, ez, q) + np.array([0.0, 0.25, 0.0]), 0.036, 0.005, rim=0.0045)
        hang(parts, mat, fit, [(f'armour_cuirass.rere_{side}', rere, f'uarm_{side}'),
                               (f'armour_cuirass.couter_{side}', lower, f'farm_{side}')])


def steel_helm(parts, fit, mat):
    """The round helm with a nasal and mail hung from its rim (armour.py's, which only steel wears so), a keeled comb
    along its crown from brow to nape, and a band round its brow."""
    A.helm(parts, fit, mat)
    m = Mesh()
    hc, sr, low, p = helm_frame(fit, tall=1.04)
    a = np.linspace(-1.15, 1.25, 15)
    line = hc + np.stack([0 * a, -np.sin(a) * (sr[1] + 0.002), np.cos(a) * (sr[2] + 0.002)], axis=1)
    o = (line - hc) / np.linalg.norm(line - hc, axis=1, keepdims=True)
    top = line + o * (0.018 * np.cos(a * 0.9) ** 0.6)[:, None]
    solid(m, np.stack([line, top], axis=1), 0.008, A.S_PLATE, closed=False,
          inward=lambda g: np.broadcast_to([1.0, 0.0, 0.0], g.shape))
    tube(m, top, 0.0045, A.S_TRIM, n=5)
    band = cap_band(m, hc, sr * 1.02 + 0.003, (low + 0.01, low + 0.1), (0, TAU), 0.004, A.S_PLATE, rows=1, cols=32)
    tube(m, A._out(band, 0, 0.002)[0], 0.0045, A.S_TRIM, n=5, closed=True)
    hang(parts, mat, fit, [('armour_helm.comb', m, 'head')])


def adamantium_pauldrons(parts, fit, mat):
    """A rounded cap over each shoulder, its foot turned out in a broad flared brim like a bell's lip, rolled bold at
    its edge; a low comb along its crown with the pale blue gem set in a ring at its front; two lames under it, each
    flared the same, smaller. At a shoulder's own size."""
    s = fit.s

    def brim(m, c, foot, reach, drop, rim):
        o = foot - c
        o[:, 2] = 0.0
        o /= np.maximum(np.linalg.norm(o, axis=1, keepdims=True), 1e-9)
        edge = foot + o * reach - np.array([0.0, 0.0, drop])
        g = np.stack([foot + np.array([0.0, 0.0, 0.004]), (foot + edge) / 2, edge])
        solid(m, g, s['thick'], A.S_PLATE, closed=False, inward=lambda gg: np.broadcast_to([0.0, 0.0, -1.0], gg.shape))
        tube(m, edge, rim, A.S_PLATE, n=6)
    for side in 'LR':
        m = Mesh()
        c, r, mid, x, lo, hi = shoulder_frame(fit, side)
        R = rot((0, 1, 0), -22 * x)
        radii = (r + s['gap'] + 0.01) * np.array([1.02, 1.1, 0.95])
        lon = (mid - 2.15, mid + 2.15)
        cap = cap_band(m, c, radii, (0.05, 1.38), lon, s['thick'] * 1.1, A.S_PLATE, tilt=R, rows=9, cols=26)
        brim(m, c, cap[0], 0.026, 0.012, 0.0065)
        for k in range(2):
            ck = c + np.array([0.022 * x * (k + 1), 0.0, -0.05 * (k + 1)])
            lg = cap_band(m, ck, radii * (0.95 - 0.06 * k), (-0.3, 0.2), (mid - 1.95, mid + 1.95), s['thick'],
                          A.S_PLATE, tilt=rot((0, 1, 0), -(32 + 9 * k) * x), rows=3, cols=22)
            brim(m, ck, lg[0], 0.016, 0.008, 0.0055)
        line = A._crest(c, radii, R, 0.0, 0.1)
        o = (line - c) / np.linalg.norm(line - c, axis=1, keepdims=True)
        top = line + o * (0.016 * np.sin(np.linspace(0.2, math.pi - 0.2, len(line))) ** 0.5)[:, None]
        side_n = R @ np.array([1.0, 0.0, 0.0])
        solid(m, np.stack([line, top], axis=1), 0.007, A.S_PLATE, closed=False,
              inward=lambda g: -np.broadcast_to(side_n, g.shape))
        tube(m, top, 0.004, A.S_PLATE, n=5)
        q = line[3] + o[3] * 0.012   # the gem at the comb's front
        n = o[3] + np.array([0.0, -0.6, 0.0])
        n /= np.linalg.norm(n)
        u = np.cross(n, [0.0, 0.0, 1.0])
        u /= np.linalg.norm(u)
        w = np.cross(n, u)
        tube(m, [q + 0.016 * (math.cos(t) * u + math.sin(t) * w) for t in np.linspace(0, TAU, 17)[:-1]], 0.0045,
             A.S_PLATE, n=5, closed=True)
        dome(m, q, 0.012, n, A.S_GLOW, height=0.008)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def thieves_pauldrons(parts, fit, mat):
    """Shoulders not alike: on the right, under the bandolier, a flat pad of stiff leather draped over the shoulder,
    stitched round and studded in brass; on the left, a strap alone over the shoulder, buckled."""
    for side in 'LR':
        m = Mesh()
        x = 1.0 if side == 'L' else -1.0
        if side == 'R':
            v = np.linspace(-1.0, 1.0, 7)
            g = over_shoulder(fit, side, np.linspace(0.1, 1.0, 6), v,
                              lambda U, V: 0.01 - 0.05 * U ** 1.3 - 0.06 * np.abs(V) ** 1.5, fit.s['gap'] + 0.012,
                              reach=0.03, spread=0.025)
            flat(m, g, 0.006, A.S_PLATE, rim=0.0035)
            for i, j in ((2, 2), (2, 4), (4, 2), (4, 4)):
                dome(m, g[i, j] + np.array([0.0, 0.0, 0.004]), 0.008, (0.0, 0.0, 1.0), A.S_GLOW, height=0.006)
        else:
            g = over_shoulder(fit, side, np.linspace(0.2, 0.75, 4), np.linspace(-1.0, 1.0, 9),
                              lambda U, V: 0.01 - 0.09 * np.abs(V) ** 1.4, fit.s['gap'] + 0.01, spread=0.02)
            strap_w = g[:, :, :].copy()
            strap_w = strap_w[1:3]
            flat(m, strap_w, 0.004, A.S_TRIM)
            box(m, strap_w[0, 4] + np.array([0.0, 0.0, 0.005]), (0.02, 0.018, 0.006), (0.0, 0.0, 1.0), (x, 0, 0),
                A.S_GLOW)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def mages_pauldrons(parts, fit, mat):
    """Stiff epaulettes: a flat board of teal over each shoulder's top, rimmed in brown, a silver stud at its heart,
    and a fringe of brown leather hung from its outer edge."""
    for side in 'LR':
        m = Mesh()
        x = 1.0 if side == 'L' else -1.0
        g = over_shoulder(fit, side, np.linspace(0.1, 1.0, 6), np.linspace(-1.0, 1.0, 7),
                          lambda U, V: 0.012 - 0.03 * U - 0.035 * np.abs(V) ** 2, fit.s['gap'] + 0.014, reach=0.03,
                          spread=0.015)
        flat(m, g, 0.006, A.S_PLATE, rim=0.005)
        dome(m, g[3, 3] + np.array([0.0, 0.0, 0.004]), 0.011, (0.0, 0.0, 1.0), A.S_GLOW, height=0.007)
        for q in g[-1][::1]:   # the fringe
            o = np.array([x, 0.0, 0.0])
            tongue(m, q + o * 0.003, q + o * 0.012 + np.array([0.0, 0.0, -0.055]), 0.018, o, 0.003, A.S_TRIM)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def fighters_pauldrons(parts, fit, mat):
    """Splinted spaulders: a pad of stiff leather over each shoulder, four steel splints riveted down it from the
    neck out over the arm, a strap buckled across them."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        x = 1.0 if side == 'L' else -1.0
        v = np.linspace(-1.0, 1.0, 9)
        z = lambda U, V: 0.012 - 0.07 * U ** 1.5 - 0.055 * np.abs(V) ** 1.6   # noqa: E731
        pad = over_shoulder(fit, side, np.linspace(0.0, 1.0, 8), v, z, s['gap'] + 0.012, reach=0.015, spread=0.02)
        flat(m, pad, 0.006, A.S_LEATHER, rim=0.0035, rim_slot=A.S_STRAP)
        for j in (1, 3, 5, 7):
            line = pad[:, j] + np.array([0.0, 0.0, 0.006])
            strip = np.stack([line - np.array([0.0, 0.011, 0.0]), line + np.array([0.0, 0.011, 0.0])], axis=1)
            flat(m, strip, 0.004, A.S_PLATE)
            dome(m, line[1] + np.array([0.0, 0.0, 0.004]), 0.006, (0.0, 0.0, 1.0), A.S_TRIM)
        band = pad[4:6] + np.array([0.0, 0.0, 0.011])
        flat(m, band, 0.003, A.S_STRAP)
        box(m, band[0, 4] + np.array([0.0, 0.0, 0.005]), (0.022, 0.02, 0.006), (0.0, 0.0, 1.0), (x, 0, 0), A.S_TRIM)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def knights_pauldrons(parts, fit, mat):
    """A flat plate of steel over each shoulder, folded down front and back, and on it an ailette: a square board of the
    order's blue standing up from the shoulder, leaning out, a bright cross on it and its edge bright."""
    s = fit.s
    v = np.array([-1.0, -0.6, -0.3, 0.0, 0.3, 0.6, 1.0])
    for side in 'LR':
        m = Mesh()
        x = 1.0 if side == 'L' else -1.0
        g = over_shoulder(fit, side, np.linspace(0.0, 1.0, 7), v,
                          lambda U, V: 0.015 - 0.055 * U ** 1.4 - 0.06 * np.clip(np.abs(V) - 0.3, 0, None) / 0.7,
                          s['gap'] + 0.014, reach=0.015, spread=0.02)
        flat(m, g, s['thick'], A.S_PLATE, rim=0.005)
        foot = g[4, 3] + np.array([0.0, 0.0, 0.004])   # the ailette, standing on the plate's outer half
        w, h, lean = 0.055, 0.12, 0.28
        up = np.array([x * lean, 0.0, 1.0])
        up /= np.linalg.norm(up)
        corners = np.array([[foot + np.array([0.0, -w, 0.0]) + up * hh, foot + up * hh, foot + np.array([0.0, w, 0.0])
                             + up * hh] for hh in np.linspace(0.0, h, 5)])
        n = np.cross(up, [0.0, 1.0, 0.0])
        n = n * np.sign(n[0] * x)
        solid(m, corners, 0.005, A.S_SASH, closed=False, inward=lambda gg: -np.broadcast_to(n, gg.shape))
        A._rim(m, corners, 0.004, A.S_TRIM)
        face = corners + n * 0.003
        solid(m, np.stack([face[:, 1] - np.array([0.0, 0.009, 0.0]), face[:, 1] + np.array([0.0, 0.009, 0.0])],
                          axis=1)[1:4], 0.002, A.S_TRIM, closed=False, inward=lambda gg: -np.broadcast_to(n, gg.shape))
        mid = face[3]
        solid(m, np.array([[mid[0] - np.array([0.0, 0.0, 0.009]), mid[2] - np.array([0.0, 0.0, 0.009])],
                           [mid[0] + np.array([0.0, 0.0, 0.009]), mid[2] + np.array([0.0, 0.0, 0.009])]]), 0.002,
              A.S_TRIM, closed=False, inward=lambda gg: -np.broadcast_to(n, gg.shape))
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def knights_helm(parts, fit, mat):
    """An armet: a smooth round skull, its visor drawn forward to a point like a sparrow's beak under a dark slit
    across the eyes, a bevor round the jaw; a comb along its crown and a plume of the order's blue swept back from
    its top."""
    s = fit.s
    m = Mesh()
    with section(fit, ('round',)):
        hc, sr, low, p = helm_frame(fit, tall=1.05)
    thick = s['thick']
    cap_band(m, hc, sr, (low - 0.02, 1.5707), (0, TAU), thick, A.S_PLATE, rows=10, cols=32)
    fr = visor_front(hc, sr, p, 0.01)
    ez = eye_z(p)
    eye = math.asin(np.clip((ez - hc[2]) / fr[2], -0.9, 0.9))
    lat = np.linspace(-1.05, low + 0.06, 9)
    lon = np.linspace(FRONT - 1.4, FRONT + 1.4, 17)
    L, G = np.meshgrid(lat, lon, indexing='ij')
    pts = np.stack([np.cos(L) * np.cos(G) * (fr[0] + 0.006), np.cos(L) * np.sin(G) * (fr[1] + 0.006),
                    np.sin(L) * fr[2]], axis=-1) + hc
    beak = 0.05 * np.clip(np.cos((G - FRONT) / 0.75 * math.pi / 2), 0, 1) ** 1.6 \
        * np.clip(1.0 - np.abs(L - (eye - 0.3)) / 0.55, 0, 1) ** 1.2
    pts[..., 1] -= beak
    solid(m, pts, thick, A.S_PLATE, closed=False, inward=hc)
    A._rim(m, pts, 0.004, A.S_TRIM)
    sl = []
    for la in (eye + 0.05, eye - 0.03):
        row = np.stack([np.cos(la) * np.cos(lon) * (fr[0] + 0.009), np.cos(la) * np.sin(lon) * (fr[1] + 0.009),
                        np.full_like(lon, np.sin(la) * fr[2])], axis=-1) + hc
        row[:, 1] -= 0.05 * np.clip(np.cos((lon - FRONT) / 0.75 * math.pi / 2), 0, 1) ** 1.6 \
            * max(0.0, 1.0 - abs(la - (eye - 0.3)) / 0.55) ** 1.2
        sl.append(row[3:-3])
    solid(m, np.array(sl), 0.002, A.S_DARK, closed=False, inward=hc)
    bv = cap_band(m, hc, fr * np.array([1.05, 1.0, 1.0]) + 0.008, (-1.3, -0.95), (0, TAU), thick, A.S_PLATE, rows=2,
                  cols=32)   # the bevor
    tube(m, A._out(bv, len(bv) - 1, 0.002)[0], 0.0045, A.S_TRIM, n=5, closed=True)
    a = np.linspace(-1.0, 1.2, 13)
    line = hc + np.stack([0 * a, -np.sin(a) * (sr[1] + 0.003), np.cos(a) * (sr[2] + 0.003)], axis=1)
    tube(m, line, 0.0055, A.S_TRIM, n=5)
    root = hc + np.array([0.0, 0.02, sr[2] + 0.004])   # the plume
    for k in np.linspace(-1.0, 1.0, 4):
        blade(m, root + np.array([0.008 * k, 0.0, 0.0]), root + np.array([0.025 * k, 0.15, 0.07 - 0.02 * abs(k)]),
              0.045, np.array([1.0, 0.0, 0.15 * k]), 0.004, A.S_SASH, curve=(0.0, 0.02, 0.05), belly=0.45)
    hang(parts, mat, fit, [('armour_helm', m, 'head')])


def steel_pauldrons(parts, fit, mat):
    """A spaulder of lames: a small cap over the shoulder's top and four lames under it stepping down the arm, each a
    little broader than the one above and lapping it, every foot rolled, a rib across the cap; at a shoulder's size."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        c, r, mid, x, lo, hi = shoulder_frame(fit, side)
        R = rot((0, 1, 0), -22 * x)
        radii = (r + s['gap'] + 0.008) * np.array([0.95, 1.05, 0.9])
        lon = (mid - 2.0, mid + 2.0)
        cap = cap_band(m, c, radii, (0.35, 1.4), lon, s['thick'], A.S_PLATE, tilt=R, rows=6, cols=22)
        tube(m, cap[0], 0.0048, A.S_TRIM, n=5)
        rib = np.array([A._on_shell(c, radii, R, [0.95], lo_, 0.003)[0] for lo_ in np.linspace(lon[0] + 0.3,
                                                                                               lon[1] - 0.3, 13)])
        tube(m, rib, 0.0045, A.S_TRIM, n=5)
        for k in range(4):
            ck = c + np.array([0.012 * x * (k + 1), 0.0, -0.028 * (k + 1)])
            rk = radii * (1.0 + 0.025 * k)
            lg = cap_band(m, ck, rk, (0.05, 0.42), (mid - 2.05 + 0.08 * k, mid + 2.05 - 0.08 * k), s['thick'] * 0.9,
                          A.S_PLATE, tilt=R @ rot((0, 1, 0), -6 * (k + 1) * x), rows=2, cols=20)
            tube(m, lg[0], 0.0045, A.S_TRIM, n=5)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def brotherhood_pauldrons(parts, fit, mat):
    for side in 'LR':
        m = Mesh()
        c, r, mid, x, lo, hi = shoulder_frame(fit, side)
        R = rot((0, 1, 0), -26 * x)
        for k in range(2):
            radii = (r + fit.s['gap'] + 0.01 - 0.004 * k) * np.array([1.0, 1.0 - 0.12 * k, 0.8])
            ck = c + np.array([0.025 * x * k, 0.0, -0.045 * k])
            g = cap_band(m, ck, radii, (-0.25, 1.25 - 0.45 * k), (mid - 1.75, mid + 1.75), 0.006, A.S_TRIM,
                         tilt=R @ rot((0, 1, 0), -12 * k * x), rows=5, cols=18,
                         edge=lambda b: 0.42 * max(0.0, math.cos(b - mid)) ** 3)   # drawn out to a point over the arm
            A._rim(m, g, 0.0035, A.S_PLATE)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def elven_pauldrons(parts, fit, mat):
    """Three curved lames layered down each shoulder like leaves, the upper lapping the lower, each wrapped round the
    shoulder and drawn at its foot to a leaf's point swept back over the arm, a vein raised down its middle to the
    point and its edge rimmed in the darker trim; a spiral on the topmost. At a shoulder's own size."""
    s = fit.s
    for side in 'LR':
        m = Mesh()
        c, r, mid, x, lo, hi = shoulder_frame(fit, side)
        base = (r + s['gap'] + 0.006) * np.array([0.98, 1.06, 0.9])
        for k in (2, 1, 0):   # the lowest first, so each above laps it
            ck = c + np.array([0.016 * x * k, 0.004 * k, -0.034 * k])
            R = rot((0, 1, 0), -(20 + 9 * k) * x)
            radii = base * (1.0 + 0.04 * (2 - k))
            lat = ((0.62, 1.38), (0.2, 0.86), (-0.2, 0.46))[k]
            reach = (1.75, 1.95, 2.1)[k]
            tip = mid + (0.35 + 0.1 * k) * x   # the leaf's point, swept back
            depth, w = (0.26, 0.32, 0.38)[k], 1.25
            lv = cap_band(m, ck, radii, lat, (mid - reach, mid + reach), s['thick'], A.S_PLATE, tilt=R, rows=5,
                          cols=26, edge=lambda b, t=tip, d=depth: d * max(0.0, 1.0 - abs(b - t) / w) ** 1.6)
            A._rim(m, lv, 0.0035, A.S_TRIM)
            vein = A._on_shell(ck, radii, R, np.linspace(lat[1] - 0.06, lat[0] - depth + 0.03, 9), tip, 0.003)
            tube(m, vein, 0.0035, A.S_TRIM, n=5)
            if k == 0:
                q = A._on_shell(ck, radii, R, [1.0], mid - 0.15 * x, 0.002)[0]
                A._spiral(m, q, q - ck, 0.026)
        hang(parts, mat, fit, [(f'armour_pauldrons.{side}', m, f'clav_{side}')])


def dwarven_cuirass(parts, fit, mat):
    """A broad breastplate ribbed across the chest, a raised strip down its middle; the belly in two banded lames;
    a thick collar of three stacked rolls round the neck; a broad dark belt under a bronze buckle plate; the back
    ribbed too. The upper arms are the dark sleeve under the pauldrons; a cop over each elbow."""
    s = fit.s
    gap, thick = s['gap'] + 0.002, s['thick']
    chest, spine, pelvis = Mesh(), Mesh(), Mesh()
    torso = ['torso']
    from armourkit import keel
    breast = 0.4 if fit.woman else 1.0   # hers shaped by her own form
    swell = lambda z, t: (0.014 * breast * A._bump(z, 1.35, 0.12) * A._toward(t, FRONT, 1.5)   # noqa: E731
                          + keel(t, 0.006, 0.3, BACK))
    g = fit.band(torso, np.linspace(1.5, 1.19, 14), gap, keel_h=0.0, bulge=swell,
                 top=lambda t: -0.07 * np.abs(np.cos(t)) ** 4)
    solid(chest, g, thick, A.S_PLATE)
    tube(chest, A._out(g, 0, 0.004)[0], 0.006, A.S_PLATE, n=6, closed=True)
    for z in (1.415, 1.275):   # two broad bands across it, front and back, raised in its own bronze
        for at in (FRONT, BACK):
            rib = fit.band(torso, np.linspace(z + 0.014, z - 0.014, 4), gap + thick + 0.002,
                           th=np.linspace(at - 1.15, at + 1.15, 21), keel_h=0.0, bulge=swell)
            solid(chest, rib, 0.008, A.S_PLATE, closed=False)
    strip_ = fit.band(torso, np.linspace(1.47, 1.2, 8), gap + thick + 0.006,
                      th=np.linspace(FRONT - 0.14, FRONT + 0.14, 5), keel_h=0.0, bulge=swell)   # down its middle
    solid(chest, strip_, 0.006, A.S_PLATE, closed=False)
    A._rim(chest, strip_, 0.0035, A.S_TRIM)
    for j in (0, 4):   # studs down either side of it
        for i in (1, 4, 6):
            q = strip_[i, j]
            o = outward(fit, torso, float(q[2]), q)
            dome(chest, q + o * 0.003, 0.011, o, A.S_PLATE, height=0.008)
    for k, (a, b) in enumerate(((1.19, 1.14), (1.145, 1.095))):   # the belly's lames
        lg = fit.band(torso, np.linspace(a, b, 3), gap + 0.004 + 0.003 * k, keel_h=0.0)
        solid(spine, lg, thick, A.S_PLATE)
        tube(spine, A._out(lg, len(lg) - 1, 0.003)[0], 0.005, A.S_TRIM, n=5, closed=True)
    for k, z in enumerate((1.48, 1.505, 1.53)):   # the collar, three stacked rolls, broadest at its foot
        pts = A._out(fit.band(torso, [z], gap * 0.7 + 0.03 - 0.009 * k, keel_h=0.0), 0)[0]
        tube(chest, pts, 0.017 - 0.003 * k, A.S_PLATE, n=8, closed=True)
    bg = fit.band(torso, [1.1, 1.04], gap + 0.016, keel_h=0.0)   # the belt, dark, and its buckle plate
    solid(pelvis, bg, 0.007, A.S_SASH)
    q = fit.band(torso, [1.07], gap + 0.024, th=[FRONT], keel_h=0.0)[0, 0]
    box(pelvis, q, (0.07, 0.06, 0.01), outward(fit, torso, 1.07, q), (0, 0, 1), A.S_PLATE)
    hang(parts, mat, fit, [('armour_cuirass.chest', chest, 'chest'), ('armour_cuirass.spine', spine, 'spine'),
                           ('armour_cuirass.pelvis', pelvis, 'pelvis')])
    for side in 'LR':   # a cop over each elbow, the upper arm left to the dark sleeve
        lower = Mesh()
        region = [f'arm_{side}']
        ez = rest(f'farm_{side}')[2]
        cop = A._cop(fit, lower, region, ez, BACK, gap * 0.7 + 0.008, 0.05, 0.02, span=2.4)
        A._rim(lower, cop, 0.0045, A.S_TRIM)
        hang(parts, mat, fit, [(f'armour_cuirass.couter_{side}', lower, f'farm_{side}')])


def adamantium_helm(parts, fit, mat):
    """A smooth closed helm, a comb raised from the brow over the crown to the nape; a faceplate opened in a dark T,
    a slit across the eyes and a slot down from it to the chin, a ridge either side of the slot; the pale blue gem in a
    ring on the brow; a bevor round the jaw and throat."""
    s = fit.s
    m = Mesh()
    hc, sr, low, p = helm_frame(fit, tall=1.08)
    thick = s['thick']
    cap_band(m, hc, sr, (low - 0.03, 1.5707), (0, TAU), thick, A.S_PLATE, rows=10, cols=32)
    fr = visor_front(hc, sr, p, 0.012)
    ez = eye_z(p)
    eye = math.asin(np.clip((ez - hc[2]) / fr[2], -0.9, 0.9))
    face = cap_band(m, hc, fr, (-1.0, low + 0.04), (FRONT - 1.65, FRONT + 1.65), thick, A.S_PLATE, rows=8, cols=22)
    A._rim(m, face, 0.0045, A.S_TRIM)   # wrapped round past the ears
    nape = cap_band(m, hc + np.array([0.0, 0.004, 0.0]), sr * 1.04, (-1.0, low + 0.06), (BACK - 1.75, BACK + 1.75),
                    thick, A.S_PLATE, rows=6, cols=20)   # and the nape shut behind
    tube(m, nape[0], 0.0045, A.S_TRIM, n=5)
    cap_band(m, hc, fr + 0.003, (eye - 0.045, eye + 0.04), (FRONT - 0.72, FRONT + 0.72), 0.002, A.S_DARK, rows=1,
             cols=9)   # the T: its slit across the eyes
    cap_band(m, hc, fr + 0.003, (-0.78, eye - 0.03), (FRONT - 0.075, FRONT + 0.075), 0.002, A.S_DARK, rows=3,
             cols=2)   # and its slot down to the chin
    for x in (1, -1):
        b = FRONT + 0.2 * x
        tube(m, [hc + (fr + 0.007) * np.array([math.cos(la) * math.cos(b), math.cos(la) * math.sin(b), math.sin(la)])
                 for la in np.linspace(eye - 0.08, -0.78, 5)], 0.005, A.S_PLATE, n=5)
    a = np.linspace(-1.05, 1.3, 15)   # the comb
    line = hc + np.stack([0 * a, -np.sin(a) * (sr[1] + 0.002), np.cos(a) * (sr[2] + 0.002)], axis=1)
    up = (line - hc) / np.linalg.norm(line - hc, axis=1, keepdims=True)
    top = line + up * (0.022 * np.cos(a * 0.85) ** 0.6)[:, None]
    solid(m, np.stack([line, top], axis=1), 0.008, A.S_PLATE, closed=False,
          inward=lambda g: np.broadcast_to([1.0, 0.0, 0.0], g.shape))
    tube(m, top, 0.0045, A.S_PLATE, n=5)
    la = eye + 0.22   # the gem on the brow
    q = hc + np.array([0.0, -(fr[1] + 0.004) * math.cos(la), fr[2] * math.sin(la)])
    dome(m, q, 0.013, (0.0, -1.0, 0.25), A.S_GLOW, height=0.009)
    tube(m, [q + 0.016 * np.array([math.cos(t), -0.15, math.sin(t)]) for t in np.linspace(0.0, TAU, 13)], 0.0035,
         A.S_PLATE, n=4, closed=True)
    bv = cap_band(m, hc, fr * np.array([1.05, 1.0, 1.0]) + 0.006, (-1.32, -0.95), (0, TAU), thick, A.S_PLATE, rows=2,
                  cols=32)   # the bevor
    tube(m, A._out(bv, len(bv) - 1, 0.002)[0], 0.0045, A.S_TRIM, n=5, closed=True)
    hang(parts, mat, fit, [('armour_helm', m, 'head')])


def adamantium_cuirass(parts, fit, mat):
    """The plackarted breast (armour.py's, which only adamantium wears so), and its own arms: a rerebrace keeled down
    its outer side under a raised band, rolled at each end; a domed cop over the elbow, a fan on its outer side ringed
    within its rim."""
    arms = fit.s['arms']
    fit.s['arms'] = None
    try:
        A.cuirass(parts, fit, mat)
    finally:
        fit.s['arms'] = arms
    s = fit.s
    gap, thick = s['gap'], s['thick']
    for side in 'LR':
        rere, lower = Mesh(), Mesh()
        x = 1.0 if side == 'L' else -1.0
        out = 0.0 if side == 'L' else math.pi
        region = [f'arm_{side}']
        ez = rest(f'farm_{side}')[2]
        g = fit.band(region, np.linspace(arm_z(1.42), ez + 0.035, 8), gap * 0.7, keel_h=0.006, facing=out)
        solid(rere, g, thick * 0.9, A.S_PLATE)
        tube(rere, A._out(g, 0, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        tube(rere, A._out(g, len(g) - 1, 0.003)[0], 0.0045, A.S_TRIM, n=5, closed=True)
        hoop(rere, fit, region, arm_z(1.34), gap * 0.7 + thick + 0.002, half=0.008, thick=0.005, slot=A.S_PLATE)
        cop = A._cop(fit, lower, region, ez, BACK, gap * 0.7 + 0.006, 0.05, 0.024, span=2.4)
        A._rim(lower, cop, 0.0045, A.S_TRIM)
        q = fit.band(region, [ez], gap * 0.7 + 0.018, th=[out + 0.6 * x], keel_h=0.0)[0, 0]
        n = outward(fit, region, ez, q) + np.array([0.0, 0.25, 0.0])
        n /= np.linalg.norm(n)
        disc(lower, q, n, 0.036, 0.005, rim=0.005)
        u = np.cross(n, [0.0, 0.0, 1.0])
        u /= np.linalg.norm(u)
        w = np.cross(n, u)
        ring_ = [q + n * 0.006 + 0.021 * (math.cos(t) * u + math.sin(t) * w) for t in np.linspace(0, TAU, 17)[:-1]]
        tube(lower, ring_, 0.0035, A.S_PLATE, n=4, closed=True)
        hang(parts, mat, fit, [(f'armour_cuirass.rere_{side}', rere, f'uarm_{side}'),
                               (f'armour_cuirass.couter_{side}', lower, f'farm_{side}')])


MAKES = {
    'Leather': {'pauldrons': leather_pauldrons, 'gauntlets': leather_gauntlets, 'greaves': leather_greaves,
                'boots': leather_boots},
    'Chain': {'cuirass': chain_cuirass, 'gauntlets': chain_gauntlets, 'greaves': chain_greaves, 'boots': chain_boots},
    'Iron': {'helm': iron_helm, 'cuirass': iron_cuirass, 'pauldrons': iron_pauldrons, 'gauntlets': iron_gauntlets,
             'greaves': iron_greaves, 'boots': iron_boots},
    'Steel': {'helm': steel_helm, 'cuirass': steel_cuirass, 'pauldrons': steel_pauldrons,
              'gauntlets': steel_gauntlets, 'greaves': steel_greaves, 'boots': steel_boots},
    'Silver': {'helm': silver_helm, 'cuirass': silver_cuirass, 'pauldrons': silver_pauldrons,
               'gauntlets': silver_gauntlets, 'greaves': silver_greaves, 'boots': silver_boots},
    'Elven': {'pauldrons': elven_pauldrons, 'gauntlets': elven_gauntlets, 'greaves': elven_greaves,
              'boots': elven_boots},
    'Dwarven': {'helm': dwarven_helm, 'cuirass': dwarven_cuirass, 'pauldrons': dwarven_pauldrons,
                'gauntlets': dwarven_gauntlets, 'greaves': dwarven_greaves, 'boots': dwarven_boots},
    'Mithril': {'gauntlets': mithril_gauntlets, 'greaves': mithril_greaves, 'boots': mithril_boots},
    'Adamantium': {'helm': adamantium_helm, 'cuirass': adamantium_cuirass, 'pauldrons': adamantium_pauldrons,
                   'gauntlets': adamantium_gauntlets,
                   'greaves': adamantium_greaves, 'boots': adamantium_boots},
    'Ebony': {'gauntlets': ebony_gauntlets, 'greaves': ebony_greaves, 'boots': ebony_boots},
    'Orcish': {'gauntlets': orcish_gauntlets, 'greaves': orcish_greaves,
               'boots': orcish_boots},
    'Daedric': {'gauntlets': daedric_gauntlets, 'greaves': daedric_greaves, 'boots': daedric_boots},
    'Thieves': {'pauldrons': thieves_pauldrons, 'gauntlets': thieves_gauntlets, 'greaves': thieves_greaves,
                'boots': thieves_boots},
    'Brotherhood': {'pauldrons': brotherhood_pauldrons, 'gauntlets': brotherhood_gauntlets,
                    'greaves': brotherhood_greaves, 'boots': brotherhood_boots},
    'Mages': {'pauldrons': mages_pauldrons, 'gauntlets': mages_gauntlets, 'greaves': mages_greaves,
              'boots': mages_boots},
    'Fighters': {'helm': fighters_helm, 'cuirass': fighters_cuirass, 'pauldrons': fighters_pauldrons,
                 'gauntlets': fighters_gauntlets, 'greaves': fighters_greaves, 'boots': fighters_boots},
    'Knights': {'helm': knights_helm, 'cuirass': knights_cuirass, 'pauldrons': knights_pauldrons,
                'gauntlets': knights_gauntlets, 'greaves': knights_greaves, 'boots': knights_boots},
}
# what a set lays over its gauntlets' hands of its own (armour.py `gauntlet_hands`)
HANDS = {'Iron': iron_hand, 'Steel': steel_hand, 'Elven': elven_hand, 'Dwarven': dwarven_hand,
         'Adamantium': adamantium_hand, 'Ebony': ebony_hand, 'Orcish': orcish_hand, 'Daedric': daedric_hand,
         'Fighters': fighters_hand, 'Knights': knights_hand}


def hand_of(style):
    """The set's own hand dressing, or None."""
    return HANDS.get(style.get('set'))


def make_of(fit, piece):
    """The set's own make of `piece`, or None where armour.py's shared builder draws it."""
    return MAKES.get(fit.material, {}).get(piece)
