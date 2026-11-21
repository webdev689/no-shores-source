import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAR_EDGE, BAR_TONES, barFrameCells, tipOf } from './barFrame.ts';
import { TONES } from './tones.ts';

test('each end comes to a slender point, two pixels along for each row, its tip in brass, its corners clear', () => {
  const height = 12;
  const cells = barFrameCells(height, BAR_TONES.stone);
  const width = tipOf(height) * 2 + 1;
  const colourAt = (x: number, y: number) => cells[y * width + x] ?? null;
  assert.equal(tipOf(height), 12);
  assert.equal(cells.length, 25 * 12, 'two points and the column stretched between them');
  for (const row of [5, 6]) {
    assert.equal(colourAt(0, row), TONES.outline, 'the point’s outline on the middle rows');
    assert.equal(colourAt(2, row), TONES.brassHi, 'its tip in brass');
    assert.equal(colourAt(24, row), TONES.outline, 'the far point too');
  }
  assert.equal(colourAt(0, 0), null, 'clear above the point');
  assert.equal(colourAt(9, 0), null);
  assert.equal(colourAt(10, 0), TONES.outline, 'the top edge begins where the slope ends');
  assert.equal(colourAt(12, 1), TONES.stoneLit, 'the stone line along the top, lit');
  assert.equal(colourAt(12, 10), TONES.stoneDim, 'and along the foot, shaded');
  assert.equal(colourAt(12, 5), null, 'the middle is the bar’s own');
});

test('the frame stands two pixels deep along the bar', () => {
  assert.equal(BAR_EDGE, 2);
  assert.notDeepEqual(
    barFrameCells(10, BAR_TONES.blood),
    barFrameCells(10, BAR_TONES.stone),
    'blood is its own picture',
  );
});
