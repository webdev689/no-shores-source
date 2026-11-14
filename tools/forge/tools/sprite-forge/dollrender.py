"""The forge's weapons rendered into the paper doll's records (dollweapons.py fits each record). A weapon is the forge's
own make in its own frame - its grip at the origin, its business end up +Z, its flat in the XZ plane - turned and
scaled so its grip lies on the record's fist and its far end on the record's, its face the record's (`flip`), seen
square from the front by an orthographic eye, lit from the upper left as Daggerfall's pictures are. Each picture is the
record's own size, a texel's colour the one surface at its middle (hard edges, as a sprite's), its ground clear; the
left hand's fingers are cut across its grip where the record's are. A bow is drawn braced, its string a texel wide
from nock to nock (bowpics.py)."""
import math
import os

import numpy as np

HAND_HALF = 3.0   # the fist's half width across the weapon, where the fingers cut it
FILTER = 0.01   # texels a colour sample spreads over: one point a texel, so a blade two texels wide stays whole
STRING = (52, 40, 30, 255)   # a bow's string (bowpics.py's)


def _clear():
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)


def _mesh(name, v, t, mats, mat_index=None, smooth=True):
    import bpy
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.asarray(v).tolist(), [], np.asarray(t).tolist())
    for m in mats:
        me.materials.append(m)
    if mat_index is not None:
        me.polygons.foreach_set('material_index', list(mat_index))
    me.update()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _blunt(kind, metal, chain=None):
    import blunts3p
    roles = blunts3p.palette(metal)
    v, t, m = blunts3p.make(kind, metal, chain or blunts3p.CHAIN)
    used = sorted(set(m.tolist()))
    return [_mesh(f'{kind}_{metal}', v, t, [roles[blunts3p.ROLES[kind][k]] for k in used],
                  [used.index(k) for k in m.tolist()])]


def _bow(metal, shape):
    """The braced bow of bowpics.py, turned into the XZ plane (its bend along X), and its string's points."""
    import bows
    import bowpics
    import materials
    import metals
    parts = bowpics.pieces(metal, shape)
    P = metals.palette(metal)
    wood = metals._linear(bows.WOODS[metal]) if metal in bows.WOODS else (0.35, 0.17, 0.06)
    stuff = {'wood': materials.plain('wood', wood, rough=0.5), 'metal': P['metal'], 'head': P['metal'],
             'accent': P['accent'], 'grip': P['grip'], 'vein': P.get('blade_glow', P.get('glow', P['accent'])),
             'cord': materials.plain('cord', (0.42, 0.33, 0.2), rough=0.9)}
    obs = [_mesh('bow', np.asarray(v)[:, [1, 0, 2]], q, [stuff[kind]]) for v, q, kind in parts]
    cord = bowpics.string(parts)   # (y, z) from tip to tip
    return obs, np.stack([cord[:, 0], np.zeros(len(cord)), cord[:, 1]], axis=1)


def build(kind, metal, M, chain=None, short=False):
    """`metal`'s `kind` as Blender objects in the weapon's own frame, and a bow's string (else None); a flail's chain
    at `chain` (blunts3p.py `make`); a sword its short one (`short`) where the metal has one (gear.py `build_sword`)."""
    import daggers3p
    import gear
    if kind == 'sword':
        return gear.build_sword(M, metal, short=short), None
    if kind == 'dagger':
        return daggers3p.build(metal), None
    if kind in ('mace', 'flail', 'warhammer'):
        return _blunt(kind, metal, chain), None
    if kind == 'battleaxe':
        return gear.build_axe(M, metal), None
    if kind == 'staff':   # its metal is made grey for the game's dye (gear.py); the doll takes none, so its own colour
        import metals
        obs = gear.build_staff(M, metal)
        own = metals.palette(metal)['metal']
        for ob in obs:
            for i, m in enumerate(ob.data.materials):
                if m is not None and m.name.startswith('bowmetal.'):
                    ob.data.materials[i] = own
        return obs, None
    return _bow(metal, 'lb' if kind == 'longbow' else 'sb')


def _bounds(obs):
    """The objects' vertices in the weapon's frame (as made: none is moved yet)."""
    pts = []
    for ob in obs:
        mw = np.array(ob.matrix_world)
        v = np.array([tuple(p.co) for p in ob.data.vertices], dtype=np.float64)
        if len(v):
            pts.append(v @ mw[:3, :3].T + mw[:3, 3])
    return np.concatenate(pts)


