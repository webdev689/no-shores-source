// The land map's table: one framed panel, as the sea's key is (mapKey.ts), headed by the land's name, guiding the
// player through what is what: each glyph on the sheet beside what it is, the player's own arrow, and a bar of the
// ground's length at the map's zoom.
import type { Rect, View } from './heldMapLaw.ts';
import { GLYPH_HALF, GLYPHS, type LandGlyph, paintGlyph } from './landGlyphs.ts';
import type { LandSheet, MapMarks } from './landSheet.ts';
import { FILLS } from '../plus/tones.ts';
import { FACE, INK, KEY_FONT, keyCorners, type KeyPlace } from './mapKey.ts';
import { paintArrow, type Painter } from './mapLetters.ts';

/** A row of the table: a glyph, the player's arrow or another player's dot (a company's green, else blue), and what
 *  it is. */
export interface TableRow {
  readonly glyph: LandGlyph | 'you' | 'company' | 'player';
  readonly word: string;
}

/** Another player's dot on the map, in their nameplate's square's colour, edged in the ink; its radius, units. */
export const DOT = { company: FILLS.green, player: FILLS.ally, radius: 3.2 } as const;

/** Paints another player's dot at the origin. */
export function paintDot(painter: Painter, company: boolean): void {
  painter.beginPath();
  painter.arc(0, 0, DOT.radius, 0, 2 * Math.PI);
  painter.fillStyle = company ? DOT.company : DOT.player;
  painter.fill();
  painter.strokeStyle = INK;
  painter.lineWidth = 1;
  painter.stroke();
}

const PANEL = 'rgba(238, 222, 190, 0.94)';
const HEAD_FONT = `500 15px ${FACE}`;
/** The table's lengths, units: its padding, its head's line, a row, a glyph's room and the gap after it, the gap
 *  between its columns, the bar's line, the longest bar, and the most rows a column holds. */
const TABLE = { padding: 8, head: 22, row: 20, glyph: 2 * GLYPH_HALF, gap: 6, columnGap: 14, bar: 18, longest: 72 };
const ROWS_A_COLUMN = 7;
/** The lengths the bar may stand for, metres. */
const BAR_LENGTHS = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];

/** The table's rows: each glyph the sheet holds, once, in `GLYPHS`' order, with what its first mark is called; then
 *  the player's arrow. */
export function tableRows(sheet: Pick<LandSheet, 'marks'>, others: MapMarks['others'] = []): TableRow[] {
  const rows = GLYPHS.flatMap((glyph): TableRow[] => {
    const mark = sheet.marks.find((each) => each.glyph === glyph);
    return mark ? [{ glyph, word: mark.word }] : [];
  });
  const dots: TableRow[] = [
    ...(others.some((other) => other.company) ? [{ glyph: 'company' as const, word: 'Your company' }] : []),
    ...(others.some((other) => !other.company) ? [{ glyph: 'player' as const, word: 'Other players' }] : []),
  ];
  return [...rows, { glyph: 'you', word: 'You' }, ...dots];
}

/** The rows in each column: `ROWS_A_COLUMN` at most to a column, the columns as even as they can be. */
const columnsOf = (rows: readonly TableRow[]): TableRow[][] => {
  const count = Math.ceil(rows.length / ROWS_A_COLUMN);
  const each = Math.ceil(rows.length / count);
  return Array.from({ length: count }, (unused, column) => rows.slice(column * each, (column + 1) * each));
};

/** The table's width and height, units, as `painter` measures its words. */
export function tableSize(
  painter: Painter,
  name: string,
  rows: readonly TableRow[],
): { width: number; height: number } {
  painter.font = KEY_FONT;
  const columns = columnsOf(rows).map((column) =>
    Math.max(...column.map((row) => TABLE.glyph + TABLE.gap + painter.measureText(row.word).width)),
  );
  const body = columns.reduce((sum, width) => sum + width, 0) + TABLE.columnGap * (columns.length - 1);
  painter.font = HEAD_FONT;
  const head = painter.measureText(name).width;
  const tallest = Math.max(...columnsOf(rows).map((column) => column.length));
  return {
    width: Math.ceil(TABLE.padding * 2 + Math.max(body, head, TABLE.longest + 40)),
    height: TABLE.padding * 2 + TABLE.head + tallest * TABLE.row + TABLE.bar,
  };
}

const overlaps = (one: Rect, other: Rect) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height;

