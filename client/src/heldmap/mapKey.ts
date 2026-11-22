// The held map's key: one framed panel naming the waters' holders by their colours, and under them the difficulty
// ramp, each group under its title. It stands in a corner of the map that covers no land, no word, no mark and no
// hand (mapLayout.ts says what it yields to when no corner is clear).
import { CANVAS_FACE } from '../face.ts';
import { type CoastField, NO_ISLAND } from './coastField.ts';
import type { Rect } from './heldMapLaw.ts';
import { HATCHES, HOLDER_WORDS, levelColour, washedOver, type WaterHolder } from './watersWash.ts';

/** The face the key is lettered in, as the map's smaller words: the mended glyphs first (face.ts), then Pixelify Sans
 *  under the name the interface loads it by where the game runs (ui/faceReader.ts). Its inks: iron-gall, and the parchment's own colour, which fills the
 *  panel. Its lengths are units, pixels at a scale of 1. */
export const FACE = CANVAS_FACE;
export const KEY_FONT = `500 13px ${FACE}`;
export const INK = '#3a2816';
const PANEL = 'rgba(238, 222, 190, 0.92)';
/** The panel's padding, a line and the gap between rows, its swatches' size and the gap after them, the gap between
 *  its two columns of holders, and its inset from the map's corner. */
const KEY = { padding: 7, line: 16, rowGap: 2, swatch: [20, 12], gap: 5, columnGap: 12, inset: 10 } as const;
/** The groups' titles, and the difficulty ramp: its words either side and its steps across the levels. */
const TITLES = { holders: 'Held by', levels: 'Levels' } as const;
const RAMP = { from: '1', to: '30', steps: 9, step: 6 } as const;
const RAMP_LEVELS = Array.from({ length: RAMP.steps }, (unused, step) => 1 + (step * 29) / (RAMP.steps - 1));

/** Where the key stands: the corner of the map, and its box in ink pixels. */
export type Corner = 'lower-left' | 'lower-right' | 'upper-left' | 'upper-right';
export type KeyPlace = { readonly corner: Corner; readonly box: Rect };
const CORNERS: readonly Corner[] = ['lower-left', 'lower-right', 'upper-left', 'upper-right'];

type Measure = { measureText(text: string): { width: number }; font: string };

const overlaps = (one: Rect, other: Rect) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height;

/** The key's panel's width and height, units, as `painter` measures its words. */
export function keySize(painter: Measure): { width: number; height: number } {
  painter.font = KEY_FONT;
  const width = (text: string) => painter.measureText(text).width;
  const item = (words: string) => KEY.swatch[0] + KEY.gap + width(words);
  const columns = [0, 1].map((column) =>
    Math.max(...HOLDER_WORDS.filter((unused, index) => index % 2 === column).map(([, words]) => item(words))),
  );
  const ramp =
    width(TITLES.levels) + KEY.gap * 2 + width(RAMP.from) + KEY.gap * 2 + RAMP.steps * RAMP.step + width(RAMP.to);
  const holders = (columns[0] ?? 0) + KEY.columnGap + (columns[1] ?? 0);
  return {
    width: KEY.padding * 2 + Math.max(width(TITLES.holders), holders, ramp),
    height: KEY.padding * 2 + 4 * KEY.line + 3 * KEY.rowGap,
  };
}

/** Whether any cell of a grid of `cellM` cells, `columns` across and `rows` down, under `box` (ink pixels) passes
 *  `test`, the map showing `view` (its top-left in metres and pixels a metre): the grid asked every few pixels across
 *  the box, its corners and edges included; cells off the grid are not asked. */
