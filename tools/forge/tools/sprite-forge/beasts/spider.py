"""The giant spider (TEXTURE.261): a green-legged hunter two and a half metres across its legs. A big green
cephalothorax carries two great red eyes and four small ones under a red rosette on its crown, and two fat green
chelicerae with dark fangs under a tan band; a near-black abdomen, marked red-orange on top, rides behind it on a
waist of its own. Eight slim jointed legs rise high to the knee and reach down to the ground, orange-brown at their
tips. Each leg is skinned along its own four bones; the body parts are rigid.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the spider faces -Y). A leg is keyed by its
own turns (arthropod.py `Leg.turn`): swung forward along the ground, its femur raised, its knee and ankle bent."""
import math

import numpy as np

import hides
import materials
from arthropod import Leg, ground
from beastkit import Piece, Pose, Skeleton, Skin, chain_place, hang, rigid, tube
from body import blob, blob_mesh

LEG_BEARING = (40.0, 75.0, 108.0, 128.0)   # each leg's bearing, degrees round from forward toward its side
LEG_ROOT_Y = (-0.34, -0.25, -0.15, -0.05)  # where along the cephalothorax each leg is set
FEMUR = (1.0, 0.95, 1.0, 1.15)             # the hind pair reaches out farther, as Daggerfall's does
THORAX_Z = 0.72
BONES = (0.65, 0.47)                        # each leg's tibia and foot
LEG_TOP = 0.05                              # the stretch of a leg inside the body, before its root


def _radii(femur):
    """A leg's girth at shares of its length, keyed to its own joints: a thick femur tapering to the knee, swelling
    at the knee and the ankle, ending in a slim point."""
    total = LEG_TOP + femur + sum(BONES)
    knee, ankle = (LEG_TOP + femur) / total, (LEG_TOP + femur + BONES[0]) / total
    return ((0.0, 0.1), (knee - 0.03, 0.075), (knee, 0.08), (knee + 0.04, 0.065), (ankle - 0.02, 0.05),
            (ankle, 0.055), (ankle + 0.03, 0.042), (1.0, 0.02))


# Daggerfall's spider carries its knees a metre up and far out from its body, and drops each leg straight down from
# the knee to the ground: a long femur rising gently, a steep tibia, a foot standing under it
LEGS = {(s, k): Leg(f'{s}{k}', s, 'thorax', (0.14 * (1 if s == 'L' else -1), LEG_ROOT_Y[k], THORAX_Z - 0.02),
                    LEG_BEARING[k], (FEMUR[k],) + BONES, rise=0.4, fall=0.92, reach=0.03, radii=_radii(FEMUR[k]))
        for s in 'LR' for k in range(4)}


JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'thorax': ('root', (0.0, -0.15, THORAX_Z)),
    'abdomen': ('thorax', (0.0, 0.16, 0.76)),
    'wound': ('thorax', (0.08, -0.5, 0.86)),
}
for s in 'LR':
    JOINTS[f'fang_{s}'] = ('thorax', (0.07 * (1 if s == 'L' else -1), -0.5, 0.66))
for leg in LEGS.values():
    JOINTS.update(leg.joints())
SKELETON = Skeleton(JOINTS)
# the cephalothorax, a high domed shield narrowing to the face; the abdomen, an egg on its waist at the pedicel
THORAX_PATH = [(0, 0.1, 0.72), (0, -0.15, 0.76), (0, -0.4, 0.74), (0, -0.55, 0.7)]
THORAX = [(0.0, 0.14, 0.12, 0.08), (0.3, 0.28, 0.2, 0.14), (0.65, 0.26, 0.18, 0.13), (0.9, 0.18, 0.12, 0.1),
          (1.0, 0.08, 0.05, 0.05)]
ABDOMEN_PATH = [(0, 0.16, 0.76), (0, 0.3, 0.8), (0, 0.52, 0.82), (0, 0.75, 0.78), (0, 0.88, 0.74)]
ABDOMEN = [(0.0, 0.06, 0.05, 0.05), (0.15, 0.26, 0.22, 0.21), (0.45, 0.34, 0.3, 0.28), (0.8, 0.26, 0.24, 0.23),
           (1.0, 0.05, 0.05, 0.05)]


def rest(j):
    return SKELETON.rest(j)


