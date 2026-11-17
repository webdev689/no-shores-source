import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHART_CELL_M, CHART_COLUMNS, emptyDiscovery } from '../overworld/discovery.ts';
import { Discovered } from './discovered.ts';
import type { WorldData } from './worldData.ts';

// One square island 200 km a side, from 1,000 to 1,200 km east and south, its port's city on its west coast and a
// node 50 km inland.
const outline = [
  [1_000_000, 1_000_000],
  [1_200_000, 1_000_000],
  [1_200_000, 1_200_000],
  [1_000_000, 1_200_000],
] as const;
const world: WorldData = {
  layoutText: '',
  continents: [{ id: 'isle', outline, climate: null, editsText: null }],
  cities: [{ id: 'port', name: 'Port', motif: 'beacon', continent: 'isle', centre: [1_000_700, 1_100_000] }],
  nodes: [
    {
      id: 'deep',
      kind: 'dungeon',
      name: 'Deep',
      continent: 'isle',
      ring: [],
      spawns: [],
      centre: [1_050_000, 1_100_000],
    },
  ],
};
const charted = (discovered: Discovered, point: readonly [number, number]) =>
  discovered.discovery.charted[
    Math.floor(point[1] / CHART_CELL_M) * CHART_COLUMNS + Math.floor(point[0] / CHART_CELL_M)
  ] === 1;

test('arriving charts the home waters as well as knowing the island, its port and the place', () => {
  const discovered = new Discovered(world, emptyDiscovery());
  discovered.arrived('isle', 'deep');
  assert.ok(discovered.discovery.islands.has('isle') && discovered.discovery.ports.has('port'));
  assert.ok(discovered.discovery.nodes.has('deep'));
  assert.ok(charted(discovered, [1_000_700, 1_100_000]), "the waters round the island's city");
  assert.ok(discovered.changed);
});

test('every lookout charts the sea round the ship, whatever is still to be kept', () => {
  const discovered = new Discovered(world, emptyDiscovery());
  discovered.lookout([300_000, 300_000]);
  assert.ok(discovered.changed);
  discovered.lookout([600_000, 300_000]);
  assert.ok(charted(discovered, [300_000, 300_000]) && charted(discovered, [600_000, 300_000]));
});

test('an island is sighted on the same lookout that charts new sea, and its port once near it', () => {
  const discovered = new Discovered(world, emptyDiscovery());
  discovered.lookout([500_000, 500_000]);
  discovered.lookout([970_000, 1_100_000]);
  assert.ok(discovered.discovery.islands.has('isle'), 'its coast 30 km off');
  assert.ok(discovered.discovery.ports.has('port'), 'its city 30 km off');
  assert.equal(discovered.knownIslands, 1);
});

test('a node is sailed for at its island’s coast nearest it; a port at its city', () => {
  const discovered = new Discovered(world, emptyDiscovery());
  discovered.arrived('isle', 'deep');
  const places = discovered.places;
  assert.deepEqual(places.find((place) => place.id === 'deep')?.sail, [1_000_000, 1_100_000]);
  assert.deepEqual(places.find((place) => place.id === 'port-port')?.sail, [1_000_700, 1_100_000]);
});
