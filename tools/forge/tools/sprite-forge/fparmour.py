"""The first-person armour: each armour set's gauntlets over the punching arm and its greaves and sabatons over the
kicking leg (WEAPON10.CIF), drawn in the culture's hand as the third-person sets are (armour.py's STYLE).

    python -I tools/sprite-forge/fparmour.py --out public/art/studio/forge/WEAPON10 [--materials Iron,Daedric]
    python -I tools/sprite-forge/fparmour.py --spec tools/sprite-forge/specs/RUN.json --out public/art/run

A plate gauntlet is a mail glove under its plates: a lame over each bone of each finger and of the thumb, flared over
the one before and the tips rounded (a daedra's drawn to claws), three lames over the back of the hand, a plate across
the knuckles, a cuff over the wrist flared only as far as the vambrace needs, and a vambrace up the forearm, keeled, riveted, fluted, faceted or spiked as
the culture builds. The plates ride the hand's own pieces (fphand.py), so they bend with the fingers. A kick in plate is
a greave keeled down the shin over a poleyn at the knee, and a sabaton fitted to the boot's own foot: a heel cup, lames
from the ankle each over the next, a toe cap rounded, pointed, squared or clawed, on a dark sole.

Writes `WEAPON10.CIF_<record>-<frame>_<Material>.png` beside the forge's material-less frames, which stay the leather
glove's and boot's. Another spec of the fists' arm (`--spec`, the running arms') is dressed the same way. Plate and mail
are rendered grey and the game dyes them, as it dyes a weapon's metal; a daedric seam glows in a colour no dye touches,
and elven's gold and dwarven's bronze are graded in their own colours (armour.py `ELVEN_GOLD`, `DWARVEN_BRONZE`),
never grey, which no dye touches either."""
import argparse
import json
import math
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fparm  # noqa: E402
import fphand  # noqa: E402
import fpmodel  # noqa: E402
from armourkit import TAU, Mesh, Outline, box, dome, faceted, keel, sleeve, solid, spike, squared, teeth, tube  # noqa: E402

SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'WEAPON10.json')
WRIST = fphand.WRIST
# the slots an armour piece is made in, past the outfit's own materials: plate, a daedric seam's glow, mail, a sole's
# or a slit's dark, a dark plate (a set's `dark_vambrace`), and a strap in the boot's leather (a leather set's bracer):
# its own slot, as the boot is the fists' alone and a slot below BASE names another picture's own material
PLATE, GLOW, MAIL, DARK, SHADE, STRAP = range(6)
EXTRA = ('plate', 'glow', 'mail', 'dark', 'shade', 'strap')
BASE = 4   # where they count from among the fists' materials: past the outfit's two, the boot's and the leggings'


def style(material):
    import bpy  # noqa: F401  (armour.py's modules read mathutils, which Blender brings)
    import armour
    return {**armour.STYLE[material], **armour.CLOSE_UP.get(material, {})}   # its close-up detail: a gauntlet fills the view


def _tris(mesh, slot_of=None):
    """A kit mesh (armourkit.Mesh) as (vertices, triangles, slot a triangle): each face fanned from its first corner."""
    v = np.concatenate(mesh.v) if mesh.v else np.zeros((0, 3))
    t, s = [], []
    for face, slot in zip(mesh.f, mesh.m):
        for j in range(1, len(face) - 1):
            t.append((face[0], face[j], face[j + 1]))
            s.append(slot if slot_of is None else slot_of(slot))
    return v, np.array(t, dtype=np.int64).reshape(-1, 3), np.array(s, dtype=np.int64)


def _split(mesh, piece):
    """A kit mesh as the arm's armour pieces: one (vertices, triangles, slot, piece) a slot, so each wears its own."""
    v, t, s = _tris(mesh)
    return [(v, t[s == slot], BASE + int(slot), piece) for slot in np.unique(s)]


def _section(s, th):
    """A plate's ring by the culture's section, as a share of its radius: squared, cut into facets, or round."""
    sec = s.get('section', ('round',))
    one = np.ones(len(th))
    if sec[0] == 'square':
        return squared(th, one, max(sec[1], 3))
    if sec[0] == 'facet':
        return faceted(th, one, min(sec[1], 12))
    return one


def _trim(s):
    """The slot a set's rims, flutes and lines are made in: its plate's own, or the dark plate, graded apart, where its
    trim is darker than its plate (`dark_trim`, elven's), so each rim draws a line between plates, or lighter
    (`own_trim`, daedric's), so each rim catches a pale light over black."""
    return SHADE if s.get('dark_trim') or s.get('own_trim') else PLATE


def _spiral(m, c, n, r):
    """A spiral boss on a plate at `c`, facing `n`, `r` across its ring, as the sprite's (armour.py `_spiral`): a
    raised ring round a domed heart and a scroll winding out between them, on a dark disc sunk in the plate."""
    n = np.asarray(n, float) / max(np.linalg.norm(n), 1e-9)
    u = np.cross(n, (0.0, 0.0, 1.0) if abs(n[2]) < 0.9 else (1.0, 0.0, 0.0))
    u /= np.linalg.norm(u)
    w = np.cross(n, u)
    at = lambda t, rr, lift: c + n * lift + rr * (math.cos(t) * u + math.sin(t) * w)   # noqa: E731
    ts = np.linspace(0.0, TAU, 25)[:-1]
    solid(m, np.array([[at(t, r * 0.05, 0.0006) for t in ts], [at(t, r * 1.15, 0.0006) for t in ts]]), 0.0006,
          DARK, closed=True, inward=c - n * 0.01)
    tube(m, [at(t, r, 0.0012) for t in ts], r * 0.16, PLATE, n=5, closed=True)
    dome(m, c + n * 0.0008, r * 0.36, n, PLATE)
    tube(m, [at(t, r * (0.36 + 0.5 * k / 24), 0.0014) for k, t in enumerate(np.linspace(0.0, 3 * math.pi, 25))],
         r * 0.1, PLATE, n=4)


