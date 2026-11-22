// The Wrath: a boss's score in three phases and a fall, in D minor on low brass, organ, choir, a tolled bell and low
// drums. The villain's harmony turns D minor to B-flat minor (D against D-flat, A against B-flat), then the minor four
// and the dominant held; the third phase turns on the Neapolitan E-flat. Stabs and pads stand in open fifths; the
// ostinato hammers the root with a sigh leaning into each next bar; the theme turns on half steps, low in the brass.
// The phases drive harder, 132, 138 and 150, each written in takes of eight bars (form.ts): the march alone, the
// theme, the theme answered, in full, over turned chords, or stopped to the ostinato and the surdo; each in one of
// three feels (the ostinato's accents, the bass, the voicing, the surdo, the bell, the drums). The fall turns the
// minor to D major. Each song is pressed (a compressor under a soft ceiling) so it plays dense and even.

import { type TakeSpec, makeForm } from './form.ts';
import { type Press, type Song, type Tune, type Writer, lay, makeSong, midiNote, tune } from './score.ts';
type Track = 'ostinato' | 'bass' | 'strings' | 'brass' | 'choir' | 'organ' | 'timpani' | 'hit' | 'bells';
type Drum =
  'kick' | 'snare' | 'lowTom' | 'highFloorTom' | 'tom' | 'lowMidTom' | 'hiMidTom' | 'crash' | 'chinese' | 'surdo';
type Write = Writer<Track, Drum>;

const TRACKS = {
  ostinato: { program: 57, volume: 116, pan: 50, role: 'pulse' },
  bass: { program: 32, volume: 98, pan: 64, role: 'bed' },
  strings: { program: 48, volume: 108, pan: 80, role: 'bed' },
  brass: { program: 61, volume: 122, pan: 60, role: 'lead' },
  choir: { program: 52, volume: 114, pan: 70, role: 'peak' },
  organ: { program: 19, volume: 86, pan: 64, role: 'bed' },
  timpani: { program: 47, volume: 112, pan: 64, role: 'combat' },
  hit: { program: 55, volume: 110, pan: 64, role: 'peak' },
  bells: { program: 14, volume: 96, pan: 76, role: 'tension' },
} as const;

/** The low drums and toms; the surdo on the one is the tension's heartbeat. */
const KIT = {
  volume: 114,
  role: 'combat',
  roles: { surdo: 'tension' },
  keys: {
    kick: 36,
    snare: 38,
    lowTom: 41,
    highFloorTom: 43,
    tom: 45,
    lowMidTom: 47,
    hiMidTom: 48,
    crash: 49,
    chinese: 52,
    surdo: 87,
  },
} as const;

/** A gentle compressor (4:1 over a wide knee), each song's drive after it, and the soft ceiling three decibels under
 *  the clip at the full music volume. DRIVE sets the first phase at -18.5 dBFS, the others keeping their rise over
 *  it, so the ceiling only rounds the loudest strikes and the game's own sounds keep their room over the fight. */
const PRESS = { threshold: -18, knee: 12, ratio: 4, attack: 0.003, release: 0.25, ceiling: -3 } as const;
const DRIVE = 0.33;
const press = (out: number): Press => ({ ...PRESS, out: out * DRIVE });

/** The phases' and the fall's songs, played over the music's own level as the fight grows. */
const SPEC = { tracks: TRACKS, kit: KIT, edge: { wrap: false, clip: false, hold: false, restrike: false } } as const;

interface Chord {
  readonly bass: string;
  readonly timp: string;
  readonly pad: readonly string[];
  readonly str?: readonly string[];
  readonly choir: readonly string[];
  readonly ost: readonly string[];
  readonly stab: readonly string[];
}

const notes = (text: string): readonly string[] => text.split(' ');

/** Each chord's bass and timpani, its pad (the organ), the strings' and the choir's voicings, its ostinato bar (eight
 *  eighths, the last two a sigh into the next bar) and its brass stab. D major is the fall's alone. */
