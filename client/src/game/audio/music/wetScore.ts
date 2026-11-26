// Wet: the fight in the rainforest and the swamp. F sharp Aeolian in 4/4 at 104, its beat split three, three, three,
// three and four: everything leans across the bar. A low clarinet's tune over a marimba in that grouping, a second
// clarinet's counter-line under it, congas, log drums and a deep drum; the danger near is a kalimba dripping, a log
// drum's heartbeat, insects in the shaker and a bassoon creeping a half step; the peak sets the strings over the tune,
// the choir's oohs and the horns swelling. It is written in takes of eight bars (form.ts): vamps, the tune's halves,
// the second clarinet's tune, a break and a breakdown, each in a feel of its own (a groove, fills, the marimba's
// figure, a bass, a voicing, the drips, the heart, the insects and the croak), the tune answered or turned in some.
// The cadence turns G, C sharp, F sharp minor; the victory rises into F sharp major; the defeat sinks low.

import { chordAt, type Held, keys, runsOf } from './craft.ts';
import { type TakeSpec, makeForm } from './form.ts';
import { type Song, lay, makeSong, midiNote } from './score.ts';
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
} from './wetParts.ts';

type Section = 'vamp' | 'a1' | 'a2' | 'b' | 'break' | 'down';
/** Each section's harmony, and a second under the same tune where a take turns it; the sections that may follow it,
 *  and whether a fight may open on it: on the vamp, or straight on the clarinet's call. */
const SECTIONS: Readonly<
  Record<Section, { harmony: string; turn?: string; next: readonly Section[]; opens?: boolean }>
> = {
  vamp: { harmony: 'F#m | F#m | G | C# | F#m | F#m | G | C#', next: ['a1', 'b'], opens: true },
  a1: {
    harmony: 'F#m | F#m | D | E | F#m | D | Bm | C#',
    turn: 'F#m | D | Bm | E | F#m | Bm | D | C#',
    next: ['a2'],
  },
  a2: {
    harmony: 'D | E | C#m | F#m | D | Bm | G | C#',
    turn: 'F#m | C#m | E | D | Bm | G | G | C#',
    next: ['b', 'break', 'down', 'a1'],
  },
  b: { harmony: 'D | E | C#m | F#m | D | E | Bm/C#m | C#', next: ['a1', 'break', 'down'] },
  break: { harmony: 'F#m | G | F#m | C# | F#m | G | F#m | C#', next: ['a1', 'b', 'vamp'], opens: true },
  down: { harmony: 'F#m | F#m | D | D | Bm | Bm | G | C#', next: ['a1', 'b', 'break', 'vamp'] },
};

/** The tune: a fifth up from F sharp and a step back, in dotted eighths across the beat, the same shape on D, its
 *  second half climbing to the high A and falling through the G of the flat second to the dominant. */
