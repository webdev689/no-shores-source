"""The Husk's own moves for the Sprite Forge: its shambling walk, its lunge and its Gore, each a pose a frame as the
forge's own cast is (casting.py), registered by `register()` before the forge's `layers.main()` runs. Angles are
degrees about each joint's rest axes (rig.py `Pose`): an arm or thigh swings forward on -X, a knee bends on +X, an elbow
on -X, the trunk and head lean forward on +X; x is the body's left, -y its front. The owner's own Husk (project-final)
sets the motion: irregular snap-then-plant footfalls, uneven strides, a constant tremor, the odd deep shudder, the head
cocking on its own."""
import numpy as np
from mathutils import Vector

import layers
import poses
from rig import solve_arm

TREMBLING = ('spine', 'chest', 'neck', 'head', 'uarm_L', 'uarm_R', 'farm_L', 'farm_R', 'hand_L', 'hand_R')
ELBOW_L = (0.8, 0.5, -0.6)   # out, back and down, as the forge's cast bends them
ELBOW_R = (-0.8, 0.4, -0.6)
CROUCH = {'thigh_L': (-30, -8, -12), 'shin_L': (40, 0, 0), 'thigh_R': (10, 10, 16), 'shin_R': (44, 0, 0)}
COIL = {'thigh_L': (-34, -8, -12), 'shin_L': (52, 0, 0), 'thigh_R': (14, 10, 16), 'shin_R': (56, 0, 0)}
DRIVE = {'thigh_L': (-34, -8, -12), 'shin_L': (30, 0, 0), 'thigh_R': (24, 10, 16), 'shin_R': (12, 0, 0)}
LUNGE = {'thigh_L': (-46, -8, -12), 'shin_L': (44, 0, 0), 'thigh_R': (34, 10, 16), 'shin_R': (6, 0, 0)}
BUCKLE = {'thigh_L': (-40, -8, -12), 'shin_L': (62, 0, 0), 'thigh_R': (30, 10, 16), 'shin_R': (10, 0, 0)}
HUNCH = {'spine': (20, 0, 0), 'chest': (14, 4, 0), 'neck': (14, 0, 0),
         'clav_L': (0, 0, -12), 'uarm_L': (-8, -6, 0), 'farm_L': (-10, 0, 0),
         'uarm_R': (-38, 10, 0), 'farm_R': (-30, 0, 0)}


def summed(*parts):
    """Rotations added joint by joint: a base pose, then each layer of motion over it."""
    out = {}
    for part in parts:
        for joint, turn in part.items():
            out[joint] = tuple(a + b for a, b in zip(out.get(joint, (0, 0, 0)), turn))
    return out


def blend(a, b, t):
    return {j: tuple(x + (y - x) * t for x, y in zip(a.get(j, (0, 0, 0)), b.get(j, (0, 0, 0)))) for j in {*a, *b}}


def through(keys, t):
    """`keys` (poses at even steps from 0 to 1) at `t`, each step eased in and out."""
    span = t * (len(keys) - 1)
    k = min(int(span), len(keys) - 2)
    u = span - k
    return blend(keys[k], keys[k + 1], u * u * (3 - 2 * u))


def tremor(move, frame, degrees):
    """The constant tremor: a small shake of the trunk and arms, the same every time the frame is drawn."""
    shake = np.random.default_rng(sum(map(ord, move)) * 100 + frame)
    return {j: tuple(shake.normal(0.0, degrees, 3)) for j in TREMBLING}


def drawn(rot, yaw, left_fist=False, right_fist=False):
    return poses.stance(rot, yaw), {'fist': {'L': left_fist, 'R': right_fist}}


