"""Refine one record's frame by its real renders: its pose, its part's joints, the record's own light and its own shape
values, each candidate rendered as the forge renders it and scored as the eye sees it - its outline over the record's,
less how far its brightness, mapped share for share onto the record's, falls from it. Boxes the spec marks on the record
(`weigh`: [x0, y0, x1, y1, more] in the canvas's pixels) are what the eye reads first, so their brightness counts `more`
again. The result is the record's: its key (its joints held, so the archive's fits keep them), its pose, its own light
and its own shape.

    python -I tools/sprite-forge/fprefine.py --spec tools/sprite-forge/specs/WEAPON10.json --ref /tmp/ref-W10.json \\
        --record 0 [--frame 0] [--iters 45] [--runs 3] [--sigma 0.4] [--keys fist,cuff,arm_r,thumb]

The numpy fitter (fpfit.py) finds the pose first; this one sees what it cannot - shadow, the light's falloff, a hollow
going dark - and so it takes the minutes a run of renders takes. A frame of a record of several has its pose refined
alone: the light and the shape are its record's, shared by its frames."""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fpfit  # noqa: E402
import fpforge  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402

SAMPLES = 20        # a candidate's render: enough to see its shading, quick enough to try a thousand
ERR_UNIT = 120.0    # brightness off (of 255, a texel) that costs as much as the whole outline
ROLL_FREE = 45.0    # degrees the roll may leave its start before each costs JOINT_PULL: a side never turns into another
POSE_STEP = (3.0, 3.0, 0.02, 2.0, 2.0, 8.0)   # base u, v (px), depth (m), far end u, v (px), roll (degrees)
LIGHT_STEP = (0.08, 0.08, 0.08, 2.0, 20.0, 12.0, 12.0)   # the lamp's place and strength; the sun's bearing, height and
#                                                          strength
KEYS = {'fists': ('fist', 'cuff', 'arm_r', 'thumb'), 'climbarm': ('hand', 'cuff', 'arm_r', 'thumb'),
        'castarm': ('hand', 'arm_r', 'thumb', 'fingers'),
        'battleaxe': ('sock_r', 'b_scale', 'b_tall', 'k_scale', 'k_tall'), 'mace': ('core_r', 'f_scale', 'f_tall')}


def light_vector(L):
    """A record's lights as numbers: the lamp's place and strength, the sun's bearing and height (degrees, the way it
    shines from) and its strength."""
    sun = L.get('sun', [0.0, 0.0, -1.0, 0.0])
    f = -np.array(sun[:3]) / max(np.linalg.norm(sun[:3]), 1e-9)
    return [*L['lamp'][:4], math.degrees(math.atan2(f[1], f[0])), math.degrees(math.asin(np.clip(f[2], -1, 1))), sun[3]]


def light_from(x, L):
    """`light_vector`'s inverse, the rest of the record's light (its map, its exposure) as `L` has it."""
    az, el = math.radians(x[4]), math.radians(x[5])
    from_ = np.array([math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)])
    return dict(L, lamp=[float(x[0]), float(x[1]), float(x[2]), float(max(x[3], 0.2))],
                sun=[*(-from_).round(4).tolist(), float(max(x[6], 0.0))])


