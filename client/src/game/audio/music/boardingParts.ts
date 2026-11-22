// The Boarding's crew and its harmony: the instruments, the kit, the chords in E Phrygian, the fanfare and the boss's
// motif, and the figures every song of it is built from (the drums, the bed, the low strings, the chant, the shrieks,
// the braam, the swell), each that drives in three feels; the songs are boardingScore.ts.

import { type Press, type Tune, type Writer, lay, midiNote, tune } from './score.ts';

export type Track =
  | 'ostinato'
  | 'bass'
  | 'strings'
  | 'brass'
  | 'choir'
  | 'organ'
  | 'timpani'
  | 'horn'
  | 'harp'
  | 'bells'
  | 'hit'
  | 'pizz'
  | 'trem'
  | 'swell'
  | 'chant';
export type Drum =
  | 'kick'
  | 'snare'
  | 'rim'
  | 'lowTom'
  | 'hat'
  | 'highFloorTom'
  | 'tom'
  | 'openHat'
  | 'lowMidTom'
  | 'hiMidTom'
  | 'crash'
  | 'chinese'
  | 'crash2'
  | 'woodHi'
  | 'woodLo'
  | 'surdo';
export type Write = Writer<Track, Drum>;

/** The horn and the brass left of the middle, the drums and the low brass at it, the harp and the bells apart, the
 *  chant across from the shrieks. The sections are ensembles; only the hit and the low strings keep a sub, so the
 *  fight is not all under 100 Hz; the swell is 1.7 s of inharmonic shimmer rising. */
export const TRACKS = {
  ostinato: {
    program: 57,
    volume: 112,
    pan: 58,
    role: 'pulse',
    voice: {
      attack: 0.006,
      decay: 0.12,
      sustain: 0.5,
      release: 0.07,
      index: 5,
      idxDecay: 0.16,
      unison: 2,
      cents: 7,
      spread: 0.2,
    },
  },
  bass: { program: 32, volume: 100, pan: 64, role: 'bed', voice: { index: 2.2 } },
  strings: {
    program: 48,
    volume: 104,
    pan: 88,
    role: 'bed',
    voice: { attack: 0.14, release: 0.7, index: 2, idxDecay: 2, unison: 3, cents: 12, spread: 0.5 },
  },
  brass: {
    program: 61,
    volume: 120,
    pan: 44,
    role: 'lead',
    voice: { attack: 0.04, index: 5, idxDecay: 0.7, unison: 3, cents: 9, spread: 0.35 },
  },
  choir: {
    program: 52,
    volume: 108,
    pan: 76,
    role: 'peak',
    voice: { mod: 1, index: 1.3, idxDecay: 2, attack: 0.3, release: 0.9, unison: 3, cents: 14, spread: 0.45 },
  },
  organ: { program: 19, volume: 80, pan: 64, role: 'bed', voice: { unison: 2, cents: 4, spread: 0.3 } },
  timpani: { program: 47, volume: 114, pan: 64, role: 'combat', voice: { decay: 0.9, release: 0.5 } },
  horn: {
    program: 60,
    volume: 116,
    pan: 38,
    role: 'lead',
    voice: { attack: 0.06, index: 3, idxDecay: 0.7, unison: 2, cents: 6, spread: 0.25 },
  },
  harp: { program: 46, volume: 96, pan: 30, role: 'bed', voice: { unison: 2, cents: 5, spread: 0.3 } },
  bells: { program: 14, volume: 96, pan: 98, role: 'tension', voice: { unison: 2, cents: 3, spread: 0.3 } },
  hit: {
    program: 55,
    volume: 108,
    pan: 64,
    role: 'peak',
    voice: { index: 4.5, decay: 0.5, release: 0.35, unison: 2, cents: 15, sub: 0.35, spread: 0.4 },
  },
  pizz: {
    program: 45,
    volume: 104,
    pan: 72,
    role: 'pulse',
    voice: { attack: 0.003, decay: 0.15, sustain: 0.02, release: 0.08, index: 3.4, idxDecay: 0.07, sub: 0.15 },
  },
  trem: {
    program: 44,
    volume: 92,
    pan: 100,
    role: 'tension',
    voice: {
      attack: 0.02,
      decay: 0.1,
      sustain: 0.8,
      release: 0.12,
      index: 2.4,
      idxDecay: 0.8,
      unison: 2,
      cents: 16,
      spread: 0.6,
    },
  },
  swell: {
    program: 119,
    volume: 86,
    pan: 64,
    role: 'tension',
    voice: { mod: 3.73, index: 7, idxDecay: 4, attack: 1.7, decay: 0.02, sustain: 1, release: 0.05, gain: 0.5 },
  },
  chant: {
    program: 53,
    volume: 104,
    pan: 50,
    role: 'peak',
    voice: {
      mod: 2,
      index: 1.8,
      idxDecay: 0.3,
      attack: 0.02,
      decay: 0.12,
      sustain: 0.65,
      release: 0.12,
      unison: 3,
      cents: 10,
      spread: 0.4,
    },
  },
} as const;

