"""The first-person forge's weapons, made from numbers: each part a mesh in its own space (the root at the origin, the
axis up +Z), built the same way for the renderer (`build`) and for the fitter (`triangles`), so what is fitted is what
is drawn. Their sizes are the archive's fitted shape (`<spec>-shape.json`).

The staff (WEAPON01.CIF): a round wooden pole tapering from below the screen to a short metal cap, grained in long
streaks. Only the pole shows: Daggerfall draws no hand on it.

The long blade (WEAPON04.CIF): a flat double-edged blade, its edges bevelled and a fuller down its middle from the guard,
narrowing a little toward a long point and sweeping a little toward one edge. Each face is its own strip, flat across and
smooth along, so each takes the lamp's light as Daggerfall's faces do. Only the blade shows: the classic frames cut it
off at the screen's foot, below the guard.

The fists (WEAPON10.CIF): the punches are the arm (fparm.py), the right one, its hand closed in a fist, its root the
elbow. The kicks are a right leg: a slouched leather boot with its cuff turned down, its foot bent at the ankle, over
laced leggings, its root the knee. The climbing arms (CLIMB) are the left arm, its hand gripping and reaching.

The battleaxe (WEAPON08.CIF, axes.py): a wooden haft from the hand, an iron socket and spike, a broad bit and a notched
back bit, its root the hand.

The flail (WEAPON06.CIF, flails.py): a wooden handle from the hand, an iron ferrule, and a chain of links to a spiked
ball, its root the hand and its far end the ferrule's top. Its joints hang the chain off the handle.
The mace (WEAPON05.CIF, maces.py): a wooden haft from the hand, a metal collar, a cast core with flat flanges round it
and a short spike on top, its root the hand."""
import json
import math
import os

import numpy as np

import axes
import flails
import fparm
import maces
import fphand
import fpbow  # it reads this module only once called
import fpdagger
import fpheld
import fpsword
import fpwarhammer
import lifetools

COMMON = {
    'focal': 300.0,      # the eye's focal length, in the screen's pixels
    'aspect': 1.0,       # how much taller than wide a screen pixel draws a thing
}
BLADE = {
    'blade_len': 1.0,    # metres from the guard to the point
    'blade_w': 0.06,     # the blade's width at the guard
    'blade_t': 0.32,     # its thickness, ridge to ridge, over its width
    'narrow': 0.8,       # its width where the point begins, over the width at the guard
    'tip': 0.3,          # the share of its length the point takes
    'tip_k': 1.5,        # the point's profile: 1 straight sides, more a fuller point
    'curve': 0.0,        # how far the point sweeps toward one edge, over the length
    'bevel': 0.3,        # the share of each half of the width its edge's bevel takes
    'fuller_w': 0.3,     # the fuller's half-width, over the blade's half-width
    'fuller_d': 0.6,     # the fuller's depth, over the blade's half-thickness
    'fuller_len': 0.62,  # the share of the length the fuller runs from the guard
    'fuller_floor': 0.8,  # the fuller's floor's half-width over its own: near 1, its walls stand steep
}
STAFF = {
    'staff_len': 1.6,    # metres from the root (below the screen) to the cap's foot
    'staff_r': 0.024,    # the pole's radius at its root
    'taper': 0.62,       # its radius at the cap, over the root's
    'cap_len': 0.035,    # the metal cap's length
    'cap_r': 1.18,       # its radius over the pole's at its foot
}
FISTS = {
    'arm_r': 1.0,        # the sleeve's girth
    'fist': 1.0,         # the gloved fist's size, cuff and all
    'thumb': 1.0,        # the thumb's girth against the hand's
    'boot_r': 1.0,       # the boot's and the leggings' girth
    'foot': 1.0,         # the foot's length
    'ankle': 100.0,      # degrees between the shin and the foot
}
CLIMB = {
    'arm_r': 1.0,        # the sleeve's girth
    'hand': 1.0,         # the gloved hand's size, cuff and all
    'thumb': 1.0,        # the thumb's girth against the hand's
    'fingers': 1.0,      # the fingers' length against the hand's
    'slim': 1.0,         # and their girth
}
SHAPE = {}
ROWS = 64   # rings along the blade
WRIST = fparm.WRIST             # elbow to wrist
SHIN = 0.42                     # knee to ankle


RECORD_SHAPE = {}   # '<record>' -> a record's own shape values over the archive's (Daggerfall's idle's long cuff)


def borrowed(weapon):
    """The materials a weapon draws in another archive's grade: the arm it borrows (`arm_from`) and what is graded as
    the arm is (`grade_as`), never graded or lit to this archive."""
    W = WEAPONS[weapon]
    return (fparm.mats() + tuple(W.get('grade_as', {}))) if W.get('arm_from') else ()


def load_shape(path, weapon):
    SHAPE.clear()
    RECORD_SHAPE.clear()
    SHAPE.update(defaults(weapon))
    if os.path.exists(path):
        table = json.load(open(path))
        RECORD_SHAPE.update(table.pop('records', {}))
        SHAPE.update(table)
    if 'arm' in WEAPONS[weapon]:   # the arm every picture wears, at its own archive's sizes whatever this table says
        SHAPE.update(WEAPONS[weapon]['arm']())


def shape_for(record, S=None):
    """The shape a record is drawn in: its own values over the archive's, where it has them."""
    own = RECORD_SHAPE.get(str(record))
    base = SHAPE if S is None else S
    return dict(base, **own) if own else base


def defaults(weapon):
    return {**COMMON, **WEAPONS[weapon]['shape']}


def write_shape(path, shape, record=None):
    """The archive's shape, or (`record`) a record's own values, kept beside the rest of the table."""
    table = json.load(open(path)) if os.path.exists(path) else {}
    own = table.pop('records', {})
    if record is None:
        table = {k: round(float(v), 4) for k, v in shape.items()}
    else:
        own[str(record)] = {k: round(float(v), 4) for k, v in shape.items()}
    if own:
        table['records'] = own
    with open(path, 'w') as fh:
        fh.write(json.dumps(table, indent=1) + '\n')


def parts(weapon):
    """The weapon's parts, the first its default."""
    return list(WEAPONS[weapon]['parts'])


def length(weapon, S=None, part=None):
    """How far a part reaches from its root to its far end: the length a pose aims along."""
    S = S or SHAPE
    return WEAPONS[weapon]['length'](S, part or parts(weapon)[0])