const CHORDS: Readonly<Record<'Dm' | 'Bbm' | 'Gm' | 'A' | 'Eb' | 'D', Chord>> = {
  Dm: {
    bass: 'D2',
    timp: 'D2',
    pad: notes('D3 A3 D4'),
    str: notes('D4 F4 A4'),
    choir: notes('D3 A3 F4'),
    ost: notes('D3 D3 D3 D3 D3 D3 Bb2 A2'),
    stab: notes('D3 A3 D4'),
  },
  Bbm: {
    bass: 'Bb1',
    timp: 'F2',
    pad: notes('Bb2 F3 Bb3'),
    str: notes('Db4 F4 Bb4'),
    choir: notes('Bb2 F3 Db4'),
    ost: notes('Bb2 Bb2 Bb2 Bb2 Bb2 Bb2 C3 Db3'),
    stab: notes('Bb2 F3 Bb3'),
  },
  Gm: {
    bass: 'G1',
    timp: 'G2',
    pad: notes('G2 D3 G3'),
    str: notes('D4 G4 Bb4'),
    choir: notes('G2 D3 Bb3'),
    ost: notes('G2 G2 G2 G2 G2 G2 Eb3 D3'),
    stab: notes('G2 D3 G3'),
  },
  A: {
    bass: 'A1',
    timp: 'A2',
    pad: notes('A2 E3 A3'),
    str: notes('C#4 E4 A4'),
    choir: notes('A2 E3 C#4'),
    ost: notes('A2 A2 A2 A2 A2 A2 F3 E3'),
    stab: notes('A2 E3 A3'),
  },
  Eb: {
    bass: 'Eb2',
    timp: 'Bb2',
    pad: notes('Eb3 Bb3 Eb4'),
    str: notes('Eb4 G4 Bb4'),
    choir: notes('Eb3 Bb3 G4'),
    ost: notes('Eb3 Eb3 Eb3 Eb3 Eb3 Eb3 B2 Bb2'),
    stab: notes('Eb3 Bb3 Eb4'),
  },
  D: {
    bass: 'D2',
    timp: 'D2',
    pad: notes('D3 F#3 A3'),
    choir: notes('A3 D4 F#4'),
    ost: notes('D3 D3 A3 D3 B3 D3 A3 F#3'),
    stab: notes('D4 F#4 A4'),
  },
};
type ChordName = keyof typeof CHORDS;

/** The phases' progressions, a chord a bar; the third's on the Neapolitan. */
const WAR: readonly ChordName[] = ['Dm', 'Bbm', 'Dm', 'Bbm', 'Gm', 'Dm', 'A', 'A'];
const WRATH: readonly ChordName[] = ['Dm', 'Eb', 'Dm', 'Eb', 'Bbm', 'Gm', 'A', 'A'];

/** The theme three ways, eight bars over its progression. */
const THEME_A = tune(
  'D4:2 C#4:.5 D4:.5 A3:1 | Db4:2 C4:.5 Bb3:.5 F3:1 | A4:2 Bb4:.5 A4:.5 E4:1 | F4:2 Db4:1 Bb3:1 | G4:1.5 F4:.5 Eb4:1 D4:1 | F4:1 E4:1 D4:1 C#4:1 | D4:1.5 C#4:.5 E4:1 F4:1 | E4:2 Bb3:1 A3:1',
);
const THEME_B = tune(
  'A4:.75 A4:.25 A4:1 Bb4:1 A4:1 | Db5:.75 C5:.25 Bb4:1 F4:2 | A4:.75 A4:.25 A4:1 D5:1 C#5:1 | Db5:2 F4:1 Bb4:1 | G4:.75 G4:.25 Bb4:1 D5:1 Eb5:1 | D5:1.5 C#5:.5 D5:1 A4:1 | E5:.75 E5:.25 F5:1 E5:1 C#5:1 | A4:2 Bb4:1 A4:1',
);
const THEME_C = tune(
  'D5:.5 D5:.5 D5:.5 Eb5:.5 D5:1 A4:1 | Eb5:1 D5:.5 Eb5:.5 G5:1 Bb4:1 | F5:.5 F5:.5 E5:.5 F5:.5 D5:1 A4:1 | G5:1 Eb5:1 Bb4:1 G4:1 | Db5:1 F5:1 Db5:1 Bb4:1 | G4:.5 Bb4:.5 D5:.5 G5:.5 F5:1 Eb5:1 | E5:1 F5:1 E5:1 C#5:1 | A4:2 Bb4:.5 A4:.5 G#4:.5 A4:.5',
);
/** A theme's bars from bar `first`, bars `from` to `to` of it. */
const theme = (
  w: Write,
  first: number,
  bars: Tune,
  track: Track,
  velocity: number,
  { octave = 0, from = 0, to = bars.length } = {},
) => lay(w, track, first, bars, velocity, { octave, accent: 10, from, to });

