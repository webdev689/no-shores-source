import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAUNTLET, GAUNTLET_SIZE, gauntletCss, gauntletOver, gauntletPixels } from './gauntlet.ts';

test('the gauntlet is two frames 31 by 32 in its five colours, never past 32 a side', () => {
  assert.deepEqual(Object.keys(GAUNTLET), ['point', 'press']);
  assert.ok(GAUNTLET_SIZE.width <= 32 && GAUNTLET_SIZE.height <= 32);
  for (const rows of Object.values(GAUNTLET)) {
    assert.equal(rows.length, GAUNTLET_SIZE.height);
    for (const row of rows) assert.match(row, /^[0-4.]{31}$/);
  }
  assert.notDeepEqual(GAUNTLET.point, GAUNTLET.press);
});

test('its point is the top left: the pointing frame’s fingertip; pressed, the finger curls from it', () => {
  const pixel = (pixels: Uint8Array, x: number, y: number) => [
    ...pixels.subarray((y * 31 + x) * 4, (y * 31 + x) * 4 + 4),
  ];
  const point = gauntletPixels('point');
  assert.equal(point.length, 31 * 32 * 4);
  assert.deepEqual(pixel(point, 0, 0), [8, 9, 12, 255], 'the darkest edge of the fingertip');
  assert.deepEqual(pixel(point, 30, 0), [0, 0, 0, 0], 'clear beyond the hand');
  assert.equal(pixel(gauntletPixels('press'), 0, 0)[3], 0);
  for (const frame of ['point', 'press'] as const) assert.match(gauntletCss(frame)[1], / 0 0, auto$/);
});

test('the mouse wears it as a picture at 1x and at 2x, twice the size; the caret and none stay as they are', () => {
  const [plain, sharp] = gauntletCss('point');
  const sizes = [...sharp.matchAll(/width%3D%22(\d+)%22%20height%3D%22(\d+)%22/g)].map((found) => found.slice(1));
  assert.deepEqual(sizes, [
    ['31', '32'],
    ['62', '64'],
  ]);
  assert.ok(sharp.includes(plain.slice(0, plain.indexOf(' 0 0'))), 'the plain picture is its 1x');
  assert.deepEqual(['default', 'pointer', 'text', 'none'].map(gauntletOver), ['gauntlet', 'gauntlet', 'text', 'none']);
});
