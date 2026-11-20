"""The Bulwark's own moves for the Sprite Forge. After the owner's own in project-final: "irregular snap-then-plant
footfalls with uneven strides (some long, the odd stunted one), under a constant low tremor of the spine, occasional
deep shudders, a slow unsettling sway/cock of the crystal head on its own, and a forward hunch"; the head "snaps to a
new sway/cock/tilt and holds". Shielded, it walks and stands with its shield arm across its front and discharges from
the shield's core; exposed, it swings the maul that formed in its hand two-handed, held out to its right so it never
crosses its crystal head, and rears up to slam it down."""
from motion import (COIL, CONTACT_L, CONTACT_R, CROUCH, DRIVE, LUNGE, PASSING_L, PASSING_R, TRUNK, drawn, laid,
                    scaled, summed, through, tremor)

HUNCH = {'spine': (16, 0, 0), 'chest': (12, 0, 0), 'neck': (18, 0, 0), 'clav_L': (0, 0, -6), 'clav_R': (0, 0, -8)}
BRACE = {'thigh_L': (-22, -12, -12), 'shin_L': (24, 0, 0), 'thigh_R': (12, 12, 14), 'shin_R': (22, 0, 0)}
SET = scaled(BRACE, 0.5)   # its stance, every move starting and ending in it
GUARD = ((-0.04, -0.4, 1.12), (-1.0, -0.1, 0.25))   # the left wrist across its front, low so its head shows over it
HANGING = ((-0.3, -0.16, 0.94), (0.1, -0.8, -0.55))   # the right fist hanging heavy, the maul's head forward of it
READY = ((-0.22, -0.34, 1.06), (-0.45, -0.35, 0.82))   # the maul held two-handed before it, up and out to its right


def gripped(pose, wrist, way):
    """Both hands on the maul's haft: the right at `wrist` along `way`, the left a hand's breadth below it."""
    laid(pose, 'R', wrist, way, (0.0, 0.0, 1.0))
    return laid(pose, 'L', tuple(w - d * 0.24 for w, d in zip(wrist, way)), way, (0.0, 0.0, 1.0))


def guarded(pose, wrist=GUARD[0]):
    """The shield arm across its front, the right arm hanging."""
    laid(pose, 'L', wrist, GUARD[1])
    return laid(pose, 'R', *HANGING, (1.0, 0.0, 0.0))


# The walk's sixteen frames, two steps on the forge's own keys, each swung for three or four frames and planted for
# the rest, the second stunted, landing short; the first starts from where it landed, so the loop closes. Each frame:
# the step's share, the pelvis's roll onto the leg it stands on, the head (pitch, cock, turn) snapping to a pose and
# holding, the shudder.
SHORT_L = scaled(CONTACT_L, 0.7)
WALK = [(0.0, 4, (14, 12, 4), 0), (0.3, 0, (14, 12, 4), 0), (0.75, -5, (14, 12, 4), 0), (1.0, -8, (14, 12, 4), 0),
        (1.0, -8, (20, -10, -8), 0), (1.0, -8, (20, -10, -8), 0), (1.0, -8, (20, -10, -8), 1),
        (1.0, -6, (16, -6, -6), 0.4), (0.0, -4, (16, -6, -6), 0), (0.35, 0, (16, -6, -6), 0),
        (0.8, 5, (10, 18, 10), 0), (1.0, 8, (10, 18, 10), 0), (1.0, 8, (10, 18, 10), 0), (1.0, 8, (12, 16, 8), 0),
        (1.0, 8, (12, 16, 8), 0), (1.0, 6, (14, 12, 4), 0)]
FOOTING = ['LR', 'L', 'L', 'LR', 'LR', 'LR', 'LR', 'LR', 'LR', 'R', 'R', 'LR', 'LR', 'LR', 'LR', 'LR']


def walk(frame, view, yaw):
    share, roll, head, shudder = WALK[frame]
    keys = [SHORT_L, PASSING_L, CONTACT_R] if frame < 8 else [CONTACT_R, PASSING_R, SHORT_L]
    rot = summed(HUNCH, through(keys, share), tremor('bulwark_walk', frame, 0.9, TRUNK), {
        'pelvis': (0, roll * 0.4, roll), 'chest': (shudder * 10, shudder * 6, -roll * 0.4)})
    rot['head'] = head
    pose, gear = drawn(rot, yaw, True, True, plant=FOOTING[frame])
    return guarded(pose), gear