def _blade(S):
    """The blade: flat, its edges bevelled, a fuller down its middle from the guard. Each face is its own strip, flat
    across and smooth along: the edge bevels, the flats, the fuller's walls and its floor, on both sides."""
    s = np.linspace(0.0, 1.0, ROWS + 1)
    start = 1.0 - S['tip']
    u = np.clip((s - start) / max(S['tip'], 1e-6), 0.0, 1.0)
    shoulder = 1.0 - (1.0 - S['narrow']) * np.minimum(s / max(start, 1e-6), 1.0)
    hw = S['blade_w'] * shoulder * (1.0 - u ** max(S['tip_k'], 0.2)) / 2
    ht = hw * S['blade_t']
    z = s * S['blade_len']
    sweep = S['curve'] * S['blade_len'] * s * s
    # the fuller runs from the guard, its groove shallowing to nothing over its last fifth
    end = max(S['fuller_len'], 1e-3)
    fade = np.clip((end - s) / (0.2 * end), 0.0, 1.0)
    gd = ht * S['fuller_d'] * fade * fade * (3 - 2 * fade)
    fw = hw * S['fuller_w']
    # one quarter of the section, from the edge in toward the middle, on the front (-Y, the eye's side at roll 0)
    quarter = [(hw, 0 * ht), (hw * (1 - S['bevel']), ht), (fw, ht), (fw * S['fuller_floor'], ht - gd), (0 * hw, ht - gd)]
    verts, quads = [], []
    for sx, sy in ((1, -1), (-1, -1), (-1, 1), (1, 1)):
        for (ax, ay), (bx, by) in zip(quarter, quarter[1:]):
            base = sum(len(x) for x in verts)
            a = np.stack([sweep + sx * ax, sy * ay, z], axis=1)
            b = np.stack([sweep + sx * bx, sy * by, z], axis=1)
            strip = np.empty((2 * (ROWS + 1), 3))
            strip[0::2], strip[1::2] = a, b
            verts.append(strip)
            flip = (sx * sy) > 0   # every strip's faces wound the same way round the section
            for i in range(ROWS):
                p = base + 2 * i
                quads.append((p, p + 1, p + 3, p + 2) if flip else (p, p + 2, p + 3, p + 1))
    # the root's end closed, so a blade cut off at the screen's foot never shows its inside
    ring = np.array([[sweep[0] + sx * x[0], sy * y[0], 0.0] for sx, sy in ((1, -1), (-1, -1), (-1, 1), (1, 1))
                     for x, y in (quarter if sx * sy < 0 else quarter[::-1])])
    base = sum(len(x) for x in verts)
    verts.append(np.vstack([ring, [[sweep[0], 0.0, 0.0]]]))
    mid = base + len(ring)
    q = np.array(quads, dtype=np.int64)
    tris = np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]],
                           [(mid, base + k, base + (k + 1) % len(ring)) for k in range(len(ring))]])
    return np.concatenate(verts), tris, np.zeros(len(tris), dtype=np.int64)


def loft(centres, u, w, a, b, n=28, caps=(False, False), swell=None):
    """A tube of rings: ring i about `centres[i]`, its radius `a[i]` along `u[i]` and `b[i]` along `w[i]`, the rings'
    points run round from `u`. `swell(i, theta)` adds to the radii (a fold, a wrinkle). Answers (vertices, triangles)."""
    th = np.linspace(0, 2 * np.pi, n, endpoint=False)
    rows = []
    for i, c in enumerate(centres):
        k = 1.0 + (swell(i, th) if swell else 0.0)
        rows.append(c + np.outer(a[i] * k * np.cos(th), u[i]) + np.outer(b[i] * k * np.sin(th), w[i]))
    v = np.concatenate(rows)
    tris = []
    for i in range(len(rows) - 1):
        for j in range(n):
            p, q = i * n + j, i * n + (j + 1) % n
            tris += [(p, q, q + n), (p, q + n, p + n)]
    for end, (on, i) in enumerate(zip(caps, (0, len(rows) - 1))):
        if on:
            mid = len(v)
            v = np.vstack([v, centres[i]])
            for j in range(n):
                p, q = i * n + j, i * n + (j + 1) % n
                tris.append((mid, q, p) if end == 0 else (mid, p, q))
    return v, np.array(tris, dtype=np.int64)


def _axis_loft(z, a, b, n=28, caps=(False, False), swell=None, x=0.0, y=0.0):
    """A tube up +Z: rings at heights `z`, radius `a` across X and `b` across Y."""
    c = np.stack([np.full(len(z), x), np.full(len(z), y), z], axis=1)
    u = np.tile([1.0, 0.0, 0.0], (len(z), 1))
    w = np.tile([0.0, 1.0, 0.0], (len(z), 1))
    return loft(c, u, w, np.asarray(a, float), np.asarray(b, float), n, caps, swell)


def _folds(depth, along, around, seed):
    """A cloth's or a leather's folds: swells rising and falling up the tube and round it."""
    rng = np.random.default_rng(seed)
    waves = [(rng.uniform(0.6, 1.4) * along, rng.uniform(0, 2 * np.pi), rng.integers(1, around + 1),
              rng.uniform(0, 2 * np.pi)) for _ in range(4)]

    def swell(i, th):
        return depth * sum(np.sin(k * i * 0.2 + p) * np.cos(m * th + q) for k, p, m, q in waves) / len(waves)
    return swell


_MESH = {}   # a metaball part's mesh, made once in Blender: (vertices, triangles)


def _blob_mesh(name, blobs, res):
    """A metaball's mesh as arrays, made once a process (the fitter's and the renderer's alike)."""
    if name not in _MESH:
        import bpy
        from body import blob_mesh
        me = blob_mesh(f'fp_{name}', blobs(), res=res)
        me.calc_loop_triangles()
        v = np.array([x.co[:] for x in me.vertices], dtype=np.float64).reshape(-1, 3)
        t = np.array([x.vertices[:] for x in me.loop_triangles], dtype=np.int64).reshape(-1, 3)
        bpy.data.meshes.remove(me)
        _MESH[name] = (v, t)
    return _MESH[name]


def _foot_blobs():
    """The boot's ankle and foot, in the foot's own frame: the ankle at the origin, the toe along +Z, the instep +Y, the
    width X. A slouched boot's: the ankle round and wide, the foot a wedge from a broad heel to a narrow toe."""
    from body import blob
    return [
        blob((0.0, 0.0, 0.0), (0.07, 0.064, 0.066)),         # the ankle, the shaft's foot
        blob((0.0, -0.026, -0.042), (0.056, 0.05, 0.048)),   # the heel
        blob((0.0, -0.012, 0.06), (0.062, 0.05, 0.075)),     # the instep
        blob((0.0, -0.026, 0.14), (0.062, 0.04, 0.07)),      # the ball of the foot
        blob((0.0, -0.03, 0.205), (0.05, 0.03, 0.05)),       # the toe
    ]


SOLE = -0.034   # the sole's plane in the foot's frame: below it the blobs are pressed flat


