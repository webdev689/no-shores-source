"""The Heart's own moves for the Sprite Forge: a giant of fused people, slow and heavy, the anchor in its right fist.
It heaves where it stands, the anchor's crown resting on the ground; it lumbers, each step landing with a jolt, the
anchor dragging behind; it sweeps the anchor round; it raises the anchor in both hands and slams it down; it stomps;
and it claws one of its own people out of its body and flings it into the fight, where it rises a Husk. Each attack
holds a frame or more before it lands, its tell. Angles and places as motion.py's."""
import numpy as np

from motion import (CONTACT_L, CONTACT_R, CROUCH, DRIVE, PASSING_L, PASSING_R, TRUNK, drawn, laid, scaled, summed,
                    through, tremor)

HUNCH = {'spine': (18, 0, 0), 'chest': (14, 0, 0), 'neck': (10, 0, 0), 'head': (14, 6, 0),
         'clav_L': (0, 0, 8), 'clav_R': (0, 0, -8)}
BRACE = {'thigh_L': (-18, -10, -10), 'shin_L': (20, 0, 0), 'thigh_R': (10, 10, 12), 'shin_R': (18, 0, 0)}
HANGING_L = ((0.36, -0.1, 0.86), (0.1, -0.2, -1.0))        # the left hand hanging heavy, its knuckles low
CARRIED = ((-0.38, -0.04, 0.92), (-0.18, 0.5, -0.85))      # the anchor from the right fist, its crown on the ground
DRAGGED = ((-0.38, 0.1, 0.9), (-0.1, 0.56, -0.82))         # trailed behind it, its crown on the ground


def held(pose, right=CARRIED, left=HANGING_L):
    """Both wrists laid: the right with the anchor, the left hanging or on the anchor's shank."""
    laid(pose, 'R', *right, up=(1.0, 0.0, 0.0))
    return laid(pose, 'L', *left, up=(-1.0, 0.0, 0.0))


def stand(frame, view, yaw):
    pose, gear = drawn(HUNCH, yaw, False, True)
    return held(pose), gear


# The idle's twelve frames: each the breath (the chest's heave and the shoulders' rise), the sway, and the head; at
# frame 7 a shudder through it, the fused people's weight shifting.
IDLE = [(0, -3, (14, 6, 0)), (2, -2, (14, 7, 1)), (4, -1, (15, 8, 2)), (5, 1, (15, 8, 2)), (4, 2, (14, 6, 1)),
        (2, 3, (14, 4, 0)), (0, 3, (13, 2, -1)), (3, 2, (20, -8, -6)), (1, 1, (17, -5, -4)), (-1, 0, (15, -2, -2)),
        (-1, -2, (14, 2, 0)), (0, -3, (14, 5, 0))]


def idle(frame, view, yaw):
    breath, sway, head = IDLE[frame]
    shudder = 1.0 if frame == 7 else 0.0
    rot = summed(HUNCH, scaled(BRACE, 0.4), tremor('heart_idle', frame, 0.7 + shudder * 2.0, TRUNK), {
        'chest': (-breath * 0.6, 0, 0), 'clav_L': (0, 0, breath), 'clav_R': (0, 0, -breath),
        'pelvis': (0, sway * 0.4, sway)})
    rot['head'] = head
    pose, gear = drawn(rot, yaw, False, True)
    return held(pose, (CARRIED[0][:2] + (CARRIED[0][2] + breath * 0.004,), CARRIED[1])), gear


# The walk's sixteen frames, two steps on the forge's own keys, each swung five frames and landed three, the landing a
# jolt down through it, the weight rolled from one leg to the other and back; each frame: the step's share, the jolt,
# and the foot bearing its weight.
WALK = [(0.0, 0, 'L'), (0.15, 0, 'L'), (0.35, 0, 'L'), (0.6, 0, 'L'), (0.85, 0, 'L'), (1.0, 1, 'LR'), (1.0, 0.5, 'LR'),
        (1.0, 0.2, 'LR'), (0.0, 0, 'R'), (0.15, 0, 'R'), (0.35, 0, 'R'), (0.6, 0, 'R'), (0.85, 0, 'R'), (1.0, 1, 'LR'),
        (1.0, 0.5, 'LR'), (1.0, 0.2, 'LR')]


