/**
 * The glyphs Overlook draws over Pixelify Sans: its 5 reads as an 8, its 2 and Z are one corner apart, and its B is an
 * 8 with a stem; and it has none of the symbols the map, the HUD and the rarities use. Each is drawn here on
 * Pixelify's own grid; the interface draws these cells in place of what it reads from the face (`ui/glyphs.ts`).
 */

/** A glyph: its code point, its outline as closed contours on the grid, and how far the pen moves after it. */
export interface Outline {
  readonly code: number;
  readonly contours: readonly (readonly (readonly [number, number])[])[];
  readonly advance: number;
}

/** Pixelify Sans's grid at 1000 units, at weight 500: columns 90 units from the next and 110 wide, rows about 89
 *  from the next and 112 tall, as its own strokes are, so neighbouring cells overlap and a diagonal step joins. */
const COLUMNS = [60, 150, 240, 330, 420, 510, 600];
const COLUMN_WIDTH = 110;
const ROWS: readonly (readonly [number, number])[] = [
  [-12, 100],
  [77, 189],
  [166, 278],
  [255, 367],
  [344, 456],
  [432, 544],
  [520, 633],
];
/** Pixelify's own right edge on its widest letters falls a unit past the grid. */
const LAST_COLUMN_RIGHT = 531;

/** Each drawing's rows from the top, `#` a cell drawn; `base` is the row of its last line, 0 on the baseline. */
/** A glyph drawn in cells: its rows from the top, `#` a cell drawn; `base` the row of its last line (0 on the baseline,
 *  below it negative); `left` the column of its first (0 unless said); and its advance in font units, the grid's own
 *  unless said. */
export interface Drawing {
  readonly rows: readonly string[];
  readonly base?: number;
  readonly left?: number;
  readonly advance?: number;
}

/** A row's span in font units, bottom and top: Pixelify's own for the seven rows of a capital, and past them on the
 *  same pitch. */
export function rowSpan(row: number): readonly [number, number] {
  return ROWS[row] ?? [Math.round(-12 + 88.75 * row), Math.round(100 + 88.75 * row)];
}

/** A column's left edge in font units. */
export const columnLeft = (column: number): number => COLUMNS[column] ?? 60 + 90 * column;

export const DRAWINGS: Readonly<Record<string, Drawing>> = {
  // The 2: a rounded top, the right side down, a diagonal two cells wide, a full base.
  '2': { rows: ['.###.', '#...#', '...##', '..##.', '.##..', '##...', '#####'] },
  // The 5: a flat top, the left side down, a bowl that does not close on the left.
  '5': { rows: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'] },
  // The B: a stem the full height, square at both ends, and two bowls.
  B: { rows: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'] },
  // The Z: a flat top and base and a diagonal one cell wide, stepped as the face's own diagonals are.
  Z: { rows: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'] },
  // Square brackets, square at both ends: Pixelify's own read as round at the names' size.
  '[': { rows: ['##', '#.', '#.', '#.', '#.', '#.', '##'] },
  ']': { rows: ['##', '.#', '.#', '.#', '.#', '.#', '##'] },
  '◆': { rows: ['..#..', '.###.', '#####', '.###.', '..#..'], base: 1 },
  '◇': { rows: ['..#..', '.#.#.', '#...#', '.#.#.', '..#..'], base: 1 },
  '◈': { rows: ['..#..', '.#.#.', '#.#.#', '.#.#.', '..#..'], base: 1 },
  '▲': { rows: ['..#..', '.###.', '#####'], base: 2 },
  '▼': { rows: ['#####', '.###.', '..#..'], base: 2 },
  '▾': { rows: ['###', '.#.'], base: 2 },
  '▸': { rows: ['#.', '##', '#.'], base: 2 },
  '◂': { rows: ['.#', '##', '.#'], base: 2 },
  '⌂': { rows: ['..#..', '.#.#.', '#...#', '#...#', '#...#', '#####'] },
  '☠': { rows: ['..###..', '.#####.', '##.#.##', '#######', '.##.##.', '..###..', '..#.#..'] },
  '⚓': { rows: ['..###..', '..#.#..', '.#####.', '...#...', '#..#..#', '##.#.##', '.#####.'] },
  // Glyphs whose outline runs through a cell's centre, which a page reading Pixelify's cells could take either way:
  // each drawn as its outline falls at the centres, with Pixelify's own advance, so every browser draws it alike.
  '(': { rows: ['..#', '..#', '.##', '.#.', '##.', '#..', '##.', '.#.', '.#.', '..#', '..#'], base: -2, advance: 381 },
  ')': { rows: ['#..', '#..', '##.', '.#.', '.##', '..#', '.##', '.#.', '.#.', '#..', '#..'], base: -2, advance: 381 },
  '-': { rows: ['###'], base: 2, left: -1, advance: 344 },
  '°': { rows: ['##', '##', '##'], base: 4, advance: 321 },
  '¾': {
    rows: ['###...#..', '..#..##..', '..#..#...', '##.##...#', '...#...##', '..##..###', '..##....#'],
    advance: 964,
  },
  '\u0304': { rows: ['##'], base: 6, left: -1, advance: 0 },
  '\u201D': { rows: ['#.#.', '.#.#'], base: 5, advance: 472 },
  '½': { rows: ['##...#..', '.#..##..', '.#..#...', '.###.#.#', '..#..###', '.#...#.#', '.#...###'], advance: 820 },
  '∕': { rows: ['...#', '...#', '..##', '.##.', '.##.', '#...', '#...'], advance: 535 },
  ð: { rows: ['....#', '.####', '#..##', '....#', '.####', '#...#', '#...#', '.###.'], advance: 605 },
  '×': { rows: ['.#.#', '..#.', '.#.#'], base: 2, advance: 600 },
};

/** A drawing as an outline: each row's runs of cells a rectangle, drawn clockwise. */
export function outlineOf(char: string): Outline {
  const drawing = DRAWINGS[char];
  if (!drawing) throw new Error(`no drawing for ${char}`);
  const { rows, base = 0, left: from = 0 } = drawing;
  const width = rows[0]?.length ?? 0;
  const contours: (readonly [number, number])[][] = [];
  rows.forEach((line, fromTop) => {
    const [bottom, top] = rowSpan(base + rows.length - 1 - fromTop);
    for (const run of line.matchAll(/#+/g)) {
      const first = from + run.index;
      const last = first + run[0].length - 1;
      const left = columnLeft(first);
      const right = last === 4 && width === 5 && from === 0 ? LAST_COLUMN_RIGHT : columnLeft(last) + COLUMN_WIDTH;
      contours.push([
        [left, bottom],
        [left, top],
        [right, top],
        [right, bottom],
      ]);
    }
  });
  // As far past its last column as Pixelify's own letters stand from the next.
  return { code: char.codePointAt(0) ?? 0, contours, advance: drawing.advance ?? 90 * width + 142 };
}
