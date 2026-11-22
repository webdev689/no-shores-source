import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIND_IDS, DEFAULTS, type Device, rebind } from '../player/binds.ts';
import type { NavalEvent } from '../network/seaFight.ts';
import { BINDS } from '../player/input.ts';
import {
  CONTROL_GROUPS,
  type Row,
  askedKey,
  boundCap,
  boundWord,
  cellsOf,
  controlWords,
  doesFor,
  shipKeys,
  withKey,
} from './controls.ts';
import { linesOf } from './seaWord.ts';

const ROWS = CONTROL_GROUPS.flatMap((group) => group.controls);
const rowDoing = (does: string): Row => {
  const row = ROWS.find((each) => each.does === does);
  assert.ok(row, does);
  return row;
};
const shown = (does: string, device: Device, binds = DEFAULTS) =>
  cellsOf(rowDoing(does), device, binds).map((cell) => cell.name);

test('the sheet groups its controls as Move, Fight, Arts, Camera, Menus, then the sea and its fight', () => {
  assert.deepEqual(
    CONTROL_GROUPS.map((group) => group.name),
    ['Move', 'Fight', 'Arts', 'Camera', 'Menus', 'Sea', 'Sea fight'],
  );
});

test('every control the player binds is on the sheet, on the keys and the pad buttons it is bound to', () => {
  for (const id of BIND_IDS)
    assert.ok(
      ROWS.some((row) => row.binds.includes(id)),
      id,
    );
  assert.deepEqual(shown('Guard, parry; fire', 'keys'), ['Left button', 'F']);
  assert.deepEqual(shown('Move; climb', 'keys'), ['W', 'A', 'S', 'D']);
  assert.deepEqual(shown('Move; climb', 'pad'), ['pad:Left stick'], 'a stick is written, not bound');
  assert.deepEqual(shown('Crouch; let go', 'pad'), ['pad:B hold']);
  assert.deepEqual(shown('Change shot', 'keys'), ['Wheel']);
  assert.deepEqual(shown('Change shot', 'pad'), ['pad:Left', 'pad:Right']);
  assert.deepEqual(shown('Zoom out or in', 'pad'), [], 'no way on the pad');
  const swapped = rebind(DEFAULTS, { id: 'jump', device: 'keys', place: 0 }, 'c').binds;
  assert.deepEqual(shown('Jump; vault', 'keys', swapped), ['C'], 'as bound now');
});

test('a key that can be bound stands in its slot, a written one in none, and a control bound to none shows one empty', () => {
  const [left, second] = cellsOf(rowDoing('Guard, parry; fire'), 'keys', DEFAULTS);
  assert.deepEqual(
    [left?.slot, second?.slot],
    [
      { id: 'guard', device: 'keys', place: 0 },
      { id: 'guard', device: 'keys', place: 1 },
    ],
  );
  assert.equal(cellsOf(rowDoing('Look round'), 'keys', DEFAULTS)[0]?.slot, null);
  const [sailOn] = cellsOf(rowDoing('Sail on'), 'pad', DEFAULTS);
  assert.deepEqual(sailOn, { name: 'pad:LS up', slot: null }, "a stick's way is shown, never bound");
  assert.deepEqual(cellsOf(rowDoing('Fire'), 'keys', DEFAULTS), [
    { name: '—', slot: { id: 'fire', device: 'keys', place: 0 } },
  ]);
});

test('each row says what it does in a few words, for the keys and the pad', () => {
  for (const row of ROWS)
    for (const device of ['keys', 'pad'] as const) {
      const words = doesFor(row, device);
      assert.match(words, /^[A-Z][^.]*$/, words);
      assert.ok(words.split(' ').length <= 5, words);
    }
  const swing = rowDoing('Swing; aim');
  assert.deepEqual([doesFor(swing, 'keys'), doesFor(swing, 'pad')], ['Swing; aim', 'Swing; fire']);
  assert.equal(controlWords('crouch'), 'Crouch; let go');
});

test("a prompt names a control's first key, or the pad's button, as last played", () => {
  assert.deepEqual([boundWord('use', 'keys'), boundWord('use', 'pad'), boundWord('ashore', 'pad')], ['E', 'X', '']);
  assert.deepEqual([boundCap('confirm', 'keys'), boundCap('confirm', 'pad')], ['Enter', 'pad:A']);
});

test("the ship's bar shows what fires a broadside (the aim's release, the pad's fire), the burst, the brace and the load's step as bound", () => {
  assert.deepEqual(shipKeys('keys', DEFAULTS), { aim: 'Right button', burst: 'Shift', brace: 'C', load: 'Wheel' });
  assert.deepEqual(shipKeys('pad', DEFAULTS), { aim: 'pad:RT', burst: 'pad:LS', brace: 'pad:B', load: 'pad:Right' });
  const bound = rebind(DEFAULTS, { id: 'shotNext', device: 'keys', place: 0 }, 'x').binds ?? DEFAULTS;
  const braced = rebind(bound, { id: 'brace', device: 'keys', place: 0 }, 'v').binds ?? bound;
  assert.deepEqual([shipKeys('keys', braced).load, shipKeys('keys', braced).brace], ['X', 'V']);
});

test("a press names its control's key as bound now, on the keys or the pad played last, and none where it has none", () => {
  const map = rebind(DEFAULTS, { id: 'map', device: 'keys', place: 0 }, 'j').binds ?? DEFAULTS;
  BINDS.set(map);
  assert.equal(withKey('Map', 'map'), 'Map  J');
  BINDS.device = 'pad';
  assert.deepEqual([withKey('Map', 'map'), withKey('Dock', 'ashore')], ['Map  Up', 'Dock']);
  const lines = linesOf([], [{ kind: 'Struck', ship: 1 } as NavalEvent], {
    kinds: new Map(),
    ports: [],
    nameOf: () => null,
  });
  assert.deepEqual(lines, ['Its colours are down: come alongside and press X to board it.']);
  BINDS.device = 'keys';
  BINDS.set(DEFAULTS);
});

test('the sheet says how Dusk Daggers aim: on the First Tenet’s key, held', () => {
  const daggers = ROWS.find((row) => row.binds.includes('tenetOne'));
  assert.match(daggers?.does ?? '', /hold/i);
  assert.match(daggers?.does ?? '', /dagger/i);
});

test('a line asks for a control by its key before its mouse button, or by its pad button', () => {
  assert.deepEqual([askedKey('guard'), askedKey('swing'), askedKey('dodge')], ['F', 'Right button', 'V']);
  BINDS.device = 'pad';
  assert.deepEqual([askedKey('guard'), askedKey('guard', true)], ['LT', 'pad:LT']);
  BINDS.device = 'keys';
});
