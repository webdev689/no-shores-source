// What the held map letters on its parchment, painted where the layout put it (mapLayout.ts): each place's mark (a
// port's anchor, a ruin's faded), each sea's name arched across it, each island's name with its level band, a locked
// sea's padlock, the ship's arrow and the key (mapKey.ts). They are painted onto a picture of the
// parchment that its ink pass lays down with the ink, so the gauntlets holding the map cover them as they cover the
// parchment.
import { FACE, INK, paintKey } from './mapKey.ts';
import { FILLS } from '../plus/tones.ts';
import type { Point2 } from '../overworld/ground.ts';
import {
  archedLength,
  archOf,
  type Lettering,
  type MapLetter,
  markHalf,
  PORT_PX,
  SEA_PX,
  WORD_PX,
} from './mapLayout.ts';

/** The map's face, the game's own (face.css): a port's and an island's name a step larger than every other word, a
 *  sea's larger again. */
export const fontOf = (kind: string) =>
  kind === 'water'
    ? `500 ${SEA_PX}px ${FACE}`
    : `${kind === 'island' ? 600 : 500} ${kind === 'port' || kind === 'island' ? PORT_PX : WORD_PX}px ${FACE}`;
/** The inks besides the key's iron-gall (mapKey.ts): a lighter brown for ruins, the route's red-brown for the ring
 *  round a place the quest names, the parchment's own colour, which rings every word so it reads over the coasts'
 *  lines and the washes, and a sea's name's ink, thinned so it sinks into the sea it is written across. */
export const LIGHT_INK = '#5c4631';
export const ROUTE = '#781c14';
export const PARCHMENT = '#eedebe';
/** A hostile ship's mark, in the Grey Tithe's dark slate, as its waters are hatched (watersWash.ts `HATCHES`). */
export const HOSTILE_INK = '#4a5563';
export const SEA_NAME = 'rgba(58, 40, 22, 0.42)';
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
  | 'rotate'
  | 'scale'
  | 'rect'
  | 'clip'
  | 'drawImage'
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

/** The found islands' marks on the map `ink` wide and high (`inkOf` the ink point of a world point), whole marks
 *  only, `scale` times their units, to the quarter pixel. */
export function isleInks(
  isles: readonly { readonly at: readonly [number, number]; readonly isle: boolean }[],
  inkOf: (x: number, y: number) => readonly [number, number],
  ink: { readonly width: number; readonly height: number },
  scale: number,
): IsleInk[] {
  const half = ISLE_HALF * scale;
  return isles.flatMap((mark) => {
    const [x, y] = inkOf(mark.at[0], mark.at[1]);
    if (x < half || y < half || x > ink.width - half || y > ink.height - half) return [];
    return [{ x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4, isle: mark.isle }];
  });
}

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
  others: readonly DotInk[] = [],
  hostiles: readonly DotInk[] = [],
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
  for (const other of others) local(other.x, other.y, () => paintDot(painter, other.company));
  for (const hostile of hostiles) local(hostile.x, hostile.y, () => paintHostile(painter));
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

/** A mark or a name at the origin, units: a port's anchor, a ruin's faded, a node only as the quest's ring round it, a
 *  locked sea's padlock; a sea's name arched across it, an island's name and its level band. */
function paintLetter(painter: Painter, letter: MapLetter): void {
  painter.font = fontOf(letter.kind);
  if (letter.kind === 'water') {
    painter.font = `500 ${letter.px ?? SEA_PX}px ${FACE}`;
    return paintArched(painter, letter.text, letter.spread ?? 0);
  }
  if (letter.kind === 'island') return paintIsland(painter, letter.text, letter.band ?? '', letter.colour ?? INK);
  if (letter.kind === 'lock') return paintLock(painter);
  if (letter.kind === 'port' || letter.kind === 'ruin') paintAnchor(painter, letter.kind === 'ruin');
  if (!letter.quest) return;
  painter.lineWidth = 1.5;
  painter.strokeStyle = ROUTE;
  painter.beginPath();
  painter.arc(0, 0, markHalf(letter.kind) + 2.5, 0, 2 * Math.PI);
  painter.stroke();
}

/** A sea's name arched along a circle whose middle stands below it, each letter turned to the arc, `spread` units
 *  apart, in the thinned ink with no halo, so it sinks into the sea. */
function paintArched(painter: Painter, text: string, spread: number): void {
  const letters = [...text];
  const widths = letters.map((one) => painter.measureText(one).width);
  const length = archedLength(text, painter.measureText(text).width, spread);
  const { radius, rise } = archOf(length);
  painter.textAlign = 'center';
  painter.fillStyle = SEA_NAME;
  let along = -length / 2;
  letters.forEach((one, index) => {
    const width = widths[index] ?? 0;
    const turn = (along + width / 2) / radius;
    painter.save();
    painter.translate(radius * Math.sin(turn), radius * (1 - Math.cos(turn)) - rise / 2);
    painter.rotate(turn);
    painter.fillText(one, 0, 0);
    painter.restore();
    along += width + spread;
  });
}

