import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Picture, addedBy, overlapped } from './picture.ts';

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
  // A helm widens the frame by a row above: the two line up by their feet.
  const tall = picture(5, 5, body, [[1, 0, sword]]);
  for (const column of [0, 2, 3, 4]) tall.pixels.fill(0, column * 4, column * 4 + 4);
  const taller = { ...tall, root: [2, 4] as const };
  const lower = { ...bare, root: [2, 3] as const };
  const helm = addedBy(taller, lower);
  assert.deepEqual([helm?.width, helm?.height], [1, 1], 'only the new row is the helm');
});

test('a speck of the figure apart from the piece is left out of its picture', () => {
  const body = [200, 150, 120, 255];
  const coat = [60, 70, 140, 255];
  const marked: [number, number, number[]][] = [];
  for (let row = 4; row < 12; row++) for (let column = 4; column < 12; column++) marked.push([column, row, coat]);
  marked.push([0, 0, [230, 180, 150, 255]]);
  const added = addedBy(picture(16, 16, body, marked), picture(16, 16, body));
  assert.deepEqual([added?.width, added?.height], [8, 8], 'the collar’s fleck far from the coat is dropped');
});

test('a piece in one, as a weapon is, keeps its parts near its largest and lets go of one standing away', () => {
  const body = [200, 150, 120, 255];
  const steel = [180, 190, 210, 255];
  const marked: [number, number, number[]][] = [];
  for (let row = 1; row < 13; row++) marked.push([2, row, steel]);
  marked.push([2, 15, [90, 60, 30, 255]], [3, 15, [90, 60, 30, 255]]);
  for (let step = 0; step < 4; step++) marked.push([12 + step, 2 + step, [90, 60, 30, 255]]);
  const worn = picture(18, 17, body, marked);
  assert.deepEqual([addedBy(worn, picture(18, 17, body))?.width], [14], 'a coat keeps every part');
  const sword = addedBy(worn, picture(18, 17, body), true);
  assert.deepEqual([sword?.width, sword?.height], [2, 15], 'a sword keeps its grip below the blade, not the sheath');
});

test('a loadout in both hands is one picture: the left hand’s behind the right’s at its left, on its top edge', () => {
  const [blade, shield] = [
    [180, 190, 210, 255],
    [140, 90, 50, 255],
  ];
  const both = overlapped(picture(10, 2, blade), picture(4, 4, shield));
  assert.deepEqual([both.width, both.height, both.level], [10, 4, true], 'the shield reaches up past the blade');
  const texel = (column: number, row: number) => [
    ...both.pixels.slice((row * 10 + column) * 4, (row * 10 + column) * 4 + 4),
  ];
  assert.deepEqual(texel(1, 0), shield, 'its middle a fifth along, its top half above the blade');
  assert.deepEqual(texel(1, 2), blade, 'the right hand’s in front');
  assert.deepEqual(texel(3, 3), blade);
  assert.deepEqual(texel(8, 0), [0, 0, 0, 0], 'a clear ground round them');
  const snap = () => {};
  assert.equal(overlapped({ ...picture(10, 2, blade), snap }, picture(4, 4, shield)).snap, snap, 'its palette kept');
  const pair = overlapped(picture(4, 2, blade), picture(6, 2, shield));
  assert.deepEqual([pair.width, pair.height], [6, 3], 'a second longer than the first stands out past its left end');
  assert.deepEqual([...pair.pixels.slice(0, 4)], shield);
});
