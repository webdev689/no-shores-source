"""The blows: three strokes for each way a weapon is held, nine frames each, the same in every view. The game plays the
stroke the player swings: down the overhead, left, right or a diagonal the side cut, up the thrust.

The holds (`HOLDS`): one hand, the left fist empty; both hands on a haft (a war axe, a warhammer, a flail), the right
fist up it and the left on its foot; both on a long sword's hilt as a claymore, the left just under the right; and a
pair, a blade in each fist. Each stroke runs the guard, the wind-up, the hit (frame 4), the follow-through and the way
back.

One hand's strokes, both hands' drive and a pair's right then left and double thrust are captured (`CAPTURED`,
specs/moves.json): KayKit's clips, each weapon laid as the clip held it (poses.py `captured_blade`), its edge leading
the cut. The others are keyed by hand in body space, five keys with an in-between after each. A blend of two keys
gives the in-between, but where a blade swings round a side between two lines pointing nearly opposite ways
(`BETWEEN`), which a blend would turn over the top.

A key: both hands' (the right fist, the weapon's line up from it), the way the weapon's edge faces, the chest's turn
(+ to the left) and lean (+ forward), the legs. A pair's: the right blade, the left blade, turn, lean, legs.

Points and ways are in body space, as poses.py's: the ground under the body, +X its left, -Y ahead, +Z up."""
from mathutils import Vector

import onehand
import poses

STROKES = ('over', 'side', 'thrust')
HOLDS = ('1h', 'haft', 'hilt', 'pair')
FRAMES = 9
AT = 4   # the frame the weapon lands on
BLOWS = {f'{stroke}{hold}': FRAMES for hold in HOLDS for stroke in STROKES}
PAIR = tuple(f'{stroke}pair' for stroke in STROKES)
# both hands on the weapon: (how far the weapon's own grip lies below the right fist, the left fist below the right),
# metres. A haft slides up through the right fist, the left on its foot; a claymore's left takes the hilt under it
TWO_HANDS = {'haft': (0.28, 0.28), 'hilt': (0.0, 0.10)}

BACK = {'thigh_L': (-16, -8, -12), 'shin_L': (10, 0, 0), 'thigh_R': (8, 10, 16), 'shin_R': (30, 0, 0)}
MID = {'thigh_L': (-26, -8, -12), 'shin_L': (24, 0, 0), 'thigh_R': (18, 10, 16), 'shin_R': (16, 0, 0)}
LUNGE = {'thigh_L': (-34, -8, -12), 'shin_L': (34, 0, 0), 'thigh_R': (26, 10, 16), 'shin_R': (8, 0, 0)}

# both hands. The guard holds the weapon ready across the front, its head up by the right shoulder, clear of the face.
# The overhead chop: raised high, the fists over the brow and the head back over the crown; brought over and down at
# arm's length, a little across the body; through to the left of the front leg at the knee. The wide side sweep: drawn
# back past the right hip, the chest wound right; swung round the right side and flat across the front at the waist;
# carried round to the left. Their drive is captured (`CAPTURED`)
GUARD_2H = (((-0.14, -0.34, 1.16), (-0.30, -0.40, 0.87)), (0.0, -0.9, -0.41), 0, 0, {})
BACK_2H = (((-0.12, -0.40, 1.10), (0.15, -0.62, 0.77)), (0.0, -0.77, 0.62))
TWO = {
    'over': [GUARD_2H,
             (((-0.12, -0.20, 1.84), (-0.15, 0.40, 0.90)), (0.0, -0.91, 0.40), -6, 0, BACK),
             (((-0.08, -0.58, 1.30), (0.18, -0.92, -0.34)), (0.0, 0.34, -0.92), 4, 14, LUNGE),
             (((0.08, -0.44, 1.02), (0.60, -0.50, -0.62)), (0.0, 0.62, -0.50), 12, 16, LUNGE),
             (*BACK_2H, 2, 4, MID)],
    'side': [GUARD_2H,
             (((-0.40, 0.02, 1.18), (-0.65, 0.70, 0.30)), (-0.70, -0.65, 0.0), -38, 2, BACK),
             (((-0.04, -0.56, 1.10), (0.78, -0.62, 0.02)), (0.62, 0.78, 0.0), 6, 10, LUNGE),
             (((0.30, -0.38, 1.10), (0.92, 0.30, -0.05)), (-0.30, 0.92, 0.0), 34, 10, LUNGE),
             (*BACK_2H, 4, 4, MID)],
}

