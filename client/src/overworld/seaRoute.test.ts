import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HeightGrid, Point2 } from './ground.ts';
import {
  lockedOut,
  maskFromGrid,
  maskFromOutlines,
  planSeaRoute,
  SEA_CELLS,
  type SeaMask,
  type SeaRoute,
} from './seaRoute.ts';

/** A grid of one-kilometre cells drawn as rows of text: `#` land, `.` sea. */
function grid(rows: readonly string[], leftM = 0, topM = 0): HeightGrid {
  const heights = rows.flatMap((row) => [...row].map((cell) => (cell === '#' ? 50 : -20)));
  return { width: rows[0].length, height: rows.length, leftM, topM, cellM: 1_000, heights };
}
const maskOf = (rows: readonly string[]) => maskFromGrid(grid(rows), 1_000);
const cellMiddle = (column: number, row: number): Point2 => [column * 1_000 + 500, row * 1_000 + 500];

function landAt(mask: SeaMask, point: Point2): boolean {
  const column = Math.floor((point[0] - mask.leftM) / mask.cellM);
  const row = Math.floor((point[1] - mask.topM) / mask.cellM);
  return mask.land[row * mask.width + column] === 1;
}

/** The nearest the route comes to land, sampled every 50 m from its `skip`th point on. */
function nearestLand(mask: SeaMask, route: SeaRoute, skip = 0): number {
  assert.ok(route.ok);
  let nearest = Number.POSITIVE_INFINITY;
  for (let i = skip + 1; i < route.points.length; i++) {
    const [from, to] = [route.points[i - 1], route.points[i]];
    const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 50);
    for (let k = 0; k <= steps; k++) {
      const point: Point2 = [from[0] + ((to[0] - from[0]) * k) / steps, from[1] + ((to[1] - from[1]) * k) / steps];
      if (landAt(mask, point)) return 0;
      const column = Math.floor((point[0] - mask.leftM) / mask.cellM);
      const row = Math.floor((point[1] - mask.topM) / mask.cellM);
      nearest = Math.min(nearest, mask.coastM[row * mask.width + column]);
    }
  }
  return nearest;
}

const OPEN = ['..........', '..........', '..........', '..........', '..........'];
const ISLAND = [
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..........##########..........',
  '..........##########..........',
  '..........##########..........',
  '..........##########..........',
  '..........##########..........',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
  '..............................',
];

test('across open water the route is the straight line from the start to the goal', () => {
  const from: Point2 = [700, 4_300];
  const to: Point2 = [9_100, 600];
  const route = planSeaRoute(maskOf(OPEN), from, to);
  assert.deepEqual(route, { ok: true, points: [from, to], lengthM: Math.hypot(8_400, 3_700), toShore: false });
});

test('a route goes round an island without touching it, keeping its margin where there is room', () => {
  const mask = maskOf(ISLAND);
  const route = planSeaRoute(mask, cellMiddle(2, 9), cellMiddle(27, 9), { marginM: 3_000 });
  assert.ok(route.ok);
  assert.deepEqual(route.points[0], cellMiddle(2, 9));
  assert.deepEqual(route.points[route.points.length - 1], cellMiddle(27, 9));
  assert.ok(route.lengthM > 25_000, 'longer than the line through the island');
  assert.ok(nearestLand(mask, route) >= 3_000, 'three kilometres off the coast all the way');
  assert.ok(route.points.length <= 6, `pulled into a few legs: ${route.points.length} points`);
});

test('with no margin a route rounds the island close in', () => {
  const mask = maskOf(ISLAND);
  const wide = planSeaRoute(mask, cellMiddle(2, 9), cellMiddle(27, 9), { marginM: 3_000 });
  const close = planSeaRoute(mask, cellMiddle(2, 9), cellMiddle(27, 9), { marginM: 0 });
  assert.ok(close.ok && wide.ok);
  assert.ok(close.lengthM < wide.lengthM);
  assert.ok(nearestLand(mask, close) > 0, 'still never over land');
});

