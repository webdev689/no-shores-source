// The story's band and its one theme, which every song of the story tells (storyScore.ts, storyStorm.ts): the sea
// songs' strings, harp, flute and fiddle, with low brass, a choir, bells and a celesta over them. The theme rises a
// fifth and sighs down from the minor sixth (D, A, B flat, A); raised to D major on the shore, the sigh is a sixth
// that hopes. Each song names only the tracks it plays, each in the layer it plays.

import { type Held, chordAt, measured, progression, runsOf } from './craft.ts';
import { type Edge, type Role, type Song, type Voice, type Writer, makeSong } from './score.ts';

export type Track =
  | 'pad'
  | 'strings'
  | 'cello'
  | 'bass'
  | 'horn'
  | 'brass'
  | 'flute'
  | 'fiddle'
  | 'harp'
  | 'choir'
  | 'voices'
  | 'bells'
  | 'celesta'
  | 'timpani'
  | 'trem'
  | 'swell'
  | 'drive'
  | 'hit';
export type Drum = 'kick' | 'lowTom' | 'frame' | 'tom' | 'crash' | 'ride' | 'taiko';
export type Write = Writer<Track, Drum>;

/** The sections in ensembles a few cents apart, the choir slow to speak, the drive a cello that stops inside its note,
 *  the hit with a sub under it, the swell a reverse cymbal's shimmer rising. */
const VOICES: Partial<Record<Track, Voice>> = {
  pad: { attack: 0.8, release: 1.4, index: 0.7, unison: 2, cents: 9, spread: 0.5 },
  strings: { attack: 0.22, release: 0.9, index: 1.4, idxDecay: 2, unison: 3, cents: 10, spread: 0.5 },
  cello: { attack: 0.08, release: 0.5, index: 1.6, idxDecay: 0.9, unison: 2, cents: 6, spread: 0.2 },
  horn: { attack: 0.07, index: 2.6, idxDecay: 0.7, unison: 2, cents: 6, spread: 0.25 },
  brass: { attack: 0.05, index: 4.2, idxDecay: 0.7, unison: 3, cents: 9, spread: 0.35 },
  flute: { attack: 0.06, idxDecay: 0.6, unison: 2, cents: 4 },
  fiddle: { attack: 0.03, decay: 0.25, sustain: 0.8, release: 0.3, index: 2, idxDecay: 0.8, unison: 2, cents: 5 },
  choir: { mod: 1, index: 1.1, idxDecay: 2, attack: 0.4, release: 1.2, unison: 3, cents: 12, spread: 0.45 },
  voices: { mod: 1, index: 0.8, idxDecay: 2.4, attack: 0.6, release: 1.6, unison: 3, cents: 10, spread: 0.5 },
  bells: { unison: 2, cents: 3, spread: 0.3 },
  celesta: { decay: 1.4, sustain: 0.04, release: 1.2, index: 2.6, idxDecay: 0.4 },
  timpani: { decay: 0.9, release: 0.5 },
  trem: { attack: 0.02, decay: 0.1, sustain: 0.8, release: 0.12, index: 2.4, idxDecay: 0.8, unison: 2, cents: 16 },
  swell: { mod: 3.73, index: 7, idxDecay: 4, attack: 1.7, decay: 0.02, sustain: 1, release: 0.05, gain: 0.5 },
  drive: { attack: 0.012, decay: 0.08, sustain: 0.75, release: 0.05, unison: 2, cents: 6, spread: 0.2 },
  hit: { index: 4.5, decay: 0.5, release: 0.35, unison: 2, cents: 15, sub: 0.35, spread: 0.4 },
};

/** [program, level, place]: the horns and the low brass left, the high strings and the bells right, the harp and the
 *  celesta apart, the drums, the bass and the choir at the middle. */
const MIX: Readonly<Record<Track, readonly [number, number, number]>> = {
  pad: [89, 84, 64],
  strings: [48, 92, 74],
  cello: [42, 98, 52],
  bass: [43, 98, 64],
  horn: [60, 104, 42],
  brass: [61, 104, 36],
  flute: [73, 100, 72],
  fiddle: [40, 104, 58],
  harp: [46, 100, 34],
  choir: [52, 92, 64],
  voices: [53, 94, 60],
  bells: [14, 76, 92],
  celesta: [8, 84, 96],
  timpani: [47, 104, 64],
  trem: [44, 86, 100],
  swell: [119, 80, 64],
  drive: [42, 96, 50],
  hit: [55, 104, 64],
};

