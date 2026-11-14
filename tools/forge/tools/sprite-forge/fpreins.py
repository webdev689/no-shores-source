"""The first-person forge's hands on the reins, in two kinds of frame the game lays one over the other: each rein from
its fist to the Courser's bit in every frame the ride is drawn in (fpride.py `shots`), and each fist apart, in the
leather glove and each armour set the running hands wear (the fists' own arm, specs/RUN.json).

    python -I tools/sprite-forge/fpreins.py --out public/art/ride [--samples 64] [--sets Iron,Daedric]

Each hand is its own: its hold on the screen, its roll and its tilt differ, and through a stride it gives to the rider's
own motion, never to the horse's head, on a beat of four, the left a beat behind the right (`HOLD`, `GIVE`, `PHASE`).
In a turn the inside hand draws its rein out and back and the outside hand gives forward (`STEER`); the horse's head
follows into the turn (fpride.py `turned`). The left hand is drawn as a right hand in a mirrored world, and the game
turns it back about the screen's middle (src/systems/horse/rideHands.js).

A rein frame is the rein alone, the fist hidden from the eye and the horse held out, so the head hides a rein where it
passes behind the jaw; the game draws the fist over it. Writes `REIN_<shot>_<side>.png` and
`FIST_<pose>_<side>{_<Set>}.png` on one canvas centred on the screen's middle, from the highest row a hand or a rein
reaches to the screen's foot. Plate and mail are grey, which the game dyes as it dyes the fists' gauntlets.

`--bench` draws a bench wagon's lines instead (fpbench.py). The fists are the ride's, drawn in toward the middle and
down (`BENCH_HANDS`), as a driver holds a pair's lines before the body. From each fist one line runs forward and forks
(`FORK`): its draught rein to the horse on its side, its coupling rein across to the other horse, each over its horse's
back through the terrets on that side (the pad's, then the hame's) to the bit. The couplings cross between the backs.
The pair, the pole and the traces are held out. Writes `BENCHREIN_<kind>_<shot>_<side>.png` on `BENCH_CANVAS`.

`--touch` draws the right hand at my horse's head instead, in each shot of fptouch.py's it is seen in, at its own size
(`TOUCH_HAND`). Its pose is solved once on the fitter's mesh (`place_hand`): the palm on the shot's target (fptouch.py
`hand_targets`), on the nose for a pet and under the lips for a feed, the elbow off the screen. The horse is held out,
so its lips hide the fingers they close over. Each shot in the glove and every set (`TOUCHHAND_<shot>{_<Set>}.png`),
and the food on the palm while it is there, raw, the hand and the horse held out (`TOUCHFOOD_<kind>_<shot>.png`), all
on `TOUCH_HANDS_CANVAS`. The game draws the horse, then the hand, then the food."""
import argparse
import json
import math
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import fparm  # noqa: E402
import fparmour  # noqa: E402
import lifetools  # noqa: E402
import fpbench  # noqa: E402
import fpforge  # noqa: E402
import fphead  # noqa: E402
import fphand  # noqa: E402
import fpmodel  # noqa: E402
import fpride  # noqa: E402
import fpstage  # noqa: E402
import fptouch  # noqa: E402
import horse  # noqa: E402
import materials  # noqa: E402
import riding  # noqa: E402
import stage  # noqa: E402
import tack  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SPEC = os.path.join(HERE, 'specs', 'RUN.json')   # the fists' arm, fitted, as the running hands wear it
RUN_ART = os.path.join(HERE, '..', '..', 'public', 'art', 'run')
# the fist closed round a rein: the jab's fist, its thumb a little higher over the knuckles
FIST = {'knuckle': 88.0, 'fold': 86.0, 'spread': 0.0, 'thumb_in': 45.0, 'thumb_bend': 25.0}
SIDES = ('R', 'L')
# each hand's hold on its own screen (the left's as a right hand in the mirrored world): the knuckles' point and depth,
# the elbow's point below the view, the fist's roll and tilt. The left sits a little lower, nearer and flatter
HOLD = {'R': {'tip': (252.0, 152.0), 'depth': 0.36, 'elbow': (318.0, 330.0), 'roll': 40.0, 'tilt': 10.0},
        'L': {'tip': (248.0, 156.0), 'depth': 0.37, 'elbow': (323.0, 334.0), 'roll': 33.0, 'tilt': 15.0}}
# the rider's own give through a stride, a beat a frame of the knuckles (screen dx, dy and depth): a lilt at the walk,
# a push down and forward at the gallop, no beat a mirror of another. Each hand plays it a beat apart (`PHASE`)
GIVE = {'walk': ((0.0, 0.0, 0.0), (0.9, -0.7, 0.004), (0.4, 0.6, 0.002), (-0.7, 0.2, -0.003)),
        'gallop': ((0.0, 0.0, 0.0), (1.3, 1.8, 0.007), (0.5, 2.6, 0.004), (-0.9, 1.0, -0.002))}
