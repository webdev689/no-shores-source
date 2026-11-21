import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from './glyphs.ts';
import type { Node } from './node.ts';
import { QuadList } from './quads.ts';
import { type Face, widthOf } from './text.ts';
import { Interface, type UiEvent } from './ui.ts';
import type { UiRenderer } from './uiRenderer.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
const VIEW = { width: 400, height: 300, scale: 1 };

/** A renderer that lays quads and measures words, with an atlas that never has room: enough to lay and hit. */
function renderer(): UiRenderer {
  return {
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  } as unknown as UiRenderer;
}

/** Two presses side by side and a third under the first, each 40 by 20, 10 apart. */
const presses = (): Node => ({
  direction: 'column',
  padding: 10,
  gap: 10,
  children: [
    {
      direction: 'row',
      gap: 10,
      children: [
        { id: 'one', press: true, role: 'button', width: 40, height: 20, label: 'One' },
        { id: 'two', press: true, role: 'button', width: 40, height: 20 },
      ],
    },
    { id: 'three', press: true, role: 'button', width: 40, height: 20, disabled: true },
  ],
});

/** A frame hearing `events`, then `root` drawn. */
const step = (ui: Interface, root: Node, events: UiEvent[] = [], free = true) => {
  ui.frame(VIEW, events, 1 / 60, free);
  ui.draw(root);
};

test('a press is clicked by the pointer let go over it, not when let go elsewhere, nor while the pointer looks round', () => {
  const ui = new Interface(renderer());
  step(ui, presses());
  ui.frame(
    VIEW,
    [
      { kind: 'down', x: 15, y: 15, button: 0 },
      { kind: 'up', x: 15, y: 15, button: 0 },
    ],
    0.016,
  );
  assert.equal(ui.clicked('one'), true);
  assert.equal(ui.pressed, true, 'for its sound');
  assert.equal(ui.clicked('two'), false);
  ui.draw(presses());
  ui.frame(VIEW, [], 0.016);
  assert.equal(ui.clicked('one'), false, 'once only');
  ui.draw(presses());
  ui.frame(
    VIEW,
    [
      { kind: 'down', x: 15, y: 15, button: 0 },
      { kind: 'up', x: 300, y: 200, button: 0 },
    ],
    0.016,
  );
  assert.equal(ui.clicked('one'), false, 'let go elsewhere');
  ui.draw(presses());
  ui.frame(
    VIEW,
    [
      { kind: 'down', x: 15, y: 15, button: 0 },
      { kind: 'up', x: 15, y: 15, button: 0 },
    ],
    0.016,
    false,
  );
  assert.equal(ui.clicked('one'), false, 'not while the pointer is locked');
});

test('under the pointer a press is lit, held it sinks, and a disabled one is neither', () => {
  const ui = new Interface(renderer());
  step(ui, presses(), [{ kind: 'pointer', x: 65, y: 15 }]);
  ui.frame(VIEW, [{ kind: 'pointer', x: 65, y: 15 }], 0.016);
  assert.equal(ui.stateOf('two'), 'hover');
  assert.equal(ui.reached, true, 'reached, for its tick');
  ui.draw(presses());
  ui.frame(VIEW, [{ kind: 'pointer', x: 66, y: 15 }], 0.016);
  assert.equal(ui.reached, false, 'once, on the frame it came');
  assert.equal(ui.stateOf('one'), 'rest');
  ui.draw(presses());
  ui.frame(VIEW, [{ kind: 'down', x: 65, y: 15, button: 0 }], 0.016);
  assert.equal(ui.stateOf('two'), 'active');
  assert.equal(ui.stateOf('three', true), 'disabled');
  assert.equal(ui.takesPointer, true);
  ui.draw(presses());
  ui.frame(VIEW, [{ kind: 'pointer', x: 300, y: 250 }], 0.016);
  assert.equal(ui.takesPointer, false, 'the empty view is the world’s');
});