# The idle's twelve frames: the breath, the weight from one leg to the other, the head snapping and holding.
IDLE = [(0, -4, (14, 10, 4)), (1, -4, (14, 10, 4)), (2, -3, (14, 10, 4)), (2, -1, (18, -8, -6)),
        (1, 1, (18, -8, -6)), (0, 3, (18, -8, -6)), (-1, 4, (18, -8, -6)), (-1, 4, (12, 2, 10)),
        (0, 3, (12, 2, 10)), (1, 1, (12, 2, 10)), (1, -1, (16, 14, 2)), (0, -3, (16, 14, 2))]


def idle(frame, view, yaw):
    breath, weight, head = IDLE[frame]
    rot = summed(HUNCH, SET, tremor('bulwark_idle', frame, 0.8, TRUNK),
                 {'chest': (breath, 0, 0), 'pelvis': (0, weight * 0.5, weight)})
    rot['head'] = head
    pose, gear = drawn(rot, yaw, True, True)
    return guarded(pose), gear


# The discharge, twelve frames: the shield thrust out at arm's length and braced behind, the chest leaning into it,
# held four frames as the core flares, the game drawing its flare, the tell; the discharge throws it up and back;
# settling to guard. Each: the left wrist, the chest's lean, how far the legs brace.
OUT = (0.0, -0.7, 1.24)
DISCHARGE = [(GUARD[0], 0, 0.5), ((-0.02, -0.56, 1.18), 6, 0.8), (OUT, 12, 1.0), (OUT, 12, 1.0), (OUT, 13, 1.0),
             (OUT, 12, 1.0), (OUT, 13, 1.0), ((0.0, -0.5, 1.4), -10, 1.0), ((-0.02, -0.46, 1.3), -6, 0.9),
             ((-0.03, -0.43, 1.2), -2, 0.7), ((-0.04, -0.41, 1.14), 0, 0.6), (GUARD[0], 0, 0.5)]


def discharge(frame, view, yaw):
    wrist, lean, brace = DISCHARGE[frame]
    shake = 1.6 if 3 <= frame <= 6 else 0.8
    rot = summed(HUNCH, scaled(BRACE, brace), tremor('bulwark_discharge', frame, shake, TRUNK), {'chest': (lean, 0, 0)})
    rot['head'] = (14 + lean * 0.5, 0, 0)
    pose, gear = drawn(rot, yaw, True, True)
    return guarded(pose, wrist), gear


# The change, eight frames, the shield already gone: the shield arm dropping, then the right fist lifting the maul
# that formed in it from hanging to ready, the left hand coming to its haft. The game gives the maul's layer from its
# first frame.
DROPPED = (0.28, -0.1, 0.95)


def change(frame, view, yaw):
    t = frame / 7
    rot = summed(HUNCH, SET, tremor('bulwark_change', frame, 1.0, TRUNK), {'chest': (6 * (1 - t), 0, -10 * t)})
    rot['head'] = (16, 6 - 12 * t, 0)
    pose, gear = drawn(rot, yaw, True, True)
    lift = max(0.0, (frame - 2) / 5)
    lift = lift * lift * (3 - 2 * lift)
    wrist, way = (tuple(a + (b - a) * lift for a, b in zip(low, ready)) for low, ready in zip(HANGING, READY))
    laid(pose, 'R', wrist, way, (0.0, 0.0, 1.0))
    grip = tuple(w - d * 0.24 for w, d in zip(wrist, way))
    drop = min(1.0, frame / 2)
    left = tuple(a + (b - a) * drop for a, b in zip(GUARD[0], DROPPED))
    laid(pose, 'L', tuple(a + (b - a) * lift for a, b in zip(left, grip)), way, (0.0, 0.0, 1.0))
    return pose, gear