def walk(frame, view, yaw):
    share, jolt, plant = WALK[frame]
    keys = [CONTACT_L, PASSING_L, CONTACT_R] if frame < 8 else [CONTACT_R, PASSING_R, CONTACT_L]
    roll = -9 * np.sin(np.pi * frame / 8)   # onto the left through the first step, the right through the second
    rot = summed(HUNCH, through(keys, share), tremor('heart_walk', frame, 0.6 + jolt * 2.2, TRUNK), {
        'pelvis': (0, roll * 0.4, roll), 'chest': (jolt * 6, -roll * 0.5, -roll * 0.3), 'spine': (jolt * 4, 0, 0)})
    rot['head'] = (14 + jolt * 8, roll * 0.6, 0)
    pose, gear = drawn(rot, yaw, False, True, plant=plant)
    swing = np.sin(np.pi * frame / 8) * 0.08   # the free hand swinging against the step
    return held(pose, DRAGGED, ((0.36, -0.1 - swing, 0.86), HANGING_L[1])), gear


# The sweep's fourteen frames: the anchor drawn back and up over its right shoulder, held two frames, its tell; swung
# round flat across its front to its left; carried on, twisted; back. Each: the right wrist, the anchor's way, the
# chest's turn, the legs.
SWEEP = [(CARRIED[0], CARRIED[1], 0, {}), ((-0.4, 0.05, 1.2), (-0.6, 0.3, 0.6), 14, BRACE),
         ((-0.36, 0.2, 1.55), (-0.4, 0.6, 0.6), 30, BRACE), ((-0.35, 0.22, 1.6), (-0.4, 0.62, 0.6), 34, BRACE),
         ((-0.35, 0.23, 1.61), (-0.4, 0.63, 0.6), 34, BRACE), ((-0.44, -0.1, 1.35), (-1.0, -0.1, 0.0), 22, DRIVE),
         ((-0.2, -0.5, 1.25), (-0.4, -1.0, -0.05), 0, DRIVE), ((0.2, -0.52, 1.22), (0.45, -0.9, -0.05), -22, DRIVE),
         ((0.44, -0.18, 1.2), (1.0, -0.15, -0.05), -40, DRIVE), ((0.4, 0.1, 1.15), (0.8, 0.5, -0.2), -48, BRACE),
         ((0.3, 0.1, 1.0), (0.4, 0.4, -0.8), -40, BRACE), ((0.0, -0.24, 1.0), (0.0, -0.55, -0.83), -22, BRACE),
         ((-0.34, -0.05, 0.95), (-0.2, 0.4, -0.88), -8, {}), (CARRIED[0], CARRIED[1], 0, {})]


def sweep(frame, view, yaw):
    wrist, way, turn, legs = SWEEP[frame]
    rot = summed(HUNCH, legs, tremor('heart_sweep', frame, 1.6 if frame in (3, 4) else 0.6, TRUNK),
                 {'chest': (0, 0, turn), 'pelvis': (0, 0, turn * 0.35)})
    rot['head'] = (14, 0, -turn * 0.4)
    pose, gear = drawn(rot, yaw, False, True)
    return held(pose, (wrist, way), HANGING_L), gear


# The slam's fourteen frames: the left hand to the shank, the anchor raised high over its head in both, rearing back,
# held three frames, its tell; brought down to strike the ground before it; the jolt; wrenched free; back. Each: the
# right wrist, the anchor's way, the spine's bow, the legs.
HIGH = ((-0.04, 0.12, 2.0), (0.0, 0.5, 0.86))
SLAM = [(CARRIED[0], CARRIED[1], 0, {}), ((-0.2, -0.2, 1.2), (0.0, -0.3, 0.95), 4, CROUCH),
        ((-0.1, 0.0, 1.7), (0.0, 0.3, 0.95), -6, BRACE), (*HIGH, -16, BRACE), (*HIGH, -18, BRACE), (*HIGH, -18, BRACE),
        ((0.0, -0.32, 1.8), (0.0, -0.55, 0.83), 0, DRIVE), ((0.0, -0.68, 1.3), (0.0, -0.95, -0.2), 22, DRIVE),
        ((0.0, -0.78, 1.05), (0.0, -0.45, -0.89), 36, DRIVE), ((0.0, -0.77, 1.04), (0.0, -0.44, -0.9), 40, DRIVE),
        ((0.0, -0.7, 1.07), (0.0, -0.45, -0.89), 34, DRIVE), ((-0.06, -0.5, 1.2), (0.0, -0.6, -0.3), 22, BRACE),
        ((-0.2, -0.3, 1.05), (0.0, -0.3, -0.9), 8, {}), (CARRIED[0], CARRIED[1], 0, {})]


