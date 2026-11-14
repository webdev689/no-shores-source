"""Each metal's own dagger in first person (WEAPON02.CIF): its blade's outline and section, its guard and its pommel.

Each is laid on Daggerfall's fitted dagger (fpdagger.py), whose shape holds the hand, and each is its long blade's (the
sword's) at a dagger's size: its blade's shape (`BLADE_LOOK`), its hilt (`HILT_LOOK`, or one of its own, `HILTS`) and
its colours (`TONE`). Iron and steel are drawn after the owner's references. The blade is rendered grey; iron's and
steel's keep the dagger's fitted grade and every other metal's takes its armour's (`own_grade`), so elven, dwarven,
adamantium and daedric keep their own colours and the rest are dyed by the game. The guard, the pommel and the grip
are polished in the metal's own colours, which no dye touches. A daedric blade's veins and its block's seam glow.

`design(metal)` lays a metal's make on the dagger (fpdagger.py `DESIGN`) and its colours on the palette; `undesign`
takes it off. fplayers.py renders each metal's dagger alone, as the layer the game lays over the hand."""
import math

import numpy as np

import blades
import fpdagger
import fphand
from fpdagger import BLADE, FIT, ACCENT, GLOW, GRIP, GROOVE, _ball, _bezier, _curve, _half

# each metal's blade, past Daggerfall's fitted one: the outline and section blades.py draws, at a dagger's size, as its
# long blade's (the sword's) shape. A width or a length is a share of the fitted one's; `curve` is metres, as
# blades.py's. Past blades.py's: `necks`, where the edges step in toward the root ((its end along the blade, its width,
# the shoulder's length), each a share), and `patina`, the flats in the darker metal inside bright bevels
BLADE_LOOK = {
    # the owner's reference: long and straight, tapering evenly to its point, a broad fuller down its middle, and a
    # narrow neck above the guard whose edges step out in a hook each side. Longer than the fitted blade by what its
    # tall guard hides
    'Steel': {'len': 1.06, 'narrow': 0.5, 'tip': 0.22, 'tip_k': 1.2, 'bevel': 0.3, 'fuller_w': 0.16, 'fuller_d': 0.5,
              'fuller_len': 0.78, 'necks': ((0.13, 0.62, 0.01),)},
    # the owner's reference: broad, its edges near parallel to a long spear point, a narrow fuller three quarters of
    # its length
    'Iron': {'w': 1.25, 'blade_t': 0.22, 'narrow': 0.9, 'tip': 0.3, 'tip_k': 1.6, 'bevel': 0.34, 'fuller_w': 0.14,
             'fuller_d': 0.6, 'fuller_len': 0.76},
    # straight and near parallel to a short sharp point, one clean channel down its middle near its whole length
    'Silver': {'w': 1.05, 'narrow': 0.86, 'tip': 0.16, 'tip_k': 1.0, 'bevel': 0.3, 'fuller_w': 0.26, 'fuller_d': 0.42,
               'fuller_floor': 0.5, 'fuller_len': 0.9},
    # Altmer: a straight leaf swelling past its middle to a long point, a line cut inside each edge closing near it
    'Elven': {'narrow': 0.9, 'tip': 0.26, 'tip_k': 1.25, 'bevel': 0.3, 'leaf': 0.22, 'leaf_at': 0.6,
              'fuller2_at': 0.64, 'fuller2_w': 0.07, 'fuller2_d': 0.45, 'fuller2_len': 0.94},
    # Dwemer: broad and straight, a raised spine, square notches cut near the point, the back clipped
    'Dwarven': {'w': 1.2, 'narrow': 0.96, 'tip': 0.15, 'tip_k': 1.0, 'clip': 0.6, 'ridge': 0.45, 'bevel': 0.22,
                'fuller_w': 0.2, 'notches': 0.32, 'notches_n': 2, 'notches_from': 0.55, 'notches_to': 0.8,
                'notches_edge': 1.0, 'fuller2_at': 0.5, 'fuller2_w': 0.06, 'fuller2_d': -0.25, 'fuller2_len': 0.85},
    # an arming sword's: broad, near parallel to a short point, a long fuller cut in a darker metal
    'Mithril': {'w': 1.2, 'narrow': 0.8, 'tip': 0.16, 'tip_k': 1.1, 'fuller_w': 0.2, 'fuller_d': 0.42,
                'fuller_floor': 0.5, 'fuller_len': 0.86},
    # broad and near parallel, a ridge down its middle, its point clipped from the back edge
    'Adamantium': {'w': 1.2, 'narrow': 0.9, 'tip': 0.18, 'tip_k': 2.0, 'clip': 1.0, 'bevel': 0.35, 'ridge': 0.5},
    # Dunmer: narrow at the root, swelling past its middle, its point swept over; black flats inside bright bevels
    'Ebony': {'w': 0.95, 'curve': 0.05, 'narrow': 1.0, 'leaf': 0.4, 'leaf_at': 0.62, 'tip': 0.22, 'tip_k': 1.4,
              'ridge': 0.3, 'bevel': 0.4, 'patina': True},
    # Orsimer: narrow at the root, both edges stepping out twice in angled shoulders toward a long point
    'Orcish': {'w': 1.1, 'blade_t': 0.32, 'narrow': 1.0, 'tip': 0.3, 'tip_k': 1.2, 'bevel': 0.45, 'ridge': 0.2,
               'necks': ((0.34, 0.7, 0.05), (0.5, 0.85, 0.05))},
    # Daedric: black flats inside grey bevels, a dull red seam between them, the front edge sawn in teeth; its prong
    # rises off the back toward the point (`_daedric_hilt`)
    'Daedric': {'w': 1.05, 'narrow': 0.86, 'tip': 0.26, 'tip_k': 1.3, 'ridge': 0.3, 'bevel': 0.45, 'patina': True,
                'teeth': 0.3, 'teeth_n': 5, 'teeth_from': 0.2, 'teeth_to': 0.7, 'teeth_edge': 1.0, 'veins': 0.0012},
}
# a metal's guard and pommel where its hilt is not one of its own (`HILTS`): silver's beaded quillons and pear, elven's
# gold wings and drop, dwarven's stepped block and nut, each its long blade's hilt at a dagger's size
HILT_LOOK = {'Silver': ('quillons', 'pear'), 'Elven': ('wings', 'drop'), 'Dwarven': ('block', 'nut')}
METALS = tuple(m for m in BLADE_LOOK if m != 'Steel')   # the metals past steel, whose frames are the shared ones
FLOOR = 0.22   # the least a hilt's reflection takes of each channel (materials.polish)


