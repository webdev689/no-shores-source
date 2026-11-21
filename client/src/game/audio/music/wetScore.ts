// Wet: the fight in the rainforest and the swamp. F sharp Aeolian in 4/4 at 104, its beat split three, three, three,
// three and four: everything leans across the bar. A low clarinet's tune over a marimba's ostinato in that grouping, a
// second clarinet's counter-line under it, congas, log drums and a deep drum. The danger near is drips and a pulse: a
// kalimba falling in dotted eighths against the beat, a log drum's heartbeat, insects in the shaker and a bassoon
// creeping a half step. The peak sets the strings an octave over the tune, the choir's oohs, the horns swelling on each
// chord, and noise swelling into each section, as a reverse cymbal does. The plan: a vamp, the tune, the second
// clarinet's tune under the first's long notes, a break, the tune again. The cadence turns G, C sharp, F sharp minor;
// the victory rises D, E into F sharp major; the defeat lets the clarinet sink to the low F sharp.

import { chordAt, type Held, keys, measured, plan, progression, runsOf } from './craft.ts';
import { type Edge, type Song, type Writer, lay, makeSong } from './score.ts';

const TRACKS = {
  bass: {
    program: 35,
    volume: 68,
    pan: 64,
    role: 'bed',
    voice: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.25, index: 1.2, sub: 0.25 },
  },
  pad: {
    program: 89,
    volume: 92,
    pan: 70,
    role: 'bed',
    voice: { attack: 0.5, release: 0.8, index: 0.9, unison: 2, cents: 12, spread: 0.5 },
  },
  drip: {
    program: 108,
    volume: 108,
    pan: 90,
    role: 'tension',
    voice: { index: 1.8, idxDecay: 0.06, decay: 0.5, sustain: 0.02, release: 0.3 },
  },
  croak: {
    program: 70,
    volume: 113,
    pan: 40,
    role: 'tension',
    voice: { attack: 0.02, decay: 0.12, sustain: 0.5, release: 0.08, index: 2.6, idxDecay: 0.2 },
  },
  marimba: {
    program: 12,
    volume: 112,
    pan: 36,
    role: 'pulse',
    voice: { mod: 4, index: 1.4, idxDecay: 0.04, decay: 0.32, sustain: 0.02, release: 0.18, gain: 0.8 },
  },
  reed: {
    program: 71,
    volume: 118,
    pan: 58,
    role: 'lead',
    voice: { attack: 0.04, index: 1.7, idxDecay: 0.6, unison: 2, cents: 5, spread: 0.12 },
  },
  clarinet: { program: 71, volume: 119, pan: 76, role: 'lead', voice: { attack: 0.04, index: 1.9, idxDecay: 0.6 } },
  strings: {
    program: 48,
    volume: 125,
    pan: 84,
    role: 'peak',
    voice: { attack: 0.12, release: 0.5, index: 1.2, idxDecay: 1.2, unison: 2, cents: 9, spread: 0.4 },
  },
  choir: {
    program: 53,
    volume: 92,
    pan: 66,
    role: 'peak',
    voice: { mod: 1, index: 0.9, idxDecay: 2, attack: 0.4, release: 0.7, unison: 2, cents: 12, spread: 0.45 },
  },
  horn: {
    program: 60,
    volume: 81,
    pan: 44,
    role: 'peak',
    voice: { attack: 0.35, decay: 0.3, sustain: 0.9, release: 0.5, index: 2.2, idxDecay: 0.8 },
  },
} as const;
type Track = keyof typeof TRACKS;

/** A deep drum, three congas (open, muted and low), two log drums, a shaker and a crash; the danger near is a log
 *  drum's heartbeat and the insects in a second shaker. */
