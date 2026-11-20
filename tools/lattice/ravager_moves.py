"""The Ravager's own moves for the Sprite Forge. After the owner's own in project-final: it walks the Husk's twitching
walk with its blades held up and ready, its arms' tremor faint while it aims; its throw winds up with its arms drawn
back, the tell, then looses its shards in a burst, the hands in turn, each one aimed again, the game taking its
ammunition's layer away as it throws; cornered, it mauls with its blades as the Husk does. Each wrist is laid by the
forge's arm solver, its blade along the way it points (motion.py `laid`)."""
import numpy as np

from husk_moves import HUNCH, shambling
from motion import CROUCH, DRIVE, HURT, STAGGER, STEP_BACK, drawn, laid, recoil, scaled, summed, tremor

READY = ((0.2, -0.32, 1.2), (-0.2, -0.32, 1.2))   # the fists up before the chest
AHEAD = 8                                         # the blades' pitch at ready, degrees above level, pointed forward
STEADY = ('spine', 'chest', 'neck', 'head')        # its tremor while it aims: the trunk, not the arms


def armed(pose, wrists, pitches=(AHEAD, AHEAD)):
    """Each wrist laid, its blade pointed forward and splayed out, so both read from the front, pitched up by its
    angle in degrees: past 90, up and back over the shoulder."""
    for side, wrist, pitch in zip('LR', wrists, pitches):
        out = 0.55 if side == 'L' else -0.55
        a = np.radians(pitch)
        way = (out, -np.cos(a), np.sin(a))
        laid(pose, side, wrist, way, up=(0.0, 0.0, 1.0) if abs(way[2]) < 0.7 else (0.0, -1.0, 0.0))
    return pose


def bob(wrists, by):
    return tuple((x, y, z + by) for x, y, z in wrists)


def walk(frame, view, yaw):
    """The Husk's own walk, sixteen frames, the blades carried up and ready, lowest as each foot lands."""
    rot, _, footing = shambling(frame)
    pose, gear = drawn(rot, yaw, True, True, **footing)
    return armed(pose, bob(READY, -0.02 * np.cos(2 * np.pi * frame / 8))), gear


# The idle's twelve frames: the head's cock and the fists' drift, watching.
IDLE = [((6, 8, 0), 0.0), ((7, 10, 2), 0.01), ((8, 12, 3), 0.015), ((8, 12, 4), 0.01), ((7, 8, 2), 0.0),
        ((6, 4, 0), -0.01), ((10, -6, -6), -0.015), ((9, -8, -6), -0.01), ((7, -6, -4), 0.0), ((6, -2, -2), 0.01),
        ((6, 2, 0), 0.01), ((6, 6, 0), 0.0)]
SET = scaled(CROUCH, 0.5)   # its stance: half crouched, every move starting and ending in it


def idle(frame, view, yaw):
    head, drift = IDLE[frame]
    rot = summed(HUNCH, SET, tremor('ravager_idle', frame, 0.45, STEADY))
    rot['head'] = head
    pose, gear = drawn(rot, yaw, True, True)
    return armed(pose, bob(READY, drift)), gear


# The throw, seventeen frames, each the wrists, the chest's lean and turn, and each blade's pitch: four of wind-up,
# both arms drawn back over the shoulders, the last two held trembling, the tell; then six throws, two frames each,
# the right hand first and in turn: the throwing arm snapped out, its blade at what it throws at, the chest turned
# behind it, the other drawn back; then that arm half back; then back to ready.
BACK = ((0.28, 0.12, 1.42), (-0.28, 0.12, 1.42))


def throw(k):
    """Throw `k`'s two frames, out and half back."""
    out, cocked, half, drawn_back = (-0.15, -0.62, 1.36), (0.26, 0.06, 1.36), (-0.2, -0.36, 1.3), (0.24, 0.0, 1.34)
    if k % 2 == 0:
        return [(cocked, out, 4, -18, 110, 4), (drawn_back, half, 2, -6, 100, 30)]
    mirror = lambda w: (-w[0], w[1], w[2])   # noqa: E731
    return [(mirror(out), mirror(cocked), 4, 18, 4, 110), (mirror(half), mirror(drawn_back), 2, 6, 30, 100)]


HURL = ([(*READY, 0, 0, AHEAD, AHEAD), ((0.26, -0.04, 1.32), (-0.26, -0.04, 1.32), -4, 0, 60, 60),
         (*BACK, -6, 0, 110, 110), (*BACK, -6, 0, 112, 112)]
        + [f for k in range(6) for f in throw(k)] + [(*READY, 0, 0, AHEAD, AHEAD)])