/** The crew's kit: the taiko long and falling with its beater's click, the toms and the kick the same, the snare a
 *  crack over a skin, the cymbals long; the taiko is the tension's heartbeat. */
export const KIT = {
  volume: 118,
  role: 'combat',
  roles: { surdo: 'tension' },
  keys: {
    kick: 36,
    snare: 38,
    rim: 40,
    lowTom: 41,
    hat: 42,
    highFloorTom: 43,
    tom: 45,
    openHat: 46,
    lowMidTom: 47,
    hiMidTom: 48,
    crash: 49,
    chinese: 52,
    crash2: 57,
    woodHi: 76,
    woodLo: 77,
    surdo: 87,
  },
  drums: {
    kick: { hz: 52, decay: 0.38, gain: 1.15, click: 0.55 },
    surdo: { hz: 64, decay: 0.95, gain: 1.3, drop: 0.7, click: 0.45 },
    lowTom: { hz: 82, decay: 0.55, gain: 1, click: 0.3 },
    highFloorTom: { hz: 100, decay: 0.5, click: 0.3 },
    tom: { hz: 122, decay: 0.45, click: 0.3 },
    lowMidTom: { hz: 150, decay: 0.4, click: 0.3 },
    hiMidTom: { hz: 180, decay: 0.38, click: 0.3 },
    snare: { hz: 2000, q: 0.7, decay: 0.24, gain: 0.95, body: 185 },
    rim: { hz: 2600, q: 0.9, decay: 0.1, gain: 0.7, body: 220 },
    crash: { decay: 2, q: 0.45, gain: 0.85 },
    crash2: { decay: 2.6, q: 0.4, gain: 0.9 },
    chinese: { decay: 1.3, q: 0.55 },
    hat: { hz: 8000, q: 0.8, decay: 0.05, gain: 0.85 },
    openHat: { hz: 7000, q: 0.7, decay: 0.28, gain: 0.7 },
    woodHi: { click: 0.3 },
    woodLo: { click: 0.3 },
  },
} as const;

/** The press lets a drum's first 12 ms through and presses at 3:1 under a soft ceiling three decibels under the clip;
 *  DRIVE sets the first phase at -18.5 dBFS, the others keeping their rise over it. */
const PRESS = { threshold: -18, knee: 12, ratio: 3, attack: 0.012, release: 0.25, ceiling: -3 } as const;
const DRIVE = 0.31;
export const press = (out: number): Press => ({ ...PRESS, out: out * DRIVE });
export const SPEC = {
  tracks: TRACKS,
  kit: KIT,
  edge: { wrap: false, clip: true, hold: true, restrike: false },
} as const;

