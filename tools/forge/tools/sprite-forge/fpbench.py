"""The first-person forge's bench: a bench wagon's pair, the Courser twice (horse.py) in a pole team's harness (tack.py
`all_pieces`'s team), as its driver sees them from the bench of the Open Wagon or the Caravan. Daggerfall has no bench
wagon, so the pair is drawn by its riding picture's law, as the ride is (fpride.py): on the screen's foot in its
middle, texels 0.8 as wide as tall, through the first-person forge's lens.

    python -I tools/sprite-forge/fpbench.py --out public/art/ride [--samples 64] [--kind openWagon] [--only keys]

The eye is the driver's (world/wagonModels.js driverSeatFor, where the hosts stand the camera: the seated eye over the
bench's top), and steady: the bench rides the wagon, not a horse. The pair stands either side of the pole at the hitch,
where the game stands it (scenes/horseCartPool.js teamOf), the off horse a share of a stride behind the near. A kind's
look puts the ears' tips, on average over every gait's stride, on row `TOP`: higher than the ride's, so the backs and
the pads' terrets stand above the hands, and the lines rise from the hands to them.

The shots are the ride's (fpride.py `shots`): each gait's frames, each turned either way (the pair and the pole swung
on the kingpin to the front axle's lock, the necks bent into the turn), and the ear flicks (earL the near horse's left
ear, earR the off horse's right). The pole, the neck yoke and each horse's two traces are the game's (wagonModels.js
`poleGeometry`, TEAM), drawn as the tack is.

Writes `BENCH_<kind>_<shot>.png` and its coat map `BENCH_<kind>_<shot>_uv.png` (fpride.py `texel_picture`), every
frame of both kinds on one canvas (`CANVAS`), graded as the ride is (specs/RIDE-grade.json). The lines are
fpreins.py's."""
import argparse
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import fpride  # noqa: E402
import horse  # noqa: E402
import riding  # noqa: E402
import stage  # noqa: E402

# each bench wagon's bench, its top's height and its way along the wagon (world/wagonModels.js MEASURED's `bench`), the
# hitch where its team stands (systems/wagon/wagonKinds.js `hitch`) and its front axle, the kingpin the pole turns on
# (MEASURED's `frontAxle`, its height and its way along): metres, the wagon's frame
KINDS = {'openWagon': {'bench': (1.54, 5.28), 'hitch': 7.1, 'axle': (0.824, 3.8659)},
         'caravan': {'bench': (2.476, 5.49), 'hitch': 7.7, 'axle': (0.824, 3.8659)}}
# the seated eye over the bench's top (player/seatPose.js SEATED_EYE_HEIGHT less SEATED_HIP_HEIGHT)
EYE_OVER_BENCH = 0.61
# the team (world/wagonModels.js TEAM): each horse's way across the pole, the neck yoke's height and its way past the
# hitch, the doubletree's way behind the horses' middles and its height, and a singletree's half width
SIDE, YOKE_Y, POLE_TIP = 0.65, 1.15, 0.5
TREE = {'back': 1.55, 'y': 0.92, 'half': 0.3}
# the front axle's lock (wagonModels.js steerLimitOf, Mac's open wagon and caravan): a turn swings the pair this far
LOCK = 6.85
# the ears' tips on this row of the 200-row screen, on average over every gait's stride
TOP = 75
# each horse's rise and fall through a gait's stride held to this share of its own, as the ride holds its head
# (fpride.py STEADY): the bench's eye is steady, and a stride drawn in four frames would toss the pair 25 rows a frame
BOB = {'walk': 0.5, 'gallop': 0.35}
# the off horse this share of a stride behind the near: a pair walks nearly, never quite, in step
OFF_PHASE = 0.12
# the off horse's mane (horse.py Groom's seed): a pair's two manes are not one
OFF_SEED = 23
# the pole's oak and a trace's leather (sRGB 0..255), as world/wagonArt.js paints them
OAK, LEATHER = (84, 58, 36), (98, 62, 34)
TRACE_R = 0.011   # a trace's round, metres
# every frame of both kinds on one canvas, in texels (rideForge.js BENCH_CANVAS): the screen's width, from the highest
# row either pair reaches in any frame to the screen's foot (the frames are cut on it; a pair past it fails the forge)
CANVAS = (400, 144)


def eye_of(kind):
    """The driver's eye in the team's frame: the ground between the pair at the hitch, +Y ahead, +Z up."""
    k = KINDS[kind]
    by, bz = k['bench']
    return Vector((0.0, bz - k['hitch'], by + EYE_OVER_BENCH))


