"""The first-person warhammer (WEAPON07.CIF): a long wooden haft, a metal collar where it enters the head, and the head
across it, as Daggerfall draws its warhammer. Daggerfall shows no hand: the hands are below the screen, as the long
blade's are, so the hand rule keeps the root off it.

The part's space: its root on the haft where the upper hand holds it, its axis +Z up the haft to the head, the head's
length along X and its sides toward -Y and +Y. The head is a hammered bar: at its +X end the striking face, a block a
little broader than the bar with a groove before it; its -X end cut on a slant, its top the shorter; and a short
four-sided spike on its top, on the haft's line. The haft stands nearer the slanted end. A ring bands the haft above
the hands; the collar is ringed at both ends. The metal is rendered grey and the game dyes it; the wood is grained."""
import numpy as np

import fphand

SHAPE = {
    'haft_len': 0.55,    # metres from the root to the collar
    'haft_r': 0.017,     # the haft's girth at the root
    'haft_taper': 0.88,  # its girth at the collar, over the root's
    'haft_below': 0.3,   # how far it runs on below the root, to the lower hand and its end
    'ring_at': 0.03,     # the ring over the hands: how far above the root
    'collar_len': 0.07,  # the collar: its length, and its girth over the haft's there
    'collar_r': 1.3,
    'head_len': 0.24,    # the head, end to end along X: the spike, the bar and the face
    'head_h': 0.08,      # its height along the haft
    'head_d': 0.12,      # its depth, side to side: broader than it is tall, as Daggerfall's is
    'face_len': 0.05,    # the striking face's length along X, and how much broader than the bar it stands
    'face_grow': 1.2,
    'slant': 0.6,        # how far the -X end's top is cut back, over the head's height
    'spike_len': 0.03,   # the spike on the head's top, its height and its base's half-width
    'spike_w': 0.013,
    'head_off': 0.09,    # how far the head stands toward its face from the haft, over its length: the face's side
                         # is the longer, as Daggerfall's is
}
# how near and how far before the eye the upper hand may be, metres: a two-handed haft is swung from the chest, so the
# hand may come nearer than a sword's, and the head be looked up at from under it, as Daggerfall's often is
REACH = (0.08, 0.9)
# its metal graded by each face's tone, the mottle laid back over it at this gain (fpforge.tone), the grade no steeper
# than the last: a face lit evenly stays one tone with its texture's own contrast, where a grade of every texel would
# stretch the mottle, and the faint bounce of light across a face, over Daggerfall's whole range
DETAIL = (9, 0.6, 2.5)
MATS = ('hammer_head', 'hammer_collar', 'haft')
HEAD, COLLAR, HAFT = range(len(MATS))
# the reference's class each material is read against: the metal in the band the dye recolours, the wood the rest
CLASSES = {'hammer_head': 5, 'hammer_collar': 5, 'haft': 1}


def length(S):
    """The root to the head's middle: what a pose aims along."""
    return S['haft_len'] + S['collar_len'] + S['head_h'] / 2


def _faceted(v, t, mat):
    """A piece with no vertex shared between its triangles, so each face is shaded flat (the forge shades smooth)."""
    t = np.asarray(t, dtype=np.int64)
    return np.asarray(v, dtype=np.float64)[t].reshape(-1, 3), np.arange(3 * len(t), dtype=np.int64).reshape(-1, 3), mat


def _box(x0, x1, hy, hz, z, mat, grow1=1.0, slant=0.0):
    """A bar along X from `x0` to `x1`, `hy` and `hz` its half-depth and half-height (at `x1` times `grow1`), about
    height `z`, its `x0` end's top cut back by `slant` along X: closed, its faces wound out."""
    a = np.array([[x0, -hy, z - hz], [x0, hy, z - hz], [x0 + slant, hy, z + hz], [x0 + slant, -hy, z + hz]])
    b = np.array([[x1, -hy * grow1, z - hz * grow1], [x1, hy * grow1, z - hz * grow1], [x1, hy * grow1, z + hz * grow1],
                  [x1, -hy * grow1, z + hz * grow1]])
    v = np.vstack([a, b])
    t = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7)]   # the two ends
    for i in range(4):
        j = (i + 1) % 4
        t += [(i, j, 4 + j), (i, 4 + j, 4 + i)]
    return _faceted(v, t, mat)


