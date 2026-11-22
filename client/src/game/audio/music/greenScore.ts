// Green: the fight on the windswept coast, the highland and the woodland. E Dorian (E minor with a raised sixth, the
// piper's C sharp) in 6/8 at a dotted quarter of 104: a war jig. The fiddle's tune runs over the cellos' gallop with
// the horn's counter-line under it, and a bodhran and a big drum drive it. Danger near is rhythm, not a held chord:
// strings gated in sixteenths over a low heartbeat. The peak sets the choir and the low brass's stabs under the tune,
// and swells noise into each section, as a reverse cymbal does. The plan: a vamp, the tune, the horn's tune under the
// fiddle's descant, a break of drums and horn calls, the tune and the horn's again. The cadence turns the tune's
// hemiola home, the victory ends it in E major, the defeat lets the call fall to the low strings.

import { chordAt, type Held, keys, measured, plan, progression, roll, runsOf } from './craft.ts';
import { type Edge, type Song, type Writer, lay, makeSong, midiNote } from './score.ts';

const TRACKS = {
  bass: { program: 43, volume: 82, pan: 64, role: 'bed', voice: { attack: 0.05, release: 0.35, index: 1.4, sub: 0.3 } },
  strings: {
    program: 48,
    volume: 90,
    pan: 76,
    role: 'bed',
    voice: { attack: 0.3, release: 0.7, index: 1.2, idxDecay: 2, unison: 2, cents: 10, spread: 0.5 },
  },
  gate: {
    program: 48,
    volume: 110,
    pan: 50,
    role: 'tension',
    voice: { attack: 0.006, decay: 0.09, sustain: 0.5, release: 0.07, index: 1.7, idxDecay: 0.25 },
  },
  trem: {
    program: 44,
    volume: 100,
    pan: 96,
    role: 'tension',
    voice: { attack: 0.7, release: 1.2, index: 1 },
  },
  ostinato: {
    program: 42,
    volume: 123,
    pan: 60,
    role: 'pulse',
    voice: { attack: 0.006, decay: 0.12, sustain: 0.45, release: 0.07, index: 2.4, idxDecay: 0.1, unison: 2, cents: 6 },
  },
  timpani: { program: 47, volume: 95, pan: 64, role: 'combat', voice: { decay: 0.8, release: 0.5 } },
  fiddle: {
    program: 40,
    volume: 124,
    pan: 56,
    role: 'lead',
    voice: { attack: 0.02, decay: 0.25, sustain: 0.8, release: 0.18, index: 2.1, idxDecay: 0.7, unison: 2, cents: 5 },
  },
  horn: {
    program: 60,
    volume: 106,
    pan: 42,
    role: 'lead',
    voice: { attack: 0.06, index: 2.3, idxDecay: 0.6, unison: 2, cents: 6, spread: 0.25 },
  },
  choir: {
    program: 52,
    volume: 91,
    pan: 70,
    role: 'peak',
    voice: { mod: 1, index: 1.1, idxDecay: 2, attack: 0.35, release: 0.7, unison: 2, cents: 12, spread: 0.45 },
  },
  lowBrass: {
    program: 57,
    volume: 91,
    pan: 58,
    role: 'peak',
    voice: { attack: 0.03, index: 3.2, idxDecay: 0.4, sub: 0.2 },
  },
} as const;
type Track = keyof typeof TRACKS;

/** The bodhran's low skin and top, a big drum, a rim crack with a skin under it, three toms, and the heartbeat: the
 *  low drum alone is the danger near. */
const KIT = {
  volume: 92,
  role: 'combat',
  roles: { heart: 'tension', riser: 'peak' },
  keys: {
    kick: 36,
    snare: 38,
    bodhran: 41,
    bodhranTop: 45,
    lowTom: 43,
    midTom: 47,
    highTom: 50,
    crash: 49,
    heart: 87,
    riser: 55,
  },
  drums: {
    kick: { hz: 54, decay: 0.34, gain: 1.1, click: 0.45 },
    snare: { hz: 2200, q: 0.8, decay: 0.16, gain: 0.75, body: 200 },
    bodhran: { hz: 76, decay: 0.32, gain: 1.05, drop: 0.8, click: 0.3 },
    bodhranTop: { hz: 150, decay: 0.12, gain: 0.7, click: 0.4 },
    lowTom: { hz: 96, decay: 0.45, click: 0.3 },
    midTom: { hz: 128, decay: 0.38, click: 0.3 },
    highTom: { hz: 164, decay: 0.32, click: 0.3 },
    crash: { decay: 1.8, q: 0.5, gain: 0.7 },
    heart: { hz: 58, decay: 0.5, gain: 1.1, drop: 0.75, click: 0.15 },
    // A swell of noise rising into the bar line, a reverse cymbal: noise, so it never whines as a pitched sweep does.
    riser: { hz: 2600, q: 0.6, attack: 1.6, decay: 0.12, gain: 0.6 },
  },
} as const;
type Drum = keyof typeof KIT.keys;
type Write = Writer<Track, Drum>;

