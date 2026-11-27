"""Armour, cloaks and clothes drawn large, for the page's gear screens and item pages, as the weapons are (weaponart.py):
each look an armour or cloak slot wears, on each body, worn standing and seen from the front as the figure's strips are,
at the weapons' four times the body's pixels a metre, the body left out. Each piece is the figure's own layer, made, lit
and graded as its strip is (layers.py `set_graded`), so the page lays the same metal, dye, faction and cosmetic ramps on
it, and snaps it to the same palette. A look's layers are joined by depth, the nearest texel kept: a torso's cuirass and
pauldrons, legs' greaves and boots, a garment and its drape. A pair of gauntlets is brought side by side.

    python -I tools/sprite-forge/armourart.py --out public/art/armour [--body male] [--looks torso_steel,formal_cloak]

Writes `<out>/<body>/<look>.png`, cut to what it draws: each armour set's `head_<set>`, `torso_<set>`, `arms_<set>` and
`legs_<set>` where the set has the pieces, and each garment look of specs/armour-art.json, its garments joined by `+`
(`formal_cloak`, `shirt_long_round+short_tunic`). Without `--body` each body is drawn in a run of its own. `--check`
checks the looks and the joins without rendering."""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402
import numpy as np  # noqa: E402

import armour  # noqa: E402
import beastfolk  # noqa: E402
import clothes  # noqa: E402
import forge  # noqa: E402
import hair  # noqa: E402
import layers  # noqa: E402
import playing  # noqa: E402
import poses  # noqa: E402
import props3p  # noqa: E402
import riding  # noqa: E402
import shape  # noqa: E402
import stage  # noqa: E402
import torch3p  # noqa: E402
from weaponart import SIZE  # noqa: E402

BODIES = ('male', 'female')
SPEC = os.path.join(HERE, 'specs', 'armour-art.json')
# each armour slot's pieces of a set, and those it needs drawn to be worn at all (client gearLooks.ts `PIECES`,
# `setOf`): a torso's cuirass with its pauldrons where the set has them, legs' greaves and boots both
SLOTS = {'head': ('helm',), 'torso': ('cuirass', 'pauldrons'), 'arms': ('gauntlets',), 'legs': ('greaves', 'boots')}
NEEDED = {'head': ('helm',), 'torso': ('cuirass',), 'arms': ('gauntlets',), 'legs': ('greaves', 'boots')}
ANIM, VIEW = 'idle', 0   # worn standing, seen from the front
# the work frame at the figure's own size, its ground `BELOW` rows up: room for the body standing, a cloak's hem and a
# gauntlet at each hip, and nothing it draws may touch its edge
FRAME, BELOW = (120, 150), 12
GAP = 6   # clear texels between a pair of gauntlets brought side by side


def garment_looks():
    """The garment looks of the spec, each its garments in the order they are put on."""
    with open(SPEC) as fh:
        return [tuple(look) for look in json.load(fh)['garments']]


def name_of(garments):
    """A garment look's picture's name: its garments joined by `+`."""
    return '+'.join(garments)


def material_names(probe):
    """Every material a layer may be graded by, as layers.py `main` names them: the body's palette, the cloth, metal and
    paint the game dyes, and every outfit's own."""
    return sorted({*probe.M, *props3p.materials_(), 'garb', 'accent', 'metal', 'armourmail', 'bowmetal', 'paint',
                   'spark', 'staffwood', torch3p.MATERIAL, 'staffknob', 'crimson', *playing.materials(),
                   *beastfolk.materials_(), *hair.materials_(), *riding.horse.MATERIAL_OF.values()})


def set_looks(drawn, sets):
    """Each armour set's slot looks among the layers `drawn`: `<slot>_<set>` to its pieces' layers, where the set has
    every piece the slot needs."""
    out = {}
    for name in sets:
        low = name.lower()
        for slot, pieces in SLOTS.items():
            if all(f'{piece}_{low}' in drawn for piece in NEEDED[slot]):
                out[f'{slot}_{low}'] = [f'{piece}_{low}' for piece in pieces if f'{piece}_{low}' in drawn]
    return out


def garment_layers(garments, drawn):
    """A garment look's layers among those `drawn`: each garment's shells and its drape over the body, as the figure
    wears it with nothing over it (client outfit.ts `outfitLayers`); None where a garment draws neither."""
    out = []
    for garment in garments:
        own = [name for name in (garment, f'{garment}_drape') if name in drawn]
        if not own:
            return None
        out += own
    return out


