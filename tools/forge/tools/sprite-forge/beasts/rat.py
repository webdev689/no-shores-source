"""The giant rat (TEXTURE.255): Daggerfall's rat is a beast a metre long, a hunched back two-thirds of a metre high, long
hind feet, a bare tail as long again, red eyes and white incisors. Its body is one fused skin over trunk, head and legs;
the tail is skinned along its own chain; jaw, ears, eyes, teeth and claws are rigid.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the rat faces -Y): a limb hanging down swings
forward on -X; a trunk, neck or head pitches nose-down on +X; the tail rises on +X; a limb spreads out on -Y (left)."""
import math

import numpy as np
from mathutils import Matrix, Vector

import hides
import materials
from beastkit import Piece, Pose, Skeleton, Skin, chain_weights, fuse, hang, rigid, shaggy, tube, weights_over
from body import blob, blob_mesh, ramp
from shapes import loft

TAIL = 8          # the tail's bones
TAIL_STEP = 0.12  # metres a tail bone

JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'pelvis': ('root', (0.0, 0.25, 0.41)),
    'spine': ('pelvis', (0.0, 0.02, 0.42)),
    'chest': ('spine', (0.0, -0.17, 0.36)),
    'neck': ('chest', (0.0, -0.27, 0.37)),
    'head': ('neck', (0.0, -0.36, 0.39)),
    'jaw': ('head', (0.0, -0.40, 0.30)),
    'wound': ('head', (0.07, -0.55, 0.33)),    # shown only as it is struck
}
for k in range(TAIL):
    JOINTS[f'tail_{k}'] = ('pelvis' if k == 0 else f'tail_{k - 1}', (0.0, 0.50 + TAIL_STEP * k, 0.35))
for s, x in (('L', 1.0), ('R', -1.0)):
    JOINTS.update({
        f'shoulder_{s}': ('chest', (0.15 * x, -0.15, 0.31)),
        f'elbow_{s}': (f'shoulder_{s}', (0.21 * x, -0.10, 0.17)),
        f'wrist_{s}': (f'elbow_{s}', (0.23 * x, -0.20, 0.05)),
        f'hip_{s}': ('pelvis', (0.20 * x, 0.24, 0.35)),
        f'knee_{s}': (f'hip_{s}', (0.25 * x, 0.07, 0.19)),
        f'hock_{s}': (f'knee_{s}', (0.22 * x, 0.30, 0.07)),
    })
SKELETON = Skeleton(JOINTS)
PAW_TIP = (0.0, -0.085, -0.04)    # a front paw's toes from its wrist
TOE_TIP = (-0.01, -0.25, -0.06)   # a hind foot's toes from its hock
BODY_JOINTS = ['pelvis', 'spine', 'chest', 'neck', 'head'] + [
    f'{j}_{s}' for s in 'LR' for j in ('shoulder', 'elbow', 'wrist', 'hip', 'knee', 'hock')]
TAIL_JOINTS = ['pelvis'] + [f'tail_{k}' for k in range(TAIL)]

# the trunk, rump to neck: (share of the path, half width, up, down[, lift])
TRUNK_PATH = [(0, 0.56, 0.37), (0, 0.42, 0.41), (0, 0.24, 0.43), (0, 0.02, 0.41), (0, -0.17, 0.35), (0, -0.30, 0.33)]
TRUNK = [(0.0, 0.03, 0.03, 0.03), (0.05, 0.10, 0.13, 0.14), (0.16, 0.18, 0.19, 0.22), (0.33, 0.205, 0.22, 0.25),
         (0.55, 0.195, 0.2, 0.24), (0.78, 0.16, 0.13, 0.19), (0.92, 0.135, 0.13, 0.14), (1.0, 0.115, 0.12, 0.12)]
# the head, nape to the snout's tip: a broad skull swelling at the cheeks, carried high, tapering to the nose
HEAD_PATH = [(0, -0.25, 0.39), (0, -0.36, 0.39), (0, -0.47, 0.355), (0, -0.60, 0.315), (0, -0.64, 0.31)]
HEAD = [(0.0, 0.13, 0.11, 0.10), (0.25, 0.185, 0.125, 0.105), (0.45, 0.16, 0.10, 0.09), (0.7, 0.095, 0.07, 0.065),
        (0.9, 0.05, 0.045, 0.04), (1.0, 0.016, 0.014, 0.014)]
