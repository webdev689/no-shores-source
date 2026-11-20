// The Boarding: a boss's score in E Phrygian, E minor with its lowered second (F over E, a half step that never
// resolves). A fanfare on the horn rises E, G-sharp, B as a victor's would and falls on G natural and F: broken. Under
// it, a crew's drums in 3-3-2 (the kick galloping, a taiko on one and three), the low brass hammering the root, the
// low strings in sixteenths, a chant on the root and the fifth, tremolo strings shrieking B over C, a braam (the low
// brass's cluster, the orchestra hit, the taiko) at each phrase and a reverse cymbal swelling into it. Each song is in
// its own voices (sections in unison with a sub under the low ones, the taiko long with a beater's click). A wake of
// two bars swells into the first phase; the phases run 138, 144 and 152; the last stand, at 160, hammers E against F
// with a bell counting every bar. The boss beaten, the fanfare mended: a hymn in E major. The player fallen, the end.

import { type Press, type Song, type Tune, type Writer, lay, makeSong, midiNote, tune } from './score.ts';

type Track =
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
type Drum =
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
type Write = Writer<Track, Drum>;

/** The horn and the brass left of the middle, the drums and the low brass at it, the harp and the bells apart, the
 *  chant across from the shrieks. The sections are ensembles; only the hit and the low strings keep a sub, so the
 *  fight is not all under 100 Hz; the swell is 1.7 s of inharmonic shimmer rising. */
