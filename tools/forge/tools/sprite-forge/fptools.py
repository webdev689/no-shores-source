"""The life skills' tools in first person: each tool's frames, rendered by the first-person forge as a weapon's are.

    python -I tools/sprite-forge/fptools.py --out public/art/tools [--tools woodaxe,pickaxe] [--samples 96]
    python -I tools/sprite-forge/fptools.py --preview /tmp/out --tools rod --samples 16

Where a tool is drawn in a weapon's frames today, it moves as that weapon does, one for one. The Wood-Axe takes the
battleaxe's fitted poses, lights and grade (WEAPON08.CIF), its head on the battleaxe's haft. The Pick-Axe's poses are
fitted to the warhammer's frames (WEAPON07.CIF, specs/PICKAXE.json) with a warhammer's block of a head, and the pick is
drawn in them. The Skinning Knife is fitted to the dagger's idle (WEAPON02.CIF, specs/KNIFE.json). The Sickle, the Spade,
the Basket and the Fishing Rod have no frames of Daggerfall's to stand in: their poses are keyed by hand
(specs/<TOOL>-fit.json), in the long blade's light and grade or the battleaxe's.

The gathering hand is the climbing arms' left arm, keyed reaching for a find and closing on it (specs/GATHER.json).

The screen is drawn OVER texels past each of its edges, so the game can move a tool onto what it works (a trunk, a
stem, a glint) and never show a cut edge. Each record's frames share one canvas, as big as the tool needs over all of
them. The frames go to `<out>/<tool>/<state>-<frame>.png`, and `<out>/<tool>/frames.json` says where each record's
canvas stands on the 320 x 200 screen (`rect`, its corner off the screen where it runs past) and where each frame's
working point lands (`points`, [u, v, depth]): the axe's edge, the pick's point, the sickle's hook, the knife's tip,
the spade's edge, the basket's mouth, the rod's tip, the hand's palm."""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fpcolour  # noqa: E402
import fpforge  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402
import lifetools  # noqa: E402

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
# each tool: its spec, the records it draws, and where a tool is drawn in another's place, the part it takes over;
# `light` and `grade` borrow a weapon's (the archive's alone where the flag is off: its records mean other moves), the
# grade only for the materials named: a keyed tool's wood keeps its own colours, a battleaxe's grade fitted to its own
TOOLS = {
    'woodaxe': {'spec': 'WEAPON08.json', 'records': (0, 5),
                'swap': {'weapon': 'battleaxe', 'parts': {'axe': lifetools.wood_axe}, 'mats': ('axehead', 'haft')}},
    'pickaxe': {'spec': 'PICKAXE.json', 'records': (0, 1),
                'swap': {'weapon': 'pickfit', 'parts': {'pick': lambda S: lifetools.pick_axe(lifetools.pick_from_hammer(S))},
                         'mats': ('axehead', 'haft')}},
    'knife': {'spec': 'KNIFE.json', 'records': None, 'light': ('WEAPON04', False)},
    'sickle': {'spec': 'SICKLE.json', 'records': None, 'light': ('WEAPON04', False)},
    'spade': {'spec': 'SPADE.json', 'records': None, 'light': ('WEAPON08', False)},
    'basket': {'spec': 'BASKET.json', 'records': None, 'light': ('WEAPON08', False)},
    'rod': {'spec': 'ROD.json', 'records': None, 'light': ('WEAPON08', False), 'grade': ('WEAPON08', False, ('axehead',))},
    'gather': {'spec': 'GATHER.json', 'records': None, 'light': ('CLIMB', False), 'grade': ('CLIMB', False)},
}
W, H = 320, 200
OVER = 64   # texels drawn past each edge of the screen: as far as the game moves a tool onto its mark
# each tool's materials graded onto Daggerfall's own tones for their like (its archive, its material): the iron onto the
# battleaxe's or the warhammer's, the blades onto the long blade's steel, the wood onto a haft's or the staff's. Ours
# are read off the tool's own render, over every frame it draws; so its shadows fall as deep and its highlights flare
# as bright as Daggerfall's, whatever light it is drawn in
TONES = {
    'woodaxe': {'axehead': ('WEAPON08', 'axehead'), 'haft': ('WEAPON08', 'haft')},
    'pickaxe': {'axehead': ('PICKAXE', 'axehead'), 'haft': ('PICKAXE', 'haft')},
    'knife': {'blade': ('WEAPON04', 'blade'), 'staff': ('WEAPON08', 'haft')},
    'sickle': {'blade': ('WEAPON04', 'blade'), 'haft': ('WEAPON08', 'haft')},
    'spade': {'axehead': ('WEAPON08', 'axehead'), 'rodwood': ('PICKAXE', 'haft')},
    'basket': {'wicker': ('PICKAXE', 'haft')},
    'rod': {'axehead': ('WEAPON08', 'axehead'), 'rodwood': ('PICKAXE', 'haft')},
}


