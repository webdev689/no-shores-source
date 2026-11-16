import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startLand } from '../rules/landRules.ts';
import { reach, swellHeight } from './swell.ts';

const MODULE = new URL('../../../target/wasm32-unknown-unknown/release/land_wasm.wasm', import.meta.url);
const SQUARE = JSON.stringify({
  continents: [
    {
      id: 'square',
      outline: [
        [200_000, 300_000],
        [320_000, 300_000],
        [320_000, 420_000],
        [200_000, 420_000],
      ],
    },
  ],
  isles: [],
});

test('the drawn swell stands where the shared rules put it', async () => {
  const rules = await startLand(await readFile(MODULE));
  const view = rules.open(SQUARE, 'square', null);
  const swell = view.swell;
  assert.ok(swell);
  const points = Array.from(
    { length: 40 },
    (_value, step) => [163_000.25 + 801.5 * step, 270_000.5 + 4_100.75 * step] as const,
  );
  const time = 4321.25;
  const sample = rules.sample(points, time);
  for (const [index, [x, y]] of points.entries()) {
    const depth = -(sample.heights[index] ?? 0);
    assert.ok(Math.abs(swellHeight(swell, x, y, time, depth) - (sample.sea[index] ?? Number.NaN)) < 1e-9);
  }
});

test('the swell fades from whole to nothing as the sea shallows', () => {
  const swell = { waves: [], fullDepthM: 15, goneDepthM: 1 };
  assert.equal(reach(swell, 0.5), 0);
  assert.equal(reach(swell, 40), 1);
  assert.ok(reach(swell, 5) < reach(swell, 10));
});