def palette():
    plain = materials.plain
    mats = {
        'leg': hides.hide('leg', (0.02, 0.055, 0.028), (0.035, 0.08, 0.04), mottle=8.0, grain=50.0, relief=0.3,
                          relief_scale=35.0, rough=0.5, spec=0.4),
        'tarsus': plain('tarsus', (0.22, 0.1, 0.035), rough=0.4, spec=0.5),
        'thorax': hides.hide('thorax', (0.025, 0.065, 0.032), (0.04, 0.09, 0.045), mottle=8.0, grain=50.0,
                             relief=0.3, relief_scale=35.0, rough=0.5, spec=0.4),
        'abdomen': plain('abdomen', (0.012, 0.016, 0.01), rough=0.55, spec=0.25),
        'mark': plain('mark', (0.3, 0.05, 0.02), rough=0.5, spec=0.3),
        'tan': plain('tan', (0.3, 0.17, 0.08), rough=0.5, spec=0.3),
        'eye': plain('eye', (0.4, 0.008, 0.0), rough=0.2, spec=0.7),
        'glint': plain('glint', (1.0, 0.5, 0.05), rough=0.3, spec=0.5),
        'fang': plain('fang', (0.04, 0.03, 0.02), rough=0.35, spec=0.5),
        'blood': plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    for name, glow, strength in (('eye', (0.5, 0.01, 0.0, 1), 0.6), ('glint', (1.0, 0.5, 0.05, 1), 1.2)):
        b = mats[name].node_tree.nodes['Principled BSDF']
        b.inputs['Emission Color'].default_value = glow
        b.inputs['Emission Strength'].default_value = strength
    return mats


# colour classes in the reference (`ref_class`): 1 dark, 2 the eyes' red, 3 the legs' green, 4 the red-orange of the
# abdomen's marking, the crown's rosette and the legs' tips
CLASS = {'eye': 2, 'leg': 3, 'thorax': 3, 'mark': 4, 'tarsus': 4}
GRADE_RGB = ('leg', 'thorax')   # lit green and deep shadow alike: graded onto every pixel under them


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(g > r + 6) & (g > b) & (g > 30)] = 3
    out[(r > g + 8) & (r > 45)] = 4
    out[(r > 110) & (g < 60) & (b < 60)] = 2
    return out


def _leg_skin(leg, M):
    """A leg's skin, its last fifth the tarsus's orange-brown."""
    sk = leg.skin(SKELETON, M['leg'])
    sk.me.materials.append(M['tarsus'])
    pts = np.array([p[:] for p in [leg.root - leg.d * LEG_TOP, leg.root, leg.knee, leg.ankle, leg.foot]])
    centres = np.array([f.center[:] for f in sk.me.polygons])
    at, _ = chain_place(centres, pts)
    total = np.linalg.norm(np.diff(pts, axis=0), axis=1).sum()
    for f, a in zip(sk.me.polygons, at / total):
        f.material_index = 1 if a > 0.82 else 0
    return sk


def build(M):
    """The spider's meshes: (skins, rigid parts as (object, joint))."""
    skins, parts = [], []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    for leg in LEGS.values():
        skins.append(_leg_skin(leg, M))
        for at, joint in ((leg.knee, f'knee_{leg.name}'), (leg.ankle, f'ankle_{leg.name}')):   # a knob at each joint
            r = 0.076 if joint.startswith('knee') else 0.058
            put(rigid(f'knob_{joint}', blob_mesh(f'knob_{joint}', [blob(at[:], (r, r, r))], res=0.008), M['leg']),
                joint)
    for name, path, rows in (('thorax', THORAX_PATH, THORAX), ('abdomen', ABDOMEN_PATH, ABDOMEN)):
        sk = Skin(SKELETON, name, tube(name, path, rows, n=30), M[name], [name], None)
        sk.pieces = [Piece(name, None, None, path, rows=[r[0] for r in rows])]
        skins.append(sk)
    # the abdomen's marking: a ring of red-orange spots round a chevron on its top
    mark = [blob((0.17 * math.cos(a), 0.52 + 0.17 * math.sin(a), 1.08), (0.05, 0.05, 0.02))
            for a in np.linspace(0, 2 * math.pi, 7)[:-1]] + [blob((0, 0.45, 1.11), (0.09, 0.05, 0.02))]
    put(rigid('mark', blob_mesh('mark', mark, res=0.008), M['mark']), 'abdomen', 'abdomen')
    # the crown's red rosette, the two great eyes with their glowing cores, the four small eyes between them
    rosette = [blob((0.06 * math.cos(a), -0.3 + 0.06 * math.sin(a), 0.95), (0.04, 0.04, 0.015))
               for a in np.linspace(0, 2 * math.pi, 5)[:-1]]
    put(rigid('rosette', blob_mesh('rosette', rosette, res=0.006), M['mark']), 'thorax', 'thorax')
    for x in (1, -1):
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.15 * x, -0.52, 0.8), (0.05, 0.05, 0.05))], res=0.004),
                  M['eye']), 'thorax', 'thorax')
        put(rigid(f'glint_{x}', blob_mesh(f'glint_{x}', [blob((0.15 * x, -0.565, 0.8), (0.015, 0.012, 0.015))],
                                           res=0.003), M['glint']), 'thorax', 'thorax')
        for k, ex in enumerate((0.03, 0.07)):
            put(rigid(f'eyelet_{x}{k}', blob_mesh(f'eyelet_{x}{k}', [blob((ex * x, -0.54, 0.78), (0.018,) * 3)],
                                                   res=0.003), M['eye']), 'thorax', 'thorax')
    # the clypeus, a tan band across the face's lower edge, over the chelicerae
    put(rigid('clypeus', blob_mesh('clypeus', [blob((0, -0.55, 0.68), (0.21, 0.03, 0.025))], res=0.006), M['tan']),
        'thorax', 'thorax')
    for s in 'LR':
        x = 1.0 if s == 'L' else -1.0
        f0 = rest(f'fang_{s}')
        chel = tube(f'chel_{s}', [f0[:], (f0.x, f0.y - 0.05, f0.z - 0.15), (f0.x - 0.01 * x, f0.y - 0.08, f0.z - 0.3)],
                    [(0.0, 0.085, 0.085, 0.085), (0.5, 0.08, 0.08, 0.08), (1.0, 0.04, 0.04, 0.04)], n=12,
                    up=(0, -1, 0))
        put(rigid(f'chel_{s}', chel, M['thorax']), f'fang_{s}')
        tip = (f0.x - 0.01 * x, f0.y - 0.08, f0.z - 0.3)
        put(rigid(f'fang_{s}', tube(f'fang_{s}', [tip, (tip[0] - 0.04 * x, tip[1] - 0.02, tip[2] - 0.04)],
                                    [(0.0, 0.02, 0.02, 0.02), (1.0, 0.004, 0.004, 0.004)], n=8, up=(0, -1, 0)),
                  M['fang']), f'fang_{s}')
    # the wound: a spray of red over the face's left front, shown only as it is struck
    w = np.array(rest('wound')[:])
    rng = np.random.default_rng(3)
    spray = [blob(tuple(w + rng.normal(size=3) * (0.08, 0.04, 0.06)), (0.015,) * 3) for _ in range(24)]
    put(rigid('blood', blob_mesh('blood', spray, res=0.006), M['blood']), 'wound')
    return skins, parts


