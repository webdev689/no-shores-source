// Dry's band and its harmony: the instruments, the kit, the chords voiced by hand for them, and how a bar of 7/8
// splits; the fight's takes and its stings are written over these (dryScore.ts).

import { type Held, keys, measured, progression, runsOf } from './craft.ts';
import type { Edge, Writer } from './score.ts';

export const TRACKS = {
  bass: { program: 43, volume: 77, pan: 64, role: 'bed', voice: { attack: 0.05, release: 0.35, index: 1.6 } },
  pad: {
    program: 49,
    volume: 88,
    pan: 74,
    role: 'bed',
    voice: { attack: 0.35, release: 0.7, index: 1.2, idxDecay: 2, unison: 2, cents: 11, spread: 0.5 },
  },
  rub: {
    program: 42,
    volume: 104,
    pan: 54,
    role: 'tension',
    voice: { attack: 0.008, decay: 0.08, sustain: 0.6, release: 0.06, index: 2, idxDecay: 0.2 },
  },
  oud: {
    program: 24,
    volume: 118,
    pan: 46,
    role: 'pulse',
    voice: { index: 2.6, idxDecay: 0.1, decay: 0.32, sustain: 0.08, release: 0.18 },
  },
  timpani: { program: 47, volume: 94, pan: 64, role: 'combat', voice: { decay: 0.7, release: 0.45 } },
  reed: {
    program: 68,
    volume: 120,
    pan: 60,
    role: 'lead',
    voice: { attack: 0.03, index: 2.4, idxDecay: 0.5, unison: 2, cents: 7, spread: 0.15 },
  },
  strings: {
    program: 48,
    volume: 117,
    pan: 82,
    role: 'lead',
    voice: { attack: 0.09, release: 0.45, index: 1.4, idxDecay: 1.2, unison: 2, cents: 9, spread: 0.35 },
  },
  brass: {
    program: 61,
    volume: 100,
    pan: 40,
    role: 'peak',
    voice: { attack: 0.04, index: 3, idxDecay: 0.6, unison: 2, cents: 8, spread: 0.3 },
  },
  stab: {
    program: 61,
    volume: 82,
    pan: 64,
    role: 'peak',
    voice: { attack: 0.01, index: 3.6, idxDecay: 0.3, sub: 0.2 },
  },
  choir: {
    program: 52,
    volume: 90,
    pan: 70,
    role: 'peak',
    voice: { mod: 1, index: 1.1, idxDecay: 2, attack: 0.35, release: 0.7, unison: 2, cents: 12, spread: 0.45 },
  },
} as const;
export type Track = keyof typeof TRACKS;

/** The darbuka's doum (its skin's middle) and its tek and ka (the rim, struck and brushed), a big frame drum, a kick,
 *  the riq's jingles and a crash; the danger near is a frame drum's heartbeat and a hiss of sand. */
export const KIT = {
  volume: 92,
  role: 'combat',
  roles: { heart: 'tension', sand: 'tension', riser: 'peak' },
  keys: { kick: 36, frame: 41, doum: 64, tek: 37, ka: 39, riq: 54, crash: 49, heart: 87, sand: 82, riser: 55 },
  drums: {
    kick: { hz: 52, decay: 0.32, gain: 1.05, click: 0.4 },
    frame: { hz: 66, decay: 0.5, gain: 1.05, drop: 0.75, click: 0.25 },
    doum: { hz: 104, decay: 0.2, gain: 1.05, drop: 0.7, click: 0.2 },
    tek: { hz: 3300, q: 1.6, decay: 0.07, gain: 0.75, body: 420 },
    ka: { hz: 2400, q: 1.2, decay: 0.05, gain: 0.45 },
    riq: { hz: 7600, q: 1.4, decay: 0.12, gain: 0.32 },
    crash: { decay: 1.8, q: 0.5, gain: 0.7 },
    heart: { hz: 70, decay: 0.42, gain: 1, drop: 0.75, click: 0.12 },
    // A swell of noise rising into the bar line, a reverse cymbal: noise, so it never whines as a pitched sweep does.
    riser: { hz: 2600, q: 0.6, attack: 1.6, decay: 0.12, gain: 0.6 },
    sand: { hz: 6200, q: 1.6, decay: 0.06, gain: 0.28 },
  },
} as const;
export type Drum = keyof typeof KIT.keys;
export type Write = Writer<Track, Drum>;

export const BPM = 150;
export const BEATS = 3.5;
/** The bar's groups begin on the beats 0, 1 and 2; two chords in a bar change where its three begins. */
const SPLITS = { 2: [0, 2], 3: [0, 1, 2] };
export const GROUPS = [0, 1, 2] as const;
const PRESS = { threshold: -20, knee: 12, ratio: 3, attack: 0.012, release: 0.25, out: 2.35, ceiling: -3 } as const;
export const LEVEL = 1.4;
export const ONCE: Edge = { wrap: false, clip: true, hold: true, restrike: true };
export const SONG = { tracks: TRACKS, kit: KIT, beatsPerBar: BEATS, bpm: BPM, press: PRESS } as const;

/** Each chord's bass, timpani, pad, choir (open fifths), stab, and the oud's seven eighths. */
const chord = (bass: string, timp: string, pad: string, choir: string, stab: string, oud: string) => ({
  bass,
  timp,
  pad: keys(pad),
  choir: keys(choir),
  stab: keys(stab),
  oud: keys(oud),
});
export const CHORDS = {
  A: chord('A1', 'A2', 'C#4 E4 A4', 'A3 E4', 'A2 E3', 'A2 A3 G3 A3 Bb3 A3 E3'),
  Bb: chord('Bb1', 'Bb2', 'D4 F4 Bb4', 'Bb3 F4', 'Bb2 F3', 'Bb2 Bb3 A3 Bb3 C4 Bb3 F3'),
  Gm: chord('G1', 'G2', 'D4 G4 Bb4', 'G3 D4', 'G2 D3', 'G2 G3 F3 G3 A3 G3 D3'),
  Dm: chord('D2', 'D2', 'D4 F4 A4', 'D4 A4', 'D3 A3', 'D3 D4 C4 D4 E4 D4 A3'),
  C: chord('C2', 'C2', 'E4 G4 C5', 'C4 G4', 'C3 G3', 'C3 C4 Bb3 C4 D4 C4 G3'),
  F: chord('F1', 'F2', 'C4 F4 A4', 'F3 C4', 'F2 C3', 'F2 F3 E3 F3 G3 F3 C3'),
  G: chord('G1', 'G2', 'D4 G4 B4', 'G3 D4', 'G2 D3', 'G2 G3 F3 G3 A3 G3 D3'),
};
export type Chord = keyof typeof CHORDS;
export const harmony = (text: string): Held<Chord>[][] => progression(text, CHORDS, BEATS, SPLITS);
export const tune = (text: string) => measured(text, BEATS);

/** A sting's bed: each chord on the bass and the pad, `loud` its velocity's share. */
export function stingBed(w: Write, bars: readonly Held<Chord>[][], loud: number): void {
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    w.note('bass', bar, beat, beats, tones.bass, 90 * loud);
    for (const n of tones.pad) w.note('pad', bar, beat, beats, n, 64 * loud);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 60 * loud);
  }
}
