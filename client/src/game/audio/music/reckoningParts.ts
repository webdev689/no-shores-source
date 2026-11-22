// The Reckoning's clockwork and its harmony: the instruments, the kit, the chords in C minor, the broken and the
// mended chime, the three themes, and the figures each song is built from (the chime, the escapement, the floor, the
// war's drums), each that keeps time in three feels; the songs are reckoningScore.ts.

import { type Press, type Tune, type Writer, lay, midiNote, tune } from './score.ts';

export type Track =
  'clock' | 'bass' | 'strings' | 'brass' | 'choir' | 'organ' | 'timpani' | 'chime' | 'bells' | 'horn' | 'harp' | 'hit';
export type Drum =
  | 'kick'
  | 'snare'
  | 'lowTom'
  | 'highFloorTom'
  | 'tom'
  | 'lowMidTom'
  | 'hiMidTom'
  | 'crash'
  | 'chinese'
  | 'rideBell'
  | 'claves'
  | 'tick'
  | 'tock'
  | 'surdo';
export type Write = Writer<Track, Drum>;

/** The escapement left, the chime further left, the bells and the strings right: a clock's face across the stereo. */
export const TRACKS = {
  clock: { program: 6, volume: 100, pan: 44, role: 'pulse' },
  bass: { program: 32, volume: 98, pan: 64, role: 'bed' },
  strings: { program: 48, volume: 104, pan: 84, role: 'bed' },
  brass: { program: 61, volume: 120, pan: 58, role: 'lead' },
  choir: { program: 52, volume: 110, pan: 72, role: 'peak' },
  organ: { program: 19, volume: 84, pan: 64, role: 'bed' },
  timpani: { program: 47, volume: 112, pan: 64, role: 'combat' },
  chime: { program: 10, volume: 106, pan: 34, role: 'tension' },
  bells: { program: 14, volume: 98, pan: 92, role: 'tension' },
  horn: { program: 60, volume: 112, pan: 70, role: 'peak' },
  harp: { program: 46, volume: 94, pan: 40, role: 'bed' },
  hit: { program: 55, volume: 106, pan: 64, role: 'peak' },
} as const;

/** The clock's woods (the tick, the tock) and the surdo are the tension's; the rest of the kit is the fight's. */
export const KIT = {
  volume: 112,
  role: 'combat',
  roles: { tick: 'tension', tock: 'tension', surdo: 'tension' },
  keys: {
    kick: 36,
    snare: 38,
    lowTom: 41,
    highFloorTom: 43,
    tom: 45,
    lowMidTom: 47,
    hiMidTom: 48,
    crash: 49,
    chinese: 52,
    rideBell: 53,
    claves: 75,
    tick: 76,
    tock: 77,
    surdo: 87,
  },
} as const;

/** A gentle compressor (4:1 over a wide knee) and a soft ceiling three decibels under the clip; DRIVE sets the first
 *  phase at -18.5 dBFS, the others keeping their rise over it. */
const PRESS = { threshold: -18, knee: 12, ratio: 4, attack: 0.003, release: 0.25, ceiling: -3 } as const;
const DRIVE = 0.36;
export const press = (out: number): Press => ({ ...PRESS, out: out * DRIVE });
export const SPEC = {
  tracks: TRACKS,
  kit: KIT,
  edge: { wrap: true, clip: false, hold: false, restrike: false },
} as const;

export const notes = (text: string): readonly string[] => text.split(' ');

/** The chime, a change a bar: broken, and mended. */
export const BROKEN = ['Eb5 D5 C5 G4', 'C5 Eb5 D5 G4', 'Eb5 C5 D5 G4', 'G4 D5 Eb5 F#5'].map(notes);
export const MENDED = ['E5 D5 C5 G4', 'C5 E5 D5 G4', 'E5 C5 D5 G4', 'G4 D5 E5 C5'].map(notes);

/** A chord's bass and timpani, its pad (the organ), the strings' and the choir's voicings, its escapement (eight
 *  eighths, the root's swing against its fifth and a turn at the end), its stab, and the fall's harp, up and back. */
