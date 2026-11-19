import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  brownNoise,
  clampLevel,
  crackle,
  glided,
  gullCry,
  hit,
  nextGapS,
  seamlessLoop,
  seededRandom,
  thunderShape,
} from './ambienceShapes.ts';

test('levels are clamped to 0 to 1, and nonsense is silence', () => {
  assert.equal(clampLevel(-0.5), 0);
  assert.equal(clampLevel(1.7), 1);
  assert.equal(clampLevel(0.25), 0.25);
  assert.equal(clampLevel(Number.NaN), 0);
});

test('a glide starts where it was, ends on its level, and never overshoots', () => {
  assert.equal(glided(0.2, 0.8, 0, 2), 0.2);
  assert.equal(glided(0.2, 0.8, 2, 2), 0.8);
  assert.equal(glided(0.2, 0.8, 5, 2), 0.8);
  assert.ok(Math.abs(glided(0, 1, 1, 2) - 0.5) < 1e-9);
  let last = 0;
  for (let step = 0; step <= 20; step++) {
    const value = glided(0, 1, step / 10, 2);
    assert.ok(value >= last && value <= 1);
    last = value;
  }
  assert.equal(glided(0.3, 0.9, 0, 0), 0.9, 'no glide time jumps straight there');
});

test('thunder comes later and duller the farther it is', () => {
  const near = thunderShape(0.3);
  const far = thunderShape(5);
  assert.ok(Math.abs(far.delayS - 5 / 0.343) < 1e-9);
  assert.ok(near.delayS < 1);
  assert.ok(near.brightnessHz > 4000, 'a near strike tears');
  assert.ok(far.brightnessHz < 400, 'a far one only rolls');
  assert.equal(near.crack, 1);
  assert.equal(far.crack, 0);
  assert.ok(near.gain > far.gain);
  assert.ok(far.rollS > near.rollS);
  assert.deepEqual(thunderShape(-2), thunderShape(0));
});

test('spot sounds come by a seeded clock, more often the louder their bed', () => {
  const first = seededRandom(7);
  const second = seededRandom(7);
  for (let draw = 0; draw < 10; draw++) assert.equal(first(), second());
  assert.equal(nextGapS(4, 0, 0.5), Number.POSITIVE_INFINITY);
  assert.ok(nextGapS(4, 1, 0.5) < nextGapS(4, 0.25, 0.5));
  const random = seededRandom(3);
  let total = 0;
  for (let draw = 0; draw < 4000; draw++) total += nextGapS(4, 1, random());
  assert.ok(Math.abs(total / 4000 - 4) < 0.3, 'the gaps average their mean');
});

test('an envelope rises from silence to its peak and falls back to silence', () => {
  const points = hit(0.01, 1, 0.8);
  assert.deepEqual(points[0], [0, 0]);
  assert.deepEqual(points[1], [0.01, 0.8]);
  assert.deepEqual(points.at(-1), [1.01, 0]);
  for (let index = 2; index < points.length; index++) {
    const [time, value] = points[index] ?? [0, 0];
    const [lastTime, lastValue] = points[index - 1] ?? [0, 0];
    assert.ok(time > lastTime && value < lastValue);
  }
});

test('a looped buffer meets itself without a step', () => {
  const ramp = Float32Array.from({ length: 1000 }, (unused, index) => index);
  const loop = seamlessLoop(ramp, 100);
  assert.equal(loop.length, 900);
  assert.ok(Math.abs((loop[0] ?? 0) - (loop.at(-1) ?? 0)) <= 1.01);
  const brown = seamlessLoop(brownNoise(48000, seededRandom(1)), 4800);
  const steps = brown.slice(1).map((value, index) => Math.abs(value - (brown[index] ?? 0)));
  const largest = Math.max(...steps);
  assert.ok(Math.abs((brown[0] ?? 0) - (brown.at(-1) ?? 0)) <= largest);
});

test('noise is levelled to a peak of 1 and crackle is mostly quiet', () => {
  const brown = brownNoise(10000, seededRandom(2));
  assert.ok(Math.abs(Math.max(...brown.map(Math.abs)) - 1) < 1e-6);
  const fire = crackle(48000, 48000, seededRandom(4), 30);
  const loud = fire.filter((value) => Math.abs(value) > 0.05).length;
  assert.ok(loud > 0 && loud < fire.length / 4);
});

test('a gull cries in a few rising and falling calls, nearer or farther', () => {
  const cry = gullCry(seededRandom(9));
  assert.ok(cry.calls.length >= 2 && cry.calls.length <= 5);
  assert.ok(cry.distance >= 0.2 && cry.distance <= 1);
  for (const call of cry.calls) assert.ok(call.peakHz > call.fromHz && call.peakHz > call.toHz);
  for (let index = 1; index < cry.calls.length; index++) {
    const before = cry.calls[index - 1];
    const call = cry.calls[index];
    assert.ok(before && call && call.startS >= before.startS + before.durationS);
  }
});
