"""The harpy (TEXTURE.268): a woman's head in a curtain of long grey hair on a dark feathered body, dark feathered
thighs on scaly shins ending in big spread talons, and ragged feathered wings near three metres across: olive at the
root, dark purple-grey over the coverts and lilac along the trailing feathers. Each wing is an arm and five feathers'
rays fanned from the wrist, hidden in a vane stretched back to the flank and cut into feather tips (wing.py). The
torso is skinned over the chest and hips, the legs along their joints; the head, the hair and the talons are rigid.
It flies: nothing grounds it.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the harpy faces -Y). At rest it lies level,
as it flies; a turn about X pitches it (head down on +)."""
import math

import numpy as np

import hides
import materials
from beastkit import Piece, Pose, Skeleton, Skin, apart, chain_weights, cone, hang, rigid, tube, weights_over
from body import blob, blob_mesh, seg
from faces import face
from wing import Wing

FLIES = True
Z = 1.3
FINGERS = 5
WING = Wing(shoulder=(0.12, -0.2, Z + 0.06), elbow=(0.45, -0.1, Z + 0.08), wrist=(0.8, -0.22, Z + 0.08),
            tips=[(1.36, -0.2, Z + 0.06), (1.3, 0.14, Z + 0.04), (1.05, 0.38, Z + 0.02), (0.73, 0.46, Z),
                  (0.42, 0.42, Z)],
            hip=(0.1, 0.05, Z), foot=(0.11, 0.28, Z + 0.02), body='chest', leg='flank', camber=0.05, scallop=0.03,
            bone_r=(0.032, 0.024, 0.02, 0.004, 0.002), step=0.015, faces_up=True, serrate=0.1)
TORSO_PATH = [(0, -0.36, Z + 0.05), (0, -0.22, Z + 0.03), (0, 0.0, Z), (0, 0.2, Z - 0.02), (0, 0.32, Z - 0.03)]
# rows (t, half width, up, down): the neck, the chest broadest, the waist, the hips, the tail's stub
TORSO = [(0.0, 0.06, 0.06, 0.06), (0.2, 0.16, 0.1, 0.11), (0.5, 0.12, 0.09, 0.09), (0.78, 0.15, 0.1, 0.1),
         (1.0, 0.05, 0.04, 0.04)]
# a leg at rest (the left), trailing back as it flies: hip, knee, ankle and the foot's ball
LEG = [(0.1, 0.18, Z - 0.04), (0.11, 0.42, Z - 0.16), (0.11, 0.72, Z - 0.12), (0.11, 0.82, Z - 0.12)]
THIGH_R = [(0.0, 0.085), (1.0, 0.06)]   # the thigh feathered dark down to the knee
SHIN_R = [(0.0, 0.035), (0.5, 0.03), (1.0, 0.03)]   # the shin bare and scaled

JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'chest': ('root', (0.0, -0.1, Z)),
    'neck': ('chest', (0.0, -0.32, Z + 0.05)),
    'head': ('neck', (0.0, -0.42, Z + 0.1)),
    'wound': ('head', (0.03, -0.575, Z + 0.1)),
    'hips': ('chest', (0.0, 0.15, Z)),
}
for s in 'LR':
    m = (lambda x: (lambda p: (p[0] * x, p[1], p[2])))(1.0 if s == 'L' else -1.0)
    JOINTS.update(WING.joints(s, 'chest'))
    JOINTS[f'flank_{s}'] = ('hips', m(WING.foot))
    JOINTS.update({f'thigh_{s}': ('hips', m(LEG[0])), f'shin_{s}': (f'thigh_{s}', m(LEG[1])),
                   f'foot_{s}': (f'shin_{s}', m(LEG[2]))})
SKELETON = Skeleton(JOINTS)


def rest(j):
    return SKELETON.rest(j)


