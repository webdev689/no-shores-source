"""The first-person sword (WEAPON04.CIF): the whole sword in the right fist, one part with the arm that holds it.

Every sword from the tanto to the dai-katana swings it, as every sword swings Daggerfall's long blade. It is the sword
characters wear in the world (gear.py `build_sword`): its metal's hilt (metals.py) and blade (blades.py), whole, with
its fins and inlay. The arm is the one every first-person hand wears (fpdagger.py), its fist closed round the grip just
under the guard, as the dagger's fist closes on its own grip. The part's space is the dagger's: its root the fist's
middle, +Z up the blade, the edges along X, the flats toward -Y and +Y. The forearm turns at the wrist while the fist
keeps hold (`lean`, `swing`).

Its poses are fitted to Diverse Weapons' longsword (dwReference.mjs), whose frames show the hilt and the fist where
Daggerfall's cut the blade off below the guard. The blade is drawn grey, lit by the lamp at the eye and graded by the
archive's tables (`GRADED_AS`), each frame's own grade over them, so the game dyes it by its metal; the hilt keeps its
metal's own colours, which no dye touches."""
import numpy as np

import blades
import fparm
import fpdagger
import fphand
from fpbow import GLOVE, _off
from fpdagger import ARM_FROM, MIRROR, _frame, _join, arm_shape  # noqa: F401  (ARM_FROM: fpmodel's)

STEEL = 'Steel'   # the sword the poses are fitted with: every metal is held at them
# (name, the fit's step, its bounds, the prior's unit, its rest): the forearm turned at the wrist toward the palm and
# toward the little finger, the fist held still on the grip, within what a wrist round a sword's grip bends
JOINTS = (
    ('lean', 6.0, (-60.0, 60.0), 25.0, 0.0),
    ('swing', 5.0, (-35.0, 35.0), 20.0, 0.0),
)
REST = {j[0]: j[4] for j in JOINTS}
# the poses set by hand, which the fit leaves as they are (fpfit.py): the idle raised and leaning out, its edge forward
# and a little of its flat in sight, the fingers closed round the grip in sight (the owner's)
SET = ('0:0',)
SHAPE = {
    'grip_r': 0.0165,   # the grip the fist closes on: the metals' run 0.015 to 0.021 across under their wraps
}
SHAPE.update(arm_shape())
GAP = 0.004   # metres between the fist's index and the guard's underside: room for a gauntlet's plate
# the sword's own materials, after the arm's: the blade's grey, its veins' glow, its groove's darker metal and its pale
# inlay (blades.py), then the hilt's roles (metals.py HILT_ROLES); a metal's hilt may wear materials of its own past them
SWORD_MATS = ('sword_blade', 'sword_glow', 'sword_groove', 'sword_inlay', 'sword_fit', 'sword_grip',
              'sword_blade_glow')
BLADE_OF = {'blade': 'sword_blade', 'glow': 'sword_glow', 'blade_groove': 'sword_groove', 'blade_inlay': 'sword_inlay'}
HILT_OF = {'fit': 'sword_fit', 'grip': 'sword_grip', 'blade': 'sword_blade', 'blade_glow': 'sword_blade_glow'}
DESIGN = {'metal': STEEL}   # the sword in the fist (fpmetals.py and fplayers.py lay each metal's)
# what the fit reads each material as: the blade the reference's grey, the hilt and the glove its brass and leather;
# the sleeve, which the reference's long gauntlet hides, against nothing
CLASSES = {'sword_blade': 5, 'sword_groove': 5, 'sword_fit': 6, 'sword_grip': 6, 'sword_blade_glow': 6}
FIT_CLASSES = {'linen': 1}
# the blade graded and lit as the archive's tables name it (WEAPON04-grade.json and -light.json `blade`, the long
# blade's), its groove too; each frame's own grade of them over that (fpcolour.py --frames)
GRADED_AS = {'sword_blade': 'blade', 'sword_groove': 'blade'}
# what the fit weighs: the blade's place first, the hilt and fist in sight after it. The arm is every picture's, not
# the reference's bulkier gauntlet, so its outline must not pull the sword off the reference's
WEIGHTS = {'sil': 0.3, 5: 1.0, 6: 0.35, 1: 0.02, 'light': 0.15}