test('a strait narrower than the margin is sailed through when it is the only way', () => {
  const rows = Array.from({ length: 15 }, (_cell, row) =>
    row === 7 ? '....................' : '.........###........',
  );
  const mask = maskOf(rows);
  assert.equal(mask.land[7 * 20 + 10], 0, 'the one gap in the wall');
  const route = planSeaRoute(mask, cellMiddle(2, 3), cellMiddle(17, 12));
  assert.ok(route.ok);
  assert.ok(nearestLand(mask, route) > 0, 'never over land');
  assert.ok(
    route.points.some((point) => point[1] >= 7_000 && point[1] < 8_000),
    'through the gap',
  );
});

test('a goal on land near the coast ends at the water nearest it; one far inland is refused', () => {
  const rows = ['.....######', '.....######', '.....######', '.....######'];
  const mask = maskOf(rows);
  const shore = planSeaRoute(mask, cellMiddle(1, 1), [5_300, 2_200]);
  assert.ok(shore.ok && shore.toShore);
  const end = shore.points[shore.points.length - 1];
  assert.equal(landAt(mask, end), false, 'it ends on water');
  assert.ok(Math.hypot(end[0] - 5_300, end[1] - 2_200) < 400, 'beside the goal');
  assert.deepEqual(planSeaRoute(mask, cellMiddle(1, 1), cellMiddle(10, 2), { landingReachM: 3_000 }), {
    ok: false,
    reason: 'inland',
  });
});

test('a start on land by the coast sets off from the water; one far inland is aground', () => {
  const rows = ['######....', '######....', '######....'];
  const mask = maskOf(rows);
  const from: Point2 = [5_800, 1_500];
  const route = planSeaRoute(mask, from, cellMiddle(9, 1));
  assert.ok(route.ok);
  assert.deepEqual(route.points[0], from);
  assert.equal(landAt(mask, route.points[1]), false);
  assert.ok(nearestLand(mask, route, 1) > 0);
  assert.deepEqual(planSeaRoute(mask, cellMiddle(0, 1), cellMiddle(9, 1), { landingReachM: 3_000 }), {
    ok: false,
    reason: 'aground',
  });
});

test('water the start cannot reach is no way, unless the open sea lies within reach of the goal', () => {
  const rows = ['..........', '..#####...', '..#...#...', '..#...#...', '..#####...', '..........'];
  const mask = maskOf(rows);
  const lake = cellMiddle(4, 3);
  assert.deepEqual(planSeaRoute(mask, cellMiddle(9, 0), lake, { landingReachM: 1_000 }), {
    ok: false,
    reason: 'no way',
  });
  const nearby = planSeaRoute(mask, cellMiddle(9, 0), lake, { landingReachM: 3_000 });
  assert.ok(nearby.ok && nearby.toShore);
  assert.ok(nearestLand(mask, nearby) > 0, 'it stops outside the ring');
});

test('a point off the mask is refused', () => {
  const mask = maskOf(OPEN);
  assert.deepEqual(planSeaRoute(mask, [-10, 500], cellMiddle(5, 2)), { ok: false, reason: 'outside' });
  assert.deepEqual(planSeaRoute(mask, cellMiddle(5, 2), [5_000, 99_000]), { ok: false, reason: 'outside' });
});

test('a landmass grid coarsens into 2 km cells, any land in a cell making it land', () => {
  const rows = ['....', '...#', '....', '....'];
  const mask = maskFromGrid(grid(rows, 50_000, 70_000));
  assert.equal(SEA_CELLS.windowM, 2_000);
  assert.deepEqual([mask.width, mask.height, mask.leftM, mask.topM, mask.cellM], [2, 2, 50_000, 70_000, 2_000]);
  assert.deepEqual([...mask.land], [0, 1, 0, 0]);
});

test('each water cell knows its distance to the nearest land', () => {
  const mask = maskOf(['.....', '.....', '..#..', '.....', '.....']);
  const coast = (column: number, row: number) => mask.coastM[row * 5 + column];
  assert.equal(coast(2, 2), 0);
  assert.equal(coast(3, 2), 1_000);
  assert.ok(Math.abs(coast(3, 3) - 1_000 * Math.SQRT2) < 0.01);
  assert.equal(coast(4, 2), 2_000);
  const empty = maskOf(OPEN);
  assert.equal(empty.coastM[0], Number.POSITIVE_INFINITY);
});

