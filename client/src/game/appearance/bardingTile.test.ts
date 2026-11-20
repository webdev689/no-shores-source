import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Picture } from '../../player/picture.ts';
import { earsCut } from './bardingTile.ts';

/** A clear picture `width` by `height` standing on `root`, drawn at each of `drawn`. */
function picture(width: number, height: number, root: readonly [number, number], drawn: [number, number][]): Picture {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (const [column, row] of drawn) pixels[(row * width + column) * 4 + 3] = 255;
  return { width, height, pixels, root };
}

test("a barding's tile is cut round the bare horse's ears, not round what the barding raises above them", () => {
  const bare = picture(
    10,
    10,
    [5, 9],
    [
      [6, 2],
      [6, 5],
    ],
  );
  // A barding wider and taller than the bare horse, with a wisp high at its left.
  const worn = picture(
    14,
    12,
    [7, 11],
    [
      [1, 0],
      [8, 4],
    ],
  );
  assert.deepEqual(earsCut(bare, worn, 4), [6, 0], 'the ears at (8, 4) on the barded horse, the tile centred on them');
  assert.deepEqual(earsCut(bare, bare, 4), [4, 0], 'the bare horse is cut the same way, as high as it holds');
  assert.equal(earsCut(picture(4, 4, [2, 3], []), worn, 4), null, 'a bare horse not drawn yet cuts no tile');
});

test("a tile's cut leaves room over the ears, and rises to a crest drawn over the head, never past 16 texels", () => {
  const bare = picture(40, 40, [20, 39], [[20, 24]]);
  const plain = picture(
    40,
    40,
    [20, 39],
    [
      [20, 24],
      [2, 3],
    ],
  );
  assert.deepEqual(earsCut(bare, plain, 16), [12, 20], 'four texels over the ears; a wisp aside does not count');
  const crested = picture(
    40,
    40,
    [20, 39],
    [
      [20, 24],
      [22, 13],
    ],
  );
  assert.deepEqual(earsCut(bare, crested, 16), [12, 13], 'the crest over the head is in the tile');
  const flame = Array.from({ length: 24 }, (_unused, row): [number, number] => [22, row + 1]);
  const towering = picture(40, 40, [20, 39], [[20, 24], ...flame]);
  assert.deepEqual(earsCut(bare, towering, 16), [12, 8], 'at most 16 over the ears, so the head stays in');
});
