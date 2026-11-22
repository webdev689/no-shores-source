// The wreck's ground as its fight walks it. The course the export lays has dead ends: low ledges a body can step or
// be thrown down into but never climb out of (a slot by the Sloop's side at the waterline, a ledge by the gun deck),
// where foes and crew would stand stuck in the sea. Every square from which no body can walk back to the way through is
// left out, so the rim holds bodies at its edge as it does at every other.
import type { CourseBlock } from '../../../../server/roomDoor.ts';

type Point = readonly [number, number];

/** The course's squares, metres (tools/wreck/wreck_course.py): a block covers whole squares. */
export const SQUARE_M = 0.3;
/** The rise a body steps up, metres (crates/movement's `TUNING.step`): a foe never jumps, so a ledge it cannot step
 *  out of holds it. */
const STEP_M = 0.5;
/** A dead end larger than this many squares is no slip of the ground: it is left as it is. */
const POCKET_MOST = 60;
/** The way through is felt this often along it, metres: under half a square. */
const FELT_M = 0.1;

/** The course's squares: where they begin (west, north), how many across and down, and the block over each by its
 *  place in the course (-1 for none). */
export interface Squares {
  readonly west: number;
  readonly north: number;
  readonly columns: number;
  readonly rows: number;
  readonly owner: Int32Array;
}

const squareOf = (value: number, from: number) => Math.floor((value - from) / SQUARE_M + 1e-6);

/** Lays the course's blocks on its squares. */
export function squaresOf(course: readonly CourseBlock[]): Squares {
  const west = Math.min(...course.map((block) => block.minX));
  const north = Math.min(...course.map((block) => block.minY));
  const columns = Math.ceil((Math.max(...course.map((block) => block.maxX)) - west) / SQUARE_M) + 1;
  const rows = Math.ceil((Math.max(...course.map((block) => block.maxY)) - north) / SQUARE_M) + 1;
  const owner = new Int32Array(columns * rows).fill(-1);
  course.forEach((block, index) => {
    for (let row = squareOf(block.minY, north); row < squareOf(block.maxY, north); row++)
      for (let column = squareOf(block.minX, west); column < squareOf(block.maxX, west); column++)
        owner[row * columns + column] = index;
  });
  return { west, north, columns, rows, owner };
}

/** The squares beside one, those over ground: north, south, west and east. */
function besideOf(squares: Squares, square: number): number[] {
  const [row, column] = [Math.floor(square / squares.columns), square % squares.columns];
  const beside = [
    row > 0 ? square - squares.columns : -1,
    row < squares.rows - 1 ? square + squares.columns : -1,
    column > 0 ? square - 1 : -1,
    column < squares.columns - 1 ? square + 1 : -1,
  ];
  return beside.filter((near) => near >= 0 && (squares.owner[near] ?? -1) >= 0);
}

/** The course without its dead ends: every block whose squares no body can walk back from to `way` (the way through,
 *  every point a body is meant to reach on it), up no more than a step from one square to the next and down any drop,
 *  and that a body can step or drop into. A dead end of more squares than a slip of the ground is kept. */
export function withoutDeadEnds(course: readonly CourseBlock[], way: readonly Point[]): CourseBlock[] {
  if (!course.length) return [];
  const squares = squaresOf(course);
  const topOf = (square: number) => course[squares.owner[square] ?? -1]?.top ?? 0;
  const back = new Uint8Array(squares.owner.length);
  const queue: number[] = [];
  for (let index = 1; index < way.length; index++) {
    const [from, to] = [way[index - 1] ?? [0, 0], way[index] ?? [0, 0]];
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / FELT_M);
    for (let step = 0; step <= steps; step++) {
      const share = step / Math.max(1, steps);
      const column = squareOf(from[0] + (to[0] - from[0]) * share, squares.west);
      const row = squareOf(from[1] + (to[1] - from[1]) * share, squares.north);
      const square = row * squares.columns + column;
      if (row < 0 || column < 0 || row >= squares.rows || column >= squares.columns) continue;
      if ((squares.owner[square] ?? -1) < 0 || back[square]) continue;
      back[square] = 1;
      queue.push(square);
    }
  }
  // Walked backward from the way: a square steps onto one it reaches if that is no more than a step higher.
  for (let next = queue.pop(); next !== undefined; next = queue.pop())
    for (const near of besideOf(squares, next))
      if (!back[near] && topOf(next) - topOf(near) <= STEP_M + 1e-6) {
        back[near] = 1;
        queue.push(near);
      }
  const deadEnds = new Set<number>();
  const seen = new Uint8Array(squares.owner.length);
  for (let start = 0; start < squares.owner.length; start++) {
    if ((squares.owner[start] ?? -1) < 0 || back[start] || seen[start]) continue;
    const pocket = [start];
    seen[start] = 1;
    for (let index = 0; index < pocket.length; index++)
      for (const near of besideOf(squares, pocket[index] ?? 0))
        if (!back[near] && !seen[near]) {
          seen[near] = 1;
          pocket.push(near);
        }
    // One no body can step or drop into from the ground it walks is no trap: it still stands in the way of shots.
    const entered = pocket.some((square) =>
      besideOf(squares, square).some((near) => back[near] && topOf(square) - topOf(near) <= STEP_M + 1e-6),
    );
    if (entered && pocket.length <= POCKET_MOST) for (const square of pocket) deadEnds.add(squares.owner[square] ?? -1);
  }
  return course.filter((_block, index) => !deadEnds.has(index));
}
