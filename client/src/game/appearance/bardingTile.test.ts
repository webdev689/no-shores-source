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
  assert.deepEqual(earsCut(bare, worn, 4), [6, 4], 'the ears at (8, 4) on the barded horse, the tile centred on them');
  assert.deepEqual(earsCut(bare, bare, 4), [4, 2], 'the bare horse is cut the same way');
  assert.equal(earsCut(picture(4, 4, [2, 3], []), worn, 4), null, 'a bare horse not drawn yet cuts no tile');
});
