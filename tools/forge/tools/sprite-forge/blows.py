"""The blows: three strokes for each way a weapon is held, nine frames each, the same in every view. The game plays the
stroke the player swings: down the overhead, left, right or a diagonal the side cut, up the thrust.

The holds (`HOLDS`): one hand, the left fist empty; both hands on a haft (a war axe, a warhammer, a flail), the
right fist up it and the left on its foot; both on a long sword's hilt as a claymore, the left just under the right;
a pair, a blade in each fist; and a staff in both fists a forearm apart, struck with its head. Each stroke runs
the guard, the wind-up, the hit (frame 4), the follow-through and the way back.

Every stroke is captured whole from Quaternius's sword clips (`CAPTURED`, specs/moves.json), the body's turn, lean, step
and crouch as the clip moves them, in every hold: the overhead, his Sword_Attack; the side cut, Sword_Regular_A and its
recovery, a lunge; the thrust, Sword_Dash_RM's crouched charge with the sword arm driven straight ahead (`THRUST`). A
lunge's travel is kept in part and drawn home by the last frame (mocap.py `homed`). His rig has no weapon slot: the
weapon runs along the hand bone's +Z and its edge faces its +Y, as he held it (mocap.py `--blade`). Both hands' holds
lay both arms by keys of their own (`TWO`), as a one-handed clip swings its arm wide of any left hand: the right fist
off the shoulders and the weapon's way, level and turned with the chest for the overhead and the side cut, so the body's
twist drives the swing; the left fist closes on the weapon below the right (`both`). A pair's left blade is held at
guard before the chest while the right strikes (`guard_left`).

Points and ways are in body space, as poses.py's: the ground under the body, +X its left, -Y ahead, +Z up."""
import math

from mathutils import Matrix, Vector

import poses

STROKES = ('over', 'side', 'thrust')
HOLDS = ('1h', 'haft', 'hilt', 'pair', 'staff')
FRAMES = 9
AT = 4   # the frame the weapon lands on
BLOWS = {f'{stroke}{hold}': FRAMES for hold in HOLDS for stroke in STROKES}
PAIR = tuple(f'{stroke}pair' for stroke in STROKES)
# both hands on the weapon: (how far the weapon's own grip lies below the right fist, the left fist below the right),
# metres. A haft slides up through the right fist, the left on its foot; a claymore's left takes the hilt under it; a
# staff's right fist stays where it carries it, the left a forearm's length down the shaft, head and foot both free
TWO_HANDS = {'haft': (0.28, 0.28), 'hilt': (0.0, 0.10), 'staff': (0.0, 0.42)}

# each stroke's captured clip, the same for every hold (specs/moves.json)
CAPTURED = {f'{stroke}{hold}': f'{stroke}1h' for stroke in STROKES for hold in HOLDS}
FISTS = {'L': True, 'R': True}
# the thrust's sword arm by frame: the fist off the right shoulder (body space) and the weapon's way, drawn back by the
# hip as the body coils, driven straight out ahead at the shoulder's height on the hit, held, and drawn in; the guard
# and the last two frames as captured
THRUST = {1: ((0.02, 0.16, -0.34), (0.0, -0.95, 0.30)), 2: ((0.0, 0.22, -0.30), (0.0, -0.93, 0.36)),
          3: ((0.04, -0.20, -0.18), (0.0, -0.99, 0.12)), 4: ((0.10, -0.60, -0.06), (0.0, -1.0, 0.02)),
          5: ((0.09, -0.56, -0.08), (0.0, -1.0, 0.0)), 6: ((0.04, -0.34, -0.24), (0.0, -0.96, 0.28))}
