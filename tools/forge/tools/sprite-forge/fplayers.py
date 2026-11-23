"""A held weapon's frames as two layers the game lays together - the dagger's (WEAPON02) and the sword's (WEAPON04): the
hand alone in each armour set and bare, and the weapon alone in each metal's own make (fpdaggers.py, fpsword.py), each
pixel with its depth. The game draws the nearer layer at each pixel and dyes each by its own metal: the hand by the
gauntlets', the weapon by its own. So any gauntlets hold any dagger or sword, and the weapon's dye never reaches the
sleeve.

    python -I tools/sprite-forge/fplayers.py --out public/art/studio/forge/WEAPON02/layers [--sets Iron,Chain]
        [--metals Steel,Daedric] [--samples 256]
    python -I tools/sprite-forge/fplayers.py --weapon sword --out public/art/studio/forge/WEAPON04/layers

Writes `<FILE>_<record>-<frame>_hand[_<Set>].png` (`_hand` the bare hand, in the glove and sleeve every picture
wears) and `..._weapon[_<Metal>].png` (`_weapon` steel's), each with its depth beside it
(`..._z.png`: the distance before the eye in tenths of a millimetre, its high byte red and its low byte green). Each
layer is rendered with the other in place, hidden from the eye alone, so each still shades and shadows the other. The
sword's hand is rendered round the steel sword: every metal's is held in the one fist."""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np  # noqa: E402

import fparm  # noqa: E402
import fpdagger  # noqa: E402
import fpdaggers  # noqa: E402
import fpforge  # noqa: E402
import fpmodel  # noqa: E402
import fpstage  # noqa: E402
import fpwear  # noqa: E402

SPECS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'specs')
SPEC = {'dagger': os.path.join(SPECS, 'WEAPON02.json'), 'sword': os.path.join(SPECS, 'WEAPON04.json')}
SETS = ('Leather', 'Chain', 'Iron', 'Steel', 'Silver', 'Elven', 'Dwarven', 'Mithril', 'Adamantium', 'Ebony',
        'Orcish', 'Daedric')
METALS = ('Steel',) + fpdaggers.METALS
DEPTH = 10000.0   # depth's units a metre: tenths of a millimetre, sixteen bits reaching past six metres
# the held weapon's hilt, guard and trim by their materials in the part (fpsword.py, fpdagger.py), marked for a
# faction's colour as the figure's are (stage.py `mark_trim`): the sword's fittings, its grip and the materials its hilt
# makes of its own (`sword:`), the dagger's brass, pommel, grip, fittings and accent; never a blade, a glow or a stone
TRIM_MATS = ('sword_fit', 'sword_grip', 'hilt', 'pommel', 'dagger_grip', 'dagger_fit', 'dagger_accent')


def is_trim(name):
    """Whether the part's material `name` is the held weapon's hilt, guard or trim (`TRIM_MATS`)."""
    return name in TRIM_MATS or (name.startswith('sword:') and 'glow' not in name)


def makes_of(weapon):
    """The makes a weapon's layers are drawn in: every metal's, and a sword's short swords of the owner's too
    (`OrcishShort`, fpsword.py `owner`)."""
    import gear
    import fpsword
    shorts = tuple(f'{m}{fpsword.SHORT}' for m in fpdaggers.METALS if gear.owner_sword(m, True))
    return METALS + (shorts if weapon == 'sword' else ())


def own_of(weapon):
    """The held weapon's own materials, past the arm's: all the part draws that is not the hand."""
    if weapon == 'dagger':
        return fpdagger.DAGGER_MATS
    import fpsword
    return fpsword.SWORD_MATS + fpsword.own_mats(fpsword.DESIGN['metal'])


def dress(material, weapon='dagger'):
    """Put `material`'s set on the held weapon's hand (None: bare): its garments and plate, as the fists wear them
    (fparmour.py), its materials counted past the weapon's, plate and mail read as metal (graded grey, dyed in the
    game). The dagger's and the sword's hand is one arm (fpdagger.py `WEAR`). Gives back what to restore."""
    import fparmour
    import fpforge
    saved = dict(fpdagger.WEAR), dict(fpmodel.WEAPONS[weapon]), fpmodel.palette, dict(fpforge.CLASSES)
    if material is None:
        return saved
    kind = fparmour.style(material).get('kind', 'plate')
    outfit = fparmour.OUTFITS.get(material, fparmour.OUTFITS['plate'])
    own = own_of(weapon)
    past = len(fparm.mats(outfit)) + len(own)   # where the set's own materials count from

    def plate(k, r, cuff_z):   # its plate's materials past the weapon's, the glove's own leather as it was
        make = (fparmour.chain_pieces(material) if kind == 'chain' else fparmour.leather_pieces(material)
                if kind == 'leather' else fparmour.hand_pieces(material, fpmodel.SHAPE.get('thumb') or 1.0))
        return [(v, t, m - fparmour.BASE + past if m >= fparmour.BASE else m, p) for v, t, m, p in make(k, r, cuff_z)]
    fpdagger.WEAR.update(outfit=outfit, armour=plate)
    fpmodel.WEAPONS[weapon] = {**saved[1], 'mats': fparm.mats(outfit) + own + fparmour.EXTRA}
    fpmodel.palette = fparmour.dressed(saved[2], material)
    fpforge.CLASSES.update(fparmour.ARMOUR_CLASSES)
    return saved


