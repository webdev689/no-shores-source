"""Motion capture onto the forge's body: read a captured skeleton, turn each frame into the forge's own joint angles,
and render it on the bare body (the mannequin) from the sprites' views.

    python -I tools/sprite-forge/mocap.py --asf <subject.asf> --amc <trial.amc> --frames 1,40,80 --out <sheet.png>
    python -I tools/sprite-forge/mocap.py --fbx <clip.fbx> --frames 1,10 --out <sheet.png>

CMU's motion capture library gives ASF/AMC; Mixamo gives FBX (download it "Without Skin"); a glTF library of many
clips plays the one `--clip` names. The captures are read from outside the repo and never enter it. A pose is
carried by the directions of the captured bones, never their lengths, so the forge's own proportions stay: each trunk
and leg joint is turned until its bone points as the captured one does, and each arm is solved to the captured wrist
by the forge's IK (`rig.solve_arm`). `--bake <name> --pick 3,10` writes those frames' joint turns and the body's
travel as the forge's keys (specs/moves.json, poses.py `MOVES`), for a clip whose licence lets them go in (CC0). A
frame number with a fraction (`9.4`) reads an armature clip between its keys, as Blender interpolates them: a blow
whose weapon crosses straight ahead between two keys is caught there."""
import argparse
import json
import math
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

# the landmarks a frame gives, each a point in the forge's axes (+X the body's left, +Y back, +Z up)
LANDMARKS = ('pelvis', 'spine', 'chest', 'neck', 'head', 'head_top') + tuple(
    f'{n}_{s}' for s in 'LR' for n in ('hip', 'knee', 'ankle', 'toe', 'shoulder', 'elbow', 'wrist', 'hand', 'thumb'))


# ---- reading captures ----

def _euler(deg, order='XYZ'):
    """CMU's rotation: its axes applied in `order`, each about the fixed frame (the first applied rightmost)."""
    m = np.eye(3)
    for ax, a in zip(order, np.radians(deg)):
        c, s = math.cos(a), math.sin(a)
        r = {'X': [[1, 0, 0], [0, c, -s], [0, s, c]], 'Y': [[c, 0, s], [0, 1, 0], [-s, 0, c]],
             'Z': [[c, -s, 0], [s, c, 0], [0, 0, 1]]}[ax]
        m = np.array(r) @ m
    return m


def read_asf(path):
    bones, hier, sec, cur = {}, {}, None, None
    for raw in open(path):
        line = raw.split('#')[0].strip()
        if not line:
            continue
        if line.startswith(':'):
            sec = line.split()[0]
            continue
        w = line.split()
        if sec == ':bonedata':
            if w[0] == 'begin':
                cur = {'dof': []}
            elif w[0] == 'end':
                bones[cur['name']] = cur
            elif w[0] in ('name', 'direction', 'length', 'axis', 'dof'):
                cur[w[0]] = (w[1] if w[0] == 'name' else [float(v) for v in w[1:4]] if w[0] in ('direction', 'axis')
                             else float(w[1]) if w[0] == 'length' else w[1:])
        elif sec == ':hierarchy' and w[0] not in ('begin', 'end'):
            for child in w[1:]:
                hier[child] = w[0]
    for b in bones.values():
        b['C'] = _euler(b['axis'])
    return bones, hier


def read_amc(path):
    frames, cur = [], None
    for raw in open(path):
        line = raw.strip()
        if not line or line.startswith(('#', ':')):
            continue
        w = line.split()
        if len(w) == 1 and w[0].isdigit():
            cur = {}
            frames.append(cur)
        elif cur is not None:
            cur[w[0]] = [float(v) for v in w[1:]]
    return frames


# CMU's bones whose far ends are the landmarks
CMU_ENDS = {'spine': 'lowerback', 'chest': 'upperback', 'neck': 'thorax', 'head': 'upperneck', 'head_top': 'head',
            **{f'{n}_{s}': f'{s.lower()}{b}' for s in 'LR' for n, b in (
                ('hip', 'hipjoint'), ('knee', 'femur'), ('ankle', 'tibia'), ('toe', 'foot'), ('shoulder', 'clavicle'),
                ('elbow', 'humerus'), ('wrist', 'radius'), ('hand', 'hand'), ('thumb', 'thumb'))}}


