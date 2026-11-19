import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAR_EDGE, BAR_TONES, barFrameImage, barFrameSvg, tipOf } from './barFrame.ts';
import { TONES } from './tones.ts';

/** The colour the frame's picture paints at `x`, `y`, or null where it is clear. */
function colourAt(svg: string, x: number, y: number): string | null {
  return new RegExp(`<rect x='${x}' y='${y}' width='1' height='1' fill='([^']+)'/>`).exec(svg)?.[1] ?? null;
}

test('each end comes to a slender point, two pixels along for each row, its tip in brass, its corners clear', () => {
  const height = 12;
  const svg = barFrameSvg(height, BAR_TONES.stone);
  assert.equal(tipOf(height), 12);
  assert.match(svg, /width='25' height='12'/, 'two points and the column the border stretches');
  for (const row of [5, 6]) {
    assert.equal(colourAt(svg, 0, row), TONES.outline, 'the point’s outline on the middle rows');
    assert.equal(colourAt(svg, 2, row), TONES.brassHi, 'its tip in brass');
    assert.equal(colourAt(svg, 24, row), TONES.outline, 'the far point too');
  }
  assert.equal(colourAt(svg, 0, 0), null, 'clear above the point');
  assert.equal(colourAt(svg, 9, 0), null);
  assert.equal(colourAt(svg, 10, 0), TONES.outline, 'the top edge begins where the slope ends');
  assert.equal(colourAt(svg, 12, 1), TONES.stoneLit, 'the stone line along the top, lit');
  assert.equal(colourAt(svg, 12, 10), TONES.stoneDim, 'and along the foot, shaded');
  assert.equal(colourAt(svg, 12, 5), null, 'the middle is the bar’s own');
});

test('the frame lays as a border two pixels deep along the bar and its points wide at each end', () => {
  assert.equal(BAR_EDGE, 2);
  assert.match(barFrameImage(10, BAR_TONES.blood), / 2 10 \/ 2px 10px stretch$/);
  assert.notEqual(barFrameSvg(10, BAR_TONES.blood), barFrameSvg(10, BAR_TONES.stone), 'blood is its own picture');
});