export const notes = (text: string): readonly string[] => text.split(' ');
/** A chord's bass, timpani, pad, strings, choir, ostinato root and stab (open fifths where struck). */
const chord = (bass: string, timp: string, pad: string, str: string, choir: string, ost: string, stab: string) => ({
  bass,
  timp,
  pad: notes(pad),
  str: notes(str),
  choir: notes(choir),
  ost,
  stab: notes(stab),
});
export const CHORDS = {
  Em: chord('E1', 'E2', 'E3 B3 E4', 'E4 G4 B4', 'E3 B3 G4', 'E2', 'E3 B3 E4'),
  F: chord('F1', 'C2', 'F2 C3 F3', 'F4 A4 C5', 'F2 C3 A3', 'F2', 'F2 C3 F3'),
  Dm: chord('D2', 'D2', 'D3 A3 D4', 'D4 F4 A4', 'D3 A3 F4', 'D2', 'D3 A3 D4'),
  Am: chord('A1', 'A2', 'A2 E3 A3', 'C4 E4 A4', 'A2 E3 C4', 'A1', 'A2 E3 A3'),
  C: chord('C2', 'C2', 'C3 G3 C4', 'C4 E4 G4', 'C3 G3 E4', 'C2', 'C3 G3 C4'),
  Bdim: chord('B1', 'B2', 'B2 F3 B3', 'B3 D4 F4', 'B2 F3 D4', 'B1', 'B2 F3 B3'),
  E: chord('E1', 'E2', 'E3 B3 E4', 'E4 G#4 B4', 'E3 B3 G#4', 'E2', 'E3 B3 E4'),
  A: chord('A1', 'A2', 'A2 E3 A3', 'C#4 E4 A4', 'A2 E3 C#4', 'A1', 'A2 E3 A3'),
  B: chord('B1', 'B2', 'B2 F#3 B3', 'D#4 F#4 B4', 'B2 F#3 D#4', 'B1', 'B2 F#3 B3'),
  Csm: chord('C#2', 'C#2', 'C#3 G#3 C#4', 'C#4 E4 G#4', 'C#3 G#3 E4', 'C#2', 'C#3 G#3 C#4'),
};
export type ChordName = keyof typeof CHORDS;
export const progression = (text: string): readonly ChordName[] => text.split(' ') as ChordName[];
/** The war's (F pressing on E), the third phase's, the hymn's in E major, the last stand's, and the end's, falling. */
export const WAR = progression('Em F Em F Dm F Bdim Em');
export const WAR_THREE = progression('Em F Bdim F Em F Dm Em');
export const HYMN = progression('E A E B Csm A B E');
export const COUNT = progression('Em F Em F Em F Bdim F');
export const END = progression('Em C Am F Em F Em Em');

/** The fanfare, whole (the hymn's) and broken; and the boss's own four bars, written into its phases. */
export const FANFARE = tune('E4:.5 E4:.5 B4:1 G#4:1 E5:1');
export const BROKEN = tune('E4:.5 E4:.5 B4:1 G4:1 F4:1');
export const MOTIF = tune('E4:1.5 E4:.5 D4:1 E4:1 | F4:2 E4:2 | G4:1.5 F4:.5 E4:1 D4:1 | E4:4');
export const line = (w: Write, first: number, bars: Tune, track: Track, velocity: number, octave = 0) =>
  lay(w, track, first, bars, velocity, { octave });

/** A roll from `start` for `beats`, a stroke each sixteenth, its velocity rising from `low` to `high`. */
function strokes(beats: number, low: number, high: number, play: (beat: number, velocity: number) => void): void {
  const count = Math.round(beats / 0.25);
  for (let i = 0; i < count; i++) play(i * 0.25, low + ((high - low) * i) / Math.max(1, count - 1));
}
export const rollNote = (
  w: Write,
  track: Track,
  bar: number,
  start: number,
  beats: number,
  n: string,
  low: number,
  high: number,
) => strokes(beats, low, high, (beat, velocity) => w.note(track, bar, start + beat, 0.225, n, velocity));
export const rollDrum = (w: Write, drum: Drum, bar: number, start: number, beats: number, low: number, high: number) =>
  strokes(beats, low, high, (beat, velocity) => w.hit(drum, bar, start + beat, velocity));

/** The 3-3-2 accents over a bar's eighths, and over each half bar's sixteenths. */
const ACCENT8 = [true, false, false, true, false, false, true, false];
const GALLOP16 = [0, 3, 6, 8, 11, 14];

/** The crew's three feels, a figure for each part that drives: the kick, the taiko's heartbeat (the tension's), the
 *  toms between the backbeat, the sixteenths the hats leave out, the fill closing each fourth bar; the bass's
 *  strikes driven and held; the sixteenths the ostinato leans into the next bar on (the half step last); the low
 *  strings' figure over the root (its fifth, its octave); and the strings' voicing. */
