import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ammoNode, ammoWords } from './ammoCounter.ts';

test('the counter tells the shots left, says "No ammo" at none, and nothing while no Ranged weapon is drawn', () => {
  assert.deepEqual(ammoWords(24), { words: '24', empty: false, low: false });
  assert.deepEqual(ammoWords(0, 24), { words: 'No ammo', empty: true, low: false });
  assert.deepEqual(ammoWords(5, 24), { words: '5', empty: false, low: false }, 'more than a fifth left');
  assert.deepEqual(ammoWords(4, 24), { words: '4', empty: false, low: true }, 'a fifth or less: low');
  assert.equal(ammoWords(1)?.low, false, 'with no capacity known, never low');
  assert.equal(ammoWords(null), null);
  assert.equal(ammoWords(undefined), null);
});

test('the counter stands beside the crosshair on the face’s grid, few in brass and none in the loss colour', () => {
  assert.equal(ammoNode(null), null);
  const colour = (ammo: number) => ammoNode(ammo, 24)?.text?.colour;
  assert.deepEqual([colour(18), colour(4), colour(0)], ['#f2f2f2', '#f1c04f', '#e8968a']);
  assert.deepEqual(ammoNode(18)?.float, { to: 'screen', at: [0.5, 0.5], x: 22, y: 11, z: 1 });
  assert.equal(ammoNode(18)?.text?.size, 2);
});
