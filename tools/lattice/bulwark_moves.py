"""The Bulwark's own moves for the Sprite Forge. After the owner's own in project-final: "irregular snap-then-plant
footfalls with uneven strides (some long, the odd stunted one), under a constant low tremor of the spine, occasional
deep shudders, a slow unsettling sway/cock of the crystal head on its own, and a forward hunch"; the head "snaps to a
new sway/cock/tilt and holds". Shielded, it walks and stands with its shield arm across its front and discharges from
the shield's core; exposed, it swings the maul that formed in its hand two-handed, and rears up to slam it down."""
from mathutils import Vector

import poses
from motion import COIL, CONTACT_L, CONTACT_R, CROUCH, DRIVE, LUNGE, PASSING_L, PASSING_R, drawn, scaled, summed, \
    through, tremor
from rig import solve_arm

HUNCH = {'spine': (16, 0, 0), 'chest': (12, 0, 0), 'neck': (18, 0, 0), 'clav_L': (0, 0, -6), 'clav_R': (0, 0, -8)}
BRACE = {'thigh_L': (-22, -12, -12), 'shin_L': (24, 0, 0), 'thigh_R': (12, 12, 14), 'shin_R': (22, 0, 0)}
GUARD = ((-0.04, -0.4, 1.24), (-1.0, -0.1, 0.25))   # the left wrist across its front, the forearm toward its right


def arm(pose, side, wrist, way, up=(0.0, -1.0, 0.0)):
    """A wrist laid (body space) with its hand along `way` and its back toward `up`: the shield's face, which is the
    back of the forearm, turned to the front."""
    at = poses.root_matrix(pose)
    turn = at.to_3x3()
    elbow = (0.8, 0.5, -0.6) if side == 'L' else (-0.8, 0.4, -0.6)
    solve_arm(pose, side, at @ Vector(wrist), turn @ Vector(elbow), hand_dir=(turn @ Vector(way)).normalized(),
              hand_up=turn @ Vector(up))
    return pose


def gripped(pose, wrist, way):
    """Both hands on the maul's haft: the right at `wrist` along `way`, the left a hand's breadth below it."""
    below = tuple(w - d * 0.24 for w, d in zip(wrist, way))
    arm(pose, 'R', wrist, way, (0.0, 0.0, 1.0))
    return arm(pose, 'L', below, way, (0.0, 0.0, 1.0))


def hanging(pose):
    """The right arm hanging heavy, a little forward."""
    return arm(pose, 'R', (-0.3, -0.12, 0.92), (0.1, -0.2, -1.0), (1.0, 0.0, 0.0))


# The walk's sixteen frames, two steps on the forge's own keys, each swung for four frames and planted for four, the
# second step stunted. Each frame: the step's share, the head (pitch, cock, turn) snapping to a pose and holding, the
# shudder.
WALK = [(0.0, (14, 12, 4), 0), (0.3, (14, 12, 4), 0), (0.75, (14, 12, 4), 0), (1.0, (14, 12, 4), 0),
        (1.0, (20, -10, -8), 0), (1.0, (20, -10, -8), 0), (1.0, (20, -10, -8), 1), (1.0, (16, -6, -6), 0.4),
        (0.0, (16, -6, -6), 0), (0.25, (16, -6, -6), 0), (0.6, (10, 18, 10), 0), (0.8, (10, 18, 10), 0),
        (0.8, (10, 18, 10), 0), (0.8, (12, 16, 8), 0), (0.8, (12, 16, 8), 0), (0.8, (14, 12, 4), 0)]


def walk(frame, view, yaw):
    share, head, shudder = WALK[frame]
    if frame < 8:
        legs = through([CONTACT_L, PASSING_L, CONTACT_R], share)
    else:
        legs = through([CONTACT_R, PASSING_R, CONTACT_L], share)
    roll = (-1 if frame < 8 else 1) * (8 if share >= 0.75 else 4)   # rolled hard onto the planted leg
    rot = summed(HUNCH, legs, tremor('bulwark_walk', frame, 0.9, ('spine', 'chest', 'neck')), {
        'pelvis': (0, roll * 0.4, roll), 'chest': (shudder * 10, shudder * 6, -roll * 0.4)})
    rot['head'] = head
    p, gear = drawn(rot, yaw, True, True)
    return hanging(arm(p, 'L', *GUARD)), gear


