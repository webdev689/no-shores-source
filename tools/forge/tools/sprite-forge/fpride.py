"""The first-person forge's ride: the Courser (horse.py) as its rider sees it from the saddle, its head and mane before
the eye, through a stand, a walk and a gallop. It takes the place of Daggerfall's riding picture (MRED00I0.CFA), drawn
where the game draws that picture (src/systems/riding.js `ridingRect`): on the bottom of the screen, in its middle.

    python -I tools/sprite-forge/fpride.py --out public/art/ride [--samples 64] [--preview <dir>]

The eye is the rider's own: the seated forge body as riding.py poses it, its head carried by the horse's back through
each gait and leaning into the gallop. The camera is the first-person forge's (fpstage.py, the running arms' focal),
its texels 0.8 as wide as tall, as the game draws the riding picture (riding.js `SCALE_FACTOR_X`). So a frame is drawn
by that picture's own law, and the horse keeps its true shape on any screen.

At that lens the Courser's head is the size of Daggerfall's, so only the look down is chosen: each gait's puts the
ears' tips, on average over its stride, on the classic picture's top row (`look_down`). The head stands where
Daggerfall's does and bobs about it as the stride carries it: a little at the walk, more at the gallop, where the head
carries lower and the rider looks further down the neck.

The coat and the mane are graded onto Daggerfall's riding picture, colour for colour at the grade's shares, as the
sprite forge grades its bodies (forge.py `grade_frame`, specs/RIDE-grade.json): the warm, bright hide and the black mane
with its few bright glints. The mane is its strands (horse.py) and its cards, told from the coat by a render with the
coat held out. `--reference` (from rideReference.mjs, outside the repo) fits the grade again from the ungraded frames.

Writes `RIDE_<gait>-<frame>.png` for each gait's frames (`GAITS`), every frame on one canvas (`CANVAS`): the width the
horse reaches in any frame of the ride or the cart, from the highest row it reaches to the screen's foot.

`--cart` forges the cart's picture (MRED01I0.CFA) instead, as `CART_<gait>-<frame>.png`: the Small Cart's driver rides
the horse in its shafts, so the eye is the same, and the horse wears the driving harness over its tack (tack.py
`collar_pieces`, `blinker_pieces`). The cart is never dyed, so it has no coat maps."""
import argparse
import json
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import forge  # noqa: E402
import fpstage  # noqa: E402
import horse  # noqa: E402
import riding  # noqa: E402
import stage  # noqa: E402

