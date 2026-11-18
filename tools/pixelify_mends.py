# Draws the glyphs Overlook mends in Pixelify Sans, on its own grid, and writes them into client/src/plus/face.css as
# the face over just their code points. Its 2 and Z are one corner apart and its B is an 8 with a stem, so each reads
# as another; these are the 2 and Z drawn for DFO and a B with a square stem.
# Run: python3 tools/pixelify_mends.py   (needs fontTools and brotli)
import base64
import io
import re
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Pixelify Sans's grid at 1000 units, at weight 500: five columns and seven rows, row 6 the top. A cell is 90 units
# from the next and 110 wide, as the face's own strokes are at that weight, so neighbouring cells overlap.
COLS = [(60, 170), (150, 260), (240, 350), (330, 440), (420, 531)]
ROWS = [
    (-12, 100),
    (77, 189),
    (166, 278),
    (255, 367),
    (344, 456),
    (432, 544),
    (520, 633),
]
# The 2: a rounded top, the right side down, a diagonal stepping two cells wide, a full base.
TWO = {
    6: [1, 2, 3],
    5: [0, 4],
    4: [3, 4],
    3: [2, 3],
    2: [1, 2],
    1: [0, 1],
    0: [0, 1, 2, 3, 4],
}
# The Z: a flat top and base and one straight diagonal, so it cannot be taken for the 2.
ZED = {6: [0, 1, 2, 3, 4], 0: [0, 1, 2, 3, 4]}
ZED_DIAGONAL = ((531, 520), (60, 100))
# The B: a stem the full height, square at both ends, and two bowls.
BEE = {
    6: [0, 1, 2, 3],
    5: [0, 4],
    4: [0, 4],
    3: [0, 1, 2, 3],
    2: [0, 4],
    1: [0, 4],
    0: [0, 1, 2, 3],
}
STROKE = 150
FACE = Path(__file__).resolve().parent.parent / "client/src/plus/face.css"


def runs(cells):
    out = []
    for cell in sorted(cells):
        if out and out[-1][1] == cell - 1:
            out[-1][1] = cell
        else:
            out.append([cell, cell])
    return out


def draw(rows, diagonal=None):
    pen = TTGlyphPen(None)
    if diagonal:
        (top_x, top_y), (base_x, base_y) = diagonal
        pen.moveTo((base_x, base_y))
        pen.lineTo((top_x - STROKE, top_y))
        pen.lineTo((top_x, top_y))
        pen.lineTo((base_x + STROKE, base_y))
        pen.closePath()
    for row, cells in rows.items():
        bottom, top = ROWS[row]
        for first, last in runs(cells):
            left, right = COLS[first][0], COLS[last][1]
            pen.moveTo((left, bottom))
            pen.lineTo((left, top))
            pen.lineTo((right, top))
            pen.lineTo((right, bottom))
            pen.closePath()
    return pen.glyph()


builder = FontBuilder(1000, isTTF=True)
builder.setupGlyphOrder([".notdef", "two", "B", "Z"])
builder.setupCharacterMap({0x32: "two", 0x42: "B", 0x5A: "Z"})
builder.setupGlyf(
    {
        ".notdef": TTGlyphPen(None).glyph(),
        "two": draw(TWO),
        "B": draw(BEE),
        "Z": draw(ZED, ZED_DIAGONAL),
    }
)
builder.setupHorizontalMetrics(
    {".notdef": (500, 0), "two": (592, 60), "B": (592, 60), "Z": (592, 60)}
)
builder.setupHorizontalHeader(ascent=920, descent=-280)
builder.setupNameTable({"familyName": "Pixelify Mended", "styleName": "Regular"})
builder.setupOS2(
    sTypoAscender=920,
    sTypoDescender=-280,
    usWinAscent=922,
    usWinDescent=289,
    sCapHeight=631,
    sxHeight=450,
)
builder.setupPost()
# Fixed dates, so the same drawing gives the same bytes.
builder.font["head"].created = builder.font["head"].modified = 3876000000
builder.font.flavor = "woff2"
made = io.BytesIO()
builder.save(made)
data = base64.b64encode(made.getvalue()).decode()
sheet = FACE.read_text()
sheet, replaced = re.subn(
    r"unicode-range: U\+0032[^;]*;\n  src: url\('data:font/woff2;base64,[^']*'\)",
    f"unicode-range: U+0032, U+0042, U+005A;\n  src: url('data:font/woff2;base64,{data}')",
    sheet,
)
assert replaced == 1, f"the mended face was not found in {FACE.name}"
FACE.write_text(sheet)
print(f"{len(made.getvalue())} bytes written into {FACE.name}")
