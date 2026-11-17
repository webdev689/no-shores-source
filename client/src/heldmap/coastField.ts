// The world's coasts as the held map inks them: on a grid over the frame, how far each cell's middle lies from the
// nearest coast (negative on land), exactly within a band of the coast and held at the band past it, and whose coast
// that is. Built once from the continents' outlines.
import type { Point2 } from '../overworld/ground.ts';

/** How far from a coast its distance is measured exactly, metres; past this the distance is held at it. */
export const COAST_BAND_M = 60_000;
/** The index of no island, past every coast's band. */
export const NO_ISLAND = 255;

export interface CoastField {
  readonly columns: number;
  readonly rows: number;
  readonly cellM: number;
  /** Metres from the nearest coast, negative on land, held within the band; a cell a float, row by row. */
  readonly distance: Float32Array;
  /** The island whose coast is nearest each cell, by its place among the outlines; `NO_ISLAND` past every band. */
  readonly island: Uint8Array;
}

type Edge = { readonly a: Point2; readonly b: Point2; readonly island: number };

/** The coast field of some outlines over a grid of `columns` by `rows` cells `cellM` metres a side, from 0, 0. */
export function coastField(
  outlines: readonly (readonly Point2[])[],
  columns: number,
  rows: number,
  cellM: number,
): CoastField {
  const edges: Edge[] = [];
  outlines.forEach((ring, island) =>
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length];
      if (b) edges.push({ a, b, island });
    }),
  );
  const land = landOf(edges, columns, rows, cellM);
  // Each edge filed in every bucket within a band of it, so a cell asks only its own bucket.
  const bucketM = COAST_BAND_M;
  const [bucketColumns, bucketRows] = [Math.ceil((columns * cellM) / bucketM), Math.ceil((rows * cellM) / bucketM)];
  const buckets: Edge[][] = Array.from({ length: bucketColumns * bucketRows }, () => []);
  for (const edge of edges) {
    const bucketOf = (value: number, most: number) => Math.min(most - 1, Math.max(0, Math.floor(value / bucketM)));
    const [west, east] = [Math.min(edge.a[0], edge.b[0]) - bucketM, Math.max(edge.a[0], edge.b[0]) + bucketM];
    const [north, south] = [Math.min(edge.a[1], edge.b[1]) - bucketM, Math.max(edge.a[1], edge.b[1]) + bucketM];
    for (let row = bucketOf(north, bucketRows); row <= bucketOf(south, bucketRows); row++)
      for (let column = bucketOf(west, bucketColumns); column <= bucketOf(east, bucketColumns); column++)
        buckets[row * bucketColumns + column]?.push(edge);
  }
  const distance = new Float32Array(columns * rows);
  const island = new Uint8Array(columns * rows).fill(NO_ISLAND);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const [x, y] = [(column + 0.5) * cellM, (row + 0.5) * cellM];
      const bucket = buckets[Math.floor(y / bucketM) * bucketColumns + Math.floor(x / bucketM)] ?? [];
      let [nearest, whose] = [COAST_BAND_M, NO_ISLAND];
      for (const edge of bucket) {
        const away = toSegment(x, y, edge.a, edge.b);
        if (away < nearest) [nearest, whose] = [away, edge.island];
      }
      const index = row * columns + column;
      distance[index] = land[index] ? -nearest : nearest;
      island[index] = whose;
    }
  return { columns, rows, cellM, distance, island };
}

/** Which cells' middles lie inside an outline: each row's crossings of the edges, filled between in pairs. */
function landOf(edges: readonly Edge[], columns: number, rows: number, cellM: number): Uint8Array {
  const land = new Uint8Array(columns * rows);
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * cellM;
    const crossings: number[] = [];
    for (const { a, b } of edges)
      if (a[1] <= y !== b[1] <= y) crossings.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    crossings.sort((first, second) => first - second);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      const from = Math.max(0, Math.ceil((crossings[pair] ?? 0) / cellM - 0.5));
      const to = Math.min(columns - 1, Math.floor((crossings[pair + 1] ?? 0) / cellM - 0.5));
      for (let column = from; column <= to; column++) land[row * columns + column] = 1;
    }
  }
  return land;
}

/** How far a point lies from a segment. */
function toSegment(x: number, y: number, a: Point2, b: Point2): number {
  const [run, rise] = [b[0] - a[0], b[1] - a[1]];
  const length = run * run + rise * rise;
  const t = length > 0 ? Math.min(1, Math.max(0, ((x - a[0]) * run + (y - a[1]) * rise) / length)) : 0;
  return Math.hypot(x - a[0] - t * run, y - a[1] - t * rise);
}
