"""The forge's one-handed fighting: a sword in the right fist and a shield on the left arm (the guard, the march, the
slash and the block), or a sword in each fist (the twin guard, march and slash). Daggerfall draws neither, so each is
keyed in body space, as the idle and the walk are, the same in every view.

A shield is set by where it stands: its middle, the way its face looks and its up. The left fist is solved onto the
handle behind its middle, and the shield is laid where the fist holds it, so it never floats off the hand. A pair is
held ready, high and low, and cut with in turn, each blow the one-hander's and the left's its mirror, the chest turning
through each and the feet planted. What the left hand holds goes to the gear as `off`, its own frame as the
weapon's: for a sword, the grip at the origin and the blade up +Z; for a shield, its middle at the origin, +Z its up
and -Y the way its face looks.

Points and ways are in body space, as poses.py's: the ground under the body, +X its left, -Y ahead, +Z up."""
from mathutils import Vector

import poses

ONEHAND = {'guard': 1, 'march': 4, 'slash': 6, 'block': 1, 'twinguard': 1, 'twinmarch': 4, 'twinslash': 6}
SHIELDED = ('guard', 'march', 'slash', 'block')   # the shield's animations
TWIN = ('twinguard', 'twinmarch', 'twinslash')    # the second sword's
HANDLE = 0.06    # the fist behind the shield's middle, metres
BLADE = (-0.9, -0.1, 0.1)   # a sword's flat as carried: its edges fore and aft

# a fighter's guard: the left foot ahead, the knees bent, the chest turned a little to the right so the shield leads
GUARD = {'pelvis': (0, 0, -8), 'spine': (6, 0, 4), 'chest': (4, 0, 6), 'neck': (2, 0, -4), 'head': (-6, 0, -6),
         'thigh_L': (-22, -8, -12), 'shin_L': (18, 0, 0), 'foot_L': (2, 0, 10),
         'thigh_R': (14, 10, 16), 'shin_R': (22, 0, 0), 'foot_R': (-4, 0, -14)}

# the sword: (the right fist, the blade's line up from it), in the guard, the march and each key of the slash. The
# guard holds it forward and up, ready; the march carries it out to the side, so seen from ahead it is not end on. The
# cut: wound back over the right shoulder, raised, thrown forward, down across the body to the left hip, through, and
# back to the guard
SWORD_GUARD = ((-0.22, -0.36, 1.06), (0.1, -0.62, 0.78))
SWORD_MARCH = ((-0.32, -0.14, 0.92), (-0.35, -0.62, 0.7))
SLASH = [((-0.30, 0.04, 1.50), (-0.25, 0.6, 0.76)),
         ((-0.24, -0.12, 1.74), (0.0, 0.25, 1.0)),
         ((-0.14, -0.48, 1.46), (0.2, -0.92, 0.3)),
         ((0.06, -0.52, 1.04), (0.45, -0.7, -0.55)),
         ((0.16, -0.36, 0.88), (0.55, -0.35, -0.75)),
         ((-0.22, -0.34, 1.06), (0.1, -0.62, 0.78))]
SLASH_TURN = [-24, -30, -8, 24, 30, 8]    # the chest's turn through the cut, degrees: wound back, then thrown through
SLASH_LEAN = [-4, -2, 8, 14, 12, 4]
# the legs through the cut: the weight back on the right as it winds up, then thrown onto the bent left knee, the right
# leg driving straight behind, and back to the guard
SLASH_LEGS = [{'thigh_L': (-16, -8, -12), 'shin_L': (10, 0, 0), 'thigh_R': (8, 10, 16), 'shin_R': (30, 0, 0)},
              {'thigh_L': (-14, -8, -12), 'shin_L': (8, 0, 0), 'thigh_R': (6, 10, 16), 'shin_R': (32, 0, 0)},
              {'thigh_L': (-26, -8, -12), 'shin_L': (24, 0, 0), 'thigh_R': (18, 10, 16), 'shin_R': (16, 0, 0)},
              {'thigh_L': (-34, -8, -12), 'shin_L': (34, 0, 0), 'thigh_R': (26, 10, 16), 'shin_R': (8, 0, 0)},
              {'thigh_L': (-34, -8, -12), 'shin_L': (34, 0, 0), 'thigh_R': (26, 10, 16), 'shin_R': (8, 0, 0)},
              {}]

