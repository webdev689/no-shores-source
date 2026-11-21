// The held map on land: what it shows of the ground the player stands on, laid out in the sheet's own metres. The game
// gathers it from the node (game/landMap.ts); landLetters.ts paints it on the parchment.
import type { Point2 } from '../overworld/ground.ts';

/** A rectangle on the ground, its four corners in turn. */
export type Quad = readonly [Point2, Point2, Point2, Point2];
/** A short straight line, from one end to the other. */
export type Segment = readonly [Point2, Point2];

/** What a mark on the land shows: a keeper's stall, where players land, and a layout's sites (the layout crate's
 *  `SiteKind`). */
export type LandMarkKind =
  'vendor' | 'landing' | 'gate' | 'event' | 'beacon' | 'resource' | 'foes' | 'objective' | 'door';

export interface LandMark {
  readonly kind: LandMarkKind;
  readonly at: Point2;
  /** A keeper's title beside a stall's mark; no other mark is named. */
  readonly name?: string;
}

/** The land as the map shows it: its name; its north-west corner in the world and its size, metres, from which
 *  everything else is measured, east and south; the shore and the ground's relief; the plan's floors, walks, paths and
 *  what stands on them; the edge of the ground a body walks; its places by name; and its marks. */
export interface LandSheet {
  readonly name: string;
  readonly origin: Point2;
  readonly width: number;
  readonly height: number;
  readonly coast: readonly Segment[];
  readonly relief: readonly Segment[];
  readonly floors: readonly Quad[];
  readonly walks: readonly Quad[];
  readonly paths: readonly { readonly track: boolean; readonly points: readonly Point2[] }[];
  readonly standing: readonly Quad[];
  readonly ring: readonly Point2[];
  readonly places: readonly { readonly name: string; readonly at: Point2 }[];
  readonly marks: readonly LandMark[];
}

/** The rise between two lines of the ground's relief, metres. */
export const RELIEF_M = 10;

/** The ground a `width` by `depth` rectangle covers, its middle at `at`, turned `turn` radians clockwise from north
 *  (its own x east and y south at 0), as the city stands its solids. */
export function footprint(middle: Point2, width: number, depth: number, turn: number): Quad {
  const [sine, cosine] = [Math.sin(turn), Math.cos(turn)];
  const corner = (x: number, y: number): Point2 => [
    middle[0] + x * cosine - y * sine,
    middle[1] + x * sine + y * cosine,
  ];
  const [across, deep] = [width / 2, depth / 2];
  return [corner(-across, -deep), corner(across, -deep), corner(across, deep), corner(-across, deep)];
}

/** Where the ground crosses the sea's level (the shore) and each `RELIEF_M` above it, read `step` metres apart over
 *  `width` by `height` from `origin` and laid out from there; ground with no height counts as sea. */
export function contours(
  heightAt: (x: number, y: number) => number | null,
  origin: Point2,
  size: { readonly width: number; readonly height: number },
  step: number,
): { coast: Segment[]; relief: Segment[] } {
  const columns = Math.ceil(size.width / step) + 1;
  const rows = Math.ceil(size.height / step) + 1;
  const heights = new Float64Array(columns * rows);
  let highest = -Infinity;
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const height = heightAt(origin[0] + column * step, origin[1] + row * step) ?? -1;
      heights[row * columns + column] = height;
      highest = Math.max(highest, height);
    }
  const sample = (column: number, row: number): readonly [Point2, number] => [
    [column * step, row * step],
    heights[row * columns + column] ?? -1,
  ];
  const [coast, relief]: [Segment[], Segment[]] = [[], []];
  for (let level = 0; level <= highest; level += RELIEF_M) {
    const into = level === 0 ? coast : relief;
    for (let row = 0; row + 1 < rows; row++)
      for (let column = 0; column + 1 < columns; column++) {
        // The cell's corners in turn round it, and where the level crosses each side.
        const [northWest, northEast, southEast, southWest] = [
          sample(column, row),
          sample(column + 1, row),
          sample(column + 1, row + 1),
          sample(column, row + 1),
        ];
        const crossings: Point2[] = [];
        for (const [[from, below], [to, above]] of [
          [northWest, northEast],
          [northEast, southEast],
          [southEast, southWest],
          [southWest, northWest],
        ] as const) {
          if (below >= level === above >= level) continue;
          const share = (level - below) / (above - below);
          crossings.push([from[0] + (to[0] - from[0]) * share, from[1] + (to[1] - from[1]) * share]);
        }
        const [first, second, third, fourth] = crossings;
        if (first && second) into.push([first, second]);
        if (third && fourth) into.push([third, fourth]);
      }
  }
  return { coast, relief };
}
