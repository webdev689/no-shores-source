import assert from 'node:assert/strict';
import { test } from 'node:test';
import { facesOf, rangesOf } from './fontFaces.ts';

test('a unicode range list reads as pairs of code points, a lone point as a range of one', () => {
  assert.deepEqual(rangesOf('U+0000-00FF,U+0131, U+2215'), [
    [0, 255],
    [0x131, 0x131],
    [0x2215, 0x2215],
  ]);
});

test("a package's faces read as their files and ranges, in the order the sheet gives them", () => {
  const css = `@font-face {
  font-family: 'Pixelify Sans Variable';
  src: url(./files/a-latin.woff2) format('woff2-variations');
  unicode-range: U+0000-00FF,U+20AC;
}
@font-face {
  src: url(./files/a-cyrillic.woff2) format('woff2-variations');
  unicode-range: U+0400-045F;
}`;
  assert.deepEqual(facesOf(css), [
    {
      file: 'a-latin.woff2',
      ranges: [
        [0, 255],
        [0x20ac, 0x20ac],
      ],
    },
    { file: 'a-cyrillic.woff2', ranges: [[0x400, 0x45f]] },
  ]);
});
