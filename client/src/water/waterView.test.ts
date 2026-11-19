import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chopBearing, chopWaves } from './waterView.ts';

test('the chop lies along the local wind, to the nearest of sixteen bearings', () => {
  assert.equal(chopBearing([5, 0]), 0, 'east');
  assert.equal(chopBearing([0, 5]), 4, 'south');
  assert.equal(chopBearing([-5, 0.1]), 8, 'west');
  assert.equal(chopBearing([0, -5]), 12, 'north');
  assert.equal(chopBearing([Number.NaN, 1]), 0, 'no wind read: east, never a broken chop');
  const [eastX = 0, eastY = 0] = chopWaves(0);
  const [southX = 0, southY = 0] = chopWaves(4);
  assert.ok(Math.abs(eastX) > Math.abs(eastY) && Math.abs(southY) > Math.abs(southX), 'the first wave runs downwind');
});
