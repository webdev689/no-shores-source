import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startLand } from './landRules.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);

async function land() {
  const bytes = await readFile(MODULE).catch(() => {
    throw new Error('land_wasm.wasm is not built: run `npm run wasm` first');
  });
  return startLand(bytes);
}

const square = (west: number, north: number, side: number) =>
  JSON.stringify({
    continents: [
      {
        id: 'square',
        outline: [
          [west, north],
          [west + side, north],
          [west + side, north + side],
          [west, north + side],
        ],
      },
    ],
    isles: [],
  });

test('a continent opens as its window, with land inside the coast and sea around it', async () => {
  const view = (await land()).open(square(200_000, 300_000, 120_000), 'square');
  assert.equal(view.id, 'square');
  assert.equal(view.cellM, 1000);
  assert.deepEqual([view.leftM, view.topM, view.width, view.height], [160_000, 260_000, 200, 200]);
  assert.equal(view.heights.length, 200 * 200);
  assert.equal(view.lakes.length, 200 * 200);
  const heightOf = (i: number, j: number) => view.heights[j * view.width + i] ?? Number.NaN;
  assert.ok(heightOf(100, 100) >= 1, 'the middle is land');
  assert.ok(heightOf(5, 5) <= -2, 'the margin is sea');
  assert.ok(view.rivers.length > 0, 'rain gathers into rivers');
});

test('the land agrees to the bit with the native build (crates/land/tests/agree.rs holds the same fingerprint)', async () => {
  const view = (await land()).open(square(200_000, 300_000, 120_000), 'square');
  assert.equal(view.groundHash, 'c3f0ce8d08683ead');
});

test('an unknown continent is refused with the reason', async () => {
  await assert.rejects(async () => (await land()).open(square(0, 0, 10), 'none'), /no continent "none"/);
});