def _foot_form(v):
    """The blended foot made a boot's: its sole pressed flat, its toe a little narrowed, thinned and turned up."""
    v = v.copy()
    low = v[:, 1] < SOLE
    v[low, 1] = SOLE + (v[low, 1] - SOLE) * 0.25
    t = np.clip((v[:, 2] - 0.11) / 0.14, 0.0, 1.0) ** 1.5
    v[:, 0] *= 1.0 - 0.22 * t   # a round, blunt toe, not a point
    v[:, 1] = SOLE + (v[:, 1] - SOLE) * (1.0 - 0.3 * t) + 0.015 * t
    return v


_CREASES = [(k, m, p, a) for k, m, p, a in zip(np.random.default_rng(4).uniform(45, 120, 5),
                                               np.random.default_rng(5).choice([-2, -1, 1, 2], 5),
                                               np.random.default_rng(6).uniform(0, 2 * np.pi, 5),
                                               np.random.default_rng(7).uniform(0.5, 1.0, 5))]


def _creases(i, th, z, near):
    """The boot's creases: folds running slantwise round the shaft at odd angles, sharp-bottomed as soft leather's
    are, deepest by the ankle (`near`, 0 to 1 there) and slack up the shaft."""
    wave = sum(a * (1.0 - 2.0 * np.abs(np.sin(k * z + m * th + p))) for k, m, p, a in _CREASES) / len(_CREASES)
    return (0.035 + 0.07 * near) * wave


def _sabaton(S):
    """The kick in plate: the leggings, a flared cuff, a shaft held smooth (plate does not crease), and the foot, all
    in the plate (materials 3, 2): the boot's own shape, armoured."""
    r = S['boot_r']
    z = np.linspace(0.0, 0.14, 12)
    lv, lt = _axis_loft(z, 0.07 * r * np.ones(len(z)), 0.064 * r * np.ones(len(z)), caps=(True, False), n=36)
    cz = np.array([0.1, 0.108, 0.125, 0.15, 0.172, 0.18])
    ca = np.array([0.08, 0.1, 0.104, 0.1, 0.094, 0.084]) * r
    cv, ct = _axis_loft(cz, ca, ca * 0.93, n=36)
    z = np.linspace(0.17, SHIN, 60)
    near = np.clip((z - 0.22) / (SHIN - 0.22), 0.0, 1.0)
    bv, bt = _axis_loft(z, (0.09 - 0.014 * near) * r, (0.082 - 0.012 * near) * r, n=48)
    a = math.radians(S['ankle'])
    f = np.array([0.0, -math.sin(a), math.cos(a)])
    up = np.array([0.0, 0.0, -1.0]) - f * (-f[2])
    up /= np.linalg.norm(up)
    side = np.cross(up, f)
    fv, ft = _blob_mesh('foot', _foot_blobs, 0.003)
    fv = _foot_form(fv)
    ankle = np.array([0.0, 0.0, SHIN])
    fv = ankle + np.outer(fv[:, 0] * r * 1.08, side) + np.outer(fv[:, 1] * r * 1.08, up) + np.outer(fv[:, 2] * S['foot'], f)
    return _join([(lv, lt, 3), (cv, ct, 2), (bv, bt, 2), (fv, ft, 2)])


def _boot(S):
    """The kick: the laced leggings, the boot's turned-down cuff and its slouched, creased shaft, and the ankle and foot
    bent `ankle` degrees from the shin (materials 3, 2). The leg's front is -Y: the laces' side and the toe's."""
    r = S['boot_r']
    z = np.linspace(0.0, 0.14, 12)
    lv, lt = _axis_loft(z, 0.07 * r * np.ones(len(z)), 0.064 * r * np.ones(len(z)), caps=(True, False), n=36)
    cz = np.array([0.1, 0.108, 0.125, 0.15, 0.172, 0.18])
    ca = np.array([0.071, 0.088, 0.094, 0.093, 0.088, 0.078]) * r
    cv, ct = _axis_loft(cz, ca, ca * 0.93, n=36)
    z = np.linspace(0.17, SHIN, 60)
    near = np.clip((z - 0.22) / (SHIN - 0.22), 0.0, 1.0)
    bv, bt = _axis_loft(z, (0.086 - 0.012 * near) * r, (0.078 - 0.01 * near) * r, n=48,
                        swell=lambda i, th: _creases(i, th, z[i], near[i]) + _folds(0.05, 0.5, 2, 2)(i, th))
    a = math.radians(S['ankle'])
    f = np.array([0.0, -math.sin(a), math.cos(a)])            # heel to toe
    up = np.array([0.0, 0.0, -1.0]) - f * (-f[2])               # the instep, toward the knee
    up /= np.linalg.norm(up)
    side = np.cross(up, f)
    fv, ft = _blob_mesh('foot', _foot_blobs, 0.003)
    fv = _foot_form(fv)
    k = S['foot']
    ankle = np.array([0.0, 0.0, SHIN])
    fv = ankle + np.outer(fv[:, 0] * r, side) + np.outer(fv[:, 1] * r, up) + np.outer(fv[:, 2] * k, f)
    return _join([(lv, lt, 3), (cv, ct, 2), (bv, bt, 2), (fv, ft, 2)])


STAFF_SIDES = 28   # round enough at the root's breadth on the screen
STAFF_MATS = ('staff', 'ferrule', 'lash', 'glow')   # a metal's staff: its wood, its metal, its cord, a light of its own
_STAFF_STUFF = {'wood': 0, 'metal': 1, 'cord': 2, 'vein': 3}


def metal_staff(metal):
    """`metal`'s own staff as a part (staffs.py), in STAFF_MATS."""
    import staffs
    return lambda S: _join([(np.asarray(v, float), np.asarray(q), _STAFF_STUFF[k]) for v, q, k in staffs.staff(S, metal)])


def _staff(S):
    """The staff: a round pole tapering from its root to a short metal cap, flat on top with its rim rounded, as
    Daggerfall's is shod. The pole's wood is one material, the cap the metal the dye recolours."""
    L, r0 = S['staff_len'], S['staff_r']
    z = np.linspace(0.0, L, ROWS + 1)
    r = r0 * (1.0 - (1.0 - S['taper']) * z / L)
    pv, pt = _axis_loft(z, r, r, n=STAFF_SIDES, caps=(True, False))
    rc = r[-1] * S['cap_r']
    lip = min(0.004, S['cap_len'] * 0.2)
    # the cap: a step out from the pole, its sides up, then its rim rounded over onto a flat top
    cz = [L - 0.002, L, L + S['cap_len'] - lip, L + S['cap_len'] - lip * 0.35, L + S['cap_len']]
    cr = [r[-1], rc, rc, rc - lip * 0.35, rc - lip]
    cv, ct = _axis_loft(np.array(cz), np.array(cr), np.array(cr), n=STAFF_SIDES, caps=(False, True))
    return _join([(pv, pt, 0), (cv, ct, 1)])


