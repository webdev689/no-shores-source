"""The Idol's own moves for the Sprite Forge. After the owner's own in project-final: it never walks, it blinks; at rest
its emitter is held low and to its right, dormant; to fire it raises it, thrust forward and level, locks its line and
holds its facing through the charge, the tell, its lens's glow growing as the game draws it; then the beam, and it
blinks away to a perch. Both wrists stay welded at the breech in every pose, the right hand pointing the barrel.
Angles and places as motion.py's."""
from motion import BRACE, COIL, STAND, blend, drawn, laid, scaled, summed, through, tremor

POISE = summed(STAND, {'spine': (6, 0, 0), 'chest': (4, 0, 0), 'neck': (4, 0, 0)})
LOW = ((-0.15, -0.22, 1.06), (-0.3, -0.6, -0.74))   # the breech and the barrel's way, dormant: down past its right hip
LEVEL = ((0.0, -0.44, 1.34), (0.0, -1.0, 0.02))     # raised, thrust forward and level
KICK = ((0.0, -0.34, 1.42), (0.0, -0.9, 0.42))      # thrown up and back by the beam
TUCKED = ((-0.12, -0.18, 1.2), (-0.35, -0.45, -0.82))   # held in to its chest as it lands from a blink


def welded(pose, breech, way):
    """The right wrist on the breech, its hand along the barrel's way; the left wrist welded beside it."""
    laid(pose, 'R', breech, way, up=(0.0, 0.0, 1.0))
    return laid(pose, 'L', tuple(b + o for b, o in zip(breech, (0.05, 0.03, 0.0))), way, up=(0.0, 0.0, 1.0))


def between(a, b, t):
    return tuple(tuple(x + (y - x) * t for x, y in zip(p, q)) for p, q in zip(a, b))


def eased(t):
    return t * t * (3 - 2 * t)


# The idle's twelve frames: the breath, the weight, the head's slow bow and cock, watching, and the emitter's drift,
# with one twitch of it at frame 8.
IDLE = [(0, -2, (10, 4, 0), 0.0), (1, -2, (11, 6, 2), 0.01), (2, -1, (12, 8, 3), 0.02), (2, 0, (12, 8, 4), 0.02),
        (1, 1, (11, 6, 3), 0.01), (0, 2, (10, 3, 1), 0.0), (-1, 2, (9, 0, -1), -0.01), (-1, 1, (8, -3, -2), -0.02),
        (2, 0, (14, -6, -6), 0.06), (0, -1, (10, -3, -3), -0.01), (-1, -2, (9, 0, -1), 0.0), (0, -2, (10, 2, 0), 0.0)]


def idle(frame, view, yaw):
    breath, weight, head, drift = IDLE[frame]
    rot = summed(POISE, tremor('idol_idle', frame, 0.6), {'chest': (breath, 0, 0), 'pelvis': (0, weight * 0.5, weight)})
    rot['head'] = head
    pose, gear = drawn(rot, yaw)
    breech, way = LOW
    return welded(pose, (breech[0], breech[1] - drift, breech[2] + drift), way), gear


def aim(frame, view, yaw):
    """Four frames from dormant to locked: the emitter raised and levelled, the legs set wide, the head brought in
    line behind the barrel."""
    t = (frame + 1) / 4
    rot = summed(blend(POISE, summed(POISE, BRACE), t), tremor('idol_aim', frame, 0.6))
    rot['head'] = (10 - 4 * t, 0, 0)
    pose, gear = drawn(rot, yaw)
    return welded(pose, *between(LOW, LEVEL, eased(t))), gear


def charge(frame, view, yaw):
    """Eight frames held on its locked line, trembling harder as the charge builds: the tell. It loops."""
    rot = summed(POISE, BRACE, tremor('idol_charge', frame, 0.6 + frame * 0.2, ('spine', 'chest', 'neck')))
    rot['head'] = (6, 0, 0)
    pose, gear = drawn(rot, yaw)
    return welded(pose, *LEVEL), gear


# The beam's six frames: thrown up and back by it, the chest rocked, the legs easing out of their brace, then lowered
# to dormant.
FIRE = [(1.0, -12), (0.8, -8), (0.45, -4), (0.2, -1), (0.05, 0), (0.0, 0)]


def fire(frame, view, yaw):
    kick, rock = FIRE[frame]
    rot = summed(POISE, scaled(BRACE, 1 - eased(frame / 5)), {'chest': (rock, 0, 0), 'spine': (rock * 0.5, 0, 0)})
    rot['head'] = (6 - rock * 0.5, 0, 0)
    pose, gear = drawn(rot, yaw)
    return welded(pose, *between(between(LEVEL, LOW, eased(frame / 5)), KICK, kick)), gear


# The landing of a blink, six frames: folded, bowed over its emitter held in to its chest, unfolding to dormant.
FOLDED = summed(POISE, COIL, {'spine': (24, 0, 0), 'chest': (14, 0, 0), 'neck': (12, 0, 0)})


def arrive(frame, view, yaw):
    t = frame / 5
    rot = summed(through([FOLDED, blend(FOLDED, POISE, 0.75), POISE], t), tremor('idol_arrive', frame, 1.0))
    rot['head'] = (20 - 10 * t, 0, 0)
    pose, gear = drawn(rot, yaw)
    return welded(pose, *between(TUCKED, LOW, eased(t))), gear


MOVES = {'idol_idle': (idle, IDLE), 'idol_aim': (aim, range(4)), 'idol_charge': (charge, range(8)),
         'idol_fire': (fire, FIRE), 'idol_arrive': (arrive, range(6))}