class Refine:
    """One record's frame, its candidates and their scores."""

    def __init__(self, spec, ref, record, keys, frame=0):
        self.r, self.f = record, frame
        rec = spec['records'][record]
        assert 'mirror' not in rec and 0 <= frame < rec['frames'], 'a fitted record\'s frame is refined'
        self.own = rec['frames'] == 1   # a record of one frame refines its own light and shape too
        keys = keys if self.own else ()
        self.fr = fpfit.reference_frames(spec, ref)[(record, frame)]
        self.part = self.fr.part
        self.weapon = spec['weapon']
        self.eye = fpforge.Eye(spec, SAMPLES)
        self.joints = fpmodel.joints(self.weapon, self.part)
        self.keys = keys
        x, y, cw, ch = self.fr.rect
        self.weigh = np.ones((fpstage.H, fpstage.W))
        for x0, y0, x1, y1, more in rec.get('weigh', ()):
            self.weigh[y + y0:y + y1, x + x0:x + x1] += more
        self.light0 = dict(fpstage.light_for(record, frame))
        self.shape0 = dict(fpmodel.RECORD_SHAPE.get(str(record), {}))
        S = fpmodel.shape_for(record)
        self.start = fpforge.FIT[f'{record}:{frame}']
        lit = light_vector(self.light0) if self.own else []
        self.x0 = np.array([*fpfit.vector_of(self.start, self.joints), *lit, *[float(S.get(k, 1.0)) for k in keys]])
        self.steps = np.array([*POSE_STEP, *[j[1] for j in self.joints], *(LIGHT_STEP if self.own else ()),
                               *[fpfit.SHAPE_STEP[k] for k in keys]])

    def unpack(self, x):
        n = 6 + len(self.joints)
        pose = fpfit.pose_of(x[:n], self.joints)
        if not self.own:
            return pose, self.light0, self.shape0
        light = light_from(x[n:n + 7], self.light0)
        shape = dict(self.shape0, **{k: float(np.clip(v, *fpfit.BOUNDS[k])) for k, v in zip(self.keys, x[n + 7:])})
        return pose, light, shape

    def penalty(self, p):
        past = sum(max(0.0, lo - p[j[0]], p[j[0]] - hi) for j in self.joints for lo, hi in (j[2],))
        turn = abs((p['roll'] - self.start['roll'] + 180.0) % 360.0 - 180.0)
        lo, hi = fpfit.REACH
        S = fpmodel.shape_for(self.r)
        margin = S['focal'] * fpmodel.root_radius(self.weapon, S, self.part) / p['depth']
        return (fpfit.JOINT_PULL * (past + max(0.0, turn - ROLL_FREE)) + fpfit.REACH_PULL * max(0.0, lo - p['depth'],
                p['depth'] - hi) + fpfit.ROOT_PULL * fpfit.off_screen(*p['base'], margin))

    def value(self, x):
        """A candidate's score and its (outline overlap, brightness off)."""
        pose, light, shape = self.unpack(x)
        if pose['depth'] <= fpstage.NEAR * 2:
            return -1.0, (0.0, 255.0)
        fpstage.RECORD_LIGHT[str(self.r)] = light
        fpmodel.RECORD_SHAPE[str(self.r)] = shape
        self.eye.reshape(self.part, self.r)
        raw = self.eye.screen(pose, self.part, raw=True, record=self.r, frame=self.f)
        on, fr = raw[..., 3] > 0, self.fr
        ref = fr.ref > 0
        outside = int((on & ~fr.canvas & ~fr.free).sum())
        overlap = fpfit.iou(on & fr.canvas, ref, outside) or 0.0
        both = on & ref
        if both.sum() < 50:
            return -1.0, (overlap, 255.0)
        a, b, w = raw[..., :3].astype(np.float64).mean(axis=2)[both], fr.lum[both], self.weigh[both]
        mapped = np.sort(b)[np.round(fpfit.ranks(a) / max(len(a) - 1, 1) * (len(b) - 1)).astype(int)]
        off = float((np.abs(mapped - b) * w).sum() / w.sum())
        return overlap - off / ERR_UNIT - self.penalty(pose), (overlap, off)

    def run(self, iters, runs, sigma, log=print):
        import cma
        best_x = self.x0.copy()
        best, info = self.value(best_x)
        log(f'start {best:.4f} overlap {info[0]:.3f} off {info[1]:.1f}')
        for run in range(runs):
            x0 = best_x.copy()
            es = cma.CMAEvolutionStrategy(np.zeros(len(x0)), sigma * (0.6 if run else 1.0), {
                'popsize': 14, 'maxiter': iters, 'verbose': -9, 'seed': 3 + run})
            while not es.stop():
                zs = es.ask()
                vals = []
                for z in zs:
                    x = x0 + np.asarray(z) * self.steps
                    v, inf = self.value(x)
                    vals.append(-v)
                    if v > best:
                        best, best_x, info = v, x, inf
                es.tell(zs, vals)
            log(f'run {run}: {best:.4f} overlap {info[0]:.3f} off {info[1]:.1f}')
        return self.unpack(best_x)


