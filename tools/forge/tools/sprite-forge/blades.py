"""The long blade of every metal, made from numbers: one blade for the first-person forge and the class sprites alike.

A blade lies in its own frame, in metres: its root at the origin where the guard meets it, its point up +Z, its edges
along X and its faces toward -Y and +Y. Each face is its own strip, flat across and smooth along, so each takes the
light as one face: the edge bevels, the flats, the fuller's walls and its floor, on both sides.

The steel blade is the first-person forge's long blade at the shape it was fitted to there (`specs/WEAPON04-shape.json`).
Each other metal departs from it (`LOOK`): its outline (a leaf's swell, a flamberge's waves, teeth, a clipped or
flared point), its section (a raised ridge, the bevels' share, a fuller) and its size. Daggerfall tells its metals
apart by colour alone; here each has a shape of its own, and the colour is still the metal's dye."""
import numpy as np

ROWS = 256   # rings along the blade: fine enough for a barb, a notch or a wave to keep its edge

METALS = ('Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')

# the outline's and the section's features past the fitted blade's, each nothing at its default. An edge feature names
# its edge: 1 the front (+X), -1 the back, 0 both
EXTRA = {
    'leaf': 0.0,        # how far the edges swell, over the half-width, at `leaf_at` along the blade: a leaf blade
    'leaf_at': 0.6,
    'wave': 0.0,        # a flamberge: the edges' waves, over the half-width, `waves` of them before the point
    'waves': 0.0,
    'wave_edge': 0.0,
    'teeth': 0.0,       # teeth `teeth_n` of them between `teeth_from` and `teeth_to`, each this deep over the half-width
    'teeth_n': 0.0,
    'teeth_from': 0.1,
    'teeth_to': 0.5,
    'teeth_edge': 1.0,
    'spikes': 0.0,      # barbs standing out from the edge, this far over the half-width, hooked back toward the hilt
    'spikes_n': 0.0,
    'spikes_from': 0.1,
    'spikes_to': 0.6,
    'spikes_edge': -1.0,
    'spikes_tipward': 0.0,  # each barb pointing to the tip instead, rising along the edge to a sharp drop: a prong
    'notches': 0.0,     # square notches cut into the edge, this deep over the half-width
    'notches_n': 0.0,
    'notches_from': 0.5,
    'notches_to': 0.8,
    'notches_edge': 1.0,
    'steps': 0.0,       # an edge stepping out `steps_n` times between `steps_from` and `steps_to`, each step a short
    'steps_n': 0.0,     # ramp rising this much over the half-width: an Orsimer blade's widening in angled shoulders
    'steps_from': 0.35,
    'steps_to': 0.65,
    'steps_edge': 1.0,
    'flare': 0.0,       # the back edge's widening toward the point, over the half-width: a cleaver's or falchion's
    'clip': 0.0,        # the share of the point the back edge cuts straight across: a clipped point
    'ridge': 0.0,       # the middle raised over the flats, over the half-thickness: a diamond's ridge
    'fuller2_at': 0.0,  # a groove either side of the middle: its centre over the half-width (0 none), its half-width,
    'fuller2_w': 0.0,   # its depth over the half-thickness (below 0 a raised rib) and the share of the length it runs
    'fuller2_d': 0.0,
    'fuller2_len': 0.7,
    'veins': 0.0,       # glowing veins inside each edge's bevel on both faces, this wide (m): a second material
    'groove': 0.0,      # the middle fuller's walls and floor in a darker metal of their own: it reads facing the lamp
    'fins': 0.0,        # a fin either side wrapping the root this share of the length, flaring past the edge at its
    'fin_out': 0.03,    # foot by `fin_out` (m), its ribs cut in the groove's metal: an Altmer blade's fletching
    'motifs': 0.0,      # this many pale drops inlaid down the ridge from the root, each face (the whole sword's only)
    'bend': 0.0,        # the whole sword's curve past `curve`: first person keeps near the straight blade its frames
                        # were fitted to, where a hard bend shortens a swing's reach and blunts the point
    'patina': 0.0,      # the flats in the groove's darker metal, so the bevels stand out bright round them
}