const chord = (bass: string, timp: string, pad: string, str: string, choir: string, clock: string, stab: string) => ({
  bass,
  timp,
  pad: notes(pad),
  str: notes(str),
  choir: notes(choir),
  clock: notes(clock),
  stab: notes(stab),
});
export const CHORDS = {
  Cm: chord('C2', 'C2', 'C3 G3 C4', 'C4 Eb4 G4', 'C3 G3 Eb4', 'C4 G3 Eb4 G3 C4 G3 D4 G3', 'C3 G3 C4'),
  Aaug: chord('Ab1', 'C2', 'Ab2 E3 C4', 'C4 E4 Ab4', 'Ab2 E3 C4', 'C4 Ab3 E4 Ab3 C4 Ab3 E4 Ab3', 'Ab2 E3 C4'),
  Fm: chord('F1', 'F2', 'F2 C3 F3', 'C4 F4 Ab4', 'F2 C3 Ab3', 'C4 F3 Ab3 F3 C4 F3 Bb3 F3', 'F2 C3 F3'),
  G: chord('G1', 'G2', 'G2 D3 G3', 'B3 D4 G4', 'G2 D3 B3', 'B3 G3 D4 G3 B3 G3 F4 G3', 'G2 D3 G3'),
  Db: chord('Db2', 'Ab2', 'Db3 Ab3 Db4', 'Db4 F4 Ab4', 'Db3 Ab3 F4', 'Db4 Ab3 F4 Ab3 Db4 Ab3 C4 Ab3', 'Db3 Ab3 Db4'),
  Bbm: chord('Bb1', 'F2', 'Bb2 F3 Bb3', 'Db4 F4 Bb4', 'Bb2 F3 Db4', 'Db4 Bb3 F4 Bb3 Db4 Bb3 C4 Bb3', 'Bb2 F3 Bb3'),
  E: chord('E2', 'B2', 'E3 B3 E4', 'E4 G#4 B4', 'E3 B3 G#4', 'E4 B3 G#4 B3 E4 B3 F#4 B3', 'E3 B3 E4'),
  Ab: chord('Ab1', 'Eb2', 'Ab2 Eb3 Ab3', 'C4 Eb4 Ab4', 'Ab2 Eb3 C4', 'C4 Ab3 Eb4 Ab3 C4 Ab3 Bb3 Ab3', 'Ab2 Eb3 Ab3'),
  C: chord('C2', 'C2', 'C3 G3 E4', 'C4 E4 G4', 'C3 G3 E4', 'C4 G3 E4 G3 C4 G3 D4 G3', 'C4 E4 G4'),
};
export type ChordName = keyof typeof CHORDS;
export const FALL_HARP = notes('C3 G3 C4 E4 G4 E4 C4 G3');

/** The progressions, a chord a bar: the first phase's (C minor, the augmented, the minor four, the dominant, the
 *  Neapolitan), the canon's (to E major, a third apart), the third's, and the last's. */
export const progression = (text: string): readonly ChordName[] => text.split(' ') as ChordName[];
export const FIRST = progression('Cm Aaug Fm G Cm Db G G');
export const CANON = progression('Cm E Cm Ab Fm Db G G');
export const THIRD = progression('Cm Db Bbm Db Fm Aaug G G');
export const LAST = progression('Cm Db Cm Db Cm Db G G');

/** The theme three ways: opening on the chime's own first notes, low, leaning on E natural against E-flat; dotted and
 *  climbing for the canon; in eighths, up the chord and down, for the third phase. */
