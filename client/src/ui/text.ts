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

/** A letter's spacing and a word's, in units, at `size`, each rounded up as the pages' sheet rounds it; a letter's is
 *  `tracking` 22nds of the size, 1 unless said, as a sheet's `calc(3em / 22)` widens a label's. */
export const letterSpacing = (size: number, tracking = 1): number => Math.ceil((WORDS_PX * size * tracking) / 22);
export const wordSpacing = (size: number): number => Math.ceil((3 * WORDS_PX * size) / 110);

/** What stands in for a glyph the face does not hold. */
const MISSING = '?'.codePointAt(0) ?? 63;

/** A glyph as laid: the glyph, where its top-left cell stands from the line's left and its top, in units, and which
 *  character of the words it is, counted by code point. */
export interface Laid {
  readonly glyph: Glyph;
  readonly x: number;
  readonly y: number;
  readonly index: number;
}

/** Where a style's letters stand past the face's own: a bold letter at its code point this far on, an italic one that
 *  far, in Unicode's private planes, so styled words are laid, measured and wrapped as any words are. */
const STYLED = { bold: 0xf0000, italic: 0x100000 } as const;
export type Style = keyof typeof STYLED;

/** `words` in `style`: each letter of the face's plane at its styled code point; a space or a newline stays itself. */
export const styled = (words: string, style: Style): string =>
  Array.from(words, (char) => {
    const code = char.codePointAt(0) ?? 0;
    return char === ' ' || char === '\n' || code > 0xffff ? char : String.fromCodePoint(code + STYLED[style]);
  }).join('');

/** A bold glyph: each cell doubled into the next column, so a stroke stands two cells wide; the pen a column further. */
function emboldened(glyph: Glyph): Glyph {
  const { width, height, cells } = glyph;
  const wide = width + 1;
  const bold = new Uint8Array(wide * height);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      if (cells[row * width + column]) bold.fill(1, row * wide + column, row * wide + column + 2);
  return { ...glyph, advance: glyph.advance + 90, width: width > 0 ? wide : 0, cells: width > 0 ? bold : cells };
}

/** Rows over the baseline an italic letter leans a column right for. */
const LEAN_ROWS = 3;

/** An italic glyph: each row moved a whole column right for every `LEAN_ROWS` over the baseline, left under it, so
 *  it leans and stays on the face's cells; the pen where it was. */
function leaned(glyph: Glyph): Glyph {
  const { width, height, cells, bottom } = glyph;
  if (width === 0) return glyph;
  const shifts = Array.from({ length: height }, (unused, row) => Math.floor((bottom + height - row) / LEAN_ROWS));
  const least = Math.min(...shifts);
  const wide = width + Math.max(...shifts) - least;
  const leaning = new Uint8Array(wide * height);
  for (let row = 0; row < height; row++)
    for (let column = 0; column < width; column++)
      leaning[row * wide + column + (shifts[row] ?? 0) - least] = cells[row * width + column] ?? 0;
  return { ...glyph, left: glyph.left + least, width: wide, cells: leaning };
}

/** Styled glyphs made from the face's own, once each, so the atlas lays each once. */
const madeGlyphs = { bold: new WeakMap<Glyph, Glyph>(), italic: new WeakMap<Glyph, Glyph>() };
const MAKE = { bold: emboldened, italic: leaned } as const;

function glyphOf(face: Face, char: string): Glyph | null {
  const code = char.codePointAt(0) ?? 0;
  const style: Style | null = code >= STYLED.italic ? 'italic' : code >= STYLED.bold ? 'bold' : null;
  const plain = (point: number) => face.glyph(point) ?? face.glyph(MISSING);
  if (!style) return plain(code);
  const glyph = plain(code - STYLED[style]);
  if (!glyph) return null;
  const made = madeGlyphs[style].get(glyph) ?? MAKE[style](glyph);
  madeGlyphs[style].set(glyph, made);
  return made;
}

