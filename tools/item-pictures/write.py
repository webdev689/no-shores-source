"""Bakes the item pictures in Blender and writes them into the client: each island's resource, and the Ammo box's and
crate's still and turn, into `client/src/combat/` (`resourcePictures.ts`, `ammoBoxPictures.ts`, `ammoCratePictures.ts`);
the ship's materials and modules, with the officers' posts drawn by hand in `posts.py`, into
`client/src/game/shipGlyphs.ts`; and a sheet of them all at 8 x to look at.
Run from the repository root with Blender's module (`pip install bpy==5.3.0`):
`python3 -I tools/item-pictures/write.py [sheet.png]`.
"""
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from models import AMMUNITION, RESOURCES, SHIP  # noqa: E402
from posts import GLYPHS as POSTS  # noqa: E402
from pixels import LETTERS  # noqa: E402
from scene import bake  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
COMBAT = ROOT / 'client/src/combat'
RESOURCE_FILE = COMBAT / 'resourcePictures.ts'
AMMUNITION_FILES = [COMBAT / 'ammoBoxPictures.ts', COMBAT / 'ammoCratePictures.ts']
GLYPHS = ROOT / 'client/src/game/shipGlyphs.ts'
# A resource's and ammunition's cells, drawn twice over in a glyph's 36; the ship's, as the posts are.
CELLS = 18
SHIP_CELLS = 24
# The frames of ammunition's turn, as the crystal's, and its pixel in the world: a crate about 0.4 m across.
FRAMES = 12
AMMO_PIXEL_M = 0.038

# What each ship glyph shows, written over its map.
NOTES = {
    'timber': 'Three sawn planks stacked two and one, their end grain to the left, a rope lashed round them.',
    'canvas': 'A bolt of sailcloth on its side, its rolled end to us, tied with red twine, a fold of it below.',
    'iron': 'Three cast ingots stacked two and one, a mark cast in each.',
    'heartwood': 'An old keel sawn across: bark, growth rings and its red heart, the log running back behind it.',
    'guns': 'A gun on its carriage: an iron barrel, its rings and cascabel, the bracket and trucks, shot by it.',
    'hull': 'Its hull: planks, the wale, gunports with red lids, lit stern windows, copper, the bowsprit.',
    'sails': 'A square sail on its yard, full of wind, the mast behind it and the pennant at the masthead.',
    'rigging': 'Shrouds rising from their deadeyes to the masthead, the ratlines rigged across them.',
    'first_mate': "The First Mate's tricorne, its brim bound in gold braid, a cockade on its side.",
    'gunner': "The Gunner's powder horn, brass-capped and banded, on its strap.",
    'bosun': "The Bosun's call: its silver pipe, keel and buoy, on its chain.",
    'carpenter': "The Carpenter's mallet and chisel, crossed.",
    'lookout': "The Lookout's spyglass, its brass draws out, its lens glinting.",
}


def quoted(values):
    return ', '.join(f"'{value}'" for value in values)


def picture(rows, palette, indent, pixel=None):
    """A picture as a TypeScript object: its rows, its colours, and its pixel in the world when it has its own."""
    pad = ' ' * indent
    lines = [f'{pad}{{', f'{pad}  rows: [']
    lines += [f"{pad}    '{row}'," for row in rows]
    lines += [f'{pad}  ],', f'{pad}  colours: [{quoted(palette)}],']
    if pixel is not None:
        lines.append(f'{pad}  pixelM: {pixel},')
    return lines + [f'{pad}}},']


def baked_file(what, body):
    """A file of baked pictures: its head, saying where they come from, then `body`."""
    head = [
        f"// {what}: baked from the Blender models in `tools/item-pictures/models.py` and written here by its",
        "// `write.py`, 18 cells a side, each in its own colours, the outline first, then light to dark. Write it again",
        "// rather than editing it.",
        '',
        "import type { PixelPicture } from './dropPictures.ts';",
        '',
    ]
    return '\n'.join(head + body) + '\n'


def resources_file(resources):
    lines = ["/** Each island's resource, in the catalogue's order. */",
             'export const RESOURCE_PICTURES: readonly PixelPicture[] = [']
    for (name, _, _), (rows, palette) in zip(RESOURCES, resources):
        lines.append(f'  // {name}.')
        lines += picture(rows, palette, 2)
    return baked_file("Each island's resource", lines + ['];'])