# each metal's departures from the fitted blade (values replace the fitted ones)
LOOK = {
    'Steel': {},
    # common smith's work: broad and plain, a short shallow fuller, wide bevels
    'Iron': {'blade_len': 0.95, 'blade_w': 0.066, 'blade_t': 0.36, 'narrow': 0.9, 'tip': 0.2, 'tip_k': 1.2,
             'bevel': 0.42, 'fuller_w': 0.22, 'fuller_d': 0.3, 'fuller_len': 0.36},
    # straight and near parallel to a short sharp point, one clean channel down its middle near its whole length
    'Silver': {'blade_len': 0.97, 'blade_w': 0.062, 'narrow': 0.86, 'tip': 0.11, 'tip_k': 1.0, 'bevel': 0.3,
               'fuller_w': 0.26, 'fuller_d': 0.42, 'fuller_floor': 0.5, 'fuller_len': 0.9, 'groove': 1.0},
    # Altmer: a straight leaf swelling past its middle to a long point, a line cut inside each edge closing near it
    'Elven': {'blade_w': 0.056, 'narrow': 0.9, 'tip': 0.24, 'tip_k': 1.25, 'bevel': 0.3, 'leaf': 0.22, 'leaf_at': 0.6,
              'fuller_w': 0.0, 'fuller_d': 0.0, 'fuller2_at': 0.64, 'fuller2_w': 0.07, 'fuller2_d': 0.45,
              'fuller2_len': 0.94, 'groove': 1.0, 'fins': 0.25, 'fin_out': 0.032},
    # Dwemer: broad and straight, a raised spine, square notches cut near the point, the back clipped
    'Dwarven': {'blade_len': 0.92, 'blade_w': 0.068, 'narrow': 0.96, 'tip': 0.15, 'tip_k': 1.0, 'clip': 0.6,
                'ridge': 0.45, 'bevel': 0.22, 'fuller_w': 0.2, 'notches': 0.32, 'notches_n': 3, 'notches_from': 0.5,
                'notches_to': 0.8, 'notches_edge': 1.0, 'fuller2_at': 0.5, 'fuller2_w': 0.06, 'fuller2_d': -0.25,
                'fuller2_len': 0.85},
    # an arming sword: broad, near parallel to a short point, a long fuller cut in a darker metal
    'Mithril': {'blade_w': 0.07, 'narrow': 0.8, 'tip': 0.14, 'tip_k': 1.1, 'fuller_w': 0.2, 'fuller_d': 0.42,
                'fuller_floor': 0.5, 'fuller_len': 0.86, 'groove': 1.0},
    # broad and near parallel, a ridge down its middle, its point clipped from the back edge
    'Adamantium': {'blade_w': 0.068, 'narrow': 0.9, 'tip': 0.17, 'tip_k': 2.0, 'clip': 1.0, 'bevel': 0.35,
                   'ridge': 0.5, 'fuller_w': 0.0, 'motifs': 3},
    # Dunmer: narrow at the root, swelling past its middle, its point swept over; black flats inside bright bevels
    'Ebony': {'blade_w': 0.05, 'curve': 0.05, 'narrow': 1.0, 'leaf': 0.4, 'leaf_at': 0.62, 'tip': 0.22,
              'tip_k': 1.4, 'ridge': 0.3, 'bevel': 0.4, 'fuller_w': 0.0, 'groove': 1.0, 'patina': 1.0},
    # Orsimer: a scimitar, narrow at the root, both edges stepping out twice toward a long point swept over
    'Orcish': {'blade_w': 0.056, 'curve': 0.0, 'bend': 0.16, 'narrow': 1.0, 'tip': 0.3, 'tip_k': 1.2, 'bevel': 0.45,
               'ridge': 0.2, 'fuller_w': 0.0, 'steps': 0.3, 'steps_n': 2, 'steps_from': 0.36, 'steps_to': 0.64,
               'steps_edge': 0.0},
    # Daedric: black flats inside grey bevels, a dull red seam between them; the front edge sawn in teeth raked
    # toward the hilt, a long prong rising off the back toward the point; bent over on the whole sword
    'Daedric': {'blade_w': 0.056, 'narrow': 0.86, 'tip': 0.26, 'tip_k': 1.3, 'ridge': 0.3, 'bevel': 0.45,
                'fuller_w': 0.0, 'groove': 1.0, 'patina': 1.0, 'bend': 0.12, 'teeth': 0.3, 'teeth_n': 7,
                'teeth_from': 0.2, 'teeth_to': 0.72, 'teeth_edge': 1.0, 'spikes': 0.9, 'spikes_n': 1,
                'spikes_from': 0.4, 'spikes_to': 0.6, 'spikes_edge': -1.0, 'spikes_tipward': 1.0, 'veins': 0.0045},
}