def blade_shape(S, metal):
    """The fitted dagger's shape with `metal`'s blade over it: Daggerfall's slots and its carried-over point gone."""
    L = dict(BLADE_LOOK[metal])
    out = {**blades.EXTRA, **S, 'drop': 0.0, 'leaf': 0.0, 'fuller2_at': 0.0, 'fuller2_w': 0.0, 'fuller2_d': 0.0,
           'fuller_w': 0.0, 'fuller_d': 0.0}
    out['blade_w'] = S['blade_w'] * L.pop('w', 1.0)
    out['blade_len'] = S['blade_len'] * L.pop('len', 1.0)
    for key in ('necks', 'patina'):
        L.pop(key, None)
    out.update(L)
    return out


def _blade(S, metal):
    """`metal`'s blade on the dagger's grip: its fullers' walls and floors in the darker metal, its veins glowing."""
    B = blade_shape(S, metal)
    rows = 96
    v, t, m0 = blades.long_blade(B, 'Steel', rows=rows)
    m = np.where(m0 == 1, GLOW, BLADE)
    # each quarter of the section, edge to middle: bevel, flat, (a groove either side: wall, floor, wall, flat,) the
    # middle fuller's wall and its floor
    twin = bool(B['fuller2_at'])
    strips = 8 if twin else 4
    quads = 4 * strips * rows
    q = np.arange(quads)
    run, strip = q % rows, (q // rows) % strips
    dark = np.zeros(quads, dtype=bool)
    if twin and B['fuller2_d'] > 0:   # a groove either side: sunk, so dark; a raised rib takes the light as the blade
        dark |= np.isin(strip, (2, 3, 4)) & (run < rows * B['fuller2_len'] * 0.92)
    if B['fuller_d'] > 0:
        dark |= np.isin(strip, (6, 7) if twin else (2, 3)) & (run < rows * B['fuller_len'] * 0.92)
    if BLADE_LOOK[metal].get('patina'):   # all but the bevels, the whole length
        dark |= strip > 0
    for half in (0, quads):
        idx = q[dark] + half
        m[idx] = np.where(m[idx] == GLOW, GLOW, GROOVE)
    necks = BLADE_LOOK[metal].get('necks')
    if necks:   # the rings toward the root narrowed, so each edge steps out where a neck ends
        at, width = [0.0], [necks[0][1]]
        for k, (end, w, shoulder) in enumerate(necks):
            at += [end, end + shoulder]
            width += [w, necks[k + 1][1] if k + 1 < len(necks) else 1.0]
        v = v.copy()
        v[:, 0] *= np.interp(v[:, 2] / B['blade_len'], at, width)
    return v + np.array([0.0, 0.0, _half(S) + S['guard_h'] * 0.6]), t, m


# -- the simple solids a hilt is made of


def _box(c, h, mat, rot=0.0):
    """A box about `c`, half-sizes `h` (x, y, z), turned `rot` degrees about Y (in the blade's plane)."""
    s = np.array([[x, y, z] for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)], dtype=float) * np.asarray(h)
    a = math.radians(rot)
    R = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
    v = s @ R.T + np.asarray(c)
    f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    t = np.array([tri for a_, b, c_, d in f for tri in ((a_, b, c_), (a_, c_, d))], dtype=np.int64)
    return v, t, mat


def _prism(c, r, half, mat, n=6, axis=2, twist=0.0):
    """An `n`-sided prism about `c`, `r` to its corners, `half` its half-length along `axis`, capped."""
    th = np.linspace(0.0, 2 * np.pi, n, endpoint=False) + math.radians(twist)
    ring = np.stack([np.cos(th) * r, np.sin(th) * r], axis=1)
    pts = []
    for s in (-half, half):
        for p in ring:
            q = [p[0], p[1]]
            q.insert(axis, s)
            pts.append(q)
    v = np.array(pts) + np.asarray(c)
    tris = []
    for i in range(n):
        j = (i + 1) % n
        tris += [(i, j, n + j), (i, n + j, n + i)]
    v = np.vstack([v, [np.asarray(c) + np.insert([0.0, 0.0], axis, -half)],
                   [np.asarray(c) + np.insert([0.0, 0.0], axis, half)]])
    lo, hi = 2 * n, 2 * n + 1
    tris += [(lo, (i + 1) % n, i) for i in range(n)] + [(hi, n + i, n + (i + 1) % n) for i in range(n)]
    return v, np.array(tris, dtype=np.int64), mat


def _horn(a, b, c, r0, r1, mat, broad=1.0, thin=1.0, n=8):
    """A horn along the curve a-b-c (in the blade's plane), `r0` thick at its root and `r1` at its end."""
    pts = _bezier(np.asarray(a, float), np.asarray(b, float), np.asarray(c, float), n=10)
    r = r0 + (r1 - r0) * np.linspace(0.0, 1.0, len(pts)) ** 0.85
    v, t = _curve(pts, r, broad=broad, thin=thin, n=n)
    return v, t, mat


def _mirror(pieces):
    """Pieces and their mirror across the blade (X to -X), its faces turned to face out."""
    out = []
    for v, t, m in pieces:
        out += [(v, t, m), (v * np.array([-1.0, 1.0, 1.0]), t[:, ::-1].copy(), m)]
    return out


# -- the guards: each about the guard's middle line, its span shares of the blade's width


