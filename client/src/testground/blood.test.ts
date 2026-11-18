import assert from 'node:assert/strict';
import { test } from 'node:test';
import { surfacesOf } from './blood.ts';

const CRATE = { minX: 2, minY: -1, maxX: 3, maxY: 1, top: 1, bottom: 0 };
const surfaces = surfacesOf([CRATE]);

test('blood falling on open ground meets it at height zero', () => {
  assert.deepEqual(surfaces([0, 0, 1.125], [0, 0, -1], 3), { distance: 1.125, normal: [0, 0, 1] });
});

test("blood falling over a block meets the block's top", () => {
  assert.deepEqual(surfaces([2.5, 0, 1.5], [0, 0, -1], 3), { distance: 0.5, normal: [0, 0, 1] });
});

test('blood thrown at a block meets its side, facing back at it', () => {
  assert.deepEqual(surfaces([0, 0, 0.5], [1, 0, 0], 3), { distance: 2, normal: [-1, 0, 0] });
});

test('blood thrown short of a block, or upward under the open sky, meets nothing', () => {
  assert.equal(surfaces([0, 0, 0.5], [1, 0, 0], 1.5), null);
  assert.equal(surfaces([0, 0, 1], [0, 0, 1], 4), null);
});
