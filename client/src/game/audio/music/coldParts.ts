// Cold's band and its harmony: the instruments, the kit, and the chords voiced by hand for them, spaced wide (a low
// bass, open fifths high); the fight's takes and its stings are written over these (coldScore.ts).

import { type Held, keys, measured, progression, runsOf } from './craft.ts';
import type { Edge, Writer } from './score.ts';

export const TRACKS = {
  bass: { program: 43, volume: 80, pan: 64, role: 'bed', voice: { attack: 0.08, release: 0.5, index: 1.5, sub: 0.2 } },
  air: {
    program: 49,
    volume: 90,
    pan: 76,
    role: 'bed',
    voice: { attack: 0.6, release: 1, index: 1, idxDecay: 2.5, unison: 2, cents: 8, spread: 0.6 },
  },
  shiver: {
    program: 44,
    volume: 76,
    pan: 96,
    role: 'tension',
    voice: { attack: 0.9, decay: 0.3, sustain: 0.9, release: 1, index: 1.3, unison: 2, cents: 14, spread: 0.4 },
  },
  tick: {
    program: 45,
    volume: 114,
    pan: 30,
    role: 'tension',
    voice: { attack: 0.002, decay: 0.08, sustain: 0.01, release: 0.05, index: 3.2, idxDecay: 0.03 },
  },
  ostinato: {
    program: 42,
    volume: 116,
    pan: 56,
    role: 'pulse',
    voice: { attack: 0.006, decay: 0.12, sustain: 0.5, release: 0.08, index: 2.2, idxDecay: 0.12, unison: 2, cents: 7 },
  },
  timpani: { program: 47, volume: 98, pan: 64, role: 'combat', voice: { decay: 1, release: 0.6 } },
  horn: {
    program: 60,
    volume: 116,
    pan: 46,
    role: 'lead',
    voice: { attack: 0.07, index: 2.6, idxDecay: 0.7, unison: 2, cents: 7, spread: 0.2 },
  },
  fiddle: {
    program: 40,
    volume: 117,
    pan: 72,
    role: 'lead',
    voice: { attack: 0.04, decay: 0.3, sustain: 0.85, release: 0.3, index: 2, idxDecay: 0.9, unison: 2, cents: 8 },
  },
  brass: {
    program: 61,
    volume: 96,
    pan: 36,
    role: 'peak',
    voice: { attack: 0.06, index: 3, idxDecay: 0.7, unison: 2, cents: 8, spread: 0.3 },
  },
  choir: {
    program: 52,
    volume: 92,
    pan: 68,
    role: 'peak',
    voice: { mod: 1, index: 1.1, idxDecay: 2, attack: 0.45, release: 0.9, unison: 2, cents: 12, spread: 0.5 },
  },
} as const;
export type Track = keyof typeof TRACKS;

/** A taiko, long and falling with its beater's click, three toms, a frame drum, a field snare, a kick and the
 *  cymbals; the slow heart is a softer, deeper drum. */
export const KIT = {
  volume: 86,
  role: 'combat',
  roles: { heart: 'tension', gust: 'tension', riser: 'peak' },
  keys: {
    kick: 36,
    taiko: 87,
    lowTom: 41,
    midTom: 45,
    highTom: 48,
    frame: 43,
    snare: 38,
    crash: 49,
    china: 52,
    heart: 35,
    gust: 54,
    riser: 55,
  },
  drums: {
    kick: { hz: 50, decay: 0.34, gain: 1.05, click: 0.4 },
    taiko: { hz: 58, decay: 0.9, gain: 1.2, drop: 0.7, click: 0.45 },
    lowTom: { hz: 82, decay: 0.5, click: 0.35 },
    midTom: { hz: 106, decay: 0.45, click: 0.35 },
    highTom: { hz: 136, decay: 0.4, click: 0.35 },
    frame: { hz: 74, decay: 0.3, gain: 0.8, drop: 0.8, click: 0.3 },
    snare: { hz: 1500, q: 0.7, decay: 0.2, gain: 0.8, body: 170 },
    crash: { decay: 2.2, q: 0.45, gain: 0.7 },
    china: { decay: 1.4, q: 0.55, gain: 0.6 },
    heart: { hz: 50, decay: 0.75, gain: 1.1, drop: 0.7, click: 0.15 },
    // A swell of noise rising into the bar line, a reverse cymbal: noise, so it never whines as a pitched sweep does.
    riser: { hz: 2600, q: 0.6, attack: 1.6, decay: 0.12, gain: 0.6 },
    // A gust: noise swelling and dying round 700 Hz, wind, never the pitched sweep that whined.
    gust: { hz: 700, q: 0.7, attack: 2.4, decay: 1.6, gain: 0.5 },
  },
} as const;
export type Drum = keyof typeof KIT.keys;
export type Write = Writer<Track, Drum>;

