"""The bow's keys (specs/WEAPON09-keys.json) from Daggerfall's landmarks: each frame's pose placed so the grip's middle,
the wrap's upper collar, the arrow's point and its nock and the braced string stand where Daggerfall's do on the
screen, and the drawing hand (the nock pinched between its thumb and index) turned about the arrow so its knuckles
stand where Daggerfall's are; the bow arm's elbow below the screen and the drawing forearm leaving past its right
edge, as Daggerfall's leave the frame. The outline cannot place a bow's arms (the fitter crossed them over the stave)
nor tell the back of a hand from its palm, but these few points can; fpbowfit.py refines the bow after, its turn and
the drawing hand held.

    python -I tools/sprite-forge/fpbowkeys.py [--frames 1,2,3]

The landmarks are screen points read off WEAPON09.CIF's frames, numbers only. Each key holds the bow's turn, the arrow,
the drawing hand and the draw (the frame's stage of the shot); the refine is free in the rest."""
import itertools
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fpbow  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402

SPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'WEAPON09.json')
# each frame: the grip's middle, the upper collar, the arrow's point and its nock (where the string crosses the arrow's
# line) on the 320x200 screen (None where not seen), points on the braced string (a drawn one's is the nock's: past
# it Daggerfall's string does not run as a drawn one would), and its stage: the arrow nocked, the drawing hand there,
# how far the string is drawn; where the hand is, its index's middle joint and knuckle and the curled middle finger's;
# once loosed, the flying arrow's point and tail; where the nock lies below the screen, a point the shaft passes
LANDMARKS = {
    0: dict(grip=(209, 195), collar=(254, 173), head=(191, 156), nock=None, shaft=(200, 199),
            string=((320, 188), (296, 199)), arrow=1, hand=0, draw=0.0),
    1: dict(grip=(192, 160), collar=(242, 126), head=(181, 136), nock=(229, 175), string=(), arrow=1, hand=1,
            draw=0.05, pip=(213, 169), mcp=(254, 162), curl=(236, 196)),
    2: dict(grip=(194, 138), collar=(237, 101), head=(192, 119), nock=(248, 141), string=(), arrow=1, hand=1,
            draw=0.5, pip=(231, 135), mcp=(266, 134), curl=(256, 179)),
    3: dict(grip=(193, 136), collar=(236, 99), head=(191, 117), nock=(289, 152), string=(), arrow=1, hand=1,
            draw=1.0, pip=(269, 141), mcp=None, curl=(292, 183)),
    4: dict(grip=(191, 135), collar=(234, 99), head=(186, 114), tail=(197, 121), nock=None,
            string=((320, 77), (243, 141)), arrow=1, hand=0, draw=0.0, loose=True),
    5: dict(grip=(191, 144), collar=(233, 107), head=(180, 110), tail=(181, 111), nock=None,
            string=((320, 98), (252, 156)), arrow=1, hand=0, draw=0.0, loose=True),
    6: dict(grip=(205, 186), collar=(251, 166), head=None, nock=None, string=((320, 177), (276, 197)), arrow=0,
            hand=0, draw=0.0),
}
FREE = ['bu', 'bv', 'depth', 'tu', 'tv', 'roll', 'draw', 'r_roll', 'r_hook', 'r_curl', 'loose', 'fly_yaw', 'fly_pitch']
# the bow fist's turn about the stave and its forearm's lean: one grip the whole shot, the hand fast on the bow
GRIP = {'l_turn': 23.0, 'l_lean': -10.0}
DEPTH = 0.6   # metres from the eye to the grip: the archer holds the bow at arm's length the whole shot
HAND_WEIGHT = 0.5   # the hand's points read less surely than the bow's own
HAND = ('pip', 'mcp', 'curl')
ARROW = ('head', 'nock', 'tail')


