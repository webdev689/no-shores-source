"""The giant bat (TEXTURE.258): wings over three metres across on a small dark body, a broad pale-gold face with red
eyes under a heavy brow, an open red mouth with four fangs and wide round ears, and two small clawed feet hanging
under the chest.
Each wing is an arm - humerus, forearm, a hand of four long fingers and a hooked thumb - with a membrane stretched
from the fingertips back to the body and the leg (wing.py), red-brown, lighter on its top side, veined, the
fingers' tips bare past its edge. The body, head and ears are rigid or skinned on their joints. It flies: nothing
grounds it.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the bat faces -Y). A wing's beat is its
shoulder turned about the body's long axis (`Wing.flap`): up on + for either wing."""
import math

import numpy as np
from mathutils import Matrix

import hides
import materials
from beastkit import Piece, Pose, Skeleton, Skin, apart, hang, rigid, tube
from body import blob, blob_mesh
from wing import Wing

FLIES = True   # its place is fitted across and up and down (beastfit.flies)
BODY_Z = 1.2
FINGERS = 4
# a wing at rest, spread level (the left; the right mirrors it): the arm's joints, and each finger's tip
SHOULDER, ELBOW, WRIST = (0.07, -0.06, BODY_Z + 0.03), (0.36, 0.02, BODY_Z + 0.05), (0.72, -0.08, BODY_Z + 0.05)
TIPS = [(1.58, -0.16, BODY_Z + 0.04), (1.5, 0.28, BODY_Z + 0.02), (1.12, 0.52, BODY_Z), (0.66, 0.5, BODY_Z)]
HIP, MEMBRANE_ROOT = (0.08, 0.16, BODY_Z - 0.02), (0.14, 0.3, BODY_Z - 0.06)
FOOT = (0.09, 0.22, BODY_Z - 0.2)   # the feet hang under the chest, clawed
CAMBER = 0.09   # metres the membrane sags between its bones at most: seen head on, a wing is a band, not a line

WING = Wing(SHOULDER, ELBOW, WRIST, TIPS, HIP, MEMBRANE_ROOT, body='body', leg='leg', camber=CAMBER, faces_up=True)
JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'body': ('root', (0.0, 0.0, BODY_Z)),
    'head': ('body', (0.0, -0.15, BODY_Z + 0.04)),
    'jaw': ('head', (0.0, -0.22, BODY_Z)),
    'wound': ('head', (0.03, -0.28, BODY_Z + 0.1)),
}
for s in 'LR':
    JOINTS.update(WING.joints(s, 'body'))
    JOINTS[f'leg_{s}'] = ('body', Wing.mirror(HIP, s))
SKELETON = Skeleton(JOINTS)


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        'fur': hides.hide('fur', (0.018, 0.016, 0.013), (0.04, 0.035, 0.028), mottle=8.0, grain=60.0, relief=0.3,
                          relief_scale=90.0, rough=0.85, spec=0.2),
        'face': hides.hide('face', (0.3, 0.2, 0.1), (0.5, 0.36, 0.2), mottle=10.0, grain=60.0, relief=0.2,
                           relief_scale=90.0, rough=0.6, spec=0.3),
        # both sides one red-brown, the top lighter: a hue of its own to each side would grade apart
        'wing': hides.two_sided('wing', ((0.2, 0.1, 0.055), (0.32, 0.17, 0.09)),
                                ((0.12, 0.06, 0.033), (0.2, 0.1, 0.055)),
                                mottle=6.0, rough=0.9, spec=0.15, veins=0.45, vein_scale=9.0),
        'bone': materials.plain('bone', (0.2, 0.1, 0.05), rough=0.5, spec=0.4),
        'eye': materials.plain('eye', (0.4, 0.008, 0.0), rough=0.2, spec=0.7),
        'fang': materials.plain('fang', (0.6, 0.58, 0.52), rough=0.3, spec=0.6),
        'mouth': materials.plain('mouth', (0.25, 0.01, 0.0), rough=0.6, spec=0.2),
        'claw': materials.plain('claw', (0.03, 0.03, 0.03), rough=0.4, spec=0.5),
        'blood': materials.plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    b = mats['eye'].node_tree.nodes['Principled BSDF']
    b.inputs['Emission Color'].default_value = (0.5, 0.01, 0.0, 1)
    b.inputs['Emission Strength'].default_value = 0.6
    return mats


