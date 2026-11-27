import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEPT_LETTERS, KEPT_MOST, readKept, writeKept } from './mapKept.ts';

/** A storage of the browser's shape, in memory. */
function memory(): Pick<Storage, 'getItem' | 'setItem'> {
  const kept = new Map<string, string>();
  return { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) };
}

const view = { yaw: 1, pitch: 1.2, scale: 6, centre: [1, 2, 0] as const };

test('a dungeon keeps its view and what it revealed, and gives them back', () => {
  const storage = memory();
  writeKept('crypt', { view, cells: [3, 4, 5], print: 'p' }, storage);
  assert.deepEqual(readKept('crypt', 'p', storage), { view, cells: [3, 4, 5], print: 'p' });
  assert.equal(readKept('halls', 'p', storage), null);
});

test('only the last dungeons are kept, the one written last the newest', () => {
  const storage = memory();
  for (let each = 0; each <= KEPT_MOST; each++)
    writeKept(`dungeon ${each}`, { view: null, cells: [each], print: 'p' }, storage);
  assert.equal(readKept('dungeon 0', 'p', storage), null);
  writeKept('dungeon 1', { view: null, cells: [9], print: 'p' }, storage);
  writeKept('another', { view: null, cells: [], print: 'p' }, storage);
  assert.deepEqual(readKept('dungeon 1', 'p', storage)?.cells, [9], 're-written, it is kept as the newest');
});

test('a dungeon of many cells is kept small, and a full storage lets the oldest go to keep the newest', () => {
  const kept = new Map<string, string>();
  const small = {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (value.length > 6000) throw new Error('full');
      kept.set(key, value);
    },
  };
  const cells = Array.from({ length: 12_000 }, (unused, cell) => cell * 2);
  writeKept('great', { view: null, cells, print: 'p' }, small);
  assert.deepEqual(readKept('great', 'p', small)?.cells, cells, 'twelve thousand cells kept in under 6,000 letters');
  for (let each = 0; each < 5; each++) writeKept(`more ${each}`, { view: null, cells, print: 'p' }, small);
  assert.deepEqual(readKept('more 4', 'p', small)?.cells, cells);
  assert.equal(readKept('great', 'p', small), null);
});

test('a storage that is broken or refuses keeps nothing and breaks nothing', () => {
  const broken = {
    getItem: () => '{not json',
    setItem: () => {
      throw new Error('full');
    },
  };
  assert.equal(readKept('crypt', 'p', broken), null);
  assert.doesNotThrow(() => writeKept('crypt', { view, cells: [], print: 'p' }, broken));
  assert.equal(readKept('crypt', 'p', null), null);
});

test('a map kept for another layout of the same dungeon is dropped, never drawn over the new one', () => {
  const storage = memory();
  writeKept('crypt', { view, cells: [3, 4, 5], print: '20x30x1:1234' }, storage);
  assert.equal(readKept('crypt', '20x30x1:9999', storage), null);
  assert.deepEqual(readKept('crypt', '20x30x1:1234', storage)?.cells, [3, 4, 5]);
});

test('the kept maps stay under their budget of letters even where the storage never refuses', () => {
  const storage = memory();
  const cells = Array.from({ length: 100_000 }, (unused, cell) => cell);
  for (let each = 0; each < KEPT_MOST; each++) writeKept(`great ${each}`, { view: null, cells, print: 'p' }, storage);
  assert.ok((storage.getItem('noShores.dungeonMaps') ?? '').length <= KEPT_LETTERS);
  assert.deepEqual(readKept(`great ${KEPT_MOST - 1}`, 'p', storage)?.cells, cells, 'the newest is kept');
  assert.equal(readKept('great 0', 'p', storage), null, 'the oldest went');
});