test('Tab walks focus round what acts, skipping the disabled; arrows go to the nearest that way; Enter presses', () => {
  const ui = new Interface(renderer());
  const heard: string[] = [];
  ui.speak = (words) => heard.push(words);
  step(ui, presses());
  step(ui, presses(), [{ kind: 'key', key: 'Tab' }]);
  assert.equal(ui.focused('one'), true);
  assert.deepEqual(heard, ['One'], 'a screen reader hears its label');
  assert.equal(ui.stateOf('one'), 'hover', 'focus by keys lights it');
  step(ui, presses(), [{ kind: 'key', key: 'Tab' }]);
  assert.equal(ui.focused('two'), true);
  step(ui, presses(), [{ kind: 'key', key: 'Tab' }]);
  assert.equal(ui.focused('one'), true, 'round from the end, past the disabled');
  step(ui, presses(), [{ kind: 'key', key: 'ArrowRight' }]);
  assert.equal(ui.focused('two'), true);
  ui.frame(VIEW, [{ kind: 'pad', button: 'accept' }], 0.016);
  assert.equal(ui.clicked('two'), true, "the pad's A presses");
  ui.draw(presses());
  ui.frame(VIEW, [{ kind: 'key', key: 'Escape' }], 0.016);
  assert.equal(ui.escaped, true);
});

test('the wheel scrolls the list under the pointer, kept within what it holds, and focus by keys scrolls into sight', () => {
  const rows = Array.from({ length: 10 }, (_unused, index): Node => ({
    id: `row${index}`,
    press: true,
    width: 50,
    height: 20,
  }));
  const list: Node = { id: 'list', direction: 'column', scroll: true, height: 60, children: rows };
  const ui = new Interface(renderer());
  step(ui, list);
  step(ui, list, [{ kind: 'wheel', x: 10, y: 10, dy: 50 }]);
  assert.equal(ui.tookWheel, true);
  step(ui, list, [{ kind: 'pointer', x: 10, y: 5 }]);
  assert.equal(ui.hovered('row2'), true, 'the list has moved up 50');
  step(ui, list, [{ kind: 'wheel', x: 10, y: 10, dy: 1000 }]);
  step(ui, list, [{ kind: 'pointer', x: 10, y: 55 }]);
  assert.equal(ui.hovered('row9'), true, 'no further than the last row');
  for (let index = 0; index < 1; index++) step(ui, list, [{ kind: 'key', key: 'Tab' }]);
  step(ui, list);
  step(ui, list, [{ kind: 'pointer', x: 10, y: 5 }]);
  assert.equal(ui.focused('row0'), true);
  assert.equal(ui.hovered('row0'), true, 'the list scrolled back to the focused row');
});

test('a field takes focus on a click, takes typing and the browser’s edits, and Enter submits it', () => {
  const form: Node = { id: 'name', field: { placeholder: 'Name', most: 8 }, width: 100, height: 20, role: 'well' };
  const ui = new Interface(renderer());
  step(ui, form);
  step(ui, form, [
    { kind: 'down', x: 5, y: 5, button: 0 },
    { kind: 'up', x: 5, y: 5, button: 0 },
  ]);
  assert.equal(ui.focused('name'), true);
  step(ui, form, [
    { kind: 'text', text: 'Tessa' },
    { kind: 'key', key: 'Backspace' },
  ]);
  assert.equal(ui.fieldText('name'), 'Tess');
  step(ui, form, [{ kind: 'key', key: 'Backspace', typed: true }]);
  assert.equal(ui.fieldText('name'), 'Tess', 'a key the browser typed is not done twice');
  step(ui, form, [{ kind: 'edit', from: 4, to: 4, text: 'aly', caret: 7, anchor: 7 }]);
  assert.equal(ui.fieldText('name'), 'Tessaly');
  assert.deepEqual(ui.typing?.state, { text: 'Tessaly', caret: 7, anchor: 7 });
  step(ui, form, [{ kind: 'text', text: 'nnnn' }]);
  assert.equal(ui.fieldText('name'), 'Tessalyn', 'kept to its most');
  ui.frame(VIEW, [{ kind: 'key', key: 'Enter' }], 0.016);
  assert.equal(ui.submitted('name'), true);
  ui.draw(form);
  step(ui, form, [{ kind: 'key', key: 'Escape' }]);
  assert.equal(ui.focused('name'), false, 'Escape leaves the field');
  assert.equal(ui.typing, null);
});

test('a node’s age counts from when it was first laid, and starts again once it has gone', () => {
  const ui = new Interface(renderer());
  const shown: Node = { id: 'toast', width: 10, height: 10, fill: '#fff' };
  step(ui, shown);
  ui.frame(VIEW, [], 0.5);
  assert.equal(ui.age('toast'), 0.5);
  ui.draw({});
  ui.frame(VIEW, [], 0.5);
  assert.equal(ui.age('toast'), 0);
});

