"""The Dwarven Thunderlock and the Dwarven Pistolet in first person: the forge's own guns (guns3p.py, brass and dark
steel) in the arm every first-person hand wears (fparm.py, closed as the torch's fist closes, fptorch.arm), drawn as
held things are (fpheldforge.py): the gun alone in each finish, and the hands alone in the bare glove or any armour
set, cut where the gun lies nearer the eye. Each spec's record 0 is the shot in the game's strips' cells
(combat/gun/thunderlockStrip.js, pistolStrip.js), 200 x 150 from the screen's bottom right: the Thunderlock's seven
(the rest, the shot, the flicker, four settling) and the Pistolet's six. Record 1 is the carry at a run (gunSprint.js).

A gun is one part, the gun and its arms rigid. Its space is the barrel's: +Z along the bore toward the muzzle, the root
on the bore's line under the forestock or over the grip, the gun's belly (its grip, its guard) toward +X at no roll.
The right fist, the left one mirrored, holds the grip, laid by its forearm leaving behind it; on the Thunderlock the
left hand lies open under the forestock (`CRADLE`). The shot, its smoke and the gems' flare are drawn per frame
(`over`, `frame_light`); the metals and the wood are dressed for the eye (guns3p.py `LOOK`)."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # run as a script, the forge's modules beside it
import fparm  # noqa: E402
import fptorch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OWN = ('brass', 'steel', 'stock', 'teal', 'flint', 'bore')   # guns3p.FINISH's roles, in its order
EXTRA = fptorch.EXTRA
CLASSES = {n: 7 for n in OWN}
SHEETS = ()
GRADE_AS = {}
# the arm's sizes are the torch's fitted ones (specs/TORCH-shape.json): the same hand holds every held thing
ARM = {'hand': 1.2934, 'fist': 1.0, 'arm_r': 1.293, 'cuff': 1.7283, 'thumb': 1.0, 'e_bend': 18.0, 'e_swing': 180.0}
SHAPES = {
    # a fist's girth (`*_r`), its place along what it holds (`*_at`, metres), its turn about it (`*_turn`: where the
    # forearm leaves, 0 straight back under the gun) and its wrist bent toward the thumb or the little finger
    # (`*_tilt`): `grip_` the right fist on the grip, its forearm dropping back to the shoulder. `fore_` the left hand
    # open under the Thunderlock's forestock: its palm `fore_palm` under the wood, `fore_side` to the gun's left, its
    # fingers `fore_turn` degrees from forward toward the gun's right
    'thunderlock': {'focal': 200.0, 'aspect': 1.0, **ARM, 'kind': 'thunderlock', 'finish': 'plain', 'grip_r': 0.0185,
                    'grip_at': 0.0, 'grip_turn': 0.0, 'grip_tilt': -25.0, 'fore_r': 0.0175, 'fore_at': 0.0,
                    'fore_palm': 0.014, 'fore_side': 0.026, 'fore_turn': 48.0},
    'pistolet': {'focal': 200.0, 'aspect': 1.0, **ARM, 'kind': 'pistolet', 'finish': 'plain', 'grip_r': 0.0215,
                 'grip_at': 0.0, 'grip_turn': 0.0, 'grip_tilt': -20.0},   # the model's origin is the high hold
}
# the lock's moving parts, by the frame (each pose's, from its spec's `lock`): the cock let fall forward from cocked
# onto the frizzen, the frizzen flung open off the pan; degrees forward about the line across the gun
JOINTS = (('cock', 4.0, (0.0, 50.0), 10.0, 0.0), ('frizzen', 4.0, (0.0, 90.0), 10.0, 0.0))
FINISHES = ('plain', 'gilded')   # guns3p.FINISHES


def _unit(v):
    v = np.asarray(v, dtype=np.float64)
    return v / max(np.linalg.norm(v), 1e-12)


def _frame(z, x):
    """An orthonormal frame (columns x, y, z) with its z along `z` and its x as near `x` as square to it allows."""
    z = _unit(z)
    x = _unit(np.asarray(x, dtype=np.float64) - z * (np.asarray(x) @ z))
    return np.stack([x, np.cross(z, x), z], axis=1)


_GUNS = {}
_LABELS = {}   # each gun's vertices: 1 the cock's, 2 the frizzen's, 0 the rest


def gun_mesh(kind, finish):
    """The gun in its own frame (guns3p.py: the grip at the origin, the bore up +Z, the belly toward +X): (vertices,
    triangles, material index among OWN), read off its Blender model once and its objects let go."""
    import guns3p
    key = (kind, finish)
    if key in _GUNS:
        return _GUNS[key]
    import bpy
    build = guns3p.build_thunderlock if kind == 'thunderlock' else guns3p.build_pistolet
    obs = build(finish, name=f'fp.{kind}.{finish}')
    dg = bpy.context.evaluated_depsgraph_get()
    vs, qs, ms, ls, at = [], [], [], [], 0
    for ob in obs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        mw = np.array(ob.matrix_world)
        co = np.array([v.co[:] for v in me.vertices], dtype=np.float64)
        co = co @ mw[:3, :3].T + mw[:3, 3]
        tris = np.array([t.vertices[:] for t in me.loop_triangles], dtype=np.int64).reshape(-1, 3)
        # a material's role is its name's fourth part (guns3p.materials_of: class.Gun.finish.role), whatever Blender
        # numbers a second build's copy
        names = [ob.material_slots[t.material_index].material.name.split('.')[3] for t in me.loop_triangles]
        vs.append(co)
        qs.append(tris + at)
        ms.append(np.array([OWN.index(n) for n in names], dtype=np.int64))
        part_of = ob.name.rsplit('.', 1)[-1]
        ls.append(np.full(len(co), 1 if part_of in guns3p.COCK_PARTS else 2 if part_of == 'frizzen' else 0))
        at += len(co)
        ev.to_mesh_clear()
    for ob in obs:
        bpy.data.objects.remove(ob, do_unlink=True)
    _GUNS[key] = (np.concatenate(vs), np.concatenate(qs), np.concatenate(ms))
    _LABELS[key] = np.concatenate(ls)
    return _GUNS[key]


def root(kind):
    """The part's root in the gun's own frame: on the bore's line, where the fist holding the barrel side is."""
    import guns3p
    if kind == 'thunderlock':
        return np.array(guns3p.FORESTOCK) - np.array([guns3p.FORE_DROP, 0.0, 0.0])   # the forestock's fist, on the bore
    return np.array([guns3p.MUZZLE['pistolet'][0], 0.0, 0.0])   # over the grip, on the bore


