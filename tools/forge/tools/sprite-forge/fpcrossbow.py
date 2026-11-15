"""The owner's crossbow in first person, carried at a run (gunSprint.js draws it as a gun's carry): each metal's
own model (gear.py `build_crossbow`, its own materials and colours, never dyed) in the arm every first-person hand
wears (fparm.py), held as the guns are (fpguns.py). The right fist closes on the tiller behind the lock, the left hand
lies open under the stock behind the prod. The spec's one record is the carry, six frames a stride.

The crossbow's space is the guns': +Z along the bolt toward the prod, the right fist's grip at the origin, its belly
(the lock, the trigger) toward +X. The owner's model is aimed along +X with its up +Z (gear.py's held frame)."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # run as a script, the forge's modules beside it
import fparm  # noqa: E402
import fpguns  # noqa: E402
import fptorch  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
# the owner's materials differ in name and count by metal: each takes a role in the order its model lists them
OWN = tuple(f'xbow{i}' for i in range(8))
EXTRA = fptorch.EXTRA
CLASSES = {n: 7 for n in OWN}
SHEETS = ()
GRADE_AS = {}
METALS = ('iron', 'steel', 'silver', 'elven', 'dwarven', 'mithril')   # gear.py CROSSBOW_METALS
SCALE = 0.70 / 0.60   # gear.py CROSSBOW_LEN over CROSSBOW_MODEL_LEN: the size a forged hand holds it at
GRIP = np.array([-0.150, 0.0, -0.006])   # the right fist's place on the tiller, in the model's own frame
TIP = np.array([0.180, 0.0, 0.030])      # the prod's front over the bolt's head
TILLER_FOOT = -0.037                     # the tiller's underside, model metres up
SHAPE = {'focal': 200.0, 'aspect': 1.0, **fpguns.ARM, 'kind': 'crossbow', 'metal': 'iron', 'grip_r': 0.024,
         'grip_rake': 62.0, 'grip_at': 0.0, 'grip_turn': 0.0, 'grip_tilt': -15.0, 'fore_r': 0.0175, 'fore_at': -0.06,
         'fore_palm': 0.012, 'fore_side': 0.0, 'fore_turn': 30.0}

_MESHES = {}   # metal -> (vertices, triangles, role a triangle), in the crossbow's space
_ROLES = {}    # metal -> the model's material names, in role order


def _to_space(co):
    """Model points (aim +X, up +Z) to the crossbow's space (bolt +Z, belly +X), the grip at the origin."""
    p = (np.asarray(co, dtype=np.float64) - GRIP) * SCALE
    return np.stack([-p[..., 2], p[..., 1], p[..., 0]], axis=-1)


def _load(metal):
    """Append `metal`'s crossbow, read its mesh once, and answer its materials by role; its objects let go."""
    import bpy
    import gear
    obs = gear.build_crossbow(metal)
    mats = []
    for ob in obs:
        for slot in ob.material_slots:
            if slot.material and slot.material not in mats:
                mats.append(slot.material)
    if metal not in _MESHES:
        dg = bpy.context.evaluated_depsgraph_get()
        vs, qs, ms, at = [], [], [], 0
        for ob in obs:
            me = ob.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            mw = np.array(ob.matrix_world)
            co = np.array([v.co[:] for v in me.vertices], dtype=np.float64) @ mw[:3, :3].T + mw[:3, 3]
            tris = np.array([t.vertices[:] for t in me.loop_triangles], dtype=np.int64).reshape(-1, 3)
            a, b, c = (co[tris[:, k]] for k in range(3))
            if np.einsum('ij,ij->i', a, np.cross(b, c)).sum() < 0:   # wound inward: the eye hides back faces
                tris = tris[:, ::-1]
            vs.append(_to_space(co))
            qs.append(tris + at)
            ms.append(np.array([mats.index(ob.material_slots[t.material_index].material) for t in me.loop_triangles],
                               dtype=np.int64))
            at += len(co)
            ob.evaluated_get(dg).to_mesh_clear()
        _MESHES[metal] = (np.concatenate(vs), np.concatenate(qs), np.concatenate(ms))
        _ROLES[metal] = [m.name for m in mats]
    for ob in obs:
        bpy.data.objects.remove(ob, do_unlink=True)
    by_name = {m.name: m for m in mats}
    return [by_name.get(n) for n in _ROLES[metal]]


def root(S=None):
    """The part's root in the crossbow's space: on the bolt's line over the left hand, behind the prod."""
    S = S or SHAPE
    return _to_space(np.zeros(3)) + np.array([0.0, 0.0, S['fore_at'] * SCALE])


def length(S, part=None):
    """How far the prod's front reaches up the part's axis from the root: what a pose aims along."""
    return float(_to_space(TIP)[2] - root(S)[2])


def _grip_axis(S):
    r = math.radians(S['grip_rake'])
    return np.array([-math.cos(r), 0.0, math.sin(r)])


def _grip_front(S):
    r = math.radians(S['grip_rake'])
    return np.array([math.sin(r), 0.0, math.cos(r)])


def _arm(S, radius, tilt):
    """fpguns._arm with the crossbow's own materials counted."""
    v, q, m = fptorch.arm(S, {'l_tilt': tilt}, radius, OWN)
    elbow, wrist = fptorch._marks_of(fptorch.grip_shape(S, radius), v)
    return v, q, m, fpguns._unit(v[elbow].mean(axis=0) - v[wrist].mean(axis=0))


