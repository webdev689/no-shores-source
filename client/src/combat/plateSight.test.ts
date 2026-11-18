import assert from 'node:assert/strict';
import { test } from 'node:test';
import { frameOf, fromEyeMatrix, shifted } from '../game/camera.ts';
import {
  cameraOf,
  CONE,
  coneStep,
  coneWant,
  offDegrees,
  PLATE_SIZE,
  PlateSight,
  plateScale,
  SIGHT_HOLD_SECONDS,
} from './plateSight.ts';

test('the cone: whole within 17 degrees of the crosshair, half at 20, none past 23; a foe fought shows wherever it is', () => {
  assert.deepEqual(CONE, { degrees: 20, band: 6, fadeSeconds: 0.25 });
  assert.equal(coneWant(0, false), 1);
  assert.equal(coneWant(17, false), 1);
  assert.equal(coneWant(20, false), 0.5);
  assert.equal(coneWant(23, false), 0);
  assert.equal(coneWant(90, false), 0);
  assert.equal(coneWant(90, true), 1, 'fought in the last minute');
});

test('a plate fades by the cone over a quarter of a second, never past its want; a new one starts where it stands', () => {
  assert.equal(coneStep(null, 0.4, 0), 0.4, 'a plate new on the screen starts at its want, so none pops in');
  assert.equal(coneStep(1, 0, 0.125), 0.5, 'half the fade in half its time');
  assert.equal(coneStep(0, 1, 1), 1, 'never past its want');
  assert.equal(coneStep(0.5, 0.5, 0.016), 0.5);
});

test('a plate shrinks as its figure does and never grows with distance, whole up close, its letters never under 9 px', () => {
  const { reference, most, least, lens } = PLATE_SIZE;
  const focal = 1 / Math.tan(lens / 2);
  assert.equal(plateScale(reference / most, focal), 1, 'whole as near as its band’s near end');
  assert.equal(plateScale(1, focal), 1, 'and never bigger nearer in');
  assert.ok(Math.abs(plateScale(14, focal) - reference / 14 / most) < 1e-12, 'within the band, as the figure is');
  assert.ok(Math.abs(plateScale(15, focal) / plateScale(12.5, focal) - 12.5 / 15) < 1e-12, 'farther, smaller alike');
  let last = Infinity;
  for (let depth = 0.5; depth <= 60; depth += 0.5) {
    const scale = plateScale(depth, focal);
    assert.ok(scale <= last + 1e-12, `never grows farther out: ${depth}`);
    last = scale;
  }
  assert.equal(plateScale(reference / least, focal), 9 / 12, 'the letters hold at 9 px however far');
  assert.ok(plateScale(12, focal / 2) < plateScale(12, focal), 'a wider lens shrinks it, as it shrinks the figure');
  assert.equal(plateScale(0, focal), 1, 'a point on the lens is as near as a point can be');
});

test('the camera is read off its matrix: where its eye stands, the way it looks and its focal length', () => {
  const shot = { eye: [1200.5, -3400.25, 31] as const, yaw: 0.7, pitch: 0.2, fov: (50 * Math.PI) / 180 };
  const matrix = shifted(fromEyeMatrix({ ...shot, near: 0.1, far: 1000 }, 16 / 10), [-1200.5, 3400.25, -31]);
  const camera = cameraOf(matrix);
  assert.ok(camera);
  camera.eye.forEach((value, axis) => assert.ok(Math.abs(value - (shot.eye[axis] ?? 0)) < 0.05, `eye ${axis}`));
  assert.ok(Math.abs(camera.focal - 1 / Math.tan(shot.fov / 2)) < 1e-5);
  const ahead = camera.eye.map((value, axis) => value + 10 * (camera.forward[axis] ?? 0)) as [number, number, number];
  assert.ok(offDegrees(camera, ahead) < 0.01, 'a point straight ahead is on the crosshair');
  const { forward } = frameOf({ ...shot, near: 0.1, far: 1000 });
  forward.forEach((value, axis) => assert.ok(Math.abs(value - (camera.forward[axis] ?? 0)) < 1e-5, `forward ${axis}`));
  assert.equal(cameraOf(new Float32Array(16)), null, 'a matrix that is no camera’s says none');
});

test('a plate goes only once its line has stayed blocked for the hold, and comes back the moment it is seen', () => {
  assert.equal(SIGHT_HOLD_SECONDS, 0.15);
  const sight = new PlateSight();
  let hidden = 0;
  for (let frame = 0; frame < 20; frame++) if (sight.hidden(1, frame % 2 === 0, 1 / 60)) hidden++;
  assert.equal(hidden, 0, 'a railing crossing the line every other frame takes nothing away');
  for (let frame = 0; frame < 9; frame++) assert.equal(sight.hidden(2, true, 1 / 60), false, `held: ${frame}`);
  for (let frame = 0; frame < 2; frame++) sight.hidden(2, true, 1 / 60);
  assert.equal(sight.hidden(2, true, 1 / 60), true, 'blocked past the hold: gone');
  assert.equal(sight.hidden(2, false, 1 / 60), false, 'seen: back at once');
});