# the shield: (its middle, the way its face looks, its up). In the guard up before the chest; in the cut swung out to
# the left, so the blade passes clear of it; in the block thrown up before the face
SHIELD_GUARD = ((0.17, -0.46, 1.18), (0.2, -1.0, 0.05), (0.0, 0.0, 1.0))
SHIELD_MARCH = ((0.26, -0.32, 1.06), (0.35, -1.0, 0.0), (0.0, 0.0, 1.0))
SHIELD_ASIDE = ((0.36, -0.22, 1.08), (0.8, -0.6, 0.0), (0.0, 0.0, 1.0))
SHIELD_SLASH = [SHIELD_GUARD] * 2 + [SHIELD_ASIDE] * 3 + [SHIELD_GUARD]
SHIELD_BLOCK = ((0.08, -0.50, 1.46), (0.05, -1.0, 0.25), (0.0, 0.25, 1.0))
SWORD_BLOCK = ((-0.30, -0.06, 1.05), (-0.1, -0.4, 0.9))
BLOCK_LEGS = {'thigh_L': (-26, -8, -12), 'shin_L': (28, 0, 0), 'thigh_R': (18, 10, 16), 'shin_R': (28, 0, 0)}

# two swords, each (the fist, the blade's line), right then left. The guard stands light and upright, each fist out at
# its hip and each blade forward, up and out to its own side, a V that reads apart from ahead and from behind and
# never crosses the chest; the right a little higher. The march carries them so, ready, each swinging a little against
# its own foot
TWIN_GUARD = (((-0.30, -0.26, 1.04), (-0.40, -0.55, 0.73)), ((0.28, -0.34, 0.98), (0.45, -0.62, 0.64)))
TWIN_MARCH = (((-0.28, -0.30, 1.02), (0.0, -0.7, 0.72)), ((0.26, -0.30, 0.98), (0.3, -0.7, 0.6)))
TWIN_LEGS = {'thigh_L': (-14, -6, -10), 'shin_L': (12, 0, 0), 'thigh_R': (10, 8, 12), 'shin_R': (14, 0, 0)}   # the knees eased
TWIN_SWING = (0.04, 0.0, -0.04, 0.0)   # each fist's sway fore (-Y) and aft through the march's keys, against the stride


def _mirror(key):
    """A right fist's key as the left's: across the body's middle."""
    (x, y, z), (a, b, c) = key
    return (-x, y, z), (-a, b, c)


# the combination: the right wound back over its shoulder and thrown down across to the left hip while the left winds
# up over its own; then the left thrown down across to the right hip while the right comes back to the guard. Each key:
# (the right's, the left's, the chest's turn and lean, the legs): the weight thrown onto the bent left knee and held
# there through both cuts, then eased back into the twin guard's own stance, so the idle after it never jumps
TWIN_SLASH = [(SLASH[0], TWIN_GUARD[1], -26, -3, SLASH_LEGS[0]),
              (SLASH[2], _mirror(SLASH[1]), -6, 8, SLASH_LEGS[2]),
              (SLASH[4], _mirror(SLASH[0]), 26, 12, SLASH_LEGS[3]),
              (((-0.26, -0.40, 0.96), (0.0, -0.8, 0.5)), _mirror(SLASH[2]), 6, 10, SLASH_LEGS[3]),
              (TWIN_GUARD[0], _mirror(SLASH[4]), -24, 12, SLASH_LEGS[3]),
              (TWIN_GUARD[0], TWIN_GUARD[1], -4, -2, TWIN_LEGS)]


def _rot(extra, turn=0.0, lean=0.0):
    rot = dict(GUARD)
    rot['chest'] = (rot['chest'][0] + lean, rot['chest'][1], rot['chest'][2] + turn)
    rot.update(extra)
    return rot


def _stance(extra, yaw, turn=0.0, lean=0.0):
    return poses.stance(_rot(extra, turn, lean), yaw)


def _march_legs(frame):
    legs = poses.WALK_LEGS[frame % 2] if frame < 2 else poses._mirror_legs(poses.WALK_LEGS[frame % 2])
    lead_left = frame in (0, 1)
    return {**legs, 'pelvis': (0, 0, -5 if lead_left else 5), 'spine': (8, 0, 0),
            'chest': (3, 0, 3 if lead_left else -3), 'neck': (6, 0, 0), 'head': (-8, 0, 0)}


