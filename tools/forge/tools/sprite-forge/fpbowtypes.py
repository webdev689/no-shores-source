"""Each bow type's own first-person frames: WEAPON09.CIF's frames rendered again at the same poses, lights and grade in
the type's own sizes (fpbow.py BOW_TYPES: the short bow shorter and recurved), named for it (`_Short`). The long bow's
are the archive's own frames, with no suffix.

    python -I tools/sprite-forge/fpbowtypes.py --out public/art/studio/forge/WEAPON09 [--types Short]"""
import argparse
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fpbow  # noqa: E402
import fpmodel  # noqa: E402
import fpwear  # noqa: E402

SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'WEAPON09.json')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--types', default=','.join(t for t in fpbow.BOW_TYPES if t != 'Long'))
    ap.add_argument('--samples', type=int, default=128)
    ap.add_argument('--wear-only', action='store_true', help="the frames' wear maps alone (fpwear.py)")
    args = ap.parse_args()
    import fpforge
    os.makedirs(args.out, exist_ok=True)
    load = fpforge.load
    for kind in [t for t in args.types.split(',') if t]:
        work = tempfile.mkdtemp(prefix=f'fpbow-{kind}-')

        def typed(path, kind=kind):   # the archive's tables, then the type's own sizes over its shape
            spec = load(path)
            fpmodel.SHAPE.update(fpbow.typed(fpmodel.SHAPE, kind))
            return spec
        fpforge.load = typed
        try:
            sys.argv = ['fpforge.py', '--spec', SPEC, '--out', work, '--samples', str(args.samples),
                        *(['--wear-only'] if args.wear_only else [])]
            fpforge.main()
        finally:
            fpforge.load = load
        fpwear.move(work, args.out, kind)
        print(f'{kind}: its frames into {args.out}', flush=True)


if __name__ == '__main__':
    main()
