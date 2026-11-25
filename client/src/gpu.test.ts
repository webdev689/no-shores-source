import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stopWhenLost, viewOf } from './gpu.ts';

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

test("a texture's whole view is made once and handed out again; another texture has its own", () => {
  let made = 0;
  const texture = () => ({ createView: () => ({ made: ++made }) }) as unknown as GPUTexture;
  const [one, other] = [texture(), texture()];
  assert.equal(viewOf(one), viewOf(one));
  assert.equal(made, 1);
  assert.notEqual(viewOf(other), viewOf(one));
  assert.equal(made, 2);
});