const TRACKS = {
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
const KIT = {
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
const press = (out: number): Press => ({ ...PRESS, out: out * DRIVE });
const SPEC = { tracks: TRACKS, kit: KIT, edge: { wrap: false, clip: true, hold: true, restrike: false } } as const;

const notes = (text: string): readonly string[] => text.split(' ');
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
const CHORDS = {
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
type ChordName = keyof typeof CHORDS;
const progression = (text: string): readonly ChordName[] => text.split(' ') as ChordName[];
/** The war's (F pressing on E), the third phase's, the hymn's in E major, the last stand's, and the end's, falling. */
const WAR = progression('Em F Em F Dm F Bdim Em');
const WAR_THREE = progression('Em F Bdim F Em F Dm Em');
const HYMN = progression('E A E B Csm A B E');
const COUNT = progression('Em F Em F Em F Bdim F');
const END = progression('Em C Am F Em F Em Em');

/** The fanfare, whole (the hymn's) and broken; and the boss's own four bars, written into its phases. */
const FANFARE = tune('E4:.5 E4:.5 B4:1 G#4:1 E5:1');
const BROKEN = tune('E4:.5 E4:.5 B4:1 G4:1 F4:1');
const MOTIF = tune('E4:1.5 E4:.5 D4:1 E4:1 | F4:2 E4:2 | G4:1.5 F4:.5 E4:1 D4:1 | E4:4');
const line = (w: Write, first: number, bars: Tune, track: Track, velocity: number, octave = 0) =>
  lay(w, track, first, bars, velocity, { octave });

/** A roll from `start` for `beats`, a stroke each sixteenth, its velocity rising from `low` to `high`. */
function strokes(beats: number, low: number, high: number, play: (beat: number, velocity: number) => void): void {
  const count = Math.round(beats / 0.25);
  for (let i = 0; i < count; i++) play(i * 0.25, low + ((high - low) * i) / Math.max(1, count - 1));
}
const rollNote = (
  w: Write,
  track: Track,
  bar: number,
  start: number,
  beats: number,
  n: string,
  low: number,
  high: number,
) => strokes(beats, low, high, (beat, velocity) => w.note(track, bar, start + beat, 0.225, n, velocity));
const rollDrum = (w: Write, drum: Drum, bar: number, start: number, beats: number, low: number, high: number) =>
  strokes(beats, low, high, (beat, velocity) => w.hit(drum, bar, start + beat, velocity));

/** The 3-3-2 accents over a bar's eighths, and the gallop: the 3-3-2 over each half bar's sixteenths. */
const ACCENT8 = [true, false, false, true, false, false, true, false];
const GALLOP = [0, 0.75, 1.5, 2, 2.75, 3.5];
const GALLOP16 = [0, 3, 6, 8, 11, 14];

/** The war's drums for a bar (the kick galloping, the taiko on one and three, the backbeat, the toms between, the
 *  hats' sixteenths, the open hat pushing into the next bar); at `drive` 3 the kick on every eighth, the taiko on
 *  every beat and the rim pushing. A fill down the toms closing each fourth bar, a crash each eighth. */
function drums(w: Write, bar: number, drive: number): void {
  const strike = (drum: Drum, beat: number, velocity: number) => w.hit(drum, bar, beat, velocity);
  for (const beat of GALLOP) strike('kick', beat, beat === 0 || beat === 2 ? 112 : 96);
  strike('surdo', 0, 116);
  strike('surdo', 2, 106);
  strike('snare', 1, 104);
  strike('snare', 3, 110);
  for (const beat of [0.5, 1.5, 2.5, 3.5]) strike('tom', beat, 78);
  for (let i = 0; i < 16; i++) if (i !== 14) strike('hat', i * 0.25, i % 2 ? 58 : 78);
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
    const toms = ['hiMidTom', 'lowMidTom', 'tom', 'highFloorTom', 'lowTom'] as const;
    for (let i = 0; i < count; i++)
      strike(toms[Math.floor((i * toms.length) / count)], 4 - count * 0.25 + i * 0.25, 92 + (i * 24) / count);
  }
  if (bar % 8 === 0) strike('crash2', 0, 104);
  if (bar % 8 === 4) strike('chinese', 0, 90);
}

/** The bed under a chord for a bar: the low brass's ostinato (eighths 3-3-2 at `drive` 1, the half step leaning into
 *  the next bar at 2), the bass (struck on the 3-3-2 at 2), the pad, and the strings and the choir as asked. */
function bed(w: Write, bar: number, name: ChordName, { drive = 0, strings = true, choir = false, organ = 1, vel = 1 }) {
  const tones = CHORDS[name];
  if (drive >= 1)
    ACCENT8.forEach((accent, i) => w.note('ostinato', bar, i * 0.5, 0.4, tones.ost, (accent ? 110 : 76) * vel));
  if (drive >= 2)
    for (let sixteenth = 12; sixteenth < 16; sixteenth++)
      w.note('ostinato', bar, sixteenth * 0.25, 0.2, sixteenth === 15 ? midiNote(tones.ost) + 1 : tones.ost, 92 * vel);
  const strikes =
    drive >= 2
      ? [
          [0, 1.4],
          [1.5, 1.4],
          [3, 0.9],
        ]
      : [[0, 3.8]];
  for (const [beat = 0, beats = 0] of strikes) w.note('bass', bar, beat, beats, tones.bass, (beat ? 92 : 100) * vel);
  if (organ > 0) for (const n of tones.pad) w.note('organ', bar, 0, 4, n, 78 * organ);
  if (strings) for (const n of tones.str) w.note('strings', bar, 0, 4, n, 86 * vel);
  if (choir) for (const n of tones.choir) w.note('choir', bar, 0, 4, n, 92 * vel);
}

/** The low strings driving under everything: the root, its fifth and its octave in sixteenths (or eighths), the
 *  3-3-2 accented. */
const SPICCATO = [0, 0, 12, 0, 7, 0, 12, 0, 0, 0, 12, 0, 7, 12, 7, 0];
function spiccato(w: Write, bar: number, name: ChordName, sixteenths: boolean, velocity: number): void {
  const tones = CHORDS[name];
  const root = midiNote(tones.ost) + 12;
  const fifth = midiNote(tones.pad[1]) - midiNote(tones.pad[0]);
  const step = sixteenths ? 1 : 2;
  for (let i = 0; i < 16; i += step) {
    const lift = SPICCATO[i];
    w.note(
      'pizz',
      bar,
      i * 0.25,
      step * 0.2,
      root + (lift === 7 ? fifth : lift),
      velocity + (GALLOP16.includes(i) ? 18 : 0),
    );
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
function chant(w: Write, bar: number, name: ChordName, figure: keyof typeof CHANT, velocity: number): void {
  const tones = CHORDS[name];
  const root = 60 + (midiNote(tones.ost) % 12);
  const fifth = root + midiNote(tones.pad[1]) - midiNote(tones.pad[0]);
  for (const [beat, beats] of CHANT[figure]) {
    w.note('chant', bar, beat, beats, root, velocity + (beat === 0 ? 10 : 0));
    w.note('chant', bar, beat, beats, fifth, velocity - 6);
  }
}

/** The shrieks: the tremolo strings on B5 over C6 in sixteenths for a bar. */
function shrieks(w: Write, bar: number, velocity: number): void {
  for (let i = 0; i < 16; i++)
    for (const n of ['B5', 'C6']) w.note('trem', bar, i * 0.25, 0.22, n, velocity + (i % 4 === 0 ? 8 : 0));
}

/** A braam: the low brass's cluster held (on E with F over it), the orchestra hit, the timpani, the taiko, the long
 *  crash; never on the brass, whose bars the motifs hold. */
function braam(w: Write, bar: number, name: ChordName, velocity: number): void {
  const tones = CHORDS[name];
  const root = midiNote(tones.ost);
  for (const n of [root - 12, root, root + 7, root + (name === 'Em' ? 13 : 12)])
    w.note('ostinato', bar, 0, 2.5, n, velocity);
  for (const n of tones.stab) w.note('hit', bar, 0, 1.5, n, velocity);
  w.note('timpani', bar, 0, 1, tones.timp, velocity);
  w.hit('surdo', bar, 0, velocity);
  w.hit('crash2', bar, 0, velocity - 4);
}

/** A swell into `bar`: the reverse cymbal rising 1.7 s to its downbeat, the timpani rolling up over the last beat. */
function swellInto(w: Write, bar: number, bpm: number, velocity: number): void {
  const beats = (1.7 * bpm) / 60;
  for (const n of ['E6', 'F6']) w.note('swell', bar, -beats, beats, n, velocity);
  rollNote(w, 'timpani', bar - 1, 3, 1, 'E2', velocity - 40, velocity);
}

/** The wake: two bars swelling from nothing into the first phase, the timpani rolling, the taiko and the low brass
 *  growling E against F, the swell rising to the downbeat, the chant's one shout on the last eighth. */
function wake(): Song {
  return makeSong({ ...SPEC, name: 'boarding-wake', bpm: 138, bars: 2, level: 1.5, press: press(5) }, (w) => {
    for (let i = 0; i < 32; i++) w.note('timpani', Math.floor(i / 16), (i % 16) * 0.25, 0.22, 'E2', 44 + i * 2.6);
    for (let i = 0; i < 16; i++) {
      w.hit(i % 2 ? 'lowTom' : 'surdo', Math.floor(i / 8), (i % 8) * 0.5, 50 + i * 4);
      w.note('ostinato', Math.floor(i / 8), (i % 8) * 0.5, 0.45, i % 4 === 3 ? 'F2' : 'E2', 52 + i * 4);
    }
    swellInto(w, 2, 138, 104);
    w.hit('crash', 1, 3.5, 100);
    w.note('chant', 1, 3.5, 0.5, 'E4', 112);
    w.note('chant', 1, 3.5, 0.5, 'B4', 106);
  });
}

/** A phase: the war's bed, the boss's four bars written in (the brass in the first, the horn too in the second,
 *  everything in the third), the drums climbing, a braam at each eight (each four in the third), a swell into each
 *  eight, the chant from the second phase's second eight, the shrieks at the second's top and through the third's
 *  second half, the snare rolling into the height. */
function phase(number: 1 | 2 | 3): Song {
  const bpm = [138, 144, 152][number - 1];
  const level = [1.45, 1.56, 1.64][number - 1];
  const harmony = number === 3 ? WAR_THREE : WAR;
  return makeSong(
    { ...SPEC, name: `boarding-${number}`, bpm, bars: 32, level, press: press([5.2, 5.4, 5.8][number - 1]) },
    (w) => {
      for (let bar = 0; bar < 32; bar++) {
        const name = harmony[bar % 8];
        const tones = CHORDS[name];
        const section = bar >> 3;
        const driven = number >= 2 || section >= 1;
        bed(w, bar, name, {
          drive: driven ? 2 : 1,
          choir: number >= 2 || bar >= 16,
          organ: 1 + 0.1 * number,
          vel: 1 + 0.03 * number,
        });
        drums(w, bar, number >= 3 || section === 3 ? 3 : 2);
        spiccato(w, bar, name, driven, 84 + number * 4);
        for (let i = 0; i < (number >= 3 ? 8 : 2); i++)
          w.note('timpani', bar, i * (number >= 3 ? 0.5 : 2), 0.45, tones.timp, i === 0 ? 112 : 96);
        for (const n of tones.stab) {
          w.note('hit', bar, 0, 1, n, 104);
          if (number >= 2) w.note('hit', bar, 2.5, 0.5, n, 98);
        }
        if (bar % 8 === 0) w.note('bells', bar, 0, 4, number === 3 ? 'B2' : 'E3', 94);
        if (bar % (number >= 3 ? 4 : 8) === 0) braam(w, bar, name, 108 + number * 4);
        if (bar % 8 === 7) swellInto(w, bar + 1, bpm, 90 + number * 4);
        if ((number >= 2 && bar >= 8) || number >= 3) chant(w, bar, name, number >= 3 ? 'b' : 'a', 86 + number * 4);
        if (number >= 2 && section >= (number === 2 ? 3 : 2) && bar % 2 === 0) shrieks(w, bar, 62 + number * 4);
        if (bar === 23) rollDrum(w, 'snare', bar, 2, 2, 70, 122);
      }
      for (let first = 0; first < 32; first += 8) {
        line(w, first, MOTIF, 'brass', 112 + number * 2);
        if (number >= 2) line(w, first + 4, MOTIF, 'horn', 108);
        if (number >= 3) line(w, first + 4, MOTIF, 'strings', 100, 1);
      }
      line(w, 24, MOTIF.slice(0, 2), 'strings', 100, 1);
    },
  );
}

/** The last stand: E against F a bar each, the bell tolling every bar, the broken fanfare hammered on the brass, the
 *  kick on every eighth, wood blocks ticking every eighth, the shrieks rising through the second half. */
function lastStand(): Song {
  return makeSong({ ...SPEC, name: 'boarding-last', bpm: 160, bars: 16, level: 1.68, press: press(5.9) }, (w) => {
    for (let bar = 0; bar < 16; bar++) {
      const name = COUNT[bar % 8];
      const tones = CHORDS[name];
      bed(w, bar, name, { drive: 2, choir: true, vel: 1.08 });
      drums(w, bar, 3);
      spiccato(w, bar, name, true, 96);
      w.note('bells', bar, 0, 2, 'E3', 100);
      for (let i = 0; i < 8; i++) w.hit(i % 2 ? 'woodLo' : 'woodHi', bar, i * 0.5, i % 2 ? 84 : 100);
      for (const n of tones.stab) {
        w.note('hit', bar, 0, 1, n, 108);
        w.note('hit', bar, 2, 1, n, 100);
      }
      chant(w, bar, name, 'b', 98);
      if (bar >= 8) shrieks(w, bar, 70 + (bar - 8) * 4);
      if (bar % 4 === 0) braam(w, bar, name, 118);
      if (bar % 8 === 7) swellInto(w, bar + 1, 160, 100);
    }
    for (let bar = 0; bar < 16; bar += 2) line(w, bar, BROKEN, 'brass', 116, bar >= 8 ? 1 : 0);
  });
}

/** The end, the player fallen: the last braam, the progression falling under the fanfare's broken notes, the strings'
 *  lament a step a bar from E5 to F4, slowing to nothing in its own time, the last four bars the organ alone. */
function end(): Song {
  return makeSong({ ...SPEC, name: 'boarding-end', bpm: 70, bars: 12, level: 1.4, press: press(4.6) }, (w) => {
    braam(w, 0, 'Em', 124);
    for (let bar = 0; bar < 12; bar++) {
      const fade = Math.max(0.25, 1 - bar / 12);
      if (bar < 8) bed(w, bar, END[bar % 8], { choir: bar < 6, organ: fade, vel: fade });
      else for (const n of CHORDS.Em.pad) w.note('organ', bar, 0, 4, n, 70 * fade);
    }
    notes('E5 D5 C5 B4 A4 G4 F4').forEach((n, i) => w.note('strings', i + 1, 0, 3.8, n, 92 - i * 7));
    for (let i = 0; i < 8; i++) w.note('timpani', 0, i * 0.5, 0.45, 'E2', 100 - i * 6);
    line(w, 1, BROKEN, 'horn', 100);
    line(w, 4, tune('G4:2 F4:2'), 'horn', 88);
    w.note('bells', 7, 0, 4, 'E3', 84);
  });
}

/** The hymn, the boss beaten: the fanfare whole on the horn in E major over the choir and the organ, the harp climbing
 *  each chord in eighths, the timpani's soft roll into each four; no drums. */
function hymn(): Song {
  return makeSong({ ...SPEC, name: 'boarding-hymn', bpm: 72, bars: 16, level: 1.25, press: press(4.2) }, (w) => {
    for (let bar = 0; bar < 16; bar++) {
      const name = HYMN[bar % 8];
      const up = CHORDS[name].str.map(midiNote);
      bed(w, bar, name, { choir: true, organ: 1.2 });
      [0, 1, 2, 3, 4, 5, 4, 3].forEach((j, i) =>
        w.note('harp', bar, i * 0.5, 1, up[j % 3] + 12 * Math.floor(j / 3), 66 + (i === 0 ? 10 : 0)),
      );
      if (bar % 4 === 3) rollNote(w, 'timpani', bar, 2, 2, 'E2', 36, 72);
    }
    line(w, 0, FANFARE, 'horn', 104);
    line(w, 4, FANFARE, 'horn', 108);
    line(w, 8, FANFARE, 'brass', 100, -1);
    line(w, 12, FANFARE, 'horn', 112);
    w.note('bells', 15, 0, 4, 'E5', 90);
  });
}

/** The Boarding's songs: its wake, three phases and last stand, the hymn for the boss's fall and the end for the
 *  player's. */
export const boardingScore = () => ({
  wake: wake(),
  phases: [phase(1), phase(2), phase(3)] as readonly Song[],
  last: lastStand(),
  fallen: hymn(),
  end: end(),
});