def _join(pieces):
    vs, ts, ms, base = [], [], [], 0
    for v, t, m in pieces:
        vs.append(v)
        ts.append(t + base)
        ms.append(np.full(len(t), m, dtype=np.int64))
        base += len(v)
    return np.concatenate(vs), np.concatenate(ts), np.concatenate(ms)


WEAPONS = {
    'staff': {'parts': {'staff': _staff}, 'mats': ('staff', 'ferrule'), 'shape': STAFF,
              'length': lambda S, part: S['staff_len'] + S['cap_len'],
              'girth': lambda S, part: 2 * S['staff_r'] * (1 + S['taper']) / 2,
              'root_r': lambda S, part: S['staff_r']},
    'longblade': {'parts': {'blade': _blade}, 'mats': ('blade',), 'shape': BLADE,
                  'length': lambda S, part: S['blade_len'],
                  'girth': lambda S, part: S['blade_w'] * (0.6 + 0.4 * S['narrow']),
                  'root_r': lambda S, part: S['blade_w'] / 2},
    'fists': {'parts': {'fist': lambda S: fparm.arm(S['fist'], S['arm_r'], 'R', cuff=S.get('cuff'), thumb=S.get('thumb')),
                        'boot': _boot},
              'mats': fparm.mats() + ('boot', 'legging'), 'shape': FISTS,
              'arms': {'fist': ('R', 'fist')},
              'length': lambda S, part: WRIST + fphand.KNUCKLES * S['fist'] if part == 'fist' else SHIN,
              'girth': lambda S, part: 0.1 * S['arm_r'] if part == 'fist' else 0.17 * S['boot_r'],
              'root_r': lambda S, part: 0.052 * S['arm_r'] if part == 'fist' else 0.075 * S['boot_r'],
              'joints': {'boot': (('bend', 8.0, (-45.0, 45.0), 25.0, 0.0),), 'fist': fphand.FIST_JOINTS}},
    'climbarm': {'parts': {'arm': lambda S: fparm.arm(S['hand'], S['arm_r'], 'L', cuff=S.get('cuff'),
                                                      thumb=S.get('thumb'), fingers=S.get('fingers'))},
                 'mats': fparm.mats(),
                 'shape': CLIMB, 'arms': {'arm': ('L', 'hand')},
                 'length': lambda S, part: WRIST + fphand.KNUCKLES * S['hand'],
                 'girth': lambda S, part: 0.1 * S['arm_r'],
                 'root_r': lambda S, part: 0.052 * S['arm_r'],
                 'joints': {'arm': fphand.JOINTS}},
    'battleaxe': {'parts': {'axe': axes.battleaxe}, 'mats': ('axehead', 'haft'), 'shape': axes.AXE,
                  'length': lambda S, part: axes.length(S),
                  'girth': lambda S, part: 2.2 * S['haft_r'],
                  'root_r': lambda S, part: S['haft_r'],
                  'wide_far': True},   # its outline narrows to the hand, the head wide at the far end
    'flail': {'parts': {'flail': flails.flail}, 'mats': ('flailiron', 'flailwood'), 'shape': flails.FLAIL,
              'length': lambda S, part: flails.length(S),
              'girth': lambda S, part: 2.0 * S['haft_r'],
              'root_r': lambda S, part: S['haft_r'],
              'joints': {'flail': flails.JOINTS}, 'posed_joints': flails.posed,
              'seeds': flails.seeds,   # the handle read off the wood, or past the edge the chain runs into
              'sway': flails.sway_joints,   # the idle's chain swung through an arc, for the walk (combat/forgeSway.js)
              # the wood weighs as much as the metal: a handle drawn where Daggerfall drew the chain is no fit
              'weights': {'sil': 0.6, 5: 0.4, 1: 0.35, 'light': 0.25}},
    'mace': {'parts': {'mace': maces.mace}, 'mats': maces.MATS, 'shape': maces.MACE,
             'length': lambda S, part: maces.length(S),
             'girth': lambda S, part: 2.2 * S['haft_r'],
             'root_r': lambda S, part: S['haft_r'],
             'wide_far': True},   # as the axe's: the head wide at the far end
}
# the casting hands' arm is the climbing arms': the left hand, its back to the eye, in tables of its own; each finger
# may curl on its own (the cast holds them straight)
WEAPONS['castarm'] = dict(WEAPONS['climbarm'], joints={'arm': fphand.JOINTS + fphand.CURLS},
                          parts={'arm': lambda S: fparm.arm(S['hand'], S['arm_r'], 'L', cuff=S.get('cuff'),
                                                            thumb=S.get('thumb'), fingers=S.get('fingers'),
                                                            slim=S.get('slim'))})


# the held map (HELDMAP): the sheet and both arms one part, made again at each pose's joints (fpheld.py)
WEAPONS['heldmap'] = {'parts': {'held': fpheld.part}, 'mats': fpheld.MATS, 'shape': fpheld.SHAPE, 'posed': fpheld.posed,
                      'length': lambda S, part: fpheld.length(S), 'girth': lambda S, part: S['sheet_w'],
                      'root_r': lambda S, part: 0.01, 'joints': {'held': fpheld.JOINTS}, 'root_seen': True,
                      'read': fpheld.READ, 'hands': fpheld.HANDS, 'penalty': fpheld.penalty}
# the life skills' tools: the Pick-Axe, the Skinning Knife, the Sickle, the Spade, the Basket and the Fishing Rod
# (lifetools.py); the Wood-Axe is drawn in the battleaxe's place (fptools.py)
WEAPONS.update(lifetools.weapons())
# the bow (WEAPON09): its bow, string, arrow and both arms one part, made again at each pose's joints (fpbow.py)
WEAPONS['bow'] = {'parts': {'bow': fpbow.part}, 'mats': fpbow.MATS, 'shape': fpbow.SHAPE, 'posed': fpbow.posed,
                  'length': lambda S, part: fpbow.AXIS, 'girth': lambda S, part: 0.05,
                  'root_r': lambda S, part: 0.04, 'joints': {'bow': fpbow.JOINTS}, 'root_seen': True}
# the dagger (WEAPON02): the blade, its hilt and the right arm whose fist holds it, one part made again at each pose's
# wrist (fpdagger.py); its root, the fist, is in sight
WEAPONS['dagger'] = {'parts': {'dagger': fpdagger.part}, 'mats': fpdagger.MATS, 'shape': fpdagger.SHAPE,
                     'posed': fpdagger.posed, 'length': lambda S, part: fpdagger.length(S),
                     'girth': lambda S, part: 0.1 * S['hand'], 'root_r': lambda S, part: 0.06 * S['hand'],
                     'joints': {'dagger': fpdagger.JOINTS}, 'root_seen': True, 'seed': fpdagger.seed,
                     'arm': fpdagger.arm_shape, 'arm_from': fpdagger.ARM_FROM, 'grade_as': fpdagger.GRADE_AS,
                     'fit_classes': fpdagger.FIT_CLASSES,
                     'elbow': fpdagger.elbow, 'weights': fpdagger.WEIGHTS}

