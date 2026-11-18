"""The guns' moves (guns3p.py): the Thunderlock in both fists, the Pistolet in the right, and a brace of Pistolets, one
in each. Daggerfall has no gun, so each move is keyed in body space, as the idle and the walk are, the same in every
view.

- The Thunderlock is carried at port arms, across the body, its muzzle up past the left shoulder (`gunready`,
  `gunwalk`). The shot (`gunshot`) brings it down to the right shoulder, aims, fires, kicks back and up, and settles.
  The reload (`gunreload`) brings it across the hip on the left fist while the right winds the coil, as the lore says.
- The Pistolet is held out before the chest, the forearm up, the muzzle up and a little ahead (`pistolready`,
  `pistolwalk`). The shot (`pistolshot`) turns the right shoulder to the foe, aims down the straight arm, fires, flips
  up to the shoulder and comes back. The reload (`pistolreload`) brings it before the chest while the left fist rams
  the pellet home.
- A brace is held out before the chest in both fists (`braceready`, `bracewalk`) and fired right then left
  (`braceshot`), the chest turning to each shot.
- At a sprint each is carried as it is held at the ready, on the captured run (poses.py `captured`): the Thunderlock at
  port arms (`gunrun`), a Pistolet up by the right shoulder with the left arm pumping (`pistolrun`), a brace up by both
  (`bracerun`). The hold rides the chest, the gun taking half its lean and turn. A crossbow is carried at port arms
  in its own sprint (`xbowrun`): its stock through the right fist behind the lock, its butt by the right hip, its prod
  up by the left shoulder over the left fist (`xbow`).

A key is where the gun's grip is, the way its muzzle points and the way its top faces. The fist is solved onto the
grip, closed round it (guns3p.py `RAKE`), and the gun is laid where the fist holds it, so it never floats off
the hand. The left fist holds the Thunderlock's forestock. A shot's flash at the muzzle goes to the gear as `flash`
(guns3p.py `gunner`), what the left hand holds as `off`.

Points and ways are in body space, as poses.py's: the ground under the body, +X its left, -Y ahead, +Z up."""
import math

from mathutils import Matrix, Quaternion, Vector

import guns3p
import poses
import rig

RIFLE = {'gunready': 1, 'gunwalk': 4, 'gunshot': 6, 'gunreload': 4, 'gunrun': 4}
PISTOL = {'pistolready': 1, 'pistolwalk': 4, 'pistolshot': 6, 'pistolreload': 4, 'pistolrun': 4}
BRACE = {'braceready': 1, 'bracewalk': 4, 'braceshot': 6, 'bracerun': 4}
XBOW = {'xbowrun': 4}   # the crossbow's sprint: a gun's move, so no other weapon is drawn in it
RUNS = ('gunrun', 'pistolrun', 'bracerun', 'xbowrun')   # the sprints
GUNPLAY = {**RIFLE, **PISTOL, **BRACE, **XBOW}
FLASH = {'thunderlock': 2, 'pistolet': 1}   # the flash's size at each gun's muzzle (gear.py SPARKS)
POLE_R, POLE_L = (-1.0, 0.4, -0.6), (1.0, 0.4, -0.6)

# the stances: an alert stand, the left foot a little ahead; the rifleman bladed to the shot, the right shoulder back
# and the cheek down on the stock; the duellist side on, the right shoulder to the foe
READY = {'pelvis': (0, 0, -6), 'spine': (4, 0, -2), 'chest': (2, 0, -6), 'neck': (4, 0, 4), 'head': (-6, 2, 4),
         'thigh_L': (-10, -6, -8), 'shin_L': (8, 0, 0), 'foot_L': (2, 0, 8),
         'thigh_R': (8, 8, 12), 'shin_R': (10, 0, 0), 'foot_R': (2, 0, -10)}
AIM = {'pelvis': (0, 0, -16), 'spine': (6, 0, -10), 'chest': (4, 0, -16), 'neck': (10, 0, 18), 'head': (2, 10, 20),
       'thigh_L': (-20, -8, -14), 'shin_L': (14, 0, 0), 'foot_L': (6, 0, 12),
       'thigh_R': (14, 10, 22), 'shin_R': (12, 0, 0), 'foot_R': (2, 0, -16), 'clav_R': (0, 0, 6)}
