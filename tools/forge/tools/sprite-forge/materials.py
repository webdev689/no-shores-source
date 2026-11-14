"""The forge's materials. Patterns read each mesh's rest position, so a scale or a lamella rides its part and never
swims. `TINT` holds the fitted colour of each (fit.py --colour): a factor a channel, laid on every colour it holds."""
import json
import math
import os

import bpy

TINT = {}


def load_tint(path):
    TINT.clear()
    if os.path.exists(path):
        TINT.update(json.load(open(path)))


def tint(m, f):
    """Multiply every colour material `m` holds (its base colour, its ramps' stops) by the factors `f`."""
    def mul(c):
        return (c[0] * f[0], c[1] * f[1], c[2] * f[2], c[3])
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED' and not n.inputs['Base Color'].is_linked:
            n.inputs['Base Color'].default_value = mul(n.inputs['Base Color'].default_value)
        if n.type == 'VALTORGB':
            for e in n.color_ramp.elements:
                e.color = mul(e.color)


def _principled(name, rgb, metal=0.0, rough=0.5, spec=0.5):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = spec
    return m, b


def plain(name, rgb, metal=0.0, rough=0.5, spec=0.5):
    return _principled(name, rgb, metal, rough, spec)[0]


def _rest(nt):
    """The mesh's rest position (body.py): a pattern read from it stays put however the mesh is posed."""
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type = 'GEOMETRY'
    at.attribute_name = 'rest'
    return at.outputs['Vector']


def _coords(m, scale):
    nt = m.node_tree
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = scale
    nt.links.new(_rest(nt), mp.inputs['Vector'])
    return mp.outputs['Vector']


