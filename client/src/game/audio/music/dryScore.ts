// Dry: the fight in the desert, on the savanna and across the steppe. A Phrygian with its major third (A, B flat, C
// sharp, D, E, F, G) in 7/8, two, two and three, at a quarter of 150: a caravan riding hard. A double reed's tune over
// an oud's ostinato and a darbuka's doum and tek, the strings' counter-line slow under it. The danger near is the
// cellos rubbing A against B flat in sixteenths over a frame drum and a hiss of sand. The peak lays the brass under
// the tune, the choir in open fifths and stabs on the bar, and swells into each section. The plan: a vamp, the tune,
// the steppe's gallop rising F, G, A, a break of calls and drums, the tune again. The cadence falls D, C, B flat, A;
// the victory rises F, G, A into a held A major; the defeat leaves the reed alone over the rubbing cellos.

import { chordAt, type Held, keys, measured, plan, progression, roll, runsOf } from './craft.ts';
import { type Edge, type Song, type Writer, lay, makeSong } from './score.ts';

const TRACKS = {
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
  swell: {
    program: 119,
    volume: 120,
    pan: 64,
    role: 'peak',
    voice: { mod: 3.73, index: 6, idxDecay: 4, attack: 1.6, decay: 0.02, sustain: 1, release: 0.05, gain: 0.45 },
  },
} as const;
type Track = keyof typeof TRACKS;

/** The darbuka's doum (its skin's middle) and its tek and ka (the rim, struck and brushed), a big frame drum, a kick,
 *  the riq's jingles and a crash; the danger near is a frame drum's heartbeat and a hiss of sand. */
const KIT = {
  volume: 92,
  role: 'combat',
  roles: { heart: 'tension', sand: 'tension' },
  keys: { kick: 36, frame: 41, doum: 64, tek: 37, ka: 39, riq: 54, crash: 49, heart: 87, sand: 82 },
  drums: {
    kick: { hz: 52, decay: 0.32, gain: 1.05, click: 0.4 },
    frame: { hz: 66, decay: 0.5, gain: 1.05, drop: 0.75, click: 0.25 },
    doum: { hz: 104, decay: 0.2, gain: 1.05, drop: 0.7, click: 0.2 },
    tek: { hz: 3300, q: 1.6, decay: 0.07, gain: 0.75, body: 420 },
    ka: { hz: 2400, q: 1.2, decay: 0.05, gain: 0.45 },
    riq: { hz: 7600, q: 1.4, decay: 0.12, gain: 0.32 },
    crash: { decay: 1.8, q: 0.5, gain: 0.7 },
    heart: { hz: 70, decay: 0.42, gain: 1, drop: 0.75, click: 0.12 },
    sand: { hz: 6200, q: 1.6, decay: 0.06, gain: 0.28 },
  },
} as const;
type Drum = keyof typeof KIT.keys;
type Write = Writer<Track, Drum>;

const BPM = 150;
const BEATS = 3.5;
/** The bar's groups begin on the beats 0, 1 and 2; two chords in a bar change where its three begins. */
const SPLITS = { 2: [0, 2], 3: [0, 1, 2] };
const GROUPS = [0, 1, 2] as const;
const PRESS = { threshold: -20, knee: 12, ratio: 3, attack: 0.012, release: 0.25, out: 2.35, ceiling: -3 } as const;
const LEVEL = 1.4;
const ONCE: Edge = { wrap: false, clip: true, hold: true, restrike: true };

/** Each chord's bass, timpani, pad, choir (open fifths), stab, and the oud's seven eighths. */
const chord = (bass: string, timp: string, pad: string, choir: string, stab: string, oud: string) => ({
  bass,
  timp,
  pad: keys(pad),
  choir: keys(choir),
  stab: keys(stab),
  oud: keys(oud),
});
const CHORDS = {
  A: chord('A1', 'A2', 'C#4 E4 A4', 'A3 E4', 'A2 E3', 'A2 A3 G3 A3 Bb3 A3 E3'),
  Bb: chord('Bb1', 'Bb2', 'D4 F4 Bb4', 'Bb3 F4', 'Bb2 F3', 'Bb2 Bb3 A3 Bb3 C4 Bb3 F3'),
  Gm: chord('G1', 'G2', 'D4 G4 Bb4', 'G3 D4', 'G2 D3', 'G2 G3 F3 G3 A3 G3 D3'),
  Dm: chord('D2', 'D2', 'D4 F4 A4', 'D4 A4', 'D3 A3', 'D3 D4 C4 D4 E4 D4 A3'),
  C: chord('C2', 'C2', 'E4 G4 C5', 'C4 G4', 'C3 G3', 'C3 C4 Bb3 C4 D4 C4 G3'),
  F: chord('F1', 'F2', 'C4 F4 A4', 'F3 C4', 'F2 C3', 'F2 F3 E3 F3 G3 F3 C3'),
  G: chord('G1', 'G2', 'D4 G4 B4', 'G3 D4', 'G2 D3', 'G2 G3 F3 G3 A3 G3 D3'),
};
type Chord = keyof typeof CHORDS;
const harmony = (text: string): Held<Chord>[][] => progression(text, CHORDS, BEATS, SPLITS);
const tune = (text: string) => measured(text, BEATS);