# The idle's twelve frames: the breath, the weight from one leg to the other, the head snapping and holding.
IDLE = [(0, -4, (14, 10, 4)), (1, -4, (14, 10, 4)), (2, -3, (14, 10, 4)), (2, -1, (18, -8, -6)),
        (1, 1, (18, -8, -6)), (0, 3, (18, -8, -6)), (-1, 4, (18, -8, -6)), (-1, 4, (12, 2, 10)),
        (0, 3, (12, 2, 10)), (1, 1, (12, 2, 10)), (1, -1, (16, 14, 2)), (0, -3, (16, 14, 2))]


def idle(frame, view, yaw):
    breath, weight, head = IDLE[frame]
    rot = summed(HUNCH, scaled(BRACE, 0.5), tremor('bulwark_idle', frame, 0.8, ('spine', 'chest', 'neck')),
                 {'chest': (breath, 0, 0), 'pelvis': (0, weight * 0.5, weight)})
    rot['head'] = head
    p, gear = drawn(rot, yaw, True, True)
    return hanging(arm(p, 'L', *GUARD)), gear


# The discharge, twelve frames: the shield thrust out and braced behind, held four frames as the core flares, the
# tell; the discharge throws it up and back; settling to guard. Each: the left wrist, its way, the chest's lean.
OUT = (0.0, -0.58, 1.3)
DISCHARGE = [(GUARD[0], 0), ((-0.02, -0.48, 1.27), 4), (OUT, 8), (OUT, 8), (OUT, 8), (OUT, 8), (OUT, 8),
             ((0.0, -0.46, 1.42), -10), ((-0.02, -0.44, 1.36), -6), ((-0.03, -0.42, 1.3), -2), ((-0.04, -0.41, 1.26), 0),
             (GUARD[0], 0)]


def discharge(frame, view, yaw):
    wrist, lean = DISCHARGE[frame]
    shake = 1.6 if 3 <= frame <= 6 else 0.8
    rot = summed(HUNCH, BRACE, tremor('bulwark_discharge', frame, shake, ('spine', 'chest', 'neck')),
                 {'chest': (lean, 0, 0)})
    rot['head'] = (14 + lean * 0.5, 0, 0)
    p, gear = drawn(rot, yaw, True, True)
    return hanging(arm(p, 'L', wrist, GUARD[1])), gear


# The change, eight frames: the shield arm dropping as the shield goes, the right hand lifting the maul as it forms,
# the left coming to its haft.
READY = ((-0.16, -0.34, 1.06), (0.1, -0.35, 0.93))   # the maul held two-handed before it, its head up


def change(frame, view, yaw):
    t = frame / 7
    rot = summed(HUNCH, scaled(BRACE, 0.6), tremor('bulwark_change', frame, 1.0, ('spine', 'chest', 'neck')),
                 {'chest': (6 * (1 - t), 0, -10 * t)})
    rot['head'] = (16, 6 - 12 * t, 0)
    p, gear = drawn(rot, yaw, True, True)
    if t < 0.5:
        return hanging(arm(p, 'L', tuple(g + (d - g) * t * 2 for g, d in zip(GUARD[0], (0.28, -0.1, 0.95))),
                           GUARD[1])), gear
    return gripped(p, *READY), gear


