import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aimEye } from './aim.ts';
import { AIM_CAM_CLEAR, AIM_CAM_TAU, AimCamera, type AimHull, segmentBoxEntry } from './aimCamera.ts';

const SHIP = { x: 100, y: 200, heading: 0, heave: 0 };
const HOME = [100, 275, 30] as const;
const near = (actual: number, wanted: number, within = 1e-6) => Math.abs(actual - wanted) <= within;
const gap = (one: readonly number[], other: readonly number[]) =>
  Math.hypot(...one.map((value, axis) => value - (other[axis] ?? 0)));

test('pressing aim eases the eye out to the battery over a fifth of a second, smoothstepped, not in one frame', () => {
  const camera = new AimCamera();
  const first = camera.eye(HOME, 1, SHIP, [], 1 / 60);
  const aimed = aimEye(SHIP, 1);
  assert.ok(gap(first, HOME) < 0.05 * gap(aimed, HOME), 'the first frame has barely left the orbit');
  // DFO's: k eases by 1 - e^(-dt / tau), the eye moves by k smoothstepped.
  const k = 1 - Math.exp(-(1 / 60) / AIM_CAM_TAU);
  const share = k * k * (3 - 2 * k);
  assert.ok(near(gap(first, HOME), share * gap(aimed, HOME), 1e-6));
  let eye = first;
  for (let frame = 0; frame < 120; frame++) eye = camera.eye(HOME, 1, SHIP, [], 1 / 60);
  assert.ok(gap(eye, aimed) < 0.01, 'two seconds on it stands at the aim eye');
});

test('letting go eases the eye home again, and once home the camera is its own', () => {
  const camera = new AimCamera();
  for (let frame = 0; frame < 120; frame++) camera.eye(HOME, 1, SHIP, [], 1 / 60);
  const leaving = camera.eye(HOME, null, SHIP, [], 1 / 60);
  assert.ok(
    gap(leaving, aimEye(SHIP, 1)) < 0.05 * gap(HOME, aimEye(SHIP, 1)),
    'the first frame after the release still stands by the battery',
  );
  let eye = leaving;
  for (let frame = 0; frame < 240; frame++) eye = camera.eye(HOME, null, SHIP, [], 1 / 60);
  assert.deepEqual(eye, HOME);
});

test('swinging the look across its bow carries the eye round in its own frame, never across its deck in a frame', () => {
  const camera = new AimCamera();
  for (let frame = 0; frame < 120; frame++) camera.eye(HOME, 1, SHIP, [], 1 / 60);
  const before = camera.eye(HOME, 1, SHIP, [], 1 / 60);
  const after = camera.eye(HOME, -1, SHIP, [], 1 / 60);
  assert.ok(gap(before, after) < 1, `it moved ${gap(before, after)} m in a frame`);
  let eye = after;
  for (let frame = 0; frame < 120; frame++) eye = camera.eye(HOME, -1, SHIP, [], 1 / 60);
  assert.ok(gap(eye, aimEye(SHIP, -1)) < 0.01);
});

test('the eased eye rides with it as it sails and turns: it is eased in its frame, not the world', () => {
  const camera = new AimCamera();
  for (let frame = 0; frame < 120; frame++) camera.eye(HOME, 1, SHIP, [], 1 / 60);
  const turned = { ...SHIP, x: SHIP.x + 3, heading: 0.3 };
  const eye = camera.eye(HOME, 1, turned, [], 1 / 60);
  assert.ok(gap(eye, aimEye(turned, 1)) < 0.01);
});

test('a ship close alongside stops the eye short of its side, never inside its hull', () => {
  // Heading north, starboard is east: a Brig lying 4 m off its starboard side, its rail higher than the eye.
  const alongside: AimHull = {
    x: SHIP.x + 2.8 + 3.5 + 2,
    y: SHIP.y,
    heading: 0,
    halfLength: 15,
    halfBeam: 3.5,
    bottom: -2,
    top: 8,
  };
  const camera = new AimCamera();
  let eye = HOME as readonly number[];
  for (let frame = 0; frame < 240; frame++) eye = camera.eye(HOME, 1, SHIP, [alongside], 1 / 60);
  const side = alongside.x - alongside.halfBeam;
  assert.ok((eye[0] ?? 0) <= side - AIM_CAM_CLEAR + 1e-6, `the eye stands at ${eye[0]}, its side at ${side}`);
  assert.ok((eye[0] ?? 0) > SHIP.x, 'and still out on its own starboard side');
  // One far off leaves the eye where it was.
  const far = new AimCamera();
  for (let frame = 0; frame < 240; frame++) eye = far.eye(HOME, 1, SHIP, [{ ...alongside, x: SHIP.x + 60 }], 1 / 60);
  assert.ok(gap(eye, aimEye(SHIP, 1)) < 0.01);
});

test('a segment enters a box padded by the clearance where it first meets it, and misses one beside it', () => {
  const box: AimHull = { x: 10, y: 0, heading: 0, halfLength: 5, halfBeam: 2, bottom: 0, top: 4 };
  const hit = segmentBoxEntry([0, 0, 2], [20, 0, 2], box, 1);
  assert.ok(hit !== null && near(hit, (10 - 2 - 1) / 20), `${hit}`);
  assert.equal(segmentBoxEntry([0, 20, 2], [20, 20, 2], box, 1), null);
  assert.equal(segmentBoxEntry([0, 0, 2], [5, 0, 2], box, 1), null, 'it stops short of the ship');
});