class ArchiveLight:
    """The archive's light refined by its renders over a spread of frames: the lamp's place and strength, the sun, the
    ambient and the exposure, so a facet turned to the lamp flares where Daggerfall's does and a hollow falls dark where
    its does. Each frame is scored on its brightness mapped share for share onto Daggerfall's, texel for texel: where
    the light and the dark lie, not how much of each there is (the grade sees to that)."""

    def __init__(self, spec, ref, frames):
        all_frames = fpfit.reference_frames(spec, ref)
        self.frames = [all_frames[k] for k in frames]
        self.keys = frames
        self.eye = fpforge.Eye(spec, SAMPLES)
        self.light0 = {k: v for k, v in fpstage.LIGHT.items()}
        self.x0 = np.array([*light_vector(self.light0), self.light0.get('world', 0.15),
                            self.light0.get('exposure', 0.0)])
        self.steps = np.array([*LIGHT_STEP, 8.0, 0.3])

    def unpack(self, x):
        return dict(light_from(x[:7], self.light0), world=float(max(x[7], 0.0)), exposure=float(x[8]))

    def value(self, x):
        light = self.unpack(x)
        fpstage.LIGHT.clear()
        fpstage.LIGHT.update(light)
        offs = []
        for (r, f), fr in zip(self.keys, self.frames):
            raw = self.eye.screen(fpforge.FIT[f'{r}:{f}'], fr.part, raw=True, record=r, frame=f)
            both = (raw[..., 3] > 0) & (fr.ref == 5)
            if both.sum() < 50:
                continue
            a, b = raw[..., :3].astype(np.float64).mean(axis=2)[both], fr.lum[both]
            mapped = np.sort(b)[np.round(fpfit.ranks(a) / max(len(a) - 1, 1) * (len(b) - 1)).astype(int)]
            offs.append(float(np.abs(mapped - b).mean()))
        return -float(np.mean(offs)), light

    def run(self, iters, runs, sigma, log=print):
        import cma
        best_x = self.x0.copy()
        best, _ = self.value(best_x)
        log(f'start: off {-best:.2f}')
        for run in range(runs):
            x0 = best_x.copy()
            es = cma.CMAEvolutionStrategy(np.zeros(len(x0)), sigma * (0.6 if run else 1.0), {
                'popsize': 12, 'maxiter': iters, 'verbose': -9, 'seed': 5 + run})
            while not es.stop():
                zs = es.ask()
                vals = []
                for z in zs:
                    x = x0 + np.asarray(z) * self.steps
                    v, _ = self.value(x)
                    vals.append(-v)
                    if v > best:
                        best, best_x = v, x
                es.tell(zs, vals)
            log(f'run {run}: off {-best:.2f}')
        return self.unpack(best_x)


def write(base, record, pose, light, shape, joints, frame=0, own=True):
    """The refined frame into the tables: its key holding its joints, its pose, and (`own`, a record of one frame) its
    record's own light and shape."""
    r = str(record)
    held = [j[0] for j in joints]
    for name, entry in (('keys', dict(pose, hold=held) if held else pose), ('fit', pose)):
        table = json.load(open(f'{base}-{name}.json')) if os.path.exists(f'{base}-{name}.json') else {}
        table[f'{r}:{frame}'] = entry
        fpforge.write_table(f'{base}-{name}.json', table)
    if not own:
        return
    table = json.load(open(base + '-light.json'))
    own = table.setdefault('records', {}).setdefault(r, {})
    own.update(lamp=[round(v, 3) for v in light['lamp']], sun=[round(v, 3) for v in light['sun']])
    own.setdefault('world', light['world'])   # the ambient a record's light is drawn in, whole without the archive's
    with open(base + '-light.json', 'w') as fh:
        fh.write(json.dumps(table, indent=1) + '\n')
    fpmodel.write_shape(base + '-shape.json', shape, record=record)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spec', required=True)
    ap.add_argument('--ref', required=True)
    ap.add_argument('--record', type=int, default=0)
    ap.add_argument('--frame', type=int, default=0)
    ap.add_argument('--iters', type=int, default=45)
    ap.add_argument('--runs', type=int, default=3)
    ap.add_argument('--sigma', type=float, default=0.4)
    ap.add_argument('--keys', default='', help='the record\'s own shape values refined (comma-separated)')
    ap.add_argument('--archive', default='', help='refine the archive\'s light over these frames instead (1:1,2:3,...)')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    spec = fpforge.load(args.spec)
    if args.archive:   # the archive's light, over a spread of its frames; a record lit apart keeps its own
        frames = [tuple(int(n) for n in k.split(':')) for k in args.archive.split(',')]
        job = ArchiveLight(spec, json.load(open(args.ref)), frames)
        light = job.run(args.iters, args.runs, args.sigma, log=lambda s: print(s, flush=True))
        path = args.spec[:-len('.json')] + '-light.json'
        table = json.load(open(path))
        for k in ('lamp', 'sun'):
            table[k] = [round(float(v), 3) for v in light[k]]
        table['world'], table['exposure'] = round(light['world'], 3), round(light['exposure'], 3)
        with open(path, 'w') as fh:
            fh.write(json.dumps(table, indent=1) + '\n')
        return
    keys = tuple(k for k in args.keys.split(',') if k) or KEYS.get(spec['weapon'], ())
    job = Refine(spec, json.load(open(args.ref)), args.record, keys, args.frame)
    pose, light, shape = job.run(args.iters, args.runs, args.sigma, log=lambda s: print(s, flush=True))
    write(args.spec[:-len('.json')], args.record, pose, light, shape, job.joints, args.frame, job.own)


if __name__ == '__main__':
    main()