def scene(S, pose=None):
    """The crossbow and its arms in the part's space: (vertices, triangles, material a triangle among
    fptorch.mats(armour, OWN)). The right fist on the tiller, its forearm dropping back; the left hand open under the
    stock, cradling it."""
    metal = S.get('metal', 'iron')
    if metal not in _MESHES:
        _load(metal)
    xv, xq, xm = _MESHES[metal]
    g = _grip_axis(S)
    pieces = [(xv, xq, xm + len(fparm.mats())),
              fpguns._laid(_arm(S, S['grip_r'], S['grip_tilt']), g * S['grip_at'], g, -_grip_front(S),
                           S['grip_turn'], mirror=True)]
    r = root(S)
    foot = float(_to_space(np.array([0.0, 0.0, TILLER_FOOT]))[0])
    at = (foot + S['fore_palm'], S['fore_side'], r[2])
    pieces.append(fpguns._cradle(S, at, (0.0, -math.cos(math.radians(S['fore_turn'])),
                                         math.sin(math.radians(S['fore_turn']))), OWN))
    v, q, m = fptorch._join(pieces)
    return v - r, q, m


def part(S):
    return scene(S)


def posed(v, pose, S):
    return v


# the owner's materials dressed for the eye: lit by the first-person lamps, not mirrors of a world the eye has none of
WOOD_LOOK = {'Metallic': 0.0, 'Roughness': 0.8, 'Specular IOR Level': 0.2}
METAL_LOOK = {'Metallic': 0.45, 'Roughness': 0.35}


def dress(m):
    """`m` dressed for the eye, its colours its own: its wood matte, its metal more lamp-lit than mirrored."""
    look = WOOD_LOOK if m.name.lower().startswith('wood') else METAL_LOOK
    for node in m.node_tree.nodes if m.node_tree else ():
        if node.type == 'BSDF_PRINCIPLED':
            for k, v in look.items():
                node.inputs[k].default_value = v
            for link in list(node.inputs['Normal'].links):   # its bump is made for the model's own size, not ours
                m.node_tree.links.remove(link)
    return m


def palette():
    """The metal the shape names, in the owner's own materials by role, dressed; a role its model has no material for
    gets one nothing wears."""
    import bpy
    import fpmodel
    mats = _load(fpmodel.SHAPE.get('metal', 'iron'))
    out = {}
    for i, n in enumerate(OWN):
        m = mats[i] if i < len(mats) else None
        if m is None:
            m = bpy.data.materials.get(f'xbow.unused.{i}') or bpy.data.materials.new(f'xbow.unused.{i}')
            if m.node_tree is None:
                m.use_nodes = True
        out[n] = dress(m)
    return out


def variants(rec):
    return METALS


def set_variant(S, variant):
    S['metal'] = variant


def object_name(rec, variant):
    return f'Crossbow{variant.capitalize()}'


def record_name(rec, r, variant):
    return r


def over(eye, scr, pose, part, frame):
    return scr


def holds(rec):
    return fpguns.holds(rec)


def hold_pose(S, hold):
    """fpguns.hold_pose with the crossbow's own root and reach."""
    import fpstage
    y, p = math.radians(hold['yaw']), math.radians(hold['pitch'])
    d = np.array([-math.sin(y) * math.cos(p), math.cos(y) * math.cos(p), math.sin(p)])
    down = fpguns._unit(np.array([0.0, 0.0, -1.0]) - d * -d[2])
    belly = fpguns._turned(down, d, hold.get('cant', 0.0))
    g = fpstage.unproject(hold['grip'][0], hold['grip'][1], hold['depth'], S)
    r = root(S)
    at = g - r[2] * -d - (-r[0]) * belly
    tip = at + d * length(S)
    (bu, tu), (bv, tv), (bd, _) = fpstage.project(np.stack([at, tip]), S)
    pose = {'base': [float(bu), float(bv)], 'depth': float(bd), 'tip': [float(tu), float(tv)], 'roll': 0.0}
    M, _ = fpstage.pose_matrix(pose, S, length(S))
    w0, dd = M[:3, 0], M[:3, 2]
    pose['roll'] = math.degrees(math.atan2(float(belly @ np.cross(dd, w0)), float(belly @ w0)))
    return pose


def write_fit(spec_path):
    """The spec's poses (<spec>-fit.json) from its record's holds, each frame a pose fpstage.pose_matrix places."""
    __import__('bpy')
    import fpforge
    import fpmodel
    spec = fpforge.load(spec_path)
    table = {}
    for r, rec in enumerate(spec['records']):
        S = fpmodel.shape_for(r)
        for f, h in enumerate(holds(rec)):
            table[f'{r}:{f}'] = {**hold_pose(S, h), 'canvas': fpforge.rect(rec)}
    fpforge.write_table(spec_path[:-len('.json')] + '-fit.json', table)
    return table


def write_grade(spec_path):
    """The hands' grade under the crossbow's light (fpguns.write_grade), so they shade as the fists do."""
    __import__('bpy')
    import json
    import fpforge
    import fpheldforge
    import fpmodel
    spec = fpforge.load(spec_path)
    weapon = spec['weapon']
    fpmodel.WEAPONS[weapon] = {**fpmodel.WEAPONS[weapon], 'mats': fptorch.mats(None, OWN)}
    fpmodel.palette = fptorch.with_torch(fpmodel.palette, palette, None)
    eye = fpheldforge._eye(spec, 32, sys.modules[__name__])
    part_name, pose = fpforge.part_of(spec, spec['records'][0]), fpforge.FIT['0:0']
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