DUEL = {'pelvis': (0, 0, 14), 'spine': (2, 0, 8), 'chest': (2, 0, 12), 'neck': (4, 0, -14), 'head': (-6, 0, -16),
        'thigh_R': (-18, 8, 10), 'shin_R': (10, 0, 0), 'foot_R': (4, 0, -6),
        'thigh_L': (12, -8, -16), 'shin_L': (8, 0, 0), 'foot_L': (2, 0, 14)}
FREE_L = {'clav_L': (0, -6, 0), 'uarm_L': (4, -12, 0), 'farm_L': (-12, 0, 8)}   # the left arm hanging, as the idle's
HIP_L = {'clav_L': (0, -4, 0), 'uarm_L': (16, -30, -10), 'farm_L': (-70, 0, 10)}   # the duellist's, back off the hip

# the Thunderlock: (the grip, the muzzle's way, the top's way). Port arms: the right fist low before the right hip, the
# muzzle up past the left shoulder and a little ahead, the top out from the body
PORT = ((-0.13, -0.24, 1.04), (0.55, -0.22, 0.81), (0.0, -1.0, 0.1))
# the shot: lowered toward the aim, aimed with the butt in the right shoulder's pocket, fired, kicked back and up,
# steadied and lowered again. An aimed key is (None, how far the muzzle is raised in degrees, how far the gun is
# thrust back in metres); its grip follows from the pocket
SHOT = [((-0.16, -0.37, 1.22), (0.22, -0.90, 0.38), (0.0, -0.4, 1.0)), (None, 1.0, 0.0), (None, 1.0, 0.03),
        (None, 14.0, 0.06), (None, 4.0, 0.01), ((-0.18, -0.36, 1.16), (0.35, -0.75, 0.56), (0.0, -0.6, 1.0))]
SHOT_LEAN = [0, 0, -2, -6, -2, 0]   # the chest rocked back by the kick, degrees
AIM_WAY = (0.08, -1.0, 0.0)   # the aim, a little across the body so the barrel is never quite end on
POCKET = (0.05, -0.07, -0.02)   # the butt's place in the chest's frame from the right shoulder: in, ahead, down
# the reload: the gun brought across the body from the right hip, its muzzle up toward the left shoulder, on the left
# fist; the right fist on the grip, then on the coil's crank above and below its middle (the gun's own frame), then
# back to the grip
RELOAD = ((-0.12, -0.28, 1.04), (0.75, -0.40, 0.52), (0.0, 0.2, 1.0))
CRANK = [None, (-0.17, -0.06, 0.22), (-0.045, -0.06, 0.245), None]
RELOAD_LIFT = [0.0, 0.03, 0.03, 0.06]
# the Pistolet up by the right shoulder, its muzzle to the sky, its hammer toward the face: where a shot and a reload
# raise it, and its sprint's carry
HIGH = ((-0.31, -0.16, 1.30), (-0.12, -0.22, 0.97), (0.0, 1.0, 0.1))
# the Pistolet at rest and walking: out before the chest at its height, the forearm up, the muzzle up and a little ahead
HELD = ((-0.30, -0.34, 1.20), (-0.06, -0.42, 0.91), (0.0, 1.0, 0.1))
# the duellist's shot: brought down, aimed down the straight arm (None: the grip at the arm's reach from the shoulder),
# fired, flipped up by the kick, steadied and raised again. Each: (the key, how far the muzzle is raised, degrees)
PISTOL_SHOT = [(((-0.30, -0.36, 1.40), (-0.05, -0.62, 0.78), (0.0, 0.8, 0.6)), 0.0), (None, 2.0), (None, 4.0),
               (None, 34.0), (None, 6.0), (HIGH, 0.0)]
REACH = (0.03, -0.62, -0.02)   # the aimed grip from the right shoulder, in body space: the arm all but straight
PISTOL_SPLAY = 0.06   # the aimed muzzle's way out past its own shoulder, so the barrel is never quite end on
# the reload: before the chest, the muzzle up; the left fist above the muzzle with the rod, down onto it, and away
LOADING = ((-0.14, -0.22, 1.02), (0.10, -0.45, 0.89), (0.0, 1.0, 0.0))
RAM = [0.16, 0.10, 0.02, None]   # the left fist this far over the muzzle, or let go
# a brace: the right up by its shoulder, the left by its own a little lower and further out, so the two are not
# mirrors; the shot fires the right and then the left, the chest turning to each
HIGH_L = ((0.33, -0.20, 1.26), (0.16, -0.26, 0.95), (0.0, 1.0, 0.1))
HELD_L = ((0.32, -0.38, 1.14), (0.12, -0.46, 0.88), (0.0, 1.0, 0.1))   # the left's at rest and walking, as HELD
BRACE_SHOT = [('aim', 'high', 14), ('fire', 'high', 16), ('kick', 'down', 2), ('high', 'fire', -16),
              ('high', 'kick', -14), ('high', 'high', 0)]
