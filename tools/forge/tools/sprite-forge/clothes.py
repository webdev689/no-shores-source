"""The wardrobe: every garment Daggerfall's players wear, men's and women's, each made over the shaped body from the
clothing kit. What clings is a shell of the body (clothkit.py), skinned with it; what hangs free is a drape made again
each frame (drape.py): a skirt, a robe below its belt, a cloak, a hood, a bell of a sleeve. Each garment is named for
the template it stands for and draws its own detail: hems turned and rolled, laces, buckles, belts, sashes, fur, gilt.

Every garment keeps to its band off the skin, so whatever is worn over it lies outside it: tights and the suit nearest,
then breeches and trousers, boots and shoes over them, shirts, then tunics, vests and surcoats, then belts and straps.
Armour lies over all of them, and robes and cloaks over armour.

The cloth is drawn in a dye's grey so the game can dye it, as Daggerfall dyes clothing; its leather, metal, fur and
embroidery keep their colours."""
import math

import numpy as np

import fabric
import materials
import metals
from clothkit import PIECE, TAU, Shell, around, blend, facing, ripple
from rig import arm_z

FRONT = -math.pi / 2
# landmarks at rest (the shaped body's heights, metres)
NECK_Z, CHEST_Z, WAIST_Z, HIP_Z, CROTCH_Z = 1.495, 1.33, 1.12, 0.97, 0.84
HIP_ROUND = 1.0   # metres round the hips, about: what a woven skirt's pattern is read round
KNEE_Z, CALF_Z, ANKLE_Z = 0.55, 0.36, 0.095
SHOULDER_Z, ELBOW_Z = 1.45, 1.165
WRIST_Z = arm_z(0.985)
# each garment's band off the skin (metres): its ease at its tightest, over which the next band lies
BAND = {'skin': 0.0018, 'legs': 0.0045, 'feet': 0.0085, 'shirt': 0.0055, 'over': 0.011, 'belt': 0.016}
SLOT = {'cloth': 0, 'hem': 1, 'leather': 2, 'gilt': 3, 'iron': 4, 'inside': 5, 'accent': 6, 'fur': 7, 'sole': 8,
        'hide': 9}

GREY = 0.3   # the cloth's grey for the game to dye: its lit side near the top of a dye's ramp, its shade near the foot
# Daggerfall's clothing band, the sixteen steps a dye's ramp is laid on, darkest first: the brightness of its mages'
# robe's own (TEXTURE.486, ART_PAL.COL 0x8f..0x80). A cloth texel lands on its nearest step, drawn grey at that step
# (16 of grey a step) for the dye to read; darker than the foot, in a crease or a patch, it is shadow, kept at its own
# light in the palette's blacks, which no dye touches, as Daggerfall's robes and cloaks fold into black
CLOTH_BAND = (47.0, 53.3, 57.7, 63.0, 68.7, 73.7, 84.0, 92.7, 103.3, 113.3, 120.3, 131.7, 149.7, 169.3, 187.3, 209.0)
CLOTH_SHADOW = 44
CREASE = 3   # the fewest pixels, touching, of a shadow kept black: a crease a pixel wide, never a lone dot
# the cloth's light share for share onto Daggerfall's mages' robe and cloak (TEXTURE.486, 485): a tenth in the black
# of their deepest folds, most of it low on the band, the lit tops toward its head. Measured on the hooded robe and
# cloak rendered `--ungraded` (raw brightness at each share, then Daggerfall's at the same share)
CLOTH_GRADE = {'lum': [[0.0, 16.0, 22.0, 41.0, 82.0, 119.0, 154.0, 176.0, 190.0, 199.0, 204.0, 255.0],
                       [0.0, 19.0, 19.0, 31.0, 47.0, 65.9, 79.6, 106.0, 136.4, 174.4, 212.0, 220.0]]}
CLOTH = {'linen': ((0.62, 0.62, 0.62), 0.85), 'wool': ((0.55, 0.55, 0.55), 0.95), 'silk': ((0.7, 0.7, 0.7), 0.4),
         'velvet': ((0.5, 0.5, 0.5), 0.75)}


# -- materials

def _op(nt, op, a, b=None, v=None):
    n = nt.nodes.new('ShaderNodeMath')
    n.operation = op
    nt.links.new(a, n.inputs[0])
    if b is not None:
        nt.links.new(b, n.inputs[1])
    if v is not None:
        n.inputs[1].default_value, n.inputs[2].default_value = v
    return n.outputs[0]


PATTERN_SCALE = {'diamonds': 30.0, 'chevrons': 90.0, 'grid': 110.0, 'stripes': 70.0}   # radians a metre
# the diamonds a few texels across at a sprite's size: finer, each one breaks into a lone gold speck


