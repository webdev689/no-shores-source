"""The healing flask in first person, drunk: the flask the figure drinks from (props3p.py `flask`: a round belly of red
draught glowing through its glass, a clear neck, a cork) in the right fist, the arm every first-person hand wears
(fparm.py), closed round the neck's foot where it leaves the belly, the neck and the cork standing clear past it. The
flask is the hand's size to it as the figure's is (the first-person hand is drawn `fpguns.ARM['hand']` times a man's),
its glass a clear shell round the draught, pale at its rim, the draught darker at its foot and bright at its top. Drawn as held things are (fpheldforge.py): the
flask alone, and the hands alone in the bare glove or any armour set, cut where the flask lies nearer the eye. The
spec's one record is the drink's four frames over its second, as the figure's: brought up from below the screen's
right foot, raised before the face, tipped up at the lips, lowered away. Its draught lights the hand red.

    python -I tools/sprite-forge/fpflask.py --spec tools/sprite-forge/specs/FLASK.json            # its poses
    python -I tools/sprite-forge/fpflask.py --spec tools/sprite-forge/specs/FLASK.json --grade    # the hands' grade
    python -I tools/sprite-forge/fpheldforge.py --spec tools/sprite-forge/specs/FLASK.json \\
        --out public/art/studio/forge/held --objects

The poses are keyed by hand (no picture of Daggerfall's to fit them to): each frame's `holds` gives where on the
screen the fist's middle lies, how far before the eye, the way up the flask from its foot to its mouth, and the way the
forearm leaves the wrist, in the eye's space (+X right, +Y away, +Z up).

The part's space: the root the fist's middle on the neck's axis, +Z down the flask to its foot, which lies beyond the
fist from the eye however the flask is held (fpstage.pose_matrix aims a part away from the eye), so a flask tipped up
at the lips, its mouth nearer the eye than the fist, can be posed."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # run as a script, the forge's modules beside it
import fparm  # noqa: E402
import fpguns  # noqa: E402
import fptorch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OWN = ('flask_draught', 'flask_glass', 'flask_cork', 'flask_shell')
CLASSES = {n: 7 for n in OWN}
SHEETS = ()
SHAPE = {'focal': 200.0, 'aspect': 1.0, **fpguns.ARM, 'grip_tilt': -10.0}
SCALE = SHAPE['hand']   # props3p's sizes, at the first-person hand's own
BELLY = (0.052, 0.05, 0.052)   # props3p's belly: its middle's height, its radius, its half height
NECK = (0.095, 0.15, [(0, 0.02), (0.3, 0.014), (1, 0.015)])   # props3p's neck: from, to, its profile
CORK = (0.145, 0.165, [(0, 0.012), (1, 0.013)])
HEIGHT = CORK[1] * SCALE   # the flask's foot to its mouth
# the fist round the neck's foot, up from the flask's foot: its lower knuckles on the belly's shoulder
HOLD = 0.107 * SCALE
SHELL = 1.06   # the glass round the draught, its size to it
GLOW_POWER = 3.0   # watts of the draught's light on the hand
GLOW_COLOUR = (0.9, 0.08, 0.04)   # the draught's own glow (props3p.py `prop_draught`)
DRAUGHT_GLOW = 0.6   # its strength, the figure's 1.5 less the light the eye's lamp lays on it


def _profile(z0, z1, rings, n):
    """props3p's loft profile (shares up, radius) as rings from `z0` to `z1`."""
    t = np.linspace(0.0, 1.0, n)
    s, r = zip(*rings)
    return z0 + (z1 - z0) * t, np.interp(t, s, r)


def _belly(k):
    """The belly's ellipsoid, `k` times props3p's about its middle, at the hand's size."""
    from fpmodel import _axis_loft
    mid, r, half = (x * SCALE for x in BELLY)
    a = np.linspace(-math.pi / 2, math.pi / 2, 20)
    rr = r * k * np.cos(a) + 1e-4
    return _axis_loft(mid + half * k * np.sin(a), rr, rr, n=32)


def _lathe(z0, z1, rings, n, caps):
    from fpmodel import _axis_loft
    z, r = _profile(z0 * SCALE, z1 * SCALE, [(s, x * SCALE) for s, x in rings], n)
    return _axis_loft(z, r, r, n=20, caps=caps)


def flask_mesh():
    """The flask in its own space, its foot at the origin and +Z up to its mouth, as props3p.py `flask` builds it at
    the hand's size, its draught in a glass shell: (vertices, triangles, material index among OWN)."""
    return fptorch._join([(*_belly(1.0), 0), (*_lathe(*NECK, 8, (False, True)), 1), (*_lathe(*CORK, 4, (True, True)), 2),
                          (*_belly(SHELL), 3)])


def neck_r():
    """The neck's radius where the fist closes on it."""
    z, r = _profile(NECK[0] * SCALE, NECK[1] * SCALE, [(s, x * SCALE) for s, x in NECK[2]], 64)
    return float(np.interp(HOLD, z, r))


def length(S, part=None):
    """The fist to the flask's foot: what a pose aims along."""
    return HOLD


