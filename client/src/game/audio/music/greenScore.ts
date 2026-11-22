// Green: the fight on the windswept coast, the highland and the woodland. E Dorian (E minor with a raised sixth, the
// piper's C sharp) in 6/8 at a dotted quarter of 104: a war jig. The fiddle's tune runs over the cellos' gallop with
// the horn's counter-line under it, a bodhran and a big drum driving it; danger near is strings gated in sixteenths
// over a low heartbeat; the peak sets the choir and the low brass's stabs under the tune and swells noise into each
// section. It is written in takes of eight bars (form.ts): vamps, the tune's halves, the horn's tune's halves, a break
// of horn calls and a breakdown, each in a feel of its own (a groove, fills, a gallop, a bass, a voicing, a gate and a
// heartbeat), the tune answered or turned to new chords in some. The cadence turns the tune's hemiola home, the
// victory ends it in E major, the defeat lets the call fall to the low strings.

import { chordAt, type Held, keys, roll, runsOf } from './craft.ts';
import { type TakeSpec, makeForm } from './form.ts';
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
} from './greenParts.ts';
import { type Song, lay, makeSong, midiNote } from './score.ts';

type Section = 'vamp' | 'a1' | 'a2' | 'b1' | 'b2' | 'break' | 'down';
/** Each section's harmony, and a second under the same tune where a take turns it; the sections that may follow it,
 *  and whether a fight may open on it: on the vamp, or straight on the horn's calls. */
const SECTIONS: Readonly<
  Record<Section, { harmony: string; turn?: string; next: readonly Section[]; opens?: boolean }>
> = {
  vamp: { harmony: 'Em | Em | C | D | Em | Em | C | D', next: ['a1', 'b1'], opens: true },
  a1: {
    harmony: 'Em | Em | G | D/Em | Em | Em | C/D | A',
    turn: 'Em | C | G | D/Em | Em | C | Am/D | A',
    next: ['a2'],
  },
  a2: {
    harmony: 'C | D | Em | A | C | D | C/D/Em | Em',
    turn: 'Am | Bm | G | A | Am | Bm | C/D/Em | Em',
    next: ['b1', 'break', 'down', 'a1'],
  },
  b1: { harmony: 'C | G | D | Em | C/D | G | A | Bm', next: ['b2'] },
  b2: { harmony: 'C/G | Am/Em | Am/D | Em | C | G | A | Bm', next: ['a1', 'break', 'down'] },
  break: { harmony: 'Em | Em | C/D | Em | Em | Em | C | D', next: ['a1', 'b1', 'vamp'], opens: true },
  down: { harmony: 'Em | Em | C | C | Em | Em | D | D', next: ['a1', 'b1', 'break', 'vamp'] },
};

