"""The cart's horse: the Courser (horse.py) in its saddle (tack.py), unridden, standing and walking in five views, as
Horse Cart and Cargo's pictures are named and sized (src/systems/horse/horseArt.js). `horse1..5.png` stand, 121 x 94;
`Walk.<view>-<frame>.png` walk, 121 x 95, eight frames over one stride. A view is the forge's (forge.py `VIEW_YAW`):
0 the front, 2 the side with the head to the left, 4 the back.

    python -I tools/sprite-forge/carthorse.py --out public/art/studio/forge/horse [--only horse3.png] [--samples 256]

The horse is drawn at the billboard's own scale (a texel 0.025 m, horseCartLaw.js), so it stands as big as the 3D
horse. The middle of its length stands on the picture's middle column in every view, and its lowest hoof in any of a
view's frames stands `GROUND_GAP` rows over the picture's foot. Its coat is graded onto Daggerfall's town horse as the
riders' horse's is (horsegrade.py, specs/HORSE-grade.json), and its mane and tail onto the riding bay's black
(`MANE_GRADE`), grey at its light. Each picture carries where its tack lies (`TACK_CHUNK`), so a coat dye moves the
hide alone (horseCoats.js `recolorHorse`'s `spare`)."""
import argparse
import json
import math
import os
import struct
import sys
import tempfile
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import forge  # noqa: E402
import horse  # noqa: E402
import riding  # noqa: E402
import stage  # noqa: E402

WIDTH, STILL_HEIGHT, WALK_HEIGHT = 121, 94, 95
GROUND_GAP = 2   # the empty rows under the hooves (horseArt.js HORSE_ART_GROUND_GAP)
VIEWS, WALK_FRAMES = 5, 8
# samples a pixel: the mane's strands are half a pixel across, and fewer leave salt in it that flickers as the walk
# plays
SAMPLES = 256
PX_PER_M = 40.0   # 1 / MeshReader.GlobalScale: the billboard is 121 texels by 3.025 m
# the strands a pixel half across at this scale, as the riders' horse draws them at the sprites' scale
STRAND_RADIUS = riding.STRAND_RADIUS * stage.PX_PER_M / PX_PER_M
# riding tack at the measured biped's height, as the 3D horse wears it unridden (tack.py `bake_tack`): no reins
TACK_HEIGHT = 1.0
# the work frame each view is rendered in, the ground under the horse's middle well inside it, and its root
WORK = (171, 140)
WORK_ROOT = (85.5, 118.0)
# where the tack lies, a private PNG chunk: runs of pixels, top row first, alternately not the tack's and the
# tack's, each an unsigned LEB128 varint (horseArt.js `tackOf`)
TACK_CHUNK = b'taCk'
# the saddle's leather matte at this size (roughness, specular): seen whole, with no rider over it, the seat's sheen
# reads as a grey blot
MATTE = {'seat': (0.9, 0.08), 'strap': (0.85, 0.12)}
# the mane and the tail graded onto Daggerfall's riding bay's black (fpride.py's grade): the cart's horse is the bay
# every coat dye starts from, black in its points, and a mount look finds the points, and which way the horse faces,
# by that black (horseCoats.js `pointsOf`, mountPaint.js `mountFacing`)
MANE_GRADE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'RIDE-grade.json')
GRADE_NAMES = tuple(horse.MATERIAL_OF.values())   # the coat (1) and the mane (2), as `mane_where` classes them
TACK_CLASS = 3


def mane_ramp(rgb):
    """The riding bay's mane grade (`rgb`: each channel's shares) laid on the light alone (forge.py `grade_frame`'s
    'ramp'). Its reference is grey at every share, so a texel takes that grey at its light: the hair shader's tints
    stay out of a black mane, which a mount look takes for the points by its grey (horseCoats.js `isPointPixel`)."""
    src = np.mean([shares for shares, _ in rgb], axis=0)
    return {'ramp': [src.tolist(), [[rgb[c][1][k] for c in range(3)] for k in range(len(src))]]}


def still_file(view):
    return f'horse{view + 1}.png'


def walk_file(view, frame):
    return f'Walk.{view}-{frame + 1}.png'


def walk_time(frame):
    """The walk's time a frame shows: the frames spread evenly over one stride, as the riders' walk is
    (riding.py `time_of`)."""
    return horse.bake()['gaits']['walk']['duration'] * frame / WALK_FRAMES


def middle():
    """The middle of the standing horse's length, along the bake's +Y (metres): the point the pictures stand on."""
    b = horse.bake()
    skins = horse.skins(b, horse.worlds(b, 'idle', 0.0))
    ys = np.concatenate([horse.posed(mesh, skins)[:, 1] for mesh in b['meshes']])
    return float((ys.min() + ys.max()) / 2)


def anchor_px(yaw, along):
    """Where the ground under the horse's middle lands in the work frame (x, y in pixels, rows down), at view turn
    `yaw`, the middle `along` metres ahead of the bake's origin."""
    p = horse.turned(yaw) @ np.array([0.0, along, 0.0])
    e = math.radians(stage.ELEVATION)
    up = np.array([0.0, math.sin(e), math.cos(e)])
    rx, ry = stage.ROOT_PX
    return rx + p[0] * stage.PX_PER_M, ry - float(p @ up) * stage.PX_PER_M