PHASE = {'R': 0, 'L': 1}
# steering: the inside hand draws its rein out and back toward the rider, the outside hand gives forward and in
# (screen dx outward, dy down, depth, roll)
STEER = {'in': (24.0, 10.0, -0.06, 16.0), 'out': (-10.0, -5.0, 0.05, -8.0)}
POSES = ('stand-0', *(f'{g}-{k}' for g in ('walk', 'gallop') for k in range(4)), 'steerIn', 'steerOut')
REIN_R = 0.007   # metres round: a strap two or three pixels wide at the fist
REIN = (0.10, 0.05, 0.025)   # its leather, dark
# a bench line's leather: matte, so a line lying along the view does not shine grey down its length
LINE_FINISH = {'rough': 0.85, 'spec': 0.1}
MIRROR = Matrix.Scale(-1.0, 4, (1.0, 0.0, 0.0))   # the camera's world turned over about the screen's middle
# a bench wagon's lines on one canvas, centred on the screen's middle, from the highest row a line reaches to the
# screen's foot, in texels (the game's rideForge.js BENCH_REINS_CANVAS; a line past it fails the forge)
BENCH_CANVAS = (400, 96)
# the touch's right hand (fptouch.py `hand_targets`): laid on the hide for a pet, its fingers together and soft, and a
# little cupped and held out under the lips for a feed. Its fingers and thumb as each holds them
OPEN = {'knuckle': 14.0, 'fold': 16.0, 'spread': 1.0, 'thumb_in': 8.0, 'thumb_bend': 12.0}
CUP = {'knuckle': 8.0, 'fold': 12.0, 'spread': 4.0, 'thumb_in': -10.0, 'thumb_bend': 5.0}
# the arm that places it, in the camera's space (metres): my right shoulder, and how far the elbow may stand from it,
# the shoulder reached forward with the arm (the upper arm is never seen). The elbow stays off the screen, where the
# forearm's open end cannot show
SHOULDER, UPPER_ARM = (0.17, 0.0, -0.24), 0.5
# the touch's hand at its own size, its cuff with it: the fists are drawn larger, as Daggerfall's are, and that large
# up close at the horse they would hide its face
TOUCH_HAND = 1.0
# the touch's hands and food on one canvas, centred on the screen's middle, from the highest row a stroke reaches to
# the screen's foot (rideForge.js TOUCH_HANDS_CANVAS; a hand past it fails the forge)
TOUCH_HANDS_CANVAS = (400, 150)
# the food on the palm: an apple (its radius, its red and its stem) and a handful of oats (its grains, their spread and
# heap), set on the palm a little short of the fingers' roots
APPLE = {'r': 0.035, 'rgb': (0.55, 0.08, 0.04), 'stem': (0.12, 0.07, 0.03)}
OATS = {'grains': 60, 'spread': 0.04, 'heap': 0.018, 'r': 0.0055, 'rgb': (0.62, 0.5, 0.26)}
# on the bench the right fist is drawn this far in toward the middle and down from its ride's place, in texels of the
# 400-texel screen (rideForge.js BENCH_HANDS), the left the mirror: the hands sit between the horses, below their pads
BENCH_HANDS = (-70, 8)
# a line forks this share of the way back from its draught horse's pad terret to the fist, sagging this far (metres):
# the coupling rein buckles on there, and from below the pads the two couplings rise across and cross between the backs
FORK, SAG = 0.5, 0.08


def pose_of(strip, k, turn, side):
    """The fist pose `side`'s hand holds in shot `strip`-`k` (turned `turn`, '' none): steering in a turn, the
    stride's beat on the move (a beat a frame, the left a beat behind), else still."""
    if turn:
        return 'steerIn' if turn == side else 'steerOut'
    if strip in GIVE:
        return f'{strip}-{(k + PHASE[side]) % 4}'
    return 'stand-0'


def hold(pose, side):
    """The fist's pose (fpforge's) for fist pose `pose` of `side`'s hand."""
    h = HOLD[side]
    tip, depth, roll = np.array(h['tip']), h['depth'], h['roll']
    if pose.startswith('steer'):
        dx, dy, dd, dr = STEER['in' if pose == 'steerIn' else 'out']
        tip, depth, roll = tip + (dx, dy), depth + dd, roll + dr
    elif pose != 'stand-0':
        gait, beat = pose.split('-')
        dx, dy, dd = GIVE[gait][int(beat)]
        tip, depth = tip + (dx, dy), depth + dd
    return {'base': [float(h['elbow'][0]), float(h['elbow'][1])], 'depth': float(depth), 'tip': tip.round(3).tolist(),
            'roll': float(roll), 'wrist': 0.0, 'tilt': float(h['tilt']), **FIST}


