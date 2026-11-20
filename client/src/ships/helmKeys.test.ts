import assert from 'node:assert/strict';
import { test } from 'node:test';
import { helmOf, RUNG_WORDS } from './helmKeys.ts';

test('a press climbs or comes down one rung; a key held without a press climbs nothing', () => {
  assert.equal(helmOf(new Set(['w']), undefined).climb, 0);
  assert.equal(helmOf(new Set(), 'w').climb, 1);
  assert.equal(helmOf(new Set(), 'arrowup').climb, 1);
  assert.equal(helmOf(new Set(), 's').climb, -1);
  assert.equal(helmOf(new Set(), 'arrowdown').climb, -1);
  assert.equal(helmOf(new Set(), 'a').climb, 0);
});

test('A and D steer, together they cancel, and Shift pulls it sideways', () => {
  assert.equal(helmOf(new Set(['a']), undefined).steer, -1);
  assert.equal(helmOf(new Set(['arrowright']), undefined).steer, 1);
  assert.equal(helmOf(new Set(['a', 'd']), undefined).steer, 0);
  assert.equal(helmOf(new Set(['shift', 'd']), undefined).crab, true);
  assert.equal(helmOf(new Set(['d']), undefined).crab, false);
});

test('every rung has its words', () => {
  assert.deepEqual(
    [-1, 0, 1, 2].map((rung) => RUNG_WORDS[rung]),
    ['Oars: backing water.', 'Oars: at rest.', 'Oars: pulling ahead.', 'Sails set.'],
  );
});
