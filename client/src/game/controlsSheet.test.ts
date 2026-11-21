import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layout } from '../ui/layout.ts';
import type { Node } from '../ui/node.ts';
import { FAKE_FACE, fakeInterface, laidWith, wordsOf } from '../ui/uiForTests.ts';
import { DEFAULTS } from '../player/binds.ts';
import { BINDS } from '../player/input.ts';
import { CONTROL_GROUPS, cellsOf, doesFor } from './controls.ts';
import { ControlsSheet, columnsOf, slotId } from './controlsSheet.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';

/** The sheet hearing the page's keys, with a listener after it standing for the game. */
function listening(may = () => true) {
  const { window } = fakePage();
  const sheet = new ControlsSheet();
  sheet.listen(may);
  const game: string[] = [];
  addEventListener('keydown', (event) => game.push((event as KeyboardEvent).key));
  const key = (name: string) => window.dispatchEvent(new FakeEvent('keydown', { key: name }));
  return { sheet, game, key };
}

test('K opens the sheet and K or Escape closes it; while it is open no key reaches the game', () => {
  const { sheet, game, key } = listening();
  key('w');
  assert.deepEqual(game, ['w'], 'closed, the game hears its keys');
  key('K');
  assert.ok(sheet.open);
  key('w');
  key(' ');
  assert.deepEqual(game, ['w'], 'open, it hears none');
  key('k');
  assert.ok(!sheet.open);
  key('k');
  key('Escape');
  assert.ok(!sheet.open);
  assert.deepEqual(game, ['w'], 'not even the Escape that closed it');
});

test('K does nothing where the strip does not offer it', () => {
  const { sheet, game, key } = listening(() => false);
  key('k');
  assert.ok(!sheet.open);
  assert.deepEqual(game, ['k']);
});

/** The sheet open in a view `width` by `height`, drawn twice so what was laid is known; the words a screen reader
 *  heard. */
function openIn(width: number, height: number) {
  const sheet = new ControlsSheet();
  const { ui, step } = fakeInterface(width, height);
  const heard: string[] = [];
  ui.speak = (words) => heard.push(words);
  sheet.toggle();
  const view = { width, height, big: width >= 1500 && height >= 900 };
  const root = (): Node => ({ width: 'grow', height: 'grow', children: [sheet.node(ui, view)] });
  step(root);
  step(root);
  return { sheet, ui, heard, root, step };
}

test('opening moves the focus to the first key, and a screen reader hears the sheet and that key', () => {
  const { ui, heard } = openIn(1280, 720);
  assert.equal(ui.focusedId, 'controls:forward:keys:0');
  assert.deepEqual(heard, ['All controls', 'Move; climb: W']);
});

test('the sheet lists every key and button that can be bound once, inside the view from a phone to 1440p', () => {
  const rows = CONTROL_GROUPS.flatMap((group) => group.controls);
  const slots = rows.flatMap((row) =>
    (['keys', 'pad'] as const).flatMap((device) => cellsOf(row, device, DEFAULTS).filter((cell) => cell.slot)),
  );
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    const { ui, root } = openIn(width, height);
    const laid = layout(root(), { x: 0, y: 0, width, height }, { face: FAKE_FACE, scrollOf: () => 0 });
    const presses = laid.filter((each) => each.node.id?.startsWith('controls:') && each.node.press);
    // Every key that can be bound, and the sheet's Close and Reset to defaults.
    assert.equal(presses.length, slots.length + 2, `${width} by ${height}`);
    for (const row of rows) assert.ok(wordsOf(laid).includes(row.does), row.does);
    const box = ui.boxOf('controls');
    assert.ok(box && box.x >= 0 && box.y >= 0, `${width} by ${height}`);
    assert.ok(box.x + box.width <= width && box.y + box.height <= height, `${width} by ${height}`);
    const list = laidWith(laid, 'controls:list');
    assert.ok(list && list.box.x + list.box.width <= width, `its list in the view at ${width} by ${height}`);
  }
});

test('its Close press closes it', () => {
  const { sheet, ui, root, step } = openIn(1280, 720);
  const box = ui.boxOf('controls:close');
  assert.ok(box);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  step(root, [{ kind: 'pointer', x, y }]);
  step(root, [
    { kind: 'down', x, y, button: 0 },
    { kind: 'up', x, y, button: 0 },
  ]);
  assert.ok(!sheet.open);
});

