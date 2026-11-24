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

test('a refusal, where E does nothing, shows its words without a key', () => {
  const prompt = new UsePrompt();
  const view = { width: 1280, height: 720 };
  prompt.show('A structure stands there.');
  const keyed = JSON.stringify(prompt.node(view));
  prompt.show('A structure stands there.', null, true);
  const idle = JSON.stringify(prompt.node(view));
  assert.ok(idle.includes('A structure stands there.'));
  assert.ok(keyed.includes('minWidth') && !idle.includes('minWidth'), 'no keycap');
});

test("a deed held traces a ring round its keycap's edge, clockwise from its top's middle, each texel once", () => {
  const box = { x: 0, y: 0, width: 40, height: 20 };
  const area = (share: number) => traced(box, 2, share).reduce((sum, part) => sum + part.width * part.height, 0);
  assert.deepEqual(traced(box, 2, 0), []);
  assert.deepEqual(traced(box, 2, 1 / 16)[0], { x: 20, y: 0, width: 7, height: 2 }, 'along the top to the right');
  assert.deepEqual(
    traced(box, 2, 0.25)[1],
    { x: 38, y: 2, width: 2, height: 8 },
    'then down the right, below its corner',
  );
  assert.equal(area(1), 40 * 20 - 36 * 16, 'the whole edge, no corner painted twice');
  // Drawn on its keycap only while it is held.
  const quads = (held: number | null) => {
    const prompt = new UsePrompt();
    prompt.show('Hold to gather Brineglass', held);
    const keycap = prompt.node({ width: 1280, height: 720 })?.children?.[0];
    const drawn: unknown[] = [];
    const ui = { quads: { add: (...made: unknown[]) => drawn.push(made) } };
    const draw = keycap && typeof keycap === 'object' ? keycap.draw : undefined;
    draw?.(ui as never, { x: 0, y: 0, width: 40, height: 26 }, 1, { x: 0, y: 0, width: 99, height: 99 }, 1);
    return drawn.length;
  };
  assert.ok(quads(0.5) > quads(null), 'the ring over its bevel');
});
