// Wet's band and its harmony: the instruments, the kit, the chords voiced by hand for them, and the bar's sixteenths
// grouped three, three, three, three and four; the fight's takes and its stings are written over these (wetScore.ts).

import { type Held, keys, measured, progression, runsOf } from './craft.ts';
import type { Edge, Writer } from './score.ts';

export const TRACKS = {
  bass: {
    program: 35,
    volume: 68,
    pan: 64,
    role: 'bed',
    voice: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.25, index: 1.2, sub: 0.25 },
  },
  pad: {
    program: 89,
    volume: 92,
    pan: 70,
    role: 'bed',
    voice: { attack: 0.5, release: 0.8, index: 0.9, unison: 2, cents: 12, spread: 0.5 },
  },
  drip: {
    program: 108,
    volume: 108,
    pan: 90,
    role: 'tension',
    voice: { index: 1.8, idxDecay: 0.06, decay: 0.5, sustain: 0.02, release: 0.3 },
  },
  croak: {
    program: 70,
    volume: 113,
    pan: 40,
    role: 'tension',
    voice: { attack: 0.02, decay: 0.12, sustain: 0.5, release: 0.08, index: 2.6, idxDecay: 0.2 },
  },
  marimba: {
    program: 12,
    volume: 112,
    pan: 36,
    role: 'pulse',
    voice: { mod: 4, index: 1.4, idxDecay: 0.04, decay: 0.32, sustain: 0.02, release: 0.18, gain: 0.8 },
  },
  reed: {
    program: 71,
    volume: 118,
    pan: 58,
    role: 'lead',
    voice: { attack: 0.04, index: 1.7, idxDecay: 0.6, unison: 2, cents: 5, spread: 0.12 },
  },
  clarinet: { program: 71, volume: 119, pan: 76, role: 'lead', voice: { attack: 0.04, index: 1.9, idxDecay: 0.6 } },
  strings: {
    program: 48,
    volume: 125,
    pan: 84,
    role: 'peak',
    voice: { attack: 0.12, release: 0.5, index: 1.2, idxDecay: 1.2, unison: 2, cents: 9, spread: 0.4 },
  },
  choir: {
    program: 53,
    volume: 92,
    pan: 66,
    role: 'peak',
    voice: { mod: 1, index: 0.9, idxDecay: 2, attack: 0.4, release: 0.7, unison: 2, cents: 12, spread: 0.45 },
  },
  horn: {
    program: 60,
    volume: 81,
    pan: 44,
    role: 'peak',
    voice: { attack: 0.35, decay: 0.3, sustain: 0.9, release: 0.5, index: 2.2, idxDecay: 0.8 },
  },
} as const;
export type Track = keyof typeof TRACKS;

/** A deep drum, three congas (open, muted and low), two log drums, a shaker and a crash; the danger near is a log
 *  drum's heartbeat and the insects in a second shaker. */
export const KIT = {
  volume: 109,
  role: 'combat',
  roles: { heart: 'tension', insects: 'tension', riser: 'peak' },
  keys: {
    kick: 36,
    deep: 86,
    conga: 63,
    muted: 62,
    low: 64,
    logHigh: 48,
    logLow: 45,
    shaker: 70,
    crash: 49,
    heart: 41,
    insects: 82,
    riser: 55,
  },
  drums: {
    kick: { hz: 52, decay: 0.3, gain: 1, click: 0.35 },
    deep: { hz: 60, decay: 0.62, gain: 1.15, drop: 0.7, click: 0.3 },
    conga: { hz: 290, decay: 0.2, gain: 0.75, drop: 0.85, click: 0.35 },
    muted: { hz: 350, decay: 0.07, gain: 0.6, drop: 0.9, click: 0.4 },
    low: { hz: 205, decay: 0.24, gain: 0.8, drop: 0.85, click: 0.3 },
    logHigh: { hz: 230, decay: 0.16, gain: 0.7, drop: 0.95, click: 0.3 },
    logLow: { hz: 152, decay: 0.2, gain: 0.75, drop: 0.95, click: 0.3 },
    shaker: { hz: 6800, q: 1.5, decay: 0.05, gain: 0.26 },
    crash: { decay: 1.6, q: 0.55, gain: 0.55 },
    heart: { hz: 92, decay: 0.3, gain: 1, drop: 0.85, click: 0.2 },
    insects: { hz: 7400, q: 2, decay: 0.04, gain: 0.2 },
    // A swell of noise rising into the bar line, a reverse cymbal: noise, so it never whines as a pitched sweep does.
    riser: { hz: 2600, q: 0.6, attack: 1.6, decay: 0.12, gain: 0.6 },
  },
} as const;
export type Drum = keyof typeof KIT.keys;
export type Write = Writer<Track, Drum>;

