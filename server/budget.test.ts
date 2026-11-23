import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Count, MESSAGES_A_SECOND, UNSIGNED_FROM_ONE, admitsFrom, counted } from './budget.ts';

/** Counts a socket's messages sent at `times` (milliseconds); answers whether each was within the budget. */
function send(times: readonly number[]): boolean[] {
  let count: Count | undefined;
  return times.map((time) => {
    const next = counted(count, time);
    count = next.count;
    return next.within;
  });
}

const ticks = (count: number, from: number) =>
  Array.from({ length: count }, (_unused, tick) => from + (tick * 1000) / 60);

test('a browser sending an input a tick, with a stall caught up at once, stays within its budget', () => {
  assert.ok(send(ticks(600, 10_000)).every(Boolean), 'ten seconds of ticks');
  const stalled = [...Array.from({ length: 30 }, () => 10_000), ...ticks(120, 10_000)];
  assert.ok(send(stalled).every(Boolean), 'half a second of inputs at once, then two seconds of ticks');
});

test('a flood is past its budget within the second it starts, and each second starts afresh', () => {
  const flood = send(Array.from({ length: MESSAGES_A_SECOND + 1 }, (_unused, message) => 10_000 + message));
  assert.equal(flood.indexOf(false), MESSAGES_A_SECOND, 'the message after the budget');
  const atTheEdge = send([...Array.from({ length: MESSAGES_A_SECOND }, () => 10_999), 11_000]);
  assert.ok(atTheEdge.every(Boolean), 'a new second');
});

test("one address holds a room's sockets unsigned only up to its share, and signing in frees its place", () => {
  const held = Array.from({ length: UNSIGNED_FROM_ONE - 1 }, () => ({ address: '203.0.113.9', signed: false }));
  assert.ok(admitsFrom(held, '203.0.113.9'), 'one short of the share');
  held.push({ address: '203.0.113.9', signed: false });
  assert.ok(!admitsFrom(held, '203.0.113.9'), 'its share held unsigned');
  assert.ok(admitsFrom(held, '198.51.100.4'), 'another address');
  held[0] = { address: '203.0.113.9', signed: true };
  assert.ok(admitsFrom(held, '203.0.113.9'), 'a signed socket holds no unsigned place');
});
