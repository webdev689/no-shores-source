// What the held map letters on its parchment: each place's name and glyph, each water's name, the ship's arrow and the
// key of the waters' holders. They are painted onto a picture of the parchment that its ink pass lays down with the
// ink, so the gauntlets holding the map cover them as they cover the parchment. The key is laid where it covers no
// land, no name and no mark.
import { type CoastField, NO_ISLAND } from './coastField.ts';
import type { Rect } from './heldMapLaw.ts';
import { HOLDER_COLOURS, HOLDER_WORDS, levelColour } from './watersWash.ts';

/** The map's face, Overlook's own at its sharp size (face.css), and its inks: iron-gall, the route's red-brown, and
 *  the parchment's own colour, which rings each word so it reads over the coasts' lines. */
export const LETTER_FONT = "500 11px 'Pixelify Mended', 'Pixelify Sans Variable', monospace";
const INK = '#3a2816';
const ROUTE = '#781c14';
const PARCHMENT = '#eedebe';
/** A line of the map's words, and how far a place's name stands right of its glyph, pixels. */
const LINE_PX = 14;
const NAME_OFFSET_PX = 9;
/** The key: its inset from the map's corner, its padding, and its swatches' size and gap, pixels. */
const KEY = { inset: 14, padding: 6, swatch: [14, 9], gap: 6, rowGap: 3 } as const;
/** The key's difficulty ramp: its words either side, and its steps across the levels, each a swatch this wide. */
const RAMP = { from: 'Levels 1', to: '30', steps: 9, step: 5 } as const;
const RAMP_LEVELS = Array.from({ length: RAMP.steps }, (unused, step) => 1 + (step * 29) / (RAMP.steps - 1));
/** How far a water's ring stands round her name, pixels. */
const RING_PX = 5;

/** A word on the map, ink pixels from its top-left: a place's name beside its glyph (by its kind: port, ruin or a
 *  node's), or a water's name centred on its point. */
export interface MapLetter {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly kind: string;
  readonly chosen: boolean;
  /** A water's colour on the difficulty ramp, which her name and its ring are inked in. */
  readonly colour?: string | undefined;
}

/** Where the key stands: in a corner of the map, its box in ink pixels; or in one row on the parchment's margin
 *  under the map. */
export type KeyPlace =
  { readonly corner: Corner; readonly box: Rect } | { readonly corner: 'margin'; readonly box: Rect };
export type Corner = 'lower-left' | 'lower-right' | 'upper-left' | 'upper-right';
const CORNERS: readonly Corner[] = ['lower-left', 'lower-right', 'upper-left', 'upper-right'];

/** What one frame letters on the parchment, ink pixels from the map's top-left: the words, the ship's arrow (null off
 *  the map) and the key. */
export interface Lettering {
  readonly letters: readonly MapLetter[];
  readonly ship: { readonly x: number; readonly y: number; readonly heading: number } | null;
  readonly key: KeyPlace | null;
}

/** What painting needs of a 2D context: the canvas's own, or a stand-in that records. */
export type Painter = Pick<
  CanvasRenderingContext2D,
  | 'setTransform'
  | 'clearRect'
  | 'measureText'
  | 'fillText'
  | 'strokeText'
  | 'beginPath'
  | 'arc'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'fill'
  | 'stroke'
  | 'fillRect'
  | 'strokeRect'
  | 'setLineDash'
> & {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  lineJoin: CanvasLineJoin;
};

const overlaps = (one: Rect, other: Rect) =>
  one.x < other.x + other.width &&
  other.x < one.x + one.width &&
  one.y < other.y + other.height &&
  other.y < one.y + one.height;

/** The box a word covers on the map, ink pixels, glyph and all, its text `width` wide. */
export function letterBox(letter: MapLetter, width: number): Rect {
  if (letter.kind === 'water')
    return {
      x: letter.x - width / 2 - RING_PX,
      y: letter.y - LINE_PX / 2 - 1,
      width: width + RING_PX * 2,
      height: LINE_PX + 2,
    };
  return { x: letter.x - 5, y: letter.y - 8, width: NAME_OFFSET_PX + 5 + width, height: LINE_PX };
}

/** The key's size in a corner: four rows of a swatch and its holder's word, the widest word `wordsWidth` wide, and
 *  the difficulty ramp's row, `rampWidth` wide. */
export function keySize(wordsWidth: number, rampWidth: number): { readonly width: number; readonly height: number } {
  const rows = HOLDER_WORDS.length + 1;
  return {
    width: KEY.padding * 2 + Math.max(KEY.swatch[0] + KEY.gap + wordsWidth, rampWidth),
    height: KEY.padding * 2 + rows * LINE_PX + (rows - 1) * KEY.rowGap,
  };
}

/** Whether any discovered land lies under `box` (ink pixels), the map showing `view` (its top-left in metres and
 *  pixels a metre): the coast field asked every few pixels across it, its corners and edges included. */