def _guard(S, kind):
    bw, h, d = S['blade_w'], S['guard_h'], S['guard_d']
    z = _half(S) + h / 2
    if kind == 'quillons':   # slim quillons curving toward the point, a gilt ball at each end
        out = [_box((0, 0, z), (0.6 * bw, d * 0.4, h * 0.6), FIT)]
        out += _mirror([_horn((0.4 * bw, 0, z), (1.3 * bw, 0, z), (1.65 * bw, 0, z + 0.55 * bw), 0.0038, 0.003, FIT),
                        (*_ball((1.68 * bw, 0, z + 0.6 * bw), (0.0055,) * 3, n=6), ACCENT)])
        return out
    if kind == 'wings':   # two gold wings swept up toward the point, thin as leaves, a stone between them
        out = [(*_ball((0, 0, z), (0.55 * bw, d * 0.42, h * 0.75), n=8), FIT)]
        out += _mirror([_horn((0.3 * bw, 0, z), (1.35 * bw, 0, z + 0.05 * bw), (1.5 * bw, 0, z + 1.1 * bw),
                              0.0065, 0.0005, FIT, broad=1.3, thin=0.4)])
        out += [(*_ball((0, f * d * 0.42, z), (0.004, 0.002, 0.005), n=6), ACCENT) for f in (1, -1)]
        return out
    if kind == 'block':   # a stepped block, a round boss on each face, as the Dwemer square their work
        out = [_box((0, 0, z - h * 0.2), (1.5 * bw, d * 0.5, h * 0.42), FIT),
               _box((0, 0, z + h * 0.4), (0.95 * bw, d * 0.42, h * 0.3), FIT)]
        out += [_prism((0, f * d * 0.5, z - h * 0.2), 0.0055, 0.0015, ACCENT, n=10, axis=1) for f in (1, -1)]
        return out
    raise ValueError(kind)


# -- the pommels: each below the grip's end


def _pommel(S, kind):
    z0 = -_half(S) - 0.004
    if kind == 'pear':   # a pear, a gilt bead at its end
        return [(*_ball((0, 0, z0 - 0.013), (0.0105, 0.0105, 0.0145), n=10), FIT),
                (*_ball((0, 0, z0 - 0.029), (0.0045,) * 3, n=6), ACCENT)]
    if kind == 'drop':   # a long gold drop
        return [(*_ball((0, 0, z0 - 0.016), (0.008, 0.008, 0.017), n=10), FIT),
                (*_ball((0, 0, z0 - 0.003), (0.0065, 0.0065, 0.004), n=8), ACCENT)]
    if kind == 'nut':   # a six-sided nut, a smaller one on it
        return [_prism((0, 0, z0 - 0.007), 0.0135, 0.0065, FIT, n=6),
                _prism((0, 0, z0 - 0.017), 0.009, 0.0035, ACCENT, n=6, twist=30.0)]
    raise ValueError(kind)


def _spline(pts, n=40):
    """A smooth path through `pts` (Catmull-Rom), about `n` points along it, ending on the last."""
    P = np.asarray(pts, float)
    P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    each = max(2, n // (len(P) - 3))
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0.0, 1.0, each, endpoint=False):
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    return np.array(out + [P[-2]])


def _ring(z, r, half, mat, power=2.0):
    """A ring round the grip's axis at `z`, `r` its radius and `half` its half-height."""
    s = np.array([z - half, z + half])
    v, t = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], s, np.full(2, r), np.full(2, r), power=power,
                        n=16)
    return v, t, mat


# the iron dagger's hilt, after the owner's reference. Its guard: a rounded block at the blade's root, and from it on
# each side a flat bar that waves twice and swells to an arrowhead's point (`IRON_ARM`: the path in the iron blade's
# widths from the guard's middle line, its half-height along it). Its grip: wood, longer than the fist so it shows
# below the little finger (`tail`), an iron collar under the guard with a rivet through it, a band, then two pairs
# (`bands`, shares of the grip from the guard); its pommel an iron cap flaring to a rim, a tongue up each face
IRON_ARM = ((0.0, -0.04), (0.4, -0.02), (0.62, 0.04), (0.84, 0.06), (1.04, 0.0), (1.24, -0.04), (1.42, 0.0),
            (1.58, 0.03), (1.72, 0.02))
IRON_ARM_R = ((0.0, 0.0075), (0.3, 0.0068), (0.55, 0.0058), (0.76, 0.005), (0.85, 0.0062), (0.93, 0.0036),
              (1.0, 0.0004))
IRON_GRIP = {'tail': 0.03, 'bands': (0.22, 0.58, 0.64, 0.8, 0.86), 'rivet': 0.013}


def _iron_hilt(S):
    bw = S['blade_w'] * BLADE_LOOK['Iron']['w']
    h, d, r = S['guard_h'], S['guard_d'], S['grip_r']
    z0, tail = _half(S), IRON_GRIP['tail']
    zg = z0 + h / 2
    path = _spline([(x * bw, 0.0, zg + y * bw) for x, y in IRON_ARM], n=48)
    u = np.linspace(0.0, 1.0, len(path))
    girth = np.interp(u, *zip(*IRON_ARM_R))
    arm = _curve(path, girth, broad=1.0, thin=0.7, n=10)
    out = [(*_ball((0, 0, zg), (0.62 * bw, d * 0.42, h * 0.55), n=8), FIT)] + _mirror([(*arm, FIT)])
    # the grip: wood, filling toward the pommel, from the guard to past the fist
    end = -z0 - tail
    s = np.linspace(end, z0 + 0.004, 14)
    girths = r * (1.0 + 0.14 * (z0 - s) / (z0 - end))
    gv, gt = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], s, girths, girths, power=2.0, n=14)
    out += [(gv, gt, GRIP), _ring(z0 - 0.002, r * 1.16, 0.0045, FIT)]
    out += [(*_ball((0, f * r * 1.15, z0 - IRON_GRIP['rivet']), (0.0024, 0.0012, 0.0024), n=6), ACCENT)
            for f in (1, -1)]
    length = z0 - end
    for share in IRON_GRIP['bands']:
        out.append(_ring(z0 - share * length, r * (1.03 + 0.14 * share), 0.0011, FIT))
    # the cap: flaring from the grip to a rim, a low dome on its end, a pointed tongue up each face
    cap = np.array([end + 0.012, end + 0.004, end, end - 0.003])
    flare = r * np.array([1.19, 1.25, 1.33, 1.39])
    cv, ct = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], cap, flare, flare, power=2.0, n=16)
    out += [(cv, ct, FIT), (*_ball((0, 0, end - 0.003), (r * 1.15, r * 1.15, 0.0035), n=8), FIT)]
    out += [(*fpdagger._cone((0, f * r * 1.3, end + 0.001), (0, f * r * 1.12, end + 0.021), 0.007, 0.0006,
                             thin=0.3), FIT) for f in (1, -1)]
    return out