def shoot(courser, gait, time, yaw, view, tmp):
    """One frame in the work frame: its colour graded onto the town horse, and the tack's pixels (a mask)."""
    courser.pose(gait, time, yaw)
    shot = stage.render_rgba(tmp)
    parts = courser.mane_where(shot, lambda: stage.render_rgba(tmp))
    graded = forge.grade_frame(shot, parts, GRADE_NAMES, view)
    return graded, (parts == TACK_CLASS) & (graded[..., 3] > 0)


def cut(work, tack, x0, y0, height):
    """The picture `WIDTH` x `height` cut from the work frame at its corner (`x0`, `y0`); refuses a cut that loses
    any of the horse."""
    h, w = work.shape[:2]
    on = work[..., 3] > 0
    inside = np.zeros_like(on)
    inside[max(0, y0):min(h, y0 + height), max(0, x0):min(w, x0 + WIDTH)] = True
    if (on & ~inside).any() or x0 < 0 or y0 < 0 or x0 + WIDTH > w or y0 + height > h:
        raise ValueError(f'the horse runs past its {WIDTH} x {height} picture')
    return work[y0:y0 + height, x0:x0 + WIDTH].copy(), tack[y0:y0 + height, x0:x0 + WIDTH].copy()


def tack_runs(mask):
    """The tack's mask as `TACK_CHUNK`'s bytes."""
    flat = mask.astype(bool).ravel()
    edges = np.flatnonzero(np.diff(np.concatenate([[False], flat, [not flat[-1]]]).astype(np.int8)))
    runs = np.diff(np.concatenate([[0], edges]))
    out = bytearray()
    for run in runs.tolist():
        while True:
            byte = run & 0x7f
            run >>= 7
            out.append(byte | (0x80 if run else 0))
            if not run:
                break
    return bytes(out)


def write_png(path, rgba, tack):
    """An RGBA PNG, rows top first, with the tack's runs in its `TACK_CHUNK` before the image data."""
    h, w = rgba.shape[:2]
    raw = b''.join(b'\x00' + np.ascontiguousarray(rgba[y], dtype=np.uint8).tobytes() for y in range(h))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    with open(path, 'wb') as fh:
        fh.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                 + chunk(TACK_CHUNK, tack_runs(tack)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='', help='these pictures alone (their views are rendered whole)')
    ap.add_argument('--samples', type=int, default=SAMPLES)
    args = ap.parse_args()
    only = {n for n in args.only.split(',') if n}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(args.samples)
    stage.PX_PER_M = PX_PER_M
    stage.resize(*WORK)
    stage.ROOT_PX = WORK_ROOT
    stage.aim(bpy.context.scene.camera)
    forge.GRADE.update(json.load(open(riding.HORSE_GRADE)))
    forge.GRADE[GRADE_NAMES[1]] = mane_ramp(json.load(open(MANE_GRADE))['mane']['rgb'])
    courser = horse.Courser(strand_radius=STRAND_RADIUS, tack_height=TACK_HEIGHT, reins=False)
    for name, (rough, spec) in MATTE.items():
        bsdf = bpy.data.materials[f'tack{name}'].node_tree.nodes['Principled BSDF']
        bsdf.inputs['Roughness'].default_value, bsdf.inputs['Specular IOR Level'].default_value = rough, spec
    along = middle()
    tmp = os.path.join(tempfile.mkdtemp(), 'h.png')
    os.makedirs(args.out, exist_ok=True)
    for view, yaw in enumerate(forge.VIEW_YAW):
        names = [still_file(view)] + [walk_file(view, f) for f in range(WALK_FRAMES)]
        if only and not only & set(names):
            continue
        still = shoot(courser, 'idle', 0.0, yaw, view, tmp)
        walks = [shoot(courser, 'walk', walk_time(f), yaw, view, tmp) for f in range(WALK_FRAMES)]
        ax, _ = anchor_px(yaw, along)
        # the view's ground: the lowest hoof of any of its frames, so the walk never bobs and no hoof falls into the
        # gap (a hoof planted nearer the eye than the others draws lower, as the eye looks down)
        foot = max(int(np.nonzero(work[..., 3].any(axis=1))[0].max()) for work, _ in [still, *walks])
        x0 = int(round(ax - (WIDTH / 2)))
        for name, (work, tack), height in [(names[0], still, STILL_HEIGHT),
                                           *[(n, w, WALK_HEIGHT) for n, w in zip(names[1:], walks)]]:
            if only and name not in only:
                continue
            rgba, mask = cut(work, tack, x0, foot - (height - 1 - GROUND_GAP), height)
            write_png(os.path.join(args.out, name), rgba, mask)
            print(f'{name}: {int((rgba[..., 3] > 0).sum())} pixels, {int(mask.sum())} of them tack', flush=True)


if __name__ == '__main__':
    main()
