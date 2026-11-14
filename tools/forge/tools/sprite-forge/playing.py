"""The bard's instruments played on the forge's bodies: the Lute, the Flute, the Recorder and the Tambourine
(instruments.py's models), four frames each and the same on either body. Each instrument is laid where a player holds
it, against the body or at the lips, and both arms are solved onto it (rig.py `solve_arm`): a fist round a neck, a
pipe or a hoop, an open hand on the strings or the head. Each instrument is a layer of its own, drawn in its own
animation alone (layers.py `weapon_anims`).

Points and ways are in body space, as poses.py's: the ground under the body, +X its left, -Y ahead, +Z up. An
instrument's own frame is instruments.py's: +Z along it from its root, +Y the face its strings, holes or head are on."""
import math

from mathutils import Matrix, Vector

import poses
from rig import solve_arm

PLAY = {'play_lute': 4, 'play_flute': 4, 'play_recorder': 4, 'play_tambourine': 4}
KIND_OF = {anim: anim[len('play_'):] for anim in PLAY}
MOUTH = Vector((0.0, -0.105, 0.02))   # the lips from the head's joint, in the head's frame
PALM = 0.05                           # the wrist to an open hand's middle

# a player's stand while they play: the weight a little more on the right leg, the knees soft, the head up
STAND = {
    'pelvis': (0, 2, 5), 'spine': (2, -1, -2), 'chest': (1, 0, -2), 'neck': (3, 0, 0), 'head': (-2, 0, 0),
    'thigh_R': (-6, 6, 6), 'shin_R': (6, 0, 0), 'foot_R': (2, 0, -6),
    'thigh_L': (8, -4, -6), 'shin_L': (8, 0, 0), 'foot_L': (2, 0, 6),
}


def stand(extra, yaw):
    """The playing stand with `extra` degrees added joint by joint."""
    rot = dict(STAND)
    for j, d in extra.items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    return poses.stance(rot, yaw)


def laid(pose, origin, axis, face):
    """The instrument's matrix (world): its root on `origin`, its +Z along `axis`, its +Y toward `face`."""
    R = poses.root_matrix(pose)
    z = (R.to_3x3() @ Vector(axis)).normalized()
    y = R.to_3x3() @ Vector(face)
    y = (y - y.project(z)).normalized()
    m = Matrix((y.cross(z), y, z)).transposed().to_4x4()
    m.translation = R @ Vector(origin)
    return m


def mouth(pose):
    """The lips, in body space."""
    return poses.root_matrix(pose).inverted() @ (pose.world()['head'] @ MOUTH)


def joint(pose, j):
    """Joint `j`'s place, in body space: an instrument is laid by the body's own, so it fits either body."""
    return poses.root_matrix(pose).inverted() @ pose.world()[j].translation


def fist(pose, side, M, at, along, pole):
    """`side`'s fist closed round the instrument (matrix `M`) at its point `at`, the round it closes on along `along`:
    both in the instrument's frame, the elbow toward `pole` (body space)."""
    Ri = poses.root_matrix(pose).inverted()
    poses.grip(pose, side, tuple(Ri @ (M @ Vector(at))), tuple(Ri.to_3x3() @ (M.to_3x3() @ Vector(along))), pole)


def palm(pose, side, M, at, fingers, back, pole):
    """`side`'s open hand, its middle on `at`, its fingers along `fingers` and its back toward `back`: in the frame of
    `M` (an instrument's, or the root's for a hand at rest), the elbow toward `pole` (body space)."""
    d = (M.to_3x3() @ Vector(fingers)).normalized()
    up = M.to_3x3() @ Vector(back)
    wrist = M @ Vector(at) - d * PALM
    solve_arm(pose, side, wrist, poses.root_matrix(pose).to_3x3() @ Vector(pole), hand_dir=d, hand_up=up)


# The Lute against the body, its tail at the right hip and its neck rising to the left, the belly out. The left fist
# frets near the nut and slides a fret down and back; the right hand comes over the upper edge and strikes down
# across the strings and up again, between the rose and the bridge. The head looks down at the frets, the body rocks.
LUTE_STRUM = ((0.03, 0.035), (0.0, 0.04), (-0.03, 0.047), (0.0, 0.04))   # the hand across the strings, and off them
LUTE_FRET = (0.72, 0.71, 0.70, 0.71)                                      # the left fist along the neck


def play_lute(frame, view, yaw):
    s = (0, 1, 0, -1)[frame]
    p = stand({'spine': (0, 0, 2 * s), 'chest': (2, 0, s), 'neck': (6, 0, 4), 'head': (14, -2, 10)}, yaw)
    M = laid(p, joint(p, 'pelvis') + Vector((-0.24, -0.26, -0.04)), (0.84, -0.22, 0.5), (0.0, -1.0, 0.1))
    fist(p, 'L', M, (0.0, -0.012, LUTE_FRET[frame]), (0.0, 0.0, 1.0), (0.5, 0.4, -1.0))
    x, y = LUTE_STRUM[frame]
    palm(p, 'R', M, (x, y, 0.17), (-1.0, 0.0, -0.2), (0.0, 1.0, 0.0), (-0.5, 0.8, -0.2))
    return p, {'axe': M, 'fist': {'L': True, 'R': False}}


# The Flute held out to the right at the lips, its mouth hole under the lower lip and turned up to it, both fists on
# it. The body sways with the phrase and the flute dips and lifts with it; the head tilts toward it.
FLUTE_DIP = (0.0, -0.04, 0.0, 0.04)


