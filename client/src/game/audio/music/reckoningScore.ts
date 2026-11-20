// The Reckoning: a boss's score in C minor and a clock. Its motif is a quarter chime struck in the minor and broken:
// its fourth change ends on F sharp, the tritone of home, where the hour should strike. A harpsichord ticks an
// escapement in eighths and sixteenths over the chord, wood blocks tick and tock on the beat, tubular bells toll the
// chime; the harmony turns on the augmented triad (A-flat, C, E: the minor's own third undone) and the Neapolitan
// D-flat; the theme is on the brass and the horns, low. Three phases at 136, 142 and 152 beats a minute, the second
// a canon (the theme on the brass, its echo two beats behind on the strings an octave down, over E major against C
// minor); the last, at 160, C minor and D-flat a bar each with the bell counting every bar. When the boss falls the
// chime is mended: the quarters in C major, ending home.

import { type Press, type Song, type Tune, type Writer, lay, makeSong, midiNote, tune } from './score.ts';

type Track =
  'clock' | 'bass' | 'strings' | 'brass' | 'choir' | 'organ' | 'timpani' | 'chime' | 'bells' | 'horn' | 'harp' | 'hit';
type Drum =
  | 'kick'
  | 'snare'
  | 'lowTom'
  | 'highFloorTom'
  | 'tom'
  | 'lowMidTom'
  | 'hiMidTom'
  | 'crash'
  | 'chinese'
  | 'rideBell'
  | 'claves'
  | 'tick'
  | 'tock'
  | 'surdo';
type Write = Writer<Track, Drum>;

/** The escapement left, the chime further left, the bells and the strings right: a clock's face across the stereo. */
const TRACKS = {
  clock: { program: 6, volume: 100, pan: 44, role: 'pulse' },
  bass: { program: 32, volume: 98, pan: 64, role: 'bed' },
  strings: { program: 48, volume: 104, pan: 84, role: 'bed' },
  brass: { program: 61, volume: 120, pan: 58, role: 'lead' },
  choir: { program: 52, volume: 110, pan: 72, role: 'peak' },
  organ: { program: 19, volume: 84, pan: 64, role: 'bed' },
  timpani: { program: 47, volume: 112, pan: 64, role: 'combat' },
  chime: { program: 10, volume: 106, pan: 34, role: 'tension' },
  bells: { program: 14, volume: 98, pan: 92, role: 'tension' },
  horn: { program: 60, volume: 112, pan: 70, role: 'peak' },
  harp: { program: 46, volume: 94, pan: 40, role: 'bed' },
  hit: { program: 55, volume: 106, pan: 64, role: 'peak' },
} as const;

/** The clock's woods (the tick, the tock) and the surdo are the tension's; the rest of the kit is the fight's. */
const KIT = {
  volume: 112,
  role: 'combat',
  roles: { tick: 'tension', tock: 'tension', surdo: 'tension' },
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
    rideBell: 53,
    claves: 75,
    tick: 76,
    tock: 77,
    surdo: 87,
  },
} as const;

/** A gentle compressor (4:1 over a wide knee) and a soft ceiling three decibels under the clip; DRIVE sets the first
 *  phase at -18.5 dBFS, the others keeping their rise over it. */
const PRESS = { threshold: -18, knee: 12, ratio: 4, attack: 0.003, release: 0.25, ceiling: -3 } as const;
const DRIVE = 0.36;
const press = (out: number): Press => ({ ...PRESS, out: out * DRIVE });
const SPEC = { tracks: TRACKS, kit: KIT, edge: { wrap: true, clip: false, hold: false, restrike: false } } as const;

const notes = (text: string): readonly string[] => text.split(' ');

/** The chime, a change a bar: broken, and mended. */
const BROKEN = ['Eb5 D5 C5 G4', 'C5 Eb5 D5 G4', 'Eb5 C5 D5 G4', 'G4 D5 Eb5 F#5'].map(notes);
const MENDED = ['E5 D5 C5 G4', 'C5 E5 D5 G4', 'E5 C5 D5 G4', 'G4 D5 E5 C5'].map(notes);