const KIT = {
  volume: 109,
  role: 'combat',
  roles: { heart: 'tension', insects: 'tension', riser: 'peak' },
  keys: {
    kick: 36,
    deep: 86,
    conga: 63,
    muted: 62,
    low: 64,
    logHigh: 48,
    logLow: 45,
    shaker: 70,
    crash: 49,
    heart: 41,
    insects: 82,
    riser: 55,
  },
  drums: {
    kick: { hz: 52, decay: 0.3, gain: 1, click: 0.35 },
    deep: { hz: 60, decay: 0.62, gain: 1.15, drop: 0.7, click: 0.3 },
    conga: { hz: 290, decay: 0.2, gain: 0.75, drop: 0.85, click: 0.35 },
    muted: { hz: 350, decay: 0.07, gain: 0.6, drop: 0.9, click: 0.4 },
    low: { hz: 205, decay: 0.24, gain: 0.8, drop: 0.85, click: 0.3 },
    logHigh: { hz: 230, decay: 0.16, gain: 0.7, drop: 0.95, click: 0.3 },
    logLow: { hz: 152, decay: 0.2, gain: 0.75, drop: 0.95, click: 0.3 },
    shaker: { hz: 6800, q: 1.5, decay: 0.05, gain: 0.26 },
    crash: { decay: 1.6, q: 0.55, gain: 0.55 },
    heart: { hz: 92, decay: 0.3, gain: 1, drop: 0.85, click: 0.2 },
    insects: { hz: 7400, q: 2, decay: 0.04, gain: 0.2 },
    // A swell of noise rising into the bar line, a reverse cymbal: noise, so it never whines as a pitched sweep does.
    riser: { hz: 2600, q: 0.6, attack: 1.6, decay: 0.12, gain: 0.6 },
  },
} as const;
type Drum = keyof typeof KIT.keys;
type Write = Writer<Track, Drum>;

const BPM = 104;
const BEATS = 4;
const PRESS = { threshold: -20, knee: 12, ratio: 3, attack: 0.012, release: 0.25, out: 2.35, ceiling: -3 } as const;
const LEVEL = 1.4;
const ONCE: Edge = { wrap: false, clip: true, hold: true, restrike: true };
/** The bar's sixteenths grouped three, three, three, three and four: where each group begins, in beats. */
const GROUPS = [0, 0.75, 1.5, 2.25, 3] as const;

/** Each chord's bass, pad, choir, the horns' pair, the kalimba's three notes and the marimba's four. */
const chord = (bass: string, pad: string, choir: string, horn: string, drip: string, marimba: string) => ({
  bass,
  pad: keys(pad),
  choir: keys(choir),
  horn: keys(horn),
  drip: keys(drip),
  marimba: keys(marimba),
});
const CHORDS = {
  'F#m': chord('F#2', 'A3 C#4 F#4', 'C#4 A4', 'F#3 C#4', 'F#5 C#6 A5', 'F#3 C#4 F#4 A4'),
  'D': chord('D2', 'A3 D4 F#4', 'D4 A4', 'D3 A3', 'F#5 D6 A5', 'D3 A3 D4 F#4'),
  'E': chord('E2', 'G#3 B3 E4', 'B3 G#4', 'E3 B3', 'G#5 E6 B5', 'E3 B3 E4 G#4'),
  'Bm': chord('B1', 'B3 D4 F#4', 'D4 B4', 'B2 F#3', 'F#5 D6 B5', 'B2 F#3 B3 D4'),
  'C#m': chord('C#2', 'G#3 C#4 E4', 'C#4 G#4', 'C#3 G#3', 'G#5 E6 C#6', 'C#3 G#3 C#4 E4'),
  'G': chord('G1', 'G3 B3 D4', 'B3 G4', 'G2 D3', 'G5 D6 B5', 'G2 D3 G3 B3'),
  'C#': chord('C#2', 'G#3 C#4 F4', 'C#4 G#4', 'C#3 G#3', 'G#5 F5 C#6', 'C#3 G#3 C#4 F4'),
  'F#': chord('F#2', 'A#3 C#4 F#4', 'C#4 A#4', 'F#3 C#4', 'F#5 C#6 A#5', 'F#3 C#4 F#4 A#4'),
};
type Chord = keyof typeof CHORDS;
const harmony = (text: string): Held<Chord>[][] => progression(text, CHORDS, BEATS, { 2: [0, 2] });
const tune = (text: string) => measured(text, BEATS);

