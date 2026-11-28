// The Drowned Vale's band and harmony: every track a Freesound recording once picked (a `music.*` cue) over the FM
// program it plays until then; the kit's skins and swells on recordings too; the chords voiced by hand in D Phrygian,
// low, each song set in its own key by a shift; and the raid's one theme. The fights' takes are written over these
// (valeTakes.ts), the songs in valeScore.ts, the bosses in valeBosses.ts.

import { type Held, keys, measured, progression } from './craft.ts';
import { type Edge, type Press, type TrackSpec, type Tune, type Writer, midiNote } from './score.ts';

export const TRACKS = {
  bass: {
    program: 43,
    volume: 92,
    pan: 64,
    role: 'bed',
    voice: { attack: 0.2, release: 0.6, index: 1.2, sub: 0.3 },
    sample: { cue: 'music.bass', attack: 0.15, release: 0.6 },
  },
  organ: {
    program: 19,
    volume: 78,
    pan: 60,
    role: 'bed',
    voice: { attack: 0.5, release: 1.2, index: 0.8, unison: 2, cents: 6, spread: 0.4 },
    sample: { cue: 'music.organ', attack: 0.4, release: 1.2, gain: 0.8 },
  },
  drone: {
    program: 89,
    volume: 70,
    pan: 64,
    role: 'bed',
    voice: { attack: 2.5, release: 3, index: 0.5, idxDecay: 3, unison: 2, cents: 7, spread: 0.6 },
    sample: { cue: 'music.drone', attack: 2, release: 3, gain: 0.7 },
  },
  bells: {
    program: 14,
    volume: 82,
    pan: 82,
    role: 'tension',
    voice: { release: 1.4 },
    sample: { cue: 'music.bell', attack: 0.005, release: 1.6, gain: 0.7 },
  },
  glass: {
    program: 92,
    volume: 76,
    pan: 40,
    role: 'tension',
    voice: { attack: 1.2, release: 1.6, index: 0.4, idxDecay: 2 },
    sample: { cue: 'music.glass', attack: 0.8, release: 1.6, gain: 0.6 },
  },
  water: {
    program: 99,
    volume: 74,
    pan: 90,
    role: 'tension',
    voice: { attack: 0.6, release: 1.8, index: 0.9, idxDecay: 1.5 },
    sample: { cue: 'music.waterphone', attack: 0.3, release: 1.8, gain: 0.6, home: midiNote('D4') },
  },
  ostinato: {
    program: 42,
    volume: 112,
    pan: 54,
    role: 'pulse',
    voice: { attack: 0.006, decay: 0.12, sustain: 0.4, release: 0.08, index: 2.2, idxDecay: 0.1, unison: 2, cents: 6 },
    sample: { cue: 'music.cello.short', attack: 0.005, release: 0.12 },
  },
  timpani: {
    program: 47,
    volume: 96,
    pan: 64,
    role: 'combat',
    voice: { decay: 0.8, release: 0.5 },
    sample: { cue: 'music.timpani', attack: 0.003, release: 0.6 },
  },
  choir: {
    program: 52,
    volume: 104,
    pan: 68,
    role: 'lead',
    voice: { mod: 1, index: 1.1, idxDecay: 2, attack: 0.3, release: 0.8, unison: 2, cents: 12, spread: 0.4 },
    sample: { cue: 'music.choir.low', attack: 0.25, release: 0.9 },
  },
  cello: {
    program: 42,
    volume: 108,
    pan: 46,
    role: 'lead',
    voice: { attack: 0.12, decay: 0.3, sustain: 0.85, release: 0.5, index: 1.4, idxDecay: 0.9, unison: 2, cents: 5 },
    sample: { cue: 'music.cello', attack: 0.1, release: 0.5 },
  },
  horn: {
    program: 60,
    volume: 100,
    pan: 38,
    role: 'lead',
    voice: { attack: 0.08, index: 1.9, idxDecay: 0.7, release: 0.5, unison: 2, cents: 5, spread: 0.2 },
    sample: { cue: 'music.horn', attack: 0.08, release: 0.5 },
  },
  high: {
    program: 53,
    volume: 92,
    pan: 72,
    role: 'peak',
    voice: { mod: 1, index: 0.9, idxDecay: 2, attack: 0.5, release: 1, unison: 2, cents: 12, spread: 0.5 },
    sample: { cue: 'music.choir.high', attack: 0.4, release: 1 },
  },
} as const satisfies Readonly<Record<string, TrackSpec>>;
export type Track = keyof typeof TRACKS;

/** The skins and swells: taiko and frame drums for the fights, the taiko low as the heartbeat, a boom on the
 *  downbeats, struck metal, a bowed cymbal's swell and a riser of noise into the bar line, never a pitched sweep. */