def kingpin_of(kind):
    """The front axle's kingpin in the team's frame (the pair and the pole swing on it)."""
    k = KINDS[kind]
    return Vector((0.0, k['axle'][1] - k['hitch'], 0.0))


def swing(kind, turn):
    """The pair's swing on the kingpin for a turn ('L' to the driver's left, 'R', '' none), in the team's frame."""
    if not turn:
        return Matrix.Identity(4)
    k = kingpin_of(kind)
    return Matrix.Translation(k) @ Matrix.Rotation(math.radians(fpride.sign_of(turn) * LOCK), 4, 'Z') @ \
        Matrix.Translation(-k)


def pair_extra(shot):
    """Each horse's bones' turns for `shot`: the ride's (the gait's ears, a turn's bend), and an ear flick's on its own
    horse alone (earL the near horse, earR the off)."""
    base = shot['extra']
    if shot['strip'] not in fpride.FIDGETS:
        return [base, base]
    stand = shot['stand_extra']
    flick = fpride.merged(stand, fpride.fidget(shot['strip'], fpride.FIDGETS[shot['strip']][shot['k']]))
    return [flick, stand] if shot['strip'] == 'earL' else [stand, flick]


def shots(kind):
    """Every shot of a kind's bench: the ride's keys, gaits, times and turns (fpride.py `shots`), its own eye, each
    horse's held rise and fall (`BOB`), and its look down: one a kind, the ears' tips on row `TOP` on average over every
    frame of the stride."""
    ride = fpride.shots()
    stand = next(s for s in ride if s['key'] == 'stand-0')
    eye = eye_of(kind)
    out = []
    for s in ride:
        duration = horse.bake()['gaits'][s['gait']]['duration']
        times = (s['time'], s['time'] + OFF_PHASE * duration)
        out.append({**s, 'eye': eye, 'roll': 0.0, 'yaw': 0.0, 'times': times, 'stand_extra': stand['extra']})
    gaits = [s for s in out if not s['turn'] and s['strip'] in fpride.GAITS]
    rise = {}
    for strip, share in BOB.items():
        mine = [s for s in gaits if s['strip'] == strip]
        tips = {s['k']: np.array([tip[2] for tip in ear_tips(s)]) for s in mine}
        mean = np.mean(list(tips.values()), axis=0)
        rise.update({(strip, k): tuple(float(r) for r in (share - 1.0) * (z - mean)) for k, z in tips.items()})
    for s in out:
        s['rise'] = rise.get((s['strip'], s['k']), (0.0, 0.0))
    lift = math.degrees(math.atan((fpride.fpstage.CY - TOP) / fpride.FOCAL))
    down = float(np.mean([ears_below(kind, s) for s in gaits])) + lift
    for s in out:
        s['down'] = down
    return out


def ear_tips(shot):
    """Each horse's higher ear's tip at `shot` (the near horse's first), in the team's frame, before its rise."""
    b = horse.bake()
    mesh = next(m for m in b['meshes'] if m['part'] == 'body')
    joints = np.array(mesh['joints']).reshape(-1, 4)
    weights = np.array(mesh['weights']).reshape(-1, 4)
    names = [bone['name'] for bone in b['bones']]
    on = np.zeros(len(joints), dtype=bool)
    for ear in fpride.EARS:
        on |= (weights * (joints == names.index(ear))).sum(axis=1) > 0.5
    out = []
    for side, t, extra in zip((-SIDE, SIDE), shot['times'], pair_extra(shot)):
        p = horse.posed(mesh, horse.skins(b, horse.worlds(b, shot['gait'], t, extra, shot['calm'])))[on]
        p[:, 0] += side
        out.append(p[p[:, 2].argmax()])
    return out


def ears_below(kind, shot):
    """Degrees under the level from the eye to the higher ear's tip of the pair at `shot`, each horse risen."""
    eye = eye_of(kind)
    return -max(math.degrees(math.atan2(tip[2] + r - eye.z, tip[1] - eye.y))
                for tip, r in zip(ear_tips(shot), shot['rise']))


def placed(kind, shot, i):
    """Horse `i`'s (0 the near) matrix at `shot`: the camera's (the eye, the look down, the turn's swing), then its way
    across the pole and its rise."""
    view = fpride.view_of(shot['eye'], shot['down'], shot['roll'], shot['yaw']) @ swing(kind, shot['turn'])
    return view @ Matrix.Translation(((-SIDE, SIDE)[i], 0.0, shot['rise'][i]))