def _turn(fit, flip):
    """The weapon frame's turn onto the picture (its +Z along the record's line, mirrored for `flip`): 3 x 3. A
    staff's line runs from its foot (`butt`) to its head."""
    g = np.asarray(fit['butt' if _by_ends(fit) else 'grip'], dtype=np.float64)
    u = np.asarray(fit['tip'], dtype=np.float64) - g
    u /= np.linalg.norm(u)
    phi = math.atan2(u[0], -u[1])
    c, sn = math.cos(phi), math.sin(phi)
    return np.array([[c, 0.0, sn], [0.0, 1.0, 0.0], [-sn, 0.0, c]]) @ np.diag([-1.0 if flip else 1.0, 1.0, 1.0])


def hanging(fit, flip):
    """A flail's chain hanging straight down from its eye in the record (blunts3p.py `make`'s `chain`): the swing that
    points it down the picture once the handle lies on the record's line, unbent. The forge's sprites swing it; on
    the doll it hangs by its ball's weight, as Daggerfall's does."""
    down = _turn(fit, flip).T @ np.array([0.0, 0.0, -1.0])
    return (math.degrees(math.atan2(down[0], down[2])), 0.0, 0.0)


def flail_reach(metal):
    """A flail's far end up its handle: the top of the eye its chain hangs from, which the record's far end marks."""
    import blunts3p
    import flails
    S = flails.shape(blunts3p.shape('flail'), metal)
    return S['haft_len'] + S['fer_len'] + S['eye_len']


def _by_ends(fit):
    """Whether a record's weapon is placed by its two ends: a staff, held anywhere along it, is as long as
    Daggerfall's from head to foot, where a weapon held at its grip is measured from the fist to its far end."""
    return fit['kind'] == 'staff' and 'butt' in fit


def place(obs, fit, flip, cord=None, reach=None):
    """Turn, mirror and move the weapon so its grip lies on the record's fist and its far end on the record's (`reach`
    up its +Z, else its own furthest point); answers the pixels a metre and the picture point of a weapon-frame point
    (for the string)."""
    from mathutils import Matrix
    w, h = fit['size']
    pts = _bounds(obs)
    if reach is None:
        reach = float(pts[:, 2].max()) if fit['kind'] not in ('longbow', 'shortbow') else float(np.abs(pts[:, 2]).max())
    g = np.asarray(fit['grip'], dtype=np.float64)
    tip = np.asarray(fit['tip'], dtype=np.float64)
    A = _turn(fit, flip)
    if _by_ends(fit):   # its head on the record's head, its foot on the record's foot, the hand where it falls
        foot = np.asarray(fit['butt'], dtype=np.float64)
        top, low = float(pts[:, 2].max()), float(pts[:, 2].min())
        s = float(np.linalg.norm(tip - foot)) / (top - low)
        loc = np.array([(tip[0] - w / 2) / s, 0.0, -(tip[1] - h / 2) / s]) - top * A[:, 2]
    else:
        s = float(np.linalg.norm(tip - g)) / reach
        loc = np.array([(g[0] - w / 2) / s, 0.0, -(g[1] - h / 2) / s])
    M4 = Matrix(((A[0, 0], A[0, 1], A[0, 2], loc[0]), (A[1, 0], A[1, 1], A[1, 2], loc[1]),
                 (A[2, 0], A[2, 1], A[2, 2], loc[2]), (0.0, 0.0, 0.0, 1.0)))
    for ob in obs:
        ob.matrix_world = M4 @ ob.matrix_world

    def pixel(p):
        q = A @ np.asarray(p, dtype=np.float64) + loc
        return (q[0] * s + w / 2, -q[2] * s + h / 2)
    return s, pixel


def _stage(w, h, s, samples, margin=0):
    import bpy
    from mathutils import Vector
    import stage
    sc = bpy.context.scene
    cam = bpy.data.objects.new('eye', bpy.data.cameras.new('eye'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(w + 2 * margin, h + 2 * margin) / s
    cam.location = (0.0, -10.0, 0.0)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)   # looking along +Y: right +X, up +Z
    sc.camera = cam
    for name in ('key', 'fill', 'top'):   # the forge's own lights (stage.py): its held weapons' light
        x, y, z, energy = stage.LIGHT[name]
        sun = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        sun.data.energy = energy
        sun.data.angle = 0.05
        sun.rotation_euler = Vector((x, y, z)).to_track_quat('-Z', 'Y').to_euler()
        sc.collection.objects.link(sun)
    sc.world = bpy.data.worlds.new('world')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.07, 0.07, 0.08, 1)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = stage.LIGHT['world']
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.filter_width = FILTER
    sc.cycles.use_denoising = False   # as the forge's stage: a denoiser smears a texel's light
    sc.render.dither_intensity = 0.0
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = w + 2 * margin, h + 2 * margin
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Standard'   # the forge's own film: Blender's default flattens a metal's light
    sc.view_settings.look = 'None'


