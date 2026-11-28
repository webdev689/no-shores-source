"""The Husk's own moves for the Sprite Forge: its idle, its shambling walk, its lunge and its Gore, each a pose a frame
as the forge's own cast is (casting.py). After the Husk in project-final: irregular snap-then-plant
footfalls, uneven strides, a constant tremor, the odd deep shudder, the head cocking on its own. Its attacks start and
end in its idle's stance. Angles as motion.py's."""
import numpy as np

from motion import (BUCKLE, COIL, CONTACT_L, CONTACT_R, CROUCH, DRIVE, HURT, LUNGE, PASSING_L, PASSING_R, STAGGER,
                    STAND, STEP_BACK, blend, drawn, reach, recoil, scaled, summed, through, tremor)

HUNCH = {'spine': (20, 0, 0), 'chest': (14, 4, 0), 'neck': (-14, 0, 0),   # bowed, its head raised to its prey
         'clav_L': (0, 0, -12), 'uarm_L': (-8, -6, 0), 'farm_L': (-10, 0, 0),
         'uarm_R': (-38, 10, 0), 'farm_R': (-30, 0, 0)}

# The idle's twelve frames: each the head (pitch, cock, turn) and the sway, and a twitch through it at frame 8, the
# right hand clenching and opening.
IDLE = [((6, 14, 4), -4, 0, False), ((6, 16, 4), -3, 0, False), ((7, 18, 3), -2, 0, True), ((7, 18, 2), 0, 0, True),
        ((6, 16, 0), 2, 0, True), ((5, 12, -2), 3, 0, False), ((5, 10, -3), 4, 0, False), ((6, 12, -2), 3, 0, False),
        ((14, 28, -8), 2, 1, True), ((9, 20, -4), 0, 0.4, False), ((6, 16, 2), -2, 0, False), ((6, 14, 4), -3, 0, False)]


def idle(frame, view, yaw):
    head, sway, twitch, clench = IDLE[frame]
    rot = summed(HUNCH, STAND, tremor('husk_idle', frame, 1.0 + twitch * 2.5), {
        'pelvis': (0, sway * 0.4, sway), 'chest': (twitch * 6, -sway * 0.5, 0), 'clav_L': (0, 0, -twitch * 6)})
    rot['head'] = head
    return drawn(rot, yaw, right_fist=clench)


# The walk's sixteen frames, two steps unlike each other on the forge's own walking keys. Frames 0-7: the right leg's
# step, dragged, its knee barely lifting and its toe scraping, the left knee giving under the weight it just took.
# Frames 8-15: the left leg's, long, swung slow then snapped down to land on frame 15, held there into frame 0.
# The foot bearing the weight is flat on the ground; the hips sink as the left knee gives under it.
DRAG = {'thigh_R': (12, 0, 0), 'shin_R': (-18, 0, 0), 'foot_R': (24, 0, 0)}   # its swing held low, the toe down
GIVE = (0.03, 0.015)
# Each frame's upper body: the pelvis's roll onto the leg it stands on, the head (pitch, cock, turn) lagging the
# lurch with one sideways snap at frame 5, the left shoulder's hitch, the right arm's reach, how hard the frame shudders,
# and whether the right hand clenches.
WALK_BODY = [
    (-10, (6, 18, 6), 0, 0, 0, False), (-8, (7, 22, 4), 0, 2, 0, False), (-4, (5, 24, 2), 2, 4, 0, False),
    (2, (4, 22, 0), 4, 4, 0, True), (6, (6, 18, -2), 2, 2, 0, True), (9, (14, 38, -10), 0, 0, 0, True),
    (10, (8, 30, -6), -2, -2, 0, False), (10, (6, 24, -2), 0, -2, 0, False), (8, (6, 20, 2), 0, 0, 0, False),
    (5, (7, 16, 4), 0, 2, 0, False), (0, (8, 14, 6), 2, 4, 0, False), (-4, (12, 18, 4), 6, 6, 1, True),
    (-7, (8, 24, 2), 10, 2, 0, True), (-9, (6, 22, 4), 12, 0, 0, False), (-10, (5, 18, 6), 6, -2, 0, False),
    (-10, (6, 16, 6), 2, -2, 0, False),
]


