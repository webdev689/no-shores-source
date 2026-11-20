// Words laid out in the face's cells, where a browser would set them: each glyph's pen moved by Pixelify's own advance,
// a letter's spacing (1/22 of the size) and a word's (3/110 more), each rounded up to a whole unit as the pages' sheet
// rounds them; each glyph then stands on a whole unit, so its cells land on whole pixels. Sizes are whole multiples of
// the face's grid: a unit is a pixel of the words' size, 11 units tall, and a cell is `size` units square.
import type { Glyph } from './glyphs.ts';

/** The face's glyphs by code point; null for one it does not hold. */
export interface Face {
  glyph(code: number): Glyph | null;
}

/** The face's grid in units at size 1: an em, the line's height and the baseline from the line's top. */
const WORDS_PX = 11;
/** Pixelify's ascent and descent are 920 and 280 units an em (`face.ts`), as the pages' line stands. */
export const lineHeight = (size: number): number => Math.round((WORDS_PX * size * 1200) / 1000);
export const baselineOf = (size: number): number => Math.round((WORDS_PX * size * 920) / 1000);

/** A letter's spacing and a word's, in units, at `size`, each rounded up as the pages' sheet rounds it. */
export const letterSpacing = (size: number): number => Math.ceil((WORDS_PX * size) / 22);
export const wordSpacing = (size: number): number => Math.ceil((3 * WORDS_PX * size) / 110);

/** What stands in for a glyph the face does not hold. */
const MISSING = '?'.codePointAt(0) ?? 63;

/** A glyph as laid: the glyph, and where its top-left cell stands from the line's left and its top, in units. */
export interface Laid {
  readonly glyph: Glyph;
  readonly x: number;
  readonly y: number;
}

/** A line of words at `size`: its glyphs, and its width in units from its first pen to its last. */
export function layLine(face: Face, words: string, size: number): { readonly width: number; readonly glyphs: Laid[] } {
  const glyphs: Laid[] = [];
  const scale = (WORDS_PX * size) / 1000;
  const baseline = baselineOf(size);
  let pen = 0;
  for (const char of words) {
    const code = char.codePointAt(0) ?? 0;
    const glyph = face.glyph(code) ?? face.glyph(MISSING);
    if (!glyph) continue;
    if (glyph.width > 0) {
      // The ink's first column stands where Pixelify puts it (60 units in, 90 a column), from a whole unit.
      const x = Math.round(pen) + Math.round((60 + 90 * glyph.left) * scale);
      const y = baseline - (glyph.bottom + glyph.height) * size;
      glyphs.push({ glyph, x, y });
    }
    pen += glyph.advance * scale + letterSpacing(size) + (char === ' ' ? wordSpacing(size) : 0);
  }
  // The sheet's spacing follows every letter, the last too, as a browser's does.
  return { width: Math.ceil(pen), glyphs };
}

/** The width of `words` at `size`, in units. */
export const widthOf = (face: Face, words: string, size: number): number => layLine(face, words, size).width;

/** `words` broken at spaces into lines no wider than `width` units at `size`: a word wider than the width stands
 *  alone on its line, never broken. */
export function wrapped(face: Face, words: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of words.split(' ')) {
    const tried = line ? `${line} ${word}` : word;
    if (line && widthOf(face, tried, size) > width) {
      lines.push(line);
      line = word;
    } else line = tried;
  }
  lines.push(line);
  return lines;
}
