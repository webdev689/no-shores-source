"""The slaughterfish (TEXTURE.266): a teal eel of a fish three and a half metres long, finely spotted and pale along
its back, its head a flat wedge with red eyes and fans of white spines at its cheeks, a low sail of rayed crest along
its back, and a mouth that drops open into a vast dark cavern rimmed with red gums and long pink teeth. Its body is
one tube skinned along a spine of five joints, anchored at its middle so the head and the tail each bend from it; the
lower jaw drops on its own joint; the teeth, the gums, the crest, the fins and the eyes are rigid on the joints they
ride. It swims: nothing grounds it.

Rotations are degrees about a joint's rest axes (+X left, +Y back, +Z up; the fish faces -Y): a turn about Z swings a
joint's part of the body aside, about X pitches it (nose down on +X)."""
import math

import numpy as np

import hides
import materials
from beastkit import Piece, Pose, Skeleton, Skin, chain_weights, cone, hang, rigid, tube, web, weights_over
from body import blob, blob_mesh

FLIES = True   # it hovers in the water: its place is fitted both ways (beastfit.flies)
Z = 1.0
SPINE_Y = (-1.2, -0.6, 0.0, 0.6, 1.2)   # body_0 (the head) to body_4 (the tail)
SNOUT, TAIL = -1.72, 1.78

JOINTS = {'root': (None, (0.0, 0.0, 0.0)), 'body_2': ('root', (0.0, SPINE_Y[2], Z))}
JOINTS['body_1'] = ('body_2', (0.0, SPINE_Y[1], Z))
JOINTS['body_0'] = ('body_1', (0.0, SPINE_Y[0], Z))
JOINTS['jaw'] = ('body_0', (0.0, -1.1, Z - 0.1))
JOINTS['wound'] = ('body_0', (0.22, -1.3, Z + 0.05))
JOINTS['body_3'] = ('body_2', (0.0, SPINE_Y[3], Z))
JOINTS['body_4'] = ('body_3', (0.0, SPINE_Y[4], Z))
SKELETON = Skeleton(JOINTS)
BODY_JOINTS = [f'body_{k}' for k in range(5)]
# the joint that carries each stretch of the body, snout to tail: the head forward of body_0, each stretch with the
# joint nearer the middle
OWNERS = ['body_0', 'body_1', 'body_2', 'body_2', 'body_3', 'body_4']
BODY_PATH = [(0, SNOUT, Z + 0.04)] + [(0, y, Z) for y in SPINE_Y] + [(0, TAIL, Z)]
# the head a flat wedge, low and widening from a pointed snout; the body thick on to the tail's fin
BODY = [(0.0, 0.05, 0.04, 0.05, -0.03), (0.05, 0.16, 0.12, 0.12, -0.03), (0.12, 0.26, 0.19, 0.18, -0.03),
        (0.2, 0.3, 0.23, 0.2), (0.25, 0.27, 0.25, 0.25), (0.5, 0.24, 0.22, 0.22), (0.75, 0.18, 0.17, 0.16),
        (0.92, 0.12, 0.11, 0.11), (1.0, 0.05, 0.05, 0.05)]


def rest(j):
    return SKELETON.rest(j)