GROUPS = {('L', 0): 0, ('R', 1): 0, ('L', 2): 0, ('R', 3): 0, ('R', 0): 1, ('L', 1): 1, ('R', 2): 1, ('L', 3): 1}


def walk(frame, n=8):
    """The alternating tetrapod: four legs swing forward lifted while the other four push back on the ground."""
    rot = {}
    for (s, k), g in GROUPS.items():
        ph = 2 * math.pi * (frame / n + 0.5 * g)
        rot.update(LEGS[s, k].turn(swing=14 * math.cos(ph), raise_=10 * max(0.0, math.sin(ph))))
    rot['thorax'] = (0, 0, 3 * math.sin(2 * math.pi * frame / n))
    rot['abdomen'] = (2 * math.sin(4 * math.pi * frame / n), 0, -3 * math.sin(2 * math.pi * frame / n))
    return rot


# the strike: braced, the abdomen tipping up as it gathers, then the lunge nose down with the forelegs reaching
# forward and low and the chelicerae spread, as Daggerfall's is. Each frame's pitch, the forelegs', the second pair's
# and the chelicerae's turns
ATTACK = [(0, 0, 0, 0), (2, 5, 0, 10), (-4, 8, 4, 20), (-4, 6, 2, 25), (14, -10, -5, 20), (20, -20, -8, 5)]


def attack(frame, n=6):
    pitch, fore, mid, fang = ATTACK[frame]
    rot = {'thorax': (pitch, 0, 0), 'abdomen': (-pitch * 0.6 + 8 * (frame >= 2), 0, 0)}
    for s in 'LR':
        x = 1.0 if s == 'L' else -1.0
        reach = 20 if frame >= 4 else 0
        rot.update(LEGS[s, 0].turn(swing=fore * 0.3 + reach, raise_=fore - 10 * (frame >= 4), knee=-fore * 0.4))
        rot.update(LEGS[s, 1].turn(raise_=mid, knee=-mid * 0.3))
        rot.update(LEGS[s, 2].turn(raise_=-pitch * 0.5))
        rot.update(LEGS[s, 3].turn(raise_=-pitch * 0.8))
        rot[f'fang_{s}'] = (fang, 0, -fang * 0.5 * x)
    return rot


def hurt(frame, n=1):
    rot = {'thorax': (-6, 0, 4), 'abdomen': (4, 0, -6)}
    for (s, k) in GROUPS:
        rot.update(LEGS[s, k].turn(raise_=12 if k < 2 else 4, knee=8))
    return rot


def idle(frame, n=1):
    rot = {'thorax': (2, 0, 0)}
    for (s, k) in GROUPS:
        rot.update(LEGS[s, k].turn(raise_=-4, knee=4))
    return rot


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt, 'idle': idle}


def pose_for(anim, frame, yaw, adj=None):
    adj = adj or {}
    rot = ANIMS[anim](frame)
    for j, d in adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(SKELETON, rot, yaw=yaw + adj.get('turn', 0.0), scales={'wound': 1.0 if anim == 'hurt' else 0.0})
    ground(p, LEGS.values())
    p.root_loc.z += adj.get('lift', 0.0)
    return p


_LEG_P = [p for leg in LEGS.values() for p in leg.params()]
_BODY_P = [('thorax', 0, 5), ('thorax', 1, 4), ('thorax', 2, 5), ('abdomen', 0, 6), ('abdomen', 2, 6)]
PARAMS = {a: _BODY_P + _LEG_P for a in ('walk', 'hurt', 'idle')}
PARAMS['attack'] = _BODY_P + _LEG_P + [('fang_L', 0, 8), ('fang_R', 0, 8)]