const THEME = tune(
  'F#4:.75 C#5:.75 B4:.5 C#5:2 | r:.5 E5:.5 D5:.5 C#5:.5 B4:1 A4:1 | D4:.75 A4:.75 G#4:.5 A4:2 | r:.5 B4:.5 C#5:.5 B4:.5 G#4:1 E4:1' +
    ' | F#4:.75 C#5:.75 B4:.5 C#5:1 E5:1 | F#5:1.5 E5:.5 D5:1 C#5:1 | D5:.75 C#5:.75 B4:.5 F#4:2 | G#4:1.5 F4:.5 G#4:2' +
    ' | A5:.75 F#5:.75 E5:.5 F#5:2 | r:.5 G#5:.5 F#5:.5 E5:.5 D5:1 B4:1 | C#5:.75 E5:.75 G#5:.5 E5:2 | F#5:1.5 E5:.5 C#5:1 A4:1' +
    ' | D5:.75 F#5:.75 E5:.5 D5:1 C#5:1 | B4:.75 D5:.75 C#5:.5 B4:1 A4:1 | G4:.75 B4:.75 A4:.5 G4:1 F#4:1 | F4:1 G#4:1 C#5:2',
);
/** The clarinet low under it, moving where the flute holds. */
const COUNTER = tune(
  'A3:2 C#4:1 B3:1 | A3:4 | F#3:2 A3:1 B3:1 | B3:2 G#3:2' +
    ' | A3:2 F#3:1 A3:1 | A3:1.5 B3:.5 A3:1 F#3:1 | F#3:2 B3:1 D4:1 | F3:2 G#3:2' +
    ' | F#4:2 E4:1 D4:1 | E4:2 B3:2 | E4:2 G#3:1 C#4:1 | C#4:2 A3:1 C#4:1' +
    ' | A3:2 D4:1 E4:1 | D4:2 F#4:1 E4:1 | D4:2 B3:1 D4:1 | C#4:2 F3:1 G#3:1',
);
/** The clarinet's own tune, and the flute's long notes over it. */
const CLARINET_TUNE = tune(
  'F#4:1.5 A4:.5 D5:2 | E5:1.5 D5:.5 B4:2 | C#5:1 E5:1 G#4:2 | A4:1.5 G#4:.5 F#4:2' +
    ' | F#4:1.5 A4:.5 D5:1 F#5:1 | E5:1.5 G#4:.5 B4:2 | D5:1 C#5:1 B4:1 C#5:1 | C#5:2 B4:1 G#4:1',
);
const FLUTE_OVER = tune('A5:4 | G#5:4 | G#5:2 E5:2 | F#5:4 | A5:4 | B5:2 G#5:2 | F#5:2 E5:2 | F5:4');
const BREAK_CALL = tune('F#4:.75 C#5:.75 B4:.5 C#5:2 | r:4 | F#4:.75 C#5:.75 B4:.5 C#5:1 E5:1 | F5:4');
/** A vamp's line, the clarinet readying the tune; and the breakdown's call, slowed, alone over the marimba. */
const VAMP_LINE = tune('C#4:4 | A3:4 | B3:2 D4:2 | C#4:4');
const DOWN_LINE = tune('F#4:3 C#5:1 | C#5:2 B4:1 A4:1 | A4:2 F#4:2 | r:4 | D4:2 F#4:2 | B4:4 | r:4 | r:4');

/** A feel: the kalimba's drips (beat, which of its three), the heart, the insects (beat, velocity), the bassoon's
 *  croak (the bars it creeps in, and its notes: beat and half steps over the root), the marimba's sixteenths (which of
 *  the chord's four each strikes), the bass's figure and the pad's voicing. The drums' groove is the feel's too. */
interface Feel {
  readonly drips: readonly (readonly [number, number])[];
  readonly heart: readonly (readonly [number, number])[];
  readonly insects: readonly (readonly [number, number])[];
  readonly croak: { readonly odd: boolean; readonly notes: readonly (readonly [number, number])[] };
  readonly marimba: readonly number[];
  readonly bass: 'held' | 'groups' | 'push';
  readonly voicing: 0 | 1 | 2;
}
const sixteenths = (velocity: (beat: number, i: number) => number) =>
  Array.from({ length: 16 }, (unused, i) => [i * 0.25, velocity(i * 0.25, i)] as const);
const FEELS: readonly Feel[] = [
  {
    drips: GROUPS.map((beat, i) => [beat, i % 3] as const),
    heart: [
      [0, 92],
      [0.75, 70],
    ],
    insects: sixteenths((beat, i) => (i % 4 === 2 ? 46 : 30)),
    croak: {
      odd: true,
      notes: [
        [3, 0],
        [3.5, 1],
      ],
    },
    marimba: [0, 2, 1, 3, 1, 2, 0, 2, 3, 1, 3, 2, 0, 1, 2, 3],
    bass: 'held',
    voicing: 0,
  },
  {
    drips: [
      [0.75, 0],
      [1.5, 2],
      [2.25, 1],
      [3.75, 2],
    ],
    heart: [
      [0, 92],
      [2, 74],
    ],
    insects: Array.from({ length: 8 }, (unused, i) => [i * 0.5, i % 2 ? 40 : 30] as const),
    croak: {
      odd: false,
      notes: [
        [1.5, 0],
        [2, 1],
        [2.5, 0],
      ],
    },
    marimba: [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2, 3, 2, 1, 0],
    bass: 'groups',
    voicing: 1,
  },
  {
    drips: [
      [0, 2],
      [1, 1],
      [1.75, 0],
      [3, 1],
      [3.5, 2],
    ],
    heart: [
      [0, 90],
      [0.75, 66],
      [2.25, 78],
    ],
    insects: sixteenths((beat) => (GROUPS.includes(beat) ? 46 : 28)),
    croak: {
      odd: true,
      notes: [
        [2.25, 0],
        [2.75, 1],
        [3.25, 0],
      ],
    },
    marimba: [0, 3, 2, 1, 3, 2, 0, 3, 2, 1, 2, 3, 0, 2, 1, 2],
    bass: 'push',
    voicing: 2,
  },
];

