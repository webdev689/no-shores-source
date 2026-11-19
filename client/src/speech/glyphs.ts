// The emotes over a head, made for the owner's ask to use fight-life's social emotes (whose source was not to hand to
// compare against): each feeling a small piece of pixel art with its own colour, its own motion and its own sound,
// shown and heard together. The art is a grid of letters, each a tone of the glyph's palette: O its outline, M its
// body, H a highlight, D a shadow, "." clear. It is drawn in code at a whole multiple of its grid, so it stays crisp at
// any size.
import { TONES } from '../plus/tones.ts';
import type { EmoteKind } from './cast.ts';
import type { VoiceProfile } from './voice.ts';

export interface Emote {
  readonly art: readonly string[];
  readonly palette: Readonly<Record<string, string>>;
  /** How long it stands over the head, fades included. */
  readonly lifeS: number;
  readonly fadeInS: number;
  readonly fadeOutS: number;
  /** Its sound: a few syllables of the one voice, the same each time so a feeling is known by ear. */
  readonly sound: { readonly voice: VoiceProfile; readonly syllables: number };
}

/** A feeling's sound, in the voice's own terms; the muffle is fight-life's unmiked voice at a distance. */
const sound = (pitchHz: number, volume: number, syllableS: number, syllables: number) => ({
  voice: { pitchHz, spreadHz: 0, muffleHz: 1200, volume, syllableS },
  syllables,
});

export const EMOTES: Readonly<Record<EmoteKind, Emote>> = {
  /** An exclamation mark in yellow: something seen. */
  alert: {
    art: [
      '..OOO..',
      '.OMMMO.',
      '.OMMMO.',
      '.OMHMO.',
      '.OMMMO.',
      '.OMMMO.',
      '.ODMMO.',
      '.ODMMO.',
      '.ODMMO.',
      '..OOO..',
      '.......',
      '..OOO..',
      '.OMHMO.',
      '.ODMMO.',
      '..OOO..',
    ],
    palette: { O: '#584020', M: '#f4c440', H: '#fff4a0', D: '#a07020' },
    lifeS: 1,
    fadeInS: 0.08,
    fadeOutS: 0.25,
    sound: sound(180, 0.2, 0.1, 1),
  },
  /** A question mark in violet: something not understood. */
  question: {
    art: [
      '.OOOOO.',
      'OMMMHMO',
      'OM...MO',
      'OD...MO',
      '.....MO',
      '....OMO',
      '...OMO.',
      '..OMO..',
      '..OMO..',
      '..OOO..',
      '.......',
      '..OOO..',
      '.OMMHO.',
      '.ODMMO.',
      '..OOO..',
    ],
    palette: { O: '#402858', M: '#8858b0', H: '#e0c8ff', D: '#583878' },
    lifeS: 1.2,
    fadeInS: 0.12,
    fadeOutS: 0.3,
    sound: sound(130, 0.18, 0.12, 2),
  },
  /** A drop of sweat in blue: fear. */
  fear: {
    art: [
      '.....O.....',
      '....OMO....',
      '....OMO....',
      '...OMMMO...',
      '...OMMMO...',
      '..OMMMMMO..',
      '..OMMHMMO..',
      '.OMMMMMMMO.',
      '.OMMMMMMMO.',
      '.OMMMMMMMO.',
      '.ODMMMMMMO.',
      '..OMMMMMO..',
      '...OMMMO...',
      '....OOO....',
    ],
    palette: { O: '#1a3a58', M: '#4a8cb8', H: '#e0f4ff', D: '#2a5878' },
    lifeS: 1.4,
    fadeInS: 0.15,
    fadeOutS: 0.35,
    sound: sound(88, 0.18, 0.14, 1),
  },
  /** A crossed anger mark in red. */
  anger: {
    art: [
      'M.........H',
      'MM.......MM',
      '.MM.....MM.',
      '..MM...MM..',
      '...MM.MM...',
      '....MMM....',
      '...MM.MM...',
      '..MM...MM..',
      '.MM.....MM.',
      'MM.......MM',
      'D.........M',
    ],
    palette: { M: '#c83838', H: '#fca0a0', D: '#701818' },
    lifeS: 1.1,
    fadeInS: 0.08,
    fadeOutS: 0.3,
    sound: sound(70, 0.22, 0.1, 1),
  },
  /** A gold sparkle: cheer. */
  cheer: {
    art: [
      '.....M.....',
      '....MHM....',
      '....MMM....',
      '....MMM....',
      'MMMMMMMMMMM',
      '.MMMMMMMMM.',
      '..MMMMMMM..',
      '..MM...MM..',
      '.MM.....MM.',
      'MM.......MM',
      'D.........M',
    ],
    palette: { M: '#fcd040', H: '#fff8c0', D: '#a07020' },
    lifeS: 1.2,
    fadeInS: 0.1,
    fadeOutS: 0.3,
    sound: sound(160, 0.2, 0.1, 2),
  },
  /** An orange burst: pain, a blow taken. */
  pain: {
    art: [
      'M....M....M',
      '.M..OMO..M.',
      '..OOMHMOO..',
      '..OMHHHMO..',
      '.OMHHHHHMO.',
      'MMHHHHHHHMM',
      '.OMHHHHHMO.',
      '..OMHHHMO..',
      '..OODMDOO..',
      '.M..ODO..M.',
      'M....M....M',
    ],
    palette: { O: '#4a1408', M: '#e8602a', H: '#fff0a0', D: '#a82818' },
    lifeS: 1,
    fadeInS: 0.06,
    fadeOutS: 0.25,
    sound: sound(110, 0.24, 0.08, 1),
  },
  /** Three grey dots: nothing said. */
  silence: {
    art: ['.OOO..OOO..OOO.', 'OHMMOOHMMOOHMMO', 'OMMMOOMMMOOMMMO', 'OMMDOOMMDOOMMDO', '.OOO..OOO..OOO.'],
    palette: { O: '#2a2d34', M: '#c8c4b8', H: '#f4f0e6', D: '#8a867a' },
    lifeS: 1.6,
    fadeInS: 0.15,
    fadeOutS: 0.45,
    sound: sound(75, 0.15, 0.25, 1),
  },
};

