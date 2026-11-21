// Cold: the fight on the tundra. B Aeolian, its C natural (the flat second) borrowed for the bleakest bar, in 5/4,
// three and two, at 120: a march through deep snow. A horn calls the tune over the low strings' ostinato and the
// taiko, a fiddle above it with a counter-line, the harmony spaced wide: a low bass, open fifths high, little between.
// The danger near is the wind and a slow heart: the strings shivering in open fifths, gusts of noise as wind,
// the strings' wood ticking and the taiko on the bar's two strong beats. The peak doubles the horn with the brass
// and sets the choir high. The plan: a vamp, the tune, the fiddle's tune over the horns, a break, the tune's first
// half again. The cadence closes on the low B, the victory rises G, A into B major, the defeat falls through C.

import { chordAt, type Held, keys, measured, plan, progression, roll, runsOf } from './craft.ts';
import { type Edge, type Song, type Writer, lay, makeSong } from './score.ts';

const TRACKS = {
  bass: { program: 43, volume: 80, pan: 64, role: 'bed', voice: { attack: 0.08, release: 0.5, index: 1.5, sub: 0.2 } },
  air: {
    program: 49,
    volume: 90,
    pan: 76,
    role: 'bed',
    voice: { attack: 0.6, release: 1, index: 1, idxDecay: 2.5, unison: 2, cents: 8, spread: 0.6 },
  },
  shiver: {
    program: 44,
    volume: 76,
    pan: 96,
    role: 'tension',
    voice: { attack: 0.9, decay: 0.3, sustain: 0.9, release: 1, index: 1.3, unison: 2, cents: 14, spread: 0.4 },
  },
  tick: {
    program: 45,
    volume: 114,
    pan: 30,
    role: 'tension',
    voice: { attack: 0.002, decay: 0.08, sustain: 0.01, release: 0.05, index: 3.2, idxDecay: 0.03 },
  },
  ostinato: {
    program: 42,
    volume: 116,
    pan: 56,
    role: 'pulse',
    voice: { attack: 0.006, decay: 0.12, sustain: 0.5, release: 0.08, index: 2.2, idxDecay: 0.12, unison: 2, cents: 7 },
  },
  timpani: { program: 47, volume: 98, pan: 64, role: 'combat', voice: { decay: 1, release: 0.6 } },
  horn: {
    program: 60,
    volume: 116,
    pan: 46,
    role: 'lead',
    voice: { attack: 0.07, index: 2.6, idxDecay: 0.7, unison: 2, cents: 7, spread: 0.2 },
  },
  fiddle: {
    program: 40,
    volume: 117,
    pan: 72,
    role: 'lead',
    voice: { attack: 0.04, decay: 0.3, sustain: 0.85, release: 0.3, index: 2, idxDecay: 0.9, unison: 2, cents: 8 },
  },
  brass: {
    program: 61,
    volume: 96,
    pan: 36,
    role: 'peak',
    voice: { attack: 0.06, index: 3, idxDecay: 0.7, unison: 2, cents: 8, spread: 0.3 },
  },
  choir: {
    program: 52,
    volume: 92,
    pan: 68,
    role: 'peak',
    voice: { mod: 1, index: 1.1, idxDecay: 2, attack: 0.45, release: 0.9, unison: 2, cents: 12, spread: 0.5 },
  },
} as const;
type Track = keyof typeof TRACKS;

/** A taiko, long and falling with its beater's click, three toms, a frame drum, a field snare, a kick and the
 *  cymbals; the slow heart is a softer, deeper drum. */