BRACE_SWAY = (0.03, 0.0, -0.03, 0.0)   # each fist's sway fore (-Y) and aft through the walk, against the stride


def _stance(extra, yaw, turn=0.0, lean=0.0):
    rot = dict(extra)
    c = rot.get('chest', (0, 0, 0))
    rot['chest'] = (c[0] + lean, c[1], c[2] + turn)
    return poses.stance(rot, yaw)


def _walk_legs(frame):
    legs = poses.WALK_LEGS[frame % 2] if frame < 2 else poses._mirror_legs(poses.WALK_LEGS[frame % 2])
    lead_left = frame in (0, 1)
    return {**legs, 'pelvis': (0, 0, -5 if lead_left else 5), 'spine': (8, 0, 0),
            'chest': (3, 0, 3 if lead_left else -3), 'neck': (6, 0, 0), 'head': (-8, 0, 0)}


def _swing_l(frame):
    """The free left arm through the walk, as poses.py's walk swings it."""
    swing = (16 if frame == 0 else -16 if frame == 2 else 0)
    return {'clav_L': (0, -6, 0), 'uarm_L': (swing, -15, 0), 'farm_L': (-16, 0, 8)}


def _ways(aim, top):
    aim = Vector(aim).normalized()
    top = Vector(top)
    return aim, (top - top.project(aim)).normalized()


def gun_at(p, side, at, aim, top, pole, hold=True, kind='thunderlock'):
    """The gun with its grip at `at` (body space), its muzzle along `aim` and its top toward `top`, as the gear's
    frame; the `side` fist closed round its grip (`hold`), the grip held where the fist holds it."""
    aim, top = _ways(aim, top)
    r = math.radians(guns3p.rake(kind))
    up_grip = top * math.cos(r) + aim * math.sin(r)   # up the raked grip, toward the barrel
    R = poses.root_matrix(p)
    if hold:
        at_w, _, _ = poses.grip(p, side, tuple(at), tuple(up_grip), pole, knuckles=tuple(aim))
    else:
        at_w = R @ Vector(at)
    rot = R.to_3x3()
    return poses.frame_matrix(at_w, rot @ aim, rot @ -top)


def to_body(p, w):
    """A world point in body space."""
    return poses.root_matrix(p).inverted() @ Vector(w)


FORE_SLIDE = (0.0, -0.03, -0.06, -0.09)   # how far back along the forestock the left fist may slide to reach it


def _hold_forestock(p, M):
    """The left fist on the Thunderlock's forestock, its wrist under it: as far out along it as the arm reaches."""
    rot = poses.root_matrix(p).inverted().to_3x3()
    aim, belly = Vector(M.col[2][:3]), Vector(M.col[0][:3])
    shoulder = p.world()['uarm_L'].translation
    for back in FORE_SLIDE:
        at = M @ (Vector(guns3p.FORESTOCK) + Vector((0.0, 0.0, back)))
        if (at + belly * poses.FIST - shoulder).length <= rig.reach('L'):
            break
    poses.grip(p, 'L', tuple(to_body(p, at)), tuple(rot @ aim), POLE_L, knuckles=tuple(rot @ -belly))
    return at


def _flash(M, kind, yaw):
    """The flash at the muzzle, a little out ahead of it."""
    at = M @ Vector(guns3p.MUZZLE[kind]) + Vector(M.col[2][:3]) * 0.06
    return Matrix.Translation(at) @ Matrix.Rotation(math.radians(yaw), 4, 'Z'), FLASH[kind]


def _raised(aim, top, deg):
    """The muzzle raised `deg` degrees about the gun's own across."""
    aim, top = _ways(aim, top)
    R = Matrix.Rotation(math.radians(deg), 3, aim.cross(top))
    return R @ aim, R @ top


def _in_chest(p, joint, off):
    """A point `off` from `joint`, in the chest's frame, in body space."""
    W = p.world()
    return to_body(p, W[joint].translation + W['chest'].to_3x3() @ Vector(off))