def render_one(fit, kind, metal, samples, flip=None, margin=0):
    """One record in one metal: (h + 2 margin, w + 2 margin, 4) uint8, the record's box `margin` texels in from each
    side, its ground clear."""
    import bpy
    import materials
    from PIL import Image
    _clear()
    M = materials.palette()
    flip = fit.get('flip', False) if flip is None else flip
    chain = hanging(fit, flip) if kind == 'flail' else None
    import dollweapons
    obs, cord = build(kind, metal, M, chain, short=fit.get('template') in dollweapons.SHORT_BLADES)
    s, pixel = place(obs, fit, flip, reach=flail_reach(metal) if kind == 'flail' else None)
    w, h = fit['size']
    _stage(w, h, s, samples, margin)
    tmp = os.path.join(os.environ.get('TMPDIR', '/tmp'), f'.dollweapon-{os.getpid()}.png')   # each process its own
    bpy.context.scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    pic = np.array(Image.open(tmp).convert('RGBA'))
    os.remove(tmp)
    pic[..., 3] = np.where(pic[..., 3] > 127, 255, 0)
    pic[pic[..., 3] == 0] = 0
    w, h = w + 2 * margin, h + 2 * margin
    if cord is not None:   # the string, a texel wide, over the bow
        pts = [(x + margin, y + margin) for x, y in (pixel(p) for p in cord)]
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            for t in np.linspace(0.0, 1.0, int(max(abs(x1 - x0), abs(y1 - y0))) * 2 + 2):
                x, y = int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t)
                if 0 <= x < w and 0 <= y < h:
                    pic[y, x] = STRING
    cut_fingers(pic, fit, margin)
    return pic


def cut_fingers(pic, fit, margin=0):
    """Clear the texels across the grip where the record's fingers lie (`fingers`: distances from the fist toward the
    far end), within the fist's half width of the weapon's line; the record's box `margin` texels into `pic`."""
    if not fit.get('fingers'):
        return
    h, w = pic.shape[:2]
    g = np.asarray(fit['grip'], dtype=np.float64) + margin
    u = np.asarray(fit['tip'], dtype=np.float64) + margin - g
    u /= np.linalg.norm(u)
    n = np.array([-u[1], u[0]])
    ys, xs = np.mgrid[0:h, 0:w]
    p = np.stack([xs + 0.5 - g[0], ys + 0.5 - g[1]], axis=-1)
    along, across = p @ u, np.abs(p @ n)
    cut = np.zeros((h, w), dtype=bool)
    for f in fit['fingers']:
        cut |= (np.abs(along - f) <= 0.5) & (across <= HAND_HALF)
    pic[cut] = 0


def file_name(archive, record, metal, undyed):
    return f'{archive}_{record}-0.png' if metal == undyed else f'{archive}_{record}-0_{metal}.png'


MARGIN = 96   # texels round a record's box a weapon's picture also covers: a bow's limb or a staff past the box is drawn whole


def render_weapons(out, spec, metals, only, samples, ref):
    """Every record of both dolls in every metal asked, into `out`: each the whole weapon, cut to what it draws, its
    place on the doll written in it (dollarmourrender.py `write_placed`; `ref`, dollReference.mjs's, says where each
    record stands)."""
    import dollweapons
    import dollarmourrender
    import dollarmour as D
    os.makedirs(out, exist_ok=True)
    for archive, recs in sorted(spec.items()):
        for key, fit in sorted(recs.items(), key=lambda kv: int(kv[0])):
            record = int(key)
            if only and record not in only:
                continue
            off = ref[archive][key]['offset']
            origin = (off['x'] - D.ORIGIN[0] - MARGIN, off['y'] - D.ORIGIN[1] - MARGIN)
            for metal in metals:
                pic = render_one(fit, fit['kind'], metal, samples, margin=MARGIN)
                dollarmourrender.write_placed(out, file_name(archive, record, metal, dollweapons.UNDYED), pic,
                                              origin=origin)
