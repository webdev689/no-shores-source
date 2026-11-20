import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalRoom, nodeRoom } from './roomNames.ts';

test('a node has one room at each difficulty, by one spelling each', () => {
  assert.deepEqual(nodeRoom('tidewall'), { id: 'tidewall', seas: 0, dungeon: null });
  assert.deepEqual(nodeRoom('tidewall--elite'), { id: 'tidewall', seas: 1, dungeon: null });
  assert.deepEqual(nodeRoom('tidewall--abyss'), { id: 'tidewall', seas: 2, dungeon: null });
  assert.equal(nodeRoom('tidewall--normal'), null, 'Normal is the plain name');
  assert.equal(nodeRoom('tidewall--abyss--1'), null, 'no fresh copies');
  assert.equal(nodeRoom('tidewall--squall'), null);
  assert.equal(nodeRoom('--elite'), null);
  assert.equal(nodeRoom('tidewall--rough'), null, 'the old names open no second room at a difficulty');
  assert.equal(nodeRoom('tidewall--storm'), null);
});

test('a patrol’s dungeon has one room at each difficulty, named for its patrol and its number', () => {
  for (const [seas, spelled] of ['', '--elite', '--abyss'].entries())
    for (const dungeon of [0, 1, 2]) {
      const name = `saltgrass-downs${spelled}--dungeon-${dungeon}`;
      assert.deepEqual(nodeRoom(name), { id: 'saltgrass-downs', seas, dungeon });
    }
  for (const name of [
    'saltgrass-downs--dungeon-3',
    'saltgrass-downs--dungeon-01',
    'saltgrass-downs--dungeon-',
    'saltgrass-downs--dungeon',
    'saltgrass-downs--normal--dungeon-0',
    'saltgrass-downs--rough--dungeon-0',
    'saltgrass-downs--dungeon-0--elite',
    'saltgrass-downs--elite--dungeon-0--dungeon-1',
    'saltgrass-downs--dungeon-1--1',
    '--dungeon-0',
  ])
    assert.equal(nodeRoom(name), null, name);
});

test('a node called as a dungeon is named is still its own room, at every difficulty', () => {
  assert.deepEqual(nodeRoom('dungeon-0'), { id: 'dungeon-0', seas: 0, dungeon: null });
  assert.deepEqual(nodeRoom('dungeon-1--elite'), { id: 'dungeon-1', seas: 1, dungeon: null });
  assert.deepEqual(nodeRoom('dungeon-2--dungeon-0'), { id: 'dungeon-2', seas: 0, dungeon: 0 });
});

test('a page that still names the old tiers finds the room of the new name, and every other name is as it was', () => {
  for (const [old, now] of [
    ['node-x--rough', 'node-x--elite'],
    ['node-x--storm--dungeon-1', 'node-x--abyss--dungeon-1'],
  ]) {
    assert.equal(canonicalRoom(old), now);
    assert.deepEqual(nodeRoom(canonicalRoom(old).slice('node-'.length)), nodeRoom(now.slice('node-'.length)), old);
  }
  for (const name of [
    'node-x',
    'node-x--elite',
    'node-x--abyss--dungeon-1',
    'node-storm',
    'node-rough--dungeon-0',
    'sea',
  ])
    assert.equal(canonicalRoom(name), name, name);
  assert.equal(canonicalRoom('node-x--constructor'), 'node-x--constructor');
});
