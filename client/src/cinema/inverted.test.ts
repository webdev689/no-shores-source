import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromEyeMatrix, type Shot } from '../game/camera.ts';
import { inverted } from './inverted.ts';

const SHOT: Shot = { eye: [23_817, -4_120, 6], yaw: 0.7, pitch: 0.2, fov: 0.9, near: 0.1, far: 30_000 };

const times = (matrix: ArrayLike<number>, point: readonly number[]) =>
  [0, 1, 2, 3].map((row) =>
    [0, 1, 2, 3].reduce((sum, column) => sum + (matrix[column * 4 + row] ?? 0) * (point[column] ?? 0), 0),
  );

test("a pixel's depth reads back into the point drawn there, from the eye, near and far", () => {
  const fromEye = fromEyeMatrix(SHOT, 16 / 9);
  const toEye = inverted(fromEye);
  assert.ok(toEye);
  for (const point of [
    [0.4, -2.5, -0.8],
    [3, -6, 1.2],
    [-40, -90, -6],
    [700, -900, 15],
  ]) {
    const clip = times(fromEye, [...point, 1]);
    const [x = 0, y = 0, depth = 0, ahead = 1] = clip;
    // Only what a depth target keeps goes back: the pixel's place and its depth.
    const seen = times(toEye, [x / ahead, y / ahead, depth / ahead, 1]);
    const back = seen.slice(0, 3).map((value) => value / (seen[3] ?? 1));
    const missed = Math.hypot(...back.map((value, index) => value - (point[index] ?? 0)));
    const away = Math.hypot(...point);
    assert.ok(missed < away * 1e-4 + 1e-3, `${point.join(',')} came back ${missed.toFixed(5)} m off`);
  }
});

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