def hurl(frame, view, yaw):
    left, right, lean, turn, left_pitch, right_pitch = HURL[frame]
    shake = 1.4 if frame in (2, 3) else 0.45
    rot = summed(HUNCH, SET, tremor('ravager_hurl', frame, shake, STEADY), {'chest': (lean, 0, turn)})
    rot['head'] = (2, 0, 0)
    pose, gear = drawn(rot, yaw, True, True)
    return armed(pose, (left, right), (left_pitch, right_pitch)), gear


# The maul, ten frames, each the wrists, how far the legs crouch and how far they drive, the chest's lean and the
# blades' pitch: both blades raised high, laid back over the shoulders, held two frames as its tell; brought down
# raking across what stands before it, the blow landing on the fifth; back to ready.
MAUL = [
    (READY, 0.5, 0.0, 0, AHEAD),
    (((0.22, 0.0, 1.7), (-0.22, 0.0, 1.7)), 0.8, 0.0, -8, 100),
    (((0.2, 0.04, 1.86), (-0.2, 0.04, 1.86)), 1.0, 0.0, -12, 110),
    (((0.2, 0.05, 1.88), (-0.2, 0.05, 1.88)), 1.0, 0.0, -12, 112),
    (((0.18, -0.4, 1.4), (-0.18, -0.4, 1.4)), 0.3, 0.7, 10, 30),
    (((0.16, -0.56, 0.96), (-0.16, -0.56, 0.96)), 0.0, 1.0, 26, -30),
    (((0.2, -0.46, 0.9), (-0.2, -0.48, 0.92)), 0.0, 1.0, 28, -35),
    (((0.22, -0.36, 1.0), (-0.22, -0.38, 1.02)), 0.6, 0.4, 16, -10),
    (((0.2, -0.32, 1.12), (-0.2, -0.32, 1.12)), 0.8, 0.0, 6, 0),
    (READY, 0.5, 0.0, 0, AHEAD),
]


def maul(frame, view, yaw):
    wrists, crouch, drive, lean, pitch = MAUL[frame]
    shake = 1.4 if frame in (2, 3) else 0.6
    rot = summed(HUNCH, scaled(CROUCH, crouch), scaled(DRIVE, drive), tremor('ravager_maul', frame, shake),
                 {'chest': (lean, 0, 0)})
    rot['head'] = (8 + lean * 0.3, 6, 0)
    pose, gear = drawn(rot, yaw, True, True)
    return armed(pose, wrists, (pitch, pitch)), gear


def struck(wrists, hard):
    """The fists knocked back and up by a blow, `hard` as it is."""
    return tuple((x * (1 + 0.3 * hard), y + 0.1 * hard, z + 0.08 * hard) for x, y, z in wrists)


def hurt(frame, view, yaw):
    """Four frames: struck, thrown back and twisted, the fists knocked back and the blades up, the head snapped back."""
    hard = HURT[frame]
    rot = summed(HUNCH, SET, recoil(hard, -6 * hard), tremor('ravager_hurt', frame, 0.6 + hard, STEADY))
    rot['head'] = (6 - 20 * hard, 8 + 10 * hard, 0)
    pose, gear = drawn(rot, yaw, True, True)
    return armed(pose, struck(READY, hard), (AHEAD + 30 * hard, AHEAD + 30 * hard)), gear


def stagger(frame, view, yaw):
    """Eight frames: thrown back a step, the fists flung wide for its balance, the blades up, finding its feet."""
    hard = STAGGER[frame]
    rot = summed(HUNCH, SET, scaled(STEP_BACK, min(1.0, hard)), recoil(hard, 8 * hard),
                 tremor('ravager_stagger', frame, 0.6 + hard, STEADY))
    rot['head'] = (6 - 18 * hard, -14 * hard, 0)
    pose, gear = drawn(rot, yaw, True, True)
    wide = tuple((x * (1 + 0.8 * hard), y + 0.12 * hard, z + 0.05 * hard) for x, y, z in READY)
    return armed(pose, wide, (AHEAD + 40 * hard, AHEAD + 40 * hard)), gear


MOVES = {'ravager_idle': (idle, IDLE), 'ravager_walk': (walk, range(16)), 'ravager_hurl': (hurl, HURL),
         'ravager_maul': (maul, MAUL), 'ravager_hurt': (hurt, HURT), 'ravager_stagger': (stagger, STAGGER)}