def material(name, rgb, rough=0.7):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*[(c / 255.0) ** 2.2 for c in rgb], 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    return m


def tube_object(name, pts, radius, mat):
    """A round tube along `pts` (the team's frame), as a beveled curve."""
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.bevel_depth = radius
    c.bevel_resolution = 2
    sp = c.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (*q, 1.0)
    c.materials.append(mat)
    ob = bpy.data.objects.new(name, c)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def set_tube(ob, pts):
    for p, q in zip(ob.data.splines[0].points, pts):
        p.co = (*q, 1.0)


class Pair:
    """The pair, the pole and the traces: the near horse on the driver's left, the off on the right."""

    def __init__(self, kind):
        self.kind = kind
        self.horses = [horse.Courser(tack_height=riding.HEIGHT, reins=False, team=True, groomed=True,
                                     coat=fpride.COAT, seed=s) for s in (None, OFF_SEED)]
        oak, leather = material('bench_oak', OAK), material('bench_leather', LEATHER)
        k = KINDS[kind]
        root = (0.0, k['axle'][1] - k['hitch'], k['axle'][0])
        self.pole = tube_object('bench_pole', np.linspace(root, (0.0, POLE_TIP, YOKE_Y), 8), 0.06, oak)
        half = SIDE - 0.24 - 0.05   # the yoke between the collars (TEAM.collar's x)
        self.yoke = tube_object('bench_yoke', np.linspace((-half, POLE_TIP, YOKE_Y), (half, POLE_TIP, YOKE_Y), 6),
                                0.025, oak)
        self.traces = [tube_object(f'bench_trace_{i}', np.zeros((10, 3)), TRACE_R, leather) for i in range(4)]
        self.gear = [self.pole, self.yoke, *self.traces]

    @property
    def objects(self):
        return [ob for h in self.horses for ob in h.objects] + self.gear

    def pose(self, shot):
        """Lay `shot` on the pair: each horse's gait, its own bones' turns, its traces from its collar to its
        singletree, and everything on the camera's matrix (the eye, the look down, the turn's swing)."""
        view = fpride.view_of(shot['eye'], shot['down'], shot['roll'], shot['yaw']) @ swing(self.kind, shot['turn'])
        for i, (h, side, t, extra) in enumerate(zip(self.horses, (-SIDE, SIDE), shot['times'], pair_extra(shot))):
            h.pose(shot['gait'], t, 180.0, extra, shot['calm'])   # back to the bake's frame
            for ob in h.objects:
                ob.matrix_world = placed(self.kind, shot, i)
            collar = next(ob for ob, pc in h.tack if pc['name'] == 'collar')
            co = np.array([v.co for v in collar.data.vertices])
            for j, s in enumerate((-1.0, 1.0)):
                mine = co[s * co[:, 0] > 0]
                hook = mine[np.argmax(s * mine[:, 0] - np.abs(mine[:, 2] - (mine[:, 2].min() + 0.35 *
                                                                            np.ptp(mine[:, 2]))))]
                start = hook + np.array([side, 0.0, shot['rise'][i]])
                end = np.array([side + s * TREE['half'], -TREE['back'] - 0.04, TREE['y']])
                line = np.linspace(start, end, 10)
                line[:, 2] -= 0.04 * np.sin(np.linspace(0, math.pi, 10))   # a trace sags a little between its ends
                set_tube(self.traces[2 * i + j], line)
        for ob in self.gear:
            ob.matrix_world = view

    def _datas(self, names):
        out = [d for h in self.horses for d in h._datas(names)]
        if horse.TACK[0] in names:
            out += [ob.data for ob in self.gear]
        return out

    def _showing(self, render, samples, held):
        datas = self._datas(held)
        own = [d.materials[0] for d in datas]
        sc = bpy.context.scene
        was = sc.cycles.samples
        for d in datas:
            d.materials[0] = horse._holdout()
        sc.cycles.samples = samples
        try:
            return render()[..., 3] > 0
        finally:
            for d, m in zip(datas, own):
                d.materials[0] = m
            sc.cycles.samples = was

    def parts_of(self, shot, render, samples=horse.MASK_SAMPLES):
        """Each texel's part (horse.py `mane_where`'s, over the pair): 2 the manes, 3 the tack and gear, 1 the coats."""
        mane = self._showing(render, samples, ['body', *horse.TACK])
        tack_on = self._showing(render, samples, ['body', 'hair', 'strands'])
        on = shot[..., 3] > 0
        return np.where(on & tack_on, 3, np.where(on & mane, 2, np.where(on, 1, 0)))

    def coat_texels(self, coat, render):
        """Which coat texel each coat pixel shows (horse.py `coat_texels`), over both horses: both wear one picture."""
        from scipy import ndimage
        sc = bpy.context.scene
        bodies = [h.parts['body'][0].data for h in self.horses]
        others = self._datas(['hair', 'strands', *horse.TACK])
        own = [d.materials[0] for d in bodies + others]
        was = (sc.cycles.samples, sc.view_settings.view_transform)
        for d in bodies:
            d.materials[0] = horse._texel_address(horse.PICTURES['body'])
        for d in others:
            d.materials[0] = horse._holdout()
        sc.cycles.samples, sc.view_settings.view_transform = 1, 'Raw'
        try:
            shot = render()
        finally:
            for d, m in zip(bodies + others, own):
                d.materials[0] = m
            sc.cycles.samples, sc.view_settings.view_transform = was
        found = shot[..., 3] > 0
        if not found.any():
            return np.zeros(shot.shape[:2] + (2,), np.uint8)
        _, (iy, ix) = ndimage.distance_transform_edt(~found, return_indices=True)
        return np.where(coat[..., None], shot[iy, ix, :2], 0).astype(np.uint8)


