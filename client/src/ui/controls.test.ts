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

test('a slider in steps of a fraction keeps whole steps, never a float that strays from them', () => {
  const ui = new Interface(renderer());
  let value = 0.25;
  const build = (): Node => {
    const made = slider(ui, 'trail', value, { low: 0.25, high: 2.5, step: 0.05, width: 100 });
    value = made.value;
    return made.node;
  };
  ui.frame(VIEW, [], 0.016);
  ui.draw(build());
  ui.frame(VIEW, click(2, 5), 0.016);
  ui.draw(build());
  assert.equal(value, 0.3);
  for (let step = 0; step < 6; step++) {
    ui.frame(VIEW, [{ kind: 'key', key: 'ArrowRight' }], 0.016);
    ui.draw(build());
  }
  assert.equal(value, 0.6, 'never 0.6000000000000001');
});

test("a choice's long list scrolls inside a height of its own, so every option can be reached", () => {
  const ui = new Interface(renderer());
  const options = Array.from({ length: 60 }, (_unused, index) => ({ value: `o${index}`, words: `Option ${index}` }));
  const build = (): Node => ({ padding: 10, children: [choice(ui, 'many', 'o0', options).node] });
  ui.frame(VIEW, [], 0.016);
  ui.draw(build());
  ui.frame(VIEW, click(15, 15), 0.016);
  ui.draw(build());
  const list = ui.boxOf('many:list');
  assert.ok(list && list.height <= 240, 'held to its height');
  ui.frame(VIEW, [{ kind: 'wheel', x: list.x + 5, y: list.y + 5, dy: 10_000 }], 0.016);
  ui.draw(build());
  const last = ui.boxOf('many:o59');
  assert.ok(last && last.y + last.height <= list.y + list.height + 1, 'the last option scrolled into sight');
});

test('a slider whose low end has more decimals than its step can still stand at its low end', () => {
  const ui = new Interface(renderer());
  let value = 1;
  const build = (): Node => {
    const made = slider(ui, 'low', value, { low: 0.25, high: 2.5, step: 0.1, width: 100 });
    value = made.value;
    return made.node;
  };
  ui.frame(VIEW, [], 0.016);
  ui.draw(build());
  ui.frame(VIEW, click(0, 5), 0.016);
  ui.draw(build());
  assert.equal(value, 0.25);
});

test("the pad's cross up and down leaves a slider, its left and right step it, and each step says the value", () => {
  const ui = new Interface(renderer());
  const heard: string[] = [];
  ui.speak = (words) => heard.push(words);
  let volume = 50;
  const build = (): Node => {
    const made = slider(ui, 'volume', volume, { low: 0, high: 100, step: 5, width: 200 });
    volume = made.value;
    return {
      direction: 'column',
      gap: 10,
      children: [
        { id: 'above', press: true, width: 200, height: 20 },
        made.node,
        { id: 'below', press: true, width: 200, height: 20 },
      ],
    };
  };
  const step = (events: UiEvent[] = []) => {
    ui.frame(VIEW, events, 0.016);
    ui.draw(build());
  };
  step();
  ui.focusOn('volume');
  step();
  heard.length = 0;
  step([{ kind: 'pad', button: 'right' }]);
  step([{ kind: 'key', key: 'ArrowLeft' }]);
  step([{ kind: 'key', key: 'ArrowLeft' }]);
  assert.equal(volume, 45);
  assert.deepEqual(heard, ['55', '50', '45'], 'each step said');
  step([{ kind: 'pad', button: 'down' }]);
  assert.equal(ui.focusedId, 'below');
  step([{ kind: 'pad', button: 'up' }]);
  step([{ kind: 'pad', button: 'up' }]);
  assert.equal(ui.focusedId, 'above', 'up through the slider and past it');
  assert.equal(volume, 45, 'the cross up and down moved no value');
});

test("a choice's open list shuts on a press anywhere but on it", () => {
  const ui = new Interface(renderer());
  let chosen = 'a';
  const build = (): Node => {
    const made = choice(ui, 'pick', chosen, [
      { value: 'a', words: 'Alpha' },
      { value: 'b', words: 'Beta' },
    ]);
    chosen = made.chosen;
    return {
      padding: 10,
      direction: 'column',
      children: [made.node, { id: 'other', press: true, width: 50, height: 20 }],
    };
  };
  const step = (events: UiEvent[] = []) => {
    ui.frame(VIEW, events, 0.016);
    ui.draw(build());
  };
  step();
  step(click(15, 15));
  assert.ok(ui.boxOf('pick:list'), 'open');
  const list = ui.boxOf('pick:list');
  assert.ok(list);
  step([{ kind: 'wheel', x: list.x + 2, y: list.y + 2, dy: 5 }]);
  assert.ok(ui.boxOf('pick:list'), 'the wheel over it keeps it open');
  step(click(390, 290));
  assert.equal(ui.boxOf('pick:list'), null, 'a press on the empty ground shut it');
  assert.equal(chosen, 'a');
});

test('a choice inside a window floated over the screen opens its list over that window, and an option there is chosen', () => {
  for (const layer of [20, 50]) {
    const ui = new Interface(renderer());
    let chosen = 'a';
    const options = [
      { value: 'a', words: 'Alpha' },
      { value: 'b', words: 'Beta' },
    ];
    // A window floated over the whole view that takes the pointer, as the menu's and the launcher's are.
    const build = (): Node => {
      const made = choice(ui, 'pick', chosen, options);
      chosen = made.chosen;
      const window: Node = {
        width: 400,
        height: 300,
        solid: true,
        modal: true,
        role: 'window',
        float: { to: 'screen', z: layer },
        padding: 10,
        children: [made.node],
      };
      return { children: [window] };
    };
    ui.frame(VIEW, [], 0.016);
    ui.draw(build());
    ui.frame(VIEW, click(15, 15), 0.016);
    ui.draw(build());
    const beta = ui.boxOf('pick:b');
    assert.ok(beta, `the list is open in a window at ${layer}`);
    const drawn = ui.laid.map((each) => each.node.id);
    assert.ok(drawn.indexOf('pick:list') > drawn.indexOf('pick'), `the list is drawn over its window at ${layer}`);
    ui.frame(VIEW, click(beta.x + 2, beta.y + 2), 0.016);
    ui.draw(build());
    assert.equal(chosen, 'b', `an option over a window at ${layer} is chosen`);
  }
});
