import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitFrame, niceLength, pan, screenToWorld, worldToScreen, zoomAt } from './camera.ts';

const camera = { centreX: 1_000_000, centreY: 500_000, metresPerPixel: 1_000 };

test('screen and world positions convert both ways', () => {
  const world = screenToWorld(camera, 800, 600, 500, 400);
  assert.deepEqual(world, { x: 1_100_000, y: 600_000 });
  assert.deepEqual(worldToScreen(camera, 800, 600, world.x, world.y), { x: 500, y: 400 });
});

test('zooming keeps the point under the cursor where it was', () => {
  const zoomed = zoomAt(camera, 800, 600, 600, 100, 0.5);
  assert.equal(zoomed.metresPerPixel, 500);
  assert.deepEqual(screenToWorld(zoomed, 800, 600, 600, 100), screenToWorld(camera, 800, 600, 600, 100));
});

test('zoom stops at its limits', () => {
  assert.equal(zoomAt(camera, 800, 600, 0, 0, 1e6).metresPerPixel, 20_000);
  assert.equal(zoomAt(camera, 800, 600, 0, 0, 1e-6).metresPerPixel, 50);
});

test('dragging moves the world with the pointer', () => {
  const moved = pan(camera, 10, -5);
  assert.deepEqual(screenToWorld(moved, 800, 600, 410, 295), screenToWorld(camera, 800, 600, 400, 300));
});

test('the whole frame fits with a margin', () => {
  const fitted = fitFrame(4_915_200, 3_072_000, 1000, 800);
  const corner = worldToScreen(fitted, 1000, 800, 0, 0);
  assert.ok(corner.x >= 0 && corner.y >= 0);
  assert.ok(Math.abs(corner.x - 50) < 1e-9, 'the wider side sets the scale');
});

test('scale-bar lengths are round', () => {
  assert.equal(niceLength(1_000, 120), 200_000);
  assert.equal(niceLength(37, 120), 5_000);
  assert.equal(niceLength(20_000, 120), 5_000_000);
});