# the steel dagger's hilt, after the owner's reference. Its guard: a tall crescent, its horns turned up toward the
# point and rounded (`STEEL_GUARD`: half its span, its foot's rise at the horns and its top's, in the steel blade's
# root widths), each face an engraved field in a darker steel with a knot raised either side. Its grip: wrapped in
# dark cord, a little waisted, past the fist (`tail`); its pommel a plain steel cap flaring to its end
STEEL_GUARD = {'span': 0.95, 'tall': 0.6, 'foot': 0.6, 'top': 0.45, 'deep': 0.8}
# a knot's path, (across, up) in its field's shares: a loop and a turn either side of the middle
STEEL_KNOT = ((0.86, 0.3), (0.7, 0.82), (0.52, 0.3), (0.38, 0.78), (0.24, 0.52), (0.36, 0.2))
STEEL_GRIP = {'tail': 0.022, 'cord': 0.006}


def _crescent(half, rise, foot, top, deep, z0, mat, n=24, cap=6):
    """A crescent slab across the blade, face to face `deep`: its foot's middle at `z0`, `rise` tall there; toward
    each horn (at `half` either side) its foot climbs `foot` and its top `top`, so the horns turn up toward the point.
    Each horn's end is rounded, half a circle as tall as the horn."""
    u = np.sin(np.linspace(-np.pi / 2, np.pi / 2, n))
    x = half * u
    lo = z0 + foot * u * u
    hi = z0 + rise + top * u * u
    rho, mid = (rise + top - foot) / 2, z0 + (foot + rise + top) / 2
    phi = np.linspace(0.0, np.pi / 2, cap + 1)[1:]
    ends = half + rho * np.sin(phi)
    x = np.concatenate([-ends[::-1], x, ends])
    lo = np.concatenate([mid - rho * np.cos(phi[::-1]), lo, mid - rho * np.cos(phi)])
    hi = np.concatenate([mid + rho * np.cos(phi[::-1]), hi, mid + rho * np.cos(phi)])
    n = len(x)
    v = []
    for y in (-deep / 2, deep / 2):
        v += [(xi, y, a) for xi, a in zip(x, hi)] + [(xi, y, a) for xi, a in zip(x, lo)]
    v = np.array(v)
    T, B = (lambda i, f: f * 2 * n + i), (lambda i, f: f * 2 * n + n + i)
    tris = []
    for i in range(n - 1):
        j = i + 1
        tris += [(T(i, 0), B(i, 0), B(j, 0)), (T(i, 0), B(j, 0), T(j, 0))]   # the front face
        tris += [(T(i, 1), B(j, 1), B(i, 1)), (T(i, 1), T(j, 1), B(j, 1))]   # the back
        tris += [(T(i, 0), T(j, 0), T(j, 1)), (T(i, 0), T(j, 1), T(i, 1))]   # the top
        tris += [(B(i, 0), B(j, 1), B(j, 0)), (B(i, 0), B(i, 1), B(j, 1))]   # the foot
    for i, f in ((0, 1), (n - 1, -1)):   # the horns' ends
        q = (T(i, 0), B(i, 0), B(i, 1), T(i, 1))
        tris += [(q[0], q[2], q[1]), (q[0], q[3], q[2])] if f > 0 else [(q[0], q[1], q[2]), (q[0], q[2], q[3])]
    return v, np.array(tris, dtype=np.int64), mat


def _steel_hilt(S):
    bw = S['blade_w'] * BLADE_LOOK['Steel'].get('w', 1.0)
    r, z0, G = S['grip_r'], _half(S), STEEL_GUARD
    half, rise, foot, top = G['span'] * bw, G['tall'] * bw, G['foot'] * bw, G['top'] * bw
    deep, zg = S['guard_d'] * G['deep'], z0 - 0.002
    out = [_crescent(half, rise, foot, top, deep, zg, FIT)]
    # each face's engraved field, a hair proud of it, and a knot raised on it either side of the middle
    m = 0.15 * bw
    for f in (1, -1):
        field = _crescent(half - 2 * m, rise - 2 * m, foot, top, 0.0008, zg + m, ACCENT, cap=4)
        out.append((field[0] + np.array([0.0, f * deep / 2, 0.0]), field[1], field[2]))
        for side in (1, -1):
            pts = [(side * a * (half - 2 * m), f * (deep / 2 + 0.0006),
                    zg + m + foot * a * a + b * (rise - 2 * m + (top - foot) * a * a)) for a, b in STEEL_KNOT]
            path = _spline(pts, n=24)
            out.append((*_curve(path, np.full(len(path), 0.0014), thin=0.5, n=6, point=False), FIT))
    # the grip: cord over a waisted core, from inside the guard to past the fist
    end = -z0 - STEEL_GRIP['tail']
    s = np.linspace(end, zg + 0.004, 14)
    w = (s - end) / (zg + 0.004 - end)
    girths = r * (1.02 - 0.08 * np.sin(np.pi * w))
    gv, gt = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], s, girths, girths, power=2.0, n=14)
    out.append((gv, gt, GRIP))
    for zc in np.arange(end + 0.004, zg, STEEL_GRIP['cord']):   # the cord's turns
        k = (zc - end) / (zg + 0.004 - end)
        out.append(_ring(zc, r * (1.06 - 0.08 * np.sin(np.pi * k)), 0.0013, GRIP))
    # the pommel: a steel cap flaring to its end, its end a low dome
    cap = np.array([end - 0.015, end - 0.012, end, end + 0.005])
    flare = r * np.array([1.18, 1.2, 1.08, 1.02])
    cv, ct = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], cap, flare, flare, power=2.0, n=16)
    out += [(cv, ct, FIT), (*_ball((0, 0, end - 0.015), (r * 1.1, r * 1.1, 0.003), n=8), FIT)]
    return out


