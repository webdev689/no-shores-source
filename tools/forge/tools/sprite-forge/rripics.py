"""Roleplay & Realism: Items' pictures, rendered by the forge: the Hatchet (513) and the Short Flail (514) in each of
their ten metals, and the light set's jacket, trousers, cap, half-boots, gloves and armguards (520-526) in leather,
fur-lined leather and leather plated in each metal, every cap with its hair's mask. The game asks each by the name,
size and place src/systems/roleplayRealismItems/rriIndex.js keeps, and the pack shows the same picture, so each is
drawn into exactly that box on the doll and its place written in it (`oFFs`). A file is the name with `rri-` before it
(`rri-520_10-0_Iron.png`), so the studio never wears it as a texture of its own: the mod's door does
(src/systems/roleplayRealismItems/rriArt.js).

The weapons are the forge's own makes cut down (axes.py, flails.py), in their metal's own colours, held as the forge's
doll battleaxe is (dollweapons.py, specs/doll-weapons.json): its grip on the doll's fist along that record's line, the
fingers cut where its record's are, at the fitted doll body's own scale. The armour is worn by the forge body fitted
to each doll body (dollarmour.py), rendered alone with the body held out, warped onto the doll's outline and graded
onto the shading of Daggerfall's own records of the matching piece, as the forge's doll armour is
(dollarmourrender.py); its leather keeps its colour and its plates lie on their metal's own ramp. Nothing of
Daggerfall's pictures is kept: the fit reads their outlines, the grade their shading, a cap's mask the doll's hair.

    ARENA2_PATH=... node tools/sprite-forge/dollReference.mjs /tmp/doll-ref.json
    python -I tools/sprite-forge/rripics.py --ref /tmp/doll-ref.json --out public/art/studio/forge/rri

`--only 513,522` renders those archives alone."""
import argparse
import json
import math
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
METALS = ('Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony', 'Orcish', 'Daedric')
UNDYED = 'Silver'   # Silver's dye is Unchanged: its picture is the record's bare name
NAME = re.compile(r'^(\d{3})_(\d+)-0(?:_(?!Mask)([A-Z][a-z]+))?(_Mask)?$')


def sprites():
    """Every picture the game asks for, read from the game's own index: name -> [width, height, x, y, ...]."""
    js = """
    const { RRI_SPRITES } = await import(process.argv[1] + '/src/systems/roleplayRealismItems/rriIndex.js');
    console.log(JSON.stringify(RRI_SPRITES));
    """
    run = subprocess.run(['node', '--input-type=module', '-e', js, REPO], capture_output=True, text=True, check=True)
    return json.loads(run.stdout)


def parse(name):
    """A picture's name -> (archive, record, metal, mask)."""
    m = NAME.match(name)
    return int(m.group(1)), int(m.group(2)), m.group(3) or UNDYED, bool(m.group(4))


def _threads():
    import bpy
    threads = int(os.environ.get('FORGE_THREADS') or 0)   # a run beside others on one machine: its share of the cores
    if threads:
        bpy.context.scene.render.threads_mode, bpy.context.scene.render.threads = 'FIXED', threads


def write(out, name, pic, at):
    """A picture at its box's size, its place on the doll (`at`, the box's top left in the doll's own pixels) written
    in it."""
    import stage
    path = os.path.join(out, f'rri-{name}.png')
    stage.write_png(path, np.ascontiguousarray(pic), at)
    print(path, flush=True)


# ---- the weapons -------------------------------------------------------------------------------------------------

# each weapon's records: the left hand's (0) and the right's (1), held along the forge's doll battleaxe's records of
# the man's doll (TEXTURE.234 records 0 and 1): Daggerfall's hands never move, so its grip and line are the doll's
HELD_AS = {0: '0', 1: '1'}
DOLL_SCALE = 'male:2'   # the doll body whose fitted scale (pixels a metre) the weapons are drawn at
# the hatchet: its metal's battleaxe (axes.py `LOOK`) made small. The hand to the socket's foot (m), the broad bit's
# reach and height and the back bit's at these shares of the battleaxe's, the socket and the spike over it shorter, the
# haft past the fist as short as Daggerfall's doll draws it
HATCHET = {'haft': 0.3, 'bit': (0.6, 0.52), 'back': (0.5, 0.45), 'socket': 0.65, 'spike': 0.35, 'butt': 0.05}


def hatchet_shape(metal):
    """`metal`'s hatchet as axes.py shapes an axe: its battleaxe's look, cut down (`HATCHET`)."""
    import axes
    import gear
    S = axes.shape(gear.axe_shape(), metal)
    haft = HATCHET['haft'] + gear.AXE_HOLD   # the model's hand is the first person's, the hold under the fist's
    along = haft / S['haft_len']
    S['haft_len'] = haft
    for key, (reach, tall) in (('b', HATCHET['bit']), ('k', HATCHET['back'])):
        S[f'{key}_scale'] = S.get(f'{key}_scale', 1.0) * reach
        S[f'{key}_tall'] = S.get(f'{key}_tall', 1.0) * tall
    for key in ('b_att', 'k_att', 'sock_len', 'band_h'):
        S[key] = S.get(key, 0.0) * HATCHET['socket']
    S['spike_len'] *= HATCHET['spike']
    for key in ('langet', 'wrap'):   # what runs down the haft runs a shorter haft
        S[key] = S.get(key, 0.0) * along
    return S


def hatchet(M, metal):
    """`metal`'s hatchet in the weapon's own frame (its grip at the origin, its head up +Z, its broad bit toward +X),
    dressed as gear.py dresses its battleaxe: its head the metal's, its haft wrapped at the hand and capped at its butt
    in the metal's own language. Answers its objects and how far up +Z it reaches."""
    import bpy
    import axes
    import gear
    import materials
    import metals
    P = metals.palette(metal)
    S = hatchet_shape(metal)
    v, faces, mats = axes.battleaxe(S)
    v = v - (0.0, 0.0, gear.AXE_HOLD)
    me = bpy.data.meshes.new('hatchet_head')
    me.from_pydata(v.tolist(), [], faces.tolist())
    steel = metal == 'Steel'
    L = metals.LOOK[metal]
    head = M['blade'] if steel else P.get('blade', P['metal'])
    dark = L.get('groove', tuple(0.55 * c for c in L.get('blade', L['metal'])))
    lift = gear.AXE_FLATS_LIFT.get(metal, 0.0)
    dark = tuple(d + lift * (b - d) for d, b in zip(dark, L.get('blade', L['metal'])))
    own = {'axehead': head, 'haft': M['haft'] if steel else P['grip'],
           'glow': P.get('blade_glow', P.get('glow', P['accent'])),
           'haft_wrap': materials.plain(f'haft.{metal}.thong', metals._linear(gear.AXE_THONG), rough=0.75, spec=0.25),
           'axe_groove': materials.plain(f'steel.{metal}.axe_groove', metals._linear(dark), metal=L['metallic'],
                                         rough=L['rough'], spec=0.6),
           'axe_sleeve': head, 'axe_grip': P['grip'],
           'axe_accent': materials.plain(f'edge.{metal}.axe', metals._linear(axes.ACCENT_COLOUR.get(
               metal, L.get('accent', L['fit']))), metal=1.0, rough=0.25)}
    for name in axes.materials(metal):
        me.materials.append(own[name])
    me.polygons.foreach_set('material_index', mats.tolist())
    me.update()
    me.shade_smooth()
    ob = bpy.data.objects.new('hatchet_head', me)
    bpy.context.scene.collection.objects.link(ob)
    r = S['haft_r']
    haft = M['haft'] if steel else P['grip']
    butt = HATCHET['butt']
    cap = [(k * r, -butt + h * 0.6) for k, h in gear.AXE_BUTTS[metal]]   # its butt's cap, a little lower
    obs = [ob, metals.lathe('hatchet_butt_haft', [(r, -butt + 0.01), (r, 0.002)], haft),
           metals.grip('hatchet_grip', -butt * 0.6, 0.06, r * 1.08, P['grip'], wrap=gear.AXE_GRIP[metal], depth=0.0016),
           metals.lathe('hatchet_butt', cap, P['fit'], sides=8 if metal in ('Dwarven', 'Adamantium', 'Ebony') else 24)]
    return obs, float(v[:, 2].max())


