"""The held map's picture (HELDMAP, fitted to public/art/held-map.png): a parchment sheet held up before the eye in both
hands, one part posed as one picture.

The part's space: its root the middle of the sheet's foot, its axis +Z up the sheet to the middle of its head, its
width along X (+X on the eye's left, as fpstage.pose_matrix lays a part), its face toward +Y, the eye. The sheet is a
plane cut ragged at its edge and curled a little toward the eye at its sides (`bend`).

The hands are ours: the one arm every first-person hand wears (fparm.py), the climbing and casting hands' own - its
leather glove over its linen sleeve, at the size they were fitted to (`HANDS`), in their colours (fpforge.load). The
painting sets only the sheet, where the hands hold it and how they grip it. The left arm's wrist stands where the fit
puts it, by the sheet's left side; its forearm leans in from below and from nearer the eye and turns about itself; its
hand bends at the hand's own joints, the thumb on the sheet's face and the fingers behind it. The right arm is the left
mirrored across the sheet's middle: the painting holds the sheet alike in both hands.

    python -I tools/sprite-forge/fpheld.py --out public/art

renders the game's two pictures (`NAMES`): the sheet alone, drawn `GRID` times its grid at the painting's size
(`SIZE`), and the hands' hold (`hold`), a strip of frames on the painting's grid - its rest, then each hand's stir -
each the hands alone where they lie nearer the eye than the sheet. The game draws them over the map's ink."""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fparm  # noqa: E402
import fphand  # noqa: E402

SHAPE = {
    'sheet_w': 0.5,      # metres across the sheet
    'sheet_h': 0.33,     # and up it
    'bend': 0.01,        # how far its sides curl toward the eye (m)
    'rag': 0.006,        # how deep its edge is torn (m)
}
HANDS = 'CLIMB'   # the spec whose hands these are: their size (its shape) and their colours (its grade)
HAND_KEYS = ('hand', 'arm_r', 'cuff', 'thumb', 'fingers')   # the arm's own values, as fparm.arm takes them
HAND_MATS = fparm.mats()   # the arm's materials: graded as the hands' own, never onto the painting
# the left arm's place on the sheet and its hand's grip: (name, the fit's step, its bounds, the prior's unit, its rest).
# The wrist: `wx` metres in from the sheet's left side (+X; below 0, outside it), `wy` in front of its face (a little,
# as the thumb lies on it), `wz` up from its foot. The forearm: `lean` degrees in from upright toward the sheet's
# middle, `reach` away from the eye, `turn` about itself (at 0 the back of the hand faces out, away from the sheet's
# middle, and its thumb the eye: the sheet's edge lies in the crook between the thumb and the index). Then the hand's
# own joints (fphand.JOINTS), at rest pinching the sheet: the fingers nearly straight behind it, the thumb turned in
# across its face
PLACE = (
    ('wx', 0.01, (-0.2, 0.15), 0.04, -0.03),
    ('wy', 0.01, (-0.15, 0.04), 0.04, 0.0),
    ('wz', 0.01, (-0.15, 0.4), 0.04, 0.05),
    ('lean', 4.0, (-80.0, 85.0), 15.0, 40.0),
    ('reach', 4.0, (-80.0, 85.0), 15.0, 35.0),
    ('turn', 8.0, (-180.0, 180.0), 30.0, 0.0),
)
GRIP = {'knuckle': 10.0, 'fold': 10.0, 'spread': 2.0, 'thumb_in': 50.0, 'thumb_bend': 10.0, 'wrist': 0.0, 'tilt': 0.0}
JOINTS = PLACE + tuple((n, step, lim, unit, GRIP[n]) for n, step, lim, unit, _ in fphand.JOINTS)
REST = {j[0]: j[4] for j in JOINTS}
MATS = ('parchment',) + HAND_MATS
PAPER = 0
COLS, ROWS = 150, 100    # the sheet's grid: about a texel a cell at the picture's size
EDGE_CELLS = 2.5         # how far in from the edge a tear reaches, in cells
GRID = 6                 # the painting's texels are this many of its pixels
# the folds the sheet was kept in: (the line's place across the sheet, its slant over the other way, depth (m), +1 a
# ridge toward the eye, -1 a valley), a share of its width for the upright fold and of its height for the level one.
# Off the middle and slanted, as a hand folds a map
FOLDS = {'upright': (0.55, -0.04, 0.006, -1.0), 'level': (0.47, 0.03, 0.005, 1.0)}
CREASE = 0.005   # metres either side of a fold its crease shades over
WRINKLES = 0.0013   # how far the sheet crinkles out of its plane (m), in a few long waves of their own
# where each hand pinches the sheet, wrinkles fan in from the grip: (which side, +1 the left (+X); the grip's height
# over the sheet's; how many; the seed that lays them), each side its own
GRIP_WRINKLES = ((1.0, 0.41, 4, 21), (-1.0, 0.37, 3, 34))
DOG_EAR = 0.035   # the dog-eared corner's reach along each edge (m): the head's corner on the eye's right, bent up


