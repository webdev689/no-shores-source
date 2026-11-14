"""Cut the owner's own sword models into the forge's model file (models/orcish_swords.blend).

    python -I tools/sprite-forge/ownermodels.py --long <OrcishLongSword.blend> --short <orcish_shortsword.blend>

Each owner file holds one textured mesh, its blade up +Z, its flats toward -X and +X, its barbed edge toward -Y or +Y
(`MODELS` `edge`). Each is cut
into one object (`sword_orcish_long`, `sword_orcish_short`) in the forge's sword frame: its grip along +Z, the guard's
underside on the origin, the edge toward +X and the flats toward -Y and +Y, in metres. The long sword reaches as far
from the fist as the forge's steel sword (gear.py `SWORD_TIP`); the short sword reaches SHORT_REACH of that, as the
doll's own shortsword records reach of its longsword's. Each face takes a role by the owner's paint under it: the
blade, and the hilt's fittings, grip and wrap. The owner's texture stays in the owner's file: each role is a material
slot named `owner.<role>`, which the forge dresses in the metal's own materials (gear.py `owner_materials`). The mesh
is decimated to TRIS triangles, which is past a sprite's or the first person's texels."""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'models', 'orcish_swords.blend')
TRIS = 30000
SHORT_REACH = 0.71   # the doll's shortsword records reach 58 texels to its longsword's 82 (specs/doll-weapons.json)
FIST_UNDER = 0.012   # metres from the fist's middle up to the guard's underside, as the forge's swords hold it (gear.py)
SWORD_TIP = 1.045    # the forge's steel sword, fist to point (gear.py `SWORD_TIP`)
# each model's blade, read by its material or by where the section thins to the blade's own; the side its barbed edge
# faces (Y, -1 or 1), where the long sword's knuckle bow is too; and its paints (sRGB), each a role of the hilt. A face
# of the blade is the blade whatever its paint
MODELS = {
    'long': {'blade': 'material:Blade', 'edge': -1.0, 'paints': {
        'fit': [(48, 64, 40), (40, 48, 32), (40, 56, 32)], 'grip': [(64, 48, 24), (56, 40, 24)],
        'wrap': [(112, 40, 32), (104, 40, 32)]}},
    'short': {'blade': 'thin', 'edge': 1.0, 'paints': {
        'fit': [(64, 72, 48), (56, 64, 48), (56, 72, 48), (72, 64, 40), (64, 56, 40)], 'grip': [(56, 24, 16)]}},
}
ROLES = ('blade', 'fit', 'grip', 'wrap')   # gear.py OWNER_ROLES
THIN = 1.3   # the blade begins where the section across the flats is no thicker than this over the blade's own


def _arrays(me):
    """A mesh's vertices, each face's loops' vertices and UVs, and each face's material index and loop count."""
    n = len(me.polygons)
    v = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', v)
    lt = np.empty(n, dtype=np.int32)
    me.polygons.foreach_get('loop_total', lt)
    mi = np.empty(n, dtype=np.int32)
    me.polygons.foreach_get('material_index', mi)
    lv = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get('vertex_index', lv)
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get('uv', uv)
    return v.reshape(-1, 3), lv, uv.reshape(-1, 2), mi, lt


def _filled(img):
    """The texture's pixels (sRGB, 0..255, rows bottom first as Blender keeps them), each unpainted texel (the
    background off every UV island) the colour of the nearest painted one, so a face whose corner lies just off its
    island reads its island's paint. The background is the corners' colour that covers most of the texture: an island
    may reach a corner, but no paint covers as much as the background does."""
    from scipy import ndimage as ndi
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3] * 255.0
    near = [np.abs(px - c).max(axis=2) < 6.0 for c in px[[0, 0, -1, -1], [0, -1, 0, -1]]]
    blank = max(near, key=np.count_nonzero)
    _, (iy, ix) = ndi.distance_transform_edt(blank, return_indices=True)
    return px[iy, ix]


def _centres(v, lv, lt):
    """Each face's middle."""
    face = np.repeat(np.arange(len(lt)), lt)
    out = np.zeros((len(lt), 3))
    np.add.at(out, face, v[lv])
    return out / lt[:, None]