export const BPM = 120;
export const BEATS = 5;
const PRESS = { threshold: -20, knee: 12, ratio: 3, attack: 0.012, release: 0.25, out: 2.35, ceiling: -3 } as const;
export const LEVEL = 1.4;
export const ONCE: Edge = { wrap: false, clip: true, hold: true, restrike: true };
export const SONG = { tracks: TRACKS, kit: KIT, beatsPerBar: BEATS, bpm: BPM, press: PRESS } as const;

/** Each chord's bass, timpani, the high fifths of the air and of the shiver, the choir, and the low strings' ten
 *  eighths. */
const chord = (bass: string, timp: string, air: string, shiver: string, choir: string, ostinato: string) => ({
  bass,
  timp,
  air: keys(air),
  shiver: keys(shiver),
  choir: keys(choir),
  ostinato: keys(ostinato),
});
export const CHORDS = {
  'Bm': chord('B1', 'B2', 'F#4 B4 D5', 'B5 F#6', 'D5 B5', 'B2 B2 F#3 B2 B2 F#3 B3 A3 F#3 D3'),
  'G': chord('G1', 'G2', 'G4 B4 D5', 'B5 D6', 'D5 B5', 'G2 G2 D3 G2 G2 D3 G3 F#3 D3 B2'),
  'A': chord('A1', 'A2', 'E4 A4 C#5', 'A5 E6', 'C#5 A5', 'A2 A2 E3 A2 A2 E3 A3 G3 E3 C#3'),
  'Em': chord('E2', 'E2', 'E4 G4 B4', 'B5 E6', 'B4 G5', 'E2 E2 B2 E2 E2 B2 E3 D3 B2 G2'),
  'F#m': chord('F#1', 'F#2', 'F#4 A4 C#5', 'C#6 F#6', 'C#5 A5', 'F#2 F#2 C#3 F#2 F#2 C#3 F#3 E3 C#3 A2'),
  'C': chord('C2', 'C2', 'E4 G4 C5', 'G5 C6', 'C5 G5', 'C2 C2 G2 C2 C2 G2 C3 B2 G2 E2'),
  'D': chord('D2', 'D2', 'F#4 A4 D5', 'A5 D6', 'D5 A5', 'D2 D2 A2 D2 D2 A2 D3 C#3 A2 F#2'),
  'B': chord('B1', 'B2', 'F#4 B4 D#5', 'B5 F#6', 'D#5 B5', 'B2 B2 F#3 B2 B2 F#3 B3 A3 F#3 D#3'),
};
export type Chord = keyof typeof CHORDS;
export const harmony = (text: string): Held<Chord>[][] => progression(text, CHORDS, BEATS, { 2: [0, 3] });
export const tune = (text: string) => measured(text, BEATS);

/** A sting's bed: each chord on the bass, the air and the choir, `loud` its velocity's share. */
export function stingBed(w: Write, bars: readonly Held<Chord>[][], loud: number): void {
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    w.note('bass', bar, beat, beats, tones.bass, 90 * loud);
    for (const n of tones.air) w.note('air', bar, beat, beats, n, 60 * loud);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 58 * loud);
  }
}
