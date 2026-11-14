"""The imp (TEXTURE.256): a lean green creature six tenths of a metre tall, horned and red-eyed, its legs hanging as
it flies on bat wings two metres across. Its body is upright: a torso skinned over the pelvis and chest, and two-bone
arms and legs skinned along their joints. Each wing is an arm and four fingers with a membrane back to the shoulder
blade (wing.py). It casts as it strikes: a spark of lightning grows before its chest through the attack, a part the
pose sizes. It flies: nothing grounds it.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the imp faces -Y): a turn about X swings a
limb back on + and forward on -."""
import math

import numpy as np

import hides
import materials
from beastkit import Piece, Pose, Skeleton, Skin, apart, chain_weights, cone, hang, rigid, tube, weights_over
from body import blob, blob_mesh
from wing import Wing

FLIES = True
Z = 1.0          # the pelvis
HZ = Z + 0.2     # the head's middle
WZ = Z + 0.12    # the wings' root, at the shoulder blades
FINGERS = 4
# four long fingers, each running bare past the membrane and curving back at its tip
WING = Wing(shoulder=(0.05, 0.05, WZ), elbow=(0.3, 0.1, WZ + 0.03), wrist=(0.56, 0.02, WZ + 0.05),
            tips=[(1.4, -0.04, WZ + 0.04), (1.3, 0.3, WZ + 0.02), (1.02, 0.55, WZ), (0.66, 0.62, WZ - 0.01)],
            hip=(0.04, 0.1, WZ - 0.08), foot=(0.12, 0.28, WZ - 0.06), body='chest', leg='blade', camber=0.035,
            scallop=0.3, bone_r=(0.022, 0.017, 0.014, 0.012, 0.006), step=0.012, faces_up=True, bare=0.15, bend=15.0)
# the limbs at rest (the left; the right mirrors them): joint by joint to the hand's and the foot's ends
ARM = [(0.085, 0.0, Z + 0.125), (0.12, -0.01, Z + 0.02), (0.115, -0.05, Z - 0.07), (0.11, -0.07, Z - 0.1)]
ARM_R = [(0.0, 0.022), (0.3, 0.016), (0.62, 0.011), (0.82, 0.013), (1.0, 0.004)]
LEG = [(0.045, 0.0, Z - 0.02), (0.05, -0.06, Z - 0.15), (0.05, 0.0, Z - 0.27), (0.05, -0.035, Z - 0.33)]
LEG_R = [(0.0, 0.04), (0.3, 0.029), (0.42, 0.024), (0.55, 0.028), (0.8, 0.015), (1.0, 0.006)]
TORSO_PATH = [(0, 0.005, Z - 0.05), (0, 0.0, Z), (0, 0.0, Z + 0.07), (0, -0.005, Z + 0.155)]
# rows (t, half width, front, back): narrow at the crotch, a lean waist, the chest broadest, the neck
TORSO = [(0.0, 0.054, 0.042, 0.042), (0.2, 0.084, 0.054, 0.054), (0.45, 0.072, 0.05, 0.048), (0.75, 0.108, 0.066, 0.06),
         (0.92, 0.072, 0.048, 0.048), (1.0, 0.036, 0.036, 0.036)]

JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'pelvis': ('root', (0.0, 0.0, Z)),
    'chest': ('pelvis', (0.0, 0.0, Z + 0.07)),
    'head': ('chest', (0.0, -0.01, Z + 0.15)),
    'wound': ('head', (0.02, -0.045, HZ + 0.035)),
    'spark': ('chest', (0.1, -0.29, Z + 0.06)),
}
for s in 'LR':
    m = lambda p: Wing.mirror(p, s)   # noqa: E731
    JOINTS.update(WING.joints(s, 'chest'))
    JOINTS[f'blade_{s}'] = ('chest', m(WING.foot))
    JOINTS.update({f'arm_{s}': ('chest', m(ARM[0])), f'fore_{s}': (f'arm_{s}', m(ARM[1])),
                   f'thigh_{s}': ('pelvis', m(LEG[0])), f'shin_{s}': (f'thigh_{s}', m(LEG[1]))})
