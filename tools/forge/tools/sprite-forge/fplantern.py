"""The first-person forge's lantern hand: Handheld Torches' hand holding a lit lantern (TEXTURE.112359 record 1, 110 x
138, four frames), seen as the torch hand is (fptorch.py), and the hand pictures' flat twins.

    python -I tools/sprite-forge/fplantern.py --out public/art/studio/forge/held [--samples 128] [--hands Hands,Iron]
        [--objects] [--no-hands]
    python -I tools/sprite-forge/fplantern.py --flat public/art/studio/forge/torches --held public/art/studio/forge/held

The lantern is the hip lantern's own make (lanternpics.py: a six-sided iron cage under a bell cap, amber panes, a candle
in it, a knob at its foot), carried by an iron bail with a turned wooden grip. The left fist closes on the grip as it
closes on the torch's handle, in the torch's own arm, sizes, view, light and grade, so the two hands are one hand. The
lantern hangs plumb from the fist, the bail's plane across the line of sight. The candle's flame is the frames'
difference: each its own lean and reach, the panes and the hand lit a little brighter or dimmer with it.

Writes the layers as the torch's are (fpheldforge.py): `112359_1-<frame>_Lantern.png`, the lantern with its flame, and
`112359_1-0_Hands<set>.png`, the hand that holds still. `--flat` lays each record's own layer under the bare hand
(`_Hands`) into one picture a frame, `112359_<record>-<frame>.png`: what the game draws while the layers are not to be
had (the studio's listing late or switched off)."""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fparm  # noqa: E402
import fpbow  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402
import fptorch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TORCH_SPEC = os.path.join(HERE, 'specs', 'TORCH.json')
ARCHIVE = 112359

# the record: its frames, its canvas and where the game draws it in the torch's view (bottom left, flush with the foot,
# as the mod places both records), and the hand that holds still
RECORD = {'record': 1, 'frames': 4, 'canvas': [110, 138], 'screen': [0, 254], 'part': 'lantern', 'still': True}
LAYER = 'Lantern'
# the sets the torch's hands are drawn in: the armour sets and the guilds' own gauntlets (src/systems/guildSets.js)
HAND_SETS = ('Leather', 'Chain', 'Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony',
             'Orcish', 'Daedric', 'Thieves', 'Brotherhood', 'Mages', 'Fighters', 'Knights')
TORCH_RECORD, TORCH_LAYER = 0, 'Torch'

# the lantern's own sizes, metres: the bail's grip (its radius and half its length), how high its middle stands over
# the cage's top, and the bail's wire; the lantern's scale against the hip lantern's
LANTERN = {
    'grip_r': 0.0125,
    'grip_half': 0.056,
    'bail_top': 0.04,
    'bail_r': 0.0032,
    'lantern': 1.25,
}
OWN = ('lantern_iron', 'lantern_glass', 'lantern_wax', 'lantern_flame', 'bail_grip')
CLASSES = {'lantern_iron': 5, 'lantern_glass': 1, 'lantern_wax': 1, 'lantern_flame': 1, 'bail_grip': 1}
GRADE_AS = {'bail_grip': 'handle'}   # graded as the torch's handle
# the iron's own light share for share onto a dark iron's spread, its shade to its glints, as a plate's is graded
# (fparmour.METAL_GRADE): it hangs below the lamp the torch's cage was graded under, so its own render runs darker
IRON = {'share': [[1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0], [42.0, 54.0, 68.0, 84.0, 102.0, 128.0, 160.0]]}
SHEETS = OWN   # the panes are seen from inside through the near ones: every face of the lantern is drawn
# where the fist is (the view's pixels: the canvas's place plus the fist's in it), how deep, the grip's way in the
# eye's space (+X right, +Y away, +Z up), and the arm turned about the grip so the forearm falls toward the eye
FIST = (72.0, 277.0)
DEPTH = 1.5
GRIP = (0.97, 0.25, 0.0)
POSE = {'l_turn': 45.0, 'l_lean': 20.0, 'l_tilt': -25.0}
# each frame's flame: its lean across the bail's plane and along the line of sight (shares of its height), its reach
# (a share more or less), and the light it gives, a share of GLOW_POWER and of the panes' glow
FLAMES = (
    {'lean': (0.0, 0.0), 'reach': 0.0, 'light': 1.0},
    {'lean': (0.16, -0.05), 'reach': -0.1, 'light': 0.9},
    {'lean': (-0.07, 0.06), 'reach': 0.08, 'light': 1.06},
    {'lean': (-0.18, -0.04), 'reach': -0.05, 'light': 0.94},
)
GLOW_POWER = 1.6   # watts of the candle's light on the hand, through the panes
GLOW_COLOUR = (1.0, 0.66, 0.34)
GLASS_GLOW = 1.25   # the panes' own glow, before each frame's share
FLAME_GLOW = 3.0
FLAME_RIM = (255, 150, 40)   # the flame's rim, sRGB: its heart is the hip lantern's flame