test('outlines fill the cells inside them and every cell their coast crosses, so a small isle is still land', () => {
  const square: Point2[] = [
    [2_000, 2_000],
    [6_000, 2_000],
    [6_000, 6_000],
    [2_000, 6_000],
  ];
  const isle: Point2[] = [
    [7_400, 1_400],
    [7_600, 1_400],
    [7_500, 1_600],
  ];
  const mask = maskFromOutlines([square, isle], { leftM: 0, topM: 0, widthM: 10_000, heightM: 10_000 }, 1_000);
  const land = (column: number, row: number) => mask.land[row * mask.width + column] === 1;
  assert.ok(land(4, 4) && land(2, 2) && land(5, 5), 'inside');
  assert.ok(land(7, 1), 'the isle, smaller than a cell');
  assert.ok(!land(0, 0) && !land(8, 8) && !land(4, 8), 'the sea');
  const route = planSeaRoute(mask, [500, 4_000], [9_500, 4_000]);
  assert.ok(route.ok && nearestLand(mask, route) > 0);
  assert.equal(SEA_CELLS.frameM * 600, 4_915_200, 'the frame is 600 cells across');
});

test('a grid whose cells do not divide the mask cells marks every mask cell its land covers', () => {
  const heights = [-9, -9, -9, -9, 50, -9, -9, -9, -9];
  const mask = maskFromGrid({ width: 3, height: 3, leftM: 0, topM: 0, cellM: 4_000, heights });
  const landCells = [...mask.land].flatMap((value, index) => (value ? [index] : []));
  assert.deepEqual(landCells, [2 * 6 + 2, 2 * 6 + 3, 3 * 6 + 2, 3 * 6 + 3], 'the four 2 km cells under the 4 km one');
  const route = planSeaRoute(mask, [500, 6_000], [11_500, 6_000]);
  assert.ok(route.ok && nearestLand(mask, route) > 0, 'the route goes round the whole island');
  const odd: HeightGrid = { width: 2, height: 1, leftM: 0, topM: 0, cellM: 1_500, heights: [-9, 50] };
  assert.deepEqual([...maskFromGrid(odd).land], [1, 1], 'land from 1.5 to 3 km reaches into the first 2 km cell');
});

test('a leg never slips through a land cell corner, even where the straight line only touches it', () => {
  const mask = maskOf(['.#...', '.....', '.....']);
  const route = planSeaRoute(mask, cellMiddle(0, 0), cellMiddle(2, 2), { marginM: 0 });
  assert.ok(route.ok);
  assert.ok(route.points.length > 2, 'not the diagonal past the corner of the land at (1, 0)');
  assert.ok(nearestLand(mask, route) > 0);
});

test('an outline edge that only clips a cell corner makes that cell land', () => {
  // The edge from (0, 1900) to (1900, 0) crosses the first cell for only its last 100 m each way.
  const clipped: Point2[] = [
    [1_900, 0],
    [1_900, 1_900],
    [0, 1_900],
  ];
  const mask = maskFromOutlines([clipped], { leftM: 0, topM: 0, widthM: 4_000, heightM: 4_000 }, 1_000);
  assert.equal(mask.land[0], 1);
  const diagonal: Point2[] = [
    [1_000, 1_000],
    [3_000, 3_000],
    [1_000, 3_000],
  ];
  const corners = maskFromOutlines([diagonal], { leftM: 0, topM: 0, widthM: 4_000, heightM: 4_000 }, 1_000);
  assert.equal(corners.land[1 * 4 + 2], 1, 'the cell beside the corner the diagonal edge passes through');
});

test('a locked sea is kept out of as land, by a margin, so no route runs into it or along its edge', () => {
  // Open water 10 cells wide; the sea east of 6 km locked.
  const mask = maskOf(['..........', '..........', '..........']);
  const locked = lockedOut(mask, (x) => x >= 6_000, 1_000);
  assert.deepEqual(
    Array.from({ length: 10 }, (unused, column) => locked.land[column]),
    [0, 0, 0, 0, 0, 1, 1, 1, 1, 1],
    'its cells and those within a kilometre of them',
  );
  assert.equal(mask.land[9], 0, 'the mask itself left as it was');
  const route = planSeaRoute(locked, cellMiddle(0, 1), cellMiddle(4, 1)) as Extract<SeaRoute, { ok: true }>;
  assert.ok(route.ok && route.points.every(([x]) => x < 5_000), 'a route within the open sea keeps out');
});
