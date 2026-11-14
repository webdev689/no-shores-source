"""The giant scorpion (TEXTURE.275): an armoured hunter over five metres from claw to sting. A long flat body of plated
segments rides a metre off the ground on eight angular legs, their knees high and their tibias dropping straight to a
foot; two heavy pincers are carried wide and low on level arms, their two fingers apart, and a tail of five segments
and a hooked sting arches up behind it and strikes forward over the head. Every part is the same burnt orange,
patched dark and glinting. The legs and the tail are skinned along their own bones; the body, the arms and the claws
are rigid.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the scorpion faces -Y). The game shows every
one of its records flipped (seed.mjs `flipsInverted`), so its specs mark each side view `mirror`."""
import math

import numpy as np
from mathutils import Vector

import hides
import materials
from arthropod import Leg, ground
from beastkit import Piece, Pose, Skeleton, Skin, chain_weights, hang, rigid, tube
from body import blob, blob_mesh

BODY_Z = 0.8
LEG_BEARING = (55.0, 80.0, 102.0, 125.0)
LEG_ROOT_Y = (-0.55, -0.22, 0.12, 0.45)
LEG_RADII = ((0.0, 0.1), (0.4, 0.08), (0.43, 0.09), (0.75, 0.07), (0.78, 0.075), (0.9, 0.06), (1.0, 0.04))
# Daggerfall's legs are table legs: the femur out and up to a knee over a metre high, the tibia straight down, a toe
LEGS = {(s, k): Leg(f'{s}{k}', s, 'body', (0.26 * (1 if s == 'L' else -1), LEG_ROOT_Y[k], BODY_Z - 0.08),
                    LEG_BEARING[k], (0.95, 0.85, 0.3), rise=0.55, fall=0.98, reach=0.18, radii=LEG_RADII)
        for s in 'LR' for k in range(4)}
TAIL = 6   # five segments and the sting's bulb
TAIL_STEP = 0.36

JOINTS = {
    'root': (None, (0.0, 0.0, 0.0)),
    'body': ('root', (0.0, 0.0, BODY_Z)),
    'wound': ('body', (0.1, -1.2, BODY_Z + 0.12)),
}
for k in range(TAIL):   # the tail at rest runs back low, a little rising: its keys arch it up
    JOINTS[f'tail_{k}'] = ('body' if k == 0 else f'tail_{k - 1}',
                           (0.0, 1.25 + TAIL_STEP * 0.95 * k, BODY_Z + 0.08 + TAIL_STEP * 0.3 * k))
for s in 'LR':
    x = 1.0 if s == 'L' else -1.0
    JOINTS.update({
        f'arm_{s}': ('body', (0.3 * x, -1.15, BODY_Z - 0.02)),
        f'wrist_{s}': (f'arm_{s}', (1.0 * x, -1.45, BODY_Z - 0.18)),
        f'claw_{s}': (f'wrist_{s}', (1.05 * x, -2.15, BODY_Z - 0.18)),
    })
for leg in LEGS.values():
    JOINTS.update(leg.joints())
SKELETON = Skeleton(JOINTS)
# the body: the head's shield and seven plated segments, flat and broad, tapering into the tail
BODY_PATH = [(0, -1.32, BODY_Z), (0, -0.9, BODY_Z + 0.02), (0, 0.0, BODY_Z + 0.05), (0, 0.9, BODY_Z + 0.04),
             (0, 1.32, BODY_Z + 0.06)]
BODY = [(0.0, 0.14, 0.08, 0.06), (0.1, 0.30, 0.14, 0.12), (0.4, 0.38, 0.19, 0.16), (0.7, 0.36, 0.18, 0.15),
        (0.92, 0.22, 0.13, 0.11), (1.0, 0.15, 0.09, 0.08)]


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        # orange plate patched with dark brown a few pixels across, glinting yellow where the light catches it
        'shell': hides.hide('shell', (0.09, 0.03, 0.007), (0.3, 0.11, 0.03), mottle=6.0, grain=30.0, grain_share=0.25,
                            relief=0.25, relief_scale=40.0, rough=0.25, spec=0.8, soft=0.16),
        'sting': materials.plain('sting', (0.05, 0.02, 0.008), rough=0.25, spec=0.7),
        'blood': materials.plain('blood', (0.35, 0.0, 0.0), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    return mats


# colour classes in the reference (`ref_class`): 1 dark, 2 the shell's orange
CLASS = {'shell': 2}
GRADE_RGB = ('shell',)   # lit orange and deep shadow alike: graded onto every pixel under it


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(r > g + 20) & (g > b) & (r > 70)] = 2
    return out