/** The tune: a call (E, E, B, A), its rise to the high E, and the gale, falling in a hemiola to its close. */
const THEME = tune(
  'E4:1 E4:.5 B4:1 A4:.5 | G4:.5 A4:.5 B4:.5 E5:1.5 | D5:1 B4:.5 A4:1 G4:.5 | F#4:1 D4:.5 E4:1.5' +
    ' | E4:1 E4:.5 B4:1 A4:.5 | G4:.5 A4:.5 B4:.5 E5:1 F#5:.5 | G5:1 F#5:.5 E5:1 D5:.5 | C#5:1 B4:.5 A4:1.5' +
    ' | G5:1.5 E5:1.5 | F#5:1 E5:.5 D5:1.5 | E5:1 D5:.5 B4:1 G4:.5 | A4:1 B4:.5 C#5:1 D5:.5' +
    ' | E5:1.5 G5:1.5 | A5:1 G5:.5 F#5:1.5 | G5:1 F#5:1 E5:1 | E5:3',
);
/** The horn under it, moving where the tune holds and holding where it moves. */
const COUNTER = tune(
  'B3:3 | G3:1.5 A3:.5 B3:.5 D4:.5 | D4:1.5 B3:1.5 | A3:1.5 B3:.5 A3:.5 G3:.5' +
    ' | B3:3 | G3:1.5 B3:.5 C#4:.5 D4:.5 | E4:1.5 F#4:1.5 | E4:1.5 C#4:1.5' +
    ' | E4:1 D4:.5 C4:1.5 | A3:1.5 D4:1.5 | B3:1.5 G3:1.5 | A3:1 C#4:.5 E4:1.5' +
    ' | G4:1.5 E4:1.5 | F#4:1.5 A4:.5 G4:.5 F#4:.5 | E4:1 D4:1 B3:1 | G3:.5 A3:.5 B3:.5 E4:1.5',
);
/** The horn's own tune, broad over the gallop, its last phrase lifting to the Dorian C sharp. */
const HORN_TUNE = tune(
  'G4:1.5 E4:1.5 | D4:1.5 G4:1.5 | F#4:2 E4:.5 D4:.5 | E4:3' +
    ' | G4:1.5 A4:1.5 | B4:1.5 D5:1.5 | C#5:2 B4:.5 A4:.5 | B4:3' +
    ' | E5:1.5 D5:1.5 | C5:1.5 B4:1.5 | A4:1 B4:.5 C5:1 D5:.5 | B4:3' +
    ' | C5:1.5 E5:1.5 | D5:1 C5:.5 B4:1.5 | A4:1 B4:1 C#5:1 | B4:3',
);
/** The horn held under the fiddle when the fiddle takes the horn's tune: each chord's third or fifth, low. */
const HORN_HOLD = tune('E4:3 | D4:3 | D4:3 | B3:3 | C4:1.5 D4:1.5 | D4:3 | C#4:3 | B3:3');
const HORN_HOLD_LATE = tune('E4:1.5 D4:1.5 | C4:1.5 B3:1.5 | C4:1.5 D4:1.5 | B3:3 | E4:3 | D4:3 | C#4:3 | B3:3');
/** The break's horn call and the fiddle's answer. */
const CALL = tune('E4:1 E4:.5 B4:1 A4:.5 | G4:3 | r:3 | r:3 | E4:1 E4:.5 B4:1 A4:.5 | B4:1.5 D5:1.5 | E5:3 | r:3');
const ANSWER = tune('r:3 | r:3 | B4:.5 A4:.5 G4:.5 F#4:1 E4:.5 | E4:3 | r:3 | r:3 | r:3 | r:1.5 B3:.5 C#4:.5 D4:.5');
/** A vamp's line, the fiddle readying the tune; and the breakdown's call, slowed, alone over the gallop. */
const VAMP_LINE = tune('B4:1.5 G4:1.5 | E4:3 | E4:1.5 G4:1.5 | F#4:1.5 A4:1.5');
const DOWN_LINE = tune('E4:1.5 B4:1.5 | A4:1 G4:.5 E4:1.5 | r:3 | r:3 | E4:1.5 B4:1.5 | D5:1 B4:.5 A4:1.5 | r:3 | r:3');

/** A feel: the gate's sixteenths (beat, weight) and the heartbeat under them, the bars the high tremolo holds, the
 *  cellos' gallop (beat, lift over the root, velocity), the bass's figure and the strings' voicing (its top an octave
 *  down, or its root an octave up). The drums' groove is the feel's too. */
interface Feel {
  readonly gate: readonly (readonly [number, number])[];
  readonly heart: readonly (readonly [number, number])[];
  readonly trem: readonly number[];
  readonly gallop: readonly (readonly [number, number, number])[];
  readonly bass: 'held' | 'struck' | 'jig';
  readonly voicing: 0 | 1 | 2;
}
const FEELS: readonly Feel[] = [
  {
    gate: [
      [0, 1],
      [0.5, 0.62],
      [0.75, 0.8],
      [1.25, 0.62],
      [1.5, 0.95],
      [2, 0.62],
      [2.25, 0.8],
      [2.75, 0.66],
    ],
    heart: [
      [0, 96],
      [0.5, 70],
    ],
    trem: [6, 7],
    gallop: [
      [0, 0, 96],
      [0.5, 0, 58],
      [1, 7, 72],
      [1.5, 0, 90],
      [2, 12, 66],
      [2.5, 7, 70],
    ],
    bass: 'held',
    voicing: 0,
  },
  {
    gate: [
      [0, 1],
      [0.25, 0.6],
      [0.75, 0.8],
      [1, 0.62],
      [1.5, 0.95],
      [1.75, 0.6],
      [2.25, 0.8],
      [2.5, 0.66],
    ],
    heart: [
      [0, 96],
      [1.5, 72],
    ],
    trem: [3, 7],
    gallop: [
      [0, 0, 96],
      [0.5, 12, 62],
      [1, 0, 70],
      [1.5, 7, 88],
      [2, 0, 64],
      [2.5, 12, 72],
    ],
    bass: 'struck',
    voicing: 1,
  },
  {
    gate: [
      [0, 1],
      [0.5, 0.7],
      [1, 0.8],
      [1.5, 0.95],
      [2, 0.7],
      [2.5, 0.84],
    ],
    heart: [
      [0, 92],
      [0.5, 64],
      [1.5, 80],
    ],
    trem: [2, 5, 6],
    gallop: [
      [0, 0, 96],
      [0.25, 0, 52],
      [0.5, 0, 66],
      [1, 7, 76],
      [1.5, 0, 90],
      [1.75, 0, 52],
      [2, 0, 64],
      [2.5, 7, 72],
    ],
    bass: 'jig',
    voicing: 2,
  },
];

