"""The first-person forge's touch: my horse up close as I pet it or feed it by hand, on foot (the classic lanes'
close-up; the Morrowind lane's 3D horse turns in the world, src/systems/horse/touchPose.js).

    python -I tools/sprite-forge/fptouch.py --out public/art/ride [--samples 64] [--only keys]
    python -I tools/sprite-forge/fptouch.py --reach

The horse is the ride's Courser, bridled and saddled, in its idle, its body smoothed (`SMOOTH`) so its facets do not
show this near. Each kind has its own eye at the standing eye's height (player/motor.js EYE_HEIGHT), where my arm
reaches the horse with its elbow off the screen. A pet stands off the right of its neck: it turns its head round to me
and lowers it into my hand, and my palm strokes down its nose (`STROKE`). A feed stands an arm's reach from my palm
held out before its muzzle (`FEED_PALM`), seeing its head from the side: it reaches down until its lower lip rests on
my palm (`FEED_TURN`, `FEED_LOWER`, solved by `--reach` and checked each run), bites, lifts its head and chews.

The shots (`SEQUENCES`): each kind's frames in the order the game plays them, a stroke and a chew each twice. Writes
`TOUCH_<shot>.png` and its coat map `TOUCH_<shot>_uv.png` (fpride.py `texel_picture`) on one canvas (`CANVAS`), graded
as the ride is (specs/RIDE-grade.json). The hand and the food are fpreins.py's `--touch`, placed on each shot's
targets here (`hand_targets`): the palm on the hide where the stroke casts, or under the lips with the food on it."""
import argparse
import functools
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import fpride  # noqa: E402  (bpy, and mathutils with it)
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import fphead  # noqa: E402
import horse  # noqa: E402
import riding  # noqa: E402
import stage  # noqa: E402

EYE_HEIGHT = 1.7
# the pet's eye (the bake's frame: +X the horse's right, +Y ahead, +Z up, the horse standing on the origin) a long
# arm's reach off the right of its neck, and the point it looks at, the head turned round toward it
PET_EYE = (1.25, 0.75, EYE_HEIGHT)
PET_TARGET = (0.25, 1.1, 1.48)
# the feed: my palm held out in front of the muzzle on its right, low (the bake's frame), my eye an arm's reach back
# from it on this bearing (degrees right of the horse's ahead), and the look pitched so the palm stands on this row
# of the screen. At the bite the lower lip rests LIPS_OVER on the palm, the food in the open mouth, solved from
# FEED_START (the turn, then each lowering) to within REACH_GAP metres
FEED_PALM = (0.26, 1.42, 1.25)
FEED_BEARING, FEED_ARM, PALM_ROW = 100.0, 0.75, 160.0
LIPS_OVER, LIP_DEEP = 0.015, 0.025
FEED_START = (25.0, -14.0, -6.0, 0.0)
REACH_GAP = 0.03
# the feed's reach as `--reach` solves it: the turn and each lowering, degrees, checked each run. touchPose.js's 3D
# horse lowers its head for a feed by the same
FEED_TURN = 23.8
FEED_LOWER = {'NeckBase': -5.3, 'NeckUpper': 2.3, 'Head': 0.0}
# the touch's own light, in the camera's space: the sun high over my right shoulder, a little ahead, and the sky round
LIGHT = {'lamp': [0.0, 0.0, 0.0, 0.0], 'sun': [-0.35, 0.45, -1.0, 40.0], 'world': 5.0}
# the head's turn toward the eye, shared down the neck, at most MOST degrees (touchPose.js TOUCH_TURN)
MOST = 55.0
SHARE = {'NeckBase': 0.3, 'NeckUpper': 0.35, 'Head': 0.35}
# a pet: the head lowered into the hand (degrees, down negative), the ears a little forward, soft
PET_LOWER = {'NeckBase': -8.0, 'Head': -6.0}
PET_EARS = -5.0
# a feed: the ears pricked forward, the jaw open for the bite and its chewing between two openings (degrees: the
# close-up's jaw moves whole, fphead.py, so a degree parts the lips about 9 mm at the front)
FEED_EARS = -15.0
BITE, CHEW = 13.0, (0.3, 3.2)
BITES = ('feed-4', 'feed-5')   # the shots that open the jaw wide for the bite, not a chew
GAPE = (1.0, 0.3)   # the lips' share of the jaw's opening (fphead.py `gape`): the bite's, and a chew's or a pet's
# a pet: the mouth working, licking and chewing as a calm horse does, open between these
PET_MOUTH = (0.0, 1.8)
# each shot's upper lids (0 open, 1 shut; fphead.py LID_OPEN where none is given): soft while the hand strokes, a
# blink as it goes, and a blink as a feed's head lifts away; its nostrils sniffing the hand or the food as it comes;
# and its upper lip reaching for the food or the hand
LIDS = {'pet-4': 0.4, 'pet-5': 0.5, 'pet-6': 0.55, 'pet-7': 0.5, 'pet-8': 0.45, 'pet-9': 0.4, 'pet-10': 0.95,
        'feed-9': 0.3, 'feed-10': 0.3, 'feed-12': 0.95}