FORE = [(0.0, 0.075, 0.08, 0.08), (0.3, 0.055, 0.055, 0.055), (0.45, 0.045, 0.045, 0.045), (0.8, 0.032, 0.03, 0.03),
        (0.88, 0.04, 0.022, 0.022), (1.0, 0.04, 0.012, 0.012)]   # a palm at the end for its five toes
HIND = [(0.0, 0.13, 0.15, 0.15), (0.22, 0.12, 0.12, 0.12), (0.35, 0.075, 0.07, 0.07), (0.6, 0.04, 0.035, 0.035),
        (0.68, 0.035, 0.025, 0.025), (0.9, 0.035, 0.018, 0.018), (1.0, 0.025, 0.01, 0.01)]
TAIL_R = (0.045, 0.006)   # the tail's radius at its root and its tip


def rest(j):
    return SKELETON.rest(j)


def palette():
    """The rat's materials by role, each in its fitted colour."""
    plain = materials.plain
    mats = {   # the fur streaks front to back, lit in broad planes
        # coarse fur: clumps of dark and lighter brown streaked from front to back, deep relief
        'fur': hides.hide('fur', (0.015, 0.01, 0.006), (0.09, 0.065, 0.035), mottle=18.0, grain=55.0, grain_share=0.45,
                          soft=0.15, relief=0.6, relief_scale=55.0, rough=0.85, spec=0.25, stretch=(1.0, 0.5, 1.0)),
        'ear': plain('ear', (0.22, 0.14, 0.08), rough=0.6, spec=0.3),
        'tail': plain('tail', (0.03, 0.018, 0.012), rough=0.55, spec=0.4),
        'skin': plain('skin', (0.035, 0.018, 0.013), rough=0.6, spec=0.3),
        'eye': plain('eye', (0.4, 0.008, 0.0), rough=0.25, spec=0.6),
        'tooth': plain('tooth', (0.55, 0.55, 0.52), rough=0.35, spec=0.6),
        'claw': plain('claw', (0.012, 0.012, 0.012), rough=0.4, spec=0.5),
        'mouth': plain('mouth', (0.06, 0.008, 0.006), rough=0.7, spec=0.2),
        'blood': plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    for name in ('eye',):   # the eyes glow in the dark as Daggerfall's do
        b = mats[name].node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = (0.5, 0.01, 0.0, 1)
        b.inputs['Emission Strength'].default_value = 0.6
    return mats


# a material's colour class in the reference (`ref_class`): fur 1, the eyes' red 2, teeth and claws' white 3
CLASS = {'eye': 2, 'blood': 2, 'tooth': 3}
GRADE_RGB = ('fur', 'tail')   # graded channel by channel onto the reference under them (beastcolour.py)


def ref_class(rgb):
    """Each reference texel's class from its colour (rgb: (..., 3) uint8): 1 fur, 2 red eye, 3 white tooth."""
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > 110) & (g < 70) & (b < 70)] = 2
    out[(np.minimum(np.minimum(r, g), b) > 130) & (np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b) < 45)] = 3
    return out


def _leg(s, x, kind):
    """A leg's chain of points, shoulder (or hip) to toes, in rest space."""
    if kind == 'fore':
        top, mid, low = rest(f'shoulder_{s}'), rest(f'elbow_{s}'), rest(f'wrist_{s}')
        tip = low + Vector((PAW_TIP[0] * x, PAW_TIP[1], PAW_TIP[2]))
        return [top + Vector((-0.03 * x, 0, 0.06)), top, mid, low, tip]
    top, mid, low = rest(f'hip_{s}'), rest(f'knee_{s}'), rest(f'hock_{s}')
    tip = low + Vector((TOE_TIP[0] * x, TOE_TIP[1], TOE_TIP[2]))
    return [top + Vector((-0.04 * x, 0, 0.07)), top, mid, low, tip]


def _head_weights(p):
    """The head goes with the head joint forward of the nape, with the neck behind it."""
    neck = ramp(p[:, 1], -0.33, -0.28)
    return weights_over(BODY_JOINTS, ['neck', 'head'], np.stack([neck, 1 - neck], axis=1))


