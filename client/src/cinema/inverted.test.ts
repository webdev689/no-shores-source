import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inverted } from './inverted.ts';

const times = (matrix: ArrayLike<number>, point: readonly number[]) =>
  [0, 1, 2, 3].map((row) =>
    [0, 1, 2, 3].reduce((sum, column) => sum + (matrix[column * 4 + row] ?? 0) * (point[column] ?? 0), 0),
  );

test('a matrix with no inverse gives none', () => {
  const flat = new Float32Array(16);
  flat.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(inverted(flat), null);
});

test('the inverse undoes the matrix, whichever row holds its largest values', () => {
  const swapped = Float32Array.from([0, 2, 0, 0, 3, 0, 0, 0, 0, 0, 0, 5, 0, 0, 7, 0]);
  const back = inverted(swapped);
  assert.ok(back);
  for (const point of [
    [1, 2, 3, 1],
    [-4, 0.5, 9, 2],
  ]) {
    const twice = times(back, times(swapped, point));
    twice.forEach((value, index) => assert.ok(Math.abs(value - (point[index] ?? 0)) < 1e-5));
  }
});