def length(S):
    """The sheet's foot to its head: the length a pose aims along."""
    return S['sheet_h']


def _tear(t, seed):
    """How deep the edge is torn at `t` (0 to 1 along a side), 0 to 1: a few waves of their own, never quite 0."""
    rng = np.random.default_rng(seed)
    out = np.zeros_like(t)
    for k, amp in ((7, 0.4), (17, 0.3), (41, 0.2), (83, 0.15)):
        out += amp * (0.5 + 0.5 * np.sin(2 * np.pi * k * t + rng.uniform(0, 2 * np.pi)))
    return out / 1.05


def fold_lines(S):
    """Each fold as a line in the sheet's plane: {name: (a, b, depth, ridge)}, the upright one x = a + b z and the
    level one z = a + b x, in metres."""
    w, h = S['sheet_w'], S['sheet_h']
    at, slant, depth, ridge = FOLDS['upright']
    up = ((at - 0.5 - 0.5 * slant) * w, slant * w / h, depth, ridge)   # u = at + slant (v - 0.5)
    at, slant, depth, ridge = FOLDS['level']
    level = (at * h, slant * h / w, depth, ridge)                      # v = at + slant x / w
    return {'upright': up, 'level': level}


def _creased(x, z, S):
    """How far the sheet stands toward the eye at (x, z) for its folds and its crinkles: each fold a broad tent of its
    halves meeting at an angle and a sharp crease along the line; the crinkles a few long waves, each its own way."""
    L = fold_lines(S)
    a, b, depth, ridge = L['upright']
    dx = x - (a + b * z)
    a2, b2, depth2, ridge2 = L['level']
    dz = z - (a2 + b2 * x)
    tent = lambda d, span: np.clip(1.0 - np.abs(d) / span, 0.0, 1.0)   # noqa: E731
    y = ridge * depth * (0.6 * tent(dx, 0.5 * S['sheet_w']) + 0.4 * np.exp(-(dx / CREASE) ** 2))
    y = y + ridge2 * depth2 * (0.6 * tent(dz, 0.5 * S['sheet_h']) + 0.4 * np.exp(-(dz / CREASE) ** 2))
    rng = np.random.default_rng(12)
    for wave in (0.16, 0.11, 0.07, 0.045):   # metres a wave, each its own bearing and phase
        t = rng.uniform(0, np.pi)
        y = y + WRINKLES * (wave / 0.16) * np.sin(2 * np.pi * (x * np.cos(t) + z * np.sin(t)) / wave + rng.uniform(0, 7))
    w, h = S['sheet_w'], S['sheet_h']
    for side, at, n, seed in GRIP_WRINKLES:   # a fan of short ridges and valleys in from the pinch
        r = np.random.default_rng(seed)
        gx, gz = side * (w / 2 - 0.012), at * h
        for i in range(n):
            a = np.radians(r.uniform(-40.0, 40.0) + (i - (n - 1) / 2) * 14.0)
            d = np.array([-side * np.cos(a), np.sin(a)])   # inward, fanned up and down
            along = (x - gx) * d[0] + (z - gz) * d[1]
            across = (x - gx) * -d[1] + (z - gz) * d[0]
            reach = r.uniform(0.03, 0.07)
            fade = np.clip(along / 0.006, 0.0, 1.0) * np.clip(1.0 - along / reach, 0.0, 1.0)
            y = y + (1 if i % 2 else -1) * 0.0012 * fade * np.exp(-(across / 0.0025) ** 2)
    cx, cz = -w / 2, h   # the dog-ear: the corner past a crease across it, bent toward the eye
    past = ((x - cx) * -1.0 + (z - cz) * 1.0) / np.sqrt(2) + DOG_EAR / np.sqrt(2)   # 0 on the crease, more toward the corner
    return y + 0.35 * np.clip(past, 0.0, None)