SNIFFS = {'pet-2': 0.6, 'pet-3': 0.4, 'feed-1': 0.6, 'feed-2': 1.0, 'feed-3': 0.7}   # the nostrils flared, sniffing
LIPS = {'pet-5': 0.4, 'pet-6': 0.6, 'pet-7': 0.3, 'feed-2': 0.5, 'feed-3': 1.0, 'feed-4': 0.8, 'feed-5': 0.3,
        'feed-9': 0.3, 'feed-11': 0.2}
SMOOTH = 2   # the body's subdivision levels
# each kind's shots: (key, the turn's ease, a nod, the jaw's opening, where the hand is). A pet's hand is a point of
# its stroke (0 under the eye, 1 down at the nostrils; under 0 rising to it; None: off the screen); a feed's is the
# palm's rise to the lips (1 under them; -1 or less off the screen) and whether the food is still on it
PET_SHOTS = (
    ('pet-0', 0.2, 0.0, 0.0, None), ('pet-1', 0.5, 0.0, 0.0, -0.4), ('pet-2', 0.8, 0.0, 0.0, -0.15),
    ('pet-3', 1.0, -1.0, 0.0, 0.0), ('pet-4', 1.0, -2.0, 0.3, 0.2), ('pet-5', 1.0, -2.5, 0.8, 0.4),
    ('pet-6', 1.0, -2.0, 1.0, 0.6), ('pet-7', 1.0, -1.0, 0.4, 0.8), ('pet-8', 1.0, 0.0, 0.0, 0.5),
    ('pet-9', 1.0, 0.5, 0.6, 0.25), ('pet-10', 0.8, 0.0, 0.0, -0.2), ('pet-11', 0.45, 0.0, 0.0, None),
)
FEED_SHOTS = (
    ('feed-0', 0.2, 0.0, 0.0, (-1.0, True)), ('feed-1', 0.45, 0.0, 0.0, (0.5, True)),
    ('feed-2', 0.75, 0.0, 0.0, (0.9, True)), ('feed-3', 0.95, 0.0, 0.0, (1.0, True)),
    ('feed-4', 1.0, 0.0, 0.5, (1.0, True)), ('feed-5', 1.0, 0.0, 1.0, (1.0, True)),
    ('feed-6', 0.9, 2.0, 0.6, (0.8, False)), ('feed-7', 0.8, 3.0, 0.1, (0.2, False)),
    ('feed-8', 0.8, 3.0, 0.7, (-1.0, False)), ('feed-9', 0.8, 3.0, 1.0, (-1.0, False)),
    ('feed-10', 0.8, 3.0, 0.4, (-1.0, False)), ('feed-11', 0.8, 3.0, 0.1, (-1.0, False)),
    ('feed-12', 0.55, 2.0, 0.2, (-1.0, False)), ('feed-13', 0.25, 0.0, 0.0, (-1.0, False)),
)
# the order the game plays them: a pet strokes down the nose and back twice; a feed chews twice, my hand gone
SEQUENCES = {
    'pet': ('pet-0', 'pet-1', 'pet-2', 'pet-3', 'pet-4', 'pet-5', 'pet-6', 'pet-7', 'pet-8', 'pet-9', 'pet-4',
            'pet-5', 'pet-6', 'pet-7', 'pet-8', 'pet-9', 'pet-10', 'pet-11'),
    'feed': ('feed-0', 'feed-1', 'feed-2', 'feed-3', 'feed-4', 'feed-5', 'feed-6', 'feed-7', 'feed-8', 'feed-9',
             'feed-10', 'feed-11', 'feed-8', 'feed-9', 'feed-10', 'feed-11', 'feed-12', 'feed-13'),
}
# the stroke on the pet's screen (texels of the 400-texel screen): down the nose from the noseband to over the
# nostrils, where my arm reaches with its elbow off the screen and my fingers stay under the eye. The palm is laid
# PALM_GAP off the hide there (over the bridle's straps), fingers up the face
PALM_GAP = 0.012
STROKE = ((268.0, 128.0), (292.0, 170.0))
# a hand short of its place (a rise under 1) is this many metres lower (each kind's) and drawn back toward me for each
# unit: a pet's rises from the screen's foot to the stroke, a feed's from just under it to the palm's place
DROP, DRAW_BACK = {'pet': 0.22, 'feed': 0.12}, 0.08
# every frame on one canvas, in texels: the screen whole (rideForge.js TOUCH_CANVAS)
CANVAS = (400, 200)
IDLE_TIME = 0.0   # the idle's moment every shot stands in