SKELETON = Skeleton(JOINTS)


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        # a green hide shading softly to a warm olive-brown; the membrane dark maroon on its upper face, peach under
        'skin': hides.hide('skin', (0.04, 0.035, 0.01), (0.1, 0.24, 0.04), mottle=8.0, grain=45.0, grain_share=0.25,
                           relief=0.25, rough=0.6, spec=0.3),
        'wing': hides.two_sided('wing', ((0.08, 0.025, 0.012), (0.13, 0.045, 0.02)),
                                ((0.4, 0.18, 0.08), (0.6, 0.3, 0.13)),
                                mottle=4.0, grain=40.0, grain_share=0.15, soft=0.3, rough=0.6),
        'face': hides.hide('face', (0.12, 0.04, 0.012), (0.2, 0.07, 0.022), mottle=10.0, relief=0.1, rough=0.6),
        'horn': _horn('horn'),
        'claw': materials.plain('claw', (0.028, 0.013, 0.005), rough=0.4, spec=0.5),
        'mouth': materials.plain('mouth', (0.028, 0.013, 0.005), rough=0.9, spec=0.05),
        'eye': materials.plain('eye', (0.4, 0.008, 0.0), rough=0.2, spec=0.7),
        'spark': materials.plain('spark', (1.0, 0.97, 0.75), rough=0.8, spec=0.1),
        'arc': materials.plain('arc', (0.25, 0.5, 0.8), rough=0.8, spec=0.1),
        'blood': materials.plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    for name, glow, strength in (('eye', (0.5, 0.01, 0.0, 1), 0.6), ('spark', (1.0, 0.97, 0.75, 1), 3.0),
                                 ('arc', (0.25, 0.5, 0.8, 1), 1.5)):
        b = mats[name].node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = glow
        b.inputs['Emission Strength'].default_value = strength
    return mats


