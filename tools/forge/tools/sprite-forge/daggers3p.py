"""The daggers as the third person sees them, in the right fist where the class sword is held: each metal's is the
first-person forge's own make (fpdaggers.py), its blade and hilt at their own size, so one dagger is seen from either
view. Every metal with a make of its own has a layer (fpdaggers.py `BLADE_LOOK`). It is drawn in its long blade's
colours (fpdaggers.py `TONE`, over metals.py `LOOK`): the blade its own, the fuller a darker metal, the fittings, the
accent and the grip their own, and no dye laid on it.

A dagger's own frame is the sword's: the fist's grip at the origin, the blade up +Z, its edges along X."""
import json
import os

import fpdagger
import fpdaggers
import metals

SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'WEAPON02-shape.json')
METALS = tuple(fpdaggers.BLADE_LOOK)
LAYERS = tuple(f'dagger_{metal.lower()}' for metal in METALS)
GROOVE = 0.55   # the fuller's metal, a share of the blade's


def shape():
    """The first-person dagger's fitted shape, in the hand every first-person picture wears."""
    S = dict(fpdagger.SHAPE)
    if os.path.exists(SPEC):
        S.update({k: v for k, v in json.load(open(SPEC)).items() if k != 'records'})
    S.update(fpdagger.arm_shape())
    return S


def build(metal):
    """`metal`'s dagger as one object in its own frame, its materials by role."""
    import bpy
    import materials
    from body import rest_attr
    S = shape()
    v, t, m = fpdagger._join([fpdaggers._blade(S, metal)] + fpdaggers._hilt(S, metal))
    L = {**metals.LOOK[metal], **fpdaggers.TONE.get(metal, {})}
    P = metals.palette(metal, tone=L)
    lin = metals._linear
    blade = L.get('blade', L['metal'])
    roles = {fpdagger.BLADE: materials.plain(f'steel.{metal}.blade', lin(blade), metal=L['metallic'],
                                             rough=L['rough'], spec=0.6),
             fpdagger.GROOVE: materials.plain(f'steel.{metal}.groove',
                                              lin(L.get('groove', tuple(GROOVE * c for c in blade))),
                                              metal=L['metallic'], rough=L['rough'], spec=0.6),
             fpdagger.FIT: P['fit'], fpdagger.ACCENT: P['accent'], fpdagger.GRIP: P['grip'],
             fpdagger.GLOW: P.get('glow', P['accent'])}
    used = sorted(set(m.tolist()))
    me = bpy.data.meshes.new(f'dagger_{metal.lower()}')
    me.from_pydata(v.tolist(), [], t.tolist())
    for k in used:
        me.materials.append(roles[k])
    me.polygons.foreach_set('material_index', [used.index(k) for k in m.tolist()])
    me.update()
    me.shade_smooth()
    rest_attr(me)
    ob = bpy.data.objects.new(f'dagger_{metal.lower()}', me)
    bpy.context.scene.collection.objects.link(ob)
    return [ob]
