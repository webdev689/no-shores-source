import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WorldData } from './worldData.ts';
import { OFF_COAST, offCoast, worldShown } from './worldShown.ts';

// Two square islands 200 km a side, the first's port's city on its west coast and a node 50 km inland, the second
// with a node of its own.
const square = (west: number) =>
  [
    [west, 1_000_000],
    [west + 200_000, 1_000_000],
    [west + 200_000, 1_200_000],
    [west, 1_200_000],
  ] as const;
const node = (id: string, continent: string, centre: readonly [number, number]) => ({
  id,
  kind: 'dungeon' as const,
  name: id,
  continent,
  ring: [],
  spawns: [],
  centre,
});
const world: WorldData = {
  layoutText: '',
  continents: [
    { id: 'isle', outline: square(1_000_000), climate: null, editsText: null },
    { id: 'far', outline: square(3_000_000), climate: null, editsText: null },
  ],
  cities: [{ id: 'port', name: 'Port', motif: 'beacon', continent: 'isle', centre: [1_000_700, 1_100_000] }],
  nodes: [node('deep', 'isle', [1_050_000, 1_100_000]), node('away', 'far', [3_100_000, 1_150_000])],
};

test('the sea map shows every island, port and node from the first, wherever the ship has sailed', () => {
  const shown = worldShown(world);
  assert.deepEqual(
    shown.places.map((place) => place.id),
    ['port-port', 'deep', 'away'],
  );
  assert.equal(shown.knownIslands, 0b11, 'both islands');
});

test('a node and a port are sailed for just off their island’s coast nearest them, never on it', () => {
  const { places } = worldShown(world);
  // The sea room judges a course by the outline, and refuses one that ends on it.
  assert.deepEqual(places.find((place) => place.id === 'deep')?.sail, [1_000_000 - OFF_COAST.clearM, 1_100_000]);
  assert.deepEqual(places.find((place) => place.id === 'away')?.sail, [3_100_000, 1_200_000 + OFF_COAST.clearM]);
  assert.deepEqual(places.find((place) => place.id === 'port-port')?.sail, [1_000_000 - OFF_COAST.clearM, 1_100_000]);
});

test('a place standing off its island is sailed for out from the island past it, as clear of its coast', () => {
  const ring = square(1_000_000);
  assert.deepEqual(offCoast([990_000, 1_100_000], ring), [1_000_000 - OFF_COAST.clearM, 1_100_000], 'off the west');
  const islet: [number, number][] = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];
  assert.deepEqual(offCoast([50, 40], islet), [50, -OFF_COAST.clearM], 'an islet a hundred metres across');
});
