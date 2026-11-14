import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groundUnder, patchData, patchHole, shownExaggeration, toScreen } from './closeUp.ts';

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
  const data = patchData(patch, 100_000, 200_000);
  assert.equal(data.originX, 996, 'sample 0 at 1,000 m east of the window, half a step back');
  assert.equal(data.originY, 1996);
  assert.deepEqual(patchHole(data), [1008, 2008, 1008, 2008]);
  assert.equal(groundUnder(patch, 101_004, 202_000), 15);
  assert.equal(groundUnder(patch, 99_000, 202_000), null);
});

test('the target lands at the middle of the screen', () => {
  const orbit = { targetX: 500, targetY: 500, targetZ: 0, yaw: 0, pitch: 0.5, distance: 100 };
  const centre = toScreen(orbit, { width: 800, height: 600 }, [500, 500, 0]);
  assert.ok(centre && Math.abs(centre.x - 400) < 0.01 && Math.abs(centre.y - 300) < 0.01, JSON.stringify(centre));
});