/** Three feels: the ostinato's accents over the bar's eighths (3-3-2, every other, 3-2-3), the bass's strikes, the
 *  strings' voicing, the surdo's beats (the first phase's, the later ones'), the bell's toll, and the kick. */
const FEELS = [
  {
    accents: [true, false, false, true, false, false, true, false],
    bass: [
      [0, 1.8],
      [2, 1.8],
    ],
    voicing: 0,
    surdo: [[0], [0, 2]],
    kick: [0.75, 1.5],
    full: [0, 0.75, 1.5, 2, 2.75, 3.5],
  },
  {
    accents: [true, false, true, false, true, false, true, false],
    bass: [
      [0, 2.8],
      [3, 0.9],
    ],
    voicing: 1,
    surdo: [
      [0, 1.5],
      [0, 1.5, 3],
    ],
    kick: [1, 1.75],
    full: [0, 1, 1.75, 2, 3],
  },
  {
    accents: [true, false, false, true, false, true, false, false],
    bass: [
      [0, 0.9],
      [0.75, 0.6],
      [2, 1.8],
    ],
    voicing: 2,
    surdo: [
      [0, 2.5],
      [0, 2.5, 3.5],
    ],
    kick: [0.5, 1.5],
    full: [0, 0.75, 1.5, 2.5, 3.25],
  },
] as const;
const feelOf = (feel: number) => FEELS[feel] ?? FEELS[0];

/** The ostinato, the bass and the pads under a chord for a bar in a feel: the ostinato in eighths until beat `drive`
 *  (the last beat when `busy`), sixteenths after it, the last two a sigh; the strings in the voicing of the feel
 *  `voicingShift` on from its own. */
function underBar(
  w: Write,
  bar: number,
  chord: ChordName,
  {
    strings = false,
    choir = false,
    organ = 1,
    busy = false,
    drive = null as number | null,
    vel = 1,
    feel = 0,
    voicingShift = 0,
  } = {},
): void {
  const tones = CHORDS[chord];
  const { accents, bass } = feelOf(feel);
  const { voicing } = feelOf((feel + voicingShift) % FEELS.length);
  const from = drive ?? (busy ? 3 : 4);
  tones.ost.forEach((n, i) => {
    if (i * 0.5 < from) w.note('ostinato', bar, i * 0.5, 0.4, n, (accents[i] ? 108 : 80) * vel);
  });
  for (let sixteenth = from * 4; sixteenth < 16; sixteenth++)
    w.note(
      'ostinato',
      bar,
      sixteenth * 0.25,
      0.2,
      (sixteenth >= 14 ? tones.ost[sixteenth - 8] : tones.ost[0]) ?? 'D3',
      (accents[sixteenth % 8] ? 110 : 78) * vel,
    );
  for (const [beat, beats] of bass) w.note('bass', bar, beat, beats, tones.bass, (beat ? 96 : 104) * vel);
  if (organ > 0) for (const n of tones.pad) w.note('organ', bar, 0, 4, n, 80 * organ);
  const [low = 0, middle = 0, top = 0] = (tones.str ?? []).map(midiNote);
  const voiced = voicing === 1 ? [top - 12, low, middle] : voicing === 2 ? [middle, top, low + 12] : [low, middle, top];
  if (strings && tones.str) for (const n of voiced) w.note('strings', bar, 0, 4, n, 90 * vel);
  if (choir) for (const n of tones.choir) w.note('choir', bar, 0, 4, n, 96 * vel);
}