def build(M):
    """The rat's meshes: (skins, rigid parts as (object, joint))."""
    j = BODY_JOINTS
    bones = [rest(n)[:] for n in ('pelvis', 'spine', 'chest', 'neck', 'head')]
    pieces = [Piece('trunk', tube('trunk', TRUNK_PATH, TRUNK, n=44),
                    lambda p: weights_over(j, ['pelvis', 'spine', 'chest', 'neck'], chain_weights(p, bones[:5], 0.08)),
                    TRUNK_PATH, rows=[r[0] for r in TRUNK]),
              Piece('head', tube('head', HEAD_PATH, HEAD, n=36), _head_weights, HEAD_PATH,
                    size=('head_s', rest('head')[:]))]
    # cheeks, a brow over each eye and the nose's pad on the head, a shoulder over each foreleg
    blobs = [blob((0.115 * x, -0.44, 0.32), (0.09, 0.08, 0.065)) for x in (1, -1)]
    blobs += [blob((0.085 * x, -0.42, 0.455), (0.045, 0.055, 0.028)) for x in (1, -1)]
    pieces.append(Piece('cheeks', blob_mesh('cheeks', blobs, res=0.005),
                        lambda p: weights_over(j, ['head'], np.ones((len(p), 1))), [(0, -0.42, 0.36)],
                        size=('head_s', rest('head')[:])))
    for s, x in (('L', 1.0), ('R', -1.0)):
        for kind, table, names in (('fore', FORE, ('shoulder', 'elbow', 'wrist')), ('hind', HIND, ('hip', 'knee', 'hock'))):
            pts = [p[:] for p in _leg(s, x, kind)]
            up = (0, -1, 0)   # a leg runs up and down: its rings' up is forward
            bj = [f'{n}_{s}' for n in names]
            parent = 'chest' if kind == 'fore' else 'pelvis'
            pieces.append(Piece(f'{kind}_{s}', tube(f'{kind}_{s}', pts, table, n=24, up=up),
                                lambda p, pts=pts, bj=bj, parent=parent: weights_over(
                                    j, [parent] + bj, chain_weights(p, pts, 0.025)), pts))
    body = fuse(SKELETON, 'body', pieces, j, [M['fur'], M['skin']],
                pick=lambda c, a: 1 if (c[2] < 0.035 and abs(c[0]) > 0.1) else 0)
    shaggy(body, 0.008, 45.0, (1.0, 0.6, 1.0))   # the fur's broken outline
    # the tail: bare, ringed, tapering, skinned along its own bones
    tail_pts = [(0, 0.47, 0.36)] + [rest(f'tail_{k}')[:] for k in range(TAIL)] + [
        (0, 0.50 + TAIL_STEP * TAIL, 0.35)]
    r0, r1 = TAIL_R
    tail_rows = [(t, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t, r0 + (r1 - r0) * t) for t in np.linspace(0, 1, 6)]
    tail_me = tube('tail', tail_pts, tail_rows, n=12)
    bones_t = [rest('pelvis')[:]] + [rest(f'tail_{k}')[:] for k in range(TAIL)] + [tail_pts[-1]]
    tail = Skin(SKELETON, 'tail', tail_me, M['tail'], TAIL_JOINTS,
                chain_weights(np.array([v.co[:] for v in tail_me.vertices]), bones_t, 0.05))
    tail.pieces = [Piece('tail', None, None, bones_t)]
    parts = []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    # the lower jaw, its incisors, and the mouth's dark roof
    # the lower jaw, broad, its incisors and its row of cheek teeth, and the mouth's dark roof
    put(rigid('jaw', loft('jaw', (0, -0.36, 0.305), (0, -0.585, 0.27),
                           [(0, 0.10, 0.045), (0.5, 0.085, 0.035), (1, 0.04, 0.02)], M['fur'], n=12)), 'jaw', 'head')
    put(rigid('palate', loft('palate', (0, -0.38, 0.30), (0, -0.59, 0.28),
                              [(0, 0.095, 0.006), (1, 0.035, 0.004)], M['mouth'], n=10)), 'head', 'head')
    put(rigid('tongue', loft('tongue', (0, -0.38, 0.318), (0, -0.56, 0.292),
                              [(0, 0.075, 0.014), (1, 0.03, 0.008)], M['mouth'], n=10)), 'jaw', 'head')
    put(rigid('throat', blob_mesh('throat', [blob((0, -0.42, 0.30), (0.075, 0.05, 0.035))], res=0.004), M['mouth']),
        'head', 'head')
    for x in (1, -1):
        put(rigid(f'incisor_up_{x}', loft(f'incisor_up_{x}', (0.02 * x, -0.605, 0.305), (0.022 * x, -0.63, 0.195),
                                           [(0, 0.025, 0.013), (0.7, 0.022, 0.012), (1, 0.007, 0.005)], M['tooth'],
                                           n=8)), 'head', 'head')
        put(rigid(f'incisor_lo_{x}', loft(f'incisor_lo_{x}', (0.015 * x, -0.565, 0.26), (0.017 * x, -0.60, 0.33),
                                           [(0, 0.02, 0.011), (1, 0.006, 0.004)], M['tooth'], n=8)), 'jaw', 'head')
        for k in range(5):   # the teeth along each rim, a fang at the front: the gape's white ring head on
            t, fang = k / 4, 1.8 if k == 0 else 1.0
            cx, cy = (0.03 + 0.04 * t) * x, -0.56 + 0.12 * t
            put(rigid(f'tooth_up{x}{k}', loft(f'tooth_up{x}{k}', (cx, cy, 0.30), (cx, cy, 0.30 - 0.032 * fang),
                                              [(0, 0.014 * fang ** 0.5, 0.011), (1, 0.003, 0.003)], M['tooth'], n=6)),
                'head', 'head')
            lo = (cx * 0.95, cy, 0.29)
            put(rigid(f'tooth_lo{x}{k}', loft(f'tooth_lo{x}{k}', lo, (lo[0], cy, 0.29 + 0.03 * fang),
                                              [(0, 0.013 * fang ** 0.5, 0.01), (1, 0.003, 0.003)], M['tooth'], n=6)),
                'jaw', 'head')
        # the ears: big, round, thin and pale, standing up and out from the back of the skull, hollowed forward
        ear = blob_mesh(f'ear_{x}', [blob((0, 0, 0), (0.08, 0.022, 0.095)),
                                     blob((0, -0.014, 0.01), (0.06, 0.014, 0.075), negative=True)], res=0.004)
        ear.transform(Matrix.Translation((0.15 * x, -0.30, 0.55)) @ Matrix.Rotation(math.radians(30 * x), 4, 'Y')
                      @ Matrix.Rotation(math.radians(40 * x), 4, 'Z'))   # turned out and tipped out from the skull
        put(rigid(f'ear_{x}', ear, M['ear']), 'head', 'head')
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.135 * x, -0.46, 0.395), (0.026, 0.055, 0.024),
                                                           along=(0.35 * x, -1.0, 0.05))],
                                         res=0.003), M['eye']), 'head', 'head')
    put(rigid('nose', blob_mesh('nose', [blob((0, -0.638, 0.30), (0.02, 0.014, 0.016))], res=0.003), M['skin']),
        'head', 'head')
    for s, x in (('L', 1.0), ('R', -1.0)):   # toes: five long ones fanned on each paw, four on each hind foot
        w = rest(f'wrist_{s}')
        for k in range(5):
            a_ = math.radians(-32 + 16 * k)
            a = w + Vector((PAW_TIP[0] * x, PAW_TIP[1] + 0.01, PAW_TIP[2] + 0.012))
            b = a + Vector((math.sin(a_) * 0.09 * x, -math.cos(a_) * 0.09, -0.035))
            put(rigid(f'claw_{s}{k}', loft(f'claw_{s}{k}', a[:], b[:], [(0, 0.009, 0.007), (1, 0.002, 0.002)],
                                           M['claw'], n=6, subsurf=1)), f'wrist_{s}')
        h = rest(f'hock_{s}')
        for k in range(4):
            a_ = math.radians(-25 + 50 * k / 3)
            a = h + Vector((TOE_TIP[0] * x, TOE_TIP[1] + 0.01, TOE_TIP[2] + 0.012))
            b = a + Vector((math.sin(a_) * 0.08 * x, -math.cos(a_) * 0.08, -0.015))
            put(rigid(f'toe_{s}{k}', loft(f'toe_{s}{k}', a[:], b[:], [(0, 0.009, 0.007), (1, 0.002, 0.002)],
                                          M['claw'], n=6, subsurf=1)), f'hock_{s}')
    # the wound: a fan of droplets flung out from the snout's left, and splashes over the face
    w, rng = np.array(rest('wound')[:]), np.random.default_rng(255)
    drops = []
    for t in np.linspace(0.08, 1.0, 34):
        off = rng.normal(0, 0.05 * t + 0.01, 3) * (0.3, 1.0, 1.0)
        drops.append(blob(tuple(w + np.array((0.34, -0.05, 0.07)) * t + off), (0.011 - 0.005 * t,) * 3))
    for c, r in (((-0.135, -0.44, 0.43), (0.05, 0.05, 0.04)), ((-0.09, -0.36, 0.49), (0.04, 0.04, 0.03)),
                 ((-0.1, -0.52, 0.36), (0.035, 0.04, 0.03)), ((0.08, -0.54, 0.35), (0.03, 0.035, 0.03))):
        drops.append(blob(c, r))
    put(rigid('blood', blob_mesh('blood', drops, res=0.004), M['blood']), 'wound')
    return [body, tail], parts