const KIT = {
  volume: 86,
  role: 'combat',
  roles: { heart: 'tension', gust: 'tension', riser: 'peak' },
  keys: {
    kick: 36,
    taiko: 87,
    lowTom: 41,
    midTom: 45,
    highTom: 48,
    frame: 43,
    snare: 38,
    crash: 49,
    china: 52,
    heart: 35,
    gust: 54,
    riser: 55,
  },
  drums: {
    kick: { hz: 50, decay: 0.34, gain: 1.05, click: 0.4 },
    taiko: { hz: 58, decay: 0.9, gain: 1.2, drop: 0.7, click: 0.45 },
    lowTom: { hz: 82, decay: 0.5, click: 0.35 },
    midTom: { hz: 106, decay: 0.45, click: 0.35 },
    highTom: { hz: 136, decay: 0.4, click: 0.35 },
    frame: { hz: 74, decay: 0.3, gain: 0.8, drop: 0.8, click: 0.3 },
    snare: { hz: 1500, q: 0.7, decay: 0.2, gain: 0.8, body: 170 },
    crash: { decay: 2.2, q: 0.45, gain: 0.7 },
    china: { decay: 1.4, q: 0.55, gain: 0.6 },
    heart: { hz: 50, decay: 0.75, gain: 1.1, drop: 0.7, click: 0.15 },
    // A swell of noise rising into the bar line, a reverse cymbal: noise, so it never whines as a pitched sweep does.
    riser: { hz: 2600, q: 0.6, attack: 1.6, decay: 0.12, gain: 0.6 },
    // A gust: noise swelling and dying round 700 Hz, wind, never the pitched sweep that whined.
    gust: { hz: 700, q: 0.7, attack: 2.4, decay: 1.6, gain: 0.5 },
  },
} as const;
type Drum = keyof typeof KIT.keys;
type Write = Writer<Track, Drum>;

const BPM = 120;
const BEATS = 5;
const PRESS = { threshold: -20, knee: 12, ratio: 3, attack: 0.012, release: 0.25, out: 2.35, ceiling: -3 } as const;
const LEVEL = 1.4;
const ONCE: Edge = { wrap: false, clip: true, hold: true, restrike: true };

/** Each chord's bass, timpani, the high fifths of the air and of the shiver, the choir, and the low strings' ten
 *  eighths. */
const chord = (bass: string, timp: string, air: string, shiver: string, choir: string, ostinato: string) => ({
  bass,
  timp,
  air: keys(air),
  shiver: keys(shiver),
  choir: keys(choir),
  ostinato: keys(ostinato),
});
const CHORDS = {
  'Bm': chord('B1', 'B2', 'F#4 B4 D5', 'B5 F#6', 'D5 B5', 'B2 B2 F#3 B2 B2 F#3 B3 A3 F#3 D3'),
  'G': chord('G1', 'G2', 'G4 B4 D5', 'B5 D6', 'D5 B5', 'G2 G2 D3 G2 G2 D3 G3 F#3 D3 B2'),
  'A': chord('A1', 'A2', 'E4 A4 C#5', 'A5 E6', 'C#5 A5', 'A2 A2 E3 A2 A2 E3 A3 G3 E3 C#3'),
  'Em': chord('E2', 'E2', 'E4 G4 B4', 'B5 E6', 'B4 G5', 'E2 E2 B2 E2 E2 B2 E3 D3 B2 G2'),
  'F#m': chord('F#1', 'F#2', 'F#4 A4 C#5', 'C#6 F#6', 'C#5 A5', 'F#2 F#2 C#3 F#2 F#2 C#3 F#3 E3 C#3 A2'),
  'C': chord('C2', 'C2', 'E4 G4 C5', 'G5 C6', 'C5 G5', 'C2 C2 G2 C2 C2 G2 C3 B2 G2 E2'),
  'D': chord('D2', 'D2', 'F#4 A4 D5', 'A5 D6', 'D5 A5', 'D2 D2 A2 D2 D2 A2 D3 C#3 A2 F#2'),
  'B': chord('B1', 'B2', 'F#4 B4 D#5', 'B5 F#6', 'D#5 B5', 'B2 B2 F#3 B2 B2 F#3 B3 A3 F#3 D#3'),
};
type Chord = keyof typeof CHORDS;
const harmony = (text: string): Held<Chord>[][] => progression(text, CHORDS, BEATS, { 2: [0, 3] });
const tune = (text: string) => measured(text, BEATS);