def borrow(tool):
    """Lay the weapon's light and grade a tool borrows over its own: the light whole, the grade where it names its
    materials (or the ones listed) and the tool has none of its own."""
    t = TOOLS[tool]
    if 'light' in t:
        name, records = t['light']
        fpstage.load_light(os.path.join(SPECS, f'{name}-light.json'))
        if not records:
            fpstage.RECORD_LIGHT.clear()
    if 'grade' in t:
        name, records, *only = t['grade']
        table = json.load(open(os.path.join(SPECS, f'{name}-grade.json')))
        recs = table.pop('records', {})
        table.pop('frames', None)
        for n, g in table.items():
            if not only or n in only[0]:
                fpforge.GRADE.setdefault(n, g)
        if records:
            for r, g in recs.items():
                fpforge.RECORD_GRADE.setdefault(r, g)


def tones(eye, spec, tool, frames, own):
    """The tool's own grade (TONES): each material's brightness, or each channel of a wood's, at the grade's shares
    over the raw render of every frame in `frames` ((record, frame, pose, part)), onto Daggerfall's at the same shares.
    A tool drawn in the frames of the archive it borrows (`own`, its spec's) takes each frame's own metal tones where
    Daggerfall's frame has them, so a frame lit dim or bright is as dim or bright as Daggerfall drew it. Answers (the
    archive's grade, each frame's)."""
    at = lambda v: fpcolour.rising(np.percentile(v, fpcolour.GRADE_AT)).round(2).tolist()   # noqa: E731
    seen = {n: {} for n in TONES.get(tool, {}) if n in eye.names}
    for r, f, pose, part in frames:
        work = eye.screen(pose, part, raw=True, record=r, frame=f)
        ids = eye.id_map(pose, part, record=r)
        for n in seen:
            seen[n][f'{r}:{f}'] = work[(work[..., 3] > 0) & (ids == eye.names.index(n) + 1)][:, :3].astype(np.float64)
    whole, each = {}, {}
    for n, by in seen.items():
        px = np.concatenate(list(by.values())) if by else np.zeros((0, 3))
        name, mat = TONES[tool][n]
        table = json.load(open(os.path.join(SPECS, f'{name}-grade.json')))
        theirs = table[mat]
        if len(px) >= 40:
            whole[n] = ({'lum': [at(px.mean(axis=1)), theirs['lum'][1]]} if 'lum' in theirs
                        else {'rgb': [[at(px[:, c]), theirs['rgb'][c][1]] for c in range(3)]})
        if name != own:
            continue
        for key, fpx in by.items():   # the frame's own, onto Daggerfall's same frame
            theirs_f = table.get('frames', {}).get(key, {}).get(mat)
            if theirs_f and 'lum' in theirs_f and len(fpx) >= 40:
                each.setdefault(key, {})[n] = {'lum': [at(fpx.mean(axis=1)), theirs_f['lum'][1]]}
    return whole, each


def wield(tool):
    """Put a tool in the place of the weapon it is drawn for (`swap`). Gives back what to restore."""
    swap = TOOLS[tool].get('swap')
    if not swap:
        return None
    w = swap['weapon']
    base = dict(fpmodel.WEAPONS[w])
    fpmodel.WEAPONS[w] = {**base, 'parts': swap['parts'], 'mats': swap['mats']}
    return w, base


def overscan(eye):
    """Draw the eye's screen OVER texels wider at each edge: Cycles' frame and the fitter's raster both, the eye's
    centre and focal as they were, so a pose keyed on the screen lands where it did. Answers the raster to restore."""
    import bpy
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = W + 2 * OVER, H + 2 * OVER
    sc.camera.data.lens = fpmodel.SHAPE['focal'] * 36.0 / (W + 2 * OVER)
    base = fpstage.raster
    fpstage.raster = lambda u, v, depth, tris, w=None, h=None: base(u + OVER, v + OVER, depth, tris, W + 2 * OVER, H + 2 * OVER)
    return base


