import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeInterface, laidOf, laidWith, nodesOf } from '../ui/uiForTests.ts';
import { sizesOf } from './gearNodes.ts';
import { footerNode, tabsNode } from './gearShell.ts';

test('where keys show, a tab’s name steps down a size once it and its keycap would not fit the tab together', () => {
  const { ui } = fakeInterface(1500, 1080);
  // Words as the game's face draws them, about 14 px a letter at the larger size and 7 at the smaller.
  Object.assign(ui.renderer, { measure: (words: string, size: number) => words.length * (size === 2 ? 14 : 7) });
  const sizeAt = (across: number, view: { width: number; height: number }) =>
    nodesOf(tabsNode(ui, 'journal', across, view, 1)).find((node) => node.text?.words === 'CHARACTER')?.text?.size;
  // Eight tabs of 160 px: CHARACTER alone takes 126 + 16, with its keycap and the gap 168.
  const across = 8 * 160 + 36;
  assert.equal(sizeAt(across, { width: 1500, height: 1080 }), 1, 'with keys: name and keycap would overrun');
  assert.equal(sizeAt(across, { width: 1400, height: 1080 }), 2, 'without keys: the name alone fits');
});

test("on a phone the footer's hints wrap inside the window, its presses beside them", () => {
  const hints = [
    ['Click', 'Acquire'],
    ['Hold', 'Buy'],
    ['character', 'Open Character'],
    ['Esc', 'Dismiss'],
  ] as const;
  const close = { id: 'close', width: 100, height: 20 };
  const foot = footerNode('', '#fff', hints, [close], sizesOf(412, 915, 1));
  const laid = laidOf({ width: 'grow', direction: 'column', children: [foot] }, 380, 900);
  const past = laid.filter((each) => each.box.x + each.box.width > 380);
  assert.deepEqual(
    past.map((each) => each.node.id ?? each.node.text?.words),
    [],
    'nothing past the edge',
  );
  assert.ok(laidWith(laid, 'close'), 'Close laid');
});