def ammunition_file(name, still, frames):
    key = name.upper().replace(' ', '_')
    lines = [f'/** The {name} still, as the screens show it. */', f'export const {key}: PixelPicture = ']
    lines += [line[2:] for line in picture(*still, 2)][:-1] + ['};', '']
    lines += [f'/** The {name} on the ground, turned through {FRAMES} frames of a whole turn. */',
              f'export const {key}_TURN: readonly PixelPicture[] = [']
    for rows, palette in frames:
        lines += picture(rows, palette, 2, AMMO_PIXEL_M)
    return baked_file(f'The {name}', lines + ['];'])


def glyphs_file(glyphs):
    names = list(glyphs)
    lines = [
        "// The ship's glyphs at 24 x 24 as the Arts' emblems are (`player/artGlyphs.ts`), twice the gear's 12 so",
        "// they hold a picture's detail: its four materials and its four modules, baked from Blender models, the",
        "// modules standing for a module's picture since the forge draws only what a figure wears; and the five posts",
        "// its officers hold, drawn by hand. Each map is rows of letters, a letter a colour of its palette (outline",
        "// first) and a dot none.",
        "// `tools/item-pictures/write.py` writes this file: write it again rather than editing it.",
        '',
        'export const SHIP_GLYPHS = [',
        '  ' + quoted(names[:8]) + ',',
        '  ' + quoted(names[8:]) + ',',
        '] as const;',
        'export type ShipGlyph = (typeof SHIP_GLYPHS)[number];',
        '',
        '/** The cells each side of a ship glyph. */',
        f'export const SHIP_GLYPH_CELLS = {SHIP_CELLS};',
        '',
        'export const SHIP_MAPS: Readonly<Record<ShipGlyph, readonly string[]>> = {',
    ]
    for name, (rows, _) in glyphs.items():
        lines += [f'  // {NOTES[name]}', f'  {name}: [']
        lines += [f"    '{row}'," for row in rows]
        lines.append('  ],')
    lines += ['};', '', "/** Each glyph's colours, outline first. */",
              'export const SHIP_PALETTES: Readonly<Record<ShipGlyph, readonly string[]>> = {']
    lines += [f'  {name}: [{quoted(palette)}],' for name, (_, palette) in glyphs.items()]
    return '\n'.join(lines + ['};']) + '\n'


def sheet(pictures, path):
    from PIL import Image

    scale, gap, across = 8, 16, 12
    cell = SHIP_CELLS * scale + gap
    lines = (len(pictures) + across - 1) // across
    image = Image.new('RGB', (cell * across, cell * lines), (28, 31, 38))
    for index, (rows, palette) in enumerate(pictures):
        for y, row in enumerate(rows):
            for x, letter in enumerate(row):
                if letter != '.':
                    colour = palette[LETTERS.index(letter)]
                    rgb = tuple(int(colour[k:k + 2], 16) for k in (1, 3, 5))
                    left = (index % across) * cell + gap // 2 + x * scale
                    top = (index // across) * cell + gap // 2 + y * scale
                    image.paste(rgb, (left, top, left + scale, top + scale))
    image.save(path)


if __name__ == '__main__':
    resources = [bake(build, CELLS, **view) for _, build, view in RESOURCES]
    stills = [bake(build, CELLS) for _, build in AMMUNITION]
    ammunition = [[bake(build, CELLS, spin=frame * 360 / FRAMES, steady=True) for frame in range(FRAMES)]
                  for _, build in AMMUNITION]
    ship = {name: bake(build, SHIP_CELLS, **view) for name, (build, view) in SHIP.items()}
    glyphs = {**ship, **{name: draw() for name, draw in POSTS.items()}}
    RESOURCE_FILE.write_text(resources_file(resources))
    for (name, _), path, still, frames in zip(AMMUNITION, AMMUNITION_FILES, stills, ammunition):
        path.write_text(ammunition_file(name, still, frames))
    GLYPHS.write_text(glyphs_file(glyphs))
    # In the repository's own layout, so writing it again changes nothing that did not change.
    written = [RESOURCE_FILE, *AMMUNITION_FILES, GLYPHS]
    subprocess.run([str(ROOT / 'node_modules/.bin/prettier'), '--write', *map(str, written)], cwd=ROOT, check=True)
    if len(sys.argv) > 1:
        sheet(resources + stills + ammunition[1][:3] + list(glyphs.values()), sys.argv[1])