# the soles that bear the rat's weight: a point under each paw, in its joint's frame
SOLES = {f'wrist_{s}': [Vector((PAW_TIP[0] * x, PAW_TIP[1], PAW_TIP[2] - 0.01))] for s, x in (('L', 1), ('R', -1))}
SOLES.update({f'hock_{s}': [Vector((0, 0, -0.06)), Vector((TOE_TIP[0] * x, TOE_TIP[1], TOE_TIP[2] - 0.008))]
              for s, x in (('L', 1), ('R', -1))})


def grounded(p, joints=None):
    """Lower or lift the root so the lowest of the soles (or of `joints`' soles) touches the ground."""
    W = p.world()
    low = min((W[j] @ q).z for j, qs in SOLES.items() if joints is None or j in joints for q in qs)
    p.root_loc.z -= low
    return p


def _tail(curl, lift=0.0, sway=0.0):
    """The tail's bones: each lifted `lift` at the root, then curled `curl` degrees a bone (down, +), swayed aside."""
    out = {'tail_0': (lift, 0, sway)}
    for k in range(1, TAIL):
        out[f'tail_{k}'] = (-curl * (0.5 + k / TAIL), 0, sway * 0.6)
    return out


def _legs(phase, stride=1.0):
    """The four legs at a share `phase` of the scurry: diagonal pairs together, each foot pushing back on the ground
    half the cycle and lifting forward through the other half."""
    rot = {}
    for s, off in (('L', 0.0), ('R', 0.5)):
        for kind, extra in (('fore', 0.0), ('hind', 0.5)):
            ph = 2 * math.pi * (phase + off + extra)
            swing = math.cos(ph) * stride        # +1 forward, -1 back
            lift = max(0.0, math.sin(ph)) * stride   # through the forward half
            if kind == 'fore':
                rot[f'shoulder_{s}'] = (-28 * swing, 0, 0)
                rot[f'elbow_{s}'] = (35 * lift + 6 * swing, 0, 0)
                rot[f'wrist_{s}'] = (-30 * lift - 10 * swing, 0, 0)
            else:
                rot[f'hip_{s}'] = (-26 * swing - 4, 0, 0)
                rot[f'knee_{s}'] = (-20 * lift, 0, 0)
                rot[f'hock_{s}'] = (30 * lift - 12 * swing, 0, 0)
    return rot


