// The way across a social space's plaza by the townsfolk's lanes (`townsfolk.ts`): along its rows, metres toward the
// sea, from the first column to the last; along the line where customers stand before each arcade's counters, from the
// arcade's start to its last column; along its columns, metres across it, from the landward lane (the outer ones from
// the counters) out to where lookers stand at the parapet; and along that line, from the first column to the last.
// The courtyard leaves every lane clear of its solids. From off the lanes a walker goes straight to the nearest point
// of them, and off them straight to where it is going.
import { ACROSS, AT_COUNTER, AT_PARAPET, type PlazaFrame, TOWARD, inPlaza, plazaPoint } from '../townsfolk.ts';

type Point = readonly [number, number];
/** A point in the plaza's own frame: metres toward the sea from its middle, and across it. */
interface Place {
  readonly toward: number;
  readonly across: number;
}
/** A lane: the line it keeps (a row's toward, or a column's across) and how far along the other way it runs. */
interface Lane {
  readonly line: number;
  readonly from: number;
  readonly to: number;
}

const NEAR = 1e-6;
/** Where an arcade starts across the plaza from its middle, either side of the portico, metres. */
const ARCADE_START_M = 32;
const FIRST_ROW = Math.min(...TOWARD);
const [FIRST_COLUMN, LAST_COLUMN] = [Math.min(...ACROSS), Math.max(...ACROSS)];
const ROWS: readonly Lane[] = [
  ...TOWARD.map((line) => ({ line, from: FIRST_COLUMN, to: LAST_COLUMN })),
  { line: AT_COUNTER, from: FIRST_COLUMN, to: -ARCADE_START_M },
  { line: AT_COUNTER, from: ARCADE_START_M, to: LAST_COLUMN },
  // Where lookers stand at the parapet, seaward of the benches.
  { line: AT_PARAPET, from: FIRST_COLUMN, to: LAST_COLUMN },
];
/** The columns before an arcade reach down to its counters; the two before the portico stop at the landward lane. */
const COLUMNS: readonly Lane[] = ACROSS.map((line) => ({
  line,
  from: Math.abs(line) > ARCADE_START_M ? AT_COUNTER : FIRST_ROW,
  to: AT_PARAPET,
}));

const clamp = (value: number, lane: Lane) => Math.min(lane.to, Math.max(lane.from, value));
const apart = (one: Place, two: Place) => Math.hypot(one.toward - two.toward, one.across - two.across);
const keeps = (lane: Lane, along: number) => Math.abs(lane.line - along) < NEAR;

/** The point of the lanes nearest `place`. */
export function onLanes(place: Place): Place {
  const points = [
    ...ROWS.map((row) => ({ toward: row.line, across: clamp(place.across, row) })),
    ...COLUMNS.map((column) => ({ toward: clamp(place.toward, column), across: column.line })),
  ];
  return points.reduce((best, each) => (apart(each, place) < apart(best, place) ? each : best));
}

/** The points of the lanes to walk from `start` to `end`, both on them, the shortest way: the crossings between, and
 *  `end`. Every crossing of a row and a column is a point of the lanes, as is each column's end; the two given are
 *  laid among them, and each lane joins the points on it in turn. */
function alongLanes(start: Place, end: Place): Place[] {
  const points: Place[] = [start, end];
  for (const column of COLUMNS) {
    for (const row of ROWS)
      if (clamp(column.line, row) === column.line && clamp(row.line, column) === row.line)
        points.push({ toward: row.line, across: column.line });
    points.push({ toward: column.to, across: column.line });
  }
  const place = (index: number) => points[index] as Place;
  const indices = points.map((unused, index) => index);
  const joined = points.map(() => [] as number[]);
  const join = (lane: number[], measure: (each: Place) => number) => {
    lane.sort((one, two) => measure(place(one)) - measure(place(two)));
    for (let step = 1; step < lane.length; step++) {
      const [one, two] = [lane[step - 1] ?? 0, lane[step] ?? 0];
      joined[one]?.push(two);
      joined[two]?.push(one);
    }
  };
  for (const row of ROWS) {
    const lying = (index: number) =>
      keeps(row, place(index).toward) && clamp(place(index).across, row) === place(index).across;
    join(indices.filter(lying), (each) => each.across);
  }
  for (const column of COLUMNS)
    join(
      indices.filter((index) => keeps(column, place(index).across)),
      (each) => each.toward,
    );
  // The shortest way, point by point: few enough points that each is looked over in turn.
  const cost = points.map((unused, index) => (index === 0 ? 0 : Infinity));
  const from = points.map(() => -1);
  const done = new Set<number>();
  for (let next = 0; next >= 0 && next !== 1;) {
    done.add(next);
    for (const other of joined[next] ?? []) {
      const through = (cost[next] ?? 0) + apart(place(next), place(other));
      if (through < (cost[other] ?? Infinity)) [cost[other], from[other]] = [through, next];
    }
    next = indices
      .filter((index) => !done.has(index) && (cost[index] ?? Infinity) < Infinity)
      .reduce((best, index) => (best < 0 || (cost[index] ?? 0) < (cost[best] ?? 0) ? index : best), -1);
  }
  const way: Place[] = [];
  for (let back = 1; back > 0; back = from[back] ?? -1) way.unshift(place(back));
  return way;
}

/** The point of the lanes nearest `point`, in the world. */
export function laneNearest(frame: PlazaFrame, point: Point): Point {
  const { toward, across } = onLanes(inPlaza(frame, point));
  return plazaPoint(frame, toward, across);
}

/** The way from `from` to `to` in the world, by the lanes: the points to walk to in turn, `to` the last. */
export function laneWay(frame: PlazaFrame, from: Point, to: Point): Point[] {
  const [start, end] = [inPlaza(frame, from), inPlaza(frame, to)];
  const [first, last] = [onLanes(start), onLanes(end)];
  const way: Point[] = [];
  let behind = start;
  for (const place of [first, ...alongLanes(first, last), end]) {
    if (apart(place, behind) < NEAR) continue;
    way.push(plazaPoint(frame, place.toward, place.across));
    behind = place;
  }
  return way;
}
