"""Publishes the sprite forge's renders and tables to R2, and pulls the tables back so the forge can render more.

    python3 -I tools/forge_publish.py publish   # pack tools/forge/public/art/studio, upload, write the manifest
    python3 -I tools/forge_publish.py add       # the same for the pictures there, beside those already published
    python3 -I tools/forge_publish.py pull [--strips]   # the tables back, and with --strips every strip as PNG
    python3 -I tools/forge_publish.py roll|lattice|figures <folder>...   # a roll, Lattice or figures run laid in
    python3 -I tools/forge_publish.py jobs <moves>      # the figures workflow's render jobs, as a matrix

Every object is named by the SHA-256 of its bytes, so a published object never changes and is cached for good. The
upload goes through tools/r2.py.
"""
import argparse
import io
import json
import os
import re
import shutil
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
# Run with -I, the script's own folder is not on the path: R2's door sits beside it.
sys.path.insert(0, HERE)
from r2 import PUBLIC, published, put  # noqa: E402

REPO = os.path.dirname(HERE)
FORGE = os.path.join(HERE, 'forge')
TABLES_DIR = os.path.join(FORGE, 'src', 'systems', 'studioArt')
PACKED = os.path.join(FORGE, 'packs')
MANIFEST = os.path.join(REPO, 'content', 'forge', 'renders.json')
TABLES = {
    'looks': 'forgeLooks.json',
    'skins': 'forgeRaceSkins.json',
    'hair': 'forgeHairColours.json',
    'points-male': 'forgePoints-male.json',
    'points-female': 'forgePoints-female.json',
    'dyes': 'forgeDyes.json',
    'frames': 'forgeFrames.json',
}
ART = os.path.join(FORGE, 'public', 'art')


def placed(path):
    """Where a first-person frame sits on the 320 x 200 screen (its PNG's `oFFs`), and the box within it Daggerfall
    aligns (`boXs`), or None. WebP keeps neither, so they are kept in the frames table."""
    with open(path, 'rb') as file:
        data = file.read()
    found, at = {}, 8
    while at + 8 <= len(data):
        length, kind = struct.unpack('>I4s', data[at:at + 8])
        body = data[at + 8:at + 8 + length]
        if kind == b'oFFs':
            found['at'] = list(struct.unpack('>ii', body[:8]))
        elif kind == b'boXs':
            found['box'] = list(struct.unpack('>iiii', body[:16]))
        elif kind == b'IDAT':
            break
        at += 12 + length
    return found or None


def placements():
    """Every picture's placement, by its path in the pack index: the studio's own, and the site's own as `@art/`."""
    table = {}
    for base, _dirs, names in os.walk(ART):
        for name in names:
            if not name.endswith('.png'):
                continue
            full = os.path.join(base, name)
            rel = os.path.relpath(full, ART).replace(os.sep, '/')
            key = rel[len('studio/'):] if rel.startswith('studio/') else f'@art/{rel}'
            where = placed(full)
            if where:
                table[key] = where
    return table


def write_frames(table):
    with open(os.path.join(TABLES_DIR, TABLES['frames']), 'w') as file:
        json.dump(table, file, separators=(',', ':'))
    print(f'{len(table)} placed frames', flush=True)


def packed():
    """The pictures on disk packed and uploaded: their index, its packs named by their keys on R2."""
    pack = os.path.join(FORGE, 'tools', 'forgeViewer', 'pack.py')
    # Every pack as an asset pack: R2 has no per-page file budget to split them by.
    subprocess.run([sys.executable, '-I', pack, '--out', PACKED, '--files-mib', '0'], check=True)
    with open(os.path.join(PACKED, 'index.json')) as file:
        index = json.load(file)
    keys = []
    for name in index['packs']:
        with open(os.path.join(PACKED, name), 'rb') as file:
            keys.append(put(file.read(), 'packs', 'webp', 'image/webp'))
    index['packs'] = keys
    return index


def publish():
    write_frames(placements())
    write_manifest(packed())