export function anyCellUnder(
  grid: { readonly columns: number; readonly rows: number; readonly cellM: number },
  view: { readonly left: number; readonly top: number; readonly scale: number },
  box: Rect,
  test: (cell: number) => boolean,
): boolean {
  const step = 4;
  const across = Math.max(1, Math.ceil(box.width / step));
  const down = Math.max(1, Math.ceil(box.height / step));
  for (let row = 0; row <= down; row++)
    for (let column = 0; column <= across; column++) {
      const x = view.left + (box.x + (box.width * column) / across) / view.scale;
      const y = view.top + (box.y + (box.height * row) / down) / view.scale;
      const [cellX, cellY] = [Math.floor(x / grid.cellM), Math.floor(y / grid.cellM)];
      if (cellX < 0 || cellY < 0 || cellX >= grid.columns || cellY >= grid.rows) continue;
      if (test(cellY * grid.columns + cellX)) return true;
    }
  return false;
}

/** Whether any discovered land lies under `box` (ink pixels), the map showing `view` (`anyCellUnder`). */
export function landUnder(
  field: CoastField,
  knownIslands: number,
  view: { readonly left: number; readonly top: number; readonly scale: number },
  box: Rect,
): boolean {
  return anyCellUnder(field, view, box, (cell) => {
    const island = field.island[cell] ?? NO_ISLAND;
    const known = island !== NO_ISLAND && ((knownIslands >>> Math.min(island, 31)) & 1) === 1;
    return known && (field.distance[cell] ?? 1) < 0;
  });
}

/** The key's box in `corner` of a map `ink` wide and high, ink pixels. */
function cornerBox(
  corner: Corner,
  ink: { width: number; height: number },
  size: { width: number; height: number },
  inset: number,
) {
  const left = corner.endsWith('left') ? inset : ink.width - inset - size.width;
  const top = corner.startsWith('upper') ? inset : ink.height - inset - size.height;
  return { x: left, y: top, width: size.width, height: size.height };
}

/** The key in each corner of a map `ink` wide and high, its panel `size` in ink pixels: the corner it stands in
 *  (`current`) first, then lower left, lower right, upper left, upper right. */
export function keyCorners(
  ink: { readonly width: number; readonly height: number },
  size: { readonly width: number; readonly height: number },
  scale: number,
  current: KeyPlace | null,
): KeyPlace[] {
  const order = current ? [current.corner, ...CORNERS.filter((corner) => corner !== current.corner)] : CORNERS;
  return order.map((corner) => ({ corner, box: cornerBox(corner, ink, size, KEY.inset * scale) }));
}

/** The key along the map's four edges between its corners, half its width or height apart, ink pixels: where it may
 *  stand when no corner will do. Each is named by the corner it slid from. */
export function keyEdges(
  ink: { readonly width: number; readonly height: number },
  size: { readonly width: number; readonly height: number },
  scale: number,
): KeyPlace[] {
  const inset = KEY.inset * scale;
  const places: KeyPlace[] = [];
  for (const corner of CORNERS) {
    const { x, y } = cornerBox(corner, ink, size, inset);
    const along = (start: number, step: number, room: number) =>
      Array.from(
        { length: Math.max(0, Math.floor((room - 2 * inset) / step) - 2) },
        (unused, index) => start + step * (index + 1),
      );
    if (corner.endsWith('left'))
      for (const left of along(inset, size.width / 2, ink.width - size.width + size.width / 2))
        places.push({ corner, box: { x: left, y, width: size.width, height: size.height } });
    if (corner.startsWith('upper'))
      for (const top of along(inset, size.height / 2, ink.height - size.height + size.height / 2))
        places.push({ corner, box: { x, y: top, width: size.width, height: size.height } });
  }
  return places;
}

/** Where the key goes (`keyCorners`): the corner it stands in while that stays clear of land (`land`) and of every box
 *  `taken`, else the first clear corner; null with none clear. So it moves only when it must, and never back and
 *  forth while the map stands still. */
export function keyPlace(
  ink: { readonly width: number; readonly height: number },
  size: { readonly width: number; readonly height: number },
  scale: number,
  taken: readonly Rect[],
  land: (box: Rect) => boolean,
  current: KeyPlace | null,
): KeyPlace | null {
  const clear = (box: Rect) => !taken.some((each) => overlaps(each, box)) && !land(box);
  return keyCorners(ink, size, scale, current).find((place) => clear(place.box)) ?? null;
}

