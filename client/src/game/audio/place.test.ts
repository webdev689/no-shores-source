import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CLIMATES, placeOf } from './place.ts';

const world = {
  continents: CLIMATES.map((climate, index) => ({ id: `continent-${index + 1}`, climate })),
};

test('a node sounds as its continent climate, the social space as itself, and no node as the sea', () => {
  assert.deepEqual(placeOf(world, { kind: 'patrol', continent: 'continent-9' }), {
    kind: 'island',
    climate: 'tundra',
    node: 'patrol',
  });
  assert.deepEqual(placeOf(world, { kind: 'social', continent: 'continent-1' }), {
    kind: 'social',
    climate: 'temperate-coast',
  });
  assert.deepEqual(placeOf(world, null), { kind: 'sea' });
});

test('a continent with no climate, or an unknown one, sounds as the temperate coast', () => {
  const odd = { continents: [{ id: 'continent-x', climate: null }] };
  assert.deepEqual(placeOf(odd, { kind: 'boss', continent: 'continent-x' }), {
    kind: 'island',
    climate: 'temperate-coast',
    node: 'boss',
  });
});
