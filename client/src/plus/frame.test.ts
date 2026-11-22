import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAND, EDGE, FRAME_SIDE, OUTSET, framePixels } from './frame.ts';
import { TONES } from './tones.ts';

/** The colour of the frame's pixel at (x, y), or null where the picture is clear. */
function pixelAt(x: number, y: number): string | null {
  return framePixels()[y * FRAME_SIDE + x] ?? null;
}

test('the window frame is a square picture used at 1:1 that lands its inner 2 px on the box border', () => {
  assert.equal(OUTSET, EDGE - 2);
  assert.equal(FRAME_SIDE, BAND * 2 + 1);
  assert.equal(framePixels().length, FRAME_SIDE * FRAME_SIDE);
});

test('each edge is lit from the top left, and each corner carries a brass fitting with its rivet', () => {
  const size = FRAME_SIDE;
  const middle = BAND;
  assert.equal(pixelAt(middle, 1), TONES.stoneHi, 'the top edge is lit');
  assert.equal(pixelAt(1, middle), TONES.stoneHi, 'the left edge is lit');
  assert.equal(pixelAt(middle, size - 2), TONES.stoneDark, 'the bottom edge is shaded');
  assert.equal(pixelAt(size - 2, middle), TONES.stoneDark, 'the right edge is shaded');
  assert.equal(pixelAt(middle, EDGE), null, 'inside the edge the picture is clear');
  for (const [x, y] of [
    [5, 5],
    [size - 6, 5],
    [5, size - 6],
    [size - 6, size - 6],
  ] as const)
    assert.equal(pixelAt(x, y), TONES.brassHi, `the rivet's lit pixel at ${x}, ${y}`);
});
