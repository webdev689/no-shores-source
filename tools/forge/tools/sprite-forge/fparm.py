"""The first-person forge's arm: the one arm every first-person picture with a hand in it wears, the punches
(WEAPON10.CIF's fists) and the climbing hands alike. Its look is its garments: one covers the forearm (the arm's
layer), one the hand (the hand's layer). An outfit names a garment for each layer; armour is a garment more, so a
gauntlet or a vambrace swaps without touching the rest. Under them is fphand.py's jointed hand. A right arm is the left
one mirrored.

The arm's space is fpmodel's: the elbow at the origin, the forearm up +Z to the wrist at WRIST, the back of the hand
+Y, a left hand's thumb toward -X."""
import numpy as np

import fphand

WRIST = fphand.WRIST
LAYERS = ('arm', 'hand')           # drawn in this order: the hand's garment over the arm's
OUTFIT = ('linen', 'gauntlet')     # what the arm wears unless armour says otherwise


def _sleeve_r(t, r):
    """The sleeve's girth a share `t` of the way from the elbow to the wrist: loose toward the elbow, as wide as the
    wrist where it meets the glove."""
    return (0.05 - 0.016 * t) * r


def _sleeve(k, r, cuff_z):
    """A linen sleeve from the elbow to the wrist, inside the glove's cuff: creased as cloth creases, the creases
    deeper and closer where it bunches toward the wrist, and drawn smooth where the cuff closes on it."""
    from fpmodel import _axis_loft
    z = np.linspace(0.0, cuff_z + 0.012 * k, 64)
    t = z / WRIST
    rad = _sleeve_r(t, r)
    bunch = np.clip((z - (cuff_z - 0.09)) / 0.09, 0.0, 1.0)
    gather = np.clip((cuff_z - 0.004 - z) / 0.016, 0.0, 1.0)   # drawn smooth into the cuff, never through it
    return _axis_loft(z, rad, rad * 0.88, caps=(True, False), n=48,
                      swell=lambda i, th: gather[i] * _creases(z[i], th, bunch[i]))


# a sleeve's creases: (along, phase, weight, fade) - along in radians a metre; fade how far a set dies out on one side
_CREASES = ((150.0, 0.3, 1.0, 0.2), (118.0, 2.1, 0.55, 0.7), (205.0, 4.0, 0.3, 0.9), (88.0, 5.2, 0.35, -0.6))


def _creases(z, th, bunch):
    """Creases as a sleeve pushed up the arm buckles, never two alike: chevrons whose points wander round the arm
    (near its top, +Y, the back of the hand's side), climbing steeper on one side than the other, each set at its own
    wavering spacing and dying out on one side or the other; sharp valleys, broad ridges between. Under them the sleeve
    hangs fuller on one side and drapes slowly."""
    point = np.pi / 2 + 0.55 * np.sin(z * 23.0 + 0.7) + 0.3 * np.sin(z * 61.0 + 2.0)
    rel = (th - point + np.pi) % (2 * np.pi) - np.pi                  # round from the point, signed
    climb = np.abs(rel) * np.where(rel > 0, 2.9, 1.6)               # one side steeper than the other
    wave, total = 0.0, 0.0
    for a, p, w, fade in _CREASES:
        side = 1.0 - abs(fade) * (0.5 + 0.5 * np.tanh(3.0 * rel * np.sign(fade)))
        wave = wave + w * side * (2.0 * np.abs(np.sin(a * z + climb + p + 0.7 * np.sin(z * 37.0 + p))) ** 0.6 - 1.0)
        total += w
    lopsided = 0.05 * np.cos(th - 0.9) + 0.03 * np.sin(z * 14.0 + 0.9 * np.cos(th))
    return (0.15 + 0.1 * bunch) * wave / total + lopsided


TUCK = 0.004   # how far past the wrist a glove's cuff runs, turned in under the hand, a unit of hand size


