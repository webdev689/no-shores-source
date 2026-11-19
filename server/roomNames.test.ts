import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeRoom } from './roomNames.ts';

test('a node has one room at each sea, by one spelling each', () => {
  assert.deepEqual(nodeRoom('tidewall'), { id: 'tidewall', seas: 0 });
  assert.deepEqual(nodeRoom('tidewall--rough'), { id: 'tidewall', seas: 1 });
  assert.deepEqual(nodeRoom('tidewall--storm'), { id: 'tidewall', seas: 2 });
  assert.equal(nodeRoom('tidewall--calm'), null, 'calm is the plain name');
  assert.equal(nodeRoom('tidewall--storm--1'), null, 'no fresh copies');
  assert.equal(nodeRoom('tidewall--squall'), null);
  assert.equal(nodeRoom('--rough'), null);
});