def _roles(model, v, lv, uv, mi, lt, names, px):
    """Each face's role (an index in ROLES), by the model's blade and its paints, and its paint. A face's paint is the
    one most of its corners and its middle read: a corner on its island's rim can read the next island's."""
    rec = MODELS[model]
    n = len(lt)
    face = np.repeat(np.arange(n), lt)
    fuv = np.zeros((n, 2))
    np.add.at(fuv, face, uv)
    fuv /= lt[:, None]
    h, w = px.shape[:2]

    def read(at):
        return px[np.clip((at[:, 1] % 1.0) * h, 0, h - 1).astype(int), np.clip((at[:, 0] % 1.0) * w, 0, w - 1).astype(int)]
    roles, colours = [], []
    for role, cs in rec['paints'].items():
        for c in cs:
            roles.append(ROLES.index(role))
            colours.append(c)
    colours = np.array(colours, dtype=np.float64)

    def role_of(paint):
        return np.array(roles)[np.argmin(((paint[:, None, :] - colours[None]) ** 2).sum(axis=2), axis=1)]
    paint = read(fuv)
    votes = np.zeros((n, len(ROLES)))
    np.add.at(votes, (np.arange(n), role_of(paint)), 1.5)   # the middle's breaks a tie
    np.add.at(votes, (face, role_of(read(uv))), 1.0)
    out = votes.argmax(axis=1)
    centre = _centres(v, lv, lt)
    if rec['blade'].startswith('material:'):
        blade = mi == names.index(rec['blade'].split(':', 1)[1])
        blade &= centre[:, 2] > _guard(v, centre, out)   # the hilt's own faces in the blade's material
    else:
        blade = centre[:, 2] > _blade_root(v)
    out[blade] = ROLES.index('blade')
    return out, paint


def _blade_root(v):
    """Where the blade begins up +Z: the lowest height from which the section across the flats (X) is no thicker than
    THIN times the blade's own (its upper half's median)."""
    z0, z1 = v[:, 2].min(), v[:, 2].max()
    edges = np.linspace(z0, z1, 241)
    thick = np.array([np.ptp(v[(v[:, 2] >= a) & (v[:, 2] < b), 0]) if ((v[:, 2] >= a) & (v[:, 2] < b)).any() else 0.0
                      for a, b in zip(edges[:-1], edges[1:])])
    own = np.median(thick[len(thick) // 2:])
    wide = np.nonzero(thick > THIN * own)[0]
    wide = wide[wide < len(thick) * 0.6]   # the hilt's, not a barb's near the point
    return float(edges[wide.max() + 1])


GRIP_SHARE = 0.15   # a section is the grip's where this share of its faces wear the grip's paint
GRIP_GAP = 2        # sections of another paint the grip runs on past (a band of wrap across it)


def _guard(v, centre, roles):
    """The guard's underside up +Z: the top of the grip, the lowest run of sections that wear its paint. A stray face
    of the grip's paint higher up (on the blade) is no part of it."""
    z0, z1 = v[:, 2].min(), v[:, 2].max()
    edges = np.linspace(z0, z1, 241)
    at = np.clip(np.searchsorted(edges, centre[:, 2]) - 1, 0, len(edges) - 2)
    total = np.bincount(at, minlength=len(edges) - 1)
    grip = np.bincount(at[roles == ROLES.index('grip')], minlength=len(edges) - 1)
    on = grip > GRIP_SHARE * np.maximum(total, 1)
    k = int(np.argmax(on))
    top, off = k, 0
    for j in range(k, len(on)):
        if on[j]:
            top, off = j, 0
        else:
            off += 1
            if off > GRIP_GAP:
                break
    return float(edges[top + 1])


def _axis(v, guard, length, edge):
    """The grip's line: a point on it and its direction up toward the blade, from the sections of the grip's upper
    two thirds. A D-guard's knuckle bow (on the edge's side, `edge` along Y) is cut off each section where an empty gap
    parts it from the grip."""
    pts = []
    for z in np.linspace(guard - 0.7 * length, guard - 0.1 * length, 12):
        s = v[np.abs(v[:, 2] - z) < 0.004 * length]
        if len(s) < 8:
            continue
        hist, e = np.histogram(s[:, 1], bins=24)
        empty = np.nonzero(hist == 0)[0]
        if len(empty):   # the bar past the widest empty run
            runs = np.split(empty, np.nonzero(np.diff(empty) > 1)[0] + 1)
            run = max(runs, key=len)
            s = s[s[:, 1] > e[run[-1] + 1]] if edge < 0 else s[s[:, 1] < e[run[0]]]
        pts.append(((s[:, 0].min() + s[:, 0].max()) / 2, (s[:, 1].min() + s[:, 1].max()) / 2, z))
    p = np.array(pts)
    kx, cx = np.polyfit(p[:, 2], p[:, 0], 1)
    ky, cy = np.polyfit(p[:, 2], p[:, 1], 1)
    d = np.array([kx, ky, 1.0])
    return np.array([kx * guard + cx, ky * guard + cy, guard]), d / np.linalg.norm(d)


def _frame(d, edge):
    """The turn from the owner's frame into the forge's: `d` onto +Z by the least turn, then the edge's side (`edge`
    along Y) onto +X."""
    z = np.array([0.0, 0.0, 1.0])
    k = np.cross(d, z)
    s, c = np.linalg.norm(k), float(d @ z)
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]]) / (s or 1.0)
    R = np.eye(3) + s * K + (1 - c) * K @ K
    turn = np.array([[0.0, edge, 0.0], [-edge, 0.0, 0.0], [0.0, 0.0, 1.0]])   # the edge's Y onto +X, about Z
    return turn @ R


