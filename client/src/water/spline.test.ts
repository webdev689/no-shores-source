import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heldSplineAt, splineAt } from './spline.ts';

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

test("held, the spline keeps a pad's step level to its edge and never stands a ridge over it", () => {
  const [width, height] = [6, 3];
  const step = Float32Array.from({ length: width * height }, (_value, index) => (index % width < 3 ? 87 : 46.75));
  assert.ok(splineAt(step, width, height, 1.5, 1) > 87.5, 'the bare cubic overshoots the pad');
  for (let across = 0; across <= width - 1; across += 0.125) {
    const held = heldSplineAt(step, width, height, across, 1);
    assert.ok(held <= 87 && held >= 46.75, `${across}: ${held}`);
    if (across <= 2) assert.equal(held, 87, `${across} is on the pad`);
  }
  const ramp = Float32Array.from({ length: width * height }, (_value, index) => (index % width) * 3);
  assert.equal(heldSplineAt(ramp, width, height, 2.4, 1.5), splineAt(ramp, width, height, 2.4, 1.5));
});