THRUST_EDGE = (0.0, 0.0, 1.0)   # its edges up and down
THRUST_ELBOW = (-0.6, 0.2, -1.0)   # the right elbow down and out
# both hands' strokes by frame: the right fist off the shoulders' middle and the weapon's way. The overhead's and the
# side cut's are level and turned as the chest is, so a crouch or a lean never tips the swing into the floor; the
# thrust's are in the body's own turn. The overhead: raised over the brow, brought over and down before the chest,
# through low. The side cut: drawn back past the right shoulder, swung flat across the front, carried round to the
# left. The thrust: drawn to the right hip, driven out ahead at the hips' height, held and drawn back
GUARD_LOW = ((-0.10, -0.34, -0.23), (-0.25, -0.45, 0.86))
TWO = {
    'over': [GUARD_LOW, ((-0.12, -0.20, 0.19), (-0.10, 0.30, 0.95)), ((-0.08, -0.12, 0.31), (-0.05, 0.80, 0.60)),
             ((-0.05, -0.42, 0.15), (0.0, -0.75, 0.66)), ((-0.04, -0.50, -0.15), (0.05, -0.90, -0.42)),
             ((0.0, -0.36, -0.29), (0.12, -0.78, -0.62)), ((0.02, -0.34, -0.30), (0.12, -0.76, -0.64)),
             ((-0.06, -0.34, -0.27), (-0.15, -0.65, 0.74)), GUARD_LOW],
    'side': [GUARD_LOW, ((-0.30, -0.22, -0.19), (-0.80, 0.40, 0.45)), ((-0.36, -0.10, -0.17), (-0.65, 0.70, 0.30)),
             ((-0.22, -0.42, -0.21), (-0.90, -0.40, 0.15)), ((-0.02, -0.50, -0.23), (-0.20, -0.98, 0.05)),
             ((0.10, -0.38, -0.23), (0.70, -0.70, 0.0)), ((0.16, -0.30, -0.25), (0.92, -0.35, -0.10)),
             ((0.0, -0.36, -0.25), (0.20, -0.60, 0.77)), GUARD_LOW],
    'thrust': [GUARD_LOW, ((-0.14, -0.22, -0.42), (0.05, -0.95, 0.30)),
               ((-0.12, -0.16, -0.40), (0.05, -0.93, 0.36)), ((-0.08, -0.34, -0.32), (0.02, -0.99, 0.12)),
               ((-0.06, -0.52, -0.20), (0.0, -1.0, 0.02)), ((-0.06, -0.50, -0.22), (0.0, -1.0, 0.0)),
               ((-0.08, -0.36, -0.32), (0.0, -0.96, 0.28)), ((-0.10, -0.34, -0.28), (-0.15, -0.65, 0.74)), GUARD_LOW],
}
# the axis each stroke swings about (in its keys' frame): the edge faces the way the head goes round it
SWING = {'over': (1.0, 0.0, 0.0), 'side': (0.0, 0.0, 1.0), 'thrust': (1.0, 0.0, 0.0)}
POLE_R, POLE_L = (-1.0, 0.3, -0.6), (1.0, 0.3, -0.6)   # the elbows down and out
# how far each hold's weapon runs past the right fist, ahead to its head and behind to its foot, metres
ENDS = {'haft': (poses.AXE_REACH, 0.30), 'hilt': (poses.SWORD_TIP, 0.15),
        'staff': (poses.STAFF_TOP, poses.STAFF_POLE - poses.STAFF_TOP)}
# a pair's left blade at guard before the chest while the right strikes, in the chest's turn: the fist off the left
# shoulder, the blade's way (up and out ahead) and its edge's, and the elbow's way
GUARD_L = ((-0.06, -0.34, -0.22), (0.20, -0.45, 0.87), (0.0, -1.0, 0.0))
GUARD_ELBOW = (0.6, 0.2, -1.0)


def thrust_arm(p, frame):
    """The thrust's right fist laid where `THRUST` puts it off the shoulder, or None where the capture keeps its own.
    Gives the weapon's way and its edge (body space)."""
    if frame not in THRUST:
        return None
    off, way = THRUST[frame]
    R = poses.root_matrix(p).inverted()
    shoulder = R @ p.world()['uarm_R'].translation
    poses.grip(p, 'R', tuple(shoulder + Vector(off)), way, THRUST_ELBOW)
    return way, THRUST_EDGE


def guard_left(p):
    """A pair's left blade laid at guard before the chest (`GUARD_L`), turned with it. Gives its way and its edge's
    (body space)."""
    W = p.world()
    R = poses.root_matrix(p).inverted()
    chest = R.to_3x3() @ W['chest'].to_3x3()
    off, way, edge = (Vector(v) for v in GUARD_L)
    poses.grip(p, 'L', tuple(R @ W['uarm_L'].translation + chest @ off), tuple(chest @ way),
               tuple(chest @ Vector(GUARD_ELBOW)))
    return tuple(chest @ way), tuple(chest @ edge)


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


