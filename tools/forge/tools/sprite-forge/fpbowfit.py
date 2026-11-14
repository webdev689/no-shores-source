"""The bow's poses (specs/WEAPON09-fit.json) refined on Daggerfall's frames from their keys (fpbowkeys.py): each frame's
bow placed before the eye so the fitter's score (fpfit.evaluate: the outline, the classes and the light) is best, less
how far the frame's landmarks stray and the grip strays from the archer's steady reach. The key's holds stay: the bow's
turn, the arrow, the draw and both hands.

    python -I tools/sprite-forge/fpbowfit.py --ref /tmp/ref-W09.json [--frames 1,2,3] [--iters 50]

The outline alone pulls the bow off Daggerfall's line for the arrow, which the eye reads first, and the landmarks alone
leave the outline loose: together they hold the arrow where Daggerfall aims it and the bow where Daggerfall draws it."""
import argparse
import json
import os
import sys
from functools import partial

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fpbowkeys  # noqa: E402
import fpfit  # noqa: E402
import fpforge  # noqa: E402
import fpmodel  # noqa: E402

LANDMARK_PULL = 0.1   # the score a frame gives up for each (10 px)^2 its landmarks stray, a mean
DEPTH_PULL = 0.01     # and for each (5 cm)^2 its grip strays from the steady reach (fpbowkeys.DEPTH)
ARROW = 10.0          # the arrow's point, nock and tail weigh this many times the bow's own points
SIGMA = 0.35          # the search's first stride, in each value's step (fpfit.steps_for)


def refine(f, ref, iters):
    """Frame `f` refined from its key: (frame, its score at the key, its best, the pose, its stray before and after)."""
    import cma
    spec = fpforge.load(fpbowkeys.SPEC)
    fr = fpfit.reference_frames(spec, json.load(open(ref)))[(0, f)]
    wpn = fpfit.Weapon('bow')
    js = fpfit.joints_of(wpn, 'bow')
    key = fpforge.KEYS[f'0:{f}']
    held = set(key['hold'])
    steps = fpfit.steps_for(wpn, 'bow')
    steps[5] = 0.0   # the roll: the bow's turn is the key's
    steps[[6 + i for i, j in enumerate(js) if j[0] in held]] = 0.0
    x0 = fpfit.vector_of(key, js)
    S = dict(fpmodel.SHAPE)
    t = fpbowkeys.LANDMARKS[f]
    ends, hand = fpbowkeys.arm_ends(S), fpbowkeys.marks(S)

    def stray(x):
        p = fpfit.pose_of(x, js)
        return (fpbowkeys.stray(S, t, p, ends, hand, ARROW) / 100.0 * LANDMARK_PULL
                + ((p['depth'] - fpbowkeys.DEPTH) / 0.05) ** 2 * DEPTH_PULL)

    def value(x):
        return fpfit.evaluate(wpn, fr, x) - stray(x)
    best = first = value(x0)
    bx = x0
    es = cma.CMAEvolutionStrategy(np.zeros(len(x0)), SIGMA, {'popsize': 12, 'maxiter': iters, 'verbose': -9,
                                                              'seed': 3 + f})
    while not es.stop():
        zs = es.ask()
        vals = []
        for z in zs:
            x = x0 + np.asarray(z) * steps
            v = value(x)
            vals.append(-v)
            if v > best:
                best, bx = v, x
        es.tell(zs, vals)
    return f, first, best, fpfit.pose_of(bx, js), stray(x0), stray(bx)


def _num(v):
    return [round(float(a), 3) for a in v] if isinstance(v, (list, tuple, np.ndarray)) else round(float(v), 3)


def main():
    from multiprocessing import Pool
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True, help="Daggerfall's frames as numbers (reference.mjs)")
    ap.add_argument('--frames', default='', help='refine only these (e.g. 1,2,3), keeping the others\' poses')
    ap.add_argument('--iters', type=int, default=50)
    args = ap.parse_args()
    frames = [int(f) for f in args.frames.split(',')] if args.frames else sorted(fpbowkeys.LANDMARKS)
    with Pool(min(len(frames), os.cpu_count() or 1)) as pool:
        done = pool.map(partial(refine, ref=args.ref, iters=args.iters), frames)
    path = fpbowkeys.SPEC[:-len('.json')] + '-fit.json'
    fit = json.load(open(path))
    for f, first, best, pose, s0, s1 in done:
        print(f'frame {f}: {first:.3f} -> {best:.3f}, its landmarks\' cost {s0:.3f} -> {s1:.3f}', flush=True)
        fit[f'0:{f}'] = {k: _num(v) for k, v in pose.items()}
    with open(path, 'w') as fh:
        fh.write('{\n' + ',\n'.join(f'  "{k}": ' + json.dumps(v) for k, v in fit.items()) + '\n}\n')
    print(f'{len(done)} frames refined -> {path}')


if __name__ == '__main__':
    main()
