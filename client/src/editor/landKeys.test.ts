import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landKey } from './landKeys.ts';

type Held = Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey' | 'altGraph', boolean>>;

const press = (key: string, { altGraph = false, ...held }: Held = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...held,
  getModifierState: (modifier: string) => modifier === 'AltGraph' && altGraph,
});

test('a plain key comes to the Land mode lower-cased', () => {
  assert.equal(landKey(press('L')), 'l');
  assert.equal(landKey(press('3')), '3');
  assert.equal(landKey(press('Escape')), 'escape');
});

test('Ctrl or Cmd with Z undoes, with Shift and Z or with Y redoes', () => {
  assert.equal(landKey(press('z', { ctrlKey: true })), 'undo');
  assert.equal(landKey(press('Z', { metaKey: true, shiftKey: true })), 'redo');
  assert.equal(landKey(press('y', { ctrlKey: true })), 'redo');
});

test("the browser's own shortcuts give the Land mode nothing", () => {
  for (const key of ['l', 'k', 'b', 'g', 'v', '1', '9', '[', ']'])
    for (const held of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }])
      assert.equal(landKey(press(key, held)), null, `${JSON.stringify(held)} ${key}`);
  assert.equal(landKey(press('z', { altKey: true })), null, 'Alt+Z is no undo');
});

test('a key typed with AltGr, which comes as Ctrl and Alt held, is typing and reaches the Land mode', () => {
  assert.equal(landKey(press('[', { ctrlKey: true, altKey: true, altGraph: true })), '[');
  assert.equal(landKey(press('[', { ctrlKey: true, altKey: true })), null, 'Ctrl+Alt+[ without AltGr is a shortcut');
});
