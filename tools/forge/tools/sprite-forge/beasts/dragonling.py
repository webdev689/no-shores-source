"""The dragonling (TEXTURE.289, and its twin 295): a small purple dragon two and a half metres across its wings, horned,
red-eyed, with clawed legs and a long tail that curls under it. Its wings are membranes on arms and three fingers
(wing.py). It breathes fire as it strikes: a ball of flame grows at its jaws through the attack (a joint the pose
sizes). It flies: nothing grounds it.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the dragonling faces -Y)."""
import math

import numpy as np

import hides
import materials
from beastkit import Piece, Pose, Skeleton, Skin, apart, chain_weights, cone, hang, rigid, tube, weights_over
from body import blob, blob_mesh
from wing import Wing

FLIES = True
Z = 1.2
TAIL = 8
TAIL_STEP = 0.16
WING = Wing(shoulder=(0.08, -0.06, Z + 0.08), elbow=(0.42, 0.02, Z + 0.12), wrist=(0.76, -0.04, Z + 0.1),
            tips=[(1.26, -0.06, Z + 0.12), (1.16, 0.26, Z + 0.06), (0.86, 0.44, Z + 0.02)],
            hip=(0.08, 0.22, Z - 0.04), foot=(0.15, 0.28, Z - 0.3), body='chest', leg='thigh', camber=0.03,
            scallop=0.32, bone_r=(0.035, 0.026, 0.02, 0.018, 0.008), step=0.012)
MOUTH = (0.0, -0.62, Z + 0.2)   # the jaws' tip, where the breath starts
JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'pelvis': ('root', (0.0, 0.2, Z)),
    'chest': ('pelvis', (0.0, -0.1, Z + 0.04)),
    'neck': ('chest', (0.0, -0.22, Z + 0.1)),
    'head': ('neck', (0.0, -0.4, Z + 0.26)),
    'jaw': ('head', (0.0, -0.46, Z + 0.22)),
    'flame': ('head', MOUTH),
    'sparks': ('head', MOUTH),
    'wound': ('neck', (-0.07, -0.3, Z + 0.17)),
}
for k in range(TAIL):
    JOINTS[f'tail_{k}'] = ('pelvis' if k == 0 else f'tail_{k - 1}',
                           (0.0, 0.3 + TAIL_STEP * k, Z - 0.03 - 0.05 * k))
for s, x in (('L', 1.0), ('R', -1.0)):
    JOINTS.update(WING.joints(s, 'chest'))
    JOINTS.update({f'thigh_{s}': ('pelvis', (0.12 * x, 0.2, Z - 0.06)),
                   f'shin_{s}': (f'thigh_{s}', (0.16 * x, 0.08, Z - 0.24)),
                   f'arm_{s}': ('chest', (0.08 * x, -0.14, Z - 0.04))})
SKELETON = Skeleton(JOINTS)
SPINE = ['pelvis', 'chest', 'neck', 'head']
BODY_PATH = [(0, 0.34, Z - 0.02), (0, 0.2, Z), (0, -0.1, Z + 0.04), (0, -0.25, Z + 0.12), (0, -0.38, Z + 0.24)]
BODY = [(0.0, 0.06, 0.06, 0.06), (0.15, 0.14, 0.125, 0.14), (0.45, 0.16, 0.15, 0.16), (0.8, 0.09, 0.09, 0.09),
        (1.0, 0.075, 0.075, 0.075)]


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        # a smooth purple, faintly mottled; the membrane the same, lighter on its under side
        'hide': hides.hide('hide', (0.18, 0.07, 0.14), (0.22, 0.085, 0.17), mottle=6.0, grain=40.0, grain_share=0.2,
                           relief=0.15, rough=0.55, spec=0.35),
        'wing': hides.two_sided('wing', ((0.16, 0.06, 0.12), (0.2, 0.075, 0.15)),
                                ((0.2, 0.08, 0.16), (0.25, 0.1, 0.19)),
                                mottle=4.0, grain=30.0, grain_share=0.15, soft=0.3, rough=0.6),
        'bone': materials.plain('bone', (0.36, 0.14, 0.27), rough=0.5, spec=0.4),
        'horn': materials.plain('horn', (0.45, 0.43, 0.42), rough=0.35, spec=0.6),
        'claw': materials.plain('claw', (0.6, 0.58, 0.56), rough=0.35, spec=0.6),
        'fang': materials.plain('fang', (0.8, 0.78, 0.75), rough=0.3, spec=0.6),
        'mouth': materials.plain('mouth', (0.45, 0.05, 0.03), rough=0.5, spec=0.3),
        'eye': materials.plain('eye', (0.4, 0.008, 0.0), rough=0.2, spec=0.7),
        'fire': _fire('fire'),
        'ember': materials.plain('ember', (1.0, 0.42, 0.06), rough=0.8, spec=0.1),
        'blood': materials.plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    for name, glow, strength in (('eye', (0.5, 0.01, 0.0, 1), 0.6), ('ember', (1.0, 0.35, 0.04, 1), 0.8)):
        b = mats[name].node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = glow
        b.inputs['Emission Strength'].default_value = strength
    return mats


