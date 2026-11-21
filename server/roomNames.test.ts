import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isleRoom, nodeRoom, seaRoom, seaRoomName } from './roomNames.ts';

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

test('the sea has one room at each difficulty: sea, sea--elite and sea--abyss', () => {
  assert.equal(seaRoom('sea'), 0);
  assert.equal(seaRoom('sea--elite'), 1);
  assert.equal(seaRoom('sea--abyss'), 2);
  assert.equal(seaRoom('sea--normal'), null, 'Normal is the plain name');
  assert.equal(seaRoom('sea--abyss--1'), null, 'no fresh copies');
  assert.equal(seaRoom('node-sea'), null);
  assert.deepEqual(
    [0, 1, 2].map((seas) => seaRoom(seaRoomName(seas))),
    [0, 1, 2],
    'each name reads back',
  );
});

test("an island's room is named by its number and its whole seed, one spelling each", () => {
  assert.deepEqual(isleRoom('5-00000000000000ff'), { id: 5, seed: '255', seas: 0 });
  assert.deepEqual(isleRoom('12-ffffffffffffffff'), { id: 12, seed: '18446744073709551615', seas: 0 });
  assert.equal(isleRoom('5-ff'), null, 'the seed is always 16 digits');
  assert.equal(isleRoom('05-00000000000000ff'), null, 'no leading zero');
  assert.equal(isleRoom('0-00000000000000ff'), null);
  assert.equal(isleRoom('5000000000-00000000000000ff'), null, 'past 32 bits');
  assert.equal(isleRoom('5-00000000000000FF'), null);
  assert.deepEqual(isleRoom('5-00000000000000ff--abyss'), { id: 5, seed: '255', seas: 2 }, "the abyss sea's island");
  assert.equal(isleRoom('5-00000000000000ff--normal'), null, 'Normal is the plain name');
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
