// Dry: the fight in the desert, on the savanna and across the steppe. A Phrygian with its major third (A, B flat, C
// sharp, D, E, F, G) in 7/8, two, two and three, at a quarter of 150: a caravan riding hard. A double reed's tune over
// an oud's ostinato and a darbuka's doum and tek, the strings' counter-line slow under it; the danger near is the cellos
// rubbing A against B flat over a frame drum and a hiss of sand; the peak lays the brass under the tune, the choir in
// open fifths and stabs. It is written in takes of eight bars (form.ts): vamps, the tune's halves, the steppe's
// gallop's halves, a break of calls and a breakdown, each in a feel of its own (a groove, fills, the oud's figure, a
// bass, a voicing, the rub, the heart and the sand), the tune answered or turned to new chords in some. The cadence
// falls D, C, B flat, A; the victory rises F, G, A into A major; the defeat leaves the reed alone over the cellos.

import { chordAt, type Held, keys, roll, runsOf } from './craft.ts';
import {
  BEATS,
  BPM,
  CHORDS,
  type Chord,
  type Drum,
  GROUPS,
  LEVEL,
  ONCE,
  SONG,
  type Track,
  type Write,
  harmony,
  stingBed,
  tune,
} from './dryParts.ts';
import { type TakeSpec, makeForm } from './form.ts';
import { type Song, lay, makeSong, midiNote } from './score.ts';

type Section = 'vamp' | 'a1' | 'a2' | 'b1' | 'b2' | 'break' | 'down';
/** Each section's harmony, and a second under the same tune where a take turns it; the sections that may follow it,
 *  and whether a fight may open on it: on the vamp, or straight on the reed's calls. */
const SECTIONS: Readonly<
  Record<Section, { harmony: string; turn?: string; next: readonly Section[]; opens?: boolean }>
> = {
  vamp: { harmony: 'A | A | Bb | A | A | A | Gm | A', next: ['a1', 'b1'], opens: true },
  a1: {
    harmony: 'A/Gm | A | Bb | A | Gm | Dm | Bb/A | A',
    turn: 'A/Gm | Dm/A | Gm | A | Gm/C | F/Dm | Gm/A | A',
    next: ['a2'],
  },
  a2: {
    harmony: 'Dm/C | C | Bb | A | Dm/Bb | Gm | Bb/A | A',
    turn: 'F/Gm | C | Dm | A | Bb/Gm | Dm | Dm/A | A',
    next: ['b1', 'break', 'down', 'a1'],
  },
  b1: { harmony: 'F | Gm | A | A | Dm | Bb | Gm/A | A', next: ['b2'] },
  b2: { harmony: 'F | Gm | A | A | Dm | Bb | Bb/A | A', next: ['a1', 'break', 'down'] },
  break: { harmony: 'A/Gm | A | Bb | A | A/Gm | A | Bb | A', next: ['a1', 'b1', 'vamp'], opens: true },
  down: { harmony: 'A | A | Bb | Bb | Gm | Gm | Bb | A', next: ['a1', 'b1', 'break', 'vamp'] },
};

