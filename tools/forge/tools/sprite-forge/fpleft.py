"""An archive's frames for the left hand: the forge's right-hand frames rendered again under the light mirrored across
the eye (the lamp's and the sun's sideways reach turned about), so the game's mirror of such a frame shows the left
hand's weapon lit from the same side as the right's. Daggerfall draws the left hand of a pair as the right flipped;
flipping a frame flips its light too, and two blades lit from two sides read as two lamps.

    python -I tools/sprite-forge/fpleft.py --spec tools/sprite-forge/specs/WEAPON04.json \\
        --out public/art/studio/forge/WEAPON04 [--sets Iron,Daedric] [--samples 128] [--records 0,6]

Writes each frame beside its right-hand one with `Left` after its name: `WEAPON04.CIF_1-2_Left.png` for the frame every
metal shares, `WEAPON04.CIF_1-2_IronLeft.png` for a metal's own, `WEAPON10.CIF_0-0_DaedricLeft.png` for an armour
set's. The battleaxe's metals are fpmetals.py's, the fists' sets fparmour.py's; the sword's metals and hands are
layers, whose left hand's are fplayers.py --left's."""
import argparse
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fpstage  # noqa: E402

SUFFIX = 'Left'
# what each weapon's sets are rendered by, and its sets
WEAPONS = {
    'sword': ('metals', ()),   # its metals and hands are layers: theirs are fplayers.py --left's
    'battleaxe': ('metals', ('Iron', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')),
    'fists': ('armour', ('Leather', 'Chain', 'Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium',
                         'Ebony', 'Orcish', 'Daedric')),
}


def mirrored(light):
    """A light table with every lamp's and sun's sideways reach turned about the eye."""
    out = dict(light)
    for key in ('lamp', 'sun'):
        if key in out:
            v = list(out[key])
            v[0] = -v[0]
            out[key] = v
    return out


def mirror_light():
    """fpstage.load_light, its light mirrored once read: every render after it is the left hand's light."""
    load = fpstage.load_light

    def left(path):
        load(path)
        fpstage.LIGHT.update(mirrored(fpstage.LIGHT))
        for record, own in list(fpstage.RECORD_LIGHT.items()):
            fpstage.RECORD_LIGHT[record] = mirrored(own)
    fpstage.load_light = left
    return load


def left_name(name):
    """A frame's file named for the left hand: `Left` after its set, or as its set where it has none."""
    stem, ext = os.path.splitext(name)
    head, _, tail = stem.rpartition('_')
    if head and not tail[:1].isdigit() and '-' not in tail:
        return f'{stem}{SUFFIX}{ext}'
    return f'{stem}_{SUFFIX}{ext}'


def render(spec, out, sets, samples, shared=True, records=''):
    """The spec's frames under the mirrored light into `out`: the shared ones and each of `sets` (of `records` alone,
    where given)."""
    import json
    import fparmour
    import fpforge
    import fpmetals
    weapon = json.load(open(spec))['weapon']
    kind, _ = WEAPONS[weapon]
    work = tempfile.mkdtemp(prefix='fpleft-')
    load = mirror_light()
    try:
        if shared:
            sys.argv = ['fpforge.py', '--spec', spec, '--out', work, '--samples', str(samples), '--records', records]
            fpforge.main()
        if sets:
            if kind == 'metals':
                sys.argv = ['fpmetals.py', '--weapon', weapon, '--out', work, '--metals', ','.join(sets),
                            '--samples', str(samples), '--records', records]
                fpmetals.main()
            else:
                sys.argv = ['fparmour.py', '--spec', spec, '--out', work, '--materials', ','.join(sets),
                            '--samples', str(samples), '--records', records]
                fparmour.main()
    finally:
        fpstage.load_light = load
    for name in sorted(os.listdir(work)):
        shutil.move(os.path.join(work, name), os.path.join(out, left_name(name)))
    os.rmdir(work)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--sets', default=None, help='the metals or armour sets (default: all of the weapon\'s)')
    ap.add_argument('--no-shared', action='store_true', help='skip the frames every metal shares')
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--records', default='', help='these records alone (all by default)')
    args = ap.parse_args()
    import json
    weapon = json.load(open(args.spec))['weapon']
    sets = WEAPONS[weapon][1] if args.sets is None else tuple(s for s in args.sets.split(',') if s)
    os.makedirs(args.out, exist_ok=True)
    render(args.spec, args.out, sets, args.samples, shared=not args.no_shared, records=args.records)


if __name__ == '__main__':
    main()