# The walk's sixteen frames, two steps unlike each other on the forge's own walking keys. Frames 0-7: the right leg's
# step, dragged, its knee barely lifting and its toe scraping. Frames 8-15: the left leg's, long, swung slow then
# snapped down and stamped flat, the knee giving under the weight as it lands.
CONTACT_L, PASSING_L = poses.WALK_LEGS
CONTACT_R, PASSING_R = poses._mirror_legs(CONTACT_L), poses._mirror_legs(PASSING_L)
DRAG = {'thigh_R': (12, 0, 0), 'shin_R': (-18, 0, 0), 'foot_R': (24, 0, 0)}   # its swing held low, the toe down
GIVE = {'shin_L': (12, 0, 0), 'thigh_L': (-6, 0, 0)}
# Each frame's upper body: the pelvis's roll onto the leg it stands on, the head (pitch, cock, turn) lagging the
# lurch with one sideways snap at frame 5, the left shoulder's hitch, the right arm's reach, how hard the frame shudders,
# and whether the right hand clenches.
WALK_BODY = [
    (-10, (16, 18, 6), 0, 0, 0, False), (-8, (17, 22, 4), 0, 2, 0, False), (-4, (15, 24, 2), 2, 4, 0, False),
    (2, (14, 22, 0), 4, 4, 0, True), (6, (16, 18, -2), 2, 2, 0, True), (9, (24, 38, -10), 0, 0, 0, True),
    (10, (18, 30, -6), -2, -2, 0, False), (10, (16, 24, -2), 0, -2, 0, False), (8, (16, 20, 2), 0, 0, 0, False),
    (5, (17, 16, 4), 0, 2, 0, False), (0, (18, 14, 6), 2, 4, 0, False), (-4, (22, 18, 4), 6, 6, 1, True),
    (-7, (18, 24, 2), 10, 2, 0, True), (-9, (16, 22, 4), 12, 0, 0, False), (-10, (15, 18, 6), 6, -2, 0, False),
    (-10, (16, 16, 6), 2, -2, 0, False),
]


def shamble(frame, view, yaw):
    if frame < 8:
        legs = summed(through([CONTACT_L, PASSING_L, CONTACT_R], frame / 8),
                      {j: tuple(v * np.sin(np.pi * frame / 8) for v in d) for j, d in DRAG.items()})
    else:
        t = ((frame - 8) / 8) ** 1.6   # slow through the swing, then snapped down
        landing = max(0.0, (frame - 13) / 2)
        legs = summed(through([CONTACT_R, PASSING_R, CONTACT_L], t),
                      {j: tuple(v * landing for v in d) for j, d in GIVE.items()})
    roll, head, hitch, reach, shudder, clench = WALK_BODY[frame]
    rot = summed(HUNCH, legs, tremor('husk_walk', frame, 1.2), {
        'pelvis': (0, roll * 0.4, roll), 'chest': (shudder * 8, -roll * 0.6, -roll * 0.5),
        'spine': (shudder * 6, 0, 0), 'clav_L': (0, 0, -hitch), 'uarm_L': (roll * 1.2, 0, 0),
        'uarm_R': (-reach * 2, 0, 0)})
    rot['head'] = head   # the head's own, never shaken: its cock is the move
    return drawn(rot, yaw, right_fist=clench)


# The lunge's twelve frames, each the wrists (body space, metres), the chest's lean, the head, the legs and whether
# the hands close: hunched; the head snapping up to find its prey; gathering; coiled, the arms cocked behind, held
# trembling three frames as its tell; launched; at full reach, fingers splayed; the hands clenched shut on the grab;
# overreached on a buckling knee; stumbling back; recovering with a shake of the head.
REACH = [
    ((0.24, -0.12, 1.02), (-0.22, -0.30, 1.20), 0, (16, 20, 6), {}, False),
    ((0.24, -0.10, 1.04), (-0.22, -0.28, 1.20), -6, (-6, 4, 0), {}, False),
    ((0.28, 0.06, 1.08), (-0.28, 0.02, 1.12), 6, (2, 6, 0), CROUCH, False),
    ((0.32, 0.24, 1.18), (-0.32, 0.22, 1.18), 12, (8, 4, 0), COIL, True),
    ((0.33, 0.25, 1.19), (-0.31, 0.23, 1.17), 13, (7, 6, 2), COIL, True),
    ((0.32, 0.26, 1.18), (-0.33, 0.24, 1.18), 12, (9, 3, -2), COIL, True),
    ((0.22, -0.40, 1.24), (-0.22, -0.40, 1.24), 16, (10, 0, 0), DRIVE, False),
    ((0.17, -0.76, 1.28), (-0.17, -0.76, 1.28), 22, (12, 0, 0), LUNGE, False),
    ((0.12, -0.70, 1.24), (-0.12, -0.70, 1.24), 24, (14, 4, 0), LUNGE, True),
    ((0.16, -0.62, 1.00), (-0.20, -0.56, 0.98), 30, (22, 10, 4), BUCKLE, True),
    ((0.26, -0.30, 0.98), (-0.26, -0.34, 1.04), 12, (14, 24, 10), DRIVE, False),
    ((0.24, -0.14, 1.02), (-0.22, -0.28, 1.18), 2, (16, 14, -12), {}, False),
]


