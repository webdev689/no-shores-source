import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAG, initialCamera, TILT } from './overworldCamera.ts';
import { CLICK_SLOP_PX, dragCamera, keyTurn, KEY_RATE, pressAt, pressMove, wheelNotches } from './overworldInput.ts';

test('a press that stays within 6 px is a click and orbits nothing; past it, a drag orbits by each move', () => {
  assert.equal(CLICK_SLOP_PX, 6);
  let press = pressAt(100, 100);
  let moved = pressMove(press, 104, 103);
  assert.equal(moved.press.dragging, false);
  assert.deepEqual([moved.acrossPx, moved.downPx], [0, 0]);
  press = moved.press;
  moved = pressMove(press, 110, 103);
  assert.equal(moved.press.dragging, true);
  assert.deepEqual([moved.acrossPx, moved.downPx], [6, 0], 'the move since the last, not since the press');
  moved = pressMove(moved.press, 101, 100);
  assert.equal(moved.press.dragging, true, 'once a drag, always a drag');
  assert.deepEqual([moved.acrossPx, moved.downPx], [-9, -3]);
  const camera = dragCamera(initialCamera([0, 0, 0], 0), { acrossPx: 20, downPx: 10 });
  assert.ok(Math.abs(camera.yaw - 20 * DRAG.orbitPerPx) < 1e-12);
  assert.ok(Math.abs(camera.tilt - (TILT.initial + 10 * DRAG.tiltPerPx)) < 1e-12);
});

test('a wheel zooms by its size: 100 px a notch, lines of 16 px, pages, at most 3 notches an event', () => {
  assert.equal(wheelNotches(-100, 0), 1, 'rolled up: in');
  assert.equal(wheelNotches(100, 0), -1);
  assert.equal(wheelNotches(-4, 0), 0.04, 'a trackpad nudge is a sliver of a notch');
  assert.equal(wheelNotches(-3, 1), 0.48);
  assert.equal(wheelNotches(1, 2, 800), -3, 'a page is clamped');
  assert.ok(wheelNotches(Number.NaN, 0) === 0, 'a broken event zooms nothing');
});

test('the look keys orbit and tilt by their rates', () => {
  const camera = initialCamera([0, 0, 0], 0);
  const turned = keyTurn(camera, 1, -1, 0.5);
  assert.ok(Math.abs(turned.yaw - KEY_RATE.orbit * 0.5) < 1e-12);
  assert.ok(Math.abs(turned.tilt - (TILT.initial - KEY_RATE.tilt * 0.5)) < 1e-12);
  assert.equal(keyTurn(camera, 0, 0, 0.5), camera);
});
