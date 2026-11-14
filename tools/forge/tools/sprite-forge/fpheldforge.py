"""Render what the left hand holds in layers, as the bow's are (fpbowlayers.py): the held thing alone (the torch with
its flame, fptorch.py; a shield, fpshield.py), the hands unseen but still shading it, and the hands alone in the bare
glove (`_Hands`) or an armour set's gauntlets (`_HandsDaedric`, `_HandsChain`; fparmour.py), cut where the held thing
lies nearer the eye. So the game lays any hands over it. Every set holds it as the bare hand does.

    python -I tools/sprite-forge/fpheldforge.py --spec tools/sprite-forge/specs/TORCH.json \\
        --out public/art/studio/forge/held [--hands Hands,Leather,Daedric] [--objects] [--samples 128]

Writes `<archive>_<record>-<frame>_<layer>.png` cut to each record's canvas. A record that holds `still` draws its hands
once (frame 0): only what it holds moves. Metal, plate and mail are rendered grey and the game dyes them: the held thing
by its own metal (a shield's), the hands by the gauntlets'."""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fpmodel  # noqa: E402

METALS = ('Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')
SETS = ('Leather', 'Chain') + METALS   # the armour sets, as the fists wear them (fistArmour.js)
HANDS = 'Hands'


def _flame_light(eye, held, pose, part):
    """A point light where the held thing burns (its `glow` point, if it has one): the flame lights the hand. A held
    thing may give each pose its own power (`glow_power`, a gun's shot) and its own colour (`GLOW_COLOUR`), and light
    its own materials frame by frame (`frame_light`, a gun's gems flaring with the shot)."""
    import bpy
    import numpy as np
    getattr(held, 'frame_light', lambda pose: None)(pose)
    point = getattr(held, 'glow_point', None)
    if not point:
        return
    S = fpmodel.SHAPE
    M = eye.matrix(pose, part, S)
    at = (M @ np.array([*point(S), 1.0]))[:3]
    ob = bpy.data.objects.get('flame')
    if ob is None:
        ld = bpy.data.lights.new('flame', 'POINT')
        ld.shadow_soft_size = 0.02
        ld.color = (1.0, 0.62, 0.3)
        ob = bpy.data.objects.new('flame', ld)
        bpy.context.scene.collection.objects.link(ob)
    ob.location = at.tolist()
    ob.data.energy = held.glow_power(pose) if hasattr(held, 'glow_power') else held.GLOW_POWER
    ob.data.color = getattr(held, 'GLOW_COLOUR', (1.0, 0.62, 0.3))


def _border(rect):
    """Cycles renders only the record's canvas (the rest of the screen is cut away after): `rect` is (x, y, w, h)."""
    import bpy
    import fpstage
    x, y, w, h = rect
    r = bpy.context.scene.render
    r.use_border, r.use_crop_to_border = True, False
    r.border_min_x, r.border_max_x = max(x - 2, 0) / fpstage.W, min(x + w + 2, fpstage.W) / fpstage.W
    r.border_min_y, r.border_max_y = 1.0 - min(y + h + 2, fpstage.H) / fpstage.H, 1.0 - max(y - 2, 0) / fpstage.H


def _eye(spec, samples, held):
    """The eye over the spec's parts, each decorated as the held thing asks (a shield's boards read their plane)."""
    import fpforge
    import fpmetals
    import fpstage
    fpstage.set_lights = fpmetals.SET_LIGHTS   # a glow hooked the lights to its material, freed with the last eye
    eye = fpforge.Eye(spec, samples)
    for part in eye.obs:
        getattr(held, 'decorate', lambda *a: None)(eye, part, fpmodel.SHAPE)
    return eye


