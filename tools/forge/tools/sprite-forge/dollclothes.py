"""The forge's wardrobe on the paper doll: each clothing template's doll records (TEXTURE.235-238 a woman's, 239-242 a
man's, by body shape) drawn as the garments the wardrobe makes for each of its variants (forgeWardrobe.js
GARMENTS_OF_TEMPLATE), so the pack and the doll show the clothes characters wear in the world. Every garment a body's
templates name is worn by the body dollarmour.py fitted to that doll body, posed once, its drapes hung over it. Each
variant's garments are then rendered together, the body held out, warped onto the doll's outline as the armour is
(dollarmourrender.py `warp_field`), and their cloth graded share for share onto the cloth of Daggerfall's own record
(its 0x60 band), laid grey on that band's steps for the item's dye (studioArt.js `dyeForgeDoll`). Gilt, fur and soles
keep their own colours. A cloak's first record, its inside drawn behind the body, is the cloak with the body hidden.

    ARENA2_PATH=... node tools/sprite-forge/dollReference.mjs /tmp/doll-ref.json
    python -I tools/sprite-forge/dollclothes.py --ref /tmp/doll-ref.json --out public/art/studio/forge/doll

`--bodies male:2` and `--templates 165,166` limit a run. Each picture is `<archive>_<record>-0.png`, the bare name: the
studio dyes the one grey picture for every dye the game asks a record by (forgeDollAsk.js `CLOTHING_DYES`)."""
import argparse
import base64
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
FIRST = {'male': 239, 'female': 235}   # a gender's first clothing archive; a body shape is its offset (paperdollArt.js)
BODIES = [f'{g}:{m}' for g in ('male', 'female') for m in range(4)]
CLASSES = ('garb', 'accent', 'other')   # the dye's cloth and hide; an accent in its own colour (trim, fur); the rest
CLOTH_BAND = (0x60, 0x6f)   # the band a clothing record's dye swaps, its brightest first
LEAST_CLOTH = 40   # texels: a record with less of the band than this is graded on its archive's cloth as a whole


def class_of(name):
    """A material's class by its name's first word (clothes.py `palette`): `garb.*` the dye's, `accent.*` its own."""
    head = name.split('.')[0]
    return head if head in ('garb', 'accent') else 'other'


def table():
    """Each clothing template as the game reads it: its archive, first record, variants, whether it is a cloak (its
    first record its inside), and its garments by variant (forgeWardrobe.js), read from the game's own modules."""
    js = """
    const root = process.argv[1];
    const { GARMENTS_OF_TEMPLATE } = await import(root + '/src/systems/studioArt/forgeWardrobe.js');
    const { isCloak } = await import(root + '/src/characters/paperdoll/paperdollArt.js');
    const { default: T } = await import(root + '/src/characters/itemTemplates.json', { with: { type: 'json' } });
    const out = {};
    for (const [index, garments] of Object.entries(GARMENTS_OF_TEMPLATE)) {
      const t = T.find((row) => row.index === Number(index));
      out[index] = { name: t.name, archive: t.playerTextureArchive, record: t.playerTextureRecord,
                     variants: t.variants, cloak: isCloak(t), garments };
    }
    console.log(JSON.stringify(out));
    """
    run = subprocess.run(['node', '--input-type=module', '-e', js, REPO], capture_output=True, text=True, check=True)
    return {int(k): v for k, v in json.loads(run.stdout).items()}


def jobs_of(rows, gender, templates=None):
    """A body's records and what each draws: (record, garments, inside), a cloak's first record its inside."""
    out = []
    for t, row in sorted(rows.items()):
        if row['archive'] != FIRST[gender] or (templates and t not in templates):
            continue
        lists = row['garments']
        first = row['record'] + (1 if row['cloak'] else 0)
        for v in range(max(1, row['variants'])):
            out.append((first + v, tuple(lists[v % len(lists)].split(' ')), False))
        if row['cloak']:   # its inside, drawn behind the body: the cloak its first variant names
            out.append((row['record'], tuple(lists[0].split(' ')), True))
    return out


