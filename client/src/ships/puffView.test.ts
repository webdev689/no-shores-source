import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mark } from './effects.ts';
import { puffFloats } from './puffView.ts';

const mark = (blend: Mark['blend'], radius: number): Mark => ({
  x: 0,
  y: 10,
  z: 2,
  radius,
  colour: [1, 0.8, 0.5],
  blend,
});

test("a gun's reach of light is never drawn as a halo 26 m across over the sky and sea: only what glows gives one", () => {
  const { light, picture } = puffFloats([mark('glow', 0.8), mark('light', 26), mark('smoke', 3)], [0, 0, 2]);
  assert.equal(light.length / picture.length, 1 / 2, 'the glow alone of the glow and the smoke drawn');
  assert.ok(!light.some((value) => value === 26), 'no reach in the light pass');
});