def lunge(frame, view, yaw):
    left, right, lean, head, legs, grip = REACH[frame]
    held = 1.6 if 3 <= frame <= 5 else 0.8   # the coil trembles harder than the rest
    rot = summed(HUNCH, legs, tremor('husk_lunge', frame, held), {'chest': (lean, 0, 0)})
    rot['head'] = head
    p, gear = drawn(rot, yaw, grip, grip)
    at = poses.root_matrix(p)
    turn = at.to_3x3()
    solve_arm(p, 'L', at @ Vector(left), turn @ Vector(ELBOW_L))
    solve_arm(p, 'R', at @ Vector(right), turn @ Vector(ELBOW_R))
    return p, gear


# The Gore's fourteen frames, each how much further the spine, chest and neck bow, the head (pitch, cock, turn), the
# arms' trail back, the right foot's scrape back (degrees of the thigh) and the legs: hunched; the head dropping with a
# shudder; bowed until the great crystal points ahead; the right foot pawing the ground back twice, as a bull does;
# aimed and trembling, held two frames as its tell; launched; driven; at full stretch; the jolt of what it strikes;
# overreached; staggering; the head shaken as it rights itself.
GORE = [
    ((0, 0, 0), (16, 20, 6), 0, 0, {}),
    ((10, 8, 22), (34, 30, 4), 6, 0, CROUCH),
    ((20, 12, 28), (40, 4, 0), 12, 0, CROUCH),
    ((20, 12, 28), (40, 2, 0), 12, 26, CROUCH),
    ((20, 12, 28), (40, 2, 0), 12, -6, CROUCH),
    ((20, 12, 28), (40, 2, 0), 12, 30, CROUCH),
    ((22, 13, 29), (41, 0, 0), 14, 0, COIL),
    ((22, 13, 29), (42, 1, -1), 14, 0, COIL),
    ((26, 14, 30), (42, 0, 0), 18, 0, DRIVE),
    ((30, 16, 30), (46, 0, 0), 20, 0, LUNGE),
    ((33, 17, 31), (48, 0, 0), 22, 0, LUNGE),
    ((26, 12, 24), (30, 16, 8), 6, 0, BUCKLE),
    ((18, 8, 14), (24, 26, 10), -10, 0, DRIVE),
    ((8, 4, 6), (20, 8, -16), 2, 0, {}),
]


def gore_rush(frame, view, yaw):
    (spine, chest, neck), head, trail, scrape, legs = GORE[frame]
    shake = 1.6 if 6 <= frame <= 7 else 0.8
    bow = {'spine': (spine, 0, 0), 'chest': (chest, 0, 0), 'neck': (neck, 0, 0)}
    if frame in (1, 11):   # the shudder as the head drops, and the jolt of what it strikes
        bow['chest'] = (chest + 6, 4, -3)
    arms = {'uarm_L': (trail, -10, 0), 'uarm_R': (trail, 10, 0), 'farm_L': (-15, 0, 0), 'farm_R': (-15, 0, 0)}
    paw = {'thigh_R': (scrape, 0, 0), 'shin_R': (abs(scrape) * 0.6, 0, 0), 'foot_R': (scrape * 0.5, 0, 0)}
    rot = summed({**HUNCH, **arms}, legs, bow, paw, tremor('husk_gore', frame, shake))
    rot['head'] = head
    return drawn(rot, yaw)


MOVES = {'husk_walk': (shamble, WALK_BODY), 'husk_lunge': (lunge, REACH), 'husk_gore': (gore_rush, GORE)}


def register():
    """The moves known to the forge before it loads its body, as a move must be (layers.py `load_body`)."""
    poses.ANIMS.update({name: pose for name, (pose, _) in MOVES.items()})
    layers.ANIMS.update({name: len(frames) for name, (_, frames) in MOVES.items()})