def _arm(S):
    """The left arm closed round the neck (fptorch.arm, the torch's fist) and the way its forearm runs from the wrist to
    the elbow; laid as a right one by fpguns._laid."""
    v, q, m = fptorch.arm(S, {'l_tilt': S['grip_tilt']}, neck_r(), OWN)
    elbow, wrist = fptorch._marks_of(fptorch.grip_shape(S, neck_r()), v)
    return v, q, m, fpguns._unit(v[elbow].mean(axis=0) - v[wrist].mean(axis=0))


def fore(S):
    """The way the right forearm leaves the wrist, in the part's space."""
    return np.array([-1.0, 0.0, 0.0])


def scene(S, pose=None):
    """The flask and the right arm in the part's space: (vertices, triangles, material a triangle among
    fptorch.mats(armour, OWN)). The fist round the neck, its thumb toward the mouth as the torch's is toward its head,
    its forearm leaving toward -X."""
    fv, fq, fm = flask_mesh()
    fv = fv - np.array([0.0, 0.0, HOLD])
    axis = np.array([0.0, 0.0, 1.0])
    arm = fpguns._laid(_arm(S), np.zeros(3), axis, fore(S), 0.0, mirror=True)
    v, q, m = fptorch._join([(fv, fq, fm + len(fparm.mats())), arm])
    return v * np.array([1.0, -1.0, -1.0]), q, m   # turned half about X: +Z to the foot


def part(S):
    return scene(S)


def posed(v, pose, S):
    return v


