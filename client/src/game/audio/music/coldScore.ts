// Cold: the fight on the tundra. B Aeolian, its C natural (the flat second) borrowed for the bleakest bar, in 5/4,
// three and two, at 120: a march through deep snow. A horn calls the tune over the low strings' ostinato and a taiko, a
// fiddle above it with a counter-line; the danger near is the wind and a slow heart (the strings shivering in fifths,
// gusts of noise, the strings' wood ticking, the taiko's slow beat); the peak doubles the horn with the brass and sets
// the choir high. It is written in takes of eight bars (form.ts): vamps, the tune's halves, the fiddle's tune, a break
// and a breakdown, each in a feel of its own (a groove, fills, the ostinato, a bass, a voicing, the shiver, the gusts,
// the ticks and the heart), the tune answered or turned to new chords in some. The cadence closes on the low B, the
// victory rises G, A into B major, the defeat falls through C.

import { chordAt, type Held, roll, runsOf } from './craft.ts';
import {
  BEATS,
  BPM,
  CHORDS,
  type Chord,
  type Drum,
  LEVEL,
  ONCE,
  SONG,
  type Track,
  type Write,
  harmony,
  stingBed,
  tune,
} from './coldParts.ts';
import { type TakeSpec, makeForm } from './form.ts';
import { type Song, lay, makeSong, midiNote } from './score.ts';

type Section = 'vamp' | 'a1' | 'a2' | 'b' | 'break' | 'down';
/** Each section's harmony, and a second under the same tune where a take turns it; the sections that may follow it,
 *  and whether a fight may open on it: on the vamp, or straight on the horn's call. */
const SECTIONS: Readonly<
  Record<Section, { harmony: string; turn?: string; next: readonly Section[]; opens?: boolean }>
> = {
  vamp: { harmony: 'Bm | Bm | G | F#m | Bm | Bm | G | F#m', next: ['a1', 'b'], opens: true },
  a1: {
    harmony: 'Bm | Bm | G | A | Bm | Bm | Em | F#m',
    turn: 'Bm | D | G | F#m | Bm | D | C | F#m',
    next: ['a2', 'b'],
  },
  a2: {
    harmony: 'G | A | Bm | C | G | Em | C/F#m | Bm',
    turn: 'Em | F#m | D | C | Em | G | C/F#m | Bm',
    next: ['b', 'break', 'down', 'a1'],
  },
  b: { harmony: 'G | D | A | Em | G | D | C | F#m', next: ['a1', 'break', 'down'] },
  break: { harmony: 'Bm | C | Bm | F#m | Bm | C | Bm | F#m', next: ['a1', 'b', 'vamp'], opens: true },
  down: { harmony: 'Bm | Bm | G | G | Em | Em | C | F#m', next: ['a1', 'b', 'break', 'vamp'] },
};

/** The horn's call: up a fifth from B and falling back, again to the high B, and, in its second half, up to D and
 *  down through the C of the flat second to the low B. */
const THEME = tune(
  'B3:1 F#4:2 E4:1 D4:1 | F#4:1.5 E4:.5 D4:1 B3:2 | G4:1 D4:2 G4:1 A4:1 | C#5:3 B4:1 A4:1' +
    ' | B3:1 F#4:2 E4:1 D4:1 | F#4:1.5 E4:.5 A4:1 B4:2 | G4:1 E4:1 B4:1 A4:1 G4:1 | F#4:5' +
    ' | D5:2 B4:1 G4:1 A4:1 | C#5:2 A4:1 E4:1 F#4:1 | D5:1 C#5:1 B4:1 F#4:2 | G4:1.5 E4:.5 C5:3' +
    ' | B4:2 A4:1 G4:1 E4:1 | G4:1.5 F#4:.5 E4:1 B3:2 | E4:2 G4:1 F#4:2 | B3:5',
);
/** The fiddle over it, moving where the horn holds. */
const COUNTER = tune(
  'r:1 D5:1 F#5:1 B5:2 | D5:3 B4:2 | D5:3 G5:2 | E5:1 C#5:1 A5:1 G5:1 E5:1' +
    ' | r:1 D5:1 F#5:1 B5:2 | F#5:3 D5:2 | E5:3 G5:2 | C#5:1 E5:1 F#5:1 A5:2' +
    ' | G5:2 F#5:1 D5:2 | E5:3 C#5:2 | F#5:2 E5:1 D5:2 | E5:1.5 D5:.5 E5:1 G5:2' +
    ' | D5:3 B4:2 | B4:2 E5:3 | G5:3 F#5:2 | F#5:1 E5:1 D5:1 C#5:1 B4:1',
);
/** The fiddle's own tune, high over the horns' long notes. */
const FIDDLE_TUNE = tune(
  'B5:3 A5:1 G5:1 | F#5:3 E5:1 D5:1 | E5:2 C#5:1 A4:2 | B4:3 E5:2' +
    ' | D5:1 G5:2 A5:1 B5:1 | A5:3 F#5:2 | G5:3 E5:1 C5:1 | C#5:2 E5:1 F#5:2',
);
const HORN_UNDER = tune(
  'G3:3 B3:2 | A3:3 D4:2 | C#4:3 E4:2 | E4:3 B3:2 | B3:3 D4:2 | D4:3 A3:2 | C4:3 G3:2 | A3:3 C#4:2',
);
const BREAK_CALL = tune('B3:1 F#4:2 E4:1 D4:1 | r:5 | B3:1 F#4:2 A4:1 B4:1 | F#4:5');
/** A vamp's line, the fiddle readying the tune; and the breakdown's call, slowed, alone over the low strings. */
const VAMP_LINE = tune('F#5:5 | D5:3 B4:2 | D5:3 B4:2 | C#5:5');
const DOWN_LINE = tune('B3:1 F#4:4 | E4:2 D4:3 | D4:5 | r:5 | E4:3 G4:2 | B4:5 | r:5 | r:5');

