import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startWorldRules } from './worldRules.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/world_wasm.wasm', import.meta.url);

async function rules() {
  const bytes = await readFile(MODULE).catch(() => {
    throw new Error('world_wasm.wasm is not built: run `npm run wasm` first');
  });
  return startWorldRules(bytes);
}

test('the constants come from the Rust rules', async () => {
  const { constants } = await rules();
  assert.deepEqual(constants, {
    frameWidthM: 4_915_200,
    frameHeightM: 3_072_000,
    continentCount: 9,
    minContinentKm2: 161_600,
    maxContinentKm2: 940_000,
  });
});

test('a layout is checked in WebAssembly, with each continent area', async () => {
  const world = await rules();
  const side = 500_000;
  const outline = [
    [0, 0],
    [side, 0],
    [side, side],
    [0, side],
  ];
  const result = world.check(JSON.stringify({ continents: [{ id: 'first', outline }], isles: [] }));
  assert.equal(result.reads, true);
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.continents.get('first'), { areaKm2: 250_000, simple: true });
});

test('a broken layout reports its problems, and text that does not read says so', async () => {
  const world = await rules();
  const tiny = [
    [0, 0],
    [1000, 0],
    [1000, 1000],
  ];
  const result = world.check(JSON.stringify({ continents: [{ id: 'tiny', outline: tiny }], isles: [] }));
  assert.equal(result.problems[0]?.subject, 'tiny');
  const broken = world.check('{ not json');
  assert.equal(broken.reads, false);
  assert.notEqual(broken.error, '');
});

test('the layout is written in the form the repository keeps', async () => {
  const world = await rules();
  assert.equal(world.write('{"isles":[],"continents":[]}'), '{\n  "continents": [],\n  "isles": []\n}\n');
  assert.throws(() => world.write('{ not json'), /does not read/);
});

test('many checks in a row leave the memory usable', async () => {
  const world = await rules();
  const text = JSON.stringify({ continents: [], isles: [] });
  for (let round = 0; round < 2000; round++) assert.equal(world.check(text).reads, true);
});
