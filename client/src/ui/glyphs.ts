// The face's glyphs as cells on Pixelify's grid, one texel a cell, for the game to draw its own words: each read from
// Pixelify Sans at its cells' centres (`faceReader.ts`), or taken from the face's own drawings where the game mends it
// (`face.ts`), so every glyph is a whole number of cells and nothing generated is kept.
import { DRAWINGS, type Drawing } from '../face.ts';

/** A cell's centre in font units: columns 90 apart from 115, rows 88.75 apart from 44, row 0 standing on the
 *  baseline (`face.ts`'s grid). */
export const centreOf = (column: number, row: number): readonly [number, number] => [
  115 + 90 * column,
  44 + 88.75 * row,
];

/** The cells a glyph is read over: a column left of the first to the ninth, four rows under the baseline to the tenth
 *  above it, wider and taller than any of Pixelify's glyphs. */
const READ = { columns: [-1, 9], rows: [-4, 10] } as const;

/** A glyph as cells: its advance (font units), its first column and lowest row with ink (row 0 on the baseline), its
 *  size in cells, and its cells from the top row down, 1 where drawn. A glyph with no ink is no cells wide. */
export interface Glyph {
  readonly advance: number;
  readonly left: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
}

/** A glyph cut to its ink from a grid of cells read `fromColumn`, `fromRow` up, `rows[0]` the top. */
function cropped(rows: readonly (readonly boolean[])[], fromColumn: number, lowRow: number, advance: number): Glyph {
  const inked = (row: readonly boolean[]) => row.some(Boolean);
  const top = rows.findIndex(inked);
  if (top < 0) return { advance, left: 0, bottom: 0, width: 0, height: 0, cells: new Uint8Array(0) };
  const bottomIndex = rows.length - 1 - [...rows].reverse().findIndex(inked);
  const columns = rows[0]?.length ?? 0;
  const inkedColumn = (column: number) => rows.some((row) => row[column]);
  let first = 0;
  while (!inkedColumn(first)) first++;
  let last = columns - 1;
  while (!inkedColumn(last)) last--;
  const [width, height] = [last - first + 1, bottomIndex - top + 1];
  const cells = new Uint8Array(width * height);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      cells[row * width + column] = rows[top + row]?.[first + column] ? 1 : 0;
  return { advance, left: fromColumn + first, bottom: lowRow + (rows.length - 1 - bottomIndex), width, height, cells };
}

/** A glyph read by `drawn`, whether its outline covers a point (font units), at each cell's centre. */
export function glyphRead(drawn: (x: number, y: number) => boolean, advance: number): Glyph {
  const [firstColumn, lastColumn] = READ.columns;
  const [lowRow, highRow] = READ.rows;
  const rows: boolean[][] = [];
  for (let row = highRow; row >= lowRow; row--) {
    const line: boolean[] = [];
    for (let column = firstColumn; column <= lastColumn; column++) line.push(drawn(...centreOf(column, row)));
    rows.push(line);
  }
  return cropped(rows, firstColumn, lowRow, advance);
}

/** A glyph as the face draws it, with the grid's own advance unless it says. */
export function glyphDrawn(drawing: Drawing): Glyph {
  const { rows, base = 0, left = 0 } = drawing;
  const width = rows[0]?.length ?? 0;
  const grid = rows.map((line) => [...line].map((cell) => cell === '#'));
  return cropped(grid, left, base, drawing.advance ?? 90 * width + 142);
}

/** The glyphs the game mends, by code point: drawn, never read from Pixelify. */
export const MENDED_GLYPHS: ReadonlyMap<number, Glyph> = new Map(
  Object.entries(DRAWINGS).map(([char, drawing]) => [char.codePointAt(0) ?? 0, glyphDrawn(drawing)]),
);
