import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIND_IDS, DEFAULTS, type Device, rebind } from '../player/binds.ts';
import { CONTROL_GROUPS, type Row, boundCap, boundWord, cellsOf, controlWords, doesFor } from './controls.ts';

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
