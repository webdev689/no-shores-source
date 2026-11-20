"""The Husk's own moves for the Sprite Forge: its shambling walk and its lunge, each a pose a frame as the forge's own
cast is (casting.py). Registered by `register()` before the forge's `layers.main()` runs. Angles are degrees about each
joint's rest axes (rig.py `Pose`): an arm or thigh swings forward on -X, a knee bends on +X, an elbow on -X, the trunk
leans forward on +X; x is the body's left, -y its front."""
from mathutils import Vector

import layers
import poses
from rig import solve_arm

# The walk's eight frames: the forge's own contact and passing keys, each step reached in two frames, the right leg's
# step dragged short with its toe down. The trunk hunched over, the head lolled toward the great crystal's weight,
# the left shoulder dropped under its crystal and that arm hanging dead, the right half raised as if reaching.
STEPS = [poses.WALK_LEGS[0], poses.WALK_LEGS[1], poses._mirror_legs(poses.WALK_LEGS[0]),
         poses._mirror_legs(poses.WALK_LEGS[1])]
HUNCH = {'spine': (20, 0, 0), 'chest': (14, 4, 0), 'neck': (14, 0, 0),
         'clav_L': (0, 0, -12), 'uarm_L': (-8, -6, 0), 'farm_L': (-10, 0, 0), 'hand_L': (0, 0, 0),
         'uarm_R': (-38, 10, 0), 'farm_R': (-30, 0, 0)}
LURCH = [-9, -4, 6, 10, 9, 4, -6, -10]           # the pelvis rolled onto each leg in turn, deeper than a person's
HEAD = [(16, 20, 6), (14, 22, 4), (18, 16, 8), (12, 24, 2), (20, 18, 10), (15, 26, 0), (17, 14, 9), (13, 22, 3)]


def blend(a, b, t):
    return {j: tuple(x + (y - x) * t for x, y in zip(a.get(j, (0, 0, 0)), b.get(j, (0, 0, 0)))) for j in {*a, *b}}


def shamble(frame, view, yaw):
    step, half = divmod(frame, 2)
    legs = blend(STEPS[step], STEPS[(step + 1) % 4], half / 2)
    thigh = legs['thigh_R']
    legs['thigh_R'] = (thigh[0] * 0.45, *thigh[1:])   # the dragged leg's short step
    legs['foot_R'] = (legs['foot_R'][0] + 22, *legs['foot_R'][1:])
    swing = LURCH[frame]
    rot = {**HUNCH, **legs, 'pelvis': (0, swing * 0.4, swing), 'head': HEAD[frame]}
    rot['chest'] = (rot['chest'][0], rot['chest'][1] - swing * 0.6, -swing * 0.5)
    rot['uarm_L'] = (rot['uarm_L'][0] + swing * 1.2, *rot['uarm_L'][1:])   # the dead arm swung by the lurch alone
    return poses.stance(rot, yaw), {'fist': {'L': False, 'R': False}}


# The lunge's eight frames, each the wrists (body space, metres), the chest's lean and the legs: hunched; drawn back
# and down, the arms cocked behind, held two frames so a player reads it; thrown forward, both hands clawing at the
# chest of whoever stands before it; overreached; stumbling back to the hunch.
CROUCH = {'thigh_L': (-30, -8, -12), 'shin_L': (40, 0, 0), 'thigh_R': (10, 10, 16), 'shin_R': (44, 0, 0)}
LUNGE = {'thigh_L': (-46, -8, -12), 'shin_L': (44, 0, 0), 'thigh_R': (34, 10, 16), 'shin_R': (6, 0, 0)}
DRIVE = {'thigh_L': (-34, -8, -12), 'shin_L': (30, 0, 0), 'thigh_R': (24, 10, 16), 'shin_R': (12, 0, 0)}
REACH = [
    ((0.24, -0.12, 1.02), (-0.22, -0.30, 1.20), 20, {}),
    ((0.30, 0.18, 1.10), (-0.30, 0.16, 1.12), 26, CROUCH),
    ((0.32, 0.24, 1.18), (-0.32, 0.22, 1.18), 30, CROUCH),
    ((0.32, 0.24, 1.18), (-0.32, 0.22, 1.18), 30, CROUCH),
    ((0.20, -0.52, 1.30), (-0.20, -0.52, 1.30), 34, DRIVE),
    ((0.16, -0.74, 1.26), (-0.16, -0.74, 1.26), 40, LUNGE),
    ((0.18, -0.62, 1.04), (-0.20, -0.58, 1.02), 38, LUNGE),
    ((0.24, -0.26, 1.00), (-0.24, -0.32, 1.10), 24, DRIVE),
]
ELBOW_L = (0.8, 0.5, -0.6)   # out, back and down, as the forge's cast bends them
ELBOW_R = (-0.8, 0.4, -0.6)


def lunge(frame, view, yaw):
    left, right, lean, legs = REACH[frame]
    rot = {**HUNCH, **legs, 'head': (6, 10, 0)}
    rot['chest'] = (rot['chest'][0] + lean - 14, *rot['chest'][1:])
    p = poses.stance(rot, yaw)
    at = poses.root_matrix(p)
    turn = at.to_3x3()
    solve_arm(p, 'L', at @ Vector(left), turn @ Vector(ELBOW_L))
    solve_arm(p, 'R', at @ Vector(right), turn @ Vector(ELBOW_R))
    return p, {'fist': {'L': False, 'R': False}}


MOVES = {'husk_walk': (shamble, 8), 'husk_lunge': (lunge, 8)}


def register():
    """Both moves known to the forge before it loads its body, as a move must be (layers.py `load_body`)."""
    poses.ANIMS.update({name: pose for name, (pose, _) in MOVES.items()})
    layers.ANIMS.update({name: frames for name, (_, frames) in MOVES.items()})
