"""Each metal's own staff in first person (WEAPON01.CIF): its pole's dressing and its head (staffs.py), in the colours
its warhammer wears (fpwarhammers.py `palette`, `own_grade`).

Daggerfall's own is fpmodel.py's, the frames every metal falls back to. Every metal's staff, steel's too, is its own
make. Its head and sleeves are rendered grey and the game dyes them by the metal, but where the forge keeps the metal in
its own colours, as its warhammer's: elven's, dwarven's, adamantium's and daedric's. Its fittings are in the metal's
own colours (metals.py `LOOK`), which no dye touches, and a daedric head's core glows.

    python -I tools/sprite-forge/fpstaffs.py --out public/art/studio/forge/WEAPON01 [--metals Iron,Daedric]
        [--samples 128] [--records 1,2]

Writes `WEAPON01.CIF_<record>-<frame>_<Metal>.png` beside the forge's metal-less frames, which stay Daggerfall's."""
import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fpmetals  # noqa: E402
import fpwarhammers  # noqa: E402
import fpwear  # noqa: E402
import staffs  # noqa: E402

# the staff's materials: Daggerfall's staff's wood and cord, then the warhammer's metal, fittings, grip and glow, so a
# staff wears its warhammer's colours and grades
MATS = ('staff', 'hammer_collar', 'lash', 'hammer_glow', 'hammer_head', 'hammer_accent', 'hammer_grip')
STUFF = {'wood': 0, 'metal': 1, 'cord': 2, 'vein': 3, 'head': 4, 'accent': 5, 'grip': 6}
SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'WEAPON01.json')
SHARE = [1.0, 10.0, 30.0, 50.0, 70.0, 90.0, 99.0]
# a metal the warhammer grades as Daggerfall's warhammer is: its light share for share onto a spread of the band of
# its own, as its armour's plate is up close. Daggerfall's cap's grade holds all but its glints near black: on a head
# of many faces that reads as a blot. Iron's is held lower than steel's, as its rough forging is; mithril's in the
# dye's slate and steel blue, under its orb's bright blue
GREY = {'Iron': [30.0, 40.0, 54.0, 76.0, 104.0, 140.0, 176.0], 'Steel': [36.0, 48.0, 72.0, 104.0, 148.0, 204.0, 236.0],
        'Mithril': [50.0, 70.0, 99.0, 125.0, 150.0, 180.0, 210.0]}
# the staff's light is brighter than the warhammer's: its grip unlifted (fpwarhammers.GRIP_LIFT) falls on the warhammer
# grip's own place on its ramp, where lifted it rises to the ramp's top; its core twice as strong to glow as brightly
GRIP_LIFT = 1.0
CORE_LIFT = 2.0
# fittings in a colour of the staff's own where its metal's (metals.py `LOOK`) would not show: ebony's shards edged
# in its long blade's satin silver, where its fittings' near-black is lost on the black shards
ACCENT = {'Ebony': (124, 124, 132)}


def part(S, metal):
    """`metal`'s staff (staffs.py) in MATS: (vertices, triangles, material a triangle)."""
    from fpmodel import _join
    return _join([(np.asarray(v, float), np.asarray(q), STUFF[k]) for v, q, k in staffs.staff(S, metal, own=True)])


def palette(metal):
    """`metal`'s warhammer's materials (fpwarhammers.palette), its grip and its core set for the staff's light, its
    fittings in a colour of its own where it has one (ACCENT)."""
    import materials
    import metals
    from fpmodel import _diffuse
    out = fpwarhammers.palette(metal)
    grip = tuple(min(1.0, c * GRIP_LIFT) for c in metals._linear(metals.LOOK[metal]['grip']))
    out['hammer_grip'] = _diffuse(materials.plain('hammer_grip', grip, rough=0.7))
    if metal in ACCENT:
        out['hammer_accent'] = _diffuse(materials.plain('hammer_accent', metals._linear(ACCENT[metal]), rough=0.6))
    if metal in fpwarhammers.CORE:
        out['hammer_glow'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value *= CORE_LIFT
    return out


def own_grade(metal):
    """The grades of `metal`'s staff by material: its warhammer's where the forge keeps it (fpwarhammers.own_grade),
    else its metal's light share for share onto its own spread of the band (GREY)."""
    own = fpwarhammers.own_grade(metal)
    if own:
        return own
    g = {'share': [SHARE, GREY[metal]], 'detail': [5, 0.5, 2.5]}
    return {'hammer_head': g, 'hammer_collar': g}


def wield(metal):
    """Put `metal`'s staff in the first-person forge (fpmetals.wield_staff, then its own mesh, materials and grades).
    Gives back what to restore."""
    import fpforge
    import fpmodel
    held = fpmetals.wield_staff(metal)
    fpmodel.WEAPONS['staff'] = {**fpmodel.WEAPONS['staff'], 'parts': {'staff': lambda S: part(S, metal)}, 'mats': MATS}
    staffed, loaded = fpmodel.palette, fpforge.load
    fpmodel.palette = lambda: {**staffed(), **palette(metal)}
    own, classes = own_grade(metal), dict(fpforge.CLASSES)

    def graded(path):   # the metal's own grades over every record's and frame's
        spec = loaded(path)
        fpforge.GRADE.update(own)
        for table in (*fpforge.RECORD_GRADE.values(), *fpforge.FRAME_GRADE.values()):
            table.update({n: g for n, g in own.items() if n in table})
        return spec
    fpforge.load = graded
    fpforge.CLASSES.update({n: 5 for n in own if n in fpwarhammers.METAL})   # a grip is graded as leather
    return held, classes


def main():
    import fpforge
    import fpmodel
    import fpstage
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--metals', default=','.join(staffs.METALS))
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--wear-only', action='store_true', help="the frames' wear maps alone (fpwear.py)")
    ap.add_argument('--records', default='')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    for metal in [m for m in args.metals.split(',') if m]:
        work = tempfile.mkdtemp(prefix=f'fpstaff-{metal}-')
        held, classes = wield(metal)
        try:
            sys.argv = ['fpforge.py', '--spec', SPEC, '--out', work, '--samples', str(args.samples),
                        '--records', args.records, *(['--wear-only'] if args.wear_only else [])]
            fpforge.main()
        finally:
            fpstage.set_lights = fpmetals.SET_LIGHTS
            fpmodel.WEAPONS['staff'], fpmodel.palette, fpforge.load = held
            fpforge.CLASSES.clear()
            fpforge.CLASSES.update(classes)
        fpwear.move(work, args.out, metal)
        print(f'{metal}: its frames into {args.out}', flush=True)


if __name__ == '__main__':
    main()
