// What the held map letters on its parchment, painted where the layout put it (mapLayout.ts): each place's mark and
// name, each water's name in its ring, the ship's arrow and the key (mapKey.ts). They are painted onto a picture of the
// parchment that its ink pass lays down with the ink, so the gauntlets holding the map cover them as they cover the
// parchment.
import { FACE, INK, paintKey } from './mapKey.ts';
import {
  LINE,
  type Lettering,
  type MapLetter,
  markHalf,
  NAME_GAP,
  PORT_PX,
  RING,
  waterLines,
  WORD_PX,
} from './mapLayout.ts';

/** The map's face, Overlook's own (face.css): a port's name a step larger than every other word. */
export const fontOf = (kind: string) => `500 ${kind === 'port' ? PORT_PX : WORD_PX}px ${FACE}`;
/** The inks besides the key's iron-gall (mapKey.ts): a lighter brown for ruins and nodes, the route's red-brown for
 *  the place chosen and the ring round a place the quest names, and the parchment's own colour, which rings every word
 *  and fills each water's ring so it reads over the coasts' lines and the washes. */
export const LIGHT_INK = '#5c4631';
export const ROUTE = '#781c14';
export const PARCHMENT = '#eedebe';
const RING_FILL = 'rgba(238, 222, 190, 0.9)';
/** The halo of parchment round every word, units wide. */
const HALO = 3;

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
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'rect'
  | 'clip'
> & {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  lineJoin: CanvasLineJoin;
};

/** A found island's mark where it lies on the map, ink pixels: a cove, or an isle (a ruin's or a quarry's). */
export interface IsleInk {
  readonly x: number;
  readonly y: number;
  readonly isle: boolean;
}

/** Units across a cove's ring and an isle's, either side of its middle. */
export const COVE_HALF = 2.5;
export const ISLE_HALF = 4;

/** A found island's mark at the origin, units, in the lighter ink: a cove a small ring; an isle a wider ring with a
 *  tower standing in it, crenellated at its top. */
export function paintIsle(painter: Painter, isle: boolean): void {
  painter.lineWidth = 1.2;
  painter.strokeStyle = LIGHT_INK;
  painter.fillStyle = LIGHT_INK;
  painter.beginPath();
  painter.arc(0, 0, isle ? ISLE_HALF : COVE_HALF, 0, 2 * Math.PI);
  painter.stroke();
  if (!isle) return;
  painter.fillRect(-1, -1.5, 2, 3.5);
  painter.fillRect(-1.6, -2.6, 0.9, 1.2);
  painter.fillRect(0.7, -2.6, 0.9, 1.2);
  painter.fillRect(-0.45, -2.6, 0.9, 1.2);
}

/** Paints `lettering` onto the parchment's picture: `inkAt` is where the map's top-left stands in it, and `scale` its
 *  pixels a screen pixel. The picture is cleared first. Found islands' marks go under the words. */
export function paintLettering(
  painter: Painter,
  picture: { readonly width: number; readonly height: number },
  inkAt: { readonly x: number; readonly y: number },
  scale: number,
  lettering: Lettering,
  isles: readonly IsleInk[] = [],
): void {
  painter.setTransform(1, 0, 0, 1, 0, 0);
  painter.clearRect(0, 0, picture.width, picture.height);
  painter.setTransform(scale, 0, 0, scale, inkAt.x * scale, inkAt.y * scale);
  painter.textBaseline = 'middle';
  painter.lineJoin = 'round';
  const local = (x: number, y: number, draw: () => void) => {
    painter.save();
    painter.translate(x, y);
    painter.scale(lettering.scale, lettering.scale);
    draw();
    painter.restore();
  };
  for (const mark of isles) local(mark.x, mark.y, () => paintIsle(painter, mark.isle));
  for (const letter of lettering.letters) local(letter.x, letter.y, () => paintLetter(painter, letter));
  const { ship } = lettering;
  if (ship) local(ship.x, ship.y, () => paintArrow(painter, ship.heading));
  if (lettering.key) paintKey(painter, lettering.key, lettering.scale);
}