# a pair, each blade keyed as one hand's, from the pair's own guard (onehand.py TWIN_GUARD), the V the twin idle
# stands in. Both down, crossing: both raised high in a V, the fists over the brow and the blades back over the crown;
# brought down together to cross in an X before the chest; carried on down, still crossed, to the knees. Its right
# then left and its double thrust are captured (`CAPTURED`)
GUARD_PAIR = (onehand.TWIN_GUARD[0], onehand.TWIN_GUARD[1], 0, 0, onehand.TWIN_LEGS)
PAIRED = {
    'over': [GUARD_PAIR,
             (((-0.20, -0.18, 1.80), (-0.25, 0.30, 0.92)), ((0.20, -0.18, 1.80), (0.25, 0.30, 0.92)), 0, 0, BACK),
             (((-0.13, -0.55, 1.36), (0.40, -0.88, -0.25)), ((0.13, -0.55, 1.34), (-0.40, -0.88, -0.25)), 0, 12, LUNGE),
             (((-0.12, -0.52, 1.08), (0.45, -0.72, -0.52)), ((0.12, -0.52, 1.06), (-0.45, -0.72, -0.52)), 0, 14, LUNGE),
             (((-0.26, -0.32, 1.06), (-0.30, -0.60, 0.74)), ((0.24, -0.36, 1.02), (0.35, -0.65, 0.67)), 0, 4, MID)],
}

# the in-betweens a blend would get wrong, by (keys, stroke, the key before): a side cut's blade swinging round its own
# side, and an overhead's top, straight over the head in the swing's own plane so it never turns across the face
BETWEEN = {
    ('two', 'side', 1): (((-0.34, -0.36, 1.14), (-0.80, -0.55, 0.10)), (0.55, -0.80, 0.0), -16, 6, MID),
    ('two', 'over', 1): (((-0.10, -0.30, 1.86), (-0.03, -0.25, 0.97)), (0.0, -0.97, -0.25), -2, 4, MID),
    ('pair', 'over', 1): (((-0.15, -0.26, 1.86), (-0.05, -0.25, 0.97)), ((0.15, -0.26, 1.86), (0.05, -0.25, 0.97)),
                          0, 4, MID),
}


def _lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def _unit(v):
    n = sum(x * x for x in v) ** 0.5
    return tuple(x / n for x in v)


def _line(a, b, t):
    """A weapon's (fist, line) between two keys': the fist moved straight, the line turned through."""
    return (_lerp(a[0], b[0], t), _unit(_lerp(a[1], b[1], t)))


def _legs(a, b, t):
    return {j: _lerp(a.get(j, onehand.GUARD[j]), b.get(j, onehand.GUARD[j]), t) for j in set(a) | set(b)}


def blend(keys, a, b, t=0.5):
    """The pose `t` of the way from key `a` to key `b`: both hands' edge and a pair's left blade turned through, as
    the right's weapon is."""
    first, second, turn, lean, legs = a
    first_b, second_b, turn_b, lean_b, legs_b = b
    other = {'two': lambda x, y, s: _unit(_lerp(x, y, s)), 'pair': _line}[keys]
    return (_line(first, first_b, t), other(second, second_b, t), turn + (turn_b - turn) * t,
            lean + (lean_b - lean) * t, _legs(legs, legs_b, t))


def frames_of(keys, stroke):
    """A stroke's nine frames: its five keys at 0, 2, 4 (the hit), 6 and 8, an in-between after each."""
    table = {'two': TWO, 'pair': PAIRED}[keys][stroke]
    out = []
    for i, key in enumerate(table):
        out.append(key)
        if i + 1 < len(table):
            out.append(BETWEEN.get((keys, stroke, i)) or blend(keys, key, table[i + 1]))
    return out


# the captured blows and the keys they play (specs/moves.json): one hand's, KayKit's Melee_1H_Attack_Chop,
# _Slice_Horizontal and _Stab; both hands' drive, its Melee_2H_Attack_Stab, the left fist set on the weapon by the hold;
# a pair's right then left and double thrust, its Melee_Dualwield_Attack_Chop and _Stab
CAPTURED = {'over1h': 'over1h', 'side1h': 'side1h', 'thrust1h': 'thrust1h', 'thrusthaft': 'thrust2h',
            'thrusthilt': 'thrust2h', 'sidepair': 'sidepair', 'thrustpair': 'thrustpair'}
KEYS_OF = {'haft': 'two', 'hilt': 'two', 'pair': 'pair'}
POSES = {f'{stroke}{hold}': frames_of(KEYS_OF[hold], stroke) for hold in KEYS_OF for stroke in STROKES
         if f'{stroke}{hold}' not in CAPTURED}
FISTS = {'L': True, 'R': True}


def two_hands(p, hold, key, edge):
    """The weapon in both fists: the right at `key` (the fist, the weapon's line), as the gear's frame (`both`)."""
    at, way = key
    return both(p, hold, poses.axe_at(p, at, way, edge, pole_r=(-1, 0.6, -0.3)), (1, 0.3, -0.5))