const BPM = 156;
const BEATS = 3;
/** A 6/8 bar holds two chords a dotted quarter each, or three a quarter each across it (the hemiola). */
const SPLITS = { 2: [0, 1.5], 3: [0, 1, 2] };
const PRESS = { threshold: -20, knee: 12, ratio: 3, attack: 0.012, release: 0.25, out: 2.35, ceiling: -3 } as const;
const LEVEL = 1.4;
/** A sting plays once: nothing wraps round, and a held note stops at its end. */
const ONCE: Edge = { wrap: false, clip: true, hold: true, restrike: true };

/** Each chord's bass, the cellos' root, the timpani, the strings, the gate's pair, the choir, the low brass, the
 *  fiddle's arpeggio over the horn's tune and the high tremolo's pair. */
const chord = (
  bass: string,
  ost: string,
  timp: string,
  pad: string,
  gate: string,
  choir: string,
  brass: string,
  arp: string,
  trem: string,
) => ({
  bass,
  ost: midiNote(ost),
  timp,
  pad: keys(pad),
  gate: keys(gate),
  choir: keys(choir),
  brass: keys(brass),
  arp: keys(arp),
  trem: keys(trem),
});
const CHORDS = {
  Em: chord('E2', 'E3', 'E2', 'E4 G4 B4', 'B3 E4', 'G4 E5', 'E2 B2', 'E5 G5 B5', 'B5 E6'),
  D: chord('D2', 'D3', 'D2', 'D4 F#4 A4', 'A3 D4', 'F#4 D5', 'D2 A2', 'D5 F#5 A5', 'A5 D6'),
  C: chord('C2', 'C3', 'C2', 'E4 G4 C5', 'G3 C4', 'E4 C5', 'C2 G2', 'C5 E5 G5', 'G5 E6'),
  G: chord('G2', 'G2', 'G2', 'D4 G4 B4', 'B3 D4', 'G4 D5', 'G2 D3', 'D5 G5 B5', 'B5 D6'),
  A: chord('A2', 'A2', 'A2', 'E4 A4 C#5', 'A3 E4', 'E4 C#5', 'A2 E3', 'C#5 E5 A5', 'A5 E6'),
  Am: chord('A2', 'A2', 'A2', 'E4 A4 C5', 'A3 E4', 'E4 C5', 'A2 E3', 'C5 E5 A5', 'A5 E6'),
  Bm: chord('B1', 'B2', 'B2', 'D4 F#4 B4', 'B3 F#4', 'F#4 D5', 'B1 F#2', 'D5 F#5 B5', 'B5 F#6'),
  E: chord('E2', 'E3', 'E2', 'E4 G#4 B4', 'B3 E4', 'G#4 E5', 'E2 B2', 'E5 G#5 B5', 'B5 E6'),
};
type Chord = keyof typeof CHORDS;
const harmony = (text: string): Held<Chord>[][] => progression(text, CHORDS, BEATS, SPLITS);
const tune = (text: string) => measured(text, BEATS);

type Section = 'vamp' | 'a' | 'b' | 'break';
const HARMONY: Readonly<Record<Section, Held<Chord>[][]>> = {
  vamp: harmony('Em | Em | C | D | Em | Em | C | D'),
  a: harmony('Em | Em | G | D/Em | Em | Em | C/D | A | C | D | Em | A | C | D | C/D/Em | Em'),
  b: harmony('C | G | D | Em | C/D | G | A | Bm | C/G | Am/Em | Am/D | Em | C | G | A | Bm'),
  break: harmony('Em | Em | C/D | Em | Em | Em | C | D'),
};
const PLAN = plan<Section>([
  ['vamp', 8],
  ['a', 16],
  ['b', 16],
  ['break', 8],
  ['a', 16],
  ['b', 16],
]);