# colour classes in the reference (`ref_class`): 1 shadow and the dark body, 2 the eyes' red, 3 the fangs' white, 4 the
# pale gold of the face, the lit membrane and its bones
CLASS = {'eye': 2, 'fang': 3, 'wing': 4, 'face': 4, 'bone': 4}
GRADE_RGB = ('wing', 'fur', 'face')


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > g + 20) & (g > b) & (r > 90)] = 4
    out[(r > 120) & (g < 60) & (b < 60)] = 2
    out[(np.minimum(np.minimum(r, g), b) > 150) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 40)] = 3
    return out


def _cone(name, a, b, r0, r1=0.002):
    return tube(name, [a, b], [(0.0, r0, r0, r0), (1.0, r1, r1, r1)], n=6, up=(1, 0, 0), step=0.008)


def build(M):
    """The bat's meshes: (skins, rigid parts as (object, joint))."""
    skins, parts = [], []
    Z = BODY_Z

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    body = Skin(SKELETON, 'body', tube('body', [(0, 0.3, Z - 0.03), (0, 0.05, Z), (0, -0.12, Z + 0.03)],
                                         [(0.0, 0.03, 0.03, 0.03), (0.3, 0.1, 0.09, 0.1), (0.7, 0.11, 0.1, 0.1),
                                          (1.0, 0.07, 0.07, 0.07)], n=24), M['fur'], ['body'], None)
    body.pieces = [Piece('body', None, None, [(0, 0.05, Z)])]
    skins.append(body)
    # the face: broad, square and snarling, a skull's - a heavy brow over red eyes in deep sockets, a nose leaf
    # between them, cheeks, a mouth gaping at its front over a red lining with a fang at each corner, above and below
    head = [blob((0, -0.2, Z + 0.06), (0.15, 0.1, 0.11)), blob((0, -0.28, Z + 0.03), (0.12, 0.05, 0.09)),
            blob((0, -0.31, Z + 0.1), (0.13, 0.03, 0.03)), blob((0, -0.335, Z + 0.06), (0.035, 0.025, 0.04))]
    head += [blob((0.09 * x, -0.29, Z + 0.02), (0.05, 0.04, 0.05)) for x in (1, -1)]
    head += [blob((0.065 * x, -0.335, Z + 0.07), (0.035, 0.025, 0.025), negative=True) for x in (1, -1)]
    head.append(blob((0, -0.34, Z - 0.03), (0.06, 0.045, 0.05), negative=True))
    put(rigid('head', blob_mesh('head', head, res=0.005), M['face']), 'head')
    put(rigid('jaw', tube('jaw', [(0, -0.22, Z - 0.06), (0, -0.315, Z - 0.085)], [(0.0, 0.07, 0.03, 0.03),
                                                                                 (1.0, 0.06, 0.022, 0.022)],
                          n=12, step=0.008), M['face']), 'jaw')
    put(rigid('mouth', blob_mesh('mouth', [blob((0, -0.3, Z - 0.03), (0.06, 0.02, 0.05))], res=0.004), M['mouth']),
        'head')
    for x in (1, -1):
        # wide round ears at the crown's corners, cupped forward, turned and tipped out
        ear = blob_mesh(f'ear_{x}', [blob((0, 0, 0), (0.075, 0.02, 0.1)),
                                     blob((0, -0.012, 0.01), (0.055, 0.013, 0.08), negative=True)], res=0.004)
        ear.transform(Matrix.Translation((0.14 * x, -0.19, Z + 0.2)) @ Matrix.Rotation(math.radians(25 * x), 4, 'Y')
                      @ Matrix.Rotation(math.radians(35 * x), 4, 'Z'))
        put(rigid(f'ear_{x}', ear, M['face']), 'head')
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.065 * x, -0.318, Z + 0.068), (0.026, 0.016, 0.02))],
                                         res=0.003), M['eye']), 'head')
        put(rigid(f'fang_{x}', _cone(f'fang_{x}', (0.045 * x, -0.345, Z + 0.015), (0.042 * x, -0.35, Z - 0.035),
                                     0.011), M['fang']), 'head')
        put(rigid(f'fang_lo_{x}', _cone(f'fang_lo_{x}', (0.045 * x, -0.33, Z - 0.075), (0.043 * x, -0.34, Z - 0.035),
                                        0.009), M['fang']), 'jaw')
    for s in 'LR':
        x = 1.0 if s == 'L' else -1.0
        m = lambda p: Wing.mirror(p, s)   # noqa: E731
        WING.bones(s, put, M['bone'])
        skins.append(WING.membrane(SKELETON, s, M['wing']))
        wr = np.array(m(WRIST))
        for k, t in enumerate(TIPS):   # each finger's tip runs bare past the membrane's edge
            tip = np.array(m(t))
            put(rigid(f'spike_{s}{k}', _cone(f'spike_{s}{k}', tuple(tip), tuple(tip + (tip - wr) * 0.08), 0.005),
                      M['bone']), f'finger{k}_{s}')
        put(rigid(f'thumb_{s}', _cone(f'thumb_{s}', tuple(wr), tuple(wr + np.array((0.0, -0.042, 0.056))), 0.012),
                  M['claw']), f'wrist_{s}')
        hip, foot = m(HIP), m(FOOT)
        put(rigid(f'leg_{s}', tube(f'leg_{s}', [hip, foot], [(0.0, 0.03, 0.03, 0.03), (1.0, 0.015, 0.015, 0.015)], n=8),
                  M['fur']), f'leg_{s}')
        for k, d in enumerate((-0.35, 0.0, 0.35)):   # three claws a foot, splayed
            tip = (foot[0] + np.sin(d) * 0.03, foot[1] - 0.02, foot[2] - 0.03)
            put(rigid(f'talon_{s}{k}', _cone(f'talon_{s}{k}', foot, tip, 0.006), M['claw']), f'leg_{s}')
    put(rigid('blood', blob_mesh('blood', [blob(rest('wound')[:], (0.04, 0.025, 0.03))], res=0.006), M['blood']),
        'wound')
    return skins, parts


