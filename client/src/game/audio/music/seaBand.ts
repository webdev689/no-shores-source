// The sea's band: fiddle, flute, whistle, harp and bodhran over strings, horns and timpani, the instruments and the
// harmony its three songs share (the storm, landfall and the sea fight), each song giving the tracks their own layers.

import { type Role, type SongSpec, type Voice, type Writer, tune } from './score.ts';

export type Track =
  | 'fiddle'
  | 'flute'
  | 'whistle'
  | 'harp'
  | 'strings'
  | 'cello'
  | 'bass'
  | 'choir'
  | 'horn'
  | 'brass'
  | 'timpani'
  | 'bells'
  | 'drive';
export type Drum = 'kick' | 'snare' | 'bodhran' | 'bodhranTop' | 'tom' | 'crash' | 'ride';
export type Write = Writer<Track, Drum>;
/** The songs the band plays. */
export type BandSong = 'storm' | 'landfall' | 'fight';

/** Each song's tempo (quarter notes a minute), length in bars, quarter notes a bar (6/8 is three), and level, the
 *  last raised by LIFT so a fight at sea plays near a boss's loudness (-20 dBFS against -18) without a press. */
const LIFT = Math.SQRT2;
const SHAPE: Readonly<Record<BandSong, { bpm: number; beats: number; level: number }>> = {
  storm: { bpm: 126, beats: 4, level: 2.1 * LIFT },
  landfall: { bpm: 88, beats: 3, level: 2.4 * LIFT },
  fight: { bpm: 144, beats: 4, level: 1.95 * LIFT },
};

/** The fiddle bowed quicker than the bank's strings, a pair a few cents apart; the strings and the choir an ensemble;
 *  the drive a cello that speaks and stops inside its note, so repeated strikes of one key never cancel each other. */
const VOICES: Partial<Record<Track, Voice>> = {
  fiddle: {
    attack: 0.025,
    decay: 0.25,
    sustain: 0.8,
    release: 0.16,
    index: 2.2,
    idxDecay: 0.8,
    unison: 2,
    cents: 5,
    spread: 0.15,
  },
  strings: { attack: 0.18, release: 0.8, index: 1.6, idxDecay: 2, unison: 3, cents: 10, spread: 0.5 },
  cello: { attack: 0.07, unison: 2, cents: 6, spread: 0.2 },
  choir: { mod: 1, index: 1.1, idxDecay: 2, attack: 0.35, release: 1, unison: 3, cents: 12, spread: 0.45 },
  horn: { attack: 0.06, index: 2.6, unison: 2, cents: 6, spread: 0.25 },
  drive: { attack: 0.012, decay: 0.08, sustain: 0.75, release: 0.05, unison: 2, cents: 6, spread: 0.2 },
};

/** [program, level, place] by track: the band about the middle, the fiddle a touch left, the whistle and the flute
 *  right, the harp left of them, the horns left and the brass right. */
const MIX: Readonly<Record<Track, readonly [number, number, number]>> = {
  fiddle: [40, 104, 56],
  flute: [73, 98, 72],
  whistle: [78, 90, 78],
  harp: [46, 100, 40],
  strings: [48, 86, 70],
  cello: [42, 94, 52],
  bass: [43, 96, 64],
  choir: [52, 80, 64],
  horn: [60, 98, 44],
  brass: [61, 100, 82],
  timpani: [47, 100, 64],
  bells: [14, 70, 90],
  drive: [42, 94, 52],
};

/** Each song's layers: the bed and the tension are what a hostile ship closing brings in. */
const ROLES: Readonly<Record<BandSong, { readonly kit: Role; readonly tracks: Partial<Record<Track, Role>> }>> = {
  storm: {
    kit: 'combat',
    tracks: { drive: 'tension', choir: 'tension', timpani: 'combat', horn: 'lead', strings: 'lead', brass: 'peak' },
  },
  landfall: {
    kit: 'pulse',
    tracks: { horn: 'tension', fiddle: 'lead', whistle: 'lead', flute: 'peak', choir: 'peak' },
  },
  fight: {
    kit: 'combat',
    tracks: { drive: 'tension', timpani: 'tension', brass: 'lead', fiddle: 'lead', choir: 'peak', horn: 'peak' },
  },
};

const KEYS: Readonly<Record<Drum, number>> = {
  kick: 36,
  snare: 38,
  bodhran: 41,
  bodhranTop: 45,
  tom: 47,
  crash: 49,
  ride: 51,
};

/** The bodhran's low skin and its top, a kick, a snare with a body under its crack. */
const DRUMS = {
  bodhran: { hz: 74, decay: 0.34, gain: 1.1, drop: 0.8, click: 0.3 },
  bodhranTop: { hz: 140, decay: 0.12, gain: 0.7, click: 0.45 },
  kick: { hz: 56, decay: 0.32, gain: 1.05, click: 0.4 },
  snare: { hz: 1800, decay: 0.15, gain: 0.8, body: 190 },
};

/** A band song's spec, all but its length: its tempo, metre and level, every track in this song's layer. */
export function bandSpec(key: BandSong): Omit<SongSpec<Track, Drum>, 'bars'> {
  const { bpm, beats, level } = SHAPE[key];
  const roles = ROLES[key];
  const tracks = Object.fromEntries(
    (Object.keys(MIX) as Track[]).map((track) => {
      const [program, volume, pan] = MIX[track];
      const voice = VOICES[track];
      return [track, { program, volume, pan, role: roles.tracks[track] ?? 'bed', ...(voice ? { voice } : {}) }];
    }),
  ) as Record<Track, { program: number; volume: number; pan: number; role: Role; voice?: Voice }>;
  const kit = { volume: 100, role: roles.kit, keys: KEYS, drums: DRUMS };
  return { name: `sea-${key}`, bpm, beatsPerBar: beats, tracks, kit, level };
}