def marks(S):
    """The drawing hand's landmarks as vertices of its arm: the backs of the index's knuckle and of its middle joint
    (the end of the bone along the arrow), and of the middle finger's middle joint, a curled finger's knuckle."""
    import fparm
    v = fpbow._rest_arm(S, 'R')[0] * fparm.MIRROR   # the rig is the left arm's
    k = fpbow.hand_k(S, 'R')
    R = fparm._RIGS[(k, S.get('cuff') or k, len(v))]
    index, middle = R['f0'], R['f1']
    near = lambda at, among: among[np.linalg.norm(v[among] - at, axis=1) < 0.012 * k]   # noqa: E731
    mcp = near(index['mcp'], np.nonzero(index['on'] | (R['piece'] == 0))[0])
    pip = near(index['pip'], np.nonzero(index['on'])[0])
    curl = near(middle['pip'], np.nonzero(middle['on'])[0])
    return {'pip': pip[np.argmax(v[pip, 1])], 'mcp': mcp[np.argmax(v[mcp, 1])], 'curl': curl[np.argmax(v[curl, 1])]}


def _points(S, p, elbows, hand):
    """The landmarks' points in the bow's space at pose `p`, each arm's elbow and the drawing hand's marks."""
    lv = fpbow.bow_arm(S, p)[0]
    rest = fpbow.rest_point(S, p['draw'], lv)
    nock = fpbow.nock_point(S, p['draw'], rest)
    d = rest - nock
    top = fpbow.bow_curve(S, p['draw'])[0][-1]
    way = d / np.linalg.norm(d)
    out = {'grip': np.zeros(3), 'collar': np.array([0.0, 0.0, 0.45 * S['grip_len']]), 'nock': nock,
           'head': nock + way * S['arrow_len'], 'top': np.array([0.0, top[0], top[1]])}
    if p['loose'] > 0:   # the loosed arrow, as `fpbow.scene` flies it
        turn = fpbow._rot([0, 0, 1], p['fly_yaw']) @ fpbow._rot([1, 0, 0], p['fly_pitch'])
        fly = turn @ way
        tail = turn @ (nock - rest) + rest + fly * p['loose']
        out['tail'], out['head'] = tail, tail + fly * S['arrow_len']
    else:
        out['tail'] = nock
    out['elbow_L'] = lv[elbows['L']].mean(0)
    out['back_L'] = fpbow.bow_back(S, p)   # the way the back of the bow fist faces
    rv = fpbow.drawing_arm(S, p, nock, rest)[0]
    out['elbow_R'] = rv[elbows['R']].mean(0)
    out['wrist_R'] = rv[elbows['W']].mean(0)
    out.update({k: rv[i] for k, i in hand.items()})
    return out


def arm_ends(S):
    """Each arm's elbow ('L', 'R') and the drawing arm's wrist end of its forearm ('W'), as vertices of the arms."""
    z = {side: fpbow._rest_arm(S, side)[0][:, 2] for side in ('L', 'R')}
    out = {side: np.nonzero(z[side] < 0.012)[0] for side in ('L', 'R')}
    out['W'] = np.nonzero(np.abs(z['R'] - fpbow.FOREARM_TO) < 0.01)[0]
    return out


def _leaves(wrist, elbow, S, near=0.05):
    """Where the forearm from `wrist` to `elbow` (camera points) leaves the view, on the screen: its elbow's place,
    or where it passes the eye's plane on its way to an elbow beside the head, at full draw."""
    if elbow[1] < near:
        elbow = wrist + (elbow - wrist) * (wrist[1] - near) / (wrist[1] - elbow[1])
    u, v, _ = fpstage.project(elbow[None], S)
    return float(u[0]), float(v[0])


def stray(S, t, p, ends, hand, arrow=1.0):
    """How far frame `t`'s landmarks stray at pose `p`, a mean of squared pixels: the grip, the collar, the arrow's
    point, nock and tail (each weighing `arrow` times the rest), the string's points off its line and the shaft's."""
    p = {**fpbow.REST, **p}
    M, _ = fpstage.pose_matrix(p, S, fpbow.AXIS)
    pts = _points(S, p, ends, hand)
    pts.pop('back_L')
    u, w, _ = fpstage.project(np.array([M[:3, :3] @ v + M[:3, 3] for v in pts.values()]), S)
    at = {k: np.array([u[i], w[i]]) for i, k in enumerate(pts)}
    miss = [float(((at[k] - t[k]) ** 2).sum()) * (arrow if k in ARROW else 1.0)
            for k in ('grip', 'collar') + ARROW if t.get(k) is not None]
    miss += [_off_line(q, at['nock'], at['top']) ** 2 for q in t['string']]
    if t.get('shaft') is not None:
        miss += [_off_line(t['shaft'], at['nock'], at['head']) ** 2 * arrow]
    return float(np.mean(miss))