/** The tune: a call (E, E, B, A), its rise to the high E, and the gale, falling in a hemiola to its close. */
const THEME = tune(
  'E4:1 E4:.5 B4:1 A4:.5 | G4:.5 A4:.5 B4:.5 E5:1.5 | D5:1 B4:.5 A4:1 G4:.5 | F#4:1 D4:.5 E4:1.5' +
    ' | E4:1 E4:.5 B4:1 A4:.5 | G4:.5 A4:.5 B4:.5 E5:1 F#5:.5 | G5:1 F#5:.5 E5:1 D5:.5 | C#5:1 B4:.5 A4:1.5' +
    ' | G5:1.5 E5:1.5 | F#5:1 E5:.5 D5:1.5 | E5:1 D5:.5 B4:1 G4:.5 | A4:1 B4:.5 C#5:1 D5:.5' +
    ' | E5:1.5 G5:1.5 | A5:1 G5:.5 F#5:1.5 | G5:1 F#5:1 E5:1 | E5:3',
);
/** The horn under it, moving where the tune holds and holding where it moves. */
const COUNTER = tune(
  'B3:3 | G3:1.5 A3:.5 B3:.5 D4:.5 | D4:1.5 B3:1.5 | A3:1.5 B3:.5 A3:.5 G3:.5' +
    ' | B3:3 | G3:1.5 B3:.5 C#4:.5 D4:.5 | E4:1.5 F#4:1.5 | E4:1.5 C#4:1.5' +
    ' | E4:1 D4:.5 C4:1.5 | A3:1.5 D4:1.5 | B3:1.5 G3:1.5 | A3:1 C#4:.5 E4:1.5' +
    ' | G4:1.5 E4:1.5 | F#4:1.5 A4:.5 G4:.5 F#4:.5 | E4:1 D4:1 B3:1 | G3:.5 A3:.5 B3:.5 E4:1.5',
);
/** The horn's own tune, broad over the gallop, its last phrase lifting to the Dorian C sharp. */
const HORN_TUNE = tune(
  'G4:1.5 E4:1.5 | D4:1.5 G4:1.5 | F#4:2 E4:.5 D4:.5 | E4:3' +
    ' | G4:1.5 A4:1.5 | B4:1.5 D5:1.5 | C#5:2 B4:.5 A4:.5 | B4:3' +
    ' | E5:1.5 D5:1.5 | C5:1.5 B4:1.5 | A4:1 B4:.5 C5:1 D5:.5 | B4:3' +
    ' | C5:1.5 E5:1.5 | D5:1 C5:.5 B4:1.5 | A4:1 B4:1 C#5:1 | B4:3',
);
/** The break's horn call and the fiddle's answer. */
const CALL = tune('E4:1 E4:.5 B4:1 A4:.5 | G4:3 | r:3 | r:3 | E4:1 E4:.5 B4:1 A4:.5 | B4:1.5 D5:1.5 | E5:3 | r:3');
const ANSWER = tune('r:3 | r:3 | B4:.5 A4:.5 G4:.5 F#4:1 E4:.5 | E4:3 | r:3 | r:3 | r:3 | r:1.5 B3:.5 C#4:.5 D4:.5');

/** The gate: strings struck in sixteenths across the bar, the dotted beats loudest. */
const GATE = [
  [0, 1],
  [0.5, 0.62],
  [0.75, 0.8],
  [1.25, 0.62],
  [1.5, 0.95],
  [2, 0.62],
  [2.25, 0.8],
  [2.75, 0.66],
] as const;
/** The cellos' gallop in eighths: the root, its fifth and its octave. */
const GALLOP = [
  [0, 0, 96],
  [0.5, 0, 58],
  [1, 7, 72],
  [1.5, 0, 90],
  [2, 12, 66],
  [2.5, 7, 70],
] as const;
/** The fiddle's descant over the horn's tune: an arpeggio's tones in eighths, from the top. */
const DESCANT = [2, 1, 0, 1, 2, 1] as const;