FISTS = {'L': True, 'R': True}


CHEST_TURN = 0.5   # the share of the chest's lean and turn the gun takes: the muzzle stays up as the body leans in


def _on_chest(p, key, yaw):
    """A ready hold (grip, muzzle's way, top's way, body space) carried by the chest: where it sits on the standing
    chest (READY), laid on `p`'s; its ways turned CHEST_TURN of the chest's own turn."""
    q = _stance(READY, yaw)
    Rp, Rq = poses.root_matrix(p), poses.root_matrix(q)
    move = Rp.inverted() @ p.world()['chest'] @ q.world()['chest'].inverted() @ Rq
    at, aim, top = key
    rot = Quaternion().slerp(move.to_quaternion(), CHEST_TURN).to_matrix()
    return tuple(move @ Vector(at)), tuple(rot @ Vector(aim)), tuple(rot @ Vector(top))


# ---- the Thunderlock

def gunready(frame, view, yaw):
    p = _stance(READY, yaw)
    M = gun_at(p, 'R', *PORT, POLE_R)
    _hold_forestock(p, M)
    return p, {'axe': M, 'fist': dict(FISTS)}


def gunwalk(frame, view, yaw):
    p = _stance(_walk_legs(frame), yaw)
    (x, y, z), aim, top = PORT
    lift, sway = (0.0, 0.015, 0.0, 0.015)[frame], BRACE_SWAY[frame]
    M = gun_at(p, 'R', (x, y + sway, z + lift), aim, top, POLE_R)
    _hold_forestock(p, M)
    return p, {'axe': M, 'fist': dict(FISTS)}


def aimed(p, raise_deg, back):
    """The Thunderlock's grip, muzzle and top aimed: its butt in the right shoulder's pocket, its muzzle `raise_deg`
    up, thrust back `back` metres by the kick."""
    aim, top = _raised(AIM_WAY, (0.0, 0.0, 1.0), raise_deg)
    butt = _in_chest(p, 'uarm_R', POCKET) - aim * back
    bx, _, bz = guns3p.BUTT
    at = butt + aim * -bz + top * bx
    return tuple(at), tuple(aim), tuple(top)


def gunshot(frame, view, yaw):
    p = _stance(AIM, yaw, lean=SHOT_LEAN[frame])
    key = SHOT[frame]
    if key[0] is None:
        key = aimed(p, key[1], key[2])
    M = gun_at(p, 'R', *key, POLE_R)
    _hold_forestock(p, M)
    gear = {'axe': M, 'fist': dict(FISTS)}
    if frame == 2:
        gear['flash'] = _flash(M, 'thunderlock', yaw)
    return p, gear


def gunreload(frame, view, yaw):
    p = _stance({**READY, 'spine': (8, 0, -2), 'chest': (6, 0, -10), 'neck': (14, 0, 12), 'head': (6, 4, 10)}, yaw)
    (x, y, z), aim, top = RELOAD
    lift = RELOAD_LIFT[frame]
    crank = CRANK[frame]
    M = gun_at(p, 'R', (x, y, z + lift), aim, top, POLE_R, hold=crank is None)
    _hold_forestock(p, M)
    if crank is not None:   # the right fist on the crank, the gun on the left
        side = Vector(M.col[1][:3])
        at = to_body(p, M @ Vector(crank))
        rot = poses.root_matrix(p).inverted().to_3x3()
        poses.grip(p, 'R', tuple(at), tuple(rot @ -side), POLE_R)
    return p, {'axe': M, 'fist': dict(FISTS)}


def gunrun(frame, view, yaw):
    """The sprint at port arms."""
    p = poses.captured('run', frame, yaw)
    M = gun_at(p, 'R', *_on_chest(p, PORT, yaw), POLE_R)
    _hold_forestock(p, M)
    return p, {'axe': M, 'fist': dict(FISTS)}


# ---- the crossbow

# its port arms: the right fist on the stock's wrist before the right hip (grip, the bolt's way, the top's way, body
# space), the prod up toward the left shoulder, the top out from the body
XPORT = ((-0.10, -0.26, 1.26), (0.50, -0.18, 0.85), (0.0, -1.0, 0.1))
XBOW_GRIP = 0.55   # the right fist this share of the crossbow's length back from the prod's front: behind the lock
XBOW_FORE = (0.03, -0.03)   # the left fist under the forestock: the model's metres ahead of its origin and up


