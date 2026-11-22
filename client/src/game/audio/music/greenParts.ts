// Green's band and its harmony: the instruments, the kit, the chords voiced by hand for them, and how a bar of 6/8
// splits; the fight's takes and its stings are written over these (greenScore.ts).

import { type Held, keys, measured, progression, runsOf } from './craft.ts';
import { type Edge, type Writer, midiNote } from './score.ts';

export const TRACKS = {
  bass: { program: 43, volume: 82, pan: 64, role: 'bed', voice: { attack: 0.05, release: 0.35, index: 1.4, sub: 0.3 } },
  strings: {
    program: 48,
    volume: 90,
    pan: 76,
    role: 'bed',
    voice: { attack: 0.3, release: 0.7, index: 1.2, idxDecay: 2, unison: 2, cents: 10, spread: 0.5 },
  },
  gate: {
    program: 48,
    volume: 110,
    pan: 50,
    role: 'tension',
    voice: { attack: 0.006, decay: 0.09, sustain: 0.5, release: 0.07, index: 1.7, idxDecay: 0.25 },
  },
  trem: {
    program: 44,
    volume: 100,
    pan: 96,
    role: 'tension',
    voice: { attack: 0.7, release: 1.2, index: 1 },
  },
  ostinato: {
    program: 42,
    volume: 123,
    pan: 60,
    role: 'pulse',
    voice: { attack: 0.006, decay: 0.12, sustain: 0.45, release: 0.07, index: 2.4, idxDecay: 0.1, unison: 2, cents: 6 },
  },
  timpani: { program: 47, volume: 95, pan: 64, role: 'combat', voice: { decay: 0.8, release: 0.5 } },
  fiddle: {
    program: 40,
    volume: 124,
    pan: 56,
    role: 'lead',
    voice: { attack: 0.02, decay: 0.25, sustain: 0.8, release: 0.18, index: 2.1, idxDecay: 0.7, unison: 2, cents: 5 },
  },
  horn: {
    program: 60,
    volume: 106,
    pan: 42,
    role: 'lead',
    voice: { attack: 0.06, index: 2.3, idxDecay: 0.6, unison: 2, cents: 6, spread: 0.25 },
  },
  choir: {
    program: 52,
    volume: 91,
    pan: 70,
    role: 'peak',
    voice: { mod: 1, index: 1.1, idxDecay: 2, attack: 0.35, release: 0.7, unison: 2, cents: 12, spread: 0.45 },
  },
  lowBrass: {
    program: 57,
    volume: 91,
    pan: 58,
    role: 'peak',
    voice: { attack: 0.03, index: 3.2, idxDecay: 0.4, sub: 0.2 },
  },
} as const;
export type Track = keyof typeof TRACKS;

/** The bodhran's low skin and top, a big drum, a rim crack with a skin under it, three toms, and the heartbeat: the
 *  low drum alone is the danger near. */
export const KIT = {
  volume: 92,
  role: 'combat',
  roles: { heart: 'tension', riser: 'peak' },
  keys: {
    kick: 36,
    snare: 38,
    bodhran: 41,
    bodhranTop: 45,
    lowTom: 43,
    midTom: 47,
    highTom: 50,
    crash: 49,
    heart: 87,
    riser: 55,
  },
  drums: {
    kick: { hz: 54, decay: 0.34, gain: 1.1, click: 0.45 },
    snare: { hz: 2200, q: 0.8, decay: 0.16, gain: 0.75, body: 200 },
    bodhran: { hz: 76, decay: 0.32, gain: 1.05, drop: 0.8, click: 0.3 },
    bodhranTop: { hz: 150, decay: 0.12, gain: 0.7, click: 0.4 },
    lowTom: { hz: 96, decay: 0.45, click: 0.3 },
    midTom: { hz: 128, decay: 0.38, click: 0.3 },
    highTom: { hz: 164, decay: 0.32, click: 0.3 },
    crash: { decay: 1.8, q: 0.5, gain: 0.7 },
    heart: { hz: 58, decay: 0.5, gain: 1.1, drop: 0.75, click: 0.15 },
    // A swell of noise rising into the bar line, a reverse cymbal: noise, so it never whines as a pitched sweep does.
    riser: { hz: 2600, q: 0.6, attack: 1.6, decay: 0.12, gain: 0.6 },
  },
} as const;
export type Drum = keyof typeof KIT.keys;
export type Write = Writer<Track, Drum>;

