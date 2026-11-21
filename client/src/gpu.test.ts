import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stopWhenLost } from './gpu.ts';

const lostAs = (reason: 'destroyed' | 'unknown', message: string) => ({
  lost: Promise.resolve({ reason, message } as GPUDeviceLostInfo),
});

test('a device lost tells the player to reload; one destroyed on purpose says nothing', async () => {
  const said: string[] = [];
  stopWhenLost(lostAs('unknown', 'the driver was reset'), (message) => said.push(message));
  stopWhenLost(lostAs('destroyed', 'closed'), (message) => said.push(message));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(said, ['The graphics device was lost (the driver was reset). Reload the page.']);
});