def _off_line(q, a, b):
    """How far screen point `q` lies off the line through the projected points `a` and `b`, in pixels."""
    a, b = np.array(a[:2]), np.array(b[:2])
    n = np.array([b[1] - a[1], a[0] - b[0]]) / max(np.linalg.norm(b - a), 1e-9)
    return float((np.array(q) - a) @ n)


def eye_of(way, at):
    """How squarely a surface facing `way` at camera point `at` faces the eye: 1 straight at it, 0 edge on."""
    return -float(way @ (at / max(np.linalg.norm(at), 1e-9)))


def _pose(x, t):
    """The pose at free values `x` for frame `t`: a nocked arrow is not loosed at all, since a loose however small
    would turn it by the flight's angles."""
    p = dict(zip(FREE, x))
    if not t.get('loose'):
        p.update(loose=0.0, fly_yaw=0.0, fly_pitch=0.0)
    return {'base': [p['bu'], p['bv']], 'depth': p['depth'], 'tip': [p['tu'], p['tv']], **{k: p[k] for k in FREE[5:]},
            **GRIP}


def _residuals(x, S, t, elbows, hand):
    p = _pose(x, t)
    M, short = fpstage.pose_matrix(p, S, fpbow.AXIS)
    pts = _points(S, p, elbows, hand)
    back = M[:3, :3] @ pts.pop('back_L')
    P = np.array([M[:3, :3] @ v + M[:3, 3] for v in pts.values()])
    u, w, d = fpstage.project(P, S)
    at = {k: (u[i], w[i], d[i]) for i, k in enumerate(pts)}
    r = []
    for k in ('grip', 'collar', 'head', 'nock', 'tail') + (HAND if t['hand'] else ()):
        if t.get(k) is not None:
            w = HAND_WEIGHT if k in HAND else 1.0
            r += [(at[k][0] - t[k][0]) * w, (at[k][1] - t[k][1]) * w]
    r += [_off_line(q, at['nock'], at['top']) for q in t['string']]   # the string from the nock to the upper tip
    if t.get('shaft') is not None:
        r += [_off_line(t['shaft'], at['nock'], at['head'])]
    # the bow arm's elbow under the screen in the fist's own column and toward the eye: the forearm foreshortened
    # behind the fist, as Daggerfall's is, never laid along the stave
    u, v, d = at['elbow_L']
    girth = S['focal'] * 0.06 * S['arm_r'] / max(d, 0.05)   # the sleeve's open end, as big as it draws
    r += [max(0.0, 215 + girth - v) * 0.5, max(0.0, abs(u - t['grip'][0]) - 25) * 0.8, max(0.0, 0.18 - d) * 200,
          max(0.0, d - 0.75 * at['grip'][2]) * 150]
    # the bow fist's back toward the eye, as Daggerfall paints it: the outline alone cannot tell a back from a palm
    r += [max(0.0, 0.5 - eye_of(back, P[list(pts).index('grip')])) * 60]
    if t['hand']:   # the drawing forearm leaves the view past the right edge, level with the hand or below it
        u, v = _leaves(P[list(pts).index('wrist_R')], P[list(pts).index('elbow_R')], S)
        r += [max(0.0, 340 - u) * 0.5, max(0.0, 130 - v) * 0.5, max(0.0, 0.25 - at['nock'][2]) * 300]
        if t.get('mcp') is None:   # its knuckle past the right edge
            r += [max(0.0, 322 - at['mcp'][0])]
    r += [(p[k] - fpbow.REST[k]) / 30.0 for k in ('r_hook', 'r_curl')]   # the fingers hooked as at rest unless shown
    r += [(p['depth'] - DEPTH) * 150] + [p[k] / 10.0 for k in ('fly_yaw', 'fly_pitch')]
    return np.array(r + [short * 300, (p['draw'] - t['draw']) * (20 if t['hand'] else 50)], float)