# the sword (WEAPON04): the whole sword, its hilt and blade, and the right arm whose fist holds it under the guard, one
# part made again at each pose's wrist (fpsword.py); its root, the fist, is in sight
WEAPONS['sword'] = {'parts': {'sword': fpsword.part}, 'mats': fparm.mats() + fpsword.SWORD_MATS,
                    'shape': {**BLADE, 'grip_r': fpsword.SHAPE['grip_r']},
                    'posed': fpsword.posed, 'length': lambda S, part: fpsword.length(S),
                    'girth': lambda S, part: 0.1 * S['hand'], 'root_r': lambda S, part: 0.06 * S['hand'],
                    'joints': {'sword': fpsword.JOINTS}, 'root_seen': True, 'seed': fpsword.seed,
                    'arm': fpsword.arm_shape, 'arm_from': fpsword.ARM_FROM, 'graded_as': fpsword.GRADED_AS,
                    'fit_classes': fpsword.FIT_CLASSES, 'elbow': fpsword.elbow, 'weights': fpsword.WEIGHTS,
                    'penalty': fpsword.penalty, 'set': fpsword.SET}

# the warhammer (WEAPON07): its haft, collar and head, no hand in sight (fpwarhammer.py)
WEAPONS['warhammer'] = {'parts': {'hammer': fpwarhammer.part}, 'mats': fpwarhammer.MATS, 'shape': fpwarhammer.SHAPE,
                        'length': lambda S, part: fpwarhammer.length(S),
                        'girth': lambda S, part: 2 * S['haft_r'], 'root_r': lambda S, part: S['haft_r'],
                        'reach': fpwarhammer.REACH, 'detail': fpwarhammer.DETAIL}

# the torch in the left fist (Handheld Torches' hand): the torch and the arm one part, made again at each pose's joints
# (fptorch.py)
import fptorch  # noqa: E402
WEAPONS['torch'] = {'parts': {'torch': fptorch.part}, 'mats': fptorch.mats(), 'shape': fptorch.TORCH,
                    'posed': fptorch.posed, 'length': lambda S, part: fptorch.top(S), 'girth': lambda S, part: 0.06,
                    'root_r': lambda S, part: 0.04, 'joints': {'torch': fptorch.JOINTS}, 'root_seen': True}


# the Dwarven Thunderlock and the Dwarven Pistolet: each gun and the fists that hold it one rigid part (fpguns.py)
import fpguns  # noqa: E402
for _kind in ('thunderlock', 'pistolet'):
    WEAPONS[_kind] = {'parts': {_kind: fpguns.part}, 'mats': fptorch.mats(None, fpguns.OWN),
                      'shape': fpguns.SHAPES[_kind], 'posed': fpguns.posed, 'length': fpguns.length,
                      'girth': lambda S, part: 0.05, 'root_r': lambda S, part: 0.03, 'joints': {_kind: fpguns.JOINTS},
                      'root_seen': True}   # the hands' grade the spec's own (fpguns.write_grade)

# the owner's crossbow carried at a run: the crossbow and both hands one rigid part, a metal its own model (fpcrossbow.py)
import fpcrossbow  # noqa: E402
WEAPONS['crossbow'] = {'parts': {'crossbow': fpcrossbow.part}, 'mats': fptorch.mats(None, fpcrossbow.OWN),
                       'shape': fpcrossbow.SHAPE, 'posed': fpcrossbow.posed, 'length': fpcrossbow.length,
                       'girth': lambda S, part: 0.05, 'root_r': lambda S, part: 0.03, 'root_seen': True}

# the shields in the left fist (Shield Widget's): each kind a part, the shield and the arm one rigid piece (fpshield.py)
import fpshield  # noqa: E402
WEAPONS['shield'] = {'parts': {kind: fpshield.part_for(kind) for kind in fpshield.KINDS}, 'mats': fpshield.mats(),
                     'shape': fpshield.SHAPE, 'length': lambda S, part: fpshield.AXIS,
                     'girth': lambda S, part: 0.4, 'root_r': lambda S, part: 0.2, 'root_seen': True}


# the bard's instruments in both hands: the Lute, the Flute, the Recorder and the Tambourine, each with our two arms one
# part made again at each pose's numbers (instruments.py)
import instruments  # noqa: E402
WEAPONS.update(instruments.weapons())


def girth(weapon, S=None, part=None):
    """About how wide a part draws across its root's end, metres: what a seed reads its depth from."""
    S = S or SHAPE
    return WEAPONS[weapon]['girth'](S, part or parts(weapon)[0])


def root_radius(weapon, S=None, part=None):
    """How far a part reaches round its root, metres: the hand rule keeps that much of it off the screen too."""
    S = S or SHAPE
    return WEAPONS[weapon]['root_r'](S, part or parts(weapon)[0])


def joints(weapon, part=None):
    """A part's joints beyond its place on the screen: (name, the fit's step, its bounds, the prior's unit, its rest), a
    number each a pose carries by name. The boot bends its ankle (`bend`, degrees, opening it past the shape's `ankle`);
    the arm bends its fingers, thumb and wrist (fphand.JOINTS; a punch's held to a fist, fphand.FIST_JOINTS)."""
    return WEAPONS[weapon].get('joints', {}).get(part or parts(weapon)[0], ())


def _ankle(S=None):
    """The boot's ankle: (the first of the vertices that turn at it, its pivot, its axis, the leg's X)."""
    v, _, _, _ = arrays('fists', S, 'boot')
    return len(v) - len(_blob_mesh('foot', _foot_blobs, 0.003)[0]), np.array([0.0, 0.0, SHIN]), np.array([1.0, 0, 0])


def posed(weapon, part, v, pose, S=None):
    """A part's vertices `v` bent as `pose` bends its joints (fpstage.pose_matrix places the part; this bends it)."""
    part = part or parts(weapon)[0]
    if WEAPONS[weapon].get('posed_joints'):   # a part rebuilt where its joints put it, every joint's rest laid under (the flail's chain)
        return WEAPONS[weapon]['posed_joints'](S or SHAPE, v, {**{j[0]: j[4] for j in joints(weapon, part)}, **pose})
    if 'posed' in WEAPONS[weapon]:   # a part that makes itself again at its joints (the bow, fpbow.py)
        return WEAPONS[weapon]['posed'](v, pose, S or SHAPE)
    arm = WEAPONS[weapon].get('arms', {}).get(part)
    if arm:   # the arm (fparm.py): its hand bent at its joints, a joint the pose leaves out at its rest
        side, key = arm
        k = (S or SHAPE)[key]
        c = (S or SHAPE).get('cuff') or k
        if not fparm.has_rig(k, c, len(v)):
            arrays(weapon, S, part)
        return fparm.posed(v, {**{j[0]: j[4] for j in joints(weapon, part)}, **pose}, k, side, c)
    bend = pose.get('bend', 0.0) if joints(weapon, part) else 0.0
    if not bend:
        return v
    start, pivot, axis = _ankle(S)
    a = math.radians(bend)
    c, s = math.cos(a), math.sin(a)
    x, y, z = axis
    R = np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                  [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                  [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])
    out = v.copy()
    out[start:] = pivot + (v[start:] - pivot) @ R.T
    return out