def cmu_frames(asf, amc):
    """Each AMC frame's landmarks: CMU's forward kinematics (a bone turns by its axis, its dofs, its axis undone)."""
    bones, hier = read_asf(asf)
    order = []

    def visit(name):
        order.append(name)
        for c, p in hier.items():
            if p == name:
                visit(c)
    visit('root')
    out = []
    for fr in read_amc(amc):
        r = fr['root']
        M = {'root': _euler(r[3:6])}
        P = {'root': np.array(r[:3])}
        for name in order[1:]:
            b = bones[name]
            v = dict(zip([d.upper() for d in b['dof']], fr.get(name, [])))
            L = _euler([v.get('RX', 0.0), v.get('RY', 0.0), v.get('RZ', 0.0)])
            M[name] = M[hier[name]] @ b['C'] @ L @ b['C'].T
            P[name] = P[hier[name]] + b['length'] * (M[name] @ np.array(b['direction']))
        pts = {k: P[v] for k, v in CMU_ENDS.items()}
        pts['pelvis'] = P['root']
        out.append({k: np.array([p[0], -p[2], p[1]]) for k, p in pts.items()})   # Y up -> Z up
    return out


# Humanoid rigs by their bone names: the bone whose head each landmark is (a name ending `>` its tip; 'head_top' is the
# head bone's tip, or the named end bone). Mixamo's (FBX), Rigify's deform bones, the Unreal mannequin's (Quaternius's
# libraries, glTF) and KayKit's (Kay Lousberg's Character Animations, glTF). KayKit's has no neck bone and no thumb:
# its neck is the chest's tip, and its thumb is laid along its weapon slot's +Y, the way its blade runs (`slot`).
def _rig(trunk, limb, top=None):
    out = dict(trunk)
    for s, side in (('L', 0), ('R', 1)):
        for n, names in limb.items():
            out[f'{n}_{s}'] = names[side]
    out['head_top'] = top
    return out


RIGS = {
    'mixamo': _rig({'pelvis': 'Hips', 'spine': 'Spine1', 'chest': 'Spine2', 'neck': 'Neck', 'head': 'Head'},
                   {n: (f'Left{b}', f'Right{b}') for n, b in (
                       ('hip', 'UpLeg'), ('knee', 'Leg'), ('ankle', 'Foot'), ('toe', 'ToeBase'), ('shoulder', 'Arm'),
                       ('elbow', 'ForeArm'), ('wrist', 'Hand'), ('hand', 'HandMiddle1'), ('thumb', 'HandThumb2'))},
                   top='HeadTop_End'),
    'rigify': _rig({'pelvis': 'DEF-hips', 'spine': 'DEF-spine.002', 'chest': 'DEF-spine.003', 'neck': 'DEF-neck',
                    'head': 'DEF-head'},
                   {n: (f'DEF-{b}.L', f'DEF-{b}.R') for n, b in (
                       ('hip', 'thigh'), ('knee', 'shin'), ('ankle', 'foot'), ('toe', 'toe'), ('shoulder', 'upper_arm'),
                       ('elbow', 'forearm'), ('wrist', 'hand'), ('hand', 'f_middle.01'), ('thumb', 'thumb.02'))}),
    'unreal': _rig({'pelvis': 'pelvis', 'spine': 'spine_02', 'chest': 'spine_03', 'neck': 'neck_01', 'head': 'Head'},
                   {n: (f'{b}_l', f'{b}_r') for n, b in (
                       ('hip', 'thigh'), ('knee', 'calf'), ('ankle', 'foot'), ('toe', 'ball'), ('shoulder', 'upperarm'),
                       ('elbow', 'lowerarm'), ('wrist', 'hand'), ('hand', 'middle_01'), ('thumb', 'thumb_02'))}),
    'kaykit': _rig({'pelvis': 'hips', 'spine': 'spine', 'chest': 'chest', 'neck': 'chest>', 'head': 'head'},
                   {n: (f'{b}.l', f'{b}.r') for n, b in (
                       ('hip', 'upperleg'), ('knee', 'lowerleg'), ('ankle', 'foot'), ('toe', 'toes'),
                       ('shoulder', 'upperarm'), ('elbow', 'lowerarm'), ('wrist', 'wrist'), ('hand', 'hand'),
                       ('slot', 'handslot'))}),
}
SLOT_THUMB = 0.05   # metres from the hand along a weapon slot's +Y, where a rig without a thumb lays one
# Degrees a rig's arms are turned in toward the body. KayKit's wide, round body hangs its arms about 25 degrees further
# out than a man's; the turn fades out on a wrist raised toward the shoulder's height or laid across the body.
ARMS_IN = {'kaykit': 26.0}