/** The tune: up the mode from A to D, a turn about E, the B flat leaning on A, and at its height the B flat over A. */
const THEME = tune(
  'A4:1 Bb4:.5 C#5:.5 D5:1.5 | E5:1 F5:.5 E5:.5 D5:.5 C#5:.5 D5:.5 | Bb4:1 D5:1 F5:1.5 | E5:.5 F5:.5 E5:.5 D5:.5 C#5:1.5' +
    ' | G4:1 Bb4:.5 A4:.5 G4:1.5 | F4:1 E4:.5 F4:.5 D4:1.5 | Bb4:1 A4:1 G4:.5 F4:.5 E4:.5 | A4:1.5 E4:.5 A4:1.5' +
    ' | D5:1 F5:.5 A5:.5 G5:1.5 | E5:1 G5:.5 F5:.5 E5:1.5 | D5:1 F5:.5 E5:.5 D5:1.5 | C#5:1 D5:.5 C#5:.5 Bb4:.5 A4:1' +
    ' | D5:1 F5:.5 A5:.5 Bb5:1.5 | A5:1 G5:.5 F5:.5 G5:1.5 | F5:1 E5:1 D5:.5 C#5:.5 Bb4:.5 | A4:2 E4:.5 A4:1',
);
/** The strings under it, moving where the reed holds. */
const COUNTER = tune(
  'E4:2 F4:.5 E4:1 | C#4:3.5 | D4:2 F4:1.5 | E4:2 C#4:.5 D4:.5 E4:.5' +
    ' | D4:2 Bb3:1.5 | A3:2 F3:.5 G3:.5 A3:.5 | D4:2 C#4:1.5 | C#4:2 D4:.5 E4:1' +
    ' | F4:2 G4:1.5 | G4:2 E4:1.5 | F4:2 Bb4:.5 A4:.5 G4:.5 | E4:3.5' +
    ' | F4:2 D4:1.5 | D4:2 Bb3:.5 C4:.5 D4:.5 | D4:2 E4:1.5 | C#4:2 E4:.5 D4:.5 C#4:.5',
);
/** The steppe's gallop: repeated notes leaping a fourth, F rising to G and to A. */
const GALLOP = tune(
  'C5:.5 C5:.5 F5:.5 E5:.5 F5:.5 A5:1 | D5:.5 D5:.5 G5:.5 F5:.5 G5:.5 Bb5:1 | C#5:1 E5:1 A5:1.5' +
    ' | G5:.5 F5:.5 E5:.5 F5:.5 E5:.5 D5:.5 C#5:.5 | D5:1 A4:1 D5:1.5 | F5:1 D5:1 Bb4:1.5' +
    ' | G4:.5 A4:.5 Bb4:.5 D5:.5 C#5:.5 E5:1 | A5:1.5 G5:.5 F5:.5 E5:1' +
    ' | C5:.5 C5:.5 F5:.5 E5:.5 F5:.5 A5:1 | D5:.5 D5:.5 G5:.5 F5:.5 G5:.5 Bb5:1 | C#5:1 E5:1 A5:1.5' +
    ' | G5:.5 F5:.5 E5:.5 F5:.5 E5:.5 D5:.5 C#5:.5 | D5:1 F5:1 A5:1.5 | Bb5:1 A5:.5 G5:.5 F5:1.5' +
    ' | F5:1 E5:1 D5:.5 C#5:.5 Bb4:.5 | A4:2 E4:.5 A4:1',
);
const GALLOP_UNDER = tune(
  'F4:2 A4:1.5 | D4:2 Bb3:1.5 | E4:2 C#4:1.5 | E4:3.5 | F4:2 D4:1.5 | D4:2 F4:1.5 | D4:2 C#4:1.5 | E4:2 F4:.5 E4:1' +
    ' | F4:2 A4:1.5 | D4:2 Bb3:1.5 | E4:2 C#4:1.5 | E4:3.5 | A4:2 F4:1.5 | F4:2 D4:1.5 | D4:2 C#4:1.5 | E4:3.5',
);
/** The break's calls on the reed, the drums answering; and the reed's answers when the strings call. */
const CALLS = tune(
  'A4:1 Bb4:.5 C#5:.5 D5:1.5 | r:3.5 | E5:1 F5:.5 E5:.5 D5:.5 C#5:.5 D5:.5 | r:3.5' +
    ' | A4:1 Bb4:.5 C#5:.5 D5:1.5 | r:3.5 | F5:1 E5:1 D5:.5 C#5:.5 Bb4:.5 | A4:3.5',
);
const ANSWERS = tune(
  'r:3.5 | E5:1 F5:.5 E5:.5 D5:.5 C#5:.5 D5:.5 | r:3.5 | Bb4:1 A4:1 G4:.5 F4:.5 E4:.5' +
    ' | r:3.5 | D5:1 C#5:1 Bb4:1.5 | r:3.5 | r:3.5',
);
/** A vamp's line, the strings readying the tune; and the breakdown's call, slowed, alone over the oud. */
const VAMP_LINE = tune('E4:3.5 | F4:2 E4:1.5 | D4:3.5 | C#4:3.5');
const DOWN_LINE = tune('A4:2 Bb4:1.5 | C#5:2 D5:1.5 | r:3.5 | r:3.5 | A4:2 Bb4:1.5 | A4:3.5 | r:3.5 | r:3.5');