export const FEELS = [
  {
    kick: [0, 0.75, 1.5, 2, 2.75, 3.5],
    surdo: [0, 2],
    toms: [0.5, 1.5, 2.5, 3.5],
    gaps: [14],
    fill: 'down',
    struck: [
      [0, 1.4],
      [1.5, 1.4],
      [3, 0.9],
    ],
    held: [[0, 3.8]],
    lean: [12, 13, 14, 15],
    spiccato: [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 7, 0],
    voicing: 0,
  },
  {
    kick: [0, 1, 2, 2.5, 3],
    surdo: [0, 1.5, 3],
    toms: [1.25, 3.25],
    gaps: [6, 14],
    fill: 'snare',
    struck: [
      [0, 1.9],
      [2, 0.9],
      [3, 0.4],
      [3.5, 0.4],
    ],
    held: [
      [0, 1.9],
      [2, 1.9],
    ],
    lean: [14, 15],
    spiccato: [0, 12, 0, 7, 0, 12, 0, 7, 0, 12, 0, 7, 12, 7, 0, 0],
    voicing: 1,
  },
  {
    kick: [0, 0.75, 1.5, 2.5, 3],
    surdo: [0, 0.75, 2, 3.5],
    toms: [0.75, 2.75],
    gaps: [10, 14],
    fill: 'gallop',
    struck: [
      [0, 0.9],
      [0.75, 0.6],
      [1.5, 1.4],
      [3, 0.9],
    ],
    held: [
      [0, 2.9],
      [3, 0.9],
    ],
    lean: [13, 14, 15],
    spiccato: [0, 0, 7, 0, 0, 12, 0, 7, 0, 0, 7, 0, 12, 7, 12, 0],
    voicing: 2,
  },
] as const;
const feelOf = (feel: number) => FEELS[feel] ?? FEELS[0];

/** The war's drums for a bar in a feel (the kick, the taiko's heartbeat, the backbeat, the toms between, the hats'
 *  sixteenths, the open hat pushing into the next bar); at `drive` 3 the kick on every eighth, the taiko on every
 *  beat and the rim pushing. A fill closing each fourth bar, a crash each eighth. */
export function drums(w: Write, bar: number, drive: number, feel = 0): void {
  const { kick, surdo, toms, gaps, fill } = feelOf(feel);
  const strike = (drum: Drum, beat: number, velocity: number) => w.hit(drum, bar, beat, velocity);
  for (const beat of kick) strike('kick', beat, beat === 0 || beat === 2 ? 112 : 96);
  surdo.forEach((beat, i) => strike('surdo', beat, i ? 104 : 116));
  strike('snare', 1, 104);
  strike('snare', 3, 110);
  for (const beat of toms) strike('tom', beat, 78);
  for (let i = 0; i < 16; i++) if (!(gaps as readonly number[]).includes(i)) strike('hat', i * 0.25, i % 2 ? 58 : 78);
  strike('openHat', 3.5, 74);
  if (drive >= 3) {
    for (let i = 0; i < 8; i++) strike('kick', i * 0.5, 100);
    strike('surdo', 1, 100);
    strike('surdo', 3, 108);
    strike('rim', 1.75, 76);
    strike('rim', 3.75, 84);
  }
  if (bar % 4 === 3) {
    const count = drive >= 3 ? 8 : 4;
    if (fill === 'snare') rollDrum(w, 'snare', bar, 4 - count * 0.25, count * 0.25, 70, 116);
    else if (fill === 'gallop')
      for (const [drum, beat] of [
        ['lowMidTom', 2],
        ['tom', 2.75],
        ['lowTom', 3.5],
      ] as const) {
        strike(drum, beat, 104);
        strike('kick', beat, 108);
      }
    else {
      const down = ['hiMidTom', 'lowMidTom', 'tom', 'highFloorTom', 'lowTom'] as const;
      for (let i = 0; i < count; i++)
        strike(down[Math.floor((i * down.length) / count)], 4 - count * 0.25 + i * 0.25, 92 + (i * 24) / count);
    }
  }
  if (bar % 8 === 0) strike('crash2', 0, 104);
  if (bar % 8 === 4) strike('chinese', 0, 90);
}

/** The bed under a chord for a bar in a feel: the low brass's ostinato (eighths 3-3-2 at `drive` 1, leaning into the
 *  next bar at 2), the bass (struck at 2, held under it), the pad, and the strings (in the voicing of the feel
 *  `voicingShift` on from its own) and the choir as asked. */
