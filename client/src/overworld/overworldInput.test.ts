import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAG, initialCamera, TILT } from './overworldCamera.ts';
import {
  CLICK_SLOP_PX,
  dragCamera,
  keyTurn,
  KEY_RATE,
  LIFT_OFF,
  LIFT_SECONDS,
  lowerLift,
  pinchNotches,
  pressAt,
  pressMove,
  raiseLift,
  stepLift,
  wheelNotches,
  zoomCamera,
  type Lift,
} from './overworldInput.ts';

function run(lift: Lift, seconds: number, dt = 1 / 60): Lift {
  let now = lift;
  for (let i = 0; i < Math.round(seconds / dt); i++) now = stepLift(now, dt);
  return now;
}

test('the view rises over 1.2 s, stays up, and falls back over 0.8 s to off', () => {
  assert.deepEqual(LIFT_SECONDS, { rise: 1.2, fall: 0.8 });
  const rising = raiseLift(LIFT_OFF);
  assert.deepEqual(rising, { phase: 'rising', blend: 0 });
  const halfway = run(rising, 0.6);
  assert.equal(halfway.phase, 'rising');
  assert.ok(Math.abs(halfway.blend - 0.5) < 1e-9);
  const up = run(halfway, 0.7);
  assert.deepEqual(up, { phase: 'up', blend: 1 });
  assert.deepEqual(stepLift(up, 1), up, 'it stays up');
  const falling = lowerLift(up);
  assert.equal(falling.phase, 'falling');
  assert.equal(run(falling, 0.4).phase, 'falling');
  assert.deepEqual(run(falling, 0.85), LIFT_OFF);
});

test('a view caught falling rises again from where it stands, and asking twice changes nothing', () => {
  const caught = run(lowerLift(run(raiseLift(LIFT_OFF), 1.5)), 0.4);
  assert.equal(caught.phase, 'falling');
  const again = raiseLift(caught);
  assert.deepEqual(again, { phase: 'rising', blend: caught.blend });
  assert.deepEqual(raiseLift(again), again);
  assert.deepEqual(lowerLift(LIFT_OFF), LIFT_OFF, 'a view down stays down');
  assert.deepEqual(stepLift(LIFT_OFF, 1), LIFT_OFF);
});

test('the island fly-in steps by its own seconds', () => {
  const flying = stepLift(raiseLift(LIFT_OFF), 1, 2.5, 2.5);
  assert.ok(Math.abs(flying.blend - 0.4) < 1e-12);
});

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

test('fingers moving apart zoom in by the notches their gap grew', () => {
  assert.ok(Math.abs(pinchNotches(100, 118) - 1) < 1e-12);
  assert.ok(Math.abs(pinchNotches(118, 100) + 1) < 1e-12);
  assert.equal(pinchNotches(0, 100), 0);
});

test('zooming moves the height target under the ceiling; the look keys orbit and tilt by their rates', () => {
  const camera = initialCamera([0, 0, 0], 0);
  assert.ok(Math.abs(zoomCamera(camera, 1, 450).heightTarget - 260 / 1.18) < 1e-9);
  assert.equal(zoomCamera(camera, 0, 450), camera);
  assert.equal(zoomCamera(camera, -10, 300).heightTarget, 300);
  const turned = keyTurn(camera, 1, -1, 0.5);
  assert.ok(Math.abs(turned.yaw - KEY_RATE.orbit * 0.5) < 1e-12);
  assert.ok(Math.abs(turned.tilt - (TILT.initial - KEY_RATE.tilt * 0.5)) < 1e-12);
  assert.equal(keyTurn(camera, 0, 0, 0.5), camera);
});