type KeyPainter = Measure & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  textAlign: CanvasTextAlign;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  rect(x: number, y: number, width: number, height: number): void;
  clip(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
};

/** A holder's swatch with its top-left at `x`, `y`: its wash as the map shows it over its parchment, and over the
 *  Grey Tithe's and the Lattice's their level hatching, its lines as far apart as on the map. */
function paintSwatch(painter: KeyPainter, holder: WaterHolder, x: number, y: number): void {
  const [width, height] = KEY.swatch;
  painter.fillStyle = washedOver(holder);
  painter.fillRect(x, y, width, height);
  const hatch = holder === 'lattice' || holder === 'grey-tithe' ? HATCHES[holder] : null;
  if (!hatch) return;
  painter.save();
  painter.beginPath();
  painter.rect(x, y, width, height);
  painter.clip();
  painter.strokeStyle = `rgba(${hatch.colour.join(', ')}, ${hatch.strength})`;
  painter.lineWidth = 1.2;
  painter.beginPath();
  const gap = hatch.spacingPx;
  for (let down = gap / 2; down < height; down += gap) {
    painter.moveTo(x, y + down);
    painter.lineTo(x + width, y + down);
  }
  painter.stroke();
  painter.restore();
}

/** The key's panel at `place`, `scale` times its units: framed by a double rule, the holders' title over their
 *  swatches and words in two columns, then the levels' title and the ramp, "1" to "30". */
export function paintKey(painter: KeyPainter, place: KeyPlace, scale: number): void {
  const { box } = place;
  painter.save();
  painter.translate(box.x, box.y);
  painter.scale(scale, scale);
  const [width, height] = [box.width / scale, box.height / scale];
  painter.font = KEY_FONT;
  painter.fillStyle = PANEL;
  painter.fillRect(0, 0, width, height);
  painter.strokeStyle = INK;
  painter.lineWidth = 1;
  painter.strokeRect(0.5, 0.5, width - 1, height - 1);
  painter.strokeRect(2.5, 2.5, width - 5, height - 5);
  painter.textAlign = 'left';
  const measure = (text: string) => painter.measureText(text).width;
  const item = (words: string, holder: WaterHolder, x: number, y: number) => {
    paintSwatch(painter, holder, x, y - KEY.swatch[1] / 2);
    painter.fillStyle = INK;
    painter.fillText(words, x + KEY.swatch[0] + KEY.gap, y);
  };
  const line = (index: number) => KEY.padding + KEY.line * (index + 0.5) + KEY.rowGap * index;
  painter.fillStyle = INK;
  painter.fillText(TITLES.holders, KEY.padding, line(0));
  const first = Math.max(
    ...HOLDER_WORDS.filter((unused, index) => index % 2 === 0).map(
      ([, words]) => KEY.swatch[0] + KEY.gap + measure(words),
    ),
  );
  HOLDER_WORDS.forEach(([holder, words], index) => {
    const x = KEY.padding + (index % 2 === 0 ? 0 : first + KEY.columnGap);
    item(words, holder, x, line(1 + Math.floor(index / 2)));
  });
  paintRamp(painter, KEY.padding, line(3));
  painter.restore();
}

/** The levels' title and ramp from `x`, its words' middle at `y`: "Levels", "1", a swatch a step, "30". */
function paintRamp(painter: KeyPainter, x: number, y: number): void {
  const measure = (text: string) => painter.measureText(text).width;
  painter.fillStyle = INK;
  painter.fillText(TITLES.levels, x, y);
  const from = x + measure(TITLES.levels) + KEY.gap * 2;
  painter.fillText(RAMP.from, from, y);
  let left = from + measure(RAMP.from) + KEY.gap;
  for (const level of RAMP_LEVELS) {
    painter.fillStyle = levelColour(level);
    painter.fillRect(left, y - KEY.swatch[1] / 2, RAMP.step, KEY.swatch[1]);
    left += RAMP.step;
  }
  painter.fillStyle = INK;
  painter.fillText(RAMP.to, left + KEY.gap, y);
}
