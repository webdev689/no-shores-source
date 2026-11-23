import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FrameGuard } from './frameGuard.ts';

test('a part that throws is reported and the frames go on', () => {
  const reported: unknown[] = [];
  const guard = new FrameGuard((error) => reported.push(error));
  let after = 0;
  for (let frame = 0; frame < 3; frame++) {
    guard.run(() => {
      throw new Error('the story layer failed');
    });
    after++;
  }
  assert.equal(after, 3);
  assert.equal(reported.length, 1, 'the same failure every frame is reported once');
  assert.match(String(reported[0]), /the story layer failed/);
});

test('different failures are each reported, up to a limit', () => {
  const reported: unknown[] = [];
  const guard = new FrameGuard((error) => reported.push(error));
  for (let kind = 0; kind < 100; kind++)
    guard.run(() => {
      throw new Error(`failure ${kind}`);
    });
  assert.equal(reported.length, 32);
});

test('work that does not throw is run and reports nothing', () => {
  const reported: unknown[] = [];
  const guard = new FrameGuard((error) => reported.push(error));
  let ran = false;
  const done = guard.run(() => {
    ran = true;
  });
  assert.ok(ran && done, 'run, and said to have run whole');
  assert.deepEqual(reported, []);
  const failed = guard.run(() => {
    throw new Error('a place that failed');
  });
  assert.equal(failed, false, 'work that threw says so, so its frame is not taken as settled');
});