def walk(frame, n=8):
    rot = _legs(frame / n)
    bob = math.sin(4 * math.pi * frame / n)
    rot.update({'pelvis': (2 * bob, 0, 0), 'chest': (-2 * bob, 0, 0), 'neck': (-8, 0, 0), 'head': (6, 0, 0),
                'jaw': (24, 0, 0)})   # it comes on snarling, as Daggerfall's does
    # the tail rests along the ground, swinging behind it and to its right
    rot.update(_tail(4, lift=-15, sway=25 * math.sin(2 * math.pi * frame / n) - 15))
    return rot, None


# the bite: crouched, rearing back with the jaw dropping, high and wide, lunging down, and back
ATTACK = [
    {'pelvis': (6, 0, 0), 'neck': (2, 0, 0), 'head': (4, 0, 0), 'jaw': (8, 0, 0)},
    {'pelvis': (-10, 0, 0), 'neck': (-10, 0, 0), 'head': (-4, 0, 0), 'jaw': (25, 0, 0)},
    {'pelvis': (-28, 0, 0), 'spine': (-6, 0, 0), 'neck': (-14, 0, 0), 'head': (-16, 0, 0), 'jaw': (75, 0, 0)},
    {'pelvis': (-30, 0, 0), 'spine': (-8, 0, 0), 'neck': (-8, 0, 0), 'head': (-10, 0, 0), 'jaw': (75, 0, 0)},
    {'pelvis': (-10, 0, 0), 'neck': (4, 0, 0), 'head': (14, 0, 0), 'jaw': (40, 0, 0)},
    {'pelvis': (4, 0, 0), 'neck': (2, 0, 0), 'head': (6, 0, 0), 'jaw': (6, 0, 0)},
]
# the forelegs: each frame's shoulder swing, its spread out to the side, the elbow and the wrist; at the height of the
# bite they spread wide and down, the claws splayed, as Daggerfall's do
ATTACK_FORE = [(0, 0, 0, 0), (-25, -10, 30, -10), (-30, -25, 15, -10), (-30, -25, 15, -10), (-35, -10, 20, -10),
               (-5, 0, 0, 0)]


