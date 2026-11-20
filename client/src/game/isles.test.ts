import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planRead } from './isles.ts';

const plan = {
  reach: 80,
  landing: 1,
  anchorage: [0, -125],
  spawns: [[0, -60]],
  facing: Math.PI,
  ring: [
    [0, -90],
    [90, 0],
    [0, 90],
  ],
  door: { at: [10, -40], facing: 0, style: 'caverns' },
  wrecks: [[20, -50, 1]],
  blocks: [[0, 0, 1, 1, 3]],
};

test("an island's plan is read whole, or refused where the page could not stand on it", () => {
  assert.equal(planRead(JSON.stringify(plan))?.reach, 80);
  assert.equal(planRead(JSON.stringify({ ...plan, spawns: [] })), null, 'nowhere to land');
  assert.equal(planRead(JSON.stringify({ ...plan, ring: [[0, 0]] })), null, 'no section');
  assert.equal(planRead(JSON.stringify({ ...plan, blocks: [[0, 0, 1]] })), null, 'a block of three numbers');
  assert.equal(planRead(JSON.stringify({ ...plan, anchorage: [0, null] })), null);
});
