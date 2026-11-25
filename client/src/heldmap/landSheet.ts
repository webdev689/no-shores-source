// The held map on land: what it shows of the ground the player stands on, laid out in the sheet's own metres. The game
// gathers it from the node (game/landMap.ts); landLetters.ts paints it on the parchment.
import type { Point2 } from '../overworld/ground.ts';
import type { LandGlyph } from './landGlyphs.ts';

/** A rectangle on the ground, its four corners in turn. */
export type Quad = readonly [Point2, Point2, Point2, Point2];
/** A short straight line, from one end to the other. */
export type Segment = readonly [Point2, Point2];

/** A mark on the land: its glyph (landGlyphs.ts), where it stands, and what the map's table calls it. */
export interface LandMark {
  readonly glyph: LandGlyph;
  readonly at: Point2;
  readonly word: string;
}

/** The plan's ground as the map washes it: paving, lawn, trodden earth and still water. */
export type GroundKind = 'paving' | 'lawn' | 'earth' | 'water';

/** The ground's relief as the map draws it: the sea, as the cells and parts of cells below its level; the shore; the
 *  lines every `RELIEF_M` above it, and every `INDEX_M` the bolder index lines among them. */
export interface Relief {
  readonly sea: readonly (readonly Point2[])[];
  readonly coast: readonly Segment[];
  readonly relief: readonly Segment[];
  readonly index: readonly Segment[];
}

/** The land as the map shows it: its name; its north-west corner in the world and its size, metres, from which
 *  everything else is measured, east and south; the ground's relief and its rivers (each length of one with its width,
 *  metres); the plan's grounds, walks and paths; what stands on it a body runs into, tall or low, and what stands over
 *  a body's head, which it walks under; its trees and bushes; the edge of the ground a body walks; its places by name;
 *  and its marks. */
export interface LandSheet extends Relief {
  readonly name: string;
  readonly origin: Point2;
  readonly width: number;
  readonly height: number;
  readonly rivers: readonly { readonly from: Point2; readonly to: Point2; readonly width: number }[];
  readonly grounds: readonly { readonly kind: GroundKind; readonly quad: Quad }[];
  readonly walks: readonly Quad[];
  /** Each path as wide as it is laid, metres: a track cased, a footpath dashed, a `faint` one a thin pale line, an
   *  `inked` one a thin solid line of the map's ink. */
  readonly paths: readonly {
    readonly track: boolean;
    readonly width: number;
    readonly points: readonly Point2[];
    readonly faint?: boolean;
    readonly inked?: boolean;
  }[];
  readonly standing: readonly Quad[];
  readonly low: readonly Quad[];
  readonly overhead: readonly Quad[];
  readonly plants: readonly { readonly tree: boolean; readonly at: Point2 }[];
  readonly ring: readonly Point2[];
  /** Each place's name where it stands: one `near` is lettered only beside its mark, never moved off it; one `loss`
   *  in the loss's red ink. */
  readonly places: readonly {
    readonly name: string;
    readonly at: Point2;
    readonly near?: boolean;
    readonly loss?: boolean;
  }[];
  readonly marks: readonly LandMark[];
  /** How much of it the map opens across, metres: 400 round the player unless said (the passages' web, whole). */
  readonly span?: number;
}

/** The rise between two lines of the ground's relief, and between two index lines, metres. */
export const RELIEF_M = 10;
export const INDEX_M = 50;

/** The ground a box covers, `[west, north, east, south]` in its own frame about `middle`, turned `turn` radians
 *  clockwise from north: a module's part, as the module stands. */
export function boxPrint(middle: Point2, [west, north, east, south]: readonly number[], turn: number): Quad {
  const [sine, cosine] = [Math.sin(turn), Math.cos(turn)];
  const corner = (x = 0, y = 0): Point2 => [middle[0] + x * cosine - y * sine, middle[1] + x * sine + y * cosine];
  return [corner(west, north), corner(east, north), corner(east, south), corner(west, south)];
}

/** Where `level` crosses the side from one corner to the next (each a point and its height), if it does. */
function crossing(
  level: number,
  [from, below]: readonly [Point2, number],
  [to, above]: readonly [Point2, number],
): Point2 | null {
  if (below >= level === above >= level) return null;
  const share = (level - below) / (above - below);
  return [from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share];
}

/** A point, or none, as a list of points. */
const wrapped = (point: Point2 | null): Point2[] => (point ? [point] : []);

/** The ground's relief read `step` metres apart over `size` from `origin`, laid out from there: ground with no height
 *  counts as sea. Each cell is walked once, for the levels between its lowest corner and its highest. */
export function relief(
  heightAt: (x: number, y: number) => number | null,
  origin: Point2,
  size: { readonly width: number; readonly height: number },
  step: number,
): Relief {
  const columns = Math.ceil(size.width / step) + 1;
  const rows = Math.ceil(size.height / step) + 1;
  const heights = new Float64Array(columns * rows);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++)
      heights[row * columns + column] = heightAt(origin[0] + column * step, origin[1] + row * step) ?? -1;
  const corner = (column: number, row: number): readonly [Point2, number] => [
    [column * step, row * step],
    heights[row * columns + column] ?? -1,
  ];
  const [sea, coast, lines, index]: [Point2[][], Segment[], Segment[], Segment[]] = [[], [], [], []];
  for (let row = 0; row + 1 < rows; row++) {
    // The sea: each row's cells wholly under it as one run, and the part under it of each cell the shore crosses.
    let run: number | null = null;
    const endRun = (column: number) => {
      if (run === null) return;
      const [west, east, north, south] = [run * step, column * step, row * step, (row + 1) * step];
      sea.push([
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ]);
      run = null;
    };
    for (let column = 0; column + 1 < columns; column++) {
      // The cell's corners in turn round it, north-west first.
      const corners = [
        corner(column, row),
        corner(column + 1, row),
        corner(column + 1, row + 1),
        corner(column, row + 1),
      ];
      const sides = corners.map((one, turn) => [one, corners[(turn + 1) % 4] ?? one] as const);
      const lowest = Math.min(...corners.map(([, height]) => height));
      const highest = Math.max(...corners.map(([, height]) => height));
      for (let level = Math.max(0, Math.ceil(lowest / RELIEF_M) * RELIEF_M); level <= highest; level += RELIEF_M) {
        const into = level === 0 ? coast : level % INDEX_M === 0 ? index : lines;
        const [first, second, third, fourth] = sides.flatMap(([one, next]) => wrapped(crossing(level, one, next)));
        if (first && second) into.push([first, second]);
        if (third && fourth) into.push([third, fourth]);
      }
      if (highest < 0) {
        run ??= column;
        continue;
      }
      endRun(column);
      if (lowest < 0)
        sea.push(sides.flatMap(([one, next]) => [...(one[1] < 0 ? [one[0]] : []), ...wrapped(crossing(0, one, next))]));
    }
    endRun(columns - 1);
  }
  return { sea, coast, relief: lines, index };
}
