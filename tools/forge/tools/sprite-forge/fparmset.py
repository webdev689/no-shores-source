"""The climbing arm in an armour set: the casting hands' and the climbing hands' series (specs/CAST.json,
specs/CLIMB.json) rendered again in each set's gauntlets, as the fists wear them (fparmour.py).

    python -I tools/sprite-forge/fparmset.py --spec tools/sprite-forge/specs/CAST.json --out public/art/cast
    python -I tools/sprite-forge/fparmset.py --spec tools/sprite-forge/specs/CLIMB.json --out public/art/climb \\
        [--sets Iron,Daedric] [--samples 64]

The arm wears the set's outfit and its plate (fparmour.OUTFITS, hand_pieces, leather_pieces, chain_pieces), as the
instruments' arms do (instruments.py `rest_arm`). A set's sleeve, glove and plate are one layer, as the held hands
are (fpheldforge.py): every frame is drawn whole, no garment hiding its inner faces, cut to its series' canvas and
outlined as fpforge.py draws the bare garments. Writes `<out>/<Set>/<series>[-k].png` beside the bare garments'
folders. Plate and mail are grey and the game dyes them by the gauntlets; elven's gold, dwarven's bronze and daedric's
black are graded in their own colours. An element's light stays the bare hand's (fpspell.py)."""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fparm  # noqa: E402
import fparmour  # noqa: E402
import fpforge  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
# the sets, as the fists wear them (src/combat/fistArmour.js armourSetOf): the materials' and the guilds' own
SETS = ('Leather', 'Chain', 'Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish',
        'Daedric', 'Thieves', 'Brotherhood', 'Mages', 'Fighters', 'Knights')
CLIMBING_ARMS = ('climbarm', 'castarm')   # the weapons that are the climbing arm


def armed(material):
    """The climbing arm's part in `material`'s set: (vertices, triangles, material a triangle), the plate's slots
    counted past its outfit's two (fparmour.EXTRA)."""
    kind = fparmour.style(material).get('kind', 'plate')
    outfit = fparmour.OUTFITS.get(material, fparmour.OUTFITS['plate'])

    def part(S):
        pieces = (fparmour.chain_pieces(material) if kind == 'chain' else fparmour.leather_pieces(material)
                  if kind == 'leather' else fparmour.hand_pieces(material, S.get('thumb') or 1.0))
        v, q, m = fparm.arm(S['hand'], S['arm_r'], 'L', outfit=outfit, cuff=S.get('cuff'), thumb=S.get('thumb'),
                            fingers=S.get('fingers'), slim=S.get('slim'), armour=pieces)
        return v, q, np.where(m >= fparmour.BASE, m - fparmour.BASE + len(outfit), m)
    return part, fparm.mats(outfit) + fparmour.EXTRA


def wear_look(material):
    """`material`'s set's materials beside the palette's, plate and mail read as metal, and its grade laid over whatever
    a spec loads (fparmour.wear's). Gives back what to restore."""
    import fpmetals
    saved = (fpmodel.palette, dict(fpforge.CLASSES), fpforge.load)
    fpmodel.palette = fparmour.dressed(saved[0], material)
    fpforge.CLASSES.update(fparmour.ARMOUR_CLASSES)
    own = fparmour.style(material).get('grade', {})
    fists = json.load(open(os.path.join(SPECS, 'WEAPON10-grade.json')))
    load = saved[2]

    def graded(path):   # plate and mail onto the metal band, a guild's leather sleeve as the fists' leggings, its own
        spec = load(path)   # grade over all
        for n, g in fparmour.METAL_GRADE.items():
            fpforge.GRADE.setdefault(n, g)
        fpforge.GRADE.setdefault('legging', fists['legging'])
        fpforge.GRADE.update(own)
        for table in (*fpforge.RECORD_GRADE.values(), *fpforge.FRAME_GRADE.values()):
            table.update({n: g for n, g in own.items() if n in table})
        return spec
    fpforge.load = graded
    fpstage.set_lights = fpmetals.SET_LIGHTS   # a daedric seam's glow hooks the lights; each set starts from the scene's
    return saved


def unwear_look(saved):
    import fpmetals
    fpmodel.palette, classes, fpforge.load = saved
    fpstage.set_lights = fpmetals.SET_LIGHTS
    fpforge.CLASSES.clear()
    fpforge.CLASSES.update(classes)


def dress(weapon, material):
    """Put `material`'s set on `weapon`'s climbing arm: its part and materials, and the set's look (`wear_look`). Gives
    back what to restore."""
    part, mats = armed(material)
    saved = fpmodel.WEAPONS[weapon]
    fpmodel.WEAPONS[weapon] = {**saved, 'parts': {'arm': part}, 'mats': mats}
    return weapon, saved, wear_look(material)


def undress(dressed):
    weapon, part, look = dressed
    fpmodel.WEAPONS[weapon] = part
    unwear_look(look)


def render(spec_path, out, material, samples=64, records=None):
    """Every series frame of the spec in `material`'s set into `<out>/<material>/`. Answers how many."""
    import stage
    weapon = json.load(open(spec_path))['weapon']
    assert weapon in CLIMBING_ARMS, f'{weapon}: not the climbing arm'
    dressed = dress(weapon, material)
    try:
        spec = fpforge.load(spec_path)
        eye = fpforge.Eye(spec, samples)
        names = fpmodel.WEAPONS[weapon]['mats']
        n = 0
        for r, rec in enumerate(spec['records']):
            if 'series' not in rec or (records and r not in records):
                continue
            part = fpforge.part_of(spec, rec)
            for k, pose in enumerate(fpforge.series_poses(rec, fpforge.FIT[f'{r}:0'], fpmodel.joints(weapon, part))):
                scr = eye.screen(pose, part, record=r, sheets=names)   # one layer: no garment hides its inner faces
                pic = fpstage.crop(scr, fpforge.series_rect(rec))
                if rec['series'].get('outline'):
                    pic = fpforge.outlined(pic, rec['series']['outline'])
                os.makedirs(os.path.join(out, material), exist_ok=True)
                name = rec['series']['name'] + (f'-{k}' if rec['series']['frames'] > 1 else '')
                stage.write_png(os.path.join(out, material, f'{name}.png'), pic)
                n += 1
        return n
    finally:
        undress(dressed)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--sets', default=','.join(SETS))
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--records', default='')
    args = ap.parse_args()
    records = {int(r) for r in args.records.split(',') if r} or None
    for material in [m for m in args.sets.split(',') if m]:
        t = time.time()
        n = render(args.spec, args.out, material, args.samples, records)
        print(f'{material}: {n} frames into {os.path.join(args.out, material)} ({time.time() - t:.0f}s)', flush=True)


if __name__ == '__main__':
    main()