def sword(p, side, key, blade=BLADE):
    """A sword in the `side` fist at `key` (the fist, the blade's line), as the gear's frame."""
    (at, way) = key
    if side == 'R':
        return poses.axe_at(p, at, way, blade, pole_r=(-1, 0.6, -0.3))
    at_w, way_w, _ = poses.grip(p, 'L', at, way, (1, 0.6, -0.3))
    rot = poses.root_matrix(p).to_3x3()
    return poses.frame_matrix(at_w, way_w, rot @ Vector((-blade[0], blade[1], blade[2])))


def shield(p, key):
    """The shield on the left arm, its middle at `key`'s (its middle, the way its face looks, its up): the fist on the
    handle behind it, across the shield, and the shield laid where the fist holds it, as the gear's frame."""
    mid, face, up = (Vector(v) for v in key)
    face, up = face.normalized(), (up - up.project(face)).normalized()
    across = up.cross(face)   # +X of the shield's own frame, so its -Y looks out of its face
    at_w, _, _ = poses.grip(p, 'L', tuple(mid - face * HANDLE), tuple(across), (1, 0.3, -0.5),
                            knuckles=tuple(face))   # the forearm comes in behind it, the fist on the handle
    rot = poses.root_matrix(p).to_3x3()
    face_w, up_w = rot @ face, rot @ up
    return poses.frame_matrix(at_w + face_w * HANDLE, up_w, up_w.cross(face_w))


FISTS = {'L': True, 'R': True}


def guard(frame, view, yaw):
    p = _stance({}, yaw)
    return p, {'axe': sword(p, 'R', SWORD_GUARD), 'off': shield(p, SHIELD_GUARD), 'fist': dict(FISTS)}


def march(frame, view, yaw):
    p = poses.stance(_march_legs(frame), yaw)
    bob = Vector((0.0, 0.0, (0.0, 0.015, 0.0, 0.015)[frame]))
    at, way = SWORD_MARCH
    mid, face, up = SHIELD_MARCH
    return p, {'axe': sword(p, 'R', (tuple(Vector(at) + bob), way)),
               'off': shield(p, (tuple(Vector(mid) + bob), face, up)), 'fist': dict(FISTS)}


def slash(frame, view, yaw):
    p = _stance(SLASH_LEGS[frame], yaw, SLASH_TURN[frame], SLASH_LEAN[frame])
    return p, {'axe': sword(p, 'R', SLASH[frame]), 'off': shield(p, SHIELD_SLASH[frame]), 'fist': dict(FISTS)}


def block(frame, view, yaw):
    p = _stance({'chest': (6, 0, 12), **BLOCK_LEGS}, yaw)
    return p, {'axe': sword(p, 'R', SWORD_BLOCK), 'off': shield(p, SHIELD_BLOCK), 'fist': dict(FISTS)}


def twinguard(frame, view, yaw):
    p = _stance({'chest': (2, 0, -4), **TWIN_LEGS}, yaw)
    return p, {'axe': sword(p, 'R', TWIN_GUARD[0]), 'off': sword(p, 'L', TWIN_GUARD[1]), 'fist': dict(FISTS)}


def twinmarch(frame, view, yaw):
    p = poses.stance(_march_legs(frame), yaw)
    lift, sway = (0.0, 0.015, 0.0, 0.015)[frame], TWIN_SWING[frame]
    (rat, rway), (lat, lway) = TWIN_MARCH
    right = (tuple(Vector(rat) + Vector((0.0, sway, lift))), rway)
    left = (tuple(Vector(lat) + Vector((0.0, -sway, lift))), lway)
    return p, {'axe': sword(p, 'R', right), 'off': sword(p, 'L', left), 'fist': dict(FISTS)}


def twinslash(frame, view, yaw):
    """The combination (`TWIN_SLASH`): the right cuts across while the left winds up, then the left cuts back across."""
    right, left, turn, lean, legs = TWIN_SLASH[frame]
    p = poses.stance(_rot({'chest': (4 + lean, 0, turn), **legs}), yaw)
    return p, {'axe': sword(p, 'R', right), 'off': sword(p, 'L', left), 'fist': dict(FISTS)}


ANIMS = {'guard': guard, 'march': march, 'slash': slash, 'block': block, 'twinguard': twinguard,
         'twinmarch': twinmarch, 'twinslash': twinslash}
poses.ANIMS.update(ANIMS)
poses.FISTS.update({a: 'LR' for a in ANIMS})
