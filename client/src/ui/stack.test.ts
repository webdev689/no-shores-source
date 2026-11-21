import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from './glyphs.ts';
import { layout } from './layout.ts';
import { Stack } from './stack.ts';
import type { Interface } from './ui.ts';

const block = glyphDrawn({ rows: ['#'], advance: 600 });
const VIEW = { x: 0, y: 0, width: 300, height: 200 };

test('each layer is laid over the whole view, the later over the earlier, and one taken away is gone', () => {
  const stack = new Stack();
  stack.add(() => ({ id: 'low', width: 'grow', height: 'grow' }));
  const remove = stack.add(() => ({ id: 'high', width: 10, height: 10 }));
  stack.add(() => null);
  const laid = layout(stack.node({} as Interface), VIEW, { face: { glyph: () => block } });
  const low = laid.find((each) => each.node.id === 'low');
  const high = laid.find((each) => each.node.id === 'high');
  assert.deepEqual(low?.box, VIEW);
  assert.deepEqual(high?.box, { x: 0, y: 0, width: 10, height: 10 }, 'not laid after the first');
  assert.ok(laid.indexOf(high!) > laid.indexOf(low!), 'drawn over it');
  remove();
  const after = layout(stack.node({} as Interface), VIEW, { face: { glyph: () => block } });
  assert.equal(
    after.some((each) => each.node.id === 'high'),
    false,
  );
});

test('a layer put under is drawn under every layer added before it, and taken away like any other', () => {
  const stack = new Stack();
  stack.add(() => ({ id: 'menu', width: 10, height: 10 }));
  const remove = stack.under(() => ({ id: 'display', width: 10, height: 10 }));
  const order = () =>
    layout(stack.node({} as Interface), VIEW, { face: { glyph: () => block } }).flatMap((each) =>
      each.node.id ? [each.node.id] : [],
    );
  assert.deepEqual(order(), ['display', 'menu']);
  remove();
  assert.deepEqual(order(), ['menu']);
});

test('a layer that takes itself away as it is built leaves every other layer drawn that frame', () => {
  const stack = new Stack();
  const remove = stack.add(() => {
    remove();
    return { id: 'going' };
  });
  stack.add(() => ({ id: 'after' }));
  const laid = layout(stack.node({} as Interface), VIEW, { face: { glyph: () => block } });
  assert.ok(laid.some((each) => each.node.id === 'after'));
});
