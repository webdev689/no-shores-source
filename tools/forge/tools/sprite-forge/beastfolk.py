"""The beast races on the forge's bodies: the Khajiit and the Argonian, each the bare body (layers.py `Bare`) with a head,
hands, feet and a tail of its own, in Daggerfall's own colours (specs/beast-skins.json, raceskins.mjs: its paper-doll
bodies BODY<gender>6I0.IMG and BODY<gender>7I0.IMG). Each is one layer, `body_<race>`, drawn in place of the bare body.

- the head: the Khajiit's ears and short muzzle, the Argonian's long snout and the frills swept back off its skull
- the legs: digitigrade, the heel raised high behind a long instep, the weight on the toes; claws on toes and fingers
- the tail: hung off the small of the back, swung each frame by the hips' turn and the legs' stride, and laid down
  with the body when it falls (`Beast.place`)
- the hide: the Khajiit's fur flecked, the Argonian's scales, its belly in yellow ribs from the throat to the groin"""
import contextlib
import json
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

import anatomy
import fabric
import materials
import model
import shape
from body import blob, blob_mesh, bone, coords, seg
from gear import hang
from rig import rest

HERE = os.path.dirname(os.path.abspath(__file__))
SKINS = os.path.join(HERE, 'specs', 'beast-skins.json')
RACES = ('khajiit', 'argonian')
# each race's body; its body under a helm or a raised hood, no ear standing through it and its frills laid close
# under it; and its own face in a helm's shade and in a hood's, in place of a man's (forgeLayers.js `beastOf`)
LAYERS = tuple(name for race in RACES
               for name in (f'body_{race}', f'body_{race}_helmed', f'face_{race}', f'face_hooded_{race}'))
FRILL_HELMED = 0.0   # an Argonian's frills under a helm: none, so none stands out of its back
F = -1   # a painted mark on the body's front (materials.py `paint`)


def materials_():
    """The beast hides' and claws' material names, which the grade and the raster read."""
    return ('khajiitfur', 'khajiitclaw', 'argonianhide', 'argonianbelly', 'argonianclaw')


# --- the heads: blobs about the bald head's own place (anatomy.HEAD), the face toward -Y

def _ears(f):
    """A cat's ears: tall, pointed, set high on the skull and leaning out."""
    out = []
    for x in (1.0, -1.0):
        base, mid, tip = (0.046 * x, -0.014, 1.748), (0.056 * x, -0.008, 1.79), (0.066 * x, -0.002, 1.832)
        out += [seg(base, mid, 0.024 * f, 0.011), seg(mid, tip, 0.013 * f, 0.009)]
    return out


def khajiit_head(f=1.0, ears=True):
    """The Khajiit's: a cat's skull, the cheeks ruffed, a short muzzle with its nose pad and whisker pads, the ears
    (none under a helm)."""
    return [blob((0, -0.028, 1.692), (0.074 * f, 0.088 * f, 0.086 * f)),          # the skull
            blob((0, -0.062, 1.632), (0.06 * f, 0.062 * f, 0.06 * f)),             # the face
            blob((0, -0.108, 1.606), (0.033 * f, 0.04 * f, 0.027 * f)),            # the muzzle
            blob((0, -0.141, 1.62), (0.013, 0.011, 0.01)),                         # the nose pad
            *[blob((0.017 * x, -0.128, 1.598), (0.016, 0.014, 0.013)) for x in (1, -1)],   # the whisker pads
            blob((0, -0.098, 1.574), (0.024 * f, 0.03, 0.015)),                    # the chin
            *[blob((0.054 * x * f, -0.07, 1.6), (0.024, 0.03, 0.034)) for x in (1, -1)],   # the ruffs
            blob((0, -0.1, 1.664), (0.046 * f, 0.016, 0.012)),                     # the brow
            *(_ears(f) if ears else [])]