type Section = 'vamp' | 'a' | 'b' | 'break';
const HARMONY: Readonly<Record<Section, Held<Chord>[][]>> = {
  vamp: harmony('A | A | Bb | A | A | A | Gm | A'),
  a: harmony('A/Gm | A | Bb | A | Gm | Dm | Bb/A | A | Dm/C | C | Bb | A | Dm/Bb | Gm | Bb/A | A'),
  b: harmony('F | Gm | A | A | Dm | Bb | Gm/A | A | F | Gm | A | A | Dm | Bb | Bb/A | A'),
  break: harmony('A/Gm | A | Bb | A | A/Gm | A | Bb | A'),
};
const PLAN = plan<Section>([
  ['vamp', 8],
  ['a', 16],
  ['b', 16],
  ['break', 8],
  ['a', 16],
]);

/** The tune: up the mode from A to D, a turn about E, the B flat leaning on A, and at its height the B flat over A. */
const THEME = tune(
  'A4:1 Bb4:.5 C#5:.5 D5:1.5 | E5:1 F5:.5 E5:.5 D5:.5 C#5:.5 D5:.5 | Bb4:1 D5:1 F5:1.5 | E5:.5 F5:.5 E5:.5 D5:.5 C#5:1.5' +
    ' | G4:1 Bb4:.5 A4:.5 G4:1.5 | F4:1 E4:.5 F4:.5 D4:1.5 | Bb4:1 A4:1 G4:.5 F4:.5 E4:.5 | A4:1.5 E4:.5 A4:1.5' +
    ' | D5:1 F5:.5 A5:.5 G5:1.5 | E5:1 G5:.5 F5:.5 E5:1.5 | D5:1 F5:.5 E5:.5 D5:1.5 | C#5:1 D5:.5 C#5:.5 Bb4:.5 A4:1' +
    ' | D5:1 F5:.5 A5:.5 Bb5:1.5 | A5:1 G5:.5 F5:.5 G5:1.5 | F5:1 E5:1 D5:.5 C#5:.5 Bb4:.5 | A4:2 E4:.5 A4:1',
);
/** The strings under it, moving where the reed holds. */
const COUNTER = tune(
  'E4:2 F4:.5 E4:1 | C#4:3.5 | D4:2 F4:1.5 | E4:2 C#4:.5 D4:.5 E4:.5' +
    ' | D4:2 Bb3:1.5 | A3:2 F3:.5 G3:.5 A3:.5 | D4:2 C#4:1.5 | C#4:2 D4:.5 E4:1' +
    ' | F4:2 G4:1.5 | G4:2 E4:1.5 | F4:2 Bb4:.5 A4:.5 G4:.5 | E4:3.5' +
    ' | F4:2 D4:1.5 | D4:2 Bb3:.5 C4:.5 D4:.5 | D4:2 E4:1.5 | C#4:2 E4:.5 D4:.5 C#4:.5',
);
/** The steppe's gallop: repeated notes leaping a fourth, F rising to G and to A. */
const GALLOP = tune(
  'C5:.5 C5:.5 F5:.5 E5:.5 F5:.5 A5:1 | D5:.5 D5:.5 G5:.5 F5:.5 G5:.5 Bb5:1 | C#5:1 E5:1 A5:1.5' +
    ' | G5:.5 F5:.5 E5:.5 F5:.5 E5:.5 D5:.5 C#5:.5 | D5:1 A4:1 D5:1.5 | F5:1 D5:1 Bb4:1.5' +
    ' | G4:.5 A4:.5 Bb4:.5 D5:.5 C#5:.5 E5:1 | A5:1.5 G5:.5 F5:.5 E5:1' +
    ' | C5:.5 C5:.5 F5:.5 E5:.5 F5:.5 A5:1 | D5:.5 D5:.5 G5:.5 F5:.5 G5:.5 Bb5:1 | C#5:1 E5:1 A5:1.5' +
    ' | G5:.5 F5:.5 E5:.5 F5:.5 E5:.5 D5:.5 C#5:.5 | D5:1 F5:1 A5:1.5 | Bb5:1 A5:.5 G5:.5 F5:1.5' +
    ' | F5:1 E5:1 D5:.5 C#5:.5 Bb4:.5 | A4:2 E4:.5 A4:1',
);
const GALLOP_UNDER = tune(
  'F4:2 A4:1.5 | D4:2 Bb3:1.5 | E4:2 C#4:1.5 | E4:3.5 | F4:2 D4:1.5 | D4:2 F4:1.5 | D4:2 C#4:1.5 | E4:2 F4:.5 E4:1' +
    ' | F4:2 A4:1.5 | D4:2 Bb3:1.5 | E4:2 C#4:1.5 | E4:3.5 | A4:2 F4:1.5 | F4:2 D4:1.5 | D4:2 C#4:1.5 | E4:3.5',
);
/** The break's calls on the reed, the drums answering. */
const CALLS = tune(
  'A4:1 Bb4:.5 C#5:.5 D5:1.5 | r:3.5 | E5:1 F5:.5 E5:.5 D5:.5 C#5:.5 D5:.5 | r:3.5' +
    ' | A4:1 Bb4:.5 C#5:.5 D5:1.5 | r:3.5 | F5:1 E5:1 D5:.5 C#5:.5 Bb4:.5 | A4:3.5',
);