def render(spec_path, out, samples, sets, objects, records=None, layers=None):
    """Every layer of the spec's records into `out`: the held thing's in each of its makes (with `objects`) and the
    hands' in each of `sets` (None the bare glove); of `layers` only those named, when given."""
    import fparmour
    import fpforge
    import fptorch
    import fpstage
    import stage
    weapon_name = None
    jobs = ([('object', None)] if objects else []) + [('hands', s) for s in sets]
    for kind, armour in jobs:
        spec = fpforge.load(spec_path)
        held = __import__(spec.get('module', 'fptorch'))
        weapon_name = spec['weapon']
        saved = (dict(fpmodel.WEAPONS[weapon_name]), fpmodel.palette, dict(fpforge.CLASSES))
        first = spec['records'][0]
        try:
            fpmodel.SHAPE.update(armour=armour)
            names = fptorch.mats(armour, held.OWN)
            fpmodel.WEAPONS[weapon_name] = {**saved[0], 'mats': names}
            fpmodel.palette = fptorch.with_torch(saved[1], held.palette, armour)
            fpforge.CLASSES.update(held.CLASSES)
            fpforge.CLASSES.update(fparmour.ARMOUR_CLASSES)
            for n, g in fparmour.METAL_GRADE.items():
                fpforge.GRADE.setdefault(n, g)
            if armour:   # a set's own grade over both, as the fists wear it (elven gold, dwarven bronze, daedric black)
                fpforge.GRADE.update(fparmour.style(armour).get('grade', {}))
            for table in (fpforge.GRADE, *fpforge.RECORD_GRADE.values()):   # a make's own materials, graded as another
                for n, like in getattr(held, 'GRADE_AS', {}).items():
                    if like in table:
                        table.setdefault(n, table[like])
            own = tuple(held.OWN)
            arms = tuple(n for n in names if n not in own)
            # the hands hold the plain make, whole: its fittings cut them where they lie nearer the eye
            base_grade = dict(fpforge.GRADE)
            for variant in held.variants(first) if kind == 'object' else held.variants(first)[:1]:
                held.set_variant(fpmodel.SHAPE, variant)
                fpforge.GRADE.clear()   # a make's metal in its armour set's grade (a shield's, fpshield.variant_grade)
                fpforge.GRADE.update({**base_grade, **(getattr(held, 'variant_grade', lambda v: {})(variant)
                                                       if kind == 'object' else {})})
                name = held.object_name(first, variant) if kind == 'object' else HANDS + (armour or '')
                if layers and name not in layers:
                    continue
                eye = _eye(spec, samples, held)
                for r, rec in enumerate(spec['records']):
                    if records is not None and r not in records:
                        continue
                    part = fpforge.part_of(spec, rec)
                    _border(fpforge.rect(rec))
                    for f in range(1 if (kind == 'hands' and rec.get('still')) else rec['frames']):
                        pose = fpforge.FIT[f'{r}:{0 if rec.get("still") else f}']
                        _flame_light(eye, held, pose, part)
                        if kind == 'object':
                            scr = eye.screen(pose, part, only=own, record=r, frame=f, sheets=held.SHEETS)
                            scr = held.over(eye, scr, pose, part, f)
                        else:
                            # the hands' garments are one layer, so none hides its inner faces (as the bow's hands)
                            scr = eye.screen(pose, part, only=arms, under=own, record=r, frame=f, sheets=arms)
                        pic = fpstage.crop(scr, fpforge.rect(rec))
                        # the hands are the archive's record 0's: a spec of several archives (the shields') keys each by it
                        rec_name = held.record_name(rec, r, variant) if kind == 'object' else (0 if 'archive' in rec else r)
                        archive = rec.get('archive', spec['archive'])
                        stage.write_png(os.path.join(out, f"{archive}_{rec_name}-{f}_{name}.png"), pic)
                print(f'{name}: its frames into {out}', flush=True)
        finally:
            fpmodel.WEAPONS[weapon_name], fpmodel.palette = saved[0], saved[1]
            fpforge.CLASSES.clear()
            fpforge.CLASSES.update(saved[2])
            fpmodel.SHAPE.pop('armour', None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--hands', default=','.join((HANDS,) + SETS), help=f'{HANDS} for the bare glove, or an armour set')
    ap.add_argument('--objects', action='store_true', help='render the held thing\'s own layers too')
    ap.add_argument('--no-hands', action='store_true')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--records', default='')
    ap.add_argument('--layers', default='', help='only these layers (Shield, ShieldIron, Hands, HandsDaedric...)')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    sets = [] if args.no_hands else [None if h == HANDS else h for h in args.hands.split(',') if h]
    render(args.spec, args.out, args.samples, sets, args.objects, {int(r) for r in args.records.split(',') if r} or None,
           {n for n in args.layers.split(',') if n} or None)


if __name__ == '__main__':
    main()
