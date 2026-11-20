"""Draws the ship's glyphs and writes them into the client (`client/src/game/shipGlyphs.ts`), and a sheet of them
at 8 x to look at. Run from the repository root: `python3 tools/ship-glyphs/write.py [sheet.png]`."""

import sys
from pathlib import Path

from materials import GLYPHS as MATERIALS
from modules import GLYPHS as MODULES
from pix import LETTERS
from posts import GLYPHS as POSTS

TARGET = Path(__file__).resolve().parents[2] / 'client/src/game/shipGlyphs.ts'

# What each one shows, written over its map.
NOTES = {
    'timber': 'Three sawn planks stacked two and one, their end grain to the left, a rope lashed round them.',
    'canvas': 'A bolt of sailcloth on its side, its rolled end facing us, tied with red twine, a fold of it unrolled below.',
    'iron': 'Three cast ingots stacked two and one, lit on their tops, a mark cast in each.',
    'heartwood': 'An old keel sawn across: bark, growth rings and its red heart, the log running back behind it.',
    'guns': 'A gun on its carriage: an iron barrel with its rings and cascabel, the wooden bracket and trucks, shot stacked by it.',
    'hull': 'Its hull from the side: planked strakes, the wale and its gunports with red lids, lit stern windows, copper below the waterline, the bowsprit.',
    'sails': 'A square sail on its yard, full of wind and sewn in panels, reef points under the yard, the pennant at the masthead.',
    'rigging': 'Shrouds rising from their deadeyes to the masthead, the ratlines rigged across them.',
    'first_mate': "The First Mate's tricorne, its brim bound in gold braid, a cockade on its side.",
    'gunner': "The Gunner's powder horn, brass-capped and banded, on its strap.",
    'bosun': "The Bosun's call: its silver pipe, keel and buoy, on its chain.",
    'carpenter': "The Carpenter's mallet and chisel, crossed.",
    'lookout': "The Lookout's spyglass, its brass draws out, its lens glinting.",
}

HEAD = '\n'.join([
    "// The ship's glyphs, drawn pixel by pixel at 24 x 24 as the Arts' emblems are (`player/artGlyphs.ts`), twice the gear's",
    "// 12 so they hold a picture's detail, lit from the top left as the kit's bevels are: its four materials, its four",
    "// modules, which stand for a module's picture since the forge draws only what a figure wears, and the five posts its",
    "// officers hold. Each map is rows of letters, a letter a colour of its palette (outline first) and a dot none. They",
    "// are drawn by `tools/ship-glyphs/` (shapes filled by their light, an outline traced round them), and kept here.",
    '',
])


def drawn():
    glyphs = {**MATERIALS, **MODULES, **POSTS}
    return {name: make() for name, make in glyphs.items()}


def typescript(glyphs):
    names = list(glyphs)
    lines = [HEAD, 'export const SHIP_GLYPHS = [']
    lines.append('  ' + ', '.join(f"'{n}'" for n in names[:8]) + ',')
    lines.append('  ' + ', '.join(f"'{n}'" for n in names[8:]) + ',')
    lines.append('] as const;\nexport type ShipGlyph = (typeof SHIP_GLYPHS)[number];\n')
    lines.append('/** The cells each side of a ship glyph. */\nexport const SHIP_GLYPH_CELLS = 24;\n')
    lines.append('export const SHIP_MAPS: Readonly<Record<ShipGlyph, readonly string[]>> = {')
    for name, (rows, _) in glyphs.items():
        lines.append(f'  // {NOTES[name]}')
        lines.append(f'  {name}: [')
        lines.extend(f"    '{row}'," for row in rows)
        lines.append('  ],')
    lines.append('};\n\n/** Each glyph\'s colours, outline first. */')
    lines.append('export const SHIP_PALETTES: Readonly<Record<ShipGlyph, readonly string[]>> = {')
    for name, (_, palette) in glyphs.items():
        lines.append(f"  {name}: [{', '.join(repr(c).replace(chr(34), chr(39)) for c in palette)}],")
    lines.append('};\n')
    return '\n'.join(lines)


def sheet(glyphs, path):
    from PIL import Image

    scale, gap = 8, 16
    cell = 24 * scale + gap
    image = Image.new('RGB', (cell * 5, cell * 3), (28, 31, 38))
    for i, (rows, palette) in enumerate(glyphs.values()):
        for y, row in enumerate(rows):
            for x, letter in enumerate(row):
                if letter != '.':
                    colour = palette[LETTERS.index(letter)]
                    rgb = tuple(int(colour[k : k + 2], 16) for k in (1, 3, 5))
                    left, top = (i % 5) * cell + gap // 2 + x * scale, (i // 5) * cell + gap // 2 + y * scale
                    image.paste(rgb, (left, top, left + scale, top + scale))
    image.save(path)


if __name__ == '__main__':
    glyphs = drawn()
    TARGET.write_text(typescript(glyphs))
    if len(sys.argv) > 1:
        sheet(glyphs, sys.argv[1])