def _feathers(name):
    """Feathers coloured along the wing: olive at its root, dark purple-grey over the coverts, lilac over the trailing
    two fifths (by how far back from the leading edge a point lies at rest), mottled finely; the under side a little
    lighter."""
    m, b = materials._principled(name, (0.05, 0.05, 0.08), rough=0.6, spec=0.3)
    nt = m.node_tree
    vec = materials._rest(nt)
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(vec, xyz.inputs['Vector'])
    back = nt.nodes.new('ShaderNodeMapRange')   # 0 at the leading edge, 1 at the trailing feathers' ends
    back.inputs['From Min'].default_value, back.inputs['From Max'].default_value = -0.21, 0.4
    nt.links.new(xyz.outputs['Y'], back.inputs['Value'])
    grain = hides._noise(nt, vec, 45.0, 2.0, 0.6)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'FLOAT'
    mix.inputs['Factor'].default_value = 0.12
    nt.links.new(back.outputs['Result'], mix.inputs['A'])
    nt.links.new(grain, mix.inputs['B'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.5, (0.05, 0.05, 0.08, 1)
    el[1].position, el[1].color = 0.68, (0.22, 0.08, 0.16, 1)
    nt.links.new(mix.outputs['Result'], ramp.inputs['Fac'])
    across = nt.nodes.new('ShaderNodeMath')   # how far out from the body
    across.operation = 'ABSOLUTE'
    nt.links.new(xyz.outputs['X'], across.inputs[0])
    root = nt.nodes.new('ShaderNodeMapRange')
    root.inputs['From Min'].default_value, root.inputs['From Max'].default_value = 0.42, 0.2
    nt.links.new(across.outputs['Value'], root.inputs['Value'])
    olive = nt.nodes.new('ShaderNodeValToRGB')
    olive.color_ramp.elements[0].color = olive.color_ramp.elements[1].color = (0.15, 0.15, 0.05, 1)
    nt.links.new(grain, olive.inputs['Fac'])
    colour = hides._mix(nt, ramp.outputs['Color'], olive.outputs['Color'], root.outputs['Result'])
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    lift = nt.nodes.new('ShaderNodeMapRange')   # the under side 15% lighter
    lift.inputs['To Min'].default_value, lift.inputs['To Max'].default_value = 1.0, 1.15
    nt.links.new(geo.outputs['Backfacing'], lift.inputs['Value'])
    lit = nt.nodes.new('ShaderNodeMix')
    lit.data_type = 'RGBA'
    lit.blend_type = 'MULTIPLY'
    lit.inputs['Factor'].default_value = 1.0
    nt.links.new(colour, lit.inputs['A'])
    nt.links.new(lift.outputs['Result'], lit.inputs['B'])
    nt.links.new(lit.outputs['Result'], b.inputs['Base Color'])
    return m


def palette():
    mats = {
        'body': materials.speckle('body', (0.03, 0.025, 0.012), (0.1, 0.08, 0.035), scale=36.0, at=0.42, rough=0.7,
                                  metal=0.0),
        'wing': _feathers('wing'),
        'bone': materials.plain('bone', (0.3, 0.19, 0.08), rough=0.5, spec=0.4),
        'shin': materials.speckle('shin', (0.08, 0.05, 0.025), (0.16, 0.1, 0.05), scale=60.0, at=0.45, rough=0.5,
                                  metal=0.0),
        'skin': materials.plain('skin', (0.4, 0.2, 0.12), rough=0.5, spec=0.4),
        'socket': materials.plain('socket', (0.06, 0.03, 0.02), rough=0.8, spec=0.1),
        'mouth': materials.plain('mouth', (0.08, 0.02, 0.015), rough=0.8, spec=0.1),
        'hair': hides.hide('hair', (0.04, 0.04, 0.045), (0.16, 0.16, 0.17), mottle=10.0, grain=60.0, grain_share=0.5,
                           relief=0.3, stretch=(1.0, 1.0, 0.15)),   # grey, streaked down its fall
        'talon': materials.plain('talon', (0.03, 0.03, 0.03), rough=0.3, spec=0.6),
        'blood': materials.plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    return mats


# colour classes in the reference (`ref_class`): 1 shadow and the dark body, 2 the tan of the wings' arms and the
# shins, 3 the lilac of the feathers, 4 the hair's grey, 5 the face's warm pink-tan
CLASS = {'bone': 2, 'shin': 2, 'wing': 3, 'hair': 4, 'skin': 5}
GRADE_RGB = ('body', 'wing', 'hair')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    lo, hi = np.minimum(np.minimum(r, g), b), np.maximum(np.maximum(r, g), b)
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > b + 35) & (g > b + 10) & (r > 100)] = 2
    out[(r > g + 12) & (b > g + 8) & (r > 100)] = 3
    out[(hi - lo < 18) & (lo > 70)] = 4
    out[(r > g + 40) & (g > b + 25) & (r > 130)] = 5
    return out


def _limb(name, pts, radii, names, mat):
    me = tube(name, pts, [(t, r, r, r) for t, r in radii], n=12, up=(1, 0, 0), step=0.015)
    w = chain_weights(np.array([v.co[:] for v in me.vertices]), pts, 0.03)
    joints = sorted(set(names))
    sk = Skin(SKELETON, name, me, mat, joints, weights_over(joints, names, w))
    sk.pieces = [Piece(name, None, None, pts)]
    return sk


def build(M):
    """The harpy's meshes: (skins, rigid parts as (object, joint))."""
    skins, parts = [], []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    me = tube('torso', TORSO_PATH, TORSO, n=24, step=0.015)
    torso = Skin(SKELETON, 'torso', me, M['body'], ['chest', 'hips'],
                 chain_weights(np.array([v.co[:] for v in me.vertices]),
                               [(0, -0.4, Z), (0, 0.15, Z), (0, 0.35, Z)], 0.06))
    torso.pieces = [Piece('torso', None, None, TORSO_PATH, rows=[r[0] for r in TORSO])]
    skins.append(torso)
    # a woman's face (faces.py): sockets and a mouth carved under a brow, a nose and cheekbones
    face('face', (0, -0.48, Z + 0.12), 0.18, 'woman', M, put, 'head', eye='socket')
    # the hair: a cap, a curtain of locks down both cheeks to the shoulders, and a sheet down the nape
    hair = [blob((0, -0.44, Z + 0.17), (0.09, 0.1, 0.08)), blob((0, -0.36, Z + 0.12), (0.1, 0.12, 0.08)),
            blob((0.09, -0.46, Z + 0.04), (0.03, 0.06, 0.15)), blob((-0.09, -0.46, Z + 0.04), (0.03, 0.06, 0.15)),
            blob((0, -0.3, Z + 0.07), (0.12, 0.1, 0.06)), seg((0, -0.42, Z + 0.2), (0, -0.12, Z + 0.06), 0.13, 0.04)]
    hair += [seg((0.1 * x, -0.47, Z + 0.06), (0.13 * x, -0.28, Z + 0.0), 0.035, 0.06) for x in (1, -1)]
    put(rigid('hair', blob_mesh('hair', hair, res=0.012), M['hair']), 'head')
    for s in 'LR':
        x = 1.0 if s == 'L' else -1.0
        m = lambda p: (p[0] * x, p[1], p[2])   # noqa: E731
        WING.bones(s, put, M['bone'])
        skins.append(WING.membrane(SKELETON, s, M['wing'], n=8))
        skins.append(_limb(f'leg_{s}', [m(LEG[0]), m(LEG[1])], THIGH_R, [f'thigh_{s}'], M['body']))
        skins.append(_limb(f'shank_{s}', [m(p) for p in LEG[1:]], SHIN_R, [f'shin_{s}', f'foot_{s}'], M['shin']))
        ball = np.array(m(LEG[3]))
        # three long toes spread ahead and one behind, each ending in a big dark talon curving down
        for k, a in enumerate((35, 0, -35, 180)):
            d = np.array((math.sin(math.radians(a)) * x, math.cos(math.radians(a)), -0.2))
            d /= np.linalg.norm(d)
            end = ball + d * (0.2 if a != 180 else 0.12)
            put(rigid(f'toe_{s}{k}', tube(f'toe_{s}{k}', [tuple(ball), tuple(end)], [(0.0, 0.022, 0.022, 0.022),
                                                                                (1.0, 0.014, 0.014, 0.014)], n=8,
                                          up=(0, 0, 1), step=0.015), M['shin']), f'foot_{s}')
            flat = np.array((d[0], d[1], 0.0)) / max(np.linalg.norm(d[:2]), 1e-9)
            bend = [end, end + flat * 0.04 - np.array((0, 0, 0.012)), end + flat * 0.045 - np.array((0, 0, 0.07))]
            put(rigid(f'talon_{s}{k}', tube(f'talon_{s}{k}', [tuple(p) for p in bend],
                                            [(0.0, 0.012, 0.012, 0.012), (1.0, 0.002, 0.002, 0.002)], n=6,
                                            up=(1, 0, 0), step=0.008), M['talon']), f'foot_{s}')
    # the wound: droplets flung forward and out to its right from the face
    w = np.array(rest('wound')[:])
    drops = [blob(tuple(w + np.array((-0.05 * t, -0.05 - 0.1 * t, 0.02 * t))), (r, r, r))
             for t, r in zip(np.linspace(0, 1, 5), (0.018, 0.016, 0.015, 0.013, 0.012))]
    put(rigid('blood', blob_mesh('blood', drops, res=0.004), M['blood']), 'wound')
    return skins, parts


# the flap, as Daggerfall's front view shows it: wings raised high in a V, level with the tips hung, swept down and
# back, coming up with the hands hung down. Each frame's beat, fold, spread, curl and sweep (Wing.flap)
FLAP = [(75, 0, 0, -5, 0), (0, 0, 0, 15, 0), (-55, 15, -6, 20, 25), (-20, 25, -4, 45, 15)]


def _body(frame, n):
    rot = {'chest': (0, 0, 0), 'neck': (10, 0, 0), 'head': (-20, 0, 0), 'hips': (5, 0, 0)}
    for s in 'LR':
        sway = 5 * math.sin(2 * math.pi * frame / n)
        rot.update({f'thigh_{s}': (sway, 0, 0), f'shin_{s}': (-sway, 0, 0), f'foot_{s}': (20, 0, 0)})
    return rot


def walk(frame, n=4):
    rot = _body(frame, n)
    for s in 'LR':
        rot.update(Wing.flap(s, *FLAP[frame % 4], fingers=FINGERS))
    return rot, {'wound': 0.0}


# the strike frame by frame: it rears up (the chest's pitch up), the thighs swing forward and the shins straighten so
# the talons thrust ahead, and both wings rise high
REAR = [0, 10, 35, 60]
STRIKE = [10, 40, 90, 110]
REACH = [40, 30, 15, 0]


def attack(frame, n=4):
    rot, _ = walk(frame, n)
    for s, x in (('L', 1.0), ('R', -1.0)):
        rot.update({f'thigh_{s}': (-STRIKE[frame], 0, 12 * x), f'shin_{s}': (REACH[frame], 0, 0),
                    f'foot_{s}': (-10, 0, 0)})
        if frame >= 2:
            rot.update(Wing.flap(s, 75, 0, 0, 20, 0, fingers=FINGERS))
    rot['chest'] = (-REAR[frame], 0, 0)
    return rot, {'wound': 0.0}


def hurt(frame, n=1):
    rot = _body(0, 1)
    rot.update({'neck': (-15, 0, 15), 'head': (-30, 0, 10)})
    rot.update(Wing.flap('L', 55, 0, 0, -5, 0, fingers=FINGERS))
    rot.update(Wing.flap('R', -40, 15, -6, 25, 10, fingers=FINGERS))
    return rot, {'wound': 1.0}


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt}
# Daggerfall draws its harpy a little raised seen from before and behind, its head low between its wings and its legs
# hanging crouched under it, and level with its legs trailing seen from any other side: those keys follow the view
UPRIGHT = -20.0
HANG = (-80.0, 60.0)   # the thighs swung down, the knees bent forward