def chained_frames(path, frames, clips, blade=None):
    """`armature_frames` of clips played one after another (`A+B`): a frame past the first's last is the next's, its
    first frame at the next number, and each clip is moved over the ground to start where the one before it ended."""
    whole = [armature_frames(path, None, c, blade) for c in clips]
    if frames is None:
        parts = whole
    else:
        starts = np.cumsum([0] + [len(w) for w in whole])
        want = [[] for _ in clips]
        for f in frames:
            i = min(int(np.searchsorted(starts, f, side='right')) - 1, len(clips) - 1)
            want[i].append(f - starts[i])
        parts = [armature_frames(path, w, c, blade) if w else [] for c, w in zip(clips, want)]
    out, shift = [], np.zeros(3)
    for i, (part, every) in enumerate(zip(parts, whole)):
        if i:   # this clip's first pelvis over the last one's last, on the ground's plane
            shift += (whole[i - 1][-1]['pelvis'] - every[0]['pelvis']) * np.array([1, 1, 0])
        out += [{k: v + shift for k, v in pts.items()} for pts in part]
    return out


def homed(keys, scale, home):
    """Baked keys' travel scaled by `scale`, and from key `home` on drawn back to the first key's place by the last, so
    a sprite that lunges ends where it stood."""
    last = len(keys) - 1
    end = np.array(keys[last]['travel']) * scale
    for i, key in enumerate(keys):
        t = np.array(key['travel']) * scale
        if home is not None and i > home:
            t = t - end * (i - home) / (last - home)
        key['travel'] = [round(float(v), 4) for v in t]
    return keys


