"""The mace, the flail and the warhammer as the third person sees them: each metal's is the first-person forge's own
make (fpmaces.py, flails.py `MAKES`, fpwarhammers.py) at its own size, so one weapon is seen from either view. Each is
drawn in its metal's own colours (`TONE`, over metals.py `LOOK`), as its sword and its dagger are, and never dyed.

Daggerfall holds a mace in either hand and a flail or a warhammer in both (DFU ItemEquipTable.GetItemHands, and the
item templates' isOneHanded; src/characters/equipRules.js `WEAPON_HANDS`). So the mace is held where the class sword is
and the flail and the warhammer where the class axe is (`HELD`), each in its class weapon's animations. Each haft ends
below the right fist in a cap, as its metal's battleaxe's does (gear.py `AXE_BUTTS`): a mace's and a flail's run on
past the fist to it, where the first person never looks.

A weapon's own frame is its class weapon's: the right fist's grip at the origin, the head up +Z, a warhammer's head and
a flail's chain along X."""
import json
import os

import numpy as np

import axes
import flails
import fpmaces
import fpwarhammers
import metals

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
METALS = fpmaces.METALS
assert set(METALS) == set(flails.METALS) == set(fpwarhammers.METALS)
# each weapon's first-person archive, and the class weapon it is held as
KINDS = {'mace': ('WEAPON05', 'sword'), 'flail': ('WEAPON06', 'axe'), 'warhammer': ('WEAPON07', 'axe')}
LAYERS = tuple(f'{kind}_{metal.lower()}' for kind in KINDS for metal in METALS)
HELD = {name: KINDS[name.split('_')[0]][1] for name in LAYERS}
# metres from the right fist to the butt's foot, where the first-person make stops at the fist. The sword's attack
# closes the left fist 9 cm under the right, so a mace's haft runs on past it; the axe's closes it up the haft, so a
# flail's handle needs only a knob below the fist
BUTT = {'mace': 0.18, 'flail': 0.08}
# the first person holds a warhammer by its upper hand, its haft running on 0.3 m below. The third person's right fist
# holds this far under it, the left fist 0.2 m over the right in the axe's attack (poses.py `attack`): so the head
# reaches no farther than the class axe's, whose reach sets the animations' cells
HAMMER_LOW = 0.12
# the flail's chain at rest (flails.py `chain_curve`: swing, curl, sway in degrees), as no frame swings it: out from
# the ferrule's eye toward +X and curling on, the ball off the handle's line. +X is down in the carry, so the ball
# hangs below the handle's end there; in a blow it stands out from the handle, so it never reads as a mace's head
CHAIN = (40.0, 40.0, 0.0)
# each make's materials (fpmaces.py, flails.py, fpwarhammers.py `MATS`) by role, and past them the butt's: a flail's
# chain is its head's metal (adamantium's its sleeve's, flails.py)
ROLES = {'mace': ('head', 'sleeve', 'wood', 'accent', 'glow', 'grip', 'edge', 'fit'),
         'flail': ('head', 'wood', 'head', 'sleeve', 'accent', 'grip', 'glow', 'fit'),
         'warhammer': ('head', 'sleeve', 'wood', 'accent', 'glow', 'grip', 'fit')}
assert len(ROLES['mace']) == len(fpmaces.MATS) + 1 and len(ROLES['flail']) == len(flails.MATS) + 1
assert len(ROLES['warhammer']) == len(fpwarhammers.MATS) + 1
# each metal's colours past its `LOOK`, where the first person keeps its own (fpwarhammers.py `own_grade`): elven's
# head gold and its wrap copper, adamantium's dark steel shard (lit enough to read at a sprite's size) in a pale steel
# sleeve and gold bands, daedric's blackened round a deep red core; ebony's flange edges pale, as its sword's bevels
# are. A head is otherwise its metal's, as its battleaxe's is
TONE = {
    'Elven': {'head': (222, 180, 82), 'grip': (150, 90, 50)},
    'Adamantium': {'head': (100, 104, 118), 'sleeve': (122, 122, 137), 'accent': (212, 170, 70),
                   'fit': (212, 170, 70)},
    'Ebony': {'edge': (150, 150, 156)},
    'Daedric': {'head': (30, 26, 26)},
}
# the wood of a haft, as the first person's is: iron's dark, as its warhammer's
WOOD = {'Iron': (74, 56, 40)}
WOOD_DEFAULT = (150, 104, 62)


def shape(kind):
    """The first-person `kind`'s fitted shape: its defaults under its archive's table, a record's own left out."""
    import fpmodel
    S = dict(fpmodel.defaults(kind))
    path = os.path.join(SPECS, f'{KINDS[kind][0]}-shape.json')
    if os.path.exists(path):
        S.update({k: v for k, v in json.load(open(path)).items() if k != 'records'})
    return S