type Section = 'vamp' | 'a' | 'b' | 'break';
const HARMONY: Readonly<Record<Section, Held<Chord>[][]>> = {
  vamp: harmony('F#m | F#m | G | C#'),
  a: harmony('F#m | F#m | D | E | F#m | D | Bm | C# | D | E | C#m | F#m | D | Bm | G | C#'),
  b: harmony('D | E | C#m | F#m | D | E | Bm/C#m | C#'),
  break: harmony('F#m | G | F#m | C#'),
};
const PLAN = plan<Section>([
  ['vamp', 4],
  ['a', 16],
  ['b', 8],
  ['break', 4],
  ['a', 16],
]);

/** The tune: a fifth up from F sharp and a step back, in dotted eighths across the beat, the same shape on D, its
 *  second half climbing to the high A and falling through the G of the flat second to the dominant. */
const THEME = tune(
  'F#4:.75 C#5:.75 B4:.5 C#5:2 | r:.5 E5:.5 D5:.5 C#5:.5 B4:1 A4:1 | D4:.75 A4:.75 G#4:.5 A4:2 | r:.5 B4:.5 C#5:.5 B4:.5 G#4:1 E4:1' +
    ' | F#4:.75 C#5:.75 B4:.5 C#5:1 E5:1 | F#5:1.5 E5:.5 D5:1 C#5:1 | D5:.75 C#5:.75 B4:.5 F#4:2 | G#4:1.5 F4:.5 G#4:2' +
    ' | A5:.75 F#5:.75 E5:.5 F#5:2 | r:.5 G#5:.5 F#5:.5 E5:.5 D5:1 B4:1 | C#5:.75 E5:.75 G#5:.5 E5:2 | F#5:1.5 E5:.5 C#5:1 A4:1' +
    ' | D5:.75 F#5:.75 E5:.5 D5:1 C#5:1 | B4:.75 D5:.75 C#5:.5 B4:1 A4:1 | G4:.75 B4:.75 A4:.5 G4:1 F#4:1 | F4:1 G#4:1 C#5:2',
);
/** The clarinet low under it, moving where the flute holds. */
const COUNTER = tune(
  'A3:2 C#4:1 B3:1 | A3:4 | F#3:2 A3:1 B3:1 | B3:2 G#3:2' +
    ' | A3:2 F#3:1 A3:1 | A3:1.5 B3:.5 A3:1 F#3:1 | F#3:2 B3:1 D4:1 | F3:2 G#3:2' +
    ' | F#4:2 E4:1 D4:1 | E4:2 B3:2 | E4:2 G#3:1 C#4:1 | C#4:2 A3:1 C#4:1' +
    ' | A3:2 D4:1 E4:1 | D4:2 F#4:1 E4:1 | D4:2 B3:1 D4:1 | C#4:2 F3:1 G#3:1',
);
/** The clarinet's own tune, and the flute's long notes over it. */
const CLARINET_TUNE = tune(
  'F#4:1.5 A4:.5 D5:2 | E5:1.5 D5:.5 B4:2 | C#5:1 E5:1 G#4:2 | A4:1.5 G#4:.5 F#4:2' +
    ' | F#4:1.5 A4:.5 D5:1 F#5:1 | E5:1.5 G#4:.5 B4:2 | D5:1 C#5:1 B4:1 C#5:1 | C#5:2 B4:1 G#4:1',
);
const FLUTE_OVER = tune('A5:4 | G#5:4 | G#5:2 E5:2 | F#5:4 | A5:4 | B5:2 G#5:2 | F#5:2 E5:2 | F5:4');
const BREAK_CALL = tune('F#4:.75 C#5:.75 B4:.5 C#5:2 | r:4 | F#4:.75 C#5:.75 B4:.5 C#5:1 E5:1 | F5:4');

/** The marimba's sixteenths: which of the chord's four notes each strikes, the groups' first loudest. */
const MARIMBA = [0, 2, 1, 3, 1, 2, 0, 2, 3, 1, 3, 2, 0, 1, 2, 3] as const;