def cut(path, model, reach):
    """The owner's `model` from `path` as a new object in this scene, in the forge's frame and size, its faces by
    role, decimated."""
    import bpy
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        dst.objects = list(src.objects)
    ob = next(o for o in dst.objects if o is not None and o.type == 'MESH')
    me = ob.data
    me.transform(ob.matrix_world)
    img = next(i for m in me.materials for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeTexImage'
               for i in [n.image] if i is not None)
    px = _filled(img)
    v, lv, uv, mi, lt = _arrays(me)
    roles, _ = _roles(model, v, lv, uv, mi, lt, [m.name for m in me.materials], px)
    guard = _guard(v, _centres(v, lv, lt), roles)
    edge = MODELS[model]['edge']
    at, d = _axis(v, guard, guard - v[:, 2].min(), edge)
    p = (v - at) @ _frame(d, edge).T
    s = (reach - FIST_UNDER) / p[:, 2].max()
    me.vertices.foreach_set('co', (p * s).ravel())
    used = [r for r in ROLES if (roles == ROLES.index(r)).any()]
    me.materials.clear()
    for r in used:   # a slot a role, dressed by the forge
        me.materials.append(bpy.data.materials.get(f'owner.{r}') or bpy.data.materials.new(f'owner.{r}'))
    me.polygons.foreach_set('material_index', np.array([used.index(ROLES[r]) for r in roles], dtype=np.int32))
    while me.uv_layers:   # the owner's texture is not drawn
        me.uv_layers.remove(me.uv_layers[0])
    me.update()
    work = bpy.data.objects.new('work', me)
    bpy.context.scene.collection.objects.link(work)
    dec = work.modifiers.new('decimate', 'DECIMATE')
    dec.ratio = min(1.0, TRIS / float((lt - 2).sum()))
    made = bpy.data.meshes.new_from_object(work.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(work, do_unlink=True)
    made.name = f'sword_orcish_{model}'
    made.shade_smooth()
    made.set_sharp_from_angle(angle=float(np.radians(40.0)))   # its edges and the hilt's facets kept crisp
    keep = bpy.data.objects.new(made.name, made)
    bpy.context.scene.collection.objects.link(keep)
    q = np.empty(len(made.vertices) * 3)
    made.vertices.foreach_get('co', q)
    q = q.reshape(-1, 3)
    print(f'{keep.name}: {len(made.polygons)} faces, scale {s:.4f}, z {q[:, 2].min():.3f}..{q[:, 2].max():.3f}, '
          f'x {q[:, 0].min():.3f}..{q[:, 0].max():.3f}, y {q[:, 1].min():.3f}..{q[:, 1].max():.3f}, '
          f'grip lean {np.degrees(np.arccos(d[2])):.1f} deg, roles {used}')
    return keep


def main():
    import bpy
    ap = argparse.ArgumentParser()
    ap.add_argument('--long', required=True, help="the owner's long sword (.blend)")
    ap.add_argument('--short', required=True, help="the owner's short sword (.blend)")
    ap.add_argument('--out', default=OUT)
    args = ap.parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0   # no .blend1 beside the model file
    keep = [cut(args.long, 'long', SWORD_TIP), cut(args.short, 'short', SHORT_REACH * SWORD_TIP)]
    for ob in list(bpy.data.objects):   # the owner's lights, cameras and empties stay in the owner's files
        if ob not in keep:
            bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.out), compress=True)
    print(f'wrote {args.out}')


if __name__ == '__main__':
    main()