type Section = 'vamp' | 'a' | 'b' | 'break';
const HARMONY: Readonly<Record<Section, Held<Chord>[][]>> = {
  vamp: harmony('Bm | Bm | G | F#m'),
  a: harmony('Bm | Bm | G | A | Bm | Bm | Em | F#m | G | A | Bm | C | G | Em | C/F#m | Bm'),
  b: harmony('G | D | A | Em | G | D | C | F#m'),
  break: harmony('Bm | C | Bm | F#m'),
};
const PLAN = plan<Section>([
  ['vamp', 4],
  ['a', 16],
  ['b', 8],
  ['break', 4],
  ['a', 8],
]);

/** The horn's call: up a fifth from B and falling back, again to the high B, and, in its second half, up to D and
 *  down through the C of the flat second to the low B. */
const THEME = tune(
  'B3:1 F#4:2 E4:1 D4:1 | F#4:1.5 E4:.5 D4:1 B3:2 | G4:1 D4:2 G4:1 A4:1 | C#5:3 B4:1 A4:1' +
    ' | B3:1 F#4:2 E4:1 D4:1 | F#4:1.5 E4:.5 A4:1 B4:2 | G4:1 E4:1 B4:1 A4:1 G4:1 | F#4:5' +
    ' | D5:2 B4:1 G4:1 A4:1 | C#5:2 A4:1 E4:1 F#4:1 | D5:1 C#5:1 B4:1 F#4:2 | G4:1.5 E4:.5 C5:3' +
    ' | B4:2 A4:1 G4:1 E4:1 | G4:1.5 F#4:.5 E4:1 B3:2 | E4:2 G4:1 F#4:2 | B3:5',
);
/** The fiddle over it, moving where the horn holds. */
const COUNTER = tune(
  'r:1 D5:1 F#5:1 B5:2 | D5:3 B4:2 | D5:3 G5:2 | E5:1 C#5:1 A5:1 G5:1 E5:1' +
    ' | r:1 D5:1 F#5:1 B5:2 | F#5:3 D5:2 | E5:3 G5:2 | C#5:1 E5:1 F#5:1 A5:2' +
    ' | G5:2 F#5:1 D5:2 | E5:3 C#5:2 | F#5:2 E5:1 D5:2 | E5:1.5 D5:.5 E5:1 G5:2' +
    ' | D5:3 B4:2 | B4:2 E5:3 | G5:3 F#5:2 | F#5:1 E5:1 D5:1 C#5:1 B4:1',
);
/** The fiddle's own tune, high over the horns' long notes. */
const FIDDLE_TUNE = tune(
  'B5:3 A5:1 G5:1 | F#5:3 E5:1 D5:1 | E5:2 C#5:1 A4:2 | B4:3 E5:2' +
    ' | D5:1 G5:2 A5:1 B5:1 | A5:3 F#5:2 | G5:3 E5:1 C5:1 | C#5:2 E5:1 F#5:2',
);
const HORN_UNDER = tune(
  'G3:3 B3:2 | A3:3 D4:2 | C#4:3 E4:2 | E4:3 B3:2 | B3:3 D4:2 | D4:3 A3:2 | C4:3 G3:2 | A3:3 C#4:2',
);
const BREAK_CALL = tune('B3:1 F#4:2 E4:1 D4:1 | r:5 | B3:1 F#4:2 A4:1 B4:1 | F#4:5');

/** The low strings' accents over the bar's ten eighths, grouped three, three, two and two. */
const OSTINATO_VELOCITY = [100, 62, 70, 92, 62, 70, 90, 66, 86, 64] as const;
/** The wood's ticks: on the groups' first eighths, softer between. */
const TICKS = [0, 1, 1.5, 2.5, 3, 4] as const;

