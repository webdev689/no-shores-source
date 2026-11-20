import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Bob, ChainSwing, LOWERED_GONE, lowerDrop, lowerStep, runFrameAt, swayFrame } from './fpMotion.ts';

test('a standing chain hangs at rest on the middle frame', () => {
  const chain = new ChainSwing();
  for (let i = 0; i < 100; i++) chain.step(1 / 60, 0);
  assert.equal(swayFrame(chain.step(1 / 60, 0), 9), 4);
});

test('a walking chain sways both ways, wider at a run, and settles back when its bearer stops', () => {
  const reach = (pace: number) => {
    const chain = new ChainSwing();
    let most = 0;
    for (let i = 0; i < 600; i++) most = Math.max(most, Math.abs(chain.step(1 / 60, pace)));
    return { chain, most };
  };
  const walk = reach(1);
  const run = reach(2);
  assert.ok(walk.most > 0.4 && walk.most < 0.7, `walk ${walk.most}`);
  assert.ok(run.most > walk.most);
  for (let i = 0; i < 1200; i++) walk.chain.step(1 / 60, 0);
  assert.ok(Math.abs(walk.chain.step(1 / 60, 0)) < 0.02);
});

test('the sway frames run from the far left to the far right', () => {
  assert.deepEqual(
    [-1, -0.5, 0, 0.5, 1, 3].map((hangs) => swayFrame(hangs, 9)),
    [0, 2, 4, 6, 8, 8],
  );
});

test('the running arm steps through eight frames a stride, the left half a stride behind', () => {
  assert.deepEqual(
    [0, 0.625, 2.5, 4.375, 5].map((stride) => runFrameAt(stride, false)),
    [0, 1, 4, 7, 0],
  );
  assert.equal(runFrameAt(0, true), 4);
  assert.equal(runFrameAt(-0.625, false), 7);
});

test('the bob dips once a step while walking, deeper running, and eases out after a stop', () => {
  const bob = new Bob();
  for (let i = 0; i < 60; i++) bob.step(1 / 60, 0, true, false);
  assert.ok(Math.abs(bob.step(0, 0, true, false)) < 1e-9, 'level at the step');
  const walking = bob.step(0, 1.25, true, false);
  assert.ok(walking > 1.9 && walking <= 2, `walk ${walking}`);
  for (let i = 0; i < 60; i++) bob.step(1 / 60, 1.25, true, true);
  assert.ok(bob.step(0, 1.25, true, true) > 3.9);
  for (let i = 0; i < 120; i++) bob.step(1 / 60, 1.25, false, false);
  assert.ok(bob.step(0, 1.25, false, false) < 0.01);
});

test('the weapon goes down for a climb quickly, comes back slower, and is gone near the bottom', () => {
  let lower = 0;
  let downIn = 0;
  while (lower < LOWERED_GONE) {
    lower = lowerStep(lower, 1, 0.01);
    downIn += 0.01;
  }
  let upIn = 0;
  while (lower > 0) {
    lower = lowerStep(lower, 0, 0.01);
    upIn += 0.01;
  }
  assert.ok(downIn < 0.35 && upIn > downIn, `down ${downIn}, up ${upIn}`);
  assert.equal(lowerDrop(0), 0);
  assert.equal(lowerDrop(0.5), 100);
  assert.equal(lowerDrop(1), 200);
});
