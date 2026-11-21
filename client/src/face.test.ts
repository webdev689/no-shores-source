import assert from 'node:assert/strict';
import { test } from 'node:test';
import { outlineOf } from './face.ts';

test('the mended 2 and Z stand apart, and the 5 and the B are drawn whole', () => {
  const cells = (char: string) => new Set(outlineOf(char).contours.map((contour) => contour.join(' ')));
  const two = cells('2');
  const zed = cells('Z');
  assert.ok([...two].filter((each) => !zed.has(each)).length >= 6);
  for (const char of ['5', 'B', 'Z', '2']) {
    const { contours, advance } = outlineOf(char);
    const heights = contours.flat().map(([, y]) => y);
    assert.equal(Math.min(...heights), -12, `${char} stands on the baseline`);
    assert.equal(Math.max(...heights), 633, `${char} reaches the cap height`);
    assert.equal(advance, 592);
  }
});