/** A feel: the cellos' rub (beat, B flat or A, length), the heart and the sand under it, the oud's figure (beat, which
 *  of the chord's seven, velocity), the bass's figure and the pad's voicing. The drums' groove is the feel's too. */
interface Feel {
  readonly rub: readonly (readonly [number, number, number])[];
  readonly heart: readonly (readonly [number, number])[];
  readonly sand: readonly (readonly [number, number])[];
  readonly oud: readonly (readonly [number, number, number])[];
  readonly bass: 'held' | 'struck' | 'doum';
  readonly voicing: 0 | 1 | 2;
}
const FEELS: readonly Feel[] = [
  {
    rub: Array.from({ length: 14 }, (unused, i) => [i * 0.25, i % 2, 0.22] as const),
    heart: [
      [0, 96],
      [2, 80],
    ],
    sand: Array.from({ length: 7 }, (unused, i) => [i * 0.5, i % 2 ? 40 : 56] as const),
    oud: [100, 60, 86, 62, 92, 64, 72].map((velocity, i) => [i * 0.5, i, velocity] as const),
    bass: 'held',
    voicing: 0,
  },
  {
    rub: [0, 1, 0, 1, 0, 0, 1].map((flat, i) => [i * 0.5, flat, 0.45] as const),
    heart: [
      [0, 96],
      [1, 70],
      [2, 84],
    ],
    sand: [0, 1, 2, 2.25, 2.5, 2.75, 3, 3.25].map((beat) => [beat, beat % 1 ? 38 : 52] as const),
    oud: [
      [0, 0, 100],
      [0.5, 1, 64],
      [1, 2, 84],
      [1.5, 1, 60],
      [2, 4, 92],
      [2.5, 6, 70],
      [3, 5, 74],
    ],
    bass: 'struck',
    voicing: 1,
  },
  {
    rub: [0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1].map((flat, i) => [i * 0.25, flat, 0.22] as const),
    heart: [
      [0, 94],
      [2, 78],
      [3, 62],
    ],
    sand: [0.5, 1.5, 2.5, 3].map((beat) => [beat, 46] as const),
    oud: [
      [0, 0, 100],
      [0.5, 1, 60],
      [0.75, 1, 50],
      [1, 2, 86],
      [1.5, 3, 62],
      [2, 4, 92],
      [2.5, 5, 64],
      [3, 6, 72],
      [3.25, 5, 54],
    ],
    bass: 'doum',
    voicing: 2,
  },
];

/** Each feel's groove: [drum, beat, velocity, the least drive it plays at]. */
const GROOVES: readonly (readonly (readonly [Drum, number, number, number])[])[] = [
  [
    ['doum', 0, 108, 1],
    ['ka', 0.5, 52, 2],
    ['tek', 1, 90, 2],
    ['ka', 1.5, 48, 2],
    ['doum', 2, 98, 1],
    ['tek', 2.5, 70, 2],
    ['tek', 3, 84, 2],
    ['kick', 0, 110, 1],
    ['frame', 0, 104, 1],
    ['frame', 2, 88, 1],
    ['riq', 1, 62, 2],
    ['riq', 2.5, 50, 2],
    ['riq', 3, 58, 2],
    ['doum', 3, 80, 3],
    ['frame', 1, 80, 3],
    ['kick', 2, 90, 3],
  ],
  [
    ['doum', 0, 108, 1],
    ['tek', 0.5, 76, 2],
    ['doum', 1, 92, 1],
    ['tek', 1.5, 70, 2],
    ['doum', 2, 100, 1],
    ['ka', 2.5, 50, 2],
    ['tek', 3, 86, 2],
    ['tek', 3.25, 60, 3],
    ['kick', 0, 110, 1],
    ['frame', 0, 100, 1],
    ['frame', 2.5, 80, 1],
    ['riq', 0.5, 54, 2],
    ['riq', 2, 60, 2],
    ['kick', 1, 84, 3],
    ['frame', 2, 86, 3],
    ['riq', 3, 56, 3],
  ],
  [
    ['doum', 0, 108, 1],
    ['ka', 0.25, 46, 2],
    ['tek', 0.5, 82, 2],
    ['tek', 1, 74, 2],
    ['doum', 1.5, 94, 1],
    ['tek', 2, 78, 2],
    ['doum', 2.5, 90, 1],
    ['tek', 3, 84, 2],
    ['kick', 0, 110, 1],
    ['frame', 0, 102, 1],
    ['frame', 1.5, 84, 1],
    ['riq', 1, 58, 2],
    ['riq', 3, 58, 2],
    ['kick', 2.5, 88, 3],
    ['frame', 3, 82, 3],
    ['doum', 3.25, 70, 3],
  ],
];
/** The fills over a bar's last group: the tek rolling, doum and tek trading into the frame, the frame rolling. */
const FILLS: readonly (readonly (readonly [Drum, number, number])[])[] = [
  Array.from({ length: 6 }, (unused, i) => ['tek', 2 + i * 0.25, 60 + (44 * i) / 5] as const),
  [
    ['doum', 2, 90],
    ['tek', 2.25, 70],
    ['doum', 2.5, 96],
    ['tek', 2.75, 76],
    ['frame', 3, 100],
    ['frame', 3.25, 106],
  ],
  Array.from({ length: 6 }, (unused, i) => ['frame', 2 + i * 0.25, 64 + i * 9] as const),
];