def turns(turn, lower, ease, nod=0.0, ears=0.0, jaw=0.0, jaw_open=(0.0, 0.0)):
    """The bones' turns (horse.py `worlds`' `extra`): the head turned `turn` degrees to the horse's right, where I
    stand, shared down the neck, lowered by `lower` and nodded `nod`, all at `ease`; the ears `ears` forward; the jaw
    open `jaw` of the way between `jaw_open`'s two."""
    out, head = {}, 0.0
    for bone, share in SHARE.items():
        z = -turn * share * ease
        head += z
        down = lower.get(bone, 0.0) * ease + (nod if bone == 'Head' else 0.0)
        out[bone] = [((1.0, 0.0, 0.0), down), ((0.0, 0.0, 1.0), z)]
    across = (math.cos(math.radians(head)), math.sin(math.radians(head)), 0.0)   # the head's side, turned with it
    out['Ear.L'] = out['Ear.R'] = [(across, ears * ease)]
    if jaw:
        out['Jaw'] = [(across, -(jaw_open[0] + (jaw_open[1] - jaw_open[0]) * jaw) * ease)]
    return out


def look(eye, target):
    """The bake's frame into the camera's (fpstage.py: +Y forward, +Z up): the eye turned to the target, then tilted."""
    eye, target = Vector(eye), Vector(target)
    d = target - eye
    yaw = math.degrees(math.atan2(d.x, d.y))
    down = math.degrees(math.atan2(-d.z, math.hypot(d.x, d.y)))
    return Matrix.Rotation(math.radians(down), 4, 'X') @ Matrix.Rotation(math.radians(yaw), 4, 'Z') @ \
        Matrix.Translation(-eye)


def _body():
    """The bake with the close-up's mouth (fphead.py), and its body."""
    fphead.install()
    b = horse.bake()
    return b, next(m for m in b['meshes'] if m['part'] == 'body')


def _lips():
    """The body's points of the lower lip: the jaw's at the front of the muzzle, its lowest LIP_DEEP; and the head's."""
    b, mesh = _body()
    names = [x['name'] for x in b['bones']]
    joints = np.array(mesh['joints']).reshape(-1, 4)
    weights = np.array(mesh['weights']).reshape(-1, 4)
    share = lambda bone: (weights * (joints == names.index(bone))).sum(1)   # noqa: E731
    head = (share('Head') + share('Jaw')) > 0.5
    rest = horse.posed(mesh, horse.skins(b, horse.worlds(b, 'idle', IDLE_TIME, None, None)))
    front = (share('Jaw') > 0.5) & (rest[:, 1] > rest[head][:, 1].max() - 0.06)
    return np.nonzero(front & (rest[:, 2] < rest[front][:, 2].min() + LIP_DEEP))[0], head


def posed_body(extra):
    b, mesh = _body()
    return horse.posed(mesh, horse.skins(b, horse.worlds(b, 'idle', IDLE_TIME, extra, None)))