/** Where the table stands, ink pixels: of the map's corners (the one it stands in first) those clear of the gauntlets
 *  (`covers`), the one over the fewest of the boxes `taken` by marks and names; the first corner if every one is under
 *  a hand. So it moves only when another corner is clearer, never back and forth while the map stands still. */
export function tablePlace(
  ink: { readonly width: number; readonly height: number },
  size: { readonly width: number; readonly height: number },
  scale: number,
  taken: readonly Rect[],
  covers: readonly Rect[],
  current: KeyPlace | null,
): KeyPlace {
  const corners = keyCorners(ink, size, scale, current);
  const clear = corners.filter((place) => !covers.some((cover) => overlaps(cover, place.box)));
  const under = (place: KeyPlace) => taken.filter((box) => overlaps(box, place.box)).length;
  const best = clear.reduce<KeyPlace | null>(
    (found, place) => (found && under(found) <= under(place) ? found : place),
    null,
  );
  return best ?? corners[0] ?? { corner: 'upper-right', box: { x: 0, y: 0, ...size } };
}

/** The longest of the bar's lengths no longer than `TABLE.longest` units at the map's zoom, and its length in units. */
export function barOf(view: View, scale: number): { metres: number; units: number } {
  const unitsOf = (metres: number) => (metres * view.scale) / scale;
  const metres = BAR_LENGTHS.filter((each) => unitsOf(each) <= TABLE.longest).at(-1) ?? BAR_LENGTHS[0] ?? 5;
  return { metres, units: unitsOf(metres) };
}

/** The table at `place`, `scale` times its units: framed by a double rule, the land's name over a rule, the rows in
 *  their columns, and the bar of `bar` metres under them. */
export function paintTable(
  painter: Painter,
  place: KeyPlace,
  scale: number,
  ask: { readonly name: string; readonly rows: readonly TableRow[]; readonly bar: { metres: number; units: number } },
): void {
  const { box } = place;
  painter.save();
  painter.translate(box.x, box.y);
  painter.scale(scale, scale);
  const [width, height] = [box.width / scale, box.height / scale];
  painter.fillStyle = PANEL;
  painter.fillRect(0, 0, width, height);
  painter.strokeStyle = INK;
  painter.lineWidth = 1;
  painter.strokeRect(0.5, 0.5, width - 1, height - 1);
  painter.strokeRect(2.5, 2.5, width - 5, height - 5);
  painter.textBaseline = 'middle';
  painter.textAlign = 'center';
  painter.font = HEAD_FONT;
  painter.fillStyle = INK;
  painter.fillText(ask.name, width / 2, TABLE.padding + TABLE.head / 2 - 1);
  painter.beginPath();
  painter.moveTo(TABLE.padding, TABLE.padding + TABLE.head - 2);
  painter.lineTo(width - TABLE.padding, TABLE.padding + TABLE.head - 2);
  painter.stroke();
  painter.font = KEY_FONT;
  painter.textAlign = 'left';
  let left = TABLE.padding;
  for (const column of columnsOf(ask.rows)) {
    column.forEach((row, index) => {
      const y = TABLE.padding + TABLE.head + TABLE.row * (index + 0.5);
      painter.save();
      painter.translate(left + GLYPH_HALF, y);
      if (row.glyph === 'you') {
        painter.scale(0.75, 0.75);
        paintArrow(painter, 0);
      } else if (row.glyph === 'company' || row.glyph === 'player') paintDot(painter, row.glyph === 'company');
      else paintGlyph(painter, row.glyph);
      painter.restore();
      painter.fillStyle = INK;
      painter.fillText(row.word, left + TABLE.glyph + TABLE.gap, y);
    });
    painter.font = KEY_FONT;
    left +=
      Math.max(...column.map((row) => TABLE.glyph + TABLE.gap + painter.measureText(row.word).width)) + TABLE.columnGap;
  }
  paintBar(painter, TABLE.padding, height - TABLE.padding - TABLE.bar / 2, ask.bar);
  painter.restore();
}

/** The bar from `x`, its middle at `y`: a rule in two halves, filled and open, its length in metres after it. */
function paintBar(painter: Painter, x: number, y: number, bar: { metres: number; units: number }): void {
  const half = bar.units / 2;
  painter.lineWidth = 1;
  painter.strokeStyle = INK;
  painter.fillStyle = INK;
  painter.fillRect(x, y - 2, half, 4);
  painter.strokeRect(x + half, y - 2, half, 4);
  painter.fillText(`${bar.metres} m`, x + bar.units + TABLE.gap, y);
}