function drums(w: Write, bar: number, drive: number, fill: boolean): void {
  const hit = (drum: Drum, beat: number, velocity: number) => w.hit(drum, bar, beat, velocity);
  hit('taiko', 0, 116);
  hit('taiko', 3, 100);
  hit('kick', 0, 104);
  for (const [beat, velocity] of [
    [0.5, 50],
    [1, 64],
    [1.5, 70],
    [2, 52],
    [3.5, 58],
    [4.5, 66],
  ] as const)
    hit('frame', beat, velocity);
  if (drive >= 2) {
    hit('snare', 2, 92);
    hit('snare', 4, 98);
    hit('kick', 3, 96);
    hit('lowTom', 1.5, 74);
  }
  if (drive >= 3) {
    hit('taiko', 1.5, 84);
    hit('taiko', 4.5, 90);
    hit('snare', 4.75, 56);
  }
  if (fill)
    roll(
      (beat, velocity) => hit(beat < 4 ? 'highTom' : beat < 4.5 ? 'midTom' : 'lowTom', beat, velocity),
      3,
      2,
      70,
      108,
    );
}

/** The bars under the tunes: the bed, the shiver, the gusts, the ticks and the slow heart, the low strings, the
 *  drums and timpani, and the peak's choir and swells. */
function underneath(w: Write): void {
  const bars = PLAN.map(({ section, inBar }) => HARMONY[section][inBar] ?? []);
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    w.note('bass', bar, beat, beats, tones.bass, 90);
    for (const n of tones.air) w.note('air', bar, beat, beats, n, 52);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 66);
    // Two octaves under their voicing: held high, these strings were a whine.
    for (const n of tones.shiver) w.note('shiver', bar, beat, beats, n - 24, 64);
  }
  PLAN.forEach(({ section, inBar, pass }, bar) => {
    const held = bars[bar] ?? [];
    const drive = section === 'vamp' || (section === 'break' && inBar < 2) ? 1 : pass > 0 ? 3 : 2;
    for (const { chord: name, beat } of held) w.note('timpani', bar, beat, 0.9, CHORDS[name].timp, beat ? 88 : 102);
    if (inBar % 4 === 2) w.hit('gust', bar, 1, 70);
    for (const beat of TICKS)
      w.note('tick', bar, beat, 0.2, CHORDS[chordAt(held, beat)].air[0] ?? 0, beat % 1 ? 76 : 100);
    w.hit('heart', bar, 0, 94);
    w.hit('heart', bar, 3, 76);
    for (let i = 0; i < 10; i++)
      w.note(
        'ostinato',
        bar,
        i * 0.5,
        0.44,
        CHORDS[chordAt(held, i * 0.5)].ostinato[i] ?? 0,
        OSTINATO_VELOCITY[i] ?? 64,
      );
    drums(w, bar, drive, inBar % 4 === 3);
    if (inBar === 0) w.hit('crash', bar, 0, 100);
    if (inBar % 8 === 4) w.hit('china', bar, 0, 80);
    if (inBar % 4 === 3)
      roll(
        (beat, velocity) => w.note('timpani', bar, beat, 0.22, CHORDS[chordAt(held, 3)].timp, velocity),
        3,
        2,
        46,
        96,
      );
    if ((PLAN[bar + 1]?.inBar ?? 0) === 0) w.hit('riser', bar + 1, -(1.6 * BPM) / 60, 84);
  });
}

/** The tunes: the horn's under the fiddle's counter-line, the brass with the horn at the peak; the fiddle's over the
 *  horns, the brass with them; the break's call. */
