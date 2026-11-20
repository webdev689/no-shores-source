"""The Heart's own moves for the Sprite Forge, on the forge's body that carries it (heart.py). After the owner's own in
project-final: it floats seated in its cradle, bobbing and spinning; it opens its shell's port toward what it throws
at, the tell, and looses it; descended, the core rides low on its tendrils and crawls, planting them; close in, it
rears up, its tendrils raised and splayed, and slams them down. Its shell's scatter and its core's pulse are the
game's to draw over these. Angles as motion.py's; its legs are held straight and unseen until it descends."""
import numpy as np

from motion import blend, drawn, reach, summed, through, tremor

SPIN = 360 / 7   # a seventh of a turn brings its shell back to itself (heart.py `SECTORS`)
TUCKED = {'uarm_L': (-20, 30, 0), 'farm_L': (-130, 0, 0), 'uarm_R': (-20, -30, 0), 'farm_R': (-130, 0, 0)}


def float_legs(bend):
    """Legs straight under it but for `bend` degrees at the knee, the foot kept flat for the cradle on it."""
    return {f'{part}_{side}': turn for side in 'LR'
            for part, turn in (('thigh', (-bend, 0, 0)), ('shin', (2 * bend, 0, 0)), ('foot', (-bend, 0, 0)))}


def floating(frame, view, yaw):
    """Sixteen frames: two sevenths of a turn and one bob, so it loops; sealed or bare, as the game shows its shell."""
    bob = 22 + 14 * np.sin(2 * np.pi * frame / 16)
    rot = summed(TUCKED, float_legs(bob), {'chest': (2 * np.sin(2 * np.pi * frame / 16), 0, frame * 2 * SPIN / 16)})
    return drawn(rot, yaw)


# The lob's ten frames: the port tilted open toward what it aims at (the neck's tilt), held three frames as the core
# flares, the tell; the discharge rocks it back; the port shut again. Each: the port's tilt, the gem's rock.
LOB = [(0, 0), (10, 0), (24, 1), (34, 2), (35, 2), (36, 2), (42, -9), (30, -5), (14, -2), (0, 0)]


def lob(frame, view, yaw):
    tilt, rock = LOB[frame]
    rot = summed(TUCKED, float_legs(22), tremor('heart_lob', frame, 1.2 if 3 <= frame <= 5 else 0.4, ('spine',)),
                 {'neck': (tilt, 0, 0), 'chest': (rock, 0, 0)})
    return drawn(rot, yaw)


# Descended: the core low, its legs splayed wide and bent, its arms reaching out and down to the ground about it.
LOW = {'pelvis': (0, 0, 0), 'spine': (10, 0, 0),
       'thigh_L': (-30, -60, -20), 'shin_L': (80, 0, 0), 'foot_L': (-20, 0, 0),
       'thigh_R': (-30, 60, 20), 'shin_R': (80, 0, 0), 'foot_R': (-20, 0, 0)}
PLANTED = ((0.78, -0.56, 0.06), (-0.78, -0.56, 0.06))   # where its arms' tips stand on the ground


def descend(frame, view, yaw):
    """Twelve frames from floating to low: its legs folding and splaying, its arms unfolding to the ground."""
    t = frame / 11
    rot = summed(through([summed(TUCKED, float_legs(22)), blend(float_legs(22), LOW, 0.5), LOW], t),
                 tremor('heart_descend', frame, 0.8, ('spine', 'chest')))
    p, gear = drawn(rot, yaw)
    if t < 0.35:
        return p, gear
    reach_t = (t - 0.35) / 0.65
    tucked = ((0.2, -0.3, 1.4), (-0.2, -0.3, 1.4))
    wrists = [tuple(a + (b - a) * reach_t for a, b in zip(w0, w1)) for w0, w1 in zip(tucked, PLANTED)]
    return reach(p, *wrists), gear


def crawl(frame, view, yaw):
    """Twelve frames: its tendrils stepping in diagonal pairs, the left arm with the right leg, each pair lifted and
    set down ahead while the others drag the core on, the core rocking over them."""
    phase = frame / 12
    step = [np.sin(2 * np.pi * (phase + k * 0.5)) for k in (0, 1)]
    lift = [max(0.0, s) for s in step]
    rot = summed(LOW, tremor('heart_crawl', frame, 0.6, ('spine', 'chest')), {
        'thigh_R': (-20 * step[0], 0, 0), 'shin_R': (-30 * lift[0], 0, 0),
        'thigh_L': (-20 * step[1], 0, 0), 'shin_L': (-30 * lift[1], 0, 0),
        'chest': (0, 4 * step[0], 6 * step[0])})
    p, gear = drawn(rot, yaw)
    left = (PLANTED[0][0], PLANTED[0][1] - 0.18 * step[0], PLANTED[0][2] + 0.22 * lift[0])
    right = (PLANTED[1][0], PLANTED[1][1] - 0.18 * step[1], PLANTED[1][2] + 0.22 * lift[1])
    return reach(p, left, right), gear


# The slam's twelve frames: reared up, the gem tipped back, its arms raised and splayed high, held three frames, the
# tell; slammed down before it; the jolt; back to low. Each: the arms' tips, the spine's tip.
RAISED = ((0.62, -0.1, 1.95), (-0.62, -0.1, 1.95))
STRUCK = ((0.42, -0.95, 0.04), (-0.42, -0.95, 0.04))
SLAM = [(PLANTED, 0), (((0.7, -0.4, 0.9), (-0.7, -0.4, 0.9)), -8), (RAISED, -16), (RAISED, -18), (RAISED, -18),
        (RAISED, -18), (((0.55, -0.6, 1.1), (-0.55, -0.6, 1.1)), 4), (STRUCK, 22), (STRUCK, 26), (STRUCK, 22),
        (((0.6, -0.8, 0.06), (-0.6, -0.8, 0.06)), 12), (PLANTED, 0)]


def slam(frame, view, yaw):
    wrists, tip = SLAM[frame]
    shake = 1.6 if 3 <= frame <= 5 else (2.6 if frame == 8 else 0.6)
    rot = summed(LOW, tremor('heart_slam', frame, shake, ('spine', 'chest')), {'spine': (tip, 0, 0)})
    p, gear = drawn(rot, yaw)
    return reach(p, *wrists), gear


MOVES = {'heart_float': (floating, range(16)), 'heart_lob': (lob, LOB), 'heart_descend': (descend, range(12)),
         'heart_crawl': (crawl, range(12)), 'heart_slam': (slam, SLAM)}
