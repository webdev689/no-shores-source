import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layout } from '../ui/layout.ts';
import type { Node } from '../ui/node.ts';
import { FAKE_FACE, fakeInterface, laidWith, wordsOf } from '../ui/uiForTests.ts';
import { CONTROL_GROUPS } from './controls.ts';
import { ControlsSheet, columnsOf } from './controlsSheet.ts';
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

test('opening moves the focus to the first control, and a screen reader hears the sheet and that control', () => {
  const { ui, heard } = openIn(1280, 720);
  assert.equal(ui.focusedId, 'controls:Move:0');
  assert.deepEqual(heard, [
    'All controls',
    'W or A or S or D: Walk. Hanging from a ledge, A and D move along it and W climbs over.',
  ]);
});

test('the sheet lists every control once, inside the view from a phone to 1440p', () => {
  const count = CONTROL_GROUPS.reduce((sum, group) => sum + group.controls.length, 0);
  for (const [width, height] of [
    [390, 844],
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
  ] as const) {
    const { ui, root } = openIn(width, height);
    const laid = layout(root(), { x: 0, y: 0, width, height }, { face: FAKE_FACE, scrollOf: () => 0 });
    const rows = laid.filter((each) => each.node.id?.startsWith('controls:') && each.node.focusable);
    assert.equal(rows.length, count, `${width} by ${height}`);
    for (const group of CONTROL_GROUPS)
      for (const control of group.controls) assert.ok(wordsOf(laid).includes(control.does), control.does);
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