def _pattern(name, base, accent, kind, scale=None, rough=0.8):
    """Cloth woven or printed in a pattern read from its rest position: 'stripes' down it, 'diamonds' in a lattice,
    'chevrons' across it, a 'grid' of squares; the base is the dye's, the accent its own colour. Folded as plain
    cloth is."""
    m, b = materials._principled(name, base, 0.0, rough, 0.0)
    nt = m.node_tree
    scale = scale or PATTERN_SCALE[kind]
    vec = materials._coords(m, (scale, scale, scale))
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(vec, sep.inputs['Vector'])
    op = lambda o, a, bb=None, v=None: _op(nt, o, a, bb, v)   # noqa: E731
    X, Z = sep.outputs['X'], sep.outputs['Z']
    if kind == 'stripes':
        f = op('SINE', X)
    elif kind == 'chevrons':
        f = op('SINE', op('ADD', Z, op('ABSOLUTE', X)))
    elif kind == 'grid':
        f = op('MULTIPLY', op('SINE', X), op('SINE', Z))
    else:   # diamonds
        f = op('MULTIPLY', op('SINE', op('ADD', X, Z)), op('SINE', op('SUBTRACT', X, Z)))
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.0, (*base, 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.62, (*accent, 1)
    nt.links.new(op('MULTIPLY_ADD', f, None, (0.5, 0.5)), ramp.inputs['Fac'])
    fabric.folded(m, b, ramp.outputs['Color'])
    return fabric.occluded(m)


def cloth_material(name, rgb):
    """Cloth as Daggerfall draws it at a sprite's size (fabric.py): matte, in a few broad folds where it lies on the
    body, each a lit ridge beside a dark crease, darkest where it closes round itself, its tone broad and smooth.
    No weave, mottle or sheen: the grade stretches the cloth's light, so a grain turns to speckle and a sheen lights
    the edges Daggerfall leaves dark."""
    return fabric.occluded(fabric.cloth(name, rgb, rough=1.0, spec=0.0, mottle=0.03))


def palette(cloth='linen', dye=None, accent=(0.85, 0.66, 0.2), pattern=None):
    """A garment's materials by slot (SLOT): its cloth, its hem's a shade darker, leather, gilt, iron, the shadow
    inside it, an accent cloth (an embroidery, a lining's colour), fur, a sole, and the hide a shoe, a belt or a strap
    is made of, dyed as its cloth is. `dye` draws the cloth in a colour (a preview); else a dye's grey. `pattern`
    weaves it ('stripes', 'diamonds', 'chevrons', 'grid') with the accent."""
    rgb, rough = CLOTH[cloth]
    if dye is not None:
        rgb = dye
    lin = metals._linear
    base = (_pattern(f'garb.{cloth}.{pattern}', rgb, accent, pattern, rough=1.0) if pattern else
            cloth_material(f'garb.{cloth}', rgb))
    return [base,
            cloth_material(f'garb.{cloth}.hem', tuple(c * 0.72 for c in rgb)),
            fabric.leather('leather.cloth', lin((92, 58, 32)), rough=0.6, spec=0.35),
            materials.plain('blade.gilt', lin((214, 172, 72)), metal=0.9, rough=0.28),
            materials.plain('steel.iron', lin((90, 90, 96)), metal=0.7, rough=0.45),
            # the inside a shade under the cloth, not black: its own shadow already darkens it, and dyed any darker
            # it lands on the ramp's blacks and a skirt's open hem reads as a hole
            cloth_material('garb.inside', tuple(c * 0.55 for c in rgb)),
            # its own colour, never dyed, but graded as the cloth is (layers.py `ACCENT`)
            cloth_material('accent.trim', accent),
            fabric.fur('accent.fur', lin((112, 88, 62))),   # graded as the cloth is, in its own colour, never dyed
            materials.plain('leather.sole', lin((40, 28, 20)), rough=0.85, spec=0.1),
            # every garment takes its item's dye (the owner's), its leather too: DFU's ImageProcessing.ChangeDye swaps
            # only the 0x60 band, which Daggerfall's vest, sash, trousers, footwear and straps are not drawn in
            fabric.leather('garb.hide', rgb, rough=0.6, spec=0.35)]


# -- folds and wrinkles: metres along the normal, never below the cloth's line

def _bump(z, at, half):
    return np.cos(np.clip((np.asarray(z) - at) / half, -1, 1) * math.pi / 2) ** 2


def _limb_angle(p):
    return np.arctan2(p[:, 1], p[:, 0] - np.sign(p[:, 0]) * 0.1)


def wrinkles(p, bands, depth=0.0022, sharp=0.6):
    """Creases ringing a limb where it bends: for each (height, half-width, count) a set round it, slanting and
    wandering, sharp in their valleys."""
    z = p[:, 2]
    th = _limb_angle(p)
    out = np.zeros(len(p))
    for at, half, k in bands:
        w = _bump(z, at, half) * (0.55 + 0.45 * np.cos(th - 0.9 - at * 7))   # deeper on one side of the limb
        along = (z - at) / (2 * half) * TAU + 0.8 * np.sin(th * 2 + at * 30) + 0.35 * th
        out = out + depth * w * ripple(along, k, seed=at * 17)
    return out


def drapes(p, top, bottom, count=11, depth=0.0018):
    """Long folds falling from `top` to `bottom`, deepest at the foot, each wavering: a shirt's slack, a robe's."""
    z = p[:, 2]
    t = np.clip((top - z) / max(top - bottom, 1e-6), 0.0, 1.0)
    return depth * t ** 1.5 * ripple(around(p) + 0.35 * np.sin(z * 9.0), count, seed=top * 7)


def gathers(p, at, half, count=16, depth=0.002):
    """Cloth gathered into a band (a cuff, a waist): short close pleats either side of it."""
    return depth * _bump(p[:, 2], at, half) * ripple(around(p) + 0.2 * np.sin(p[:, 2] * 60), count, seed=at * 5)


# -- fields over the body (negative inside the garment)

def neckline(p, depth=0.03, back=0.0, width=1.0, z=NECK_Z - 0.01):
    """The neck's edge: round at `z`, drawn down `depth` at the front in a curve `width` radians wide, and `back`
    behind."""
    th = around(p)
    fr = np.cos(np.clip(facing(th) / width, 0, 1) * math.pi / 2) ** 1.5
    bk = np.cos(np.clip(facing(th, math.pi / 2) / 1.2, 0, 1) * math.pi / 2) ** 1.5
    return p[:, 2] - (z - depth * fr - back * bk)


def torso(p, top, hem, depth=0.03, back=0.0, width=1.0, opening=0.0):
    """The torso from `hem` to its neckline (or straight round at the height `top`); `opening` metres of an open front
    either side of the middle, widening a little as it falls."""
    f = np.maximum(hem - p[:, 2], neckline(p, depth, back, width) if top is None else p[:, 2] - top)
    if opening:
        gap = opening + 0.02 * np.clip((NECK_Z - p[:, 2]) / 0.4, 0, 1)
        f = np.maximum(f, np.where(p[:, 1] < -0.02, gap - np.abs(p[:, 0]), -1.0))
    return f


def to(end):
    """A limb down to the height `end` (inside above it)."""
    return lambda p: end - p[:, 2]


def slab(p, centre, normal, width):
    """Inside a band `width` across, between two planes: a strap over a shoulder, a sash, an armband."""
    n = np.asarray(normal, float)
    n = n / np.linalg.norm(n)
    return np.abs((p - np.asarray(centre)) @ n) - width / 2


IN = lambda p: np.full(len(p), -1.0)   # noqa: E731
ARMS = ('arm_L', 'arm_R')
LEGS = ('leg_L', 'leg_R')
FEET = ('barefoot_L', 'barefoot_R')


def worn(body, mats, name, parts, push, thick=0.0022, folds=None, roll=0.0022, roll_slot=SLOT['hem'], extras=None,
         slots=None, painted=True):
    """A garment that clings: `parts` maps each piece to its field (a function of the rest points), the others lie
    outside it; every edge it leaves is rolled; `extras(shell)` lays its details on. `painted`, its cloth takes the
    painted folds (fabric.py); skin-tight, it is smooth as the body under it, as Daggerfall's tights are."""
    sh = Shell(body, lambda p, a: blend(a, {k: f(p) for k, f in parts.items()}), push, thick, folds)
    if roll:
        for loop in sh.loops():
            sh.roll(loop, roll, roll_slot)
    if extras:
        extras(sh)
    sk = sh.skinned(name, mats, slots)
    if painted:   # where each vertex lies on the body at rest: its cloth's folds are drawn from it
        fabric.mark(sk.me, sk.base)
    return sk


def _all(slot):
    return lambda c: np.full(len(c), slot)


# -- details laid on a shell

def _near_front(sh, z, x=0.0, tol=0.012):
    cand = np.nonzero((np.abs(sh.rest[:, 2] - z) < tol) & (sh.rest[:, 1] < -0.03))[0]
    return cand[np.argmin(np.abs(sh.rest[cand, 0] - x))] if len(cand) else None


def _cord(sh, ids, radius, slot, n=4):
    """A cord along shell vertices `ids`: a lace, a thread."""
    pts = sh.p[ids] + sh.n[ids] * radius * 1.5
    rings = []
    for i, q in enumerate(pts):
        t = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        t /= max(np.linalg.norm(t), 1e-9)
        u = sh.n[ids[i]] - t * (sh.n[ids[i]] @ t)
        u /= max(np.linalg.norm(u), 1e-9)
        w = np.cross(t, u)
        rings.append([q + radius * (math.cos(a) * u + math.sin(a) * w) for a in np.linspace(0, 2 * math.pi, n, endpoint=False)])
    v = np.array(rings).reshape(-1, 3)
    tris = []
    for i in range(len(pts) - 1):
        for k in range(n):
            a, b, c, d = i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k
            tris += [(a, b, c), (a, c, d)]
    sh.add(v, tris, slot, np.repeat(ids, n))


def _stud(sh, i, size, slot, depth=None):
    """A small block on the shell at vertex `i`: a buckle, a button, a clasp, a gem."""
    c, n = sh.p[i], sh.n[i]
    up = np.array([0.0, 0.0, 1.0]) - n * n[2]
    up /= max(np.linalg.norm(up), 1e-9)
    side = np.cross(up, n)
    sx, sy = size
    sz = depth or min(sx, sy) * 0.35
    v = [c + side * x * sx / 2 + up * y * sy / 2 + n * zz for zz in (0.0, sz) for y in (-1, 1) for x in (-1, 1)]
    faces = [(0, 1, 3), (0, 3, 2), (4, 6, 7), (4, 7, 5), (0, 4, 5), (0, 5, 1), (2, 3, 7), (2, 7, 6), (0, 2, 6),
             (0, 6, 4), (1, 5, 7), (1, 7, 3)]
    sh.add(v, faces, slot, [i] * 8)


def edge_band(body, mats, name, parts, push, slot=SLOT["hem"], roll=0.0016, folds=None):
    """A band laid over a garment's edge: a cuff, a collar, a waistband, a boot's turned top."""
    return worn(body, mats, name, parts, push, thick=0.0024, folds=folds, roll=roll, roll_slot=slot, slots=_all(slot))


def laces(sh, low, high, crosses=4, half=0.018, slot=SLOT['leather'], radius=0.0012):
    """A lace `radius` metres thick across an opening at the front, zigzagging between eyelets either side from `high`
    down to `low`."""
    ids = [i for k, z in enumerate(np.linspace(high, low, crosses * 2))
           for i in [_near_front(sh, z, half * (1 if k % 2 else -1))] if i is not None]
    if len(ids) > 2:
        _cord(sh, ids, radius, slot)


def buttons(sh, top, bottom, count=5, slot=SLOT['gilt']):
    for z in np.linspace(top, bottom, count):
        i = _near_front(sh, z)
        if i is not None:
            _stud(sh, i, (0.009, 0.009), slot)


def buckle(sh, slot=SLOT['gilt'], size=(0.04, 0.032)):
    """A belt's buckle at the front of its band."""
    i = _near_front(sh, float(np.median(sh.rest[:, 2])), tol=0.02)
    if i is not None:
        _stud(sh, i, size, slot, depth=0.006)


# -- the garments

def shirt(body, mats, name, sleeve='long', neck='v', hem=HIP_Z + 0.02, opening=0.0, lace=True, cuffs=True, band='shirt',
          puff=0.0, off_shoulder=False):
    """A shirt or a blouse: the torso from its hem to its neckline and the arms to the sleeves' end (long, short, to the
    elbow, cap, none), eased below the chest, gathered at the cuffs; its neck round, a V laced across, deep, high,
    square, or open down the front; `puff` metres of fullness in its sleeves (a blouse's); `off_shoulder` cut round the
    shoulders."""
    end = {'long': WRIST_Z + 0.012, 'short': ELBOW_Z + 0.1, 'elbow': ELBOW_Z + 0.02, 'cap': SHOULDER_Z - 0.06,
           'none': None}[sleeve]
    depth, width = {'v': (0.13, 0.9), 'deep': (0.24, 0.8), 'round': (0.035, 1.2), 'high': (0.0, 1.0),
                    'square': (0.07, 1.5)}[neck]
    top = 1.39 if off_shoulder else None
    parts = {'torso': lambda p: torso(p, top, hem, depth, 0.02, width, opening)}
    if end is not None:
        parts.update({a: to(end) for a in ARMS})
    elif off_shoulder:
        parts.update({a: (lambda p: p[:, 2] - top) for a in ARMS})
    base = BAND[band]

    def push(p):
        e = base + 0.0045 * np.clip((CHEST_Z - p[:, 2]) / 0.25, 0, 1) * (1 - 0.6 * _bump(p[:, 2], WAIST_Z, 0.07))
        if puff:   # full in the sleeves, gathered above the elbow and at the cuff
            arm = (np.abs(p[:, 0]) > 0.17) & (p[:, 2] < 1.44)
            # full over the upper arm, a little fuller again above the cuff: never so full a vambrace cannot cover it
            e = e + arm * puff * (_bump(p[:, 2], 1.31, 0.11) + 0.35 * _bump(p[:, 2], 1.03, 0.1))
        return e

    def folds(p, n):
        arm = np.abs(p[:, 0]) > 0.17
        bands = ([(ELBOW_Z, 0.05, 3), (WRIST_Z + 0.04, 0.035, 3)] if sleeve == 'long' else
                 [(end + 0.03, 0.03, 2)] if end else [])
        f = wrinkles(p, bands) * arm + gathers(p, WAIST_Z, 0.06, 14, 0.0016) * ~arm
        f = f + drapes(p, CHEST_Z, hem, 11, 0.0016) * ~arm
        if cuffs and sleeve == 'long':
            f = f + gathers(p, WRIST_Z + 0.02, 0.02, 18, 0.0018) * arm
        if puff:
            f = f + arm * puff * 0.25 * ripple(_limb_angle(p) + 0.4 * np.sin(p[:, 2] * 30), 9, seed=3.0)
        return f

    def extras(sh):
        if lace and neck in ('v', 'deep') and not opening:
            laces(sh, NECK_Z - 0.01 - depth + 0.012, NECK_Z - 0.025)
    out = [worn(body, mats, name, parts, push, folds=folds, extras=extras)]
    if end is not None and sleeve in ('long', 'short', 'elbow') and not puff:   # its cuffs
        out.append(edge_band(body, mats, f'{name}_cuffs', {a: (lambda p: np.abs(p[:, 2] - (end + 0.016)) - 0.016) for a in ARMS},
                        lambda p: base + 0.0022, folds=lambda p, n: gathers(p, end + 0.016, 0.016, 16, 0.001)))
    if neck in ('round', 'square', 'high') and not off_shoulder:   # its collar band
        out.append(edge_band(body, mats, f'{name}_collar', {'torso': lambda p: np.abs(neckline(p, depth, 0.02, width) + 0.008) - 0.008},
                        lambda p: base + 0.002))
    return out


def vest(body, mats, name='vest', laced=True, hem=WAIST_Z - 0.03):
    """A vest: open down the front over the shirt, sleeveless, its armholes turned, laced across (or open), its gilt
    lace thick enough to read at a sprite's size."""
    def extras(sh):
        if laced:
            laces(sh, hem + 0.02, NECK_Z - 0.16, crosses=5, half=0.03, slot=SLOT['gilt'], radius=0.005)
    return [worn(body, mats, name, {'torso': lambda p: torso(p, None, hem, 0.18, 0.0, 0.7, opening=0.02)},
                 lambda p: BAND['over'] + 0.004 * np.clip((CHEST_Z - p[:, 2]) / 0.25, 0, 1), thick=0.003,
                 folds=lambda p, n: drapes(p, CHEST_Z, hem, 7, 0.0012), roll=0.0026, extras=extras)]


def belt(body, mats, name='belt', z=WAIST_Z - 0.01, width=0.035, sash=False, clasp=SLOT['gilt']):
    """A belt round the waist, buckled at the front (in `clasp`'s metal); a sash is wider and of cloth, gathered
    round."""
    slot = SLOT['cloth'] if sash else SLOT['hide']
    def extras(sh):
        if sash:
            return
        buckle(sh, clasp)
        for x in (0.035, 0.06):   # the strap's end through its keepers, beside the buckle
            i = _near_front(sh, z, x, 0.02)
            if i is not None:
                _stud(sh, i, (0.022, width * 0.7), SLOT['hide'], depth=0.004)
        i = _near_front(sh, z, -0.05, 0.02)
        if i is not None:
            _stud(sh, i, (0.007, width * 1.15), SLOT['hide'], depth=0.004)   # a keeper
    return [worn(body, mats, name, {'torso': lambda p: np.abs(p[:, 2] - z) - width / 2},
                 BAND['belt'] + (0.004 if sash else 0.0), thick=0.003,
                 folds=(lambda p, n: gathers(p, z, width, 22, 0.002)) if sash else None,
                 roll=0.0 if sash else 0.0015, roll_slot=SLOT['hide'], extras=extras, slots=_all(slot))]


def strap(body, mats, name, cross=False, belt_too=False, disc=False):
    """A leather strap across the chest from the left shoulder to the right hip and round the back (both ways if
    `cross`), a gilt disc at its crossing (`disc`), a belt (`belt_too`)."""
    def field(p):
        f = slab(p, (0.0, 0.0, 1.22), (0.62, 0.0, 0.78), 0.045)
        return np.minimum(f, slab(p, (0.0, 0.0, 1.22), (-0.62, 0.0, 0.78), 0.045)) if cross else f

    def extras(sh):
        if disc:
            i = _near_front(sh, 1.24, 0.0, 0.05)
            if i is not None:
                _stud(sh, i, (0.05, 0.05), SLOT['gilt'], depth=0.012)
    out = [worn(body, mats, name, {'torso': field}, BAND['belt'], thick=0.003, roll=0.0014, roll_slot=SLOT['hide'],
                extras=extras, slots=_all(SLOT['hide']))]
    return out + (belt(body, mats, f'{name}_belt') if belt_too else [])


def armbands(body, mats, name, fancy=False):
    """Gilt bands round the upper arms; `fancy`, wide cuffs round the wrists as well."""
    def field(p):
        f = np.abs(p[:, 2] - 1.33) - 0.012
        return np.minimum(f, np.abs(p[:, 2] - (WRIST_Z + 0.04)) - 0.022) if fancy else f
    return [worn(body, mats, name, {a: field for a in ARMS}, BAND['belt'], thick=0.003, roll=0.0018,
                 roll_slot=SLOT['gilt'], slots=_all(SLOT['gilt']))]


def sash(body, mats, name, waist=True):
    """A sash over the left shoulder down across the chest to the right hip, and wound round the waist."""
    out = [worn(body, mats, name, {'torso': lambda p: slab(p, (0.0, 0.0, 1.2), (0.55, 0.0, 0.83), 0.11)},
                BAND['over'] + 0.004, thick=0.003,
                folds=lambda p, n: 0.0025 * ripple((p[:, 0] * 0.83 - p[:, 2] * 0.55) * 40, 6, seed=5.0), roll=0.0)]
    return out + (belt(body, mats, f'{name}_waist', width=0.07, sash=True) if waist else [])


def pants(body, mats, name, length='ankle', baggy=0.0):
    """Trousers: from the waist over the hips and down each leg (to the ankle, the calf, the knee), wrinkled at the
    knees and bunched over the ankles; `baggy` metres of fullness over the thighs, gathered at the foot (breeches)."""
    foot = {'ankle': ANKLE_Z + 0.03, 'calf': 0.32, 'knee': KNEE_Z - 0.05}[length]
    parts = {'torso': lambda p: p[:, 2] - (WAIST_Z - 0.03), **{leg: to(foot) for leg in LEGS}}

    def push(p):
        e = BAND['legs'] + 0.0015 * np.clip((foot + 0.08 - p[:, 2]) / 0.08, 0, 1)
        if baggy:
            # full over the thigh above the knee, where breeches billow, close again over the hips
            e = e + baggy * _bump(p[:, 2], (HIP_Z + foot) / 2 - 0.02, (HIP_Z - foot) / 2 - 0.04) * (p[:, 2] < HIP_Z + 0.04)
        return e

    def folds(p, n):
        f = wrinkles(p, [(KNEE_Z, 0.06, 3), (foot + 0.05, 0.05, 4)], depth=0.0022)
        if baggy:   # its fullness folds over the thighs, gathered smooth into the band below the knee
            fade = np.clip((p[:, 2] - foot - 0.04) / 0.06, 0, 1)
            f = f + baggy * 0.35 * fade * ripple(_limb_angle(p) + p[:, 2] * 6, 7, seed=4.0)
        return f
    out = [worn(body, mats, name, parts, push, folds=folds, roll=0.0024)]
    out.append(edge_band(body, mats, f'{name}_waistband', {'torso': lambda p: np.abs(p[:, 2] - (WAIST_Z - 0.05)) - 0.02},
                    BAND['legs'] + 0.0025, folds=lambda p, n: gathers(p, WAIST_Z - 0.05, 0.02, 20, 0.0012)))
    if baggy:   # breeches gathered into a band below the knee
        out.append(edge_band(body, mats, f'{name}_garters', {leg: (lambda p: np.abs(p[:, 2] - (foot + 0.012)) - 0.012) for leg in LEGS},
                             BAND['legs'] + 0.0045))
    return out


def tights(body, mats, name='tights'):
    """Tights: the hips and legs to the ankle, skin-tight."""
    parts = {'torso': lambda p: p[:, 2] - (WAIST_Z - 0.05), **{leg: to(ANKLE_Z + 0.01) for leg in LEGS}}
    return [worn(body, mats, name, parts, BAND['skin'], thick=0.0012, roll=0.0012, painted=False)]


def suit(body, mats, name='khajiit_suit'):
    """A suit close as skin from the neck to the ankles and the wrists."""
    parts = {'torso': lambda p: torso(p, None, 0.0, 0.02, 0.0), **{a: to(WRIST_Z) for a in ARMS},
             **{leg: to(ANKLE_Z) for leg in LEGS}}
    return [worn(body, mats, name, parts, BAND['skin'], thick=0.0012, roll=0.0014,
                 folds=lambda p, n: wrinkles(p, [(ELBOW_Z, 0.04, 2), (KNEE_Z, 0.05, 2)], 0.0012), painted=False)]


def brassiere(body, mats, name, formal=False, gems=False):
    """A brassiere: its cups and a band under them round the back, straps over the shoulders; formal, of gilt set with
    gems."""
    def field(p):
        front = facing(around(p)) < 1.25
        band = np.abs(p[:, 2] - 1.335) - np.where(front, 0.055, 0.02)
        straps = np.minimum(slab(p, (0.07, 0, 0), (1, 0, 0), 0.014), slab(p, (-0.07, 0, 0), (1, 0, 0), 0.014))
        return np.minimum(band, np.where(p[:, 2] > 1.38, straps, 1.0))

    def extras(sh):
        if gems:
            for x, z in ((-0.06, 1.33), (0.06, 1.33), (0.0, 1.30)):
                i = _near_front(sh, z, x, 0.03)
                if i is not None:
                    _stud(sh, i, (0.012, 0.012), SLOT['accent'], 0.006)
    return [worn(body, mats, name, {'torso': field}, BAND['shirt'], thick=0.0025, roll=0.0016,
                 roll_slot=SLOT['gilt'] if formal else SLOT['hem'], extras=extras,
                 slots=_all(SLOT['gilt'] if formal else SLOT['cloth']))]


def loincloth(body, mats, name, long=False, top=HIP_Z - 0.05, hem=None, half=0.42, folds=5):
    """A loincloth: a band round the hips (or from `top`) and a cloth falling before and behind from it, each panel
    `half` radians either side of the front and the back, to `hem`."""
    import drape
    band = [worn(body, mats, f'{name}_band', {'torso': lambda p: np.abs(p[:, 2] - (top + 0.02)) - 0.022},
                 BAND['legs'] + 0.002, roll=0.0016)]
    hem = hem if hem is not None else 0.55 if long else 0.72
    return band + [drape.Skirt(name, mats, top, hem, ease=0.008, flare=0.02, folds=folds, fold_depth=0.12,
                               panels=[(-half, half), (math.pi - half, math.pi + half)])]


LONG_SKIRT = dict(hem=0.30, flare=0.0, folds=11, fold_depth=0.13, fall=0.98, ease=0.008)   # the long skirt's cut


def skirt(body, mats, name, top=WAIST_Z - 0.02, hem=0.1, flare=0.1, folds=12, belted=False, slit=False, ease=0.012,
          fold_depth=0.18, fall=0.95):
    """A skirt hung from the waist (or the hips) to `hem`, flaring, folded; `belted` buckled at its top, `slit` open up
    one side; `fold_depth` and `fall` as the drape's (drape.Skirt)."""
    import drape
    panels = [(-math.pi + 0.35, math.pi - 0.05)] if slit else None
    out = [drape.Skirt(name, mats, top, hem, ease=ease, flare=flare, folds=folds, panels=panels,
                       cinch=0.004 if belted else None, fold_depth=fold_depth, fall=fall)]   # a belt cinches its top
    return out + (belt(body, mats, f'{name}_belt', z=top - 0.005) if belted else [])


def hood(body, mats, name='hood', cloak=None, neck=None):
    """A hood over the head, open at the face, its tail falling behind, sewn to a cloak's collar (`cloak`) or a
    garment's neckline (`neck`, a robe's top); alone its cowl falls over the shoulders."""
    import drape
    return [drape.Hood(name, mats, body.rest[body.alpha[:, PIECE['skull']] > 0.5], cloak=cloak, neck=neck)]


def cloak(body, mats, name, hem=0.42, hooded=False, fur=False, short=False):
    """A cloak worn from the nape down the back to `hem` (a cape's to the hips, its hem barely wider than its
    shoulders, so it hangs flat), lined, its edges turned; `hooded`, its hood up;
    `fur`, a fur collar over its shoulders (a formal cloak's), or with its hood up a hood of fur and no collar, as
    Daggerfall's hooded formal cloak wears it."""
    import drape
    c = drape.Cloak(name, mats, hem=HIP_Z + 0.05 if short else hem, fullness=1.15 if short else 1.4)
    out = [c]
    if fur and hooded:
        furred = list(mats)
        furred[SLOT['cloth']] = furred[SLOT['hem']] = mats[SLOT['fur']]
        return out + hood(body, furred, f'{name}_hood', cloak=c)
    if fur:
        out.append(drape.Fur(f'{name}_fur', mats, c))
    return out + (hood(body, mats, f'{name}_hood', cloak=c) if hooded else [])


def robe(body, mats, name, hooded=False, sleeves='bell', hem=0.3, belted=True, stripes=False):
    """A robe: loose over the shoulders and chest, its sleeves belling from the elbow (or loose to it, `sleeves`
    'elbow'), its skirt hung from the belt to the feet; hooded, or (a priest's) with a band of stripes down its front
    from the collar to the hem."""
    import drape
    out = shirt(body, mats, f'{name}_top', 'elbow' if sleeves == 'elbow' else 'long', 'round', hem=WAIST_Z - 0.08,
                lace=False, band='over', puff=0.012 if sleeves == 'elbow' else 0.0)
    # drawn in at the waist by its cord; heavy wool, so it falls back in below a knee and its hem swings little
    skirt_ = drape.Skirt(f'{name}_skirt', mats, WAIST_Z, hem, ease=0.012, flare=0.02, folds=12, fold_depth=0.09,
                         cinch=0.004, fall=0.93)
    out += [skirt_]
    if stripes:   # the band down the front: on the chest a strip of the shell, on the skirt a panel over its front
        out += [worn(body, mats, f'{name}_stripe', {'torso': lambda p: np.maximum(
                     np.where(p[:, 1] < 0, np.abs(p[:, 0]) - 0.035, 1.0),
                     np.maximum(WAIST_Z - 0.1 - p[:, 2], p[:, 2] - (NECK_Z - 0.04)))},
                     BAND['over'] + 0.004, roll=0.0018, roll_slot=SLOT['accent'], slots=_all(SLOT['accent']))]
        out += [drape.Skirt(f'{name}_stripes', [mats[SLOT['accent']]] + list(mats[1:]), WAIST_Z, hem + 0.01,
                            ease=0.022, flare=0.055, folds=13, fold_depth=0.11, panels=[(-0.16, 0.16)], cols=12,
                            fall=0.93)]   # just outside the robe's skirt, falling as it falls
    if sleeves == 'bell':
        out += [drape.Bell(f'{name}_sleeve_{s}', mats, s, start=ELBOW_Z + 0.06, length=0.26, ease=0.012, flare=0.035)
                for s in 'LR']
    if belted:   # a rope belt round the skirt's top, knotted at the front, its ends hanging
        out += [drape.Cord(f'{name}_cord', mats, skirt_, row=1), drape.Tails(f'{name}_tails', mats, at=(0.03, -0.15, WAIST_Z - 0.02))]
    return out + (hood(body, mats, f'{name}_hood', neck=out[0]) if hooded else [])


def tunic(body, mats, name, sleeve='short', neck='square', hem=0.66, belted=True, split=True, band='over',
          woven=False):
    """A tunic: its body to the hips, its skirt hung on from there to `hem` (split up the sides, a tabard's), belted at
    the waist. `woven`: its skirt's pattern read over its own length and the hips' round, so it matches the body's."""
    import drape
    out = shirt(body, mats, f'{name}_top', sleeve, neck, hem=HIP_Z - 0.02, lace=False, band=band)
    panels = [(-1.35, 1.35), (math.pi - 1.35, math.pi + 1.35)] if split else None
    # a drape's rest spans a metre down: over a skirt a quarter that long, a weave's rows close up into stripes
    size = (HIP_ROUND, HIP_Z + 0.01 - hem) if woven else drape.REST_SIZE
    out += [drape.Skirt(f'{name}_skirt', mats, HIP_Z + 0.01, hem, ease=0.02, flare=0.05, folds=9, fold_depth=0.1,
                        panels=panels, size=size)]
    return out + (belt(body, mats, f'{name}_belt') if belted else [])


def gown(body, mats, name, sleeve='puff', neck='square', hem=0.1, flare=0.13, folds=18):
    """A gown: a close bodice to the waist, sleeves puffed (or long, or none), its skirt falling from the waist to the
    floor in deep folds."""
    import drape
    s, puff = {'puff': ('long', 0.022), 'long': ('long', 0.0), 'none': ('none', 0.0), 'cap': ('cap', 0.0)}[sleeve]
    out = shirt(body, mats, f'{name}_bodice', s, neck, hem=WAIST_Z - 0.06, lace=False, band='shirt', puff=puff,
                off_shoulder=sleeve == 'none')
    return out + [drape.Skirt(f'{name}_skirt', mats, WAIST_Z - 0.02, hem, ease=0.016, flare=flare, folds=folds,
                              fold_depth=0.2, rows=22, cols=96, cinch=0.006)]   # gathered close at the waist


def collar(body, mats, name, apron=False):
    """An eodoric: a gilt collar spread over the shoulders, and a gilt apron falling at the front from a girdle."""
    import drape
    field = lambda p: np.maximum(p[:, 2] - NECK_Z, 1.405 - p[:, 2])   # noqa: E731
    out = [worn(body, mats, f'{name}_collar', {'torso': field, **{a: field for a in ARMS}}, BAND['belt'] + 0.006,
                thick=0.004, roll=0.0028, roll_slot=SLOT['gilt'],
                folds=lambda p, n: 0.002 * (0.5 + 0.5 * np.sign(np.sin(around(p) * 36))), slots=_all(SLOT['gilt']))]
    if apron:
        out += belt(body, mats, f'{name}_girdle', z=HIP_Z, width=0.03)
        out += [drape.Skirt(f'{name}_apron', [mats[3]] + list(mats[1:]), HIP_Z - 0.02, 0.62, ease=0.01, flare=0.01,
                            folds=8, fold_depth=0.06, panels=[(-0.45, 0.45)])]
    return out


def toga(body, mats, name='toga'):
    """A toga: wound from under the right arm over the left shoulder and falling to the knees, belted."""
    import drape
    over = lambda p: np.maximum(slab(p, (0.0, 0.0, 1.25), (0.5, 0.0, 0.87), 0.36), p[:, 2] - NECK_Z)   # noqa: E731
    top = [worn(body, mats, f'{name}_top', {'torso': lambda p: np.minimum(over(p), torso(p, 1.2, HIP_Z, 0.0)),
                                             'arm_L': lambda p: 1.36 - p[:, 2]}, BAND['over'],
                folds=lambda p, n: 0.003 * ripple((p[:, 0] * 0.87 - p[:, 2] * 0.5) * 24, 6, seed=6.0))]
    return (top + [drape.Skirt(f'{name}_skirt', mats, HIP_Z + 0.06, KNEE_Z - 0.02, ease=0.02, flare=0.06, folds=10,
                               fold_depth=0.14)] + belt(body, mats, f'{name}_belt', z=WAIST_Z, width=0.04, sash=True))


def kimono(body, mats, name='kimono'):
    """A kimono: wrapped close over the chest, its sleeves belling, its skirt to the knee, a wide sash round the
    waist."""
    import drape
    out = shirt(body, mats, f'{name}_top', 'short', 'deep', hem=WAIST_Z - 0.08, lace=False, band='over')
    out += [drape.Bell(f'{name}_sleeve_{s}', mats, s, start=ELBOW_Z + 0.12, length=0.2, ease=0.012, flare=0.04)
            for s in 'LR']
    out += [drape.Skirt(f'{name}_skirt', mats, WAIST_Z - 0.02, KNEE_Z - 0.05, ease=0.016, flare=0.05, folds=10,
                        fold_depth=0.1)]
    return out + belt(body, mats, f'{name}_sash', z=WAIST_Z - 0.03, width=0.08, sash=True)


def shoes(body, mats, name, top=ANKLE_Z + 0.04, cuff=False, laced=False):
    """Shoes or boots: the foot and the leg to `top`, the leather creased at the ankle; a turned cuff at the top
    (`cuff`), laces up the front (`laced`)."""
    parts = {**{leg: (lambda p, t=top: p[:, 2] - t) for leg in LEGS}, **{f: IN for f in FEET}}

    def folds(p, n):
        return wrinkles(p, [(0.12, 0.035, 3)] + ([(top - 0.07, 0.06, 2)] if top > 0.25 else []), depth=0.0022)

    def extras(sh):
        if not laced:
            return
        for x0 in (0.105, -0.105):
            ids = []
            for k, z in enumerate(np.linspace(top - 0.02, 0.09, 8)):
                cand = np.nonzero((np.abs(sh.rest[:, 2] - z) < 0.01) & (sh.rest[:, 1] < -0.02)
                                  & (np.sign(sh.rest[:, 0]) == np.sign(x0)))[0]
                if len(cand):
                    ids.append(cand[np.argmin(np.abs(sh.rest[cand, 0] - x0 - (0.012 if k % 2 else -0.012)))])
            if len(ids) > 2:
                _cord(sh, ids, 0.0012, SLOT['hem'])
    out = [worn(body, mats, name, parts, BAND['feet'], thick=0.003, folds=folds, roll=0.0045 if cuff else 0.0028,
                roll_slot=SLOT['hide'], extras=extras, slots=_all(SLOT['hide']))]
    # the sole and heel: thick dark leather under the foot, a heel block behind
    out.append(worn(body, mats, f'{name}_soles', {f: (lambda p: np.minimum(p[:, 2] - 0.014, 1.0)) for f in FEET},
                    BAND['feet'] + 0.004, thick=0.006, roll=0.0, slots=_all(SLOT['sole']),
                    folds=lambda p, n: 0.006 * np.clip((p[:, 1] - 0.0) / 0.05, 0, 1) * (p[:, 2] < 0.02)))
    if cuff:   # the shaft's top turned down over itself
        out.append(edge_band(body, mats, f'{name}_cuffs', {leg: (lambda p, t=top: np.abs(p[:, 2] - (t - 0.025)) - 0.025) for leg in LEGS},
                        BAND['feet'] + 0.004, slot=SLOT['hide'], roll=0.003,
                        folds=lambda p, n: wrinkles(p, [(top - 0.025, 0.025, 2)], 0.002)))
    return out


def sandals(body, mats, name='sandals'):
    """Sandals: a sole under each foot, a strap over the toes and the instep, and a strap round the ankle."""
    def field(p):
        y, z = p[:, 1], p[:, 2]
        return np.minimum.reduce([z - 0.012, np.abs(y + 0.13) - 0.012, np.abs(y + 0.03) - 0.01,
                                  np.abs(z - 0.11 - 0.25 * np.abs(p[:, 0] - np.sign(p[:, 0]) * 0.11)) - 0.008])
    return [worn(body, mats, name, {**{f: field for f in FEET}, **{leg: (lambda p: np.abs(p[:, 2] - 0.13) - 0.009) for leg in LEGS}},
                 BAND['feet'], thick=0.004, roll=0.0012, roll_slot=SLOT['hide'], slots=_all(SLOT['hide']))]


# Daggerfall's mages' own pieces (TEXTURE.486, 485), worn by their class looks alone: no clothing template draws them
GLOVE_Z = WRIST_Z + 0.55 * (ELBOW_Z - WRIST_Z)   # a glove's cuff, halfway up the forearm
# the pouches on a mage's belt: each one's place round the hips from the front, radians toward the body's left
POUCHES = {'man': (-0.8, 0.8, math.pi * 0.62), 'woman': (-0.95,)}


def glove_cuffs(body, mats, name):
    """A glove's cuff up the forearm from the wrist, flared a little at its top; the hand's own cover is made
    apart (`glove_covers`), shaped as each hand is."""
    def field(p):
        return np.maximum(p[:, 2] - GLOVE_Z, WRIST_Z - 0.03 - p[:, 2])

    def push(p):
        return BAND['shirt'] + 0.004 * np.clip((p[:, 2] - WRIST_Z) / (GLOVE_Z - WRIST_Z), 0, 1)
    return [worn(body, mats, name, {a: field for a in ARMS}, push, thick=0.003, roll=0.003,
                 roll_slot=SLOT['hide'], slots=_all(SLOT['hide']))]


def glove_covers(hands, mats):
    """The hands gloved: each hand's open and closed mesh again 2.5 mm out, in the glove's leather. Gives (the hand's
    object's name, its cover), each to be shown and moved with that hand."""
    import bpy
    out = []
    for kinds in hands.values():
        for ob in kinds.values():
            me = ob.data.copy()
            co = np.array([v.co[:] for v in me.vertices])
            n = np.array([v.normal[:] for v in me.vertices])
            me.vertices.foreach_set('co', (co + n * 0.0025).ravel())
            me.materials.clear()
            me.materials.append(mats[SLOT['hide']])
            me.update()
            cover = bpy.data.objects.new(f'glove.{ob.name}', me)
            bpy.context.scene.collection.objects.link(cover)
            for mod in ob.modifiers:
                if mod.type == 'SUBSURF':
                    sub = cover.modifiers.new('subsurf', 'SUBSURF')
                    sub.levels = sub.render_levels = mod.render_levels
            out.append((ob.name, cover))
    return out


def pouch_belt(body, mats, name, pouches, z=WAIST_Z - 0.01):
    """A belt round the waist with an iron buckle, and a leather pouch hung under it at each of `pouches` (radians
    round the hips from the front, toward the body's left), each a soft block standing out over a robe's skirt."""
    out = belt(body, mats, name, z=z, width=0.04, clasp=SLOT['iron'])
    top, low, half = z - 0.02, 0.95, 0.4   # a pouch from under the belt to the hip's joint, where the pelvis carries it

    def field(at):
        return lambda p: np.maximum(facing(around(p), FRONT + at) - half, np.maximum(p[:, 2] - top, low - p[:, 2]))

    def push(at):
        def bulge(p):
            u = np.clip(1 - (facing(around(p), FRONT + at) / half) ** 2, 0, 1)
            v = np.clip(1 - ((p[:, 2] - (top + low) / 2) / ((top - low) / 2)) ** 2, 0, 1)
            return BAND['belt'] + 0.006 + 0.03 * np.sqrt(u * v)
        return bulge
    for k, at in enumerate(pouches):
        out.append(worn(body, mats, f'{name}_pouch{k}', {'torso': field(at)}, push(at), thick=0.003, roll=0.002,
                        roll_slot=SLOT['leather'], slots=_all(SLOT['leather'])))
    return out


def bare_top(body, mats, name, hem=WAIST_Z - 0.03, top=1.44):
    """A close top from the waist to under the bare shoulders, open in a V at the bust, as Daggerfall's woman mage
    wears hers."""
    def field(p):
        x, y, z = p[:, 0], p[:, 1], p[:, 2]
        vee = np.where((y < -0.02) & (z > 1.30), 0.55 * (z - 1.30) + 0.01 - np.abs(x), -1.0)
        return np.maximum.reduce([hem - z, z - top, vee])
    return [worn(body, mats, name, {'torso': field}, lambda p: BAND['shirt'] + 0.002 * np.clip((CHEST_Z - p[:, 2])
                                                                                                / 0.2, 0, 1),
                 folds=lambda p, n: drapes(p, CHEST_Z, hem, 7, 0.0012), roll=0.0024)]


def _wardrobe():
    """The wardrobe by Daggerfall's templates: a name for each garment and each of its variants, built over a body,
    each giving its skinned shells and drapes."""
    W = {}

    def add(name, fn):
        W[name] = fn
    add('straps', lambda b, m: strap(b, m, 'straps'))
    add('straps_disc', lambda b, m: strap(b, m, 'straps_disc', disc=True))
    add('straps_cross', lambda b, m: strap(b, m, 'straps_cross', cross=True))
    add('challenger_straps', lambda b, m: strap(b, m, 'challenger_straps', belt_too=True))
    add('champion_straps', lambda b, m: strap(b, m, 'champion_straps', cross=True, belt_too=True, disc=True))
    add('armbands', lambda b, m: armbands(b, m, 'armbands'))
    add('fancy_armbands', lambda b, m: armbands(b, m, 'fancy_armbands', fancy=True))
    add('kimono', kimono)
    add('sash', lambda b, m: sash(b, m, 'sash'))
    add('eodoric', lambda b, m: collar(b, m, 'eodoric', apron=True))
    add('formal_eodoric', lambda b, m: collar(b, m, 'formal_eodoric') + skirt(b, m, 'formal_eodoric_skirt', slit=True))
    add('shoes', lambda b, m: shoes(b, m, 'shoes'))
    add('tall_boots', lambda b, m: shoes(b, m, 'tall_boots', top=KNEE_Z - 0.04, cuff=True))
    add('boots', lambda b, m: shoes(b, m, 'boots', top=CALF_Z, cuff=True))
    add('boots_laced', lambda b, m: shoes(b, m, 'boots_laced', top=0.3, laced=True))
    add('sandals', sandals)
    add('casual_pants', lambda b, m: pants(b, m, 'casual_pants'))
    add('breeches', lambda b, m: pants(b, m, 'breeches', 'calf', baggy=0.013))
    add('tights', tights)
    add('short_skirt', lambda b, m: skirt(b, m, 'short_skirt', top=HIP_Z + 0.02, hem=0.62, flare=0.04, folds=9))
    # a long skirt as Daggerfall's townswomen wear it: fitted to the hips, falling straight to the lower calf, so a
    # stride steps out from under its hem instead of tenting it; soft folds, never flared
    add('long_skirt', lambda b, m: skirt(b, m, 'long_skirt', belted=True, **LONG_SKIRT))
    add('long_skirt_slit', lambda b, m: skirt(b, m, 'long_skirt_slit', belted=True, slit=True, **LONG_SKIRT))
    add('wrap', lambda b, m: skirt(b, m, 'wrap', top=HIP_Z, hem=0.66, flare=0.04, folds=7))
    add('casual_cloak', lambda b, m: cloak(b, m, 'casual_cloak'))
    add('casual_cloak_hooded', lambda b, m: cloak(b, m, 'casual_cloak_hooded', hooded=True))
    add('casual_cloak_short', lambda b, m: cloak(b, m, 'casual_cloak_short', short=True))
    add('formal_cloak', lambda b, m: cloak(b, m, 'formal_cloak', hem=0.26, fur=True))
    add('formal_cloak_hooded', lambda b, m: cloak(b, m, 'formal_cloak_hooded', hem=0.26, fur=True, hooded=True))
    add('khajiit_suit', suit)
    add('dwynnen_surcoat', lambda b, m: tunic(b, m, 'dwynnen_surcoat', 'none', 'v', hem=0.58))
    add('short_tunic', lambda b, m: tunic(b, m, 'short_tunic', 'short', 'square', hem=0.72, split=False))
    add('formal_tunic', lambda b, m: tunic(b, m, 'formal_tunic', 'long', 'round', hem=0.7, split=False, belted=False,
                                           woven=True))
    add('reversible_tunic', lambda b, m: tunic(b, m, 'reversible_tunic', 'long', 'round', hem=0.72, split=False,
                                               woven=True))
    add('anticlere_surcoat', lambda b, m: tunic(b, m, 'anticlere_surcoat', 'long', 'round', hem=0.6))
    add('toga', toga)
    add('loincloth', lambda b, m: loincloth(b, m, 'loincloth'))
    add('loincloth_long', lambda b, m: loincloth(b, m, 'loincloth_long', long=True))
    add('plain_robes', lambda b, m: robe(b, m, 'plain_robes'))
    add('plain_robes_hooded', lambda b, m: robe(b, m, 'plain_robes_hooded', hooded=True))
    add('priest_robes', lambda b, m: robe(b, m, 'priest_robes', belted=False, stripes=True))
    add('open_tunic', lambda b, m: shirt(b, m, 'open_tunic', 'long', 'deep', hem=HIP_Z - 0.04, lace=False, band='over'))
    add('vest', lambda b, m: vest(b, m))
    add('belt', lambda b, m: belt(b, m))
    for sleeve in ('short', 'long'):
        for neck, lace in (('v', True), ('deep', False), ('round', False)):
            base = f'shirt_{sleeve}_{neck}'
            add(base, lambda b, m, s=sleeve, n=neck, la=lace, nm=base: shirt(b, m, nm, s, n, lace=la))
            add(f'{base}_belted', lambda b, m, s=sleeve, n=neck, la=lace, nm=base:
                shirt(b, m, nm, s, n, lace=la) + belt(b, m, f'{nm}_belt'))
            add(f'{base}_sash', lambda b, m, s=sleeve, n=neck, la=lace, nm=base:
                shirt(b, m, nm, s, n, lace=la) + belt(b, m, f'{nm}_sash', width=0.06, sash=True))
        add(f'shirt_{sleeve}_long_hem', lambda b, m, s=sleeve: shirt(b, m, f'shirt_{s}_long_hem', s, 'v', hem=0.86))
    # women's
    add('brassiere', lambda b, m: brassiere(b, m, 'brassiere'))
    add('formal_brassiere', lambda b, m: brassiere(b, m, 'formal_brassiere', formal=True, gems=True))
    add('peasant_blouse', lambda b, m: shirt(b, m, 'peasant_blouse', 'long', 'square', hem=WAIST_Z - 0.06, lace=False,
                                             puff=0.024, off_shoulder=True))
    add('evening_gown', lambda b, m: gown(b, m, 'evening_gown', 'puff', 'square'))
    add('day_gown', lambda b, m: gown(b, m, 'day_gown', 'long', 'round', flare=0.14))
    add('casual_dress', lambda b, m: gown(b, m, 'casual_dress', 'long', 'v', flare=0.12, folds=12)
        + belt(b, m, 'casual_dress_belt'))
    add('strapless_dress', lambda b, m: gown(b, m, 'strapless_dress', 'none', 'round', flare=0.14, folds=12))
    add('priestess_robes', lambda b, m: robe(b, m, 'priestess_robes', belted=False, stripes=True))
    # the mages' own: his short-sleeved hooded robe and green gloves, a belt hung with pouches; her dark top and long
    # narrow loincloth to the shin
    add('mage_robes', lambda b, m: robe(b, m, 'mage_robes', hooded=True, sleeves='elbow', belted=False))
    add('mage_gloves', lambda b, m: glove_cuffs(b, m, 'mage_gloves'))
    add('mage_belt', lambda b, m: pouch_belt(b, m, 'mage_belt', POUCHES['man']))
    add('mage_top', lambda b, m: bare_top(b, m, 'mage_top'))
    add('mage_loincloth', lambda b, m: loincloth(b, m, 'mage_loincloth', top=WAIST_Z - 0.06, hem=0.2, half=0.3,
                                                folds=3))
    return W


WARDROBE = _wardrobe()
# a woman's garment where hers is cut otherwise, as Daggerfall draws hers (TEXTURE.235 against 239): her vest unlaced
WOMAN = {'vest': lambda b, m: vest(b, m, laced=False),
         'mage_belt': lambda b, m: pouch_belt(b, m, 'mage_belt', POUCHES['woman'])}   # one pouch, at her right hip
# the garments that glove the hands, their covers made over the hands apart (`glove_covers`)
GLOVED = ('mage_gloves',)

# each garment's cloth, its weave or print and its accent's colour (a vest's leather, a sash's silk, an embroidery's
# thread), and the colour it is shown in before the game dyes it, Daggerfall's own where it has one
LOOK = {
    'vest': {'dye': (0.022, 0.022, 0.022)},   # his black, laced in gilt
    'sash': {'dye': (0.62, 0.08, 0.06)},
    'kimono': {'cloth': 'silk', 'accent': (0.6, 0.09, 0.07), 'dye': (0.82, 0.55, 0.42)},
    'formal_tunic': {'pattern': 'diamonds', 'accent': (0.86, 0.7, 0.18), 'dye': (0.2, 0.32, 0.72)},
    'reversible_tunic': {'pattern': 'diamonds', 'accent': (0.86, 0.7, 0.18), 'dye': (0.62, 0.12, 0.1)},
    'dwynnen_surcoat': {'pattern': 'chevrons', 'accent': (0.42, 0.26, 0.12), 'dye': (0.86, 0.78, 0.6)},
    'anticlere_surcoat': {'cloth': 'wool', 'dye': (0.18, 0.36, 0.18)},
    'priest_robes': {'cloth': 'wool', 'accent': (0.88, 0.8, 0.56), 'dye': (0.18, 0.28, 0.6)},
    'priestess_robes': {'cloth': 'wool', 'accent': (0.88, 0.8, 0.56), 'dye': (0.18, 0.28, 0.6)},
    'plain_robes': {'cloth': 'wool', 'dye': (0.32, 0.26, 0.2)},
    'plain_robes_hooded': {'cloth': 'wool', 'dye': (0.2, 0.3, 0.45)},
    'casual_pants': {'cloth': 'wool', 'dye': (0.38, 0.26, 0.16)},
    'breeches': {'dye': (0.74, 0.62, 0.44)},
    'tights': {'cloth': 'silk', 'dye': (0.16, 0.26, 0.62)},
    'khajiit_suit': {'cloth': 'silk', 'dye': (0.06, 0.06, 0.07)},
    'formal_eodoric': {'pattern': 'grid', 'accent': (0.85, 0.68, 0.2), 'dye': (0.7, 0.55, 0.15)},
    'evening_gown': {'cloth': 'silk', 'dye': (0.48, 0.1, 0.1), 'accent': (0.86, 0.5, 0.6)},
    'day_gown': {'cloth': 'silk', 'dye': (0.35, 0.5, 0.78)},
    'casual_dress': {'dye': (0.2, 0.32, 0.6)},
    'strapless_dress': {'cloth': 'silk', 'dye': (0.2, 0.42, 0.3)},
    'long_skirt': {'dye': (0.24, 0.3, 0.55)},
    'long_skirt_slit': {'dye': (0.24, 0.3, 0.55)},
    'wrap': {'dye': (0.25, 0.4, 0.7), 'accent': (0.6, 0.1, 0.08)},
    'peasant_blouse': {'dye': (0.82, 0.8, 0.74)},
    'casual_cloak': {'cloth': 'wool', 'dye': (0.2, 0.34, 0.24)},
    'casual_cloak_hooded': {'cloth': 'wool', 'dye': (0.24, 0.38, 0.42)},
    'casual_cloak_short': {'cloth': 'wool', 'dye': (0.42, 0.2, 0.14)},
    'formal_cloak': {'cloth': 'velvet', 'dye': (0.36, 0.08, 0.1)},
    'formal_cloak_hooded': {'cloth': 'velvet', 'dye': (0.12, 0.14, 0.3)},
    'toga': {'dye': (0.86, 0.84, 0.78), 'accent': (0.55, 0.1, 0.12)},
    'loincloth': {'dye': (0.5, 0.36, 0.22)},
    'loincloth_long': {'dye': (0.5, 0.36, 0.22)},
    'mage_robes': {'cloth': 'wool', 'dye': (0.16, 0.42, 0.42)},
    'mage_gloves': {'dye': (0.36, 0.6, 0.18)},
    'mage_belt': {'dye': (0.3, 0.2, 0.12)},
    'mage_top': {'dye': (0.12, 0.3, 0.12)},
    'mage_loincloth': {'dye': (0.18, 0.42, 0.16)},
}
SHIRT = {'dye': (0.55, 0.66, 0.86), 'accent': (0.6, 0.09, 0.07)}
LOOK_WOMAN = {'vest': {'dye': (0.16, 0.3, 0.16)}}   # her vest green


def garment_mats(name, woman=False, dye=None, grey=False):
    """Garment `name`'s materials (`palette`): its own cloth, weave and accent, shown in `dye` (else its preview
    colour); `grey`, its cloth in a dye's grey for the game to dye."""
    look = LOOK.get(name, SHIRT if name.startswith(('shirt', 'open_tunic', 'short_tunic')) else {})
    look = LOOK_WOMAN.get(name, look) if woman else look
    shown = (GREY,) * 3 if grey else (dye or look.get('dye', (0.5, 0.5, 0.52)))
    return palette(look.get('cloth', 'linen'), shown, look.get('accent', (0.85, 0.66, 0.2)), look.get('pattern'))


def wear(name, body, dye=None, grey=False):
    """Garment `name` over `body`, in its own cloth, weave and accent, shown in `dye` (else its preview colour); `grey`,
    its cloth in a dye's grey for the game to dye. It stands clear of everything the game lets be worn under it."""
    import clothkit
    woman = getattr(body, 'woman', False)   # set on her body by layers.py
    mats = garment_mats(name, woman, dye, grey)
    below = [reach_of(g, body) for g in unders(name)]
    # a cloth's thickness over the reach of what is under it, so its inside clears it too
    clothkit.FLOOR = clothkit.spread(np.maximum.reduce(below), _tris(body), rounds=2, margin=0.0025) if below else None
    try:
        return (WOMAN.get(name, WARDROBE[name]) if woman else WARDROBE[name])(body, mats)
    finally:
        clothkit.FLOOR = None


def unders(name):
    """The garments that can be worn under `name`: worn with it (gametables.py) and in a lower band."""
    import gametables
    return [g for g in LAYERS if g != name and gametables.worn_with(g, name) and order_of(g) < order_of(name)]


_REACH = {}   # (the body, a garment) -> how far out the garment stands at each of the body's vertices


def _tris(body):
    import clothkit
    if not hasattr(body, 'tris'):
        body.tris = clothkit.triangles(body.me)
    return body.tris


def reach_of(name, body):
    """How far out from `body` garment `name`'s shells stand at each of its vertices (-inf where it does not lie):
    made once, measured and taken away again."""
    import bpy
    import clothkit
    import drape
    key = (len(body.rest), round(float(np.abs(body.rest).sum()), 3), name)   # a body as shaped: the same in every copy
    if key not in _REACH:
        made = wear(name, body, grey=True)
        _REACH[key] = clothkit.reach(body, [m for m in made if not isinstance(m, drape.Drape)])
        for m in made:
            me = m.me
            bpy.data.objects.remove(m.ob, do_unlink=True)
            bpy.data.meshes.remove(me)
    return _REACH[key]


def envelope(name, body, garments=None):
    """What a garment's drapes hang clear of besides the body: a shell never drawn, as far out as anything the game
    lets be worn with it stands (its own shells too, and only `garments` if named), posed with the body each frame.
    Over the arms and the feet alone: over the torso and the legs a drape's order lays it over what is under it
    (forgeLayers.js `ordersMeet`), so a robe's waist stays a waist. None where nothing is worn with it."""
    import clothkit
    import gametables
    names = garments if garments is not None else [g for g in LAYERS if g == name or gametables.worn_with(g, name)]
    got = [reach_of(g, body) for g in names]
    if not got:
        return None
    r = np.maximum.reduce(got)
    part = body.alpha.argmax(axis=1)   # anatomy.PIECES: the arms 1 and 2, the bare feet 6 and 7
    r = np.where(np.isin(part, (1, 2, 6, 7)), r, -np.inf)
    if not np.isfinite(r).any():
        return None
    push = clothkit.spread(r, _tris(body), rounds=2, margin=0.003)
    inside = np.where(push > 0, -1.0, 1.0)
    sh = Shell(body, lambda p, a: inside, lambda p: np.maximum(push, 0.002), 0.001)
    sk = sh.skinned(f'{name}_under', [])
    sk.ob.hide_render = True
    return sk


# the layers the game stacks: a template's variants are its base garment and what is laid over it
VARIANTS = {}
for _s in ('short', 'long'):
    for _n in ('v', 'deep', 'round'):
        VARIANTS[f'shirt_{_s}_{_n}_belted'] = [f'shirt_{_s}_{_n}', 'belt']
        VARIANTS[f'shirt_{_s}_{_n}_sash'] = [f'shirt_{_s}_{_n}', 'waist_sash']
WARDROBE['waist_sash'] = lambda b, m: belt(b, m, 'waist_sash', width=0.06, sash=True)
LAYERS = [n for n in WARDROBE if n not in VARIANTS]
# how much nearer each kind of layer is drawn than it lies (metres), so what Daggerfall draws over lies over where two
# meet: the clothes' bands in their order, armour over clothes, and what hangs (skirts, robes, cloaks) over armour
ORDER = {'skin': 0.0008, 'legs': 0.0015, 'feet': 0.003, 'shirt': 0.0045, 'over': 0.006, 'belt': 0.0075, 'armour': 0.035,
         'drape': 0.045, 'pouch': 0.05, 'cloak': 0.065}
BAND_OF = {'tights': 'skin', 'khajiit_suit': 'skin', 'casual_pants': 'legs', 'breeches': 'legs', 'loincloth': 'legs',
           'loincloth_long': 'legs', 'short_skirt': 'legs', 'wrap': 'legs', 'long_skirt': 'legs',
           'long_skirt_slit': 'legs', 'shoes': 'feet', 'tall_boots': 'feet', 'boots': 'feet', 'boots_laced': 'feet',
           'sandals': 'feet', 'belt': 'belt', 'waist_sash': 'belt', 'sash': 'belt', 'straps': 'belt',
           'straps_disc': 'belt', 'straps_cross': 'belt', 'challenger_straps': 'belt', 'champion_straps': 'belt',
           'armbands': 'belt', 'fancy_armbands': 'belt', 'eodoric': 'belt', 'formal_eodoric': 'belt', 'vest': 'over',
           'mage_belt': 'pouch', 'mage_gloves': 'shirt', 'mage_top': 'shirt', 'mage_loincloth': 'legs',
           'open_tunic': 'over', 'toga': 'over', 'kimono': 'over', 'brassiere': 'shirt', 'formal_brassiere': 'shirt'}


def drape_order(name):
    """A garment's drapes' bias: a cloak's over the skirts and robes it hangs against, any other's over armour."""
    return ORDER['cloak'] if 'cloak' in name else ORDER['drape']


def order_of(name):
    """A garment layer's bias: its band's (a tunic's, a robe's top, a gown's bodice lie with the shirts' unless named)."""
    return ORDER[BAND_OF.get(name, 'over' if any(k in name for k in ('tunic', 'surcoat', 'robe')) else 'shirt')]
