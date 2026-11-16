import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameOf, fromEyeMatrix, lookOf, onScreen, type Shot } from './camera.ts';

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

test('a forward vector reads back as its bearing and pitch', () => {
  const frame = frameOf({ ...shot, yaw: 1.1, pitch: 0.4 });
  const look = lookOf(frame.forward);
  assert.ok(Math.abs(look.yaw - 1.1) < 1e-12 && Math.abs(look.pitch - 0.4) < 1e-12, JSON.stringify(look));
});