def add():
    """The pictures on disk published beside those already published, so the rest need not be pulled: new packs for
    them alone, added to the published index and frames table (a path already published is replaced). The other
    tables are those in the forge's table folder, so `pull` comes first."""
    with open(MANIFEST) as file:
        manifest = json.load(file)
    index = json.loads(published(manifest, manifest['index']))
    write_frames({**json.loads(published(manifest, manifest['tables']['frames'])), **placements()})
    beside(index, packed())
    write_manifest(index)


def beside(index, new):
    """`new`'s packs and pictures laid into `index`: a pack already published (named by its bytes' hash) keeps its one
    place, and each picture of `new` points at its pack's place."""
    place = []
    for key in new['packs']:
        if key not in index['packs']:
            index['packs'].append(key)
        place.append(index['packs'].index(key))
    for path, (pack, *rest) in new['pictures'].items():
        index['pictures'][path] = [place[pack], *rest]


def write_manifest(index):
    """The index and the tables uploaded, and the manifest that names them written."""
    listing = json.dumps(index, separators=(',', ':')).encode()
    manifest = {'base': PUBLIC, 'index': put(listing, 'index', 'json', 'application/json'), 'tables': {}}
    for name, file_name in TABLES.items():
        with open(os.path.join(TABLES_DIR, file_name), 'rb') as file:
            manifest['tables'][name] = put(file.read(), 'tables', 'json', 'application/json')
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w') as file:
        json.dump(manifest, file, indent=2)
        file.write('\n')
    print(f'{len(index["pictures"])} pictures in {len(index["packs"])} packs; manifest written to {MANIFEST}')


def pull(strips):
    from PIL import Image

    with open(MANIFEST) as file:
        manifest = json.load(file)
    os.makedirs(TABLES_DIR, exist_ok=True)
    for name, key in manifest['tables'].items():
        with open(os.path.join(TABLES_DIR, TABLES[name]), 'wb') as file:
            file.write(published(manifest, key))
        print(f'pulled {TABLES[name]}')
    if not strips:
        return
    index = json.loads(published(manifest, manifest['index']))
    by_pack = {}
    for path, (pack, offset, length, _kind) in index['pictures'].items():
        by_pack.setdefault(pack, []).append((path, offset, length))
    studio = os.path.join(FORGE, 'public', 'art', 'studio')
    for pack, pictures in sorted(by_pack.items()):
        data = published(manifest, index['packs'][pack])
        for path, offset, length in pictures:
            out = os.path.join(studio, path)
            os.makedirs(os.path.dirname(out), exist_ok=True)
            # Lossless WebP back to PNG: the same texels the forge wrote.
            Image.open(io.BytesIO(data[offset:offset + length])).save(out)
        print(f'unpacked pack {pack + 1} of {len(index["packs"])}', flush=True)


def merge_roll(looks, roll):
    """`roll`, a forge index of the dodge roll alone, laid into `looks`: each body's roll, and each layer's roll cell
    and its place among the layer's moves, for the bodies in both. Answers the bodies laid in."""
    merged = []
    for name, own in roll['bodies'].items():
        body = looks['bodies'].get(name)
        if body is None:
            continue
        body.setdefault('anims', {}).update(own.get('anims', {}))
        for layer, cells in own.get('cells', {}).items():
            body.setdefault('cells', {}).setdefault(layer, {}).update(cells)
        for layer, moves in own.get('layers', {}).items():
            kept = body.setdefault('layers', {}).setdefault(layer, [])
            kept += [move for move in moves if move not in kept]
        merged.append(name)
    return merged


