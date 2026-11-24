import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveKept } from './keptNames.ts';

/** A storage held in a map, as a page's is. */
function storageOf(entries: Record<string, string>): Storage & { held: Map<string, string> } {
  const held = new Map(Object.entries(entries));
  return {
    held,
    get length() {
      return held.size;
    },
    key: (index: number) => [...held.keys()][index] ?? null,
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
    removeItem: (key: string) => void held.delete(key),
    clear: () => held.clear(),
  };
}

test('what the game kept under its former name moves to its own, and nothing else moves', () => {
  const storage = storageOf({
    'overlook.session@https://accounts.test': 'token',
    'overlook.worldEditor.painting': '{"runs":[]}',
    'overlook-content': 'not a key the game keeps here',
    'daggerfall.save': 'another project on the same origin',
  });
  moveKept(storage);
  assert.deepEqual(Object.fromEntries(storage.held), {
    'noshores.session@https://accounts.test': 'token',
    'noshores.worldEditor.painting': '{"runs":[]}',
    'overlook-content': 'not a key the game keeps here',
    'daggerfall.save': 'another project on the same origin',
  });
});

test('a former key moves over one already under the game’s own name: a sign-in that could not move before wins', () => {
  const storage = storageOf({ 'overlook.session': 'account', 'noshores.session': 'guest made since' });
  moveKept(storage);
  assert.deepEqual(Object.fromEntries(storage.held), { 'noshores.session': 'account' });
});

test('a key too large to set again stays where it was, and the keys after it still move', () => {
  const storage = storageOf({ 'overlook.worldEditor.painting': 'x'.repeat(100), 'overlook.session': 'account' });
  const set = storage.setItem;
  // Room for 60 characters a key, as a full quota leaves.
  storage.setItem = (key, value) => {
    if (value.length > 60 && !key.startsWith('overlook.')) throw new DOMException('full', 'QuotaExceededError');
    set(key, value);
  };
  moveKept(storage);
  assert.deepEqual(Object.fromEntries(storage.held), {
    'overlook.worldEditor.painting': 'x'.repeat(100),
    'noshores.session': 'account',
  });
});