# -- the gauntlet

def _finger_lames(m, s, i):
    """A lame over each of finger `i`'s three bones, straight (the pose bends them with the finger)."""
    a = fphand._knuckle(i)
    d = fphand._fan(fphand.FINGER_FAN[i])
    r = fphand.FINGER_R[i]
    L1, L2, L3 = fphand.FINGER_LEN[i]
    cuts = (0.0, L1, L1 + L2, L1 + L2 + L3)
    for j in range(3):
        claw = s.get('claws') and j == 2
        head, foot = cuts[j] - 0.003, cuts[j + 1] + (0.014 if claw else -0.0015 if j < 2 else 0.0)
        g = sleeve(m, a + d * head, a + d * foot, r * (1.16 - 0.04 * j) + 0.0016, (0.0, 1.0, 0.0),
                   1.25 if claw else 1.75, 0.0012, PLATE, rows=4 if j == 2 else 3, cols=11, flare=0.14, tip=j == 2)
        if s.get('edge') or s.get('trimlines'):
            tube(m, g[0], 0.0009, _trim(s), n=4)


def _thumb_w(s, girth=1.0):
    """The thumb's half-width a distance `s` along it (fphand's thumb), `girth` times as thick."""
    Lm, Lp, Ld = fphand.THUMB_LEN
    g = np.interp(s, [-0.014, 0.012, Lm, Lm + Lp, Lm + Lp + Ld], [1.25, 1.18, 0.9, 0.82, 0.76])
    return fphand.THUMB_R[0] * g * girth


def _thumb_lames(m, s, girth=1.0):
    """A lame over each of the thumb's bones, each as wide as the thumb where it starts, so the thick root is covered
    too."""
    a = np.array([fphand.THUMB_ROOT[0], fphand.THUMB_ROOT[1], WRIST + fphand.THUMB_ROOT[2]])
    d = fphand._unit(fphand.THUMB_WAY)
    up = np.array([-0.55, 0.8, 0.0])
    up = up - d * (up @ d)
    Lm, Lp, Ld = fphand.THUMB_LEN
    cuts = (-0.004, Lm, Lm + Lp, Lm + Lp + Ld)
    for j in range(3):
        head, foot = _thumb_w(cuts[j], girth), _thumb_w(cuts[j + 1], girth)
        sleeve(m, a + d * (cuts[j] - 0.003), a + d * cuts[j + 1], foot * 1.12 + 0.0022, up, 1.85, 0.0012, PLATE,
               rows=4 if j == 2 else 3, cols=11, flare=max(0.08, head / foot - 1.0), tip=j == 2)


def _palm_back(u):
    """The palm's back at a share `u` of the way from the wrist to the knuckles (fphand's palm): its half-width and its
    height."""
    w = np.interp(u, [-0.3, 0.0, 0.35, 0.7, 1.0], [0.029, 0.031, 0.04, 0.044, 0.045])
    h = np.interp(u, [-0.3, 0.0, 0.6, 1.0], [0.021, 0.021, 0.017, 0.016]) + 0.004 * np.exp(-0.5 * ((u - 0.55) / 0.3) ** 2)
    return w, h


def _back_lames(m, s):
    """Three lames over the back of the hand, each over the next toward the knuckles, and a plate across the knuckles,
    studded, ridged or spiked by the culture."""
    K = fphand.KNUCKLES
    for j, (u0, u1) in enumerate(((-0.05, 0.34), (0.3, 0.62), (0.58, 0.86))):
        rows = []
        for u in np.linspace(u0, u1, 4):
            w, h = _palm_back(u)
            xs = np.linspace(-0.97, 0.97, 15)
            lift = 0.0032 + 0.0011 * (2 - j)
            rows.append([(x * w, h * (1 - np.abs(x) ** 3.2) ** (1 / 3.2) + lift, WRIST + u * K) for x in xs])
        g = np.array(rows)
        solid(m, g, 0.0014, PLATE, closed=False, inward=lambda gg: np.broadcast_to([0.0, -1.0, 0.0], gg.shape))
        tube(m, g[-1], 0.0011, _trim(s), n=4)
        if s.get('rivets'):
            for q in g[1][[1, 13]]:
                dome(m, q, 0.0022, (0.0, 1.0, 0.2), PLATE)
    zk = WRIST + K - 0.009
    g = sleeve(m, (-0.046, 0.003, zk), (0.043, 0.003, zk), 0.019, (0.0, 1.0, 0.25), 1.2, 0.0016, PLATE, rows=3, cols=9)
    tube(m, g[:, 0], 0.0011, _trim(s), n=4)
    tube(m, g[:, -1], 0.0011, _trim(s), n=4)
    for x in fphand.FINGER_X:
        q = np.array([x, 0.0235, zk + 0.002])
        if s.get('knuckles') == 'spikes':
            spike(m, q, q + np.array([0.0, 0.016, 0.006]), 0.0045, PLATE, n=5)
        elif s.get('knuckles') == 'studs':
            dome(m, q, s.get('stud', 0.0036), (0.0, 1.0, 0.2), PLATE)
        elif s.get('knuckles') == 'ridge':
            spike(m, q - np.array([0.0, 0.002, 0.0]), q + np.array([0.0, 0.006, 0.004]), 0.004, PLATE, n=4)
    if s.get('knuckles') == 'bar':   # one smooth bar raised across the knuckles, the light laid along its top
        tube(m, g[:, 1] + np.array([0.0, 0.0018, 0.0]), 0.0024, PLATE, n=6)