/** A bar of drums in groove `groove` at `drive` (0 the breakdown's doum alone), and fill `fill` if one closes it. */
function drums(w: Write, bar: number, groove: number, drive: number, fill: number | null): void {
  if (drive === 0) {
    w.hit('doum', bar, 0, 72);
    w.hit('tek', bar, 3, 52);
  }
  for (const [drum, beat, velocity, least] of GROOVES[groove] ?? [])
    if (drive >= least) w.hit(drum, bar, beat, velocity);
  if (fill !== null) for (const [drum, beat, velocity] of FILLS[fill] ?? []) w.hit(drum, bar, beat, velocity);
}

/** A chord's pad in a voicing: close, its top an octave down, or its root an octave up. */
const voiced = (pad: readonly number[], voicing: number): readonly number[] => {
  const [root = 0, middle = 0, top = 0] = pad;
  return voicing === 1 ? [top - 12, root, middle] : voicing === 2 ? [middle, top, root + 12] : pad;
};

/** A take as the fight plays it: its section, its feel, which of its section's leads, how hard it drives (0 the
 *  breakdown's), and whether its harmony is turned. */
interface Line {
  readonly section: Section;
  readonly feel: number;
  readonly lead: number;
  readonly drive: number;
  readonly turn?: boolean;
  /** The voicing of another feel, where a take shares its feel and its section with another. */
  readonly voice?: 0 | 1 | 2;
}

/** The bars under the tunes: the bed in the feel's bass and voicing, the rub with the heart and the sand, the oud,
 *  the drums and the timpani, and the peak's choir, stabs and the swell into the next take. */