# the flap, as Daggerfall's front view shows it: wings raised in a V, level, hanging straight down with their tips
# curled in under the body, coming up. Each frame's beat, fold, spread and curl (Wing.flap)
FLAP = [(35, 0, 0, 0), (0, 0, 0, 0), (-80, 8, -12, 25), (-35, 12, -6, 10)]


def _wings(beat, fold, spread, curl):
    rot = {}
    for s in 'LR':
        rot.update(Wing.flap(s, beat, fold, spread, curl, fingers=FINGERS))
    return rot


def walk(frame, n=4):
    rot = {'body': (0, 0, 0), 'head': (-6, 0, 0), 'jaw': (15, 0, 0)}
    rot.update(_wings(*FLAP[frame % 4]))
    for s in 'LR':
        rot[f'leg_{s}'] = (-10, 0, 0)
    return rot, 0.0


GAPE = [15, 50, 50, 30]   # the jaw through the bite's four frames


def attack(frame, n=4):
    rot, _ = walk(frame)
    rot.update({'head': (8, 0, 0), 'jaw': (GAPE[frame], 0, 0), 'body': (10, 0, 0)})
    return rot, 0.0


def hurt(frame, n=1):
    # struck, it rolls to its left: the right wing held out, the left curled down
    rot = {'body': (-10, 12, 6), 'head': (-25, 0, 15), 'jaw': (30, 0, 0), 'leg_L': (-10, 0, 0), 'leg_R': (-10, 0, 0)}
    rot.update(Wing.flap('R', 5, 0, 6, fingers=FINGERS))
    rot.update(Wing.flap('L', -45, 15, -6, fingers=FINGERS))
    return rot, 1.0


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt}


def pose_for(anim, frame, yaw, adj=None):
    adj = adj or {}
    rot, wound = ANIMS[anim](frame)
    for j, d in adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(SKELETON, rot, yaw=yaw + adj.get('turn', 0.0), scales={'wound': wound})
    p.root_loc.z += adj.get('lift', 0.0)
    return p


# the wings are fitted as a mirrored pair (beastfit.pair), so a front or back view stays symmetric; the body's roll
# tilts them together
# the wings fitted each its own way: Daggerfall's bat is not a mirror image of itself even from the front
_WING = [('shoulder', 0, 8), ('shoulder', 1, 10), ('shoulder', 2, 8), ('elbow', 2, 10), ('wrist', 1, 10),
         ('wrist', 2, 10)]
_WING_PAIRED = [(f'{j}_L|{j}_R', a, st) for j, a, st in _WING]
_WING_P = apart(_WING_PAIRED)
_BODY = [('body', 0, 6), ('body', 1, 4), ('body', 2, 4), ('head', 0, 8), ('jaw', 0, 8)]
PARAMS = {a: _BODY + _WING_P for a in ANIMS}
