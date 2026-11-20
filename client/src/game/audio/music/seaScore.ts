// The sea's six songs for a band of fiddle, flute, whistle, accordion, harp and bodhran over strings, horns and
// timpani: the still sea (6/8, D Dorian, the raised sixth the sea's colour, the harp rolling the chord over a drone),
// the open sea (G with its flat seventh borrowed, the fiddle over the accordion's off-beats), the storm (D Aeolian,
// the low strings driving in eighths under stabs in open fifths: tense, never a villain's), the sea at night (3/4,
// A Dorian, sparse), landfall (3/4, D Mixolydian, broad: the fiddle over held strings and horn) and the sea fight (D minor, a snare's march, a swashbuckler's turns on the
// minor four and the falling i-VII-VI-V). Each loops on its bar line; each track has its own layer in each song.

import { type Role, type Song, type Tune, type Voice, type Writer, lay, makeSong, tune } from './score.ts';

type Track =
  | 'fiddle'
  | 'flute'
  | 'whistle'
  | 'accordion'
  | 'harp'
  | 'pizz'
  | 'strings'
  | 'cello'
  | 'bass'
  | 'choir'
  | 'horn'
  | 'brass'
  | 'timpani'
  | 'bells'
  | 'drive';
type Drum = 'kick' | 'snare' | 'bodhran' | 'bodhranTop' | 'tom' | 'crash' | 'ride';
type Write = Writer<Track, Drum>;
export type SeaSong = 'calm' | 'open' | 'storm' | 'night' | 'landfall' | 'fight';

/** Each song's tempo (quarter notes a minute), length in bars, quarter notes a bar (6/8 is three), and level, the
 *  last raised by LIFT so a fight at sea plays near a boss's loudness (-20 dBFS against -18) without a press. */
const LIFT = Math.SQRT2;
const SHAPE: Readonly<Record<SeaSong, { bpm: number; bars: number; beats: number; level: number }>> = {
  calm: { bpm: 84, bars: 64, beats: 3, level: 2.8 * LIFT },
  open: { bpm: 100, bars: 48, beats: 4, level: 2 * LIFT },
  storm: { bpm: 126, bars: 48, beats: 4, level: 2.1 * LIFT },
  night: { bpm: 66, bars: 32, beats: 3, level: 2.4 * LIFT },
  landfall: { bpm: 88, bars: 48, beats: 3, level: 2.4 * LIFT },
  fight: { bpm: 144, bars: 48, beats: 4, level: 1.95 * LIFT },
};

/** The fiddle bowed quicker than the bank's strings, a pair a few cents apart; the accordion's reeds tuned apart, the
 *  musette's beat; the strings and the choir an ensemble; the drive a cello that speaks and stops inside its note, so
 *  repeated strikes of one key never cancel each other. */
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
  accordion: { unison: 2, cents: 14, spread: 0.3 },
  strings: { attack: 0.18, release: 0.8, index: 1.6, idxDecay: 2, unison: 3, cents: 10, spread: 0.5 },
  cello: { attack: 0.07, unison: 2, cents: 6, spread: 0.2 },
  choir: { mod: 1, index: 1.1, idxDecay: 2, attack: 0.35, release: 1, unison: 3, cents: 12, spread: 0.45 },
  horn: { attack: 0.06, index: 2.6, unison: 2, cents: 6, spread: 0.25 },
  drive: { attack: 0.012, decay: 0.08, sustain: 0.75, release: 0.05, unison: 2, cents: 6, spread: 0.2 },
};

/** [program, level, place] by track: the band about the middle, the fiddle a touch left, the whistle and the flute
 *  right, the harp left of them and the pizzicato right, the horns left and the brass right. */