def undress(saved, weapon='dagger'):
    import fpforge
    fpdagger.WEAR.clear()
    fpdagger.WEAR.update(saved[0])
    fpmodel.WEAPONS[weapon] = saved[1]
    fpmodel.palette = saved[2]
    fpforge.CLASSES.clear()
    fpforge.CLASSES.update(saved[3])


def hand_names(names, weapon='dagger'):
    """The hand's materials among a dressed weapon's: all but the weapon's own."""
    own = own_of(weapon)
    return tuple(n for n in names if n not in own)


def depth_map(eye, pose, part, record, ids, trim_ids=()):
    """Each pixel's distance before the eye of the nearest triangle of materials `ids` (their indices among the
    weapon's), by the fitter's raster (0 none): where the ray through the pixel's middle meets that triangle's plane;
    and whether that triangle is of the materials `trim_ids`, (depth, trim)."""
    S, _, (v, t, c) = eye.drawn(part, record)
    keep = np.isin(c, [i + 1 for i in ids])
    t, trimmed = t[keep], np.isin(c[keep], [i + 1 for i in trim_ids])
    v = fpmodel.posed(eye.weapon, part, v, pose, S)
    M, _ = fpstage.pose_matrix(pose, S, fpmodel.length(eye.weapon, S, part))
    P = v @ M[:3, :3].T + M[:3, 3]
    tri = fpstage.raster(*fpstage.project(P, S), t)
    out = np.zeros(tri.shape)
    on = tri >= 0
    trim = np.zeros(tri.shape, bool)
    if not on.any():
        return out, trim
    trim[on] = trimmed[tri[on]]
    ys, xs = np.nonzero(on)
    ray = np.stack([(xs + 0.5 - fpstage.OX - fpstage.CX) / S['focal'], np.ones(len(xs)),
                    -(ys + 0.5 - fpstage.OY - fpstage.CY) / (S['focal'] * S['aspect'])], axis=1)
    k = t[tri[on]]
    a, b, c3 = P[k[:, 0]], P[k[:, 1]], P[k[:, 2]]
    n = np.cross(b - a, c3 - a)
    den = (n * ray).sum(axis=1)
    y = np.where(np.abs(den) > 1e-12, (n * a).sum(axis=1) / np.where(np.abs(den) > 1e-12, den, 1.0), a[:, 1])
    out[on] = np.clip(y, fpstage.NEAR, None)
    return out, trim


def depth_picture(pic, depth):
    """A layer's depth as a picture: each drawn texel's distance in DEPTH's units, high byte red and low green; where
    the render draws and the raster misses by a hair, its nearest texel's."""
    on = pic[..., 3] > 127
    if (on & (depth <= 0)).any() and (depth > 0).any():
        from scipy import ndimage as ndi
        _, (iy, ix) = ndi.distance_transform_edt(depth <= 0, return_indices=True)
        depth = depth[iy, ix]
    q = np.clip(np.round(depth * DEPTH), 0, 65535).astype(np.int64)
    out = np.zeros(pic.shape[:2] + (4,), dtype=np.uint8)
    out[..., 0], out[..., 1], out[..., 3] = q >> 8, q & 255, np.where(on, 255, 0)
    out[~on, :2] = 0
    return out


def layers(eye, spec, which, records=None, weapon='dagger'):
    """Every frame's layer `which` ('hand' or 'weapon') and its depth, whole screens by record: a mirrored record its
    source's flipped."""
    names = eye.names
    hand = hand_names(names, weapon)
    own = own_of(weapon)
    only = hand if which == 'hand' else own
    ids = [i for i, n in enumerate(names) if n in only]
    trim_ids = [i for i in ids if which == 'weapon' and is_trim(names[i])]
    out = {}

    def of(r):
        if r in out:
            return out[r]
        rec = spec['records'][r]
        if 'mirror' in rec:
            out[r] = [tuple(fpforge.flipped(each, rec) for each in frame) for frame in of(rec['mirror'])]
            return out[r]
        frames = []
        fpforge.aim(spec, r)
        for f in range(rec['frames']):
            pose, part = fpforge.FIT[f'{r}:{f}'], fpforge.part_of(spec, rec)
            scr = eye.screen(pose, part, only=only, record=r, solid=own)
            frames.append((scr, *depth_map(eye, pose, part, r, ids, trim_ids)))
        out[r] = frames
        return out[r]
    for r in range(len(spec['records'])):
        if records is None or r in records:
            of(r)
    return out