def bit_at(shot, side):
    """The bit's ring `side`'s rein runs to, in the camera's space of `shot` (turned over for the left)."""
    b = horse.bake()
    S = horse.skins(b, horse.worlds(b, shot['gait'], shot['time'], shot['extra'], shot['calm']))
    ring = tack.bits()[0 if side == 'R' else 1]   # the horse's right ring, +X, on the screen's right
    q = S[tack.bone('Head')] @ np.append(ring, 1.0)
    p = (np.array(fpride.view_of(shot['eye'], shot['down'], shot['roll'], shot['yaw'])) @ q)[:3]
    return p * np.array([-1.0, 1.0, 1.0]) if side == 'L' else p


def rein_curve(rough=0.55, spec=0.3):
    """The rein as a round strap: a curve, its points set each frame (`lay_rein`)."""
    c = bpy.data.curves.new('rein', 'CURVE')
    c.dimensions = '3D'
    c.bevel_depth = REIN_R
    c.bevel_resolution = 2
    sp = c.splines.new('POLY')
    sp.points.add(31)
    c.materials.append(materials.plain(f'rein{rough}', REIN, rough=rough, spec=spec))
    ob = bpy.data.objects.new('rein', c)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def lay_rein(ob, grip, bit, via=()):
    """The rein from its slack below the view up into the fist and on to the bit, smooth through them (and through
    the rings `via` between, in order: a driving line's terrets)."""
    pts = ob.data.splines[0].points
    n = len(pts)
    tail = grip + np.array([-0.03, -0.02, -0.35])   # down past the screen's foot, toward the body's middle
    ctrl = [tail, grip, *via, bit]
    seg = np.concatenate([[0.0], np.cumsum([np.linalg.norm(b - a) for a, b in zip(ctrl, ctrl[1:])])])
    at = np.linspace(0.0, seg[-1], n)
    for i, s_ in enumerate(at):
        k = min(len(ctrl) - 2, int(np.searchsorted(seg, s_, side='right') - 1))
        u = (s_ - seg[k]) / max(seg[k + 1] - seg[k], 1e-9)
        p0, p1 = ctrl[max(0, k - 1)], ctrl[k]
        p2, p3 = ctrl[k + 1], ctrl[min(len(ctrl) - 1, k + 2)]
        q = 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u
                   + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)   # Catmull-Rom through the points
        pts[i].co = (*q, 1.0)


# the Dwarven Dragon's saddle (public/art/dwarven-dragon/saddle-0.png, 320 x 97, along the screen's foot): each fist
# closed over its control post's crystal knob, seen a little from the side as the reins' fists are, the elbow off the
# view's lower corner; the left as a right hand in the mirrored world, the saddle near enough its own mirror. The
# posts stand at the screen's foot, so a fist round a post below its knob would fall off the view. On the cannons'
# volley each fist squeezes and pushes in
DRAGON_HOLD = {'R': {'tip': (208.0, 166.0), 'depth': 0.40, 'elbow': (320.0, 300.0), 'roll': 40.0, 'tilt': 10.0},
               'L': {'tip': (208.0, 166.0), 'depth': 0.40, 'elbow': (320.0, 300.0), 'roll': 40.0, 'tilt': 10.0}}
DRAGON_FIRE = (1.5, 2.0, 0.015, 6.0)   # the volley's push: screen dx inward, dy down, depth, roll
DRAGON_POSES = ('rest', 'fire')


def dragon_hold(pose, side):
    """The fist's pose (fpforge's) on the dragon's saddle post for `pose` ('rest', 'fire') of `side`'s hand."""
    h = DRAGON_HOLD[side]
    tip, depth, roll = np.array(h['tip']), h['depth'], h['roll']
    if pose == 'fire':
        dx, dy, dd, dr = DRAGON_FIRE
        tip, depth, roll = tip + (-dx, dy), depth + dd, roll + dr
    return {'base': [float(h['elbow'][0]), float(h['elbow'][1])], 'depth': float(depth), 'tip': tip.round(3).tolist(),
            'roll': float(roll), 'wrist': 0.0, 'tilt': float(h['tilt']), **FIST}


def run_sets():
    """The sets the running hands are drawn in: the leather glove's (None), then each the run's folder holds."""
    names = {f.split('_', 2)[2][:-4] for f in os.listdir(RUN_ART) if f.startswith('RUN_0-0_')}
    return [None, *sorted(names)]


def eye_for(samples, hand=None, render=True):
    """The fists' eye on the ride's screen: 400 texels across, each 0.8 as wide as tall. `hand`: the hand's size
    (fpmodel's shape `fist`) and its cuff's with it, instead of the fists'."""
    spec = fpforge.load(SPEC)
    if hand:
        S = fpmodel.SHAPE
        S['cuff'], S['fist'] = S['cuff'] * hand / S['fist'], hand
    eye = fpforge.Eye(spec, samples, render)
    if not render:
        return eye
    sc = bpy.context.scene
    sc.render.resolution_x = round(fpstage.W / fpride.TEXEL_X)
    sc.render.pixel_aspect_x, sc.render.pixel_aspect_y = fpride.TEXEL_X, 1.0
    return eye