function drums(w: Write, bar: number, drive: number, fill: boolean): void {
  const hit = (drum: Drum, beat: number, velocity: number) => w.hit(drum, bar, beat, velocity);
  hit('deep', 0, 112);
  hit('deep', 2.5, 92);
  hit('logHigh', 0.75, 82);
  hit('logLow', 1.5, 86);
  hit('logHigh', 2.25, 78);
  hit('logLow', 3, 84);
  if (drive >= 2) {
    hit('deep', 1.75, 76);
    hit('conga', 1, 86);
    hit('conga', 3.75, 72);
    hit('low', 2, 84);
    hit('low', 3.5, 70);
    for (const beat of [0.5, 1.25, 2.75, 3.25]) hit('muted', beat, 58);
    for (let i = 0; i < 16; i++) hit('shaker', i * 0.25, (GROUPS as readonly number[]).includes(i * 0.25) ? 58 : 38);
  }
  if (drive >= 3) {
    hit('kick', 0, 104);
    hit('kick', 2, 90);
    hit('deep', 3.5, 84);
  }
  if (fill)
    (['logHigh', 'logHigh', 'logLow', 'logLow', 'low', 'low', 'deep', 'deep'] as const).forEach((drum, i) =>
      hit(drum, 2 + i * 0.25, 76 + i * 4),
    );
}

/** The bars under the tunes: the bed, the drips, the heartbeat, the insects and the croak, the marimba, the drums,
 *  and the peak's choir, horns and swells. */
function underneath(w: Write): void {
  const bars = PLAN.map(({ section, inBar }) => HARMONY[section][inBar] ?? []);
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    w.note('bass', bar, beat, beats, tones.bass, 92);
    for (const n of tones.pad) w.note('pad', bar, beat, beats, n, 58);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 66);
    for (const n of tones.horn) w.note('horn', bar, beat, Math.min(beats, 4), n, 74);
  }
  PLAN.forEach(({ section, inBar, pass }, bar) => {
    const held = bars[bar] ?? [];
    const drive = section === 'vamp' || section === 'break' ? 1 : pass > 0 ? 3 : 2;
    // Under the tune the drips thin to the end of the bar, where the flute breathes.
    const drips = section === 'a' ? [2.25, 3] : GROUPS;
    drips.forEach((beat, i) => w.note('drip', bar, beat, 0.6, CHORDS[chordAt(held, beat)].drip[i % 3] ?? 0, 80));
    w.hit('heart', bar, 0, 92);
    w.hit('heart', bar, 0.75, 70);
    for (let i = 0; i < 16; i++) w.hit('insects', bar, i * 0.25, i % 4 === 2 ? 46 : 30);
    if (inBar % 2 === 1) {
      const root = CHORDS[chordAt(held, 3)].marimba[0] ?? 42;
      w.note('croak', bar, 3, 0.3, root, 100);
      w.note('croak', bar, 3.5, 0.3, root + 1, 92);
    }
    MARIMBA.forEach((index, i) => {
      const beat = i * 0.25;
      const loud = (GROUPS as readonly number[]).includes(beat) ? 92 : 64;
      w.note('marimba', bar, beat, 0.24, CHORDS[chordAt(held, beat)].marimba[index] ?? 0, loud);
    });
    drums(w, bar, drive, inBar % 4 === 3);
    if (inBar === 0) w.hit('crash', bar, 0, 96);
    if ((PLAN[bar + 1]?.inBar ?? 0) === 0) w.hit('riser', bar + 1, -(1.6 * BPM) / 60, 84);
  });
}

/** The tunes: the flute's over the clarinet's counter-line and, at the peak, the strings an octave over it; the
 *  clarinet's under the flute's long notes; the break's call. */
