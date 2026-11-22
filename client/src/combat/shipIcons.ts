// The pictures of the ship's bar, drawn pixel by pixel as the Arts' icons are (`player/artGlyphs.ts`), 12 cells a
// side: a cannon on its carriage facing the side it fires to, a sail filled by the wind with lines of speed behind it,
// a shield for the brace, and each load's shot (a round ball, a cluster of grape, two balls on a chain, a ball glowing
// hot). Each map's letters are its own colours in turn: an outline, a deep shade, its body, its light, a highlight,
// and wood or brass. They stand in the Tenets' ring, drawn in brass.
import { paletteSvg, TENET_RING } from '../player/artGlyphs.ts';
import type { ShipIcon } from '../plus/seaFight.ts';
import { TONES } from '../plus/tones.ts';

/** Iron (a gun, its shot) on a wooden carriage; canvas on a wooden yard; a wooden shield rimmed in brass; a ball red
 *  hot, its sparks yellow; and the ring's brass. */
const IRON = [TONES.outline, '#3a414b', '#69727e', '#a9b3bf', '#f0f4f8', '#9a6633'];
const CANVAS = [TONES.outline, '#7d6e50', '#cfc3a4', '#efe7d4', '#ffffff', '#8a5a2b'];
const SHIELD = [TONES.outline, '#4a2f17', '#7d5128', '#b07a40', '#f3e2c0', TONES.brass];
const HOT = ['#2a0703', '#8c2410', '#e0561c', '#ffa040', '#fff0b0', '#ffc83a'];
const BRASS = [TONES.outline, TONES.brassLo, TONES.brass, TONES.brassHi, '#fff6d0', TONES.brassHi];

/** A cannon on its carriage, its muzzle to the right. */
const CANNON = [
  '............',
  '............',
  '.........aaa',
  '.aaaaaaaaada',
  'addddddddcda',
  'acccccccccca',
  '.abbbbbbbbba',
  '..aaaaaaaaba',
  '..affffffaaa',
  '.affffffffa.',
  '.aabaaaabaa.',
  '..aaa..aaa..',
];
/** A ball of shot, lit from the top left. */
const BALL = [
  '............',
  '............',
  '....aaaa....',
  '...adddca...',
  '..adedccca..',
  '..adccccba..',
  '..acccccba..',
  '..accccbba..',
  '...abbbba...',
  '....aaaa....',
  '............',
  '............',
];

/** Each picture's map and colours. */
const MAPS: Readonly<Record<ShipIcon, { readonly rows: readonly string[]; readonly colours: readonly string[] }>> = {
  port: { rows: CANNON.map((row) => [...row].reverse().join('')), colours: IRON },
  starboard: { rows: CANNON, colours: IRON },
  burst: {
    rows: [
      '...aaaaaaaa.',
      '...affffffa.',
      'aa..adddda..',
      'eea.acdddda.',
      'aa..acdddda.',
      'aaa.accdddea',
      'eeea.cdddeea',
      'aaa.accdddea',
      'aa..acccdda.',
      'eea.abccdda.',
      'aa..abbbba..',
      '....aaaaa...',
    ],
    colours: CANVAS,
  },
  brace: {
    rows: [
      '.aaaaaaaaaa.',
      '.affffffffa.',
      '.afddcccbfa.',
      '.afdccccbfa.',
      '.afdcbbcbfa.',
      '.afdbefbbfa.',
      '.afdbffbbfa.',
      '.afdcbbcbfa.',
      '..afdcccfa..',
      '...afccfa...',
      '....affa....',
      '.....aa.....',
    ],
    colours: SHIELD,
  },
  round: { rows: BALL, colours: IRON },
  grape: {
    rows: [
      '............',
      '...aa..aa...',
      '..adcaadca..',
      '..acbaacba..',
      '.aaaaaaaaaa.',
      'adcaadcaadca',
      'acbaacbaacba',
      '.aaaaaaaaaa.',
      '..adcaadca..',
      '..acbaacba..',
      '...aa..aa...',
      '............',
    ],
    colours: IRON,
  },
  chain: {
    rows: [
      '.aaa........',
      'adeca.......',
      'adcca.......',
      'acbba.......',
      '.aaada......',
      '....aba.....',
      '.....ada....',
      '......abaaa.',
      '.......adeca',
      '.......adcca',
      '.......acbba',
      '........aaa.',
    ],
    colours: IRON,
  },
  heated: {
    rows: [
      '............',
      '..f......f..',
      '....aaaa....',
      '...adddca...',
      '.fadedccca..',
      '..adccccbaf.',
      '..acccccba..',
      '..accccbba..',
      '...abbbba...',
      '....aaaa..f.',
      '.f..........',
      '............',
    ],
    colours: HOT,
  },
};

/** Each picture's map, for its look to be checked. */
export const SHIP_MAPS: Readonly<Record<ShipIcon, readonly string[]>> = Object.fromEntries(
  Object.entries(MAPS).map(([icon, map]) => [icon, map.rows]),
) as Record<ShipIcon, readonly string[]>;

/** Each picture as SVG, written once. */
const SVGS = Object.fromEntries(
  Object.entries(MAPS).map(([icon, map]) => [icon, paletteSvg(map.rows, map.colours)]),
) as Record<ShipIcon, string>;

/** The picture of `icon`, as SVG. */
export const shipIconSvg = (icon: ShipIcon): string => SVGS[icon];

/** The ring each stands in, the Tenets' ring in brass, as SVG. */
export const SHIP_RING = paletteSvg(TENET_RING, BRASS);