def render_fists(material, samples, dragon=False):
    """Every fist pose of each hand in `material`'s gauntlets (None: the leather glove), graded as the fists are, over
    the whole screen: {f'{pose}_{side}': rgba}. `dragon`: on the dragon's saddle posts (`DRAGON_HOLD`) in its poses."""
    saved = fparmour.wear(material) if material else None
    try:
        eye = eye_for(samples)
        cols = np.minimum((np.arange(bpy.context.scene.render.resolution_x) * fpride.TEXEL_X).astype(int),
                          fpstage.W - 1)
        out = {}
        for side in SIDES:
            for pose in DRAGON_POSES if dragon else POSES:
                p = dragon_hold(pose, side) if dragon else hold(pose, side)
                work = eye.screen(p, 'fist', raw=True)
                out[f'{pose}_{side}'] = fpforge.finish(work, eye.id_map(p, 'fist')[:, cols], eye.names, fpforge.GRADE)
        return out
    finally:
        if saved:
            fparmour.unwear(saved)


def render_reins(samples, harness=False):
    """Every shot's rein of each hand, the fist hidden from the eye and the horse held out: {f'{key}_{side}': rgba}."""
    eye = eye_for(samples)
    # the mane the ride draws, so the head and the mane hide the reins as they stand
    courser = horse.Courser(tack_height=riding.HEIGHT, reins=False, harness=harness, groomed=True)
    held = horse._holdout()
    for ob in courser.objects:
        ob.data.materials[0] = held
    rein = rein_curve()
    length = fpmodel.length('fists', fpmodel.SHAPE, 'fist')
    out = {}
    for shot in fpride.shots():
        courser.pose(shot['gait'], shot['time'], 180.0, shot['extra'], shot['calm'])
        view = fpride.view_of(shot['eye'], shot['down'], shot['roll'], shot['yaw'])
        for side in SIDES:
            for ob in courser.objects:
                ob.matrix_world = (MIRROR @ view) if side == 'L' else view
            p = hold(pose_of(shot['strip'], shot['k'], shot['turn'], side), side)
            grip = (eye.matrix(p, 'fist') @ np.array([0.0, 0.0, length - 0.045, 1.0]))[:3]   # behind the knuckles
            lay_rein(rein, grip, bit_at(shot, side))
            out[f'{shot["key"]}_{side}'] = eye.screen(p, 'fist', raw=True, only=())   # the rein, the fist unseen
        print(shot['key'], flush=True)
    return out


def bench_bits(pair, shot, side):
    """The ring on `side` of each horse of the pair, in the camera's space of `shot` (turned over for the left)."""
    b = horse.bake()
    ring = tack.bits()[0 if side == 'R' else 1]
    out = []
    for i, (t, extra) in enumerate(zip(shot['times'], fpbench.pair_extra(shot))):
        S = horse.skins(b, horse.worlds(b, shot['gait'], t, extra, shot['calm']))
        q = S[tack.bone('Head')] @ np.append(ring, 1.0)
        p = (np.array(fpbench.placed(pair.kind, shot, i)) @ q)[:3]
        out.append(p * np.array([-1.0, 1.0, 1.0]) if side == 'L' else p)
    return out


def terrets(h, side):
    """A horse's terrets on `side`, back to front (the pad's, the hame's), in the camera's space as its pieces stand
    (the matrix they were last laid on: turned over for the left)."""
    at = 0 if side == 'R' else 1   # tack.py's pieces: _0 on the horse's right, +X
    out = []
    for name in (f'pad_terret_{at}', f'terret_{at}'):
        ob = next(o for o, pc in h.tack if pc['name'] == name)
        local = np.mean([v.co for v in ob.data.vertices], axis=0)
        out.append(np.array(ob.matrix_world @ Vector(local)))
    return out


def bench_grip(grip):
    """A fist's grip (camera space) where the bench draws it: its screen point moved by `BENCH_HANDS`, at its depth."""
    S = fpmodel.SHAPE
    u, v, y = (a[0] for a in fpstage.project(np.array([grip]), S))
    dx, dy = BENCH_HANDS
    return fpstage.unproject(u + dx * fpride.TEXEL_X, v + dy, y, S)