def _butt(foot, r, metal, mat, haft=True):
    """The cap on the haft's end, its foot at `foot`, in the metal's language (gear.py `AXE_BUTTS`), and (`haft`) the
    haft run on down into it from the fist: [(vertices, triangles, material)], `mat` the haft's and the cap's."""
    from gear import AXE_BUTTS
    k, h = np.array(AXE_BUTTS[metal]).T
    cv, ct = axes._lathe(foot + h, k * r, caps=(True, True))
    out = [(cv, ct, mat[1])]
    if haft:
        out.append((*axes._lathe(np.array([foot + 0.02, 0.004]), np.array([r, r])), mat[0]))
    return out


def _dressing(v, t, m, wood):
    """The material the haft wears just over the fist: the dressing over its wood there (a wrap, a sheath, braided
    leather) where it covers as much as half the wood's, else the wood. The haft run on below the fist wears it too."""
    c = v[t].mean(axis=1)
    near = (c[:, 2] > 0.0) & (c[:, 2] < 0.02)
    area = 0.5 * np.linalg.norm(np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]]), axis=1)
    by = {k: area[near & (m == k)].sum() for k in set(m[near].tolist())}
    over = max((k for k in by if k != wood), key=by.get, default=wood)
    return over if by.get(over, 0.0) >= 0.5 * by.get(wood, 0.0) else wood


def make(kind, metal, chain=CHAIN):
    """`metal`'s `kind` in its own frame (the right fist at the origin), its butt and all: (vertices, triangles,
    material a triangle), each material its index in `ROLES[kind]`. A flail's chain at `chain` (swing, curl, sway)."""
    S = shape(kind)
    if kind == 'mace':
        v, t, m = fpmaces.part(S, metal)
    elif kind == 'flail':
        S = flails.shape(S, metal)
        v, t, m = flails.flail(S, *chain)
    else:
        # turned back end for end, its face on +X where the battleaxe's broad bit is: the axe's blows lead with +X,
        # where the first person's turn leads with -X
        v, t, m = fpwarhammers.part(S, metal)
        v, t = v * (-1.0, 1.0, 1.0) + (0.0, 0.0, HAMMER_LOW), t[:, ::-1]
    roles = ROLES[kind]
    mats = (_dressing(v, t, m, roles.index('wood')), len(roles) - 1)
    if kind == 'warhammer':   # its own haft's end, capped
        butt = _butt(HAMMER_LOW - S['haft_below'] - 0.02, S['haft_r'], metal, mats, haft=False)
    else:
        butt = _butt(-BUTT[kind], S['haft_r'], metal, mats)
    return flails._whole([(v, t, m)] + butt)


def palette(metal):
    """`metal`'s materials by role: its head, sleeves and edges its metal, its fittings, accent, grip and glow its
    sword's (metals.py `palette`), and its haft's wood. Each is named for the palette's own, so the fitter reads it in
    its class (`steel.` a metal, `blade.` a fitting, `haft.` a grip)."""
    import materials
    L = {**metals.LOOK[metal], **TONE.get(metal, {})}
    P = metals.palette(metal, tone={k: v for k, v in L.items() if k in ('fit', 'grip', 'accent')})
    lin = metals._linear
    head = L.get('head', L['metal'])

    def metal_(role, rgb):
        return materials.plain(f'steel.{metal}.{role}', lin(rgb), metal=L['metallic'], rough=L['rough'], spec=0.6)
    out = {'head': metal_('head', head), 'sleeve': metal_('sleeve', L.get('sleeve', head)),
           'edge': metal_('edge', L.get('edge', head)), 'fit': P['fit'], 'accent': P['accent'], 'grip': P['grip'],
           'wood': materials.plain(f'wood.{metal}', lin(WOOD.get(metal, WOOD_DEFAULT)), rough=0.6),
           # a core burns as its sword's seam does, a deep red, where the first person's is its armour's seam
           'glow': P.get('blade_glow' if metal in fpwarhammers.CORE else 'glow', P['accent'])}
    return out


def build_all():
    """Every metal's mace, flail and warhammer, each one object in its own frame, its materials by role: the layer's
    name to [object]."""
    import bpy
    from body import rest_attr
    out = {}
    for metal in METALS:
        roles = palette(metal)
        for kind in KINDS:
            name = f'{kind}_{metal.lower()}'
            v, t, m = make(kind, metal)
            used = sorted(set(m.tolist()))
            me = bpy.data.meshes.new(name)
            me.from_pydata(v.tolist(), [], t.tolist())
            for k in used:
                me.materials.append(roles[ROLES[kind][k]])
            me.polygons.foreach_set('material_index', [used.index(k) for k in m.tolist()])
            me.update()
            me.shade_smooth()
            rest_attr(me)
            ob = bpy.data.objects.new(name, me)
            bpy.context.scene.collection.objects.link(ob)
            out[name] = [ob]
    return out