def joined(drawn):
    """Layers drawn in one frame (`layers.render`'s colour, depth and corner each) as one picture, the nearest texel
    kept where two meet, cut to what it draws; None where none draws anything."""
    drawn = [d for d in drawn if d is not None]
    if not drawn:
        return None
    x0, y0 = min(d[2] for d in drawn), min(d[3] for d in drawn)
    x1 = max(d[2] + d[0].shape[1] for d in drawn)
    y1 = max(d[3] + d[0].shape[0] for d in drawn)
    rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
    depth = np.full((y1 - y0, x1 - x0), np.inf)
    for work, zs, left, top, *_ in drawn:
        h, w = work.shape[:2]
        region = (slice(top - y0, top - y0 + h), slice(left - x0, left - x0 + w))
        nearer = (work[..., 3] > 0) & (zs < depth[region])
        rgba[region][nearer] = work[nearer]
        depth[region][nearer] = zs[nearer]
    rows, columns = np.nonzero(rgba[..., 3])
    return rgba[rows.min():rows.max() + 1, columns.min():columns.max() + 1]


def side_by_side(rgba, gap=GAP):
    """A pair worn apart (a gauntlet at each hip) brought together: split at its widest run of clear columns, the two
    laid `gap` texels apart with their rows kept as worn. One with no run wider than twice `gap` is as it is."""
    columns = np.flatnonzero(rgba[..., 3].any(axis=0))
    runs = np.diff(columns) - 1
    if len(runs) == 0 or runs.max() <= 2 * gap:
        return rgba
    at = int(np.argmax(runs))
    left = rgba[:, columns[0]:columns[at] + 1]
    right = rgba[:, columns[at + 1]:columns[-1] + 1]
    out = np.zeros((rgba.shape[0], left.shape[1] + gap + right.shape[1], 4), np.uint8)
    out[:, :left.shape[1]] = left
    out[:, left.shape[1] + gap:] = right
    return out


def check():
    """The looks and the joins, without rendering: every garment of the spec the wardrobe's, each look once; a slot's
    pieces armour's; the nearest texel kept where two layers meet; a pair brought side by side."""
    looks = garment_looks()
    assert len(set(looks)) == len(looks), 'a garment look twice'
    unknown = sorted({g for look in looks for g in look} - set(clothes.LAYERS))
    assert not unknown, f'garments the wardrobe has not: {unknown}'
    assert all(set(SLOTS[slot]) >= set(NEEDED[slot]) for slot in SLOTS)
    assert sorted(p for pieces in SLOTS.values() for p in pieces) == sorted(armour.PIECES), 'every piece in one slot'
    drawn = {'cuirass_steel', 'greaves_steel', 'boots_steel', 'helm_chain', 'cuirass_chain'}
    assert set_looks(drawn, ['Steel', 'Chain']) == {
        'torso_steel': ['cuirass_steel'], 'legs_steel': ['greaves_steel', 'boots_steel'], 'head_chain': ['helm_chain'],
        'torso_chain': ['cuirass_chain']}, 'a slot drawn only where its set has the pieces it needs'
    assert garment_layers(('long_skirt', 'shoes'), {'long_skirt', 'long_skirt_drape', 'shoes'}) == [
        'long_skirt', 'long_skirt_drape', 'shoes']
    assert garment_layers(('formal_cloak',), {'formal_cloak_drape'}) == ['formal_cloak_drape']
    assert garment_layers(('vest',), set()) is None
    far = (np.full((2, 2, 4), 9, np.uint8), np.full((2, 2), 5.0), 0, 0)
    near = (np.full((1, 1, 4), 200, np.uint8), np.full((1, 1), 1.0), 1, 1)
    both = joined([far, near])
    assert both.shape == (2, 2, 4) and both[1, 1, 0] == 200 and both[0, 0, 0] == 9, 'the nearer texel kept'
    pair = np.zeros((3, 40, 4), np.uint8)
    pair[:, 2:5] = pair[:, 30:33] = 255
    together = side_by_side(pair)
    assert together.shape == (3, 3 + GAP + 3, 4) and not together[:, 3:3 + GAP, 3].any(), 'a pair laid side by side'
    assert side_by_side(pair[:, :20]).shape[1] == 20, 'one piece kept as it is'
    print(f'armourart: {len(looks)} garment looks and the joins check')