def sheet(S):
    """The sheet: a grid in the XZ plane, its edge torn (each side's rim drawn in by `rag` times its tear, fading over
    EDGE_CELLS cells), its sides curled toward the eye, creased where it was folded and crinkled (`_creased`). Answers
    (vertices, triangles); its face count is fixed."""
    w, h, rag = S['sheet_w'], S['sheet_h'], S.get('rag', 0.0)
    u, v = np.meshgrid(np.linspace(0.0, 1.0, COLS + 1), np.linspace(0.0, 1.0, ROWS + 1))
    x, z = (u - 0.5) * w, v * h
    fade = lambda cells: np.clip(1.0 - cells / EDGE_CELLS, 0.0, 1.0)   # noqa: E731
    x = x + rag * _tear(v, 1) * fade(u * COLS) - rag * _tear(v, 2) * fade((1 - u) * COLS)
    z = z + rag * _tear(u, 3) * fade(v * ROWS) - rag * _tear(u, 4) * fade((1 - v) * ROWS)
    y = S.get('bend', 0.0) * (2 * x / w) ** 2 + _creased(x, z, S)
    P = np.stack([x, y, z], axis=-1)
    idx = np.arange((ROWS + 1) * (COLS + 1)).reshape(ROWS + 1, COLS + 1)
    a, b, c, d = idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]
    t = np.concatenate([np.stack([a, c, b], -1).reshape(-1, 3), np.stack([a, d, c], -1).reshape(-1, 3)])
    return P.reshape(-1, 3), t   # wound to face the eye (+Y): a layer of the sheet alone hides its back faces


_ARMS = {}


def hands():
    """Our hands' own values (`HANDS`' shape, as fitted there): their size, girth and cuff."""
    import json
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', f'{HANDS}-shape.json')
    table = json.load(open(path))
    return {k: table[k] for k in HAND_KEYS if k in table}


def _rest_arm():
    H = hands()
    key = tuple(sorted(H.items()))
    if key not in _ARMS:
        _ARMS[key] = (fparm.arm(H['hand'], H['arm_r'], 'L', cuff=H.get('cuff'), thumb=H.get('thumb'),
                                fingers=H.get('fingers')), H)
    return _ARMS[key]


def _rot(axis, deg):
    a = math.radians(deg)
    x, y, z = np.asarray(axis, float) / np.linalg.norm(axis)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])


def arm_frame(p):
    """The left forearm's turn in the part's space: its axis (the arm's +Z) leaning `lean` in toward the sheet's middle
    (-X) and `reach` away from the eye (-Y), turned `turn` about itself; at 0 the back of the hand (the arm's +Y) faces
    out (+X), its palm the sheet's middle, so its thumb (the arm's -X) is the finger nearest the eye."""
    axis = _rot([0, 1, 0], -p['lean']) @ _rot([1, 0, 0], p['reach']) @ np.array([0.0, 0.0, 1.0])
    out = np.array([1.0, 0.0, 0.0])
    back = out - axis * (out @ axis)
    if np.linalg.norm(back) < 1e-6:
        back = np.array([0.0, 1.0, 0.0])
    back /= np.linalg.norm(back)
    R = np.column_stack([np.cross(back, axis), back, axis])
    return _rot(axis, p['turn']) @ R


def left_arm(S, p):
    """The left arm placed at pose `p`: its hand bent at its joints, its wrist where `wx`, `wy`, `wz` put it."""
    (v, q, m), H = _rest_arm()
    vp = fparm.posed(v, {j: p[j] for j, *_ in fphand.JOINTS}, H['hand'], 'L', H.get('cuff'))
    wrist = np.array([S['sheet_w'] / 2 - p['wx'], p['wy'], p['wz']])
    return (vp - np.array([0.0, 0.0, fparm.WRIST])) @ arm_frame(p).T + wrist, q, m + 1   # past the parchment