export const THEME_ONE = tune(
  'C4:1 G3:1 Eb4:1.5 D4:.5 | C4:2 E4:1 Ab4:1 | F4:1.5 Ab4:.5 G4:1 F4:1 | D4:2 B3:1 G3:1 | Eb4:1 D4:1 C4:1 G3:1 | Db4:2 F4:1 Ab4:1 | G4:1.5 F4:.5 Eb4:1 D4:1 | D4:2 G3:1 B3:1',
);
export const THEME_TWO = tune(
  'G4:.75 G4:.25 Eb4:1 C4:1 G4:1 | G#4:.75 G#4:.25 B4:1 E5:2 | G4:.75 Eb4:.25 C5:1 Bb4:1 G4:1 | Ab4:2 C5:1 Eb5:1 | F4:.75 F4:.25 Ab4:1 C5:1 Db5:1 | Db5:1.5 C5:.5 Ab4:1 F4:1 | G4:1 B4:1 D5:1 F5:1 | Eb5:2 D5:1 B4:1',
);
export const THEME_THREE = tune(
  'C5:.5 C5:.5 D5:.5 Eb5:.5 G5:1 C5:1 | Db5:1 F5:.5 Ab5:.5 F5:1 Db5:1 | Bb4:.5 Bb4:.5 Db5:.5 F5:.5 Bb5:1 F5:1 | Ab5:1 F5:1 Db5:1 Ab4:1 | F5:.5 G5:.5 Ab5:.5 G5:.5 F5:1 C5:1 | E5:1 Ab5:1 C6:1 Ab5:1 | B4:.5 D5:.5 F5:.5 Ab5:.5 G5:1 F5:1 | G5:2 F#5:1 G5:1',
);
/** A theme's bars, `late` beats behind for the canon's echo (which runs round its take's seam), bars `from` to `to`
 *  of it from bar `first`. */
export const theme = (
  w: Write,
  first: number,
  bars: Tune,
  track: Track,
  velocity: number,
  { octave = 0, late = 0, from = 0, to = bars.length } = {},
) => lay(w, track, first, bars, velocity, { octave, late, accent: 10, from, to });

/** A change of the chime on a track, a note a beat. */
export function chimeBar(w: Write, bar: number, change: readonly string[], track: Track, velocity: number, octave = 0) {
  change.forEach((n, i) => w.note(track, bar, i, 0.95, midiNote(n) + 12 * octave, velocity - i * 3));
}

/** The clock's three feels: which of the chord's eight escapement notes each eighth strikes, and each sixteenth when
 *  it races; the woods' ticks and tocks; the surdo's beats; the bass's strikes; the strings' voicing; the kick in
 *  half time and in full; and the fill closing each fourth bar. */
export const FEELS = [
  {
    eighths: [0, 1, 2, 3, 4, 5, 6, 7],
    sixteenths: [0, 1, 2, 3, 4, 5, 6, 7],
    woods: [
      [0, 'tick', 84],
      [1, 'tock', 76],
      [2, 'tick', 84],
      [3, 'tock', 76],
    ],
    surdo: [0],
    bass: [
      [0, 1.8],
      [2, 1.8],
    ],
    voicing: 0,
    half: [0, 0.75, 1.5],
    full: [0, 0.75, 1.5, 2, 2.75, 3.5],
    fill: 'down',
  },
  {
    eighths: [0, 1, 2, 1, 0, 1, 6, 7],
    sixteenths: [0, 3, 6, 1, 4, 7, 2, 5],
    woods: [
      [0, 'tick', 84],
      [0.75, 'tock', 70],
      [1.5, 'tick', 80],
      [2.25, 'tock', 70],
      [3, 'tick', 82],
    ],
    surdo: [0, 2.5],
    bass: [
      [0, 2.8],
      [3, 0.9],
    ],
    voicing: 1,
    half: [0, 1, 1.75],
    full: [0, 0.75, 1.5, 2.5, 3.25],
    fill: 'snare',
  },
  {
    eighths: [0, 1, 0, 3, 4, 1, 6, 5],
    sixteenths: [0, 1, 2, 1, 4, 5, 6, 5],
    woods: [
      [0, 'tick', 80],
      [0.5, 'tock', 64],
      [1, 'tick', 70],
      [2, 'tick', 80],
      [2.5, 'tock', 64],
      [3, 'tick', 70],
    ],
    surdo: [0, 3],
    bass: [
      [0, 0.9],
      [1, 0.9],
      [2, 1.8],
    ],
    voicing: 2,
    half: [0, 0.5, 1.5],
    full: [0, 1, 1.75, 2, 3],
    fill: 'eighths',
  },
] as const;
const feelOf = (feel: number) => FEELS[feel] ?? FEELS[0];

/** The escapement under a chord for a bar in a feel, in eighths or sixteenths, the bar's first and each half's first
 *  accented. */
