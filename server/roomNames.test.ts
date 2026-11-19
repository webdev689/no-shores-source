import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeRoom } from './roomNames.ts';

test('a node has one room at each sea, by one spelling each', () => {
  assert.deepEqual(nodeRoom('tidewall'), { id: 'tidewall', seas: 0, dungeon: null });
  assert.deepEqual(nodeRoom('tidewall--rough'), { id: 'tidewall', seas: 1, dungeon: null });
  assert.deepEqual(nodeRoom('tidewall--storm'), { id: 'tidewall', seas: 2, dungeon: null });
  assert.equal(nodeRoom('tidewall--calm'), null, 'calm is the plain name');
  assert.equal(nodeRoom('tidewall--storm--1'), null, 'no fresh copies');
  assert.equal(nodeRoom('tidewall--squall'), null);
  assert.equal(nodeRoom('--rough'), null);
});

test('a patrol’s dungeon has one room at each sea, named for its patrol and its number', () => {
  for (const [seas, spelled] of ['', '--rough', '--storm'].entries())
    for (const dungeon of [0, 1, 2]) {
      const name = `saltgrass-downs${spelled}--dungeon-${dungeon}`;
      assert.deepEqual(nodeRoom(name), { id: 'saltgrass-downs', seas, dungeon });
    }
  for (const name of [
    'saltgrass-downs--dungeon-3',
    'saltgrass-downs--dungeon-01',
    'saltgrass-downs--dungeon-',
    'saltgrass-downs--dungeon',
    'saltgrass-downs--calm--dungeon-0',
    'saltgrass-downs--dungeon-0--rough',
    'saltgrass-downs--rough--dungeon-0--dungeon-1',
    'saltgrass-downs--dungeon-1--1',
    '--dungeon-0',
  ])
    assert.equal(nodeRoom(name), null, name);
});
