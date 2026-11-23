import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cast } from './kinds.ts';
import { asksFlora, plantWind } from './natureView.ts';

test('before the weather is read the plants sway in the breeze they were drawn in', () => {
  assert.deepEqual(plantWind(null), { way: [0.8, -0.6], bend: 1, gust: 0.3 });
});

test("the plants lean the weather's way, harder in a storm than in a breeze, and gust with it", () => {
  const breeze = plantWind({ wind: [0, 6], gust: 0.2 });
  assert.deepEqual(breeze.way, [0, 1]);
  assert.equal(breeze.bend, 1);
  assert.equal(breeze.gust, 0.2);
  const storm = plantWind({ wind: [-20, -15], gust: 0.9 });
  assert.deepEqual(storm.way, [-0.8, -0.6]);
  assert.ok(storm.bend > 1.9 && storm.bend <= 2.2, `${storm.bend}`);
  assert.equal(plantWind({ wind: [200, 0], gust: 1 }).bend, 2.2);
});

test('in a calm the plants barely stir, and keep a way to lean', () => {
  const calm = plantWind({ wind: [0, 0], gust: 0 });
  assert.equal(calm.bend, 0.1);
  assert.deepEqual(calm.way, [0.8, -0.6]);
});

test("a biome's flora that failed to come is asked for again after a wait; one with none is not", () => {
  const [cast, other] = [{} as Cast, {} as Cast];
  assert.ok(asksFlora(null, cast, 0), 'never asked');
  assert.ok(asksFlora({ cast: other, retryAt: null }, cast, 0), 'asked for another');
  assert.ok(!asksFlora({ cast, retryAt: null }, cast, 1e9), 'coming, come, or none to come');
  assert.ok(!asksFlora({ cast, retryAt: 10_000 }, cast, 9_999), 'failed: waits');
  assert.ok(asksFlora({ cast, retryAt: 10_000 }, cast, 10_000), 'then asks again');
});
