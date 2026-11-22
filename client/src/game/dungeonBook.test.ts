import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLOUR_LAYERS } from '../city/pictures.ts';
import { smallBook } from './dungeonBook.ts';
import { COLOUR } from './dungeonMesh.ts';

test("a dungeon set's pictures turn to the island's climate, each once, and a flame keeps the city's glow", () => {
  const book = smallBook({ climate: 'temperate', season: 'summer' }, [
    [123, 0, 'wall'],
    [123, 2, 'floor'],
    [123, 0, 'wall'],
  ]);
  assert.deepEqual(
    book.pictures.map((picture) => `${picture.archive}.${picture.record}`),
    ['323.0', '323.2'],
  );
  assert.equal(book.layerOf(123, 2), 1);
  assert.equal(book.layerOf(COLOUR.glow, 0), COLOUR_LAYERS.glow);
  const desert = smallBook({ climate: 'desert', season: 'summer' }, [[124, 4, 'wall']]);
  assert.equal(desert.pictures[0]?.archive, 24);
});