def two_hands(p, hold, stroke, frame):
    """Both hands' weapon at `frame`: the right fist and the weapon's way keyed (`TWO`), the left fist closed on it."""
    fist, way = (Vector(v) for v in TWO[stroke][frame])
    W = p.world()
    R = poses.root_matrix(p).inverted()
    F = Matrix.Translation(R @ ((W['uarm_L'].translation + W['uarm_R'].translation) / 2))
    if stroke != 'thrust':   # level, turned as the chest is
        fwd = (R @ W['chest']).to_3x3() @ Vector((0.0, -1.0, 0.0))
        F = F @ Matrix.Rotation(math.atan2(fwd.x, -fwd.y), 4, 'Z')
    turn = F.to_3x3()
    at, edge = F @ fist, turn @ Vector(SWING[stroke]).cross(way.normalized())
    ahead, behind = ENDS[hold]
    up = at - Vector((0.0, 0.0, -p.root_loc.z))   # the fist over the floor: a crouch lowers the root under the body
    way = _clear(up, (turn @ way).normalized(), ahead)
    way = -_clear(up, -way, behind)
    M = poses.axe_at(p, tuple(at), tuple(way), tuple((edge - edge.project(way)).normalized()),
                     pole_r=tuple(turn @ Vector(POLE_R)))
    return both(p, hold, M, tuple(turn @ Vector(POLE_L)))


def _clear(at, way, reach):
    """Way `way` from `at` (over the floor) raised, its heading kept, till the end `reach` along it clears the floor."""
    if not reach or at.z + way.z * reach >= 0.03 or at.z < 0.03:
        return way
    z = (0.03 - at.z) / reach
    flat = Vector((way.x, way.y, 0.0)).normalized() * math.sqrt(max(0.0, 1 - z * z))
    return Vector((flat.x, flat.y, z))


def struck(p, name, frame):
    """Blow `name`'s weapons at `frame` in the hands of body `p`: the thrust's arm laid, both hands' arms keyed, a
    pair's left at guard."""
    stroke = next(s for s in STROKES if name.startswith(s))
    hold, clip = name[len(stroke):], CAPTURED[name]
    if hold in TWO_HANDS:
        return {'axe': two_hands(p, hold, stroke, frame), 'fist': dict(FISTS)}
    blade, edge = (thrust_arm(p, frame) if stroke == 'thrust' else None) or poses.captured_blade(clip, frame)
    M = poses.held(p, blade, 'R', blades=edge, upright=False)
    gear = {'axe': M, 'fist': dict(FISTS)}
    if hold == 'pair':
        blade, edge = guard_left(p)
        gear['off'] = poses.held(p, blade, 'L', blades=edge, upright=False)
    return gear


def aimed(name, frame):
    """Whether blow `name`'s arms at `frame` are keyed (`THRUST`, `TWO`), not the capture's."""
    stroke = next(s for s in STROKES if name.startswith(s))
    return name[len(stroke):] in TWO_HANDS or stroke == 'thrust' and frame in THRUST


def blow(name):
    def frame_of(frame, view, yaw):
        p = poses.captured(CAPTURED[name], frame, yaw)
        return p, struck(p, name, frame)
    return frame_of


# the holds each held weapon is struck in, by its kind (layers.py `HELD`): a long sword in one hand, as a claymore
# and in a pair; a short sword, a dagger and a mace in one hand and in a pair; an axe as a battle axe (one hand) and
# as a war axe (a haft); a flail and a warhammer on a haft; a staff in both hands. The class sword and axe stand in
# for a weapon of a metal not drawn. A pair's left weapon (`<layer>_l`) in the pair's alone
HOLDS_OF = {'sword': ('1h', 'hilt', 'pair'), 'short': ('1h', 'pair'), 'dagger': ('1h', 'pair'),
            'mace': ('1h', 'pair'), 'axe': ('1h', 'haft'), 'flail': ('haft',), 'warhammer': ('haft',),
            'staff': ('staff',)}
# the hold a class look's records strike in: the long sword in one hand, the war axe on its haft, the staff in both
CLASS_HOLD = {'sword': '1h', 'axe': 'haft', 'staff': 'staff'}
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
