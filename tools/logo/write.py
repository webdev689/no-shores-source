"""Writes the owner's No Shores logo into the client as a pixel picture: `python3 -I tools/logo/write.py <logo.png>`.

The PNG is the owner's (its C2PA credentials say it was made with ChatGPT); it stays out of git, and what the game
draws is this file's output, `client/src/cinema/logoPicture.ts`. Each cell is the mean of 8 by 8 of its pixels,
weighted by their cover, and kept where it is half covered; its colours are cut to 12 by median cut, the same each
run, and lettered light to dark. Prettier then lays the file out.
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'client/src/cinema/logoPicture.ts'
CELL = 8
COLOURS = 12


def cells(path):
    """The logo cut to what it covers, as each cell's colour and whether it is drawn."""
    image = Image.open(path).convert('RGBA')
    image = image.crop(image.getchannel('A').point(lambda alpha: 255 if alpha > 127 else 0).getbbox())
    columns, rows = round(image.width / CELL), round(image.height / CELL)
    pixels = np.asarray(image).astype(float)
    cover = pixels[:, :, 3:4] / 255
    covered = Image.fromarray((pixels[:, :, :3] * cover).round().astype(np.uint8)).resize((columns, rows), Image.BOX)
    alpha = np.asarray(image.getchannel('A').resize((columns, rows), Image.BOX)).astype(float)
    drawn = alpha > 127
    colour = np.asarray(covered).astype(float) / np.maximum(alpha[..., None] / 255, 1e-6)
    return np.where(drawn[..., None], colour.clip(0, 255), 0).round().astype(np.uint8), drawn


def picture(path):
    """The rows of letters and their colours, light to dark."""
    colour, drawn = cells(path)
    cut = Image.fromarray(colour).quantize(colors=COLOURS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    palette = np.array(cut.getpalette()[: COLOURS * 3]).reshape(-1, 3)
    index = np.asarray(cut)
    used = sorted({int(i) for i in index[drawn]}, key=lambda i: -palette[i].sum())
    letter = {i: chr(ord('a') + place) for place, i in enumerate(used)}
    rows = [''.join(letter[int(i)] if keep else '.' for i, keep in zip(line, kept)) for line, kept in zip(index, drawn)]
    return rows, ['#%02x%02x%02x' % tuple(palette[i]) for i in used]


def main():
    if len(sys.argv) != 2:
        sys.exit('usage: write.py <logo.png>')
    rows, colours = picture(sys.argv[1])
    lines = [
        "// The owner's No Shores logo as a pixel picture, written by `tools/logo/write.py` from the owner's PNG: "
        f'{len(rows[0])} by',
        f'// {len(rows)} cells, each 8 by 8 of its pixels, in {len(colours)} colours light to dark. Write it again '
        'rather than editing it.',
        '',
        "import type { PixelPicture } from '../combat/dropPictures.ts';",
        '',
        '/** The logo, the game\'s title on its screens. */',
        'export const LOGO: PixelPicture = {',
        '  rows: [',
        *[f"    '{row}'," for row in rows],
        '  ],',
        f'  colours: [{", ".join(repr(each) for each in colours)}],',
        '};',
        '',
    ]
    OUT.write_text('\n'.join(lines))
    subprocess.run([str(ROOT / 'node_modules/.bin/prettier'), '--write', str(OUT)], cwd=ROOT, check=True)
    print(f'wrote {OUT.relative_to(ROOT)}: {len(rows[0])} by {len(rows)}, {len(colours)} colours')


if __name__ == '__main__':
    main()
