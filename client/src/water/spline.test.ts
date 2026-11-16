import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splineAt } from './spline.ts';

test('the spline passes through every sample, keeps a slope straight and curves smoothly between bumps', () => {
  const [width, height] = [5, 4];
  const bump = Float32Array.from({ length: width * height }, (_value, index) => (index % width === 2 ? 10 : 0));
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      assert.equal(splineAt(bump, width, height, column, row), bump[row * width + column]);
    }
  }
  const slope = Float32Array.from({ length: width * height }, (_value, index) => (index % width) * 3);
  assert.ok(Math.abs(splineAt(slope, width, height, 1.37, 2.5) - 4.11) < 1e-9);
  const rising = splineAt(bump, width, height, 1.75, 1);
  assert.ok(rising > 7.5 && rising < 10, `${rising}`);
  assert.ok(splineAt(bump, width, height, 2.25, 1) === rising, 'the bump is symmetric');
});
