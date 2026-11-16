import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GroundPatch, LandView } from '../rules/landRules.ts';
import { landSampler, wideGround } from './ground.ts';

const [LEFT, TOP, CELLS, CELL] = [3_000_000, 1_000_000, 12, 1000];
const CENTRE = [LEFT + 6000, TOP + 6000] as const;

/** A round island 4.5 km across a 12 km window, 50 m high, with a river running east from its middle. */
function island(): LandView {
  const count = CELLS * CELLS;
  const [heights, coast, across] = [new Float32Array(count), new Float32Array(count), new Float32Array(count)];
  for (let row = 0; row < CELLS; row++) {
    for (let column = 0; column < CELLS; column++) {
      const cell = row * CELLS + column;
      const inland = 4500 - Math.hypot(LEFT + (column + 0.5) * CELL - CENTRE[0], TOP + (row + 0.5) * CELL - CENTRE[1]);
      coast[cell] = inland;
      heights[cell] = inland > 0 ? 50 : -20;
      across[cell] = inland > 0 ? -5 : 2;
    }
  }
  return {
    id: 'island',
    width: CELLS,
    height: CELLS,
    leftM: LEFT,
    topM: TOP,
    cellM: CELL,
    heights,
    lakes: new Float32Array(count),
    coast,
    across,
    rivers: [
      {
        points: [
          [CENTRE[0] - 500, CENTRE[1] + 500],
          [CENTRE[0] + 1500, CENTRE[1] + 500],
          [CENTRE[0] + 3500, CENTRE[1] + 500],
        ],
        flow: [400, 400, 400],
      },
    ],
    groundHash: '',
    problems: [],
  };
}

test('inland the 1 km land is its cells, out to sea it is sea, along the splines the GPU draws', () => {
  const view = island();
  const [height, east, south, coastM] = wideGround(view, CENTRE[0] - 500, CENTRE[1] - 500);
  assert.ok(Math.abs(height - 50) < 1e-6 && Math.abs(east) < 1e-9 && Math.abs(south) < 1e-9, `${height}`);
  assert.ok(coastM > 3000);
  const sample = landSampler(view, null);
  assert.equal(sample(CENTRE[0] - 500, CENTRE[1] - 1500).water, 'dry');
  const sea = sample(CENTRE[0] - 5800, CENTRE[1]);
  assert.equal(sea.water, 'sea');
  assert.ok(sea.height < 0 && (sea.coastM ?? 0) < 0);
});

test("a gathered river's channel is river, and its bank is dry ground that knows how far the water is", () => {
  const sample = landSampler(island(), null);
  const half = (2.4 * Math.sqrt(400) + 1.5) / 2;
  assert.equal(sample(CENTRE[0] + 1000, CENTRE[1] + 500 + half - 2).water, 'river');
  const bank = sample(CENTRE[0] + 1000, CENTRE[1] + 500 + half + 15);
  assert.equal(bank.water, 'dry');
  assert.ok(Math.abs((bank.freshM ?? Infinity) - 15) < 0.5, `${bank.freshM}`);
  assert.equal(sample(CENTRE[0] + 1000, CENTRE[1] - 2000).freshM, Infinity, 'far from any water');
});

test('the close patch gives the exact ground, its marks and its fresh water where it reaches', () => {
  const size = 81;
  const [left, top] = [CENTRE[0] - 1200, CENTRE[1] - 1200];
  const count = size * size;
  const patch: GroundPatch = {
    left,
    top,
    step: 4,
    width: size,
    height: size,
    heights: new Float32Array(count).fill(60),
    water: new Float32Array(count),
    edges: new Float32Array(count).fill(1e6),
    marks: new Uint8Array(count),
  };
  for (let column = 0; column < size; column++) patch.marks[40 * size + column] = 3;
  for (let row = 0; row < size; row++) {
    patch.edges[row * size + 55] = -2;
    patch.water[row * size + 55] = 59;
  }
  const sample = landSampler(island(), patch);
  const middle = sample(left + 40 * 4, top + 30 * 4);
  assert.ok(Math.abs(middle.height - 60) < 1e-6, `${middle.height}`);
  assert.equal(middle.mark, 0);
  assert.equal(sample(left + 40 * 4, top + 40 * 4).mark, 3, 'the road');
  const stream = sample(left + 55 * 4, top + 30 * 4);
  assert.equal(stream.water, 'river');
  assert.ok((stream.freshM ?? Infinity) < 0);
  assert.equal(sample(left - 400, top - 400).mark, 0, 'past the patch, no marks');
});