/** The darbuka's seven eighths: doum, ka, tek, ka, doum, tek, tek. */
const DARBUKA: readonly (readonly [Drum, number, number])[] = [
  ['doum', 0, 108],
  ['ka', 0.5, 52],
  ['tek', 1, 90],
  ['ka', 1.5, 48],
  ['doum', 2, 98],
  ['tek', 2.5, 70],
  ['tek', 3, 84],
];
/** The oud's eighths, the groups' first notes leaning. */
const OUD_VELOCITY = [100, 60, 86, 62, 92, 64, 72] as const;

function drums(w: Write, bar: number, drive: number, fill: boolean): void {
  const hit = (drum: Drum, beat: number, velocity: number) => w.hit(drum, bar, beat, velocity);
  for (const [drum, beat, velocity] of DARBUKA) if (drive >= 2 || drum === 'doum') hit(drum, beat, velocity);
  hit('kick', 0, 110);
  hit('frame', 0, 104);
  hit('frame', 2, 88);
  if (drive >= 2) {
    hit('riq', 1, 62);
    hit('riq', 2.5, 50);
    hit('riq', 3, 58);
  }
  if (drive >= 3) {
    hit('doum', 3, 80);
    hit('frame', 1, 80);
    hit('kick', 2, 90);
  }
  if (fill) roll((beat, velocity) => hit('tek', beat, velocity), 2, 1.5, 60, 104);
}

/** The bars under the tunes: the bed, the cellos' rub with the heart and the sand, the oud, the drums and the
 *  timpani, and the peak's choir, stabs and swells. */
function underneath(w: Write): void {
  const bars = PLAN.map(({ section, inBar }) => HARMONY[section][inBar] ?? []);
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    w.note('bass', bar, beat, beats, tones.bass, 90);
    for (const n of tones.pad) w.note('pad', bar, beat, beats, n, 56);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 70);
  }
  PLAN.forEach(({ section, inBar, pass }, bar) => {
    const held = bars[bar] ?? [];
    const drive = section === 'vamp' || (section === 'break' && inBar < 4) ? 1 : pass > 0 ? 3 : 2;
    for (const { chord: name, beat } of held) w.note('timpani', bar, beat, 0.9, CHORDS[name].timp, beat ? 86 : 100);
    // The rub swells over two bars and falls back, A on the beat, B flat off it.
    for (let i = 0; i < 14; i++)
      w.note('rub', bar, i * 0.25, 0.22, i % 2 ? 'Bb3' : 'A3', (58 + (inBar % 2) * 12 + i) * (i % 4 ? 0.9 : 1.1));
    w.hit('heart', bar, 0, 96);
    w.hit('heart', bar, 2, 80);
    for (let i = 0; i < 7; i++) w.hit('sand', bar, i * 0.5, i % 2 ? 40 : 56);
    for (let i = 0; i < 7; i++)
      w.note('oud', bar, i * 0.5, 0.45, CHORDS[chordAt(held, i * 0.5)].oud[i] ?? 0, OUD_VELOCITY[i] ?? 64);
    drums(w, bar, drive, inBar % 4 === 3);
    if (inBar === 0) w.hit('crash', bar, 0, 100);
    if (inBar % 8 === 7) {
      roll(
        (beat, velocity) => w.note('timpani', bar, beat, 0.22, CHORDS[chordAt(held, 2)].timp, velocity),
        2,
        1.5,
        50,
        96,
      );
      if ((PLAN[bar + 1]?.inBar ?? 0) === 0)
        for (const n of keys('A5 Bb5')) w.note('swell', bar + 1, -(1.6 * BPM) / 60, (1.6 * BPM) / 60, n, 84);
    }
    if (section !== 'vamp')
      for (const beat of inBar % 2 ? [2] : GROUPS)
        for (const n of CHORDS[chordAt(held, beat)].stab) w.note('stab', bar, beat, 0.4, n, beat ? 88 : 100);
  });
}

