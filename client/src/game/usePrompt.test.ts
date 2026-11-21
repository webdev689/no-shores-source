import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UsePrompt } from './usePrompt.ts';

test('the prompt shows the deed within reach on its keycap, low in the middle, and nothing with none', () => {
  const prompt = new UsePrompt();
  const view = { width: 1280, height: 720 };
  assert.equal(prompt.node(view), null);
  prompt.show('Talk to the Harbourmaster');
  const node = prompt.node(view);
  assert.deepEqual(node?.float, { to: 'screen', at: [0.5, 1], anchor: [0.5, 1], y: -110 });
  assert.ok(JSON.stringify(node).includes('Talk to the Harbourmaster'));
  assert.equal(prompt.node({ width: 1600, height: 900 })?.float?.y, -154);
  prompt.show(null);
  assert.equal(prompt.node(view), null);
});