def _gauntlet(k, r, cuff_z, c, still=False):
    """The glove's cuff, as Daggerfall draws it: a short band hugging the sleeve's end at the wrist, its edge a small
    roll, widening only as far as the wrist inside it. The hand above it is fphand's, gloved. `still`: a gauntlet's
    cuff, plate or mail, which does not wrinkle or slouch."""
    from fpmodel import loft
    lip = _sleeve_r(cuff_z / WRIST, r)
    top = WRIST - 0.002 * k
    # how far the cuff runs past the wrist's band: a long one is a gauntlet's, wide to the heel of the hand
    long = np.clip((top - cuff_z - 0.06) / 0.08, 0.0, 1.0)
    # (height over the rim, across, deep): the rim rolled onto the sleeve, then hugging it up to the wrist's own girth
    # rings enough for its wrinkles at any length (a record's own cuff keeps the part's vertices: fpforge.Eye.drawn)
    # past the top its rim is turned in under the hand, so no gap shows into the cuff from above either
    gz = np.linspace(-0.002, top - cuff_z + TUCK * k, 120)
    rise = np.clip(gz / max(top - cuff_z, 1e-6), 0.0, 1.0)
    tuck = np.clip((gz - (top - cuff_z)) / (TUCK * k), 0.0, 1.0)
    z = cuff_z + gz
    # what it hugs: the sleeve's end, or for a long cuff the forearm as it narrows to the wrist
    hug = 1.06 * (lip + (_sleeve_r(z / WRIST, r) - lip) * long * 0.5)
    # its mouth turned in to the sleeve and under it, so no gap shows into the cuff from any side
    across = np.where(gz > 0.003, hug, np.interp(gz, [-0.002, 0.0, 0.003], [lip * 0.96, lip * 1.07, lip * 1.06]))
    wrist = (0.03 + 0.005 * long) * k
    across = np.maximum(across, (hug + (wrist - hug) * rise ** 2) * (gz >= 0.0))
    deep = across * np.interp(rise, [0.0, 1.0], [0.88, 0.72]) * (1.0 - 0.2 * tuck)
    across = across * (1.0 - 0.16 * tuck)
    # a long cuff meets the heel flush, as wide and where it sits (a little toward the thumb and the palm): no ledge
    centre = np.stack([-0.004 * k * long * rise ** 3, -0.003 * k * long * rise ** 3, z], axis=1)
    # a cuff far longer than the wrist's band cannot hold its shape: it slouches in deep folds down its length, faded at
    # its rim (still tucked under) and at the wrist (still inside the hand)
    slouch = long * np.clip(gz / 0.01, 0.0, 1.0) * np.clip((top - cuff_z - gz) / 0.03, 0.0, 1.0)
    u, w = np.tile([1.0, 0.0, 0.0], (len(z), 1)), np.tile([0.0, 1.0, 0.0], (len(z), 1))
    if still:
        return loft(centre, u, w, across * 1.06, deep * 1.06, n=40)
    fold = lambda i, th: 0.25 * rise[i] * _wrinkles(z[i], th) + slouch[i] * _slouch(z[i], th)
    return loft(centre, u, w, across, deep, n=40, swell=lambda i, th: (1.0 - tuck[i]) * fold(i, th))


def _wrinkles(z, th):
    """A gauntlet's cuff wrinkles: creases ringing it, a little slanted, sharp in their valleys and broad between, as
    leather bunches at a bent wrist."""
    ring = 2.0 * np.abs(np.sin(z * 200.0 + 0.6 * np.cos(th) + 0.4 * np.sin(2 * th))) ** 0.6 - 1.0
    return 0.035 * ring + 0.012 * np.sin(z * 520.0 + th)


def _slouch(z, th):
    """A long cuff's folds: broad rings slanting round the arm and wandering as they go, sharp in their valleys, each
    deep on one side and fading round the other, so no two read alike."""
    way = 1.1 * np.cos(th - 0.4) + 0.8 * np.sin(2.0 * th + z * 30.0) + 0.5 * np.sin(z * 41.0 + th)
    ring = 2.0 * np.abs(np.sin(z * 105.0 + way)) ** 0.7 - 1.0
    return 0.07 * ring * (0.6 + 0.4 * np.sin(th + z * 63.0))


def _vambrace(k, r, cuff_z):
    """A vambrace: a plate tube over the forearm from below the elbow to past the wrist, flared at its top, a raised
    band round it near the wrist. Plate holds its shape: no creases."""
    from fpmodel import _axis_loft
    z = np.linspace(0.01, cuff_z + 0.02 * k, 48)
    t = z / WRIST
    rad = _sleeve_r(t, r) * 1.12 + 0.012 * np.clip((0.06 - z) / 0.05, 0.0, 1.0) ** 2
    band = 0.004 * np.exp(-((z - (cuff_z - 0.03)) / 0.006) ** 2)
    return _axis_loft(z, rad + band, (rad + band) * 0.9, caps=(True, False), n=40)


def _fur(k, r, cuff_z):
    import fpclaws
    return fpclaws.fur_sleeve(k, r, cuff_z)


def _mail_sleeve(k, r, cuff_z):
    """A mail sleeve: the sleeve's girth and length, its rings lying flat (the material draws them), no creases."""
    from fpmodel import _axis_loft
    z = np.linspace(0.0, cuff_z + 0.012 * k, 48)
    rad = _sleeve_r(z / WRIST, r) * 1.04
    return _axis_loft(z, rad, rad * 0.9, caps=(True, False), n=40)