def chain(name, dark, light, around=11.0, rows=95.0, rough=0.45):
    """Mail: a regular diamond lattice wrapped round the part's own axis (object Z), bright rings on dark gaps.
    `around` is diamonds round the limb, `rows` the lattice's frequency up it (radians a metre)."""
    m, b = _principled(name, light, metal=0.55, rough=rough)
    nt = m.node_tree
    L = nt.links
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(_rest(nt), xyz.inputs[0])

    def op(kind, a, b_=None, val=None):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        L.new(a, n.inputs[0]) if not isinstance(a, float) else n.inputs[0].__setattr__('default_value', a)
        if b_ is not None:
            L.new(b_, n.inputs[1]) if not isinstance(b_, float) else n.inputs[1].__setattr__('default_value', b_)
        return n.outputs[0]
    ang = op('ARCTAN2', xyz.outputs['Y'], xyz.outputs['X'])
    u = op('MULTIPLY', ang, float(around))
    v = op('MULTIPLY', xyz.outputs['Z'], float(rows))
    p1 = op('ABSOLUTE', op('SINE', op('ADD', u, v)))
    p2 = op('ABSOLUTE', op('SINE', op('SUBTRACT', u, v)))
    f = op('MULTIPLY', p1, p2)
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.12
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (*light, 1)
    L.new(f, ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


WIRE = (0.52, 0.4)   # the ring's wire: its middle and half its width, as shares of the ring's reach


def rings(name, dark, light, pitch=0.011, rough=0.3, relief=0.9):
    """Mail drawn close, where a ring is many pixels: rows of rings round the part's own axis (object Z), each row
    set half a ring along from the one above, each ring bright wire round a dark hole with dark gaps between, its
    top lit and its foot tucked under the row below. As many rings go round a part as its girth holds, `pitch` apart,
    so they stay round on a narrow wrist as on a broad forearm. Each ring stands in `relief` (a bump): the lamp lays a
    glint along its lit curve and leaves its hole dark, so the rings read as wire and not as a print."""
    # half metal: a metal's own colour is its glint alone, so in shade a fully metal ring shows nothing of itself
    m, b = _principled(name, light, metal=0.5, rough=rough)
    nt = m.node_tree
    L = nt.links
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(_rest(nt), xyz.inputs[0])

    def op(kind, a, b_=None, clamp=False):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        n.use_clamp = clamp
        for k, x in enumerate((a, b_)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                n.inputs[k].default_value = float(x)
            else:
                L.new(x, n.inputs[k])
        return n.outputs[0]
    x, y, z = xyz.outputs['X'], xyz.outputs['Y'], xyz.outputs['Z']
    girth = op('MULTIPLY', op('SQRT', op('ADD', op('MULTIPLY', x, x), op('MULTIPLY', y, y))), 2 * math.pi / pitch)
    around = op('MAXIMUM', op('ROUND', girth), 3.0)   # whole rings round, so the rows close on themselves
    u = op('MULTIPLY', op('ADD', op('DIVIDE', op('ARCTAN2', y, x), 2 * math.pi), 0.5), around)
    v = op('DIVIDE', z, pitch * 0.75)   # the rows overlap: each a little under a ring's height above the last
    u = op('ADD', u, op('MULTIPLY', op('FLOOR', v), 0.5))
    fu = op('SUBTRACT', op('FRACT', u), 0.5)
    fv = op('SUBTRACT', op('FRACT', v), 0.5)
    d = op('MULTIPLY', op('SQRT', op('ADD', op('MULTIPLY', fu, fu), op('MULTIPLY', op('MULTIPLY', fv, fv), 0.5625))),
           2.0)   # 0 at the ring's heart, 1 at its cell's side
    # thick wire round a small hole: interlinked rings are mostly metal, their holes and the gaps between them small
    wire = op('SUBTRACT', 1.0, op('DIVIDE', op('ABSOLUTE', op('SUBTRACT', d, WIRE[0])), WIRE[1]), clamp=True)
    wire = op('POWER', wire, 0.6)
    lit = op('ADD', 0.45, op('MULTIPLY', op('ADD', fv, 0.5), 0.55))   # brighter up the ring, its foot in the shade
    f = op('MULTIPLY', wire, lit)
    if relief:   # the wire round, standing off the gaps
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = relief
        bump.inputs['Distance'].default_value = pitch * 0.15
        L.new(wire, bump.inputs['Height'])
        L.new(bump.outputs['Normal'], b.inputs['Normal'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.05
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*light, 1)
    L.new(f, ramp.inputs['Fac'])
    L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


# a horizon reflected in polished metal, by the reflected ray's height: (height from -1 to 1, its light)
HORIZON = ((0.0, 0.02), (0.46, 0.06), (0.5, 1.0), (0.56, 0.25), (1.0, 0.42))


def polish(m, glow=1.0, horizon=HORIZON, floor=0.0):
    """Polished metal's look laid on material `m`: a horizon reflected in it - the ground dark, a bright band at the
    horizon, the sky above - in its own colour, over the lamp's highlight. A face's light then turns with its slope as
    a mirror's does, so plate reads as metal under any lamp. `floor` is the least its reflection takes of each
    channel, so a near-black metal (ebony's) still shows its horizon, as black glass does. Gives back `m`."""
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(nt.nodes.new('ShaderNodeTexCoord').outputs['Reflection'], sep.inputs[0])
    up = nt.nodes.new('ShaderNodeMapRange')
    up.inputs['From Min'].default_value = -1.0
    nt.links.new(sep.outputs['Z'], up.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(up.outputs['Result'], ramp.inputs['Fac'])
    els = ramp.color_ramp.elements
    for k, (at, v) in enumerate(horizon):
        el = els[k] if k < len(els) else els.new(at)
        el.position, el.color = at, (v, v, v, 1)
    lift = nt.nodes.new('ShaderNodeMix')   # the base colour, each channel at least `floor`
    lift.data_type, lift.blend_type = 'RGBA', 'LIGHTEN'
    lift.inputs['Factor'].default_value = 1.0
    lift.inputs['A'].default_value = (floor, floor, floor, 1)
    base = b.inputs['Base Color']
    if base.links:
        nt.links.new(base.links[0].from_socket, lift.inputs['B'])
    else:
        lift.inputs['B'].default_value = base.default_value
    tint = nt.nodes.new('ShaderNodeMix')
    tint.data_type, tint.blend_type = 'RGBA', 'MULTIPLY'
    tint.inputs['Factor'].default_value = 1.0
    nt.links.new(ramp.outputs['Color'], tint.inputs['A'])
    nt.links.new(lift.outputs['Result'], tint.inputs['B'])
    nt.links.new(tint.outputs['Result'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = glow
    return m


def polished(name, rgb, rough=0.28, glow=1.0, metal=1.0, floor=0.0):
    """Polished metal in colour `rgb` (linear): `metal` metallic, its highlight the lamp's, a horizon in it (polish)."""
    return polish(_principled(name, rgb, metal=metal, rough=rough)[0], glow, floor=floor)


def lamellar(name, dark, light, bands=36.0, rough=0.35):
    """Plates in rows: horizontal bands with bright upper rims."""
    m, b = _principled(name, dark, metal=0.9, rough=rough)
    nt = m.node_tree
    vec = _coords(m, (1.0, 1.0, 1.0))
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.wave_type = 'BANDS'
    wave.bands_direction = 'Z'
    wave.wave_profile = 'SAW'
    wave.inputs['Scale'].default_value = bands / 6.0
    wave.inputs['Distortion'].default_value = 0.0
    nt.links.new(vec, wave.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.55
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.95
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.5
    bump.inputs['Distance'].default_value = 0.01
    nt.links.new(wave.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def speckle(name, dark, light, scale=30.0, at=0.5, rough=0.4, metal=0.6):
    """Dark worked plate with soft lighter patches: the cuirass's metal."""
    m, b = _principled(name, dark, metal=metal, rough=rough)
    nt = m.node_tree
    vec = _coords(m, (scale, scale, scale))
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.0
    nz.inputs['Detail'].default_value = 1.0
    nt.links.new(vec, nz.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = at
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = at + 0.15
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(nz.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def sculpted(name, rgb, scale=18.0, strength=0.55):
    """Glossy dark plate worked in shallow relief: its highlight breaks into patches, as a sculpted cuirass's does."""
    m, b = _principled(name, rgb, metal=0.85, rough=0.25)
    nt = m.node_tree
    vec = _coords(m, (scale, scale, scale))
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.0
    nz.inputs['Detail'].default_value = 2.0
    nt.links.new(vec, nz.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = strength
    bump.inputs['Distance'].default_value = 0.02
    nt.links.new(nz.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def painted_face(rgb, name, marks, front_y):
    """Skin of `rgb` (sRGB) with a face painted on it as Daggerfall's faces read at a sprite's size: each mark (x, z,
    half-width, half-height, depth) a soft patch darkened by `depth` (lit, where below 0) - the eyes, the mouth, the
    shadow of a jaw, a nose's lit tip - laid on the face's front only (rest Y nearer the viewer than `front_y`), so the
    side and back of the head stay plain skin. Nine tenths of it at most is taken away."""
    m, b = _principled(name, tuple(((c / 255 + 0.055) / 1.055) ** 2.4 for c in rgb), rough=0.9, spec=0.08)
    nt = m.node_tree
    L = nt.links
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(_rest(nt), xyz.inputs[0])

    def op(kind, a, b_=0.0, clamp=False):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        n.use_clamp = clamp
        for i, v in enumerate((a, b_)):
            if isinstance(v, float):
                n.inputs[i].default_value = v
            else:
                L.new(v, n.inputs[i])
        return n.outputs[0]
    dark = 0.0
    for x, z, hx, hz, depth in marks:   # each patch: 1 - ((x - cx) / hx)^2 - ((z - cz) / hz)^2, softened, clamped
        dx = op('POWER', op('DIVIDE', op('SUBTRACT', xyz.outputs['X'], float(x)), float(hx)), 2.0)
        dz = op('POWER', op('DIVIDE', op('SUBTRACT', xyz.outputs['Z'], float(z)), float(hz)), 2.0)
        patch = op('MULTIPLY', op('SUBTRACT', 1.0, op('ADD', dx, dz)), 2.0, clamp=True)
        dark = op('ADD', dark, op('MULTIPLY', patch, float(depth))) if not isinstance(dark, float) else \
            op('MULTIPLY', patch, float(depth))
    gate = op('DIVIDE', op('SUBTRACT', float(front_y), xyz.outputs['Y']), 0.02, clamp=True)   # the front alone
    keep = op('SUBTRACT', 1.0, op('MULTIPLY', op('MINIMUM', dark, 0.9), gate))
    mul = nt.nodes.new('ShaderNodeVectorMath')   # the skin's colour times what each patch leaves of it
    mul.operation = 'SCALE'
    mul.inputs[0].default_value = tuple(b.inputs['Base Color'].default_value)[:3]
    L.new(keep, mul.inputs['Scale'])
    L.new(mul.outputs['Vector'], b.inputs['Base Color'])
    return m


def paint(m, marks):
    """Lay painted shading on material `m`, as Daggerfall paints its figures' skin: each mark (x, z, half-width,
    half-height, depth, side[, soft]) a patch at rest (x, z), darkened by `depth` (lit, where below 0), on the body's
    front (`side` -1, rest Y toward the viewer) or its back (+1): a line's, firm to near its edge, or with `soft` a
    bell's, fading from its middle, for a broad shade. Its colour goes through a one-colour ramp, so a tint still
    reaches it. Nine tenths of it at most is taken away."""
    nt = m.node_tree
    L = nt.links
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    for e in ramp.color_ramp.elements:
        e.color = tuple(b.inputs['Base Color'].default_value)
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ')
    L.new(_rest(nt), xyz.inputs[0])

    def op(kind, a, b_=0.0, clamp=False):
        n = nt.nodes.new('ShaderNodeMath')
        n.operation = kind
        n.use_clamp = clamp
        for i, v in enumerate((a, b_)):
            if isinstance(v, float):
                n.inputs[i].default_value = v
            else:
                L.new(v, n.inputs[i])
        return n.outputs[0]
    gates = {side: op('DIVIDE', op('MULTIPLY', xyz.outputs['Y'], float(side)), 0.03, clamp=True) for side in (-1, 1)}
    dark = 0.0
    for x, z, hx, hz, depth, side, *soft in marks:
        dx = op('POWER', op('DIVIDE', op('SUBTRACT', xyz.outputs['X'], float(x)), float(hx)), 2.0)
        dz = op('POWER', op('DIVIDE', op('SUBTRACT', xyz.outputs['Z'], float(z)), float(hz)), 2.0)
        inside = op('SUBTRACT', 1.0, op('ADD', dx, dz))
        shape = (op('POWER', op('MAXIMUM', inside, 0.0), 2.0) if soft and soft[0]
                 else op('MULTIPLY', inside, 2.0, clamp=True))
        patch = op('MULTIPLY', shape, gates[side])
        term = op('MULTIPLY', patch, float(depth))
        dark = term if isinstance(dark, float) else op('ADD', dark, term)
    keep = op('SUBTRACT', 1.0, op('MINIMUM', dark, 0.9))
    mul = nt.nodes.new('ShaderNodeVectorMath')
    mul.operation = 'SCALE'
    L.new(ramp.outputs['Color'], mul.inputs[0])
    L.new(keep, mul.inputs['Scale'])
    L.new(mul.outputs['Vector'], b.inputs['Base Color'])
    return m


def palette():
    """Every material the medium fighters wear, by role, in its fitted colour."""
    mats = _palette()
    for name, f in TINT.items():
        if name in mats:
            tint(mats[name], f)
    return mats


def _palette():
    return {
        'skin': plain('skin', (0.42, 0.13, 0.03), rough=0.9, spec=0.08),
        'silver': plain('silver', (0.62, 0.62, 0.64), metal=0.55, rough=0.32),
        'cuirass': sculpted('cuirass', (0.07, 0.07, 0.075)),
        'mail': chain('mail', (0.015, 0.015, 0.02), (0.30, 0.30, 0.33)),
        'coif': chain('coif', (0.02, 0.02, 0.025), (0.22, 0.22, 0.24), around=14.0, rows=120.0),
        'leather': plain('leather', (0.16, 0.07, 0.025), rough=0.6),
        'cloth': plain('cloth', (0.045, 0.14, 0.015), rough=0.75, spec=0.25),
        'boot': plain('boot', (0.012, 0.17, 0.18), rough=0.4, spec=0.45),
        'tights': plain('tights', (0.012, 0.17, 0.18), rough=0.6, spec=0.35),
        'greenboot': plain('greenboot', (0.05, 0.16, 0.02), rough=0.45, spec=0.45),
        'plate': plain('plate', (0.06, 0.06, 0.065), metal=0.85, rough=0.3),
        'helmet': plain('helmet', (0.22, 0.22, 0.23), metal=0.75, rough=0.35),
        'horn': plain('horn', (0.45, 0.30, 0.14), rough=0.4, spec=0.5),
        'armplate': lamellar('armplate', (0.05, 0.05, 0.055), (0.34, 0.34, 0.37), bands=40.0),
        'leatherboot': plain('leatherboot', (0.20, 0.09, 0.035), rough=0.55, spec=0.3),
        'bracer': plain('bracer', (0.42, 0.42, 0.45), metal=1.0, rough=0.3),
        # an axe's dark metal, rough: a smoother one throws the key light back off a whole flat, and the flat goes white
        'blade': plain('blade', (0.32, 0.32, 0.34), metal=1.0, rough=0.6),
        'edge': plain('edge', (0.75, 0.75, 0.78), metal=1.0, rough=0.2),
        # a long flat blade mirrors the dark stage whole, so the sword's is half metal: its diffuse part takes the light
        'steel': plain('steel', (0.46, 0.46, 0.46), metal=0.45, rough=0.35, spec=0.6),
        'haft': plain('haft', (0.07, 0.05, 0.04), rough=0.5),
        'wood': plain('wood', (0.35, 0.17, 0.06), rough=0.5),
        'string': plain('string', (0.75, 0.70, 0.60), rough=0.8),
        'face': plain('face', (0.12, 0.04, 0.012), rough=0.9, spec=0.08),
    }