def arrays(weapon, S=None, part=None):
    """A part's (vertices, faces, material index a face) and the weapon's material names."""
    W = WEAPONS[weapon]
    v, q, m = W['parts'][part or parts(weapon)[0]](S or SHAPE)
    return v, q, m, W['mats']


def triangles(weapon, classes, S=None, part=None):
    """A part's triangles for the fitter: (vertices, triangles, class a triangle). `classes` maps a material to the
    reference's class (5 the dyed band, 1 the rest)."""
    v, q, m, mats = arrays(weapon, S, part)
    if q.shape[1] == 4:
        q, m = np.concatenate([q[:, [0, 1, 2]], q[:, [0, 2, 3]]]), np.concatenate([m, m])
    cls = np.array([classes.get(n, 1) for n in mats], dtype=np.int8)[m]
    return v, q, cls


def build(weapon, M, S=None):
    """Each of the weapon's parts as a Blender object wearing materials `M` (by name): {part: object}."""
    import bpy
    out = {}
    for part in parts(weapon):
        v, q, m, mats = arrays(weapon, S, part)
        me = bpy.data.meshes.new(f'{weapon}_{part}')
        me.from_pydata(v.tolist(), [], q.tolist())
        for n in mats:
            me.materials.append(M[n])
        me.polygons.foreach_set('material_index', m.tolist())
        me.update()
        me.shade_smooth()
        attr = me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')   # the patterns read it: they ride the part
        attr.data.foreach_set('vector', v.astype(np.float32).ravel())
        ob = bpy.data.objects.new(f'{weapon}_{part}', me)
        bpy.context.scene.collection.objects.link(ob)
        out[part] = ob
    return out


def palette():
    """The weapons' materials. A metal is grey: in the game every grey is the metal the dye recolours. The arm's sleeve
    is drawn in that band too, so it is grey, and dyed as Daggerfall's is."""
    import materials
    return {
        **fpbow.palette(),
        **lifetools.palette(),
        **instruments.palette(),
        'staff': _diffuse(_staff_wood()),
        'ferrule': _diffuse(materials.plain('ferrule', (0.55, 0.55, 0.55), rough=0.7)),
        **fpdagger.palette(),
        **fpsword.palette(),
        **fpwarhammer.palette(),
        'blade': _diffuse(materials.speckle('blade', (0.57, 0.57, 0.57), (0.6, 0.6, 0.6), scale=900.0, at=0.45,
                                            rough=0.9, metal=0.0)),
        'boot': _leather('boot', (0.17, 0.05, 0.025), (0.32, 0.14, 0.06), scale=45.0, rough=0.5, crease=0.2,
                         period=0.03, width=0.2, bump=0.9, ridge_lift=0.16, patches=0.06),
        # the axe's iron: hammered, its mottle coarser and deeper than a blade's polish
        'axehead': axes.iron('axehead'),
        'haft': axes.wood('haft', (0.2, 0.08, 0.025), (0.55, 0.26, 0.08)),
        # the flail's cast iron, rougher than the axe's; its handle's flat-sawn wood
        'flailiron': flails.iron('flailiron', {**flails.FLAIL, **SHAPE}),   # its ferrule's bands by the flail's shape
        'flailwood': flails.wood('flailwood'),
        # the mace's: its flanges, collar and spike smooth iron, faintly grained (a frame's grade spreads a flat face's
        # light wide: a coarse grain would break into noise); its core cast, a grain finer than a pixel, so it sparkles
        # as Daggerfall's does; its haft a darker wood, its grain finer and harder, streaked as Daggerfall's
        'parchment': fpheld.parchment(),   # the held map's sheet
        'macehead': axes.iron('macehead', dark=(0.566, 0.566, 0.566), light=(0.574, 0.574, 0.574), dent=0.02),
        'macecore': axes.iron('macecore', grain=900.0, dents=200.0),
        'macehaft': axes.wood('macehaft', (0.12, 0.045, 0.018), (0.5, 0.23, 0.08), scale=(260.0, 260.0, 9.0), detail=4.0,
                              distortion=1.6, edges=(0.4, 0.6)),
        'legging': _laced('legging', (0.5, 0.4, 0.22), (0.08, 0.055, 0.03)),
        # the arm's linen sleeve: its creases are in its shape (fparm.py), the cloth plain, faintly mottled and woven
        'linen': _linen('linen', (0.56, 0.56, 0.56), (0.66, 0.66, 0.66)),
        # the arm's leather gauntlet: mottled, its creases faint (its form does the shading, as Daggerfall's), a soft
        # satin sheen on its knuckles (a hard one snaps to a palette's pinks)
        'gauntlet': _leather('gauntlet', (0.22, 0.14, 0.055), (0.4, 0.27, 0.12), scale=70.0, rough=0.62, crease=0.86,
                             period=0.022, width=0.08, bump=0.15, ridge_lift=0.03, patches=0.05, rings=0.0),
        # the dagger's grip, wrapped in the glove's leather: its own material, so it is drawn with the dagger
        'dagger_grip': _leather('dagger_grip', (0.22, 0.14, 0.055), (0.4, 0.27, 0.12), scale=70.0, rough=0.62,
                                crease=0.86, period=0.022, width=0.08, bump=0.15, ridge_lift=0.03, patches=0.05, rings=0.0),
    }


