import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inverted } from '../cinema/inverted.ts';
import {
  frameOf,
  fromEyeMatrix,
  lookOf,
  onScreen,
  panShot,
  type Shot,
  shifted,
  shiftedExactly,
  shotOfOrbit,
} from './camera.ts';

const shot: Shot = { eye: [1_000_000, 2_000_000, 100], yaw: 0, pitch: 0, fov: Math.PI / 2, near: 1, far: 10_000 };
const size = { width: 800, height: 400 };

test('looking north, east is right and a point ahead stands mid-screen', () => {
  const frame = frameOf(shot);
  assert.deepEqual(frame.right, [1, 0, 0]);
  assert.ok(Math.abs(frame.forward[1] + 1) < 1e-12, 'north is up the page: south negative');
  const ahead = onScreen(shot, size, [1_000_000, 1_999_000, 100]);
  assert.deepEqual(
    ahead?.map((value) => Math.round(value)),
    [400, 200],
  );
  const right = onScreen(shot, size, [1_000_500, 1_999_000, 100]);
  assert.ok(right && right[0] > 400);
  assert.equal(onScreen(shot, size, [1_000_000, 2_001_000, 100]), null, 'behind the eye');
});

test('the matrix puts the near plane at depth 1 and the far at 0', () => {
  const matrix = fromEyeMatrix(shot, 2);
  const depthAt = (ahead: number) => {
    const point = [0, -ahead, 0, 1];
    const row = (index: number) =>
      [0, 1, 2, 3].reduce((sum, column) => sum + (matrix[column * 4 + index] ?? 0) * (point[column] ?? 0), 0);
    return row(2) / row(3);
  };
  assert.ok(Math.abs(depthAt(1) - 1) < 1e-6);
  assert.ok(Math.abs(depthAt(10_000)) < 1e-6);
  assert.ok(depthAt(10) > depthAt(100));
});

test("an orbit's shot stands back from its target along its look, and over the ground", () => {
  const orbit = { targetX: 100, targetY: 200, targetZ: 10, yaw: 0, pitch: 0, distance: 3 };
  const lens = { fov: 1, near: 0.1, far: 1000 };
  const level = shotOfOrbit(orbit, lens, () => null, 0.3);
  assert.deepEqual(
    level.eye.map((value) => Math.round(value * 1e9) / 1e9),
    [100, 203, 10],
    'looking north, the eye stands south of its target',
  );
  const buried = shotOfOrbit(orbit, lens, () => 12, 0.3);
  assert.equal(buried.eye[2], 12.3);
  assert.equal(buried.yaw, 0);
  assert.equal(level.fov, 1, 'unzoomed, the lens as it is');
  const aimed = shotOfOrbit({ ...orbit, zoom: 2 }, lens, () => null, 0.3);
  assert.ok(Math.abs(Math.tan(aimed.fov / 2) - Math.tan(0.5) / 2) < 1e-12, 'zoomed twice, half as wide');
});

test('a forward vector reads back as its bearing and pitch', () => {
  const frame = frameOf({ ...shot, yaw: 1.1, pitch: 0.4 });
  const look = lookOf(frame.forward);
  assert.ok(Math.abs(look.yaw - 1.1) < 1e-12 && Math.abs(look.pitch - 0.4) < 1e-12, JSON.stringify(look));
});

test("a pan eases its eye and lens across, its bearing the short way round, its near plane the target's past half way", () => {
  const from: Shot = { eye: [0, 0, 100], yaw: 3, pitch: 0.5, fov: 1, near: 5, far: 9_000 };
  const to: Shot = { eye: [10, 20, 4], yaw: -3, pitch: 0.1, fov: 0.8, near: 0.3, far: 500 };
  assert.deepEqual(panShot(from, to, 0), from);
  const half = panShot(from, to, 0.5);
  assert.deepEqual(half.eye, [5, 10, 52]);
  assert.ok(Math.abs(half.yaw - (3 + (2 * Math.PI - 6) / 2)) < 1e-12, 'across south, not all the way round');
  assert.equal(half.near, 5);
  const there = panShot(from, to, 1);
  assert.deepEqual([there.eye, there.near, there.far], [to.eye, 0.3, 9_000]);
  assert.ok(Math.abs(there.pitch - to.pitch) < 1e-12 && Math.abs(there.fov - to.fov) < 1e-12, 'at the target');
  const far: Shot = { ...to, eye: [4_812_345.123, 2_345_678.9, 31.7], pitch: 0.123, fov: 0.987 };
  const landed = panShot({ ...from, eye: [4_810_000.7, 2_344_000.3, 260.1] }, far, 1);
  assert.deepEqual([landed.eye, landed.pitch, landed.fov], [far.eye, far.pitch, far.fov], 'exactly, far out too');
});

