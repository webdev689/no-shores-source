import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Layers, Shelves } from './atlas.ts';
import { colourOf, QUAD_FLOATS, QuadList, UNCLIPPED } from './quads.ts';

test('the kit’s colours read as their channels, from #rgb, #rrggbb and rgba()', () => {
  assert.deepEqual(colourOf('#fff'), [1, 1, 1, 1]);
  assert.deepEqual(colourOf('#050608'), [5 / 255, 6 / 255, 8 / 255, 1]);
  assert.deepEqual(colourOf('rgba(12,14,18,0.93)'), [12 / 255, 14 / 255, 18 / 255, 0.93]);
  assert.throws(() => colourOf('brass'));
});

test('a quad lays its box, texels, colour, clip edges and tiling in order; an empty or clear one is not added', () => {
  const list = new QuadList();
  list.add(
    { x: 1, y: 2, width: 3, height: 4 },
    [1, 0, 0, 0.5],
    { x: 0, y: 0, width: 10, height: 20 },
    {
      x: 5,
      y: 6,
      width: 7,
      height: 8,
      tile: 2,
    },
  );
  list.add({ x: 0, y: 0, width: 0, height: 4 }, [1, 1, 1, 1]);
  list.add({ x: 0, y: 0, width: 4, height: 4 }, [1, 1, 1, 0]);
  assert.equal(list.count, 1);
  assert.deepEqual([...list.data], [1, 2, 3, 4, 5, 6, 7, 8, 1, 0, 0, 0.5, 0, 0, 10, 20, 2, 0, 0, 0]);
});

test('the list grows past its first room and starts again empty each frame', () => {
  const list = new QuadList();
  for (let step = 0; step < 1000; step++) list.add({ x: step, y: 0, width: 1, height: 1 }, [1, 1, 1, 1], UNCLIPPED);
  assert.equal(list.data.length, 1000 * QUAD_FLOATS);
  assert.equal(list.data[999 * QUAD_FLOATS], 999);
  list.clear();
  assert.equal(list.data.length, 0);
});

test('pictures lie on shelves a texel apart, a new shelf under the tallest, and none past a full square', () => {
  const shelves = new Shelves(16);
  assert.deepEqual(shelves.place(5, 3), { x: 0, y: 0, width: 5, height: 3 });
  assert.deepEqual(shelves.place(5, 6), { x: 6, y: 0, width: 5, height: 6 });
  assert.deepEqual(shelves.place(5, 2), { x: 0, y: 7, width: 5, height: 2 }, 'a new shelf under the tallest');
  assert.equal(shelves.place(16, 1), null, 'never wider than the square less its gutter');
  assert.deepEqual(shelves.place(4, 7), { x: 6, y: 7, width: 4, height: 7 });
  assert.equal(shelves.place(15, 3), null, 'no room left under the shelves');
});

test('layers laid full start again from their first once cleared, and a picture larger than a layer never fits', () => {
  const layers = new Layers(8, 2);
  assert.deepEqual(layers.place(7, 7), { x: 0, y: 0, width: 7, height: 7, layer: 0 });
  assert.deepEqual(layers.place(7, 7), { x: 0, y: 0, width: 7, height: 7, layer: 1 });
  assert.equal(layers.place(7, 7), null, 'both full');
  assert.equal(layers.fits(7, 7), true);
  assert.equal(layers.fits(8, 1), false);
  layers.clear();
  assert.deepEqual(layers.place(7, 7), { x: 0, y: 0, width: 7, height: 7, layer: 0 });
});