def draw(body, out, wanted, samples):
    """Every look of `body` (those `wanted`, where named) drawn into `<out>/<body>/`."""
    spec, per = layers.load_body(body)
    layers.PER.update(per)
    poses.CARRY[0] = True   # the forge's own carry in the idle, as the figures run's
    stage.PX_PER_M *= shape.SHAPE['scale'] * SIZE
    bpy.ops.wm.read_factory_settings(use_empty=True)
    stage.setup(samples)
    names = material_names(forge.Fighter('naked', body, 'axe'))
    for ob in [ob for ob in bpy.data.objects if ob.type == 'MESH']:
        bpy.data.objects.remove(ob, do_unlink=True)
    ids_of = {name: index + 1 for index, name in enumerate(names)}
    classify = lambda m: ids_of.get(m.name.split('.')[0], 0) if m else 0   # noqa: E731
    # the armour's own leather and mail, and the wardrobe's cloth on Daggerfall's (layers.py `main`, each set)
    forge.GRADE.setdefault('leather', armour.LEATHER_GRADE)
    forge.GRADE.setdefault('armourmail', armour.MAIL_GRADE)
    forge.GRADE.setdefault('garb', clothes.CLOTH_GRADE)
    forge.GRADE.setdefault('accent', clothes.CLOTH_GRADE)
    sets = [name for name in armour.SETS if not wanted or any(w.endswith(f'_{name.lower()}') for w in wanted)]
    garments = [look for look in garment_looks() if not wanted or name_of(look) in wanted]
    built = layers.armour_layers(body, classify, sets) if sets else []
    shown = {g for look in garments for g in look} | {f'{g}_drape' for look in garments for g in look}
    built += layers.wardrobe_layers(body, classify, shown) if garments else []
    by_name = {ly.name: ly for ly in built}
    looks = set_looks(by_name, sets)
    for look in garments:
        layer_names = garment_layers(look, by_name)
        if layer_names:
            looks[name_of(look)] = layer_names
    looks = {name: layer_names for name, layer_names in looks.items() if not wanted or name in wanted}
    folder = os.path.join(out, body)
    os.makedirs(folder, exist_ok=True)
    tmp = os.path.join(tempfile.mkdtemp(), 'armour.png')
    width, height = FRAME[0] * SIZE, FRAME[1] * SIZE
    stage.resize(width, height, below=BELOW * SIZE)
    rendered, started = {}, time.time()
    for name, layer_names in looks.items():
        for layer_name in layer_names:
            if layer_name not in rendered:
                got = layers.set_graded(by_name[layer_name], ANIM, 0, VIEW, per, tmp, names)
                if got is not None:
                    work, _, x0, y0, _ = got
                    if x0 <= 0 or y0 <= 0 or x0 + work.shape[1] >= width or y0 + work.shape[0] >= height:
                        raise ValueError(f'armourart: {layer_name} on the {body} body reaches its frame\'s edge')
                rendered[layer_name] = got
        picture = joined([rendered[layer_name] for layer_name in layer_names])
        if picture is None:
            print(f'{body} {name}: draws nothing', flush=True)
            continue
        if name.startswith('arms_'):
            picture = side_by_side(picture)
        stage.write_png(os.path.join(folder, f'{name}.png'), picture)
        print(f'{body} {name}: {picture.shape[1]} x {picture.shape[0]}', flush=True)
    print(f'armourart: {len(looks)} looks on the {body} body in {time.time() - started:.0f} s', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--out', default='public/art/armour')
    parser.add_argument('--body', choices=BODIES, help='this body alone; each in a run of its own without it')
    parser.add_argument('--looks', default='', help='only these looks, by name')
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--check', action='store_true', help='check the looks and the joins, and render nothing')
    args = parser.parse_args()
    if args.check:
        check()
        return
    if args.body is None:
        for body in BODIES:
            subprocess.run([sys.executable, '-I', os.path.abspath(__file__), '--body', body, '--out', args.out,
                            '--looks', args.looks, '--samples', str(args.samples)], check=True)
        return
    draw(args.body, args.out, {name for name in args.looks.split(',') if name}, args.samples)


if __name__ == '__main__':
    main()