def feed_eye():
    """The feed's eye: an arm's reach (FEED_ARM, level) back from the palm on FEED_BEARING, at the standing eye."""
    a = math.radians(FEED_BEARING)
    return (FEED_PALM[0] + FEED_ARM * math.sin(a), FEED_PALM[1] + FEED_ARM * math.cos(a), EYE_HEIGHT)


def screen_row(view, p):
    """The row of the screen a point of the bake's frame stands on, through `view` (fpstage.py `project`)."""
    q = view @ Vector((*p, 1.0))
    return 100.0 - fpride.FOCAL * q.z / max(q.y, 1e-6)


def feed_extra(jaw=0.0, jaw_open=(0.0, 0.0)):
    """The feed's reach (FEED_TURN, FEED_LOWER) fully eased in, the jaw as given."""
    return turns(FEED_TURN, FEED_LOWER, 1.0, jaw=jaw, jaw_open=jaw_open)


def reach_gap():
    """How far (metres) the lower lip, the mouth open for the bite, stops from LIPS_OVER over the palm."""
    lips, _ = _lips()
    want = np.array(FEED_PALM) + np.array([0.0, 0.0, LIPS_OVER])
    return float(np.linalg.norm(posed_body(feed_extra(1.0, (CHEW[0], BITE)))[lips].mean(axis=0) - want))


def solve_reach():
    """`--reach`: the turn and lowerings (FEED_TURN, FEED_LOWER) that bring the lower lip, the mouth open for the bite,
    LIPS_OVER over the palm, solved on the bake from FEED_START: (turn, lowering, gap)."""
    from scipy.optimize import minimize
    lips, _ = _lips()
    want = np.array(FEED_PALM) + np.array([0.0, 0.0, LIPS_OVER])

    def miss(v):
        lower = {'NeckBase': v[1], 'NeckUpper': v[2], 'Head': v[3]}
        d = posed_body(turns(v[0], lower, 1.0, jaw=1.0, jaw_open=(CHEW[0], BITE)))[lips].mean(axis=0) - want
        return d @ d + 1e-5 * float(np.square(np.asarray(v) - FEED_START).sum())
    v = minimize(miss, FEED_START, method='Nelder-Mead', options={'xatol': 0.05, 'fatol': 1e-8, 'maxiter': 1500}).x
    lower = {'NeckBase': v[1], 'NeckUpper': v[2], 'Head': v[3]}
    lip = posed_body(turns(v[0], lower, 1.0, jaw=1.0, jaw_open=(CHEW[0], BITE)))[lips].mean(axis=0)
    return v[0], lower, float(np.linalg.norm(lip - want))


def feed_view():
    """The feed's look: from `feed_eye` along the line from the palm up to the poll (the reach's), at the point that
    puts the palm on PALM_ROW, so the palm and the face share the screen. Fails if the lips miss the palm."""
    gap = reach_gap()
    if gap > REACH_GAP:
        raise ValueError(f'the lips stop {gap:.3f} m short of the palm: solve FEED_TURN and FEED_LOWER (--reach)')
    _, head = _lips()
    hd = posed_body(feed_extra())[head]
    palm, poll = np.array(FEED_PALM), hd[hd[:, 2].argmax()]
    lo, hi = 0.0, 1.0   # the share of the way up: more puts the palm lower on the screen
    for _ in range(40):
        mid = (lo + hi) / 2
        if screen_row(look(feed_eye(), palm + (poll - palm) * mid), FEED_PALM) < PALM_ROW:
            lo = mid
        else:
            hi = mid
    return look(feed_eye(), palm + (poll - palm) * lo)


def camera_body(extra, view):
    """The body posed by `extra`, in the camera's space through `view`, and its triangles."""
    _, mesh = _body()
    P = posed_body(extra)
    V = np.array(view)
    return P @ V[:3, :3].T + V[:3, 3], np.array(mesh['indices']).reshape(-1, 3)


