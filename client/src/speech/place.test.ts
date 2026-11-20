import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BARK_HOLD_S, FADE_S, GAP_PX, barkOpacity, overheadPlace, underTheTop } from './place.ts';

test('an overhead stands centred over the head point, its foot a gap above it', () => {
  assert.deepEqual(overheadPlace([500, 400], [21, 45]), [490, 400 - GAP_PX - 45]);
  assert.deepEqual(overheadPlace([500.6, 400.2], [20, 10]), [491, 400 - GAP_PX - 10], 'on whole pixels');
});

test('a bark stands while typed, holds, then fades and is gone', () => {
  assert.equal(barkOpacity(false, 5), 1, 'still typing');
  assert.equal(barkOpacity(true, BARK_HOLD_S - 0.01), 1);
  assert.ok(barkOpacity(true, BARK_HOLD_S + FADE_S / 2) < 1);
  assert.equal(barkOpacity(true, BARK_HOLD_S + FADE_S), 0);
});

test('words over a head near the edges stay whole on the view: moved in from a side, and down from the top', () => {
  assert.deepEqual(overheadPlace([10, 400], [120, 22], 1600), [0, 400 - GAP_PX - 22], 'in from the left edge');
  assert.deepEqual(overheadPlace([1595, 400], [120, 22], 1600), [1480, 400 - GAP_PX - 22], 'in from the right');
  const head = underTheTop([800, 30], 98);
  assert.deepEqual(head, [800, 98], 'down just far enough for what stands over it');
  const [, top] = overheadPlace(head, [120, 22], 1600);
  assert.ok(top >= 0, 'the highest word is on the view');
  assert.deepEqual(underTheTop([800, 400], 98), [800, 400], 'a head lower down is not moved');
});