def _lets_light(m):
    """`m` letting light through to what lies past it (its shadow rays see through it), so the draught's light, from
    inside the belly, falls on the hand through the glass."""
    nt = m.node_tree
    out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    surface = out.inputs['Surface'].links[0].from_socket
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(nt.nodes.new('ShaderNodeLightPath').outputs['Is Shadow Ray'], mix.inputs['Fac'])
    nt.links.new(surface, mix.inputs[1])
    nt.links.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs['BSDF'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m


# the draught's colour up the belly, foot to top (linear): dark at its foot, bright at its top, a pale line where it
# meets the glass's shoulder, as a liquid in a bottle
DRAUGHT_RAMP = ((0.0, (0.16, 0.005, 0.003)), (0.75, (0.9, 0.08, 0.04)), (0.86, (1.0, 0.32, 0.18)),
                (0.9, (0.9, 0.08, 0.04)))


def _draught(m):
    """`m` (the figure's draught) shaded up the belly by DRAUGHT_RAMP, read off the part's rest position."""
    nt = m.node_tree
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_type, at.attribute_name = 'GEOMETRY', 'rest'
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(at.outputs['Vector'], sep.inputs['Vector'])
    up = nt.nodes.new('ShaderNodeMapRange')
    mid, _, half = (x * SCALE for x in BELLY)
    up.inputs['From Min'].default_value, up.inputs['From Max'].default_value = HOLD - (mid - half), HOLD - (mid + half)
    nt.links.new(sep.outputs['Z'], up.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    first, last = ramp.color_ramp.elements
    first.position, first.color = DRAUGHT_RAMP[0][0], (*DRAUGHT_RAMP[0][1], 1)
    last.position, last.color = DRAUGHT_RAMP[-1][0], (*DRAUGHT_RAMP[-1][1], 1)
    for at_, rgb in DRAUGHT_RAMP[1:-1]:
        ramp.color_ramp.elements.new(at_).color = (*rgb, 1)
    nt.links.new(up.outputs['Result'], ramp.inputs['Fac'])
    b = nt.nodes['Principled BSDF']
    for name in ('Base Color', 'Emission Color'):
        nt.links.new(ramp.outputs['Color'], b.inputs[name])
    b.inputs['Emission Strength'].default_value = DRAUGHT_GLOW
    return m


SHELL_RIM = (0.85, 0.9, 0.92)   # the glass's rim, where it is seen edge on (linear)


def _shell():
    """The belly's glass: clear where it is seen through, pale toward its rim, with the lamps' highlights on it."""
    import bpy
    m = bpy.data.materials.new('flask_shell')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    edge = nt.nodes.new('ShaderNodeLayerWeight')
    edge.inputs['Blend'].default_value = 0.25
    rim = nt.nodes.new('ShaderNodeMath')   # sharpened, so only the rim is pale
    rim.operation = 'POWER'
    rim.inputs[1].default_value = 2.0
    nt.links.new(edge.outputs['Facing'], rim.inputs[0])
    gloss = nt.nodes.new('ShaderNodeBsdfGlossy')
    gloss.inputs['Roughness'].default_value = 0.08
    gloss.inputs['Color'].default_value = (*SHELL_RIM, 1)
    pale = nt.nodes.new('ShaderNodeEmission')
    pale.inputs['Color'].default_value = (*SHELL_RIM, 1)
    pale.inputs['Strength'].default_value = 0.6
    lit = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(gloss.outputs['BSDF'], lit.inputs[0])
    nt.links.new(pale.outputs['Emission'], lit.inputs[1])
    # the highlights everywhere, the pale glass only toward the rim
    clear = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs['BSDF'], clear.inputs[0])
    shine = nt.nodes.new('ShaderNodeBsdfGlossy')
    shine.inputs['Roughness'].default_value = 0.05
    nt.links.new(shine.outputs['BSDF'], clear.inputs[1])
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(rim.outputs['Value'], mix.inputs['Fac'])
    nt.links.new(clear.outputs['Shader'], mix.inputs[1])
    nt.links.new(lit.outputs['Shader'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
    return m


def palette():
    """The flask's materials, the figure's own (props3p.py): the draught glowing red, shaded up the belly, the clear
    neck, the cork's wood, and the belly's glass round the draught."""
    import props3p
    M = props3p.palette()
    return {'flask_draught': _lets_light(_draught(M['prop_draught'].copy())),
            'flask_glass': _lets_light(M['prop_flaskglass'].copy()), 'flask_cork': M['prop_wood'],
            'flask_shell': _lets_light(_shell())}


def variants(rec):
    return ('plain',)


def set_variant(S, variant):
    pass


def object_name(rec, variant):
    return 'Flask'


def record_name(rec, r, variant):
    return r


def over(eye, scr, pose, part, frame):
    return scr


def glow_point(S):
    """The belly's middle, in the part's space: the draught's light on the fist."""
    return np.array([0.0, 0.0, HOLD - BELLY[0] * SCALE])


def hold_pose(S, hold):
    """A hand-keyed hold made a pose (fpstage.pose_matrix's base, depth, tip and roll): the fist's middle on screen
    point `fist` at `depth` metres, the flask up `way` toward its mouth, turned about it so its forearm leaves as near
    `arm` as it can (each in the eye's space)."""
    import fpstage
    d = -fpguns._unit(hold['way'])   # the part runs from the fist to the foot
    at = fpstage.unproject(hold['fist'][0], hold['fist'][1], hold['depth'], S)
    tip = at + d * length(S)
    (bu, tu), (bv, tv), (bd, _) = fpstage.project(np.stack([at, tip]), S)
    pose = {'base': [float(bu), float(bv)], 'depth': float(bd), 'tip': [float(tu), float(tv)], 'roll': 0.0}
    M, _ = fpstage.pose_matrix(pose, S, length(S))
    assert M[:3, 2] @ d > 0.999, f'a hold whose foot is nearer the eye than its fist cannot be posed: {hold}'
    want = fpguns._unit(hold['arm'])
    f = fore(S)
    best = max(range(0, 360, 2), key=lambda deg: float(want @ (
        (fpguns._turned(M[:3, 0], M[:3, 2], deg) * f[0]) + (fpguns._turned(M[:3, 1], M[:3, 2], deg) * f[1]))))
    pose['roll'] = float(best)
    return pose


def write_fit(spec_path):
    """The spec's poses (<spec>-fit.json) from its record's holds, each frame a pose fpstage.pose_matrix places."""
    import fpforge
    import fpmodel
    spec = fpforge.load(spec_path)
    table = {}
    for r, rec in enumerate(spec['records']):
        S = fpmodel.shape_for(r)
        for f, h in enumerate(rec['holds']):
            table[f'{r}:{f}'] = {**hold_pose(S, h), 'canvas': fpforge.rect(rec)}
    fpforge.write_table(spec_path[:-len('.json')] + '-fit.json', table)
    return table


def write_grade(spec_path):
    """The hands' grade under the flask's light, as the guns' (fpguns.write_grade), so they shade as the fists do."""
    __import__('bpy')
    import json
    import fpforge
    import fpheldforge
    import fpmodel
    spec = fpforge.load(spec_path)
    weapon = spec['weapon']
    fpmodel.WEAPONS[weapon] = {**fpmodel.WEAPONS[weapon], 'mats': fptorch.mats(None, OWN)}
    fpmodel.palette = fptorch.with_torch(fpmodel.palette, palette, None)
    held = sys.modules[__name__]
    eye = fpheldforge._eye(spec, 32, held)
    part_name, pose = fpforge.part_of(spec, spec['records'][0]), fpforge.FIT['0:1']   # raised, the hand in full view
    fpheldforge._flame_light(eye, held, pose, part_name)
    work = eye.screen(pose, part_name, raw=True)
    ids = eye.id_map(pose, part_name)
    lum = work[..., :3].astype(np.float64).mean(axis=2)
    ref = json.load(open(os.path.join(HERE, 'specs', f'{fpguns.HAND_GRADE_FROM}-grade.json')))
    table = {}
    for n in fparm.mats():
        (key, g), = ref[n].items()
        seen = (ids == eye.names.index(n) + 1) & (work[..., 3] > 0)
        if seen.sum() < 20:
            table[n] = ref[n]
            continue
        src = np.percentile(lum[seen], np.linspace(0.0, 100.0, len(g[0])))
        table[n] = {key: [[round(float(v), 2) for v in src], *g[1:]]}
    with open(spec_path[:-len('.json')] + '-grade.json', 'w') as fh:
        json.dump(table, fh, indent=1)
        fh.write('\n')
    return table


if __name__ == '__main__':
    path = sys.argv[sys.argv.index('--spec') + 1]
    write_grade(path) if '--grade' in sys.argv else write_fit(path)
