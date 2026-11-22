import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countingGpu } from '../gpuForTests.ts';
import { easeOut } from '../ui/ease.ts';
import { DRAIN_S, Drain, type DrainView, drainOf } from './drain.ts';
import { DungeonScene } from './dungeonScene.ts';

const near = (actual: number, expected: number, within = 1e-4) =>
  assert.ok(Math.abs(actual - expected) <= within, `${actual} is not within ${within} of ${expected}`);

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

test("a dungeon's scene let go gives back the drain's copy of the picture", () => {
  const counting = countingGpu();
  const scene = new DungeonScene(counting.gpu);
  const before = counting.live();
  const drain = (scene as unknown as { drain: DrainView }).drain;
  const encoder = counting.gpu.device.createCommandEncoder();
  drain.encode(encoder, { width: 64, height: 32, createView: () => ({}) } as unknown as GPUTexture, 0.5);
  assert.equal(counting.live(), before + 1, 'the copy the picture drains from');
  scene.release();
  assert.equal(counting.live(), before);
});
