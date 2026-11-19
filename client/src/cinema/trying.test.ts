import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askedOf, openSeaNear } from './trying.ts';

test('the address names what to try, and nothing it does not know', () => {
  const none = { weather: null, birds: false, flames: false, sea: false, strike: false };
  assert.deepEqual(askedOf('?weather=storm&birds=1'), { ...none, weather: 'storm', birds: true });
  assert.deepEqual(askedOf('?weather=hail&flames=1&shot=sea'), { ...none, flames: true, sea: true });
  assert.equal(askedOf('?weather=deep').sea, true);
  assert.equal(askedOf('?weather=storm&strike=1').strike, true);
});

test('open sea is found going out from the land, and none where there is none', () => {
  const coast = (x: number) => (x > 300 ? -20 : 5);
  const found = openSeaNear([0, 0], (x) => coast(x));
  assert.ok(found && found[0] > 300 && Math.hypot(...found) <= 350, `${found}`);
  assert.equal(
    openSeaNear([0, 0], () => 3),
    null,
  );
});
