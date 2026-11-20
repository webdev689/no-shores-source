import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHOP_FADE_S, chopBearing, chopFade, chopShare, chopWaves } from './waterView.ts';

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

test("the chop fades from the last bearing's to the new, and turns round where it stands when the wind goes back", () => {
  const settled = chopFade(null, 3, 100);
  assert.equal(chopShare(settled, 100), 1, 'the first bearing shows whole');
  const veered = chopFade(settled, 4, 200);
  assert.deepEqual([veered.bearing, veered.before, chopShare(veered, 200)], [4, 3, 0]);
  assert.equal(chopShare(veered, 200 + CHOP_FADE_S / 4), 0.25);
  // The wind slips back over the step a quarter of the way in: three quarters of the old chop still show, and go on.
  const back = chopFade(veered, 3, 200 + CHOP_FADE_S / 4);
  assert.deepEqual([back.bearing, back.before], [3, 4]);
  assert.ok(Math.abs(chopShare(back, 200 + CHOP_FADE_S / 4) - 0.75) < 1e-9);
  assert.equal(chopFade(back, 3, 300), back, 'the same bearing changes nothing');
  const third = chopFade(back, 5, 200 + CHOP_FADE_S / 2);
  assert.deepEqual([third.bearing, third.before], [5, 3], 'a third fades from the one that showed most');
});
