import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ComposeQueue } from './composeQueue.ts';

/** A queue whose turns are taken by hand, and what it composed, in order. */
function queued() {
  const turns: (() => void)[] = [];
  const ran: string[] = [];
  const queue = new ComposeQueue((next) => turns.push(next));
  const settled = () => new Promise((resolve) => setImmediate(resolve));
  const turn = async () => {
    await settled();
    turns.shift()?.();
  };
  return { queue, ran, turn, settled, turns };
}

test('of the frames whose strips have come, the most wanted is composed first, one a turn', async () => {
  const { queue, ran, turn } = queued();
  queue.add(1, 'later', Promise.resolve(), () => ran.push('warmed'));
  queue.add(2, 'ahead', Promise.resolve(), () => ran.push('ahead'));
  queue.add(3, 'now', Promise.resolve(), () => ran.push('shown'));
  await turn();
  assert.deepEqual(ran, ['shown']);
  await turn();
  await turn();
  assert.deepEqual(ran, ['shown', 'ahead', 'warmed']);
});

test('a frame waiting for its strips holds up none whose strips have come', async () => {
  const { queue, ran, turn } = queued();
  let arrive = () => undefined as void;
  queue.add(1, 'now', new Promise<void>((resolve) => (arrive = resolve)), () => ran.push('slow'));
  queue.add(2, 'later', Promise.resolve(), () => ran.push('warmed'));
  await turn();
  assert.deepEqual(ran, ['warmed']);
  arrive();
  await turn();
  assert.deepEqual(ran, ['warmed', 'slow']);
});

test('a frame shown while it waits goes ahead of those still waiting, and one whose strips failed says so', async () => {
  const { queue, ran, turn } = queued();
  queue.add(1, 'ahead', Promise.resolve(), () => ran.push('ahead'));
  queue.add(2, 'later', Promise.resolve(), () => ran.push('hurried'));
  queue.add(3, 'later', Promise.reject(new Error('gone')), () => ran.push('failed'));
  queue.hurry(2);
  await turn();
  await turn();
  await turn();
  assert.deepEqual(ran, ['hurried', 'ahead', 'failed']);
});
