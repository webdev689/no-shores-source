// What the held map letters on its parchment, painted where the layout put it (mapLayout.ts): each place's mark and
// name, each water's name in her ring, the ship's arrow and the key (mapKey.ts). They are painted onto a picture of the
// parchment that its ink pass lays down with the ink, so the gauntlets holding the map cover them as they cover the
// parchment.
import { paintKey } from './mapKey.ts';
import { LINE, type Lettering, type MapLetter, markHalf, NAME_GAP, PORT_PX, RING, WORD_PX } from './mapLayout.ts';

/** The map's face, Overlook's own (face.css): a port's name a step larger than every other word. */
const FACE = "'Pixelify Mended', 'Pixelify Sans Variable', monospace";
export const fontOf = (kind: string) => `500 ${kind === 'port' ? PORT_PX : WORD_PX}px ${FACE}`;
/** The inks: iron-gall for ports and the key, a lighter brown for ruins and nodes, the route's red-brown for the place
 *  chosen, and the parchment's own colour, which rings every word and fills each water's ring so it reads over the
 *  coasts' lines and the washes. */
export const INK = '#3a2816';
export const LIGHT_INK = '#5c4631';
const ROUTE = '#781c14';
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
> & {
  font: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  lineJoin: CanvasLineJoin;
};

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
  painter.textBaseline = 'middle';
  painter.lineJoin = 'round';
  const local = (x: number, y: number, draw: () => void) => {
    painter.save();
    painter.translate(x, y);
    painter.scale(lettering.scale, lettering.scale);
    draw();
    painter.restore();
  };
  for (const letter of lettering.letters) local(letter.x, letter.y, () => paintLetter(painter, letter));
  const { ship } = lettering;
  if (ship) local(ship.x, ship.y, () => paintShip(painter, ship.heading));
  if (lettering.key) paintKey(painter, lettering.key, lettering.scale);
}

/** A word with its parchment halo, from `x` along `align`, its middle at `y`. */
function word(painter: Painter, text: string, x: number, y: number, colour: string): void {
  painter.lineWidth = HALO;
  painter.strokeStyle = PARCHMENT;
  painter.strokeText(text, x, y);
  painter.fillStyle = colour;
  painter.fillText(text, x, y);
}

/** A mark and its name at the origin, units: a port's filled ring, a ruin's dashed diamond, a node's ring, the name
 *  beside it on its side, its middle on the mark's; a water's name centred in her ring. */
function paintLetter(painter: Painter, letter: MapLetter): void {
  painter.font = fontOf(letter.kind);
  if (letter.kind === 'water') {
    const colour = letter.colour ?? INK;
    paintRing(painter, painter.measureText(letter.text).width / 2 + RING, colour);
    painter.textAlign = 'center';
    word(painter, letter.text, 0, 0, colour);
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
  if (!letter.side || letter.side === 'centre') return;
  // A name on the left ends at its offset from the mark; on the right it starts there.
  painter.textAlign = letter.side === 'left' ? 'right' : 'left';
  const offset = half + NAME_GAP;
  word(painter, letter.text, letter.side === 'right' ? offset : -offset, 0, letter.chosen ? ROUTE : ink);
}

/** A water's ring round her name, a capsule `half` wide either side of its middle, filled with the parchment and
 *  drawn in her difficulty's colour. */
function paintRing(painter: Painter, half: number, colour: string): void {
  const radius = LINE / 2 + 1;
  const straight = Math.max(0, half - radius);
  painter.lineWidth = 1.5;
  painter.strokeStyle = colour;
  painter.fillStyle = RING_FILL;
  painter.beginPath();
  painter.arc(-straight, 0, radius, Math.PI / 2, (3 * Math.PI) / 2);
  painter.lineTo(straight, -radius);
  painter.arc(straight, 0, radius, -Math.PI / 2, Math.PI / 2);
  painter.closePath();
  painter.fill();
  painter.stroke();
}

/** The ship's red-brown arrow along her heading (radians clockwise from north), ringed in the parchment. */
function paintShip(painter: Painter, heading: number): void {
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
