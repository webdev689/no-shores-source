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
  const view = (await land()).open(square(200_000, 300_000, 120_000), 'square', null);
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
  const view = (await land()).open(square(200_000, 300_000, 120_000), 'square', null);
  assert.equal(view.groundHash, '2e9a3eef586ebf0d');
});

test('a continent of a biome opens with its ground colour and snow line; one with none, without', async () => {
  const rules = await land();
  const plain = rules.open(square(200_000, 300_000, 120_000), 'square', null);
  assert.equal(plain.ground, undefined);
  assert.equal(plain.snowM, undefined);
  const layout = JSON.parse(square(200_000, 300_000, 120_000)) as { continents: Record<string, unknown>[] };
  layout.continents[0] = { ...layout.continents[0], climate: 'tundra' };
  const tundra = rules.open(JSON.stringify(layout), 'square', null);
  assert.deepEqual(
    tundra.ground?.map((channel) => Math.round(channel * 255)),
    [150, 156, 130],
  );
  assert.equal(tundra.snowM, 615);
  assert.notEqual(tundra.groundHash, plain.groundHash, 'the tundra makes land of its own');
});

test('an unknown continent is refused with the reason', async () => {
  await assert.rejects(async () => (await land()).open(square(0, 0, 10), 'none', null), /no continent "none"/);
});

test('a stroke lifts the ground live, settles, writes back, and undoes by replacing the edits', async () => {
  const rules = await land();
  const before = rules.open(square(200_000, 300_000, 120_000), 'square', null);
  const brush = { tool: 'raise', radius_m: 6000, strength: 200 } as const;
  const patch = rules.dab(brush, [260_000, 360_000], true);
  rules.dab(brush, [262_000, 360_000], false);
  const { left, top, right } = patch.rect;
  const width = right - left;
  const middle = (100 - top) * width + (100 - left);
  assert.ok((patch.heights[middle] ?? 0) > (before.heights[100 * before.width + 100] ?? 0) + 150, 'the dab lifts it');
  const written = rules.write();
  assert.equal(written.id, 'square');
  assert.match(written.text, /"tool": "raise"/);
  assert.equal(
    rules.settle().heights[100 * before.width + 100],
    rules.setEdits(written.text).heights[100 * before.width + 100],
  );
  const undone = rules.setEdits('{ "strokes": [] }');
  assert.equal(
    undone.heights[100 * undone.width + 100],
    before.heights[100 * before.width + 100],
    'undo is the land again',
  );
  assert.throws(() => rules.dab({ ...brush, radius_m: 1 }, [260_000, 360_000], true), /radius must be/);
});

test('a patch gives the exact ground over a grid, with water and marks', async () => {
  const rules = await land();
  const edits = {
    strokes: [],
    roads: [
      {
        id: 'road-1',
        width_m: 10,
        points: [
          [220_000, 360_000],
          [300_000, 360_000],
        ],
      },
    ],
  };
  rules.open(square(200_000, 300_000, 120_000), 'square', JSON.stringify(edits));
  const patch = rules.patch(259_000, 359_980, 4, 10, 10);
  assert.equal(patch.heights.length, 100);
  assert.equal(patch.marks[50], 3, 'on the road');
  assert.equal(patch.marks[0], 0, 'beside it');
  const sampled = rules.sample([[259_000, 359_980]]);
  assert.equal(patch.heights[0], Math.fround(sampled.heights[0] ?? 0), 'the same ground the runtime samples');
  assert.equal(patch.edges[0], 1e6, 'no fresh water near');
});

test('a patch across a river says how far each sample lies past its edge', async () => {
  const rules = await land();
  const river = {
    id: 'river-1',
    width_m: 40,
    depth_m: 4,
    points: [
      [260_000, 330_000],
      [260_000, 400_000],
    ],
  };
  rules.open(square(200_000, 300_000, 120_000), 'square', JSON.stringify({ strokes: [], rivers: [river] }));
  const patch = rules.patch(259_950, 360_000, 5, 21, 1);
  assert.ok(Math.abs((patch.edges[10] ?? 0) + 20) < 1e-3, `mid-channel: ${patch.edges[10]}`);
  assert.ok(Math.abs((patch.edges[15] ?? 0) - 5) < 1e-3, `on the bank: ${patch.edges[15]}`);
  assert.equal(patch.edges[0], 1e6, 'past the banks');
});