def armature_frames(path, frames, clip='', blade=None):
    """The landmarks of an FBX, BVH or glTF armature at `frames` (or, with `frames` None, every frame of the clip),
    read through Blender. A file of many clips (a glTF library) plays the one named `clip`; `A+B` plays A then B.
    `blade`, two of the hand bone's axes ('Z', 'Y'), gives a rig with no weapon slot the way its weapon runs and the way
    its edge faces, as the clip's maker held it."""
    if '+' in clip:
        return chained_frames(path, frames, clip.split('+'), blade)
    import bpy
    import addon_utils   # Blender's own, importable once bpy is
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ext = os.path.splitext(path)[1].lower()
    if ext == '.bvh':
        addon_utils.enable('io_anim_bvh', default_set=True)
        bpy.ops.import_anim.bvh(filepath=path)
    elif ext in ('.glb', '.gltf'):
        addon_utils.enable('io_scene_gltf2', default_set=True)
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        addon_utils.enable('io_scene_fbx', default_set=True)
        bpy.ops.import_scene.fbx(filepath=path, automatic_bone_orientation=True)
    arm = next(ob for ob in bpy.context.scene.objects if ob.type == 'ARMATURE')
    names = {b.name.split(':')[-1]: b for b in arm.pose.bones}
    kind, rig = next(((n, r) for n, r in RIGS.items() if r['pelvis'] in names and r['hip_L'] in names), (None, None))
    if rig is None:
        raise SystemExit(f'{path}: no known rig among its bones ({", ".join(list(names)[:12])}, ...)')
    if clip:
        act = bpy.data.actions.get(clip)
        if act is None:
            raise SystemExit(f'{path}: no clip {clip!r}; it has {", ".join(sorted(a.name for a in bpy.data.actions))}')
        arm.animation_data_create()
        arm.animation_data.action = act
        if getattr(act, 'slots', None) and not arm.animation_data.action_slot:
            arm.animation_data.action_slot = act.slots[0]
        for track in arm.animation_data.nla_tracks:   # an importer stashes every clip there; none may blend in
            track.mute = True
    if frames is None:
        act = arm.animation_data.action if arm.animation_data else None
        lo, hi = (int(act.frame_range[0]), int(act.frame_range[1])) if act else (1, 1)
        frames = list(range(lo, hi + 1))
    out = []
    for f in frames:
        whole = math.floor(f)
        bpy.context.scene.frame_set(int(whole), subframe=float(f - whole))
        pts = {}
        for k, name in rig.items():
            bone, tip = (name[:-1], True) if name and name.endswith('>') else (name, False)
            if bone and bone in names and not k.startswith('slot_'):
                pts[k] = np.array((arm.matrix_world @ (names[bone].tail if tip else names[bone].head))[:])
        for s in 'LR':   # a weapon slot's +Y is its blade's way, its +X its edge's: the thumb laid along the blade
            slot = names.get(rig.get(f'slot_{s}') or '')
            if slot is not None and f'hand_{s}' in pts:
                axes = (arm.matrix_world @ slot.matrix).to_3x3()
                way, edge = np.array(axes.col[1].normalized()[:]), np.array(axes.col[0].normalized()[:])
                pts[f'thumb_{s}'] = pts[f'hand_{s}'] + way * SLOT_THUMB
                pts[f'blade_{s}'], pts[f'edge_{s}'] = pts[f'hand_{s}'] + way, pts[f'hand_{s}'] + edge
        top = names.get(rig['head_top']) if rig['head_top'] else None   # else the head's tip, which an importer may set
        pts['head_top'] = np.array((arm.matrix_world @ (top.head if top else names[rig['head']].tail))[:])
        for s in 'LR':   # a rig without fingers: the hand bone's tip is the hand
            if f'hand_{s}' not in pts:
                pts[f'hand_{s}'] = np.array((arm.matrix_world @ names[rig[f'wrist_{s}']].tail)[:])
            pts.setdefault(f'thumb_{s}', pts[f'hand_{s}'])
        for s in 'LR' if blade else ():   # no weapon slot: the hand bone's own axes
            axes = (arm.matrix_world @ names[rig[f'wrist_{s}']].matrix).to_3x3()
            way, edge = (np.array(axes.col['XYZ'.index(a)].normalized()[:]) for a in blade)
            pts[f'blade_{s}'], pts[f'edge_{s}'] = pts[f'hand_{s}'] + way, pts[f'hand_{s}'] + edge
        out.append(arms_in(pts, ARMS_IN.get(kind, 0.0)))
    return out