/** Each feel's groove: [drum, beat, velocity, the least drive it plays at]. */
const GROOVES: readonly (readonly (readonly [Drum, number, number, number])[])[] = [
  [
    ['deep', 0, 112, 1],
    ['deep', 2.5, 92, 1],
    ['logHigh', 0.75, 82, 1],
    ['logLow', 1.5, 86, 1],
    ['logHigh', 2.25, 78, 1],
    ['logLow', 3, 84, 1],
    ['deep', 1.75, 76, 2],
    ['conga', 1, 86, 2],
    ['conga', 3.75, 72, 2],
    ['low', 2, 84, 2],
    ['low', 3.5, 70, 2],
    ...[0.5, 1.25, 2.75, 3.25].map((beat) => ['muted', beat, 58, 2] as const),
    ...sixteenths((beat) => (GROUPS.includes(beat) ? 58 : 38)).map(
      ([beat, loud]) => ['shaker', beat, loud, 2] as const,
    ),
    ['kick', 0, 104, 3],
    ['kick', 2, 90, 3],
    ['deep', 3.5, 84, 3],
  ],
  [
    ['deep', 0, 112, 1],
    ['deep', 1.5, 90, 1],
    ['logHigh', 0.75, 80, 1],
    ['logLow', 2.25, 84, 1],
    ['logHigh', 3, 78, 1],
    ['logLow', 3.75, 70, 1],
    ['conga', 0.5, 80, 2],
    ['conga', 2.5, 84, 2],
    ['low', 1, 80, 2],
    ['low', 3, 76, 2],
    ...[0.25, 1.75, 2.75, 3.5].map((beat) => ['muted', beat, 56, 2] as const),
    ...Array.from({ length: 8 }, (unused, i) => ['shaker', i * 0.5, i % 2 ? 36 : 50, 2] as const),
    ['kick', 0, 104, 3],
    ['kick', 2.25, 88, 3],
    ['deep', 3.25, 82, 3],
  ],
  [
    ['deep', 0, 112, 1],
    ['deep', 2.25, 94, 1],
    ['logLow', 0.75, 84, 1],
    ['logHigh', 1.5, 80, 1],
    ['logLow', 3, 86, 1],
    ['conga', 0.75, 84, 2],
    ['conga', 2.25, 80, 2],
    ['low', 1.5, 82, 2],
    ['low', 3.75, 72, 2],
    ...[0.5, 1, 2.5, 3.25].map((beat) => ['muted', beat, 56, 2] as const),
    ...sixteenths((beat) => (beat % 1 === 0 ? 54 : 34)).map(([beat, loud]) => ['shaker', beat, loud, 2] as const),
    ['kick', 0, 106, 3],
    ['kick', 1.5, 86, 3],
    ['kick', 3, 92, 3],
  ],
];
/** The fills over a bar's second half: down the logs to the deep drum, the congas, the logs trading into it. */
const FILLS: readonly (readonly (readonly [Drum, number, number])[])[] = [
  (['logHigh', 'logHigh', 'logLow', 'logLow', 'low', 'low', 'deep', 'deep'] as const).map((drum, i) => [
    drum,
    2 + i * 0.25,
    76 + i * 4,
  ]),
  (['conga', 'conga', 'low', 'low', 'conga', 'low', 'deep', 'deep'] as const).map((drum, i) => [
    drum,
    2 + i * 0.25,
    74 + i * 5,
  ]),
  (['logLow', 'logHigh', 'logLow', 'logHigh', 'deep', 'deep'] as const).map((drum, i) => [
    drum,
    2.5 + i * 0.25,
    78 + i * 5,
  ]),
];