function drums(w: Write, bar: number, drive: number, fill: boolean): void {
  const hit = (drum: Drum, beat: number, velocity: number) => w.hit(drum, bar, beat, velocity);
  hit('kick', 0, 112);
  hit('bodhran', 0, 100);
  hit('bodhran', 1.5, 90);
  for (const [beat, velocity] of [
    [0.5, 60],
    [1, 74],
    [2, 62],
    [2.5, 76],
  ] as const)
    hit('bodhranTop', beat, velocity);
  if (drive >= 2) {
    hit('kick', 2.5, 84);
    hit('snare', 1.5, 94);
    hit('bodhranTop', 2.75, 50);
  }
  if (drive >= 3) {
    hit('kick', 1, 88);
    hit('snare', 2.75, 52);
  }
  if (fill)
    (['highTom', 'highTom', 'midTom', 'midTom', 'lowTom', 'lowTom'] as const).forEach((tom, i) =>
      hit(tom, 1.5 + i * 0.25, 82 + i * 5),
    );
}

/** The bars every layer plays under the tunes: the bed, the gate and the heartbeat, the gallop, the drums and
 *  timpani, and the peak's choir, stabs and swells. */
function underneath(w: Write): void {
  const bars = PLAN.map(({ section, inBar }) => HARMONY[section][inBar] ?? []);
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    const loud = PLAN[bar]?.section === 'break' ? 1.15 : 1;
    w.note('bass', bar, beat, beats, tones.bass, 88);
    for (const n of tones.pad) w.note('strings', bar, beat, beats, n, 56 * loud);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 66);
  }
  PLAN.forEach(({ section, inBar, pass }, bar) => {
    const held = HARMONY[section][inBar] ?? [];
    const drive = section === 'vamp' ? 1 : section === 'break' ? (inBar < 4 ? 1 : 2) : pass > 0 ? 3 : 2;
    for (const { chord: name, beat } of held) w.note('timpani', bar, beat, 0.9, CHORDS[name].timp, beat ? 86 : 100);
    for (const [beat, weight] of GATE)
      for (const n of CHORDS[chordAt(held, beat)].gate) w.note('gate', bar, beat, 0.2, n, 84 * weight);
    w.hit('heart', bar, 0, 96);
    w.hit('heart', bar, 0.5, 70);
    for (const [beat, lift, velocity] of GALLOP)
      w.note('ostinato', bar, beat, 0.42, CHORDS[chordAt(held, beat)].ost + lift, velocity);
    drums(w, bar, drive, inBar % 4 === 3);
    // Two octaves under their voicing: held high, these strings were a whine.
    if (inBar % 8 >= 6) for (const n of CHORDS[chordAt(held, 0)].trem) w.note('trem', bar, 0, 3, n - 24, 58);
    if (inBar % 8 === 7) {
      roll(
        (beat, velocity) => w.note('timpani', bar, beat, 0.22, CHORDS[chordAt(held, 1.5)].timp, velocity),
        1.5,
        1.5,
        50,
        96,
      );
      if ((PLAN[bar + 1]?.inBar ?? 0) === 0) w.hit('riser', bar + 1, -(1.6 * BPM) / 60, 84);
    }
    if (inBar === 0) w.hit('crash', bar, 0, 100);
    if (inBar % 2 === 0 && section !== 'vamp') {
      const first = CHORDS[chordAt(held, 0)].brass;
      for (const n of first) w.note('lowBrass', bar, 0, inBar === 0 ? 2.8 : 1.3, n, inBar === 0 ? 108 : 94);
    }
  });
}

/** The fiddle's descant over a bar of the horn's tune. */
function descant(w: Write, bar: number, held: readonly Held<Chord>[]): void {
  DESCANT.forEach((index, i) =>
    w.note('fiddle', bar, i * 0.5, 0.42, CHORDS[chordAt(held, i * 0.5)].arp[index] ?? 0, 72),
  );
}

/** The tunes over it: the fiddle's with the horn's counter-line and, at the peak, the whistle an octave over; the
 *  horn's under the fiddle's descant, the second time the fiddle an octave over the horn for its last eight. */
function tunes(w: Write): void {
  PLAN.forEach(({ section, inBar, pass }, bar) => {
    if (inBar !== 0) return;
    if (section === 'a') {
      lay(w, 'fiddle', bar, THEME, 98 + pass * 4, { legato: 0.9 });
      lay(w, 'horn', bar, COUNTER, 80, { legato: 0.96, accent: 4 });
    } else if (section === 'b') {
      lay(w, 'horn', bar, HORN_TUNE, 96 + pass * 4, { legato: 0.97 });
      HARMONY.b.forEach((held, inB) => {
        if (pass === 0 || inB < 8) descant(w, bar + inB, held);
      });
      if (pass > 0) {
        lay(w, 'fiddle', bar + 8, HORN_TUNE, 94, { octave: 1, legato: 0.95, from: 8 });
      }
    } else if (section === 'break') {
      lay(w, 'horn', bar, CALL, 96);
      lay(w, 'fiddle', bar, ANSWER, 90);
    }
  });
}

