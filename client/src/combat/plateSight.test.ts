import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AIM_SWAP_DEGREES,
  aimedFoe,
  cameraOf,
  CONE,
  coneStep,
  coneWant,
  LAND_STEP_M,
  landBlocks,
  offDegrees,
  PLATE_SIZE,
  PlateSight,
  plateScale,
  SIGHT_HOLD_SECONDS,
} from './plateSight.ts';

test('the cone: whole within 4 degrees of the crosshair, half at 5, none past 6; a foe held shows wherever it is', () => {
  assert.deepEqual(CONE, { degrees: 5, band: 2, fadeSeconds: 0.25 });
  assert.equal(coneWant(0, 0), 1);
  assert.equal(coneWant(4, 0), 1);
  assert.equal(coneWant(5, 0), 0.5);
  assert.equal(coneWant(6, 0), 0);
  assert.equal(coneWant(90, 0), 0);
  assert.equal(coneWant(null, 0), 0, 'not the foe aimed at: the cone shows none of it');
  assert.equal(coneWant(null, 1), 1, 'fought or locked: whole wherever it is');
  assert.equal(coneWant(90, 0.4), 0.4, 'a fight fading');
  assert.equal(coneWant(4.5, 0.4), 0.75, 'the more of the two');
});

test('the cone shows one foe: the nearest the crosshair inside its edge, kept until another is clearly nearer', () => {
  const offs = (...pairs: (readonly [number, number])[]) => new Map(pairs);
  assert.equal(aimedFoe(offs([1, 3], [2, 1.5], [3, 20]), null), 2, 'the nearest');
  assert.equal(aimedFoe(offs([1, 7], [2, 30]), null), null, 'none inside the edge');
  assert.equal(aimedFoe(offs([1, 2], [2, 1.5]), 1), 1, 'last frame’s, while none is a degree nearer');
  assert.equal(aimedFoe(offs([1, 2.6], [2, 1.5]), 1), 2, 'another a degree nearer takes it');
  assert.equal(aimedFoe(offs([1, 6.5], [2, 5.5]), 1), 2, 'last frame’s past the edge gives way');
  assert.equal(aimedFoe(offs([2, 3]), 1), 2, 'last frame’s gone gives way');
  assert.equal(AIM_SWAP_DEGREES, 1);
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

/** A camera's matrix (clip = matrix × point, column by column) with the Game's clip x, y and w (its depth row left
 *  plain): an eye at `eye` looking along `yaw` (0 north, a quarter turn east) and `pitch` below the horizon, through
 *  a lens of `fov` radians. */
function cameraMatrix(eye: readonly [number, number, number], yaw: number, pitch: number, fov: number, aspect: number) {
  const forward = [Math.cos(pitch) * Math.sin(yaw), -Math.cos(pitch) * Math.cos(yaw), -Math.sin(pitch)];
  const right = [Math.cos(yaw), Math.sin(yaw), 0];
  const up = [Math.sin(pitch) * Math.sin(yaw), -Math.sin(pitch) * Math.cos(yaw), Math.cos(pitch)];
  const focal = 1 / Math.tan(fov / 2);
  const rows = [right.map((value) => (value * focal) / aspect), up.map((value) => value * focal), forward, forward];
  const matrix = new Float32Array(16);
  rows.forEach((row, index) => {
    const along = (row[0] ?? 0) * eye[0] + (row[1] ?? 0) * eye[1] + (row[2] ?? 0) * eye[2];
    row.forEach((value, column) => (matrix[column * 4 + index] = value));
    matrix[12 + index] = -along;
  });
  return { matrix, forward };
}

test('the camera is read off its matrix: where its eye stands, the way it looks and its focal length', () => {
  const shot = { eye: [1200.5, -3400.25, 31] as const, yaw: 0.7, pitch: 0.2, fov: (50 * Math.PI) / 180 };
  const { matrix, forward } = cameraMatrix(shot.eye, shot.yaw, shot.pitch, shot.fov, 16 / 10);
  const camera = cameraOf(matrix);
  assert.ok(camera);
  camera.eye.forEach((value, axis) => assert.ok(Math.abs(value - (shot.eye[axis] ?? 0)) < 0.05, `eye ${axis}`));
  assert.ok(Math.abs(camera.focal - 1 / Math.tan(shot.fov / 2)) < 1e-5);
  const ahead = camera.eye.map((value, axis) => value + 10 * (camera.forward[axis] ?? 0)) as [number, number, number];
  assert.ok(offDegrees(camera, ahead) < 0.01, 'a point straight ahead is on the crosshair');
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

test('the land hides a plate as a block does: a rise between the eye and the head, never the ground under or past it', () => {
  // A ridge 4 m high across y = 20 to 22, else flat ground at 0; off the window (past y = 90) no ground is known.
  const ridge = (_east: number, y: number) => (y > 90 ? null : y >= 20 && y <= 22 ? 4 : 0);
  assert.equal(LAND_STEP_M, 1);
  assert.equal(landBlocks(ridge, [0, 0, 1.7], [0, 40, 1.8]), true, 'the ridge stands across the line');
  assert.equal(landBlocks(ridge, [0, 0, 9], [0, 40, 1.8]), false, 'looked down on from over it');
  assert.equal(landBlocks(ridge, [0, 0, 1.7], [0, 15, 1.8]), false, 'a foe before the ridge');
  assert.equal(landBlocks(ridge, [0, 0, 1.7], [0, 21, 5.8]), false, 'a foe standing on the ridge');
  assert.equal(
    landBlocks(() => null, [0, 0, 1.7], [0, 40, 1.8]),
    false,
    'no ground known, nothing hidden',
  );
  const bowl = (x: number, y: number) => Math.hypot(x, y) / 10;
  assert.equal(landBlocks(bowl, [0, 0, 1.7], [30, 0, 4.8]), false, 'across a bowl the line stays over the ground');
});
