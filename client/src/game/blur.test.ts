import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLUR_REACH_MOST, blurReach } from './blur.ts';

test('a blur takes in three deviations each side, so a waking eye at 9 px on a doubled page reaches 54', () => {
  assert.equal(blurReach(1), 3);
  assert.equal(blurReach(18), 54);
  assert.equal(blurReach(0.6), 2);
  assert.equal(blurReach(1000), BLUR_REACH_MOST);
});