export function landUnder(
  field: CoastField,
  knownIslands: number,
  view: { readonly left: number; readonly top: number; readonly scale: number },
  box: Rect,
): boolean {
  const step = 4;
  const across = Math.max(1, Math.ceil(box.width / step));
  const down = Math.max(1, Math.ceil(box.height / step));
  for (let row = 0; row <= down; row++)
    for (let column = 0; column <= across; column++) {
      const x = view.left + (box.x + (box.width * column) / across) / view.scale;
      const y = view.top + (box.y + (box.height * row) / down) / view.scale;
      const cellX = Math.floor(x / field.cellM);
      const cellY = Math.floor(y / field.cellM);
      if (cellX < 0 || cellY < 0 || cellX >= field.columns || cellY >= field.rows) continue;
      const cell = cellY * field.columns + cellX;
      const island = field.island[cell] ?? NO_ISLAND;
      const known = island !== NO_ISLAND && ((knownIslands >>> Math.min(island, 31)) & 1) === 1;
      if (known && (field.distance[cell] ?? 1) < 0) return true;
    }
  return false;
}

/** The key's box in `corner` of a map `ink` wide and high, ink pixels. */
function cornerBox(corner: Corner, ink: { width: number; height: number }, size: { width: number; height: number }) {
  const left = corner.endsWith('left') ? KEY.inset : ink.width - KEY.inset - size.width;
  const top = corner.startsWith('upper') ? KEY.inset : ink.height - KEY.inset - size.height;
  return { x: left, y: top, width: size.width, height: size.height };
}

/** Where the key goes on a map `ink` wide and high: the corner it stands in while that stays clear of land (`land`)
 *  and of every word's and mark's box (`taken`), else the first clear corner, lower left first; with none clear, one
 *  row `rowWidth` wide in the middle of the parchment's margin under the map, `ink.margin` high. So it moves only when
 *  it must, and never back and forth while the map stands still. */
export function keyPlace(
  ink: { readonly width: number; readonly height: number; readonly margin: number },
  size: { readonly width: number; readonly height: number },
  rowWidth: number,
  taken: readonly Rect[],
  land: (box: Rect) => boolean,
  current: KeyPlace | null,
): KeyPlace {
  const clear = (box: Rect) => !taken.some((each) => overlaps(each, box)) && !land(box);
  const order = current && current.corner !== 'margin' ? [current.corner, ...CORNERS] : CORNERS;
  for (const corner of order) {
    const box = cornerBox(corner, ink, size);
    if (clear(box)) return { corner, box };
  }
  const y = ink.height + (ink.margin - LINE_PX) / 2;
  return { corner: 'margin', box: { x: (ink.width - rowWidth) / 2, y, width: rowWidth, height: LINE_PX } };
}

/** The key's words' widest width, its difficulty ramp's width, and its width laid in one row, as `painter` measures
 *  them in the map's face. */
export function keyWidths(painter: Pick<Painter, 'measureText' | 'font'>): {
  words: number;
  ramp: number;
  row: number;
} {
  painter.font = LETTER_FONT;
  const widths = HOLDER_WORDS.map(([, words]) => painter.measureText(words).width);
  const ramp =
    painter.measureText(RAMP.from).width + KEY.gap * 2 + RAMP.steps * RAMP.step + painter.measureText(RAMP.to).width;
  const row = widths.reduce(
    (sum, width) => sum + KEY.swatch[0] + KEY.gap + width + KEY.padding * 2,
    ramp + KEY.padding,
  );
  return { words: Math.max(...widths), ramp, row };
}

/** Paints `lettering` onto the parchment's picture: `inkAt` is where the map's top-left stands in it, and `scale` its
 *  pixels a screen pixel. The picture is cleared first. */
export function paintLettering(
  painter: Painter,
  picture: { readonly width: number; readonly height: number },
  inkAt: { readonly x: number; readonly y: number },
  scale: number,
  lettering: Lettering,
): void {
  painter.setTransform(1, 0, 0, 1, 0, 0);
  painter.clearRect(0, 0, picture.width, picture.height);
  painter.setTransform(scale, 0, 0, scale, inkAt.x * scale, inkAt.y * scale);
  painter.font = LETTER_FONT;
  painter.textBaseline = 'middle';
  painter.lineJoin = 'round';
  for (const letter of lettering.letters) paintLetter(painter, letter);
  if (lettering.ship) paintShip(painter, lettering.ship);
  if (lettering.key) paintKey(painter, lettering.key);
}

function word(painter: Painter, text: string, x: number, y: number, colour: string): void {
  painter.lineWidth = 2;
  painter.strokeStyle = PARCHMENT;
  painter.strokeText(text, x, y);
  painter.fillStyle = colour;
  painter.fillText(text, x, y);
}