def _fire(name):
    """Flame: yellow-white at its heart where it faces the camera, orange, then a smoky dark red at its rim, broken by
    a noise; it glows its own colour."""
    m, b = materials._principled(name, (1.0, 0.45, 0.05), rough=0.8, spec=0.1)
    nt = m.node_tree
    face = nt.nodes.new('ShaderNodeLayerWeight')
    face.inputs['Blend'].default_value = 0.5
    nz = hides._noise(nt, materials._rest(nt), 9.0, 3.0, 0.6)
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'FLOAT'
    mix.inputs['Factor'].default_value = 0.35
    nt.links.new(face.outputs['Facing'], mix.inputs['A'])
    nt.links.new(nz, mix.inputs['B'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = 0.2, (1.0, 0.85, 0.45, 1)
    el[1].position, el[1].color = 0.75, (0.35, 0.05, 0.01, 1)
    mid = el.new(0.45)
    mid.color = (1.0, 0.45, 0.05, 1)
    nt.links.new(mix.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = 0.9
    return m


# colour classes in the reference (`ref_class`): 1 shadow, 2 the hide's purple, 3 the fire, 4 the horns' and the
# claws' grey, 5 the mouth's and the eyes' red
CLASS = {'hide': 2, 'wing': 2, 'bone': 2, 'fire': 3, 'ember': 3, 'horn': 4, 'claw': 4, 'fang': 4, 'mouth': 5, 'eye': 5,
         'blood': 5}
GRADE_RGB = ('hide', 'wing')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > g + 25) & (b > g + 10) & (r > 70)] = 2
    out[(r > 90) & (r > g + 60) & (r > b + 60) & (g < 70)] = 5
    out[(r > 180) & (g > 70) & (b < 90) & (r > b + 90)] = 3
    out[(np.minimum(np.minimum(r, g), b) > 120) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 35)] = 4
    return out


def _ragged(me, depth=0.06, scale=8.0):
    """The mesh's skin pushed in and out along its normals by a noise `depth` deep: a flame's broken edge."""
    from mathutils import Vector, noise
    for v in me.vertices:
        v.co += v.normal * depth * noise.noise(Vector(v.co) * scale)
    return me


