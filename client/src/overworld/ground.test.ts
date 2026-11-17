import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landHeightAt, surfaceAt, type HeightGrid } from './ground.ts';

/** Two by two kilometre cells at (10 km, 20 km): heights 0, 100 on the top row, 200, 300 below. */
const grid: HeightGrid = {
  width: 2,
  height: 2,
  leftM: 10_000,
  topM: 20_000,
  cellM: 1_000,
  heights: [0, 100, 200, 300],
};

test('the ground is read at cell centres and blended between them', () => {
  const heightAt = landHeightAt([grid]);
  assert.equal(heightAt(10_500, 20_500), 0);
  assert.equal(heightAt(11_500, 21_500), 300);
  assert.equal(heightAt(11_000, 20_500), 50, 'halfway between the top two centres');
  assert.equal(heightAt(11_000, 21_000), 150, 'the middle of all four');
  assert.equal(heightAt(10_100, 20_100), 0, 'outside the centres, held to the nearest');
});

test('off every grid the ground is unknown, and the first grid that holds a point answers for it', () => {
  const other: HeightGrid = { ...grid, heights: [9, 9, 9, 9] };
  assert.ok(Number.isNaN(landHeightAt([grid])(9_999, 20_500)));
  assert.ok(Number.isNaN(landHeightAt([])(0, 0)));
  assert.equal(landHeightAt([grid, other])(10_500, 20_500), 0);
  assert.equal(landHeightAt([other, grid])(10_500, 20_500), 9);
});

test('the surface is the ground on land and the sea at 0 over the seabed and unknown ground', () => {
  assert.equal(
    surfaceAt(() => 120, 0, 0),
    120,
  );
  assert.equal(
    surfaceAt(() => -40, 0, 0),
    0,
  );
  assert.equal(
    surfaceAt(() => Number.NaN, 0, 0),
    0,
  );
  assert.equal(
    surfaceAt(() => Number.NEGATIVE_INFINITY, 0, 0),
    0,
  );
});
