import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampLevel, glided, nextGapS, seededRandom, thunderShape } from './ambienceShapes.ts';

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

test('thunder comes later and softer the farther it is, and only a near strike cracks', () => {
  const near = thunderShape(0.3);
  const far = thunderShape(5);
  assert.ok(Math.abs(far.delayS - 5 / 0.343) < 1e-9);
  assert.ok(near.delayS < 1);
  assert.equal(near.crack, true);
  assert.equal(far.crack, false);
  assert.ok(near.gain > far.gain);
  assert.deepEqual(thunderShape(-2), thunderShape(0));
});

test('spot sounds come by a seeded clock, at gaps that average their mean', () => {
  const first = seededRandom(7);
  const second = seededRandom(7);
  for (let draw = 0; draw < 10; draw++) assert.equal(first(), second());
  assert.ok(nextGapS(4, 0.2) < nextGapS(4, 0.8));
  assert.ok(Number.isFinite(nextGapS(4, 1)));
  const random = seededRandom(3);
  let total = 0;
  for (let draw = 0; draw < 4000; draw++) total += nextGapS(4, random());
  assert.ok(Math.abs(total / 4000 - 4) < 0.3, 'the gaps average their mean');
});