def play_flute(frame, view, yaw):
    s = (0, 1, 0, -1)[frame]
    p = stand({'spine': (2, -2 * s, 0), 'chest': (0, -s, -2), 'neck': (0, 0, -4), 'head': (2, -5, -8)}, yaw)
    M = laid(p, mouth(p) + Vector((-0.005, -0.02, -0.015)), (-0.93, -0.28, -0.22 + FLUTE_DIP[frame]), (0.0, 0.2, 1.0))
    fist(p, 'L', M, (0.0, 0.0, 0.237), (0.0, 0.0, 1.0), (0.2, 0.4, -1.0))
    fist(p, 'R', M, (0.0, 0.0, 0.362), (0.0, 0.0, 1.0), (-0.8, 0.2, -0.6))
    return p, {'axe': M, 'fist': {'L': True, 'R': True}}


# The Recorder at the lips, pointing down and ahead, the left fist above the right, the elbows out. The head nods it
# up and down with the beat, and the knees give on it.
RECORDER_NOD = ((0, 0.0), (5, 0.06), (0, 0.0), (-3, -0.03))   # the head's nod, degrees, and the pipe's lift with it


def play_recorder(frame, view, yaw):
    nod, lift = RECORDER_NOD[frame]
    give = (0, 1, 0, 1)[frame]
    p = stand({'head': (nod, 0, 0), 'thigh_R': (-3 * give, 0, 0), 'shin_R': (6 * give, 0, 0),
               'thigh_L': (-3 * give, 0, 0), 'shin_L': (6 * give, 0, 0)}, yaw)
    M = laid(p, mouth(p) + Vector((0.0, -0.012, -0.012)), (-0.03, -0.5 - lift, -0.86 + lift), (0.0, -1.0, 0.3))
    fist(p, 'L', M, (0.0, 0.0, 0.156), (0.0, 0.0, 1.0), (1.0, 0.2, -0.8))
    fist(p, 'R', M, (0.0, 0.0, 0.261), (0.0, 0.0, 1.0), (-1.0, 0.2, -0.8))
    return p, {'axe': M, 'fist': {'L': True, 'R': True}}


# The Tambourine raised in the left fist by its hoop, out to the left at the head's height, its head turned to the
# right hand. The right hand is raised to strike, strikes the head with its palm and falls away to the hip as the left
# shakes the jingles, the drum turned up; then it comes back. The body steps into the stroke.
TAMBOURINE_RIGHT = ((-0.02, 0.14, 0.03), (-0.01, 0.035, 0.0), None, (0.0, 0.09, 0.02))   # the palm, the drum's frame
TAMBOURINE_TURN = (0.0, 0.0, 22.0, 6.0)   # the drum turned about its grip, degrees: the shake


def play_tambourine(frame, view, yaw):
    s = (0, 1, 0, -1)[frame]
    strike = frame == 1
    p = stand({'pelvis': (0, -2 * s, 0), 'spine': (0, 3 * s, 4), 'head': (-4, 2 * s, 14),
               'thigh_R': (-8 if strike else 0, 0, 0), 'shin_R': (12 if strike else 0, 0, 0)}, yaw)
    import instruments
    S = instruments.SHAPES['tambourine']
    g = math.radians(S['grip_at'])
    rho, tau = Vector((math.sin(g), 0.0, math.cos(g))), Vector((math.cos(g), 0.0, -math.sin(g)))
    M = laid(p, joint(p, 'uarm_L') + Vector((0.15, -0.40, -0.06 + (0.05 if frame == 2 else 0.0))), (0.05, 0.1, 1.0),
             (-0.75, -0.55, -0.1))
    at = rho * (S['r'] + 0.012)
    if TAMBOURINE_TURN[frame]:   # turned about the grip, so the fist stays on the hoop
        M = M @ Matrix.Translation(at) @ Matrix.Rotation(math.radians(TAMBOURINE_TURN[frame]), 4, tau) \
            @ Matrix.Translation(-at)
    fist(p, 'L', M, tuple(at), tuple(tau), (0.6, 0.3, -1.0))
    right = TAMBOURINE_RIGHT[frame]
    if right is None:   # down at the hip while the jingles shake
        palm(p, 'R', poses.root_matrix(p), (-0.3, -0.1, 0.95), (-0.15, -0.1, -1.0), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0))
    else:
        palm(p, 'R', M, right, (0.1, 0.0, 1.0), (0.0, 1.0, 0.0), (-0.8, 0.4, -0.6))
    return p, {'axe': M, 'fist': {'L': True, 'R': False}}


ANIMS = {'play_lute': play_lute, 'play_flute': play_flute, 'play_recorder': play_recorder,
         'play_tambourine': play_tambourine}
poses.ANIMS.update(ANIMS)


def materials():
    """Every material name the instruments wear (instruments.py `OWN_MATS`)."""
    import instruments
    return sorted({n for mats in instruments.OWN_MATS.values() for n in mats})


def build_instruments():
    """Each instrument as a mesh in its own frame, in its own materials (instruments.py `palette`): {kind: [object]}."""
    import bpy
    import instruments
    import materials as mats
    P = {**instruments.palette(), 'brass': mats.plain('brass', (0.5, 0.34, 0.1), rough=0.35, spec=0.6)}   # the tools'
    make = {'lute': instruments.lute, 'flute': instruments.flute, 'recorder': instruments.recorder,
            'tambourine': instruments.tambourine}
    out = {}
    for kind in KIND_OF.values():
        v, t, m = make[kind](instruments.SHAPES[kind])
        me = bpy.data.meshes.new(kind)
        me.from_pydata(v.tolist(), [], t.tolist())
        for name in instruments.OWN_MATS[kind]:
            me.materials.append(P[name])
        me.polygons.foreach_set('material_index', [int(i) for i in m])
        me.update()
        ob = bpy.data.objects.new(kind, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.hide_render = True
        out[kind] = [ob]
    return out
