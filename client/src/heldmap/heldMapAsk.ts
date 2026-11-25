// What the held map says of another water at sea: the water under the pointer, lit over its own cells and named by the
// pointer, and the prompt a course into it raises, asking whether to travel there.
// Which water the ship and a course's end lie in
// is the world crate's exact rule, the room's (`WaterJudge`); the page's grid of the waters, judged once a 4.8 km cell
// (`MapWaters`), only lights the water under the pointer. What is said is painted in the map's own letters.
import type { Point2 } from '../overworld/ground.ts';
import { FACE, INK } from './mapKey.ts';
import { fontOf, type Painter, PARCHMENT, word } from './mapLetters.ts';
import { HOLDER_WORDS, type MapWater, type MapWaters } from './watersWash.ts';

/** The prompt's lines' heights and its padding, ink units; and how far right of and above the pointer its words stand,
 *  and how far in from the map's edge at least. */
const ASK = { title: 22, line: 18, padding: 10 } as const;
const HOVER_OFFSET = { x: 14, y: -12, margin: 6 } as const;

/** The water at a world point, none on land or off the frame. */
export function waterAt(waters: MapWaters, [x, y]: Point2): MapWater | null {
  const [column, row] = [Math.floor(x / waters.cellM), Math.floor(y / waters.cellM)];
  if (column < 0 || row < 0 || column >= waters.columns || row >= waters.rows) return null;
  const continent = waters.water[row * waters.columns + column] ?? -1;
  return waters.waters.find((water) => water.continent === continent) ?? null;
}

/** The water a point of sea lies in by the exact rule, by its continent's index; none on land. */
export type WaterJudge = (point: Point2) => number | null;

/** The water on the grid at `point` when it is not the ship's own (`own`, its continent's index); none over land. */
export function otherWater(waters: MapWaters, point: Point2, own: number | null): MapWater | null {
  const there = waterAt(waters, point);
  return there && there.continent !== own ? there : null;
}

/** A byte a cell, 255 over the water `continent` and the land beside it, so its lit edge is drawn only where it meets
 *  another water; all 0 for none. */
export function litCells(waters: MapWaters, continent: number | null): Uint8Array {
  const { columns, rows, water } = waters;
  const lit = new Uint8Array(columns * rows);
  if (continent === null) return lit;
  for (let cell = 0; cell < lit.length; cell++) if (water[cell] === continent) lit[cell] = 255;
  const near = (column: number, row: number) =>
    [-1, 0, 1].some((down) =>
      [-1, 0, 1].some((across) => {
        const [x, y] = [column + across, row + down];
        return x >= 0 && y >= 0 && x < columns && y < rows && water[y * columns + x] === continent;
      }),
    );
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++)
      if ((water[row * columns + column] ?? -1) < 0 && near(column, row)) lit[row * columns + column] = 255;
  return lit;
}

/** A water's holder and level band, as the map says them. */
function aboutOf(water: MapWater): string {
  const holder = HOLDER_WORDS.find(([held]) => held === water.holder)?.[1] ?? water.holder;
  return water.levels ? `${holder} · levels ${water.levels[0]}-${water.levels[1]}` : holder;
}

/** What the pointer's words say of the water under it: its name, its holder and its level band. */
export function hoverLine(water: MapWater): string {
  return `${water.name ?? water.id} · ${aboutOf(water)}`;
}

/** The prompt's lines: whether to travel to the water, its holder and level band, and its answers, `yes` and `refuse`
 *  the keys or buttons that answer them. */
export function askLines(water: MapWater, yes: string, refuse = 'Escape'): readonly string[] {
  return [`Travel to ${water.name ?? water.id}?`, aboutOf(water), `Yes  ${yes}      No  ${refuse}`];
}

/** Paints the pointer's words beside it at `x`, `y`, ink units, in the painter's ink transform (`paintLettering`'s),
 *  `scale` the lettering's: to its right, drawn back toward it where they would run off the map `ink` wide. */
export function paintHover(
  painter: Painter,
  line: string,
  x: number,
  y: number,
  ink: { readonly width: number; readonly height: number },
  scale: number,
): void {
  painter.font = fontOf('node');
  const width = painter.measureText(line).width * scale;
  const right = x + HOVER_OFFSET.x * scale;
  const left = Math.min(right, ink.width - width - HOVER_OFFSET.margin * scale);
  painter.save();
  painter.translate(Math.max(0, left), Math.max(HOVER_OFFSET.x * scale, y + HOVER_OFFSET.y * scale));
  painter.scale(scale, scale);
  painter.textAlign = 'left';
  word(painter, line, 0, 0, INK);
  painter.restore();
}

