import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mass } from '../models/buildingPlan.ts';
import { brokenMass, buildingRuin } from './ruins.ts';

const HOUSE: Mass = {
  west: -4,
  east: 4,
  south: -3,
  north: 3,
  base: 0,
  eaves: 8,
  ridge: 11,
  roof: 'gable',
  ridgeAlong: 'x',
};

test('a ruin breaks a building by its place alone: one in four fallen, the rest at 35 to 75 % of its height', () => {
  let fallen = 0;
  const count = 2000;
  for (let k = 0; k < count; k++) {
    const [east, south] = [480_000 + k * 37.31, 2_270_000 + k * 11.7];
    const ruin = buildingRuin(east, south, HOUSE);
    assert.deepEqual(ruin, buildingRuin(east, south, HOUSE), 'the same every time');
    if (ruin.fallen) fallen++;
    else assert.ok(ruin.cut >= 0.35 * 11 - 1e-9 && ruin.cut <= Math.min(0.75 * 11, 8) + 1e-9, `${ruin.cut}`);
  }
  assert.ok(Math.abs(fallen / count - 0.25) < 0.03, `${fallen} of ${count} fallen`);
});

test('a broken mass ends at the break, roofless; one wholly above it is gone', () => {
  assert.deepEqual(brokenMass(HOUSE, 5), { ...HOUSE, eaves: 5, ridge: 5, roof: 'flat' });
  assert.deepEqual(brokenMass(HOUSE, 9), { ...HOUSE, eaves: 8, ridge: 8, roof: 'flat' });
  assert.equal(brokenMass({ ...HOUSE, base: 6 }, 5), null);
});