def scene(S, pose=None):
    """The whole picture at `pose`'s joints (its rest where it has none): (vertices, triangles, material a triangle).
    The right arm is the left mirrored, its hand's joints the pose's `right` where it has them (the hold's loop)."""
    from fpmodel import _join
    p = {**REST, **(pose or {})}
    sv, sq = sheet(S)
    lv, lq, lm = left_arm(S, p)
    rv, rq, rm = left_arm(S, {**p, **p.get('right', {})}) if p.get('right') else (lv, lq, lm)
    rv, rq = rv * np.array([-1.0, 1.0, 1.0]), rq[:, ::-1].copy()   # the right arm: a left one mirrored
    return _join([(sv, sq, PAPER), (lv, lq, lm), (rv, rq, rm)])


THROUGH_OK = 0.02   # the share of a thumb's points a render lets lie behind the sheet: where it meets the edge
PAPER_PULL = 0.6   # score lost if the whole thumb lay behind the sheet, or every finger before it
CLEAR = 0.0008     # metres a thumb lies before the sheet, and a finger behind it, at the least


def through(S, pose):
    """How far each hand passes through the sheet at `pose`: the share of its thumb's points over the sheet's face
    that lie behind it, and of its fingers' that lie before it. A sheet held in a pinch lies in the crook of the hand,
    the thumb before it and the fingers behind; through the paper is no hold. Answers [(thumb, fingers)], left and
    right."""
    w, h = S['sheet_w'], S['sheet_h']
    (v, _, _), H = _rest_arm()
    R = fparm._RIGS[(H['hand'], H.get('cuff'), len(v))]
    thumb, fingers = R['thumb']['on'] > 0.5, np.isin(R['piece'], [1, 2, 3, 4])
    p = {**REST, **pose}
    out = []
    for hand in (p, {**p, **p.get('right', {})}):
        P = left_arm(S, hand)[0]
        over = (np.abs(P[:, 0]) < w / 2 - 0.004) & (P[:, 2] > 0.004) & (P[:, 2] < h - 0.004)
        ys = S.get('bend', 0.0) * (2 * P[:, 0] / w) ** 2 + _creased(P[:, 0], P[:, 2], S)
        out.append(((over & thumb & (P[:, 1] < ys + CLEAR)).sum() / max(thumb.sum(), 1),
                    (over & fingers & (P[:, 1] > ys - CLEAR)).sum() / max(fingers.sum(), 1)))
    return out


def penalty(S, pose):
    """What the fit loses for a hold through the paper (`through`): the left hand's, the right being its mirror."""
    thumb, fingers = through(S, pose)[0]
    return PAPER_PULL * (thumb + fingers)


# the hold: the hands at rest, and now and then one of them stirs - a clip a hand, its frames played once from rest
# and back (the game waits between them, heldMapForge.js), `HOLD_FPS` a second
HOLD_CLIPS = (('left', 8), ('right', 8))
HOLD_FPS = 8
# how far each joint goes at the height of a stir (degrees): a few, so the hold is alive when looked at and quiet
# otherwise. Each keeps the thumb before the paper and the fingers behind it (`through`, held by main)
STIR = {'left': {'thumb_in': -2.5, 'thumb_bend': -3.0, 'knuckle': 2.5, 'fold': 3.0},
        'right': {'thumb_in': 3.0, 'thumb_bend': -2.0, 'fold': 2.5, 'spread': 1.0}}


def stir(pose, hand, s):
    """The pose with `hand` stirring at `s` of its clip (0 to 1, at rest at both ends, easing out and back): the left
    thumb shifts on the paper while its fingers re-grip behind it; the right thumb slides a little along the paper while
    its fingers shift. The arms and the sheet stay where they were fitted; the right hand takes its own joints."""
    b = math.sin(math.pi * s) ** 2
    moved = {j: pose[j] + d * b for j, d in STIR[hand].items()}
    if hand == 'left':
        return {**pose, **moved, 'right': {j[0]: pose[j[0]] for j in fphand.JOINTS}}
    return {**pose, 'right': {**{j[0]: pose[j[0]] for j in fphand.JOINTS}, **moved}}


def hold(pose):
    """Every frame of the hold's strip: the rest (the fitted pose), then each clip's frames in turn."""
    out = [pose]
    for hand, n in HOLD_CLIPS:
        out += [stir(pose, hand, i / (n + 1)) for i in range(1, n + 1)]
    return out


def part(S):
    return scene(S)


