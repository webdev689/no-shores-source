"""The forge's body points: where each frame's head, chest, pelvis and limbs stand in its picture, for the Aura
Armory's pieces and the auras (src/render/armoryPose.js poseFromForge). A class sprite drawn from the forge has no
bones the game can read, and a painting's marks are a guess; the forge posed the body, so it says where each point
is, exactly, in the cell its strips are laid in.

Each animation the index draws, each view and keyed frame, the body is posed as layers.py poses it (its carry, its
keys), its seventeen points (POSE_POINTS, armoryPose.js) taken off the rig's joints and projected as the strips are.
A point is hidden where the body's own surface lies a hand nearer the eye than it (the far shoulder behind the
chest): the body's depth is rasterized as the strips' is, its weapon left out. Nothing is rendered.

    python -I tools/sprite-forge/forgepoints.py --body male

writes src/systems/studioArt/forgePoints-<body>.json: per animation its cell and root (the index's), and per view
and keyed frame each point's [x, y] in the cell (y down), its depth along the eye's line (cm from the feet, nearer
less) and 1 where it is hidden."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402,F401
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

import fit  # noqa: E402
import forge  # noqa: E402
import layers  # noqa: E402
import poses  # noqa: E402
import shape  # noqa: E402
import stage  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'src', 'systems', 'studioArt', 'forgePoints-{body}.json')
# each point (armoryPose.js POSE_POINTS' order): its joint and the place in the joint's own frame (m) - the head's
# middle and its crown over the head joint, the chest's face a hand forward of the chest joint (forward is -Y)
POINTS = (('head', 'head', (0, 0, 0.10)), ('crown', 'head', (0, 0, 0.23)), ('neck', 'neck', (0, 0, 0)),
          ('chest', 'chest', (0, -0.12, 0.06)), ('pelvis', 'pelvis', (0, 0, 0)),
          ('shL', 'uarm_L', (0, 0, 0)), ('shR', 'uarm_R', (0, 0, 0)), ('elL', 'farm_L', (0, 0, 0)),
          ('elR', 'farm_R', (0, 0, 0)), ('waL', 'hand_L', (0, 0, 0)), ('waR', 'hand_R', (0, 0, 0)),
          ('hipL', 'thigh_L', (0, 0, 0)), ('hipR', 'thigh_R', (0, 0, 0)), ('knL', 'shin_L', (0, 0, 0)),
          ('knR', 'shin_R', (0, 0, 0)), ('ftL', 'foot_L', (0, 0, 0)), ('ftR', 'foot_R', (0, 0, 0)))
HIDE_M = 0.09   # how much nearer the eye the body's surface lies over a point before the point is behind it (m)


def frame_points(layer, anim, key, view, per):
    """One frame's points: each [x, y, depth cm, hidden] on the work frame."""
    p, gear = layers.pose(anim, key, view, per, layer.weapon)
    layer.fighter.place(p, gear)
    W = p.world()
    pts = np.array([list(W[j] @ Vector(at)) for _, j, at in POINTS])
    px, py, depth = fit.project(pts, layer.cloud.scale)
    v, t, c, pc = layer.cloud.mesh(p, gear, pieces=True)
    body = pc != fit.WEAPON_PIECE   # the weapon hides nothing of the body's points
    vx, vy, vz = fit.project(v, layer.cloud.scale)
    zs = fit.rasterize(vx, vy, vz, t[body], c[body], stage.WORK_W, stage.WORK_H, with_depth=True)[1]
    out = []
    for x, y, d in zip(px, py, depth):
        ix, iy = int(round(x)), int(round(y))
        near = zs[iy, ix] if 0 <= ix < stage.WORK_W and 0 <= iy < stage.WORK_H else np.inf
        out.append([float(x), float(y), round(float(d) * 100), int(np.isfinite(near) and near < d - HIDE_M)])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--body', required=True, choices=tuple(layers.BODIES))
    ap.add_argument('--anims', default='', help='only these animations (all the index draws by default)')
    args = ap.parse_args()
    spec, per = layers.load_body(args.body)
    poses.CARRY[0] = True
    stage.PX_PER_M *= shape.SHAPE['scale']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(8)
    stage.resize(*layers.WORK)
    probe = forge.Fighter('naked', args.body, 'axe')
    names = sorted(probe.M)
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            bpy.data.objects.remove(ob, do_unlink=True)
    ids_of = {n: i + 1 for i, n in enumerate(names)}
    classify = lambda m: ids_of.get(m.name.split('.')[0], 0) if m else 0   # noqa: E731
    body = next(ly for ly in layers.build_layers(args.body, classify, {'body'}) if ly.name == 'body')
    index = json.load(open(layers.LOOKS))
    cells = index['bodies'][args.body]['anims']
    want = [a for a in args.anims.split(',') if a] or [a for a in cells if a in layers.ANIMS]
    path = OUT.format(body=args.body)
    out = json.load(open(path)) if os.path.exists(path) and args.anims else {'points': [n for n, _, _ in POINTS],
                                                                             'anims': {}}
    rx, ry = stage.ROOT_PX
    for anim in want:
        cell, root = cells[anim]['cell'], cells[anim]['root']
        views = []
        for view in range(5):
            row = []
            for key in range(layers.ANIMS[anim]):
                got = frame_points(body, anim, key, view, per)
                # onto the animation's cell: its root the work frame's root
                row.append([[round(x - (rx - root[0]), 1), round(y - (ry - root[1]), 1), z, h] for x, y, z, h in got])
            views.append(row)
        out['anims'][anim] = {'cell': cell, 'root': root, 'views': views}
        print(f'{args.body} {anim}: {layers.ANIMS[anim]} frames', flush=True)
    with open(path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print('wrote', path)


if __name__ == '__main__':
    main()