def build(M):
    """The dragonling's meshes: (skins, rigid parts as (object, joint))."""
    skins, parts = [], []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    me = tube('body', BODY_PATH, BODY, n=24, step=0.012)
    bones = [rest(j)[:] for j in SPINE]
    body = Skin(SKELETON, 'body', me, M['hide'], SPINE[:3],
                weights_over(SPINE[:3], SPINE[:3], chain_weights(np.array([v.co[:] for v in me.vertices]), bones, 0.06)))
    body.pieces = [Piece('body', None, None, BODY_PATH, rows=[r[0] for r in BODY])]
    skins.append(body)
    # the tail: thick for most of its length, then thinning to its tip
    end = (0.0, 0.3 + TAIL_STEP * TAIL, Z - 0.03 - 0.05 * TAIL)
    tpts = [(0, 0.26, Z - 0.01)] + [rest(f'tail_{k}')[:] for k in range(TAIL)] + [end]
    tme = tube('tail', tpts, [(0.0, 0.055, 0.055, 0.055), (0.7, 0.035, 0.035, 0.035), (1.0, 0.01, 0.01, 0.01)],
               n=12, step=0.012)
    tail = Skin(SKELETON, 'tail', tme, M['hide'], ['pelvis'] + [f'tail_{k}' for k in range(TAIL)],
                chain_weights(np.array([v.co[:] for v in tme.vertices]), [rest('pelvis')[:]] + tpts[1:], 0.05))
    tail.pieces = [Piece('tail', None, None, tpts)]
    skins.append(tail)
    # the head: broad, a short snout, brows over red eyes, horns swept back and out; fangs and a red mouth inside
    head = [blob((0, -0.44, Z + 0.28), (0.11, 0.10, 0.08)), blob((0, -0.55, Z + 0.25), (0.075, 0.08, 0.05))]
    put(rigid('head', blob_mesh('head', head, res=0.01), M['hide']), 'head')
    put(rigid('jaw', blob_mesh('jaw', [blob((0, -0.54, Z + 0.2), (0.06, 0.075, 0.025))], res=0.008), M['hide']), 'jaw')
    put(rigid('tongue', blob_mesh('tongue', [blob((0, -0.54, Z + 0.222), (0.048, 0.065, 0.012))], res=0.006),
              M['mouth']), 'jaw')
    put(rigid('palate', blob_mesh('palate', [blob((0, -0.56, Z + 0.212), (0.055, 0.065, 0.014))], res=0.006),
              M['mouth']), 'head')
    for x in (1, -1):
        horn = tube(f'horn_{x}', [(0.06 * x, -0.42, Z + 0.34), (0.12 * x, -0.34, Z + 0.38), (0.15 * x, -0.24, Z + 0.4),
                                  (0.14 * x, -0.18, Z + 0.44)],
                    [(0.0, 0.022, 0.022, 0.022), (1.0, 0.004, 0.004, 0.004)], n=8)
        put(rigid(f'horn_{x}', horn, M['horn']), 'head')
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.06 * x, -0.53, Z + 0.31), (0.03, 0.03, 0.03))],
                                         res=0.005), M['eye']), 'head')
        put(rigid(f'brow_{x}', blob_mesh(f'brow_{x}', [blob((0.06 * x, -0.53, Z + 0.345), (0.04, 0.02, 0.012))],
                                          res=0.005), M['hide']), 'head')
        put(rigid(f'fang_{x}', cone(f'fang_{x}', (0.03 * x, -0.6, Z + 0.225), (0.03 * x, -0.61, Z + 0.175), 0.012),
                  M['fang']), 'head')
        for k, (y, z) in enumerate(((-0.46, 0.27), (-0.44, 0.22))):   # frills at the cheeks
            put(rigid(f'frill_{x}{k}', cone(f'frill_{x}{k}', (0.09 * x, y, Z + z), (0.15 * x, y + 0.02, Z + z - 0.01),
                                            0.014), M['hide']), 'head')
    for s, x in (('L', 1.0), ('R', -1.0)):
        WING.bones(s, put, M['bone'])
        skins.append(WING.membrane(SKELETON, s, M['wing']))
        wr = np.array(rest(f'wrist_{s}')[:])
        put(rigid(f'wclaw_{s}', cone(f'wclaw_{s}', tuple(wr), tuple(wr + np.array((0.02 * x, -0.07, 0.01))), 0.015),
                  M['claw']), f'wrist_{s}')
        th, sh = rest(f'thigh_{s}'), rest(f'shin_{s}')
        put(rigid(f'thigh_{s}', tube(f'thigh_{s}', [th[:], sh[:]],
                                     [(0.0, 0.055, 0.055, 0.055), (1.0, 0.032, 0.032, 0.032)], n=10), M['hide']),
            f'thigh_{s}')
        foot = (sh.x, sh.y - 0.1, sh.z - 0.12)
        put(rigid(f'shin_{s}', tube(f'shin_{s}', [sh[:], foot], [(0.0, 0.032, 0.032, 0.032), (1.0, 0.02, 0.02, 0.02)],
                                    n=8), M['hide']), f'shin_{s}')
        for k, d in enumerate((-0.045, 0.0, 0.045)):   # three big grey talons a foot, splayed
            tip = (foot[0] + d * x + 0.02 * x, foot[1] - 0.08, foot[2] - 0.04)
            put(rigid(f'talon_{s}{k}', cone(f'talon_{s}{k}', foot, tip, 0.022, 0.004), M['claw']), f'shin_{s}')
        a = rest(f'arm_{s}')
        hand = (a.x, a.y - 0.06, a.z - 0.14)
        put(rigid(f'arm_{s}', tube(f'arm_{s}', [a[:], hand], [(0.0, 0.025, 0.025, 0.025), (1.0, 0.014, 0.014, 0.014)],
                                   n=8), M['hide']), f'arm_{s}')
        for k, d in enumerate((-0.02, 0.02)):
            put(rigid(f'hclaw_{s}{k}', cone(f'hclaw_{s}{k}', hand, (hand[0] + d, hand[1] - 0.05, hand[2] - 0.02),
                                            0.012), M['claw']), f'arm_{s}')
    # the breath: a ragged tongue of flame rooted at the jaws, licks beside it, sized by the pose (0 when it breathes
    # none); and the sparks it breaks into, sized apart
    mx, my, mz = MOUTH
    fire = [blob((mx, my - 0.05, mz), (0.08, 0.1, 0.07)), blob((mx, my - 0.3, mz), (0.24, 0.27, 0.22)),
            blob((mx + 0.1, my - 0.46, mz + 0.06), (0.13, 0.14, 0.12)), blob((mx - 0.09, my - 0.48, mz - 0.07),
                                                                              (0.12, 0.13, 0.11))]
    put(rigid('fire', _ragged(blob_mesh('fire', fire, res=0.014)), M['fire']), 'flame')
    rng = np.random.default_rng(289)
    sparks = [blob((mx + rng.uniform(-0.2, 0.2), my - rng.uniform(0.1, 0.4), mz + 0.15 + rng.uniform(-0.05, 0.25)),
                   (r, r, r)) for r in rng.uniform(0.03, 0.05, 8)]
    put(rigid('sparks', _ragged(blob_mesh('sparks', sparks, res=0.006), 0.015, 30.0), M['ember']), 'sparks')
    spray = [blob((-0.07 - rng.uniform(0, 0.03), -0.3 + rng.uniform(-0.06, 0.06), Z + 0.17 + rng.uniform(-0.06, 0.06)),
                  (r, r, r)) for r in rng.uniform(0.012, 0.02, 10)]
    put(rigid('blood', blob_mesh('blood', spray, res=0.004), M['blood']), 'wound')
    return skins, parts