def _staff_wood():
    """The staff's wood, as Daggerfall grains it: long streaks down the pole, bright grain against dark heartwood,
    wandering a little, and dark flecks scattered through it."""
    import materials
    wood, b = materials._principled('staff', (0.3, 0.13, 0.04), rough=0.7)
    nt = wood.node_tree
    streak = nt.nodes.new('ShaderNodeTexNoise')   # stretched along the pole: a streak runs a hand's length or more
    streak.inputs['Scale'].default_value = 1.0
    streak.inputs['Detail'].default_value = 4.0
    streak.inputs['Roughness'].default_value = 0.5
    streak.inputs['Distortion'].default_value = 0.9
    nt.links.new(materials._coords(wood, (150.0, 150.0, 4.0)), streak.inputs['Vector'])
    mottle = nt.nodes.new('ShaderNodeTexNoise')   # broad patches of lighter and darker wood under the streaks
    mottle.inputs['Scale'].default_value = 1.0
    mottle.inputs['Detail'].default_value = 1.0
    nt.links.new(materials._coords(wood, (60.0, 60.0, 9.0)), mottle.inputs['Vector'])
    blend = nt.nodes.new('ShaderNodeMath')
    blend.operation = 'MULTIPLY_ADD'   # the streaks, swayed by the patches
    blend.inputs[1].default_value = 0.8
    nt.links.new(streak.outputs['Fac'], blend.inputs[0])
    sway = nt.nodes.new('ShaderNodeMath')
    sway.operation = 'MULTIPLY'
    sway.inputs[1].default_value = 0.2
    nt.links.new(mottle.outputs['Fac'], sway.inputs[0])
    nt.links.new(sway.outputs[0], blend.inputs[2])
    grain = nt.nodes.new('ShaderNodeValToRGB')
    grain.color_ramp.elements[0].position = 0.32
    grain.color_ramp.elements[0].color = (0.06, 0.022, 0.008, 1)
    grain.color_ramp.elements[1].position = 0.68
    grain.color_ramp.elements[1].color = (0.62, 0.3, 0.07, 1)
    nt.links.new(blend.outputs[0], grain.inputs['Fac'])
    fleck = nt.nodes.new('ShaderNodeTexNoise')   # small dark flecks, a little longer than wide
    fleck.inputs['Scale'].default_value = 1.0
    fleck.inputs['Detail'].default_value = 2.0
    nt.links.new(materials._coords(wood, (700.0, 700.0, 90.0)), fleck.inputs['Vector'])
    dots = nt.nodes.new('ShaderNodeValToRGB')
    dots.color_ramp.elements[0].position = 0.7
    dots.color_ramp.elements[0].color = (1, 1, 1, 1)
    dots.color_ramp.elements[1].position = 0.76
    dots.color_ramp.elements[1].color = (0.45, 0.4, 0.38, 1)
    nt.links.new(fleck.outputs['Fac'], dots.inputs['Fac'])
    redden = nt.nodes.new('ShaderNodeValToRGB')   # where the patches run deep, the wood reddens
    redden.color_ramp.elements[0].position = 0.58
    redden.color_ramp.elements[0].color = (0, 0, 0, 1)
    redden.color_ramp.elements[1].position = 0.72
    redden.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(mottle.outputs['Fac'], redden.inputs['Fac'])
    red = nt.nodes.new('ShaderNodeMix')
    red.data_type = 'RGBA'
    red.blend_type = 'MULTIPLY'
    ra, rb = (next(i for i in red.inputs if i.name == n and i.type == 'RGBA') for n in ('A', 'B'))
    nt.links.new(next(o for o in redden.outputs if o.name == 'Color'), red.inputs['Factor'])
    nt.links.new(grain.outputs['Color'], ra)
    rb.default_value = (0.92, 0.66, 0.55, 1)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    a, c = (next(i for i in mix.inputs if i.name == n and i.type == 'RGBA') for n in ('A', 'B'))
    nt.links.new(next(o for o in red.outputs if o.type == 'RGBA'), a)
    nt.links.new(dots.outputs['Color'], c)
    nt.links.new(next(o for o in mix.outputs if o.type == 'RGBA'), b.inputs['Base Color'])
    return wood


def _rest_vector(nt):
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type = 'GEOMETRY'
    at.attribute_name = 'rest'
    return at.outputs['Vector']