def muzzle(kind):
    """The muzzle in the part's space."""
    import guns3p
    return np.array(guns3p.MUZZLE[kind]) - root(kind)


def length(S, part=None):
    """How far the muzzle reaches up the part's axis: what a pose aims along."""
    return float(muzzle(S['kind'])[2])


def _grip_axis(kind):
    """Up a grip toward its barrel, in the gun's own frame: its line raked back from square (guns3p.RAKE)."""
    import guns3p
    r = math.radians(guns3p.rake(kind))
    return _unit([-math.cos(r), 0.0, math.sin(r)])


def _arm(S, radius, tilt):
    """The left arm closed on a handle of `radius` along +Z through the origin (fptorch.arm, the torch's fist), its
    wrist bent `tilt` degrees, and the way its forearm runs from the wrist to the elbow."""
    v, q, m = fptorch.arm(S, {'l_tilt': tilt}, radius, OWN)
    elbow, wrist = fptorch._marks_of(fptorch.grip_shape(S, radius), v)
    return v, q, m, _unit(v[elbow].mean(axis=0) - v[wrist].mean(axis=0))


def _turned(v, axis, deg):
    """`v` turned `deg` degrees about the unit `axis`."""
    a = math.radians(deg)
    k = np.asarray(axis, dtype=np.float64)
    return v * math.cos(a) + np.cross(k, v) * math.sin(a) + k * (k @ v) * (1 - math.cos(a))


def _laid(arm, at, axis, side, turn, mirror=False):
    """`arm` laid with its handle along `axis` through `at`, its forearm leaving toward `side` (square to the axis, in
    the gun's own frame) turned `turn` degrees about the axis; `mirror` makes the left arm a right one."""
    v, q, m, fore = arm
    v = v.copy()
    if mirror:
        v[:, 0] = -v[:, 0]
        q = q[:, ::-1]
        fore = fore * np.array([-1.0, 1.0, 1.0])
    A = _frame([0.0, 0.0, 1.0], fore)
    B = _frame(axis, _turned(_unit(side), _unit(axis), turn))
    return (v @ (B @ A.T).T) + np.asarray(at, dtype=np.float64), q, m


def _grip_front(kind):
    """The grip's front, toward the muzzle, square to its axis, in the gun's own frame."""
    import guns3p
    r = math.radians(guns3p.rake(kind))
    return np.array([math.sin(r), 0.0, math.cos(r)])