# The sweep, twelve frames: drawn back over the right shoulder, held two frames, the tell; swung flat across its
# front from its right to its left; followed through; back to ready. Each: the right wrist, the haft's way, the chest's
# turn, the legs.
SWEEP = [(READY[0], READY[1], 0, {}), ((-0.3, 0.06, 1.4), (-0.3, 0.4, 0.86), 24, BRACE),
         ((-0.32, 0.16, 1.46), (-0.3, 0.55, 0.78), 34, BRACE), ((-0.32, 0.17, 1.47), (-0.3, 0.56, 0.77), 34, BRACE),
         ((-0.36, -0.22, 1.24), (-1.0, -0.2, 0.15), 18, DRIVE), ((-0.06, -0.62, 1.16), (-0.1, -1.0, 0.05), -6, DRIVE),
         ((0.3, -0.42, 1.14), (0.9, -0.4, 0.0), -30, DRIVE), ((0.38, -0.1, 1.12), (0.9, 0.3, 0.1), -42, DRIVE),
         ((0.3, 0.02, 1.08), (0.6, 0.6, 0.4), -38, BRACE), ((0.1, -0.2, 1.04), (0.3, -0.2, 0.9), -18, BRACE),
         ((-0.08, -0.3, 1.05), (0.15, -0.3, 0.94), -6, {}), (READY[0], READY[1], 0, {})]


def sweep(frame, view, yaw):
    wrist, way, turn, legs = SWEEP[frame]
    shake = 1.5 if frame in (2, 3) else 0.7
    rot = summed(HUNCH, legs, tremor('bulwark_sweep', frame, shake, ('spine', 'chest', 'neck')),
                 {'chest': (0, 0, turn), 'pelvis': (0, 0, turn * 0.4)})
    rot['head'] = (14, 0, -turn * 0.3)
    p, gear = drawn(rot, yaw, True, True)
    return gripped(p, wrist, way), gear


# The slam, fourteen frames: crouched; reared up, the maul raised high over its head, held three frames, the tell;
# driven down to strike the ground before it; the jolt of the blow; heaved back up to ready. Each: the right wrist,
# the haft's way, the spine's bow, the legs.
HIGH = ((0.0, 0.08, 1.98), (0.0, 0.45, 0.9))
SLAM = [(READY[0], READY[1], 0, {}), ((-0.1, -0.2, 1.3), (0.0, -0.1, 1.0), 6, CROUCH),
        ((-0.04, 0.0, 1.8), (0.0, 0.3, 0.95), -6, COIL), (*HIGH, -14, BRACE), (*HIGH, -14, BRACE), (*HIGH, -14, BRACE),
        ((0.0, -0.3, 1.7), (0.0, -0.6, 0.8), 6, DRIVE), ((0.0, -0.66, 1.0), (0.0, -0.95, -0.3), 26, LUNGE),
        ((0.0, -0.74, 0.84), (0.0, -0.6, -0.8), 40, LUNGE), ((0.0, -0.72, 0.82), (0.0, -0.58, -0.82), 44, LUNGE),
        ((0.0, -0.66, 0.88), (0.0, -0.6, -0.8), 38, DRIVE), ((-0.06, -0.52, 0.8), (0.05, -0.7, -0.3), 26, DRIVE),
        ((-0.12, -0.4, 0.98), (0.1, -0.5, 0.6), 10, CROUCH), (READY[0], READY[1], 0, {})]


def slam(frame, view, yaw):
    wrist, way, bow, legs = SLAM[frame]
    shake = 1.8 if 3 <= frame <= 5 else (2.4 if frame == 9 else 0.7)   # the tell, and the jolt of the blow
    rot = summed(HUNCH, legs, tremor('bulwark_slam', frame, shake, ('spine', 'chest', 'neck')),
                 {'spine': (bow, 0, 0), 'chest': (bow * 0.5, 0, 0)})
    rot['head'] = (14 + bow * 0.3, 0, 0)
    p, gear = drawn(rot, yaw, True, True)
    return gripped(p, wrist, way), gear


MOVES = {'bulwark_walk': (walk, WALK), 'bulwark_idle': (idle, IDLE), 'bulwark_discharge': (discharge, DISCHARGE),
         'bulwark_change': (change, range(8)), 'bulwark_sweep': (sweep, SWEEP), 'bulwark_slam': (slam, SLAM)}
