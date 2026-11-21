import assert from 'node:assert/strict';
import { test } from 'node:test';
import { button, choice, slider, toggle } from './controls.ts';
import { glyphDrawn } from './glyphs.ts';
import type { Node } from './node.ts';
import { QuadList } from './quads.ts';
import { type Face, widthOf } from './text.ts';
import { Interface, type UiEvent } from './ui.ts';
import type { UiRenderer } from './uiRenderer.ts';

const block = glyphDrawn({ rows: ['##', '##'], advance: 600 });
const face: Face = { glyph: () => block };
const VIEW = { width: 400, height: 300, scale: 1 };
const renderer = () =>
  ({
    face,
    quads: new QuadList(),
    tileTexels: () => null,
    glyphTexels: () => null,
    picture: () => undefined,
    measure: (words: string, size: number) => widthOf(face, words, size),
  }) as unknown as UiRenderer;
const click = (x: number, y: number): UiEvent[] => [
  { kind: 'down', x, y, button: 0 },
  { kind: 'up', x, y, button: 0 },
];

test('a button runs once when pressed, and never while disabled', () => {
  const ui = new Interface(renderer());
  let runs = 0;
  const build = (disabled = false): Node => ({ children: [button(ui, 'go', 'Go', () => runs++, { disabled })] });
  ui.frame(VIEW, [], 0.016);
  ui.draw(build());
  ui.frame(VIEW, click(5, 5), 0.016);
  ui.draw(build());
  assert.equal(runs, 1);
  ui.frame(VIEW, click(5, 5), 0.016);
  ui.draw(build(true));
  assert.equal(runs, 1);
});

test('a toggle flips on a press', () => {
  const ui = new Interface(renderer());
  let ticked = false;
  const build = (): Node => {
    const made = toggle(ui, 'fog', 'Fog', ticked);
    ticked = made.ticked;
    return made.node;
  };
  ui.frame(VIEW, [], 0.016);
  ui.draw(build());
  ui.frame(VIEW, click(3, 3), 0.016);
  ui.draw(build());
  assert.equal(ticked, true);
});

test('a slider follows the pointer dragged along its track, and its arrows step it', () => {
  const ui = new Interface(renderer());
  let value = 0;
  const build = (): Node => {
    const made = slider(ui, 'volume', value, { low: 0, high: 10, step: 1, width: 100 });
    value = made.value;
    return made.node;
  };
  ui.frame(VIEW, [], 0.016);
  ui.draw(build());
  ui.frame(VIEW, [{ kind: 'down', x: 52, y: 5, button: 0 }], 0.016);
  ui.draw(build());
  assert.equal(value, 5);
  ui.frame(
    VIEW,
    [
      { kind: 'pointer', x: 200, y: 5 },
      { kind: 'up', x: 200, y: 5, button: 0 },
    ],
    0.016,
  );
  ui.draw(build());
  assert.equal(value, 10, 'kept to its highest');
  ui.frame(
    VIEW,
    [
      { kind: 'key', key: 'ArrowLeft' },
      { kind: 'key', key: 'ArrowLeft' },
    ],
    0.016,
  );
  ui.draw(build());
  assert.equal(value, 8, 'the arrows are its own while it has focus');
});

test('a choice opens its list, takes the option pressed, and shuts', () => {
  const ui = new Interface(renderer());
  let chosen = 'a';
  const options = [
    { value: 'a', words: 'Alpha' },
    { value: 'b', words: 'Beta' },
  ];
  const build = (): Node => {
    const made = choice(ui, 'pick', chosen, options);
    chosen = made.chosen;
    return { padding: 10, children: [made.node] };
  };
  ui.frame(VIEW, [], 0.016);
  ui.draw(build());
  ui.frame(VIEW, click(15, 15), 0.016);
  ui.draw(build());
  const beta = ui.boxOf('pick:b');
  assert.ok(beta, 'the list is open');
  ui.frame(VIEW, click(beta.x + 2, beta.y + 2), 0.016);
  ui.draw(build());
  assert.equal(chosen, 'b');
  assert.equal(ui.boxOf('pick:b'), null, 'and shut');
});