export function escapement(w: Write, bar: number, name: ChordName, { fast = false, vel = 1, feel = 0 } = {}): void {
  const clock = CHORDS[name].clock;
  const { eighths, sixteenths } = feelOf(feel);
  if (fast)
    for (let sixteenth = 0; sixteenth < 16; sixteenth++) {
      const accent = sixteenth % 8 === 0 ? 100 : sixteenth % 4 === 0 ? 88 : 72;
      w.note('clock', bar, sixteenth * 0.25, 0.2, clock[sixteenths[sixteenth % 8] ?? 0] ?? 'C4', accent * vel);
    }
  else
    eighths.forEach((index, i) =>
      w.note('clock', bar, i * 0.5, 0.42, clock[index] ?? 'C4', (i === 0 ? 98 : i === 4 ? 88 : 74) * vel),
    );
}

/** The chord's floor for a bar in a feel: its bass struck, its pad, and if asked its strings (in the voicing of the
 *  feel `voicingShift` on from its own) and its choir. */
export function floorBar(
  w: Write,
  bar: number,
  name: ChordName,
  { strings = false, choir = false, organ = 1, vel = 1, feel = 0, voicingShift = 0 } = {},
) {
  const tones = CHORDS[name];
  const { bass } = feelOf(feel);
  const { voicing } = feelOf((feel + voicingShift) % FEELS.length);
  for (const [beat, beats] of bass) w.note('bass', bar, beat, beats, tones.bass, (beat ? 96 : 104) * vel);
  if (organ > 0) for (const n of tones.pad) w.note('organ', bar, 0, 4, n, 80 * organ);
  const [low = 0, middle = 0, top = 0] = tones.str.map(midiNote);
  const voiced = voicing === 1 ? [top - 12, low, middle] : voicing === 2 ? [middle, top, low + 12] : [low, middle, top];
  if (strings) for (const n of voiced) w.note('strings', bar, 0, 4, n, 90 * vel);
  if (choir) for (const n of tones.choir) w.note('choir', bar, 0, 4, n, 96 * vel);
}

/** The war's drums for a bar in a feel: half time, `full`, or the kick on `every` beat; the clock's woods through all
 *  of it and the surdo under them; the ride bell's gears on the offbeats; the claves `racing` in sixteenths; a fill
 *  into every fourth bar; or, `stopped`, the woods and the surdo alone. */
export function warKit(
  w: Write,
  bar: number,
  { full = false, every = false, gears = false, racing = false, stopped = false, feel = 0 } = {},
): void {
  const { woods, surdo, half, full: running, fill } = feelOf(feel);
  surdo.forEach((beat, i) => w.hit('surdo', bar, beat, i ? 92 : 106));
  for (const [beat, wood, velocity] of woods) w.hit(wood, bar, beat, velocity);
  if (stopped) return;
  if (every) for (let beat = 0; beat < 4; beat++) w.hit('kick', bar, beat, beat === 0 ? 112 : 98);
  else for (const beat of full ? running : half) w.hit('kick', bar, beat, beat === 0 ? 110 : 94);
  for (const beat of full || every ? [1, 3] : [2]) w.hit('snare', bar, beat, 108);
  if (gears) for (let beat = 0; beat < 4; beat++) w.hit('rideBell', bar, beat + 0.5, 70);
  if (racing)
    for (let sixteenth = 0; sixteenth < 16; sixteenth++)
      w.hit('claves', bar, sixteenth * 0.25, sixteenth % 4 === 0 ? 80 : 60);
  if (bar % 4 === 3) {
    const toms = ['hiMidTom', 'lowMidTom', 'tom', 'highFloorTom', 'lowTom'] as const;
    if (fill === 'snare') for (let i = 0; i < 4; i++) w.hit('snare', bar, 3 + i * 0.25, 80 + i * 10);
    else if (fill === 'eighths') toms.slice(0, 4).forEach((tom, i) => w.hit(tom, bar, 2 + i * 0.5, 90 + i * 6));
    else toms.forEach((tom, i) => w.hit(tom, bar, 2.75 + i * 0.25, 88 + i * 5));
  }
  if (bar % 4 === 0) w.hit('crash', bar, 0, 96);
}
