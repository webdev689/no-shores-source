import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ammoWords } from './ammoCounter.ts';

test('the counter tells the shots left, says "No ammo" at none, and nothing while no Ranged weapon is drawn', () => {
  assert.deepEqual(ammoWords(24), { words: '24', empty: false });
  assert.deepEqual(ammoWords(0), { words: 'No ammo', empty: true });
  assert.equal(ammoWords(null), null);
  assert.equal(ammoWords(undefined), null);
});