export function bed(
  w: Write,
  bar: number,
  name: ChordName,
  { drive = 0, strings = true, choir = false, organ = 1, vel = 1, feel = 0, voicingShift = 0 },
) {
  const tones = CHORDS[name];
  const { struck, held, lean } = feelOf(feel);
  const { voicing } = feelOf((feel + voicingShift) % FEELS.length);
  if (drive >= 1)
    ACCENT8.forEach((accent, i) => w.note('ostinato', bar, i * 0.5, 0.4, tones.ost, (accent ? 110 : 76) * vel));
  if (drive >= 2)
    for (const sixteenth of lean)
      w.note('ostinato', bar, sixteenth * 0.25, 0.2, sixteenth === 15 ? midiNote(tones.ost) + 1 : tones.ost, 92 * vel);
  for (const [beat, beats] of drive >= 2 ? struck : held)
    w.note('bass', bar, beat, beats, tones.bass, (beat ? 92 : 100) * vel);
  if (organ > 0) for (const n of tones.pad) w.note('organ', bar, 0, 4, n, 78 * organ);
  const [low = 0, middle = 0, top = 0] = tones.str.map(midiNote);
  const voiced = voicing === 1 ? [top - 12, low, middle] : voicing === 2 ? [middle, top, low + 12] : [low, middle, top];
  if (strings) for (const n of voiced) w.note('strings', bar, 0, 4, n, 86 * vel);
  if (choir) for (const n of tones.choir) w.note('choir', bar, 0, 4, n, 92 * vel);
}

/** The low strings driving under everything in a feel's figure over the root, in sixteenths (or eighths), the 3-3-2
 *  accented. */
export function spiccato(w: Write, bar: number, name: ChordName, sixteenths: boolean, velocity: number, feel = 0) {
  const tones = CHORDS[name];
  const root = midiNote(tones.ost) + 12;
  const fifth = midiNote(tones.pad[1]) - midiNote(tones.pad[0]);
  const step = sixteenths ? 1 : 2;
  const figure = feelOf(feel).spiccato;
  for (let i = 0; i < 16; i += step) {
    const lift = figure[i] ?? 0;
    const accent = GALLOP16.includes(i) ? 18 : 0;
    w.note('pizz', bar, i * 0.25, step * 0.2, root + (lift === 7 ? fifth : lift), velocity + accent);
  }
}

/** The chant on the chord's root and fifth: in the 3-3-2 (HA . . HA . . HA HA), or in driving eighths. */
const CHANT = {
  a: [
    [0, 0.7],
    [1.5, 0.7],
    [3, 0.45],
    [3.5, 0.45],
  ],
  b: [
    [0, 0.4],
    [0.5, 0.4],
    [1, 0.4],
    [1.5, 0.9],
    [2.5, 0.4],
    [3, 0.9],
  ],
} as const;
export function chant(w: Write, bar: number, name: ChordName, figure: keyof typeof CHANT, velocity: number): void {
  const tones = CHORDS[name];
  const root = 60 + (midiNote(tones.ost) % 12);
  const fifth = root + midiNote(tones.pad[1]) - midiNote(tones.pad[0]);
  for (const [beat, beats] of CHANT[figure]) {
    w.note('chant', bar, beat, beats, root, velocity + (beat === 0 ? 10 : 0));
    w.note('chant', bar, beat, beats, fifth, velocity - 6);
  }
}

/** The shrieks: the tremolo strings on B5 over C6 in sixteenths for a bar. */
export function shrieks(w: Write, bar: number, velocity: number): void {
  for (let i = 0; i < 16; i++)
    for (const n of ['B5', 'C6']) w.note('trem', bar, i * 0.25, 0.22, n, velocity + (i % 4 === 0 ? 8 : 0));
}

/** A braam: the low brass's cluster held (on E with F over it), the orchestra hit, the timpani, the taiko, the long
 *  crash; never on the brass, whose bars the motifs hold. */
export function braam(w: Write, bar: number, name: ChordName, velocity: number): void {
  const tones = CHORDS[name];
  const root = midiNote(tones.ost);
  // Its lowest an octave under the root, where the low brass reaches it.
  for (const n of [root - 12 < 24 ? root : root - 12, root, root + 7, root + (name === 'Em' ? 13 : 12)])
    w.note('ostinato', bar, 0, 2.5, n, velocity);
  for (const n of tones.stab) w.note('hit', bar, 0, 1.5, n, velocity);
  w.note('timpani', bar, 0, 1, tones.timp, velocity);
  w.hit('surdo', bar, 0, velocity);
  w.hit('crash2', bar, 0, velocity - 4);
}

/** A swell into `bar`: the reverse cymbal rising 1.7 s to its downbeat, the timpani rolling up over the last beat. */
export function swellInto(w: Write, bar: number, bpm: number, velocity: number): void {
  const beats = (1.7 * bpm) / 60;
  for (const n of ['E6', 'F6']) w.note('swell', bar, -beats, beats, n, velocity);
  rollNote(w, 'timpani', bar - 1, 3, 1, 'E2', velocity - 40, velocity);
}