def _cuff(m, s, k, r, cuff_z, vambrace=True):
    """The gauntlet's cuff: from the heel of the hand down over the vambrace, its mouth closed on the vambrace under it,
    never a bucket open round the forearm, rolled (or toothed) there, picked out where the culture draws lines or
    flutes. With no vambrace under it (a held hand's), its mouth closes on the sleeve itself."""
    top, mouth = WRIST + 0.008, cuff_z - 0.05
    z = np.linspace(top, mouth, 9)
    t = (top - z) / (top - mouth)
    th = np.linspace(0.0, TAU, 49)[:-1]
    sec = _section(s, th)
    # the vambrace's girth at the mouth (`_vambrace`, its keel on its back), or the sleeve's where there is none, and
    # only its plate's thickness over it
    vamb = fparm._sleeve_r(mouth / WRIST, r) * (1.06 if vambrace else 1.02)
    a0, b0 = 0.033 * k, 0.025 * k   # its top, close round the heel of the hand
    a1 = max(a0, vamb + 0.0022)
    b1 = max(b0, 0.9 * vamb * (1.0 + 0.05 + 0.5 * s.get('keel', 0.0)) + 0.0022)
    rows = []
    for zi, ti in zip(z, t):
        a = a0 + (a1 - a0) * ti ** 1.5
        b = b0 + (b1 - b0) * ti ** 1.5
        rr = sec * (1 + keel(th, 0.08 * min(1.0, s.get('keel', 0.0) / 0.006), 0.4, math.pi / 2))
        zz = np.full(len(th), zi)
        if ti == 1.0 and s.get('teeth'):
            zz = zz - teeth(th, 0.35 * s['teeth'][0], s['teeth'][1])
        rows.append(np.stack([a * rr * np.cos(th), b * rr * np.sin(th), zz], axis=1))
    g = np.array(rows)
    solid(m, g, 0.0016, PLATE, closed=True, inward=lambda gg: np.concatenate([-gg[..., :2], np.zeros(gg.shape[:-1] + (1,))], axis=-1))
    lip = g[-1] + np.concatenate([g[-1][:, :2] / np.linalg.norm(g[-1][:, :2], axis=1, keepdims=True) * 0.001,
                                  np.zeros((len(th), 1))], axis=1)
    tube(m, lip, max(s.get('edge', 0.0), 0.0018) * 0.7, _trim(s), n=5, closed=True)
    for j in np.linspace(0, len(th), s.get('cuff_rivets', 0), endpoint=False).astype(int):   # a ring of rivets by its mouth
        p = g[-3, j]
        dome(m, p, 0.0026, (p[0], p[1], 0.0), PLATE)
    if s.get('trimlines') or s.get('flutes'):
        for a0 in np.linspace(math.pi / 2 - 0.9, math.pi / 2 + 0.9, 5 if s.get('flutes') else 2):
            j = int(round(a0 / TAU * len(th))) % len(th)
            tube(m, g[1:-1, j] * np.array([1.03, 1.03, 1.0]), 0.0012, _trim(s), n=4)


