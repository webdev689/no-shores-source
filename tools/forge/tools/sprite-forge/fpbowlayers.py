"""The bow's layers (WEAPON09.CIF), so the game lays any bow under any gauntlets: each bow type in each metal alone
(`_LongIron`, `_ShortDaedric`), and the hands over it in the leather glove (`_Hands`) or in an armour set's gauntlets
(`_HandsDaedric`, `_HandsChain`; fparmour.py), all at the fitted poses, lights and grade. A bow layer is the whole bow:
the hands are unseen in it but still shade it and cast their shadows. A hands layer is cut where the bow lies nearer
the eye, so the hands laid over the bow draw what is in front. Every set holds the bow as the bare hands do (fpbow.py
`bare`), so one bow serves every set's hands.

    python -I tools/sprite-forge/fpbowlayers.py --out public/art/studio/forge/WEAPON09 [--bows Long,Short]
        [--metals Iron,Daedric] [--hands Hands,Leather,Daedric] [--samples 128]

Metal, plate and mail are rendered grey and the game dyes them: the bow by its metal, the hands by the gauntlets'. A
metal the forge keeps in its own colours, as its armour, is graded in them and takes no dye (`own_grade`). Each metal's
make (bows.py) wears its warhammer's materials (`make_palette`); the hands hold Daggerfall's plain bow."""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fpbow  # noqa: E402
import fpmodel  # noqa: E402
import fpwear  # noqa: E402

SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'WEAPON09.json')
METALS = ('Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')
SETS = ('Leather', 'Chain') + METALS   # the armour sets, as the fists wear them (fistArmour.js)
HANDS = 'Hands'   # the hands' layer: alone, the leather glove with nothing over it
# the metals whose bow is graded as their armour's plate is up close (armour.py `CLOSE_UP`): elven's, dwarven's,
# adamantium's and daedric's in the forge's own colours, never grey, so no dye touches them; silver's, ebony's and
# orcish's still grey for their dye, held where their armour holds it
OWN = ('Silver', 'Elven', 'Dwarven', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')
# the make's metal, fittings and grip as its warhammer's (fpwarhammers.py `palette`, `own_grade`), by the bow's names:
# the warhammer's sleeves are the bow's collars and metal staves
NAMES = {'hammer_head': 'hammer_head', 'hammer_collar': 'collar', 'hammer_accent': 'hammer_accent',
         'hammer_grip': 'hammer_grip'}
GRIP_LIFT = 1.6   # a grip's leather under the bow's lamp: the warhammer's lift (2.5) rose to its ramp's top
# fittings in a colour of the bow's own where its metal's would not show: ebony's edges its long blade's satin silver,
# as its staff's shards are (fpstaffs.py `ACCENT`)
ACCENT = {'Ebony': (124, 124, 132)}
# a wood bow's limb in a darker wood than Daggerfall's (fpbow.py `wood`): iron's, as its warhammer's haft is
WOOD = {'Iron': ((0.07, 0.03, 0.012), (0.24, 0.13, 0.05))}


def make_palette(metal):
    """`metal`'s make's materials past the bow's own: its warhammer's motif metal, fittings and grip (fpwarhammers.py
    `palette`), the grip's leather lifted for the bow's lamp."""
    import fpwarhammers
    import materials
    import metals
    from fpmodel import _diffuse
    out = {NAMES[n]: m for n, m in fpwarhammers.palette(metal).items() if n in ('hammer_head', 'hammer_accent')}
    grip = tuple(min(1.0, c * GRIP_LIFT) for c in metals._linear(metals.LOOK[metal]['grip']))
    out['hammer_grip'] = _diffuse(materials.plain('hammer_grip', grip, rough=0.7))
    if metal in ACCENT:
        out['hammer_accent'] = _diffuse(materials.plain('hammer_accent', metals._linear(ACCENT[metal]), rough=0.6))
    if metal in WOOD:
        out['wood'] = fpbow.wood(*WOOD[metal])
    return out


def own_grade(metal):
    """The grade of `metal`'s bow by material, where it is graded as its armour is: its grip's wrap and its arrow's
    point as its armour's plate up close, each frame's light share for share, by each face's tone, its texture laid
    back at half its contrast (a grip's worked lumps, stretched texel by texel, came out as speckle); its make as its
    warhammer's is (fpwarhammers.py `own_grade`). Where the archive's grade stands, its make's metal alone
    (`spread`)."""
    if not metal:
        return {}
    import bpy  # noqa: F401  (armour.py reads mathutils, which Blender brings)
    import armour
    import fpwarhammers
    if metal not in OWN:
        g = spread(metal)
        return {'collar': g, 'hammer_head': g}
    g = {**armour.CLOSE_UP[metal]['grade']['plate'], 'detail': [5, 0.5, 2.5]}
    return {'wrap': g, 'head': g, **{NAMES[n]: m for n, m in fpwarhammers.own_grade(metal).items() if n in NAMES}}


def spread(metal):
    """Iron's, steel's or mithril's make's metal: its light share for share onto its staff's spread of the band
    (fpstaffs.py `GREY`), mithril's onto its armour plate's, high on its dye's ramp, so its blue bands read against it.
    Their grip and arrow keep the archive's grade, fitted to two collars, which held a make's many small faces near
    black."""
    import armour
    import fpstaffs
    if metal == 'Mithril':
        return {**armour.CLOSE_UP[metal]['grade']['plate'], 'detail': [5, 0.5, 2.5]}
    return {'share': [fpstaffs.SHARE, fpstaffs.GREY[metal]], 'detail': [5, 0.5, 2.5]}


def wear(metal):
    """Put `metal`'s make in the bow layer's grades, its own over the archive's."""
    import fpforge
    own = own_grade(metal)
    fpforge.GRADE.update(own)
    if 'hammer_accent' in own:   # fittings graded as metal: adamantium's gold
        fpforge.CLASSES['hammer_accent'] = 5


def layers(bows, metals, sets):
    """Each layer to render: (its name, its bow type, its metal, the armour set its arms wear, whether it is the
    hands'). A hands layer holds Daggerfall's plain long bow, whose grip, string and arrow every bow shares."""
    return ([(f'{kind}{metal}', kind, metal, None, False) for kind in bows for metal in metals] +
            [(HANDS + (s or ''), 'Long', None, s, True) for s in sets])


def render(out, samples, name, kind, metal, armour, hands, maps=False):
    """One layer's frames into `out`, as `WEAPON09.CIF_0-<frame>_<name>.png`; with `maps`, their wear maps."""
    import fparmour
    import fpforge
    import stage
    weapon, palette, classes = dict(fpmodel.WEAPONS['bow']), fpmodel.palette, dict(fpforge.CLASSES)
    try:
        spec = fpforge.load(SPEC)
        fpmodel.SHAPE.update(fpbow.typed(fpmodel.SHAPE, kind), metal=metal, armour=armour)
        names = fpbow.mats(armour)
        fpmodel.WEAPONS['bow'] = {**weapon, 'mats': names}
        if armour:
            fpmodel.palette = fparmour.dressed(palette, armour)
            fpforge.CLASSES.update(fparmour.ARMOUR_CLASSES)
            for n, g in fparmour.grades(armour).items():
                fpforge.GRADE.setdefault(n, g)
            own = fparmour.style(armour).get('grade', {})   # its own glove leather over the bow's (the brotherhood's
            fpforge.GRADE.update({n: g for n, g in own.items() if n in ('gauntlet', 'boot')})   # black)
        if not hands:
            fpmodel.palette = lambda: {**palette(), **make_palette(metal)}
            wear(metal)
        bow = tuple(n for n in names if n in fpbow.BOW_MATS)
        arms = tuple(n for n in names if n not in fpbow.BOW_MATS)
        eye = fpforge.Eye(spec, samples, render=not maps)
        rec = spec['records'][0]
        if maps:
            fpwear.layer(eye, spec, arms if hands else bow, out, name)
        fpforge.aim(spec, 0)
        for f in range(0 if maps else rec['frames']):
            # the hands' garments are one layer, so none hides its inner faces: every face is drawn as a whole frame
            # draws it (the armour's are not all wound outward)
            scr = eye.screen(fpforge.FIT[f'0:{f}'], rec['part'], only=arms if hands else bow,
                             under=bow if hands else (), record=0, sheets=fpbow.SHEETS + (arms if hands else ()))
            pic = fpforge.cut(scr, fpforge.out_rect(rec))
            stage.write_png(os.path.join(out, f"{spec['archive']}_0-{f}_{name}.png"), pic, **fpforge.marks(spec, rec))
    finally:
        fpmodel.WEAPONS['bow'], fpmodel.palette = weapon, palette
        fpforge.CLASSES.clear()
        fpforge.CLASSES.update(classes)
    print(f'{name}: its frames into {out}', flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--bows', default=','.join(fpbow.BOW_TYPES))
    ap.add_argument('--metals', default=','.join(METALS))
    ap.add_argument('--hands', default=','.join((HANDS,) + SETS), help=f'{HANDS} for the bare glove, or an armour set')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--wear-only', action='store_true', help="the bow layers' wear maps alone, no hands (fpwear.py)")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    split = lambda s: [a for a in s.split(',') if a]   # noqa: E731
    sets = [None if h == HANDS else h for h in split(args.hands)]
    sets = [] if args.wear_only else sets
    for name, kind, metal, armour, hands in layers(split(args.bows), split(args.metals), sets):
        render(args.out, args.samples, name, kind, metal, armour, hands, args.wear_only)


if __name__ == '__main__':
    main()
