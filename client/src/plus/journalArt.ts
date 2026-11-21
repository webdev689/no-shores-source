// The Journal's small pictures, drawn pixel for pixel in the kit's palette as the emblems are: DFO's timer
// hourglass and the quests' banners.
import { type Pixels, urlOf } from './emblems.ts';
import { TONES } from './tones.ts';

/** DFO's hourglass, its sand run through the neck. */
const HOURGLASS: Pixels = {
  rows: [
    'BBBBBBBBB',
    '.gHHHHHg.',
    '.g.HHH.g.',
    '..g.H.g..',
    '...gHg...',
    '....H....',
    '...gHg...',
    '..g...g..',
    '.g.....g.',
    '.g.HHH.g.',
    '.gHHHHHg.',
    'BBBBBBBBB',
  ],
  tones: { B: TONES.brass, g: TONES.glass, H: TONES.brassHi },
};

/** A story mission's swallowtail pennant: blood shaded at its right, a brass hem, and a brass star in its middle. */
const STORY: Pixels = {
  rows: [
    'hhhhhhhhhhhhhhhh',
    'hbbbbbbbbbbbbbbb',
    'hrrrrrrrrrrrrrdb',
    'hrrrrrrrrrrrrrdb',
    'hrrrrrrrrrrrrrdb',
    'hrrrrrrbbrrrrrdb',
    'hrrrrrrbbrrrrrdb',
    'hrrrrrbhhbrrrrdb',
    'hrrrrrbhhbrrrrdb',
    'hrrbbbhhhhbbbrdb',
    'hrrbbbhhhhbbbrdb',
    'hrrrrrbhhbrrrrdb',
    'hrrrrrbhhbrrrrdb',
    'hrrrrrrbbrrrrrdb',
    'hrrrrrrbbrrrrrdb',
    'hrrrrrrrrrrrrrdb',
    'hrrrrrrrrrrrrrdb',
    'hrrrrrrrrrrrrrdb',
    'hrrrrrrrrrrrrrdb',
    'hrrrrrr..rrrrrdb',
    'hrrrrr....rrrrdb',
    'hrrrr......rrrdb',
    'hrrr........rrdb',
    'hbb..........bbb',
  ],
  tones: { h: TONES.brassHi, b: TONES.brass, r: TONES.blood, d: TONES.bloodDark },
};

/** A side quest's hexagonal stone shield: a brass rim, stone shaded at its right, and a light stone diamond. */
const SIDE: Pixels = {
  rows: [
    '.......bb.......',
    '.....bbbbbb.....',
    '...bbbmmmmbbb...',
    '.bbbmmmmmmmkbbb.',
    'bmmmmmmmmmmkkkkb',
    'bmmmmmmmmmmkkkkb',
    'bmmmmmmmmmmkkkkb',
    'bmmmmmmmmmmkkkkb',
    'bmmmmmmDDmmkkkkb',
    'bmmmmmDDDDmkkkkb',
    'bmmmmDDDDDDkkkkb',
    'bmmmDDDDDDDDkkkb',
    'bmmmDDDDDDDDkkkb',
    'bmmmmDDDDDDkkkkb',
    'bmmmmmDDDDmkkkkb',
    'bmmmmmmDDmmkkkkb',
    'bmmmmmmmmmmkkkkb',
    'bmmmmmmmmmmkkkkb',
    'bmmmmmmmmmmkkkkb',
    'bmmmmmmmmmmkkkkb',
    '.bbbmmmmmmmkbbb.',
    '...bbbmmmmbbb...',
    '.....bbbbbb.....',
    '.......bb.......',
  ],
  tones: { b: TONES.brass, m: TONES.stoneMid, k: TONES.stoneDim, D: TONES.stoneHi },
};

/** DFO's timer hourglass, nine by twelve: brass caps, glass sides and the sand running through its neck. */
export const HOURGLASS_URL = urlOf(HOURGLASS);

const BANNERS: Readonly<Record<string, string>> = { story: urlOf(STORY), side: urlOf(SIDE) };

/** The banners drawn, by key: a story mission's and a side quest's. */
export const BANNER_KEYS: readonly string[] = Object.keys(BANNERS);

/** A banner by its key, sixteen by twenty-four; a key not drawn (a kind to come) wears the side quest's. */
export function bannerUrl(key: string): string {
  return BANNERS[key] ?? BANNERS.side ?? '';
}
