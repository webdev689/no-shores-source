import assert from 'node:assert/strict';
import { test } from 'node:test';
import { glyphDrawn } from './glyphs.ts';
import { baselineOf, type Face, layLine, letterSpacing, lineHeight, widthOf, wordSpacing, wrapped } from './text.ts';

/** A face of three glyphs: a capital 7 rows tall, a descender and a space, each 600 units on. */
const capital = glyphDrawn({ rows: ['###', '#.#', '#.#', '###', '#.#', '#.#', '#.#'], advance: 600 });
const descender = glyphDrawn({ rows: ['#', '#', '#'], base: -2, advance: 600 });
const space = glyphDrawn({ rows: ['.'], advance: 600 });
const face: Face = {
  glyph: (code) => ({ A: capital, j: descender, ' ': space })[String.fromCodePoint(code)] ?? null,
};

test("the face's line, baseline and spacing at whole multiples, rounded as the pages' sheet rounds them", () => {
  assert.deepEqual([lineHeight(1), baselineOf(1), letterSpacing(1), wordSpacing(1)], [13, 10, 1, 1]);
  assert.deepEqual([lineHeight(2), baselineOf(2), letterSpacing(2), wordSpacing(2)], [26, 20, 1, 1]);
  assert.deepEqual([lineHeight(3), letterSpacing(3), wordSpacing(3)], [40, 2, 1]);
});

test('each glyph stands on a whole unit where its pen falls, its ink a rounded bearing in, the spacing after each', () => {
  const { width, glyphs } = layLine(face, 'AA', 1);
  // 600 units at 11 a 1000 is 6.6, and a letter's spacing 1: the second pen at 7.6, standing at 8.
  assert.deepEqual(
    glyphs.map(({ x, y }) => [x, y]),
    [
      [1, 3],
      [9, 3],
    ],
  );
  assert.equal(width, 16, 'two pens of 7.6, rounded up');
  const [low] = layLine(face, 'j', 1).glyphs;
  assert.deepEqual([low?.x, low?.y], [1, 9], 'a descender hangs two rows under the baseline');
  const [big] = layLine(face, 'A', 2).glyphs;
  assert.deepEqual([big?.x, big?.y], [1, 6], 'at twice the size a cell is two units: 7 rows stand 14 over 20');
});

test('a space adds its word spacing; a glyph the face does not hold stands as a ? where it has one, else nothing', () => {
  assert.equal(widthOf(face, 'A A', 1), Math.ceil(3 * 7.6 + 1));
  assert.deepEqual(layLine(face, 'Z', 1).glyphs, [], 'no ? in this face');
  const withMark: Face = { glyph: (code) => (code === 63 ? capital : null) };
  assert.equal(layLine(withMark, 'Z', 1).glyphs.length, 1);
});

test('words break at spaces into lines no wider than asked, a word too wide standing alone', () => {
  assert.deepEqual(wrapped(face, 'A A A', 1, 24), ['A A', 'A']);
  assert.deepEqual(wrapped(face, 'AAAA A', 1, 10), ['AAAA', 'A']);
  assert.deepEqual(wrapped(face, 'A', 1, 1), ['A']);
});

test('a line broken at spaces keeps a paragraph’s leading space, and drops every space at the break', () => {
  assert.deepEqual(wrapped(face, ' A', 1, 100), [' A']);
  assert.deepEqual(wrapped(face, 'A  A', 1, 10), ['A', 'A'], 'both spaces at the break hang');
  assert.deepEqual(wrapped(face, 'A  A', 1, 100), ['A  A'], 'spaces inside a line stay');
});