def slam(frame, view, yaw):
    wrist, way, bow, legs = SLAM[frame]
    shake = 1.8 if 3 <= frame <= 5 else (2.8 if frame == 9 else 0.6)   # its tell, and the jolt of the blow
    rot = summed(HUNCH, legs, tremor('heart_slam', frame, shake, TRUNK), {'spine': (bow, 0, 0), 'chest': (bow * 0.5, 0, 0)})
    rot['head'] = (14 + bow * 0.4, 0, 0)
    pose, gear = drawn(rot, yaw, True, True)
    if frame in (0, 13):
        return held(pose, (wrist, way)), gear
    shank = tuple(w + d * 0.36 for w, d in zip(wrist, way))   # the left hand on the shank past the stock
    return held(pose, (wrist, way), (shank, way)), gear


# The stomp's ten frames: its right knee raised high, the weight rocked onto the left, held two frames, its tell;
# stamped down, the ground struck all round it; the jolt; back. Each: the right thigh's raise, the knee, the spine;
# while the knee is up, only the left foot is planted.
STOMP = [(0, 0, 0), (-30, 40, -4), (-62, 84, -10), (-66, 88, -12), (-66, 88, -12), (-10, 20, 10), (0, 6, 16),
         (0, 8, 14), (0, 4, 6), (0, 0, 0)]


def stomp(frame, view, yaw):
    raise_, knee, bow = STOMP[frame]
    shake = 1.6 if frame in (3, 4) else (3.0 if frame == 6 else 0.6)
    rot = summed(HUNCH, tremor('heart_stomp', frame, shake, TRUNK), {
        'thigh_R': (raise_, 10, 12), 'shin_R': (knee, 0, 0), 'pelvis': (0, -6 if 1 <= frame <= 4 else 0, -8),
        'spine': (bow, 0, 0)})
    rot['head'] = (14 + bow, 0, 0)
    pose, gear = drawn(rot, yaw, True, True, plant='L' if raise_ else 'LR')
    return held(pose), gear


# The tear's fourteen frames: its left hand clawing into its own side, gripping, held four frames shuddering as it
# pulls, its tell; ripped out and the arm flung wide, the body recoiling, the game showing the torn one in its fist
# from the grip to the fling (heart.py `torn`); the hand opened, flinging it ahead; back. Each: the left wrist, its
# way, the fist, the spine's recoil.
CLAW = ((-0.1, -0.24, 1.02), (-0.8, -0.3, -0.2))
TEAR = [(HANGING_L[0], HANGING_L[1], False, 0), ((0.1, -0.3, 1.0), (-0.6, -0.6, -0.2), False, 4),
        (*CLAW, False, 8), (*CLAW, True, 10), (*CLAW, True, 12), (*CLAW, True, 12), (*CLAW, True, 12),
        ((0.3, -0.42, 1.12), (0.9, -0.3, 0.1), True, -10), ((0.48, -0.36, 1.3), (0.9, -0.1, 0.4), True, -14),
        ((0.3, -0.62, 1.2), (0.3, -1.0, 0.1), False, 6), ((0.24, -0.66, 1.08), (0.2, -1.0, -0.2), False, 10),
        ((0.34, -0.4, 0.96), (0.2, -0.5, -0.8), False, 6), ((0.36, -0.2, 0.9), (0.1, -0.3, -1.0), False, 2),
        (HANGING_L[0], HANGING_L[1], False, 0)]


def tear(frame, view, yaw):
    wrist, way, fist, recoil = TEAR[frame]
    shake = 2.2 if 3 <= frame <= 6 else 0.7
    rot = summed(HUNCH, scaled(BRACE, 0.6), tremor('heart_tear', frame, shake, TRUNK),
                 {'spine': (recoil * 0.6, 0, 0), 'chest': (recoil * 0.4, 0, recoil * 0.8)})
    rot['head'] = (14 + recoil * 0.5, -recoil * 0.6, 0)
    pose, gear = drawn(rot, yaw, fist, True)
    return held(pose, CARRIED, (wrist, way)), gear


MOVES = {'heart_stand': (stand, range(1)), 'heart_idle': (idle, IDLE), 'heart_walk': (walk, WALK),
         'heart_sweep': (sweep, SWEEP), 'heart_slam': (slam, SLAM), 'heart_stomp': (stomp, STOMP),
         'heart_tear': (tear, TEAR)}