def shape(S, metal='Steel'):
    """The blade's whole shape for `metal`: the fitted shape `S`, the extras at nothing, the metal's look over both."""
    return {**EXTRA, **S, **LOOK[metal]}


def _edge(S, s, side):
    """One edge's half-width along the blade at shares `s` of its length: `side` 1 the front edge, -1 the back."""
    start = 1.0 - S['tip']
    u = np.clip((s - start) / max(S['tip'], 1e-6), 0.0, 1.0)
    shoulder = 1.0 - (1.0 - S['narrow']) * np.minimum(s / max(start, 1e-6), 1.0)
    k = max(S['tip_k'], 0.2)
    point = 1.0 - u ** k
    clip = S['clip'] if side < 0 else 0.0
    if clip:   # the back edge cut straight from where the clip begins to the point
        u0 = 1.0 - clip
        point = np.where(u > u0, np.minimum(point, (1.0 - u0 ** k) * (1.0 - u) / clip), point)
    hw = S['blade_w'] * shoulder * point / 2
    body = np.clip(s / max(start, 1e-6), 0.0, 1.0)
    if S['leaf']:
        hw = hw * (1 + S['leaf'] * np.exp(-((s - S['leaf_at']) / 0.2) ** 2))
    if S['wave'] and S['waves'] and S['wave_edge'] in (0.0, float(side)):
        hw = hw * (1 + S['wave'] * np.sin(np.pi * body) * np.sin(2 * np.pi * S['waves'] * body))
    if S['flare'] and side < 0:
        hw = hw * (1 + S['flare'] * body ** 1.5)
    if S['steps'] and S['steps_n'] and S['steps_edge'] in (0.0, float(side)):
        at = np.linspace(S['steps_from'], S['steps_to'], int(S['steps_n']))
        hw = hw * (1 + S['steps'] * sum(np.clip((s - a) / 0.025, 0.0, 1.0) for a in at))

    def run(key):   # where along the blade a run of `key`s lies, and how far into its own each point is (0 to 1)
        a, b = S[f'{key}_from'], S[f'{key}_to']
        t = np.clip((s - a) / max(b - a, 1e-6), 0.0, 1.0) * S[f'{key}_n']
        return (s > a) & (s < b), t - np.floor(t)
    if S['teeth'] and S['teeth_n'] and S['teeth_edge'] in (0.0, float(side)):
        inside, f = run('teeth')
        hw = hw * (1 - np.where(inside, S['teeth'] * f, 0.0))
    if S['spikes'] and S['spikes_n'] and S['spikes_edge'] in (0.0, float(side)):
        inside, f = run('spikes')   # each barb's sharp face toward the hilt, its slope toward the point
        hw = hw * (1 + np.where(inside, S['spikes'] * (f if S['spikes_tipward'] else 1 - f) ** 1.6, 0.0))
    if S['notches'] and S['notches_n'] and S['notches_edge'] in (0.0, float(side)):
        inside, f = run('notches')
        hw = hw * (1 - np.where(inside & (f > 0.3) & (f < 0.7), S['notches'], 0.0))
    return hw