_OWN = {}
SHORT = 'Short'   # a make's name past its metal's for its short sword of the owner's (`OrcishShort`)
# each role of a sword of the owner's (gear.py `OWNER_ROLES`) by its material in the part: the blade the forged blade's
# grey for the dye, its fittings and grip the hilt's slots, any other role one of its own
OWNER_SLOT = {'blade': 'sword_blade', 'fit': 'sword_fit', 'grip': 'sword_grip'}
# a sword of the owner's turned half round its grip in the fist, so a pose that turns its edge (the frame's +X) away
# from the eye shows the fingers closed round the grip (the idle, `SET`)
OWNER_TURN = np.array([-1.0, -1.0, 1.0])


def owner(metal):
    """The sword of the owner's a make draws (`Orcish`, its short sword `OrcishShort`): (its metal, short), or None
    where the forge makes the sword (metals.py, blades.py)."""
    import bpy  # noqa: F401  (gear.py reads mathutils, which Blender brings)
    import gear
    short = metal.endswith(SHORT) and metal != SHORT
    base = metal[:-len(SHORT)] if short else metal
    return (base, short) if gear.owner_sword(base, short) else None


def _owner_slots():
    """Each role's material name in the part, for a make the owner modelled."""
    import gear
    return [OWNER_SLOT.get(r, f'sword:{r}') for r in gear.OWNER_ROLES]


def own_mats(metal):
    """The materials `metal`'s hilt makes of its own (silver's braid, ebony's trim; the owner's cord), by their names
    in the part."""
    if metal not in _OWN:
        if owner(metal):
            import gear
            used = set(gear.owner_arrays(*owner(metal))[2].tolist())
            _OWN[metal] = tuple(n for k, n in enumerate(_owner_slots()) if k in used and n.startswith('sword:'))
        else:
            names = sorted(set(_hilt(metal)[2]))
            _OWN[metal] = tuple(f'sword:{n}' for n in names if n not in _metals().HILT_ROLES)
    return _OWN[metal]


def mats(metal=None):
    """The part's materials: the arm's, the sword's, and `metal`'s hilt's own."""
    return fparm.mats() + SWORD_MATS + own_mats(metal or DESIGN['metal'])


_HILTS, _BLADES = {}, {}


def _metals():
    """metals.py, which reads mathutils: Blender brings it."""
    import bpy  # noqa: F401
    import metals
    return metals


def _hilt(metal):
    """`metal`'s hilt as metals.py makes it, read once (metals.py `hilt_arrays`)."""
    if metal not in _HILTS:
        _HILTS[metal] = _metals().hilt_arrays(metal)
    return _HILTS[metal]


OVER = 0.004   # how near over the fist's top a piece of the hilt is counted over it
GUARD_LOW = -0.06   # metres up the grip under which the hilt is its pommel, not its guard
WRAP = 'sword_hilt'   # the grip's wrap (metals.py `grip`): the piece of the hilt the fist closes round
PROUD = 0.002   # metres a piece stands off the wrap before the fist cannot close over it (a cord or band lies on it)
_UNDER = {}


def guard_under(metal, S):
    """The lowest of the hilt over the fist, metres up the grip: of every piece standing proud of the wrap (the guard,
    a collar, a ruff), what stands straight over the top of the fist (its index's knuckles and the thumb's root). A
    quillon hanging down past the knuckles or the back of the hand is beside the fist, not over it."""
    if owner(metal):   # its guard's underside on its own origin (gear.py `owner_arrays`)
        return 0.0
    key = (metal, fpdagger._arm_key(S), S['grip_r'])
    if key not in _UNDER:
        from scipy.spatial import cKDTree
        _, _, _, vp = fpdagger._held(S)
        _, mid, d = fpdagger.grip(S)
        av = (vp - mid) @ _frame(d).T
        top = av[av[:, 2] > fist_top(S) - 0.025][:, :2]
        v, t, _, parts = _hilt(metal)
        wrap = np.array([p == WRAP for p in parts])
        r = np.hypot(v[:, 0], v[:, 1])
        held = np.zeros(len(v), dtype=bool)
        held[t[~wrap].ravel()] = True
        out = v[held & (v[:, 2] > GUARD_LOW) & (r > r[t[wrap].ravel()].max() + PROUD)]
        over = cKDTree(top).query(out[:, :2], distance_upper_bound=OVER)[0] < OVER
        _UNDER[key] = float(out[over, 2].min())
    return _UNDER[key]


_TOPS = {}