test('a preview leaves the landmass open for strokes alone', async () => {
  const rules = await land();
  const twoSquares = square(200_000, 300_000, 120_000).replace(
    ']]}',
    ']]},{"id":"other","outline":[[600000,300000],[720000,300000],[720000,420000],[600000,420000]]}',
  );
  rules.open(twoSquares, 'square', null, true);
  rules.open(twoSquares, 'other', null, false);
  assert.equal(rules.write().id, 'square');
  rules.open(twoSquares, 'other', null);
  assert.equal(rules.write().id, 'other', 'kept by default');
});

test('the sampled ground agrees to the bit with the native build (crates/land/tests/agree.rs holds the same)', async () => {
  const rules = await land();
  const edits = {
    strokes: [],
    rivers: [
      {
        id: 'river-1',
        width_m: 40,
        depth_m: 4,
        points: [
          [260_000, 330_000],
          [260_000, 400_000],
        ],
      },
    ],
    roads: [
      {
        id: 'road-1',
        width_m: 8,
        points: [
          [220_000, 360_000],
          [300_000, 360_000],
        ],
      },
    ],
    towns: [
      {
        id: 'town-1',
        outline: [
          [230_000, 370_000],
          [240_000, 370_000],
          [240_000, 380_000],
          [230_000, 380_000],
        ],
      },
    ],
  };
  const view = rules.open(square(200_000, 300_000, 120_000), 'square', JSON.stringify(edits));
  assert.deepEqual(view.problems, []);
  const steps = (count: number) => [...Array(count).keys()];
  const points: [number, number][] = [
    ...steps(10).map((step): [number, number] => [225_000 + 7_000 * step, 360_000]),
    ...steps(10).map((step): [number, number] => [260_000, 335_000 + 6_000 * step]),
    ...steps(16).map((step): [number, number] => [
      232_000 + 2_000 * (step % 4),
      372_000 + 2_000 * Math.floor(step / 4),
    ]),
    ...steps(100).map((step): [number, number] => [205_000 + 1_100 * step, 305_000 + 1_100 * step]),
    ...steps(50).map((step): [number, number] => [
      205_000.123456789 + 2_201.987654321 * step,
      305_000.75 + 2_199.0625 * step,
    ]),
  ];
  const sample = rules.sample(points);
  assert.equal(sample.sampleHash, '1316e7b1b67f5f55');
  assert.equal(sample.water[10]?.kind, 'river', 'the carved river holds water');
  assert.ok((sample.heights[10] ?? 0) < (sample.water[10]?.surface ?? 0), 'its bed lies under its surface');
});

test('the sea over the square agrees to the bit with the native build (crates/land/tests/agree.rs holds the same)', async () => {
  const rules = await land();
  const view = rules.open(square(200_000, 300_000, 120_000), 'square', null);
  assert.equal(view.swell?.waves.length, 10);
  assert.ok((view.swell?.fullDepthM ?? 0) > (view.swell?.goneDepthM ?? 0));
  const points = Array.from(
    { length: 60 },
    (_value, step) => [162_000.5 + 550.25 * step, 262_000.75 + 3_300.5 * step] as const,
  );
  const sample = rules.sample(points, 1234.567);
  assert.ok(
    sample.water.every((water) => water.kind === 'sea'),
    'the margin is sea, not a lake at 0 m',
  );
  assert.ok(sample.sea.every((height) => typeof height === 'number' && Math.abs(height) < 4));
  assert.equal(sample.seaHash, 'b6ceaaa9dd1a37f4');
  assert.equal(rules.sample([[260_000, 360_000]]).sea[0], null, 'no sea on land');
});