/** A feel: how the strings shiver (held, bowed again on the bar's two, or the root in octaves), the gusts (the bars
 *  of four they blow in, and the beat), the wood's ticks, the heart, the low strings' ten eighths (which of the
 *  chord's ten, velocity), the bass's figure and the air's voicing. The drums' groove is the feel's too. */
interface Feel {
  readonly shiver: 'held' | 'bowed' | 'octaves';
  readonly gusts: readonly (readonly [number, number])[];
  readonly ticks: readonly number[];
  readonly heart: readonly (readonly [number, number])[];
  readonly ostinato: readonly (readonly [number, number])[];
  readonly bass: 'held' | 'march' | 'pulse';
  readonly voicing: 0 | 1 | 2;
}
const FEELS: readonly Feel[] = [
  {
    shiver: 'held',
    gusts: [[2, 1]],
    ticks: [0, 1, 1.5, 2.5, 3, 4],
    heart: [
      [0, 94],
      [3, 76],
    ],
    ostinato: [100, 62, 70, 92, 62, 70, 90, 66, 86, 64].map((velocity, i) => [i, velocity] as const),
    bass: 'held',
    voicing: 0,
  },
  {
    shiver: 'bowed',
    gusts: [
      [0, 2.5],
      [3, 0],
    ],
    ticks: [0, 0.5, 1.5, 3, 3.5],
    heart: [
      [0, 94],
      [1.5, 70],
      [3, 80],
    ],
    ostinato: [0, 2, 1, 3, 5, 4, 6, 8, 7, 9].map(
      (index, i) => [index, [100, 66, 74, 90, 62, 72, 92, 70, 84, 64][i] ?? 64] as const,
    ),
    bass: 'march',
    voicing: 1,
  },
  {
    shiver: 'octaves',
    gusts: [
      [1, 3],
      [3, 3],
    ],
    ticks: [0, 1, 2, 3, 4, 4.5],
    heart: [
      [0, 92],
      [3, 74],
      [4, 60],
    ],
    ostinato: [0, 1, 6, 3, 4, 2, 6, 7, 8, 9].map(
      (index, i) => [index, [100, 60, 82, 92, 60, 74, 90, 64, 86, 70][i] ?? 64] as const,
    ),
    bass: 'pulse',
    voicing: 2,
  },
];

