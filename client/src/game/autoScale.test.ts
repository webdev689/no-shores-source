import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUTO, AutoScale, SCALES } from './autoScale.ts';

const REFRESH_MS = 1000 / 60;

/** What a frame takes at a share of the canvas: the time since the last, and the GPU's time, or none without a
 *  clock. */
type Load = (share: number) => { readonly intervalMs: number; readonly gpuMs: number | null };

/** Feeds `auto` `seconds` of frames, each loaded as `load` says at the tier it draws at; answers the tier after each
 *  frame and the second it was heard at. */
function run(auto: AutoScale, seconds: number, load: Load): { tier: number; at: number }[] {
  const heard: { tier: number; at: number }[] = [];
  let second = 0;
  while (second < seconds) {
    const { intervalMs, gpuMs } = load(SCALES[auto.tier] ?? 1);
    heard.push({ tier: auto.hear(intervalMs, gpuMs === null ? null : [gpuMs]), at: second });
    second += intervalMs / 1000;
  }
  return heard;
}

/** The GPU's time growing with the pixels drawn, `fullMs` at the whole canvas; the frames keep the refresh while it
 *  fits, and wait on the GPU past it. */
const gpuBound =
  (fullMs: number): Load =>
  (share) => {
    const gpuMs = fullMs * share * share;
    return { intervalMs: Math.max(REFRESH_MS, gpuMs), gpuMs };
  };

/** A display at 60 frames a second learnt from an unloaded start. */
function learnt(): AutoScale {
  const auto = new AutoScale();
  run(auto, 4, () => ({ intervalMs: REFRESH_MS, gpuMs: 3 }));
  assert.ok(Math.abs((auto.refreshMs ?? 0) - REFRESH_MS) < 0.01, 'the refresh is the unloaded frames’ interval');
  return auto;
}

const changes = (heard: readonly { tier: number }[]) =>
  heard.filter((each, index) => index > 0 && each.tier !== heard[index - 1]?.tier).length;

test('over the budget, Auto steps down until the GPU’s time fits, then holds that tier without flickering', () => {
  const auto = learnt();
  // 18 ms at the full canvas is over 90% of 16.7 ms; 85% draws it in 13 ms, and the full canvas again would not fit.
  const heard = run(auto, 600, gpuBound(18));
  assert.equal(auto.tier, 1);
  assert.equal(changes(heard), 1, 'one step, and no step back');
  const stepped = heard.find((each) => each.tier === 1);
  assert.ok(stepped && stepped.at <= AUTO.windowS * 2, 'within the window it was over in');
});

test('Auto never draws below the last tier, 50%', () => {
  const auto = learnt();
  run(auto, 120, gpuBound(200));
  assert.equal(auto.tier, SCALES.length - 1);
  assert.equal(SCALES.at(-1), 0.5);
});

test('well under the budget again, Auto steps back up a tier each time it has stayed under for upS', () => {
  const auto = learnt();
  run(auto, 60, gpuBound(40));
  assert.equal(auto.tier, SCALES.length - 1);
  const heard = run(auto, 120, gpuBound(6));
  assert.equal(auto.tier, 0);
  const raised = heard.filter((each, index) => index > 0 && each.tier < (heard[index - 1]?.tier ?? 0));
  assert.equal(raised.length, SCALES.length - 1);
  const gaps = raised.map((each, index) => each.at - (raised[index - 1]?.at ?? 0));
  assert.ok(
    gaps.every((gap) => gap >= AUTO.upS),
    `no raise sooner than ${AUTO.upS} s after the last: ${gaps.join(', ')}`,
  );
});

test('a raise the GPU’s time would not fit well under is never tried', () => {
  const auto = learnt();
  run(auto, 30, gpuBound(18));
  // At 85% the GPU takes 9.4 ms, well within the budget; the whole canvas's 13 ms would not be well under it.
  const heard = run(auto, 600, gpuBound(13));
  assert.equal(changes(heard), 0);
  assert.equal(auto.tier, 1);
});

test('without the GPU’s clock, frames late for the refresh step it down, and each raise undone waits twice as long', () => {
  const auto = learnt();
  // Only the full canvas misses the refresh, so every raise to it is undone.
  const load: Load = (share) => ({ intervalMs: share === 1 ? 25 : REFRESH_MS, gpuMs: null });
  const heard = run(auto, 900, load);
  const raised = heard.filter((each, index) => index > 0 && each.tier < (heard[index - 1]?.tier ?? 0));
  const waits = raised.map((each, index) => each.at - (raised[index - 1]?.at ?? 0));
  assert.ok(raised.length >= 4 && raised.length <= 8, `${raised.length} raises`);
  assert.ok(
    waits.slice(1).every((wait, index) => wait > (waits[index] ?? 0) - 1),
    `each wait at least the last: ${waits.map((wait) => wait.toFixed(0)).join(', ')}`,
  );
  assert.ok((waits.at(-1) ?? 0) >= AUTO.upMostS, 'the waits grow to the longest');
});

test('a page hidden a while, its one long frame, closes a window like any other and changes no tier', () => {
  const auto = learnt();
  const heard = run(auto, 30, () => ({ intervalMs: REFRESH_MS, gpuMs: 4 }));
  auto.hear(60_000, [4]);
  heard.push(...run(auto, 30, () => ({ intervalMs: REFRESH_MS, gpuMs: 4 })));
  assert.equal(changes(heard), 0);
  assert.equal(auto.tier, 0);
  assert.ok(Math.abs((auto.refreshMs ?? 0) - REFRESH_MS) < 0.01);
});
