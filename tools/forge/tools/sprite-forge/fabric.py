"""Cloth and leather as Daggerfall draws them at a sprite's size. Its cloth lies in a few broad folds, each a lit ridge
beside a dark crease: creases ringing the knee, the ankle and the elbow, folds falling down the thigh and gathered
under the belt, slack across the belly. Its leather is mottled where it is worn and creased where it bends. Nothing is
finer than a pixel or two, so it never speckles.

Each piece keeps where it lies on the body at rest (`mark`), and its material draws the folds from that, a pixel at a
time, however coarse the piece's mesh. They are drawn in the light and the colour (a bump and a darker crease), not the
shape, so nothing worn over the cloth is pushed through."""
import numpy as np

import materials

AT = 'body_at'   # a piece's place on the body at rest, as an attribute
# where each kind of fold lies, a weight at heights up the body at rest (metres): creases ringing the ankle and the
# knee; on the arm, the elbow's; folds falling down the thigh and gathered under the belt; slack across the belly
RINGS = [(0.07, 0.0), (0.12, 1.0), (0.22, 1.0), (0.29, 0.0), (0.46, 0.0), (0.52, 1.0), (0.62, 1.0), (0.69, 0.0)]
ELBOW = [(1.08, 0.0), (1.13, 1.0), (1.21, 1.0), (1.26, 0.0)]
FALLS = [(0.6, 0.0), (0.76, 0.7), (0.93, 0.9), (1.0, 1.0), (1.09, 1.0), (1.13, 0.0)]
SLACK = [(1.1, 0.0), (1.16, 0.8), (1.3, 0.6), (1.36, 0.0)]


def mark(me, p=None):
    """Keep on mesh `me` where each vertex lies on the body at rest: `p`, or its own vertices (a rigid piece before
    it is hung on its joint)."""
    if p is None:
        p = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get('co', p)
    attr = me.attributes.get(AT) or me.attributes.new(AT, 'FLOAT_VECTOR', 'POINT')
    attr.data.foreach_set('vector', np.asarray(p, np.float32).ravel())


class _Nodes:
    def __init__(self, m):
        self.m, self.nt = m, m.node_tree

    def new(self, kind, **inputs):
        n = self.nt.nodes.new(kind)
        for k, v in inputs.items():
            if hasattr(v, 'is_linked') or hasattr(v, 'links'):
                self.nt.links.new(v, n.inputs[k])
            else:
                n.inputs[k].default_value = v
        return n

    def math(self, op, a, b=None):
        n = self.nt.nodes.new('ShaderNodeMath')
        n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                self.nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    def at(self):
        a = self.nt.nodes.new('ShaderNodeAttribute')
        a.attribute_type = 'GEOMETRY'
        a.attribute_name = AT
        return a.outputs['Vector']

    def weight(self, z, stops):
        """A weight along the body's height: `stops` (height, weight), eased between."""
        r = self.nt.nodes.new('ShaderNodeValToRGB')
        r.color_ramp.interpolation = 'EASE'
        els = r.color_ramp.elements
        while len(els) < len(stops):
            els.new(0.0)
        for e, (h, w) in zip(els, stops):
            e.position, e.color = h / 2.0, (w, w, w, 1.0)
        self.nt.links.new(self.math('MULTIPLY', z, 0.5), r.inputs['Fac'])
        return r.outputs['Color']

    def patches(self, vec, scale):
        """Soft patches about 1/`scale` metres across, nought between them and one in them."""
        nz = self.new('ShaderNodeTexNoise', Vector=vec, Scale=scale, Detail=1.0)
        r = self.nt.nodes.new('ShaderNodeValToRGB')
        r.color_ramp.elements[0].position, r.color_ramp.elements[1].position = 0.42, 0.58
        self.nt.links.new(nz.outputs['Fac'], r.inputs['Fac'])
        return self.math('MULTIPLY', r.outputs['Color'], 1.0)

    def wave(self, vec, direction, period, warp, profile='SAW'):
        """Bands along `direction` about `period` metres apart, wandering by `warp`, each a slow rise to its ridge and
        a sharp fall into its crease (SAW)."""
        w = self.nt.nodes.new('ShaderNodeTexWave')
        w.wave_type, w.bands_direction, w.wave_profile = 'BANDS', direction, profile
        w.inputs['Scale'].default_value = 0.314 / period
        w.inputs['Distortion'].default_value = warp
        w.inputs['Detail'].default_value = 1.0
        w.inputs['Detail Scale'].default_value = 1.2
        self.nt.links.new(vec, w.inputs['Vector'])
        return w.outputs['Fac']