# the short flail: its metal's flail (flails.py `LOOK`) on a shorter handle, its chain of the same links longer, its
# ball smaller, and the handle past the fist as short as the hatchet's
SHORT_FLAIL = {'haft_len': 0.27, 'links': 18.0, 'ball_r': 0.055, 'butt': 0.05}


def short_flail(metal, chain):
    """`metal`'s short flail in the weapon's own frame (its grip at the origin, its handle up +Z), its chain at `chain`
    (flails.py `chain_curve`): the forge's flail of that metal (blunts3p.py `make`) on a shorter handle, its chain longer
    and its ball smaller. Answers its objects and how far up +Z its eye stands, where the chain hangs from."""
    import blunts3p
    import dollrender
    import flails
    S = flails.shape(blunts3p.shape('flail'), metal)
    S.update({k: v for k, v in SHORT_FLAIL.items() if k in flails.FLAIL})
    v, t, m = flails.flail(S, *chain)
    roles = blunts3p.ROLES['flail']
    mats = (blunts3p._dressing(v, t, m, roles.index('wood')), len(roles) - 1)
    v, t, m = flails._whole([(v, t, m)] + blunts3p._butt(-SHORT_FLAIL['butt'], S['haft_r'], metal, mats))
    palette = blunts3p.palette(metal)
    used = sorted(set(m.tolist()))
    ob = dollrender._mesh(f'short_flail_{metal}', v, t, [palette[roles[k]] for k in used], [used.index(k) for k in m])
    return [ob], S['haft_len'] + S['fer_len'] + S['eye_len']


def weapon_fit(spec_fit, box, at, scale, reach):
    """A record's fit (dollrender.py `place`) for a weapon reaching `reach` metres up its frame, in the box `box`
    ([w, h]) standing at `at` in the doll's own pixels: the battleaxe record's grip and line, moved into the box, its far
    end where `scale` pixels a metre puts it."""
    import dollarmour as D
    import dollweapons
    ref = dollweapons.FISTS   # noqa: F841 - the doll's fists, which the battleaxe's grip lies on
    off = np.array(spec_fit['offset'], dtype=np.float64) - np.array(D.ORIGIN) - np.asarray(at, dtype=np.float64)
    grip = np.asarray(spec_fit['grip'], dtype=np.float64) + off
    u = np.asarray(spec_fit['tip'], dtype=np.float64) + off - grip
    u /= np.linalg.norm(u)
    return {**spec_fit, 'size': list(box), 'grip': grip.tolist(), 'tip': (grip + u * scale * reach).tolist()}


def render_weapon(kind, metal, fit, samples):
    """One weapon record: (h, w, 4) uint8 at the record's box, its fingers cut."""
    import bpy
    import dollarmourrender as R
    import dollrender
    import materials
    dollrender._clear()
    flip = fit.get('flip', False)
    if kind == 'hatchet':
        obs, reach = hatchet(materials.palette(), metal)
    else:
        obs, reach = short_flail(metal, dollrender.hanging(fit, flip))
    s, _ = dollrender.place(obs, fit, flip, reach=reach)
    w, h = fit['size']
    dollrender._stage(w, h, s, samples)
    _threads()
    bpy.context.scene.render.film_transparent = True
    pic = R._render()
    dollrender.cut_fingers(pic, fit)
    return pic


def render_weapons(out, names, spec, ref, samples):
    """Every weapon picture asked for (`names`: name -> its index row)."""
    import dollarmour as D
    scale = json.load(open(D.SPEC))[DOLL_SCALE]['scale']
    fits = json.load(open(os.path.join(HERE, 'specs', 'doll-weapons.json')))['234']
    for name, row in sorted(names.items()):
        archive, record, metal, _ = parse(name)
        w, h, x, y = row[:4]
        held = dict(fits[HELD_AS[record]])
        rec = ref['234'][HELD_AS[record]]
        held['offset'] = [rec['offset']['x'], rec['offset']['y']]
        kind = 'hatchet' if archive == 513 else 'flail'
        reach = _reach(kind, metal)
        fit = weapon_fit(held, (w, h), (x, y), scale, reach)
        write(out, name, render_weapon(kind, metal, fit, samples), (x, y))


_REACHES = {}


def _reach(kind, metal):
    """How far up its frame a weapon reaches: the hatchet's top, the short flail's eye."""
    if (kind, metal) not in _REACHES:
        import dollrender
        import materials
        dollrender._clear()
        _REACHES[(kind, metal)] = (hatchet(materials.palette(), metal) if kind == 'hatchet'
                                   else short_flail(metal, (0.0, 0.0, 0.0)))[1]
    return _REACHES[(kind, metal)]


# ---- the light set ---------------------------------------------------------------------------------------------

PIECES = {520: 'jacket', 521: 'trousers', 522: 'cap', 523: 'boots', 524: 'gloves', 525: 'armguard_L', 526: 'armguard_R'}
# the classic piece whose doll records each is graded onto (dollarmour.py `RECORDS`), the armguards the pauldrons'
CLASSIC = {'jacket': 'cuirass', 'trousers': 'greaves', 'cap': 'helm', 'boots': 'boots', 'gloves': 'gauntlets',
           'armguard_L': 'pauldron_L', 'armguard_R': 'pauldron_R'}
# what each record is (rriItems.js `lightRecord`, `helmetRecord`): fur-lined, plated or plain leather
KIND = {'light': {2: 'fur', 6: 'fur', 10: 'plated', 14: 'plated', 16: 'leather', 17: 'leather'},
        'cap': {1: 'fur', 2: 'fur', 5: 'fur', 6: 'fur', 9: 'plated', 10: 'plated', 13: 'plated', 14: 'plated',
                16: 'leather', 17: 'leather', 18: 'leather', 19: 'leather'}}
# the doll bodies that wear each record (the same rules): a woman's records every woman's, a man's every man's, a
# cap's by head. The first is the body it is fitted to; a cap's mask hides the hair of them all
WEARS = {'light': {2: ('female:2', 'female:1', 'female:3', 'female:0'), 10: ('female:2', 'female:1', 'female:3', 'female:0'),
                   16: ('female:2', 'female:1', 'female:3', 'female:0'), 6: ('male:2', 'male:1', 'male:3', 'male:0'),
                   14: ('male:2', 'male:1', 'male:3', 'male:0'), 17: ('male:2', 'male:1', 'male:3', 'male:0')},
         'cap': {1: ('female:0',), 9: ('female:0',), 18: ('female:0',),
                 2: ('female:2', 'female:1', 'female:3'), 10: ('female:2', 'female:1', 'female:3'),
                 16: ('female:2', 'female:1', 'female:3'),
                 6: ('male:2', 'male:0'), 14: ('male:2', 'male:0'), 17: ('male:2', 'male:0'),
                 5: ('male:1', 'male:3'), 13: ('male:1', 'male:3'), 19: ('male:1', 'male:3')}}