def torch_spec():
    with open(TORCH_SPEC) as fh:
        return json.load(fh)


def shape():
    """The arm's sizes are the torch's (its fitted table), the lantern's its own."""
    with open(os.path.join(HERE, 'specs', 'TORCH-shape.json')) as fh:
        return {**fptorch.TORCH, **json.load(fh), **LANTERN}


# -- the lantern in the part's space


def to_part(local, S):
    """The lantern's space (lanternpics.py: z up, the hook at the origin) into the part's: the grip's middle at the
    origin, +Z along the grip, +X down the bail to the lantern (the palm's side), +Y across the bail's plane."""
    p = np.asarray(local, float) * S['lantern']
    p[:, 2] -= apex(S)
    return np.stack([-p[:, 2], p[:, 1], p[:, 0]], axis=1)


def apex(S):
    """How high the bail's grip stands in the lantern's space (scaled): over the cage's top by `bail_top`."""
    return S['bail_top']


def _triangles(faces):
    out = []
    for f in faces:
        out += [(f[0], f[k], f[k + 1]) for k in range(1, len(f) - 1)]
    return np.asarray(out, np.int64)


def _tube(points, radius, n=10):
    """A round wire along `points` (the part's space), capped."""
    from fpmodel import loft
    pts = np.asarray(points, float)
    d = np.gradient(pts, axis=0)
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    u = [np.cross(d[0], [0.0, 1.0, 0.0] if abs(d[0][1]) < 0.9 else [1.0, 0.0, 0.0])]
    for i in range(1, len(pts)):   # carried along the wire, so it never twists
        x = u[-1] - d[i] * (u[-1] @ d[i])
        u.append(x / np.linalg.norm(x))
    u = np.array([x / np.linalg.norm(x) for x in u])
    w = np.cross(d, u)
    r = np.full(len(pts), radius)
    return loft(pts, u, w, r, r, n=n, caps=(True, True))


def bail(S):
    """The bail: an iron wire from a lug on each side of the cap's brim, rising round its shoulder to the grip, and the
    turned wooden grip on it where the fist closes. In the part's space: (pieces (vertices, triangles, own index))."""
    import lanternpics
    brim = lanternpics.CAP[1] * S['lantern']
    lug = 0.0745 * S['lantern']
    top = apex(S)
    g = S['grip_half']
    pts = []
    t = np.linspace(0.0, 1.0, 14)
    for side in (1.0, -1.0):   # up from the lug, then round the shoulder in to the grip's end
        leg = [(side * (lug + 0.006 * math.sin(math.pi * k)), 0.0, brim + (top - 0.022 - brim) * k) for k in t[:9]]
        bend = [(side * (g + (lug - g) * math.cos(a)), 0.0, top - 0.022 + 0.022 * math.sin(a))
                for a in np.linspace(0.0, math.pi / 2, 8)[1:]]
        pts.append(leg + bend)
    wire = pts[0] + [(x, 0.0, top) for x in np.linspace(g * 0.8, -g * 0.8, 9)] + pts[1][::-1]
    local = np.asarray(wire)
    part = to_part(local / S['lantern'], S)   # to_part scales: the wire's places are already the lantern's size
    out = [(*_tube(part, S['bail_r']), OWN.index('lantern_iron'))]
    from fpmodel import _axis_loft
    z = np.linspace(-g, g, 16)
    swell = 1.0 + 0.16 * np.sin(np.clip((z + g) / (2 * g), 0, 1) * math.pi) ** 0.6   # turned fat in its middle
    end = np.sqrt(np.clip(1.0 - np.clip((np.abs(z) - (g - 0.006)) / 0.006, 0.0, 1.0) ** 2, 0.0, 1.0))
    r = S['grip_r'] * swell * (0.55 + 0.45 * end)
    out.append((*_axis_loft(z, r, r, n=18, caps=(True, True)), OWN.index('bail_grip')))
    return out