/** Each feel's groove: [drum, beat, velocity, the least drive it plays at]. */
const GROOVES: readonly (readonly (readonly [Drum, number, number, number])[])[] = [
  [
    ['taiko', 0, 116, 1],
    ['taiko', 3, 100, 1],
    ['kick', 0, 104, 1],
    ...[0.5, 1, 1.5, 2, 3.5, 4.5].map((beat, i) => ['frame', beat, [50, 64, 70, 52, 58, 66][i] ?? 60, 1] as const),
    ['snare', 2, 92, 2],
    ['snare', 4, 98, 2],
    ['kick', 3, 96, 2],
    ['lowTom', 1.5, 74, 2],
    ['taiko', 1.5, 84, 3],
    ['taiko', 4.5, 90, 3],
    ['snare', 4.75, 56, 3],
  ],
  [
    ['taiko', 0, 116, 1],
    ['taiko', 3, 96, 1],
    ['kick', 0, 104, 1],
    ...[1, 1.5, 2, 2.5, 4, 4.5].map((beat, i) => ['frame', beat, [60, 52, 66, 54, 62, 70][i] ?? 60, 1] as const),
    ['snare', 1.5, 90, 2],
    ['snare', 4, 96, 2],
    ['kick', 2.5, 92, 2],
    ['midTom', 3.5, 72, 2],
    ['taiko', 2, 84, 3],
    ['taiko', 4, 88, 3],
    ['snare', 4.5, 56, 3],
  ],
  [
    ['taiko', 0, 116, 1],
    ['taiko', 1.5, 90, 1],
    ['taiko', 3, 100, 1],
    ['kick', 0, 104, 1],
    ...[0.5, 2, 2.5, 3.5, 4, 4.5].map((beat, i) => ['frame', beat, [54, 62, 50, 60, 56, 68][i] ?? 60, 1] as const),
    ['snare', 1, 88, 2],
    ['snare', 3.5, 92, 2],
    ['kick', 4, 90, 2],
    ['highTom', 2.5, 70, 2],
    ['taiko', 4.5, 92, 3],
    ['kick', 1.5, 86, 3],
    ['snare', 4.75, 60, 3],
  ],
];
/** The fills over a bar's two: down the toms rolling, the taiko and the low tom trading, the snare rolling up. */
const FILLS: readonly (readonly (readonly [Drum, number, number])[])[] = [
  Array.from({ length: 8 }, (unused, i) => {
    const beat = 3 + i * 0.25;
    return [beat < 4 ? 'highTom' : beat < 4.5 ? 'midTom' : 'lowTom', beat, 70 + i * 5.4] as const;
  }),
  [
    ['taiko', 3, 100],
    ['lowTom', 3.5, 96],
    ['taiko', 4, 104],
    ['lowTom', 4.5, 100],
    ['snare', 4.75, 80],
  ],
  Array.from({ length: 6 }, (unused, i) => ['snare', 3.5 + i * 0.25, 62 + i * 9] as const),
];

/** A bar of drums in groove `groove` at `drive` (0 the breakdown's taiko alone), and fill `fill` if one closes it. */
function drums(w: Write, bar: number, groove: number, drive: number, fill: number | null): void {
  if (drive === 0) {
    w.hit('taiko', bar, 0, 80);
    w.hit('frame', bar, 3, 50);
  }
  for (const [drum, beat, velocity, least] of GROOVES[groove] ?? [])
    if (drive >= least) w.hit(drum, bar, beat, velocity);
  if (fill !== null) for (const [drum, beat, velocity] of FILLS[fill] ?? []) w.hit(drum, bar, beat, velocity);
}

/** A chord's air in a voicing: as written, its top an octave down, or its lowest an octave up. */
const voiced = (air: readonly number[], voicing: number): readonly number[] => {
  const [low = 0, middle = 0, top = 0] = air;
  return voicing === 1 ? [top - 12, low, middle] : voicing === 2 ? [middle, top, low + 12] : air;
};

/** A take as the fight plays it: its section, its feel, which of its section's leads, how hard it drives (0 the
 *  breakdown's), and whether its harmony is turned. */
interface Line {
  readonly section: Section;
  readonly feel: number;
  readonly lead: number;
  readonly drive: number;
  readonly turn?: boolean;
}

/** The bars under the tunes: the bed in the feel's bass and voicing, the shiver, the gusts, the ticks and the slow
 *  heart, the low strings, the drums and timpani, and the peak's choir and the swell into the next take. */
