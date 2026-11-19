import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLAG_FLY_SHARE, flagFlat, flagGrid, FLAG_PICTURE_M } from './flag.ts';
import { SAIL_COLUMNS, SAIL_ROWS } from './sails.ts';

const pointAt = (grid: Float32Array, column: number, row: number) =>
  [0, 1, 2].map((axis) => grid[(row * SAIL_COLUMNS + column) * 3 + axis] ?? Number.NaN);

test('her flag hangs from her masthead and streams the way the wind blows', () => {
  const masthead = [1, 0, 20] as const;
  const toStarboard = flagGrid(masthead, 20, 90, 0);
  const [hoistX = 0, hoistY = 0, hoistZ = 0] = pointAt(toStarboard, 0, SAIL_ROWS - 1);
  assert.deepEqual([hoistX, hoistY, hoistZ], [1, 0, 20], 'its head at the masthead');
  const [, flyY = 0] = pointAt(toStarboard, SAIL_COLUMNS - 1, SAIL_ROWS - 1);
  assert.ok(flyY > 20 * FLAG_FLY_SHARE * 0.9, 'out to starboard with the wind blowing there');
  const [flyX = 0] = pointAt(flagGrid(masthead, 20, 0, 0), SAIL_COLUMNS - 1, 0);
  assert.ok(flyX > 1 + 1.8, 'toward her bow with the wind astern');
  assert.ok((pointAt(toStarboard, 0, 0)[2] ?? 0) < 20 - 1, 'its hoist down the mast');
});

test('its wave runs along it on the clock', () => {
  const [one, two] = [flagGrid([0, 0, 10], 20, 0, 0), flagGrid([0, 0, 10], 20, 0, 0.3)];
  assert.notEqual(pointAt(one, 5, 3)[1], pointAt(two, 5, 3)[1]);
});

test('laid flat, its picture spans it once, a hair inside its edges', () => {
  const flat = flagFlat();
  const [fromU = 0, , fromV = 0] = pointAt(flat, 0, 0);
  const [toU = 0, , toV = 0] = pointAt(flat, SAIL_COLUMNS - 1, SAIL_ROWS - 1);
  assert.ok(fromU > 0 && fromV > 0 && toU < FLAG_PICTURE_M && toV < FLAG_PICTURE_M);
  assert.ok(toU - fromU > FLAG_PICTURE_M * 0.98);
});