# the flap, as Daggerfall's front view shows it: wings raised high in a V, level, swept down, coming up
FLAP = [(45, 0, 0), (0, 0, 0), (-45, 25, -6), (-12, 10, -3)]   # beat, fold, spread


def _body(frame, n):
    """It hangs upright in the air like a sea-horse: the chest raised, the face kept level, the legs reaching forward
    under it splayed wide, the tail curling down and forward under the belly."""
    rot = {'pelvis': (-35, 0, 0), 'neck': (-10, 0, 0), 'head': (40, 0, 0), 'jaw': (12, 0, 0)}
    for k, curl in enumerate((15, 20, 25, 30, 30, 25, 20, 15)):
        rot[f'tail_{k}'] = (-curl, 0, 6 * math.sin(2 * math.pi * frame / n + k))
    for s, x in (('L', 1.0), ('R', -1.0)):
        rot[f'thigh_{s}'] = (-20, -30 * x, 0)
        rot[f'shin_{s}'] = (30, 0, 0)
    return rot


def walk(frame, n=4):
    beat, fold, spread = FLAP[frame % 4]
    rot = _body(frame, n)
    for s in 'LR':
        rot.update(Wing.beat(s, beat, fold, spread, fingers=3))
    return rot, (0.0, 0.0)


# frame by frame: the flame's size, its sparks', and the jaw's gape. The flame is biggest in the second frame and
# breaks into sparks in the last
BREATH = [(0.3, 0.0, 25), (1.0, 0.0, 45), (0.7, 0.5, 45), (0.0, 1.0, 30)]


def attack(frame, n=4):
    rot, _ = walk(frame, n)
    flame, sparks, gape = BREATH[frame]
    rot.update({'jaw': (gape, 0, 0), 'head': (34, 0, 0), 'flame': (25, 0, 0), 'sparks': (15, 0, 0)})
    return rot, (flame, sparks)


def hurt(frame, n=1):
    rot = _body(0, 1)
    rot.update({'head': (15, 0, 10), 'neck': (-25, 0, 0), 'jaw': (30, 0, 0)})
    for s in 'LR':
        rot.update(Wing.beat(s, 25, 10, 0, fingers=3))
    return rot, (0.0, 0.0)


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt}


def pose_for(anim, frame, yaw, adj=None):
    adj = adj or {}
    rot, (flame, sparks) = ANIMS[anim](frame)
    for j, d in adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(SKELETON, rot, yaw=yaw + adj.get('turn', 0.0),
             scales={'flame': flame, 'sparks': sparks, 'wound': 1.0 if anim == 'hurt' else 0.0})
    p.root_loc.z += adj.get('lift', 0.0)
    return p


# the wings and the legs are fitted each its own way from the side; in the front and the back views Daggerfall's
# dragonling flies and strikes as a mirror image of itself, so there they are mirrored pairs (beastfit.pair) and
# nothing turns it
_WING_P = [('shoulder_L|shoulder_R', 0, 8), ('shoulder_L|shoulder_R', 1, 10), ('shoulder_L|shoulder_R', 2, 8),
           ('elbow_L|elbow_R', 2, 10), ('wrist_L|wrist_R', 1, 10), ('wrist_L|wrist_R', 2, 10)]
_LEG_P = [('thigh_L|thigh_R', 0, 8), ('thigh_L|thigh_R', 1, 8)]
_TAIL_X = [(f'tail_{k}', 0, 10) for k in (0, 2, 4, 6)]
_TAIL_Z = [(f'tail_{k}', 2, 10) for k in (0, 2, 4, 6)]
_UPRIGHT = [('pelvis', 0, 6), ('neck', 0, 8), ('head', 0, 8), ('jaw', 0, 8)]
PARAMS = {a: _UPRIGHT + [('pelvis', 1, 4), ('pelvis', 2, 4), ('neck', 2, 6)] + _TAIL_X + _TAIL_Z
          + apart(_WING_P + _LEG_P) for a in ANIMS}
SYMMETRIC = (0, 4)
MIRRORED = {a: _UPRIGHT + _TAIL_X + _TAIL_Z + _WING_P + _LEG_P for a in ('walk', 'attack')}
