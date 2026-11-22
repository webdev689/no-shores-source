// The sea's two fight songs, written in takes of eight bars (form.ts). The sea fight: D minor at 144, a snare's march
// under the brass's swashbuckling tune and its second strain, an intro of stabs, and a break where the drums thin to
// the drive. The storm, for the gravest encounters: D Aeolian at 126, the low strings driving in eighths, stabs in open
// fifths, the horn's theme, a second harmony of high unrest, and a breath of drive and choir alone. Each take plays its
// section in a feel of its own (the drive's figure, the bass, the timpani, a voicing, a groove and its fills) and
// gives the tune to a different voice, answers it or turns its chords; a fight may open on the intro or the break.

import { type TakeSpec, makeForm } from './form.ts';
import {
  type ChordName,
  type Drum,
  HARMONY,
  TUNES,
  type Track,
  type Write,
  bandSpec,
  chords,
  floored,
  inOctave,
  rootOf,
  stack,
  voicing,
} from './seaBand.ts';
import { type Song, type Tune, lay, tune } from './score.ts';

/** A take: its section, its feel, which of its section's leads, and whether its harmony is turned. */
interface Line {
  readonly section: string;
  readonly feel: number;
  readonly lead: number;
  readonly turn?: boolean;
}
interface Section {
  readonly harmony: readonly ChordName[];
  readonly turn?: readonly ChordName[];
  readonly next: readonly string[];
  readonly opens?: boolean;
}
/** The drive's figure: [beat, the root, its fifth or its octave, velocity]. */
type Figure = readonly (readonly [number, 'root' | 'fifth' | 'octave', number])[];
const eighths = (which: (i: number) => 'root' | 'fifth' | 'octave', loud: (i: number) => number): Figure =>
  Array.from({ length: 8 }, (unused, i) => [i * 0.5, which(i), loud(i)] as const);
const toneOf = (which: 'root' | 'fifth' | 'octave', root: number, fifth: number) =>
  which === 'fifth' ? fifth : which === 'octave' ? root + 12 : root;

/** The takes as a song: each line's bars written by `write` over its section's harmony, or the turned one. */
function form(
  name: 'storm' | 'fight',
  sections: Readonly<Record<string, Section>>,
  lines: readonly Line[],
  write: (w: Write, harmony: readonly ChordName[], line: Line) => void,
): Song {
  return makeForm(
    bandSpec(name),
    lines.map((line): TakeSpec<Track, Drum> => {
      const { harmony, turn, next, opens } = sections[line.section] ?? { harmony: [], next: [] };
      const bars = line.turn && turn ? turn : harmony;
      return { section: line.section, bars: bars.length, next, opens, write: (w) => write(w, bars, line) };
    }),
  );
}

const FIGHT: Readonly<Record<string, Section>> = {
  intro: { harmony: HARMONY.fightA, next: ['a', 'b'], opens: true },
  a: { harmony: HARMONY.fightA, turn: chords('Dm Gm Bb A F Am Bb A'), next: ['a', 'b', 'break'] },
  b: { harmony: HARMONY.fightB, next: ['a', 'break'] },
  break: { harmony: chords('Dm Dm Bb Bb Gm Gm A A'), next: ['a', 'b', 'intro'], opens: true },
};
/** The break's line, the tune's head slowed over the drive. */
const BREAK_LINE = tune('D4:4 | A4:4 | Bb4:3 A4:1 | G4:4 | Bb4:2 A4:2 | G4:4 | E4:2 C#4:2 | A3:4');
/** The sea fight's feels: the drive, the timpani ([beat, root or low fifth, beats, velocity]), the bass ([beat,
 *  beats, velocity]), the strings' lowest note, and the groove ([drum, beat, velocity]). */