def palette():
    mats = {
        # a pale teal finely spotted with dark dots, glossy
        # a glossy teal finely dotted dark, its back pale in a band blended in over 0.06 m
        'scale': hides.spotted('scale', ((0.1, 0.26, 0.27), (0.16, 0.36, 0.37)), (0.015, 0.05, 0.055),
                               band=((0.25, 0.32, 0.26), (0.35, 0.4, 0.3)), band_at=(Z + 0.11, Z + 0.17),
                               spots=14.0, size=0.5, share=0.5, rough=0.3, spec=0.7),
        'mouth': materials.plain('mouth', (0.05, 0.03, 0.022), rough=0.9, spec=0.05),
        'gum': materials.plain('gum', (0.35, 0.04, 0.03), rough=0.5, spec=0.3),
        'tooth': materials.plain('tooth', (0.65, 0.5, 0.48), rough=0.3, spec=0.6),
        'crest': materials.plain('crest', (0.16, 0.22, 0.1), rough=0.6, spec=0.2),
        'ray': materials.plain('ray', (0.3, 0.3, 0.32), rough=0.5, spec=0.3),
        'ridge': materials.plain('ridge', (0.5, 0.45, 0.2), rough=0.5, spec=0.3),
        'eye': materials.plain('eye', (0.45, 0.04, 0.02), rough=0.2, spec=0.8),
        'pupil': materials.plain('pupil', (0.01, 0.01, 0.01), rough=0.2, spec=0.8),
        'blood': materials.plain('blood', (0.4, 0.06, 0.01), rough=0.4, spec=0.5),
    }
    for name, f in materials.TINT.items():
        if name in mats:
            materials.tint(mats[name], f)
    return mats


# colour classes in the reference (`ref_class`): 1 shadow, 2 the scales' teal, 3 the gums' red, 4 the teeth
CLASS = {'scale': 2, 'gum': 3, 'tooth': 4}
GRADE_RGB = ('scale',)


def ref_class(rgb):
    r, g, b = (rgb[..., k].astype(int) for k in range(3))
    out = np.ones(rgb.shape[:-1], dtype=np.int8)
    out[(g > r + 15) & (b > r + 15) & (g > 50)] = 2
    out[(r > g + 25) & (r > b + 20) & (r > 50)] = 3
    out[(np.minimum(np.minimum(r, g), b) > 150)] = 4
    return out


def _body_weights(p):
    pts = [np.array(q) for q in BODY_PATH]
    return weights_over(BODY_JOINTS, OWNERS, chain_weights(p, pts, 0.15))


def _owner(y):
    """The joint that carries the body at `y`."""
    edges = [SNOUT] + list(SPINE_Y) + [TAIL]
    k = int(np.clip(np.searchsorted(edges, y) - 1, 0, len(OWNERS) - 1))
    return OWNERS[k]


def _top(y):
    """The body's top at `y`, its height over the spine."""
    return float(np.interp(y, [SNOUT, -1.6, -1.4, -1.2, -1.0, -0.6, 0.0, 0.6, 1.2, 1.6, TAIL],
                           [0.05, 0.095, 0.143, 0.188, 0.233, 0.246, 0.221, 0.19, 0.146, 0.093, 0.05]))


def _ray(name, root, tip, base=0.008):
    return cone(name, root, tip, base, 0.003, step=0.02)


def _fan(name, root, tips, mat_fin, mat_ray, put, joint):
    """A fin: a membrane fanned from `root` to each of `tips`, each tip on a ray."""
    put(rigid(name, web(name, [((root, a), (root, b)) for a, b in zip(tips, tips[1:])]), mat_fin), joint, 'body')
    for k, tip in enumerate(tips):
        put(rigid(f'{name}_ray{k}', _ray(f'{name}_ray{k}', root, tip), mat_ray), joint, 'body')


