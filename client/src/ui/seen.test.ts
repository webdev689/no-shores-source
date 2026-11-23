import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Node } from './node.ts';
import { seen, seenIn } from './seen.ts';
import { fakeInterface } from './uiForTests.ts';

/** A list 40 tall holding three rows 20 tall, the third scrolled out of sight, and a press with words in it. */
const screen: Node = {
  direction: 'column',
  children: [
    {
      id: 'list',
      direction: 'column',
      scroll: true,
      height: 40,
      children: [0, 1, 2].map((index) => ({ id: `row${index}`, width: 50, height: 20 })),
    },
    {
      id: 'go',
      press: true,
      role: 'button',
      label: 'Set sail',
      width: 60,
      height: 30,
      text: { words: 'Go', size: 16 },
    },
    { width: 10, height: 10 },
  ],
};

test('__ui lists what an interface shows: ids, words and labels, boxes clipped to sight, presses and focus', () => {
  const { ui, step } = fakeInterface(400, 300);
  seen(ui);
  step(screen);
  step(screen, [{ kind: 'key', key: 'Tab' }]);
  step(screen);
  const shown = (globalThis as { __ui?: () => ReturnType<typeof seenIn> }).__ui?.() ?? [];
  assert.deepEqual(
    shown.map(({ id }) => id),
    ['list', 'row0', 'row1', 'go'],
    'the row out of sight and the node with nothing to find it by are left out',
  );
  assert.deepEqual(shown.at(-1), {
    ...{ id: 'go', words: 'Go', label: 'Set sail', press: true, focused: true },
    ...{ x: 0, y: 40, width: 60, height: 30 },
  });
});

test("boxes are in the page's CSS pixels where the interface's pixels are not", () => {
  const { ui } = fakeInterface();
  // 1.5 device pixels a CSS pixel, drawn at a whole scale of 1: an interface pixel is two thirds of a CSS pixel.
  ui.frame({ width: 600, height: 450, scale: 1, ratio: 1.5 }, [], 0);
  ui.draw(screen);
  assert.deepEqual(
    seenIn(ui).find(({ id }) => id === 'go'),
    { id: 'go', words: 'Go', label: 'Set sail', press: true, x: 0, y: 40 / 1.5, width: 60 / 1.5, height: 30 / 1.5 },
  );
});