/** A chord's bass and timpani, its pad (the organ), the strings' and the choir's voicings, its escapement (eight
 *  eighths, the root's swing against its fifth and a turn at the end), its stab, and the fall's harp, up and back. */
const chord = (bass: string, timp: string, pad: string, str: string, choir: string, clock: string, stab: string) => ({
  bass,
  timp,
  pad: notes(pad),
  str: notes(str),
  choir: notes(choir),
  clock: notes(clock),
  stab: notes(stab),
});
const CHORDS = {
  Cm: chord('C2', 'C2', 'C3 G3 C4', 'C4 Eb4 G4', 'C3 G3 Eb4', 'C4 G3 Eb4 G3 C4 G3 D4 G3', 'C3 G3 C4'),
  Aaug: chord('Ab1', 'C2', 'Ab2 E3 C4', 'C4 E4 Ab4', 'Ab2 E3 C4', 'C4 Ab3 E4 Ab3 C4 Ab3 E4 Ab3', 'Ab2 E3 C4'),
  Fm: chord('F1', 'F2', 'F2 C3 F3', 'C4 F4 Ab4', 'F2 C3 Ab3', 'C4 F3 Ab3 F3 C4 F3 Bb3 F3', 'F2 C3 F3'),
  G: chord('G1', 'G2', 'G2 D3 G3', 'B3 D4 G4', 'G2 D3 B3', 'B3 G3 D4 G3 B3 G3 F4 G3', 'G2 D3 G3'),
  Db: chord('Db2', 'Ab2', 'Db3 Ab3 Db4', 'Db4 F4 Ab4', 'Db3 Ab3 F4', 'Db4 Ab3 F4 Ab3 Db4 Ab3 C4 Ab3', 'Db3 Ab3 Db4'),
  Bbm: chord('Bb1', 'F2', 'Bb2 F3 Bb3', 'Db4 F4 Bb4', 'Bb2 F3 Db4', 'Db4 Bb3 F4 Bb3 Db4 Bb3 C4 Bb3', 'Bb2 F3 Bb3'),
  E: chord('E2', 'B2', 'E3 B3 E4', 'E4 G#4 B4', 'E3 B3 G#4', 'E4 B3 G#4 B3 E4 B3 F#4 B3', 'E3 B3 E4'),
  Ab: chord('Ab1', 'Eb2', 'Ab2 Eb3 Ab3', 'C4 Eb4 Ab4', 'Ab2 Eb3 C4', 'C4 Ab3 Eb4 Ab3 C4 Ab3 Bb3 Ab3', 'Ab2 Eb3 Ab3'),
  C: chord('C2', 'C2', 'C3 G3 E4', 'C4 E4 G4', 'C3 G3 E4', 'C4 G3 E4 G3 C4 G3 D4 G3', 'C4 E4 G4'),
};
type ChordName = keyof typeof CHORDS;
const FALL_HARP = notes('C3 G3 C4 E4 G4 E4 C4 G3');

/** The progressions, a chord a bar: the first phase's (C minor, the augmented, the minor four, the dominant, the
 *  Neapolitan), the canon's (to E major, a third apart), the third's, and the last's. */
const progression = (text: string): readonly ChordName[] => text.split(' ') as ChordName[];
const FIRST = progression('Cm Aaug Fm G Cm Db G G');
const CANON = progression('Cm E Cm Ab Fm Db G G');
const THIRD = progression('Cm Db Bbm Db Fm Aaug G G');
const LAST = progression('Cm Db Cm Db Cm Db G G');

/** The theme three ways: opening on the chime's own first notes, low, leaning on E natural against E-flat; dotted and
 *  climbing for the canon; in eighths, up the chord and down, for the third phase. */
