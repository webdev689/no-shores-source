import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aheadOf, boxReaches, CASCADES, FAR, NEAR, SHADOW_SIZE, shadowMatrix, sunAxes } from './shadow.ts';

type Vector = readonly [number, number, number];
const apply = (matrix: Float32Array, point: Vector): Vector => {
  const row = (index: number) =>
    (matrix[index] ?? 0) * point[0] +
    (matrix[index + 4] ?? 0) * point[1] +
    (matrix[index + 8] ?? 0) * point[2] +
    (matrix[index + 12] ?? 0);
  return [row(0), row(1), row(2)];
};
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (point: Vector, axis: Vector, metres: number): Vector => [
  point[0] + axis[0] * metres,
  point[1] + axis[1] * metres,
  point[2] + axis[2] * metres,
];

test("the sun's axes are square to each other and its light falls down and away from the sun", () => {
  const { right, up, along: light } = sunAxes();
  assert.ok(
    Math.abs(dot(right, up)) < 1e-12 && Math.abs(dot(right, light)) < 1e-12 && Math.abs(dot(up, light)) < 1e-12,
  );
  assert.ok(light[2] < 0, 'the light falls');
  assert.ok(up[2] > 0, "the map's up leans up");
});

test("each cascade maps its square's middle to its middle and its edges to the clip edges, wherever the eye stands", () => {
  for (const cascade of CASCADES)
    for (const eye of [
      [2_809_154.37, 1_201_255.43, 89.6],
      [12.5, -40.2, 3],
    ] as const) {
      const ahead = aheadOf(cascade, Math.PI);
      const matrix = shadowMatrix(eye, ahead, cascade);
      const middle = apply(matrix, [ahead[0], ahead[1], 0]);
      const texel = 2 / SHADOW_SIZE;
      assert.ok(Math.abs(middle[0]) <= texel && Math.abs(middle[1]) <= texel, `${middle}`);
      assert.ok(Math.abs(middle[2] - 0.5) < 1e-6, `${middle[2]}`);
      const { right, along: light } = sunAxes();
      const edge = apply(matrix, along([ahead[0], ahead[1], 0], right, cascade.reachM));
      assert.ok(Math.abs(edge[0] - 1) <= texel, `${edge}`);
      const toward = apply(matrix, along([ahead[0], ahead[1], 0], light, -100));
      assert.ok(toward[2] < middle[2], 'nearer the sun is shallower in the map');
    }
});

test("each square's middle is snapped to its texels, so a step of the eye moves its shadows a whole texel or none", () => {
  for (const cascade of CASCADES) {
    const texel = (2 * cascade.reachM) / SHADOW_SIZE;
    const seenAt = (eyeX: number) => {
      const matrix = shadowMatrix([eyeX, 500, 10], [0, 0], cascade);
      // A fixed world point, seen from the moved eye.
      return apply(matrix, [1000 - eyeX, 0, 0])[0] * (SHADOW_SIZE / 2);
    };
    const shift = seenAt(1000 + texel * 0.3) - seenAt(1000);
    assert.ok(Math.abs(shift) < 1e-3 || Math.abs(Math.abs(shift) - 1) < 1e-3, `${shift}`);
  }
});

test('the far square holds the near one whichever way the eye looks, so a receiver leaving the near map finds the far', () => {
  const { right, up } = sunAxes();
  for (let step = 0; step < 16; step++) {
    const yaw = (step / 16) * 2 * Math.PI;
    const [near, far] = [aheadOf(NEAR, yaw), aheadOf(FAR, yaw)];
    const offset: Vector = [near[0] - far[0], near[1] - far[1], 0];
    for (const axis of [right, up])
      assert.ok(Math.abs(dot(offset, axis)) + NEAR.reachM < FAR.reachM, `yaw ${yaw.toFixed(2)}`);
  }
});

test("the far square's depth holds the ground anywhere in it, 400 m under the eye to 300 m over, and a tower over that", () => {
  const { right, up, along: light } = sunAxes();
  const matrix = shadowMatrix([0, 0, 0], [0, 0], FAR);
  for (const [across, upward] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ] as const)
    for (const height of [-400, 300]) {
      // The point at this corner of the square, slid along the sun to this height.
      const corner: Vector = along(along([0, 0, 0], right, across * FAR.reachM), up, upward * FAR.reachM);
      const ground = along(corner, light, (height - corner[2]) / light[2]);
      // A tower 300 m over that ground, its top toward the sun from where its shadow falls.
      const top = along(ground, light, -300 / -light[2]);
      for (const point of [ground, top]) {
        const depth = apply(matrix, point)[2];
        assert.ok(depth > 0 && depth < 1, `${across}, ${upward} at ${height} m: ${depth}`);
      }
    }
});

test("a box casts into a square when, seen along the sun, it overlaps it, even far below the eye's height", () => {
  const ahead = aheadOf(NEAR, 0);
  // A block 40 m across on the ground in the square's middle, the eye standing level with it.
  assert.ok(boxReaches(NEAR, ahead, [ahead[0] - 20, ahead[1] - 20, 0], [ahead[0] + 20, ahead[1] + 20, 20]));
  // One far off, out of the square every way.
  assert.ok(!boxReaches(NEAR, ahead, [5000, 5000, 0], [5040, 5040, 20]));
  // A house 100 m under an eye on a plaza: the square meets the ground there displaced away from the sun, and the
  // house's shadow falls in it.
  const { along: light } = sunAxes();
  const under = [ahead[0] + light[0] * 140, ahead[1] + light[1] * 140, -100] as const;
  assert.ok(boxReaches(NEAR, ahead, [under[0] - 5, under[1] - 5, -100], [under[0] + 5, under[1] + 5, -90]));
  // The same house toward the sun from the middle by as far is out of it.
  const toward = [ahead[0] - light[0] * 400, ahead[1] - light[1] * 400, -100] as const;
  assert.ok(!boxReaches(NEAR, ahead, [toward[0] - 5, toward[1] - 5, -100], [toward[0] + 5, toward[1] + 5, -90]));
});

test('a tower toward the sun from the square casts into it from its top', () => {
  const ahead = aheadOf(NEAR, 0);
  const { along: light } = sunAxes();
  const horizontal = Math.hypot(light[0], light[1]);
  // 300 m toward the sun along the ground from the square's middle; a 300 m tower there throws its top's shadow
  // 300 / tan(elevation) metres away from the sun, into the square.
  const base = [ahead[0] - (light[0] / horizontal) * 300, ahead[1] - (light[1] / horizontal) * 300] as const;
  assert.ok(!boxReaches(NEAR, ahead, [base[0] - 5, base[1] - 5, 0], [base[0] + 5, base[1] + 5, 10]));
  assert.ok(boxReaches(NEAR, ahead, [base[0] - 5, base[1] - 5, 0], [base[0] + 5, base[1] + 5, 300]));
});