const MIX: Readonly<Record<Track, readonly [number, number, number]>> = {
  fiddle: [40, 104, 56],
  flute: [73, 98, 72],
  whistle: [78, 90, 78],
  accordion: [21, 94, 46],
  harp: [46, 100, 40],
  pizz: [45, 88, 84],
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
const ROLES: Readonly<Record<SeaSong, { readonly kit: Role; readonly tracks: Partial<Record<Track, Role>> }>> = {
  calm: { kit: 'pulse', tracks: { strings: 'tension', pizz: 'pulse', choir: 'peak', flute: 'lead', whistle: 'lead' } },
  open: { kit: 'pulse', tracks: { accordion: 'pulse', fiddle: 'lead', whistle: 'peak', horn: 'peak' } },
  storm: {
    kit: 'combat',
    tracks: { drive: 'tension', choir: 'tension', timpani: 'combat', horn: 'lead', strings: 'lead', brass: 'peak' },
  },
  night: { kit: 'pulse', tracks: { cello: 'tension', bells: 'tension', flute: 'lead' } },
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

function seaSong(key: SeaSong, write: (w: Write) => void): Song {
  const { bpm, bars, beats, level } = SHAPE[key];
  const roles = ROLES[key];
  const tracks = Object.fromEntries(
    (Object.keys(MIX) as Track[]).map((track) => {
      const [program, volume, pan] = MIX[track];
      const voice = VOICES[track];
      return [track, { program, volume, pan, role: roles.tracks[track] ?? 'bed', ...(voice ? { voice } : {}) }];
    }),
  ) as Record<Track, { program: number; volume: number; pan: number; role: Role; voice?: Voice }>;
  const kit = { volume: 100, role: roles.kit, keys: KEYS, drums: DRUMS };
  return makeSong({ name: `sea-${key}`, bpm, bars, beatsPerBar: beats, tracks, kit, level }, write);
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
type ChordName = keyof typeof CHORD;

/** A pitch class in an octave (C4 is 60). */
const inOctave = (pitchClass: number, octave: number): number => 12 * (octave + 1) + pitchClass;
/** The chord's tones from its root in `octave` upward, root, third, fifth and each an octave over, `count` of them. */
function stack(name: ChordName, octave: number, count = 6): number[] {
  const [root, third, fifth] = CHORD[name];
  const low = inOctave(root, octave);
  const tones = [low, low + ((third - root + 12) % 12), low + ((fifth - root + 12) % 12)];
  return Array.from({ length: count }, (unused, i) => (tones[i % 3] ?? low) + 12 * Math.floor(i / 3));
}
/** The chord's closed voicing over `low`: its three tones, the lowest at or above `low`. */
function voicing(name: ChordName, low: number): number[] {
  const classes: readonly number[] = CHORD[name];
  const tones: number[] = [];
  for (let n = low; tones.length < 3; n++) if (classes.includes(((n % 12) + 12) % 12)) tones.push(n);
  return tones;
}
/** A bass note under E1, the contrabass's lowest string, is played an octave up. */
const floored = (n: number): number => (n < 28 ? n + 12 : n);
const rootOf = (name: ChordName): number => CHORD[name][0];

/** The tunes, each bar whole in its song's bar. */
const TUNES = {
  calmA: tune(
    'A4:1.5 D5:.5 C5:.5 A4:.5 | B4:1 A4:.5 G4:1 A4:.5 | F4:1.5 E4:.5 D4:.5 E4:.5 | G4:1 E4:.5 C4:1.5 | A4:1.5 C5:1 A4:.5 | G4:1 E4:.5 G4:1 C5:.5 | B4:1.5 A4:.5 G4:.5 B4:.5 | A4:3' +
      ' | A4:1 D5:.5 E5:1 F5:.5 | G5:1.5 F5:.5 E5:.5 D5:.5 | F5:1 E5:.5 D5:1 A4:.5 | C5:1.5 G4:1.5 | A4:1 C5:.5 F5:1 E5:.5 | E5:1.5 D5:.5 C5:.5 E5:.5 | D5:1 B4:.5 G4:1 B4:.5 | D5:3',
  ),
  calmB: tune(
    'C5:1.5 A4:1.5 | G4:1 E4:.5 G4:1.5 | B4:1 D5:.5 B4:1 G4:.5 | A4:3 | C5:.5 D5:.5 C5:.5 A4:1.5 | G4:.5 A4:.5 G4:.5 E4:1.5 | E4:1 A4:.5 C5:1 B4:.5 | A4:3' +
      ' | F5:1.5 E5:1 D5:.5 | D5:1.5 B4:1.5 | E5:1 D5:.5 B4:1 G4:.5 | A4:1.5 E5:1.5 | F5:1 E5:.5 D5:1 C5:.5 | E5:1.5 G4:1.5 | B4:1 A4:.5 G4:1 B4:.5 | D5:3',
  ),
  openA: tune(
    'D4:.5 G4:1 G4:.5 G4:.5 A4:.5 B4:1 | C5:1 B4:.5 A4:.5 G4:1 E4:1 | D4:1 G4:.5 A4:.5 B4:1 D5:1 | C5:1 A4:1 F#4:1 D4:1' +
      ' | D4:.5 G4:1 G4:.5 G4:.5 A4:.5 B4:1 | C5:1 A4:.5 C5:.5 F5:1 E5:.5 D5:.5 | D5:1 A4:1 B4:.5 A4:.5 F#4:1 | G4:3 r:1',
  ),
  openB: tune(
    'E5:1.5 D5:.5 C5:1 E5:1 | D5:1.5 B4:.5 G4:1 B4:1 | C5:1 E5:1 G5:1 E5:1 | D5:2 A4:1 F#4:1' +
      ' | E5:1 D5:.5 B4:.5 G4:1 B4:1 | C5:1 B4:.5 A4:.5 G4:1 E4:1 | D4:1 F#4:1 A4:1 C5:1 | B4:1 A4:.5 B4:.5 G4:2',
  ),
  storm: tune(
    'D4:2 A4:1.5 G4:.5 | F4:1 D4:1 Bb3:2 | C4:1 E4:1 G4:1.5 F4:.5 | E4:1 D4:3 | D4:1 F4:1 A4:1 D5:1 | Bb4:2 A4:1 G4:1 | F4:1.5 G4:.5 A4:1 Bb4:1 | A4:4',
  ),
  night: tune(
    'E5:2 D5:1 | B4:3 | A4:1.5 B4:.5 A4:1 | E4:3 | G4:2 A4:1 | B4:1 D5:2 | E5:1.5 D5:.5 B4:1 | A4:3' +
      ' | C5:2 B4:1 | D5:3 | E5:2 A5:1 | G5:1.5 F#5:.5 E5:1 | F#5:2 E5:1 | D5:1 C5:1 B4:1 | B4:1.5 A4:.5 G4:1 | A4:3',
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
const chords = (text: string): ChordName[] => text.split(' ') as ChordName[];
const HARMONY = {
  calmA: chords('Dm G Dm C F C G Am Dm G Dm C F C G Dm'),
  calmB: chords('F C G Dm F C Am Am F G Em Am F C G Dm'),
  openA: chords('G C G D G F D G'),
  openB: chords('C G C D Em C D G'),
  storm: chords('Dm Bb C Dm Dm Gm Bb A'),
  stormB: chords('F C Dm Bb Gm Dm A A'),
  night: chords('Am G D Am C G Em Am C G Am Em D C Em Am'),
  landA: chords('D C G D Bm C G A D C G Em G C D D'),
  landB: chords('G D C G Em Bm C D G D C Am C G D D'),
  fightA: chords('Dm C Bb A Dm C Bb A'),
  fightB: chords('F C Gm A Dm Bb A Dm'),
};

const tunes = (w: Write, track: Track, first: number, bars: Tune, velocity: number, how = {}) =>
  lay(w, track, first, bars, velocity, how);

/** The still sea: A, A with the strings, B on the whistle, A with the choir and the whistle's echo over it. */
const calm = () =>
  seaSong('calm', (w) => {
    const progression = [...HARMONY.calmA, ...HARMONY.calmA, ...HARMONY.calmB, ...HARMONY.calmA];
    progression.forEach((name, bar) => {
      const tones = stack(name, 3);
      // The harp rolls the chord in eighths, root, fifth, octave, tenth, octave, fifth, softer off the beat.
      [tones[0], tones[2], tones[3], tones[4], tones[3], tones[2]].forEach((n, i) =>
        w.note('harp', bar, i * 0.5, 1.4, n ?? 0, i === 0 ? 74 : i === 3 ? 66 : 56),
      );
      if (bar % 2 === 0) {
        w.note('cello', bar, 0, 5.6, 'D3', 52);
        w.note('bass', bar, 0, 5.6, 'D2', 50);
      }
      if (bar >= 16)
        for (const n of voicing(name, 62)) w.note('strings', bar, 0, 2.9, n, bar >= 32 && bar < 48 ? 60 : 50);
      if (bar >= 48) for (const n of voicing(name, 57)) w.note('choir', bar, 0, 2.9, n, 46);
    });
    tunes(w, 'flute', 0, TUNES.calmA, 84, { legato: 0.96, accent: 6 });
    tunes(w, 'flute', 16, TUNES.calmA, 88, { legato: 0.96, accent: 6 });
    tunes(w, 'whistle', 32, TUNES.calmB, 82, { legato: 0.95, accent: 6 });
    tunes(w, 'pizz', 32, TUNES.calmB, 50, { octave: -1, legato: 0.5, accent: 4 });
    tunes(w, 'flute', 48, TUNES.calmA, 86, { legato: 0.96, accent: 6 });
    // The whistle an octave over the tune's second half, an eighth behind: the echo off the water.
    tunes(w, 'whistle', 56, TUNES.calmA, 54, { octave: 1, legato: 0.6, accent: 0, late: 0.5, from: 8, to: 16 });
  });

/** The bodhran in a 4/4 bar: the low skin on one and three, its top between, a push on the and of four. */
function bodhran(w: Write, bar: number, velocity: number): void {
  w.hit('bodhran', bar, 0, velocity);
  w.hit('bodhranTop', bar, 0.5, velocity - 34);
  w.hit('bodhranTop', bar, 1, velocity - 22);
  w.hit('bodhranTop', bar, 1.75, velocity - 36);
  w.hit('bodhran', bar, 2, velocity - 6);
  w.hit('bodhranTop', bar, 2.5, velocity - 34);
  w.hit('bodhranTop', bar, 3, velocity - 22);
  w.hit('bodhran', bar, 3.5, velocity - 18);
}

/** The open sea: the fiddle's tune twice through, the second with the accordion on it and the horns under, a breath of
 *  strings and whistle, then all of it for the last eight. */
const open = () =>
  seaSong('open', (w) => {
    const turn = [...HARMONY.openA, ...HARMONY.openB];
    [...turn, ...turn, ...turn].forEach((name, bar) => {
      const [root = 0, , fifth = 0] = stack(name, 2);
      const breath = bar >= 32 && bar < 40;
      w.note('bass', bar, 0, 0.9, floored(root - 12), breath ? 66 : 92);
      w.note('bass', bar, 2, 0.9, floored(fifth - 12), breath ? 60 : 86);
      w.note('cello', bar, 0, 1.8, root, breath ? 58 : 76);
      w.note('cello', bar, 2, 1.8, fifth, breath ? 54 : 72);
      if (!breath)
        for (const n of voicing(name, 59)) {
          w.note('accordion', bar, 1, 0.7, n, 70);
          w.note('accordion', bar, 3, 0.7, n, 66);
        }
      if (breath) for (const n of voicing(name, 62)) w.note('strings', bar, 0, 3.9, n, 62);
      if (bar >= 16 && bar < 32) for (const n of voicing(name, 55)) w.note('horn', bar, 0, 3.8, n, 64);
      if (bar >= 40) for (const n of voicing(name, 62)) w.note('strings', bar, 0, 3.9, n, 58);
      if (!breath) bodhran(w, bar, bar >= 40 ? 104 : 96);
    });
    for (const half of [0, 16, 40]) {
      if (half < 40) {
        tunes(w, 'fiddle', half, TUNES.openA, 98);
        tunes(w, 'fiddle', half + 8, TUNES.openB, 100);
      } else tunes(w, 'fiddle', half, TUNES.openB, 104);
    }
    tunes(w, 'accordion', 16, TUNES.openA, 84, { octave: -1 });
    tunes(w, 'accordion', 24, TUNES.openB, 86, { octave: -1 });
    tunes(w, 'whistle', 32, TUNES.openA, 80, { legato: 0.95 });
    tunes(w, 'accordion', 40, TUNES.openB, 88, { octave: -1 });
    tunes(w, 'whistle', 40, TUNES.openB, 74, { octave: 1, legato: 0.8, accent: 4 });
    w.hit('crash', 40, 0, 84);
    w.hit('crash', 0, 0, 70);
  });

/** The storm: the drive and the choir; the horn's theme; the second harmony with the stabs and the strings' theme high;
 *  a breath of drive and choir alone; the brass's theme over everything. */
const storm = () =>
  seaSong('storm', (w) => {
    const [first, second] = [HARMONY.storm, HARMONY.stormB];
    [...first, ...first, ...second, ...first, ...second, ...first].forEach((name, bar) => {
      const breath = bar >= 32 && bar < 40;
      const [root = 0, , fifth = 0] = stack(name, 2);
      // The drive in eighths on the root, the bar's last two leaning to the fifth and back; the bass on the beat.
      for (let i = 0; i < 8; i++) {
        const loud = (i % 2 === 0 ? 88 : 72) + (i === 0 ? 10 : 0) - (breath ? 18 : 0);
        w.note('drive', bar, i * 0.5, 0.42, i === 6 ? fifth : root, loud);
        if (i % 2 === 0) w.note('bass', bar, i * 0.5, 0.45, floored(root - 12), breath ? 66 : 90);
      }
      if (!breath) {
        w.note('timpani', bar, 0, 0.9, inOctave(rootOf(name), 2), 104);
        w.note('timpani', bar, 2, 0.9, inOctave(rootOf(name), 2), 92);
        if (bar % 4 === 3) for (let i = 0; i < 8; i++) w.note('timpani', bar, 2 + i * 0.25, 0.24, 'A2', 60 + i * 6);
        if (bar >= 16)
          for (const n of [root + 12, fifth + 12, root + 24]) {
            w.note('brass', bar, 0, 0.5, n, 96);
            w.note('brass', bar, 1.5, 0.4, n, 84);
          }
      }
      for (const n of voicing(name, 57)) w.note('choir', bar, 0, 3.9, n, breath ? 70 : 62);
      if (bar % 8 === 0 && !breath) w.hit('crash', bar, 0, 92);
      if (!breath) {
        w.hit('kick', bar, 0, 90);
        w.hit('kick', bar, 2, 82);
      }
      // The unrest: repeated sixteenths, high and soft, over the second harmony.
      if ((bar >= 16 && bar < 24) || bar >= 40)
        for (let i = 0; i < 16; i++)
          for (const n of voicing(name, 69).slice(0, 2))
            w.note('drive', bar, i * 0.25, 0.22, n, 46 + (i % 4 === 0 ? 10 : 0));
    });
    tunes(w, 'horn', 8, TUNES.storm, 96);
    tunes(w, 'strings', 24, TUNES.storm, 84, { octave: 1, legato: 0.96 });
    tunes(w, 'horn', 40, TUNES.storm, 98);
    tunes(w, 'brass', 40, TUNES.storm, 92, { octave: 1 });
  });

/** The sea at night: the tune, then again with the cello under it and the flute's answer an octave down. */
const night = () =>
  seaSong('night', (w) => {
    [...HARMONY.night, ...HARMONY.night].forEach((name, bar) => {
      // The harp's broken chord: the root on one, the fifth and the tenth on two, the octave on three.
      const [root = 0, , fifth = 0, octave = 0, tenth = 0] = stack(name, 3);
      w.note('harp', bar, 0, 2.8, root, 62);
      w.note('harp', bar, 1, 1.8, fifth, 48);
      w.note('harp', bar, 1, 1.8, tenth, 46);
      w.note('harp', bar, 2, 0.9, octave, 44);
      for (const n of voicing(name, 57)) w.note('choir', bar, 0, 2.9, n, 40);
      if (bar >= 16) w.note('cello', bar, 0, 2.9, root - 12, 50);
    });
    tunes(w, 'flute', 0, TUNES.night, 76, { legato: 0.97, accent: 4 });
    tunes(w, 'flute', 16, TUNES.night, 72, { legato: 0.97, accent: 4, to: 8 });
    tunes(w, 'flute', 24, TUNES.night, 70, { octave: -1, legato: 0.97, accent: 4, from: 8 });
    w.note('bells', 0, 0, 6, 'A3', 40);
    w.note('bells', 16, 0, 6, 'E4', 36);
  });

/** Landfall, the coast sighted and home: broad, in D with its flat seventh. The fiddle's tune over held strings, cello
 *  and horn, the harp rolling each chord up, the bodhran soft on the bar; the whistle's tune over the fiddle's; the
 *  first tune again with the flute on it, the horn an octave under, the choir, and the harbour's bell. */
const landfall = () =>
  seaSong('landfall', (w) => {
    [...HARMONY.landA, ...HARMONY.landB, ...HARMONY.landA].forEach((name, bar) => {
      const [root = 0, , fifth = 0, octave = 0, tenth = 0] = stack(name, 3);
      const home = bar >= 32;
      w.note('bass', bar, 0, 2.9, floored(root - 12), 58);
      w.note('cello', bar, 0, 2.9, root, 58);
      for (const n of voicing(name, 57)) w.note('strings', bar, 0, 2.9, n, home ? 62 : 54);
      if (!home) for (const n of voicing(name, 57).slice(0, 2)) w.note('horn', bar, 0, 2.9, n, 48);
      if (home) for (const n of voicing(name, 57)) w.note('choir', bar, 0, 2.9, n, 46);
      w.note('harp', bar, 0, 2.8, root, 66);
      w.note('harp', bar, 1, 1.8, fifth, 52);
      w.note('harp', bar, 1, 1.8, tenth, 50);
      w.note('harp', bar, 2, 0.9, octave, 48);
      w.hit('bodhran', bar, 0, home ? 84 : 74);
      w.hit('bodhranTop', bar, 2, home ? 46 : 38);
      if (bar % 16 === 15) for (let i = 0; i < 8; i++) w.note('timpani', bar, 1 + i * 0.25, 0.24, 'D2', 40 + i * 6);
    });
    tunes(w, 'fiddle', 0, TUNES.landA, 88, { legato: 0.97, accent: 4 });
    tunes(w, 'whistle', 16, TUNES.landB, 92, { legato: 0.96, accent: 4 });
    tunes(w, 'fiddle', 16, TUNES.landUnder, 70, { legato: 0.98, accent: 2 });
    tunes(w, 'fiddle', 32, TUNES.landA, 92, { legato: 0.97, accent: 4 });
    tunes(w, 'flute', 32, TUNES.landA, 74, { legato: 0.97, accent: 2 });
    tunes(w, 'horn', 32, TUNES.landA, 72, { octave: -1, legato: 0.97, accent: 2 });
    w.note('timpani', 32, 0, 0.9, 'D2', 88);
    w.note('bells', 32, 0, 6, 'D4', 74);
    w.note('bells', 0, 0, 6, 'A3', 62);
  });

/** A sea fight: the drums and the drive; the brass's theme, A and B; the strings and the fiddle on it with the choir;
 *  then the whole band on it, the horns an octave under the brass. */
const fight = () =>
  seaSong('fight', (w) => {
    const [first, second] = [HARMONY.fightA, HARMONY.fightB];
    [...first, ...first, ...second, ...first, ...first, ...second].forEach((name, bar) => {
      const [root = 0, t = 0, fifth = 0] = stack(name, 3);
      for (let i = 0; i < 8; i++)
        w.note('drive', bar, i * 0.5, 0.42, i % 2 === 0 ? root - 12 : fifth - 12, i === 0 ? 96 : i % 2 === 0 ? 84 : 70);
      for (let i = 0; i < 4; i++) w.note('bass', bar, i, 0.8, floored(root - 24), i === 0 ? 98 : 86);
      w.note('timpani', bar, 0, 0.9, root - 12, 100);
      w.note('timpani', bar, 3, 0.4, fifth - 24, 84);
      // The march: the kick on one and three, the snare on two and four with its drag before four.
      w.hit('kick', bar, 0, 98);
      w.hit('kick', bar, 2, 90);
      w.hit('snare', bar, 1, 92);
      w.hit('snare', bar, 2.75, 54);
      w.hit('snare', bar, 3, 96);
      if (bar % 4 === 3) for (let i = 0; i < 4; i++) w.hit('tom', bar, 3 + i * 0.25, 72 + i * 8);
      if (bar % 8 === 0) w.hit('crash', bar, 0, 96);
      if (bar < 8 || bar >= 32)
        for (const n of [root, t, fifth]) {
          w.note('brass', bar, 0, 0.45, n, 92);
          w.note('brass', bar, 1.5, 0.4, n, 82);
        }
      if (bar >= 24) for (const n of voicing(name, 57)) w.note('choir', bar, 0, 3.9, n, bar >= 32 ? 66 : 58);
      if (bar >= 8 && bar < 32) for (const n of voicing(name, 62)) w.note('strings', bar, 0, 3.9, n, 52);
    });
    tunes(w, 'brass', 8, TUNES.fightA, 100);
    tunes(w, 'brass', 16, TUNES.fightB, 102);
    tunes(w, 'fiddle', 24, TUNES.fightA, 98);
    tunes(w, 'strings', 24, TUNES.fightA, 80, { octave: 1, legato: 0.96 });
    tunes(w, 'brass', 32, TUNES.fightA, 104);
    tunes(w, 'horn', 32, TUNES.fightA, 92, { octave: -1 });
    tunes(w, 'brass', 40, TUNES.fightB, 106);
    tunes(w, 'horn', 40, TUNES.fightB, 94, { octave: -1 });
  });

/** The six songs. */
export const seaSongs = (): Readonly<Record<SeaSong, Song>> => ({
  calm: calm(),
  open: open(),
  storm: storm(),
  night: night(),
  landfall: landfall(),
  fight: fight(),
});
