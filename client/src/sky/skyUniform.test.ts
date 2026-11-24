import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHELTER_CELLS } from './shelter.ts';
import {
  AFTERNOON,
  LAMPS_MOST,
  PUDDLE_WRAP_M,
  RIPPLE_CELL_M,
  RIPPLE_CELLS,
  RIPPLE_PER_S,
  RIPPLE_RING,
  RIPPLE_WRAP_S,
  SKY_WGSL,
  skyNumbers,
} from './skyUniform.ts';

test("the sky's numbers fill the WGSL struct's rows before its shelter grid, and the whole fits a uniform", () => {
  const struct = SKY_WGSL.slice(SKY_WGSL.indexOf('struct Sky {'), SKY_WGSL.indexOf('};'));
  const singles = (struct.match(/: vec4f,/g) ?? []).length;
  assert.equal(skyNumbers(AFTERNOON, []).length / 4, singles + LAMPS_MOST * 2, 'every row the sky writes each frame');
  const shelter = (SHELTER_CELLS * SHELTER_CELLS) / 4;
  assert.ok(struct.includes(`shelter: array<vec4f, ${shelter}>`), 'the shelter grid last, four cells a row');
  assert.ok((singles + LAMPS_MOST * 2 + shelter) * 16 <= 65536, "within WebGPU's least uniform binding");
});

test("a ripple's ring spreads within its own cell, so no cell's straight edge cuts it", () => {
  assert.ok(RIPPLE_RING.spread + 3 * RIPPLE_RING.width <= RIPPLE_RING.inFromEdge);
});

test('the ripples keep their places and their beat where the eye and the world seconds are wrapped', () => {
  const cells = PUDDLE_WRAP_M / RIPPLE_CELL_M;
  assert.equal(cells, Math.round(cells), 'a whole number of cells to the wrap');
  assert.equal(RIPPLE_CELLS, cells, 'and the cells are wrapped there');
  const beats = RIPPLE_WRAP_S * RIPPLE_PER_S;
  assert.ok(Math.abs(beats - Math.round(beats)) < 1e-9, 'a whole number of beats to the wrap');
});

test("the rain's rings read the share of what falls that is snow, not the snow lying", () => {
  const falling = { ...AFTERNOON, falling: 0.8, snowShare: 0.25, snowCover: 0 };
  const row = 12 * 4;
  assert.equal(skyNumbers(falling, [])[row + 3], 0.25, 'beside the clouds next drift');
});