const THEME_ONE = tune(
  'C4:1 G3:1 Eb4:1.5 D4:.5 | C4:2 E4:1 Ab4:1 | F4:1.5 Ab4:.5 G4:1 F4:1 | D4:2 B3:1 G3:1 | Eb4:1 D4:1 C4:1 G3:1 | Db4:2 F4:1 Ab4:1 | G4:1.5 F4:.5 Eb4:1 D4:1 | D4:2 G3:1 B3:1',
);
const THEME_TWO = tune(
  'G4:.75 G4:.25 Eb4:1 C4:1 G4:1 | G#4:.75 G#4:.25 B4:1 E5:2 | G4:.75 Eb4:.25 C5:1 Bb4:1 G4:1 | Ab4:2 C5:1 Eb5:1 | F4:.75 F4:.25 Ab4:1 C5:1 Db5:1 | Db5:1.5 C5:.5 Ab4:1 F4:1 | G4:1 B4:1 D5:1 F5:1 | Eb5:2 D5:1 B4:1',
);
const THEME_THREE = tune(
  'C5:.5 C5:.5 D5:.5 Eb5:.5 G5:1 C5:1 | Db5:1 F5:.5 Ab5:.5 F5:1 Db5:1 | Bb4:.5 Bb4:.5 Db5:.5 F5:.5 Bb5:1 F5:1 | Ab5:1 F5:1 Db5:1 Ab4:1 | F5:.5 G5:.5 Ab5:.5 G5:.5 F5:1 C5:1 | E5:1 Ab5:1 C6:1 Ab5:1 | B4:.5 D5:.5 F5:.5 Ab5:.5 G5:1 F5:1 | G5:2 F#5:1 G5:1',
);
/** A theme's eight bars, `late` beats behind for the canon's echo (which runs round the loop's seam). */
const theme = (w: Write, first: number, bars: Tune, track: Track, velocity: number, octave = 0, late = 0) =>
  lay(w, track, first, bars, velocity, { octave, late, accent: 10 });

/** A change of the chime on a track, a note a beat. */
function chimeBar(w: Write, bar: number, change: readonly string[], track: Track, velocity: number, octave = 0): void {
  change.forEach((n, i) => w.note(track, bar, i, 0.95, midiNote(n) + 12 * octave, velocity - i * 3));
}

/** The escapement under a chord for a bar, in eighths or sixteenths, the bar's first and each half's first accented. */
function escapement(w: Write, bar: number, name: ChordName, { fast = false, vel = 1 } = {}): void {
  const clock = CHORDS[name].clock;
  if (fast)
    for (let sixteenth = 0; sixteenth < 16; sixteenth++)
      w.note(
        'clock',
        bar,
        sixteenth * 0.25,
        0.2,
        clock[sixteenth % 8],
        (sixteenth % 8 === 0 ? 100 : sixteenth % 4 === 0 ? 88 : 72) * vel,
      );
  else clock.forEach((n, i) => w.note('clock', bar, i * 0.5, 0.42, n, (i === 0 ? 98 : i === 4 ? 88 : 74) * vel));
}

/** The chord's floor for a bar: its bass twice, its pad, and if asked its strings and its choir. */
function floorBar(w: Write, bar: number, name: ChordName, { strings = false, choir = false, organ = 1, vel = 1 } = {}) {
  const tones = CHORDS[name];
  w.note('bass', bar, 0, 1.8, tones.bass, 104 * vel);
  w.note('bass', bar, 2, 1.8, tones.bass, 96 * vel);
  if (organ > 0) for (const n of tones.pad) w.note('organ', bar, 0, 4, n, 80 * organ);
  if (strings) for (const n of tones.str) w.note('strings', bar, 0, 4, n, 90 * vel);
  if (choir) for (const n of tones.choir) w.note('choir', bar, 0, 4, n, 96 * vel);
}

/** The war's drums for a bar: half time, `full`, or the kick on `every` beat; the clock's woods ticking and tocking
 *  through all of it; the ride bell's gears on the offbeats; the claves `racing` in sixteenths; a fill into every
 *  fourth bar. */
