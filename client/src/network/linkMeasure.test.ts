import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LinkMeasure } from './linkMeasure.ts';

test('the lag is the time from an input to the snapshot that shows it taken, smoothed, and how much it strays', () => {
  const measure = new LinkMeasure();
  for (let sequence = 1; sequence <= 40; sequence++) measure.sent(sequence, sequence * 16);
  // The room shows each input taken 80 ms after it was sent, then once 240 ms after.
  for (let sequence = 1; sequence <= 30; sequence++) measure.snapshot(sequence, true, sequence * 16 + 80);
  assert.ok(Math.abs(measure.measured.lagMs - 80) < 1e-6);
  measure.snapshot(31, true, 31 * 16 + 240);
  assert.equal(measure.measured.lagMs, 80 + (240 - 80) / 8, 'an eighth of a new one taken in');
  assert.ok(measure.measured.strayMs > 0);
  measure.snapshot(31, true, 9999);
  assert.equal(measure.measured.lagMs, 80 + (240 - 80) / 8, 'an input already answered is not timed again');
});

test('the loss is the share of snapshots passed over, and a new welcome starts again', () => {
  const measure = new LinkMeasure();
  for (const kept of [true, true, false, true]) measure.snapshot(0, kept, 0);
  assert.equal(measure.measured.lost, 0.25);
  measure.clear();
  assert.deepEqual(measure.measured, { lagMs: 0, strayMs: 0, lost: 0 });
});
