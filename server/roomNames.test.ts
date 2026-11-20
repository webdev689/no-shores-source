import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isleRoom, nodeRoom } from './roomNames.ts';

test('a node has one room at each difficulty, by one spelling each', () => {
  assert.deepEqual(nodeRoom('tidewall'), { id: 'tidewall', seas: 0 });
  assert.deepEqual(nodeRoom('tidewall--elite'), { id: 'tidewall', seas: 1 });
  assert.deepEqual(nodeRoom('tidewall--abyss'), { id: 'tidewall', seas: 2 });
  assert.equal(nodeRoom('tidewall--normal'), null, 'Normal is the plain name');
  assert.equal(nodeRoom('tidewall--abyss--1'), null, 'no fresh copies');
  assert.equal(nodeRoom('tidewall--squall'), null);
  assert.equal(nodeRoom('--elite'), null);
  assert.equal(nodeRoom('tidewall--rough'), null, 'the old names open no second room at a difficulty');
  assert.equal(nodeRoom('tidewall--storm'), null);
});

test("an island's room is named by its number and its whole seed, one spelling each", () => {
  assert.deepEqual(isleRoom('5-00000000000000ff'), { id: 5, seed: '255' });
  assert.deepEqual(isleRoom('12-ffffffffffffffff'), { id: 12, seed: '18446744073709551615' });
  assert.equal(isleRoom('5-ff'), null, 'the seed is always 16 digits');
  assert.equal(isleRoom('05-00000000000000ff'), null, 'no leading zero');
  assert.equal(isleRoom('0-00000000000000ff'), null);
  assert.equal(isleRoom('5000000000-00000000000000ff'), null, 'past 32 bits');
  assert.equal(isleRoom('5-00000000000000FF'), null);
});