def _spike(z0, h, w, mat):
    """A four-sided spike standing on the head's top at height `z0`, on the haft's line: `h` high, `w` its base's
    half-width, its corners toward the head's ends and sides."""
    base = np.array([[w, 0.0, z0], [0.0, w, z0], [-w, 0.0, z0], [0.0, -w, z0]])
    v = np.vstack([base, [[0.0, 0.0, z0 + h]]])
    t = [(0, 2, 1), (0, 3, 2)] + [(i, (i + 1) % 4, 4) for i in range(4)]
    return _faceted(v, t, mat)


def _ringed(z0, z1, r, rim, rim_w, mat, n=20, power=2.0):
    """A metal sleeve round the haft from `z0` to `z1`, `r` its girth, a rim `rim` thick and `rim_w` long at each end
    (`power` above 2 squares it)."""
    s = np.array([z0, z0 + rim_w * 0.3, z0 + rim_w, z0 + rim_w * 1.2, z1 - rim_w * 1.2, z1 - rim_w, z1 - rim_w * 0.3, z1])
    w = np.array([r, rim, rim, r, r, rim, rim, r])
    v, t = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [0.0, 1.0, 0.0], s, w, w, power=power, n=n)
    return v, t, mat


def haft(S, ring=True):
    """The haft from below the hands up into the head's middle, girth tapering to the collar, and the ring over the
    hands: [(vertices, triangles, material)]."""
    r0, top = S['haft_r'], S['haft_len']
    r1 = r0 * S['haft_taper']
    s = np.linspace(-S['haft_below'], top + S['collar_len'] + S['head_h'] / 2, 14)
    girth = r0 + (r1 - r0) * np.clip(s / top, 0.0, 1.0)
    hv, ht = fphand._tube(np.zeros(3), [0.0, 0.0, 1.0], [0.0, 1.0, 0.0], s, girth, girth, power=2.0, n=18)
    a = S['ring_at']
    return [(hv, ht, HAFT)] + ([_ringed(a - 0.008, a + 0.008, r0 * 1.12, r0 * 1.22, 0.004, COLLAR)] if ring else [])


def part(S):
    """The warhammer: (vertices, triangles, material a triangle)."""
    from fpmodel import _join
    top = S['haft_len']
    zc = top + S['collar_len'] + S['head_h'] / 2   # the head's middle
    pieces = haft(S)
    c = S['haft_r'] * S['haft_taper'] * S['collar_r']
    pieces.append(_ringed(top, top + S['collar_len'], c, c * 1.12, 0.006, COLLAR))
    L, hy, hz = S['head_len'], S['head_d'] / 2, S['head_h'] / 2
    off = S['head_off'] * L
    x_end, x_face = -L / 2 + off, L / 2 - S['face_len'] + off
    gap = 0.006   # the groove before the face
    pieces.append(_box(x_end, x_face - gap, hy, hz, zc, HEAD, slant=S['slant'] * S['head_h']))
    pieces.append(_box(x_face - gap, x_face, hy * 0.78, hz * 0.78, zc, HEAD))
    pieces.append(_box(x_face, L / 2 + off, hy * S['face_grow'], hz * S['face_grow'], zc, HEAD))
    pieces.append(_spike(zc + hz - 0.001, S['spike_len'], S['spike_w'], HEAD))
    return _join(pieces)


