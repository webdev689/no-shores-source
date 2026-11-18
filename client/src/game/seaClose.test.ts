import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Shot } from './camera.ts';
import { CLOSE, CloseZoom } from './seaClose.ts';

const SEA: Shot = { eye: [1000, 2190, 150], yaw: 0, pitch: 0.65, fov: 1.1, near: 2, far: 60_000 };
const lying = (scale: number) => ({ x: 1000, y: 2000, heading: 0.3, scale, heave: 0.2, pitch: 0, roll: 0 });

test('the wheel comes in past the Overworld only from its lowest, and goes back out from close first', () => {
  const close = new CloseZoom();
  assert.equal(close.zoom(2, false), 2, 'above the lowest the Overworld zooms');
  assert.equal(close.zoom(-1, false), -1, 'out from the Overworld, not from close');
  assert.equal(close.zoom(2, true), 0, 'at the lowest the wheel comes in close');
  close.step(10);
  assert.ok(Math.abs(close.eased - 0.352) < 1e-12, 'two notches of five, eased');
  assert.equal(close.zoom(-1, true), 0, 'out from close first');
  assert.equal(close.zoom(10, true), 0);
  close.step(10);
  assert.equal(close.eased, 1, 'no further in than her true size');
  close.release();
  close.step(10);
  assert.equal(close.eased, 0, 'let go, it eases back out');
  assert.equal(close.zoom(-1, true), -1, 'all the way out, the Overworld zooms out');
});

test('all the way in, the eye stands off her at her true scale, looking at her deck along the camera', () => {
  const close = new CloseZoom();
  close.zoom(5, true);
  close.step(10);
  const shot = close.shot(SEA, lying(1), 0, 0.5);
  const target = [1000, 2000, 0.2 + CLOSE.lookAtM];
  const away = Math.hypot(...shot.eye.map((value, axis) => value - (target[axis] ?? 0)));
  assert.ok(Math.abs(away - CLOSE.distanceM) < 1e-9, `${away} m from her deck`);
  assert.ok(shot.eye[1] > 2000 && Math.abs(shot.eye[0] - 1000) < 1e-9, 'south of her, looking north');
  assert.deepEqual([shot.pitch, shot.near, shot.far], [0.5, CLOSE.nearM, SEA.far]);
});

test("out of the close view the shot is the sea's own, and halfway in it lies between", () => {
  const close = new CloseZoom();
  assert.equal(close.shot(SEA, lying(4), 0, 0.5), SEA);
  close.zoom(2.5, true);
  close.step(10);
  const halfway = close.shot(SEA, lying(2.5), 0, 0.5);
  assert.ok(halfway.eye[2] < SEA.eye[2] && halfway.eye[2] > 0.2 + CLOSE.lookAtM, `${halfway.eye[2]}`);
});
