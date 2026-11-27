import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestRegion, regionHolds, regionsOf, regionWords } from './regions.ts';

const REGIONS = regionsOf(
  JSON.stringify([
    {
      island: 'continent-1',
      regions: [
        { name: 'The Beacon Shore', centre: [0, 0], anchorage: [0, -10], nodes: ['downs', 'mill'] },
        { name: 'The Weirlands', centre: [1_000, 0], anchorage: [1_000, -10], nodes: ['vale'] },
      ],
    },
  ]),
  [{ id: 'continent-1', outline: [] }],
);
const [SHORE, WEIRLANDS] = REGIONS as [(typeof REGIONS)[0], (typeof REGIONS)[0]];

test('a region keeps the nodes the table lists for it', () => {
  assert.deepEqual(
    REGIONS.map((region) => region.nodes),
    [['downs', 'mill'], ['vale']],
  );
});

test('a point lies in the region whose centre is nearest it; none with no regions', () => {
  assert.equal(nearestRegion(REGIONS, [400, 300]), SHORE);
  assert.equal(nearestRegion(REGIONS, [600, -900]), WEIRLANDS);
  assert.equal(nearestRegion([], [0, 0]), null);
});

test('a region holds the nodes it lists, and every node no region lists', () => {
  assert.equal(regionHolds(REGIONS, SHORE, 'downs'), true);
  assert.equal(regionHolds(REGIONS, SHORE, 'vale'), false);
  assert.equal(regionHolds(REGIONS, WEIRLANDS, 'vale'), true);
  assert.equal(regionHolds(REGIONS, WEIRLANDS, 'overlook-social'), true, 'listed by none');
});

test('a region named within a sentence', () => {
  assert.equal(regionWords('The Weirlands'), 'the Weirlands');
  assert.equal(regionWords('Saltmere'), 'Saltmere');
});