def fist_top(S):
    """How far up the grip from the fist's middle its index reaches: half the closed fingers' span along the grip."""
    key = (fpdagger._arm_key(S), S['grip_r'])
    if key not in _TOPS:
        _TOPS[key] = _fist_top(S)
    return _TOPS[key]


def _fist_top(S):
    vp, mid, d = fpdagger.grip(S)
    v = fpdagger._bare_arm(S)[0]
    R = fparm._RIGS[(S['hand'], S['cuff'], len(v))]
    near = (R['piece'] >= 1) & (_off(vp, mid, d) < S['grip_r'] + GLOVE + 0.03)
    along = (vp[near] - mid) @ d
    return float((along.max() - along.min()) / 2)


def _blade(S, metal):
    """`metal`'s whole blade as gear.py draws it, its root on the guard's top, and its materials' names."""
    metals = _metals()
    key = (metal, tuple(sorted((k, v) for k, v in S.items() if isinstance(v, float))))
    if key not in _BLADES:
        rows = 64 if metal == STEEL else blades.ROWS   # steel's at the first-person rows, as gear.py's
        v, t, m = blades.long_blade(S, metal, rows=rows, fins=True, bend=False)   # near straight up close
        names = blades.materials(metal, whole=True)
        _BLADES.clear()
        _BLADES[key] = (v + np.array([0.0, 0.0, metals.TOPS[metal]]), t, [names[k] for k in m])
    return _BLADES[key]


def drop(S, metal=None):
    """How far the sword stands down from its own frame in the part's: its guard's underside on the fist's index."""
    return guard_under(metal or DESIGN['metal'], S) - fist_top(S) - GAP


def sword(S, metal=None):
    """The whole sword in the part's space: (vertices, triangles, material index a triangle in `mats`)."""
    metal = metal or DESIGN['metal']
    names = mats(metal)
    if owner(metal):   # the owner's model whole, each role in its slot
        import gear
        v, t, role = gear.owner_arrays(*owner(metal))
        slot = np.array([names.index(n) if n in names else names.index('sword_fit') for n in _owner_slots()])
        return v * OWNER_TURN - np.array([0.0, 0.0, drop(S, metal)]), t, slot[role]
    hv, ht, hn, _ = _hilt(metal)
    bv, bt, bn = _blade(S, metal)
    index = {**{n: names.index(m) for n, m in HILT_OF.items()},
             **{n[len('sword:'):]: names.index(n) for n in own_mats(metal)}}
    hm = np.array([index[n] for n in hn], dtype=np.int64)
    bm = np.array([names.index(BLADE_OF[n]) for n in bn], dtype=np.int64)
    v, t, m = _join([(hv, ht, hm), (bv, bt, bm)])
    return v - np.array([0.0, 0.0, drop(S, metal)]), t, m


def scene(S, pose=None):
    """The whole part at `pose`'s joints (their rest where it has none): (vertices, triangles, material a triangle),
    the right fist on the grip under the guard, the forearm turned at the wrist."""
    p = {**REST, **(pose or {})}
    v, q, m, vp = fpdagger._held(S)
    _, mid, d = fpdagger.grip(S)
    R = fparm._RIGS[(S['hand'], S['cuff'], len(v))]
    arm = 1.0 - R['w_wrist']
    vp = fphand._turn(vp, R['wrist'], [1.0, 0.0, 0.0], p['lean'], arm)
    vp = fphand._turn(vp, R['wrist'], [0.0, 1.0, 0.0], p['swing'], arm)
    av = (vp - mid) @ _frame(d).T
    v, t, mats_ = _join([(av, q, m), sword(S)])
    return v * MIRROR, t[:, ::-1].copy(), mats_


def part(S):
    return scene(S)


def posed(v, pose, S):
    """The part at `pose`: made again at its joints (its vertices are the rest's, one for one)."""
    out = scene(S, pose)[0]
    assert len(out) == len(v), 'every pose keeps the part\'s vertices'
    return out


def length(S):
    """The root to the point of the steel sword: every metal is aimed as it is, so the fist and hilt keep one turn."""
    metals = _metals()
    return metals.TOPS[STEEL] - drop(S, STEEL) + blades.shape(S, STEEL)['blade_len']


