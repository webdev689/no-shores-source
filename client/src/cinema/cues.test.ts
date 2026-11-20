import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Cues, HoldToSkip } from './cues.ts';

test('each moment runs once, in time order, however the frames fall', () => {
  const ran: string[] = [];
  const cues = new Cues([
    [2, () => ran.push('b')],
    [0.5, () => ran.push('a')],
    [2, () => ran.push('c')],
  ]);
  cues.step(0.4);
  assert.deepEqual(ran, []);
  cues.step(3);
  cues.step(3.5);
  assert.deepEqual(ran, ['a', 'b', 'c']);
  assert.ok(cues.done);
});

test('finishing runs what is left, as a skip must', () => {
  const ran: number[] = [];
  const cues = new Cues([
    [1, () => ran.push(1)],
    [9, () => ran.push(9)],
  ]);
  cues.step(1);
  cues.finish();
  assert.deepEqual(ran, [1, 9]);
});

test('a skip fires only once held its whole time, and starts again when let go', () => {
  const skip = new HoldToSkip(1);
  assert.equal(skip.step(0.6, true), false);
  assert.equal(skip.step(0.1, false), false);
  assert.equal(skip.share, 0);
  skip.step(0.6, true);
  assert.equal(skip.step(0.5, true), true);
  assert.equal(skip.share, 1);
});
