import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addRunsInView, blocksOf, Runs, tilesCasting, tilesInView } from './cull.ts';
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
  list: new Uint32Array(),
  corners: new Float32Array(),
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

/** The draws `runs` holds, each [part, first, count]. */
const drawsIn = (runs: Runs<string>) =>
  Array.from({ length: runs.length }, (unused, draw) => [runs.parts[draw], runs.firsts[draw], runs.counts[draw]]);

test('neighbouring tiles in view draw as one run; a tile out of view splits the run', () => {
  const group = { form: 0, far: false, first: 10, tiles: [0, 1, 2], counts: [3, 4, 5] };
  const runsOf = (visible: number[]) => {
    const runs = new Runs<string>();
    addRunsInView(group, Uint8Array.from(visible), 'tree', runs);
    return drawsIn(runs);
  };
  assert.deepEqual(runsOf([1, 1, 0]), [['tree', 10, 7]]);
  assert.deepEqual(runsOf([1, 0, 1]), [
    ['tree', 10, 3],
    ['tree', 17, 5],
  ]);
  assert.deepEqual(runsOf([0, 0, 0]), []);
});

test("one group's runs never join another's, and the list keeps its draws however many a frame lays", () => {
  const runs = new Runs<string>();
  const [first, second] = [
    { form: 0, far: false, first: 0, tiles: [0], counts: [4] },
    { form: 1, far: false, first: 4, tiles: [1], counts: [2] },
  ];
  addRunsInView(first, Uint8Array.from([1, 1]), 'oak', runs);
  addRunsInView(second, Uint8Array.from([1, 1]), 'fern', runs);
  assert.deepEqual(drawsIn(runs), [
    ['oak', 0, 4],
    ['fern', 4, 2],
  ]);
  runs.clear();
  for (let tile = 0; tile < 200; tile++) runs.add('rock', tile * 3, 1);
  assert.equal(runs.length, 200);
  assert.deepEqual(drawsIn(runs)[199], ['rock', 597, 1]);
});

test('the tiles gathered in blocks are culled tile for tile as they are one by one, in view and casting alike', () => {
  let state = 7;
  const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) as number;
  for (let round = 0; round < 60; round++) {
    const rows = Array.from({ length: 1500 }, () => [
      (random() - 0.5) * 9000,
      (random() - 0.5) * 9000,
      random() * 200,
      200 + random() * 100,
    ]);
    const alone = packedWith(rows);
    const gathered = { ...alone, blocks: blocksOf(alone.tiles) };
    assert.equal(gathered.blocks.members.length, rows.length, 'every tile in one block');
    const view = lookingNorth(0.5 + random() * 2);
    const anchor = [(random() - 0.5) * 400, (random() - 0.5) * 400, -random() * 60] as const;
    assert.deepEqual(tilesInView(gathered, view, anchor, 1.5), tilesInView(alone, view, anchor, 1.5), 'in view');
    const reach = 150 + random() * 600;
    const reaches = (low: readonly number[], high: readonly number[]) =>
      high[0]! > -reach && low[0]! < reach && high[1]! > -reach && low[1]! < reach && high[2]! > -40;
    assert.deepEqual(tilesCasting(gathered, anchor, 1.5, reaches), tilesCasting(alone, anchor, 1.5, reaches), 'cast');
  }
});
