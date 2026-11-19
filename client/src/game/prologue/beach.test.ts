import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findBeach } from './beach.ts';

/** A round island 600 m across rising gently from its shore, with a cliff on its north side and a harbour east. */
const island = (x: number, y: number): number => {
  const out = Math.hypot(x, y);
  if (out > 300) return -5;
  const height = (300 - out) * 0.05;
  return y < -150 ? height + 40 : height;
};
const HARBOUR = [300, 0] as const;
const nowhere = () => false;

test('the beach found is low by the water, slopes gently, and faces inland toward the town', () => {
  const beach = findBeach(island, [0, 0], HARBOUR, nowhere, 900);
  assert.ok(beach);
  const height = island(beach.at[0], beach.at[1]);
  assert.ok(height >= 0.25 && height <= 2.8, `${height}`);
  assert.ok(island(beach.edge[0], beach.edge[1]) < 0, 'the edge is the water');
  const toTown = Math.atan2(-beach.at[0], beach.at[1]);
  assert.ok(Math.abs(Math.atan2(Math.sin(beach.inland - toTown), Math.cos(beach.inland - toTown))) < 0.1);
});

test('no beach under a cliff, by the harbour, on the city, or past the reach', () => {
  const beach = findBeach(island, [0, 0], HARBOUR, nowhere, 900);
  assert.ok(beach && beach.at[1] > -150, 'not under the north cliff');
  assert.ok(beach && Math.hypot(beach.at[0] - 300, beach.at[1]) >= 260, 'clear of the quays');
  assert.equal(findBeach(island, [0, 0], HARBOUR, () => true, 900), null, 'all of it the city');
  assert.equal(findBeach(island, [0, 0], HARBOUR, nowhere, 200), null, 'the sea is out of reach');
  assert.equal(findBeach(() => null, [0, 0], HARBOUR, nowhere, 900), null, 'off the charts');
});