/** The chords as pitch classes from the root: root, third, fifth. */
const CHORD = {
  Dm: [2, 5, 9],
  D: [2, 6, 9],
  G: [7, 11, 2],
  Gm: [7, 10, 2],
  C: [0, 4, 7],
  F: [5, 9, 0],
  Am: [9, 0, 4],
  A: [9, 1, 4],
  Em: [4, 7, 11],
  Bm: [11, 2, 6],
  Bb: [10, 2, 5],
} as const;
export type ChordName = keyof typeof CHORD;

/** A pitch class in an octave (C4 is 60). */
export const inOctave = (pitchClass: number, octave: number): number => 12 * (octave + 1) + pitchClass;
/** The chord's tones from its root in `octave` upward, root, third, fifth and each an octave over, `count` of them. */
export function stack(name: ChordName, octave: number, count = 6): number[] {
  const [root, third, fifth] = CHORD[name];
  const low = inOctave(root, octave);
  const tones = [low, low + ((third - root + 12) % 12), low + ((fifth - root + 12) % 12)];
  return Array.from({ length: count }, (unused, i) => (tones[i % 3] ?? low) + 12 * Math.floor(i / 3));
}
/** The chord's closed voicing over `low`: its three tones, the lowest at or above `low`. */
export function voicing(name: ChordName, low: number): number[] {
  const classes: readonly number[] = CHORD[name];
  const tones: number[] = [];
  for (let n = low; tones.length < 3; n++) if (classes.includes(((n % 12) + 12) % 12)) tones.push(n);
  return tones;
}
/** A bass note under E1, the contrabass's lowest string, is played an octave up. */
export const floored = (n: number): number => (n < 28 ? n + 12 : n);
export const rootOf = (name: ChordName): number => CHORD[name][0];

/** The tunes, each bar whole in its song's bar. */
export const TUNES = {
  storm: tune(
    'D4:2 A4:1.5 G4:.5 | F4:1 D4:1 Bb3:2 | C4:1 E4:1 G4:1.5 F4:.5 | E4:1 D4:3 | D4:1 F4:1 A4:1 D5:1 | Bb4:2 A4:1 G4:1 | F4:1.5 G4:.5 A4:1 Bb4:1 | A4:4',
  ),
  landA: tune(
    'D5:2 E5:1 | E5:1.5 D5:.5 C5:1 | B4:2 D5:1 | A4:3 | F#5:2 E5:1 | E5:1.5 G5:.5 E5:1 | D5:2 B4:1 | E5:3' +
      ' | D5:2 E5:1 | G5:2 E5:1 | D5:1.5 B4:.5 G4:1 | B4:2 A4:1 | G4:1 B4:1 D5:1 | E5:2 C5:1 | D5:1.5 C5:.5 A4:1 | D5:3',
  ),
  landB: tune(
    'B5:2 A5:1 | F#5:2 D5:1 | E5:1.5 G5:.5 E5:1 | D5:3 | G5:2 E5:1 | F#5:2 D5:1 | E5:1 G5:1 C6:1 | A5:3' +
      ' | B5:2 A5:1 | F#5:2 A5:1 | G5:1.5 E5:.5 G5:1 | E5:2 A5:1 | G5:2 E5:1 | D5:2 G5:1 | F#5:2 E5:1 | D5:3',
  ),
  landUnder: tune(
    'G4:3 | F#4:2 A4:1 | G4:2 E4:1 | D4:3 | E4:3 | D4:2 F#4:1 | G4:3 | F#4:3' +
      ' | G4:3 | A4:2 F#4:1 | E4:2 G4:1 | A4:2 E4:1 | C5:2 G4:1 | B4:2 G4:1 | A4:3 | F#4:3',
  ),
  fightA: tune(
    'D4:1 A4:1.5 A4:.5 A4:1 | G4:.5 A4:.5 Bb4:1 A4:1 G4:1 | F4:1 D4:1 F4:1 Bb4:1 | A4:3 r:1' +
      ' | D5:1 C5:.5 A4:.5 D5:1 F5:1 | E5:1.5 D5:.5 C5:1 G4:1 | F5:1 D5:1 Bb4:.5 C5:.5 D5:1 | C#5:2 E5:1 A4:1',
  ),
  fightB: tune(
    'F5:1.5 E5:.5 F5:1 A5:1 | G5:1.5 F5:.5 E5:1 C5:1 | D5:1 G5:1 F5:1 D5:1 | E5:2 C#5:1 A4:1' +
      ' | D5:1 F5:1 A5:1.5 G5:.5 | F5:1 D5:1 F5:1 Bb5:1 | E5:1 C#5:1 E5:1 A5:1 | D5:3 r:1',
  ),
};

/** The harmony, a chord a bar, beside each tune. */
export const chords = (text: string): ChordName[] => text.split(' ') as ChordName[];
export const HARMONY = {
  storm: chords('Dm Bb C Dm Dm Gm Bb A'),
  stormB: chords('F C Dm Bb Gm Dm A A'),
  landA: chords('D C G D Bm C G A D C G Em G C D D'),
  landB: chords('G D C G Em Bm C D G D C Am C G D D'),
  fightA: chords('Dm C Bb A Dm C Bb A'),
  fightB: chords('F C Gm A Dm Bb A Dm'),
};