def candle_flame(S, frame):
    """The candle's flame in frame `frame`: a teardrop from the wick, leaning and reaching as the frame's own (FLAMES).
    The same vertices every frame, only moved."""
    import lanternpics
    k = FLAMES[frame % len(FLAMES)]
    wick = lanternpics.CANDLE[1]
    tall = 0.046 * (1.0 + k['reach'])
    rings = []
    for t in np.linspace(0.0, 1.0, 10):
        r = 0.0085 * math.sin(math.pi * min(1.0, t * 1.35) ** 0.75) * (1.0 - t) ** 0.35 + 1e-4
        lean = np.array(k['lean']) * tall * t ** 1.6
        rings.append((r, wick + 0.001 + tall * t, lean))
    verts, faces = [], []
    sides = 12
    for r, z, (lx, ly) in rings:
        for s in range(sides):
            a = 2 * math.pi * s / sides
            verts.append((lx + r * math.cos(a), ly + r * math.sin(a), z))
    for i in range(len(rings) - 1):
        for s in range(sides):
            s1 = (s + 1) % sides
            faces.append((i * sides + s, (i + 1) * sides + s, (i + 1) * sides + s1, i * sides + s1))
    return to_part(np.asarray(verts), S), _triangles(faces)


def lantern_mesh(S, frame=0):
    """The lantern alone in the part's space, its flame in `frame`: (vertices, triangles, own index)."""
    import lanternpics
    kinds = {'iron': 'lantern_iron', 'glass': 'lantern_glass', 'wax': 'lantern_wax'}
    pieces = []
    for v, f, kind in lanternpics.pieces():
        if kind in kinds:   # the hook's ring gives way to the bail, the fixed flame to each frame's
            pieces.append((to_part(v, S), _triangles(f), OWN.index(kinds[kind])))
    pieces += bail(S)
    pieces.append((*candle_flame(S, frame), OWN.index('lantern_flame')))
    return fpbow._join(pieces)


def held_radius(S):
    return S['grip_r']


def top(S):
    """The length a pose aims along: half the grip."""
    return S['grip_half']


def scene(S, pose=None):
    """The lantern in the left fist at `pose`'s joints, its flame in the pose's frame (`flame`)."""
    p = {**fptorch.REST, **(pose or {})}
    av, aq, am = fptorch.arm(S, p, held_radius(S), OWN)
    lv, lq, lm = lantern_mesh(S, int(p.get('flame', 0)))
    return fpbow._join([(lv, lq, lm + len(fparm.mats())), (av, aq, am)])


def part(S):
    return scene(S)


def posed(v, pose, S):
    out = scene(S, pose)[0]
    assert len(out) == len(v), 'every pose keeps the part\'s vertices'
    return out