def build(M):
    """The scorpion's meshes: (skins, rigid parts as (object, joint))."""
    skins, parts = [], []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    for leg in LEGS.values():
        skins.append(leg.skin(SKELETON, M['shell'], n=10))
        for at, joint in ((leg.knee, f'knee_{leg.name}'), (leg.ankle, f'ankle_{leg.name}')):   # a knob at each joint
            put(rigid(f'knob_{joint}', blob_mesh(f'knob_{joint}', [blob(at[:], (0.058, 0.058, 0.058))], res=0.01),
                      M['shell']), joint)
    sk = Skin(SKELETON, 'body', tube('body', BODY_PATH, BODY, n=32), M['shell'], ['body'], None)
    sk.pieces = [Piece('body', None, None, BODY_PATH, rows=[r[0] for r in BODY])]
    skins.append(sk)
    # the tail: five beaded segments, tapering, and the sting's bulb, skinned along its bones
    pts = [(0, 1.1, BODY_Z + 0.04)] + [rest(f'tail_{k}')[:] for k in range(TAIL)]
    end = rest(f'tail_{TAIL - 1}') + Vector((0, 0.18, 0.06))
    pts.append(end[:])
    beads = []
    for i in range(TAIL + 1):   # each segment swells between its joints; the last is the sting's round bulb
        t0, t1 = i / (TAIL + 1), (i + 1) / (TAIL + 1)
        r = 0.13 - 0.012 * i if i < TAIL else 0.09
        beads += [(t0 + 0.02, r * 0.75), ((t0 + t1) / 2, r), (t1 - 0.01, r * 0.8)]
    rows = [(t, r, r, r) for t, r in beads]
    tail_me = tube('tail', pts, rows, n=16)
    joints = ['body'] + [f'tail_{k}' for k in range(TAIL)]
    w = chain_weights(np.array([v.co[:] for v in tail_me.vertices]), pts, 0.04)
    tail = Skin(SKELETON, 'tail', tail_me, M['shell'], joints, w)
    tail.pieces = [Piece('tail', None, None, pts)]
    skins.append(tail)
    # the sting: a barb off the bulb's tip, hooking forward toward the head
    b0 = end
    barb = tube('sting', [b0[:], (b0 + Vector((0, -0.08, 0.06)))[:], (b0 + Vector((0, -0.16, 0.0)))[:]],
                [(0.0, 0.035, 0.035, 0.035), (0.5, 0.025, 0.025, 0.025), (1.0, 0.004, 0.004, 0.004)], n=10)
    put(rigid('sting', barb, M['sting']), f'tail_{TAIL - 1}')
    for s in 'LR':   # each pincer: a level arm out to the side, a heavy palm, a fixed finger and a moving one apart
        x = 1.0 if s == 'L' else -1.0
        a, w_, c = rest(f'arm_{s}'), rest(f'wrist_{s}'), rest(f'claw_{s}')
        arm = tube(f'arm_{s}', [a[:], ((a + w_) / 2 + Vector((0.0, 0, -0.03)))[:], w_[:]],
                   [(0.0, 0.08, 0.08, 0.08), (0.5, 0.075, 0.075, 0.075), (1.0, 0.07, 0.07, 0.07)], n=12)
        put(rigid(f'arm_{s}', arm, M['shell']), f'arm_{s}')
        hand = tube(f'hand_{s}', [w_[:], (w_ + (c - w_) * 0.5)[:], c[:]],
                    [(0.0, 0.1, 0.09, 0.09), (0.35, 0.2, 0.17, 0.15), (0.7, 0.18, 0.15, 0.14), (1.0, 0.1, 0.08, 0.08)],
                    n=16)
        put(rigid(f'hand_{s}', hand, M['shell']), f'wrist_{s}')
        for k, (side, joint) in enumerate(((0.045, f'wrist_{s}'), (-0.045, f'claw_{s}'))):   # fixed, then moving
            base = c + Vector((side * x, 0, 0))
            finger = tube(f'finger_{s}{k}', [base[:], (base + Vector((side * x * 0.6, -0.25, 0.01)))[:],
                                              (base + Vector((-side * x * 0.4, -0.5, 0.0)))[:]],
                          [(0.0, 0.065, 0.065, 0.065), (0.5, 0.045, 0.045, 0.045), (1.0, 0.01, 0.01, 0.01)], n=10)
            put(rigid(f'finger_{s}{k}', finger, M['shell']), joint)
    # the wound: a spray of red over the front of the body, shown only as it is struck
    w0 = np.array(rest('wound')[:])
    rng = np.random.default_rng(5)
    spray = [blob(tuple(w0 + rng.normal(size=3) * (0.12, 0.06, 0.05)), (0.02,) * 3) for _ in range(18)]
    put(rigid('blood', blob_mesh('blood', spray, res=0.008), M['blood']), 'wound')
    return skins, parts