/** A bar of drums in groove `groove` at `drive` (0 the breakdown's logs alone), and fill `fill` if one closes it. */
function drums(w: Write, bar: number, groove: number, drive: number, fill: number | null): void {
  if (drive === 0) {
    w.hit('logLow', bar, 0, 62);
    w.hit('logHigh', bar, 2.25, 52);
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

/** The bars under the tunes: the bed in the feel's bass and voicing, the drips, the heartbeat, the insects and the
 *  croak, the marimba, the drums, and the peak's choir, horns and the swell into the next take. */
function underneath(w: Write, bars: readonly Held<Chord>[][], { section, feel, drive, voice }: Line): void {
  const { drips, heart, insects, croak, marimba, bass, voicing } = FEELS[feel] ?? FEELS[0]!;
  // A take voiced as another feel strikes its bed again each bar, so no bar of it sounds as its feel's other take.
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS, voice !== undefined)) {
    const tones = CHORDS[name];
    if (bass === 'held') w.note('bass', bar, beat, beats, tones.bass, 92);
    for (const n of voiced(tones.pad, voice ?? voicing)) w.note('pad', bar, beat, beats, n, 58);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 66);
    for (const n of tones.horn) w.note('horn', bar, beat, Math.min(beats, 4), n, 74);
  }
  bars.forEach((held, bar) => {
    const chordOn = (beat: number) => CHORDS[chordAt(held, beat)];
    const driven = section === 'break' && bar < 4 ? 1 : drive;
    if (bass === 'groups') GROUPS.forEach((beat) => w.note('bass', bar, beat, 0.7, chordOn(beat).bass, beat ? 82 : 94));
    if (bass === 'push')
      for (const [beat, beats, lift, velocity] of [
        [0, 1.4, 0, 94],
        [1.5, 0.7, 0, 80],
        [2.25, 0.7, 12, 72],
        [3, 1, 0, 86],
      ] as const)
        w.note('bass', bar, beat, beats, midiNote(chordOn(beat).bass) + lift, velocity);
    // Under the tune the drips thin to the end of the bar, where the clarinet breathes.
    const underTune = section === 'a1' || section === 'a2';
    for (const [beat, index] of drips)
      if (!underTune || beat >= 2.25) w.note('drip', bar, beat, 0.6, chordOn(beat).drip[index] ?? 0, 80);
    for (const [beat, velocity] of heart) w.hit('heart', bar, beat, velocity);
    for (const [beat, velocity] of insects) w.hit('insects', bar, beat, velocity);
    if (bar % 2 === (croak.odd ? 1 : 0)) {
      const root = chordOn(3).marimba[0] ?? 42;
      croak.notes.forEach(([beat, lift], i) => w.note('croak', bar, beat, 0.3, root + lift, 100 - i * 8));
    }
    marimba.forEach((index, i) => {
      const beat = i * 0.25;
      const loud = (GROUPS.includes(beat) ? 92 : 64) * (driven ? 1 : 0.82);
      w.note('marimba', bar, beat, 0.24, chordOn(beat).marimba[index] ?? 0, loud);
    });
    const fills = bar % 4 === 3 && (driven > 0 || bar === 7);
    drums(w, bar, feel, driven, fills ? (feel + (bar >> 2)) % FILLS.length : null);
    if (bar === 0 && driven > 0) w.hit('crash', bar, 0, 96);
    if (bar === bars.length - 1) w.hit('riser', bars.length, -(1.6 * BPM) / 60, 84);
  });
}

/** The tunes over a take. The tune's halves: the low clarinet's over the second's counter-line, the strings over it
 *  at the peak; or answered, the second clarinet taking its second four bars while the first takes the counter-line;
 *  or in octaves on the turned chords. The second clarinet's tune under the first's long notes, or the two swapped, or
 *  both an octave down. The break's call, low or high; the breakdown's call alone; a vamp's entry. */
