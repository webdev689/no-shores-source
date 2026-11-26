import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEPT_MOST, readKept, writeKept } from './mapKept.ts';

/** A storage of the browser's shape, in memory. */
function memory(): Pick<Storage, 'getItem' | 'setItem'> {
  const kept = new Map<string, string>();
  return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) };
}

const view = { yaw: 1, pitch: 1.2, scale: 6, centre: [1, 2, 0] as const };

test('a dungeon keeps its view and what it revealed, and gives them back', () => {
  const storage = memory();
  writeKept('crypt', { view, cells: [3, 4, 5] }, storage);
  assert.deepEqual(readKept('crypt', storage), { view, cells: [3, 4, 5] });
  assert.equal(readKept('halls', storage), null);
});

test('only the last dungeons are kept, the one written last the newest', () => {
  const storage = memory();
  for (let each = 0; each <= KEPT_MOST; each++) writeKept(`dungeon ${each}`, { view: null, cells: [each] }, storage);
  assert.equal(readKept('dungeon 0', storage), null);
  writeKept('dungeon 1', { view: null, cells: [9] }, storage);
  writeKept('another', { view: null, cells: [] }, storage);
  assert.deepEqual(readKept('dungeon 1', storage)?.cells, [9], 're-written, it is kept as the newest');
});

test('a storage that is broken or refuses keeps nothing and breaks nothing', () => {
  const broken = {
    getItem: () => '{not json',
    setItem: () => {
      throw new Error('full');
    },
  };
  assert.equal(readKept('crypt', broken), null);
  assert.doesNotThrow(() => writeKept('crypt', { view, cells: [] }, broken));
  assert.equal(readKept('crypt', null), null);
});