GROUPS = {('L', 0): 0, ('R', 1): 0, ('L', 2): 0, ('R', 3): 0, ('R', 0): 1, ('L', 1): 1, ('R', 2): 1, ('L', 3): 1}


def _tail(curl, lift=0.0, sway=0.0):
    """The tail's bones: its root lifted `lift` degrees, each segment after curled `curl` degrees up and over."""
    out = {'tail_0': (lift, 0, sway)}
    for k in range(1, TAIL):
        out[f'tail_{k}'] = (curl, 0, sway * 0.4)
    return out


def _tail_keys(lift, *bends):
    """The tail keyed joint by joint: its root lifted `lift` degrees, each segment after bent by its own."""
    out = {'tail_0': (lift, 0, 0)}
    for k, b in enumerate(bends, 1):
        out[f'tail_{k}'] = (b, 0, 0)
    return out


def _claws(spread=0.0, raise_=0.0, nip=0.0):
    rot = {}
    for s in 'LR':
        x = 1.0 if s == 'L' else -1.0
        rot[f'arm_{s}'] = (-raise_, 0, spread * x)
        rot[f'wrist_{s}'] = (0, 0, -spread * 0.5 * x)
        rot[f'claw_{s}'] = (0, 0, (12 + nip) * x)   # the moving finger opened from the fixed one
    return rot


def walk(frame, n=5):
    rot = {}
    for (s, k), g in GROUPS.items():
        ph = 2 * math.pi * (frame / n + 0.5 * g)
        rot.update(LEGS[s, k].turn(swing=12 * math.cos(ph), raise_=8 * max(0.0, math.sin(ph))))
    rot['body'] = (4, 0, 2 * math.sin(2 * math.pi * frame / n))   # its head carried lower than its tail end
    rot.update(_tail(14, lift=0, sway=4 * math.sin(2 * math.pi * frame / n)))
    rot.update(_claws(spread=6, nip=8 * math.sin(2 * math.pi * frame / n)))
    return rot


# the sting: the tail arched up behind, curled up over the back, over the middle of the body, and the strike reaching
# forward over the head, the sting pointing down at its prey. Each frame's root lift and the five segments' bends
STRIKE = [(35, 15, 15, 15, 15, 20), (70, 30, 30, 20, 20, 20), (80, 45, 40, 25, 10, 0), (80, 60, 50, 15, 0, -20)]
REACH = [4, 4, 10, 10]   # the body's pitch, nose down, frame by frame


def attack(frame, n=4):
    rot = {'body': (REACH[frame], 0, 0)}
    for (s, k) in GROUPS:
        rot.update(LEGS[s, k].turn(raise_=-4))
    rot.update(_tail_keys(*STRIKE[frame]))
    rot.update(_claws(spread=8 + 4 * frame, raise_=-5, nip=6 + 4 * frame))
    return rot


def hurt(frame, n=1):
    rot = {'body': (7, 0, 3)}
    for (s, k) in GROUPS:
        rot.update(LEGS[s, k].turn(raise_=10 if k < 2 else 3, knee=8))
    rot.update(_tail(12, lift=55, sway=6))
    rot.update(_claws(spread=14))
    return rot


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt}


def pose_for(anim, frame, yaw, adj=None):
    adj = adj or {}
    rot = ANIMS[anim](frame)
    for j, d in adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(SKELETON, rot, yaw=yaw + adj.get('turn', 0.0), scales={'wound': 1.0 if anim == 'hurt' else 0.0})
    ground(p, LEGS.values(), count=4)
    p.root_loc.z += adj.get('lift', 0.0)
    return p


def _pair(p):
    """A left leg's parameter tied to its right twin's as a mirrored pair (beastfit.pair)."""
    joint, axis, step = p
    return (f"{joint}|{joint.replace('_L', '_R')}", axis, step)


_LEG_P = [p for leg in LEGS.values() for p in leg.params()]
# in the strike and the hurt Daggerfall's scorpion is a mirror image of itself: its legs are fitted in pairs there
_LEG_PAIRED = [_pair(p) for leg in LEGS.values() if leg.side == 'L' for p in leg.params()]
_BODY_P = [('body', 0, 4), ('body', 1, 4), ('body', 2, 5)]
_TAIL_P = [(f'tail_{k}', a, 8) for k in range(TAIL) for a in (0, 2)]
_CLAW_P = [('arm_L|arm_R', 0, 4), ('arm_L|arm_R', 2, 8), ('wrist_L|wrist_R', 0, 6), ('wrist_L|wrist_R', 2, 8),
           ('claw_L|claw_R', 2, 8)]
PARAMS = {'walk': _BODY_P + _LEG_P + _TAIL_P + _CLAW_P}
PARAMS.update({a: _BODY_P + _LEG_PAIRED + _TAIL_P + _CLAW_P for a in ('attack', 'hurt')})