function warKit(w: Write, bar: number, { full = false, every = false, gears = false, racing = false } = {}): void {
  w.hit('surdo', bar, 0, 106);
  if (every) for (let beat = 0; beat < 4; beat++) w.hit('kick', bar, beat, beat === 0 ? 112 : 98);
  else
    for (const beat of full ? [0, 0.75, 1.5, 2, 2.75, 3.5] : [0, 0.75, 1.5])
      w.hit('kick', bar, beat, beat === 0 ? 110 : 94);
  for (const beat of full || every ? [1, 3] : [2]) w.hit('snare', bar, beat, 108);
  for (let beat = 0; beat < 4; beat++) w.hit(beat % 2 === 0 ? 'tick' : 'tock', bar, beat, 84 - (beat % 2) * 8);
  if (gears) for (let beat = 0; beat < 4; beat++) w.hit('rideBell', bar, beat + 0.5, 70);
  if (racing)
    for (let sixteenth = 0; sixteenth < 16; sixteenth++)
      w.hit('claves', bar, sixteenth * 0.25, sixteenth % 4 === 0 ? 80 : 60);
  if (bar % 4 === 3)
    (['hiMidTom', 'lowMidTom', 'tom', 'highFloorTom', 'lowTom'] as const).forEach((k, i) =>
      w.hit(k, bar, 2.75 + i * 0.25, 88 + i * 5),
    );
  if (bar % 4 === 0) w.hit('crash', bar, 0, 96);
}

/** Phase one: the escapement in eighths, sixteenths into every fourth bar and through the last eight, the brass's
 *  stabs, the theme from the ninth bar, then the horns and the choir; a change of the broken chime each section. */
function phaseOne(): Song {
  return makeSong({ ...SPEC, name: 'reckoning-1', bpm: 136, bars: 32, level: 1.42, press: press(5.2) }, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const name = FIRST[bar % 8];
      const tones = CHORDS[name];
      floorBar(w, bar, name, { strings: true, choir: bar >= 16 });
      escapement(w, bar, name, { fast: bar % 4 === 3 || bar >= 24 });
      w.note('timpani', bar, 0, 1, tones.timp, 110);
      w.note('timpani', bar, 1.5, 0.5, tones.timp, 94);
      if (bar < 8 || bar % 2 === 0)
        for (const n of tones.stab) {
          w.note('brass', bar, 0, 0.9, n, 112);
          w.note('brass', bar, 1.5, 0.45, n, 98);
        }
      if (bar % 4 === 0) for (const n of tones.stab) w.note('hit', bar, 0, 1, n, 102);
      if (bar % 8 === 0) chimeBar(w, bar, BROKEN[(bar / 8) % 4], 'bells', 96, -1);
      warKit(w, bar, { gears: bar >= 16 });
    }
    theme(w, 8, THEME_ONE, 'brass', 112);
    theme(w, 16, THEME_ONE, 'brass', 116);
    theme(w, 16, THEME_ONE, 'horn', 100, 1);
    theme(w, 24, THEME_ONE, 'brass', 120);
    theme(w, 24, THEME_ONE, 'horn', 106);
    theme(w, 24, THEME_ONE, 'choir', 100);
  });
}

/** Phase two, the canon: the theme on the brass, its echo on the strings two beats behind and an octave down, over the
 *  escapement driving every other bar; the bells struck in pairs; the kit in full time. */