# each gait the ride plays, the rider's mounted animation it is seen from, and its frames: the stride spread over the
# riding animator's four (riding.js `RidingAnimator`), the stand's one
GAITS = {'stand': ('horseidle', 1), 'walk': ('horsewalk', 4), 'gallop': ('horsegallop', 4)}
# the stride tamed (the owner: the gallop bobbed too much and should feel uneven): the neck's and head's own swing held
# that share of the way from the stride's average (`CALM`); the look following that share of the ears' rise and fall,
# as a rider's eyes settle on the head (`STEADY`); the frames taken unevenly through the stride, a share of a frame
# either way (`LILT`); and the gallop's lead, the head swaying aside and back and the rider rolling with it (`LEAD`)
CALM = {'walk': 0.6, 'gallop': 0.45}
STEADY = {'walk': 0.85, 'gallop': 0.92}
# Daggerfall's ride holds the head on its rows (a row at most) and sways it across instead, unevenly: 0, 4 left, 0 and
# 2 right of the screen's texels over its four frames. The view turns that much about its up axis
SWAY = {'walk': (0.0, -2.0, 0.0, 1.0), 'gallop': (0.0, -4.0, 0.0, 2.0)}
LILT = {'walk': 0.0, 'gallop': 0.35}
LEAD = {'gallop': {'yaw': 1.5, 'roll': 1.0, 'phase': 0.6}}
NECK = ('NeckBase', 'NeckUpper', 'Head')
# the framing, after Daggerfall's riding picture: the eye drawn back along the horse and up (metres), and the neck
# carried higher (degrees at its foot, the head turned back down that much less), so the rider looks along a long neck
# to a head held up before them, its face away, as Daggerfall draws it
EYE_BACK, EYE_UP, NECK_UP, HEAD_DOWN = 0.4, 0.0, 10.0, 5.0
# a turn, to the rider's left ('L', the bake's -X) or right: the neck and head bent into it about the up axis, degrees a
# bone; the head rolled into it; the inside ear turned along it and the outside one laid back
TURNS = ('L', 'R')
TURN = {'NeckBase': 4.0, 'NeckUpper': 5.0, 'Head': 6.0}
TURN_ROLL, TURN_EAR_IN, TURN_EAR_OUT = 3.0, 20.0, 30.0
# the standing fidgets, each frame a share of the full pose: an ear swivelled out and back on its root, laid back a
# little (named by the screen's side: the bake's Ear.L stands on the screen's right)
EAR_SWIVEL, EAR_BACK = 55.0, 12.0
EAR_ON = {'L': 'Ear.R', 'R': 'Ear.L'}
FIDGETS = {'earL': (0.6, 1.0, 0.45), 'earR': (0.6, 1.0, 0.45)}
# the ears on the move, about their own axes: at the walk they swivel by turns, listening; at the gallop they lie back a
# little and bob with the stride. Degrees, the right ear a share of a stride behind the left
EARS_ON_THE_MOVE = {'walk': {'swivel': 14.0, 'back': 0.0, 'bob': 0.0, 'lag': 0.35},
                    'gallop': {'swivel': 5.0, 'back': 12.0, 'bob': 6.0, 'lag': 0.2}}
FOCAL = 300.447   # the first-person forge's eye (specs/RUN-shape.json, CLIMB-shape.json)
# the classic riding picture's top row on the 200-row screen: MRED00I0.CFA is 105 rows, drawn on the screen's foot
CLASSIC_TOP = 200 - 105
EARS = ('Ear.L', 'Ear.R')   # the bake's bones the ears' tips hang on
TEXEL_X = 0.8   # a texel's width on the screen, against its height (riding.js SCALE_FACTOR_X)
# the one canvas the ride and the cart are cut on (rideForge.js `RIDE_CANVAS`), in texels: as wide as either reaches
# in any frame, the cart's blinkers the widest, and from the highest row either reaches to the screen's foot
CANVAS = (152, 111)
# the eyes before and over the head's joint (rig.py `head`), in its own frame: +Y back, +Z up
EYES = (0.0, -0.1, 0.1)
# the light high over the rider's left shoulder, a little behind, as Daggerfall lights its riding picture: the crest and
# the poll catch it, the neck turns into shade on its far side, and the mane's strands glint; a faint ambient round it
LIGHT = {'lamp': [0.0, 0.0, 0.0, 0.0], 'sun': [0.3, 0.3, -1.0, 40.0], 'world': 4.0}
# the hide this near (horse.py `COAT`): matte, with no shine at all, so the ears hold no glossy stripe; smoothly
# sampled, so the coat's painted shading reads as form and not as the picture's texels in blocks; and the ears furred as
# Daggerfall's are (`fur`): flecked (how much, how fine), lighter toward their tips (how much), from a quarter of the
# way up each, where the ear leaves the poll (its skin runs down onto it)
COAT = {'roughness': 0.9, 'specular': 0.0, 'filter': 'Linear', 'fur': (0.8, 200.0, 1.0, 0.25)}
GRADE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'RIDE-grade.json')
PARTS = ('horse', 'mane')   # the grade's parts, a texel's part counted from 1 (0 none)
HARNESS = []   # set by --cart: the horse in the Small Cart's harness, and no coat maps