/** How far the pen moves past `char`, `glyph` in the face, at `size`, in units: the glyph's advance and the sheet's
 *  spacing after it; nothing for a glyph the face does not hold. */
function advanceOf(glyph: Glyph | null, char: string, size: number, tracking: number): number {
  if (!glyph) return 0;
  return (
    glyph.advance * ((WORDS_PX * size) / 1000) + letterSpacing(size, tracking) + (char === ' ' ? wordSpacing(size) : 0)
  );
}

/** `words` added to a pen at `pen`, as `layLine` moves it, character by character. */
function penPast(face: Face, pen: number, words: string, size: number, tracking: number): number {
  let moved = pen;
  for (const char of words) moved += advanceOf(glyphOf(face, char), char, size, tracking);
  return moved;
}

/** A line as `layLine` lays it. */
export interface LaidLine {
  readonly width: number;
  readonly glyphs: readonly Laid[];
}

/** Lines laid, by face and by their words, size and tracking: words drawn each frame are laid once. */
const laidLines = new WeakMap<Face, Map<string, LaidLine>>();
/** shortcut: emptied whole at this many lines, so the frame after lays every line again; drop the least used instead
 *  if words that change every frame make that frame show. */
const MOST_LAID = 4096;

/** A line of words at `size`: its glyphs, and its width in units from its first pen to its last. */
export function layLine(face: Face, words: string, size: number, tracking = 1): LaidLine {
  let lines = laidLines.get(face);
  if (!lines) laidLines.set(face, (lines = new Map()));
  const key = `${size} ${tracking} ${words}`;
  const known = lines.get(key);
  if (known) return known;
  const glyphs: Laid[] = [];
  const scale = (WORDS_PX * size) / 1000;
  const baseline = baselineOf(size);
  let pen = 0;
  let index = -1;
  for (const char of words) {
    index += 1;
    const glyph = glyphOf(face, char);
    if (glyph && glyph.width > 0) {
      // The ink's first column stands where Pixelify puts it (60 units in, 90 a column), from a whole unit.
      const x = Math.round(pen) + Math.round((60 + 90 * glyph.left) * scale);
      const y = baseline - (glyph.bottom + glyph.height) * size;
      glyphs.push({ glyph, x, y, index });
    }
    pen += advanceOf(glyph, char, size, tracking);
  }
  // The sheet's spacing follows every letter, the last too, as a browser's does.
  const laid = { width: Math.ceil(pen), glyphs };
  if (lines.size >= MOST_LAID) lines.clear();
  lines.set(key, laid);
  return laid;
}

/** The width of `words` at `size` and `tracking`, in units. */
export const widthOf = (face: Face, words: string, size: number, tracking = 1): number =>
  Math.ceil(penPast(face, 0, words, size, tracking));

/** `words` broken at spaces into lines no wider than `width` units at `size`: a word wider than the width stands
 *  alone on its line, never broken. A paragraph's leading spaces stay; the spaces where a line breaks hang past its
 *  end and are dropped, as a browser's do. */
export function wrapped(face: Face, words: string, size: number, width: number, tracking = 1): string[] {
  const lines: string[] = [];
  let line: string | null = null;
  let pen = 0;
  for (const word of words.split(' ')) {
    if (line === null) {
      [line, pen] = [word, penPast(face, 0, word, size, tracking)];
      continue;
    }
    // Measured on from the line's pen, in the order `layLine` adds, so the width is the one it would lay.
    const tried = penPast(face, pen, ` ${word}`, size, tracking);
    if (word !== '' && /[^ ]/.test(line) && Math.ceil(tried) > width) {
      lines.push(line.replace(/ +$/, ''));
      [line, pen] = [word, penPast(face, 0, word, size, tracking)];
    } else [line, pen] = [`${line} ${word}`, tried];
  }
  lines.push(line ?? '');
  return lines;
}
