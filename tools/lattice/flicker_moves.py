"""The Flicker's own moves for the Sprite Forge. After the owner's own in project-final: it never walks, it blinks; it
holds with the Husk's uncanny life (breath, weight shift, the twitch); it lands from a blink and winds up, the wind-up
its tell; its strikes are a kinetic chain, the hips first and the blade whipping last, and never the same twice
running: a left slash, a right slash, and both blades brought down overhead a beat apart, since both swiping the same
arc at once "reads as a toy". Angles as motion.py's; a pose for the right blade is the left's mirrored."""
import numpy as np

import poses
from motion import COIL, CROUCH, blend, drawn, summed, through, tremor

# Its stance: the knees bent and wide, the trunk forward, the blades held out, down and forward.
READY = {'pelvis': (0, 0, 0), 'spine': (10, 0, 0), 'chest': (6, 0, 0), 'neck': (12, 0, 0),
         'thigh_L': (-14, -10, -10), 'shin_L': (24, 0, 0), 'foot_L': (-6, 0, 8),
         'thigh_R': (-6, 10, 10), 'shin_R': (22, 0, 0), 'foot_R': (-8, 0, -8),
         'uarm_L': (-36, -14, 0), 'farm_L': (-26, 0, 0), 'hand_L': (0, 0, 0),
         'uarm_R': (-32, 12, 0), 'farm_R': (-24, 0, 0), 'hand_R': (0, 0, 0)}


def mirrored(rot):
    """A pose for the other side: each joint's twin, turned the other way about Y and Z (poses.py `_mirror_legs`)."""
    return poses._mirror_legs(rot)


# The idle's twelve frames: each the chest's breath, the pelvis's weight on one leg, the stump's cock (where its head
# was), how far each blade sways out, and the twitch, a convulsion through the trunk and the right blade at frame 7.
IDLE = [(0, -3, 0, 0, 0), (1, -3, 2, 1, 0), (2, -2, 4, 2, 0), (2, 0, 4, 2, 0), (1, 2, 3, 1, 0), (0, 3, 0, 0, 0),
        (-1, 3, -2, -1, 0), (2, 2, 10, 4, 1), (0, 1, -4, -2, 0.4), (-1, -1, -3, -1, 0), (-1, -2, -1, 0, 0),
        (0, -3, 0, 0, 0)]


def idle(frame, view, yaw):
    breath, weight, cock, sway, twitch = IDLE[frame]
    rot = summed(READY, tremor('flicker_idle', frame, 1.0), {
        'chest': (breath + twitch * 8, twitch * 5, twitch * -6), 'spine': (twitch * 5, 0, 0),
        'pelvis': (0, weight * 0.5, weight), 'neck': (cock * 0.5, cock, 0),
        'uarm_L': (0, -sway, 0), 'uarm_R': (twitch * -14, sway + twitch * 10, 0)})
    return drawn(rot, yaw)


# The landing of a blink, six frames: folded, the trunk bowed over crossed blades, unfolding into its stance. The game
# draws the dissolve over it; blinking out is these frames backwards.
FOLDED = summed(COIL, {'spine': (34, 0, 0), 'chest': (20, 0, 0), 'neck': (20, 0, 0),
                       'uarm_L': (-54, 26, 0), 'farm_L': (-58, 0, 0), 'uarm_R': (-50, -24, 0), 'farm_R': (-60, 0, 0)})


def arrive(frame, view, yaw):
    t = frame / 5
    rot = summed(through([FOLDED, blend(FOLDED, READY, 0.75), READY], t), tremor('flicker_arrive', frame, 1.2))
    return drawn(rot, yaw)


# The left slash, ten frames, each the pelvis's turn, the chest's turn and lean, the left upper arm, its elbow, and
# how hard it trembles: coiled, the blade raised back and out, held trembling two frames as its tell; the hips fire,
# then the chest, then the arm, the forearm lagging so the blade whips down across the body; followed through; back.
SLASH = [
    (0, 0, 0, (-36, -14, 0), -26, 0.8),
    (14, 22, -4, (10, -74, 0), -36, 1.0),
    (16, 26, -6, (14, -80, 0), -40, 1.8),
    (16, 26, -6, (14, -82, 0), -42, 1.8),
    (-8, 16, 0, (2, -70, 0), -54, 0.6),
    (-16, -12, 8, (-36, -40, 0), -62, 0.4),
    (-20, -30, 12, (-72, 12, 0), -18, 0.4),
    (-22, -36, 14, (-56, 34, 0), -30, 0.6),
    (-10, -16, 8, (-40, -6, 0), -26, 0.8),
    (0, 0, 2, (-36, -16, 0), -26, 0.8),
]


def slash(frame, yaw, mirror):
    hips, turn, lean, arm, elbow, shake = SLASH[frame]
    legs = CROUCH if 1 <= frame <= 3 else {}
    rot = summed(READY, legs, tremor('flicker_slash', frame, shake), {
        'pelvis': (0, 0, hips), 'chest': (lean, 0, turn)})
    rot['uarm_L'], rot['farm_L'] = arm, (elbow, 0, 0)
    return drawn(mirrored(rot) if mirror else rot, yaw)


def slash_left(frame, view, yaw):
    return slash(frame, yaw, False)


def slash_right(frame, view, yaw):
    return slash(frame, yaw, True)


# The overhead, twelve frames: both blades raised high, the trunk arched back, held trembling three frames as its
# tell, the longest since it is the strike it commits to; the hips drop, the left blade falls a beat before the right;
# both low, the trunk bowed after them; back to its stance. Each frame: the spine's arch, each upper arm's raise and
# each elbow, the legs.
HIGH, LOW = -150, -36
OVERHEAD = [
    (0, -28, -24, -22, -20, {}),
    (-6, -90, -84, -30, -30, {}),
    (-12, HIGH, HIGH + 6, -24, -26, CROUCH),
    (-14, HIGH, HIGH + 4, -26, -28, CROUCH),
    (-14, HIGH + 2, HIGH + 6, -26, -26, CROUCH),
    (-14, HIGH, HIGH + 4, -28, -28, CROUCH),
    (0, -110, HIGH + 10, -40, -30, COIL),
    (14, LOW - 20, -112, -10, -40, COIL),
    (24, LOW, LOW - 16, -8, -12, COIL),
    (28, LOW + 8, LOW, -14, -8, CROUCH),
    (14, -32, -30, -20, -18, {}),
    (2, -28, -24, -22, -20, {}),
]


def overhead(frame, view, yaw):
    arch, left, right, left_elbow, right_elbow, legs = OVERHEAD[frame]
    shake = 1.8 if 3 <= frame <= 5 else 0.7
    rot = summed(READY, legs, tremor('flicker_overhead', frame, shake), {'spine': (arch, 0, 0), 'chest': (arch * 0.6, 0, 0)})
    rot['uarm_L'], rot['farm_L'] = (left, -14, 0), (left_elbow, 0, 0)
    rot['uarm_R'], rot['farm_R'] = (right, 14, 0), (right_elbow, 0, 0)
    return drawn(rot, yaw)


MOVES = {'flicker_idle': (idle, IDLE), 'flicker_arrive': (arrive, range(6)),
         'flicker_slash_left': (slash_left, SLASH), 'flicker_slash_right': (slash_right, SLASH),
         'flicker_overhead': (overhead, OVERHEAD)}