# -- the parts the long blades' hilts are made of, at a dagger's size


def _plate(pts, depth, mat, y=0.0):
    """A flat plate cut to the outline `pts` ((x, z), in order round it) in the blade's plane, `depth` face to face
    about `y`: a claw, a wing, a curl or a crescent."""
    P = np.asarray(pts, float)
    if np.sum(P[:, 0] * np.roll(P[:, 1], -1) - np.roll(P[:, 0], -1) * P[:, 1]) < 0:
        P = P[::-1]   # counter-clockwise in (x, z)
    n, idx, flat = len(P), list(range(len(P))), []

    def inside(p, a, b, c):
        d = lambda u, v, w: (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0])  # noqa: E731
        return d(a, b, p) > 0 and d(b, c, p) > 0 and d(c, a, p) > 0
    while len(idx) > 3:   # clip an ear at a time
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = P[i0], P[i1], P[i2]
            if (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= 1e-12:
                continue
            if any(inside(P[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            flat.append((i0, i1, i2))
            del idx[k]
            break
        else:
            break
    if len(idx) == 3:
        flat.append(tuple(idx))
    v = np.vstack([np.stack([P[:, 0], np.full(n, y + depth / 2), P[:, 1]], 1),
                   np.stack([P[:, 0], np.full(n, y - depth / 2), P[:, 1]], 1)])
    tris = [(a, c, b) for a, b, c in flat] + [(a + n, b + n, c + n) for a, b, c in flat]
    for i in range(n):
        j = (i + 1) % n
        tris += [(i, j, j + n), (i, j + n, i + n)]
    return v, np.array(tris, dtype=np.int64), mat


def _band(mid, w, y, depth, mat):
    """A flat band `w` wide along the path `mid` ((x, z)), a plate standing at `y`."""
    c = np.asarray(mid, float)
    t = np.gradient(c, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True)
    nrm = np.stack([-t[:, 1], t[:, 0]], 1) * w / 2
    return _plate(np.vstack([c + nrm, (c - nrm)[::-1]]), depth, mat, y)


def _lathe(profile, mat, at=(0.0, 0.0, 0.0), axis='z', n=16, flat=1.0):
    """A turned piece: `profile` its (radius, place along the axis) from end to end about `at`, `flat` times as thick
    across the blade's faces (along Y) as across its edges."""
    r = np.array([p[0] for p in profile], float)
    s = np.array([p[1] for p in profile], float)
    if axis == 'z':   # rings about Z: `w` along Y, `h` along X
        v, t = fphand._tube(np.asarray(at, float), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], s, r * flat, r, power=2.0, n=n)
    else:   # about Y, a wheel's face to the eye
        v, t = fphand._tube(np.asarray(at, float), [0.0, 1.0, 0.0], [0.0, 0.0, 1.0], s, r, r, power=2.0, n=n)
    return v, t, mat


def _grip(z0, z1, r, mat, sides=14):
    s = np.linspace(z0, z1, 10)
    v, t = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], s, np.full_like(s, r), np.full_like(s, r),
                        power=2.0, n=sides)
    return v, t, mat


def _arm(path, girth, mat, thin=0.6, point=True):
    """A horn, hook or arm along `path` ((x, z), in the blade's plane), `girth` its half-breadth from root to end."""
    p = _spline([(x, 0.0, z) for x, z in path], n=36)
    g = np.interp(np.linspace(0.0, 1.0, len(p)), np.linspace(0.0, 1.0, len(girth)), girth)
    return (*_curve(p, g, thin=thin, n=8, point=point), mat)


def _scaled(pts, k, z, x=0.0):
    return [(x + a * k, z + b * k) for a, b in pts]


# each hilt below is its long blade's (the sword's) at a dagger's size: its shapes in shares of the blade's root width
# (`k`), its guard's foot on the fist's top, its grip running on past the fist to its pommel
def _mithril_hilt(S):
    """An arming sword's: a guard of flat arms curving toward the blade, a chequered panel down each arm's faces; a
    leather grip banded at the guard, its middle and its foot; a wheel pommel, its rim dark."""
    bw, r, z0 = S['blade_w'] * BLADE_LOOK['Mithril']['w'], S['grip_r'], _half(S)
    half, rise, dz, dy = 1.55 * bw, 0.3 * bw, 0.0065, 0.0055
    zc = z0 + dz
    xs = np.linspace(-half, half, 25)
    out = [(*_curve(np.stack([xs, np.zeros_like(xs), zc + rise * (xs / half) ** 2], 1), np.full(len(xs), dz),
                    thin=dy / dz, n=8, point=False), FIT)]
    for f in (1, -1):
        for side in (1, -1):
            a = np.linspace(0.14, 0.94, 18) * half * side
            mid = np.stack([a, zc + rise * (a / half) ** 2], 1)
            out.append(_band(mid, 1.1 * dz, f * (dy + 0.0004), 0.0008, ACCENT))
            for i in np.linspace(1, len(a) - 2, 6).astype(int):   # the chequer's rungs across it
                tx, tz = mid[i + 1] - mid[i - 1]
                out.append(_box((mid[i][0], f * (dy + 0.0008), mid[i][1]), (0.0007, 0.0004, 0.5 * dz), FIT,
                                rot=-math.degrees(math.atan2(tz, tx))))
    tail = 0.02
    end = -z0 - tail
    out += [_grip(end, z0 + 0.003, r, GRIP), _ring(z0 - 0.003, r * 1.18, 0.003, FIT), _ring(0.0, r * 1.12, 0.0025, FIT),
            _ring(end + 0.003, r * 1.18, 0.003, FIT)]
    zp = end - 0.019
    out += [_lathe([(0.0, -0.0075), (0.009, -0.007), (0.016, -0.0055), (0.019, -0.0035), (0.019, 0.0035),
                    (0.016, 0.0055), (0.009, 0.007), (0.0, 0.0075)], FIT, at=(0, 0, zp), axis='y', n=24),
            _lathe([(0.0, -0.003), (0.0198, -0.003), (0.0198, 0.003), (0.0, 0.003)], ACCENT, at=(0, 0, zp), axis='y',
                   n=24)]
    return out


ADAMANT_UP = ((-0.56, 0.06), (-0.81, 0.15), (-1.25, 0.19), (-1.65, 0.28), (-1.91, 0.44), (-2.06, 0.65))
ADAMANT_DOWN = ((0.56, -0.03), (0.81, -0.07), (1.18, -0.24), (1.46, -0.49), (1.62, -0.76), (1.68, -1.03))


def _adamantium_hilt(S):
    """An S-guard's: a block crowned by four gold points, a boss on each face, one arm swept out and up toward the
    blade to a broad paddle, the other out and down toward the pommel; a flared collar; a dark banded grip; a stepped
    eight-sided cap."""
    bw, r, z0 = S['blade_w'] * BLADE_LOOK['Adamantium']['w'], S['grip_r'], _half(S)
    hx, hy, hz = 0.62 * bw, 0.011, 0.29 * bw
    zc = z0 + hz
    out = [_box((0, 0, zc), (hx, hy, hz), FIT)]
    for dx in (1, -1):
        for dz in (1, -1):
            out.append(_plate([(0.44 * bw * dx, zc + 0.12 * bw * dz), (0.79 * bw * dx, zc + 0.53 * bw * dz),
                               (0.21 * bw * dx, zc + 0.32 * bw * dz)], 1.5 * hy, ACCENT))
    out += [(*_ball((0, f * hy, zc), (0.17 * bw, 0.003, 0.17 * bw), n=8), FIT) for f in (1, -1)]
    k = 0.8 * bw
    out += [_arm(_scaled(ADAMANT_UP, k, zc), (0.0065, 0.0055, 0.0075, 0.0105), FIT, thin=0.55, point=False),
            _arm(_scaled(ADAMANT_DOWN, k, zc), (0.0065, 0.006, 0.0068), FIT, thin=0.55, point=False)]
    tail = 0.018
    end = -z0 - tail
    out += [_lathe([(r * 1.1, z0 - 0.012), (r * 1.35, z0 - 0.004), (r * 1.4, z0 + 0.001)], FIT),
            _grip(end, z0, r, GRIP)]
    out += [_ring(z, r * 1.06, 0.0012, FIT) for z in np.arange(end + 0.006, z0 - 0.01, 0.011)]
    out += [_prism((0, 0, end - 0.004), r * 1.4, 0.005, FIT, n=8, twist=22.5),
            _prism((0, 0, end - 0.012), r * 1.05, 0.004, FIT, n=8, twist=22.5)]
    return out


EBONY_CURL = ((-0.28, 0.8), (-0.6, 0.6), (-0.88, 0.28), (-1.0, -0.08), (-0.94, -0.4), (-0.76, -0.64), (-0.52, -0.76),
              (-0.36, -0.64), (-0.6, -0.48), (-0.72, -0.24), (-0.68, 0.08), (-0.44, 0.32), (-0.24, 0.4))
EBONY_WING = ((0.28, 0.4), (0.6, 0.24), (0.92, -0.16), (1.08, -0.68), (1.0, -1.0), (0.8, -0.72), (0.52, -0.4),
              (0.28, -0.28))
EBONY_BEAK = ((-0.012, 0.0), (0.012, 0.0), (0.018, -0.012), (0.0156, -0.0236), (0.0024, -0.0356), (-0.0108, -0.0284),
              (-0.0144, -0.014))


def _ebony_hilt(S):
    """The Dunmer's: no cross bar, the blade's root in a block, a curl swept out and down from its back round a pale
    ringed eye on each face, a wing swept down from its front; a black eight-sided grip in pale bands; a beaked cap."""
    bw, r, z0 = S['blade_w'] * BLADE_LOOK['Ebony']['w'], S['grip_r'], _half(S)
    hx, hy, hz = 0.44 * bw, 0.01, 0.3 * bw
    zc, k = z0 + hz, 0.8 * bw
    out = [_box((0, 0, zc), (hx, hy, hz), FIT), _plate(_scaled(EBONY_CURL, k, zc), 0.015, FIT),
           _plate(_scaled(EBONY_WING, k, zc), 0.013, FIT)]
    eye = (-0.6 * k, zc - 0.18 * k)
    for f in (1, -1):
        out += [(*_ball((eye[0], f * 0.0082, eye[1]), (0.22 * k, 0.0009, 0.22 * k), n=10), ACCENT),
                (*_ball((eye[0], f * 0.0088, eye[1]), (0.15 * k, 0.0016, 0.15 * k), n=8), FIT)]
    tail = 0.02
    end = -z0 - tail
    out.append(_grip(end, z0, r, GRIP, sides=8))
    out += [_ring(z, r * 1.08, 0.0011, ACCENT) for z in (z0 - 0.004, z0 - 0.011, end + 0.006, end + 0.012)]
    out.append(_plate([(a, end + b) for a, b in EBONY_BEAK], 0.018, FIT))
    return out


ORCISH_CLAW = ((0.21, 0.29), (0.64, 0.25), (0.96, 0.07), (1.18, -0.25), (1.23, -0.64), (1.14, -1.0), (0.96, -1.29),
               (0.98, -0.93), (0.93, -0.61), (0.79, -0.32), (0.57, -0.14), (0.25, -0.11))


def _orcish_hilt(S):
    """The Orsimer's: no cross bar, a hooked claw swept down from the root toward the pommel, a ruff of hide round the
    root; a grip of crossed thongs; a broad flared cap, flat across the blade's faces."""
    bw, r, z0 = S['blade_w'] * BLADE_LOOK['Orcish']['w'], S['grip_r'], _half(S)
    hx, hy, hz = 0.32 * bw, 0.0085, 0.18 * bw
    zc, k = z0 + hz, 0.85 * bw
    out = [_box((0, 0, zc), (hx, hy, hz), FIT), _plate(_scaled(ORCISH_CLAW, k, zc), 0.011, FIT),
           _lathe([(r * 1.0, z0 - 0.017), (r * 1.25, z0 - 0.014), (r * 1.7, z0 - 0.009), (r * 1.45, z0 - 0.006),
                   (r * 1.6, z0 - 0.002), (r * 1.1, z0 + 0.002)], ACCENT, n=9)]
    tail = 0.02
    end = -z0 - tail
    out.append(_grip(end, z0, r, GRIP))
    for z in np.arange(end + 0.004, z0 - 0.018, 0.007):   # the thongs crossing: a raised pair, then a gap
        out += [_ring(z, r * 1.07, 0.0011, GRIP), _ring(z + 0.0026, r * 1.07, 0.0011, GRIP)]
    out.append(_lathe([(r * 0.95, end + 0.002), (r * 1.0, end - 0.003), (r * 1.4, end - 0.008), (r * 2.2, end - 0.013),
                       (r * 2.7, end - 0.017), (r * 2.55, end - 0.021), (r * 1.6, end - 0.023), (0.0, end - 0.024)],
                      FIT, n=20, flat=0.45))
    return out


DAEDRIC_HORN = ((-0.36, 0.14), (-0.71, 0.25), (-0.96, 0.57), (-1.04, 1.04), (-0.93, 1.46))
DAEDRIC_HOOK = ((0.36, 0.04), (0.79, -0.07), (1.14, -0.39), (1.32, -0.86), (1.32, -1.36), (1.18, -1.79))
DAEDRIC_SPUR = ((0.98, -0.3), (1.12, 0.06), (1.12, 0.42))
DAEDRIC_CRESCENT = ((-0.0072, -0.0024), (0.0072, -0.0036), (0.0192, -0.0108), (0.03, -0.0192), (0.0372, -0.0252),
                    (0.024, -0.024), (0.0108, -0.0252), (0.0, -0.03), (-0.0132, -0.0384), (-0.0276, -0.0444),
                    (-0.018, -0.0324), (-0.0108, -0.0192))


def _daedric_hilt(S):
    """The Daedra's: a black block at the root, a dull red seam round it, a horn curving up from its back and a long
    spurred hook curving down from its front; a long grey eight-sided grip, banded; a crescent blade for a pommel; and
    a prong rising off the blade's back toward the point."""
    bw, r, z0 = S['blade_w'] * BLADE_LOOK['Daedric']['w'], S['grip_r'], _half(S)
    hx, hy, hz = 0.45 * bw, 0.011, 0.23 * bw
    zc, k = z0 + hz, 0.75 * bw
    out = [_box((0, 0, zc), (hx, hy, hz), FIT), _box((0, 0, zc), (hx * 1.03, hy * 1.08, 0.0011), GLOW),
           _arm(_scaled(DAEDRIC_HORN, k, zc), (0.2 * k, 0.15 * k, 0.08 * k, 0.01 * k), FIT, thin=0.5),
           _arm(_scaled(DAEDRIC_HOOK, k, zc), (0.22 * k, 0.17 * k, 0.1 * k, 0.01 * k), FIT, thin=0.5),
           _arm(_scaled(DAEDRIC_SPUR, k, zc), (0.1 * k, 0.05 * k, 0.005 * k), FIT, thin=0.5)]
    B = blade_shape(S, 'Daedric')
    root, length = z0 + S['guard_h'] * 0.6, B['blade_len']
    hw = B['blade_w'] / 2 * (1 - (1 - B['narrow']) * 0.4 / (1 - B['tip']))
    out.append(_arm([(-0.8 * hw, root + 0.36 * length), (-1.45 * hw, root + 0.43 * length),
                     (-1.7 * hw, root + 0.52 * length), (-1.55 * hw, root + 0.6 * length)],
                    (0.0045, 0.003, 0.0015, 0.0003), BLADE, thin=0.35))
    tail = 0.024
    end = -z0 - tail
    out += [_grip(end, z0, r, GRIP, sides=8), _prism((0, 0, z0 - 0.004), r * 1.2, 0.004, FIT, n=8, twist=22.5),
            _prism((0, 0, end + 0.004), r * 1.25, 0.005, FIT, n=8, twist=22.5)]
    out += [_ring(z, r * 1.05, 0.0009, FIT, power=2.0) for z in np.arange(end + 0.012, z0 - 0.01, 0.009)]
    out.append(_plate([(a, end + b) for a, b in DAEDRIC_CRESCENT], 0.0085, FIT))
    return out


HILTS = {'Steel': _steel_hilt, 'Iron': _iron_hilt, 'Mithril': _mithril_hilt, 'Adamantium': _adamantium_hilt,
         'Ebony': _ebony_hilt, 'Orcish': _orcish_hilt, 'Daedric': _daedric_hilt}


def _hilt(S, metal):
    """`metal`'s grip, guard and pommel: the grip in its own grip's colour, a collar where it meets the pommel."""
    if metal in HILTS:
        return HILTS[metal](S)
    z0, r = _half(S), S['grip_r']
    s = np.linspace(-z0 - 0.004, z0 + 0.004, 12)
    gv, gt = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0], s, np.full_like(s, r), np.full_like(s, r),
                          power=2.0, n=14)
    collar = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [1.0, 0.0, 0.0],
                          np.array([-z0 - 0.007, -z0 - 0.004, -z0 + 0.002]), np.array([r * 1.25, r * 1.4, r * 1.25]),
                          np.array([r * 1.25, r * 1.4, r * 1.25]), power=2.0, n=14)
    guard, pommel = HILT_LOOK[metal]
    return [(gv, gt, GRIP), (collar[0], collar[1], FIT)] + _guard(S, guard) + _pommel(S, pommel)


