import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GroundPatch } from '../rules/landRules.ts';
import type { LayoutMarks } from '../terrain/layoutMarks.ts';
import {
  MOST_TILES,
  ReliefTiles,
  TILE_SAMPLES,
  type Tile,
  type TileAsk,
  tilesWanted,
  tileStep,
} from './reliefTiles.ts';

const layout = (ring: [number, number][]): LayoutMarks => ({
  id: 'downs',
  kind: 'patrol',
  name: 'Downs',
  ring,
  areas: [],
  paths: [],
  sites: [],
  runs: [],
});
const DOWNS = layout([
  [10_000, 10_000],
  [11_000, 10_000],
  [11_000, 11_000],
]);

test('the step is a power of two no finer than a pixel, from 2 m to 16 m, and none further out', () => {
  assert.equal(tileStep(0.5), 2);
  assert.equal(tileStep(3), 4);
  assert.equal(tileStep(16), 16);
  assert.equal(tileStep(17), null);
});

test("tiles are wanted only in the view and within reach of a claim, nearest the view's middle first", () => {
  const camera = { centreX: 10_500, centreY: 10_500, metresPerPixel: 4 };
  const wanted = tilesWanted(camera, 1000, 1000, [DOWNS]);
  // 512 m tiles over the claim and 200 m round it: 9,800 to 11,200 m both ways is columns and rows 19 to 21.
  assert.equal(wanted.length, 9);
  assert.ok(wanted.every(({ step }) => step === 4));
  assert.deepEqual(wanted[0], { key: '4:20:20', left: 10_240, top: 10_240, step: 4 });
  assert.deepEqual(tilesWanted({ ...camera, centreX: 50_000 }, 1000, 1000, [DOWNS]), [], 'none off the view');
  assert.deepEqual(tilesWanted({ ...camera, metresPerPixel: 40 }, 1000, 1000, [DOWNS]), [], 'none too far out');
});

const patch = (left: number, top: number, step: number): GroundPatch => ({
  left,
  top,
  step,
  width: TILE_SAMPLES,
  height: TILE_SAMPLES,
  heights: new Float32Array(TILE_SAMPLES * TILE_SAMPLES),
  water: new Float32Array(TILE_SAMPLES * TILE_SAMPLES),
  edges: new Float32Array(TILE_SAMPLES * TILE_SAMPLES),
  marks: new Uint8Array(TILE_SAMPLES * TILE_SAMPLES),
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('one tile is sampled at a time, with a step of margin, and sampled again once the land changes', async () => {
  const laid: Tile[] = [];
  const asked: number[][] = [];
  const tiles = new ReliefTiles((tile) => laid.push(tile));
  const source = {
    ground: (left: number, top: number, step: number, size: number) => {
      asked.push([left, top, step, size]);
      return Promise.resolve(patch(left, top, step));
    },
  };
  const wanted: TileAsk[] = [
    { key: 'a', left: 0, top: 0, step: 4 },
    { key: 'b', left: 512, top: 0, step: 4 },
  ];
  tiles.keep('c1', 1, wanted, source);
  tiles.keep('c1', 1, wanted, source);
  assert.deepEqual(asked, [[-4, -4, 4, TILE_SAMPLES]], 'the second frame waits for the first tile');
  await settle();
  tiles.keep('c1', 1, wanted, source);
  await settle();
  tiles.keep('c1', 1, wanted, source);
  assert.equal(asked.length, 2, 'both kept: nothing more is asked');
  assert.deepEqual(
    laid.map(({ key, slot }) => [key, slot]),
    [
      ['a', 0],
      ['b', 1],
    ],
  );
  tiles.keep('c1', 2, wanted, source);
  await settle();
  assert.equal(asked.length, 3);
  assert.deepEqual([laid.at(-1)?.key, laid.at(-1)?.slot, laid.at(-1)?.version], ['a', 0, 2], 'its own slot');
  assert.equal(tiles.kept.length, 2, 'the stale tile is drawn until its fresh one comes');
});

test('past the most kept, a new tile takes the slot of the one least lately wanted', async () => {
  const tiles = new ReliefTiles(() => undefined);
  const source = { ground: (left: number, top: number, step: number) => Promise.resolve(patch(left, top, step)) };
  for (let index = 0; index <= MOST_TILES; index++) {
    tiles.keep('c1', 1, [{ key: `t${index}`, left: index * 512, top: 0, step: 4 }], source);
    await settle();
  }
  assert.equal(tiles.kept.length, MOST_TILES);
  assert.ok(!tiles.kept.some(({ key }) => key === 't0'));
  assert.equal(tiles.kept.find(({ key }) => key === `t${MOST_TILES}`)?.slot, 0);
});

test('once the land changes, an old tile no longer wanted is dropped, so a finer one never hides the fresh ground', async () => {
  const tiles = new ReliefTiles(() => undefined);
  const source = { ground: (left: number, top: number, step: number) => Promise.resolve(patch(left, top, step)) };
  const fine: TileAsk = { key: '2:0:0', left: 0, top: 0, step: 2 };
  const coarse: TileAsk = { key: '8:0:0', left: 0, top: 0, step: 8 };
  tiles.keep('c1', 1, [fine], source);
  await settle();
  tiles.keep('c1', 1, [coarse], source);
  await settle();
  assert.deepEqual(tiles.kept.map(({ key }) => key).sort(), ['2:0:0', '8:0:0'], 'unchanged land keeps both');
  tiles.keep('c1', 2, [coarse], source);
  assert.deepEqual(
    tiles.kept.map(({ key }) => key),
    ['8:0:0'],
  );
});

test('more tiles wanted than are kept: only the nearest are asked for, and each once', async () => {
  const asked: number[] = [];
  const tiles = new ReliefTiles(() => undefined);
  const source = {
    ground: (left: number, top: number, step: number) => {
      asked.push(left);
      return Promise.resolve(patch(left, top, step));
    },
  };
  const wanted = Array.from({ length: MOST_TILES + 10 }, (_unused, index) => ({
    key: `t${index}`,
    left: index * 512,
    top: 0,
    step: 4,
  }));
  for (let frame = 0; frame < MOST_TILES * 2; frame++) {
    tiles.keep('c1', 1, wanted, source);
    await settle();
  }
  assert.equal(asked.length, MOST_TILES);
  assert.equal(new Set(asked).size, MOST_TILES);
});
