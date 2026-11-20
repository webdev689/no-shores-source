import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeRoom } from './roomNames.ts';

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