def head_metal(dents=1.0, mottle=(0.32, 0.62), scale=(130.0, 230.0), name='hammer_head'):
    """The head's metal, grey (the metal the dye recolours): dents of relief `dents` strong, mottled between the two
    greys of `mottle`, the dents and the blotches `scale` to a metre. Lit as the fitter lights it
    (fpmodel._diffuse)."""
    import materials
    from fpmodel import _diffuse
    head, b = materials._principled(name, (0.5, 0.5, 0.5), rough=0.9)
    nt = head.node_tree
    # hammered: crisp dents under a centimetre across, as Daggerfall's measure (some thirty along the head), big
    # enough that a texel holds one at most
    vec = materials._coords(head, (scale[0],) * 3)
    pits = nt.nodes.new('ShaderNodeTexVoronoi')
    pits.inputs['Scale'].default_value = 1.0
    pits.inputs['Randomness'].default_value = 0.9
    nt.links.new(vec, pits.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = dents
    bump.inputs['Distance'].default_value = 0.003 * 130.0 / scale[0]   # coarser dents as deep as finer ones
    nt.links.new(pits.outputs['Distance'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    # and mottled: Daggerfall's metal is a painted texture of small blotches, light and dark, that shows on a face lit
    # square on, where the dents' relief barely does
    blot = nt.nodes.new('ShaderNodeTexNoise')
    blot.inputs['Scale'].default_value = 1.0
    blot.inputs['Detail'].default_value = 2.0
    blot.inputs['Roughness'].default_value = 0.5
    nt.links.new(materials._coords(head, (scale[1],) * 3), blot.inputs['Vector'])
    tone = nt.nodes.new('ShaderNodeValToRGB')
    tone.color_ramp.elements[0].position, tone.color_ramp.elements[1].position = 0.3, 0.7
    tone.color_ramp.elements[0].color = (mottle[0], mottle[0], mottle[0], 1)
    tone.color_ramp.elements[1].color = (mottle[1], mottle[1], mottle[1], 1)
    nt.links.new(blot.outputs['Fac'], tone.inputs['Fac'])
    nt.links.new(tone.outputs['Color'], b.inputs['Base Color'])
    return _diffuse(head)


def shadowless(m):
    """Material `m` clear to a shadow's ray: it casts none, as nothing in Daggerfall's frames does. Under a light
    grazing the head, a sleeve or haft below it would lay a dark band across the face."""
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    surf = out.inputs['Surface'].links[0].from_socket
    clear = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(nt.nodes.new('ShaderNodeLightPath').outputs['Is Shadow Ray'], clear.inputs['Fac'])
    nt.links.new(surf, clear.inputs[1])
    nt.links.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs[0], clear.inputs[2])
    nt.links.new(clear.outputs[0], out.inputs['Surface'])
    return m


def haft_wood(dark=(0.16, 0.07, 0.022), light=(0.52, 0.28, 0.1)):
    """The haft's wood, grained along it between the colours `dark` and `light`, lit as the fitter lights it."""
    import materials
    from fpmodel import _diffuse
    wood, w = materials._principled('haft', (0.3, 0.14, 0.05), rough=0.6)
    nt = wood.node_tree
    vec = materials._coords(wood, (420.0, 420.0, 14.0))   # the grain: fine streaks running the haft's length
    grain = nt.nodes.new('ShaderNodeTexNoise')
    grain.inputs['Scale'].default_value = 1.0
    grain.inputs['Detail'].default_value = 4.0
    grain.inputs['Distortion'].default_value = 0.8
    nt.links.new(vec, grain.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = (*light, 1)
    nt.links.new(grain.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], w.inputs['Base Color'])
    return _diffuse(wood)


def palette():
    """The warhammer's materials, lit as the fitter lights them: the head's metal hammered, the collar's smoother, both
    grey (the metal the dye recolours); the haft's wood grained along it."""
    import materials
    from fpmodel import _diffuse
    return {'hammer_head': head_metal(), 'haft': haft_wood(),
            'hammer_collar': _diffuse(materials.plain('hammer_collar', (0.55, 0.55, 0.55), rough=0.8))}


# what fpfit.py --shape fits, its steps and bounds: the haft's length and girth, the head's size, and the lens
SHAPE_KEYS = ('focal', 'haft_len', 'haft_r', 'head_len', 'head_h', 'head_d', 'head_off', 'spike_len')
SHAPE_STEP = {'haft_len': 0.03, 'haft_r': 0.001, 'head_len': 0.012, 'head_h': 0.004, 'head_d': 0.004,
              'head_off': 0.02, 'spike_len': 0.004}
BOUNDS = {'haft_len': (0.25, 1.0), 'haft_r': (0.01, 0.03), 'head_len': (0.12, 0.4), 'head_h': (0.035, 0.14),
          'head_d': (0.035, 0.16), 'head_off': (-0.2, 0.2), 'spike_len': (0.01, 0.07)}