test('the groups stand in columns in their order, each near an even share of the rows', () => {
  assert.deepEqual(columnsOf(CONTROL_GROUPS, 1), [CONTROL_GROUPS]);
  const two = columnsOf(CONTROL_GROUPS, 2);
  assert.equal(two.length, 2);
  assert.deepEqual(two.flat(), CONTROL_GROUPS);
  const rows = two.map((column) => column.reduce((sum, group) => sum + group.controls.length + 1, 0));
  assert.ok(Math.abs((rows[0] ?? 0) - (rows[1] ?? 0)) <= 16, rows.join(' against '));
});

/** The sheet open on a page whose keys it hears, its binds the defaults; `press` clicks a press of it, `key` sends a
 *  key down, and `frame` draws it again after `seconds` with the pad's buttons `padDown` down. */
function bindingSheet() {
  BINDS.set(DEFAULTS);
  BINDS.device = 'keys';
  const { window } = fakePage();
  const opened = openIn(1280, 720);
  const { sheet, ui, root, step } = opened;
  sheet.listen(() => true);
  const press = (id: string) => {
    const box = ui.boxOf(id);
    assert.ok(box, id);
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    step(root, [{ kind: 'pointer', x, y }]);
    step(root, [
      { kind: 'down', x, y, button: 0 },
      { kind: 'up', x, y, button: 0 },
    ]);
  };
  const key = (name: string) => window.dispatchEvent(new FakeEvent('keydown', { key: name }));
  const frame = (seconds = 1 / 60, padDown: ReadonlySet<string> = new Set()) => {
    sheet.frame(seconds, padDown);
    step(root);
  };
  const footWords = () =>
    wordsOf(layout(root(), { x: 0, y: 0, width: 1280, height: 720 }, { face: FAKE_FACE, scrollOf: () => 0 }));
  return { ...opened, press, key, frame, footWords };
}

test('a key chosen waits for the next; one another control there uses is swapped, and the sheet says so', () => {
  const { sheet, press, key, frame, footWords } = bindingSheet();
  press(slotId({ id: 'jump', device: 'keys', place: 0 }));
  assert.deepEqual(sheet.rebinding.slot, { id: 'jump', device: 'keys', place: 0 });
  assert.ok(!sheet.takesKeys, 'the drawn keys rest while it waits');
  key('c');
  frame();
  assert.deepEqual([BINDS.now.jump.keys, BINDS.now.crouch.keys], [['c'], [' ']]);
  assert.ok(footWords().includes('Swapped with Crouch; let go'));
  assert.ok(sheet.open && sheet.takesKeys);
  BINDS.set(DEFAULTS);
});

test('Escape while a key waits cancels it and leaves the sheet open; Reset to defaults binds every control afresh', () => {
  const { sheet, press, key } = bindingSheet();
  press(slotId({ id: 'heal', device: 'keys', place: 0 }));
  key('Escape');
  assert.equal(sheet.rebinding.slot, null);
  assert.ok(sheet.open);
  assert.ok(!sheet.takesKeys, 'the Escape that cancelled it never reaches the drawn keys, to close the sheet too');
  sheet.frame(1 / 60, new Set());
  assert.ok(sheet.takesKeys);
  assert.deepEqual(BINDS.now, DEFAULTS);
  press(slotId({ id: 'heal', device: 'keys', place: 0 }));
  key('h');
  assert.deepEqual(BINDS.now.heal.keys, ['h']);
  press('controls:reset');
  assert.deepEqual(BINDS.now, DEFAULTS);
});

test("a pad's button chosen takes the pad's next press, held or tapped, and gives up after a while unpressed", () => {
  const { sheet, press, frame } = bindingSheet();
  // The pad's A that chose it is down as it starts, and binds nothing.
  frame(1 / 60, new Set(['A']));
  press(slotId({ id: 'mount', device: 'pad', place: 0 }));
  frame(1 / 60, new Set(['A']));
  frame(1 / 60, new Set());
  frame(1 / 60, new Set(['RB']));
  frame(0.4, new Set(['RB']));
  assert.deepEqual(BINDS.now.mount.pad, ['RB hold']);
  press(slotId({ id: 'heal', device: 'pad', place: 0 }));
  frame(10);
  assert.equal(sheet.rebinding.slot, null);
  assert.deepEqual(BINDS.now.heal.pad, ['Down']);
  BINDS.set(DEFAULTS);
});

test('with the pad played last, the sheet says what the pad does, and its B steps out of it', () => {
  const { sheet, root, step, footWords } = bindingSheet();
  BINDS.device = 'pad';
  step(root);
  const swing = CONTROL_GROUPS.flatMap((group) => group.controls).find((row) => row.binds.includes('swing'));
  assert.ok(swing && footWords().includes(doesFor(swing, 'pad')));
  assert.ok(footWords().includes('Close View'));
  step(root, [{ kind: 'pad', button: 'back' }]);
  assert.ok(!sheet.open);
  BINDS.device = 'keys';
});