def roll(folder):
    """The dodge roll DFO drew outside its studio (its tools/sprite-forge/elsewhere/roll) laid into the forge's: its
    strips beside the studio's, and its moves in the looks table, so `add` publishes both."""
    path = os.path.join(TABLES_DIR, TABLES['looks'])
    with open(path) as file:
        looks = json.load(file)
    with open(os.path.join(folder, 'forgeLooks.json')) as file:
        own = json.load(file)
    merged = merge_roll(looks, own)
    with open(path, 'w') as file:
        json.dump(looks, file, separators=(',', ':'))
    laid = 0
    for name in merged:
        target = os.path.join(ART, 'studio', 'forge', 'layers', name)
        os.makedirs(target, exist_ok=True)
        for picture in os.listdir(os.path.join(folder, name)):
            # A strip and its depth twin, by the forge's names; anything else in the folder stays behind.
            if picture.endswith(('_roll.png', '_roll_z.png')):
                shutil.copyfile(os.path.join(folder, name, picture), os.path.join(target, picture))
                laid += 1
    skipped = sorted(set(own['bodies']) - set(merged))
    print(f'{laid} roll strips laid in for {", ".join(merged)}; the looks table has the roll'
          + (f'; no such body in the looks table: {", ".join(skipped)}' if skipped else ''))


# The Lattice's skin: the ashen grey-green of the dead, each share of the man's skin light laid on these weights, so a
# Lattice body shades as a man's does but in no living tone. Its own skin and every race's are this one, so a race's
# tone over the races' mean is none and every tone asked for draws it.
DEAD_SKIN = (0.80, 0.90, 0.78)
# The global tables of the looks index a layer's entry goes in; a layer's own (its order, cover and under) or its list.
LOOK_VALUES = ('order', 'cover', 'under')
LOOK_LISTS = ('dye', 'metal')
WAVE_FRAMES = os.path.join(ART, 'lattice')


def dead_skin(ramp):
    """A skin ramp in the dead's colour: each share's light (its channels' mean) on DEAD_SKIN's weights."""
    return [[round(sum(colour) / 3 * weight, 1) for weight in DEAD_SKIN] for colour in ramp]


def merge_foe(looks, skins, own):
    """A Lattice render's index (`own`, render.py's forgeLooks.json for one or more of a foe's moves) laid into the
    forge's: each move it drew replacing what was published of that move (its cell, the layers drawn in it and their
    own cells), each Lattice layer's order, cover and under, each layer's dye, and the body's skin made from the man's
    in the dead's colour. Answers the bodies laid in. A body's name becomes a folder's, so one that is not a plain
    name (a run's artifact is another's upload) stops the run before anything is laid in."""
    for name in own['bodies']:
        if not re.fullmatch(r'[a-z_]+', name):
            sys.exit(f'a Lattice render names a body {name!r}: only lower-case letters and underscores')
    man = skins['bodies']['male']
    for name, body in own['bodies'].items():
        kept = looks['bodies'].setdefault(name, {})
        drawn = set(body.get('anims', {}))
        for moves in kept.get('layers', {}).values():
            moves[:] = [move for move in moves if move not in drawn]
        for cells in kept.get('cells', {}).values():
            for move in drawn:
                cells.pop(move, None)
        kept.setdefault('anims', {}).update(body.get('anims', {}))
        for layer, cells in body.get('cells', {}).items():
            kept.setdefault('cells', {}).setdefault(layer, {}).update(cells)
        for layer, moves in body.get('layers', {}).items():
            listed = kept.setdefault('layers', {}).setdefault(layer, [])
            listed += [move for move in moves if move not in listed]
        skins['bodies'][name] = {'skin': [dead_skin(ramp) for ramp in man['skin']],
                                 'races': {race: dead_skin(ramp) for race, ramp in man['races'].items()}}
    for table in LOOK_VALUES:
        for layer, value in own.get(table, {}).items():
            # a wardrobe layer keeps the forge's own; the Lattice's own take what this render drew them with
            if layer.startswith('lattice_'):
                looks.setdefault(table, {})[layer] = value
            else:
                looks.setdefault(table, {}).setdefault(layer, value)
    for table in LOOK_LISTS:
        listed = looks.setdefault(table, []) if own.get(table) else []
        listed += [layer for layer in own.get(table, []) if layer not in listed]
    looks.setdefault('depth', own.get('depth'))
    return list(own['bodies'])