const KEYS: Readonly<Record<Drum, number>> = {
  kick: 36,
  lowTom: 41,
  frame: 43,
  tom: 45,
  crash: 49,
  ride: 51,
  taiko: 87,
};
/** The taiko long and falling with its beater's click, the frame drum soft, the cymbals long. */
const DRUMS = {
  taiko: { hz: 64, decay: 0.95, gain: 1.3, drop: 0.7, click: 0.45 },
  kick: { hz: 52, decay: 0.38, gain: 1.1, click: 0.5 },
  lowTom: { hz: 82, decay: 0.55, gain: 1, click: 0.3 },
  tom: { hz: 122, decay: 0.45, click: 0.3 },
  frame: { hz: 82, decay: 0.3, gain: 0.9, drop: 0.8, click: 0.25 },
  crash: { decay: 2, q: 0.45, gain: 0.8 },
  ride: { decay: 1.2, q: 0.6, gain: 0.5 },
} as const;

/** A story song's shape: its tempo, length and metre, its level over the music's, its tracks and each one's layer,
 *  the drums' layer (a drum may have its own), and how its edges fall (a song played once is clipped). */
export interface Shape {
  readonly bpm: number;
  readonly bars: number;
  readonly beats: number;
  readonly level: number;
  readonly tracks: Partial<Readonly<Record<Track, Role>>>;
  readonly kit: Role;
  readonly drums?: Partial<Readonly<Record<Drum, Role>>>;
  readonly edge?: Edge;
}

/** A song of the story, played by the tracks its shape names. */
export function storySong(name: string, shape: Shape, write: (w: Write) => void): Song {
  const named = Object.keys(shape.tracks) as Track[];
  const tracks = Object.fromEntries(
    named.map((track) => {
      const [program, volume, pan] = MIX[track];
      const voice = VOICES[track];
      return [track, { program, volume, pan, role: shape.tracks[track] ?? 'bed', ...(voice ? { voice } : {}) }];
    }),
  ) as Record<Track, { program: number; volume: number; pan: number; role: Role; voice?: Voice }>;
  const kit = { volume: 100, role: shape.kit, roles: shape.drums ?? {}, keys: KEYS, drums: DRUMS };
  const { bpm, bars, beats, level, edge } = shape;
  return makeSong(
    { name: `story-${name}`, bpm, bars, beatsPerBar: beats, tracks, kit, level, ...(edge ? { edge } : {}) },
    (w) =>
      write({
        // A track the shape leaves out is not played: a song names what it plays and no more.
        note: (track, ...rest) => void (track in shape.tracks && w.note(track, ...rest)),
        hit: (drum, ...rest) => w.hit(drum, ...rest),
      }),
  );
}

/** The chords as pitch classes from the root: root, third, fifth. */
const CHORDS = {
  'Dm': [2, 5, 9],
  'D': [2, 6, 9],
  'C': [0, 4, 7],
  'Bb': [10, 2, 5],
  'A': [9, 1, 4],
  'F': [5, 9, 0],
  'Gm': [7, 10, 2],
  'G': [7, 11, 2],
  'Em': [4, 7, 11],
  'F#m': [6, 9, 1],
  'Bm': [11, 2, 6],
  'Eb': [3, 7, 10],
  'E': [4, 8, 11],
} as const;
export type Chord = keyof typeof CHORDS;

/** The chord's root at or over `low`. */
export function rootOver(name: Chord, low: number): number {
  const root = CHORDS[name][0];
  return low + ((root - (low % 12) + 12) % 12);
}

/** The chord's closed voicing over `low`: `count` of its tones, the lowest at or over `low`. */
export function voiced(name: Chord, low: number, count = 3): number[] {
  const classes: readonly number[] = CHORDS[name];
  const tones: number[] = [];
  for (let key = low; tones.length < count; key++) if (classes.includes(key % 12)) tones.push(key);
  return tones;
}

/** A progression of the story's chords, a bar of two split at its middle. */
export const harmony = (text: string, beats: number): Held<Chord>[][] =>
  progression(text, CHORDS, beats, { 2: [0, beats / 2] });

