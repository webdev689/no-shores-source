"""The forge's armour rendered into the paper doll's records (dollarmour.py fits each doll body). Each set is worn by the
forge's body in the fitted pose and each piece rendered alone over the whole doll canvas, the body and the bare hands
held out so only what lies before them shows, seen square from the front and lit from the upper left as Daggerfall's
doll is, then warped onto the doll's outline (`warp_field`). Its metal is rendered grey and graded share for share onto
the shading of the doll's own records of that piece, then laid on the metal band's steps for the game to dye (`finish`).
Each of the piece's records is cut from that canvas at its own box, so it stands where Daggerfall's stands."""
import base64
import math
import os

import numpy as np

# what a material's name says it is (armour.py `palette`): plate and trim, mail, leather; anything else (a seam's
# glow, horn, fur, a slit's dark) is drawn as rendered
CLASSES = ('metal', 'armourmail', 'leather', 'other')
CLASS_OF = {'metal': 'metal', 'armourmail': 'armourmail', 'leather': 'leather', 'crimson': 'leather'}


def class_of(name):
    return CLASS_OF.get(name.split('.')[0], 'other')


SHARES = np.array([0.5, 2, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 98, 99.5])


def share_grade(lum, target):
    """`lum` share for share onto `target`'s values: its darkest texels as dark as the target's darkest share, its
    brightest as bright as its brightest."""
    src = np.percentile(lum, SHARES) + np.arange(len(SHARES)) * 1e-3
    return np.interp(lum, src, np.percentile(target, SHARES))


def targets(ref, archive, records):
    """The shading the doll's own records of a piece are drawn in, by class: the metal band's greys of its plate and its
    chain records, the brightness of its leather records' other texels. `records` is the piece's (leather, plate,
    chain) records (dollarmour.py RECORDS)."""
    pal = np.asarray(ref['palette'], dtype=np.float64)
    out = {}
    for cls, recs, band in (('leather', records[0], False), ('metal', records[1], True), ('armourmail', records[2], True)):
        vals = []
        for r in recs:
            rec = ref[str(archive)].get(str(r))
            if rec is None:
                continue
            idx = np.frombuffer(base64.b64decode(rec['index']), dtype=np.uint8)
            on = (idx >= 0x70) & (idx <= 0x7f) if band else (idx > 0) & (idx < 255) & ((idx < 0x70) | (idx > 0x7f))
            vals.append(pal[idx[on]].mean(axis=1))
        vals = np.concatenate(vals) if vals else np.zeros(0)
        if vals.size:
            out[cls] = vals
    return out


def _tone(lum, m):
    """`lum`'s tone within material `m`, texel by texel: the median over `TONE[0]` texels, those past its edge taking
    their nearest's (fpforge.py `tone`), so each face keeps its edges and its light and loses its mottle."""
    from scipy import ndimage as ndi
    _, (iy, ix) = ndi.distance_transform_edt(~m, return_indices=True)
    return ndi.median_filter(lum[iy, ix], size=TONE[0])[m]


HUE_FLOOR = 8.0   # light under which a texel's hue fades to grey as it is relit: a near-black's tint is noise


def _relit(rgb, lum, want):
    """Colours `rgb` (light `lum`) brought to light `want`, keeping their hue: near black, a texel's tint fades to grey
    (`HUE_FLOOR`), so a render's (1, 1, 2) relit is a dark grey, never a blue."""
    return np.clip(np.round((rgb + HUE_FLOOR) / (lum + HUE_FLOOR)[:, None] * want[:, None]), 0, 255).astype(np.uint8)


def _unexposed(rgb):
    """Colours as the forge's stage renders them: `EXPOSURE` undone, through the film's own sRGB curve."""
    lin = np.where(rgb <= 10.31, rgb / 3294.6, ((rgb / 255 + 0.055) / 1.055) ** 2.4) * 2 ** -EXPOSURE
    return np.where(lin <= 0.0031308, lin * 3294.6, (1.055 * np.power(lin, 1 / 2.4) - 0.055) * 255)


def unsliver(ids, on):
    """Each texel's class with a sliver of one material a texel wide inside another (a fleece edge, a strap seen edge
    on) taken as the material round it: graded alone, a line that thin reads as stitching at the doll's size."""
    from scipy import ndimage as ndi
    keep = np.zeros(ids.shape, dtype=bool)
    for k in range(1, len(CLASSES) + 1):
        m = ids == k
        keep |= ndi.binary_opening(m, structure=np.ones((2, 2), dtype=bool)) & m
    if not (on & ~keep).any() or not (on & keep).any():
        return ids
    _, (iy, ix) = ndi.distance_transform_edt(~(on & keep), return_indices=True)
    return np.where(on & ~keep, ids[iy, ix], ids)


def clean_ids(pic, ids):
    """Each covered texel's class: one the id render misses by a hair takes its nearest's, a sliver the one round it
    (`unsliver`)."""
    from scipy import ndimage as ndi
    on = pic[..., 3] > 0
    if (on & (ids == 0)).any():
        _, (iy, ix) = ndi.distance_transform_edt(ids == 0, return_indices=True)
        ids = ids[iy, ix]
    return unsliver(ids, on)