def wave_frames(folder):
    """wave.py's strip cut into its frames, each a picture of the site's own (`@art/lattice/wave-<frame>.png`), as
    the Arts' birds are."""
    from PIL import Image

    with open(os.path.join(folder, 'lattice_wave.json')) as file:
        told = json.load(file)
    strip = Image.open(os.path.join(folder, 'lattice_wave.png'))
    width, height = told['cell']
    os.makedirs(WAVE_FRAMES, exist_ok=True)
    for frame in range(told['frames']):
        strip.crop((frame * width, 0, (frame + 1) * width, height)).save(os.path.join(WAVE_FRAMES, f'wave-{frame}.png'))
    return told['frames']


def lattice(folders):
    """Every Lattice render in `folders` laid in beside the studio's, for `add` to publish: each foe's strips, its index
    and its skin (render.py's --out folders), and the death wave's frames (wave.py's)."""
    paths = {name: os.path.join(TABLES_DIR, TABLES[name]) for name in ('looks', 'skins')}
    tables = {}
    for name, path in paths.items():
        with open(path) as file:
            tables[name] = json.load(file)
    laid = 0
    for folder in folders:
        if os.path.exists(os.path.join(folder, 'lattice_wave.json')):
            print(f'{wave_frames(folder)} wave frames from {folder}')
            continue
        with open(os.path.join(folder, 'forgeLooks.json')) as file:
            own = json.load(file)
        for name in merge_foe(tables['looks'], tables['skins'], own):
            target = os.path.join(ART, 'studio', 'forge', 'layers', name)
            os.makedirs(target, exist_ok=True)
            for picture in os.listdir(os.path.join(folder, name)):
                if picture.endswith('.png'):
                    shutil.copyfile(os.path.join(folder, name, picture), os.path.join(target, picture))
                    laid += 1
    for name, path in paths.items():
        with open(path, 'w') as file:
            json.dump(tables[name], file, separators=(',', ':'))
    print(f'{laid} Lattice strips laid in from {len(folders)} folders; the looks and skins tables have them')


# The forge's sets of layers (layers.py --set), each drawn by a run of its own: the classic set first, as it draws the
# body, whose cell a move takes; the hair and the beasts' bodies are few, so each draws every move asked for at once.
SETS = ('classic', 'wardrobe', 'armour', 'hair', 'beast')
WHOLE_SETS = ('hair', 'beast')
FIGURE_BODIES = ('male', 'female')


def jobs(moves):
    """The figures workflow's render jobs for `moves`: one for each set, body and move, and one for each of the few
    sets' and body's every move, as GitHub Actions' `include` list."""
    named = list(dict.fromkeys(move for move in moves.split(',') if move))
    bad = [move for move in named if not re.fullmatch(r'[a-z0-9_]+', move)]
    if bad or not named:
        sys.exit(f'figures wants moves by their names, comma-separated: {moves!r}')
    out = []
    for kind in SETS:
        for body in FIGURE_BODIES:
            for run in ([','.join(named)] if kind in WHOLE_SETS else named):
                out.append({'set': kind, 'body': body, 'anims': run, 'name': f'{kind}-{body}-{run.replace(",", "-")}'})
    return out