export const BPM = 156;
export const BEATS = 3;
/** A 6/8 bar holds two chords a dotted quarter each, or three a quarter each across it (the hemiola). */
const SPLITS = { 2: [0, 1.5], 3: [0, 1, 2] };
const PRESS = { threshold: -20, knee: 12, ratio: 3, attack: 0.012, release: 0.25, out: 2.35, ceiling: -3 } as const;
export const LEVEL = 1.4;
/** A sting plays once: nothing wraps round, and a held note stops at its end. */
export const ONCE: Edge = { wrap: false, clip: true, hold: true, restrike: true };
export const SONG = { tracks: TRACKS, kit: KIT, beatsPerBar: BEATS, bpm: BPM, press: PRESS } as const;

/** Each chord's bass, the cellos' root, the timpani, the strings, the gate's pair, the choir, the low brass, the
 *  fiddle's arpeggio over the horn's tune and the high tremolo's pair. */
const chord = (
  bass: string,
  ost: string,
  timp: string,
  pad: string,
  gate: string,
  choir: string,
  brass: string,
  arp: string,
  trem: string,
) => ({
  bass,
  ost: midiNote(ost),
  timp,
  pad: keys(pad),
  gate: keys(gate),
  choir: keys(choir),
  brass: keys(brass),
  arp: keys(arp),
  trem: keys(trem),
});
export const CHORDS = {
  Em: chord('E2', 'E3', 'E2', 'E4 G4 B4', 'B3 E4', 'G4 E5', 'E2 B2', 'E5 G5 B5', 'B5 E6'),
  D: chord('D2', 'D3', 'D2', 'D4 F#4 A4', 'A3 D4', 'F#4 D5', 'D2 A2', 'D5 F#5 A5', 'A5 D6'),
  C: chord('C2', 'C3', 'C2', 'E4 G4 C5', 'G3 C4', 'E4 C5', 'C2 G2', 'C5 E5 G5', 'G5 E6'),
  G: chord('G2', 'G2', 'G2', 'D4 G4 B4', 'B3 D4', 'G4 D5', 'G2 D3', 'D5 G5 B5', 'B5 D6'),
  A: chord('A2', 'A2', 'A2', 'E4 A4 C#5', 'A3 E4', 'E4 C#5', 'A2 E3', 'C#5 E5 A5', 'A5 E6'),
  Am: chord('A2', 'A2', 'A2', 'E4 A4 C5', 'A3 E4', 'E4 C5', 'A2 E3', 'C5 E5 A5', 'A5 E6'),
  Bm: chord('B1', 'B2', 'B2', 'D4 F#4 B4', 'B3 F#4', 'F#4 D5', 'B1 F#2', 'D5 F#5 B5', 'B5 F#6'),
  E: chord('E2', 'E3', 'E2', 'E4 G#4 B4', 'B3 E4', 'G#4 E5', 'E2 B2', 'E5 G#5 B5', 'B5 E6'),
};
export type Chord = keyof typeof CHORDS;
export const harmony = (text: string): Held<Chord>[][] => progression(text, CHORDS, BEATS, SPLITS);
export const tune = (text: string) => measured(text, BEATS);

/** A sting's bed: each chord on the bass, the strings and the choir, `loud` its velocity's share. */
export function stingBed(w: Write, bars: readonly Held<Chord>[][], loud: number, bassBars = bars.length): void {
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    if (bar < bassBars) w.note('bass', bar, beat, Math.min(beats, (bassBars - bar) * BEATS), tones.bass, 88 * loud);
    for (const n of tones.pad) w.note('strings', bar, beat, beats, n, 64 * loud);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 60 * loud);
  }
}
