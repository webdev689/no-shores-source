import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mark } from './effects.ts';
import { MOST_PUFFS, puffFloats } from './puffView.ts';

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

test('past the most puffs drawn, the farthest are the ones left out, never the nearest', () => {
  const far = Array.from({ length: MOST_PUFFS + 50 }, (unused, index) => ({ ...mark('smoke', 1), y: 100 + index }));
  const near = { ...mark('smoke', 7), y: 1 };
  const { picture } = puffFloats([...far, near], [0, 0, 2]);
  const radii = Array.from({ length: picture.length / 12 }, (unused, index) => picture[index * 12 + 3]);
  assert.equal(radii.length, MOST_PUFFS);
  assert.equal(radii.at(-1), 7, 'the nearest drawn, last over the rest');
});
