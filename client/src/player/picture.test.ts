import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Picture, addedBy } from './picture.ts';

/** A picture `width` × `height` of one colour, with some pixels of another. */
function picture(width: number, height: number, ground: number[], marked: [number, number, number[]][] = []): Picture {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let spot = 0; spot < width * height; spot++) pixels.set(ground, spot * 4);
  for (const [column, row, colour] of marked) pixels.set(colour, (row * width + column) * 4);
  return { width, height, pixels };
}

test('an item’s picture is what it adds to the figure, cropped round it on a clear ground', () => {
  const body = [200, 150, 120, 255];
  const sword = [90, 90, 100, 255];
  const bare = picture(5, 4, body);
  const worn = picture(5, 4, body, [
    [1, 1, sword],
    [2, 2, sword],
  ]);
  const added = addedBy(worn, bare);
  assert.ok(added);
  assert.deepEqual([added.width, added.height], [2, 2]);
  assert.deepEqual([...added.pixels], [...sword, 0, 0, 0, 0, 0, 0, 0, 0, ...sword]);
  assert.equal(addedBy(bare, bare), null, 'nothing added');
  assert.equal(addedBy(worn, picture(4, 4, body)), null, 'not the same size');
});
