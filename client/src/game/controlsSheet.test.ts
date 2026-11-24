import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layout } from '../ui/layout.ts';
import type { Node } from '../ui/node.ts';
import type { UiEvent } from '../ui/ui.ts';
import { FAKE_FACE, fakeInterface, laidWith, wordsOf } from '../ui/uiForTests.ts';
import { type BindId, DEFAULTS, overridesOf, readOverrides } from '../player/binds.ts';
import { BINDS } from '../player/input.ts';
import { CONTROL_GROUPS, cellsOf, doesFor } from './controls.ts';
import { ControlsSheet, columnsOf, slotId, spokenKeys } from './controlsSheet.ts';
import { Rebinding } from './rebinding.ts';
import { FakeEvent, fakePage } from './pageForTests.ts';

/** The sheet hearing the page's keys, with a listener after it standing for the game. */
function listening(may = () => true) {
  const { window } = fakePage();
  const sheet = new ControlsSheet(new Rebinding());
  sheet.listen(may);
  const game: string[] = [];
  addEventListener('keydown', (event) => game.push((event as KeyboardEvent).key));
  const key = (name: string) => window.dispatchEvent(new FakeEvent('keydown', { key: name }));
  const press = (button: number) => window.dispatchEvent(Object.assign(new FakeEvent('mousedown'), { button }));
  return { sheet, game, key, press };
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

test('with the sheet shut, a key chosen in Settings waits on its binding: the next key or button binds it, unheard', () => {
  const { sheet, game, key, press } = listening(() => false);
  const before = BINDS.now;
  try {
    sheet.rebinding.start({ id: 'jump', device: 'keys', place: 0 }, new Set());
    key('j');
    assert.deepEqual(BINDS.now.jump.keys, ['j'], 'bound');
    assert.deepEqual(game, [], 'the game never heard it');
    assert.ok(!sheet.open, 'nor did the sheet open');
    sheet.rebinding.start({ id: 'dodge', device: 'keys', place: 0 }, new Set());
    press(3);
    assert.deepEqual(BINDS.now.dodge.keys[0], 'mouse3', 'a mouse button binds too');
  } finally {
    BINDS.set(before);
  }
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

test('the keys move among its controls, the interface hearing them only while it is open', () => {
  const sheet = new ControlsSheet();
  const { ui } = fakeInterface(1280, 720);
  const view = { width: 1280, height: 720, big: false };
  // As the game's frame runs it: no menu up, so the interface takes the keys only while the sheet takes them.
  const step = (events: UiEvent[] = []) => {
    ui.frame({ width: 1280, height: 720, scale: 1 }, events, 1 / 60, true, sheet.takesKeys);
    ui.draw({ width: 'grow', height: 'grow', children: [sheet.node(ui, view)] });
  };
  const keys = (id: BindId) => slotId({ id, device: 'keys', place: 0 });
  sheet.toggle();
  step();
  step();
  assert.equal(ui.focusedId, keys('forward'));
  step([{ kind: 'key', key: 'Tab' }]);
  assert.equal(ui.focusedId, keys('left'));
  step([{ kind: 'key', key: 'ArrowDown' }]);
  assert.equal(ui.focusedId, keys('run'));
  step([{ kind: 'key', key: 'Tab', shift: true }]);
  assert.equal(ui.focusedId, keys('right'));
});

test('Tab reaches every press on the sheet once round, a control shown in several rows among them', () => {
  const sheet = new ControlsSheet();
  const { ui } = fakeInterface(390, 844);
  const view = { width: 390, height: 844, big: false };
  const step = (events: UiEvent[] = []) => {
    ui.frame({ width: 390, height: 844, scale: 1 }, events, 1 / 60, true, sheet.takesKeys);
    ui.draw({ width: 'grow', height: 'grow', children: [sheet.node(ui, view)] });
  };
  sheet.toggle();
  step();
  step();
  const root = sheet.node(ui, view);
  assert.ok(root);
  const laid = layout(root, { x: 0, y: 0, width: 390, height: 844 }, { face: FAKE_FACE, scrollOf: () => 0 });
  const presses = laid.flatMap((each) => (each.node.press && each.node.id ? [each.node.id] : []));
  assert.equal(new Set(presses).size, presses.length, 'each press its own id');
  const reached = new Set<string>();
  for (let tab = 0; tab < presses.length; tab++) {
    reached.add(ui.focusedId ?? '');
    step([{ kind: 'key', key: 'Tab' }]);
  }
  assert.deepEqual([...reached].sort(), [...presses].sort());
});

test('a screen reader hears a sign key by its name', () => {
  assert.equal(spokenKeys(','), 'Comma');
  assert.equal(spokenKeys('[ / ]'), 'Left bracket or Right bracket');
  assert.equal(spokenKeys('W / A'), 'W or A');
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

test('a mouse button binds only a control that hears one, and only one the accounts would keep', () => {
  const { sheet, footWords } = bindingSheet();
  sheet.rebinding.start({ id: 'use', device: 'keys', place: 0 }, new Set());
  sheet.rebinding.mouse(0);
  assert.deepEqual(BINDS.now, DEFAULTS, 'Use acts on a key going down, which no mouse button is');
  assert.equal(sheet.rebinding.slot, null);
  assert.ok(footWords().includes('Use takes keys only'));
  sheet.rebinding.start({ id: 'jump', device: 'keys', place: 0 }, new Set());
  sheet.rebinding.mouse(5);
  assert.deepEqual(sheet.rebinding.slot, { id: 'jump', device: 'keys', place: 0 }, 'a sixth button is no name kept');
  sheet.rebinding.mouse(1);
  assert.deepEqual(BINDS.now.jump.keys, ['mouse1']);
  assert.deepEqual(readOverrides(JSON.parse(JSON.stringify(overridesOf(BINDS.now)))), overridesOf(BINDS.now));
  BINDS.set(DEFAULTS);
});