def finish(pic, ids, material, target, visor=False):
    """A piece's render graded as Daggerfall shades the piece (`targets`): plate share for share onto its plate records'
    band, mail onto its chain records', a leather set's leather onto its leather records' light, keeping its hue. A set
    graded in its own colours (armour.py `SET_GRADE`'s ramps: elven gold, dwarven bronze, daedric black) lays that light
    across its ramp. A plate or mail set's straps and under-suit take the forge's own leather grade; a helm's (`visor`)
    is its padding, seen through its slits, and takes the metal's darkest. The metal is then laid grey on the band's
    nearest step for the game to dye (layers.py `dyeable`); own colours are never grey, so no dye touches them."""
    import armour
    import layers
    out = pic.copy()
    on = pic[..., 3] > 0
    ids = clean_ids(pic, ids)
    rgb = pic[..., :3].astype(np.float64)
    lum = rgb.mean(axis=2)
    own = (armour.SET_GRADE.get(material) or {})
    for k, cls in enumerate(CLASSES):
        m = on & (ids == k + 1)
        if cls == 'other' and m.any():   # drawn as rendered, at the light the forge renders it in
            out[m, :3] = np.clip(np.round(_unexposed(rgb[m])), 0, 255).astype(np.uint8)
            continue
        if not m.any() or cls not in target:
            continue
        # a set in its own colours wears its mail in them too: a ring the dye's colour beside its plate's reads wrong
        mine = own.get('metal' if cls in ('metal', 'armourmail') and 'ramp' in (own.get('metal') or {}) else cls) or {}
        if cls == 'leather' and armour.STYLE[material].get('kind') != 'leather':
            # a plate or mail set's straps and under-suit: a few texels of many colours, drawn as the forge's sprites
            # draw them (its own grade over the render's light), never stretched across the leather records' light
            shown = _unexposed(rgb)
            seen = shown.mean(axis=2)
            tone = _tone(seen, m)
            seen_m = tone + TONE[1] * (seen[m] - tone)   # by its tone: a strap's lit rim never a pale stitch
            if 'ramp' in mine:
                src, colours = mine['ramp']
                colours = np.asarray(colours, dtype=np.float64)
                out[m, :3] = np.clip(np.round(np.stack([np.interp(seen_m, src, colours[:, c]) for c in range(3)],
                                                       axis=1)), 0, 255).astype(np.uint8)
                continue
            want = np.interp(seen_m, *(mine.get('lum') or armour.LEATHER_GRADE['lum']))
            out[m, :3] = _relit(shown[m], seen[m], want)
            continue
        tone = _tone(lum, m)
        graded = share_grade(tone, target[cls])
        # its texture laid back as far as the grade stretches the light there, so a rim finer than a texel adds a step,
        # never leaps to the band's top (a dark dye's palest greys, which read as stitching)
        at = np.percentile(tone, SHARES)
        slope = np.gradient(np.percentile(target[cls], SHARES)) / np.maximum(np.gradient(at), 1.0)
        want = graded + TONE[1] * np.interp(tone, at, slope) * (lum[m] - tone)
        if 'ramp' in mine:   # its own colours, the classic's light laid across the ramp's own run, darkest to brightest
            colours = np.asarray(mine['ramp'][1], dtype=np.float64)
            light = colours.mean(axis=1) + np.arange(len(colours)) * 1e-3
            lo, hi = float(target[cls].min()), float(target[cls].max())
            want = light[0] + (want - lo) / max(hi - lo, 1.0) * (light[-1] - light[0])
            out[m, :3] = np.clip(np.round(np.stack([np.interp(want, light, colours[:, c]) for c in range(3)], axis=1)),
                                 0, 255).astype(np.uint8)
        elif cls == 'leather':
            out[m, :3] = _relit(rgb[m], lum[m], want)
        else:
            out[m, :3] = np.clip(np.round(want), 0, 255).astype(np.uint8)[:, None]
    if visor and armour.STYLE[material].get('kind') != 'leather' and 'metal' in target:
        # in the helm's shadow, as Daggerfall draws a visor's slits: lit, the padding reads as pale patches on the metal
        pad = on & (ids == CLASSES.index('leather') + 1)
        ramp = (own.get('metal') or {}).get('ramp')
        out[pad, :3] = np.asarray(ramp[1][0]) if ramp else np.uint8(np.min(target['metal']))
        ids = np.where(pad, CLASSES.index('metal') + 1, ids)
    if 'ramp' in (own.get('metal') or {}):   # its metal in its own colours, never the dye's
        out = layers.dyeable(out, ids, list(CLASSES), ())
        return unglint(layers.despeck(out, ids, list(CLASSES), ('metal', 'armourmail')))
    return unglint(layers.dyeable(out, ids, list(CLASSES), ('metal', 'armourmail')))


GLINT = 40   # how much brighter than the light round it a texel-thin line is a glint, not a face's light (a band step ~10)


def unglint(pic):
    """`pic` with its glints put out: a rim or a strap's edge a texel thin that is `GLINT` brighter than a 2x2 opening
    keeps there takes its nearest steady texel's colour. Daggerfall's doll draws its highlights as blobs on a face; a
    lit line a texel wide reads as stitching. A texel taken is another's colour whole, so a band grey stays one."""
    from scipy import ndimage as ndi
    on = pic[..., 3] > 0
    lum = np.where(on, pic[..., :3].astype(np.float64).mean(axis=2), 0.0)
    glint = on & (lum - ndi.grey_opening(lum, size=(2, 2)) > GLINT)
    if not glint.any():
        return pic
    _, (iy, ix) = ndi.distance_transform_edt(~(on & ~glint), return_indices=True)
    out = pic.copy()
    out[glint] = pic[iy[glint], ix[glint]]
    return out


# where a forge piece's part is drawn on the doll: Daggerfall's pauldrons carry the upper arm's plates and its greaves
# the belt's and hips', so the cuirass's rerebraces and couters go with the pauldron of their side, its tassets and the
# mail skirt with the greaves
MOVED = {'rere': 'pauldron', 'couter': 'pauldron', 'tasset': 'greaves'}


def _pieces(A, skins):
    """The set's objects by doll piece: the pauldrons split left and right (the forge's L is the body's own left)."""
    by = {}
    for ob in [ob for ob, _ in A.parts] + [c for _, c in A.covers]:
        if not ob.name.startswith('armour_'):
            continue
        bits = ob.name[len('armour_'):].split('.')
        head = bits[0]
        part = bits[1] if len(bits) > 1 else ''
        side = 'L' if part.endswith('_L') or 'L' in bits[1:2] else 'R'
        moved = MOVED.get(part.split('_')[0])
        if moved:
            head = moved
        if head in ('pauldrons', 'pauldron'):
            head = f'pauldron_{side}'
        by.setdefault(head, []).append(ob)
    by.setdefault('greaves', []).extend(sk.ob for sk in skins[1:])   # the mail skirt, worn at the hips
    return by


