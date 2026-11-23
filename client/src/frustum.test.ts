import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boxSeen, pointsSeen, sphereAround, sphereSeen, viewPlanes } from './frustum.ts';
import { fromEyeMatrix, type Shot } from './game/camera.ts';

/** The game's own camera at the eye, looking north (-y) unless turned, 60 degrees high on a wide screen. */
const shot = (yaw = 0, pitch = 0): Shot => ({ eye: [0, 0, 0], yaw, pitch, fov: Math.PI / 3, near: 0.2, far: 6000 });
const matrixOf = (yaw = 0, pitch = 0): Float32Array => fromEyeMatrix(shot(yaw, pitch), 16 / 9);

/** A cube `half` metres either way of (x, y, z), as its low and high corners. */
const cube = (x: number, y: number, z: number, half = 1): [number[], number[]] => [
  [x - half, y - half, z - half],
  [x + half, y + half, z + half],
];

/** Whether a point lands inside the clip volume the matrix draws. */
function onScreen(matrix: Float32Array, [x, y, z]: readonly number[]): boolean {
  const clip = [0, 1, 2, 3].map(
    (row) =>
      (matrix[row] ?? 0) * (x ?? 0) +
      (matrix[4 + row] ?? 0) * (y ?? 0) +
      (matrix[8 + row] ?? 0) * (z ?? 0) +
      (matrix[12 + row] ?? 0),
  );
  const [across = 0, upward = 0, depth = 0, w = 0] = clip;
  return w > 0 && Math.abs(across) <= w && Math.abs(upward) <= w && depth >= 0 && depth <= w;
}

/** A small seeded die, so a sweep is the same every run. */
function die(seed: number): () => number {
  let state = seed;
  return () => (state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0) / 4_294_967_296;
}

test('a box ahead is seen; one behind, past the far plane or off to any side is not', () => {
  const planes = viewPlanes(matrixOf());
  assert.ok(boxSeen(planes, ...cube(0, -50, 0)), 'dead ahead');
  assert.ok(!boxSeen(planes, ...cube(0, 50, 0)), 'behind the eye');
  assert.ok(!boxSeen(planes, ...cube(0, -7000, 0)), 'past the far plane');
  assert.ok(!boxSeen(planes, ...cube(200, -50, 0)), 'far to the right');
  assert.ok(!boxSeen(planes, ...cube(-200, -50, 0)), 'far to the left');
  assert.ok(!boxSeen(planes, ...cube(0, -50, 200)), 'far above');
  assert.ok(!boxSeen(planes, ...cube(0, -50, -200)), 'far below');
  // At 50 m ahead the view's right edge stands some 51 m out: a box across it is seen.
  assert.ok(boxSeen(planes, ...cube(51, -50, 0, 5)), 'across the right edge');
});

test('a box across the near or the far plane, or round the whole view, is seen', () => {
  const planes = viewPlanes(matrixOf());
  assert.ok(boxSeen(planes, ...cube(0, 0, 0, 3)), 'across the near plane');
  assert.ok(boxSeen(planes, ...cube(0, -6000, 0, 100)), 'across the far plane');
  assert.ok(boxSeen(planes, [-1e6, -1e6, -1e6], [1e6, 1e6, 1e6]), 'round the whole view');
});

test('a view turned east sees the east and no longer the west', () => {
  const planes = viewPlanes(matrixOf(Math.PI / 2));
  assert.ok(boxSeen(planes, ...cube(50, 0, 0)));
  assert.ok(!boxSeen(planes, ...cube(-50, 0, 0)));
  assert.ok(!boxSeen(planes, ...cube(0, -50, 0)), 'north is to the side now');
});

test("every plane is a unit normal, so a sphere's radius counts whole against it", () => {
  const planes = viewPlanes(matrixOf(0.4, 0.3));
  for (let plane = 0; plane < 6; plane++) {
    const length = Math.hypot(planes[plane * 4] ?? 0, planes[plane * 4 + 1] ?? 0, planes[plane * 4 + 2] ?? 0);
    assert.ok(Math.abs(length - 1) < 1e-9, `plane ${plane} is ${length} long`);
  }
});