type Section = 'march' | 'theme' | 'answer' | 'full' | 'turn' | 'stop';
/** The sections a take may lead to, and those a phase may open on: the march alone, or the drums stopped. */
const SECTIONS: Readonly<Record<Section, { readonly next: readonly Section[]; readonly opens?: boolean }>> = {
  march: { next: ['theme', 'answer', 'turn'], opens: true },
  theme: { next: ['answer', 'full', 'turn', 'stop'] },
  answer: { next: ['theme', 'full', 'stop'] },
  full: { next: ['theme', 'turn', 'stop'] },
  turn: { next: ['answer', 'full', 'stop'] },
  stop: { next: ['march', 'theme', 'answer'], opens: true },
};
/** Each phase's takes: a section, its feel (no two of a section in one), and which of its two leads. */
const PHASE_TAKES: readonly (readonly [Section, number, number])[] = [
  ['march', 0, 0],
  ['march', 2, 1],
  ['theme', 1, 0],
  ['theme', 2, 1],
  ['answer', 0, 0],
  ['answer', 1, 1],
  ['full', 2, 0],
  ['full', 0, 1],
  ['turn', 1, 0],
  ['turn', 0, 1],
  ['stop', 2, 0],
  ['stop', 1, 1],
];

/** A phase: its tempo, level and press, its progression and the same turned, its own theme and the octave the brass
 *  plays it in, and the theme it recalls. */
interface Phase {
  readonly number: 1 | 2 | 3;
  readonly bpm: number;
  readonly level: number;
  readonly out: number;
  readonly harmony: readonly ChordName[];
  readonly turn: readonly ChordName[];
  readonly own: Tune;
  readonly low: number;
  readonly recalled: Tune;
}
const PHASES: readonly Phase[] = [
  {
    number: 1,
    bpm: 132,
    level: 1.42,
    out: 5.2,
    harmony: WAR,
    turn: ['Dm', 'Bbm', 'Dm', 'Bbm', 'Eb', 'Dm', 'Dm', 'A'],
    own: THEME_A,
    low: 0,
    recalled: THEME_A,
  },
  {
    number: 2,
    bpm: 138,
    level: 1.6,
    out: 5,
    harmony: WAR,
    turn: ['Dm', 'Bbm', 'Dm', 'Bbm', 'Eb', 'Dm', 'Dm', 'A'],
    own: THEME_B,
    low: -1,
    recalled: THEME_A,
  },
  {
    number: 3,
    bpm: 150,
    level: 1.64,
    out: 5.8,
    harmony: WRATH,
    turn: ['Dm', 'Eb', 'Dm', 'Gm', 'Bbm', 'Eb', 'A', 'A'],
    own: THEME_C,
    low: -1,
    recalled: THEME_B,
  },
];

/** The bell tolled in a feel: as each phase tolls it, the tritone answering it half a take later, or soft every
 *  other bar. */
function tolls(w: Write, bar: number, number: number, feel: number): void {
  const [high, low] = ['D3', number === 3 ? 'Ab2' : 'A2'];
  if (feel === 0 && number === 1 && bar === 0) w.note('bells', bar, 0, 4, high, 96);
  if (feel === 0 && number === 2 && bar % 4 === 0) w.note('bells', bar, 0, 4, bar ? low : high, 92);
  if (feel === 0 && number === 3 && bar % 4 === 0) {
    w.note('bells', bar, 0, 2, high, 98);
    w.note('bells', bar, 2, 2, low, 94);
  }
  if (feel === 1 && bar % 4 === 0) w.note('bells', bar, 0, 3, bar ? 'Ab2' : high, 90);
  if (feel === 2 && bar % 2 === 0) w.note('bells', bar, 0, 2, bar % 4 ? low : high, 80);
}