def render_bench_reins(kind, samples):
    """Every shot of a kind's bench, each hand's line forked to both horses' rings on its side, the fist hidden from
    the eye and the pair held out: {f'{key}_{side}': rgba}."""
    eye = eye_for(samples)
    pair = fpbench.Pair(kind)
    held = horse._holdout()
    for ob in pair.objects:
        ob.data.materials[0] = held
    lines = [rein_curve(**LINE_FINISH), rein_curve(**LINE_FINISH)]
    length = fpmodel.length('fists', fpmodel.SHAPE, 'fist')
    out = {}
    for shot in fpbench.shots(kind):
        pair.pose(shot)
        own = {ob: ob.matrix_world.copy() for ob in pair.objects}
        for side in SIDES:
            for ob in pair.objects:
                ob.matrix_world = (MIRROR @ own[ob]) if side == 'L' else own[ob]
            p = hold(pose_of(shot['strip'], shot['k'], shot['turn'], side), side)
            grip = bench_grip((eye.matrix(p, 'fist') @ np.array([0.0, 0.0, length - 0.045, 1.0]))[:3])
            via = [terrets(h, side) for h in pair.horses]
            pad = via[1 if side == 'R' else 0][0]   # the draught horse's: on the hand's side, on the screen's right
            fork = pad + (grip - pad) * FORK - np.array([0.0, 0.0, SAG])
            for line, v, bit in zip(lines, via, bench_bits(pair, shot, side)):
                lay_rein(line, grip, bit, (fork, *v))   # over the horse's back, through its terrets
            # the lines, the fist unseen and where the ride holds it: the game draws it moved by BENCH_HANDS
            out[f'{shot["key"]}_{side}'] = eye.screen(p, 'fist', raw=True, only=())
        print(kind, shot['key'], flush=True)
    return out


def palm_parts(eye):
    """The fist's mesh about its palm, as the fitter holds it: the palm's middle band (the wrist to the knuckles, the
    thumb left out) on its face and on its back, and the palm's heel and its knuckle end."""
    S, rest, _ = eye.drawn('fist', None)
    rig = fparm._RIGS[(S['fist'], S.get('cuff') or S['fist'], len(rest))]
    palm = rig['piece'] == 0
    lo, hi = fphand.WRIST + 0.012, fphand.WRIST + fphand.KNUCKLES * S['fist'] - 0.012
    band = palm & (rest[:, 2] > lo) & (rest[:, 2] < hi) & (np.abs(rest[:, 0]) < 0.03)
    mid = rest[band, 1].mean()
    return (band & (rest[:, 1] < mid), band & (rest[:, 1] >= mid), band & (rest[:, 2] < lo + 0.02),
            band & (rest[:, 2] > hi - 0.02))


def palm_frame(eye, p, parts):
    """The palm of fist pose `p` in the camera's space: its middle on its face, the way out of it and the fingers'
    way along it."""
    S, rest, _ = eye.drawn('fist', None)
    M = eye.matrix(p, 'fist')
    v = fpmodel.posed('fists', 'fist', rest, p, S) @ M[:3, :3].T + M[:3, 3]
    face, back, heel, knuckles = parts
    at = v[face].mean(axis=0)
    out = at - v[back].mean(axis=0)
    out /= np.linalg.norm(out)
    along = v[knuckles].mean(axis=0) - v[heel].mean(axis=0)
    along -= out * (along @ out)
    return at, out, along / np.linalg.norm(along)


def place_hand(eye, target, fingers, parts):
    """The fist pose that lays the palm on `target` (fptouch.py `hand_targets`): its middle there, facing its way, the
    fingers along theirs as near as the wrist allows, the elbow off the screen and within an upper arm of the
    shoulder. Solved from four rolls; the best answers."""
    from scipy.optimize import least_squares
    S = fpmodel.SHAPE
    L = fpmodel.length('fists', S, 'fist')
    shoulder = np.array(SHOULDER)

    def pose_of(x):
        yaw, pitch = math.radians(x[3]), math.radians(x[4])
        d = np.array([math.cos(pitch) * math.sin(yaw), math.cos(pitch) * math.cos(yaw), math.sin(pitch)])
        u, v, _ = fpstage.project(np.array([x[:3], x[:3] + d * L]), S)
        return {'base': [u[0], v[0]], 'depth': float(x[1]), 'tip': [u[1], v[1]], 'roll': float(x[5]),
                'wrist': float(x[6]), 'tilt': float(x[7]), **fingers}, d

    def misses(x):
        p, d = pose_of(x)
        at, out, along = palm_frame(eye, p, parts)
        u, v, _ = fpstage.project(np.array([x[:3]]), S)
        off = max(v[0] - fpstage.H, u[0] - fpstage.W) - 6.0   # past the screen's foot or its right edge
        return np.concatenate([(at - target['at']) / 0.004, (out - target['normal']) / 0.1,
                               (along - target['fingers']) / 0.35, (eye.matrix(p, 'fist')[:3, 2] - d) / 0.01,
                               [min(off, 0.0) / 4.0, max(np.linalg.norm(x[:3] - shoulder) - UPPER_ARM, 0.0) / 0.01,
                                x[6] / 60.0, x[7] / 40.0]])
    d0 = target['at'] - shoulder
    d0 /= np.linalg.norm(d0)
    elbow = target['at'] - d0 * (L - 0.05)
    yaw, pitch = math.degrees(math.atan2(d0[0], d0[1])), math.degrees(math.asin(d0[2]))
    best = None
    for roll in (0.0, 90.0, 180.0, 270.0):
        x0 = np.array([*elbow, yaw, pitch, roll, 0.0, 0.0])
        fit = least_squares(misses, x0, bounds=([-1, 0.15, -1, -180, -89, -720, -70, -35],
                                                [1, 1.5, 1, 180, 89, 720, 70, 35]), x_scale='jac', max_nfev=400)
        if best is None or fit.cost < best.cost:
            best = fit
    return pose_of(best.x)[0], best.fun