def _horn(name):
    """Ivory going dark over the horn's last third: by how far out from the head the point lies."""
    m, b = materials._principled(name, (0.62, 0.38, 0.28), rough=0.4, spec=0.5)
    nt = m.node_tree
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(materials._rest(nt), xyz.inputs['Vector'])
    out = nt.nodes.new('ShaderNodeMath')
    out.operation = 'ABSOLUTE'
    nt.links.new(xyz.outputs['X'], out.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.088, (0.62, 0.38, 0.28, 1)
    el[1].position, el[1].color = 0.11, (0.02, 0.02, 0.02, 1)
    nt.links.new(out.outputs['Value'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


# colour classes in the reference (`ref_class`): 1 shadow, 2 the skin's green, 3 the membrane (and the face mask's
# and the horns' warm brown), 4 the lightning
CLASS = {'skin': 2, 'wing': 3, 'face': 3, 'horn': 3, 'spark': 4, 'arc': 4}
GRADE_RGB = ('skin', 'wing')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(g > r + 12) & (g > b + 5)] = 2
    out[(r > g + 15) & (r > b + 25) & (r > 50)] = 3
    out[((b > r + 10) & (b > 120)) | (np.minimum(np.minimum(r, g), b) > 200)] = 4
    return out


def _limb(name, pts, radii, names, mat):
    """A limb skinned along its joints: a tube through `pts`, each stretch going with the joint `names` gives it."""
    me = tube(name, pts, [(t, r, r, r) for t, r in radii], n=12, up=(1, 0, 0))
    w = chain_weights(np.array([v.co[:] for v in me.vertices]), pts, 0.025)
    sk = Skin(SKELETON, name, me, mat, sorted(set(names)), weights_over(sorted(set(names)), names, w))
    sk.pieces = [Piece(name, None, None, pts)]
    return sk


def _arc(k, n=10):
    """One jagged bolt out from the spark's heart, 0.3 m long, and a branch off its middle."""
    c = np.array(rest('spark')[:])
    a, e = 2 * math.pi * k / n + 0.4, 0.5 * math.sin(1.7 * k)
    d = np.array((math.cos(a) * math.cos(e), -0.35 * math.sin(e), math.sin(a) * math.cos(e)))
    side = np.cross(d, (0, 1, 0))
    side /= np.linalg.norm(side)
    pts = [c + d * (0.04 + 0.26 * t) + side * (0.035 * (-1) ** i if 0 < i < 4 else 0)
           for i, t in enumerate(np.linspace(0, 1, 5))]
    bolt = tube(f'arc{k}', pts, [(0.0, 0.012, 0.012, 0.012), (1.0, 0.005, 0.005, 0.005)], n=6, up=(0, 1, 0))
    fork = d * math.cos(0.7) + side * math.sin(0.7) * (-1) ** k
    branch = cone(f'fork{k}', tuple(pts[2]), tuple(pts[2] + fork * 0.1), 0.008, 0.003)
    return bolt, branch


def build(M):
    """The imp's meshes: (skins, rigid parts as (object, joint))."""
    skins, parts = [], []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    me = tube('torso', TORSO_PATH, TORSO, n=24, up=(0, -1, 0))
    pts = [(0, 0, Z - 0.05), (0, 0, Z + 0.07), (0, 0, Z + 0.16)]
    torso = Skin(SKELETON, 'torso', me, M['skin'], ['pelvis', 'chest'],
                 chain_weights(np.array([v.co[:] for v in me.vertices]), pts, 0.04))
    torso.pieces = [Piece('torso', None, None, TORSO_PATH, rows=[r[0] for r in TORSO])]
    skins.append(torso)
    # the head: a broad dome, a brow ridge, a brown face mask under it with red slit eyes and a dark mouth
    head = [blob((0, -0.015, HZ), (0.07, 0.06, 0.055)), blob((0, -0.05, HZ - 0.03), (0.035, 0.03, 0.03)),
            blob((0, -0.065, HZ + 0.02), (0.06, 0.015, 0.012)), blob((0, -0.005, HZ - 0.05), (0.03, 0.03, 0.03))]
    hm = blob_mesh('head', head, res=0.006)
    hm.materials.append(M['skin'])
    hm.materials.append(M['face'])
    for f in hm.polygons:
        f.material_index = 1 if f.center.y < -0.045 and f.center.z < HZ + 0.012 else 0
    put(rigid('head', hm), 'head')
    put(rigid('mouth', blob_mesh('mouth', [blob((0, -0.079, HZ - 0.035), (0.03, 0.006, 0.008))], res=0.003),
              M['mouth']), 'head')
    for x in (1, -1):
        put(rigid(f'ear_{x}', blob_mesh(f'ear_{x}', [blob((0.062 * x, -0.005, HZ + 0.007), (0.008, 0.014, 0.036),
                                                           along=(1.0 * x, 0.2, 0.45))], res=0.003), M['skin']),
            'head')
        horn = [(0.03 * x, 0.0, HZ + 0.035), (0.075 * x, 0.0, HZ + 0.045), (0.105 * x, 0.01, HZ + 0.065),
                (0.115 * x, 0.015, HZ + 0.085)]
        put(rigid(f'horn_{x}', tube(f'horn_{x}', horn, [(0.0, 0.018, 0.018, 0.018), (1.0, 0.004, 0.004, 0.004)],
                                    n=8, up=(0, 1, 0)), M['horn']), 'head')
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.022 * x, -0.068, HZ + 0.005), (0.016, 0.01, 0.01))],
                                         res=0.002), M['eye']), 'head')
    for s in 'LR':
        m = lambda p: Wing.mirror(p, s)   # noqa: E731
        x = 1.0 if s == 'L' else -1.0
        WING.bones(s, put, M['skin'])
        skins.append(WING.membrane(SKELETON, s, M['wing']))
        wr = np.array(m(WING.wrist))   # the hooked thumb, forward and up from the wrist
        put(rigid(f'thumb_{s}', cone(f'thumb_{s}', tuple(wr), tuple(wr + np.array((0.0, -0.061, 0.051))), 0.008),
                  M['claw']), f'wrist_{s}')
        skins.append(_limb(f'arm_{s}', [m(p) for p in ARM], ARM_R, [f'arm_{s}', f'fore_{s}', f'fore_{s}'], M['skin']))
        skins.append(_limb(f'leg_{s}', [m(p) for p in LEG], LEG_R, [f'thigh_{s}', f'shin_{s}', f'shin_{s}'],
                           M['skin']))
        hand = np.array(m(ARM[3]))   # a palm and three dark claws at each hand, three toes at each foot
        put(rigid(f'palm_{s}', blob_mesh(f'palm_{s}', [blob(tuple(hand), (0.022, 0.012, 0.025))], res=0.004),
                  M['skin']), f'fore_{s}')
        foot = np.array(m(LEG[3]))
        for k, d in enumerate((-0.012, 0.0, 0.012)):
            put(rigid(f'claw_{s}{k}', cone(f'claw_{s}{k}', tuple(hand + (d, -0.005, -0.015)),
                                           tuple(hand + (d * 1.6, -0.02, -0.048)), 0.005, 0.001), M['claw']),
                f'fore_{s}')
            put(rigid(f'toe_{s}{k}', cone(f'toe_{s}{k}', tuple(foot + (d * x, 0.0, -0.005)),
                                          tuple(foot + (d * 1.8 * x, -0.028, -0.012)), 0.006, 0.001), M['claw']),
                f'shin_{s}')
    # the spell: a white heart and its bolts before the chest, sized by the pose (0 when it casts none)
    put(rigid('spark', blob_mesh('spark', [blob(rest('spark')[:], (0.07, 0.065, 0.07))], res=0.008), M['spark']),
        'spark')
    for k in range(10):
        bolt, branch = _arc(k)
        put(rigid(f'arc{k}', bolt, M['arc']), 'spark')
        put(rigid(f'fork{k}', branch, M['arc']), 'spark')
    # a wound on the brow, shown only as it is struck: droplets flung up and out to its right
    w = np.array(rest('wound')[:])
    drops = [blob(tuple(w + np.array((-0.035 * t, -0.005, 0.04 + 0.08 * t))), (r, r, r))
             for t, r in zip(np.linspace(0, 1, 5), (0.012, 0.011, 0.01, 0.009, 0.008))]
    put(rigid('blood', blob_mesh('blood', drops, res=0.003), M['blood']), 'wound')
    return skins, parts