/** A word with its parchment halo, from `x` along `align`, its middle at `y`. */
export function word(painter: Painter, text: string, x: number, y: number, colour: string): void {
  painter.lineWidth = HALO;
  painter.strokeStyle = PARCHMENT;
  painter.strokeText(text, x, y);
  painter.fillStyle = colour;
  painter.fillText(text, x, y);
}

/** A mark and its name at the origin, units: a port's filled ring, a ruin's dashed diamond, a node's ring, the name
 *  beside it on its side, its middle on the mark's; a water's name centred in its ring. */
function paintLetter(painter: Painter, letter: MapLetter): void {
  painter.font = fontOf(letter.kind);
  if (letter.kind === 'water') {
    const colour = letter.colour ?? INK;
    const lines = waterLines(letter.text, letter.lines);
    const widest = Math.max(...lines.map((line) => painter.measureText(line).width));
    paintRing(painter, widest / 2 + RING, (lines.length - 1) * LINE, colour);
    painter.textAlign = 'center';
    lines.forEach((line, index) => word(painter, line, 0, (index - (lines.length - 1) / 2) * LINE, colour));
    return;
  }
  const ink = letter.kind === 'port' ? INK : LIGHT_INK;
  painter.lineWidth = 1.5;
  painter.strokeStyle = ink;
  painter.fillStyle = ink;
  painter.beginPath();
  const half = markHalf(letter.kind);
  if (letter.kind === 'ruin') {
    painter.setLineDash([2, 1.5]);
    painter.moveTo(0, -half);
    painter.lineTo(half, 0);
    painter.lineTo(0, half);
    painter.lineTo(-half, 0);
    painter.closePath();
    painter.stroke();
    painter.setLineDash([]);
  } else {
    painter.arc(0, 0, half - 0.75, 0, 2 * Math.PI);
    if (letter.kind === 'port') painter.fill();
    else painter.stroke();
  }
  if (letter.quest) {
    painter.strokeStyle = ROUTE;
    painter.beginPath();
    painter.arc(0, 0, half + 2.5, 0, 2 * Math.PI);
    painter.stroke();
  }
  if (!letter.side || letter.side === 'centre') return;
  // A name on the left ends at its offset from the mark; on the right it starts there.
  painter.textAlign = letter.side === 'left' ? 'right' : 'left';
  const offset = letter.away ?? half + NAME_GAP;
  word(painter, letter.text, letter.side === 'right' ? offset : -offset, 0, letter.chosen ? ROUTE : ink);
}

/** A water's ring round its name, `half` wide either side of its middle and `taller` than one line: rounded at its
 *  ends, filled with the parchment and drawn in its difficulty's colour. */
function paintRing(painter: Painter, half: number, taller: number, colour: string): void {
  const radius = LINE / 2 + 1;
  const straight = Math.max(0, half - radius);
  const rise = taller / 2;
  painter.lineWidth = 1.5;
  painter.strokeStyle = colour;
  painter.fillStyle = RING_FILL;
  painter.beginPath();
  painter.arc(-straight, -rise, radius, Math.PI, (3 * Math.PI) / 2);
  painter.arc(straight, -rise, radius, -Math.PI / 2, 0);
  painter.arc(straight, rise, radius, 0, Math.PI / 2);
  painter.arc(-straight, rise, radius, Math.PI / 2, Math.PI);
  painter.closePath();
  painter.fill();
  painter.stroke();
}

/** The ship's red-brown arrow, or the player's on land, along its heading (radians clockwise from north), ringed in
 *  the parchment. */
export function paintArrow(painter: Painter, heading: number): void {
  const point = (along: number, across: number): [number, number] => [
    Math.sin(heading) * along + Math.cos(heading) * across,
    -Math.cos(heading) * along + Math.sin(heading) * across,
  ];
  painter.beginPath();
  painter.moveTo(...point(9, 0));
  painter.lineTo(...point(-7, 6));
  painter.lineTo(...point(-7, -6));
  painter.closePath();
  painter.lineWidth = 2;
  painter.strokeStyle = PARCHMENT;
  painter.stroke();
  painter.fillStyle = ROUTE;
  painter.fill();
}