def table_of(archive):
    return KIND['cap' if archive == 522 else 'light'], WEARS['cap' if archive == 522 else 'light']


# the leathers (sRGB): the jacket's and its fellows', a fur-lined piece's darker under its fur, the turned edges and
# straps darker still, the laces near black, the lining a pale suede; the fur a warm grey-tan, the buckles iron
LEATHER = {'leather': (100, 62, 36), 'fur': (86, 56, 36), 'plated': (76, 48, 30)}
EDGE, STRAP, LACE, LINING, SOLE = (56, 34, 20), (46, 30, 18), (34, 22, 14), (132, 104, 74), (30, 22, 16)
FUR, BUCKLE = (92, 78, 60), (92, 90, 94)
PLATED_LEATHER = 0.8   # the leather between plates a shade darker than a plain piece's: the plates stand out on it


def leather(name, rgb, rough=0.66, spec=0.32, mottle=0.16, grain=0.25):
    """Leather as the doll draws it: worn lighter and darker in patches a few centimetres across, a faint grain, and
    no cloth's painted folds (fabric.py), whose rings round the body read as a bare stomach's muscles on a jacket."""
    import materials
    m, b = materials._principled(name, rgb, rough=rough, spec=spec)
    nt = m.node_tree
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 1.0
    noise.inputs['Detail'].default_value = 2.0
    nt.links.new(materials._coords(m, (28.0, 28.0, 28.0)), noise.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    low, high = ramp.color_ramp.elements
    low.position, low.color = 0.3, (*(c * (1 - mottle) for c in rgb), 1)
    high.position, high.color = 0.7, (*(min(c * (1 + mottle), 1.0) for c in rgb), 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    if grain:
        fine = nt.nodes.new('ShaderNodeTexNoise')
        fine.inputs['Scale'].default_value = 1.0
        nt.links.new(materials._coords(m, (160.0, 160.0, 160.0)), fine.inputs['Vector'])
        bump = nt.nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = grain
        bump.inputs['Distance'].default_value = 0.002
        nt.links.new(fine.outputs['Fac'], bump.inputs['Height'])
        nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def materials_of(kind):
    """A kind's materials by clothes.py `SLOT`, each named for its class (dollarmourrender.py `class_of`): the leathers
    `leather.*`, graded as leather; the plates and rivets `metal.*`, laid on the metal's ramp; the fur and the iron
    buckles neither, drawn as rendered."""
    import fabric
    import materials
    import metals
    lin = metals._linear
    return [leather(f'leather.rri.{kind}', lin(LEATHER[kind])),
            leather(f'leather.rri.{kind}.edge', lin(EDGE), mottle=0.1, grain=0.0),
            materials.plain(f'leather.rri.{kind}.lace', lin(LACE), rough=0.8, spec=0.2),
            materials.plain(f'buckle.rri.{kind}', lin(BUCKLE), metal=0.4, rough=0.38, spec=0.6),
            materials.plain(f'metal.rri.{kind}.plate', (0.42, 0.42, 0.42), metal=0.15, rough=0.38, spec=0.6),
            leather(f'leather.rri.{kind}.lining', lin(LINING), rough=0.8, spec=0.2, mottle=0.12, grain=0.0),
            materials.plain(f'metal.rri.{kind}.rivet', (0.7, 0.7, 0.7), metal=0.2, rough=0.3, spec=0.7),
            fabric.fur(f'fur.rri.{kind}', lin(FUR)),
            materials.plain(f'leather.rri.{kind}.sole', lin(SOLE), rough=0.85, spec=0.1),
            leather(f'leather.rri.{kind}.strap', lin(STRAP), rough=0.62, spec=0.36, mottle=0.08, grain=0.0)]


def hang_over(sh, rounds=16):
    """A shell hung over the body's hollows as leather is: smoothed round after round without shrinking (Taubin's
    two steps), each vertex moved along its normal alone and never nearer the skin than it was made. Clinging, a
    jacket shows the muscles under it and reads as a brown skin."""
    p, n = sh.p.copy(), sh.n
    least = ((p - sh.rest) * n).sum(axis=1) * 0.92   # how near the skin each vertex may come
    e = np.concatenate([sh.t[:, [0, 1]], sh.t[:, [1, 2]], sh.t[:, [2, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    count = np.maximum(np.bincount(e[:, 0], minlength=len(p)), 1)[:, None]

    def towards(q, k):
        mean = np.zeros_like(q)
        np.add.at(mean, e[:, 0], q[e[:, 1]])
        return q + k * (mean / count - q)
    for _ in range(rounds):   # along each vertex's normal alone: slid across the skin, the pose would set it back
        off = ((towards(towards(p, 0.5), -0.53) - sh.rest) * n).sum(axis=1)
        p = sh.rest + n * np.maximum(off, least)[:, None]
    sh.p = p


def wear(body, mats, name, parts, push, thick=0.003, folds=None, roll=0.0, roll_slot=1, extras=None, slots=None,
         painted=True, smooth=16):
    """clothes.py `worn`, the shell hung over the body's hollows first (`hang_over`), so its rolled edges and what is
    laid on it lie on the leather as it hangs."""
    import clothkit
    sh = clothkit.Shell(body, lambda p, a: clothkit.blend(a, {k: f(p) for k, f in parts.items()}), push, thick, folds)
    if smooth:
        hang_over(sh, smooth)
    if roll:
        for loop in sh.loops():
            sh.roll(loop, roll, roll_slot)
    if extras:
        extras(sh)
    sk = sh.skinned(name, mats, slots)
    if painted:   # where each vertex lies on the body at rest: its leather's folds are drawn from it (fabric.py)
        import fabric
        fabric.mark(sk.me, sk.base)
    return sk


def band(body, mats, name, parts, push, slot, roll=0.0018):
    """A band laid over a piece (a yoke, a strap, a cuff), hung as the piece is (clothes.py `edge_band`)."""
    import clothes
    return wear(body, mats, name, parts, push, thick=0.0024, roll=roll, roll_slot=slot, slots=clothes._all(slot),
                painted=False)


def belt(body, mats, name, z, width, push):
    """A belt round the waist over a piece, buckled in iron at the front, the strap's end through its keepers beside
    the buckle (clothes.py `belt`), hung as the piece is."""
    import clothes as C

    def extras(sh):
        C.buckle(sh, C.SLOT['gilt'], size=(0.04, width * 0.95))
        for x in (0.036, 0.062):
            i = C._near_front(sh, z, x, 0.02)
            if i is not None:
                C._stud(sh, i, (0.022, width * 0.7), C.SLOT['hide'], depth=0.004)
    return [wear(body, mats, name, {'torso': lambda p: np.abs(p[:, 2] - z) - width / 2}, push, thick=0.003,
                 roll=0.0015, roll_slot=C.SLOT['hide'], extras=extras, slots=C._all(C.SLOT['hide']), painted=False)]


def _skull(body):
    """The head at rest: its crown's height and its middle (x, y) a hand under the crown."""
    import clothkit
    p = body.rest[body.alpha[:, clothkit.PIECE['skull']] > 0.5]
    crown = float(p[:, 2].max())
    mid = p[np.abs(p[:, 2] - (crown - 0.08)) < 0.02]
    return crown, np.array([(mid[:, 0].min() + mid[:, 0].max()) / 2, (mid[:, 1].min() + mid[:, 1].max()) / 2])


def fur_roll(sh, loop, radius, slot, seed=0):
    """A fur trim along one of a shell's edges (`loop`, its vertices in order): a soft roll lying on the edge, swelling
    and thinning (armourkit.py `fleece`), skinned as the edge is. `radius` a number or one a vertex of the loop."""
    import armourkit
    rad = np.broadcast_to(np.asarray(radius, float), (len(loop),))
    pts = sh.p[loop] + sh.n[loop] * rad[:, None] * 0.6
    mesh = armourkit.Mesh()
    armourkit.fleece(mesh, pts, rad, 0, seed=seed, closed=True)
    v = np.concatenate(mesh.v)
    tris = [(f[0], f[k], f[k + 1]) for f in mesh.f for k in range(1, len(f) - 1)]
    near = np.argmin(((v[:, None, :] - pts[None, :, :]) ** 2).sum(axis=2), axis=1)
    sh.add(v, tris, slot, np.asarray(loop)[near])


def _loop_where(sh, key):
    """The shell's edge loop that `key(points)` scores highest."""
    loops = sh.loops()
    return max(loops, key=lambda lp: key(sh.rest[lp])) if loops else None


def plates(body, mats, name, region, top, bottom, pitch, cols, push, tilt=0.007, angle=None, rivets=True,
           fill=(0.78, 0.82)):
    """A coat of plates over `region` (a field, inside below nought): rows `pitch` apart from `top` down to `bottom`,
    `cols` plates round (`angle(p)`, radians round the part; the body's own about its upright axis), each row's foot
    standing `tilt` further out than its head so it laps the row under it, a leather gap between (`fill`, the share of
    a row and of a column a plate takes). A rivet heads each plate on the front."""
    import clothes
    import clothkit
    around = angle or clothkit.around

    def frac(p):
        return np.mod((top - p[:, 2]) / pitch, 1.0)

    def field(p):
        col = np.mod(around(p) * cols / clothkit.TAU, 1.0)
        return np.maximum.reduce([region(p), p[:, 2] - top, bottom - p[:, 2], (frac(p) - fill[0]) * pitch,
                                  (np.abs(col - 0.5) * 2 - fill[1]) * 0.03])

    def extras(sh):
        if not rivets:
            return
        rows = np.arange(top - pitch * 0.12, bottom, -pitch)
        cols_at = (np.arange(cols) + 0.5) / cols * clothkit.TAU
        a = around(sh.rest)
        for z in rows:
            for c in cols_at:
                if clothkit.facing(np.array([c]), -math.pi / 2)[0] > 1.3:
                    continue
                near = np.nonzero((np.abs(sh.rest[:, 2] - z) < pitch * 0.12)
                                  & (clothkit.facing(a, c) < math.pi / cols * 0.4))[0]
                if len(near):
                    clothes._stud(sh, near[np.argmin(np.abs(sh.rest[near, 2] - z))], (0.011, 0.011),
                                  clothes.SLOT['accent'], depth=0.004)
    return wear(body, mats, name, {k: field for k in region.parts}, lambda p: push + tilt * frac(p),
                        thick=0.0025, roll=0.0, extras=extras, slots=clothes._all(clothes.SLOT['iron']),
                        painted=False)


class Region:
    """A field over the body's pieces named (`parts`), inside below nought: `fn(p)` for all of them."""

    def __init__(self, parts, fn):
        self.parts, self.fn = tuple(parts), fn

    def __call__(self, p):
        return self.fn(p)


def jacket(body, mats, kind):
    """The jacket: sleeveless leather from a round neck to the hips. Leather, it is two leathers, the yoke over the
    shoulders, the collar, the placket down the front and the panels' seams darker, closed with iron toggles and
    belted. Fur-lined, it opens down the front over its lining, a thick fur collar lying on the shoulders and running
    down its edges and round its hem. Plated, rows of riveted plates lap down its breast and back, a belt over them."""
    import clothes as C
    hem = C.HIP_Z - (0.06 if kind == 'fur' else 0.1)
    opening = 0.03 if kind == 'fur' else 0.0
    neck = (0.085, 0.01, 1.3) if kind == 'fur' else (0.045, 0.01, 1.0)   # the neckline's drop, behind, its width
    field = Region(('torso',), lambda p: C.torso(p, None, hem, *neck, opening))
    shoulder = Region(C.ARMS, lambda p: 1.41 - p[:, 2])   # over the top of each shoulder, where the armguard laps it

    def push(p):
        return C.BAND['over'] + 0.0045 * np.clip((C.CHEST_Z - p[:, 2]) / 0.25, 0, 1)

    def extras(sh):
        if kind == 'fur':
            edge = _loop_where(sh, lambda r: r[:, 2].max() - r[:, 2].min())   # the one edge from collar to hem
            z = sh.rest[edge, 2]
            fur_roll(sh, edge, 0.013 + 0.012 * np.clip((z - 1.28) / 0.14, 0, 1), C.SLOT['fur'], seed=3)
    out = [wear(body, mats, f'rri_jacket_{kind}', {'torso': field, **{a: shoulder for a in C.ARMS}}, push, thick=0.003,
                folds=lambda p, n: C.drapes(p, C.CHEST_Z, hem, 9, 0.0012), roll=0.0032, roll_slot=C.SLOT['hem'],
                extras=extras)]
    if kind == 'fur':   # its lining inside the open front
        out.append(wear(body, mats, f'rri_jacket_{kind}_lining',
                        {'torso': lambda p: np.maximum(C.torso(p, None, hem + 0.01, *neck),
                                                       np.where(p[:, 1] < -0.02, np.abs(p[:, 0]) - 0.06, 1.0))},
                        lambda p: push(p) - 0.003, thick=0.002, roll=0.0, slots=C._all(C.SLOT['inside'])))
    if kind == 'leather':
        def placket(p):   # down the front, from the collar to the hem, and the panels' seams either side of it
            front = p[:, 1] < -0.02
            strip = np.where(front, np.minimum(np.abs(p[:, 0]) - 0.017, np.abs(np.abs(p[:, 0]) - 0.088) - 0.005), 1.0)
            return np.maximum(strip, C.torso(p, None, hem, *neck))

        def toggles(sh):
            for z in np.linspace(C.NECK_Z - 0.09, hem + 0.07, 5):
                i = C._near_front(sh, z)
                if i is not None:
                    C._stud(sh, i, (0.028, 0.013), C.SLOT['gilt'], depth=0.007)
        out.append(wear(body, mats, f'rri_jacket_{kind}_placket', {'torso': placket}, lambda p: push(p) + 0.003,
                        thick=0.0024, roll=0.0016, roll_slot=C.SLOT['hem'], slots=C._all(C.SLOT['hem']),
                        extras=toggles, painted=False))
        out.append(band(body, mats, f'rri_jacket_{kind}_yoke',
                        {'torso': lambda p: np.maximum(1.39 - p[:, 2], C.neckline(p, *neck)),
                         **{a: shoulder for a in C.ARMS}}, lambda p: push(p) + 0.003, slot=C.SLOT['hem'], roll=0.002))
        out.append(band(body, mats, f'rri_jacket_{kind}_collar',
                        {'torso': lambda p: np.abs(C.neckline(p, *neck) + 0.013) - 0.013},
                        lambda p: push(p) + 0.006, slot=C.SLOT['hide'], roll=0.0024))
    if kind == 'plated':
        out.append(plates(body, mats, f'rri_jacket_{kind}_plates', field, 1.4, hem + 0.03, 0.062, 9,
                          C.BAND['over'] + 0.007))
    if kind != 'fur':
        out += belt(body, mats, f'rri_jacket_{kind}_belt', C.WAIST_Z - 0.04, 0.042,
                    lambda p: push(p) + (0.012 if kind == 'plated' else 0.0075))
    return out


def trousers(body, mats, kind):
    """The trousers: leather from the hips to under the knee, creased at the knee, each leg bound under it with a
    strap. Fur-lined, they rise to the waist and their fur shows round the waist and the knees. Plated, rows of plates
    lap down the front of each thigh and a round plate guards each knee."""
    import clothes as C
    top = C.WAIST_Z - 0.06 if kind == 'fur' else C.HIP_Z - 0.05
    foot = C.KNEE_Z - 0.08
    parts = {'torso': lambda p: p[:, 2] - top, **{leg: C.to(foot) for leg in C.LEGS}}

    def push(p):
        return C.BAND['legs'] + 0.002 + 0.0012 * np.clip((foot + 0.08 - p[:, 2]) / 0.08, 0, 1)

    def folds(p, n):
        return C.wrinkles(p, [(C.KNEE_Z + 0.03, 0.05, 3), (C.CROTCH_Z - 0.04, 0.06, 2)], depth=0.0024)

    def extras(sh):
        if kind != 'fur':
            return
        for lp in sh.loops():
            z = sh.rest[lp, 2].mean()
            fur_roll(sh, lp, 0.012 if z < 0.7 else 0.014, C.SLOT['fur'], seed=int(z * 100))
    out = [wear(body, mats, f'rri_trousers_{kind}', parts, push, folds=folds, roll=0.003, roll_slot=C.SLOT['hem'],
                  extras=extras)]
    if kind != 'fur':
        out.append(band(body, mats, f'rri_trousers_{kind}_garters',
                        {leg: (lambda p: np.abs(p[:, 2] - (foot + 0.03)) - 0.014) for leg in C.LEGS},
                        lambda p: push(p) + 0.0022, slot=C.SLOT['hide'], roll=0.0018))
    if kind == 'leather':
        def seams(p):   # down the outside of each leg, and a patch over each knee
            outer = C.facing(C._limb_angle(p), np.where(p[:, 0] > 0, 0.0, math.pi)) - 0.11
            k = np.stack([np.sign(p[:, 0]) * 0.105, p[:, 1], np.full(len(p), C.KNEE_Z + 0.02)], axis=1)
            patch = np.maximum(np.linalg.norm((p - k) * (1.0, 0.0, 0.8), axis=1) - 0.045, p[:, 1] + 0.01)
            return np.maximum(np.minimum(outer, patch), np.maximum(p[:, 2] - (top - 0.01), foot + 0.045 - p[:, 2]))
        out.append(band(body, mats, f'rri_trousers_{kind}_seams', {leg: seams for leg in C.LEGS},
                        lambda p: push(p) + 0.0026, slot=C.SLOT['hem'], roll=0.0014))
    if kind == 'plated':
        def thigh(p):   # the front of each thigh
            return C.facing(C._limb_angle(p), -math.pi / 2) - 1.05
        out.append(plates(body, mats, f'rri_trousers_{kind}_plates', Region(C.LEGS, thigh), C.HIP_Z - 0.06,
                          C.KNEE_Z + 0.08, 0.066, 6, C.BAND['legs'] + 0.008, angle=C._limb_angle))

        def knee(p):
            k = np.stack([np.sign(p[:, 0]) * 0.105, np.full(len(p), -0.06), np.full(len(p), C.KNEE_Z + 0.01)], axis=1)
            d = np.linalg.norm((p - k) * (1.0, 0.0, 1.0), axis=1)
            return np.maximum(d - 0.05, np.where(p[:, 1] < -0.01, -1.0, 1.0))
        out.append(wear(body, mats, f'rri_trousers_{kind}_knees', {leg: knee for leg in C.LEGS},
                          lambda p: C.BAND['legs'] + 0.006 + 0.01 * np.clip(1 - np.linalg.norm(
                              (p - np.stack([np.sign(p[:, 0]) * 0.105, p[:, 1], np.full(len(p), C.KNEE_Z + 0.01)],
                                            axis=1)) * (1.0, 0.0, 1.0), axis=1) / 0.05, 0, 1),
                          thick=0.0025, roll=0.0022, roll_slot=C.SLOT['iron'], slots=C._all(C.SLOT['iron']),
                          painted=False))
    return out


def cap(body, mats, kind):
    """The cap: leather close over the crown to the brow, over the ears to the nape, a ridged seam from brow to nape.
    Fur-lined, a thick fur brim rolls round it and fur-lined flaps hang over the ears to the jaw. Plated, a band of
    metal rings the brow and two cross over the crown, riveted, the leather showing between."""
    import clothes as C
    import clothkit
    crown, mid = _skull(body)

    def line(p):   # the cap's edge: the brow at the front, lower over the ears, lowest at the nape
        a = clothkit.around(p, mid)
        front = clothkit.facing(a) / math.pi
        drop = 0.07 + 0.06 * np.clip(front * 1.6, 0, 1) + 0.015 * front
        if kind == 'fur':   # its flaps over the ears
            side = np.minimum(clothkit.facing(a, 0.0), clothkit.facing(a, math.pi))
            drop = drop + 0.075 * np.clip(1 - side / 0.42, 0, 1) ** 0.7
        return crown - drop

    def field(p):
        return line(p) - p[:, 2]
    push = 0.009 if kind == 'fur' else 0.006

    def extras(sh):
        if kind == 'fur':
            edge = _loop_where(sh, lambda r: len(r))
            fur_roll(sh, edge, 0.018, C.SLOT['fur'], seed=5)
    out = [wear(body, mats, f'rri_cap_{kind}', {'skull': field}, push, thick=0.003, roll=0.0035,
                  roll_slot=C.SLOT['hem'], extras=extras, painted=False)]

    def strip(p, half):   # brow to nape over the crown
        return np.maximum(np.abs(p[:, 0] - mid[0]) - half, field(p))
    if kind == 'leather':
        out.append(band(body, mats, f'rri_cap_{kind}_seam', {'skull': lambda p: strip(p, 0.008)}, push + 0.002,
                               slot=C.SLOT['hem'], roll=0.0016))
    if kind == 'plated':
        def bands(p):
            cross = np.minimum(np.abs(p[:, 0] - mid[0]), np.abs(p[:, 1] - mid[1])) - 0.011
            brow = (p[:, 2] - line(p)) - 0.022
            return np.maximum(np.minimum(cross, brow), field(p))

        def extras_plate(sh):
            for k in range(7):   # rivets round the brow band's front
                a = -math.pi / 2 + (k - 3) * 0.32
                near = np.nonzero(clothkit.facing(clothkit.around(sh.rest, mid), a) < 0.08)[0]
                if len(near):
                    low = near[np.argsort(sh.rest[near, 2])[:max(1, len(near) // 3)]]
                    i = low[np.argmax(sh.rest[low, 2])]
                    C._stud(sh, i, (0.009, 0.009), C.SLOT['accent'], depth=0.004)
        out.append(wear(body, mats, f'rri_cap_{kind}_bands', {'skull': bands}, push + 0.004, thick=0.003,
                          roll=0.0018, roll_slot=C.SLOT['iron'], slots=C._all(C.SLOT['iron']), extras=extras_plate,
                          painted=False))
    return out


def boots(body, mats, kind):
    """The half-boots: leather to the middle of the calf, creased at the ankle, laced up the front on a dark sole.
    Leather, their tops are turned down in a cuff. Fur-lined, a fur trim rolls round each top. Plated, a plate guards
    each shin and another caps each toe."""
    import clothes as C
    top = C.CALF_Z + 0.01
    own = list(mats)
    own[C.SLOT['hide']] = mats[C.SLOT['cloth']]   # the shaft in the set's own leather, its straps darker
    out = C.shoes(body, own, f'rri_boots_{kind}', top=top, cuff=kind == 'leather', laced=kind != 'fur')
    if kind == 'fur':
        sh_top = top + 0.005
        out.append(wear(body, mats, f'rri_boots_{kind}_fur',
                          {leg: (lambda p: np.abs(p[:, 2] - (sh_top - 0.012)) - 0.016) for leg in C.LEGS},
                          C.BAND['feet'] + 0.006, thick=0.003, roll=0.0,
                          extras=lambda sh: [fur_roll(sh, lp, 0.016, C.SLOT['fur'], seed=7 + k)
                                             for k, lp in enumerate(sh.loops()) if sh.rest[lp, 2].mean() > sh_top - 0.012],
                          slots=C._all(C.SLOT['fur'])))
    if kind == 'plated':
        def shin(p):
            return np.maximum.reduce([C.facing(C._limb_angle(p), -math.pi / 2) - 0.85, 0.15 - p[:, 2],
                                      p[:, 2] - (top - 0.02)])
        out.append(wear(body, mats, f'rri_boots_{kind}_shins', {leg: shin for leg in C.LEGS},
                          C.BAND['feet'] + 0.008, thick=0.003, roll=0.002, roll_slot=C.SLOT['iron'],
                          slots=C._all(C.SLOT['iron']), painted=False,
                          extras=lambda sh: [C._stud(sh, i, (0.01, 0.01), C.SLOT['accent'], depth=0.004)
                                             for z in (top - 0.04, 0.2) for x in (0.1, -0.1)
                                             for i in [_nearest(sh, (x, None, z))] if i is not None]))

        def toe(p):
            return np.maximum(p[:, 1] + 0.12, 0.012 - p[:, 2])
        out.append(wear(body, mats, f'rri_boots_{kind}_toes', {f: toe for f in C.FEET}, C.BAND['feet'] + 0.008,
                          thick=0.003, roll=0.002, roll_slot=C.SLOT['iron'], slots=C._all(C.SLOT['iron']),
                          painted=False))
    return out


def _nearest(sh, at):
    """The shell's front vertex nearest (x, z) at rest (`at`'s y ignored), or None."""
    x, _, z = at
    front = np.nonzero(sh.rest[:, 1] < -0.02)[0]
    if not len(front):
        return None
    return front[np.argmin((sh.rest[front, 0] - x) ** 2 + (sh.rest[front, 2] - z) ** 2)]


def gloves(body, mats, kind, hands):
    """The gloves: leather over each hand, a flared cuff halfway up the forearm. Fur-lined, fur rolls round each cuff.
    Plated, the back of each hand and the cuff carry plates. Answers the cuffs' shells and the hands' covers (each the
    hand's object's name and its cover)."""
    import clothes as C
    own = list(mats)
    own[C.SLOT['hide']] = mats[C.SLOT['cloth']]
    out = C.glove_cuffs(body, own, f'rri_gloves_{kind}')
    if kind == 'fur':
        out.append(wear(body, mats, f'rri_gloves_{kind}_fur',
                          {a: (lambda p: np.abs(p[:, 2] - (C.GLOVE_Z - 0.008)) - 0.012) for a in C.ARMS},
                          C.BAND['shirt'] + 0.008, thick=0.003, roll=0.0,
                          extras=lambda sh: [fur_roll(sh, lp, 0.012, C.SLOT['fur'], seed=11 + k)
                                             for k, lp in enumerate(sh.loops())
                                             if sh.rest[lp, 2].mean() > C.GLOVE_Z - 0.01],
                          slots=C._all(C.SLOT['fur'])))
    if kind == 'plated':
        out.append(plates(body, mats, f'rri_gloves_{kind}_plates', Region(C.ARMS, lambda p: C.WRIST_Z - 0.01 - p[:, 2]
                                                                          + 0.0 * p[:, 0]),
                          C.GLOVE_Z - 0.004, C.WRIST_Z + 0.004, 0.036, 8, C.BAND['shirt'] + 0.009, tilt=0.004,
                          angle=lambda p: np.arctan2(p[:, 1], p[:, 0] - np.sign(p[:, 0]) * 0.24), rivets=False))
    covers = C.glove_covers(hands, own)
    if kind == 'plated':
        for _, cover in covers:
            _plate_back(cover, mats)
    return out, covers


def _plate_back(cover, mats):
    """A glove's cover with the back of its hand in plate: the faces turned toward the hand's back (its local +Y, the
    knuckles' side) in the metal."""
    import clothes as C
    me = cover.data
    me.materials.append(mats[C.SLOT['iron']])
    k = len(me.materials) - 1
    idx = [k if p.normal[1] > 0.45 else p.material_index for p in me.polygons]
    me.polygons.foreach_set('material_index', idx)
    me.update()


def armguard(body, mats, kind, side):
    """An armguard: the arm from the shoulder to the wrist. Leather, a shoulder cap of the darker leather over a sleeve
    to the elbow, and a bracer laced along the forearm. Fur-lined, fur rolls round the cap's foot and the bracer's top.
    Plated, the shoulder cap is three lapping plates, a round plate guards the elbow and plates run down the bracer."""
    import clothes as C
    arm = f'arm_{side}'
    sx = 1.0 if side == 'L' else -1.0

    def cap_field(p):   # over the shoulder, from the torso's flank out over the arm's top
        return np.maximum(1.33 - p[:, 2], 0.13 - p[:, 0] * sx)

    def sleeve(p):
        return np.maximum(p[:, 2] - 1.37, C.ELBOW_Z + 0.025 - p[:, 2])

    def bracer(p):
        return np.maximum(p[:, 2] - (C.ELBOW_Z - 0.03), C.WRIST_Z + 0.012 - p[:, 2])

    def push(p):
        return C.BAND['over'] + 0.002
    out = [wear(body, mats, f'rri_armguard_{side}_{kind}_sleeve', {arm: sleeve}, push, thick=0.003, roll=0.0028,
                  roll_slot=C.SLOT['hem'], folds=lambda p, n: C.wrinkles(p, [(C.ELBOW_Z + 0.05, 0.03, 2)], 0.002)),
           wear(body, mats, f'rri_armguard_{side}_{kind}_bracer', {arm: bracer},
                  lambda p: push(p) + 0.002 + 0.004 * np.clip((p[:, 2] - C.WRIST_Z) / (C.ELBOW_Z - C.WRIST_Z), 0, 1),
                  thick=0.003, roll=0.003, roll_slot=C.SLOT['hide'], slots=C._all(C.SLOT['hide']),
                  extras=lambda sh: C._cord(sh, _seam_ids(sh, sx), 0.0016, C.SLOT['leather']))]
    if kind == 'plated':
        lames = Region((arm, 'torso'), cap_field)
        out.append(plates(body, mats, f'rri_armguard_{side}_{kind}_cap', lames, 1.52, 1.31, 0.058, 1,
                          C.BAND['over'] + 0.008, tilt=0.008, rivets=False, fill=(0.9, 1.0)))

        def elbow(p):
            e = np.array([sx * 0.235, 0.03, C.ELBOW_Z])
            return np.maximum(np.linalg.norm((p - e) * (1.0, 0.5, 1.0), axis=1) - 0.045, -p[:, 1] - 0.0)
        out.append(wear(body, mats, f'rri_armguard_{side}_{kind}_elbow', {arm: elbow}, C.BAND['over'] + 0.009,
                          thick=0.003, roll=0.002, roll_slot=C.SLOT['iron'], slots=C._all(C.SLOT['iron']),
                          painted=False))
        out.append(plates(body, mats, f'rri_armguard_{side}_{kind}_splints', Region((arm,), bracer),
                          C.ELBOW_Z - 0.04, C.WRIST_Z + 0.02, 0.2, 5, C.BAND['over'] + 0.011, tilt=0.0,
                          angle=lambda p: np.arctan2(p[:, 1], p[:, 0] - sx * 0.24), rivets=False, fill=(0.95, 0.7)))
    else:
        def fur_or_edge(sh):
            if kind == 'fur':
                low = _loop_where(sh, lambda r: -r[:, 2].mean())
                fur_roll(sh, low, 0.014, C.SLOT['fur'], seed=13)
        out.append(wear(body, mats, f'rri_armguard_{side}_{kind}_cap', {arm: cap_field, 'torso': cap_field},
                          lambda p: C.BAND['over'] + 0.006, thick=0.0035, roll=0.003, roll_slot=C.SLOT['hide'],
                          slots=C._all(C.SLOT['hem']), extras=fur_or_edge))
        if kind == 'fur':
            out.append(wear(body, mats, f'rri_armguard_{side}_{kind}_cuff',
                              {arm: lambda p: np.abs(p[:, 2] - (C.ELBOW_Z - 0.035)) - 0.01},
                              push(None) + 0.008, thick=0.003, roll=0.0, slots=C._all(C.SLOT['fur']),
                              extras=lambda sh: [fur_roll(sh, lp, 0.012, C.SLOT['fur'], seed=17)
                                                 for lp in sh.loops() if sh.rest[lp, 2].mean() > C.ELBOW_Z - 0.035]))
    return out


def _seam_ids(sh, sx):
    """A bracer's lacing: its vertices down the inside of the forearm, from its top to its foot, zigzagging."""
    a = np.arctan2(sh.rest[:, 1], sh.rest[:, 0] - sx * 0.24)
    want = -math.pi / 2 - sx * 0.6
    near = np.nonzero(np.abs((a - want + math.pi) % (2 * math.pi) - math.pi) < 0.35)[0]
    if len(near) < 3:
        return near
    z = sh.rest[near, 2]
    ids = []
    for k, at in enumerate(np.linspace(z.max() - 0.01, z.min() + 0.01, 8)):
        pick = near[np.abs(z - at) < 0.012]
        if len(pick):
            off = ((np.arctan2(sh.rest[pick, 1], sh.rest[pick, 0] - sx * 0.24) - want) * (1 if k % 2 else -1))
            ids.append(pick[np.argmax(off)])
    return np.array(ids)


BUILD = {'jacket': jacket, 'trousers': trousers, 'cap': cap, 'boots': boots, 'armguard_L': lambda b, m, k: armguard(b, m, k, 'L'),
         'armguard_R': lambda b, m, k: armguard(b, m, k, 'R')}


def dress(gender, f, wanted):
    """The fitted body wearing every (piece, kind) in `wanted`, posed and widened as fitted: (the dressed body, the
    hands shown, (piece, kind) -> its objects)."""
    import bpy
    from mathutils import Matrix
    import layers
    import rig
    from dollarmourrender import facing
    bpy.ops.wm.read_factory_settings(use_empty=True)
    layers.load_body(gender)
    W = layers.Dressed(gender)
    body = W.skins[0]
    own = [sk.ob for sk in W.skins[1:]]
    mats = {kind: materials_of(kind) for kind in {k for _, k in wanted}}
    worn = {}
    for piece, kind in sorted(wanted):
        if piece == 'gloves':
            shells, covers = gloves(body, mats[kind], kind, W.hands)
            W.covers += covers
            worn[(piece, kind)] = [s.ob for s in shells] + [c for _, c in covers]
        else:
            shells = BUILD[piece](body, mats[kind], kind)
            worn[(piece, kind)] = [s.ob for s in shells]
        W.skins += shells
    W.place(facing(rig.Pose(rot={j: tuple(v) for j, v in f['rot'].items()}, yaw=f['yaw'])),
            {'fist': {'L': True, 'R': True}})
    shown = {ob.name for kinds in W.hands.values() for ob in kinds.values() if not ob.hide_render}
    covers = {cover: name for name, cover in W.covers}
    for obs in worn.values():   # a glove's cover over the hand the pose shows, never the other
        obs[:] = [ob for ob in obs if ob not in covers or covers[ob] in shown]
    widen = Matrix.Diagonal((f['width'], 1.0, 1.0, 1.0))
    for ob in bpy.context.scene.objects:
        if ob.type == 'MESH':
            ob.matrix_world = widen @ ob.matrix_world
    for ob in own:
        ob.hide_render = True
    return W, worn


# the metals' own ramps, darkest first, the plates' light laid across them: elven gold, dwarven bronze, daedric black
# and adamantium steel the forge's armour's own (armour.py `SET_GRADE`), the rest ours: iron a dark blue-grey, steel
# a plain bright grey, silver pale and cool, mithril a blue steel, ebony black lit to a dull violet grey, orcish a dark
# olive
def ramps():
    import armour
    return {'Iron': [(16, 16, 20), (30, 30, 36), (46, 46, 54), (64, 64, 74), (84, 84, 96), (106, 106, 118),
                     (132, 132, 144), (164, 164, 174)],
            'Steel': [(20, 20, 22), (38, 38, 42), (60, 60, 64), (86, 86, 90), (114, 114, 118), (144, 144, 148),
                      (176, 176, 180), (210, 210, 214)],
            'Silver': [(30, 30, 38), (56, 56, 68), (90, 90, 104), (126, 126, 142), (160, 160, 176), (190, 190, 204),
                       (216, 216, 228), (240, 240, 248)],
            'Elven': armour.ELVEN_GOLD[1], 'Dwarven': armour.DWARVEN_BRONZE[1],
            'Mithril': [(14, 20, 34), (28, 40, 62), (46, 62, 92), (70, 90, 128), (98, 122, 164), (130, 154, 196),
                        (166, 188, 222), (204, 220, 240)],
            'Adamantium': armour.ADAMANTIUM_STEEL[1],
            'Ebony': [(8, 8, 10), (16, 15, 18), (26, 24, 30), (38, 36, 44), (54, 52, 62), (74, 72, 86), (100, 98, 116),
                      (136, 134, 156)],
            'Orcish': [(16, 20, 12), (28, 36, 20), (42, 54, 28), (58, 74, 38), (76, 96, 50), (98, 120, 64),
                       (124, 146, 82), (156, 176, 108)],
            'Daedric': armour.DAEDRIC_BLACK[1]}


GAIN = {'leather': 1.5, 'metal': 2.6}   # how far a class's light may be spread to reach Daggerfall's: no further, so
# the faint relief of smooth leather or of a flat plate is never stretched into stripes


def stretch(tone, target, most):
    """`tone` laid onto `target`'s range in a straight line about their middles (their 5th to 95th share), spread
    `most` times at the most. Share for share (dollarmourrender.py `share_grade`) a smooth piece's faint relief would be
    spread over the whole range."""
    s_lo, s_mid, s_hi = np.percentile(tone, (5, 50, 95))
    t_lo, t_mid, t_hi = np.percentile(target, (5, 50, 95))
    return t_mid + (tone - s_mid) * min((t_hi - t_lo) / max(s_hi - s_lo, 1.0), most)


def finish(pic, ids, target, ramp=None, dark=1.0):
    """A piece's render graded onto the shading of Daggerfall's records of the matching piece, as the forge grades its
    doll armour (dollarmourrender.py `finish`) but in a straight line (`stretch`): its leather onto their leather's,
    keeping its hue (`dark` times it, the leather under plates); its plates onto their plates' greys, that light laid
    across the metal's own ramp; its fur and iron as rendered."""
    import dollarmourrender as R
    out = pic.copy()
    on = pic[..., 3] > 0
    ids = R.clean_ids(pic, ids)
    shown = R._unexposed(pic[..., :3].astype(np.float64))
    seen = shown.mean(axis=2)
    for k, cls in enumerate(R.CLASSES):
        m = on & (ids == k + 1)
        if not m.any():
            continue
        if cls in ('metal', 'leather') and cls in target and (cls == 'leather' or ramp is not None):
            tone = R._tone(seen, m)
            want = stretch(tone, target[cls], GAIN[cls]) + R.TONE[1] * (seen[m] - tone) * GAIN[cls]
            if cls == 'leather':
                out[m, :3] = R._relit(shown[m], seen[m], np.clip(want * dark, 0, 255))
                continue
            colours = np.asarray(ramp, dtype=np.float64)
            light = colours.mean(axis=1) + np.arange(len(colours)) * 1e-3
            lo, hi = float(np.percentile(target[cls], 2)), float(np.percentile(target[cls], 99))
            want = light[0] + (want - lo) / max(hi - lo, 1.0) * (light[-1] - light[0])
            out[m, :3] = np.clip(np.round(np.stack([np.interp(want, light, colours[:, c]) for c in range(3)], axis=1)),
                                 0, 255).astype(np.uint8)
        else:
            out[m, :3] = np.clip(np.round(shown[m]), 0, 255).astype(np.uint8)
    return R.unglint(out)


def masked(caps, bodies, ref):
    """A cap's hair mask on the render's canvas: every texel of each doll head that wears it (`bodies`) the cap leaves
    bare (`caps`, its texels), its hair, a circlet, its scalp, but never one of those heads' faces (dollarmourrender.py
    `hair_mask`)."""
    import dollarmour as D
    import dollarmourrender as R
    hair, faces = np.zeros_like(caps), np.zeros_like(caps)
    for key in bodies:
        gender, morph = key.split(':')
        head = R.doll_head(ref, key)
        face = R.doll_face(ref, D.FIRST[gender] + int(morph), head)
        hair |= head & ~face
        faces |= face
    return hair & ~caps & ~faces


def render_light(out, names, ref, samples, rows):
    """Every light-set picture asked for (`names`), body by body; `rows` every picture's index row, where a mask
    finds its cap's place."""
    import bpy
    import dollarmour as D
    import dollarmourrender as R
    spec = json.load(open(D.SPEC))
    jobs = {}   # body -> [(name, piece, kind, record, metal, mask, row)]
    for name, row in names.items():
        archive, record, metal, mask = parse(name)
        kinds, wears = table_of(archive)
        jobs.setdefault(wears[record][0], []).append((name, PIECES[archive], kinds[record], record, metal, mask, row))
    tones = ramps()
    for key, todo in sorted(jobs.items()):
        gender, morph = key.split(':')
        archive = D.FIRST[gender] + int(morph)
        f = spec[key]
        W, worn = dress(gender, f, {(piece, kind) for _, piece, kind, *_ in todo})
        R._stage(f, samples, R.MARGIN)
        _threads()
        body = R._body(W)
        every = {ob for obs in worn.values() for ob in obs}
        for ob in bpy.context.scene.objects:
            if ob.type == 'MESH' and ob not in body and ob not in every:
                ob.hide_render = True
        for ob in every:
            ob.hide_render = True
        sc = bpy.context.scene
        keep, sc.cycles.samples = sc.cycles.samples, 1
        try:
            outline = R._render()[..., 3] > 0
        finally:
            sc.cycles.samples = keep
        field = R.warp_field(outline, R.doll_outline(ref, key, outline))
        drawn = {}
        for ob in body:
            ob.is_holdout = True
        for job in sorted(todo):
            name, piece, kind, record, metal, mask, row = job
            if (piece, kind) not in drawn:
                obs = worn[(piece, kind)]
                for ob in every:
                    ob.hide_render = ob not in obs
                pic, ids = R._render(), R._ids(obs)
                drawn[(piece, kind)] = (R.warp(pic, field), R.warp(ids, field))
            pic, ids = drawn[(piece, kind)]
            target = R.targets(ref, archive, D.RECORDS[CLASSIC[piece]])
            done = R.unstray(R.unhair(finish(pic, ids, target, tones[metal] if kind == 'plated' else None,
                                             PLATED_LEATHER if kind == 'plated' else 1.0)))
            w, h, x, y = row[:4] if len(row) > 2 else (*row, *rows[name[:-len('_Mask')]][2:4])
            x0, y0 = x + R.MARGIN, y + R.MARGIN
            if mask:
                caps = done[..., 3] > 0
                hidden = masked(caps, table_of(522)[1][record], ref)
                pic_out = np.zeros((h, w, 4), dtype=np.uint8)
                pic_out[hidden[y0:y0 + h, x0:x0 + w], 3] = 255
            else:
                pic_out = done[y0:y0 + h, x0:x0 + w]
                lost = int((done[..., 3] > 0).sum() - (pic_out[..., 3] > 0).sum())
                if lost:
                    ys, xs = np.nonzero(done[..., 3])
                    print(f'{name}: {lost} texels past its box {[x0, y0, x0 + w, y0 + h]}, drawn over '
                          f'{[int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]}', flush=True)
            write(out, name, pic_out, (x, y))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ref', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='', help='archives to render (513,522)')
    ap.add_argument('--names', default='', help='pictures to render, by name')
    ap.add_argument('--samples', type=int, default=24)
    args = ap.parse_args()
    ref = json.load(open(args.ref))
    rows = sprites()
    only = {int(a) for a in args.only.split(',') if a}
    names = {n for n in args.names.split(',') if n}
    todo = {n: r for n, r in rows.items() if (not only or parse(n)[0] in only) and (not names or n in names)}
    os.makedirs(args.out, exist_ok=True)
    weapons = {n: r for n, r in todo.items() if parse(n)[0] in (513, 514)}
    if weapons:
        render_weapons(args.out, weapons, None, ref, args.samples)
    light = {n: r for n, r in todo.items() if parse(n)[0] in PIECES}
    if light:
        render_light(args.out, light, ref, args.samples, rows)


if __name__ == '__main__':
    main()