/** The drums for a bar of a phase in a feel: the first's half time, the second's full time, the third's kick on
 *  every beat; the surdo, the fills into every fourth bar, the crashes; or, stopped, the surdo and a low tom. */
function kit(w: Write, bar: number, number: number, feel: number, stop: boolean): void {
  const { surdo, kick, full } = feelOf(feel);
  const hit = (drum: Drum, beat: number, velocity: number) => w.hit(drum, bar, beat, velocity);
  (surdo[number === 1 ? 0 : 1] ?? []).forEach((beat, i) => hit('surdo', beat, i ? 94 : 106));
  if (stop) {
    hit('lowTom', bar % 2 ? 3.5 : 2, 84);
    if (bar === 7) for (let i = 0; i < 8; i++) hit('snare', 2 + i * 0.25, 60 + i * 8);
    return;
  }
  const fill = bar % 4 === 3;
  if (number === 1) {
    hit('lowTom', 0, 96);
    for (const beat of kick) hit('kick', beat, 94);
    hit('snare', 2, 108);
    hit('tom', 2, 88);
    if (fill)
      (['lowMidTom', 'tom', 'highFloorTom', 'lowTom'] as const).forEach((tom, i) => hit(tom, 3 + i * 0.25, 92 + i * 6));
    else for (const beat of feel === 1 ? [3] : [2.75, 3.5]) hit('lowTom', beat, 92);
  } else if (number === 2) {
    for (const beat of full) hit('kick', beat, beat === 0 ? 110 : 94);
    for (const beat of [1, 3]) hit('snare', beat, 106);
    for (const beat of feel === 1 ? [1.5, 3.5] : [0.5, 2.5]) hit('tom', beat, 82);
    const toms = ['hiMidTom', 'hiMidTom', 'lowMidTom', 'lowMidTom', 'highFloorTom', 'highFloorTom', 'lowTom', 'lowTom'];
    if (fill) (toms as Drum[]).forEach((tom, i) => hit(feel === 2 ? 'snare' : tom, 2 + i * 0.25, 84 + i * 5));
    else for (const beat of [3, 3.5]) hit('lowTom', beat, 94);
  } else {
    for (let beat = 0; beat < 4; beat++) hit('kick', beat, beat === 0 ? 112 : 98);
    if (fill) for (const beat of [0.5, 1.5, 2.5, 3.5]) hit('kick', beat, 88);
    for (const beat of [1, 3]) hit('snare', beat, 112);
    for (const beat of [0.5, 1.5, 2.5, 3.5]) hit('tom', beat, 84);
    if (bar % 2 === 0) hit('crash', 0, 98);
    if (fill) {
      hit('chinese', 3, 100);
      (['hiMidTom', 'lowMidTom', 'highFloorTom', 'lowTom'] as const).forEach((tom, i) => {
        hit(tom, 2 + i * 0.25, 100);
        hit(feel === 1 ? 'snare' : tom, 2.125 + i * 0.25, 88);
      });
    }
  }
  if (bar % 4 === 0) hit('crash', 0, number === 1 ? 92 : 96);
}

/** The leads over a take: the march's stabs, or its pickup into the theme; the phase's theme on the brass, or the
 *  theme it recalls with the strings over it; answered half and half by the strings; in full, the brass doubled and
 *  the choir or the strings with it; over the turned chords, on the brass or the strings; the stopped drums'
 *  theme's head, low, on the strings, or hummed by the choir. */