const FIGHT_FEELS = [
  {
    drive: eighths(
      (i) => (i % 2 ? 'fifth' : 'root'),
      (i) => (i === 0 ? 96 : i % 2 === 0 ? 84 : 70),
    ),
    timpani: [
      [0, 'root', 0.9, 100],
      [3, 'fifth', 0.4, 84],
    ],
    bass: [0, 1, 2, 3].map((beat) => [beat, 0.8, beat ? 86 : 98] as const),
    strings: 62,
    groove: [
      ['kick', 0, 98],
      ['kick', 2, 90],
      ['snare', 1, 92],
      ['snare', 2.75, 54],
      ['snare', 3, 96],
    ],
  },
  {
    drive: [
      [0, 'root', 96],
      [0.5, 'root', 70],
      [0.75, 'root', 62],
      [1, 'fifth', 80],
      [1.5, 'root', 84],
      [2, 'root', 86],
      [2.5, 'root', 70],
      [2.75, 'root', 62],
      [3, 'fifth', 80],
      [3.5, 'octave', 74],
    ],
    timpani: [
      [0, 'root', 0.9, 100],
      [2, 'root', 0.9, 88],
      [3.5, 'fifth', 0.4, 80],
    ],
    bass: [
      [0, 1.4, 98],
      [1.5, 0.4, 80],
      [2, 1.4, 90],
      [3.5, 0.4, 82],
    ],
    strings: 57,
    groove: [
      ['kick', 0, 98],
      ['kick', 1.5, 84],
      ['kick', 2.5, 88],
      ['snare', 1, 94],
      ['snare', 3, 96],
      ['snare', 3.5, 50],
    ],
  },
  {
    drive: eighths(
      (i) => (i % 4 === 1 ? 'octave' : i === 4 || i === 7 ? 'fifth' : 'root'),
      (i) => (i === 0 ? 96 : i % 2 ? 72 : 84),
    ),
    timpani: [
      [0, 'root', 0.9, 100],
      [1.5, 'root', 0.4, 82],
      [2.5, 'fifth', 0.4, 86],
    ],
    bass: [
      [0, 1.8, 98],
      [2, 0.8, 88],
      [3, 0.4, 80],
      [3.5, 0.4, 84],
    ],
    strings: 66,
    groove: [
      ['bodhran', 0, 100],
      ['kick', 0, 96],
      ['bodhran', 2, 92],
      ['snare', 0.75, 48],
      ['snare', 1, 92],
      ['snare', 2.75, 52],
      ['snare', 3, 96],
    ],
  },
] as const;
/** The fills closing each fourth bar: down the tom, the snare rolling up, the tom and the kick trading. */
const FIGHT_FILLS: readonly (readonly (readonly [Drum, number, number])[])[] = [
  Array.from({ length: 4 }, (unused, i) => ['tom', 3 + i * 0.25, 72 + i * 8] as const),
  Array.from({ length: 8 }, (unused, i) => ['snare', 2 + i * 0.25, 50 + i * 7] as const),
  [
    ['tom', 3, 88],
    ['kick', 3.25, 84],
    ['tom', 3.5, 94],
    ['snare', 3.75, 90],
  ],
];

/** A take of the sea fight: the drive, the bass, the timpani and the march in the feel's figures, the strings and the
 *  choir, the brass's stabs; the tune on the brass, the fiddle and the strings, or the horn under the brass; the
 *  intro's stabs or pickup; the break's line over thinned drums. */
function fightTake(w: Write, harmony: readonly ChordName[], { section, feel, lead, turn }: Line): void {
  const { drive, timpani, bass, strings, groove } = FIGHT_FEELS[feel] ?? FIGHT_FEELS[0];
  const broken = section === 'break';
  // The intro's drive grows into the fight, bar by bar.
  const rising = (bar: number) => (section === 'intro' ? 0.82 + bar * 0.025 : 1);
  harmony.forEach((name, bar) => {
    const [root = 0, third = 0, fifth = 0] = stack(name, 3);
    for (const [beat, which, velocity] of drive)
      w.note(
        'drive',
        bar,
        beat,
        0.42,
        toneOf(which, root, fifth) - 12,
        (velocity - (broken ? 10 : turn ? 8 : 0)) * rising(bar),
      );
    for (const [beat, beats, velocity] of bass) w.note('bass', bar, beat, beats, floored(root - 24), velocity);
    for (const [beat, which, beats, velocity] of timpani)
      w.note('timpani', bar, beat, beats, which === 'root' ? root - 12 : fifth - 24, velocity);
    if (broken) {
      w.hit('kick', bar, 0, 84);
      if (bar === 7) for (let i = 0; i < 16; i++) w.hit('snare', bar, i * 0.25, 40 + i * 4);
    } else {
      for (const [drum, beat, velocity] of groove) w.hit(drum, bar, beat, velocity);
      if (bar % 4 === 3)
        for (const [drum, beat, velocity] of FIGHT_FILLS[(feel + (bar >> 2)) % 3] ?? [])
          w.hit(drum, bar, beat, velocity);
      if (bar === 0) w.hit('crash', bar, 0, 96);
    }
    const stabs = section === 'intro' ? lead < 2 : lead === 2 || (section === 'b' && lead === 1);
    if (stabs)
      for (const beat of lead === 1 && section === 'intro' ? [0, 0.75, 1.5] : [0, 1.5])
        for (const n of [root, third, fifth]) w.note('brass', bar, beat, beat ? 0.4 : 0.45, n, beat ? 82 : 92);
    if (section !== 'intro' || lead > 0)
      for (const n of voicing(name, strings)) w.note('strings', bar, 0, 3.9, n, broken ? 46 : 52);
    if (lead > 0 || section === 'break') for (const n of voicing(name, 57)) w.note('choir', bar, 0, 3.9, n, 60);
  });
  const theme: Tune = section === 'b' ? TUNES.fightB : TUNES.fightA;
  if (section === 'intro') {
    if (lead === 2) lay(w, 'fiddle', 6, TUNES.fightA, 90, { to: 2 });
  } else if (section === 'break') lay(w, lead ? 'brass' : 'fiddle', 0, BREAK_LINE, lead ? 84 : 90, { legato: 0.97 });
  else if (turn) {
    lay(w, 'brass', 0, theme, 102, { to: 4 });
    lay(w, 'fiddle', 4, theme, 98, { from: 4 });
    lay(w, 'strings', 4, theme, 78, { from: 4, legato: 0.96 });
  } else if ((section === 'a' && lead === 1) || (section === 'b' && lead === 2)) {
    lay(w, 'fiddle', 0, theme, 98);
    lay(w, 'strings', 0, theme, 80, { legato: 0.96 });
  } else {
    lay(w, 'brass', 0, theme, 100 + lead * 3);
    if (lead > 0) lay(w, 'horn', 0, theme, 92, { octave: -1 });
  }
}