def eye_at(anim, frame):
    """The rider's eye in the bake's frame (+Y ahead), and the stride's gait and time, for third-person frame `frame`
    of mounted animation `anim` (riding.py `astride`)."""
    pose, gear = riding.astride(anim, frame, 0.0)
    W = pose.world()
    eye = W['head'] @ Vector(EYES)
    stride = gear['horse']
    return Vector((-eye.x, -eye.y, eye.z)), stride.gait, stride.time   # the forge's -Y ahead turned to the bake's +Y


def view_of(eye, down, roll=0.0, yaw=0.0):
    """The bake's frame into the camera's (fpstage.py: +Y forward, +Z up): the eye at the origin, looking `down`
    degrees under the level, the view rolled `roll` degrees about its own forward way and turned `yaw` about its up."""
    return Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Rotation(math.radians(roll), 4, 'Y') @ \
        Matrix.Rotation(math.radians(down), 4, 'X') @ Matrix.Translation(-eye)


def ears_below(eye, gait, time, extra=None, calm=None):
    """Degrees under the level from the eye to the higher ear's tip, the horse at `time` of `gait`."""
    b = horse.bake()
    mesh = next(m for m in b['meshes'] if m['part'] == 'body')
    p = horse.posed(mesh, horse.skins(b, horse.worlds(b, gait, time, extra, calm)))
    joints = np.array(mesh['joints']).reshape(-1, 4)
    weights = np.array(mesh['weights']).reshape(-1, 4)
    names = [bone['name'] for bone in b['bones']]
    on = np.zeros(len(p), dtype=bool)
    for ear in EARS:
        on |= (weights * (joints == names.index(ear))).sum(axis=1) > 0.5
    tip = p[on][p[on][:, 2].argmax()]
    return math.degrees(math.atan2(eye.z - tip[2], tip[1] - eye.y))


def sign_of(side):
    """A turn's way about the up axis: +1 to the rider's left (the bake's -X), -1 to the right."""
    return 1.0 if side == 'L' else -1.0


def turned(side):
    """The neck and head bent into a turn to `side`, the head rolled into it, the inside ear along it."""
    s = sign_of(side)
    out = {bone: [((0.0, 0.0, 1.0), s * deg)] for bone, deg in TURN.items()}
    out['Head'].append(((0.0, 1.0, 0.0), -s * TURN_ROLL))
    inside, outside = EAR_ON[side], EAR_ON['R' if side == 'L' else 'L']
    out[inside] = [('y', s * TURN_EAR_IN)]   # each ear about its own long axis, its root held (horse.py `ear_ramp`)
    out[outside] = [('y', s * TURN_EAR_OUT)]
    return out


def fidget(name, share):
    """A standing fidget's pose at `share` of its full: an ear swivelled out and laid back."""
    side = name[-1]
    out_way = -1.0 if side == 'R' else 1.0   # the opening turned out, toward its own side
    return {EAR_ON[side]: [('y', out_way * share * EAR_SWIVEL), ('x', share * EAR_BACK)]}


def ears_moving(strip, k, n):
    """The ears' turns on frame `k` of `n` of gait `strip`."""
    e = EARS_ON_THE_MOVE.get(strip)
    if not e:
        return None
    out = {}
    for side, at in (('L', 0.0), ('R', e['lag'])):
        beat = 2 * math.pi * (k / n + at)
        out_way = -1.0 if side == 'R' else 1.0
        out[EAR_ON[side]] = [('y', out_way * e['swivel'] * math.sin(beat)),
                             ('x', e['back'] + e['bob'] * math.sin(beat))]
    return out


def carriage():
    """The neck carried up at its foot and the head turned back down at the poll (`NECK_UP`, `HEAD_DOWN`)."""
    if not NECK_UP and not HEAD_DOWN:
        return None
    return {'NeckBase': [((1.0, 0.0, 0.0), NECK_UP)], 'Head': [((1.0, 0.0, 0.0), -HEAD_DOWN)]}