def xbowrun(frame, view, yaw):
    """The sprint with a crossbow at port arms: its stock through the right fist, its butt by the right hip, its prod
    up by the left shoulder, the left fist under the forestock."""
    import gear
    p = poses.captured('run', frame, yaw)
    at, aim, top = _on_chest(p, XPORT, yaw)
    rot = poses.root_matrix(p).to_3x3()
    aim_b, top_b = _ways(aim, top)
    held, _, _ = poses.grip(p, 'R', at, tuple(aim_b), POLE_R, knuckles=tuple(top_b))
    aim_w, top_w = rot @ aim_b, rot @ top_b
    X = gear.crossbow_frame(held, aim_w, top_w, hold=XBOW_GRIP, rise=0.0)
    fore = to_body(p, X @ Vector((XBOW_FORE[0], 0.0, XBOW_FORE[1])))
    poses.grip(p, 'L', tuple(fore), tuple(aim_b), POLE_L, knuckles=tuple(top_b))
    return p, {'xbow': (held, aim_w, top_w, XBOW_GRIP, 0.0), 'fist': dict(FISTS)}


# ---- the Pistolet

def pistolready(frame, view, yaw):
    p = _stance({**READY, **FREE_L}, yaw)
    return p, {'axe': gun_at(p, 'R', *HELD, POLE_R, kind='pistolet'), 'fist': {'L': False, 'R': True}}


def pistolwalk(frame, view, yaw):
    p = _stance({**_walk_legs(frame), **_swing_l(frame)}, yaw)
    (x, y, z), aim, top = HELD
    lift, sway = (0.0, 0.015, 0.0, 0.015)[frame], BRACE_SWAY[frame]
    return p, {'axe': gun_at(p, 'R', (x, y + sway, z + lift), aim, top, POLE_R, kind='pistolet'),
               'fist': {'L': False, 'R': True}}


def pistolrun(frame, view, yaw):
    """The sprint with the Pistolet up by the right shoulder, the left arm pumping as captured."""
    p = poses.captured('run', frame, yaw)
    return p, {'axe': gun_at(p, 'R', *_on_chest(p, HIGH, yaw), POLE_R, kind='pistolet'), 'fist': {'L': True, 'R': True}}


def pistol_aimed(p, deg, side='R'):
    """The Pistolet aimed straight ahead down the `side` arm: the grip at the arm's reach from its shoulder along the
    body's own forward, its muzzle splayed a little out past that shoulder and raised `deg` degrees by the kick, the
    arm rising with it. Reached along the side-on chest's forward, the arm and the muzzle swung in across the body to
    point at its middle in the front and the back views."""
    x, y, z = REACH
    s = 1.0 if side == 'R' else -1.0
    aim, top = _raised((-PISTOL_SPLAY * s, -1.0, 0.0), (0.0, 0.0, 1.0), deg)
    at = to_body(p, p.world()[f'uarm_{side}'].translation) + Vector((x * s, y, z + 0.004 * deg))
    return tuple(at), tuple(aim), tuple(top)


def pistolshot(frame, view, yaw):
    p = _stance({**DUEL, **HIP_L}, yaw)
    key, deg = PISTOL_SHOT[frame]
    M = gun_at(p, 'R', *(key or pistol_aimed(p, deg)), POLE_R, kind='pistolet')
    gear = {'axe': M, 'fist': {'L': False, 'R': True}}
    if frame == 2:
        gear['flash'] = _flash(M, 'pistolet', yaw)
    return p, gear


def pistolreload(frame, view, yaw):
    p = _stance({**READY, 'chest': (8, 0, 0), 'neck': (14, 0, 0), 'head': (8, 0, 0)}, yaw)
    if RAM[frame] is None:   # put up again, the left hand let go
        p = _stance({**READY, **FREE_L}, yaw)
        return p, {'axe': gun_at(p, 'R', *HIGH, POLE_R, kind='pistolet'), 'fist': {'L': False, 'R': True}}
    M = gun_at(p, 'R', *LOADING, POLE_R, kind='pistolet')
    rot = poses.root_matrix(p).inverted().to_3x3()
    aim = Vector(M.col[2][:3])
    muzzle = M @ Vector(guns3p.MUZZLE['pistolet'])
    poses.grip(p, 'L', tuple(to_body(p, muzzle + aim * RAM[frame])), tuple(rot @ aim), POLE_L)
    return p, {'axe': M, 'fist': dict(FISTS)}