function phaseTwo(): Song {
  return makeSong({ ...SPEC, name: 'reckoning-2', bpm: 142, bars: 32, level: 1.55, press: press(5.2) }, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const name = CANON[bar % 8];
      const tones = CHORDS[name];
      floorBar(w, bar, name, { choir: true, organ: 1.1 });
      escapement(w, bar, name, { fast: bar % 2 === 1 });
      w.note('timpani', bar, 0, 1, tones.timp, 110);
      w.note('timpani', bar, 1.5, 0.5, tones.timp, 94);
      w.note('timpani', bar, 2, 1, tones.timp, 104);
      for (const n of tones.stab) {
        w.note('hit', bar, 0, 1, n, 102);
        if (bar % 2 === 1) w.note('hit', bar, 2.5, 0.5, n, 96);
      }
      if (bar % 4 === 0) {
        w.note('bells', bar, 0, 2, tones.pad[0], 94);
        w.note('bells', bar, 0.5, 2, tones.pad[1], 86);
      }
      if (bar % 8 === 0) chimeBar(w, bar, BROKEN[(bar / 8) % 4], 'chime', 100);
      warKit(w, bar, { full: true, gears: true });
      if (bar % 8 === 7) w.hit('chinese', bar, 3, 96);
    }
    theme(w, 0, THEME_TWO, 'brass', 112);
    theme(w, 0, THEME_TWO, 'strings', 92, -1, 2);
    theme(w, 8, THEME_TWO, 'brass', 116);
    theme(w, 8, THEME_TWO, 'strings', 96, -1, 2);
    theme(w, 16, THEME_ONE, 'brass', 114);
    theme(w, 16, THEME_ONE, 'horn', 102, 1, 2);
    theme(w, 24, THEME_TWO, 'brass', 120);
    theme(w, 24, THEME_TWO, 'horn', 104, 0, 2);
    theme(w, 24, THEME_TWO, 'choir', 96, -1);
  });
}

/** Phase three: the escapement in sixteenths through every bar, the claves racing, the kick on every beat, the choir
 *  chanting the beat, the theme in eighths over it all, the broken chime tolled every fourth bar. */
function phaseThree(): Song {
  return makeSong({ ...SPEC, name: 'reckoning-3', bpm: 152, bars: 32, level: 1.62, press: press(5.6) }, (w) => {
    for (let bar = 0; bar < 32; bar++) {
      const name = THIRD[bar % 8];
      const tones = CHORDS[name];
      floorBar(w, bar, name, { strings: true, organ: 1.2, vel: 1.05 });
      escapement(w, bar, name, { fast: true, vel: 1.05 });
      for (let beat = 0; beat < 4; beat++)
        for (const n of tones.choir) w.note('choir', bar, beat, 0.9, n, beat === 0 ? 106 : 92);
      for (let i = 0; i < 8; i++)
        w.note('timpani', bar, i * 0.5, 0.4, i % 4 === 3 ? 'G2' : tones.timp, i === 0 ? 110 : 96);
      for (const n of tones.stab) {
        w.note('hit', bar, 0, 1, n, 104);
        w.note('hit', bar, 2.5, 0.5, n, 98);
      }
      if (bar % 4 === 0) chimeBar(w, bar, BROKEN[(bar / 4) % 4], 'bells', 98, -1);
      warKit(w, bar, { every: true, racing: true });
      if (bar % 2 === 0) w.hit('crash', bar, 0, 96);
    }
    theme(w, 0, THEME_THREE, 'brass', 114, -1);
    theme(w, 8, THEME_THREE, 'brass', 118, -1);
    theme(w, 8, THEME_THREE, 'strings', 96);
    theme(w, 16, THEME_ONE, 'brass', 116);
    theme(w, 16, THEME_ONE, 'horn', 104, 1);
    theme(w, 24, THEME_THREE, 'brass', 122, -1);
    theme(w, 24, THEME_THREE, 'horn', 106, -1);
    theme(w, 24, THEME_THREE, 'strings', 100);
  });
}

/** The last stand: C minor and the Neapolitan a bar each, the bell tolling every bar and louder each time, the broken
 *  change hammered on the brass and the horns in octaves, the escapement and the claves in sixteenths. */