def _folds(N, b, rgb, depth, crease, falls=True):
    """The folds' height (a bump `depth` metres deep) and their creases darkened by `crease`; gives the colour's
    factor's socket, for a mottle to multiply. Stiff leather has no `falls`: it creases where it bends alone."""
    at = N.at()
    xyz = N.new('ShaderNodeSeparateXYZ', Vector=at)
    x, z = xyz.outputs['X'], xyz.outputs['Z']
    arm = N.math('MULTIPLY', N.math('GREATER_THAN', N.math('ABSOLUTE', x), 0.2), N.math('GREATER_THAN', z, 0.85))
    body = N.math('SUBTRACT', 1.0, arm)
    # broad and few, as Daggerfall's are: four to six pixels apart at a sprite's size, and the falls come and go
    parts = [(N.math('MULTIPLY', N.weight(z, RINGS), body), N.wave(at, 'Z', 0.07, 3.0)),
             (N.math('MULTIPLY', N.weight(z, ELBOW), arm), N.wave(at, 'Z', 0.06, 2.5)),
             (N.math('MULTIPLY', N.weight(z, SLACK), body), N.wave(at, 'Z', 0.09, 3.0, 'SIN'))]
    if falls:
        f = N.math('MULTIPLY', N.wave(at, 'X', 0.1, 6.0, 'SIN'), N.patches(at, 9.0))
        parts.append((N.math('MULTIPLY', N.weight(z, FALLS), body), f))
    height, dark = None, None
    for w, f in parts:
        h = N.math('MULTIPLY', w, f)
        d = N.math('MULTIPLY', w, N.math('POWER', N.math('SUBTRACT', 1.0, f), 3.0))
        height = h if height is None else N.math('ADD', height, h)
        dark = d if dark is None else N.math('ADD', dark, d)
    bump = N.new('ShaderNodeBump', Strength=1.0, Distance=depth, Height=height)
    N.nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return N.math('SUBTRACT', 1.0, N.math('MULTIPLY', N.math('MINIMUM', dark, 1.0), crease)), bump


def _mottle(N, rgb, amount, scale):
    """The colour mottled `amount` either way in soft patches about 1/`scale` metres across."""
    nz = N.new('ShaderNodeTexNoise', Vector=materials._coords(N.m, (scale, scale, scale)), Scale=1.0, Detail=2.5)
    ramp = N.nt.nodes.new('ShaderNodeValToRGB')
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.3, (*(c * (1 - amount) for c in rgb), 1)
    els[1].position, els[1].color = 0.7, (*(min(c * (1 + amount), 1.0) for c in rgb), 1)
    N.nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    return ramp.outputs['Color']


def folded(m, b, colour, depth=0.012, crease=0.55, falls=True):
    """Lay the folds on material `m` (its Principled BSDF `b`): their bump on its normal, and `colour` (a socket)
    darkened in their creases as its base colour. Gives the bump, for a grain to lie under."""
    N = _Nodes(m)
    shade, bump = _folds(N, b, None, depth, crease, falls)
    col = N.nt.nodes.new('ShaderNodeMix')
    col.data_type, col.blend_type = 'RGBA', 'MULTIPLY'
    col.inputs[0].default_value = 1.0
    N.nt.links.new(colour, col.inputs[6])
    gray = N.new('ShaderNodeCombineColor', Red=shade, Green=shade, Blue=shade)
    N.nt.links.new(gray.outputs['Color'], col.inputs[7])
    N.nt.links.new(col.outputs[2], b.inputs['Base Color'])
    return bump


def occluded(m, distance=0.06, power=1.5):
    """Darken material `m`'s base colour where its own surfaces close round it within `distance` metres: the valleys
    between a skirt's folds, under a belt, inside a hem. Daggerfall's cloth is darkest there, in broad soft shadow,
    not along each crease. Only what the frame draws closes round it: each layer is lit alone."""
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    link = b.inputs['Base Color'].links[0]
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion')
    ao.samples = 8
    ao.inputs['Distance'].default_value = distance
    shade = nt.nodes.new('ShaderNodeMath')
    shade.operation = 'POWER'
    nt.links.new(ao.outputs['AO'], shade.inputs[0])
    shade.inputs[1].default_value = power
    col = nt.nodes.new('ShaderNodeMix')
    col.data_type, col.blend_type = 'RGBA', 'MULTIPLY'
    col.inputs[0].default_value = 1.0
    nt.links.new(link.from_socket, col.inputs[6])
    gray = nt.nodes.new('ShaderNodeCombineColor')
    for k in ('Red', 'Green', 'Blue'):
        nt.links.new(shade.outputs[0], gray.inputs[k])
    nt.links.new(gray.outputs['Color'], col.inputs[7])
    nt.links.new(col.outputs[2], b.inputs['Base Color'])
    return m


def _make(name, rgb, rough, spec, mottle, scale, depth, crease, grain=0.0, falls=True):
    m, b = materials._principled(name, rgb, 0.0, rough, spec)
    bump = folded(m, b, _mottle(_Nodes(m), rgb, mottle, scale), depth, crease, falls)
    if grain:   # a fine grain under the folds' light
        N = _Nodes(m)
        nz = N.new('ShaderNodeTexNoise', Vector=materials._coords(m, (90.0, 90.0, 90.0)), Scale=1.0, Detail=2.0)
        g = N.new('ShaderNodeBump', Strength=grain, Distance=0.002, Height=nz.outputs['Fac'])
        N.nt.links.new(g.outputs['Normal'], bump.inputs['Normal'])
    return m


def cloth(name, rgb, rough=0.88, spec=0.15, mottle=0.22):
    """Cloth: matte, mottled in soft clouds, in deep folds with dark creases."""
    return _make(name, rgb, rough, spec, mottle, 14.0, depth=0.012, crease=0.55)


def fur(name, rgb, mottle=0.45, scale=40.0):
    """Fur: matte, flecked dark a pixel or two across, as Daggerfall's tan fur collars and hoods are, soft and without
    folds of its own. Smooth, a hood of it read as a bare head."""
    m, b = materials._principled(name, rgb, 0.0, 0.98, 0.04)
    N = _Nodes(m)
    N.nt.links.new(_mottle(N, rgb, mottle, scale), b.inputs['Base Color'])
    return m


def leather(name, rgb, rough=0.7, spec=0.3, mottle=0.2, grain=0.12):
    """Leather: mottled where it is worn, creased where it bends but stiffer than cloth, a faint grain."""
    return _make(name, rgb, rough, spec, mottle, 16.0, depth=0.005, crease=0.2, grain=grain, falls=False)
