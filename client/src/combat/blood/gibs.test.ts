import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GIB_COUNT, GIB_LIFE, type Gib, gibStep, throwGibs } from './gibs.ts';

const fly = (gib: Gib, frame: number, seconds: number): number => {
  let highest = gib.position[2];
  for (let t = 0; t < seconds - 1e-9; t += frame) {
    const step = gibStep(gib, frame);
    if (step) gib.position = [...step.to];
    highest = Math.max(highest, gib.position[2]);
  }
  return highest;
};

test('a body comes apart in ten chunks, each thrown upward', () => {
  const gibs = throwGibs([0, 0, 1], Math.random);
  assert.equal(gibs.length, GIB_COUNT);
  for (const gib of gibs) assert.ok(gib.velocity[2] >= 5 && gib.velocity[2] <= 15);
});

test("a chunk's arc is the same at any frame rate", () => {
  const [fast] = throwGibs([0, 0, 0], () => 0.5);
  const [slow] = throwGibs([0, 0, 0], () => 0.5);
  if (!fast || !slow) throw new Error('no chunks');
  const peakFast = fly(fast, 1 / 60, 1);
  const peakSlow = fly(slow, 1 / 10, 1);
  assert.ok(Math.abs(peakFast - peakSlow) < 0.05, `${peakFast} against ${peakSlow}`);
  assert.ok(Math.abs(fast.position[2] - slow.position[2]) < 0.2);
});

test('a chunk falls at three times gravity and freezes after four seconds', () => {
  const [gib] = throwGibs([0, 0, 0], () => 0.5);
  if (!gib) throw new Error('no chunk');
  fly(gib, 0.02, 1);
  assert.ok(gib.velocity[2] < -10);
  fly(gib, 0.02, GIB_LIFE);
  assert.equal(gib.still, true);
  assert.equal(gibStep(gib, 0.02), null);
});
