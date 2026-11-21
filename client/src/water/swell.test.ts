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
  const swell = { waves: [], fullDepthM: 15, goneDepthM: 1, bearing: 0 };
  assert.equal(reach(swell, 0.5), 0);
  assert.equal(reach(swell, 40), 1);
  assert.ok(reach(swell, 5) < reach(swell, 10));
});

test('a hull slow to answer rides a wave lower and later, and a sheltered sea stands lower', () => {
  // One wave alone: a first-order lag of time constant 1 / frequency answers it 1 / √2 as high (sea.rs holds the same).
  const wave = { direction: [1, 0] as const, number: 0.1, frequency: 1, amplitude: 1, shift: 0, phase: 0 };
  const lone = { waves: [wave], fullDepthM: 15, goneDepthM: 1, bearing: 0 };
  const heights = Array.from({ length: 6283 }, (_value, step) => swellHeight(lone, 0, 0, step * 0.001, 300, 1));
  assert.ok(Math.abs(Math.max(...heights) - Math.SQRT1_2) < 1e-3);
  // Late, not early: the water peaks at 3π/2 s, the hull an eighth of a period after.
  assert.ok(Math.abs(heights.indexOf(Math.max(...heights)) * 0.001 - 1.75 * Math.PI) < 0.01);
  assert.equal(swellHeight(lone, 3, 0, 2, 300, 0), Math.sin(0.3 - 2));
  const sheltered = { ...lone, shelterAt: (x: number) => (x > 0 ? 0.25 : 1) };
  assert.equal(swellHeight(sheltered, 3, 0, 2, 300), Math.sin(0.3 - 2) * 0.25);
});
