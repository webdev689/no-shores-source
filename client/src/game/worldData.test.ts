import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ringMiddle, sitesOf } from './worldData.ts';

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
