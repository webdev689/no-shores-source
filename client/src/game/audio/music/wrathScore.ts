// The Wrath: a boss's score in three phases and a fall, in D minor on low brass, organ, choir, a tolled bell and low
// drums. The villain's harmony turns D minor to B-flat minor (D against D-flat, A against B-flat), then the minor four
// and the dominant held; the third phase turns on the Neapolitan E-flat. Stabs and pads stand in open fifths, no third
// to brighten them; the ostinato hammers the root 3-3-2 with a sigh leaning into each next bar; the theme turns on
// half steps and sits low in the brass. Each phase drives harder: 132, 138 and 150 beats a minute, the kit from half
// time to full to the kick on every beat. The fall turns the minor to D major: a timpani roll, a fanfare, the choir and
// the bells, then quiet. Each song is pressed (a compressor under a soft ceiling) so it plays dense and even.

import { type Press, type Song, type Writer, lay, makeSong, midiNote, tune } from './score.ts';

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
const theme = (w: Write, first: number, bars: typeof THEME_A, track: Track, velocity: number, octave = 0) =>
  lay(w, track, first, bars, velocity, { octave, accent: 10 });

/** The 3-3-2 accents over a bar's eighths. */
const ACCENT8 = [true, false, false, true, false, false, true, false];

/** The ostinato, the bass and the pads under a chord for a bar: the ostinato in eighths until beat `drive` (the last
 *  beat when `busy`), sixteenths after it, the last two a sigh. */
function underBar(
  w: Write,
  bar: number,
  chord: ChordName,
  { strings = false, choir = false, organ = 1, busy = false, drive = null as number | null, vel = 1 } = {},
): void {
  const tones = CHORDS[chord];
  const from = drive ?? (busy ? 3 : 4);
  tones.ost.forEach((n, i) => {
    if (i * 0.5 < from) w.note('ostinato', bar, i * 0.5, 0.4, n, (ACCENT8[i] ? 108 : 80) * vel);
  });
  for (let sixteenth = from * 4; sixteenth < 16; sixteenth++)
    w.note(
      'ostinato',
      bar,
      sixteenth * 0.25,
      0.2,
      (sixteenth >= 14 ? tones.ost[sixteenth - 8] : tones.ost[0]) ?? 'D3',
      (ACCENT8[sixteenth % 8] ? 110 : 78) * vel,
    );
  w.note('bass', bar, 0, 1.8, tones.bass, 104 * vel);
  w.note('bass', bar, 2, 1.8, tones.bass, 96 * vel);
  if (organ > 0) for (const n of tones.pad) w.note('organ', bar, 0, 4, n, 80 * organ);
  if (strings) for (const n of tones.str ?? []) w.note('strings', bar, 0, 4, n, 90 * vel);
  if (choir) for (const n of tones.choir) w.note('choir', bar, 0, 4, n, 96 * vel);
}

/** Phase one: the band whole from the first bar, the theme from the ninth with the choir under it; the kit in half
 *  time, the surdo and the floor tom on the one, the snare's one backbeat on the third; a bell tolled each section. */
function phaseOne(): Song {
  return makeSong({ ...SPEC, name: 'wrath-1', bpm: 132, bars: 32, level: 1.42, press: press(5.2) }, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const chord = WAR[bar % 8];
      const tones = CHORDS[chord];
      underBar(w, bar, chord, { strings: true, choir: bar >= 8, busy: bar % 4 === 3 });
      w.note('timpani', bar, 0, 1, tones.timp, 110);
      w.note('timpani', bar, 1.5, 0.5, tones.timp, 94);
      if (bar % 4 === 3)
        for (const [beat, n] of [
          [2.5, tones.timp],
          [3, tones.timp],
          [3.5, 'A2'],
        ] as const)
          w.note('timpani', bar, beat, 0.45, n, 106);
      if (bar < 8 || bar % 2 === 0)
        for (const n of tones.stab) {
          w.note('brass', bar, 0, 0.9, n, 112);
          w.note('brass', bar, 1.5, 0.45, n, 98);
        }
      if (bar % 4 === 0) for (const n of tones.stab) w.note('hit', bar, 0, 1, n, 104);
      if (bar % 8 === 0) w.note('bells', bar, 0, 4, 'D3', 96);
      w.hit('surdo', bar, 0, 106);
      w.hit('lowTom', bar, 0, 96);
      for (const beat of [0.75, 1.5]) w.hit('kick', bar, beat, 94);
      w.hit('snare', bar, 2, 108);
      w.hit('tom', bar, 2, 88);
      if (bar % 4 === 3)
        (['lowMidTom', 'tom', 'highFloorTom', 'lowTom'] as const).forEach((k, i) =>
          w.hit(k, bar, 3 + i * 0.25, 92 + i * 6),
        );
      else for (const beat of [2.75, 3.5]) w.hit('lowTom', bar, beat, 92);
      if (bar % 4 === 0) w.hit('crash', bar, 0, 92);
    }
    theme(w, 8, THEME_A, 'brass', 112);
    theme(w, 16, THEME_A, 'brass', 116);
    theme(w, 16, THEME_A, 'strings', 92, 1);
    theme(w, 24, THEME_A, 'brass', 120);
    theme(w, 24, THEME_A, 'brass', 104, -1);
    theme(w, 24, THEME_A, 'choir', 100, -1);
  });
}

/** Phase two: the choir from the first bar, the ostinato in sixteenths through every other bar's second half, the
 *  kit in full time and rolling into every fourth bar, the theme dotted and restless, low on the brass. */