def cast(P, tris, way):
    """A ray from the eye along `way` onto the mesh: (the nearest point hit, the face's normal toward the eye), or
    None."""
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    e1, e2 = b - a, c - a
    h = np.cross(way, e2)
    det = (e1 * h).sum(1)
    ok = np.abs(det) > 1e-12
    f = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = -a
    u = f * (s * h).sum(1)
    q = np.cross(s, e1)
    v = f * (q @ way)
    t = f * (e2 * q).sum(1)
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6)
    if not hit.any():
        return None
    i = np.nonzero(hit)[0][t[hit].argmin()]
    n = np.cross(e1[i], e2[i])
    n /= np.linalg.norm(n)
    return way * t[i], (-n if n @ way > 0 else n)


def ray(u, v):
    """The way from the eye through a point of the 400-texel screen, in the camera's space."""
    d = np.array([(u - CANVAS[0] / 2) * fpride.TEXEL_X / fpride.FOCAL, 1.0, -(v - CANVAS[1] / 2) / fpride.FOCAL])
    return d / np.linalg.norm(d)


def _flat(way, normal):
    """`way` laid flat on the plane square to `normal`, of unit length."""
    w = way - normal * (way @ normal)
    return w / np.linalg.norm(w)


def hand_targets(shot):
    """Where the hand goes in a shot, in the camera's space: {'at': the palm's middle, 'normal': the way out of the
    palm, 'fingers': their way}, or None (off the screen). A pet lays the palm on the hide where its stroke's point
    casts, the fingers up the face; a feed holds it flat under the lips, the fingers toward the horse. A hand short of
    its place is lowered DROP and drawn back DRAW_BACK for each unit."""
    V = np.array(shot['view'])
    up = V[:3, :3] @ np.array([0.0, 0.0, 1.0])
    if shot['kind'] == 'pet':
        if shot['hand'] is None:
            return None
        rise = min(shot['hand'], 0.0) + 1.0
        ref = shot if shot['hand'] >= 0.0 else next(sh for sh in shots() if sh['kind'] == 'pet' and
                                                     sh['hand'] is not None and sh['hand'] >= 0.0)
        P, tris = camera_body(ref['extra'], ref['view'])
        top, bottom = (cast(P, tris, ray(*p)) for p in STROKE)
        s = max(ref['hand'], 0.0)
        hit = cast(P, tris, ray(*(np.array(STROKE[0]) + (np.array(STROKE[1]) - np.array(STROKE[0])) * s)))
        if hit is None or top is None or bottom is None:
            raise ValueError(f'{shot["key"]}: the stroke misses the hide')
        at, normal, fingers = hit[0] + hit[1] * PALM_GAP, -hit[1], _flat(top[0] - bottom[0], hit[1])
    else:
        rise, food, palm = shot['hand']
        if rise <= -1.0:
            return None
        at = (V @ np.array([*palm, 1.0]))[:3]
        normal = up
        fingers = _flat(at, up)
    back = -_flat(at, up)
    at = at - up * DROP[shot['kind']] * (1.0 - rise) + back * DRAW_BACK * (1.0 - rise)
    return {'at': at, 'normal': normal / np.linalg.norm(normal), 'fingers': fingers}


@functools.lru_cache(maxsize=1)
def shots():
    """Every shot: {key, kind, extra, view (bake -> camera), hand, lid, lip}: a pet's hand its stroke's point and
    rise (or None); a feed's its rise to the lips, whether the food is on it and the palm's point (the bake's frame);
    its upper lids and its upper lip (fphead.py `Head.pose`)."""
    out = []
    pet_view = look(PET_EYE, PET_TARGET)
    pet_turn = min(MOST, math.degrees(math.atan2(PET_EYE[0], PET_EYE[1])))
    for key, ease, nod, jaw, hand in PET_SHOTS:
        out.append({'key': key, 'kind': 'pet', 'view': pet_view, 'hand': hand, 'lid': LIDS.get(key, fphead.LID_OPEN),
                    'lip': LIPS.get(key, 0.0), 'sniff': SNIFFS.get(key, 0.0), 'gape': jaw * GAPE[1],
                    'extra': turns(pet_turn, PET_LOWER, ease, nod, PET_EARS, jaw, PET_MOUTH)})
    view = feed_view()
    for key, ease, nod, jaw, (rise, food) in FEED_SHOTS:
        opens = (CHEW[0], BITE) if key in BITES else CHEW
        out.append({'key': key, 'kind': 'feed', 'view': view, 'hand': (rise, food, FEED_PALM),
                    'lid': LIDS.get(key, fphead.LID_OPEN), 'lip': LIPS.get(key, 0.0), 'sniff': SNIFFS.get(key, 0.0),
                    'gape': jaw * (GAPE[0] if key in BITES else GAPE[1]),
                    'extra': turns(FEED_TURN, FEED_LOWER, ease, nod, FEED_EARS, jaw, opens)})
    return tuple(out)


