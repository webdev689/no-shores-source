"""The healing flask in first person, drunk: the flask the figure drinks from (props3p.py `flask`: a round belly of red
draught glowing through its glass, a clear neck, a cork, 0.16 m tall) in the right fist, the arm every first-person
hand wears (fparm.py), closed round its neck as quaff.py closes it. Drawn as held things are (fpheldforge.py): the
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

The part's space is the torch's (fptorch.py): the root the fist's middle on the neck's axis, +Z up the flask toward its
mouth."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # run as a script, the forge's modules beside it
import fparm  # noqa: E402
import fpguns  # noqa: E402
import fptorch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OWN = ('flask_draught', 'flask_glass', 'flask_cork')
EXTRA = fptorch.EXTRA
CLASSES = {n: 7 for n in OWN}
SHEETS = ()
GRADE_AS = {}
HEIGHT = 0.16   # the flask's foot to its mouth (quaff.py HEIGHT)
# the fist round its neck, up from its foot: higher than the figure's (quaff.py HOLD, 0.11), as near the eye a fist
# that low would close inside the belly
HOLD = 0.125
SHAPE = {'focal': 200.0, 'aspect': 1.0, **fpguns.ARM, 'grip_tilt': -10.0}
GLOW_POWER = 3.0   # watts of the draught's light on the hand
GLOW_COLOUR = (0.9, 0.08, 0.04)   # the draught's own glow (props3p.py `prop_draught`)
DRAUGHT_GLOW = 0.5   # its strength, the figure's 1.5 less the light the eye's lamp lays on it


def _profile(z0, z1, rings, n):
    """props3p's loft profile (shares up, radius) as rings from `z0` to `z1`."""
    t = np.linspace(0.0, 1.0, n)
    s, r = zip(*rings)
    return z0 + (z1 - z0) * t, np.interp(t, s, r)


def flask_mesh():
    """The flask in its own space, its foot at the origin and +Z up to its mouth, as props3p.py `flask` builds it:
    (vertices, triangles, material index among OWN)."""
    from fpmodel import _axis_loft
    a = np.linspace(-math.pi / 2, math.pi / 2, 18)   # the belly: an ellipsoid 0.05 across, 0.052 up
    belly = _axis_loft(0.052 + 0.052 * np.sin(a), 0.05 * np.cos(a) + 1e-4, 0.05 * np.cos(a) + 1e-4, n=28)
    neck = _axis_loft(*(lambda z, r: (z, r, r))(*_profile(0.095, 0.15, [(0, 0.02), (0.3, 0.014), (1, 0.015)], 8)),
                      n=20, caps=(False, True))
    cork = _axis_loft(*(lambda z, r: (z, r, r))(*_profile(0.145, 0.165, [(0, 0.012), (1, 0.013)], 4)), n=16,
                      caps=(True, True))
    return fptorch._join([(*belly, 0), (*neck, 1), (*cork, 2)])


def neck_r():
    """The neck's radius where the fist closes on it."""
    z, r = _profile(0.095, 0.15, [(0, 0.02), (0.3, 0.014), (1, 0.015)], 64)
    return float(np.interp(HOLD, z, r))


def length(S, part=None):
    """The fist to the flask's mouth: what a pose aims along."""
    return HEIGHT - HOLD


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
    return fptorch._join([(fv, fq, fm + len(fparm.mats())), arm])


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


def palette():
    """The flask's materials, the figure's own (props3p.py): the draught glowing red, the clear glass, the cork's wood."""
    import props3p
    M = props3p.palette()
    draught = M['prop_draught'].copy()   # lit by the eye's own lamp too: its glow held under white, a deep red
    draught.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = DRAUGHT_GLOW
    return {'flask_draught': _lets_light(draught), 'flask_glass': _lets_light(M['prop_flaskglass'].copy()),
            'flask_cork': M['prop_wood']}


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
    return np.array([0.0, 0.0, 0.052 - HOLD])


def hold_pose(S, hold):
    """A hand-keyed hold made a pose (fpstage.pose_matrix's base, depth, tip and roll): the fist's middle on screen
    point `fist` at `depth` metres, the flask up `way` toward its mouth, turned about it so its forearm leaves as near
    `arm` as it can (each in the eye's space)."""
    import fpstage
    d = fpguns._unit(hold['way'])
    at = fpstage.unproject(hold['fist'][0], hold['fist'][1], hold['depth'], S)
    tip = at + d * length(S)
    (bu, tu), (bv, tv), (bd, _) = fpstage.project(np.stack([at, tip]), S)
    pose = {'base': [float(bu), float(bv)], 'depth': float(bd), 'tip': [float(tu), float(tv)], 'roll': 0.0}
    M, _ = fpstage.pose_matrix(pose, S, length(S))
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