def hold_pose(S, hold):
    """A hold as the eye sees it, made a pose (fpstage.pose_matrix's base, depth, tip and roll): `grip` the screen point
    the grip's middle lies on, `depth` how far before the eye it is (metres), the bore turned `yaw` degrees left of
    straight ahead and `pitch` up, the gun canted `cant` degrees from its belly hung straight down the screen."""
    import fpstage
    kind = S['kind']
    y, p = math.radians(hold['yaw']), math.radians(hold['pitch'])
    d = np.array([-math.sin(y) * math.cos(p), math.cos(y) * math.cos(p), math.sin(p)])
    down = _unit(np.array([0.0, 0.0, -1.0]) - d * -d[2])
    belly = _turned(down, d, hold.get('cant', 0.0))
    g = fpstage.unproject(hold['grip'][0], hold['grip'][1], hold['depth'], S)
    at = g - root(kind)[2] * -d - (-root(kind)[0]) * belly   # the grip lies below the bore and behind the root
    tip = at + d * length(S)
    (bu, tu), (bv, tv), (bd, _) = fpstage.project(np.stack([at, tip]), S)
    pose = {'base': [float(bu), float(bv)], 'depth': float(bd), 'tip': [float(tu), float(tv)], 'roll': 0.0}
    M, _ = fpstage.pose_matrix(pose, S, length(S))
    w0, dd = M[:3, 0], M[:3, 2]
    pose['roll'] = math.degrees(math.atan2(float(belly @ np.cross(dd, w0)), float(belly @ w0)))
    return pose


# the support hand under the Thunderlock's forestock: open, not a fist. Its palm up under the wood, the fingers curled
# up its far side, the thumb along the near one, the wrist bent so the forearm drops away (fphand.JOINTS)
CRADLE = {'knuckle': 55.0, 'fold': 65.0, 'spread': 4.0, 'thumb_in': 20.0, 'thumb_bend': 15.0, 'wrist': -50.0,
          'tilt': 0.0}
# the palm as the rest arm holds it (fparm.arm, the left): its thumb's side, the way it faces, the fingers' way
PALM_REST = np.array([[-1.0, 0.0, 0.0], [0.0, -1.0, 0.0], [0.0, 0.0, 1.0]]).T


def _kabsch(a, b):
    """The rotation that best turns points `a` onto `b`, both about their middles."""
    H = (a - a.mean(axis=0)).T @ (b - b.mean(axis=0))
    U, _, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    return Vt.T @ np.diag([1.0, 1.0, d]) @ U.T


def _cradle(S, at, fingers, own):
    """The left arm, its hand open (CRADLE), its palm's middle at `at` facing up the gun's own -X, its fingers' way
    `fingers` (square to that), dressed as fptorch.arm dresses a fist, its upper arm leading off past the screen:
    (vertices, triangles, material a triangle among fptorch.mats(armour, own))."""
    import fpbow
    import fphand
    G = fptorch.grip_shape(S, S['fore_r'])
    v, q, m = fpbow._rest_arm(G, 'L')
    k = fpbow.hand_k(G, 'L')
    R = fparm._RIGS[(k, G.get('cuff') or k, len(v))]
    vp = fphand.pose(v, R, {**{j[0]: j[4] for j in fphand.JOINTS}, **CRADLE})
    palm = R['piece'] == 0
    turned = _kabsch(v[palm], vp[palm]) @ PALM_REST   # the palm's frame as the pose leaves it
    up = np.array([-1.0, 0.0, 0.0])
    f = _unit(np.asarray(fingers, dtype=np.float64) - up * (up @ np.asarray(fingers)))
    target = np.stack([np.cross(up, f), up, f], axis=1)
    Q = target @ turned.T
    out = (vp - vp[palm].mean(axis=0)) @ Q.T + np.asarray(at, dtype=np.float64)
    elbow, wrist = fptorch._marks_of(G, v)
    uv, uq = fptorch.upper_arm(S, out[elbow].mean(axis=0), out[wrist].mean(axis=0), Q @ turned[:, 1] * -1.0)
    v2, q2, m2 = fpbow._join([(out, q, m), (uv, uq, 0)])
    m2 = np.asarray(m2).copy()
    past = m2 >= len(fpbow.MATS)   # an armour set's pieces, counted past the bow's own materials (fptorch.arm)
    m2[past] = m2[past] - len(fpbow.MATS) + len(fparm.mats()) + len(own)
    return v2, q2, m2


def scene(S, pose=None):
    """The gun and its arms in the part's space: (vertices, triangles, material a triangle among
    fptorch.mats(armour, OWN)). The right fist on the grip, its forearm leaving behind it; on the Thunderlock the
    left hand open under the forestock, cradling it."""
    import guns3p
    kind = S['kind']
    gv, gq, gm = gun_mesh(kind, S.get('finish', 'plain'))
    g = _grip_axis(kind)
    pieces = [(gv, gq, gm + len(fparm.mats())),
              _laid(_arm(S, S['grip_r'], S['grip_tilt']), g * S['grip_at'], g, -_grip_front(kind), S['grip_turn'],
                    mirror=True)]
    if kind == 'thunderlock':   # the support hand cradling the forestock from under it (_cradle)
        bottom = -guns3p.BORE['thunderlock'] + guns3p.FORE_BOTTOM
        at = (bottom + S['fore_palm'], S['fore_side'], guns3p.FORESTOCK[2] + S['fore_at'])
        pieces.append(_cradle(S, at, (0.0, -math.cos(math.radians(S['fore_turn'])),
                                      math.sin(math.radians(S['fore_turn']))), OWN))
    v, q, m = fptorch._join(pieces)
    return v - root(kind), q, m