const SONG = { tracks: TRACKS, kit: KIT, beatsPerBar: BEATS, bpm: BPM, press: PRESS } as const;

/** The fight: every layer, each in its role. */
const fight = (): Song =>
  makeSong({ ...SONG, name: 'green-fight', bars: PLAN.length, level: LEVEL }, (w) => {
    underneath(w);
    tunes(w);
  });

/** A sting's bed: each chord on the bass, the strings and the choir, `loud` its velocity's share. */
function stingBed(w: Write, bars: readonly Held<Chord>[][], loud: number, bassBars = bars.length): void {
  for (const { chord: name, bar, beat, beats } of runsOf(bars, BEATS)) {
    const tones = CHORDS[name];
    if (bar < bassBars) w.note('bass', bar, beat, Math.min(beats, (bassBars - bar) * BEATS), tones.bass, 88 * loud);
    for (const n of tones.pad) w.note('strings', bar, beat, beats, n, 64 * loud);
    for (const n of tones.choir) w.note('choir', bar, beat, beats, n, 60 * loud);
  }
}

/** The cadence, the fight over with no foe felled: the gale's hemiola over its rising bass, home to E minor. */
const cadence = (): Song =>
  makeSong({ ...SONG, name: 'green-cadence', bars: 3, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('C/D/Em | Em | Em'), 0.9);
    lay(w, 'fiddle', 0, tune('G5:1 F#5:1 E5:1'), 90, { legato: 0.98 });
    w.note('fiddle', 1, 0, 6, 'E5', 84);
    lay(w, 'horn', 0, tune('E4:1 D4:1 B3:1 | B3:3 | G3:3'), 80, { legato: 0.98 });
    w.note('timpani', 1, 0, 0.9, 'E2', 84);
    w.hit('heart', 1, 0, 80);
    w.hit('heart', 2, 0, 60);
  });

/** The victory: the call on the horn and the fiddle together, a step up to E major, the drums and a crash on it. */
const victory = (): Song =>
  makeSong({ ...SONG, name: 'green-victory', bars: 4, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Em | C/D | E | E'), 1);
    const call = tune('E4:1 E4:.5 B4:1 A4:.5 | B4:1.5 A4:1.5 | G#4:3 | G#4:3');
    lay(w, 'horn', 0, call, 104);
    lay(w, 'fiddle', 0, call, 102, { octave: 1 });
    for (let bar = 0; bar < 2; bar++) drums(w, bar, 2, bar === 1);
    roll((beat, velocity) => w.note('timpani', 1, beat, 0.22, 'B2', velocity), 1.5, 1.5, 60, 104);
    w.note('timpani', 2, 0, 0.9, 'E2', 112);
    for (const n of keys('E2 B2')) w.note('lowBrass', 2, 0, 5.5, n, 108);
    w.hit('kick', 2, 0, 116);
    w.hit('crash', 2, 0, 108);
  });

/** The defeat: the call once more on the horn, softly, falling a step a bar to the low strings, the heart slowing. */
const defeat = (): Song =>
  makeSong({ ...SONG, name: 'green-defeat', bars: 6, level: LEVEL, edge: ONCE }, (w) => {
    stingBed(w, harmony('Em | C | Am | Em | Em | Em'), 0.7, 3);
    lay(w, 'horn', 0, tune('E4:1 E4:.5 B4:1 A4:.5 | G4:3 | E4:1.5 C4:1.5 | B3:3'), 78, { legato: 0.98 });
    lay(w, 'bass', 3, tune('E3:1.5 D3:1.5 | C3:1.5 B2:1.5 | E2:3'), 70, { legato: 0.98 });
    for (const [bar, velocity] of [
      [0, 92],
      [1, 80],
      [3, 66],
      [5, 50],
    ] as const)
      w.hit('heart', bar, 0, velocity);
  });

/** Green's fight score: the fight, and its cadence, victory and defeat. */
export const greenScore = () => ({ song: fight(), cadence: cadence(), victory: victory(), defeat: defeat() });