# each dagger's colours past its metal's (metals.py `LOOK`), its long blade's (the sword's): the blade and its groove
# (in the third person, and where the first person keeps its own colours), the fittings, an accent and the grip.
# Steel's guard and cap a bright steel, its engraving dark
TONE = {
    'Steel': {'fit': (184, 184, 190), 'accent': (84, 84, 90)},
    'Silver': {'fit': (200, 200, 216), 'accent': (214, 214, 230), 'grip': (40, 34, 70)},
    'Elven': {'blade': (222, 180, 82), 'fit': (212, 170, 70), 'accent': (212, 170, 70), 'grip': (150, 90, 50)},
    'Dwarven': {'blade': (150, 132, 82), 'fit': (170, 128, 48), 'accent': (190, 150, 60), 'grip': (60, 36, 22)},
    'Mithril': {'blade': (62, 105, 167), 'fit': (150, 176, 214), 'accent': (34, 38, 46), 'grip': (104, 72, 44)},
    'Adamantium': {'blade': (122, 122, 137), 'fit': (122, 122, 137), 'accent': (212, 170, 70), 'grip': (30, 34, 36)},
    'Ebony': {'blade': (124, 124, 132), 'groove': (34, 33, 38), 'fit': (66, 64, 72), 'accent': (150, 150, 156),
              'grip': (18, 16, 18)},
    'Orcish': {'blade': (58, 92, 36), 'fit': (58, 92, 36), 'accent': (52, 36, 24), 'grip': (70, 48, 32)},
    'Daedric': {'blade': (112, 104, 98), 'groove': (20, 18, 18), 'fit': (30, 26, 26), 'accent': (112, 108, 110),
                'grip': (112, 108, 110), 'glow': (110, 14, 9)},
}
GROOVE_SHARE = 0.45   # a darker groove's light, a share of its blade's, where the blade takes its armour's grade