function underneath(w: Write, bars: readonly Held<Chord>[][], { section, feel, drive, voice }: Line): void {
  const { rub, heart, sand, oud, bass, voicing } = FEELS[feel] ?? FEELS[0]!;
  // A take voiced as another feel strikes its bed again each bar, so no bar of it sounds as its feel's other take.
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS, voice !== undefined)) {
    const tones = CHORDS[name];
    if (bass === 'held') w.note('bass', bar, beat, beats, tones.bass, 90);
    for (const n of voiced(tones.pad, voice ?? voicing)) w.note('pad', bar, beat, beats, n, 56);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 70);
  }
  bars.forEach((held, bar) => {
    const chordOn = (beat: number) => CHORDS[chordAt(held, beat)];
    const driven = section === 'break' && bar < 4 ? 1 : drive;
    if (bass === 'struck')
      GROUPS.forEach((beat) => w.note('bass', bar, beat, beat === 2 ? 1.4 : 0.9, chordOn(beat).bass, beat ? 82 : 92));
    if (bass === 'doum')
      for (const [beat, beats, lift, velocity] of [
        [0, 1.9, 0, 92],
        [2, 0.9, 0, 84],
        [3, 0.45, 12, 70],
      ] as const)
        w.note('bass', bar, beat, beats, midiNote(chordOn(beat).bass) + lift, velocity);
    for (const { chord: name, beat } of held)
      w.note('timpani', bar, beat, 0.9, CHORDS[name].timp, (beat ? 86 : 100) * (driven ? 1 : 0.7));
    // The rub swells over two bars and falls back, leaning on the groups' first notes.
    rub.forEach(([beat, flat, beats], i) => {
      const accent = (GROUPS as readonly number[]).includes(beat) ? 1.1 : 0.9;
      w.note('rub', bar, beat, beats, flat ? 'Bb3' : 'A3', (58 + (bar % 2) * 12 + i) * accent);
    });
    for (const [beat, velocity] of heart) w.hit('heart', bar, beat, velocity);
    for (const [beat, velocity] of sand) w.hit('sand', bar, beat, velocity);
    for (const [beat, index, velocity] of oud)
      w.note('oud', bar, beat, 0.45, chordOn(beat).oud[index] ?? 0, velocity * (driven ? 1 : 0.82));
    const fills = bar % 4 === 3 && (driven > 0 || bar === 7);
    drums(w, bar, feel, driven, fills ? (feel + (bar >> 2)) % FILLS.length : null);
    if (bar === 0 && driven > 0) w.hit('crash', bar, 0, 100);
    if (bar === bars.length - 1) {
      roll((beat, velocity) => w.note('timpani', bar, beat, 0.22, chordOn(2).timp, velocity), 2, 1.5, 50, 96);
      w.hit('riser', bars.length, -(1.6 * BPM) / 60, 84);
    }
    if (section !== 'vamp' && driven > 0)
      for (const beat of bar % 2 ? [2] : GROUPS)
        for (const n of chordOn(beat).stab) w.note('stab', bar, beat, 0.4, n, beat ? 88 : 100);
  });
}

/** The tunes over a take. The tune's halves: the reed's over the strings' counter-line; or answered, the strings
 *  taking its second four bars an octave under while the reed takes the counter-line over; or the strings an octave
 *  under it on the turned chords; the brass under it at the peak. The gallop on the reed over the strings; or on the
 *  strings, the reed over them; or traded two bars at a time. The break's calls, the reed's or the strings' answered;
 *  the breakdown's call alone; a vamp's entry. */
function tunes(w: Write, { section, lead }: Line): void {
  const half = section === 'a2' || section === 'b2' ? 8 : 0;
  const part = { from: half, to: half + 8 };
  if (section === 'vamp') {
    if (lead === 1) lay(w, 'reed', 4, CALLS, 96, { to: 2 });
    if (lead === 2) lay(w, 'strings', 4, VAMP_LINE, 74, { legato: 0.97, accent: 4 });
  } else if (section === 'a1' || section === 'a2') {
    if (lead === 1) {
      lay(w, 'reed', 0, THEME, 100, { from: half, to: half + 4, legato: 0.92 });
      lay(w, 'strings', 0, COUNTER, 76, { from: half, to: half + 4, legato: 0.97, accent: 4 });
      lay(w, 'strings', 4, THEME, 92, { from: half + 4, to: half + 8, octave: -1, legato: 0.94 });
      lay(w, 'reed', 4, COUNTER, 80, { from: half + 4, to: half + 8, octave: 1, legato: 0.95, accent: 4 });
    } else {
      lay(w, 'reed', 0, THEME, 100 + lead * 2, { ...part, legato: 0.92 });
      const under = lead === 2 ? THEME : COUNTER;
      lay(w, 'strings', 0, under, 76, { ...part, octave: lead === 2 ? -1 : 0, legato: 0.97, accent: 4 });
    }
    if (half || lead) lay(w, 'brass', 0, THEME, 84, { ...part, octave: -1, legato: 0.9, accent: 4 });
  } else if (section === 'b1' || section === 'b2') {
    if (lead === 2)
      for (let bar = 0; bar < 8; bar += 2) {
        const [carrier, under] = bar % 4 ? (['strings', 'reed'] as const) : (['reed', 'strings'] as const);
        const pair = { from: half + bar, to: half + bar + 2 };
        lay(w, carrier, bar, GALLOP, 100, { ...pair, legato: 0.85 });
        lay(w, under, bar, GALLOP_UNDER, 78, { ...pair, octave: under === 'reed' ? 1 : 0, legato: 0.97, accent: 4 });
      }
    else {
      lay(w, lead ? 'strings' : 'reed', 0, GALLOP, 102, { ...part, legato: 0.85 });
      lay(w, lead ? 'reed' : 'strings', 0, GALLOP_UNDER, 78, { ...part, octave: lead, legato: 0.97, accent: 4 });
    }
    lay(w, 'brass', 0, GALLOP, 86, { ...part, octave: -1, legato: 0.85, accent: 4 });
  } else if (section === 'break') {
    if (lead) {
      lay(w, 'strings', 0, CALLS, 96, { octave: -1, legato: 0.92 });
      lay(w, 'reed', 0, ANSWERS, 92, { legato: 0.92 });
    } else lay(w, 'reed', 0, CALLS, 100, { legato: 0.92 });
  } else lay(w, lead ? 'strings' : 'reed', 0, DOWN_LINE, lead ? 82 : 86, { octave: -lead, legato: 0.97, accent: 4 });
}