function leads(w: Write, { number, own, low, recalled }: Phase, section: Section, lead: number): void {
  const over = number === 1 ? 1 : 0;
  if (section === 'march') {
    if (lead) theme(w, 6, own, 'brass', 108, { octave: low, to: 2 });
  } else if (section === 'stop') {
    if (lead) theme(w, 4, own, 'choir', 88, { octave: low, to: 4 });
    else theme(w, 4, own, 'strings', 92, { octave: low, to: 2 });
  } else if (section === 'theme') {
    theme(w, 0, lead ? recalled : own, 'brass', 112 + lead * 4, { octave: lead && number < 3 ? 0 : low });
    if (lead) theme(w, 0, recalled, 'strings', 94, { octave: over });
  } else if (section === 'answer') {
    const [call, reply] = lead ? (['strings', 'brass'] as const) : (['brass', 'strings'] as const);
    theme(w, 0, own, call, 114, { octave: call === 'brass' ? low : over, to: 4 });
    theme(w, 4, own, reply, 110, { octave: reply === 'brass' ? low : over, from: 4 });
  } else if (section === 'full') {
    theme(w, 0, own, 'brass', 120, { octave: low });
    theme(w, 0, own, 'brass', 104, { octave: low - 1 });
    if (lead || number === 3) theme(w, 0, own, 'strings', 100, { octave: over });
    else theme(w, 0, own, 'choir', 100, { octave: -1 });
  } else {
    theme(w, 0, own, lead ? 'strings' : 'brass', 114, { octave: lead ? over : low });
    if (lead) theme(w, 0, own, 'brass', 100, { octave: low - 1 });
  }
}

/** A take of a phase: the ostinato, the bass and the pads in the feel (their swell following the section), the choir
 *  on the beat in the third, the timpani, the stabs and the hits, the bell, the drums; and its leads. */
function phaseTake(w: Write, phase: Phase, section: Section, feel: number, lead: number): void {
  const { number } = phase;
  const chords = section === 'turn' ? phase.turn : phase.harmony;
  const stop = section === 'stop';
  // The organ follows the section: lowest with the drums stopped or the march alone, fullest under the theme in full.
  const swell = { march: 0.85, theme: 1, answer: 0.92, full: 1.12, turn: 1.05, stop: 0.75 }[section];
  // The march and the stopped drums voice the strings a feel on: in their own feel, their danger's layers would be a
  // theme's take's.
  const voicingShift = section === 'march' || stop ? 1 : 0;
  for (let bar = 0; bar < 8; bar++) {
    const chord: ChordName = chords[bar] ?? 'Dm';
    const tones = CHORDS[chord];
    const choir = section !== 'march' && !stop;
    if (number === 1)
      underBar(w, bar, chord, { strings: true, choir, busy: bar % 4 === 3, organ: swell, feel, voicingShift });
    else if (number === 2)
      underBar(w, bar, chord, { strings: true, choir, drive: bar % 2 ? 2 : 3, organ: swell, feel, voicingShift });
    else
      underBar(w, bar, chord, {
        strings: true,
        drive: stop ? 4 : 0,
        organ: 1.2 * swell,
        vel: 1.05,
        feel,
        voicingShift,
      });
    if (number === 3 && !stop)
      for (let beat = 0; beat < 4; beat++)
        for (const n of tones.choir) w.note('choir', bar, beat, 0.9, n, beat === 0 ? 106 : 92);
    if (stop) {
      if (bar % 2 === 0) w.note('timpani', bar, 0, 0.9, tones.timp, 90);
    } else if (number === 3)
      for (let i = 0; i < 8; i++)
        w.note('timpani', bar, i * 0.5, 0.4, i % 4 === 3 ? 'A2' : tones.timp, i === 0 ? 110 : 96);
    else {
      w.note('timpani', bar, 0, 1, tones.timp, 110);
      w.note('timpani', bar, 1.5, 0.5, tones.timp, 94);
      if (number === 2) w.note('timpani', bar, 2, 1, tones.timp, 104);
      if (number === 1 && bar % 4 === 3)
        for (const beat of [2.5, 3, 3.5]) w.note('timpani', bar, beat, 0.45, beat === 3.5 ? 'A2' : tones.timp, 106);
    }
    if (!stop && (section === 'march' || (number === 1 && bar % 2 === 0)))
      for (const n of tones.stab) {
        w.note('brass', bar, 0, 0.9, n, 112);
        w.note('brass', bar, 1.5, 0.45, n, 98);
      }
    if (!stop && (number > 1 || bar % 4 === 0))
      for (const n of tones.stab) {
        w.note('hit', bar, 0, 1, n, 104);
        if (number === 3 || bar % 2 === 1) w.note('hit', bar, 2.5, 0.5, n, 98);
        if (number === 3 && bar % 2 === 1) w.note('hit', bar, 3.5, 0.5, n, 100);
      }
    tolls(w, bar, number, feel);
    kit(w, bar, number, feel, stop);
  }
  leads(w, phase, section, lead);
}