# each garment: the layer it covers, the material it is drawn in, and how it is made: a sleeve's creased linen, a
# vambrace's or a mail sleeve's plain tube; a glove's wrinkled cuff, or a gauntlet's or a mail glove's still one
GARMENTS = {
    'linen': {'layer': 'arm', 'mat': 'linen', 'make': 'sleeve'},
    # a leather sleeve in the set's under-leather (the thieves' jacket sleeve), as its kick's leggings are
    'leather_sleeve': {'layer': 'arm', 'mat': 'legging', 'make': 'sleeve'},
    'gauntlet': {'layer': 'hand', 'mat': 'gauntlet', 'make': 'glove'},
    'vambrace': {'layer': 'arm', 'mat': 'plate', 'make': 'vambrace'},
    'mail_sleeve': {'layer': 'arm', 'mat': 'mail', 'make': 'mail_sleeve'},
    'plate': {'layer': 'hand', 'mat': 'plate', 'make': 'plate'},
    'mail_glove': {'layer': 'hand', 'mat': 'mail', 'make': 'plate'},
    # a plate gauntlet's glove, held still: mail, as a gauntlet's plates ride a mail glove, so where it shows between
    # them it reads as the mail under the plate, the sleeve's own, not as a hole in the plate (leather, brown or black)
    'glove_under': {'layer': 'hand', 'mat': 'mail', 'make': 'plate'},
    # a werecreature's arm (fpclaws.py): its forearm a shaggy pelt, its hand the bare hand in the same fur
    'fur': {'layer': 'arm', 'mat': 'fur', 'make': 'fur'},
    'pelt': {'layer': 'hand', 'mat': 'pelt', 'make': 'glove'},
}
BEAST = ('fur', 'pelt')   # the werecreature's outfit
# what the arm wears for each armour material (tools/sprite-forge/armour.py `MATERIALS`): leather the glove and sleeve
# it always had, chain mail, plate a vambrace and a gauntlet
ARMOUR = {'Leather': ('linen', 'gauntlet'), 'Chain': ('mail_sleeve', 'mail_glove')}


def mats(outfit=OUTFIT):
    """An outfit's materials, in the order its pieces' material indices count them."""
    return tuple(GARMENTS[g]['mat'] for g in outfit)


_RIGS = {}   # (hand size, cuff, vertices) -> the arm's rig, made with its mesh


def arm(k, r, side='L', outfit=OUTFIT, cuff=None, thumb=None, fingers=None, slim=None, armour=None, fused=False):
    """The arm in `outfit`, its hand grown `k`, its sleeve `r`, its glove's cuff `cuff` long (by default as the hand):
    (vertices, triangles, material index a triangle), its fingers straight (`posed` bends them). `armour(k, r, cuff_z)`
    lays plate over it (fparmour.py): (vertices, triangles, its material's index among the weapon's, the hand's piece
    each vertex rides, -1 the forearm). `fused`: the hand one surface (fphand.fused), no seam at its knuckles. A right
    arm is the left mirrored, its faces turned to keep facing out."""
    from fpmodel import _join
    c = k if cuff is None else cuff
    cuff_z = WRIST - 0.022 * c   # where the hand's garment opens over the arm's: a glove's short cuff at the wrist
    if armour:   # a gauntlet's glove ends at the wrist in every record, under its plate (the rig keeps the record's cuff)
        cuff_z = WRIST - 0.022 * k
    wrist = np.array([0.0, 0.0, WRIST])
    out, piece = [], []
    for g in outfit:
        layer, m, make = GARMENTS[g]['layer'], outfit.index(g), GARMENTS[g]['make']
        if layer == 'arm':
            v, t = {'sleeve': _sleeve, 'vambrace': _vambrace, 'mail_sleeve': _mail_sleeve, 'fur': _fur}[make](k, r, cuff_z)
            out.append((v, t, m))
            piece.append(np.full(len(v), -1))
        else:
            v, t = _gauntlet(k, r, cuff_z, c, still=make != 'glove')
            out.append((v, t, m))
            piece.append(np.full(len(v), -1))
            long = 1.0 if fingers is None else fingers
            girth = (1.0 if thumb is None else thumb, long, 1.0 if slim is None else slim)
            if fused:   # one surface, no seam at a knuckle
                hv, ht, hp = fphand.fused(*girth)
                out.append((wrist + (hv - wrist) * k, ht, m))
                piece.append(hp)
                continue
            for i, (name, (hv, ht)) in enumerate(fphand.meshes(*girth).items()):
                assert fphand.PIECES[i] == name
                out.append((wrist + (hv - wrist) * k, ht, m))
                piece.append(np.full(len(hv), i))
    for v, t, m, p in (armour(k, r, cuff_z) if armour else ()):
        out.append((v, t, m))
        piece.append(np.asarray(p) if np.ndim(p) else np.full(len(v), p))
    v, q, m = _join(out)
    _RIGS[(k, c, len(v))] = fphand.rig(v, np.concatenate(piece), k, 1.0 if fingers is None else fingers, fused)
    if side == 'R':
        return v * np.array([-1.0, 1.0, 1.0]), q[:, ::-1].copy(), m
    return v, q, m


MIRROR = np.array([-1.0, 1.0, 1.0])


def posed(v, pose, k, side='L', cuff=None):
    """The arm's rest vertices `v` with the hand bent as `pose` bends its joints (fphand.JOINTS): a right arm is bent as
    the left is, and mirrored back."""
    c = k if cuff is None else cuff
    if (k, c, len(v)) not in _RIGS:
        return v
    R = _RIGS[(k, c, len(v))]
    if side == 'R':
        return fphand.pose(v * MIRROR, R, pose) * MIRROR
    return fphand.pose(v, R, pose)


def has_rig(k, c, n):
    return (k, c, n) in _RIGS
