import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampView, viewOn } from './heldMapLaw.ts';
import { footprint, INDEX_M, RELIEF_M, relief } from './landSheet.ts';
import type { Point2 } from '../overworld/ground.ts';

const near = (actual: readonly number[], expected: readonly number[]) =>
  actual.forEach((value, index) => assert.ok(Math.abs(value - (expected[index] ?? NaN)) < 1e-9, `${actual}`));

/** A polygon's area by its shoelace. */
const area = (points: readonly Point2[]) =>
  Math.abs(
    points.reduce((sum, [x, y], index) => {
      const [nextX, nextY] = points[(index + 1) % points.length] ?? [x, y];
      return sum + x * nextY - nextX * y;
    }, 0),
  ) / 2;

test('a footprint turns about its middle clockwise from north, as the city stands its solids', () => {
  const [northWest, northEast, southEast, southWest] = footprint([10, 20], 4, 2, 0);
  near(northWest, [8, 19]);
  near(northEast, [12, 19]);
  near(southEast, [12, 21]);
  near(southWest, [8, 21]);
  // A quarter turn clockwise: its own east (its width) runs south.
  const [turned] = footprint([0, 0], 4, 2, Math.PI / 2);
  near(turned, [1, -2]);
});

test('the shore is drawn where the ground meets the sea, the relief every ten metres and an index line every fifty', () => {
  // Ground rising eastward a metre a metre from the sea at x 25.
  const ground = relief((x) => x - 25, [0, 0], { width: 100, height: 40 }, 5);
  assert.ok(ground.coast.length > 0);
  for (const segment of ground.coast) for (const [x] of segment) near([x], [25]);
  const eastings = (segments: typeof ground.relief) =>
    [...new Set(segments.flatMap((segment) => segment.map(([x]) => Math.round(x))))].sort((one, two) => one - two);
  assert.deepEqual(
    eastings(ground.relief),
    [1, 2, 3, 4, 6, 7].map((rise) => 25 + rise * RELIEF_M),
  );
  assert.deepEqual(eastings(ground.index), [25 + INDEX_M]);
});

test('the sea is washed over the cells under it and the parts of the cells the shore crosses', () => {
  // The sea west of x 23, read every 5 m over 100 by 40: 23 m by 40 of it.
  const ground = relief((x) => x - 23, [0, 0], { width: 100, height: 40 }, 5);
  const washed = ground.sea.reduce((sum, polygon) => sum + area(polygon), 0);
  near([washed], [23 * 40]);
  // Each row's whole cells under it are one run: one square and one sliver a row.
  assert.equal(ground.sea.length, 2 * 8);
});

test('ground with no height is sea, so an island drawn alone is ringed by its shore', () => {
  const island = (x: number, y: number) => (Math.hypot(x - 50, y - 50) < 20 ? 5 : null);
  const ground = relief(island, [0, 0], { width: 100, height: 100 }, 4);
  assert.ok(ground.coast.length > 8, 'the shore rings it');
  assert.equal(ground.relief.length + ground.index.length, 0, 'nothing rises ten metres');
  for (const segment of ground.coast)
    for (const [x, y] of segment) assert.ok(Math.abs(Math.hypot(x - 50, y - 50) - 20) < 6, `${x}, ${y}`);
});

test('on land the map is held to the sheet, opens on the player, and zooms in no further than the land allows', () => {
  const ink = { width: 800, height: 500 };
  const land = { width: 1200, height: 900, most: 8 };
  assert.equal(clampView({ left: 0, top: 0, scale: 50 }, ink, land).scale, 8);
  const opened = viewOn([600, 450], ink, land, 400);
  assert.equal(opened.scale, 2, '400 m across');
  near([opened.left + 200, opened.top + 125], [600, 450]);
  // By the sheet's edge it is held to the sheet rather than centred off it.
  const edge = viewOn([10, 10], ink, land, 400);
  near([edge.left, edge.top], [0, 0]);
});