/** The theme and its answer, eight bars each in 4/4, in D minor and raised to D major (the sixth, the third and the
 *  seventh raised: B, F sharp and C sharp), with the chords under each. */
export const THEME = measured(
  'D4:1.5 A4:.5 Bb4:1 A4:1 | G4:1 F4:1 E4:2 | D4:1.5 Bb4:.5 C5:1 Bb4:1 | A4:3 r:1' +
    ' | D4:1.5 A4:.5 Bb4:1 A4:1 | C5:1.5 A4:.5 F4:1 A4:1 | G4:1.5 Bb4:.5 A4:1 E4:1 | D4:4',
  4,
);
export const ANSWER = measured(
  'F4:1 Bb4:1 D5:1.5 C5:.5 | C5:1 A4:1 F4:2 | G4:1 Bb4:1 D5:1 G5:1 | F5:1.5 E5:.5 C#5:2' +
    ' | D5:1.5 A4:.5 Bb4:1 A4:1 | G4:1 Bb4:1 D5:2 | E5:1.5 D5:.5 C#5:1 E5:1 | D5:4',
  4,
);
export const RAISED = measured(
  'D4:1.5 A4:.5 B4:1 A4:1 | G4:1 F#4:1 E4:2 | D4:1.5 B4:.5 C#5:1 B4:1 | A4:3 r:1' +
    ' | D4:1.5 A4:.5 B4:1 A4:1 | C#5:1.5 A4:.5 F#4:1 A4:1 | G4:1.5 B4:.5 A4:1 E4:1 | D4:4',
  4,
);
export const RAISED_ANSWER = measured(
  'F#4:1 B4:1 D5:1.5 C#5:.5 | C#5:1 A4:1 F#4:2 | G4:1 B4:1 D5:1 G5:1 | F#5:1.5 E5:.5 C#5:2' +
    ' | D5:1.5 A4:.5 B4:1 A4:1 | G4:1 B4:1 D5:2 | E5:1.5 D5:.5 C#5:1 E5:1 | D5:4',
  4,
);
export const UNDER = {
  theme: 'Dm | C | Bb | A | Dm | F | Gm/A | Dm',
  answer: 'Bb | F | Gm | A | Dm | Gm | A | Dm',
  raised: 'D | Em | G | A | D | F#m | Em/A | D',
  raisedAnswer: 'Bm | F#m | G | A | D | G | A | D',
} as const;

type Bars = readonly (readonly Held<Chord>[])[];

/** The chords of `bars` held on `track` from bar `first`, each voiced `count` over `low`, a chord that follows itself
 *  held on: a pad or the strings breathe where the harmony moves. */
export function held(
  w: Write,
  track: Track,
  first: number,
  bars: Bars,
  beats: number,
  low: number,
  loud: number,
  count = 3,
) {
  for (const run of runsOf(bars, beats))
    for (const key of voiced(run.chord, low, count)) w.note(track, first + run.bar, run.beat, run.beats, key, loud);
}

/** Each chord's root on `track` over `low`, struck where the chord comes and held as long. */
export function roots(w: Write, track: Track, first: number, bars: Bars, beats: number, low: number, loud: number) {
  for (const run of runsOf(bars, beats))
    w.note(track, first + run.bar, run.beat, run.beats, rootOver(run.chord, low), loud);
}

/** The chord rolled up and back on `track` through every bar of `bars`, a tone each `step`, `count` tones over `low`,
 *  each ringing `ring` beats; the first of each turn louder. */
export function rolled(
  w: Write,
  track: Track,
  first: number,
  bars: Bars,
  beats: number,
  low: number,
  loud: number,
  { count = 4, step = 0.5, ring = 1.5 }: { count?: number; step?: number; ring?: number } = {},
) {
  bars.forEach((bar, index) => {
    for (let turn = 0; turn * step < beats - 1e-9; turn++) {
      const beat = turn * step;
      const tones = voiced(chordAt(bar, beat), low, count);
      const round = turn % (2 * count - 2);
      const pick = round < count ? round : 2 * count - 2 - round;
      w.note(track, first + index, beat, ring, tones[pick] ?? low, round === 0 ? loud : loud - 10);
    }
  });
}