def frames(kind, samples, only=None):
    """Every shot of a kind's bench over the whole screen, its parts and coat texels: {key: (rgba, parts, texels)}."""
    fpride.setup(samples)
    pair = Pair(kind)
    tmp = os.path.join(tempfile.mkdtemp(), 'r.png')
    out = {}
    for sh in shots(kind):
        if only and sh['key'] not in only:
            continue
        pair.pose(sh)
        shot = stage.render_rgba(tmp)
        parts = pair.parts_of(shot, lambda: stage.render_rgba(tmp))
        out[sh['key']] = (shot, parts, pair.coat_texels(parts == 1, lambda: stage.render_rgba(tmp)))
        print(kind, sh['key'], flush=True)
    return out


def canvas_of(kind, shots_):
    """The canvas (`CANVAS`) on the whole screen's texels, its middle the screen's and its foot the screen's:
    (x0, y0, width, height). A pair reaching past it is an error, not a frame cut short."""
    alpha = np.any([f[..., 3] > 0 for f in shots_.values()], axis=0)
    rows, cols = np.nonzero(alpha)
    h, w = alpha.shape
    cw, ch = CANVAS
    x0, y0 = w // 2 - cw // 2, h - ch
    if cols.min() < x0 or cols.max() >= x0 + cw or rows.min() < y0:
        raise ValueError(f'the {kind} pair reaches past its canvas: columns {cols.min()}..{cols.max()}, '
                         f'from row {rows.min()}')
    return x0, y0, cw, ch


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--kind', default='', help='this bench wagon alone (openWagon, caravan); both by default')
    ap.add_argument('--only', default='', help='these shots alone (keys, as gallop-3_tL), for a look')
    ap.add_argument('--loose', action='store_true', help='cut on the frames\' own reach, not CANVAS (to measure it)')
    args = ap.parse_args()
    for kind in ([args.kind] if args.kind else list(KINDS)):
        rendered = frames(kind, args.samples, set(args.only.split(',')) if args.only else None)
        shots_ = fpride.graded({k: (f, ids) for k, (f, ids, _) in rendered.items()})
        if args.loose:
            alpha = np.any([f[..., 3] > 0 for f in shots_.values()], axis=0)
            rows, cols = np.nonzero(alpha)
            print(f'{kind}: reaches columns {cols.min()}..{cols.max()}, from row {rows.min()} of the screen')
            x0, y0, cw, ch = 0, 0, alpha.shape[1], alpha.shape[0]
        else:
            x0, y0, cw, ch = canvas_of(kind, shots_)
        os.makedirs(args.out, exist_ok=True)
        for key, f in shots_.items():
            stage.write_png(os.path.join(args.out, f'BENCH_{kind}_{key}.png'), f[y0:y0 + ch, x0:x0 + cw])
            _, ids, texels = rendered[key]
            stage.write_png(os.path.join(args.out, f'BENCH_{kind}_{key}_uv.png'),
                            fpride.texel_picture(texels, ids == 1)[y0:y0 + ch, x0:x0 + cw])
        print(f'{kind}: canvas {cw} x {ch}, from texel {x0}, {y0} of the screen; {len(shots_)} frames')


if __name__ == '__main__':
    main()