def shambling(frame):
    """The walk's pose at `frame`, whether the right hand clenches, and its footing (motion.py `drawn`): the Ravager
    walks it too, its arms its own."""
    footing = dict(plant='L' if frame < 8 else 'R' if frame < 15 else 'LR', drop=GIVE[frame] if frame < 2 else 0.0)
    if frame < 8:
        legs = summed(through([CONTACT_L, PASSING_L, CONTACT_R], frame / 8), scaled(DRAG, np.sin(np.pi * frame / 8)))
    else:
        legs = through([CONTACT_R, PASSING_R, CONTACT_L], ((frame - 7) / 8) ** 1.6)   # slow, then snapped down
    roll, head, hitch, swing, shudder, clench = WALK_BODY[frame]
    rot = summed(HUNCH, legs, tremor('husk_walk', frame, 1.2), {
        'pelvis': (0, roll * 0.4, roll), 'chest': (shudder * 8, -roll * 0.6, -roll * 0.5),
        'spine': (shudder * 6, 0, 0), 'clav_L': (0, 0, -hitch), 'uarm_L': (roll * 1.2, 0, 0),
        'uarm_R': (-swing * 2, 0, 0)})
    rot['head'] = head   # the head's own, never shaken: its cock is the move
    return rot, clench, footing


def shamble(frame, view, yaw):
    rot, clench, footing = shambling(frame)
    return drawn(rot, yaw, right_fist=clench, **footing)


# The lunge's twelve frames, each the wrists (body space, metres), the chest's lean, the head, the legs and whether
# the hands close: standing; the head snapping up to find its prey; gathering; coiled, the arms cocked behind, held
# trembling three frames as its tell; launched; at full reach, fingers splayed; the hands clenched shut on the grab;
# overreached on a buckling knee; stumbling back to its stance, the head shaken.
REACH = [
    ((0.24, -0.12, 1.02), (-0.22, -0.30, 1.20), 0, (6, 20, 6), STAND, False),
    ((0.24, -0.10, 1.04), (-0.22, -0.28, 1.20), -6, (-14, 4, 0), STAND, False),
    ((0.28, 0.06, 1.08), (-0.28, 0.02, 1.12), 6, (-6, 6, 0), CROUCH, False),
    ((0.32, 0.24, 1.18), (-0.32, 0.22, 1.18), 12, (0, 4, 0), COIL, True),
    ((0.33, 0.25, 1.19), (-0.31, 0.23, 1.17), 13, (-1, 6, 2), COIL, True),
    ((0.32, 0.26, 1.18), (-0.33, 0.24, 1.18), 12, (1, 3, -2), COIL, True),
    ((0.22, -0.40, 1.24), (-0.22, -0.40, 1.24), 16, (2, 0, 0), DRIVE, False),
    ((0.2, -0.78, 1.32), (-0.2, -0.78, 1.32), 22, (4, 0, 0), LUNGE, False),
    ((0.14, -0.72, 1.28), (-0.14, -0.72, 1.28), 24, (6, 4, 0), LUNGE, True),
    ((0.16, -0.62, 1.00), (-0.20, -0.56, 0.98), 30, (14, 10, 4), BUCKLE, True),
    ((0.26, -0.30, 0.98), (-0.26, -0.34, 1.04), 12, (6, 24, 10), DRIVE, False),
    ((0.24, -0.14, 1.02), (-0.22, -0.28, 1.18), 2, (8, 14, -12), STAND, False),
]


def lunge(frame, view, yaw):
    left, right, lean, head, legs, grip = REACH[frame]
    shake = 1.6 if 3 <= frame <= 5 else 0.8   # the coil trembles harder than the rest
    rot = summed(HUNCH, legs, tremor('husk_lunge', frame, shake), {'chest': (lean, 0, 0)})
    rot['head'] = head
    pose, gear = drawn(rot, yaw, grip, grip)
    return reach(pose, left, right), gear


