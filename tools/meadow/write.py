"""Writes the owner's five meadow sprites into the client as pixel pictures: `python3 -I tools/meadow/write.py <dir>`.

The directory holds the owner's PNGs as DFO keeps them (`src/assets/grass/source/` in DFO Online): tuft-tall,
tuft-short, flowers and tuft-dry, 32 by 32, and bush, 64 by 64, each in colours of its own and every pixel drawn or
not, none between. They stay out of git; what the game draws is this file's output,
`client/src/nature/meadowArt.ts`, each sprite its rows top row first and its colours as each is first met, lettered
from 'a'. Prettier then lays the file out.
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client/src/nature/meadowArt.ts'
# In the atlas's order: the meadow's pick names each by its place here.
SPRITES = [('tall', 'tuft-tall'), ('short', 'tuft-short'), ('flowers', 'flowers'), ('dry', 'tuft-dry'), ('bush', 'bush')]
LETTERS = 'abcdefghijklmnopqrstuvwxyz'


def sprite(path):
    """A sprite's rows and colours, refused if a pixel is half drawn: a pixel sprite with a soft edge was not drawn as one."""
    image = Image.open(path).convert('RGBA')
    colours, rows = [], []
    for y in range(image.height):
        row = ''
        for x in range(image.width):
            red, green, blue, alpha = image.getpixel((x, y))
            if alpha not in (0, 255):
                sys.exit(f'{path}: pixel {x},{y} is half drawn (alpha {alpha})')
            if alpha == 0:
                row += '.'
                continue
            colour = '#%02x%02x%02x' % (red, green, blue)
            if colour not in colours:
                if len(colours) == len(LETTERS):
                    sys.exit(f'{path}: more than {len(LETTERS)} colours, more than a letter each')
                colours.append(colour)
            row += LETTERS[colours.index(colour)]
        rows.append(row)
    return rows, colours


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: write.py <the directory of the owner\'s meadow PNGs>')
    folder = Path(sys.argv[1])
    lines = [
        "// The owner's meadow sprites as pixel pictures, written by `tools/meadow/write.py` from the owner's PNGs: a tall",
        '// tuft, the same tuft cut short, a tuft of flowers and a dry tuft, 32 by 32, and a bush, 64 by 64, in the',
        "// meadow's order. Write it again rather than editing it.",
        '',
        "/** A picture: rows of letters top row first, each a colour of `colours` ('a' the first) and a dot none. */",
        'export interface MeadowPicture {',
        '  readonly rows: readonly string[];',
        '  readonly colours: readonly string[];',
        '}',
        '',
        "/** A meadow sprite: its name and its picture. */",
        'export interface MeadowSprite {',
        '  readonly name: string;',
        '  readonly picture: MeadowPicture;',
        '}',
        '',
        "/** The owner's five, in the atlas's order. */",
        'export const MEADOW_SPRITES: readonly MeadowSprite[] = [',
    ]
    for name, file in SPRITES:
        rows, colours = sprite(folder / f'{file}.png')
        lines += [
            '  {',
            f"    name: '{name}',",
            '    picture: {',
            '      rows: [',
            *[f"        '{row}'," for row in rows],
            '      ],',
            f'      colours: [{", ".join(repr(each) for each in colours)}],',
            '    },',
            '  },',
        ]
    lines += ['];', '']
    OUT.write_text('\n'.join(lines))
    subprocess.run([str(ROOT / 'node_modules/.bin/prettier'), '--write', str(OUT)], cwd=ROOT, check=True)
    print(f'wrote {OUT.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