def write(spec, screens, out_dir, stem, records=None):
    import stage
    n = 0
    for r, frames in sorted(screens.items()):
        if records is not None and r not in records:
            continue
        rec = spec['records'][r]
        for f, (scr, depth, trim) in enumerate(frames):
            pic = stage.mark_trim(fpforge.cut(scr, fpforge.out_rect(rec)), fpforge.cut(trim, fpforge.out_rect(rec)))
            z = depth_picture(pic, fpforge.cut(depth[..., None], fpforge.out_rect(rec))[..., 0])
            name = f"{spec['archive']}_{r}-{f}_{stem}"
            at = fpforge.marks(spec, rec)
            stage.write_png(os.path.join(out_dir, f'{name}.png'), pic, **at)
            stage.write_png(os.path.join(out_dir, f'{name}_z.png'), z, **at)
            n += 1
    return n


def design(weapon, metal):
    """Lay `metal`'s make on the held weapon (fpdaggers.py's dagger; the sword its hilt and blade, fpmetals.py's, with
    its own grade and its veins' glow). Gives back what to restore."""
    if weapon == 'dagger':
        return fpdaggers.design(metal)
    import fpmetals
    held, load, glow = fpmetals.wield(metal, 'sword'), fpforge.load, fpmetals.GLOW
    fpforge.load = fpmetals.own_load('sword', metal, load)
    fpmetals.GLOW = fpmetals.OWN['sword'].get(metal, {}).get('glow', glow)
    return held, load, glow


def undesign(weapon, saved):
    if weapon == 'dagger':
        return fpdaggers.undesign(saved)
    import fpmetals
    held, load, glow = saved
    fpmetals.unwield('sword', held)
    fpforge.load, fpmetals.GLOW = load, glow
    fpstage.set_lights = fpmetals.SET_LIGHTS
    fpforge.GRADE_AS.clear()


def main():
    import bpy  # noqa: F401  (armour.py reads mathutils, which Blender brings)
    import armour
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--weapon', default='dagger', choices=sorted(SPEC))
    ap.add_argument('--sets', default='bare,' + ','.join(SETS + armour.GUILDS), help='`bare` the hand every picture wears')
    ap.add_argument('--metals', default='', help='the makes drawn (`makes_of`, by default)')
    ap.add_argument('--records', default='')
    ap.add_argument('--samples', type=int, default=256)
    ap.add_argument('--wear-only', action='store_true', help="the weapon layers' wear maps alone, no hand (fpwear.py)")
    ap.add_argument('--left', action='store_true', help="the left hand's layers, under the light mirrored (fpleft.py)")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    weapon, spec_path = args.weapon, SPEC[args.weapon]
    only = {int(r) for r in args.records.split(',') if r != ''} or None
    if args.left:   # each layer's twin for the left hand: `_hand_IronLeft` beside `_hand_Iron`, `_weapon_Left` beside `_weapon`
        import fpleft
        assert not args.wear_only, "a left layer is worn by its twin's map"
        fpleft.mirror_light()

    def named(layer, look):
        return f'{layer}_{look or ""}Left' if args.left else layer + (f'_{look}' if look else '')
    for s in [s for s in args.sets.split(',') if s and not args.wear_only]:
        held = design(weapon, 'Steel')   # the sword's hand round the steel sword
        saved = dress(None if s == 'bare' else s, weapon)
        try:
            spec = fpforge.load(spec_path)
            if s != 'bare':   # plate and mail graded as the fists' are: onto the metal band, grey for the dye
                import fparmour
                fpforge.GRADE.update(fparmour.grades(s))
            eye = fpforge.Eye(spec, args.samples)
            stem = named('hand', None if s == 'bare' else s)
            n = write(spec, layers(eye, spec, 'hand', only, weapon), args.out, stem, only)
        finally:
            undress(saved, weapon)
            undesign(weapon, held)
        print(f'hand {s}: {n} frames into {args.out}', flush=True)
    for metal in [m for m in args.metals.split(',') if m] or makes_of(weapon):
        saved = design(weapon, metal)
        try:
            spec = fpforge.load(spec_path)
            eye = fpforge.Eye(spec, args.samples, render=not args.wear_only)
            stem = named('weapon', None if metal == 'Steel' else metal)
            n = (fpwear.layer(eye, spec, own_of(weapon), args.out, stem, only) if args.wear_only else
                 write(spec, layers(eye, spec, 'weapon', only, weapon), args.out, stem, only))
        finally:
            undesign(weapon, saved)
        print(f'weapon {metal}: {n} frames into {args.out}', flush=True)


if __name__ == '__main__':
    main()
