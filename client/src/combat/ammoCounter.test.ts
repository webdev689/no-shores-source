import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ammoWords } from './ammoCounter.ts';

test('the counter tells the shots left, says "No ammo" at none, and nothing while no Ranged weapon is drawn', () => {
  assert.deepEqual(ammoWords(24), { words: '24', empty: false, low: false });
  assert.deepEqual(ammoWords(0, 24), { words: 'No ammo', empty: true, low: false });
  assert.deepEqual(ammoWords(5, 24), { words: '5', empty: false, low: false }, 'more than a fifth left');
  assert.deepEqual(ammoWords(4, 24), { words: '4', empty: false, low: true }, 'a fifth or less: low');
  assert.equal(ammoWords(1)?.low, false, 'with no capacity known, never low');
  assert.equal(ammoWords(null), null);
  assert.equal(ammoWords(undefined), null);
});
