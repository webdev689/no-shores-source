import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groundUnder, patchData, patchHole, shownExaggeration, toScreen, walkStep } from './closeUp.ts';

const patch = {
  left: 101_000,
  top: 202_000,
  step: 8,
  width: 3,
  height: 3,
  heights: Float32Array.of(10, 20, 30, 10, 20, 30, 10, 20, 30),
  water: new Float32Array(9),
  marks: new Uint8Array(9),
};

test('heights are true to scale close up and eased to the chosen exaggeration far off', () => {
  assert.equal(shownExaggeration(4, 1000), 1);
  assert.equal(shownExaggeration(4, 50_000), 4);
  const middle = shownExaggeration(4, 16_500);
  assert.ok(middle > 1 && middle < 4);
});

test('a patch sits in its window, its samples at the vertices, and the ground reads between them', () => {
  const data = patchData(patch, { leftM: 100_000, topM: 200_000, ground: [0.2, 0.4, 0.6], snowM: 615 });
  assert.equal(data.originX, 996, 'sample 0 at 1,000 m east of the window, half a step back');
  assert.equal(data.originY, 1996);
  assert.deepEqual(patchHole(data), [1008, 2008, 1008, 2008]);
  assert.deepEqual([data.ground, data.snowM], [[0.2, 0.4, 0.6], 615], 'the close-up wears the landmass’s biome');
  assert.equal(groundUnder(patch, 101_004, 202_000), 15);
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