def build(M):
    """The fish's meshes: (skins, rigid parts as (object, joint))."""
    me = tube('body', BODY_PATH, BODY, n=40, step=0.015)   # a ring every 1.2 pixels at the nearest view
    for f in me.polygons:   # the palate dark: the cavern's roof
        c = f.center
        f.material_index = 1 if c.y < -1.12 and c.z < Z and f.normal.z < -0.3 else 0
    body = Skin(SKELETON, 'body', me, [M['scale'], M['mouth']], BODY_JOINTS,
                _body_weights(np.array([v.co[:] for v in me.vertices])))
    body.pieces = [Piece('body', None, None, BODY_PATH, rows=[r[0] for r in BODY])]
    parts = []

    def put(ob, joint, rides=None):
        hang(parts, SKELETON, ob, joint, rides)
    # the mouth: a dark cavern behind, the lower jaw a long broad trough hinged far back, both rims gummed and toothed
    put(rigid('maw', blob_mesh('maw', [blob((0, -1.22, Z - 0.06), (0.24, 0.05, 0.18))], res=0.01), M['mouth']),
        'body_0', 'body')
    jaw = tube('jaw', [(0, -1.1, Z - 0.1), (0, -1.4, Z - 0.15), (0, -1.7, Z - 0.16)],
               [(0.0, 0.3, 0.04, 0.04), (0.6, 0.27, 0.04, 0.04), (0.9, 0.18, 0.035, 0.035), (1.0, 0.1, 0.03, 0.03)],
               n=20, step=0.015)
    jaw.materials.append(M['scale'])
    jaw.materials.append(M['mouth'])
    for f in jaw.polygons:   # the trough's floor dark, inside the cavern
        f.material_index = 1 if f.normal.z > 0.3 else 0
    put(rigid('jaw', jaw), 'jaw', 'body')
    for joint, z, sign, path in (('body_0', Z - 0.05, -1, ((0.27, -1.2), (0.06, -1.7))),
                                 ('jaw', Z - 0.12, 1, ((0.28, -1.15), (0.07, -1.68)))):
        (x0, y0), (x1, y1) = path
        for x in (1, -1):
            gum = tube(f'gum_{joint}{x}', [(x0 * x, y0, z), (x1 * x, y1, z)], [(0.0, 0.03, 0.025, 0.025),
                                                                              (1.0, 0.02, 0.02, 0.02)], n=8,
                       up=(0, 0, 1), step=0.02)
            put(rigid(f'gum_{joint}{x}', gum, M['gum']), joint, 'body')
            for k in range(8):   # long teeth, the front ones longest, slanted in
                t = k / 7
                tx, ty = (x0 + (x1 - x0) * t) * x, y0 + (y1 - y0) * t
                length = 0.08 + 0.07 * t
                tip = (tx * 0.85, ty - 0.01, z + sign * length)
                put(rigid(f'tooth_{joint}{x}{k}', tube(f'tooth_{joint}{x}{k}', [(tx, ty, z), tip],
                                                       [(0.0, 0.022, 0.022, 0.022), (1.0, 0.003, 0.003, 0.003)], n=6,
                                                       up=(0, -1, 0), step=0.01), M['tooth']), joint, 'body')
    # the crest: a low sail of rayed membrane along the back, the rays standing clear of it, in stretches that ride
    # the joints under them
    rays = []
    for k in range(24):
        y = -1.2 + 2.8 * k / 23
        h = 0.12 + 0.14 * math.exp(-((y + 0.95) / 0.35) ** 2)   # tallest over the nape
        root = (0, y, Z + _top(y) - 0.02)
        rays.append((root, (0, y + 0.05, root[2] + h)))
        put(rigid(f'ray{k}', _ray(f'ray{k}', *rays[-1]), M['ray']), _owner(y), 'body')
    webs = [(r, tuple(np.add(r, np.subtract(t, r) * 0.6))) for r, t in rays]
    for k, (a, b) in enumerate(zip(webs, webs[1:])):
        put(rigid(f'crest{k}', web(f'crest{k}', [(a, b)], sag=0.25), M['crest']), _owner((a[0][1] + b[0][1]) / 2),
            'body')
    # the eyes, red with dark pupils, at the face's top corners; fans of white spines at the cheeks; the brow's ridge
    for x in (1, -1):
        put(rigid(f'eye_{x}', blob_mesh(f'eye_{x}', [blob((0.15 * x, -1.48, Z + 0.085), (0.035, 0.03, 0.035))],
                                         res=0.005), M['eye']), 'body_0', 'body')
        put(rigid(f'pupil_{x}', blob_mesh(f'pupil_{x}', [blob((0.165 * x, -1.505, Z + 0.09), (0.015, 0.01, 0.02))],
                                           res=0.004), M['pupil']), 'body_0', 'body')
        for k in range(4):
            a = math.radians(-30 + 20 * k)
            root = (0.24 * x, -1.45, Z + 0.04)
            tip = (root[0] + 0.14 * math.cos(a) * x, root[1] + 0.14 * math.sin(abs(a)) + 0.04, root[2] + 0.04 * k - 0.06)
            put(rigid(f'spine_{x}{k}', tube(f'spine_{x}{k}', [root, tip], [(0.0, 0.008, 0.008, 0.008),
                                                                           (1.0, 0.002, 0.002, 0.002)], n=6,
                                            up=(0, 0, 1), step=0.01), M['tooth']), 'body_0', 'body')
        # the pectoral fins, fans rooted on the flank, sweeping back and down
        root = (0.33 * x, -0.95, Z - 0.12)
        tips = [(root[0] + 0.1 * x, root[1] + 0.1 + 0.06 * k, root[2] - 0.22 + 0.06 * k) for k in range(5)]
        _fan(f'fin_{x}', root, tips, M['crest'], M['ray'], put, 'body_1')
    put(rigid('ridge', tube('ridge', [(0, -1.64, Z + 0.08), (0, -1.36, Z + 0.148)], [(0.0, 0.015, 0.01, 0.01),
                                                                                  (1.0, 0.015, 0.01, 0.01)], n=6,
                            up=(0, 0, 1), step=0.02), M['ridge']), 'body_0', 'body')
    # the tail's fin: a rayed fan spreading above and below its end
    root = (0, TAIL - 0.08, Z)
    tips = [(0, TAIL + 0.2 + 0.05 * math.cos(math.pi * (k - 4) / 8), Z + 0.24 - 0.06 * k) for k in range(9)]
    _fan('tailfin', root, tips, M['crest'], M['ray'], put, 'body_4')
    put(rigid('blood', blob_mesh('blood', [blob(rest('wound')[:], (0.05, 0.08, 0.05))], res=0.01), M['blood']),
        'wound', 'body')
    return [body], parts