# ---- a brace of Pistolets

def braceready(frame, view, yaw):
    p = _stance(READY, yaw)
    return p, {'axe': gun_at(p, 'R', *HELD, POLE_R, kind='pistolet'),
               'off': gun_at(p, 'L', *HELD_L, POLE_L, kind='pistolet'), 'fist': dict(FISTS)}


def bracewalk(frame, view, yaw):
    p = _stance(_walk_legs(frame), yaw)
    lift, sway = (0.0, 0.015, 0.0, 0.015)[frame], BRACE_SWAY[frame]
    (rx, ry, rz), ra, rt = HELD
    (lx, ly, lz), la, lt = HELD_L
    return p, {'axe': gun_at(p, 'R', (rx, ry + sway, rz + lift), ra, rt, POLE_R, kind='pistolet'),
               'off': gun_at(p, 'L', (lx, ly - sway, lz + lift), la, lt, POLE_L, kind='pistolet'), 'fist': dict(FISTS)}


def _brace_key(p, side, state):
    """A hand's key in the brace's shot: up by its shoulder, aimed, firing, kicked up, or coming down to aim."""
    if state == 'high':
        return HIGH if side == 'R' else HIGH_L
    deg = {'aim': 2.0, 'fire': 4.0, 'kick': 34.0, 'down': 20.0}[state]
    return pistol_aimed(p, deg, side)


def braceshot(frame, view, yaw):
    right, left, turn = BRACE_SHOT[frame]
    p = _stance({**READY, 'pelvis': (0, 0, turn * 0.4), 'neck': (4, 0, -turn * 0.6), 'head': (-6, 2, -turn * 0.4)},
                yaw, turn=turn * 0.6)
    gear = {'axe': gun_at(p, 'R', *_brace_key(p, 'R', right), POLE_R, kind='pistolet'),
            'off': gun_at(p, 'L', *_brace_key(p, 'L', left), POLE_L, kind='pistolet'), 'fist': dict(FISTS)}
    if 'fire' in (right, left):
        gear['flash'] = _flash(gear['axe'] if right == 'fire' else gear['off'], 'pistolet', yaw)
    return p, gear


def anims_of(layer):
    """The animations a gun's layer (guns3p.py `HELD`, `OFF`) is drawn in: the right fist's in its own moves, a
    Pistolet in a brace's too, and in the hurt, the spell and the forge's own as the class weapon is held there; the
    left fist's in a brace's alone."""
    if layer in guns3p.OFF:
        return list(BRACE)
    own = RIFLE if layer.startswith('thunderlock') else {**PISTOL, **BRACE}
    return [*own, 'hurt', 'spell', *poses.OWN]


# the brace up at a sprint: each Pistolet by its shoulder as at rest (HIGH, HIGH_L), held out clear of the body and a
# little ahead, its muzzle splayed out with it (the owner's)
RUN_HIGH = ((-0.43, -0.25, 1.28), (-0.22, -0.24, 0.94), (0.0, 1.0, 0.1))
RUN_HIGH_L = ((0.45, -0.29, 1.24), (0.26, -0.28, 0.92), (0.0, 1.0, 0.1))


def bracerun(frame, view, yaw):
    """The sprint with a Pistolet up by each shoulder, held out clear of the body."""
    p = poses.captured('run', frame, yaw)
    return p, {'axe': gun_at(p, 'R', *_on_chest(p, RUN_HIGH, yaw), POLE_R, kind='pistolet'),
               'off': gun_at(p, 'L', *_on_chest(p, RUN_HIGH_L, yaw), POLE_L, kind='pistolet'), 'fist': dict(FISTS)}


ANIMS = {'gunready': gunready, 'gunwalk': gunwalk, 'gunshot': gunshot, 'gunreload': gunreload, 'gunrun': gunrun,
         'pistolready': pistolready, 'pistolwalk': pistolwalk, 'pistolshot': pistolshot,
         'pistolreload': pistolreload, 'pistolrun': pistolrun, 'braceready': braceready, 'bracewalk': bracewalk,
         'braceshot': braceshot, 'bracerun': bracerun, 'xbowrun': xbowrun}
assert set(ANIMS) == set(GUNPLAY)
poses.ANIMS.update(ANIMS)
poses.FISTS.update({a: 'LR' for a in ANIMS})