def keyed_pose(S, frame=0):
    """The pose: the grip's middle on FIST at DEPTH, the grip along GRIP, turned about it so the bail hangs plumb; the
    arm's joints POSE's; the flame `frame`'s."""
    F = fpstage.unproject(FIST[0], FIST[1], DEPTH, S)
    grip = np.asarray(GRIP, float) / np.linalg.norm(GRIP)
    u, v, _ = fpstage.project((F + grip * top(S))[None], S)
    pose = {'base': [float(FIST[0]), float(FIST[1])], 'depth': DEPTH, 'tip': [float(u[0]), float(v[0])], 'roll': 0.0}
    M, _ = fpstage.pose_matrix(pose, S, top(S))
    x0, z = M[:3, 0], M[:3, 2]
    down = np.array([0.0, 0.0, -1.0])
    pose['roll'] = math.degrees(math.atan2(down @ np.cross(z, x0), down @ x0))
    return {**pose, **POSE, 'flame': frame}


# -- its materials


def _local(nt, S):
    """The lantern's own space (lanternpics.py's, unscaled) read off a surface's rest position in the part's."""
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type = 'GEOMETRY'
    at.attribute_name = 'rest'
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(at.outputs['Vector'], sep.inputs['Vector'])
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    up = nt.nodes.new('ShaderNodeMath')   # the lantern's z: the grip's height less the part's x
    up.operation = 'SUBTRACT'
    up.inputs[0].default_value = apex(S)
    nt.links.new(sep.outputs['X'], up.inputs[1])
    nt.links.new(sep.outputs['Z'], comb.inputs['X'])
    nt.links.new(sep.outputs['Y'], comb.inputs['Y'])
    nt.links.new(up.outputs['Value'], comb.inputs['Z'])
    scale = nt.nodes.new('ShaderNodeVectorMath')
    scale.operation = 'SCALE'
    scale.inputs['Scale'].default_value = 1.0 / S['lantern']
    nt.links.new(comb.outputs['Vector'], scale.inputs[0])
    return scale.outputs['Vector']


def _glass(S):
    """The hip lantern's panes (lanternpics._glass), read in the lantern's own space wherever the hand holds it: palest
    level with the flame and facing the eye, deeper amber away from it; a near pane lets some of the inside through."""
    import lanternpics
    m = lanternpics._glass()
    m.name = 'lantern_glass'
    nt = m.node_tree
    coord = next(n for n in nt.nodes if n.type == 'TEX_COORD')
    for link in list(coord.outputs['Object'].links):
        nt.links.new(_local(nt, S), link.to_socket)
    glow = next(n for n in nt.nodes if n.type == 'EMISSION')
    glow.name = 'pane_glow'
    glow.inputs['Strength'].default_value = GLASS_GLOW
    return m


