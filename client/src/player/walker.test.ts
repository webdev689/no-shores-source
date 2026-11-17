import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainDress } from './dressing.ts';
import { shownDress, strokesAfter } from './walker.ts';

test('a stroke is counted when a swing begins, and again when the next begins within a frame', () => {
  assert.equal(strokesAfter(0, null, null), 0, 'no swing');
  assert.equal(strokesAfter(0, null, 0.1), 1, 'a swing begins');
  assert.equal(strokesAfter(1, 0.1, 0.4), 1, 'the same swing goes on');
  assert.equal(strokesAfter(1, 0.9, 0.05), 2, 'the next began as the last ended');
});

test('on a wall or a ledge the weapon is worn, not held', () => {
  const dress = plainDress('human', 0.3);
  const drawn = { ...dress, outfit: { ...dress.outfit, drawn: true } };
  assert.equal(shownDress(drawn, true).outfit.drawn, true);
  assert.equal(shownDress(drawn, false).outfit.drawn, false);
  assert.equal(shownDress(drawn, true), drawn, 'held hands show the dress as it is');
});
