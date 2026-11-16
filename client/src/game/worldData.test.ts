import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { arrivalAt, ringMiddle, sitesOf, type WorldData } from './worldData.ts';

const saltmere = readFileSync(new URL('../../../content/world/land/continent-1.json', import.meta.url), 'utf8');

test("Saltmere's edits file holds Overlook and its ten nodes", () => {
  const { city, nodes } = sitesOf('continent-1', saltmere);
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
  const { city, nodes } = sitesOf('continent-1', saltmere);
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
