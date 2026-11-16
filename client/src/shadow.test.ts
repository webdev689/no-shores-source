import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHADOW_REACH_M, SHADOW_SIZE, shadowMatrix, sunAxes } from './shadow.ts';

type Vector = readonly [number, number, number];
const apply = (matrix: Float32Array, point: Vector): Vector => {
  const row = (index: number) =>
    (matrix[index] ?? 0) * point[0] +
    (matrix[index + 4] ?? 0) * point[1] +
    (matrix[index + 8] ?? 0) * point[2] +
    (matrix[index + 12] ?? 0);
  return [row(0), row(1), row(2)];
};

test("the sun's axes are square to each other and its light falls down and away from the sun", () => {
  const { right, up, along } = sunAxes();
  const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  assert.ok(
    Math.abs(dot(right, up)) < 1e-12 && Math.abs(dot(right, along)) < 1e-12 && Math.abs(dot(up, along)) < 1e-12,
  );
  assert.ok(along[2] < 0, 'the light falls');
  assert.ok(up[2] > 0, "the map's up leans up");
});

test('a point at the square’s middle maps to its middle, and its edges to the clip edges, wherever the eye stands', () => {
  for (const eye of [
    [2_809_154.37, 1_201_255.43, 89.6],
    [12.5, -40.2, 3],
  ] as const) {
    const ahead = [0, -75] as const;
    const matrix = shadowMatrix(eye, ahead);
    const middle = apply(matrix, [ahead[0], ahead[1], 0]);
    const texel = 2 / SHADOW_SIZE;
    assert.ok(Math.abs(middle[0]) <= texel && Math.abs(middle[1]) <= texel, `${middle}`);
    assert.ok(Math.abs(middle[2] - 0.5) < 1e-6, `${middle[2]}`);
    const { right, along } = sunAxes();
    const edge = apply(matrix, [
      ahead[0] + right[0] * SHADOW_REACH_M,
      ahead[1] + right[1] * SHADOW_REACH_M,
      right[2] * SHADOW_REACH_M,
    ]);
    assert.ok(Math.abs(edge[0] - 1) <= texel, `${edge}`);
    const toward = apply(matrix, [ahead[0] - along[0] * 100, ahead[1] - along[1] * 100, -along[2] * 100]);
    assert.ok(toward[2] < middle[2], 'nearer the sun is shallower in the map');
  }
});

test("the square's middle is snapped to the map's texels, so a step of the eye moves its shadows a whole texel or none", () => {
  const texel = (2 * SHADOW_REACH_M) / SHADOW_SIZE;
  const seenAt = (eyeX: number) => {
    const matrix = shadowMatrix([eyeX, 500, 10], [0, 0]);
    // A fixed world point, seen from the moved eye.
    return apply(matrix, [1000 - eyeX, 0, 0])[0] * (SHADOW_SIZE / 2);
  };
  const shift = seenAt(1000 + texel * 0.3) - seenAt(1000);
  assert.ok(Math.abs(shift) < 1e-3 || Math.abs(Math.abs(shift) - 1) < 1e-3, `${shift}`);
});