def solve(S, f, t):
    from scipy.optimize import least_squares
    elbows = arm_ends(S)
    hand = marks(S)
    g, c = np.array(t['grip'], float), np.array(t['collar'], float)
    axis = (c - g) / np.linalg.norm(c - g)
    lo = [g[0] - 60, g[1] - 60, 0.2, -2000, -2000, -400, 0.0, -400, 0.0, 0.0, 0.0, -60, -60]
    hi = [g[0] + 60, g[1] + 60, 1.2, 2000, 2000, 400, 1.0, 400, 100.0, 115.0, 40.0, 60, 60]
    if t.get('loose'):   # off the bow by a millimetre at least, as the key keeps it: none at all is still nocked
        lo[10] = 0.001
    best = None
    # the archer's side of the bow toward the eye; the drawing hand turned every way about the arrow it holds
    hands = (-120.0, -40.0, 40.0, 120.0) if t['hand'] else (0.0,)
    # a loosed arrow from just off the bow and from far down its flight: a near one long on the screen, a far one small
    flights = (0.05, 3.0) if t.get('loose') else (0.0,)
    for roll, rr, flown in itertools.product((-170.0, -140.0, 170.0, 150.0), hands, flights):
        x0 = [g[0], g[1], DEPTH, g[0] + axis[0] * 500, g[1] + axis[1] * 500, roll, t['draw'], rr,
              fpbow.REST['r_hook'], fpbow.REST['r_curl'], flown, 0.0, 0.0]
        sol = least_squares(_residuals, x0, args=(S, t, elbows, hand), bounds=(lo, hi), diff_step=1e-3, max_nfev=400)
        if best is None or sol.cost < best.cost:
            best = sol
    p = _pose(best.x, t)
    for k in ('roll', 'r_roll'):
        p[k] = (p[k] + 180.0) % 360.0 - 180.0
    return p, float(best.cost)


def _key(item):
    import fpforge
    f, t = item
    fpforge.load(SPEC)
    p, cost = solve(dict(fpmodel.SHAPE), f, t)
    return f, p, cost


def _num(v):
    return [round(float(a), 3) for a in v] if isinstance(v, list) else round(float(v), 3)


def _rows(table, drop):
    """A pose table a frame a line, without the fields in `drop`."""
    return ',\n'.join(f'  "{k}": ' + json.dumps({a: b for a, b in v.items() if a not in drop})
                      for k, v in table.items())


def main():
    import argparse
    from multiprocessing import Pool
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', help='solve only these frames (e.g. 1,2,3), keeping the others\' keys')
    args = ap.parse_args()
    base = SPEC[:-len('.json')]
    todo = {int(f): LANDMARKS[int(f)] for f in args.frames.split(',')} if args.frames else LANDMARKS
    order = ['base', 'depth', 'tip', 'roll', 'draw', 'arrow', 'loose', 'fly_yaw', 'fly_pitch', 'hand_r', 'r_roll',
             'r_hook', 'r_curl', 'l_turn', 'l_lean']
    keys = json.load(open(base + '-keys.json')) if args.frames else {}
    fit = json.load(open(base + '-fit.json')) if args.frames else {}   # the other frames keep their fitted poses
    with Pool(len(todo)) as pool:   # a frame a process
        solved = pool.map(_key, todo.items())
    for f, p, cost in solved:
        t = LANDMARKS[f]
        p.update(arrow=float(t['arrow']), hand_r=float(t['hand']), draw=t['draw'])
        hold = ['roll', 'arrow', 'loose', 'fly_yaw', 'fly_pitch', 'draw', 'hand_r', 'r_roll', 'r_hook', 'r_curl',
                'l_turn', 'l_lean']
        keys[f'0:{f}'] = {**{k: _num(p[k]) for k in order}, 'hold': sorted(hold)}
        fit[f'0:{f}'] = {k: _num(p[k]) for k in order}
        print(f'frame {f}: {cost:.1f} off its landmarks', flush=True)
    keys = {f'0:{f}': keys[f'0:{f}'] for f in LANDMARKS}
    with open(base + '-keys.json', 'w') as fh:
        fh.write('{\n' + _rows(keys, ()) + '\n}\n')
    with open(base + '-fit.json', 'w') as fh:
        fh.write('{\n' + _rows({f'0:{f}': fit[f'0:{f}'] for f in LANDMARKS}, ()) + '\n}\n')
    print(f'{len(todo)} keys -> {base}-keys.json, and their frames\' fit started from them (fpbowfit.py refines it)')


if __name__ == '__main__':
    main()