test('no sphere or box with any of it on screen is ever left out', () => {
  for (const [yaw, pitch] of [
    [0, 0],
    [0.7, 0.4],
    [-2.2, -0.3],
  ] as const) {
    const matrix = matrixOf(yaw, pitch);
    const planes = viewPlanes(matrix);
    const roll = die(7);
    let [onScreenSeen, culled] = [0, 0];
    for (let round = 0; round < 4000; round++) {
      const middle = [(roll() - 0.5) * 300, (roll() - 0.5) * 300, (roll() - 0.5) * 120];
      const radius = 0.5 + roll() * 12;
      const [x = 0, y = 0, z = 0] = middle;
      // Its middle and the six points of it farthest along each axis, and its box's eight corners.
      const surface = [[0, 0, 0], ...[0, 1, 2].flatMap((axis) => [-1, 1].map((sign) => axis3(axis, sign)))];
      const sphereShows = surface.some(([east = 0, south = 0, up = 0]) =>
        onScreen(matrix, [x + east * radius, y + south * radius, z + up * radius]),
      );
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((corner) => [
        x + (corner & 1 ? radius : -radius),
        y + (corner & 2 ? radius : -radius),
        z + (corner & 4 ? radius : -radius),
      ]);
      const boxShows = corners.some((corner) => onScreen(matrix, corner)) || onScreen(matrix, middle);
      if (sphereShows) {
        onScreenSeen++;
        assert.ok(sphereSeen(planes, x, y, z, radius), `the sphere at ${middle.join(', ')} shows`);
      }
      if (boxShows) assert.ok(boxSeen(planes, ...cube(x, y, z, radius)), `the box at ${middle.join(', ')} shows`);
      if (!boxSeen(planes, ...cube(x, y, z, radius))) culled++;
    }
    assert.ok(onScreenSeen > 200, `${onScreenSeen} on screen to judge`);
    assert.ok(culled > 1000, `and ${culled} left out, so the saving is real`);
  }
});

/** The unit vector along `axis`, signed. */
function axis3(axis: number, sign: number): number[] {
  return [0, 1, 2].map((each) => (each === axis ? sign : 0));
}

test('a sphere behind the eye, far to the side or past the far plane is left out; one ahead is not', () => {
  const planes = viewPlanes(matrixOf());
  assert.ok(sphereSeen(planes, 0, -6, 0, 0.8), 'straight ahead');
  assert.ok(!sphereSeen(planes, 0, 6, 0, 0.8), 'behind');
  assert.ok(!sphereSeen(planes, 900, -6, 0, 0.8), 'far to the side');
  assert.ok(!sphereSeen(planes, 0, -9000, 0, 0.8), 'past the far plane');
  assert.ok(sphereSeen(planes, Number.NaN, 0, 0, 1), 'a sphere not known is drawn');
});

test('a set of points is out of view only when every one lies more than the pad outside one plane', () => {
  const planes = viewPlanes(matrixOf());
  // A thin wedge 2 km long running away east from the eye's side: outside the view's right plane all along.
  const wedge = [100, 0, -10, 100, 0, 10, 2000, 30, -10, 2000, 30, 10];
  assert.ok(!pointsSeen(planes, wedge), 'off to the side');
  assert.ok(pointsSeen(planes, wedge, 100), 'grown 100 m, it reaches the view near the eye');
  assert.ok(pointsSeen(planes, [...wedge, 0, -500, 0]), 'one point ahead is enough');
});

test('a sphere round points holds every one, about the middle of their box', () => {
  const roll = die(3);
  const points = Array.from({ length: 300 }, () => [roll() * 40 - 5, roll() * 9, roll() * 30 - 2, 99]).flat();
  const [x, y, z, radius] = sphereAround(points, 4);
  for (let point = 0; point < points.length; point += 4) {
    const away = Math.hypot((points[point] ?? 0) - x, (points[point + 1] ?? 0) - y, (points[point + 2] ?? 0) - z);
    assert.ok(away <= radius + 1e-9);
  }
  assert.deepEqual(sphereAround([1, 2, 3, 1, 2, 7]), [1, 2, 5, 2]);
  assert.deepEqual(sphereAround([]), [0, 0, 0, 0]);
});
