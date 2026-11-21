import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampView } from './heldMapLaw.ts';
import { contours, footprint, RELIEF_M } from './landSheet.ts';

const near = (actual: readonly number[], expected: readonly number[]) =>
  actual.forEach((value, index) => assert.ok(Math.abs(value - (expected[index] ?? NaN)) < 1e-9, `${actual}`));

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

test('the shore is drawn where the ground meets the sea, and the relief every ten metres above it', () => {
  // Ground rising eastward a metre a metre from the sea at x 25: the shore is a line down x 25, and the relief lines
  // stand every ten metres east of it.
  const { coast, relief } = contours((x) => x - 25, [0, 0], { width: 100, height: 40 }, 5);
  assert.ok(coast.length > 0);
  for (const segment of coast) for (const [x] of segment) near([x], [25]);
  const eastings = new Set(relief.flatMap((segment) => segment.map(([x]) => Math.round(x))));
  assert.deepEqual(
    [...eastings].sort((one, two) => one - two),
    [1, 2, 3, 4, 5, 6, 7].map((rise) => 25 + rise * RELIEF_M),
  );
});

test('ground with no height is sea, so an island drawn alone is ringed by its shore', () => {
  const island = (x: number, y: number) => (Math.hypot(x - 50, y - 50) < 20 ? 5 : null);
  const { coast, relief } = contours(island, [0, 0], { width: 100, height: 100 }, 4);
  assert.ok(coast.length > 8, 'the shore rings it');
  assert.equal(relief.length, 0, 'nothing rises ten metres');
  for (const segment of coast)
    for (const [x, y] of segment) assert.ok(Math.abs(Math.hypot(x - 50, y - 50) - 20) < 6, `${x}, ${y}`);
});

test('on land the map is held to the sheet, and zooms in no further than the land allows', () => {
  const ink = { width: 800, height: 500 };
  const land = { width: 400, height: 250, most: 8 };
  assert.equal(clampView({ left: 0, top: 0, scale: 0 }, ink, land).scale, 2, 'it opens on the whole sheet');
  assert.equal(clampView({ left: 0, top: 0, scale: 50 }, ink, land).scale, 8);
});
