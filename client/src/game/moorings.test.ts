import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOORED_SWELL, mooredPlaces } from './moorings.ts';

test('a moored ship lies at her place on the sea, her bow along her bearing, riding a swell no higher than its own', () => {
  const moorings = [
    [100, 200, 0.5],
    [130, 260, 0.5],
  ] as const;
  for (const time of [0, 1.3, 4.5, 60]) {
    const places = mooredPlaces(moorings, time);
    assert.equal(places.length, 2);
    places.forEach((place, index) => {
      assert.equal(place.x, moorings[index]?.[0]);
      assert.equal(place.y, moorings[index]?.[1]);
      assert.equal(place.heading, 0.5);
      assert.ok(Math.abs(place.z) <= MOORED_SWELL.heave + 1e-12);
      assert.ok(Math.abs(place.roll) <= MOORED_SWELL.roll + 1e-12);
    });
  }
  const [one, two] = mooredPlaces(moorings, 2);
  assert.notEqual(one?.z, two?.z, 'the two ride on beats of their own');
});