def part(S):
    return scene(S)


def posed(v, pose, S):
    """The part at a pose: the gun's cock and frizzen turned as the frame's `cock` and `frizzen` turn them (degrees
    forward, about the lines across the gun through their pivots, guns3p.lock_pivots); the rest as it stands."""
    import guns3p
    kind = S['kind']
    labels = _LABELS.get((kind, S.get('finish', 'plain')))
    if labels is None:
        return v
    out = np.array(v, dtype=np.float64, copy=True)
    for label, joint, pivot in zip((1, 2), ('cock', 'frizzen'), guns3p.lock_pivots(kind)):
        deg = pose.get(joint, 0.0)
        if not deg:
            continue
        sel = np.zeros(len(out), dtype=bool)
        sel[:len(labels)] = labels == label   # the gun leads the part's vertices (scene)
        pv = pivot - root(kind)
        a = math.radians(deg)
        dz, dx = out[sel, 2] - pv[2], out[sel, 0] - pv[0]   # forward is +Z, up is -X
        out[sel, 2] = pv[2] + dz * math.cos(a) - dx * math.sin(a)
        out[sel, 0] = pv[0] + dz * math.sin(a) + dx * math.cos(a)
    return out


def palette():
    """The gun's own materials in the finish the shape names, dressed for the eye (guns3p.materials_of, `dress`), by
    their names in OWN."""
    import guns3p
    import fpmodel
    own = guns3p.materials_of(fpmodel.SHAPE.get('finish', 'plain'))
    return {n: own[n] for n in OWN}


def variants(rec):
    return FINISHES


def set_variant(S, variant):
    S['finish'] = variant


def object_name(rec, variant):
    return 'Gun' if variant == 'plain' else 'GunGilded'


def record_name(rec, r, variant):
    return r


# the shot: a Pellet's aetherium unbound as lightning at the muzzle. Sizes in metres at the muzzle, so the blast is the
# gun's own size however far it lies. The game cuts every texel at half alpha, so a glow is a field of heat coloured by
# HEAT and drawn solid, its faint fringe stippled: a white-hot heart (the game finds the muzzle by its largest
# white-hot body, gunFlash.js), a jet thrown ahead, four petals off the crown, a shock ring round the bore, lightning
# and sparks. A frame's `flash` (its pose's, from the spec) scales it: the shot's frame whole, the next a flicker.
BLAST = {'core': 0.012, 'jet': (0.22, 0.020), 'petals': (4, 0.07, 0.010), 'ring': (0.035, 0.07),
         'arcs': (4, 0.12, 0.22), 'sparks': 16, 'spark': (0.05, 0.26)}
WHITE, PALE, BLUE = (255, 255, 250), (196, 230, 255), (92, 170, 255)
HEAT = ((0.0, (40, 84, 200)), (0.22, BLUE), (0.42, (128, 196, 255)), (0.66, PALE), (0.86, WHITE))
BLAST_SCALE = {'thunderlock': 1.5, 'pistolet': 1.15}   # each gun's blast and smoke: the long rifle's the larger
FLICKER_HEAT = 0.58   # the flicker's hottest: its colour under the white-hot the game reads the shot's frame by
# the jet's, the petals' and the lightning's hottest: a blue-white just under white-hot, so only the heart burns white
# and the game's muzzle, its largest white-hot body's middle, stays at the barrel's end
BRIGHT = 0.58
# the priming flashing in the pan as the flint strikes: warm, never white-hot, so the muzzle stays the brightest body
PAN_HEAT = ((0.0, (140, 52, 28)), (0.25, (206, 92, 36)), (0.5, (240, 150, 64)), (0.75, (246, 200, 130)))
PAN = {'burst': 0.0055, 'tongues': 4, 'tongue': 0.016, 'sparks': 8, 'spark': (0.012, 0.045)}
# the smoke after it, each frame's billows: (radius, density, rise, drift along the barrel), metres. Each billow is a
# knot of puffs; it grows, rises and thins, its fringe stippled away as it goes
SMOKE = {1: [(0.036, 0.95, 0.000, 0.05)],
         2: [(0.058, 0.95, 0.008, 0.07), (0.046, 0.85, 0.030, 0.03), (0.042, 0.80, 0.006, 0.14)],
         3: [(0.078, 0.85, 0.030, 0.09), (0.064, 0.78, 0.060, 0.04), (0.058, 0.70, 0.036, 0.17)],
         4: [(0.094, 0.66, 0.060, 0.11), (0.080, 0.58, 0.095, 0.06), (0.072, 0.52, 0.075, 0.20)],
         5: [(0.106, 0.46, 0.090, 0.13), (0.090, 0.40, 0.130, 0.08)],
         6: [(0.116, 0.32, 0.122, 0.15)]}