function tunes(w: Write, { section, lead }: Line): void {
  const half = section === 'a2' ? 8 : 0;
  const part = { from: half, to: half + 8 };
  if (section === 'vamp') {
    if (lead === 1) lay(w, 'reed', 4, BREAK_CALL, 92, { octave: -1, to: 1 });
    if (lead === 2) lay(w, 'clarinet', 4, VAMP_LINE, 76, { legato: 0.97, accent: 4 });
  } else if (section === 'a1' || section === 'a2') {
    if (lead === 1) {
      lay(w, 'reed', 0, THEME, 100, { from: half, to: half + 4, octave: -1, legato: 0.94 });
      lay(w, 'clarinet', 0, COUNTER, 80, { from: half, to: half + 4, legato: 0.96, accent: 4 });
      lay(w, 'clarinet', 4, THEME, 98, { from: half + 4, to: half + 8, octave: -1, legato: 0.94 });
      lay(w, 'reed', 4, COUNTER, 78, { from: half + 4, to: half + 8, legato: 0.96, accent: 4 });
    } else {
      lay(w, 'reed', 0, THEME, 100 + lead * 2, { ...part, octave: -1, legato: 0.94 });
      lay(w, 'clarinet', 0, lead === 2 ? THEME : COUNTER, lead === 2 ? 84 : 80, { ...part, legato: 0.96, accent: 4 });
    }
    if (half || lead) lay(w, 'strings', 0, THEME, 70, { ...part, legato: 0.96, accent: 4 });
  } else if (section === 'b') {
    const [carrier, over] = lead === 1 ? (['reed', 'clarinet'] as const) : (['clarinet', 'reed'] as const);
    lay(w, carrier, 0, CLARINET_TUNE, 98, { octave: lead === 2 ? -1 : 0, legato: 0.95 });
    lay(w, over, 0, FLUTE_OVER, 82, { octave: lead === 2 ? -2 : -1, legato: 0.97, accent: 4 });
    lay(w, 'strings', 0, lead === 1 ? FLUTE_OVER : CLARINET_TUNE, 66, { legato: 0.96, accent: 4 });
  } else if (section === 'break') {
    lay(w, lead ? 'clarinet' : 'reed', 0, BREAK_CALL, 96, { octave: lead ? 0 : -1, legato: 0.94 });
    lay(w, 'reed', 4, BREAK_CALL, 92, { octave: -1, legato: 0.94 });
  } else lay(w, lead ? 'reed' : 'clarinet', 0, DOWN_LINE, 80, { octave: -lead, legato: 0.97, accent: 4 });
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
  { section: 'b', feel: 0, lead: 0, drive: 2 },
  { section: 'b', feel: 1, lead: 1, drive: 3 },
  { section: 'b', feel: 2, lead: 2, drive: 3 },
  { section: 'break', feel: 1, lead: 0, drive: 2 },
  { section: 'break', feel: 2, lead: 1, drive: 3 },
  { section: 'down', feel: 0, lead: 0, drive: 0 },
  { section: 'down', feel: 1, lead: 1, drive: 0 },
  { section: 'a1', feel: 0, lead: 1, drive: 3, voice: 1 },
  { section: 'a1', feel: 1, lead: 2, drive: 2, turn: true, voice: 2 },
  { section: 'a1', feel: 2, lead: 0, drive: 3, turn: true, voice: 0 },
  { section: 'a2', feel: 1, lead: 0, drive: 2, voice: 2 },
  { section: 'a2', feel: 0, lead: 2, drive: 3, turn: true, voice: 1 },
  { section: 'a2', feel: 2, lead: 2, drive: 2, turn: true, voice: 0 },
  { section: 'break', feel: 0, lead: 1, drive: 3 },
  { section: 'down', feel: 2, lead: 0, drive: 0 },
];

/** The fight: every take, every layer in its role. */
const fight = (): Song =>
  makeForm(
    { ...SONG, name: 'wet-fight', level: LEVEL },
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

/** The cadence: the tune's last two bars over G and C sharp, home to F sharp minor. */
const cadence = (): Song =>
  makeSong({ ...SONG, name: 'wet-cadence', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('G | C# | F#m'), 0.9);
    lay(w, 'reed', 0, tune('G4:.75 B4:.75 A4:.5 G4:1 F#4:1 | F4:1 G#4:1 C#5:2 | F#4:4'), 92, {
      octave: -1,
      legato: 0.97,
    });
    lay(w, 'clarinet', 0, tune('D4:2 B3:1 D4:1 | C#4:2 F3:1 G#3:1 | A3:4'), 74, { legato: 0.98 });
    w.hit('deep', 2, 0, 84);
    w.hit('heart', 2, 0.75, 60);
  });