def pose_for(anim, frame, yaw, adj=None):
    adj = adj or {}
    rot, scales = ANIMS[anim](frame)
    w = abs(math.cos(math.radians(yaw))) ** 8
    c = rot.get('chest', (0, 0, 0))
    rot['chest'] = (c[0] + UPRIGHT * w, c[1], c[2])
    for s in 'LR':
        for j, d in ((f'thigh_{s}', HANG[0]), (f'shin_{s}', HANG[1])):
            r = rot.get(j, (0, 0, 0))
            rot[j] = (r[0] + d * w, r[1], r[2])
    for j, d in adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(SKELETON, rot, yaw=yaw + adj.get('turn', 0.0), scales=scales)
    p.root_loc.z += adj.get('lift', 0.0)
    return p


# the wings and the legs are fitted each its own way from the side; in the front and the back views Daggerfall's
# harpy flies and strikes as a mirror image of itself, so there they are mirrored pairs (beastfit.pair) and
# nothing rolls or turns it
_WING_P = [('shoulder_L|shoulder_R', 0, 8), ('shoulder_L|shoulder_R', 1, 10), ('shoulder_L|shoulder_R', 2, 8),
           ('elbow_L|elbow_R', 2, 10), ('wrist_L|wrist_R', 1, 10), ('wrist_L|wrist_R', 2, 10)]
_LEG_P = [('thigh_L|thigh_R', 0, 10), ('thigh_L|thigh_R', 2, 8), ('shin_L|shin_R', 0, 10)]
_BODY_P = [('chest', 0, 8), ('neck', 0, 8), ('head', 0, 8)]
PARAMS = {a: _BODY_P + [('chest', 1, 6), ('chest', 2, 6)] + apart(_LEG_P + _WING_P) for a in ANIMS}
SYMMETRIC = (0, 4)
MIRRORED = {a: _BODY_P + _LEG_P + _WING_P for a in ('walk', 'attack')}