def _swim(phase, amp=1.0):
    """The body's undulation at a share `phase` of a stroke: each joint swung aside a little later than the one before
    it, harder toward the tail."""
    rot = {}
    for k, gain in zip(range(5), (12, 10, 8, 18, 28)):
        rot[f'body_{k}'] = (0, 0, amp * gain * math.sin(2 * math.pi * phase - 0.9 * k))
    return rot


def walk(frame, n=6):
    rot = _swim(frame / n)
    rot['jaw'] = (55, 0, 0)   # it swims gaping, as Daggerfall's does
    return rot


JAW = [0, 15, 35, 55, 75, 80, 75, 55, 30, 8]   # the bite's gape over its ten frames


def attack(frame, n=10):
    rot = _swim(frame / n, 0.5)
    rot['jaw'] = (JAW[frame], 0, 0)
    lift = -10 if 4 <= frame <= 6 else 0   # the head lifts as the jaws open widest
    rot['body_0'] = (lift - JAW[frame] * 0.05, 0, rot['body_0'][2])
    return rot


def hurt(frame, n=1):
    # it curls sideways into a U: the head still faces the viewer, mouth agape, the body turned off to its left and
    # the tail coming round, the back humped
    return {'body_0': (-10, 0, 0), 'body_1': (0, 0, 60), 'body_2': (0, 0, -60), 'body_3': (-10, 0, -30),
            'body_4': (-15, 0, -30), 'jaw': (60, 0, 0)}


ANIMS = {'walk': walk, 'attack': attack, 'hurt': hurt}


def pose_for(anim, frame, yaw, adj=None):
    adj = adj or {}
    rot = ANIMS[anim](frame)
    for j, d in adj.get('rot', {}).items():
        rot[j] = tuple(a + b for a, b in zip(rot.get(j, (0, 0, 0)), d))
    p = Pose(SKELETON, rot, yaw=yaw + adj.get('turn', 0.0), scales={'wound': 1.0 if anim == 'hurt' else 0.0})
    p.root_loc.z += adj.get('lift', 0.0)
    return p


PARAMS = {a: [(f'body_{k}', ax, 6) for k in range(5) for ax in (0, 2)] + [('body_2', 1, 6), ('jaw', 0, 8)]
          for a in ANIMS}