def _vambrace(m, s, k, r, cuff_z, start=0.035):
    """The vambrace up the forearm from `start` (below the elbow) into the cuff: a plate tube in the culture's
    section, keeled down its back, its top rolled; rivets, flutes, a glowing seam, spikes along its ridge where the
    culture wears them."""
    z = np.linspace(start, WRIST - 0.012, 30)   # on up inside the cuff, so no glove shows in the cuff's mouth
    t = z / WRIST
    base = fparm._sleeve_r(t, r) * 1.06 + 0.003 * np.clip((start + 0.04 - z) / 0.04, 0.0, 1.0) ** 2   # barely flared
    # at its top, by the elbow: a wide bell there read as the cuff open round the arm
    joins = (0.3, 0.52)   # where its plates are joined
    if s.get('stepped'):   # in lames, each lapped over the one toward the wrist, a step at each join
        base = base * (1.0 + 0.022 * sum((z < start + q * (WRIST - 0.012 - start)) for q in joins))
    # its end toward the elbow turned in to close on the sleeve: seen down the arm (a held torch's, a shield's) an
    # open end reads as a bell gaping round it
    sleeve = fparm._sleeve_r(t, r) * 1.03
    base = base - (base - sleeve) * np.clip((start + 0.014 - z) / 0.014, 0.0, 1.0) ** 0.7
    th = np.linspace(0.0, TAU, 61)[:-1]
    sec = _section(s, th)
    kh = 0.05 + 0.5 * s.get('keel', 0.0)
    rows = [np.stack([b * sec * (1 + keel(th, kh, 0.38, math.pi / 2)) * np.cos(th),
                      0.9 * b * sec * (1 + keel(th, kh, 0.38, math.pi / 2)) * np.sin(th),
                      np.full(len(th), zi)], axis=1) for zi, b in zip(z, base)]
    g = np.array(rows)
    body = SHADE if s.get('dark_vambrace') else PLATE   # dark, its rims, flutes and rivets bright, as a dark bracer is
    solid(m, g, 0.002, body, closed=True, inward=lambda gg: np.concatenate([-gg[..., :2], np.zeros(gg.shape[:-1] + (1,))], axis=-1))
    out = lambda row: row + np.concatenate([row[:, :2] / np.linalg.norm(row[:, :2], axis=1, keepdims=True) * 0.0012,   # noqa: E731
                                            np.zeros((len(row), 1))], axis=1)
    tube(m, out(g[0]), max(s.get('edge', 0.0), 0.002) * 0.8, _trim(s), n=5, closed=True)
    seen = int(0.62 * len(z))   # how far up it shows below the cuff's mouth
    for zi in joins:   # bands round it, where its plates are joined: a lame's rolled foot, where it is stepped
        j = int(zi * (len(z) - 1))
        bold = s.get('stepped') or s.get('bold_bands')   # a lame's rolled foot, or a raised band (the dwarves')
        tube(m, out(g[j]), max(s.get('edge', 0.0), 0.002) * (0.8 if s.get('stepped') else 0.7) if bold else 0.0011,
             _trim(s), n=5, closed=True)
    ridge = len(th) // 4
    for q in s.get('buckled', ()):   # leather straps round it, buckled on its back, as a vambrace is strapped on
        j = int(q * (len(z) - 1))
        band = np.array([out(g[i]) for i in (j - 1, j, j + 1)]) * np.array([1.025, 1.025, 1.0])
        solid(m, band, 0.0018, DARK, closed=True,
              inward=lambda gg: np.concatenate([-gg[..., :2], np.zeros(gg.shape[:-1] + (1,))], axis=-1))
        p = band[1, ridge + 7]
        n = np.array([p[0], p[1], 0.0]) / max(np.hypot(p[0], p[1]), 1e-9)
        box(m, p + n * 0.0015, (0.012, 0.014, 0.003), n, (0.0, 0.0, 1.0), PLATE)   # its buckle
    if s.get('rivets'):
        for side in (ridge - 9, ridge + 9):
            for j in range(3, seen, 4):
                p = g[j, side]
                dome(m, p, 0.0024, (p[0], p[1], 0.0), PLATE)
    boss = int(0.45 * seen) if s.get('spirals') else None   # a spiral boss on its back, half way to the cuff
    if s.get('flutes'):
        for side in (ridge - 5, ridge - 2, ridge + 2, ridge + 5):
            if boss is not None and abs(side - ridge) < 4:   # the inner pair stop short of the boss and go on past it
                tube(m, out(g[2:boss - 3, side]), 0.0011, _trim(s), n=4)
                tube(m, out(g[boss + 4:seen, side]), 0.0011, _trim(s), n=4)
                continue
            tube(m, out(g[2:seen, side]), 0.0011, _trim(s), n=4)
    if boss is not None:
        p = out(g[boss])[ridge]
        _spiral(m, p, (p[0], p[1], 0.0), 0.017)
    if s.get('glow'):
        for side in (ridge - 6, ridge + 6):
            tube(m, out(g[3:seen, side]), 0.0012, GLOW, n=4)
    if s.get('spikes') or s.get('knuckles') == 'spikes':
        for j in (5, 10, 15):
            p = g[j, ridge]
            spike(m, p, p + np.array([0.0, 0.018, 0.008]), 0.004, PLATE, n=5)
    if s.get('fins') == 'arms':   # ebony's: blades off the vambrace's outer edge, swept back toward the elbow
        for j, length in ((9, 0.05), (16, 0.042)):   # (its rows run from the elbow to the wrist)
            p = g[j, 0]
            spike(m, p, p + np.array([0.6, 0.15, -1.0]) / math.hypot(0.6, 0.15, 1.0) * length, 0.007, PLATE, n=6)


def hand_pieces(material, thumb=1.0, forearm=0.035):
    """The plate a set's gauntlet lays over the arm (`fparm.arm`'s `armour`): its pieces, by the hand's piece each
    rides; `thumb` the thumb's girth, as the hand's; its vambrace from `forearm` up the arm, or none (None)."""
    s = style(material)

    def make(k, r, cuff_z):
        wrist = np.array([0.0, 0.0, WRIST])
        grow = lambda v: wrist + (v - wrist) * k   # noqa: E731
        out = []
        for i in range(4):
            m = Mesh()
            _finger_lames(m, s, i)
            out += [(grow(v), t, slot, fphand.PIECES.index(f'f{i}')) for v, t, slot, _ in _split(m, 0)]
        m = Mesh()
        _thumb_lames(m, s, thumb)
        _back_lames(m, s)
        out += [(grow(v), t, slot, fphand.PIECES.index('palm')) for v, t, slot, _ in _split(m, 0)]
        m = Mesh()
        _cuff(m, s, k, r, cuff_z, vambrace=forearm is not None)
        if forearm is not None:
            _vambrace(m, s, k, r, cuff_z, forearm)
        out += _split(m, -1)
        return out
    return make


