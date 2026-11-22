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
    'overlook-discovery': '["saltmere"]',
    'overlook-content': 'not a key the game keeps here',
    'daggerfall.save': 'another project on the same origin',
  });
  moveKept(storage);
  assert.deepEqual(Object.fromEntries(storage.held), {
    'noshores.session@https://accounts.test': 'token',
    'noshores.worldEditor.painting': '{"runs":[]}',
    'noshores-discovery': '["saltmere"]',
    'overlook-content': 'not a key the game keeps here',
    'daggerfall.save': 'another project on the same origin',
  });
});

test('a key already kept under the game’s own name stays, and the former one goes', () => {
  const storage = storageOf({ 'overlook.musicVolume': '0.2', 'noshores.musicVolume': '0.8' });
  moveKept(storage);
  assert.deepEqual(Object.fromEntries(storage.held), { 'noshores.musicVolume': '0.8' });
});
