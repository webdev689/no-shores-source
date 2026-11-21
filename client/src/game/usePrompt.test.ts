import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UsePrompt, traced } from './usePrompt.ts';

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

test("a deed held traces a ring round its keycap's edge, clockwise from its top's middle", () => {
  const box = { x: 0, y: 0, width: 40, height: 20 };
  const around = (share: number) => traced(box, 2, share).reduce((sum, part) => sum + part.width * part.height, 0);
  assert.deepEqual(traced(box, 2, 0), []);
  assert.deepEqual(traced(box, 2, 1 / 12), [{ x: 20, y: 0, width: 10, height: 2 }], 'along the top to the right');
  assert.deepEqual(traced(box, 2, 0.25)[1], { x: 38, y: 0, width: 2, height: 10 }, 'then down the right');
  assert.equal(around(1), 2 * (40 + 20) * 2, 'the whole edge, once');
  const prompt = new UsePrompt();
  prompt.show('Hold to gather Brineglass', 0.5);
  assert.ok(prompt.node({ width: 1280, height: 720 }), 'drawn on its keycap, inside the prompt');
});