def leather_pieces(material, forearm=0.1):
    """A leather set's arm: its glove and its sleeve, and a leather bracer over the forearm from `forearm` up, or none
    (None): laced, or (`bracer` 'strapped', the thieves') a snug leather bracer, two straps round it."""
    s = style(material)

    def make(k, r, cuff_z):
        if forearm is None:
            return []
        m = Mesh()
        if s.get('bracer') in ('strapped', 'banded', 'laced'):   # snug round the sleeve, its mouths closed on it
            z = np.linspace(forearm - 0.02, cuff_z - 0.002, 18)
            th = np.linspace(0.0, TAU, 41)[:-1]
            base = fparm._sleeve_r(z / WRIST, r) * 1.16
            g = np.array([np.stack([b * np.cos(th), 0.92 * b * np.sin(th), np.full(len(th), zi)], axis=1)
                          for zi, b in zip(z, base)])
            out = lambda gg: np.concatenate([-gg[..., :2], np.zeros(gg.shape[:-1] + (1,))], axis=-1)   # noqa: E731
            solid(m, g, 0.0024, PLATE, closed=True, inward=out)   # open: the thieves' in the glove's leather, its
            # straps in the boot's; the brotherhood's banded the other way, crimson in the boot's leather, black bands
            for j in (0, len(z) - 1):   # its ends rolled, and two straps round it
                tube(m, g[j] * np.array([1.02, 1.02, 1.0]), 0.0016, DARK, n=4, closed=True)
            for j in (4, 9, 14) if s.get('bracer') == 'laced' else (5, 12):   # the mages' three lacings round
                band = np.array([g[i] * np.array([1.035, 1.035, 1.0]) for i in (j - 1, j, j + 1)])
                solid(m, band, 0.0016, DARK, closed=True, inward=out)
            body, bands = (BASE + STRAP, 1) if s.get('bracer') == 'banded' else (1, BASE + STRAP)
            return [(v, t, body if slot == BASE + PLATE else bands, -1) for v, t, slot, _ in _split(m, -1)]
        z = np.linspace(forearm, cuff_z - 0.002, 18)
        th = np.linspace(0.0, TAU, 41)[:-1]
        base = fparm._sleeve_r(z / WRIST, r) * 1.36   # past the sleeve's deepest creases
        g = np.array([np.stack([b * np.cos(th), 0.92 * b * np.sin(th), np.full(len(th), zi)], axis=1)
                      for zi, b in zip(z, base)])
        solid(m, g, 0.002, DARK, closed=True,
              inward=lambda gg: np.concatenate([-gg[..., :2], np.zeros(gg.shape[:-1] + (1,))], axis=-1))
        for j in range(2, len(z) - 1, 3):   # its lacing, crossing down its back
            p = g[j, len(th) // 4]
            dome(m, p, 0.0025, (0.0, 1.0, 0.0), DARK)
        return [(v, t, 1, -1) for v, t, _, _ in _split(m, -1)]   # in the glove's own leather
    return make


def chain_pieces(material):
    """A chain set's arm: its mail sleeve and glove (the outfit's), and a dark leather strap (DARK) buckled snug
    round the glove's cuff, as the set's third-person trims are leather."""
    def make(k, r, cuff_z):
        m = Mesh()
        z = np.linspace(cuff_z + 0.003, cuff_z + 0.013, 4)
        th = np.linspace(0.0, TAU, 41)[:-1]
        a = fparm._sleeve_r(cuff_z / WRIST, r) * 1.06 + 0.0035   # snug over the glove's cuff (fparm._gauntlet)
        g = np.array([np.stack([a * np.cos(th), 0.86 * a * np.sin(th), np.full(len(th), zi)], axis=1) for zi in z])
        solid(m, g, 0.003, DARK, closed=True,
              inward=lambda gg: np.concatenate([-gg[..., :2], np.zeros(gg.shape[:-1] + (1,))], axis=-1))
        p = g[1, len(th) // 4]
        dome(m, p + np.array([0.0, 0.002, 0.003]), 0.004, (0.0, 1.0, 0.0), PLATE)   # its buckle, on the wrist's back
        return _split(m, -1)
    return make


# -- the kick

def _foot_frame(S):
    """The foot's frame in the leg's space, as the boot's own (fpmodel._boot): the ankle, and heel-to-toe, up (the
    instep) and across, and the boot's girth and the foot's length."""
    r = S['boot_r']
    a = math.radians(S['ankle'])
    f = np.array([0.0, -math.sin(a), math.cos(a)])
    up = np.array([0.0, 0.0, -1.0]) - f * (-f[2])
    up /= np.linalg.norm(up)
    side = np.cross(up, f)
    return np.array([0.0, 0.0, fpmodel.SHIN]), f, up, side, r, S['foot']


def _sabaton(m, s, S):
    """The sabaton over the boot's own foot: rings fitted to it along its length, over its top from side to side (the
    culture's section): a heel cup, four lames from the ankle each over the next, a toe cap shaped as the culture
    shapes it, and a dark sole under all."""
    fv, _ = fpmodel._blob_mesh('foot', fpmodel._foot_blobs, 0.003)
    fv = fpmodel._foot_form(fv)
    O = Outline(fv, np.zeros(len(fv), dtype=int))
    heel, toe = fv[:, 2].min() + 0.004, fv[:, 2].max() - 0.004
    over = np.linspace(-0.35, math.pi + 0.35, 25)
    under = np.linspace(math.pi + 0.35, TAU - 0.35, 11)
    full = np.linspace(0.0, TAU, 73)[:-1]

    def rows(zs, gap, th):
        out = []
        for z in zs:
            c, rr = O.at([0], z, 0.006)
            r = np.interp(np.mod(th, TAU), full, rr, period=TAU) * _section(s, th) + gap
            r = r + keel(th, 0.25 * s.get('keel', 0.0), 0.4, math.pi / 2)
            out.append(np.stack([c[0] + r * np.cos(th), c[1] + r * np.sin(th), np.full(len(th), z)], axis=1))
        return np.array(out)

    def inward(gg):
        d = gg.mean(axis=1, keepdims=True) - gg
        d[..., 2] = 0
        return d

    def shut(g, zs, scales, drop=0.0):
        last = g[-1]
        c = last.mean(axis=0)
        extra = []
        for k, (z, sc) in enumerate(zip(zs, scales)):
            row = c + (last - c) * sc
            row[:, 2] = z
            row[:, 1] -= drop * (k + 1) / len(zs)
            extra.append(row)
        return np.concatenate([g, extra])

    cup = shut(rows(np.linspace(0.03, heel, 5), 0.004, over), [heel - 0.006, heel - 0.01], [0.65, 0.2])
    solid(m, cup, 0.0018, PLATE, closed=False, inward=inward)
    solid(m, rows(np.linspace(heel, toe, 14), 0.003, under), 0.004, DARK, closed=False, inward=inward)
    n = 4
    ys = np.linspace(0.02, toe - 0.06, n + 1)
    for j in range(n):
        g = rows(np.linspace(ys[j] - 0.008, ys[j + 1], 3), 0.004 + 0.0014 * (n - j), over)
        solid(m, g, 0.0018, PLATE, closed=False, inward=inward)
        tube(m, g[-1], max(s.get('edge', 0.0), 0.0018) * 0.7, _trim(s), n=4)
        if s.get('rivets'):
            for q in g[1][[2, len(over) - 3]]:
                dome(m, q, 0.0026, (q[0], q[1], 0.0), PLATE)
    cap = rows(np.linspace(toe - 0.065, toe, 5), 0.004, over)
    make = s.get('toe', 'round')
    if make == 'point':
        cap = shut(cap, toe + np.array([0.01, 0.021, 0.03]), [0.8, 0.5, 0.14], drop=0.008)
    elif make == 'square':
        cap = shut(cap, toe + np.array([0.005, 0.009]), [0.96, 0.3])
    else:
        cap = shut(cap, toe + np.array([0.006, 0.011]), [0.72, 0.25])
    solid(m, cap, 0.0018, PLATE, closed=False, inward=inward)
    tube(m, cap[0], max(s.get('edge', 0.0), 0.0018) * 0.7, _trim(s), n=4)
    if make == 'claw':
        for a in (math.pi / 2 - 0.7, math.pi / 2, math.pi / 2 + 0.7):
            q = cap[4, int(np.argmin(np.abs(over - a)))]
            spike(m, q, q + np.array([0.0, -0.006, 0.04]), 0.006, PLATE, n=5)


def _greave(m, s, S):
    """The greave round the shin from under the knee to over the ankle, keeled down its front (-Y), its top and foot
    rolled, flared a little over the instep; a poleyn's cop over the knee, winged; rivets, a seam's glow, a spike on
    the knee where the culture wears them."""
    r = S['boot_r']
    z = np.linspace(0.1, fpmodel.SHIN + 0.012, 28)
    near = np.clip((z - 0.22) / (fpmodel.SHIN - 0.22), 0.0, 1.0)
    a = (0.084 - 0.012 * near) * r + 0.012 * np.clip((z - fpmodel.SHIN + 0.04) / 0.05, 0.0, 1.0)
    b = (0.077 - 0.01 * near) * r + 0.012 * np.clip((z - fpmodel.SHIN + 0.04) / 0.05, 0.0, 1.0)
    th = np.linspace(0.0, TAU, 61)[:-1]
    sec = _section(s, th)
    kh = 0.06 + 0.6 * s.get('keel', 0.0)
    ring = sec * (1 + keel(th, kh, 0.4, -math.pi / 2 + TAU))
    g = np.array([np.stack([ai * ring * np.cos(th), bi * ring * np.sin(th), np.full(len(th), zi)], axis=1)
                  for zi, ai, bi in zip(z, a, b)])
    solid(m, g, 0.0022, PLATE, closed=True,
          inward=lambda gg: np.concatenate([-gg[..., :2], np.zeros(gg.shape[:-1] + (1,))], axis=-1))
    out = lambda row: row + np.concatenate([row[:, :2] / np.linalg.norm(row[:, :2], axis=1, keepdims=True) * 0.0015,   # noqa: E731
                                            np.zeros((len(row), 1))], axis=1)
    for j in (0, len(z) - 1):
        tube(m, out(g[j]), max(s.get('edge', 0.0), 0.002) * 0.9, _trim(s), n=5, closed=True)
    front = 3 * len(th) // 4
    if s.get('rivets'):
        for side in (front - 10, front + 10):
            for j in range(3, len(z) - 3, 5):
                p = g[j, side]
                dome(m, p, 0.003, (p[0], p[1], 0.0), PLATE)
    if s.get('trimlines') or s.get('flutes'):
        for side in (front - 5, front + 5):
            tube(m, out(g[2:-2, side]), 0.0014, _trim(s), n=4)
    if s.get('bold_bands'):   # raised bands round it over the ankle and under the knee
        for j in (4, len(z) - 6):
            tube(m, out(g[j]), max(s.get('edge', 0.0), 0.002) * 0.7, _trim(s), n=5, closed=True)
    if s.get('glow'):
        for side in (front - 7, front + 7):
            tube(m, out(g[3:-3, side]), 0.0015, GLOW, n=4)
    # the poleyn: a cop over the knee, its foot over the greave's top
    cz = np.linspace(-0.02, 0.12, 9)
    cop = []
    for zi in cz:
        u = (zi - 0.05) / 0.07
        bump = 0.018 * max(0.0, 1 - u * u)
        tc = np.linspace(-math.pi / 2 - 1.4, -math.pi / 2 + 1.4, 25)
        rr = (0.086 * r + bump * np.cos((tc + math.pi / 2) / 1.4 * math.pi / 2) ** 2)
        cop.append(np.stack([rr * np.cos(tc), 0.95 * rr * np.sin(tc), np.full(len(tc), zi)], axis=1))
    cop = np.array(cop)
    solid(m, cop, 0.0022, PLATE, closed=False,
          inward=lambda gg: np.concatenate([-gg[..., :2], np.zeros(gg.shape[:-1] + (1,))], axis=-1))
    tube(m, cop[-1], max(s.get('edge', 0.0), 0.002) * 0.8, _trim(s), n=5)
    if s.get('spikes'):
        p = cop[4, 12]
        spike(m, p, p + np.array([0.0, -0.04, 0.01]), 0.008, PLATE, n=5)
    if s.get('spirals'):   # a spiral boss at its heart
        p = cop[4, 12]
        _spiral(m, p, (p[0], p[1], 0.0), 0.022)


def leg(material):
    """A set's kicking leg (fpmodel's boot part): its leggings, the greave and poleyn, and the sabaton over the foot,
    the foot bent at the ankle as the boot's is. Leather and chain keep the leather boot, chain over mail chausses."""
    s = style(material)

    def make(S):
        kind = s.get('kind', 'plate')
        if kind != 'plate':
            v, t, mm = fpmodel._boot(S)
            if kind == 'chain':
                mm = np.where(mm == 3, BASE + MAIL, mm)
            return v, t, mm
        base = BASE
        r = S['boot_r']
        zl = np.linspace(0.0, 0.14, 12)
        lv, lt = fpmodel._axis_loft(zl, 0.07 * r * np.ones(len(zl)), 0.064 * r * np.ones(len(zl)), caps=(True, False),
                                    n=36)
        pieces = [(lv, lt, base + MAIL if s.get('under') == 'mail' else 3)]
        m = Mesh()
        _greave(m, s, S)
        v, t, sl = _tris(m)
        for slot in np.unique(sl):
            pieces.append((v, t[sl == slot], base + int(slot)))
        m = Mesh()
        _sabaton(m, s, S)
        fv, ft, fs = _tris(m)
        ankle, f, up, side, rr, k = _foot_frame(S)
        fv = ankle + np.outer(fv[:, 0] * rr * 1.06, side) + np.outer(fv[:, 1] * rr * 1.06, up) + np.outer(fv[:, 2] * k, f)
        v, t, mm = fpmodel._join(pieces)
        FOOT[0] = len(fv)   # the foot's vertices come last: the ankle's bend turns them (fpmodel._ankle)
        return np.concatenate([v, fv]), np.concatenate([t, ft + len(v)]), np.concatenate([mm, base + fs])
    return make


FOOT = [0]   # how many of the kicking leg's last vertices are its foot's, which the ankle bends


# -- wearing a set

# what each set's arm wears under its plate: leather a glove and a linen sleeve, chain mail, plate a mail glove and
# sleeve
OUTFITS = {'Leather': ('linen', 'gauntlet'), 'Chain': ('mail_sleeve', 'mail_glove'),
           'plate': ('mail_sleeve', 'glove_under'), 'Thieves': ('leather_sleeve', 'gauntlet'),
           'Brotherhood': ('leather_sleeve', 'gauntlet'), 'Mages': ('leather_sleeve', 'gauntlet')}
# plate's and mail's light onto Daggerfall's metal band, its shadowed side in the band's darker steps and its lit side
# climbing to its bright ones. The plate's a frame at a time (`share`): one fixed ramp flooded a frame its lamp lit
# full on (the idle fist) and left one it lit from behind (the raised fist) at the band's floor, black under a dark dye
METAL_GRADE = {'plate': {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0], [44.0, 56.0, 84.0, 112.0, 150.0, 196.0, 224.0]]},
               # the dark plate wholly off the band, in its own blue-blacks to a dull blue-grey at its glints (fpforge
               # `shade`), which no dye lifts: a light ramp's darkest step is still pale
               'shade': {'share': [[1.0, 99.0], [44.0, 162.0]],
                         'shade': [256.0, [[0.0, 160.0], [0.0, 1.0], [0.0, 0.35, 0.7, 1.0],
                                           [[12, 12, 18], [28, 28, 40], [56, 56, 74], [112, 112, 134]]]]},
               'mail': {'lum': [[0.0, 20.0, 60.0, 120.0, 200.0, 255.0], [46.0, 60.0, 84.0, 116.0, 168.0, 214.0]]},
               # a strap as the fists' boot, in every picture: the boot's grade is the fists' alone
               'strap': json.load(open(SPEC[:-len('.json')] + '-grade.json'))['boot']}


