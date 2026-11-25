import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Cast } from './kinds.ts';
import { GUST_PER_M } from './natureShader.ts';
import { asksFlora, Gusts, plantWind } from './natureView.ts';

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

test('a turn of the wind far from the world corner barely moves the gusts by the eye', () => {
  // The weather's wind turns a tenth of a degree a second in a light breeze; reckoned from the world's corner, that
  // swung the gusts at 1,500 km some 90 radians, about fifteen gusts a second.
  const gusts = new Gusts();
  const eye = [1_500_000, 2_200_000] as const;
  const turned = (degrees: number) => {
    const angle = (degrees * Math.PI) / 180;
    return [Math.cos(angle), Math.sin(angle)] as const;
  };
  const before = gusts.phaseAt([eye[0] + 40, eye[1] - 30], turned(30), eye);
  const after = gusts.phaseAt([eye[0] + 40, eye[1] - 30], turned(30.1), eye);
  assert.ok(Math.abs(after - before) < 0.01, `the gusts moved ${Math.abs(after - before)} radians`);
});

test('the gusts stay where they are on the ground as the eye moves, and every view reads the same', () => {
  const gusts = new Gusts();
  const way = [0.6, 0.8] as const;
  const plant = [900_000, 400_000] as const;
  const first = gusts.phaseAt(plant, way, [899_950, 400_020]);
  const walked = gusts.phaseAt(plant, way, [899_990, 399_960]);
  assert.ok(Math.abs(Math.sin(walked - first)) < 1e-9, 'one plant, the same gust, wherever the eye stands');
  assert.equal(
    gusts.phaseAt(plant, way, [899_990, 399_960]),
    walked,
    'a second view in the frame reads the same phase',
  );
  const downwind = gusts.phaseAt([plant[0] + way[0] * 10, plant[1] + way[1] * 10], way, [899_990, 399_960]);
  assert.ok(Math.abs(Math.sin(downwind - walked - 10 * GUST_PER_M)) < 1e-9, 'ten metres downwind, ten metres on');
});

test("a biome's flora that failed to come is asked for again after a wait; one with none is not", () => {
  const [cast, other] = [{} as Cast, {} as Cast];
  assert.ok(asksFlora(null, cast, 0), 'never asked');
  assert.ok(asksFlora({ cast: other, retryAt: null }, cast, 0), 'asked for another');
  assert.ok(!asksFlora({ cast, retryAt: null }, cast, 1e9), 'coming, come, or none to come');
  assert.ok(!asksFlora({ cast, retryAt: 10_000 }, cast, 9_999), 'failed: waits');
  assert.ok(asksFlora({ cast, retryAt: 10_000 }, cast, 10_000), 'then asks again');
});