def argonian_head(f=1.0, frill=1.0):
    """The Argonian's: a flat skull, a long snout and jaw, ridged brows, and frills swept back off the skull's crown
    and sides (`frill` their length)."""
    def back(a, b, r):   # a frill from a on the skull toward b, `frill` of the way
        a, b = Vector(a), Vector(b)
        return seg(a, a + (b - a) * frill, r, r * 0.8)
    return [blob((0, -0.02, 1.688), (0.066 * f, 0.084 * f, 0.07 * f)),            # the skull
            blob((0, -0.085, 1.632), (0.05 * f, 0.07, 0.045 * f)),                 # the snout's root
            blob((0, -0.14, 1.618), (0.034 * f, 0.05, 0.03 * f)),                  # the snout
            blob((0, -0.176, 1.612), (0.024 * f, 0.022, 0.02 * f)),                # its tip
            blob((0, -0.1, 1.586), (0.042 * f, 0.075, 0.02)),                      # the lower jaw
            *[blob((0.036 * x * f, -0.07, 1.672), (0.022, 0.03, 0.013)) for x in (1, -1)],   # the brow ridges
            *[blob((0.05 * x * f, -0.03, 1.605), (0.03, 0.05, 0.035)) for x in (1, -1)],     # the jowls
            *[back((0.035 * x, 0.045, 1.72), (0.06 * x, 0.14, 1.67), 0.012) for x in (1, -1)],
            *[back((0.05 * x, 0.03, 1.685), (0.085 * x, 0.12, 1.61), 0.011) for x in (1, -1)],
            back((0, 0.05, 1.745), (0, 0.15, 1.72), 0.011)]


# --- the feet: digitigrade, about the bare foot's own place (anatomy.foot)

def paw(toes, length, reach):
    """A digitigrade foot: the heel raised to a hock behind the ankle, a long instep falling forward from it to the
    ball's pad, and `toes` toes off the ball, `length` long, splayed across `reach`."""
    def foot(x):
        s = 1.0 if x > 0 else -1.0
        X = 0.11 * s
        parts = [blob((X, 0.038, 0.15), (0.026, 0.026, 0.032))]                    # the hock
        for k in range(9):   # the instep, from the hock down and forward to the ball
            t = k / 8
            parts.append(blob((X + 0.002 * t * s, 0.036 - 0.118 * t, 0.145 - 0.12 * t),
                              (0.028 + 0.008 * t, 0.021 + 0.004 * t, 0.03 - 0.008 * t), stiffness=1.6))
        parts.append(blob((X, -0.088, 0.02), (0.036, 0.03, 0.02)))               # the ball's pad
        for o in np.linspace(-reach, reach, toes):
            parts.append(bone((X + o * s, -0.1, 0.019), (X + o * 1.3 * s, -0.1 - length, 0.011), 0.0105, 0.45, 0.05, 0.9))
        return parts
    return foot


def toe_tips(toes, length, reach, x):
    """Each toe's tip and its way, at rest (`paw`)."""
    s = 1.0 if x > 0 else -1.0
    out = []
    for o in np.linspace(-reach, reach, toes):
        a = Vector((0.11 * s + o * s, -0.1, 0.019))
        b = Vector((0.11 * s + o * 1.3 * s, -0.1 - length, 0.011))
        out.append((b, (b - a).normalized()))
    return out


# --- the tails: a curve hung from the small of the back, in the body's own frame (+Y its back), and its girth

TAIL = {
    # the Khajiit's: thin, falling behind the legs and curling up at its end, as Daggerfall draws it
    'khajiit': {'curve': [(0, 0.0, 0.0), (0, 0.06, -0.1), (0, 0.11, -0.24), (0, 0.13, -0.4), (0, 0.12, -0.54),
                          (0, 0.11, -0.66), (0, 0.15, -0.75), (0, 0.2, -0.76), (0, 0.23, -0.71)],
                'girth': (0.028, 0.014), 'sway': 1.4, 'stride': 0.35, 'spines': 0},
    # the Argonian's: thick at its root, tapering to the ground behind, a ridge of spines along its top
    'argonian': {'curve': [(0, 0.0, 0.0), (0, 0.08, -0.12), (0, 0.16, -0.3), (0, 0.23, -0.46), (0, 0.3, -0.6),
                           (0, 0.38, -0.72), (0, 0.47, -0.8), (0, 0.56, -0.84), (0, 0.65, -0.85)],
                 'girth': (0.06, 0.012), 'sway': 1.0, 'stride': 0.25, 'spines': 9},
}
TAIL_SAMPLES = 40


