// The faces bounties wear on their tiles, after Destiny's Bounty Tracker, where every bounty wears the sign of whoever
// posts it: the town's a pinned writ under a red seal on slate, as the Journal's bounty icon is drawn; a faction's its
// own emblem. Every bounty of one kind wears the same face. Each is a sign 24 cells square, grounded and framed as an
// emblem's sign is (`emblemArt.ts`), so the two kinds share one hand.
import factions from '../../../content/gear/factions.json' with { type: 'json' };
import { OUTLINE } from '../combat/dropPictures.ts';
import type { Pixels } from '../plus/emblems.ts';
import type { Node } from '../ui/node.ts';
import { type Emblem, SIGN_CELLS, emblemOf, emblemPixels } from '../plus/emblemArt.ts';

/** The town's writ, 16 cells by 17: a notice pinned by a brass tack, its lines inked, its red seal and ribbons. */
const WRIT: Pixels = {
  rows: [
    '......aGa.......',
    '.....aGgga......',
    '..aaaaagaaaaaa..',
    '.aPPPPPPPPPPPpa.',
    '.aPPPPPPPPPPPpa.',
    '.aPPiiiiiiiiPpa.',
    '.aPPPPPPPPPPPpa.',
    '.aPPiiiiiiiPPpa.',
    '.aPPPPPPPPPPPpa.',
    '.aPPiiiiPPaaapa.',
    '.aPPPPPPPaRWRaa.',
    '.aPPiiiPaRRRrra.',
    '.aPPPPPPaRrrrsa.',
    '.aqPPPPPParrsaa.',
    '..aqppppparasaa.',
    '...aaaaaaarasa..',
    '..........a.a...',
  ],
  tones: {
    G: '#f3cf86',
    P: '#f1e6c8',
    R: '#d8553c',
    W: '#f59a7c',
    a: OUTLINE,
    g: '#c08a3e',
    i: '#4a3b2a',
    p: '#d2bf92',
    q: '#a08a5e',
    r: '#a8321e',
    s: '#6a1b10',
  },
};
/** Where the writ's top left cell stands on its sign. */
const WRIT_AT = [4, 3] as const;

/** The town's sign: slate lit along its top and framed as an emblem's, with no sign of its own: the writ lies over
 *  it. */
const TOWN: Emblem = {
  id: 'town-bounty',
  name: 'Overlook',
  rarity: 'normal',
  words: '',
  source: { kind: 'board' },
  art: { ground: ['#34404e', '#141a22'], ink: '#f1e6c8', accent: '#9fb3c8', pattern: 'plain', motif: '' },
};

/** A faction as the factions' file names it, by its number; none for one not there. */
export function factionNamed(faction: number) {
  return factions.factions.find((each) => each.id === faction) ?? null;
}

/** The emblem a faction's bounties wear, by its number; the town's sign for the town's (0) and for one not in the
 *  file. */
export function posterEmblem(faction: number): Emblem {
  const found = faction === 0 ? null : factionNamed(faction);
  return found ? emblemOf(found.emblem) : TOWN;
}

const rgbOf = (hex: string): readonly [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** A bounty's face as its 24 cells square of colour, four channels each: a faction's emblem's sign, or the town's
 *  writ on its slate. */
export function bountyFacePixels(faction: number): Uint8ClampedArray<ArrayBuffer> {
  const emblem = posterEmblem(faction);
  const pixels = emblemPixels(emblem, 'sign');
  if (emblem !== TOWN) return pixels;
  WRIT.rows.forEach((row, y) =>
    [...row].forEach((letter, x) => {
      const tone = WRIT.tones[letter];
      if (tone) pixels.set([...rgbOf(tone), 255], ((y + WRIT_AT[1]) * SIGN_CELLS + x + WRIT_AT[0]) * 4);
    }),
  );
  return pixels;
}

/** A bounty's face laid `size` pixels square, a whole multiple of its 24 cells. */
export function bountyFaceNode(faction: number, size: number): Node {
  const known = faction === 0 || factionNamed(faction) !== null ? faction : 0;
  return {
    width: size,
    height: size,
    picture: {
      key: `bounty face ${known}`,
      source: { pixels: () => new Uint8Array(bountyFacePixels(known).buffer) },
      pixel: { width: SIGN_CELLS, height: SIGN_CELLS },
    },
  };
}