test('a matrix shifted by an offset takes a point as the point plus the offset, far from the origin as near it', () => {
  const matrix = fromEyeMatrix(shot, 2);
  const clip = (through: Float32Array, point: readonly number[]) =>
    [0, 1, 2, 3].map((row) =>
      [0, 1, 2, 3].reduce((sum, column) => sum + (through[column * 4 + row] ?? 0) * (point[column] ?? 1), 0),
    );
  const fromEye = clip(matrix, [3, -40, 2]);
  const world = clip(shifted(matrix, [-shot.eye[0], -shot.eye[1], -shot.eye[2]]), [1_000_003, 1_999_960, 102]);
  world.forEach((value, index) => assert.ok(Math.abs(value - (fromEye[index] ?? 0)) < 0.05, `${value}`));
  const near = clip(shifted(matrix, [1, 2, 0.5]), [2, -42, 1.5]);
  near.forEach((value, index) => assert.ok(Math.abs(value - (fromEye[index] ?? 0)) < 1e-4, `${value}`));
});

const FAR_OUT: Shot = { eye: [23_817, -4_120, 6], yaw: 0.7, pitch: 0.2, fov: 0.9, near: 0.1, far: 30_000 };

const timesMatrix = (matrix: ArrayLike<number>, point: readonly number[]) =>
  [0, 1, 2, 3].map((row) =>
    [0, 1, 2, 3].reduce((sum, column) => sum + (matrix[column * 4 + row] ?? 0) * (point[column] ?? 0), 0),
  );

test("a pixel's depth reads back into the point drawn there, from the eye, near and far", () => {
  const fromEye = fromEyeMatrix(FAR_OUT, 16 / 9);
  const toEye = inverted(fromEye);
  assert.ok(toEye);
  for (const point of [
    [0.4, -2.5, -0.8],
    [3, -6, 1.2],
    [-40, -90, -6],
    [700, -900, 15],
  ]) {
    const [x = 0, y = 0, depth = 0, ahead = 1] = timesMatrix(fromEye, [...point, 1]);
    // Only what a depth target keeps goes back: the pixel's place and its depth.
    const seen = timesMatrix(toEye, [x / ahead, y / ahead, depth / ahead, 1]);
    const back = seen.slice(0, 3).map((value) => value / (seen[3] ?? 1));
    const missed = Math.hypot(...back.map((value, index) => value - (point[index] ?? 0)));
    const away = Math.hypot(...point);
    assert.ok(missed < away * 1e-4 + 1e-3, `${point.join(',')} came back ${missed.toFixed(5)} m off`);
  }
});

test('a world point far out at sea projects to the hair through the exact matrix, as it does from the eye', () => {
  // The wreck lies some 2,800 km from the world's origin, where a 32-bit offset rounds to a quarter metre.
  const far: Shot = { eye: [2_815_903.95, 1_176_449.3, 4.6], yaw: 0.7, pitch: 0.2, fov: 1.2, near: 0.1, far: 2_000 };
  const fromEye = fromEyeMatrix(far, 16 / 9);
  const clip = (matrix: ArrayLike<number>, [east, south, up]: readonly [number, number, number]) =>
    [0, 1, 3].map(
      (row) =>
        east * (matrix[row] ?? 0) +
        south * (matrix[4 + row] ?? 0) +
        up * (matrix[8 + row] ?? 0) +
        (matrix[12 + row] ?? 0),
    );
  const screen = (values: number[]) => [(values[0] ?? 0) / (values[2] ?? 1), (values[1] ?? 0) / (values[2] ?? 1)];
  const head: [number, number, number] = [far.eye[0] + 3.1, far.eye[1] - 4.2, 2.3];
  const fromTheEye = screen(clip(fromEye, [head[0] - far.eye[0], head[1] - far.eye[1], head[2] - far.eye[2]]));
  const exact = screen(clip(shiftedExactly(fromEye, [-far.eye[0], -far.eye[1], -far.eye[2]]), head));
  const rounded = screen(clip(shifted(fromEye, [-far.eye[0], -far.eye[1], -far.eye[2]]), head));
  const apart = (one: number[], other: number[]) =>
    Math.hypot((one[0] ?? 0) - (other[0] ?? 0), (one[1] ?? 0) - (other[1] ?? 0));
  assert.ok(apart(exact, fromTheEye) < 1e-6, `exact: ${apart(exact, fromTheEye)}`);
  assert.ok(
    apart(rounded, fromTheEye) > 1e-3,
    `the 32-bit matrix is off by ${apart(rounded, fromTheEye)} of the screen`,
  );
});
