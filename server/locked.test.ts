import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { lockedReason } from './locked.ts';

const openList = JSON.parse(
  readFileSync(new URL('../content/world/open.json', import.meta.url), 'utf8'),
) as readonly string[];

/** A node's file as the bake writes it, as far as the lock reads it. */
const nodeFile = (id: string, kind: string, name: string) => JSON.stringify({ id, kind, name, ring: [], spawns: [] });

test('a patrol area or mission the open list does not name turns every player away, and says why', () => {
  const open = ['saltgrass-downs'];
  assert.equal(lockedReason(nodeFile('burned-mill', 'mission', 'The Burned Mill'), open), 'The Burned Mill is locked');
  assert.equal(lockedReason(nodeFile('moorlands', 'patrol', 'The Moorlands'), open), 'The Moorlands is locked');
  assert.equal(lockedReason(nodeFile('saltgrass-downs', 'patrol', 'The Saltgrass Downs'), open), null);
});

test('social spaces, dungeons and world bosses are never locked', () => {
  for (const kind of ['social', 'dungeon', 'boss'])
    assert.equal(lockedReason(nodeFile('somewhere', kind, 'Somewhere'), []), null, kind);
});

test("by the repository's open list, Saltmere's three patrol areas take players and its missions turn them away", () => {
  for (const [id, name] of [
    ['saltgrass-downs', 'The Saltgrass Downs'],
    ['gullwing-vale', 'The Gullwing Vale'],
    ['driftwood-moors', 'The Driftwood Moors'],
  ] as const)
    assert.equal(lockedReason(nodeFile(id, 'patrol', name), openList), null, id);
  for (const [id, name] of [
    ['burned-mill', 'The Burned Mill'],
    ['broken-causeway', 'The Broken Causeway'],
    ['shrine-tides', 'Shrine of Tides'],
    ['tidewall', 'Tidewall'],
  ] as const)
    assert.equal(lockedReason(nodeFile(id, 'mission', name), openList), `${name} is locked`, id);
});