/** Each feel's groove: [drum, beat, velocity, the least drive it plays at]. */
const GROOVES: readonly (readonly (readonly [Drum, number, number, number])[])[] = [
  [
    ['kick', 0, 112, 1],
    ['bodhran', 0, 100, 1],
    ['bodhran', 1.5, 90, 1],
    ['bodhranTop', 0.5, 60, 1],
    ['bodhranTop', 1, 74, 1],
    ['bodhranTop', 2, 62, 1],
    ['bodhranTop', 2.5, 76, 1],
    ['kick', 2.5, 84, 2],
    ['snare', 1.5, 94, 2],
    ['bodhranTop', 2.75, 50, 2],
    ['kick', 1, 88, 3],
    ['snare', 2.75, 52, 3],
  ],
  [
    ['kick', 0, 110, 1],
    ['bodhran', 0, 100, 1],
    ['bodhranTop', 0.5, 66, 1],
    ['bodhranTop', 0.75, 48, 1],
    ['bodhranTop', 1, 72, 1],
    ['bodhran', 1.5, 92, 1],
    ['bodhranTop', 2, 60, 1],
    ['bodhran', 2.5, 80, 1],
    ['kick', 1.5, 82, 2],
    ['snare', 1.5, 90, 2],
    ['bodhranTop', 2.25, 46, 2],
    ['kick', 2, 80, 3],
    ['snare', 2.5, 58, 3],
    ['snare', 2.75, 64, 3],
  ],
  [
    ['kick', 0, 112, 1],
    ['kick', 1, 70, 1],
    ['bodhran', 0, 96, 1],
    ['bodhran', 2, 84, 1],
    ['bodhranTop', 0.5, 58, 1],
    ['bodhranTop', 1.5, 70, 1],
    ['bodhranTop', 2.5, 64, 1],
    ['snare', 1.25, 48, 2],
    ['snare', 1.5, 96, 2],
    ['kick', 2.5, 86, 2],
    ['lowTom', 2.5, 70, 2],
    ['kick', 1.75, 78, 3],
    ['snare', 2.75, 56, 3],
    ['bodhranTop', 2.75, 52, 3],
  ],
];
/** The fills closing a bar's second half: down the toms in sixteenths, the bodhran rolling up, the toms in eighths. */
const FILLS: readonly (readonly (readonly [Drum, number, number])[])[] = [
  (['highTom', 'highTom', 'midTom', 'midTom', 'lowTom', 'lowTom'] as const).map((tom, i) => [
    tom,
    1.5 + i * 0.25,
    82 + i * 5,
  ]),
  Array.from({ length: 6 }, (unused, i) => ['bodhran', 1.5 + i * 0.25, 60 + i * 8] as const),
  [
    ['highTom', 1.5, 90],
    ['midTom', 2, 94],
    ['lowTom', 2.5, 100],
    ['kick', 2.5, 90],
    ['snare', 2.75, 72],
  ],
];

/** A bar of drums in groove `groove` at `drive` (0 the breakdown's top alone), and fill `fill` if one closes it. */
function drums(w: Write, bar: number, groove: number, drive: number, fill: number | null): void {
  if (drive === 0) {
    w.hit('bodhranTop', bar, 1, 48);
    w.hit('bodhranTop', bar, 2.5, 56);
  }
  for (const [drum, beat, velocity, least] of GROOVES[groove] ?? [])
    if (drive >= least) w.hit(drum, bar, beat, velocity);
  if (fill !== null) for (const [drum, beat, velocity] of FILLS[fill] ?? []) w.hit(drum, bar, beat, velocity);
}

/** A chord's strings in a voicing: close, its top an octave down, or its root an octave up. */
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
}

/** The bars under the tunes: the bed in the feel's bass and voicing, the gate, the heartbeat and the tremolo, the
 *  gallop, the drums and timpani, and the peak's choir, stabs and the swell into the next take. */