def touch_poses():
    """Each shot's hand pose (fptouch.py `shots` with a hand on the screen), solved on the glove's fitter mesh with no
    scene: {key: pose}."""
    eye = eye_for(0, TOUCH_HAND, render=False)
    parts = palm_parts(eye)
    out = {}
    for sh in fptouch.shots():
        target = fptouch.hand_targets(sh)
        if target is None:
            continue
        out[sh['key']], miss = place_hand(eye, target, OPEN if sh['kind'] == 'pet' else CUP, parts)
        off, face, fingers = (np.linalg.norm(miss[a:a + 3]) for a in (0, 3, 6))
        print(f'{sh["key"]}: the palm {off * 4:.1f} mm off, its face {face * 0.1:.2f} and its fingers'
              f' {fingers * 0.35:.2f} astray', flush=True)
    return out


def mesh_object(name, verts, tris, mat):
    """A smooth mesh object of `verts` and `tris` in `mat`, in the scene."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(t) for t in tris])
    me.update()
    me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def apple():
    """An apple sitting on a palm at the origin, its stem up +Z."""
    r = APPLE['r']
    v, t = lifetools._ball((0.0, 0.0, 0.0), r, ring=16)
    v[:, 2] *= 0.88
    body = mesh_object('touch_apple', v + (0.0, 0.0, r * 0.85), t,
                       materials.plain('touch_apple', APPLE['rgb'], rough=0.8, spec=0.1))
    sv, st = lifetools._ball((0.0, 0.0, 0.0), 0.004, ring=6)
    sv[:, 2] *= 3.0
    stem = mesh_object('touch_stem', sv + (0.0, 0.0, r * 1.7 + 0.008), st,
                       materials.plain('touch_stem', APPLE['stem'], rough=0.9))
    return [body, stem]


def oats(seed=5):
    """A handful of oats heaped on a palm at the origin, up +Z."""
    rng = np.random.default_rng(seed)
    mat = materials.plain('touch_oat', OATS['rgb'], rough=0.85)
    out = []
    for i in range(OATS['grains']):
        reach, angle = OATS['spread'] * math.sqrt(rng.random()), rng.random() * 2.0 * math.pi
        rise = 0.008 + OATS['heap'] * (1.0 - (reach / OATS['spread']) ** 2) * rng.random()
        centre = np.array([reach * math.cos(angle), reach * math.sin(angle), rise])
        v, t = lifetools._ball((0.0, 0.0, 0.0), OATS['r'], ring=6)
        v[:, 0] *= 2.2
        lie = rng.random() * math.pi
        spin = np.array([[math.cos(lie), -math.sin(lie), 0.0], [math.sin(lie), math.cos(lie), 0.0], [0.0, 0.0, 1.0]])
        out.append(mesh_object(f'touch_oat{i}', v @ spin.T + centre, t, mat))
    return out


def touch_scene():
    """The touch's horse, held out (fptouch.py's, smoothed as it renders, its head fphead.py's), and the foods:
    (head, {kind: objects})."""
    fphead.install()
    courser = fptouch.smoothed(horse.Courser(tack_height=riding.HEIGHT, reins=False, groomed=True, coat=fpride.COAT))
    head = fphead.Head(courser)
    held = horse._holdout()
    for ob in courser.objects:
        for i in range(len(ob.data.materials)):
            ob.data.materials[i] = held
    return head, {'apple': apple(), 'oats': oats()}


def stage_touch(head, foods, sh, frame, food=None):
    """A shot's horse posed and placed, and `food` (a kind, or None) laid on the palm's `frame` (at, out, along)."""
    head.pose(sh, sh['extra'])
    courser = head.courser
    for ob in courser.objects:
        ob.matrix_world = Matrix(np.array(sh['view']).tolist())
    at, out, along = frame
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = np.cross(along, out), along, out, at
    for kind, obs in foods.items():
        for ob in obs:
            ob.hide_render = kind != food
            ob.matrix_world = Matrix(M.tolist())


def render_touch(material, samples, poses):
    """Every shot's hand in `material`'s gauntlets (None: the leather glove), graded as the fists are, the horse held
    out, over the whole screen: {shot: rgba}."""
    saved = fparmour.wear(material) if material else None
    try:
        eye = eye_for(samples, TOUCH_HAND)
        fphead.true_texels()
        head, foods = touch_scene()
        cols = np.minimum((np.arange(bpy.context.scene.render.resolution_x) * fpride.TEXEL_X).astype(int),
                          fpstage.W - 1)
        out = {}
        for sh in fptouch.shots():
            if sh['key'] not in poses:
                continue
            p = poses[sh['key']]
            stage_touch(head, foods, sh, (np.zeros(3), np.array([0.0, 0.0, 1.0]), np.array([0.0, 1.0, 0.0])))
            out[sh['key']] = fpforge.finish(eye.screen(p, 'fist', raw=True), eye.id_map(p, 'fist')[:, cols], eye.names,
                                            fpforge.GRADE)
            print(sh['key'], flush=True)
        return out
    finally:
        if saved:
            fparmour.unwear(saved)


def render_touch_food(samples, poses):
    """The food on each feed shot's palm while it is there, raw, the hand and the horse held out:
    {f'{kind}_{shot}': rgba}."""
    eye = eye_for(samples, TOUCH_HAND)
    fphead.true_texels()
    parts = palm_parts(eye)
    head, foods = touch_scene()
    out = {}
    for sh in fptouch.shots():
        if sh['kind'] != 'feed' or not sh['hand'][1] or sh['key'] not in poses:
            continue
        p = poses[sh['key']]
        frame = palm_frame(eye, p, parts)
        for kind in foods:
            stage_touch(head, foods, sh, frame, kind)
            out[f'{kind}_{sh["key"]}'] = eye.screen(p, 'fist', raw=True, only=(), under=tuple(eye.names))
    return out


def render_alone(what, samples, work, poses=None):
    """`what` ('reins', or a set's name, 'none' the glove's fists) rendered in a process of its own, as raw arrays in
    `work`: Blender's state grows with each scene, and a process a set keeps a long run from failing part way. A
    touch's takes the hand's poses, solved once, from the file `poses`."""
    name = os.path.join(work, f'{what}.npz')
    subprocess.run([sys.executable, '-I', os.path.abspath(__file__), '--raw', name, '--samples', str(samples),
                    '--what', what, *(('--poses', poses) if poses else ())], check=True)
    with np.load(name) as z:
        return {k: z[k] for k in z.files}


def dragon_out(args):
    """`--dragon`: the fists on the saddle's posts in the glove and every set, each in a process of its own, cut on one
    canvas round the screen's middle from the highest row a fist reaches to the screen's foot."""
    sets = run_sets() if not args.sets else [None if s == 'none' else s for s in args.sets.split(',')]
    work = tempfile.mkdtemp(prefix='fpreins-')
    shots = {}
    for material in sets:
        shots[material] = render_alone(f'dragon:{material or "none"}', args.samples, work)
        print(f'{material or "leather glove"}: rendered', flush=True)
    alpha = np.any([f[..., 3] > 0 for fs in shots.values() for f in fs.values()], axis=0)
    rows, cols = np.nonzero(alpha)
    h, w = alpha.shape
    half = int(max(w / 2 - cols.min(), cols.max() + 1 - w / 2))
    x0, y0, cw, ch = w // 2 - half, int(rows.min()), 2 * half, h - int(rows.min())
    os.makedirs(args.out, exist_ok=True)
    for what, frames in shots.items():
        for key, f in frames.items():
            stage.write_png(os.path.join(args.out, f'DRAGONFIST_{key}{"_" + what if what else ""}.png'),
                            f[y0:y0 + ch, x0:x0 + cw])
    print(f'canvas {cw} x {ch}, from texel {x0}, {y0} of the screen; {len(shots)} sets')


def touch_out(args):
    """`--touch`: the food, then the touch's hand in the glove and every set, each in a process of its own, cut on
    `TOUCH_HANDS_CANVAS` (or, `--loose`, the screen whole)."""
    sets = run_sets() if not args.sets else [None if s == 'none' else s for s in args.sets.split(',')]
    work = tempfile.mkdtemp(prefix='fpreins-')
    poses = os.path.join(work, 'poses.json')
    with open(poses, 'w') as fh:
        json.dump(touch_poses(), fh)
    shots = {'food': render_alone('touchfood', args.samples, work, poses)}
    for material in sets:
        shots[material] = render_alone(f'touch:{material or "none"}', args.samples, work, poses)
        print(f'{material or "leather glove"}: touched', flush=True)
    alpha = np.any([f[..., 3] > 0 for fs in shots.values() for f in fs.values()], axis=0)
    rows, cols = np.nonzero(alpha)
    h, w = alpha.shape
    cw, ch = (w, h) if args.loose else TOUCH_HANDS_CANVAS
    x0, y0 = w // 2 - cw // 2, h - ch
    if cols.min() < x0 or cols.max() >= x0 + cw or rows.min() < y0:
        raise ValueError(f'the touch reaches past its canvas: columns {cols.min()}..{cols.max()}, '
                         f'from row {rows.min()}')
    os.makedirs(args.out, exist_ok=True)
    for what, frames in shots.items():
        for key, f in frames.items():
            name = f'TOUCHFOOD_{key}.png' if what == 'food' else f'TOUCHHAND_{key}{"_" + what if what else ""}.png'
            stage.write_png(os.path.join(args.out, name), f[y0:y0 + ch, x0:x0 + cw])
    print(f'touch: canvas {cw} x {ch}, from texel {x0}, {y0}, reaching from row {rows.min()}; {len(sets)} sets')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--sets', default='', help='these sets alone (the leather glove is `none`), all by default')
    ap.add_argument('--raw', help='render the one `--what` named and keep its frames as raw arrays here')
    ap.add_argument('--what', default='')
    ap.add_argument('--bench', action='store_true', help="a bench wagon's lines (fpbench.py), each kind's")
    ap.add_argument('--touch', action='store_true', help="the touch's hand and food (fptouch.py)")
    ap.add_argument('--loose', action='store_true', help="with --touch: cut on the frames' reach (to measure it)")
    ap.add_argument('--poses', help="with --raw: the touch's hand poses (a file `touch_out` writes)")
    ap.add_argument('--dragon', action='store_true', help="the fists on the Dwarven Dragon's saddle posts")
    args = ap.parse_args()
    if args.raw:
        if args.what.startswith('bench:'):
            frames = render_bench_reins(args.what.split(':', 1)[1], args.samples)
        elif args.what.startswith('touch:'):
            material = args.what.split(':', 1)[1]
            frames = render_touch(None if material == 'none' else material, args.samples, json.load(open(args.poses)))
        elif args.what == 'touchfood':
            frames = render_touch_food(args.samples, json.load(open(args.poses)))
        elif args.what.startswith('dragon:'):
            material = args.what.split(':', 1)[1]
            frames = render_fists(None if material == 'none' else material, args.samples, dragon=True)
        else:
            frames = render_reins(args.samples) if args.what == 'reins' else \
                render_fists(None if args.what == 'none' else args.what, args.samples)
        np.savez_compressed(args.raw, **frames)
        return
    if not args.out:
        ap.error('--out is needed')
    if args.touch:
        touch_out(args)
        return
    if args.dragon:
        dragon_out(args)
        return
    if args.bench:
        work = tempfile.mkdtemp(prefix='fpreins-')
        for kind in fpbench.KINDS:
            frames = render_alone(f'bench:{kind}', args.samples, work)
            alpha = np.any([f[..., 3] > 0 for f in frames.values()], axis=0)
            rows, cols = np.nonzero(alpha)
            h, w = alpha.shape
            cw, ch = BENCH_CANVAS
            x0, y0 = w // 2 - cw // 2, h - ch
            if cols.min() < x0 or cols.max() >= x0 + cw or rows.min() < y0:
                raise ValueError(f'the {kind} lines reach past their canvas: columns {cols.min()}..{cols.max()}, '
                                 f'from row {rows.min()}')
            os.makedirs(args.out, exist_ok=True)
            for key, f in frames.items():
                stage.write_png(os.path.join(args.out, f'BENCHREIN_{kind}_{key}.png'), f[y0:y0 + ch, x0:x0 + cw])
            print(f'{kind}: {len(frames)} line frames on {cw} x {ch}, from texel {x0}, {y0} (reaching from row '
                  f'{rows.min()})', flush=True)
        return
    sets = run_sets() if not args.sets else [None if s == 'none' else s for s in args.sets.split(',')]
    work = tempfile.mkdtemp(prefix='fpreins-')
    shots = {'reins': render_alone('reins', args.samples, work)}
    print('reins: rendered', flush=True)
    for material in sets:
        shots[material] = render_alone(material or 'none', args.samples, work)
        print(f'{material or "leather glove"}: rendered', flush=True)
    alpha = np.any([f[..., 3] > 0 for fs in shots.values() for f in fs.values()], axis=0)
    rows, cols = np.nonzero(alpha)
    h, w = alpha.shape
    half = int(max(w / 2 - cols.min(), cols.max() + 1 - w / 2))
    x0, y0, cw, ch = w // 2 - half, int(rows.min()), 2 * half, h - int(rows.min())
    os.makedirs(args.out, exist_ok=True)
    for what, frames in shots.items():
        for key, f in frames.items():
            name = f'REIN_{key}.png' if what == 'reins' else f'FIST_{key}{"_" + what if what else ""}.png'
            stage.write_png(os.path.join(args.out, name), f[y0:y0 + ch, x0:x0 + cw])
    print(f'canvas {cw} x {ch}, from texel {x0}, {y0} of the screen; {len(shots) - 1} sets')


if __name__ == '__main__':
    main()