/** How long the riser swells from its hit to the bar line it lands on, seconds. */
const RISER_S = 1.6;
export const KIT = {
  volume: 100,
  role: 'combat',
  roles: { heart: 'tension', bowed: 'tension', boom: 'peak', metal: 'peak', riser: 'peak' },
  keys: { taiko: 36, frame: 41, tap: 45, heart: 87, boom: 35, metal: 52, bowed: 51, riser: 55 },
  drums: {
    taiko: { hz: 58, decay: 0.6, gain: 1.15, drop: 0.72, click: 0.2 },
    frame: { hz: 96, decay: 0.3, gain: 0.85, drop: 0.8, click: 0.3 },
    tap: { hz: 180, decay: 0.08, gain: 0.5, click: 0.35 },
    heart: { hz: 52, decay: 0.5, gain: 1.1, drop: 0.75, click: 0.12 },
    boom: { hz: 38, decay: 1.4, gain: 1.2, drop: 0.6, click: 0.1 },
    // The high ones' tails are cut a tenth of a second after their peak, so a recording of struck metal never rings.
    metal: { hz: 3200, q: 0.7, decay: 0.1, gain: 0.5 },
    bowed: { hz: 2400, q: 0.5, attack: 2.4, decay: 0.1, gain: 0.35 },
    riser: { hz: 2600, q: 0.6, attack: RISER_S, decay: 0.1, gain: 0.55 },
  },
  samples: {
    taiko: { cue: 'music.taiko' },
    frame: { cue: 'music.frame' },
    tap: { cue: 'music.frame', shift: 7, gain: 0.5 },
    heart: { cue: 'music.taiko', shift: -7, gain: 0.8 },
    boom: { cue: 'music.boom' },
    metal: { cue: 'music.metal', gain: 0.6 },
    bowed: { cue: 'music.bowed', gain: 0.6 },
    riser: { cue: 'music.riser', gain: 0.7, lands: RISER_S },
  },
} as const;
export type Drum = keyof typeof KIT.keys;
export type Write = Writer<Track, Drum>;

/** A chord voiced by hand, in D: its bass, the organ's three, the choir's, the bells' toll, the glass's pair, the
 *  ostinato's root and the timpani's. */
export interface Chord {
  readonly bass: number;
  readonly pad: readonly number[];
  readonly choir: readonly number[];
  readonly bell: readonly number[];
  readonly glass: readonly number[];
  readonly root: number;
  readonly timp: number;
}
const chord = (bass: string, pad: string, choir: string, bell: string, glass: string, root: string, timp: string) => {
  return {
    bass: midiNote(bass),
    pad: keys(pad),
    choir: keys(choir),
    bell: keys(bell),
    glass: keys(glass),
    root: midiNote(root),
    timp: midiNote(timp),
  };
};
/** D Phrygian's chords, and its borrowed major ones: the tonic, the flat second over it (the Vale's own pull), the
 *  flat seventh and sixth, the minor four and five, the relative major, the dominant and the tonic major at the end. */
export const CHORDS = {
  i: chord('D2', 'D3 F3 A3', 'A3 D4 F4', 'D4 F4 A4', 'A4 D5', 'D3', 'D2'),
  bII: chord('Eb2', 'Eb3 G3 Bb3', 'Bb3 Eb4 G4', 'Eb4 G4 Bb4', 'Bb4 Eb5', 'Eb3', 'Eb2'),
  bVII: chord('C2', 'E3 G3 C4', 'G3 C4 E4', 'C4 E4 G4', 'G4 C5', 'C3', 'C2'),
  bVI: chord('Bb1', 'D3 F3 Bb3', 'F3 Bb3 D4', 'D4 F4 Bb4', 'F4 Bb4', 'Bb2', 'F2'),
  iv: chord('G1', 'D3 G3 Bb3', 'G3 Bb3 D4', 'D4 G4 Bb4', 'G4 D5', 'G2', 'G2'),
  v: chord('A1', 'E3 A3 C4', 'A3 C4 E4', 'C4 E4 A4', 'A4 E5', 'A2', 'A2'),
  III: chord('F1', 'F3 A3 C4', 'A3 C4 F4', 'C4 F4 A4', 'F4 C5', 'F2', 'F2'),
  V: chord('A1', 'E3 A3 C#4', 'A3 C#4 E4', 'C#4 E4 A4', 'A4 E5', 'A2', 'A2'),
  I: chord('D2', 'D3 F#3 A3', 'A3 D4 F#4', 'D4 F#4 A4', 'A4 D5', 'D3', 'D2'),
} as const satisfies Readonly<Record<string, Chord>>;
export type ChordName = keyof typeof CHORDS;

export const BEATS = 4;
export const harmony = (text: string): Held<ChordName>[][] => progression(text, CHORDS, BEATS);
export const line = (text: string): Tune => measured(text, BEATS);

/** The Vale's theme, the raid's one: D rising through the Phrygian E flat to G and falling home, then lifting to B
 *  flat and falling through the whole mode. Low, for the choir and the organ. */
export const THEME_TEXT =
  'D3:2 Eb3:1 F3:1 | G3:3 F3:1 | Eb3:1.5 D3:.5 C3:1 Eb3:1 | D3:4' +
  ' | F3:2 G3:1 A3:1 | Bb3:2 A3:1 G3:1 | F3:1 Eb3:1 D3:1 C3:1 | D3:4';
export const THEME = line(THEME_TEXT);
/** Its second strain, the cello's or the horn's: the theme's head turned upward and answered. */
export const STRAIN = line(
  'A3:3 G3:1 | F3:2 Eb3:2 | D3:1 F3:1 A3:1 Bb3:1 | A3:4' +
    ' | C4:2 Bb3:1 A3:1 | G3:2 F3:1 Eb3:1 | D3:1.5 Eb3:.5 F3:1 Eb3:1 | D3:4',
);

/** How the Vale's songs are pressed: gently, their peaks held under a soft ceiling three decibels under the clip. */
export const PRESS: Press = { threshold: -20, knee: 12, ratio: 3, attack: 0.012, release: 0.25, out: 2.2, ceiling: -3 };
export const LEVEL = 1.4;
/** A sting plays once: nothing wraps round, and a held note stops at its end. */
export const ONCE: Edge = { wrap: false, clip: true, hold: true, restrike: true };