function underneath(w: Write, bars: readonly Held<Chord>[][], { section, feel, drive }: Line): void {
  const { gate, heart, trem, gallop, bass, voicing } = FEELS[feel] ?? FEELS[0]!;
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    if (bass === 'held') w.note('bass', bar, beat, beats, tones.bass, 88);
    for (const n of voiced(tones.pad, voicing)) w.note('strings', bar, beat, beats, n, section === 'break' ? 64 : 56);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 66);
  }
  bars.forEach((held, bar) => {
    const chordOn = (beat: number) => CHORDS[chordAt(held, beat)];
    const driven = section === 'break' && bar < 4 ? 1 : drive;
    if (bass === 'struck')
      for (const beat of [0, 1.5]) w.note('bass', bar, beat, 1.3, chordOn(beat).bass, beat ? 80 : 90);
    if (bass === 'jig')
      for (const [beat, beats, lift, velocity] of [
        [0, 0.95, 0, 90],
        [1, 0.45, 7, 70],
        [1.5, 0.95, 0, 84],
        [2.5, 0.45, 12, 70],
      ] as const)
        w.note('bass', bar, beat, beats, midiNote(chordOn(beat).bass) + lift, velocity);
    for (const { chord: name, beat } of held)
      w.note('timpani', bar, beat, 0.9, CHORDS[name].timp, (beat ? 86 : 100) * (driven ? 1 : 0.7));
    for (const [beat, weight] of gate)
      for (const n of chordOn(beat).gate) w.note('gate', bar, beat, 0.2, n, 84 * weight);
    for (const [beat, velocity] of heart) w.hit('heart', bar, beat, velocity);
    for (const [beat, lift, velocity] of gallop)
      w.note('ostinato', bar, beat, 0.42, chordOn(beat).ost + lift, velocity * (driven ? 1 : 0.82));
    const fills = bar % 4 === 3 && (driven > 0 || bar === 7);
    drums(w, bar, feel, driven, fills ? (feel + (bar >> 2)) % FILLS.length : null);
    // Two octaves under their voicing: held high, these strings were a whine.
    if (trem.includes(bar)) for (const n of chordOn(0).trem) w.note('trem', bar, 0, 3, n - 24, 58);
    if (bar === bars.length - 1) {
      roll((beat, velocity) => w.note('timpani', bar, beat, 0.22, chordOn(1.5).timp, velocity), 1.5, 1.5, 50, 96);
      w.hit('riser', bars.length, -(1.6 * BPM) / 60, 84);
    }
    if (bar === 0 && driven > 0) w.hit('crash', bar, 0, 100);
    if (bar % 2 === 0 && section !== 'vamp' && driven > 0)
      for (const n of chordOn(0).brass) w.note('lowBrass', bar, 0, bar === 0 ? 2.8 : 1.3, n, bar === 0 ? 108 : 94);
  });
}

/** The fiddle's descant over a bar of the horn's tune: an arpeggio's tones in eighths, from the top. */
function descant(w: Write, bar: number, held: readonly Held<Chord>[]): void {
  [2, 1, 0, 1, 2, 1].forEach((index, i) =>
    w.note('fiddle', bar, i * 0.5, 0.42, CHORDS[chordAt(held, i * 0.5)].arp[index] ?? 0, 72),
  );
}

/** The tunes over a take. The tune's halves: the fiddle's over the horn's counter-line; or answered, the horn taking
 *  its second four bars an octave under while the fiddle takes the counter-line over; or in octaves over the turned
 *  chords. The horn's tune under the fiddle's descant, or the fiddle an octave over it, or the fiddle taking it over
 *  the horn held low. The break's calls, the horn's or the fiddle's; the breakdown's call alone; a vamp's entry. */