def materials(metal='Steel', whole=False):
    """The blade's materials, in the order its triangles name them: the metal, its glow where it has veins, its
    groove's darker metal where it has one, and, on the `whole` sword, its motifs' pale inlay."""
    look = LOOK.get(metal, {})
    return (('blade',) + (('glow',) if look.get('veins') else ()) + (('blade_groove',) if look.get('groove') else ())
            + (('blade_inlay',) if whole and look.get('motifs') else ()))


def long_blade(S, metal='Steel', rows=ROWS, fins=False, bend=True):
    """A blade's (vertices, triangles, material index a triangle) from its fitted shape `S`: 0 the metal, 1 its glow.
    With `fins`, the whole sword's (gear.py, fpsword.py): a metal's fins at its root, its inlay, and its `bend` past its
    curve, unless `bend` is off (first person keeps the blade near straight: a hard bend up close turns the point to
    the eye)."""
    S = shape(S, metal)
    s = np.linspace(0.0, 1.0, rows + 1)
    halves = {1: _edge(S, s, 1), -1: _edge(S, s, -1)}
    mean = (halves[1] + halves[-1]) / 2
    ht = mean * S['blade_t']
    z = s * S['blade_len']
    sweep = (S['curve'] + (S['bend'] if fins and bend else 0.0)) * S['blade_len'] * s * s

    def fade(length):   # a groove runs from the guard, shallowing to nothing over its last fifth
        end = max(length, 1e-3)
        f = np.clip((end - s) / (0.2 * end), 0.0, 1.0)
        return f * f * (3 - 2 * f)
    gd = ht * S['fuller_d'] * fade(S['fuller_len'])
    g2 = ht * S['fuller2_d'] * fade(S['fuller2_len'])
    top = ht * (1 + S['ridge'])   # the section's middle, a ridge above the flats when `ridge` raises it

    def walls(hw):   # where the bevel's inner line and the middle fuller's wall stand, the wall always inside it
        inner = hw * (1 - S['bevel'])
        return inner, np.minimum(hw * S['fuller_w'], 0.85 * inner)

    def quarter(hw):   # from the edge in toward the middle, on the front (-Y)
        inner, fw = walls(hw)
        flat = ht + (top - ht) * (1 - S['fuller_w'])
        pts = [(hw, 0 * ht), (inner, ht)]
        if S['fuller2_at']:   # a groove (or a rib) on the flat between the bevel and the middle's fuller
            c, w, fl = S['fuller2_at'], S['fuller2_w'], S['fuller_floor']
            on = lambda x: ht + (flat - ht) * (inner - x) / np.maximum(inner - fw, 1e-9)   # noqa: E731
            for k, sink in ((c + w, 0), (c + w * fl, 1), (c - w * fl, 1), (c - w, 0)):
                x = np.clip(k * hw, 1.02 * fw, 0.98 * inner)   # on the flat, between the middle's fuller and the bevel
                pts.append((x, on(x) - sink * g2))
        return pts + [(fw, flat), (fw * S['fuller_floor'], top - gd), (0 * hw, top - gd)]
    verts, quads, qmat = [], [], []
    names = materials(metal)
    dark = names.index('blade_groove') if 'blade_groove' in names else 0   # the fuller's wall and floor where it is
    cut = np.broadcast_to(gd, s.shape) > 0
    cut2 = np.broadcast_to(g2, s.shape) > 0
    for sx, sy in ((1, -1), (-1, -1), (-1, 1), (1, 1)):
        q = quarter(halves[sx])
        for j, ((ax, ay), (bx, by)) in enumerate(zip(q, q[1:])):
            base = sum(len(x) for x in verts)
            a = np.stack([sweep + sx * ax, sy * ay, z], axis=1)
            b = np.stack([sweep + sx * bx, sy * by, z], axis=1)
            strip = np.empty((2 * (rows + 1), 3))
            strip[0::2], strip[1::2] = a, b
            verts.append(strip)
            flip = (sx * sy) > 0   # every strip's faces wound the same way round the section
            for i in range(rows):
                p = base + 2 * i
                quads.append((p, p + 1, p + 3, p + 2) if flip else (p, p + 2, p + 3, p + 1))
                inline = S['fuller2_at'] and 2 <= j <= 4   # a groove beside the middle: its walls and floor
                cuts = (j >= len(q) - 3 and (cut[i] or cut[i + 1])) or (inline and (cut2[i] or cut2[i + 1]))
                qmat.append(dark if (j == 1 if S['patina'] else cuts) else 0)
    # the root's end closed, so a blade cut off at the screen's foot never shows its inside
    ring = []
    for sx, sy in ((1, -1), (-1, -1), (-1, 1), (1, 1)):
        q = quarter(halves[sx])
        for x, y in (q if sx * sy < 0 else q[::-1]):
            ring.append([sweep[0] + sx * x[0], sy * y[0], 0.0])
    ring = np.array(ring)
    base = sum(len(x) for x in verts)
    verts.append(np.vstack([ring, [[sweep[0], 0.0, 0.0]]]))
    mid = base + len(ring)
    qd = np.array(quads, dtype=np.int64)
    tris = [qd[:, [0, 1, 2]], qd[:, [0, 2, 3]], np.array([(mid, base + k, base + (k + 1) % len(ring))
                                                          for k in range(len(ring))])]
    qm = np.array(qmat, dtype=np.int64)
    mats = [qm, qm, np.zeros(len(tris[2]), dtype=np.int64)]
    if S['veins']:   # a ribbon just inside each edge's bevel, a hair off the flat, thinning to nothing at its ends
        lift, w = 0.0005, S['veins']
        span = (s > 0.04) & (s < 1 - 0.4 * S['tip'])
        thin = np.where(span, np.sin(np.pi * np.clip((s - 0.04) / (0.96 - 0.4 * S['tip']), 0, 1)) ** 0.5, 0.0)
        for sx, sy in ((1, -1), (-1, -1), (-1, 1), (1, 1)):
            inner, fw = walls(halves[sx])
            centre = inner - np.minimum(1.6 * w, 0.25 * inner)
            flat = ht + (top - ht) * (1 - S['fuller_w'])
            y = sy * (ht + (flat - ht) * (inner - centre) / np.maximum(inner - fw, 1e-9) + lift)
            a = np.stack([sweep + sx * (centre + thin * w / 2), y, z], axis=1)
            b = np.stack([sweep + sx * (centre - thin * w / 2), y, z], axis=1)
            base = sum(len(x) for x in verts)
            strip = np.empty((2 * (rows + 1), 3))
            strip[0::2], strip[1::2] = a, b
            verts.append(strip)
            flip = (sx * sy) > 0
            q = np.array([(base + 2 * i, base + 2 * i + 1, base + 2 * i + 3, base + 2 * i + 2) if flip else
                          (base + 2 * i, base + 2 * i + 2, base + 2 * i + 3, base + 2 * i + 1)
                          for i in range(rows) if span[i] and span[i + 1]], dtype=np.int64)
            tris += [q[:, [0, 1, 2]], q[:, [0, 2, 3]]]
            mats.append(np.ones(2 * len(q), dtype=np.int64))
    if fins and S['motifs']:   # drops on the ridge, pointing to the tip, standing a hair off it
        inlay = materials(metal, True).index('blade_inlay')
        L = S['blade_len']
        for k in range(int(S['motifs'])):
            f = 0.09 + 0.085 * k
            hw, t = float(np.interp(f, s, mean)), float(np.interp(f, s, top))
            w, h = 0.34 * hw, 0.034 * L
            drop = [(0.0, h), (0.55 * w, 0.55 * h), (w, 0.0), (0.8 * w, -0.6 * h), (0.0, -h), (-0.8 * w, -0.6 * h),
                    (-w, 0.0), (-0.55 * w, 0.55 * h)]
            pts = [(float(np.interp(f, s, sweep)) + x, f * L + zz) for x, zz in drop]
            for sy in (1, -1):
                v, t_ = _slab(pts, *sorted((sy * 0.7 * t, sy * (t + 0.0007))))
                tris.append(t_ + sum(len(x) for x in verts))
                verts.append(v)
                mats.append(np.full(len(t_), inlay, dtype=np.int64))
    if fins and S['fins']:   # each side's fin a slab a little thicker than the blade, its ribs raised a hair off a face
        L, out, t = S['blade_len'], S['fin_out'], float(ht[0]) * 1.3
        edge = lambda side, f: float(np.interp(f, s, halves[side]))   # noqa: E731
        for sx in (1, -1):
            hw0, f = edge(sx, 0.0), S['fins']   # its foot a rounded lobe curling in under the root to meet the other's,
            pts = [(0.004, -0.022 * L), (hw0 + 0.3 * out, -0.01 * L), (hw0 + 0.9 * out, 0.02 * L),   # drawn to a point
                   (hw0 + out, 0.05 * L), (hw0 + 0.78 * out, 0.11 * L), (edge(sx, 0.7 * f) + 0.25 * out, 0.7 * f * L),
                   (edge(sx, f) + 0.15 * out, f * L), (0.5 * edge(sx, 0.72 * f), 0.72 * f * L), (0.012, 0.35 * f * L)]
            pts = [(sweep[0] + sx * x, zz) for x, zz in pts]
            v, t_ = _slab(pts, -t, t)
            tris.append(t_ + sum(len(x) for x in verts))
            verts.append(v)
            mats.append(np.zeros(len(t_), dtype=np.int64))
            for k in range(5):   # its barbs, slanting down and out from its middle to its outer edge, on both faces
                zk = (0.16 + 0.16 * k) * f * L
                a = (sweep[0] + sx * 0.3 * edge(sx, zk / L), zk)
                b = (sweep[0] + sx * (edge(sx, max(zk / L - 0.05, 0.0)) + out * (0.85 - 0.15 * k)), zk - 0.05 * L)
                for sy in (1, -1):
                    v, t_ = _rib(a, b, 0.0026, sy * t, sy * (t + 0.0012))
                    tris.append(t_ + sum(len(x) for x in verts))
                    verts.append(v)
                    mats.append(np.full(len(t_), dark, dtype=np.int64))
        for sy in (1, -1):   # a spine down the middle of the fins, rounded, from the guard up between them
            v, t_ = _rib((sweep[0], 0.0), (sweep[0], 0.8 * S['fins'] * L), 0.011, sy * t, sy * (t + 0.0028))
            tris.append(t_ + sum(len(x) for x in verts))
            verts.append(v)
            mats.append(np.zeros(len(t_), dtype=np.int64))
    return np.concatenate(verts), np.concatenate(tris), np.concatenate(mats)


