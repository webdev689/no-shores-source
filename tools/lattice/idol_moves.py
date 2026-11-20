"""The Idol's own moves for the Sprite Forge. After the owner's own in project-final: it never walks, it blinks; at rest
its emitter is held lower and in, dormant; to fire it raises it, thrust forward and level, locks its line and holds
its facing through the charge, the tell; then the beam, and it blinks away to a perch. Both wrists stay welded at the
breech in every pose, the right hand pointing the barrel. Angles and places as motion.py's."""
from mathutils import Vector

import poses
from motion import COIL, blend, drawn, summed, through, tremor
from rig import solve_arm

STAND = {'spine': (6, 0, 0), 'chest': (4, 0, 0), 'neck': (4, 0, 0),
         'thigh_L': (-8, -6, -8), 'shin_L': (10, 0, 0), 'foot_L': (-2, 0, 6),
         'thigh_R': (2, 6, 8), 'shin_R': (8, 0, 0), 'foot_R': (-4, 0, -6)}
BRACE = {'thigh_L': (-20, -10, -12), 'shin_L': (22, 0, 0), 'thigh_R': (10, 10, 14), 'shin_R': (20, 0, 0)}
LOW = ((0.0, -0.26, 1.12), (0.0, -0.72, -0.69))     # the breech and the barrel's way, dormant: slanted down before it
LEVEL = ((0.0, -0.44, 1.34), (0.0, -1.0, 0.02))     # raised, thrust forward and level
KICK = ((0.0, -0.34, 1.42), (0.0, -0.9, 0.42))      # thrown up and back by the beam


def welded(pose, breech, way):
    """The right wrist on the breech, its hand along the barrel's way; the left wrist welded beside it."""
    at = poses.root_matrix(pose)
    turn = at.to_3x3()
    aim = (turn @ Vector(way)).normalized()
    solve_arm(pose, 'R', at @ Vector(breech), turn @ Vector((-0.8, 0.4, -0.6)), hand_dir=aim,
              hand_up=turn @ Vector((0.0, 0.0, 1.0)))
    solve_arm(pose, 'L', at @ (Vector(breech) + Vector((0.05, 0.03, 0.0))), turn @ Vector((0.8, 0.5, -0.6)),
              hand_dir=aim, hand_up=turn @ Vector((0.0, 0.0, 1.0)))
    return pose


def between(a, b, t):
    return tuple(tuple(x + (y - x) * t for x, y in zip(p, q)) for p, q in zip(a, b))


# The idle's twelve frames: the breath, the weight, the head's slow bow and cock (venerated, watching), and the
# emitter's drift, with one twitch of it at frame 8.
IDLE = [(0, -2, (10, 4, 0), 0.0), (1, -2, (11, 6, 2), 0.01), (2, -1, (12, 8, 3), 0.02), (2, 0, (12, 8, 4), 0.02),
        (1, 1, (11, 6, 3), 0.01), (0, 2, (10, 3, 1), 0.0), (-1, 2, (9, 0, -1), -0.01), (-1, 1, (8, -3, -2), -0.02),
        (2, 0, (14, -6, -6), 0.06), (0, -1, (10, -3, -3), -0.01), (-1, -2, (9, 0, -1), 0.0), (0, -2, (10, 2, 0), 0.0)]


def idle(frame, view, yaw):
    breath, weight, head, drift = IDLE[frame]
    rot = summed(STAND, tremor('idol_idle', frame, 0.6), {'chest': (breath, 0, 0), 'pelvis': (0, weight * 0.5, weight)})
    rot['head'] = head
    p, gear = drawn(rot, yaw)
    breech, way = LOW
    return welded(p, (breech[0], breech[1] - drift, breech[2] + drift), way), gear


def aim(frame, view, yaw):
    """Four frames from dormant to locked: the emitter raised and levelled, the legs set wide, the head brought in
    line behind the barrel."""
    t = (frame + 1) / 4
    rot = summed(blend(STAND, summed(STAND, BRACE), t), tremor('idol_aim', frame, 0.6))
    rot['head'] = (10 - 4 * t, 0, 0)
    p, gear = drawn(rot, yaw)
    return welded(p, *between(LOW, LEVEL, t * t * (3 - 2 * t))), gear


def charge(frame, view, yaw):
    """Eight frames held on its locked line, trembling harder as the charge builds: the tell. It loops."""
    rot = summed(STAND, BRACE, tremor('idol_charge', frame, 0.6 + frame * 0.2, ('spine', 'chest', 'neck')))
    rot['head'] = (6, 0, 0)
    p, gear = drawn(rot, yaw)
    return welded(p, *LEVEL), gear


# The beam's six frames: thrown up and back by it, the chest rocked, then lowered to dormant.
FIRE = [(1.0, -12), (0.8, -8), (0.45, -4), (0.2, -1), (0.05, 0), (0.0, 0)]


def fire(frame, view, yaw):
    kick, rock = FIRE[frame]
    rot = summed(STAND, BRACE if frame < 3 else {}, {'chest': (rock, 0, 0), 'spine': (rock * 0.5, 0, 0)})
    rot['head'] = (6 - rock * 0.5, 0, 0)
    p, gear = drawn(rot, yaw)
    settle = between(LEVEL, LOW, frame / 5)
    return welded(p, *between(settle, KICK, kick)), gear


# The landing of a blink, six frames: folded, bowed over its emitter held to its chest, unfolding to dormant.
FOLDED = summed(COIL, {'spine': (30, 0, 0), 'chest': (18, 0, 0), 'neck': (16, 0, 0)})
TUCKED = ((0.0, -0.12, 1.12), (0.0, -0.2, -0.98))


def arrive(frame, view, yaw):
    t = frame / 5
    rot = summed(through([FOLDED, blend(FOLDED, STAND, 0.75), STAND], t), tremor('idol_arrive', frame, 1.0))
    rot['head'] = (20 - 10 * t, 0, 0)
    p, gear = drawn(rot, yaw)
    return welded(p, *between(TUCKED, LOW, t)), gear


MOVES = {'idol_idle': (idle, IDLE), 'idol_aim': (aim, range(4)), 'idol_charge': (charge, range(8)),
         'idol_fire': (fire, FIRE), 'idol_arrive': (arrive, range(6))}