def palette(metal=None):
    """The sword's materials: the blade's grey (the long blade's, which the game dyes), its groove, its glow and its
    inlay, and the hilt's own as the world's sword wears them (metals.py), polished in its metal's colours."""
    import materials
    import fpmetals
    import fpmodel
    metals = _metals()
    metal = metal or DESIGN['metal']
    look = owner(metal)[0] if owner(metal) else metal
    out = {
        'sword_blade': fpmodel._diffuse(materials.speckle('sword_blade', (0.57, 0.57, 0.57), (0.6, 0.6, 0.6),
                                                          scale=900.0, at=0.45, rough=0.9, metal=0.0)),
        'sword_groove': fpmetals._groove(),
        'sword_inlay': materials.plain('sword_inlay', metals._linear(metals.LOOK[look].get('inlay', (200, 200, 200))),
                                       metal=0.3, rough=0.3, spec=0.6),
    }
    if owner(metal):   # the owner's: each role of the hilt in the metal's own material (gear.py `owner_materials`)
        import gear
        made = gear.owner_materials(look)
        out.update({n: first_person(made[r]) for r, n in zip(gear.OWNER_ROLES, _owner_slots()) if r != 'blade'})
    elif 'glow' in blades.materials(metal):   # a vein's glow, set against each render's exposure (fpmetals.py `_glow`)
        out['sword_glow'] = fpmetals._glow()
    worn = {} if owner(metal) else {k: first_person(m) for k, m in metals.hilt_materials(metal).items()}
    for role, name in HILT_OF.items():
        if role in worn and name not in out:
            out[name] = worn[role]
    for name in own_mats(metal):
        if name not in out:
            out[name] = worn[name[len('sword:'):]]
    seen = set()
    for name in [*SWORD_MATS, *own_mats(metal)]:   # each slot its own material, so each is hidden on its own
        if name not in out:   # a slot this metal's sword leaves bare
            out[name] = materials.plain(name, (0.5, 0.5, 0.5), rough=0.9)
        elif id(out[name]) in seen:
            out[name] = out[name].copy()
        seen.add(id(out[name]))
    return out


METALLIC = 0.3   # a hilt's material more metallic than this is a fitting, polished; less, a grip's leather or cord


def first_person(m):
    """A hilt's material (metals.py's, the world's sword's) as the first person draws it, in its own colour, as the
    dagger's hilt is (fpdaggers.py `palette`): a fitting polished and half metallic, so the lamp shows its colour, its
    reflection lifted off black (`FLOOR`) so a dark metal holds its edges against the glove; a grip's leather matte.
    A material that glows keeps its light."""
    import materials
    from fpdaggers import FLOOR
    b = m.node_tree.nodes.get('Principled BSDF')
    if b is None or b.inputs['Emission Strength'].default_value > 0:
        return m
    rgb = tuple(b.inputs['Base Color'].default_value[:3])
    metal, rough = b.inputs['Metallic'].default_value, b.inputs['Roughness'].default_value
    if metal > METALLIC:
        return materials.polished(f'{m.name}.fp', rgb, rough=min(rough, 0.4), metal=0.6, floor=FLOOR)
    return materials.plain(f'{m.name}.fp', rgb, rough=0.7, spec=0.3)


# the hand seen from behind: the palm (the part's +Y, fpdagger.py `_frame`) turned away from the eye at least this much
# (the cosine of its turn off the line of sight), as the eye sees its own hand on a sword, and as the reference shows
# the back of its gauntlet. Every pose costs FACE_PULL a unit it falls short: a blade's outline reads the same from
# either flat, and the fist would as soon turn its fingers to the eye
FACE, FACE_PULL = 0.25, 3.0


def facing(S, pose):
    """How far the palm turns away from the eye at `pose`: the cosine between its normal and the line from the eye to
    the fist (1 the palm straight away, the back of the hand to the eye; -1 the palm to the eye)."""
    import fpstage
    M, _ = fpstage.pose_matrix(pose, S, length(S))
    root = M[:3, 3]
    return float(M[:3, 1] @ root / max(np.linalg.norm(root), 1e-9))


def penalty(S, pose):
    """The fit's cost of a pose that turns the palm toward the eye (fpfit.py `evaluate`)."""
    return FACE_PULL * max(0.0, FACE - facing(S, pose))


def seed(fr, S):
    """A first pose from the frame's classes, as the dagger's: the blade the grey, the fist the leather by its root."""
    return fpdagger.seed(fr, S)


def elbow(S, pose=None):
    """The elbow at `pose`'s wrist, in the part's space: the dagger's arm is this one."""
    return fpdagger.elbow(S, pose)
