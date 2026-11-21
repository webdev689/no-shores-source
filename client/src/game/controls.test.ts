import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Action, BINDINGS } from '../player/input.ts';
import { CONTROL_GROUPS, keyName } from './controls.ts';

const CONTROLS = CONTROL_GROUPS.flatMap((group) => group.controls);

test('the sheet groups its controls as Move, Fight, Arts, Camera, Menus, then the sea and its fight', () => {
  assert.deepEqual(
    CONTROL_GROUPS.map((group) => group.name),
    ['Move', 'Fight', 'Arts', 'Camera', 'Menus', 'Sea', 'Sea fight'],
  );
});

test("every one of the player's bindings is listed once, on the keys it is bound to", () => {
  for (const action of Object.keys(BINDINGS) as Action[]) {
    const listing = CONTROLS.filter((control) => control.binds.includes(action));
    assert.equal(listing.length, 1, action);
    const keys = listing[0]?.keys.split(' / ') ?? [];
    for (const key of BINDINGS[action]) assert.ok(keys.includes(keyName(key)), `${action}: ${keyName(key)}`);
  }
  assert.equal(CONTROLS.find((control) => control.binds.includes('guard'))?.keys, 'Left button / F');
  assert.equal(CONTROLS.find((control) => control.binds.includes('forward'))?.keys, 'W / A / S / D');
});

test('no group lists a key twice, and each control says what it does in a sentence', () => {
  for (const group of CONTROL_GROUPS) {
    const keys = group.controls.map((control) => control.keys);
    assert.equal(new Set(keys).size, keys.length, group.name);
  }
  for (const control of CONTROLS) assert.match(control.does, /^[A-Z].*\.$/, control.keys);
});
