import assert from 'node:assert/strict';
import { test } from 'node:test';
import { finished, stepWithin } from './steps.ts';

/** Ten steps that each take a millisecond on `clock`, making their count. */
function* counting(clock: { now: number }): Generator<void, number> {
  for (let step = 0; step < 10; step++) {
    clock.now += 1;
    yield;
  }
  return 10;
}

test('steps run through in one go make what they make', () => {
  assert.equal(finished(counting({ now: 0 })), 10);
});

test('steps taken within a budget stop once it is spent, and carry on there the next time', () => {
  const clock = { now: 0 };
  const steps = counting(clock);
  assert.equal(
    stepWithin(steps, 3, () => clock.now),
    null,
  );
  assert.equal(clock.now, 3, 'three steps of a millisecond in a budget of three');
  assert.equal(
    stepWithin(steps, 0, () => clock.now),
    null,
  );
  assert.equal(clock.now, 4, 'a step at the least, however small the budget');
  assert.deepEqual(
    stepWithin(steps, Infinity, () => clock.now),
    { made: 10 },
  );
  assert.equal(clock.now, 10);
});