def screens(tool, samples, keyed_only=False):
    """Every frame of the tool's records, whole screens by record: {record: (state, [screen...], [point...])}."""
    t = TOOLS[tool]
    spec_path = os.path.join(SPECS, t['spec'])
    spec = fpforge.load(spec_path)
    borrow(tool)
    held = wield(tool)
    raster = None
    try:
        eye = fpforge.Eye(spec, samples)
        raster = overscan(eye)
        drawn = {}
        for r, rec in enumerate(spec['records']):
            if t['records'] is not None and r not in t['records']:
                continue
            if keyed_only and any(f'{r}:{f}' not in fpforge.FIT for f in range(rec['frames'])):
                continue   # a preview while the record's poses are still being keyed
            part = fpforge.part_of(spec, rec)
            drawn[r] = (rec['state'], [(r, f, posed(fpforge.FIT[f'{r}:{f}'], spec), part) for f in range(rec['frames'])])
        if tool in TONES:   # graded on its own render, never on the frames of the weapon it stands in for
            fpforge.RECORD_GRADE.clear()
            fpforge.FRAME_GRADE.clear()
            whole, each = tones(eye, spec, tool, [x for _, fs in drawn.values() for x in fs], t['spec'][:-len('.json')])
            fpforge.GRADE.update(whole)
            fpforge.FRAME_GRADE.update(each)
        return {r: (state, [eye.screen(pose, part, record=r, frame=f) for r, f, pose, part in fs],
                    [point(tool, eye, spec, pose, part, r) for r, _, pose, part in fs])
                for r, (state, fs) in drawn.items()}
    finally:
        if raster:
            fpstage.raster = raster
        if held:
            fpmodel.WEAPONS[held[0]] = held[1]


def posed(pose, spec):
    """A frame's pose as the forge draws it: a rod's line, keyed in the eye's frame, turned into the rod's own."""
    if 'line_cam' not in pose:
        return pose
    S = fpmodel.SHAPE
    M, _ = fpstage.pose_matrix(pose, S, fpmodel.length(spec['weapon'], S))
    return {**{k: v for k, v in pose.items() if k != 'line_cam'}, **lifetools.line_in_rod(pose, S, M)}


def _axe_edge(S):
    """The Wood-Axe's edge at its middle (lifetools.wood_axe: the bit's last column, halfway up)."""
    A = lifetools.wood_axe_shape(S)
    zc = A['haft_len'] + 0.55 * A.get('sock_len', 0.15)
    return [A['eye_w'] / 2 + A['bit_reach'] + 0.016, 0.0, zc + (A['bit_h'] - A['eye_h'] - 2 * A['beard']) / 2]


def _pick_ends(S):
    """The Pick-Axe's two arms' ends, its point and its chisel (lifetools.pick_axe, over the stand-in's fitted numbers):
    the warhammer's frames turn its head either way about the haft, and the end that strikes is the lower one."""
    P = lifetools.pick_from_hammer(S)
    z = P['haft_len'] + P['head_r'] - P['droop'] * P['head_len']
    return [[P['head_len'], 0.0, z], [-P['head_len'], 0.0, z]]


def _sickle_hook(S):
    """The Sickle's edge deep in its hook, six tenths round the crescent: where the stems are gathered and cut."""
    R, bw, k = S['arc_r'], S['blade_w'], 0.6
    th = math.pi - k * S['arc'] * math.pi
    wa = bw * (1.0 - k) ** 0.75 + 0.0006
    return [R - bw / 2 + (R - wa) * math.cos(th), 0.0, S['shank'] + (R - wa) * math.sin(th)]


# each tool's working point in its own space (the axis up +Z from the hand, the working side +X), from its shape
WORKING = {
    'woodaxe': _axe_edge,
    'pickaxe': _pick_ends,
    'knife': lambda S: [0.0, 0.0, S['blade_len']],
    'sickle': _sickle_hook,
    'spade': lambda S: [0.0, 0.0, S['haft_len'] + 0.03 + S['blade_len']],
    'basket': lambda S: [0.0, 0.0, S['depth']],
}