def smoothed(courser):
    """The body subdivided as it renders, so its facets do not show up close."""
    ob = courser.parts['body'][0]
    sub = ob.modifiers.new('touch_smooth', 'SUBSURF')
    sub.levels = sub.render_levels = SMOOTH
    return courser


def frames(samples, only=None):
    """Every shot over the whole screen, its parts and its coat texels: {key: (rgba, parts, texels)}."""
    fpride.setup(samples)
    fphead.true_texels()
    fpride.fpstage.set_lights(LIGHT)
    fphead.install()
    courser = smoothed(horse.Courser(tack_height=riding.HEIGHT, reins=False, groomed=True, coat=fpride.COAT))
    head = fphead.Head(courser)
    tmp = os.path.join(tempfile.mkdtemp(), 'r.png')
    render = lambda: stage.render_rgba(tmp)   # noqa: E731
    out = {}
    for sh in shots():
        if only and sh['key'] not in only:
            continue
        head.pose(sh, sh['extra'])   # back to the bake's frame, its eyes and its mouth as the shot holds them
        for ob in courser.objects:
            ob.matrix_world = sh['view']
        shot = render()
        parts = courser.mane_where(shot, render)
        out[sh['key']] = (shot, parts, courser.coat_texels(parts == 1, render))
        print(sh['key'], flush=True)
    return out


def warm_greys(frame, ids):
    """The coat's greys warmed: the sky's blue lies on the muzzle's grey skin up close, and the grade turns it lilac,
    so a coat texel bluer than it is green takes its green for its blue and keeps its red at least as high."""
    out = frame.copy()
    coat = (ids == 1) & (out[..., 3] > 0)
    rgb = out[..., :3].astype(np.int16)
    blue = coat & (rgb[..., 2] > rgb[..., 1])
    rgb[..., 2] = np.where(blue, rgb[..., 1], rgb[..., 2])
    rgb[..., 0] = np.where(blue, np.maximum(rgb[..., 0], rgb[..., 1]), rgb[..., 0])
    out[..., :3] = rgb.astype(np.uint8)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out')
    ap.add_argument('--samples', type=int, default=64)
    ap.add_argument('--only', default='', help='these shots alone, comma-separated')
    ap.add_argument('--reach', action='store_true', help="solve the feed's reach (FEED_TURN, FEED_LOWER) and stop")
    args = ap.parse_args()
    if args.reach:
        turn, lower, gap = solve_reach()
        print(f'FEED_TURN = {turn:.1f}\nFEED_LOWER = {{{", ".join(f"{k!r}: {v:.1f}" for k, v in lower.items())}}}'
              f'\n# the lips {gap:.3f} m from the palm', flush=True)
        return
    if not args.out:
        ap.error('--out is needed')
    rendered = frames(args.samples, set(args.only.split(',')) if args.only else None)
    graded = fpride.graded({k: (f, ids) for k, (f, ids, _) in rendered.items()})
    os.makedirs(args.out, exist_ok=True)
    for key, f in graded.items():
        _, ids, texels = rendered[key]
        if f.shape[:2] != (CANVAS[1], CANVAS[0]):
            raise ValueError(f'{key}: not the canvas ({f.shape[1]} x {f.shape[0]})')
        stage.write_png(os.path.join(args.out, f'TOUCH_{key}.png'), warm_greys(f, ids))
        stage.write_png(os.path.join(args.out, f'TOUCH_{key}_uv.png'), fpride.texel_picture(texels, ids == 1))
    print(f'{len(graded)} frames on the screen whole ({CANVAS[0]} x {CANVAS[1]})', flush=True)


if __name__ == '__main__':
    main()
