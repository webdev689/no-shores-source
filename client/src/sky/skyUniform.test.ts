import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHELTER_CELLS } from './shelter.ts';
import { AFTERNOON, LAMPS_MOST, SKY_WGSL, skyNumbers } from './skyUniform.ts';

test("the sky's numbers fill the WGSL struct's rows before its shelter grid, and the whole fits a uniform", () => {
  const struct = SKY_WGSL.slice(SKY_WGSL.indexOf('struct Sky {'), SKY_WGSL.indexOf('};'));
  const singles = (struct.match(/: vec4f,/g) ?? []).length;
  assert.equal(skyNumbers(AFTERNOON, []).length / 4, singles + LAMPS_MOST * 2, 'every row the sky writes each frame');
  const shelter = (SHELTER_CELLS * SHELTER_CELLS) / 4;
  assert.ok(struct.includes(`shelter: array<vec4f, ${shelter}>`), 'the shelter grid last, four cells a row');
  assert.ok((singles + LAMPS_MOST * 2 + shelter) * 16 <= 65536, "within WebGPU's least uniform binding");
});
