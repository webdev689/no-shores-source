"""The Flicker's own moves for the Sprite Forge. After the owner's own in project-final: it never walks, it blinks; it
holds with the Husk's uncanny life (breath, weight shift, the twitch); it lands from a blink and winds up, the wind-up
its tell; its strikes are a kinetic chain, the hips first and the blade whipping last, and never the same twice
running: a left slash, a right slash, and both blades brought down overhead a beat apart, since both swiping the same
arc at once "reads as a toy". Its blades are longer than its wrists are high, so every pose keeps them clear of the
ground. Angles as motion.py's; a pose for the right blade is the left's mirrored."""
from motion import COIL, CROUCH, blend, drawn, mirrored, scaled, summed, through, tremor

# Its stance: the knees bent and wide, the trunk forward, the blades held out, down and forward.
READY = {'pelvis': (0, 0, 0), 'spine': (10, 0, 0), 'chest': (6, 0, 0), 'neck': (12, 0, 0),
         'thigh_L': (-14, -10, -10), 'shin_L': (24, 0, 0), 'foot_L': (-6, 0, 8),
         'thigh_R': (-6, 10, 10), 'shin_R': (22, 0, 0), 'foot_R': (-8, 0, -8),
         'uarm_L': (-40, -14, 0), 'farm_L': (-28, 0, 0), 'hand_L': (0, 0, 0),
         'uarm_R': (-36, 12, 0), 'farm_R': (-26, 0, 0), 'hand_R': (0, 0, 0)}


def legs(crouch, coil=0.0):
    """How far its knees bend past its stance's: shares of the crouch and of the coil."""
    return summed(scaled(CROUCH, crouch), scaled(COIL, coil))


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
        'uarm_L': (-twitch * 6, -sway, 0), 'uarm_R': (twitch * -20, sway + twitch * 10, 0)})
    return drawn(rot, yaw)


# The landing of a blink, six frames: folded, the trunk bowed over its blades crossed before it, the left over the
# right, unfolding into its stance. The game draws the dissolve over it; blinking out is these frames backwards.
FOLDED = summed(READY, COIL, {'spine': (24, 0, 0), 'chest': (14, 0, 0), 'neck': (8, 0, 0),
                              'uarm_L': (-24, 40, 0), 'farm_L': (-32, 0, 0), 'uarm_R': (-14, -34, 0),
                              'farm_R': (-34, 0, 0)})


def arrive(frame, view, yaw):
    t = frame / 5
    rot = summed(through([FOLDED, blend(FOLDED, READY, 0.75), READY], t), tremor('flicker_arrive', frame, 1.2))
    return drawn(rot, yaw)


# The left slash, ten frames, each the pelvis's turn, the chest's turn and lean, the left upper arm, its elbow, how far
# the knees bend and how hard it trembles: coiled, the blade raised back and out, held trembling two frames as its
# tell; the hips fire, then the chest, then the arm, the forearm lagging so the blade whips down across the body;
# followed through; back. The other blade is thrown out behind it for balance, clear of its legs.
SLASH = [
    (0, 0, 0, (-40, -14, 0), -28, 0.0, 0.8),
    (14, 22, -4, (10, -74, 0), -36, 0.7, 1.0),
    (16, 26, -6, (14, -80, 0), -40, 1.0, 1.8),
    (16, 26, -6, (14, -82, 0), -42, 1.0, 1.8),
    (-8, 16, 0, (2, -70, 0), -54, 0.6, 0.6),
    (-16, -12, 8, (-36, -40, 0), -62, 0.3, 0.4),
    (-20, -30, 12, (-72, 12, 0), -40, 0.2, 0.4),
    (-22, -36, 14, (-60, 30, 0), -44, 0.2, 0.6),
    (-10, -16, 8, (-44, -6, 0), -32, 0.1, 0.8),
    (0, 0, 2, (-40, -14, 0), -28, 0.0, 0.8),
]
BALANCE = {'uarm_R': (-4, 58, 0), 'farm_R': (-40, 0, 0)}   # the other blade out to the side, held level
OFF = (0.0, 0.7, 1.0, 1.0, 1.0, 1.0, 1.0, 0.8, 0.4, 0.0)   # how far it is thrown out, frame by frame


def slash(frame, yaw, mirror):
    hips, turn, lean, arm, elbow, crouch, shake = SLASH[frame]
    rot = summed(READY, legs(crouch), tremor('flicker_slash', frame, shake), {
        'pelvis': (0, 0, hips), 'chest': (lean, 0, turn)})
    rot.update(blend({j: rot[j] for j in BALANCE}, BALANCE, OFF[frame]))
    rot['uarm_L'], rot['farm_L'] = arm, (elbow, 0, 0)
    return drawn(mirrored(rot) if mirror else rot, yaw)


def slash_left(frame, view, yaw):
    return slash(frame, yaw, False)


def slash_right(frame, view, yaw):
    return slash(frame, yaw, True)


# The overhead, twelve frames: both blades raised high and spread, laid back over the shoulders, the trunk arched
# back, held trembling three frames as its tell, the longest since it is the strike it commits to; the hips drop, the
# left blade falls a beat before the right; both brought down before it to point at what it struck, the trunk bowed
# after them, the elbows bent so the points stop short of the ground; back to its stance. Each frame: the spine's
# arch, each upper arm's raise and spread, each elbow, how far the knees bend and how far they coil.
OVERHEAD = [
    (0, (-40, -14), (-36, 12), -28, -26, 0.0, 0.0),
    (-6, (-100, 6), (-92, -4), -40, -36, 0.3, 0.0),
    (-12, (-150, 24), (-146, -22), -62, -58, 0.8, 0.0),
    (-14, (-152, 26), (-148, -24), -64, -60, 1.0, 0.0),
    (-14, (-150, 26), (-150, -24), -62, -62, 1.0, 0.0),
    (-14, (-152, 24), (-148, -26), -64, -60, 1.0, 0.0),
    (0, (-120, 18), (-150, -24), -40, -62, 0.4, 0.6),
    (14, (-70, 4), (-118, -18), -54, -44, 0.0, 1.0),
    (22, (-52, -6), (-72, 2), -66, -56, 0.0, 1.0),
    (24, (-50, -8), (-54, 6), -64, -66, 0.4, 0.6),
    (12, (-44, -12), (-42, 10), -40, -38, 0.3, 0.0),
    (2, (-40, -14), (-36, 12), -30, -28, 0.0, 0.0),
]


def overhead(frame, view, yaw):
    arch, left, right, left_elbow, right_elbow, crouch, coil = OVERHEAD[frame]
    shake = 1.8 if 3 <= frame <= 5 else 0.7
    rot = summed(READY, legs(crouch, coil), tremor('flicker_overhead', frame, shake),
                 {'spine': (arch, 0, 0), 'chest': (arch * 0.6, 0, 0)})
    rot['uarm_L'], rot['farm_L'] = (*left, 0), (left_elbow, 0, 0)
    rot['uarm_R'], rot['farm_R'] = (*right, 0), (right_elbow, 0, 0)
    return drawn(rot, yaw)


MOVES = {'flicker_idle': (idle, IDLE), 'flicker_arrive': (arrive, range(6)),
         'flicker_slash_left': (slash_left, SLASH), 'flicker_slash_right': (slash_right, SLASH),
         'flicker_overhead': (overhead, OVERHEAD)}