/** A glyph's width and height in CSS pixels, drawn `scale` pixels to each of its grid's. */
export function glyphSize(kind: EmoteKind, scale: number): [number, number] {
  const grid = gridOf(kind);
  return [grid[0].length * scale, grid.length * scale];
}

/** The ring's letter in a grid. */
const RING = 'R';

/** A glyph's grid: its art, or, where the art has no outline of its own, the art inside a ring a cell wide of the
 *  page's outline, laid on each clear cell beside a coloured one, as words over the world are outlined. */
function gridOf(kind: EmoteKind): readonly string[] {
  const { art, palette } = EMOTES[kind];
  if ('O' in palette) return art;
  const width = art[0].length + 2;
  const padded = ['.'.repeat(width), ...art.map((line) => `.${line}.`), '.'.repeat(width)];
  const coloured = (row: number, column: number) => (padded[row]?.[column] ?? '.') !== '.';
  return padded.map((line, row) =>
    [...line]
      .map((tone, column) => {
        if (tone !== '.') return tone;
        const beside =
          coloured(row - 1, column) ||
          coloured(row + 1, column) ||
          coloured(row, column - 1) ||
          coloured(row, column + 1);
        return beside ? RING : '.';
      })
      .join(''),
  );
}

/** Every coloured cell of a glyph's grid. */
export function glyphPixels(kind: EmoteKind): { column: number; row: number; colour: string }[] {
  const { palette } = EMOTES[kind];
  return gridOf(kind).flatMap((line, row) =>
    [...line].flatMap((tone, column) =>
      tone === '.' ? [] : [{ column, row, colour: tone === RING ? TONES.outline : palette[tone] }],
    ),
  );
}

/** How far a glyph has moved from its place `ageS` seconds after it showed, in cells of its grid: the motion each
 *  feeling has in fight-life, so alarm bobs quickly, fear bobs slowly, anger shakes and cheer rises. */
export function glyphMotion(kind: EmoteKind, ageS: number, reduced: boolean): [number, number] {
  if (reduced) return [0, 0];
  const wave = (rate: number, reach: number) => Math.round(Math.sin(ageS * rate) * reach);
  switch (kind) {
    case 'alert':
      return [0, wave(7, 1)];
    case 'question':
      return [wave(2.5, 1), wave(4, 1)];
    case 'fear':
      return [0, wave(4, 2)];
    case 'anger':
      return [wave(25, 1), 0];
    case 'cheer':
      return [0, wave(6, 2) - Math.round(ageS * 4)];
    case 'pain':
      return [wave(31, 1), Math.round(Math.cos(ageS * 23))];
    case 'silence':
      return [0, 0];
  }
}

/** Draws a glyph onto `canvas`, sized to it at `scale`. */
export function drawGlyph(canvas: HTMLCanvasElement, kind: EmoteKind, scale: number): void {
  [canvas.width, canvas.height] = glyphSize(kind, scale);
  const pen = canvas.getContext('2d');
  if (!pen) return;
  for (const { column, row, colour } of glyphPixels(kind)) {
    pen.fillStyle = colour;
    pen.fillRect(column * scale, row * scale, scale, scale);
  }
}
