import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAIN_S, Drain, drainOf, easeOut } from './drain.ts';

const near = (actual: number, expected: number, within = 1e-4) =>
  assert.ok(Math.abs(actual - expected) <= within, `${actual} is not within ${within} of ${expected}`);

test("the ease is CSS's ease-out: still at its ends, quick at first", () => {
  near(easeOut(0), 0, 1e-6);
  near(easeOut(1), 1, 1e-6);
  // Chromium's ease-out, read off an animation a quarter, half and three quarters through.
  near(easeOut(0.25), 0.37814);
  near(easeOut(0.5), 0.68464);
  near(easeOut(0.75), 0.90654);
  near(easeOut(-1), 0, 1e-6);
  near(easeOut(2), 1, 1e-6);
});

test('the filter runs from none to the full grey, each function on its own line', () => {
  assert.deepEqual(drainOf(0), { grey: 0, bright: 1, contrast: 1 });
  const full = drainOf(1);
  near(full.grey, 0.92, 1e-9);
  near(full.bright, 0.72, 1e-9);
  near(full.contrast, 1.05, 1e-9);
  const half = drainOf(0.5);
  near(half.grey, 0.46, 1e-9);
  near(half.bright, 0.86, 1e-9);
  near(half.contrast, 1.025, 1e-9);
});

test('the world drains over 1.4 s once dead, and comes back as long once not', () => {
  const drain = new Drain();
  assert.equal(drain.share, 0);
  drain.toward(true);
  assert.equal(drain.share, 0, 'it starts from colour');
  drain.step(DRAIN_S / 2);
  near(drain.share, easeOut(0.5));
  drain.step(DRAIN_S / 2);
  assert.equal(drain.share, 1);
  drain.toward(true);
  drain.step(1);
  assert.equal(drain.share, 1, 'staying dead keeps it grey');
  drain.toward(false);
  drain.step(DRAIN_S / 4);
  near(drain.share, 1 - easeOut(0.25));
  drain.step(DRAIN_S);
  assert.equal(drain.share, 0);
});

test('turned mid-way, it starts from where it stands and takes the share of the time left to go', () => {
  const drain = new Drain();
  drain.toward(true);
  drain.step(DRAIN_S / 2);
  const stood = drain.share;
  drain.toward(false);
  assert.equal(drain.share, stood, 'no jump');
  drain.step(DRAIN_S * stood * 0.999);
  assert.ok(drain.share > 0 && drain.share < 0.01, 'all but back');
  drain.step(DRAIN_S * stood * 0.001);
  assert.equal(drain.share, 0);
});