/** A word and its glyph: a port's filled ring, a ruin's dashed diamond, a node's ring; a water's name centred. */
function paintLetter(painter: Painter, letter: MapLetter): void {
  const colour = letter.chosen ? ROUTE : INK;
  if (letter.kind === 'water') {
    const colour = letter.colour ?? INK;
    paintRing(painter, letter.x, letter.y, painter.measureText(letter.text).width / 2 + RING_PX, colour);
    painter.textAlign = 'center';
    word(painter, letter.text, letter.x, letter.y, colour);
    return;
  }
  painter.lineWidth = 1.5;
  painter.strokeStyle = INK;
  painter.fillStyle = INK;
  painter.beginPath();
  if (letter.kind === 'ruin') {
    painter.setLineDash([2, 1.5]);
    painter.moveTo(letter.x, letter.y - 4.5);
    painter.lineTo(letter.x + 4.5, letter.y);
    painter.lineTo(letter.x, letter.y + 4.5);
    painter.lineTo(letter.x - 4.5, letter.y);
    painter.closePath();
    painter.stroke();
    painter.setLineDash([]);
  } else {
    painter.arc(letter.x, letter.y, 3.5, 0, 2 * Math.PI);
    if (letter.kind === 'port') painter.fill();
    else painter.stroke();
  }
  painter.textAlign = 'left';
  word(painter, letter.text, letter.x + NAME_OFFSET_PX, letter.y, colour);
}

/** A ring round a water's name, a capsule `half` wide either side of its middle, in her difficulty's colour. */
function paintRing(painter: Painter, x: number, y: number, half: number, colour: string): void {
  const radius = LINE_PX / 2;
  const straight = Math.max(0, half - radius);
  painter.lineWidth = 1.5;
  painter.strokeStyle = colour;
  painter.beginPath();
  painter.arc(x - straight, y, radius, Math.PI / 2, (3 * Math.PI) / 2);
  painter.lineTo(x + straight, y - radius);
  painter.arc(x + straight, y, radius, -Math.PI / 2, Math.PI / 2);
  painter.closePath();
  painter.stroke();
}

/** The ship's red-brown arrow along her heading (radians clockwise from north). */
function paintShip(painter: Painter, ship: { x: number; y: number; heading: number }): void {
  const point = (along: number, across: number): [number, number] => [
    ship.x + Math.sin(ship.heading) * along + Math.cos(ship.heading) * across,
    ship.y - Math.cos(ship.heading) * along + Math.sin(ship.heading) * across,
  ];
  painter.fillStyle = ROUTE;
  painter.beginPath();
  painter.moveTo(...point(9, 0));
  painter.lineTo(...point(-7, 6));
  painter.lineTo(...point(-7, -6));
  painter.closePath();
  painter.fill();
}

/** The key: a swatch of each holder's colour and its word, in a box of the parchment's own colour. */
function paintKey(painter: Painter, place: KeyPlace): void {
  const { box } = place;
  const row = place.corner === 'margin';
  // On the margin its box keeps the words readable over the parchment's torn edge.
  painter.fillStyle = row ? 'rgba(238, 222, 190, 0.9)' : 'rgba(238, 222, 190, 0.6)';
  painter.fillRect(box.x, box.y, box.width, box.height);
  painter.lineWidth = 1;
  painter.strokeStyle = 'rgba(58, 40, 22, 0.45)';
  painter.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
  painter.textAlign = 'left';
  let [x, y] = row
    ? [box.x + KEY.padding, box.y + LINE_PX / 2]
    : [box.x + KEY.padding, box.y + KEY.padding + LINE_PX / 2];
  for (const [holder, words] of HOLDER_WORDS) {
    painter.fillStyle = HOLDER_COLOURS[holder];
    painter.fillRect(x, y - KEY.swatch[1] / 2, KEY.swatch[0], KEY.swatch[1]);
    painter.fillStyle = INK;
    painter.fillText(words, x + KEY.swatch[0] + KEY.gap, y);
    if (row) x += KEY.swatch[0] + KEY.gap + painter.measureText(words).width + KEY.padding * 2;
    else y += LINE_PX + KEY.rowGap;
  }
  paintRamp(painter, x, y);
}

/** The key's difficulty ramp from `x`, its words' middle at `y`: "Levels 1", a swatch a step, "30". */
function paintRamp(painter: Painter, x: number, y: number): void {
  painter.fillStyle = INK;
  painter.fillText(RAMP.from, x, y);
  let left = x + painter.measureText(RAMP.from).width + KEY.gap;
  for (const level of RAMP_LEVELS) {
    painter.fillStyle = levelColour(level);
    painter.fillRect(left, y - KEY.swatch[1] / 2, RAMP.step, KEY.swatch[1]);
    left += RAMP.step;
  }
  painter.fillStyle = INK;
  painter.fillText(RAMP.to, left + KEY.gap, y);
}
