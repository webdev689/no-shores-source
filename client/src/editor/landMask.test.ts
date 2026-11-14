import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LandMask } from './landMask.ts';

test('the mask covers the frame in whole square kilometres', () => {
  const mask = new LandMask(4_915_200, 3_072_000);
  assert.equal(mask.width, 4915);
  assert.equal(mask.height, 3072);
});

test('a brush paints the cells whose centres it covers', () => {
  const mask = new LandMask(100_000, 100_000);
  const dirty = mask.paintDisc(50_000, 50_000, 10_000, 1);
  assert.deepEqual(dirty, { left: 40, top: 40, right: 60, bottom: 60 });
  const painted = mask.counts()[1] ?? 0;
  assert.ok(painted > 300 && painted < 330, `about pi * 10^2 cells, got ${painted}`);
  assert.equal(mask.labelAt(50, 50), 1);
  assert.equal(mask.labelAt(30, 50), 0);
});

test('painting never covers another continent, but erasing clears anything', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(40_000, 50_000, 10_000, 1);
  mask.paintDisc(55_000, 50_000, 10_000, 2);
  assert.equal(mask.labelAt(45, 50), 1, 'continent 1 keeps its overlap');
  mask.paintDisc(45_000, 50_000, 3_000, 0);
  assert.equal(mask.labelAt(45, 50), 0);
});

test('a brush off the edge of the frame paints nothing', () => {
  const mask = new LandMask(100_000, 100_000);
  assert.equal(mask.paintDisc(-50_000, 50_000, 10_000, 1), null);
});

test('an outline fills back into the cells it encloses', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.fillOutline(
    [
      [10_000, 20_000],
      [60_000, 20_000],
      [60_000, 50_000],
      [10_000, 50_000],
    ],
    3,
  );
  assert.equal(mask.counts()[3], 50 * 30);
  assert.equal(mask.labelAt(10, 20), 3);
  assert.equal(mask.labelAt(59, 49), 3);
  assert.equal(mask.labelAt(60, 49), 0);
});

test('land in two places is two pieces; joined by a side it is one', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(20_000, 50_000, 5_000, 1);
  mask.paintDisc(80_000, 50_000, 5_000, 1);
  const two = mask.pieces();
  assert.deepEqual(
    two.map((piece) => piece.label),
    [1, 1],
  );
  for (const piece of two) assert.equal(mask.labelAt(Math.floor(piece.x / 1_000), Math.floor(piece.y / 1_000)), 1);
  mask.paintDisc(50_000, 50_000, 31_000, 1);
  const one = mask.pieces();
  assert.equal(one.length, 1, 'the sea is never walked');
  assert.equal(one[0]?.cells, mask.counts()[1]);
});

test('runs carry the cells exactly, and runs that do not fit change nothing', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(20_000, 50_000, 5_000, 1);
  mask.paintDisc(80_000, 50_000, 9_000, 7);
  const runs = mask.toRuns();
  assert.ok(runs.length < 200, 'a painted map is a few runs');
  const copy = new LandMask(100_000, 100_000);
  assert.equal(copy.fromRuns(runs), true);
  assert.deepEqual(copy.cells, mask.cells);
  const before = copy.cells.slice();
  assert.equal(copy.fromRuns([0, 5]), false);
  assert.equal(copy.fromRuns([12, copy.cells.length]), false);
  assert.equal(copy.fromRuns(['1', copy.cells.length]), false);
  assert.deepEqual(copy.cells, before);
});

test('the continents painted or erased since a copy of the cells are the ones changed', () => {
  const mask = new LandMask(100_000, 100_000);
  mask.paintDisc(20_000, 20_000, 5_000, 1);
  mask.paintDisc(70_000, 70_000, 5_000, 2);
  const before = mask.cells.slice();
  assert.deepEqual(mask.changedLabels(before), new Set());
  mask.paintDisc(75_000, 70_000, 5_000, 2);
  assert.deepEqual(mask.changedLabels(before), new Set([2]));
  mask.paintDisc(20_000, 20_000, 2_000, 0);
  assert.deepEqual(mask.changedLabels(before), new Set([1, 2]));
});
