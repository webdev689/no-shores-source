import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameOf, fromEyeMatrix, lookOf, onScreen, panShot, type Shot, shotOfOrbit } from './camera.ts';

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
});