function tunes(w: Write, bars: readonly Held<Chord>[][], { section, lead }: Line): void {
  const half = section === 'a2' || section === 'b2' ? 8 : 0;
  const part = { from: half, to: half + 8 };
  if (section === 'vamp') {
    if (lead === 1) lay(w, 'horn', 4, CALL, 90, { to: 2 });
    if (lead === 2) lay(w, 'fiddle', 4, VAMP_LINE, 80, { legato: 0.97, accent: 4 });
  } else if ((section === 'a1' || section === 'a2') && lead === 1) {
    lay(w, 'fiddle', 0, THEME, 100, { from: half, to: half + 4, legato: 0.9 });
    lay(w, 'horn', 0, COUNTER, 80, { from: half, to: half + 4, legato: 0.96, accent: 4 });
    lay(w, 'horn', 4, THEME, 98, { from: half + 4, to: half + 8, octave: -1, legato: 0.94 });
    lay(w, 'fiddle', 4, COUNTER, 78, { from: half + 4, to: half + 8, octave: 1, legato: 0.95, accent: 4 });
  } else if (section === 'a1' || section === 'a2') {
    lay(w, 'fiddle', 0, THEME, lead ? 104 : 100, { ...part, legato: 0.9 });
    if (lead === 2) lay(w, 'horn', 0, THEME, 88, { ...part, octave: -1, legato: 0.92, accent: 4 });
    else lay(w, 'horn', 0, COUNTER, 80, { ...part, legato: 0.96, accent: 4 });
  } else if ((section === 'b1' || section === 'b2') && lead === 2) {
    lay(w, 'fiddle', 0, HORN_TUNE, 96, { ...part, legato: 0.95 });
    lay(w, 'horn', 0, half ? HORN_HOLD_LATE : HORN_HOLD, 80, { legato: 0.97, accent: 4 });
  } else if (section === 'b1' || section === 'b2') {
    lay(w, 'horn', 0, HORN_TUNE, 96 + lead * 4, { ...part, legato: 0.97 });
    if (lead === 1) lay(w, 'fiddle', 0, HORN_TUNE, 94, { ...part, octave: 1, legato: 0.95 });
    else bars.forEach((held, bar) => descant(w, bar, held));
  } else if (section === 'break') {
    lay(w, lead ? 'fiddle' : 'horn', 0, CALL, lead ? 98 : 96);
    lay(w, lead ? 'horn' : 'fiddle', 0, ANSWER, 90, { octave: lead ? -1 : 0 });
  } else lay(w, lead ? 'horn' : 'fiddle', 0, DOWN_LINE, lead ? 84 : 78, { octave: -lead, legato: 0.97, accent: 4 });
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
];

/** The fight: every take, every layer in its role. */
const fight = (): Song =>
  makeForm(
    { ...SONG, name: 'green-fight', level: LEVEL },
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

/** The cadence, the fight over with no foe felled: the gale's hemiola over its rising bass, home to E minor. */
const cadence = (): Song =>
  makeSong({ ...SONG, name: 'green-cadence', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('C/D/Em | Em | Em'), 0.9);
    lay(w, 'fiddle', 0, tune('G5:1 F#5:1 E5:1'), 90, { legato: 0.98 });
    w.note('fiddle', 1, 0, 6, 'E5', 84);
    lay(w, 'horn', 0, tune('E4:1 D4:1 B3:1 | B3:3 | G3:3'), 80, { legato: 0.98 });
    w.note('timpani', 1, 0, 0.9, 'E2', 84);
    w.hit('heart', 1, 0, 80);
    w.hit('heart', 2, 0, 60);
  });

/** The victory: the call on the horn and the fiddle together, a step up to E major, the drums and a crash on it. */
const victory = (): Song =>
  makeSong({ ...SONG, name: 'green-victory', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Em | C/D | E | E'), 1);
    const call = tune('E4:1 E4:.5 B4:1 A4:.5 | B4:1.5 A4:1.5 | G#4:3 | G#4:3');
    lay(w, 'horn', 0, call, 104);
    lay(w, 'fiddle', 0, call, 102, { octave: 1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 0, 2, bar === 1 ? 0 : null);
    roll((beat, velocity) => w.note('timpani', 1, beat, 0.22, 'B2', velocity), 1.5, 1.5, 60, 104);
    w.note('timpani', 2, 0, 0.9, 'E2', 112);
    for (const n of keys('E2 B2')) w.note('lowBrass', 2, 0, 5.5, n, 108);
    w.hit('kick', 2, 0, 116);
    w.hit('crash', 2, 0, 108);
  });

/** The defeat: the call once more on the horn, softly, falling a step a bar to the low strings, the heart slowing. */
const defeat = (): Song =>
  makeSong({ ...SONG, name: 'green-defeat', bars: 6, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Em | C | Am | Em | Em | Em'), 0.7, 3);
    lay(w, 'horn', 0, tune('E4:1 E4:.5 B4:1 A4:.5 | G4:3 | E4:1.5 C4:1.5 | B3:3'), 78, { legato: 0.98 });
    lay(w, 'bass', 3, tune('E3:1.5 D3:1.5 | C3:1.5 B2:1.5 | E2:3'), 70, { legato: 0.98 });
    for (const [bar, velocity] of [
      [0, 92],
      [1, 80],
      [3, 66],
      [5, 50],
    ] as const)
      w.hit('heart', bar, 0, velocity);
  });

/** Green's fight score: the fight, and its cadence, victory and defeat. */
export const greenScore = () => ({ song: fight(), cadence: cadence(), victory: victory(), defeat: defeat() });