function tunes(w: Write): void {
  PLAN.forEach(({ section, inBar, pass }, bar) => {
    if (inBar !== 0) return;
    if (section === 'a') {
      lay(w, 'horn', bar, THEME, 100 + pass * 4, { legato: 0.95, to: pass ? 8 : 16 });
      lay(w, 'fiddle', bar, COUNTER, 82, { legato: 0.95, accent: 4, to: pass ? 8 : 16 });
      lay(w, 'brass', bar, THEME, 84, { legato: 0.95, accent: 4, to: pass ? 8 : 16 });
    } else if (section === 'b') {
      lay(w, 'fiddle', bar, FIDDLE_TUNE, 98, { legato: 0.95 });
      lay(w, 'horn', bar, HORN_UNDER, 84, { legato: 0.97, accent: 4 });
      lay(w, 'brass', bar, HORN_UNDER, 76, { legato: 0.97, accent: 4 });
    } else if (section === 'break') lay(w, 'horn', bar, BREAK_CALL, 98, { legato: 0.95 });
  });
}

const SONG = { tracks: TRACKS, kit: KIT, beatsPerBar: BEATS, bpm: BPM, press: PRESS } as const;

const fight = (): Song =>
  makeSong({ ...SONG, name: 'cold-fight', bars: PLAN.length, level: LEVEL }, (w) => {
    underneath(w);
    tunes(w);
  });

/** A sting's bed: each chord on the bass, the air and the choir, `loud` its velocity's share. */
function stingBed(w: Write, bars: readonly Held<Chord>[][], loud: number): void {
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    w.note('bass', bar, beat, beats, tones.bass, 90 * loud);
    for (const n of tones.air) w.note('air', bar, beat, beats, n, 60 * loud);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 58 * loud);
  }
}

/** The cadence: the tune's last bars, C to F sharp minor and home to the low B, the fiddle stepping down to it. */
const cadence = (): Song =>
  makeSong({ ...SONG, name: 'cold-cadence', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('C/F#m | Bm | Bm'), 0.9);
    lay(w, 'horn', 0, tune('E4:2 G4:1 F#4:2 | B3:5'), 92, { legato: 0.98 });
    lay(w, 'fiddle', 0, tune('G5:3 F#5:2 | F#5:1 E5:1 D5:1 C#5:1 B4:1 | B4:5'), 76, { legato: 0.98 });
    w.note('timpani', 1, 0, 0.9, 'B2', 86);
    w.hit('heart', 1, 0, 80);
    w.hit('heart', 2, 0, 60);
  });

/** The victory: the horn rising through G and A to B major, its D sharp bright, the taiko and the brass under it. */
const victory = (): Song =>
  makeSong({ ...SONG, name: 'cold-victory', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('G | A | B | B'), 1);
    const rise = tune('D4:1 G4:2 B4:1 A4:1 | C#5:1 A4:2 E4:1 F#4:1 | D#5:3 C#5:1 D#5:1 | B4:5');
    lay(w, 'horn', 0, rise, 106);
    lay(w, 'brass', 0, rise, 92);
    lay(w, 'fiddle', 0, rise, 90, { octave: 1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 2, bar === 1);
    w.note('timpani', 2, 0, 0.9, 'B2', 112);
    w.hit('taiko', 2, 0, 120);
    w.hit('crash', 2, 0, 106);
  });

/** The defeat: the call once more, falling through C to the low B, the gusts and the slowing heart left. */
const defeat = (): Song =>
  makeSong({ ...SONG, name: 'cold-defeat', bars: 5, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Bm | C | Em | Bm | Bm'), 0.7);
    lay(w, 'horn', 0, tune('B3:1 F#4:2 E4:1 D4:1 | E4:3 C4:2 | B3:5'), 82, { legato: 0.98 });
    w.hit('gust', 1, 0, 66);
    for (const [bar, velocity] of [
      [0, 92],
      [1, 78],
      [3, 60],
    ] as const)
      w.hit('heart', bar, 0, velocity);
  });

/** Cold's fight score: the fight, and its cadence, victory and defeat. */
export const coldScore = () => ({ song: fight(), cadence: cadence(), victory: victory(), defeat: defeat() });