/** The tunes: the reed's over the strings' counter-line, the second time with the brass an octave under it; the
 *  gallop on the reed, the strings under it, the brass with the reed the whole way; the calls in the break. */
function tunes(w: Write): void {
  PLAN.forEach(({ section, inBar, pass }, bar) => {
    if (inBar !== 0) return;
    if (section === 'a') {
      lay(w, 'reed', bar, THEME, 100 + pass * 4, { legato: 0.92 });
      lay(w, 'strings', bar, COUNTER, 76, { legato: 0.97, accent: 4 });
      lay(w, 'brass', pass ? bar : bar + 8, THEME, 84, { octave: -1, legato: 0.9, accent: 4, from: pass ? 0 : 8 });
    } else if (section === 'b') {
      lay(w, 'reed', bar, GALLOP, 102, { legato: 0.85 });
      lay(w, 'strings', bar, GALLOP_UNDER, 78, { legato: 0.97, accent: 4 });
      lay(w, 'brass', bar, GALLOP, 86, { octave: -1, legato: 0.85, accent: 4 });
    } else if (section === 'break') lay(w, 'reed', bar, CALLS, 100, { legato: 0.92 });
  });
}

const SONG = { tracks: TRACKS, kit: KIT, beatsPerBar: BEATS, bpm: BPM, press: PRESS } as const;

const fight = (): Song =>
  makeSong({ ...SONG, name: 'dry-fight', bars: PLAN.length, level: LEVEL }, (w) => {
    underneath(w);
    tunes(w);
  });

/** A sting's bed: each chord on the bass and the pad, `loud` its velocity's share. */
function stingBed(w: Write, bars: readonly Held<Chord>[][], loud: number): void {
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    w.note('bass', bar, beat, beats, tones.bass, 90 * loud);
    for (const n of tones.pad) w.note('pad', bar, beat, beats, n, 64 * loud);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 60 * loud);
  }
}

/** The cadence: the tune's close over D minor, C, B flat and A, the reed coming to rest on A. */
const cadence = (): Song =>
  makeSong({ ...SONG, name: 'dry-cadence', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Dm/C | Bb/A | A'), 0.9);
    lay(w, 'reed', 0, tune('D5:1 F5:1 E5:1.5 | F5:1 E5:1 D5:.5 C#5:.5 Bb4:.5 | A4:3.5'), 94, { legato: 0.97 });
    lay(w, 'strings', 0, tune('A4:2 G4:1.5 | F4:2 E4:1.5 | C#4:3.5'), 74, { legato: 0.98 });
    w.note('timpani', 2, 0, 0.9, 'A2', 84);
    w.hit('heart', 2, 0, 80);
  });

/** The victory: the gallop's rise F, G, A on the reed and the brass, a G major lifting it, then A major held. */
const victory = (): Song =>
  makeSong({ ...SONG, name: 'dry-victory', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('F | G | A | A'), 1);
    const rise = tune(
      'C5:.5 C5:.5 F5:.5 E5:.5 F5:.5 A5:1 | D5:.5 D5:.5 G5:.5 F5:.5 G5:.5 B5:1 | C#5:1 E5:1 A5:1.5 | A5:3.5',
    );
    lay(w, 'reed', 0, rise, 104);
    lay(w, 'brass', 0, rise, 92, { octave: -1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 2, bar === 1);
    w.note('timpani', 2, 0, 0.9, 'A2', 112);
    for (const n of keys('A2 E3 A3')) w.note('stab', 2, 0, 7, n, 104);
    w.hit('kick', 2, 0, 116);
    w.hit('frame', 2, 0, 110);
    w.hit('crash', 2, 0, 108);
  });

/** The defeat: the reed alone climbing the tune's first notes and falling back, over the cellos' rub fading. */
const defeat = (): Song =>
  makeSong({ ...SONG, name: 'dry-defeat', bars: 5, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('A | Bb/A | Gm/A | A | A'), 0.7);
    lay(w, 'reed', 0, tune('A4:1 Bb4:.5 C#5:.5 D5:1.5 | C#5:2 Bb4:1.5 | A4:3.5'), 84, { legato: 0.98 });
    for (let bar = 0; bar < 4; bar++)
      for (let i = 0; i < 14; i++) w.note('rub', bar, i * 0.25, 0.22, i % 2 ? 'Bb3' : 'A3', 70 - bar * 12 - i);
    for (const [bar, velocity] of [
      [0, 92],
      [1, 78],
      [3, 60],
    ] as const)
      w.hit('heart', bar, 0, velocity);
  });

/** Dry's fight score: the fight, and its cadence, victory and defeat. */
export const dryScore = () => ({ song: fight(), cadence: cadence(), victory: victory(), defeat: defeat() });
