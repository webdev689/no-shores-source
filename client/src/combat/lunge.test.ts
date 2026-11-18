import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lungeOf } from './lunge.ts';

test('a lunge drives in to the landing, holds, and settles back by the end; only drawn, so it starts and ends at 0', () => {
  const ahead = (elapsed: number, stroke = 3) => lungeOf(stroke, elapsed, 0.4, 1).ahead;
  assert.equal(ahead(0), 0);
  assert.equal(ahead(0.19), 0, 'not yet');
  assert.ok(ahead(0.3) > 0 && ahead(0.3) < ahead(0.4));
  assert.equal(ahead(0.4), 0.14, 'a sweep at its landing');
  assert.equal(ahead(0.44), 0.14, 'held');
  assert.ok(ahead(0.7) < 0.14 && ahead(0.7) > 0);
  assert.equal(ahead(1), 0, 'back by the end');
  assert.equal(ahead(0.4, 6), 0.32, 'a thrust drives furthest');
  assert.ok(Math.abs(lungeOf(1, 0.4, 0.4, 1).down - 0.03) < 1e-12, 'an overhead dips into the blow');
  assert.equal(lungeOf(6, 0.4, 0.4, 1, 0.5).ahead, 0.16, 'scaled');
});