/** The victory: the tune's opening on D and on E, then F sharp major, its A sharp bright, the drums under it. */
const victory = (): Song =>
  makeSong({ ...SONG, name: 'wet-victory', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('D | E | F# | F#'), 1);
    const rise = tune('D5:.75 F#5:.75 A5:.5 F#5:2 | E5:.75 G#5:.75 B5:.5 G#5:2 | F#5:.75 A#5:.75 C#6:.5 A#5:2 | F#5:4');
    lay(w, 'reed', 0, rise, 104, { octave: -1 });
    lay(w, 'strings', 0, rise, 80, { octave: -1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 0, 2, bar === 1 ? 0 : null);
    for (const n of keys('F#3 C#4 A#4')) w.note('horn', 2, 0, 7, n, 92);
    w.hit('deep', 2, 0, 116);
    w.hit('kick', 2, 0, 110);
    w.hit('crash', 2, 0, 104);
  });

/** The defeat: the clarinet alone sinking from C sharp to the low F sharp, the croak and the heart under it. */
const defeat = (): Song =>
  makeSong({ ...SONG, name: 'wet-defeat', bars: 5, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('F#m | D | Bm | C# | F#m'), 0.7);
    lay(w, 'clarinet', 0, tune('C#5:1.5 B4:.5 A4:2 | F#4:2 E4:2 | D4:4 | F3:2 G#3:2 | F#3:4'), 86, { legato: 0.98 });
    for (const [bar, velocity] of [
      [0, 88],
      [1, 74],
      [3, 58],
    ] as const)
      w.hit('heart', bar, 0, velocity);
    w.note('croak', 1, 3, 0.3, 'F#2', 64);
    w.note('croak', 1, 3.5, 0.3, 'G2', 58);
  });

/** The second cadence: the reed down from B through G sharp to C sharp, the clarinet holding, home to F sharp minor. */
const secondCadence = (): Song =>
  makeSong({ ...SONG, name: 'wet-cadence-2', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Bm | C# | F#m'), 0.85);
    lay(w, 'reed', 0, tune('B4:1.5 A4:.5 F#4:2 | G#4:1 F4:1 C#4:2 | F#4:4'), 90, { legato: 0.97 });
    lay(w, 'clarinet', 0, tune('D4:4 | C#4:4 | C#4:4'), 72, { legato: 0.98 });
    w.hit('deep', 2, 0, 80);
    w.hit('heart', 1, 0, 64);
  });

/** The second victory: the tune's opening on B and on C sharp, then F sharp major, the congas in their second groove. */
const secondVictory = (): Song =>
  makeSong({ ...SONG, name: 'wet-victory-2', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Bm | C# | F# | F#'), 1);
    const rise = tune('B4:.75 D5:.75 F#5:.5 D5:2 | C#5:.75 F5:.75 G#5:.5 F5:2 | A#4:.75 C#5:.75 F#5:.5 C#5:2 | F#5:4');
    lay(w, 'reed', 0, rise, 104, { octave: -1 });
    lay(w, 'strings', 0, rise, 80, { octave: -1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 1, 2, bar === 1 ? 1 : null);
    for (const n of keys('C#4 F#4 A#4')) w.note('horn', 2, 0, 7, n, 90);
    w.hit('deep', 2, 0, 116);
    w.hit('kick', 2, 0, 110);
    w.hit('crash', 2, 0, 104);
  });

/** Wet's fight score: the fight, its two cadences and two victories, heard in turn, and its defeat. */
export const wetScore = () => ({
  song: fight(),
  cadence: cadence(),
  victory: victory(),
  defeat: defeat(),
  secondCadence: secondCadence(),
  secondVictory: secondVictory(),
});