# The sweep, twelve frames: drawn back and out over the right shoulder, held two frames, the tell; swung flat across
# its front from its right to its left; followed through; back to ready. Each: the right wrist, the haft's way, the
# chest's turn, how far the legs brace and how far they drive.
SWEEP = [(*READY, 0, 0.5, 0.0), ((-0.36, 0.04, 1.36), (-0.7, 0.45, 0.55), 24, 1.0, 0.0),
         ((-0.38, 0.12, 1.42), (-0.75, 0.5, 0.45), 34, 1.0, 0.0), ((-0.38, 0.13, 1.43), (-0.75, 0.51, 0.44), 34, 1.0, 0.0),
         ((-0.36, -0.22, 1.24), (-1.0, -0.2, 0.15), 18, 0.3, 0.7), ((-0.06, -0.62, 1.16), (-0.1, -1.0, 0.05), -6, 0.0, 1.0),
         ((0.3, -0.42, 1.14), (0.9, -0.4, 0.0), -30, 0.0, 1.0), ((0.38, -0.1, 1.12), (0.9, 0.3, 0.1), -42, 0.0, 1.0),
         ((0.3, 0.02, 1.08), (0.6, 0.6, 0.4), -38, 0.6, 0.4), ((0.1, -0.36, 1.0), (0.3, -0.85, 0.42), -18, 0.8, 0.0),
         ((-0.12, -0.38, 1.02), (-0.3, -0.6, 0.74), -6, 0.6, 0.0), (*READY, 0, 0.5, 0.0)]


def sweep(frame, view, yaw):
    wrist, way, turn, brace, drive = SWEEP[frame]
    shake = 1.5 if frame in (2, 3) else 0.7
    rot = summed(HUNCH, scaled(BRACE, brace), scaled(DRIVE, drive), tremor('bulwark_sweep', frame, shake, TRUNK),
                 {'chest': (0, 0, turn), 'pelvis': (0, 0, turn * 0.4)})
    rot['head'] = (14, 0, -turn * 0.3)
    pose, gear = drawn(rot, yaw, True, True)
    return gripped(pose, wrist, way), gear


# The slam, fourteen frames: crouched; reared up, the maul raised high over its head and out to its right, held three
# frames, the tell; driven down to strike the ground before it, its head coming to rest on it; the jolt of the blow;
# heaved back up to ready. Each: the right wrist, the haft's way, the spine's bow, and the legs: its stance, then a
# pose of motion.py's.
HIGH = ((-0.12, 0.08, 1.98), (-0.3, 0.45, 0.84))
SLAM = [(*READY, 0, SET), ((-0.16, -0.2, 1.3), (-0.3, -0.1, 0.95), 6, CROUCH),
        ((-0.1, 0.0, 1.8), (-0.3, 0.3, 0.9), -6, COIL), (*HIGH, -14, BRACE), (*HIGH, -14, BRACE), (*HIGH, -14, BRACE),
        ((-0.1, -0.3, 1.7), (-0.2, -0.6, 0.8), 6, DRIVE), ((-0.26, -0.66, 1.08), (-0.35, -0.9, -0.3), 26, LUNGE),
        ((-0.26, -0.74, 0.92), (-0.35, -0.7, -0.62), 40, LUNGE), ((-0.26, -0.72, 0.9), (-0.35, -0.69, -0.63), 44, LUNGE),
        ((-0.28, -0.66, 0.98), (-0.35, -0.7, -0.62), 38, DRIVE), ((-0.2, -0.52, 0.92), (-0.3, -0.8, -0.3), 26, DRIVE),
        ((-0.16, -0.4, 0.98), (-0.2, -0.5, 0.6), 10, CROUCH), (*READY, 0, SET)]


def slam(frame, view, yaw):
    wrist, way, bow, legs = SLAM[frame]
    shake = 1.8 if 3 <= frame <= 5 else (2.4 if frame == 9 else 0.7)   # the tell, and the jolt of the blow
    rot = summed(HUNCH, legs, tremor('bulwark_slam', frame, shake, TRUNK),
                 {'spine': (bow, 0, 0), 'chest': (bow * 0.5, 0, 0)})
    rot['head'] = (14 + bow * 0.3, 0, 0)
    pose, gear = drawn(rot, yaw, True, True)
    return gripped(pose, wrist, way), gear


MOVES = {'bulwark_idle': (idle, IDLE), 'bulwark_walk': (walk, WALK), 'bulwark_discharge': (discharge, DISCHARGE),
         'bulwark_change': (change, range(8)), 'bulwark_sweep': (sweep, SWEEP), 'bulwark_slam': (slam, SLAM)}
