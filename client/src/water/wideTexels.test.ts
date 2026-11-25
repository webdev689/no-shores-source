import assert from 'node:assert/strict';
import { test } from 'node:test';
import { wideTexels } from './wideTexels.ts';

test("the 1 km land's texels hold each cell's height, coast distance and carried height, row by row", () => {
  // A window 3 cells wide and 2 high; the texels of its east two columns.
  const cells = {
    width: 3,
    heights: Float32Array.of(1, 2, 3, 4, 5, 6),
    coast: Float32Array.of(10, 20, 30, 40, 50, 60),
    across: Float32Array.of(-1, -2, -3, -4, -5, -6),
  };
  const texels = wideTexels(cells, { left: 1, top: 0, right: 3, bottom: 2 });
  assert.deepEqual([...texels], [2, 20, -2, 0, 3, 30, -3, 0, 5, 50, -5, 0, 6, 60, -6, 0]);
});
