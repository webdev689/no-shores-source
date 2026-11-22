// The Journal's small pictures, drawn pixel for pixel as the emblems are: DFO's timer hourglass, in the kit's brass,
// and the quests' banners, each a shape in brass bearing a charge on a field of its own.
import { type Pixels, svgOf } from './emblems.ts';
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

/** DFO's timer hourglass, nine by twelve: brass caps, glass sides and the sand running through its neck. */
export const HOURGLASS_SVG = svgOf(HOURGLASS);

/** A story mission's swallowtail pennant, sixteen by twenty-four: a brass hem, blood shaded at its right. */
const PENNANT: readonly string[] = [
  'hhhhhhhhhhhhhhhh',
  'hbbbbbbbbbbbbbbb',
  ...Array<string>(17).fill('hrrrrrrrrrrrrrdb'),
  'hrrrrrr..rrrrrdb',
  'hrrrrr....rrrrdb',
  'hrrrr......rrrdb',
  'hrrr........rrdb',
  'hbb..........bbb',
];

/** A side quest's hexagonal shield, sixteen by twenty-four: a brass rim, its field shaded at its right. */
const SHIELD: readonly string[] = [
  '.......bb.......',
  '.....bbbbbb.....',
  '...bbbmmmmbbb...',
  '.bbbmmmmmmmkbbb.',
  ...Array<string>(16).fill('bmmmmmmmmmmkkkkb'),
  '.bbbmmmmmmmkbbb.',
  '...bbbmmmmbbb...',
  '.....bbbbbb.....',
  '.......bb.......',
];

/** The charges a banner bears, ten by twelve, lit from the top left; each is outlined in its field's dark. */
const CHARGES = {
  /** A four-pointed star. */
  star: [
    '....Gg....',
    '....Gg....',
    '...GGgi...',
    '..GGFggi..',
    'GGGFFgggii',
    'gggggggiii',
    '..ggggii..',
    '...ggii...',
    '....gi....',
    '....gi....',
    '..........',
    '..........',
  ],
  /** A crown set with two stones. */
  crown: [
    '..........',
    '.G..GG..G.',
    '.Gg.Gi.Gi.',
    '.GgGggGgi.',
    '.Gggggggi.',
    '.GgRggRgi.',
    '.Gggggggi.',
    '.GGGGGGGi.',
    '.iiiiiiii.',
    '..........',
    '..........',
    '..........',
  ],
  /** A watchtower. */
  tower: [
    '.G.G..G.G.',
    '.GGGGGGGi.',
    '..Gggggi..',
    '..Ggxxgi..',
    '..Ggxxgi..',
    '..Gggggi..',
    '..Gggggi..',
    '..Ggxxgi..',
    '..GgxxGi..',
    '.GGgxxggi.',
    '.iiiiiiii.',
    '..........',
  ],
  /** An anchor. */
  anchor: [
    '....GG....',
    '...G..i...',
    '....Gi....',
    '.GGGGgiii.',
    '....Gi....',
    '....Gi....',
    '....Gi....',
    'G...Gi...i',
    'Gg..Gi..gi',
    '.Gg.Gi.gi.',
    '..GGggii..',
    '....ii....',
  ],
  /** An open eye. */
  eye: [
    '..........',
    '..........',
    '...GGGG...',
    '.GGgiiigG.',
    'Gg.FxxF.gi',
    'G.FxRRxF.i',
    'Gg.FxxF.gi',
    '.Ggg...gi.',
    '...iiii...',
    '..........',
    '..........',
    '..........',
  ],
  /** A ship under sail. */
  ship: [
    '....G.....',
    '....GG....',
    '...GGgG...',
    '..GGGgGG..',
    '.GGGGgGGG.',
    '....Gg....',
    'GGGGGGGGGi',
    '.Gggggggi.',
    '..iiiiii..',
    '..........',
    '..........',
    '..........',
  ],
  /** A stone lozenge. */
  diamond: [
    '....DD....',
    '...DDDd...',
    '..DDDDdd..',
    '.DDDDDddd.',
    'DDDDDddddd',
    'DDDDdddddd',
    '.DDDddddd.',
    '..DDdddd..',
    '...Dddd...',
    '....dd....',
    '..........',
    '..........',
  ],
  /** A key. */
  key: [
    '...GGGG...',
    '..Gg..gi..',
    '..Gg..gi..',
    '...Gggi...',
    '....Gi....',
    '....Gi....',
    '....GgGi..',
    '....Gi....',
    '....GgGgi.',
    '....Gi.i..',
    '....ii....',
    '..........',
  ],
  /** A fish. */
  fish: [
    '..........',
    '..........',
    '.N..BBBB..',
    'BB.BBBBBB.',
    '.BBBBxBBBB',
    '.BBBBBBBBn',
    'BB.nnBBBn.',
    '.N...nnn..',
    '..........',
    '..........',
    '..........',
    '..........',
  ],
  /** A sheaf of wheat. */
  sheaf: [
    'G...G...G.',
    'Gg.GgG.Gi.',
    '.GgGgGgi..',
    '..GgGgi...',
    '...Ggi....',
    '..iiiiii..',
    '...Ggi....',
    '..GgGgi...',
    '.Gg.G.gi..',
    'Gg..G..gi.',
    '..........',
    '..........',
  ],
  /** A hammer. */
  hammer: [
    '.SSSSSSs..',
    '.SsssssSt.',
    '.ttsssttt.',
    '....Ww....',
    '....Ww....',
    '....Ww....',
    '....Ww....',
    '....Ww....',
    '....Ww....',
    '....ww....',
    '..........',
    '..........',
  ],
  /** A compass rose. */
  rose: [
    '....G.....',
    '....Gi....',
    '.G..Gi..G.',
    '..GgGgigi.',
    '...GGgi...',
    'GGGGgFgiii',
    '...Ggii...',
    '..Gigigi..',
    '.i..Gi..i.',
    '....Gi....',
    '....i.....',
    '..........',
  ],
} as const satisfies Readonly<Record<string, readonly string[]>>;

