import assert from 'node:assert/strict';
import { test } from 'node:test';
import { closeUpData, groundUnder, shownExaggeration, toScreen, walkStep } from './closeUp.ts';

const patch = {
  left: 101_000,
  top: 202_000,
  step: 8,
  width: 5,
  height: 3,
  heights: Float32Array.of(10, 20, 30, 40, 50, 10, 20, 30, 40, 50, 10, 20, 30, 40, 50),
  water: new Float32Array(15),
  edges: new Float32Array(15),
  marks: new Uint8Array(15),
};

test('heights are true to scale close up and eased to the chosen exaggeration far off', () => {
  assert.equal(shownExaggeration(4, 1000), 1);
  assert.equal(shownExaggeration(4, 50_000), 4);
  const middle = shownExaggeration(4, 16_500);
  assert.ok(middle > 1 && middle < 4);
});

test('a patch sits in its window, and the ground reads between its samples along the drawn splines', () => {
  const data = closeUpData(patch, new Float32Array(30), { leftM: 100_000, topM: 200_000 });
  assert.deepEqual(data.corner, [1000, 2000], 'sample 0 at 1,000 m east and 2,000 m south of the window');
  assert.equal(data.step, 8);
  assert.equal(groundUnder(patch, 101_012, 202_004), 25, 'a straight slope stays straight between samples');
  assert.equal(groundUnder(patch, 99_000, 202_000), null);
});

test('the target lands at the middle of the screen', () => {
  const orbit = { targetX: 500, targetY: 500, targetZ: 0, yaw: 0, pitch: 0.5, distance: 100 };
  const centre = toScreen(orbit, { width: 800, height: 600 }, [500, 500, 0]);
  assert.ok(centre && Math.abs(centre.x - 400) < 0.01 && Math.abs(centre.y - 300) < 0.01, JSON.stringify(centre));
});

test('a walker goes where the camera looks, faster running, and stands still with no key held', () => {
  const lookingNorth = { targetX: 0, targetY: 0, targetZ: 0, yaw: 0, pitch: 0.1, distance: 4 };
  const walked = walkStep(lookingNorth, new Set(['w']), 1);
  assert.ok(Math.abs(walked.targetX) < 1e-9 && Math.abs(walked.targetY + 6) < 1e-9, 'north is -y');
  assert.ok(Math.abs(walkStep(lookingNorth, new Set(['d', 'shift']), 1).targetX - 40) < 1e-9, 'right is east');
  assert.deepEqual(walkStep(lookingNorth, new Set(), 1), lookingNorth);
});