const FIGHT_TAKES: readonly Line[] = [
  { section: 'intro', feel: 0, lead: 0 },
  { section: 'intro', feel: 1, lead: 1 },
  { section: 'intro', feel: 2, lead: 2 },
  { section: 'a', feel: 1, lead: 0 },
  { section: 'a', feel: 2, lead: 1 },
  { section: 'a', feel: 0, lead: 2 },
  { section: 'a', feel: 1, lead: 3, turn: true },
  { section: 'b', feel: 0, lead: 0 },
  { section: 'b', feel: 1, lead: 1 },
  { section: 'b', feel: 2, lead: 2 },
  { section: 'break', feel: 2, lead: 0 },
  { section: 'break', feel: 0, lead: 1 },
];

/** A sea fight: the drums and the drive, the brass's theme and its second strain, in takes. */
export const seaFight = (): Song => form('fight', FIGHT, FIGHT_TAKES, fightTake);

const STORM: Readonly<Record<string, Section>> = {
  drive: { harmony: HARMONY.storm, next: ['theme', 'unrest'], opens: true },
  theme: { harmony: HARMONY.storm, turn: chords('Dm Gm Am Dm Dm Bb F A'), next: ['theme', 'unrest', 'breath'] },
  unrest: { harmony: HARMONY.stormB, next: ['theme', 'breath'] },
  breath: { harmony: HARMONY.stormB, next: ['theme', 'drive', 'unrest'], opens: true },
};
/** A line for the horn over the unrest's harmony. */
const UNREST_LINE = tune('A4:2 G4:2 | G4:2 E4:2 | F4:2 D4:2 | D4:4 | D4:2 Bb3:2 | A3:2 D4:2 | E4:2 C#4:2 | A3:4');
/** The storm's feels: the drive, the bass ([beat, beats]), the timpani's beats, the choir's lowest note, the kick. */
const STORM_FEELS = [
  {
    drive: eighths(
      (i) => (i === 6 ? 'fifth' : 'root'),
      (i) => (i % 2 === 0 ? 88 : 72) + (i === 0 ? 10 : 0),
    ),
    bass: [0, 1, 2, 3].map((beat) => [beat, 0.45] as const),
    timpani: [0, 2],
    choir: 57,
    kicks: [0, 2],
  },
  {
    drive: eighths(
      (i) => (i === 7 ? 'octave' : i === 3 || i === 6 ? 'fifth' : 'root'),
      (i) => (i % 2 === 0 ? 88 : 72) + (i === 0 ? 10 : 0),
    ),
    bass: [
      [0, 1.8],
      [2, 1.8],
    ],
    timpani: [0, 1.5, 3],
    choir: 52,
    kicks: [0, 1.5, 2.5],
  },
  {
    drive: eighths(
      (i) => (i === 5 || i === 7 ? 'fifth' : 'root'),
      (i) => ([0, 3, 6].includes(i) ? 92 : 68) + (i === 0 ? 6 : 0),
    ),
    bass: [
      [0, 1.4],
      [1.5, 1.4],
      [3, 0.9],
    ],
    timpani: [0, 2.5],
    choir: 62,
    kicks: [0, 2, 3.5],
  },
] as const;