/** A phase, in takes. */
const phaseSong = (phase: Phase): Song =>
  makeForm(
    { ...SPEC, name: `wrath-${phase.number}`, bpm: phase.bpm, level: phase.level, press: press(phase.out) },
    PHASE_TAKES.map(([section, feel, lead]): TakeSpec<Track, Drum> => {
      const { next, opens } = SECTIONS[section];
      return { section, bars: 8, next, opens, write: (w) => phaseTake(w, phase, section, feel, lead) };
    }),
  );

/** The fall: a timpani roll into D major, the fanfare's call and answer on the brass with the strings an octave over,
 *  the organ, the choir and the bells held into the last hit; then quiet. */
function fallen(): Song {
  return makeSong({ ...SPEC, name: 'wrath-fallen', bpm: 92, bars: 12, level: 1.7, press: press(5.6) }, (w) => {
    for (let i = 0; i < 16; i++) w.note('timpani', 0, i * 0.25, 0.24, 'D2', 56 + i * 4);
    for (const n of notes('A3 D4 F#4')) w.note('choir', 0, 2, 2, n, 82);
    const major = CHORDS.D;
    for (const n of major.stab) w.note('hit', 1, 0, 1.5, n, 112);
    w.note('timpani', 1, 0, 1, 'D2', 112);
    w.hit('crash', 1, 0, 104);
    w.hit('kick', 1, 0, 112);
    w.hit('surdo', 1, 0, 104);
    const call = [
      ['D4', 0, 0.5],
      ['F#4', 0.5, 0.5],
      ['A4', 1, 1],
      ['D5', 2, 2],
    ] as const;
    const answer = [
      ['A4', 0, 1],
      ['B4', 1, 1],
      ['A4', 2, 1],
      ['F#4', 3, 1],
    ] as const;
    for (const [n, beat, beats] of call) {
      w.note('brass', 1, beat, beats * 0.95, n, 124);
      w.note('strings', 1, beat, beats * 0.95, midiNote(n) + 12, 100);
    }
    for (const [n, beat, beats] of answer) {
      w.note('brass', 2, beat, beats * 0.95, n, 118);
      w.note('strings', 2, beat, beats * 0.95, midiNote(n) + 12, 96);
    }
    w.note('brass', 3, 0, 4, 'D5', 122);
    for (const n of major.pad) {
      w.note('organ', 1, 0, 12, n, 94);
      w.note('strings', 3, 0, 5, midiNote(n) + 12, 100);
    }
    for (const n of major.choir) w.note('choir', 1, 0, 12, n, 108);
    w.note('bass', 1, 0, 12, 'D2', 118);
    w.note('bells', 1, 0, 4, 'D5', 100);
    w.note('bells', 3, 0, 2, 'A4', 92);
    w.note('bells', 3, 2, 2, 'D5', 96);
    w.note('timpani', 3, 0, 1, 'D2', 116);
    for (let i = 0; i < 8; i++) w.note('timpani', 3, 2 + i * 0.25, 0.24, 'D2', 76 + i * 5);
    w.note('timpani', 4, 0, 1, 'D2', 112);
    w.hit('crash', 4, 0, 102);
    w.hit('kick', 4, 0, 104);
    for (const n of major.stab) w.note('hit', 4, 0, 1, n, 108);
  });
}

/** The Wrath's songs: its three phases and its fall. */
export const wrathScore = (): { readonly phases: readonly Song[]; readonly fallen: Song } => ({
  phases: PHASES.map(phaseSong),
  fallen: fallen(),
});
