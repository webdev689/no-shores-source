import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOGO_CELLS, logoNode, logoScale } from './logo.ts';
import { LOGO } from './logoPicture.ts';

test('the logo is whole: every row as wide, and every letter one of its colours', () => {
  assert.ok(LOGO_CELLS.width > 0 && LOGO_CELLS.height > 0);
  for (const row of LOGO.rows) {
    assert.equal(row.length, LOGO_CELLS.width);
    for (const letter of row.replaceAll('.', '')) assert.ok(letter.charCodeAt(0) - 97 < LOGO.colours.length, letter);
  }
});

test('the logo is laid at whole multiples of its cells, one at least, and its pixels are its colours', () => {
  assert.equal(logoScale(10, 3), 1, 'one at least, however narrow');
  assert.equal(logoScale(LOGO_CELLS.width * 2.9, 3), 2);
  assert.equal(logoScale(LOGO_CELLS.width * 9, 3), 3, 'and no more than asked');
  const node = logoNode(2);
  assert.ok(node && typeof node === 'object');
  assert.equal(node.width, LOGO_CELLS.width * 2);
  const source = node.picture?.source;
  assert.ok(source && 'pixels' in source);
  const pixels = source.pixels();
  assert.equal(pixels.length, LOGO_CELLS.width * LOGO_CELLS.height * 4);
  const drawn = pixels.filter((value, index) => index % 4 === 3 && value === 255).length;
  assert.equal(drawn, LOGO.rows.join('').replaceAll('.', '').length, 'a pixel for each lettered cell');
});