def _slab(pts, y0, y1):
    """A plate of outline `pts` (x, z), from y0 to y1: its two faces fanned from their middle and its sides."""
    n, c = len(pts), np.mean(pts, axis=0)
    ring = np.array([[x, 0.0, zz] for x, zz in pts])
    lo, hi = ring.copy(), ring.copy()
    lo[:, 1], hi[:, 1] = y0, y1
    v = np.vstack([lo, hi, [[c[0], y0, c[1]], [c[0], y1, c[1]]]])
    t = [(2 * n, (k + 1) % n, k) for k in range(n)] + [(2 * n + 1, n + k, n + (k + 1) % n) for k in range(n)]
    t += [(k, (k + 1) % n, n + (k + 1) % n) for k in range(n)] + [(k, n + (k + 1) % n, n + k) for k in range(n)]
    return v, np.array(t, dtype=np.int64)


def _rib(a, b, w, y0, y1):
    """A thin raised strip from `a` to `b` (x, z), `w` wide, standing from y0 to y1."""
    d = np.array(b, dtype=float) - np.array(a, dtype=float)
    nrm = np.array([-d[1], d[0]]) / max(np.linalg.norm(d), 1e-9) * w / 2
    a, b = np.array(a, dtype=float), np.array(b, dtype=float)
    return _slab([tuple(a + nrm), tuple(b + nrm), tuple(b - nrm), tuple(a - nrm)], min(y0, y1), max(y0, y1))