/** The takes, each section in its feels, the tune's halves each feel over its own chords and over the turned ones:
 *  no two takes of a section share a feel and a harmony. */
const TAKES: readonly Line[] = [
  { section: 'vamp', feel: 0, lead: 0, drive: 1 },
  { section: 'vamp', feel: 1, lead: 1, drive: 1 },
  { section: 'vamp', feel: 2, lead: 2, drive: 2 },
  { section: 'a1', feel: 1, lead: 0, drive: 2 },
  { section: 'a1', feel: 2, lead: 1, drive: 3 },
  { section: 'a1', feel: 0, lead: 2, drive: 2, turn: true },
  { section: 'a2', feel: 2, lead: 0, drive: 3 },
  { section: 'a2', feel: 0, lead: 1, drive: 2 },
  { section: 'a2', feel: 1, lead: 2, drive: 3, turn: true },
  { section: 'b1', feel: 0, lead: 0, drive: 2 },
  { section: 'b1', feel: 2, lead: 2, drive: 3 },
  { section: 'b1', feel: 1, lead: 1, drive: 3 },
  { section: 'b2', feel: 1, lead: 0, drive: 3 },
  { section: 'b2', feel: 2, lead: 1, drive: 2 },
  { section: 'b2', feel: 0, lead: 2, drive: 2 },
  { section: 'break', feel: 1, lead: 0, drive: 2 },
  { section: 'break', feel: 2, lead: 1, drive: 3 },
  { section: 'down', feel: 0, lead: 0, drive: 0 },
  { section: 'down', feel: 1, lead: 1, drive: 0 },
  { section: 'a1', feel: 0, lead: 1, drive: 3, voice: 1 },
  { section: 'a1', feel: 1, lead: 2, drive: 2, turn: true, voice: 2 },
  { section: 'a1', feel: 2, lead: 2, drive: 3, turn: true, voice: 0 },
  { section: 'a2', feel: 1, lead: 0, drive: 2, voice: 2 },
  { section: 'a2', feel: 0, lead: 2, drive: 3, turn: true, voice: 1 },
  { section: 'a2', feel: 2, lead: 1, drive: 2, turn: true, voice: 0 },
  { section: 'break', feel: 0, lead: 1, drive: 3 },
  { section: 'down', feel: 2, lead: 0, drive: 0 },
];

/** The fight: every take, every layer in its role. */
const fight = (): Song =>
  makeForm(
    { ...SONG, name: 'dry-fight', level: LEVEL },
    TAKES.map((line): TakeSpec<Track, Drum> => {
      const { harmony: text, turn, next, opens } = SECTIONS[line.section];
      const bars = harmony(line.turn && turn ? turn : text);
      return {
        section: line.section,
        bars: bars.length,
        next,
        opens,
        write: (w) => {
          underneath(w, bars, line);
          tunes(w, line);
        },
      };
    }),
  );

/** The cadence: the tune's close over D minor, C, B flat and A, the reed coming to rest on A. */
const cadence = (): Song =>
  makeSong({ ...SONG, name: 'dry-cadence', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Dm/C | Bb/A | A'), 0.9);
    lay(w, 'reed', 0, tune('D5:1 F5:1 E5:1.5 | F5:1 E5:1 D5:.5 C#5:.5 Bb4:.5 | A4:3.5'), 94, { legato: 0.97 });
    lay(w, 'strings', 0, tune('A4:2 G4:1.5 | F4:2 E4:1.5 | C#4:3.5'), 74, { legato: 0.98 });
    w.note('timpani', 2, 0, 0.9, 'A2', 84);
    w.hit('heart', 2, 0, 80);
  });

