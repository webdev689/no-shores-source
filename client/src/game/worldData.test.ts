import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { arrivalAt, ringMiddle, sitesOf, type WorldData } from './worldData.ts';

const saltmere = readFileSync(new URL('../../../content/world/land/continent-1.json', import.meta.url), 'utf8');

test("Saltmere's edits file holds Overlook and its ten nodes", () => {
  const { city, nodes } = sitesOf('continent-1', saltmere, []);
  assert.equal(city?.name, 'Overlook');
  assert.equal(city?.motif, 'beacon');
  assert.equal(nodes.length, 10);
  const kinds = nodes.map((node) => node.kind).sort();
  assert.deepEqual(kinds, [
    'boss',
    'dungeon',
    'dungeon',
    'mission',
    'mission',
    'mission',
    'mission',
    'patrol',
    'patrol',
    'patrol',
  ]);
  for (const node of nodes) assert.equal(node.continent, 'continent-1');
});

test("a ring's middle is the mean of its points", () => {
  assert.deepEqual(
    ringMiddle([
      [0, 0],
      [10, 0],
      [10, 20],
      [0, 20],
    ]),
    [5, 10],
  );
});

test('a player arrives at any node by its id, a social space by its city, and nowhere for an id the world lacks', () => {
  const { city, nodes } = sitesOf('continent-1', saltmere, []);
  const world: WorldData = { layoutText: '{}', continents: [], cities: city ? [city] : [], nodes };
  assert.deepEqual(arrivalAt(world, 'overlook-social'), {
    continent: 'continent-1',
    node: 'overlook-social',
    name: 'Overlook',
  });
  assert.deepEqual(arrivalAt(world, 'saltgrass-downs'), {
    continent: 'continent-1',
    node: 'saltgrass-downs',
    name: 'The Saltgrass Downs',
  });
  assert.equal(arrivalAt(world, 'nowhere'), null);
});

test('a ruined city’s social space is arrived at as its ruins; a port city’s by its name', () => {
  const world = {
    layoutText: '',
    continents: [],
    nodes: [],
    cities: [
      { id: 'overlook', name: 'Overlook', continent: 'continent-1', centre: [0, 0], motif: 'beacon' },
      { id: 'mistfall', name: 'Mistfall', continent: 'continent-6', centre: [0, 0], motif: 'stepped-temple' },
    ],
  } as unknown as WorldData;
  const ports = ['overlook', 'sunspire', 'rimeholt'];
  assert.equal(arrivalAt(world, 'mistfall-social', ports)?.name, 'Ruins of Mistfall');
  assert.equal(arrivalAt(world, 'overlook-social', ports)?.name, 'Overlook');
  assert.equal(arrivalAt(world, 'mistfall-social')?.name, 'Mistfall', 'by its name alone with no ports known');
});

test('every patrol area and mission is locked but those the open list names; other kinds never are', () => {
  const { nodes } = sitesOf('continent-1', saltmere, ['gullwing-vale', 'tidewall']);
  const locked = nodes.filter((node) => node.locked).map((node) => node.id);
  assert.deepEqual(locked.sort(), [
    'broken-causeway',
    'burned-mill',
    'driftwood-moors',
    'saltgrass-downs',
    'shrine-tides',
  ]);
});