function tunes(w: Write): void {
  PLAN.forEach(({ section, inBar, pass }, bar) => {
    if (inBar !== 0) return;
    if (section === 'a') {
      lay(w, 'reed', bar, THEME, 100 + pass * 4, { octave: -1, legato: 0.94 });
      lay(w, 'clarinet', bar, COUNTER, 80, { legato: 0.96, accent: 4 });
      lay(w, 'strings', pass ? bar : bar + 8, THEME, 70, { legato: 0.96, accent: 4, from: pass ? 0 : 8 });
    } else if (section === 'b') {
      lay(w, 'clarinet', bar, CLARINET_TUNE, 98, { legato: 0.95 });
      lay(w, 'reed', bar, FLUTE_OVER, 82, { octave: -1, legato: 0.97, accent: 4 });
      lay(w, 'strings', bar, CLARINET_TUNE, 66, { legato: 0.96, accent: 4 });
    } else if (section === 'break') lay(w, 'reed', bar, BREAK_CALL, 96, { octave: -1, legato: 0.94 });
  });
}

const SONG = { tracks: TRACKS, kit: KIT, beatsPerBar: BEATS, bpm: BPM, press: PRESS } as const;

const fight = (): Song =>
  makeSong({ ...SONG, name: 'wet-fight', bars: PLAN.length, level: LEVEL }, (w) => {
    underneath(w);
    tunes(w);
  });

/** A sting's bed: each chord on the bass, the pad and the choir, `loud` its velocity's share. */
function stingBed(w: Write, bars: readonly Held<Chord>[][], loud: number): void {
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    w.note('bass', bar, beat, beats, tones.bass, 90 * loud);
    for (const n of tones.pad) w.note('pad', bar, beat, beats, n, 62 * loud);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 60 * loud);
  }
}

/** The cadence: the tune's last two bars over G and C sharp, home to F sharp minor. */
const cadence = (): Song =>
  makeSong({ ...SONG, name: 'wet-cadence', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('G | C# | F#m'), 0.9);
    lay(w, 'reed', 0, tune('G4:.75 B4:.75 A4:.5 G4:1 F#4:1 | F4:1 G#4:1 C#5:2 | F#4:4'), 92, {
      octave: -1,
      legato: 0.97,
    });
    lay(w, 'clarinet', 0, tune('D4:2 B3:1 D4:1 | C#4:2 F3:1 G#3:1 | A3:4'), 74, { legato: 0.98 });
    w.hit('deep', 2, 0, 84);
    w.hit('heart', 2, 0.75, 60);
  });

/** The victory: the tune's opening on D and on E, then F sharp major, its A sharp bright, the drums under it. */
const victory = (): Song =>
  makeSong({ ...SONG, name: 'wet-victory', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('D | E | F# | F#'), 1);
    const rise = tune('D5:.75 F#5:.75 A5:.5 F#5:2 | E5:.75 G#5:.75 B5:.5 G#5:2 | F#5:.75 A#5:.75 C#6:.5 A#5:2 | F#5:4');
    lay(w, 'reed', 0, rise, 104, { octave: -1 });
    lay(w, 'strings', 0, rise, 80, { octave: -1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 2, bar === 1);
    for (const n of keys('F#3 C#4 A#4')) w.note('horn', 2, 0, 7, n, 92);
    w.hit('deep', 2, 0, 116);
    w.hit('kick', 2, 0, 110);
    w.hit('crash', 2, 0, 104);
  });

/** The defeat: the clarinet alone sinking from C sharp to the low F sharp, the croak and the heart under it. */
const defeat = (): Song =>
  makeSong({ ...SONG, name: 'wet-defeat', bars: 5, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('F#m | D | Bm | C# | F#m'), 0.7);
    lay(w, 'clarinet', 0, tune('C#5:1.5 B4:.5 A4:2 | F#4:2 E4:2 | D4:4 | F3:2 G#3:2 | F#3:4'), 86, { legato: 0.98 });
    for (const [bar, velocity] of [
      [0, 88],
      [1, 74],
      [3, 58],
    ] as const)
      w.hit('heart', bar, 0, velocity);
    w.note('croak', 1, 3, 0.3, 'F#2', 64);
    w.note('croak', 1, 3.5, 0.3, 'G2', 58);
  });

/** Wet's fight score: the fight, and its cadence, victory and defeat. */
export const wetScore = () => ({ song: fight(), cadence: cadence(), victory: victory(), defeat: defeat() });
