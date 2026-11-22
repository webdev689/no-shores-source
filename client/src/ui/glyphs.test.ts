import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRAWINGS, outlineOf } from '../face.ts';
import { centreOf, glyphDrawn, glyphRead, MENDED_GLYPHS } from './glyphs.ts';

/** Whether the face's own outline of `char` covers a point, as a browser's raster would. */
const coveredBy = (char: string) => {
  const { contours } = outlineOf(char);
  return (x: number, y: number) =>
    contours.some((contour) => {
      const acrossAll = contour.map(([across]) => across);
      const upAll = contour.map(([, up]) => up);
      return (
        x > Math.min(...acrossAll) && x < Math.max(...acrossAll) && y > Math.min(...upAll) && y < Math.max(...upAll)
      );
    });
};

test('a glyph read at its cells’ centres from the face’s outline is the drawing it was made from', () => {
  for (const char of ['B', '(', '-', '▲', '☠', '”']) {
    const drawing = DRAWINGS[char];
    assert.ok(drawing, char);
    assert.deepEqual(glyphRead(coveredBy(char), 0), { ...glyphDrawn(drawing), advance: 0 }, char);
  }
});

test('a drawn glyph keeps where it stands: its first column, its lowest row and its advance', () => {
  const paren = MENDED_GLYPHS.get('('.codePointAt(0) ?? 0);
  assert.deepEqual([paren?.left, paren?.bottom, paren?.width, paren?.height, paren?.advance], [0, -2, 3, 11, 381]);
  const hyphen = MENDED_GLYPHS.get('-'.codePointAt(0) ?? 0);
  assert.deepEqual([hyphen?.left, hyphen?.bottom, hyphen?.width, hyphen?.height], [-1, 2, 3, 1]);
  const b = MENDED_GLYPHS.get('B'.codePointAt(0) ?? 0);
  assert.equal(b?.advance, 90 * 5 + 142, 'the grid’s own advance');
  assert.deepEqual([...(b?.cells.slice(0, 5) ?? [])], [1, 1, 1, 1, 0], 'the top row first');
});

test('a glyph with no ink is no cells wide, and a cell centre falls where the grid says', () => {
  assert.deepEqual(
    glyphRead(() => false, 250),
    {
      advance: 250,
      left: 0,
      bottom: 0,
      width: 0,
      height: 0,
      cells: new Uint8Array(0),
    },
  );
  assert.deepEqual(centreOf(0, 0), [115, 44]);
  assert.deepEqual(centreOf(2, 6), [295, 576.5]);
});
