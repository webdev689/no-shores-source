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
  assert.equal(view.groundHash, 'c3f0ce8d08683ead');
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
  ];
  const sample = rules.sample(points);
  assert.equal(sample.sampleHash, 'ee55746a7aba0eae');
  assert.equal(sample.water[10]?.kind, 'river', 'the carved river holds water');
  assert.ok((sample.heights[10] ?? 0) < (sample.water[10]?.surface ?? 0), 'its bed lies under its surface');
});