function underneath(w: Write, bars: readonly Held<Chord>[][], { feel, drive, section }: Line): void {
  const { shiver, gusts, ticks, heart, ostinato, bass, voicing } = FEELS[feel] ?? FEELS[0]!;
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    if (bass === 'held') w.note('bass', bar, beat, beats, tones.bass, 90);
    for (const n of voiced(tones.air, voicing)) w.note('air', bar, beat, beats, n, 52);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 66);
    // Two octaves under their voicing: held high, these strings were a whine.
    if (shiver === 'held') for (const n of tones.shiver) w.note('shiver', bar, beat, beats, n - 24, 64);
    const root = (tones.shiver[0] ?? 59) - 24;
    if (shiver === 'octaves') for (const n of [root, root + 12]) w.note('shiver', bar, beat, beats, n, 60);
  }
  bars.forEach((held, bar) => {
    const chordOn = (beat: number) => CHORDS[chordAt(held, beat)];
    const driven = section === 'break' && bar < 2 ? 1 : drive;
    if (shiver === 'bowed')
      for (const [beat, beats] of [
        [0, 3],
        [3, 2],
      ] as const)
        for (const n of chordOn(beat).shiver) w.note('shiver', bar, beat, beats, n - 24, beat ? 58 : 66);
    if (bass === 'march')
      for (const beat of [0, 3]) w.note('bass', bar, beat, beat ? 1.8 : 2.8, chordOn(beat).bass, 92);
    if (bass === 'pulse')
      for (const [beat, beats, lift] of [
        [0, 1.4, 0],
        [1.5, 1.4, 0],
        [3, 0.9, 12],
        [4, 0.9, 0],
      ] as const)
        w.note('bass', bar, beat, beats, midiNote(chordOn(beat).bass) + lift, beat ? 80 : 94);
    for (const { chord: name, beat } of held)
      w.note('timpani', bar, beat, 0.9, CHORDS[name].timp, (beat ? 88 : 102) * (driven ? 1 : 0.7));
    for (const [inFour, beat] of gusts) if (bar % 4 === inFour) w.hit('gust', bar, beat, 70);
    for (const beat of ticks) w.note('tick', bar, beat, 0.2, chordOn(beat).air[0] ?? 0, beat % 1 ? 76 : 100);
    for (const [beat, velocity] of heart) w.hit('heart', bar, beat, velocity);
    ostinato.forEach(([index, velocity], i) =>
      w.note('ostinato', bar, i * 0.5, 0.44, chordOn(i * 0.5).ostinato[index] ?? 0, velocity * (driven ? 1 : 0.82)),
    );
    const fills = bar % 4 === 3 && (driven > 0 || bar === 7);
    drums(w, bar, feel, driven, fills ? (feel + (bar >> 2)) % FILLS.length : null);
    if (bar === 0 && driven > 0) w.hit('crash', bar, 0, 100);
    if (bar === 4 && driven > 0) w.hit('china', bar, 0, 80);
    if (bar % 4 === 3)
      roll((beat, velocity) => w.note('timpani', bar, beat, 0.22, chordOn(3).timp, velocity), 3, 2, 46, 96);
    if (bar === bars.length - 1) w.hit('riser', bars.length, -(1.6 * BPM) / 60, 84);
  });
}

/** The tunes over a take. The tune's halves: the horn's under the fiddle's counter-line, the brass with the horn at
 *  the peak; or answered, the fiddle taking its second four bars an octave up while the horn takes the counter-line
 *  under; or on the turned chords with the fiddle held high. The fiddle's tune over the horns; or the horn taking it
 *  under the fiddle; or the two answering. The break's call, the horn's or the fiddle's; the breakdown's call. */