def dress(gender, names, f):
    """The fitted body wearing every garment in `names`, posed and widened as fitted, its drapes hung over it: (the
    dressed body, its own objects, garment -> its objects)."""
    import bpy
    from mathutils import Matrix
    import clothes
    import drape
    import layers
    import rig
    from dollarmourrender import facing
    bpy.ops.wm.read_factory_settings(use_empty=True)
    layers.load_body(gender)
    W = layers.Dressed(gender)
    W.skins[0].woman = gender == 'female'   # her garments where they differ from his (clothes.py WOMAN)
    own = [sk.ob for sk in W.skins[1:]]   # the body's own shells (the face's paint): never drawn, the doll has its head
    worn, hangs = {}, []
    for name in sorted(names, key=clothes.order_of):
        made = clothes.wear(name, W.skins[0], grey=True)
        shells = [m for m in made if not isinstance(m, drape.Drape)]
        drapes = [m for m in made if isinstance(m, drape.Drape)]
        if drapes:
            layers.hang_over(W, name, drapes)
        W.skins += shells
        worn[name] = [s.ob for s in shells] + [d.ob for d in drapes]
        hangs += drapes
    W.place(facing(rig.Pose(rot={j: tuple(v) for j, v in f['rot'].items()}, yaw=f['yaw'])),
            {'fist': {'L': True, 'R': True}})
    for d in hangs:
        d.frame = 0
        d.update(W.W, W)
    widen = Matrix.Diagonal((f['width'], 1.0, 1.0, 1.0))
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            ob.matrix_world = widen @ ob.matrix_world
    return W, own, worn


def _class_material(cls):
    """A flat colour that names `cls` in an id render (`_ids`), whatever the light."""
    import bpy
    name = f'id.cloth.{cls}'
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


def _ids(obs):
    """Each texel's class (`CLASSES`, from 1; 0 none) as the shown objects `obs` stand."""
    import dollarmourrender as R
    pic = R._flat(obs, lambda mat: _class_material(class_of(mat.name)))
    k = np.clip(np.round(pic[..., 0] / 40.0), 0, len(CLASSES)).astype(np.int32)
    return np.where(pic[..., 3] > 0, k, 0)


def cloth_target(ref, archive, record):
    """The grey steps Daggerfall's own record draws its cloth in (`CLOTH_BAND`, its brightest the top step), as the
    greys the dye reads (`(grey * 16) >> 8` the step): the record's own, or its archive's where it has too little."""
    def steps(rec):
        idx = np.frombuffer(base64.b64decode(rec['index']), dtype=np.uint8).astype(np.int64)
        on = (idx >= CLOTH_BAND[0]) & (idx <= CLOTH_BAND[1])
        return (CLOTH_BAND[1] - idx[on]) * 16 + 8
    own = steps(ref[str(archive)][str(record)])
    if own.size >= LEAST_CLOTH:
        return own.astype(np.float64)
    return np.concatenate([steps(r) for r in ref[str(archive)].values()]).astype(np.float64)


def finish(pic, ids, target):
    """A record's render graded as Daggerfall shades its own: the cloth's tone share for share onto the record's
    cloth (`cloth_target`), its texture laid back over it as the armour's is, then on the band's nearest step, grey for
    the dye. An accent, gilt, fur and a sole are drawn as rendered, at the forge's light."""
    import dollarmourrender as R
    out = pic.copy()
    on = pic[..., 3] > 0
    ids = R.clean_ids(pic, ids)
    rgb = pic[..., :3].astype(np.float64)
    lum = rgb.mean(axis=2)
    garb = on & (ids == CLASSES.index('garb') + 1)
    rest = on & ~garb
    if rest.any():
        out[rest, :3] = np.clip(np.round(R._unexposed(rgb[rest])), 0, 255).astype(np.uint8)
    if garb.any():
        tone = R._tone(lum, garb)
        graded = R.share_grade(tone, target)
        at = np.percentile(tone, R.SHARES)
        slope = np.gradient(np.percentile(target, R.SHARES)) / np.maximum(np.gradient(at), 1.0)
        want = graded + R.TONE[1] * np.interp(tone, at, slope) * (lum[garb] - tone)
        step = np.clip(np.floor(want / 16.0), 0, 15)
        out[garb, :3] = (step * 16 + 8).astype(np.uint8)[:, None]
        # an accent never lands exactly grey, so the dye never takes it for cloth
        acc = rest & (out[..., 0] == out[..., 1]) & (out[..., 1] == out[..., 2])
        out[acc, 0] = np.minimum(out[acc, 0].astype(np.int32) + 1, 255).astype(np.uint8)
    return out