def _curve(points, n):
    """`points` resampled to `n` evenly along their length: (points, each one's share of the way)."""
    p = np.asarray(points, dtype=np.float64)
    d = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
    t = np.linspace(0.0, d[-1], n)
    return np.stack([np.interp(t, d, p[:, c]) for c in range(3)], axis=1), t / d[-1]


def tail_blobs(race, root):
    """A tail's blobs at rest: its girth tapering along its curve from `root`, and its spines."""
    spec = TAIL[race]
    pts, share = _curve(spec['curve'], TAIL_SAMPLES)
    pts = pts + np.asarray(root)
    r0, r1 = spec['girth']
    n = len(pts)   # each piece over three samples, so they run into one another with no neck between them
    out = [seg(pts[max(0, k - 1)], pts[min(n - 1, k + 2)], r0 + (r1 - r0) * share[k]) for k in range(n - 1)]
    for k in np.linspace(2, TAIL_SAMPLES * 0.6, spec['spines']).astype(int):   # each spine off the top, leaning back
        a = Vector(pts[k])
        r = r0 + (r1 - r0) * share[k]
        out.append(seg(a + Vector((0, 0, r * 0.6)), a + Vector((0, 0.025, r + 0.024)), 0.006, 0.004))
    return out


# --- the hides

def _skins():
    return json.load(open(SKINS))


def grades(body):
    """Each hide's grade in every view: the bare skin's brightness at its shares (the body's `skin@<view>`) onto the
    race's own colour at that share of its body, as Daggerfall paints it."""
    import forge
    skins = _skins()[body]
    out = {}
    for name, ramp in (('khajiitfur', skins['khajiit']['hide']), ('argonianhide', skins['argonian']['hide']),
                       ('argonianbelly', skins['argonian']['belly'])):
        for v in range(5):
            g = forge.GRADE.get(f'skin@{v}') or forge.GRADE.get('skin')
            src = g['ramp'][0]
            n = len(src)
            out[f'{name}@{v}'] = {'ramp': [src, [ramp[min(len(ramp) - 1, int((i + 0.5) / n * len(ramp)))]
                                                 for i in range(n)]]}
    return out