def point(tool, eye, spec, pose, part, record):
    """Where a frame's working point lands on the screen: [u, v, depth], u and v in the screen's texels, the depth in
    metres before the eye. The rod's is its bent tip; the hand's, the middle of its glove past the wrist (its palm)."""
    S = eye.drawn(part, record)[0]
    if tool == 'rod':
        return tip(spec, pose)
    M, _ = fpstage.pose_matrix(pose, S, fpmodel.length(spec['weapon'], S, part))
    if tool == 'gather':
        v, q, m, mats = fpmodel.arrays(spec['weapon'], S, part)
        glove = np.unique(q[m == mats.index('gauntlet')])
        rest = v[glove]
        bent = fpmodel.posed(spec['weapon'], part, v, pose, S)[glove]
        p = bent[rest[:, 2] > fpmodel.WRIST].mean(axis=0)[None, :]
    else:
        p = np.array(WORKING[tool](S), dtype=np.float64).reshape(-1, 3)
    u, v, d = fpstage.project(p @ M[:3, :3].T + M[:3, 3], S)
    k = int(np.argmax(v))   # of two ends, the lower on the screen: the one that strikes
    return [round(float(u[k]), 1), round(float(v[k]), 1), round(float(d[k]), 3)]


def tip(spec, pose):
    """Where a rod's tip lands on the screen at `pose` (its bend's own), [u, v, depth]: where the game ties the line it
    runs to the float."""
    S = {**fpmodel.SHAPE, **{j[0]: pose.get(j[0], j[4]) for j in lifetools.ROD_JOINTS}}
    M, _ = fpstage.pose_matrix(pose, fpmodel.SHAPE, fpmodel.length(spec['weapon'], fpmodel.SHAPE))
    end = lifetools.rod_spine(S)[0][-1]
    u, v, d = fpstage.project((M[:3, :3] @ end + M[:3, 3])[None, :], fpmodel.SHAPE)
    return [round(float(u[0]), 1), round(float(v[0]), 1), round(float(d[0]), 3)]


def canvas(frames):
    """The canvas a record's frames share, out to the farthest drawn texel on the overscanned screen: [x, y, w, h], x
    and y on the 320 x 200 screen (less than 0, or w and h past its edge, where the tool runs off it)."""
    on = np.zeros(frames[0].shape[:2], dtype=bool)
    for scr in frames:
        on |= scr[..., 3] > 0
    ys, xs = np.nonzero(on)
    if not len(xs):
        return [0, 0, 1, 1], [OVER, OVER, 1, 1]
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    return [x0 - OVER, y0 - OVER, x1 - x0, y1 - y0], [x0, y0, x1 - x0, y1 - y0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default='')
    ap.add_argument('--preview', default='', help='write whole screens over a grey ground instead')
    ap.add_argument('--tools', default=','.join(TOOLS))
    ap.add_argument('--samples', type=int, default=96)
    args = ap.parse_args()
    import stage
    from PIL import Image
    for tool in [x for x in args.tools.split(',') if x]:
        recs = screens(tool, args.samples, keyed_only=bool(args.preview))
        table = {}
        for r, (state, frames, points) in recs.items():
            if args.preview:
                os.makedirs(args.preview, exist_ok=True)
                for f, scr in enumerate(frames):
                    ground = Image.new('RGBA', scr.shape[1::-1], (72, 80, 72, 255))
                    ground.alpha_composite(Image.fromarray(scr.astype(np.uint8), 'RGBA'))
                    frame = Image.new('RGBA', ground.size, (0, 0, 0, 0))
                    frame.paste((255, 255, 255, 255), (OVER - 1, OVER - 1, OVER + W + 1, OVER + H + 1))
                    frame.paste((0, 0, 0, 0), (OVER, OVER, OVER + W, OVER + H))
                    ground.alpha_composite(frame)
                    u, v = points[f][0] + OVER, points[f][1] + OVER
                    ground.paste((255, 40, 200, 255), (int(u) - 1, int(v) - 1, int(u) + 2, int(v) + 2))
                    ground.resize((ground.width * 2, ground.height * 2), Image.NEAREST).save(
                        os.path.join(args.preview, f'{tool}-{state}-{f}.png'))
                print(f'{tool} {state}: {json.dumps(points)}', flush=True)
                continue
            rect, cut = canvas(frames)
            os.makedirs(os.path.join(args.out, tool), exist_ok=True)
            for f, scr in enumerate(frames):
                stage.write_png(os.path.join(args.out, tool, f'{state}-{f}.png'), fpstage.crop(scr, cut))
            table[state] = {'rect': rect, 'points': points}
        if table:   # where each record's canvas stands, and each frame's working point
            with open(os.path.join(args.out, tool, 'frames.json'), 'w') as fh:
                fh.write(json.dumps(table, separators=(',', ':')) + '\n')
        print(f'{tool}: {json.dumps({k: v["rect"] for k, v in table.items()})}', flush=True)


if __name__ == '__main__':
    main()
