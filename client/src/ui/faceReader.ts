// Reads Pixelify Sans's glyphs into cells in the page, as each is first wanted: drawn large on an OffscreenCanvas and
// read at its cells' centres, a sample the raster leaves grey (an edge near it) read again where a pixel is half a
// font unit. Every sample is at least a unit from an edge but the mended glyphs' (`face.ts`), which are drawn instead,
// so every browser reads every glyph alike. Nothing read is kept past the page.
import cyrillic from '@fontsource-variable/pixelify-sans/files/pixelify-sans-cyrillic-wght-normal.woff2?url';
import latinExt from '@fontsource-variable/pixelify-sans/files/pixelify-sans-latin-ext-wght-normal.woff2?url';
import latin from '@fontsource-variable/pixelify-sans/files/pixelify-sans-latin-wght-normal.woff2?url';
import sheet from '@fontsource-variable/pixelify-sans/index.css?raw';
import { facesOf } from './fontFaces.ts';
import { useMendedFace } from '../face.ts';
import { type Glyph, glyphRead, MENDED_GLYPHS } from './glyphs.ts';

/** The family the reader loads Pixelify under, apart from the page's own. */
const FAMILY = 'Pixelify Cells';
/** Pixels an em when a glyph is first read, and when a grey sample is read again. */
const COARSE_EM = 100;
const FINE_EM = 2000;
/** A sample's coverage, out of 255, that is surely clear or surely ink; between them it is read again. */
const CLEAR = 24;
const INK = 231;
/** A mark that combines with the letter before it: drawn alone, a browser shapes it onto a dotted circle, so it is
 *  never read; a word that holds one holds the letter it makes, precomposed. */
const COMBINING = /\p{Mn}/u;
/** The coarse canvas: wide and tall enough for any glyph read with its baseline and pen where they stand. */
const COARSE = { width: 120, height: 140, penX: 20, baseline: 100 } as const;

const FILES: Readonly<Record<string, string>> = {
  'pixelify-sans-cyrillic-wght-normal.woff2': cyrillic,
  'pixelify-sans-latin-ext-wght-normal.woff2': latinExt,
  'pixelify-sans-latin-wght-normal.woff2': latin,
};

/** The face as cells: a glyph by code point, read as it is first asked for; null for one the face does not hold. */
export interface FaceCells {
  glyph(code: number): Glyph | null;
}

/** Loads Pixelify Sans for reading and answers its glyphs as cells. */
export async function readFace(): Promise<FaceCells> {
  const faces = facesOf(sheet);
  const fonts = (globalThis as { fonts?: FontFaceSet }).fonts ?? document.fonts;
  // The held map's lettering, written by a 2D canvas where the face is read, takes the mended glyphs as a font.
  useMendedFace(fonts);
  await Promise.all(
    faces.map(async ({ file, ranges }) => {
      const url = FILES[file];
      if (!url) throw new Error(`Pixelify's ${file} is not served`);
      const face = new FontFace(FAMILY, `url(${url})`, {
        weight: '400 700',
        unicodeRange: ranges.map(([from, to]) => `U+${from.toString(16)}-${to.toString(16)}`).join(','),
      });
      fonts.add(await face.load());
    }),
  );
  const held = (code: number) =>
    !COMBINING.test(String.fromCodePoint(code)) &&
    faces.some(({ ranges }) => ranges.some(([from, to]) => code >= from && code <= to));
  const pen = (canvas: OffscreenCanvas, pixelsAnEm: number) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2D canvas to read the face on');
    context.font = `500 ${pixelsAnEm}px "${FAMILY}"`;
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#fff';
    return context;
  };
  const coarse = pen(new OffscreenCanvas(COARSE.width, COARSE.height), COARSE_EM);
  const fine = pen(new OffscreenCanvas(5, 5), FINE_EM);
  const read = new Map<number, Glyph | null>();
  const readGlyph = (code: number): Glyph | null => {
    const mended = MENDED_GLYPHS.get(code);
    if (mended) return mended;
    if (!held(code)) return null;
    const char = String.fromCodePoint(code);
    coarse.clearRect(0, 0, COARSE.width, COARSE.height);
    coarse.fillText(char, COARSE.penX, COARSE.baseline);
    const pixels = coarse.getImageData(0, 0, COARSE.width, COARSE.height).data;
    const scale = COARSE_EM / 1000;
    const drawn = (x: number, y: number): boolean => {
      const column = Math.floor(COARSE.penX + x * scale);
      const row = Math.floor(COARSE.baseline - y * scale);
      const cover = pixels[(row * COARSE.width + column) * 4 + 3] ?? 0;
      if (cover <= CLEAR || cover >= INK) return cover >= INK;
      // The point at the middle pixel's centre, two pixels to the unit, so an edge a unit off leaves it whole.
      const half = FINE_EM / 1000;
      fine.clearRect(0, 0, 5, 5);
      fine.fillText(char, 2.5 - x * half, 2.5 + y * half);
      return (fine.getImageData(2, 2, 1, 1).data[3] ?? 0) > 127;
    };
    return glyphRead(drawn, Math.round((coarse.measureText(char).width / COARSE_EM) * 1000));
  };
  return {
    glyph(code) {
      if (!read.has(code)) read.set(code, readGlyph(code));
      return read.get(code) ?? null;
    },
  };
}