def _plate_material(polish=False, grey=0.5):
    """Plate as the forge draws a metal: grey, the lamp's light on it with a little sheen, graded onto Daggerfall's
    metal band and dyed in the game. Polished (a set's close-up `polish`), it is grey still, but a horizon is
    reflected in each face over the lamp's highlight, so its faces turn dark and bright with their slope as a
    mirror's do."""
    import materials
    name = 'plate' if grey == 0.5 else 'shade'
    if polish:
        return materials.polished(name, (grey, grey, grey), rough=0.3)
    return materials.plain(name, (grey, grey, grey), metal=0.1, rough=0.45, spec=0.45)


RING = 0.02   # a mail ring's size: five pixels on the forearm, so it reads as a ring and never as grain
ARMOUR_CLASSES = {'plate': 5, 'mail': 5, 'shade': 5, 'strap': 7}   # plate and mail read as metal: graded grey, dyed in
# the game; a strap as the boot it is cut from


def grades(material):
    """How a set's plate and mail are graded: METAL_GRADE, with the set's own close-up `grade` over it."""
    return {**METAL_GRADE, **style(material).get('grade', {})}


def dressed(palette, material=None):
    """`palette` with an armour set's own materials beside it (EXTRA): plate (polished, where `material`'s set is),
    a daedric seam's glow, mail and the dark of a sole or a slit."""
    s = style(material) if material else {}
    polish = s.get('polish', False)
    under = s.get('under') if s.get('cloth_legs') else None   # the kick's leggings in the cloth it wears under its plate

    def seam():   # a set's own seam (daedric's dull deep red, armour.py `seam`), a little light of its own, else the glow
        if not s.get('seam'):
            return None
        import materials
        import metals
        colour, strength = s['seam']
        m = materials.plain('seam', metals._linear(colour), rough=0.6, spec=0.2)
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = (*metals._linear(colour), 1)
        b.inputs['Emission Strength'].default_value = strength
        return m

    def more():
        import fpmetals
        import materials
        import metals
        M = palette()
        legs = {'legging': materials.plain('legging', metals._linear(under[1]), rough=0.85, spec=0.15)} if under else {}
        import fpmodel as fm   # a set's own glove and boot leather (the brotherhood's black glove, crimson boot), as the
        for key, own in (('gauntlet', s.get('glove_leather')), ('boot', s.get('boot_leather'))):   # palette's are made
            if own:
                legs[key] = fm._leather(key, *own, scale=70.0 if key == 'gauntlet' else 45.0, rough=0.6, crease=0.5,
                                        period=0.022, width=0.08, bump=0.15, ridge_lift=0.03, patches=0.05)
        own = s.get('boot_leather')   # a strap in the boot's leather, the set's own or the palette's
        legs['strap'] = (fm._leather('strap', *own, scale=45.0, rough=0.6, crease=0.5, period=0.022, width=0.08,
                                     bump=0.15, ridge_lift=0.03, patches=0.05) if own else
                         fm._leather('strap', (0.17, 0.05, 0.025), (0.32, 0.14, 0.06), scale=45.0, rough=0.5,
                                     crease=0.2, period=0.03, width=0.2, bump=0.9, ridge_lift=0.16, patches=0.06))
        return {**M, **legs, 'plate': _plate_material(polish), 'shade': _plate_material(polish, 0.2), 'glow': seam() or fpmetals._glow(), 'mail': M.get('mail') or
                materials.rings('mail', (0.12, 0.12, 0.12), (0.65, 0.65, 0.65), pitch=RING),
                'dark': materials.plain('dark', (0.09, 0.05, 0.026), rough=0.75, spec=0.2)}   # a strap's, a sole's
    return more