/** An island's name centred at the origin, its level band after it in the band's colour on the difficulty ramp. */
function paintIsland(painter: Painter, name: string, band: string, colour: string): void {
  const said = band ? `${name}, ` : name;
  const [nameWidth, bandWidth] = [painter.measureText(said).width, band ? painter.measureText(band).width : 0];
  const left = -(nameWidth + bandWidth) / 2;
  painter.textAlign = 'left';
  word(painter, said, left, 0, INK);
  if (band) word(painter, band, left + nameWidth, 0, colour);
}

/** A port's anchor at the origin, units, ringed in the parchment so it reads over the coast: a ring, its shank and
 *  stock, its arms curving up to their flukes; a ruin's in the lighter ink, thinned. */
export function paintAnchor(painter: Painter, faded: boolean): void {
  const strokes = () => {
    painter.beginPath();
    painter.arc(0, -4.6, 1.3, 0, 2 * Math.PI);
    painter.moveTo(0, -3.3);
    painter.lineTo(0, 4.8);
    painter.moveTo(-2.6, -1.6);
    painter.lineTo(2.6, -1.6);
    painter.moveTo(-4.6, 1.6);
    painter.arc(0, 0.6, 4.7, Math.PI * 0.94, Math.PI * 0.06, true);
    painter.stroke();
  };
  painter.lineJoin = 'round';
  painter.lineWidth = 3.2;
  painter.strokeStyle = PARCHMENT;
  strokes();
  painter.lineWidth = 1.4;
  painter.strokeStyle = faded ? 'rgba(92, 70, 49, 0.6)' : INK;
  strokes();
}

/** A locked sea's padlock at the origin, units, standing out: a disc of the parchment ringed in the ink, the lock in
 *  the ink on it, its keyhole in the parchment. */
export function paintLock(painter: Painter): void {
  painter.beginPath();
  painter.arc(0, 0, 14, 0, 2 * Math.PI);
  painter.fillStyle = PARCHMENT;
  painter.fill();
  painter.lineWidth = 2.2;
  painter.strokeStyle = INK;
  painter.stroke();
  painter.beginPath();
  painter.arc(0, -2.8, 4.2, Math.PI, 2 * Math.PI);
  painter.lineWidth = 2.4;
  painter.stroke();
  painter.fillStyle = INK;
  painter.fillRect(-6.7, -2.8, 13.4, 10.4);
  painter.fillStyle = PARCHMENT;
  painter.beginPath();
  painter.arc(0, 1.4, 1.7, 0, 2 * Math.PI);
  painter.fill();
  painter.fillRect(-0.7, 1.4, 1.4, 3.6);
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

/** Units from a hostile ship's mark's middle to its farthest edge, its parchment edge included. */
export const HOSTILE_HALF = 8.5;

/** A hostile ship's mark at the origin: a hull under a sail, in its dark slate, edged in the parchment. */
export function paintHostile(painter: Painter): void {
  painter.beginPath();
  painter.moveTo(-6, 1);
  painter.lineTo(6, 1);
  painter.lineTo(4, 4.5);
  painter.lineTo(-4, 4.5);
  painter.closePath();
  painter.moveTo(-0.5, 0);
  painter.lineTo(-0.5, -7);
  painter.lineTo(5, -1);
  painter.closePath();
  painter.lineWidth = 2.5;
  painter.strokeStyle = PARCHMENT;
  painter.stroke();
  painter.fillStyle = HOSTILE_INK;
  painter.fill();
}

/** Another player's ship on the sea's sheet, ink pixels, and whether they are of the viewer's company. */
export interface DotInk {
  readonly x: number;
  readonly y: number;
  readonly company: boolean;
}

/** Other players' ships at sea (world metres) as their dots on the sheet `ink` (`inkOf`), those on it alone, to the
 *  quarter pixel; marks of no company (hostile ships) as of none. With `half`, a mark reaching that far from its
 *  middle, ink pixels, only those whole on it. */
export function dotInks(
  others: readonly { readonly at: Point2; readonly company?: boolean }[],
  inkOf: (x: number, y: number) => readonly [number, number],
  ink: { readonly width: number; readonly height: number },
  half = 0,
): DotInk[] {
  return others.flatMap(({ at, company = false }) => {
    const [x, y] = inkOf(at[0], at[1]);
    const onSheet = x >= half && y >= half && x <= ink.width - half && y <= ink.height - half;
    return onSheet ? [{ x: Math.round(x * 4) / 4, y: Math.round(y * 4) / 4, company }] : [];
  });
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