def _ribbed(name, rgb, bands):
    """An Argonian's belly: plates in rows across it, each a band with a dark seam under it."""
    m, b = materials._principled(name, rgb, 0.0, 0.7, 0.2)
    nt = m.node_tree
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type, wave.bands_direction, wave.wave_profile = 'BANDS', 'Z', 'SAW'
    wave.inputs['Scale'].default_value = bands / 6.0
    wave.inputs['Distortion'].default_value = 0.0
    nt.links.new(materials._coords(m, (1.0, 1.0, 1.0)), wave.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[0].color = 0.15, (*(c * 0.35 for c in rgb), 1)
    ramp.color_ramp.elements[1].position, ramp.color_ramp.elements[1].color = 0.35, (*rgb, 1)
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


HIDE = {   # each race's hide before its grade: as bright as the bare skin, so the grade's shares fall alike
    'khajiit': {'name': 'khajiitfur', 'rgb': (0.5, 0.16, 0.04), 'mottle': 0.12, 'scale': 45.0,
                'claw': ('khajiitclaw', (0.2, 0.15, 0.1))},
    'argonian': {'name': 'argonianhide', 'rgb': (0.15, 0.46, 0.1), 'mottle': 0.16, 'scale': 70.0,
                 'claw': ('argonianclaw', (0.05, 0.045, 0.04))},
}
# a Khajiit's chest, belly and inner arms paler, as Daggerfall's are
KHAJIIT_PAINT = [(0.0, 1.2, 0.07, 0.3, -0.25, F, 1), (0.0, 0.92, 0.05, 0.08, -0.2, F, 1)]


def _patterned(m, race):
    """The hide's pattern (fur's flecks, the scales) under the painted lines (materials.py `paint`), in place of its
    one colour."""
    h = HIDE[race]
    nt = m.node_tree
    N = fabric._Nodes(m)
    pattern = fabric._mottle(N, h['rgb'], h['mottle'], h['scale'])
    scale = next((n for n in nt.nodes if n.type == 'VECT_MATH' and n.operation == 'SCALE'), None)
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    nt.links.new(pattern, scale.inputs[0] if scale else b.inputs['Base Color'])


@contextlib.contextmanager
def built_as(race, body, helmed=False):
    """Build the bare body as `race`'s: its head (`helmed`, as it lies under a helm or a hood), its legs' feet, no
    man's ears, its hide in place of the skin and its own painted lines. Everything put back after."""
    use, pal, foot = anatomy.use, materials.palette, anatomy.foot
    h = HIDE[race]
    woman = body == 'female'

    def use_beast(b):
        use(b)
        frill = (0.7 if woman else 1.0) * (FRILL_HELMED if helmed else 1.0)
        anatomy.HEAD[:] = (khajiit_head(0.94 if woman else 1.0, ears=not helmed) if race == 'khajiit'
                           else argonian_head(0.94 if woman else 1.0, frill))
        # the shin thins to the hock, which the foot carries: the ankle's column under it goes
        anatomy.LEG[:] = [(z, a * k, f * k, bb * k) for z, a, f, bb in anatomy.LEG
                          for k in [float(np.interp(z, [0.05, 0.09, 0.14, 0.24], [0.3, 0.45, 0.8, 1.0]))]]
        if race == 'khajiit':
            anatomy.PAINT_NOW[:] = list(anatomy.PAINT_NOW) + KHAJIIT_PAINT

    def palette():
        M = pal()
        M['skin'] = materials.plain(h['name'], h['rgb'], rough=0.95, spec=0.05)
        return M
    toes = (4, 0.04, 0.024) if race == 'khajiit' else (3, 0.075, 0.024)
    anatomy.use, materials.palette, anatomy.foot = use_beast, palette, paw(*toes)
    anatomy.EARS[0] = False
    try:
        yield toes
    finally:
        anatomy.use, materials.palette, anatomy.foot = use, pal, foot
        anatomy.EARS[0] = True


def _merge(ob, extra, mat):
    """Lay mesh `extra` (in `ob`'s own space) into `ob`'s mesh in material `mat`."""
    me = ob.data
    if mat.name not in [m.name for m in me.materials]:
        me.materials.append(mat)
    slot = [m.name for m in me.materials].index(mat.name)
    bm = bmesh.new()
    bm.from_mesh(me)
    n0 = len(bm.faces)
    bm.from_mesh(extra)
    bm.faces.ensure_lookup_table()
    for f in bm.faces[n0:]:
        f.material_index = slot
    bm.to_mesh(me)
    bm.free()
    me.update()


def _claw(tip, way, down, length, r):
    """A claw off a tip: out along `way`, hooked toward `down`."""
    tip, way, down = Vector(tip), Vector(way).normalized(), Vector(down).normalized()
    mid = tip + way * length * 0.55 + down * length * 0.1
    end = tip + way * length + down * length * 0.45
    return [seg(tip - way * r * 0.3, mid, r, r * 0.9), seg(mid, end, r * 0.55, r * 0.5)]


class Beast:
    """Mixed into the bare body (layers.py `Bare`): a beast race's body, hands and feet clawed, a tail."""

    def beast(self, race, body, toes):
        self.race = race
        h = HIDE[race]
        claw = materials.plain(h['claw'][0], h['claw'][1], rough=0.4, spec=0.4)
        self.M[h['claw'][0]] = claw
        b = self.skins[0]
        _patterned(self.M['skin'], race)
        if race == 'argonian':   # the belly's ribs from the throat to the groin, on the front
            belly = _ribbed('argonianbelly', (0.3, 0.3, 0.05), 30.0)
            self.M['argonianbelly'] = belly
            b.me.materials.append(belly)
            piece = np.array(anatomy.PIECES)[np.argmax(b.alpha, axis=1)]
            torso = set(np.nonzero(piece == 'torso')[0].tolist())
            width = [0.03, 0.05, 0.068, 0.07, 0.05, 0.03] if body == 'male' else [0.028, 0.045, 0.06, 0.055, 0.04, 0.026]

            def pick(c):
                z = c[2]
                cy = anatomy.torso_centre(z)[1]
                w = float(np.interp(z, [0.86, 0.98, 1.2, 1.36, 1.46, 1.55], width))
                return int(0.86 < z < 1.55 and abs(c[0]) < w and c[1] < cy - 0.02)
            idx = [pick(np.array(f.center)) if any(v in torso for v in f.vertices) else 0 for f in b.me.polygons]
            b.me.polygons.foreach_set('material_index', idx)
        # each finger's and thumb's claw, laid into the hand's own mesh
        for s, x in (('L', 1.0), ('R', -1.0)):
            P = model.hand_frame(x)
            palm = Vector(P(-1.0, 0, 0)) - Vector(P(0, 0, 0))
            for kind, closed in (('open', False), ('fist', True)):
                fingers, thumb = model.hand_bones(x, closed)
                blobs = []
                for a, bb, r in [bones[-1] for bones in fingers] + [thumb[-1]]:
                    way = Vector(bb) - Vector(a)
                    blobs += _claw(Vector(bb) + way.normalized() * r * 0.4, way, palm, 0.016, 0.0045)
                me = blob_mesh(f'claws_{s}_{kind}', blobs, res=0.0015)
                p = shape.transform(f'hand_{s}', coords(me) - np.array(rest(f'hand_{s}')))
                me.vertices.foreach_set('co', p.ravel())
                _merge(self.hands[s][kind], me, claw)
                bpy.data.meshes.remove(me)
            # the toes' claws, on the foot
            blobs = []
            for tip, way in toe_tips(*toes, x):
                blobs += _claw(tip + way * 0.008, way, Vector((0, 0, -1)), 0.016 if race == 'argonian' else 0.011, 0.004)
            me = blob_mesh(f'toeclaws_{s}', blobs, res=0.0015)
            ob = bpy.data.objects.new(f'toeclaws_{s}', me)
            bpy.context.scene.collection.objects.link(ob)
            me.materials.append(claw)
            hang(self.parts, ob, f'foot_{s}')
        # the tail, from the small of the back as the body is shaped there
        back = b.rest[(np.abs(b.rest[:, 0]) < 0.02) & (np.abs(b.rest[:, 2] - 0.9) < 0.02)]
        self.tail_root = Vector((0.0, float(back[:, 1].max()) - 0.012, 0.9))
        me = blob_mesh('tail', tail_blobs(race, self.tail_root), res=0.004)
        me.materials.append(self.M['skin'])
        self.tail = bpy.data.objects.new('tail', me)
        bpy.context.scene.collection.objects.link(self.tail)
        attr = me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT')
        attr.data.foreach_set('vector', coords(me).astype(np.float32).ravel())
        self.tail_rest = coords(me)
        pts, share = _curve(TAIL[race]['curve'], TAIL_SAMPLES)
        pts = pts + np.array(self.tail_root)
        near = np.argmin(((self.tail_rest[:, None, :] - pts[None]) ** 2).sum(axis=2), axis=1)
        self.tail_share = share[near]

    def pose_tail(self, pose, W):
        """The tail as the body stands: hung from the small of the back, turned with the hips' heading; swung against
        the hips' turn and with the legs' stride, more toward its end; tipped with the pelvis as it leans, and wholly
        with it when the body falls; never under the ground."""
        spec = TAIL[self.race]
        pelvis = W['pelvis']
        root = pelvis @ (self.tail_root - rest('pelvis'))
        q = pelvis.to_quaternion()
        fwd = q @ Vector((0, -1, 0))
        heading = Quaternion((0, 0, 1), math.atan2(-fwd.x, -fwd.y) * -1.0)
        up = q @ Vector((0, 0, 1))
        tilt = math.degrees(math.acos(max(-1.0, min(1.0, up.z))))
        follow = 0.35 + 0.65 * min(1.0, max(0.0, (tilt - 25.0) / 45.0))
        frame = heading.slerp(q, follow)
        rot = lambda j: pose.rot.get(j, (0, 0, 0))   # noqa: E731
        twist = rot('pelvis')[2] + 0.5 * rot('spine')[2]
        stride = rot('thigh_L')[0] - rot('thigh_R')[0]
        sway = math.radians(-spec['sway'] * twist + spec['stride'] * stride)
        local = self.tail_rest - np.array(self.tail_root)
        a = sway * (0.25 + 0.75 * self.tail_share)
        c, s = np.cos(a), np.sin(a)
        swung = np.stack([c * local[:, 0] - s * local[:, 1], s * local[:, 0] + c * local[:, 1], local[:, 2]], axis=1)
        R = np.array(frame.to_matrix())
        out = swung @ R.T + np.array(root)
        out[:, 2] = np.maximum(out[:, 2], 0.012)
        self.tail.data.vertices.foreach_set('co', out.ravel())
        self.tail.data.update()
        self.tail.matrix_world = Matrix.Identity(4)

    def place(self, pose, gear):
        super().place(pose, gear)
        self.pose_tail(pose, pose.world())


BEAST_FRONT = -0.03   # a beast's face is painted ahead of this (rest Y): its muzzle and brow, never its skull's back


def face_skins(race, body):
    """A beast's face under a helm and under a hood, as `layers.painted_face` paints a man's: its hide's colour a
    third of the way up its ramp in a helm's shade, near its foot and darker still deep in a hood's."""
    ramp = _skins()[body][race]['hide']
    helm = tuple(ramp[int(0.3 * (len(ramp) - 1))])
    return helm, tuple(c * 0.75 for c in ramp[0])


def beast_layers(body, classify):
    """The beast races' layers on `body`: each race's bare body, hands, toes' claws and tail; the same body as it lies
    under a helm or a hood (`built_as` helmed), and its own face painted there in the helm's shade and the hood's."""
    import layers
    import clothes
    out = []
    for race in RACES:
        cls = type(f'Bare_{race}', (Beast, layers.Bare), {})
        for helmed in (False, True):
            with built_as(race, body, helmed) as toes:
                b = cls(body, 'axe')
            b.beast(race, body, toes)
            obs = [b.skins[0].ob, b.tail, *[ob for kinds in b.hands.values() for ob in kinds.values()],
                   *[ob for ob, _ in b.parts if ob.name.startswith('toeclaws_')]]
            out.append(layers.Layer(f'body_{race}_helmed' if helmed else f'body_{race}', b, obs, classify))
            if not helmed:
                continue
            woman = body == 'female'
            for name, skin in zip((f'face_{race}', f'face_hooded_{race}'), face_skins(race, body)):
                face = b.skins[0].shell(f'paint.{name}', layers.painted_face(b.skins[0], name, woman, skin,
                                                                             front=BEAST_FRONT),
                                        b.skins[0].rest[:, 2] > (layers.HOOD_NECK_Z if 'hooded' in name
                                                                 else model.FACE_Z), 0.0015)
                attrs = face.me.attributes   # its paint read off the shaped head it was placed on
                if 'rest.001' in attrs:
                    attrs.remove(attrs['rest'])
                    attrs['rest.001'].name = 'rest'
                b.skins.append(face)
                out.append(layers.Layer(name, b, [face.ob], classify, order=clothes.ORDER['skin']))
    return out



def own_cells(works, cell, root):
    """Each beast layer's cell in an animation: the animation's own grown round every frame it draws (a tail past its
    side, ears over its top), so nothing of it is cut. (cell, root) by layer name, its root on the same spot of the
    body as the animation's."""
    import stage
    rx, ry = stage.ROOT_PX
    out = {}
    for name, rows in works.items():
        left, top = rx - root[0], ry - root[1]
        right, low = left + cell[0], top + cell[1]
        for row in rows:
            for got in row:
                if got:
                    w, _, x0, y0, _ = got
                    left, top = min(left, x0), min(top, y0)
                    right, low = max(right, x0 + w.shape[1]), max(low, y0 + w.shape[0])
        out[name] = ([right - left, low - top], [rx - left, ry - top])
    return out