def wear(material):
    """Put `material`'s set on the fists' arm and the kicking leg: their parts and materials, and plate and mail read
    as metal (graded grey, dyed in the game). Gives back what to restore."""
    import fpforge
    s = style(material)
    kind = s.get('kind', 'plate')
    outfit = OUTFITS.get(material, OUTFITS['plate'])
    armour = (lambda S: chain_pieces(material) if kind == 'chain' else leather_pieces(material) if kind == 'leather'
              else hand_pieces(material, S.get('thumb') or 1.0))
    base, palette, classes, load = dict(fpmodel.WEAPONS['fists']), fpmodel.palette, dict(fpforge.CLASSES), fpforge.load
    fpmodel.WEAPONS['fists'] = {
        **base,
        'parts': {'fist': lambda S: fparm.arm(S['fist'], S['arm_r'], 'R', outfit=outfit, cuff=S.get('cuff'),
                                              thumb=S.get('thumb'), armour=armour and armour(S)),
                  'boot': leg(material)},
        'mats': fparm.mats(outfit) + ('boot', 'legging') + EXTRA,
    }
    fpmodel.palette = dressed(palette, material)
    fpforge.CLASSES.update(ARMOUR_CLASSES)
    ankle = fpmodel._ankle
    if kind == 'plate':   # the sabaton's vertices, not the boot's foot's, turn at the ankle
        fpmodel._ankle = lambda S=None: (len(fpmodel.arrays('fists', S, 'boot')[0]) - FOOT[0],
                                         np.array([0.0, 0.0, fpmodel.SHIN]), np.array([1.0, 0.0, 0.0]))

    def graded(path):   # the plate's and mail's grade where the archive has none, and a set's own over both
        spec = load(path)
        if 'boot' in fpforge.GRADE:   # a strap as this picture's own boot
            fpforge.GRADE.setdefault('strap', fpforge.GRADE['boot'])
        for n, g in METAL_GRADE.items():
            fpforge.GRADE.setdefault(n, g)
        fpforge.GRADE.update(s.get('grade', {}))
        own = {n: g for n, g in s.get('grade', {}).items() if n in ('gauntlet', 'boot', 'strap')}   # a set's own glove
        for table in (*fpforge.RECORD_GRADE.values(), *fpforge.FRAME_GRADE.values()):     # leather (the brotherhood's)
            table.update({n: g for n, g in own.items() if n in table})                     # and boot over a record's
        return spec
    fpforge.load = graded
    return base, palette, classes, load, ankle


def unwear(saved):
    import fpforge
    fpmodel.WEAPONS['fists'], fpmodel.palette, classes, fpforge.load, fpmodel._ankle = saved
    fpforge.CLASSES.clear()
    fpforge.CLASSES.update(classes)


def main():
    import bpy  # noqa: F401
    import armour
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--spec', default=SPEC)
    ap.add_argument('--materials', default=','.join(m for m in armour.MATERIALS if m != 'Leather'))
    ap.add_argument('--records', default='')
    ap.add_argument('--samples', type=int, default=64)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    import fpforge
    for material in [m for m in args.materials.split(',') if m]:
        work = tempfile.mkdtemp(prefix=f'fparmour-{material}-')
        saved = wear(material)
        try:
            sys.argv = ['fpforge.py', '--spec', args.spec, '--out', work, '--samples', str(args.samples),
                        '--records', args.records]
            fpforge.main()
        finally:
            unwear(saved)
        for name in sorted(os.listdir(work)):
            stem, ext = os.path.splitext(name)
            shutil.move(os.path.join(work, name), os.path.join(args.out, f'{stem}_{material}{ext}'))
        os.rmdir(work)
        print(f'{material}: its frames into {args.out}', flush=True)


if __name__ == '__main__':
    main()