def _flame():
    """The candle's flame: white-hot where it faces the eye, falling to orange at its rim."""
    import bpy
    import lanternpics
    m = bpy.data.materials.new('lantern_flame')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    facing = nt.nodes.new('ShaderNodeLayerWeight')
    facing.inputs['Blend'].default_value = 0.35
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    rim, heart = ramp.color_ramp.elements
    rim.position, rim.color = 0.0, (*lanternpics.srgb(FLAME_RIM), 1.0)
    heart.position, heart.color = 0.7, (*lanternpics.srgb(lanternpics.FLAME), 1.0)
    invert = nt.nodes.new('ShaderNodeMath')
    invert.operation = 'SUBTRACT'
    invert.inputs[0].default_value = 1.0
    nt.links.new(facing.outputs['Facing'], invert.inputs[1])
    nt.links.new(invert.outputs['Value'], ramp.inputs['Fac'])
    glow = nt.nodes.new('ShaderNodeEmission')
    glow.name = 'flame_glow'
    glow.inputs['Strength'].default_value = FLAME_GLOW
    nt.links.new(ramp.outputs['Color'], glow.inputs['Color'])
    nt.links.new(glow.outputs['Emission'], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    return m


def palette():
    """The lantern's materials: worked iron as the torch's cage (grey: the grade lays it on the metal band), the hip
    lantern's panes, its wax and flame, and the grip's oiled wood as the torch's handle."""
    import axes
    import lanternpics
    S = fpmodel.SHAPE
    wax = lanternpics._glowing('lantern_wax', lanternpics.WAX, 1.0, lit=0.15)
    flame = _flame()
    return {
        'lantern_iron': axes.iron('lantern_iron', dark=(0.3, 0.3, 0.3), light=(0.38, 0.38, 0.38), dents=90.0),
        'lantern_glass': _glass(S),
        'lantern_wax': wax,
        'lantern_flame': flame,
        'bail_grip': fpmodel._diffuse(axes.wood('bail_grip', (0.06, 0.04, 0.025), (0.16, 0.1, 0.055))),
    }


OWN_MATS = OWN
fpmodel.WEAPONS['lantern'] = {'parts': {'lantern': part}, 'mats': fptorch.mats(None, OWN), 'shape': shape(),
                              'posed': posed, 'length': lambda S, part: top(S), 'girth': lambda S, part: 0.06,
                              'root_r': lambda S, part: 0.04, 'joints': {'lantern': fptorch.JOINTS},
                              'root_seen': True}


# -- the light (fpheldforge._flame_light reads these)


def glow_point(S):
    """The candle's flame, in the part's space: its light falls through the panes on the hand above."""
    import lanternpics
    return to_part(np.array([[0.0, 0.0, lanternpics.FLAME_AT]]), S)[0]


def glow_power(pose):
    return GLOW_POWER * FLAMES[int(pose.get('flame', 0)) % len(FLAMES)]['light']


def frame_light(pose):
    """The panes and the flame as bright as the frame's flame."""
    import bpy
    share = FLAMES[int(pose.get('flame', 0)) % len(FLAMES)]['light']
    for m in bpy.data.materials:
        if m.name.startswith('lantern_glass') and m.node_tree and 'pane_glow' in m.node_tree.nodes:
            m.node_tree.nodes['pane_glow'].inputs['Strength'].default_value = GLASS_GLOW * share
        if m.name.startswith('lantern_flame') and m.node_tree and 'flame_glow' in m.node_tree.nodes:
            m.node_tree.nodes['flame_glow'].inputs['Strength'].default_value = FLAME_GLOW * share


# -- the render


def load():
    """The torch's view, shape, light and grade laid on for the lantern: the arm is the torch hand's, seen as it is."""
    import fpforge
    spec = torch_spec()
    fpstage.view(spec.get('view'))
    fpmodel.load_shape(os.path.join(HERE, 'specs', 'TORCH-shape.json'), 'lantern')
    fpforge.GRADE.clear()
    fpforge.RECORD_GRADE.clear()
    fpforge.FRAME_GRADE.clear()
    with open(os.path.join(HERE, 'specs', 'TORCH-grade.json')) as fh:
        table = json.load(fh)
    table.pop('records', None)
    table.pop('frames', None)
    table.pop('flame', None)
    fpforge.GRADE.update(table)
    for name, like in GRADE_AS.items():
        fpforge.GRADE[name] = fpforge.GRADE[like]
    fpforge.GRADE['lantern_iron'] = IRON
    fpstage.load_light(os.path.join(HERE, 'specs', 'TORCH-light.json'))
    return {'archive': str(ARCHIVE), 'weapon': 'lantern', 'module': 'fplantern', 'view': spec.get('view'),
            'records': [RECORD]}


def render(out, samples, sets, objects):
    """The lantern's layers into `out`: its own a frame (with `objects`) and the hand's in each of `sets` (None the bare
    glove). Answers {layer name: [frame pictures]}."""
    import fparmour
    import fpforge
    import fpheldforge
    import stage
    held = sys.modules[__name__]
    saved = (dict(fpmodel.WEAPONS['lantern']), fpmodel.palette, dict(fpforge.CLASSES))
    drawn = {}
    jobs = ([('object', None)] if objects else []) + [('hands', s) for s in sets]
    for kind, armour in jobs:
        spec = load()
        try:
            fpmodel.SHAPE.update(armour=armour)
            names = fptorch.mats(armour, OWN)
            fpmodel.WEAPONS['lantern'] = {**saved[0], 'mats': names}
            fpmodel.palette = fptorch.with_torch(saved[1], palette, armour)
            fpforge.CLASSES.update(CLASSES)
            fpforge.CLASSES.update(fparmour.ARMOUR_CLASSES)
            for n, g in fparmour.METAL_GRADE.items():
                fpforge.GRADE.setdefault(n, g)
            if armour:   # a set's own grade, as the torch's hands wear it
                fpforge.GRADE.update(fparmour.style(armour).get('grade', {}))
            arms = tuple(n for n in names if n not in OWN)
            name = LAYER if kind == 'object' else fpheldforge.HANDS + (armour or '')
            eye = fpheldforge._eye(spec, samples, held)
            rect = fpforge.rect(RECORD)
            fpheldforge._border(rect)
            frames = []
            for f in range(1 if kind == 'hands' else RECORD['frames']):
                pose = keyed_pose(fpmodel.SHAPE, f)
                fpheldforge._flame_light(eye, held, pose, RECORD['part'])
                if kind == 'object':
                    scr = eye.screen(pose, RECORD['part'], only=OWN, record=RECORD['record'], frame=f, sheets=SHEETS)
                else:
                    scr = eye.screen(pose, RECORD['part'], only=arms, under=OWN, record=RECORD['record'], frame=f,
                                     sheets=arms)
                pic = fpstage.crop(scr, rect)
                frames.append(pic)
                if out:
                    stage.write_png(os.path.join(out, f'{ARCHIVE}_{RECORD["record"]}-{f}_{name}.png'), pic)
            drawn[name] = frames
            print(f'{name}: {len(frames)} frame(s)', flush=True)
        finally:
            fpmodel.WEAPONS['lantern'], fpmodel.palette = saved[0], saved[1]
            fpforge.CLASSES.clear()
            fpforge.CLASSES.update(saved[2])
            fpmodel.SHAPE.pop('armour', None)
    return drawn


# -- the flat twins


def read_png(path):
    """A PNG as (h, w, 4) uint8 rows top first."""
    import bpy
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    w, h = img.size
    arr = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]
    bpy.data.images.remove(img)
    return np.clip(np.round(arr * 255), 0, 255).astype(np.uint8)