def merged(*extras):
    out = {}
    for e in extras:
        for bone, turns in (e or {}).items():
            out.setdefault(bone, []).extend(turns)
    return out


def shots():
    """Every frame the ride is drawn in, in order: each gait's frames as they are and turned either way, then each
    standing fidget's. A shot is {key, strip, k, turn, gait, time, eye, down, roll, extra, calm}: the rider's eye, the
    look down and the roll of the view, and the horse's gait and time with its bones' turns and calming."""
    out = []
    lift = math.degrees(math.atan((fpstage.CY - CLASSIC_TOP) / FOCAL))
    for strip, (anim, n) in GAITS.items():
        calm = {bone: CALM[strip] for bone in NECK} if strip in CALM else None
        lead = LEAD.get(strip)
        frames = []
        for k in range(n):
            at = (k + LILT.get(strip, 0.0) * math.sin(2 * math.pi * k / n)) * riding.RIDE[anim] / n
            eye, gait, time = eye_at(anim, at)
            eye = eye + Vector((0.0, -EYE_BACK, EYE_UP))
            sway, roll = carriage(), 0.0
            if lead:
                turn = 2 * math.pi * k / n + lead['phase']
                sway = merged(sway, {bone: [((0.0, 0.0, 1.0), lead['yaw'] * share * math.sin(turn))]
                                     for bone, share in (('NeckUpper', 0.4), ('Head', 0.6))})
                roll = lead['roll'] * math.cos(turn)
            frames.append((k, eye, gait, time, merged(sway, ears_moving(strip, k, n)), roll,
                           ears_below(eye, gait, time, sway, calm)))
        mean = sum(f[-1] for f in frames) / n
        for k, eye, gait, time, sway, roll, ears in frames:
            down = mean + STEADY.get(strip, 0.0) * (ears - mean) + lift
            yaw = math.degrees(math.atan(SWAY[strip][k % 4] * TEXEL_X / FOCAL)) if strip in SWAY else 0.0
            base = {'strip': strip, 'k': k, 'gait': gait, 'time': time, 'eye': eye, 'down': down, 'roll': roll,
                    'yaw': yaw, 'calm': calm}
            out.append({**base, 'key': f'{strip}-{k}', 'turn': '', 'extra': sway})
            for side in TURNS:
                out.append({**base, 'key': f'{strip}-{k}_t{side}', 'turn': side, 'extra': merged(sway, turned(side))})
    stand = next(s for s in out if s['key'] == 'stand-0')
    for name, shares in FIDGETS.items():
        for k, share in enumerate(shares):
            out.append({**stand, 'key': f'{name}-{k}', 'strip': name, 'k': k,
                        'extra': merged(stand['extra'], fidget(name, share))})
    return out


def setup(samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fpstage.setup({'focal': FOCAL, 'aspect': 1.0}, samples)
    fpstage.set_lights(LIGHT)
    sc = bpy.context.scene
    sc.render.resolution_x = round(fpstage.W / TEXEL_X)
    sc.render.pixel_aspect_x, sc.render.pixel_aspect_y = TEXEL_X, 1.0


def frames(samples, only=None):
    """Every shot's frame over the whole screen, and each texel's part: {key: ((h, w, 4) uint8, (h, w))}; `only` a few
    keys alone."""
    setup(samples)
    courser = horse.Courser(tack_height=riding.HEIGHT, reins=False, harness=bool(HARNESS),
                            groomed=True, coat=COAT)   # the reins in the hands; the mane groomed on the neck
    tmp = os.path.join(tempfile.mkdtemp(), 'r.png')
    out = {}
    for sh in shots():
        if only and sh['key'] not in only:
            continue
        courser.pose(sh['gait'], sh['time'], 180.0, sh['extra'], sh['calm'])   # back to the bake's frame
        for ob in courser.objects:
            ob.matrix_world = view_of(sh['eye'], sh['down'], sh['roll'], sh['yaw'])
        shot = stage.render_rgba(tmp)
        parts = courser.mane_where(shot, lambda: stage.render_rgba(tmp))
        out[sh['key']] = (shot, parts)
        if not HARNESS:
            TEXELS[sh['key']] = courser.coat_texels(parts == 1, lambda: stage.render_rgba(tmp))
        print(sh['key'], flush=True)
    return out


TEXELS = {}   # a shot's key -> each pixel's coat texel (horse.py `coat_texels`), from the last `frames`


def texel_picture(texels, coat):
    """A frame's coat texels as a picture: red its column, green its row, drawn where the coat is."""
    h, w = coat.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :2] = texels
    out[..., 3] = np.where(coat, 255, 0)
    return out