def both(p, hold, M, pole_l):
    """The weapon `M` held at the right fist slid down through it by the hold's slide, the left fist closed on it the
    hold's gap below the right, its elbow toward `pole_l` (body space)."""
    slide, gap = TWO_HANDS[hold]
    w = Vector(M.col[2][:3]).normalized()
    right = M.translation.copy()
    M.translation = right - w * slide
    R = poses.root_matrix(p).inverted()
    poses.grip(p, 'L', tuple(R @ (right - w * gap)), tuple(R.to_3x3() @ w), tuple(pole_l))
    return M


def elbow_way(p, side):
    """The way `side`'s elbow points off its shoulder-to-hand line (body space): where a captured arm bent it."""
    W = p.world()
    sh, el, hand = (W[f'{b}_{side}'].translation for b in ('uarm', 'farm', 'hand'))
    line = (hand - sh).normalized()
    return tuple(poses.root_matrix(p).to_3x3().inverted() @ ((el - sh) - (el - sh).project(line)))


def blow(name):
    stroke = next(s for s in STROKES if name.startswith(s))
    hold = name[len(stroke):]

    def frame_of(frame, view, yaw):
        if name in CAPTURED:   # the weapon along the captured blade, its edge as the clip turned it
            p = poses.captured(CAPTURED[name], frame, yaw)
            blade, edge = poses.captured_blade(CAPTURED[name], frame)
            pole_l = elbow_way(p, 'L')
            M = poses.held(p, blade, 'R', blades=edge)
            gear = {'axe': both(p, hold, M, pole_l) if hold in TWO_HANDS else M, 'fist': dict(FISTS)}
            if hold == 'pair':
                blade, edge = poses.captured_blade(CAPTURED[name], frame, 'L')
                gear['off'] = poses.held(p, blade, 'L', blades=edge)
            return p, gear
        first, second, turn, lean, legs = POSES[name][frame]
        p = onehand._stance(legs, yaw, turn, lean)
        if hold == 'pair':
            return p, {'axe': onehand.sword(p, 'R', first), 'off': onehand.sword(p, 'L', second), 'fist': dict(FISTS)}
        return p, {'axe': two_hands(p, hold, first, second), 'fist': dict(FISTS)}
    return frame_of


# the holds each held weapon is struck in, by its kind (layers.py `HELD`): a long sword in one hand, as a claymore and
# in a pair; a short sword, a dagger and a mace in one hand and in a pair; an axe as a battle axe (one hand) and as a
# war axe (a haft); a flail and a warhammer on a haft. The class sword and axe stand in for a weapon of a metal not
# drawn. A pair's left weapon (`<layer>_l`) in the pair's alone
HOLDS_OF = {'sword': ('1h', 'hilt', 'pair'), 'short': ('1h', 'pair'), 'dagger': ('1h', 'pair'),
            'mace': ('1h', 'pair'), 'axe': ('1h', 'haft'), 'flail': ('haft',), 'warhammer': ('haft',)}
# the hold a class look's records strike in: the long sword in one hand, the war axe on its haft
CLASS_HOLD = {'sword': '1h', 'axe': 'haft'}
# A look's own records hold each stroke, five views each, so the moves after them keep their records: its hold's once
# drawn, else the thrust's frames standing in for it (`stands`, the stroke's records: forgeMoves.js FORGE_MOVES)
STAND_IN = 'thrust'
STAND_IN_FRAMES = 6


def holds_of(layer):
    """The holds a held layer is struck in."""
    if layer.endswith('_l'):
        return ('pair',)
    kind = 'short' if layer.endswith('_short') else layer.split('_')[0]
    return HOLDS_OF.get(kind, ())


def blows_of(layer):
    """The blows a held layer is drawn in: each stroke of each of its holds."""
    return tuple(f'{stroke}{hold}' for hold in holds_of(layer) for stroke in STROKES)


def blow_records(hold, drawn):
    """The own records of the strokes for a look whose weapon strikes in `hold` (or none): each stroke's own where
    `drawn(blow)` says every layer it stacks is drawn in it, else the stand-in."""
    def rec(stroke, view):
        move = f'{stroke}{hold}' if hold else None
        if move and drawn(move):
            return {'anim': move, 'view': view, 'frames': FRAMES}
        return {'anim': STAND_IN, 'view': view, 'frames': STAND_IN_FRAMES, 'stands': f'blow{stroke}'}
    return [rec(s, v) for s in STROKES for v in range(5)]


ANIMS = {name: blow(name) for name in BLOWS}
poses.ANIMS.update(ANIMS)
poses.FISTS.update({a: 'LR' for a in ANIMS})