def laid(own, hands):
    """The hand laid over the held thing, as the game lays its layers (combat/heldForge.js `layHeld`, undyed)."""
    out = own.copy()
    on = hands[..., 3] > 0
    out[on] = hands[on]
    return out


def flat(held_dir, out):
    """Each record's frames, its own layer under the bare hand, into one picture a frame in `out`."""
    import stage
    os.makedirs(out, exist_ok=True)
    for record, layer, frames in ((TORCH_RECORD, TORCH_LAYER, 4), (RECORD['record'], LAYER, RECORD['frames'])):
        hands = read_png(os.path.join(held_dir, f'{ARCHIVE}_{record}-0_Hands.png'))
        for f in range(frames):
            own = read_png(os.path.join(held_dir, f'{ARCHIVE}_{record}-{f}_{layer}.png'))
            path = os.path.join(out, f'{ARCHIVE}_{record}-{f}.png')
            stage.write_png(path, laid(own, hands))
            print(path, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='', help='the held layers\' folder')
    ap.add_argument('--hands', default=','.join(('Hands',) + HAND_SETS), help='Hands for the bare glove, or a set')
    ap.add_argument('--objects', action='store_true', help='render the lantern\'s own layer too')
    ap.add_argument('--no-hands', action='store_true')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--flat', default='', help='write the flat pictures here, from the layers in --held')
    ap.add_argument('--held', default='', help='the held layers\' folder the flat pictures are laid from')
    args = ap.parse_args()
    if args.flat:
        flat(args.held or args.out, args.flat)
        return
    if args.out:
        os.makedirs(args.out, exist_ok=True)
    sets = [] if args.no_hands else [None if h == 'Hands' else h for h in args.hands.split(',') if h]
    render(args.out, args.samples, sets, args.objects)


if __name__ == '__main__':
    main()