PAN_SMOKE = {1: [(0.006, 0.8, 0.008, 0.0)], 2: [(0.010, 0.8, 0.020, 0.0)], 3: [(0.014, 0.6, 0.034, 0.0)],
             4: [(0.017, 0.4, 0.048, 0.0)]}
SMOKE_TONES = ((0.0, (72, 74, 80)), (0.3, (108, 109, 114)), (0.6, (146, 146, 149)), (0.85, (180, 179, 176)),
               (1.0, (198, 196, 191)))
GLINT_TOP = 208.0   # the brightest the gun's own metal may be: under the game's white-hot (gunFlash.js FLASH_LUMA)
GLOW_POWER = 320.0   # watts of the flash's light on the gun and the hands, at a frame's whole flash
GLOW_COLOUR = (0.62, 0.8, 1.0)
EDGE_FADE = 10.0   # texels over which the shot's fire and smoke thin away before the canvas's cut edges
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 + 1.0 / 32.0


def glow_point(S):
    """Where the flash lights the gun from: a little ahead of the muzzle (fpheldforge.py `_flame_light`)."""
    return muzzle(S['kind']) + np.array([0.0, 0.0, 0.04])


def glow_power(pose):
    """The flash's light at this frame: its whole power on the shot, a flicker after, none at rest."""
    return GLOW_POWER * pose.get('flash', 0.0)


def frame_light(pose):
    """Each frame's own light on the gun's materials (fpheldforge.py `_flame_light`): the gems flare as the
    aetherium is unbound, by the frame's `flash`."""
    import bpy
    import guns3p
    k = pose.get('flash', 0.0)
    for m in bpy.data.materials:
        if m.name.startswith('edge.Gun.') and '.teal' in m.name and m.node_tree:
            for n in m.node_tree.nodes:
                if n.type == 'BSDF_PRINCIPLED':
                    n.inputs['Emission Strength'].default_value = guns3p.GEM_GLOW[0] + guns3p.GEM_GLOW[1] * k


def _ramp(h, stops):
    """Colours along `stops` ((heat, rgb), ...) at each heat of `h`."""
    at = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], dtype=np.float64)
    return np.stack([np.interp(h, at, cols[:, c]) for c in range(3)], axis=-1)


def _segment(xx, yy, a, b):
    """Each texel's distance to the screen segment a-b and its share along it."""
    ab = np.asarray(b, dtype=np.float64) - np.asarray(a, dtype=np.float64)
    L2 = max(float(ab @ ab), 1e-9)
    t = np.clip(((xx - a[0]) * ab[0] + (yy - a[1]) * ab[1]) / L2, 0.0, 1.0)
    return np.hypot(xx - (a[0] + t * ab[0]), yy - (a[1] + t * ab[1])), t


def _union(h, more):
    """Heat `more` laid into `h`: two glows together burn hotter than either."""
    return 1.0 - (1.0 - h) * (1.0 - np.clip(more, 0.0, 1.0))