def fit_grade(shots, ref):
    """The grade: the coat's and the mane's channels in these ungraded frames, against the riding picture's."""
    return horse.fit_grade(list(shots.values()), ref, PARTS)


def graded(shots):
    """The frames in the grade (`GRADE_PATH`), or as rendered where there is none."""
    if not os.path.exists(GRADE_PATH):
        return {key: shot for key, (shot, _) in shots.items()}
    forge.GRADE.clear()
    forge.GRADE.update(json.load(open(GRADE_PATH)))
    return {key: forge.grade_frame(shot, ids, list(PARTS)) for key, (shot, ids) in shots.items()}


def canvas_of(shots):
    """The one canvas (`CANVAS`) on the whole screen's texels, its middle the screen's and its foot the screen's foot:
    (x0, y0, width, height). A horse reaching past it is an error, not a frame cut short."""
    alpha = np.any([f[..., 3] > 0 for f in shots.values()], axis=0)
    rows, cols = np.nonzero(alpha)
    h, w = alpha.shape
    cw, ch = CANVAS
    x0, y0 = w // 2 - cw // 2, h - ch
    if cols.min() < x0 or cols.max() >= x0 + cw or rows.min() < y0:
        raise ValueError(f'the horse reaches past the canvas: columns {cols.min()}..{cols.max()}, '
                         f'from row {rows.min()}')
    return x0, y0, cw, ch


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--preview', default='', help='also write the whole screen of each frame here')
    ap.add_argument('--reference', default='', help="rideReference.mjs's measure: fit the grade again from it")
    ap.add_argument('--cart', action='store_true', help="the cart's picture: the horse in harness, CART_ frames")
    ap.add_argument('--only', default='', help='these shots alone (keys, as gallop-3_tL), for a look')
    args = ap.parse_args()
    if args.cart:
        HARNESS.append(True)
    rendered = frames(args.samples, set(args.only.split(',')) if args.only else None)
    if args.reference and not args.cart:
        with open(GRADE_PATH, 'w') as fh:
            json.dump(fit_grade(rendered, json.load(open(args.reference))), fh, indent=1)
            fh.write('\n')
        print(f'the grade -> {GRADE_PATH}')
    shots_ = graded(rendered)
    x0, y0, cw, ch = canvas_of(shots_)
    os.makedirs(args.out, exist_ok=True)
    prefix = 'CART' if args.cart else 'RIDE'
    for key, f in shots_.items():
        stage.write_png(os.path.join(args.out, f'{prefix}_{key}.png'), f[y0:y0 + ch, x0:x0 + cw])
        if not args.cart:
            coat = rendered[key][1] == 1
            stage.write_png(os.path.join(args.out, f'RIDE_{key}_uv.png'),
                            texel_picture(TEXELS[key], coat)[y0:y0 + ch, x0:x0 + cw])
        if args.preview:
            os.makedirs(args.preview, exist_ok=True)
            stage.write_png(os.path.join(args.preview, f'screen_{key}.png'), f)
    print(f'canvas {cw} x {ch}, from texel {x0}, {y0} of the screen; {len(shots_)} frames')


if __name__ == '__main__':
    main()
