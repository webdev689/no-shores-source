import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLOTH_HEIGHT,
  CLOTH_WIDTH,
  STANDARD_HEIGHT,
  STANDARD_WIDTH,
  clothPixels,
  inCloth,
  onDevice,
  standardPixels,
} from './bannerArt.ts';
import { type Banner, hexOf } from './bannerLaw.ts';

const BANNER: Banner = {
  cut: 'swallowtail',
  cloth: 'navy',
  device: 'halves',
  deviceColour: 'gold',
  sign: 'anchor',
  signColour: 'salt',
  ground: 'roundel',
  groundColour: 'crimson',
  staff: 'iron',
};

const pixelAt = (pixels: Uint8ClampedArray, width: number, x: number, y: number) =>
  Array.from(pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
const rgbOf = (hex: string) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
/** Whether a colour is the named one, within the folds' light and shade. */
const near = (colour: number[], hex: string) =>
  rgbOf(hex).every((channel, place) => Math.abs(channel - (colour[place] ?? 0)) <= channel * 0.2 + 4);

test('each cut shapes the foot: a swallowtail forked, a square straight, a point to its middle', () => {
  assert.ok(inCloth('swallowtail', 1, 62) && !inCloth('swallowtail', 16, 62), 'forked, its tails at the sides');
  assert.ok(inCloth('square', 16, 55) && !inCloth('square', 16, 56), 'cut straight across');
  assert.ok(inCloth('point', 15, 62) && !inCloth('point', 2, 62), 'drawn in to a point');
  assert.ok(!inCloth('three-tails', 10, 62) && inCloth('three-tails', 16, 62), 'three tails between two notches');
  assert.ok(inCloth('swallowtail', 16, 30), 'whole above its foot');
});

test('the head is a row of loops the crossbar runs through', () => {
  const loops = Array.from({ length: CLOTH_WIDTH }, (unused, x) => inCloth('square', x, 0));
  assert.ok(loops.includes(true) && loops.includes(false));
  assert.ok(Array.from({ length: CLOTH_WIDTH }, (unused, x) => inCloth('square', x, 2)).every(Boolean));
});

test('a device marks its part of the cloth and leaves the rest', () => {
  assert.ok(onDevice('halves', 'square', 20, 10) && !onDevice('halves', 'square', 10, 10));
  assert.ok(onDevice('bar', 'square', 3, 28) && !onDevice('bar', 'square', 3, 10));
  assert.ok(onDevice('border', 'square', 1, 20) && !onDevice('border', 'square', 16, 20));
  assert.ok(!onDevice('plain', 'square', 16, 20));
});

test('the cloth is painted in its colours, the sign in the middle of its ground, nothing where the cut is', () => {
  const pixels = clothPixels(BANNER);
  assert.equal(pixels.length, CLOTH_WIDTH * CLOTH_HEIGHT * 4);
  assert.ok(near(pixelAt(pixels, CLOTH_WIDTH, 4, 45), hexOf('navy')), 'the cloth on its left');
  assert.ok(near(pixelAt(pixels, CLOTH_WIDTH, 28, 45), hexOf('gold')), 'the device on its right half');
  assert.ok(near(pixelAt(pixels, CLOTH_WIDTH, 15, 18), hexOf('crimson')), 'the ground round the sign');
  assert.ok(near(pixelAt(pixels, CLOTH_WIDTH, 15, 26), hexOf('salt')), "the anchor's shank in the middle");
  assert.equal(pixelAt(pixels, CLOTH_WIDTH, 16, 63)[3], 0, 'see-through in the fork');
});

test('the standard hangs the cloth from its crossbar over its pole, on a stone foot', () => {
  const pixels = standardPixels(BANNER);
  assert.equal(pixels.length, STANDARD_WIDTH * STANDARD_HEIGHT * 4);
  assert.equal(pixelAt(pixels, STANDARD_WIDTH, 0, 7)[3], 255, 'the crossbar reaches past the cloth');
  assert.equal(pixelAt(pixels, STANDARD_WIDTH, 19, 85)[3], 255, 'the pole runs on below the cloth');
  assert.equal(pixelAt(pixels, STANDARD_WIDTH, 2, 85)[3], 0, 'and nothing stands beside it');
  assert.equal(pixelAt(pixels, STANDARD_WIDTH, 14, STANDARD_HEIGHT - 1)[3], 255, 'the foot');
});

test('the spyglass lies level, so it never reads as the slanted oar', () => {
  // The sign's cells in its own colour, a colour nothing else on this banner wears.
  const extent = (sign: string) => {
    const pixels = clothPixels({ ...BANNER, sign, signColour: 'kelp', ground: 'none', device: 'plain' });
    const [across, down]: [number[], number[]] = [[], []];
    for (let y = 0; y < CLOTH_HEIGHT; y += 1)
      for (let x = 0; x < CLOTH_WIDTH; x += 1)
        if (near(pixelAt(pixels, CLOTH_WIDTH, x, y), hexOf('kelp'))) [across.push(x), down.push(y)];
    return { wide: Math.max(...across) - Math.min(...across) + 1, tall: Math.max(...down) - Math.min(...down) + 1 };
  };
  const spyglass = extent('spyglass');
  assert.ok(spyglass.wide >= 2 * spyglass.tall, `the spyglass ${spyglass.wide} wide, ${spyglass.tall} tall`);
  const oar = extent('oar');
  assert.ok(oar.tall > oar.wide / 2, 'the oar still slants');
});