function phaseTwo(): Song {
  return makeSong({ ...SPEC, name: 'wrath-2', bpm: 138, bars: 32, level: 1.6, press: press(5) }, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const chord = WAR[bar % 8];
      const tones = CHORDS[chord];
      underBar(w, bar, chord, { strings: true, choir: true, drive: bar % 2 === 1 ? 2 : 3 });
      w.note('timpani', bar, 0, 1, tones.timp, 110);
      w.note('timpani', bar, 1.5, 0.5, tones.timp, 94);
      w.note('timpani', bar, 2, 1, tones.timp, 104);
      for (const n of tones.stab) {
        w.note('hit', bar, 0, 1, n, 104);
        if (bar % 2 === 1) w.note('hit', bar, 2.5, 0.5, n, 98);
      }
      if (bar % 4 === 0) w.note('bells', bar, 0, 4, bar % 8 === 0 ? 'D3' : 'A2', 92);
      w.hit('surdo', bar, 0, 104);
      w.hit('surdo', bar, 2, 92);
      for (const beat of [0, 0.75, 1.5, 2, 2.75, 3.5]) w.hit('kick', bar, beat, beat === 0 ? 110 : 94);
      for (const beat of [1, 3]) w.hit('snare', bar, beat, 106);
      for (const beat of [0.5, 2.5]) w.hit('tom', bar, beat, 82);
      if (bar % 4 === 3)
        (
          [
            'hiMidTom',
            'hiMidTom',
            'lowMidTom',
            'lowMidTom',
            'highFloorTom',
            'highFloorTom',
            'lowTom',
            'lowTom',
          ] as const
        ).forEach((k, i) => w.hit(k, bar, 2 + i * 0.25, 84 + i * 5));
      else for (const beat of [3, 3.5]) w.hit('lowTom', bar, beat, 94);
      if (bar % 4 === 0) w.hit('crash', bar, 0, 96);
    }
    theme(w, 0, THEME_B, 'brass', 112, -1);
    theme(w, 8, THEME_B, 'brass', 116, -1);
    theme(w, 8, THEME_B, 'strings', 92);
    theme(w, 16, THEME_A, 'brass', 112);
    theme(w, 16, THEME_A, 'strings', 94, 1);
    theme(w, 24, THEME_B, 'brass', 120, -1);
    theme(w, 24, THEME_B, 'choir', 98, -1);
  });
}

/** Phase three, on the Neapolitan: the ostinato in sixteenths through every bar, the timpani on every eighth, the kick
 *  on every beat, the choir chanting on the beat, the tritone tolled low, the theme over it all. */
function phaseThree(): Song {
  return makeSong({ ...SPEC, name: 'wrath-3', bpm: 150, bars: 32, level: 1.64, press: press(5.8) }, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const chord = WRATH[bar % 8];
      const tones = CHORDS[chord];
      underBar(w, bar, chord, { strings: true, choir: false, drive: 0, organ: 1.2, vel: 1.05 });
      for (let beat = 0; beat < 4; beat++)
        for (const n of tones.choir) w.note('choir', bar, beat, 0.9, n, beat === 0 ? 106 : 92);
      for (let i = 0; i < 8; i++)
        w.note('timpani', bar, i * 0.5, 0.4, i % 4 === 3 ? 'A2' : tones.timp, i === 0 ? 110 : 96);
      for (const n of tones.stab) {
        w.note('hit', bar, 0, 1, n, 106);
        w.note('hit', bar, 2.5, 0.5, n, 100);
        if (bar % 2 === 1) w.note('hit', bar, 3.5, 0.5, n, 100);
      }
      if (bar % 4 === 0) {
        w.note('bells', bar, 0, 2, 'D3', 98);
        w.note('bells', bar, 2, 2, 'Ab2', 94);
      }
      w.hit('surdo', bar, 0, 106);
      w.hit('surdo', bar, 2, 96);
      for (let beat = 0; beat < 4; beat++) w.hit('kick', bar, beat, beat === 0 ? 112 : 98);
      if (bar % 4 === 3) for (const beat of [0.5, 1.5, 2.5, 3.5]) w.hit('kick', bar, beat, 88);
      for (const beat of [1, 3]) w.hit('snare', bar, beat, 112);
      for (const beat of [0.5, 1.5, 2.5, 3.5]) w.hit('tom', bar, beat, 84);
      if (bar % 2 === 0) w.hit('crash', bar, 0, 98);
      if (bar % 4 === 3) {
        w.hit('chinese', bar, 3, 100);
        (['hiMidTom', 'lowMidTom', 'highFloorTom', 'lowTom'] as const).forEach((k, i) => {
          w.hit(k, bar, 2 + i * 0.25, 100);
          w.hit(k, bar, 2.125 + i * 0.25, 88);
        });
      }
    }
    theme(w, 0, THEME_C, 'brass', 114, -1);
    theme(w, 8, THEME_C, 'brass', 118, -1);
    theme(w, 8, THEME_C, 'strings', 96);
    theme(w, 16, THEME_B, 'brass', 116, -1);
    theme(w, 16, THEME_B, 'strings', 94);
    theme(w, 24, THEME_C, 'brass', 122, -1);
    theme(w, 24, THEME_C, 'brass', 108, -2);
    theme(w, 24, THEME_C, 'strings', 100);
  });
}

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
  phases: [phaseOne(), phaseTwo(), phaseThree()],
  fallen: fallen(),
});