def _paint(out, heat, stops, cap=1.0, solid=0.12, faint=0.04, tint=0.3):
    """A heat field drawn over `out`: coloured along `stops`, solid where it is `solid` or hotter, stippled down to
    `faint`; over the gun's own texels a faint heat tints them instead of covering them."""
    h = np.minimum(heat, cap)
    hh, ww = h.shape
    dither = np.tile(BAYER, (hh // 4 + 1, ww // 4 + 1))[:hh, :ww]
    col = _ramp(h, stops)
    under = out[..., 3] > 0
    cover = (h >= solid) | ((h >= faint) & ((h - faint) / (solid - faint) > dither))
    a = np.where(under & (h < tint), h / tint, 1.0)[..., None]
    out[cover, :3] = (col * a + out[..., :3] * (1 - a))[cover]
    out[cover, 3] = 255.0


def _smoke(out, xx, yy, billows, at, way, ppm, rng, fade=1.0):
    """Billows of smoke at screen point `at`, each a knot of puffs (`SMOKE`'s rows), lit from above the eye's left;
    thinned by `fade` toward the canvas's cut edges."""
    from scipy import ndimage as ndi
    dens = np.zeros(xx.shape)
    for r, d, rise, drift in billows:
        cx, cy, R = at[0] + way[0] * drift * ppm, at[1] + way[1] * drift * ppm - rise * ppm, max(r * ppm, 1.5)
        for _ in range(11):
            ang, far = rng.uniform(0, 2 * np.pi), rng.uniform(0.0, 0.7) * R
            px, py, pr = cx + far * np.cos(ang), cy + far * np.sin(ang), R * rng.uniform(0.3, 0.58)
            q = np.clip(1.0 - (np.hypot(xx - px, yy - py) / pr) ** 2, 0.0, 1.0) ** 2
            dens += d * rng.uniform(0.6, 1.0) * q * 1.5
    if not dens.any():
        return
    hh, ww = dens.shape
    cell = max(2.0, 0.012 * ppm)   # its wisps: a smooth mottle about a centimetre across
    grid = rng.uniform(0.0, 1.0, (int(hh / cell) + 3, int(ww / cell) + 3))
    mottle = ndi.zoom(grid, cell, order=1)[:hh, :ww]
    s = max(1, int(round(0.016 * ppm)))
    shape = ndi.gaussian_filter(dens, 0.015 * ppm)   # the billow's shape, its puffs run together
    toward = np.roll(np.roll(shape, s, axis=0), s, axis=1)   # a step toward the light, up and left
    lit = np.clip(0.5 + 2.2 * (shape - toward) / np.maximum(shape, 0.05) + 0.3 * (mottle - 0.5), 0.0, 1.0)
    dens = dens * (0.55 + 0.8 * mottle) * fade   # the wisps break its edge; its light is the billow's
    dither = np.tile(BAYER, (hh // 4 + 1, ww // 4 + 1))[:hh, :ww]
    cover = (dens >= 0.55) | ((dens >= 0.22) & ((dens - 0.22) / 0.33 > dither))
    out[cover, :3] = _ramp(lit, SMOKE_TONES)[cover]
    out[cover, 3] = 255.0


def _blast(xx, yy, u, v, way, ppm, k, rng, ring_pts):
    """The aetherium's heat at a frame's `flash` `k`: its heart, jet, petals, ring, lightning and sparks."""
    B = BLAST
    core = max(B['core'] * ppm * k, 2.0)
    # the heart set back a little into the barrel: the jet and the petals whiten what lies just ahead of it, so the
    # middle of all that burns white, the game's muzzle, lands on the barrel's end
    r = np.hypot(xx - u + way[0] * 0.6 * core, yy - v + way[1] * 0.6 * core)
    heat = np.exp(-(r / core) ** 2) + 0.55 * np.exp(-(r / (2.4 * core)) ** 2)
    jet_len, jet_w = B['jet'][0] * ppm * k, max(B['jet'][1] * ppm * k, 1.2)
    d, t = _segment(xx, yy, (u, v), (u + way[0] * jet_len, v + way[1] * jet_len))
    heat = _union(heat, BRIGHT * (1 - t) ** 0.9 * np.exp(-(d / (jet_w * (1 - t) ** 0.7 + 0.8)) ** 2))
    for a, b, wide in ring_pts['petals']:   # the petals: tapering flames off the crown
        d, t = _segment(xx, yy, a, b)
        heat = _union(heat, BRIGHT * (1 - t) * np.exp(-(d / (wide * (1 - 0.7 * t) + 0.8)) ** 2))
    ring = ring_pts['ring']
    for a, b in zip(ring, np.roll(ring, -1, axis=0)):   # the shock ring round the bore, broken as it flies
        d, _ = _segment(xx, yy, a, b)
        heat = _union(heat, ring_pts['ring_heat'] * rng.uniform(0.3, 1.0) * np.exp(-(d / 0.75) ** 2))
    n, lo, hi = B['arcs']
    for _ in range(max(1, int(round(n * k)))):   # lightning: jagged arcs leaping ahead and out
        ang = rng.uniform(-1.2, 1.2)
        dirn = np.array([way[0] * np.cos(ang) - way[1] * np.sin(ang), way[0] * np.sin(ang) + way[1] * np.cos(ang)])
        length = rng.uniform(lo, hi) * ppm * k
        p = np.array([u, v])
        for _ in range(7):
            kink = rng.uniform(-1.1, 1.1)
            step = np.array([dirn[0] * np.cos(kink) - dirn[1] * np.sin(kink),
                             dirn[0] * np.sin(kink) + dirn[1] * np.cos(kink)]) * length / 7
            d, _ = _segment(xx, yy, p, p + step)
            heat = _union(heat, np.maximum(BRIGHT * np.exp(-(d / 0.7) ** 2), 0.3 * np.exp(-(d / 2.0) ** 2)))
            p = p + step
    for _ in range(int(B['sparks'] * k)):   # sparks flung ahead
        ang = rng.normal(0.0, 0.9)
        dirn = np.array([way[0] * np.cos(ang) - way[1] * np.sin(ang), way[0] * np.sin(ang) + way[1] * np.cos(ang)])
        far = rng.uniform(*B['spark']) * ppm * k
        heat = _union(heat, 0.8 * np.exp(-(np.hypot(xx - u - dirn[0] * far, yy - v - dirn[1] * far) / 0.8) ** 2))
    return heat


def _pan_burst(xx, yy, pu, pv, ppm, rng):
    """The priming's flash out of the pan: a burst thrown up, tongues of flame and a fountain of sparks."""
    P = PAN
    R = max(P['burst'] * ppm, 1.5)
    cy = pv - 0.6 * R
    heat = 0.85 * np.exp(-(np.hypot(xx - pu, yy - cy) / R) ** 2)
    for i in range(P['tongues']):
        ang = -np.pi / 2 + rng.uniform(-0.7, 0.7)
        L = P['tongue'] * ppm * rng.uniform(0.6, 1.0)
        d, t = _segment(xx, yy, (pu, cy), (pu + np.cos(ang) * L, cy + np.sin(ang) * L))
        heat = _union(heat, 0.7 * (1 - t) * np.exp(-(d / (0.35 * R * (1 - 0.6 * t) + 0.7)) ** 2))
    for _ in range(P['sparks']):
        ang = -np.pi / 2 + rng.normal(0.0, 0.8)
        far = rng.uniform(*P['spark']) * ppm
        heat = _union(heat, 0.7 * np.exp(-(np.hypot(xx - pu - np.cos(ang) * far, yy - cy - np.sin(ang) * far) / 0.7)
                                         ** 2))
    return heat


def over(eye, scr, pose, part, frame):
    """The shot's blast, the priming's flash in the pan and the smoke after both, over the gun's own layer."""
    import guns3p
    import fpmodel
    import fpstage
    S = fpmodel.SHAPE
    kind = S['kind']
    M = eye.matrix(pose, part, S)

    def cam(p):
        return (M @ np.array([*p, 1.0]))[:3]
    mz = muzzle(kind)
    tip, ahead = cam(mz), cam(mz + np.array([0.0, 0.0, 0.05]))
    (u, a), (v, b) = (tuple(float(x) for x in c) for c in fpstage.project(np.stack([tip, ahead]), S)[:2])
    way = np.array([a - u, b - v])
    way = way / max(np.linalg.norm(way), 1e-6)   # the barrel's way on the screen, toward the muzzle
    ppm = S['focal'] / max(float(tip[1]), 0.05)   # pixels a metre at the muzzle
    big = BLAST_SCALE[kind]
    pan = cam(guns3p.pan_point(kind) - root(kind))
    (pu,), (pv,) = (tuple(float(x) for x in c) for c in fpstage.project(pan[None], S)[:2])
    pan_ppm = S['focal'] / max(float(pan[1]), 0.05)
    out = np.array(scr, dtype=np.float64, copy=True)
    h, w = out.shape[:2]
    lum = out[..., 0] * 0.299 + out[..., 1] * 0.587 + out[..., 2] * 0.114
    glint = lum > GLINT_TOP   # the metal's own glints kept under white-hot: only the shot burns so (gunFlash.js)
    out[glint, :3] *= (GLINT_TOP / lum[glint])[:, None]
    yy, xx = np.mgrid[0:h, 0:w] + 0.5
    # the canvas's top and left are cut out of the screen (its right and foot are the screen's own): what reaches them
    # thins away before it, never cut along a straight line
    cx, cy = pose.get('canvas', [0, 0])[:2]
    fade = np.clip(np.minimum(xx - cx, yy - cy) / EDGE_FADE, 0.0, 1.0)
    rng = np.random.default_rng(97 * frame + (1 if kind == 'thunderlock' else 2))
    k = pose.get('flash', 0.0)
    after = pose.get('after', 0)   # frames since the shot: a record that never fires (the sprint's) draws no smoke
    _smoke(out, xx, yy, PAN_SMOKE.get(after, []), (pu, pv), np.array([0.0, -1.0]), pan_ppm, rng, fade)
    _smoke(out, xx, yy, SMOKE.get(after, []), (u, v), way, ppm * big, rng, fade)   # the fire burns before the smoke
    if k >= 0.5:
        _paint(out, _pan_burst(xx, yy, pu, pv, pan_ppm, rng), PAN_HEAT, solid=0.16)
    if k > 0:
        bore, e1, e2 = M[:3, 2], M[:3, 0], M[:3, 1]
        n, reach, wide = BLAST['petals']
        petals = []
        for i in range(n):   # each petal off the crown, square to the bore and thrown a little ahead
            ang = np.pi / 4 + i * 2 * np.pi / n
            out3 = np.cos(ang) * e1 + np.sin(ang) * e2
            end = tip + (out3 + 0.45 * bore) * reach * k * big
            (eu,), (ev,) = (tuple(float(x) for x in c) for c in fpstage.project(end[None], S)[:2])
            petals.append(((u, v), (eu, ev), wide * ppm * k * big))
        R = BLAST['ring'][0 if k >= 0.5 else 1] * big
        ring3 = [tip + bore * 0.03 + R * (np.cos(t) * e1 + np.sin(t) * e2) for t in np.linspace(0, 2 * np.pi, 40,
                                                                                                endpoint=False)]
        ru, rv = fpstage.project(np.stack(ring3), S)[:2]
        shape = {'petals': petals, 'ring': np.stack([ru, rv], axis=1), 'ring_heat': 0.42 if k >= 0.5 else 0.3}
        heat = _blast(xx, yy, u, v, way, ppm * big, max(k, 0.5), rng, shape)
        if k < 0.5:   # the flicker: the jet and the heart dying, the ring flown wide
            heat = heat * (k / 0.5)
        _paint(out, heat * fade, HEAT, cap=1.0 if k >= 0.5 else FLICKER_HEAT)
    out[..., 3] = np.where(out[..., 3] < 24, 0.0, out[..., 3])   # the faintest wisps dropped: the game cuts at half
    return np.clip(out, 0, 255).astype(scr.dtype)


def holds(rec):
    """A record's frames as holds: its `hold` (the rest), each frame moved by its `kick` (the grip's screen move [du,
    dv], metres nearer the eye, degrees the muzzle rises, degrees more cant): the shot thrown back and up, then
    settling to the rest."""
    h = rec['hold']
    out = []
    for du, dv, back, rise, cant in rec['kick']:
        out.append({**h, 'grip': [h['grip'][0] + du, h['grip'][1] + dv], 'depth': h['depth'] - back,
                    'pitch': h['pitch'] + rise, 'cant': h.get('cant', 0.0) + cant})
    return out


def write_fit(spec_path):
    """The spec's poses (<spec>-fit.json) made from its records' holds, each frame a pose fpstage.pose_matrix places."""
    __import__('bpy')   # Blender first: the gun's model reads its mathutils
    import fpforge
    import fpmodel
    spec = fpforge.load(spec_path)
    table = {}
    for r, rec in enumerate(spec['records']):
        S = fpmodel.shape_for(r)
        flash, lock = rec.get('flash', []), rec.get('lock', [])
        shot = next((f for f, k in enumerate(flash) if k > 0), None)
        for f, h in enumerate(holds(rec)):
            cock, frizzen = lock[f] if f < len(lock) else (0.0, 0.0)
            table[f'{r}:{f}'] = {**hold_pose(S, h), 'flash': flash[f] if f < len(flash) else 0.0, 'cock': cock,
                                 'frizzen': frizzen, 'after': 0 if shot is None or f < shot else f - shot + 1,
                                 'canvas': fpforge.rect(rec)}
    fpforge.write_table(spec_path[:-len('.json')] + '-fit.json', table)
    return table


HAND_GRADE_FROM = 'WEAPON10'   # the fists, whose glove and sleeve every first-person hand wears


def write_grade(spec_path):
    """The hands' grade under the guns' own light (<spec>-grade.json): the fists' colours (HAND_GRADE_FROM) laid share
    for share over this light's spread of the glove's and the sleeve's brightness at the rest pose, so the hands shade
    as the fists do although the guns are lit to show their wood and metal."""
    __import__('bpy')
    import json
    import fpforge
    import fpheldforge
    import fpmodel
    spec = fpforge.load(spec_path)
    weapon = spec['weapon']
    fpmodel.WEAPONS[weapon] = {**fpmodel.WEAPONS[weapon], 'mats': fptorch.mats(None, OWN)}
    fpmodel.palette = fptorch.with_torch(fpmodel.palette, palette, None)
    eye = fpheldforge._eye(spec, 32, sys.modules[__name__])
    part, pose = fpforge.part_of(spec, spec['records'][0]), fpforge.FIT['0:0']
    work = eye.screen(pose, part, raw=True)
    ids = eye.id_map(pose, part)
    lum = work[..., :3].astype(np.float64).mean(axis=2)
    ref = json.load(open(os.path.join(HERE, 'specs', f'{HAND_GRADE_FROM}-grade.json')))
    table = {}
    for n in fparm.mats():
        (key, g), = ref[n].items()
        seen = (ids == eye.names.index(n) + 1) & (work[..., 3] > 0)
        if seen.sum() < 20:   # out of sight at rest (the Pistolet's sleeve): the fists' own grade
            table[n] = ref[n]
            continue
        src = np.percentile(lum[seen], np.linspace(0.0, 100.0, len(g[0])))
        table[n] = {key: [[round(float(v), 2) for v in src], *g[1:]]}
    with open(spec_path[:-len('.json')] + '-grade.json', 'w') as fh:
        json.dump(table, fh, indent=1)
        fh.write('\n')
    return table


if __name__ == '__main__':
    path = sys.argv[sys.argv.index('--spec') + 1]
    write_grade(path) if '--grade' in sys.argv else write_fit(path)