def posed(v, pose, S):
    """The part at `pose`: the picture made again at its joints (its vertices are the rest's, one for one)."""
    out = scene(S, pose)[0]
    assert len(out) == len(v), 'every pose keeps the part\'s vertices'
    return out


# what fpfit.py --shape fits, its steps and bounds
SHAPE_KEYS = ('focal', 'sheet_w', 'sheet_h', 'bend', 'rag')   # never the hands': they are ours as they are
SHAPE_STEP = {'sheet_w': 0.02, 'sheet_h': 0.015, 'bend': 0.006, 'rag': 0.002}
BOUNDS = {'sheet_w': (0.2, 1.2), 'sheet_h': (0.12, 0.8), 'bend': (-0.05, 0.1), 'rag': (0.0, 0.03)}
# the reference's class each material is read against (reference.mjs heldClasses): the glove 6, the parchment 7
CLASSES = {'parchment': 7}
# how the fitter reads our arm against the painting's: all of it as the painting's glove, which runs where our sleeve does
READ = {'linen': 6, 'gauntlet': 6}


def parchment():
    """The parchment: cream, mottled in broad stains and a fine grain, grimed along its folds' creases, and burnt dark
    along its edge, the burn reaching in raggedly. Its edge is read off the sheet's own size (fpmodel.SHAPE), so the burn
    keeps to the rim at any size the fit gives it."""
    import fpmodel
    import materials
    S = {**SHAPE, **fpmodel.SHAPE}
    w, h = S['sheet_w'], S['sheet_h']
    m, b = materials._principled('parchment', (0.62, 0.47, 0.29), rough=1.0, spec=0.0)
    nt = m.node_tree

    def op(kind, a, b_=None, val=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        nt.links.new(a, n.inputs[0])
        if b_ is not None:
            nt.links.new(b_, n.inputs[1])
        elif val is not None:
            n.inputs[1].default_value = val
        return n.outputs['Value']

    rest = materials._rest(nt)
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(rest, xyz.inputs['Vector'])
    # how far in from the nearest side, in metres
    side = op('SUBTRACT', op('ABSOLUTE', xyz.outputs['X']), val=w / 2)
    edge = op('MINIMUM', op('MULTIPLY', side, val=-1.0), op('MINIMUM', xyz.outputs['Z'], op('SUBTRACT', op(
        'MULTIPLY', xyz.outputs['Z'], val=-1.0), val=-h)))

    def noise(scale, detail=2.0):
        n = nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        nt.links.new(rest, n.inputs['Vector'])
        return n.outputs['Fac']

    burn_w = 0.022 * w   # the burn's reach, wavering
    burnt = op('SUBTRACT', edge, op('MULTIPLY', noise(30.0, 4.0), val=1.4 * burn_w))
    burn = nt.nodes.new('ShaderNodeMapRange')   # 1 at the very edge, 0 past the burn
    burn.inputs['From Min'].default_value = -burn_w * 0.6
    burn.inputs['From Max'].default_value = burn_w * 0.4
    burn.inputs['To Min'].default_value = 1.0
    burn.inputs['To Max'].default_value = 0.0
    nt.links.new(burnt, burn.inputs['Value'])
    stain = nt.nodes.new('ShaderNodeValToRGB')   # broad stains and a fine grain over the cream
    stain.color_ramp.elements[0].position, stain.color_ramp.elements[0].color = 0.2, (0.56, 0.42, 0.25, 1)
    stain.color_ramp.elements[1].position, stain.color_ramp.elements[1].color = 0.8, (0.66, 0.51, 0.32, 1)
    mott = op('ADD', op('MULTIPLY', noise(5.0, 2.0), val=0.7), op('MULTIPLY', noise(90.0, 1.0), val=0.3))
    nt.links.new(mott, stain.inputs['Fac'])
    # grime in the folds' creases: a thin darker line along each, worn through in places, never the same twice
    L = fold_lines(S)
    a, b_, _, _ = L['upright']
    dx = op('ABSOLUTE', op('SUBTRACT', op('SUBTRACT', xyz.outputs['X'], op('MULTIPLY', xyz.outputs['Z'], val=b_)), val=a))
    a2, b2, _, _ = L['level']
    dz = op('ABSOLUTE', op('SUBTRACT', op('SUBTRACT', xyz.outputs['Z'], op('MULTIPLY', xyz.outputs['X'], val=b2)), val=a2))

    def grime(d, seed_scale):
        line = nt.nodes.new('ShaderNodeMapRange')   # 1 on the crease, nothing a few millimetres off it
        line.inputs['From Min'].default_value = 0.0
        line.inputs['From Max'].default_value = 0.6 * CREASE
        line.inputs['To Min'].default_value = 1.0
        line.inputs['To Max'].default_value = 0.0
        nt.links.new(d, line.inputs['Value'])
        worn = nt.nodes.new('ShaderNodeMapRange')   # worn through where a noise of its own says
        worn.inputs['From Min'].default_value = 0.5
        worn.inputs['From Max'].default_value = 0.62
        nt.links.new(noise(seed_scale, 2.0), worn.inputs['Value'])
        return op('MULTIPLY', line.outputs['Result'], worn.outputs['Result'])

    creased = op('MULTIPLY', op('MAXIMUM', grime(dx, 11.0), grime(dz, 17.0)), val=0.3)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(creased, mix.inputs['Factor'])
    nt.links.new(stain.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = (0.36, 0.2, 0.07, 1)
    mix2 = nt.nodes.new('ShaderNodeMix')
    mix2.data_type = 'RGBA'
    nt.links.new(burn.outputs['Result'], mix2.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], mix2.inputs['A'])
    mix2.inputs['B'].default_value = (0.16, 0.06, 0.02, 1)
    nt.links.new(mix2.outputs['Result'], b.inputs['Base Color'])
    return m


SIZE = (1648, 1086)   # the painting's own pixels (src/ui/heldMap.js SPRITE): the game's pictures are laid where it was
NAMES = {'sheet': 'held-map-forge-sheet.png', 'hands': 'held-map-forge-hands.png'}


def picture(native, size=SIZE):
    """The game's picture from a native one (RGBA, the painting's grid): each texel `GRID` pixels square, on a canvas of
    the painting's size, clear where the native one does not reach."""
    from PIL import Image
    src = Image.fromarray(native)
    big = src.resize((src.width * GRID, src.height * GRID), Image.NEAREST)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(big.crop((0, 0, min(big.width, size[0]), min(big.height, size[1]))), (0, 0))
    return canvas


def spec_shape():
    import fpmodel
    return fpmodel.SHAPE


def main():
    from PIL import Image
    import fpforge
    import fpstage
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'HELDMAP.json'))
    ap.add_argument('--out', required=True, help='the folder the two pictures go to (public/art)')
    ap.add_argument('--samples', type=int, default=128)
    args = ap.parse_args()
    spec = fpforge.load(args.spec)
    eye = fpforge.Eye(spec, args.samples)
    rec = spec['records'][0]
    x, y = rec['screen']
    rect = [x, y, rec['canvas'][0], SIZE[1] // GRID]   # the painting's whole height: the arms run on past its foot
    pose, part = fpforge.FIT['0:0'], rec['part']
    # the sheet alone, the arms set far off so they neither show on it nor shade it: the hands' frames lie over it
    sheet = eye.screen({**pose, 'wx': -2.0, 'wz': -2.0}, part, record=0, frame=0, only=('parchment',))
    picture(fpstage.crop(sheet, rect)).save(os.path.join(args.out, NAMES['sheet']))
    # the hands alone, a frame a step of the hold's loop: each the whole picture's own pixels where the hands lie
    # nearer the eye than the sheet, so a frame sits on the sheet with no seam. A strip of them on the painting's grid
    frames = []
    for k, p in enumerate(hold(pose)):
        bad = [t for t in through(spec_shape(), p) if t[0] > THROUGH_OK or t[1] > 0]
        assert not bad, f'hold frame {k} passes through the paper: {bad}'
        whole = eye.screen(p, part, record=0, frame=0)
        cover = eye.screen(p, part, record=0, frame=0, only=HAND_MATS, under=('parchment',))[..., 3:] > 0
        frames.append(fpstage.crop(np.where(cover, whole, 0).astype(whole.dtype), rect))
    Image.fromarray(np.concatenate(frames, axis=1)).save(os.path.join(args.out, NAMES['hands']))
    print(f'the held map\'s sheet and its {len(frames)} hands\' frames -> {args.out}')


if __name__ == '__main__':
    main()
