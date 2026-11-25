import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CRASH_LOG_MOST,
  HANG_BOX,
  LOOP_SPAN_MS,
  goneBox,
  goneLine,
  logWith,
  restarts,
  restartsHung,
  stopCount,
  triesAgain,
  unreachableBox,
} from './crashes.ts';

test("each question's safe answer is the one Escape and closing the box choose", () => {
  assert.equal(restarts(goneBox('crashed', 1).cancelId), false);
  assert.equal(restartsHung(HANG_BOX.cancelId), false);
  assert.equal(triesAgain(unreachableBox('noshores.online', 'ERR_INTERNET_DISCONNECTED').cancelId), false);
});

test('Enter restarts a stopped game, and waits on one that stopped answering', () => {
  assert.equal(restarts(goneBox('oom', 1).defaultId), true);
  assert.equal(restartsHung(HANG_BOX.defaultId), false);
  assert.equal(HANG_BOX.buttons[HANG_BOX.defaultId], 'Wait');
});

test("a stop says why in the player's words, and an unknown reason as an unexpected close", () => {
  assert.match(goneBox('oom', 1).detail, /^It ran out of memory\./);
  assert.match(goneBox('something new', 1).detail, /^It closed unexpectedly\./);
});

test('a third stop in two minutes says it keeps stopping, and stops spread out do not', () => {
  const count = stopCount();
  assert.equal(count.stop(0), 1);
  assert.equal(count.stop(1000), 2);
  assert.equal(count.stop(2000), 3);
  assert.match(goneBox('crashed', 3).detail, /stopped 3 times in two minutes/);
  assert.equal(count.stop(2000 + LOOP_SPAN_MS + 1), 1);
  assert.doesNotMatch(goneBox('crashed', 1).detail, /times/);
});

test('a log line says when, which, why, its exit code and the card, on one line', () => {
  const line = goneLine('renderer', { reason: 'oom', exitCode: 9 }, Date.UTC(2026, 10, 25), 'NVIDIA\nGeForce   RTX');
  assert.equal(line, '2026-11-25T00:00:00.000Z renderer oom exitCode=9 on NVIDIA GeForce RTX\n');
  assert.equal(goneLine('gpu', {}, 0), '1970-01-01T00:00:00.000Z gpu unknown exitCode=?\n');
});

test('the log keeps its newest whole lines within its most', () => {
  const line = `${'x'.repeat(99)}\n`;
  let log = '';
  for (let index = 0; index < 1000; index++) log = logWith(log, line);
  assert.ok(log.length <= CRASH_LOG_MOST);
  assert.ok(log.startsWith('x'));
  assert.ok(log.endsWith('\n'));
  assert.equal(log.length % line.length, 0);
});