export const BPM = 104;
export const BEATS = 4;
const PRESS = { threshold: -20, knee: 12, ratio: 3, attack: 0.012, release: 0.25, out: 2.35, ceiling: -3 } as const;
export const LEVEL = 1.4;
export const ONCE: Edge = { wrap: false, clip: true, hold: true, restrike: true };
export const SONG = { tracks: TRACKS, kit: KIT, beatsPerBar: BEATS, bpm: BPM, press: PRESS } as const;
/** The bar's sixteenths grouped three, three, three, three and four: where each group begins, in beats. */
export const GROUPS: readonly number[] = [0, 0.75, 1.5, 2.25, 3];

/** Each chord's bass, pad, choir, the horns' pair, the kalimba's three notes and the marimba's four. */
const chord = (bass: string, pad: string, choir: string, horn: string, drip: string, marimba: string) => ({
  bass,
  pad: keys(pad),
  choir: keys(choir),
  horn: keys(horn),
  drip: keys(drip),
  marimba: keys(marimba),
});
export const CHORDS = {
  'F#m': chord('F#2', 'A3 C#4 F#4', 'C#4 A4', 'F#3 C#4', 'F#5 C#6 A5', 'F#3 C#4 F#4 A4'),
  'D': chord('D2', 'A3 D4 F#4', 'D4 A4', 'D3 A3', 'F#5 D6 A5', 'D3 A3 D4 F#4'),
  'E': chord('E2', 'G#3 B3 E4', 'B3 G#4', 'E3 B3', 'G#5 E6 B5', 'E3 B3 E4 G#4'),
  'Bm': chord('B1', 'B3 D4 F#4', 'D4 B4', 'B2 F#3', 'F#5 D6 B5', 'B2 F#3 B3 D4'),
  'C#m': chord('C#2', 'G#3 C#4 E4', 'C#4 G#4', 'C#3 G#3', 'G#5 E6 C#6', 'C#3 G#3 C#4 E4'),
  'G': chord('G1', 'G3 B3 D4', 'B3 G4', 'G2 D3', 'G5 D6 B5', 'G2 D3 G3 B3'),
  'C#': chord('C#2', 'G#3 C#4 F4', 'C#4 G#4', 'C#3 G#3', 'G#5 F5 C#6', 'C#3 G#3 C#4 F4'),
  'F#': chord('F#2', 'A#3 C#4 F#4', 'C#4 A#4', 'F#3 C#4', 'F#5 C#6 A#5', 'F#3 C#4 F#4 A#4'),
};
export type Chord = keyof typeof CHORDS;
export const harmony = (text: string): Held<Chord>[][] => progression(text, CHORDS, BEATS, { 2: [0, 2] });
export const tune = (text: string) => measured(text, BEATS);

/** A sting's bed: each chord on the bass, the pad and the choir, `loud` its velocity's share. */
export function stingBed(w: Write, bars: readonly Held<Chord>[][], loud: number): void {
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    w.note('bass', bar, beat, beats, tones.bass, 90 * loud);
    for (const n of tones.pad) w.note('pad', bar, beat, beats, n, 62 * loud);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 60 * loud);
  }
}