/** The victory: the gallop's rise F, G, A on the reed and the brass, a G major lifting it, then A major held. */
const victory = (): Song =>
  makeSong({ ...SONG, name: 'dry-victory', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('F | G | A | A'), 1);
    const rise = tune(
      'C5:.5 C5:.5 F5:.5 E5:.5 F5:.5 A5:1 | D5:.5 D5:.5 G5:.5 F5:.5 G5:.5 B5:1 | C#5:1 E5:1 A5:1.5 | A5:3.5',
    );
    lay(w, 'reed', 0, rise, 104);
    lay(w, 'brass', 0, rise, 92, { octave: -1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 0, 2, bar === 1 ? 0 : null);
    w.note('timpani', 2, 0, 0.9, 'A2', 112);
    for (const n of keys('A2 E3 A3')) w.note('stab', 2, 0, 7, n, 104);
    w.hit('kick', 2, 0, 116);
    w.hit('frame', 2, 0, 110);
    w.hit('crash', 2, 0, 108);
  });

/** The defeat: the reed alone climbing the tune's first notes and falling back, over the cellos' rub fading. */
const defeat = (): Song =>
  makeSong({ ...SONG, name: 'dry-defeat', bars: 5, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('A | Bb/A | Gm/A | A | A'), 0.7);
    lay(w, 'reed', 0, tune('A4:1 Bb4:.5 C#5:.5 D5:1.5 | C#5:2 Bb4:1.5 | A4:3.5'), 84, { legato: 0.98 });
    for (let bar = 0; bar < 4; bar++)
      for (let i = 0; i < 14; i++) w.note('rub', bar, i * 0.25, 0.22, i % 2 ? 'Bb3' : 'A3', 70 - bar * 12 - i);
    for (const [bar, velocity] of [
      [0, 92],
      [1, 78],
      [3, 60],
    ] as const)
      w.hit('heart', bar, 0, velocity);
  });

/** The second cadence: the reed falling B flat, G, F, E to A in long steps, the strings leaning on C sharp. */
const secondCadence = (): Song =>
  makeSong({ ...SONG, name: 'dry-cadence-2', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Gm | Bb/A | A'), 0.85);
    lay(w, 'reed', 0, tune('Bb4:2 G4:1.5 | F4:2 E4:1.5 | A4:3.5'), 92, { legato: 0.97 });
    lay(w, 'strings', 0, tune('D4:2 Bb3:1.5 | D4:2 C#4:1.5 | A3:3.5'), 72, { legato: 0.98 });
    w.note('timpani', 2, 0, 0.9, 'A2', 84);
    w.hit('heart', 2, 0, 78);
  });

/** The second victory: the tune's leap up D, F, A on the reed, then G, B flat, A, into A major held, the darbuka in
 *  its second groove. */
const secondVictory = (): Song =>
  makeSong({ ...SONG, name: 'dry-victory-2', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Dm | Gm | A | A'), 1);
    const leap = tune('D5:1 F5:1 A5:1.5 | G5:1 Bb5:1 A5:1.5 | C#5:.5 E5:.5 A5:2.5 | A5:3.5');
    lay(w, 'reed', 0, leap, 104);
    lay(w, 'strings', 0, leap, 88, { octave: -1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 1, 2, bar === 1 ? 1 : null);
    w.note('timpani', 2, 0, 0.9, 'A2', 112);
    for (const n of keys('A2 E3 A3')) w.note('stab', 2, 0, 7, n, 100);
    w.hit('kick', 2, 0, 116);
    w.hit('frame', 2, 0, 110);
    w.hit('crash', 2, 0, 108);
  });

/** Dry's fight score: the fight, its two cadences and two victories, heard in turn, and its defeat. */
export const dryScore = () => ({
  song: fight(),
  cadence: cadence(),
  victory: victory(),
  defeat: defeat(),
  secondCadence: secondCadence(),
  secondVictory: secondVictory(),
});