def _leather(name, dark, light, scale, rough, crease=0.6, period=0.016, width=0.08, bump=0.5, ridge_lift=0.1,
             patches=0.08, distortion=9.0, rings=0.35):
    """Worn leather: its colour mottled between `dark` and `light`, crumpled by creases. A crease is a dark stroke a few
    pixels wide where one of two sets of wavy bands bottoms out: one set rings the part (about its own axis), the other
    runs slantwise, both bent about by noise as soft leather folds. `period` is the bands' spacing (metres), `width` the
    share of it a stroke takes, `crease` how dark a stroke falls (0 black, 1 none); each stroke is sunk in the bump, and
    `ridge_lift` lightens the fold's ridge beside it. The folds bunch in patches about `patches` metres across (None:
    folds everywhere), `distortion` bends them about (low: even bands, as cloth's), and `rings` is how dark the set
    ringing the part falls beside the slanted one (0: none)."""
    import bpy
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.3
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (scale, scale, scale)
    L.new(_rest_vector(nt), mp.inputs['Vector'])
    blotch = nt.nodes.new('ShaderNodeTexNoise')
    blotch.inputs['Scale'].default_value = 0.6
    blotch.inputs['Detail'].default_value = 3.0
    L.new(mp.outputs['Vector'], blotch.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.3, (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.7, (*light, 1)
    L.new(blotch.outputs['Fac'], ramp.inputs['Fac'])

    def strokes(direction, at, distortion, ridge=False):
        """One set of creases: 1 on a stroke (on its fold's ridge, with `ridge`), falling to 0 off it."""
        wave = nt.nodes.new('ShaderNodeTexWave')
        wave.wave_type = 'BANDS'
        wave.bands_direction = direction
        wave.wave_profile = 'SIN'
        wave.inputs['Scale'].default_value = 2 * math.pi / 20.0 / (period * at)   # one band each `period` metres
        wave.inputs['Distortion'].default_value = distortion
        wave.inputs['Detail'].default_value = 3.0
        wave.inputs['Detail Scale'].default_value = 1.0
        L.new(_rest_vector(nt), wave.inputs['Vector'])
        line = nt.nodes.new('ShaderNodeMapRange')   # a band's trough is the stroke, its edges soft
        line.interpolation_type = 'SMOOTHSTEP'
        line.inputs['From Min'].default_value = 1.0 - width if ridge else width
        line.inputs['From Max'].default_value = 1.0 if ridge else 0.0
        L.new(wave.outputs['Fac'], line.inputs['Value'])
        return line.outputs['Result']
    # the folds run slantwise, bent about by noise; a faint second set rings the part
    slants, ringed = strokes('DIAGONAL', 1.0, distortion), strokes('Z', 1.5, distortion * 0.9)
    faint = nt.nodes.new('ShaderNodeMath')
    faint.operation = 'MULTIPLY'
    faint.inputs[1].default_value = rings
    L.new(ringed, faint.inputs[0])
    both = nt.nodes.new('ShaderNodeMath')
    both.operation = 'MAXIMUM'
    L.new(slants, both.inputs[0])
    L.new(faint.outputs[0], both.inputs[1])
    # the folds bunch in patches, as crumpled leather's do, with plain stretches of hide between
    folds = nt.nodes.new('ShaderNodeMath')
    folds.operation = 'MULTIPLY'
    L.new(both.outputs[0], folds.inputs[0])
    folds.inputs[1].default_value = 1.0
    if patches:
        patch = nt.nodes.new('ShaderNodeTexNoise')
        patch.inputs['Scale'].default_value = 1.0 / patches
        patch.inputs['Detail'].default_value = 1.0
        L.new(_rest_vector(nt), patch.inputs['Vector'])
        bunch = nt.nodes.new('ShaderNodeMapRange')
        bunch.interpolation_type = 'SMOOTHSTEP'
        bunch.inputs['From Min'].default_value = 0.45
        bunch.inputs['From Max'].default_value = 0.6
        L.new(patch.outputs['Fac'], bunch.inputs['Value'])
        L.new(bunch.outputs['Result'], folds.inputs[1])
    shade = nt.nodes.new('ShaderNodeMix')
    shade.data_type = 'RGBA'
    shade.blend_type = 'MULTIPLY'
    shade.inputs['B'].default_value = (crease, crease * 0.9, crease * 0.82, 1)
    L.new(folds.outputs[0], shade.inputs['Factor'])
    L.new(ramp.outputs['Color'], shade.inputs['A'])
    lift = nt.nodes.new('ShaderNodeMix')   # each fold's ridge catches the light beside its dark valley
    lift.data_type = 'RGBA'
    lift.blend_type = 'SCREEN'
    lift.inputs['B'].default_value = (ridge_lift * 1.0, ridge_lift * 0.8, ridge_lift * 0.55, 1)
    L.new(strokes('DIAGONAL', 1.0, distortion, ridge=True), lift.inputs['Factor'])
    L.new(shade.outputs['Result'], lift.inputs['A'])
    L.new(lift.outputs['Result'], b.inputs['Base Color'])
    sunk = nt.nodes.new('ShaderNodeBump')
    sunk.invert = True
    sunk.inputs['Strength'].default_value = bump
    sunk.inputs['Distance'].default_value = 0.004
    L.new(folds.outputs[0], sunk.inputs['Height'])
    L.new(sunk.outputs['Normal'], b.inputs['Normal'])
    return m


def _laced(name, cloth, cord):
    """Leggings laced up the front (-Y): cords crossing in an X ladder over a band down the shin, a bright eyelet at each
    turn of a cord down the band's edges, plain cloth round the rest."""
    import bpy
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.85
    b.inputs['Specular IOR Level'].default_value = 0.1
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(_rest_vector(nt), xyz.inputs[0])

    def op(kind, a, b_=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        for k, v in enumerate((a, b_)):
            if v is None:
                continue
            if isinstance(v, float):
                n.inputs[k].default_value = v
            else:
                L.new(v, n.inputs[k])
        return n.outputs[0]
    neg_y = op('MULTIPLY', xyz.outputs['Y'], -1.0)
    th = op('ARCTAN2', xyz.outputs['X'], neg_y)               # 0 down the front
    u = op('MULTIPLY', th, 5.0)
    v = op('MULTIPLY', xyz.outputs['Z'], 75.0)
    cross = op('MULTIPLY', op('ABSOLUTE', op('SINE', op('ADD', u, v))), op('ABSOLUTE', op('SINE', op('SUBTRACT', u, v))))
    on_cord = op('LESS_THAN', cross, 0.2)
    band = op('LESS_THAN', op('ABSOLUTE', th), 0.42)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (*cloth, 1)
    mix.inputs['B'].default_value = (*cord, 1)
    L.new(op('MULTIPLY', on_cord, band), mix.inputs['Factor'])
    # the eyelets: bright rings down both edges of the band, one where each cord turns
    edge = op('MULTIPLY', op('GREATER_THAN', op('ABSOLUTE', th), 0.34), op('LESS_THAN', op('ABSOLUTE', th), 0.45))
    step = op('FRACT', op('ADD', op('MULTIPLY', xyz.outputs['Z'], 75.0 / (2 * np.pi)), 0.25))
    ring = op('MULTIPLY', edge, op('LESS_THAN', step, 0.3))
    eyelet = nt.nodes.new('ShaderNodeMix')
    eyelet.data_type = 'RGBA'
    eyelet.inputs['B'].default_value = (0.62, 0.64, 0.7, 1)
    L.new(mix.outputs['Result'], eyelet.inputs['A'])
    L.new(ring, eyelet.inputs['Factor'])
    L.new(eyelet.outputs['Result'], b.inputs['Base Color'])
    return m


def _linen(name, dark, light):
    """Plain linen: grey and faintly mottled (its weave is finer than a pixel). Its folds are its shape's: the light
    shades them, and each crease's valley falls dark in its own shadow."""
    import bpy
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    L = nt.links
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.95
    b.inputs['Specular IOR Level'].default_value = 0.0
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (40.0, 40.0, 40.0)
    L.new(_rest_vector(nt), mp.inputs['Vector'])
    mottle = nt.nodes.new('ShaderNodeTexNoise')
    mottle.inputs['Scale'].default_value = 0.8
    mottle.inputs['Detail'].default_value = 4.0
    L.new(mp.outputs['Vector'], mottle.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.35, (*dark, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.65, (*light, 1)
    L.new(mottle.outputs['Fac'], ramp.inputs['Fac'])
    # a crease's valley falls dark whatever the light, as a painted fold does: the cloth's own occlusion
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.only_local = True
    ao.samples = 32
    ao.inputs['Distance'].default_value = 0.02
    fold = nt.nodes.new('ShaderNodeMapRange')
    fold.inputs['From Min'].default_value, fold.inputs['From Max'].default_value = 0.6, 0.95
    fold.inputs['To Min'].default_value, fold.inputs['To Max'].default_value = 0.3, 1.0
    L.new(ao.outputs['AO'], fold.inputs['Value'])
    shade = nt.nodes.new('ShaderNodeMix')
    shade.data_type = 'RGBA'
    shade.blend_type = 'MULTIPLY'
    shade.inputs['Factor'].default_value = 1.0
    L.new(ramp.outputs['Color'], shade.inputs['A'])
    L.new(fold.outputs['Result'], shade.inputs['B'])
    L.new(shade.outputs['Result'], b.inputs['Base Color'])
    return m


def _cloth(m):
    """A material made a cloth: no metal in it."""
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            n.inputs['Metallic'].default_value = 0.0
    return m


def _diffuse(m):
    """A material lit as the fitter lights it (fpstage.shade): no metal, no sheen, so its light is the lamp's alone and
    the grade maps it onto Daggerfall's."""
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            n.inputs['Metallic'].default_value = 0.0
            n.inputs['Specular IOR Level'].default_value = 0.0
            n.inputs['Roughness'].default_value = 1.0
    return m