# The Gore's fourteen frames, each how much further the spine, chest and neck bow, the head (pitch, cock, turn), the
# arms' trail back, the right foot's scrape back along the ground (degrees of the thigh) and the legs: standing; the
# head dropping with a shudder, over two frames; the right foot pawing the ground back twice, as a bull does, the great
# crystal aimed ahead; aimed and trembling, held two frames as its tell; launched; driven; at full stretch, which is
# also where it overreaches; the jolt of what it strikes; staggering; the head shaken as it rights itself.
GORE = [
    ((0, 0, 0), (6, 20, 6), 0, 0, STAND),
    ((6, 4, 8), (18, 30, 4), 4, 0, CROUCH),
    ((14, 8, 14), (28, 4, 0), 10, 0, CROUCH),
    ((14, 8, 14), (28, 2, 0), 10, 26, CROUCH),
    ((14, 8, 14), (28, 2, 0), 10, -6, CROUCH),
    ((14, 8, 14), (28, 2, 0), 10, 30, CROUCH),
    ((16, 9, 15), (29, 0, 0), 12, 0, COIL),
    ((16, 9, 15), (30, 1, -1), 12, 0, COIL),
    ((18, 10, 16), (30, 0, 0), 16, 0, DRIVE),
    ((21, 11, 16), (32, 0, 0), 18, 0, LUNGE),
    ((23, 12, 16), (32, 0, 0), 20, 0, LUNGE),
    ((18, 9, 12), (22, 16, 8), 6, 0, BUCKLE),
    ((12, 6, 8), (14, 26, 10), -10, 0, DRIVE),
    ((4, 2, 2), (8, 8, -16), 2, 0, STAND),
]


def gore_rush(frame, view, yaw):
    (spine, chest, neck), head, trail, scrape, legs = GORE[frame]
    shake = 1.6 if 6 <= frame <= 7 else 0.8
    bow = {'spine': (spine, 0, 0), 'chest': (chest, 0, 0), 'neck': (neck, 0, 0)}
    if frame in (1, 11):   # the shudder as the head drops, and the jolt of what it strikes
        bow['chest'] = (chest + 6, 4, -3)
    arms = {'uarm_L': (trail, -10, 0), 'uarm_R': (trail, 10, 0), 'farm_L': (-15, 0, 0), 'farm_R': (-15, 0, 0)}
    paw = {'thigh_R': (scrape, 0, 0)}   # planted, so the foot scrapes back along the ground (motion.py `planted`)
    rot = summed({**HUNCH, **arms}, legs, bow, paw, tremor('husk_gore', frame, shake))
    rot['head'] = head
    return drawn(rot, yaw)


def hurt(frame, view, yaw):
    """Four frames: struck, the trunk and head thrown back and twisted, the arms flung up, back to its stance."""
    hard = HURT[frame]
    rot = summed(HUNCH, STAND, recoil(hard, -6 * hard), tremor('husk_hurt', frame, 1.0 + hard),
                 {'uarm_L': (-20 * hard, -10 * hard, 0), 'uarm_R': (-10 * hard, 14 * hard, 0)})
    rot['head'] = (6 - 22 * hard, 20 + 10 * hard, 6)
    return drawn(rot, yaw)


def stagger(frame, view, yaw):
    """Eight frames: thrown back off its feet, a step back, the arms out for its balance, finding its feet."""
    hard = STAGGER[frame]
    rot = summed(HUNCH, blend(STAND, STEP_BACK, min(1.0, hard)), recoil(hard, 8 * hard),
                 tremor('husk_stagger', frame, 1.0 + hard), {'uarm_L': (-10 * hard, -40 * hard, 0),
                                                             'uarm_R': (-6 * hard, 40 * hard, 0),
                                                             'farm_L': (-20 * hard, 0, 0), 'farm_R': (-20 * hard, 0, 0)})
    rot['head'] = (6 - 18 * hard, 20 - 30 * hard, -10 * hard)
    return drawn(rot, yaw)


MOVES = {'husk_idle': (idle, IDLE), 'husk_walk': (shamble, WALK_BODY), 'husk_lunge': (lunge, REACH),
         'husk_gore': (gore_rush, GORE), 'husk_hurt': (hurt, HURT), 'husk_stagger': (stagger, STAGGER)}