function tunes(w: Write, bars: readonly Held<Chord>[][], { section, lead }: Line): void {
  const half = section === 'a2' ? 8 : 0;
  const part = { from: half, to: half + 8 };
  if (section === 'vamp') {
    if (lead === 1) lay(w, 'horn', 4, BREAK_CALL, 92, { to: 1 });
    if (lead === 2) lay(w, 'fiddle', 4, VAMP_LINE, 76, { legato: 0.97, accent: 4 });
  } else if (section === 'a1' || section === 'a2') {
    if (lead === 1) {
      lay(w, 'horn', 0, THEME, 100, { from: half, to: half + 4, legato: 0.95 });
      lay(w, 'fiddle', 0, COUNTER, 82, { from: half, to: half + 4, legato: 0.95, accent: 4 });
      lay(w, 'fiddle', 4, THEME, 96, { from: half + 4, to: half + 8, octave: 1, legato: 0.95 });
      lay(w, 'horn', 4, COUNTER, 84, { from: half + 4, to: half + 8, octave: -1, legato: 0.95, accent: 4 });
    } else {
      lay(w, 'horn', 0, THEME, 100 + lead * 2, { ...part, legato: 0.95 });
      if (lead === 2)
        bars.forEach((held, bar) => w.note('fiddle', bar, 0, BEATS * 0.96, CHORDS[chordAt(held, 0)].air[2] ?? 74, 78));
      else lay(w, 'fiddle', 0, COUNTER, 82, { ...part, legato: 0.95, accent: 4 });
    }
    if (half || lead) lay(w, 'brass', 0, THEME, 84, { ...part, legato: 0.95, accent: 4 });
  } else if (section === 'b') {
    if (lead === 2) {
      lay(w, 'fiddle', 0, FIDDLE_TUNE, 98, { to: 4, legato: 0.95 });
      lay(w, 'horn', 0, HORN_UNDER, 84, { to: 4, legato: 0.97, accent: 4 });
      lay(w, 'horn', 4, FIDDLE_TUNE, 96, { from: 4, octave: -1, legato: 0.95 });
      lay(w, 'fiddle', 4, HORN_UNDER, 80, { from: 4, octave: 1, legato: 0.97, accent: 4 });
    } else {
      lay(w, lead ? 'horn' : 'fiddle', 0, FIDDLE_TUNE, 98, { octave: -lead, legato: 0.95 });
      lay(w, lead ? 'fiddle' : 'horn', 0, HORN_UNDER, 84, { octave: lead, legato: 0.97, accent: 4 });
    }
    lay(w, 'brass', 0, HORN_UNDER, 76, { legato: 0.97, accent: 4 });
  } else if (section === 'break') {
    lay(w, lead ? 'fiddle' : 'horn', 0, BREAK_CALL, 98, { octave: lead, legato: 0.95 });
    lay(w, 'horn', 4, BREAK_CALL, 96, { legato: 0.95 });
  } else lay(w, lead ? 'fiddle' : 'horn', 0, DOWN_LINE, lead ? 78 : 84, { octave: lead, legato: 0.97, accent: 4 });
}

/** The takes, each section in two or three feels: no two takes of a section share a feel. */
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
];

/** The fight: every take, every layer in its role. */
const fight = (): Song =>
  makeForm(
    { ...SONG, name: 'cold-fight', level: LEVEL },
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
          tunes(w, bars, line);
        },
      };
    }),
  );

/** The cadence: the tune's last bars, C to F sharp minor and home to the low B, the fiddle stepping down to it. */
const cadence = (): Song =>
  makeSong({ ...SONG, name: 'cold-cadence', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('C/F#m | Bm | Bm'), 0.9);
    lay(w, 'horn', 0, tune('E4:2 G4:1 F#4:2 | B3:5'), 92, { legato: 0.98 });
    lay(w, 'fiddle', 0, tune('G5:3 F#5:2 | F#5:1 E5:1 D5:1 C#5:1 B4:1 | B4:5'), 76, { legato: 0.98 });
    w.note('timpani', 1, 0, 0.9, 'B2', 86);
    w.hit('heart', 1, 0, 80);
    w.hit('heart', 2, 0, 60);
  });

/** The victory: the horn rising through G and A to B major, its D sharp bright, the taiko and the brass under it. */
const victory = (): Song =>
  makeSong({ ...SONG, name: 'cold-victory', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('G | A | B | B'), 1);
    const rise = tune('D4:1 G4:2 B4:1 A4:1 | C#5:1 A4:2 E4:1 F#4:1 | D#5:3 C#5:1 D#5:1 | B4:5');
    lay(w, 'horn', 0, rise, 106);
    lay(w, 'brass', 0, rise, 92);
    lay(w, 'fiddle', 0, rise, 90, { octave: 1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 0, 2, bar === 1 ? 0 : null);
    w.note('timpani', 2, 0, 0.9, 'B2', 112);
    w.hit('taiko', 2, 0, 120);
    w.hit('crash', 2, 0, 106);
  });

/** The defeat: the call once more, falling through C to the low B, the gusts and the slowing heart left. */
const defeat = (): Song =>
  makeSong({ ...SONG, name: 'cold-defeat', bars: 5, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Bm | C | Em | Bm | Bm'), 0.7);
    lay(w, 'horn', 0, tune('B3:1 F#4:2 E4:1 D4:1 | E4:3 C4:2 | B3:5'), 82, { legato: 0.98 });
    w.hit('gust', 1, 0, 66);
    for (const [bar, velocity] of [
      [0, 92],
      [1, 78],
      [3, 60],
    ] as const)
      w.hit('heart', bar, 0, velocity);
  });

/** Cold's fight score: the fight, and its cadence, victory and defeat. */
export const coldScore = () => ({ song: fight(), cadence: cadence(), victory: victory(), defeat: defeat() });