def palette(metal):
    """`metal`'s fittings, accent, glow and grip, by its long blade's colours (`TONE`, metals.py `LOOK`): polished."""
    import materials
    import metals
    L = {**metals.LOOK[metal], **TONE.get(metal, {})}
    lin = metals._linear
    rough = min(L['rough'], 0.4)
    # a hilt's pieces are small: half metallic, so the lamp shows their colour too, and a dark metal's reflection lifted
    # enough to hold its edges against the glove
    out = {'dagger_fit': materials.polished('dagger_fit', lin(L['fit']), rough=rough, metal=0.6, floor=FLOOR),
           'dagger_accent': materials.polished('dagger_accent', lin(L.get('accent', L['metal'])), rough=rough * 0.8,
                                               metal=0.6, floor=FLOOR),
           'dagger_grip': materials.plain('dagger_grip', lin(L['grip']), rough=0.7, spec=0.3)}
    if 'glow' in L:
        m = materials.plain('dagger_glow', lin(L['glow']), rough=0.5)
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = (*lin(L['glow']), 1)
        b.inputs['Emission Strength'].default_value = 6.0
        out['dagger_glow'] = m
    return out


def own_grade(metal):
    """The grade of `metal`'s blade, as its armour's plate is graded up close (armour.py `CLOSE_UP`) and its warhammer's
    head is (fpwarhammers.py `own_grade`): each frame's light share for share onto its spread, elven's, dwarven's,
    adamantium's and daedric's in their own colours (never grey, so the game lays no dye on them), the rest grey for
    their dye. Its groove the same, darker. None for iron and steel, which keep the dagger's fitted grade."""
    if metal in ('Iron', 'Steel'):
        return None
    import bpy  # noqa: F401  (armour.py reads mathutils, which Blender brings)
    import armour
    plate = armour.CLOSE_UP[metal]['grade']['plate']
    at, dst = plate['share']
    groove = {**plate, 'share': [at, [max(8.0, GROOVE_SHARE * d) for d in dst]]}
    return {n: {**g, 'detail': [5, 0.5, 2.5]} for n, g in (('dagger_blade', plate), ('dagger_groove', groove))}


def design(metal):
    """Lay `metal`'s dagger on the forge (a metal with no make of its own keeps Daggerfall's): its blade and hilt, its
    colours over the palette, and its blade's own grade. Gives back what to restore."""
    import fpforge
    import fpmodel
    saved = dict(fpdagger.DESIGN), fpmodel.palette, fpforge.load
    if metal in BLADE_LOOK:
        fpdagger.DESIGN.update(blade=lambda S: _blade(S, metal), hilt=lambda S: _hilt(S, metal))
        base = fpmodel.palette
        fpmodel.palette = lambda: {**base(), **palette(metal)}
    own, load = own_grade(metal), fpforge.load
    if own:
        def graded(path):   # over the archive's grade and each record's and frame's own
            spec = load(path)
            fpforge.GRADE.update(own)
            for table in (*fpforge.RECORD_GRADE.values(), *fpforge.FRAME_GRADE.values()):
                table.update({n: g for n, g in own.items() if n in table})
            return spec
        fpforge.load = graded
    return saved


def undesign(saved):
    import fpforge
    import fpmodel
    fpdagger.DESIGN.clear()
    fpdagger.DESIGN.update(saved[0])
    fpmodel.palette, fpforge.load = saved[1], saved[2]