# the flap, as Daggerfall's front view shows it: wings raised in a V, level, hanging down and back with their
# hands curled in about the body, then out level with the hands hung down. Each frame's beat, fold and spread
# (Wing.flap)
FLAP = [(45, 0, 0, -5, 0), (0, 0, 0, 8, 0), (-65, 20, -8, 35, 35), (0, 0, -4, 90, 10)]


def _wing(s, beat, fold, spread, curl, sweep):
    return Wing.flap(s, beat, fold, spread, curl, sweep, fingers=FINGERS)


def _body(frame, n):
    """It leans forward as it flies, its knees drawn up and its shins hanging, its arms held out and forward."""
    rot = {'pelvis': (15, 0, 0), 'chest': (-4, 0, 0), 'head': (-8, 0, 0)}
    for s, x in (('L', 1.0), ('R', -1.0)):
        sway = 6 * math.sin(2 * math.pi * frame / n + (0 if s == 'L' else math.pi))
        rot.update({f'thigh_{s}': (-65 + sway, 0, 0), f'shin_{s}': (75 - sway, 0, 0),
                    f'arm_{s}': (-30, -35 * x, 0), f'fore_{s}': (-30, 0, 0)})
    return rot


def walk(frame, n=4):
    rot = _body(frame, n)
    for s in 'LR':
        rot.update(_wing(s, *FLAP[frame % 4]))
    return rot, {'spark': 0.0, 'wound': 0.0}


SPARK = [0.0, 0.3, 0.6, 1.0]   # the spell's size frame by frame, as it gathers and bursts


def attack(frame, n=4):
    rot, _ = walk(frame, n)
    for s, x in (('L', 1.0), ('R', -1.0)):
        rot.update({f'arm_{s}': (-50, 0, -10 * x), f'fore_{s}': (-40, 0, 0)})
    rot['chest'] = (6, 0, 0)
    return rot, {'spark': SPARK[frame], 'wound': 0.0}


def hurt(frame, n=1):
    rot = _body(0, 1)
    rot.update({'chest': (12, 0, 0), 'head': (18, 0, 8)})
    for s in 'LR':
        rot.update(_wing(s, -55, 0, 15, 50, 0))   # flung out and down about it in a ring, the fingers spread
    return rot, {'spark': 0.0, 'wound': 1.0}


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt}


def pose_for(anim, frame, yaw, adj=None):
    adj = adj or {}
    rot, scales = ANIMS[anim](frame)
    for j, d in adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(SKELETON, rot, yaw=yaw + adj.get('turn', 0.0), scales=scales)
    p.root_loc.z += adj.get('lift', 0.0)
    return p


# the limbs are fitted each its own way (the pairs split, beastkit.apart): Daggerfall's is not a mirror image of
# itself even from the front
_WING_P = [('shoulder_L|shoulder_R', 0, 8), ('shoulder_L|shoulder_R', 1, 10), ('shoulder_L|shoulder_R', 2, 8),
           ('elbow_L|elbow_R', 2, 10), ('wrist_L|wrist_R', 1, 10), ('wrist_L|wrist_R', 2, 10)]
_LIMB_P = [('thigh_L|thigh_R', 0, 10), ('shin_L|shin_R', 0, 10), ('arm_L|arm_R', 0, 12), ('arm_L|arm_R', 1, 10),
           ('fore_L|fore_R', 0, 12)]
_BODY_P = [('pelvis', 0, 6), ('chest', 0, 6), ('head', 0, 8)]
PARAMS = {a: _BODY_P + [('pelvis', 1, 6), ('pelvis', 2, 6), ('head', 2, 8)] + apart(_LIMB_P + _WING_P)
          for a in ANIMS}