def attack(frame, n=6):
    rot = dict(ATTACK[frame])
    sh, spread, el, wr = ATTACK_FORE[frame]
    lean = rot['pelvis'][0]
    for s, x in (('L', 1), ('R', -1)):
        rot[f'shoulder_{s}'] = (sh, spread * x, 0)
        rot[f'elbow_{s}'] = (el, 0, 0)
        rot[f'wrist_{s}'] = (wr, 0, 0)
        # the hind legs keep the feet down as the trunk rears back over them
        rot[f'hip_{s}'] = (-lean * 0.6, 0, 0)
        rot[f'hock_{s}'] = (-lean * 0.4, 0, 0)
    rot.update(_tail(0, lift=-lean + 6))   # level along the ground behind the reared body, never through it
    return rot, [f'hock_{s}' for s in 'LR']


def hurt(frame, n=1):
    rot = {'pelvis': (-6, 0, 0), 'neck': (-18, 0, 4), 'head': (-14, 0, 8), 'jaw': (30, 0, 0)}
    rot.update(_legs(0.15, 0.4))
    rot.update(_tail(6, lift=6, sway=10))
    return rot, None


def idle(frame, n=1):
    rot = {'pelvis': (4, 0, 0), 'chest': (4, 0, 0), 'neck': (-10, 0, 0), 'head': (2, 0, 0), 'jaw': (3, 0, 0)}
    rot.update(_legs(0.0, 0.3))
    rot.update(_tail(-12, lift=35, sway=12))   # the tail arcs up over its back
    return rot, None


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt, 'idle': idle}


def pose_for(anim, frame, yaw, adj=None):
    """The rat's pose for a frame turned `yaw` degrees, with a fitted adjustment `adj` (beastfit.py) added to its keys:
    joint rotations ('rot'), the body's turn ('turn') and the root's height off its soles ('lift')."""
    adj = adj or {}
    rot, planted = ANIMS[anim](frame)
    for j, d in adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(SKELETON, rot, yaw=yaw + adj.get('turn', 0.0), scales={'wound': 1.0 if anim == 'hurt' else 0.0})
    grounded(p, planted)
    p.root_loc.z += adj.get('lift', 0.0)
    return p


# what a frame may adjust (beastfit.py), past the body's turn and its height off its soles: (joint, axis, step)
_TRUNK_P = [('pelvis', 0, 5), ('pelvis', 1, 4), ('pelvis', 2, 5), ('spine', 0, 5), ('spine', 2, 5), ('chest', 0, 5),
            ('chest', 2, 5), ('neck', 0, 7), ('neck', 2, 7), ('head', 0, 7), ('head', 1, 6), ('head', 2, 7)]
_LEG_P = [p for s in 'LR' for p in [(f'shoulder_{s}', 0, 8), (f'shoulder_{s}', 1, 5), (f'elbow_{s}', 0, 10),
                                    (f'wrist_{s}', 0, 10), (f'hip_{s}', 0, 8), (f'hip_{s}', 1, 5), (f'knee_{s}', 0, 10),
                                    (f'hock_{s}', 0, 10)]]
_TAIL_P = [(f'tail_{k}', a, 10) for k in (0, 2, 4, 6) for a in (0, 2)]
PARAMS = {a: _TRUNK_P + _LEG_P + _TAIL_P + [('jaw', 0, 8)] for a in ('walk', 'attack', 'hurt', 'idle')}