/** The charges' own tones: brass, steel, wood, bone, sea, and a stone's red. */
const CHARGE_TONES: Readonly<Record<string, string>> = {
  G: TONES.brassHi,
  g: TONES.brass,
  i: TONES.brassLo,
  F: '#fff1c4',
  x: '#1a1712',
  R: '#e0675a',
  S: '#eef1f3',
  s: '#a9b2ba',
  t: '#5f6873',
  W: '#c98d55',
  w: '#8a5a30',
  D: '#e6dcc0',
  d: '#c2b79a',
  B: '#a9d3e0',
  n: '#26465a',
  N: '#e2f4f8',
};

/** A pennant's blood, and the fields a shield is painted in: each its tone, its shade at the right, and the dark its
 *  charge is outlined in. */
const BLOOD = { r: TONES.blood, d: TONES.bloodDark, q: '#3e0d0a' };
const FIELDS = {
  stone: { m: '#7a7260', k: '#4a4538', q: '#2c2922' },
  sea: { m: '#3d6a80', k: '#26465a', q: '#142630' },
  moss: { m: '#5f7a3a', k: '#3c5124', q: '#1f2b12' },
  ochre: { m: '#a8742e', k: '#6e4a1c', q: '#3a260c' },
  plum: { m: '#6e3f5e', k: '#45263b', q: '#25131f' },
  slate: { m: '#4d5866', k: '#323a45', q: '#1a1f26' },
};

/** Every banner by its key: its charge and its field, a pennant on blood, a shield on its own. */
const BANNER_LIST: readonly (readonly [string, keyof typeof CHARGES, Readonly<Record<string, string>>])[] = [
  ['story', 'star', BLOOD],
  ['story-crown', 'crown', BLOOD],
  ['story-tower', 'tower', BLOOD],
  ['story-anchor', 'anchor', BLOOD],
  ['story-eye', 'eye', BLOOD],
  ['story-ship', 'ship', BLOOD],
  ['side', 'diamond', FIELDS.stone],
  ['side-key', 'key', FIELDS.plum],
  ['side-fish', 'fish', FIELDS.sea],
  ['side-sheaf', 'sheaf', FIELDS.moss],
  ['side-hammer', 'hammer', FIELDS.ochre],
  ['side-rose', 'rose', FIELDS.slate],
];

/** `charge` laid on `shape`, centred on its field by its own height (`middle`, the row it centres on), with an outline
 *  of 'q' where it meets its field. */
function charged(shape: readonly string[], charge: readonly string[], middle: number): string[] {
  const used = charge.flatMap((row, place) => (row.replaceAll('.', '') ? [place] : []));
  const top = Math.round(middle - ((used[0] ?? 0) + (used.at(-1) ?? 0)) / 2);
  const filled = (row: number, column: number) => (charge[row]?.[column] ?? '.') !== '.';
  return shape.map((line, row) =>
    [...line]
      .map((letter, column) => {
        const [inRow, inColumn] = [row - top, column - 3];
        if (inRow < 0 || inRow >= charge.length || inColumn < 0 || inColumn >= 10) return letter;
        if (filled(inRow, inColumn)) return charge[inRow]?.[inColumn] ?? letter;
        const touches = [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ].some(([down = 0, across = 0]) => filled(inRow + down, inColumn + across));
        return touches ? 'q' : letter;
      })
      .join(''),
  );
}

const BRASS_EDGE = { h: TONES.brassHi, b: TONES.brass };
const BANNERS: ReadonlyMap<string, string> = new Map(
  BANNER_LIST.map(([key, charge, field]) => {
    const pennant = key.startsWith('story');
    const rows = charged(pennant ? PENNANT : SHIELD, CHARGES[charge], pennant ? 10.5 : 11.5);
    return [key, svgOf({ rows, tones: { ...BRASS_EDGE, ...CHARGE_TONES, ...field } })];
  }),
);

/** The banners drawn, by key: a story mission's pennants and a side quest's shields. */
export const BANNER_KEYS: readonly string[] = [...BANNERS.keys()];

/** A banner by its key, sixteen by twenty-four; a key not drawn (a kind to come) wears the side quest's. */
export function bannerSvg(key: string): string {
  return BANNERS.get(key) ?? BANNERS.get('side') ?? '';
}

/** The banner a quest wears when it names none: one of its kind's (a side quest's for a kind to come), chosen by its
 *  id so each quest keeps its own and quests side by side differ. */
export function bannerFor(kind: string, id: string): string {
  const family = BANNER_KEYS.filter((key) => key.split('-')[0] === (kind === 'story' ? 'story' : 'side'));
  const sum = [...id].reduce((total, letter) => total + (letter.codePointAt(0) ?? 0), 0);
  return family[sum % family.length] ?? 'side';
}
