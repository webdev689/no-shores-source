import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runsInView, tilesInView } from './cull.ts';
import type { Packed } from './field.ts';

/** A camera at the eye looking north along the ground, 50° high, depth reversed: points measured from the eye. */
function lookingNorth(aspect: number): Float32Array {
  const [near, far] = [0.25, 50_000];
  const focal = 1 / Math.tan((50 * Math.PI) / 360);
  const [depthScale, depthOffset] = [near / (far - near), (near * far) / (far - near)];
  // Clip rows: x east, y up, depth from the distance south (behind), w the distance north.
  const rows = [
    [focal / aspect, 0, 0, 0],
    [0, 0, focal, 0],
    [0, depthScale, 0, depthOffset],
    [0, -1, 0, 0],
  ];
  const matrix = new Float32Array(16);
  for (let row = 0; row < 4; row++)
    for (let column = 0; column < 4; column++) matrix[column * 4 + row] = rows[row]?.[column] ?? 0;
  return matrix;
}

const packedWith = (tiles: number[][]): Packed => ({
  anchor: [0, 0],
  instances: new Float32Array(),
  tiles: Float32Array.from(tiles.flat()),
  groups: [],
  spread: 15,
});

test('a tile ahead is in view; one behind the eye or far off to the side is not', () => {
  const packed = packedWith([
    [0, -300, 10, 30],
    [0, 300, 10, 30],
    [3000, -200, 10, 30],
    [-150, -2000, 10, 30],
  ]);
  const visible = tilesInView(packed, lookingNorth(16 / 9), [0, 0, -12], 1);
  assert.deepEqual([...visible], [1, 0, 0, 1]);
});

test("a tile just past the view's edge stays in view while its plants could reach into it", () => {
  const halfWidth = Math.tan((50 * Math.PI) / 360) * (16 / 9) * 400;
  const packed = packedWith([[halfWidth + 40, -400, 0, 20]]);
  assert.deepEqual([...tilesInView(packed, lookingNorth(16 / 9), [0, 0, -2], 1)], [1]);
});

test('neighbouring tiles in view draw as one run; a tile out of view splits the run', () => {
  const group = { form: 0, far: false, first: 10, tiles: [0, 1, 2], counts: [3, 4, 5] };
  assert.deepEqual(runsInView(group, Uint8Array.from([1, 1, 0])), [10, 7]);
  assert.deepEqual(runsInView(group, Uint8Array.from([1, 0, 1])), [10, 3, 17, 5]);
  assert.deepEqual(runsInView(group, Uint8Array.from([0, 0, 0])), []);
});