def classic_mask(rec, shape):
    """Daggerfall's own record's texels (its hair mask not counted) on the render's canvas."""
    import dollarmour as D
    import dollarmourrender as R
    m = np.zeros(shape, dtype=bool)
    x0, y0 = rec['offset']['x'] - D.ORIGIN[0] + R.MARGIN, rec['offset']['y'] - D.ORIGIN[1] + R.MARGIN
    m[y0:y0 + rec['height'], x0:x0 + rec['width']] = [[c not in '09' for c in row] for row in rec['rows']]
    return m


def hooded(garments):
    """Whether garments wear a hood up (a hooded cloak, the hooded robe), which hides the doll's hair."""
    return any('hooded' in g for g in garments)


def render_body(key, ref, spec, rows, out, samples, templates=None):
    """Every clothing record of body `key` (`gender:shape`), written under `out`."""
    import bpy
    import dollarmour as D
    import dollarmourrender as R
    gender, morph = key.split(':')
    archive = FIRST[gender] + int(morph)
    f = spec[key]
    jobs = jobs_of(rows, gender, templates)
    if not jobs:
        return
    W, own, worn = dress(gender, {g for _, gs, _ in jobs for g in gs}, f)
    R._stage(f, samples, R.MARGIN)
    body = R._body(W)
    garments = {ob for obs in worn.values() for ob in obs}
    for ob in bpy.context.scene.objects:   # the body's own shells, the drapes' envelopes: never drawn
        if ob.type == 'MESH' and ob not in body and ob not in garments:
            ob.hide_render = True
    for ob in own:
        ob.hide_render = True
    # the body's outline as fitted, and the field that carries it onto the doll's
    for ob in garments:
        ob.hide_render = True
    sc = bpy.context.scene
    keep, sc.cycles.samples = sc.cycles.samples, 1
    try:
        outline = R._render()[..., 3] > 0
    finally:
        sc.cycles.samples = keep
    doll = R.doll_outline(ref, key, outline)
    field = R.warp_field(outline, doll)
    head = R.doll_head(ref, key)
    face = R.doll_face(ref, D.FIRST[gender] + int(morph), head)   # what a helm leaves showing: a hood's opening too
    combos = {}
    for rec, gs, inside in jobs:
        combos.setdefault((gs, inside), []).append(rec)
    for (gs, inside), recs in combos.items():
        shown = [ob for g in gs for ob in worn[g]]
        for ob in garments:
            ob.hide_render = ob not in shown
        for ob in body:   # held out, so only what lies before it shows; hidden for a cloak's inside behind it
            ob.is_holdout, ob.hide_render = not inside, inside
        pic, ids = R.warp(R._render(), field), R.warp(_ids(shown), field)
        for rec in recs:
            r = ref[str(archive)][str(rec)]
            done = R.unstray(R.unhair(finish(pic, ids, cloth_target(ref, archive, rec))))
            if not done[..., 3].any():
                print(f'{archive}_{rec}: {"+".join(gs)} draws nothing', flush=True)
                continue
            whole = R.cover(done, classic_mask(r, done.shape[:2]), doll)
            # a hood hides the doll's hair as a helm does: all of the head it leaves bare but the face
            hidden = R.hair_mask(head, whole[..., 3] > 0, face) if hooded(gs) and not inside else None
            R.write_placed(out, R.file_name(archive, rec, None), whole, hidden,
                           R.file_name(archive, rec, None, 'Mask') if hidden is not None else None)
    for ob in body:
        ob.is_holdout, ob.hide_render = False, False


def main():
    import dollarmour as D
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--bodies', default=','.join(BODIES))
    ap.add_argument('--templates', default='')
    ap.add_argument('--samples', type=int, default=24)
    args = ap.parse_args()
    ref = json.load(open(args.ref))
    spec = json.load(open(D.SPEC))
    rows = table()
    templates = {int(t) for t in args.templates.split(',') if t} or None
    os.makedirs(args.out, exist_ok=True)
    for key in [k for k in args.bodies.split(',') if k]:
        render_body(key, ref, spec, rows, args.out, args.samples, templates)


if __name__ == '__main__':
    main()