REGION = {'uarm': 'pauldron', 'farm': 'pauldron', 'clav': 'pauldron', 'hand': 'gauntlets', 'thigh': 'greaves',
          'shin': 'greaves', 'foot': 'boots', 'pelvis': 'greaves', 'root': 'greaves'}   # else the cuirass's


def split_under(sk):
    """The set's under-suit (its mail or leather under the plates) cut into the doll's pieces by the joint each face
    follows most: its sleeves with the pauldron of their side, its hips and legs with the greaves, the rest with the
    cuirass. Each part is its own object, posed as the suit stands. Answers piece -> [object]."""
    import bpy
    import bmesh
    lead = np.asarray(sk.w).argmax(axis=1)
    region = []
    for j in (sk.joints[i] for i in range(len(sk.joints))):
        base, _, side = j.partition('_')
        r = REGION.get(base, 'cuirass')
        region.append(f'pauldron_{side or "R"}' if r == 'pauldron' else r)
    out = {}
    me0 = sk.ob.data
    faces = [tuple(p.vertices) for p in me0.polygons]
    for name in sorted(set(region)):
        keep = [k for k, f in enumerate(faces) if np.bincount([lead[v] for v in f]).argmax() in
                [i for i, r in enumerate(region) if r == name]]
        if not keep:
            continue
        me = me0.copy()
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        drop = set(range(len(bm.faces))) - set(keep)
        bmesh.ops.delete(bm, geom=[bm.faces[k] for k in drop], context='FACES')
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(f'{sk.ob.name}.{name}', me)
        ob.matrix_world = sk.ob.matrix_world
        bpy.context.scene.collection.objects.link(ob)
        out.setdefault(name, []).append(ob)
    sk.ob.hide_render = True
    return out


FILTER = 1.5   # texels a colour sample spreads over: the doll is drawn smooth, so a rivet or a mail ring finer than a
# texel is light averaged into its texel, never a speck (the forge's small sprites point-sample: their edges crisp)
TONE = (3, 0.35)   # a face is graded by its tone (the median over this many texels), its texture laid back at this share
EXPOSURE = -1.5   # stops under the light: polished plate (mithril's) stays under white, so `finish` can grade its glints
MARGIN = 16   # texels round the doll's canvas a render also covers: a box may stand past it (a helm over the head)


