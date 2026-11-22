// Where the sea is not drawn over the wreck. The export lays one footprint for each ship and raft, a hull's shape
// pointed at its bow; the decks and rafts as they fell are not that shape, so a twelfth of the ground lies outside
// every footprint, where the storm's swell would be drawn over figures standing there waist-deep. Each footprint is
// fitted to the ground nearest it: its middle and length to the ground's, its outline station by station.
import type { CourseBlock } from '../../../../server/roomDoor.ts';
import { headingFrame } from '../../rules/landRules.ts';
import { HULL_FIT, type HullMask, hullEdge, STATIONS } from '../../water/hullMask.ts';
import { SQUARE_M } from './wreckGround.ts';

/** How far past a square's middle its corners stand, and a hair more, metres: the footprint covers the whole square. */
const SQUARE_REACH_M = SQUARE_M * Math.SQRT1_2 + 0.05;

type Point = readonly [number, number];

/** Every square of ground's middle. */
function middlesOf(course: readonly CourseBlock[]): Point[] {
  const middles: Point[] = [];
  for (const block of course)
    for (let x = block.minX + SQUARE_M / 2; x < block.maxX; x += SQUARE_M)
      for (let y = block.minY + SQUARE_M / 2; y < block.maxY; y += SQUARE_M) middles.push([x, y]);
  return middles;
}

/** A footprint fitted to `middles` (the squares nearest it), keeping its heading. */
function fitted(mask: HullMask, middles: readonly Point[]): HullMask {
  if (!middles.length) return mask;
  const { forward, starboard } = headingFrame(mask.heading);
  const frame = middles.map(([x, y]) => {
    const [east, south] = [x - mask.x, y - mask.y];
    return [east * forward[0] + south * forward[1], east * starboard[0] + south * starboard[1]] as const;
  });
  const [alongs, acrosses] = [frame.map(([along]) => along), frame.map(([, across]) => across)];
  const [midAlong, midAcross] = [
    (Math.min(...alongs) + Math.max(...alongs)) / 2,
    (Math.min(...acrosses) + Math.max(...acrosses)) / 2,
  ];
  const length = (Math.max(...alongs) - Math.min(...alongs)) / 2 + SQUARE_REACH_M;
  const beam = Math.max(...acrosses.map((across) => Math.abs(across - midAcross))) + SQUARE_REACH_M;
  const line = new Float32Array(STATIONS);
  for (const [along, across] of frame) {
    const need = (Math.abs(across - midAcross) + SQUARE_REACH_M) / beam;
    // Every station the square spans, and the one past each end of it: the outline is straight between stations.
    const stationOf = (offset: number) => ((Math.min(1, Math.max(-1, offset / length)) + 1) / 2) * (STATIONS - 1);
    const [first, last] = [stationOf(along - midAlong - SQUARE_REACH_M), stationOf(along - midAlong + SQUARE_REACH_M)];
    for (let index = Math.floor(first); index <= Math.ceil(last); index++)
      line[index] = Math.max(line[index] ?? 0, need);
  }
  return {
    ...mask,
    x: mask.x + forward[0] * midAlong + starboard[0] * midAcross,
    y: mask.y + forward[1] * midAlong + starboard[1] * midAcross,
    halfLength: length / HULL_FIT,
    halfBeam: beam / HULL_FIT,
    line,
  };
}

/** A footprint's squares in pieces along its length, each no longer than `PIECE_M`, so each piece's middle follows
 *  the ground as it bends: a footprint of its own each. */
const PIECE_M = 6;

function piecesOf(mask: HullMask, middles: readonly Point[]): Point[][] {
  const { forward } = headingFrame(mask.heading);
  const along = (point: Point) => (point[0] - mask.x) * forward[0] + (point[1] - mask.y) * forward[1];
  const alongs = middles.map(along);
  const [least, most] = [Math.min(...alongs), Math.max(...alongs)];
  const count = Math.max(1, Math.ceil((most - least) / PIECE_M));
  const pieces = Array.from({ length: count }, (): Point[] => []);
  middles.forEach((middle, index) =>
    pieces[Math.min(count - 1, Math.floor((((alongs[index] ?? 0) - least) / (most - least || 1)) * count))]?.push(
      middle,
    ),
  );
  return pieces.filter((piece) => piece.length > 0);
}

/** The wreck's footprints (`dry`, one a ship or raft) fitted to its ground (`course`): each square of ground goes to
 *  the footprint it lies nearest inside, or least outside, and each footprint is laid again in pieces along its
 *  length, each covering every square it is given and little more. */
export function dryFitted(dry: readonly HullMask[], course: readonly CourseBlock[]): HullMask[] {
  const given = dry.map((): Point[] => []);
  for (const middle of middlesOf(course)) {
    let [best, least] = [-1, Infinity];
    dry.forEach((mask, index) => {
      const outside = hullEdge(mask, middle).outside;
      if (outside < least) [best, least] = [index, outside];
    });
    given[best]?.push(middle);
  }
  return dry.flatMap((mask, index) => {
    const middles = given[index] ?? [];
    return middles.length ? piecesOf(mask, middles).map((piece) => fitted(mask, piece)) : [mask];
  });
}