function lastStand(): Song {
  return makeSong({ ...SPEC, name: 'reckoning-last', bpm: 160, bars: 16, level: 1.66, press: press(5.8) }, (w) => {
    for (let bar = 0; bar < 16; bar++) {
      const name = LAST[bar % 8];
      const tones = CHORDS[name];
      floorBar(w, bar, name, { strings: true, choir: true, organ: 1.2, vel: 1.05 });
      escapement(w, bar, name, { fast: true, vel: 1.1 });
      w.note('bells', bar, 0, 3.5, bar % 8 >= 6 ? 'F#4' : 'C4', 100 + Math.min(20, bar));
      for (let i = 0; i < 8; i++) w.note('timpani', bar, i * 0.5, 0.4, tones.timp, i === 0 ? 114 : 96);
      if (bar % 2 === 0) {
        chimeBar(w, bar, BROKEN[3], 'brass', 118, -1);
        chimeBar(w, bar, BROKEN[3], 'horn', 108, -2);
      } else
        for (const n of tones.stab) {
          w.note('brass', bar, 0, 0.9, n, 114);
          w.note('brass', bar, 2, 0.9, n, 108);
          w.note('hit', bar, 0, 1, n, 106);
        }
      warKit(w, bar, { every: true, racing: true });
      w.hit('crash', bar, 0, bar % 2 === 0 ? 100 : 86);
    }
  });
}

/** The fall: a timpani roll into C major, the mended chime on the brass and the strings over the bells' four
 *  quarters, the choir; five bars, the hour struck at last, then quiet. */
function fallen(): Song {
  return makeSong({ ...SPEC, name: 'reckoning-fallen', bpm: 88, bars: 12, level: 1.7, press: press(5.6) }, (w) => {
    for (let i = 0; i < 16; i++) w.note('timpani', 0, i * 0.25, 0.24, 'C2', 56 + i * 4);
    for (const n of notes('G3 C4 E4')) w.note('choir', 0, 2, 2, n, 82);
    const major = CHORDS.C;
    for (const n of major.stab) w.note('hit', 1, 0, 1.5, n, 112);
    w.note('timpani', 1, 0, 1, 'C2', 112);
    w.hit('crash', 1, 0, 104);
    w.hit('kick', 1, 0, 112);
    w.hit('surdo', 1, 0, 104);
    for (const [bar, change] of [
      [1, MENDED[0]],
      [2, MENDED[3]],
    ] as const) {
      chimeBar(w, bar, change, 'brass', 122, -1);
      chimeBar(w, bar, change, 'strings', 100);
    }
    w.note('brass', 3, 0, 4, 'C4', 122);
    w.note('horn', 3, 0, 4, 'G3', 112);
    MENDED.forEach((change, quarter) => chimeBar(w, 1 + quarter, change, 'bells', 100 - quarter * 2));
    for (const n of major.pad) {
      w.note('organ', 1, 0, 16, n, 94);
      w.note('strings', 3, 0, 6, midiNote(n) + 12, 100);
    }
    for (const n of major.choir) w.note('choir', 1, 0, 16, n, 108);
    w.note('bass', 1, 0, 16, 'C2', 118);
    FALL_HARP.forEach((n, i) => {
      w.note('harp', 3, i * 0.5, 0.45, n, 86);
      w.note('harp', 4, i * 0.5, 0.45, midiNote(n) + 12, 80);
    });
    w.note('timpani', 3, 0, 1, 'C2', 116);
    for (let i = 0; i < 8; i++) w.note('timpani', 4, 2 + i * 0.25, 0.24, 'C2', 76 + i * 5);
    w.note('timpani', 5, 0, 1, 'C2', 112);
    w.hit('crash', 5, 0, 102);
    w.hit('kick', 5, 0, 104);
    for (const n of major.stab) w.note('hit', 5, 0, 1, n, 108);
    w.note('bells', 5, 0, 2, 'C5', 104);
  });
}

/** The Reckoning's songs: its three phases, its last stand and its fall. */
export const reckoningScore = (): { readonly phases: readonly Song[]; readonly last: Song; readonly fallen: Song } => ({
  phases: [phaseOne(), phaseTwo(), phaseThree()],
  last: lastStand(),
  fallen: fallen(),
});
