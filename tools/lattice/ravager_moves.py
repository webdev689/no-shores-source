"""The Ravager's own moves for the Sprite Forge. After the owner's own in project-final: it walks the Husk's twitching
walk with its blades held up and ready, its arms' tremor faint while it aims; its throw winds up as the shards gather
on its blades, the tell, then looses them in a burst, the hands in turn, each one aimed again; cornered, it mauls with
its blades as the Husk does. Each wrist is laid by the forge's arm solver (motion.py `reach`)."""
from husk_moves import HUNCH, shambling
from motion import CROUCH, DRIVE, drawn, reach, scaled, summed, tremor

READY = ((0.2, -0.32, 1.2), (-0.2, -0.32, 1.2))   # the fists up before the chest, the blades forward
STEADY = ('spine', 'chest', 'neck', 'head')        # its tremor while it aims: the trunk, not the arms


def bob(wrists, by):
    return tuple((x, y, z + by) for x, y, z in wrists)


def walk(frame, view, yaw):
    """The Husk's own walk, sixteen frames, the blades carried up and ready, rising and falling with each step."""
    rot, _ = shambling(frame)
    p, gear = drawn(rot, yaw, True, True)
    return reach(p, *bob(READY, 0.02 * ((frame % 8) - 4) / 4)), gear


# The idle's twelve frames: the head's cock and the fists' drift, watching.
IDLE = [((6, 8, 0), 0.0), ((7, 10, 2), 0.01), ((8, 12, 3), 0.015), ((8, 12, 4), 0.01), ((7, 8, 2), 0.0),
        ((6, 4, 0), -0.01), ((10, -6, -6), -0.015), ((9, -8, -6), -0.01), ((7, -6, -4), 0.0), ((6, -2, -2), 0.01),
        ((6, 2, 0), 0.01), ((6, 6, 0), 0.0)]


def idle(frame, view, yaw):
    head, drift = IDLE[frame]
    rot = summed(HUNCH, scaled(CROUCH, 0.5), tremor('ravager_idle', frame, 0.45, STEADY))
    rot['head'] = head
    p, gear = drawn(rot, yaw, True, True)
    return reach(p, *bob(READY, drift)), gear


# The throw, sixteen frames: four of wind-up, both arms drawn back over the shoulders as the shards gather on the
# blades, the last two held trembling, the tell; then six throws, two frames each, the right hand first and in turn:
# the throwing arm snapped out, the chest turned behind it, the other drawn back; then that arm half back.
BACK = ((0.28, 0.12, 1.42), (-0.28, 0.12, 1.42))


def throw(k):
    """Throw `k`'s two frames: (left wrist, right wrist, the chest's turn), out and half back."""
    right = k % 2 == 0
    out, cocked, half = (-0.15, -0.62, 1.36), (0.26, 0.06, 1.36), (-0.2, -0.36, 1.3)
    if right:
        return [(cocked, out, -18), ((0.24, 0.0, 1.34), half, -6)]
    mirror = lambda w: (-w[0], w[1], w[2])   # noqa: E731
    return [(mirror(out), mirror(cocked), 18), (mirror(half), (-0.24, 0.0, 1.34), 6)]


HURL = ([(READY[0], READY[1], 0), ((0.26, -0.04, 1.32), (-0.26, -0.04, 1.32), 0), (*BACK, 0), (*BACK, 0)]
        + [f for k in range(6) for f in throw(k)])


def hurl(frame, view, yaw):
    left, right, turn = HURL[frame]
    shake = 1.4 if frame in (2, 3) else 0.45
    rot = summed(HUNCH, scaled(CROUCH, 0.6), tremor('ravager_hurl', frame, shake, STEADY),
                 {'chest': (-6 if frame < 4 else 4, 0, turn)})
    rot['head'] = (2, 0, 0)
    p, gear = drawn(rot, yaw, True, True)
    return reach(p, left, right), gear


# The maul, ten frames: both blades raised high, held two frames as its tell; brought down raking across what stands
# before it, the blow landing on the fifth; back to ready.
MAUL = [(READY, {}, 0), (((0.22, 0.0, 1.7), (-0.22, 0.0, 1.7)), CROUCH, -8), (((0.2, 0.04, 1.86), (-0.2, 0.04, 1.86)),
        CROUCH, -12), (((0.2, 0.05, 1.88), (-0.2, 0.05, 1.88)), CROUCH, -12),
        (((0.18, -0.4, 1.4), (-0.18, -0.4, 1.4)), DRIVE, 10), (((0.16, -0.56, 0.96), (-0.16, -0.56, 0.96)), DRIVE, 26),
        (((0.2, -0.46, 0.9), (-0.2, -0.48, 0.92)), DRIVE, 28), (((0.22, -0.36, 1.0), (-0.22, -0.38, 1.02)), CROUCH, 16),
        (((0.2, -0.32, 1.12), (-0.2, -0.32, 1.12)), CROUCH, 6), (READY, {}, 0)]


def maul(frame, view, yaw):
    wrists, legs, lean = MAUL[frame]
    shake = 1.4 if frame in (2, 3) else 0.6
    rot = summed(HUNCH, legs, tremor('ravager_maul', frame, shake), {'chest': (lean, 0, 0)})
    rot['head'] = (8 + lean * 0.3, 6, 0)
    p, gear = drawn(rot, yaw, True, True)
    return reach(p, *wrists), gear


MOVES = {'ravager_walk': (walk, range(16)), 'ravager_idle': (idle, IDLE), 'ravager_hurl': (hurl, HURL),
         'ravager_maul': (maul, MAUL)}