/** Paints the prompt on a card of parchment ringed in ink, centred across the map `ink` wide and high a quarter of
 *  the way down, in the painter's ink transform, `scale` the lettering's. */
export function paintTravelAsk(
  painter: Painter,
  ink: { readonly width: number; readonly height: number },
  scale: number,
  lines: readonly string[],
): void {
  const fonts = lines.map((line, index) => (index === 0 ? `600 ${ASK.title - 4}px ${FACE}` : fontOf('node')));
  const widths = lines.map((line, index) => {
    painter.font = fonts[index] ?? fontOf('node');
    return painter.measureText(line).width;
  });
  const width = Math.max(...widths) + ASK.padding * 2;
  const height = ASK.title + ASK.line * (lines.length - 1) + ASK.padding * 2;
  painter.save();
  painter.translate(ink.width / 2, ink.height / 4);
  painter.scale(scale, scale);
  painter.fillStyle = PARCHMENT;
  painter.fillRect(-width / 2, -height / 2, width, height);
  painter.lineWidth = 1.5;
  painter.strokeStyle = INK;
  painter.strokeRect(-width / 2, -height / 2, width, height);
  painter.textAlign = 'center';
  let y = -height / 2 + ASK.padding + ASK.title / 2;
  lines.forEach((line, index) => {
    painter.font = fonts[index] ?? fontOf('node');
    word(painter, line, 0, y, INK);
    y += index === 0 ? (ASK.title + ASK.line) / 2 : ASK.line;
  });
  painter.restore();
}

/** The pointer's words this frame, and where they stand, ink units. */
export interface HoverSaid {
  readonly line: string;
  readonly x: number;
  readonly y: number;
}

/** The held map's asks at sea: where the pointer is (screen pixels, none off the canvas), the water lit under it, and
 *  the water a course chosen into it asks to travel to, until answered. */
export class MapAsk {
  pointer: { readonly x: number; readonly y: number } | null = null;
  asking: MapWater | null = null;
  private lit: number | null = null;
  /** The pointer's words as they stand: where the pointer came into the water lit, until another is. */
  private said: HoverSaid | null = null;
  /** The map's view and place the words were stood by: once it moves, they stand anew by the pointer. */
  private seenOn = '';

  /** The water under the pointer on the map `ink` (screen pixels) showing `view`, the ship at `ship`: the cells to
   *  light when the water lit changes (null when it has not), and the pointer's words, standing where it came in. */
  hover(
    waters: MapWaters,
    judge: WaterJudge,
    view: { readonly left: number; readonly top: number; readonly scale: number },
    ink: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
    ship: Point2,
  ): { readonly cells: Uint8Array | null; readonly said: HoverSaid | null } {
    const inked = this.pointer && { x: this.pointer.x - ink.x, y: this.pointer.y - ink.y };
    const onMap = inked && inked.x >= 0 && inked.y >= 0 && inked.x <= ink.width && inked.y <= ink.height;
    const world: Point2 | null = onMap ? [view.left + inked.x / view.scale, view.top + inked.y / view.scale] : null;
    const water = world && otherWater(waters, world, judge(ship));
    const lit = water?.continent ?? null;
    const seenOn = JSON.stringify([view, ink]);
    if (lit === this.lit && seenOn === this.seenOn) return { cells: null, said: this.said };
    const cells = lit === this.lit ? null : litCells(waters, lit);
    [this.lit, this.seenOn] = [lit, seenOn];
    // Painted once as the pointer comes into a water, not again at each move within it.
    this.said = water && inked ? { line: hoverLine(water), x: inked.x, y: inked.y } : null;
    return { cells, said: this.said };
  }

  /** A course chosen (`course`, from the ship at `ship`): it asks to travel when its end lies in another water than
   *  the ship, each by the exact rule; nothing when either is unknown. */
  choose(
    waters: MapWaters,
    judge: WaterJudge,
    course: { readonly ok: true; readonly points: readonly Point2[] } | { readonly ok: false; readonly why: string },
    ship: Point2,
  ): void {
    const end = course.ok ? course.points.at(-1) : undefined;
    const [there, own] = [end ? judge(end) : null, judge(ship)];
    const other = there !== null && own !== null && there !== own;
    this.asking = other ? (waters.waters.find((water) => water.continent === there) ?? null) : null;
  }

  /** No: the ask is let go, its course kept; answers whether one was asked. */
  answerNo(): boolean {
    const asked = this.asking !== null;
    this.asking = null;
    return asked;
  }
}
