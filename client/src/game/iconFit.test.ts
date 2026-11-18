import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drawnBounds, fitIcon } from './iconFit.ts';

test('a picture grows by whole pixels where that keeps most of its box, else past it and smoothed down once', () => {
  const small = fitIcon(9, 12, 48);
  assert.deepEqual([small?.grown, small?.smooth, small?.shownHeight], [4, false, 48], 'four to one, square pixels');
  const tiny = fitIcon(5, 5, 64);
  assert.deepEqual([tiny?.grown, tiny?.shownWidth], [4, 20], 'never past four to one');
  const awkward = fitIcon(33, 20, 64);
  assert.deepEqual([awkward?.grown, awkward?.smooth, awkward?.shownWidth], [2, true, 64], '1 would keep half: 2, down');
  const near = fitIcon(26, 26, 64);
  assert.deepEqual([near?.grown, near?.smooth, near?.shownWidth], [2, false, 52], '2 keeps 81%: square pixels');
  const large = fitIcon(200, 100, 96);
  assert.deepEqual([large?.smooth, large?.shownWidth, large?.shownHeight], [true, 96, 48], 'a large one fits its box');
  const sharp = fitIcon(12, 12, 48, 2);
  assert.deepEqual([sharp?.grown, sharp?.width, sharp?.shownWidth], [8, 96, 48], 'drawn at the screen’s own pixels');
  assert.equal(fitIcon(0, 4, 48), null);
});

test('a picture’s drawn pixels are found round its clear margin', () => {
  const pixels = new Uint8ClampedArray(4 * 3 * 4);
  pixels[(1 * 4 + 2) * 4 + 3] = 255;
  pixels[(2 * 4 + 1) * 4 + 3] = 255;
  assert.deepEqual(drawnBounds(4, 3, pixels), [1, 1, 2, 2]);
  assert.equal(drawnBounds(4, 3, new Uint8ClampedArray(48)), null);
});
