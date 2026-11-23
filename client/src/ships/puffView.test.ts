import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Mark } from './effects.ts';
import { MOST_PUFFS, PuffScratch, puffFloats } from './puffView.ts';

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

test('puffs as far off stay in the order given, and floats kept from frame to frame lay each frame as fresh ones do', () => {
  // Two rings of puffs, each puff of a ring exactly as far from the eye: told apart by their radii.
  const around = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [0.6, 0.8],
    [-0.6, 0.8],
  ] as const;
  const ring = (far: number, first: number) =>
    around.map(([east, south], index) => ({
      ...mark(index % 2 ? 'glow' : 'smoke', first + index),
      x: far * east,
      y: far * south,
    }));
  const marks = [...ring(5, 10), mark('light', 26), ...ring(10, 20)];
  const radii = (floats: Float32Array) =>
    Array.from({ length: floats.length / 12 }, (unused, nth) => floats[nth * 12 + 3]);
  const kept = new PuffScratch();
  puffFloats([...marks, ...marks, ...marks], [0, 0, 2], kept);
  const { picture, light } = puffFloats(marks, [0, 0, 2], kept);
  assert.deepEqual(radii(picture), [20, 21, 22, 23, 24, 25, 10, 11, 12, 13, 14, 15], 'far to near, ties as given');
  assert.deepEqual(radii(light), [11, 13, 15, 21, 23, 25], 'the glows as given');
  assert.deepEqual(puffFloats(marks, [0, 0, 2]), { picture, light });
});

test('past the most puffs drawn, the farthest are the ones left out, never the nearest', () => {
  const far = Array.from({ length: MOST_PUFFS + 50 }, (unused, index) => ({ ...mark('smoke', 1), y: 100 + index }));
  const near = { ...mark('smoke', 7), y: 1 };
  const { picture } = puffFloats([...far, near], [0, 0, 2]);
  const radii = Array.from({ length: picture.length / 12 }, (unused, index) => picture[index * 12 + 3]);
  assert.equal(radii.length, MOST_PUFFS);
  assert.equal(radii.at(-1), 7, 'the nearest drawn, last over the rest');
});