def merge_figures(looks, own, claimed):
    """A figures job's index (`own`: layers.py's for one set's layers in some moves, begun empty, so each move's cell
    is reckoned from that set's layers alone) laid into the forge's. The first job laid in for a body's move replaces
    what was published of it: its cell becomes the move's, and a published layer it did not draw keeps the cell its
    strip was drawn in as its own until a later job draws it. A layer drawn in a cell other than the move's keeps that
    cell as its own. `claimed` holds the (body, move) pairs laid in so far."""
    place = lambda c: (c['cell'], c['root'])   # noqa: E731
    for name, body in own['bodies'].items():
        kept = looks['bodies'].setdefault(name, {})
        moves_of, cells, anims = (kept.setdefault(k, {}) for k in ('layers', 'cells', 'anims'))
        for anim, cell in body.get('anims', {}).items():
            drew = [layer for layer, moves in body.get('layers', {}).items() if anim in moves]
            if (name, anim) not in claimed:
                claimed.add((name, anim))
                old = anims.get(anim)
                for layer, moves in moves_of.items():
                    if old and place(old) != place(cell) and anim in moves and anim not in cells.get(layer, {}):
                        cells.setdefault(layer, {})[anim] = old
                anims[anim] = cell
            for layer in drew:
                mine = body.get('cells', {}).get(layer, {}).get(anim)
                if mine is None and place(cell) != place(anims[anim]):
                    mine = cell
                if mine is not None:
                    cells.setdefault(layer, {})[anim] = mine
                elif anim in cells.get(layer, {}):
                    del cells[layer][anim]
                    if not cells[layer]:
                        del cells[layer]
                listed = moves_of.setdefault(layer, [])
                if anim not in listed:
                    listed.append(anim)
    for table in LOOK_VALUES:
        looks.setdefault(table, {}).update(own.get(table, {}))
    for table in LOOK_LISTS:
        listed = looks.setdefault(table, []) if own.get(table) else []
        listed += [layer for layer in own.get(table, []) if layer not in listed]
    looks.setdefault('depth', own.get('depth'))


def figures(folders):
    """Every figures job's folder laid in beside the studio's, for `add` to publish: its strips, and its index merged
    (`merge_figures`), the classic set's first."""
    path = os.path.join(TABLES_DIR, TABLES['looks'])
    with open(path) as file:
        looks = json.load(file)

    def order(folder):
        name = f'-{os.path.basename(folder)}'
        return next((k for k, kind in enumerate(SETS) if f'-{kind}-' in name), len(SETS))

    claimed, laid = set(), 0
    for folder in sorted(folders, key=lambda folder: (order(folder), folder)):
        index = os.path.join(folder, 'forgeLooks.json')
        if not os.path.exists(index):   # a set with no layer in the moves asked for draws nothing
            continue
        with open(index) as file:
            own = json.load(file)
        merge_figures(looks, own, claimed)
        for name, body in own['bodies'].items():
            if not re.fullmatch(r'[a-z_]+', name) or name not in FIGURE_BODIES:
                sys.exit(f'a figures job names a body {name!r}: only the figures\' bodies')
            target = os.path.join(ART, 'studio', 'forge', 'layers', name)
            os.makedirs(target, exist_ok=True)
            for layer, moves in body.get('layers', {}).items():
                for anim in moves:
                    for z in ('', '_z'):
                        shutil.copyfile(os.path.join(folder, name, f'{layer}_{anim}{z}.png'),
                                        os.path.join(target, f'{layer}_{anim}{z}.png'))
                        laid += 1
    with open(path, 'w') as file:
        json.dump(looks, file, separators=(',', ':'))
    print(f'{laid} figure strips laid in from {len(folders)} folders; the looks table has them')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('command', choices=['publish', 'add', 'pull', 'roll', 'lattice', 'jobs', 'figures'])
    parser.add_argument('folder', nargs='*', help="roll: the folder DFO's forge drew the roll into; lattice: the "
                                                  "Lattice's render folders; jobs: the moves; figures: its folders")
    parser.add_argument('--strips', action='store_true', help='pull: unpack every strip as PNG too')
    args = parser.parse_args()
    if args.command == 'publish':
        publish()
    elif args.command == 'add':
        add()
    elif args.command == 'roll':
        if len(args.folder) != 1:
            parser.error("roll needs the folder DFO's forge drew the roll into")
        roll(args.folder[0])
    elif args.command == 'jobs':
        if len(args.folder) != 1:
            parser.error('jobs needs the moves, comma-separated')
        print(json.dumps(jobs(args.folder[0]), separators=(',', ':')))
    elif args.command == 'figures':
        if not args.folder:
            parser.error("figures needs the figures jobs' folders")
        figures(args.folder)
    elif args.command == 'lattice':
        if not args.folder:
            parser.error("lattice needs the Lattice's render folders")
        lattice(args.folder)
    else:
        pull(args.strips)


if __name__ == '__main__':
    main()
