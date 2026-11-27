import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PACES, dialoguePace, movesOnByItself, setDialoguePace } from './pace.ts';

/** A browser's storage held in a map. */
function storage(): Pick<Storage, 'getItem' | 'setItem'> {
  const kept = new Map<string, string>();
  return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) };
}

test('dialogue waits for a click by default, and Auto, once chosen, is kept in this browser', () => {
  const kept = storage();
  assert.equal(dialoguePace(kept), 'click');
  assert.equal(PACES[0]?.value, 'click', 'Settings lists the default first');
  setDialoguePace('auto', kept);
  assert.equal(dialoguePace(kept), 'auto');
  setDialoguePace('click', kept);
  assert.equal(dialoguePace(kept), 'click');
  assert.equal(dialoguePace(undefined), 'click', 'no storage at all');
});

test('a browser that refuses to keep the choice still holds it until the page closes', () => {
  const refusing = {
    getItem: () => {
      throw new Error('refused');
    },
    setItem: () => {
      throw new Error('refused');
    },
  };
  assert.equal(dialoguePace(refusing), 'click');
  setDialoguePace('auto', refusing);
  assert.equal(dialoguePace(refusing), 'auto');
  setDialoguePace('click', storage());
  assert.equal(dialoguePace(refusing), 'click', 'kept again, the storage speaks');
});

test('a line said in a fight moves on by itself under either pace; any other only under Auto', () => {
  const kept = storage();
  assert.equal(movesOnByItself(false, kept), false);
  assert.equal(movesOnByItself(true, kept), true);
  setDialoguePace('auto', kept);
  assert.equal(movesOnByItself(false, kept), true);
  assert.equal(movesOnByItself(true, kept), true);
});
