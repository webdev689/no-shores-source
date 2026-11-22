import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLOUR_LAYERS } from '../city/pictures.ts';
import { PORTAL_FLAG, smallBook, WATER_FLAG } from './dungeonBook.ts';
import { COLOUR, ROLE } from './dungeonMesh.ts';

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

test("each colour the dungeon's shader draws takes a layer of its own, past the pictures a dungeon wears", () => {
  const book = smallBook({ climate: 'temperate', season: 'summer' }, [[123, 0, 'wall']]);
  const drawn = [COLOUR.glow, COLOUR.wax, COLOUR.ember, COLOUR.lanternGlass, COLOUR.crystal, COLOUR.fungus];
  const layers = drawn.map((archive) => book.layerOf(archive, 0));
  assert.equal(new Set(layers).size, drawn.length);
  for (const layer of layers)
    assert.ok(layer > 200 && layer < PORTAL_FLAG, `${layer} lies past any dungeon's pictures`);
});

test("still water is drawn over its bed, the floor of the set it lies in, by a flag past the portal's", () => {
  const book = smallBook({ climate: 'temperate', season: 'summer' }, [
    [123, ROLE.wall, 'wall'],
    [123, ROLE.floor, 'floor'],
  ]);
  assert.equal(book.layerOf(COLOUR.water, 123), WATER_FLAG | 1);
  assert.equal(WATER_FLAG & PORTAL_FLAG, 0);
  assert.ok(WATER_FLAG > PORTAL_FLAG);
});