def _ease(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def arms_in(pts, deg):
    """Each arm turned `deg` toward the body about the chest's forward line through its shoulder, in full where it
    hangs out to the side, fading out as it is laid across the body or its wrist raised toward the shoulder's height."""
    if not deg:
        return pts
    out = dict(pts)
    left = _unit(pts['shoulder_L'] - pts['shoulder_R'])
    up = _unit(pts['neck'] - pts['chest'])
    up = _unit(up - left * (up @ left))
    for s, side in (('L', left), ('R', -left)):
        sh = pts[f'shoulder_{s}']
        d = pts[f'wrist_{s}'] - sh
        ab = math.degrees(math.atan2(d @ side, -(d @ up)))   # out from the body's side, seen from the front
        drop = -(_unit(d) @ up)   # the wrist's fall below the shoulder: 1 hanging, 0 level
        t = math.radians(deg * _ease(0.0, 35.0, ab) * _ease(0.3, 0.6, drop))
        k = np.cross(up, side)   # the turn's axis: from out toward down
        for n in ('elbow', 'wrist', 'hand', 'thumb', 'blade', 'edge'):
            if f'{n}_{s}' in pts:
                v = pts[f'{n}_{s}'] - sh
                out[f'{n}_{s}'] = sh + v * math.cos(t) + np.cross(k, v) * math.sin(t) + k * (k @ v) * (1 - math.cos(t))
    return out


def mirrored(pts):
    """A frame left for right: each landmark across the body's middle plane, the sides' names swapped."""
    swap = {'_L': '_R', '_R': '_L'}
    return {(k[:-2] + swap[k[-2:]] if k[-2:] in swap else k): p * np.array([-1.0, 1.0, 1.0]) for k, p in pts.items()}


def heading(pts):
    """The turn about the vertical that lays a frame's hips along X, its left on +X."""
    side = pts['hip_L'] - pts['hip_R']
    return -math.atan2(side[1], side[0])


def face_front(pts, a=None, o=None):
    """Turn a frame about the vertical so it faces -Y, as the forge's body does, its pelvis over the origin. By default
    its own hips set the turn; a clip passes one turn for every frame, so the hips keep their swing. `o`, the point to
    lay over the origin, keeps a clip's travel when it is the first frame's pelvis."""
    a = heading(pts) if a is None else a
    R = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    o = pts['pelvis'] * np.array([1, 1, 0]) if o is None else o
    return {k: R @ (p - o) for k, p in pts.items()}


# ---- onto the forge's skeleton ----

def _unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else v


def _frame(a, b):
    """An orthonormal frame (as columns) whose first axis is `a` and whose second lies toward `b`."""
    a = _unit(a)
    b = _unit(b - a * (b @ a))
    return np.stack([a, b, np.cross(a, b)], axis=1)


def _turn(rest_a, rest_b, a, b):
    """The rotation taking the rest pair onto the captured pair: `rest_a` onto `a` exactly, `rest_b` toward `b`."""
    return _frame(np.asarray(a, float), np.asarray(b, float)) @ _frame(np.asarray(rest_a, float),
                                                                     np.asarray(rest_b, float)).T


def retarget(pts, yaw=0.0):
    """A forge Pose (rig.Pose) holding the captured frame `pts` (face_front's): trunk and legs turned bone by bone,
    the arms solved to the captured wrists, the hands along the captured hands, the feet on the ground."""
    from mathutils import Matrix, Vector

    import poses
    from rig import JOINTS, Pose, rest, solve_arm
    P = pts
    up = np.array([0.0, 0.0, 1.0])
    left = np.array([1.0, 0.0, 0.0])
    fwd = np.array([0.0, -1.0, 0.0])
    hips = P['hip_L'] - P['hip_R']
    shoulders = P['shoulder_L'] - P['shoulder_R']
    world = {
        'pelvis': _turn(up, left, P['spine'] - P['pelvis'], hips),
        'spine': _turn(up, left, P['chest'] - P['spine'], hips + shoulders),
        'chest': _turn(up, left, P['neck'] - P['chest'], shoulders),
        'neck': _turn(up, left, P['head'] - P['neck'], shoulders),
        'head': _turn(up, left, P['head_top'] - P['head'], shoulders),
    }
    for s in 'LR':
        world[f'clav_{s}'] = _turn(rest(f'uarm_{s}') - rest(f'clav_{s}'), up, P[f'shoulder_{s}'] - P['neck'],
                                   P['neck'] - P['chest'])
        thigh, shin = P[f'knee_{s}'] - P[f'hip_{s}'], P[f'ankle_{s}'] - P[f'knee_{s}']
        foot = P[f'toe_{s}'] - P[f'ankle_{s}']
        # the knee's front: away from the way the shin folds back; a straight leg takes the foot's forward
        bend = shin - _unit(thigh) * (shin @ _unit(thigh))
        front = -bend if np.linalg.norm(bend) > 0.15 * np.linalg.norm(shin) else foot
        world[f'thigh_{s}'] = _turn(rest(f'shin_{s}') - rest(f'thigh_{s}'), fwd, thigh, front)
        world[f'shin_{s}'] = _turn(rest(f'foot_{s}') - rest(f'shin_{s}'), fwd, shin, front)
        world[f'foot_{s}'] = _turn(np.array([0.0, -0.93, -0.37]), up, foot, -shin)
    pose = Pose(yaw=yaw)
    for j, R in world.items():   # rest frames are the world's: a joint's local turn is its parent's undone
        parent = JOINTS[j][0]
        Rp = world.get(parent, np.eye(3))
        pose.quat[j] = Matrix((Rp.T @ R).tolist()).to_quaternion()
    W = pose.world()
    for s in 'LR':   # the arm solved to the captured wrist, its length the forge's own
        sh, el, wr = P[f'shoulder_{s}'], P[f'elbow_{s}'], P[f'wrist_{s}']
        full = np.linalg.norm(el - sh) + np.linalg.norm(wr - el)
        shoulder = np.array(W[f'uarm_{s}'].translation[:])
        reach = (rest(f'farm_{s}') - rest(f'uarm_{s}')).length + (rest(f'hand_{s}') - rest(f'farm_{s}')).length
        R0 = np.array(W['root'].to_3x3())
        target = shoulder + R0 @ ((wr - sh) * reach / full)
        line = _unit(wr - sh)
        pole = (el - sh) - line * ((el - sh) @ line)
        hand = _unit(P[f'hand_{s}'] - wr)
        thumb = P[f'thumb_{s}'] - wr
        thumb = thumb - hand * (thumb @ hand)
        back = np.cross(thumb, hand) if s == 'L' else np.cross(hand, thumb)
        solve_arm(pose, s, Vector(target), Vector(R0 @ pole if np.linalg.norm(pole) > 1e-4 else R0 @ np.array([0, 1, 0])), girdle=False,
                  hand_dir=Vector(R0 @ hand), hand_up=Vector(R0 @ back) if np.linalg.norm(back) > 1e-6 else None)
    poses.grounded(pose)
    return pose


def bake(caught):
    """A clip's frames as keys the forge plays (poses.py `MOVES`): each joint's local turn (a quaternion, w first) and
    the body's travel over the ground from where it stood, in the forge's metres. `caught` are face_front's frames, laid
    over the first frame's pelvis so the travel stays. A rig with weapon slots gives each hand's blade and edge too
    (`blade_R`, `edge_R`: ways in body space), so a weapon lies as the capture held it (poses.py `captured_blade`)."""
    from rig import rest
    import poses
    tall = rest('pelvis').z / max(caught[0]['pelvis'][2], 1e-6)   # the capture's hips at the forge's height
    out = []
    for pts in caught:
        pose = retarget(pts)
        poses.grounded_body(pose, arms=True)
        key = {j: [round(v, 5) for v in q] for j, q in sorted(pose.quat.items())}
        key['travel'] = [round(float(pts['pelvis'][0] * tall), 4), round(float(pts['pelvis'][1] * tall), 4)]
        for s in 'LR':
            if f'blade_{s}' in pts:
                for k in ('blade', 'edge'):
                    key[f'{k}_{s}'] = [round(float(v), 4) for v in _unit(pts[f'{k}_{s}'] - pts[f'hand_{s}'])]
        out.append(key)
    return out


# ---- seeing it ----

def stick(pts, w=120, h=150, side=False, k=None):
    """The captured frame as lines, seen from the front (the sprites' view 0) or from its right (`side`), its lowest
    point on the ground, `k` pixels a unit (by default, its height filling the picture)."""
    from PIL import Image, ImageDraw
    img = Image.new('RGBA', (w, h), (40, 40, 40, 255))
    d = ImageDraw.Draw(img)
    lo = min(p[2] for p in pts.values())
    hi = max(p[2] for p in pts.values())
    k = k or (h - 10) / max(hi - lo, 1e-6)

    def at(n):
        p = pts[n]
        return (w / 2 + (-p[1] if side else p[0]) * k, h - 5 - (p[2] - lo) * k)
    bones = [('pelvis', 'spine'), ('spine', 'chest'), ('chest', 'neck'), ('neck', 'head'), ('head', 'head_top')]
    for s in 'LR':
        bones += [('pelvis', f'hip_{s}'), (f'hip_{s}', f'knee_{s}'), (f'knee_{s}', f'ankle_{s}'),
                  (f'ankle_{s}', f'toe_{s}'), ('neck', f'shoulder_{s}'), (f'shoulder_{s}', f'elbow_{s}'),
                  (f'elbow_{s}', f'wrist_{s}'), (f'wrist_{s}', f'hand_{s}')]
    for a, b in bones:
        col = (230, 120, 80) if a.endswith('_L') or b.endswith('_L') else (110, 170, 230) if (
            a.endswith('_R') or b.endswith('_R')) else (220, 220, 220)
        d.line([at(a), at(b)], fill=col, width=2)
    return img


def frame_list(spec):
    """`--frames` read: each number, a run "first-last:step", a sub-frame with its fraction ("9.4"), or None for
    "all". A whole number stays an int."""
    if spec == 'all':
        return None
    frames = []
    for part in spec.split(','):
        if '.' in part:
            frames.append(float(part))
            continue
        run, _, step = part.partition(':')
        first, _, last = run.partition('-')
        frames += list(range(int(first), int(last or first) + 1, int(step or 1)))
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--asf', default='')
    ap.add_argument('--amc', default='')
    ap.add_argument('--fbx', default='', help='an FBX, BVH or glTF armature (Mixamo: "Without Skin")')
    ap.add_argument('--clip', default='', help="the clip to play from a file of many (a glTF library's)")
    ap.add_argument('--frames', default='1',
                    help='frame numbers, comma-separated, a run "first-last:step" (AMC frames count from 1), '
                         'a sub-frame "9.4" of an armature clip, or "all": every frame of a clip')
    ap.add_argument('--views', default='0,1,2', help="the sprites' views to render (0 front .. 4 back)")
    ap.add_argument('--out', required=True, help='a contact sheet (PNG), a row a frame; or a .gif, the frames played')
    ap.add_argument('--ms', type=int, default=50, help="with a .gif, each frame's time")
    ap.add_argument('--bake', default='', help="write the frames as the forge's keys under this animation's name")
    ap.add_argument('--keys', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs', 'moves.json'),
                    help="the keys file --bake writes into")
    ap.add_argument('--source', default='', help="with --bake: the clip's maker and licence, kept beside its keys")
    ap.add_argument('--pick', default='', help="with --bake: the frames to keep, counted from 0 over those read")
    ap.add_argument('--mirror', action='store_true', help="the clip left for right: its other arm does what it shows")
    ap.add_argument('--blade', default='', help="a rig with no weapon slot: the hand bone's axes its weapon runs along and "
                                                "its edge faces, as 'Z,Y'")
    ap.add_argument('--travel', type=float, default=1.0, help="with --bake: the share of the clip's travel kept")
    ap.add_argument('--home', type=int, default=None,
                    help="with --bake: from this picked frame on, the travel drawn back to where the clip stood")
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    frames = frame_list(args.frames)
    if args.amc:
        if any(f != int(f) for f in frames or ()):
            raise SystemExit('a sub-frame reads an armature clip (--fbx), never AMC')
        frames = None if frames is None else [int(f) for f in frames]
        every = cmu_frames(args.asf, args.amc)
        caught = every[::2] if frames is None else [every[min(f, len(every)) - 1] for f in frames]
    else:
        caught = armature_frames(args.fbx, frames, args.clip, tuple(args.blade.split(',')) if args.blade else None)
    if args.mirror:
        caught = [mirrored(p) for p in caught]
    gif = args.out.lower().endswith('.gif')
    if args.bake:   # one turn and one origin for the clip: its swing and its travel both stay
        turn, origin = heading(caught[0]), caught[0]['pelvis'] * np.array([1, 1, 0])
        keys = json.load(open(args.keys)) if os.path.exists(args.keys) else {}
        pick = [int(i) for i in args.pick.split(',')] if args.pick else list(range(len(caught)))
        # the clip's own frame numbers where they were named, a sub-frame's fraction kept
        picked = pick if frames is None else [frames[i] for i in pick]
        keys[args.bake] = {'clip': args.clip or os.path.basename(args.amc or args.fbx), 'picked': picked,
                           'source': args.source,
                           'keys': homed(bake([face_front(caught[i], turn, origin) for i in pick]), args.travel,
                                         args.home)}
        if args.travel != 1.0 or args.home is not None:
            keys[args.bake].update(travel=args.travel, home=args.home)
        caught = pick
        with open(args.keys, 'w') as f:
            f.write('{\n' + ',\n'.join(f' {json.dumps(k)}: ' + json.dumps(v) for k, v in sorted(keys.items())) + '\n}\n')
        print(f'{args.bake}: {len(caught)} frames -> {args.keys}')
        return None
    turn = heading(caught[0]) if gif else None
    caught = [face_front(p, turn) for p in caught]
    if gif:
        return play(caught, [int(v) for v in args.views.split(',')], args.out, args.ms)

    import bpy
    from PIL import Image

    import forge
    import stage
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(16)
    fighter = forge.Fighter('naked')
    tmp = os.path.join(tempfile.mkdtemp(), 'm.png')
    views = [int(v) for v in args.views.split(',')]
    rows = []
    for pts in caught:
        cells = [stick(pts), stick(pts, side=True)]
        for v in views:
            fighter.place(retarget(pts, forge.VIEW_YAW[v]), {'fist': {}})
            work = stage.render_rgba(tmp)
            cut = Image.fromarray(work)
            box = cut.getbbox() or (0, 0, 1, 1)
            bg = Image.new('RGBA', cut.size, (40, 40, 40, 255))
            bg.alpha_composite(cut)
            cells.append(bg.crop((max(box[0] - 4, 0), max(box[1] - 4, 0), box[2] + 4, box[3] + 4)))
        h = max(c.size[1] for c in cells)
        row = Image.new('RGBA', (sum(c.size[0] + 6 for c in cells), h), (25, 25, 25, 255))
        x = 0
        for c in cells:
            row.paste(c, (x, h - c.size[1]))
            x += c.size[0] + 6
        rows.append(row)
    sheet = Image.new('RGBA', (max(r.size[0] for r in rows), sum(r.size[1] + 6 for r in rows)), (25, 25, 25, 255))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.size[1] + 6
    sheet = sheet.resize((sheet.size[0] * 2, sheet.size[1] * 2), Image.NEAREST)
    sheet.save(args.out)
    print(f'{len(rows)} frames -> {args.out}')


def play(caught, views, out, ms):
    """The clip as an animated GIF: the captured skeleton, then the bare body from each view, every cell cut to the
    box its body fills over the whole clip, so the body moves only as the capture does."""
    import bpy
    from PIL import Image

    import forge
    import stage
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(16)
    fighter = forge.Fighter('naked')
    tmp = os.path.join(tempfile.mkdtemp(), 'm.png')
    works = {v: [] for v in views}
    for pts in caught:
        for v in views:
            fighter.place(retarget(pts, forge.VIEW_YAW[v]), {'fist': {}})
            works[v].append(Image.fromarray(stage.render_rgba(tmp)))
    boxes = {}
    for v, pics in works.items():
        bs = [p.getbbox() for p in pics if p.getbbox()]
        boxes[v] = (min(b[0] for b in bs) - 4, min(b[1] for b in bs) - 4, max(b[2] for b in bs) + 4, max(b[3] for b in bs) + 4)
    h = max(b[3] - b[1] for b in boxes.values())
    tall = max(max(p[2] for p in f.values()) - min(p[2] for p in f.values()) for f in caught)
    sticks = [stick(p, w=110, h=h, k=(h - 10) / tall) for p in caught]   # one scale for the clip
    frames = []
    for i in range(len(caught)):
        cells = [sticks[i]]
        for v in views:
            bg = Image.new('RGBA', works[v][i].size, (40, 40, 40, 255))
            bg.alpha_composite(works[v][i])
            cells.append(bg.crop(boxes[v]))
        sheet = Image.new('RGB', (sum(c.size[0] + 6 for c in cells), h), (25, 25, 25))
        x = 0
        for c in cells:
            sheet.paste(c.convert('RGB'), (x, h - c.size[1]))
            x += c.size[0] + 6
        frames.append(sheet.resize((sheet.size[0] * 3, sheet.size[1] * 3), Image.NEAREST))
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=ms, loop=0, optimize=True)
    print(f'{len(frames)} frames -> {out}')


if __name__ == '__main__':
    main()
