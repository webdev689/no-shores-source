"""Each metal's own flail in first person (WEAPON06.CIF): its head's make, its ferrule and its handle's dressing.

Daggerfall's own is flails.py's fitted flail, the frames every metal falls back to. Each metal's make is flails.py's
(`MAKES`), in the language its warhammer speaks (fpwarhammers.py): steel's is a smith's dressed work where
Daggerfall's is plain, and each other metal is its culture's, its head at about the fitted ball's size so the fitted
swings still hold it. The flail is wired as fpmetals.py wires it, its chain posed by the pose's joints; this puts the
make's own materials and grades over that. The head and its sleeves are grey for the game's dye, or graded in the
forge's own colours where the warhammer's are; its bands, rivets and studs are in the metal's own colours.

    python -I tools/sprite-forge/fpflails.py --out public/art/studio/forge/WEAPON06 [--metals Iron,Daedric]
        [--samples 64] [--records 1,2]

Writes `WEAPON06.CIF_<record>-<frame>_<Metal>.png` (the idle's swing too) beside the forge's metal-less frames, which
stay Daggerfall's."""
import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import flails  # noqa: E402
import fpwear  # noqa: E402

# the warhammer's materials (fpwarhammers.palette, own_grade) by the names the flail's make gives them
NAMES = {'hammer_head': 'flail_head', 'hammer_collar': 'flail_sleeve', 'hammer_accent': 'flail_accent',
         'hammer_grip': 'flail_grip', 'hammer_glow': 'flail_core'}
METAL = ('flailiron', 'flail_head', 'flail_sleeve', 'flail_accent')   # graded as metal where a make has its own grade
GREY = ('flail_head', 'flail_sleeve')   # graded as the fitted flail's iron, where the dye colours the metal
# a metal's handle wood, dark and light, where it is not the fitted flail's: iron's dark, as its warhammer's haft is
WOOD = {'Iron': ((0.05, 0.02, 0.008), (0.3, 0.15, 0.04))}
# a glowing core's light past the exposure, as the warhammer's core comes out under its own records' exposure: set
# against each render's, so the core burns as deep a red under the flail's dimmer lamp
CORE_LIGHT = 1.9


def palette(metal):
    """`metal`'s flail materials: the warhammer's head surface, sleeve, fittings, grip and glow (fpwarhammers.palette)
    by the flail's names, the head clear to a shadow's ray as the fitted flail's spikes are, and its handle's wood."""
    import fpwarhammer
    import fpwarhammers
    import materials
    from fpmodel import _diffuse
    out = {NAMES[n]: m for n, m in fpwarhammers.palette(metal).items() if n in NAMES}
    out['flail_head'] = fpwarhammer.shadowless(out['flail_head'])
    if 'flail_sleeve' not in out:
        out['flail_sleeve'] = fpwarhammer.shadowless(
            _diffuse(materials.plain('flail_sleeve', (0.55, 0.55, 0.55), rough=0.8)))
    if metal in WOOD:
        out['flailwood'] = flails.wood('flailwood', *WOOD[metal])
    if metal in fpwarhammers.CORE:
        _core(_diffuse(out['flail_core']))
    return out


def _core(m):
    """A core's glow set against each render's exposure (fpmetals.py's glow is so), lit as no lamp lights it."""
    import fpstage
    strength = m.node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
    before = fpstage.set_lights

    def lit(light=None):
        before(light)
        strength.default_value = CORE_LIGHT * 2.0 ** -(light or fpstage.LIGHT).get('exposure', 0.0)
    fpstage.set_lights = lit
    strength.default_value = CORE_LIGHT * 2.0 ** -fpstage.LIGHT.get('exposure', 0.0)


def own_grade(metal):
    """The grades of `metal`'s flail, by material, where the forge keeps its metal in its own colours or grades its grey
    as its armour's: its warhammer's (fpwarhammers.own_grade), the chain's iron graded as the head is (adamantium's
    chain is its pale sleeve's, flails.py). None where the dye colours it, graded as the fitted flail's iron."""
    import fpwarhammers
    own = fpwarhammers.own_grade(metal)
    if not own:
        return None
    out = {NAMES[n]: g for n, g in own.items()}
    out['flailiron'] = out['flail_head']
    return out


def wield(metal):
    """Put `metal`'s flail in the first-person forge: fpmetals.py's flail in the make's own materials, its idle's swing
    in the make's shape, and its grades. Gives back what to restore."""
    import fpforge
    import fpmetals
    import fpmodel
    held = fpmetals.wield(metal, 'flail')
    wired, load, classes = fpmodel.palette, fpforge.load, dict(fpforge.CLASSES)
    look = lambda S: flails.shape(S, metal)   # noqa: E731
    fpmodel.WEAPONS['flail'] = {**fpmodel.WEAPONS['flail'], 'mats': flails.MATS,
                                'sway': lambda S, pose, frames, angle: flails.sway_joints(look(S), pose, frames, angle)}
    fpmodel.palette = lambda: {**wired(), **palette(metal)}
    own = own_grade(metal)

    def graded(path):   # the head and sleeves graded as the fitted iron is, a record's and a frame's too; its own over
        spec = load(path)
        tables = (fpforge.GRADE, *fpforge.RECORD_GRADE.values(), *fpforge.FRAME_GRADE.values())
        for table in tables:
            if 'flailiron' in table:
                table.update({n: table['flailiron'] for n in GREY})
        if own:
            fpforge.GRADE.update(own)
            for table in tables[1:]:
                table.update({n: g for n, g in own.items() if n in table})
        return spec
    fpforge.load = graded
    fpforge.CLASSES.update({n: 5 for n in GREY})
    if own:
        fpforge.CLASSES.update({n: 5 for n in own if n in METAL})   # the grip is leather, graded as leather
    return held, load, classes


def main():
    import fpforge
    import fpmetals
    import fpmodel
    import fpstage
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--metals', default=','.join(flails.METALS))
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--wear-only', action='store_true', help="the frames' wear maps alone (fpwear.py)")
    ap.add_argument('--records', default='')
    ap.add_argument('--spec', default=fpmetals.SPEC['flail'])
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for metal in [m for m in args.metals.split(',') if m]:
        work = tempfile.mkdtemp(prefix=f'fpflail-{metal}-')
        held, load, classes = wield(metal)
        try:
            sys.argv = ['fpforge.py', '--spec', args.spec, '--out', work, '--samples', str(args.samples),
                        *(['--records', args.records] if args.records else []),
                        *(['--wear-only'] if args.wear_only else [])]
            fpforge.main()
        finally:
            fpstage.set_lights = fpmetals.SET_LIGHTS
            fpmetals.unwield('flail', held)
            fpforge.load = load
            fpforge.CLASSES.clear()
            fpforge.CLASSES.update(classes)
        fpwear.move(work, args.out, metal)
        print(f'{metal}: its frames into {args.out}', flush=True)


if __name__ == '__main__':
    main()