test('the view’s size is answered in CSS pixels, as the frame was given it at its scale', () => {
  const ui = new Interface(renderer());
  ui.frame({ width: 800, height: 600, scale: 2 }, [], 1 / 60);
  assert.deepEqual(ui.size, { width: 400, height: 300 });
});

test('words laid over the world let the pointer through, and all they hold, so a click there is the world’s', () => {
  const ui = new Interface(renderer());
  const root: Node = {
    width: 'grow',
    height: 'grow',
    children: [
      { width: 100, height: 40, through: true, children: [{ id: 'held', press: true, width: 40, height: 20 }] },
      { text: { words: 'over the world' }, through: true },
    ],
  };
  step(ui, root, [{ kind: 'pointer', x: 10, y: 10 }]);
  step(ui, root, [{ kind: 'pointer', x: 10, y: 10 }]);
  assert.equal(ui.takesPointer, false);
  assert.equal(ui.hovered('held'), false);
  step(ui, root, [{ kind: 'pointer', x: 110, y: 5 }]);
  assert.equal(ui.takesPointer, false, 'the words too');
});

test('words drawn with a wider edge stand their halo that many pixels out all round, one unless said', () => {
  const lettered = () => {
    const made = renderer();
    return Object.assign(made, { glyphTexels: () => ({ x: 0, y: 0, width: 1, height: 1 }) });
  };
  const leftmost = (edgeWidth?: number) => {
    const ui = new Interface(lettered());
    ui.frame(VIEW, [], 1 / 60);
    const root: Node = {
      padding: 10,
      children: [{ text: { words: 'A', edge: 'halo', ...(edgeWidth ? { edgeWidth } : {}) } }],
    };
    ui.draw(root);
    const data = ui.renderer.quads.data;
    const lefts = Array.from({ length: ui.renderer.quads.count }, (_unused, index) => data[index * 20] ?? 0);
    return Math.min(...lefts);
  };
  const plain = leftmost();
  assert.equal(leftmost(3), plain - 2, 'three pixels out where one stood one out');
  assert.equal(leftmost(1), plain);
});

test('a node’s own drawing is told how faded it stands, its parents’ opacity and its own', () => {
  const ui = new Interface(renderer());
  ui.frame(VIEW, [], 1 / 60);
  const told: number[] = [];
  ui.draw({ opacity: 0.5, children: [{ opacity: 0.5, width: 10, height: 10, draw: (...args) => told.push(args[4]) }] });
  assert.deepEqual(told, [0.25]);
});

test('a right press is heard on what it is over, and the focus says whether the keys moved it', () => {
  const ui = new Interface(renderer());
  step(ui, presses());
  step(ui, presses(), [{ kind: 'down', x: 15, y: 15, button: 2 }]);
  assert.ok(ui.rightClicked('one'));
  assert.ok(!ui.clicked('one'), 'a right press is no press');
  step(ui, presses());
  assert.ok(!ui.rightClicked('one'), 'heard for one frame');
  step(ui, presses(), [{ kind: 'down', x: 70, y: 15, button: 0 }]);
  assert.equal(ui.focusedId, 'two');
  assert.ok(!ui.keyFocused, 'a click gives focus, not the keys');
  step(ui, presses(), [{ kind: 'key', key: 'Tab' }]);
  assert.equal(ui.focusedId, 'one');
  assert.ok(ui.keyFocused);
  step(ui, presses(), [{ kind: 'down', x: 15, y: 15, button: 2 }], false);
  assert.ok(!ui.rightClicked('one'), 'nothing is pressed while the pointer looks round');
});

test('the pointer is where it last moved while free, and nowhere once it leaves or looks round', () => {
  const ui = new Interface(renderer());
  step(ui, presses(), [{ kind: 'pointer', x: 12, y: 30 }]);
  assert.deepEqual(ui.pointerAt, { x: 12, y: 30 });
  step(ui, presses(), [{ kind: 'leave' }]);
  assert.equal(ui.pointerAt, null);
  step(ui, presses(), [{ kind: 'pointer', x: 12, y: 30 }], false);
  assert.equal(ui.pointerAt, null);
});

test('the interface as last laid answers whether it takes the pointer at a point, for a click heard before a frame', () => {
  const ui = new Interface(renderer());
  step(ui, presses());
  assert.equal(ui.takes(15, 15), true, 'on a press');
  assert.equal(ui.takes(300, 250), false, 'the empty view is the world’s');
});