def _stage(f, samples, margin=0):
    import bpy
    from mathutils import Vector
    import dollarmour as D
    import stage
    W, H = D.CANVAS[0] + 2 * margin, D.CANVAS[1] + 2 * margin
    k = f['scale']
    cx, cy = f['root'][0] + margin, f['root'][1] + margin
    sc = bpy.context.scene
    cam = bpy.data.objects.new('eye', bpy.data.cameras.new('eye'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(W, H) / k
    cam.location = ((W / 2 - cx) / k, -10.0, (cy - H / 2) / k)
    cam.rotation_euler = (math.radians(90), 0.0, 0.0)
    sc.camera = cam
    for name in ('key', 'fill', 'top'):   # the forge's own lights (stage.py), so what keeps the forge's grade reads the same
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
    sc.cycles.use_denoising = False   # as the forge's stage: a denoiser smears a texel's light, and the ids' colours
    sc.render.dither_intensity = 0.0
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = W, H
    sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = 'Standard'   # the forge's own: Blender's default film flattens the metal's light
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = EXPOSURE


def _render():
    import bpy
    from PIL import Image
    tmp = os.path.join(os.environ.get('TMPDIR', '/tmp'), f'.dollarmour-{os.getpid()}.png')   # each process its own
    bpy.context.scene.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    pic = np.array(Image.open(tmp).convert('RGBA'))
    os.remove(tmp)
    pic[..., 3] = np.where(pic[..., 3] > 127, 255, 0)
    pic[pic[..., 3] == 0] = 0
    return pic


def _id_material(cls):
    """A flat colour that names `cls` in an id render (`_ids`), whatever the light."""
    import bpy
    name = f'id.{cls}'
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    v = ((CLASSES.index(cls) + 1) * 40) / 255.0
    lin = v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    em.inputs['Color'].default_value = (lin, lin, lin, 1.0)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m


def _flat(obs, material, view='Standard'):
    """One render of the shown objects `obs` with each material swapped for `material(it)`, then given back: flat
    colours as they are (no exposure, `view`), one point a texel, so each texel is what lies at its middle."""
    import bpy
    sc = bpy.context.scene
    kept = []
    for ob in obs:
        if ob.type != 'MESH' or ob.hide_render:
            continue
        for i, slot in enumerate(ob.material_slots):
            if slot.material is None:
                continue
            mat = slot.material
            kept.append((ob, i, mat, slot.link))
            slot.link = 'OBJECT'   # on this object alone: a mesh shared with a hidden one keeps its own
            slot.material = material(mat)
    v = sc.view_settings
    keep = sc.cycles.samples, v.exposure, sc.cycles.filter_width, v.view_transform
    sc.cycles.samples, v.exposure, sc.cycles.filter_width, v.view_transform = 1, 0.0, 0.01, view
    try:
        return _render()
    finally:
        sc.cycles.samples, v.exposure, sc.cycles.filter_width, v.view_transform = keep
        for ob, i, mat, link in reversed(kept):
            ob.material_slots[i].material = None
            ob.material_slots[i].link = link


def _ids(obs):
    """Each texel's class (`CLASSES`, from 1; 0 none) as the shown objects `obs` stand: each material swapped for its
    class's flat colour for one render."""
    pic = _flat(obs, lambda mat: _id_material(class_of(mat.name)))
    k = np.clip(np.round(pic[..., 0] / 40.0), 0, len(CLASSES)).astype(np.int32)
    return np.where(pic[..., 3] > 0, k, 0)


def _normal_material():
    """Each point's facing as the camera sees it, as a colour (`_normals`)."""
    import bpy
    if 'id.normal' in bpy.data.materials:
        return bpy.data.materials['id.normal']
    m = bpy.data.materials.new('id.normal')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    turn = nt.nodes.new('ShaderNodeVectorTransform')
    turn.vector_type, turn.convert_from, turn.convert_to = 'NORMAL', 'WORLD', 'CAMERA'
    half = nt.nodes.new('ShaderNodeVectorMath')
    half.operation = 'MULTIPLY_ADD'
    half.inputs[1].default_value = half.inputs[2].default_value = (0.5, 0.5, 0.5)
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(geo.outputs['Normal'], turn.inputs['Vector'])
    nt.links.new(turn.outputs['Vector'], half.inputs[0])
    nt.links.new(half.outputs['Vector'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return m


def _normals(obs):
    """Each texel's facing (x right, y up, z to the viewer) as the shown objects `obs` stand; a texel its one point
    misses takes its nearest's."""
    from scipy import ndimage as ndi
    pic = _flat(obs, lambda mat: _normal_material(), view='Raw')
    n = pic[..., :3].astype(np.float64) / 127.5 - 1.0
    n[..., 2] *= -1.0   # Cycles' camera looks down its own +z
    hit = pic[..., 3] > 0
    if hit.any() and not hit.all():
        _, (iy, ix) = ndi.distance_transform_edt(~hit, return_indices=True)
        n = n[iy, ix]
    return n / np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-6)


SHINE = {'key': (-0.25, 0.3, 0.92), 'ambient': 0.08, 'diffuse': 0.55, 'gloss': 0.9, 'sharp': 20.0,
         'smooth': 1.0, 'fold': 0.3, 'seam': 0.5, 'speck': 3, 'least': 10}
# plate lit as Daggerfall's records light theirs: a key from the front, up and to the left, a gloss where a plate faces
# it; its facing smoothed over `smooth` texels, and a texel where it folds past `fold` (1 - cos) darkened to `seam`.
# A texel turned from `speck` of the four beside it is a rivet or a facet's sliver, and a seam of fewer than `least`
# texels is a fleck: neither is where one plate meets the next (`seams`)
BESIDE = ((0, 1), (1, 0), (0, -1), (-1, 0))


def turns(normals, on):
    """How far each plate texel turns from each plate texel beside it (1 - cos; 0 where that one is not plate)."""
    out = []
    for step in BESIDE:
        near = np.roll(on, step, axis=(0, 1)) & on
        out.append(np.where(near, 1.0 - (normals * np.roll(normals, step, axis=(0, 1))).sum(axis=2), 0.0))
    return np.stack(out)


def seams(normals, on):
    """Where one plate meets the next: plate texels folding from one beside them past `SHINE['fold']`, in lines. A
    texel turned from nearly all round it takes its neighbours' facing first, a line broken by one texel is joined, and
    a piece shorter than `SHINE['least']` is dropped. Darkened, each of those read as a black fleck or a stitch."""
    from scipy import ndimage as ndi
    normals = normals.copy()
    turn = turns(normals, on)
    speck = on & ((turn > SHINE['fold']).sum(axis=0) >= SHINE['speck'])
    if speck.any():
        kept = (on & ~speck).astype(np.float64)
        cross = np.array([[0, 1, 0], [1, 0, 1], [0, 1, 0]], dtype=np.float64)
        mean = np.stack([ndi.convolve(normals[..., c] * kept, cross, mode='constant') for c in range(3)], axis=-1)
        normals[speck] = mean[speck] / np.maximum(np.linalg.norm(mean[speck], axis=1, keepdims=True), 1e-6)
        turn = turns(normals, on)
    seam = on & (turn.max(axis=0) > SHINE['fold'])
    for line in (np.ones((1, 3), dtype=bool), np.ones((3, 1), dtype=bool)):
        seam |= on & ndi.binary_closing(seam, structure=line)
    parts, count = ndi.label(seam, structure=np.ones((3, 3)))
    if count:
        seam &= np.bincount(parts.ravel())[parts] >= SHINE['least']
    return seam


def chrome(pic, ids, n):
    """`pic` with its plate's light taken from its facing (`_normals`, `SHINE`): each plate bright down its middle, dark
    at its rims, glossed where it faces the key, a dark seam where one plate meets the next, as Daggerfall's records
    draw plate. The forge's lights fall nearly evenly across a plate, and that even light, graded onto the band, breaks
    into patches of one step and the next (a dye's black beside its blue); a facet finer than a texel, lit alone, is a
    speck. A mail's rings keep the render's light."""
    from scipy import ndimage as ndi
    on = (pic[..., 3] > 0) & (clean_ids(pic, ids) == CLASSES.index('metal') + 1)
    if not on.any():
        return pic
    m = on.astype(np.float64)
    weight = np.maximum(ndi.gaussian_filter(m, SHINE['smooth']), 1e-6)
    soft = np.stack([ndi.gaussian_filter(n[..., c] * m, SHINE['smooth']) for c in range(3)], axis=-1) / weight[..., None]
    soft /= np.maximum(np.linalg.norm(soft, axis=2, keepdims=True), 1e-6)
    key = np.asarray(SHINE['key'], dtype=np.float64)
    key /= np.linalg.norm(key)
    half = key + np.array([0.0, 0.0, 1.0])
    half /= np.linalg.norm(half)
    light = (SHINE['ambient'] + SHINE['diffuse'] * np.clip(soft @ key, 0.0, 1.0)
             + SHINE['gloss'] * np.clip(soft @ half, 0.0, 1.0) ** SHINE['sharp'])
    light = np.where(seams(n, on), light * SHINE['seam'], light)
    out = pic.copy()
    out[on, :3] = np.clip(np.round(light[on] * 255), 0, 255).astype(np.uint8)[:, None]
    return out


def facing(pose):
    """`pose` with its head square to the camera: Daggerfall's doll turns its body and looks straight at the viewer,
    its face drawn full on, so a helm on the head shows its face full on too, its visor over the doll's face."""
    W = pose.world()
    pose.quat['head'] = W['neck'].to_quaternion().inverted()
    return pose


def wear(gender, material, f):
    """The fitted body wearing `material`'s set, posed and widened as fitted: (the dressed body, its pieces)."""
    import bpy
    from mathutils import Matrix
    import armour
    import layers
    import rig
    bpy.ops.wm.read_factory_settings(use_empty=True)
    layers.load_body(gender)
    A = layers.Dressed(gender)
    mat, skins = armour.dress(A.M, A.skins[0], A.parts, material, woman=gender == 'female')
    A.skins += skins
    style = armour.STYLE[material]
    if style.get('kind', 'plate') == 'plate':   # a mail glove under the plates, as the first-person gauntlet's
        style = {**style, 'glove': 'mail'}   # (fparmour.py): Daggerfall's doll draws a plate set's fist all metal
    A.covers = armour.gauntlet_hands(A.hands, mat, style)
    A.place(facing(rig.Pose(rot={j: tuple(v) for j, v in f['rot'].items()}, yaw=f['yaw'])), {'fist': {'L': True, 'R': True}})
    by = _pieces(A, skins)
    for piece, obs in split_under(skins[0]).items():
        by.setdefault(piece, []).extend(obs)
    widen = Matrix.Diagonal((f['width'], 1.0, 1.0, 1.0))
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            ob.matrix_world = widen @ ob.matrix_world
    return A, by


def render_set(A, by, f, samples):
    """Each piece of the worn set over the whole doll canvas: piece -> ((H, W, 4) uint8, its classes `_ids`), and the
    body's own outline as it stands under them. What the pose hides (the open hands' gauntlets under the fists') stays
    hidden."""
    import bpy
    _stage(f, samples, MARGIN)
    for ob in [sk.ob for sk in A.skins[1:4]]:   # the face's painted shells: not drawn, the doll has its own head
        ob.hide_render = True
    every = [ob for obs in by.values() for ob in obs]
    A.posed_out = {ob.name for ob in every if ob.hide_render}
    body = _body(A)
    for ob in bpy.context.scene.objects:   # anything else the body carries (its weapon, its bow) is not drawn
        if ob.type == 'MESH' and ob not in body and ob not in every:
            ob.hide_render = True
    out = {piece: draw_piece(A, by, piece) for piece in by}
    for ob in every:
        ob.hide_render = True
    for ob in body:
        ob.is_holdout = False
    sc = bpy.context.scene
    keep, sc.cycles.samples = sc.cycles.samples, 1
    try:
        outline = _render()[..., 3] > 0
    finally:
        sc.cycles.samples = keep
    return out, outline


def _body(A):
    """The body and its bare hands, held out of every piece's render."""
    return [A.skins[0].ob] + [ob for kinds in A.hands.values() for ob in kinds.values()]


def draw_piece(A, by, piece):
    """One piece of the worn set alone over the canvas, the body held out: ((H, W, 4) uint8, its classes), its plate
    lit by its facing (`chrome`)."""
    for ob in _body(A):
        ob.is_holdout = True
    for ob in (ob for obs in by.values() for ob in obs):
        ob.hide_render = ob not in by[piece] or ob.name in A.posed_out
    pic, ids = _render(), _ids(by[piece])
    return chrome(pic, ids, _normals(by[piece])), ids


def helm_width(classes, rows):
    """How wide a picture's texels (`classes`, a mask) stand across `rows` (`helm_rows`): the middle of its rows'
    widths, so a helm is measured where it wraps the head, never at a brim, a crest or a horn."""
    widths = [int(np.ptp(np.flatnonzero(classes[y]))) + 1 for y in rows if classes[y].any()]
    return float(np.median(widths)) if widths else 0.0


HELM_BAND = (0.25, 0.75)   # the middle of the head, crown to chin, a helm's width is read over


def helm_rows(head, face, band=HELM_BAND):
    """The doll's head's rows over the middle of its height, from its crown (its hair's top) to its chin (its face's
    foot): where a helm wraps the head."""
    top = int(np.flatnonzero(head.any(axis=1)).min())
    chin = int(np.flatnonzero(face.any(axis=1)).max()) + 1
    return range(top + int((chin - top) * band[0]), top + int((chin - top) * band[1]))


def classic_helm_width(ref, archive, rows):
    """How wide Daggerfall's own helms stand across the head on this body: the middle of its helm records' widths,
    their hair masks not counted."""
    import dollarmour as D
    widths = []
    for rec in D.RECORDS['helm'][0]:
        r = ref[str(archive)][str(rec)]
        x0, y0 = r['offset']['x'] - D.ORIGIN[0] + MARGIN, r['offset']['y'] - D.ORIGIN[1] + MARGIN
        m = np.zeros((D.CANVAS[1] + 2 * MARGIN, D.CANVAS[0] + 2 * MARGIN), dtype=bool)
        m[y0:y0 + r['height'], x0:x0 + r['width']] = [[c not in '09' for c in row] for row in r['rows']]
        widths.append(helm_width(m, rows))
    widths = [w for w in widths if w]
    return float(np.median(widths)) if widths else 0.0


def fit_helm(A, by, pic, ids, field, want, rows):
    """The helm drawn no wider across the head than Daggerfall's (`want`): measured as the doll draws it (warped, its
    horns and crests not counted), and if wider, narrowed about its middle in the scene and drawn again, its height
    kept so it still crowns the head. The forge sizes a helm for its own head, and Daggerfall's doll heads are narrow
    for their bodies, so a helm drawn full on would stand wider than the doll's own helms."""
    from mathutils import Matrix, Vector
    plate = np.isin(clean_ids(pic, ids), [CLASSES.index(c) + 1 for c in ('metal', 'armourmail', 'leather')])
    have = helm_width(plate & (pic[..., 3] > 0), rows)
    if not have or not want or have <= want:
        return pic, ids
    k = want / have
    print(f'helm {have:g} texels across the head, Daggerfall\'s {want:g}: drawn at {k:.2f}', flush=True)
    pts = np.concatenate([np.array([tuple(ob.matrix_world @ v.co) for v in ob.data.vertices]) for ob in by['helm']
                          if ob.type == 'MESH' and len(ob.data.vertices)])
    mid = Vector(tuple((pts.min(axis=0) + pts.max(axis=0)) / 2))
    shrink = Matrix.Translation(mid) @ Matrix.Diagonal((k, 1.0, 1.0, 1.0)) @ Matrix.Translation(-mid)   # across alone
    for ob in by['helm']:
        ob.matrix_world = shrink @ ob.matrix_world
    pic, ids = draw_piece(A, by, 'helm')
    return warp(pic, field), warp(ids, field)


WARP = {'iters': 600, 'sigma': 2.0, 'reach': 24.0, 'most': 24.0}   # the warp's steps, its smoothing (texels), how far an
# outline pulls and the furthest a texel moves


def warp_field(moving, fixed, iters=WARP['iters'], sigma=WARP['sigma'], reach=WARP['reach'], most=WARP['most']):
    """A smooth field that carries outline `moving` onto `fixed` (demons on their signed distances): for each texel of
    the result, how far down and across to read it from. The pose fit leaves the forge body a few texels off the
    doll's at its edges (a shoulder, a splayed foot); the field closes that, and every piece worn over the body moves
    with it."""
    from scipy import ndimage as ndi

    def sdf(m):
        return np.clip(ndi.distance_transform_edt(~m) - ndi.distance_transform_edt(m), -reach, reach)
    M, F = sdf(moving), sdf(fixed)
    h, w = M.shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    uy, ux = np.zeros((h, w)), np.zeros((h, w))
    for _ in range(iters):
        Mw = ndi.map_coordinates(M, [yy + uy, xx + ux], order=1, mode='nearest')
        gy, gx = np.gradient(Mw)
        d = Mw - F
        den = gx * gx + gy * gy + d * d + 1e-6
        ux = ndi.gaussian_filter(ux - d * gx / den, sigma)
        uy = ndi.gaussian_filter(uy - d * gy / den, sigma)
        r = np.hypot(ux, uy)
        k = np.minimum(1.0, most / np.maximum(r, 1e-9))
        ux, uy = ux * k, uy * k
    return uy, ux


def warp(pic, field):
    """`pic` read through `field` (`warp_field`), each texel its nearest source's: a render's crisp texels stay
    whole."""
    uy, ux = field
    h, w = pic.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    iy = np.clip(np.round(yy + uy).astype(np.int64), 0, h - 1)
    ix = np.clip(np.round(xx + ux).astype(np.int64), 0, w - 1)
    return pic[iy, ix]


def doll_head(ref, key):
    """The doll's head picture's texels (its face and its hair) on the render's canvas, its margin round it."""
    import dollarmour as D
    rec = ref['bodies'][key]['head']
    off = rec.get('offset') or {'x': 0, 'y': 0}
    out = np.zeros((D.CANVAS[1], D.CANVAS[0]), dtype=bool)
    m = D._mask(rec)
    x0, y0 = off['x'] - D.ORIGIN[0], off['y'] - D.ORIGIN[1]
    out[y0:y0 + m.shape[0], x0:x0 + m.shape[1]] |= m
    return np.pad(out, MARGIN)


HAIR = 3   # texels past the forge's own bare head a doll's head texel is hair: the warp leaves it, a helm's mask takes it


def doll_outline(ref, key, forge):
    """The doll body's outline (dollarmour.py `target`) on the render's canvas, its margin round it, less its hair: the
    head's texels past the forge body's own head (`forge`, its outline as fitted), which no warp should pull the head
    over (a woman's braids)."""
    import dollarmour as D
    from scipy import ndimage as ndi
    m = np.pad(D.target(ref, key), MARGIN)
    hair = doll_head(ref, key) & ~ndi.binary_dilation(forge, iterations=HAIR)
    return m & ~hair


def doll_hair(ref, key, forge):
    """The doll's hair on the render's canvas: its head's texels past the forge body's own bare head (`forge`, its
    outline as fitted), and those joined to them in the same palette ramp - a head draws its hair in one ramp at its
    rim and its face in several, so the hair over a temple, inside the forge head's outline, is hair too."""
    import base64
    import dollarmour as D
    from scipy import ndimage as ndi
    rec = ref['bodies'][key]['head']
    off = rec.get('offset') or {'x': 0, 'y': 0}
    idx = np.zeros((D.CANVAS[1], D.CANVAS[0]), dtype=np.uint8)
    pic = np.frombuffer(base64.b64decode(rec['index']), dtype=np.uint8).reshape(rec['height'], rec['width'])
    x0, y0 = off['x'] - D.ORIGIN[0], off['y'] - D.ORIGIN[1]
    idx[y0:y0 + rec['height'], x0:x0 + rec['width']] = pic
    idx = np.pad(idx, MARGIN)
    head = (idx > 0) & (idx < 255)
    past = head & ~ndi.binary_dilation(forge, iterations=HAIR)
    if not past.any():
        return past
    ramp = idx >> 4
    own = np.bincount(ramp[past]).argmax()
    ys, xs = np.nonzero(head)   # its face: the middle third across, the middle of its height down
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    face = np.zeros_like(head)
    face[y0 + (y1 - y0) * 2 // 5:y0 + (y1 - y0) * 4 // 5, x0 + (x1 - x0) // 3:x1 - (x1 - x0) // 3] = True
    face &= head
    if face.any() and np.bincount(ramp[face]).argmax() == own:   # its face in the same ramp (an Argonian's frills)
        return past
    parts, _ = ndi.label(head & (ramp == own), np.ones((3, 3), dtype=bool))
    joined = np.unique(parts[ndi.binary_dilation(past) & (parts > 0)])
    return past | np.isin(parts, joined[joined > 0])


def doll_face(ref, archive, head):
    """The doll's face on the render's canvas: the texels of its head that any of Daggerfall's helm records for this
    body leaves showing - neither hidden by its hair mask (palette 255) nor under the helm itself. A circlet or the
    hair on the crown every helm hides is no face."""
    import dollarmour as D
    face = np.zeros(head.shape, dtype=bool)
    for rec in D.RECORDS['helm'][0]:
        r = ref[str(archive)][str(rec)]
        x0, y0 = r['offset']['x'] - D.ORIGIN[0] + MARGIN, r['offset']['y'] - D.ORIGIN[1] + MARGIN
        unseen = np.zeros(head.shape, dtype=bool)
        unseen[y0:y0 + r['height'], x0:x0 + r['width']] = [[c != '0' for c in row] for row in r['rows']]
        face |= head & ~unseen
    return face


def hair_mask(head, helm, face):
    """Where a helm hides the doll's head: every texel of the head the helm (`helm`) leaves uncovered but its face
    (`doll_face`) - the hair, a circlet, the scalp past a helm drawn to the head's size - as Daggerfall's helm records
    mask all of the head but the face."""
    return head & ~helm & ~face


COVER = 3   # texels: how far past its edge a piece is carried over the doll's body where Daggerfall's record covers it


def cover(cut, classic, body, reach=COVER):
    """A record's picture carried a few texels over the doll's body (`body`) where Daggerfall's own record (`classic`)
    covers it and the forge's misses it by a hair, each texel its nearest's: a toe or an elbow never shows bare at an
    edge the classic covers."""
    from scipy import ndimage as ndi
    on = cut[..., 3] > 0
    if not on.any():
        return cut
    dist, (iy, ix) = ndi.distance_transform_edt(~on, return_indices=True)
    fill = classic & body & ~on & (dist <= reach)
    out = cut.copy()
    out[fill] = cut[iy[fill], ix[fill]]
    return out


def unhair(pic, passes=2):
    """`pic` with its hairs taken off: a texel with two or fewer of its eight neighbours drawn is a strap's loose end or
    a line finer than a texel (a sash's tail, a crest's wire), which at the doll's size reads as a scratch."""
    from scipy import ndimage as ndi
    out = pic.copy()
    ring = np.ones((3, 3), dtype=np.int32)
    ring[1, 1] = 0
    for _ in range(passes):
        on = out[..., 3] > 0
        thin = on & (ndi.convolve(on.astype(np.int32), ring, mode='constant') <= 2)
        if not thin.any():
            break
        out[thin] = 0
    return out


STRAY = 8   # texels: a group of a piece's texels smaller than this, joined to none of the rest, is a stray


def unstray(pic, least=STRAY):
    """`pic` with its strays taken off: a horn's tip or a wing's end the render breaks from its piece (a line finer
    than a texel drawn in dashes) floats beside the piece as a speck. The piece's largest part always stays."""
    from scipy import ndimage as ndi
    parts, n = ndi.label(pic[..., 3] > 0, np.ones((3, 3), dtype=bool))
    if n < 2:
        return pic
    size = np.bincount(parts.ravel())
    size[0] = 0
    stray = (size < least) & (np.arange(n + 1) != size.argmax())
    out = pic.copy()
    out[stray[parts]] = 0
    return out


def records_for(piece, material):
    """The doll records `material`'s `piece` is drawn in, and the name its picture carries after them
    (dollarmour.py `token`)."""
    import dollarmour as D
    groups = dict(zip(('Leather', 'plate', 'Chain'), D.RECORDS[piece]))
    return groups[material if material in ('Leather', 'Chain') else 'plate'], D.token(material)


def file_name(archive, record, dye, map_=None):
    """A doll picture's name as the texture door asks it: `<archive>_<record>-0[_<dye>][_<map>].png`."""
    return f'{archive}_{record}-0' + (f'_{dye}' if dye else '') + (f'_{map_}' if map_ else '') + '.png'


def render_all(out, ref, spec, keys, sets, samples, shields=True):
    import bpy  # noqa: F401 - Blender's own modules (mathutils) come with it
    import armour
    import dollarmour as D
    os.makedirs(out, exist_ok=True)
    if shields and not sets:
        render_shields(out, ref, keys, samples)
    for key in keys:
        gender, morph = key.split(':')
        archive = D.FIRST[gender] + int(morph)
        recs = ref[str(archive)]
        f = spec[key]
        field = None
        for material in sets or armour.MATERIALS:
            A, by = wear(gender, material, f)
            pics, outline = render_set(A, by, f, samples)
            if field is None:   # the same body in the same pose under every set
                body = doll_outline(ref, key, outline)
                field = warp_field(outline, body)
                head, hair = doll_head(ref, key), doll_hair(ref, key, outline)
                face = doll_face(ref, archive, head)
            pics = {p: (warp(pic, field), warp(ids, field)) for p, (pic, ids) in pics.items() if p in D.RECORDS}
            if 'helm' in pics:
                rows = helm_rows(head, head & ~hair)   # crown to chin, never the braids below it
                pics['helm'] = fit_helm(A, by, *pics['helm'], field, classic_helm_width(ref, archive, rows), rows)
            for piece, (pic, ids) in pics.items():
                # each piece as Daggerfall shades its own records: a helm under the top light stays the helms' grey
                pic = finish(pic, ids, material, targets(ref, archive, D.RECORDS[piece]), visor=piece == 'helm')
                pic = unstray(unhair(pic))
                hidden = hair_mask(head, pic[..., 3] > 0, face) if piece == 'helm' else None
                todo, dye = records_for(piece, material)
                if not pic[..., 3].any():
                    continue
                for rec in todo:
                    r = recs[str(rec)]
                    x0, y0 = r['offset']['x'] - D.ORIGIN[0] + MARGIN, r['offset']['y'] - D.ORIGIN[1] + MARGIN
                    classic = np.zeros(pic.shape[:2], dtype=bool)
                    classic[y0:y0 + r['height'], x0:x0 + r['width']] = [[c not in '09' for c in row] for row in r['rows']]
                    whole = cover(pic, classic, body)
                    write_placed(out, file_name(archive, rec, dye), whole, hidden,
                                 file_name(archive, rec, dye, 'Mask') if hidden is not None else None)


def write_placed(out, name, pic, hidden=None, mask_name=None, origin=(-MARGIN, -MARGIN)):
    """A piece's whole picture, cut to what it draws (and what its mask hides), its place on the doll written in it
    (`oFFs`, the doll's own pixels; `origin` the doll's place of `pic`'s top left): the doll draws it whole there,
    never cut to Daggerfall's box for the record. A helm's mask (`hidden`, the hair under it) is written beside it at
    the same size and place."""
    import stage
    on = pic[..., 3] > 0
    ys, xs = np.nonzero(on | (hidden if hidden is not None else False))
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    at = (int(x0) + origin[0], int(y0) + origin[1])
    path = os.path.join(out, name)
    stage.write_png(path, np.ascontiguousarray(pic[y0:y1, x0:x1]), at)
    print(path, flush=True)
    if mask_name is None:
        return
    mask = np.zeros((y1 - y0, x1 - x0, 4), dtype=np.uint8)
    mask[hidden[y0:y1, x0:x1], 3] = 255
    path = os.path.join(out, mask_name)
    stage.write_png(path, mask, at)
    print(path, flush=True)


SHIELDS = (('buckler', 33), ('round', 34), ('kite', 35), ('tower', 36))
SHIELD_METALS = ('Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')
TURNS = (-45.0, -30.0, -15.0, 0.0, 15.0, 30.0)   # the turns a shield is tried at, about its up
SHIELD_MARGIN = 8   # texels round a shield record's box its picture also covers


PLANKS = {'dark': (0.07, 0.035, 0.015), 'light': (0.2, 0.1, 0.04), 'across': 9.0, 'grain': 40.0}   # a wooden face's
# boards: their darkest and lightest brown (linear), boards a metre across, grain a metre along


def planks():
    """A wooden shield's face as boards side by side, each a little lighter or darker and grained along its length, a dark
    seam between: drawn plain, a flat face takes one light and reads as painted card at the doll's size."""
    import bpy
    m = bpy.data.materials.new('wood.planks')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.6
    co = nt.nodes.new('ShaderNodeTexCoord')
    board = nt.nodes.new('ShaderNodeTexWave')   # a saw across: each board dark at one seam, lighter to the next
    board.wave_type, board.bands_direction, board.wave_profile = 'BANDS', 'X', 'SAW'
    board.inputs['Scale'].default_value = PLANKS['across']
    board.inputs['Distortion'].default_value = 0.0
    nt.links.new(co.outputs['Object'], board.inputs['Vector'])
    grain = nt.nodes.new('ShaderNodeTexNoise')   # the grain: a noise drawn out along the boards
    grain.inputs['Scale'].default_value = PLANKS['grain']
    grain.inputs['Detail'].default_value = 3.0
    stretch = nt.nodes.new('ShaderNodeMapping')
    stretch.inputs['Scale'].default_value = (1.0, 1.0, 0.12)
    nt.links.new(co.outputs['Object'], stretch.inputs['Vector'])
    nt.links.new(stretch.outputs['Vector'], grain.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY_ADD'
    mix.inputs[1].default_value = 0.6
    nt.links.new(board.outputs['Fac'], mix.inputs[0])
    nt.links.new(grain.outputs['Fac'], mix.inputs[2])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (*PLANKS['dark'], 1)
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = (*PLANKS['light'], 1)
    nt.links.new(mix.outputs['Value'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def shield_picture(kind, metal, rec, turn, samples, target=None):
    """`metal`'s `kind` of shield in a doll record: its face toward the viewer turned `turn` degrees about its up, as
    tall as the record's own shield and stood at its middle; graded onto `target` (`finish`) when given. The picture
    is the record's box and `SHIELD_MARGIN` round it, so a rim past the box is drawn whole."""
    import bpy
    from mathutils import Matrix
    import armour
    import materials
    import shields3p
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = materials.palette()
    M['wood'] = planks()
    obs = shields3p.build(kind, metal, M, armour.palette(metal, M))
    turn_m = Matrix.Rotation(math.radians(turn), 4, 'Z')
    for ob in obs:
        ob.matrix_world = turn_m @ ob.matrix_world
    pts = []
    for ob in obs:
        mw = np.array(ob.matrix_world)
        v = np.array([tuple(p.co) for p in ob.data.vertices], dtype=np.float64)
        pts.append(v @ mw[:3, :3].T + mw[:3, 3])
    pts = np.concatenate(pts)
    ys, xs = np.nonzero(np.array([[c != '0' for c in row] for row in rec['rows']], dtype=bool))
    k = float(ys.max() - ys.min() + 1) / float(pts[:, 2].max() - pts[:, 2].min())
    cx = (xs.min() + xs.max() + 1) / 2
    cy = (ys.min() + ys.max() + 1) / 2
    mx = (pts[:, 0].min() + pts[:, 0].max()) / 2
    mz = (pts[:, 2].min() + pts[:, 2].max()) / 2
    f = {'scale': k, 'root': [cx - mx * k, cy + mz * k]}
    w, h = rec['width'], rec['height']
    import dollarmour as D
    keep = D.CANVAS
    D.CANVAS = (w, h)
    try:
        _stage(f, samples, SHIELD_MARGIN)
    finally:
        D.CANVAS = keep
    pic = _render()
    if target is None:
        return pic
    return finish(pic, _ids(obs), metal, target)


def render_shields(out, ref, keys, samples):
    """Every shield kind in every metal in every body's doll records, each turned as the record's best fits."""
    import dollarmour as D
    os.makedirs(out, exist_ok=True)
    m = SHIELD_MARGIN
    for key in keys:
        gender, morph = key.split(':')
        archive = D.FIRST[gender] + int(morph)
        for kind, record in SHIELDS:
            rec = ref[str(archive)][str(record)]
            w, h = rec['width'], rec['height']
            want = np.array([[c != '0' for c in row] for row in rec['rows']], dtype=bool)
            best = max(TURNS, key=lambda t: _overlap(shield_picture(kind, 'Steel', rec, t, 8)[m:m + h, m:m + w, 3] > 0,
                                                     want))
            target = targets(ref, archive, ((), (record,), ()))
            origin = (rec['offset']['x'] - D.ORIGIN[0] - m, rec['offset']['y'] - D.ORIGIN[1] - m)
            for metal in SHIELD_METALS:
                pic = shield_picture(kind, metal, rec, best, samples, target)
                write_placed(out, file_name(archive, record, D.token(metal)), pic, origin=origin)


def _overlap(a, b):
    return (a & b).sum() / max(1, (a | b).sum())