/** A take of the storm: the drive, the bass and the choir in the feel's figures, the timpani and the kick, the brass's
 *  stabs in open fifths, the unrest's high sixteenths; the theme on the horn, the strings, or the horn and the brass,
 *  answered on the turned chords; a line over the unrest; the breath, quiet, a fragment of the theme. */
function stormTake(w: Write, harmony: readonly ChordName[], { section, feel, lead, turn }: Line): void {
  const { drive, bass, timpani, choir, kicks } = STORM_FEELS[feel] ?? STORM_FEELS[0];
  const breath = section === 'breath';
  const unrest = section === 'unrest' || (section === 'theme' && lead === 2);
  // The drive's take grows into the storm bar by bar, the choir coming in on its third.
  const opening = section === 'drive';
  harmony.forEach((name, bar) => {
    const [root = 0, , fifth = 0] = stack(name, 2);
    const rising = opening ? 0.8 + bar * 0.03 : 1;
    for (const [beat, which, velocity] of drive)
      w.note('drive', bar, beat, 0.42, toneOf(which, root, fifth), (velocity - (breath ? 18 : turn ? 8 : 0)) * rising);
    for (const [beat, beats] of bass) w.note('bass', bar, beat, beats, floored(root - 12), breath ? 66 : 90);
    if (!opening || bar >= 2) for (const n of voicing(name, choir)) w.note('choir', bar, 0, 3.9, n, breath ? 70 : 62);
    if (breath) return;
    for (const beat of timpani) w.note('timpani', bar, beat, 0.9, inOctave(rootOf(name), 2), beat ? 92 : 104);
    if (bar % 4 === 3) for (let i = 0; i < 8; i++) w.note('timpani', bar, 2 + i * 0.25, 0.24, 'A2', 60 + i * 6);
    for (const beat of kicks) w.hit('kick', bar, beat, beat ? 82 : 90);
    if (bar === 0) w.hit('crash', bar, 0, 92);
    if (section !== 'drive' || lead === 1)
      for (const n of [root + 12, fifth + 12, root + 24]) {
        w.note('brass', bar, 0, 0.5, n, 96);
        w.note('brass', bar, 1.5, 0.4, n, 84);
      }
    if (unrest)
      for (let i = 0; i < 16; i++)
        for (const n of voicing(name, 69).slice(0, 2))
          w.note('drive', bar, i * 0.25, 0.22, n, 46 + (i % 4 === 0 ? 10 : 0));
    if (section === 'drive' && lead === 2) for (const n of voicing(name, 62)) w.note('strings', bar, 0, 3.9, n, 64);
  });
  if (section === 'breath') {
    if (lead) lay(w, 'horn', 4, TUNES.storm, 80, { to: 2 });
  } else if (section === 'unrest') {
    if (lead) lay(w, lead === 1 ? 'horn' : 'strings', 0, UNREST_LINE, 90, { octave: lead - 1, legato: 0.96 });
  } else if (section === 'theme' && turn) {
    lay(w, 'horn', 0, TUNES.storm, 96, { to: 4 });
    lay(w, 'strings', 4, TUNES.storm, 86, { from: 4, legato: 0.96 });
  } else if (section === 'theme') {
    lay(w, lead === 1 ? 'strings' : 'horn', 0, TUNES.storm, lead === 1 ? 84 : 96 + lead, {
      legato: lead === 1 ? 0.96 : 0.92,
    });
    if (lead === 2) lay(w, 'brass', 0, TUNES.storm, 92);
  }
}

const STORM_TAKES: readonly Line[] = [
  { section: 'drive', feel: 0, lead: 0 },
  { section: 'drive', feel: 1, lead: 1 },
  { section: 'drive', feel: 2, lead: 2 },
  { section: 'theme', feel: 1, lead: 0 },
  { section: 'theme', feel: 2, lead: 1 },
  { section: 'theme', feel: 0, lead: 2 },
  { section: 'theme', feel: 2, lead: 3, turn: true },
  { section: 'unrest', feel: 0, lead: 0 },
  { section: 'unrest', feel: 1, lead: 1 },
  { section: 'unrest', feel: 2, lead: 2 },
  { section: 'breath', feel: 1, lead: 0 },
  { section: 'breath', feel: 2, lead: 1 },
];

/** The storm: the drive and the choir, the horn's theme, the unrest and the breath, in takes. */
export const seaStorm = (): Song => form('storm', STORM, STORM_TAKES, stormTake);
