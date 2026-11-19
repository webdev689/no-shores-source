import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cacheOf, chestMesh } from './dungeonChest.ts';
import { COLOUR } from './dungeonMesh.ts';

test("the cache reads from a snapshot's five numbers, and an empty one is none", () => {
  assert.deepEqual(cacheOf([1, 2, 0, Math.PI, 1]), { x: 1, y: 2, z: 0, bearing: Math.PI, open: true });
  assert.equal(cacheOf([1, 2, 0, 0, 0])?.open, false);
  assert.equal(cacheOf([]), null);
});

test('a chest of wood bound in iron stands where the cache stands, its lid thrown back when open', () => {
  const where = { x: 10, y: 20, z: 0, bearing: 0 };
  const tops = (open: boolean) => {
    const model = chestMesh({ ...where, open }, [364, 1]);
    const heights: number[] = [];
    for (let vertex = 0; vertex < model.positions.length / 3; vertex++)
      heights.push(model.positions[vertex * 3 + 2] ?? 0);
    const pictures = new Set(model.parts.map((part) => `${part.archive}.${part.record}`));
    assert.deepEqual([...pictures].sort(), [`${COLOUR.iron}.0`, '364.1']);
    const eastings = Array.from(
      { length: model.positions.length / 3 },
      (unused, vertex) => model.positions[vertex * 3] ?? 0,
    );
    assert.ok(Math.min(...eastings) > 9 && Math.max(...eastings) < 11, 'round the cache');
    return Math.max(...heights);
  };
  assert.ok(tops(true) > tops(false) + 0.3, 'an open lid stands up over the shut one');
});
